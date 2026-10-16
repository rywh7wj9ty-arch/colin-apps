// Renders the app icon and arcade card from the game itself: node tools/art.cjs (source served on :8775)
const { chromium } = require('/tmp/lumen-test/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ timeout: 30000 });
  const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:8775/?nosw&debug', { timeout: 20000 }); await p.waitForFunction(() => window.__booted, null, { timeout: 20000 });
  await p.evaluate(() => { document.getElementById('ui').style.display = 'none'; const w = DB.world; w.setHat('straw'); w.zoom = 2.3; w.pan.set(0, -0.55); w.setRect({ x: 0, y: 0, w: 512, h: 512 }); w.moleDo('cheer'); });
  await p.waitForTimeout(400); await p.evaluate(() => { DB.world.moleState.t = 0.3; DB.world.moleDo('title'); });
  await p.waitForTimeout(1200); await p.screenshot({ path: '/tmp/dig-buddies-shots/art-icon-raw.png' });
  await p.setViewportSize({ width: 960, height: 600 }); await p.evaluate(() => { document.getElementById('ui').style.display = ''; document.querySelector('.title-btns').style.visibility = 'hidden'; DB.show('title'); });
  await p.waitForTimeout(2500); await p.screenshot({ path: '/tmp/dig-buddies-shots/art-card-raw.png' });
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
