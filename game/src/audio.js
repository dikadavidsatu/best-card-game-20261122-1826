// Sound, synthesized live with WebAudio — no audio files, no network. Every
// effect is a short oscillator or filtered-noise gesture: a pluck for playing
// a card, a low thud for damage, a bright arpeggio for healing, a fanfare for
// winning. Under it all a quiet pad cycles four chords, one per eight seconds,
// so the table has music without a single audio file.
//
// The AudioContext is created lazily on the first user gesture (browsers
// forbid sound before one), and everything checks `muted` before it plays.

import { MUTE_KEY } from './config.js';

const CHORDS = [
  [220.0, 261.63, 329.63], // A minor
  [174.61, 220.0, 261.63], // F major
  [130.81, 164.81, 196.0], // C major
  [196.0, 246.94, 293.66], // G major
];

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The sound board: create it once, call its methods for every game event. */
export function createAudio() {
  const audio = {
    context: null,
    master: null,
    musicGain: null,
    muted: readMuted(),
    musicTimer: null,
    chordIndex: 0,

    /** Create the context on a user gesture; safe to call more than once. */
    ensure() {
      if (this.context) {
        if (this.context.state === 'suspended') void this.context.resume();
        return;
      }
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.context.destination);
      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = 0.05;
      this.musicGain.connect(this.master);
    },

    setMuted(muted) {
      this.muted = muted;
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Storage can be off: the mute then lasts this visit only.
      }
      if (this.master && this.context) {
        this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.context.currentTime, 0.05);
      }
    },

    /** One oscillator note with an exponential decay envelope. */
    tone(freq, duration, type, volume, when = 0, slideTo = null) {
      if (!this.context || this.muted) return;
      const start = this.context.currentTime + when;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    },

    /** A burst of filtered noise — the body of thuds and shuffles. */
    noise(duration, volume, lowFreq, when = 0) {
      if (!this.context || this.muted) return;
      const start = this.context.currentTime + when;
      const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowFreq;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(start);
    },

    click() { this.tone(660, 0.06, 'triangle', 0.12); },
    deal() { this.noise(0.08, 0.1, 2400); this.tone(520, 0.07, 'triangle', 0.08, 0.02); },
    playCard() { this.tone(392, 0.12, 'triangle', 0.16); this.tone(587, 0.16, 'triangle', 0.12, 0.05); },
    damage() { this.tone(110, 0.22, 'sawtooth', 0.2, 0, 55); this.noise(0.16, 0.16, 500); },
    shieldBlock() { this.tone(880, 0.1, 'square', 0.07); this.tone(1174, 0.12, 'square', 0.05, 0.04); },
    heal() { [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.12, i * 0.07)); },
    draw() { this.tone(740, 0.08, 'triangle', 0.1); this.tone(988, 0.1, 'triangle', 0.09, 0.06); },
    combo() { [659.25, 830.61, 987.77].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.11, i * 0.05)); },
    turnStart() { this.tone(440, 0.1, 'triangle', 0.1); this.tone(554, 0.12, 'triangle', 0.09, 0.08); },
    deny() { this.tone(160, 0.14, 'square', 0.08, 0, 120); },

    winFanfare() {
      [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => {
        this.tone(f, 0.34, 'triangle', 0.16, i * 0.13);
        this.tone(f / 2, 0.34, 'sine', 0.08, i * 0.13);
      });
    },

    lossDirge() {
      [392, 349.23, 311.13, 261.63].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.14, i * 0.22));
    },

    /** Start the quiet chord pad; it retunes itself every eight seconds. */
    startMusic() {
      if (!this.context || this.musicTimer !== null) return;
      const playChord = () => {
        if (!this.context || this.muted) return;
        const chord = CHORDS[this.chordIndex % CHORDS.length];
        this.chordIndex += 1;
        const now = this.context.currentTime;
        chord.forEach((freq) => {
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          osc.detune.value = (Math.random() - 0.5) * 6;
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.5, now + 2.5);
          gain.gain.setValueAtTime(0.5, now + 5.5);
          gain.gain.linearRampToValueAtTime(0, now + 8);
          osc.connect(gain);
          gain.connect(this.musicGain);
          osc.start(now);
          osc.stop(now + 8.2);
        });
      };
      playChord();
      this.musicTimer = window.setInterval(playChord, 8000);
    },

    stopMusic() {
      if (this.musicTimer !== null) {
        window.clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
    },
  };
  return audio;
}
