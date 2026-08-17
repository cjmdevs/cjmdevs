// Consumable cards: Tarots reshape your deck, Planets level your hands,
// Spectrals do something dramatic and usually a little dangerous.

import { makeCard, SUIT_KEYS, RANKS, isStone, bumpRank } from './cards.js';
import { HANDS } from './poker.js';
import { uid } from './util.js';

export const CONSUMABLES = [];
const C = (def) => { CONSUMABLES.push(def); return def; };

/** `sel` describes how many cards from hand the player must highlight. */
const pick = (min, max) => ({ min, max });
const none = pick(0, 0);

const enhance = (key, name, enh, count, blurb) =>
  C({ key, name, type: 'tarot', cost: 3, sel: pick(1, count),
      text: () => blurb,
      apply: (G, sel) => { sel.forEach((c) => { c.enhancement = enh; }); return { msg: name }; } });

const recolor = (key, name, suit, blurb) =>
  C({ key, name, type: 'tarot', cost: 3, sel: pick(1, 3),
      text: () => blurb,
      apply: (G, sel) => {
        sel.forEach((c) => { if (!isStone(c)) c.suit = suit; });
        return { msg: name };
      } });

// ----------------------------------------------------------------- Tarot ----

C({ key: 'fool', name: 'The Fool', type: 'tarot', cost: 3, sel: none,
  text: () => 'Creates a copy of the last Tarot or Planet card you used',
  apply: (G, sel, api) => {
    const last = G.stats.lastConsumable;
    if (!last || last === 'fool') return { ok: false, msg: 'Nothing to copy' };
    api.createConsumableKey(last);
    return { msg: 'The Fool' };
  } });

enhance('magician', 'The Magician', 'lucky', 2, 'Turns up to 2 selected cards into Lucky cards');
enhance('empress', 'The Empress', 'mult', 2, 'Turns up to 2 selected cards into Mult cards');
enhance('hierophant', 'The Hierophant', 'bonus', 2, 'Turns up to 2 selected cards into Bonus cards');
enhance('lovers', 'The Lovers', 'wild', 1, 'Turns 1 selected card into a Wild card');
enhance('chariot', 'The Chariot', 'steel', 1, 'Turns 1 selected card into a Steel card');
enhance('justice', 'Justice', 'glass', 1, 'Turns 1 selected card into a Glass card');
enhance('devil', 'The Devil', 'gold', 1, 'Turns 1 selected card into a Gold card');
enhance('tower', 'The Tower', 'stone', 1, 'Turns 1 selected card into a Stone card');

C({ key: 'high_priestess', name: 'The High Priestess', type: 'tarot', cost: 3, sel: none,
  text: () => 'Creates up to 2 random Planet cards',
  apply: (G, sel, api) => { api.createRandom('planet', 2); return { msg: 'Planets!' }; } });

C({ key: 'emperor', name: 'The Emperor', type: 'tarot', cost: 3, sel: none,
  text: () => 'Creates up to 2 random Tarot cards',
  apply: (G, sel, api) => { api.createRandom('tarot', 2); return { msg: 'Tarots!' }; } });

C({ key: 'hermit', name: 'The Hermit', type: 'tarot', cost: 3, sel: none,
  text: () => 'Doubles your money, up to a maximum of $20',
  apply: (G, sel, api) => { api.addMoney(Math.min(20, Math.max(0, G.money))); return { msg: 'Doubled!' }; } });

C({ key: 'wheel', name: 'Wheel of Fortune', type: 'tarot', cost: 3, sel: none,
  text: () => '1 in 4 chance to add a random edition to a random Joker',
  apply: (G, sel, api) => {
    const plain = G.jokers.filter((j) => !j.edition);
    if (!plain.length) return { ok: false, msg: 'No Jokers' };
    if (!api.rng.chance(1, 4)) return { msg: 'Nope!' };
    api.rng.pick(plain).edition = api.rng.pick(['foil', 'holo', 'poly']);
    return { msg: 'Upgraded!' };
  } });

C({ key: 'strength', name: 'Strength', type: 'tarot', cost: 3, sel: pick(1, 2),
  text: () => 'Increases the rank of up to 2 selected cards by 1',
  apply: (G, sel) => { sel.forEach((c) => bumpRank(c, 1)); return { msg: 'Strength' }; } });

C({ key: 'hanged_man', name: 'The Hanged Man', type: 'tarot', cost: 3, sel: pick(1, 2),
  text: () => 'Destroys up to 2 selected cards',
  apply: (G, sel, api) => { sel.forEach((c) => api.destroyCard(c)); return { msg: 'Destroyed' }; } });

