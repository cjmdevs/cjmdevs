// Browser smoke test: drives the real UI on a phone-sized viewport and fails on
// any console error, page error or failed request.
// Usage: node tools/uitest.mjs [baseUrl] [--shots]

import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';

/** The preinstalled browser lives outside Playwright's own download cache. */
function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/opt/pw-browsers/chromium',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:8099';
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = 'tools/screenshots';

const problems = [];
const steps = [];

async function main() {
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

  const exe = chromePath();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },      // iPhone 14-ish
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));

  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` }); };
  const step = (name, ok, detail = '') => {
    steps.push(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) problems.push(`step failed: ${name} ${detail}`);
  };

  // Accept either a directory (served index.html) or a direct .html file, so the
  // same suite can verify the modular app and the single-file bundle.
  const target = BASE.endsWith('.html') ? BASE : `${BASE}/index.html`;
  await page.goto(target, { waitUntil: 'networkidle' });

  // ---------------------------------------------------------- main menu ----
  await page.waitForSelector('.sheet');
  const title = await page.textContent('.sheet .body');
  step('main menu renders', /JOKERDECK/.test(title));
  await shot('01-menu');

  // ------------------------------------------------------------ new run ----
  await page.click('.sheet footer button:has-text("Play")');
  await page.waitForSelector('text=Choose a deck');
  step('deck picker renders', (await page.locator('.choice').count()) >= 10,
    `${await page.locator('.choice').count()} decks`);
  await shot('02-newrun');

  await page.click('.sheet button:has-text("Start Run")');
  await page.waitForSelector('.blind-grid');
  step('blind select renders', (await page.locator('.blind-card').count()) === 3);
  await shot('03-blindselect');

  // ------------------------------------------------------------ playing ----
  await page.click('.sheet button:has-text("Play Small Blind")');
  await page.waitForSelector('#hand .card');
  const dealt = await page.locator('#hand .card').count();
  step('a full hand is dealt', dealt === 8, `${dealt} cards`);

  // The hand must not overflow the screen.
  const fit = await page.evaluate(() => {
    const row = document.getElementById('hand');
    const r = row.getBoundingClientRect();
    const cards = [...row.querySelectorAll('.card')].map((c) => c.getBoundingClientRect());
    return {
      rowLeft: Math.round(r.left), rowRight: Math.round(r.right),
      firstLeft: Math.round(cards[0]?.left ?? 0),
      lastRight: Math.round(cards[cards.length - 1]?.right ?? 0),
      vw: window.innerWidth,
      overlap: getComputedStyle(document.documentElement).getPropertyValue('--hand-overlap'),
      cardW: Math.round(cards[0]?.width ?? 0),
    };
  });
  step('hand fits the viewport', fit.firstLeft >= -1 && fit.lastRight <= fit.vw + 1,
    `cards ${fit.firstLeft}..${fit.lastRight} of ${fit.vw}, cardW=${fit.cardW}, overlap=${fit.overlap.trim()}`);

  const noHScroll = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1);
  step('page does not scroll horizontally', noHScroll);

  await shot('04-playing');

  // Select cards and confirm the live hand readout updates.
  await page.locator('#hand .card').nth(0).click();
  await page.locator('#hand .card').nth(1).click();
  const selCount = await page.locator('#hand .card.sel').count();
  step('tapping selects cards', selCount === 2, `${selCount} selected`);
  const handName = await page.textContent('#hand-name');
  step('hand name preview shows', handName.trim().length > 0, handName.trim());
  await shot('05-selected');

  // ---------------------------------------------------------- scoring -------
  const scoreBefore = await page.textContent('#score-value');
  await page.click('#btn-play');
  await page.waitForFunction(
    (before) => document.getElementById('score-value').textContent !== before,
    scoreBefore, { timeout: 15000 },
  );
  await page.waitForTimeout(2500);
  const scoreAfter = await page.textContent('#score-value');
  step('playing a hand scores', scoreAfter !== scoreBefore, `${scoreBefore} -> ${scoreAfter}`);
  step('score is a real number', /^[\d,]+$/.test(scoreAfter.trim()), scoreAfter);
  await shot('06-scored');

  // ---------------------------------------------------------- discard -------
  const discardsBefore = await page.textContent('#hud-discards');
  await page.locator('#hand .card').nth(0).click();
  await page.click('#btn-discard');
  await page.waitForTimeout(400);
  const discardsAfter = await page.textContent('#hud-discards');
  step('discarding spends a discard', Number(discardsAfter) === Number(discardsBefore) - 1,
    `${discardsBefore} -> ${discardsAfter}`);
  const refilled = await page.locator('#hand .card').count();
  step('hand refills after a discard', refilled === 8, `${refilled} cards`);

  // ---------------------------------------------------------- sorting -------
  await page.click('#btn-sort-suit');
  await page.waitForTimeout(150);
  await page.click('#btn-sort-rank');
  await page.waitForTimeout(150);
  step('sort buttons work', (await page.locator('#hand .card').count()) === 8);

  // ---------------------------------------------------------- run info -----
  // The topbar is only reachable while playing; blind select is modal by design.
  await page.click('#btn-info');
  await page.waitForSelector('text=Poker hands', { timeout: 5000 });
  const handRows = await page.locator('.table tbody tr').count();
  step('run info lists every poker hand', handRows >= 12, `${handRows} rows`);
  await shot('11-runinfo');
  await page.click('.sheet footer button:has-text("Back")');
  await page.waitForSelector('#overlay', { state: 'hidden', timeout: 5000 });
  step('closing run info returns to the board', true);

  // ------------------------------------------------------------ pause menu --
  await page.click('#btn-menu');
  await page.waitForSelector('text=Abandon Run', { timeout: 5000 });
  step('pause menu opens', true);
  await shot('12-pause');
  await page.click('.sheet footer button:has-text("Resume")');
  await page.waitForSelector('#overlay', { state: 'hidden', timeout: 5000 });

  // ------------------------------------------------------- long-press tip ---
  const card = page.locator('#hand .card').first();
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const tipVisible = await page.locator('#tip:not([hidden])').count();
  step('long-press opens the card tooltip', tipVisible === 1);
  await shot('07-tooltip');
  await page.mouse.click(200, 60);

  // ------------------------------------------------------- win the blind ----
  // Force a win through the exposed module so we can reach the shop.
  await page.evaluate(() => window.__test.forceWin());
  await page.waitForSelector('text=Cash Out', { timeout: 5000 });
  step('cash-out screen appears', true);
  await shot('08-cashout');

  await page.click('.sheet footer button:has-text("Cash Out")');
  await page.waitForSelector('text=For sale', { timeout: 5000 });
  const shopItems = await page.locator('.shop-item').count();
  step('shop renders with stock', shopItems >= 2, `${shopItems} tiles`);
  await shot('09-shop');

  // Buying should not throw even when broke.
  const buyBtn = page.locator('.shop-item button:has-text("Buy")').first();
  if (await buyBtn.count()) await buyBtn.click();
  await page.waitForTimeout(300);

  // Open a pack.
  const openBtn = page.locator('button:has-text("Open")').first();
  if (await openBtn.count()) {
    await page.evaluate(() => window.__test.giveMoney(50));
    await page.locator('button:has-text("Open")').first().click();
    await page.waitForTimeout(400);
    const opts = await page.locator('.shop-item').count();
    step('booster pack opens with choices', opts >= 2, `${opts} options`);
    await shot('10-pack');
    const take = page.locator('button:has-text("Take")').first();
    if (await take.count()) await take.click();
    await page.waitForTimeout(300);
    const skip = page.locator('.sheet footer button:has-text("Skip Pack")');
    if (await skip.count()) await skip.click();
    await page.waitForTimeout(300);
  }

  // ---------------------------------------------------------- run info ------
  await page.locator('.sheet footer button:has-text("Next Blind")').click();
  await page.waitForSelector('.blind-grid', { timeout: 5000 });
  step('returns to blind select after the shop', true);

  // ------------------------------------------------------- persistence -----
  const seedBefore = await page.evaluate(() => window.__test.seed());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const seedAfter = await page.evaluate(() => window.__test.seed());
  step('the run survives a reload', seedBefore === seedAfter, `${seedBefore} -> ${seedAfter}`);

  // ---------------------------------------------------------- landscape ----
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  const landscapeOk = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1
    && document.documentElement.scrollHeight <= window.innerHeight + 1);
  step('landscape does not overflow', landscapeOk);
  await shot('13-landscape');

  // ---------------------------------------------------------- small phone ---
  await page.setViewportSize({ width: 320, height: 568 });   // iPhone SE 1st gen
  await page.waitForTimeout(300);
  const smallOk = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1);
  step('320px-wide phone does not overflow', smallOk);
  await shot('14-small');

  await browser.close();
}

main().then(() => {
  console.log(steps.join('\n'));
  if (problems.length) {
    console.error(`\n${problems.length} problems:`);
    for (const p of [...new Set(problems)]) console.error('  ✗ ' + p);
    process.exit(1);
  }
  console.log('\nUI smoke test passed');
}).catch((err) => {
  console.log(steps.join('\n'));
  console.error('\nfatal: ' + err.message);
  process.exit(1);
});
