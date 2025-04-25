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
  const spellItems = [];
  const errors = [];
  const promises = [];

  // Create a batch of promises for parallel fetching
  for (const uuid of spellUuids) {
    const promise = fromUuid(uuid)
      .then((spell) => {
        if (spell && spell.type === 'spell') {
          if (spell.system.level <= maxSpellLevel) {
            spellItems.push({
              ...spell,
              compendiumUuid: uuid
            });
          }
        } else if (spell) {
          errors.push({ uuid, reason: 'Not a valid spell document' });
        } else {
          errors.push({ uuid, reason: 'Document not found' });
        }
      })
      .catch((error) => {
        errors.push({ uuid, reason: error.message || 'Unknown error' });
      });

    promises.push(promise);
  }

  // Wait for all promises to resolve
  await Promise.allSettled(promises);

  // Log errors in bulk rather than one by one
  if (errors.length > 0) {
    log(1, `Failed to fetch ${errors.length} spells:`, errors);

    // If all spells failed, this might indicate a systemic issue
    if (errors.length === spellUuids.size) {
      log(1, 'All spells failed to load, possible system or compendium issue');
    }
  }

  log(3, `Successfully fetched ${spellItems.length}/${spellUuids.size} spells`);
  return spellItems;
}

/**
 * Check if a spell is already prepared on an actor
 * @param {Actor5e} actor - The actor to check
 * @param {Item5e} spell - The spell document
 * @returns {object} - Status information about the spell preparation
 */
export function getSpellPreparationStatus(actor, spell) {
  log(3, `Checking preparation status for spell: ${spell.name}`);

  // First check if the spell is already on the actor
  const actorSpell = actor.items.find((item) => item.type === 'spell' && (item.name === spell.name || item.flags?.core?.sourceId === spell.compendiumUuid));

  log(3, 'Actor has spell:', !!actorSpell);

  if (!actorSpell) {
    return {
      prepared: false,
      isOwned: false,
      preparationMode: null,
      disabled: false,
      alwaysPrepared: false,
      sourceItem: null
    };
  }

  const preparationMode = actorSpell.system.preparation?.mode || 'prepared';
  const alwaysPrepared = preparationMode === 'always';

  log(3, 'Spell preparation mode:', preparationMode);
  log(3, 'Always prepared:', alwaysPrepared);

  // Find source item for always prepared spells
  let sourceItem = null;
  if (alwaysPrepared) {
    // Check sourceClass as specified
    log(3, 'Spell sourceClass:', actorSpell.system.sourceClass);

    // Get the source identifier (e.g., "cleric")
    const sourceIdentifier = actorSpell.system.sourceClass;
    log(3, 'Source identifier:', sourceIdentifier);

    // Look through relevant actor items to find a match
    if (sourceIdentifier) {
      sourceItem = findSpellSource(actor, sourceIdentifier);
      log(3, 'Found source item:', sourceItem?.name);
    }
  }

  return {
    prepared: actorSpell.system.preparation?.prepared || alwaysPrepared,
    isOwned: true,
    preparationMode: preparationMode,
    disabled: alwaysPrepared || ['innate', 'pact', 'atwill', 'ritual'].includes(preparationMode),
    alwaysPrepared: alwaysPrepared,
    sourceItem: sourceItem
  };
}

/**
 * Find the source item that provides an always-prepared spell
 * @param {Actor5e} actor - The actor to search
 * @param {string} sourceIdentifier - The source identifier to match
 * @returns {object|null} - The source item or null if not found
 */
export function findSpellSource(actor, sourceIdentifier) {
  log(3, `Looking for source: ${sourceIdentifier}`);

  // Only look through these item types
  const relevantTypes = ['class', 'subclass', 'race', 'background', 'feat'];

  // Find the first item with a matching identifier
  const sourceItem = actor.items.find((item) => relevantTypes.includes(item.type) && item.system.identifier?.toLowerCase() === sourceIdentifier);

  log(3, 'Source search result:', sourceItem ? sourceItem.name : 'Not found');
  return sourceItem;
}

/**
 * Organize spells by level for display with preparation info
 * @param {Array} spellItems - Array of spell documents
 * @param {Actor5e} actor - The actor to check preparation status against
 * @returns {Array} - Array of spell levels with formatted data for templates
 */
export function organizeSpellsByLevel(spellItems, actor) {
  log(3, `Organizing ${spellItems.length} spells by level`);

  // Organize spells by level
  const spellsByLevel = {};

  for (const spell of spellItems) {
    if (!spell?.system?.level && spell.system.level !== 0) continue;
    const level = spell.system.level;

    if (!spellsByLevel[level]) {
      spellsByLevel[level] = [];
    }

    // Add preparation status information to each spell
    const prepStatus = getSpellPreparationStatus(actor, spell);
    log(3, `Preparation status for ${spell.name}:`, prepStatus);

    // Add additional data for filtering
    const filterData = extractSpellFilterData(spell);

    const spellData = {
      ...spell,
      preparation: prepStatus,
      filterData
    };

    spellsByLevel[level].push(spellData);
  }

  // Convert to sorted array for handlebars
  const result = Object.entries(spellsByLevel)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([level, spells]) => ({
      level: level,
      levelName: level === '0' ? game.i18n.localize('SPELLBOOK.SpellLevel.Cantrips') : game.i18n.format('SPELLBOOK.SpellLevel.LevelSpells', { level: level }),
      spells: spells
    }));

  log(3, 'Final organized spell levels:', result.length);
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

  if (spell.labels.components?.all) {
    for (const c of spell.labels.components.all) {
      components.push(c.abbr);
    }
  }

  // Format components with commas between them
  const componentsStr = components.length > 0 ? components.join(', ') : '';

  // Add components if there are any
  if (componentsStr) {
    details.push(componentsStr);
  }

  // Add activation
  if (spell.labels.activation) {
    details.push(spell.labels.activation);
  }

  // Add school
  if (spell.labels.school) {
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
    value: spell.system.activation?.value || '',
    type: spell.system.activation?.type || '',
    label: spell.labels?.activation || ''
  };

  // Extract range
  const range = {
    units: spell.system.range?.units || '',
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
  const isRitual = spell.labels?.components?.tags?.includes(game.i18n.localize('DND5E.Item.Property.Ritual')) || false;

  // Check for concentration
  const concentration = spell.system.duration?.concentration || false;

  // Check for saving throws
  let requiresSave = false;
  if (spell.system.activities) {
    for (const [key, activity] of Object.entries(spell.system.activities)) {
      if (activity.value?.type === 'save') {
        requiresSave = true;
        break;
      }
    }
  }

  // If no saving throw detected in activities, check description
  if (!requiresSave && spell.system.description?.value) {
    const saveText = game.i18n.localize('SPELLBOOK.Filters.SavingThrow').toLowerCase();
    requiresSave = spell.system.description.value.toLowerCase().includes(saveText);
  }

  // Extract conditions applied by scanning description
  const description = spell.system.description?.value || '';
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
