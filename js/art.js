// Procedural cartoon art. Every joker gets a face built from its own key, so
// the same joker always looks the same without shipping a single image file.

const PALETTES = [
  { skin: '#ffd9a8', shade: '#e8b479', hat: '#e05b5b', hat2: '#c23f3f', trim: '#f6d76b' },
  { skin: '#ffe0c2', shade: '#e6bd95', hat: '#4d9de0', hat2: '#3579b8', trim: '#f2f2f2' },
  { skin: '#d7f0c8', shade: '#aed6a0', hat: '#7b5bd6', hat2: '#5c40ad', trim: '#ffd166' },
  { skin: '#ffcfd8', shade: '#e8a6b4', hat: '#2fa96b', hat2: '#1f8250', trim: '#fff0a8' },
  { skin: '#cfe9ff', shade: '#a3c9e8', hat: '#f0803c', hat2: '#c95f22', trim: '#ffe9b0' },
  { skin: '#f3d9ff', shade: '#d2aee8', hat: '#e0405b', hat2: '#b32b43', trim: '#9be0d2' },
];

/** Stable 32-bit hash so a joker's look never drifts between sessions. */
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic small-integer stream derived from one key. */
function picker(key) {
  let h = hash(key);
  return (n) => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h % n;
  };
}

// ------------------------------------------------------------------- parts --

const HATS = [
  // Jester cap with three bells.
  (p) => `
    <path d="M18 34 Q14 12 30 16 Q50 2 70 16 Q86 12 82 34 Z" fill="${p.hat}" stroke="#20262e" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="18" cy="33" r="6" fill="${p.trim}" stroke="#20262e" stroke-width="3"/>
    <circle cx="50" cy="10" r="6" fill="${p.trim}" stroke="#20262e" stroke-width="3"/>
    <circle cx="82" cy="33" r="6" fill="${p.trim}" stroke="#20262e" stroke-width="3"/>`,
  // Top hat.
  (p) => `
    <rect x="30" y="6" width="40" height="26" rx="4" fill="${p.hat}" stroke="#20262e" stroke-width="3"/>
    <rect x="30" y="22" width="40" height="8" fill="${p.trim}" stroke="#20262e" stroke-width="3"/>
    <rect x="18" y="30" width="64" height="8" rx="4" fill="${p.hat2}" stroke="#20262e" stroke-width="3"/>`,
  // Crown.
  (p) => `
    <path d="M22 34 L22 12 L34 22 L50 8 L66 22 L78 12 L78 34 Z" fill="${p.trim}" stroke="#20262e" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="50" cy="20" r="4" fill="${p.hat}" stroke="#20262e" stroke-width="2.5"/>`,
  // Wizard cone.
  (p) => `
    <path d="M26 36 L50 4 L74 36 Z" fill="${p.hat}" stroke="#20262e" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="44" cy="24" r="3" fill="${p.trim}"/>
    <circle cx="56" cy="16" r="2.5" fill="${p.trim}"/>`,
  // Bare head with a tuft of hair.
  (p) => `
    <path d="M32 30 Q38 16 50 22 Q62 14 68 30" fill="none" stroke="${p.hat}" stroke-width="7" stroke-linecap="round"/>`,
];

const EYES = [
  () => `<circle cx="39" cy="56" r="5.5" fill="#20262e"/><circle cx="61" cy="56" r="5.5" fill="#20262e"/>
         <circle cx="41" cy="54" r="2" fill="#fff"/><circle cx="63" cy="54" r="2" fill="#fff"/>`,
  () => `<path d="M34 56 L44 56 M39 51 L39 61" stroke="#20262e" stroke-width="4" stroke-linecap="round"/>
         <path d="M56 56 L66 56 M61 51 L61 61" stroke="#20262e" stroke-width="4" stroke-linecap="round"/>`,
  () => `<path d="M33 58 Q39 48 45 58" fill="none" stroke="#20262e" stroke-width="4" stroke-linecap="round"/>
         <path d="M55 58 Q61 48 67 58" fill="none" stroke="#20262e" stroke-width="4" stroke-linecap="round"/>`,
  (p) => `<circle cx="39" cy="56" r="7" fill="#fff" stroke="#20262e" stroke-width="3"/>
          <circle cx="61" cy="56" r="7" fill="#fff" stroke="#20262e" stroke-width="3"/>
          <circle cx="40" cy="57" r="3" fill="${p.hat2}"/><circle cx="62" cy="57" r="3" fill="${p.hat2}"/>`,
  () => `<path d="M33 54 Q39 62 45 54" fill="none" stroke="#20262e" stroke-width="4" stroke-linecap="round"/>
         <path d="M55 54 Q61 62 67 54" fill="none" stroke="#20262e" stroke-width="4" stroke-linecap="round"/>`,
  () => `<path d="M39 49 L39 63" stroke="#20262e" stroke-width="4.5" stroke-linecap="round"/>
         <circle cx="61" cy="56" r="6" fill="#20262e"/><circle cx="63" cy="54" r="2" fill="#fff"/>`,
];

