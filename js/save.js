// Persistence: the in-progress run, manual save slots, settings and stats.

import { serialize, deserialize } from './game.js';

const RUN_KEY = 'jokerdeck.run.v3';
const SLOT_KEY = (i) => `jokerdeck.slot${i}.v3`;
export const SLOT_COUNT = 3;
const SETTINGS_KEY = 'jokerdeck.settings.v1';
const PROFILE_KEY = 'jokerdeck.profile.v1';

// --------------------------------------------------------------- backend ----
// localStorage is not always there. A sandboxed frame (an embedded or preview
// copy of the game) gets an opaque origin, where touching localStorage throws
// SecurityError outright; private browsing can refuse writes too. Silently
// swallowing that made the game look like it saved when nothing was stored, so
// the backend is probed once, up front, and the result is reported to the UI.

/** Last-resort store kept in window.name: survives reloads in the same tab. */
function makeTabStore() {
  const PREFIX = 'JOKERDECK_STORE:';
  const readAll = () => {
    try {
      return window.name.startsWith(PREFIX) ? JSON.parse(window.name.slice(PREFIX.length)) || {} : {};
    } catch { return {}; }
  };
  const writeAll = (obj) => {
    try { window.name = PREFIX + JSON.stringify(obj); } catch { /* nothing left to try */ }
  };
  return {
    getItem: (k) => readAll()[k] ?? null,
    setItem: (k, v) => { const o = readAll(); o[k] = String(v); writeAll(o); },
    removeItem: (k) => { const o = readAll(); delete o[k]; writeAll(o); },
  };
}

function pickBackend() {
  const candidates = [
    ['local', () => window.localStorage],
    ['session', () => window.sessionStorage],
  ];
  for (const [mode, get] of candidates) {
    try {
      const store = get();
      const probe = '__jokerdeck_probe__';
      store.setItem(probe, '1');
      const ok = store.getItem(probe) === '1';
      store.removeItem(probe);
      // `durable` means it survives fully closing the app, not just a reload.
      if (ok) return { mode, store, durable: mode === 'local' };
    } catch { /* blocked — try the next one */ }
  }
  return { mode: 'tab', store: makeTabStore(), durable: false };
}

const backend = pickBackend();

/**
 * How saving behaves in this environment.
 *   local   — normal: survives closing the app
 *   session — kept until this tab is closed
 *   tab     — kept only across reloads of this tab
 */
export const storageStatus = () => ({ mode: backend.mode, durable: backend.durable });

