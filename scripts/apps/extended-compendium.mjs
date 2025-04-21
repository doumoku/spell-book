import { MODULE } from '../constants.mjs';

export class ExtendedCompendiumBrowser extends dnd5e.applications.CompendiumBrowser {
  /**
   * @param {Object} options - Application options
   * @param {Actor5e} [options.actor] - The actor who is viewing spells
   * @param {string} [options.mode="browse"] - The mode to open in: "browse" or "prepare"
   */
  constructor(options = {}) {
    super(options);
    this.actor = options.actor || null;
    this.mode = options.mode || 'browse'; // "browse" or "prepare"
    this.preparedSpells = this.actor?.getFlag(MODULE.ID, MODULE.FLAGS.PREPARED_SPELLS) || [];

    // Force the active tab to be spell
    this.activeTab = 'spell';
  }

  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    id: 'spell-book-browser-{id}',
    classes: ['dnd5e', 'compendium-browser', 'spell-book-browser'],
    window: {
      title: 'Spell Book',
      width: 800,
      height: 700,
      resizable: true
    },
    tabs: [{ navSelector: "nav[data-group='primary']", contentSelector: '.tab-content', initial: 'spell' }]
  };

  /**
   * @override
   */
  async _renderHTML(context, options) {
    // Use our custom template instead of the system's
    return renderTemplate(MODULE.TEMPLATES.EXTENDED_COMPENDIUM, context);
  }

  /**
   * @override
   */
  async _prepareContext(options) {
    // Get context from parent class
    const context = await super._prepareContext(options);

    // Add our custom properties
    context.isPrepareMode = this.mode === 'prepare';
    context.preparedSpells = this.preparedSpells;

    // Ensure we only show the spell tab
    // First check if context.tabs exists
    if (!context.tabs) {
      // If tabs don't exist, create them
      context.tabs = [
        {
          tab: 'spell',
          label: 'ITEM.TypeSpellPl',
          icon: 'fas fa-magic',
          documentClass: 'Item',
          types: ['spell'],
          active: true
        }
      ];
    } else {
      // Filter to only show spell tab
      context.tabs = context.tabs.filter((t) => t.tab === 'spell');

      // Make sure we have at least one tab after filtering
      if (context.tabs.length > 0) {
        context.tabs[0].active = true;
      } else {
        // If no spell tab found, create one
        context.tabs = [
          {
            tab: 'spell',
            label: 'ITEM.TypeSpellPl',
            icon: 'fas fa-magic',
            documentClass: 'Item',
            types: ['spell'],
            active: true
          }
        ];
      }
    }

    return context;
  }

  /**
   * Override to modify browser entry template for spells
   * @override
   */
  async _renderBrowserContents() {
    await super._renderBrowserContents();

    // If we're in prepare mode, add preparation controls to each spell
    if (this.mode === 'prepare') {
      const items = this.element.querySelectorAll(".tab[data-tab='spell'] .item-list .item");

      for (const item of items) {
        const uuid = item.dataset.uuid;
        const isPrepared = this.preparedSpells.includes(uuid);

        // Add preparation toggle
        const controls = item.querySelector('.item-controls');
        const toggle = document.createElement('div');
        toggle.className = `spell-prepare-control ${isPrepared ? 'prepared' : ''}`;
        toggle.dataset.action = 'togglePreparation';
        toggle.dataset.uuid = uuid;
        toggle.title = isPrepared ? game.i18n.localize('SPELLBOOK.Unprepare') : game.i18n.localize('SPELLBOOK.Prepare');
        toggle.innerHTML = `<i class="fas ${isPrepared ? 'fa-check-circle' : 'fa-circle'}"></i>`;

        controls.appendChild(toggle);
      }

      // Add save/cancel buttons to the footer
      const footer = this.element.querySelector(".tab[data-tab='spell'] .footer");
      if (footer) {
        footer.innerHTML = `
          <div class="spell-book-footer">
            <button type="button" class="spell-book-cancel" data-action="cancel">
              ${game.i18n.localize('Cancel')}
            </button>
            <button type="button" class="spell-book-save" data-action="savePrepared">
              ${game.i18n.localize('SPELLBOOK.SavePrepared')}
            </button>
          </div>
        `;
      }
    }
  }

  /**
   * @override
   */
  _onClickAction(event, target) {
    const action = target.dataset.action;

    if (action === 'togglePreparation') {
      this._onTogglePreparation(event, target);
    } else if (action === 'savePrepared') {
      this._onSavePreparedSpells(event);
    } else if (action === 'cancel') {
      this.close();
    } else {
      // Handle standard browser actions
      super._onClickAction(event, target);
    }
  }

  /**
   * Handle toggling spell preparation status
   * @param {Event} event
   * @param {HTMLElement} target
   * @private
   */
  _onTogglePreparation(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;

    // Toggle prepared status
    const isPrepared = this.preparedSpells.includes(uuid);

    if (isPrepared) {
      this.preparedSpells = this.preparedSpells.filter((id) => id !== uuid);
      target.classList.remove('prepared');
      target.querySelector('i').classList.replace('fa-check-circle', 'fa-circle');
      target.title = game.i18n.localize('SPELLBOOK.Prepare');
    } else {
      this.preparedSpells.push(uuid);
      target.classList.add('prepared');
      target.querySelector('i').classList.replace('fa-circle', 'fa-check-circle');
      target.title = game.i18n.localize('SPELLBOOK.Unprepare');
    }
  }

  /**
   * Save prepared spells to the actor
   * @param {Event} event
   * @private
   */
  async _onSavePreparedSpells(event) {
    if (!this.actor) return;

    // Save to actor
    await this.actor.setFlag(MODULE.ID, MODULE.FLAGS.PREPARED_SPELLS, this.preparedSpells);

    ui.notifications.info(`${game.i18n.localize('SPELLBOOK.SpellsPrepared')} ${this.actor.name}`);
    this.close();
  }

  /**
   * Filter the results to only show spells available to the actor
   * @override
   */
  async _getFilteredResults(tab) {
    // Get filtered results from parent
    const results = await super._getFilteredResults(tab);

    // If we don't have an actor or this isn't the spell tab, return as-is
    if (!this.actor || tab !== 'spell') return results;

    // Get the actor's classes
    const actorClasses = this.actor.items.filter((i) => i.type === 'class').map((c) => c.name.toLowerCase());

    if (!actorClasses.length) return results;

    // Get spell lists for these classes from compendium
    const spellLists = new Set();
    const pack = game.packs.get(`${MODULE.ID}.custom-spell-lists`);

    if (pack) {
      // Look for class-specific spell lists
      const index = await pack.getIndex();

      for (const entry of index) {
        const doc = await pack.getDocument(entry._id);
        if (!doc) continue;

        // Check each page for class spell lists
        for (const page of doc.pages) {
          const matchingClass = actorClasses.find((c) => page.name.toLowerCase().includes(`${c} spell list`));

          if (matchingClass) {
            try {
              const content = page.text?.content || '';
              const spellData = content.match(/{.*}/s);

              if (spellData && spellData[0]) {
                const spellList = JSON.parse(spellData[0]);
                spellList.spells.forEach((uuid) => spellLists.add(uuid));
              }
            } catch (error) {
              console.error(`${MODULE.ID} | Error parsing spell list:`, error);
            }
          }
        }
      }
    }

    // Filter to only include spells in the spell lists
    if (spellLists.size > 0) {
      return results.filter((result) => spellLists.has(result.uuid));
    }

    return results;
  }
}
