// A small seeded random generator (mulberry32) so a ?seed=N game shuffles,
// draws and lets the AI choose exactly the same way every time it runs.
// Screenshots stage their scenes from a fixed seed, so the same seed always
// paints the same frame; a live game picks a fresh seed from the clock.

/** Build a generator from any 32-bit integer seed. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, max). */
export function randomInt(random, max) {
  return Math.floor(random() * max);
}

/** Pick one element of a non-empty array. */
export function randomPick(random, items) {
  return items[randomInt(random, items.length)];
}

/** Fisher-Yates shuffle, in place, driven by the seeded generator. */
export function shuffle(random, items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(random, i + 1);
    const held = items[i];
    items[i] = items[j];
    items[j] = held;
  }
  return items;
}
