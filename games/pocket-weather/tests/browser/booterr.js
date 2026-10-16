// Boot-error safety: break the game module on purpose and check the "Tap to reload" card appears with the error text.
const { chromium, webkit } = require('playwright');
(async () => {
  let fails = 0;
  for (const [name, eng] of [['chromium', chromium], ['webkit', webkit]]) {
    const b = await eng.launch();
    for (const mode of ['syntax', '404']) {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
      await ctx.route(/game\.js/, r => mode === '404' ? r.fulfill({ status: 404, body: 'nope' }) : r.fulfill({ status: 200, contentType: 'text/javascript', body: 'import x from "./nothing-here.js"; const = ;' }));
      const p = await ctx.newPage();
      await p.goto('http://127.0.0.1:8769/', { waitUntil: 'domcontentloaded', timeout: 90000 });
      let ok = false, text = '';
      try { await p.waitForSelector('#booterr', { timeout: 20000 }); ok = true; text = (await p.textContent('#booterr')).replace(/\s+/g, ' ').trim(); } catch (e) {}
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} broken game.js (${mode}): reload card shown — "${text.slice(0, 90)}"`);
      if (!ok) fails++;
      if (name === 'webkit' && mode === 'syntax') await p.screenshot({ path: '/tmp/skyward-shots/boot-error.png' });
      await ctx.close();
    }
    await b.close();
  }
  process.exit(fails ? 1 : 0);
})();
