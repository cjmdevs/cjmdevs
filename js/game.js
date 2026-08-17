// Run state, the scoring pipeline and every rules transition.
//
// The scoring pipeline is written as a pure-ish producer: it mutates run state
// (jokers gain counters, glass shatters) but also emits an ordered `events`
// list so the UI can replay the whole calculation one beat at a time.

import { makeRng, seedFromString, randomSeedString, clamp, uid } from './util.js';
import { standardDeck, baseChips, sellValue, byRank, SUIT_KEYS } from './cards.js';
import { evaluate, contains, handStats, freshHandLevels, HAND_BY_KEY } from './poker.js';
import { JOKER_BY_KEY, makeJoker, resolve as resolveJoker } from './jokers.js';
import {
  CONSUMABLE_BY_KEY, makeConsumable, randomEnhancedCard, NEEDS_HAND,
  TAROT_KEYS, PLANET_KEYS, SPECTRAL_KEYS,
} from './consumables.js';
import { BLIND_SLOTS, BOSS_BY_KEY, pickBoss, blindTarget, pickTag } from './blinds.js';
import {
  buildShop, openPack as rollPack, rollJoker, discounted, rerollCost,
  VOUCHER_BY_KEY, availableVouchers,
} from './shop.js';
import { DECK_BY_KEY } from './decks.js';

export const SAVE_VERSION = 3;
const BASE_HANDS = 4;
const BASE_DISCARDS = 3;
const BASE_HAND_SIZE = 8;
const BASE_JOKER_SLOTS = 5;
const BASE_CONSUMABLE_SLOTS = 2;
export const WIN_ANTE = 8;

// ------------------------------------------------------------- Run setup ----

export function newRun({ seed = randomSeedString(), deckKey = 'standard' } = {}) {
  const rng = makeRng(seedFromString(seed));
  const deckDef = DECK_BY_KEY[deckKey] ?? DECK_BY_KEY.standard;
  const mods = deckDef.mods ?? {};

  const G = {
    version: SAVE_VERSION,
    seed,
    rngState: 0,
    deckKey,
    mods,

    ante: 1,
    blindIndex: 0,
    round: 0,
    phase: 'blind_select',

    money: 4 + (mods.money ?? 0),
    deck: (deckDef.build ? deckDef.build(rng) : standardDeck()),
    drawPile: [],
    hand: [],
    discardPile: [],
    playedZone: [],

    jokers: [],
    consumables: (mods.consumables ?? []).map((k) => makeConsumable(k)),
    vouchers: new Set(mods.vouchers ?? []),
    tags: [],

    handLevels: freshHandLevels(),
    selected: [],

    hands: 0,
    discards: 0,
    score: 0,
    target: 0,

    bossKey: null,
    bossesSeen: new Set(),
    bossRerolled: false,
    upcomingTags: [],

    handSizeMod: 0,
    roundHands: [],
    playedThisRound: new Set(),
    faceDown: false,
    forcedCardId: null,
    disabledJokerId: null,

    shop: null,
    pack: null,
    cashout: null,

    stats: {
      handsPlayed: 0, discardsUsed: 0, tarotsUsed: 0, planetsUsed: 0,
      cardsDiscarded: 0, bestHandScore: 0, bestHandName: '—',
      jokersOwned: 0, lastConsumable: null, mostPlayed: 'high_card',
    },
    log: [],
  };

  G.rngState = rng.state;
  recompute(G);
  rollUpcomingTags(G, rng);
  G.rngState = rng.state;
  return G;
}

/** The RNG state is stored as a plain integer so runs survive a reload intact. */
function withRng(G, fn) {
  const rng = makeRng(0);
  rng.state = G.rngState;
  const out = fn(rng);
  G.rngState = rng.state;
  return out;
}

// --------------------------------------------------------- Derived stats ----

/** Recomputed after every mutation; nothing else reads raw modifiers. */
export function recompute(G) {
  const v = G.vouchers;
  const mods = G.mods ?? {};
  const boss = activeBoss(G);
  const bflags = boss?.flags ?? {};

  let handSize = BASE_HAND_SIZE + G.handSizeMod + (mods.handSize ?? 0);
  let hands = BASE_HANDS + (mods.hands ?? 0);
  let discards = BASE_DISCARDS + (mods.discards ?? 0);
  let jokerSlots = BASE_JOKER_SLOTS + (mods.jokerSlots ?? 0);
  let consumableSlots = BASE_CONSUMABLE_SLOTS + (mods.consumableSlots ?? 0);
  let extraInterest = 0;

  if (v.has('paint_brush')) handSize += 1;
  if (v.has('palette')) handSize += 1;
  if (v.has('grabber')) hands += 1;
  if (v.has('nacho_tong')) hands += 1;
  if (v.has('wasteful')) discards += 1;
  if (v.has('recyclomancy')) discards += 1;
  if (v.has('hieroglyph')) hands -= 1;
  if (v.has('petroglyph')) discards -= 1;
  if (v.has('antimatter')) jokerSlots += 1;
  if (v.has('crystal_ball')) consumableSlots += 1;

  for (const j of G.jokers) {
    const p = JOKER_BY_KEY[j.key]?.passive;
    if (!p) continue;
    handSize += p.handSize ?? 0;
    hands += p.hands ?? 0;
    discards += p.discards ?? 0;
    extraInterest += p.extraInterest ?? 0;
    consumableSlots += p.consumableSlots ?? 0;
  }
  // Negative jokers sit outside your slot limit.
  jokerSlots += G.jokers.filter((j) => j.edition === 'negative').length;

  if (bflags.handSize) handSize += bflags.handSize;
  if (G.juggleRounds > 0) handSize += 3;

  const honeLevel = v.has('glow_up') ? 4 : v.has('hone') ? 2 : 1;
  const interestCap = v.has('money_tree') ? 20 : v.has('seed_money') ? 10 : 5;

  G.derived = {
    handSize: Math.max(1, handSize),
    hands: Math.max(1, hands),
    discards: Math.max(0, discards),
    jokerSlots: Math.max(1, jokerSlots),
    consumableSlots: Math.max(0, consumableSlots),
    shopSlots: 2 + (v.has('overstock') ? 1 : 0) + (v.has('overstock_plus') ? 1 : 0),
    honeLevel,
    interestCap: mods.noInterest ? 0 : interestCap,
    extraInterest,
    tarotRate: v.has('tarot_tycoon') ? 4 : v.has('tarot_merchant') ? 2 : 1,
    planetRate: v.has('planet_tycoon') ? 4 : v.has('planet_merchant') ? 2 : 1,
    shopCards: v.has('magic_trick'),
  };
  return G.derived;
}

