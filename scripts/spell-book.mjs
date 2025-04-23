import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { MODULE } from './constants.mjs';
import { discoverSpellcastingClasses } from './helpers.mjs';
import { registerHooks } from './hooks.mjs';

Hooks.once('init', async function () {
  console.log(`${MODULE.ID} | Initializing ${MODULE.NAME} module`);

  CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];
  CONFIG.Item.compendiumIndexFields = ['system.spellcasting.progression', 'system.spellcasting.preparation.mode'];

  // Register module hooks
  registerHooks();

  // Expose the PlayerSpellBook class for other modules
  MODULE.PlayerSpellBook = PlayerSpellBook;
});

Hooks.once('ready', async function () {
  // Initialize spell data
  await discoverSpellcastingClasses();

  // Register the module's compendium pack for use
  console.log(`${MODULE.ID} | Module ready with compendium pack: custom-spell-lists`);
});
