// Joker definitions. Every joker is data plus a handful of optional hooks.
//
// Hook contract — all hooks may return { chips, mult, xmult, money, msg }:
//   ind(ctx)                 once per hand, after every card has scored
//   scored(ctx, card)        per card that earns chips
//   held(ctx, card)          per card still in hand when the hand is played
//   retrigger(ctx, card)     extra triggers for a scoring card (returns a number)
//   retriggerHeld(ctx, card) extra triggers for a held card (returns a number)
//   onPlay(ctx)              hand committed, before scoring
//   onDiscard(ctx, cards)    cards discarded
//   onBlindStart(ctx)        blind selected
//   onRoundEnd(ctx)          blind beaten
//   onDestroy(ctx, card)     a playing card was destroyed
//   rules                    passive rule changes for hand evaluation
//
// `ctx` = { G, j, played, scoring, hand, handKey, rng, contains(key), destroyed }

import { isFace, isStone, baseChips, hasSuit, RANKS, SUIT_KEYS, SUITS, RANK_LABEL, sellValue } from './cards.js';
import { uid } from './util.js';

export const RARITY = {
  1: { key: 'common', name: 'Common', color: '#3a8fd6' },
  2: { key: 'uncommon', name: 'Uncommon', color: '#3ec46d' },
  3: { key: 'rare', name: 'Rare', color: '#e05b5b' },
  4: { key: 'legendary', name: 'Legendary', color: '#b45be0' },
};

export const JOKERS = [];
const J = (def) => { JOKERS.push(def); return def; };

const suitCount = (cards, s) => cards.filter((c) => hasSuit(c, s)).length;

/** Slot counts live on G.derived, which is recomputed after every mutation. */
const emptySlots = (G) => Math.max(0, (G.derived?.jokerSlots ?? G.jokers.length) - G.jokers.length);

// ---------------------------------------------------------------- Common ----

J({ key: 'jester', name: 'The Jester', rarity: 1, cost: 2,
  text: () => '+4 Mult',
  ind: () => ({ mult: 4 }) });

J({ key: 'coin_cutter', name: 'Coin Cutter', rarity: 1, cost: 5,
  text: () => 'Each scored ♦ gives +3 Mult',
  scored: (ctx, c) => (hasSuit(c, 'D') ? { mult: 3 } : null) });

J({ key: 'heartbreaker', name: 'Heartbreaker', rarity: 1, cost: 5,
  text: () => 'Each scored ♥ gives +3 Mult',
  scored: (ctx, c) => (hasSuit(c, 'H') ? { mult: 3 } : null) });

J({ key: 'gravedigger', name: 'Gravedigger', rarity: 1, cost: 5,
  text: () => 'Each scored ♠ gives +3 Mult',
  scored: (ctx, c) => (hasSuit(c, 'S') ? { mult: 3 } : null) });

J({ key: 'cloverfoot', name: 'Cloverfoot', rarity: 1, cost: 5,
  text: () => 'Each scored ♣ gives +3 Mult',
  scored: (ctx, c) => (hasSuit(c, 'C') ? { mult: 3 } : null) });

J({ key: 'jolly', name: 'Jolly Jack', rarity: 1, cost: 3,
  text: () => '+8 Mult if the hand contains a Pair',
  ind: (ctx) => (ctx.contains('pair') ? { mult: 8 } : null) });

J({ key: 'zany', name: 'Zany Zeke', rarity: 1, cost: 4,
  text: () => '+12 Mult if the hand contains Three of a Kind',
  ind: (ctx) => (ctx.contains('three') ? { mult: 12 } : null) });

J({ key: 'mad', name: 'Mad Margot', rarity: 1, cost: 4,
  text: () => '+10 Mult if the hand contains Two Pair',
  ind: (ctx) => (ctx.contains('two_pair') ? { mult: 10 } : null) });

J({ key: 'crazy', name: 'Crazy Carl', rarity: 1, cost: 4,
  text: () => '+12 Mult if the hand contains a Straight',
  ind: (ctx) => (ctx.contains('straight') ? { mult: 12 } : null) });

J({ key: 'droll', name: 'Droll Dolly', rarity: 1, cost: 4,
  text: () => '+10 Mult if the hand contains a Flush',
  ind: (ctx) => (ctx.contains('flush') ? { mult: 10 } : null) });

J({ key: 'sly', name: 'Sly Pete', rarity: 1, cost: 3,
  text: () => '+50 chips if the hand contains a Pair',
  ind: (ctx) => (ctx.contains('pair') ? { chips: 50 } : null) });

