import { MODULE } from '../constants.mjs';

export class SpellListManager extends Application {
  constructor(options = {}) {
    super(options);

    // Current state
    this.pack = game.packs.get(`${MODULE.ID}.custom-spell-lists`);
    this.entries = [];
    this.selectedEntry = null;
    this.selectedPage = null;
    this.spells = [];
    this.selectedSpells = [];
    this.isEditing = false;

    // Load initial data
    this._loadCompendiumEntries();
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'spell-list-manager',
      classes: ['dnd5e', 'spell-book', 'spell-list-manager'],
      template: MODULE.TEMPLATES.SPELL_LIST_MANAGER,
      width: 800,
      height: 600,
      resizable: true,
      title: game.i18n.localize('SPELLBOOK.SpellListManager')
    });
  }

  async getData() {
    const context = {
      entries: this.entries,
      selectedEntry: this.selectedEntry,
      selectedPage: this.selectedPage,
      spells: this.spells,
      selectedSpells: this.selectedSpells,
      isEditing: this.isEditing,
      hasCompendium: !!this.pack
    };

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Entry selection
    html.find('.entry-select').change(this._onEntrySelect.bind(this));

    // Page selection
    html.find('.page-select').change(this._onPageSelect.bind(this));

    // Edit button
    html.find('.edit-list-btn').click(this._onEditList.bind(this));

    // Create new list button
    html.find('.new-list-btn').click(this._onNewList.bind(this));

    // Spell toggle
    html.find('.spell-toggle').click(this._onSpellToggle.bind(this));

    // Save button
    html.find('.save-btn').click(this._onSaveList.bind(this));

    // Cancel button
    html.find('.cancel-btn').click(this._onCancelEdit.bind(this));
  }

  /**
   * Load available journal entries from the compendium
   * @private
   */
  async _loadCompendiumEntries() {
    if (!this.pack) {
      console.error(`${MODULE.ID} | Could not find compendium pack: custom-spell-lists`);
      return;
    }

    // Get index of compendium
    const index = await this.pack.getIndex();

    this.entries = index.map((entry) => {
      return {
        id: entry._id,
        name: entry.name
      };
    });

    // If we have entries, select the first one
    if (this.entries.length > 0) {
      this.selectedEntry = this.entries[0].id;
      await this._loadPages();
    }

    this.render();
  }

  /**
   * Load pages for selected journal entry
   * @private
   */
  async _loadPages() {
    if (!this.pack || !this.selectedEntry) return;

    // Get the document from the compendium
    const journalEntry = await this.pack.getDocument(this.selectedEntry);

    if (!journalEntry) {
      this.pages = [];
      this.selectedPage = null;
      return;
    }

    this.pages = journalEntry.pages.map((p) => {
      return {
        id: p.id,
        name: p.name
      };
    });

    // If we have pages, select the first one
    if (this.pages.length > 0) {
      this.selectedPage = this.pages[0].id;
      await this._loadSpells();
    } else {
      this.selectedPage = null;
      this.spells = [];
    }
  }

  /**
   * Load spells for selected page
   * @private
   */
  async _loadSpells() {
    if (!this.pack || !this.selectedEntry || !this.selectedPage) {
      this.spells = [];
      return;
    }

    // Get the document from the compendium
    const journalEntry = await this.pack.getDocument(this.selectedEntry);

    if (!journalEntry) {
      this.spells = [];
      return;
    }

    const page = journalEntry.pages.get(this.selectedPage);

    if (!page) {
      this.spells = [];
      return;
    }

    // Try to parse spells from the page content
    try {
      const content = page.text?.content || '';
      const spellData = content.match(/{.*}/s);

      if (spellData && spellData[0]) {
        const spellList = JSON.parse(spellData[0]);

        this.selectedSpells = spellList.spells || [];

        // Load spell details for display
        this.spells = [];
        for (const uuid of this.selectedSpells) {
          try {
            const spell = await fromUuid(uuid);
            if (spell) {
              this.spells.push({
                uuid: uuid,
                name: spell.name,
                img: spell.img,
                level: spell.system.level,
                school: spell.system.school,
                selected: true
              });
            }
          } catch (error) {
            console.warn(`${MODULE.ID} | Error loading spell ${uuid}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn(`${MODULE.ID} | Error parsing spell list:`, error);
      this.spells = [];
      this.selectedSpells = [];
    }
  }

  /**
   * Load all available spells from compendiums
   * @private
   */
  async _loadAllSpells() {
    this.spells = [];

    // Get all item packs
    const packs = game.packs.filter((p) => p.documentName === 'Item');

    for (const pack of packs) {
      try {
        // Get the index
        const index = await pack.getIndex();

        // Find all spells
        const spellEntries = index.filter((i) => i.type === 'spell');

        for (const entry of spellEntries) {
          const uuid = `Compendium.${pack.collection}.${entry._id}`;
          const isSelected = this.selectedSpells.includes(uuid);

          this.spells.push({
            uuid: uuid,
            name: entry.name,
            img: entry.img,
            level: entry.system?.level || 0,
            school: entry.system?.school || '',
            selected: isSelected
          });
        }
      } catch (error) {
        console.warn(`${MODULE.ID} | Error loading spells from pack ${pack.title}:`, error);
      }
    }

    // Sort by level and name
    this.spells.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Handle entry selection
   * @param {Event} event
   * @private
   */
  async _onEntrySelect(event) {
    event.preventDefault();
    this.selectedEntry = event.currentTarget.value;
    await this._loadPages();
    this.render();
  }

  /**
   * Handle page selection
   * @param {Event} event
   * @private
   */
  async _onPageSelect(event) {
    event.preventDefault();
    this.selectedPage = event.currentTarget.value;
    await this._loadSpells();
    this.render();
  }

  /**
   * Handle edit button click
   * @param {Event} event
   * @private
   */
  async _onEditList(event) {
    event.preventDefault();
    this.isEditing = true;
    await this._loadAllSpells();
    this.render();
  }

  /**
   * Handle new list button click
   * @param {Event} event
   * @private
   */
  async _onNewList(event) {
    event.preventDefault();

    // Create dialog to get list name
    const dialog = new Dialog({
      title: game.i18n.localize('SPELLBOOK.NewList'),
      content: `
        <form>
          <div class="form-group">
            <label for="list-name">${game.i18n.localize('SPELLBOOK.ListName')}</label>
            <input type="text" id="list-name" name="listName">
          </div>
        </form>
      `,
      buttons: {
        create: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize('Create'),
          callback: async (html) => {
            const listName = html.find('#list-name').val();

            if (!listName) return;

            // Create new document in the compendium
            if (!this.pack) {
              ui.notifications.error(game.i18n.localize('SPELLBOOK.NoCompendium'));
              return;
            }

            try {
              // Create a temporary document
              const tempDoc = await JournalEntry.create({
                name: listName,
                pages: [
                  {
                    name: 'Default',
                    type: 'text',
                    text: { content: '{"spells":[]}' }
                  }
                ]
              });

              // Import to compendium
              await this.pack.importDocument(tempDoc);

              // Delete the temporary document
              await tempDoc.delete();

              // Refresh entries
              await this._loadCompendiumEntries();

              ui.notifications.info(game.i18n.localize('SPELLBOOK.ListCreated'));
            } catch (error) {
              console.error(`${MODULE.ID} | Error creating list:`, error);
              ui.notifications.error(game.i18n.localize('SPELLBOOK.ErrorCreatingList'));
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize('Cancel')
        }
      },
      default: 'create'
    });

    dialog.render(true);
  }

  /**
   * Handle spell toggle
   * @param {Event} event
   * @private
   */
  _onSpellToggle(event) {
    event.preventDefault();
    const uuid = event.currentTarget.dataset.uuid;

    // Toggle selection
    const index = this.selectedSpells.indexOf(uuid);

    if (index === -1) {
      this.selectedSpells.push(uuid);
    } else {
      this.selectedSpells.splice(index, 1);
    }

    // Update UI
    const spell = this.spells.find((s) => s.uuid === uuid);
    if (spell) {
      spell.selected = !spell.selected;
    }

    this.render();
  }

  /**
   * Handle save button click
   * @param {Event} event
   * @private
   */
  async _onSaveList(event) {
    event.preventDefault();

    if (!this.pack || !this.selectedEntry || !this.selectedPage) return;

    // Get the document from the compendium
    try {
      const journalEntry = await this.pack.getDocument(this.selectedEntry);

      if (!journalEntry) return;

      const page = journalEntry.pages.get(this.selectedPage);

      if (!page) return;

      // Create JSON content
      const content = JSON.stringify({ spells: this.selectedSpells }, null, 2);

      // Create a temporary copy of the document
      const tempDoc = journalEntry.toObject();

      // Update the page content
      const pageIndex = tempDoc.pages.findIndex((p) => p._id === this.selectedPage);
      if (pageIndex >= 0) {
        tempDoc.pages[pageIndex].text.content = content;
      }

      // Create a temporary document
      const updatedDoc = await JournalEntry.create(tempDoc);

      // Import back to compendium (replace)
      await this.pack.importDocument(updatedDoc, { keepId: true });

      // Delete the temporary document
      await updatedDoc.delete();

      // Reset state
      this.isEditing = false;
      await this._loadSpells();

      ui.notifications.info(game.i18n.localize('SPELLBOOK.ListSaved'));

      this.render();
    } catch (error) {
      console.error(`${MODULE.ID} | Error saving list:`, error);
      ui.notifications.error(game.i18n.localize('SPELLBOOK.ErrorSavingList'));
    }
  }

  /**
   * Handle cancel button click
   * @param {Event} event
   * @private
   */
  _onCancelEdit(event) {
    event.preventDefault();
    this.isEditing = false;
    this.render();
  }
}
