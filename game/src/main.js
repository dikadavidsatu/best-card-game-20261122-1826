// Boot and the one loop: the match advances in real time, the Regent takes
// his turn on a timer so every card he plays can be watched, and the
// renderer paints what is there. The game moves between seven screens:
// title, play, paused, help, duel-end, win and loss.
//
// ?seed=N fixes the shuffle and the AI's wobble. ?shot=start|play|win|loss
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
//
// Keyboard and mouse mean the same things: click a card or press 1–8 to
// play it, Space or Enter ends the turn, M mutes, H shows the rules, Esc
// pauses. Runtime errors are collected on window.__errors so a headless
// play-through can prove the game ran clean.

import { BEST_KEY, TIMING } from './config.js';
import { createRandom } from './random.js';
import { createMatch, restartMatch, advanceToNextDuel, playCard, endPlayerTurn, endRegentTurn, playerWon, playerLost, PHASE, currentRegent } from './state.js';
import { aiTakeOneStep, aiMoodLine } from './ai.js';
import { createInput, ACTION } from './input.js';
import { createRenderer, SCREEN, computeViewTransform } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const input = createInput(canvas);
const renderer = createRenderer(canvas);

// Errors the game itself throws, kept where a test can read them.
window.__errors = [];
window.addEventListener('error', (event) => {
  window.__errors.push(String(event.message || event.error || 'unknown error'));
  // Also visible in the document title, so a headless --dump-dom shows it.
  document.title = `GAME ERROR: ${window.__errors[window.__errors.length - 1]}`;
});

function readBest() {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (!raw) return { wins: 0, bestTurns: null };
    const parsed = JSON.parse(raw);
    return { wins: parsed.wins || 0, bestTurns: parsed.bestTurns ?? null };
  } catch {
    return { wins: 0, bestTurns: null };
  }
}

function saveBest(best) {
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // Storage can be off: the record then lasts this visit only.
  }
}

let match = createMatch(createRandom(seed), seed);
let best = readBest();
let screen = SCREEN.TITLE;
let previousScreen = SCREEN.TITLE; // the screen help/paused return to
let aiPlaysSoFar = 0;
let aiTimer = 0;
let aiMoodAnnounced = false;
let endSoundPlayed = false;

/** The shared UI state the renderer reads and writes each frame. */
const ui = {
  hoveredCard: -1,
  selectedCard: -1,
  hoverButton: null,
  buttons: {},
  handRects: [],
  moodLine: '',
  muted: audio.muted,
  playedCard: null,
};

function announceStatus() {
  const regent = currentRegent(match);
  if (screen === SCREEN.TITLE) status.textContent = 'Ember Court. Press Enter to begin.';
  else if (screen === SCREEN.WIN) status.textContent = 'Victory. You won the Court.';
  else if (screen === SCREEN.LOSS) status.textContent = 'Defeat. The Regent keeps the Court.';
  else status.textContent = `Duel ${match.duel} against ${regent.name}. Your life ${match.player.life}, Regent life ${match.regent.life}.`;
}

function beginMatch() {
  audio.ensure();
  audio.startMusic();
  restartMatch(match);
  screen = SCREEN.PLAY;
  endSoundPlayed = false;
  aiMoodAnnounced = false;
  ui.moodLine = aiMoodLine(match);
  audio.turnStart();
  announceStatus();
}

function syncScreenWithMatch() {
  if (match.phase === PHASE.MATCH_END) {
    if (screen !== SCREEN.WIN && screen !== SCREEN.LOSS) {
      screen = playerWon(match) ? SCREEN.WIN : SCREEN.LOSS;
      if (!endSoundPlayed) {
        endSoundPlayed = true;
        if (playerWon(match)) {
          audio.winFanfare();
          if (best.bestTurns === null || match.stats.turns < best.bestTurns) best.bestTurns = match.stats.turns;
          best.wins += 1;
          saveBest(best);
        } else {
          audio.lossDirge();
        }
      }
      announceStatus();
    }
  } else if (match.phase === PHASE.DUEL_END) {
    if (screen !== SCREEN.DUEL_END) {
      screen = SCREEN.DUEL_END;
      audio.turnStart();
      announceStatus();
    }
  } else if (screen !== SCREEN.PAUSED && screen !== SCREEN.HELP && screen !== SCREEN.TITLE) {
    screen = SCREEN.PLAY;
  }
}

