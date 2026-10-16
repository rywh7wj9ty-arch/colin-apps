/* Cubby Isle core: world generation, blocks, mining/placing rules, crafting, quests, save format.
   Pure logic, no DOM. Loaded as a classic script in the page/worker (globalThis.Cubby) and via require() in Node tests. */
(function (G) {
'use strict';
const W = 128, D = 128, H = 48, SEA = 12;

// ---------- blocks ----------
// hard = bonks with bare paws, tool = pick level needed (0 none, 1 wooden, 2 stone)
const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, LOG: 5, LEAVES: 6, WATER: 7, PLANKS: 8, BRICK: 9, GLASS: 10,
  LANTERN: 11, DOOR: 12, FENCE: 13, FLOWER: 14, CLAY: 15, SUNROCK: 16, ROOF: 17, SNOW: 18, BEACON: 19, TALLGRASS: 20, BEDROCK: 21,
};
const BLOCKS = [];
function def(id, name, color, o) { BLOCKS[id] = Object.assign({ id, name, color, hard: 2, tool: 0, solid: true, cube: true, opaque: true, drop: id, glow: 0 }, o || {}); }
def(0, 'Air', 0, { solid: false, cube: false, opaque: false, drop: 0 });
def(1, 'Grass', 0x8fd16a, { hard: 2, side: 0xc79a6b });
def(2, 'Soil', 0xc79a6b, { hard: 2 });
def(3, 'Stone', 0xb9b6c8, { hard: 3, tool: 1 });
def(4, 'Sand', 0xf6dfa4, { hard: 2 });
def(5, 'Log', 0xa8754f, { hard: 3, top: 0xe2b98a });
def(6, 'Leaves', 0x5fbf73, { hard: 1 });
def(7, 'Water', 0x5ec8e8, { solid: false, cube: false, opaque: false, drop: 0, hard: 99 });
def(8, 'Planks', 0xe8b77d, { hard: 2 });
def(9, 'Brick', 0xe0846a, { hard: 3, tool: 1 });
def(10, 'Glass', 0xcff3ff, { hard: 1, opaque: false });
def(11, 'Lantern', 0xffd36b, { hard: 1, glow: 1, opaque: false });
def(12, 'Door', 0xc98a52, { hard: 2, solid: false, opaque: false });
def(13, 'Fence', 0xd9a46c, { hard: 2, opaque: false });
def(14, 'Flower', 0xff8fb8, { hard: 1, solid: false, cube: false, opaque: false });
def(15, 'Clay', 0xd6a6a0, { hard: 2 });
def(16, 'Sunrock', 0xffc94a, { hard: 4, tool: 2, glow: 0.5 });
def(17, 'Roof', 0xd8616b, { hard: 2 });
def(18, 'Snow', 0xf7fbff, { hard: 1, side: 0xb9b6c8 });
def(19, 'Beacon', 0xfff1a8, { hard: 2, glow: 1 });
def(20, 'Tuft', 0x9bdc6f, { hard: 1, solid: false, cube: false, opaque: false, drop: 0 });
def(21, 'Bedrock', 0x6d6a80, { hard: 999, tool: 9 });
const PLACEABLE = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19];
const isSolid = id => BLOCKS[id].solid;
const isReplaceable = id => id === 0 || id === 7 || id === 20;

