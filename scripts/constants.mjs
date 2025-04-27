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
    SPELL_BOOK_FOOTER: 'modules/spell-book/templates/spell-book-footer.hbs'
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
  },

  /**
   * Global spell cache for storing indexed spell data
   * @type {Object}
   */
  SPELL_CACHE: {
    initialized: false,
    byUuid: {},
    byId: {},
    byName: {},
    enrichedIcons: {}
  }
};