J({ key: 'wily', name: 'Wily Wanda', rarity: 1, cost: 4,
  text: () => '+100 chips if the hand contains Three of a Kind',
  ind: (ctx) => (ctx.contains('three') ? { chips: 100 } : null) });

J({ key: 'clever', name: 'Clever Clara', rarity: 1, cost: 4,
  text: () => '+80 chips if the hand contains Two Pair',
  ind: (ctx) => (ctx.contains('two_pair') ? { chips: 80 } : null) });

J({ key: 'devious', name: 'Devious Dan', rarity: 1, cost: 4,
  text: () => '+100 chips if the hand contains a Straight',
  ind: (ctx) => (ctx.contains('straight') ? { chips: 100 } : null) });

J({ key: 'crafty', name: 'Crafty Cass', rarity: 1, cost: 4,
  text: () => '+80 chips if the hand contains a Flush',
  ind: (ctx) => (ctx.contains('flush') ? { chips: 80 } : null) });

J({ key: 'half_pint', name: 'Half Pint', rarity: 1, cost: 5,
  text: () => '+20 Mult if the hand has 3 or fewer cards',
  ind: (ctx) => (ctx.played.length <= 3 ? { mult: 20 } : null) });

J({ key: 'banner', name: 'Banner', rarity: 1, cost: 5,
  text: () => '+30 chips per remaining discard',
  ind: (ctx) => ({ chips: 30 * ctx.G.discards }) });

J({ key: 'summit', name: 'Mystic Summit', rarity: 1, cost: 5,
  text: () => '+15 Mult when you have 0 discards left',
  ind: (ctx) => (ctx.G.discards === 0 ? { mult: 15 } : null) });

J({ key: 'misprint', name: 'Misprint', rarity: 1, cost: 4,
  text: () => '+0 to +23 Mult, decided each hand',
  ind: (ctx) => ({ mult: ctx.rng.range(0, 23) }) });

J({ key: 'raised_fist', name: 'Raised Fist', rarity: 1, cost: 5,
  text: () => 'Adds double the rank of your lowest held card to Mult',
  ind: (ctx) => {
    const live = ctx.hand.filter((c) => !isStone(c) && !c.debuffed);
    if (!live.length) return null;
    const low = live.reduce((a, b) => (b.rank < a.rank ? b : a));
    return { mult: 2 * baseChips(low) };
  } });

J({ key: 'scholar', name: 'The Scholar', rarity: 1, cost: 4,
  text: () => 'Each scored Ace gives +20 chips and +4 Mult',
  scored: (ctx, c) => (!isStone(c) && c.rank === 14 ? { chips: 20, mult: 4 } : null) });

J({ key: 'walkie', name: 'Walkie Talkie', rarity: 1, cost: 4,
  text: () => 'Each scored 10 or 4 gives +10 chips and +4 Mult',
  scored: (ctx, c) => (!isStone(c) && (c.rank === 10 || c.rank === 4) ? { chips: 10, mult: 4 } : null) });

J({ key: 'even_steven', name: 'Even Steven', rarity: 1, cost: 4,
  text: () => 'Each scored even-ranked card gives +4 Mult',
  scored: (ctx, c) => (!isStone(c) && c.rank <= 10 && c.rank % 2 === 0 ? { mult: 4 } : null) });

J({ key: 'odd_todd', name: 'Odd Todd', rarity: 1, cost: 4,
  text: () => 'Each scored odd-ranked card gives +31 chips',
  scored: (ctx, c) => (!isStone(c) && (c.rank === 14 || (c.rank <= 9 && c.rank % 2 === 1)) ? { chips: 31 } : null) });

J({ key: 'fibonacci', name: 'Fibonacci', rarity: 1, cost: 8,
  text: () => 'Each scored A, 2, 3, 5 or 8 gives +8 Mult',
  scored: (ctx, c) => (!isStone(c) && [14, 2, 3, 5, 8].includes(c.rank) ? { mult: 8 } : null) });

J({ key: 'scary_face', name: 'Scary Face', rarity: 1, cost: 4,
  text: () => 'Each scored face card gives +30 chips',
  scored: (ctx, c) => (isFace(c) ? { chips: 30 } : null) });

J({ key: 'smiley', name: 'Smiley Face', rarity: 1, cost: 4,
  text: () => 'Each scored face card gives +5 Mult',
  scored: (ctx, c) => (isFace(c) ? { mult: 5 } : null) });

