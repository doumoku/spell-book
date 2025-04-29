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
        dragSelector: '.filter-config-item[draggable="true"]',
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
    this.config = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
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
  _canDragStart(event, selector) {
    const element = event?.target?.closest('.filter-config-item');
    if (!element) return false;

    // Only allow dragging elements that have draggable="true"
    return element.getAttribute('draggable') === 'true';
  }

  /**
   * Define whether a user is able to drop on the target
   * @param {string} selector - The selector being dropped on
   * @returns {boolean} Whether the user can drop
   * @private
   */
  _canDragDrop(event, selector) {
    return true; // Allow dropping on the filter list
  }

  /**
   * Handle the start of dragging a filter
   * @param {DragEvent} event - The drag event
   * @private
   */
  _onDragStart(event) {
    // Only allow dragging sortable items
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
    // Important: Prevent the event AND stop propagation
    event.preventDefault();
    event.stopPropagation();

    try {
      log(1, 'Processing filter configuration form data', formData.object);

      // Get the current configuration from settings
      let currentConfig;
      try {
        currentConfig = game.settings.get(MODULE.ID, 'filterConfiguration');

        if (!currentConfig || !Array.isArray(currentConfig) || currentConfig.length === 0) {
          log(1, 'No valid configuration found in settings, using defaults');
          currentConfig = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
        }
      } catch (error) {
        log(1, 'Error retrieving configuration, using defaults:', error);
        currentConfig = foundry.utils.deepClone(DEFAULT_FILTER_CONFIG);
      }

      // Separate sortable and non-sortable filters
      const sortableFilters = [];
      const nonSortableFilters = [];

      for (const filter of currentConfig) {
        // Get enabled state from form data
        const enabledKey = `enabled-${filter.id}`;
        const enabled = formData.object[enabledKey] === true;

        // Make sure sortable property is preserved
        const sortable =
          filter.sortable !== undefined ? filter.sortable
          : filter.id === 'name' || filter.id === 'prepared' || filter.id === 'ritual' || filter.id === 'sortBy' ? false
          : true;

        log(1, `Filter ${filter.id} enabled: ${enabled}, sortable: ${sortable}`);

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

      // Combine all filters, ensuring non-sortable ones maintain their position
      const updatedConfig = [
        // First add non-sortable filters that should be at the top (search)
        ...nonSortableFilters.filter((f) => f.id === 'name'),
        // Then add sortable filters in their sorted order
        ...sortableFilters,
        // Then add remaining non-sortable filters (checkboxes and sort options)
        ...nonSortableFilters.filter((f) => f.id !== 'name')
      ];

      log(1, 'Saving updated configuration:', updatedConfig);

      // Save the configuration
      await game.settings.set(MODULE.ID, 'filterConfiguration', updatedConfig);

      // Show success message
      ui.notifications?.info('Filter configuration saved.');

      // Find the parent application
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
