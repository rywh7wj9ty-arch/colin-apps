// Cubby Isle: rendering, input, creatures, UI. Logic lives in core.js (globalThis.Cubby).
import * as THREE from './vendor/three/three.module.js';
import { Audio } from './audio.js?v=__V__';
const C = window.Cubby, M = window.CubbyMesher, { B, BLOCKS, W, D, H, SEA } = C;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (!TOUCH) document.body.classList.add('desk');

// ---------- WebGL check ----------
const canvas = $('c');
{ const t = document.createElement('canvas'); if (!t.getContext('webgl2')) throw new Error('This game needs WebGL 2. Please update to iOS 15 or newer, or try another browser.'); }
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
const settings = Object.assign({ low: false }, JSON.parse(localStorage.getItem('cubby-settings') || '{}'));
function applyLow() {
  document.body.classList.toggle('low', settings.low);
  renderer.shadowMap.enabled = !settings.low; sun.castShadow = !settings.low;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  resize(); localStorage.setItem('cubby-settings', JSON.stringify(settings));
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, settings.low ? 1.25 : 2));
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- lights, sky ----------
const hemi = new THREE.HemisphereLight(0xcfe9ff, 0xb59a7a, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);
scene.fog = new THREE.Fog(0xbfe6f5, 70, 190);
const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, night: { value: 0 }, time: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform vec3 top, hor, sunDir, sunCol; uniform float night, time; varying vec3 vd;
  float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
  void main(){ float y = clamp(vd.y,0.,1.); vec3 c = mix(hor, top, pow(y, .55));
    float s = max(dot(vd, sunDir), 0.); c += sunCol * (pow(s, 600.) * 2. + pow(s, 12.) * .35);
    vec3 cell = floor(vd * 180.); float st = step(.996, h(cell)) * night * smoothstep(0., .3, vd.y);
    c += st * (.6 + .4 * sin(time * 2. + h(cell + 1.) * 30.));
    gl_FragColor = vec4(c, 1.); }` }));
sky.renderOrder = -1; scene.add(sky);
const SKY = [ // t, top, horizon, light color, light intensity
  [0.00, 0x141a3f, 0x2b2f63, 0x8ea0ff, 0.25], [0.22, 0x2a2f6a, 0xf09a7a, 0xffb48a, 0.5], [0.30, 0x6cc3ee, 0xfde3c3, 0xfff0d0, 1.9],
  [0.50, 0x55b6ee, 0xcdeefa, 0xfff6e6, 2.3], [0.68, 0x6aaee6, 0xffd9a8, 0xffe0b8, 1.9], [0.76, 0x7a6ab8, 0xffa878, 0xffa070, 1.0],
  [0.82, 0x232661, 0x6a3f7a, 0x9aa0ff, 0.35], [1.00, 0x141a3f, 0x2b2f63, 0x8ea0ff, 0.25]];
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function skyAt(t, i) { let k = 0; while (SKY[k + 1][0] < t) k++; const a = SKY[k], b = SKY[k + 1], f = smooth(0, 1, (t - a[0]) / (b[0] - a[0])); if (i === 4) return lerp(a[4], b[4], f); return tmpA.setHex(a[i]).lerp(tmpB.setHex(b[i]), f); }

// ---------- materials ----------
const grad = new THREE.DataTexture(new Uint8Array([110, 170, 225, 255]), 4, 1, THREE.RedFormat); grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const U = { time: { value: 0 }, glow: { value: 0.3 } };
function voxelMat(kind) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad, transparent: kind !== 'solid' && kind !== 'deco', opacity: kind === 'water' ? 0.78 : kind === 'glass' ? 0.5 : 1, side: kind === 'deco' ? THREE.DoubleSide : THREE.FrontSide, depthWrite: kind === 'solid' || kind === 'deco' });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time; sh.uniforms.uGlow = U.glow;
    sh.vertexShader = 'attribute vec2 buv; attribute float glow; varying vec2 vB; varying float vG; varying vec3 vW; varying vec3 vN; uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vB = buv; vG = glow; vN = normal; vec3 wp = (modelMatrix * vec4(position,1.)).xyz;
      ${kind === 'water' ? 'if (normal.y > .5) transformed.y += sin(wp.x*.7 + uTime*1.6)*.06 + cos(wp.z*.6 + uTime*1.3)*.06;' : ''}
      ${kind === 'deco' ? 'float sw = buv.y * (sin(uTime*2. + wp.x*.6 + wp.z*.4)*.09 + .03); transformed.x += sw; transformed.z += sw*.6;' : ''}
      vW = wp;`);
    sh.fragmentShader = 'varying vec2 vB; varying float vG; varying vec3 vW; varying vec3 vN; uniform float uTime; uniform float uGlow;\nfloat hh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `diffuseColor.rgb *= pow(vColor, vec3(2.2));
      ${kind === 'solid' ? `vec2 f = fract(vB); vec2 e = min(f, 1. - f); float edge = min(e.x, e.y);
        vec3 cell = floor(vW - vN * .5); float n = hh(cell);
        diffuseColor.rgb *= (.93 + .1 * n) * mix(.78, 1., smoothstep(.0, .13, edge));
        diffuseColor.rgb += .06 * smoothstep(.13, .06, edge) * step(.5, vN.y) * smoothstep(.0, .05, edge);` : ''}
      ${kind === 'water' ? `float wv = sin(vW.x*1.3+uTime*2.)*sin(vW.z*1.1-uTime*1.7); diffuseColor.rgb += vec3(.12,.16,.18) * smoothstep(.55,.95,wv) * step(.5, vN.y);
        float fall = (1. - step(.5, abs(vN.y))) * smoothstep(.6, 1., sin(vW.y * 3.1 + uTime * 9. + sin(vW.x * 5. + vW.z * 3.) * .35)); diffuseColor.rgb += vec3(.35) * fall; diffuseColor.a = min(1., diffuseColor.a + fall * .2);` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vG * uGlow ${kind === 'deco' ? '* .35' : ''};`);
  };
  m.customProgramCacheKey = () => 'vox-' + kind;
  return m;
}
const MAT = { solid: voxelMat('solid'), glass: voxelMat('glass'), water: voxelMat('water'), deco: voxelMat('deco') };
const toon = (color, o) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: grad }, o || {}));

// ---------- chunks + worker meshing ----------
const NC = W / M.CS;
const chunks = new Map(); let worker = null, jobN = 0; const jobs = new Map(); let sim = null;
const pendingSets = []; const dirty = new Set();
const world3 = new THREE.Group(); scene.add(world3);
function chunkMesh(cx, cz, r) {
  const key = cx + ',' + cz; let ch = chunks.get(key);
  if (!ch) { ch = { group: new THREE.Group() }; chunks.set(key, ch); world3.add(ch.group); }
  for (const c of ch.group.children.slice()) { c.geometry.dispose(); ch.group.remove(c); }
  for (const k of ['solid', 'glass', 'water', 'deco']) {
    const d = r[k]; if (!d.i.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(d.n, 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.c, 3)); g.setAttribute('buv', new THREE.BufferAttribute(d.u, 2)); g.setAttribute('glow', new THREE.BufferAttribute(d.g, 1));
    g.setIndex(new THREE.BufferAttribute(d.i, 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, MAT[k]); m.castShadow = k === 'solid' || k === 'deco'; m.receiveShadow = k !== 'glass';
    if (k === 'water') m.renderOrder = 2; if (k === 'glass') m.renderOrder = 3;
    ch.group.add(m);
  }
  ch.ready = true;
}
function initMesher(vox) {
  M.setInfo(BLOCKS);
  if (worker) worker.terminate(); worker = null; jobs.clear();
  try {
    worker = new Worker('mesher.js?v=' + window.__V);
    worker.onmessage = e => { const r = e.data, key = r.cx + ',' + r.cz; if (jobs.get(key) !== r.job) return; jobs.delete(key); chunkMesh(r.cx, r.cz, r); };
    worker.onerror = () => { worker = null; for (const k of jobs.keys()) dirty.add(k); jobs.clear(); };
    worker.postMessage({ type: 'init', vox: vox.buffer.slice(0), blocks: BLOCKS });
  } catch (e) { worker = null; }
}
function requestMesh(cx, cz) {
  const key = cx + ',' + cz;
  if (worker) { const j = ++jobN; jobs.set(key, j); worker.postMessage({ type: 'mesh', cx, cz, job: j }); }
  else chunkMesh(cx, cz, M.meshChunk(sim.world.vox, cx, cz));
}
function markDirty(x, z) {
  const cx = Math.floor(x / M.CS), cz = Math.floor(z / M.CS); dirty.add(cx + ',' + cz);
  const lx = x % M.CS, lz = z % M.CS;
  if (lx === 0 && cx > 0) dirty.add((cx - 1) + ',' + cz); if (lx === M.CS - 1 && cx < NC - 1) dirty.add((cx + 1) + ',' + cz);
  if (lz === 0 && cz > 0) dirty.add(cx + ',' + (cz - 1)); if (lz === M.CS - 1 && cz < NC - 1) dirty.add(cx + ',' + (cz + 1));
}
function flushMesh() {
  if (pendingSets.length && worker) worker.postMessage({ type: 'set', list: pendingSets.slice() });
  pendingSets.length = 0;
  for (const k of dirty) { const [a, b] = k.split(',').map(Number); requestMesh(a, b); } dirty.clear();
}
function meshAll() { for (let cz = 0; cz < NC; cz++) for (let cx = 0; cx < NC; cx++) requestMesh(cx, cz); }
const allMeshed = () => chunks.size === NC * NC && jobs.size === 0;

// ---------- voxel raycast ----------
function voxRay(o, d, max, test) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
  let nx = 0, ny = 0, nz = 0, t = 0;
  while (t <= max) {
    const id = sim.world.get(x, y, z);
    if (id && test(id)) return { x, y, z, nx, ny, nz, id, t };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    if (y < -1 || y > H + 8) break;
  }
  return null;
}
const hittable = id => id !== B.WATER;
const camBlock = id => BLOCKS[id].solid && BLOCKS[id].opaque;

// ---------- hero ----------
function makeHero() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const fur = toon(0xffc7a0), dark = new THREE.MeshBasicMaterial({ color: 0x2b2238 }), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.46, 28, 20), fur); torso.scale.set(1, 0.92, 0.95); torso.position.y = 0.46; torso.castShadow = true; body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), toon(0xfff1e0)); belly.position.set(0, 0.36, 0.25); belly.scale.set(1, 0.9, 0.5); body.add(belly);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(0.16 * s, 0.56, 0.4);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), dark); ball.scale.set(0.85, 1.15, 0.6); e.add(ball);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), white); hl.position.set(0.025, 0.04, 0.05); e.add(hl);
    body.add(e); eyes.push(e);
    const ck = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toon(0xff8fa6)); ck.position.set(0.28 * s, 0.43, 0.34); ck.scale.set(1, 0.6, 0.4); body.add(ck);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), fur); ear.position.set(0.3 * s, 0.86, -0.02); ear.scale.set(0.8, 1, 0.6); body.add(ear);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.016, 6, 12, Math.PI), dark); mouth.position.set(0, 0.44, 0.44); mouth.rotation.z = Math.PI; body.add(mouth);
  const sprout = new THREE.Group(); sprout.position.set(0, 0.9, 0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.16), toon(0x5aa84e)); stem.position.y = 0.06; sprout.add(stem);
  for (const s of [-1, 1]) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), toon(0x7fd18f)); lf.scale.set(1.3, 0.35, 0.7); lf.position.set(0.08 * s, 0.15, 0); lf.rotation.z = -0.5 * s; sprout.add(lf); }
  body.add(sprout);
  const feet = [];
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), toon(0xe89a78)); f.scale.set(1, 0.6, 1.3); f.position.set(0.2 * s, 0.06, 0.05); f.castShadow = true; g.add(f); feet.push(f); }
  const arms = [];
  for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), fur); a.position.set(0.44 * s, 0.38, 0.06); a.scale.set(0.8, 1.1, 0.8); body.add(a); arms.push(a); }
  const pick = new THREE.Group(); const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45), toon(0xa8754f)); pick.add(hnd);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.07), toon(0xb9b6c8)); head.position.y = 0.22; pick.add(head);
  pick.position.set(0.5, 0.45, 0.12); pick.rotation.x = 0.6; pick.visible = false; body.add(pick);
  return { g, body, eyes, feet, arms, mouth, pick, pickHead: head };
}
const hero = makeHero(); scene.add(hero.g);
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: 0x302040, transparent: true, opacity: 0.22, depthWrite: false })); blob.rotation.x = -Math.PI / 2; scene.add(blob);
const P = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ground: false, inWater: false, yaw: 0, walk: 0, squash: 0, bonkT: 0, blink: 2, happy: 0, stepT: 0, air: 0 };
const HR = 0.3, HH = 0.95;
function solidAt(x, y, z) { if (x < 0 || z < 0 || x >= W || z >= D) return true; return BLOCKS[sim.world.get(Math.floor(x), Math.floor(y), Math.floor(z))].solid; }
function boxHit(x, y, z) {
  for (let yy = Math.floor(y); yy <= Math.floor(y + HH); yy++) for (let zz = Math.floor(z - HR); zz <= Math.floor(z + HR); zz++) for (let xx = Math.floor(x - HR); xx <= Math.floor(x + HR); xx++) if (solidAt(xx + 0.5, yy + 0.5, zz + 0.5)) return true;
  return false;
}
function physics(dt, mx, mz, jump) {
  const sp = 4.2, acc = P.ground ? 14 : 7;
  P.vx = lerp(P.vx, mx * sp, 1 - Math.exp(-acc * dt)); P.vz = lerp(P.vz, mz * sp, 1 - Math.exp(-acc * dt));
  const wet = sim.world.get(Math.floor(P.x), Math.floor(P.y + 0.45), Math.floor(P.z)) === B.WATER;
  if (wet && !P.inWater) { sfx('splash'); burst(P.x, P.y + 0.5, P.z, 0xbfefff, 14, 4); }
  P.inWater = wet;
  if (wet) { P.vy += (7 - 3 * P.vy) * dt; P.vy = Math.min(P.vy, 2.2); if (jump) P.vy = 5; }
  else { P.vy -= 24 * dt; if (jump && (P.ground || P.air < 0.12)) { P.vy = 8.2; P.ground = false; P.air = 1; P.squash = -0.35; sfx('jump'); } }
  P.vy = Math.max(P.vy, -22);
  for (const ax of ['x', 'z']) {
    const v = ax === 'x' ? P.vx : P.vz, nx = P.x + (ax === 'x' ? v * dt : 0), nz = P.z + (ax === 'z' ? v * dt : 0);
    if (!boxHit(nx, P.y, nz)) { P.x = nx; P.z = nz; }
    else if ((P.ground || wet) && !boxHit(nx, P.y + 1.05, nz) && !boxHit(P.x, P.y + 1.05, P.z) && Math.abs(v) > 0.5) { P.vy = Math.max(P.vy, 7.2); P.ground = false; P.squash = -0.25; }
    else if (ax === 'x') P.vx = 0; else P.vz = 0;
  }
  const ny = P.y + P.vy * dt;
  if (!boxHit(P.x, ny, P.z)) { P.y = ny; P.ground = false; }
  else {
    if (P.vy < 0) { const sy = Math.floor(ny) + 1; if (sy <= P.y + 0.01 && !boxHit(P.x, sy, P.z)) P.y = sy; if (!P.ground && P.air > 0.25) { P.squash = 0.4; sfx('step'); } P.ground = true; P.air = 0; }
    P.vy = 0;
  }
  if (!P.ground) P.air += dt;
  P.x = clamp(P.x, 0.4, W - 0.4); P.z = clamp(P.z, 0.4, D - 0.4);
  if (P.y < -5) { const s = sim.world.spawn; P.x = s.x; P.y = s.y + 2; P.z = s.z; }
}

// ---------- particles + effects ----------
const PMAX = 400;
const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshToonMaterial({ gradientMap: grad }), PMAX);
parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parts.count = 0; parts.frustumCulled = false; scene.add(parts);
const plist = []; const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
function burst(x, y, z, color, n, spd, opt) {
  n = settings.low ? Math.ceil(n / 2) : n;
  for (let i = 0; i < n && plist.length < PMAX; i++) plist.push({ x, y, z, vx: (Math.random() - 0.5) * spd, vy: Math.random() * spd * 0.9 + 1, vz: (Math.random() - 0.5) * spd, life: 0.6 + Math.random() * 0.5, t: 0, c: color, s: opt && opt.s || 1, g: opt && opt.g !== undefined ? opt.g : 14, r: Math.random() * 6 });
}
function updParts(dt) {
  let k = 0;
  for (let i = plist.length - 1; i >= 0; i--) {
    const p = plist[i]; p.t += dt; if (p.t > p.life) { plist.splice(i, 1); continue; }
    p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.g > 0 && solidAt(p.x, p.y, p.z)) { p.vy = Math.abs(p.vy) * 0.4; p.vx *= 0.6; p.vz *= 0.6; p.y += 0.05; }
    const sc = p.s * Math.sqrt(1 - p.t / p.life);
    _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.r + p.t * 4, p.r, 0)), _s.set(sc, sc, sc));
    parts.setMatrixAt(k, _m); parts.setColorAt(k, _c.setHex(p.c)); k++;
  }
  parts.count = k; parts.instanceMatrix.needsUpdate = true; if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
}
const crackTex = [1, 2, 3].map(st => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.strokeStyle = 'rgba(40,20,50,.75)'; x.lineWidth = 3; x.lineCap = 'round'; let r = 7 + st; const R = () => (Math.sin(r++ * 91.7) * 0.5 + 0.5);
  for (let i = 0; i < st * 3; i++) { x.beginPath(); let px = 32, py = 32; x.moveTo(px, py); for (let j = 0; j < 3; j++) { px += (R() - 0.5) * 40; py += (R() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; });
const crack = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); crack.visible = false; scene.add(crack);
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }))); ghost.visible = false; scene.add(ghost);
const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); sel.visible = false; scene.add(sel);
const flyers = []; const cubeG = new THREE.BoxGeometry(0.34, 0.34, 0.34);
function flyItem(x, y, z, id) {
  const m = new THREE.Mesh(id === B.FLOWER ? new THREE.SphereGeometry(0.16, 10, 8) : cubeG, toon(BLOCKS[id].color, BLOCKS[id].glow ? { emissive: BLOCKS[id].color, emissiveIntensity: 0.5 } : {}));
  m.position.set(x + 0.5, y + 0.5, z + 0.5); m.castShadow = true; scene.add(m); flyers.push({ m, t: 0, vy: 4.5, id, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
}
function updFlyers(dt) {
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i]; f.t += dt; const m = f.m;
    if (f.pop) { const k = f.t / 0.18; m.scale.setScalar(lerp(0.6, 1.0, Math.min(1, k)) + Math.sin(Math.min(1, k) * Math.PI) * 0.12); if (k >= 1.3) { scene.remove(m); flyers.splice(i, 1); } continue; }
    m.rotation.y += dt * 5;
    if (f.t < 0.55) { f.vy -= 16 * dt; m.position.x += f.vx * dt; m.position.z += f.vz * dt; m.position.y += f.vy * dt; if (solidAt(m.position.x, m.position.y - 0.17, m.position.z) && f.vy < 0) f.vy = -f.vy * 0.55; }
    else { const k = Math.min(1, (f.t - 0.55) / 0.3); m.position.lerp(_p.set(P.x, P.y + 0.6, P.z), k * 0.5); m.scale.setScalar(1 - k * 0.7);
      if (k >= 1) { scene.remove(m); flyers.splice(i, 1); sfx('collect'); hotPulse(f.id); } }
  }
}
function popIn(x, y, z, id) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), toon(BLOCKS[id].color, { transparent: true, opacity: 0.9 })); m.position.set(x + 0.5, y + 0.5, z + 0.5); scene.add(m); flyers.push({ m, t: 0, pop: true });
}

// ---------- creatures ----------
function makeGuide() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 26, 18), toon(0x8cc9a0)); body.scale.set(1, 0.9, 1); body.position.y = 0.55; body.castShadow = true; g.add(body);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 16), toon(0xf7ecd6)); face.position.set(0, 0.55, 0.3); face.scale.set(1, 0.8, 0.6); g.add(face);
  const dark = new THREE.MeshBasicMaterial({ color: 0x2b2238 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), dark); e.position.set(0.14 * s, 0.62, 0.53); e.scale.set(1, 0.5, 0.5); g.add(e);
    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), toon(0xe8f5e0)); brow.position.set(0.17 * s, 0.75, 0.47); brow.scale.set(1.2, 0.45, 0.5); g.add(brow);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), toon(0x5fbf73)); leaf.position.set(0.32 * s, 1.08, 0); leaf.scale.set(1.4, 0.3, 0.8); leaf.rotation.z = 0.5 * s; g.add(leaf);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toon(0xff9a8c)); nose.position.set(0, 0.52, 0.57); g.add(nose);
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(0xffd84a, { emissive: 0xffb000, emissiveIntensity: 0.3 })); fl.position.set(0, 1.12, 0.05); g.add(fl);
  const mark = new THREE.Group(); const ex = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.25, 4, 8), toon(0xffbf3c, { emissive: 0xff9a00, emissiveIntensity: 0.5 })); ex.position.y = 0.2; mark.add(ex);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), ex.material); mark.add(dot); mark.position.y = 1.7; g.add(mark);
  g.userData.mark = mark; g.userData.body = body; return g;
}
function makeBun(col) {
  const g = new THREE.Group(); const m = toon(col);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), m); b.position.y = 0.28; b.castShadow = true; g.add(b);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.22, 4, 8), m); ear.position.set(0.1 * s, 0.62, -0.04); ear.rotation.z = -0.25 * s; g.add(ear);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2b2238 })); e.position.set(0.1 * s, 0.34, 0.26); g.add(e);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0xffffff)); tail.position.set(0, 0.22, -0.3); g.add(tail);
  g.userData.body = b; return g;
}
function makeBird() {
  const g = new THREE.Group(), m = toon(0xfff6ee), bd = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), m); bd.scale.set(0.8, 0.8, 1.3); g.add(bd);
  const wg = new THREE.BoxGeometry(0.6, 0.04, 0.26); wg.translate(0.3, 0, 0);
  const w1 = new THREE.Mesh(wg, m), w2 = new THREE.Mesh(wg, m); w2.scale.x = -1; g.add(w1, w2);
  const bk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), toon(0xffb44a)); bk.rotation.x = Math.PI / 2; bk.position.z = 0.32; g.add(bk);
  g.userData.w = [w1, w2]; return g;
}
function starGeo() {
  const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.17 : 0.38, a = i / 10 * Math.PI * 2 + Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 }); g.center(); return g;
}
const STAR = starGeo(), starMat = toon(0xffd34a, { emissive: 0xffa800, emissiveIntensity: 0.55 });
let guide, buns = [], birds = [], seedMeshes = [], fireflies, lanternLights = [], beam = null, cottageFx = null, arrow;
const ents = new THREE.Group(); scene.add(ents);
function surf(x, z) { for (let y = H - 1; y > 0; y--) { const id = sim.world.get(Math.floor(x), y, Math.floor(z)); if (BLOCKS[id].solid) return y + 1; } return SEA + 1; }
function buildEntities() {
  ents.clear(); buns = []; birds = []; seedMeshes = []; lanternLights = [];
  if (beam) { scene.remove(beam); beam = null; } if (cottageFx) { scene.remove(cottageFx.light); cottageFx = null; }
  const w = sim.world;
  guide = makeGuide(); guide.position.set(w.guide.x, surf(w.guide.x, w.guide.z), w.guide.z); ents.add(guide);
  const R = C.rng(w.seed + 99), cols = [0xffffff, 0xffd6e6, 0xfff0c2, 0xd8f0ff, 0xe8dcff, 0xffe0cc];
  for (let i = 0; i < 6; i++) {
    let x, z, t = 0; do { x = 52 + R() * 50; z = 74 + R() * 34; t++; } while ((surf(x, z) <= SEA + 1 || C.inRiver(x, z)) && t < 60);
    const b = makeBun(cols[i]); b.position.set(x, surf(x, z), z); ents.add(b);
    buns.push({ m: b, vy: 0, t: R() * 3, follow: i < (sim.s.friends || 0), home: { x, z }, tx: x, tz: z, hop: 0 });
  }
  for (let i = 0; i < 6; i++) { const b = makeBird(); ents.add(b); birds.push({ m: b, a: i, r: 20 + i * 6, h: 30 + i * 2, cx: 40 + i * 9, cz: 50 + i * 6, s: 0.25 + i * 0.03 }); }
  for (const sd of w.seeds) {
    if (sim.s.found.includes(sd.id)) continue;
    const m = new THREE.Mesh(STAR, starMat); m.position.set(sd.x, sd.y, sd.z); m.userData.sd = sd; m.castShadow = true;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })); m.add(halo);
    ents.add(m); seedMeshes.push(m);
  }
  const n = settings.low ? 60 : 160, pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { let x, z, t = 0; do { x = 10 + R() * 108; z = 10 + R() * 108; } while (surf(x, z) <= SEA + 1 && t++ < 30); pos.set([x, surf(x, z) + 0.6 + R() * 2.5, z], i * 3); ph[i] = R() * 100; }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); fg.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  fireflies = new THREE.Points(fg, new THREE.ShaderMaterial({ uniforms: { time: U.time, night: skyU.night, px: { value: renderer.getPixelRatio() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float ph; uniform float time, night, px; varying float a; void main(){ vec3 p = position + vec3(sin(time*.7+ph)*.8, sin(time*1.3+ph*2.)*.4, cos(time*.6+ph)*.8); vec4 mv = modelViewMatrix*vec4(p,1.); a = night * (.5+.5*sin(time*3.+ph*5.)); gl_PointSize = px * 90. / -mv.z; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying float a; void main(){ float d = length(gl_PointCoord-.5); gl_FragColor = vec4(1., .9, .45, a * smoothstep(.5, .0, d)); }' }));
  fireflies.frustumCulled = false; ents.add(fireflies);
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffc46b, 0, 9, 1.6); ents.add(l); lanternLights[i] = l; }
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 4), toon(0xffbf3c, { emissive: 0xff9a00, emissiveIntensity: 0.4 })); cone.rotation.x = Math.PI / 2;
  arrow = new THREE.Group(); arrow.add(cone); ents.add(arrow);
  if (sim.s.c.lighthouse) lightUp(sim.s.c.lighthouse, true);
  if (sim.s.c.cottage) cottageAlive(sim.s.c.cottage, true);
  scanLanterns();
}
let lanterns = [];
function scanLanterns() { lanterns = []; for (const [i, id] of sim.world.deltas) if (id === B.LANTERN || id === B.BEACON) { const [x, y, z] = sim.world.coord(i); lanterns.push([x + 0.5, y + 0.5, z + 0.5]); } }
function lightUp(t, quiet) {
  const g = new THREE.Group(); g.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3, 26, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  cone.geometry.translate(0, -13, 0); const arm = new THREE.Group(); cone.rotation.z = Math.PI / 2 + 0.12; arm.add(cone); g.add(arm);
  const l = new THREE.PointLight(0xffe8a0, 40, 70, 1.2); g.add(l); scene.add(g); beam = g;
  if (!quiet) { banner('The island is lit!', 'Your lighthouse shines over Cubby Isle'); sfx('fanfare'); for (let i = 0; i < 4; i++) setTimeout(() => burst(t.x + 0.5, t.y + 1, t.z + 0.5, [0xffd34a, 0xff8fb8, 0x9be3c0, 0xffffff][i], 30, 9), i * 250); }
}
function cottageAlive(c, quiet) {
  cottageFx = { x: c.x + 0.5, y: c.y + 4.5, z: c.z + 0.5, t: 0 };
  const l = new THREE.PointLight(0xffb86b, 6, 10, 1.5); l.position.set(c.x + 0.5, c.y + 1.2, c.z + 0.5); scene.add(l); cottageFx.light = l;
  if (!quiet) { banner('Home sweet home!', 'Your cottage came alive'); sfx('alive'); for (let i = 0; i < 3; i++) setTimeout(() => burst(c.x + 0.5, c.y + 2, c.z + 0.5, [0xff8fb8, 0xffd34a, 0x9be3c0][i], 26, 8), i * 200); }
}

// ---------- audio ----------
const audio = new Audio();
const sfx = (n, p) => audio.sfx(n, p);

// ---------- UI helpers ----------
const iconCache = {};
function shade(hex, f) { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`; }
function icon(id) {
  if (iconCache[id]) return iconCache[id];
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  if (id === 'pick1' || id === 'pick2') { x.lineCap = 'round'; x.strokeStyle = '#a8754f'; x.lineWidth = 7; x.beginPath(); x.moveTo(18, 52); x.lineTo(44, 18); x.stroke(); x.strokeStyle = id === 'pick1' ? '#e8b77d' : '#b9b6c8'; x.lineWidth = 9; x.beginPath(); x.arc(40, 22, 18, Math.PI * 1.05, Math.PI * 1.85); x.stroke(); }
  else if (id === B.FLOWER) { x.fillStyle = '#5aa84e'; x.fillRect(30, 30, 4, 28); for (let i = 0; i < 5; i++) { x.fillStyle = '#ff8fb8'; x.beginPath(); x.arc(32 + Math.cos(i * 1.256) * 10, 24 + Math.sin(i * 1.256) * 10, 8, 0, 7); x.fill(); } x.fillStyle = '#ffd84a'; x.beginPath(); x.arc(32, 24, 6, 0, 7); x.fill(); }
  else {
    const b = BLOCKS[id], top = b.top || b.color, side = b.side || b.color;
    const poly = (pts, f) => { x.fillStyle = f; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); };
    poly([[32, 6], [58, 19], [32, 32], [6, 19]], shade(top, 1.08)); poly([[6, 19], [32, 32], [32, 60], [6, 47]], shade(side, 0.88)); poly([[58, 19], [32, 32], [32, 60], [58, 47]], shade(side, 0.72));
    if (b.glow) { x.fillStyle = 'rgba(255,255,200,.55)'; x.beginPath(); x.arc(32, 32, 10, 0, 7); x.fill(); }
    if (id === B.DOOR) { x.fillStyle = '#7a4f2e'; x.beginPath(); x.arc(24, 42, 3, 0, 7); x.fill(); }
    if (id === B.GLASS) { x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 3; x.beginPath(); x.moveTo(14, 30); x.lineTo(22, 24); x.stroke(); }
  }
  return iconCache[id] = c.toDataURL();
}
let toastT = 0;
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 2200); }
function banner(a, b) { const e = $('banner'); e.innerHTML = a + (b ? '<small>' + b + '</small>' : ''); e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }
let bubbleCb = null;
function say(text, cb) { $('bubText').textContent = text; $('bubble').classList.remove('hidden'); bubbleCb = cb || null; }
$('bubOk').onclick = () => { $('bubble').classList.add('hidden'); sfx('click'); const f = bubbleCb; bubbleCb = null; if (f) f(); };

