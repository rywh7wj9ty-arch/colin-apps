/* Unit tests for Pocket Weather's core logic: weather effects on tiles, pathing, solvability and saves.
   Run: node tests/test-logic.js */
const L = require('../logic.js'), { LEVELS } = require('../levels.js');
const { T, O } = L;
let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log('  FAIL', msg); } }
function eq(a, b, msg) { ok(a === b, msg + ` (got ${a}, want ${b})`); }
const lvl = (map, extra) => L.parse(Object.assign({ id: 't', world: 4, map }, extra || {}));
const at = (s, x, y) => s.t[L.idx(s, x, y)];

// ── rain ──
{ const s = lvl(['$.s.*']); L.apply(s, { w: 'rain', x: 2, y: 0 }); eq(at(s, 2, 0), T.VINE, 'rain grows a sprout into a vine bridge'); }
{ const s = lvl(['$m*'], { heights: ['001'] }); L.apply(s, { w: 'rain', x: 1, y: 0 }); eq(at(s, 1, 0), T.MUSH, 'rain grows a mushroom'); L.settle(s); ok(s.won, 'mushroom bounces the wanderer up a ledge'); }
{ const s = lvl(['$b*']); L.apply(s, { w: 'rain', x: 1, y: 0 }); eq(at(s, 1, 0), T.POND, 'rain fills a dry basin'); ok(s.f[1] & L.F_LILY, 'the filled pond has lily pads'); ok(L.walkable(s, 1), 'lily pond is walkable'); }
{ const s = lvl(['$,*']); L.apply(s, { w: 'rain', x: 1, y: 0 }); eq(at(s, 1, 0), T.MUD, 'rain turns dirt into mud'); ok(!L.walkable(s, 1), 'mud blocks'); }
{ const s = lvl(['$f*']); L.apply(s, { w: 'rain', x: 1, y: 0 }); eq(at(s, 1, 0), T.ASH, 'rain puts out fire'); }
{ const s = lvl(['$=*']); L.apply(s, { w: 'rain', x: 1, y: 0 }); eq(at(s, 1, 0), T.PUDDLE, 'rain makes stone into a puddle'); }
{ const s = lvl(['.....', '..,..', '.,,,.', '..,..', '$...*']); L.apply(s, { w: 'rain', x: 2, y: 2 });
  eq([[2, 2], [1, 2], [3, 2], [2, 1], [2, 3]].filter(([x, y]) => at(s, x, y) === T.MUD).length, 5, 'a rain cloud covers a plus shape (5 tiles)'); eq(at(s, 1, 1), T.GRASS, 'diagonals stay dry'); }
// ── sun ──
{ const s = lvl(['$I*']); L.apply(s, { w: 'sun', x: 1, y: 0 }); eq(at(s, 1, 0), T.PUDDLE, 'sun melts an ice block'); }
{ const s = lvl(['$~*']); L.apply(s, { w: 'sun', x: 1, y: 0 }); eq(at(s, 1, 0), T.DIRT, 'sun dries mud'); }
{ const s = lvl(['$o*']); L.apply(s, { w: 'sun', x: 1, y: 0 }); eq(at(s, 1, 0), T.BASIN, 'sun dries a pond'); }
{ const s = lvl(['$G*', '.F.']); L.apply(s, { w: 'sun', x: 1, y: 1 }); eq(at(s, 1, 0), T.GATEOPEN, 'sunflower opens gates'); }
{ const s = lvl(['$R__R*']); L.apply(s, { w: 'sun', x: 1, y: 0 }); eq(at(s, 2, 0), T.VOID, 'sun alone makes no rainbow');
  L.apply(s, { w: 'rain', x: 1, y: 0 }); L.apply(s, { w: 'sun', x: 1, y: 0 }); eq(at(s, 2, 0), T.RAINBOW, 'rain then sun makes a rainbow bridge'); eq(at(s, 3, 0), T.RAINBOW, 'rainbow spans the whole gap'); L.settle(s); ok(s.won, 'wanderer crosses the rainbow'); }
