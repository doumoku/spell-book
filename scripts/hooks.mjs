import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { canCastSpells } from './helpers.mjs';

export function registerHooks() {
  /**
   * Hook into long rest completion to prompt for spell changes
   */
  // Hooks.on('dnd5e.preRestCompleted', (actor, result) => {
  //   if (!game.settings.get(MODULE.ID, 'enableAutoPrompt')) return true;

  //   if (result.longRest && canPrepareDifferentSpells(actor)) {
  //     // Prompt to change prepared spells
  //     new PlayerSpellBook(actor).render(true);
  //     return false; // Pause rest completion until spell selection is done
  //   }
  //   return true;
  // });

  /**
   * Add spell book button to character sheet
   */
  Hooks.on('renderActorSheet5e', (app, html, data) => {
    if (!canCastSpells(data.actor)) return;

    // Only target the spells tab
    const spellsTab = html.find('.tab.spells');
    if (!spellsTab.length) return;

    // Find the controls list
    const controlsList = spellsTab.find('ul.controls');
    if (!controlsList.length) return;

    // Create new list item element
    const listItem = document.createElement('li');

    // Create the button
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'unbutton spell-book-button interface-only';
    button.setAttribute('data-tooltip', 'Spell Book');
    button.setAttribute('aria-label', 'Open Spell Book');
    button.innerHTML = '<i class="fas fa-hat-wizard"></i>';

    // Add click event listener
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      const spellBook = new PlayerSpellBook(data.actor);
      spellBook.render(true);
    });

    // Add button to list item
    listItem.appendChild(button);

    // Append the new list item to the controls list
    controlsList.append(listItem);
  });
}
