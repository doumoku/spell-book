import { MODULE } from './constants.mjs';
import { log } from './logger.mjs';

/**
 * Discover all spellcasting classes by examining compendium content
 * @returns {Promise<void>}
 */
export async function discoverSpellcastingClasses() {
  log(3, 'Discovering spellcasting classes...');

  // Reset the arrays
  MODULE.SPELLCASTING_CLASSES.KNOWN = [];
  MODULE.SPELLCASTING_CLASSES.PACT = [];

  // Get all item compendiums
  const itemPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'Item');

  for (const pack of itemPacks) {
    try {
      // Get the index
      const index = await pack.getIndex();

      // Filter for class entries
      const classEntries = index.filter((entry) => entry.type === 'class');

      // Process each class
      for (const entry of classEntries) {
        try {
          // Get the actual document
          const classItem = await pack.getDocument(entry._id);

          // Skip if this doesn't have spellcasting
          if (!classItem.system?.spellcasting?.progression || classItem.system.spellcasting.progression === 'none') {
            continue;
          }

          const className = classItem.name.toLowerCase();
          const sourceId = classItem.system?.source?.value || pack.metadata.label;
          const classIdentifier = {
            name: className,
            source: sourceId,
            uuid: classItem.uuid
          };

          // Categorize by type first
          const spellcastingType = classItem.system?.spellcasting?.type;
          if (spellcastingType === 'pact') {
            if (!MODULE.SPELLCASTING_CLASSES.PACT.some((c) => c.name === className && c.source === sourceId)) {
              MODULE.SPELLCASTING_CLASSES.PACT.push(classIdentifier);
            }
          } else if (!MODULE.SPELLCASTING_CLASSES.KNOWN.some((c) => c.name === className && c.source === sourceId)) {
            MODULE.SPELLCASTING_CLASSES.KNOWN.push(classIdentifier);
          }
        } catch (error) {
          log(1, `Error processing class ${entry.name}:`, error);
        }
      }
    } catch (error) {
      log(1, `Error processing pack ${pack.metadata.label}:`, error);
    }
  }

  log(3, 'Discovered spellcasting classes:', {
    known: MODULE.SPELLCASTING_CLASSES.KNOWN,
    pact: MODULE.SPELLCASTING_CLASSES.PACT
  });
}

/**
 * Check if an actor can cast spells
 * @param {Actor5e} actor - The actor to check
 * @returns {boolean} - Whether the actor can cast spells
 */
export function canCastSpells(actor) {
  return actor?.system?.attributes?.spellcasting && (actor.items.some((i) => i.type === 'spell') || actor.items.some((i) => i.type === 'class' && i.system?.spellcasting?.progression !== 'none'));
}

/**
 * Get a class's spell list from compendium journals
 * @param {string} className - The name of the class
 * @param {string} [classUuid] - Optional UUID of the class item
 * @returns {Promise<Array|null>} - Array of spell UUIDs or null
 */