export function activeBoss(G) {
  if (G.blindIndex !== 2 || !G.bossKey) return null;
  if (G.jokers.some((j) => JOKER_BY_KEY[j.key]?.rules?.noBoss)) return null;
  return BOSS_BY_KEY[G.bossKey];
}

/** Union of every passive rule change granted by the player's jokers. */
export function activeRules(G) {
  const r = { fourFingers: false, shortcut: false, smeared: false, splash: false };
  for (const j of G.jokers) {
    const rules = JOKER_BY_KEY[j.key]?.rules;
    if (rules) Object.assign(r, rules);
  }
  return r;
}

export function currentTarget(G) {
  const base = blindTarget(G.ante, G.blindIndex, G.blindIndex === 2 ? G.bossKey : null);
  return Math.round(base * (G.mods?.blindMult ?? 1));
}

// ------------------------------------------------------------ Blind flow ----

function rollUpcomingTags(G, rng) {
  G.upcomingTags = [pickTag(rng), pickTag(rng)];
}

export function ensureBoss(G) {
  if (!G.bossKey) {
    withRng(G, (rng) => { G.bossKey = pickBoss(rng, G.ante, G.bossesSeen); });
  }
  return G.bossKey;
}

export function rerollBoss(G) {
  if (!G.vouchers.has('directors_cut') || G.bossRerolled || G.money < 10) return false;
  G.money -= 10;
  G.bossRerolled = true;
  withRng(G, (rng) => { G.bossKey = pickBoss(rng, G.ante, G.bossesSeen); });
  return true;
}

export function startBlind(G) {
  ensureBoss(G);
  const boss = activeBoss(G);
  const flags = boss?.flags ?? {};

  // Juggle tags are spent on the round they are carried into.
  const juggles = G.tags.filter((t) => t.key === 'juggle').length;
  if (juggles) {
    G.tags = G.tags.filter((t) => t.key !== 'juggle');
    G.juggleRounds = juggles;
  }

  recompute(G);
  G.phase = 'playing';
  G.round += 1;
  G.score = 0;
  G.target = currentTarget(G);
  G.hands = flags.handsOverride ?? G.derived.hands;
  G.discards = flags.discardsOverride ?? G.derived.discards;
  G.roundHands = [];
  G.playedThisRound = new Set();
  G.selected = [];
  G.playedZone = [];
  G.faceDown = !!flags.blindDraw;
  G.cashout = null;

  // Boss debuffs are stamped onto the cards themselves for the whole round.
  for (const c of G.deck) c.debuffed = boss?.debuff ? !!boss.debuff(c) : false;

  withRng(G, (rng) => {
    G.drawPile = rng.shuffle(G.deck.slice());
    G.discardPile = [];
    G.hand = [];
    fireJokers(G, 'onBlindStart', rng, {});
    drawUpTo(G, rng);
  });

  recompute(G);
  return G;
}

export function canSkipBlind(G) {
  return G.phase === 'blind_select' && BLIND_SLOTS[G.blindIndex].skippable;
}

export function skipBlind(G) {
  if (!canSkipBlind(G)) return null;
  const tagKey = G.upcomingTags[G.blindIndex];
  const result = grantTag(G, tagKey);
  G.stats.skips = (G.stats.skips ?? 0) + 1;
  G.blindIndex += 1;
  if (G.phase !== 'pack') G.phase = 'blind_select';
  return result;
}

function grantTag(G, tagKey) {
  const immediate = { charm: 'arcana_mega', meteor: 'celestial_mega', buffoon: 'buffoon_mega', ethereal: 'spectral', standard: 'standard_mega' };
  if (immediate[tagKey]) {
    withRng(G, (rng) => { G.pack = rollPack(rng, G, immediate[tagKey]); });
    G.pack.free = true;
    G.returnPhase = 'blind_select';
    G.phase = 'pack';
    return { tagKey, opened: true };
  }
  if (tagKey === 'handy') { G.money += G.stats.handsPlayed; return { tagKey, money: G.stats.handsPlayed }; }
  if (tagKey === 'garbage') {
    const n = Math.max(0, (G.stats.discardsAvailable ?? 0) - G.stats.discardsUsed);
    G.money += n;
    return { tagKey, money: n };
  }
  if (tagKey === 'economy') {
    const gain = Math.min(40, Math.max(0, G.money));
    G.money += gain;
    return { tagKey, money: gain };
  }
  G.tags.push({ id: uid('t'), key: tagKey });
  return { tagKey, held: true };
}

