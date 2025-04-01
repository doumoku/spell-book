export function registerHandlebarsHelpers() {
  Handlebars.registerHelper('spellInfo', function (spell) {
    const school = CONFIG.DND5E.spellSchools[spell.system.school];
    const schoolLabel = school && school.label ? school.label : spell.system.school;

    let sourceBook = '';
    if (spell.system.source && spell.system.source.book) {
      sourceBook = ` - ${spell.system.source.book}`;
    }

    return `${schoolLabel}${sourceBook}`;
  });
}
