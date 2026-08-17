# Jokerdeck

A poker roguelike for your phone. Build a deck, stack absurd jokers, and try to
break the score before the blinds break you.

It installs to your home screen and plays offline like a native app — no app
store, no account, no network after the first load.

> Jokerdeck is an original game inspired by the deckbuilding-poker genre that
> *Balatro* popularised. All art, names and text here are original; nothing is
> copied from that game. If you like this, go buy the real thing.

---

## Play it on your phone

### Add it to your home screen

Once you have a URL (below), open it on your phone and:

| Phone | How |
| --- | --- |
| iPhone / iPad | Open in **Safari** → tap **Share** (□↑) → **Add to Home Screen** |
| Android | Open in **Chrome** → tap **⋮** → **Install app** (or *Add to Home screen*) |

It then launches full-screen with no browser chrome, keeps your run saved
between sessions, and works with no signal.

> On iOS, "Add to Home Screen" only appears in **Safari** — not Chrome or Firefox.

### Getting a URL: GitHub Pages

Two things must both be true, or the link 404s:

**1. The code has to be on `main`.** The workflow also deploys `claude/**`
preview branches, but GitHub restricts the `github-pages` environment to the
default branch unless you loosen it — so merging to `main` is the reliable path.

**2. Pages has to be switched on, once.** Go to **Settings → Pages** and set
**Source** to **GitHub Actions**. Nothing publishes until you do; that setting
cannot be enabled from a workflow.

Then every push runs the tests and publishes to:

```
https://<your-username>.github.io/<repo-name>/
```

Check **Actions** for a green run and **Settings → Pages** for the live URL.

### Getting a URL: anywhere else

There is no build step, so the repository *is* the website. Drag the folder onto
Netlify, Vercel, Cloudflare Pages, or any static host and it works. The only
requirement is **HTTPS** (or `localhost`) — service workers, and therefore
offline play and installability, are disabled on plain `http://`.

### No hosting at all: the single file

`dist/jokerdeck.html` is the entire game — code, styles and icons — inlined
into one self-contained file with no external requests. Download it and open
it directly; it plays from a `file://` path with no server involved. Email or
AirDrop it to your phone and open it from Files, or drop that one file on any
host. Rebuild it with `npm run bundle`.

---

## Run it locally

```bash
npm start              # serves on http://localhost:8080
```

Then open `http://localhost:8080` — or, to try it on your phone on the same
Wi-Fi, `http://<your-computer-ip>:8080`.

---

## How the game works

Each **Ante** has three blinds: Small, Big, and a **Boss**. Beat a blind's chip
target before you run out of hands, spend your winnings in the shop, repeat.
Clear Ante 8 to win, then continue into endless mode if you want.

**Scoring.** Play up to 5 cards. The poker hand you make sets a base
*chips* and *Mult*; every scoring card adds its own chips; then your Jokers fire
**left to right**. Final score is `chips × Mult`.

Joker order matters enormously — a Joker that *adds* Mult is worth far less if
it fires after one that *multiplies* it. Buy and sell to arrange them.

**Getting stronger** comes from three places:

- **Planet cards** permanently level up one poker hand. The cheapest, most
  reliable power in the game.
- **Tarot cards** upgrade individual playing cards — select cards in your hand
  first, then tap the Tarot.
- **Jokers**, especially the ones that grow over a run.

**Money.** You earn $1 interest per $5 held at the end of each round, up to a
cap. Hoarding early buys the Jokers that win late.

**Bosses.** Every Boss Blind breaks a rule — debuffing a suit, taking your
discards, demanding exactly five cards. Read it on the blind select screen and
plan around it.

Press and hold **any** card or Joker to read exactly what it does.

### Learning it

Your first run offers a **guided walkthrough** — a spotlight and a coach bubble
that talk you through one real round while you play it. You can start it any
time from **How to Play**, which also carries a worked scoring example showing
exactly how a pair of Kings turns into 180 points.

### The art

Every joker's face is generated from its own key — hat, eyes, mouth and palette
are all picked deterministically, so the same joker always looks the same and
no image files ship at all. See `js/art.js`.

### What's in it

| | |
| --- | --- |
| Jokers | 101 across 4 rarities — 95 buyable, plus 5 legendaries and 1 that only spawns |
| Consumables | 52 — 22 Tarot, 12 Planet, 18 Spectral |
| Boss blinds | 23, including 3 ante-8 finishers |
| Vouchers | 31, in upgrade pairs |
| Booster packs | 15 types |
| Skip tags | 15 |
| Starting decks | 16, each changing the opening rules |
| Card modifiers | 8 enhancements, 4 editions, 4 seals |

Runs are seeded — enter a seed on the new-run screen and you get the same run
every time.

---

## Development

No build step, no framework, no bundler. Plain ES modules loaded straight by the
browser; editing a file and reloading is the whole dev loop.

```
index.html              app shell
manifest.webmanifest    home-screen install metadata
sw.js                   service worker (offline cache)
css/style.css           all styling
js/
  main.js               entry point, service worker registration
  ui.js                 rendering and input — owns the DOM
  game.js               run state, scoring pipeline, rules transitions
  poker.js              hand detection, hand-level table
  cards.js              card model: enhancements, editions, seals
  jokers.js             101 joker definitions and their hooks
  consumables.js        Tarot / Planet / Spectral definitions
  blinds.js             antes, blinds, boss abilities, skip tags
  shop.js               shop stock, packs, vouchers
  decks.js              starting decks
  save.js               localStorage persistence
  art.js                procedural cartoon SVG — joker faces, card backs
  anim.js               FLIP flights, confetti, screen shake, staggered reveals
  tutorial.js           the guided walkthrough (spotlight + coach bubble)
  audio.js              WebAudio sound effects (no asset files)
  util.js               seeded RNG, formatting, DOM helper
tools/                  tests and generators (not deployed)
```

The split that matters: **`game.js` owns the rules, `ui.js` owns the DOM.**
Scoring is a pure-ish producer — it emits an ordered list of events with both
per-step deltas and running totals, which the UI replays one beat at a time.
That is why the animation can be paused, sped up, or skipped without the maths
ever changing.

### Tests

```bash
npm test                       # 64 assertions: rules, data sanity, deploy drift
node tools/simulate.mjs 400    # fuzz: bots 400 full runs, fails on crash/NaN
node tools/balance.mjs 150     # difficulty probe with a greedy bot
npm i -D playwright
node tools/uitest.mjs --shots  # browser smoke test at 3 viewports (needs npm start)
```

`selftest.mjs` sweeps **every** joker through a full round, **every** consumable
through an apply, and **every** boss through a playable round, asserting no
crashes and no NaN. It also guards deployment drift: a new module that is not
precached by `sw.js` or listed in `bundle.mjs` fails the suite rather than
breaking offline play or the single-file build at runtime. `simulate.mjs` catches the state-machine bugs that unit
tests miss. `uitest.mjs` drives the real UI in Chromium at 390×844, 844×390 and
320×568, and fails on any console error or layout overflow.

### Generated files

```bash
npm run icons          # pure-Python PNG writer, no dependencies
npm run bundle         # rebuild dist/jokerdeck.html (single self-contained file)
```

---

## License

MIT.
