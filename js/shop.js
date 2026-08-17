// Shop stock, booster packs and vouchers.

import { JOKERS, JOKER_BY_KEY, makeJoker, RARITY_WEIGHT, shopPool } from './jokers.js';
import { CONSUMABLE_BY_KEY, TAROT_KEYS, PLANET_KEYS, SPECTRAL_KEYS, makeConsumable } from './consumables.js';
import { makeCard, RANKS, SUIT_KEYS } from './cards.js';
import { uid } from './util.js';

// -------------------------------------------------------------- Vouchers ----
// `effect` is folded into the derived-stats pass in game.js; nothing here
// mutates state directly, so vouchers stay order-independent.

export const VOUCHERS = [
  { key: 'overstock', name: 'Overstock', cost: 10, desc: '+1 card slot available in the shop' },
  { key: 'overstock_plus', name: 'Overstock Plus', cost: 10, needs: 'overstock', desc: '+1 more card slot available in the shop' },
  { key: 'clearance', name: 'Clearance Sale', cost: 10, desc: 'All items in the shop are 25% off' },
  { key: 'liquidation', name: 'Liquidation', cost: 10, needs: 'clearance', desc: 'All items in the shop are 50% off' },
  { key: 'hone', name: 'Hone', cost: 10, desc: 'Foil, Holographic and Polychrome cards appear twice as often' },
  { key: 'glow_up', name: 'Glow Up', cost: 20, needs: 'hone', desc: 'Foil, Holographic and Polychrome cards appear four times as often' },
  { key: 'reroll_surplus', name: 'Reroll Surplus', cost: 10, desc: 'Rerolls cost $2 less' },
  { key: 'reroll_glut', name: 'Reroll Glut', cost: 10, needs: 'reroll_surplus', desc: 'Rerolls cost another $2 less' },
  { key: 'crystal_ball', name: 'Crystal Ball', cost: 10, desc: '+1 consumable slot' },
  { key: 'omen_globe', name: 'Omen Globe', cost: 15, needs: 'crystal_ball', desc: 'Spectral cards may appear in Arcana Packs' },
  { key: 'telescope', name: 'Telescope', cost: 10, desc: 'Celestial Packs always contain the Planet for your most played hand' },
  { key: 'observatory', name: 'Observatory', cost: 20, needs: 'telescope', desc: 'Planet cards in your consumable slots give x1.5 Mult for their hand' },
  { key: 'grabber', name: 'Grabber', cost: 10, desc: '+1 hand every round' },
  { key: 'nacho_tong', name: 'Nacho Tong', cost: 10, needs: 'grabber', desc: '+1 more hand every round' },
  { key: 'wasteful', name: 'Wasteful', cost: 10, desc: '+1 discard every round' },
  { key: 'recyclomancy', name: 'Recyclomancy', cost: 10, needs: 'wasteful', desc: '+1 more discard every round' },
  { key: 'tarot_merchant', name: 'Tarot Merchant', cost: 10, desc: 'Tarot cards appear twice as often in the shop' },
  { key: 'tarot_tycoon', name: 'Tarot Tycoon', cost: 20, needs: 'tarot_merchant', desc: 'Tarot cards appear four times as often in the shop' },
  { key: 'planet_merchant', name: 'Planet Merchant', cost: 10, desc: 'Planet cards appear twice as often in the shop' },
  { key: 'planet_tycoon', name: 'Planet Tycoon', cost: 20, needs: 'planet_merchant', desc: 'Planet cards appear four times as often in the shop' },
  { key: 'seed_money', name: 'Seed Money', cost: 10, desc: 'Raises the interest cap to $10 per round' },
  { key: 'money_tree', name: 'Money Tree', cost: 20, needs: 'seed_money', desc: 'Raises the interest cap to $20 per round' },
  { key: 'blank', name: 'Blank', cost: 10, desc: 'Does nothing at all' },
  { key: 'antimatter', name: 'Antimatter', cost: 20, needs: 'blank', desc: '+1 Joker slot' },
  { key: 'magic_trick', name: 'Magic Trick', cost: 10, desc: 'Playing cards can be bought from the shop' },
  { key: 'illusion', name: 'Illusion', cost: 20, needs: 'magic_trick', desc: 'Playing cards in the shop may have an enhancement, edition or seal' },
  { key: 'paint_brush', name: 'Paint Brush', cost: 10, desc: '+1 hand size' },
  { key: 'palette', name: 'Palette', cost: 20, needs: 'paint_brush', desc: '+1 more hand size' },
  { key: 'directors_cut', name: "Director's Cut", cost: 20, desc: 'Reroll the Boss Blind once per ante for $10' },
  { key: 'hieroglyph', name: 'Hieroglyph', cost: 20, desc: '-1 Ante, but -1 hand every round' },
  { key: 'petroglyph', name: 'Petroglyph', cost: 20, needs: 'hieroglyph', desc: '-1 Ante, but -1 discard every round' },
];

