// Headless assertions for the rules engine. Run with `npm test`.

import assert from 'node:assert/strict';

import { makeCard, standardDeck, baseChips } from '../js/cards.js';
import { evaluate, contains, handStats, freshHandLevels } from '../js/poker.js';
import { JOKERS, JOKER_BY_KEY, makeJoker } from '../js/jokers.js';
import { CONSUMABLES, CONSUMABLE_BY_KEY, makeConsumable } from '../js/consumables.js';
import { VOUCHERS, PACKS, availableVouchers } from '../js/shop.js';
import { BOSSES, FINISHERS, anteBase, blindTarget } from '../js/blinds.js';
import { DECKS } from '../js/decks.js';
import * as Game from '../js/game.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; }
  catch (err) { failures.push(`${name}: ${err.message}`); }
}

const C = (rank, suit, extra) => makeCard(rank, suit, extra);

// ------------------------------------------------------------ hand detection --

test('high card', () => {
  assert.equal(evaluate([C(14, 'S'), C(9, 'H'), C(4, 'D')]).key, 'high_card');
});

test('pair / two pair / trips / quads', () => {
  assert.equal(evaluate([C(5, 'S'), C(5, 'H')]).key, 'pair');
  assert.equal(evaluate([C(5, 'S'), C(5, 'H'), C(9, 'D'), C(9, 'C')]).key, 'two_pair');
  assert.equal(evaluate([C(7, 'S'), C(7, 'H'), C(7, 'D')]).key, 'three');
  assert.equal(evaluate([C(7, 'S'), C(7, 'H'), C(7, 'D'), C(7, 'C')]).key, 'four');
});

test('full house beats trips', () => {
  const hand = [C(7, 'S'), C(7, 'H'), C(7, 'D'), C(4, 'C'), C(4, 'S')];
  assert.equal(evaluate(hand).key, 'full_house');
  assert.equal(evaluate(hand).scoring.length, 5);
});

test('flush needs five of a suit', () => {
  assert.equal(evaluate([C(2, 'H'), C(5, 'H'), C(9, 'H'), C(11, 'H'), C(13, 'H')]).key, 'flush');
  assert.equal(evaluate([C(2, 'H'), C(5, 'H'), C(9, 'H'), C(11, 'H'), C(13, 'S')]).key, 'high_card');
});

test('four fingers allows a four-card flush', () => {
  const hand = [C(2, 'H'), C(5, 'H'), C(9, 'H'), C(11, 'H'), C(13, 'S')];
  const out = evaluate(hand, { fourFingers: true });
  assert.equal(out.key, 'flush');
  assert.equal(out.scoring.length, 4, 'only the four hearts should score');
});

test('straight, including the wheel', () => {
  assert.equal(evaluate([C(5, 'S'), C(6, 'H'), C(7, 'D'), C(8, 'C'), C(9, 'S')]).key, 'straight');
  assert.equal(evaluate([C(14, 'S'), C(2, 'H'), C(3, 'D'), C(4, 'C'), C(5, 'S')]).key, 'straight');
  assert.equal(evaluate([C(10, 'S'), C(11, 'H'), C(12, 'D'), C(13, 'C'), C(14, 'S')]).key, 'straight');
});

test('shortcut allows gaps of one', () => {
  const hand = [C(5, 'S'), C(7, 'H'), C(9, 'D'), C(11, 'C'), C(13, 'S')];
  assert.equal(evaluate(hand).key, 'high_card');
  assert.equal(evaluate(hand, { shortcut: true }).key, 'straight');
});

test('straight flush and its scoring set', () => {
  const hand = [C(5, 'H'), C(6, 'H'), C(7, 'H'), C(8, 'H'), C(9, 'H')];
  assert.equal(evaluate(hand).key, 'straight_flush');
});

