// Tiny WebAudio synth. No asset files, so the whole game stays offline-safe.

let ctx = null;
let enabled = true;
let master = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.28;
  master.connect(ctx.destination);
  return ctx;
}

/** iOS keeps the context suspended until a user gesture resumes it. */
export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function setEnabled(v) { enabled = v; }
export function isEnabled() { return enabled; }

function tone({ freq = 440, dur = 0.09, type = 'triangle', vol = 0.5, slide = 0, delay = 0 }) {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.12, vol = 0.25, delay = 0, hp = 800 }) {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  const gain = c.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

export const sfx = {
  tap: () => tone({ freq: 620, dur: 0.04, type: 'square', vol: 0.16 }),
  select: () => tone({ freq: 880, dur: 0.05, type: 'triangle', vol: 0.2 }),
  deselect: () => tone({ freq: 500, dur: 0.05, type: 'triangle', vol: 0.15 }),
  deal: () => noise({ dur: 0.07, vol: 0.14, hp: 2400 }),
  /** Rising pitch as the scoring chain builds. */
  chip: (i = 0) => tone({ freq: 480 + Math.min(i, 22) * 34, dur: 0.06, type: 'square', vol: 0.2 }),
  mult: (i = 0) => tone({ freq: 300 + Math.min(i, 18) * 26, dur: 0.09, type: 'sawtooth', vol: 0.18 }),
  xmult: () => { tone({ freq: 300, dur: 0.16, type: 'sawtooth', vol: 0.24, slide: 500 }); noise({ dur: 0.16, vol: 0.12, hp: 500 }); },
  money: () => { tone({ freq: 1050, dur: 0.06, type: 'sine', vol: 0.24 }); tone({ freq: 1500, dur: 0.09, type: 'sine', vol: 0.2, delay: 0.05 }); },
  discard: () => noise({ dur: 0.16, vol: 0.2, hp: 900 }),
  win: () => [0, 0.1, 0.2, 0.34].forEach((d, i) => tone({ freq: [523, 659, 784, 1047][i], dur: 0.22, type: 'triangle', vol: 0.3, delay: d })),
  lose: () => [0, 0.13, 0.28].forEach((d, i) => tone({ freq: [392, 330, 233][i], dur: 0.34, type: 'sawtooth', vol: 0.26, delay: d })),
  boss: () => { tone({ freq: 110, dur: 0.5, type: 'sawtooth', vol: 0.3 }); noise({ dur: 0.4, vol: 0.16, hp: 200 }); },
  buy: () => { tone({ freq: 780, dur: 0.06, type: 'square', vol: 0.2 }); tone({ freq: 1180, dur: 0.08, type: 'square', vol: 0.18, delay: 0.05 }); },
  error: () => tone({ freq: 180, dur: 0.14, type: 'square', vol: 0.2 }),
  pack: () => { noise({ dur: 0.25, vol: 0.24, hp: 400 }); tone({ freq: 700, dur: 0.2, type: 'triangle', vol: 0.22, slide: 400 }); },
};

/** Haptics where the platform offers them; silently ignored elsewhere. */
let haptics = true;
export function setHaptics(v) { haptics = v; }
export function isHaptics() { return haptics; }
export function buzz(ms = 8) {
  if (haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* unsupported */ } }
}
