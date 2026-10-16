const { chromium, webkit } = require('/tmp/skyward-test/node_modules/playwright');
(async () => {
  const bt = process.argv[2] === 'webkit' ? webkit : chromium;
  const b = await bt.launch({ timeout: 30000 });
  const p = await (await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: process.argv[2] !== 'webkit' ? true : undefined })).newPage();
  p.setDefaultTimeout(20000);
  p.on('console', m => console.log('console', m.type(), m.text().slice(0, 300))); p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8774/?nosw');
  await p.waitForFunction(() => window.__booted, null, { timeout: 20000 }).catch(e => console.log('noboot'));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: '/tmp/cubby-shots/smoke-title.png' });
  await p.evaluate(() => CI.start(0, 7)); await p.waitForTimeout(2500);
  console.log(await p.evaluate(() => ({ fps: CI.fps, P: CI.P, w: CI.worker, m: CI.meshed })));
  await p.screenshot({ path: '/tmp/cubby-shots/smoke-play.png' });
  await b.close();
})();