/** Drain the match's transient events into sounds and renderer effects. */
function drainEvents() {
  const events = match.events;
  match.events = [];
  for (const event of events) {
    renderer.notifyEvent(event, match);
    if (event.kind === 'damage') audio.damage();
    else if (event.kind === 'shield-block') audio.shieldBlock();
    else if (event.kind === 'card-played') {
      const card = event.card;
      if (card.kind === 'mend') audio.heal();
      else if (card.kind === 'draw') audio.draw();
      else audio.playCard();
    }
  }
}

/** Play one of the player's hand cards, with a click sound when it fails. */
function tryPlayCard(index) {
  if (screen !== SCREEN.PLAY || match.phase !== PHASE.PLAY) return;
  const line = playCard(match, match.player, index);
  if (line === null) {
    audio.deny();
    return;
  }
  ui.selectedCard = -1;
  drainEvents();
  syncScreenWithMatch();
}

function endTurn() {
  if (screen !== SCREEN.PLAY || match.phase !== PHASE.PLAY) return;
  endPlayerTurn(match);
  aiPlaysSoFar = 0;
  aiTimer = TIMING.aiThink;
  aiMoodAnnounced = false;
  drainEvents();
  syncScreenWithMatch();
}

/** One step of the Regent's turn, driven by the loop's timer. */
function aiStep(deltaMs) {
  if (match.phase !== PHASE.AI_TURN) return;
  aiTimer -= deltaMs;
  if (aiTimer > 0) return;
  if (!aiMoodAnnounced) {
    aiMoodAnnounced = true;
    ui.moodLine = aiMoodLine(match);
  }
  const step = aiTakeOneStep(match, aiPlaysSoFar, currentRegent(match));
  if (step.result === 'played') {
    aiPlaysSoFar += 1;
    aiTimer = TIMING.aiPlayGap;
    drainEvents();
  } else {
    // The Regent passes: his turn ends and the player's begins.
    endRegentTurn(match);
    aiTimer = 0;
    drainEvents();
    return;
  }
  syncScreenWithMatch();
}