test('five of a kind and flush five', () => {
  assert.equal(evaluate([C(7, 'S'), C(7, 'H'), C(7, 'D'), C(7, 'C'), C(7, 'S')]).key, 'five');
  assert.equal(evaluate([C(7, 'H'), C(7, 'H'), C(7, 'H'), C(7, 'H'), C(7, 'H')]).key, 'flush_five');
});

test('flush house', () => {
  const hand = [C(7, 'H'), C(7, 'H'), C(7, 'H'), C(4, 'H'), C(4, 'H')];
  assert.equal(evaluate(hand).key, 'flush_house');
});

test('wild cards satisfy every suit', () => {
  const hand = [C(2, 'H'), C(5, 'H'), C(9, 'H'), C(11, 'H'), C(13, 'S', { enhancement: 'wild' })];
  assert.equal(evaluate(hand).key, 'flush');
});

test('smeared joker merges suits by colour', () => {
  const hand = [C(2, 'H'), C(5, 'D'), C(9, 'H'), C(11, 'D'), C(13, 'H')];
  assert.equal(evaluate(hand).key, 'high_card');
  assert.equal(evaluate(hand, { smeared: true }).key, 'flush');
});

test('stone cards always join the scoring set', () => {
  const stone = C(2, 'S', { enhancement: 'stone' });
  const out = evaluate([C(7, 'S'), C(7, 'H'), stone]);
  assert.equal(out.key, 'pair');
  assert.ok(out.scoring.includes(stone), 'stone card must score');
  assert.equal(baseChips(stone), 50);
});

test('scoring order follows the played order', () => {
  const a = C(7, 'S'), b = C(3, 'H'), c = C(7, 'D');
  const out = evaluate([a, b, c]);
  assert.deepEqual(out.scoring.map((x) => x.id), [a.id, c.id]);
});

test('contains() sees patterns inside bigger hands', () => {
  const quads = [C(7, 'S'), C(7, 'H'), C(7, 'D'), C(7, 'C'), C(2, 'S')];
  assert.ok(contains(quads, 'pair'));
  assert.ok(contains(quads, 'three'));
  assert.ok(contains(quads, 'two_pair'));
  assert.ok(contains(quads, 'four'));
  assert.ok(!contains(quads, 'flush'));
});

// ------------------------------------------------------------- hand levels ---

test('levels raise chips and mult', () => {
  const levels = freshHandLevels();
  const l1 = handStats('pair', levels);
  levels.pair.level = 3;
  const l3 = handStats('pair', levels);
  assert.equal(l1.chips, 10);
  assert.equal(l3.chips, 10 + 15 * 2);
  assert.equal(l3.mult, 2 + 1 * 2);
});

// -------------------------------------------------------------- data sanity --

test('every joker has a unique key, cost and text', () => {
  const seen = new Set();
  for (const d of JOKERS) {
    assert.ok(d.key && !seen.has(d.key), `duplicate joker key ${d.key}`);
    seen.add(d.key);
    assert.ok(d.name, `${d.key} needs a name`);
    assert.ok(typeof d.cost === 'number' && d.cost > 0, `${d.key} needs a cost`);
    assert.ok([1, 2, 3, 4].includes(d.rarity), `${d.key} rarity`);
    const j = makeJoker(d.key);
    const txt = typeof d.text === 'function' ? d.text(j, null) : d.text;
    assert.ok(txt && txt.length > 3, `${d.key} needs descriptive text`);
  }
});

test('every consumable has a unique key and renders text', () => {
  const seen = new Set();
  const G = Game.newRun({ seed: 'TEXTTEST' });
  for (const d of CONSUMABLES) {
    assert.ok(d.key && !seen.has(d.key), `duplicate consumable key ${d.key}`);
    seen.add(d.key);
    const txt = typeof d.text === 'function' ? d.text(G) : d.text;
    assert.ok(txt && txt.length > 3, `${d.key} needs text`);
    assert.ok(d.sel && typeof d.sel.min === 'number', `${d.key} needs a selection spec`);
    assert.equal(typeof d.apply, 'function', `${d.key} needs apply()`);
  }
});