// ── snow ──
{ const s = lvl(['$w*']); L.apply(s, { w: 'snow', x: 1, y: 0 }); eq(at(s, 1, 0), T.ICE, 'snow freezes water');
  const c = L.clone(s); L.apply(c, { w: 'sun', x: 1, y: 0 }); eq(at(c, 1, 0), T.WATER, 'sun melts ice back into water');
  L.settle(s); ok(s.won, 'wanderer walks on ice'); }
{ const s = lvl(['$~*']); L.apply(s, { w: 'snow', x: 1, y: 0 }); eq(at(s, 1, 0), T.FROZEN, 'snow freezes mud into walkable ground'); ok(L.walkable(s, 1), 'frozen mud is walkable'); }
// ── wind ──
{ const s = lvl(['$Bww*']); L.settle(s); eq(s.wx, 1, 'wanderer boards the boat'); L.apply(s, { w: 'wind', x: 1, y: 0, dir: 'e' }); eq(s.o[3], O.BOAT, 'wind pushes the boat until it hits land'); eq(s.wx, 3, 'the wanderer rides along'); L.settle(s); ok(s.won, 'boat crossing wins'); }
{ const s = lvl(['$d_*']); L.apply(s, { w: 'wind', x: 1, y: 0, dir: 'e' }); eq(at(s, 2, 0), T.SAND, 'a sand pile blown into a gap becomes ground'); eq(s.o[1], 0, 'the pile is used up'); }
{ const s = lvl(['M.$', '..L*'], { heights: ['000', '0001'] }); L.settle(s); L.apply(s, { w: 'wind', x: 0, y: 0, dir: 'e' }); ok(s.f[L.idx(s, 2, 1)] & L.F_UP, 'wind on a windmill raises lifts'); L.settle(s); ok(s.won, 'lift carries the wanderer up'); }
{ const s = lvl(['$.__.*'], { heights: ['220011'] }); L.settle(s); eq(s.wx, 1, 'wanderer waits at the cliff edge'); L.apply(s, { w: 'wind', x: 1, y: 0, dir: 'e' }); eq(s.wx, 4, 'wind makes the wanderer glide across a gap'); }
{ const s = lvl(['$.__.*']); L.settle(s); L.apply(s, { w: 'wind', x: 1, y: 0, dir: 'e' }); eq(s.wx, 1, 'no gliding without a drop'); }
{ const s = lvl(['$=c__*', '___T__']); L.settle(s); L.apply(s, { w: 'wind', x: 2, y: 0, dir: 'e' }); eq(s.o[4], O.CLOUD, 'cloud platforms drift on the wind'); }
// ── lightning ──
{ const s = lvl(['$r*'], { bolts: 1 }); L.apply(s, { w: 'bolt', x: 1, y: 0 }); eq(at(s, 1, 0), T.RUBBLE, 'lightning shatters rocks'); eq(s.bolts, 0, 'a bolt is used up');
  const r = L.apply(s, { w: 'bolt', x: 0, y: 0 }); ok(!r.ok, 'no lightning left'); }
{ const s = lvl(['$k*'], { bolts: 1 }); L.apply(s, { w: 'bolt', x: 1, y: 0 }); eq(at(s, 1, 0), T.FIRE, 'lightning sets brambles alight'); }
{ const s = lvl(['wE_', '$D*'], { bolts: 2 }); L.apply(s, { w: 'bolt', x: 1, y: 0 }); eq(at(s, 1, 1), T.DRAW, 'coils are insulated against direct strikes');
  L.apply(s, { w: 'bolt', x: 0, y: 0 }); eq(at(s, 1, 1), T.DRAWON, 'electricity through water powers the coil and lowers the bridge'); }
{ const s = lvl(['w==E', '$..D*'], { bolts: 1 }); L.apply(s, { w: 'rain', x: 2, y: 0 }); eq(at(s, 1, 0), T.PUDDLE, 'rain makes puddle wires'); L.apply(s, { w: 'bolt', x: 0, y: 0 }); eq(at(s, 3, 1), T.DRAWON, 'puddles conduct to the coil'); }
// ── pathing and safety ──
{ const s = lvl(['$.T.*', '.....']); const d = L.decide(s); ok(d && d.reachGoal, 'the wanderer finds a path around obstacles'); L.settle(s); ok(s.won, 'and reaches the goal'); }
{ const s = lvl(['$._.*']); L.settle(s); eq(s.wx, 1, 'with no path, the wanderer waits as close to the goal as it can'); ok(!s.won, 'and does not win'); }
{ const s = lvl(['$.^.', '___*'], { heights: ['0001', '0001'] }); L.settle(s); ok(s.won, 'steps climb one level'); }
{ const s = lvl(['$.=*'], { heights: ['0011'] }); L.settle(s); ok(!s.won, 'cannot climb a ledge without steps'); }
{ const s = lvl(['$o_*']); L.settle(s); eq(s.wx, 1, 'wanderer stands on a lily pad'); L.apply(s, { w: 'sun', x: 1, y: 0 }); eq(s.wx, 0, 'drying the pond under them floats them back to safety'); ok(L.walkable(s, L.idx(s, s.wx, s.wy)), 'they land on solid ground'); }
// ── secrets ──
{ const s = lvl(['$..*'], { drops: [[1, 0, 'rain'], [2, 0, 'sun']] }); let r = L.apply(s, { w: 'sun', x: 1, y: 0 }); ok(!r.events.some(e => e.type === 'drop'), 'wrong weather hides the drop');
  r = L.apply(s, { w: 'rain', x: 2, y: 0 }); ok(r.events.some(e => e.type === 'drop' && e.id === 0), 'rain splash reveals a rain drop next door'); r = L.apply(s, { w: 'sun', x: 2, y: 0 }); ok(r.events.some(e => e.type === 'drop' && e.id === 1), 'sun reveals the sun drop'); }
