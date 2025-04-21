import { MODULE } from './constants.mjs';
import { SpellUtils } from './helpers.mjs';
import { registerHooks } from './hooks.mjs';

Hooks.once('init', async function () {
  console.log(`${MODULE.ID} | Initializing ${MODULE.NAME} module`);

  // Register module hooks
  registerHooks();

  // Load templates
  await loadTemplates([MODULE.TEMPLATES.EXTENDED_COMPENDIUM, MODULE.TEMPLATES.SPELL_LIST_MANAGER, MODULE.TEMPLATES.SPELL_CARD, MODULE.TEMPLATES.SPELL_FILTER]);
});

Hooks.once('ready', async function () {
  // Initialize spell data
  await SpellUtils.discoverSpellcastingClasses();

  // Register the module's compendium pack for use
  console.log(`${MODULE.ID} | Module ready with compendium pack: custom-spell-lists`);
});
