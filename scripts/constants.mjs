export const MODULE = {
  ID: 'spell-book',
  NAME: 'Spell Book',

  FLAGS: {
    PREPARED_SPELLS: 'preparedSpells',
    CUSTOM_LISTS: 'customLists'
  },

  TEMPLATES: {
    EXTENDED_COMPENDIUM: '',
    SPELL_LIST_MANAGER: '',
    SPELL_CARD: '',
    SPELL_FILTER: ''
  },

  LOG_LEVEL: 0,

  // This gets populated during initialization
  SPELLCASTING_CLASSES: {
    KNOWN: [],
    PACT: []
  }
};
