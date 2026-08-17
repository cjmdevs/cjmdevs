// Entry point: boot the UI, register the service worker, keep the run saved.

import { boot, render, currentGame } from './ui.js';
import { saveRun } from './save.js';

boot();

// Offline support + home-screen install. Fails silently on file:// or http.
// The single-file build has no sw.js sitting next to it, so it opts out.
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.__INLINE_BUILD__) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline play unavailable */ });
  });
}

// Flush the run to storage whenever the app is backgrounded — mobile browsers
// kill tabs without warning, and `visibilitychange` is the only reliable hook.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  const G = currentGame();
  if (G) saveRun(G);
});

// The address bar hides and shows on scroll in mobile Safari, which changes the
// viewport height. Re-run layout so the hand fan never overflows.
const fixViewport = () => {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
};
fixViewport();
window.addEventListener('resize', fixViewport);
window.addEventListener('orientationchange', () => setTimeout(fixViewport, 150));

// Prevent iOS double-tap-to-zoom on the game board without blocking taps.
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 320) e.preventDefault();
  lastTouch = now;
}, { passive: false });

export { render };
