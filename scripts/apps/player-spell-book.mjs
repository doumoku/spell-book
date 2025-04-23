import { MODULE } from '../constants.mjs';
import { calculateMaxSpellLevel, fetchSpellDocuments, findSpellcastingClass, formatSpellDetails, getClassSpellList, organizeSpellsByLevel } from '../helpers.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PlayerSpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${MODULE.ID}-spell-book`,
    title: 'Spell Book',
    classes: ['spell-book'],
    position: {
      height: 600,
      width: 800
    },
    window: {
      icon: 'fa-solid fa-hat-wizard',
      resizable: true,
      minimizable: true
    }
  };

  /** @override */
  static PARTS = {
    form: { template: `modules/${MODULE.ID}/templates/spell-book.hbs` }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /**
   * The actor this spell book is for
   * @type {Actor5e}
   */
  actor = null;

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {Actor5e} actor - The actor to display spells for
   * @param {object} options - ApplicationV2 options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * @override
   */
  async _prepareContext(options) {
    // Start with basic context
    const context = {
      actor: this.actor,
      spellLevels: [],
      className: ''
    };

    try {
      // Find the class item for this actor
      const classItem = findSpellcastingClass(this.actor);
      if (!classItem) return context;

      // Find the matching spellcasting class
      const className = classItem.name.toLowerCase();
      const classUuid = classItem.uuid;
      context.className = classItem.name;

      // Get the spell list for this class
      const spellUuids = await getClassSpellList(className, classUuid);
      if (!spellUuids || !spellUuids.size) {
        console.log(`${MODULE.ID} | No spells found for class:`, className);
        return context;
      }

      // Determine max spell level based on actor's level and spell slot table
      const actorLevel = this.actor.system.details.level;
      const maxSpellLevel = calculateMaxSpellLevel(actorLevel, classItem.system.spellcasting);
      console.log(`${MODULE.ID} | Max spell level for level ${actorLevel}: ${maxSpellLevel}`);

      // Get the actual spell items
      console.log(`${MODULE.ID} | Starting to fetch ${spellUuids.size} spell items`);
      const spellItems = await fetchSpellDocuments(spellUuids, maxSpellLevel);
      console.log(`${MODULE.ID} | Successfully fetched ${spellItems.length} spell items`);

      // Organize spells by level
      const spellLevels = organizeSpellsByLevel(spellItems, this.actor);

      // Process each level to create enriched content
      for (const level of spellLevels) {
        for (const spell of level.spells) {
          // Store the original compendium UUID on the spell
          const uuid = spell.compendiumUuid || spell.uuid;
          console.log(`${MODULE.ID} | Using UUID for enrichment: ${uuid}`);

          // Enrich the name with the UUID link
          spell.enrichedName = await TextEditor.enrichHTML(`@UUID[${uuid}]{${spell.name}}`, { async: true });
          spell.formattedDetails = formatSpellDetails(spell);
        }
      }

      context.spellLevels = spellLevels;

      console.log(`${MODULE.ID} | Final context:`, {
        className: context.className,
        spellLevelCount: context.spellLevels.length,
        totalSpells: context.spellLevels.reduce((count, level) => count + level.spells.length, 0)
      });

      return context;
    } catch (error) {
      console.error(`${MODULE.ID} | Error preparing spell book context:`, error);
      return context;
    }
  }
}
