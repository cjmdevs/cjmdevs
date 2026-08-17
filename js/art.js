// Pixel art, drawn on a fixed grid and rendered as SVG rects.
//
// Everything here is deliberately low resolution and flat — no gradients, no
// soft edges, one colour per pixel. Horizontal runs are merged into single
// rects so a 16x16 face costs a few dozen nodes rather than 256.

const GRID = 16;

// A tight, saturated palette. Every colour in the game comes from this list.
const INK = '#12161c';

const SKINS = [
  ['#ffcf8f', '#e0a45f'],
  ['#ffe2c4', '#dfae86'],
  ['#c9eeb0', '#94c47a'],
  ['#ffc2cf', '#dd8fa2'],
  ['#bfe2ff', '#87b2dd'],
  ['#e8c9ff', '#b492d8'],
];
const HATS = [
  ['#e5484d', '#a82a2f'],
  ['#3d8bd6', '#245f9c'],
  ['#43ad63', '#25763e'],
  ['#7a54c9', '#4f3391'],
  ['#e8862b', '#b05c14'],
  ['#20a4a4', '#12706f'],
];
const TRIM = ['#ffd046', '#ffe8a3', '#f0f0e4'];

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function picker(key) {
  let h = hash(key);
  return (n) => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h % n; };
}

// ------------------------------------------------------------ grid helpers --

const blank = (w = GRID, h = GRID) => Array.from({ length: h }, () => Array(w).fill('.'));
const put = (g, x, y, ch) => { if (g[y] && x >= 0 && x < g[y].length) g[y][x] = ch; };
const box = (g, x0, y0, x1, y1, ch) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, ch);
};

/** Wrap the silhouette in a one-pixel outline — the defining pixel-art edge. */
function outline(g, ch = 'o') {
  const h = g.length, w = g[0].length;
  const copy = g.map((r) => r.slice());
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (copy[y][x] !== '.') continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .some(([dx, dy]) => copy[y + dy]?.[x + dx] && copy[y + dy][x + dx] !== '.' && copy[y + dy][x + dx] !== ch);
      if (near) g[y][x] = ch;
    }
  }
}

/** Emit SVG, merging runs of identical pixels on each row. */
function toSvg(g, colors, { scale = 1 } = {}) {
  const h = g.length, w = g[0].length;
  let out = '';
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const ch = g[y][x];
      if (ch === '.') { x++; continue; }
      let run = 1;
      while (x + run < w && g[y][x + run] === ch) run++;
      const fill = colors[ch] ?? INK;
      out += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`;
      x += run;
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">${out}</svg>${scale > 1 ? '' : ''}`;
}

// --------------------------------------------------------------- features --

function drawHead(g) {
  box(g, 3, 5, 12, 13, 's');
  // Knock the corners off so the head reads round at this resolution.
  put(g, 3, 5, '.'); put(g, 12, 5, '.');
  put(g, 3, 13, '.'); put(g, 12, 13, '.');
  // A shading column down the left, the only "lighting" in the whole game.
  box(g, 4, 11, 5, 12, 'd');
}

const EYE_STYLES = [
  // Wide open, single highlight pixel.
  (g) => { box(g, 5, 8, 6, 9, 'e'); box(g, 9, 8, 10, 9, 'e'); put(g, 5, 8, 'w'); put(g, 9, 8, 'w'); },
  // Big round with pupils.
  (g) => { box(g, 5, 8, 6, 9, 'w'); box(g, 9, 8, 10, 9, 'w'); put(g, 6, 9, 'e'); put(g, 10, 9, 'e'); },
  // Happy squints.
  (g) => { put(g, 5, 9, 'e'); put(g, 6, 8, 'e'); put(g, 7, 9, 'e'); put(g, 8, 9, 'e'); put(g, 9, 8, 'e'); put(g, 10, 9, 'e'); },
  // Cross eyes.
  (g) => {
    put(g, 5, 8, 'e'); put(g, 6, 9, 'e'); put(g, 6, 8, 'e'); put(g, 5, 9, 'e');
    put(g, 9, 8, 'e'); put(g, 10, 9, 'e'); put(g, 10, 8, 'e'); put(g, 9, 9, 'e');
  },
  // Sleepy half-lids.
  (g) => { box(g, 5, 9, 6, 9, 'e'); box(g, 9, 9, 10, 9, 'e'); put(g, 5, 8, 'd'); put(g, 10, 8, 'd'); },
  // Wink.
  (g) => { box(g, 5, 8, 6, 9, 'e'); put(g, 5, 8, 'w'); box(g, 9, 9, 10, 9, 'e'); },
];

const MOUTH_STYLES = [
  // Grin.
  (g) => { put(g, 6, 11, 'm'); box(g, 7, 12, 8, 12, 'm'); put(g, 9, 11, 'm'); },
  // Open mouth.
  (g) => { box(g, 6, 11, 9, 12, 'm'); put(g, 6, 11, 's'); put(g, 9, 11, 's'); },
  // Flat line.
  (g) => box(g, 6, 12, 9, 12, 'm'),
  // Frown.
  (g) => { put(g, 6, 12, 'm'); box(g, 7, 11, 8, 11, 'm'); put(g, 9, 12, 'm'); },
  // Toothy.
  (g) => { box(g, 6, 11, 9, 12, 'm'); put(g, 7, 11, 'w'); put(g, 8, 11, 'w'); },
  // Smirk.
  (g) => { box(g, 6, 12, 8, 12, 'm'); put(g, 9, 11, 'm'); },
];

