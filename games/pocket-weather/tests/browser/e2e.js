// Pocket Weather end-to-end tests. Usage: node e2e.js [chromium|webkit] [viewportName...]
const { chromium, webkit } = require('playwright');
const I = require('./input.js');
const { spawn } = require('child_process');
const DIST = '/workspace/pocket-weather/dist';
const URL0 = 'http://127.0.0.1:8769/';
const VIEWPORTS = {
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: false }
};
const engName = process.argv[2] || 'chromium', eng = engName === 'webkit' ? webkit : chromium;
const only = process.argv.slice(3);
let pass = 0, fail = 0; const failures = [];
function check(c, msg) { if (c) { pass++; console.log('   ok  ', msg); } else { fail++; failures.push(msg); console.log('   FAIL', msg); } }
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }, sel);
async function waitFor(p, fn, arg, ms = 30000) { try { await p.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch (e) { return false; } }
const settled = p => waitFor(p, () => window.__pw.settled(), null, 40000);

async function press(p, touch, sel) {   // real tap/click at the element's centre (some buttons gently pulse, so skip stability waits)
  const r = await p.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
  await pressAt(p, touch, r);
}
async function pressAt(p, touch, q) { if (touch) await p.touchscreen.tap(q.x, q.y); else await p.mouse.click(q.x, q.y); }

async function runViewport(browser, name) {
  const opts = VIEWPORTS[name];
  console.log(`\n== ${engName} / ${name} (${opts.viewport.width}x${opts.viewport.height}${opts.hasTouch ? ', touch' : ', mouse'})`);
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'allow' }, opts));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  p.on('requestfailed', r => { if (!/favicon/.test(r.url())) errors.push('requestfailed: ' + r.url()); });
  const shot = n => p.screenshot({ path: `/tmp/skyward-shots/${engName}-${name}-${n}.png` });
  const touch = opts.hasTouch;

  // 1. boots to the title screen
  await p.goto(URL0 + '?debug', { waitUntil: 'domcontentloaded', timeout: 90000 });
  check(await waitFor(p, () => window.__pw && window.__pw.ready && window.__pwBooted), 'boots (game ready, loading screen dismissed)');
  check(await visible(p, '#title'), 'title screen shows');
  check(await waitFor(p, () => { const l = document.getElementById('loading'); return !l || l.classList.contains('out'); }, null, 5000), 'loading spinner dismissed');
  await p.evaluate(() => __pw.time(3));            // speed the clockwork in slow software-GL engines
  await p.waitForTimeout(800); await shot('title');

  // 2. world map works (real taps / clicks on DOM + 3D map nodes)
  await press(p, touch, '#btn-play');
  check(await waitFor(p, () => __pw.screen() === 'map'), 'Play opens the world map');
  await p.waitForTimeout(1200); await shot('map');
  const n0 = await p.evaluate(() => __pw.nodePos(0));
  await pressAt(p, touch, n0);
  check(await waitFor(p, () => !document.getElementById('levelcard').classList.contains('hidden'), null, 8000), 'tapping the first island stop opens its level card');
  const lcTitle = await p.textContent('#lc-title');
  check(/\S/.test(lcTitle), `level card has a name ("${lcTitle}")`);
  await press(p, touch, '#lc-play');
  check(await waitFor(p, () => __pw.screen() === 'play' && __pw.state().level === '1-1'), 'level card Play starts level 1-1');
  check(await visible(p, '#hud'), 'HUD is visible in play');

  // 3. finish 1-1 with a real rain gesture (hold over the sprouts)
  await settled(p);
  let q = await p.evaluate(() => __pw.tilePos(4, 1));
  await I.hold(p, q);
  check(await waitFor(p, () => __pw.tile(4, 1) === 'vine'), 'hold = rain: sprouts grow into a vine bridge');
  check(await waitFor(p, () => __pw.state().won, null, 40000), 'wanderer walks across and level 1-1 is completed');
  check(await waitFor(p, () => !document.getElementById('result').classList.contains('hidden'), null, 15000), 'result card shows');
  await shot('win');
  const sv = await p.evaluate(() => __pw.save().levels['1-1']);
  check(sv && sv.done && sv.best === 1, 'win is saved with best weather count');

  // 4. each weather by touch/mouse
  await p.evaluate(() => __pw.load('1-2')); await settled(p);
  q = await p.evaluate(() => __pw.tilePos(4, 1));
  await pressAt(p, touch, q);                     // real touchscreen tap / mouse click
  check(await waitFor(p, () => __pw.tile(4, 1) === 'puddle', null, 8000), `tap = sun (${touch ? 'real touch' : 'mouse click'}): ice block melts`);

  await p.evaluate(() => __pw.load('2-1')); await settled(p);
  const a = await p.evaluate(() => __pw.tilePos(3, 1)), b = await p.evaluate(() => __pw.tilePos(6, 1));
  await I.swipe(p, a, b);
  check(await waitFor(p, () => __pw.obj(3, 1) === 0 && __pw.state().uses === 1, null, 8000), 'swipe = wind: the boat sails off');
  check(await waitFor(p, () => __pw.state().won, null, 40000), 'wind level 2-1 completes');

  await p.evaluate(() => __pw.load('3-1')); await settled(p);
  await press(p, touch, '#chip-cloud');
  check((await p.evaluate(() => __pw.state().cloud)) === 'snow', 'tapping the cloud chip switches rain to snow');
  q = await p.evaluate(() => __pw.tilePos(4, 1));
  await I.hold(p, q);
  check(await waitFor(p, () => __pw.tile(4, 1) === 'ice', null, 8000), 'hold with snow freezes the river');

  await p.evaluate(() => __pw.load('4-1')); await settled(p);
  await press(p, touch, '#chip-bolt');
  check(await p.evaluate(() => __pw.state().armed), 'lightning chip arms a bolt');
  q = await p.evaluate(() => __pw.tilePos(2, 1));
  await pressAt(p, touch, q);
  check(await waitFor(p, () => __pw.tile(2, 1) === 'rubble', null, 8000), 'tap with bolt armed shatters the boulder');

  // rotate the island (drag off-island / Q key) and retry
  const yaw0 = await p.evaluate(() => __pw.yaw());
  if (touch) await I.swipe(p, { x: 20, y: opts.viewport.height * 0.55 }, { x: 160, y: opts.viewport.height * 0.55 });
  else await p.keyboard.press('q');
  await p.waitForTimeout(700);
  check(Math.abs((await p.evaluate(() => __pw.yaw())) - yaw0) > 0.05, 'the island can be turned');
  await press(p, touch, '#btn-retry');
  check(await waitFor(p, () => __pw.tile(2, 1) === 'rock' && __pw.state().uses === 0, null, 8000), 'retry instantly resets the level');

  // 5. progress persists across reload
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitFor(p, () => window.__pw && window.__pw.ready);
  const after = await p.evaluate(() => ({ s: __pw.save(), unlocked: __pw.logic.isUnlocked(__pw.save(), __pw.LEVELS, 1) }));
  check(after.s.levels['1-1'] && after.s.levels['1-1'].done && after.s.levels['2-1'] && after.s.levels['2-1'].done, 'cleared levels survive a reload');
  check(after.unlocked, 'level 1-2 is unlocked after reload');
  check(after.s.stats.rain >= 1 && after.s.stats.sun >= 1 && after.s.stats.wind >= 1, 'weather stats survive a reload');

  // 6. offline: install from a throwaway server on its own port, then kill the server (the network is truly gone) and reload
  {
    const port = engName === 'webkit' ? 8782 : 8781;
    const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', DIST], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 800));
    process.on('exit', () => { try { srv.kill(); } catch (e) {} });
    const o = await ctx.newPage(); const oerr = [];
    o.on('pageerror', e => oerr.push('pageerror: ' + e.message)); o.on('console', m => { if (m.type() === 'error') oerr.push('console: ' + m.text()); });
    await o.goto(`http://127.0.0.1:${port}/?debug`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitFor(o, () => window.__pw && window.__pw.ready);
    const swOk = await waitFor(o, async () => { const r = await navigator.serviceWorker.ready; return !!r.active && !!navigator.serviceWorker.controller; }, null, 30000);
    check(swOk, 'service worker installed and controlling the page');
    srv.kill(); await new Promise(r => setTimeout(r, 500));
    let reloaded = true; try { await o.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) { reloaded = false; oerr.push('reload: ' + e.message.split('\n')[0]); }
    check(reloaded && await waitFor(o, () => window.__pw && window.__pw.ready && window.__pwBooted, null, 30000), 'reloads and boots with the server gone (offline)');
    check(reloaded && await visible(o, '#title'), 'title screen shows offline');
    await o.waitForTimeout(1500);
    check(oerr.length === 0, 'no console errors offline' + (oerr.length ? ': ' + oerr.slice(0, 3).join(' | ') : ''));
    await o.close();
  }

  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await ctx.close();
}

