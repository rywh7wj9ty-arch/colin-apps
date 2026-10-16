// Node unit tests: node tools/test-core.cjs
const C = require('../core.js'), M = require('../mesher.js');
const { B, SEA, BLOCKS } = C; let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); };
const crc = a => { let h = 2166136261; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); } return h >>> 0; };

// --- world determinism ---
const a = C.generate(1234), b = C.generate(1234), c = C.generate(999);
ok(crc(a.vox) === crc(b.vox), 'same seed gives identical terrain'); ok(crc(a.vox) !== crc(c.vox), 'different seeds differ');
ok(JSON.stringify(a.seeds) === JSON.stringify(b.seeds) && a.seeds.length === 12, '12 hidden Ember Seeds, deterministic');
ok(JSON.stringify(a.wards) === JSON.stringify(b.wards) && a.wards.length === 6, '6 Wardstones, deterministic');
const w = new C.World(1234);
const count = id => w.vox.reduce((n, v) => n + (v === id), 0);
ok(count(B.LOG) > 30 && count(B.BIRCH) > 5 && count(B.WATER) > 1000 && count(B.GLOWSTONE) > 2 && count(B.BRASS) >= 3 && count(B.WAXCAP) > 3, 'island has dead trees, birches, water, glowstone, brass, waxcaps', `log ${count(B.LOG)} birch ${count(B.BIRCH)} wax ${count(B.WAXCAP)} brass ${count(B.BRASS)}`);
ok(w.wards.every(d => w.get(d.x, d.y, d.z) === B.WARDSTONE), 'every Wardstone is in the world and unlit');
ok(w.wards.filter(d => w.underground(d.x, d.y, d.z)).length === 1, 'one Wardstone sleeps underground in the cave');
const L = C.LANDMARKS; ok(w.get(L.cave.x, L.cave.y, L.cave.z) === B.AIR && w.underground(L.cave.x, L.cave.y, L.cave.z), 'cave chamber is hollow and underground');
for (const s of w.seeds) { const id = w.get(Math.floor(s.x), Math.floor(s.y - 0.6), Math.floor(s.z)); if (BLOCKS[id].solid) ok(false, 'seed ' + s.id + ' buried'); }
ok(true, 'no Ember Seed is buried in a solid block');
M.setInfo(BLOCKS); const r = M.meshChunk(w.vox, 2, 2); ok(r.solid.i.length > 0, 'mesher produces geometry', (r.solid.i.length / 3) + ' tris');
const lhc = w.lighthouse; let deco = 0; for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) deco += M.meshChunk(w.vox, cx, cz).deco.i.length; ok(deco > 0, 'decorations (tufts, waxcaps, moonflowers) mesh');
ok(BLOCKS[w.get(lhc.x, lhc.y - 1, lhc.z)].solid && w.get(lhc.x, lhc.y, lhc.z) === B.AIR, 'dead lighthouse tower stands with an empty lamp spot');

// --- light + courage rules ---
const sim = new C.Sim(1234);
const H = sim.s.hero, at = (x, y, z) => { H.x = x + 0.5; H.y = y; H.z = z + 0.5; };
sim.lights = []; at(10, 20, 10); sim.s.courage = 100;
for (let i = 0; i < 100; i++) sim.tick(0.1);
ok(sim.s.courage < 95, 'darkness drains courage', sim.s.courage.toFixed(1));
sim.lights.push([10.5, 20.5, 10.5, 7, B.LANTERN]); const c0 = sim.s.courage; for (let i = 0; i < 20; i++) sim.tick(0.1);
ok(sim.s.courage > c0 + 5, 'light refills courage');
ok(sim.lightAt(10.5, 20.5, 10.5) > 0.9 && sim.lightAt(10.5, 20.5, 17.6) === 0, 'light falls off with distance');
sim.lights = []; sim.s.fuel = 10; sim.setLantern(true);
ok(sim.lightAt(H.x, H.y + 1, H.z) > 0.9 && sim.lightAt(H.x + 3, H.y + 1, H.z) > C.SAFE, 'raised lantern lights a safe circle');
for (let i = 0; i < 300; i++) sim.tick(0.1);
ok(sim.s.fuel === 0 && !sim.s.lanternUp, 'lantern burns fuel and goes out');
ok(!sim.setLantern(true), 'empty lantern will not raise');
sim.s.courage = 0.01; ok(sim.tick(0.5) === 'faint', 'courage at 0 makes Cubby faint');

