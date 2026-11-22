// Input: mouse and keyboard, translated into the game's own language. This
// file knows nothing about cards or rules — it only reports where the pointer
// is, what was clicked, and which keys were pressed. The main loop asks it
// once a frame and decides what each of those means on the current screen.
//
// Keys: 1–8 play the card in that hand slot, Space/Enter end the turn (or
// confirm on a title/end screen), M mutes, H toggles help, Esc pauses.

export const ACTION = {
  END_TURN: 'end-turn',
  CONFIRM: 'confirm',
  PAUSE: 'pause',
  MUTE: 'mute',
  HELP: 'help',
  QUIT_TO_TITLE: 'quit-to-title',
};

/**
 * Listen on `canvas` (mouse) and the window (keys). `toLogical` converts a
 * client pixel into the game's logical 1280×800 space; the main loop sets it
 * once the renderer has measured the window.
 */
export function createInput(canvas) {
  const input = {
    toLogical: (clientX, clientY) => ({ x: clientX, y: clientY }),
    pointer: { x: -1, y: -1, inside: false },
    clickQueue: [],
    keyQueue: [],
    hoverCard: -1,
  };

  function pointerFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return input.toLogical(event.clientX - rect.left, event.clientY - rect.top);
  }

  canvas.addEventListener('mousemove', (event) => {
    const point = pointerFromEvent(event);
    input.pointer.x = point.x;
    input.pointer.y = point.y;
    input.pointer.inside = true;
  });
  canvas.addEventListener('mouseleave', () => {
    input.pointer.inside = false;
  });
  canvas.addEventListener('click', (event) => {
    const point = pointerFromEvent(event);
    input.clickQueue.push(point);
  });
  // Touch taps behave like clicks; the canvas never scrolls under a finger.
  canvas.addEventListener('touchstart', (event) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    const point = pointerFromEvent(touch);
    input.clickQueue.push(point);
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const code = event.code;
    if (code === 'Space' || code.startsWith('Arrow')) event.preventDefault();
    input.keyQueue.push(code);
  });

  /** Take and clear every click since the last frame. */
  input.consumeClicks = function consumeClicks() {
    const clicks = input.clickQueue;
    input.clickQueue = [];
    return clicks;
  };

  /** Take and clear every key pressed since the last frame. */
  input.consumeKeys = function consumeKeys() {
    const keys = input.keyQueue;
    input.keyQueue = [];
    return keys;
  };

  /**
   * Translate one raw key code into a game action, or a hand slot number
   * (1–8), or null when the key means nothing here.
   */
  input.actionForKey = function actionForKey(code) {
    if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') return ACTION.END_TURN;
    if (code === 'Escape' || code === 'KeyP') return ACTION.PAUSE;
    if (code === 'KeyM') return ACTION.MUTE;
    if (code === 'KeyH') return ACTION.HELP;
    if (code === 'KeyQ') return ACTION.QUIT_TO_TITLE;
    if (/^Digit[1-8]$/.test(code)) return Number(code.slice(5));
    if (/^Numpad[1-8]$/.test(code)) return Number(code.slice(6));
    return null;
  };

  return input;
}