J({ key: 'ripe_banana', name: 'Ripe Banana', rarity: 1, cost: 5,
  text: () => '+15 Mult. 1 in 6 chance to spoil at end of round',
  ind: () => ({ mult: 15 }),
  onRoundEnd: (ctx) => (ctx.rng.chance(1, 6) ? { destroySelf: true, spawn: 'overripe', msg: 'Spoiled!' } : null) });

J({ key: 'overripe', name: 'Overripe Banana', rarity: 1, cost: 4, noShop: true,
  text: () => 'x3 Mult. 1 in 1000 chance to spoil at end of round',
  ind: () => ({ xmult: 3 }),
  onRoundEnd: (ctx) => (ctx.rng.chance(1, 1000) ? { destroySelf: true, msg: 'Spoiled!' } : null) });

J({ key: 'bull', name: 'The Bull', rarity: 1, cost: 6,
  text: () => '+2 chips for each $1 you have',
  ind: (ctx) => ({ chips: 2 * Math.max(0, ctx.G.money) }) });

J({ key: 'runner', name: 'Runner', rarity: 1, cost: 5,
  text: (j) => `+${j.state.chips || 0} chips. Gains +15 chips per Straight played`,
  init: (j) => { j.state.chips = 0; },
  ind: (ctx) => ({ chips: ctx.j.state.chips }),
  onPlay: (ctx) => { if (ctx.contains('straight')) { ctx.j.state.chips += 15; return { msg: 'Upgrade!' }; } } });

J({ key: 'ice_cream', name: 'Ice Cream', rarity: 1, cost: 5,
  text: (j) => `+${j.state.chips} chips, -5 chips per hand played`,
  init: (j) => { j.state.chips = 100; },
  ind: (ctx) => ({ chips: ctx.j.state.chips }),
  onPlay: (ctx) => {
    ctx.j.state.chips -= 5;
    if (ctx.j.state.chips <= 0) return { destroySelf: true, msg: 'Melted!' };
  } });

J({ key: 'blue_joker', name: 'Blue Joker', rarity: 1, cost: 5,
  text: () => '+2 chips for each card left in your draw pile',
  ind: (ctx) => ({ chips: 2 * ctx.G.drawPile.length }) });

J({ key: 'abstract', name: 'Abstract Joker', rarity: 1, cost: 4,
  text: () => '+3 Mult for each Joker you own',
  ind: (ctx) => ({ mult: 3 * ctx.G.jokers.length }) });

J({ key: 'delayed', name: 'Delayed Gratification', rarity: 1, cost: 4,
  text: () => 'Earn $2 per unused discard at end of round',
  onRoundEnd: (ctx) => ({ money: 2 * ctx.G.discards }) });

J({ key: 'faceless', name: 'Faceless Joker', rarity: 1, cost: 4,
  text: () => 'Earn $5 if 3 or more face cards are discarded at once',
  onDiscard: (ctx, cards) => (cards.filter(isFace).length >= 3 ? { money: 5 } : null) });

J({ key: 'golden', name: 'Golden Joker', rarity: 1, cost: 6,
  text: () => 'Earn $4 at end of round',
  onRoundEnd: () => ({ money: 4 }) });

J({ key: 'square', name: 'Square Joker', rarity: 1, cost: 4,
  text: (j) => `+${j.state.chips} chips. Gains +4 chips per 4-card hand played`,
  init: (j) => { j.state.chips = 0; },
  ind: (ctx) => ({ chips: ctx.j.state.chips }),
  onPlay: (ctx) => { if (ctx.played.length === 4) { ctx.j.state.chips += 4; return { msg: 'Upgrade!' }; } } });

J({ key: 'swashbuckler', name: 'Swashbuckler', rarity: 1, cost: 4,
  text: () => 'Adds the sell value of your other Jokers to Mult',
  ind: (ctx) => ({ mult: ctx.G.jokers.filter((x) => x !== ctx.j).reduce((s, x) => s + sellValue(x.cost), 0) }) });

J({ key: 'eight_ball', name: 'Eight Ball', rarity: 1, cost: 5,
  text: () => '1 in 4 chance to create a Tarot card for each scored 8',
  scored: (ctx, c) => (!isStone(c) && c.rank === 8 && ctx.rng.chance(1, 4) ? { createTarot: 1, msg: 'Tarot!' } : null) });