// --- Hollow behaviour ---
const lightFn = list => (x, z) => C.lightLevel(list, x, 20, z);
let h = { x: 0, z: 0 }; const env = { hx: 10, hz: 0, light: lightFn([]), looked: false, dark: 0.2 };
C.stepHollow(h, env, 1); ok(h.x > 1 && h.state === 'stalk', 'Hollow stalks when unseen');
h = { x: 0, z: 0 }; C.stepHollow(h, { ...env, looked: true }, 1); ok(h.x === 0 && h.state === 'frozen', 'Hollow freezes when looked at');
h = { x: 0, z: 0 }; C.stepHollow(h, { ...env, looked: true, dark: 1 }, 1); ok(h.x > 0, 'Hollow still moves when you are in total darkness');
const lamp = [[10.5, 20, 0.5, 7, B.LANTERN]]; h = { x: 0, z: 0.5 };
for (let i = 0; i < 200; i++) { C.stepHollow(h, { ...env, light: lightFn(lamp) }, 0.05); if (C.lightLevel(lamp, h.x, 20, h.z) > C.SAFE) break; }
ok(C.lightLevel(lamp, h.x, 20, h.z) <= C.SAFE && h.state !== 'caught', 'Hollow never steps into the light around the hero', `${h.x.toFixed(2)} ${h.state}`);
h = { x: 9, z: 0.5 }; for (let i = 0; i < 40; i++) C.stepHollow(h, { ...env, light: lightFn(lamp) }, 0.05);
ok(h.state === 'gone' || h.x < 9, 'a Hollow caught in light retreats and dissolves', h.state);
h = { x: 9.5, z: 0 }; C.stepHollow(h, env, 0.2); ok(h.state === 'caught', 'a Hollow that reaches Cubby catches him');

// --- Hushlings ---
let u = { x: 0, z: 0 }; C.stepHush(u, { hx: 5, hz: 0, light: lightFn([]) }, 1); ok(u.x > 0, 'Hushling creeps in the dark');
u = { x: 0, z: 0 }; C.stepHush(u, { hx: 5, hz: 0, light: lightFn([[0, 20, 0, 6]]) }, 1); ok(u.x === 0 && u.state === 'frozen', 'Hushling freezes when lit');
ok(!sim.cure(0), 'cure needs a Moonflower'); sim.add(B.FLOWER, 1); ok(sim.cure(0) && sim.s.cured.includes(0) && sim.count(B.FLOWER) === 0, 'a Moonflower cures a Hushling');

// --- caught ---
const s2 = new C.Sim(1234); s2.add(B.LOG, 9); s2.s.camp = { x: 60, y: 15, z: 60 }; const lost = s2.caught();
ok(s2.count(B.LOG) === 6 && lost[B.LOG] === 3 && Math.abs(s2.s.hero.x - 61.5) < 1e-9, 'caught: drop a third, wake at the campfire');

