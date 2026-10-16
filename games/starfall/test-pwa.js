/* STARFALL PWA test: manifest, service worker, offline play (root + /starfall/ subpath), iPad safe-area layout.
   Run: NODE_PATH=/tmp/sfdeps/node_modules node test-pwa.js   (spawns its own throwaway servers) */
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path');
const OUT = '/tmp/starfall-pwa'; fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const errors = [];
function check(name, cond, extra = '') { results.push({ name, ok: !!cond }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); }
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const servers = []; process.on('exit', () => servers.forEach(s => { try { s.kill(); } catch {} }));
function serve(dir, port) {
  const p = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dir, stdio: 'ignore' });
  servers.push(p); return p;
}
async function waitUp(url) { for (let i = 0; i < 50; i++) { try { const r = await fetch(url); if (r.ok) return; } catch {} await sleep(100); } throw new Error('server not up ' + url); }

function watch(page, label) {
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`[${label}] HTTP ${r.status()} ${r.url()}`); });
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !(m.text().includes('404') && m.location().url && m.location().url.endsWith('/favicon.ico'))) errors.push(`[${label}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${label}] PAGEERROR: ${e.message}`));
}
async function gameReady(page) {
  await page.waitForFunction(() => window.SF && document.getElementById('loading').classList.contains('out'), { timeout: 30000 });
}
async function revealOne(page) {
  await page.evaluate(() => SF.start('moon')); await sleep(1500);
  const c = await page.evaluate(() => SF.visibleCells('hidden')[0]);
  await page.mouse.click(c.x, c.y); await sleep(1200);
  return page.evaluate(() => SF.info());
}

async function offlineRun(browser, label, dir, port, pathPart) {
  const srv = serve(dir, port); const base = `http://127.0.0.1:${port}${pathPart}`;
  await waitUp(base);
  const page = await browser.newPage(); watch(page, label);
  await page.setViewport({ width: 1024, height: 768 });
  // plant a stale cache from an "older version" so we can check activate cleans it up
  await page.goto(base + 'README.md', { waitUntil: 'load' });
  await page.evaluate(async () => { for (const k of ['starfall-20200101a', 'starfall-20200102a']) { const c = await caches.open(k); await c.put('stale', new Response('old')); } });
  await page.goto(base + '?debug&seed=5', { waitUntil: 'load' });
  await gameReady(page);

  const cdp = await page.target().createCDPSession();
  const man = await cdp.send('Page.getAppManifest');
  let parsed = null; try { parsed = JSON.parse(man.data); } catch {}
  check(`${label}: manifest found + parses`, man.url && parsed && man.errors.length === 0, `${man.url} errors=${JSON.stringify(man.errors)}`);
  if (parsed) check(`${label}: manifest fields`, parsed.name === 'Starfall' && parsed.short_name === 'Starfall' && parsed.start_url === './' && parsed.scope === './' && parsed.icons.some(i => i.purpose === 'maskable'));
  if (parsed) {
    let iconsOk = true;
    for (const ic of parsed.icons) { const r = await fetch(new URL(ic.src, man.url)); iconsOk = iconsOk && r.ok && r.headers.get('content-type') === 'image/png'; }
    check(`${label}: manifest icons resolve`, iconsOk);
  }

  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    const keys = (await caches.keys()).sort(); const c = await caches.open(keys.filter(k => k.startsWith('starfall-')).pop());
    const reqs = await c.keys();
    return { scope: reg.scope, state: reg.active && reg.active.state, controlled: !!navigator.serviceWorker.controller, keys, cached: reqs.map(r => r.url) };
  });
  check(`${label}: SW active + controls page`, sw.state === 'activated' && sw.controlled, `scope=${sw.scope}`);
  check(`${label}: SW scope is the app folder`, sw.scope === base);
  // policy: keep the current cache + the newest older one (so a page still open during an update can finish loading)
  check(`${label}: old caches pruned (current + one previous kept)`, sw.keys.length === 2 && sw.keys[0] === 'starfall-20200102a' && /^starfall-\d+\w$/.test(sw.keys[1]), sw.keys.join(','));
  const need = ['', 'index.html', 'game.js?v=', 'logic.js?v=', 'audio.js?v=', 'style.css?v=', 'manifest.webmanifest?v=', 'vendor/three/three.module.js', 'vendor/three/postprocessing/UnrealBloomPass.js', 'vendor/three/shaders/OutputShader.js', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
  check(`${label}: precached files (${sw.cached.length})`, need.every(n => sw.cached.some(u => u.startsWith(base + n))));

  // really offline: kill the server, then reload
  srv.kill(); await sleep(400);
  let down = false; try { await fetch(base); } catch { down = true; }
  check(`${label}: server is down`, down);
  await page.reload({ waitUntil: 'load' });
  await gameReady(page);
  const inf = await revealOne(page);
  check(`${label}: offline reload starts game + reveals cells`, inf && inf.revealed > 0 && inf.status !== 'lost', JSON.stringify(inf));
  await page.screenshot({ path: `${OUT}/${label}-offline.png` });
  // a fresh navigation (new tab) offline too
  const p2 = await browser.newPage(); watch(p2, label + '-tab2'); await p2.setViewport({ width: 900, height: 700 });
  await p2.goto(base, { waitUntil: 'load' }); await p2.waitForFunction(() => document.getElementById('loading').classList.contains('out'), { timeout: 30000 });
  check(`${label}: offline cold navigation (start_url) loads title`, await p2.evaluate(() => !document.getElementById('title').classList.contains('hidden') && !!document.querySelector('#diffs .diff')));
  await p2.close(); await page.close();
}