test('voucher prerequisites all exist', () => {
  const keys = new Set(VOUCHERS.map((v) => v.key));
  for (const v of VOUCHERS) {
    if (v.needs) assert.ok(keys.has(v.needs), `${v.key} needs missing ${v.needs}`);
  }
  const owned = new Set();
  assert.ok(availableVouchers(owned).every((v) => !v.needs));
});

test('packs and bosses are well formed', () => {
  for (const p of PACKS) {
    assert.ok(p.choose <= p.size, `${p.key} cannot choose more than it holds`);
    assert.ok(p.cost > 0 && p.weight > 0);
  }
  for (const b of [...BOSSES, ...FINISHERS]) {
    assert.ok(b.name && b.desc, `${b.key} needs name and desc`);
    assert.ok(b.flags || b.debuff, `${b.key} needs an actual effect`);
  }
});

test('ante targets escalate', () => {
  let prev = 0;
  for (let a = 1; a <= 16; a++) {
    const t = anteBase(a);
    assert.ok(t > prev, `ante ${a} target must exceed ante ${a - 1}`);
    prev = t;
  }
  assert.ok(blindTarget(1, 1) > blindTarget(1, 0), 'big blind is bigger than small');
  assert.ok(blindTarget(1, 2) > blindTarget(1, 1), 'boss is bigger than big');
});

test('every deck builds a non-empty deck', () => {
  for (const d of DECKS) {
    const G = Game.newRun({ seed: 'DECKTEST', deckKey: d.key });
    assert.ok(G.deck.length > 0, `${d.key} produced an empty deck`);
    assert.ok(G.derived.handSize >= 1 && G.derived.hands >= 1, `${d.key} derived stats`);
  }
});

// ----------------------------------------------------------------- scoring ---

function rig({ jokers = [], hand = [], selected = null, deckKey = 'standard' } = {}) {
  const G = Game.newRun({ seed: 'RIGGED', deckKey });
  Game.startBlind(G);
  G.jokers = jokers.map((k) => (typeof k === 'string' ? makeJoker(k) : k));
  G.hand = hand.slice();
  G.selected = (selected ?? hand).map((c) => c.id);
  Game.recompute(G);
  return G;
}

test('a bare pair scores base chips times base mult', () => {
  const hand = [C(10, 'S'), C(10, 'H')];
  const G = rig({ hand });
  const out = Game.scoreSelected(G);
  // (10 base + 10 + 10 card chips) * 2 mult
  assert.equal(out.handKey, 'pair');
  assert.equal(out.total, (10 + 10 + 10) * 2);
});

test('the Jester adds flat mult', () => {
  const hand = [C(10, 'S'), C(10, 'H')];
  const G = rig({ jokers: ['jester'], hand });
  const out = Game.scoreSelected(G);
  assert.equal(out.total, (10 + 10 + 10) * (2 + 4));
});

test('joker order changes the result', () => {
  const hand = [C(10, 'S'), C(10, 'H')];
  const addThenMul = Game.scoreSelected(rig({ jokers: ['jester', 'duo'], hand }));
  const mulThenAdd = Game.scoreSelected(rig({ jokers: ['duo', 'jester'], hand }));
  assert.equal(addThenMul.total, 30 * ((2 + 4) * 2));
  assert.equal(mulThenAdd.total, 30 * (2 * 2 + 4));
  assert.notEqual(addThenMul.total, mulThenAdd.total);
});

test('bonus and mult enhancements apply per card', () => {
  const hand = [C(10, 'S', { enhancement: 'bonus' }), C(10, 'H', { enhancement: 'mult' })];
  const G = rig({ hand });
  const out = Game.scoreSelected(G);
  assert.equal(out.total, (10 + (10 + 30) + 10) * (2 + 4));
});

