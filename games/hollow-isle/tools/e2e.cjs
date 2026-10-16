// Browser tests: node tools/e2e.cjs [chromium|webkit]   (deploy folder served on :8786)
const { chromium, webkit } = require('/tmp/lumen-test/node_modules/playwright');
const fs = require('fs');
const URL = 'http://127.0.0.1:8786/', SHOTS = '/tmp/hollow-shots/';
const note = s => { fs.appendFileSync('/tmp/hollow-notes.txt', s + '\n'); console.log(s); };
const T = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout: ' + what)), ms))]);
const DEV = [
  ['iphone-portrait', { viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 }],
  ['iphone-landscape', { viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 3 }],
  ['ipad', { viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 2 }],
  ['desktop', { viewport: { width: 1280, height: 800 } }],
];
let fails = 0;
const IGN = /GL Driver Message|GPU stall|WebGL: INVALID_ENUM|favicon|AudioContext was not allowed/;
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
    // plant sentinel Cubby Isle saves/settings on the same origin: Hollow Isle must never touch them
    await T(p.goto(URL + '?nosw'), 25000, 'goto');
    await ev(async () => { localStorage.setItem('cubby-slot-0', 'CUBBY-SENTINEL'); localStorage.setItem('cubby-settings', '{"low":true}'); localStorage.setItem('cubby-audio', '{"music":0.33}');
      await new Promise(res => { const r = indexedDB.open('cubby-isle', 1); r.onupgradeneeded = () => r.result.createObjectStore('slots'); r.onsuccess = () => { const t = r.result.transaction('slots', 'readwrite'); t.objectStore('slots').put('CUBBY-IDB-SENTINEL', 0); t.oncomplete = () => { r.result.close(); res(); }; }; r.onerror = () => res(); }); });
    await T(p.reload(), 25000, 'reload');
    const booted = await waitFor(() => window.__booted && getComputedStyle(document.getElementById('loading')).display === 'none', 20000);
    check('boots to the title', booted && await p.isVisible('#title') && !(await p.isVisible('#err')));
    await p.waitForTimeout(900); const shot = await p.screenshot({ path: `${SHOTS}${bname}-${dname}-title.png` });
    const info = await ev(() => ({ c: HI.chunkCount, post: HI.post, r: HI.canvasRect, cw: document.getElementById('c').width, ch: document.getElementById('c').height, dpr: devicePixelRatio, iw: innerWidth, ih: innerHeight }));
    check('world renders (post-processing on)', info.c === 64 && shot.length > 40000 && info.post.ok, `png ${shot.length}B float=${info.post.float} q=${info.post.quality}`);
    const sizeOk = Math.abs(info.r.width - info.iw) < 1 && Math.abs(info.r.height - info.ih) < 1 && Math.abs(info.cw / info.r.width - info.ch / info.r.height) < 0.02;
    check('canvas is sized from its bounding rect', sizeOk, `rect ${info.r.width}x${info.r.height} canvas ${info.cw}x${info.ch} dpr ${info.dpr}`);
    // new game in slot 0 (fixed seed for repeatable tests); keep Hollows away while testing controls
    await ev(() => HI.start(0, 7)); await p.waitForTimeout(1500); await ev(() => { HI.hideBubble(); HI.freezeCreatures(); });
    await waitFor(() => HI.meshed, 10000);
    const p0 = await ev(() => ({ x: HI.P.x, z: HI.P.z })); const f0 = await ev(() => HI.frames);
    if (touch) {
      const Wd = opts.viewport.width, Hd = opts.viewport.height, sx = Wd * 0.15, sy = Hd * 0.8;
      await ev(([sx, sy]) => { const c = document.getElementById('c'); const f = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true }));
        f('pointerdown', sx, sy); f('pointermove', sx + 10, sy - 30); f('pointermove', sx + 20, sy - 60); window.__stickUp = () => f('pointerup', sx + 20, sy - 60); }, [sx, sy]);
      await p.waitForTimeout(3000); await ev(() => window.__stickUp());
    } else { await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.up('KeyW'); }
    const p1 = await ev(() => ({ x: HI.P.x, z: HI.P.z }));
    const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z), fr = (await ev(() => HI.frames)) - f0;
    check(touch ? 'joystick moves Cubby' : 'WASD moves Cubby', (moved > 1.2 || moved / Math.max(fr, 1) > 0.1), `${moved.toFixed(2)} blocks in ${fr} frames`);
    // flat grass spot
    const spot = await ev(() => {
      const s = HI.sim, w = s.world, B = Hollow.B;
      for (let z = 84; z < 104; z++) for (let x = 52; x < 74; x++) {
        const y = HI.surf(x + 0.5, z + 0.5) - 1; let flat = true;
        for (let dz = -2; dz <= 3 && flat; dz++) for (let dx = -2; dx <= 2 && flat; dx++) { const yy = HI.surf(x + dx + 0.5, z + dz + 0.5) - 1; if (yy !== y || w.get(x + dx, y, z + dz) !== B.GRASS) flat = false; }
        if (flat) { for (let dz = -2; dz <= 3; dz++) for (let dx = -2; dx <= 2; dx++) for (let k = 1; k < 5; k++) w.set(x + dx, y + k, z + dz, 0); return { x, y, z }; }
      }
      return null;
    });
    check('found a flat test spot', !!spot);
    await ev(s => { HI.setHero(s.x + 0.5, s.y + 1, s.z + 0.5); HI.view(Math.PI, 0.8, 7); }, spot); await p.waitForTimeout(800);
    // tap-to-mine must hit the exact block under the finger: try 3 blocks around the hero
    let exact = 0; const tried = [];
    for (const [dx, dz] of [[0, 2], [1, 2], [-1, 2]]) {
      const tgt = { x: spot.x + dx, y: spot.y, z: spot.z + dz };
      const scr = await ev(t => HI.project(t.x + 0.5, t.y + 1.0, t.z + 0.5), tgt);
      await ev(t => HI.setHero(t.x + 0.5, t.y + 1, t.z + 0.5), spot);
      await tap(scr.x, scr.y);
      const gone = await waitFor(t => HI.sim.world.get(t.x, t.y, t.z) === 0, 5000, tgt);
      const others = await ev(([s, t]) => { let n = 0; for (let dz = -2; dz <= 3; dz++) for (let dx = -2; dx <= 2; dx++) { const x = s.x + dx, z = s.z + dz; if ((x !== t.x || z !== t.z) && HI.sim.world.get(x, s.y, z) === 0 && !window.__dug?.includes(x + ',' + z)) n++; } return n; }, [spot, tgt]);
      await ev(t => { (window.__dug = window.__dug || []).push(t.x + ',' + t.z); }, tgt);
      const el = gone ? '' : await ev(q => { const e = document.elementFromPoint(q.x, q.y); return '@' + Math.round(q.x) + ',' + Math.round(q.y) + ':' + (e && (e.id || e.className)) + JSON.stringify(HI.pickAt(q.x, q.y)); }, scr);
      tried.push(`${dx},${dz}:${gone ? 'hit' : 'miss' + el}${others ? '+' + others + 'wrong' : ''}`); if (gone && !others) exact++;
      await p.waitForTimeout(300);
    }
    check('tap mines exactly the block under the finger', exact === 3, tried.join(' '));
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-play.png` });
    // place: build mode, tap the face of a remaining block
    await ev(() => HI.give(Hollow.B.STONE, 5)); await ev(() => HI.selectItem(Hollow.B.STONE));
    await ev(s => HI.setHero(s.x + 0.5, s.y + 1, s.z + 0.5), spot); await p.waitForTimeout(300);
    const placed0 = await ev(() => HI.sim.s.c.placed);
    const pt = { x: spot.x - 1, y: spot.y, z: spot.z + 3 };
    const tgt = await ev(t => HI.project(t.x + 0.5, t.y + 1.0, t.z + 0.5), pt);
    if (touch) { if ((await ev(() => HI.mode)) !== 'build') await p.tap('#bMode'); await p.waitForTimeout(100); await tap(tgt.x, tgt.y); }
    else await p.mouse.click(tgt.x, tgt.y, { button: 'right' });
    const placed = await waitFor(n => HI.sim.s.c.placed > n, 4000, placed0);
    check('a block can be placed exactly on the tapped face', placed && (await ev(t => HI.sim.world.get(t.x, t.y + 1, t.z), pt)) === 3);
    if (touch && (await ev(() => HI.mode)) === 'build') await p.tap('#bMode');
    // lantern button
    await ev(() => { HI.sim.s.fuel = 80; HI.sim.lights = []; });
    if (touch) await p.tap('#bLantern'); else await p.keyboard.press('KeyF');
    await p.waitForTimeout(300);
    const lan = await ev(() => ({ up: HI.sim.s.lanternUp, l: HI.sim.lightAt(HI.P.x + 3, HI.P.y + 1, HI.P.z) }));
    check('lantern raises and lights a safe circle', lan.up && lan.l > 0.3, JSON.stringify(lan));
    // a Hollow placed at the edge of the light retreats and dissolves
    await ev(() => HI.spawnHollow(HI.P.x + 4, HI.P.z));
    await p.waitForTimeout(2500);
    const hol = await ev(() => { const h = HI.hollows[HI.hollows.length - 1]; return h ? { st: h.state, d: Math.hypot(h.x - HI.P.x, h.z - HI.P.z), f: h.fade } : { st: 'gone' }; });
    check('a Hollow retreats from the lantern light', hol.st === 'gone' || hol.st === 'flee' || hol.d > 4.5, JSON.stringify(hol));
    // and one in the dark, looked at, freezes
    await ev(() => { HI.sim.s.lanternUp = false; HI.freezeCreatures(); }); await p.waitForTimeout(100);
    await ev(() => { HI.sim.lights = [[HI.P.x, HI.P.y + 1, HI.P.z, 4, 11]]; HI.camS.yaw = HI.camS.cyaw = 0; }); await p.waitForTimeout(400);
    const fz = await ev(async () => { const dir = { x: -Math.sin(HI.camS.yaw), z: -Math.cos(HI.camS.yaw) }; HI.spawnHollow(HI.P.x + dir.x * 12, HI.P.z + dir.z * 12); await new Promise(r => setTimeout(r, 1200)); const h = HI.hollows[HI.hollows.length - 1]; return { st: h && h.state, looked: h && HI.isLooked(h) }; });
    check('a Hollow you are looking at freezes', fz.st === 'frozen' && fz.looked, JSON.stringify(fz));
    await ev(() => { HI.freezeCreatures(); HI.sim.scanLights(); });
    if (touch) await p.tap('#bLantern'); else await p.keyboard.press('KeyF');
    // quests via the game API (bonk 4 logs), then craft through the wheel UI
    await ev(() => { const s = HI.sim, w = s.world; let n = 0; for (let i = 0; i < w.vox.length && n < 4; i++) if (w.vox[i] === Hollow.B.LOG) { const [x, y, z] = w.coord(i); s.s.hero.x = x + .5; s.s.hero.y = y; s.s.hero.z = z + .5; if (s.mine(x, y, z).broke) n++; } });
    await ev(s => HI.setHero(s.x + 0.5, s.y + 1, s.z + 0.5), spot);
    check('quest 1 completes', (await ev(() => HI.sim.s.quest)) === 1);
    await p.waitForTimeout(400); await ev(() => HI.hideBubble());
    await ev(() => HI.hideBubble()); await p.click('#bCraft', { force: true }); await p.waitForTimeout(200);
    await p.click('.rc[data-r="planks"]'); await p.waitForTimeout(100); await p.click('.rc[data-r="woodpick"]');
    check('crafting works (planks + wooden pick)', (await ev(() => HI.sim.s.tool)) === 1 && (await ev(() => HI.sim.count(Hollow.B.PLANKS))) === 1);
    await p.click('.rc[data-r="torch"]'); check('torches craft from planks + resin', (await ev(() => HI.sim.count(Hollow.B.TORCH))) === 4);
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-craft.png` });
    await p.click('#craftClose');
    check('quest 2 completes from crafting', (await ev(() => HI.sim.s.quest)) === 2);
    // audio: both sliders to 0 must be exactly 0 gain
    await ev(() => HI.audio.unlock());
    await p.click('#bMenu'); await p.waitForTimeout(200);
    await p.fill('#sMusic', '0'); await p.fill('#sSfx', '0');
    const g = await ev(() => HI.audio.gains());
    check('music and sfx sliders at 0 give exactly 0 gain', g.music === 0 && g.sfx === 0 && (await ev(() => !!HI.audio.ctx)), JSON.stringify(g));
    await p.fill('#sMusic', '0.6'); await p.fill('#sSfx', '0.8');
    await p.fill('#sBright', '1.5'); const br = await ev(() => ({ s: HI.settings.bright, ls: JSON.parse(localStorage.getItem('hollow-settings') || '{}').bright, u: HI._dbg.PU.bright.value }));
    check('brightness slider applies and persists', br.s === 1.5 && br.ls === 1.5, JSON.stringify(br)); await p.fill('#sBright', '1.3');
    const g2 = await ev(() => HI.audio.gains()); check('sliders bring sound back', g2.music > 0 && g2.sfx > 0);
    await p.screenshot({ path: `${SHOTS}${bname}-${dname}-pause.png` });
    await p.click('#bResume');
    // save + reload
    const before = await ev(() => ({ q: HI.sim.s.quest, d: HI.sim.world.deltas.size }));
    await ev(() => HI.save());
    await T(p.reload(), 25000, 'reload');
    await waitFor(() => window.__booted, 20000);
    const label = await p.textContent('#slots .slot');
    await ev(() => HI.start(0)); await p.waitForTimeout(800);
    const after = await ev(() => ({ q: HI.sim.s.quest, d: HI.sim.world.deltas.size, t: HI.sim.s.tool }));
    check('save persists across a reload', after.q === before.q && after.d === before.d && after.t === 1 && /Continue/.test(label), JSON.stringify(after));
    const keys = await ev(async () => { const ls = { slot: localStorage.getItem('cubby-slot-0'), set: localStorage.getItem('cubby-settings'), au: localStorage.getItem('cubby-audio'), mine: Object.keys(localStorage).filter(k => k.startsWith('hollow')) };
      ls.idb = await new Promise(res => { const r = indexedDB.open('cubby-isle', 1); r.onsuccess = () => { const q = r.result.transaction('slots').objectStore('slots').get(0); q.onsuccess = () => { res(q.result); r.result.close(); }; }; r.onerror = () => res('err'); });
      ls.dbs = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : []; return ls; });
    check('original Cubby Isle save keys untouched', keys.slot === 'CUBBY-SENTINEL' && keys.set === '{"low":true}' && keys.au === '{"music":0.33}' && keys.idb === 'CUBBY-IDB-SENTINEL', `hollow keys: ${keys.mine.join(',')} dbs: ${keys.dbs.join(',')}`);
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
    const cached = await p.evaluate(async () => { const k = await caches.keys(); const c = await caches.open(k.find(n => n.startsWith('hollowisle-'))); return { n: (await c.keys()).length, names: k }; });
    await ctx.setOffline(true);
    const fetchOk = await p.evaluate(async () => { const v = window.__V; const urls = ['./', 'index.html', 'game.js?v=' + v, 'core.js?v=' + v, 'mesher.js?v=' + v, 'audio.js?v=' + v, 'style.css?v=' + v, 'manifest.webmanifest?v=' + v, 'vendor/three/three.module.js', 'fredoka.ttf', 'icons/icon-192.png'];
      const viaSW = []; for (const u of urls) { try { viaSW.push((await fetch(u)).ok); } catch (e) { viaSW.push(false); } }
      const inCache = []; for (const u of urls) inCache.push(!!(await caches.match(new URL(u, location.href).href)));
      return { sw: viaSW.every(Boolean), cache: inCache.every(Boolean), ctrl: !!navigator.serviceWorker.controller }; }).catch(e => ({ err: e.message }));
    let boot = false, how = 'fetch-only';
    try { await T(p.goto(URL), 25000, 'offline load'); boot = await T(p.waitForFunction(() => window.__booted, null, { timeout: 20000 }), 22000, 'offline boot').then(() => true, () => false); how = boot ? 'offline reload boots' : 'reload did not boot'; }
    catch (e) { how = 'fetch-only, navigation unsupported: ' + e.message.slice(0, 50); }
    const ok = fetchOk.ctrl && fetchOk.cache && fetchOk.sw && cached.names.every(n => n.startsWith('hollowisle-')) && (boot || (bname === 'webkit' && how.startsWith('fetch-only')));
    how = `cache ${cached.names.join(',')}; controlled=${fetchOk.ctrl} all files precached=${fetchOk.cache} offline fetch via SW=${fetchOk.sw}; ${how}`;
    if (!ok) fails++; note(`${ok ? 'PASS' : 'FAIL'} ${tag} works offline after first visit (cached ${cached.n} files; ${how})`);
  } catch (e) { fails++; note(`FAIL ${tag} exception ${e.message}`); }
  await b.close();
}
(async () => {
  const which = process.argv[2] ? [process.argv[2]] : ['chromium', 'webkit'];
  const only = process.argv[3];
  for (const bn of which) { const bt = bn === 'webkit' ? webkit : chromium; for (const [d, o] of DEV) if (!only || only === d) await run(bn, bt, d, o); if (!only || only === 'offline') await offline(bn, bt); }
  note(`E2E done: ${fails} failures`); process.exit(fails ? 1 : 0);
})();
