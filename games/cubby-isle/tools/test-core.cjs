// Node unit tests: node tools/test-core.cjs
const C = require('../core.js'), M = require('../mesher.js');
const { B, SEA } = C; let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); };
const crc = a => { let h = 2166136261; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); } return h >>> 0; };

// --- terrain determinism ---
const a = C.generate(1234), b = C.generate(1234), c = C.generate(999);
ok(crc(a.vox) === crc(b.vox), 'same seed gives identical terrain'); ok(crc(a.vox) !== crc(c.vox), 'different seeds differ');
ok(JSON.stringify(a.seeds) === JSON.stringify(b.seeds) && a.seeds.length === 12, '12 hidden Sun Seeds, deterministic');
const w = new C.World(1234);
const count = id => w.vox.reduce((n, v) => n + (v === id), 0);
ok(count(B.LOG) > 40 && count(B.WATER) > 1000 && count(B.SUNROCK) > 2 && count(B.CLAY) > 10 && count(B.SAND) > 1000, 'island has trees, water, sunrock, clay, sand');
ok(w.get(C.LANDMARKS.cave.x, C.LANDMARKS.cave.y, C.LANDMARKS.cave.z) === B.AIR && w.underground(C.LANDMARKS.cave.x, C.LANDMARKS.cave.y, C.LANDMARKS.cave.z), 'cave chamber is hollow and underground');
ok(w.get(C.LANDMARKS.waterfall.x, 25, C.LANDMARKS.waterfall.z) === B.WATER, 'waterfall exists');
for (const s of w.seeds) { const id = w.get(Math.floor(s.x), Math.floor(s.y - 0.6), Math.floor(s.z)); if (C.BLOCKS[id].solid) { ok(false, 'seed ' + s.id + ' not buried'); } }
ok(true, 'no Sun Seed is buried in a solid block');
// mesher sanity
M.setInfo(C.BLOCKS); const r = M.meshChunk(w.vox, 2, 2); ok(r.solid.i.length > 0 && r.solid.p.length / 3 * 2 >= 0, 'mesher produces geometry', (r.solid.i.length / 3) + ' tris');

// --- mining rules ---
const sim = new C.Sim(1234);
const find = (id, pred) => { for (let i = 0; i < sim.world.vox.length; i++) if (sim.world.vox[i] === id) { const p = sim.world.coord(i); if (!pred || pred(p)) return p; } return null; };
const at = (x, y, z) => { sim.s.hero.x = x + 0.5; sim.s.hero.y = y; sim.s.hero.z = z + 0.5; };
let p = find(B.STONE, q => q[1] > 2); at(...p);
ok(!sim.bonk(...p).hit, 'stone needs a pick');
p = find(B.BEDROCK); at(...p); ok(!sim.bonk(...p).hit, 'bedrock cannot be bonked');
p = find(B.LOG); sim.s.hero.x = p[0] + 20.5; sim.s.hero.z = p[2] + 0.5; sim.s.hero.y = p[1]; ok(!sim.bonk(...p).hit, 'out of reach is refused');
at(...p); const r1 = sim.bonk(...p), r2 = sim.bonk(...p), r3 = sim.bonk(...p);
ok(r1.hit && !r1.broke && !r2.broke && r3.broke, 'log takes 3 bonks bare-pawed'); ok(sim.count(B.LOG) === 1 && sim.world.get(...p) === B.AIR, 'log pops into the pocket');
ok(sim.world.deltas.size >= 1, 'edit stored as a delta');

