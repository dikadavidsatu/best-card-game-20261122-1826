// Ember Court — configuration: every tunable number of the duel lives here, so
// balancing the game means editing this one file and nothing else.
//
// The game: a deck-battler for two. You and the Ashen Regent each hold 30 life.
// Every turn you gain energy and draw cards, then play cards from your hand.
// Cards belong to one of four houses; playing two cards of the same house in a
// row earns Court Favor (+2 power). First to win two duels takes the Court.

export const GAME_TITLE = 'Ember Court';
export const GAME_SUBTITLE = 'Duel of the Four Houses';

// Logical canvas size. The renderer scales this to the browser window.
export const VIEW = { width: 1280, height: 800 };

// --- Duel rules -----------------------------------------------------------
export const RULES = {
  startingLife: 30,
  startingEnergy: 3,
  maxEnergy: 6,
  energyGrowthPerTurn: 1, // +1 max energy each turn until the cap
  openingHand: 5,
  drawPerTurn: 2,
  maxHand: 8,
  duelsToWinMatch: 2,
  comboBonus: 2, // Court Favor: +2 power per same-house link in a row
  aiBaseLife: 30,
  aiLifeBonusPerDuel: 4, // the Regent grows tougher each duel you win
  aiEnergyBonusPerDuel: 1,
};

// --- The four houses ------------------------------------------------------
// Each house is told apart by colour AND by shape, never by text alone:
// the renderer draws each house's sigil (flame, wave, leaf, sun) on every card,
// on the table banners and on the title screen legend.
export const HOUSES = {
  ember: {
    id: 'ember',
    name: 'Ember',
    color: '#e5484d',
    dark: '#8f1d22',
    light: '#ff8a7a',
    glow: 'rgba(229, 72, 77, 0.55)',
    sigil: 'flame',
    motto: 'Burn first, ask later.',
  },
  tide: {
    id: 'tide',
    name: 'Tide',
    color: '#3e8fe0',
    dark: '#174a7d',
    light: '#7db8f5',
    glow: 'rgba(62, 143, 224, 0.55)',
    sigil: 'wave',
    motto: 'The sea always returns.',
  },
  thorn: {
    id: 'thorn',
    name: 'Thorn',
    color: '#46a758',
    dark: '#1e5c2e',
    light: '#8ed49b',
    glow: 'rgba(70, 167, 88, 0.55)',
    sigil: 'leaf',
    motto: 'Grow where you are planted.',
  },
  gild: {
    id: 'gild',
    name: 'Gild',
    color: '#e8b93e',
    dark: '#8a6410',
    light: '#ffe08a',
    glow: 'rgba(232, 185, 62, 0.55)',
    sigil: 'sun',
    motto: 'Gold remembers every debt.',
  },
};

export const HOUSE_ORDER = ['ember', 'tide', 'thorn', 'gild'];

// --- Card effect kinds ----------------------------------------------------
// strike: deal power damage.  pierce: damage that ignores shield.
// guard:  gain power shield.  mend:   restore power life.
// draw:   deal 2 damage and draw `power` cards.
// drain:  deal power damage and heal half of it.
// rally:  deal power; +3 more while a Court Favor chain is running.
// kindle: deal power; +1 more for each Ember card already played this turn.
export const EFFECT_KINDS = ['strike', 'pierce', 'guard', 'mend', 'draw', 'drain', 'rally', 'kindle'];

// --- The three Regents (one per duel of the match) ------------------------
export const REGENTS = [
  {
    name: 'Regent Ashford',
    title: 'The Ember Warden',
    taunt: 'The Court does not bow to newcomers.',
    aggression: 0.45, // how often he spends everything on damage
    caution: 0.35, // how readily he shields when hurt
    maxPlaysPerTurn: 2,
  },
  {
    name: 'Regent Mirelle',
    title: 'The Tide Chancellor',
    taunt: 'I have drowned better players than you.',
    aggression: 0.6,
    caution: 0.5,
    maxPlaysPerTurn: 3,
  },
  {
    name: 'Regent Aurelian',
    title: 'The Gilded Sovereign',
    taunt: 'Kneel. The Court is mine, and always was.',
    aggression: 0.75,
    caution: 0.65,
    maxPlaysPerTurn: 4,
  },
];

// --- Table layout (logical pixels) ----------------------------------------
export const LAYOUT = {
  cardWidth: 118,
  cardHeight: 164,
  handArc: 16, // how far the hand fan sags at its edges
  aiHandY: 96,
  playerHandY: 596,
  logX: 1010,
  logY: 210,
  logWidth: 240,
  logHeight: 300,
};

// --- Timing (milliseconds) ------------------------------------------------
export const TIMING = {
  dealStep: 90, // gap between dealt cards
  aiThink: 650, // pause before the Regent plays
  aiPlayGap: 750, // gap between the Regent's cards
  floatTextLife: 1100, // floating damage numbers
  shakeTime: 320,
  confettiCount: 160,
};

// --- Storage --------------------------------------------------------------
export const BEST_KEY = 'ember-court-best';
export const MUTE_KEY = 'ember-court-muted';