export async function getClassSpellList(className, classUuid) {
  log(3, `Getting spell list for ${className}`);

  // Normalize the class name for comparison
  const normalizedClassName = className.toLowerCase();

  // If classUuid is provided, first extract its source
  let sourceCompendium = null;
  if (classUuid) {
    try {
      const classItem = await fromUuid(classUuid);
      sourceCompendium = classItem?._source?._stats?.compendiumSource;
      log(3, `Extracted source: ${sourceCompendium}`);
    } catch (error) {
      log(1, 'Error extracting source from classUuid');
    }
  }

  // Filter for journal-type compendium packs that match the source
  const journalPacks = Array.from(game.packs)
    .filter((p) => p.metadata.type === 'JournalEntry')
    .filter((p) => !sourceCompendium || p.metadata.packageName === sourceCompendium.split('.')[1]);

  log(3, `Searching ${journalPacks.length} journal packs`);

  for (const pack of journalPacks) {
    try {
      // Just get the basic index first
      const index = await pack.getIndex();

      // Convert to array for easier processing
      const entries = Array.from(index.values());

      // Process each journal in the pack
      for (const journalData of entries) {
        try {
          // Load the full document
          const journal = await pack.getDocument(journalData._id);

          // Check each page in the journal
          for (const page of journal.pages) {
            // Skip pages that aren't spell lists
            if (page.type !== 'spells') continue;

            const pageName = page.name?.toLowerCase() || '';
            const pageIdentifier = page.system?.identifier?.toLowerCase() || '';
            const isNameMatch = pageIdentifier === normalizedClassName || pageName.includes(`${normalizedClassName} spell`) || pageName.includes(`${normalizedClassName}'s spell`);

            const isUuidMatch = !sourceCompendium || sourceCompendium.split('.').slice(0, 2).join('.') === journal.uuid.split('.').slice(0, 2).join('.');

            if (isNameMatch && isUuidMatch) {
              log(3, `Found matching spell list: ${page.name}`);

              // Direct check for spells array
              if (page.system.spells.size > 0) {
                log(3, `Found ${page.system.spells.size} spells`);
                return page.system.spells;
              }
            }
          }
        } catch (innerError) {
          log(1, `Error processing journal ${journalData.name}`);
          continue;
        }
      }
    } catch (error) {
      log(1, `Error processing pack ${pack.metadata.label}`);
    }
  }

  log(1, `No spell list found for ${className}`);
  return null;
}

/**
 * Save prepared spells for an actor
 * @param {Actor5e} actor - The actor to save spells for
 * @param {Object} spellData - Object of spell data with preparation info
 * @returns {Promise<void>}
 */
export async function saveActorPreparedSpells(actor, spellData) {
  log(3, 'Saving prepared spells:', spellData);

  // Extract UUIDs of prepared spells to save to flags
  const preparedUuids = Object.entries(spellData)
    .filter(([uuid, data]) => data.isPrepared)
    .map(([uuid]) => uuid);

  // Save the new list to actor flags
  await actor.setFlag(MODULE.ID, MODULE.FLAGS.PREPARED_SPELLS, preparedUuids);

  // Create arrays for different operations
  const toCreate = [];
  const toUpdate = [];
  const toDelete = [];

  // Process each spell
  for (const [uuid, data] of Object.entries(spellData)) {
    // Skip any processing for always prepared spells
    if (data.isAlwaysPrepared) continue;

    // Check if the spell is on the actor
    const existingSpell = actor.items.find((i) => i.type === 'spell' && (i.flags?.core?.sourceId === uuid || i.uuid === uuid));

    if (data.isPrepared) {
      // Spell should be prepared
      if (existingSpell) {
        // Spell exists but might need updating
        if (!existingSpell.system.preparation?.prepared) {
          toUpdate.push({
            '_id': existingSpell.id,
            'system.preparation.prepared': true
          });
        }
      } else {
        // Need to create the spell
        try {
          const sourceSpell = await fromUuid(uuid);
          if (sourceSpell) {
            const spellData = sourceSpell.toObject();
            if (!spellData.system.preparation) {
              spellData.system.preparation = {};
            }
            spellData.system.preparation.prepared = true;
            spellData.flags = spellData.flags || {};
            spellData.flags.core = spellData.flags.core || {};
            spellData.flags.core.sourceId = uuid;

            toCreate.push(spellData);
          }
        } catch (error) {
          log(1, `Error fetching spell ${uuid}:`, error);
        }
      }
    } else if (data.wasPrepared) {
      // Was prepared but now isn't - remove it
      if (existingSpell && existingSpell.system.preparation?.mode === 'prepared' && !existingSpell.system.preparation?.alwaysPrepared) {
        toDelete.push(existingSpell.id);
      }
    }
  }

  // Apply all changes
  log(3, 'Changes:', {
    create: toCreate.length,
    update: toUpdate.length,
    delete: toDelete.length
  });

  // Execute changes in sequence to avoid conflicts
  if (toUpdate.length > 0) {
    await actor.updateEmbeddedDocuments('Item', toUpdate);
  }

  if (toCreate.length > 0) {
    await actor.createEmbeddedDocuments('Item', toCreate);
  }

  if (toDelete.length > 0) {
    await actor.deleteEmbeddedDocuments('Item', toDelete);
  }
}

