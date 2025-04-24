import { MODULE } from '../constants.mjs';
import { calculateMaxSpellLevel, fetchSpellDocuments, findSpellcastingClass, formatSpellDetails, getClassSpellList, organizeSpellsByLevel, saveActorPreparedSpells } from '../helpers.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PlayerSpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `player-${MODULE.ID}`,
    tag: 'form',
    form: {
      handler: PlayerSpellBook.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    classes: ['spell-book'],
    position: {
      height: '600',
      width: '600'
    },
    window: {
      icon: 'fa-solid fa-hat-wizard',
      resizable: true,
      minimizable: true
    }
  };

  /** @override */
  static PARTS = {
    form: { template: MODULE.TEMPLATES.SPELL_BOOK_CONTENT },
    footer: { template: MODULE.TEMPLATES.SPELL_BOOK_FOOTER }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /**
   * The actor this spell book is for
   * @type {Actor5e}
   */
  actor = null;

  get title() {
    return game.i18n.format('SPELLBOOK.Application.ActorTitle', { name: this.actor.name });
  }

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {Actor5e} actor - The actor to display spells for
   * @param {object} options - ApplicationV2 options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * @override
   */
  async _prepareContext(options) {
    this.element?.classList.add('loading');

    // Start with basic context
    const context = {
      actor: this.actor,
      spellLevels: [],
      className: '',
      buttons: [
        { type: 'submit', icon: 'fa-solid fa-save', label: 'SETTINGS.Save', cssClass: 'submit-button' },
        { type: 'reset', action: 'reset', icon: 'fa-solid fa-undo', label: 'SETTINGS.Reset', cssClass: 'reset-button' }
      ],
      // Include actor ID for the form handler
      actorId: this.actor.id
    };

    try {
      // Find the class item for this actor
      const classItem = findSpellcastingClass(this.actor);
      if (!classItem) return context;

      // Find the matching spellcasting class
      const className = classItem.name.toLowerCase();
      const classUuid = classItem.uuid;
      context.className = classItem.name;

      // Get the spell list for this class
      const spellUuids = await getClassSpellList(className, classUuid);
      if (!spellUuids || !spellUuids.size) {
        log(1, 'No spells found for class:', className);
        return context;
      }

      // Determine max spell level based on actor's level and spell slot table
      const actorLevel = this.actor.system.details.level;
      const maxSpellLevel = calculateMaxSpellLevel(actorLevel, classItem.system.spellcasting);
      log(3, `Max spell level for level ${actorLevel}: ${maxSpellLevel}`);

      // Get the actual spell items
      log(3, `Starting to fetch ${spellUuids.size} spell items`);
      const spellItems = await fetchSpellDocuments(spellUuids, maxSpellLevel);
      log(3, `Successfully fetched ${spellItems.length} spell items`);

      // Organize spells by level
      const spellLevels = organizeSpellsByLevel(spellItems, this.actor);

      // Process each level to create enriched content
      for (const level of spellLevels) {
        for (const spell of level.spells) {
          // Store the original compendium UUID on the spell
          const uuid = spell.compendiumUuid || spell.uuid;
          log(3, `Using UUID for enrichment: ${uuid}`);

          // Enrich the name with the UUID link
          spell.enrichedName = await TextEditor.enrichHTML(`@UUID[${uuid}]{${spell.name}}`, { async: true });
          spell.formattedDetails = formatSpellDetails(spell);
        }
      }

      context.spellLevels = spellLevels;

      // Calculate prepared spell count and maximum
      let preparedCount = 0;
      let maxPrepared = 0;

      if (classItem) {
        // Calculate based on class and level
        const spellcastingAbility = classItem.system.spellcasting?.ability;
        if (spellcastingAbility) {
          const abilityMod = this.actor.system.abilities[spellcastingAbility]?.mod || 0;
          const classLevel = classItem.system.levels || this.actor.system.details.level;
          maxPrepared = Math.max(1, classLevel + abilityMod);
        }
      }

      // Count currently prepared spells
      for (const level of spellLevels) {
        for (const spell of level.spells) {
          if (spell.preparation.prepared && !spell.preparation.alwaysPrepared) {
            preparedCount++;
          }
        }
      }

      context.spellPreparation = {
        current: preparedCount,
        maximum: maxPrepared
      };

      log(3, 'Final context:', {
        className: context.className,
        spellLevelCount: context.spellLevels.length,
        totalSpells: context.spellLevels.reduce((count, level) => count + level.spells.length, 0),
        preparation: context.spellPreparation
      });

      return context;
    } catch (error) {
      log(1, 'Error preparing spell book context:', error);
      return context;
    } finally {
      // Remove loading spinner when done
      this.element?.classList.remove('loading');
    }
  }

  /**
   * Sets up the form after rendering
   * @param {object} context - The render context
   * @param {object} options - Render options
   * @override
   */
  _onRender(context, options) {
    super._onRender?.(context, options);

    // Update the preparation count in the footer
    if (context.spellPreparation) {
      const countDisplay = this.element.querySelector('.spell-prep-tracking');
      if (countDisplay) {
        // Add visual indicator when at/over max
        if (context.spellPreparation.current >= context.spellPreparation.maximum) {
          countDisplay.classList.add('at-max');
        } else {
          countDisplay.classList.remove('at-max');
        }
      }
    }
  }

  /* -------------------------------------------- */
  /*  Static Methods                              */
  /* -------------------------------------------- */

  /**
   * Handle form submission to save prepared spells
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<Actor|null>} - The updated actor or null if failed
   */
  static async formHandler(event, form, formData) {
    log(1, 'FormData Collected:', { event: event, form: form, formData: formData.object });
    try {
      const actor = this.actor;
      if (!actor) {
        log(1, 'No actor found');
        return null;
      }

      // Extract prepared spells from form data - this contains the checked boxes
      const spellPreparationData = formData.object.spellPreparation || {};

      // Debug the collected form data to see what's coming in
      log(3, 'Spell preparation data from form:', spellPreparationData);

      // Gather all spell information from the form
      const spellData = {};

      // Process each input in the form to gather spell data
      const checkboxes = form.querySelectorAll('input[type="checkbox"][data-uuid]');
      for (const checkbox of checkboxes) {
        const uuid = checkbox.dataset.uuid;
        const name = checkbox.dataset.name;
        const wasPrepared = checkbox.dataset.wasPrepared === 'true';

        // Check if this spell is prepared in the form data
        // Look directly at the checkbox's checked state as a fallback
        const isPrepared = checkbox.disabled ? wasPrepared : !!spellPreparationData[uuid] || checkbox.checked;

        log(3, `Processing spell ${name} (${uuid}):`, {
          wasPrepared,
          isPrepared,
          isDisabled: checkbox.disabled,
          formValue: spellPreparationData[uuid],
          checkedState: checkbox.checked
        });

        spellData[uuid] = {
          name,
          wasPrepared,
          isPrepared,
          // This helps identify disabled checkboxes (always prepared spells)
          isAlwaysPrepared: checkbox.disabled
        };
      }

      // Save the processed spell data to actor
      await saveActorPreparedSpells(actor, spellData);

      ui.notifications.info(game.i18n.format('SPELLBOOK.Notifications.SpellsUpdated', { name: actor.name }));

      // Re-render any open character sheets
      if (actor.sheet.rendered) {
        actor.sheet.render(true);
      }

      return actor;
    } catch (error) {
      log(1, 'Error handling form submission:', error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.Notifications.UpdateFailed'));
      return null;
    }
  }
}
