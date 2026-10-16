/* Hollow Isle core: world generation, blocks, mining/placing rules, crafting, quests, light/courage, Hollows, save format.
   Pure logic, no DOM. Loaded as a classic script in the page/worker (globalThis.Hollow) and via require() in Node tests. */
(function (G) {
'use strict';
const W = 128, D = 128, H = 48, SEA = 12;

// ---------- blocks ----------
// hard = bonks with bare paws, tool = pick level needed (0 none, 1 wooden, 2 stone), light = radius of the safe light it casts
const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, LOG: 5, LEAVES: 6, WATER: 7, PLANKS: 8, BRICK: 9, GLASS: 10,
  LANTERN: 11, DOOR: 12, FENCE: 13, FLOWER: 14, CLAY: 15, GLOWSTONE: 16, ROOF: 17, ASH: 18, LAMP: 19, TALLGRASS: 20, BEDROCK: 21,
  BIRCH: 22, BRASS: 23, TORCH: 24, CAMPFIRE: 25, WARDLIGHT: 26, BELL: 27, WARDSTONE: 28, WARDLIT: 29, RESIN: 30, WAX: 31, WAXCAP: 32,
};
B.SUNROCK = B.GLOWSTONE; B.BEACON = B.LAMP; B.SNOW = B.ASH;
const BLOCKS = [];
function def(id, name, color, o) { BLOCKS[id] = Object.assign({ id, name, color, hard: 2, tool: 0, solid: true, cube: true, opaque: true, drop: id, glow: 0, light: 0 }, o || {}); }
def(0, 'Air', 0, { solid: false, cube: false, opaque: false, drop: 0 });
def(1, 'Dead Grass', 0x5f6440, { hard: 2, side: 0x4a3c30 });
def(2, 'Soil', 0x4a3c30, { hard: 2 });
def(3, 'Cracked Stone', 0x66646f, { hard: 3, tool: 1 });
def(4, 'Ashen Sand', 0x8c8270, { hard: 2 });
def(5, 'Rotten Log', 0x4f3e2e, { hard: 3, top: 0x6f7a4a });
def(6, 'Dead Leaves', 0x5a5a38, { hard: 1 });
def(7, 'Black Water', 0x1d3644, { solid: false, cube: false, opaque: false, drop: 0, hard: 99 });
def(8, 'Old Planks', 0x76603f, { hard: 2 });
def(9, 'Brick', 0x7a463c, { hard: 3, tool: 1 });
def(10, 'Glass', 0x9fc6c8, { hard: 1, opaque: false });
def(11, 'Lantern', 0xffb347, { hard: 1, glow: 1, opaque: false, light: 7 });
def(12, 'Door', 0x5e4128, { hard: 2, solid: false, opaque: false });
def(13, 'Fence', 0x5f4b35, { hard: 2, opaque: false });
def(14, 'Moonflower', 0xcfe0ff, { hard: 1, solid: false, cube: false, opaque: false, deco: true, ht: 0.7, base: 0x3d5a40, glow: 0.35, shape: 1 });
def(15, 'Clay', 0x74605c, { hard: 2 });
def(16, 'Glowstone', 0x7fe8c8, { hard: 4, tool: 2, glow: 1, light: 3 });
def(17, 'Roof', 0x4c3442, { hard: 2 });
def(18, 'Ash', 0x9d9a94, { hard: 1, side: 0x66646f });
def(19, 'Lighthouse Lamp', 0xffe7a0, { hard: 2, glow: 1, light: 12 });
def(20, 'Dead Tuft', 0x7a7048, { hard: 1, solid: false, cube: false, opaque: false, drop: 0, deco: true, ht: 0.42, base: 0x3b3a2c, shape: 0 });
def(21, 'Bedrock', 0x2e2c38, { hard: 999, tool: 9 });
def(22, 'Bone Birch', 0xd8d2c0, { hard: 3, top: 0x8a7e66 });
def(23, 'Tarnished Brass', 0x8f7d45, { hard: 3, tool: 1 });
def(24, 'Torch', 0xffa040, { hard: 1, solid: false, cube: false, opaque: false, deco: true, ht: 0.85, base: 0x4f3e2e, glow: 1, light: 5.5, shape: 3 });
def(25, 'Campfire', 0xff7a2a, { hard: 2, solid: false, cube: false, opaque: false, deco: true, ht: 0.75, base: 0x3a2a1e, glow: 1, light: 8, shape: 4 });
def(26, 'Wardlight', 0xa8f0ff, { hard: 2, glow: 1, light: 10 });
def(27, 'Bell', 0xb59a52, { hard: 2, opaque: false, glow: 0.15 });
def(28, 'Wardstone', 0x3c4250, { hard: 999, tool: 9, top: 0x58607a });
def(29, 'Lit Wardstone', 0x9fe8ff, { hard: 999, tool: 9, glow: 1, light: 11 });
def(30, 'Resin', 0xd08a2a, { item: true, solid: false, cube: false, opaque: false });
def(31, 'Wax', 0xe8dcb0, { item: true, solid: false, cube: false, opaque: false });
def(32, 'Waxcap', 0xe8dcb0, { hard: 1, solid: false, cube: false, opaque: false, deco: true, ht: 0.4, base: 0x8a7e66, drop: 31, glow: 0.2, shape: 2 });
const PLACEABLE = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 22, 23, 24, 25, 26, 27];
const LIGHT_IDS = BLOCKS.filter(b => b && b.light).map(b => b.id);
const isSolid = id => BLOCKS[id].solid;
const isReplaceable = id => id === 0 || id === 7 || id === 20;
const SAFE = 0.3; // light level at which Hollows can't stand and courage refills

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
      if (y === h) id = h <= SEA + 1 && md > 0.6 ? B.SAND : (h > 36 ? B.ASH : (h > 28 ? B.STONE : B.GRASS));
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
  // pulsing glowstone veins in the chamber walls
  for (let i = 0; i < 40; i++) {
    const a = R() * Math.PI * 2, b = (R() - 0.3) * 1.2, r = 5.2;
    const x = Math.round(L.cave.x + Math.cos(a) * r), z = Math.round(L.cave.z + Math.sin(a) * r), y = Math.round(L.cave.y + 1 + b * 3);
    if (get(x, y, z) === B.STONE) set(x, y, z, B.GLOWSTONE);
  }
  // a few veins of tarnished brass in the tunnel walls
  for (let i = 0; i < 10; i++) { const t = 0.3 + R() * 0.6; const x = Math.round(ent.x + (L.cave.x - ent.x) * t + (R() < 0.5 ? -2 : 2)), z = Math.round(ent.z + (L.cave.z - ent.z) * t), y = Math.round(entY + (L.cave.y - entY) * t); if (get(x, y, z) === B.STONE) set(x, y, z, B.BRASS); }
  // dead trees: rotten trunks with a few stubby branches, bone-white birches, and the odd one clinging to its leaves
  const trees = [];
  for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
    const h = hmap[z * W + x];
    if (get(x, h, z) !== B.GRASS || get(x, h + 1, z) !== B.AIR) continue;
    if (Math.hypot(x - L.village.x, z - L.village.z) < 9) continue;
    const fd = Math.hypot(x - L.forest.x, z - L.forest.z) / L.forest.r;
    const p = fd < 1 ? 0.05 : 0.006;
    const r = hash2(x, z, seed + 11);
    if (r < p && !trees.some(t => Math.abs(t[0] - x) < 4 && Math.abs(t[1] - z) < 4)) trees.push([x, z, h]);
    else if (r > 0.86) set(x, h + 1, z, r > 0.985 ? B.FLOWER : fd < 1.2 && r > 0.95 ? B.WAXCAP : B.TALLGRASS);
  }
  for (const [x, z, h] of trees) {
    const k = hash2(x, z, seed + 2), kind = k < 0.28 ? 'birch' : k < 0.36 ? 'leafy' : 'dead';
    const th = 4 + Math.floor(hash2(x, z, seed + 4) * 3), log = kind === 'birch' ? B.BIRCH : B.LOG;
    for (let y = 1; y <= th; y++) set(x, h + y, z, log);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < 2; i++) { const d = dirs[Math.floor(hash2(x + i, z, seed + 6) * 4)], y = h + th - 1 - i; set(x + d[0], y, z + d[1], log); if (hash2(x, z + i, seed + 8) < 0.5) set(x + d[0] * 2, y + 1, z + d[1] * 2, log); }
    if (kind === 'leafy') for (let dy = -1; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dz * dz + dy * dy * 1.5 <= 4 && hash2(x + dx * 7, z + dz * 5 + dy, seed + 12) < 0.55 && get(x + dx, h + th + dy, z + dz) === B.AIR) set(x + dx, h + th + dy, z + dz, B.LEAVES);
    }
  }
  const top = (x, z) => { for (let y = H - 1; y > 0; y--) { const g = get(x, y, z); if (g !== 0 && !(BLOCKS[g].deco)) return y; } return 0; };
  const dry = (sx, sz) => { let x = Math.round(sx), z = Math.round(sz), y = top(x, z), tries = 0; while ((get(x, y, z) === B.WATER || y <= SEA) && tries++ < 40) { x += x < 64 ? 1 : -1; z += z < 64 ? 1 : -1; y = top(x, z); } return [x, y, z]; };
  // the six Wardstones: dark rune pillars on little stone plinths
  const wards = [];
  const wardSpots = [['Village Ward', L.village.x + 9, L.village.z - 7], ['Forest Ward', L.forest.x + 2, L.forest.z + 3], ['Lake Ward', L.lake.x - 2, L.lake.z - 15],
    ['Cliff Ward', 24, 64], ['Dune Ward', 108, 70]];
  for (const [n, sx, sz] of wardSpots) {
    const [x, y, z] = dry(sx, sz);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { set(x + dx, y, z + dz, B.STONE); for (let k = 1; k < 4; k++) if (!(dx === 0 && dz === 0)) set(x + dx, y + k, z + dz, B.AIR); }
    set(x, y + 1, z, B.STONE); set(x, y + 2, z, B.WARDSTONE); set(x, y + 3, z, B.AIR);
    wards.push({ id: wards.length, name: n, x, y: y + 2, z });
  }
  { const x = L.cave.x + 2, z = L.cave.z, y = L.cave.y - 2; set(x, y + 1, z, B.STONE); set(x, y + 2, z, B.WARDSTONE); wards.push({ id: wards.length, name: 'Deep Ward', x, y: y + 2, z }); }
  // village ruins: a fallen bell frame of tarnished brass
  { const bx = L.village.x - 6, bz = L.village.z + 4; for (let i = 0; i < 6; i++) { const x = bx + (i % 3), z = bz + Math.floor(i / 3) * 2; const y = top(x, z); if (y > SEA) set(x, y + 1, z, B.BRASS); } }
  // the dead lighthouse on the south beach: a hollow 3x3 tower, ringed by a spiral stair, lamp missing
  const lh = (() => { let best = null; for (let z = 100; z <= 114; z++) for (let x = 54; x <= 76; x++) { const y = top(x, z); if (y > SEA && y <= SEA + 3 && !inRiver(x, z) && Math.abs(x - riverX(z)) > 7) { const d = Math.abs(x - 62) + Math.abs(z - 110); if (!best || d < best.d) best = { x, z, y, d }; } } return best || { x: 62, z: 108, y: SEA + 1 }; })();
  const LH = 10;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) for (let k = 1; k <= LH + 2; k++) set(lh.x + dx, lh.y + k, lh.z + dz, B.AIR);
  for (let k = 1; k <= LH; k++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (dx === 0 && dz === 0 && k < LH) continue; set(lh.x + dx, lh.y + k, lh.z + dz, k % 3 === 0 ? B.BRICK : B.STONE); }
  const ring = []; for (let i = -2; i <= 2; i++) ring.push([i, -2]); for (let i = -1; i <= 2; i++) ring.push([2, i]); for (let i = 1; i >= -2; i--) ring.push([i, 2]); for (let i = 1; i >= -1; i--) ring.push([-2, i]);
  for (let s2 = 0; s2 < LH; s2++) { const [dx, dz] = ring[s2 % ring.length]; for (let k = 1; k <= s2 + 1; k++) set(lh.x + dx, lh.y + k, lh.z + dz, k === s2 + 1 ? B.PLANKS : B.STONE); }
  const lighthouse = { x: lh.x, y: lh.y + LH + 1, z: lh.z, base: lh.y };
  // hidden Ember Seeds (12) at memorable spots
  const mtop = (() => { let best = [L.mountain.x, L.mountain.z, 0]; for (let z = L.mountain.z - 8; z <= L.mountain.z + 8; z++) for (let x = L.mountain.x - 8; x <= L.mountain.x + 8; x++) { const y = top(x, z); if (y > best[2]) best = [x, z, y]; } return best; })();
  const seeds = [
    { id: 'peak', name: 'Mountain peak', x: mtop[0] + 0.5, y: mtop[2] + 1.6, z: mtop[1] + 0.5 },
    { id: 'falls', name: 'Behind the waterfall', x: wf.x - 1.5, y: SEA + 1.6, z: wf.z + 0.5 },
    { id: 'cave', name: 'Deep in the cave', x: L.cave.x - 1.5, y: L.cave.y - 0.4, z: L.cave.z + 0.5 },
  ];
  const spots = [['forest', L.forest.x, L.forest.z], ['lake', L.lake.x, L.lake.z - 13], ['beach', 64, 118], ['meadow', 100, 80], ['cliff', 22, 56], ['dunes', 112, 58], ['grove', 84, 18], ['shore', 18, 82], ['village', L.village.x + 7, L.village.z + 5]];
  for (const [n, sx, sz] of spots) {
    const [x, y, z] = dry(sx, sz);
    seeds.push({ id: n, name: n[0].toUpperCase() + n.slice(1), x: x + 0.5, y: y + 1.6, z: z + 0.5 });
  }
  const spawn = { x: L.village.x + 0.5, z: L.village.z + 0.5 }; spawn.y = top(L.village.x, L.village.z) + 1;
  const guide = { x: L.village.x + 3.5, z: L.village.z - 1.5 }; guide.y = top(L.village.x + 3, L.village.z - 2) + 1;
  return { seed, vox, hmap, seeds, spawn, guide, wards, lighthouse, trees: trees.length };
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
  { id: 'planks', name: 'Planks', need: { 5: 1 }, out: { 8: 4 }, alt: { 22: 1 } },
  { id: 'woodpick', name: 'Wooden Pick', need: { 8: 3 }, tool: 1 },
  { id: 'torch', name: 'Torches', need: { 8: 1, 30: 1 }, out: { 24: 4 } },
  { id: 'campfire', name: 'Campfire', need: { 5: 2, 3: 1 }, out: { 25: 1 } },
  { id: 'fuel', name: 'Lantern Fuel', need: { 30: 1, 31: 1 }, fuel: 60 },
  { id: 'stonepick', name: 'Stone Pick', need: { 3: 3, 8: 2 }, tool: 2 },
  { id: 'lantern', name: 'Lantern', need: { 3: 1, 30: 1 }, out: { 11: 2 } },
  { id: 'glass', name: 'Glass', need: { 4: 2 }, out: { 10: 1 } },
  { id: 'wardlight', name: 'Wardlight', need: { 16: 1, 10: 1 }, out: { 26: 2 } },
  { id: 'door', name: 'Door', need: { 8: 4 }, out: { 12: 1 } },
  { id: 'brick', name: 'Bricks', need: { 15: 2 }, out: { 9: 2 } },
  { id: 'roof', name: 'Roof Tiles', need: { 8: 1, 15: 1 }, out: { 17: 3 } },
  { id: 'fence', name: 'Fence', need: { 8: 2 }, out: { 13: 3 } },
  { id: 'flower', name: 'Moonflower', need: { 6: 2 }, out: { 14: 1 } },
  { id: 'bell', name: 'Hand Bell', need: { 23: 2, 8: 1 }, bell: true },
  { id: 'lamp', name: 'Lighthouse Lamp', need: { 16: 2, 10: 1, 23: 1 }, out: { 19: 1 } },
];
const START_UNLOCKED = ['planks', 'woodpick'];