test('a red seal retriggers its card', () => {
  const plain = Game.scoreSelected(rig({ hand: [C(10, 'S'), C(10, 'H')] }));
  const sealed = Game.scoreSelected(rig({ hand: [C(10, 'S', { seal: 'red' }), C(10, 'H')] }));
  assert.equal(sealed.chips, plain.chips + 10);
});

test('steel cards held in hand multiply', () => {
  const scored = [C(10, 'S'), C(10, 'H')];
  const steel = C(4, 'D', { enhancement: 'steel' });
  const G = rig({ hand: [...scored, steel], selected: scored });
  const out = Game.scoreSelected(G);
  assert.equal(out.mult, 2 * 1.5);
});

test('debuffed cards score nothing', () => {
  const hand = [C(10, 'S', { debuffed: true }), C(10, 'H')];
  const G = rig({ hand });
  const out = Game.scoreSelected(G);
  assert.equal(out.total, (10 + 10) * 2, 'the debuffed ten must not add chips');
});

test('blueprint copies the joker to its right', () => {
  const hand = [C(10, 'S'), C(10, 'H')];
  const solo = Game.scoreSelected(rig({ jokers: ['jester'], hand }));
  const copied = Game.scoreSelected(rig({ jokers: ['blueprint', 'jester'], hand }));
  assert.equal(solo.mult, 2 + 4);
  assert.equal(copied.mult, 2 + 4 + 4, 'blueprint should add a second +4');
});

test('blueprint with nothing to its right is inert', () => {
  const hand = [C(10, 'S'), C(10, 'H')];
  const out = Game.scoreSelected(rig({ jokers: ['blueprint'], hand }));
  assert.equal(out.mult, 2);
});

test('splash makes every played card score', () => {
  const hand = [C(10, 'S'), C(10, 'H'), C(2, 'D')];
  const without = Game.scoreSelected(rig({ hand }));
  const with_ = Game.scoreSelected(rig({ jokers: ['splash'], hand }));
  assert.equal(with_.chips, without.chips + 2);
});

test('polychrome edition multiplies', () => {
  const hand = [C(10, 'S'), C(10, 'H')];
  const G = rig({ hand });
  G.jokers = [makeJoker('jester', 'poly')];
  const out = Game.scoreSelected(G);
  assert.equal(out.mult, (2 + 4) * 1.5);
});

test('scoring is deterministic for a given seed', () => {
  const a = Game.scoreSelected(rig({ jokers: ['misprint'], hand: [C(10, 'S'), C(10, 'H')] }));
  const b = Game.scoreSelected(rig({ jokers: ['misprint'], hand: [C(10, 'S'), C(10, 'H')] }));
  assert.equal(a.total, b.total);
});

test('events carry deltas and running totals', () => {
  const out = Game.scoreSelected(rig({ jokers: ['jester'], hand: [C(10, 'S'), C(10, 'H')] }));
  assert.equal(out.events[0].kind, 'base');
  const last = out.events[out.events.length - 1];
  assert.equal(last.kind, 'total');
  assert.equal(last.total, out.total);
  for (const e of out.events) {
    assert.ok(e.d && typeof e.d.chips === 'number', 'every event needs a delta');
    assert.ok(Number.isFinite(e.chips) && Number.isFinite(e.mult));
  }
});

// ---------------------------------------------------------------- run flow ---

test('a fresh run starts in blind select with a legal board', () => {
  const G = Game.newRun({ seed: 'FLOW' });
  assert.equal(G.phase, 'blind_select');
  assert.equal(G.deck.length, 52);
  assert.equal(G.ante, 1);
  assert.equal(G.money, 4);
  assert.ok(G.upcomingTags.length === 2);
});

test('starting a blind deals a full hand', () => {
  const G = Game.newRun({ seed: 'DEAL' });
  Game.startBlind(G);
  assert.equal(G.phase, 'playing');
  assert.equal(G.hand.length, G.derived.handSize);
  assert.equal(G.drawPile.length, 52 - G.derived.handSize);
  assert.equal(G.hands, G.derived.hands);
});

