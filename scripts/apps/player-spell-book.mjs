import { MODULE } from '../constants.mjs';
import { SpellUtils } from '../helpers.mjs';

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
      icon: 'fa-solid fa-book-spells',
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
      const classItem = this.actor.items.find((i) => i.type === 'class' && i.system?.spellcasting?.progression && i.system.spellcasting.progression !== 'none');

      if (!classItem) return context;

      // Find the matching spellcasting class
      const className = classItem.name.toLowerCase();
      const classUuid = classItem.uuid;
      context.className = classItem.name;

      // Get the spell list for this class
      const spellUuids = await SpellUtils.getClassSpellList(className, classUuid);

      if (!spellUuids || !spellUuids.size) {
        console.log(`${MODULE.ID} | No spells found for class:`, className);
        return context;
      }

      // Get the actual spell items - handle errors more gracefully
      console.log(`${MODULE.ID} | Starting to fetch ${spellUuids.length} spell items`);
      const spellItems = [];

      for (const uuid of spellUuids) {
        try {
          const spell = await fromUuid(uuid);
          if (spell && spell.type === 'spell') {
            spellItems.push(spell);
          }
        } catch (error) {
          console.warn(`${MODULE.ID} | Error fetching spell with uuid ${uuid}:`, error);
        }
      }

      console.log(`${MODULE.ID} | Successfully fetched ${spellItems.length} spell items`);

      // Organize spells by level
      const spellsByLevel = {};
      for (const spell of spellItems) {
        if (!spell?.system?.level) continue;
        const level = spell.system.level;
        if (!spellsByLevel[level]) {
          spellsByLevel[level] = [];
        }
        spellsByLevel[level].push(spell);
      }

      // Convert to sorted array for handlebars
      context.spellLevels = Object.entries(spellsByLevel)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([level, spells]) => ({
          level: level,
          levelName: level === '0' ? 'Cantrips' : `Level ${level} Spells`,
          spells: spells
        }));

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
