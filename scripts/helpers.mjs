import { MODULE } from './constants.mjs';

/**
 * Discover all spellcasting classes by examining compendium content
 * @returns {Promise<void>}
 */
export async function discoverSpellcastingClasses() {
  console.log(`${MODULE.ID} | Discovering spellcasting classes...`);

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
          console.warn(`${MODULE.ID} | Error processing class ${entry.name}:`, error);
        }
      }
    } catch (error) {
      console.warn(`${MODULE.ID} | Error processing pack ${pack.metadata.label}:`, error);
    }
  }

  console.log(`${MODULE.ID} | Discovered spellcasting classes:`, {
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
  console.log(`${MODULE.ID} | Getting spell list for ${className}`);

  // Normalize the class name for comparison
  const normalizedClassName = className.toLowerCase();

  // If classUuid is provided, first extract its source
  let sourceCompendium = null;
  if (classUuid) {
    try {
      const classItem = await fromUuid(classUuid);
      sourceCompendium = classItem?._source?._stats?.compendiumSource;
      console.log(`${MODULE.ID} | Extracted source: ${sourceCompendium}`);
    } catch (error) {
      console.warn(`${MODULE.ID} | Error extracting source from classUuid`);
    }
  }

  // Filter for journal-type compendium packs that match the source
  const journalPacks = Array.from(game.packs)
    .filter((p) => p.metadata.type === 'JournalEntry')
    .filter((p) => !sourceCompendium || p.metadata.packageName === sourceCompendium.split('.')[1]);

  console.log(`${MODULE.ID} | Searching ${journalPacks.length} journal packs`);

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
              console.log(`${MODULE.ID} | Found matching spell list: ${page.name}`);

              // Direct check for spells array
              if (page.system.spells.size > 0) {
                console.log(`${MODULE.ID} | Found ${page.system.spells.size} spells`);
                return page.system.spells;
              }
            }
          }
        } catch (innerError) {
          console.warn(`${MODULE.ID} | Error processing journal ${journalData.name}`);
          continue;
        }
      }
    } catch (error) {
      console.warn(`${MODULE.ID} | Error processing pack ${pack.metadata.label}`);
    }
  }

  console.log(`${MODULE.ID} | No spell list found for ${className}`);
  return null;
}

/**
 * Save prepared spells for an actor
 * @param {Actor5e} actor - The actor to save spells for
 * @param {string[]} spells - Array of spell UUIDs
 * @returns {Promise<void>}
 */
export async function saveActorPreparedSpells(actor, spells) {
  await actor.setFlag(MODULE.ID, MODULE.FLAGS.PREPARED_SPELLS, spells);
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

  for (const uuid of spellUuids) {
    try {
      const spell = await fromUuid(uuid);
      if (spell && spell.type === 'spell') {
        if (spell.system.level <= maxSpellLevel) {
          // Make sure we're storing the original compendium UUID
          spellItems.push({
            ...spell,
            compendiumUuid: uuid // Store the original compendium UUID
          });
        }
      }
    } catch (error) {
      console.warn(`${MODULE.ID} | Error fetching spell with uuid ${uuid}:`, error);
    }
  }

  return spellItems;
}

/**
 * Check if a spell is already prepared on an actor
 * @param {Actor5e} actor - The actor to check
 * @param {Item5e} spell - The spell document
 * @returns {object} - Status information about the spell preparation
 */
export function getSpellPreparationStatus(actor, spell) {
  console.log(`${MODULE.ID} | Checking preparation status for spell: ${spell.name}`);

  // First check if the spell is already on the actor
  const actorSpell = actor.items.find((item) => item.type === 'spell' && (item.name === spell.name || item.flags?.core?.sourceId === spell.compendiumUuid));

  console.log(`${MODULE.ID} | Actor has spell:`, !!actorSpell);

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

  console.log(`${MODULE.ID} | Spell preparation mode:`, preparationMode);
  console.log(`${MODULE.ID} | Always prepared:`, alwaysPrepared);

  // Find source item for always prepared spells
  let sourceItem = null;
  if (alwaysPrepared) {
    // Check sourceClass as specified
    console.log(`${MODULE.ID} | Spell sourceClass:`, actorSpell.system.sourceClass);

    // Get the source identifier (e.g., "cleric")
    const sourceIdentifier = actorSpell.system.sourceClass;
    console.log(`${MODULE.ID} | Source identifier:`, sourceIdentifier);

    // Look through relevant actor items to find a match
    if (sourceIdentifier) {
      sourceItem = findSpellSource(actor, sourceIdentifier);
      console.log(`${MODULE.ID} | Found source item:`, sourceItem?.name);
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
  console.log(`${MODULE.ID} | Looking for source: ${sourceIdentifier}`);

  // Only look through these item types
  const relevantTypes = ['class', 'subclass', 'race', 'background', 'feat'];

  // Find the first item with a matching identifier
  const sourceItem = actor.items.find((item) => relevantTypes.includes(item.type) && item.system.identifier?.toLowerCase() === sourceIdentifier);

  console.log(`${MODULE.ID} | Source search result:`, sourceItem ? sourceItem.name : 'Not found');
  return sourceItem;
}

/**
 * Organize spells by level for display with preparation info
 * @param {Array} spellItems - Array of spell documents
 * @param {Actor5e} actor - The actor to check preparation status against
 * @returns {Array} - Array of spell levels with formatted data for templates
 */
export function organizeSpellsByLevel(spellItems, actor) {
  console.log(`${MODULE.ID} | Organizing ${spellItems.length} spells by level`);

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
    console.log(`${MODULE.ID} | Preparation status for ${spell.name}:`, prepStatus);

    const spellData = {
      ...spell,
      preparation: prepStatus
    };

    spellsByLevel[level].push(spellData);
  }

  // Convert to sorted array for handlebars
  const result = Object.entries(spellsByLevel)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([level, spells]) => ({
      level: level,
      levelName: level === '0' ? 'Cantrips' : `Level ${level} Spells`,
      spells: spells
    }));

  console.log(`${MODULE.ID} | Final organized spell levels:`, result.length);
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