let hotSel = 0, hotIds = [];
function hotOrder() { const s = sim.s; s.hot = (s.hot || []).filter(id => sim.count(id) > 0); for (const id of C.PLACEABLE) if (sim.count(id) > 0 && !s.hot.includes(id)) s.hot.push(id); return s.hot.slice(0, 9); }
function renderHot() {
  const el = $('hotbar'); const prev = hotIds[hotSel]; hotIds = hotOrder();
  if (prev !== undefined && hotIds.includes(prev)) hotSel = hotIds.indexOf(prev); else hotSel = clamp(hotSel, 0, Math.max(0, hotIds.length - 1));
  let h = '';
  if (sim.s.tool) h += `<div class="hs tool" title="Pick"><img src="${icon('pick' + sim.s.tool)}"></div>`;
  for (let i = 0; i < 9; i++) { const id = hotIds[i]; h += id !== undefined ? `<div class="hs${i === hotSel ? ' sel' : ''}" data-i="${i}" data-id="${id}"><img src="${icon(id)}"><b>${sim.count(id)}</b></div>` : (i < 5 ? `<div class="hs empty"></div>` : ''); }
  el.innerHTML = h;
}
$('hotbar').addEventListener('pointerdown', e => { const s = e.target.closest('.hs[data-i]'); if (!s) return; hotSel = +s.dataset.i; sfx('click'); renderHot(); if (TOUCH && mode !== 'build') setMode('build'); e.stopPropagation(); });
function hotPulse(id) { renderHot(); const s = document.querySelector(`.hs[data-id="${id}"]`); if (s) { s.classList.remove('pulse'); void s.offsetWidth; s.classList.add('pulse'); } }
const selId = () => hotIds[hotSel];