const MOUTHS = [
  () => `<path d="M38 70 Q50 82 62 70" fill="none" stroke="#20262e" stroke-width="4" stroke-linecap="round"/>`,
  (p) => `<path d="M38 68 Q50 82 62 68 Z" fill="${p.hat2}" stroke="#20262e" stroke-width="3" stroke-linejoin="round"/>`,
  () => `<path d="M40 74 Q50 66 60 74" fill="none" stroke="#20262e" stroke-width="4" stroke-linecap="round"/>`,
  (p) => `<ellipse cx="50" cy="73" rx="9" ry="7" fill="${p.hat2}" stroke="#20262e" stroke-width="3"/>
          <path d="M46 76 Q50 82 54 76" fill="#ff8098"/>`,
  () => `<path d="M38 72 L62 72" stroke="#20262e" stroke-width="4" stroke-linecap="round"/>
         <path d="M44 72 L44 78" stroke="#20262e" stroke-width="3" stroke-linecap="round"/>`,
  () => `<path d="M38 68 Q44 78 50 70 Q56 78 62 68" fill="none" stroke="#20262e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
];

/**
 * A cartoon joker portrait as an inline SVG string.
 * `rarityColor` tints the backdrop so rarity still reads at a glance.
 */
export function jokerFace(key, rarityColor = '#3a8fd6') {
  const pick = picker(key);
  const p = PALETTES[pick(PALETTES.length)];
  const hat = HATS[pick(HATS.length)];
  const eyes = EYES[pick(EYES.length)];
  const mouth = MOUTHS[pick(MOUTHS.length)];
  const cheeks = pick(2) === 0;

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><clipPath id="cl${hash(key).toString(36)}"><rect x="0" y="0" width="100" height="100" rx="10"/></clipPath></defs>
    <g clip-path="url(#cl${hash(key).toString(36)})">
      <rect x="0" y="0" width="100" height="100" fill="${rarityColor}" opacity="0.22"/>
      <circle cx="50" cy="62" r="30" fill="${p.skin}" stroke="#20262e" stroke-width="3.5"/>
      <path d="M22 62 Q26 82 34 88" fill="none" stroke="${p.shade}" stroke-width="5" stroke-linecap="round"/>
      ${cheeks ? `<circle cx="30" cy="68" r="5" fill="#ff9aa8" opacity="0.75"/><circle cx="70" cy="68" r="5" fill="#ff9aa8" opacity="0.75"/>` : ''}
      ${eyes(p)}
      ${mouth(p)}
      ${hat(p)}
    </g>
  </svg>`;
}

// ------------------------------------------------------------- consumables --

export function consumableArt(type) {
  if (type === 'planet') {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="50" cy="50" r="26" fill="#6fb7f0" stroke="#20262e" stroke-width="4"/>
      <path d="M32 42 Q42 36 52 42 Q44 50 32 42Z" fill="#3d86c4"/>
      <circle cx="62" cy="60" r="7" fill="#3d86c4"/>
      <ellipse cx="50" cy="52" rx="42" ry="12" fill="none" stroke="#f6d76b" stroke-width="6" transform="rotate(-18 50 52)"/>
      <ellipse cx="50" cy="52" rx="42" ry="12" fill="none" stroke="#20262e" stroke-width="2.5" transform="rotate(-18 50 52)"/>
    </svg>`;
  }
  if (type === 'spectral') {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M24 78 L24 44 A26 26 0 0 1 76 44 L76 78 L66 70 L58 78 L50 70 L42 78 L34 70 Z"
            fill="#eaf7f4" stroke="#20262e" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="41" cy="48" r="5" fill="#20262e"/><circle cx="59" cy="48" r="5" fill="#20262e"/>
      <path d="M43 62 Q50 70 57 62" fill="none" stroke="#20262e" stroke-width="3.5" stroke-linecap="round"/>
    </svg>`;
  }
  // Tarot: an eye inside a starburst.
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M50 8 L58 34 L84 26 L66 48 L88 62 L60 62 L62 90 L46 68 L26 84 L34 58 L10 50 L36 40 Z"
          fill="#c9a3f0" stroke="#20262e" stroke-width="3.5" stroke-linejoin="round"/>
    <ellipse cx="50" cy="52" rx="17" ry="11" fill="#fff" stroke="#20262e" stroke-width="3"/>
    <circle cx="50" cy="52" r="6" fill="#6b3fa8" stroke="#20262e" stroke-width="2.5"/>
  </svg>`;
}

export function packArt(kind) {
  const inner = {
    tarot: consumableArt('tarot'),
    planet: consumableArt('planet'),
    spectral: consumableArt('spectral'),
    joker: jokerFace('packjoker', '#e0a86c'),
    card: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="20" y="14" width="46" height="66" rx="8" fill="#fdfbf4" stroke="#20262e" stroke-width="4" transform="rotate(-10 43 47)"/>
      <rect x="34" y="20" width="46" height="66" rx="8" fill="#fdfbf4" stroke="#20262e" stroke-width="4" transform="rotate(8 57 53)"/>
      <text x="57" y="66" font-size="34" font-weight="900" text-anchor="middle" fill="#cf2b3a" transform="rotate(8 57 53)">♥</text>
    </svg>`,
  };
  return inner[kind] ?? inner.card;
}

/** The card back, used for face-down draws. */
export function cardBack() {
  return `<svg viewBox="0 0 50 70" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="cardback-svg">
    <rect x="2" y="2" width="46" height="66" rx="7" fill="#3a5f9e" stroke="#20262e" stroke-width="3"/>
    <path d="M25 12 L37 35 L25 58 L13 35 Z" fill="#2b4778" stroke="#8fb4e8" stroke-width="2"/>
    <circle cx="25" cy="35" r="5" fill="#f6d76b" stroke="#20262e" stroke-width="2"/>
  </svg>`;
}
