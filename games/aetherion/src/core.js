/* Aetherion core simulation: world, physics, player, systems. No rendering. Node-testable. */
(function (root) {
'use strict';
// ---------- math ----------
const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const vadd = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const vsub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const vmul = (a, s) => V(a.x * s, a.y * s, a.z * s);
const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const vcross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const vlen = a => Math.sqrt(vdot(a, a));
const vnorm = a => { const l = vlen(a) || 1; return V(a.x / l, a.y / l, a.z / l); };
const vcopy = a => V(a.x, a.y, a.z);
const Q = (x = 0, y = 0, z = 0, w = 1) => ({ x, y, z, w });
const qmul = (a, b) => Q(
  a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z);
const qconj = q => Q(-q.x, -q.y, -q.z, q.w);
const qnorm = q => { const l = Math.hypot(q.x, q.y, q.z, q.w) || 1; return Q(q.x / l, q.y / l, q.z / l, q.w / l); };
const qaxis = (ax, ang) => { const s = Math.sin(ang / 2); const n = vnorm(ax); return Q(n.x * s, n.y * s, n.z * s, Math.cos(ang / 2)); };
function qrot(q, v) {
  const tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
  return V(v.x + q.w * tx + (q.y * tz - q.z * ty), v.y + q.w * ty + (q.z * tx - q.x * tz), v.z + q.w * tz + (q.x * ty - q.y * tx));
}
function qslerp(a, b, t) {
  let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w; let bb = b;
  if (d < 0) { d = -d; bb = Q(-b.x, -b.y, -b.z, -b.w); }
  if (d > 0.9995) return qnorm(Q(a.x + (bb.x - a.x) * t, a.y + (bb.y - a.y) * t, a.z + (bb.z - a.z) * t, a.w + (bb.w - a.w) * t));
  const th = Math.acos(d), s = Math.sin(th), w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
  return Q(a.x * w1 + bb.x * w2, a.y * w1 + bb.y * w2, a.z * w1 + bb.z * w2, a.w * w1 + bb.w * w2);
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise2(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
const fbm = (x, y, s) => noise2(x, y, s) * 0.6 + noise2(x * 2.1, y * 2.1, s + 7) * 0.28 + noise2(x * 4.3, y * 4.3, s + 13) * 0.12;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// ---------- constants ----------
const GRAV = 22;
const PART_DEFS = {
  plank:  { shape: 'box', half: V(0.5, 0.12, 2.5), mass: 2, unlock: 0, name: 'Plank' },
  log:    { shape: 'box', half: V(0.35, 0.35, 1.8), mass: 2.2, unlock: 0, name: 'Log', floaty: true },
  stone:  { shape: 'box', half: V(0.6, 0.6, 0.6), mass: 4, unlock: 0, name: 'Stone Block' },
  crate:  { shape: 'box', half: V(0.6, 0.6, 0.6), mass: 1.5, unlock: 99, name: 'Crate', floaty: true },
  fan:    { shape: 'box', half: V(0.45, 0.45, 0.3), mass: 1, unlock: 1, name: 'Gust Fan', device: true },
  wheel:  { shape: 'sphere', r: 0.55, mass: 1, unlock: 2, name: 'Wheel', device: true },
  balloon:{ shape: 'sphere', r: 0.9, mass: 0.2, unlock: 3, name: 'Sky Balloon' },
  stick:  { shape: 'box', half: V(0.25, 0.4, 0.25), mass: 0.6, unlock: 4, name: 'Helm Stick' },
  rocket: { shape: 'box', half: V(0.22, 0.22, 0.7), mass: 0.8, unlock: 5, name: 'Spark Rocket', device: true },
  spring: { shape: 'box', half: V(0.5, 0.2, 0.5), mass: 0.8, unlock: 6, name: 'Bound Spring' },
  ball:   { shape: 'sphere', r: 0.8, mass: 2, unlock: 99, name: 'Rune Orb' },
  urn:    { shape: 'box', half: V(0.55, 0.7, 0.55), mass: 9, unlock: 99, name: 'Core Urn' },
};
const BUILD_PARTS = ['plank', 'log', 'stone', 'fan', 'wheel', 'balloon', 'stick', 'rocket', 'spring'];
const FAN_THRUST = 70, ROCKET_THRUST = 150, BALLOON_LIFT = 38, ROCKET_FUEL = 2.2;
const FORGE_RANGE = 14, FORGE_MAX_MASS = 24, MAX_SPAWNED = 14;
const BIOMES = {
  verdant: { name: 'Verdant Reach' }, peaks: { name: 'Prism Peaks' }, ruins: { name: 'Tempest Ruins' },
  hollows: { name: 'Lumen Hollows' }, plateau: { name: 'Galewind Plateau' }, sunken: { name: 'The Sunken Isle' },
};
function buildWorld() {
  const W = { islands: [], boxes: [], waters: [], updrafts: [], winds: [], cores: [], towers: [], shrines: [], journals: [], nodes: [], enemies: [], crumbles: [], spawns: [], caves: [], rings: [] };
  let iid = 0;
  const isl = (o) => { const I = Object.assign({ id: iid++, hill: 0, thick: 30, seed: iid * 17 + 3, lake: null, flat: 0 }, o); I.y0 = I.y; W.islands.push(I); return I; };
  const box = (o) => { const B = Object.assign({ yaw: 0, climb: true, kind: 'ruin' }, o); W.boxes.push(B); return B; };
  const V0 = isl({ name: 'Verdant Reach', biome: 'verdant', x: 0, z: 0, y: 0, r: 55, hill: 4, thick: 38, lake: { x: 18, z: 12, r: 10, depth: 4 } });
  W.waters.push({ x: 18, z: 12, r: 10, y: -0.6, biome: 'verdant' });
  isl({ name: 'Mossback Isle', biome: 'verdant', x: -48, z: 58, y: 7, r: 17, hill: 2, thick: 18 });
  isl({ name: 'Stepping Isle', biome: 'verdant', x: 0, z: -76, y: 2, r: 9, hill: 0.5, thick: 12 });
  isl({ name: 'Gust Isle', biome: 'verdant', x: 92, z: 6, y: 3, r: 9, hill: 0.5, thick: 12 });
  isl({ name: 'Galewind Plateau', biome: 'plateau', x: -165, z: 0, y: 18, r: 50, hill: 2.5, thick: 34 });
  isl({ name: 'Kite Spur', biome: 'plateau', x: -170, z: 75, y: 26, r: 14, hill: 1, thick: 16 });
  isl({ name: 'Prism Peaks', biome: 'peaks', x: 0, z: -175, y: 38, r: 46, hill: 16, thick: 40, peak: true });
  isl({ name: 'Tempest Ruins', biome: 'ruins', x: 172, z: 10, y: 26, r: 46, hill: 2, thick: 34 });
  isl({ name: 'Lumen Hollows', biome: 'hollows', x: 0, z: 0, y: -95, r: 240, hill: 7, thick: 40, depths: true });
  W.waters.push({ x: -70, z: 90, r: 18, y: -95.5, biome: 'hollows' });
  W.sunken = isl({ name: 'The Sunken Isle', biome: 'sunken', x: 95, z: 125, y: -82, r: 30, hill: 3, thick: 26, risenY: 55 });
  const shrineDefs = [
    { id: 's1', name: 'Shrine of Settled Weight', biome: 'verdant', x: 62, z: -46, y: 10, kind: 'plate', hint: 'Set something heavy upon the glowing plate.' },
    { id: 's2', name: 'Shrine of the Spanned Gap', biome: 'verdant', x: -58, z: -26, y: 4, kind: 'bridge', hint: 'The far altar lies beyond reach. Make a way across.' },
    { id: 's3', name: 'Shrine of Stacked Steps', biome: 'peaks', x: 55, z: -150, y: 34, kind: 'stack', hint: 'The smooth wall cannot be climbed. Build steps.' },
    { id: 's4', name: 'Shrine of the Rising Draft', biome: 'plateau', x: -118, z: 48, y: 20, kind: 'lift', hint: 'The ledge is high. Fans push where they face.' },
    { id: 's5', name: 'Shrine of the Rolling Orb', biome: 'ruins', x: 140, z: -55, y: 24, kind: 'roll', hint: 'Strike the orb into the ring.' },
    { id: 's6', name: 'Shrine of the Buoyant Bell', biome: 'peaks', x: -55, z: -150, y: 36, kind: 'bell', hint: 'The bell hangs high. Something light might rise to it.' },
    { id: 's7', name: 'Shrine of the Spark Ascent', biome: 'ruins', x: 150, z: 72, y: 28, kind: 'rocket', hint: 'Light the way upward into the halo.' },
    { id: 's8', name: 'Shrine of the Long Road', biome: 'hollows', x: -70, z: -60, y: -90, kind: 'road', hint: 'The urn is too heavy to lift. Give it wheels and a helm.' },
  ];
  for (const S of shrineDefs) {
    S.island = isl({ name: S.name, biome: S.biome, x: S.x, z: S.z, y: S.y, r: 14, hill: 0, thick: 14, shrine: S.id, flat: 1 });
    S.done = false; S.zone = { x: S.x, z: S.z, r: 15, y0: S.y - 3, y1: S.y + 30 };
    S.altar = V(S.x, S.y, S.z - 9);
    W.shrines.push(S);
    const o = S;
    if (S.kind === 'plate') { S.plate = { x: o.x + 5, z: o.z, y: o.y, r: 1.4 }; W.spawns.push({ type: 'stone', pos: V(o.x - 5, o.y + 0.62, o.z), shrine: S.id }); }
    if (S.kind === 'bridge') {
      S.goal = isl({ name: 'Far Altar', biome: 'verdant', x: o.x, z: o.z + 25, y: o.y, r: 4, hill: 0, thick: 10, flat: 1, shrine: S.id });
      S.target = V(o.x, o.y, o.z + 25);
      for (let i = 0; i < 3; i++) W.spawns.push({ type: 'plank', pos: V(o.x - 4 + i * 4, o.y + 0.13, o.z), shrine: S.id });
    }
    if (S.kind === 'stack') {
      box({ x: o.x, y: o.y + 2.1, z: o.z + 9, hx: 7, hy: 2.1, hz: 3, climb: false, kind: 'smooth' });
      S.target = V(o.x, o.y + 4.2, o.z + 9);
      for (let i = 0; i < 3; i++) W.spawns.push({ type: 'crate', pos: V(o.x - 3 + i * 3, o.y + 0.61, o.z - 2), shrine: S.id });
    }
    if (S.kind === 'lift') {
      box({ x: o.x, y: o.y + 6, z: o.z + 10, hx: 6, hy: 6, hz: 2.5, climb: false, kind: 'smooth' });
      S.target = V(o.x, o.y + 12, o.z + 10);
      W.spawns.push({ type: 'plank', pos: V(o.x, o.y + 0.13, o.z), shrine: S.id });
      W.spawns.push({ type: 'fan', pos: V(o.x - 3, o.y + 0.46, o.z - 3), shrine: S.id });
      W.spawns.push({ type: 'fan', pos: V(o.x + 3, o.y + 0.46, o.z - 3), shrine: S.id });
    }
    if (S.kind === 'roll') {
      S.ring = { x: o.x, z: o.z + 9, y: o.y, r: 1.6 };
      W.spawns.push({ type: 'ball', pos: V(o.x, o.y + 0.81, o.z), shrine: S.id });
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; if (i === 4) continue; box({ x: o.x + Math.sin(a) * 2.1, y: o.y + 0.25, z: o.z + 9 + Math.cos(a) * 2.1, hx: 0.85, hy: 0.25, hz: 0.2, yaw: a, kind: 'curb' }); }
    }
    if (S.kind === 'bell') {
      S.bell = V(o.x, o.y + 10, o.z + 3); S.bellR = 1.6;
      box({ x: o.x - 3, y: o.y + 6, z: o.z + 3, hx: 0.4, hy: 6, hz: 0.4, climb: false, kind: 'smooth' });
      box({ x: o.x + 3, y: o.y + 6, z: o.z + 3, hx: 0.4, hy: 6, hz: 0.4, climb: false, kind: 'smooth' });
      box({ x: o.x, y: o.y + 12.2, z: o.z + 3, hx: 3.6, hy: 0.3, hz: 0.6, climb: false, kind: 'smooth' });
      W.spawns.push({ type: 'crate', pos: V(o.x - 4, o.y + 0.61, o.z - 2), shrine: S.id });
      W.spawns.push({ type: 'balloon', pos: V(o.x + 3, o.y + 0.91, o.z - 3), shrine: S.id, anchor: true });
      W.spawns.push({ type: 'balloon', pos: V(o.x + 5, o.y + 0.91, o.z - 3), shrine: S.id, anchor: true });
    }
    if (S.kind === 'rocket') {
      S.halo = V(o.x, o.y + 18, o.z + 2); S.haloR = 2.6;
      W.spawns.push({ type: 'plank', pos: V(o.x - 3, o.y + 0.13, o.z - 3), shrine: S.id });
      W.spawns.push({ type: 'rocket', pos: V(o.x + 3, o.y + 0.23, o.z - 3), shrine: S.id });
    }
    if (S.kind === 'road') {
      S.island.r = 12;
      S.road = isl({ name: 'Long Road', biome: 'hollows', x: o.x, z: o.z + 30, y: o.y, r: 9, hill: 0, thick: 10, flat: 1, shrine: S.id });
      box({ x: o.x, y: o.y - 0.5, z: o.z + 15, hx: 3, hy: 0.5, hz: 9, kind: 'road' });
      S.plate = { x: o.x, z: o.z + 32, y: o.y, r: 2.2 };
      W.spawns.push({ type: 'urn', pos: V(o.x, o.y + 0.71, o.z - 2), shrine: S.id });
      W.spawns.push({ type: 'plank', pos: V(o.x - 4, o.y + 0.13, o.z + 3), shrine: S.id });
      for (let i = 0; i < 4; i++) W.spawns.push({ type: 'wheel', pos: V(o.x + 3 + (i % 2) * 1.5, o.y + 0.56, o.z + 2 + (i >> 1) * 1.5), shrine: S.id });
      W.spawns.push({ type: 'stick', pos: V(o.x - 5, o.y + 0.41, o.z - 4), shrine: S.id });
    }
  }
  const towerDefs = [
    { id: 't1', name: 'Galewind Spire', x: -160, z: -18, base: 18, h: 26, reveal: ['plateau', 'verdant'], wow: true },
    { id: 't2', name: 'Prism Spire', x: 22, z: -195, base: 44, h: 18, reveal: ['peaks'] },
    { id: 't3', name: 'Tempest Spire', x: 180, z: -5, base: 26, h: 24, reveal: ['ruins'] },
    { id: 't4', name: 'Deep Beacon', x: 40, z: 70, base: -95, h: 30, reveal: ['hollows', 'sunken'] },
  ];
  for (const T of towerDefs) {
    T.active = false; T.top = V(T.x, T.base + T.h, T.z);
    box({ x: T.x, y: T.base + T.h / 2 - 1, z: T.z, hx: 2.2, hy: T.h / 2 + 1, hz: 2.2, kind: 'tower' });
    box({ x: T.x, y: T.base + T.h - 0.25, z: T.z, hx: 3.0, hy: 0.25, hz: 3.0, kind: 'towertop' });
    W.towers.push(T);
  }
  W.updrafts.push({ x: 0, z: -66, r: 6, y0: -100, y1: 72, s: 16 });
  W.updrafts.push({ x: 82, z: 6, r: 6, y0: -100, y1: 64, s: 16 });
  W.updrafts.push({ x: -122, z: -30, r: 6, y0: -100, y1: 60, s: 16 });
  W.updrafts.push({ x: -60, z: 30, r: 5, y0: -100, y1: 30, s: 14 });
  W.updrafts.push({ x: 120, z: -20, r: 5, y0: -100, y1: 55, s: 15 });
  W.updrafts.push({ x: -200, z: 50, r: 4, y0: 10, y1: 50, s: 14 });
  W.bigDraft = { x: 128, z: 112, r: 9, y0: -100, y1: 110, s: 22, active: false };
  W.winds.push({ x: -165, z: 0, r: 60, dir: V(0, 0, 1), s: 3.5, gust: true });
  W.winds.push({ x: 172, z: 10, r: 55, dir: V(-1, 0, 0.3), s: 4, gust: true });
  for (let i = 0; i < 15; i++) W.crumbles.push({ id: i, x: -60 - i * 4, z: Math.sin(i * 0.7) * 3, y: 1.4 + i * 1.15, h: 0.6, t: -1, fall: 0, crumble: i % 3 === 1 });
  const R = rng(91);
  for (let i = 0; i < 18; i++) {
    const a = R() * Math.PI * 2, d = 10 + R() * 30, h = 2 + R() * 7;
    box({ x: 172 + Math.cos(a) * d, y: 26 + h / 2, z: 10 + Math.sin(a) * d, hx: 0.8 + R() * 3, hy: h / 2, hz: 0.7, yaw: R() * 3, kind: 'ruin' });
  }
  box({ x: -14, y: 2, z: -18, hx: 3, hy: 2, hz: 0.6, yaw: 0.3, kind: 'ruin' });
  box({ x: -20, y: 1.2, z: -12, hx: 0.6, hy: 1.2, hz: 2.4, yaw: 0.3, kind: 'ruin' });
  const cave = (id, x, y, z, biome) => {
    const C = { id, x, y, z, biome, open: false };
    box({ x, y: y + 2.5, z: z - 3.2, hx: 3.4, hy: 2.5, hz: 0.6, kind: 'cave' });
    box({ x: x - 3, y: y + 2.5, z, hx: 0.6, hy: 2.5, hz: 3.4, kind: 'cave' });
    box({ x: x + 3, y: y + 2.5, z, hx: 0.6, hy: 2.5, hz: 3.4, kind: 'cave' });
    box({ x, y: y + 5.4, z, hx: 3.8, hy: 0.6, hz: 3.8, kind: 'cave' });
    C.seal = box({ x, y: y + 2.4, z: z + 3.0, hx: 2.6, hy: 2.4, hz: 0.5, kind: 'seal', climb: false });
    W.caves.push(C); return C;
  };
  cave('c1', -32, 0, 28, 'verdant');
  cave('c2', -12, 0, -168, 'peaks');
  for (let i = 0; i < 6; i++) W.rings.push({ i, x: -170 + i * 4, y: 22 - i * 2.2, z: 90 + i * 9, r: 2.6, hit: false });
  const core = (id, x, y, z, src) => W.cores.push({ id, pos: V(x, y, z), src, taken: false });
  for (const S of W.shrines) core('core-' + S.id, S.altar.x, S.altar.y + 1.2, S.altar.z, 'shrine');
  for (const T of W.towers) core('core-' + T.id, T.x + 2.4, T.base + T.h + 1.2, T.z, 'tower');
  core('core-c1', -32, 0, 28, 'cave'); core('core-c2', -12, 0, -168, 'cave');
  core('core-falls', 50, 0, -3, 'falls');
  core('core-summit', 0, 0, -175, 'summit');
  core('core-ruinstop', 0, 0, 0, 'ruins');
  core('core-rings', -142, 0, 150, 'rings');
  core('core-deep1', -40, 0, 140, 'depths'); core('core-deep2', 150, 0, -120, 'depths'); core('core-deep3', -150, 0, -90, 'depths');
  core('core-mossback', -52, 0, 64, 'mossback');
  core('core-sunken1', 95, 0, 125, 'sunken'); core('core-sunken2', 108, 0, 138, 'sunken');
  const J = [
    ['Weathered Rune', -6, -6, 'verdant', 'The realm was once one land. When the Aether Heart cracked, the earth rose in pieces and forgot how to fall.'],
    ['Mossy Tablet', 30, -20, 'verdant', 'Builders of old carried the Forge Hand. With it, a plank became a bridge, and a fan became a wing.'],
    ['Wind-carved Stone', -150, 20, 'plateau', 'Climb the Galewind Spire and wake its beacon. The old wind will answer, and something long sunken will remember the sky.'],
    ['Shard Inscription', 8, -150, 'peaks', 'Crystal sings when struck. Bind it to your staff and it will sing through your foes.'],
    ['Storm Ledger', 160, 30, 'ruins', 'We built our walls high, and the storm built higher. Still, the halls stand. Still, the light waits.'],
    ['Glowing Glyph', -20, 40, 'hollows', 'Below the clouds the Hollows keep the realm\'s dreams. Geysers of breath lift the patient back to the sky.'],
    ['Cracked Plaque', -26, 22, 'verdant', 'Cracked seals yield to heavy blows. A stone fused to a staff is heavy indeed.'],
    ['Builder\'s Note', 70, -36, 'verdant', 'Every Core you gather strengthens your breath and teaches the Forge Hand a new part.'],
    ['Falls Whisper', 44, 6, 'verdant', 'Where the lake spills into the sky, something bright waits at the edge.'],
  ];
  for (const [title, x, z, biome, text] of J) W.journals.push({ title, pos: V(x, 0, z), biome, text, read: false });
  const NR = rng(5);
  const nodeAt = (type, I, n) => { for (let i = 0; i < n; i++) { const a = NR() * 6.283, d = 4 + NR() * I.r * 0.75; if (Math.hypot(I.x + Math.cos(a) * d, I.z + Math.sin(a) * d - 8) < 12) continue; W.nodes.push({ type, pos: V(I.x + Math.cos(a) * d, 0, I.z + Math.sin(a) * d), alive: true, t: 0, island: I.id }); } };
  const byName = n => W.islands.find(i => i.name === n);
  nodeAt('bush', V0, 10); nodeAt('ore', V0, 6); nodeAt('bush', byName('Mossback Isle'), 3);
  nodeAt('crystal', byName('Prism Peaks'), 9); nodeAt('ore', byName('Prism Peaks'), 4);
  nodeAt('ore', byName('Tempest Ruins'), 6); nodeAt('crystal', byName('Tempest Ruins'), 2);
  nodeAt('bush', byName('Galewind Plateau'), 7); nodeAt('ore', byName('Galewind Plateau'), 3);
  nodeAt('crystal', byName('Lumen Hollows'), 16); nodeAt('bush', byName('Lumen Hollows'), 8);
  const ER = rng(77);
  const enemyAt = (I, n, rad) => { for (let i = 0; i < n; i++) { const a = ER() * 6.283, d = 10 + ER() * (rad || I.r * 0.6); W.enemies.push({ id: W.enemies.length, home: I.id, pos: V(I.x + Math.cos(a) * d, 0, I.z + Math.sin(a) * d), vel: V(), hp: 3, max: 3, alive: true, t: ER() * 5, hurt: 0, cd: 0, respawn: 0, spawn: null }); } };
  enemyAt(V0, 3); enemyAt(byName('Galewind Plateau'), 3); enemyAt(byName('Tempest Ruins'), 4); enemyAt(byName('Prism Peaks'), 2); enemyAt(byName('Lumen Hollows'), 5, 90);
  // keep enemies away from start
  for (const e of W.enemies) if (e.home === V0.id && Math.hypot(e.pos.x, e.pos.z - 6) < 18) e.pos.x += 22;
  return W;
}
// ---------- terrain queries ----------
function islandRadius(I, x, z) {
  if (I.flat) return I.r;
  const a = Math.atan2(z - I.z, x - I.x);
  return I.r * (1 + 0.13 * noise2(Math.cos(a) * 2 + I.seed, Math.sin(a) * 2, I.seed) + 0.05 * noise2(Math.cos(a) * 6, Math.sin(a) * 6 + I.seed, 3));
}
function islandTop(I, x, z) {
  if (I.flat) return I.y;
  const dx = x - I.x, dz = z - I.z, d = Math.sqrt(dx * dx + dz * dz);
  const t = clamp(d / I.r, 0, 1);
  let h = I.y;
  if (I.peak) h += I.hill * Math.pow(1 - t, 1.6) * (0.85 + 0.15 * fbm(x * 0.05, z * 0.05, I.seed)) + fbm(x * 0.08, z * 0.08, I.seed + 1) * 1.6;
  else h += I.hill * fbm(x * 0.035, z * 0.035, I.seed) * (1 - t * t * 0.6);
  if (I.depths) h += 6 * Math.max(0, fbm(x * 0.012, z * 0.012, 9));
  h -= 1.6 * Math.pow(t, 6);
  if (I.lake) { const lx = x - I.lake.x, lz = z - I.lake.z, ld = Math.sqrt(lx * lx + lz * lz) / I.lake.r; if (ld < 1.3) h -= I.lake.depth * (ld < 1 ? Math.max(0, 1 - ld * ld * 0.6) : 0.4 * (1.3 - ld) / 0.3); }
  return h;
}
function islandBottom(I) { return I.y - I.thick; }
function groundAt(W, x, y, z, step = 0.7) {
  let best = -Infinity, bestI = null;
  for (const I of W.islands) {
    const dx = x - I.x, dz = z - I.z;
    const rr = I.r * 1.25; if (dx * dx + dz * dz > rr * rr) continue;
    if (Math.sqrt(dx * dx + dz * dz) > islandRadius(I, x, z)) continue;
    const top = islandTop(I, x, z);
    if (top <= y + step && top > best) { best = top; bestI = I; }
  }
  return { h: best, island: bestI };
}
function groundNormal(W, I, x, z) {
  if (I.flat) return V(0, 1, 0);
  const e = 0.4, h0 = islandTop(I, x, z);
  const hx = islandTop(I, x + e, z) - h0, hz = islandTop(I, x, z + e) - h0;
  return vnorm(V(-hx / e, 1, -hz / e));
}
function waterAt(W, x, z) { for (const w of W.waters) { const dx = x - w.x, dz = z - w.z; if (dx * dx + dz * dz < w.r * w.r) return w; } return null; }
function obbLocal(B, p) { const c = Math.cos(-B.yaw), s = Math.sin(-B.yaw); const dx = p.x - B.x, dz = p.z - B.z; return V(dx * c + dz * s, p.y - B.y, -dx * s + dz * c); }
function obbToWorldDir(B, d) { const c = Math.cos(B.yaw), s = Math.sin(B.yaw); return V(d.x * c + d.z * s, d.y, -d.x * s + d.z * c); }
function pointInBox(B, p, pad = 0) {
  if (B.gone) return null;
  const l = obbLocal(B, p);
  const ex = B.hx + pad - Math.abs(l.x), ey = B.hy + pad - Math.abs(l.y), ez = B.hz + pad - Math.abs(l.z);
  if (ex <= 0 || ey <= 0 || ez <= 0) return null;
  let n, d;
  if (ey <= ex && ey <= ez) { n = V(0, Math.sign(l.y) || 1, 0); d = ey; }
  else if (ex <= ez) { n = V(Math.sign(l.x) || 1, 0, 0); d = ex; }
  else { n = V(0, 0, Math.sign(l.z) || 1); d = ez; }
  return { depth: d, n: obbToWorldDir(B, n) };
}

// ---------- rigid bodies ----------
let BID = 1;
function partInertia(p) {
  const d = PART_DEFS[p.type], m = d.mass;
  if (d.shape === 'sphere') { const i = 0.4 * m * d.r * d.r; return V(i, i, i); }
  const h = d.half; return V(m / 3 * (h.y * h.y + h.z * h.z), m / 3 * (h.x * h.x + h.z * h.z), m / 3 * (h.x * h.x + h.y * h.y));
}
function makePart(type) { return { type, lp: V(), lq: Q(), on: false, fuel: ROCKET_FUEL, spin: 0, recharge: 0 }; }
function recomputeBody(b) {
  let m = 0, c = V();
  for (const p of b.parts) { const pm = PART_DEFS[p.type].mass; m += pm; c = vadd(c, vmul(p.lp, pm)); }
  c = vmul(c, 1 / m);
  b.pos = vadd(b.pos, qrot(b.q, c));
  for (const p of b.parts) p.lp = vsub(p.lp, c);
  b.mass = m; b.invMass = 1 / m;
  let I = V();
  for (const p of b.parts) {
    const pi = partInertia(p), pm = PART_DEFS[p.type].mass, r = p.lp;
    const ax = qrot(p.lq, V(1, 0, 0)), ay = qrot(p.lq, V(0, 1, 0)), az = qrot(p.lq, V(0, 0, 1));
    const rotI = V(pi.x * ax.x * ax.x + pi.y * ay.x * ay.x + pi.z * az.x * az.x, pi.x * ax.y * ax.y + pi.y * ay.y * ay.y + pi.z * az.y * az.y, pi.x * ax.z * ax.z + pi.y * ay.z * ay.z + pi.z * az.z * az.z);
    I = vadd(I, vadd(rotI, V(pm * (r.y * r.y + r.z * r.z), pm * (r.x * r.x + r.z * r.z), pm * (r.x * r.x + r.y * r.y))));
  }
  b.invI = V(1 / Math.max(I.x, 0.08), 1 / Math.max(I.y, 0.08), 1 / Math.max(I.z, 0.08));
  let R = 0;
  for (const p of b.parts) { const d = PART_DEFS[p.type]; const ext = d.shape === 'sphere' ? d.r : vlen(d.half); R = Math.max(R, vlen(p.lp) + ext); }
  b.radius = R;
  b.points = buildPoints(b);
}
function buildPoints(b) {
  const pts = [];
  b.parts.forEach((p, pi) => {
    const d = PART_DEFS[p.type]; if (d.shape !== 'box') return;
    const h = V(d.half.x - 0.03, d.half.y - 0.03, d.half.z - 0.03);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push({ pi, l: vadd(p.lp, qrot(p.lq, V(sx * h.x, sy * h.y, sz * h.z))) });
    const nz = h.z > 0.8 ? Math.ceil(h.z / 0.6) : 1, nx = h.x > 0.8 ? Math.ceil(h.x / 0.6) : 1;
    for (let i = 1; i < nz; i++) { const z = -h.z + 2 * h.z * i / nz; for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push({ pi, l: vadd(p.lp, qrot(p.lq, V(sx * h.x, sy * h.y, z))) }); }
    for (let i = 1; i < nx; i++) { const x = -h.x + 2 * h.x * i / nx; for (const sz of [-1, 1]) for (const sy of [-1, 1]) pts.push({ pi, l: vadd(p.lp, qrot(p.lq, V(x, sy * h.y, sz * h.z))) }); }
  });
  return pts;
}
function newBody(parts, pos, q) { return { id: BID++, parts, pos: vcopy(pos), q: q || Q(), vel: V(), ang: V(), sleep: false, sleepT: 0, held: false, spawned: false, shrine: null, age: 0, drive: 0, steer: 0, grounded: false }; }
function createBody(G, type, pos, q) { const b = newBody([makePart(type)], pos, q); recomputeBody(b); G.bodies.push(b); return b; }
function partWorld(b, p) { return { pos: vadd(b.pos, qrot(b.q, p.lp)), q: qmul(b.q, p.lq) }; }
function applyInvI(b, v) { const l = qrot(qconj(b.q), v); return qrot(b.q, V(l.x * b.invI.x, l.y * b.invI.y, l.z * b.invI.z)); }
function velAt(b, r) { return vadd(b.vel, vcross(b.ang, r)); }
function applyImpulse(b, r, j) { if (!b) return; b.vel = vadd(b.vel, vmul(j, b.invMass)); b.ang = vadd(b.ang, applyInvI(b, vcross(r, j))); }
function wake(b) { if (b) { b.sleep = false; b.sleepT = 0; } }
function hasPart(b, t) { return b.parts.some(p => p.type === t); }
function weld(G, a, b) {
  const inv = qconj(b.q);
  for (const p of a.parts) { const w = partWorld(a, p); p.lp = qrot(inv, vsub(w.pos, b.pos)); p.lq = qnorm(qmul(inv, w.q)); b.parts.push(p); }
  const mt = a.mass + b.mass;
  b.vel = vmul(vadd(vmul(a.vel, a.mass), vmul(b.vel, b.mass)), 1 / mt); b.ang = V();
  b.spawned = b.spawned || a.spawned; b.home = null;
  recomputeBody(b);
  G.bodies.splice(G.bodies.indexOf(a), 1);
  wake(b); return b;
}
function detach(G, b, pi) {
  if (b.parts.length < 2) return null;
  const p = b.parts[pi]; const w = partWorld(b, p);
  b.parts.splice(pi, 1); recomputeBody(b);
  const nb = newBody([p], w.pos, w.q); nb.vel = vcopy(b.vel); nb.spawned = b.spawned; nb.shrine = b.shrine;
  p.lp = V(); p.lq = Q(); recomputeBody(nb); G.bodies.push(nb); wake(b);
  return nb;
}
function pointVsPart(b, p, wp, pad = 0) {
  const d = PART_DEFS[p.type]; const pw = partWorld(b, p);
  if (d.shape === 'sphere') { const dv = vsub(wp, pw.pos); const L = vlen(dv); if (L >= d.r + pad) return null; return { depth: d.r + pad - L, n: L > 1e-5 ? vmul(dv, 1 / L) : V(0, 1, 0) }; }
  const l = qrot(qconj(pw.q), vsub(wp, pw.pos)), h = d.half;
  const ex = h.x + pad - Math.abs(l.x), ey = h.y + pad - Math.abs(l.y), ez = h.z + pad - Math.abs(l.z);
  if (ex <= 0 || ey <= 0 || ez <= 0) return null;
  let n, dd; if (ey <= ex && ey <= ez) { n = V(0, Math.sign(l.y) || 1, 0); dd = ey; } else if (ex <= ez) { n = V(Math.sign(l.x) || 1, 0, 0); dd = ex; } else { n = V(0, 0, Math.sign(l.z) || 1); dd = ez; }
  return { depth: dd, n: qrot(pw.q, n) };
}
function closestOnPart(b, p, wp) {
  const d = PART_DEFS[p.type]; const pw = partWorld(b, p);
  if (d.shape === 'sphere') { const dv = vsub(wp, pw.pos); const L = vlen(dv) || 1; return vadd(pw.pos, vmul(dv, Math.min(1, d.r / L))); }
  const l = qrot(qconj(pw.q), vsub(wp, pw.pos)), h = d.half;
  return vadd(pw.pos, qrot(pw.q, V(clamp(l.x, -h.x, h.x), clamp(l.y, -h.y, h.y), clamp(l.z, -h.z, h.z))));
}

// ----- contacts & solver -----
function crumbleBox(C) { return { x: C.x, y: C.y - C.h / 2, z: C.z, hx: 1.5, hy: C.h / 2, hz: 1.5, yaw: 0, climb: true, crumble: C }; }
function staticContactsForPoint(G, wp, out, b, r, pi, isWheel) {
  const W = G.W;
  for (const I of W.islands) {
    const dx = wp.x - I.x, dz = wp.z - I.z, rr = I.r * 1.25;
    if (dx * dx + dz * dz > rr * rr) continue;
    if (Math.sqrt(dx * dx + dz * dz) > islandRadius(I, wp.x, wp.z)) continue;
    const top = islandTop(I, wp.x, wp.z);
    if (wp.y < top + 0.03 && wp.y > top - 2.5) { const n = groundNormal(W, I, wp.x, wp.z); out.push({ b, r, n, depth: (top + 0.03 - wp.y) * n.y, mu: 0.8, pi, wheel: isWheel }); }
  }
  for (const B of W.boxes) {
    if (B.gone) continue;
    const dx = wp.x - B.x, dz = wp.z - B.z, rr = B.hx + B.hz + 1;
    if (Math.abs(dx) > rr || Math.abs(dz) > rr || Math.abs(wp.y - B.y) > B.hy + 1) continue;
    const c = pointInBox(B, wp, 0.03); if (c) out.push({ b, r, n: c.n, depth: c.depth, mu: 0.7, pi, wheel: isWheel });
  }
  for (const C of W.crumbles) {
    if (C.fall > 0) continue;
    const c = pointInBox(crumbleBox(C), wp); if (c) out.push({ b, r, n: c.n, depth: c.depth, mu: 0.7, pi, wheel: isWheel });
  }
}
function genContacts(G) {
  const cs = [], bodies = G.bodies;
  for (const b of bodies) {
    if (b.sleep) continue;
    for (const pt of b.points) { const r = qrot(b.q, pt.l); staticContactsForPoint(G, vadd(b.pos, r), cs, b, r, pt.pi, false); }
    b.parts.forEach((p, pi) => {
      const d = PART_DEFS[p.type]; if (d.shape !== 'sphere') return;
      const c = vadd(b.pos, qrot(b.q, p.lp)); const isW = p.type === 'wheel';
      const tmp = [];
      staticContactsForPoint(G, vadd(c, V(0, -d.r, 0)), tmp, b, null, pi, isW);
      for (const k of tmp) { k.r = vsub(vsub(c, vmul(k.n, d.r - 0)), b.pos); k.r = vadd(k.r, vmul(k.n, 0)); cs.push(k); }
      for (const B of G.W.boxes) {
        if (B.gone) continue;
        if (Math.abs(c.x - B.x) > B.hx + B.hz + d.r || Math.abs(c.z - B.z) > B.hx + B.hz + d.r || Math.abs(c.y - B.y) > B.hy + d.r) continue;
        const l = obbLocal(B, c); const cl = V(clamp(l.x, -B.hx, B.hx), clamp(l.y, -B.hy, B.hy), clamp(l.z, -B.hz, B.hz));
        const dl = vsub(l, cl), L = vlen(dl);
        if (L > 1e-5 && L < d.r && Math.abs(dl.y) < L * 0.95) { const n = obbToWorldDir(B, vmul(dl, 1 / L)); cs.push({ b, n, depth: d.r - L, mu: 0.7, pi, wheel: isW, r: vsub(vsub(c, vmul(n, d.r)), b.pos) }); }
      }
    });
  }
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (a.sleep && b.sleep) continue;
      const dd = vsub(a.pos, b.pos); const rs = a.radius + b.radius;
      if (vdot(dd, dd) > rs * rs) continue;
      pairContacts(a, b, cs); pairContacts(b, a, cs);
    }
  }
  return cs;
}
function pairContacts(a, b, cs) {
  for (const pt of a.points) {
    const ra = qrot(a.q, pt.l); const wp = vadd(a.pos, ra);
    if (vlen(vsub(wp, b.pos)) > b.radius + 0.1) continue;
    let best = null;
    for (const p of b.parts) { const c = pointVsPart(b, p, wp, 0.03); if (c && (!best || c.depth < best.depth)) best = c; }
    if (best) cs.push({ b: a, o: b, r: ra, ro: vsub(wp, b.pos), n: best.n, depth: best.depth, mu: 0.6, pi: pt.pi });
  }
  a.parts.forEach((p, pi) => {
    const d = PART_DEFS[p.type]; if (d.shape !== 'sphere') return;
    const c = vadd(a.pos, qrot(a.q, p.lp));
    if (vlen(vsub(c, b.pos)) > b.radius + d.r) return;
    for (const q of b.parts) {
      const qd = PART_DEFS[q.type];
      if (qd.shape === 'sphere' && a.id > b.id) continue;
      const cp = closestOnPart(b, q, c); const dv = vsub(c, cp); const L = vlen(dv);
      if (L < d.r && L > 1e-5) { const n = vmul(dv, 1 / L); const wp = vsub(c, vmul(n, d.r)); cs.push({ b: a, o: b, r: vsub(wp, a.pos), ro: vsub(wp, b.pos), n, depth: d.r - L, mu: 0.6, pi, wheel: p.type === 'wheel' }); }
    }
  });
}
function driveDir(b) {
  const st = b.parts.find(p => p.type === 'stick');
  return st ? qrot(qmul(b.q, st.lq), V(0, 0, -1)) : qrot(b.q, V(0, 0, -1));
}
function solve(G, cs, dt) {
  const dyn = o => o && !o.sleep && !o.held;
  for (const c of cs) {
    const a = c.b, o = c.o || null;
    c.ro = c.ro || V();
    const rnA = vcross(c.r, c.n), rnB = vcross(c.ro, c.n);
    let k = a.invMass + vdot(rnA, applyInvI(a, rnA));
    if (dyn(o)) k += o.invMass + vdot(rnB, applyInvI(o, rnB));
    c.kn = 1 / k; c.jn = 0; c.jt1 = 0; c.jt2 = 0;
    c.bias = Math.min(4, 0.25 / dt * Math.max(0, c.depth - 0.012));
    let t1 = Math.abs(c.n.y) < 0.9 ? vnorm(vcross(c.n, V(0, 1, 0))) : vnorm(vcross(c.n, V(1, 0, 0)));
    if (c.wheel) { const f = driveDir(a); const fp = vsub(f, vmul(c.n, vdot(f, c.n))); if (vlen(fp) > 0.1) t1 = vnorm(fp); }
    c.t1 = t1; c.t2 = vcross(c.n, t1);
    const mk = t => { const ra = vcross(c.r, t), rb = vcross(c.ro, t); let kk = a.invMass + vdot(ra, applyInvI(a, ra)); if (dyn(o)) kk += o.invMass + vdot(rb, applyInvI(o, rb)); return 1 / kk; };
    c.k1 = mk(c.t1); c.k2 = mk(c.t2);
    const rv = vsub(velAt(a, c.r), o ? velAt(o, c.ro) : V());
    const vn = vdot(rv, c.n); c.rest = vn < -4 ? -vn * 0.15 : 0;
    if (o && o.sleep && (Math.abs(vn) > 0.5 || a.held)) wake(o);
  }
  for (let it = 0; it < 10; it++) {
    for (const c of cs) {
      const a = c.b, o = c.o;
      const ov = o ? (dyn(o) || o.held ? velAt(o, c.ro) : V()) : V();
      const rv = vsub(velAt(a, c.r), ov);
      const vn = vdot(rv, c.n);
      let dj = (c.bias + c.rest - vn) * c.kn;
      const jn0 = c.jn; c.jn = Math.max(0, jn0 + dj); dj = c.jn - jn0;
      const J = vmul(c.n, dj); applyImpulse(a, c.r, J); if (dyn(o)) applyImpulse(o, c.ro, vmul(J, -1));
      const ov2 = o ? (dyn(o) || o.held ? velAt(o, c.ro) : V()) : V();
      const rv2 = vsub(velAt(a, c.r), ov2);
      const maxF = c.mu * c.jn;
      let mu1 = maxF, target1 = 0;
      if (c.wheel) { mu1 = 0.04 * c.jn; if (a.drive) { target1 = a.drive * 12; mu1 = 1.2 * c.jn; } }
      let j1 = (target1 - vdot(rv2, c.t1)) * c.k1; const o1 = c.jt1; c.jt1 = clamp(o1 + j1, -mu1, mu1); j1 = c.jt1 - o1;
      let j2 = -vdot(rv2, c.t2) * c.k2; const lim2 = c.wheel ? 1.5 * c.jn : maxF; const o2 = c.jt2; c.jt2 = clamp(o2 + j2, -lim2, lim2); j2 = c.jt2 - o2;
      const JT = vadd(vmul(c.t1, j1), vmul(c.t2, j2)); applyImpulse(a, c.r, JT); if (dyn(o)) applyImpulse(o, c.ro, vmul(JT, -1));
    }
  }
}
function bodyForces(G, b, dt) {
  if (b.held) return;
  let F = V(0, -GRAV * b.mass, 0), T = V();
  for (const p of b.parts) {
    const w = partWorld(b, p), r = vsub(w.pos, b.pos);
    if (p.type === 'fan' && (p.on || b.drive > 0)) { const f = vmul(qrot(w.q, V(0, 0, 1)), FAN_THRUST); F = vadd(F, f); T = vadd(T, vcross(r, f)); p.spin += dt * 30; }
    if (p.type === 'rocket' && p.on && p.fuel > 0) { p.fuel -= dt; const f = vmul(qrot(w.q, V(0, 0, 1)), ROCKET_THRUST * Math.min(1, b.mass / 3 + 0.4)); F = vadd(F, f); T = vadd(T, vcross(r, f)); if (p.fuel <= 0) { p.on = false; p.recharge = 6; } }
    if (p.type === 'rocket' && !p.on && p.fuel <= 0) { p.recharge -= dt; if (p.recharge <= 0) p.fuel = ROCKET_FUEL; }
    if (p.type === 'balloon') { const f = V(0, BALLOON_LIFT, 0); F = vadd(F, f); T = vadd(T, vcross(r, f)); }
    if (p.type === 'wheel') p.spin += dt * (b.drive || 0) * 20;
    const wt = waterAt(G.W, w.pos.x, w.pos.z);
    if (wt && w.pos.y < wt.y) { const d = PART_DEFS[p.type]; const vol = d.shape === 'sphere' ? 4.2 * d.r ** 3 : 8 * d.half.x * d.half.y * d.half.z; const sub = clamp((wt.y - w.pos.y) / 0.6, 0, 1); const f = V(0, sub * vol * (d.floaty ? 40 : 14) * GRAV / 10, 0); F = vadd(F, f); T = vadd(T, vcross(r, f)); b.vel = vmul(b.vel, 1 - 1.5 * dt); b.ang = vmul(b.ang, 1 - 1.5 * dt); }
  }
  if (b.anchor) { // shrine balloons rest tethered until grabbed
    F = V(); T = V(); b.vel = vmul(b.vel, 0.9);
  }
  for (const u of activeDrafts(G)) { const dx = b.pos.x - u.x, dz = b.pos.z - u.z; if (dx * dx + dz * dz < u.r * u.r && b.pos.y > u.y0 && b.pos.y < u.y1 && hasPart(b, 'balloon')) F = vadd(F, V(0, 30, 0)); }
  b.vel = vadd(b.vel, vmul(F, b.invMass * dt));
  b.ang = vadd(b.ang, applyInvI(b, vmul(T, dt)));
  const up = V(0, 1, 0);
  if (b.steer && (b.grounded || hasPart(b, 'fan'))) { const cur = vdot(b.ang, up); b.ang = vadd(b.ang, vmul(up, (-b.steer * 1.8 - cur) * 0.12)); }
  if (hasPart(b, 'stick') && (b.drive || b.steer || hasPart(b, 'fan') && b.parts.some(p => p.on))) { const bu = qrot(b.q, up); const corr = vcross(bu, up); b.ang = vadd(b.ang, vmul(corr, 6 * dt)); b.ang = vsub(b.ang, vmul(vsub(b.ang, vmul(up, vdot(b.ang, up))), 2 * dt)); }
}
function activeDrafts(G) { return G.W.bigDraft.active ? G.W.updrafts.concat([G.W.bigDraft]) : G.W.updrafts; }
function stepBodies(G, dt) {
  const bodies = G.bodies;
  for (const b of bodies) { if (b.sleep) continue; b.age += dt; bodyForces(G, b, dt); }
  if (G.held) {
    const b = G.held; const tgt = G.heldTarget;
    if (tgt) { const d = vsub(tgt, b.pos); b.vel = vmul(d, 10); if (vlen(b.vel) > 20) b.vel = vmul(vnorm(b.vel), 20); }
    b.q = qslerp(b.q, G.heldQ, Math.min(1, dt * 10)); b.ang = V();
  }
  const cs = genContacts(G);
  for (const b of bodies) b.grounded = false;
  for (const c of cs) if (c.n.y > 0.5) c.b.grounded = true;
  solve(G, cs, dt);
  for (const b of bodies.slice()) {
    if (b.sleep) continue;
    if (b.held) { b.pos = vadd(b.pos, vmul(b.vel, dt)); continue; }
    const lin = vlen(b.vel); if (lin > 60) b.vel = vmul(b.vel, 60 / lin);
    b.pos = vadd(b.pos, vmul(b.vel, dt));
    let wl = vlen(b.ang);
    if (wl > 18) { b.ang = vmul(b.ang, 18 / wl); wl = 18; }
    if (wl > 1e-6) b.q = qnorm(qmul(qaxis(b.ang, wl * dt), b.q));
    b.vel = vmul(b.vel, b.grounded ? 0.997 : 0.9995); b.ang = vmul(b.ang, b.grounded ? 0.98 : 0.996);
    if (hasPart(b, 'ball') && b.grounded) { b.vel.x *= 0.996; b.vel.z *= 0.996; }
    const powered = b.parts.some(p => (p.type === 'balloon' && !b.anchor) || ((p.type === 'fan' || p.type === 'rocket') && p.on)) || b.drive;
    if (!powered && lin < 0.15 && vlen(b.ang) < 0.2 && (b.grounded || b.anchor)) { b.sleepT += dt; if (b.sleepT > 0.6) { b.sleep = true; b.vel = V(); b.ang = V(); } } else b.sleepT = 0;
    if (b.pos.y < -160) respawnBody(G, b);
  }
}
function respawnBody(G, b) {
  if (b.home && b.parts.length === 1) { b.pos = vcopy(b.home); b.q = Q(); b.vel = V(); b.ang = V(); wake(b); }
  else { if (G.held === b) releaseHeld(G); if (G.helm && G.helm.body === b) G.helm = null; G.bodies.splice(G.bodies.indexOf(b), 1); }
}

// ---------- Forge Hand ----------
function grab(G, b) {
  if (!b) return false;
  if (hasPart(b, 'urn')) { emit(G, 'toast', { text: 'Too heavy for the Forge Hand. Give it wheels.' }); emit(G, 'sfx', { s: 'deny' }); return false; }
  if (b.mass > FORGE_MAX_MASS) { emit(G, 'toast', { text: 'Too heavy to lift.' }); emit(G, 'sfx', { s: 'deny' }); return false; }
  const d = vlen(vsub(b.pos, G.player.pos)); if (d > FORGE_RANGE + b.radius) { emit(G, 'toast', { text: 'Too far away. Move closer.' }); emit(G, 'sfx', { s: 'deny' }); return false; }
  if (G.held) releaseHeld(G);
  G.held = b; b.held = true; b.anchor = false; wake(b); G.heldQ = b.q; G.heldDist = clamp(Math.hypot(b.pos.x - G.player.pos.x, b.pos.z - G.player.pos.z), 2.5, 9); G.heldLift = clamp(b.pos.y - (G.player.pos.y + 1.2), -2, 4);
  if (G.helm && G.helm.body === b) G.helm = null;
  emit(G, 'sfx', { s: 'grab' }); emit(G, 'grab', { id: b.id });
  return true;
}
function releaseHeld(G) { if (!G.held) return; const b = G.held; b.held = false; b.vel = vmul(b.vel, 0.3); wake(b); G.held = null; emit(G, 'sfx', { s: 'release' }); }
function rotateHeld(G, axis, dir) {
  if (!G.held) return;
  const f = G.cam.fwd; const ax = axis === 'y' ? V(0, 1, 0) : vnorm(vcross(V(0, 1, 0), V(f.x, 0, f.z)));
  G.heldQ = qnorm(qmul(qaxis(ax, dir * Math.PI / 4), G.heldQ)); emit(G, 'sfx', { s: 'rotate' });
}
function attachCandidate(G, b) {
  b = b || G.held; if (!b) return null;
  let best = null;
  for (const o of G.bodies) {
    if (o === b) continue;
    if (vlen(vsub(o.pos, b.pos)) > o.radius + b.radius + 0.8) continue;
    for (const pa of b.parts) { const wa = partWorld(b, pa).pos; for (const pb of o.parts) {
      let cb = closestOnPart(o, pb, wa), ca = closestOnPart(b, pa, cb); cb = closestOnPart(o, pb, ca); ca = closestOnPart(b, pa, cb);
      const d = vlen(vsub(ca, cb));
      if (d < 0.8 && (!best || d < best.d)) best = { o, d, pa: ca, pb: cb };
    } }
  }
  return best;
}
function attach(G) {
  const b = G.held; if (!b) return false;
  const c = attachCandidate(G, b);
  if (!c) { emit(G, 'toast', { text: 'Bring it closer to another object to attach.' }); emit(G, 'sfx', { s: 'deny' }); return false; }
  b.pos = vadd(b.pos, vsub(c.pb, c.pa));
  b.held = false; G.held = null;
  const nb = weld(G, b, c.o); nb.anchor = false;
  if (hasPart(nb, 'urn') || nb.mass > FORGE_MAX_MASS) { wake(nb); }
  else { G.held = nb; nb.held = true; G.heldQ = nb.q; G.heldDist = clamp(Math.hypot(nb.pos.x - G.player.pos.x, nb.pos.z - G.player.pos.z), 2.5, 10); }
  emit(G, 'sfx', { s: 'attach' }); emit(G, 'attach', { pos: c.pb, id: nb.id }); emit(G, 'burst', { pos: c.pb, kind: 'weld' });
  return nb;
}
function detachSel(G, b, pi) {
  if (!b || b.parts.length < 2) { emit(G, 'toast', { text: 'Tap a part of a built object, then Detach.' }); emit(G, 'sfx', { s: 'deny' }); return null; }
  if (G.held === b) releaseHeld(G);
  if (G.helm && G.helm.body === b) G.helm = null;
  const nb = detach(G, b, pi == null ? b.parts.length - 1 : clamp(pi, 0, b.parts.length - 1));
  emit(G, 'sfx', { s: 'detach' }); emit(G, 'detach', { pos: nb.pos }); emit(G, 'burst', { pos: nb.pos, kind: 'weld' });
  return nb;
}
function spawnPart(G, type) {
  if (!unlockedParts(G).includes(type)) { emit(G, 'toast', { text: 'Collect more Ancient Cores to unlock this part.' }); emit(G, 'sfx', { s: 'deny' }); return null; }
  const spawned = G.bodies.filter(b => b.spawned);
  if (spawned.length >= MAX_SPAWNED) { const old = spawned.find(b => b.parts.length === 1 && b !== G.held && !(G.helm && G.helm.body === b)) || spawned[0]; if (G.held === old) releaseHeld(G); if (G.helm && G.helm.body === old) G.helm = null; G.bodies.splice(G.bodies.indexOf(old), 1); emit(G, 'despawn', { id: old.id }); }
  const P = G.player, f = G.cam.fwd; const fh = vnorm(V(f.x, 0, f.z));
  const pos = vadd(P.pos, V(fh.x * 3.2, 1.6, fh.z * 3.2));
  const b = createBody(G, type, pos, qaxis(V(0, 1, 0), G.cam.yaw)); b.spawned = true;
  emit(G, 'sfx', { s: 'spawn' }); emit(G, 'burst', { pos, kind: 'weld' });
  if (G.buildMode) grab(G, b);
  return b;
}
function activate(G, b) {
  if (!b) return false;
  const devs = b.parts.filter(p => p.type === 'fan' || p.type === 'rocket'); if (!devs.length) return false;
  const on = !devs.some(p => p.on);
  for (const p of devs) { if (p.type === 'rocket') p.on = on && p.fuel > 0; else p.on = on; }
  wake(b); emit(G, 'sfx', { s: on ? 'devon' : 'devoff' }); return true;
}

// ---------- game ----------
function emit(G, type, data) { G.events.push(Object.assign({ type }, data || {})); }
function coresTaken(G) { return G.W.cores.filter(c => c.taken).length; }
function coreGoal(G) { return Math.ceil(G.W.cores.length * 0.8); }
function unlockedParts(G) { const n = coresTaken(G); return BUILD_PARTS.filter(t => PART_DEFS[t].unlock <= n); }
function startPos(G) { return V(0, islandTop(G.W.islands[0], 2, 8) + 0.05, 8); }
function createGame(opts = {}) {
  const W = buildWorld();
  const G = { W, bodies: [], t: 0, acc: 0, time: opts.time != null ? opts.time : 0.3, events: [], held: null, heldQ: Q(), heldDist: 6, heldLift: 0, heldTarget: null,
    sunkenRise: 0, ending: 0, endingStarted: false, cam: { yaw: 0, pitch: -0.25, fwd: V(0, 0, -1) }, revealed: {},
    inv: { rock: 2, leaf: 1, crystal: 0, staves: 3 }, weapon: { fuse: null, dur: 22, maxDur: 22 }, buildMode: false, helm: null };
  const hol = W.islands.find(i => i.depths);
  const groundY = (x, z) => groundAt(W, x, 400, z, 0).h;
  for (const j of W.journals) j.pos.y = j.biome === 'hollows' ? islandTop(hol, j.pos.x, j.pos.z) : groundY(j.pos.x, j.pos.z);
  for (const n of W.nodes) n.pos.y = islandTop(W.islands[n.island], n.pos.x, n.pos.z);
  for (const e of W.enemies) { e.pos.y = islandTop(W.islands[e.home], e.pos.x, e.pos.z); e.spawn = vcopy(e.pos); }
  for (const C of W.caves) {
    const g = groundY(C.x, C.z); const dy = g - C.y; C.y = g;
    for (const B of W.boxes) if ((B.kind === 'cave' || B.kind === 'seal') && Math.abs(B.x - C.x) < 5 && Math.abs(B.z - C.z) < 5) B.y += dy;
  }
  for (const T of W.towers) {
    const g = T.id === 't4' ? islandTop(hol, T.x, T.z) : groundY(T.x, T.z); const dy = g - T.base + 0.0; T.base = g; T.top.y += dy;
    for (const B of W.boxes) if ((B.kind === 'tower' || B.kind === 'towertop') && Math.abs(B.x - T.x) < 1 && Math.abs(B.z - T.z) < 1) B.y += dy;
    const c = W.cores.find(c => c.id === 'core-' + T.id); c.pos.y += dy;
  }
  const peaks = W.islands.find(i => i.name === 'Prism Peaks');
  for (const c of W.cores) {
    if (c.id === 'core-summit') c.pos = V(0, islandTop(peaks, 0, -175) + 1.3, -175);
    else if (c.id === 'core-ruinstop') { const tall = W.boxes.filter(b => b.kind === 'ruin' && b.x > 120).sort((a, b) => b.hy - a.hy)[0]; c.pos = V(tall.x, tall.y + tall.hy + 1.2, tall.z); }
    else if (c.src === 'depths') c.pos.y = islandTop(hol, c.pos.x, c.pos.z) + 1.2;
    else if (c.src === 'cave') { const C = W.caves.find(q => 'core-' + q.id === c.id); c.pos.y = C.y + 1.2; }
    else if (c.src === 'mossback' || c.src === 'falls') c.pos.y = groundY(c.pos.x, c.pos.z) + 1.2;
    else if (c.src === 'rings') c.pos.y = islandTop(hol, c.pos.x, c.pos.z) + 1.2;
    else if (c.src === 'sunken') c.pos.y = islandTop(W.sunken, c.pos.x, c.pos.z) + 1.2;
  }
  // the rings core floats at the end of the ring line instead
  const rc = W.cores.find(c => c.id === 'core-rings'); const lr = W.rings[W.rings.length - 1]; rc.pos = V(lr.x + 4, lr.y - 3, lr.z + 9);
  for (const s of W.spawns) { const b = createBody(G, s.type, s.pos); b.shrine = s.shrine || null; b.home = vcopy(s.pos); b.anchor = !!s.anchor; b.sleep = true; }
  const loose = [['log', 12, -14], ['log', -8, 10], ['stone', 6, 18], ['plank', -4, -24], ['crate', 10, -4], ['crate', 11.3, -4], ['plank', -160, 30], ['log', -150, 25], ['stone', 175, 30], ['log', 20, 40, true], ['wheel', 4, -12], ['fan', -6, -16]];
  for (const [t, x, z, deep] of loose) { const g = deep ? islandTop(hol, x, z) : groundY(x, z); const d = PART_DEFS[t]; const b = createBody(G, t, V(x, g + (d.half ? d.half.y : d.r) + 0.03, z)); b.home = vcopy(b.pos); b.sleep = true; }
  G.player = { pos: startPos(G), vel: V(), yaw: Math.PI, mode: 'walk', grounded: false, coyote: 0, jbuf: 0, stamina: 100, maxStamina: 100, staminaDelay: 0, exhausted: false,
    dash: 0, dashCd: 0, wallN: null, groundBody: null, hearts: 5, maxHearts: 5, inv: 0, safe: null, attackT: 0, attackCd: 0 };
  G.player.safe = vcopy(G.player.pos);
  G.cam.yaw = 0;
  return G;
}

// ---------- player ----------
const PR = 0.4, PH = 1.7;
function playerCollide(G, P) {
  const W = G.W; let ground = null, gn = null, wall = null, gBody = null, ceiling = null;
  const g = groundAt(W, P.pos.x, P.pos.y, P.pos.z, P.vel.y <= 0 ? 1.6 : 0.75);
  if (g.island && P.pos.y <= g.h + 0.03 && P.vel.y <= 0.5) { P.pos.y = g.h; ground = 'island'; gn = groundNormal(W, g.island, P.pos.x, P.pos.z); }
  for (const I of W.islands) {
    const dx = P.pos.x - I.x, dz = P.pos.z - I.z, d = Math.hypot(dx, dz);
    if (d > I.r * 1.3 + 1 || d < 1e-4) continue;
    const R = islandRadius(I, P.pos.x, P.pos.z);
    if (d > R + PR) continue;
    const ex = I.x + dx / d * Math.max(0, R - 0.3), ez = I.z + dz / d * Math.max(0, R - 0.3);
    const top = islandTop(I, ex, ez);
    if (d > R - 1.2 && P.pos.y < top - 0.75 && P.pos.y + PH > islandBottom(I)) {
      const n = V(dx / d, 0, dz / d); const push = R + PR - d;
      P.pos = vadd(P.pos, vmul(n, push)); const vn = vdot(P.vel, n); if (vn < 0) P.vel = vsub(P.vel, vmul(n, vn));
      wall = { n, climb: !I.flat, top, island: I };
    }
  }
  const boxes = W.boxes.concat(W.crumbles.filter(c => c.fall <= 0).map(crumbleBox));
  for (const B of boxes) {
    if (B.gone) continue;
    const ext = B.hx + B.hz + 2;
    if (Math.abs(P.pos.x - B.x) > ext || Math.abs(P.pos.z - B.z) > ext || P.pos.y > B.y + B.hy + 1 || P.pos.y + PH < B.y - B.hy - 1) continue;
    for (const hy of [PR, PH * 0.5, PH - PR]) {
      const c = vadd(P.pos, V(0, hy, 0)); const l = obbLocal(B, c);
      const cl = V(clamp(l.x, -B.hx, B.hx), clamp(l.y, -B.hy, B.hy), clamp(l.z, -B.hz, B.hz));
      const dl = vsub(l, cl); const L = vlen(dl); let n, depth;
      if (L > 1e-6) { if (L >= PR) continue; n = obbToWorldDir(B, vmul(dl, 1 / L)); depth = PR - L; }
      else { const pb = pointInBox(B, c, PR); if (!pb) continue; n = pb.n; depth = pb.depth; }
      const topY = B.y + B.hy;
      if ((n.y > 0.6 || (topY - P.pos.y < 0.55 && topY - P.pos.y > -0.1)) && hy === PR) {
        if (P.vel.y <= 0.5) { P.pos.y = topY; if (P.vel.y < 0) P.vel.y = 0; ground = 'box'; gn = V(0, 1, 0); if (B.crumble && B.crumble.t < 0 && B.crumble.crumble) B.crumble.t = 0.7; }
        continue;
      }
      if (n.y < -0.6) { if (P.vel.y > 0) P.vel.y = 0; P.pos = vadd(P.pos, vmul(n, depth)); if (B.climb !== false) ceiling = { top: topY }; continue; }
      const nh = vnorm(V(n.x, 0, n.z));
      P.pos = vadd(P.pos, vmul(nh, depth)); const vn = vdot(P.vel, nh); if (vn < 0) P.vel = vsub(P.vel, vmul(nh, vn));
      wall = { n: nh, climb: B.climb !== false, top: topY, box: B };
    }
  }
  for (const b of G.bodies) {
    if (b === G.held) continue;
    if (vlen(vsub(b.pos, vadd(P.pos, V(0, 0.9, 0)))) > b.radius + 1.4) continue;
    for (const p of b.parts) {
      for (const hy of [PR, PH - PR]) {
        const c = vadd(P.pos, V(0, hy, 0)); const cp = closestOnPart(b, p, c); const dv = vsub(c, cp); const L = vlen(dv);
        if (L >= PR) continue;
        const n = L > 1e-5 ? vmul(dv, 1 / L) : V(0, 1, 0); let depth = PR - L;
        const stepUp = hy === PR && cp.y - P.pos.y < 0.55 && cp.y - P.pos.y > -0.05 && P.vel.y <= 0.5;
        if (stepUp && n.y <= 0.5) { n.x = 0; n.y = 1; n.z = 0; depth = cp.y - P.pos.y; }
        if (n.y > 0.5 && hy === PR) {
          if (p.type === 'spring') { P.vel.y = 21; P.pos.y += depth; P.mode = 'air'; P.grounded = false; emit(G, 'sfx', { s: 'spring' }); emit(G, 'burst', { pos: cp, kind: 'weld' }); continue; }
          P.pos = vadd(P.pos, V(0, depth / Math.max(n.y, 0.5), 0));
          if (P.vel.y < 0) P.vel.y = 0;
          ground = 'body'; gn = n; gBody = { b, p };
          if (b.mass < 6 && !b.anchor) { wake(b); applyImpulse(b, vsub(cp, b.pos), V(0, -GRAV * 0.6 * G.FIX, 0)); }
          continue;
        }
        const nh = vnorm(V(n.x, Math.min(0, n.y), n.z)); P.pos = vadd(P.pos, vmul(nh, depth));
        const vn = vdot(P.vel, nh);
        if (vn < 0) { P.vel = vsub(P.vel, vmul(nh, vn)); if (b.mass < 10 && !b.anchor) { wake(b); applyImpulse(b, vsub(cp, b.pos), vmul(nh, vn * Math.min(b.mass, 3) * 0.5)); } }
      }
    }
  }
  return { ground, gn, wall, gBody, ceiling };
}
function inUpdraft(G, p) { for (const u of activeDrafts(G)) { const dx = p.x - u.x, dz = p.z - u.z; if (dx * dx + dz * dz < u.r * u.r && p.y > u.y0 && p.y < u.y1) return u; } return null; }
function inShrine(G, p) { for (const S of G.W.shrines) { const dx = p.x - S.zone.x, dz = p.z - S.zone.z; if (dx * dx + dz * dz < S.zone.r * S.zone.r && p.y > S.zone.y0 && p.y < S.zone.y1) return S; } return null; }
function windAt(G, p) {
  let w = V();
  for (const s of G.W.winds) { const dx = p.x - s.x, dz = p.z - s.z; if (dx * dx + dz * dz < s.r * s.r) { const g = s.gust ? 0.6 + 0.4 * Math.sin(G.t * 0.7 + s.x) : 1; w = vadd(w, vmul(s.dir, s.s * g)); } }
  return w;
}
function stepPlayer(G, inp, dt) {
  const P = G.player, W = G.W;
  if (G.ending > 0) { P.vel = V(); return; }
  let mv = V(inp.mx || 0, 0, inp.mz || 0); if (vlen(mv) > 1) mv = vnorm(mv); const ml = vlen(mv);
  const fw = vnorm(V(G.cam.fwd.x, 0, G.cam.fwd.z)), rt = V(-fw.z, 0, fw.x);
  const wish = vadd(vmul(fw, -mv.z), vmul(rt, mv.x));
  if (inp.jumpPressed) P.jbuf = 0.15; else P.jbuf -= dt;
  P.coyote -= dt; P.dashCd -= dt; P.inv -= dt; P.attackCd -= dt; P.attackT -= dt;
  if (G.helm) {
    const b = G.helm.body;
    if (!G.bodies.includes(b) || b.held) G.helm = null;
    else {
      b.drive = clamp(-mv.z, -1, 1); b.steer = clamp(mv.x, -1, 1); wake(b);
      const st = b.parts.find(p => p.type === 'stick'); const w = partWorld(b, st);
      const back = vmul(qrot(w.q, V(0, 0, 1)), 0.75);
      P.pos = vadd(vadd(w.pos, back), V(0, -0.3, 0)); P.vel = vcopy(b.vel); P.mode = 'helm'; P.grounded = true;
      const df = driveDir(b); P.yaw = Math.atan2(-df.x, -df.z);
      if (inp.jumpPressed) { b.drive = 0; b.steer = 0; G.helm = null; P.vel.y = 8; P.mode = 'air'; P.grounded = false; P.jbuf = 0; emit(G, 'sfx', { s: 'jump' }); }
      P.stamina = Math.min(P.maxStamina, P.stamina + 30 * dt);
      return;
    }
  }
  const sprint = !!inp.sprint && !P.exhausted && P.stamina > 0;
  const shrine = inShrine(G, P.pos);
  const wt = waterAt(W, P.pos.x, P.pos.z);
  const swimming = !!wt && P.pos.y < wt.y - 0.9;
  let usingStamina = false;
  if (P.mode === 'climb') {
    const n = P.wallN || V(0, 0, 1);
    const up = V(0, 1, 0), side = vnorm(vcross(up, n));
    P.vel = vadd(vadd(vmul(up, -mv.z * 3.4), vmul(side, mv.x * 3.0)), vmul(n, -1.2)); usingStamina = true;
    P.stamina -= (ml > 0.1 ? 8.5 : 1.5) * dt;
    P.yaw = Math.atan2(n.x, n.z);
    if (inp.jumpPressed) { P.jbuf = 0; if (mv.z > 0.5) { P.vel = vadd(vmul(n, 7), V(0, 6, 0)); P.mode = 'air'; } else if (P.stamina > 15) { P.stamina -= 18; P.vel = vadd(V(0, 10, 0), vmul(n, -1)); emit(G, 'sfx', { s: 'climbjump' }); } }
    if (P.stamina <= 0) { P.stamina = 0; P.exhausted = true; P.mode = 'air'; P.vel = vmul(n, 1.5); emit(G, 'toast', { text: 'Out of stamina!' }); }
  } else {
    const onGround = P.grounded;
    const speed = swimming ? (sprint ? 5.5 : 3.4) : (sprint ? 10 : 6.2);
    if (P.dash > 0) P.dash -= dt;
    const accel = onGround ? 70 : (P.mode === 'glide' ? 12 : 26);
    const hv = V(P.vel.x, 0, P.vel.z);
    if (P.dash <= 0) {
      let tgt;
      if (P.mode === 'glide') { const dir = ml > 0.1 ? vnorm(wish) : V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); tgt = vmul(dir, 9.5 * (ml > 0.1 ? Math.max(ml, 0.6) : 0.55)); }
      else tgt = vmul(wish, speed);
      const dv = vsub(tgt, hv); const dl = vlen(dv); const mx = accel * dt;
      const ch = dl > mx ? vmul(dv, mx / dl) : dv; P.vel.x += ch.x; P.vel.z += ch.z;
    }
    if (ml > 0.1) { const ty = Math.atan2(-wish.x, -wish.z); let d = ty - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); P.yaw += d * Math.min(1, dt * 14); }
    if (sprint && ml > 0.1 && (onGround || swimming)) { P.stamina -= 12 * dt; usingStamina = true; if (P.stamina <= 0) { P.stamina = 0; P.exhausted = true; } }
    if (inp.dashPressed && P.dashCd <= 0 && P.stamina > 12 && !swimming) { const d = ml > 0.1 ? vnorm(wish) : V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); P.vel.x = d.x * 17; P.vel.z = d.z * 17; if (!onGround && P.vel.y < 1) P.vel.y = 1; P.dash = 0.17; P.dashCd = 0.55; P.stamina -= 12; usingStamina = true; emit(G, 'sfx', { s: 'dash' }); emit(G, 'dash', {}); }
    if (P.jbuf > 0 && (onGround || P.coyote > 0) && !swimming) { P.vel.y = 9.6; P.jbuf = 0; P.coyote = 0; P.grounded = false; P.mode = 'air'; P.jumpHold = true; emit(G, 'sfx', { s: 'jump' }); emit(G, 'jump', { pos: vcopy(P.pos) }); }
    else if (P.jbuf > 0 && swimming && P.stamina > 10) { P.vel.y = 7; P.jbuf = 0; P.stamina -= 10; emit(G, 'sfx', { s: 'splash' }); }
    else if (inp.jumpPressed && !onGround && P.coyote <= 0 && !swimming && (P.mode === 'glide' || P.pos.y - groundAt(W, P.pos.x, P.pos.y, P.pos.z, 0).h > 2.2)) {
      P.jbuf = 0;
      if (P.mode === 'glide') { P.mode = 'air'; emit(G, 'sfx', { s: 'glideclose' }); }
      else if (P.stamina > 0 && !P.exhausted) { if (shrine) emit(G, 'toast', { text: 'The shrine\'s stillness folds your glider.' }); else { P.mode = 'glide'; if (P.vel.y < -4) P.vel.y = -4; emit(G, 'sfx', { s: 'glideopen' }); } }
    }
    if (!inp.jumpHeld) P.jumpHold = false;
    if (!P.jumpHold && P.vel.y > 2 && P.mode === 'air') P.vel.y -= GRAV * 1.4 * dt;
    const ud = inUpdraft(G, P.pos);
    if (P.mode === 'glide') {
      if (shrine) P.mode = 'air';
      usingStamina = true; P.stamina -= 5 * dt; if (P.stamina <= 0) { P.stamina = 0; P.exhausted = true; P.mode = 'air'; }
      if (ud) P.vel.y = Math.min(P.vel.y + ud.s * 2.5 * dt, ud.s * 0.8);
      else P.vel.y += (-2.4 - P.vel.y) * Math.min(1, 5 * dt);
      const wnd = windAt(G, P.pos); P.vel.x += wnd.x * dt * 1.2; P.vel.z += wnd.z * dt * 1.2;
    } else if (swimming) {
      const targetY = wt.y - 1.0; P.vel.y += ((targetY - P.pos.y) * 10 - P.vel.y * 4) * dt; P.mode = 'swim';
      P.vel.x *= 1 - 2 * dt; P.vel.z *= 1 - 2 * dt;
    } else {
      if (!onGround) P.vel.y -= GRAV * dt * (P.vel.y < 0 ? 1.15 : 1);
      if (ud && !onGround) P.vel.y += ud.s * 0.5 * dt;
      if (P.vel.y < -42) P.vel.y = -42;
      if (!onGround) { const wnd = windAt(G, P.pos); P.vel.x += wnd.x * dt * 0.4; P.vel.z += wnd.z * dt * 0.4; }
      if (P.mode === 'swim') P.mode = 'air';
    }
  }
  if (P.groundBody && P.mode !== 'climb' && G.bodies.includes(P.groundBody.b)) { const gb = P.groundBody.b; const bv = velAt(gb, vsub(P.pos, gb.pos)); P.pos = vadd(P.pos, vmul(V(bv.x, Math.max(0, bv.y), bv.z), dt)); }
  const prevVy = P.vel.y;
  P.pos = vadd(P.pos, vmul(P.vel, dt));
  const col = playerCollide(G, P);
  const was = P.grounded;
  P.grounded = !!col.ground && P.mode !== 'climb' && prevVy <= 0.6;
  P.groundBody = col.gBody;
  if (P.grounded) {
    if (!was) emit(G, 'land', { pos: vcopy(P.pos), v: -prevVy });
    if (P.vel.y < 0) P.vel.y = 0;
    P.coyote = 0.12; P.mode = 'walk';
    if (col.ground === 'island' || col.ground === 'box') { if (!inShrine(G, P.pos) || true) P.safe = vcopy(P.pos); }
  } else if (P.mode === 'walk') P.mode = 'air';
  if (col.wall && col.wall.climb && P.mode !== 'climb' && P.mode !== 'swim' && !P.exhausted && P.stamina > 1) {
    const push = -vdot(wish, col.wall.n);
    if (push > 0.55 && ml > 0.3 && P.pos.y < col.wall.top - 0.9) { P.mode = 'climb'; P.wallN = col.wall.n; P.vel = V(); P.grounded = false; emit(G, 'sfx', { s: 'grabwall' }); }
  }
  if (P.grounded && col.gn && col.gn.y < 0.6 && ml > 0.3 && P.mode !== 'climb') {
    const nh = vnorm(V(col.gn.x, 0, col.gn.z)); if (-vdot(wish, nh) > 0.5 && !P.exhausted && P.stamina > 1) { P.mode = 'climb'; P.wallN = nh; P.grounded = false; P.slopeClimb = true; }
  }
  if (P.grounded && col.gn && col.gn.y < 0.6 && P.mode !== 'climb') { const nh = vnorm(V(col.gn.x, 0, col.gn.z)); P.vel.x += nh.x * 12 * dt; P.vel.z += nh.z * 12 * dt; }
  if (P.mode === 'climb' && P.wallN && !P.slopeClimb) {
    const top = col.ceiling ? col.ceiling.top : (col.wall && col.wall.climb ? col.wall.top : null);
    if (top != null && top - P.pos.y < (col.ceiling ? 2.7 : 0.8) && mv.z < -0.3) {
      P.pos = vadd(V(P.pos.x, top + 0.05, P.pos.z), vmul(P.wallN, -0.9)); P.vel = V(); P.mode = 'walk'; P.grounded = true; emit(G, 'sfx', { s: 'mantle' }); emit(G, 'mantle', {});
    }
  }
  if (P.mode === 'climb') {
    if (col.wall && col.wall.climb) { P.wallN = col.wall.n; P.slopeClimb = false; }
    else if (P.slopeClimb) { if (col.gn && col.gn.y < 0.6) P.wallN = vnorm(V(col.gn.x, 0, col.gn.z)); else { P.mode = 'walk'; P.slopeClimb = false; } }
    else { P.mode = 'air'; P.vel = vadd(V(0, 6.5, 0), vmul(P.wallN || V(), -2.5)); emit(G, 'sfx', { s: 'mantle' }); }
    if (col.ground && mv.z > 0.3 && !P.slopeClimb) P.mode = 'walk';
  }
  if (!usingStamina) {
    if (P.grounded || P.mode === 'swim') { P.staminaDelay -= dt; if (P.staminaDelay <= 0) P.stamina = Math.min(P.maxStamina, P.stamina + (P.exhausted ? 24 : 42) * dt); }
  } else P.staminaDelay = 0.5;
  if (P.exhausted && P.stamina >= P.maxStamina * 0.99) P.exhausted = false;
  if (P.pos.y < -150) { P.pos = vcopy(P.safe); P.vel = V(); P.mode = 'walk'; hurt(G, 1, true); emit(G, 'respawn', {}); }
}
function hurt(G, n, force) {
  const P = G.player; if (P.inv > 0 && !force) return;
  P.hearts -= n; P.inv = 1.0; emit(G, 'sfx', { s: 'hurt' }); emit(G, 'shake', { a: 0.5 }); emit(G, 'hurt', {});
  if (P.hearts <= 0) { P.hearts = P.maxHearts; const lastT = G.W.towers.filter(t => t.active).pop(); P.pos = lastT ? vadd(lastT.top, V(2.5, 0.1, 0)) : startPos(G); P.vel = V(); P.mode = 'air'; G.helm = null; emit(G, 'toast', { text: 'You fade, then wake in the light.' }); }
}

