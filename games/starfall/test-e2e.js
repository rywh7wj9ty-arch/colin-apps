/* STARFALL headless e2e (v2).
 * Viewports: iPhone portrait 390x844 (touch), iPad 820x1180 + 1180x820 (touch), desktop 1440x900 (mouse).
 * Each run covers: title layout, all three worlds (first tap, no-guess board, HUD never over the planet,
 * Gas Giant cells big enough on touch), rotate / zoom / flag / flag mode / camera ease, a loss, a win with the
 * "First Light" achievement toast, stats sheet, settings (persist across reload), Zen shields + calm end, and the
 * Daily Planet (deterministic, matches logic.js). Fails on any console error/warning.
 * Usage: node test-e2e.js [iphone|ipad-portrait|ipad-landscape|desktop]
 * Needs: a static server on SF_BASE (default http://127.0.0.1:8767/) serving this folder; puppeteer-core; Chrome.
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const L = require('./logic.js');
const OUT = process.env.SF_OUT || '/tmp/starfall-v2';
const BASE = process.env.SF_BASE || 'http://127.0.0.1:8767/';
const DAY = '2026-10-07';
const URL = `${BASE}?debug&seed=11&lp=1200&date=${DAY}`;
const HOLD = 1900;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const VIEWPORTS = [
  { label: 'iphone', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ua: IPHONE_UA },
  { label: 'ipad-portrait', width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ua: IPAD_UA },
  { label: 'ipad-landscape', width: 1180, height: 820, deviceScaleFactor: 1, isMobile: true, hasTouch: true, isLandscape: true, ua: IPAD_UA },
  { label: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const errors = [];
function check(name, cond, extra = '') { results.push({ name, ok: !!cond, extra }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra && !cond ? '  ' + extra : '')); }
fs.mkdirSync(OUT, { recursive: true });

function makeIO(page, vp) {
  const touch = !!vp.hasTouch;
  const io = {
    touch,
    async tap(x, y) { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); },
    async tapEl(sel) { const el = await page.$(sel); if (!el) throw new Error('missing ' + sel); const b = await el.boundingBox(); await io.tap(b.x + b.width / 2, b.y + b.height / 2); },
    async flag(x, y) {
      if (touch) { await page.touchscreen.touchStart(x, y); await sleep(HOLD); await page.touchscreen.touchEnd(); }
      else await page.mouse.click(x, y, { button: 'right' });
      await sleep(250);
    },
    async drag(x0, y0, x1, y1, steps = 12) {
      if (touch) {
        await page.touchscreen.touchStart(x0, y0);
        for (let i = 1; i <= steps; i++) { await page.touchscreen.touchMove(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(16); }
        await page.touchscreen.touchEnd();
      } else {
        await page.mouse.move(x0, y0); await page.mouse.down();
        for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(16); }
        await page.mouse.up();
      }
    },
    async zoom(cx, cy, dir) {   // dir > 0 zoom in
      if (!touch) { await page.mouse.move(cx, cy); await page.mouse.wheel({ deltaY: dir > 0 ? -400 : 400 }); return; }
      const c = await page.target().createCDPSession();
      const [d0, d1] = dir > 0 ? [80, 220] : [220, 100];
      const pts = d => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
      await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) });
      for (let i = 1; i <= 10; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + (d1 - d0) * i / 10) }); await sleep(20); }
      await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await c.detach();
    },
  };
  return io;
}
const info = page => page.evaluate(() => SF.info());
const settled = (page, t = 9000) => page.waitForFunction(() => SF.settled(), { timeout: t, polling: 100 }).catch(() => {});
const shown = (page, id, t = 9000) => page.waitForFunction(id => !document.getElementById(id).classList.contains('hidden'), { timeout: t }, id);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const rectOf = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e || e.classList.contains('hidden') || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }, sel);
function circleHitsRect(c, r) {
  const x = Math.max(r.left, Math.min(c.cx, r.right)), y = Math.max(r.top, Math.min(c.cy, r.bottom));
  return Math.hypot(c.cx - x, c.cy - y) < c.r - 1;
}
async function backToTitle(page, io) {
  await io.tapEl('#btn-home'); await shown(page, 'title'); await sleep(900);
}
async function chooseMode(page, io, play) { await io.tapEl(`#modes button[data-play="${play}"]`); await sleep(500); }
async function launch(page, io, world) {
  if (world) { await io.tapEl(`.diff[data-diff="${world}"]`); await sleep(500); }
  await io.tapEl('#btn-play'); await sleep(1600); await settled(page);
}
async function firstTap(page, io) {
  const cells = await page.evaluate(() => SF.visibleCells('hidden'));
  await io.tap(cells[0].x, cells[0].y); await sleep(400); await settled(page);
  return cells[0];
}

async function run(browser, vp) {
  const tag = vp.label;
  const ctx = await browser.createBrowserContext();       // fresh profile: no localStorage / SW from earlier runs
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warn' || m.type() === 'warning') errors.push(`[${tag}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${tag}] PAGEERROR: ${e.message}`));
  await page.setBypassServiceWorker(true);
  await page.setViewport(vp);
  if (vp.ua) await page.setUserAgent(vp.ua);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SF && document.getElementById('loading').classList.contains('out'), { timeout: 30000 });
  await sleep(1800);
  const io = makeIO(page, vp);
  const W = vp.width, H = vp.height;

  /* ---------- title */
  await shot(page, `${tag}-01-title`);
  const lay = await page.evaluate(() => ['.brand', '#modes', '#diffs', '.launch', '#howto'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { s, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
  const inView = lay.every(r => r.top >= -0.5 && r.bottom <= H + 0.5 && r.left >= -0.5 && r.right <= W + 0.5);
  const ordered = lay.every((r, i) => i === 0 || r.top >= lay[i - 1].bottom - 0.5);
  check(`${tag}: title layout fits the screen, no overlaps`, inView && ordered, JSON.stringify(lay));

  /* ---------- each world: first tap, no-guess board, HUD clear of planet */
  for (const world of ['moon', 'planet', 'giant']) {
    await launch(page, io, world);
    let I = await info(page);
    check(`${tag}: ${world} launches`, I && I.mode === 'playing' && I.world === world && I.N === L.DIFFICULTIES[world].cells, JSON.stringify(I));
    const pr = await page.evaluate(() => SF.planetRect());
    const hud = { bar: await rectOf(page, '#hud .bar'), flag: await rectOf(page, '#btn-flag'), chip: await rectOf(page, '#chip') };
    if (world !== 'giant' || !io.touch) {
      const hits = Object.entries(hud).filter(([, r]) => r && circleHitsRect(pr, r)).map(([k]) => k);
      check(`${tag}: ${world} HUD never covers the planet`, hits.length === 0, `hits=${hits} planet=${JSON.stringify(pr)} hud=${JSON.stringify(hud)}`);
    }
    await firstTap(page, io);
    I = await info(page);
    check(`${tag}: ${world} first tap opens an area on a no-guess board`, I.revealed > 7 && I.status === 'playing' && I.solvable === true, JSON.stringify(I));
    const px = await page.evaluate(() => SF.cellPx());
    if (world === 'giant' && io.touch) check(`${tag}: Gas Giant cells are finger-sized (${px.toFixed(1)} px >= 32)`, px >= 32);
    await sleep(900);
    await shot(page, `${tag}-02-world-${world}`);
    await backToTitle(page, io);
  }

  /* ---------- Planet: gestures, flags, camera ease, then a loss */
  await launch(page, io, 'planet');
  const q0 = await page.evaluate(() => SF.view.q.toArray());
  await io.drag(W * 0.3, H * 0.5, W * 0.7, H * 0.44); await sleep(700);
  const q1 = await page.evaluate(() => SF.view.q.toArray());
  const dq = Math.abs(q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3]);
  check(`${tag}: drag rotates the planet without revealing`, dq < 0.995 && (await info(page)).revealed === 0, `|q0.q1|=${dq.toFixed(4)}`);
  await settled(page);
  const d0 = await page.evaluate(() => SF.view.distTarget);
  await io.zoom(W / 2, H / 2, +1); await sleep(500);
  const d1 = await page.evaluate(() => SF.view.distTarget);
  check(`${tag}: ${io.touch ? 'pinch' : 'wheel'} zooms in`, d1 < d0 - 0.05, `${d0.toFixed(2)} -> ${d1.toFixed(2)}`);
  await io.zoom(W / 2, H / 2, -1); await sleep(900); await settled(page);
  await firstTap(page, io);
  let mines = await page.evaluate(() => SF.visibleCells('mine'));
  await io.flag(mines[0].x, mines[0].y);
  let I = await info(page);
  check(`${tag}: ${io.touch ? 'long-press' : 'right-click'} flags a cell`, I.flags === 1, JSON.stringify(I));
  await io.tapEl('#btn-flag'); await sleep(200);
  mines = await page.evaluate(() => SF.visibleCells('mine'));
  await io.tap(mines[0].x, mines[0].y); await sleep(300);
  I = await info(page);
  check(`${tag}: flag mode: a tap flags`, I.flagMode === true && I.flags === 2, JSON.stringify(I));
  await io.tapEl('#btn-flag'); await sleep(200);
  await sleep(1200); await shot(page, `${tag}-03-flags`);
  // camera ease: tap a safe cell near the limb; the camera should swing toward it
  const edge = await page.evaluate(() => { const c = SF.visibleCells('safe').filter(c => c.f < 0.85).sort((a, b) => a.f - b.f)[0]; return c || null; });
  if (edge) {
    await io.tap(edge.x, edge.y); await sleep(120);
    const easing = await page.evaluate(() => !!SF.view.ease);
    await settled(page);
    const f1 = await page.evaluate(i => SF.screenOf(i).facing, edge.i);
    check(`${tag}: tapping near the edge eases the camera toward it`, easing && f1 > edge.f + 0.05, `facing ${edge.f.toFixed(2)} -> ${f1.toFixed(2)}`);
  } else check(`${tag}: edge cell for camera ease available`, false);
  // loss
  mines = await page.evaluate(() => SF.visibleCells('mine'));
  await io.tap(mines[0].x, mines[0].y);
  await sleep(380); await shot(page, `${tag}-04-explosion`);
  I = await info(page);
  check(`${tag}: tapping a mine loses`, I.status === 'lost', JSON.stringify(I));
  await sleep(1500); await shot(page, `${tag}-05-mines-lit`);
  await shown(page, 'result'); await sleep(900);
  await shot(page, `${tag}-06-loss-card`);
  check(`${tag}: loss card`, (await page.evaluate(() => document.getElementById('res-title').textContent)) === 'Planet lost');

  /* ---------- win + achievement toast */
  await io.tapEl('#res-again'); await sleep(1400); await settled(page);
  I = await info(page);
  check(`${tag}: play again resets`, I.status === 'ready' && I.revealed === 0 && I.flags === 0);
  await firstTap(page, io);
  const keep = await page.evaluate(() => SF.almostWin());
  await sleep(700);
  const ks = await page.evaluate(i => SF.screenOf(i), keep);
  await io.tap(ks.x, ks.y);
  await sleep(1100); await shot(page, `${tag}-07-win`);
  I = await info(page);
  check(`${tag}: last safe tap wins`, I.status === 'won', JSON.stringify(I));
  const toastOk = await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast.ach')].some(t => t.textContent.includes('First Light')), { timeout: 9000 }).then(() => true, () => false);
  await sleep(500); await shot(page, `${tag}-08-achievement-toast`);
  check(`${tag}: "First Light" achievement toast`, toastOk);
  await shown(page, 'result'); await sleep(1000);
  await shot(page, `${tag}-09-win-card`);
  check(`${tag}: win card + best time`, (await page.evaluate(() => document.getElementById('res-title').textContent)) === 'World saved' &&
    (await page.evaluate(() => SF.stats.worlds.planet.best)) > 0);
  await io.tapEl('#res-menu'); await shown(page, 'title'); await sleep(900);
  check(`${tag}: title card shows the best time`, (await page.evaluate(() => document.querySelector('.diff[data-diff="planet"] .b').textContent)).includes('★'));

  /* ---------- stats sheet */
  await io.tapEl('#btn-stats'); await page.waitForSelector('#sheet.in'); await sleep(500);
  const st = await page.evaluate(() => ({ title: document.getElementById('sheet-title').textContent, tiles: [...document.querySelectorAll('#sheet-body .tiles')[0].querySelectorAll('b')].map(b => b.textContent), got: !!document.querySelector('.ach.got[data-ach="first_win"]'), stats: SF.stats }));
  check(`${tag}: stats sheet (played/wins/rate/streak + achievements)`, st.title === 'Stats' && st.stats.played === 5 && st.stats.wins === 1 && st.tiles[0] === '5' && st.tiles[1] === '1' && st.tiles[2] === '20%' && st.got,
    JSON.stringify({ tiles: st.tiles, played: st.stats.played, wins: st.stats.wins }));
  await shot(page, `${tag}-10-stats`);
  await io.tapEl('#sheet-close'); await sleep(500);

  /* ---------- settings persist across reload */
  await io.tapEl('#btn-settings'); await page.waitForSelector('#sheet.in'); await sleep(400);
  await io.tapEl('#set-cb'); await io.tapEl('#set-motion'); await io.tapEl('#set-muteall');
  await page.evaluate(() => { const r = document.getElementById('set-lp'); r.value = 500; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(300); await shot(page, `${tag}-11-settings`);
  await io.tapEl('#sheet-close'); await sleep(400);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.SF && document.getElementById('loading').classList.contains('out'), { timeout: 30000 }); await sleep(800);
  const s1 = await page.evaluate(() => ({ ...SF.settings, rm: document.documentElement.classList.contains('reduce-motion') }));
  check(`${tag}: settings persist (colour-blind, reduced motion, mute all, hold 500ms)`, s1.colorBlind && s1.reducedMotion && s1.rm && s1.muteAll && s1.longPress === 500 && s1.noGuess && s1.haptics, JSON.stringify(s1));
  // colour-blind board look, then switch everything back
  await launch(page, io, 'planet'); await firstTap(page, io); await sleep(600);
  await shot(page, `${tag}-12-colourblind-board`);
  await backToTitle(page, io);
  await io.tapEl('#btn-settings'); await page.waitForSelector('#sheet.in'); await sleep(300);
  await io.tapEl('#set-cb'); await io.tapEl('#set-motion'); await io.tapEl('#set-muteall');
  await io.tapEl('#sheet-close'); await sleep(400);

  /* ---------- Zen: shields absorb mistakes, 4th ends calmly */
  await chooseMode(page, io, 'zen');
  await launch(page, io, 'planet');
  I = await info(page);
  check(`${tag}: Zen starts with 3 shields + chip`, I.play === 'zen' && I.shields === 3 && !!(await rectOf(page, '#chip')), JSON.stringify(I));
  await firstTap(page, io);
  mines = await page.evaluate(() => SF.visibleCells('mine'));
  await io.tap(mines[0].x, mines[0].y); await sleep(500);
  I = await info(page);
  check(`${tag}: Zen: a mine cracks a shield and play continues`, I.status === 'playing' && I.shields === 2 && I.mistakes === 1, JSON.stringify(I));
  await sleep(300); await shot(page, `${tag}-13-zen-shield`);
  for (let k = 0; k < 3; k++) {
    await settled(page);
    mines = await page.evaluate(() => SF.visibleCells('mine'));
    if (!mines.length) { await io.drag(W * 0.5, H * 0.5, W * 0.5 + 80, H * 0.5, 4); await sleep(900); await settled(page); mines = await page.evaluate(() => SF.visibleCells('mine')); }
    await io.tap(mines[0].x, mines[0].y); await sleep(600);
  }
  I = await info(page);
  check(`${tag}: Zen: 4th mistake ends the run calmly`, I.status === 'lost' && I.shields === 0, JSON.stringify(I));
  await shown(page, 'result'); await sleep(900);
  check(`${tag}: Zen end card says "Out of shields"`, (await page.evaluate(() => document.getElementById('res-title').textContent)) === 'Out of shields');
  await shot(page, `${tag}-14-zen-end`);
  await io.tapEl('#res-menu'); await shown(page, 'title'); await sleep(700);

  /* ---------- Daily Planet */
  await chooseMode(page, io, 'daily');
  const plan = L.dailyPlan(DAY, L.buildGoldberg(7));
  const card = await page.evaluate(() => document.querySelector('.diff.daily').textContent);
  check(`${tag}: Daily card shows #${plan.number} + streak`, card.includes(`Daily Planet #${plan.number}`) && card.includes('day streak'), card);
  await shot(page, `${tag}-15-daily-title`);
  await io.tapEl('#btn-play'); await sleep(3200); await settled(page);
  I = await info(page);
  const ref = L.dailyGame(DAY, L.buildGoldberg(7), L.DIFFICULTIES.planet.mines).game;
  const sameMines = await page.evaluate(m => [...SF.state.game.mine].join('') === m, [...ref.mine].join(''));
  check(`${tag}: Daily board matches logic.js (date, theme, landing, mines) and landing zone is open`,
    I.play === 'daily' && I.daily.key === DAY && I.theme === plan.theme && I.daily.landing === plan.landing && sameMines && I.revealed > 7 && I.solvable === true, JSON.stringify(I));
  await sleep(600); await shot(page, `${tag}-16-daily`);
  await page.evaluate(() => SF.forceWin()); await sleep(800);
  const dawn = await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some(t => t.textContent.includes('Dawn Patrol')), { timeout: 12000 }).then(() => true, () => false);
  await shown(page, 'result'); await sleep(900);
  await shot(page, `${tag}-17-daily-win`);
  const ds = await page.evaluate(d => ({ h: SF.stats.daily.history[d], streak: SF.stats.daily.streak, kicker: document.getElementById('res-kicker').textContent }), DAY);
  check(`${tag}: Daily win records today's time, streak 1, "Dawn Patrol" toast`, ds.h > 0 && ds.streak === 1 && dawn && ds.kicker.includes('Daily Planet'), JSON.stringify(ds));
  await io.tapEl('#res-menu'); await shown(page, 'title'); await sleep(700);
  check(`${tag}: Daily card shows cleared today`, (await page.evaluate(() => document.querySelector('.diff.daily').textContent)).includes('Cleared today'));
  console.log(`  (${tag}: headless swiftshader fps ≈ ${(await page.evaluate(() => SF.fps)).toFixed(1)})`);
  await ctx.close();
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', timeout: 90000, protocolTimeout: 240000,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const only = process.argv[2];
  for (const vp of VIEWPORTS) {
    if (only && only !== vp.label) continue;
    try { await run(browser, vp); } catch (e) { console.log('EXCEPTION', vp.label, e.stack); results.push({ name: vp.label + ' exception', ok: false }); }
  }
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(errors.length ? 'Console errors/warnings:\n' + errors.join('\n') : 'No console errors or warnings');
  process.exit(failed.length || errors.length ? 1 : 0);
})();