/**
 * Find a spellcasting class for an actor
 * @param {Actor5e} actor - The actor to check
 * @returns {Item5e|null} - The first class item with spellcasting or null
 */
export function findSpellcastingClass(actor) {
  return actor.items.find((i) => i.type === 'class' && i.system?.spellcasting?.progression && i.system.spellcasting.progression !== 'none');
}

/**
 * Calculate the maximum spell level available to a character based on class and level
 * @param {number} actorLevel - The actor's level
 * @param {object} spellcasting - The spellcasting configuration from the class
 * @returns {number} - The maximum spell level (0 for cantrips only)
 */
export function calculateMaxSpellLevel(actorLevel, spellcasting) {
  let maxSpellLevel = 0; // Default to cantrips

  if (spellcasting && spellcasting.progression !== 'none') {
    // Adjust index to be 0-based and clamped
    const levelIndex = Math.min(Math.max(actorLevel - 1, 0), CONFIG.DND5E.SPELL_SLOT_TABLE.length - 1);
    const spellSlots = CONFIG.DND5E.SPELL_SLOT_TABLE[levelIndex];

    // Find the highest level with spell slots
    maxSpellLevel = spellSlots.length;
  }

  return maxSpellLevel;
}

/**
 * Fetch and filter spell documents from UUIDs based on maximum spell level
 * @param {Set<string>} spellUuids - Set of spell UUIDs
 * @param {number} maxSpellLevel - Maximum spell level to include
 * @returns {Promise<Array>} - Array of spell documents
 */
export async function fetchSpellDocuments(spellUuids, maxSpellLevel) {
  const start = performance.now();
  const timing = (label) => log(1, `${label}: ${(performance.now() - start).toFixed(2)}ms`);

  timing('Start fetchSpellDocuments');

  // Make sure cache is initialized
  if (!MODULE.SPELL_CACHE.initialized) {
    await initializeSpellCache();
  }
  timing('Ensured cache is initialized');

  const spellItems = [];
  const notCached = [];

  // First try to get spells from cache
  for (const uuid of spellUuids) {
    // Try direct UUID lookup first
    let cachedSpell = MODULE.SPELL_CACHE.byUuid[uuid];

    // If not found, try looking up by ID
    if (!cachedSpell) {
      const id = getIdFromUuid(uuid);
      cachedSpell = MODULE.SPELL_CACHE.byId[id];
      if (cachedSpell) {
        log(3, `Found spell by ID lookup: ${id} instead of full UUID: ${uuid}`);
      }
    }

    if (cachedSpell) {
      // Check max spell level
      if (cachedSpell.system?.level <= maxSpellLevel) {
        spellItems.push({
          ...cachedSpell,
          compendiumUuid: uuid // Keep the original UUID for reference
        });
      }
    } else {
      notCached.push(uuid);
    }
  }

  timing(`Retrieved ${spellItems.length} spells from cache (${notCached.length} not found)`);

  // For any spells not in the cache, fall back to direct lookup
  if (notCached.length > 0) {
    log(2, `Fetching ${notCached.length} spells not found in cache`);

    const fetchPromises = notCached.map((uuid) => {
      return fromUuid(uuid)
        .then((spell) => {
          if (spell && spell.type === 'spell' && spell.system.level <= maxSpellLevel) {
            // Add to cache for future use - both by UUID and ID
            MODULE.SPELL_CACHE.byUuid[uuid] = spell;
            MODULE.SPELL_CACHE.byId[spell._id] = spell;
            MODULE.SPELL_CACHE.byName[spell.name.toLowerCase()] = spell;

            spellItems.push({
              ...spell,
              compendiumUuid: uuid
            });
          }
        })
        .catch((error) => {
          log(1, `Error fetching spell ${uuid}:`, error);
        });
    });

    await Promise.allSettled(fetchPromises);
    timing(`Fetched ${notCached.length} additional spells not in cache`);
  }

  log(3, `Successfully retrieved ${spellItems.length}/${spellUuids.size} spells`);
  timing('Finished fetchSpellDocuments');

  return spellItems;
}