// ------------------------------------------------------------ Card flow -----

function drawUpTo(G, rng, limit = null) {
  const want = limit ?? G.derived.handSize;
  while (G.hand.length < want && G.drawPile.length) {
    const c = G.drawPile.pop();
    if (G.faceDown) c.faceDown = true;
    G.hand.push(c);
  }
  applyForcedCard(G, rng);
}

function applyForcedCard(G, rng) {
  const boss = activeBoss(G);
  if (!boss?.flags?.forceCard) { G.forcedCardId = null; return; }
  if (G.forcedCardId && G.hand.some((c) => c.id === G.forcedCardId)) return;
  G.forcedCardId = G.hand.length ? rng.pick(G.hand).id : null;
  if (G.forcedCardId && !G.selected.includes(G.forcedCardId)) G.selected.push(G.forcedCardId);
}

export function toggleSelect(G, cardId) {
  if (G.phase !== 'playing') return;
  if (cardId === G.forcedCardId) return;
  const i = G.selected.indexOf(cardId);
  if (i >= 0) G.selected.splice(i, 1);
  else if (G.selected.length < 5) G.selected.push(cardId);
}

export function selectedCards(G) {
  // Selection always scores in hand order, matching what the player sees.
  return G.hand.filter((c) => G.selected.includes(c.id));
}

export function sortHand(G, mode) {
  const cmp = mode === 'suit'
    ? (a, b) => SUIT_KEYS.indexOf(a.suit) - SUIT_KEYS.indexOf(b.suit) || b.rank - a.rank
    : byRank;
  G.hand.sort(cmp);
  G.sortMode = mode;
}

export function moveCard(G, cardId, toIndex) {
  const from = G.hand.findIndex((c) => c.id === cardId);
  if (from < 0) return;
  const [c] = G.hand.splice(from, 1);
  G.hand.splice(clamp(toIndex, 0, G.hand.length), 0, c);
}

// ----------------------------------------------------------- Play checks ----

export function playBlocker(G) {
  const n = G.selected.length;
  if (!n) return 'Select up to 5 cards';
  if (G.hands <= 0) return 'No hands left';
  const boss = activeBoss(G);
  const flags = boss?.flags ?? {};
  if (flags.mustPlay && n !== flags.mustPlay) return `${boss.name}: play exactly ${flags.mustPlay} cards`;

  const cards = selectedCards(G);
  const key = evaluate(cards, activeRules(G)).key;
  if (flags.noRepeatHand && G.roundHands.includes(key)) return `${boss.name}: hand type already played`;
  if (flags.singleHandType && G.roundHands.length && G.roundHands[0] !== key) return `${boss.name}: only ${HAND_BY_KEY[G.roundHands[0]].name}`;
  return null;
}

export function discardBlocker(G) {
  if (!G.selected.length) return 'Select cards to discard';
  if (G.discards <= 0) return 'No discards left';
  return null;
}

// -------------------------------------------------------------- Scoring -----

function jokerCtx(G, j, extra) {
  return {
    G, j,
    played: extra.played ?? [],
    scoring: extra.scoring ?? [],
    hand: extra.hand ?? [],
    handKey: extra.handKey,
    rng: extra.rng,
    contains: (what) => contains(extra.played ?? [], what, activeRules(G)),
  };
}

/** Run a non-scoring hook across every joker, honouring Blueprint copies. */
function fireJokers(G, hookName, rng, extra, arg) {
  const out = [];
  for (const j of G.jokers.slice()) {
    if (j.id === G.disabledJokerId) continue;
    const { def, host } = resolveJoker(G, j);
    const fn = def?.[hookName];
    if (typeof fn !== 'function') continue;
    const ctx = jokerCtx(G, host, { ...extra, rng });
    const res = fn(ctx, arg);
    if (res) out.push({ joker: j, res });
  }
  return out;
}

const EDITION_FX = { foil: { chips: 50 }, holo: { mult: 10 }, poly: { xmult: 1.5 } };
const ZERO = () => ({ chips: 0, mult: 0, xmult: 1, money: 0 });

/**
 * Score the currently selected cards.
 * Returns { events, total, handKey, handName, level, chips, mult, moneyGained }.
 */