// ---------- weapon & fusion ----------
function weaponStats(G) {
  const s = { dmg: 1, arc: 1.7, reach: 2.3, kb: 6, elem: false, heavy: false };
  const f = G.weapon.fuse;
  if (f === 'rock') { s.dmg = 3; s.kb = 11; s.heavy = true; }
  if (f === 'leaf') { s.dmg = 1; s.arc = 3.6; s.reach = 3.5; s.kb = 16; }
  if (f === 'crystal') { s.dmg = 2; s.elem = true; s.reach = 2.6; }
  return s;
}
function fuse(G, mat) {
  if (!['rock', 'leaf', 'crystal'].includes(mat)) return false;
  if ((G.inv[mat] || 0) <= 0) { emit(G, 'toast', { text: 'You have no ' + mat + ' to fuse.' }); emit(G, 'sfx', { s: 'deny' }); return false; }
  G.inv[mat]--; G.weapon.fuse = mat;
  G.weapon.maxDur = 22 + { rock: 16, leaf: 8, crystal: 12 }[mat]; G.weapon.dur = G.weapon.maxDur;
  emit(G, 'sfx', { s: 'fuse' }); emit(G, 'fuse', { mat }); emit(G, 'toast', { text: { rock: 'Stone fused: heavy blows that break seals.', leaf: 'Leaf fused: wide, gusting swings.', crystal: 'Crystal fused: crackling shock damage.' }[mat] });
  return true;
}
function wearWeapon(G) {
  const w = G.weapon; w.dur--;
  if (w.dur <= 0) { emit(G, 'sfx', { s: 'break' }); emit(G, 'toast', { text: 'Your staff shattered! You carve a fresh one.' }); w.fuse = null; w.maxDur = 22; w.dur = 22; emit(G, 'weaponbreak', {}); }
}
function attack(G) {
  const P = G.player; if (P.attackCd > 0 || G.helm) return false;
  const s = weaponStats(G);
  P.attackCd = s.heavy ? 0.5 : 0.34; P.attackT = 0.3;
  const fw = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const center = vadd(P.pos, V(0, 0.9, 0));
  const hitTest = (pos, extra = 0) => { const d = vsub(pos, center); const dh = V(d.x, 0, d.z), dist = vlen(dh); if (dist > s.reach + extra || Math.abs(d.y) > 2.2 + extra) return false; if (dist < 0.7) return true; return Math.acos(clamp(vdot(vmul(dh, 1 / dist), fw), -1, 1)) < s.arc / 2; };
  let hit = false;
  emit(G, 'sfx', { s: s.heavy ? 'swingheavy' : 'swing' }); emit(G, 'swing', { fuse: G.weapon.fuse });
  for (const e of G.W.enemies) {
    if (!e.alive || !hitTest(e.pos, 0.4)) continue;
    e.hp -= s.dmg; e.hurt = 0.3; const kd = vnorm(vsub(e.pos, P.pos)); e.vel = vadd(e.vel, V(kd.x * s.kb, 4, kd.z * s.kb)); hit = true;
    emit(G, 'burst', { pos: vadd(e.pos, V(0, 0.6, 0)), kind: s.elem ? 'shock' : 'hit' }); emit(G, 'sfx', { s: 'hit' });
    if (e.hp <= 0) killEnemy(G, e);
  }
  if (s.elem) for (const e of G.W.enemies) if (e.alive && e.hurt <= 0 && vlen(vsub(e.pos, P.pos)) < 4.5) { e.hp -= 1; e.hurt = 0.3; hit = true; emit(G, 'burst', { pos: vadd(e.pos, V(0, 0.6, 0)), kind: 'shock' }); if (e.hp <= 0) killEnemy(G, e); }
  for (const n of G.W.nodes) {
    if (!n.alive || !hitTest(vadd(n.pos, V(0, 0.5, 0)), 0.6)) continue;
    n.alive = false; n.t = 45; const m = { ore: 'rock', bush: 'leaf', crystal: 'crystal' }[n.type]; G.inv[m] += 2; hit = true;
    emit(G, 'burst', { pos: vadd(n.pos, V(0, 0.6, 0)), kind: n.type }); emit(G, 'sfx', { s: 'harvest' }); emit(G, 'toast', { text: '+2 ' + m });
  }
  for (const b of G.bodies) {
    if (b === G.held) continue;
    let cp = null; for (const p of b.parts) { const c = closestOnPart(b, p, center); if (!cp || vlen(vsub(c, center)) < vlen(vsub(cp, center))) cp = c; }
    if (!hitTest(cp, 0.3)) continue;
    wake(b); b.anchor = false;
    applyImpulse(b, vsub(cp, b.pos), vmul(vnorm(V(fw.x, 0.18, fw.z)), (s.heavy ? 11 : 7) * Math.min(b.mass, 3)));
    activate(G, b); hit = true; emit(G, 'burst', { pos: cp, kind: 'hit' }); emit(G, 'sfx', { s: 'thunk' });
  }
  for (const C of G.W.caves) {
    if (C.open) continue; const B = C.seal;
    if (Math.hypot(B.x - P.pos.x, B.z - P.pos.z) < 3.8 && Math.abs(P.pos.y - (B.y - B.hy)) < 3) {
      hit = true;
      if (s.dmg >= 3) { C.open = true; B.gone = true; emit(G, 'sfx', { s: 'rockbreak' }); emit(G, 'burst', { pos: V(B.x, B.y, B.z), kind: 'rubble' }); emit(G, 'shake', { a: 0.7 }); emit(G, 'toast', { text: 'The cracked seal crumbles!' }); }
      else { emit(G, 'toast', { text: 'The seal is cracked but tough. Try a heavier weapon.' }); emit(G, 'sfx', { s: 'clank' }); }
    }
  }
  if (hit) { wearWeapon(G); emit(G, 'shake', { a: s.heavy ? 0.35 : 0.18 }); emit(G, 'hitstop', {}); }
  return hit;
}
function killEnemy(G, e) { e.alive = false; e.respawn = 60; const drop = ['rock', 'leaf', 'crystal'][e.id % 3]; G.inv[drop]++; emit(G, 'toast', { text: 'Chaffling dispersed. +1 ' + drop }); emit(G, 'sfx', { s: 'enemydie' }); emit(G, 'burst', { pos: e.pos, kind: 'poof' }); }

