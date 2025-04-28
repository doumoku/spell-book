import { DEFAULT_FILTER_CONFIG, MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PlayerFilterConfiguration extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `filter-config-${MODULE.ID}`,
    tag: 'form',
    window: {
      title: 'SPELLBOOK.Settings.ConfigureFilters',
      width: 400,
      height: 'auto',
      resizable: true,
      minimizable: false
    },
    classes: ['filter-configuration'],
    form: {
      handler: PlayerFilterConfiguration.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    position: {
      top: 100
    },
    dragDrop: [{ dragSelector: '.filter-config-item', dropSelector: '.filter-config-list' }]
  };

  /** @override */
  static PARTS = {
    form: { template: MODULE.TEMPLATES.FILTER_CONFIG }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The parent application
   * @type {PlayerSpellBook}
   */
  parentApp = null;

  /**
   * The configuration being edited
   * @type {Array}
   */
  config = [];

  /**
   * DragDrop handlers
   * @type {DragDrop[]}
   */
  #dragDrop;

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * @param {PlayerSpellBook} parentApp - The parent application
   * @param {object} options - ApplicationV2 options
   */
  constructor(parentApp, options = {}) {
    super(options);
    this.parentApp = parentApp;

    // Initialize the configuration
    this.#initializeConfig();
    this.#dragDrop = this.#createDragDropHandlers();
  }

  /**
   * Initialize the filter configuration from settings
   * @private
   */
  #initializeConfig() {
    try {
      let config = game.settings.get(MODULE.ID, 'filterConfiguration');
      log(1, 'Retrieved filter configuration from settings', config);

      // Validate the configuration
      if (!config || !Array.isArray(config) || config.length === 0) {
        log(1, 'No valid configuration found, using defaults');
        config = structuredClone(DEFAULT_FILTER_CONFIG);
      }

      this.config = structuredClone(config);
    } catch (error) {
      log(1, 'Error initializing filter configuration:', error);
      this.config = structuredClone(DEFAULT_FILTER_CONFIG);
    }

    log(1, 'Configuration initialized', this.config);
  }

  /**
   * Create drag-and-drop workflow handlers for this Application
   * @returns {DragDrop[]}     An array of DragDrop handlers
   * @private
   */
  #createDragDropHandlers() {
    return this.options.dragDrop.map((d) => {
      d.permissions = {
        dragstart: this._canDragStart.bind(this),
        drop: this._canDragDrop.bind(this)
      };
      d.callbacks = {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this)
      };
      return new DragDrop(d);
    });
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /**
   * @override
   */
  async _prepareContext(options) {
    // Ensure we have valid configuration data
    if (!Array.isArray(this.config) || this.config.length === 0) {
      log(1, 'Invalid configuration in _prepareContext, reinitializing');
      this.#initializeConfig();
    }

    log(1, 'Preparing context with configuration', this.config);

    return {
      filterConfig: this.config,
      buttons: [
        { type: 'submit', icon: 'fas fa-save', label: 'SETTINGS.Save' },
        { type: 'button', action: 'reset', icon: 'fas fa-undo', label: 'SETTINGS.Reset' }
      ]
    };
  }

  /**
   * @override
   */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.modal = true;
    return options;
  }

  /**
   * @override
   */
  _onRender(context, options) {
    this.#dragDrop.forEach((d) => d.bind(this.element));

    // Add reset button handler
    const resetBtn = this.element.querySelector('button[data-action="reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', this._onReset.bind(this));
    }
  }

  /**
   * Handle reset button click
   * @param {Event} event - The click event
   * @private
   */
  async _onReset(event) {
    event.preventDefault();

    log(1, 'Reset button clicked, restoring defaults');
    this.config = structuredClone(DEFAULT_FILTER_CONFIG);
    this.render(false);
  }

  /* -------------------------------------------- */
  /*  Drag & Drop Handlers                        */
  /* -------------------------------------------- */

  /**
   * Define whether a user is able to begin a dragstart workflow
   * @param {string} selector - The selector being dragged
   * @returns {boolean} Whether the user can drag
   * @private
   */
  _canDragStart(selector) {
    return true; // Allow dragging the filter items
  }

  /**
   * Define whether a user is able to drop on the target
   * @param {string} selector - The selector being dropped on
   * @returns {boolean} Whether the user can drop
   * @private
   */
  _canDragDrop(selector) {
    return true; // Allow dropping on the filter list
  }

  /**
   * Handle the start of dragging a filter
   * @param {DragEvent} event - The drag event
   * @private
   */
  _onDragStart(event) {
    const li = event.currentTarget.closest('li');
    if (!li) return;

    // Set the data transfer with the filter index
    const filterIndex = li.dataset.index;

    event.dataTransfer.setData(
      'text/plain',
      JSON.stringify({
        type: 'filter-config',
        index: filterIndex
      })
    );

    // Add dragging class for styling
    li.classList.add('dragging');
  }

  /**
   * Handle drag over event
   * @param {DragEvent} event - The drag event
   * @private
   */
  _onDragOver(event) {
    event.preventDefault();

    // Only try to parse data if we're later in the drag process
    let dragData;
    try {
      const dataString = event.dataTransfer.getData('text/plain');
      if (dataString) {
        dragData = JSON.parse(dataString);
      }
    } catch (error) {
      // Early drag events might not have data yet, just continue
    }

    const list = this.element.querySelector('.filter-config-list');
    if (!list) return;

    // Find the dragging element directly
    const draggingItem = list.querySelector('.dragging');
    if (!draggingItem) return;

    // Get all items except the one being dragged
    const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
    if (!items.length) return;

    // Find the target item based on mouse position
    const targetItem = this._getDragTarget(event, items);
    if (!targetItem) return;

    // Calculate if we should drop before or after the target
    const rect = targetItem.getBoundingClientRect();
    const dropAfter = event.clientY > rect.top + rect.height / 2;

    // Remove any existing placeholders
    const placeholders = list.querySelectorAll('.drop-placeholder');
    placeholders.forEach((el) => el.remove());

    // Create a placeholder to show where the item will be dropped
    const placeholder = document.createElement('div');
    placeholder.classList.add('drop-placeholder');

    if (dropAfter) {
      targetItem.after(placeholder);
    } else {
      targetItem.before(placeholder);
    }
  }

  /**
   * Get the target element to drop near based on mouse position
   * @param {DragEvent} event - The drag event
   * @param {HTMLElement[]} items - Array of valid drop targets
   * @returns {HTMLElement|null} The closest drop target
   * @private
   */
  _getDragTarget(event, items) {
    return (
      items.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = event.clientY - (box.top + box.height / 2);

        if (closest === null || Math.abs(offset) < Math.abs(closest.offset)) {
          return { element: child, offset: offset };
        } else {
          return closest;
        }
      }, null)?.element || null
    );
  }

  /**
   * Handle dropping a filter to reorder
   * @param {DragEvent} event - The drag event
   * @private
   */
  async _onDrop(event) {
    event.preventDefault();

    try {
      // Get drag data
      const dataString = event.dataTransfer.getData('text/plain');
      if (!dataString) return;

      const data = JSON.parse(dataString);
      if (!data || data.type !== 'filter-config') return;

      const sourceIndex = parseInt(data.index);
      if (isNaN(sourceIndex)) return;

      // Find the drop target
      const list = this.element.querySelector('.filter-config-list');
      const items = Array.from(list.querySelectorAll('li:not(.dragging)'));

      const targetItem = this._getDragTarget(event, items);
      if (!targetItem) return;

      const targetIndex = parseInt(targetItem.dataset.index);
      if (isNaN(targetIndex)) return;

      // Determine if dropping before or after target
      const rect = targetItem.getBoundingClientRect();
      const dropAfter = event.clientY > rect.top + rect.height / 2;
      let newIndex = dropAfter ? targetIndex + 1 : targetIndex;

      // Adjust for moving down (source index is removed first)
      if (sourceIndex < newIndex) newIndex--;

      // Reorder the configuration array
      const [movedItem] = this.config.splice(sourceIndex, 1);
      this.config.splice(newIndex, 0, movedItem);

      // Update order numbers
      this.config.forEach((filter, idx) => {
        filter.order = (idx + 1) * 10;
      });

      // Re-render to update the UI
      this.render(false);

      log(1, `Reordered filter from position ${sourceIndex} to ${newIndex}`);
      return true;
    } catch (error) {
      log(1, 'Error in drop handler:', error);
      return false;
    } finally {
      // Clean up any visual elements
      const draggingItems = this.element.querySelectorAll('.dragging');
      draggingItems.forEach((el) => el.classList.remove('dragging'));
      const placeholders = this.element.querySelectorAll('.drop-placeholder');
      placeholders.forEach((el) => el.remove());
    }
  }

  /* -------------------------------------------- */
  /*  Form Handling                               */
  /* -------------------------------------------- */

  /**
   * Handle form submission
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<boolean>}
   * @static
   */
  static async formHandler(event, form, formData) {
    event.preventDefault();

    try {
      log(1, 'Processing filter configuration form data', formData.object);

      // Get the current configuration from settings
      let currentConfig;
      try {
        currentConfig = game.settings.get(MODULE.ID, 'filterConfiguration');

        if (!currentConfig || !Array.isArray(currentConfig) || currentConfig.length === 0) {
          log(1, 'No valid configuration found in settings, using defaults');
          currentConfig = structuredClone(DEFAULT_FILTER_CONFIG);
        }
      } catch (error) {
        log(1, 'Error retrieving configuration, using defaults:', error);
        currentConfig = structuredClone(DEFAULT_FILTER_CONFIG);
      }

      // Extract updates from form data
      const updates = [];

      for (const filter of currentConfig) {
        // Get enabled state from form data - use the actual boolean value
        const enabledKey = `enabled-${filter.id}`;
        const enabled = formData.object[enabledKey] === true;

        log(1, `Filter ${filter.id} enabled: ${enabled}, formData value: ${formData.object[enabledKey]}`);

        // Find the matching item in the DOM to get its current position
        const item = form.querySelector(`li[data-filter-id="${filter.id}"]`);
        const index = item ? parseInt(item.dataset.index) : null;

        // Update the filter with form values
        updates.push({
          ...filter,
          enabled: enabled,
          order: index !== null ? (index + 1) * 10 : filter.order
        });
      }

      // Sort by the current DOM order
      updates.sort((a, b) => a.order - b.order);

      log(1, 'Saving updated configuration:', updates);

      // Save the configuration
      await game.settings.set(MODULE.ID, 'filterConfiguration', updates);

      // Show success message
      ui.notifications?.info('Filter configuration saved.');

      if (this.parentApp) {
        log(1, 'Refreshing parent application:', this.parentApp.constructor.name);
        this.parentApp.render(false);
      } else {
        log(1, 'No parent application reference found');
      }

      log(1, 'Filter configuration saved successfully');
      return true;
    } catch (error) {
      log(1, 'Error saving filter configuration:', error);
      console.error(error);
      ui.notifications?.error('Failed to save filter configuration.');
      return false;
    }
  }
}