export function scoreSelected(G) {
  const rng = makeRng(0);
  rng.state = G.rngState;

  const rules = activeRules(G);
  const played = selectedCards(G);
  const boss = activeBoss(G);
  const flags = boss?.flags ?? {};

  // Crimson Heart switches one joker off for the duration of this hand.
  G.disabledJokerId = null;
  if (flags.disableJoker && G.jokers.length) G.disabledJokerId = rng.pick(G.jokers).id;

  const ev = evaluate(played, rules);
  const handKey = ev.key;
  let scoring = rules.splash ? played.slice() : ev.scoring;

  G.roundHands.push(handKey);
  G.handLevels[handKey].plays += 1;
  if (flags.downgrade) G.handLevels[handKey].level = Math.max(1, G.handLevels[handKey].level - 1);

  const stats = handStats(handKey, G.handLevels);
  let chips = stats.chips;
  let mult = stats.mult;
  if (flags.halveBase) { chips = Math.floor(chips / 2); mult = Math.max(1, Math.floor(mult / 2)); }

  const events = [];
  let moneyGained = 0;
  const sideEffects = { destroy: [], createTarot: 0, clone: [], levelUp: 0 };
  const held = G.hand.filter((c) => !G.selected.includes(c.id));

  // `d` is the delta this beat contributed; `chips`/`mult` are running totals.
  const push = (kind, refId, d, text) => {
    events.push({ kind, refId, d, text: text ?? '', chips, mult });
  };
  const applyDelta = (d) => {
    chips += d.chips;
    mult += d.mult;
    mult *= d.xmult;
    moneyGained += d.money;
  };
  const apply = (res, kind, refId) => {
    if (!res) return;
    const d = { chips: res.chips ?? 0, mult: res.mult ?? 0, xmult: res.xmult ?? 1, money: res.money ?? 0 };
    applyDelta(d);
    if (res.createTarot) sideEffects.createTarot += res.createTarot;
    if (res.levelUpHand) sideEffects.levelUp += res.levelUpHand;
    if (res.cloneCard) sideEffects.clone.push(res.cloneCard);
    if (res.destroySelf) sideEffects.destroy.push(res.destroySelf === true ? refId : res.destroySelf);
    const visible = d.chips || d.mult || d.xmult !== 1 || d.money || res.msg;
    if (visible) push(kind, refId, d, res.msg);
  };

  events.push({ kind: 'base', refId: null, d: ZERO(), text: `${ev.name} · Lv.${stats.level}`, chips, mult });

  // Pre-scoring joker hooks (Midas, Vampire, DNA, Astronomer, counters…).
  const base = { played, scoring, hand: held, handKey, rng };
  for (const { joker, res } of fireJokers(G, 'onPlay', rng, base)) apply(res, 'joker', joker.id);

  const countRetriggers = (hookName, card) => {
    let n = 0;
    for (const j of G.jokers) {
      if (j.id === G.disabledJokerId) continue;
      const { def, host } = resolveJoker(G, j);
      n += def?.[hookName]?.(jokerCtx(G, host, base), card) ?? 0;
    }
    return n;
  };
  const runCardHook = (hookName, card) => {
    for (const j of G.jokers) {
      if (j.id === G.disabledJokerId) continue;
      const { def, host } = resolveJoker(G, j);
      if (typeof def?.[hookName] !== 'function') continue;
      apply(def[hookName](jokerCtx(G, host, base), card), 'joker', j.id);
    }
  };

  // --- scoring cards, left to right -----------------------------------------
  for (const card of scoring) {
    if (card.debuffed) { push('card', card.id, ZERO(), 'debuffed'); continue; }

    const triggers = 1 + (card.seal === 'red' ? 1 : 0) + countRetriggers('retrigger', card);

    for (let t = 0; t < triggers; t++) {
      const d = ZERO();
      d.chips += baseChips(card);
      switch (card.enhancement) {
        case 'bonus': d.chips += 30; break;
        case 'mult': d.mult += 4; break;
        case 'glass': d.xmult *= 2; break;
        case 'lucky':
          if (rng.chance(1, 5)) d.mult += 20;
          if (rng.chance(1, 15)) d.money += 20;
          break;
        default: break;
      }
      const ed = EDITION_FX[card.edition];
      if (ed) { d.chips += ed.chips ?? 0; d.mult += ed.mult ?? 0; d.xmult *= ed.xmult ?? 1; }
      if (card.seal === 'gold') d.money += 3;

      applyDelta(d);
      push('card', card.id, d, t > 0 ? 'again!' : null);
      runCardHook('scored', card);
    }

    if (card.enhancement === 'glass' && rng.chance(1, 4)) sideEffects.destroy.push(card.id);
  }

  // --- cards held in hand ---------------------------------------------------
  for (const card of held) {
    if (card.debuffed) continue;
    const triggers = 1 + (card.seal === 'red' ? 1 : 0) + countRetriggers('retriggerHeld', card);
    for (let t = 0; t < triggers; t++) {
      if (card.enhancement === 'steel') {
        const d = { ...ZERO(), xmult: 1.5 };
        applyDelta(d);
        push('held', card.id, d, null);
      }
      runCardHook('held', card);
    }
  }

  // --- independent joker effects, left to right -----------------------------
  for (const j of G.jokers) {
    if (j.id === G.disabledJokerId) { push('joker', j.id, ZERO(), 'disabled'); continue; }
    const { def, host } = resolveJoker(G, j);
    if (typeof def?.ind === 'function') apply(def.ind(jokerCtx(G, host, base)), 'joker', j.id);
    const ed = EDITION_FX[j.edition];
    if (ed) {
      const d = { ...ZERO(), ...ed, xmult: ed.xmult ?? 1 };
      applyDelta(d);
      push('joker', j.id, d, j.edition);
    }
  }

  // Observatory pays out for Planet cards you are still holding.
  if (G.vouchers.has('observatory')) {
    for (const u of G.consumables) {
      const def = CONSUMABLE_BY_KEY[u.key];
      if (def?.type === 'planet' && def.hand === handKey) {
        const d = { ...ZERO(), xmult: 1.5 };
        applyDelta(d);
        push('voucher', u.id, d, 'Observatory');
      }
    }
  }

  if (G.mods?.plasma) {
    const avg = (chips + mult) / 2;
    chips = avg; mult = avg;
    push('deck', null, ZERO(), 'Balanced');
  }

  const total = Math.round(chips * mult);
  events.push({ kind: 'total', refId: null, d: ZERO(), text: '', chips, mult, total });

  G.rngState = rng.state;
  return { events, total, handKey, handName: ev.name, level: stats.level, chips, mult, moneyGained, sideEffects, scoring, played };
}