/**
 * Organize spells by level for display with preparation info
 * @param {Array} spellItems - Array of spell documents
 * @param {Actor5e} actor - The actor to check preparation status against
 * @returns {Array} - Array of spell levels with formatted data for templates
 */
export async function organizeSpellsByLevel(spellItems, actor) {
  log(3, `Organizing ${spellItems.length} spells by level for ${actor.name}`);

  // Organize spells by level
  const spellsByLevel = {};
  const processedSpellIds = new Set(); // Track spells by ID
  const processedSpellNames = new Set(); // Track spells by name (lowercase)

  // First, add all spells from the class spell list
  log(3, 'Adding spells from class spell list');
  for (const spell of spellItems) {
    if (spell?.system?.level === undefined) continue;

    const level = spell.system.level;
    const spellName = spell.name.toLowerCase();

    if (!spellsByLevel[level]) {
      spellsByLevel[level] = [];
    }

    // Add preparation status information to each spell
    const prepStatus = getSpellPreparationStatus(actor, spell);

    // Add additional data for filtering
    const filterData = extractSpellFilterData(spell);

    const spellData = {
      ...spell,
      preparation: prepStatus,
      filterData
    };

    spellsByLevel[level].push(spellData);
    processedSpellIds.add(spell.id || spell.compendiumUuid || spell.uuid);
    processedSpellNames.add(spellName);
  }

  // Next, add any additional spells directly from the actor
  log(3, 'Adding additional spells from actor');
  const actorSpells = await findActorSpells(actor, processedSpellIds, processedSpellNames);

  for (const { spell, source } of actorSpells) {
    if (spell?.system?.level === undefined) continue;

    const level = spell.system.level;
    log(3, `Adding actor spell: ${spell.name} (level ${level}, source: ${source.name})`);

    if (!spellsByLevel[level]) {
      spellsByLevel[level] = [];
    }

    // Pass the actual spell object directly
    const prepStatus = getSpellPreparationStatus(actor, spell);

    const filterData = extractSpellFilterData(spell);

    const spellData = {
      ...spell,
      preparation: prepStatus,
      filterData
    };

    spellsByLevel[level].push(spellData);
    processedSpellIds.add(spell.id || spell.uuid);
    processedSpellNames.add(spell.name.toLowerCase());
  }

  // Convert to sorted array for handlebars
  const result = Object.entries(spellsByLevel)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([level, spells]) => ({
      level: level,
      levelName: level === '0' ? game.i18n.localize('SPELLBOOK.SpellLevel.Cantrips') : game.i18n.format('SPELLBOOK.SpellLevel.LevelSpells', { level: level }),
      spells: spells
    }));

  log(3, `Final organized spell levels: ${result.length}`);
  log(3, `Total spells after organization: ${result.reduce((sum, level) => sum + level.spells.length, 0)}`);

  return result;
}

/**
 * Format spell details for display
 * @param {Object} spell - The spell object with labels
 * @returns {string} - Formatted spell details string
 */
