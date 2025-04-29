/**
 * Contains hook registrations for the Spell Book module
 * @module spell-book/hooks
 */

import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import * as discoveryUtils from './helpers/spell-discovery.mjs';
import { registerDnD5eIntegration } from './integrations/dnd5e.mjs';
import { log } from './logger.mjs';

/**
 * Register all module hooks
 * Sets up UI elements and system integrations
 */
export function registerHooks() {
  try {
    // Register system-specific integrations
    registerDnD5eIntegration();

    // Set up character sheet integration
    Hooks.on('renderActorSheet5e', addSpellbookButton);
  } catch (error) {
    log(1, 'Error registering hooks:', error);
  }
}

/**
 * Adds the Spell Book button to character sheets
 * @param {ActorSheet5e} app - The rendered actor sheet
 * @param {HTMLElement} html - The HTML of the actor sheet
 * @param {Object} data - The data used to render the sheet
 */
function addSpellbookButton(app, html, data) {
  try {
    // Only add button for characters that can cast spells
    if (!discoveryUtils.canCastSpells(data.actor)) return;

    // Only target the spells tab
    const spellsTab = html.find('.tab.spells');
    if (!spellsTab.length) return;

    // Find the controls list
    const controlsList = spellsTab.find('ul.controls');
    if (!controlsList.length) return;

    // Create button element
    const button = createSpellBookButton(data.actor);

    // Create list item and add button
    const listItem = document.createElement('li');
    listItem.appendChild(button);

    // Append to the sheet controls
    controlsList.append(listItem);

    log(3, `Added spell book button to ${data.actor.name}'s character sheet`);
  } catch (error) {
    log(1, `Error adding spell book button to character sheet: ${error.message}`);
  }
}

/**
 * Creates a spell book button element
 * @param {Actor5e} actor - The actor associated with the button
 * @returns {HTMLElement} - The created button
 */
function createSpellBookButton(actor) {
  // Create the button
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'unbutton spell-book-button interface-only';
  button.setAttribute('data-tooltip', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.setAttribute('aria-label', game.i18n.localize('SPELLBOOK.UI.OpenSpellBook'));
  button.innerHTML = '<i class="fas fa-hat-wizard"></i>';

  // Add click event listener
  button.addEventListener('click', (ev) => {
    ev.preventDefault();
    try {
      const spellBook = new PlayerSpellBook(actor);
      spellBook.render(true);
    } catch (error) {
      log(1, `Error opening spell book: ${error.message}`);
      ui.notifications?.error(game.i18n.format('Failed to open spell book for {name}', { name: actor.name }));
    }
  });

  return button;
}
