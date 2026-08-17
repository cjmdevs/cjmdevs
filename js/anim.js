// Animation helpers. Everything here is decoration: if a caller skips these,
// the game still plays correctly, so each one degrades to a no-op cleanly.

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for an element's running animations, with a hard ceiling. */
export function settled(node, cap = 700) {
  if (!node?.getAnimations) return sleep(0);
  const running = node.getAnimations();
  if (!running.length) return sleep(0);
  return Promise.race([
    Promise.allSettled(running.map((a) => a.finished)),
    sleep(cap),
  ]);
}

/**
 * FLIP: move `node` as if it had travelled from `fromRect` to where it is now.
 * Used to fly cards from the hand into the play area without reparenting jank.
 */
export function flipFrom(node, fromRect, { duration = 340, delay = 0, spin = 0 } = {}) {
  if (reduced()) return sleep(0);
  const to = node.getBoundingClientRect();
  const dx = fromRect.left - to.left;
  const dy = fromRect.top - to.top;
  if (!dx && !dy && !spin) return sleep(0);

  const anim = node.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) rotate(${-spin}deg)`, offset: 0 },
      { transform: 'translate(0, 0) rotate(0deg)', offset: 1 },
    ],
    { duration, delay, easing: 'cubic-bezier(.2, .9, .3, 1.2)', fill: 'backwards' },
  );
  return anim.finished.catch(() => {});
}

/** Deal cards in with a staggered arc from the deck corner. */
export function dealIn(nodes, { from = null, stagger = 45 } = {}) {
  if (reduced() || !nodes.length) return sleep(0);
  const origin = from ?? { left: window.innerWidth - 40, top: window.innerHeight - 60 };
  const last = nodes.map((node, i) => {
    const to = node.getBoundingClientRect();
    return node.animate(
      [
        {
          transform: `translate(${origin.left - to.left}px, ${origin.top - to.top}px) rotate(${18 + i * 3}deg) scale(.7)`,
          opacity: 0,
        },
        { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
      ],
      { duration: 320, delay: i * stagger, easing: 'cubic-bezier(.2,.9,.3,1.15)', fill: 'backwards' },
    ).finished.catch(() => {});
  });
  return Promise.allSettled(last);
}

/** Throw cards off the bottom of the screen — used for discards. */
export function tossOut(nodes) {
  if (reduced() || !nodes.length) return sleep(0);
  return Promise.allSettled(nodes.map((node, i) => node.animate(
    [
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${(i % 2 ? 1 : -1) * (40 + i * 12)}px, 220px) rotate(${(i % 2 ? 1 : -1) * 55}deg)`, opacity: 0 },
    ],
    { duration: 320, delay: i * 35, easing: 'cubic-bezier(.5,0,.9,.4)', fill: 'forwards' },
  ).finished.catch(() => {})));
}

/** A short, sharp shake — scaled by how big the hit was. */
export function shake(node, strength = 1) {
  if (reduced() || !node) return;
  const a = 4 * strength;
  node.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-a}px, ${a * 0.6}px)` },
      { transform: `translate(${a}px, ${-a * 0.5}px)` },
      { transform: `translate(${-a * 0.6}px, 0)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: 220 + 60 * strength, easing: 'ease-out' },
  );
}

/** Squash-and-stretch pop, for jokers and cards as they trigger. */
export function pop(node, scale = 1.18) {
  if (reduced() || !node) return;
  node.animate(
    [
      { transform: 'scale(1,1) translateY(0)' },
      { transform: `scale(${scale * 0.94}, ${scale}) translateY(-14%)`, offset: 0.35 },
      { transform: `scale(${1 + (scale - 1) * 0.35}, ${1 - (scale - 1) * 0.25}) translateY(0)`, offset: 0.7 },
      { transform: 'scale(1,1) translateY(0)' },
    ],
    { duration: 380, easing: 'cubic-bezier(.2,1.4,.4,1)' },
  );
}

const CONFETTI = ['#ff5d55', '#29a8ff', '#f3b743', '#55d18b', '#b45be0', '#ffffff'];

/** Confetti burst from a point (or the screen centre). */
export function burst(host, { x = window.innerWidth / 2, y = window.innerHeight / 2, count = 34 } = {}) {
  if (reduced() || !host) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.className = 'confetti';
    bit.style.left = `${x}px`;
    bit.style.top = `${y}px`;
    bit.style.background = CONFETTI[i % CONFETTI.length];
    if (i % 3 === 0) bit.style.borderRadius = '50%';
    frag.appendChild(bit);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 90 + Math.random() * 190;
    bit.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 140}px)) rotate(${Math.random() * 720 - 360}deg) scale(.4)`,
          opacity: 0,
        },
      ],
      { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.15,.7,.4,1)', fill: 'forwards' },
    ).finished.catch(() => {}).then(() => bit.remove());
  }
  host.appendChild(frag);
}

/** Stagger children into view — used for shop tiles and menu rows. */
export function revealChildren(container, { stagger = 40, from = 12 } = {}) {
  if (reduced() || !container) return;
  const kids = [...container.children];
  kids.forEach((kid, i) => {
    kid.animate(
      [{ opacity: 0, transform: `translateY(${from}px) scale(.97)` }, { opacity: 1, transform: 'none' }],
      { duration: 260, delay: i * stagger, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'backwards' },
    );
  });
}

/** Flip a face-down card over. */
export function flipReveal(node) {
  if (reduced() || !node) return sleep(0);
  return node.animate(
    [
      { transform: 'rotateY(0deg)' },
      { transform: 'rotateY(90deg)', offset: 0.5 },
      { transform: 'rotateY(0deg)' },
    ],
    { duration: 380, easing: 'ease-in-out' },
  ).finished.catch(() => {});
}
