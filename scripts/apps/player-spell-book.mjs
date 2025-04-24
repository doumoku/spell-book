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
    actions: {
      toggleSidebar: PlayerSpellBook.toggleSidebar,
      filterSpells: PlayerSpellBook.filterSpells,
      sortSpells: PlayerSpellBook.sortSpells
    },
    classes: ['spell-book'],
    window: {
      icon: 'fa-solid fa-hat-wizard',
      resizable: true,
      minimizable: true
    }
  };

  /** @override */
  static PARTS = {
    form: { template: MODULE.TEMPLATES.SPELL_BOOK_CONTENT, templates: [MODULE.TEMPLATES.SPELL_BOOK_SIDEBAR, MODULE.TEMPLATES.SPELL_BOOK_LIST] },
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
      actorId: this.actor.id,
      TEMPLATES: MODULE.TEMPLATES
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

    try {
      // Move footer to the appropriate container
      this._positionFooter();

      // Set up text search event listener
      const searchInput = this.element.querySelector('input[name="filter-name"]');
      if (searchInput) {
        searchInput.addEventListener('input', (event) => {
          console.log('Search input event triggered', { value: event.target.value });
          log(1, 'Search input event triggered with value:', event.target.value);
          this._onSearchInput.bind(this)(event);
        });
      }

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

      // Set sidebar state based on user preference
      const sidebarCollapsed = game.user.getFlag(MODULE.ID, 'sidebarCollapsed');
      if (sidebarCollapsed) {
        this.element.classList.add('sidebar-collapsed');
        this._positionFooter();
      }

      // Always apply filters to ensure initial state is correct
      this._applyFilters();
    } catch (error) {
      log(1, 'Error in _onRender:', error);
    }
  }

  /**
   * Position the footer in the appropriate container based on sidebar state
   * @private
   */
  _positionFooter() {
    try {
      const footer = this.element.querySelector('footer');
      if (!footer) return;

      const isSidebarCollapsed = this.element.classList.contains('sidebar-collapsed');
      const sidebarFooterContainer = this.element.querySelector('.sidebar-footer-container');
      const collapsedFooter = this.element.querySelector('.collapsed-footer');

      if (isSidebarCollapsed && collapsedFooter) {
        collapsedFooter.appendChild(footer);
        collapsedFooter.classList.remove('hidden');
      } else if (sidebarFooterContainer) {
        sidebarFooterContainer.appendChild(footer);
        if (collapsedFooter) collapsedFooter.classList.add('hidden');
      }
    } catch (error) {
      log(1, 'Error positioning footer:', error);
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
   * Handle search input
   * @param {Event} event - The input event
   * @private
   */
  _onSearchInput(event) {
    this._applyFilters();
  }

  /**
   * Apply all current filters to the spell list
   * @private
   */
  _applyFilters() {
    try {
      const filters = this._getFilterState();
      log(3, 'Applying filters:', filters);

      const spellItems = this.element.querySelectorAll('.spell-item');
      let visibleCount = 0;

      for (const item of spellItems) {
        const nameEl = item.querySelector('.spell-name');
        const detailsEl = item.querySelector('.spell-details');
        const name = nameEl?.textContent.toLowerCase() || '';
        const details = detailsEl?.textContent.toLowerCase() || '';
        const isPrepared = item.classList.contains('prepared-spell');
        const isRitual = item.querySelector('input[type="checkbox"]')?.dataset.ritual === 'true' || details.includes('ritual');
        const level = item.dataset.spellLevel || '';
        const school = item.dataset.spellSchool || '';

        // Check all filter conditions
        let visible = true;

        // Text search
        if (filters.name && !name.includes(filters.name.toLowerCase())) {
          visible = false;
        }

        // Level filter
        if (filters.level && level !== filters.level) {
          visible = false;
        }

        // School filter
        if (filters.school && school !== filters.school) {
          visible = false;
        }

        // Prepared only
        if (filters.prepared && !isPrepared) {
          visible = false;
        }

        // Ritual only
        if (filters.ritual && !isRitual) {
          visible = false;
        }

        // Update visibility
        item.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
      }

      // Show/hide no results message
      const noResults = this.element.querySelector('.no-filter-results');
      if (noResults) {
        noResults.style.display = visibleCount > 0 ? 'none' : 'block';
      }

      // Update level container visibility
      const levelContainers = this.element.querySelectorAll('.spell-level');
      for (const container of levelContainers) {
        const visibleSpells = Array.from(container.querySelectorAll('.spell-item')).filter((item) => item.style.display !== 'none').length;
        container.style.display = visibleSpells > 0 ? '' : 'none';
      }
    } catch (error) {
      log(1, 'Error applying filters:', error);
    }
  }

  /**
   * Apply sorting to the current spell lists
   * @param {string} sortBy Sorting criteria
   * @private
   */
  _applySorting(sortBy) {
    try {
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
              const schoolA = a.dataset.spellSchool || '';
              const schoolB = b.dataset.spellSchool || '';
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
    } catch (error) {
      log(1, 'Error applying sorting:', error);
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
   * Handle sidebar toggle action
   * @param {Event} event - The click event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static toggleSidebar(event, form) {
    log(1, 'toggleSidebar action triggered');

    const isCollapsing = !this.element.classList.contains('sidebar-collapsed');
    this.element.classList.toggle('sidebar-collapsed');

    // Rotate the caret icon
    const caretIcon = event.currentTarget.querySelector('i');
    if (caretIcon) {
      caretIcon.style.transform = isCollapsing ? 'rotate(180deg)' : 'rotate(0)';
    }

    // Reposition footer
    this._positionFooter();

    // Store user preference
    game.user.setFlag(MODULE.ID, 'sidebarCollapsed', isCollapsing);

    log(3, `Sidebar ${isCollapsing ? 'collapsed' : 'expanded'}`);
  }

  /**
   * Handle filter changes
   * @param {Event} event - The change event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static filterSpells(event, form) {
    log(1, 'filterSpells action triggered');
    this._applyFilters();
  }

  /**
   * Handle sorting selection
   * @param {Event} event - The change event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static sortSpells(event, form) {
    log(1, 'sortSpells action triggered');
    const sortBy = event.target.value;
    this._applySorting(sortBy);
  }

  /**
   * Handle form submission to save prepared spells
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<Actor|null>} - The updated actor or null if failed
   */
  static async formHandler(event, form, formData) {
    log(1, 'FormData Collected:', { form: form, formData: formData.object });
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
