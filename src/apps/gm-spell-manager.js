import { MODULE, PACKS, TEMPLATES } from '../constants.js';
import { Logger } from '../utils/logger.js';
import { getAllSpells } from '../utils/spell-utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM Spell List Manager Application
 * Provides an interface for GMs to create and manage spell lists for classes and subclasses
 * @class GMSpellManager
 */
export class GMSpellManager extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'gm-spell-manager',
    tag: 'div',
    classes: ['dnd5e', 'sheet', 'spell-manager'],
    width: 800,
    height: 750,
    resizable: true,
    title: 'Spell List Manager',
    actions: {
      addSpell: GMSpellManager.addSpell,
      removeSpell: GMSpellManager.removeSpell,
      saveList: GMSpellManager.saveList,
      createNewList: GMSpellManager.createNewList,
      deleteList: GMSpellManager.deleteList,
      filterSpells: GMSpellManager.filterSpells
    }
  };

  /** @override */
  static PARTS = {
    sidebar: {
      template: TEMPLATES.GM_SPELL_MANAGER_SIDEBAR,
      classes: ['spell-manager-sidebar']
    },
    content: {
      template: TEMPLATES.GM_SPELL_MANAGER_CONTENT,
      classes: ['spell-manager-content']
    },
    footer: {
      template: TEMPLATES.GM_SPELL_MANAGER_FOOTER,
      classes: ['spell-manager-footer']
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

    // Initialize state
    this.allSpells = [];
    this.filteredSpells = [];
    this.selectedSpells = [];
    this.spellLists = [];
    this.activeList = null;
    this.listType = options.listType || 'class'; // 'class', 'subclass', or 'other'
    this.filterOptions = {
      name: '',
      level: 'all',
      school: 'all',
      class: 'all'
    };

    // Load available spells and spell lists
    this._initialize();
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The window title for this application
   * @type {string}
   */
  get title() {
    if (this.activeList) {
      return `Spell List Manager: ${this.activeList.name}`;
    }
    return 'Spell List Manager';
  }

  /* -------------------------------------------- */
  /*  Public Methods                              */
  /* -------------------------------------------- */

  /**
   * Load a specific spell list
   * @param {string} listId - ID of the spell list to load
   * @returns {Promise<void>}
   */
  async loadList(listId) {
    // Find the list in our loaded lists
    const list = this.spellLists.find((l) => l.id === listId);
    if (!list) {
      ui.notifications.error(`Spell list with ID ${listId} not found.`);
      return;
    }

    // Set the active list
    this.activeList = list;
    this.selectedSpells = [...list.spells];

    // Refresh the display
    this.render();
  }

  /* -------------------------------------------- */
  /*  Private Methods                             */
  /* -------------------------------------------- */

  /**
   * Initialize the spell manager by loading spells and spell lists
   * @private
   */
  async _initialize() {
    try {
      // Load all spells from the system
      this.allSpells = await getAllSpells();
      this.filteredSpells = [...this.allSpells];

      // Load existing spell lists from the appropriate compendium
      await this._loadSpellLists();

      Logger.debug(`Initialized GM Spell Manager with ${this.allSpells.length} spells and ${this.spellLists.length} spell lists`);
    } catch (error) {
      Logger.error('Error initializing GM Spell Manager:', error);
      ui.notifications.error('Failed to initialize Spell List Manager');
    }
  }

  /**
   * Load spell lists from compendium packs
   * @private
   */
  async _loadSpellLists() {
    // Determine which pack to use based on list type
    let packId;
    switch (this.listType) {
      case 'class':
        packId = PACKS.CLASS;
        break;
      case 'subclass':
        packId = PACKS.SUBCLASS;
        break;
      case 'other':
        packId = PACKS.OTHER;
        break;
      default:
        packId = PACKS.CLASS;
    }

    // Get the compendium pack
    const pack = game.packs.get(`${MODULE.ID}.${packId}`);
    if (!pack) {
      Logger.error(`Compendium pack ${MODULE.ID}.${packId} not found`);
      return;
    }

    // Load the journal entries from the pack
    const entries = await pack.getDocuments();

    // Convert each journal entry to a spell list
    this.spellLists = entries.map((entry) => {
      // Parse the journal content
      let spells = [];
      try {
        // Extract spell IDs from the journal entry's content
        const content = entry.pages.contents[0]?.text?.content;
        if (content) {
          const data = JSON.parse(content);
          spells = data.spells || [];
        }
      } catch (error) {
        Logger.error(`Error parsing spell list ${entry.name}:`, error);
      }

      return {
        id: entry.id,
        name: entry.name,
        spells: spells,
        journalEntry: entry
      };
    });
  }

  /**
   * Filter spells based on current filter criteria
   * @private
   */
  _filterSpells() {
    const { name, level, school, class: spellClass } = this.filterOptions;

    // Start with all spells
    this.filteredSpells = this.allSpells.filter((spell) => {
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

      // Filter by class
      if (spellClass !== 'all') {
        const spellClasses = spell.system.tags?.classes || [];
        if (!spellClasses.includes(spellClass.toLowerCase())) {
          return false;
        }
      }

      return true;
    });

    // Re-render the content part only
    this.render(false, { parts: ['content'] });
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
    // Prepare the spell schools for the filter dropdown
    const spellSchools = Object.entries(CONFIG.DND5E.spellSchools).map(([id, label]) => {
      return { id, label };
    });

    // Prepare the spell classes for the filter dropdown
    const spellClasses = Object.entries(CONFIG.DND5E.classes).map(([id, config]) => {
      return { id, label: config.label };
    });

    // Prepare spell levels
    const spellLevels = Array.from({ length: 10 }, (_, i) => {
      return {
        level: i.toString(),
        label: i === 0 ? game.i18n.localize('spell-book.ui.cantrips') : game.i18n.format('spell-book.ui.spellLevel', { level: i })
      };
    });

    // Organize spells by level for display
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

    // Prepare the context data
    const context = {
      spellLists: this.spellLists,
      activeList: this.activeList,
      allSpells: this.allSpells,
      filteredSpells: this.filteredSpells,
      selectedSpells: this.selectedSpells,
      spellsByLevel,
      filterOptions: this.filterOptions,
      spellSchools,
      spellClasses,
      spellLevels,
      listType: this.listType,
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
    // Set up search input
    const searchInput = this.element.querySelector('.spell-search');
    if (searchInput) {
      searchInput.addEventListener('input', this._onSearchFilter.bind(this));
    }

    Logger.debug('Spell manager rendered');
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
   * Handle adding a spell to the current list
   * @param {Event} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static addSpell(event, target) {
    event.preventDefault();
    const app = this; // 'this' in static action handlers refers to the application instance
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
    app.render(false, { parts: ['content'] });
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
    app.render(false, { parts: ['content'] });
  }

  /**
   * Handle saving the current spell list
   * @param {Event} event - The originating click event
   * @static
   */
  static async saveList(event) {
    event.preventDefault();
    const app = this;

    // Ensure we have an active list
    if (!app.activeList) {
      ui.notifications.error('No active spell list to save.');
      return;
    }

    try {
      // Get spell IDs to save
      const spellIds = app.selectedSpells.map((s) => s.id);

      // Create the content for the journal entry
      const content = JSON.stringify({
        spells: spellIds,
        lastUpdated: Date.now()
      });

      // Update the journal entry
      await app.activeList.journalEntry.update({
        'name': app.activeList.name,
        'pages.0.text.content': content
      });

      // Update our local data
      app.activeList.spells = [...app.selectedSpells];

      ui.notifications.info(`Spell list "${app.activeList.name}" saved successfully.`);
    } catch (error) {
      Logger.error('Error saving spell list:', error);
      ui.notifications.error('Failed to save spell list.');
    }
  }

  /**
   * Handle creating a new spell list
   * @param {Event} event - The originating click event
   * @static
   */
  static async createNewList(event) {
    event.preventDefault();
    const app = this;

    // Prompt for the new list name
    const name = await Dialog.prompt({
      title: 'New Spell List',
      content: `
        <form>
          <div class="form-group">
            <label>List Name:</label>
            <input type="text" name="listName" placeholder="e.g., Wizard Class Spells">
          </div>
        </form>
      `,
      label: 'Create',
      callback: (html) => html.find('input[name="listName"]').val(),
      rejectClose: false
    });

    if (!name) return;

    try {
      // Determine which pack to use based on list type
      let packId;
      switch (app.listType) {
        case 'class':
          packId = PACKS.CLASS;
          break;
        case 'subclass':
          packId = PACKS.SUBCLASS;
          break;
        case 'other':
          packId = PACKS.OTHER;
          break;
        default:
          packId = PACKS.CLASS;
      }

      // Get the compendium pack
      const pack = game.packs.get(`${MODULE.ID}.${packId}`);
      if (!pack) {
        Logger.error(`Compendium pack ${MODULE.ID}.${packId} not found`);
        return;
      }

      // Create initial content
      const content = JSON.stringify({
        spells: [],
        lastUpdated: Date.now()
      });

      // Create a new journal entry
      const journalData = {
        name,
        pages: [
          {
            name: 'Spell List',
            type: 'text',
            text: {
              content,
              format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
            }
          }
        ]
      };

      const journalEntry = await JournalEntry.create(journalData, { pack: pack.collection });

      // Add the new list to our local data
      const newList = {
        id: journalEntry.id,
        name,
        spells: [],
        journalEntry
      };

      app.spellLists.push(newList);

      // Set it as the active list
      app.activeList = newList;
      app.selectedSpells = [];

      // Refresh the display
      app.render();

      ui.notifications.info(`Spell list "${name}" created successfully.`);
    } catch (error) {
      Logger.error('Error creating spell list:', error);
      ui.notifications.error('Failed to create spell list.');
    }
  }

  /**
   * Handle deleting a spell list
   * @param {Event} event - The originating click event
   * @static
   */
  static async deleteList(event) {
    event.preventDefault();
    const app = this;

    // Ensure we have an active list
    if (!app.activeList) {
      ui.notifications.error('No active spell list to delete.');
      return;
    }

    // Confirm deletion
    const confirmed = await Dialog.confirm({
      title: 'Delete Spell List',
      content: `<p>Are you sure you want to delete the spell list "${app.activeList.name}"? This cannot be undone.</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!confirmed) return;

    try {
      // Delete the journal entry
      await app.activeList.journalEntry.delete();

      // Remove from our local data
      app.spellLists = app.spellLists.filter((l) => l.id !== app.activeList.id);

      // Clear the active list
      app.activeList = null;
      app.selectedSpells = [];

      // Refresh the display
      app.render();

      ui.notifications.info('Spell list deleted successfully.');
    } catch (error) {
      Logger.error('Error deleting spell list:', error);
      ui.notifications.error('Failed to delete spell list.');
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
