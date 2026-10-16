/* Pocket Weather: the toy-diorama art kit. Toon materials with a soft rim light, rounded "cake slice" tiles,
   and every little model in the game, all built from primitives at runtime (no asset files). */
import * as THREE from './vendor/three.module.js';

export const PALETTES = [
  { name: 'meadow', ground: '#8fd46b', groundDark: '#79bf5a', side: '#d9a06a', side2: '#b97c4c', rock: '#a08a7a', water: '#6fd0f0', deep: '#3fa9d8',
    skyTop: '#7ec4ff', skyBot: '#ffe6c9', tree: '#69c46a', tree2: '#4fa95a', trunk: '#9a6a44', accent: '#ff8fb1', fog: '#d8ecff' },
  { name: 'bazaar', ground: '#f6d995', groundDark: '#e9c47a', side: '#f0b47c', side2: '#d68f5a', rock: '#c98d6b', water: '#5fe0d6', deep: '#2fb8c4',
    skyTop: '#ffb4a2', skyBot: '#ffe9b8', tree: '#7fcf6a', tree2: '#5fb45a', trunk: '#b07a4a', accent: '#ff6f91', fog: '#ffe2c8' },
  { name: 'frost', ground: '#f6f9ff', groundDark: '#e3ecfb', side: '#a9bde6', side2: '#8aa2d6', rock: '#8c9cc6', water: '#7ad3f5', deep: '#4aa7e0',
    skyTop: '#a9b6ff', skyBot: '#fbe8ff', tree: '#5fae8e', tree2: '#4a967a', trunk: '#8a6a5a', accent: '#8fd3ff', fog: '#e8e8ff' },
  { name: 'storm', ground: '#c4cddf', groundDark: '#adb8cf', side: '#7d88a8', side2: '#646f8f', rock: '#5e6684', water: '#69d6e8', deep: '#3a9fc4',
    skyTop: '#5b5fae', skyBot: '#d6b3ee', tree: '#8fcf7a', tree2: '#6cb35f', trunk: '#7a5a4a', accent: '#ffd25e', fog: '#b9b2e6' },
  { name: 'garden', ground: '#a3e48e', groundDark: '#8bd479', side: '#e6b0d8', side2: '#c98fbe', rock: '#b89ad0', water: '#7fe0f5', deep: '#4fb8e8',
    skyTop: '#9fd8ff', skyBot: '#ffd8ef', tree: '#ff9ec7', tree2: '#ff7fb1', trunk: '#a77a5a', accent: '#ffd35c', fog: '#ffe8f6' }
];

export const HSTEP = 0.5;          // height of one level step
export const TOP = 0.0;            // world y of a height-0 tile's walking surface

let gradientMap = null;
function gradient() {
  if (gradientMap) return gradientMap;
  const steps = [120, 175, 220, 255], data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; });
  gradientMap = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false; gradientMap.needsUpdate = true;
  return gradientMap;
}

export const shared = { time: { value: 0 }, wind: { value: 0 } };

