// Small shared helpers: seeded RNG, formatting, DOM sugar.

/** Deterministic 32-bit PRNG (mulberry32). Keeps runs reproducible from a seed. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float: next,
    /** Integer in [0, n). */
    int: (n) => Math.floor(next() * n),
    /** Integer in [lo, hi] inclusive. */
    range: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** True with probability num/den. */
    chance: (num, den) => next() < num / den,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    /** Pick `n` distinct entries, weighted by `weightFn`. */
    weighted(arr, weightFn) {
      const total = arr.reduce((s, x) => s + weightFn(x), 0);
      if (total <= 0) return arr[0];
      let r = next() * total;
      for (const x of arr) { r -= weightFn(x); if (r <= 0) return x; }
      return arr[arr.length - 1];
    },
    get state() { return a >>> 0; },
    set state(v) { a = v >>> 0; },
  };
}

export function seedFromString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeedString() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** Balatro-style large-number formatting: 1234 -> "1,234", 1.2e6 -> "1.200e6". */
export function fmt(n) {
  if (!isFinite(n)) return 'naneinf';
  const abs = Math.abs(n);
  if (abs >= 1e11) return n.toExponential(3).replace('e+', 'e');
  if (abs >= 1000) return Math.round(n).toLocaleString('en-US');
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

export function money(n) { return '$' + fmt(n); }

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Terse element factory: el('div.card', {id}, [children]) */
export function el(spec, attrs = {}, children = []) {
  const [tagPart, ...classes] = spec.split('.');
  const node = document.createElement(tagPart || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let _uid = 0;
export const uid = (prefix = 'x') => `${prefix}${(++_uid).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
export function resetUid(n = 0) { _uid = n; }
