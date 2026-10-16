const { chromium } = require('/tmp/skyward-test/node_modules/playwright');
const S = '/tmp/cubby-shots/';
(async () => {
  const b = await chromium.launch({ timeout: 30000 });
  const p = await (await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })).newPage();
  p.setDefaultTimeout(30000); p.on('pageerror', e => console.log('err', e.message));
  await p.goto('http://localhost:8774/?nosw'); await p.waitForFunction(() => window.__booted, null, { timeout: 20000 });
  await p.waitForTimeout(2500); await p.screenshot({ path: S + 'best-1-title.png' });
  await p.evaluate(() => CI.start(1, 7)); await p.waitForTimeout(1200);
  await p.evaluate(() => { CI.hideBubble(); });
  // build a cottage from the blueprint + lanterns + garden near spawn, all through the sim API
  await p.evaluate(() => {
    const s = CI.sim, w = s.world, B = Cubby.B, bp = Cubby.BLUEPRINTS[0].blocks;
    const ox = 60, oz = 94; let oy = 0;
    for (let z = -2; z < 7; z++) for (let x = -2; x < 7; x++) oy = Math.max(oy, CI.surf(ox + x + .5, oz + z + .5));
    for (let z = -2; z < 7; z++) for (let x = -2; x < 7; x++) { for (let y = oy; y < oy + 8; y++) w.set(ox + x, y, oz + z, 0); for (let y = CI.surf(ox + x + .5, oz + z + .5); y < oy; y++) w.set(ox + x, y, oz + z, B.DIRT); w.set(ox + x, oy - 1, oz + z, B.GRASS); }
    for (const [x, y, z, id] of bp) { s.add(id, 1); }
    const put = (x, y, z, id) => { s.s.hero.x = x + 3.5; s.s.hero.y = y; s.s.hero.z = z + 0.5; s.add(id, 1); return s.place(x, y, z, id); };
    let left = bp.slice(); for (let k = 0; k < 10 && left.length; k++) left = left.filter(([x, y, z, id]) => !put(ox + x, oy + y, oz + z, id));
    for (const [dx, dz] of [[-2, -1], [6, -1], [-2, 5], [6, 5], [2, -3]]) put(ox + dx, oy, oz + dz, B.LANTERN);
    for (let x = -1; x <= 5; x += 2) put(ox + x, oy, oz - 2, B.FLOWER);
    for (let z = -1; z <= 5; z++) put(ox + 7, oy, oz + z, B.FENCE);
    window.__home = { x: ox + 2.5, y: oy, z: oz - 3.5 };
  });
  await p.waitForTimeout(1500);
  // daylight overview
  await p.evaluate(() => { const h = window.__home; CI.setHero(h.x + 1, h.y, h.z - 2); CI.setTime(0.42); CI.view(2.6, 0.55, 22); CI.P.yaw = 0.5; });
  await p.waitForTimeout(2500); await p.screenshot({ path: S + 'best-2-daylight.png' });
  await p.evaluate(() => { document.getElementById('hud').classList.add('hidden'); CI.view(2.9, 0.62, 26); }); await p.waitForTimeout(1500); await p.screenshot({ path: S + 'card-src.png' }); await p.evaluate(() => document.getElementById('hud').classList.remove('hidden'));
  // cottage moment (golden hour, buns following)
  await p.evaluate(() => { const h = window.__home; CI.sim.add(Cubby.B.FLOWER, 3); CI.sim.feed(); CI.sim.feed(); CI.setHero(h.x, h.y, h.z - 1); CI.setTime(0.69); CI.view(3.4, 0.38, 13); CI.P.yaw = 3.14; });
  await p.waitForTimeout(3000); await p.screenshot({ path: S + 'best-4-cottage.png' });
  // sunset + night with lanterns and fireflies
  await p.evaluate(() => { CI.setTime(0.765); CI.view(2.9, 0.33, 15); });
  await p.waitForTimeout(2500); await p.screenshot({ path: S + 'best-3a-sunset.png' });
  await p.evaluate(() => { CI.setTime(0.9); CI.view(2.4, 0.42, 14); });
  await p.waitForTimeout(2500); await p.screenshot({ path: S + 'best-3b-night-lanterns.png' });
  // waterfall + mountain
  await p.evaluate(() => { const L = Cubby.LANDMARKS.waterfall; CI.setHero(L.x + 6.5, CI.surf(L.x + 6.5, L.z + .5), L.z + 0.5); CI.setTime(0.36); CI.view(1.2, 0.3, 16); });
  await p.waitForTimeout(2500); await p.screenshot({ path: S + 'extra-waterfall.png' });
  // hero close-up for the icon
  await p.evaluate(() => { const h = window.__home; CI.setHero(h.x, h.y, h.z - 3); CI.setTime(0.45); CI.view(0, 0.3, 4.2); CI.P.yaw = 0; document.getElementById('hud').classList.add('hidden'); });
  await p.waitForTimeout(2500); await p.screenshot({ path: S + 'hero-closeup.png' });
  await b.close();
})();