function renderQuest() {
  const q = sim.quest();
  if (!q) { $('qTitle').textContent = 'Island complete! ★'; $('qText').textContent = 'Keep building, exploring and finding Sun Seeds.'; $('qBar').style.width = '100%'; }
  else { $('qTitle').textContent = `${sim.s.quest + 1}. ${q.title}`; $('qText').textContent = q.text; $('qBar').style.width = (100 * sim.progress() / q.need) + '%'; }
  $('seedN').textContent = sim.totalSeeds() + ' / ' + (C.QUESTS.length + sim.world.seeds.length);
  if (guide) guide.userData.mark.visible = !!q && !sim.s.talked;
}
function renderCraft() {
  const R = C.RECIPES; let h = '<div class="hub">Craft</div>';
  R.forEach((r, i) => {
    const a = -Math.PI / 2 + i / R.length * Math.PI * 2, rx = 50 + Math.cos(a) * 39, ry = 50 + Math.sin(a) * 39;
    const can = sim.canCraft(r.id), locked = !sim.s.unlocked.includes(r.id), out = r.tool ? 'pick' + r.tool : +Object.keys(r.out)[0];
    const need = Object.entries(r.need).map(([k, v]) => `${v} ${BLOCKS[k].name}`).join(' + ');
    h += `<button class="rc ${locked ? 'locked' : can.ok ? 'ok' : 'no'}" data-r="${r.id}" style="left:${rx}%;top:${ry}%"><img src="${icon(out)}">${locked ? '🔒 ' : ''}${r.name}<span class="need">${locked ? 'Unlock by questing' : can.why === 'Already have it' ? 'Got it!' : need}</span></button>`;
  });
  $('wheel').innerHTML = h;
}
$('wheel').addEventListener('click', e => { const b = e.target.closest('.rc'); if (!b) return; sim.craft(b.dataset.r); renderCraft(); });
function openCraft() { if (!playing) return; $('bubble').classList.add('hidden'); renderCraft(); $('craft').classList.remove('hidden'); sfx('click'); }
function closeCraft() { $('craft').classList.add('hidden'); }
$('bCraft').onclick = () => openCraft(); $('craftClose').onclick = () => { closeCraft(); sfx('click'); };

