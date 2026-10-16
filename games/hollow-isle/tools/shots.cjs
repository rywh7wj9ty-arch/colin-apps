// node tools/shots.cjs  -> /tmp/hollow-shots/best-*.png (deploy on :8786)
const { chromium } = require('/tmp/lumen-test/node_modules/playwright');
const O = '/tmp/hollow-shots/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://127.0.0.1:8786/?nosw'); await p.waitForFunction(() => window.__booted, null, { timeout: 30000 });
  await p.evaluate(() => HI.setQuality('high')); await p.waitForTimeout(2500);
  await p.screenshot({ path: O + 'best-1-title.png' });
  await p.evaluate(() => HI.start(0, 7)); await p.waitForTimeout(2500);
  await p.evaluate(() => { HI.hideBubble(); HI.freezeCreatures(); HI.sim.s.fuel = 100; if (!HI.sim.s.lanternUp) HI.toggleLantern(); HI.view(2.4, 0.42, 9); });
  await p.waitForTimeout(3000); await p.screenshot({ path: O + 'best-2-night-lantern.png' });
  await p.evaluate(() => { HI.sim.s.lanternUp = false; HI.setStorm && HI.setStorm(true); HI.sim.lights = []; HI.view(HI.camS.yaw, 0.3, 8);
    const d = { x: -Math.sin(HI.camS.yaw), z: -Math.cos(HI.camS.yaw) }; HI.spawnHollow(HI.P.x + d.x * 9, HI.P.z + d.z * 9); });
  await p.waitForTimeout(1500); await p.screenshot({ path: O + 'best-3-hollow-fog.png' });
  await p.evaluate(() => { HI.setStorm && HI.setStorm(false); HI.freezeCreatures(); HI.sim.s.dawn = true; HI.dawnNow(); HI.view(1.2, 0.35, 11); });
  await p.waitForTimeout(4000); await p.evaluate(() => HI.hideBubble()); await p.screenshot({ path: O + 'best-4-dawn.png' });
  await b.close();
})();