// ---------- seeded noise ----------
function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(x, z, s) { let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, s) { let t = 0, amp = 0.5, f = 1; for (let i = 0; i < 4; i++) { t += amp * vnoise(x * f, z * f, s + i * 17); f *= 2; amp *= 0.5; } return t / 0.9375; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- landmarks (fixed layout so the island always reads the same; details vary by seed) ----------
const L = {
  mountain: { x: 38, z: 40, r: 26 }, lake: { x: 74, z: 66, r: 11 }, forest: { x: 94, z: 34, r: 22 },
  village: { x: 66, z: 92 }, cave: { x: 40, y: SEA + 3, z: 40 }, waterfall: { x: 56, z: 54 },
};
function riverX(z) { return 76 + Math.sin(z * 0.13) * 3; } // river runs from the lake south to the sea
function inRiver(x, z) { return z > L.lake.z + 6 && Math.abs(x - riverX(z)) < 2.2; }

function generate(seed) {
  seed = seed >>> 0;
  const vox = new Uint8Array(W * D * H), hmap = new Uint8Array(W * D);
  const R = rng(seed);
  const idx = (x, y, z) => (y * D + z) * W + x;
  const set = (x, y, z, id) => { if (x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < H) vox[idx(x, y, z)] = id; };
  const get = (x, y, z) => (x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < H) ? vox[idx(x, y, z)] : 0;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const dx = x - 64, dz = z - 64;
    const warp = (fbm(x * 0.03, z * 0.03, seed) - 0.5) * 22;
    const dist = Math.sqrt(dx * dx + dz * dz) + warp;
    const island = 1 - smooth(40, 60, dist);
    let h = SEA - 5 + island * (6 + fbm(x * 0.06, z * 0.06, seed + 5) * 5);
    const md = Math.hypot(x - L.mountain.x, z - L.mountain.z) / L.mountain.r;
    if (md < 1) h += Math.pow(1 - md, 1.5) * 30 * (0.85 + 0.3 * fbm(x * 0.1, z * 0.1, seed + 9));
    const ld = Math.hypot(x - L.lake.x, z - L.lake.z) / L.lake.r;
    if (ld < 1.3) h = Math.min(h, SEA - 3 + smooth(0.7, 1.3, ld) * (h - SEA + 3));
    if (z > L.lake.z + 4 && Math.abs(x - riverX(z)) < 3.4) h = Math.min(h, SEA - 2 + smooth(2.2, 3.4, Math.abs(x - riverX(z))) * 3);
    // waterfall cliff: a sheer wall facing the lake
    const wf = L.waterfall;
    if (x >= wf.x - 5 && x <= wf.x - 1 && Math.abs(z - wf.z) <= 5) h = Math.max(h, 30);
    if (x >= wf.x && x <= wf.x + 2 && Math.abs(z - wf.z) <= 2) h = Math.min(h, SEA - 1);
    h = Math.max(1, Math.min(H - 4, Math.round(h)));
    hmap[z * W + x] = h;
    for (let y = 0; y <= h; y++) {
      let id = y === 0 ? B.BEDROCK : y < h - 3 ? B.STONE : B.DIRT;
      if (y === h) id = h <= SEA + 1 && md > 0.6 ? B.SAND : (h > 36 ? B.SNOW : (h > 28 ? B.STONE : B.GRASS));
      if (y < h && h <= SEA + 1 && y >= h - 2) id = B.SAND;
      if (y === h && h < SEA && ld < 1.1 && hash2(x, z, seed + 3) < 0.5) id = B.CLAY;
      vox[idx(x, y, z)] = id;
    }
    for (let y = h + 1; y <= SEA; y++) vox[idx(x, y, z)] = B.WATER;
  }
  // waterfall: a curtain of water down the cliff face, with a secret alcove behind it
  const wf = L.waterfall;
  for (let y = SEA; y <= 30; y++) for (let z = wf.z - 1; z <= wf.z + 1; z++) set(wf.x, y, z, B.WATER);
  for (let y = SEA + 1; y <= SEA + 3; y++) for (let z = wf.z - 1; z <= wf.z + 1; z++) for (let x = wf.x - 3; x <= wf.x - 1; x++) set(x, y, z, B.AIR);
  for (let z = wf.z - 1; z <= wf.z + 1; z++) for (let x = wf.x - 3; x <= wf.x - 1; x++) set(x, SEA, z, B.STONE);
  // caves: a winding tunnel from the mountain's south foot to a deep chamber
  const ent = { x: L.mountain.x + 2, z: L.mountain.z + 22 };
  const entY = hmap[ent.z * W + ent.x] + 1;
  const carve = (cx, cy, cz, r) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (y < 2) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 * 1.4 + (z - cz) ** 2 <= r * r) { const g = get(x, y, z); if (g !== B.WATER && g !== B.BEDROCK) set(x, y, z, B.AIR); }
    }
  };
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = ent.x + (L.cave.x - ent.x) * t + Math.sin(t * 9 + seed) * 3 * (1 - t);
    const cz = ent.z + (L.cave.z - ent.z) * t;
    const cy = entY + (L.cave.y - entY) * t;
    carve(cx, cy, cz, 2.0 + Math.sin(t * 13) * 0.3);
  }
  carve(L.cave.x, L.cave.y + 1, L.cave.z, 4.6);
  // sunrock veins in the chamber walls
  for (let i = 0; i < 40; i++) {
    const a = R() * Math.PI * 2, b = (R() - 0.3) * 1.2, r = 5.2;
    const x = Math.round(L.cave.x + Math.cos(a) * r), z = Math.round(L.cave.z + Math.sin(a) * r), y = Math.round(L.cave.y + 1 + b * 3);
    if (get(x, y, z) === B.STONE) set(x, y, z, B.SUNROCK);
  }
  // trees and decorations
  const trees = [];
  for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
    const h = hmap[z * W + x];
    if (get(x, h, z) !== B.GRASS || get(x, h + 1, z) !== B.AIR) continue;
    if (Math.hypot(x - L.village.x, z - L.village.z) < 9) continue;
    const fd = Math.hypot(x - L.forest.x, z - L.forest.z) / L.forest.r;
    const p = fd < 1 ? 0.05 : 0.006;
    const r = hash2(x, z, seed + 11);
    if (r < p && !trees.some(t => Math.abs(t[0] - x) < 4 && Math.abs(t[1] - z) < 4)) trees.push([x, z, h]);
    else if (r > 0.86) set(x, h + 1, z, r > 0.95 ? B.FLOWER : B.TALLGRASS);
  }
  for (const [x, z, h] of trees) {
    const th = 4 + Math.floor(hash2(x, z, seed + 2) * 2);
    for (let y = 1; y <= th; y++) set(x, h + y, z, B.LOG);
    for (let dy = -2; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const rr = dx * dx + dz * dz + dy * dy * 1.5;
      if (rr <= (dy > 0 ? 2.5 : 5.2) && get(x + dx, h + th + dy, z + dz) === B.AIR) set(x + dx, h + th + dy, z + dz, B.LEAVES);
    }
  }
  // hidden Sun Seeds (12) at memorable spots
  const top = (x, z) => { for (let y = H - 1; y > 0; y--) { const g = get(x, y, z); if (g !== 0 && g !== 20 && g !== 14) return y; } return 0; };
  const mtop = (() => { let best = [L.mountain.x, L.mountain.z, 0]; for (let z = L.mountain.z - 8; z <= L.mountain.z + 8; z++) for (let x = L.mountain.x - 8; x <= L.mountain.x + 8; x++) { const y = top(x, z); if (y > best[2]) best = [x, z, y]; } return best; })();
  const seeds = [
    { id: 'peak', name: 'Mountain peak', x: mtop[0] + 0.5, y: mtop[2] + 1.6, z: mtop[1] + 0.5 },
    { id: 'falls', name: 'Behind the waterfall', x: wf.x - 1.5, y: SEA + 1.6, z: wf.z + 0.5 },
    { id: 'cave', name: 'Deep in the cave', x: L.cave.x + 0.5, y: L.cave.y - 0.4, z: L.cave.z + 0.5 },
  ];
  const spots = [['forest', L.forest.x, L.forest.z], ['lake', L.lake.x, L.lake.z - 13], ['beach', 64, 118], ['meadow', 100, 80], ['cliff', 22, 56], ['dunes', 112, 58], ['grove', 84, 18], ['shore', 18, 82], ['village', L.village.x + 7, L.village.z + 5]];
  for (const [n, sx, sz] of spots) {
    let x = Math.round(sx), z = Math.round(sz), y = top(x, z), tries = 0;
    while (get(x, y, z) === B.WATER && tries++ < 40) { x += x < 64 ? 1 : -1; z += z < 64 ? 1 : -1; y = top(x, z); }
    seeds.push({ id: n, name: n[0].toUpperCase() + n.slice(1), x: x + 0.5, y: y + 1.6, z: z + 0.5 });
  }
  const spawn = { x: L.village.x + 0.5, z: L.village.z + 0.5 }; spawn.y = top(L.village.x, L.village.z) + 1;
  const guide = { x: L.village.x + 3.5, z: L.village.z - 1.5 }; guide.y = top(L.village.x + 3, L.village.z - 2) + 1;
  return { seed, vox, hmap, seeds, spawn, guide, trees: trees.length };
}