test('discarding draws replacements and costs a discard', () => {
  const G = Game.newRun({ seed: 'DISCARD' });
  Game.startBlind(G);
  const before = G.discards;
  G.selected = G.hand.slice(0, 3).map((c) => c.id);
  Game.discardSelected(G);
  assert.equal(G.discards, before - 1);
  assert.equal(G.hand.length, G.derived.handSize);
  assert.equal(G.discardPile.length, 3);
});

test('losing every hand ends the run', () => {
  const G = Game.newRun({ seed: 'LOSE' });
  Game.startBlind(G);
  G.target = 1e9;
  for (let i = 0; i < 20 && G.phase === 'playing'; i++) {
    G.selected = [G.hand[0].id];
    Game.commitHand(G, Game.scoreSelected(G));
  }
  assert.equal(G.phase, 'game_over');
});

test('beating the target pays out and opens the shop', () => {
  const G = Game.newRun({ seed: 'WIN' });
  Game.startBlind(G);
  G.target = 1;
  G.selected = [G.hand[0].id];
  Game.commitHand(G, Game.scoreSelected(G));
  assert.equal(G.phase, 'round_end');
  assert.ok(G.cashout.total >= 3, 'should pay at least the blind reward');
  const before = G.money;
  Game.leaveCashout(G);
  assert.equal(G.phase, 'shop');
  assert.equal(G.blindIndex, 1);
  assert.equal(G.money, before);
  assert.ok(G.shop.items.length >= 2);
  assert.ok(G.shop.packs.length === 2);
});

test('a full ante advances to the next ante', () => {
  const G = Game.newRun({ seed: 'ANTE' });
  for (let i = 0; i < 3; i++) {
    Game.startBlind(G);
    G.target = 1;
    G.selected = [G.hand[0].id];
    Game.commitHand(G, Game.scoreSelected(G));
    Game.leaveCashout(G);
    if (G.phase === 'shop') Game.leaveShop(G);
  }
  assert.equal(G.ante, 2);
  assert.equal(G.blindIndex, 0);
});

test('skipping a blind grants a tag and advances', () => {
  const G = Game.newRun({ seed: 'SKIPTAG' });
  const out = Game.skipBlind(G);
  assert.ok(out, 'small blind should be skippable');
  assert.equal(G.blindIndex, 1);
  assert.ok(G.tags.length > 0 || out.money !== undefined || out.opened);
});

test('the boss blind cannot be skipped', () => {
  const G = Game.newRun({ seed: 'NOSKIP' });
  G.blindIndex = 2;
  assert.equal(Game.canSkipBlind(G), false);
  assert.equal(Game.skipBlind(G), null);
});

test('buying a joker costs money and fills a slot', () => {
  const G = Game.newRun({ seed: 'BUY' });
  Game.enterShop(G);
  G.money = 100;
  const joker = G.shop.items.find((i) => i.kind === 'joker');
  if (joker) {
    const before = G.money;
    const out = Game.buyItem(G, joker.id);
    assert.ok(out.ok, out.msg);
    assert.equal(G.jokers.length, 1);
    assert.ok(G.money < before);
  }
});

test('joker slots are enforced', () => {
  const G = Game.newRun({ seed: 'SLOTS' });
  G.jokers = ['jester', 'sly', 'wily', 'clever', 'crafty'].map((k) => makeJoker(k));
  Game.recompute(G);
  assert.equal(Game.hasJokerRoom(G, makeJoker('duo')), false);
  assert.equal(Game.hasJokerRoom(G, makeJoker('duo', 'negative')), true, 'negative ignores slots');
});

test('selling a joker returns half its cost', () => {
  const G = Game.newRun({ seed: 'SELL' });
  G.jokers = [makeJoker('blueprint')];       // cost 10 -> sells for 5
  Game.recompute(G);
  const before = G.money;
  Game.sellJoker(G, G.jokers[0].id);
  assert.equal(G.jokers.length, 0);
  assert.equal(G.money, before + 5);
});