J({ key: 'juggler', name: 'Juggler', rarity: 1, cost: 4,
  text: () => '+1 card in your hand size', passive: { handSize: 1 } });

J({ key: 'drunkard', name: 'The Drunkard', rarity: 1, cost: 4,
  text: () => '+1 discard each round', passive: { discards: 1 } });

J({ key: 'greed_shrine', name: 'Greed Shrine', rarity: 1, cost: 5,
  text: () => 'Earn $1 for each scored ♦',
  scored: (ctx, c) => (hasSuit(c, 'D') ? { money: 1 } : null) });

// -------------------------------------------------------------- Uncommon ----

J({ key: 'stencil', name: 'Joker Stencil', rarity: 2, cost: 8,
  text: (j, G) => `x${G ? emptySlots(G) + 1 : 1} Mult — x1 for every empty Joker slot`,
  ind: (ctx) => ({ xmult: 1 + emptySlots(ctx.G) }) });

J({ key: 'four_fingers', name: 'Four Fingers', rarity: 2, cost: 7,
  text: () => 'Flushes and Straights can be made with 4 cards',
  rules: { fourFingers: true } });

J({ key: 'shortcut', name: 'Shortcut', rarity: 2, cost: 7,
  text: () => 'Straights can be made with gaps of one rank',
  rules: { shortcut: true } });

J({ key: 'smeared', name: 'Smeared Joker', rarity: 2, cost: 7,
  text: () => '♥ and ♦ count as the same suit, as do ♠ and ♣',
  rules: { smeared: true } });

J({ key: 'mime', name: 'The Mime', rarity: 2, cost: 5,
  text: () => 'Retriggers every card held in hand',
  retriggerHeld: () => 1 });

J({ key: 'dusk', name: 'Dusk', rarity: 2, cost: 5,
  text: () => 'Retriggers all scored cards on the final hand of the round',
  retrigger: (ctx) => (ctx.G.hands === 0 ? 1 : 0) });

J({ key: 'sock_buskin', name: 'Sock and Buskin', rarity: 2, cost: 6,
  text: () => 'Retriggers every scored face card',
  retrigger: (ctx, c) => (isFace(c) ? 1 : 0) });

J({ key: 'hanging_chad', name: 'Hanging Chad', rarity: 2, cost: 4,
  text: () => 'Retriggers the first scored card twice',
  retrigger: (ctx, c) => (ctx.scoring[0] && ctx.scoring[0].id === c.id ? 2 : 0) });

J({ key: 'fortune_teller', name: 'Fortune Teller', rarity: 2, cost: 6,
  text: (j, G) => `+1 Mult per Tarot used this run (currently +${G ? G.stats.tarotsUsed : 0})`,
  ind: (ctx) => ({ mult: ctx.G.stats.tarotsUsed }) });

J({ key: 'steel_joker', name: 'Steel Joker', rarity: 2, cost: 7,
  text: () => 'x0.2 Mult for each Steel card in your full deck',
  ind: (ctx) => {
    const n = ctx.G.deck.filter((c) => c.enhancement === 'steel').length;
    return n ? { xmult: 1 + 0.2 * n } : null;
  } });

J({ key: 'hologram', name: 'Hologram', rarity: 2, cost: 7,
  text: (j) => `x${(1 + 0.25 * (j.state.n || 0)).toFixed(2)} Mult, +x0.25 per card added to your deck`,
  init: (j) => { j.state.n = 0; },
  ind: (ctx) => ({ xmult: 1 + 0.25 * ctx.j.state.n }),
  onCardAdded: (ctx) => { ctx.j.state.n++; return { msg: 'Upgrade!' }; } });

J({ key: 'vampire', name: 'Vampire', rarity: 2, cost: 7,
  text: (j) => `x${(1 + 0.1 * (j.state.n || 0)).toFixed(1)} Mult, +x0.1 per scored Enhanced card (removes the enhancement)`,
  init: (j) => { j.state.n = 0; },
  ind: (ctx) => ({ xmult: 1 + 0.1 * ctx.j.state.n }),
  onPlay: (ctx) => {
    let got = 0;
    for (const c of ctx.scoring) if (c.enhancement) { c.enhancement = null; got++; }
    if (got) { ctx.j.state.n += got; return { msg: 'Drained!' }; }
  } });

J({ key: 'card_sharp', name: 'Card Sharp', rarity: 2, cost: 6,
  text: () => 'x3 Mult if this hand type was already played this round',
  ind: (ctx) => (ctx.G.roundHands.filter((k) => k === ctx.handKey).length > 1 ? { xmult: 3 } : null) });

