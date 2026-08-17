// Fuzz the engine by botting whole runs. Surfaces crashes, NaNs and soft locks
// that unit tests miss. Usage: node tools/simulate.mjs [runs] [--verbose]

import { makeRng, seedFromString } from '../js/util.js';
import { evaluate, HAND_BY_KEY } from '../js/poker.js';
import { JOKERS, makeJoker } from '../js/jokers.js';
import { CONSUMABLES, CONSUMABLE_BY_KEY, makeConsumable } from '../js/consumables.js';
import { DECKS } from '../js/decks.js';
import * as Game from '../js/game.js';

const RUNS = Number(process.argv[2] ?? 100);
const VERBOSE = process.argv.includes('--verbose');

const MAX_ACTIONS = 4000;
const stats = {
  runs: 0, wins: 0, losses: 0, stuck: 0, errors: [],
  maxAnte: 0, maxScore: 0, hands: 0, anteHist: {},
  jokersSeen: new Set(), consumablesSeen: new Set(), bossesSeen: new Set(), packsOpened: 0,
};

/** Pick the highest-scoring legal hand from the current board. */
function bestPlay(G) {
  const rules = Game.activeRules(G);
  const flags = Game.activeBoss(G)?.flags ?? {};
  const cards = G.hand;
  let best = null;

  // Try every subset up to 5 cards; hands are small enough to brute force.
  const n = Math.min(cards.length, 8);
  for (let mask = 1; mask < (1 << n); mask++) {
    const pick = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) pick.push(cards[i]);
    if (pick.length > 5) continue;
    if (flags.mustPlay && pick.length !== flags.mustPlay) continue;
    const key = evaluate(pick, rules).key;
    if (flags.noRepeatHand && G.roundHands.includes(key)) continue;
    if (flags.singleHandType && G.roundHands.length && G.roundHands[0] !== key) continue;
    const order = HAND_BY_KEY[key].order;
    const chips = pick.reduce((s, c) => s + (c.debuffed ? 0 : 1), 0);
    const score = order * 100 + chips * 3 + pick.length;
    if (!best || score > best.score) best = { pick, score };
  }
  return best?.pick ?? null;
}

function simulate(seed, deckKey) {
  const rng = makeRng(seedFromString('sim' + seed));
  const G = Game.newRun({ seed: `S${seed}`, deckKey });
  let actions = 0;

  while (actions++ < MAX_ACTIONS) {
    switch (G.phase) {
      case 'blind_select': {
        if (G.ante > 12) return 'endless-cap';
        if (Game.canSkipBlind(G) && rng.chance(1, 5)) { Game.skipBlind(G); break; }
        Game.startBlind(G);
        if (G.bossKey) stats.bossesSeen.add(G.bossKey);
        break;
      }

      case 'playing': {
        maybeUseConsumable(G, rng);
        if (G.phase !== 'playing') break;

        // Discard the worst cards while we still can and the hand looks weak.
        const play = bestPlay(G);
        const need = G.target - G.score;
        if (G.discards > 0 && rng.chance(2, 5) && G.hand.length > 3) {
          const keep = new Set((play ?? []).map((c) => c.id));
          const junk = G.hand.filter((c) => !keep.has(c.id)).slice(0, 4);
          if (junk.length) {
            G.selected = junk.map((c) => c.id);
            Game.discardSelected(G);
            break;
          }
        }
        if (!play) {
          // Nothing legal to play — take any single card so the round resolves.
          if (!G.hand.length) { G.hands = 0; G.phase = 'game_over'; break; }
          G.selected = [G.hand[0].id];
        } else {
          G.selected = play.map((c) => c.id);
        }
        if (Game.playBlocker(G)) { G.selected = [G.hand[0].id]; }
        if (Game.playBlocker(G)) { G.phase = 'game_over'; break; }

        const result = Game.scoreSelected(G);
        assertFinite(result, G, seed);
        Game.commitHand(G, result);
        stats.hands++;
        stats.maxScore = Math.max(stats.maxScore, result.total);
        void need;
        break;
      }

      case 'round_end':
        Game.leaveCashout(G);
        break;

      case 'shop': {
        shopTurn(G, rng);
        break;
      }

      case 'pack': {
        stats.packsOpened++;
        const p = G.pack;
        let guard = 0;
        while (G.phase === 'pack' && p.options.length && guard++ < 10) {
          const opt = rng.pick(p.options);
          if (opt.kind === 'consumable') stats.consumablesSeen.add(opt.payload.key);
          if (opt.kind === 'joker') stats.jokersSeen.add(opt.payload.key);
          const out = Game.pickFromPack(G, opt.id);
          if (!out.ok) break;
        }
        if (G.phase === 'pack') Game.closePack(G);
        break;
      }

      case 'game_over':
        stats.losses++;
        stats.maxAnte = Math.max(stats.maxAnte, G.ante);
        stats.anteHist[G.ante] = (stats.anteHist[G.ante] ?? 0) + 1;
        return 'loss';

      case 'win':
        stats.wins++;
        stats.maxAnte = Math.max(stats.maxAnte, G.ante);
        stats.anteHist[G.ante] = (stats.anteHist[G.ante] ?? 0) + 1;
        return 'win';

      default:
        throw new Error(`unknown phase ${G.phase}`);
    }
  }
  stats.stuck++;
  return `stuck in ${G.phase} (ante ${G.ante}, blind ${G.blindIndex})`;
}

