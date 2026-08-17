// Playing-card model: ranks, suits, enhancements, editions and seals.

import { uid } from './util.js';

export const SUITS = {
  S: { key: 'S', name: 'Spades', pip: '♠', color: 'black' },
  H: { key: 'H', name: 'Hearts', pip: '♥', color: 'red' },
  D: { key: 'D', name: 'Diamonds', pip: '♦', color: 'red' },
  C: { key: 'C', name: 'Clubs', pip: '♣', color: 'black' },
};
export const SUIT_KEYS = ['S', 'H', 'D', 'C'];

/** Ranks are stored numerically. 11=J 12=Q 13=K 14=A. */
export const RANK_LABEL = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const ENHANCEMENTS = {
  bonus:  { key: 'bonus',  name: 'Bonus Card',  blurb: '+30 chips' },
  mult:   { key: 'mult',   name: 'Mult Card',   blurb: '+4 Mult' },
  wild:   { key: 'wild',   name: 'Wild Card',   blurb: 'counts as every suit' },
  glass:  { key: 'glass',  name: 'Glass Card',  blurb: 'x2 Mult, 1 in 4 to shatter' },
  steel:  { key: 'steel',  name: 'Steel Card',  blurb: 'x1.5 Mult while held in hand' },
  stone:  { key: 'stone',  name: 'Stone Card',  blurb: '+50 chips, no rank or suit' },
  gold:   { key: 'gold',   name: 'Gold Card',   blurb: '$3 if held at end of round' },
  lucky:  { key: 'lucky',  name: 'Lucky Card',  blurb: '1 in 5 for +20 Mult, 1 in 15 for $20' },
};

export const EDITIONS = {
  foil:  { key: 'foil',  name: 'Foil',        blurb: '+50 chips' },
  holo:  { key: 'holo',  name: 'Holographic', blurb: '+10 Mult' },
  poly:  { key: 'poly',  name: 'Polychrome',  blurb: 'x1.5 Mult' },
  negative: { key: 'negative', name: 'Negative', blurb: '+1 Joker slot' },
};

export const SEALS = {
  gold:   { key: 'gold',   name: 'Gold Seal',   blurb: 'earns $3 when scored' },
  red:    { key: 'red',    name: 'Red Seal',    blurb: 'retriggers this card once' },
  blue:   { key: 'blue',   name: 'Blue Seal',   blurb: 'creates a Planet card if held at end of round' },
  purple: { key: 'purple', name: 'Purple Seal', blurb: 'creates a Tarot card when discarded' },
};

export function makeCard(rank, suit, extra = {}) {
  return {
    id: uid('c'),
    rank,
    suit,
    enhancement: null,
    edition: null,
    seal: null,
    debuffed: false,
    ...extra,
  };
}

export function standardDeck() {
  const deck = [];
  for (const s of SUIT_KEYS) for (const r of RANKS) deck.push(makeCard(r, s));
  return deck;
}

/** Stone cards have no usable rank; several systems must skip them. */
export const isStone = (c) => c.enhancement === 'stone';

export function cardLabel(c) {
  if (isStone(c)) return 'Stone';
  return RANK_LABEL[c.rank] + SUITS[c.suit].pip;
}

/** Chip value contributed by the card's face. Aces are 11, faces are 10. */
export function baseChips(c) {
  if (isStone(c)) return 50;
  if (c.rank === 14) return 11;
  if (c.rank >= 11) return 10;
  return c.rank;
}

export const isFace = (c) => !isStone(c) && c.rank >= 11 && c.rank <= 13;

/** Wild cards satisfy every suit query. */
export function hasSuit(c, suit) {
  if (isStone(c)) return false;
  if (c.enhancement === 'wild') return true;
  return c.suit === suit;
}

/** Rank arithmetic wraps 2..A, used by Strength and a few jokers. */
export function bumpRank(c, delta = 1) {
  if (isStone(c)) return c;
  let r = c.rank + delta;
  if (r > 14) r = 2;
  if (r < 2) r = 14;
  c.rank = r;
  return c;
}

export function sellValue(cost) { return Math.max(1, Math.floor(cost / 2)); }

/** Sorting helpers used by the two hand-sort buttons. */
export const bySuit = (a, b) =>
  SUIT_KEYS.indexOf(a.suit) - SUIT_KEYS.indexOf(b.suit) || b.rank - a.rank;
export const byRank = (a, b) =>
  b.rank - a.rank || SUIT_KEYS.indexOf(a.suit) - SUIT_KEYS.indexOf(b.suit);
