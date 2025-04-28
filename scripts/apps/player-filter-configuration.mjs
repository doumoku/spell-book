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
    form: {
      handler: PlayerFilterConfiguration.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    window: {
      title: 'SPELLBOOK.Settings.ConfigureFilters',
      width: 400,
      height: 'auto',
      resizable: true,
      minimizable: false
    },
    classes: ['filter-configuration'],
    actions: {
      reset: PlayerFilterConfiguration.handleReset
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
    this.config = structuredClone(game.settings.get(MODULE.ID, 'filterConfiguration') || DEFAULT_FILTER_CONFIG);
    this.#dragDrop = this.#createDragDropHandlers();
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

    // Important: Set the data transfer properly
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
    // We need to prevent default to allow dropping
    event.preventDefault();

    const list = this.element.querySelector('.filter-config-list');
    if (!list) return;

    // Find the dragging element
    const draggingItem = list.querySelector('.dragging');
    if (!draggingItem) return;

    // Get all non-dragging items as potential drop targets
    const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
    if (!items.length) return;

    // Find the item we're dragging over
    const targetItem = this._getDragTarget(event, items);
    if (!targetItem) return;

    // Visual indicator for drop position
    const rect = targetItem.getBoundingClientRect();
    const dropAfter = event.clientY > rect.top + rect.height / 2;

    // Remove any existing placeholders
    const placeholders = list.querySelectorAll('.drop-placeholder');
    placeholders.forEach((el) => el.remove());

    // Create and insert placeholder
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
      // Get the dragging element directly from the DOM
      const list = this.element.querySelector('.filter-config-list');
      const draggingItem = list.querySelector('.dragging');
      if (!draggingItem) return;

      const sourceIndex = parseInt(draggingItem.dataset.index);
      if (isNaN(sourceIndex)) return;

      // Get all non-dragging items
      const items = Array.from(list.querySelectorAll('li:not(.dragging)'));

      // Find the drop target
      const targetItem = this._getDragTarget(event, items);
      if (!targetItem) {
        draggingItem.classList.remove('dragging');
        return;
      }

      const targetIndex = parseInt(targetItem.dataset.index);
      if (isNaN(targetIndex)) {
        draggingItem.classList.remove('dragging');
        return;
      }

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
        filter.order = idx;
      });

      // Clean up
      draggingItem.classList.remove('dragging');
      const placeholders = list.querySelectorAll('.drop-placeholder');
      placeholders.forEach((el) => el.remove());

      // Re-render the application to reflect changes
      this.render(false);

      log(1, `Reordered filter from position ${sourceIndex} to ${newIndex}`);
      return true;
    } catch (error) {
      log(1, 'Error in drop handler:', error);
      // Clean up in case of error
      const draggingItems = this.element.querySelectorAll('.dragging');
      draggingItems.forEach((el) => el.classList.remove('dragging'));
      const placeholders = this.element.querySelectorAll('.drop-placeholder');
      placeholders.forEach((el) => el.remove());
      return false;
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
   * @returns {Promise<void>}
   */
  static async formHandler(event, form, formData) {
    log(1, 'Processing filter configuration form data');

    try {
      // Update the config from form values
      const workingConfig = this.config;

      for (const filter of workingConfig) {
        const enabledCheckbox = form.querySelector(`input[name="enabled-${filter.id}"]`);
        // We no longer need to get the order input as it's handled by drag and drop
        if (enabledCheckbox) filter.enabled = enabledCheckbox.checked;
      }

      log(1, 'Saving filter configuration:', workingConfig);

      // Save the updated config
      await game.settings.set(MODULE.ID, 'filterConfiguration', workingConfig);

      // Re-render the parent application if it exists
      if (this.parentApp && this.parentApp.rendered) {
        this.parentApp.render(false);
      }

      return true;
    } catch (error) {
      log(1, 'Error saving filter config:', error);
      return false;
    }
  }

  /**
   * Handle reset button click
   * @param {Event} event - The click event
   * @param {HTMLFormElement} form - The form element
   * @static
   */
  static async handleReset(event, form) {
    log(1, 'Reset button clicked');

    try {
      // Reset to defaults
      await game.settings.set(MODULE.ID, 'filterConfiguration', DEFAULT_FILTER_CONFIG);

      // Get this instance from the clicked button's parent application
      this.config = structuredClone(DEFAULT_FILTER_CONFIG);

      // Re-render this application to show the changes
      this.render(false);

      // Re-render the parent application if needed
      if (this.parentApp && this.parentApp.rendered) {
        this.parentApp.render(false);
      }

      return true;
    } catch (error) {
      log(1, 'Error resetting filter config:', error);
      return false;
    }
  }
}
