import { DEFAULT_FILTER_CONFIG, MODULE } from '../constants.mjs';
import { calculateMaxSpellLevel, fetchSpellDocuments, findSpellcastingClass, formatSpellDetails, getClassSpellList, organizeSpellsByLevel, saveActorPreparedSpells } from '../helpers.mjs';
import { log } from '../logger.mjs';
import { PlayerFilterConfiguration } from './player-filter-configuration.mjs';

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
      sortSpells: PlayerSpellBook.sortSpells,
      reset: PlayerSpellBook.handleReset,
      toggleSpellLevel: PlayerSpellBook.toggleSpellLevel,
      configureFilters: PlayerSpellBook.configureFilters
    },
    classes: ['spell-book'],
    window: {
      icon: 'fas fa-hat-wizard',
      resizable: true,
      minimizable: true,
      positioned: true
    },
    position: {
      height: '850',
      width: '600',
      top: '75'
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

  /**
   * Loading state for the spell book
   * @type {boolean}
   */
  isLoading = true;

  /**
   * Error state tracking
   * @type {boolean}
   */
  hasError = false;

  /**
   * Error message if loading failed
   * @type {string}
   */
  errorMessage = '';

  /**
   * Spell levels data
   * @type {Array}
   */
  spellLevels = [];

  /**
   * Class name for spellcasting
   * @type {string}
   */
  className = '';

  /**
   * Spell preparation statistics
   * @type {Object}
   */
  spellPreparation = { current: 0, maximum: 0 };

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
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /**
   * @override
   */
  async _prepareContext(options) {
    // Create basic context with loading state
    const context = this._createBaseContext();

    // Skip detailed preparation if we're still loading
    if (this.isLoading) {
      return context;
    }

    // Add spell data to context
    context.spellLevels = this.spellLevels;
    context.className = this.className;
    context.spellPreparation = this.spellPreparation;

    // Prepare the filters using the new unified system
    context.filters = this._prepareFilters();

    return context;
  }

  /**
   * Creates the base context object with minimal information
   * @returns {Object} The base context
   * @private
   */
  _createBaseContext() {
    // Get filter configuration - needed even during loading state
    let filterConfig = game.settings.get(MODULE.ID, 'filterConfiguration');
    if (!Array.isArray(filterConfig) || !filterConfig.length) {
      filterConfig = DEFAULT_FILTER_CONFIG;
    }

    // Create empty filters structure to prevent UI issues during loading
    const emptyFilters = {
      search: null,
      dropdowns: [],
      checkboxes: [],
      range: null
    };

    return {
      actor: this.actor,
      isLoading: this.isLoading,
      hasError: this.hasError,
      errorMessage: this.errorMessage,
      spellLevels: this.spellLevels || [],
      className: this.className || '',
      filters: this.isLoading ? emptyFilters : this._getFilterState(),
      spellSchools: CONFIG.DND5E.spellSchools,
      buttons: [
        { type: 'submit', icon: 'fas fa-save', label: 'SETTINGS.Save', cssClass: 'submit-button' },
        { type: 'reset', action: 'reset', icon: 'fas fa-undo', label: 'SETTINGS.Reset', cssClass: 'reset-button' }
      ],
      actorId: this.actor.id,
      TEMPLATES: MODULE.TEMPLATES,
      spellPreparation: this.spellPreparation || { current: 0, maximum: 0 }
    };
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
      // Set sidebar state based on user preference immediately
      const sidebarCollapsed = game.user.getFlag(MODULE.ID, 'sidebarCollapsed');
      if (sidebarCollapsed) {
        this.element.classList.add('sidebar-collapsed');
      }

      // Add loading class if we're in the loading state
      if (this.isLoading) {
        this.element.classList.add('loading');

        // Disable filter inputs during loading
        this._disableFiltersWhileLoading();

        // Position the footer even during loading
        this._positionFooter();

        // Start loading the data in the background
        this._loadSpellData();
        return;
      } else {
        this.element.classList.remove('loading');
      }

      // Only set up UI elements if we're not loading
      this._positionFooter();
      this._setupFilterListeners();
      this._setupPreparationListeners();

      // Apply saved collapsed spell level states
      this._applyCollapsedLevels();

      // Update spell counts
      this._updateSpellCounts();

      // Apply filters and initialize tracking
      this._applyFilters();
      this._updateSpellPreparationTracking();
    } catch (error) {
      log(1, 'Error in _onRender:', error);
    }
  }

  /**
   * Disable filter inputs while the spell data is loading
   * @private
   */
  _disableFiltersWhileLoading() {
    const inputs = this.element.querySelectorAll('.spell-filters input, .spell-filters select, .spell-filters button');
    inputs.forEach((input) => {
      input.disabled = true;
    });
  }

  /* -------------------------------------------- */
  /*  Data Loading                                */
  /* -------------------------------------------- */

  /**
   * Loads all spell data asynchronously after the initial render
   * @private
   */
  async _loadSpellData() {
    const start = performance.now();
    const timing = (label) => log(1, `${label}: ${(performance.now() - start).toFixed(2)}ms`);

    timing('Start _loadSpellData');

    try {
      // Find spellcasting class
      const classItem = findSpellcastingClass(this.actor);
      if (!classItem) {
        timing('No class item found');
        this._setErrorState(game.i18n.format('SPELLBOOK.Errors.NoSpellsFound', { actor: this.actor.name }));
        return;
      }

      const className = classItem.name.toLowerCase();
      timing('Found class item');

      // Get spell list UUIDs
      const spellUuids = await this._getSpellUuids(classItem);
      if (!spellUuids || !spellUuids.size) {
        log(1, 'No spells found for class:', className);
        timing('No spells found');
        this._setErrorState(game.i18n.format('SPELLBOOK.Errors.NoSpellsFound', { actor: this.actor.name }));
        return;
      }
      timing('Fetched class spell list');

      // Fetch and process spell data
      const actorLevel = this.actor.system.details.level;
      const maxSpellLevel = calculateMaxSpellLevel(actorLevel, classItem.system.spellcasting);
      log(3, `Max spell level for level ${actorLevel}: ${maxSpellLevel}`);

      const spellItems = await this._fetchSpellDataWithCache(spellUuids, maxSpellLevel);
      timing('Fetched spell data with cache');

      const spellLevels = await organizeSpellsByLevel(spellItems, this.actor);
      timing('Organized spells by level');

      // Sort and enhance spell data
      this._sortAllSpellLevels(spellLevels);
      await this._enrichSpellData(spellLevels);

      // Calculate preparation stats
      const prepStats = this._calculatePreparationStats(spellLevels, classItem);

      // Update context with the loaded data
      this.spellLevels = spellLevels;
      this.className = classItem.name;
      this.spellPreparation = prepStats;

      timing('Finished _loadSpellData');
    } catch (error) {
      log(1, 'Error loading spell data:', error);
      this._setErrorState('An error occurred while loading spells.');
    } finally {
      // Complete loading and re-render
      this.isLoading = false;
      this.render(false);
    }
  }

  /**
   * Get spell UUIDs for the class
   * @param {Item5e} classItem - The class item
   * @returns {Promise<Set<string>>} - Set of spell UUIDs
   * @private
   */
  async _getSpellUuids(classItem) {
    const className = classItem.name.toLowerCase();
    const classUuid = classItem.uuid;
    return await getClassSpellList(className, classUuid);
  }

  /**
   * Set an error state
   * @param {string} message - The error message
   * @private
   */
  _setErrorState(message) {
    this.hasError = true;
    this.errorMessage = message;
    this.isLoading = false;
  }

  /**
   * Sort spells in all spell levels
   * @param {Array} spellLevels - Array of spell level data
   * @private
   */
  _sortAllSpellLevels(spellLevels) {
    const sortBy = this._getFilterState().sortBy || 'level';
    for (const level of spellLevels) {
      level.spells = this._sortSpells(level.spells, sortBy);
    }
  }

  /**
   * Calculate preparation statistics for the spell levels
   * @param {Array} spellLevels - Array of spell level data
   * @param {Item5e} classItem - The spellcasting class item
   * @returns {Object} Preparation statistics
   * @private
   */
  _calculatePreparationStats(spellLevels, classItem) {
    let preparedCount = 0;
    let maxPrepared = 0;

    if (classItem) {
      const spellcastingAbility = classItem.system.spellcasting?.ability;
      if (spellcastingAbility) {
        const abilityMod = this.actor.system.abilities[spellcastingAbility]?.mod || 0;
        const classLevel = classItem.system.levels || this.actor.system.details.level;
        maxPrepared = Math.max(1, classLevel + abilityMod);
      }
    }

    for (const level of spellLevels) {
      for (const spell of level.spells) {
        if (spell.preparation.prepared && !spell.preparation.alwaysPrepared) {
          preparedCount++;
        }
      }
    }

    return {
      current: preparedCount,
      maximum: maxPrepared
    };
  }

  /**
   * Enrich spell data with icons and formatted details
   * @param {Array} spellLevels - Array of spell level data
   * @returns {Promise<void>}
   * @private
   */
  async _enrichSpellData(spellLevels) {
    for (const level of spellLevels) {
      let failedUUIDs = [];
      for (const spell of level.spells) {
        const uuid = spell.compendiumUuid || spell.uuid || spell?._stats?.compendiumSource;
        if (!uuid) {
          failedUUIDs.push(spell);
          continue;
        }

        let enrichedHTML = await TextEditor.enrichHTML(`@UUID[${uuid}]{${spell.name}}`, { async: true });

        const iconImg = `<img src="${spell.img}" class="spell-icon" alt="${spell.name} icon">`;
        const linkMatch = enrichedHTML.match(/<a[^>]*>(.*?)<\/a>/);
        let enrichedIcon = '';

        if (linkMatch) {
          const linkOpenTag = enrichedHTML.match(/<a[^>]*>/)[0];
          enrichedIcon = `${linkOpenTag}${iconImg}</a>`;
        } else {
          enrichedIcon = `<a class="content-link" data-uuid="${uuid}">${iconImg}</a>`;
        }

        spell.enrichedIcon = enrichedIcon;
        spell.formattedDetails = formatSpellDetails(spell);
      }
      if (failedUUIDs.length > 0) {
        log(2, 'Some spells failed UUID check:', failedUUIDs);
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
    const start = performance.now();
    const timing = (label) => log(1, `${label}: ${(performance.now() - start).toFixed(2)}ms`);

    // Create a cache key based on actor ID and spell list
    const cacheKey = `${this.actor.id}-${maxSpellLevel}`;
    timing('Created cache key');

    // Check if we have cached data for this actor
    const cachedData = MODULE.CACHE.spellData[cacheKey];
    const cacheTime = MODULE.CACHE.spellDataTime[cacheKey] || 0;
    timing('Checked cache presence');

    // Use cache if available and less than 5 minutes old
    if (cachedData && Date.now() - cacheTime < 300000) {
      log(3, `Using cached spell data for ${this.actor.name} (${cachedData.length} spells)`);
      timing('Using cached data');
      return cachedData;
    }

    // Otherwise fetch fresh data
    log(3, `Fetching fresh spell data for ${this.actor.name}`);
    timing('Starting fetch of fresh spell data');

    const data = await fetchSpellDocuments(spellUuids, maxSpellLevel);
    timing('Fetched fresh spell data');

    // Cache the results
    MODULE.CACHE.spellData[cacheKey] = data;
    MODULE.CACHE.spellDataTime[cacheKey] = Date.now();
    timing('Cached fresh spell data');

    return data;
  }

  /* -------------------------------------------- */
  /*  Filter Management                           */
  /* -------------------------------------------- */

  /**
   * Convert a spell range to feet (or meters based on settings)
   * @param {string} units - The range units (feet, miles, etc)
   * @param {number} value - The range value
   * @returns {number} - The converted range value
   * @private
   */
  _convertRangeToStandardUnit(units, value) {
    if (!units || !value) return 0;

    const targetUnit = game.settings.get(MODULE.ID, 'distanceUnit');
    let inFeet = 0;

    // Convert to feet first
    switch (units) {
      case 'ft':
        inFeet = value;
        break;
      case 'mi':
        inFeet = value * 5280;
        break;
      case 'spec':
        // Special range like "Self" or "Touch" - treat as 0
        inFeet = 0;
        break;
      default:
        // Default to the raw value if unknown unit
        inFeet = value;
    }

    // Convert from feet to meters if needed
    if (targetUnit === 'meters') {
      return Math.round(inFeet * 0.3048);
    }

    return inFeet;
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

      // Create a map to track visible spells per level
      const levelVisibilityMap = new Map();

      for (const item of spellItems) {
        // Extract basic spell metadata
        const nameEl = item.querySelector('.spell-name');
        const name = nameEl?.textContent.toLowerCase() || '';
        const isPrepared = item.classList.contains('prepared-spell');
        const level = item.dataset.spellLevel || '';
        const school = item.dataset.spellSchool || '';

        // Extract filter data from dataset
        const castingTimeType = item.dataset.castingTimeType || '';
        const castingTimeValue = item.dataset.castingTimeValue || '';
        const rangeUnits = item.dataset.rangeUnits || '';
        const damageTypes = (item.dataset.damageTypes || '').split(',');
        const isRitual = item.dataset.ritual === 'true';
        const isConcentration = item.dataset.concentration === 'true';
        const requiresSave = item.dataset.requiresSave === 'true';
        const conditions = (item.dataset.conditions || '').split(',');

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

        // Casting Time filter
        if (filters.castingTime) {
          const [filterType, filterValue] = filters.castingTime.split(':');
          const itemType = castingTimeType;
          const itemValue = castingTimeValue === '' || castingTimeValue === null ? '1' : castingTimeValue;

          // Check if types match, and if values match (accounting for null = 1)
          if (itemType !== filterType || itemValue !== filterValue) {
            visible = false;
          }
        }

        // Range filter
        if ((filters.minRange || filters.maxRange) && rangeUnits) {
          const rangeValue = parseInt(item.dataset.rangeValue || '0', 10);
          const convertedRange = this._convertRangeToStandardUnit(rangeUnits, rangeValue);

          const minRange = filters.minRange ? parseInt(filters.minRange, 10) : 0;
          const maxRange = filters.maxRange ? parseInt(filters.maxRange, 10) : Infinity;

          if (convertedRange < minRange || convertedRange > maxRange) {
            visible = false;
          }
        }

        // Damage Type filter
        if (filters.damageType && !damageTypes.includes(filters.damageType)) {
          visible = false;
        }

        // Condition filter
        if (filters.condition && !conditions.includes(filters.condition)) {
          visible = false;
        }

        // Requires Save filter
        if (filters.requiresSave) {
          if (filters.requiresSave === 'true' && !requiresSave) {
            visible = false;
          } else if (filters.requiresSave === 'false' && requiresSave) {
            visible = false;
          }
        }

        // Prepared only
        if (filters.prepared && !isPrepared) {
          visible = false;
        }

        // Ritual only
        if (filters.ritual && !isRitual) {
          visible = false;
        }

        // Concentration filter
        if (filters.concentration) {
          const spellConcentration = isConcentration;
          if (filters.concentration === 'true' && !spellConcentration) {
            visible = false;
          } else if (filters.concentration === 'false' && spellConcentration) {
            visible = false;
          }
        }

        // Update visibility
        item.style.display = visible ? '' : 'none';
        if (visible) {
          visibleCount++;

          // Update level visibility tracker
          if (!levelVisibilityMap.has(level)) {
            levelVisibilityMap.set(level, { total: 0, visible: 0, prepared: 0 });
          }
          const levelStats = levelVisibilityMap.get(level);
          levelStats.visible++;
          if (isPrepared) levelStats.prepared++;
        }
      }

      // Show/hide no results message
      const noResults = this.element.querySelector('.no-filter-results');
      if (noResults) {
        noResults.style.display = visibleCount > 0 ? 'none' : 'block';
      }

      // Update level container visibility and counts
      const levelContainers = this.element.querySelectorAll('.spell-level');
      for (const container of levelContainers) {
        const levelId = container.dataset.level;
        const levelStats = levelVisibilityMap.get(levelId) || { visible: 0, prepared: 0 };

        // Update visibility of the container
        container.style.display = levelStats.visible > 0 ? '' : 'none';

        // Update the count display
        const countDisplay = container.querySelector('.spell-count');
        if (countDisplay && levelStats.visible > 0) {
          countDisplay.textContent = `(${levelStats.prepared}/${levelStats.visible})`;
        } else if (countDisplay) {
          countDisplay.textContent = '';
        }
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

  /**
   * Prepare all filters for display based on configuration
   * @returns {Array} Array of organized filters for the template
   * @private
   */
  _prepareFilters() {
    // Get the filter configuration
    let filterConfig = game.settings.get(MODULE.ID, 'filterConfiguration');
    if (!Array.isArray(filterConfig) || !filterConfig.length) {
      filterConfig = DEFAULT_FILTER_CONFIG;
    }

    // Sort by order property and filter for enabled only
    const sortedFilters = filterConfig.filter((f) => f.enabled).sort((a, b) => a.order - b.order);

    // Get current filter state
    const filterState = this._getFilterState();

    // Process each filter to add template-specific properties
    return sortedFilters.map((filter) => {
      const result = {
        id: filter.id,
        type: filter.type,
        name: `filter-${filter.id}`,
        label: game.i18n.localize(filter.label)
      };

      // Add type-specific properties
      switch (filter.type) {
        case 'search':
          result.value = filterState[filter.id] || '';
          break;

        case 'dropdown':
          result.options = this._getOptionsForFilter(filter.id, filterState);
          break;

        case 'checkbox':
          result.checked = filterState[filter.id] || false;
          break;

        case 'range':
          result.minName = `filter-min-range`;
          result.maxName = `filter-max-range`;
          result.minValue = filterState.minRange || '';
          result.maxValue = filterState.maxRange || '';
          result.unit = game.settings.get(MODULE.ID, 'distanceUnit');
          break;
      }

      return result;
    });
  }

  /**
   * Get options for a specific dropdown filter
   * @param {string} filterId - The filter ID
   * @param {Object} filterState - Current filter state
   * @returns {Array} Options for the dropdown
   * @private
   */
  _getOptionsForFilter(filterId, filterState) {
    const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];

    switch (filterId) {
      case 'level':
        // Add options for each spell level found
        if (this.spellLevels) {
          this.spellLevels.forEach((level) => {
            options.push({
              value: level.level,
              label: CONFIG.DND5E.spellLevels[level.level],
              selected: filterState.level === level.level
            });
          });
        }
        break;

      case 'school':
        // Add options for each spell school
        Object.entries(CONFIG.DND5E.spellSchools).forEach(([key, school]) => {
          options.push({
            value: key,
            label: school.label,
            selected: filterState.school === key
          });
        });
        break;

      // Other cases for different dropdowns
      case 'castingTime':
        this._addCastingTimeOptions(options, filterState);
        break;

      case 'damageType':
        this._addDamageTypeOptions(options, filterState);
        break;

      case 'condition':
        this._addConditionOptions(options, filterState);
        break;

      case 'requiresSave':
      case 'concentration':
        options.push(
          { value: 'true', label: game.i18n.localize('SPELLBOOK.Filters.True'), selected: filterState[filterId] === 'true' },
          { value: 'false', label: game.i18n.localize('SPELLBOOK.Filters.False'), selected: filterState[filterId] === 'false' }
        );
        break;

      case 'sortBy':
        options.push(
          { value: 'level', label: game.i18n.localize('SPELLBOOK.Sort.ByLevel'), selected: filterState.sortBy === 'level' },
          { value: 'name', label: game.i18n.localize('SPELLBOOK.Sort.ByName'), selected: filterState.sortBy === 'name' },
          { value: 'school', label: game.i18n.localize('SPELLBOOK.Sort.BySchool'), selected: filterState.sortBy === 'school' },
          { value: 'prepared', label: game.i18n.localize('SPELLBOOK.Sort.ByPrepared'), selected: filterState.sortBy === 'prepared' }
        );
        break;
    }

    return options;
  }

  /**
   * Add casting time options to the dropdown
   * @param {Array} options - Array to add options to
   * @param {Object} filterState - Current filter state
   * @private
   */
  _addCastingTimeOptions(options, filterState) {
    // Get unique activation types from the spells
    if (this.spellLevels) {
      const uniqueActivationTypes = new Set();

      // First, collect all unique combinations
      this.spellLevels.forEach((level) => {
        level.spells.forEach((spell) => {
          const activationType = spell.system?.activation?.type;
          const activationValue = spell.system?.activation?.value || 1; // treat null as 1

          if (activationType) {
            uniqueActivationTypes.add(`${activationType}:${activationValue}`);
          }
        });
      });

      // Define a priority order for activation types
      const typeOrder = {
        action: 1,
        bonus: 2,
        reaction: 3,
        minute: 4,
        hour: 5,
        day: 6,
        legendary: 7,
        mythic: 8,
        lair: 9,
        crew: 10,
        special: 11,
        none: 12
      };

      // Convert to array of [type:value, type, value] for sorting
      const sortableTypes = Array.from(uniqueActivationTypes).map((combo) => {
        const [type, value] = combo.split(':');
        return [combo, type, parseInt(value) || 1];
      });

      // Sort by type priority then by value
      sortableTypes.sort((a, b) => {
        const [, typeA, valueA] = a;
        const [, typeB, valueB] = b;

        // First compare by type priority
        const typePriorityA = typeOrder[typeA] || 999;
        const typePriorityB = typeOrder[typeB] || 999;
        if (typePriorityA !== typePriorityB) {
          return typePriorityA - typePriorityB;
        }

        // Then by value
        return valueA - valueB;
      });

      // Create the options in the sorted order
      sortableTypes.forEach(([combo, type, value]) => {
        const typeLabel = CONFIG.DND5E.abilityActivationTypes[type] || type;

        let label;
        if (value === 1) {
          label = typeLabel;
        } else {
          label = `${value} ${typeLabel}${value !== 1 ? 's' : ''}`;
        }

        options.push({
          value: combo,
          label: label,
          selected: filterState.castingTime === combo
        });
      });
    }
  }

  /**
   * Add damage type options to the dropdown
   * @param {Array} options - Array to add options to
   * @param {Object} filterState - Current filter state
   * @private
   */
  _addDamageTypeOptions(options, filterState) {
    // Create a combined damage types object including healing
    const damageTypesWithHealing = {
      ...CONFIG.DND5E.damageTypes,
      healing: { label: game.i18n.localize('DND5E.Healing') }
    };

    // Add options for each damage type in alphabetical order by label
    Object.entries(damageTypesWithHealing)
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .forEach(([key, damageType]) => {
        options.push({
          value: key,
          label: damageType.label,
          selected: filterState.damageType === key
        });
      });
  }

  /**
   * Add condition options to the dropdown
   * @param {Array} options - Array to add options to
   * @param {Object} filterState - Current filter state
   * @private
   */
  _addConditionOptions(options, filterState) {
    // Add options for each condition type
    Object.entries(CONFIG.DND5E.conditionTypes)
      .filter(([key, condition]) => !condition.pseudo) // Skip pseudo conditions
      .forEach(([key, condition]) => {
        options.push({
          value: key,
          label: condition.label,
          selected: filterState.condition === key
        });
      });
  }

  /**
   * Get the current filter state from form inputs or defaults
   * @returns {Object} The current filter state
   * @private
   */
  _getFilterState() {
    if (!this.element) {
      return {
        name: '',
        level: '',
        school: '',
        castingTime: '',
        minRange: '',
        maxRange: '',
        damageType: '',
        condition: '',
        requiresSave: '',
        prepared: false,
        ritual: false,
        concentration: '',
        sortBy: 'level'
      };
    }

    return {
      name: this.element.querySelector('[name="filter-name"]')?.value || '',
      level: this.element.querySelector('[name="filter-level"]')?.value || '',
      school: this.element.querySelector('[name="filter-school"]')?.value || '',
      castingTime: this.element.querySelector('[name="filter-castingTime"]')?.value || '',
      minRange: this.element.querySelector('[name="filter-min-range"]')?.value || '',
      maxRange: this.element.querySelector('[name="filter-max-range"]')?.value || '',
      damageType: this.element.querySelector('[name="filter-damageType"]')?.value || '',
      condition: this.element.querySelector('[name="filter-condition"]')?.value || '',
      requiresSave: this.element.querySelector('[name="filter-requiresSave"]')?.value || '',
      prepared: this.element.querySelector('[name="filter-prepared"]')?.checked || false,
      ritual: this.element.querySelector('[name="filter-ritual"]')?.checked || false,
      concentration: this.element.querySelector('[name="filter-concentration"]')?.value || '',
      sortBy: this.element.querySelector('[name="sort-by"]')?.value || 'level'
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners                             */
  /* -------------------------------------------- */

  /**
   * Set up event listeners for preparation checkboxes
   * @private
   */
  _setupPreparationListeners() {
    // Add listeners to preparation checkboxes
    const prepCheckboxes = this.element.querySelectorAll('input[type="checkbox"][data-uuid]:not([disabled])');
    prepCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        // Update the prepared-spell class based on checkbox state
        const spellItem = event.target.closest('.spell-item');
        if (spellItem) {
          if (event.target.checked) {
            spellItem.classList.add('prepared-spell');
          } else {
            spellItem.classList.remove('prepared-spell');
          }
        }
        this._updateSpellPreparationTracking();
        this._updateSpellCounts();
      });
    });
  }

  /**
   * Update the spell preparation tracking and manage checkbox states
   * @private
   */
  _updateSpellPreparationTracking() {
    // TODO: Add special handling for cantrips - they should not count against
    // prepared spell limits and should have different visual treatment

    const preparedCheckboxes = this.element.querySelectorAll('input[type="checkbox"][data-uuid]:not([disabled])');
    const countDisplay = this.element.querySelector('.spell-prep-tracking');

    if (!countDisplay) return;

    // Count checked non-disabled checkboxes (excludes "always prepared" spells)
    let preparedCount = 0;
    preparedCheckboxes.forEach((checkbox) => {
      if (checkbox.checked) preparedCount++;
    });

    // Get the maximum from the context
    const maxPrepared = this?.spellPreparation?.maximum || 0;

    // Update the counter text using the span elements
    const currentCountEl = countDisplay.querySelector('.current-count');
    const maxCountEl = countDisplay.querySelector('.max-count');

    if (currentCountEl) currentCountEl.textContent = preparedCount;
    if (maxCountEl) maxCountEl.textContent = maxPrepared;

    // Add visual indicator when at/over max
    if (preparedCount >= maxPrepared) {
      countDisplay.classList.add('at-max');
    } else {
      countDisplay.classList.remove('at-max');
    }

    // Only apply limits if we have a valid maximum (avoid limiting when max is 0)
    if (maxPrepared > 0) {
      // Disable unchecked checkboxes when at maximum
      if (preparedCount >= maxPrepared) {
        // Add class to form to indicate we're at max spells
        this.element.classList.add('at-max-spells');

        preparedCheckboxes.forEach((checkbox) => {
          if (!checkbox.checked) {
            checkbox.disabled = true;
            // Add class to parent spell item for styling
            checkbox.closest('.spell-item')?.classList.add('max-prepared');
          }
        });
      } else {
        // Remove max spells class
        this.element.classList.remove('at-max-spells');

        // Re-enable all preparation checkboxes
        preparedCheckboxes.forEach((checkbox) => {
          checkbox.disabled = false;
          checkbox.closest('.spell-item')?.classList.remove('max-prepared');
        });
      }
    }
  }

  /**
   * Set up event listeners for all filter elements
   * @private
   */
  _setupFilterListeners() {
    // Text search (already handled separately, keeping for reference)
    const searchInput = this.element.querySelector('input[name="filter-name"]');
    if (searchInput) {
      searchInput.addEventListener('input', this._onSearchInput.bind(this));
    }

    // Add listeners to all dropdown selects (both filters and sort)
    const dropdowns = this.element.querySelectorAll('select[name^="filter-"], select[name="sort-by"]');
    dropdowns.forEach((dropdown) => {
      dropdown.addEventListener('change', () => {
        this._applyFilters();

        // Handle special case for sort-by
        if (dropdown.name === 'sort-by') {
          this._applySorting(dropdown.value);
        }
      });
    });

    // Add listeners to checkbox filters
    const checkboxes = this.element.querySelectorAll('input[type="checkbox"][name^="filter-"]');
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        this._applyFilters();
      });
    });

    // Add listeners to range input filters
    const rangeInputs = this.element.querySelectorAll('input[type="number"][name^="filter-"]');
    rangeInputs.forEach((input) => {
      input.addEventListener('input', () => {
        // Debounce filter application similar to search input
        clearTimeout(this._rangeTimer);
        this._rangeTimer = setTimeout(() => {
          this._applyFilters();
        }, 200); // 200ms debounce
      });
    });
  }

  /**
   * Handler for search input to ensure it's properly bound to this instance
   * @param {Event} event - The input event
   * @private
   */
  _onSearchInput(event) {
    if (!this._debouncedApplyFilters) {
      this._debouncedApplyFilters = foundry.utils.debounce(() => {
        this._applyFilters();
      }, 200);
    }
    this._debouncedApplyFilters();
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
   * Apply saved collapsed states after rendering
   * @private
   */
  _applyCollapsedLevels() {
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'collapsedSpellLevels') || [];

    for (const levelId of collapsedLevels) {
      const levelContainer = this.element.querySelector(`.spell-level[data-level="${levelId}"]`);
      if (levelContainer) {
        levelContainer.classList.add('collapsed');
      }
    }
  }

  /**
   * Update the spell counts for each level
   * @private
   */
  _updateSpellCounts() {
    const spellLevels = this.element.querySelectorAll('.spell-level');

    spellLevels.forEach((levelContainer) => {
      const spellItems = levelContainer.querySelectorAll('.spell-item');
      const checkboxes = levelContainer.querySelectorAll('input[type="checkbox"]');

      // Count only non-disabled checkboxes
      const totalAvailable = Array.from(checkboxes).filter((cb) => !cb.disabled).length;
      const preparedCount = Array.from(checkboxes).filter((cb) => !cb.disabled && cb.checked).length;

      // Update the count display
      const countDisplay = levelContainer.querySelector('.spell-count');
      if (countDisplay && totalAvailable > 0) {
        countDisplay.textContent = `(${preparedCount}/${totalAvailable})`;
      } else if (countDisplay) {
        countDisplay.textContent = '';
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
    log(3, 'filterSpells action triggered');
    this._applyFilters();
  }

  /**
   * Handle sorting selection
   * @param {Event} event - The change event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static sortSpells(event, form) {
    log(3, 'sortSpells action triggered');
    const sortBy = event.target.value;
    this._applySorting(sortBy);
  }

  /**
   * Handle form reset action
   * @param {Event} event - The reset event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static handleReset(event, form) {
    log(3, 'handleReset action triggered');

    // Give the browser time to reset the form elements
    setTimeout(() => {
      // Update all spell items to match their checkbox state
      const spellItems = this.element.querySelectorAll('.spell-item');
      spellItems.forEach((item) => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) {
          item.classList.remove('prepared-spell');
        }
      });

      // Reapply filters to ensure consistency
      this._applyFilters();

      // Update preparation tracking
      this._updateSpellPreparationTracking();
    }, 0);
  }

  /**
   * Handle spell level toggle action
   * @param {Event} event - The click event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static toggleSpellLevel(event, form) {
    // Find the parent spell-level container
    const levelContainer = form.parentElement;

    if (!levelContainer || !levelContainer.classList.contains('spell-level')) {
      return;
    }

    const levelId = levelContainer.dataset.level;

    // Toggle collapsed state
    levelContainer.classList.toggle('collapsed');

    // Save state to user flags
    const collapsedLevels = game.user.getFlag(MODULE.ID, 'collapsedSpellLevels') || [];
    const isCollapsed = levelContainer.classList.contains('collapsed');

    if (isCollapsed && !collapsedLevels.includes(levelId)) {
      collapsedLevels.push(levelId);
    } else if (!isCollapsed && collapsedLevels.includes(levelId)) {
      collapsedLevels.splice(collapsedLevels.indexOf(levelId), 1);
    }

    game.user.setFlag(MODULE.ID, 'collapsedSpellLevels', collapsedLevels);
  }

  /**
   * Show dialog to configure filters
   * @param {Event} event - The triggering event
   * @param {HTMLElement} form - The form element
   * @static
   */
  static configureFilters(event, form) {
    const filterConfig = new PlayerFilterConfiguration(this);
    filterConfig.render(true);
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
