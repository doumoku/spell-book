# Implementation Strategy

## Phase 1: Extended Compendium Browser UI

Instead of creating a new UI from scratch, we'll extend the existing DnD5e compendium browser to:

- Lock to the spells tab when opened from our module
- Filter to show only spells valid for the player's class(es)
- Add UI elements to track spell preparation status
- Add save/cancel buttons to commit changes to the character
- Display current prepared spells more prominently

This leverages the existing robust filtering and display capabilities while adding our custom functionality.

## Phase 2: Data Structure

We'll need to track:

- Available spells for each class
- Prepared spells for each character
- Custom spell lists created by GMs

Let's use the existing spell list structure as shown in your example.

## Phase 3: GM Spell List Manager

For the GM to create and manage custom spell lists:

- Display existing spell lists
- Retrieve all spells from compendiums for selection
- Save and update modified spell lists
- Create new JournalEntryPages with custom spell lists

## Phase 4: Integration with Foundry Events

We'll need to hook into the appropriate Foundry events:

- On long rest completion, prompt for changing prepared spells
- On level up, detect changes and prompt for spell selection
  - Note: Foundry doesn't have a built-in level-up event, so custom tracking may be required

---

## Final Implementation Strategy

### Extended Compendium Browser

- Subclass the DnD5e compendium browser
- Lock to spells tab
- Add class-specific filtering
- Add preparation status tracking
- Implement save/cancel functionality

### Data Management

- Load spell lists from journal entries
- Save prepared spells to actor data
- Helper methods for filtering and organizing spells

### GM Tools

- Interface for creating and editing spell lists
- Ability to duplicate and modify existing lists
- Spell search and filtering tools

### Integration Points

- Hook into long rest completion
- Add a character sheet button to open spell book
- (Later) Detect level up and prompt for spell selection

### Testing and Refinement

- Test with different character classes
- Verify spell data is saved correctly
- Ensure UI is intuitive and responsive

### File Structure

```text
spell-book/
├── module.json
├── scripts/
│   ├── spell-book.mjs                 // Main module file
│   ├── constants.mjs                  // Constants and configurations
│   ├── apps/
│   │   ├── extended-compendium.mjs    // Extended compendium browser (using ApplicationV2)
│   │   └── spell-list-manager.mjs     // GM UI (using ApplicationV2)
│   ├── helpers.mjs                    // Utility functions for spells and actors
│   └── hooks.mjs                      // Foundry integration hooks
├── templates/
│   ├── extended-compendium.hbs        // Extended compendium browser template
│   ├── spell-list-manager.hbs         // GM spell list management interface
│   └── partials/
│       ├── spell-card.hbs             // Reusable spell display component
│       └── spell-filter.hbs           // Filtering controls component
├── styles/
│   ├── spell-book.css                 // Main stylesheet
│   └── components/
│       ├── spell-card.css             // Spell card styling
│       └── filter-controls.css        // Filter controls styling
└── languages/
    └── en.json                        // Localization strings