let mode = 'mine';
function setMode(m) { mode = m; $('bMode').classList.toggle('build', m === 'build'); $('modeIco').textContent = m === 'build' ? '▣' : '⛏'; $('modeTxt').textContent = m === 'build' ? 'Build' : 'Mine'; }
$('bMode').onclick = () => { setMode(mode === 'mine' ? 'build' : 'mine'); sfx('click'); };

function syncPause() {
  $('tMusic').classList.toggle('on', audio.vol.musicOn); $('tSfx').classList.toggle('on', audio.vol.sfxOn); $('tLow').classList.toggle('on', settings.low);
  $('sMusic').value = audio.vol.music; $('sSfx').value = audio.vol.sfx;
  $('qLog').textContent = C.QUESTS.map((q, i) => (i < sim.s.quest ? '★ ' : i === sim.s.quest ? '▶ ' : '· ') + q.title).join('  ');
}
let slot = 0, playing = false, paused = false, saveT = 0;
function openPause() { if (!playing) return; paused = true; syncPause(); $('pause').classList.remove('hidden'); }
function closePause() { paused = false; $('pause').classList.add('hidden'); }
$('bMenu').onclick = () => { sfx('click'); openPause(); }; $('bResume').onclick = () => { sfx('click'); closePause(); };
$('tMusic').onclick = () => { audio.vol.musicOn = !audio.vol.musicOn; audio.apply(); syncPause(); };
$('tSfx').onclick = () => { audio.vol.sfxOn = !audio.vol.sfxOn; audio.apply(); syncPause(); sfx('click'); };
$('tLow').onclick = () => { settings.low = !settings.low; applyLow(); syncPause(); };
$('sMusic').oninput = e => audio.set('music', +e.target.value); $('sSfx').oninput = e => audio.set('sfx', +e.target.value);
$('sSfx').onchange = () => sfx('click');
$('bTitle').onclick = async () => { await save(); closePause(); showTitle(); };

