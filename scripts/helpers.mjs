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
    // Normalize the class name for comparison
    const normalizedClassName = className.toLowerCase();

    // Filter for journal-type compendium packs
    const journalPacks = Array.from(game.packs).filter((p) => p.metadata.type === 'JournalEntry');

    for (const pack of journalPacks) {
      // Get the enriched index with the fields we added to CONFIG.JournalEntry.compendiumIndexFields
      const index = await pack.getIndex({ fields: ['pages.type', 'pages.name', 'pages.system.type', 'pages.system.identifier'] });

      // Find journals that might contain spell lists
      const potentialJournals = index.filter((entry) => entry.pages?.some((page) => page.type === 'spells' && page.system?.type === 'class'));

      // Skip this pack if no potential journals found
      if (!potentialJournals.length) continue;

      // Process each potential journal
      for (const journalData of potentialJournals) {
        // Check if any page in the index matches our class
        const hasMatchingPage = journalData.pages?.some(
          (page) =>
            page.type === 'spells' && page.system?.type === 'class' && (page.system?.identifier === normalizedClassName || page.name?.toLowerCase().includes(`${normalizedClassName} spell list`))
        );

        // Skip to next journal if no matching page
        if (!hasMatchingPage) continue;

        // Only now load the full document
        const journal = await pack.getDocument(journalData._id);

        // Find the matching page
        const classSpellPage = journal.pages.find(
          (page) =>
            page.type === 'spells' && page.system?.type === 'class' && (page.system?.identifier === normalizedClassName || page.name.toLowerCase().includes(`${normalizedClassName} spell list`))
        );

        if (classSpellPage?.system?.spells) {
          return classSpellPage.system.spells;
        }
      }
    }

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