test('planet cards level the matching hand', () => {
  const G = Game.newRun({ seed: 'PLANET' });
  G.consumables = [makeConsumable('mercury')];
  const out = Game.useConsumable(G, G.consumables[0].id);
  assert.ok(out.ok !== false, out.msg);
  assert.equal(G.handLevels.pair.level, 2);
  assert.equal(G.consumables.length, 0);
});

test('black hole levels everything', () => {
  const G = Game.newRun({ seed: 'BLACKHOLE' });
  G.consumables = [makeConsumable('black_hole')];
  Game.useConsumable(G, G.consumables[0].id);
  for (const v of Object.values(G.handLevels)) assert.equal(v.level, 2);
});

test('tarots that need a target are blocked outside a blind', () => {
  const G = Game.newRun({ seed: 'TAROTBLOCK' });
  const item = makeConsumable('lovers');
  G.consumables = [item];
  assert.ok(Game.consumableBlocker(G, item), 'should be blocked in blind select');
  Game.startBlind(G);
  assert.ok(Game.consumableBlocker(G, item), 'still blocked with nothing selected');
  G.selected = [G.hand[0].id];
  assert.equal(Game.consumableBlocker(G, item), null);
  Game.useConsumable(G, item.id);
  assert.equal(G.hand.find((c) => c.enhancement === 'wild') !== undefined, true);
});

test('the hermit doubles money up to a cap', () => {
  const G = Game.newRun({ seed: 'HERMIT' });
  G.money = 100;
  G.consumables = [makeConsumable('hermit')];
  Game.useConsumable(G, G.consumables[0].id);
  assert.equal(G.money, 120, 'capped at +$20');
});

test('boss debuffs stamp the whole deck', () => {
  const G = Game.newRun({ seed: 'BOSSDEBUFF' });
  G.blindIndex = 2;
  G.bossKey = 'club';
  Game.startBlind(G);
  const clubs = G.deck.filter((c) => c.suit === 'C');
  assert.ok(clubs.length && clubs.every((c) => c.debuffed));
  assert.ok(G.deck.filter((c) => c.suit === 'S').every((c) => !c.debuffed));
});

test('the needle allows exactly one hand', () => {
  const G = Game.newRun({ seed: 'NEEDLE' });
  G.blindIndex = 2;
  G.bossKey = 'needle';
  Game.startBlind(G);
  assert.equal(G.hands, 1);
});

test('the psychic demands five cards', () => {
  const G = Game.newRun({ seed: 'PSYCHIC' });
  G.blindIndex = 2;
  G.bossKey = 'psychic';
  Game.startBlind(G);
  G.selected = G.hand.slice(0, 3).map((c) => c.id);
  assert.ok(Game.playBlocker(G)?.includes('exactly 5'));
  G.selected = G.hand.slice(0, 5).map((c) => c.id);
  assert.equal(Game.playBlocker(G), null);
});

test('the ringmaster switches every boss off', () => {
  const G = Game.newRun({ seed: 'RINGMASTER' });
  G.blindIndex = 2;
  G.bossKey = 'needle';
  G.jokers = [makeJoker('ringmaster')];
  Game.startBlind(G);
  assert.equal(Game.activeBoss(G), null);
  assert.equal(G.hands, G.derived.hands, 'hands should not be capped at 1');
});

test('save and load round-trips a live run', () => {
  const G = Game.newRun({ seed: 'SAVELOAD' });
  Game.startBlind(G);
  G.jokers = [makeJoker('jester')];
  G.selected = [G.hand[0].id];
  const raw = Game.serialize(G);
  const back = Game.deserialize(raw);
  assert.ok(back, 'deserialize returned null');
  assert.equal(back.seed, G.seed);
  assert.equal(back.hand.length, G.hand.length);
  assert.equal(back.jokers.length, 1);
  assert.ok(back.vouchers instanceof Set);
  // Card identity must be shared between the deck and the hand again.
  const handCard = back.hand[0];
  assert.ok(back.deck.includes(handCard), 'hand cards must be the same objects as deck cards');
  assert.equal(Game.scoreSelected(back).total, Game.scoreSelected(G).total);
});