// --- placing rules ---
sim.on((t, d) => { if (t === 'deny' && process.env.DBG) console.log('deny', d.why); });
let g = find(B.GRASS, q => sim.world.get(q[0], q[1] + 1, q[2]) === B.AIR && sim.world.get(q[0], q[1] + 2, q[2]) === B.AIR);
sim.s.hero.x = g[0] + 2.5; sim.s.hero.z = g[2] + 0.5; sim.s.hero.y = g[1] + 1;
ok(!sim.place(g[0], g[1], g[2], B.LOG), 'cannot place into an occupied cell');
for (let dy = 2; dy <= 4; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) sim.world.set(g[0] + dx, g[1] + dy, g[2] + dz, B.AIR);
sim.add(B.LOG, 1); ok(!sim.place(g[0], g[1] + 3, g[2], B.LOG), 'cannot place floating in thin air'); sim.add(B.LOG, -1);
sim.add(B.LOG, 1);
ok(sim.place(g[0], g[1] + 1, g[2], B.LOG) && sim.world.get(g[0], g[1] + 1, g[2]) === B.LOG && sim.count(B.LOG) === 1, 'place a block on grass');
sim.add(B.LOG, -sim.count(B.LOG)); ok(!sim.place(g[0], g[1] + 2, g[2], B.LOG), 'cannot place with an empty pocket');
sim.add(B.FLOWER, 1); ok(!sim.place(g[0], g[1] + 2, g[2], B.FLOWER), 'flowers only grow on grass');
sim.add(B.STONE, 1); sim.s.hero.x = g[0] + 0.5; sim.s.hero.y = g[1] + 2; ok(!sim.place(g[0], g[1] + 2, g[2], B.STONE), 'cannot place inside the hero'); sim.add(B.STONE, -1); sim.add(B.FLOWER, -1);

// --- crafting ---
const cs = new C.Sim(5);
ok(!cs.craft('planks'), 'locked recipe refused'); cs.s.unlocked.push('planks', 'woodpick');
ok(!cs.craft('planks'), 'craft needs ingredients'); cs.add(B.LOG, 1); ok(cs.craft('planks') && cs.count(B.PLANKS) === 4 && cs.count(B.LOG) === 0, 'log -> 4 planks');
ok(cs.craft('woodpick') && cs.s.tool === 1 && cs.count(B.PLANKS) === 1, 'planks -> wooden pick'); ok(!cs.craft('woodpick'), 'no duplicate pick');
for (const r of C.RECIPES) ok(Object.keys(r.need).every(k => C.BLOCKS[k]) && (r.tool || Object.keys(r.out).every(k => C.PLACEABLE.includes(+k))), 'recipe ' + r.id + ' is well formed');
const unlocks = new Set(C.QUESTS.flatMap(q => q.unlock)); ok(C.RECIPES.every(r => unlocks.has(r.id)), 'every recipe is unlocked by some quest');

// --- save round trip ---
const s1 = new C.Sim(4242); s1.add(B.LOG, 3); s1.s.found.push('peak'); s1.s.quest = 2; s1.world.set(10, 30, 10, B.BRICK); s1.world.set(60, 5, 60, B.AIR);
const str = s1.serialize(), s2 = new C.Sim(1, str);
ok(s2.world.seed === 4242 && crc(s2.world.vox) === crc(s1.world.vox), 'save/load restores the exact world from seed + deltas');
ok(s2.count(B.LOG) === 3 && s2.s.quest === 2 && s2.s.found[0] === 'peak', 'save/load restores inventory, quests and Sun Seeds');
ok(str.length < 5000, 'save is small (deltas only)', str.length + ' bytes');
const s3 = new C.Sim(4242, s2.serialize()); ok(crc(s3.world.vox) === crc(s1.world.vox), 'second round trip is stable');

