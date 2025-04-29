/**
 * Integration with the D&D5e system
 * Adds rest features and system-specific interactions
 * @module spell-book/integrations/dnd5e
 */

import { MODULE, SETTINGS_KEYS } from '../constants.mjs';
import { canCastSpells } from '../helpers.mjs';
import { log } from '../logger.mjs';

/**
 * Register hooks related to DnD5e system integration
 */
export function registerDnD5eIntegration() {
  log(3, 'Registering DnD5e system integration');

  // Hook into rest completion to offer spell preparation
  Hooks.on('dnd5e.restCompleted', onRestCompleted);
}

/**
 * Handler for rest completion
 * Prompts player to prepare spells after a long rest if appropriate
 * @param {Actor5e} actor - The actor completing a rest
 * @param {Object} restData - Rest result data
 */
function onRestCompleted(actor, restData) {
  try {
    // Only proceed if this is a long rest and the actor can cast spells
    if (!restData.longRest || !canCastSpells(actor)) return;

    // Check if auto-prompt is enabled in settings
    if (!game.settings.get(MODULE.ID, SETTINGS_KEYS.ENABLE_REST_PROMPT)) return;

    // Check if the actor has class levels with prepared casting
    const hasPreparedCasting = actor.items.some((item) => item.type === 'class' && item.system?.spellcasting?.preparation?.mode === 'prepared');

    if (!hasPreparedCasting) return;

    log(3, `Prompting ${actor.name} to update prepared spells after long rest`);

    // Show dialog to prompt for spell preparation
    showPrepareSpellsDialog(actor);
  } catch (error) {
    log(1, 'Error processing rest completion:', error);
  }
}

/**
 * Shows dialog for preparing spells after rest
 * @param {Actor5e} actor - The actor who completed the rest
 */
function showPrepareSpellsDialog(actor) {
  // Build the dialog content
  const dialogContent = `
    <p>${game.i18n.format('SPELLBOOK.Rest.UpdateSpells', { name: actor.name })}</p>
  `;

  new Dialog({
    title: game.i18n.localize('SPELLBOOK.Rest.DialogTitle'),
    content: dialogContent,
    buttons: {
      yes: {
        icon: '<i class="fas fa-check"></i>',
        label: game.i18n.localize('SPELLBOOK.Rest.OpenSpellbook'),
        callback: () => openSpellBookForActor(actor)
      },
      no: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize('SPELLBOOK.Rest.KeepSpells')
      }
    },
    default: 'yes'
  }).render(true);
}

/**
 * Opens the spell book application for an actor
 * @param {Actor5e} actor - The actor to show the spell book for
 */
function openSpellBookForActor(actor) {
  try {
    // Get the PlayerSpellBook class
    const PlayerSpellBook = game.modules.get(MODULE.ID)?.api?.PlayerSpellBook;

    if (PlayerSpellBook) {
      new PlayerSpellBook(actor).render(true);
    } else {
      // Fallback to module-scoped class
      if (MODULE.PlayerSpellBook) {
        new MODULE.PlayerSpellBook(actor).render(true);
      } else {
        throw new Error('PlayerSpellBook class not found');
      }
    }
  } catch (error) {
    log(1, 'Failed to open spell book:', error);
    ui.notifications?.error(game.i18n.format('Failed to open spell book for {name}', { name: actor.name }));
  }
}