// ---------- world with deltas ----------
class World {
  constructor(seed) { const g = generate(seed); Object.assign(this, g); this.base = g.vox.slice(); this.deltas = new Map(); }
  inside(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < H; }
  idx(x, y, z) { return (y * D + z) * W + x; }
  get(x, y, z) { return this.inside(x, y, z) ? this.vox[this.idx(x, y, z)] : 0; }
  set(x, y, z, id) {
    if (!this.inside(x, y, z)) return false;
    const i = this.idx(x, y, z); this.vox[i] = id;
    if (this.base[i] === id) this.deltas.delete(i); else this.deltas.set(i, id);
    return true;
  }
  placedAt(x, y, z) { const i = this.idx(x, y, z); return this.deltas.has(i) && this.deltas.get(i) !== 0; }
  underground(x, y, z) { return y < this.hmap[z * W + x] - 1; }
  coord(i) { const x = i % W, z = Math.floor(i / W) % D, y = Math.floor(i / (W * D)); return [x, y, z]; }
}

// ---------- crafting ----------
const RECIPES = [
  { id: 'planks', name: 'Planks', need: { 5: 1 }, out: { 8: 4 } },
  { id: 'woodpick', name: 'Wooden Pick', need: { 8: 3 }, tool: 1 },
  { id: 'lantern', name: 'Lantern', need: { 3: 1, 8: 1 }, out: { 11: 2 } },
  { id: 'fence', name: 'Fence', need: { 8: 2 }, out: { 13: 3 } },
  { id: 'stonepick', name: 'Stone Pick', need: { 3: 3, 8: 2 }, tool: 2 },
  { id: 'glass', name: 'Glass', need: { 4: 2 }, out: { 10: 1 } },
  { id: 'door', name: 'Door', need: { 8: 4 }, out: { 12: 1 } },
  { id: 'brick', name: 'Bricks', need: { 15: 2 }, out: { 9: 2 } },
  { id: 'roof', name: 'Roof Tiles', need: { 8: 1, 15: 1 }, out: { 17: 3 } },
  { id: 'flower', name: 'Flower', need: { 6: 2 }, out: { 14: 1 } },
  { id: 'beacon', name: 'Beacon', need: { 16: 2, 10: 1 }, out: { 19: 1 } },
];

