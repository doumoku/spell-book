/**
 * Module constants and configuration
 * @module SpellBook.Constants
 */

export const MODULE = {
  ID: 'spell-book',
  NAME: 'Spell Book',
  FLAGS: {
    PREPARED_SPELLS: 'preparedSpells'
  }
};

export const PACKS = {
  CLASS: 'sb-class-spell-books',
  SUBCLASS: 'sb-subclass-spell-books',
  OTHER: 'sb-other-spell-books'
};

export const TEMPLATES = {
  SPELL_MANAGER: `modules/${MODULE.ID}/templates/spell-manager.hbs`,
  SPELL_MANAGER_CLASS_LIST: `modules/${MODULE.ID}/templates/spell-manager-class-list.hbs`,
  SPELL_MANAGER_SPELL_LIST: `modules/${MODULE.ID}/templates/spell-manager-spell-list.hbs`,
  SPELL_MANAGER_SPELL_FINDER: `modules/${MODULE.ID}/templates/spell-manager-spell-finder.hbs`,

  // Keep existing templates for player spell book
  SPELL_BOOK_HEADER: `modules/${MODULE.ID}/templates/spell-book-header.hbs`,
  SPELL_BOOK_CONTENT: `modules/${MODULE.ID}/templates/spell-book-content.hbs`,
  SPELL_BOOK_FOOTER: `modules/${MODULE.ID}/templates/spell-book-footer.hbs`
};

/**
 * Default module settings
 */
export const SETTINGS = {
  LOG_LEVEL: {
    key: 'logLevel',
    options: {
      0: 'None',
      1: 'Errors',
      2: 'Warnings',
      3: 'Debug'
    },
    default: 2
  }
};
