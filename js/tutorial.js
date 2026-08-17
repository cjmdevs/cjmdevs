// Interactive tutorial: a spotlight and a coach bubble that walk a new player
// through one real round. It never fakes the game — every step waits for the
// player to actually do the thing, on a live run.

import { el, $ } from './util.js';

const SEEN_KEY = 'jokerdeck.tutorial.done';

export const hasSeenTutorial = () => {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
};
export const markTutorialSeen = () => {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
};

/**
 * Steps run in order. Each has:
 *   text    what the coach says
 *   target  CSS selector to spotlight (optional — omitted means centre screen)
 *   place   'above' | 'below' — which side of the target the bubble sits
 *   until   () => boolean, advance automatically once true
 *   button  label for a manual "next" when there is nothing to wait for
 *   enter   side effect when the step opens
 */
function steps(api) {
  const G = () => api.game();
  return [
    {
      text: "Welcome. The goal is simple: make poker hands worth enough chips to beat each blind. Let's play one round together.",
      button: 'Show me',
    },
    {
      text: 'This is the blind you are facing, and the score you have to beat. Tap here to start it.',
      target: '.sheet footer .btn.green',
      place: 'above',
      until: () => G()?.phase === 'playing',
    },
    {
      text: 'Here is your hand. Tap cards to select up to 5 of them — try to pick a pair, or just the two highest cards.',
      target: '#hand',
      place: 'above',
      until: () => (G()?.selected.length ?? 0) >= 2,
    },
    {
      text: 'See the readout? It names your hand and shows its base chips × Mult. Better hands start from much bigger numbers.',
      target: '#hand-name',
      place: 'above',
      button: 'Got it',
    },
    {
      text: 'Now play it. Watch the numbers on the left build up, then get multiplied by the number on the right.',
      target: '#btn-play',
      place: 'above',
      until: () => (G()?.stats.handsPlayed ?? 0) > 0,
    },
    {
      text: 'That score went toward the target at the top. You get a few hands per blind — the bar shows how close you are.',
      target: '#scoreline',
      place: 'below',
      button: 'Next',
    },
    {
      text: "Dealt a bad hand? Select the cards you don't want and Discard them for new ones. It costs a discard, not a hand.",
      target: '#btn-discard',
      place: 'above',
      button: 'Next',
    },
    {
      text: 'Jokers go here, and they are what actually win runs. They fire left to right after your cards score.',
      target: '#jokers',
      place: 'below',
      button: 'Next',
    },
    {
      text: 'Press and hold any card or Joker — at any time — to read exactly what it does. That is the whole rulebook.',
      target: '#hand',
      place: 'above',
      button: 'Next',
    },
    {
      text: 'Beat the blind and you reach the shop, where you buy Jokers, Planet cards that level up a hand forever, and booster packs. That is the loop. Good luck.',
      button: 'Play',
      last: true,
    },
  ];
}

export function startTutorial(api) {
  const list = steps(api);
  let i = 0;
  let poll = null;

  const layer = el('div.tut-layer', { 'aria-live': 'polite' });
  const hole = el('div.tut-hole');
  const bubble = el('div.tut-bubble');
  layer.append(hole, bubble);
  document.body.appendChild(layer);

  const cleanup = () => {
    clearInterval(poll);
    layer.remove();
    markTutorialSeen();
    api.onDone?.();
  };

  const position = (step) => {
    const node = step.target ? $(step.target) : null;
    if (!node) {
      hole.style.opacity = '0';
      bubble.style.left = '50%';
      bubble.style.top = '50%';
      bubble.style.transform = 'translate(-50%, -50%)';
      return;
    }
    const r = node.getBoundingClientRect();
    const pad = 8;
    hole.style.opacity = '1';
    hole.style.left = `${r.left - pad}px`;
    hole.style.top = `${r.top - pad}px`;
    hole.style.width = `${r.width + pad * 2}px`;
    hole.style.height = `${r.height + pad * 2}px`;

    bubble.style.transform = 'none';
    const bw = Math.min(320, window.innerWidth - 24);
    bubble.style.width = `${bw}px`;
    let left = r.left + r.width / 2 - bw / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - bw - 12));
    bubble.style.left = `${left}px`;

    // Measure after width is applied so the height is real.
    const bh = bubble.offsetHeight;
    let top = step.place === 'below' ? r.bottom + 14 : r.top - bh - 14;
    if (top < 12) top = r.bottom + 14;
    if (top + bh > window.innerHeight - 12) top = Math.max(12, r.top - bh - 14);
    bubble.style.top = `${top}px`;
  };

  const render = () => {
    const step = list[i];
    if (!step) return cleanup();

    step.enter?.();
    bubble.replaceChildren(
      el('div.tut-count', { text: `${i + 1} / ${list.length}` }),
      el('p.tut-text', { text: step.text }),
      el('div.tut-actions', {}, [
        step.button
          ? el('button.btn.tiny.tut-next', { text: step.button, onclick: () => advance() })
          : el('span.tut-hint', { text: 'Go ahead — I will wait.' }),
        el('button.tut-skip', { text: 'Skip', onclick: cleanup }),
      ]),
    );

    // Two frames: one for layout, one for the measured reposition.
    requestAnimationFrame(() => { position(step); requestAnimationFrame(() => position(step)); });

    clearInterval(poll);
    if (step.until) {
      poll = setInterval(() => {
        if (step.until()) advance();
        else position(step);
      }, 220);
    } else {
      poll = setInterval(() => position(step), 400);
    }
  };

  const advance = () => {
    clearInterval(poll);
    i += 1;
    if (i >= list.length) return cleanup();
    render();
  };

  window.addEventListener('resize', () => position(list[i]));
  render();
  return { stop: cleanup };
}