// ---------- quests ----------
const COTTAGE = { roof: 4, walls: 12 };
const QUESTS = [
  { id: 'wood', title: 'Wood for a Start', text: 'Bonk a tree trunk until it pops! Gather 4 logs.', goal: s => Math.min(4, s.c.mined[5] || 0), need: 4, unlock: ['planks', 'woodpick'] },
  { id: 'tool', title: 'Handy Tools', text: 'Open the craft wheel. Make planks, then a Wooden Pick.', goal: s => s.tool >= 1 ? 1 : 0, need: 1, unlock: ['lantern', 'fence'] },
  { id: 'stone', title: 'Rocky Road', text: 'With your pick, bonk 5 stone blocks.', goal: s => Math.min(5, s.c.mined[3] || 0), need: 5, unlock: ['stonepick', 'glass'] },
  { id: 'bridge', title: 'Over the River', text: 'Build a bridge: place 5 blocks over the river south of the lake.', goal: s => Math.min(5, s.c.bridge), need: 5, unlock: ['door', 'brick', 'roof'] },
  { id: 'cave', title: 'Light the Dark', text: 'The cave in the mountain is spooky. Place a lantern inside it.', goal: s => s.c.caveLight ? 1 : 0, need: 1, unlock: [] },
  { id: 'cottage', title: 'A Cosy Cottage', text: 'Build a home with walls, a door, a window (glass) and a roof (4 roof tiles). It comes alive when it\'s done!', goal: s => s.c.cottage ? 1 : 0, need: 1, unlock: ['flower'] },
  { id: 'garden', title: 'Garden Party', text: 'Plant 4 flowers on grass.', goal: s => Math.min(4, s.c.flowers), need: 4, unlock: [] },
  { id: 'friend', title: 'A New Friend', text: 'Feed a flower to a Puffbun. It will follow you everywhere!', goal: s => Math.min(1, s.c.fed), need: 1, unlock: [] },
  { id: 'seek', title: 'Seed Seeker', text: 'Find 3 hidden Sun Seeds. Try high, wet and deep places.', goal: s => Math.min(3, s.found.length), need: 3, unlock: [] },
  { id: 'deep', title: 'Sunrock Glow', text: 'With a Stone Pick, bonk 2 golden Sunrock deep in the cave.', goal: s => Math.min(2, s.c.mined[16] || 0), need: 2, unlock: ['beacon'] },
  { id: 'lighthouse', title: 'Light of the Isle', text: 'Build a tower at least 8 blocks tall and put a Beacon on top!', goal: s => s.c.lighthouse ? 1 : 0, need: 1, unlock: [] },
];