const IPADS = [
  { label: 'ipad-air-portrait', width: 820, height: 1180 },
  { label: 'ipad-air-landscape', width: 1180, height: 820 },
  { label: 'ipad-pro13-portrait', width: 1024, height: 1366 },
  { label: 'ipad-pro13-landscape', width: 1366, height: 1024 },
];
// standalone iPad insets: status bar on top, home indicator at the bottom (both orientations)
const INSETS = { sat: 24, sab: 20, sal: 0, sar: 0 };

async function layoutRun(browser, port) {
  for (const vp of IPADS) {
    const page = await browser.newPage(); watch(page, vp.label);
    await page.setUserAgent(IPAD_UA);
    await page.setViewport({ width: vp.width, height: vp.height, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/?debug&seed=11&lp=2500`, { waitUntil: 'load' });
    await gameReady(page);
    await page.addStyleTag({ content: `:root{--sat:${INSETS.sat}px!important;--sab:${INSETS.sab}px!important;--sal:${INSETS.sal}px!important;--sar:${INSETS.sar}px!important}` });
    await sleep(800);
    const inside = sels => page.evaluate((sels, ins) => {
      const W = innerWidth, H = innerHeight; const bad = [];
      for (const s of sels) { const el = document.querySelector(s); if (!el) { bad.push(s + ' missing'); continue; }
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        if (r.top < ins.sat - 0.5 || r.bottom > H - ins.sab + 0.5 || r.left < ins.sal - 0.5 || r.right > W - ins.sar + 0.5) bad.push(`${s} ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`); }
      return { W, H, bad };
    }, sels, INSETS);
    const t = await inside(['.brand', '#diffs', '#btn-play', '.howto']);
    check(`${vp.label}: title inside safe area`, t.W === vp.width && t.H === vp.height && t.bad.length === 0, t.bad.join(' | '));
    await page.screenshot({ path: `${OUT}/${vp.label}-title.png` });
    const b = await page.$('#btn-play'); const bb = await b.boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(2200);
    const g = await inside(['#hud .bar', '#btn-flag', '#hint']);
    check(`${vp.label}: HUD inside safe area`, g.bad.length === 0, g.bad.join(' | '));
    const c = await page.evaluate(() => SF.visibleCells('hidden')[0]);
    await page.touchscreen.tap(c.x, c.y); await sleep(1500);
    const inf = await page.evaluate(() => SF.info());
    check(`${vp.label}: touch reveal works`, inf.revealed > 0, JSON.stringify(inf));
    await page.screenshot({ path: `${OUT}/${vp.label}-game.png` });
    await page.evaluate(() => SF.forceWin()); await page.waitForFunction(() => SF.info().resultShown, { timeout: 15000 }).catch(() => {}); await sleep(1500);   // the win sequence can run slowly on a GPU-less headless box
    const r = await inside(['#result .card']);
    check(`${vp.label}: result card inside safe area`, r.bad.length === 0 && await page.evaluate(() => SF.info().resultShown), r.bad.join(' | '));
    await page.screenshot({ path: `${OUT}/${vp.label}-result.png` });
    await page.close();
  }
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', timeout: 90000, protocolTimeout: 240000,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const parent = '/tmp/sfparent'; fs.mkdirSync(parent, { recursive: true });
  try { fs.lstatSync(path.join(parent, 'starfall')); } catch { fs.symlinkSync(__dirname, path.join(parent, 'starfall')); }
  try {
    await offlineRun(browser, 'root', __dirname, 8871, '/');
    await offlineRun(browser, 'subpath', parent, 8872, '/starfall/');
    const lsrv = serve(__dirname, 8873); await waitUp('http://127.0.0.1:8873/');
    await layoutRun(browser, 8873); lsrv.kill();
  } catch (e) { check('run completed', false, e.stack); }
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  check('no console errors/warnings', errors.length === 0, errors.join('\n'));
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} passed`);
  process.exit(failed || errors.length ? 1 : 0);
})();