J({ key: 'ramen', name: 'Ramen', rarity: 2, cost: 6,
  text: (j) => `x${(j.state.x ?? 2).toFixed(2)} Mult, -x0.01 per card discarded`,
  init: (j) => { j.state.x = 2; },
  ind: (ctx) => ({ xmult: ctx.j.state.x }),
  onDiscard: (ctx, cards) => {
    ctx.j.state.x = Math.round((ctx.j.state.x - 0.01 * cards.length) * 100) / 100;
    if (ctx.j.state.x <= 1) return { destroySelf: true, msg: 'Slurped!' };
  } });

J({ key: 'constellation', name: 'Constellation', rarity: 2, cost: 6,
  text: (j) => `x${(1 + 0.1 * (j.state.n || 0)).toFixed(1)} Mult, +x0.1 per Planet card used`,
  init: (j) => { j.state.n = 0; },
  ind: (ctx) => ({ xmult: 1 + 0.1 * ctx.j.state.n }),
  onPlanetUsed: (ctx) => { ctx.j.state.n++; return { msg: 'Upgrade!' }; } });

J({ key: 'green_joker', name: 'Green Joker', rarity: 2, cost: 4,
  text: (j) => `+${j.state.mult || 0} Mult. +1 per hand played, -1 per discard`,
  init: (j) => { j.state.mult = 0; },
  ind: (ctx) => ({ mult: ctx.j.state.mult }),
  onPlay: (ctx) => { ctx.j.state.mult++; },
  onDiscard: (ctx) => { ctx.j.state.mult = Math.max(0, ctx.j.state.mult - 1); } });

J({ key: 'rocket', name: 'Rocket', rarity: 2, cost: 6,
  text: (j) => `Earn $${j.state.rate} at end of round. +$2 per Boss Blind defeated`,
  init: (j) => { j.state.rate = 1; },
  onRoundEnd: (ctx) => {
    const out = { money: ctx.j.state.rate };
    if (ctx.G.blindIndex === 2) ctx.j.state.rate += 2;
    return out;
  } });

J({ key: 'cloud_nine', name: 'Cloud Nine', rarity: 2, cost: 7,
  text: () => 'Earn $1 for each 9 in your full deck at end of round',
  onRoundEnd: (ctx) => ({ money: ctx.G.deck.filter((c) => !isStone(c) && c.rank === 9).length }) });

J({ key: 'to_the_moon', name: 'To the Moon', rarity: 2, cost: 5,
  text: () => 'Earn an extra $1 of interest for every $5 you hold',
  passive: { extraInterest: 1 } });

J({ key: 'nest_egg', name: 'Nest Egg', rarity: 2, cost: 4,
  text: (j) => `Gains $3 of sell value at end of round (worth $${sellValue(j.cost)})`,
  onRoundEnd: (ctx) => { ctx.j.cost += 6; return { msg: '+$3 value' }; } });

J({ key: 'rough_gem', name: 'Rough Gem', rarity: 2, cost: 7,
  text: () => 'Each scored ♦ earns $1',
  scored: (ctx, c) => (hasSuit(c, 'D') ? { money: 1 } : null) });

J({ key: 'bloodstone', name: 'Bloodstone', rarity: 2, cost: 7,
  text: () => 'Each scored ♥ has a 1 in 2 chance for x1.5 Mult',
  scored: (ctx, c) => (hasSuit(c, 'H') && ctx.rng.chance(1, 2) ? { xmult: 1.5 } : null) });

J({ key: 'arrowhead', name: 'Arrowhead', rarity: 2, cost: 7,
  text: () => 'Each scored ♠ gives +50 chips',
  scored: (ctx, c) => (hasSuit(c, 'S') ? { chips: 50 } : null) });

J({ key: 'onyx_agate', name: 'Onyx Agate', rarity: 2, cost: 7,
  text: () => 'Each scored ♣ gives +7 Mult',
  scored: (ctx, c) => (hasSuit(c, 'C') ? { mult: 7 } : null) });

J({ key: 'midas', name: 'Midas Mask', rarity: 2, cost: 7,
  text: () => 'Every played face card becomes a Gold card when scored',
  onPlay: (ctx) => {
    let n = 0;
    for (const c of ctx.scoring) if (isFace(c)) { c.enhancement = 'gold'; n++; }
    if (n) return { msg: 'Gilded!' };
  } });