// ---------- simulation ----------
class Sim {
  constructor(seed, save) {
    this.world = new World(seed);
    this.listeners = [];
    const sp = this.world.spawn;
    this.s = {
      seed: this.world.seed, inv: {}, tool: 0, quest: 0, questSeeds: 0, found: [], unlocked: [],
      hero: { x: sp.x, y: sp.y, z: sp.z, yaw: 0 }, time: 0.3, friends: 0, playTime: 0,
      c: { mined: {}, crafted: {}, placed: 0, bridge: 0, caveLight: false, cottage: null, flowers: 0, fed: 0, lighthouse: null },
    };
    this.damage = null; // { i, hits }
    if (save) this.load(save);
  }
  on(f) { this.listeners.push(f); }
  emit(type, data) { for (const f of this.listeners) f(type, data || {}); }
  count(id) { return this.s.inv[id] || 0; }
  add(id, n) { this.s.inv[id] = (this.s.inv[id] || 0) + n; if (this.s.inv[id] <= 0) delete this.s.inv[id]; }
  reach(x, y, z, r) { const h = this.s.hero; return Math.hypot(x + 0.5 - h.x, y + 0.5 - (h.y + 0.6), z + 0.5 - h.z) <= (r || 4.6); }
  bonksFor(id) { const b = BLOCKS[id]; return Math.max(1, b.hard - (this.s.tool > b.tool ? 1 : 0) - (this.s.tool >= 2 && b.tool < 2 ? 1 : 0)); }
  canMine(x, y, z) {
    const id = this.world.get(x, y, z), b = BLOCKS[id];
    if (!id || id === B.WATER) return { ok: false, why: 'empty' };
    if (id === B.BEDROCK) return { ok: false, why: 'Too tough to bonk!' };
    if (this.s.tool < b.tool) return { ok: false, why: b.tool === 1 ? 'You need a Wooden Pick for ' + b.name + '.' : 'You need a Stone Pick for ' + b.name + '.' };
    if (!this.reach(x, y, z)) return { ok: false, why: 'far' };
    return { ok: true };
  }
  // one bonk; returns { hit, stage, broke }
  bonk(x, y, z) {
    const can = this.canMine(x, y, z);
    if (!can.ok) { this.emit('deny', { x, y, z, why: can.why }); return { hit: false, why: can.why }; }
    const w = this.world, i = w.idx(x, y, z), id = w.get(x, y, z), need = this.bonksFor(id);
    if (!this.damage || this.damage.i !== i) this.damage = { i, hits: 0 };
    this.damage.hits++;
    const stage = this.damage.hits / need;
    if (this.damage.hits < need) { this.emit('bonk', { x, y, z, id, stage }); return { hit: true, stage, broke: false }; }
    this.damage = null;
    w.set(x, y, z, B.AIR);
    // a decoration resting on top falls off with it
    const above = w.get(x, y + 1, z);
    if (above === B.FLOWER || above === B.TALLGRASS) { w.set(x, y + 1, z, B.AIR); if (above === B.FLOWER) this.add(B.FLOWER, 1); }
    // water flows into the hole if it borders water
    if (y <= SEA && [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(d => w.get(x + d[0], y + d[1], z + d[2]) === B.WATER)) w.set(x, y, z, B.WATER);
    const drop = BLOCKS[id].drop; if (drop) this.add(drop, 1);
    this.s.c.mined[id] = (this.s.c.mined[id] || 0) + 1;
    if (id === B.FLOWER && this.s.c.flowers > 0 && w.base[i] !== B.FLOWER) this.s.c.flowers--;
    this.emit('break', { x, y, z, id, drop });
    this.checkQuest();
    return { hit: true, stage: 1, broke: true };
  }
  mine(x, y, z) { let r; for (let k = 0; k < 10; k++) { r = this.bonk(x, y, z); if (!r.hit || r.broke) break; } return r; }
  canPlace(x, y, z, id, heroBox) {
    const w = this.world;
    if (!PLACEABLE.includes(id)) return { ok: false, why: 'Not a block' };
    if (this.count(id) <= 0) return { ok: false, why: 'None left' };
    if (!w.inside(x, y, z) || y >= H - 1 || y < 1) return { ok: false, why: 'Out of bounds' };
    if (!isReplaceable(w.get(x, y, z))) return { ok: false, why: 'Occupied' };
    if (!this.reach(x, y, z, 5.5)) return { ok: false, why: 'far' };
    if (id === B.FLOWER) { const below = w.get(x, y - 1, z); if (below !== B.GRASS && below !== B.DIRT) return { ok: false, why: 'Flowers grow on grass' }; }
    if (BLOCKS[id].solid) {
      const h = heroBox || this.s.hero;
      if (x + 1 > h.x - 0.35 && x < h.x + 0.35 && z + 1 > h.z - 0.35 && z < h.z + 0.35 && y + 1 > h.y && y < h.y + 1.3) return { ok: false, why: 'You are standing there!' };
    }
    // must touch something (no floating in thin air), water counts
    const touch = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(d => { const g = w.get(x + d[0], y + d[1], z + d[2]); return g !== 0 && g !== 20; });
    if (!touch) return { ok: false, why: 'Needs something to stick to' };
    return { ok: true };
  }
  place(x, y, z, id) {
    const can = this.canPlace(x, y, z, id);
    if (!can.ok) { this.emit('deny', { x, y, z, why: can.why }); return false; }
    const w = this.world, prev = w.get(x, y, z);
    w.set(x, y, z, id); this.add(id, -1); this.s.c.placed++;
    const c = this.s.c;
    if (BLOCKS[id].solid && prev === B.WATER && inRiver(x, z) || BLOCKS[id].solid && inRiver(x, z) && y >= SEA && y <= SEA + 2 && this.columnWater(x, z)) c.bridge++;
    if (id === B.LANTERN && w.underground(x, y, z) && Math.hypot(x - L.cave.x, z - L.cave.z) < 26) c.caveLight = true;
    if (id === B.FLOWER) c.flowers++;
    this.emit('place', { x, y, z, id });
    if (!c.cottage && [B.DOOR, B.GLASS, B.ROOF, B.PLANKS, B.BRICK, B.STONE, B.LOG, B.CLAY].includes(id)) { const h = this.findCottage(x, y, z); if (h) { c.cottage = h; this.emit('cottage', h); } }
    if (!c.lighthouse && id === B.BEACON) { const t = this.findLighthouse(x, y, z); if (t) { c.lighthouse = t; this.emit('lighthouse', t); } }
    this.checkQuest();
    return true;
  }
  columnWater(x, z) { for (let y = SEA; y > SEA - 4; y--) if (this.world.get(x, y, z) === B.WATER) return true; return false; }
  findCottage(px, py, pz) {
    const w = this.world;
    for (let dz = -6; dz <= 6; dz++) for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = px + dx, y = py + dy, z = pz + dz;
      if (w.get(x, y, z) !== B.DOOR || !w.placedAt(x, y, z)) continue;
      let glass = 0, roof = 0, walls = 0;
      for (let ez = -4; ez <= 4; ez++) for (let ey = -1; ey <= 6; ey++) for (let ex = -4; ex <= 4; ex++) {
        const X = x + ex, Y = y + ey, Z = z + ez; if (!w.placedAt(X, Y, Z)) continue;
        const g = w.get(X, Y, Z);
        if (g === B.GLASS) glass++; else if (g === B.ROOF && ey >= 1) roof++; else if (BLOCKS[g].solid && g !== B.ROOF) walls++;
      }
      if (glass >= 1 && roof >= COTTAGE.roof && walls >= COTTAGE.walls) return { x, y, z };
    }
    return null;
  }
  findLighthouse(x, y, z) {
    const w = this.world; let col = 0;
    for (let yy = y - 1; yy > 0; yy--) {
      let any = false; for (let dz = -1; dz <= 1 && !any; dz++) for (let dx = -1; dx <= 1 && !any; dx++) if (w.placedAt(x + dx, yy, z + dz) && BLOCKS[w.get(x + dx, yy, z + dz)].solid) any = true;
      if (!any) break; col++;
    }
    return col >= 8 ? { x, y, z, h: col } : null;
  }
  recipe(id) { return RECIPES.find(r => r.id === id); }
  canCraft(id) {
    const r = this.recipe(id); if (!r) return { ok: false, why: 'Unknown' };
    if (!this.s.unlocked.includes(id)) return { ok: false, why: 'Locked' };
    if (r.tool && this.s.tool >= r.tool) return { ok: false, why: 'Already have it' };
    for (const k in r.need) if (this.count(+k) < r.need[k]) return { ok: false, why: 'Need ' + r.need[k] + ' ' + BLOCKS[k].name };
    return { ok: true };
  }
  craft(id) {
    const can = this.canCraft(id); if (!can.ok) { this.emit('deny', { why: can.why }); return false; }
    const r = this.recipe(id);
    for (const k in r.need) this.add(+k, -r.need[k]);
    if (r.tool) this.s.tool = r.tool; else for (const k in r.out) this.add(+k, r.out[k]);
    this.s.c.crafted[id] = (this.s.c.crafted[id] || 0) + 1;
    this.emit('craft', { id }); this.checkQuest(); return true;
  }
  feed() { if (this.count(B.FLOWER) <= 0) { this.emit('deny', { why: 'Puffbuns love flowers. Find or craft one!' }); return false; } this.add(B.FLOWER, -1); this.s.c.fed++; this.s.friends++; this.emit('fed', {}); this.checkQuest(); return true; }
  collectSeed(id) {
    if (this.s.found.includes(id)) return false;
    const sd = this.world.seeds.find(s => s.id === id); if (!sd) return false;
    const h = this.s.hero; if (Math.hypot(sd.x - h.x, sd.y - (h.y + 0.6), sd.z - h.z) > 1.6) return false;
    this.s.found.push(id); this.emit('seed', sd); this.checkQuest(); return true;
  }
  quest() { return QUESTS[this.s.quest] || null; }
  progress() { const q = this.quest(); return q ? q.goal(this.s) : 0; }
  checkQuest() {
    let q;
    while ((q = this.quest()) && q.goal(this.s) >= q.need) {
      this.s.quest++; this.s.questSeeds++;
      for (const u of q.unlock) if (!this.s.unlocked.includes(u)) this.s.unlocked.push(u);
      this.emit('quest', { q, next: this.quest() });
    }
  }
  totalSeeds() { return this.s.questSeeds + this.s.found.length; }
  // ---------- save ----------
  serialize() {
    const d = []; for (const [i, id] of this.world.deltas) d.push(i, id);
    return JSON.stringify({ v: 1, seed: this.s.seed, d, s: this.s, at: Date.now() });
  }
  load(str) {
    const o = typeof str === 'string' ? JSON.parse(str) : str;
    if (!o || o.v !== 1) throw new Error('bad save');
    if ((o.seed >>> 0) !== this.world.seed) this.world = new World(o.seed);
    const w = this.world;
    for (let k = 0; k < o.d.length; k += 2) { const i = o.d[k], id = o.d[k + 1]; w.vox[i] = id; if (w.base[i] !== id) w.deltas.set(i, id); }
    const def0 = this.s; this.s = Object.assign({}, def0, o.s); this.s.c = Object.assign({}, def0.c, o.s.c);
  }
}