// ---------- interact ----------
function nearestInteract(G) {
  const P = G.player; let best = null, bd = 1e9;
  const consider = (d, o) => { if (d < bd) { bd = d; best = o; } };
  for (const J of G.W.journals) { const d = vlen(vsub(J.pos, P.pos)); if (d < 2.8) consider(d, { kind: 'journal', J, label: 'Read' }); }
  for (const T of G.W.towers) { const d = vlen(vsub(T.top, P.pos)); if (d < 4.5 && !T.active) consider(d, { kind: 'tower', T, label: 'Wake beacon' }); }
  if (!G.helm) for (const b of G.bodies) {
    if (b.held) continue;
    const st = b.parts.find(p => p.type === 'stick');
    if (st) { const d = vlen(vsub(partWorld(b, st).pos, vadd(P.pos, V(0, 0.8, 0)))); if (d < 2.6) consider(d - 0.5, { kind: 'helm', b, label: 'Take helm' }); }
    if (b.parts.some(p => p.type === 'fan' || p.type === 'rocket')) { let d = 1e9; for (const p of b.parts) d = Math.min(d, vlen(vsub(closestOnPart(b, p, vadd(P.pos, V(0, 0.8, 0))), vadd(P.pos, V(0, 0.8, 0))))); if (d < 2.0) consider(d + 0.3, { kind: 'device', b, label: b.parts.some(p => p.on) ? 'Switch off' : 'Switch on' }); }
  }
  return best;
}
function interact(G) {
  const it = nearestInteract(G); if (!it) return null;
  if (it.kind === 'journal') { it.J.read = true; emit(G, 'journal', { title: it.J.title, text: it.J.text }); emit(G, 'sfx', { s: 'page' }); }
  if (it.kind === 'tower') activateTower(G, it.T);
  if (it.kind === 'helm') { G.helm = { body: it.b }; wake(it.b); emit(G, 'sfx', { s: 'helm' }); emit(G, 'toast', { text: 'Move to drive. Jump to let go.' }); }
  if (it.kind === 'device') activate(G, it.b);
  return it.kind;
}
function activateTower(G, T) {
  if (T.active) return;
  T.active = true; for (const r of T.reveal) G.revealed[r] = true;
  emit(G, 'tower', { id: T.id, name: T.name }); emit(G, 'sfx', { s: 'tower' }); emit(G, 'shake', { a: 0.4 });
  if (T.wow && G.sunkenRise === 0) { G.sunkenRise = 0.0001; emit(G, 'wow', {}); }
}