function maybeUseConsumable(G, rng) {
  if (!G.consumables.length || !rng.chance(1, 3)) return;
  const item = rng.pick(G.consumables);
  const def = CONSUMABLE_BY_KEY[item.key];
  if (def.sel?.max > 0) {
    G.selected = G.hand.slice(0, def.sel.max).map((c) => c.id);
  }
  if (Game.consumableBlocker(G, item)) { G.selected = []; return; }
  stats.consumablesSeen.add(item.key);
  Game.useConsumable(G, item.id);
  G.selected = [];
}

function shopTurn(G, rng) {
  let guard = 0;
  while (guard++ < 12) {
    const affordable = G.shop.items.filter((i) => Game.itemPrice(G, i) <= G.money);
    if (affordable.length && rng.chance(3, 4)) {
      const item = rng.pick(affordable);
      if (item.kind === 'joker') stats.jokersSeen.add(item.payload.key);
      if (item.kind === 'consumable') stats.consumablesSeen.add(item.payload.key);
      const out = Game.buyItem(G, item.id);
      if (!out.ok) {
        // Slots are full — sell something to keep the churn going.
        if (G.jokers.length && rng.chance(1, 2)) Game.sellJoker(G, rng.pick(G.jokers).id);
        else break;
      }
      continue;
    }
    const packs = G.shop.packs.filter((p) => Game.itemPrice(G, p) <= G.money);
    if (packs.length && rng.chance(1, 2)) { Game.buyPack(G, rng.pick(packs).id); return; }

    const vouchers = G.shop.vouchers.filter(() => true);
    if (vouchers.length && rng.chance(1, 3)) { Game.buyVoucher(G, rng.pick(vouchers).id); continue; }

    if (rng.chance(1, 6)) { if (!Game.rerollShop(G)) break; continue; }
    break;
  }
  Game.leaveShop(G);
}

function assertFinite(result, G, seed) {
  const bad = [result.total, result.chips, result.mult].some((v) => !Number.isFinite(v));
  if (bad) throw new Error(`non-finite score on seed ${seed}: chips=${result.chips} mult=${result.mult}`);
  if (result.total < 0) throw new Error(`negative score on seed ${seed}`);
  if (!Number.isFinite(G.money)) throw new Error(`non-finite money on seed ${seed}`);
}

// ------------------------------------------------------------------- driver --

const deckKeys = DECKS.map((d) => d.key);
for (let i = 0; i < RUNS; i++) {
  const deckKey = deckKeys[i % deckKeys.length];
  try {
    const outcome = simulate(i, deckKey);
    stats.runs++;
    if (VERBOSE) console.log(`run ${i} (${deckKey}): ${outcome}`);
  } catch (err) {
    stats.errors.push(`seed ${i} deck ${deckKey}: ${err.message}\n${err.stack?.split('\n')[1] ?? ''}`);
  }
}

const allJokers = JOKERS.filter((j) => !j.noShop && !j.legendary).map((j) => j.key);
const unseenJokers = allJokers.filter((k) => !stats.jokersSeen.has(k));
const unseenConsumables = CONSUMABLES.map((c) => c.key).filter((k) => !stats.consumablesSeen.has(k));

console.log('\n=== simulation ===');
console.log(`runs         ${stats.runs}/${RUNS}`);
console.log(`wins         ${stats.wins}`);
console.log(`losses       ${stats.losses}`);
console.log(`stuck        ${stats.stuck}`);
console.log(`hands played ${stats.hands}`);
console.log(`best hand    ${stats.maxScore.toLocaleString()}`);
console.log(`packs opened ${stats.packsOpened}`);
console.log(`jokers seen  ${stats.jokersSeen.size}/${allJokers.length}`);
console.log(`consumables  ${stats.consumablesSeen.size}/${CONSUMABLES.length}`);
console.log(`bosses seen  ${stats.bossesSeen.size}`);
console.log(`best ante    ${stats.maxAnte}`);
const hist = Object.keys(stats.anteHist).map(Number).sort((a, b) => a - b);
console.log('ante reached ' + hist.map((a) => `${a}:${stats.anteHist[a]}`).join('  '));
if (unseenJokers.length) console.log(`  untested jokers: ${unseenJokers.join(', ')}`);
if (unseenConsumables.length) console.log(`  untested consumables: ${unseenConsumables.join(', ')}`);

if (stats.errors.length) {
  console.error(`\n${stats.errors.length} ERRORS`);
  const unique = [...new Set(stats.errors.map((e) => e.split('\n')[0].replace(/seed \d+ /, '')))];
  for (const e of unique.slice(0, 25)) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('\nno crashes');
void makeJoker;