J({ key: 'photograph', name: 'Photograph', rarity: 2, cost: 5,
  text: () => 'The first scored face card gives x2 Mult',
  scored: (ctx, c) => {
    const first = ctx.scoring.find(isFace);
    return first && first.id === c.id ? { xmult: 2 } : null;
  } });

J({ key: 'baron', name: 'The Baron', rarity: 2, cost: 8,
  text: () => 'Each King held in hand gives x1.5 Mult',
  held: (ctx, c) => (!isStone(c) && c.rank === 13 ? { xmult: 1.5 } : null) });

J({ key: 'shoot_moon', name: 'Shoot the Moon', rarity: 2, cost: 5,
  text: () => 'Each Queen held in hand gives +13 Mult',
  held: (ctx, c) => (!isStone(c) && c.rank === 12 ? { mult: 13 } : null) });

J({ key: 'valet', name: 'The Valet', rarity: 2, cost: 6,
  text: () => 'Each face card held in hand has a 1 in 2 chance to earn $1',
  held: (ctx, c) => (isFace(c) && ctx.rng.chance(1, 2) ? { money: 1 } : null) });

J({ key: 'rebate', name: 'Mail-In Rebate', rarity: 2, cost: 4,
  text: (j) => `Earn $3 per discarded ${RANK_LABEL[j.state.rank] || '?'}. Rank changes each round`,
  init: (j) => { j.state.rank = 2; },
  onBlindStart: (ctx) => { ctx.j.state.rank = ctx.rng.pick(RANKS); },
  onDiscard: (ctx, cards) => {
    const n = cards.filter((c) => !isStone(c) && c.rank === ctx.j.state.rank).length;
    return n ? { money: 3 * n } : null;
  } });

J({ key: 'castle', name: 'The Castle', rarity: 2, cost: 6,
  text: (j) => `+${j.state.chips || 0} chips. Gains +3 chips per discarded ${SUITS[j.state.suit || 'S'].pip}. Suit changes each round`,
  init: (j) => { j.state.chips = 0; j.state.suit = 'S'; },
  onBlindStart: (ctx) => { ctx.j.state.suit = ctx.rng.pick(SUIT_KEYS); },
  ind: (ctx) => ({ chips: ctx.j.state.chips }),
  onDiscard: (ctx, cards) => {
    const n = cards.filter((c) => hasSuit(c, ctx.j.state.suit)).length;
    if (n) { ctx.j.state.chips += 3 * n; return { msg: 'Upgrade!' }; }
  } });

J({ key: 'astronomer', name: 'Astronomer', rarity: 2, cost: 5,
  text: () => '1 in 4 chance to level up the played hand',
  onPlay: (ctx) => (ctx.rng.chance(1, 4) ? { levelUpHand: 1, msg: 'Level up!' } : null) });

J({ key: 'burglar', name: 'Burglar', rarity: 2, cost: 6,
  text: () => '+3 Hands when a Blind is selected, but you lose all discards',
  onBlindStart: (ctx) => { ctx.G.hands += 3; ctx.G.discards = 0; } });

J({ key: 'troubadour', name: 'Troubadour', rarity: 2, cost: 6,
  text: () => '+2 hand size, -1 hand each round', passive: { handSize: 2, hands: -1 } });

J({ key: 'merry_andy', name: 'Merry Andy', rarity: 2, cost: 7,
  text: () => '+3 discards, -1 hand size', passive: { discards: 3, handSize: -1 } });

J({ key: 'stone_joker', name: 'Stone Joker', rarity: 2, cost: 6,
  text: () => '+25 chips per Stone card in your full deck',
  ind: (ctx) => ({ chips: 25 * ctx.G.deck.filter(isStone).length }) });

J({ key: 'wee', name: 'Wee Joker', rarity: 2, cost: 8,
  text: (j) => `+${j.state.chips || 0} chips. Gains +8 chips per scored 2`,
  init: (j) => { j.state.chips = 0; },
  ind: (ctx) => ({ chips: ctx.j.state.chips }),
  scored: (ctx, c) => { if (!isStone(c) && c.rank === 2) { ctx.j.state.chips += 8; return { msg: 'Upgrade!' }; } } });

J({ key: 'splash', name: 'Splash', rarity: 2, cost: 3,
  text: () => 'Every played card counts toward scoring',
  rules: { splash: true } });

