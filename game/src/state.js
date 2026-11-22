// The game state: one match, its duels, its hands, and every rule that moves
// a card from a hand onto the table. This file owns the rules; the renderer
// only paints what it finds here, and the AI only reads it and asks it to
// play cards. Nothing here touches the canvas or the network.

import { RULES, REGENTS } from './config.js';
import { buildDeck } from './cards.js';
import { shuffle } from './random.js';

/** Phases the match moves through. */
export const PHASE = {
  TITLE: 'title',
  PLAY: 'play',
  AI_TURN: 'ai-turn',
  DUEL_END: 'duel-end',
  MATCH_END: 'match-end',
};

/** A fresh side of the table: life, shield, energy, deck, hand, discard. */
function createSide(random, duelIndex, lifeBonus, isRegent) {
  const deck = buildDeck(random, duelIndex);
  return {
    life: RULES.startingLife + lifeBonus,
    maxLife: RULES.startingLife + lifeBonus,
    shield: 0,
    energy: RULES.startingEnergy,
    maxEnergy: RULES.startingEnergy,
    deck,
    hand: [],
    discard: [],
    isRegent,
    playedThisTurn: [],
  };
}

/**
 * Start a new match: three Regents in a row, first side to two duel wins
 * takes the Court. `random` is the seeded generator for the whole match.
 */
export function createMatch(random, seed) {
  const match = {
    seed,
    random,
    phase: PHASE.TITLE,
    duel: 1, // 1-based: which Regent faces you now
    playerWins: 0,
    regentWins: 0,
    winner: null, // 'player' | 'regent' once the match ends
    turn: 0, // turns inside the current duel
    log: [],
    stats: { cardsPlayed: 0, damageDealt: 0, damageTaken: 0, heals: 0, turns: 0 },
    player: null,
    regent: null,
    favorChain: 0, // consecutive same-house plays this turn (Court Favor)
    lastHouse: null,
    lastPlayedCard: null,
    lastDuelWinner: null, // 'player' | 'regent' | 'draw', set when a duel ends
    events: [], // transient animation events the renderer drains each frame
  };
  startDuel(match);
  return match;
}

/** The Regent of the current duel, with his escalating toughness. */
export function currentRegent(match) {
  return REGENTS[Math.min(match.duel - 1, REGENTS.length - 1)];
}

/** Begin duel `match.duel`: fresh decks, fresh hands, the player to move. */
export function startDuel(match) {
  const regent = currentRegent(match);
  const lifeBonus = (match.duel - 1) * RULES.aiLifeBonusPerDuel;
  match.player = createSide(match.random, match.duel - 1, 0, false);
  match.regent = createSide(match.random, match.duel - 1, lifeBonus, true);
  match.turn = 1;
  match.favorChain = 0;
  match.lastHouse = null;
  match.lastPlayedCard = null;
  match.phase = PHASE.PLAY;
  for (let i = 0; i < RULES.openingHand; i += 1) {
    drawCard(match, match.player);
    drawCard(match, match.regent);
  }
  pushLog(match, `${regent.name} takes the table. Duel ${match.duel} — first to ${RULES.duelsToWinMatch} duel wins takes the Court.`);
}

/** Draw the top card of a side's deck into its hand (reshuffle discard first). */
export function drawCard(match, side) {
  if (side.hand.length >= RULES.maxHand) return null;
  if (side.deck.length === 0) {
    if (side.discard.length === 0) return null;
    side.deck = shuffle(match.random, [...side.discard]);
    side.discard = [];
    pushLog(match, `${side.isRegent ? 'The Regent' : 'You'} reshuffle the discard into the deck.`);
  }
  const card = side.deck.pop();
  side.hand.push(card);
  return card;
}

/** Begin a side's turn: refresh energy, clear old shield, draw two cards. */
export function startTurn(match, side) {
  side.maxEnergy = Math.min(RULES.startingEnergy + (match.turn - 1) * RULES.energyGrowthPerTurn, RULES.maxEnergy);
  side.energy = side.maxEnergy;
  side.shield = 0;
  side.playedThisTurn = [];
  match.favorChain = 0;
  match.lastHouse = null;
  drawCard(match, side);
  drawCard(match, side);
}

/** A short line in the battle log, newest first, capped at six lines. */
export function pushLog(match, line) {
  match.log.unshift(line);
  if (match.log.length > 6) match.log.length = 6;
}

/** Queue a transient event for the renderer (floating text, shake, flash). */
function pushEvent(match, event) {
  match.events.push(event);
}