// ---------- blueprints ----------
let bp = null; const bpMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 0.92, 0.92), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false }), 200); bpMesh.count = 0; bpMesh.frustumCulled = false; scene.add(bpMesh);
function startBlueprint(id) {
  const def = C.BLUEPRINTS.find(b => b.id === id);
  const ox = Math.floor(P.x + Math.sin(P.yaw) * 5) - 2, oz = Math.floor(P.z + Math.cos(P.yaw) * 5) - 2; let oy = 0;
  for (let dz = 0; dz < 5; dz++) for (let dx = 0; dx < 5; dx++) oy = Math.max(oy, surf(ox + dx + 0.5, oz + dz + 0.5));
  bp = { def, ox, oy, oz }; updBlueprint(); toast(def.name + ' blueprint placed. Fill in the ghost blocks!');
}
function updBlueprint() {
  if (!bp) { bpMesh.count = 0; $('bpTag').classList.add('hidden'); return; }
  let k = 0, done = 0;
  for (const [x, y, z, id] of bp.def.blocks) {
    const X = bp.ox + x, Y = bp.oy + y, Z = bp.oz + z;
    if (sim.world.get(X, Y, Z) === id) { done++; continue; }
    _m.makeTranslation(X + 0.5, Y + 0.5, Z + 0.5); bpMesh.setMatrixAt(k, _m); bpMesh.setColorAt(k, _c.setHex(BLOCKS[id].color)); k++;
  }
  bpMesh.count = k; bpMesh.instanceMatrix.needsUpdate = true; if (bpMesh.instanceColor) bpMesh.instanceColor.needsUpdate = true;
  $('bpTag').classList.remove('hidden'); $('bpTag').textContent = `${bp.def.name}: ${done}/${bp.def.blocks.length}`;
  if (k === 0) { banner('Blueprint complete!'); sfx('quest'); bp = null; setTimeout(updBlueprint, 50); }
}
$('bpCottage').onclick = () => { closePause(); startBlueprint('cottage'); }; $('bpLight').onclick = () => { closePause(); startBlueprint('lighthouse'); }; $('bpOff').onclick = () => { bp = null; updBlueprint(); closePause(); };
function bpWants(x, y, z) { if (!bp) return null; for (const b of bp.def.blocks) if (bp.ox + b[0] === x && bp.oy + b[1] === y && bp.oz + b[2] === z) return b[3]; return null; }

// ---------- saves (IndexedDB, localStorage fallback) ----------
const store = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('cubby-isle', 1); r.onupgradeneeded = () => r.result.createObjectStore('slots'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); setTimeout(() => rej(new Error('idb timeout')), 3000); } catch (e) { rej(e); } }));
  const tx = async (m, f) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('slots', m), s = t.objectStore('slots'), r = f(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  return {
    async get(n) { try { const v = await tx('readonly', s => s.get(n)); return v || localStorage.getItem('cubby-slot-' + n); } catch (e) { return localStorage.getItem('cubby-slot-' + n); } },
    async put(n, v) { try { await tx('readwrite', s => s.put(v, n)); } catch (e) { localStorage.setItem('cubby-slot-' + n, v); } },
    async del(n) { try { await tx('readwrite', s => s.delete(n)); } catch (e) {} localStorage.removeItem('cubby-slot-' + n); },
  };
})();
async function save() { if (!sim || !playing) return; sim.s.hero = { x: P.x, y: P.y, z: P.z, yaw: P.yaw }; await store.put(slot, sim.serialize()); }
addEventListener('pagehide', () => { save(); }); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---------- start / title ----------
function bindSim(s) {
  sim = s; const w = sim.world, orig = w.set.bind(w);
  w.set = (x, y, z, id) => { const r = orig(x, y, z, id); if (r) { pendingSets.push(w.idx(x, y, z), id); markDirty(x, z); } return r; };
  sim.on(onEvent);
  initMesher(w.vox); meshAll();
  buildEntities();
}
async function showTitle() {
  playing = false; $('hud').classList.add('hidden'); $('title').classList.remove('hidden'); closeCraft(); closePause(); task = null;
  if (!sim || sim.world.seed !== 7 || sim.world.deltas.size) bindSim(new C.Sim(7));
  const s = sim.world.spawn; P.x = s.x; P.y = s.y; P.z = s.z; camS.dist = 58; camS.pitch = 0.55;
  let h = '';
  for (let n = 0; n < 3; n++) {
    const raw = await store.get(n); let meta = null; try { meta = raw && JSON.parse(raw); } catch (e) {}
    if (meta) { const q = meta.s.quest, sd = (meta.s.questSeeds || 0) + (meta.s.found || []).length; h += `<button class="slot" data-n="${n}"><h3>Island ${n + 1}</h3><p>★ ${sd} Sun Seeds · ${q}/${C.QUESTS.length} quests</p><span class="go">Continue</span><span class="del" data-del="${n}">start over</span></button>`; }
    else h += `<button class="slot" data-n="${n}"><h3>Island ${n + 1}</h3><p>A brand new island</p><span class="go">New game</span></button>`;
  }
  $('slots').innerHTML = h;
}
$('slots').addEventListener('click', async e => {
  audio.unlock();
  const d = e.target.closest('[data-del]'); if (d) { e.stopPropagation(); if (confirm('Start Island ' + (+d.dataset.del + 1) + ' over? Its save will be erased.')) { await store.del(+d.dataset.del); showTitle(); } return; }
  const b = e.target.closest('.slot'); if (b) start(+b.dataset.n);
});
async function start(n, seedOverride) {
  slot = n; const raw = await store.get(n); let s = null;
  try { if (raw) s = new C.Sim(JSON.parse(raw).seed, raw); } catch (e) { s = null; }
  const fresh = !s; if (!s) s = new C.Sim(seedOverride !== undefined ? seedOverride : (Math.random() * 1e9) >>> 0);
  bindSim(s);
  const h = sim.s.hero; P.x = h.x; P.y = h.y + 0.05; P.z = h.z; P.yaw = h.yaw || 0; P.vx = P.vy = P.vz = 0;
  camS.yaw = Math.PI * 0.15; camS.dist = 11; camS.pitch = 0.62; camS.cy = P.y;
  $('title').classList.add('hidden'); $('hud').classList.remove('hidden'); playing = true; paused = false; bp = null; updBlueprint();
  renderHot(); renderQuest(); setMode('mine');
  if (fresh) { await save(); setTimeout(() => say("Hi there, little Cubby! I'm Moss, keeper of this island. It's a bit empty... shall we make it cosy? Tap me any time for help!", () => { sim.s.talked = true; renderQuest(); if (sim.quest()) say(sim.quest().text); }), 600); }
}
function talk() {
  sim.s.talked = true; renderQuest(); sfx('chirp');
  const q = sim.quest();
  const tips = { tool: 'Tap the pink Craft button. Planks first, then the pick!', bridge: 'The river runs south from the lake, just east of here. Stand on the bank and build over the water.', cave: 'The cave mouth is at the south foot of the mountain. Craft a lantern, then place it inside.', cottage: 'Try a blueprint from the menu. It shows where every block goes!', friend: 'Puffbuns hop around the meadow. Tap one while you carry a flower.', seek: 'Sun Seeds sparkle in high, wet and deep places. Behind the waterfall, perhaps?', deep: 'Craft a Stone Pick, then follow the cave all the way down.', lighthouse: 'Stack a tall tower, at least 8 blocks, and put the Beacon on top. The beach is lovely for it!' };
  say(q ? `${q.title}: ${q.text} ${tips[q.id] || ''}` : 'You did it all! The island is so cosy now. Thank you, Cubby!');
}

