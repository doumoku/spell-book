/**
 * Contains hook registrations for the Spell Book module
 * @module spell-book/hooks
 */

import { PlayerSpellBook } from './apps/player-spell-book.mjs';
import { MODULE } from './constants.mjs';
import * as actorSpellUtils from './helpers/actor-spells.mjs';
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

    // Add preloading hook
    Hooks.on('renderActorSheet5e', preloadSpellData);
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

/**
 * Preloads spell data when a character sheet is opened
 * @param {ActorSheet5e} app - The rendered actor sheet
 * @param {HTMLElement} html - The HTML of the actor sheet
 * @param {Object} data - The data used to render the sheet
 */
function preloadSpellData(app, html, data) {
  try {
    // Only preload for characters that can cast spells
    if (!discoveryUtils.canCastSpells(data.actor)) return;

    // Create a cache key for this actor
    const actor = data.actor;
    const cacheKey = `${actor.id}-preload`;

    // Skip if we've recently preloaded this actor's data
    if (MODULE.CACHE.spellDataTime[cacheKey] && Date.now() - MODULE.CACHE.spellDataTime[cacheKey] < 300000) {
      log(3, `Using existing preloaded data for ${actor.name}`);
      return;
    }

    // Set a flag to indicate preloading is in progress
    MODULE.CACHE.spellDataTime[cacheKey] = Date.now();

    // Preload in the background
    setTimeout(async () => {
      log(3, `Preloading spell data for ${actor.name}`);

      // Find spellcasting class
      const classItem = discoveryUtils.findSpellcastingClass(actor);
      if (!classItem) return;

      // Get spell list
      const className = classItem.name.toLowerCase();
      const classUuid = classItem.uuid;
      const spellUuids = await discoveryUtils.getClassSpellList(className, classUuid);
      if (!spellUuids || !spellUuids.size) return;

      // Calculate max spell level
      const actorLevel = actor.system.details.level;
      const maxSpellLevel = discoveryUtils.calculateMaxSpellLevel(actorLevel, classItem.system.spellcasting);

      // Fetch spell data
      const spellItems = await actorSpellUtils.fetchSpellDocuments(spellUuids, maxSpellLevel);

      // Organize spells by level
      const spellLevels = await actorSpellUtils.organizeSpellsByLevel(spellItems, actor);

      // Calculate preparation statistics
      const prepStats = calculatePreparationStats(spellLevels, classItem);

      // Store the processed data in the cache
      MODULE.CACHE.spellData[`${actor.id}-${maxSpellLevel}`] = spellItems;
      MODULE.CACHE.spellDataTime[`${actor.id}-${maxSpellLevel}`] = Date.now();

      // Store the processed spellLevels and other context data
      MODULE.CACHE.processedData = MODULE.CACHE.processedData || {};
      MODULE.CACHE.processedData[actor.id] = {
        spellLevels,
        className: classItem.name,
        spellPreparation: prepStats,
        timestamp: Date.now()
      };

      log(3, `Preloading complete for ${actor.name}`);
    }, 500); // Slight delay to not interfere with sheet rendering
  } catch (error) {
    log(1, 'Error preloading spell data:', error);
  }
}

/**
 * Calculate preparation statistics for the spell levels
 * @param {Array} spellLevels - Array of spell level data
 * @param {Item5e} classItem - The spellcasting class item
 * @returns {Object} Preparation statistics
 */
function calculatePreparationStats(spellLevels, classItem) {
  let preparedCount = 0;
  let maxPrepared = 0;

  if (classItem) {
    const spellcastingAbility = classItem.system.spellcasting?.ability;
    if (spellcastingAbility) {
      const abilityMod = classItem.parent.system.abilities[spellcastingAbility]?.mod || 0;
      const classLevel = classItem.system.levels || classItem.parent.system.details.level;
      maxPrepared = Math.max(1, classLevel + abilityMod);
    }
  }

  for (const level of spellLevels) {
    for (const spell of level.spells) {
      if (spell.preparation.prepared && !spell.preparation.alwaysPrepared) {
        preparedCount++;
      }
    }
  }

  return {
    current: preparedCount,
    maximum: maxPrepared
  };
}