C({ key: 'death', name: 'Death', type: 'tarot', cost: 3, sel: pick(2, 2),
  text: () => 'Select 2 cards: the left one becomes a copy of the right one',
  apply: (G, sel) => {
    const [a, b] = sel;
    Object.assign(a, { rank: b.rank, suit: b.suit, enhancement: b.enhancement, edition: b.edition, seal: b.seal });
    return { msg: 'Death' };
  } });

C({ key: 'temperance', name: 'Temperance', type: 'tarot', cost: 3, sel: none,
  text: () => 'Gives the total sell value of your Jokers, up to $50',
  apply: (G, sel, api) => {
    const total = G.jokers.reduce((s, j) => s + Math.max(1, Math.floor(j.cost / 2)), 0);
    api.addMoney(Math.min(50, total));
    return { msg: 'Temperance' };
  } });

C({ key: 'judgement', name: 'Judgement', type: 'tarot', cost: 3, sel: none,
  text: () => 'Creates a random Joker',
  apply: (G, sel, api) => (api.createJoker() ? { msg: 'Judgement' } : { ok: false, msg: 'No Joker room' }) });

recolor('star', 'The Star', 'D', 'Turns up to 3 selected cards into ♦ Diamonds');
recolor('moon', 'The Moon', 'C', 'Turns up to 3 selected cards into ♣ Clubs');
recolor('sun', 'The Sun', 'H', 'Turns up to 3 selected cards into ♥ Hearts');
recolor('world', 'The World', 'S', 'Turns up to 3 selected cards into ♠ Spades');

// ---------------------------------------------------------------- Planet ----

const PLANETS = [
  ['pluto', 'Pluto', 'high_card'],
  ['mercury', 'Mercury', 'pair'],
  ['uranus', 'Uranus', 'two_pair'],
  ['venus', 'Venus', 'three'],
  ['saturn', 'Saturn', 'straight'],
  ['jupiter', 'Jupiter', 'flush'],
  ['earth', 'Earth', 'full_house'],
  ['mars', 'Mars', 'four'],
  ['neptune', 'Neptune', 'straight_flush'],
  ['planet_x', 'Planet X', 'five'],
  ['ceres', 'Ceres', 'flush_house'],
  ['eris', 'Eris', 'flush_five'],
];

for (const [key, name, hand] of PLANETS) {
  const h = HANDS.find((x) => x.key === hand);
  C({ key, name, type: 'planet', cost: 3, hand, sel: none,
    text: (G) => `Levels up ${h.name} (+${h.dChips} chips, +${h.dMult} Mult)`,
    apply: (G, sel, api) => { api.levelHand(hand, 1); return { msg: `${h.name} Lv.${G.handLevels[hand].level}` }; } });
}

/** Planets are only offered for hands the player has actually discovered. */
export const PLANET_KEYS = PLANETS.map(([k]) => k);

// -------------------------------------------------------------- Spectral ----

const S = (key, name, sel, text, apply) =>
  C({ key, name, type: 'spectral', cost: 4, sel, text: () => text, apply });

S('familiar', 'Familiar', none,
  'Destroys 1 random card in hand, then adds 3 random Enhanced face cards',
  (G, sel, api) => {
    api.destroyRandomInHand(1);
    for (let i = 0; i < 3; i++) api.addRandomCard({ ranks: [11, 12, 13], enhanced: true });
    return { msg: 'Familiar' };
  });

S('grim', 'Grim', none,
  'Destroys 1 random card in hand, then adds 2 random Enhanced Aces',
  (G, sel, api) => {
    api.destroyRandomInHand(1);
    for (let i = 0; i < 2; i++) api.addRandomCard({ ranks: [14], enhanced: true });
    return { msg: 'Grim' };
  });

S('incantation', 'Incantation', none,
  'Destroys 1 random card in hand, then adds 4 random Enhanced numbered cards',
  (G, sel, api) => {
    api.destroyRandomInHand(1);
    for (let i = 0; i < 4; i++) api.addRandomCard({ ranks: [2, 3, 4, 5, 6, 7, 8, 9, 10], enhanced: true });
    return { msg: 'Incantation' };
  });

S('talisman', 'Talisman', pick(1, 1), 'Adds a Gold Seal to 1 selected card',
  (G, sel) => { sel[0].seal = 'gold'; return { msg: 'Gold Seal' }; });

S('deja_vu', 'Deja Vu', pick(1, 1), 'Adds a Red Seal to 1 selected card',
  (G, sel) => { sel[0].seal = 'red'; return { msg: 'Red Seal' }; });

S('trance', 'Trance', pick(1, 1), 'Adds a Blue Seal to 1 selected card',
  (G, sel) => { sel[0].seal = 'blue'; return { msg: 'Blue Seal' }; });

S('medium', 'Medium', pick(1, 1), 'Adds a Purple Seal to 1 selected card',
  (G, sel) => { sel[0].seal = 'purple'; return { msg: 'Purple Seal' }; });