/** Hit-test a click against this frame's buttons and hand. */
function pointInRect(point, rect) {
  return rect && point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function handleClick(point) {
  audio.ensure();
  if (screen === SCREEN.TITLE) {
    beginMatch();
    return;
  }
  const buttons = ui.buttons;
  if (pointInRect(point, buttons.mute)) {
    audio.setMuted(!audio.muted);
    ui.muted = audio.muted;
    return;
  }
  if (pointInRect(point, buttons.help)) {
    previousScreen = screen;
    screen = SCREEN.HELP;
    return;
  }
  if (screen === SCREEN.HELP) {
    if (pointInRect(point, buttons.closeHelp)) screen = previousScreen === SCREEN.HELP ? SCREEN.PLAY : previousScreen;
    return;
  }
  if (screen === SCREEN.PAUSED) {
    if (pointInRect(point, buttons.resume)) screen = SCREEN.PLAY;
    else if (pointInRect(point, buttons.restart)) beginMatch();
    else if (pointInRect(point, buttons.quit)) screen = SCREEN.TITLE;
    return;
  }
  if (screen === SCREEN.DUEL_END) {
    if (pointInRect(point, buttons.nextDuel)) {
      advanceToNextDuel(match);
      screen = SCREEN.PLAY;
      ui.moodLine = aiMoodLine(match);
      audio.turnStart();
      announceStatus();
    }
    return;
  }
  if (screen === SCREEN.WIN || screen === SCREEN.LOSS) {
    if (pointInRect(point, buttons.playAgain)) beginMatch();
    return;
  }
  if (screen === SCREEN.PLAY) {
    if (pointInRect(point, buttons.endTurn)) {
      endTurn();
      return;
    }
    for (const rect of ui.handRects) {
      if (pointInRect(point, rect)) {
        tryPlayCard(rect.index);
        return;
      }
    }
  }
}

function handleAction(action) {
  if (typeof action === 'number') {
    if (screen === SCREEN.PLAY) tryPlayCard(action - 1);
    return;
  }
  switch (action) {
    case ACTION.END_TURN:
      if (screen === SCREEN.TITLE) beginMatch();
      else if (screen === SCREEN.PLAY) endTurn();
      else if (screen === SCREEN.DUEL_END) handleClick({ x: 640, y: 527 });
      else if (screen === SCREEN.WIN || screen === SCREEN.LOSS) beginMatch();
      else if (screen === SCREEN.HELP) screen = previousScreen;
      else if (screen === SCREEN.PAUSED) screen = SCREEN.PLAY;
      break;
    case ACTION.PAUSE:
      if (screen === SCREEN.PLAY) screen = SCREEN.PAUSED;
      else if (screen === SCREEN.PAUSED) screen = SCREEN.PLAY;
      else if (screen === SCREEN.HELP) screen = previousScreen;
      break;
    case ACTION.MUTE:
      audio.ensure();
      audio.setMuted(!audio.muted);
      ui.muted = audio.muted;
      break;
    case ACTION.HELP:
      if (screen === SCREEN.HELP) screen = previousScreen;
      else if (screen === SCREEN.PLAY || screen === SCREEN.TITLE) {
        previousScreen = screen;
        screen = SCREEN.HELP;
      }
      break;
    case ACTION.QUIT_TO_TITLE:
      if (screen === SCREEN.PLAY || screen === SCREEN.PAUSED) {
        match.phase = PHASE.TITLE;
        screen = SCREEN.TITLE;
        announceStatus();
      }
      break;
    default:
      break;
  }
}

/** Keep the canvas the size of the window, and the pointer map honest. */
function resizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  const view = computeViewTransform(canvas.width, canvas.height);
  input.toLogical = (clientX, clientY) => ({
    x: (clientX * dpr - view.offsetX) / view.scale,
    y: (clientY * dpr - view.offsetY) / view.scale,
  });
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/** Refresh hover state from the pointer's logical position. */
function updateHover() {
  ui.hoveredCard = -1;
  ui.hoverButton = null;
  if (!input.pointer.inside) return;
  const point = input.pointer;
  for (const rect of ui.handRects) {
    if (pointInRect(point, rect)) {
      ui.hoveredCard = rect.index;
      break;
    }
  }
  for (const [name, rect] of Object.entries(ui.buttons)) {
    if (pointInRect(point, rect)) {
      ui.hoverButton = name;
      break;
    }
  }
}

/** One frame: input, the Regent's timer, the events, then paint. */
function frame(now, last) {
  const deltaMs = Math.min(100, now - last);
  for (const click of input.consumeClicks()) handleClick(click);
  for (const code of input.consumeKeys()) {
    const action = input.actionForKey(code);
    if (action !== null) handleAction(action);
  }
  updateHover();
  if (screen === SCREEN.PLAY && match.phase === PHASE.AI_TURN) aiStep(deltaMs);
  drainEvents();
  syncScreenWithMatch();
  renderer.draw(match, ui, screen, best);
  // A handle for headless tests: the screen, the lives, the hand size.
  window.__gameState = {
    screen,
    phase: match.phase,
    playerLife: match.player.life,
    regentLife: match.regent.life,
    playerHand: match.player.hand.length,
    regentHand: match.regent.hand.length,
    duel: match.duel,
    playerWins: match.playerWins,
    regentWins: match.regentWins,
    errors: window.__errors.length,
  };
}

/** Screenshot mode: stage the scene, paint it twice, flag it ready. */
function runShot(name) {
  const staged = stageShot(name, match, seed);
  match = staged.match;
  screen = staged.screen === 'title' ? SCREEN.TITLE
    : staged.screen === 'win' ? SCREEN.WIN
    : staged.screen === 'loss' ? SCREEN.LOSS
    : SCREEN.PLAY;
  if (screen === SCREEN.WIN || screen === SCREEN.LOSS) {
    // Drop the whole match's accumulated events: notifying all of them would
    // stack dozens of floating numbers on one spot. The shot shows the
    // result, not the replay.
    match.events = [];
    if (screen === SCREEN.WIN) renderer.scatterConfetti();
  }
  // The staged table reads like a live one: the Regent's mood line is set,
  // and a mid-game scene shows the last card played, centre table.
  ui.moodLine = aiMoodLine(match);
  if (screen === SCREEN.PLAY && match.lastPlayedCard) {
    renderer.notifyEvent({ kind: 'card-played', card: match.lastPlayedCard.card, byRegent: match.lastPlayedCard.byRegent }, match);
  }
  let painted = 0;
  function paint() {
    renderer.draw(match, ui, screen, best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) {
  runShot(shot);
} else {
  let last = performance.now();
  function loop(now) {
    frame(now, last);
    last = now;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
