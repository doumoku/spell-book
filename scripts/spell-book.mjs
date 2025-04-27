import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { MODULE } from './constants.mjs';
import { discoverSpellcastingClasses, initializeSpellCache } from './helpers.mjs';
import { registerHooks } from './hooks.mjs';
import { log } from './logger.mjs';
import { registerSettings } from './settings.mjs';

Hooks.once('init', async function () {
  log(3, `Initializing ${MODULE.NAME} module`);

  CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];

  // Define fields we need from spell items in compendiums
  CONFIG.Item.compendiumIndexFields = [
    // Basic identification
    '_id',
    'name',
    'type',
    'img',
    'uuid',
    'pack',

    // Core spell properties
    'system.level',
    'system.school',
    'system.preparation',
    'system.activation',
    'system.range',
    'system.duration',
    'system.description.value',
    'system.activities',

    // Formatted labels
    'labels.activation',
    'labels.range',
    'labels.school',
    'labels.components',
    'labels.damages',

    // Additional flags for lookup
    'flags.core.sourceId'
  ];

  // Register module hooks
  registerHooks();

  // Register module settings
  registerSettings();

  // Expose the PlayerSpellBook class for other modules
  MODULE.PlayerSpellBook = PlayerSpellBook;
  MODULE.LOG_LEVEL = game.settings.get(MODULE.ID, 'loggingLevel');
});

Hooks.once('ready', async function () {
  // Initialize spell data
  await discoverSpellcastingClasses();

  // Initialize the spell cache
  await initializeSpellCache();

  // Register the module's compendium pack for use
  log(3, 'Module ready with compendium pack: custom-spell-lists');
});
