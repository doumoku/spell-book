import { Logger } from './logger.js';

/**
 * Utility functions for manipulating spell data
 * @module SpellBook.Utils.SpellUtils
 */

/**
 * Get all spells available in the system
 * @returns {Promise<Array>} Array of spell items
 */
export async function getAllSpells() {
  Logger.debug('Getting all spells from the system');

  // Get spells from compendiums
  const compendiumSpells = await getCompendiumSpells();

  // Get spells from game world
  const worldSpells = getWorldSpells();

  // Combine and deduplicate
  const allSpells = [...compendiumSpells, ...worldSpells];

  // Sort by name and level
  return sortSpells(allSpells);
}

/**
 * Get spells from all available compendiums
 * @returns {Promise<Array>} Array of spell items from compendiums
 */
export async function getCompendiumSpells() {
  Logger.debug('Fetching spells from compendiums');

  const spells = [];

  // Get all dnd5e compendiums that might contain spells
  const spellCompendiums = game.packs.filter((p) => p.metadata.system === 'dnd5e' && (p.metadata.type === 'Item' || p.documentName === 'Item'));

  // Load spells from each compendium
  for (const pack of spellCompendiums) {
    try {
      Logger.debug(`Checking compendium: ${pack.metadata.label}`);

      // Get the index
      const index = await pack.getIndex();

      // Find spell entries
      const spellEntries = index.filter((e) => e.type === 'spell');

      if (spellEntries.length > 0) {
        Logger.debug(`Found ${spellEntries.length} spells in ${pack.metadata.label}`);

        // Load the actual items
        for (const entry of spellEntries) {
          const spell = await pack.getDocument(entry._id);
          spells.push(spell);
        }
      }
    } catch (error) {
      Logger.error(`Error loading spells from compendium ${pack.metadata.label}:`, error);
    }
  }

  return spells;
}

/**
 * Get spells from the current world
 * @returns {Array} Array of spell items from the world
 */
export function getWorldSpells() {
  Logger.debug('Fetching spells from world');

  // Filter items in the world to just get spells
  const worldSpells = game.items.filter((item) => item.type === 'spell');

  Logger.debug(`Found ${worldSpells.length} spells in the world`);

  return worldSpells;
}

/**
 * Sort spells by level and then alphabetically
 * @param {Array} spells - Array of spell items to sort
 * @returns {Array} Sorted spell array
 */
export function sortSpells(spells) {
  return spells.sort((a, b) => {
    // First sort by level
    const levelDiff = a.system.level - b.system.level;
    if (levelDiff !== 0) return levelDiff;

    // Then sort alphabetically
    return a.name.localeCompare(b.name);
  });
}

/**
 * Get spells for a specific class
 * @param {string} className - Name of the class to get spells for
 * @returns {Promise<Array>} Array of spell items for the class
 */
export async function getSpellsForClass(className) {
  Logger.debug(`Getting spells for class: ${className}`);

  const allSpells = await getAllSpells();

  return allSpells.filter((spell) => {
    // Check if the spell has class tags
    if (spell.system.tags?.classes) {
      // Either check the specific property or parse the classes string
      if (Array.isArray(spell.system.tags.classes)) {
        return spell.system.tags.classes.includes(className.toLowerCase());
      } else if (typeof spell.system.tags.classes === 'string') {
        const classes = spell.system.tags.classes.split(';').map((c) => c.trim().toLowerCase());
        return classes.includes(className.toLowerCase());
      }
    }
    return false;
  });
}

/**
 * Get the spellcasting ability for a character based on their class
 * @param {Actor} actor - The actor to check
 * @returns {string} The spellcasting ability key (e.g., 'int', 'wis', 'cha')
 */
export function getSpellcastingAbility(actor) {
  // Default to wisdom as a fallback
  let ability = 'wis';

  // Try to find spellcasting classes
  const spellcastingClasses = actor.items.filter((i) => i.type === 'class' && i.system.spellcasting?.ability);

  if (spellcastingClasses.length > 0) {
    // Use the first class with spellcasting ability defined
    ability = spellcastingClasses[0].system.spellcasting.ability;
  }

  return ability;
}

/**
 * Calculate the number of spells a character can prepare
 * @param {Actor} actor - The actor to calculate for
 * @returns {number} Number of preparable spells
 */
export function getPreparableSpellCount(actor) {
  // This is a simplification - actual rules vary by class
  let count = 0;

  // Find spellcasting classes
  const spellcastingClasses = actor.items.filter((i) => i.type === 'class' && i.system.spellcasting);

  for (const cls of spellcastingClasses) {
    // If the class prepares spells
    if (cls.system.spellcasting.preparation?.mode === 'prepared') {
      const ability = cls.system.spellcasting.ability;
      const abilityMod = actor.system.abilities[ability]?.mod || 0;
      const classLevel = cls.system.levels;

      // Add class level + ability modifier
      count += Math.max(1, classLevel + abilityMod);
    }
  }

  return count;
}

/**
 * Get the currently prepared spells for an actor
 * @param {Actor} actor - The actor to check
 * @returns {Array} Array of prepared spell items
 */
export function getPreparedSpells(actor) {
  return actor.items.filter((item) => item.type === 'spell' && item.system.preparation?.prepared === true);
}

/**
 * Get all spells an actor has on their sheet
 * @param {Actor} actor - The actor to check
 * @returns {Array} Array of all spell items
 */
export function getActorSpells(actor) {
  return actor.items.filter((item) => item.type === 'spell');
}

/**
 * Check if a character can prepare the given spell
 * @param {Actor} actor - The actor to check
 * @param {Item} spell - The spell to check
 * @returns {boolean} Whether the actor can prepare this spell
 */
export function canPrepareSpell(actor, spell) {
  // Get the actor's classes
  const classes = actor.items.filter((item) => item.type === 'class');

  // Check each class
  for (const cls of classes) {
    // If this class can prepare spells
    if (cls.system.spellcasting?.preparation?.mode === 'prepared') {
      // Check if this spell belongs to the class
      if (spell.system.tags?.classes) {
        const spellClasses = Array.isArray(spell.system.tags.classes) ? spell.system.tags.classes : spell.system.tags.classes.split(';').map((c) => c.trim().toLowerCase());

        if (spellClasses.includes(cls.name.toLowerCase())) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Get all available classes from compendiums and world
 * @returns {Promise<Array>} Array of class objects with id and label
 */
export async function getAllClasses() {
  Logger.debug('Getting all classes from the system');

  const classes = [];

  const packs = game.packs.filter((p) => ['Item'].includes(p.documentName));

  for (const pack of packs) {
    try {
      const index = await pack.getIndex();
      const classEntries = index.filter((e) => e.type === 'class');
      for (const entry of classEntries) {
        // Only add if not already in our list
        const className = entry.name;
        if (!classes.some((c) => c.id === className.toLowerCase())) {
          classes.push({
            id: className.toLowerCase(),
            label: className
          });
        }
      }
    } catch (error) {
      Logger.error(`Error loading classes from compendium ${pack.metadata.label}:`, error);
    }
  }

  // Sort alphabetically
  classes.sort((a, b) => a.label.localeCompare(b.label));

  Logger.debug(`Found ${classes.length} classes`);
  return classes;
}

/**
 * Get all available spell schools
 * @returns {Array} Array of school objects with id and label
 */
export function getSpellSchools() {
  return Object.entries(CONFIG.DND5E.spellSchools).map(([id, data]) => {
    // Extract the label from the object if it exists
    const label = typeof data === 'object' ? data.label : String(data);
    return { id, label };
  });
}
