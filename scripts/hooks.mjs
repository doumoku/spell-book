import { ExtendedCompendiumBrowser } from './apps/extended-compendium.mjs';
import { SpellListManager } from './apps/spell-list-manager.mjs';
import { MODULE } from './constants.mjs';
import { SpellUtils } from './helpers.mjs';

export function registerHooks() {
  /**
   * Register init hook - for setting up Handlebars helpers
   */
  Hooks.once('init', () => {
    console.log(`${MODULE.ID} | Initializing ${MODULE.NAME}`);

    // Register handlebars helpers
    Handlebars.registerHelper('isPrepared', function (uuid, preparedSpells) {
      return Array.isArray(preparedSpells) && preparedSpells.includes(uuid);
    });

    Handlebars.registerHelper('eq', function (a, b) {
      return a === b;
    });

    Handlebars.registerHelper('includes', function (array, value) {
      return Array.isArray(array) && array.includes(value);
    });

    Handlebars.registerHelper('capitalize', function (str) {
      if (typeof str !== 'string') return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    // Register module settings
    game.settings.register(MODULE.ID, 'enableAutoPrompt', {
      name: 'SPELLBOOK.Settings.EnableAutoPrompt.Name',
      hint: 'SPELLBOOK.Settings.EnableAutoPrompt.Hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });
  });

  /**
   * Register ready hook - for discovering spellcasting classes
   */
  Hooks.once('ready', async () => {
    // Discover all spellcasting classes
    await SpellUtils.discoverSpellcastingClasses();
  });

  /**
   * Hook into long rest completion to prompt for spell changes
   */
  Hooks.on('dnd5e.preRestCompleted', (actor, result) => {
    if (!game.settings.get(MODULE.ID, 'enableAutoPrompt')) return true;

    if (result.longRest && SpellUtils.canPrepareDifferentSpells(actor)) {
      // Prompt to change prepared spells
      new ExtendedCompendiumBrowser({ actor, mode: 'prepare' }).render(true);
      return false; // Pause rest completion until spell selection is done
    }
    return true;
  });

  /**
   * Add spell book button to character sheet
   */
  Hooks.on('renderActorSheet5e', (app, html, data) => {
    if (!SpellUtils.canCastSpells(data.actor)) return;

    // Only target the spells tab
    const spellsTab = html.find('.tab.spells');
    if (!spellsTab.length) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'spell-book-button gold-button';
    button.innerHTML = '<i class="fas fa-book-spells"></i>';

    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      new ExtendedCompendiumBrowser({ actor: data.actor }).render(true);
    });

    // Create a container for the button
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'spell-book-container';
    buttonContainer.appendChild(button);

    // Add the button container after the top section
    spellsTab.find('section.top').after(buttonContainer);
  });

  /**
   * Add button to scene controls for GMs to access spell list manager
   */
  Hooks.on('getSceneControlButtons', (controls) => {
    if (!game.user.isGM) return;

    const tokenTools = controls.find((c) => c.name === 'token');
    if (tokenTools) {
      tokenTools.tools.push({
        name: 'spell-list-manager',
        title: game.i18n.localize('SPELLBOOK.SpellListManager'),
        icon: 'fas fa-book-spells',
        button: true,
        onClick: () => {
          new SpellListManager().render(true);
        }
      });
    }
  });
}
