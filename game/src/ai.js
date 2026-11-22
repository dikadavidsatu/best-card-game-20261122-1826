// The Regent's brain: a readable, counterable AI. It scores every card it can
// afford, plays the best one, and stops when its personality says to. Its
// choices are announced in the log ("The Regent raises a guard…") so a player
// can read the plan and answer it: hurt him and he turtles, press him low and
// he swings for lethal, leave him alone and he builds a Favor chain.
//
// The three Regents differ by aggression, caution and how many cards they
// will spend in a turn — duel one teaches the rules, duel three punishes
// every wasted turn.

import { canPlay, effectivePower, playCard } from './state.js';
import { randomInt } from './random.js';

/**
 * Score one card in the Regent's hand right now. Damage is worth its face
 * value, more when the player is nearly dead (lethal is the whole game);
 * shield and healing are worth more the lower the Regent's own life is;
 * drawing is worth more with an empty hand. A card that continues the Favor
 * chain earns a bonus, so the Regent visibly chains one house — and a player
 * who watches the chain can guess the next suit.
 */
export function scoreCardForAi(match, card, index) {
  const power = effectivePower(match, card);
  const playerLife = match.player.life;
  const regentLife = match.regent.life;
  const regent = match.regent;
  let score = 0;
  switch (card.kind) {
    case 'strike':
    case 'pierce':
    case 'rally':
    case 'kindle': {
      score = power * 10;
      if (power >= playerLife) score += 500; // lethal: play it, always
      if (playerLife <= 8) score += 40; // the smell of blood
      break;
    }
    case 'drain': {
      score = power * 11;
      if (regentLife <= 12) score += 30;
      if (power >= playerLife) score += 500;
      break;
    }
    case 'guard': {
      score = power * 8;
      if (regentLife <= 12) score += 60; // hurt Regents turtle
      if (playerLife <= 6) score -= 30; // ...unless you are about to die
      break;
    }
    case 'mend': {
      const missing = regent.maxLife - regentLife;
      score = Math.min(power, missing) * 9;
      if (regentLife <= 10) score += 70;
      if (missing === 0) score = -100; // never heal at full life
      break;
    }
    case 'draw': {
      score = 25 + power * 6;
      if (regent.hand.length <= 2) score += 30;
      break;
    }
    default:
      score = power;
  }
  // Court Favor: continuing a chain is worth playing for.
  if (match.lastHouse === card.house) score += 18;
  // Efficiency: a cheap card that does the job beats an expensive one.
  score -= card.cost * 4;
  // A little wobble, so the Regent is not a clockwork.
  score += randomInt(match.random, 6);
  return score;
}

/**
 * The Regent's read on the table, in plain words, shown in the log so the
 * player can see the plan forming.
 */
export function aiMood(match) {
  const regent = match.regent;
  if (regent.life <= 10) return 'defensive';
  if (match.player.life <= 8) return 'bloodthirsty';
  if (match.lastHouse !== null && regent.hand.some((c) => c.house === match.lastHouse)) return 'chaining';
  return 'patient';
}

/** One line the log prints when the Regent's mood is visible. */
export function aiMoodLine(match) {
  const mood = aiMood(match);
  if (mood === 'defensive') return 'The Regent pulls his guard close — he is hurting.';
  if (mood === 'bloodthirsty') return 'The Regent smells blood — he is coming for the win.';
  if (mood === 'chaining') return 'The Regent is building a Favor chain. Break the suit.';
  return 'The Regent studies the table, patient as stone.';
}

/**
 * Choose the Regent's next play, or -1 to pass. The Regent will not play a
 * card whose score is poor, will not spend his last energy on a weak card
 * when a better one may come, and stops after his duel's play limit — so a
 * player who counts cards knows when the turn is over.
 */
export function chooseAiPlay(match, playsSoFar, regentProfile) {
  const regent = match.regent;
  if (playsSoFar >= regentProfile.maxPlaysPerTurn) return -1;
  let bestIndex = -1;
  let bestScore = 12; // below this, holding the card is the better play
  for (let i = 0; i < regent.hand.length; i += 1) {
    if (!canPlay(match, regent, i)) continue;
    const score = scoreCardForAi(match, regent.hand[i], i);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Play the Regent's whole turn, one card at a time, with the pacing the
 * main loop drives: each call plays at most one card and reports what
 * happened, so the renderer can animate every play instead of dumping them.
 * Returns 'played' with the log line, 'passed' when he is done, or
 * 'ended' when the duel finished mid-turn.
 */
export function aiTakeOneStep(match, playsSoFar, regentProfile) {
  const index = chooseAiPlay(match, playsSoFar, regentProfile);
  if (index === -1) return { result: 'passed' };
  const card = match.regent.hand[index];
  const line = playCard(match, match.regent, index);
  if (match.phase !== 'ai-turn') return { result: 'ended', line, card };
  return { result: 'played', line, card };
}