// ---------- quests ----------
const COTTAGE = { roof: 4, walls: 12 };
const LIGHT_PLACE = [11, 24, 25, 26];
const QUESTS = [
  { id: 'wood', title: 'Something to Burn', text: 'The dark is cold. Bonk a rotten tree trunk until it pops. Gather 4 logs.', goal: s => Math.min(4, (s.c.mined[5] || 0) + (s.c.mined[22] || 0)), need: 4, unlock: ['torch'] },
  { id: 'tool', title: 'A Steady Pick', text: 'Open the craft wheel. Make planks, then a Wooden Pick.', goal: s => s.tool >= 1 ? 1 : 0, need: 1, unlock: ['campfire'] },
  { id: 'torch', title: 'Light is Life', text: 'Logs ooze resin. Craft torches and place 3 lights in the dark.', goal: s => Math.min(3, s.c.lights), need: 3, unlock: ['lantern'] },
  { id: 'camp', title: 'A Place to Wake', text: 'Craft a campfire and set it down. If the Hollows catch you, you wake beside it.', goal: s => s.camp ? 1 : 0, need: 1, unlock: ['stonepick', 'glass', 'fuel'] },
  { id: 'ward', title: 'The First Wardstone', text: 'A dead Wardstone stands north-east of the village. Tap it while carrying a torch.', goal: s => Math.min(1, s.wards.length), need: 1, unlock: [] },
  { id: 'fuel', title: 'Oil for the Lantern', text: 'Pale Waxcaps grow in the dead forest. Craft Lantern Fuel from resin and wax.', goal: s => (s.c.crafted.fuel || 0) ? 1 : 0, need: 1, unlock: [] },
  { id: 'deep', title: 'Glow in the Deep', text: 'With a Stone Pick, mine 2 pulsing Glowstone deep in the mountain cave.', goal: s => Math.min(2, s.c.mined[16] || 0), need: 2, unlock: ['wardlight', 'door', 'brick', 'roof'] },
  { id: 'shelter', title: 'Before the Blood Moon', text: 'A Blood Moon is coming. Build a shelter: walls, a door, a window and a roof (4 roof tiles).', goal: s => s.c.cottage ? 1 : 0, need: 1, unlock: ['fence'] },
  { id: 'survive', title: 'Blood Moon', text: 'Stay in the light until the red moon sets.', goal: s => s.c.survived ? 1 : 0, need: 1, unlock: ['flower'] },
  { id: 'cure', title: 'Poor Puffbun', text: 'A Hushling is a Puffbun lost to the dark. Freeze it with light, then give it a Moonflower.', goal: s => Math.min(1, s.cured.length), need: 1, unlock: ['bell'] },
  { id: 'wards', title: 'Ring of Wards', text: 'Relight all 6 Wardstones. One sleeps at the bottom of the cave.', goal: s => s.wards.length, need: 6, unlock: ['lamp'] },
  { id: 'embers', title: 'Twelve Embers', text: 'Find all 12 Ember Seeds. Try high, wet and deep places.', goal: s => s.found.length, need: 12, unlock: [] },
  { id: 'lighthouse', title: 'Lift the Curse', text: 'Climb the dead lighthouse on the south beach and set a Lighthouse Lamp on top.', goal: s => s.c.lighthouse ? 1 : 0, need: 1, unlock: [] },
];