// ---------- world systems ----------
function stepWorld(G, dt) {
  const W = G.W, P = G.player;
  G.t += dt; G.time = (G.time + dt / 720) % 1;
  if (G.sunkenRise > 0 && G.sunkenRise < 1) {
    G.sunkenRise = Math.min(1, G.sunkenRise + dt / 10);
    const k = G.sunkenRise, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const I = W.sunken; const ny = I.y0 + (I.risenY - I.y0) * e; const dy = ny - I.y; I.y = ny;
    for (const c of W.cores) if (c.src === 'sunken') c.pos.y += dy;
    if (G.sunkenRise >= 1) { W.bigDraft.active = true; emit(G, 'sunkenDone', {}); emit(G, 'toast', { text: 'The Sunken Isle has risen! A great updraft roars beside it.' }); }
  }
  for (const C of W.crumbles) {
    if (C.t > 0) { C.t -= dt; if (C.t <= 0) { C.fall = 0.001; C.t = -1; emit(G, 'sfx', { s: 'crumble' }); emit(G, 'burst', { pos: V(C.x, C.y, C.z), kind: 'rubble' }); } }
    if (C.fall > 0) { C.fall += dt; if (C.fall > 4.5) C.fall = 0; }
  }
  for (const c of W.cores) {
    if (c.taken || !coreAvailable(G, c)) continue;
    if (vlen(vsub(c.pos, vadd(P.pos, V(0, 0.9, 0)))) < 1.7) collectCore(G, c);
  }
  for (const r of W.rings) { if (!r.hit && vlen(vsub(V(r.x, r.y, r.z), vadd(P.pos, V(0, 0.9, 0)))) < r.r) { r.hit = true; emit(G, 'sfx', { s: 'ring', n: r.i }); emit(G, 'burst', { pos: V(r.x, r.y, r.z), kind: 'ring' }); if (W.rings.every(q => q.hit)) emit(G, 'toast', { text: 'All six rings! A Core shimmers ahead.' }); } }
  if (W.rings.some(r => r.hit) && !W.rings.every(r => r.hit) && P.grounded) { for (const r of W.rings) r.hit = false; }
  for (const S of W.shrines) if (!S.done && checkShrine(G, S)) { S.done = true; emit(G, 'shrine', { id: S.id, name: S.name, pos: S.altar }); emit(G, 'sfx', { s: 'shrine' }); }
  for (const n of W.nodes) if (!n.alive) { n.t -= dt; if (n.t <= 0) n.alive = true; }
  for (const e of W.enemies) {
    if (!e.alive) { e.respawn -= dt; if (e.respawn <= 0) { e.alive = true; e.hp = e.max; e.pos = vcopy(e.spawn); } continue; }
    const I = W.islands[e.home]; const toP = vsub(P.pos, e.pos); const dist = vlen(toP);
    if (dist > 120) continue;
    e.t += dt; e.hurt -= dt; e.cd -= dt;
    const chase = dist < 11 && Math.abs(toP.y) < 4 && G.ending === 0 && P.mode !== 'helm';
    const dir = chase ? vnorm(V(toP.x, 0, toP.z)) : V(Math.sin(e.t * 0.4 + e.id), 0, Math.cos(e.t * 0.31 + e.id * 2));
    const sp = chase ? 3.3 : 1.1;
    e.vel.x += (dir.x * sp - e.vel.x) * Math.min(1, 4 * dt); e.vel.z += (dir.z * sp - e.vel.z) * Math.min(1, 4 * dt);
    e.vel.y -= GRAV * dt; e.pos = vadd(e.pos, vmul(e.vel, dt));
    const dh = Math.hypot(e.pos.x - I.x, e.pos.z - I.z), lim = I.depths ? 150 : I.r * 0.82;
    if (dh > lim) { const n = vnorm(V(I.x - e.pos.x, 0, I.z - e.pos.z)); e.pos.x += n.x * (dh - lim); e.pos.z += n.z * (dh - lim); }
    const gh = islandTop(I, e.pos.x, e.pos.z); if (e.pos.y < gh) { e.pos.y = gh; e.vel.y = chase && (e.t % 0.9) < dt * 1.5 ? 4 : 0; }
    e.face = Math.atan2(-dir.x, -dir.z);
    if (dist < 1.15 && e.cd <= 0 && G.ending === 0 && !G.helm) { e.cd = 1.3; hurt(G, 1); const kd = vnorm(V(toP.x, 0, toP.z)); P.vel = vadd(P.vel, V(kd.x * 8, 5, kd.z * 8)); }
  }
  P.maxStamina = 100 + Math.floor(coresTaken(G) / 3) * 20;
  if (!G.endingStarted && coresTaken(G) >= coreGoal(G)) { G.endingStarted = true; G.ending = 0.0001; G.helm = null; emit(G, 'ending', {}); emit(G, 'sfx', { s: 'ending' }); }
  if (G.ending > 0 && G.ending < 1) { G.ending = Math.min(1, G.ending + dt / 28); if (G.ending >= 1) emit(G, 'endingDone', {}); }
}
function coreAvailable(G, c) {
  const W = G.W;
  if (c.src === 'shrine') return W.shrines.find(s => 'core-' + s.id === c.id).done;
  if (c.src === 'tower') return W.towers.find(t => 'core-' + t.id === c.id).active;
  if (c.src === 'rings') return W.rings.every(r => r.hit);
  if (c.src === 'sunken') return G.sunkenRise >= 1;
  return true;
}
function collectCore(G, c) {
  if (c.taken) return;
  const before = unlockedParts(G).length;
  c.taken = true; const n = coresTaken(G);
  emit(G, 'core', { id: c.id, pos: c.pos, n, goal: coreGoal(G) }); emit(G, 'sfx', { s: 'core' }); emit(G, 'shake', { a: 0.25 });
  const after = unlockedParts(G);
  if (after.length > before) { const t = after[after.length - 1]; emit(G, 'unlock', { part: t, name: PART_DEFS[t].name }); }
  if (n % 3 === 0) emit(G, 'toast', { text: 'Your breath deepens. Stamina increased!' });
  G.player.maxStamina = 100 + Math.floor(n / 3) * 20; G.player.stamina = G.player.maxStamina; G.player.exhausted = false;
}
function checkShrine(G, S) {
  const P = G.player;
  const onPlate = (pl, minMass) => G.bodies.some(b => !b.held && b.mass >= minMass && b.parts.some(p => { const w = partWorld(b, p).pos; return Math.hypot(w.x - pl.x, w.z - pl.z) < pl.r + 0.5 && w.y < pl.y + 2.2 && w.y > pl.y - 0.5; }));
  switch (S.kind) {
    case 'plate': return onPlate(S.plate, 3);
    case 'bridge': return P.grounded && Math.hypot(P.pos.x - S.target.x, P.pos.z - S.target.z) < 3.6 && Math.abs(P.pos.y - S.target.y) < 1.2;
    case 'stack': return P.grounded && Math.abs(P.pos.z - S.target.z) < 3.1 && Math.abs(P.pos.x - S.target.x) < 7.1 && P.pos.y > S.target.y - 0.2;
    case 'lift': return P.grounded && Math.abs(P.pos.z - S.target.z) < 2.6 && Math.abs(P.pos.x - S.target.x) < 6.1 && P.pos.y > S.target.y - 0.2;
    case 'roll': return G.bodies.some(b => hasPart(b, 'ball') && Math.hypot(b.pos.x - S.ring.x, b.pos.z - S.ring.z) < S.ring.r && b.pos.y < S.ring.y + 1.6);
    case 'bell': return G.bodies.some(b => !b.held && b.parts.some(p => vlen(vsub(partWorld(b, p).pos, S.bell)) < S.bellR + (PART_DEFS[p.type].r || 0.6)));
    case 'rocket': return G.bodies.some(b => !b.held && vlen(vsub(b.pos, S.halo)) < S.haloR + 0.6);
    case 'road': return G.bodies.some(b => b.parts.some(p => p.type === 'urn' && (() => { const w = partWorld(b, p).pos; return Math.hypot(w.x - S.plate.x, w.z - S.plate.z) < S.plate.r + 0.6 && w.y > S.plate.y - 1; })()));
  }
  return false;
}