/** Commit a scored hand: move cards, pay out, apply side effects, refill. */
export function commitHand(G, result) {
  const boss = activeBoss(G);
  const flags = boss?.flags ?? {};

  G.score += result.total;
  G.hands -= 1;
  G.stats.handsPlayed += 1;
  if (result.total > G.stats.bestHandScore) {
    G.stats.bestHandScore = result.total;
    G.stats.bestHandName = result.handName;
  }

  if (result.moneyGained) G.money += result.moneyGained;
  if (flags.costPerCard) G.money -= flags.costPerCard * result.played.length;
  if (flags.oxPenalty && result.handKey === mostPlayedHand(G)) G.money = 0;
  G.money = Math.max(-20, G.money);

  withRng(G, (rng) => {
    // Destroy anything that shattered or self-destructed during scoring.
    for (const id of result.sideEffects.destroy) {
      const card = G.deck.find((c) => c.id === id);
      if (card) destroyCard(G, card, rng);
      const joker = G.jokers.find((j) => j.id === id);
      if (joker) removeJoker(G, joker);
    }
    for (let i = 0; i < result.sideEffects.createTarot; i++) addConsumable(G, makeConsumable(rng.pick(TAROT_KEYS)));
    for (const src of result.sideEffects.clone) {
      const copy = { ...src, id: uid('c') };
      G.deck.push(copy);
      G.hand.push(copy);
      fireJokers(G, 'onCardAdded', rng, {}, copy);
    }
    if (result.sideEffects.levelUp) levelHand(G, result.handKey, result.sideEffects.levelUp);

    // Played cards leave the hand.
    const playedIds = new Set(result.played.map((c) => c.id));
    G.hand = G.hand.filter((c) => !playedIds.has(c.id));
    for (const c of result.played) {
      if (G.deck.includes(c)) G.discardPile.push(c);
      if (flags.pillar) c.debuffed = true;
      G.playedThisRound.add(c.id);
    }

    G.selected = [];
    G.playedZone = result.played;
    if (G.faceDown) { G.faceDown = false; for (const c of G.deck) c.faceDown = false; }

    // The Hook eats two more cards after every hand.
    if (flags.discardAfterPlay && G.hand.length) {
      const doomed = rng.shuffle(G.hand.slice()).slice(0, flags.discardAfterPlay);
      G.hand = G.hand.filter((c) => !doomed.includes(c));
      G.discardPile.push(...doomed);
    }

    if (G.score < G.target && G.hands > 0) {
      drawUpTo(G, rng, flags.drawFixed ? G.hand.length + flags.drawFixed : null);
    }
  });

  if (G.score >= G.target) finishBlind(G);
  else if (G.hands <= 0) G.phase = 'game_over';

  recompute(G);
  return G;
}

export function discardSelected(G) {
  if (discardBlocker(G)) return null;
  const cards = selectedCards(G);
  const flags = activeBoss(G)?.flags ?? {};

  G.discards -= 1;
  G.stats.discardsUsed += 1;
  G.stats.cardsDiscarded += cards.length;

  withRng(G, (rng) => {
    for (const { res } of fireJokers(G, 'onDiscard', rng, { hand: G.hand, rng }, cards)) {
      if (res?.money) G.money += res.money;
    }
    // Purple seals turn discards into Tarot cards.
    for (const c of cards) if (c.seal === 'purple') addConsumable(G, makeConsumable(rng.pick(TAROT_KEYS)));

    const ids = new Set(cards.map((c) => c.id));
    G.hand = G.hand.filter((c) => !ids.has(c.id));
    G.discardPile.push(...cards);
    G.selected = [];
    drawUpTo(G, rng, flags.drawFixed ? G.hand.length + flags.drawFixed : null);
  });

  recompute(G);
  return cards;
}

function mostPlayedHand(G) {
  let key = 'high_card', best = -1;
  for (const [k, v] of Object.entries(G.handLevels)) if (v.plays > best) { best = v.plays; key = k; }
  return key;
}

// ------------------------------------------------------------ Round end -----

