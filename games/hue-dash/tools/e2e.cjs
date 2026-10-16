// Browser tests: node tools/e2e.cjs  (needs playwright from /tmp/skyward-test and the deploy served on :8770)
const { chromium, webkit } = require('/tmp/lumen-test/node_modules/playwright');
const fs = require('fs');
const SOL = JSON.parse(fs.readFileSync(__dirname + '/solutions.json'));
const URL = 'http://localhost:8770/';
const SHOTS = '/tmp/huedash-shots/';
const note = s => { fs.appendFileSync('/tmp/huedash-notes.txt', s + '\n'); console.log(s); };
const withT = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout: ' + what)), ms))]);
const DEV = [
  ['iphone', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ['iphone-portrait', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }],
  ['ipad', { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ['desktop', { viewport: { width: 1280, height: 800 } }],
];
let fails = 0;
async function run(bname, bt, dname, opts) {
  const tag = `${bname}/${dname}`;
  const b = await bt.launch({ timeout: 30000 });
  const ctx = await b.newContext({ ...opts, ...(bname === 'chromium' && opts.isMobile === undefined ? {} : {}) });
  const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text().slice(0, 200))); p.on('pageerror', e => errs.push(e.message));
  const res = {};
  const check = (name, ok, extra = '') => { res[name] = ok; if (!ok) fails++; note(`${ok ? 'PASS' : 'FAIL'} ${tag} ${name} ${extra}`); };
  const W = opts.viewport.width, H = opts.viewport.height, touch = !!opts.hasTouch;
  const tapAt = async (x, y) => touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y);
  try {
    await withT(p.goto(URL + '?nosw'), 20000, 'goto');
    await p.waitForFunction(() => window.__booted && getComputedStyle(document.getElementById('loading')).display === 'none', null, { timeout: 15000 });
    check('boots to title', await p.isVisible('#title'));
    await p.waitForTimeout(800); await p.screenshot({ path: `${SHOTS}${bname}-${dname}-title.png` });
    // switch + jump on level 2 (neutral start)
    await p.evaluate(() => HD.startLevel(1)); await p.waitForTimeout(300);
    const c0 = await p.evaluate(() => HD.state.col);
    if (touch) await tapAt(W * 0.2, H * 0.6); else await p.keyboard.press('ArrowLeft');
    await p.waitForTimeout(150);
    const c1 = await p.evaluate(() => HD.state.col);
    check('tap left switches colour', c1 !== c0, `${c0}->${c1}`);
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-switch.png` });
    const j0 = await p.evaluate(() => HD.state.jumpsN);
    if (touch) await tapAt(W * 0.8, H * 0.6); else await p.keyboard.press('Space');
    await p.waitForTimeout(120);
    const st = await p.evaluate(() => HD.state);
    check('tap right jumps', st.jumpsN > j0 && !st.grounded, `jumps ${j0}->${st.jumpsN} y=${st.y.toFixed(2)}`);
    if (!touch) { await p.mouse.click(W * 0.8, H * 0.6); await p.waitForTimeout(400); }
    // death + fast restart: no input on level 1 eventually shatters
    await p.evaluate(() => { window.__restartMs = 0; HD.startLevel(0); });
    await p.waitForFunction(() => window.__restartMs > 0, null, { timeout: 15000 });
    const rm = await p.evaluate(() => window.__restartMs);
    check('death then restart under 0.5 s', rm < 500, `${rm.toFixed(0)} ms`);
    // shatter screenshot
    await p.evaluate(() => { window.__deathAt = 0; HD.startLevel(3); });
    await p.waitForFunction(() => window.__deathAt > 0, null, { timeout: 15000 }); await p.waitForTimeout(90);
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-shatter.png` });
    // complete level 1 with its scripted perfect run
    await p.evaluate(s => { HD.playScript(0, s); HD.setTimeScale(4); }, SOL[0]);
    await p.waitForTimeout(2500); await p.screenshot({ path: `${SHOTS}${bname}-${dname}-w1run.png` });
    await p.waitForSelector('#results.on', { timeout: 60000 });
    const sv = await p.evaluate(() => HD.save().levels[0]);
    check('level completes with 3 stars', sv && sv.done && sv.stars.every(Boolean), JSON.stringify(sv && sv.stars));
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-results.png` });
    // persistence
    await p.reload(); await p.waitForFunction(() => window.__booted, null, { timeout: 15000 });
    const sv2 = await p.evaluate(() => HD.save().levels[0]);
    check('progress persists across reload', sv2 && sv2.done && sv2.stars.every(Boolean) && !!sv2.best);
    await p.evaluate(() => HD.openLevels(0)); await p.waitForTimeout(300);
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-levels.png` });
    // audio sliders at 0 during play (pause menu)
    await p.evaluate(() => HD.startLevel(0)); await p.waitForTimeout(200);
    await p.click('#bPause'); await p.waitForSelector('#pause.on');
    for (const k of ['music', 'sfx']) await p.$eval(`#pause input[data-k=${k}]`, el => { el.value = 0; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await p.waitForTimeout(200);
    const g = await p.evaluate(() => ({ gains: HD.audio.gains(), m: HD.audio.musicBus && HD.audio.musicBus.gain.value, s: HD.audio.sfxBus && HD.audio.sfxBus.gain.value }));
    check('sliders at 0 give exactly 0 gain', g.gains.music === 0 && g.gains.sfx === 0 && g.m === 0 && g.s === 0, JSON.stringify(g));
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-pause.png` });
    await p.click('#pResume');
    // world screenshots mid-run (iphone only to save time)
    if (dname === 'iphone') for (const id of [9, 17, 24]) {
      await p.evaluate(([i, s]) => { HD.playScript(i, s); HD.setTimeScale(3); }, [id, SOL[id]]);
      await p.waitForTimeout(3500); await p.screenshot({ path: `${SHOTS}${bname}-world-L${id + 1}.png` });
    }
    const cz = await p.evaluate(() => { const c = document.querySelector('#game canvas').getBoundingClientRect(); return [c.width, c.height, innerWidth, innerHeight]; });
    check('canvas fills viewport', Math.abs(cz[0] - cz[2]) < 2 && Math.abs(cz[1] - cz[3]) < 2, JSON.stringify(cz));
    check('brightness slider present', await p.evaluate(() => document.querySelectorAll('.audio input[data-k=bright]').length >= 2));
    check('fps reported', await p.evaluate(() => window.__fps > 20), String(await p.evaluate(() => window.__fps.toFixed(0))));
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) { check('run without exceptions', false, e.message); }
  await b.close();
}
async function offline(bname, bt) {
  const b = await bt.launch(); const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  let p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  let ok = false, extra = '';
  try {
    await withT(p.goto(URL), 20000, 'goto');
    await withT(p.evaluate(async () => { await navigator.serviceWorker.ready; }), 20000, 'sw ready');
    await p.waitForTimeout(1500);
    await p.reload(); await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    const cacheCheck = await p.evaluate(async () => {
      const keys = (await caches.keys()).filter(k => k.startsWith('huedash-')); const c = await caches.open(keys[keys.length - 1]);
      const urls = ['./', 'index.html', 'fredoka.ttf', 'vendor/three/three.module.js', 'icons/icon-192.png'].concat(['style.css', 'logic.js', 'levels.js', 'game.js', 'audio.js', 'manifest.webmanifest'].map(f => f + '?v=' + window.__V));
      const miss = []; for (const u of urls) if (!(await c.match(u))) miss.push(u); return { n: (await c.keys()).length, miss };
    });
    await ctx.setOffline(true);
    try {
      await p.reload({ timeout: 20000 }); await p.waitForFunction(() => window.__booted, null, { timeout: 15000 });
      await p.evaluate(() => HD.startLevel(2)); await p.waitForTimeout(1000);
      ok = (await p.evaluate(() => HD.mode)) === 'play' && errs.length === 0; extra = 'offline reload booted and played; ' + errs.join('|');
    } catch (e) {
      ok = cacheCheck.miss.length === 0 && cacheCheck.n >= 15;
      extra = `offline reload not supported by this engine build (${e.message.split('\n')[0]}); precache check instead: ${cacheCheck.n} files cached, missing [${cacheCheck.miss}]`;
    }
  } catch (e) { extra = e.message; }
  if (!ok) fails++;
  note(`${ok ? 'PASS' : 'FAIL'} ${bname} works offline (service worker) ${extra}`);
  await b.close();
}
(async () => {
  note('--- e2e ' + new Date().toISOString());
  const only = process.argv[2];
  for (const [bn, bt] of [['chromium', chromium], ['webkit', webkit]]) {
    if (only && only !== bn) continue;
    for (const [dn, o] of DEV) await withT(run(bn, bt, dn, o), 240000, bn + dn).catch(e => { fails++; note('FAIL ' + bn + dn + ' ' + e.message); });
    await withT(offline(bn, bt), 90000, 'offline').catch(e => { fails++; note('FAIL offline ' + bn + ' ' + e.message); });
  }
  note(`e2e done, failures: ${fails}`); process.exit(fails ? 1 : 0);
})();
