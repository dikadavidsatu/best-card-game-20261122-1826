// Screenshot staging: how ?shot=start|play|win|loss paints its scene.
// Each scene is a real game, played forward from a fresh match by a simple
// autopilot — never a mock. The good pilot plays its best card and ends the
// turn; the careless pilot plays nothing and lets the Regent win. The win
// and loss scenes try seeds in order until the match really ends that way,
// so the frame is always an honest render of a finished game.
//
// ?shot=start  the title screen, fresh match
// ?shot=play   mid-game, after a few real turns, both hands on the table
// ?shot=win    the victory overlay, after a match the pilot really won
// ?shot=loss   the defeat overlay, after a match the pilot really lost
// &seed=N fixes the shuffle and the AI's wobble, so a seed always paints
// the same frame.

import { PHASE, canPlay, createMatch, endPlayerTurn, endRegentTurn, playCard, playerLost, playerWon, startDuel } from './state.js';
import { aiTakeOneStep } from './ai.js';
import { currentRegent } from './state.js';
import { createRandom } from './random.js';

const MAX_STEPS = 600; // plays, either side, before a staged game gives up
const PLAY_TURNS = 3; // turns the play scene runs before it stops mid-turn
const SEED_TRIES = 40; // seeds tried before a win/loss scene falls back

/**
 * The good pilot: play the most damaging affordable card, preferring one
 * that continues the Favor chain, until nothing worth playing is left.
 * Returns how many cards it played this turn.
 */
export function goodPilotPlays(match) {
  let played = 0;
  for (let guard = 0; guard < 12; guard += 1) {
    let bestIndex = -1;
    let bestScore = -1;
    for (let i = 0; i < match.player.hand.length; i += 1) {
      const card = match.player.hand[i];
      if (!canPlay(match, match.player, i)) continue;
      let score = card.power * 10 - card.cost * 3;
      if (card.kind === 'mend' && match.player.life >= match.player.maxLife) score = -50;
      if (card.kind === 'guard' && match.regent.life <= 5) score -= 20;
      if (match.lastHouse === card.house) score += 25;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex === -1 || bestScore < 5) break;
    playCard(match, match.player, bestIndex);
    played += 1;
    if (match.phase !== PHASE.PLAY) break;
  }
  return played;
}

/** The careless pilot: play nothing at all. The Regent does the rest. */
export function carelessPilotPlays() {
  return 0;
}

/** Run the Regent's turn to its end, one animated step at a time. */
function runRegentTurn(match) {
  const profile = currentRegent(match);
  let plays = 0;
  for (let guard = 0; guard < 12; guard += 1) {
    if (match.phase !== PHASE.AI_TURN) break;
    const step = aiTakeOneStep(match, plays, profile);
    if (step.result === 'played') plays += 1;
    else break;
  }
  if (match.phase === PHASE.AI_TURN) endRegentTurn(match);
}

/**
 * Play one full round-trip (player turn, then Regent turn) with `pilot`.
 * Returns false when the duel or match ended mid-way.
 */
function playRound(match, pilot) {
  if (match.phase !== PHASE.PLAY) return false;
  pilot(match);
  if (match.phase !== PHASE.PLAY) return false;
  endPlayerTurn(match);
  runRegentTurn(match);
  return match.phase === PHASE.PLAY;
}

/** A fresh match from a seed, already past the title screen. */
function freshMatch(seed) {
  const match = createMatch(createRandom(seed), seed);
  match.phase = PHASE.PLAY;
  return match;
}

/**
 * Stage the named scene into `match` and return the screen to draw over it.
 * `match` is rebuilt from `seed` when the scene needs a new game.
 */
export function stageShot(name, match, seed) {
  if (name === 'start') {
    return { screen: 'title', match };
  }
  if (name === 'play') {
    const staged = freshMatch(seed);
    for (let turn = 0; turn < PLAY_TURNS; turn += 1) {
      if (!playRound(staged, goodPilotPlays)) break;
    }
    // One more half-turn, so the table shows a hand mid-decision.
    if (staged.phase === PHASE.PLAY) goodPilotPlays(staged);
    return { screen: 'play', match: staged };
  }
  // win / loss: try seeds until the match really ends that way.
  const wanted = name === 'loss' ? 'loss' : 'win';
  const pilot = wanted === 'win' ? goodPilotPlays : carelessPilotPlays;
  for (let attempt = 0; attempt < SEED_TRIES; attempt += 1) {
    const staged = freshMatch(seed + attempt);
    let steps = 0;
    while (steps < MAX_STEPS) {
      steps += 1;
      if (staged.phase === PHASE.PLAY) {
        pilot(staged);
        if (staged.phase === PHASE.PLAY) {
          endPlayerTurn(staged);
          runRegentTurn(staged);
        }
        // A duel that ended mid-turn is advanced by the next iteration's
        // DUEL_END branch, never by breaking out of the loop here.
      } else if (staged.phase === PHASE.DUEL_END) {
        staged.duel += 1;
        startDuel(staged);
      } else {
        break;
      }
      if (staged.phase === PHASE.MATCH_END) break;
    }
    if (wanted === 'win' && playerWon(staged)) return { screen: 'win', match: staged };
    if (wanted === 'loss' && playerLost(staged)) return { screen: 'loss', match: staged };
  }
  // Fallback: the last staged game, whatever screen it reached, so a shot
  // never fails outright — the frame still shows a real table.
  const fallback = freshMatch(seed);
  for (let turn = 0; turn < PLAY_TURNS; turn += 1) {
    if (!playRound(fallback, goodPilotPlays)) break;
  }
  return { screen: fallback.phase === PHASE.MATCH_END ? (playerWon(fallback) ? 'win' : 'loss') : 'play', match: fallback };
}
