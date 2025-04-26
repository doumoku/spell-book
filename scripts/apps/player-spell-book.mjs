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
      const spellLevels = await organizeSpellsByLevel(spellItems, this.actor);

      // Store the context for access by other methods
      this.context = context;

      // Sort spells within each level based on current sort setting
      const sortBy = this._getFilterState().sortBy || 'level';
      for (const level of spellLevels) {
        level.spells = this._sortSpells(level.spells, sortBy);
      }

      // Process each level to create enriched content
      for (const level of spellLevels) {
        let failedUUIDs = [];
        for (const spell of level.spells) {
          // Store the original compendium UUID on the spell
          const uuid = spell.compendiumUuid || spell.uuid || spell?._stats?.compendiumSource;
          if (!uuid) {
            failedUUIDs.push(spell);
          }

          // Create enriched HTML with the correct UUID
          let enrichedHTML = await TextEditor.enrichHTML(`@UUID[${uuid}]{${spell.name}}`, { async: true });

          // Extract just the icon and make it a clickable link
          const iconImg = `<img src="${spell.img}" class="spell-icon" alt="${spell.name} icon">`;

          // Replace the default icon with our custom one, but keep the link structure
          const linkMatch = enrichedHTML.match(/<a[^>]*>(.*?)<\/a>/);
          let enrichedIcon = '';

          if (linkMatch) {
            // Extract the <a> tag attributes
            const linkOpenTag = enrichedHTML.match(/<a[^>]*>/)[0];
            // Create a new link with just the icon
            enrichedIcon = `${linkOpenTag}${iconImg}</a>`;
          } else {
            // Fallback if link extraction fails
            enrichedIcon = `<a class="content-link" data-uuid="${uuid}">${iconImg}</a>`;
          }

          spell.enrichedIcon = enrichedIcon;
          spell.formattedDetails = formatSpellDetails(spell);
        }
        if (failedUUIDs.length > 0) {
          log(2, 'Some spells failed UUID check:', failedUUIDs);
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

      // Prepare filter dropdowns and checkboxes
      context.filterDropdowns = this._prepareFilterDropdowns();
      context.filterCheckboxes = this._prepareFilterCheckboxes();

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

      // Set up filter event handlers for immediate response
      this._setupFilterListeners();

      // Set up spell preparation checkbox listeners
      this._setupPreparationListeners();

      // Set sidebar state based on user preference
      const sidebarCollapsed = game.user.getFlag(MODULE.ID, 'sidebarCollapsed');
      if (sidebarCollapsed) {
        this.element.classList.add('sidebar-collapsed');
        this._positionFooter();
      }

      // Always apply filters to ensure initial state is correct
      this._applyFilters();

      // Initialize spell preparation tracking state
      this._updateSpellPreparationTracking();
    } catch (error) {
      log(1, 'Error in _onRender:', error);
    }
  }

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
    const maxPrepared = this.context?.spellPreparation?.maximum || 0;

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
  }

  /**
   * Handler for search input to ensure it's properly bound to this instance
   * @param {Event} event - The input event
   * @private
   */
  _onSearchInput(event) {
    // Debounce text search for better performance
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this._applyFilters();
    }, 200); // 200ms debounce
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
   * Prepare filter dropdown options
   * @returns {Array} - Array of filter dropdown objects
   * @private
   */
  _prepareFilterDropdowns() {
    const filters = this._getFilterState();
    const dropdowns = [];

    // Spell Level dropdown
    const levelOptions = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];

    // Add options for each spell level found
    this.context.spellLevels.forEach((level) => {
      let levelLabel;
      if (level.level === '0') {
        levelLabel = game.i18n.localize('SPELLBOOK.Filters.Cantrip');
      } else {
        // Format as 1st, 2nd, 3rd, 4th, etc.
        const levelNum = parseInt(level.level);
        let suffix;

        if (levelNum === 1) suffix = 'st';
        else if (levelNum === 2) suffix = 'nd';
        else if (levelNum === 3) suffix = 'rd';
        else suffix = 'th';

        levelLabel = `${levelNum}${suffix} Level`;
      }

      levelOptions.push({
        value: level.level,
        label: levelLabel,
        selected: filters.level === level.level
      });
    });

    dropdowns.push({
      name: 'filter-level',
      filter: 'level',
      label: game.i18n.localize('SPELLBOOK.Filters.Level'),
      options: levelOptions
    });

    // School dropdown
    const schoolOptions = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];

    // Add options for each spell school
    Object.entries(CONFIG.DND5E.spellSchools).forEach(([key, school]) => {
      schoolOptions.push({
        value: key,
        label: school.label,
        selected: filters.school === key
      });
    });

    dropdowns.push({
      name: 'filter-school',
      filter: 'school',
      label: game.i18n.localize('SPELLBOOK.Filters.School'),
      options: schoolOptions
    });

    // Casting Time dropdown
    const castingTimeOptions = [
      { value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') },
      { value: 'action:1', label: game.i18n.localize('SPELLBOOK.Filters.Action') },
      { value: 'bonus:1', label: game.i18n.localize('SPELLBOOK.Filters.BonusAction') },
      { value: 'reaction:1', label: game.i18n.localize('SPELLBOOK.Filters.Reaction') },
      { value: 'minute:1', label: game.i18n.localize('SPELLBOOK.Filters.Minute') },
      { value: 'minute:10', label: game.i18n.localize('SPELLBOOK.Filters.Minutes10') },
      { value: 'hour:1', label: game.i18n.localize('SPELLBOOK.Filters.Hour') },
      { value: 'hour:8', label: game.i18n.localize('SPELLBOOK.Filters.Hours8') },
      { value: 'hour:12', label: game.i18n.localize('SPELLBOOK.Filters.Hours12') },
      { value: 'hour:24', label: game.i18n.localize('SPELLBOOK.Filters.Day') }
    ];

    dropdowns.push({
      name: 'filter-casting-time',
      filter: 'castingTime',
      label: game.i18n.localize('SPELLBOOK.Filters.CastingTime'),
      options: castingTimeOptions.map((option) => ({
        ...option,
        selected: filters.castingTime === option.value
      }))
    });

    // Range dropdown
    const rangeOptions = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];

    // Add options for each distance unit
    Object.entries(CONFIG.DND5E.distanceUnits).forEach(([key, label]) => {
      rangeOptions.push({
        value: key,
        label: label,
        selected: filters.range === key
      });
    });

    dropdowns.push({
      name: 'filter-range',
      filter: 'range',
      label: game.i18n.localize('SPELLBOOK.Filters.Range'),
      options: rangeOptions
    });

    // Damage Type dropdown
    const damageTypeOptions = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];

    // Add options for each damage type
    Object.entries(CONFIG.DND5E.damageTypes).forEach(([key, damageType]) => {
      damageTypeOptions.push({
        value: key,
        label: damageType.label,
        selected: filters.damageType === key
      });
    });

    dropdowns.push({
      name: 'filter-damage-type',
      filter: 'damageType',
      label: game.i18n.localize('SPELLBOOK.Filters.DamageType'),
      options: damageTypeOptions
    });

    // Conditions dropdown
    const conditionOptions = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];

    // Add options for each condition type
    Object.entries(CONFIG.DND5E.conditionTypes).forEach(([key, condition]) => {
      conditionOptions.push({
        value: key,
        label: condition.label,
        selected: filters.condition === key
      });
    });

    dropdowns.push({
      name: 'filter-condition',
      filter: 'condition',
      label: game.i18n.localize('SPELLBOOK.Filters.Condition'),
      options: conditionOptions
    });

    // Save Required dropdown
    const saveOptions = [
      { value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') },
      { value: 'true', label: game.i18n.localize('SPELLBOOK.Filters.True'), selected: filters.requiresSave === 'true' },
      { value: 'false', label: game.i18n.localize('SPELLBOOK.Filters.False'), selected: filters.requiresSave === 'false' }
    ];

    dropdowns.push({
      name: 'filter-requires-save',
      filter: 'requiresSave',
      label: game.i18n.localize('SPELLBOOK.Filters.RequiresSave'),
      options: saveOptions
    });

    // Concentration dropdown
    const concentrationOptions = [
      { value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') },
      { value: 'true', label: game.i18n.localize('SPELLBOOK.Filters.True'), selected: filters.concentration === 'true' },
      { value: 'false', label: game.i18n.localize('SPELLBOOK.Filters.False'), selected: filters.concentration === 'false' }
    ];

    dropdowns.push({
      name: 'filter-concentration',
      filter: 'concentration',
      label: game.i18n.localize('SPELLBOOK.Filters.Concentration'),
      options: concentrationOptions
    });

    // Sort dropdown (not a filter, but fits the same UI pattern)
    const sortOptions = [
      { value: 'level', label: game.i18n.localize('SPELLBOOK.Sort.ByLevel'), selected: filters.sortBy === 'level' },
      { value: 'name', label: game.i18n.localize('SPELLBOOK.Sort.ByName'), selected: filters.sortBy === 'name' },
      { value: 'school', label: game.i18n.localize('SPELLBOOK.Sort.BySchool'), selected: filters.sortBy === 'school' },
      { value: 'prepared', label: game.i18n.localize('SPELLBOOK.Sort.ByPrepared'), selected: filters.sortBy === 'prepared' }
    ];

    dropdowns.push({
      name: 'sort-by',
      filter: 'sortBy',
      label: game.i18n.localize('SPELLBOOK.Filters.SortBy'),
      options: sortOptions
    });

    return dropdowns;
  }

  /**
   * Prepare filter checkbox options
   * @returns {Array} - Array of filter checkbox objects
   * @private
   */
  _prepareFilterCheckboxes() {
    const filters = this._getFilterState();

    return [
      {
        name: 'filter-prepared',
        filter: 'prepared',
        label: game.i18n.localize('SPELLBOOK.Filters.PreparedOnly'),
        checked: filters.prepared
      },
      {
        name: 'filter-ritual',
        filter: 'ritual',
        label: game.i18n.localize('SPELLBOOK.Filters.RitualOnly'),
        checked: filters.ritual
      }
    ];
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
        castingTime: '',
        range: '',
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
      castingTime: this.element.querySelector('[name="filter-casting-time"]')?.value || '',
      range: this.element.querySelector('[name="filter-range"]')?.value || '',
      damageType: this.element.querySelector('[name="filter-damage-type"]')?.value || '',
      condition: this.element.querySelector('[name="filter-condition"]')?.value || '',
      requiresSave: this.element.querySelector('[name="filter-requires-save"]')?.value || '',
      prepared: this.element.querySelector('[name="filter-prepared"]')?.checked || false,
      ritual: this.element.querySelector('[name="filter-ritual"]')?.checked || false,
      concentration: this.element.querySelector('[name="filter-concentration"]')?.value || '',
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
        // Extract basic spell metadata
        const nameEl = item.querySelector('.spell-name');
        const detailsEl = item.querySelector('.spell-details');
        const name = nameEl?.textContent.toLowerCase() || '';
        const details = detailsEl?.textContent.toLowerCase() || '';
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
          if (castingTimeType !== filterType || castingTimeValue !== filterValue) {
            visible = false;
          }
        }

        // Range filter
        if (filters.range && rangeUnits !== filters.range) {
          visible = false;
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
