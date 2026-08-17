// localStorage persistence: the in-progress run, settings and lifetime stats.

import { serialize, deserialize } from './game.js';

const RUN_KEY = 'jokerdeck.run.v3';
const SETTINGS_KEY = 'jokerdeck.settings.v1';
const PROFILE_KEY = 'jokerdeck.profile.v1';

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota or private mode */ }
};

export function saveRun(G) {
  try { localStorage.setItem(RUN_KEY, serialize(G)); } catch { /* ignore */ }
}

export function loadRun() {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    return raw ? deserialize(raw) : null;
  } catch { return null; }
}

export function clearRun() {
  try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ }
}

export function hasRun() {
  try { return !!localStorage.getItem(RUN_KEY); } catch { return false; }
}

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
