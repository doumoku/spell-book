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
  GM_SPELL_MANAGER: `modules/${MODULE.ID}/templates/gm-spell-manager.hbs`,
  PLAYER_SPELL_BOOK: `modules/${MODULE.ID}/templates/player-spell-book.hbs`,
  SPELL_SELECTOR: `modules/${MODULE.ID}/templates/spell-selector.hbs`,
  SETTINGS: `modules/${MODULE.ID}/templates/settings.hbs`,

  // Player Spell Book Templates
  SPELL_BOOK_HEADER: `modules/${MODULE.ID}/templates/spell-book-header.hbs`,
  SPELL_BOOK_CONTENT: `modules/${MODULE.ID}/templates/spell-book-content.hbs`,
  SPELL_BOOK_FOOTER: `modules/${MODULE.ID}/templates/spell-book-footer.hbs`,

  // GM Spell Manager Templates
  GM_SPELL_MANAGER_SIDEBAR: `modules/${MODULE.ID}/templates/gm-spell-manager-sidebar.hbs`,
  GM_SPELL_MANAGER_CONTENT: `modules/${MODULE.ID}/templates/gm-spell-manager-content.hbs`,
  GM_SPELL_MANAGER_FOOTER: `modules/${MODULE.ID}/templates/gm-spell-manager-footer.hbs`
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