async function solveAll(browser) {
  console.log(`\n== ${engName} / every level replayed in the browser (?debug hook)`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(URL0 + '?debug', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitFor(p, () => window.__pw && window.__pw.ready);
  await p.evaluate(() => { __pw.setting('reducedEffects', true); __pw.time(5); });
  const ids = await p.evaluate(() => __pw.LEVELS.map(l => l.id));
  for (const id of ids) {
    await p.evaluate(id => __pw.load(id), id); await settled(p);
    const sol = await p.evaluate(id => __pw.LEVELS.find(l => l.id === id).solution, id);
    let okAll = true;
    for (const a of sol) { const r = await p.evaluate(a => __pw.act(a), a); if (!r) okAll = false; await settled(p); }
    const won = await waitFor(p, () => __pw.state().won, null, 30000);
    check(won && okAll, `${id}: scripted solution (${sol.length} weather${sol.length > 1 ? 's' : ''}) reaches the goal`);
  }
  check(errors.length === 0, 'no console errors while replaying' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const names = only.length ? only.filter(n => VIEWPORTS[n]) : Object.keys(VIEWPORTS);
  for (const n of names) { const browser = await eng.launch(); try { await runViewport(browser, n); } catch (e) { fail++; failures.push(`${n}: crashed ${e.message}`); console.log('   FAIL crashed', e.message); } await browser.close().catch(() => {}); }
  if (!only.length || only.includes('solve')) { const browser = await eng.launch(); try { await solveAll(browser); } catch (e) { fail++; failures.push('solve crashed ' + e.message); } await browser.close().catch(() => {}); }
  console.log(`\n${engName}: ${pass} passed, ${fail} failed`); failures.forEach(f => console.log('  - ' + f));
  process.exit(fail ? 1 : 0);
})();