test('a mismatched save version is rejected', () => {
  assert.equal(Game.deserialize(JSON.stringify({ version: 0 })), null);
});

// --------------------------------------------------- exhaustive joker sweep --
// Every joker gets driven through a whole round with all its hooks reachable:
// play, discard, round end, shop exit, card added, card destroyed, sell.

test('every joker survives a full round without crashing or producing NaN', () => {
  const broken = [];

  for (const def of JOKERS) {
    try {
      const G = Game.newRun({ seed: 'SWEEP-' + def.key });
      G.jokers = [makeJoker(def.key)];
      // A partner on the right so Blueprint/Brainstorm have something to copy.
      G.jokers.push(makeJoker('jester'));
      Game.recompute(G);
      Game.startBlind(G);

      G.money = 25;
      G.consumables = [makeConsumable('mercury')];
      Game.useConsumable(G, G.consumables[0].id);

      // Discard once so onDiscard hooks fire.
      G.selected = G.hand.slice(0, 3).map((c) => c.id);
      Game.discardSelected(G);

      // Score a couple of hands so counters tick and retriggers run.
      for (let i = 0; i < 2 && G.phase === 'playing'; i++) {
        G.selected = G.hand.slice(0, 5).map((c) => c.id);
        const out = Game.scoreSelected(G);
        assert.ok(Number.isFinite(out.chips), `${def.key}: chips is ${out.chips}`);
        assert.ok(Number.isFinite(out.mult), `${def.key}: mult is ${out.mult}`);
        assert.ok(Number.isFinite(out.total) && out.total >= 0, `${def.key}: total is ${out.total}`);
        for (const e of out.events) {
          assert.ok(Number.isFinite(e.chips) && Number.isFinite(e.mult), `${def.key}: event totals`);
        }
        Game.commitHand(G, out);
      }

      // Force the round to end so onRoundEnd fires, then walk the shop.
      if (G.phase === 'playing') {
        G.target = 1;
        G.selected = [G.hand[0].id];
        Game.commitHand(G, Game.scoreSelected(G));
      }
      if (G.phase === 'round_end') Game.leaveCashout(G);
      if (G.phase === 'pack') Game.closePack(G);
      if (G.phase === 'shop') Game.leaveShop(G);

      assert.ok(Number.isFinite(G.money), `${def.key}: money is ${G.money}`);
      assert.ok(G.deck.length > 0, `${def.key}: deck emptied`);

      // Selling must not throw even for jokers with sell-time behaviour.
      if (G.jokers.length) Game.sellJoker(G, G.jokers[0].id);
    } catch (err) {
      broken.push(`${def.key}: ${err.message}`);
    }
  }

  assert.equal(broken.length, 0, '\n    ' + broken.join('\n    '));
});

test('every consumable applies without crashing', () => {
  const broken = [];
  for (const def of CONSUMABLES) {
    try {
      const G = Game.newRun({ seed: 'CONSUME-' + def.key });
      G.jokers = [makeJoker('jester'), makeJoker('duo')];
      Game.recompute(G);
      Game.startBlind(G);
      G.money = 30;
      G.stats.lastConsumable = 'mercury';       // so The Fool has a target

      const item = makeConsumable(def.key);
      G.consumables = [item];
      if (def.sel.max > 0) G.selected = G.hand.slice(0, def.sel.max).map((c) => c.id);

      const blocked = Game.consumableBlocker(G, item);
      assert.equal(blocked, null, `blocked: ${blocked}`);
      const out = Game.useConsumable(G, item.id);
      assert.ok(out, 'no result');
      assert.ok(Number.isFinite(G.money), `money is ${G.money}`);
      assert.ok(G.deck.length >= 0);
      for (const c of G.deck) {
        assert.ok(c.id, 'every card needs an id');
        assert.ok(c.enhancement === 'stone' || (c.rank >= 2 && c.rank <= 14), `bad rank ${c.rank}`);
      }
      // The board must still be playable afterwards.
      if (G.phase === 'playing' && G.hand.length) {
        G.selected = G.hand.slice(0, Math.min(5, G.hand.length)).map((c) => c.id);
        const res = Game.scoreSelected(G);
        assert.ok(Number.isFinite(res.total), `score after ${def.key} is ${res.total}`);
      }
    } catch (err) {
      broken.push(`${def.key}: ${err.message}`);
    }
  }
  assert.equal(broken.length, 0, '\n    ' + broken.join('\n    '));
});

