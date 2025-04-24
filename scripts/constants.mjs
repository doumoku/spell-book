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
    /**
     * Path to the main spell book content template.
     * @type {string}
     */
    SPELL_BOOK_CONTENT: 'modules/spell-book/templates/spell-book.hbs',

    /**
     * Path to the spell book footer template.
     * @type {string}
     */
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
    /**
     * Classes that use known spells casting mechanics.
     * @type {Array<string>}
     */
    KNOWN: [],

    /**
     * Classes that use pact magic casting mechanics.
     * @type {Array<string>}
     */
    PACT: []
  }
};
