// scripts/hooks.mjs
import { ExtendedCompendiumBrowser } from './apps/extended-compendium.mjs';
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
    // Only add button for spellcasting characters
    if (!SpellUtils.canCastSpells(data.actor)) return;

    const spellbookButton = $(`
      <button type="button" class="spell-book-button">
        <i class="fas fa-book-spells"></i> ${game.i18n.localize('SPELLBOOK.Title')}
      </button>
    `);

    // Insert in appropriate location based on sheet type
    html.find('.sheet-header .attributes').append(spellbookButton);

    // Add click handler
    spellbookButton.click((ev) => {
      ev.preventDefault();
      new ExtendedCompendiumBrowser({ actor: data.actor }).render(true);
    });
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
          // We'll implement the SpellListManager in a future step
          ui.notifications.info(game.i18n.localize('SPELLBOOK.ComingSoon'));
        }
      });
    }
  });
}
