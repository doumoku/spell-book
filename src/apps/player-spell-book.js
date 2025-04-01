// src/apps/player-spell-book.js

import { TEMPLATES } from '../constants.js';
import { Logger } from '../utils/logger.js';
import { findSpellListInCompendium, getActorSpells, getPreparableSpellCount, getPreparedSpells, loadSpellsFromUuids } from '../utils/spell-utils.js';
import { createUuidLink, enrichContent } from '../utils/ui-utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Player Spell Book Application
 * Provides an interface for players to manage their character's spells
 * @class PlayerSpellBook
 */
export class PlayerSpellBook extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'player-spell-book',
    tag: 'div',
    classes: ['spell-book'],
    position: { width: 'auto', height: 'auto', top: '100' },
    window: {
      icon: 'fa-solid fa-book',
      resizable: false,
      minimizable: true
    },
    actions: {
      prepareSpell: PlayerSpellBook.prepareSpell,
      unprepareSpell: PlayerSpellBook.unprepareSpell,
      saveChanges: PlayerSpellBook.saveChanges,
      cancel: PlayerSpellBook.cancel
    }
  };

  /** @override */
  static PARTS = {
    header: { template: TEMPLATES.SPELL_BOOK_HEADER, classes: ['spell-book-header'] },
    content: { template: TEMPLATES.SPELL_BOOK_CONTENT, classes: ['spell-book-content'] },
    footer: { template: TEMPLATES.SPELL_BOOK_FOOTER, classes: ['spell-book-footer'] }
  };

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @constructor
   * @param {Actor} actor - The associated actor
   * @param {Object} options - Application options
   */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.maxPrepared = getPreparableSpellCount(actor);
    this.classSpellLists = [];

    Logger.debug(`Created spell book for ${actor.name} with max prepared: ${this.maxPrepared}`);

    // Load class spell lists asynchronously
    this._loadClassSpellLists();
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The window title for this application
   * @type {string}
   */
  get title() {
    return game.i18n.format('spell-book.ui.title', { name: this?.actor?.name });
  }

  /* -------------------------------------------- */
  /*  Application Methods                         */
  /* -------------------------------------------- */

  /**
   * Prepare context data for rendering the Spell Book
   * @param {Object} _options - Application render options
   * @returns {Object} Context data for the template
   * @protected
   * @override
   */
  async _prepareContext(_options) {
    // Get spells
    const preparedSpells = getPreparedSpells(this.actor);
    let availableSpells = getActorSpells(this.actor).filter((s) => !s.system.preparation?.prepared);

    // Add spells from class spell lists that the actor doesn't already have
    const actorSpellIds = new Set(this.actor.items.filter((i) => i.type === 'spell').map((i) => i.name.toLowerCase()));

    // Collect spells from class spell lists
    const classSpells = [];
    for (const list of this.classSpellLists) {
      for (const spell of list.spells) {
        // Only add if the actor doesn't already have this spell
        if (!actorSpellIds.has(spell.name.toLowerCase())) {
          // Create a copy with a flag indicating it's from a spell list
          const spellCopy = duplicate(spell);
          spellCopy.fromSpellList = true;
          spellCopy.fromClass = list.class;
          classSpells.push(spellCopy);
        }
      }
    }

    // Add class spells to available spells
    availableSpells = [...availableSpells, ...classSpells];

    // Group spells by level and add UUID links
    const preparedByLevel = {};
    const availableByLevel = {};

    // Process prepared spells
    for (let lvl = 0; lvl <= 9; lvl++) {
      const preparedOfLevel = preparedSpells.filter((s) => s.system.level === lvl);

      if (preparedOfLevel.length > 0) {
        // Enrich spell names with UUID links
        const enrichedSpells = [];
        for (const spell of preparedOfLevel.sort((a, b) => a.name.localeCompare(b.name))) {
          enrichedSpells.push({
            ...spell,
            nameDisplay: await enrichContent(createUuidLink(spell))
          });
        }

        preparedByLevel[lvl] = {
          level: lvl,
          label: lvl === 0 ? game.i18n.localize('spell-book.ui.cantrips') : game.i18n.format('spell-book.ui.spellLevel', { level: lvl }),
          spells: enrichedSpells,
          hasSpells: enrichedSpells.length > 0
        };
      }

      // Process available spells
      const availableOfLevel = availableSpells.filter((s) => s.system.level === lvl);

      if (availableOfLevel.length > 0) {
        // Enrich spell names with UUID links
        const enrichedSpells = [];
        for (const spell of availableOfLevel.sort((a, b) => a.name.localeCompare(b.name))) {
          let uuidLink;

          if (spell.fromSpellList) {
            // For spells from spell lists that don't exist on the actor yet
            uuidLink = createUuidLink(spell);

            // Add class information
            if (spell.fromClass) {
              const classInfo = ` (${spell.fromClass})`;
              uuidLink = uuidLink.replace(/{([^}]+)}/, `{$1${classInfo}}`);
            }
          } else {
            uuidLink = createUuidLink(spell);
          }

          enrichedSpells.push({
            ...spell,
            nameDisplay: await enrichContent(uuidLink)
          });
        }

        availableByLevel[lvl] = {
          level: lvl,
          label: lvl === 0 ? game.i18n.localize('spell-book.ui.cantrips') : game.i18n.format('spell-book.ui.spellLevel', { level: lvl }),
          spells: enrichedSpells,
          hasSpells: enrichedSpells.length > 0
        };
      }
    }

    // Prepare the context data
    const context = {
      actor: this.actor,
      preparedSpells,
      availableSpells,
      preparedByLevel,
      availableByLevel,
      maxPrepared: this.maxPrepared,
      currentPrepared: preparedSpells.length,
      remainingPrepared: Math.max(0, this.maxPrepared - preparedSpells.length),
      canPrepareMore: preparedSpells.length < this.maxPrepared,
      isGM: game.user.isGM,
      config: CONFIG.DND5E,
      hasClassSpellLists: this.classSpellLists.length > 0
    };

    Logger.debug('Spell book context prepared');
    return context;
  }

  /**
   * Actions performed after any render of the Application
   * @param {Object} _context - Prepared context data
   * @param {Object} _options - Provided render options
   * @protected
   * @override
   */
  _onRender(_context, _options) {
    // Set up search filter if we have a search input
    const searchInput = this.element.querySelector('.spell-search');
    if (searchInput) {
      searchInput.addEventListener('keyup', this._onSearchFilter.bind(this));
    }

    Logger.debug('Spell book rendered');
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle spell search filtering
   * @param {Event} event - The originating keyup event
   * @private
   */
  _onSearchFilter(event) {
    const query = event.currentTarget.value.toLowerCase();
    if (!query) {
      this.element.querySelectorAll('.spell-item').forEach((el) => (el.style.display = ''));
      return;
    }

    const rgx = new RegExp(RegExp.escape(query), 'i');
    this.element.querySelectorAll('.spell-item').forEach((item) => {
      const name = item.querySelector('.spell-name').textContent;
      item.style.display = rgx.test(name) ? '' : 'none';
    });
  }

  /* -------------------------------------------- */
  /*  Static Action Handlers                      */
  /* -------------------------------------------- */

  /**
   * Handle preparing a spell
   * @param {Event} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static async prepareSpell(event, target) {
    event.preventDefault();
    const app = this; // 'this' in static action handlers refers to the application instance
    const spellId = target.closest('.spell-item').dataset.spellId;
    const isFromList = target.closest('.spell-item').dataset.fromList === 'true';

    // Handle differently based on whether it's from a spell list or already on the actor
    if (isFromList) {
      // Get the spell from our prepared context
      const spellItem = app.availableSpells.find((s) => s._id === spellId || s.id === spellId);

      if (!spellItem) return;

      // Check if we can prepare more spells
      if (getPreparedSpells(app.actor).length >= app.maxPrepared) {
        ui.notifications.warn(game.i18n.localize('spell-book.notifications.tooManySpells'));
        return;
      }

      try {
        // Create the spell on the actor first
        const newSpell = await app.actor.createEmbeddedDocuments('Item', [
          {
            name: spellItem.name,
            type: 'spell',
            system: spellItem.system
          }
        ]);

        // Then mark it as prepared
        if (newSpell && newSpell.length > 0) {
          await newSpell[0].update({ 'system.preparation.prepared': true });
          app.render();
        }
      } catch (error) {
        Logger.error('Error creating spell from list:', error);
        ui.notifications.error('Could not add spell from spell list');
      }
    } else {
      // Normal spell already on the actor
      const spell = app.actor.items.get(spellId);
      if (!spell) return;

      // Check if we can prepare more spells
      if (getPreparedSpells(app.actor).length >= app.maxPrepared) {
        ui.notifications.warn(game.i18n.localize('spell-book.notifications.tooManySpells'));
        return;
      }

      // Update spell preparation state
      spell.update({ 'system.preparation.prepared': true }).then(() => app.render());
    }
  }

  /**
   * Handle unpreparing a spell
   * @param {Event} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   * @static
   */
  static unprepareSpell(event, target) {
    event.preventDefault();
    const app = this;
    const spellId = target.closest('.spell-item').dataset.spellId;
    const spell = app.actor.items.get(spellId);

    if (!spell) return;

    // Update spell preparation state
    spell.update({ 'system.preparation.prepared': false }).then(() => app.render());
  }

  /**
   * Handle saving changes
   * @param {Event} event - The originating click event
   * @static
   */
  static saveChanges(event) {
    event.preventDefault();
    const app = this;

    ui.notifications.info(game.i18n.localize('spell-book.notifications.spellsUpdated'));
    app.close();
  }

  /**
   * Handle canceling changes
   * @param {Event} event - The originating click event
   * @static
   */
  static cancel(event) {
    event.preventDefault();
    this.close();
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Group spells by level for display
   * @param {Array} spells - Array of spell items to group
   * @returns {Object} - Spells organized by level
   * @private
   */
  _groupSpellsByLevel(spells) {
    // Create a container for each level
    const levels = {};

    // Add cantrips (level 0)
    levels[0] = {
      level: 0,
      label: game.i18n.localize('spell-book.ui.cantrips'),
      spells: []
    };

    // Add spell levels 1-9
    for (let lvl = 1; lvl <= 9; lvl++) {
      levels[lvl] = {
        level: lvl,
        label: game.i18n.format('spell-book.ui.spellLevel', { level: lvl }),
        spells: []
      };
    }

    // Sort spells into levels
    for (const spell of spells) {
      const level = spell.system.level || 0;
      if (levels[level]) {
        levels[level].spells.push(spell);
      }
    }

    // Sort spells within each level by name
    for (const level of Object.values(levels)) {
      level.spells.sort((a, b) => a.name.localeCompare(b.name));
      level.hasSpells = level.spells.length > 0;
    }

    return levels;
  }

  /**
   * Load available spell lists for the actor's classes
   * @private
   * @async
   */
  async _loadClassSpellLists() {
    // Get all classes on the actor
    const actorClasses = this.actor.items.filter((item) => item.type === 'class');

    for (const actorClass of actorClasses) {
      const className = actorClass.name.toLowerCase();

      try {
        // Try to find a spell list for this class in our compendiums
        const spellList = await findSpellListInCompendium('class', className);

        if (spellList) {
          Logger.debug(`Found spell list for ${actorClass.name}`);

          // Load the spells
          const spells = await loadSpellsFromUuids(spellList.spellUuids);

          this.classSpellLists.push({
            class: actorClass.name,
            spells: spells
          });
        }
      } catch (error) {
        Logger.error(`Error loading spell list for ${actorClass.name}:`, error);
      }
    }

    // Re-render if we loaded spell lists
    if (this.classSpellLists.length > 0) {
      Logger.debug(`Loaded ${this.classSpellLists.length} class spell lists`);
      this.render();
    }
  }
}
