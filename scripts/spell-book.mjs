import { MODULE } from './constants.mjs';
import { SpellUtils } from './helpers.mjs';
import { registerHooks } from './hooks.mjs';

Hooks.once('init', async function () {
  console.log(`${MODULE.ID} | Initializing ${MODULE.NAME} module`);

  // Register module hooks
  registerHooks();

  // Load templates
  const templatePaths = [
    MODULE.TEMPLATES.EXTENDED_COMPENDIUM,
    MODULE.TEMPLATES.SPELL_LIST_MANAGER,
    MODULE.TEMPLATES.SPELL_CARD,
    MODULE.TEMPLATES.SPELL_FILTER,

    'modules/spell-book/templates/compendium/browser-header.hbs',
    'modules/spell-book/templates/compendium/browser-tabs.hbs',
    'modules/spell-book/templates/compendium/browser-sidebar-search.hbs',
    'modules/spell-book/templates/compendium/browser-sidebar-types.hbs',
    'modules/spell-book/templates/compendium/browser-sidebar-filters.hbs',
    'modules/spell-book/templates/compendium/browser-sidebar-filter-set.hbs',
    'modules/spell-book/templates/compendium/browser-results.hbs',
    'modules/spell-book/templates/compendium/browser-entry.hbs',
    'modules/spell-book/templates/compendium/browser-footer.hbs'
  ];

  await loadTemplates(templatePaths);
});

Hooks.once('ready', async function () {
  // Initialize spell data
  await SpellUtils.discoverSpellcastingClasses();

  // Register the module's compendium pack for use
  console.log(`${MODULE.ID} | Module ready with compendium pack: custom-spell-lists`);
});
