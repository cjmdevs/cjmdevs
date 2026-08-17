// Rendering and input. Owns the DOM; game.js owns the rules.

import { $, el, fmt, money as $m, sleep, clamp } from './util.js';
import { SUITS, RANK_LABEL, ENHANCEMENTS, EDITIONS, SEALS, isStone, cardLabel, sellValue } from './cards.js';
import { DISPLAY_HANDS, HAND_BY_KEY, handStats, evaluate } from './poker.js';
import { JOKER_BY_KEY, jokerText, RARITY } from './jokers.js';
import { CONSUMABLE_BY_KEY, consumableText } from './consumables.js';
import { BLIND_SLOTS, BOSS_BY_KEY, blindTarget, TAG_BY_KEY } from './blinds.js';
import { VOUCHER_BY_KEY, PACK_BY_KEY, rerollCost } from './shop.js';
import { DECKS, DECK_BY_KEY } from './decks.js';
import * as Game from './game.js';
import * as Save from './save.js';
import { sfx, buzz, unlock, setEnabled, setHaptics } from './audio.js';
import { jokerFace, consumableArt, packArt, cardBack, suitPip, icon } from './art.js';
import * as Anim from './anim.js';
import { startTutorial, hasSeenTutorial, markTutorialSeen } from './tutorial.js';

// --------------------------------------------------------------- element refs

const dom = {};
const ids = [
  'app', 'topbar', 'blind-chip', 'scoreline', 'score-value', 'score-fill',
  'jokers', 'consumables', 'played', 'calc', 'calc-chips', 'calc-mult', 'hand-name',
  'hud-hands', 'hud-discards', 'hud-money', 'hud-ante', 'hud-round',
  'hand', 'btn-play', 'btn-discard', 'btn-sort-rank', 'btn-sort-suit',
  'btn-menu', 'btn-info', 'overlay', 'fx', 'toast', 'tip', 'deck-count',
  'pile-draw', 'pile-discard',
];

let G = null;
let settings = Save.defaultSettings;
let busy = false;          // true while a scoring animation is running
let screen = 'menu';       // 'menu' | 'game'
let shownCardIds = new Set();   // cards already dealt, so only new ones fly in
let tutorial = null;

// -------------------------------------------------------------------- boot --

