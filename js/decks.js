// Starting decks. Each one bends the run's opening rules in a different way.

import { standardDeck, makeCard, SUIT_KEYS, RANKS } from './cards.js';

export const DECKS = [
  { key: 'standard', name: 'Standard Deck', desc: 'A plain 52-card deck. No advantages, no drawbacks.' },
  { key: 'red', name: 'Red Deck', desc: '+1 discard every round.', mods: { discards: 1 } },
  { key: 'blue', name: 'Blue Deck', desc: '+1 hand every round.', mods: { hands: 1 } },
  { key: 'yellow', name: 'Yellow Deck', desc: 'Start the run with an extra $10.', mods: { money: 10 } },
  { key: 'green', name: 'Green Deck', desc: 'Earn $2 per remaining hand and $1 per remaining discard. No interest.',
    mods: { noInterest: true, handCash: 2, discardCash: 1 } },
  { key: 'black', name: 'Black Deck', desc: '+1 Joker slot, but -1 hand every round.', mods: { jokerSlots: 1, hands: -1 } },
  { key: 'magic', name: 'Magic Deck', desc: 'Start with the Crystal Ball voucher and two copies of The Fool.',
    mods: { vouchers: ['crystal_ball'], consumables: ['fool', 'fool'] } },
  { key: 'nebula', name: 'Nebula Deck', desc: 'Start with the Telescope voucher, but -1 consumable slot.',
    mods: { vouchers: ['telescope'], consumableSlots: -1 } },
  { key: 'ghost', name: 'Ghost Deck', desc: 'Spectral cards appear in the shop. Start with a Hex card.',
    mods: { consumables: ['hex'], spectralShop: true } },
  { key: 'abandoned', name: 'Abandoned Deck', desc: 'Start with a deck that has no face cards at all.',
    build: () => standardDeck().filter((c) => c.rank < 11 || c.rank === 14) },
  { key: 'checkered', name: 'Checkered Deck', desc: 'Start with 26 ♠ Spades and 26 ♥ Hearts.',
    build: () => {
      const deck = [];
      for (const s of ['S', 'H']) for (const r of RANKS) for (let i = 0; i < 2; i++) deck.push(makeCard(r, s));
      return deck;
    } },
  { key: 'zodiac', name: 'Zodiac Deck', desc: 'Start with Tarot Merchant, Planet Merchant and Overstock.',
    mods: { vouchers: ['tarot_merchant', 'planet_merchant', 'overstock'] } },
  { key: 'painted', name: 'Painted Deck', desc: '+2 hand size, but -1 Joker slot.', mods: { handSize: 2, jokerSlots: -1 } },
  { key: 'anaglyph', name: 'Anaglyph Deck', desc: 'Gain a random Tag after defeating each Boss Blind.', mods: { bossTag: true } },
  { key: 'plasma', name: 'Plasma Deck', desc: 'Balances chips and Mult when scoring, but blinds are twice as large.',
    mods: { plasma: true, blindMult: 2 } },
  { key: 'erratic', name: 'Erratic Deck', desc: 'Every card in the deck has a random rank and suit.',
    build: (rng) => {
      const deck = [];
      for (let i = 0; i < 52; i++) deck.push(makeCard(rng.pick(RANKS), rng.pick(SUIT_KEYS)));
      return deck;
    } },
];

export const DECK_BY_KEY = Object.fromEntries(DECKS.map((d) => [d.key, d]));