// ---------- blueprints (optional ghost guides) ----------
function bpCottage() {
  const out = [];
  for (let y = 0; y < 4; y++) for (let z = 0; z < 5; z++) for (let x = 0; x < 5; x++) {
    const edge = x === 0 || x === 4 || z === 0 || z === 4; if (!edge) continue;
    if (y < 3) {
      if (x === 2 && z === 0 && y < 2) { if (y === 0) out.push([x, y, z, B.DOOR]); continue; }
      if ((x === 0 || x === 4) && z === 2 && y === 1) { out.push([x, y, z, B.GLASS]); continue; }
      out.push([x, y, z, (x === 0 || x === 4) && (z === 0 || z === 4) ? B.LOG : B.PLANKS]);
    }
  }
  for (let z = 0; z < 5; z++) { for (let x = 0; x < 5; x++) out.push([x, 3, z, B.ROOF]); out.push([2, 4, z, B.ROOF]); }
  return out;
}
function bpLighthouse() {
  const out = [];
  for (let y = 0; y < 9; y++) for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) { if (x === 1 && z === 1 && y > 0) continue; out.push([x, y, z, y % 3 === 2 ? B.BRICK : B.STONE]); }
  out.push([1, 9, 1, B.BEACON]);
  return out;
}
const BLUEPRINTS = [{ id: 'cottage', name: 'Cosy Cottage', blocks: bpCottage() }, { id: 'lighthouse', name: 'Lighthouse', blocks: bpLighthouse() }];

const api = { W, D, H, SEA, B, BLOCKS, PLACEABLE, RECIPES, QUESTS, BLUEPRINTS, LANDMARKS: L, generate, World, Sim, rng, inRiver, riverX, isSolid };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else G.Cubby = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