// ---------- light, courage, creatures (pure rules shared by the game and the tests) ----------
// light level 0..1 at a point from a list of [x, y, z, radius] sources
function lightLevel(list, x, y, z) {
  let best = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i], dx = s[0] - x, dz = s[2] - z; if (Math.abs(dx) > s[3] || Math.abs(dz) > s[3]) continue;
    const d = Math.sqrt(dx * dx + dz * dz + (s[1] - y) * (s[1] - y) * 0.5);
    if (d < s[3]) { const t = 1 - d / s[3], v = Math.min(1, t * 1.6); if (v > best) best = v; }
  }
  return best;
}
// one step of a Hollow. env: { hx, hz, light(x, z) -> 0..1, looked, dark (0..1, how unlit the hero is), blood }
function stepHollow(h, env, dt) {
  if (h.state === 'gone') return h;
  const L = env.light(h.x, h.z);
  const dx = env.hx - h.x, dz = env.hz - h.z, dist = Math.hypot(dx, dz) || 1e-6;
  if (L > SAFE) { // burned by light: back away and dissolve
    h.state = 'flee'; h.fade = Math.min(1, (h.fade || 0) + dt * (0.6 + L));
    h.x -= dx / dist * 2.4 * dt; h.z -= dz / dist * 2.4 * dt;
    if (h.fade >= 1) h.state = 'gone';
    return h;
  }
  h.fade = Math.max(0, (h.fade || 0) - dt * 0.25);
  if (env.looked && env.dark < 0.75) { h.state = 'frozen'; return h; }
  const sp = (env.blood ? 2.7 : 1.7) * (h.speed || 1), nx = h.x + dx / dist * sp * dt, nz = h.z + dz / dist * sp * dt;
  if (env.light(nx, nz) > SAFE * 0.8) { h.state = 'blocked'; // circle the edge of the light instead of stepping in
    const px = -dz / dist, pz = dx / dist, ox = h.x + px * sp * 0.6 * dt, oz = h.z + pz * sp * 0.6 * dt; if (env.light(ox, oz) <= SAFE * 0.8) { h.x = ox; h.z = oz; } return h; }
  h.x = nx; h.z = nz; h.state = dist < 0.85 ? 'caught' : 'stalk';
  return h;
}
// a Hushling freezes when lit, otherwise creeps after the hero
function stepHush(u, env, dt) {
  if (u.cured) return u;
  const L = env.light(u.x, u.z);
  if (L > SAFE * 0.6 || env.lanternNear) { u.state = 'frozen'; return u; }
  const dx = env.hx - u.x, dz = env.hz - u.z, dist = Math.hypot(dx, dz) || 1e-6;
  if (dist > 14) { u.state = 'idle'; return u; }
  const sp = 1.1; u.x += dx / dist * sp * dt; u.z += dz / dist * sp * dt; u.state = dist < 1.0 ? 'touch' : 'creep';
  return u;
}

