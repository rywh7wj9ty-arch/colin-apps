// node tools/scenes.cjs <label> [port]  -> /tmp/hollow-shots/<label>/<device>-<scene>.png
const { chromium } = require('/tmp/lumen-test/node_modules/playwright');
const fs = require('fs');
const label = process.argv[2] || 'x', port = process.argv[3] || 8786, O = `/tmp/hollow-shots/${label}/`; fs.mkdirSync(O, { recursive: true });
const DEV = [['iphone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }], ['ipad', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true }]];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  for (const [dn, o] of DEV) {
    const p = await (await b.newContext(o)).newPage(); p.on('pageerror', e => console.log('ERR', e.message));
    await p.goto(`http://127.0.0.1:${port}/?nosw`); await p.waitForFunction(() => window.__booted, null, { timeout: 30000 });
    await p.evaluate(() => HI.setQuality('high')); await p.waitForTimeout(2500);
    const snap = async n => { await p.evaluate(() => HI.hideBubble()); await p.screenshot({ path: `${O}${dn}-${n}.png` }); };
    await snap('1-title');
    await p.evaluate(() => HI.start(0, 7)); await p.waitForTimeout(2500);
    const base = () => { HI.freezeCreatures(); HI.setStorm(false); HI.sim.s.lanternUp = false; HI.setTime(0.5); HI.sim.s.bloodT = 0; HI.sim.s.dawn = false; HI.sim.s.courage = 100; };
    await p.evaluate(`(${base})(); HI.view(2.4, 0.5, 11);`); await p.waitForTimeout(2500); await snap('2-night');
    await p.evaluate(`(${base})(); (() => { const w = HI.sim.world; let best = null, bd = 1e9; for (let i = 0; i < w.vox.length; i++) if (w.vox[i] === Hollow.B.LOG) { const [x, y, z] = w.coord(i); const d = Math.hypot(x - HI.P.x, z - HI.P.z); if (d < bd && w.get(x, y - 1, z) !== Hollow.B.LOG) { bd = d; best = [x, y, z]; } }
      if (best) HI.setHero(best[0] + 2.5, HI.surf(best[0] + 2.5, best[2] + 0.5), best[2] + 0.5); HI.sim.s.fuel = 100; HI.sim.s.lanternUp = true; HI.view(-0.9, 0.45, 8); })()`);
    await p.waitForTimeout(2500); await snap('3-lantern');
    await p.evaluate(`(${base})(); HI.setHero(64.5, HI.surf(64.5, 92.5), 92.5); HI.view(2.4, 0.3, 8); const d = { x: -Math.sin(2.4), z: -Math.cos(2.4) }; HI.spawnHollow(HI.P.x + d.x * 5 + 1.5, HI.P.z + d.z * 5);`);
    await p.waitForTimeout(1500); await snap('4-hollow');
    await p.evaluate(`(${base})(); HI.hollows.length = HI.hollows.length; const c = Hollow.LANDMARKS.cave; HI.setHero(c.x - 1.5, c.y, c.z + 0.5); HI.view(1.6, 0.5, 6);`);
    await p.waitForTimeout(2500); await snap('5-cave');
    await p.evaluate(`(${base})(); HI.setHero(64.5, HI.surf(64.5, 92.5), 92.5); HI.sim.s.bloodT = 60;`); await p.waitForTimeout(2500); await p.evaluate(() => { HI.sim.s.courage = 100; HI.freezeCreatures(); }); await p.evaluate(` HI.view(HI.moonYaw + 0.35, 0.12, 9);`);
    await p.waitForTimeout(5000); await snap('6-bloodmoon');
    await p.evaluate(`(${base})(); HI.sim.s.dawn = true; HI.dawnNow(); HI.view(1.2, 0.35, 11);`);
    await p.waitForTimeout(4500); await snap('7-dawn');
    await p.close();
  }
  await b.close();
})();
