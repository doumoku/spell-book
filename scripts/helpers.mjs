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
   * @returns {Promise<Array|null>} - Array of spell UUIDs or null
   */
  static async getClassSpellList(className) {
    console.log(`${MODULE.ID} | getClassSpellList called for:`, className);

    // Normalize the class name for comparison
    const normalizedClassName = className.toLowerCase();
    console.log(`${MODULE.ID} | Normalized class name:`, normalizedClassName);

    // Filter for journal-type compendium packs
    const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');
    console.log(`${MODULE.ID} | Found journal packs:`, journalPacks.length);

    for (const pack of journalPacks) {
      console.log(`${MODULE.ID} | Checking pack:`, pack.metadata.label);

      try {
        // Just get the basic index first
        const index = await pack.getIndex();
        console.log(`${MODULE.ID} | Got index with entries:`, index.size);

        // Convert to array for easier processing
        const entries = Array.from(index.values());

        // Process each journal in the pack
        for (const journalData of entries) {
          console.log(`${MODULE.ID} | Checking journal:`, journalData.name);

          try {
            // Load the full document
            console.log(`${MODULE.ID} | Loading full journal:`, journalData._id);
            const journal = await pack.getDocument(journalData._id);

            // Check each page in the journal
            for (const page of journal.pages) {
              // Skip pages that aren't spell lists
              if (page.type !== 'spells') continue;

              const pageName = page.name?.toLowerCase() || '';
              const pageIdentifier = page.system?.identifier?.toLowerCase() || '';

              // Check if this page matches our class
              if (pageIdentifier === normalizedClassName || pageName.includes(`${normalizedClassName} spell`) || pageName.includes(`${normalizedClassName}'s spell`)) {
                console.log(`${MODULE.ID} | Found matching page:`, page.name);

                // Log the full page structure for debugging
                console.log(`${MODULE.ID} | Page system data:`, page.system);

                // Direct check for spells array
                if (page.system.spells.size > 0) {
                  console.log(`${MODULE.ID} | Found spells array with ${page.system.spells.size} entries`);
                  return page.system.spells;
                }
              }
            }
          } catch (innerError) {
            console.warn(`${MODULE.ID} | Error processing journal ${journalData.name}:`, innerError);
            continue; // Skip to next journal
          }
        }
      } catch (error) {
        console.warn(`${MODULE.ID} | Error processing pack ${pack.metadata.label}:`, error);
      }
    }

    console.log(`${MODULE.ID} | No spell list found for class:`, className);
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
