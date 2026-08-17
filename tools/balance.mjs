// Balance probe: a greedy-but-sensible bot plays full runs so we can see
// whether the difficulty curve is actually beatable.
// Usage: node tools/balance.mjs [runs]

import { makeRng, seedFromString } from '../js/util.js';
import { evaluate, handStats, HAND_BY_KEY } from '../js/poker.js';
import { baseChips, isStone } from '../js/cards.js';
import { JOKER_BY_KEY } from '../js/jokers.js';
import { CONSUMABLE_BY_KEY } from '../js/consumables.js';
import * as Game from '../js/game.js';

const RUNS = Number(process.argv[2] ?? 120);

/** Static value of a candidate hand — ignores jokers, but ranks plays well. */
function staticValue(G, pick, rules) {
  const { key, scoring } = evaluate(pick, rules);
  const st = handStats(key, G.handLevels);
  let chips = st.chips;
  for (const c of scoring) {
    if (c.debuffed) continue;
    chips += baseChips(c);
    if (c.enhancement === 'bonus') chips += 30;
  }
  let mult = st.mult;
  for (const c of scoring) {
    if (c.debuffed) continue;
    if (c.enhancement === 'mult') mult += 4;
    if (c.enhancement === 'glass') mult *= 2;
  }
  return chips * mult;
}

function candidates(G) {
  const rules = Game.activeRules(G);
  const flags = Game.activeBoss(G)?.flags ?? {};
  const cards = G.hand;
  const n = Math.min(cards.length, 9);
  const out = [];
  for (let mask = 1; mask < (1 << n); mask++) {
    const pick = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) pick.push(cards[i]);
    if (pick.length > 5) continue;
    if (flags.mustPlay && pick.length !== flags.mustPlay) continue;
    const key = evaluate(pick, rules).key;
    if (flags.noRepeatHand && G.roundHands.includes(key)) continue;
    if (flags.singleHandType && G.roundHands.length && G.roundHands[0] !== key) continue;
    out.push({ pick, key, value: staticValue(G, pick, rules) });
  }
  out.sort((a, b) => b.value - a.value);
  return out;
}

/** Keep pair/flush/straight material, pitch the rest. */
function discardChoice(G, best) {
  const keep = new Set(best ? best.pick.map((c) => c.id) : []);
  const live = G.hand.filter((c) => !isStone(c));

  // Keep whichever suit we hold most of — the cheapest route to a flush.
  const suitCounts = {};
  for (const c of live) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1;
  const topSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0];
  if (topSuit && topSuit[1] >= 3) for (const c of live) if (c.suit === topSuit[0]) keep.add(c.id);

  // Keep every card that is part of a pair or better.
  const rankCounts = {};
  for (const c of live) rankCounts[c.rank] = (rankCounts[c.rank] ?? 0) + 1;
  for (const c of live) if (rankCounts[c.rank] >= 2) keep.add(c.id);

  return G.hand.filter((c) => !keep.has(c.id)).slice(0, 5);
}

const jokerScore = (def) => {
  // Prefer multiplicative jokers, then flat mult, then chips.
  const src = String(def.ind ?? def.scored ?? def.held ?? '');
  let v = def.rarity * 10;
  if (src.includes('xmult')) v += 60;
  else if (src.includes('mult')) v += 30;
  else if (src.includes('chips')) v += 12;
  if (def.retrigger || def.retriggerHeld) v += 35;
  if (def.copyOf) v += 45;
  return v;
};

function shopTurn(G, rng) {
  const RESERVE = G.ante <= 3 ? 12 : 6;   // hoard early for interest
  let guard = 0;

  while (guard++ < 14) {
    let acted = false;

    for (const item of G.shop.items.slice()) {
      const price = Game.itemPrice(G, item);
      if (G.money - price < (item.kind === 'joker' ? 0 : RESERVE)) continue;

      if (item.kind === 'joker') {
        const incoming = JOKER_BY_KEY[item.payload.key];
        if (!Game.hasJokerRoom(G, item.payload)) {
          // Swap out our weakest joker if the new one is clearly better.
          const weakest = G.jokers
            .map((j) => ({ j, s: jokerScore(JOKER_BY_KEY[j.key]) }))
            .sort((a, b) => a.s - b.s)[0];
          if (weakest && jokerScore(incoming) > weakest.s + 20) Game.sellJoker(G, weakest.j.id);
          else continue;
        }
        if (Game.buyItem(G, item.id).ok) acted = true;
        continue;
      }

      if (item.kind === 'consumable') {
        const def = CONSUMABLE_BY_KEY[item.payload.key];
        if (def.type !== 'planet') continue;              // planets are the reliable buy
        if (G.consumables.length >= G.derived.consumableSlots) continue;
        if (Game.buyItem(G, item.id).ok) acted = true;
      }
    }

    // Cash planets in on whatever we actually play.
    for (const u of G.consumables.slice()) {
      const def = CONSUMABLE_BY_KEY[u.key];
      if (def.type === 'planet' && !Game.consumableBlocker(G, u)) {
        Game.useConsumable(G, u.id);
        acted = true;
      }
    }

    const voucher = G.shop.vouchers[0];
    if (voucher && G.money - Game.itemPrice(G, { cost: 10 }) >= RESERVE) {
      if (Game.buyVoucher(G, voucher.id).ok) acted = true;
    }

    // Celestial packs are the cheapest permanent power in the game.
    const pack = G.shop.packs.find((p) => p.packKey.startsWith('celestial') || p.packKey.startsWith('buffoon'));
    if (pack && G.money - Game.itemPrice(G, pack) >= RESERVE) {
      if (Game.buyPack(G, pack.id).ok) return;
    }

    if (!acted) break;
    void rng;
  }
  Game.leaveShop(G);
}