export function boot() {
  for (const id of ids) dom[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
  settings = Save.loadSettings();
  setEnabled(settings.sound);
  setHaptics(settings.haptics);
  wireControls();
  window.addEventListener('resize', layoutHand);
  installTestHooks();
  const saved = Save.loadRun();
  if (saved) { G = saved; screen = 'game'; render(); }
  else showMenu();
}

/**
 * Hooks for tools/uitest.mjs so the browser smoke test can reach states that
 * would otherwise take a dozen lucky hands. Single-player and offline, so an
 * exposed debug surface costs nothing.
 */
function installTestHooks() {
  window.__test = {
    seed: () => G?.seed ?? null,
    state: () => G,
    giveMoney: (n) => { if (G) { G.money += n; render(); } },
    giveJokers: (keys) => {
      if (!G) return;
      G.jokers = keys.map((k) => Game.makeTestJoker(k));
      render();
    },
    forceWin: () => {
      if (!G || G.phase !== 'playing') return false;
      G.target = 1;
      G.selected = [G.hand[0].id];
      Game.commitHand(G, Game.scoreSelected(G));
      render();
      return true;
    },
  };
}

function wireControls() {
  dom.btnPlay.addEventListener('click', onPlay);
  dom.btnDiscard.addEventListener('click', onDiscard);
  dom.btnSortRank.addEventListener('click', () => { Game.sortHand(G, 'rank'); sfx.tap(); render(); });
  dom.btnSortSuit.addEventListener('click', () => { Game.sortHand(G, 'suit'); sfx.tap(); render(); });
  dom.btnMenu.addEventListener('click', () => { sfx.tap(); showPauseMenu(); });
  dom.btnInfo.addEventListener('click', () => { sfx.tap(); showRunInfo(); });
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('pointerdown', (e) => {
    if (!dom.tip.hidden && !e.target.closest('.tip')) hideTip();
  });
}

// ------------------------------------------------------------ card builders --

function cardEl(card, opts = {}) {
  const stone = isStone(card);
  const suit = SUITS[card.suit];
  const node = el('div.card', {
    'data-id': card.id,
    'data-color': stone ? 'stone' : suit.color,
    'data-enh': card.enhancement || null,
    'data-ed': card.edition || null,
  });
  if (card.faceDown && !opts.reveal) {
    node.classList.add('facedown');
    node.innerHTML = cardBack();
    return node;
  }
  if (!stone) {
    const hue = suit.color === 'red' ? '#ef476f' : '#12161c';
    node.appendChild(el('span.rank', { text: RANK_LABEL[card.rank] }));
    node.appendChild(el('span.pip-sm', { html: suitPip(card.suit, hue) }));
    node.appendChild(el('span.pip-lg', { html: suitPip(card.suit, hue) }));
  } else {
    node.appendChild(el('span.pip-lg', { html: icon('chip', '#3d4358') }));
  }
  if (card.seal) node.appendChild(el('div.seal', { 'data-seal': card.seal }));
  if (card.debuffed) node.classList.add('debuffed');
  return node;
}

function jokerEl(j, opts = {}) {
  const def = JOKER_BY_KEY[j.key];
  const node = el('div.joker', {
    'data-id': j.id,
    'data-rarity': def.rarity,
    'data-ed': j.edition || null,
  }, [
    el('div.jname', { text: def.name }),
    el('div.jart', { html: jokerFace(j.key, RARITY[def.rarity].color) }),
  ]);
  if (opts.disabled) node.classList.add('off');
  return node;
}

function consumableEl(item) {
  const def = CONSUMABLE_BY_KEY[item.key];
  return el('div.consumable', { 'data-id': item.id, 'data-type': def.type }, [
    el('div.cicon', { html: consumableArt(def.type) }),
    el('div.cname', { text: def.name }),
  ]);
}

// ------------------------------------------------------------------ render --

export function render() {
  if (!G) return;
  Game.recompute(G);
  renderTop();
  renderTrays();
  renderHand();
  renderPlayed();
  renderOverlay();
  Save.saveRun(G);
}

function renderTop() {
  const slot = BLIND_SLOTS[G.blindIndex];
  const boss = G.blindIndex === 2 ? BOSS_BY_KEY[G.bossKey] : null;
  const disabled = G.blindIndex === 2 && !Game.activeBoss(G);
  const target = G.phase === 'playing' ? G.target : Game.currentTarget(G);

  dom.blindChip.classList.toggle('boss', G.blindIndex === 2);
  $('.blind-name', dom.blindChip).textContent = boss ? `${boss.name}${disabled ? ' (off)' : ''}` : slot.name;
  $('.blind-target', dom.blindChip).textContent = fmt(target);

  dom.scoreValue.textContent = fmt(G.score);
  dom.scoreFill.style.width = `${clamp((G.score / Math.max(1, target)) * 100, 0, 100)}%`;

  dom.hudHands.textContent = G.hands;
  dom.hudDiscards.textContent = G.discards;
  dom.hudMoney.textContent = $m(G.money);
  dom.hudAnte.textContent = `${G.ante}/${Game.WIN_ANTE}`;
  dom.hudRound.textContent = G.round;
  dom.deckCount.textContent = `${G.drawPile.length}/${G.deck.length}`;

  const blocked = G.phase !== 'playing' || busy;
  dom.btnPlay.disabled = blocked || !!Game.playBlocker(G);
  dom.btnDiscard.disabled = blocked || !!Game.discardBlocker(G);
}

function renderTrays() {
  dom.jokers.replaceChildren();
  for (const j of G.jokers) {
    const node = jokerEl(j, { disabled: j.id === G.disabledJokerId });
    attachInspect(node, () => jokerTip(j));
    dom.jokers.appendChild(node);
  }
  for (let i = G.jokers.length; i < G.derived.jokerSlots; i++) {
    dom.jokers.appendChild(el('div.slot-empty'));
  }

  dom.consumables.replaceChildren();
  for (const u of G.consumables) {
    const node = consumableEl(u);
    attachInspect(node, () => consumableTip(u), () => useConsumable(u));
    dom.consumables.appendChild(node);
  }
  for (let i = G.consumables.length; i < G.derived.consumableSlots; i++) {
    dom.consumables.appendChild(el('div.slot-empty', { style: { width: 'calc(var(--card-w) * 0.8)' } }));
  }
}

function renderHand() {
  const fresh = [];
  dom.hand.replaceChildren();
  for (const c of G.hand) {
    const node = cardEl(c);
    if (G.selected.includes(c.id)) node.classList.add('sel');
    if (c.id === G.forcedCardId) node.classList.add('forced');
    attachInspect(node, () => cardTip(c), () => {
      if (busy || G.phase !== 'playing') return;
      const was = G.selected.includes(c.id);
      Game.toggleSelect(G, c.id);
      if (G.selected.includes(c.id) !== was) { was ? sfx.deselect() : sfx.select(); buzz(6); }
      renderHand();
      renderTop();
      renderHandName();
    });
    dom.hand.appendChild(node);
    if (!shownCardIds.has(c.id)) fresh.push(node);
  }
  shownCardIds = new Set(G.hand.map((c) => c.id));
  layoutHand();
  renderHandName();

  // Only cards that were not on screen a moment ago get the dealing arc.
  if (fresh.length && G.phase === 'playing') {
    const deck = dom.pileDraw.getBoundingClientRect();
    Anim.dealIn(fresh, { from: { left: deck.left, top: deck.top }, stagger: 40 });
    sfx.deal();
  }
}

/**
 * Fan the hand so it always fits the screen width.
 * Measured against the viewport rather than the row: the row's own width can be
 * inflated by the very cards being measured, which would feed back positively.
 */
function layoutHand() {
  const n = G?.hand.length ?? 0;
  if (n < 2) { document.documentElement.style.setProperty('--hand-overlap', '2px'); return; }

  const viewport = document.documentElement.clientWidth;
  const avail = Math.min(dom.hand.clientWidth, viewport) - 8;
  const cw = dom.hand.firstElementChild?.getBoundingClientRect().width || 50;
  const natural = n * cw + (n - 1) * 2;

  const overlap = natural <= avail ? 2 : (avail - n * cw) / (n - 1);
  // Never stack cards so tightly that a rank is unreadable or untappable.
  const clamped = Math.max(-cw * 0.62, Math.min(2, overlap));
  document.documentElement.style.setProperty('--hand-overlap', `${clamped}px`);
}

function renderHandName() {
  const sel = Game.selectedCards(G);
  if (!sel.length || G.phase !== 'playing') { dom.handName.textContent = ''; return; }
  const key = evaluate(sel, Game.activeRules(G)).key;
  const st = handStats(key, G.handLevels);
  dom.handName.innerHTML =
    `${HAND_BY_KEY[key].name} <span class="lvl">Lv.${st.level}</span> · ` +
    `<span class="c-chips">${st.chips}</span> × <span class="c-mult">${st.mult}</span>`;
}

function renderPlayed() {
  dom.played.replaceChildren();
  for (const c of G.playedZone) dom.played.appendChild(cardEl(c, { reveal: true }));
  renderPiles();
}

/** Card stacks in the table corners: what is left to draw, and what is spent. */
function renderPiles() {
  const stack = (n, faceUp) => {
    const wrap = el('div.stack');
    // Three offset slabs is enough to read as a pile at this size.
    const layers = Math.min(3, Math.max(n > 0 ? 1 : 0, Math.ceil(n / 12)));
    for (let i = layers - 1; i >= 0; i--) {
      const layer = faceUp
        ? el('div.slab', { style: { transform: `translate(${i * 2}px, ${-i * 2}px)` } })
        : el('div', { html: cardBack(), style: { transform: `translate(${i * 2}px, ${-i * 2}px)` } });
      wrap.appendChild(layer);
    }
    return wrap;
  };

  dom.pileDraw.replaceChildren(stack(G.drawPile.length, false), el('div.count', { text: String(G.drawPile.length) }));
  dom.pileDraw.classList.toggle('empty', G.drawPile.length === 0);

  const spent = G.discardPile.length;
  dom.pileDiscard.replaceChildren(stack(spent, true), el('div.count', { text: String(spent) }));
  dom.pileDiscard.classList.toggle('empty', spent === 0);
}

// -------------------------------------------------------------- inspection --

/** Tap fires `onTap`; press-and-hold (or tap with no handler) opens the tip. */
function attachInspect(node, tipFn, onTap) {
  let timer = null;
  let moved = false;
  let held = false;

  const start = (e) => {
    moved = false;
    held = false;
    timer = setTimeout(() => {
      held = true;
      buzz(10);
      showTip(node, tipFn());
    }, 380);
    void e;
  };
  const move = () => { moved = true; clearTimeout(timer); };
  const end = () => {
    clearTimeout(timer);
    if (held || moved) return;
    if (onTap) onTap();
    else showTip(node, tipFn());
  };

  node.addEventListener('pointerdown', start);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', () => clearTimeout(timer));
  node.addEventListener('contextmenu', (e) => e.preventDefault());
}

function showTip(anchor, content) {
  dom.tip.replaceChildren(content);
  dom.tip.hidden = false;
  const r = anchor.getBoundingClientRect();
  const t = dom.tip.getBoundingClientRect();
  let left = r.left + r.width / 2 - t.width / 2;
  left = clamp(left, 8, window.innerWidth - t.width - 8);
  let top = r.top - t.height - 8;
  if (top < 8) top = r.bottom + 8;
  dom.tip.style.left = `${left}px`;
  dom.tip.style.top = `${top}px`;
}

const hideTip = () => { dom.tip.hidden = true; };

function jokerTip(j) {
  const def = JOKER_BY_KEY[j.key];
  const r = RARITY[def.rarity];
  return el('div', {}, [
    el('div.tname', { text: def.name }),
    el('div.trarity', { text: r.name + (j.edition ? ` · ${EDITIONS[j.edition].name}` : ''), style: { color: r.color } }),
    el('div', { text: jokerText(j, G), style: { marginTop: '4px' } }),
    j.edition ? el('div.muted', { text: EDITIONS[j.edition].blurb }) : null,
    el('div.tsell', { text: `Sell for ${$m(sellValue(j.cost))} · hold to inspect, tap to sell in the shop` }),
  ]);
}

function consumableTip(u) {
  const def = CONSUMABLE_BY_KEY[u.key];
  return el('div', {}, [
    el('div.tname', { text: def.name }),
    el('div.trarity', { text: def.type }),
    el('div', { text: consumableText(u, G), style: { marginTop: '4px' } }),
    el('div.tsell', { text: 'Tap to use' }),
  ]);
}

function cardTip(c) {
  const bits = [];
  if (c.enhancement) bits.push(`${ENHANCEMENTS[c.enhancement].name} — ${ENHANCEMENTS[c.enhancement].blurb}`);
  if (c.edition) bits.push(`${EDITIONS[c.edition].name} — ${EDITIONS[c.edition].blurb}`);
  if (c.seal) bits.push(`${SEALS[c.seal].name} — ${SEALS[c.seal].blurb}`);
  if (c.debuffed) bits.push('Debuffed by the Boss Blind — scores nothing.');
  return el('div', {}, [
    el('div.tname', { text: cardLabel(c) }),
    bits.length ? el('div', { html: bits.join('<br>') }) : el('div.muted', { text: 'An ordinary playing card.' }),
  ]);
}

// ------------------------------------------------------------- interactions --

async function onPlay() {
  const why = Game.playBlocker(G);
  if (why) return toast(why, true);
  busy = true;
  hideTip();
  dom.btnPlay.disabled = dom.btnDiscard.disabled = true;

  // Capture where each card sits in the hand so it can fly to the table.
  const origins = new Map();
  for (const c of Game.selectedCards(G)) {
    const node = document.querySelector(`#hand [data-id="${c.id}"]`);
    if (node) { origins.set(c.id, node.getBoundingClientRect()); node.classList.add('flew'); }
  }

  const result = Game.scoreSelected(G);
  await animateScore(result, origins);
  Game.commitHand(G, result);

  busy = false;
  render();

  if (G.phase === 'round_end') {
    sfx.win();
    banner('Blind Defeated!', 'var(--good)');
    Anim.burst(dom.fx, { y: window.innerHeight * 0.42, count: 60 });
  }
  else if (G.phase === 'game_over') { sfx.lose(); Save.recordRun(G, false); }
}

async function onDiscard() {
  const why = Game.discardBlocker(G);
  if (why) return toast(why, true);
  sfx.discard();
  buzz(12);

  const doomed = Game.selectedCards(G)
    .map((c) => document.querySelector(`#hand [data-id="${c.id}"]`))
    .filter(Boolean);
  busy = true;
  await Anim.tossOut(doomed);
  for (const c of Game.selectedCards(G)) shownCardIds.delete(c.id);
  busy = false;

  Game.discardSelected(G);
  render();
}

function useConsumable(u) {
  const why = Game.consumableBlocker(G, u);
  if (why) { sfx.error(); return toast(why, true); }
  const out = Game.useConsumable(G, u.id);
  if (out.ok === false) { sfx.error(); return toast(out.msg ?? 'Cannot use that', true); }
  sfx.buy();
  buzz(14);
  toast(out.msg);
  render();
}

// --------------------------------------------------------------- animation --

async function animateScore(result, origins = new Map()) {
  const fast = settings.fastScoring;
  const beat = fast ? 55 : 130;
  dom.calc.hidden = false;

  // Move the played cards onto the table, flying each one out of the hand.
  dom.played.replaceChildren();
  const laid = result.played.map((c) => {
    const node = cardEl(c, { reveal: true });
    dom.played.appendChild(node);
    return node;
  });
  await Promise.all(laid.map((node, i) => {
    const from = origins.get(result.played[i].id);
    return from ? Anim.flipFrom(node, from, { duration: 300, delay: i * 55, spin: 8 }) : null;
  }).filter(Boolean));

  setCalc(0, 0);
  await sleep(fast ? 40 : 120);

  let step = 0;
  for (const e of result.events) {
    if (e.kind === 'total') break;
    setCalc(e.chips, e.mult);
    if (e.kind === 'base') { sfx.chip(0); await sleep(beat); continue; }

    const node = e.refId ? findRef(e.refId) : null;
    if (node) Anim.pop(node, node.classList.contains('joker') ? 1.22 : 1.16);

    for (const f of floatsFor(e)) spawnFloat(node, f.text, f.cls);
    playBeat(e, step++);
    // A multiplier landing deserves a thump.
    if (e.d?.xmult && e.d.xmult > 1) Anim.shake(dom.app, Math.min(2, e.d.xmult / 2));
    await sleep(beat);
  }

  const final = result.events[result.events.length - 1];
  setCalc(final.chips, final.mult);
  dom.calc.classList.add('bump');
  setTimeout(() => dom.calc.classList.remove('bump'), 220);
  sfx.xmult();
  buzz(20);
  await sleep(fast ? 120 : 260);

  // Slam the total into the score readout.
  const before = G.score;
  const after = before + result.total;
  Anim.shake(dom.app, clamp(result.total / Math.max(1, G.target) * 3, 0.6, 3));
  await countUp(before, after, fast ? 220 : 460);
  dom.scoreValue.classList.add('pop');
  setTimeout(() => dom.scoreValue.classList.remove('pop'), 280);
  dom.scoreFill.style.width = `${clamp((after / Math.max(1, G.target)) * 100, 0, 100)}%`;

  // Clearing the bar is worth confetti.
  if (after >= G.target) {
    const bar = dom.scoreFill.getBoundingClientRect();
    Anim.burst(dom.fx, { x: window.innerWidth / 2, y: bar.bottom, count: 40 });
  }
  await sleep(fast ? 100 : 260);
  dom.calc.hidden = true;
  for (const c of result.played) shownCardIds.delete(c.id);
}

function floatsFor(e) {
  const out = [];
  const d = e.d ?? {};
  if (d.chips) out.push({ text: `+${fmt(d.chips)}`, cls: 'chips' });
  if (d.mult) out.push({ text: `+${fmt(d.mult)}`, cls: 'mult' });
  if (d.xmult && d.xmult !== 1) out.push({ text: `×${fmt(d.xmult)}`, cls: 'mult' });
  if (d.money) out.push({ text: `+${$m(d.money)}`, cls: 'money' });
  if (e.text && !out.length) out.push({ text: e.text, cls: 'info' });
  else if (e.text && e.text !== 'again!') out.push({ text: e.text, cls: 'info' });
  return out;
}

function playBeat(e, step) {
  const d = e.d ?? {};
  if (d.xmult && d.xmult !== 1) sfx.xmult();
  else if (d.mult) sfx.mult(step);
  else if (d.chips) sfx.chip(step);
  if (d.money) sfx.money();
}

function findRef(id) {
  return document.querySelector(`#played [data-id="${id}"]`)
    || document.querySelector(`#hand [data-id="${id}"]`)
    || document.querySelector(`#jokers [data-id="${id}"]`)
    || document.querySelector(`#consumables [data-id="${id}"]`);
}

function setCalc(chips, mult) {
  dom.calcChips.textContent = fmt(Math.round(chips));
  dom.calcMult.textContent = fmt(Math.round(mult * 100) / 100);
}

function spawnFloat(anchor, text, cls) {
  const r = anchor ? anchor.getBoundingClientRect() : dom.calc.getBoundingClientRect();
  const node = el(`div.float.${cls}`, { text });
  node.style.left = `${r.left + r.width / 2}px`;
  node.style.top = `${r.top}px`;
  dom.fx.appendChild(node);
  setTimeout(() => node.remove(), 820);
}

function countUp(from, to, ms) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      dom.scoreValue.textContent = fmt(Math.round(from + (to - from) * eased));
      if (k < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

function banner(text, color) {
  const node = el('div.banner', { text, style: { color: color ?? 'var(--ink)' } });
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 1250);
}

let toastTimer = null;
function toast(msg, bad = false) {
  if (!msg) return;
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
  dom.toast.style.borderColor = bad ? 'var(--bad)' : 'var(--line)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 1700);
}

// ------------------------------------------------------------------ overlay --

function openSheet(node) {
  dom.overlay.replaceChildren(node);
  dom.overlay.hidden = false;
  // Let the grids inside cascade in rather than appearing all at once.
  requestAnimationFrame(() => {
    for (const grid of node.querySelectorAll('.shop-grid, .blind-grid, .choice-list')) {
      Anim.revealChildren(grid, { stagger: 45 });
    }
  });
}
function closeSheet() {
  dom.overlay.hidden = true;
  dom.overlay.replaceChildren();
}

function sheet({ title, right, body, footer }) {
  return el('div.sheet', {}, [
    el('header', {}, [el('h2', { text: title }), right ?? el('span')]),
    el('div.body', {}, body),
    el('footer', {}, footer ?? []),
  ]);
}

function renderOverlay() {
  if (busy) return;
  switch (G?.phase) {
    case 'blind_select': return openSheet(blindSelectSheet());
    case 'round_end': return openSheet(cashoutSheet());
    case 'shop': return openSheet(shopSheet());
    case 'pack': return openSheet(packSheet());
    case 'game_over': return openSheet(gameOverSheet());
    case 'win': return openSheet(winSheet());
    default: return closeSheet();
  }
}

// ------------------------------------------------------------- blind select --

function blindSelectSheet() {
  Game.ensureBoss(G);
  const rows = BLIND_SLOTS.map((slot, i) => {
    const isBoss = i === 2;
    const boss = isBoss ? BOSS_BY_KEY[G.bossKey] : null;
    const done = i < G.blindIndex;
    const current = i === G.blindIndex;
    const target = Math.round(blindTarget(G.ante, i, isBoss ? G.bossKey : null) * (G.mods?.blindMult ?? 1));

    return el(`div.blind-card${current ? '.current' : ''}${done ? '.done' : ''}${isBoss ? '.bossrow' : ''}`, {}, [
      el('div.blind-badge', {
        html: done ? '<span class="tick">&#10003;</span>'
          : icon(['chip', 'star', 'skull'][i], ['#41a6f6', '#ffcd75', '#ef476f'][i]),
      }),
      el('div', {}, [
        el('div.title', { text: boss ? boss.name : slot.name }),
        el('div.sub', { text: boss ? boss.desc : (i === 0 ? 'An easy opener.' : 'A little heavier.') }),
      ]),
      el('div', {}, [
        el('div.req', { text: fmt(target) }),
        el('div.reward', { text: `${'$'.repeat(slot.reward)}` }),
      ]),
    ]);
  });

  const canSkip = Game.canSkipBlind(G);
  const tagKey = G.upcomingTags?.[G.blindIndex];
  const tag = tagKey ? TAG_BY_KEY[tagKey] : null;

  const footer = [
    el('button.btn.green.wide', {
      text: `Play ${G.blindIndex === 2 ? 'Boss Blind' : BLIND_SLOTS[G.blindIndex].name}`,
      onclick: () => {
        sfx.tap();
        Game.startBlind(G);
        closeSheet();
        render();
        if (G.blindIndex === 2 && Game.activeBoss(G)) { sfx.boss(); banner(BOSS_BY_KEY[G.bossKey].name, 'var(--mult)'); }
      },
    }),
  ];
  if (canSkip) {
    footer.unshift(el('button.btn.ghost', {
      text: 'Skip',
      onclick: () => {
        sfx.tap();
        const out = Game.skipBlind(G);
        if (out?.tagKey) toast(`${TAG_BY_KEY[out.tagKey].name}${out.money ? ` · +${$m(out.money)}` : ''}`);
        render();
      },
    }));
  }

  const body = [
    el('div.blind-grid', {}, rows),
    tag && canSkip ? el('div', { style: { marginTop: '12px' } }, [
      el('h3', { text: 'Skip reward' }),
      el('div.tag-pill', { text: tag.name }),
      el('div.muted', { text: tag.desc }),
    ]) : null,
    G.tags.length ? el('div', { style: { marginTop: '12px' } }, [
      el('h3', { text: 'Tags held' }),
      ...G.tags.map((t) => el('span.tag-pill', { text: TAG_BY_KEY[t.key].name })),
    ]) : null,
    G.vouchers.has('directors_cut') && !G.bossRerolled ? el('button.btn.tiny', {
      text: 'Reroll Boss ($10)',
      style: { marginTop: '10px' },
      onclick: () => { if (Game.rerollBoss(G)) { sfx.buy(); render(); } else { sfx.error(); toast('Not enough money', true); } },
    }) : null,
  ].filter(Boolean);

  return sheet({ title: `Ante ${G.ante}`, right: el('span.muted', { text: $m(G.money) }), body, footer });
}

// ------------------------------------------------------------------ cashout --

function cashoutSheet() {
  const c = G.cashout;
  const body = [
    el('div.center', { style: { padding: '10px 0' } }, [
      el('div.big-icon', { html: icon('coin', '#ffcd75') }),
      el('div', { text: `${c.blindName} defeated`, style: { fontWeight: '900', fontSize: '17px' } }),
      el('div.muted', { text: `Scored ${fmt(G.score)} of ${fmt(G.target)}` }),
    ]),
    el('div.cash-lines', {}, c.lines.map((l) =>
      el('div.cash-line', {}, [el('span', { text: l.label }), el('span.amt', { text: $m(l.amount) })]))),
    el('div.cash-total', {}, [el('span', { text: 'Total earned' }), el('span.amt', { text: $m(c.total) })]),
  ];
  const footer = [el('button.btn.gold.wide', {
    text: 'Cash Out',
    onclick: () => { sfx.money(); Game.leaveCashout(G); render(); },
  })];
  return sheet({ title: 'Cash Out', right: el('span.muted', { text: $m(G.money) }), body, footer });
}

// --------------------------------------------------------------------- shop --

function shopSheet() {
  const s = G.shop;
  const body = [];

  body.push(el('h3', { text: 'For sale' }));
  const grid = el('div.shop-grid');
  if (!s.items.length) grid.appendChild(el('div.muted', { text: 'Sold out.' }));
  for (const item of s.items) {
    const price = Game.itemPrice(G, item);
    const tile = el('div.shop-item');
    let preview;
    if (item.kind === 'joker') preview = jokerEl(item.payload);
    else if (item.kind === 'consumable') preview = consumableEl(item.payload);
    else preview = cardEl(item.payload, { reveal: true });
    attachInspect(preview, () => (
      item.kind === 'joker' ? jokerTip(item.payload)
        : item.kind === 'consumable' ? consumableTip(item.payload)
          : cardTip(item.payload)
    ));
    tile.appendChild(preview);
    tile.appendChild(el(`div.price${price === 0 ? '.free' : ''}`, { text: price === 0 ? 'FREE' : $m(price) }));
    tile.appendChild(el('button.btn.tiny', {
      text: 'Buy',
      onclick: () => {
        const out = Game.buyItem(G, item.id);
        if (!out.ok) { sfx.error(); return toast(out.msg, true); }
        sfx.buy(); buzz(12); render();
      },
    }));
    grid.appendChild(tile);
  }
  body.push(grid);

  if (s.vouchers.length) {
    body.push(el('h3', { text: 'Voucher' }));
    for (const v of s.vouchers) {
      const def = VOUCHER_BY_KEY[v.key];
      const price = Game.itemPrice(G, { cost: def.cost });
      body.push(el('div.voucher-tile', {}, [
        el('div.vname', { text: def.name }),
        el('div.vdesc', { text: def.desc }),
        el('button.btn.tiny', {
          text: `Buy · ${$m(price)}`,
          style: { marginTop: '6px' },
          onclick: () => {
            const out = Game.buyVoucher(G, v.id);
            if (!out.ok) { sfx.error(); return toast(out.msg, true); }
            sfx.buy(); toast(`${def.name} acquired`); render();
          },
        }),
      ]));
    }
  }

  body.push(el('h3', { text: 'Booster packs' }));
  const packGrid = el('div.shop-grid');
  if (!s.packs.length) packGrid.appendChild(el('div.muted', { text: 'No packs left.' }));
  for (const p of s.packs) {
    const def = PACK_BY_KEY[p.packKey];
    const price = Game.itemPrice(G, p);
    packGrid.appendChild(el('div.shop-item', {}, [
      el('div.pack-tile', { 'data-kind': def.kind }, [
        el('div.pack-art', { html: packArt(def.kind) }),
        el('div', { text: def.name }),
        el('div', { text: `Pick ${def.choose} of ${def.size}`, style: { fontWeight: '600', fontSize: '10px' } }),
      ]),
      el('div.price', { text: $m(price) }),
      el('button.btn.tiny', {
        text: 'Open',
        onclick: () => {
          const out = Game.buyPack(G, p.id);
          if (!out.ok) { sfx.error(); return toast(out.msg, true); }
          sfx.pack(); render();
        },
      }),
    ]));
  }
  body.push(packGrid);

  if (G.jokers.length) {
    body.push(el('h3', { text: 'Your Jokers — tap to sell' }));
    const row = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
    for (const j of G.jokers) {
      const node = jokerEl(j);
      attachInspect(node, () => jokerTip(j), () => {
        Game.sellJoker(G, j.id);
        sfx.money(); toast(`Sold for ${$m(sellValue(j.cost))}`); render();
      });
      row.appendChild(node);
    }
    body.push(row);
  }

  if (G.consumables.length) {
    body.push(el('h3', { text: 'Consumables — tap to use' }));
    const row = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
    for (const u of G.consumables) {
      const node = consumableEl(u);
      attachInspect(node, () => consumableTip(u), () => useConsumable(u));
      row.appendChild(node);
    }
    body.push(row);
  }

  const cost = rerollCost(G);
  const footer = [
    el('button.btn.ghost', {
      text: `Reroll · ${cost === 0 ? 'FREE' : $m(cost)}`,
      onclick: () => {
        if (!Game.rerollShop(G)) { sfx.error(); return toast('Not enough money', true); }
        sfx.tap(); render();
      },
    }),
    el('button.btn.green', {
      text: 'Next Blind',
      onclick: () => { sfx.tap(); Game.leaveShop(G); render(); },
    }),
  ];

  return sheet({ title: 'Shop', right: el('span.muted', { text: $m(G.money) }), body, footer });
}

// --------------------------------------------------------------------- pack --

function packSheet() {
  const p = G.pack;
  const def = PACK_BY_KEY[p.packKey];
  const remaining = def.choose - p.picked;

  const grid = el('div.shop-grid');
  for (const opt of p.options) {
    const tile = el('div.shop-item');
    let preview;
    if (opt.kind === 'joker') preview = jokerEl(opt.payload);
    else if (opt.kind === 'consumable') preview = consumableEl(opt.payload);
    else preview = cardEl(opt.payload, { reveal: true });
    attachInspect(preview, () => (
      opt.kind === 'joker' ? jokerTip(opt.payload)
        : opt.kind === 'consumable' ? consumableTip(opt.payload)
          : cardTip(opt.payload)
    ));
    tile.appendChild(preview);
    tile.appendChild(el('button.btn.tiny', {
      text: 'Take',
      onclick: () => {
        const out = Game.pickFromPack(G, opt.id);
        if (!out.ok) { sfx.error(); return toast(out.msg ?? 'Cannot take that', true); }
        sfx.buy(); buzz(12); render();
      },
    }));
    grid.appendChild(tile);
  }

  const body = [
    el('div.muted.center', { text: `Choose ${remaining} more`, style: { marginTop: '6px' } }),
    grid,
    G.phase === 'pack' && G.hand.length ? el('div.muted.center', { style: { marginTop: '10px' }, text: 'Tarot cards that need a target can be taken and used during a blind.' }) : null,
  ].filter(Boolean);

  const footer = [el('button.btn.ghost.wide', {
    text: 'Skip Pack',
    onclick: () => { sfx.tap(); Game.closePack(G); render(); },
  })];

  return sheet({ title: def.name, right: el('span.muted', { text: $m(G.money) }), body, footer });
}

// ------------------------------------------------------------ end-of-run ----

function gameOverSheet() {
  const body = [
    el('div.center', { style: { padding: '16px 0' } }, [
      el('div.big-icon', { html: icon('skull', '#ef476f') }),
      el('div', { text: 'Run Over', style: { fontWeight: '900', fontSize: '22px' } }),
      el('div.muted', { text: `Beaten by ${BLIND_SLOTS[G.blindIndex].name} on Ante ${G.ante}` }),
    ]),
    runSummary(),
  ];
  const footer = [
    el('button.btn.ghost', { text: 'Main Menu', onclick: () => { Save.clearRun(); G = null; showMenu(); } }),
    el('button.btn.green', { text: 'New Run', onclick: () => { Save.clearRun(); showNewRun(); } }),
  ];
  return sheet({ title: 'Defeat', body, footer });
}

function winSheet() {
  Save.recordRun(G, true);
  sfx.win();
  const body = [
    el('div.center', { style: { padding: '16px 0' } }, [
      el('div.big-icon', { html: icon('crown', '#ffcd75') }),
      el('div', { text: 'You beat Ante 8!', style: { fontWeight: '900', fontSize: '22px' } }),
      el('div.muted', { text: `${DECK_BY_KEY[G.deckKey].name} · seed ${G.seed}` }),
    ]),
    runSummary(),
  ];
  const footer = [
    el('button.btn.ghost', { text: 'Main Menu', onclick: () => { Save.clearRun(); G = null; showMenu(); } }),
    el('button.btn.gold', { text: 'Endless Mode', onclick: () => { sfx.tap(); Game.continueEndless(G); render(); } }),
  ];
  return sheet({ title: 'Victory', body, footer });
}

function runSummary() {
  const rows = [
    ['Ante reached', `${G.ante}`],
    ['Rounds played', `${G.round}`],
    ['Hands played', `${G.stats.handsPlayed}`],
    ['Best hand', `${G.stats.bestHandName} · ${fmt(G.stats.bestHandScore)}`],
    ['Most played', HAND_BY_KEY[G.stats.mostPlayed]?.name ?? '—'],
    ['Money', $m(G.money)],
    ['Deck size', `${G.deck.length} cards`],
    ['Seed', G.seed],
  ];
  return el('table.table', {}, [
    el('tbody', {}, rows.map(([k, v]) => el('tr', {}, [el('td', { text: k }), el('td.n', { text: v })]))),
  ]);
}

// -------------------------------------------------------------- menu screens --

export function showMenu() {
  screen = 'menu';
  const profile = Save.loadProfile();
  const resumable = Save.hasRun();

  const body = [
    el('div.center', { style: { padding: '18px 0 10px' } }, [
      el('div.logo-mark', { html: jokerFace('jokerdeck-logo', '#ef476f') }),
      el('div', { text: 'JOKERDECK', style: { fontWeight: '900', fontSize: '30px', letterSpacing: '0.04em', marginTop: '6px' } }),
      el('div.muted', { text: 'A poker roguelike for one thumb' }),
    ]),
    el('table.table', {}, [el('tbody', {}, [
      ['Runs', profile.runs], ['Wins', profile.wins],
      ['Best ante', profile.bestAnte], ['Best single hand', fmt(profile.bestHandScore)],
    ].map(([k, v]) => el('tr', {}, [el('td', { text: k }), el('td.n', { text: String(v) })])))]),
  ];

  const footer = [];
  if (resumable) footer.push(el('button.btn.green', { text: 'Continue', onclick: () => { G = Save.loadRun(); screen = 'game'; sfx.tap(); render(); } }));
  footer.push(el('button.btn.gold', { text: resumable ? 'New Run' : 'Play', onclick: () => { sfx.tap(); showNewRun(); } }));

  openSheet(sheet({
    title: '',
    right: el('button.btn.tiny', { text: '⚙︎', onclick: () => { sfx.tap(); showSettings(); } }),
    body: [
      ...body,
      el('div', { style: { display: 'flex', gap: '8px', marginTop: '14px' } }, [
        el('button.btn.ghost', { text: 'How to Play', style: { flex: '1' }, onclick: () => { sfx.tap(); showHelp(); } }),
        el('button.btn.ghost', { text: 'Settings', style: { flex: '1' }, onclick: () => { sfx.tap(); showSettings(); } }),
      ]),
    ],
    footer,
  }));
}

function showNewRun() {
  let deckKey = 'standard';
  let seed = '';

  const list = el('div.choice-list', {}, DECKS.map((d) =>
    el(`div.choice${d.key === deckKey ? '.on' : ''}`, {
      'data-deck': d.key,
      onclick: (e) => {
        deckKey = d.key;
        sfx.tap();
        for (const n of list.children) n.classList.toggle('on', n.dataset.deck === deckKey);
        void e;
      },
    }, [
      el('div.deck-mark', { html: cardBack() }),
      el('div', {}, [el('div.cname', { text: d.name }), el('div.cdesc', { text: d.desc })]),
    ])));

  const seedInput = el('input.seed-field', { type: 'text', placeholder: 'RANDOM SEED', maxlength: '12', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
  seedInput.addEventListener('input', () => { seed = seedInput.value.trim().toUpperCase(); });

  openSheet(sheet({
    title: 'New Run',
    right: el('button.btn.tiny', { text: 'Back', onclick: () => { sfx.tap(); showMenu(); } }),
    body: [
      el('h3', { text: 'Choose a deck' }),
      list,
      el('h3', { text: 'Seed (optional)' }),
      seedInput,
      el('div.muted', { text: 'Leave blank for a random run. The same seed always deals the same run.', style: { marginTop: '6px' } }),
    ],
    footer: [el('button.btn.green.wide', {
      text: 'Start Run',
      onclick: () => {
        sfx.win();
        G = Game.newRun({ deckKey, ...(seed ? { seed } : {}) });
        screen = 'game';
        Save.saveRun(G);
        render();
        if (!hasSeenTutorial()) offerTutorial();
      },
    })],
  }));
}

function showPauseMenu() {
  if (!G) return showMenu();
  openSheet(sheet({
    title: 'Paused',
    right: el('button.btn.tiny', { text: 'Close', onclick: () => { sfx.tap(); render(); } }),
    body: [
      el('div.muted', { text: `Ante ${G.ante} · Round ${G.round} · ${DECK_BY_KEY[G.deckKey].name}` }),
      el('div.muted', { text: `Seed ${G.seed}`, style: { marginTop: '4px' } }),
      el('div', { style: { display: 'grid', gap: '8px', marginTop: '14px' } }, [
        el('button.btn.ghost.wide', { text: 'Run Info', onclick: () => { sfx.tap(); showRunInfo(); } }),
        el('button.btn.ghost.wide', { text: 'View Deck', onclick: () => { sfx.tap(); showDeck(); } }),
        el('button.btn.ghost.wide', { text: 'Settings', onclick: () => { sfx.tap(); showSettings(); } }),
        el('button.btn.ghost.wide', { text: 'How to Play', onclick: () => { sfx.tap(); showHelp(); } }),
        el('button.btn.discard.wide', {
          text: 'Abandon Run',
          onclick: () => {
            if (!confirm('Abandon this run? Progress will be lost.')) return;
            Save.recordRun(G, false);
            Save.clearRun();
            G = null;
            showMenu();
          },
        }),
      ]),
    ],
    footer: [el('button.btn.green.wide', { text: 'Resume', onclick: () => { sfx.tap(); render(); } })],
  }));
}

function showRunInfo() {
  if (!G) return;
  const handRows = DISPLAY_HANDS.map((h) => {
    const st = handStats(h.key, G.handLevels);
    const plays = G.handLevels[h.key].plays;
    return el('tr', {}, [
      el('td', { text: h.name }),
      el('td.n', {}, [el('span.lvl', { text: `Lv.${st.level}` })]),
      el('td.n', {}, [el('span.c-chips', { text: fmt(st.chips) })]),
      el('td.n', {}, [el('span.c-mult', { text: fmt(st.mult) })]),
      el('td.n', { text: String(plays) }),
    ]);
  });

  const vouchers = [...G.vouchers].map((k) => el('span.tag-pill', { text: VOUCHER_BY_KEY[k]?.name ?? k }));
  const tags = G.tags.map((t) => el('span.tag-pill', { text: TAG_BY_KEY[t.key].name }));
  const boss = G.blindIndex === 2 ? BOSS_BY_KEY[G.bossKey] : null;

  openSheet(sheet({
    title: 'Run Info',
    right: el('button.btn.tiny', { text: 'Close', onclick: () => { sfx.tap(); render(); } }),
    body: [
      boss ? el('div', {}, [
        el('h3', { text: 'Current boss' }),
        el('div', { text: boss.name, style: { fontWeight: '900' } }),
        el('div.muted', { text: Game.activeBoss(G) ? boss.desc : 'Disabled by The Ringmaster.' }),
      ]) : null,
      el('h3', { text: 'Poker hands' }),
      el('table.table', {}, [
        el('thead', {}, [el('tr', {}, ['Hand', 'Lv', 'Chips', 'Mult', 'Played'].map((t) => el('th', { text: t })))]),
        el('tbody', {}, handRows),
      ]),
      el('h3', { text: 'Vouchers' }),
      vouchers.length ? el('div', {}, vouchers) : el('div.muted', { text: 'None yet.' }),
      el('h3', { text: 'Tags' }),
      tags.length ? el('div', {}, tags) : el('div.muted', { text: 'None held.' }),
      el('h3', { text: 'Stats' }),
      el('table.table', {}, [el('tbody', {}, [
        ['Hands played', G.stats.handsPlayed],
        ['Discards used', G.stats.discardsUsed],
        ['Best hand', `${G.stats.bestHandName} · ${fmt(G.stats.bestHandScore)}`],
        ['Cards in deck', G.deck.length],
        ['Cards left to draw', G.drawPile.length],
      ].map(([k, v]) => el('tr', {}, [el('td', { text: k }), el('td.n', { text: String(v) })])))]),
    ].filter(Boolean),
    footer: [el('button.btn.ghost.wide', { text: 'Back', onclick: () => { sfx.tap(); render(); } })],
  }));
}

function showDeck() {
  const sorted = G.deck.slice().sort((a, b) => a.suit.localeCompare(b.suit) || b.rank - a.rank);
  const grid = el('div.deck-grid');
  for (const c of sorted) {
    const node = cardEl(c, { reveal: true });
    attachInspect(node, () => cardTip(c));
    grid.appendChild(node);
  }
  const counts = {};
  for (const c of G.deck) counts[c.suit] = (counts[c.suit] ?? 0) + 1;

  openSheet(sheet({
    title: `Deck · ${G.deck.length} cards`,
    right: el('button.btn.tiny', { text: 'Close', onclick: () => { sfx.tap(); render(); } }),
    body: [
      el('div.muted', { text: Object.entries(counts).map(([s, n]) => `${SUITS[s].pip} ${n}`).join('   ') }),
      el('div', { style: { height: '8px' } }),
      grid,
    ],
    footer: [el('button.btn.ghost.wide', { text: 'Back', onclick: () => { sfx.tap(); G ? render() : showMenu(); } })],
  }));
}

function showSettings() {
  const toggle = (label, key, onChange) => {
    const btn = el('button.btn.ghost.wide', { text: `${label}: ${settings[key] ? 'On' : 'Off'}` });
    btn.addEventListener('click', () => {
      settings[key] = !settings[key];
      Save.saveSettings(settings);
      onChange?.(settings[key]);
      btn.textContent = `${label}: ${settings[key] ? 'On' : 'Off'}`;
      sfx.tap();
    });
    return btn;
  };

  openSheet(sheet({
    title: 'Settings',
    right: el('button.btn.tiny', { text: 'Close', onclick: () => { sfx.tap(); G ? render() : showMenu(); } }),
    body: [
      el('div', { style: { display: 'grid', gap: '8px', marginTop: '8px' } }, [
        toggle('Sound', 'sound', (v) => setEnabled(v)),
        toggle('Haptics', 'haptics', (v) => setHaptics(v)),
        toggle('Fast scoring', 'fastScoring'),
      ]),
      el('h3', { text: 'Install' }),
      el('div.muted', { html: 'On iPhone: tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.<br>On Android: tap the ⋮ menu, then <b>Install app</b> or <b>Add to Home screen</b>.' }),
      el('h3', { text: 'Data' }),
      el('button.btn.discard.wide', {
        text: 'Erase all progress',
        onclick: () => {
          if (!confirm('Erase the saved run and all lifetime stats?')) return;
          Save.clearRun();
          Save.saveProfile(Save.defaultProfile);
          G = null;
          showMenu();
        },
      }),
    ],
    footer: [el('button.btn.ghost.wide', { text: 'Back', onclick: () => { sfx.tap(); G ? render() : showMenu(); } })],
  }));
}

/** Ask once, on the very first run, whether to be walked through it. */
function offerTutorial() {
  openSheet(sheet({
    title: 'First time?',
    body: [
      el('div.center', { style: { padding: '14px 0 6px' } }, [
        el('div.tut-mascot', { html: jokerFace('tutorial-guide', '#f3b743') }),
        el('p', { text: 'I can walk you through one round — about 60 seconds. You play it for real; I just point at things.', style: { fontSize: '14px', lineHeight: '1.5' } }),
      ]),
    ],
    footer: [
      el('button.btn.ghost', {
        text: 'No thanks',
        onclick: () => { markTutorialSeen(); sfx.tap(); render(); },
      }),
      el('button.btn.green', { text: 'Walk me through it', onclick: () => { sfx.tap(); runTutorial(); } }),
    ],
  }));
}

function runTutorial() {
  closeSheet();
  render();
  tutorial?.stop?.();
  tutorial = startTutorial({
    game: () => G,
    onDone: () => { tutorial = null; render(); },
  });
}

/** A static worked example, so the maths is legible without playing. */
function scoringExample() {
  const demo = [
    { rank: 13, suit: 'H' }, { rank: 13, suit: 'S' }, { rank: 9, suit: 'D' },
  ].map((c) => ({ ...c, id: `demo${c.rank}${c.suit}`, enhancement: null, edition: null, seal: null, debuffed: false }));

  const row = el('div.card-row', { style: { minHeight: 'auto', gap: '4px' } },
    demo.map((c) => cardEl(c, { reveal: true })));

  const line = (label, value, cls) =>
    el('div.ex-line', {}, [el('span', { text: label }), el('span', { class: cls ?? '', text: value })]);

  return el('div.example', {}, [
    row,
    el('div.ex-body', {}, [
      line('Pair of Kings — base', '10 chips × 2 Mult'),
      line('K adds 10 chips', '20 chips × 2 Mult', 'c-chips'),
      line('K adds 10 chips', '30 chips × 2 Mult', 'c-chips'),
      line('The 9 is not part of the pair', 'it scores nothing', 'muted'),
      line('A Joker adding +4 Mult', '30 chips × 6 Mult', 'c-mult'),
      el('div.ex-total', {}, [el('span', { text: 'Final score' }), el('span', { text: '30 × 6 = 180' })]),
    ]),
  ]);
}

function showHelp() {
  const p = (html) => el('p', { html, style: { margin: '6px 0', fontSize: '13.5px', lineHeight: '1.45' } });
  openSheet(sheet({
    title: 'How to Play',
    right: el('button.btn.tiny', { text: 'Close', onclick: () => { sfx.tap(); G ? render() : showMenu(); } }),
    body: [
      el('h3', { text: 'The loop' }),
      p('Each <b>Ante</b> has three blinds: Small, Big and a <b>Boss</b>. Beat a blind\'s chip target before you run out of hands, then spend your winnings in the shop and do it again. Survive Ante 8 to win.'),
      el('h3', { text: 'Scoring, step by step' }),
      p('Select up to 5 cards and press <b>Play Hand</b>. The poker hand you make sets a base <span class="c-chips">chips</span> and <span class="c-mult">Mult</span> value. Every scoring card adds its own chips. Then your Jokers fire, left to right. Final score is <span class="c-chips">chips</span> × <span class="c-mult">Mult</span>.'),
      scoringExample(),
      p('Only cards that are <b>part of the hand</b> score. Playing a pair plus three junk cards scores exactly the same as playing the pair alone — so the junk is better discarded.'),
      p('Order matters: a Joker that adds Mult is worth less if it fires before one that multiplies. Sell and rebuy to reorder them.'),
      el('h3', { text: 'Discards' }),
      p('Select cards and press <b>Discard</b> to throw them away and draw replacements. Discards do not cost you a hand, but you only get a few per round.'),
      el('h3', { text: 'Jokers' }),
      p('Jokers are the whole game. Press and hold any card or Joker to read exactly what it does. In the shop, tap one of your own Jokers to sell it.'),
      el('h3', { text: 'Consumables' }),
      p('<b>Tarot</b> cards upgrade individual playing cards — select the cards in your hand first, then tap the Tarot. <b>Planet</b> cards permanently level up a poker hand. <b>Spectral</b> cards are powerful and usually cost you something.'),
      el('h3', { text: 'Boss blinds' }),
      p('Every Boss Blind breaks one rule — debuffing a suit, taking your discards, demanding exactly five cards. Read it on the blind select screen and plan the round around it.'),
      el('h3', { text: 'Money' }),
      p('You earn interest of $1 per $5 held at the end of each round, up to a cap. Hoarding early pays for the Jokers that win late.'),
    ],
    footer: [
      // The guided walkthrough needs a live run to point at.
      G ? el('button.btn.green', { text: 'Walk me through it', onclick: () => { sfx.tap(); runTutorial(); } }) : null,
      el('button.btn.ghost', { text: 'Back', onclick: () => { sfx.tap(); G ? render() : showMenu(); } }),
    ].filter(Boolean),
  }));
}

/** main.js needs the live run to flush it to storage on backgrounding. */
export const currentGame = () => G;
export const uiState = () => ({ screen, busy, hasGame: !!G });
