/**
 * Constant for the module
 * @module spell-book
 */
export const MODULE = {
  /**
   * Unique identifier for the module.
   * @type {string}
   */
  ID: 'spell-book',

  /**
   * Display name of the module.
   * @type {string}
   */
  NAME: 'Spell Book',

  /**
   * Flags used for data storage and state tracking.
   * @type {Object}
   */
  FLAGS: {},

  /**
   * Handlebars template paths used by the module.
   * @type {Object}
   */
  TEMPLATES: {
    SPELL_BOOK_CONTENT: 'modules/spell-book/templates/spell-book.hbs',
    SPELL_BOOK_SIDEBAR: 'modules/spell-book/templates/spell-book-sidebar.hbs',
    SPELL_BOOK_LIST: 'modules/spell-book/templates/spell-book-list.hbs',
    SPELL_BOOK_FOOTER: 'modules/spell-book/templates/spell-book-footer.hbs',
    FILTER_CONFIG: 'modules/spell-book/templates/player-filter-configuration.hbs'
  },

  /**
   * Logging level for the module (0 = none, higher numbers = more verbose).
   * @type {number}
   */
  LOG_LEVEL: 0,

  /**
   * Collections of spellcasting classes categorized by type.
   * This gets populated during initialization.
   * @type {Object}
   */
  SPELLCASTING_CLASSES: {
    KNOWN: [],
    PACT: []
  },

  /**
   * Cache for storing frequently accessed data
   * @type {Object}
   */
  CACHE: {
    spellData: {},
    spellDataTime: {}
  }
};

/**
 * Default filter configuration
 * @type {Array}
 */
export const DEFAULT_FILTER_CONFIG = [
  {
    id: 'name',
    type: 'search',
    enabled: true,
    order: 10,
    label: 'SPELLBOOK.Filters.SearchPlaceholder',
    sortable: false // Keep search at the top
  },
  {
    id: 'level',
    type: 'dropdown',
    enabled: true,
    order: 20,
    label: 'SPELLBOOK.Filters.Level',
    sortable: true
  },
  {
    id: 'school',
    type: 'dropdown',
    enabled: true,
    order: 30,
    label: 'SPELLBOOK.Filters.School',
    sortable: true
  },
  {
    id: 'castingTime',
    type: 'dropdown',
    enabled: true,
    order: 40,
    label: 'SPELLBOOK.Filters.CastingTime',
    sortable: true
  },
  {
    id: 'range',
    type: 'range',
    enabled: true,
    order: 50,
    label: 'SPELLBOOK.Filters.Range',
    sortable: true
  },
  {
    id: 'damageType',
    type: 'dropdown',
    enabled: true,
    order: 60,
    label: 'SPELLBOOK.Filters.DamageType',
    sortable: true
  },
  {
    id: 'condition',
    type: 'dropdown',
    enabled: true,
    order: 70,
    label: 'SPELLBOOK.Filters.Condition',
    sortable: true
  },
  {
    id: 'requiresSave',
    type: 'dropdown',
    enabled: true,
    order: 80,
    label: 'SPELLBOOK.Filters.RequiresSave',
    sortable: true
  },
  {
    id: 'concentration',
    type: 'dropdown',
    enabled: true,
    order: 90,
    label: 'SPELLBOOK.Filters.RequiresConcentration',
    sortable: true
  },
  {
    id: 'prepared',
    type: 'checkbox',
    enabled: true,
    order: 100,
    label: 'SPELLBOOK.Filters.PreparedOnly',
    sortable: false // Keep checkboxes at the bottom
  },
  {
    id: 'ritual',
    type: 'checkbox',
    enabled: true,
    order: 110,
    label: 'SPELLBOOK.Filters.RitualOnly',
    sortable: false // Keep checkboxes at the bottom
  },
  {
    id: 'sortBy',
    type: 'dropdown',
    enabled: true,
    order: 120,
    label: 'SPELLBOOK.Filters.SortBy',
    sortable: false // Keep sort option at the bottom
  }
];
