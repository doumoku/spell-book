import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { MODULE } from './constants.mjs';
import { discoverSpellcastingClasses } from './helpers.mjs';
import { registerHooks } from './hooks.mjs';
import { registerSettings } from './settings.mjs';

Hooks.once('init', async function () {
  log(1, `Initializing ${MODULE.NAME} module`);

  CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];
  CONFIG.Item.compendiumIndexFields = ['system.spellcasting.progression', 'system.spellcasting.preparation.mode'];

  // Register module hooks
  registerHooks();

  // Register module settings
  registerSettings();

  // Expose the PlayerSpellBook class for other modules
  MODULE.PlayerSpellBook = PlayerSpellBook;
});

Hooks.once('ready', async function () {
  // Initialize spell data
  await discoverSpellcastingClasses();

  // Register the module's compendium pack for use
  log(1, 'Module ready with compendium pack: custom-spell-lists');
});
