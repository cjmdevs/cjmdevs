// Poker hand detection and the hand-level table.

import { SUIT_KEYS, isStone, hasSuit } from './cards.js';

/**
 * Each entry: base chips/mult at level 1, plus the per-level gain.
 * `order` ranks hands against each other when more than one is detectable.
 */
export const HANDS = [
  { key: 'flush_five',    name: 'Flush Five',     chips: 160, mult: 16, dChips: 50, dMult: 3, order: 12 },
  { key: 'flush_house',   name: 'Flush House',    chips: 140, mult: 14, dChips: 40, dMult: 4, order: 11 },
  { key: 'five',          name: 'Five of a Kind', chips: 120, mult: 12, dChips: 35, dMult: 3, order: 10 },
  { key: 'straight_flush',name: 'Straight Flush', chips: 100, mult: 8,  dChips: 40, dMult: 4, order: 9 },
  { key: 'four',          name: 'Four of a Kind', chips: 60,  mult: 7,  dChips: 30, dMult: 3, order: 8 },
  { key: 'full_house',    name: 'Full House',     chips: 40,  mult: 4,  dChips: 25, dMult: 2, order: 7 },
  { key: 'flush',         name: 'Flush',          chips: 35,  mult: 4,  dChips: 15, dMult: 2, order: 6 },
  { key: 'straight',      name: 'Straight',       chips: 30,  mult: 4,  dChips: 30, dMult: 3, order: 5 },
  { key: 'three',         name: 'Three of a Kind',chips: 30,  mult: 3,  dChips: 20, dMult: 2, order: 4 },
  { key: 'two_pair',      name: 'Two Pair',       chips: 20,  mult: 2,  dChips: 20, dMult: 1, order: 3 },
  { key: 'pair',          name: 'Pair',           chips: 10,  mult: 2,  dChips: 15, dMult: 1, order: 2 },
  { key: 'high_card',     name: 'High Card',      chips: 5,   mult: 1,  dChips: 10, dMult: 1, order: 1 },
];

export const HAND_BY_KEY = Object.fromEntries(HANDS.map((h) => [h.key, h]));

/** Hands displayed in the "Run Info" panel, best first. */
export const DISPLAY_HANDS = HANDS.slice().sort((a, b) => b.order - a.order);

export function freshHandLevels() {
  const out = {};
  for (const h of HANDS) out[h.key] = { level: 1, plays: 0 };
  return out;
}

export function handStats(key, levels) {
  const h = HAND_BY_KEY[key];
  const lvl = levels?.[key]?.level ?? 1;
  return {
    level: lvl,
    chips: h.chips + h.dChips * (lvl - 1),
    mult: h.mult + h.dMult * (lvl - 1),
  };
}

/** Suits are normally distinct; the Smeared Joker merges them into two colours. */
function suitGroups(smeared) {
  return smeared ? [['S', 'C'], ['H', 'D']] : SUIT_KEYS.map((s) => [s]);
}

function findFlush(cards, need, smeared) {
  let best = null;
  for (const group of suitGroups(smeared)) {
    const match = cards.filter((c) => group.some((s) => hasSuit(c, s)));
    if (match.length >= need && (!best || match.length > best.length)) best = match;
  }
  return best;
}

function findStraight(cards, need, shortcut) {
  const live = cards.filter((c) => !isStone(c));
  if (live.length < need) return null;

  // Map rank -> a representative card. Aces also count low for A-2-3-4-5.
  const byRank = new Map();
  for (const c of live) if (!byRank.has(c.rank)) byRank.set(c.rank, c);
  if (byRank.has(14) && !byRank.has(1)) byRank.set(1, byRank.get(14));

  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  const maxGap = shortcut ? 2 : 1;

  let best = null;
  for (let i = 0; i < ranks.length; i++) {
    const run = [ranks[i]];
    for (let j = i + 1; j < ranks.length; j++) {
      const gap = ranks[j] - run[run.length - 1];
      if (gap === 0) continue;
      if (gap > maxGap) break;
      run.push(ranks[j]);
    }
    if (run.length >= need && (!best || run.length > best.length)) best = run;
  }
  if (!best) return null;

  // Collapse the low-ace alias back to a single card reference.
  const seen = new Set();
  const out = [];
  for (const r of best) {
    const c = byRank.get(r);
    if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
  }
  return out.length >= need ? out : null;
}

