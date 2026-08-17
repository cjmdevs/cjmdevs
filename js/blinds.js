// Antes, blinds, boss abilities and the skip tags.

import { isFace, hasSuit } from './cards.js';

const ANTE_TABLE = [0, 300, 800, 2000, 5000, 11000, 20000, 35000, 50000];

/** Chip requirement of an ante's Small Blind. Endless play keeps escalating. */
export function anteBase(ante) {
  if (ante <= 8) return ANTE_TABLE[ante];
  let v = ANTE_TABLE[8];
  for (let a = 9; a <= ante; a++) v = Math.round(v * (1.6 + 0.15 * (a - 8)));
  return v;
}

export const BLIND_SLOTS = [
  { key: 'small', name: 'Small Blind', mult: 1, reward: 3, skippable: true },
  { key: 'big', name: 'Big Blind', mult: 1.5, reward: 4, skippable: true },
  { key: 'boss', name: 'Boss Blind', mult: 2, reward: 5, skippable: false },
];

/**
 * Boss abilities. Anything the engine needs to branch on lives in `flags`;
 * `debuff(card)` marks cards as dead weight for the whole round.
 */
export const BOSSES = [
  { key: 'hook', name: 'The Hook', desc: 'Discards 2 random cards from your hand after every hand played',
    flags: { discardAfterPlay: 2 } },
  { key: 'ox', name: 'The Ox', desc: 'Playing your most-played hand sets your money to $0',
    flags: { oxPenalty: true } },
  { key: 'wall', name: 'The Wall', desc: 'Extra large blind — double the usual score',
    flags: { targetMult: 2 } },
  { key: 'needle', name: 'The Needle', desc: 'You get one hand only',
    flags: { handsOverride: 1 } },
  { key: 'water', name: 'The Water', desc: 'You start the round with 0 discards',
    flags: { discardsOverride: 0 } },
  { key: 'manacle', name: 'The Manacle', desc: '-1 hand size',
    flags: { handSize: -1 } },
  { key: 'psychic', name: 'The Psychic', desc: 'Every hand must be played with exactly 5 cards',
    flags: { mustPlay: 5 } },
  { key: 'eye', name: 'The Eye', desc: 'No hand type may be played more than once this round',
    flags: { noRepeatHand: true } },
  { key: 'mouth', name: 'The Mouth', desc: 'Only one hand type may be played this round',
    flags: { singleHandType: true } },
  { key: 'flint', name: 'The Flint', desc: 'Base chips and Mult of your played hand are halved',
    flags: { halveBase: true } },
  { key: 'tooth', name: 'The Tooth', desc: 'Lose $1 for every card you play',
    flags: { costPerCard: 1 } },
  { key: 'arm', name: 'The Arm', desc: 'Decreases the level of the hand you play by 1',
    flags: { downgrade: true } },
  { key: 'pillar', name: 'The Pillar', desc: 'Cards you already played this round are debuffed',
    flags: { pillar: true } },
  { key: 'club', name: 'The Club', desc: 'All ♣ Club cards are debuffed', debuff: (c) => hasSuit(c, 'C') },
  { key: 'goad', name: 'The Goad', desc: 'All ♠ Spade cards are debuffed', debuff: (c) => hasSuit(c, 'S') },
  { key: 'window', name: 'The Window', desc: 'All ♦ Diamond cards are debuffed', debuff: (c) => hasSuit(c, 'D') },
  { key: 'heart', name: 'The Heart', desc: 'All ♥ Heart cards are debuffed', debuff: (c) => hasSuit(c, 'H') },
  { key: 'plant', name: 'The Plant', desc: 'All face cards are debuffed', debuff: isFace },
  { key: 'serpent', name: 'The Serpent', desc: 'You always draw exactly 3 cards after playing or discarding',
    flags: { drawFixed: 3 } },
  { key: 'sun', name: 'The Sun', desc: 'All cards are drawn face down until you play a hand',
    flags: { blindDraw: true } },
];

/** Ante 8, 16, 24… get one of these instead. */
export const FINISHERS = [
  { key: 'vessel', name: 'Violet Vessel', finisher: true, desc: 'A colossal blind — triple the usual score',
    flags: { targetMult: 3 } },
  { key: 'crimson', name: 'Crimson Heart', finisher: true, desc: 'One random Joker is switched off for each hand you play',
    flags: { disableJoker: true } },
  { key: 'bell', name: 'Cerulean Bell', finisher: true, desc: 'One random card in your hand is always forced to be selected',
    flags: { forceCard: true } },
];

export const BOSS_BY_KEY = Object.fromEntries([...BOSSES, ...FINISHERS].map((b) => [b.key, b]));

export function pickBoss(rng, ante, seen = new Set()) {
  if (ante % 8 === 0) return rng.pick(FINISHERS).key;
  const fresh = BOSSES.filter((b) => !seen.has(b.key));
  return rng.pick(fresh.length ? fresh : BOSSES).key;
}

/** Chip target for a given ante + blind slot, including any boss multiplier. */
export function blindTarget(ante, blindIndex, bossKey) {
  const slot = BLIND_SLOTS[blindIndex];
  let target = Math.round(anteBase(ante) * slot.mult);
  if (blindIndex === 2 && bossKey) {
    const boss = BOSS_BY_KEY[bossKey];
    if (boss?.flags?.targetMult) target = Math.round(anteBase(ante) * boss.flags.targetMult);
  }
  return target;
}

// ------------------------------------------------------------------ Tags ----
// Rewards for skipping a Small or Big Blind.

export const TAGS = [
  { key: 'uncommon', name: 'Uncommon Tag', desc: 'The next shop has a free Uncommon Joker' },
  { key: 'rare', name: 'Rare Tag', desc: 'The next shop has a free Rare Joker' },
  { key: 'investment', name: 'Investment Tag', desc: 'Earn $25 after defeating the next Boss Blind' },
  { key: 'handy', name: 'Handy Tag', desc: 'Earn $1 for every hand you have played this run' },
  { key: 'garbage', name: 'Garbage Tag', desc: 'Earn $1 for every discard you have not used this run' },
  { key: 'juggle', name: 'Juggle Tag', desc: '+3 hand size for the next round' },
  { key: 'voucher', name: 'Voucher Tag', desc: 'Adds one extra Voucher to the next shop' },
  { key: 'd6', name: 'D6 Tag', desc: 'Shop rerolls start at $0 for the next shop' },
  { key: 'economy', name: 'Economy Tag', desc: 'Doubles your money, up to a maximum of $40' },
  { key: 'charm', name: 'Charm Tag', desc: 'Immediately opens a free Mega Arcana Pack' },
  { key: 'meteor', name: 'Meteor Tag', desc: 'Immediately opens a free Mega Celestial Pack' },
  { key: 'buffoon', name: 'Buffoon Tag', desc: 'Immediately opens a free Mega Buffoon Pack' },
  { key: 'ethereal', name: 'Ethereal Tag', desc: 'Immediately opens a free Spectral Pack' },
  { key: 'standard', name: 'Standard Tag', desc: 'Immediately opens a free Mega Standard Pack' },
  { key: 'coupon', name: 'Coupon Tag', desc: 'Every Joker and consumable in the next shop is free' },
];

export const TAG_BY_KEY = Object.fromEntries(TAGS.map((t) => [t.key, t]));
export const pickTag = (rng) => rng.pick(TAGS).key;