test('every boss blind produces a playable round', () => {
  const broken = [];
  for (const b of [...BOSSES, ...FINISHERS]) {
    try {
      const G = Game.newRun({ seed: 'BOSS-' + b.key });
      G.blindIndex = 2;
      G.bossKey = b.key;
      G.jokers = [makeJoker('jester')];
      Game.startBlind(G);
      assert.ok(G.hand.length > 0, 'no cards dealt');
      assert.ok(G.hands >= 1, 'no hands available');
      assert.ok(G.target > 0, 'no target');

      const flags = b.flags ?? {};
      const size = flags.mustPlay ?? Math.min(5, G.hand.length);
      G.selected = G.hand.slice(0, size).map((c) => c.id);
      assert.equal(Game.playBlocker(G), null, `play blocked: ${Game.playBlocker(G)}`);
      const out = Game.scoreSelected(G);
      assert.ok(Number.isFinite(out.total), `total is ${out.total}`);
      Game.commitHand(G, out);
      assert.ok(['playing', 'round_end', 'game_over'].includes(G.phase), `phase ${G.phase}`);
    } catch (err) {
      broken.push(`${b.key}: ${err.message}`);
    }
  }
  assert.equal(broken.length, 0, '\n    ' + broken.join('\n    '));
});

// ----------------------------------------------------------------- balance --

test('a realistic late-run build can clear the Ante 8 boss', () => {
  const G = Game.newRun({ seed: 'ENDGAME' });
  Game.startBlind(G);
  G.handLevels.flush.level = 15;
  // Flat bonuses first, multiplicative last — the ordering a real player builds.
  G.jokers = [makeJoker('crafty'), makeJoker('droll'), makeJoker('tribe'), makeJoker('hologram', 'poly')];
  G.jokers[3].state.n = 8;                       // grown over a run of added cards
  const hand = [14, 13, 12, 11, 9].map((r) => C(r, 'H'));
  G.hand = hand;
  G.selected = hand.map((c) => c.id);
  Game.recompute(G);

  const out = Game.scoreSelected(G);
  const bossTarget = blindTarget(8, 2);
  assert.equal(bossTarget, 100000);
  assert.ok(out.total > bossTarget,
    `a tuned build should beat ${bossTarget} in one hand, got ${out.total}`);
});

test('joker order rewards putting multipliers last', () => {
  const hand = [14, 13, 12, 11, 9].map((r) => C(r, 'H'));
  const mk = (keys) => {
    const G = Game.newRun({ seed: 'ORDER' });
    Game.startBlind(G);
    G.handLevels.flush.level = 5;
    G.jokers = keys.map((k) => makeJoker(k));
    G.hand = hand.map((c) => ({ ...c }));
    G.selected = G.hand.map((c) => c.id);
    Game.recompute(G);
    return Game.scoreSelected(G).total;
  };
  assert.ok(mk(['droll', 'tribe']) > mk(['tribe', 'droll']),
    'adding Mult before multiplying it must score higher');
});

// ------------------------------------------------------------------- report --

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error('  ✗ ' + f);
process.exit(failures.length ? 1 : 0);
