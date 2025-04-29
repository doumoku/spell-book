import { DEFAULT_FILTER_CONFIG, MODULE } from '../constants.mjs';
import { log } from '../logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for configuring filter settings in the Spell Book
 * Allows users to enable/disable filters and change their display order
 */
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
      width: '',
      height: '',
      resizable: false,
      minimizable: true
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
    dragDrop: [
      {
        dragSelector: '.filter-config-item',
        dropSelector: '.filter-config-list'
      }
    ]
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
   * @private
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
      log(3, 'Retrieved filter configuration from settings', config);

      // Validate the configuration
      if (!config || !Array.isArray(config) || config.length === 0) {
        log(2, 'No valid configuration found, using defaults');
        config = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
      } else {
        // Ensure all filters have the sortable property
        config = config.map((filter) => {
          // If the filter exists in DEFAULT_FILTER_CONFIG, use that sortable value
          const defaultFilter = DEFAULT_FILTER_CONFIG.find((df) => df.id === filter.id);

          if (defaultFilter) {
            return {
              ...filter,
              sortable: defaultFilter.sortable !== undefined ? defaultFilter.sortable : true
            };
          }

          // Otherwise, default to sortable
          return {
            ...filter,
            sortable: filter.sortable !== undefined ? filter.sortable : true
          };
        });
      }

      this.config = foundry.utils.deepClone(config);
    } catch (error) {
      log(1, 'Error initializing filter configuration:', error);
      this.config = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
    }

    log(3, 'Configuration initialized', this.config);
  }

  /**
   * Create drag-and-drop workflow handlers for this Application
   * @returns {DragDrop[]} An array of DragDrop handlers
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
  _prepareContext(options) {
    // Ensure we have valid configuration data
    if (!Array.isArray(this.config) || this.config.length === 0) {
      log(2, 'Invalid configuration in _prepareContext, reinitializing');
      this.#initializeConfig();
    }

    // Ensure sortable property is properly set for each filter
    this.config = this.config.map((filter) => {
      // Make sure filter has a proper sortable boolean value
      const sortable = !(filter.id === 'name' || filter.id === 'prepared' || filter.id === 'ritual' || filter.id === 'sortBy');
      return {
        ...filter,
        sortable: filter.sortable !== undefined ? filter.sortable : sortable
      };
    });

    log(3, 'Preparing context with configuration', this.config);

    return {
      filterConfig: this.config,
      buttons: [
        { type: 'submit', icon: 'fas fa-save', label: 'SPELLBOOK.UI.Save' },
        { type: 'button', action: 'reset', icon: 'fas fa-undo', label: 'SPELLBOOK.UI.Reset' }
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
    // Set draggable attributes programmatically
    this.#setDraggableAttributes();

    // Now bind the drag handlers
    this.#dragDrop.forEach((d) => d.bind(this.element));
    log(3, 'Bound dragDrop handlers to element');

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

    log(3, 'Reset button clicked, restoring defaults');
    this.config = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
    this.render(false);
  }

  /* -------------------------------------------- */
  /*  Drag & Drop Handlers                        */
  /* -------------------------------------------- */

  /**
   * Define whether a user is able to begin a dragstart workflow
   * @param {DragEvent} _event - The drag event
   * @param {string} _selector - The selector being dragged
   * @returns {boolean} Whether the user can drag
   * @private
   */
  _canDragStart(_event, _selector) {
    return true;
  }

  /**
   * Define whether a user is able to drop on the target
   * @param {DragEvent} _event - The drag event
   * @param {string} _selector - The selector being dropped on
   * @returns {boolean} Whether the user can drop
   * @private
   */
  _canDragDrop(_event, _selector) {
    return true; // Allow dropping on the filter list
  }

  /**
   * Handle the start of dragging a filter
   * @param {DragEvent} event - The drag event
   * @private
   */
  _onDragStart(event) {
    const li = event.currentTarget.closest('li');
    if (!li || li.classList.contains('not-sortable')) return false;

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
   * @param {string} _selector - The target selector
   * @private
   */
  _onDragOver(event, _selector) {
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
    this.#createDropPlaceholder(targetItem, dropAfter);
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

      log(3, `Reordered filter from position ${sourceIndex} to ${newIndex}`);
      return true;
    } catch (error) {
      log(1, 'Error in drop handler:', error);
      return false;
    } finally {
      this.#cleanupDragElements();
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
    // Important: Prevent the event AND stop propagation
    event.preventDefault();
    event.stopPropagation();

    try {
      log(3, 'Processing filter configuration form data', formData.object);

      // Get the current configuration
      const currentConfig = PlayerFilterConfiguration.#getValidConfiguration();

      // Process filters into sortable/non-sortable groups
      const { sortableFilters, nonSortableFilters } = PlayerFilterConfiguration.#processSortableFilters(currentConfig, formData.object);

      // Update filter ordering
      const sortedFilters = PlayerFilterConfiguration.#updateFilterOrder(sortableFilters, form);

      // Combine all filters, ensuring non-sortable ones maintain their position
      const updatedConfig = [
        // First add non-sortable filters that should be at the top (search)
        ...nonSortableFilters.filter((f) => f.id === 'name'),
        // Then add sortable filters in their sorted order
        ...sortedFilters,
        // Then add remaining non-sortable filters (checkboxes and sort options)
        ...nonSortableFilters.filter((f) => f.id !== 'name')
      ];

      log(3, 'Saving updated configuration');

      // Save the configuration
      await game.settings.set(MODULE.ID, 'filterConfiguration', updatedConfig);

      // Show success message
      ui.notifications?.info('Filter configuration saved.');

      // Find the parent application
      if (this.parentApp) {
        log(3, 'Refreshing parent application');
        this.parentApp.render(false);
      } else {
        log(2, 'No parent application reference found');
      }

      log(3, 'Filter configuration saved successfully');
      return true;
    } catch (error) {
      log(1, 'Error saving filter configuration:', error);
      console.error(error);
      ui.notifications?.error('Failed to save filter configuration.');
      return false;
    }
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Create a drop placeholder element
   * @param {HTMLElement} targetItem - The target item
   * @param {boolean} dropAfter - Whether to place after (true) or before (false)
   * @private
   */
  #createDropPlaceholder(targetItem, dropAfter) {
    // Remove any existing placeholders
    this.#removeDropPlaceholders();

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
   * Remove all drop placeholders from the document
   * @private
   */
  #removeDropPlaceholders() {
    const placeholders = this.element.querySelectorAll('.drop-placeholder');
    placeholders.forEach((el) => el.remove());
  }

  /**
   * Clean up visual elements after a drag operation
   * @private
   */
  #cleanupDragElements() {
    const draggingItems = this.element.querySelectorAll('.dragging');
    draggingItems.forEach((el) => el.classList.remove('dragging'));
    this.#removeDropPlaceholders();
  }

  /**
   * Set draggable attributes on all filter items
   * @private
   */
  #setDraggableAttributes() {
    const items = this.element.querySelectorAll('.filter-config-item');
    items.forEach((item) => {
      const li = item.closest('li');
      const isSortable = !li.classList.contains('not-sortable');
      item.setAttribute('draggable', isSortable ? 'true' : 'false');
      log(3, `Setting draggable=${isSortable ? 'true' : 'false'} for ${li.dataset.filterId}`);
    });
  }

  /**
   * Get and validate the current filter configuration
   * @returns {Array} The current valid filter configuration
   * @static
   * @private
   */
  static #getValidConfiguration() {
    try {
      const config = game.settings.get(MODULE.ID, 'filterConfiguration');
      if (!config || !Array.isArray(config) || config.length === 0) {
        log(2, 'No valid configuration found in settings, using defaults');
        return foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
      }
      return config;
    } catch (error) {
      log(1, 'Error retrieving configuration, using defaults:', error);
      return foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
    }
  }

  /**
   * Process filters and separate them by sortable status
   * @param {Array} filterConfig - The filter configuration
   * @param {Object} formData - Form data with enabled states
   * @returns {Object} Object with sortable and non-sortable filter arrays
   * @static
   * @private
   */
  static #processSortableFilters(filterConfig, formData) {
    const sortableFilters = [];
    const nonSortableFilters = [];

    for (const filter of filterConfig) {
      // Get enabled state from form data
      const enabledKey = `enabled-${filter.id}`;
      const enabled = formData[enabledKey] === true;

      // Make sure sortable property is preserved
      const sortable = filter.sortable !== undefined ? filter.sortable : !['name', 'prepared', 'ritual', 'sortBy'].includes(filter.id);

      log(3, `Filter ${filter.id} enabled: ${enabled}, sortable: ${sortable}`);

      // Create updated filter with enabled state from form
      const updatedFilter = {
        ...filter,
        enabled: enabled,
        sortable: sortable
      };

      // Sort into appropriate category
      if (sortable) {
        sortableFilters.push(updatedFilter);
      } else {
        nonSortableFilters.push(updatedFilter);
      }
    }

    return { sortableFilters, nonSortableFilters };
  }

  /**
   * Create order mapping and sort filters
   * @param {Array} sortableFilters - Array of sortable filters
   * @param {HTMLFormElement} form - The form element
   * @returns {Array} Sorted array of filters with updated order values
   * @static
   * @private
   */
  static #updateFilterOrder(sortableFilters, form) {
    // Get order for sortable filters from the DOM
    const sortableFilterElements = Array.from(form.querySelectorAll('.filter-item:not(.not-sortable)'));

    // Create a mapping of filter IDs to their positions in the DOM
    const orderMap = {};
    sortableFilterElements.forEach((el, idx) => {
      const filterId = el.dataset.filterId;
      if (filterId) orderMap[filterId] = idx;
    });

    // Sort the sortable filters based on their DOM position
    sortableFilters.sort((a, b) => {
      const orderA = orderMap[a.id] !== undefined ? orderMap[a.id] : a.order;
      const orderB = orderMap[b.id] !== undefined ? orderMap[b.id] : b.order;
      return orderA - orderB;
    });

    // Update the order values for sortable filters
    let nextOrder = 20; // Start after search filter
    sortableFilters.forEach((filter) => {
      filter.order = nextOrder;
      nextOrder += 10;
    });

    return sortableFilters;
  }
}
