import { MODULE } from '../constants.mjs';
import { calculateMaxSpellLevel, fetchSpellDocuments, findSpellcastingClass, formatSpellDetails, getClassSpellList, organizeSpellsByLevel, saveActorPreparedSpells } from '../helpers.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PlayerSpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `player-${MODULE.ID}`,
    title: 'Spell Book',
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
    form: { template: `modules/${MODULE.ID}/templates/spell-book.hbs` },
    footer: { template: `modules/${MODULE.ID}/templates/spell-book-footer.hbs` }
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
    return `${this.actor.name}'s Spell Book`;
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
        console.log(`${MODULE.ID} | No spells found for class:`, className);
        return context;
      }

      // Determine max spell level based on actor's level and spell slot table
      const actorLevel = this.actor.system.details.level;
      const maxSpellLevel = calculateMaxSpellLevel(actorLevel, classItem.system.spellcasting);
      console.log(`${MODULE.ID} | Max spell level for level ${actorLevel}: ${maxSpellLevel}`);

      // Get the actual spell items
      console.log(`${MODULE.ID} | Starting to fetch ${spellUuids.size} spell items`);
      const spellItems = await fetchSpellDocuments(spellUuids, maxSpellLevel);
      console.log(`${MODULE.ID} | Successfully fetched ${spellItems.length} spell items`);

      // Organize spells by level
      const spellLevels = organizeSpellsByLevel(spellItems, this.actor);

      // Process each level to create enriched content
      for (const level of spellLevels) {
        for (const spell of level.spells) {
          // Store the original compendium UUID on the spell
          const uuid = spell.compendiumUuid || spell.uuid;
          console.log(`${MODULE.ID} | Using UUID for enrichment: ${uuid}`);

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

      console.log(`${MODULE.ID} | Final context:`, {
        className: context.className,
        spellLevelCount: context.spellLevels.length,
        totalSpells: context.spellLevels.reduce((count, level) => count + level.spells.length, 0),
        preparation: context.spellPreparation
      });

      return context;
    } catch (error) {
      console.error(`${MODULE.ID} | Error preparing spell book context:`, error);
      return context;
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

    // Add actor ID to the form for use in form handler
    if (this.element && this.actor) {
      this.element.dataset.actorId = this.actor.id;
    }

    // Update the preparation count in the footer
    if (context.spellPreparation) {
      const countDisplay = this.element.querySelector('.spell-prep-tracking');
      if (countDisplay) {
        countDisplay.textContent = `${context.spellPreparation.current}/${context.spellPreparation.maximum} Prepared Spells`;
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
    console.error({ event: event, form: form, formData: formData });
    try {
      const actor = this.actor;
      if (!actor) {
        console.error(`${MODULE.ID} | No actor found in application`);
        return null;
      }

      // Extract prepared spells from form data
      // This will be an array if multiple checkboxes are checked, or a single value if only one
      let preparedSpells = formData.object.prepared || [];

      // Ensure we have an array
      if (!Array.isArray(preparedSpells)) {
        preparedSpells = [preparedSpells];
      }

      // Save prepared spells to actor
      await saveActorPreparedSpells(actor, preparedSpells);

      ui.notifications.info(`${actor.name}'s prepared spells have been updated.`);

      // Re-render any open character sheets
      if (actor.sheet.rendered) {
        actor.sheet.render(true);
      }

      return actor;
    } catch (error) {
      console.error(`${MODULE.ID} | Error handling form submission:`, error);
      ui.notifications.error('Failed to update prepared spells.');
      return null;
    }
  }
}
