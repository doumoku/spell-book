import { MODULE } from './constants.js';
import { registerHooks } from './hooks.js';
import { registerSettings } from './settings.js';
import { Logger } from './utils/logger.js';

/**
 * Main module entry point
 * @module SpellBook
 */

// Create global reference for API access
globalThis.spellBook = globalThis.spellBook || {};

/**
 * Initialize the module
 */
Hooks.on('init', () => {
  Logger.debug(`Initializing ${MODULE.NAME}`);

  // Register module settings
  registerSettings();

  // Register module hooks
  registerHooks();

  Logger.debug(`${MODULE.NAME} initialized`);
});

// Export API for use by other modules
import * as SpellUtils from './utils/spell-utils.js';
import * as UIUtils from './utils/ui-utils.js';

// Setup API
globalThis.spellBook = {
  utils: {
    spells: SpellUtils,
    ui: UIUtils
  }
};