export function formatSpellDetails(spell) {
  const components = [];
  const details = [];

  // Handle components with more resilient code that works with indexed data format
  if (spell.labels?.components) {
    const comp = spell.labels.components;
    if (comp.all) {
      for (const c of comp.all) {
        components.push(c.abbr);
      }
    } else {
      // Handle simplified component data from index
      if (comp.v) components.push('V');
      if (comp.s) components.push('S');
      if (comp.m) components.push('M');
    }
  }

  // Format components with commas between them
  const componentsStr = components.length > 0 ? components.join(', ') : '';

  // Add components if there are any
  if (componentsStr) {
    details.push(componentsStr);
  }

  // Add activation
  if (spell.labels?.activation) {
    details.push(spell.labels.activation);
  }

  // Add school
  if (spell.labels?.school) {
    details.push(spell.labels.school);
  }

  // Join with bullet points
  return details.filter(Boolean).join(' • ');
}

/**
 * Extracts additional spell data for filtering
 * @param {Object} spell - The spell document
 * @returns {Object} - Additional data for filtering
 */
export function extractSpellFilterData(spell) {
  // Extract casting time
  const castingTime = {
    value: spell.system?.activation?.value || '',
    type: spell.system?.activation?.type || '',
    label: spell.labels?.activation || ''
  };

  // Extract range
  const range = {
    units: spell.system?.range?.units || '',
    label: spell.labels?.range || ''
  };

  // Extract damage types
  const damageTypes = [];
  if (spell.labels?.damages?.length) {
    for (const damage of spell.labels.damages) {
      if (damage.damageType && !damageTypes.includes(damage.damageType)) {
        damageTypes.push(damage.damageType);
      }
    }
  }

  // Check for ritual
  let isRitual = false;
  if (spell.labels?.components?.tags) {
    isRitual = spell.labels.components.tags.includes(game.i18n.localize('DND5E.Item.Property.Ritual'));
  } else if (spell.labels?.ritual || spell.system?.properties?.includes('ritual')) {
    isRitual = true;
  }

  // Check for concentration
  const concentration = spell.system?.duration?.concentration || false;

  // Check for saving throws
  let requiresSave = false;
  if (spell.system?.activities) {
    for (const [key, activity] of Object.entries(spell.system.activities)) {
      if (activity.value?.type === 'save') {
        requiresSave = true;
        break;
      }
    }
  }

  // If no saving throw detected in activities, check description
  if (!requiresSave && spell.system?.description?.value) {
    const saveText = game.i18n.localize('SPELLBOOK.Filters.SavingThrow').toLowerCase();
    requiresSave = spell.system.description.value.toLowerCase().includes(saveText);
  }

  // Extract conditions applied by scanning description
  const description = spell.system?.description?.value || '';
  const conditions = [];
  if (description) {
    // Convert to lowercase for case-insensitive matching
    const lowerDesc = description.toLowerCase();

    // Check for each condition
    for (const [key, condition] of Object.entries(CONFIG.DND5E.conditionTypes)) {
      if (lowerDesc.includes(condition.label.toLowerCase())) {
        conditions.push(key);
      }
    }
  }

  return {
    castingTime,
    range,
    damageTypes,
    isRitual,
    concentration,
    requiresSave,
    conditions
  };
}

/**
 * Simplified spell source finding for actor spells
 * @param {Actor5e} actor - The actor to check
 * @returns {Promise<Array>} - Array of actor spells with source information
 */
export async function findActorSpells(actor, processedSpellIds, processedSpellNames) {
  const actorSpells = actor.items.filter((item) => item.type === 'spell');
  const newSpells = [];

  for (const spell of actorSpells) {
    const spellId = spell.id || spell.uuid;
    const spellName = spell.name.toLowerCase();

    // Skip if already processed
    if (processedSpellIds.has(spellId) || processedSpellNames.has(spellName)) {
      continue;
    }

    const source = determineSpellSource(actor, spell);

    newSpells.push({
      spell,
      source
    });
  }

  return newSpells;
}

/**
 * Determine the source of a spell on the actor
 * @param {Actor5e} actor - The actor
 * @param {Item5e} spell - The spell item
 * @returns {Object} - Source information for the spell
 */
