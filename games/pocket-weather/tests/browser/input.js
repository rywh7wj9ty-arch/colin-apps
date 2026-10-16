// Gesture helpers. Each gesture is dispatched inside the page in one go so slow headless (software GL) frames
// can't stretch a quick tap/swipe into a "hold". Events go through the game's real pointer handlers / classifier.
async function gesture(p, kind, pts, holdMs = 0) {
  await p.evaluate(async ([kind, pts, holdMs]) => {
    const cv = document.getElementById('scene');
    const fire = (type, q) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: q.x, clientY: q.y, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
    fire('pointerdown', pts[0]);
    if (holdMs) {   // keep the finger down until the cloud bursts (frame-paced; slow in software GL) or the timeout
      const u0 = window.__pw ? __pw.state().uses : 0, t0 = performance.now();
      await new Promise(r => setTimeout(r, Math.min(holdMs, 800)));
      while (window.__pw && __pw.state().uses === u0 && performance.now() - t0 < holdMs) await new Promise(r => setTimeout(r, 50));
    }
    for (let k = 1; k < pts.length; k++) fire('pointermove', pts[k]);
    fire('pointerup', pts[pts.length - 1]);
  }, [kind, pts, holdMs]);
}
const line = (a, b, n = 6) => Array.from({ length: n + 1 }, (_, k) => ({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }));
const tap = (p, q) => gesture(p, 'tap', [q]);
const hold = (p, q, ms = 15000) => gesture(p, 'hold', [q], ms);
const swipe = (p, a, b) => gesture(p, 'swipe', line(a, b));
module.exports = { gesture, tap, hold, swipe, line };
