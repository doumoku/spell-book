import { PACKS, TEMPLATES } from '../constants.js';
import { Logger } from '../utils/logger.js';
import { findSpellListInCompendium, getAllClasses, getAllSpells, getSpellSchools, loadSpellsFromUuids, saveSpellListToCompendium } from '../utils/spell-utils.js';
import { createUuidLink, enrichContent } from '../utils/ui-utils.js';

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

    // Clear existing selected spells
    this.selectedSpells = [];

    // Check if a spell list exists for this class
    this.activeList = await this._findSpellListForClass(classId);

    if (!this.activeList) {
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
   * Find all existing spell list journals
   * @private
   * @returns {Promise<void>}
   */
  async _findExistingSpellLists() {
    this.existingLists = new Map();

    // First check our module compendiums
    const packIds = [PACKS.CLASS, PACKS.SUBCLASS, PACKS.OTHER];

    for (const packId of packIds) {
      const packName = `spell-book.${packId}`;
      const pack = game.packs.get(packName);

      if (!pack) {
        Logger.warn(`Compendium ${packName} not found`);
        continue;
      }

      try {
        Logger.debug(`Checking compendium: ${packName}`);

        // Get the index
        const index = await pack.getIndex();

        // Check each journal
        for (const entry of index) {
          // Load the document to check its pages
          const document = await pack.getDocument(entry._id);

          // Check each page
          for (const page of document.pages.contents) {
            if (page.system && page.system.identifier) {
              this.existingLists.set(page.system.identifier, {
                uuid: page.uuid,
                source: 'compendium',
                pack: packName
              });
              Logger.debug(`Found spell list for ${page.system.identifier} in compendium`);
            }
          }
        }
      } catch (error) {
        Logger.error(`Error checking compendium ${packName}:`, error);
      }
    }

    // Also check world journals as a fallback
    const journals = game.journal.contents;

    for (const journal of journals) {
      for (const page of journal.pages.contents) {
        if (page.type === 'spells' && page.system?.type === 'class') {
          const classId = page.system.identifier;
          if (classId && !this.existingLists.has(classId)) {
            this.existingLists.set(classId, {
              uuid: page.uuid,
              source: 'world'
            });
            Logger.debug(`Found spell list for ${classId} in world journal`);
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
   * @returns {Promise<boolean>} - Whether a spell list exists
   */
  async _findSpellListForClass(classId) {
    try {
      // First check our compendiums
      const spellList = await findSpellListInCompendium('class', classId);

      if (spellList) {
        // Load the spells from the UUIDs
        this.selectedSpells = await loadSpellsFromUuids(spellList.spellUuids);
        Logger.debug(`Loaded ${this.selectedSpells.length} spells from compendium`);
        return true;
      }

      // If not found in our compendiums, check world journals
      Logger.debug(`No spell list found in compendiums, checking world journals for ${classId}`);

      // Search for journal entries that have pages with type "spells"
      const journals = game.journal.contents;

      for (const journal of journals) {
        for (const page of journal.pages.contents) {
          if (page.type === 'spells' && page.system?.type === 'class' && page.system.identifier === classId) {
            Logger.debug(`Found spell list in world journal: ${journal.name} / ${page.name}`);

            // Get the spells from the journal
            if (page.system?.spells) {
              const spellUuids = Array.isArray(page.system.spells) ? page.system.spells : Array.from(page.system.spells);

              this.selectedSpells = await loadSpellsFromUuids(spellUuids);
              Logger.debug(`Loaded ${this.selectedSpells.length} spells from world journal`);
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      Logger.error(`Error finding spell list for class ${classId}:`, error);
      return false;
    }
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
  async _prepareContext(options) {
    Logger.debug(`Preparing context with ${this.classes.length} classes`);
    this.classes.forEach((cls, index) => {
      Logger.debug(`Class ${index}: ${cls.label} (${cls.id}), hasUUID: ${Boolean(cls.uuid)}`);
    });

    // Prepare spell schools for filter dropdown
    const spellSchools = getSpellSchools();

    // Prepare spell levels
    const spellLevels = Array.from({ length: 10 }, (_, i) => {
      return {
        level: i.toString(),
        label: i === 0 ? game.i18n.localize('spell-book.ui.cantrips') : game.i18n.format('spell-book.ui.spellLevel', { level: i })
      };
    });

    // Mark classes that have spell lists and add UUID links
    const classesWithLists = [];
    for (const cls of this.classes) {
      const hasSpellList = this.existingLists.has(cls.id);
      const isSelected = this.selectedClass?.id === cls.id;

      let nameDisplay = cls.label;

      // Only try to create a UUID link if we have a UUID
      if (cls.uuid) {
        try {
          nameDisplay = await enrichContent(createUuidLink(cls));
        } catch (err) {
          Logger.warn(`Error creating UUID link for class ${cls.label}: ${err}`);
          nameDisplay = cls.label;
        }
      }

      classesWithLists.push({
        ...cls,
        hasSpellList,
        isSelected,
        nameDisplay
      });
    }

    // Organize filtered spells by level for display and add UUID links
    const spellsByLevel = {};
    for (let lvl = 0; lvl <= 9; lvl++) {
      const spellsOfLevel = this.filteredSpells.filter((s) => s.system.level === lvl);
      if (spellsOfLevel.length > 0) {
        // Create enriched spell entries
        const enrichedSpells = [];
        for (const spell of spellsOfLevel.sort((a, b) => a.name.localeCompare(b.name))) {
          enrichedSpells.push({
            ...spell,
            nameDisplay: await enrichContent(createUuidLink(spell))
          });
        }

        spellsByLevel[lvl] = {
          level: lvl,
          label: lvl === 0 ? game.i18n.localize('spell-book.ui.cantrips') : game.i18n.format('spell-book.ui.spellLevel', { level: lvl }),
          spells: enrichedSpells
        };
      }
    }

    // Also organize selected spells by level and add UUID links
    const selectedByLevel = {};
    for (let lvl = 0; lvl <= 9; lvl++) {
      const spellsOfLevel = this.selectedSpells.filter((s) => s.system.level === lvl);
      if (spellsOfLevel.length > 0) {
        // Create enriched spell entries
        const enrichedSpells = [];
        for (const spell of spellsOfLevel.sort((a, b) => a.name.localeCompare(b.name))) {
          enrichedSpells.push({
            ...spell,
            nameDisplay: await enrichContent(createUuidLink(spell))
          });
        }

        selectedByLevel[lvl] = {
          level: lvl,
          label: lvl === 0 ? game.i18n.localize('spell-book.ui.cantrips') : game.i18n.format('spell-book.ui.spellLevel', { level: lvl }),
          spells: enrichedSpells
        };
      }
    }

    // Selected class with UUID link
    let enrichedSelectedClass = null;
    if (this.selectedClass) {
      enrichedSelectedClass = {
        ...this.selectedClass,
        nameDisplay: await enrichContent(createUuidLink(this.selectedClass))
      };
    }

    // Prepare the context data
    const context = {
      classes: classesWithLists,
      selectedClass: enrichedSelectedClass,
      activeList: this.activeList,
      allSpells: this.allSpells,
      filteredSpells: this.filteredSpells,
      selectedSpells: this.selectedSpells,
      spellsByLevel,
      selectedByLevel,
      filterOptions: this.filterOptions,
      spellSchools,
      spellLevels,
      config: CONFIG.DND5E,
      hasSelectedSpells: this.selectedSpells.length > 0
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
      // Create an empty spell list in our compendium
      await saveSpellListToCompendium(
        'class', // type
        app.selectedClass.id, // identifier
        app.selectedClass.label, // name
        [] // empty spells array
      );

      app.activeList = true;
      app.selectedSpells = [];

      ui.notifications.info(`Created new spell list for ${app.selectedClass.label} in compendium`);
      app.render();
    } catch (error) {
      Logger.error('Error creating spell list:', error);
      ui.notifications.error('Failed to create spell list in compendium.');
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
      // Check if we have any spells to save
      if (app.selectedSpells.length === 0) {
        ui.notifications.warn('No spells selected to save.');
        return;
      }

      // Save to our module compendium
      await saveSpellListToCompendium(
        'class', // type
        app.selectedClass.id, // identifier
        app.selectedClass.label, // name
        app.selectedSpells // spells
      );

      ui.notifications.info(`Spell list for ${app.selectedClass.label} saved successfully to compendium.`);

      // Update the UI to show the list is saved
      app.activeList = true;
      app.render(false, { parts: ['spellList'] });
    } catch (error) {
      Logger.error('Error saving spell list:', error);
      ui.notifications.error('Failed to save spell list to compendium.');
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
