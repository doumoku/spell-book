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
    actions: {
      reset: PlayerFilterConfiguration.handleReset
    },
    position: {
      top: 100
    }
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
        const orderInput = form.querySelector(`input[name="order-${filter.id}"]`);

        if (enabledCheckbox) filter.enabled = enabledCheckbox.checked;
        if (orderInput) filter.order = parseInt(orderInput.value) || filter.order;
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