function finishBlind(G) {
  const slot = BLIND_SLOTS[G.blindIndex];
  const lines = [];
  let total = 0;

  const add = (label, amount) => { if (amount) { lines.push({ label, amount }); total += amount; } };

  add(`${slot.name} reward`, slot.reward);
  add(`${G.hands} hand${G.hands === 1 ? '' : 's'} remaining`, G.hands * (G.mods?.handCash ?? 1));
  if (G.mods?.discardCash) add(`${G.discards} discards remaining`, G.discards * G.mods.discardCash);

  const cap = G.derived.interestCap;
  if (cap > 0 && G.money > 0) {
    const rate = 1 + G.derived.extraInterest;
    add('Interest', Math.min(cap, Math.floor(G.money / 5) * rate));
  }

  withRng(G, (rng) => {
    const goldHeld = G.hand.filter((c) => c.enhancement === 'gold').length;
    add('Gold cards held', goldHeld * 3);

    for (const c of G.hand) if (c.seal === 'blue') addConsumable(G, makeConsumable(rng.pick(PLANET_KEYS)));

    for (const { joker, res } of fireJokers(G, 'onRoundEnd', rng, { hand: G.hand, rng })) {
      if (res?.money) add(JOKER_BY_KEY[joker.key].name, res.money);
      if (res?.destroySelf) {
        removeJoker(G, joker);
        if (res.spawn && G.jokers.length < G.derived.jokerSlots) G.jokers.push(makeJoker(res.spawn));
      }
    }

    // Investment tags mature once a Boss Blind falls.
    if (G.blindIndex === 2) {
      const invest = G.tags.filter((t) => t.key === 'investment');
      if (invest.length) {
        add('Investment Tag', 25 * invest.length);
        G.tags = G.tags.filter((t) => t.key !== 'investment');
      }
      if (G.mods?.bossTag) G.tags.push({ id: uid('t'), key: pickTag(rng) });
    }
  });

  G.money += total;
  G.cashout = { lines, total, blindName: slot.name };
  G.phase = 'round_end';
  G.bossesSeen.add(G.bossKey);
  G.juggleRounds = Math.max(0, (G.juggleRounds ?? 0) - 1);
  G.stats.discardsAvailable = (G.stats.discardsAvailable ?? 0) + G.derived.discards;
  G.stats.mostPlayed = mostPlayedHand(G);
  return G.cashout;
}

/** Cash-out screen dismissed — advance the blind and open the shop. */
export function leaveCashout(G) {
  const wasBoss = G.blindIndex === 2;
  if (wasBoss) {
    if (G.ante >= WIN_ANTE && !G.won) { G.won = true; G.phase = 'win'; return G; }
    G.ante += 1;
    G.blindIndex = 0;
    G.bossKey = null;
    G.bossRerolled = false;
    withRng(G, (rng) => rollUpcomingTags(G, rng));
  } else {
    G.blindIndex += 1;
  }
  enterShop(G);
  return G;
}

export function continueEndless(G) {
  G.ante += 1;
  G.blindIndex = 0;
  G.bossKey = null;
  G.bossRerolled = false;
  withRng(G, (rng) => rollUpcomingTags(G, rng));
  enterShop(G);
  return G;
}

// ----------------------------------------------------------------- Shop -----

export function enterShop(G) {
  recompute(G);
  withRng(G, (rng) => { G.shop = buildShop(rng, G); });

  // Cash in the shop-modifying tags the player is holding.
  const consume = (key) => {
    const i = G.tags.findIndex((t) => t.key === key);
    if (i < 0) return false;
    G.tags.splice(i, 1);
    return true;
  };
  if (consume('coupon')) G.shop.coupon = true;
  if (consume('d6')) G.shop.freeRerolls = true;
  if (consume('voucher')) {
    withRng(G, (rng) => {
      const taken = new Set(G.shop.vouchers.map((v) => v.key));
      const pool = availableVouchers(G.vouchers).filter((v) => !taken.has(v.key));
      if (pool.length) G.shop.vouchers.push({ id: uid('v'), key: rng.pick(pool).key });
    });
  }
  for (const rarity of [['uncommon', 2], ['rare', 3]]) {
    if (consume(rarity[0])) {
      withRng(G, (rng) => {
        const j = rollJoker(rng, G, { forceRarity: rarity[1] });
        G.shop.items.unshift({ id: uid('s'), kind: 'joker', payload: j, cost: 0, free: true });
      });
    }
  }

  G.phase = 'shop';
  return G;
}

export function rerollShop(G) {
  const cost = rerollCost(G);
  if (G.money < cost) return false;
  G.money -= cost;
  const rerolls = G.shop.rerolls + 1;
  const keepVoucher = G.shop.vouchers[0] ?? null;
  const coupon = G.shop.coupon, freeRerolls = G.shop.freeRerolls;
  withRng(G, (rng) => { G.shop = buildShop(rng, G, { keepVoucher }); });
  Object.assign(G.shop, { rerolls, coupon, freeRerolls });
  return true;
}

export function itemPrice(G, item) {
  return item.free ? 0 : discounted(G, item.cost);
}

export function buyItem(G, itemId) {
  const idx = G.shop.items.findIndex((i) => i.id === itemId);
  if (idx < 0) return { ok: false, msg: 'Gone' };
  const item = G.shop.items[idx];
  const price = itemPrice(G, item);
  if (G.money < price) return { ok: false, msg: 'Not enough money' };

  if (item.kind === 'joker') {
    if (!hasJokerRoom(G, item.payload)) return { ok: false, msg: 'No Joker slots' };
    G.money -= price;
    G.jokers.push(item.payload);
    G.stats.jokersOwned += 1;
  } else if (item.kind === 'consumable') {
    if (G.consumables.length >= G.derived.consumableSlots) return { ok: false, msg: 'No consumable slots' };
    G.money -= price;
    G.consumables.push(item.payload);
  } else {
    G.money -= price;
    G.deck.push(item.payload);
    withRng(G, (rng) => fireJokers(G, 'onCardAdded', rng, {}, item.payload));
  }

  G.shop.items.splice(idx, 1);
  recompute(G);
  return { ok: true };
}

export function hasJokerRoom(G, joker) {
  if (joker?.edition === 'negative') return true;
  return G.jokers.length < G.derived.jokerSlots;
}