export function determineSpellSource(actor, spell) {
  // Check advancement origin first
  const advancementOrigin = spell.flags?.dnd5e?.advancementOrigin;
  if (advancementOrigin) {
    const sourceItemId = advancementOrigin.split('.')[0];
    const sourceItem = actor.items.get(sourceItemId);

    if (sourceItem) {
      return {
        name: sourceItem.name,
        type: sourceItem.type,
        id: sourceItem.id
      };
    }
  }

  // Check cached activity source
  const cachedFor = spell.flags?.dnd5e?.cachedFor;
  if (cachedFor && typeof cachedFor === 'string') {
    try {
      const activity = fromUuidSync(cachedFor, { relative: actor });
      const item = activity.item;

      if (item) {
        return {
          name: item.name,
          type: item.type,
          id: item.id
        };
      }
    } catch (error) {
      log(1, `Error resolving cached activity source for ${spell.name}:`, error);
    }
  }

  // Fallback to default source if no origin found
  return {
    name: 'Unknown Source',
    type: 'feature'
  };
}

/**
 * Check if a spell is already prepared on an actor
 * @param {Actor5e} actor - The actor to check
 * @param {Item5e} spell - The spell document
 * @returns {object} - Status information about the spell preparation
 */
export function getSpellPreparationStatus(actor, spell) {
  log(3, `Checking preparation status for spell: ${spell.name} (ID: ${spell.id || 'unknown'})`);

  // If the spell is coming from findActorSpells, it's already an actor item
  if (spell.parent === actor || spell._id) {
    log(3, 'This is already an actor spell, using directly');
    const actorSpell = spell;

    const preparationMode = actorSpell.system.preparation?.mode || 'prepared';
    const alwaysPrepared = preparationMode === 'always';

    // Check for cached activity to determine if this is granted from an item
    const cachedFor = actorSpell.flags?.dnd5e?.cachedFor;
    let isGranted = false;
    let sourceItem = null;

    if (cachedFor && typeof cachedFor === 'string') {
      log(3, `Spell has cachedFor flag: ${cachedFor}`);

      try {
        // Try to parse the cachedFor path to get the item directly
        const pathParts = cachedFor.split('.');
        if (pathParts.length >= 3 && pathParts[1] === 'Item') {
          const itemId = pathParts[2];
          log(3, `Looking for item ID: ${itemId}`);

          const item = actor.items.get(itemId);
          if (item) {
            log(3, `Found item by ID: ${item.name}`);
            isGranted = true;
            sourceItem = {
              name: item.name,
              type: item.type,
              id: item.id
            };
          }
        }
      } catch (error) {
        log(1, `Error handling cachedFor: ${error}`);
      }
    }
    // If not granted, check for advancement origin
    else if (actorSpell.flags?.dnd5e?.advancementOrigin) {
      const advOrigin = actorSpell.flags.dnd5e.advancementOrigin;
      const originParts = advOrigin.split('.');
      const sourceItemId = originParts[0];

      const originItem = actor.items.get(sourceItemId);
      if (originItem) {
        sourceItem = {
          name: originItem.name,
          type: originItem.type,
          id: originItem.id
        };
      }
    }

    return {
      prepared: isGranted || actorSpell.system.preparation?.prepared || alwaysPrepared,
      isOwned: true,
      preparationMode: preparationMode,
      disabled: isGranted || alwaysPrepared || ['innate', 'pact', 'atwill', 'ritual'].includes(preparationMode),
      alwaysPrepared: alwaysPrepared,
      sourceItem: sourceItem,
      isGranted: isGranted
    };
  }

  // Otherwise it's a compendium spell, look for it on the actor
  const actorSpell = actor.items.find((item) => item.type === 'spell' && (item.name === spell.name || item.flags?.core?.sourceId === spell.compendiumUuid));

  log(3, 'Actor has spell:', !!actorSpell);
  if (actorSpell) {
    log(3, `Found actor spell: ${actorSpell.name} (ID: ${actorSpell.id})`);
  }

  if (!actorSpell) {
    return {
      prepared: false,
      isOwned: false,
      preparationMode: null,
      disabled: false,
      alwaysPrepared: false,
      sourceItem: null,
      isGranted: false
    };
  }

  // Log full spell data for debugging
  log(3, 'Actor spell data:', {
    id: actorSpell.id,
    name: actorSpell.name,
    preparationMode: actorSpell.system.preparation?.mode,
    prepared: actorSpell.system.preparation?.prepared,
    flags: actorSpell.flags
  });

  const preparationMode = actorSpell.system.preparation?.mode || 'prepared';
  const alwaysPrepared = preparationMode === 'always';

  // Determine source item
  let sourceItem = null;
  let grantedSpell = false;
  let isGranted = false;

  // Check advancement origin or cached activity flags
  const advancementOrigin = actorSpell.flags?.dnd5e?.advancementOrigin;
  const cachedFor = actorSpell.flags?.dnd5e?.cachedFor;

  log(3, 'Checking for spell source:');
  log(3, ` - advancementOrigin: ${advancementOrigin || 'none'}`);
  log(3, ` - cachedFor: ${cachedFor || 'none'}`);

  // Check if this is a granted spell from an item via cachedFor
  if (cachedFor && typeof cachedFor === 'string') {
    log(3, `Attempting to resolve cachedFor path: ${cachedFor}`);

    try {
      // Log the full actor structure to check where things are stored
      log(3, `Actor items count: ${actor.items.size}`);

      // Try to resolve the cached activity
      const activity = fromUuidSync(cachedFor, { relative: actor });
      log(3, `Activity resolution result: ${activity ? 'Success' : 'Failed'}`);

      if (activity) {
        log(3, `Activity data:`, {
          id: activity.id,
          type: activity.type,
          name: activity.name,
          itemId: activity.item?.id,
          itemName: activity.item?.name
        });

        if (activity.item) {
          isGranted = true;
          grantedSpell = true;
          sourceItem = {
            name: activity.item.name,
            type: activity.item.type,
            id: activity.item.id
          };
          log(3, `✓ Confirmed granted spell from item: ${activity.item.name}`);
        } else {
          log(3, `✗ Activity found but no item property`);
        }
      } else {
        log(3, `✗ Failed to resolve activity from cachedFor`);
      }
    } catch (error) {
      log(1, `Error resolving cached activity source for ${actorSpell.name}:`, error);

      // Let's try a different approach - parse the cachedFor path manually
      try {
        log(3, `Trying manual path resolution for: ${cachedFor}`);
        // The path is like ".Item.gv4JVuAlMv4ofuqy.Activity.NGoTVneu5RYDoqnb"
        const pathParts = cachedFor.split('.');
        if (pathParts.length >= 3 && pathParts[1] === 'Item') {
          const itemId = pathParts[2];
          log(3, `Looking for item ID: ${itemId}`);

          const item = actor.items.get(itemId);
          if (item) {
            log(3, `✓ Found item by ID: ${item.name}`);
            isGranted = true;
            grantedSpell = true;
            sourceItem = {
              name: item.name,
              type: item.type,
              id: item.id
            };
          } else {
            log(3, `✗ Could not find item with ID: ${itemId}`);
          }
        }
      } catch (parseError) {
        log(1, `Error in manual path resolution:`, parseError);
      }
    }
  } else if (advancementOrigin) {
    log(3, `Processing advancement origin: ${advancementOrigin}`);
    const sourceItemId = advancementOrigin.split('.')[0];
    const resolvedSource = actor.items.get(sourceItemId);

    if (resolvedSource) {
      sourceItem = {
        name: resolvedSource.name,
        type: resolvedSource.type,
        id: resolvedSource.id
      };
      grantedSpell = true;
      log(3, `✓ Found source item from advancement: ${resolvedSource.name}`);
    } else {
      log(3, `✗ Could not find source item with ID: ${sourceItemId}`);
    }
  }

  // Fallback source determination if no direct source found
  if (!sourceItem) {
    log(3, 'No direct source found, trying fallback methods');

    if (alwaysPrepared) {
      const subclass = actor.items.find((i) => i.type === 'subclass');
      if (subclass) {
        sourceItem = {
          name: subclass.name,
          type: 'subclass'
        };
        log(3, `Fallback to subclass (always prepared): ${subclass.name}`);
      }
    } else if (preparationMode === 'pact') {
      const subclass = actor.items.find((i) => i.type === 'subclass');
      sourceItem = subclass ? { name: subclass.name, type: 'subclass' } : { name: 'Pact Magic', type: 'class' };
      log(3, `Fallback to pact source: ${sourceItem.name}`);
    } else {
      const classItem = actor.items.find((i) => i.type === 'class');
      if (classItem) {
        sourceItem = {
          name: classItem.name,
          type: 'class'
        };
        log(3, `Fallback to class source: ${classItem.name}`);
      } else {
        log(3, 'No fallback source found');
      }
    }
  }

  const result = {
    prepared: grantedSpell || actorSpell.system.preparation?.prepared || alwaysPrepared,
    isOwned: true,
    preparationMode: preparationMode,
    disabled: grantedSpell || alwaysPrepared || ['innate', 'pact', 'atwill', 'ritual'].includes(preparationMode),
    alwaysPrepared: alwaysPrepared,
    sourceItem: sourceItem,
    isGranted: isGranted
  };

  log(3, `Final spell preparation status:`, result);
  log(3, `========== END SPELL CHECK: ${spell.name} ==========`);

  return result;
}

