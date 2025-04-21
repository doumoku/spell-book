export const MODULE = {
  ID: 'spell-book',
  NAME: 'Spell Book',

  FLAGS: {
    PREPARED_SPELLS: 'preparedSpells',
    CUSTOM_LISTS: 'customLists'
  },

  TEMPLATES: {
    EXTENDED_COMPENDIUM: 'modules/spell-book/templates/extended-compendium.hbs',
    SPELL_LIST_MANAGER: 'modules/spell-book/templates/spell-list-manager.hbs',
    SPELL_CARD: 'modules/spell-book/templates/partials/spell-card.hbs',
    SPELL_FILTER: 'modules/spell-book/templates/partials/spell-filter.hbs'
  },

  // This gets populated during initialization
  SPELLCASTING_CLASSES: {
    PREPARED: [],
    KNOWN: [],
    PACT: []
  }
};
