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

    const context = {
      actor: this.actor,
      spellLevels: [],
      className: '',
      filters: this._getFilterState(),
      spellSchools: CONFIG.DND5E.spellSchools,
      buttons: [
        { type: 'submit', icon: 'fa-solid fa-save', label: 'SETTINGS.Save', cssClass: 'submit-button' },
        { type: 'reset', action: 'reset', icon: 'fa-solid fa-undo', label: 'SETTINGS.Reset', cssClass: 'reset-button' }
      ],
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
      const spellItems = await this._fetchSpellDataWithCache(spellUuids, maxSpellLevel);
      log(3, `Successfully fetched ${spellItems.length} spell items`);

      // Organize spells by level
      const spellLevels = organizeSpellsByLevel(spellItems, this.actor);

      // Sort spells within each level based on current sort setting
      const sortBy = this._getFilterState().sortBy || 'level';
      for (const level of spellLevels) {
        level.spells = this._sortSpells(level.spells, sortBy);
      }

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

  /**
   * Fetch spell data with caching
   * @param {Set<string>} spellUuids - Set of spell UUIDs
   * @param {number} maxSpellLevel - Maximum spell level to include
   * @returns {Promise<Array>} - Array of spell documents
   * @private
   */
  async _fetchSpellDataWithCache(spellUuids, maxSpellLevel) {
    // Create a cache key based on actor ID and spell list
    const cacheKey = `${this.actor.id}-${maxSpellLevel}`;

    // Check if we have cached data for this actor
    const cachedData = MODULE.CACHE.spellData[cacheKey];
    const cacheTime = MODULE.CACHE.spellDataTime[cacheKey] || 0;

    // Use cache if available and less than 5 minutes old
    if (cachedData && Date.now() - cacheTime < 300000) {
      log(3, `Using cached spell data for ${this.actor.name} (${cachedData.length} spells)`);
      return cachedData;
    }

    // Otherwise fetch fresh data
    log(3, `Fetching fresh spell data for ${this.actor.name}`);
    const data = await fetchSpellDocuments(spellUuids, maxSpellLevel);

    // Cache the results
    MODULE.CACHE.spellData[cacheKey] = data;
    MODULE.CACHE.spellDataTime[cacheKey] = Date.now();

    return data;
  }

  /**
   * Get the current filter state from form inputs
   * @returns {Object} The current filter state
   * @private
   */
  _getFilterState() {
    if (!this.element) {
      return {
        name: '',
        level: '',
        school: '',
        prepared: false,
        ritual: false,
        sortBy: 'level'
      };
    }

    return {
      name: this.element.querySelector('[name="filter-name"]')?.value || '',
      level: this.element.querySelector('[name="filter-level"]')?.value || '',
      school: this.element.querySelector('[name="filter-school"]')?.value || '',
      prepared: this.element.querySelector('[name="filter-prepared"]')?.checked || false,
      ritual: this.element.querySelector('[name="filter-ritual"]')?.checked || false,
      sortBy: this.element.querySelector('[name="sort-by"]')?.value || 'level'
    };
  }

  /**
   * @override
   */
  _activateListeners(html) {
    super._activateListeners?.(html);

    // Add filter inputs
    const filterInputs = html.find('.spell-filters input, .spell-filters select');
    if (filterInputs.length) {
      filterInputs.on('change input', this._onFilterChange.bind(this));
    }
  }

  /**
   * Handle filter changes
   * @param {Event} event The change event
   * @private
   */
  _onFilterChange(event) {
    // If this is the sort selector, re-sort the list
    if (event.target.name === 'sort-by') {
      this._applySorting(event.target.value);
    }

    // Continue with existing filter logic...
  }

  /**
   * Apply sorting to the current spell lists
   * @param {string} sortBy Sorting criteria
   * @private
   */
  _applySorting(sortBy) {
    const levelContainers = this.element.querySelectorAll('.spell-level');

    for (const levelContainer of levelContainers) {
      const list = levelContainer.querySelector('.spell-list');
      if (!list) continue;

      const items = Array.from(list.children);

      items.sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.querySelector('.spell-name').textContent.localeCompare(b.querySelector('.spell-name').textContent);

          case 'school':
            const schoolA = a.querySelector('.spell-details')?.textContent || '';
            const schoolB = b.querySelector('.spell-details')?.textContent || '';
            return schoolA.localeCompare(schoolB) || a.querySelector('.spell-name').textContent.localeCompare(b.querySelector('.spell-name').textContent);

          case 'prepared':
            const aPrepared = a.classList.contains('prepared-spell') ? 0 : 1;
            const bPrepared = b.classList.contains('prepared-spell') ? 0 : 1;
            return aPrepared - bPrepared || a.querySelector('.spell-name').textContent.localeCompare(b.querySelector('.spell-name').textContent);

          default:
            return 0; // Keep current order
        }
      });

      // Re-append the sorted items
      for (const item of items) {
        list.appendChild(item);
      }
    }
  }

  /**
   * Sort spell list by specified criteria
   * @param {Array} spells Array of spells to sort
   * @param {string} sortBy Sorting criteria
   * @returns {Array} Sorted array of spells
   * @private
   */
  _sortSpells(spells, sortBy) {
    return [...spells].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);

        case 'school':
          const schoolA = a.system.school || '';
          const schoolB = b.system.school || '';
          return schoolA.localeCompare(schoolB) || a.name.localeCompare(b.name);

        case 'prepared':
          // Sort prepared spells first, then by name
          const prepA = a.preparation.prepared ? 0 : 1;
          const prepB = b.preparation.prepared ? 0 : 1;
          return prepA - prepB || a.name.localeCompare(b.name);

        case 'level':
        default:
          // Level sorting is handled by organizeSpellsByLevel,
          // so we just sort by name within each level
          return a.name.localeCompare(b.name);
      }
    });
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
