import { MODULE } from './constants.mjs';

export class SpellUtils {
  /**
   * Discover all spellcasting classes by examining compendium content
   * @returns {Promise<void>}
   */
  static async discoverSpellcastingClasses() {
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
  static canCastSpells(actor) {
    return actor?.system?.attributes?.spellcasting && (actor.items.some((i) => i.type === 'spell') || actor.items.some((i) => i.type === 'class' && i.system?.spellcasting?.progression !== 'none'));
  }

  /**
   * Get a class's spell list from compendium journals
   * @param {string} className - The name of the class
   * @param {string} [classUuid] - Optional UUID of the class item
   * @returns {Promise<Array|null>} - Array of spell UUIDs or null
   */
  static async getClassSpellList(className, classUuid) {
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
                  console.log(`${MODULE.ID} | Spell list contains ${page.system.spells.size} spells`);
                  return page.system.spells;
                }
              }
            }
          } catch (innerError) {
            console.warn(`${MODULE.ID} | Error processing journal ${journalData.name}`);
            continue; // Skip to next journal
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
  static async saveActorPreparedSpells(actor, spells) {
    await actor.setFlag(MODULE.ID, MODULE.FLAGS.PREPARED_SPELLS, spells);
  }
}
