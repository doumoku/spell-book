import { MODULE } from './constants.mjs';

export function registerSettings() {
  game.settings.register(MODULE.ID, 'loggingLevel', {
    name: 'SPELLBOOK.Settings.Logger.Name',
    hint: 'SPELLBOOK.Settings.Logger.Hint',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      0: 'SPELLBOOK.Settings.Logger.Choices.Off',
      1: 'SPELLBOOK.Settings.Logger.Choices.Errors',
      2: 'SPELLBOOK.Settings.Logger.Choices.Warnings',
      3: 'SPELLBOOK.Settings.Logger.Choices.Verbose'
    },
    default: 2
  });

  game.settings.register(MODULE.ID, 'enableRestPrompt', {
    name: 'SPELLBOOK.Settings.EnableRestPrompt.Name',
    hint: 'SPELLBOOK.Settings.EnableRestPrompt.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });
}
