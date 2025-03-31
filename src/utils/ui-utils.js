import { PlayerSpellBook } from '../apps/player-spell-book.js';
import { Logger } from './logger.js';

/**
 * Add a spell book button to a character sheet
 * @param {Application} app - The character sheet application
 * @param {jQuery} html - The jQuery object for the sheet HTML
 */
export function addSpellBookButton(app, html) {
  // Check if the sheet has a spells tab
  const spellsTab = html.find('.tab.spells');
  if (spellsTab.length === 0) {
    Logger.debug('No spells tab found on sheet, skipping button addition');
    return;
  }

  // Find a good place to add the button, usually near the top of the spells tab
  let buttonTarget = spellsTab.find('.spellbook-header, .spellcasting-ability, .spells-overview').first();

  if (buttonTarget.length === 0) {
    Logger.debug('Could not find target element for button, attempting fallback');
    // Fallback to simply adding at top of spells tab
    buttonTarget = spellsTab;
  }

  // Create the button HTML
  const button = $(`
    <div class="spell-book-button">
      <button type="button" data-action="spell-book">
        <i class="fas fa-book"></i> Spell Book
      </button>
    </div>
  `);

  // Add the button to the sheet
  buttonTarget.prepend(button);

  // Add event listener
  button.find('button').on('click', (event) => {
    event.preventDefault();
    openSpellBook(app.actor);
  });

  Logger.debug('Added spell book button to character sheet');
}

/**
 * Open the spell book interface for an actor
 * @param {Actor} actor - The actor to open the spell book for
 */
export function openSpellBook(actor) {
  Logger.debug(`Opening spell book for ${actor.name}`);

  try {
    // Create and render the spell book application
    const spellBook = new PlayerSpellBook(actor);
    spellBook.render(true);
  } catch (err) {
    Logger.error(`Error opening spell book: ${err}`);
    ui.notifications.error('Error opening spell book');
  }
}

/**
 * Open the GM spell manager interface
 * @param {string} [listType='class'] - Type of spell list to manage ('class', 'subclass', or 'other')
 */
export function openGMSpellManager(listType = 'class') {
  // Check if the user is a GM
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize('spell-book.notifications.gmOnly'));
    return;
  }

  Logger.debug(`Opening GM spell manager for ${listType} lists`);

  import('../apps/gm-spell-manager.js')
    .then((module) => {
      const GMSpellManager = module.GMSpellManager;
      const manager = new GMSpellManager({ listType });
      manager.render(true);
    })
    .catch((err) => {
      Logger.error(`Error loading GM spell manager: ${err}`);
      ui.notifications.error('Error opening Spell List Manager');
    });
}