const matCache = new Map();
/* Toon material with a soft rim light. opts: rim (0..1), emissive, opacity, sway (grass-like vertex wind), flat */
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: gradient() });
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity || 1; }
  if (opts.opacity !== undefined && opts.opacity < 1) { m.transparent = true; m.opacity = opts.opacity; m.depthWrite = !!opts.depthWrite; }
  if (opts.side) m.side = THREE.DoubleSide;
  if (opts.flat) m.flatShading = true;
  const rim = opts.rim === undefined ? 0.35 : opts.rim, sway = opts.sway || 0;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = shared.time; sh.uniforms.uWind = shared.wind;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader;
    if (sway) {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 wp = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float k = max(position.y, 0.0) * ${sway.toFixed(3)};
          float s = sin(uTime * 2.2 + wp.x * 1.7 + wp.z * 1.3) + 0.5 * sin(uTime * 3.7 + wp.z * 2.1);
          transformed.x += k * (s * 0.6 + uWind * 3.0);
          transformed.z += k * cos(uTime * 1.9 + wp.x * 1.1) * 0.4; }`);
    }
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      { float rimF = 1.0 - max(dot(normalize(vViewPosition), normal), 0.0);
        outgoingLight += vec3(1.0, 0.96, 0.9) * pow(rimF, 2.6) * ${rim.toFixed(3)}; }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'pw' + rim + '_' + sway;
  matCache.set(key, m);
  return m;
}
export function basic(color, opts = {}) {
  const key = 'b' + color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opts.opacity !== undefined, opacity: opts.opacity === undefined ? 1 : opts.opacity,
    depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : opts.opacity === undefined, blending: opts.add ? THREE.AdditiveBlending : THREE.NormalBlending, side: opts.side ? THREE.DoubleSide : THREE.FrontSide });
  if (opts.fog === false) m.fog = false;
  matCache.set(key, m);
  return m;
}

const geoCache = new Map();
function cached(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }

// A rounded slab, base at y=0, centred in x/z.
export function slab(w, d, h, r) {
  return cached(`slab${w}_${d}_${h}_${r}`, () => {
    const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
    r = Math.min(r, w / 2 - 0.001, d / 2 - 0.001);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const bev = Math.min(0.04, h * 0.3);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 4 });
    g.rotateX(-Math.PI / 2); g.translate(0, bev, 0);
    g.computeVertexNormals();
    return g;
  });
}
export const G = {
  sphere: (seg = 14) => cached('sph' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(6, (seg * 0.7) | 0))),
  ico: () => cached('ico', () => new THREE.IcosahedronGeometry(1, 0)),
  ico1: () => cached('ico1', () => new THREE.IcosahedronGeometry(1, 1)),
  cyl: (seg = 12) => cached('cyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg)),
  cone: (seg = 10) => cached('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg)),
  box: () => cached('box', () => new THREE.BoxGeometry(1, 1, 1)),
  torus: () => cached('torus', () => new THREE.TorusGeometry(1, 0.28, 8, 18)),
  plane: () => cached('plane', () => new THREE.PlaneGeometry(1, 1)),
  disc: (seg = 20) => cached('disc' + seg, () => { const g = new THREE.CircleGeometry(1, seg); g.rotateX(-Math.PI / 2); return g; }),
  ring: () => cached('ring', () => { const g = new THREE.RingGeometry(0.8, 1, 24); g.rotateX(-Math.PI / 2); return g; })
};

export function mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  return m;
}
function shadowed(o, cast = true) { o.traverse(c => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = true; } }); return o; }

// ───────────────────────── tiles ─────────────────────────
// Earth column under a tile, from the island floor up to the tile's top.
export function column(P, topY, seed) {
  const g = new THREE.Group(), h = topY + 0.9;
  const side = mesh(slab(0.95, 0.95, h - 0.12, 0.14), toon((seed % 3 === 0) ? P.side2 : P.side, { rim: 0.2 }), 0, -0.9);
  side.receiveShadow = true; g.add(side);
  // a band of darker strata for that layered-cake look
  const band = mesh(slab(0.965, 0.965, 0.1, 0.14), toon(P.side2, { rim: 0.15 }), 0, -0.55 + (seed % 5) * 0.03);
  g.add(band);
  return g;
}
export function cap(color, w = 1.0, h = 0.16) { const m = mesh(slab(w, w, h, 0.2), toon(color, { rim: 0.3 }), 0, -h + 0.02); m.receiveShadow = true; return m; }

export function underRocks(P, cells, rand) {
  // inverted rock cones hanging under the island, merged into one mesh
  const geos = [];
  const base = new THREE.ConeGeometry(0.5, 1, 6); base.rotateX(Math.PI);
  cells.forEach(([x, z]) => {
    const n = 1 + (rand() * 2 | 0);
    for (let k = 0; k < n; k++) {
      const g = base.clone(), h = 0.5 + rand() * 1.4, r = 0.55 + rand() * 0.35;
      g.scale(r, h, r); g.rotateY(rand() * 3);
      g.translate(x + (rand() - 0.5) * 0.4, -0.9 - h / 2, z + (rand() - 0.5) * 0.4);
      geos.push(g);
    }
  });
  const merged = mergeGeos(geos);
  const m = new THREE.Mesh(merged, toon(P.rock, { rim: 0.4, flat: true }));
  return m;
}
export function mergeGeos(geos) {
  let count = 0; geos.forEach(g => { if (g.index) g.copy(g.toNonIndexed()); count += g.attributes.position.count; });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3); let o = 0;
  geos.forEach(g => { pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeVertexNormals();
  return out;
}

// little decorations on grass: tufts and flowers that sway
export function grassDecor(P, rand, dense) {
  const g = new THREE.Group(), n = dense ? 4 : 2 + (rand() * 2 | 0);
  const tuft = toon(P.groundDark, { sway: 0.5, rim: 0.2 });
  for (let i = 0; i < n; i++) {
    const x = (rand() - 0.5) * 0.7, z = (rand() - 0.5) * 0.7;
    if (rand() < 0.65) {
      const t = new THREE.Group();
      for (let k = 0; k < 3; k++) { const b = mesh(G.cone(4), tuft, (k - 1) * 0.035, 0.05, 0, 0.025, 0.12 + rand() * 0.06, 0.025); b.rotation.z = (k - 1) * 0.35; t.add(b); }
      t.position.set(x, 0, z); g.add(t);
    } else {
      const f = new THREE.Group();
      f.add(mesh(G.cyl(4), toon(P.groundDark, { sway: 0.6 }), 0, 0.07, 0, 0.012, 0.14, 0.012));
      const col = [P.accent, '#ffffff', '#ffd35c', '#b9a3ff'][rand() * 4 | 0];
      f.add(mesh(G.sphere(8), toon(col, { sway: 0.6, rim: 0.5 }), 0, 0.15, 0, 0.045, 0.03, 0.045));
      f.add(mesh(G.sphere(6), toon('#ffd35c', { sway: 0.6 }), 0, 0.165, 0, 0.018));
      f.position.set(x, 0, z); g.add(f);
    }
  }
  return g;
}

export function tree(P, world, rand) {
  const g = new THREE.Group();
  if (world === 1) {        // palm + pot
    const trunk = toon(P.trunk, { sway: 0.15 });
    for (let i = 0; i < 5; i++) g.add(mesh(G.cyl(6), trunk, Math.sin(i * 0.5) * 0.04 * i, 0.12 + i * 0.16, 0, 0.07 - i * 0.006, 0.17, 0.07 - i * 0.006));
    const leaf = toon(P.tree, { sway: 0.4, rim: 0.4 });
    for (let k = 0; k < 6; k++) {
      const l = mesh(G.sphere(8), leaf, 0, 0, 0, 0.32, 0.04, 0.1); const a = k / 6 * Math.PI * 2;
      l.position.set(Math.cos(a) * 0.22 + 0.16, 0.9, Math.sin(a) * 0.22); l.rotation.y = -a; l.rotation.z = -0.35; g.add(l);
    }
    g.add(mesh(G.sphere(8), toon('#c98d4a'), 0.16, 0.86, 0.04, 0.06));
  } else if (world === 2) { // snowy pine
    const pine = toon(P.tree, { rim: 0.4, sway: 0.08 }), snow = toon('#ffffff', { rim: 0.5, sway: 0.08 });
    g.add(mesh(G.cyl(6), toon(P.trunk), 0, 0.08, 0, 0.06, 0.16, 0.06));
    [[0.36, 0.25, 0.36], [0.28, 0.5, 0.3], [0.19, 0.72, 0.26]].forEach(([r, y, h]) => {
      g.add(mesh(G.cone(8), pine, 0, y + h / 2, 0, r, h, r));
      g.add(mesh(G.cone(8), snow, 0, y + h * 0.78, 0, r * 0.62, h * 0.45, r * 0.62));
    });
  } else if (world === 3) { // chimney pipe with a brass band and a puff of steam
    const pipe = toon('#8e98b8', { rim: 0.5 }), brass = toon('#e8b75a', { rim: 0.6 });
    g.add(mesh(G.cyl(12), pipe, 0, 0.45, 0, 0.18, 0.9, 0.18));
    g.add(mesh(G.cyl(12), brass, 0, 0.3, 0, 0.2, 0.06, 0.2));
    g.add(mesh(G.cyl(12), brass, 0, 0.88, 0, 0.21, 0.08, 0.21));
    const puff = mesh(G.sphere(10), toon('#ffffff', { rim: 0.3, opacity: 0.85 }), 0, 1.05, 0, 0.14);
    puff.userData.update = (t) => { const k = (t * 0.6) % 1; puff.position.y = 1.0 + k * 0.5; puff.scale.setScalar(0.08 + k * 0.18); puff.material.opacity = 0.9 * (1 - k); };
    g.add(puff);
  } else {                  // round lollipop tree (meadow + garden)
    g.add(mesh(G.cyl(6), toon(P.trunk), 0, 0.2, 0, 0.06, 0.4, 0.06));
    const c = toon(rand() < 0.5 ? P.tree : P.tree2, { rim: 0.45, sway: 0.12 });
    g.add(mesh(G.sphere(14), c, 0, 0.62, 0, 0.32, 0.3, 0.32));
    g.add(mesh(G.sphere(12), c, 0.13, 0.5, 0.12, 0.2));
    g.add(mesh(G.sphere(12), c, -0.15, 0.52, -0.06, 0.18));
    if (world === 4 || rand() < 0.4) for (let k = 0; k < 4; k++) g.add(mesh(G.sphere(6), toon(world === 4 ? '#ffffff' : '#ff6f6f'), Math.cos(k * 1.7) * 0.27, 0.6 + Math.sin(k * 2.3) * 0.1, Math.sin(k * 1.7) * 0.27, 0.04));
  }
  g.rotation.y = rand() * Math.PI * 2;
  const s = 0.9 + rand() * 0.2; g.scale.set(s, s, s);
  return shadowed(g);
}

export function sunflower(open) {
  const g = new THREE.Group();
  const stem = toon('#5fb84f', { sway: 0.15 });
  g.add(mesh(G.cyl(6), stem, 0, 0.3, 0, 0.035, 0.6, 0.035));
  const leafM = toon('#6fcf5f', { sway: 0.2 });
  const l1 = mesh(G.sphere(8), leafM, 0.1, 0.25, 0, 0.12, 0.025, 0.06); l1.rotation.z = 0.4; g.add(l1);
  const l2 = mesh(G.sphere(8), leafM, -0.1, 0.38, 0, 0.12, 0.025, 0.06); l2.rotation.z = -0.4; g.add(l2);
  const head = new THREE.Group(); head.position.set(0, 0.66, 0);
  const petals = new THREE.Group();
  const pm = toon('#ffd23f', { rim: 0.5 });
  for (let k = 0; k < 12; k++) { const p = mesh(G.sphere(8), pm, 0, 0, 0, 0.05, 0.11, 0.025); const a = k / 12 * Math.PI * 2; p.position.set(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0); p.rotation.z = a - Math.PI / 2; petals.add(p); }
  head.add(petals);
  head.add(mesh(G.sphere(12), toon('#8a5a2b', { rim: 0.3 }), 0, 0, 0.01, 0.11, 0.11, 0.05));
  // a sleepy or happy face
  const eyeM = basic('#2a1a10');
  const e1 = mesh(G.sphere(6), eyeM, -0.04, 0.02, 0.06, 0.018, open ? 0.026 : 0.006, 0.01), e2 = e1.clone(); e2.position.x = 0.04;
  head.add(e1, e2);
  const smile = mesh(G.torus(), eyeM, 0, -0.025, 0.06, 0.03, 0.03, 0.03); smile.rotation.z = Math.PI; smile.scale.set(0.028, 0.028, 0.012); head.add(smile);
  if (!open) { petals.scale.set(0.55, 0.55, 1); head.rotation.x = 0.7; } else { head.rotation.x = -0.25; }
  g.add(head);
  g.userData.head = head; g.userData.petals = petals;
  g.userData.update = (t) => { head.rotation.z = Math.sin(t * 1.4) * 0.08; };
  return shadowed(g);
}

export function gate(open) {
  const g = new THREE.Group(), wood = toon('#e9a86a', { rim: 0.35 }), dark = toon('#b9774a');
  [-0.42, 0.42].forEach(x => { g.add(mesh(G.cyl(8), dark, x, 0.3, 0, 0.06, 0.6, 0.06)); g.add(mesh(G.sphere(8), toon('#ff8fb1'), x, 0.63, 0, 0.07)); });
  const doors = [];
  [-1, 1].forEach(s => {
    const hinge = new THREE.Group(); hinge.position.set(s * 0.38, 0, 0);
    const door = new THREE.Group();
    for (let k = 0; k < 3; k++) door.add(mesh(G.box(), wood, -s * (0.06 + k * 0.12), 0.27 + (k === 1 ? 0.03 : 0), 0, 0.09, 0.42 + (k === 1 ? 0.06 : 0), 0.05));
    door.add(mesh(G.box(), dark, -s * 0.18, 0.18, 0.02, 0.36, 0.05, 0.03));
    door.add(mesh(G.box(), dark, -s * 0.18, 0.38, 0.02, 0.36, 0.05, 0.03));
    hinge.add(door); g.add(hinge); doors.push({ hinge, s });
  });
  g.userData.doors = doors;
  g.userData.setOpen = (k) => doors.forEach(d => { d.hinge.rotation.y = d.s * k * 1.7; });
  g.userData.setOpen(open ? 1 : 0);
  return shadowed(g);
}

export function windmill(P) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(8), toon('#fff3e0', { rim: 0.4 }), 0, 0.35, 0, 0.2, 0.7, 0.2));
  g.add(mesh(G.cone(8), toon(P.accent, { rim: 0.4 }), 0, 0.82, 0, 0.27, 0.28, 0.27));
  g.add(mesh(G.sphere(8), basic('#6b4a3a'), 0, 0.2, 0.19, 0.06, 0.1, 0.03));
  const hub = new THREE.Group(); hub.position.set(0, 0.6, 0.24);
  const sail = toon('#ffffff', { rim: 0.5, side: true });
  for (let k = 0; k < 4; k++) { const b = new THREE.Group(); b.rotation.z = k * Math.PI / 2; b.add(mesh(G.box(), toon('#b9774a'), 0, 0.22, 0, 0.03, 0.44, 0.02)); b.add(mesh(G.box(), sail, 0.06, 0.26, 0, 0.11, 0.32, 0.01)); hub.add(b); }
  hub.add(mesh(G.sphere(8), toon('#ffd35c'), 0, 0, 0.02, 0.05));
  g.add(hub);
  g.userData.spin = 0.4;
  g.userData.update = (t, dt) => { hub.rotation.z -= dt * g.userData.spin; g.userData.spin += (0.4 - g.userData.spin) * Math.min(1, dt * 0.8); };
  return shadowed(g);
}

export function liftTop(P) {
  const g = new THREE.Group();
  g.add(mesh(slab(0.86, 0.86, 0.14, 0.12), toon('#ffd35c', { rim: 0.4 }), 0, -0.12));
  g.add(mesh(G.box(), toon('#e9a86a'), 0, -0.02, 0, 0.6, 0.02, 0.08));
  g.add(mesh(G.box(), toon('#e9a86a'), 0, -0.02, 0, 0.08, 0.02, 0.6));
  return shadowed(g);
}

export function coil(on) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(12), toon('#5d6788', { rim: 0.4 }), 0, 0.08, 0, 0.3, 0.16, 0.3));
  const copper = toon(on ? '#ffcf6b' : '#d98a4e', { rim: 0.7, emissive: on ? '#ff9d2e' : '#000000', emissiveIntensity: on ? 0.6 : 0 });
  for (let k = 0; k < 5; k++) { const r = mesh(G.torus(), copper, 0, 0.22 + k * 0.1, 0, 0.17, 0.17, 0.17); r.rotation.x = Math.PI / 2; g.add(r); }
  g.add(mesh(G.cyl(8), toon('#8e98b8'), 0, 0.42, 0, 0.1, 0.62, 0.1));
  const ball = mesh(G.sphere(12), on ? basic('#fff6b0') : toon('#2d2f45', { rim: 0.6 }), 0, 0.8, 0, 0.11);
  g.add(ball);
  g.userData.update = on ? (t) => { ball.scale.setScalar(0.11 + Math.sin(t * 12) * 0.015); } : null;
  return shadowed(g);
}

export function drawbridge(ext) {
  const g = new THREE.Group(), wood = toon('#d99a5e', { rim: 0.35 });
  const plank = new THREE.Group();
  for (let k = 0; k < 5; k++) plank.add(mesh(G.box(), wood, 0, 0, -0.4 + k * 0.2, 0.92, 0.07, 0.17));
  plank.add(mesh(G.box(), toon('#8e98b8'), -0.42, 0.05, 0, 0.05, 0.05, 0.95));
  plank.add(mesh(G.box(), toon('#8e98b8'), 0.42, 0.05, 0, 0.05, 0.05, 0.95));
  g.add(plank);
  g.userData.plank = plank;
  g.userData.set = (k) => { plank.position.y = -0.04 - (1 - k) * 0.6; plank.scale.set(0.3 + 0.7 * k, 1, 0.3 + 0.7 * k); plank.rotation.z = (1 - k) * 0.5; plank.visible = k > 0.02; };
  g.userData.set(ext ? 1 : 0);
  return shadowed(g);
}

export function rock(P) {
  const g = new THREE.Group(), m = toon(P.rock, { rim: 0.4, flat: true });
  g.add(mesh(G.ico1(), m, 0, 0.3, 0, 0.36, 0.32, 0.34));
  g.add(mesh(G.ico(), m, 0.22, 0.14, 0.18, 0.15));
  g.add(mesh(G.sphere(6), toon('#ffffff', { opacity: 0.6 }), -0.1, 0.5, 0.2, 0.05));
  return shadowed(g);
}
export function rubble(P, rand) {
  const g = new THREE.Group(), m = toon(P.rock, { flat: true });
  for (let k = 0; k < 5; k++) g.add(mesh(G.ico(), m, (rand() - 0.5) * 0.7, 0.04, (rand() - 0.5) * 0.7, 0.06 + rand() * 0.06));
  return shadowed(g, false);
}
export function bush() {
  const g = new THREE.Group(), m = toon('#6a4d8c', { rim: 0.5, flat: true }), thorn = toon('#e8d6ff');
  [[0, 0.22, 0, 0.3], [0.2, 0.16, 0.1, 0.2], [-0.2, 0.15, -0.08, 0.22], [0.05, 0.38, -0.1, 0.18]].forEach(([x, y, z, r]) => g.add(mesh(G.ico1(), m, x, y, z, r)));
  for (let k = 0; k < 10; k++) { const a = k * 2.4, t = mesh(G.cone(4), thorn, Math.cos(a) * 0.3, 0.2 + (k % 3) * 0.1, Math.sin(a) * 0.3, 0.025, 0.1, 0.025); t.rotation.z = -Math.cos(a) * 1.3; t.rotation.x = Math.sin(a) * 1.3; g.add(t); }
  return shadowed(g);
}
export function iceBlock() {
  const g = new THREE.Group();
  g.add(mesh(slab(0.74, 0.74, 0.66, 0.1), toon('#bfeeff', { rim: 0.9, opacity: 0.82, depthWrite: true }), 0, 0));
  g.add(mesh(G.box(), basic('#ffffff', { opacity: 0.7 }), -0.2, 0.45, 0.375, 0.06, 0.25, 0.01));
  g.add(mesh(G.box(), basic('#ffffff', { opacity: 0.5 }), -0.1, 0.5, 0.375, 0.03, 0.15, 0.01));
  return shadowed(g);
}
export function fire() {
  const g = new THREE.Group(), cols = ['#ff5a3c', '#ff9a3c', '#ffe066'];
  const fl = [];
  cols.forEach((c, i) => { const f = mesh(G.cone(7), basic(c, { opacity: 0.92 }), 0, 0, 0, 0.28 - i * 0.07, 0.6 - i * 0.14, 0.28 - i * 0.07); f.position.y = (0.6 - i * 0.14) / 2; g.add(f); fl.push(f); });
  for (let k = 0; k < 3; k++) { const _m = mesh(G.cyl(5), toon('#7a4a2a'), 0, 0.04, 0, 0.04, 0.5, 0.04); _m.rotation.set(Math.PI / 2, k, 0); g.add(_m); }
  g.userData.update = (t) => fl.forEach((f, i) => { const s = 1 + Math.sin(t * (9 + i * 3) + i) * 0.12; f.scale.y = (0.6 - i * 0.14) * s; f.position.y = f.scale.y / 2; f.rotation.y = t * (1 + i); });
  g.userData.light = true;
  return g;
}
export function mushroom(grown) {
  const g = new THREE.Group();
  if (!grown) { // a tiny spotted bump: a spore waiting for rain
    g.add(mesh(G.sphere(10), toon('#ffb3c7', { rim: 0.5 }), 0, 0.02, 0, 0.12, 0.08, 0.12));
    g.add(mesh(G.sphere(6), toon('#ffffff'), 0.04, 0.08, 0.02, 0.025));
    return shadowed(g);
  }
  g.add(mesh(G.cyl(10), toon('#fff3e0', { rim: 0.4 }), 0, 0.15, 0, 0.13, 0.3, 0.13));
  const capM = mesh(G.sphere(16), toon('#ff6f8a', { rim: 0.5 }), 0, 0.3, 0, 0.42, 0.24, 0.42);
  g.add(capM);
  [[0.2, 0.42, 0.18], [-0.22, 0.4, 0.1], [0.02, 0.5, -0.2], [-0.05, 0.53, 0.12], [0.26, 0.38, -0.16]].forEach(([x, y, z]) => g.add(mesh(G.sphere(8), toon('#ffffff'), x, y, z, 0.06, 0.035, 0.06)));
  g.userData.cap = capM;
  return shadowed(g);
}
export function sproutPod(grown) {
  const g = new THREE.Group();
  if (grown) { // vine bridge
    const vine = toon('#5fbf4f', { rim: 0.4 }), leaf = toon('#8be06a', { sway: 0.4 });
    for (let k = 0; k < 3; k++) { const v = mesh(G.cyl(6), vine, 0, -0.05, (k - 1) * 0.22, 0.06, 1.0, 0.06); v.rotation.z = Math.PI / 2; g.add(v); }
    for (let k = 0; k < 6; k++) { const v = mesh(G.cyl(5), vine, -0.45 + k * 0.18, -0.03, 0, 0.035, 0.6, 0.035); v.rotation.x = Math.PI / 2; g.add(v); }
    for (let k = 0; k < 6; k++) g.add(mesh(G.sphere(6), leaf, -0.4 + k * 0.16, 0.02, (k % 2 ? 0.3 : -0.3), 0.08, 0.02, 0.05));
    g.add(mesh(G.sphere(8), toon('#ff8fb1'), 0.3, 0.04, 0.32, 0.05));
    return shadowed(g);
  }
  // a little floating clump of earth with a sprout, waiting for rain
  g.add(mesh(G.ico1(), toon('#c98e5b', { flat: true }), 0, -0.2, 0, 0.18, 0.14, 0.18));
  const st = new THREE.Group(); st.position.y = -0.08;
  st.add(mesh(G.cyl(5), toon('#5fbf4f', { sway: 0.8 }), 0, 0.06, 0, 0.015, 0.12, 0.015));
  const l1 = mesh(G.sphere(8), toon('#8be06a', { sway: 0.8 }), 0.05, 0.12, 0, 0.06, 0.015, 0.03); l1.rotation.z = 0.4; st.add(l1);
  const l2 = mesh(G.sphere(8), toon('#8be06a', { sway: 0.8 }), -0.05, 0.12, 0, 0.06, 0.015, 0.03); l2.rotation.z = -0.4; st.add(l2);
  g.add(st);
  g.userData.update = (t) => { g.position.y = Math.sin(t * 1.6 + g.id) * 0.03; };
  return shadowed(g);
}
export function water(P, h = 0.9, lily = false, rand = Math.random) {
  const g = new THREE.Group();
  const w = mesh(G.box(), toon(P.water, { rim: 0.6, opacity: 0.82, depthWrite: true }), 0, -0.07 - h / 2, 0, 1.0, h, 1.0);
  g.add(w);
  const shine = mesh(G.disc(14), basic('#ffffff', { opacity: 0.35 }), (rand() - 0.5) * 0.4, -0.065, (rand() - 0.5) * 0.4, 0.12, 1, 0.05);
  g.add(shine);
  g.userData.update = (t) => { shine.position.y = -0.065 + Math.sin(t * 2 + g.id) * 0.004; shine.material.opacity = 0.25 + Math.sin(t * 1.5 + g.id) * 0.1; };
  if (lily) g.add(lilyPads(rand));
  return g;
}
export function lilyPads(rand = Math.random) {
  const g = new THREE.Group(), m = toon('#5fcf6a', { rim: 0.4 });
  const big = mesh(G.cyl(18), m, 0, -0.05, 0, 0.36, 0.03, 0.36); g.add(big);
  const notch = mesh(G.box(), toon('#3fa9d8'), 0.22, -0.05, 0, 0.3, 0.035, 0.05); notch.rotation.y = 0.3; g.add(notch);
  g.add(mesh(G.cyl(12), m, 0.28, -0.05, 0.3, 0.13, 0.03, 0.13));
  if (rand() < 0.7) { const fl = new THREE.Group(); fl.position.set(-0.12, -0.02, 0.15);
    for (let k = 0; k < 6; k++) { const p = mesh(G.sphere(6), toon('#ffb3d1'), Math.cos(k) * 0.04, 0.02, Math.sin(k) * 0.04, 0.04, 0.025, 0.02); p.rotation.y = -k; fl.add(p); }
    fl.add(mesh(G.sphere(6), toon('#ffd35c'), 0, 0.035, 0, 0.025)); g.add(fl); }
  g.userData.update = (t) => { g.position.y = Math.sin(t * 1.3 + g.id) * 0.01; g.rotation.y = Math.sin(t * 0.4 + g.id) * 0.1; };
  return g;
}
export function iceSheet() {
  const g = new THREE.Group();
  g.add(mesh(slab(1.0, 1.0, 0.1, 0.06), toon('#e6f8ff', { rim: 0.8, opacity: 0.9, depthWrite: true }), 0, -0.1));
  { const _m = mesh(G.box(), basic('#ffffff', { opacity: 0.8 }), 0.15, 0.005, -0.1, 0.3, 0.005, 0.02); _m.rotation.y = 0.6; g.add(_m); }
  { const _m = mesh(G.box(), basic('#ffffff', { opacity: 0.8 }), -0.2, 0.005, 0.15, 0.18, 0.005, 0.02); _m.rotation.y = -0.4; g.add(_m); }
  return g;
}
export function basinRim(P) {
  const g = new THREE.Group();
  g.add(mesh(G.box(), toon('#c08a5a', { rim: 0.2 }), 0, -0.25, 0, 1.0, 0.1, 1.0));
  for (let k = 0; k < 4; k++) { const _m = mesh(G.box(), basic('#8d5f3d'), (k - 1.5) * 0.2, -0.195, (k % 2 - 0.5) * 0.3, 0.2, 0.005, 0.02); _m.rotation.y = k; g.add(_m); }
  return g;
}
export function puddle(rand = Math.random) {
  const g = new THREE.Group();
  g.add(mesh(G.disc(18), toon('#8fdcff', { rim: 0.8, opacity: 0.85 }), (rand() - 0.5) * 0.1, 0.006, (rand() - 0.5) * 0.1, 0.36, 1, 0.3));
  g.add(mesh(G.disc(10), basic('#ffffff', { opacity: 0.6 }), 0.1, 0.008, -0.08, 0.06, 1, 0.03));
  return g;
}
export function mudTop(frozen) {
  const g = new THREE.Group();
  g.add(mesh(G.disc(18), toon(frozen ? '#9c8aa8' : '#7a5236', { rim: 0.6 }), 0, 0.006, 0, 0.44, 1, 0.42));
  const bubbles = [];
  for (let k = 0; k < (frozen ? 0 : 3); k++) { const b = mesh(G.sphere(8), toon('#8d6447', { rim: 0.7 }), (k - 1) * 0.2, 0.02, (k % 2) * 0.15 - 0.05, 0.04); g.add(b); bubbles.push(b); }
  if (frozen) { g.add(mesh(G.disc(12), basic('#ffffff', { opacity: 0.5 }), 0.1, 0.01, -0.1, 0.2, 1, 0.05)); }
  g.userData.update = (t) => bubbles.forEach((b, i) => { const k = (t * 0.7 + i * 0.33) % 1; b.scale.setScalar(0.02 + k * 0.05); b.position.y = 0.01 + k * 0.02; });
  return g;
}
export function flagstones(P, rand) {
  const g = new THREE.Group(), m = toon(P.groundDark, { rim: 0.25 });
  for (let k = 0; k < 4; k++) { const _m = mesh(G.cyl(6), m, (k % 2 - 0.5) * 0.42 + (rand() - 0.5) * 0.08, 0.005, ((k >> 1) - 0.5) * 0.42 + (rand() - 0.5) * 0.08, 0.17, 0.012, 0.17); _m.rotation.y = rand() * 3; g.add(_m); }
  return g;
}
export function rainbowStone(wet) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(10), toon('#e8e2f6', { rim: 0.5 }), 0, 0.06, 0, 0.32, 0.12, 0.32));
  const gem = mesh(G.ico(), toon(wet ? '#a6e3ff' : '#ffffff', { rim: 1.0, flat: true, emissive: '#b49cff', emissiveIntensity: wet ? 0.6 : 0.25 }), 0, 0.28, 0, 0.14, 0.18, 0.14);
  g.add(gem);
  const cols = ['#ff7b7b', '#ffb36b', '#ffe66b', '#7be08a', '#6bc3ff', '#b48bff'];
  cols.forEach((c, i) => { const s = mesh(G.box(), basic(c), Math.cos(i / 6 * Math.PI * 2) * 0.3, 0.125, Math.sin(i / 6 * Math.PI * 2) * 0.3, 0.06, 0.012, 0.06); g.add(s); });
  if (wet) g.add(puddle());
  g.userData.update = (t) => { gem.rotation.y = t * 0.8; gem.position.y = 0.3 + Math.sin(t * 2) * 0.03; };
  return shadowed(g);
}
// a rainbow arc spanning from a to b (local coords), as 6 coloured ribbons
export function rainbowArc(len, height) {
  const g = new THREE.Group(), cols = ['#ff7b7b', '#ffb36b', '#ffe66b', '#7be08a', '#6bc3ff', '#b48bff'];
  const segs = 28;
  cols.forEach((c, i) => {
    const pos = [], idx = [], w = 0.11, z0 = -0.33 + i * w;
    for (let s = 0; s <= segs; s++) {
      const u = s / segs, x = u * len, y = Math.sin(u * Math.PI) * height;
      pos.push(x, y, z0, x, y, z0 + w);
      if (s < segs) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, toon(c, { rim: 0.6, side: true, emissive: c, emissiveIntensity: 0.35 }));
    g.add(m);
  });
  return g;
}
export function steps(P) {
  const g = new THREE.Group(), m = toon(P.groundDark, { rim: 0.3 });
  for (let k = 0; k < 3; k++) g.add(mesh(slab(0.9, 0.3, 0.12 + k * 0.12, 0.05), m, 0, 0, -0.3 + k * 0.3));
  return shadowed(g);
}

// movable things
export function boat() {
  const g = new THREE.Group();
  const hull = toon('#ff8f6b', { rim: 0.4 });
  g.add(mesh(G.sphere(14), hull, 0, -0.06, 0, 0.42, 0.14, 0.3));
  g.add(mesh(G.cyl(14), toon('#ffe2b8'), 0, 0.02, 0, 0.36, 0.04, 0.24));
  g.add(mesh(G.cyl(6), toon('#9a6a44'), 0.12, 0.35, 0, 0.02, 0.64, 0.02));
  const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.13, 0.63, 0), new THREE.Vector3(0.13, 0.12, 0), new THREE.Vector3(-0.25, 0.14, 0)]), toon('#ffffff', { side: true, rim: 0.5 }));
  sail.geometry.computeVertexNormals(); g.add(sail);
  { const _m = mesh(G.box(), toon('#6bc3ff'), 0.13, 0.66, 0.0, 0.002, 0.05, 0.12); _m.position.z = 0.06; g.add(_m); }
  g.userData.sail = sail;
  g.userData.update = (t) => { g.rotation.z = Math.sin(t * 1.7 + g.id) * 0.04; g.position.y = Math.sin(t * 2.1 + g.id) * 0.02; };
  return shadowed(g);
}
export function cloudPlatform() {
  const g = new THREE.Group(), m = toon('#ffffff', { rim: 0.6 });
  [[0, 0, 0, 0.36], [0.24, 0.02, 0.1, 0.26], [-0.25, 0.0, -0.08, 0.27], [0.05, 0.05, -0.24, 0.24], [-0.06, 0.03, 0.26, 0.23]].forEach(([x, y, z, r]) => g.add(mesh(G.sphere(12), m, x, y - 0.12, z, r, r * 0.6, r)));
  const eye = basic('#4a4a6a');
  g.add(mesh(G.sphere(6), eye, -0.08, -0.02, 0.36, 0.025, 0.04, 0.02), mesh(G.sphere(6), eye, 0.08, -0.02, 0.36, 0.025, 0.04, 0.02));
  g.userData.update = (t) => { g.position.y = Math.sin(t * 1.5 + g.id) * 0.04; };
  return shadowed(g);
}
export function pile(snow, P) {
  const g = new THREE.Group(), m = toon(snow ? '#ffffff' : '#f2c57a', { rim: 0.5 });
  g.add(mesh(G.sphere(14), m, 0, 0.02, 0, 0.4, 0.34, 0.4));
  g.add(mesh(G.sphere(10), m, 0.12, 0.3, 0.02, 0.18));
  if (snow) { g.add(mesh(G.sphere(6), basic('#3a3a5a'), -0.08, 0.3, 0.33, 0.025), mesh(G.sphere(6), basic('#3a3a5a'), 0.08, 0.3, 0.33, 0.025)); { const _m = mesh(G.cone(6), toon('#ff9a3c'), 0, 0.25, 0.4, 0.03, 0.12, 0.03); _m.rotation.x = Math.PI / 2; g.add(_m); } }
  else { for (let k = 0; k < 3; k++) g.add(mesh(G.box(), toon('#e0a95e'), (k - 1) * 0.14, 0.2 + (k % 2) * 0.05, 0.3, 0.1, 0.01, 0.02)); }
  return shadowed(g);
}

// goals
export function goalModel(kind, P) {
  const g = new THREE.Group();
  if (kind === 'home') {
    g.add(mesh(G.cyl(16), toon('#fff1d6', { rim: 0.4 }), 0, 0.27, 0, 0.3, 0.54, 0.3));
    const roof = mesh(G.cone(16), toon('#ff7b7b', { rim: 0.5 }), 0, 0.7, 0, 0.42, 0.42, 0.42); g.add(roof);
    for (let k = 0; k < 5; k++) g.add(mesh(G.sphere(6), toon('#ffffff'), Math.cos(k * 1.3) * 0.25, 0.6 + (k % 2) * 0.1, Math.sin(k * 1.3) * 0.25, 0.05));
    g.add(mesh(G.cyl(12), toon('#a86f45'), 0, 0.14, 0.29, 0.1, 0.02, 0.13).rotateX(Math.PI / 2));
    const door = mesh(G.sphere(12), toon('#b9774a'), 0, 0.17, 0.3, 0.1, 0.15, 0.02); g.add(door);
    g.add(mesh(G.sphere(10), basic('#ffe9a0'), 0.17, 0.36, 0.22, 0.06, 0.06, 0.02).rotateY(0.6));
    g.add(mesh(G.cyl(8), toon('#c9a2a2'), 0.18, 0.88, -0.05, 0.05, 0.2, 0.05));
    g.userData.door = door;
  } else if (kind === 'lantern') {
    g.add(mesh(G.cyl(8), toon('#9a6a44'), 0, 0.4, 0, 0.035, 0.8, 0.035));
    g.add(mesh(G.box(), toon('#9a6a44'), 0.14, 0.78, 0, 0.3, 0.04, 0.04));
    const lan = new THREE.Group(); lan.position.set(0.26, 0.6, 0);
    lan.add(mesh(G.sphere(14), toon('#ffb36b', { emissive: '#ff8a3c', emissiveIntensity: 0.7, rim: 0.4 }), 0, 0, 0, 0.13, 0.16, 0.13));
    lan.add(mesh(G.cyl(8), toon('#c0503c'), 0, 0.16, 0, 0.06, 0.04, 0.06));
    lan.add(mesh(G.cyl(8), toon('#c0503c'), 0, -0.16, 0, 0.06, 0.04, 0.06));
    g.add(lan); g.userData.lan = lan;
    const cols = [P.accent, '#ffd35c', '#7be0c8'];
    for (let k = 0; k < 3; k++) { const f = mesh(G.cone(3), toon(cols[k], { side: true }), -0.05 - k * 0.05, 0.7 - k * 0.02, 0.0, 0.035, 0.07, 0.01); f.rotation.z = Math.PI; g.add(f); }
    g.userData.update = (t) => { lan.rotation.z = Math.sin(t * 1.8) * 0.12; };
  } else if (kind === 'friend') {
    const f = creature('#ffb3c7', '#ff7b9c');
    f.scale.setScalar(0.85); g.add(f); g.userData.friend = f;
    g.add(mesh(G.cyl(16), toon('#fff1d6'), 0, 0.02, 0, 0.3, 0.04, 0.3));
  } else { // seed
    g.add(mesh(G.torus(), toon('#c98e5b', { flat: true }), 0, 0.05, 0, 0.2, 0.2, 0.12).rotateX(Math.PI / 2));
    const seed = mesh(G.sphere(16), toon('#ffcf5c', { emissive: '#ffa53c', emissiveIntensity: 0.5, rim: 0.8 }), 0, 0.28, 0, 0.13, 0.19, 0.13);
    g.add(seed); g.userData.seed = seed;
    g.userData.update = (t) => { seed.position.y = 0.3 + Math.sin(t * 2) * 0.05; seed.rotation.y = t; };
  }
  g.add(mesh(G.ring(), basic('#fff6c8', { opacity: 0.6, add: true }), 0, 0.01, 0, 0.45));
  return shadowed(g);
}

// secrets: little props that hide sun drops
export function secretProp(w, P) {
  const g = new THREE.Group();
  if (w === 'rain') { // closed flower bud
    g.add(mesh(G.cyl(5), toon('#5fbf4f', { sway: 0.6 }), 0, 0.08, 0, 0.015, 0.16, 0.015));
    g.add(mesh(G.sphere(10), toon('#ff9ec7', { sway: 0.6, rim: 0.6 }), 0, 0.2, 0, 0.05, 0.08, 0.05));
  } else if (w === 'sun') { // a little frosty crystal holding something warm
    g.add(mesh(G.ico(), toon('#dff6ff', { rim: 1, flat: true, opacity: 0.85, depthWrite: true }), 0, 0.1, 0, 0.09, 0.13, 0.09));
    g.add(mesh(G.sphere(6), basic('#ffcf5c'), 0, 0.1, 0, 0.035));
  } else if (w === 'wind') { // leaf pile
    const cols = ['#ffb36b', '#ff8f6b', '#ffd35c', '#9be06a'];
    for (let k = 0; k < 7; k++) { const l = mesh(G.sphere(6), toon(cols[k % 4]), Math.cos(k * 2.1) * 0.08, 0.03 + k * 0.012, Math.sin(k * 2.1) * 0.08, 0.07, 0.015, 0.04); l.rotation.y = k; g.add(l); }
  } else if (w === 'snow') { // snowbell sprout
    g.add(mesh(G.cyl(5), toon('#5fae8e', { sway: 0.6 }), 0, 0.08, 0, 0.012, 0.16, 0.012));
    const b = mesh(G.sphere(8), toon('#c7e6ff', { sway: 0.6, rim: 0.7 }), 0.03, 0.15, 0, 0.04, 0.05, 0.04); g.add(b);
  } else { // bolt: geode
    g.add(mesh(G.ico(), toon('#7a6a9a', { flat: true, rim: 0.5 }), 0, 0.08, 0, 0.12, 0.1, 0.12));
    g.add(mesh(G.ico(), toon('#ffe066', { flat: true, emissive: '#ffcf3c', emissiveIntensity: 0.3 }), 0.04, 0.14, 0.04, 0.04));
  }
  g.position.set(0.28, 0, 0.28);
  return g;
}
export function sunDrop() {
  const g = new THREE.Group();
  const m = toon('#ffcf3c', { emissive: '#ffb02e', emissiveIntensity: 0.8, rim: 1 });
  g.add(mesh(G.sphere(14), m, 0, 0, 0, 0.13));
  g.add(mesh(G.cone(12), m, 0, 0.14, 0, 0.11, 0.18, 0.11));
  g.add(mesh(G.sphere(6), basic('#ffffff'), -0.04, 0.03, 0.1, 0.03));
  g.add(mesh(G.sphere(6), basic('#5a3a1a'), -0.035, 0.0, 0.115, 0.012, 0.02, 0.01), mesh(G.sphere(6), basic('#5a3a1a'), 0.035, 0.0, 0.115, 0.012, 0.02, 0.01));
  return g;
}

// ───────────────────────── creatures ─────────────────────────
export function creature(bodyCol, footCol, opts = {}) {
  const root = new THREE.Group(), bob = new THREE.Group(); root.add(bob);
  const body = mesh(G.sphere(20), toon(bodyCol, { rim: 0.55 }), 0, 0.27, 0, 0.27, 0.25, 0.26); bob.add(body);
  const face = new THREE.Group(); face.position.set(0, 0.29, 0.22); bob.add(face);
  const eyeM = basic('#2a2340'), hi = basic('#ffffff');
  const eyes = [];
  [-1, 1].forEach(s => {
    const e = new THREE.Group(); e.position.set(s * 0.075, 0.02, 0.025);
    e.add(mesh(G.sphere(10), eyeM, 0, 0, 0, 0.036, 0.055, 0.02));
    e.add(mesh(G.sphere(6), hi, -0.01, 0.022, 0.012, 0.012));
    face.add(e); eyes.push(e);
    const ch = mesh(G.sphere(8), basic('#ff9fb4', { opacity: 0.8 }), s * 0.14, -0.035, 0.0, 0.045, 0.026, 0.01); ch.rotation.y = s * 0.5; face.add(ch);
  });
  const mouth = mesh(G.torus(), eyeM, 0, -0.04, 0.03, 0.022, 0.022, 0.01); mouth.rotation.z = Math.PI; face.add(mouth);
  const mouthO = mesh(G.sphere(8), basic('#7a2a40'), 0, -0.045, 0.03, 0.022, 0.028, 0.01); mouthO.visible = false; face.add(mouthO);
  const feet = [-1, 1].map(s => { const f = mesh(G.sphere(10), toon(footCol, { rim: 0.4 }), s * 0.11, 0.035, 0.03, 0.085, 0.05, 0.11); bob.add(f); return f; });
  // arms: little nubs
  const arms = [-1, 1].map(s => { const a = mesh(G.sphere(8), toon(bodyCol, { rim: 0.5 }), s * 0.26, 0.22, 0.02, 0.06, 0.045, 0.05); bob.add(a); return a; });
  let sprout = null;
  if (opts.sprout !== false) {
    sprout = new THREE.Group(); sprout.position.set(0, 0.5, 0);
    sprout.add(mesh(G.cyl(5), toon('#4fae4a'), 0, 0.04, 0, 0.012, 0.09, 0.012));
    const l1 = mesh(G.sphere(8), toon('#7fd65f', { rim: 0.5 }), 0.05, 0.09, 0, 0.06, 0.016, 0.032); l1.rotation.z = 0.5; sprout.add(l1);
    const l2 = mesh(G.sphere(8), toon('#7fd65f', { rim: 0.5 }), -0.045, 0.1, 0, 0.05, 0.014, 0.028); l2.rotation.z = -0.6; sprout.add(l2);
    bob.add(sprout);
  }
  // umbrella (rain/glide)
  const umb = new THREE.Group(); umb.position.set(0.12, 0.3, 0);
  umb.add(mesh(G.cyl(5), toon('#9a6a44'), 0, 0.25, 0, 0.012, 0.5, 0.012));
  const canopy = new THREE.Group(); canopy.position.y = 0.5;
  const cg = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.add(mesh(cg, toon('#ffd35c', { side: true, rim: 0.5 }), 0, 0, 0, 0.36, 0.2, 0.36));
  for (let k = 0; k < 6; k++) canopy.add(mesh(G.sphere(6), toon('#ff7b7b'), Math.cos(k / 6 * Math.PI * 2) * 0.36, -0.01, Math.sin(k / 6 * Math.PI * 2) * 0.36, 0.03));
  umb.add(canopy); umb.scale.setScalar(0.001); umb.visible = false; bob.add(umb);
  shadowed(root);
  root.userData = { bob, body, eyes, mouth, mouthO, feet, arms, sprout, umb, face };
  return root;
}