export const VOUCHER_BY_KEY = Object.fromEntries(VOUCHERS.map((v) => [v.key, v]));

/** A voucher is offerable once its prerequisite is owned and it is not. */
export function availableVouchers(owned) {
  return VOUCHERS.filter((v) => !owned.has(v.key) && (!v.needs || owned.has(v.needs)));
}

// ----------------------------------------------------------------- Packs ----

export const PACKS = [
  { key: 'arcana', name: 'Arcana Pack', kind: 'tarot', cost: 4, size: 3, choose: 1, weight: 4 },
  { key: 'arcana_jumbo', name: 'Jumbo Arcana Pack', kind: 'tarot', cost: 6, size: 5, choose: 1, weight: 2 },
  { key: 'arcana_mega', name: 'Mega Arcana Pack', kind: 'tarot', cost: 8, size: 5, choose: 2, weight: 0.5 },
  { key: 'celestial', name: 'Celestial Pack', kind: 'planet', cost: 4, size: 3, choose: 1, weight: 4 },
  { key: 'celestial_jumbo', name: 'Jumbo Celestial Pack', kind: 'planet', cost: 6, size: 5, choose: 1, weight: 2 },
  { key: 'celestial_mega', name: 'Mega Celestial Pack', kind: 'planet', cost: 8, size: 5, choose: 2, weight: 0.5 },
  { key: 'standard', name: 'Standard Pack', kind: 'card', cost: 4, size: 3, choose: 1, weight: 4 },
  { key: 'standard_jumbo', name: 'Jumbo Standard Pack', kind: 'card', cost: 6, size: 5, choose: 1, weight: 2 },
  { key: 'standard_mega', name: 'Mega Standard Pack', kind: 'card', cost: 8, size: 5, choose: 2, weight: 0.5 },
  { key: 'buffoon', name: 'Buffoon Pack', kind: 'joker', cost: 4, size: 2, choose: 1, weight: 1.2 },
  { key: 'buffoon_jumbo', name: 'Jumbo Buffoon Pack', kind: 'joker', cost: 6, size: 4, choose: 1, weight: 0.6 },
  { key: 'buffoon_mega', name: 'Mega Buffoon Pack', kind: 'joker', cost: 8, size: 4, choose: 2, weight: 0.3 },
  { key: 'spectral', name: 'Spectral Pack', kind: 'spectral', cost: 4, size: 2, choose: 1, weight: 0.6 },
  { key: 'spectral_jumbo', name: 'Jumbo Spectral Pack', kind: 'spectral', cost: 6, size: 4, choose: 1, weight: 0.3 },
  { key: 'spectral_mega', name: 'Mega Spectral Pack', kind: 'spectral', cost: 8, size: 4, choose: 2, weight: 0.15 },
];

export const PACK_BY_KEY = Object.fromEntries(PACKS.map((p) => [p.key, p]));

// -------------------------------------------------------------- Building ----

function editionRoll(rng, honeLevel) {
  // Base odds are deliberately stingy; Hone / Glow Up multiply them.
  const scale = honeLevel;
  const r = rng.float();
  if (r < 0.003 * scale) return 'poly';
  if (r < 0.003 * scale + 0.014 * scale) return 'holo';
  if (r < 0.003 * scale + 0.014 * scale + 0.02 * scale) return 'foil';
  return null;
}

export function rollJoker(rng, G, { forceRarity = null, allowEdition = true } = {}) {
  const owned = new Set(G.jokers.map((j) => j.key));
  let pool = shopPool(owned);
  if (forceRarity === 4) pool = JOKERS.filter((d) => d.legendary);
  else if (forceRarity) pool = pool.filter((d) => d.rarity === forceRarity);
  if (!pool.length) pool = shopPool(new Set());

  const def = forceRarity
    ? rng.pick(pool)
    : rng.weighted(pool, (d) => RARITY_WEIGHT[d.rarity] ?? 0);

  const edition = allowEdition ? editionRoll(rng, G.derived.honeLevel) : null;
  return makeJoker(def.key, edition);
}

export function rollConsumable(rng, G, type) {
  const keys = type === 'planet' ? PLANET_KEYS : type === 'spectral' ? SPECTRAL_KEYS : TAROT_KEYS;
  return makeConsumable(rng.pick(keys));
}

export function rollPlayingCard(rng, G, { fancy = false } = {}) {
  const c = makeCard(rng.pick(RANKS), rng.pick(SUIT_KEYS));
  if (fancy) {
    if (rng.chance(2, 5)) c.enhancement = rng.pick(['bonus', 'mult', 'wild', 'glass', 'steel', 'gold', 'lucky']);
    const ed = editionRoll(rng, Math.max(2, G.derived.honeLevel));
    if (ed) c.edition = ed;
    if (rng.chance(1, 10)) c.seal = rng.pick(['gold', 'red', 'blue', 'purple']);
  }
  return c;
}

