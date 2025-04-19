// scripts/helpers.mjs
import { MODULE } from './constants.mjs';

export class SpellUtils {
  /**
   * Discover all spellcasting classes by examining compendium content
   * @returns {Promise<void>}
   */
  static async discoverSpellcastingClasses() {
    console.log(`${MODULE.ID} | Discovering spellcasting classes...`);

    // Reset the arrays
    MODULE.SPELLCASTING_CLASSES.PREPARED = [];
    MODULE.SPELLCASTING_CLASSES.KNOWN = [];
    MODULE.SPELLCASTING_CLASSES.PACT = [];

    // Get all item compendiums
    const itemPacks = game.packs.filter((p) => p.documentName === 'Item');

    for (const pack of itemPacks) {
      try {
        // Load the index if not already loaded
        await pack.getIndex();

        // Filter for class entries in the index
        const classEntries = pack.index.filter((entry) => entry.type === 'class');

        // Examine each class
        for (const entry of classEntries) {
          try {
            // Get the actual document
            const classItem = await pack.getDocument(entry._id);

            // Skip if this doesn't have spellcasting
            if (!classItem.system?.spellcasting?.progression || classItem.system.spellcasting.progression === 'none') {
              continue;
            }

            const className = classItem.name.toLowerCase();
            const preparationType = classItem.system.spellcasting.preparation?.mode;

            // Categorize by preparation type
            if (preparationType === 'prepared') {
              if (!MODULE.SPELLCASTING_CLASSES.PREPARED.includes(className)) {
                MODULE.SPELLCASTING_CLASSES.PREPARED.push(className);
              }
            } else if (preparationType === 'pact') {
              if (!MODULE.SPELLCASTING_CLASSES.PACT.includes(className)) {
                MODULE.SPELLCASTING_CLASSES.PACT.push(className);
              }
            } else if (preparationType === 'known') {
              if (!MODULE.SPELLCASTING_CLASSES.KNOWN.includes(className)) {
                MODULE.SPELLCASTING_CLASSES.KNOWN.push(className);
              }
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
      prepared: MODULE.SPELLCASTING_CLASSES.PREPARED,
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
   * Check if an actor can prepare different spells
   * @param {Actor5e} actor - The actor to check
   * @returns {boolean} - Whether the actor can prepare different spells
   */
  static canPrepareDifferentSpells(actor) {
    if (!this.canCastSpells(actor)) return false;

    // Check if actor has a class that prepares spells
    return actor.items.filter((i) => i.type === 'class').some((c) => MODULE.SPELLCASTING_CLASSES.PREPARED.includes(c.name.toLowerCase()));
  }

  /**
   * Get a class's spell list from the journal
   * @param {string} className - The name of the class
   * @returns {Promise<Array|null>} - Array of spell UUIDs or null
   */
  static async getClassSpellList(className) {
    // Find the appropriate JournalEntryPage with the spell list
    const spellJournal = game.journal.getName('Spells');
    if (!spellJournal) return null;

    const spellListPage = spellJournal.pages.find((p) => p.name.toLowerCase().includes(`${className} spell list`));

    return spellListPage?.system?.spells || null;
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