J({ key: 'sixth_sense', name: 'Sixth Sense', rarity: 2, cost: 6,
  text: () => 'x1.5 Mult if your played hand has no face cards',
  ind: (ctx) => (ctx.played.some(isFace) ? null : { xmult: 1.5 }) });

// ------------------------------------------------------------------ Rare ----

J({ key: 'blueprint', name: 'Blueprint', rarity: 3, cost: 10,
  text: () => 'Copies the ability of the Joker to its right',
  copyOf: 'right' });

J({ key: 'brainstorm', name: 'Brainstorm', rarity: 3, cost: 10,
  text: () => 'Copies the ability of your leftmost Joker',
  copyOf: 'left' });

J({ key: 'duo', name: 'The Duo', rarity: 3, cost: 8,
  text: () => 'x2 Mult if the hand contains a Pair',
  ind: (ctx) => (ctx.contains('pair') ? { xmult: 2 } : null) });

J({ key: 'trio', name: 'The Trio', rarity: 3, cost: 8,
  text: () => 'x3 Mult if the hand contains Three of a Kind',
  ind: (ctx) => (ctx.contains('three') ? { xmult: 3 } : null) });

J({ key: 'family', name: 'The Family', rarity: 3, cost: 8,
  text: () => 'x4 Mult if the hand contains Four of a Kind',
  ind: (ctx) => (ctx.contains('four') ? { xmult: 4 } : null) });

J({ key: 'order', name: 'The Order', rarity: 3, cost: 8,
  text: () => 'x3 Mult if the hand contains a Straight',
  ind: (ctx) => (ctx.contains('straight') ? { xmult: 3 } : null) });

J({ key: 'tribe', name: 'The Tribe', rarity: 3, cost: 8,
  text: () => 'x2 Mult if the hand contains a Flush',
  ind: (ctx) => (ctx.contains('flush') ? { xmult: 2 } : null) });

J({ key: 'flower_pot', name: 'Flower Pot', rarity: 3, cost: 6,
  text: () => 'x3 Mult if the scored hand contains all four suits',
  ind: (ctx) => (SUIT_KEYS.every((s) => suitCount(ctx.scoring, s) > 0) ? { xmult: 3 } : null) });

J({ key: 'glass_joker', name: 'Glass Joker', rarity: 3, cost: 6,
  text: (j) => `x${(1 + 0.75 * (j.state.n || 0)).toFixed(2)} Mult, +x0.75 per Glass card destroyed`,
  init: (j) => { j.state.n = 0; },
  ind: (ctx) => ({ xmult: 1 + 0.75 * ctx.j.state.n }),
  onDestroy: (ctx, card) => { if (card.enhancement === 'glass') { ctx.j.state.n++; return { msg: 'Upgrade!' }; } } });

J({ key: 'obelisk', name: 'Obelisk', rarity: 3, cost: 8,
  text: (j) => `x${(1 + 0.2 * (j.state.n || 0)).toFixed(1)} Mult, +x0.2 per consecutive hand that is not your most-played hand`,
  init: (j) => { j.state.n = 0; },
  ind: (ctx) => ({ xmult: 1 + 0.2 * ctx.j.state.n }),
  onPlay: (ctx) => {
    const levels = ctx.G.handLevels;
    let top = null, best = -1;
    for (const [k, v] of Object.entries(levels)) if (v.plays > best) { best = v.plays; top = k; }
    if (ctx.handKey === top && best > 0) { ctx.j.state.n = 0; return { msg: 'Reset!' }; }
    ctx.j.state.n++;
    return { msg: 'Upgrade!' };
  } });

J({ key: 'baseball', name: 'Baseball Card', rarity: 3, cost: 8,
  text: () => 'Each Uncommon Joker you own gives x1.5 Mult',
  ind: (ctx) => {
    const n = ctx.G.jokers.filter((x) => JOKER_BY_KEY[x.key]?.rarity === 2).length;
    return n ? { xmult: Math.pow(1.5, n) } : null;
  } });

J({ key: 'dna', name: 'DNA', rarity: 3, cost: 8,
  text: () => 'If the first hand of a round is a single card, copy it into your deck and hand',
  onPlay: (ctx) => {
    if (ctx.G.roundHands.length === 1 && ctx.played.length === 1) return { cloneCard: ctx.played[0], msg: 'Copied!' };
  } });