/** One purchasable slot in the shop's top row. */
function rollShopItem(rng, G) {
  const d = G.derived;
  const options = [
    { kind: 'joker', w: 20 },
    { kind: 'tarot', w: 4 * d.tarotRate },
    { kind: 'planet', w: 4 * d.planetRate },
    { kind: 'card', w: d.shopCards ? 4 : 0 },
    { kind: 'spectral', w: 0.6 },
  ].filter((o) => o.w > 0);

  const kind = rng.weighted(options, (o) => o.w).kind;
  if (kind === 'joker') {
    const j = rollJoker(rng, G);
    return { id: uid('s'), kind: 'joker', payload: j, cost: jokerPrice(j) };
  }
  if (kind === 'card') {
    const c = rollPlayingCard(rng, G, { fancy: G.vouchers.has('illusion') });
    return { id: uid('s'), kind: 'card', payload: c, cost: 3 };
  }
  const u = rollConsumable(rng, G, kind);
  return { id: uid('s'), kind: 'consumable', payload: u, cost: u.cost };
}

export function jokerPrice(j) {
  const def = JOKER_BY_KEY[j.key];
  let cost = def.cost;
  if (j.edition === 'foil') cost += 2;
  if (j.edition === 'holo') cost += 3;
  if (j.edition === 'poly') cost += 5;
  if (j.edition === 'negative') cost += 5;
  return cost;
}

/** Apply Clearance/Liquidation and the Coupon tag to a sticker price. */
export function discounted(G, cost) {
  if (G.shop?.coupon) return 0;
  let c = cost;
  if (G.vouchers.has('liquidation')) c = Math.ceil(c * 0.5);
  else if (G.vouchers.has('clearance')) c = Math.ceil(c * 0.75);
  return Math.max(0, c);
}

export function rerollCost(G) {
  if (G.shop?.freeRerolls) return 0;
  const base = 5 + (G.shop?.rerolls ?? 0);
  let discount = 0;
  if (G.vouchers.has('reroll_surplus')) discount += 2;
  if (G.vouchers.has('reroll_glut')) discount += 2;
  return Math.max(0, base - discount);
}

export function buildShop(rng, G, { keepVoucher = null } = {}) {
  const slots = G.derived.shopSlots;
  const items = [];
  for (let i = 0; i < slots; i++) items.push(rollShopItem(rng, G));

  const packs = [];
  for (let i = 0; i < 2; i++) {
    const def = rng.weighted(PACKS, (p) => p.weight);
    packs.push({ id: uid('p'), packKey: def.key, cost: def.cost });
  }

  // One voucher per ante; extra ones only come from the Voucher tag.
  let vouchers = keepVoucher ? [keepVoucher] : [];
  if (!vouchers.length) {
    const avail = availableVouchers(G.vouchers);
    if (avail.length) vouchers = [{ id: uid('v'), key: rng.pick(avail).key }];
  }

  return { items, packs, vouchers, rerolls: 0, coupon: false, freeRerolls: false, freebies: [] };
}

/** Contents of an opened booster pack. */
export function openPack(rng, G, packKey) {
  const def = PACK_BY_KEY[packKey];
  const out = [];
  for (let i = 0; i < def.size; i++) {
    if (def.kind === 'joker') out.push({ id: uid('o'), kind: 'joker', payload: rollJoker(rng, G) });
    else if (def.kind === 'card') out.push({ id: uid('o'), kind: 'card', payload: rollPlayingCard(rng, G, { fancy: true }) });
    else if (def.kind === 'tarot') {
      const spectral = G.vouchers.has('omen_globe') && rng.chance(1, 8);
      out.push({ id: uid('o'), kind: 'consumable', payload: rollConsumable(rng, G, spectral ? 'spectral' : 'tarot') });
    } else if (def.kind === 'planet') {
      out.push({ id: uid('o'), kind: 'consumable', payload: rollConsumable(rng, G, 'planet') });
    } else {
      // Spectral packs carry a small chance of the two treasure cards.
      const key = rng.chance(1, 40) ? rng.pick(['soul', 'black_hole']) : rng.pick(SPECTRAL_KEYS);
      out.push({ id: uid('o'), kind: 'consumable', payload: makeConsumable(key) });
    }
  }

  // Telescope guarantees the Planet for whichever hand you play the most.
  if (def.kind === 'planet' && G.vouchers.has('telescope')) {
    let bestKey = 'high_card', best = -1;
    for (const [k, v] of Object.entries(G.handLevels)) if (v.plays > best) { best = v.plays; bestKey = k; }
    const wanted = PLANET_KEYS.find((pk) => CONSUMABLE_BY_KEY[pk].hand === bestKey);
    if (wanted && !out.some((o) => o.payload.key === wanted)) {
      out[0] = { id: uid('o'), kind: 'consumable', payload: makeConsumable(wanted) };
    }
  }

  return { packKey, choose: def.choose, picked: 0, options: out };
}
