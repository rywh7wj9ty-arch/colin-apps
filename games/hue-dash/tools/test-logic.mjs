import assert from 'assert';
import { prepare, newState, step, runScript, nextColor, colorAt, starsFor } from '../logic.js';
import { LEVELS } from '../levels.js';
import fs from 'fs';
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
const L = els => prepare({ ncol: 2, v0: 10, v1: 10, end: 100, start: 2, els: els.map(e => ({ h: 10, ...e })) });
const run = (lvl, n, inp = () => ({})) => { const s = newState(lvl); for (let i = 0; i < n && !s.dead && !s.fin; i++) step(s, lvl, inp(i, s)); return s; };
t('matching colour platform is safe', () => { const s = run(L([{ t: 'p', x: 0, w: 50, y: 0, c: 1 }]), 120); assert(!s.dead && s.grounded); });
t('mismatched colour platform shatters', () => { const s = run(L([{ t: 'p', x: 0, w: 50, y: 0, c: 2 }]), 20); assert(s.dead && s.cause === 'color'); });
t('neutral platform safe in any colour', () => { const s = run(L([{ t: 'p', x: 0, w: 50, y: 0, c: 0 }]), 60, i => ({ sw: i % 10 === 0 ? 1 : 0 })); assert(!s.dead); });
t('switching while standing on colour kills', () => { const s = run(L([{ t: 'p', x: 0, w: 50, y: 0, c: 1 }]), 30, i => ({ sw: i === 10 ? 1 : 0 })); assert(s.dead && s.cause === 'color'); });
t('mid-air switch to match landing platform survives', () => {
  const lvl = L([{ t: 'p', x: 0, w: 6, y: 0, c: 1 }, { t: 'p', x: 9, w: 40, y: 0, c: 2 }]);
  const s = run(lvl, 200, i => ({ jp: i === 20, jh: i < 40, sw: i === 40 ? 1 : 0 })); assert(!s.dead && s.col === 2, s.cause);
});
t('not switching before landing shatters', () => {
  const lvl = L([{ t: 'p', x: 0, w: 6, y: 0, c: 1 }, { t: 'p', x: 9, w: 40, y: 0, c: 2 }]);
  const s = run(lvl, 200, i => ({ jp: i === 20, jh: i < 40 })); assert(s.dead && s.cause === 'color');
});
t('thin wall must match', () => {
  const mk = () => L([{ t: 'p', x: 0, w: 50, y: 0, c: 0 }, { t: 'w', x: 10, y: 0, h: 6, c: 2 }]);
  assert(run(mk(), 200).dead); assert(!run(mk(), 200, i => ({ sw: i === 5 ? 1 : 0 })).dead);
});
t('flip platform colour alternates on its beat', () => { const p = { c: 1, c2: 2, fp: 1, fo: 0 }; assert.equal(colorAt(p, 0.5), 1); assert.equal(colorAt(p, 1.5), 2); });
t('third colour cycles', () => { assert.equal(nextColor(1, 3), 2); assert.equal(nextColor(3, 3), 1); assert.equal(nextColor(2, 2), 1); });
t('spikes kill', () => { assert.equal(run(L([{ t: 'p', x: 0, w: 50, y: 0, c: 0 }, { t: 's', x: 8, y: 0, w: 0.8 }]), 200).cause, 'spike'); });
t('side crash into a wall kills', () => { assert.equal(run(L([{ t: 'p', x: 0, w: 50, y: 0, c: 0 }, { t: 'p', x: 8, w: 4, y: 3, c: 0 }]), 200).cause, 'crash'); });
t('double jump works once', () => { const s = run(L([{ t: 'p', x: 0, w: 50, y: 0, c: 0 }]), 40, i => ({ jp: i === 1 || i === 20 || i === 30 })); assert.equal(s.jumpsN, 2); });
t('matching pad launches, mismatched pad kills', () => {
  const mk = c => L([{ t: 'p', x: 0, w: 5, y: 0, c: 0 }, { t: 'p', x: 5, w: 2.5, y: 0, c, pad: 1 }, { t: 'p', x: 7.5, w: 50, y: -20, c: 0 }]);
  assert.equal(run(mk(2), 80).cause, 'color'); const s = run(mk(1), 50); assert(!s.dead && s.y > 1);
});
t('gravity gate flips gravity', () => { const s = run(L([{ t: 'p', x: 0, w: 50, y: 0, c: 0 }, { t: 'p', x: 0, w: 50, y: 7, h: 1, c: 0 }, { t: 'G', x: 5, y: 0, k: 0 }]), 150); assert(!s.dead && s.gs === -1 && Math.abs(s.y - 6) < 0.01); });
t('stars', () => { assert.deepEqual(starsFor({ par: 3, target: 20 }, { gems: 7, switches: 3, time: 19 }), [true, true, true]); });
const sols = JSON.parse(fs.readFileSync(new URL('./solutions.json', import.meta.url)));
assert.equal(LEVELS.length, 28);
for (const lvl of LEVELS) t(`L${lvl.id + 1} ${lvl.name}: scripted perfect run finishes with 3 gems, par and target`, () => {
  const s = runScript(JSON.parse(JSON.stringify(lvl)), sols[lvl.id]);
  assert(s.fin && !s.dead, `dead ${s.cause} at x=${s.x.toFixed(1)}`);
  assert.deepEqual(starsFor(lvl, { gems: s.gems, switches: s.switches, time: s.t }), [true, true, true]);
  assert(s.t >= 19 && s.t <= 45);
});
console.log(`\n${pass} passed`);
