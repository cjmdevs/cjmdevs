// Bundle the whole game into one self-contained .html file.
//
// The app normally runs as separate ES modules straight from disk. A single
// file is useful when there is no web server involved at all: opening it from
// Files/Downloads, emailing it to yourself, or hosting it somewhere that only
// accepts one page.
//
// Each module is wrapped in its own function so module-local names (`C`, `J`,
// `S`, `dom`, `G`…) cannot collide once everything shares a document.
//
// Usage: node tools/bundle.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const b64 = (p) => readFileSync(resolve(ROOT, p)).toString('base64');

// Every module in js/ must appear here — selftest.mjs enforces it, because a
// missing entry only fails at runtime with "missing module".
const MODULES = [
  'util.js', 'cards.js', 'poker.js', 'jokers.js', 'consumables.js',
  'blinds.js', 'decks.js', 'shop.js', 'game.js', 'audio.js', 'save.js',
  'art.js', 'anim.js', 'tutorial.js', 'ui.js', 'main.js',
];

/** Rewrite one ES module into a registry factory body. */
function transform(src, name) {
  let s = src;
  const exported = new Set();

  // import { a, b as c } from './x.js';   ->  const { a, b: c } = __req('x.js');
  s = s.replace(
    /^import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/([^'"]+)['"]\s*;?/gm,
    (_, names, mod) => {
      const bindings = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => (n.includes(' as ') ? n.split(/\s+as\s+/).map((x) => x.trim()).join(': ') : n))
        .join(', ');
      return `const { ${bindings} } = __req('${mod}');`;
    },
  );

  // import * as N from './x.js';  ->  const N = __req('x.js');
  s = s.replace(
    /^import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]\.\/([^'"]+)['"]\s*;?/gm,
    (_, alias, mod) => `const ${alias} = __req('${mod}');`,
  );

  // Bare side-effect imports are not used, but drop them defensively.
  s = s.replace(/^import\s+['"][^'"]+['"]\s*;?$/gm, '');

  // export { a, b };  ->  record and remove
  s = s.replace(/^export\s*\{([^}]*)\}\s*;?/gm, (_, names) => {
    for (const n of names.split(',')) {
      const name = n.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) exported.add(name);
    }
    return '';
  });

  // export function / const / let / class  ->  strip the keyword, record the name
  s = s.replace(
    /^export\s+(async\s+)?(function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
    (_, asyncKw, kind, name) => {
      exported.add(name);
      return `${asyncKw ?? ''}${kind} ${name}`;
    },
  );

  if (/^export\s/m.test(s)) {
    throw new Error(`${name}: unhandled export syntax remains`);
  }

  const returned = [...exported].map((n) => `${n}`).join(', ');
  return `__def('${name}', function () {\n${s}\nreturn { ${returned} };\n});`;
}

const modules = MODULES.map((m) => transform(read(`js/${m}`), m)).join('\n\n');

const runtime = `
// Minimal module registry: each module runs once, on first require.
const __mods = {};
const __cache = {};
const __def = (name, factory) => { __mods[name] = factory; };
const __req = (name) => {
  if (!(name in __cache)) {
    if (!__mods[name]) throw new Error('missing module: ' + name);
    __cache[name] = __mods[name]();
  }
  return __cache[name];
};
`;

const css = read('css/style.css');
const icon180 = `data:image/png;base64,${b64('icons/icon-180.png')}`;
const icon192 = `data:image/png;base64,${b64('icons/icon-192.png')}`;
const icon512 = `data:image/png;base64,${b64('icons/icon-512.png')}`;

// The manifest is injected as a blob at runtime so the file stays truly single.
// iOS reads the apple-* meta tags instead, which are already in the markup.
const installShim = `
(function () {
  try {
    const manifest = {
      name: 'Jokerdeck', short_name: 'Jokerdeck',
      display: 'standalone', orientation: 'portrait',
      background_color: '#10171d', theme_color: '#141d24',
      start_url: location.href, scope: './',
      icons: [
        { src: ${JSON.stringify(icon192)}, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: ${JSON.stringify(icon512)}, sizes: '512x512', type: 'image/png', purpose: 'any' }
      ]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = url;
    document.head.appendChild(link);
  } catch (e) { /* manifest is a bonus; the apple-* meta tags carry iOS */ }
})();
`;

// Everything inside <body>, shared by the standalone file and the fragment.
const bodyMarkup = read('index.html')
  .replace(/^[\s\S]*<body>/, '')
  .replace(/<\/body>[\s\S]*$/, '')
  .replace(/<script type="module" src="js\/main\.js"><\/script>/, '');

const head = `
<title>Jokerdeck</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#141d24">
<meta name="color-scheme" content="dark">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Jokerdeck">
<link rel="apple-touch-icon" href="${icon180}">
<link rel="icon" href="${icon192}">
<style>
${css}
</style>`.trim();

const script = `<script>window.__INLINE_BUILD__ = true;</script>
<script type="module">
${runtime}
${modules}
__req('main.js');
${installShim}
</script>`;

mkdirSync(resolve(ROOT, 'dist'), { recursive: true });

// 1. Standalone page — works from a file:// path, an email attachment, any host.
writeFileSync(
  resolve(ROOT, 'dist/jokerdeck.html'),
  `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n${head}\n</head>\n<body>\n${bodyMarkup}\n${script}\n</body>\n</html>\n`,
);

// 2. Fragment — for hosts that supply their own <head>/<body> wrapper.
writeFileSync(
  resolve(ROOT, 'dist/jokerdeck.fragment.html'),
  `${head}\n${bodyMarkup}\n${script}\n`,
);

const kb = (p) => (readFileSync(resolve(ROOT, p)).length / 1024).toFixed(0);
console.log(`dist/jokerdeck.html          ${kb('dist/jokerdeck.html')} KB`);
console.log(`dist/jokerdeck.fragment.html ${kb('dist/jokerdeck.fragment.html')} KB`);
