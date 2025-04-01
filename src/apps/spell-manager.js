import { TEMPLATES } from '../constants.js';
import { Logger } from '../utils/logger.js';
import { getAllClasses, getAllSpells, getSpellSchools } from '../utils/spell-utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Spell Manager Application
 * Provides an interface for creating and managing spell lists for classes and subclasses
 * @class SpellManager
 */
export class SpellManager extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'spell-manager',
    tag: 'div',
    classes: ['spell-manager'],
    position: { width: 'auto', height: 'auto', top: '100' },
    window: {
      icon: 'fa-solid fa-book',
      resizable: false,
      minimizable: true
    },
    actions: {
      selectClass: SpellManager.selectClass,
      createSpellList: SpellManager.createSpellList,
      addSpell: SpellManager.addSpell,
      removeSpell: SpellManager.removeSpell,
      saveList: SpellManager.saveList,
      filterSpells: SpellManager.filterSpells
    }
  };

  /** @override */
  static PARTS = {
    classList: {
      template: TEMPLATES.SPELL_MANAGER_CLASS_LIST,
      classes: ['spell-manager-class-list', 'column']
    },
    spellList: {
      template: TEMPLATES.SPELL_MANAGER_SPELL_LIST,
      classes: ['spell-manager-spell-list', 'column']
    },
    spellFinder: {
      template: TEMPLATES.SPELL_MANAGER_SPELL_FINDER,
      classes: ['spell-manager-spell-finder', 'column']
    }
  };

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @constructor
   * @param {Object} options - Application options
   */
  constructor(options = {}) {
    super(options);

    // Initialize state with empty values
    this.classes = [];
    this.selectedClass = null;
    this.allSpells = [];
    this.filteredSpells = [];
    this.selectedSpells = [];
    this.existingLists = new Map();
    this.activeList = null;
    this.filterOptions = {
      name: '',
      level: 'all',
      school: 'all'
    };

    // Track initialization state
    this._initialized = false;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The window title for this application
   * @type {string}
   */
  get title() {
    if (this.selectedClass) {
      return `Spell List Manager: ${this.selectedClass.label}`;
    }
    return 'Spell List Manager';
  }

  /* -------------------------------------------- */
  /*  Public Methods                              */
  /* -------------------------------------------- */

  /**
   * Load a specific class spell list
   * @param {string} classId - ID of the class to load
   * @returns {Promise<void>}
   */
  async loadClass(classId) {
    // Find the class in our loaded classes
    const cls = this.classes.find((c) => c.id === classId);
    if (!cls) {
      ui.notifications.error(`Class with ID ${classId} not found.`);
      return;
    }

    // Set the active class
    this.selectedClass = cls;
    Logger.debug(`Selected class: ${cls.label} (${cls.id})`);

    // Check if a spell list exists for this class
    this.activeList = await this._findSpellListForClass(classId);

    if (this.activeList) {
      Logger.debug(`Found existing spell list: ${this.activeList.name} (${this.activeList.uuid})`);
      this.selectedSpells = await this._getSpellsFromJournal(this.activeList);
      Logger.debug(`Loaded ${this.selectedSpells.length} spells from journal`);
    } else {
      Logger.debug(`No existing spell list found for ${cls.label}`);
      this.selectedSpells = [];
    }

    this._filterSpells();

    // Refresh the display
    this.render();
  }

  /* -------------------------------------------- */
  /*  Private Methods                             */
  /* -------------------------------------------- */

  /**
   * Initialize the spell manager by loading classes and spells
   * @private
   */
  async _initialize() {
    try {
      // Load all classes
      const loadedClasses = await getAllClasses();
      this.classes = loadedClasses;
      Logger.debug(`Initialized classes: ${this.classes.length}`);

      // Load all spells from the system
      this.allSpells = await getAllSpells();
      this.filteredSpells = [...this.allSpells];

      // Find existing spell lists
      await this._findExistingSpellLists();

      Logger.debug(`Initialization complete with ${this.classes.length} classes and ${this.allSpells.length} spells`);
      return true;
    } catch (error) {
      Logger.error('Error initializing Spell Manager:', error);
      ui.notifications.error('Failed to initialize Spell List Manager');
      return false;
    }
  }

  /**
   * Find all existing spell list journals
   * @private
   * @returns {Promise<void>}
   */
  async _findExistingSpellLists() {
    // Search for journal entries that have pages with type "spells"
    const journals = game.journal.contents;

    for (const journal of journals) {
      for (const page of journal.pages.contents) {
        if (page.type === 'spells' && page.system?.type === 'class') {
          const classId = page.system.identifier;
          if (classId) {
            this.existingLists.set(classId, page.uuid);
          }
        }
      }
    }

    Logger.debug(`Found ${this.existingLists.size} existing spell lists`);
  }

  /**
   * Find a spell list journal page for a specific class
   * @private
   * @param {string} classId - The class identifier
   * @returns {Promise<JournalEntryPage|null>} - The journal entry page or null if not found
   */
  async _findSpellListForClass(classId) {
    const uuid = this.existingLists.get(classId);
    if (!uuid) {
      Logger.debug(`No spell list UUID found for class ID: ${classId}`);
      return null;
    }

    Logger.debug(`Found spell list UUID for class ${classId}: ${uuid}`);

    try {
      const page = await fromUuid(uuid);
      if (!page) {
        Logger.warn(`Could not resolve UUID ${uuid} to a journal page`);
        return null;
      }
      return page;
    } catch (error) {
      Logger.error(`Error loading spell list for class ${classId}:`, error);
      return null;
    }
  }

  /**
   * Get spells from a journal entry page
   * @private
   * @param {JournalEntryPage} page - The journal entry page
   * @returns {Promise<Array>} - Array of spell items
   */
  async _getSpellsFromJournal(page) {
    const spells = [];

    // Log the page details to debug
    Logger.debug(`Getting spells from journal page: ${page.name}`, page.system);

    // Check if the page has spells - handle both arrays and Sets
    if (page.system?.spells) {
      const spellEntries = page.system.spells;

      // Get count of spells - handle both array and Set
      const spellCount = Array.isArray(spellEntries) ? spellEntries.length : spellEntries.size;
      Logger.debug(`Journal has ${spellCount} spell UUIDs`);

      // Convert to array in case it's a Set
      const spellUuids = Array.isArray(spellEntries) ? spellEntries : Array.from(spellEntries);

      // Load each spell by UUID
      for (const spellUuid of spellUuids) {
        try {
          Logger.debug(`Loading spell with UUID: ${spellUuid}`);
          const spell = await fromUuid(spellUuid);
          if (spell) {
            spells.push(spell);
            Logger.debug(`Loaded spell: ${spell.name}`);
          } else {
            Logger.warn(`Spell with UUID ${spellUuid} not found`);
          }
        } catch (error) {
          Logger.warn(`Could not load spell with UUID ${spellUuid}:`, error);
        }
      }
    } else {
      Logger.debug('Journal page has no spells or spells property is missing');
    }

    return spells;
  }

  /**
   * Create a new spell list journal page for a class
   * @private
   * @param {string} classId - The class identifier
   * @param {string} className - The class name
   * @returns {Promise<JournalEntryPage>} - The created journal entry page
   */
  async _createSpellListJournal(classId, className) {
    // Create a new journal entry if needed
    let journal = game.journal.find((j) => j.name === 'Spell Lists');

    if (!journal) {
      journal = await JournalEntry.create({
        name: 'Spell Lists',
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
      });
    }

    // Create a new page with the spell list type
    const page = await JournalEntryPage.create(
      {
        name: `${className} Spells`,
        type: 'spells',
        system: {
          type: 'class',
          grouping: 'level',
          identifier: classId,
          spells: [],
          unlinkedSpells: []
        }
      },
      { parent: journal }
    );

    // Add to our map of existing lists
    this.existingLists.set(classId, page.uuid);

    return page;
  }

  /**
   * Filter spells based on current filter criteria
   * @private
   */
  _filterSpells() {
    const { name, level, school } = this.filterOptions;

    // Get IDs of spells currently in the selected list
    const selectedSpellIds = new Set(this.selectedSpells.map((s) => s.id));

    // Start with all spells not in the selected list
    this.filteredSpells = this.allSpells.filter((spell) => {
      // Skip spells already in the selected list
      if (selectedSpellIds.has(spell.id)) {
        return false;
      }

      // Filter by name
      if (name && !spell.name.toLowerCase().includes(name.toLowerCase())) {
        return false;
      }

      // Filter by level
      if (level !== 'all' && spell.system.level.toString() !== level) {
        return false;
      }

      // Filter by school
      if (school !== 'all' && spell.system.school !== school) {
        return false;
      }

      return true;
    });

    // Re-render the spell finder part only
    this.render(false, { parts: ['spellFinder'] });
  }

  /**
   * Update the spell list journal with the selected spells
   * @private
   * @param {JournalEntryPage} page - The journal entry page to update
   * @param {Array} spells - Array of spell items
   * @returns {Promise<JournalEntryPage>} - The updated journal entry page
   */
  async _updateSpellListJournal(page, spells) {
    // Get the UUIDs of the spells
    const spellUuids = spells.map((spell) => spell.uuid);

    // Update the page
    return page.update({
      system: {
        spells: spellUuids
      }
    });
  }

  /* -------------------------------------------- */
  /*  ApplicationV2 Methods                       */
  /* -------------------------------------------- */

  /**
   * Prepare context data for rendering the Spell Manager
   * @param {Object} options - Application render options
   * @returns {Object} Context data for the template
   * @protected
   * @override
   */
  _prepareContext(options) {
    // Prepare spell schools for filter dropdown
    const spellSchools = getSpellSchools();

    // Prepare spell levels
    const spellLevels = Array.from({ length: 10 }, (_, i) => {
      return {
        level: i.toString(),
        label: i === 0 ? game.i18n.localize('spell-book.ui.cantrips') : game.i18n.format('spell-book.ui.spellLevel', { level: i })
      };
    });

    // Mark classes that have spell lists
    const classesWithLists = this.classes.map((cls) => {
      return {
        ...cls,
        hasSpellList: this.existingLists.has(cls.id),
        isSelected: this.selectedClass?.id === cls.id
      };
    });

    Logger.debug(`Preparing context with ${classesWithLists.length} classes`, classesWithLists);

    // Organize filtered spells by level for display
    const spellsByLevel = {};
    for (let lvl = 0; lvl <= 9; lvl++) {
      const spellsOfLevel = this.filteredSpells.filter((s) => s.system.level === lvl);
      if (spellsOfLevel.length > 0) {
        spellsByLevel[lvl] = {
          level: lvl,
          label: lvl === 0 ? game.i18n.localize('spell-book.ui.cantrips') : game.i18n.format('spell-book.ui.spellLevel', { level: lvl }),
          spells: spellsOfLevel.sort((a, b) => a.name.localeCompare(b.name))
        };
      }
    }

    // Also organize selected spells by level
    const selectedByLevel = {};
    for (let lvl = 0; lvl <= 9; lvl++) {
      const spellsOfLevel = this.selectedSpells.filter((s) => s.system.level === lvl);
      if (spellsOfLevel.length > 0) {
        selectedByLevel[lvl] = {
          level: lvl,
          label: lvl === 0 ? game.i18n.localize('spell-book.ui.cantrips') : game.i18n.format('spell-book.ui.spellLevel', { level: lvl }),
          spells: spellsOfLevel.sort((a, b) => a.name.localeCompare(b.name))
        };
      }
    }

    // Prepare the context data
    const context = {
      classes: classesWithLists,
      selectedClass: this.selectedClass,
      activeList: this.activeList,
      allSpells: this.allSpells,
      filteredSpells: this.filteredSpells,
      selectedSpells: this.selectedSpells,
      spellsByLevel,
      selectedByLevel,
      filterOptions: this.filterOptions,
      spellSchools,
      spellLevels,
      config: CONFIG.DND5E
    };

    Logger.debug('Spell manager context prepared');
    return context;
  }

  /**
   * Prepare context data for a specific part
   * @param {string} partId - ID of the template part being rendered
   * @param {object} context - Shared context from _prepareContext
   * @returns {object} Modified context for the specific part
   * @protected
   * @override
   */
  _preparePartContext(partId, context) {
    // Add partId to context for potential use in templates
    context.partId = `${this.id}-${partId}`;

    return context;
  }

  /**
   * Actions performed after any render of the Application
   * @param {Object} context - Prepared context data
   * @param {Object} options - Provided render options
   * @protected
   * @override
   */
  _onRender(context, options) {
    // Load data on first render
    if (!this._initialized) {
      this._initialized = true;
      this._loadData();
    }

    // Set up search input
    const searchInput = this.element.querySelector('.spell-search');
    if (searchInput) {
      searchInput.addEventListener('input', this._onSearchFilter.bind(this));
    }

    Logger.debug('Spell manager rendered');
  }

  /**
   * Load all necessary data and re-render the application
   * @private
   */
  async _loadData() {
    try {
      Logger.debug('Loading spell manager data...');

      // Show loading indicators if needed
      this._showLoading();

      // Load classes
      this.classes = await getAllClasses();
      Logger.debug(`Loaded ${this.classes.length} classes`);

      // Load spells
      this.allSpells = await getAllSpells();
      this.filteredSpells = [...this.allSpells];
      Logger.debug(`Loaded ${this.allSpells.length} spells`);

      // Find existing spell lists
      await this._findExistingSpellLists();

      // Re-render with loaded data
      this.render(false, { parts: ['classList', 'spellFinder'] });

      Logger.debug('Data loading complete');
    } catch (error) {
      Logger.error('Error loading data:', error);
      ui.notifications.error('Failed to load spell manager data');
    }
  }

  /**
   * Show loading indicators in the UI
   * @private
   */
  _showLoading() {
    // Optionally add loading indicators to the UI
    const classListContent = this.element.querySelector('.class-list-content');
    if (classListContent) {
      classListContent.innerHTML = '<p class="loading"><i class="fas fa-spinner fa-spin"></i> Loading classes...</p>';
    }

    const spellFinderContent = this.element.querySelector('.spell-finder-content');
    if (spellFinderContent) {
      spellFinderContent.innerHTML = '<p class="loading"><i class="fas fa-spinner fa-spin"></i> Loading spells...</p>';
    }
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle spell search filtering
   * @param {Event} event - The originating input event
   * @private
   */
  _onSearchFilter(event) {
    const query = event.currentTarget.value;
    this.filterOptions.name = query;
    this._filterSpells();
  }

  /* -------------------------------------------- */
  /*  Static Action Handlers                      */
  /* -------------------------------------------- */

  /**
   * Handle selecting a class from the list
   * @param {Event} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static selectClass(event, target) {
    event.preventDefault();
    const app = this; // 'this' in static action handlers refers to the application instance
    const classId = target.closest('.class-item').dataset.classId;

    app.loadClass(classId);
  }

  /**
   * Handle creating a new spell list
   * @param {Event} event - The originating click event
   * @static
   */
  static async createSpellList(event) {
    event.preventDefault();
    const app = this;

    if (!app.selectedClass) {
      ui.notifications.warn('Please select a class first.');
      return;
    }

    try {
      const page = await app._createSpellListJournal(app.selectedClass.id, app.selectedClass.label);

      app.activeList = page;
      app.selectedSpells = [];

      ui.notifications.info(`Created new spell list for ${app.selectedClass.label}`);
      app.render();
    } catch (error) {
      Logger.error('Error creating spell list:', error);
      ui.notifications.error('Failed to create spell list.');
    }
  }

  /**
   * Handle adding a spell to the current list
   * @param {Event} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static addSpell(event, target) {
    event.preventDefault();
    const app = this;
    const spellId = target.closest('.spell-item').dataset.spellId;

    // Find the spell
    const spell = app.allSpells.find((s) => s.id === spellId);
    if (!spell) return;

    // Check if the spell is already selected
    if (app.selectedSpells.some((s) => s.id === spellId)) {
      ui.notifications.warn(`${spell.name} is already in the spell list.`);
      return;
    }

    // Add the spell to the selected list
    app.selectedSpells.push(spell);
    app.render(false, { parts: ['spellList'] });
    app._filterSpells();
  }

  /**
   * Handle removing a spell from the current list
   * @param {Event} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static removeSpell(event, target) {
    event.preventDefault();
    const app = this;
    const spellId = target.closest('.spell-item').dataset.spellId;

    // Remove the spell from the selected list
    app.selectedSpells = app.selectedSpells.filter((s) => s.id !== spellId);
    app.render(false, { parts: ['spellList'] });
    app._filterSpells();
  }

  /**
   * Handle saving the current spell list
   * @param {Event} event - The originating click event
   * @static
   */
  static async saveList(event) {
    event.preventDefault();
    const app = this;

    // Ensure we have a selected class
    if (!app.selectedClass) {
      ui.notifications.error('No class selected.');
      return;
    }

    try {
      // If no active list exists, create one
      if (!app.activeList) {
        app.activeList = await app._createSpellListJournal(app.selectedClass.id, app.selectedClass.label);
      }

      // Update the journal with the selected spells
      await app._updateSpellListJournal(app.activeList, app.selectedSpells);

      ui.notifications.info(`Spell list for ${app.selectedClass.label} saved successfully.`);
    } catch (error) {
      Logger.error('Error saving spell list:', error);
      ui.notifications.error('Failed to save spell list.');
    }
  }

  /**
   * Handle filtering spells
   * @param {Event} event - The originating change event
   * @param {HTMLElement} target - The changed element
   * @static
   */
  static filterSpells(event, target) {
    const app = this;
    const filter = target.dataset.filter;
    const value = target.value;

    if (filter && Object.prototype.hasOwnProperty.call(app.filterOptions, filter)) {
      app.filterOptions[filter] = value;
      app._filterSpells();
    }
  }
}