// --- scripted full playthrough via the game API ---
function playthrough(seed) {
  const S = new C.Sim(seed), Wd = S.world, log = [], deny = {};
  S.on((t, d) => { if (t === 'deny') deny[d.why] = (deny[d.why] || 0) + 1; });
  S.on((t, d) => { if (t === 'quest') log.push(d.q.id); });
  const hero = (x, y, z) => { S.s.hero.x = x; S.s.hero.y = y; S.s.hero.z = z; };
  const gather = (id, n, pred) => { let got = 0; for (let i = 0; i < Wd.vox.length && got < n; i++) { if (Wd.vox[i] !== id) continue; const [x, y, z] = Wd.coord(i); if (pred && !pred(x, y, z)) continue; hero(x + 0.5, y, z + 0.5); const r = S.mine(x, y, z); if (r && r.broke) got++; } return got; };
  const put = (x, y, z, id) => { hero(x + 2.5, y, z + 0.5); return S.place(x, y, z, id); };
  const craftN = (id, n) => { for (let i = 0; i < n; i++) if (!S.craft(id)) return false; return true; };
  gather(B.LOG, 4); // q wood
  craftN('planks', 4); S.craft('woodpick'); // q tool
  gather(B.STONE, 5, (x, y) => y > 14); // q stone
  // bridge
  gather(B.STONE, 20, (x, y) => y > 14);
  let bridged = 0; for (const bz of [100, 101]) for (let x = 70; x < 84 && bridged < 8; x++) if (Wd.get(x, SEA, bz) === B.WATER && C.inRiver(x, bz)) { if (put(x, SEA, bz, B.STONE)) bridged++; }
  // light the cave
  craftN('planks', 0); S.craft('lantern');
  const cv = C.LANDMARKS.cave; let fy = cv.y; while (Wd.get(cv.x, fy - 1, cv.z) === B.AIR) fy--;
  hero(cv.x + 1.5, fy, cv.z + 0.5); S.place(cv.x, fy, cv.z, B.LANTERN);
  // cottage from the blueprint
  gather(B.LOG, 30); craftN('planks', 14);
  gather(B.SAND, 6); craftN('glass', 2);
  gather(B.CLAY, 12); craftN('roof', 10); S.craft('door');
  const bpb = C.BLUEPRINTS[0].blocks, ox = 60, oz = 100; let oy = 0;
  for (let z = -1; z < 6; z++) for (let x = 0; x < 5; x++) { let y = C.H - 1; while (y > 0 && !C.BLOCKS[Wd.get(ox + x, y, oz + z)].solid) y--; oy = Math.max(oy, y + 1); }
  for (const [x, y, z, id] of bpb) { const g0 = Wd.get(ox + x, oy + y, oz + z); if (g0 && g0 !== id && g0 !== B.WATER && g0 !== B.TALLGRASS) { hero(ox + x + 0.5, oy + y, oz + z + 0.5); S.mine(ox + x, oy + y, oz + z); } }
  let left = bpb.slice(), guard = 0;
  while (left.length && guard++ < 20) left = left.filter(([x, y, z, id]) => !(Wd.get(ox + x, oy + y, oz + z) === id || put(ox + x, oy + y, oz + z, id)));
  // garden + friend
  gather(B.FLOWER, 6);
  let planted = 0; for (let i = 0; i < Wd.vox.length && planted < 4; i++) { if (Wd.vox[i] !== B.GRASS) continue; const [x, y, z] = Wd.coord(i); if (Wd.get(x, y + 1, z) !== B.AIR) continue; if (put(x, y + 1, z, B.FLOWER)) planted++; }
  S.feed();
  // seek 3 Sun Seeds (peak, waterfall, cave)
  for (const sd of Wd.seeds.slice(0, 3)) { hero(sd.x, sd.y - 0.6, sd.z); S.collectSeed(sd.id); }
  // deep: stone pick + sunrock
  craftN('planks', 2); S.craft('stonepick'); gather(B.SUNROCK, 4);
  // lighthouse on the beach
  gather(B.SAND, 2); S.craft('glass'); S.craft('beacon');
  gather(B.STONE, 10, (x, y) => y > 14);
  const lx = 64, lz = 116; let ly = C.H - 1; while (!C.BLOCKS[Wd.get(lx, ly, lz)].solid) ly--;
  for (let k = 1; k <= 8; k++) put(lx, ly + k, lz, B.STONE);
  put(lx, ly + 9, lz, B.BEACON);
  if (process.env.DBG) console.log(deny, S.s.inv, S.s.c);
  if (process.env.DBG2) console.log('left', JSON.stringify(left), S.s.inv);
  return { S, log, left: left.length };
}
for (const seed of [1234, 77, 2026]) {
  const { S, log, left } = playthrough(seed);
  ok(S.s.quest === C.QUESTS.length, `seed ${seed}: scripted run completes all ${C.QUESTS.length} quests`, log.join(','));
  ok(left === 0, `seed ${seed}: cottage blueprint fully built`); ok(!!S.s.c.cottage && !!S.s.c.lighthouse, `seed ${seed}: cottage came alive and lighthouse lit`);
  ok(S.totalSeeds() === C.QUESTS.length + 3, `seed ${seed}: Sun Seed tally`, S.totalSeeds());
}
// every hidden Sun Seed is collectable
const ws = new C.Sim(1234); let got = 0; for (const sd of ws.world.seeds) { ws.s.hero.x = sd.x; ws.s.hero.y = sd.y - 0.6; ws.s.hero.z = sd.z; if (ws.collectSeed(sd.id)) got++; }
ok(got === 12, 'all 12 Sun Seeds can be collected');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