S('aura', 'Aura', pick(1, 1), 'Adds Foil, Holographic or Polychrome to 1 selected card',
  (G, sel, api) => { sel[0].edition = api.rng.pick(['foil', 'holo', 'poly']); return { msg: 'Aura' }; });

S('wraith', 'Wraith', none, 'Creates a random Rare Joker, but sets your money to $0',
  (G, sel, api) => {
    if (!api.createJoker(3)) return { ok: false, msg: 'No Joker room' };
    api.setMoney(0);
    return { msg: 'Wraith' };
  });

S('sigil', 'Sigil', none, 'Converts every card in your hand to a single random suit',
  (G, sel, api) => {
    const suit = api.rng.pick(SUIT_KEYS);
    G.hand.forEach((c) => { if (!isStone(c)) c.suit = suit; });
    return { msg: 'Sigil' };
  });

S('ouija', 'Ouija', none, 'Converts every card in your hand to a single random rank. -1 hand size',
  (G, sel, api) => {
    const rank = api.rng.pick(RANKS);
    G.hand.forEach((c) => { if (!isStone(c)) c.rank = rank; });
    G.handSizeMod -= 1;
    return { msg: 'Ouija' };
  });

S('ectoplasm', 'Ectoplasm', none, 'Adds Negative to a random Joker. -1 hand size',
  (G, sel, api) => {
    const plain = G.jokers.filter((j) => j.edition !== 'negative');
    if (!plain.length) return { ok: false, msg: 'No Jokers' };
    api.rng.pick(plain).edition = 'negative';
    G.handSizeMod -= 1;
    return { msg: 'Negative!' };
  });

S('immolate', 'Immolate', none, 'Destroys 5 random cards in hand and gives $20',
  (G, sel, api) => { api.destroyRandomInHand(5); api.addMoney(20); return { msg: 'Immolate' }; });

S('ankh', 'Ankh', none, 'Copies a random Joker, then destroys all your other Jokers',
  (G, sel, api) => {
    if (!G.jokers.length) return { ok: false, msg: 'No Jokers' };
    const keep = api.rng.pick(G.jokers);
    const copy = api.copyJoker(keep);
    G.jokers = [keep, copy].filter(Boolean);
    return { msg: 'Ankh' };
  });

S('hex', 'Hex', none, 'Adds Polychrome to a random Joker and destroys all your other Jokers',
  (G, sel, api) => {
    if (!G.jokers.length) return { ok: false, msg: 'No Jokers' };
    const keep = api.rng.pick(G.jokers);
    keep.edition = 'poly';
    G.jokers = [keep];
    return { msg: 'Hex' };
  });

S('cryptid', 'Cryptid', pick(1, 1), 'Creates 2 copies of 1 selected card',
  (G, sel, api) => {
    for (let i = 0; i < 2; i++) api.addCard({ ...sel[0], id: uid('c') });
    return { msg: 'Cryptid' };
  });

S('soul', 'The Soul', none, 'Creates a Legendary Joker',
  (G, sel, api) => (api.createJoker(4) ? { msg: 'The Soul' } : { ok: false, msg: 'No Joker room' }));

S('black_hole', 'Black Hole', none, 'Upgrades every poker hand by 1 level',
  (G, sel, api) => { HANDS.forEach((h) => api.levelHand(h.key, 1)); return { msg: 'Black Hole' }; });

export const CONSUMABLE_BY_KEY = Object.fromEntries(CONSUMABLES.map((c) => [c.key, c]));

/** These read or reshape the live hand, so they only work during a blind. */
export const NEEDS_HAND = new Set(['familiar', 'grim', 'incantation', 'sigil', 'ouija', 'immolate']);

export const TAROT_KEYS = CONSUMABLES.filter((c) => c.type === 'tarot').map((c) => c.key);
/** The Soul and Black Hole are treasures — they never show up in normal shops. */
export const SPECTRAL_KEYS = CONSUMABLES.filter(
  (c) => c.type === 'spectral' && c.key !== 'soul' && c.key !== 'black_hole'
).map((c) => c.key);

export function makeConsumable(key, edition = null) {
  const def = CONSUMABLE_BY_KEY[key];
  if (!def) throw new Error('unknown consumable: ' + key);
  return { id: uid('u'), key, type: def.type, cost: def.cost, edition };
}

export function consumableText(item, G) {
  const def = CONSUMABLE_BY_KEY[item.key];
  return typeof def.text === 'function' ? def.text(G) : def.text;
}

export function randomEnhancedCard(rng, { ranks = RANKS, suits = SUIT_KEYS, enhanced = false } = {}) {
  const c = makeCard(rng.pick(ranks), rng.pick(suits));
  if (enhanced) {
    c.enhancement = rng.pick(['bonus', 'mult', 'wild', 'glass', 'steel', 'gold', 'lucky']);
  }
  return c;
}
