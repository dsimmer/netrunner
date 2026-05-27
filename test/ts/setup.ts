// Vitest setup file - loads card data for tests
import { setAllCards } from "@/game/utils";

// Minimal card data for testing. These contain just enough fields for
// serverCard/buildCard/makeCard to work correctly.
const testCards: Record<string, Record<string, unknown>> = {
  // ================================================================
  // Identities
  // ================================================================
  "Neutral Corporation": {
    title: "Neutral Corporation",
    side: "Corp",
    type: "Identity",
    influence: 0,
    mulligan: 0,
    startingMegacredits: 5,
    startingHandSize: 5,
  },
  "Neutral Runner": {
    title: "Neutral Runner",
    side: "Runner",
    type: "Identity",
    influence: 0,
    mulligan: 0,
    startingMegacredits: 5,
    startingHandSize: 5,
  },
  "Valencia Estevez: The Angel of Cayambe": {
    title: "Valencia Estevez: The Angel of Cayambe",
    side: "Runner",
    type: "Identity",
    influence: 0,
    mulligan: 0,
    startingMegacredits: 5,
    startingHandSize: 5,
  },
  "Laramy Fisk: Savvy Investor": {
    title: "Laramy Fisk: Savvy Investor",
    side: "Runner",
    type: "Identity",
    influence: 0,
    mulligan: 0,
    startingMegacredits: 5,
    startingHandSize: 5,
  },
  "Leela Patel: Trained Pragmatist": {
    title: "Leela Patel: Trained Pragmatist",
    side: "Runner",
    type: "Identity",
    influence: 0,
    mulligan: 0,
    startingMegacredits: 5,
    startingHandSize: 5,
  },
  "SSO Industries: Fueling Innovation": {
    title: "SSO Industries: Fueling Innovation",
    side: "Corp",
    type: "Identity",
    influence: 0,
    mulligan: 0,
    startingMegacredits: 5,
    startingHandSize: 5,
  },
  "NBN: Controlling the Message": {
    title: "NBN: Controlling the Message",
    side: "Corp",
    type: "Identity",
    influence: 0,
    mulligan: 0,
    startingMegacredits: 5,
    startingHandSize: 5,
  },

  // ================================================================
  // ICE cards
  // ================================================================
  "Fire Wall": {
    title: "Fire Wall",
    side: "Corp",
    type: "Ice",
    subtype: "Barrier",
    cost: 1,
    strength: 1,
    minAdvance: 1,
    advance: 1,
    subroutines: [
      { text: "End the run.", cost: 1, breakable: "1" },
    ],
    format: ["Standard"],
  },
  "Ice Wall": {
    title: "Ice Wall",
    side: "Corp",
    type: "Ice",
    subtype: "Wall",
    cost: 4,
    strength: 2,
    subroutines: [
      { text: "End the run.", cost: 1, breakable: "1" },
    ],
    format: ["Standard"],
  },
  "Afshar": {
    title: "Afshar",
    side: "Corp",
    type: "Ice",
    subtype: "Sentry",
    cost: 5,
    strength: 3,
    subroutines: [
      { text: "End the run.", cost: 2, breakable: "2" },
      { text: "Do 2 net damage.", cost: 2, breakable: "2" },
    ],
    format: ["Standard"],
  },
  "Tour Guide": {
    title: "Tour Guide",
    side: "Corp",
    type: "Ice",
    subtype: "Sentry",
    cost: 3,
    strength: 2,
    subroutines: [
      { text: "End the run.", cost: 1, breakable: "1" },
    ],
    format: ["Standard"],
  },
  "Eli 1.0": {
    title: "Eli 1.0",
    side: "Corp",
    type: "Ice",
    subtype: "Sentry",
    cost: 1,
    strength: 1,
    subroutines: [
      { text: "End the run.", cost: 1, breakable: "1" },
    ],
    format: ["Standard"],
  },
  "Enigma": {
    title: "Enigma",
    side: "Corp",
    type: "Ice",
    subtype: "Sentry",
    cost: 1,
    strength: 1,
    subroutines: [
      { text: "End the run.", cost: 1, breakable: "1" },
    ],
    format: ["Standard"],
  },
  "Unity": {
    title: "Unity",
    side: "Corp",
    type: "Ice",
    subtype: "Sentry",
    cost: 1,
    strength: 1,
    subroutines: [
      { text: "End the run.", cost: 1, breakable: "1" },
    ],
    format: ["Standard"],
  },
  "Utae": {
    title: "Utae",
    side: "Corp",
    type: "Ice",
    subtype: "Sentry",
    cost: 3,
    strength: 2,
    subroutines: [
      { text: "End the run.", cost: 1, breakable: "1" },
    ],
    format: ["Standard"],
  },
  "Bukhgalter": {
    title: "Bukhgalter",
    side: "Corp",
    type: "Ice",
    subtype: "Sentry",
    cost: 4,
    strength: 3,
    subroutines: [
      { text: "End the run.", cost: 1, breakable: "1" },
      { text: "Corp gains 5 [Credits].", cost: 1, breakable: "1" },
    ],
    format: ["Standard"],
  },
  "Caprice Nisei": {
    title: "Caprice Nisei",
    side: "Corp",
    type: "Ice",
    subtype: "Barrier",
    cost: 4,
    strength: 2,
    minAdvance: 2,
    advance: 2,
    subroutines: [
      { text: "Runner loses 2 [Credits].", cost: 1, breakable: "1" },
      { text: "End the run.", cost: 1, breakable: "1" },
    ],
    format: ["Standard"],
  },
  "Cyberdex Virus Suite": {
    title: "Cyberdex Virus Suite",
    side: "Corp",
    type: "Ice",
    subtype: "Halo",
    cost: 3,
    strength: 0,
    subroutines: [
      {
        text: "Each installed virus does -1 strength. Trash this ice and each of runner's programs.",
        cost: 0,
        breakable: "0",
      },
    ],
    format: ["Standard"],
  },
  "Kakugo": {
    title: "Kakugo",
    side: "Corp",
    type: "Ice",
    subtype: "Sentry",
    cost: 5,
    strength: 4,
    unique: true,
    subroutines: [
      { text: "End the run.", cost: 2, breakable: "2" },
      {
        text: "Runner trashes a resource. Runner trashes a program.",
        cost: 2,
        breakable: "2",
      },
    ],
    format: ["Standard"],
  },
  "Masvingo": {
    title: "Masvingo",
    side: "Corp",
    type: "Ice",
    subtype: "Sentry",
    cost: 7,
    strength: 3,
    unique: true,
    subroutines: [
      { text: "End the run.", cost: 2, breakable: "2" },
      { text: "Do 2 net damage.", cost: 2, breakable: "2" },
    ],
    format: ["Standard"],
  },
  "Wraparound": {
    title: "Wraparound",
    side: "Corp",
    type: "Ice",
    subtype: "Halo",
    cost: 4,
    strength: 1,
    unique: true,
    subroutines: [
      {
        text: "When a runner trashes a program while encountering this ice, gain 2 [Credits].",
        cost: 0,
        breakable: "0",
      },
    ],
    format: ["Standard"],
  },
  "Brainstorm": {
    title: "Brainstorm",
    side: "Corp",
    type: "Ice",
    subtype: "Sentry",
    cost: 5,
    strength: 3,
    unique: true,
    subroutines: [
      { text: "End the run.", cost: 2, breakable: "2" },
      { text: "Do 3 brain damage.", cost: 2, breakable: "2" },
    ],
    format: ["Standard"],
  },

  // ================================================================
  // Programs
  // ================================================================
  "Endless Hunger": {
    title: "Endless Hunger",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 2,
    strength: 1,
    muCost: 2,
    format: ["Standard"],
  },
  "Corroder": {
    title: "Corroder",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 5,
    strength: 1,
    muCost: 4,
    format: ["Standard"],
  },
  "Marjanah": {
    title: "Marjanah",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 5,
    strength: 2,
    muCost: 5,
    format: ["Standard"],
  },
  "DNA Tracker": {
    title: "DNA Tracker",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 3,
    strength: 3,
    muCost: 3,
    format: ["Standard"],
  },
  "Gordian Blade": {
    title: "Gordian Blade",
    side: "Runner",
    type: "Program",
    subtype: "Codebreaker",
    cost: 2,
    strength: 0,
    muCost: 1,
    format: ["Standard"],
  },
  "Cache": {
    title: "Cache",
    side: "Runner",
    type: "Program",
    subtype: "Virus",
    cost: 3,
    strength: 1,
    muCost: 2,
    format: ["Standard"],
  },
  "Scheherazade": {
    title: "Scheherazade",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 5,
    strength: 3,
    muCost: 4,
    format: ["Standard"],
  },
  "Hivemind": {
    title: "Hivemind",
    side: "Runner",
    type: "Program",
    subtype: "Virus",
    cost: 3,
    strength: 1,
    muCost: 2,
    unique: true,
    format: ["Standard"],
  },
  "Knight": {
    title: "Knight",
    side: "Runner",
    type: "Program",
    subtype: "Codebreaker",
    cost: 2,
    strength: 1,
    muCost: 1,
    format: ["Standard"],
  },
  "Leprechaun": {
    title: "Leprechaun",
    side: "Runner",
    type: "Program",
    subtype: "Virus",
    cost: 4,
    strength: 1,
    muCost: 2,
    format: ["Standard"],
  },
  "Mimic": {
    title: "Mimic",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 3,
    strength: 1,
    muCost: 2,
    format: ["Standard"],
  },
  "Djinn": {
    title: "Djinn",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 6,
    strength: 4,
    muCost: 3,
    format: ["Standard"],
  },
  "Omni-drive": {
    title: "Omni-drive",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 4,
    strength: 2,
    muCost: 2,
    format: ["Standard"],
  },
  "Laamb": {
    title: "Laamb",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 4,
    strength: 2,
    muCost: 3,
    format: ["Standard"],
  },
  "Ankusa": {
    title: "Ankusa",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 4,
    strength: 0,
    muCost: 2,
    format: ["Standard"],
  },
  "Boomerang": {
    title: "Boomerang",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 3,
    strength: 2,
    muCost: 2,
    format: ["Standard"],
  },
  "Saker": {
    title: "Saker",
    side: "Runner",
    type: "Program",
    subtype: "Codebreaker",
    cost: 3,
    strength: 1,
    muCost: 2,
    format: ["Standard"],
  },
  "Imp": {
    title: "Imp",
    side: "Runner",
    type: "Program",
    subtype: "Virus",
    cost: 3,
    strength: 1,
    muCost: 2,
    format: ["Standard"],
  },
  "Parasite": {
    title: "Parasite",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 3,
    strength: 1,
    muCost: 2,
    format: ["Standard"],
  },
  "Aeneas Informant": {
    title: "Aeneas Informant",
    side: "Runner",
    type: "Program",
    subtype: "Icebreaker",
    cost: 3,
    strength: 1,
    muCost: 2,
    format: ["Standard"],
  },

  // ================================================================
  // Hardware
  // ================================================================
  "Akamatsu Mem Chip": {
    title: "Akamatsu Mem Chip",
    side: "Runner",
    type: "Hardware",
    cost: 3,
    muCost: 1,
    format: ["Standard"],
  },
  "Clone Chip": {
    title: "Clone Chip",
    side: "Runner",
    type: "Hardware",
    cost: 4,
    muCost: 1,
    unique: true,
    format: ["Standard"],
  },

  // ================================================================
  // Resources
  // ================================================================
  "Paparazzi": {
    title: "Paparazzi",
    side: "Runner",
    type: "Resource",
    cost: 3,
    format: ["Standard"],
  },
  "Data Dealer": {
    title: "Data Dealer",
    side: "Runner",
    type: "Resource",
    cost: 2,
    format: ["Standard"],
  },
  "Kati Jones": {
    title: "Kati Jones",
    side: "Runner",
    type: "Resource",
    cost: 5,
    unique: true,
    format: ["Standard"],
  },
  "Personal Workshop": {
    title: "Personal Workshop",
    side: "Runner",
    type: "Resource",
    cost: 4,
    unique: true,
    format: ["Standard"],
  },
  "Off-Campus Apartment": {
    title: "Off-Campus Apartment",
    side: "Runner",
    type: "Resource",
    cost: 4,
    format: ["Standard"],
  },
  "Find the Truth": {
    title: "Find the Truth",
    side: "Runner",
    type: "Resource",
    cost: 1,
    unique: true,
    format: ["Standard"],
  },
  "Security Testing": {
    title: "Security Testing",
    side: "Runner",
    type: "Resource",
    cost: 2,
    format: ["Standard"],
  },
  "Compromised Employee": {
    title: "Compromised Employee",
    side: "Runner",
    type: "Resource",
    cost: 3,
    format: ["Standard"],
  },

  // ================================================================
  // Runner Events
  // ================================================================
  "Sure Gamble": {
    title: "Sure Gamble",
    side: "Runner",
    type: "Event",
    cost: 1,
    format: ["Standard"],
  },
  "Scavenge": {
    title: "Scavenge",
    side: "Runner",
    type: "Event",
    cost: 1,
    format: ["Standard"],
  },
  "Corporate Grant": {
    title: 'Corporate "Grant"',
    side: "Runner",
    type: "Event",
    cost: 0,
    format: ["Standard"],
  },

  // ================================================================
  // Assets
  // ================================================================
  "Hedge Fund": {
    title: "Hedge Fund",
    side: "Corp",
    type: "Asset",
    cost: 4,
    advancementCost: 1,
    format: ["Standard"],
  },
  "PAD Campaign": {
    title: "PAD Campaign",
    side: "Corp",
    type: "Asset",
    cost: 4,
    advancementCost: 2,
    format: ["Standard"],
  },
  "NGO Front": {
    title: "NGO Front",
    side: "Corp",
    type: "Asset",
    cost: 4,
    advancementCost: 1,
    format: ["Standard"],
  },
  "Advanced Assembly Lines": {
    title: "Advanced Assembly Lines",
    side: "Corp",
    type: "Asset",
    cost: 5,
    advancementCost: 1,
    format: ["Standard"],
  },
  "Mandatory Upgrades": {
    title: "Mandatory Upgrades",
    side: "Corp",
    type: "Asset",
    cost: 3,
    advancementCost: 2,
    agenda: 2,
    format: ["Standard"],
  },
  "Ancestral Imager": {
    title: "Ancestral Imager",
    side: "Corp",
    type: "Asset",
    cost: 5,
    advancementCost: 1,
    format: ["Standard"],
  },
  "Full Immersion RecStudio": {
    title: "Full Immersion RecStudio",
    side: "Corp",
    type: "Asset",
    cost: 6,
    advancementCost: 1,
    format: ["Standard"],
  },
  "Hostile Takeover": {
    title: "Hostile Takeover",
    side: "Corp",
    type: "Asset",
    cost: 6,
    advancementCost: 3,
    agenda: 3,
    format: ["Standard"],
  },
  "Hostile Infrastructure": {
    title: "Hostile Infrastructure",
    side: "Corp",
    type: "Asset",
    cost: 3,
    advancementCost: 2,
    format: ["Standard"],
  },
  "Cyberdex Trial": {
    title: "Cyberdex Trial",
    side: "Corp",
    type: "Asset",
    cost: 4,
    advancementCost: 1,
    format: ["Standard"],
  },
  "IPO": {
    title: "IPO",
    side: "Corp",
    type: "Asset",
    cost: 10,
    advancementCost: 3,
    agenda: 2,
    format: ["Standard"],
  },
  "Sandburg": {
    title: "Sandburg",
    side: "Corp",
    type: "Asset",
    cost: 4,
    advancementCost: 3,
    agenda: 3,
    unique: true,
    format: ["Standard"],
  },
  "Jackson Howard": {
    title: "Jackson Howard",
    side: "Corp",
    type: "Asset",
    cost: 2,
    advancementCost: 1,
    unique: true,
    format: ["Standard"],
  },
  "Marilyn Campaign": {
    title: "Marilyn Campaign",
    side: "Corp",
    type: "Asset",
    cost: 4,
    advancementCost: 2,
    agenda: 2,
    unique: true,
    format: ["Standard"],
  },
  "Calvin B4L3Y": {
    title: "Calvin B4L3Y",
    side: "Corp",
    type: "Asset",
    cost: 3,
    advancementCost: 1,
    format: ["Standard"],
  },
  "Archer": {
    title: "Archer",
    side: "Corp",
    type: "Asset",
    cost: 3,
    advancementCost: 1,
    format: ["Standard"],
  },
  "Rashida Jaheem": {
    title: "Rashida Jaheem",
    side: "Corp",
    type: "Asset",
    cost: 3,
    advancementCost: 1,
    format: ["Standard"],
  },
  "Worlds Plaza": {
    title: "Worlds Plaza",
    side: "Corp",
    type: "Asset",
    cost: 4,
    advancementCost: 2,
    unique: true,
    format: ["Standard"],
  },
  "Corporate Town": {
    title: "Corporate Town",
    side: "Corp",
    type: "Asset",
    cost: 6,
    advancementCost: 1,
    agenda: 2,
    format: ["Standard"],
  },

  // ================================================================
  // Upgrades
  // ================================================================
  "Project Yagi-Uda": {
    title: "Project Yagi-Uda",
    side: "Corp",
    type: "Upgrade",
    cost: 2,
    advancementCost: 1,
    agenda: 1,
    format: ["Standard"],
  },

  // ================================================================
  // Operations
  // ================================================================
  "Lateral Growth": {
    title: "Lateral Growth",
    side: "Corp",
    type: "Operation",
    cost: 4,
    format: ["Standard"],
  },
  "Crisium Grid": {
    title: "Crisium Grid",
    side: "Corp",
    type: "Operation",
    cost: 1,
    format: ["Standard"],
  },
  "Tranquility Home Grid": {
    title: "Tranquility Home Grid",
    side: "Corp",
    type: "Operation",
    cost: 1,
    format: ["Standard"],
  },
  "Jinja City Grid": {
    title: "Jinja City Grid",
    side: "Corp",
    type: "Operation",
    cost: 1,
    format: ["Standard"],
  },
  "Underway Renovation": {
    title: "Underway Renovation",
    side: "Corp",
    type: "Operation",
    cost: 5,
    format: ["Standard"],
  },
  "Surveillance Sweep": {
    title: "Surveillance Sweep",
    side: "Corp",
    type: "Operation",
    cost: 3,
    format: ["Standard"],
  },
  "Interns": {
    title: "Interns",
    side: "Corp",
    type: "Operation",
    cost: 2,
    format: ["Standard"],
  },
  "Restructure": {
    title: "Restructure",
    side: "Corp",
    type: "Operation",
    cost: 10,
    format: ["Standard"],
  },
  "Director Haas": {
    title: "Director Haas",
    side: "Corp",
    type: "Operation",
    cost: 2,
    format: ["Standard"],
  },
  "Brainstorm": {
    title: "Brainstorm",
    side: "Corp",
    type: "Operation",
    cost: 1,
    format: ["Standard"],
  },

  // ================================================================
  // Apocalypse (Runner Event)
  // ================================================================
  "Apocalypse": {
    title: "Apocalypse",
    side: "Runner",
    type: "Event",
    cost: 5,
    unique: true,
    format: ["Standard"],
  },

  // ================================================================
  // Additional Identities
  // ================================================================
  "Weyland Consortium: Building a Better World": {
    title: "Weyland Consortium: Building a Better World",
    side: "Corp", type: "Identity", influence: 0, mulligan: 0,
    startingMegacredits: 5, startingHandSize: 5, format: ["Standard"],
  },
  "Haas-Bioroid: Engineering the Future": {
    title: "Haas-Bioroid: Engineering the Future",
    side: "Corp", type: "Identity", influence: 0, mulligan: 0,
    startingMegacredits: 5, startingHandSize: 5, format: ["Standard"],
  },
  "Pravdivost Consulting: Political Solutions": {
    title: "Pravdivost Consulting: Political Solutions",
    side: "Corp", type: "Identity", influence: 0, mulligan: 0,
    startingMegacredits: 5, startingHandSize: 5, format: ["Standard"],
  },
  "Poétrï Luxury Brands: All the Rage": {
    title: "Poétrï Luxury Brands: All the Rage",
    side: "Corp", type: "Identity", influence: 0, mulligan: 0,
    startingMegacredits: 5, startingHandSize: 5, format: ["Standard"],
  },
  "Thule Subsea: Safety Below": {
    title: "Thule Subsea: Safety Below",
    side: "Corp", type: "Identity", influence: 0, mulligan: 0,
    startingMegacredits: 5, startingHandSize: 5, format: ["Standard"],
  },
  "Zahya Sadeghi: Versatile Smuggler": {
    title: "Zahya Sadeghi: Versatile Smuggler",
    side: "Runner", type: "Identity", influence: 0, mulligan: 0,
    startingMegacredits: 5, startingHandSize: 5, format: ["Standard"],
  },
  "MaxX: Maximum Punk Rock": {
    title: "MaxX: Maximum Punk Rock",
    side: "Runner", type: "Identity", influence: 0, mulligan: 0,
    startingMegacredits: 5, startingHandSize: 5, format: ["Standard"],
  },
  "Esâ Afontov: Eco-Insurrectionist": {
    title: "Esâ Afontov: Eco-Insurrectionist",
    side: "Runner", type: "Identity", influence: 0, mulligan: 0,
    startingMegacredits: 5, startingHandSize: 5, format: ["Standard"],
  },

  // ================================================================
  // Additional ICE
  // ================================================================
  "Scatter Field": {
    title: "Scatter Field", side: "Corp", type: "Ice", subtype: "Sentry",
    cost: 4, strength: 2, format: ["Standard"],
    subroutines: [{ text: "End the run.", cost: 2, breakable: "2" }],
  },
  "Tollbooth": {
    title: "Tollbooth", side: "Corp", type: "Ice", subtype: "Sentry",
    cost: 3, strength: 2, format: ["Standard"],
    subroutines: [{ text: "End the run.", cost: 1, breakable: "1" }],
  },
  "Winchester": {
    title: "Winchester", side: "Corp", type: "Ice", subtype: "Sentry",
    cost: 1, strength: 1, format: ["Standard"],
    subroutines: [{ text: "End the run.", cost: 1, breakable: "1" }],
  },
  "Surveyor": {
    title: "Surveyor", side: "Corp", type: "Ice", subtype: "Sentry",
    cost: 4, strength: 3, format: ["Standard"],
    subroutines: [
      { text: "End the run.", cost: 2, breakable: "2" },
      { text: "Runner trashes a resource.", cost: 2, breakable: "2" },
    ],
  },
  "Ash 2X3ZB9CY": {
    title: "Ash 2X3ZB9CY", side: "Corp", type: "Ice", subtype: "Sentry",
    cost: 3, strength: 3, unique: true, format: ["Standard"],
    subroutines: [
      { text: "End the run.", cost: 2, breakable: "2" },
      { text: "Corp does 2 net damage to Runner.", cost: 2, breakable: "2" },
    ],
  },
  "Turing": {
    title: "Turing", side: "Corp", type: "Ice", subtype: "Sentry",
    cost: 5, strength: 2, format: ["Standard"],
    subroutines: [{ text: "End the run.", cost: 2, breakable: "2" }],
  },
  "Breaker Bay Grid": {
    title: "Breaker Bay Grid", side: "Corp", type: "Ice", subtype: "Barrier",
    cost: 5, strength: 4, unique: true, format: ["Standard"],
    subroutines: [
      { text: "End the run.", cost: 2, breakable: "2" },
      { text: "End the run.", cost: 2, breakable: "2" },
    ],
  },
  "Magnet": {
    title: "Magnet", side: "Corp", type: "Ice", subtype: "Sentry",
    cost: 2, strength: 2, format: ["Standard"],
    subroutines: [{ text: "Runner loses 1 [Credits].", cost: 1, breakable: "1" }],
  },
  "Artificial Cryptocrash": {
    title: "Artificial Cryptocrash", side: "Corp", type: "Ice", subtype: "Halo",
    cost: 7, strength: 1, format: ["Standard"],
    subroutines: [
      { text: "Each program Runner has installed does -1 strength.", cost: 0, breakable: "0" },
    ],
  },
  "Logjam": {
    title: "Logjam", side: "Corp", type: "Ice", subtype: "Sentry",
    cost: 4, strength: 3, format: ["Standard"],
    subroutines: [
      { text: "End the run.", cost: 2, breakable: "2" },
      { text: "End the run.", cost: 2, breakable: "2" },
    ],
  },
  "Vladisibirsk City Grid": {
    title: "Vladisibirsk City Grid", side: "Corp", type: "Ice", subtype: "Barrier",
    cost: 5, strength: 4, format: ["Standard"],
    subroutines: [
      { text: "End the run.", cost: 2, breakable: "2" },
      { text: "End the run.", cost: 2, breakable: "2" },
    ],
  },

  // ================================================================
  // Additional Runner Programs
  // ================================================================
  "Aumakua": {
    title: "Aumakua", side: "Runner", type: "Program", subtype: "Virus",
    cost: 3, strength: 1, muCost: 2, format: ["Standard"],
  },
  "Masterwork (v37)": {
    title: "Masterwork (v37)", side: "Runner", type: "Program", subtype: "Icebreaker",
    cost: 6, strength: 3, muCost: 3, format: ["Standard"],
  },
  "Easy Mark": {
    title: "Easy Mark", side: "Runner", type: "Program", subtype: "Icebreaker",
    cost: 3, strength: 1, muCost: 2, format: ["Standard"],
  },
  "Carmen": {
    title: "Carmen", side: "Runner", type: "Program", subtype: "Icebreaker",
    cost: 5, strength: 3, muCost: 4, format: ["Standard"],
  },
  "Data Folding": {
    title: "Data Folding", side: "Runner", type: "Program", subtype: "Icebreaker",
    cost: 5, strength: 2, muCost: 4, format: ["Standard"],
  },
  "Lamprey": {
    title: "Lamprey", side: "Runner", type: "Program", subtype: "Icebreaker",
    cost: 6, strength: 3, muCost: 4, format: ["Standard"],
  },
  "Hermes": {
    title: "Hermes", side: "Runner", type: "Program", subtype: "Icebreaker",
    cost: 5, strength: 2, muCost: 3, format: ["Standard"],
  },
  "Ika": {
    title: "Ika", side: "Runner", type: "Program", subtype: "Icebreaker",
    cost: 5, strength: 2, muCost: 4, format: ["Standard"],
  },

  // ================================================================
  // Additional Runner Hardware
  // ================================================================
  "Buffer Drive": {
    title: "Buffer Drive", side: "Runner", type: "Hardware", cost: 3, muCost: 1,
    format: ["Standard"],
  },
  "WAKE Implant v2A-JRJ": {
    title: "WAKE Implant v2A-JRJ", side: "Runner", type: "Hardware", cost: 2, muCost: 1,
    format: ["Standard"],
  },

  // ================================================================
  // Additional Runner Resources
  // ================================================================
  "Fencer Fueno": {
    title: "Fencer Fueno", side: "Runner", type: "Resource", cost: 1, format: ["Standard"],
  },
  "Mystic Maemi": {
    title: "Mystic Maemi", side: "Runner", type: "Resource", cost: 1, format: ["Standard"],
  },
  "Trickster Taka": {
    title: "Trickster Taka", side: "Runner", type: "Resource", cost: 1, format: ["Standard"],
  },
  "Net Shield": {
    title: "Net Shield", side: "Runner", type: "Resource", cost: 3, format: ["Standard"],
  },
  "Wireless Net Pavilion": {
    title: "Wireless Net Pavilion", side: "Runner", type: "Resource", cost: 2, format: ["Standard"],
  },

  // ================================================================
  // Additional Runner Events
  // ================================================================
  "Jailbreak": {
    title: "Jailbreak", side: "Runner", type: "Event", cost: 2, format: ["Standard"],
  },
  "Tread Lightly": {
    title: "Tread Lightly", side: "Runner", type: "Event", cost: 2, format: ["Standard"],
  },
  "Hernando Cortez": {
    title: "Hernando Cortez", side: "Runner", type: "Event", cost: 1, format: ["Standard"],
  },
  "Labor Rights": {
    title: "Labor Rights", side: "Runner", type: "Event", cost: 1, format: ["Standard"],
  },
  "Dirty Laundry": {
    title: "Dirty Laundry", side: "Runner", type: "Event", cost: 3, format: ["Standard"],
  },
  "Emergency Shutdown": {
    title: "Emergency Shutdown", side: "Runner", type: "Event", cost: 2, format: ["Standard"],
  },
  "Legwork": {
    title: "Legwork", side: "Runner", type: "Event", cost: 0, format: ["Standard"],
  },
  "The Twinning": {
    title: "The Twinning", side: "Runner", type: "Event", cost: 4, format: ["Standard"],
  },
  "Career Fair": {
    title: "Career Fair", side: "Runner", type: "Event", cost: 3, format: ["Standard"],
  },
  "Cezve": {
    title: "Cezve", side: "Runner", type: "Event", cost: 2, format: ["Standard"],
  },
  "Miss Bones": {
    title: "Miss Bones", side: "Runner", type: "Event", cost: 4, format: ["Standard"],
  },
  "Bravado": {
    title: "Bravado", side: "Runner", type: "Event", cost: 3, format: ["Standard"],
  },
  "Pinhole Threading": {
    title: "Pinhole Threading", side: "Runner", type: "Event", cost: 2, format: ["Standard"],
  },
  "Mutual Favor": {
    title: "Mutual Favor", side: "Runner", type: "Event", cost: 1, format: ["Standard"],
  },
  "Diversion of Funds": {
    title: "Diversion of Funds", side: "Runner", type: "Event", cost: 5, format: ["Standard"],
  },
  "Inside Job": {
    title: "Inside Job", side: "Runner", type: "Event", cost: 3, format: ["Standard"],
  },
  "Desperado": {
    title: "Desperado", side: "Runner", type: "Event", cost: 2, format: ["Standard"],
  },
  "The Class Act": {
    title: "The Class Act", side: "Runner", type: "Event", cost: 3, format: ["Standard"],
  },
  "Fall Guy": {
    title: "Fall Guy", side: "Runner", type: "Resource", cost: 1, format: ["Standard"],
  },
  "Dr. Nuka Vrolyck": {
    title: "Dr. Nuka Vrolyck", side: "Runner", type: "Resource", cost: 3, format: ["Standard"],
  },
  "Aniccam": {
    title: "Aniccam", side: "Runner", type: "Resource", cost: 3, format: ["Standard"],
  },
  "Hacktivist Meeting": {
    title: "Hacktivist Meeting", side: "Runner", type: "Resource", cost: 3, format: ["Standard"],
  },
  "Paladin Poemu": {
    title: "Paladin Poemu", side: "Runner", type: "Resource", cost: 1, format: ["Standard"],
  },

  // ================================================================
  // Additional Corp Assets
  // ================================================================
  "Tithe": {
    title: "Tithe", side: "Corp", type: "Asset", cost: 2, advancementCost: 1,
    format: ["Standard"],
  },
  "Vovô Ozetti": {
    title: "Vovô Ozetti", side: "Corp", type: "Asset", cost: 2, advancementCost: 1,
    format: ["Standard"],
  },
  "Subliminal Messaging": {
    title: "Subliminal Messaging", side: "Corp", type: "Asset", cost: 2, advancementCost: 1,
    format: ["Standard"],
  },
  "Tree Line": {
    title: "Tree Line", side: "Corp", type: "Asset", cost: 4, advancementCost: 1,
    format: ["Standard"],
  },
  "Adonis Campaign": {
    title: "Adonis Campaign", side: "Corp", type: "Asset", cost: 5, advancementCost: 2,
    format: ["Standard"],
  },
  "Global Food Initiative": {
    title: "Global Food Initiative", side: "Corp", type: "Asset", cost: 5, advancementCost: 2,
    format: ["Standard"],
  },
  "Mestnichestvo": {
    title: "Mestnichestvo", side: "Corp", type: "Asset", cost: 4, advancementCost: 2,
    format: ["Standard"],
  },
  "Tomorrow's Headline": {
    title: "Tomorrow's Headline", side: "Corp", type: "Asset", cost: 4, advancementCost: 2,
    format: ["Standard"],
  },
  "Offworld Office": {
    title: "Offworld Office", side: "Corp", type: "Asset", cost: 4, advancementCost: 1,
    format: ["Standard"],
  },
  "Federal Fundraising": {
    title: "Federal Fundraising", side: "Corp", type: "Asset", cost: 4, advancementCost: 2,
    format: ["Standard"],
  },
  "Ubiquitous Vig": {
    title: "Ubiquitous Vig", side: "Corp", type: "Asset", cost: 5, advancementCost: 1,
    format: ["Standard"],
  },
  "Spin Doctor": {
    title: "Spin Doctor", side: "Corp", type: "Asset", cost: 4, advancementCost: 1,
    format: ["Standard"],
  },

  // ================================================================
  // Additional Corp Operations
  // ================================================================
  "Degree Mill": {
    title: "Degree Mill", side: "Corp", type: "Operation", cost: 2, format: ["Standard"],
  },
  "Business As Usual": {
    title: "Business As Usual", side: "Corp", type: "Operation", cost: 6, format: ["Standard"],
  },
  "Neural EMP": {
    title: "Neural EMP", side: "Corp", type: "Operation", cost: 2, format: ["Standard"],
  },
  "SEA Source": {
    title: "SEA Source", side: "Corp", type: "Operation", cost: 6, advancementCost: 4,
    agenda: 2, format: ["Standard"],
  },

  // ================================================================
  // Agenda / Asset (IPO)
  // ================================================================
  "Project Atlas": {
    title: "Project Atlas", side: "Corp", type: "Asset", cost: 10, advancementCost: 4,
    agenda: 3, format: ["Standard"],
  },
  "Vanilla": {
    title: "Vanilla", side: "Corp", type: "Asset", cost: 4, advancementCost: 1,
    format: ["Standard"],
  },

  // Corp Basic Action Card (fallback)
  "Corp Basic Action Card": {
    title: "Corp Basic Action Card", side: "Corp", type: "Basic Action", format: ["Standard"],
  },
  "Runner Basic Action Card": {
    title: "Runner Basic Action Card", side: "Runner", type: "Basic Action", format: ["Standard"],
  },

  // ================================================================
  // Cards needed for set_up tests
  // ================================================================
  "Merger": {
    title: "Merger", side: "Corp", type: "Asset", cost: 10, advancementCost: 3,
    agenda: 3, format: ["Standard"],
  },
  "SanSan City Grid": {
    title: "SanSan City Grid", side: "Corp", type: "Ice", subtype: "Barrier",
    cost: 5, strength: 4, format: ["Standard"],
    subroutines: [
      { text: "End the run.", cost: 2, breakable: "2" },
      { text: "End the run.", cost: 2, breakable: "2" },
    ],
  },
  "Drug Dealer": {
    title: "Drug Dealer", side: "Runner", type: "Resource", cost: 3, format: ["Standard"],
  },
  "Nfr": {
    title: "Nfr", side: "Runner", type: "Program", subtype: "Icebreaker",
    cost: 3, strength: 1, muCost: 2, format: ["Standard"],
  },
  "Kasi String": {
    title: "Kasi String", side: "Runner", type: "Hardware", cost: 2, muCost: 1, format: ["Standard"],
  },
  "Stimhack": {
    title: "Stimhack", side: "Runner", type: "Event", cost: 2, subtypes: ["Run"], format: ["Standard"],
  },
  "Contaminate": {
    title: "Contaminate", side: "Runner", type: "Event", cost: 2, subtypes: ["Agenda"], format: ["Standard"],
  },
  "Jak Sinclair": {
    title: "Jak Sinclair", side: "Runner", type: "Resource", cost: 3, unique: true, format: ["Standard"],
  },
};

// Populate the global card registry for tests
setAllCards(new Map(Object.entries(testCards)));