function playRun(seed) {
  const rng = makeRng(seedFromString('bal' + seed));
  const G = Game.newRun({ seed: `B${seed}` });
  let actions = 0;

  while (actions++ < 6000) {
    switch (G.phase) {
      case 'blind_select':
        if (G.ante > 8) return { result: 'endless', ante: G.ante, G };
        Game.startBlind(G);
        break;

      case 'playing': {
        const list = candidates(G);
        const best = list[0];
        const need = G.target - G.score;

        // Only spend a discard when the board cannot finish the job anyway.
        if (G.discards > 0 && best && best.value * G.hands < need * 1.15) {
          const junk = discardChoice(G, best);
          if (junk.length) {
            G.selected = junk.map((c) => c.id);
            Game.discardSelected(G);
            break;
          }
        }
        if (!best) {
          if (!G.hand.length) { G.phase = 'game_over'; break; }
          G.selected = [G.hand[0].id];
        } else {
          G.selected = best.pick.map((c) => c.id);
        }
        if (Game.playBlocker(G)) { G.phase = 'game_over'; break; }
        Game.commitHand(G, Game.scoreSelected(G));
        break;
      }

      case 'round_end':
        Game.leaveCashout(G);
        break;

      case 'shop':
        shopTurn(G, rng);
        break;

      case 'pack': {
        const p = G.pack;
        let guard = 0;
        while (G.phase === 'pack' && p.options.length && guard++ < 8) {
          // Prefer jokers, then planets for our most-played hand.
          const sorted = p.options.slice().sort((a, b) => {
            const rank = (o) => (o.kind === 'joker' ? 2 : o.kind === 'consumable' ? 1 : 0);
            return rank(b) - rank(a);
          });
          if (!Game.pickFromPack(G, sorted[0].id).ok) break;
        }
        if (G.phase === 'pack') Game.closePack(G);
        break;
      }

      case 'game_over':
        return {
          result: 'loss', ante: G.ante, G,
          why: `blind=${G.blindIndex} boss=${G.bossKey ?? '-'} score=${G.score}/${G.target} jokers=${G.jokers.length} money=${G.money}`,
        };
      case 'win':
        return { result: 'win', ante: G.ante, G };
      default:
        throw new Error('bad phase ' + G.phase);
    }
  }
  return { result: 'stuck', ante: G.ante, G };
}

const hist = {};
const reasons = [];
let wins = 0, best = 0, bestHand = 0;
const failures = [];

for (let i = 0; i < RUNS; i++) {
  try {
    const { result, ante, G, why } = playRun(i);
    if (result === 'loss') reasons.push(`ante ${ante} ${why}`);
    hist[ante] = (hist[ante] ?? 0) + 1;
    if (result === 'win' || result === 'endless') wins++;
    best = Math.max(best, ante);
    bestHand = Math.max(bestHand, G.stats.bestHandScore);
  } catch (err) {
    failures.push(`seed ${i}: ${err.message}`);
  }
}

console.log('=== balance probe (greedy bot) ===');
console.log(`runs        ${RUNS}`);
console.log(`wins        ${wins} (${((wins / RUNS) * 100).toFixed(0)}%)`);
console.log(`best ante   ${best}`);
console.log(`best hand   ${bestHand.toLocaleString()}`);
const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
console.log('died on ante ' + keys.map((a) => `${a}:${hist[a]}`).join('  '));
const byBlind = {};
for (const r of reasons) { const b = r.match(/blind=(\d)/)[1]; byBlind[b] = (byBlind[b] ?? 0) + 1; }
console.log('died on blind ' + Object.entries(byBlind).map(([b, n]) => `${['small','big','boss'][b]}:${n}`).join('  '));
console.log('\nsample deaths:');
for (const r of reasons.slice(0, 12)) console.log('  ' + r);
if (failures.length) {
  console.error(`\n${failures.length} failures`);
  for (const f of failures.slice(0, 10)) console.error('  ✗ ' + f);
  process.exit(1);
}