// ---------- events from the sim ----------
function onEvent(type, d) {
  if (!playing) return;
  if (type === 'bonk') { sfx('bonk', d.stage); crack.visible = true; crack.position.set(d.x + 0.5, d.y + 0.5, d.z + 0.5); crack.material.map = crackTex[Math.min(2, Math.floor(d.stage * 3))]; crack.material.needsUpdate = true; burst(d.x + 0.5, d.y + 0.9, d.z + 0.5, BLOCKS[d.id].color, 5, 3); }
  else if (type === 'break') { crack.visible = false; sfx('pop'); burst(d.x + 0.5, d.y + 0.5, d.z + 0.5, BLOCKS[d.id].color, 18, 6); if (d.drop) flyItem(d.x, d.y, d.z, d.drop); else renderHot(); if (d.id === B.LANTERN || d.id === B.BEACON) scanLanterns(); renderQuest(); updBlueprint(); }
  else if (type === 'place') { sfx('place'); popIn(d.x, d.y, d.z, d.id); burst(d.x + 0.5, d.y + 0.1, d.z + 0.5, 0xffffff, 6, 2.5); renderHot(); renderQuest(); if (d.id === B.LANTERN || d.id === B.BEACON) scanLanterns(); updBlueprint(); P.squash = 0.2; }
  else if (type === 'deny') { if (d.why && d.why !== 'far' && d.why !== 'empty') { toast(d.why); sfx('deny'); } }
  else if (type === 'craft') { sfx('craft'); toast('Crafted ' + sim.recipe(d.id).name + '!'); renderHot(); renderQuest(); burst(P.x, P.y + 1.2, P.z, 0xffd34a, 14, 4); P.happy = 1.2; }
  else if (type === 'quest') { sfx('quest'); banner('Quest complete!', '★ ' + d.q.title); P.happy = 2; renderQuest(); setTimeout(() => sfx('fanfare'), 900); save();
    if (d.q.unlock.length) setTimeout(() => toast('New recipes: ' + d.q.unlock.map(u => sim.recipe(u).name).join(', ')), 2600);
    setTimeout(() => say(d.next ? 'Wonderful! Here is a Sun Seed for you. Next: ' + d.next.text : 'You finished every quest! Look how the island glows. You are a true Cubby!'), 1800); }
  else if (type === 'seed') { sfx('fanfare'); banner('Sun Seed!', d.name); P.happy = 2; const m = seedMeshes.find(s => s.userData.sd.id === d.id); if (m) { burst(m.position.x, m.position.y, m.position.z, 0xffd34a, 30, 7); ents.remove(m); seedMeshes = seedMeshes.filter(s => s !== m); } renderQuest(); save(); }
  else if (type === 'fed') { sfx('collect'); renderHot(); renderQuest(); }
  else if (type === 'cottage') cottageAlive(d);
  else if (type === 'lighthouse') lightUp(d);
}

// ---------- actions ----------
let task = null;
const reachOk = (x, y, z, r) => { sim.s.hero.x = P.x; sim.s.hero.y = P.y; sim.s.hero.z = P.z; return sim.reach(x, y, z, r); };
function act(kind, hit) {
  if (!hit) return;
  if (kind === 'mine') {
    const can = sim.canMine(hit.x, hit.y, hit.z);
    if (!can.ok && can.why !== 'far') { if (can.why !== 'empty') { toast(can.why); sfx('deny'); } return; }
    task = { kind, x: hit.x, y: hit.y, z: hit.z, t: 0, next: 0 };
  } else {
    let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (hit.id === B.TALLGRASS) { x = hit.x; y = hit.y; z = hit.z; }
    let id = selId(); const want = bpWants(x, y, z); if (want && sim.count(want) > 0) id = want;
    if (id === undefined) { toast('Your pocket is empty. Bonk some blocks first!'); sfx('deny'); return; }
    task = { kind: 'place', x, y, z, id, t: 0 };
  }
}
function runTask(dt) {
  if (!task) return { mx: 0, mz: 0 };
  task.t += dt; if (task.t > 6) { task = null; crack.visible = false; return { mx: 0, mz: 0 }; }
  const tx = task.x + 0.5, tz = task.z + 0.5;
  const inReach = task.kind === 'walk' || task.kind === 'feed' ? Math.hypot(tx - P.x, tz - P.z) < (task.kind === 'feed' ? 1.8 : 0.7) : reachOk(task.x, task.y, task.z, task.kind === 'place' ? 5.2 : 4.3);
  if (!inReach) { const dx = tx - P.x, dz = tz - P.z, l = Math.hypot(dx, dz) || 1; if (l < 0.35) { task = null; return { mx: 0, mz: 0 }; } return { mx: dx / l, mz: dz / l }; }
  P.yaw = Math.atan2(tx - P.x, tz - P.z);
  if (task.kind === 'mine') {
    task.next -= dt;
    if (task.next <= 0) { P.bonkT = 0.22; task.next = 0.28; const r = sim.bonk(task.x, task.y, task.z); if (!r.hit || r.broke) task = null; }
  } else if (task.kind === 'place') { sim.place(task.x, task.y, task.z, task.id); task = null; }
  else if (task.kind === 'feed') { const b = task.bun; if (sim.feed()) { b.follow = true; for (let i = 0; i < 6; i++) setTimeout(() => burst(b.m.position.x, b.m.position.y + 0.8, b.m.position.z, 0xff6f9a, 3, 2, { g: -1 }), i * 90); toast('The Puffbun loves you!'); } task = null; }
  else { if (task.then === 'talk') talk(); task = null; }
  return { mx: 0, mz: 0 };
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), sph = new THREE.Sphere(), _hp = new THREE.Vector3();
function pick(sx, sy) {
  ndc.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  const hit = voxRay(o, d, 80, hittable);
  let ent = null, best = hit ? hit.t + 0.6 : 80;
  const test = (x, y, z, r, what) => { sph.center.set(x, y, z); sph.radius = r; if (ray.ray.intersectSphere(sph, _hp)) { const t = _hp.distanceTo(o); if (t < best) { best = t; ent = what; } } };
  if (guide) test(guide.position.x, guide.position.y + 0.6, guide.position.z, 0.9, { kind: 'guide' });
  for (const b of buns) test(b.m.position.x, b.m.position.y + 0.3, b.m.position.z, 0.6, { kind: 'bun', b });
  for (const m of seedMeshes) test(m.position.x, m.position.y, m.position.z, 0.8, { kind: 'seed', m });
  return { hit, ent };
}
function tapAt(sx, sy, kind) {
  const { hit, ent } = pick(sx, sy);
  if (ent) {
    const e = ent.kind === 'guide' ? guide : ent.kind === 'bun' ? ent.b.m : ent.m;
    const x = e.position.x - 0.5, z = e.position.z - 0.5;
    if (ent.kind === 'guide') task = Math.hypot(guide.position.x - P.x, guide.position.z - P.z) < 6 ? (talk(), null) : { kind: 'walk', x, y: 0, z, t: 0, then: 'talk' };
    else if (ent.kind === 'bun') task = { kind: 'feed', bun: ent.b, x, y: 0, z, t: 0 };
    else task = { kind: 'walk', x, y: 0, z, t: 0 };
    return;
  }
  act(kind, hit);
}
function hover(sx, sy, show) {
  if (!show || !playing) { ghost.visible = false; sel.visible = false; return; }
  const { hit } = pick(sx, sy);
  if (!hit) { ghost.visible = sel.visible = false; return; }
  let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz; if (hit.id === B.TALLGRASS) { x = hit.x; y = hit.y; z = hit.z; }
  const id = bpWants(x, y, z) || selId();
  ghost.visible = id !== undefined && (mode === 'build' || !TOUCH); ghost.position.set(x + 0.5, y + 0.5, z + 0.5);
  if (id !== undefined) ghost.material.color.setHex(BLOCKS[id].color);
  sel.visible = true; sel.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
}

