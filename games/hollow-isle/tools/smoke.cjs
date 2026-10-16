const { chromium, webkit } = require('/tmp/lumen-test/node_modules/playwright');
(async () => {
  const bn = process.argv[2] || 'chromium', bt = bn === 'webkit' ? webkit : chromium;
  const b = await bt.launch({ timeout: 30000 });
  const p = await (await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true })).newPage();
  p.setDefaultTimeout(20000);
  p.on('console', m => console.log('console', m.type(), m.text().slice(0, 300))); p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://127.0.0.1:8786/?nosw');
  await p.waitForFunction(() => window.__booted, null, { timeout: 20000 }).catch(e => console.log('noboot'));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `/tmp/hollow-shots/smoke-${bn}-title.png` });
  await p.evaluate(() => HI.start(0, 7)); await p.waitForTimeout(3000);
  console.log(JSON.stringify(await p.evaluate(() => ({ fps: HI.fps, P: HI.P, w: HI.worker, m: HI.meshed, post: HI.post, h: HI.hollows.length }))));
  await p.evaluate(() => HI.hideBubble());
  await p.screenshot({ path: `/tmp/hollow-shots/smoke-${bn}-play.png` });
  await p.evaluate(() => { HI.sim.s.fuel = 80; HI.toggleLantern(); HI.view(2.4, 0.4, 9); }); await p.waitForTimeout(1500);
  await p.screenshot({ path: `/tmp/hollow-shots/smoke-${bn}-lantern.png` });
  await b.close();
})();
