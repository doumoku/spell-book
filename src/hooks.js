import { MODULE } from './constants.js';
import { Logger } from './utils/logger.js';
import { addSpellBookButton } from './utils/ui-utils.js';

/**
 * Register Foundry VTT hooks
 * @module SpellBook.Hooks
 */

/**
 * Register all module hooks
 */
export function registerHooks() {
  Logger.debug('Registering hooks');

  // Add spell book button to character sheets
  Hooks.on('renderActorSheet5e', (app, html, data) => {
    // Only add to character sheets, not NPC sheets
    if (app.actor.type === 'character') {
      addSpellBookButton(app, html);
    }
  });

  // Initialize module when ready
  Hooks.once('ready', () => {
    Logger.debug(`${MODULE.NAME} is ready!`);
  });
}