// ---------- input ----------
const keys = {}; const stick = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
const looks = new Map(); let pinchD = 0, jumpReq = false;
const camS = { yaw: 0, pitch: 0.62, dist: 11, cy: 0, cyaw: 0, cpitch: 0.62, cdist: 11 };
addEventListener('keydown', e => {
  if (!playing) return;
  keys[e.code] = true; audio.unlock();
  if (e.code === 'Space') { jumpReq = true; e.preventDefault(); }
  if (e.code === 'KeyE') { $('craft').classList.contains('hidden') ? openCraft() : closeCraft(); }
  if (e.code === 'Escape') { if (!$('craft').classList.contains('hidden')) closeCraft(); else paused ? closePause() : openPause(); }
  if (e.code === 'KeyQ') setMode(mode === 'mine' ? 'build' : 'mine');
  if (/^Digit[1-9]$/.test(e.code)) { const i = +e.code[5] - 1; if (hotIds[i] !== undefined) { hotSel = i; renderHot(); } }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
const stickEl = $('stick'), knob = stickEl.firstElementChild;
canvas.addEventListener('pointerdown', e => {
  audio.unlock(); if (!playing) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
  if (e.pointerType !== 'mouse' && stick.id === null && e.clientX < innerWidth * 0.4 && e.clientY > innerHeight * 0.3) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
    stickEl.style.left = (e.clientX - stickEl.offsetWidth / 2) + 'px'; stickEl.style.top = (e.clientY - stickEl.offsetHeight / 2) + 'px'; stickEl.style.bottom = 'auto'; return;
  }
  const L = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), drag: false, btn: e.button, type: e.pointerType, lp: null };
  looks.set(e.pointerId, L);
  if (looks.size === 2) { const [a, b] = [...looks.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); for (const l of looks.values()) { l.drag = true; clearTimeout(l.lp); } }
  if (e.pointerType !== 'mouse') {
    if (mode === 'build') hover(e.clientX, e.clientY, true);
    L.lp = setTimeout(() => { if (!L.drag && looks.get(e.pointerId) === L) { L.done = true; const m0 = mode; mode = 'build'; hover(L.x, L.y, true); tapAt(L.x, L.y, 'place'); mode = m0; setTimeout(() => hover(0, 0, false), 300); if (navigator.vibrate) navigator.vibrate(12); } }, 480);
  }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId === stick.id) {
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const l = Math.hypot(dx, dy), mx = 52; if (l > mx) { dx *= mx / l; dy *= mx / l; }
    stick.x = dx / mx; stick.y = dy / mx; knob.style.transform = `translate(${dx}px,${dy}px)`; return;
  }
  const L = looks.get(e.pointerId);
  if (!L) { if (e.pointerType === 'mouse' && playing) hover(e.clientX, e.clientY, true); return; }
  const dx = e.clientX - L.x, dy = e.clientY - L.y; L.x = e.clientX; L.y = e.clientY;
  if (looks.size === 2) { const [a, b] = [...looks.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinchD && d) camS.dist = clamp(camS.dist * pinchD / d, 4.5, 26); pinchD = d; return; }
  if (!L.drag && Math.hypot(L.x - L.sx, L.y - L.sy) > (L.type === 'mouse' ? 5 : 10)) { L.drag = true; clearTimeout(L.lp); if (L.type !== 'mouse') hover(0, 0, false); }
  if (L.drag) { camS.yaw -= dx * 0.0065; camS.pitch = clamp(camS.pitch + dy * 0.0045, 0.12, 1.25); }
  else if (L.type !== 'mouse' && mode === 'build') hover(L.x, L.y, true);
});
function endPointer(e) {
  if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; stickEl.style.left = ''; stickEl.style.top = ''; stickEl.style.bottom = ''; return; }
  const L = looks.get(e.pointerId); if (!L) return; looks.delete(e.pointerId); clearTimeout(L.lp); if (looks.size < 2) pinchD = 0;
  if (e.type === 'pointercancel' || L.drag || L.done) { if (L.type !== 'mouse') hover(0, 0, false); return; }
  if (L.type === 'mouse') tapAt(L.x, L.y, L.btn === 2 ? 'place' : 'mine');
  else { tapAt(L.x, L.y, mode === 'build' ? 'place' : 'mine'); setTimeout(() => hover(0, 0, false), 250); }
}
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => { camS.dist = clamp(camS.dist * (1 + Math.sign(e.deltaY) * 0.1), 4.5, 26); e.preventDefault(); }, { passive: false });
const jb = $('bJump'); jb.addEventListener('pointerdown', e => { audio.unlock(); jumpReq = true; jb.classList.add('on'); e.preventDefault(); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) jb.addEventListener(ev, () => jb.classList.remove('on'));
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
document.addEventListener('touchend', () => audio.unlock(), { passive: true });

// ---------- camera ----------
const camTarget = new THREE.Vector3(), dir = new THREE.Vector3();
function updCamera(dt, idle) {
  if (idle) camS.yaw += dt * 0.06;
  const k = 1 - Math.exp(-10 * dt);
  camS.cyaw = lerp(camS.cyaw, camS.yaw, k); camS.cpitch = lerp(camS.cpitch, camS.pitch, k); camS.cdist = lerp(camS.cdist, camS.dist, 1 - Math.exp(-6 * dt));
  camS.cy = lerp(camS.cy, P.y, 1 - Math.exp(-6 * dt));
  camTarget.set(P.x, camS.cy + 0.9, P.z);
  if (idle) camTarget.set(64, SEA + 6, 64);
  dir.set(Math.sin(camS.cyaw) * Math.cos(camS.cpitch), Math.sin(camS.cpitch), Math.cos(camS.cyaw) * Math.cos(camS.cpitch));
  let dist = idle ? 105 : camS.cdist;
  if (!idle) { const h = voxRay(camTarget, dir, dist, camBlock); if (h) dist = Math.max(1.6, h.t - 0.35); }
  camera.position.copy(camTarget).addScaledVector(dir, dist); camera.lookAt(camTarget);
}

// ---------- frame ----------
let last = performance.now(), fps = 60, frames = 0, bootDone = false, lightScan = 0, chirpT = 4, qtCache = { t: 0, v: null };
function questTarget() {
  const q = sim.quest(); if (!q) return null;
  if (performance.now() - qtCache.t < 1500) return qtCache.v; qtCache.t = performance.now();
  const near = id => { let best = null, bd = 1e9; const x0 = Math.floor(P.x), z0 = Math.floor(P.z); for (let z = Math.max(0, z0 - 40); z < Math.min(D, z0 + 40); z++) for (let x = Math.max(0, x0 - 40); x < Math.min(W, x0 + 40); x++) { const y = surf(x + 0.5, z + 0.5) - 1; for (let yy = y; yy > y - 6 && yy > 0; yy--) if (sim.world.get(x, yy, z) === id) { const d = (x - P.x) ** 2 + (z - P.z) ** 2; if (d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; } break; } } return best; };
  const Lm = C.LANDMARKS; let v = null;
  if (q.id === 'wood') v = near(B.LOG); else if (q.id === 'stone') v = near(B.STONE);
  else if (q.id === 'bridge') v = { x: C.riverX(92), z: 92 }; else if (q.id === 'cave' || q.id === 'deep') v = { x: Lm.mountain.x + 2, z: Lm.mountain.z + 22 };
  else if (q.id === 'friend') { const b = buns.find(b => !b.follow); v = b && { x: b.m.position.x, z: b.m.position.z }; }
  else if (q.id === 'seek') { let bd = 1e9; for (const m of seedMeshes) { const d = Math.hypot(m.position.x - P.x, m.position.z - P.z); if (d < bd) { bd = d; v = { x: m.position.x, z: m.position.z }; } } }
  return qtCache.v = v;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; fps = lerp(fps, 1 / Math.max(dt, 1e-3), 0.05); frames++;
  U.time.value = now / 1000; skyU.time.value = now / 1000;
  flushMesh();
  if (!sim) return;
  if (!bootDone && allMeshed()) { bootDone = true; window.__booted = true; $('loading').style.display = 'none'; }
  const live = playing && !paused;
  if (live) {
    sim.s.time = (sim.s.time + dt / 480) % 1; sim.s.playTime = (sim.s.playTime || 0) + dt;
    let mx = 0, mz = 0;
    const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), kz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    let ix = stick.x + kx, iz = stick.y + kz; const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const steer = il > 0.12;
    if (steer) {
      if (task && !(task.kind === 'mine' && reachOk(task.x, task.y, task.z, 4.3))) task = null;
      const fx = -Math.sin(camS.yaw), fz = -Math.cos(camS.yaw), rx = Math.cos(camS.yaw), rz = -Math.sin(camS.yaw);
      mx = rx * ix - fx * iz; mz = rz * ix - fz * iz;
    }
    const auto = runTask(dt); if (!steer) { mx = auto.mx; mz = auto.mz; }
    physics(dt, mx, mz, jumpReq || (keys.Space && P.ground)); jumpReq = false;
    const spd = Math.hypot(P.vx, P.vz);
    if (spd > 0.4) { P.yaw = Math.atan2(P.vx, P.vz); P.walk += dt * spd * 3.2; P.stepT -= dt; if (P.stepT <= 0 && P.ground) { P.stepT = 0.3; sfx('step'); } }
    sim.s.hero.x = P.x; sim.s.hero.y = P.y; sim.s.hero.z = P.z;
    for (const m of seedMeshes.slice()) if (Math.hypot(m.position.x - P.x, m.position.y - (P.y + 0.6), m.position.z - P.z) < 1.5) sim.collectSeed(m.userData.sd.id);
    saveT += dt; if (saveT > 15) { saveT = 0; save(); }
    if (!task && crack.visible) crack.visible = false;
  }
  // hero animation: squash & stretch, waddle, blink, bonk lean
  const hb = hero.body; P.squash = lerp(P.squash, 0, 1 - Math.exp(-9 * dt));
  const sp = Math.hypot(P.vx, P.vz), wk = Math.min(1, sp / 3), wob = Math.sin(P.walk * 2) * wk;
  const st = !P.ground && !P.inWater ? clamp(Math.abs(P.vy) * 0.025, 0, 0.18) : 0, sq = P.squash;
  hb.scale.set(1 + sq * 0.5 - st * 0.5, 1 - sq + st + Math.sin(now / 400) * 0.015, 1 + sq * 0.5 - st * 0.5);
  hb.position.y = Math.abs(wob) * 0.08 + (P.inWater ? Math.sin(now / 300) * 0.05 : 0); hb.rotation.z = wob * 0.08;
  P.bonkT = Math.max(0, P.bonkT - dt); const bk = P.bonkT > 0 ? Math.sin((1 - P.bonkT / 0.22) * Math.PI) : 0;
  hb.rotation.x = bk * 0.45; hero.pick.visible = !!sim.s.tool; hero.pick.rotation.x = 0.6 - bk * 2.2; hero.pickHead.material.color.setHex(sim.s.tool >= 2 ? 0xb9b6c8 : 0xe8b77d);
  const fs = Math.sin(P.walk * 2) * Math.min(1, sp / 2);
  hero.feet[0].position.z = 0.05 + fs * 0.16; hero.feet[1].position.z = 0.05 - fs * 0.16;
  hero.feet[0].position.y = 0.06 + Math.max(0, fs) * 0.08; hero.feet[1].position.y = 0.06 + Math.max(0, -fs) * 0.08;
  hero.arms[0].position.y = 0.38 + wob * 0.05 + bk * 0.15; hero.arms[1].position.y = 0.38 - wob * 0.05 + bk * 0.15;
  P.blink -= dt; if (P.blink < -0.12) P.blink = 2 + Math.random() * 3; P.happy = Math.max(0, P.happy - dt);
  const ey = P.blink < 0 ? 0.1 : bk > 0.3 ? 0.25 : P.happy > 0 ? 0.45 : 1; for (const e of hero.eyes) e.scale.y = lerp(e.scale.y, ey, 0.5);
  hero.mouth.scale.set(P.happy > 0 || bk > 0.3 ? 1.5 : 1, P.happy > 0 ? 1.6 : 1, 1);
  hero.g.visible = playing;
  hero.g.position.set(P.x, P.y, P.z);
  let dy = P.yaw - hero.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); hero.g.rotation.y += dy * (1 - Math.exp(-12 * dt));
  let gy = P.y; for (let y = Math.floor(P.y + 0.2); y > 0; y--) if (BLOCKS[sim.world.get(Math.floor(P.x), y - 1, Math.floor(P.z))].solid) { gy = y; break; }
  blob.visible = playing; blob.position.set(P.x, gy + 0.02, P.z); blob.scale.setScalar(clamp(1 - (P.y - gy) * 0.15, 0.4, 1));
  // creatures
  const t = now / 1000;
  if (guide) { guide.lookAt(P.x, guide.position.y, P.z); guide.userData.body.scale.y = 0.9 + Math.sin(t * 2) * 0.03; guide.userData.mark.position.y = 1.7 + Math.sin(t * 4) * 0.1; guide.userData.mark.rotation.y = t * 2; }
  let fi = 0;
  for (const b of buns) {
    const m = b.m; b.t -= dt; let tx = b.tx, tz = b.tz;
    if (b.follow && playing) { const k = 1.3 + (fi++) * 0.9; tx = P.x - Math.sin(P.yaw) * k; tz = P.z - Math.cos(P.yaw) * k; }
    else if (b.t < 0) { b.t = 2 + Math.random() * 3; b.tx = b.home.x + (Math.random() - 0.5) * 10; b.tz = b.home.z + (Math.random() - 0.5) * 10; }
    const dx = tx - m.position.x, dz = tz - m.position.z, dd = Math.hypot(dx, dz), g = surf(m.position.x, m.position.z);
    if (b.hop <= 0 && dd > 0.6 && m.position.y <= g + 0.01) { b.vy = 4.2; b.hop = 1; }
    if (m.position.y > g || b.vy > 0) {
      b.vy -= 18 * dt; const s = Math.min(dd, (b.follow ? 4.5 : 1.6) * dt) / (dd || 1), nx = m.position.x + dx * s, nz = m.position.z + dz * s, ng = surf(nx, nz);
      if ((ng <= m.position.y + 1.1 && ng > SEA + 0.5) || b.follow) { m.position.x = nx; m.position.z = nz; }
      m.position.y += b.vy * dt; if (dd > 0.1) m.rotation.y = Math.atan2(dx, dz);
    }
    const g2 = surf(m.position.x, m.position.z);
    if (m.position.y <= g2) { m.position.y = g2; b.vy = 0; b.hop -= dt * 6; }
    if (b.follow && dd > 14) { m.position.set(P.x, P.y, P.z); }
    const air = m.position.y - g2; m.userData.body.scale.set(air < 0.05 ? 1.12 : 0.95, air < 0.05 ? 0.86 : 1.1, 1);
  }
  for (const b of birds) { b.a += dt * b.s; const m = b.m; m.position.set(b.cx + Math.cos(b.a) * b.r, b.h + Math.sin(b.a * 3) * 1.5, b.cz + Math.sin(b.a) * b.r); m.rotation.y = -b.a; const f = Math.sin(t * 9 + b.r) * 0.6; m.userData.w[0].rotation.z = f; m.userData.w[1].rotation.z = -f; }
  chirpT -= dt; if (chirpT < 0 && playing) { chirpT = 4 + Math.random() * 6; if (skyU.night.value < 0.5) sfx('chirp'); }
  for (const m of seedMeshes) { m.rotation.y = t * 1.6; m.position.y = m.userData.sd.y + Math.sin(t * 2 + m.position.x) * 0.12; }
  // day / night
  const tod = playing ? sim.s.time : 0.42, a = (tod - 0.25) * Math.PI * 2;
  const sunDir = _s.set(Math.cos(a), Math.sin(a), 0.35).normalize(), up = sunDir.y;
  const night = smooth(0.05, -0.2, up); skyU.night.value = night; audio.night = night;
  skyU.top.value.copy(skyAt(tod, 1)); skyU.hor.value.copy(skyAt(tod, 2)); skyU.sunDir.value.copy(sunDir); skyU.sunCol.value.copy(skyAt(tod, 3)).multiplyScalar(1 - night * 0.7);
  scene.fog.color.copy(skyU.hor.value).lerp(skyU.top.value, 0.25);
  const ld = up > -0.05 ? sunDir : _p.set(-sunDir.x, -sunDir.y, sunDir.z).normalize();
  const fx = playing ? P.x : 64, fz = playing ? P.z : 64, fy = playing ? P.y : SEA;
  sun.position.set(fx + ld.x * 60, fy + Math.max(ld.y, 0.25) * 60, fz + ld.z * 60); sun.target.position.set(fx, fy, fz);
  const big = !playing; sun.shadow.camera.left = sun.shadow.camera.bottom = big ? -75 : -30; sun.shadow.camera.right = sun.shadow.camera.top = big ? 75 : 30; sun.shadow.camera.updateProjectionMatrix();
  sun.color.copy(skyAt(tod, 3)); sun.intensity = skyAt(tod, 4);
  hemi.intensity = 0.55 + (1 - night) * 0.6 + (beam ? night * 0.35 : 0); hemi.color.copy(skyU.top.value).lerp(tmpB.setHex(0xffffff), 0.6);
  U.glow.value = 0.35 + night * 1.4;
  sky.position.copy(camera.position);
  lightScan -= dt; if (lightScan < 0 && lanternLights.length) { lightScan = 0.4; const list = lanterns.slice().sort((p, q) => Math.hypot(p[0] - P.x, p[2] - P.z) - Math.hypot(q[0] - P.x, q[2] - P.z)); lanternLights.forEach((l, i) => { const p = list[i]; if (p) { l.position.set(p[0], p[1] + 0.2, p[2]); l.userData.on = 1; } else l.userData.on = 0; }); }
  for (const l of lanternLights) l.intensity = (l.userData.on || 0) * (2 + night * 6) * (settings.low ? 0.7 : 1);
  if (beam) { beam.children[0].rotation.y = t * 0.8; beam.children[0].visible = night > 0.2; beam.children[1].intensity = 10 + night * 40; }
  if (playing && Math.random() < dt * 14) { const L = C.LANDMARKS.waterfall; if (Math.hypot(L.x - P.x, L.z - P.z) < 40) burst(L.x + 0.5 + Math.random(), SEA + 0.9, L.z - 1 + Math.random() * 3, 0xe8fbff, 1, 2.5, { s: 1.3 }); }
  if (cottageFx) { cottageFx.t -= dt; if (cottageFx.t < 0) { cottageFx.t = 0.35; burst(cottageFx.x + 1, cottageFx.y, cottageFx.z, 0xf0f0f5, 1, 0.4, { g: -1.2, s: 2.5 }); } cottageFx.light.intensity = 3 + night * 8; }
  if (arrow) {
    const tgt = live ? questTarget() : null;
    arrow.visible = !!tgt && Math.hypot(tgt.x - P.x, tgt.z - P.z) > 7 && !task;
    if (arrow.visible) { arrow.position.set(P.x, P.y + 1.9 + Math.sin(t * 4) * 0.08, P.z); arrow.lookAt(tgt.x, P.y + 1.9, tgt.z); }
  }
  updParts(dt); updFlyers(dt);
  updCamera(dt, !playing);
  renderer.render(scene, camera);
}