// ── every level: scripted solution wins, and the solver agrees on the challenge target ──
LEVELS.forEach(d => {
  ok(Array.isArray(d.solution) && d.solution.length, d.id + ' has a scripted solution');
  const s = L.replay(d, d.solution);
  ok(s.won, d.id + ' scripted solution reaches the goal');
  ok(d.solution.length >= d.par, d.id + ' par is not more than the scripted solution');
  const st = L.parse(d); L.settle(st); ok(!st.won, d.id + ' is not won without any weather');
  ok(d.drops.length === 3, d.id + ' has 3 sun drops');
  d.drops.forEach(([x, y, w]) => { ok(L.weathersFor(d).includes(w), `${d.id} drop at ${x},${y} uses an available weather (${w})`); ok(L.inb(st, x, y) && st.t[L.idx(st, x, y)] !== T.VOID, `${d.id} drop at ${x},${y} sits on ground`); });
});
{ const lv = LEVELS.find(l => l.id === '1-3'); const r = L.solve(lv); eq(r.actions.length, lv.par, 'solver finds the 1-3 challenge target'); }
// ── saves ──
{ const f = L.freshSave(); eq(f.settings.music, 0.6, 'fresh save has default settings'); ok(L.isUnlocked(f, LEVELS, 0), 'first level is open'); ok(!L.isUnlocked(f, LEVELS, 1), 'second level is locked');
  const res = L.recordWin(f, LEVELS[0], 3); ok(res.first, 'first win is recorded'); ok(L.isUnlocked(f, LEVELS, 1), 'winning unlocks the next level'); eq(f.levels['1-1'].best, 3, 'best is stored'); ok(!f.levels['1-1'].challenge, 'challenge needs par or better');
  L.recordWin(f, LEVELS[0], 1); eq(f.levels['1-1'].best, 1, 'best improves'); ok(f.levels['1-1'].challenge, 'challenge beaten at par'); L.recordWin(f, LEVELS[0], 5); eq(f.levels['1-1'].best, 1, 'a worse run keeps the best');
  f.levels['1-1'].drops[2] = true; f.settings.leftHanded = true;
  const back = L.mergeSave(JSON.stringify(f)); ok(back.levels['1-1'].drops[2] && back.settings.leftHanded && back.levels['1-1'].done, 'a save survives a JSON round trip');
  eq(L.mergeSave('{broken').levels['1-1'], undefined, 'corrupt storage gives a fresh save'); eq(L.mergeSave(null).stats.rain, 0, 'empty storage gives a fresh save');
  const weird = L.mergeSave({ settings: { music: 'loud', sfx: 0.2 }, stats: { rain: 'x', sun: 4 } }); eq(weird.settings.music, 0.6, 'bad setting types are ignored'); eq(weird.settings.sfx, 0.2, 'good settings are kept'); eq(weird.stats.sun, 4, 'good stats are kept'); }

console.log(`logic tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