export function buyVoucher(G, voucherId) {
  const idx = G.shop.vouchers.findIndex((v) => v.id === voucherId);
  if (idx < 0) return { ok: false, msg: 'Gone' };
  const v = G.shop.vouchers[idx];
  const price = discounted(G, VOUCHER_BY_KEY[v.key]?.cost ?? 10);
  if (G.money < price) return { ok: false, msg: 'Not enough money' };
  G.money -= price;
  G.vouchers.add(v.key);
  G.shop.vouchers.splice(idx, 1);

  // Hieroglyph and Petroglyph literally roll the run back an ante.
  if (v.key === 'hieroglyph' || v.key === 'petroglyph') G.ante = Math.max(1, G.ante - 1);
  recompute(G);
  return { ok: true };
}

export function buyPack(G, packId) {
  const idx = G.shop.packs.findIndex((p) => p.id === packId);
  if (idx < 0) return { ok: false, msg: 'Gone' };
  const p = G.shop.packs[idx];
  const price = discounted(G, p.cost);
  if (G.money < price) return { ok: false, msg: 'Not enough money' };
  G.money -= price;
  G.shop.packs.splice(idx, 1);
  withRng(G, (rng) => { G.pack = rollPack(rng, G, p.packKey); });
  G.returnPhase = 'shop';
  G.phase = 'pack';
  return { ok: true };
}

export function leaveShop(G) {
  withRng(G, (rng) => {
    for (const { res } of fireJokers(G, 'onShopExit', rng, {})) {
      if (res?.negativeCopy && G.consumables.length) {
        const src = rng.pick(G.consumables);
        addConsumable(G, { ...makeConsumable(src.key), edition: 'negative' }, true);
      }
    }
  });
  G.shop = null;
  G.phase = 'blind_select';
  recompute(G);
  return G;
}

// ---------------------------------------------------------------- Packs -----

export function pickFromPack(G, optionId) {
  const pack = G.pack;
  if (!pack) return { ok: false };
  const idx = pack.options.findIndex((o) => o.id === optionId);
  if (idx < 0) return { ok: false };
  const opt = pack.options[idx];

  if (opt.kind === 'joker') {
    if (!hasJokerRoom(G, opt.payload)) return { ok: false, msg: 'No Joker slots' };
    G.jokers.push(opt.payload);
  } else if (opt.kind === 'consumable') {
    if (G.consumables.length >= G.derived.consumableSlots) {
      // Slots are full, so the card has to be used on the spot. That is only
      // possible when it needs no target — otherwise there is nowhere to put it.
      const blocked = consumableBlocker(G, opt.payload);
      if (blocked) return { ok: false, msg: 'No consumable slots' };
      const used = useConsumableObject(G, opt.payload, []);
      if (used.ok === false) return { ok: false, msg: used.msg ?? 'No consumable slots' };
    } else {
      G.consumables.push(opt.payload);
    }
  } else {
    G.deck.push(opt.payload);
    withRng(G, (rng) => fireJokers(G, 'onCardAdded', rng, {}, opt.payload));
  }

  pack.options.splice(idx, 1);
  pack.picked += 1;
  recompute(G);
  if (pack.picked >= pack.choose || !pack.options.length) closePack(G);
  return { ok: true };
}

export function closePack(G) {
  G.pack = null;
  G.phase = G.returnPhase ?? 'shop';
  G.returnPhase = null;
  if (G.phase === 'shop' && !G.shop) enterShop(G);
  recompute(G);
  return G;
}

// ----------------------------------------------------- Jokers & consumables --

export function sellJoker(G, jokerId) {
  const j = G.jokers.find((x) => x.id === jokerId);
  if (!j) return false;
  const value = sellValue(j.cost);

  withRng(G, (rng) => {
    const { def, host } = resolveJoker(G, j);
    const res = def?.onSellSelf?.(jokerCtx(G, host, { rng }));
    if (res?.duplicateJoker) {
      const others = G.jokers.filter((x) => x !== j);
      if (others.length && G.jokers.length <= G.derived.jokerSlots) {
        const src = rng.pick(others);
        G.jokers.push({ ...makeJoker(src.key, src.edition), state: { ...src.state } });
      }
    }
    removeJoker(G, j);
    fireJokers(G, 'onSellOther', rng, {});
  });

  G.money += value;
  recompute(G);
  return true;
}

export function sellConsumable(G, id) {
  const i = G.consumables.findIndex((c) => c.id === id);
  if (i < 0) return false;
  const [u] = G.consumables.splice(i, 1);
  G.money += Math.max(1, Math.floor(u.cost / 2));
  withRng(G, (rng) => fireJokers(G, 'onSellOther', rng, {}));
  recompute(G);
  return true;
}

export function moveJoker(G, jokerId, toIndex) {
  const from = G.jokers.findIndex((j) => j.id === jokerId);
  if (from < 0) return;
  const [j] = G.jokers.splice(from, 1);
  G.jokers.splice(clamp(toIndex, 0, G.jokers.length), 0, j);
}

function removeJoker(G, j) {
  const i = G.jokers.indexOf(j);
  if (i >= 0) G.jokers.splice(i, 1);
}

export function addConsumable(G, item, force = false) {
  if (!force && G.consumables.length >= G.derived.consumableSlots) return false;
  G.consumables.push(item);
  return true;
}