// ---------- main step ----------
const FIXED = 1 / 60, SUB = 2;
function step(G, inp, dt) {
  G.FIX = FIXED;
  G.acc += Math.min(dt, 0.1);
  let first = true;
  while (G.acc >= FIXED) {
    G.acc -= FIXED;
    const i = first ? inp : Object.assign({}, inp, { jumpPressed: false, dashPressed: false });
    first = false;
    if (G.held) updateHeldTarget(G);
    for (let s = 0; s < SUB; s++) stepBodies(G, FIXED / SUB);
    stepPlayer(G, i, FIXED);
    stepWorld(G, FIXED);
  }
}
function updateHeldTarget(G) {
  const P = G.player, f = G.cam.fwd, fh = vnorm(V(f.x, 0, f.z));
  const lift = clamp((G.heldLift || 0) + (f.y + 0.25) * G.heldDist, -3, 4.5);
  G.heldTarget = vadd(P.pos, V(fh.x * G.heldDist, 1.2 + lift, fh.z * G.heldDist));
  if (vlen(vsub(G.held.pos, P.pos)) > FORGE_RANGE + 8) releaseHeld(G);
}

// ---------- save ----------
function serialize(G) {
  const P = G.player;
  return JSON.stringify({ v: 1, cores: G.W.cores.filter(c => c.taken).map(c => c.id), shrines: G.W.shrines.filter(s => s.done).map(s => s.id), towers: G.W.towers.filter(t => t.active).map(t => t.id),
    caves: G.W.caves.filter(c => c.open).map(c => c.id), journals: G.W.journals.map(j => j.read ? 1 : 0), inv: G.inv, weapon: G.weapon, sunken: G.sunkenRise > 0 ? 1 : 0, ending: G.endingStarted ? 1 : 0,
    pos: [P.safe.x, P.safe.y, P.safe.z], hearts: P.hearts, time: G.time, revealed: G.revealed });
}
function deserialize(G, json) {
  let s; try { s = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return false; }
  if (!s || s.v !== 1) return false;
  const W = G.W;
  for (const c of W.cores) c.taken = (s.cores || []).includes(c.id);
  for (const S of W.shrines) S.done = (s.shrines || []).includes(S.id);
  for (const T of W.towers) T.active = (s.towers || []).includes(T.id);
  for (const C of W.caves) if ((s.caves || []).includes(C.id)) { C.open = true; C.seal.gone = true; }
  (s.journals || []).forEach((r, i) => { if (W.journals[i]) W.journals[i].read = !!r; });
  Object.assign(G.inv, s.inv || {}); Object.assign(G.weapon, s.weapon || {});
  if (s.sunken) { const I = W.sunken; I.y = I.risenY; for (const c of W.cores) if (c.src === 'sunken') c.pos.y = islandTop(I, c.pos.x, c.pos.z) + 1.2; G.sunkenRise = 1; W.bigDraft.active = true; }
  G.endingStarted = !!s.ending; G.revealed = s.revealed || {};
  if (s.pos && isFinite(s.pos[1])) { G.player.pos = V(s.pos[0], s.pos[1] + 0.1, s.pos[2]); G.player.safe = vcopy(G.player.pos); }
  G.player.hearts = s.hearts || 5; if (s.time != null) G.time = s.time;
  G.player.maxStamina = 100 + Math.floor(coresTaken(G) / 3) * 20; G.player.stamina = G.player.maxStamina;
  return true;
}

const API = { V, Q, vadd, vsub, vmul, vdot, vcross, vlen, vnorm, qmul, qrot, qaxis, qconj, qslerp, noise2, fbm, rng, clamp,
  PART_DEFS, BUILD_PARTS, BIOMES, GRAV, FIXED, FORGE_RANGE, createGame, step, stepBodies, stepPlayer, stepWorld, createBody, weld, detach, partWorld, recomputeBody,
  grab, releaseHeld, rotateHeld, attach, attachCandidate, detachSel, spawnPart, activate, attack, fuse, interact, nearestInteract, activateTower, collectCore, checkShrine, coreAvailable,
  serialize, deserialize, coresTaken, coreGoal, unlockedParts, islandTop, islandRadius, groundAt, waterAt, inUpdraft, inShrine, weaponStats, hasPart, applyImpulse, wake, hurt, updateHeldTarget, velAt, closestOnPart, driveDir };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.AE = API;
})(typeof window !== 'undefined' ? window : globalThis);
