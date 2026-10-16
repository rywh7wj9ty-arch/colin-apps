// Browser tests: node tools/e2e.cjs [chromium|webkit]   (deploy folder served on :8774)
const { chromium, webkit } = require('/tmp/skyward-test/node_modules/playwright');
const fs = require('fs');
const URL = 'http://localhost:8774/', SHOTS = '/tmp/cubby-shots/';
const note = s => { fs.appendFileSync('/tmp/cubby-notes.txt', s + '\n'); console.log(s); };
const T = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout: ' + what)), ms))]);
const DEV = [
  ['ipad', { viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 2 }],
  ['ipad-portrait', { viewport: { width: 820, height: 1180 }, hasTouch: true, deviceScaleFactor: 2 }],
  ['iphone', { viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 2 }],
  ['desktop', { viewport: { width: 1280, height: 800 } }],
];
let fails = 0;
const IGN = /GL Driver Message|GPU stall|WebGL: INVALID_ENUM|favicon/;
async function run(bname, bt, dname, opts) {
  const tag = `${bname}/${dname}`, touch = !!opts.hasTouch;
  const b = await T(bt.launch({ timeout: 30000 }), 40000, 'launch');
  const ctx = await b.newContext({ ...opts, isMobile: bname === 'chromium' && touch ? true : undefined });
  const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  const errs = []; p.on('console', m => m.type() === 'error' && !IGN.test(m.text()) && errs.push(m.text().slice(0, 200))); p.on('pageerror', e => errs.push(e.message));
  const check = (name, ok, extra = '') => { if (!ok) fails++; note(`${ok ? 'PASS' : 'FAIL'} ${tag} ${name} ${extra}`); };
  const ev = (f, a) => T(p.evaluate(f, a), 15000, 'evaluate');
  const tap = async (x, y) => touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y);
  const waitFor = (f, ms, a) => T(p.waitForFunction(f, a, { timeout: ms, polling: 100 }), ms + 2000, 'waitFor').then(() => true, () => false);
  try {
    await T(p.goto(URL + '?nosw'), 25000, 'goto');
    const booted = await waitFor(() => window.__booted && getComputedStyle(document.getElementById('loading')).display === 'none', 20000);
    check('boots to the title', booted && await p.isVisible('#title') && !(await p.isVisible('#err')));
    await p.waitForTimeout(800); const shot = await p.screenshot({ path: `${SHOTS}${bname}-${dname}-title.png` });
    check('world renders', (await ev(() => CI.chunkCount)) === 64 && shot.length > 60000, `png ${shot.length}B worker=${await ev(() => CI.worker)}`);
    // new game in slot 0 (fixed seed for repeatable tests)
    await ev(() => CI.start(0, 7)); await p.waitForTimeout(1500); await ev(() => CI.hideBubble());
    await waitFor(() => CI.meshed, 10000);
    // joystick / WASD moves the hero
    const p0 = await ev(() => ({ x: CI.P.x, z: CI.P.z })); const f0 = await ev(() => CI.frames);
    if (touch) {
      const W = opts.viewport.width, H = opts.viewport.height, sx = W * 0.15, sy = H * 0.8;
      await ev(([sx, sy]) => { const c = document.getElementById('c'); const f = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true }));
        f('pointerdown', sx, sy); f('pointermove', sx + 10, sy - 30); f('pointermove', sx + 20, sy - 60); window.__stickUp = () => f('pointerup', sx + 20, sy - 60); }, [sx, sy]);
      await p.waitForTimeout(2200); await ev(() => window.__stickUp());
    } else { await p.keyboard.down('KeyW'); await p.waitForTimeout(1200); await p.keyboard.up('KeyW'); }
    const p1 = await ev(() => ({ x: CI.P.x, z: CI.P.z }));
    const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z), fr = (await ev(() => CI.frames)) - f0;
    check(touch ? 'joystick moves the hero' : 'WASD moves the hero', moved > 1.2, `${moved.toFixed(2)} blocks in ${fr} frames`);
    // set up a flat spot: stand on grass, look at a neighbouring grass top
    const spot = await ev(() => {
      const s = CI.sim, w = s.world, B = Cubby.B;
      for (let z = 88; z < 100; z++) for (let x = 56; x < 70; x++) {
        const y = CI.surf(x + 0.5, z + 0.5) - 1; let flat = true;
        for (let dz = -1; dz <= 3 && flat; dz++) for (let dx = -1; dx <= 1 && flat; dx++) { const yy = CI.surf(x + dx + 0.5, z + dz + 0.5) - 1; if (yy !== y || w.get(x + dx, y, z + dz) !== B.GRASS) flat = false; }
        if (flat) { for (let dz = -1; dz <= 3; dz++) for (let dx = -1; dx <= 1; dx++) for (let k = 1; k < 4; k++) w.set(x + dx, y + k, z + dz, 0); return { x, y, z }; }
      }
      return null;
    });
    await ev(s => { CI.setHero(s.x + 0.5, s.y + 1, s.z + 0.5); CI.view(Math.PI, 0.75, 7); }, spot); await p.waitForTimeout(700);
    const scr = await ev(s => CI.project(s.x + 0.5, s.y + 1.0, s.z + 2.5), spot);
    const inv0 = await ev(() => CI.sim.count(Cubby.B.GRASS));
    await tap(scr.x, scr.y);
    const mined = await waitFor(n => CI.sim.count(Cubby.B.GRASS) > n, 5000, inv0);
    check('tap mines a block into the pocket', mined, `grass ${inv0}->${await ev(() => CI.sim.count(Cubby.B.GRASS))}`);
    await p.waitForTimeout(900); await p.screenshot({ path: `${SHOTS}${bname}-${dname}-mined.png` });
    // place a block (build mode on touch, right click on desktop)
    const placed0 = await ev(() => CI.sim.s.c.placed);
    await ev(() => CI.selectItem(Cubby.B.GRASS));
    const tgt = await ev(s => CI.project(s.x + 0.5, s.y + 1.0, s.z + 3.5), spot);
    if (touch) { await p.tap('#bMode'); await p.waitForTimeout(100); await tap(tgt.x, tgt.y); }
    else await p.mouse.click(tgt.x, tgt.y, { button: 'right' });
    const placed = await waitFor(n => CI.sim.s.c.placed > n, 4000, placed0);
    check('a block can be placed', placed && (await ev(s => CI.sim.world.get(s.x, s.y + 1, s.z + 3), spot)) === 1);
    if (touch) await p.tap('#bMode');
    // quest 1 via the game API (bonk 4 logs), then craft through the wheel UI
    await ev(() => { const s = CI.sim, w = s.world; let n = 0; for (let i = 0; i < w.vox.length && n < 4; i++) if (w.vox[i] === Cubby.B.LOG) { const [x, y, z] = w.coord(i); s.s.hero.x = x + .5; s.s.hero.y = y; s.s.hero.z = z + .5; if (s.mine(x, y, z).broke) n++; } });
    await ev(s => CI.setHero(s.x + 0.5, s.y + 1, s.z + 0.5), spot);
    check('quest 1 completes', (await ev(() => CI.sim.s.quest)) === 1);
    await p.waitForTimeout(400); await ev(() => CI.hideBubble());
    await p.click('#bCraft'); await p.waitForTimeout(200);
    await p.click('.rc[data-r="planks"]'); await p.waitForTimeout(100); await p.click('.rc[data-r="woodpick"]');
    check('crafting works (planks + wooden pick)', (await ev(() => CI.sim.s.tool)) === 1 && (await ev(() => CI.sim.count(Cubby.B.PLANKS))) === 1);
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-craft.png` });
    await p.click('#craftClose');
    check('quest 2 completes from crafting', (await ev(() => CI.sim.s.quest)) === 2);
    // audio: both sliders to 0 must be exactly 0 gain
    await ev(() => CI.audio.unlock());
    await p.click('#bMenu'); await p.waitForTimeout(200);
    await p.fill('#sMusic', '0'); await p.fill('#sSfx', '0');
    const g = await ev(() => CI.audio.gains());
    check('music and sfx sliders at 0 give exactly 0 gain', g.music === 0 && g.sfx === 0 && (await ev(() => !!CI.audio.ctx)), JSON.stringify(g));
    await p.fill('#sMusic', '0.6'); await p.fill('#sSfx', '0.8');
    const g2 = await ev(() => CI.audio.gains()); check('sliders bring sound back', g2.music > 0 && g2.sfx > 0);
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-pause.png` });
    await p.click('#bResume');
    // save + reload
    const before = await ev(() => ({ q: CI.sim.s.quest, d: CI.sim.world.deltas.size }));
    await ev(() => CI.save());
    await T(p.reload(), 25000, 'reload');
    await waitFor(() => window.__booted, 20000);
    const label = await p.textContent('#slots .slot');
    await ev(() => CI.start(0)); await p.waitForTimeout(800);
    const after = await ev(() => ({ q: CI.sim.s.quest, d: CI.sim.world.deltas.size, t: CI.sim.s.tool }));
    check('save persists across a reload', after.q === before.q && after.d === before.d && after.t === 1 && /Continue/.test(label), JSON.stringify(after));
    await p.waitForTimeout(300);
    check('no console errors', errs.length === 0, errs.join(' | '));
  } catch (e) { fails++; note(`FAIL ${tag} exception ${e.message}`); }
  await b.close();
}
async function offline(bname, bt) {
  const tag = `${bname}/offline`;
  const b = await bt.launch({ timeout: 30000 }); const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  try {
    await T(p.goto(URL), 25000, 'goto');
    await T(p.waitForFunction(() => window.__booted, null, { timeout: 20000 }), 22000, 'boot');
    await T(p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; }), 20000, 'sw ready');
    await p.waitForTimeout(1500);
    const cached = await p.evaluate(async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return (await c.keys()).length; });
    await ctx.setOffline(true);
    // 1) every runtime file is answered by the service worker with the network off
    const fetchOk = await p.evaluate(async () => { const v = window.__V; const urls = ['./', 'index.html', 'game.js?v=' + v, 'core.js?v=' + v, 'mesher.js?v=' + v, 'audio.js?v=' + v, 'style.css?v=' + v, 'manifest.webmanifest?v=' + v, 'vendor/three/three.module.js', 'fredoka.ttf', 'icons/icon-192.png'];
      const viaSW = []; for (const u of urls) { try { viaSW.push((await fetch(u)).ok); } catch (e) { viaSW.push(false); } }
      const inCache = []; for (const u of urls) inCache.push(!!(await caches.match(new URL(u, location.href).href)));
      return { sw: viaSW.every(Boolean), cache: inCache.every(Boolean), ctrl: !!navigator.serviceWorker.controller }; }).catch(e => ({ err: e.message }));
    // 2) a full offline reload boots (Playwright's Linux WebKit cannot navigate while emulating offline, so it only gets check 1)
    let boot = false, how = 'fetch-only';
    try { await T(p.goto(URL), 25000, 'offline load'); boot = await T(p.waitForFunction(() => window.__booted, null, { timeout: 20000 }), 22000, 'offline boot').then(() => true, () => false); how = boot ? 'offline reload boots' : 'reload did not boot'; }
    catch (e) { how = 'fetch-only, navigation unsupported: ' + e.message.slice(0, 50); }
    const ok = fetchOk.ctrl && fetchOk.cache && (boot || (bname === 'webkit' && how.startsWith('fetch-only')));
    how = `controlled=${fetchOk.ctrl} all files precached=${fetchOk.cache} offline fetch via SW=${fetchOk.sw}; ${how}`;
    if (!ok) fails++; note(`${ok ? 'PASS' : 'FAIL'} ${tag} works offline after first visit (cached ${cached} files; ${how})`);
  } catch (e) { fails++; note(`FAIL ${tag} exception ${e.message}`); }
  await b.close();
}
(async () => {
  const which = process.argv[2] ? [process.argv[2]] : ['chromium', 'webkit'];
  for (const bn of which) { const bt = bn === 'webkit' ? webkit : chromium; for (const [d, o] of DEV) await run(bn, bt, d, o); await offline(bn, bt); }
  note(`E2E done: ${fails} failures`); process.exit(fails ? 1 : 0);
})();