// ---------- simulation ----------
class Sim {
  constructor(seed, save) {
    this.world = new World(seed);
    this.listeners = [];
    const sp = this.world.spawn;
    this.s = {
      game: 'hollow', seed: this.world.seed, inv: {}, tool: 0, quest: 0, found: [], unlocked: START_UNLOCKED.slice(),
      hero: { x: sp.x, y: sp.y, z: sp.z, yaw: 0 }, time: 0.15, friends: 0, playTime: 0,
      courage: 100, fuel: 40, lanternUp: false, bell: false, wards: [], cured: [], camp: null, dawn: false,
      bloodIn: 0, bloodT: 0, caught: 0, scares: {},
      c: { mined: {}, crafted: {}, placed: 0, lights: 0, cottage: null, flowers: 0, fed: 0, lighthouse: null, survived: false },
    };
    this.damage = null;
    if (save) this.load(save);
    this.scanLights();
  }
  on(f) { this.listeners.push(f); }
  emit(type, data) { for (const f of this.listeners) f(type, data || {}); }
  count(id) { return this.s.inv[id] || 0; }
  add(id, n) { this.s.inv[id] = (this.s.inv[id] || 0) + n; if (this.s.inv[id] <= 0) delete this.s.inv[id]; }
  reach(x, y, z, r) { const h = this.s.hero; return Math.hypot(x + 0.5 - h.x, y + 0.5 - (h.y + 0.6), z + 0.5 - h.z) <= (r || 4.6); }
  bonksFor(id) { const b = BLOCKS[id]; return Math.max(1, b.hard - (this.s.tool > b.tool ? 1 : 0) - (this.s.tool >= 2 && b.tool < 2 ? 1 : 0)); }
  // ---- light ----
  scanLights() {
    const w = this.world, out = []; this.lights = out;
    for (let i = 0; i < w.vox.length; i++) { const id = w.vox[i]; if (id && BLOCKS[id].light) { const [x, y, z] = w.coord(i); out.push([x + 0.5, y + 0.5, z + 0.5, BLOCKS[id].light, id]); } }
  }
  lanternLight() { const h = this.s.hero; return this.s.lanternUp && this.s.fuel > 0 ? [h.x, h.y + 1, h.z, 6.5, -1] : null; }
  lightAt(x, y, z, withLantern) {
    let v = lightLevel(this.lights, x, y, z);
    const l = withLantern !== false && this.lanternLight(); if (l) v = Math.max(v, lightLevel([l], x, y, z));
    if (this.s.dawn) v = 1;
    return v;
  }
  // darkness 0..1 from the dusk/night cycle (eternal dusk → deep night → dusk), 0 after dawn
  darkness() { if (this.s.dawn) return 0; return 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(this.s.time * Math.PI * 2)) + (this.s.bloodT > 0 ? 0.1 : 0); }
  // courage drains in the dark, refills in light; fuel burns while the lantern is up. Returns 'faint' at 0.
  tick(dt, near, cover) {
    const s = this.s, h = s.hero;
    s.time = (s.time + dt / 360) % 1; s.playTime = (s.playTime || 0) + dt;
    if (s.lanternUp) { s.fuel = Math.max(0, s.fuel - dt * 0.5); if (s.fuel <= 0) { s.lanternUp = false; this.emit('fuelout', {}); } }
    const L = this.lightAt(h.x, h.y + 0.6, h.z);
    const dark = this.darkness();
    if (s.dawn) s.courage = 100;
    else if (L > SAFE) s.courage = Math.min(100, s.courage + dt * (6 + 10 * L));
    // open moonlight only nags; caves, foggy hollows, nearby Hollows and the Blood Moon are what really frighten
    else s.courage = Math.max(0, s.courage - dt * dark * (0.35 + (cover === undefined ? 0.75 : cover) * 1.7 + (near || 0) * 4 + (s.bloodT > 0 ? 0.8 : 0)));
    if (s.bloodIn > 0) { s.bloodIn -= dt; if (s.bloodIn <= 0) { s.bloodIn = 0; s.bloodT = 75; this.emit('bloodmoon', {}); } }
    else if (s.bloodT > 0) { s.bloodT -= dt; if (s.bloodT <= 0) { s.bloodT = 0; s.c.survived = true; this.emit('bloodend', {}); this.checkQuest(); } }
    if (s.courage <= 0 && !s.dawn) return 'faint';
    return null;
  }
  setLantern(up) { if (up && this.s.fuel <= 0) { this.emit('deny', { why: 'Your lantern is out of fuel. Craft some from resin and wax.' }); return false; } this.s.lanternUp = !!up; this.emit('lantern', { up: this.s.lanternUp }); return true; }
  ringBell() { if (!this.s.bell) { this.emit('deny', { why: 'You need a Hand Bell. Craft one from tarnished brass.' }); return false; } this.emit('bell', {}); return true; }
  // a Hollow reached you (or your courage ran out): drop a third of every stack, wake at the campfire
  caught() {
    const s = this.s, lost = {};
    for (const k in s.inv) { const n = Math.floor(s.inv[k] / 3); if (n > 0) { lost[k] = n; this.add(+k, -n); } }
    const at = s.camp || this.world.spawn; s.hero = { x: at.x + (s.camp ? 1.5 : 0), y: at.y + (s.camp ? 0 : 0), z: at.z + 0.5, yaw: 0 };
    s.courage = 70; s.lanternUp = false; s.caught = (s.caught || 0) + 1;
    this.emit('caught', { lost }); return lost;
  }
  // ---- mining ----
  canMine(x, y, z) {
    const id = this.world.get(x, y, z), b = BLOCKS[id];
    if (!id || id === B.WATER) return { ok: false, why: 'empty' };
    if (id === B.WARDSTONE) return { ok: false, why: 'ward' };
    if (id === B.WARDLIT) return { ok: false, why: 'The Wardstone hums softly. Leave it lit.' };
    if (id === B.BEDROCK) return { ok: false, why: 'Too tough to bonk!' };
    if (this.s.tool < b.tool) return { ok: false, why: b.tool === 1 ? 'You need a Wooden Pick for ' + b.name + '.' : 'You need a Stone Pick for ' + b.name + '.' };
    if (!this.reach(x, y, z)) return { ok: false, why: 'far' };
    return { ok: true };
  }
  bonk(x, y, z) {
    const can = this.canMine(x, y, z);
    if (!can.ok) { if (can.why === 'ward') return { hit: false, why: 'ward', ward: this.relight(this.wardAt(x, y, z)) }; this.emit('deny', { x, y, z, why: can.why }); return { hit: false, why: can.why }; }
    const w = this.world, i = w.idx(x, y, z), id = w.get(x, y, z), need = this.bonksFor(id);
    if (!this.damage || this.damage.i !== i) this.damage = { i, hits: 0 };
    this.damage.hits++;
    const stage = this.damage.hits / need;
    if (this.damage.hits < need) { this.emit('bonk', { x, y, z, id, stage }); return { hit: true, stage, broke: false }; }
    this.damage = null;
    w.set(x, y, z, B.AIR);
    const above = w.get(x, y + 1, z);
    if (BLOCKS[above].deco) { w.set(x, y + 1, z, B.AIR); const d = BLOCKS[above].drop; if (above !== B.TALLGRASS && d) this.add(d, 1); if (BLOCKS[above].light) this.dropLight(x, y + 1, z); }
    if (y <= SEA && [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(d => w.get(x + d[0], y + d[1], z + d[2]) === B.WATER)) w.set(x, y, z, B.WATER);
    const drop = BLOCKS[id].drop; if (drop) this.add(drop, 1);
    if (id === B.LOG || id === B.BIRCH) this.add(B.RESIN, 1);
    this.s.c.mined[id] = (this.s.c.mined[id] || 0) + 1;
    if (BLOCKS[id].light) this.dropLight(x, y, z);
    if (id === B.CAMPFIRE && this.s.camp && this.s.camp.x === x && this.s.camp.y === y && this.s.camp.z === z) this.s.camp = this.findCamp();
    this.emit('break', { x, y, z, id, drop });
    this.checkQuest();
    return { hit: true, stage: 1, broke: true };
  }
  dropLight(x, y, z) { this.lights = this.lights.filter(l => !(l[0] === x + 0.5 && l[1] === y + 0.5 && l[2] === z + 0.5)); }
  findCamp() { for (const l of this.lights) if (l[4] === B.CAMPFIRE) return { x: l[0] - 0.5, y: l[1] - 0.5, z: l[2] - 0.5 }; return null; }
  mine(x, y, z) { let r; for (let k = 0; k < 10; k++) { r = this.bonk(x, y, z); if (!r.hit || r.broke) break; } return r; }
  // ---- wardstones ----
  wardAt(x, y, z) { return this.world.wards.find(w => w.x === x && w.y === y && w.z === z) || null; }
  relight(ward) {
    if (!ward) return false;
    if (this.s.wards.includes(ward.id)) return false;
    if (!this.reach(ward.x, ward.y, ward.z, 5)) { this.emit('deny', { why: 'far' }); return false; }
    if (this.count(B.TORCH) <= 0) { this.emit('deny', { why: 'The Wardstone is cold. Bring a torch to relight it.' }); return false; }
    this.add(B.TORCH, -1); this.s.wards.push(ward.id);
    this.world.set(ward.x, ward.y, ward.z, B.WARDLIT); this.lights.push([ward.x + 0.5, ward.y + 0.5, ward.z + 0.5, BLOCKS[B.WARDLIT].light, B.WARDLIT]);
    this.emit('ward', { ward, n: this.s.wards.length }); this.checkQuest(); return true;
  }
  // ---- placing ----
  canPlace(x, y, z, id, heroBox) {
    const w = this.world;
    if (!PLACEABLE.includes(id)) return { ok: false, why: 'Not a block' };
    if (this.count(id) <= 0) return { ok: false, why: 'None left' };
    if (!w.inside(x, y, z) || y >= H - 1 || y < 1) return { ok: false, why: 'Out of bounds' };
    if (!isReplaceable(w.get(x, y, z))) return { ok: false, why: 'Occupied' };
    if (!this.reach(x, y, z, 5.5)) return { ok: false, why: 'far' };
    const below = w.get(x, y - 1, z);
    if (id === B.FLOWER) { if (below !== B.GRASS && below !== B.DIRT) return { ok: false, why: 'Moonflowers grow on grass' }; }
    if ((id === B.TORCH || id === B.CAMPFIRE) && !BLOCKS[below].solid) return { ok: false, why: 'Set it on solid ground' };
    if (BLOCKS[id].solid) {
      const h = heroBox || this.s.hero;
      if (x + 1 > h.x - 0.35 && x < h.x + 0.35 && z + 1 > h.z - 0.35 && z < h.z + 0.35 && y + 1 > h.y && y < h.y + 1.3) return { ok: false, why: 'You are standing there!' };
    }
    const touch = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(d => { const g = w.get(x + d[0], y + d[1], z + d[2]); return g !== 0 && g !== 20; });
    if (!touch) return { ok: false, why: 'Needs something to stick to' };
    if (id === B.LAMP && this.s.wards.length < 6 && this.findLighthouse(x, y, z)) return { ok: false, why: 'The lamp will not catch. Relight all six Wardstones first.' };
    return { ok: true };
  }
  place(x, y, z, id) {
    const can = this.canPlace(x, y, z, id);
    if (!can.ok) { this.emit('deny', { x, y, z, why: can.why }); return false; }
    const w = this.world;
    w.set(x, y, z, id); this.add(id, -1); this.s.c.placed++;
    const c = this.s.c;
    if (BLOCKS[id].light) this.lights.push([x + 0.5, y + 0.5, z + 0.5, BLOCKS[id].light, id]);
    if (LIGHT_PLACE.includes(id)) c.lights++;
    if (id === B.CAMPFIRE) this.s.camp = { x, y, z };
    if (id === B.FLOWER) c.flowers++;
    this.emit('place', { x, y, z, id });
    if (!c.cottage && [B.DOOR, B.GLASS, B.ROOF, B.PLANKS, B.BRICK, B.STONE, B.LOG, B.CLAY, B.BIRCH].includes(id)) { const h = this.findCottage(x, y, z); if (h) { c.cottage = h; if (this.s.bloodIn > 25) this.s.bloodIn = 25; this.emit('cottage', h); } }
    if (!c.lighthouse && id === B.LAMP) { const t = this.findLighthouse(x, y, z); if (t && this.s.wards.length >= 6) { c.lighthouse = t; this.s.dawn = true; this.emit('lighthouse', t); this.emit('dawn', t); } }
    this.checkQuest();
    return true;
  }
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
  // a lamp on top of a solid column at least 8 tall (the dead lighthouse is 10)
  findLighthouse(x, y, z) {
    const w = this.world; let col = 0;
    for (let yy = y - 1; yy > 0; yy--) {
      let any = false; for (let dz = -1; dz <= 1 && !any; dz++) for (let dx = -1; dx <= 1 && !any; dx++) { const g = w.get(x + dx, yy, z + dz); if (BLOCKS[g].solid && !(yy <= w.hmap[(z + dz) * W + x + dx] && !w.placedAt(x + dx, yy, z + dz) && !this.nearLighthouse(x, z))) any = true; }
      if (!any) break; col++;
    }
    return col >= 8 ? { x, y, z, h: col } : null;
  }
  nearLighthouse(x, z) { const l = this.world.lighthouse; return Math.abs(x - l.x) <= 2 && Math.abs(z - l.z) <= 2; }
  // ---- crafting ----
  recipe(id) { return RECIPES.find(r => r.id === id); }
  needFor(r) { if (r.alt && this.count(5) < 1) for (const k in r.alt) if (this.count(+k) >= r.alt[k]) return r.alt; return r.need; }
  canCraft(id) {
    const r = this.recipe(id); if (!r) return { ok: false, why: 'Unknown' };
    if (!this.s.unlocked.includes(id)) return { ok: false, why: 'Locked' };
    if (r.tool && this.s.tool >= r.tool) return { ok: false, why: 'Already have it' };
    if (r.bell && this.s.bell) return { ok: false, why: 'Already have it' };
    if (r.fuel && this.s.fuel >= 100) return { ok: false, why: 'Lantern is full' };
    const need = this.needFor(r);
    for (const k in need) if (this.count(+k) < need[k]) return { ok: false, why: 'Need ' + need[k] + ' ' + BLOCKS[k].name };
    return { ok: true };
  }
  craft(id) {
    const can = this.canCraft(id); if (!can.ok) { this.emit('deny', { why: can.why }); return false; }
    const r = this.recipe(id), need = this.needFor(r);
    for (const k in need) this.add(+k, -need[k]);
    if (r.tool) this.s.tool = r.tool; else if (r.bell) this.s.bell = true; else if (r.fuel) this.s.fuel = Math.min(100, this.s.fuel + r.fuel); else for (const k in r.out) this.add(+k, r.out[k]);
    this.s.c.crafted[id] = (this.s.c.crafted[id] || 0) + 1;
    this.emit('craft', { id }); this.checkQuest(); return true;
  }
  // a Moonflower cures a Hushling back into a Puffbun friend
  cure(i) {
    if (this.s.cured.includes(i)) return false;
    if (this.count(B.FLOWER) <= 0) { this.emit('deny', { why: 'Hushlings calm down with a Moonflower. Find or craft one.' }); return false; }
    this.add(B.FLOWER, -1); this.s.cured.push(i); this.s.c.fed++; this.s.friends++;
    this.emit('cured', { i }); this.checkQuest(); return true;
  }
  feed() { return false; }
  collectSeed(id) {
    if (this.s.found.includes(id)) return false;
    const sd = this.world.seeds.find(s => s.id === id); if (!sd) return false;
    const h = this.s.hero; if (Math.hypot(sd.x - h.x, sd.y - (h.y + 0.6), sd.z - h.z) > 1.6) return false;
    this.s.found.push(id); this.emit('seed', sd); this.checkQuest(); return true;
  }
  quest() { return QUESTS[this.s.quest] || null; }
  progress() { const q = this.quest(); return q ? Math.min(q.need, q.goal(this.s)) : 0; }
  checkQuest() {
    let q;
    while ((q = this.quest()) && q.goal(this.s) >= q.need) {
      this.s.quest++;
      for (const u of q.unlock) if (!this.s.unlocked.includes(u)) this.s.unlocked.push(u);
      const next = this.quest();
      if (next && next.id === 'shelter' && !this.s.c.survived && !this.s.bloodIn && !this.s.bloodT) this.s.bloodIn = 240;
      this.emit('quest', { q, next });
    }
  }
  totalSeeds() { return this.s.found.length; }
  // ---------- save ----------
  serialize() {
    const d = []; for (const [i, id] of this.world.deltas) d.push(i, id);
    return JSON.stringify({ v: 1, game: 'hollow', seed: this.s.seed, d, s: this.s, at: Date.now() });
  }
  load(str) {
    const o = typeof str === 'string' ? JSON.parse(str) : str;
    if (!o || o.v !== 1 || o.game !== 'hollow') throw new Error('bad save');
    if ((o.seed >>> 0) !== this.world.seed) this.world = new World(o.seed);
    const w = this.world;
    for (let k = 0; k < o.d.length; k += 2) { const i = o.d[k], id = o.d[k + 1]; w.vox[i] = id; if (w.base[i] !== id) w.deltas.set(i, id); }
    const def0 = this.s; this.s = Object.assign({}, def0, o.s); this.s.c = Object.assign({}, def0.c, o.s.c);
    this.scanLights();
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
const BLUEPRINTS = [{ id: 'cottage', name: 'Shelter', blocks: bpCottage() }];

const api = { W, D, H, SEA, B, BLOCKS, PLACEABLE, LIGHT_IDS, SAFE, RECIPES, QUESTS, BLUEPRINTS, LANDMARKS: L, generate, World, Sim, rng, inRiver, riverX, isSolid, lightLevel, stepHollow, stepHush };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else G.Hollow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
