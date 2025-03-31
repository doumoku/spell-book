import { MODULE, SETTINGS } from './constants.js';
import { Logger } from './utils/logger.js';

/**
 * Register module settings
 * @function registerSettings
 */
export function registerSettings() {
  // Register log level setting
  game.settings.register(MODULE.ID, SETTINGS.LOG_LEVEL.key, {
    name: 'Log Level',
    hint: 'How verbose the console logs should be',
    scope: 'client',
    config: true,
    type: Number,
    choices: SETTINGS.LOG_LEVEL.options,
    default: SETTINGS.LOG_LEVEL.default,
    onChange: (value) => {
      Logger.LOG_LEVEL = value;
      Logger.debug(`Log level changed to ${value}`);
    }
  });

  // Initialize logger with settings value
  Logger.LOG_LEVEL = game.settings.get(MODULE.ID, SETTINGS.LOG_LEVEL.key);
}