/**
 * The Court Favor bonus for `card` right now: +2 for each same-house card
 * already played this turn in a row, shown on the card before it is played.
 */
export function favorBonusFor(match, card) {
  if (match.lastHouse === null || match.lastHouse !== card.house) return 0;
  return match.favorChain * RULES.comboBonus;
}

/** Effective power of a card in the current chain, before its kind applies. */
export function effectivePower(match, card) {
  const bonus = favorBonusFor(match, card);
  if (card.kind === 'kindle') {
    // Ember cards already played this turn — not counting this card itself,
    // which playCard has just added to the list.
    const embers = match.player.playedThisTurn.filter((c) => c.house === 'ember').length
      + match.regent.playedThisTurn.filter((c) => c.house === 'ember').length - 1;
    return card.power + bonus + Math.max(0, embers);
  }
  if (card.kind === 'rally' && match.favorChain >= 1) return card.power + bonus + 3;
  return card.power + bonus;
}

/** Damage after shield soaks what it can; returns the life actually lost. */
function dealDamage(match, target, amount, pierce) {
  let left = amount;
  if (!pierce && target.shield > 0) {
    const soaked = Math.min(target.shield, left);
    target.shield -= soaked;
    left -= soaked;
    if (soaked > 0) pushEvent(match, { kind: 'shield-block', side: target.isRegent ? 'regent' : 'player', amount: soaked });
  }
  if (left > 0) {
    target.life = Math.max(0, target.life - left);
    pushEvent(match, {
      kind: 'damage',
      side: target.isRegent ? 'regent' : 'player',
      amount: left,
    });
  }
  return left;
}

/**
 * Resolve one card, played by `side` against `foe`. Returns a human line for
 * the log. The card leaves the hand for the discard pile; energy is spent
 * by the caller (playCard), so this stays a pure resolution.
 */
function resolveCard(match, side, foe, card) {
  const power = effectivePower(match, card);
  const me = side.isRegent ? 'The Regent' : 'You';
  const them = foe.isRegent ? 'the Regent' : 'you';
  const bonus = power - card.power;
  const bonusText = bonus > 0 ? ` (+${bonus} Favor)` : '';
  switch (card.kind) {
    case 'strike': {
      const dealt = dealDamage(match, foe, power, false);
      match.stats[side.isRegent ? 'damageTaken' : 'damageDealt'] += dealt;
      return `${me} strike ${them} for ${dealt}${bonusText}.`;
    }
    case 'pierce': {
      const dealt = dealDamage(match, foe, power, true);
      match.stats[side.isRegent ? 'damageTaken' : 'damageDealt'] += dealt;
      return `${me} pierce ${them === 'you' ? 'your' : 'the Regent’s'} shield for ${dealt}${bonusText}.`;
    }
    case 'guard': {
      side.shield += power;
      return `${me} raise ${power} shield${bonusText}.`;
    }
    case 'mend': {
      const healed = Math.min(power, side.maxLife - side.life);
      side.life += healed;
      if (!side.isRegent) match.stats.heals += healed;
      return `${me} restore ${healed} life${bonusText}.`;
    }
    case 'draw': {
      const dealt = dealDamage(match, foe, 2, false);
      match.stats[side.isRegent ? 'damageTaken' : 'damageDealt'] += dealt;
      for (let i = 0; i < power; i += 1) drawCard(match, side);
      return `${me} deal 2 damage and draw ${power} card${power === 1 ? '' : 's'}.`;
    }
    case 'drain': {
      const dealt = dealDamage(match, foe, power, false);
      const healed = Math.min(Math.floor(dealt / 2), side.maxLife - side.life);
      side.life += healed;
      match.stats[side.isRegent ? 'damageTaken' : 'damageDealt'] += dealt;
      if (!side.isRegent) match.stats.heals += healed;
      return `${me} drain ${dealt} life from ${them}${bonusText}.`;
    }
    case 'rally': {
      const dealt = dealDamage(match, foe, power, false);
      match.stats[side.isRegent ? 'damageTaken' : 'damageDealt'] += dealt;
      return `${me} rally the Court for ${dealt}${bonusText}.`;
    }
    case 'kindle': {
      const dealt = dealDamage(match, foe, power, false);
      match.stats[side.isRegent ? 'damageTaken' : 'damageDealt'] += dealt;
      return `${me} kindle ${dealt} damage${bonusText}.`;
    }
    default:
      return `${me} play ${card.name}.`;
  }
}