function rankGroups(cards) {
  const map = new Map();
  for (const c of cards) {
    if (isStone(c)) continue;
    if (!map.has(c.rank)) map.set(c.rank, []);
    map.get(c.rank).push(c);
  }
  return [...map.values()].sort((a, b) => b.length - a.length || b[0].rank - a[0].rank);
}

/**
 * Identify the best hand in `cards`.
 * opts: { fourFingers, shortcut, smeared } — joker-granted rule changes.
 * Returns { key, name, scoring: Card[] } where `scoring` is the set that earns chips.
 */
export function evaluate(cards, opts = {}) {
  const { fourFingers = false, shortcut = false, smeared = false } = opts;
  const need = fourFingers ? 4 : 5;

  const groups = rankGroups(cards);
  const top = groups[0]?.length ?? 0;
  const second = groups[1]?.length ?? 0;

  const flush = findFlush(cards, need, smeared);
  const straight = findStraight(cards, need, shortcut);
  const fullHouse = top >= 3 && second >= 2;

  let key, scoring;
  if (top >= 5 && flush) { key = 'flush_five'; scoring = cards.slice(); }
  else if (fullHouse && flush) { key = 'flush_house'; scoring = cards.slice(); }
  else if (top >= 5) { key = 'five'; scoring = groups[0].slice(0, 5); }
  else if (straight && flush) {
    key = 'straight_flush';
    // Cards must be in both sets to count toward a straight flush.
    const ids = new Set(flush.map((c) => c.id));
    const both = straight.filter((c) => ids.has(c.id));
    scoring = both.length >= need ? both : flush;
  }
  else if (top >= 4) { key = 'four'; scoring = groups[0].slice(0, 4); }
  else if (fullHouse) { key = 'full_house'; scoring = [...groups[0].slice(0, 3), ...groups[1].slice(0, 2)]; }
  else if (flush) { key = 'flush'; scoring = flush; }
  else if (straight) { key = 'straight'; scoring = straight; }
  else if (top >= 3) { key = 'three'; scoring = groups[0].slice(0, 3); }
  else if (top >= 2 && second >= 2) { key = 'two_pair'; scoring = [...groups[0].slice(0, 2), ...groups[1].slice(0, 2)]; }
  else if (top >= 2) { key = 'pair'; scoring = groups[0].slice(0, 2); }
  else {
    key = 'high_card';
    const live = cards.filter((c) => !isStone(c));
    scoring = live.length ? [live.reduce((a, b) => (b.rank > a.rank ? b : a))] : [];
  }

  // Stone cards never form hands but always earn their chips.
  const ids = new Set(scoring.map((c) => c.id));
  for (const c of cards) if (isStone(c) && !ids.has(c.id)) { scoring.push(c); ids.add(c.id); }

  // Preserve the order the player laid the cards down in — scoring is left to right.
  scoring = cards.filter((c) => ids.has(c.id));

  return { key, name: HAND_BY_KEY[key].name, scoring };
}

/** Cheap "what would this be?" probe for the live hand-name readout. */
export function previewName(cards, opts) {
  if (!cards.length) return '';
  return evaluate(cards, opts).name;
}

/**
 * "Does this hand contain X?" — used by the many jokers that reward a pattern
 * rather than an exact hand. Four of a Kind contains a Pair, and so on.
 */
export function contains(cards, what, opts = {}) {
  const { fourFingers = false, shortcut = false, smeared = false } = opts;
  const need = fourFingers ? 4 : 5;
  const groups = rankGroups(cards);
  const counts = groups.map((g) => g.length);
  switch (what) {
    case 'pair': return counts.some((n) => n >= 2);
    case 'two_pair': return counts.filter((n) => n >= 2).length >= 2 || counts.some((n) => n >= 4);
    case 'three': return counts.some((n) => n >= 3);
    case 'four': return counts.some((n) => n >= 4);
    case 'five': return counts.some((n) => n >= 5);
    case 'full_house': return counts[0] >= 3 && counts[1] >= 2;
    case 'straight': return !!findStraight(cards, need, shortcut);
    case 'flush': return !!findFlush(cards, need, smeared);
    default: return false;
  }
}
