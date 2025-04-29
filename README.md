# Spell Book

![GitHub release](https://img.shields.io/github/v/release/Sayshal/spell-book?style=for-the-badge)
![GitHub all releases](https://img.shields.io/github/downloads/Sayshal/spell-book/total?style=for-the-badge)
![Github License](https://img.shields.io/github/license/Sayshal/spell-book?style=for-the-badge)

## Supporting The Module

[![Discord](https://dcbadge.limes.pink/api/server/PzzUwU9gdz)](https://discord.gg/PzzUwU9gdz)

## Introduction

**Spell Book** revolutionizes spell management in FoundryVTT! Navigate your character's magical arsenal with ease through our intuitive interface. From preparation to casting, Spell Book handles everything in one centralized location.

Say goodbye to endless compendium searches and confusing spell tracking. **Spell Book** streamlines the entire process so you can focus on what matters—unleashing arcane power in your adventures!

---

## Features

- **Smart Compendium Integration**: Automatically pulls spells from your compendiums!
- **Intuitive Navigation**: Organized filters sort spells by level, school, and more for quick selection!
- **Rich Descriptions**: See fully formatted spell details at a glance!
- **Spell Preparation Tracking**: Easily prepare and unprepare spells with visual indicators!
- **Character Sheet Integration**: Access your spellbook directly from your character sheet!
- **Level-Up Management**: Get prompted to select new spells when your character advances! (Coming Soon!)

---

## Installation

Get Spell Book through Foundry's **Module Manager** or **The Forge's Bazaar** for instant setup.

### Manual Installation

1. Open **Foundry's Configuration and Setup** screen
2. Click **Install Module** in the Add-on Modules section
3. Paste this URL in the **Manifest URL** field:
  [https://github.com/Sayshal/spell-book/releases/latest/download/module.json](https://github.com/Sayshal/spell-book/releases/latest/download/module.json)
4. Click **Install**
5. Enable Spell Book in the **Manage Modules** section

## Tour

See Spell Book in action! These screenshots showcase how the module streamlines spell management.

### 1. Spell Book Overview

The main interface provides an organized view of your magical repertoire:

- Filter spells by level, school, casting time, and more
- Collapsible sidebar for maximum viewing space
- Spells organized by level in collapsible sections
- Clear visual indicators for prepared spells

---

### 2. Spell Details

Get comprehensive information about any spell with a single click:

- Full spell descriptions with formatted text
- At-a-glance information on range, components, and duration
- Quick prepare/unprepare toggle
- Material component tracking

---

### 3. Spell Preparation

Manage prepared spells with ease:

- Visual indicators show prepared status
- Track spell slots and preparation limits
- Automatic integration with long rest mechanics (Coming soon!)
- Quick filters to show only prepared spells

---

### 4. GM Spell List Manager (Coming Soon!)

Powerful tools for Game Masters:

- Create custom spell lists for classes or characters
- Save spell collections to journal entries
- Assign special spells or homebrew content to players
- Manage spell availability across your campaign

---

## Why Spell Book?

Spell Book transforms spell management from a tedious process to an engaging experience. Instead of:

- Flipping through rulebooks to find spell descriptions
- Manually tracking which spells are prepared
- Forgetting which spells you have access to
- Struggling to organize spells by level or school

You get a streamlined, all-in-one tool that organizes your magical arsenal while maintaining complete control. Whether you're a novice wizard overwhelmed by options or a veteran archmage looking to speed up gameplay, Spell Book helps you cast the right spell at the right time!

---

## Roadmap

### Completed Work

The Spell Book module has been developed with a robust foundation:

- Extended compendium browser UI with a custom `PlayerSpellBook` application
- Filter management system with configurable filters and sort options
- Spell preparation tracking with visual indicators
- Integration with long rest hooks
- Character sheet button integration
- Responsive UI with collapsible sidebar
- Spell level organization and collapsible sections

### Remaining Implementation Tasks

#### 1. GM Spell List Manager

- Create a dedicated UI for GMs to manage custom spell lists
- Enable creating, editing, and saving of custom spell lists to journal entries
- Add ability to assign custom spell lists to classes or specific characters

#### 2. Level-Up Detection and Prompting

- Implement a system to detect when a character gains a level
- Create a notification system to prompt for spell selection on level-up
- Design a specialized interface for selecting new spells during level advancement
- Handle different spellcasting class progressions (prepared casters vs. known spell casters)

**Proposed hook integration:**

- Add a handler for "dnd5e.advancement.complete" hook
- Check if the advancement is for a class with spellcasting
- Trigger spell selection prompt when appropriate

#### 3. Spell Import/Export System

- Enable sharing of spell configurations between players
- Implement spell loadout presets for different scenarios (combat, utility, etc.)

#### 4. UI/UX Improvements

- Create a "favorites" system for commonly used spells
- Add spell component tracking and management (material components)