/**
 * Play the card at `handIndex` from `side`'s hand. Returns the log line, or
 * null when the card cannot be played (wrong phase, not enough energy).
 * This is the one function the player, the AI and the autopilot all call.
 */
export function playCard(match, side, handIndex) {
  if (match.phase !== PHASE.PLAY && match.phase !== PHASE.AI_TURN) return null;
  const card = side.hand[handIndex];
  if (!card || side.energy < card.cost) return null;
  const foe = side.isRegent ? match.player : match.regent;
  side.energy -= card.cost;
  side.hand.splice(handIndex, 1);
  side.discard.push(card);
  side.playedThisTurn.push(card);
  // Court Favor: same house as the previous play extends the chain.
  if (match.lastHouse === card.house) match.favorChain += 1;
  else match.favorChain = 0;
  match.lastHouse = card.house;
  match.lastPlayedCard = { card, byRegent: side.isRegent, at: Date.now() };
  match.stats.cardsPlayed += 1;
  const line = resolveCard(match, side, foe, card);
  pushLog(match, line);
  pushEvent(match, { kind: 'card-played', card, byRegent: side.isRegent });
  checkDuelEnd(match);
  return line;
}

/** Can `side` afford to play the card at `handIndex` right now? */
export function canPlay(match, side, handIndex) {
  const card = side.hand[handIndex];
  return Boolean(card) && side.energy >= card.cost
    && (match.phase === PHASE.PLAY || match.phase === PHASE.AI_TURN);
}

/** End the player's turn: the Regent takes the table. */
export function endPlayerTurn(match) {
  if (match.phase !== PHASE.PLAY) return;
  match.phase = PHASE.AI_TURN;
  match.turn += 1;
  match.stats.turns += 1;
  startTurn(match, match.regent);
  pushLog(match, `${currentRegent(match).name} takes the turn.`);
}

/** Hand the table back: the player's turn begins. */
export function endRegentTurn(match) {
  if (match.phase !== PHASE.AI_TURN) return;
  match.turn += 1;
  match.phase = PHASE.PLAY;
  startTurn(match, match.player);
  pushLog(match, 'Your turn — draw two, spend your energy.');
}

/** A duel ends when either life total hits zero; the match follows at two. */
function checkDuelEnd(match) {
  if (match.phase === PHASE.DUEL_END || match.phase === PHASE.MATCH_END) return;
  const playerDead = match.player.life <= 0;
  const regentDead = match.regent.life <= 0;
  if (!playerDead && !regentDead) return;
  if (regentDead && !playerDead) {
    match.playerWins += 1;
    match.lastDuelWinner = 'player';
    pushLog(match, `Duel ${match.duel} is yours — the Regent falls.`);
  } else if (playerDead && !regentDead) {
    match.regentWins += 1;
    match.lastDuelWinner = 'regent';
    pushLog(match, `Duel ${match.duel} is lost — the Regent stands.`);
  } else {
    match.lastDuelWinner = 'draw';
    pushLog(match, `Duel ${match.duel} ends in a draw — replayed.`);
  }
  if (match.playerWins >= RULES.duelsToWinMatch || match.regentWins >= RULES.duelsToWinMatch) {
    match.winner = match.playerWins >= RULES.duelsToWinMatch ? 'player' : 'regent';
    match.phase = PHASE.MATCH_END;
    pushEvent(match, { kind: match.winner === 'player' ? 'match-win' : 'match-loss' });
  } else {
    match.phase = PHASE.DUEL_END;
    pushEvent(match, { kind: 'duel-end' });
  }
}

/** After a duel ends (not the match), set the next duel up. */
export function advanceToNextDuel(match) {
  if (match.phase !== PHASE.DUEL_END) return;
  match.duel += 1;
  startDuel(match);
}

/** Restart the whole match from duel one, same seed family, fresh shuffle. */
export function restartMatch(match) {
  match.duel = 1;
  match.playerWins = 0;
  match.regentWins = 0;
  match.winner = null;
  match.log = [];
  match.stats = { cardsPlayed: 0, damageDealt: 0, damageTaken: 0, heals: 0, turns: 0 };
  startDuel(match);
}

/** The match is over and the player won. */
export function playerWon(match) {
  return match.phase === PHASE.MATCH_END && match.winner === 'player';
}

/** The match is over and the Regent won. */
export function playerLost(match) {
  return match.phase === PHASE.MATCH_END && match.winner === 'regent';
}
