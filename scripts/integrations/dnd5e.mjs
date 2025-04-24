import { MODULE } from '../constants.mjs';
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
 * @param {Actor5e} actor The actor completing a rest
 * @param {Object} restData Rest result data
 */
function onRestCompleted(actor, restData) {
  // Only proceed if this is a long rest and the actor can cast spells
  if (!restData.longRest || !canCastSpells(actor)) return;

  // Check if auto-prompt is enabled in settings
  if (!game.settings.get(MODULE.ID, 'enableRestPrompt')) return;

  // Check if the actor has class levels with prepared casting
  const hasPreparedCasting = actor.items.some((item) => item.type === 'class' && item.system?.spellcasting?.preparation?.mode === 'prepared');

  if (!hasPreparedCasting) return;

  log(3, `Prompting ${actor.name} to update prepared spells after long rest`);

  // Build the dialog content
  const dialogContent = `
    <p>${game.i18n.format('SPELLBOOK.Rest.UpdateSpells', { name: actor.name })}</p>
  `;

  // Show dialog to prompt for spell preparation
  new Dialog({
    title: game.i18n.localize('SPELLBOOK.Rest.DialogTitle'),
    content: dialogContent,
    buttons: {
      yes: {
        icon: '<i class="fas fa-check"></i>',
        label: game.i18n.localize('SPELLBOOK.Rest.OpenSpellbook'),
        callback: () => {
          const PlayerSpellBook = MODULE.PlayerSpellBook;
          if (PlayerSpellBook) {
            new PlayerSpellBook(actor).render(true);
          } else {
            log(1, 'PlayerSpellBook class not found on MODULE object');
          }
        }
      },
      no: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize('SPELLBOOK.Rest.KeepSpells')
      }
    },
    default: 'yes'
  }).render(true);
}