const HAT_STYLES = [
  // Jester cap, three bells.
  (g) => {
    box(g, 4, 3, 11, 4, 'h');
    box(g, 5, 2, 10, 2, 'h');
    put(g, 2, 4, 't'); put(g, 2, 3, 'H');
    put(g, 7, 0, 't'); put(g, 7, 1, 'H'); put(g, 8, 1, 'H');
    put(g, 13, 4, 't'); put(g, 13, 3, 'H');
  },
  // Top hat.
  (g) => { box(g, 5, 0, 10, 3, 'h'); box(g, 5, 2, 10, 2, 't'); box(g, 3, 4, 12, 4, 'H'); },
  // Crown.
  (g) => {
    box(g, 4, 3, 11, 4, 't');
    put(g, 4, 1, 't'); put(g, 4, 2, 't');
    put(g, 7, 0, 't'); put(g, 8, 0, 't'); put(g, 7, 1, 't'); put(g, 8, 1, 't'); put(g, 7, 2, 't'); put(g, 8, 2, 't');
    put(g, 11, 1, 't'); put(g, 11, 2, 't');
    put(g, 7, 3, 'H'); put(g, 8, 3, 'H');
  },
  // Wizard cone.
  (g) => {
    put(g, 7, 0, 'h'); put(g, 8, 0, 'h');
    box(g, 6, 1, 9, 1, 'h'); box(g, 5, 2, 10, 2, 'h'); box(g, 4, 3, 11, 4, 'h');
    put(g, 6, 3, 't'); put(g, 9, 2, 't');
  },
  // Bare head with a tuft.
  (g) => { put(g, 6, 4, 'h'); put(g, 7, 3, 'h'); put(g, 8, 4, 'h'); put(g, 9, 3, 'h'); },
  // Bowler with a band.
  (g) => { box(g, 5, 1, 10, 3, 'h'); box(g, 5, 3, 10, 3, 'H'); box(g, 3, 4, 12, 4, 'h'); },
];

/** A cartoon joker portrait, generated from the joker's key. */
export function jokerFace(key, accent = '#3d8bd6') {
  const pick = picker(key);
  const [skin, shade] = SKINS[pick(SKINS.length)];
  const [hat, hatDark] = HATS[pick(HATS.length)];
  const trim = TRIM[pick(TRIM.length)];
  const eyes = EYE_STYLES[pick(EYE_STYLES.length)];
  const mouth = MOUTH_STYLES[pick(MOUTH_STYLES.length)];
  const hatStyle = HAT_STYLES[pick(HAT_STYLES.length)];
  const blush = pick(2) === 0;

  const g = blank();
  drawHead(g);
  eyes(g);
  mouth(g);
  if (blush) { put(g, 4, 10, 'c'); put(g, 11, 10, 'c'); }
  hatStyle(g);
  outline(g);

  const colors = {
    o: INK, s: skin, d: shade, h: hat, H: hatDark, t: trim,
    e: INK, w: '#ffffff', m: '#8f2233', c: '#ff8fa3',
  };
  // The backdrop is a flat rarity-tinted plate, not a gradient.
  const plate = `<rect x="0" y="0" width="${GRID}" height="${GRID}" fill="${accent}"/>`;
  return toSvg(g, colors).replace('>', '>' + plate);
}

// ------------------------------------------------------------------ suits --

const SUIT_ART = {
  H: [
    '.oo...oo.',
    'ooooooooo',
    'ooooooooo',
    'ooooooooo',
    '.ooooooo.',
    '..ooooo..',
    '...ooo...',
    '....o....',
    '.........',
  ],
  D: [
    '....o....',
    '...ooo...',
    '..ooooo..',
    '.ooooooo.',
    'ooooooooo',
    '.ooooooo.',
    '..ooooo..',
    '...ooo...',
    '....o....',
  ],
  S: [
    '....o....',
    '...ooo...',
    '..ooooo..',
    '.ooooooo.',
    'ooooooooo',
    'ooooooooo',
    '..o.o.o..',
    '...ooo...',
    '.........',
  ],
  C: [
    '...ooo...',
    '..ooooo..',
    '...ooo...',
    '.oo.o.oo.',
    'ooooooooo',
    'ooooooooo',
    '....o....',
    '...ooo...',
    '.........',
  ],
};

/** A pixel suit pip. Colour is applied by CSS via currentColor. */
export function suitPip(suit, color) {
  const rows = SUIT_ART[suit] ?? SUIT_ART.S;
  const g = rows.map((r) => r.split(''));
  return toSvg(g, { o: color });
}

// ------------------------------------------------------------ consumables --

