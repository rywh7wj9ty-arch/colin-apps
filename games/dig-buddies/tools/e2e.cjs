// Browser tests: node tools/e2e.cjs  (deploy folder served on :8775)
const { chromium, webkit } = require('/tmp/lumen-test/node_modules/playwright');
const fs = require('fs');
const URL = 'http://127.0.0.1:8775/', SHOTS = '/tmp/dig-buddies-shots/';
const note = s => { fs.appendFileSync('/tmp/dig-buddies-notes.txt', s + '\n'); console.log(s); };
const withT = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout: ' + what)), ms))]);
const DEV = [
  ['iphone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ['iphone-land', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ['ipad', { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ['desktop', { viewport: { width: 1280, height: 800 } }],
];
const only = process.argv[2]; let fails = 0; const summary = [];
async function run(bname, bt, dname, opts) {
  const tag = `${bname}/${dname}`; if (bname === 'chromium' && opts.isMobile) opts = { ...opts }; if (bname === 'webkit') { opts = { ...opts }; delete opts.isMobile; }
  const b = await bt.launch({ timeout: 30000 }); const ctx = await b.newContext(opts); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text().slice(0, 200))); p.on('pageerror', e => errs.push(e.message));
  let pass = 0, fail = 0; const check = (name, ok, extra = '') => { if (ok) pass++; else { fail++; fails++; } note(`${ok ? 'PASS' : 'FAIL'} ${tag} ${name} ${extra}`); };
  const touch = !!opts.hasTouch;
  const tapAt = async (x, y) => touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y);
  const cellXY = i => p.evaluate(i => DB.screenOf(i), i);
  try {
    await withT(p.goto(URL + '?nosw&debug'), 20000, 'goto');
    await p.waitForFunction(() => window.__booted && getComputedStyle(document.getElementById('loading')).display === 'none', null, { timeout: 20000 });
    check('boots to title', await p.isVisible('#title.on'));
    await p.waitForTimeout(1200); await p.screenshot({ path: `${SHOTS}${bname}-${dname}-title.png` });
    // world map
    await p.click('#title [data-go=map]'); await p.waitForSelector('#map.on'); await p.waitForTimeout(400);
    const nodes = await p.$$eval('.node', n => n.length); check('world map shows 28 boards', nodes === 28, `nodes=${nodes}`);
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-map.png` });
    await p.click('.node[data-board="0"]', { force: true }); await p.waitForSelector('#modal.on #mPlay'); await p.click('#mPlay'); await p.waitForSelector('#hud.on');
    check('map node starts board', await p.evaluate(() => DB.game && DB.game.def.id === 0));
    await p.waitForTimeout(600);
    // tap digs (centre tile)
    const c0 = await p.evaluate(() => { const b = DB.game.b; return Math.floor(b.H / 2) * b.W + Math.floor(b.W / 2); });
    let xy = await cellXY(c0); await tapAt(xy.x, xy.y); await p.waitForTimeout(900);
    const dug = await p.evaluate(() => DB.game.b.revealed.reduce((a, v) => a + v, 0));
    check('tap digs', dug > 1, `revealed=${dug}`);
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-dig.png` });
    // long-press (touch) / right-click (mouse) plants a signpost on a hidden tile
    const hid = await p.evaluate(() => { const b = DB.game.b; const L = DB.hiddenSafe().concat(); for (let i = 0; i < b.N; i++) if (b.mine[i] && b.nb[i].some(j => b.revealed[j])) return i; return L[0]; });
    xy = await cellXY(hid);
    if (touch) {
      await p.evaluate(({ x, y }) => { const c = document.getElementById('gl'); c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, bubbles: true, button: 0 })); }, xy);
      await p.waitForFunction(i => !!DB.game.b.flagged[i], hid, { timeout: 4000 }).catch(() => {});
      await p.evaluate(({ x, y }) => { const c = document.getElementById('gl'); c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, bubbles: true, button: 0 })); }, xy);
    } else await p.mouse.click(xy.x, xy.y, { button: 'right' });
    await p.waitForTimeout(400);
    check(touch ? 'long-press flags' : 'right-click flags', await p.evaluate(i => !!DB.game.b.flagged[i], hid));
    // chord: flag around a number with a hidden safe neighbour, then tap it
    const ci = await p.evaluate(() => DB.chordable());
    if (ci >= 0) {
      await p.evaluate(i => DB.flagAround(i), ci); xy = await cellXY(ci);
      const before = await p.evaluate(() => DB.game.b.revealed.reduce((a, v) => a + v, 0));
      if (touch) await tapAt(xy.x, xy.y); else await p.mouse.dblclick(xy.x, xy.y);
      await p.waitForFunction(i => DB.game.b.nb[i].every(j => DB.game.b.revealed[j] || DB.game.b.flagged[j]), ci, { timeout: 4000 }).catch(() => {});
      const after = await p.evaluate(() => DB.game.b.revealed.reduce((a, v) => a + v, 0));
      const done = await p.evaluate(i => DB.game.b.nb[i].every(j => DB.game.b.revealed[j] || DB.game.b.flagged[j]), ci);
      check('chord opens neighbours', after > before && done, `${before}->${after}`);
    } else check('chord opens neighbours', true, '(board already open around numbers; skipped)');
    // win the board with the debug hook
    await p.evaluate(() => DB.winNow()); await p.waitForSelector('#modal.on #rAgain', { timeout: 8000 }); await p.waitForTimeout(500);
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-win.png` });
    check('board can be won', await p.evaluate(() => !!(DB.save.boards[0] && DB.save.boards[0].stars[0])));
    // Boomshroom costs a heart (board 1-2 has hearts)
    await p.evaluate(() => DB.start({ mode: 'adv', id: 1 })); await p.waitForTimeout(500);
    const c1 = await p.evaluate(() => { const b = DB.game.b; return Math.floor(b.H / 2) * b.W + Math.floor(b.W / 2); });
    xy = await cellXY(c1); await tapAt(xy.x, xy.y); await p.waitForTimeout(700);
    const mine = await p.evaluate(() => DB.hiddenMine()); xy = await cellXY(mine);
    if (await p.evaluate(i => DB.world.pick(DB.screenOf(i).x, DB.screenOf(i).y) === i, mine)) await tapAt(xy.x, xy.y); else await p.evaluate(i => DB.doDig(i), mine);
    await p.waitForTimeout(250); await p.screenshot({ path: `${SHOTS}${bname}-${dname}-poof.png` }); await p.waitForTimeout(400);
    const g = await p.evaluate(() => ({ h: DB.game.hearts, over: DB.game.over, popped: DB.game.b.popped.reduce((a, v) => a + v, 0) }));
    check('Boomshroom costs a heart, board continues', g.h === 2 && !g.over && g.popped === 1, JSON.stringify(g));
    // pause menu audio sliders to 0 give exactly 0 gain
    await p.click('#pauseBtn'); await p.waitForSelector('#modal.on [data-vol=musicVol]');
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-pause.png` });
    await p.fill('#modal [data-vol=musicVol]', '0'); await p.fill('#modal [data-vol=sfxVol]', '0'); await p.waitForTimeout(200);
    const a0 = await p.evaluate(() => DB.audio()); check('sliders at 0 give 0 gain', a0.music === 0 && a0.sfx === 0, JSON.stringify(a0));
    await p.fill('#modal [data-vol=musicVol]', '60'); await p.click('#modal [data-aud=musicOn]'); const a1 = await p.evaluate(() => DB.audio()); check('music switch off gives 0 gain', a1.music === 0 && a1.sfx === 0, JSON.stringify(a1));
    await p.click('#modal [data-aud=musicOn]'); await p.click('#pResume');
    // other areas render (night + snow + beach) without errors
    for (const id of [8, 14, 21]) { await p.evaluate(id => { DB.start({ mode: 'adv', id }); const b = DB.game.b; DB.doDig(DB.L.playable(b)[Math.floor(DB.L.playable(b).length / 2)]); }, id); await p.waitForTimeout(1300); await p.screenshot({ path: `${SHOTS}${bname}-${dname}-board${id}.png` }); }
    check('night, beach and snow boards run', errs.length === 0, errs.slice(0, 2).join(' | '));
    // persistence across reload
    await p.reload(); await p.waitForFunction(() => window.__booted, null, { timeout: 20000 });
    const kept = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('digbuddies.save.v1')); return !!(s.boards[0] && s.boards[0].stars[0]) && s.settings.sfxVol === 0; });
    check('progress and settings persist after reload', kept);
    await p.evaluate(() => DB.show('map')); await p.waitForTimeout(300); check('board 2 unlocked after reload', await p.evaluate(() => !document.querySelector('.node[data-board="1"]').classList.contains('locked')));
    // offline
    if (dname === 'desktop' || dname === 'iphone') {
      const p2 = await ctx.newPage(); await p2.goto(URL, { timeout: 20000 }); await p2.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || false, null, { timeout: 20000 }).catch(() => {});
      await p2.reload(); await p2.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
      const cached = await p2.evaluate(async () => { const k = (await caches.keys()).find(k => k.startsWith('digbuddies-')); const c = await caches.open(k); return (await c.keys()).length; });
      check('service worker precached files', cached >= 16, `entries=${cached}`);
      if (bname === 'chromium') { await ctx.setOffline(true); await p2.reload(); const ok = await p2.waitForFunction(() => window.__booted, null, { timeout: 20000 }).then(() => true, () => false); check('boots offline', ok); await ctx.setOffline(false); }
      await p2.close();
    }
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) { check('run completed', false, e.message); }
  summary.push(`${tag}: ${pass} passed, ${fail} failed`); await b.close();
}
(async () => {
  for (const [bn, bt] of [['chromium', chromium], ['webkit', webkit]]) for (const [dn, o] of DEV) { if (only && !`${bn}/${dn}`.includes(only)) continue; await withT(run(bn, bt, dn, o), 180000, bn + dn).catch(e => { fails++; note('FAIL ' + bn + '/' + dn + ' ' + e.message); }); }
  note(summary.join('\n')); note('e2e total fails: ' + fails); process.exit(fails ? 1 : 0);
})();