export function consumableBlocker(G, item) {
  const def = CONSUMABLE_BY_KEY[item.key];
  const need = def.sel;
  const wantsHand = (need && need.max > 0) || NEEDS_HAND.has(item.key);
  if (wantsHand && G.phase !== 'playing') return 'Only usable during a blind';
  if (!need || need.max === 0) return null;
  const n = G.selected.length;
  if (n < need.min) return `Select ${need.min === need.max ? need.min : `${need.min}-${need.max}`} card${need.max > 1 ? 's' : ''}`;
  if (n > need.max) return `Select at most ${need.max}`;
  return null;
}

export function useConsumable(G, id) {
  const i = G.consumables.findIndex((c) => c.id === id);
  if (i < 0) return { ok: false };
  const item = G.consumables[i];
  const sel = selectedCards(G);
  const out = useConsumableObject(G, item, sel);
  if (out.ok !== false) {
    G.consumables.splice(i, 1);
    G.selected = [];
  }
  return out;
}

function useConsumableObject(G, item, sel) {
  const def = CONSUMABLE_BY_KEY[item.key];
  if (!def) return { ok: false };
  // Guard the apply() functions: several index straight into `sel`.
  if (def.sel && sel.length < def.sel.min) return { ok: false, msg: 'Select a target card first' };

  let out = { ok: true };
  withRng(G, (rng) => {
    const api = makeApi(G, rng);
    const res = def.apply(G, sel, api) ?? {};
    if (res.ok === false) { out = res; return; }
    out = { ok: true, msg: res.msg ?? def.name };

    G.stats.lastConsumable = item.key;
    if (def.type === 'tarot') G.stats.tarotsUsed += 1;
    if (def.type === 'planet') { G.stats.planetsUsed += 1; fireJokers(G, 'onPlanetUsed', rng, {}); }
  });
  recompute(G);
  return out;
}

/** The surface consumables use to touch the run without importing game.js. */
function makeApi(G, rng) {
  return {
    rng,
    addMoney: (n) => { G.money += n; },
    setMoney: (n) => { G.money = n; },
    levelHand: (key, n) => levelHand(G, key, n),
    destroyCard: (c) => destroyCard(G, c, rng),
    destroyRandomInHand: (n) => {
      const pool = rng.shuffle(G.hand.slice()).slice(0, n);
      for (const c of pool) destroyCard(G, c, rng);
    },
    addCard: (c) => {
      const card = c.id && !G.deck.some((x) => x.id === c.id) ? c : { ...c, id: uid('c') };
      G.deck.push(card);
      if (G.phase === 'playing' && G.hand.length < G.derived.handSize) G.hand.push(card);
      fireJokers(G, 'onCardAdded', rng, {}, card);
      return card;
    },
    addRandomCard: (opts) => {
      const card = randomEnhancedCard(rng, opts);
      G.deck.push(card);
      if (G.phase === 'playing' && G.hand.length < G.derived.handSize) G.hand.push(card);
      fireJokers(G, 'onCardAdded', rng, {}, card);
      return card;
    },
    createConsumableKey: (key) => addConsumable(G, makeConsumable(key)),
    createRandom: (type, n) => {
      const keys = type === 'planet' ? PLANET_KEYS : type === 'spectral' ? SPECTRAL_KEYS : TAROT_KEYS;
      for (let i = 0; i < n; i++) addConsumable(G, makeConsumable(rng.pick(keys)));
    },
    createJoker: (rarity = null) => {
      if (G.jokers.length >= G.derived.jokerSlots) return null;
      const j = rollJoker(rng, G, { forceRarity: rarity });
      G.jokers.push(j);
      return j;
    },
    copyJoker: (src) => {
      if (G.jokers.length >= G.derived.jokerSlots + 1) return null;
      return { ...makeJoker(src.key, src.edition), state: { ...src.state } };
    },
  };
}

/** Used only by the browser smoke test to stage a board quickly. */
export const makeTestJoker = (key) => makeJoker(key);

export function levelHand(G, key, n = 1) {
  G.handLevels[key].level = Math.max(1, G.handLevels[key].level + n);
  return G.handLevels[key].level;
}

export function destroyCard(G, card, rng) {
  const i = G.deck.indexOf(card);
  if (i >= 0) G.deck.splice(i, 1);
  G.hand = G.hand.filter((c) => c !== card);
  G.drawPile = G.drawPile.filter((c) => c !== card);
  G.discardPile = G.discardPile.filter((c) => c !== card);
  fireJokers(G, 'onDestroy', rng ?? makeRng(G.rngState), {}, card);
}

// ------------------------------------------------------------ Save / load ---

export function serialize(G) {
  return JSON.stringify({
    ...G,
    vouchers: [...G.vouchers],
    bossesSeen: [...G.bossesSeen],
    playedThisRound: [...G.playedThisRound],
    derived: undefined,
    mods: undefined,
  });
}

export function deserialize(raw) {
  const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!o || o.version !== SAVE_VERSION) return null;
  const G = {
    ...o,
    vouchers: new Set(o.vouchers ?? []),
    bossesSeen: new Set(o.bossesSeen ?? []),
    playedThisRound: new Set(o.playedThisRound ?? []),
    mods: DECK_BY_KEY[o.deckKey]?.mods ?? {},
  };
  // Rebuild object identity between the deck and the per-round piles.
  const byId = new Map(G.deck.map((c) => [c.id, c]));
  const relink = (arr) => (arr ?? []).map((c) => byId.get(c.id) ?? c);
  G.drawPile = relink(G.drawPile);
  G.hand = relink(G.hand);
  G.discardPile = relink(G.discardPile);
  G.playedZone = relink(G.playedZone);
  recompute(G);
  return G;
}