const TAROT_ART = [
  '................',
  '.......oo.......',
  '......oooo......',
  '..o...oooo...o..',
  '...oo.oooo.oo...',
  '....oooooooo....',
  '.oooooowwoooooo.',
  'ooooooweewooooo.',
  '.oooooowwoooooo.',
  '....oooooooo....',
  '...oo.oooo.oo...',
  '..o...oooo...o..',
  '......oooo......',
  '.......oo.......',
  '................',
  '................',
];

const PLANET_ART = [
  '................',
  '.....oooooo.....',
  '...oobbbbbboo...',
  '..obbbbbbbbbbo..',
  '.obbbdddbbbbbbo.',
  'ttttbbbbbbbdbttt',
  '.obbbbbbbbdddbo.',
  '..obbbbbbbdbbo..',
  'ttttbbbbbbbbbttt',
  '...oobbbbbboo...',
  '.....oooooo.....',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const SPECTRAL_ART = [
  '................',
  '.....gggggg.....',
  '...gggggggggg...',
  '..gggggggggggg..',
  '..ggeeggggeegg..',
  '..ggeeggggeegg..',
  '..gggggggggggg..',
  '..ggggmmmmgggg..',
  '..gggggggggggg..',
  '..gggggggggggg..',
  '..gggggggggggg..',
  '..gg.gg.gg.ggg..',
  '..g...g...g..g..',
  '................',
  '................',
  '................',
];

export function consumableArt(type) {
  if (type === 'planet') {
    const g = PLANET_ART.map((r) => r.split(''));
    return toSvg(g, { o: INK, b: '#3d8bd6', d: '#245f9c', t: '#ffd046' });
  }
  if (type === 'spectral') {
    const g = SPECTRAL_ART.map((r) => r.split(''));
    return toSvg(g, { g: '#dff3ef', e: INK, m: '#8f2233' });
  }
  const g = TAROT_ART.map((r) => r.split(''));
  return toSvg(g, { o: '#7a54c9', w: '#ffffff', e: INK });
}

export function packArt(kind) {
  if (kind === 'joker') return jokerFace('pack-buffoon', '#e8862b');
  if (kind === 'card') {
    const g = blank();
    box(g, 3, 2, 10, 12, 'p');
    box(g, 5, 4, 8, 5, 'r');
    outline(g);
    return toSvg(g, { o: INK, p: '#f4f0e2', r: '#e5484d' });
  }
  return consumableArt(kind === 'spectral' ? 'spectral' : kind === 'planet' ? 'planet' : 'tarot');
}

/** The card back, used for face-down draws. */
export function cardBack() {
  const g = blank(10, 14);
  box(g, 0, 0, 9, 13, 'b');
  box(g, 1, 1, 8, 12, 'd');
  // A simple diamond lattice, the classic playing-card back motif.
  for (let y = 2; y <= 11; y++) {
    for (let x = 2; x <= 7; x++) {
      if ((x + y) % 4 === 0) put(g, x, y, 't');
    }
  }
  return toSvg(g, { b: INK, d: '#2d5b9e', t: '#7fb0e8' });
}

// ------------------------------------------------------------------ icons --
// Small pixel glyphs, replacing the emoji that used to stand in for them.
// Emoji render differently on every platform and read as placeholder art.

const ICONS = {
  skull: [
    '..oooooo..',
    '.oooooooo.',
    'oooooooooo',
    'oo.oo.oo.o',
    'oo.oo.oo.o',
    'oooooooooo',
    'ooo.oo.ooo',
    '.oooooooo.',
    '..o.oo.o..',
    '..oooooo..',
  ],
  coin: [
    '..oooooo..',
    '.oottttoo.',
    'oottttttoo',
    'ottt..ttto',
    'ott.tt.tto',
    'ott.tt.tto',
    'ottt..ttto',
    'oottttttoo',
    '.oottttoo.',
    '..oooooo..',
  ],
  crown: [
    '..........',
    'o...oo...o',
    'oo..oo..oo',
    'ooo.oo.ooo',
    'oooooooooo',
    'oooooooooo',
    'oo.oooo.oo',
    'oooooooooo',
    '..........',
    '..........',
  ],
  chip: [
    '..oooooo..',
    '.oooooooo.',
    'oo.oooo.oo',
    'o.oooooo.o',
    'oooooooooo',
    'oooooooooo',
    'o.oooooo.o',
    'oo.oooo.oo',
    '.oooooooo.',
    '..oooooo..',
  ],
  tag: [
    '..........',
    '.oooooooo.',
    '.o.oooooo.',
    '.oooooooo.',
    '..oooooooo',
    '...oooooo.',
    '....oooo..',
    '.....oo...',
    '..........',
    '..........',
  ],
  star: [
    '....oo....',
    '....oo....',
    '...oooo...',
    'oooooooooo',
    '.oooooooo.',
    '..oooooo..',
    '..oooooo..',
    '.ooo..ooo.',
    'oo......oo',
    '..........',
  ],
};

/** A small pixel glyph in a single colour. */
export function icon(name, color = '#f4f4f4') {
  const rows = ICONS[name] ?? ICONS.chip;
  const g = rows.map((r) => r.split(''));
  return toSvg(g, { o: color, t: color });
}