const read = (key, fallback) => {
  try {
    const raw = backend.store.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};
const write = (key, value) => {
  try { backend.store.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};

export function saveRun(G) {
  try { backend.store.setItem(RUN_KEY, serialize(G)); return true; } catch { return false; }
}

export function loadRun() {
  try {
    const raw = backend.store.getItem(RUN_KEY);
    return raw ? deserialize(raw) : null;
  } catch { return null; }
}

export function clearRun() {
  try { backend.store.removeItem(RUN_KEY); } catch { /* ignore */ }
}

export function hasRun() {
  try { return !!backend.store.getItem(RUN_KEY); } catch { return false; }
}

/** Tiny string flags for other modules, so nothing else touches storage directly. */
export const readFlag = (key) => {
  try { return backend.store.getItem(key); } catch { return null; }
};
export const writeFlag = (key, value) => {
  try { backend.store.setItem(key, String(value)); return true; } catch { return false; }
};

export const defaultSettings = { sound: true, haptics: true, fastScoring: false, confirmDiscard: false };
export const loadSettings = () => ({ ...defaultSettings, ...read(SETTINGS_KEY, {}) });
export const saveSettings = (s) => write(SETTINGS_KEY, s);

export const defaultProfile = {
  runs: 0, wins: 0, bestAnte: 0, bestScore: 0, bestHandScore: 0,
  handsPlayed: 0, decksWon: [],
};
export const loadProfile = () => ({ ...defaultProfile, ...read(PROFILE_KEY, {}) });
export const saveProfile = (p) => write(PROFILE_KEY, p);

/** Fold a finished run into the lifetime profile. */
export function recordRun(G, won) {
  const p = loadProfile();
  p.runs += 1;
  if (won) {
    p.wins += 1;
    if (!p.decksWon.includes(G.deckKey)) p.decksWon.push(G.deckKey);
  }
  p.bestAnte = Math.max(p.bestAnte, G.ante);
  p.bestScore = Math.max(p.bestScore, G.score);
  p.bestHandScore = Math.max(p.bestHandScore, G.stats.bestHandScore);
  p.handsPlayed += G.stats.handsPlayed;
  saveProfile(p);
  return p;
}

// ---------------------------------------------------------------- slots ----
// The autosave above is continuous and invisible. Slots are the deliberate
// kind: save here, come back to exactly this later.

/** Small header stored alongside the run so the slot list needs no full parse. */
function slotHeader(G) {
  return {
    savedAt: Date.now(),
    seed: G.seed,
    deckKey: G.deckKey,
    ante: G.ante,
    blindIndex: G.blindIndex,
    round: G.round,
    money: G.money,
    score: G.score,
    jokers: G.jokers.length,
    phase: G.phase,
  };
}

export function saveToSlot(G, index) {
  try {
    backend.store.setItem(SLOT_KEY(index), JSON.stringify({
      header: slotHeader(G),
      run: serialize(G),
    }));
    // Read it straight back: a write that reports success but stores nothing is
    // exactly the failure this whole layer exists to catch.
    return !!backend.store.getItem(SLOT_KEY(index));
  } catch {
    return false;
  }
}

export function readSlot(index) {
  try {
    const raw = backend.store.getItem(SLOT_KEY(index));
    if (!raw) return null;
    const { header } = JSON.parse(raw);
    return header ?? null;
  } catch { return null; }
}

export function loadFromSlot(index) {
  try {
    const raw = backend.store.getItem(SLOT_KEY(index));
    if (!raw) return null;
    return deserialize(JSON.parse(raw).run);
  } catch { return null; }
}

export function clearSlot(index) {
  try { backend.store.removeItem(SLOT_KEY(index)); } catch { /* ignore */ }
}

export const listSlots = () =>
  Array.from({ length: SLOT_COUNT }, (_, i) => ({ index: i, header: readSlot(i) }));

// ----------------------------------------------------------- save codes ----
// A run is ~12 KB of JSON, which deflates to about 1.2 KB — small enough to
// paste. Codes are how a run moves between browsers, devices, or between a
// hosted copy and an installed one, since each has its own local storage.

const CODE_PREFIX_DEFLATE = 'JD1:';
const CODE_PREFIX_PLAIN = 'JD0:';

const toBase64 = (bytes) => {
  let bin = '';
  // Chunked so a large array cannot blow the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function deflate(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/** Produce a portable code for the given run. */
export async function exportCode(G) {
  const json = serialize(G);
  if (typeof CompressionStream === 'function') {
    try {
      return CODE_PREFIX_DEFLATE + toBase64(await deflate(json));
    } catch { /* fall through to the uncompressed form */ }
  }
  return CODE_PREFIX_PLAIN + toBase64(new TextEncoder().encode(json));
}

/** Parse a code back into a run, or return null with a reason. */
export async function importCode(raw) {
  const code = String(raw ?? '').replace(/\s+/g, '');
  if (!code) return { ok: false, msg: 'Paste a save code first' };

  const deflated = code.startsWith(CODE_PREFIX_DEFLATE);
  const plain = code.startsWith(CODE_PREFIX_PLAIN);
  if (!deflated && !plain) return { ok: false, msg: 'That does not look like a Jokerdeck code' };

  try {
    const body = code.slice(4);
    const bytes = fromBase64(body);
    const json = deflated ? await inflate(bytes) : new TextDecoder().decode(bytes);
    const G = deserialize(json);
    if (!G) return { ok: false, msg: 'That code is from an older version' };
    return { ok: true, run: G };
  } catch {
    return { ok: false, msg: 'That code is damaged or incomplete' };
  }
}

/**
 * Ask the browser to keep our storage. Without this some browsers may evict
 * site data under pressure, which would silently lose a run in progress.
 */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}