// --- full scripted run: every quest, then the dawn ending ---
const g = new C.Sim(4242), W0 = g.world, hero = g.s.hero; const events = [];
g.on((t, d) => { events.push(t); if (t === 'deny' && process.env.DBG) console.log('deny', d.why); });
const go = (x, y, z) => { hero.x = x + 0.5; hero.y = y + 1; hero.z = z + 0.5; };
const findAll = (id, n, pred) => { const out = []; for (let i = 0; i < W0.vox.length && out.length < n; i++) if (W0.vox[i] === id) { const p = W0.coord(i); if (!pred || pred(p)) out.push(p); } return out; };
const mineN = (id, n) => { let k = 0; for (const p of findAll(id, 400)) { if (k >= n) break; go(p[0], p[1] - 1, p[2]); if (g.mine(...p).broke) k++; } return k; };
const ground = () => { for (let z = 60; z < 100; z++) for (let x = 60; x < 100; x++) { const y = W0.hmap[z * 128 + x]; if (W0.get(x, y, z) === B.GRASS && W0.get(x, y + 1, z) === 0 && W0.get(x, y + 2, z) === 0 && !C.inRiver(x, z)) { const free = []; for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (W0.hmap[(z + dz) * 128 + x + dx] === y && W0.get(x + dx, y + 1, z + dz) === 0) free.push([x + dx, y + 1, z + dz]); if (free.length > 30) return { x, y, z, free }; } } };
mineN(B.LOG, 8); ok(g.s.quest === 1 && g.count(B.RESIN) >= 4, 'Q1 logs (and resin)');
g.craft('planks'); g.craft('planks'); g.craft('woodpick'); ok(g.s.quest === 2, 'Q2 wooden pick');
g.craft('torch'); g.craft('torch'); const sp = ground(); go(sp.x, sp.y, sp.z);
let placed = 0; for (const f of sp.free) { if (placed >= 3) break; if (Math.hypot(f[0] - sp.x, f[2] - sp.z) > 1.5 && g.place(f[0], f[1], f[2], B.TORCH)) placed++; }
ok(g.s.quest === 3 && g.lights.length > 3, 'Q3 three lights placed');
mineN(B.STONE, 2); mineN(B.LOG, 2); g.craft('campfire');
go(sp.x, sp.y, sp.z); for (const f of sp.free) { if (Math.hypot(f[0] - sp.x, f[2] - sp.z) > 1.5 && g.place(f[0], f[1], f[2], B.CAMPFIRE)) break; }
ok(g.s.quest === 4 && !!g.s.camp, 'Q4 campfire sets the wake point');
const w0 = W0.wards[0]; go(w0.x + 1, w0.y - 1, w0.z); const rr = g.bonk(w0.x, w0.y, w0.z);
ok(rr.ward && g.s.quest === 5 && W0.get(w0.x, w0.y, w0.z) === B.WARDLIT && g.lightAt(w0.x + 0.5, w0.y, w0.z + 2) > C.SAFE, 'Q5 tapping a Wardstone with a torch relights it');
mineN(B.WAXCAP, 1); ok(g.count(B.WAX) >= 1, 'waxcaps drop wax'); g.s.fuel = 20; g.craft('fuel'); ok(g.s.quest === 6 && g.s.fuel === 80, 'Q6 lantern fuel crafted');
mineN(B.STONE, 6); g.craft('stonepick'); ok(g.s.tool === 2, 'stone pick crafted');
mineN(B.GLOWSTONE, 3); ok(g.s.quest === 7, 'Q7 glowstone mined deep in the cave');
ok(g.s.bloodIn > 0, 'the Blood Moon is now on its way', g.s.bloodIn + 's');
// build the shelter from the blueprint with crafted parts
g.add(B.SAND, 4); g.add(B.CLAY, 6); mineN(B.LOG, 10); for (let i = 0; i < 8; i++) g.craft('planks');
g.craft('glass'); g.craft('glass'); g.craft('door'); for (let i = 0; i < 4; i++) g.craft('roof'); g.add(B.ROOF, 4);
const bp = C.BLUEPRINTS[0].blocks, ox = sp.x + 6, oz = sp.z - 2, oy = sp.y + 1;
for (let dz = -1; dz <= 5; dz++) for (let dx = -1; dx <= 5; dx++) { for (let y = oy; y < oy + 7; y++) W0.set(ox + dx, y, oz + dz, 0); W0.set(ox + dx, oy - 1, oz + dz, B.STONE); }
for (const [x, y, z, id] of bp) { go(ox + x, oy + y - 1, oz + (z <= 2 ? z - 3 : z + 3)); if (!g.count(id)) g.add(id, 1); g.place(ox + x, oy + y, oz + z, id); }
ok(g.s.quest === 8 && !!g.s.c.cottage && g.s.bloodIn <= 25, 'Q8 shelter built before the Blood Moon');
go(sp.x, sp.y, sp.z); let saw = false; for (let i = 0; i < 1200 && !g.s.c.survived; i++) { g.tick(0.1); if (g.s.bloodT > 0) saw = true; }
ok(saw && g.s.quest === 9 && events.includes('bloodmoon') && events.includes('bloodend'), 'Q9 survived the Blood Moon in the light');
mineN(B.LEAVES, 2); if (g.count(B.LEAVES) < 2) g.add(B.LEAVES, 2); g.craft('flower'); g.cure(3); ok(g.s.quest === 10, 'Q10 Hushling cured');
mineN(B.BRASS, 3); mineN(B.LOG, 3); g.craft('planks'); g.craft('planks'); g.craft('bell'); ok(g.s.bell && g.ringBell(), 'hand bell crafted from brass and rings');
g.craft('torch'); g.craft('torch');
for (const wd of W0.wards.slice(1)) { go(wd.x + 1, wd.y - 1, wd.z); g.bonk(wd.x, wd.y, wd.z); }
ok(g.s.quest === 11 && g.s.wards.length === 6, 'Q11 all six Wardstones relit');
for (const sd of W0.seeds) { hero.x = sd.x; hero.y = sd.y - 0.6; hero.z = sd.z; g.collectSeed(sd.id); }
ok(g.s.quest === 12 && g.s.found.length === 12, 'Q12 all twelve Ember Seeds');
mineN(B.GLOWSTONE, 2); g.add(B.SAND, 2); g.craft('glass'); if (!g.count(B.BRASS)) mineN(B.BRASS, 1); ok(g.craft('lamp'), 'Lighthouse Lamp crafted');
const lh = W0.lighthouse; hero.x = lh.x + 1.5; hero.y = lh.y; hero.z = lh.z + 0.5;
ok(g.place(lh.x, lh.y, lh.z, B.LAMP), 'lamp set on the dead lighthouse');
ok(g.s.quest === 13 && !g.quest() && g.s.dawn && events.includes('dawn'), 'Q13 lighthouse relit: dawn ending reached');
ok(g.darkness() === 0 && g.lightAt(5, 20, 5) === 1, 'after dawn the island is light everywhere');
// lamp is refused before the wards
const g2 = new C.Sim(4242); g2.add(B.LAMP, 1); g2.s.hero.x = lh.x + 1.5; g2.s.hero.y = lh.y; g2.s.hero.z = lh.z + 0.5; ok(!g2.place(lh.x, lh.y, lh.z, B.LAMP), 'lamp will not catch before all wards are lit');

// --- save / load ---
const str = g.serialize(); const g3 = new C.Sim(1, str);
ok(g3.s.quest === g.s.quest && g3.world.deltas.size === W0.deltas.size && g3.s.dawn && g3.world.get(w0.x, w0.y, w0.z) === B.WARDLIT && g3.lights.length === g.lights.length, 'save and load round-trips quests, edits, wards and lights');
let bad = false; try { new C.Sim(1, JSON.stringify({ v: 1, seed: 7, d: [], s: {} })); } catch (e) { bad = true; } ok(bad, 'a Cubby Isle save is not loaded as a Hollow Isle save');
// crafting rules
const g4 = new C.Sim(9); ok(!g4.craft('torch'), 'locked recipes refuse'); g4.add(B.LOG, 1); ok(g4.craft('planks') && g4.count(B.PLANKS) === 4, 'planks from a log');
const g5 = new C.Sim(9); g5.add(B.BIRCH, 1); ok(g5.craft('planks') && g5.count(B.PLANKS) === 4, 'planks from bone birch too');

console.log(`\nCore tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
