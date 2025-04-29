/**
 * Filter helper functions for the Spell Book module
 * @module spell-book/helpers/filters
 */

import { MODULE } from '../constants.mjs';

/**
 * Convert a spell range to feet (or meters based on settings)
 * @param {string} units - The range units (feet, miles, etc)
 * @param {number} value - The range value
 * @returns {number} - The converted range value
 */
export function convertRangeToStandardUnit(units, value) {
  if (!units || !value) return 0;

  const targetUnit = game.settings.get(MODULE.ID, 'distanceUnit');
  let inFeet = 0;

  // Convert to feet first
  switch (units) {
    case 'ft':
      inFeet = value;
      break;
    case 'mi':
      inFeet = value * 5280;
      break;
    case 'spec':
      // Special range like "Self" or "Touch" - treat as 0
      inFeet = 0;
      break;
    default:
      // Default to the raw value if unknown unit
      inFeet = value;
  }

  // Convert from feet to meters if needed
  if (targetUnit === 'meters') {
    return Math.round(inFeet * 0.3048);
  }

  return inFeet;
}

/**
 * Prepare dropdown options for casting time filter
 * @param {Array} options - The options array to populate
 * @param {Object} filterState - Current filter state
 * @param {Array} spellLevels - Spell level data
 */
export function prepareCastingTimeOptions(options, filterState, spellLevels) {
  if (!spellLevels) return;

  const uniqueActivationTypes = new Set();

  // First, collect all unique combinations
  spellLevels.forEach((level) => {
    level.spells.forEach((spell) => {
      const activationType = spell.system?.activation?.type;
      const activationValue = spell.system?.activation?.value || 1; // treat null as 1

      if (activationType) {
        uniqueActivationTypes.add(`${activationType}:${activationValue}`);
      }
    });
  });

  // Define a priority order for activation types
  const typeOrder = {
    action: 1,
    bonus: 2,
    reaction: 3,
    minute: 4,
    hour: 5,
    day: 6,
    legendary: 7,
    mythic: 8,
    lair: 9,
    crew: 10,
    special: 11,
    none: 12
  };

  // Convert to array of [type:value, type, value] for sorting
  const sortableTypes = Array.from(uniqueActivationTypes).map((combo) => {
    const [type, value] = combo.split(':');
    return [combo, type, parseInt(value) || 1];
  });

  // Sort by type priority then by value
  sortableTypes.sort((a, b) => {
    const [, typeA, valueA] = a;
    const [, typeB, valueB] = b;

    // First compare by type priority
    const typePriorityA = typeOrder[typeA] || 999;
    const typePriorityB = typeOrder[typeB] || 999;
    if (typePriorityA !== typePriorityB) {
      return typePriorityA - typePriorityB;
    }

    // Then by value
    return valueA - valueB;
  });

  // Create the options in the sorted order
  sortableTypes.forEach(([combo, type, value]) => {
    const typeLabel = CONFIG.DND5E.abilityActivationTypes[type] || type;

    let label;
    if (value === 1) {
      label = typeLabel;
    } else {
      label = `${value} ${typeLabel}${value !== 1 ? 's' : ''}`;
    }

    options.push({
      value: combo,
      label: label,
      selected: filterState.castingTime === combo
    });
  });
}

/**
 * Prepare dropdown options for damage type filter
 * @param {Array} options - The options array to populate
 * @param {Object} filterState - Current filter state
 */
export function prepareDamageTypeOptions(options, filterState) {
  // Create a combined damage types object including healing
  const damageTypesWithHealing = {
    ...CONFIG.DND5E.damageTypes,
    healing: { label: game.i18n.localize('DND5E.Healing') }
  };

  // Add options for each damage type in alphabetical order by label
  Object.entries(damageTypesWithHealing)
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .forEach(([key, damageType]) => {
      options.push({
        value: key,
        label: damageType.label,
        selected: filterState.damageType === key
      });
    });
}

/**
 * Prepare dropdown options for condition filter
 * @param {Array} options - The options array to populate
 * @param {Object} filterState - Current filter state
 */
export function prepareConditionOptions(options, filterState) {
  // Add options for each condition type
  Object.entries(CONFIG.DND5E.conditionTypes)
    .filter(([_key, condition]) => !condition.pseudo) // Skip pseudo conditions
    .forEach(([key, condition]) => {
      options.push({
        value: key,
        label: condition.label,
        selected: filterState.condition === key
      });
    });
}

/**
 * Get options for a specific dropdown filter
 * @param {string} filterId - The filter ID
 * @param {Object} filterState - Current filter state
 * @param {Array} spellLevels - Spell level data
 * @returns {Array} Options for the dropdown
 */
export function getOptionsForFilter(filterId, filterState, spellLevels) {
  const options = [{ value: '', label: game.i18n.localize('SPELLBOOK.Filters.All') }];

  switch (filterId) {
    case 'level':
      // Add options for each spell level found
      if (spellLevels) {
        spellLevels.forEach((level) => {
          options.push({
            value: level.level,
            label: CONFIG.DND5E.spellLevels[level.level],
            selected: filterState.level === level.level
          });
        });
      }
      break;

    case 'school':
      // Add options for each spell school
      Object.entries(CONFIG.DND5E.spellSchools).forEach(([key, school]) => {
        options.push({
          value: key,
          label: school.label,
          selected: filterState.school === key
        });
      });
      break;

    case 'castingTime':
      prepareCastingTimeOptions(options, filterState, spellLevels);
      break;

    case 'damageType':
      prepareDamageTypeOptions(options, filterState);
      break;

    case 'condition':
      prepareConditionOptions(options, filterState);
      break;

    case 'requiresSave':
    case 'concentration':
      options.push(
        { value: 'true', label: game.i18n.localize('SPELLBOOK.Filters.True'), selected: filterState[filterId] === 'true' },
        { value: 'false', label: game.i18n.localize('SPELLBOOK.Filters.False'), selected: filterState[filterId] === 'false' }
      );
      break;

    case 'sortBy':
      options.push(
        { value: 'level', label: game.i18n.localize('SPELLBOOK.Sort.ByLevel'), selected: filterState.sortBy === 'level' },
        { value: 'name', label: game.i18n.localize('SPELLBOOK.Sort.ByName'), selected: filterState.sortBy === 'name' },
        { value: 'school', label: game.i18n.localize('SPELLBOOK.Sort.BySchool'), selected: filterState.sortBy === 'school' },
        { value: 'prepared', label: game.i18n.localize('SPELLBOOK.Sort.ByPrepared'), selected: filterState.sortBy === 'prepared' }
      );
      break;
  }

  return options;
}

/**
 * Create the default filter state object
 * @returns {Object} Default filter state
 */
export function getDefaultFilterState() {
  return {
    name: '',
    level: '',
    school: '',
    castingTime: '',
    minRange: '',
    maxRange: '',
    damageType: '',
    condition: '',
    requiresSave: '',
    prepared: false,
    ritual: false,
    concentration: '',
    sortBy: 'level'
  };
}
