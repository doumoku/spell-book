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
          spellItems.push(spell);
        }
      }
    } catch (error) {
      console.warn(`${MODULE.ID} | Error fetching spell with uuid ${uuid}:`, error);
    }
  }

  return spellItems;
}

/**
 * Organize spells by level for display
 * @param {Array} spellItems - Array of spell documents
 * @returns {Array} - Array of spell levels with formatted data for templates
 */
export function organizeSpellsByLevel(spellItems) {
  // Organize spells by level
  const spellsByLevel = {};

  for (const spell of spellItems) {
    if (!spell?.system?.level && spell.system.level !== 0) continue;
    const level = spell.system.level;

    if (!spellsByLevel[level]) {
      spellsByLevel[level] = [];
    }
    spellsByLevel[level].push(spell);
  }

  // Convert to sorted array for handlebars
  return Object.entries(spellsByLevel)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([level, spells]) => ({
      level: level,
      levelName: level === '0' ? 'Cantrips' : `Level ${level} Spells`,
      spells: spells
    }));
}