// ---------- test / debug API ----------
window.CI = {
  get sim() { return sim; }, get P() { return P; }, get fps() { return fps; }, get frames() { return frames; }, get playing() { return playing; }, audio, camS,
  start, save, showTitle, tapAt, setMode, openCraft, closeCraft, openPause, closePause, startBlueprint, get mode() { return mode; },
  get meshed() { return allMeshed(); }, get worker() { return !!worker; }, get chunkCount() { return chunks.size; }, get task() { return task; },
  setHero(x, y, z) { P.x = x; P.y = y; P.z = z; P.vx = P.vy = P.vz = 0; camS.cy = y; },
  setTime(t) { sim.s.time = t; }, view(yaw, pitch, dist) { camS.yaw = camS.cyaw = yaw; if (pitch !== undefined) camS.pitch = camS.cpitch = pitch; if (dist !== undefined) camS.dist = camS.cdist = dist; },
  project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, z: v.z }; },
  give(id, n) { sim.add(id, n); renderHot(); }, renderHot, renderQuest, selectItem(id) { renderHot(); const i = hotIds.indexOf(id); if (i >= 0) { hotSel = i; renderHot(); } return i; },
  surf: (x, z) => surf(x, z), hideBubble() { $('bubble').classList.add('hidden'); },
};

resize(); applyLow();
showTitle().then(() => requestAnimationFrame(frame));