/**
 * Initialize the global spell cache by fetching all spells from compendiums
 * @returns {Promise<void>}
 */
export async function initializeSpellCache() {
  if (MODULE.SPELL_CACHE.initialized) return;

  log(3, 'Initializing global spell cache...');
  const start = performance.now();

  // Reset the cache structure to include ID-based lookup
  MODULE.SPELL_CACHE.byUuid = {};
  MODULE.SPELL_CACHE.byId = {}; // Add this new index
  MODULE.SPELL_CACHE.byName = {};

  // Get all item packs
  const itemPacks = Array.from(game.packs).filter((p) => p.documentName === 'Item');
  let totalSpells = 0;
  let skippedSpells = 0;

  for (const pack of itemPacks) {
    try {
      // Get the index with our specified fields
      const index = await pack.getIndex({ fields: CONFIG.Item.compendiumIndexFields });

      // Filter for spells
      const spellEntries = index.filter((e) => e.type === 'spell');
      log(3, `Processing ${spellEntries.length} spells from ${pack.collection}`);

      for (const spell of spellEntries) {
        try {
          // Generate the complete UUID
          const uuid = `Compendium.${pack.collection}.${spell._id}`;

          // Store by UUID
          MODULE.SPELL_CACHE.byUuid[uuid] = spell;

          // Store by ID for direct lookups regardless of UUID format
          MODULE.SPELL_CACHE.byId[spell._id] = spell;

          // Also store by name (lowercase for case-insensitive lookups)
          const nameLower = spell.name.toLowerCase();
          MODULE.SPELL_CACHE.byName[nameLower] = spell;

          totalSpells++;
        } catch (error) {
          skippedSpells++;
          log(2, `Error caching spell ${spell.name || spell._id}:`, error);
        }
      }
    } catch (error) {
      log(1, `Error processing pack ${pack.collection}:`, error);
    }
  }

  MODULE.SPELL_CACHE.initialized = true;
  const elapsed = performance.now() - start;
  log(1, `Spell cache initialized with ${totalSpells} spells in ${elapsed.toFixed(2)}ms (${skippedSpells} skipped)`);
}

/**
 * Extract the ID from a UUID
 * @param {string} uuid - The UUID to process
 * @returns {string} - The extracted ID (last segment)
 */
function getIdFromUuid(uuid) {
  if (!uuid) return '';
  const parts = uuid.split('.');
  return parts[parts.length - 1];
}