J({ key: 'campfire', name: 'Campfire', rarity: 3, cost: 9,
  text: (j) => `x${(1 + 0.25 * (j.state.n || 0)).toFixed(2)} Mult, +x0.25 per card sold. Resets on Boss defeat`,
  init: (j) => { j.state.n = 0; },
  ind: (ctx) => ({ xmult: 1 + 0.25 * ctx.j.state.n }),
  onSellOther: (ctx) => { ctx.j.state.n++; return { msg: 'Upgrade!' }; },
  onRoundEnd: (ctx) => { if (ctx.G.blindIndex === 2) ctx.j.state.n = 0; } });

J({ key: 'invisible', name: 'Invisible Joker', rarity: 3, cost: 8,
  text: (j) => `After 2 rounds, sell this to duplicate a random Joker (${j.state.rounds || 0}/2)`,
  init: (j) => { j.state.rounds = 0; },
  onRoundEnd: (ctx) => { ctx.j.state.rounds = Math.min(2, ctx.j.state.rounds + 1); },
  onSellSelf: (ctx) => (ctx.j.state.rounds >= 2 ? { duplicateJoker: true } : null) });

// ------------------------------------------------------------- Legendary ----

J({ key: 'ringmaster', name: 'The Ringmaster', rarity: 4, cost: 20, legendary: true,
  text: () => 'Every Boss Blind ability is disabled',
  rules: { noBoss: true } });

J({ key: 'sovereign', name: 'The Sovereign', rarity: 4, cost: 20, legendary: true,
  text: () => 'Played Kings and Queens each give x2 Mult',
  scored: (ctx, c) => (!isStone(c) && (c.rank === 13 || c.rank === 12) ? { xmult: 2 } : null) });

J({ key: 'gravekeeper', name: 'The Gravekeeper', rarity: 4, cost: 20, legendary: true,
  text: (j) => `x${(1 + (j.state.n || 0)).toFixed(0)} Mult, +x1 for every 23 cards discarded`,
  init: (j) => { j.state.n = 0; j.state.count = 0; },
  ind: (ctx) => ({ xmult: 1 + ctx.j.state.n }),
  onDiscard: (ctx, cards) => {
    ctx.j.state.count += cards.length;
    while (ctx.j.state.count >= 23) { ctx.j.state.count -= 23; ctx.j.state.n++; }
  } });

J({ key: 'ghostlight', name: 'Ghostlight', rarity: 4, cost: 20, legendary: true,
  text: (j) => `x${(1 + (j.state.n || 0)).toFixed(0)} Mult, +x1 each time a face card is destroyed`,
  init: (j) => { j.state.n = 0; },
  ind: (ctx) => ({ xmult: 1 + ctx.j.state.n }),
  onDestroy: (ctx, card) => { if (isFace(card)) { ctx.j.state.n++; return { msg: 'Upgrade!' }; } } });

J({ key: 'oracle', name: 'The Oracle', rarity: 4, cost: 20, legendary: true,
  text: () => 'Creates a Negative copy of a consumable when you leave the shop',
  onShopExit: () => ({ negativeCopy: true }) });

export const JOKER_BY_KEY = Object.fromEntries(JOKERS.map((j) => [j.key, j]));

/** Instantiate a joker for the run. */
export function makeJoker(key, edition = null) {
  const def = JOKER_BY_KEY[key];
  if (!def) throw new Error('unknown joker: ' + key);
  const j = { id: uid('j'), key, cost: def.cost, edition, state: {} };
  def.init?.(j);
  return j;
}

export function jokerText(j, G) {
  const def = JOKER_BY_KEY[j.key];
  return typeof def.text === 'function' ? def.text(j, G) : def.text;
}

/**
 * Blueprint-style jokers borrow the hooks *and* the counter state of their
 * target, so resolution returns both the definition and the instance to read.
 */
export function resolve(G, j, depth = 0) {
  const def = JOKER_BY_KEY[j.key];
  if (!def?.copyOf || depth > 5) return { def, host: j };
  const list = G.jokers;
  const idx = list.indexOf(j);
  const target = def.copyOf === 'right' ? list[idx + 1] : list.find((x) => x !== j);
  if (!target) return { def: {}, host: j };
  return resolve(G, target, depth + 1);
}

/** Pool of jokers the shop is allowed to offer. */
export function shopPool(excludeKeys = new Set()) {
  return JOKERS.filter((d) => !d.noShop && !d.legendary && !excludeKeys.has(d.key));
}

export const RARITY_WEIGHT = { 1: 70, 2: 25, 3: 5, 4: 0 };
