/* Pocket Weather: you are the weather. Main game module: rendering, input, weather effects, UI, saves. */
import * as THREE from './vendor/three.module.js';
import * as A from './art.js?v=__BUILD__';
import { Audio } from './audio.js?v=__BUILD__';

const BUILD = '__BUILD__';
const L = window.PWLogic, LV = window.PWLevels;
if (!L || !LV) throw new Error('Game data did not load (logic/levels missing)');
const { T, O } = L;
const LEVELS = LV.LEVELS, WORLDS = LV.WORLDS;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const HSTEP = A.HSTEP;
const $ = s => document.querySelector(s);
const shared = { windPulse: 0 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => 1 - Math.pow(1 - k, 3);
const easeIO = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const backOut = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }

// ───────────────────────── save ─────────────────────────
const SAVE_KEY = 'pocketweather.save.v1';
const freshSave = L.freshSave;
let save = loadSave();
function loadSave() {
  try { return L.mergeSave(localStorage.getItem(SAVE_KEY)); } catch (e) { return freshSave(); }
}
let saveTimer = null;
function persist(now) {
  const write = () => { saveTimer = null; try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage full or private mode */ } };
  if (now) { if (saveTimer) clearTimeout(saveTimer); write(); } else if (!saveTimer) saveTimer = setTimeout(write, 400);
}
function lvSave(id) { return save.levels[id] || (save.levels[id] = { done: false, best: null, drops: [false, false, false], challenge: false, plays: 0 }); }
function unlocked(k) { return (DEBUG && params.has('unlock')) || L.isUnlocked(save, LEVELS, k); }
function totalDrops() { let n = 0; for (const id in save.levels) n += save.levels[id].drops.filter(Boolean).length; return n; }
function doneCount() { return LEVELS.filter(l => (save.levels[l.id] || {}).done).length; }
function challengeCount() { return LEVELS.filter(l => (save.levels[l.id] || {}).challenge).length; }

const ACHIEVEMENTS = [
  { id: 'first', name: 'First Drizzle', desc: 'Guide your friend home for the first time.', test: () => doneCount() >= 1 },
  { id: 'meadow', name: 'Meadow Mender', desc: 'Finish Puddle Meadow.', test: () => LEVELS.filter(l => l.world === 0).every(l => (save.levels[l.id] || {}).done) },
  { id: 'rainmaker', name: 'Rainmaker', desc: 'Make it rain 40 times.', test: () => save.stats.rain >= 40 },
  { id: 'sunny', name: 'Sunny Disposition', desc: 'Shine the sun 40 times.', test: () => save.stats.sun >= 40 },
  { id: 'gale', name: 'Gale Force', desc: 'Blow 40 gusts of wind.', test: () => save.stats.wind >= 40 },
  { id: 'rainbow', name: 'Over the Rainbow', desc: 'Make a rainbow bridge.', test: () => save.stats.rainbows >= 1 },
  { id: 'splash', name: 'Splish Splash', desc: 'Give your friend 5 surprise baths.', test: () => save.stats.splashes >= 5 },
  { id: 'flyer', name: 'Frequent Flyer', desc: 'Glide on the wind 3 times.', test: () => save.stats.glides >= 3 },
  { id: 'thunder', name: 'Thunderstruck', desc: 'Strike lightning 10 times.', test: () => save.stats.bolt >= 10 },
  { id: 'collector', name: 'Sun Catcher', desc: 'Find 30 sun drops.', test: () => totalDrops() >= 30 },
  { id: 'forecast', name: 'Perfect Forecast', desc: 'Beat 10 weather challenges.', test: () => challengeCount() >= 10 },
  { id: 'master', name: 'Master of Weather', desc: 'Reach the end of the Sky Garden.', test: () => doneCount() >= LEVELS.length }
];
function checkAchievements() {
  ACHIEVEMENTS.forEach(a => { if (!save.ach[a.id] && a.test()) { save.ach[a.id] = Date.now(); persist(); toast('🏅 ' + a.name, a.desc); audio.star(); } });
}

// ───────────────────────── renderer ─────────────────────────
const canvas = $('#scene');
let renderer, gl2 = false;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
} catch (e) {
  $('#nogl').classList.remove('hidden'); window.__pwBooted && window.__pwBooted();
  throw new Error('WebGL unavailable: ' + e.message);
}
gl2 = renderer.capabilities.isWebGL2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const audio = new Audio();
audio.setVolumes(save.settings.music, save.settings.sfx);

let W = 1, H = 1, DPR = 1;
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

// post: tilt-shift + vignette + gentle grade. Falls back to direct rendering if anything goes wrong.
let post = null;
function makePost() {
  try {
    const ext = renderer.extensions;
    const half = gl2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: gl2 ? 4 : 0, depthBuffer: true });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uFocus: { value: 0.5 }, uRange: { value: 0.16 }, uAmount: { value: 1 }, uVig: { value: 0.28 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocus, uRange, uAmount, uVig;
        vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float d = abs(vUv.y - uFocus);
          float b = smoothstep(uRange, uRange + 0.32, d) * uAmount * 9.0;
          if (b > 0.05) {
            vec3 acc = c; float w = 1.0;
            for (int i = 0; i < 12; i++) {
              float a = float(i) * 2.39996; float r = sqrt(float(i) + 0.5) / 3.5;
              vec2 o = vec2(cos(a), sin(a)) * r * b / uRes;
              acc += texture2D(tDiffuse, vUv + o).rgb; w += 1.0;
            }
            c = acc / w;
          }
          c = toSRGB(c);
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(l), c, 1.08);
          vec2 q = vUv - 0.5; float v = 1.0 - dot(q, q) * uVig * 2.0;
          gl_FragColor = vec4(c * v, 1.0);
        }`,
      depthTest: false, depthWrite: false
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const quad = new THREE.Mesh(geo, mat); quad.frustumCulled = false;
    const scene = new THREE.Scene(); scene.add(quad);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { rt, mat, scene, cam, ok: true };
  } catch (e) { return null; }
}

function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  W = vw; H = vh;
  const maxDpr = save.settings.reducedEffects ? 1.5 : 2;
  DPR = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(DPR);
  renderer.setSize(vw, vh, false);
  canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
  camera.aspect = vw / vh; camera.updateProjectionMatrix();
  if (post) { post.rt.setSize(Math.round(vw * DPR), Math.round(vh * DPR)); post.mat.uniforms.uRes.value.set(vw * DPR, vh * DPR); }
  fitCamera();
}
function applyQuality() {
  const fx = !save.settings.reducedEffects;
  renderer.shadowMap.enabled = fx;
  if (fx && !post) post = makePost();
  if (!fx && post) { post.rt.dispose(); post = null; }
  scenes.forEach(sc => sc.traverse(o => { if (o.material && o.material.needsUpdate !== undefined && o.isMesh) o.material.needsUpdate = true; }));
  resize();
}

// ───────────────────────── scenes ─────────────────────────
const scene = new THREE.Scene();       // the level / title island
const mapScene = new THREE.Scene();    // the overworld board
const scenes = [scene, mapScene];
let activeScene = scene;

function skyTexture(top, bot) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(0.65, bot); g.addColorStop(1, bot);
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function lights(sc, P) {
  const hemi = new THREE.HemisphereLight(new THREE.Color('#ffffff'), new THREE.Color(P.side), 1.25); sc.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#fff2dc'), 2.1);
  sun.position.set(-6, 12, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  const sc2 = sun.shadow.camera; sc2.left = -8; sc2.right = 8; sc2.top = 8; sc2.bottom = -8; sc2.near = 1; sc2.far = 40;
  sc.add(sun); sc.add(sun.target);
  const amb = new THREE.AmbientLight(0xffffff, 0.35); sc.add(amb);
  return { hemi, sun, amb };
}

// soft background clouds drifting around the island
function makeCloudBank(sc, n, radius, y0, rand) {
  const g = new THREE.Group(), m = A.toon('#ffffff', { rim: 0.5 });
  const list = [];
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    const k = 3 + (rand() * 3 | 0);
    for (let j = 0; j < k; j++) { const r = 0.6 + rand() * 0.9; c.add(A.mesh(A.G.sphere(12), m, (j - k / 2) * 0.9 + rand() * 0.4, rand() * 0.4, rand() * 0.6, r, r * 0.7, r)); }
    const a = rand() * Math.PI * 2, rr = radius * (0.8 + rand() * 0.5);
    c.position.set(Math.cos(a) * rr, y0 + rand() * 6 - 3, Math.sin(a) * rr);
    c.userData = { a, rr, sp: 0.01 + rand() * 0.02 };
    g.add(c); list.push(c);
  }
  g.userData.update = (t, dt) => list.forEach(c => { c.userData.a += dt * c.userData.sp; c.position.x = Math.cos(c.userData.a) * c.userData.rr; c.position.z = Math.sin(c.userData.a) * c.userData.rr; });
  sc.add(g);
  return g;
}

// ───────────────────────── particles ─────────────────────────
class Particles {
  constructor(max, additive) {
    this.max = max; this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.shape = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aShape; attribute vec3 color; uniform float uScale;
        varying vec3 vCol; varying float vA; varying float vS;
        void main(){ vCol = color; vA = aAlpha; vS = aShape; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 96.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `precision mediump float; varying vec3 vCol; varying float vA; varying float vS;
        void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float a = 0.0;
          if (vS < 0.5) { a = smoothstep(1.0, 0.55, length(p)); }
          else if (vS < 1.5) { float r = length(p); float ang = atan(p.y, p.x); float s = 0.35 + 0.65 * pow(abs(cos(ang * 2.0)), 6.0); a = smoothstep(s, s * 0.4, r); }
          else if (vS < 2.5) { float r = length(p); float ang = atan(p.y, p.x); float arm = abs(sin(ang * 3.0)); a = smoothstep(0.16, 0.0, arm * r) * smoothstep(1.0, 0.8, r) + smoothstep(0.3, 0.1, r); }
          else if (vS < 3.5) { vec2 q = p; q.x *= 2.4; q.y = q.y * 0.9 + 0.2; float r = length(q) - max(0.0, -p.y) * 0.0; a = smoothstep(1.0, 0.7, length(vec2(q.x / (1.0 + max(0.0, -p.y)), q.y))); }
          else { float r = length(p); a = smoothstep(0.15, 0.0, abs(r - 0.75)); }
          if (a < 0.01) discard; gl_FragColor = vec4(vCol, a * vA); }`
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 10;
    this.geo = g;
  }
  spawn(o) {
    if (this.list.length >= this.max) this.list.shift();
    const c = new THREE.Color(o.color || '#ffffff');
    this.list.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, age: 0, size: o.size || 0.1, r: c.r, g: c.g, b: c.b,
      shape: o.shape || 0, grav: o.grav === undefined ? 0 : o.grav, drag: o.drag || 0, fade: o.fade === undefined ? 1 : o.fade, grow: o.grow || 0, floor: o.floor, wob: o.wob || 0 });
  }
  update(dt) {
    const L2 = this.list; let n = 0;
    for (let i = 0; i < L2.length; i++) {
      const p = L2[i]; p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= p.grav * dt; const dr = Math.max(0, 1 - p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt + (p.wob ? Math.sin(p.age * 3 + i) * p.wob * dt : 0); p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.age = p.life; if (p.onFloor) p.onFloor(p); continue; }
      L2[n++] = p;
    }
    L2.length = n;
    for (let i = 0; i < n; i++) {
      const p = L2[i], k = p.age / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.size * (1 + p.grow * k); this.alpha[i] = p.fade ? Math.min(1, (1 - k) * 2) * Math.min(1, p.age * 12) : 1; this.shape[i] = p.shape;
    }
    this.geo.setDrawRange(0, n);
    ['position', 'color', 'aSize', 'aAlpha', 'aShape'].forEach(a => { this.geo.attributes[a].needsUpdate = true; });
  }
  clear() { this.list.length = 0; this.geo.setDrawRange(0, 0); }
}
const fxN = new Particles(900, false), fxA = new Particles(500, true);
function puff(x, y, z, n, o = {}) {
  const fxLimit = save.settings.reducedEffects ? 0.5 : 1;
  n = Math.max(1, Math.round(n * fxLimit));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (o.speed || 1.5) * (0.4 + Math.random() * 0.6), up = o.up === undefined ? 1.5 : o.up;
    (o.add ? fxA : fxN).spawn({ x: x + (Math.random() - 0.5) * (o.spread || 0.2), y: y + (Math.random() - 0.2) * (o.spreadY || 0.1), z: z + (Math.random() - 0.5) * (o.spread || 0.2),
      vx: Math.cos(a) * sp, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * sp, life: (o.life || 0.8) * (0.6 + Math.random() * 0.6), size: (o.size || 0.12) * (0.6 + Math.random() * 0.8),
      color: Array.isArray(o.color) ? o.color[i % o.color.length] : (o.color || '#ffffff'), shape: o.shape || 0, grav: o.grav === undefined ? 4 : o.grav, drag: o.drag || 1.5, grow: o.grow || 0, wob: o.wob || 0 });
  }
}

// ───────────────────────── level visuals ─────────────────────────
const GRASS = ['#8fd46b', '#b8df7c', '#c4e6c4', '#a6d98f', '#a3e48e'];
const DEFAULT_GROUND = [T.GRASS, T.SAND, T.SNOW, T.STONE, T.GRASS];
const lvRoot = new THREE.Group(); scene.add(lvRoot);
scene.add(fxN.points); scene.add(fxA.points);
let P = A.PALETTES[0];
let sceneLights = lights(scene, P);
let cloudBank = null;

const view = { yaw: -0.55, yawV: 0, pitch: 0.92, dist: 14, target: new THREE.Vector3(0, 0.2, 0), shake: 0, zoomTo: 1, bob: 0, fitW: 8, fitH: 4, maxH: 1, title: false };

const lv = {
  def: null, s: null, k: 0, cells: [], objs: new Map(), pick: [], wanderer: null, goal: null, secrets: [], arcs: [],
  walk: null, wait: 0.8, mood: { rain: 0, snow: 0, wind: 0, sun: 0, cold: 0 }, uses: 0, won: false, startTime: 0, fails: 0, hintShown: false,
  log: [], idleT: 0, stepCount: 0, lastProgress: 0, winT: 0
};

function cellPos(x, y, out) { out = out || new THREE.Vector3(); return out.set(x - (lv.s.w - 1) / 2, 0, y - (lv.s.h - 1) / 2); }
function cellTopY(i) {
  const s = lv.s, t = s.t[i];
  let y = L.height(s, i) * HSTEP;
  if (t === T.MUSH) y += 0.48;
  else if (t === T.STEPS) y += 0.12;
  else if (t === T.POND || t === T.WATER) y -= 0.06;
  else if (t === T.ICE) y -= 0.02;
  return y;
}
function standPos(x, y, out) {
  out = cellPos(x, y, out);
  const i = L.idx(lv.s, x, y);
  out.y = cellTopY(i);
  if (lv.s.t[i] === T.RAINBOW) out.y += rainbowLift(x, y);
  return out;
}
function rainbowLift(x, y) {
  for (const a of lv.arcs) {
    if (a.y1 === a.y2 && y === a.y1 && x > Math.min(a.x1, a.x2) && x < Math.max(a.x1, a.x2)) return Math.sin((x - Math.min(a.x1, a.x2)) / Math.abs(a.x2 - a.x1) * Math.PI) * a.h;
    if (a.x1 === a.x2 && x === a.x1 && y > Math.min(a.y1, a.y2) && y < Math.max(a.y1, a.y2)) return Math.sin((y - Math.min(a.y1, a.y2)) / Math.abs(a.y2 - a.y1) * Math.PI) * a.h;
  }
  return 0;
}

function disposeGroup(g) { if (g && g.parent) g.parent.remove(g); }

function groundColorFor(t) {
  const w = lv.def.world;
  switch (t) {
    case T.GRASS: case T.START: case T.GOAL: case T.SPORE: case T.MUSH: return GRASS[w];
    case T.DIRT: case T.MUD: case T.FROZEN: return '#dca56c';
    case T.STONE: case T.PUDDLE: case T.RUBBLE: return w === 3 ? P.ground : '#d9dfeb';
    case T.SAND: return '#f6d995';
    case T.SNOW: return '#f7faff';
    case T.ASH: return '#b9b2a8';
    case T.RSTONE: return '#efe9fb';
  }
  const d = DEFAULT_GROUND[w];
  return d === T.GRASS ? GRASS[w] : d === T.SAND ? '#f6d995' : d === T.SNOW ? '#f7faff' : P.ground;
}

function buildCell(i, pop) {
  const s = lv.s, t = s.t[i], x = i % s.w, y = (i / s.w) | 0;
  const old = lv.cells[i];
  if (old) disposeGroup(old.group);
  const g = new THREE.Group(); cellPos(x, y, g.position);
  const rand = rng(i * 7919 + 13 + lv.k * 101);
  const baseY = s.hh[i] * HSTEP;
  const top = new THREE.Group(); top.position.y = baseY; g.add(top);
  const watery = t === T.WATER || t === T.POND || t === T.ICE || t === T.BASIN;
  const gap = t === T.VOID || t === T.SPROUT || t === T.VINE || t === T.DRAW || t === T.DRAWON || t === T.RAINBOW;
  const updaters = [];
  if (!gap) {
    const col = A.column(P, baseY - (watery ? 0.3 : 0), i); g.add(col);
    if (watery) {
      // water sits in a basin a little lower than the ground
      if (t === T.BASIN) top.add(A.basinRim(P));
      else {
        const wtr = A.water(P, 0.25, false, rand); top.add(wtr); updaters.push(wtr);
        if (t === T.POND && (s.f[i] & L.F_LILY)) { const lp = A.lilyPads(rand); top.add(lp); updaters.push(lp); }
        if (t === T.ICE) top.add(A.iceSheet());
      }
    } else {
      top.add(A.cap(groundColorFor(t)));
      switch (t) {
        case T.GRASS: case T.START: top.add(A.grassDecor(P, rand, false)); break;
        case T.GOAL: break;
        case T.DIRT: for (let k = 0; k < 3; k++) top.add(A.mesh(A.G.ico(), A.toon('#c48f5a', { flat: true }), (rand() - 0.5) * 0.6, 0.02, (rand() - 0.5) * 0.6, 0.04 + rand() * 0.03)); break;
        case T.MUD: { const m = A.mudTop(false); top.add(m); updaters.push(m); break; }
        case T.FROZEN: top.add(A.mudTop(true)); break;
        case T.STONE: top.add(A.flagstones(P, rand)); break;
        case T.PUDDLE: top.add(A.flagstones(P, rand)); top.add(A.puddle(rand)); break;
        case T.RUBBLE: top.add(A.rubble(P, rand)); break;
        case T.SAND: if (rand() < 0.4) top.add(A.mesh(A.G.sphere(8), A.toon('#ffb3a0'), (rand() - 0.5) * 0.5, 0.02, (rand() - 0.5) * 0.5, 0.05, 0.03, 0.05)); break;
        case T.SNOW: if (rand() < 0.5) top.add(A.mesh(A.G.sphere(10), A.toon('#ffffff'), (rand() - 0.5) * 0.5, 0.0, (rand() - 0.5) * 0.5, 0.12, 0.06, 0.12)); break;
        case T.ASH: for (let k = 0; k < 3; k++) top.add(A.mesh(A.G.cone(4), A.toon('#8fd46b', { sway: 0.5 }), (rand() - 0.5) * 0.5, 0.04, (rand() - 0.5) * 0.5, 0.025, 0.08, 0.025)); break;
        case T.SPORE: top.add(A.mushroom(false)); top.add(A.grassDecor(P, rand, false)); break;
        case T.MUSH: { const m = A.mushroom(true); top.add(m); g.userData.mush = m; break; }
        case T.ICEBLOCK: top.add(A.iceBlock()); break;
        case T.FIRE: { const f = A.fire(); top.add(f); updaters.push(f); break; }
        case T.BUSH: top.add(A.bush()); break;
        case T.ROCK: top.add(A.rock(P)); break;
        case T.FLOWER: case T.FLOWERON: { const f = A.sunflower(t === T.FLOWERON); top.add(f); updaters.push(f); break; }
        case T.GATE: case T.GATEOPEN: { const gt = A.gate(t === T.GATEOPEN); top.add(gt); g.userData.gate = gt; break; }
        case T.MILL: { const m = A.windmill(P); top.add(m); updaters.push(m); g.userData.mill = m; break; }
        case T.LIFT: {
          const lt = A.liftTop(P); lt.position.y = (s.f[i] & L.F_UP) ? HSTEP : 0; top.add(lt); g.userData.lift = lt;
          const piston = A.mesh(A.G.cyl(8), A.toon('#e8b75a', { rim: 0.6 }), 0, 0, 0, 0.12, 1, 0.12); piston.position.y = -0.1; top.add(piston); g.userData.piston = piston;
          piston.scale.y = 0.01 + lt.position.y; piston.position.y = lt.position.y / 2 - 0.12; break;
        }
        case T.GEN: case T.GENON: { const c = A.coil(t === T.GENON); top.add(c); updaters.push(c); break; }
        case T.RSTONE: { const r = A.rainbowStone(!!(s.f[i] & L.F_WET)); top.add(r); updaters.push(r); break; }
        case T.STEPS: top.add(A.steps(P)); break;
        case T.TREE: top.add(A.tree(P, lv.def.world, rand)); break;
      }
    }
  } else {
    if (t === T.SPROUT || t === T.VINE) { const sp = A.sproutPod(t === T.VINE); top.add(sp); updaters.push(sp); }
    if (t === T.DRAW || t === T.DRAWON) { const d = A.drawbridge(t === T.DRAWON); top.add(d); g.userData.draw = d; }
  }
  lvRoot.add(g);
  const ups = new Set(); g.traverse(o => { if (o.userData && o.userData.update) ups.add(o); });
  const rec = { group: g, top, updaters: [...ups], t };
  lv.cells[i] = rec;
  if (pop) { rec.pop = 0; top.scale.set(0.6, 0.3, 0.6); }
  // pick target for this cell
  const pk = lv.pick[i];
  if (pk) { pk.position.y = gap ? 0 : cellTopY(i); }
  return rec;
}

function buildObj(i) {
  const s = lv.s, o = s.o[i];
  if (!o) return;
  let m;
  if (o === O.BOAT) m = A.boat();
  else if (o === O.CLOUD) m = A.cloudPlatform();
  else m = A.pile(o === O.SNOWPILE, P);
  const holder = new THREE.Group(); holder.add(m);
  const p = cellPos(i % s.w, (i / s.w) | 0); p.y = s.hh[i] * HSTEP + (o === O.BOAT ? -0.06 : 0);
  holder.position.copy(p);
  lvRoot.add(holder);
  lv.objs.set(i, { holder, mesh: m, kind: o });
}

function makeLabelSprite(text, opts = {}) {
  const c = document.createElement('canvas'), sz = 128; c.width = sz; c.height = sz;
  const x = c.getContext('2d');
  x.fillStyle = opts.bg || '#ffffff'; x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.fill();
  if (opts.ring) { x.lineWidth = 8; x.strokeStyle = opts.ring; x.stroke(); }
  x.fillStyle = opts.fg || '#5a4a7a'; x.font = `800 ${opts.font || 54}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  return sp;
}

function loadLevel(k, opts = {}) {
  const def = typeof k === 'object' ? k : LEVELS[k];
  lv.def = def; lv.k = typeof k === 'object' ? -1 : k;
  lv.s = L.parse(def);
  // already-found drops stay found
  const sv = def.id === 'title' ? { drops: [] } : lvSave(def.id);
  lv.s.secrets.forEach((q, j) => { if (sv.drops[j]) q.taken = true; });
  lv.dropsAtStart = sv.drops.slice();
  lv.won = false; lv.walk = null; lv.wait = 1.0; lv.uses = 0; lv.log = []; lv.idleT = 0; lv.winT = 0; lv.stepCount = 0;
  lv.mood = { rain: 0, snow: 0, wind: 0, sun: 0, cold: 0 }; lv.hintShown = false; lv.hint = null; lv.lastProgress = performance.now();
  lv.armed = false; lv.cloudKind = 'rain';
  lv.startTime = performance.now();
  lv.weathers = L.weathersFor(def);
  // clear
  while (lvRoot.children.length) lvRoot.remove(lvRoot.children[0]);
  lv.cells = []; lv.objs = new Map(); lv.pick = []; lv.secrets = []; lv.arcs = [];
  fxN.clear(); fxA.clear(); clearWeatherFx();
  setPalette(def.world);
  const s = lv.s, rand = rng(k * 31 + 7);
  // pick targets (invisible) for every cell, including sky cells next to ground
  const pg = new THREE.BoxGeometry(1, 0.1, 1), pm = new THREE.MeshBasicMaterial({ visible: false });
  for (let i = 0; i < s.w * s.h; i++) {
    const p = new THREE.Mesh(pg, pm); cellPos(i % s.w, (i / s.w) | 0, p.position); p.userData.cell = i; lvRoot.add(p); lv.pick[i] = p;
  }
  for (let i = 0; i < s.w * s.h; i++) buildCell(i, false);
  for (let i = 0; i < s.w * s.h; i++) buildObj(i);
  // rocks under the island
  const cells = [];
  for (let i = 0; i < s.w * s.h; i++) { const t = s.t[i]; if (t !== T.VOID && t !== T.SPROUT && t !== T.VINE && t !== T.DRAW && t !== T.DRAWON && t !== T.RAINBOW) { const p = cellPos(i % s.w, (i / s.w) | 0); cells.push([p.x, p.z]); } }
  const under = A.underRocks(P, cells, rand); lvRoot.add(under);
  // goal
  const goal = A.goalModel(def.goal, P); standPos(s.gx, s.gy, goal.position); lvRoot.add(goal); lv.goal = goal;
  // secrets
  s.secrets.forEach(q => {
    if (q.taken) return;
    const pr = A.secretProp(q.w, P); const i = L.idx(s, q.x, q.y);
    const gp = cellPos(q.x, q.y); gp.y = cellTopY(i);
    pr.position.add(gp); lvRoot.add(pr); lv.secrets.push({ q, prop: pr });
    pr.userData.twinkle = Math.random() * 5;
  });
  // wanderer
  const w = A.creature('#fff3dc', '#ff9a6b'); lv.wanderer = w; standPos(s.wx, s.wy, w.position); w.rotation.y = 0.6; lvRoot.add(w);
  w.userData.blink = 2; w.userData.squash = 0; w.userData.umbrella = 0; w.userData.facing = 0.6; w.userData.hum = 3 + Math.random() * 3;
  // camera fit
  let maxH = 0; for (let i = 0; i < s.hh.length; i++) maxH = Math.max(maxH, s.hh[i]);
  view.fitW = s.w; view.fitH = s.h; view.maxH = maxH * HSTEP + 0.8; view.title = false;
  view.target.set(0, maxH * HSTEP * 0.4, 0);
  camera.aspect = W / H;
  if (!opts.keepYaw) view.yaw = def.yaw !== undefined ? def.yaw : (def.id === 'title' ? -0.5 : bestYaw());
  // light + shadow bounds
  const r = Math.max(s.w, s.h) * 0.75 + 1;
  const sc = sceneLights.sun.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix();
  if (def.id !== 'title') { audio.play('w' + def.world); updateHud(); }
  if (DEBUG) window.__pwState = s;
}

function setPalette(world) {
  P = A.PALETTES[world];
  scene.background = skyTexture(P.skyTop, P.skyBot);
  scene.fog = new THREE.Fog(new THREE.Color(P.fog), 30, 70);
  sceneLights.hemi.groundColor.set(P.side);
  if (cloudBank) scene.remove(cloudBank);
  cloudBank = makeCloudBank(scene, 9, 16, -2, rng(world * 17 + 3));
  document.documentElement.style.setProperty('--sky-top', P.skyTop);
  document.documentElement.style.setProperty('--sky-bot', P.skyBot);
}

// ───────────────────────── weather effects (visual) ─────────────────────────
const fxItems = [];
function addFx(update) { fxItems.push(update); }
function clearWeatherFx() { fxItems.length = 0; if (lv.cloud) { disposeGroup(lv.cloud.group); lv.cloud = null; } clearTargets(); hideHintMarker(); }
let targetMarks = [];
function clearTargets() { targetMarks.forEach(m => disposeGroup(m)); targetMarks = []; }
function showTargets(cells, color) {
  clearTargets();
  const s = lv.s;
  cells.forEach(([x, y]) => {
    if (!L.inb(s, x, y)) return;
    const i = L.idx(s, x, y), p = cellPos(x, y);
    const t = s.t[i];
    p.y = (t === T.VOID ? 0 : cellTopY(i)) + 0.04;
    const m = A.mesh(A.slab(0.86, 0.86, 0.02, 0.2), A.basic(color, { opacity: 0.45, depthWrite: false }), p.x, p.y, p.z);
    m.renderOrder = 5; lvRoot.add(m); targetMarks.push(m);
  });
}

function makeCloud(kind) {
  const g = new THREE.Group();
  const col = kind === 'snow' ? '#ffffff' : kind === 'bolt' ? '#8a8fc4' : '#eef4ff', under = kind === 'snow' ? '#dbe9ff' : kind === 'bolt' ? '#5e6394' : '#b9cdee';
  const m = A.toon(col, { rim: 0.7 }), mu = A.toon(under, { rim: 0.4 });
  [[0, 0.1, 0, 0.42], [0.36, 0, 0.05, 0.3], [-0.36, 0, -0.02, 0.32], [0.1, 0.05, -0.28, 0.3], [-0.12, 0.02, 0.26, 0.28]].forEach(([x, y, z, r]) => g.add(A.mesh(A.G.sphere(14), m, x, y, z, r, r * 0.8, r)));
  g.add(A.mesh(A.G.sphere(14), mu, 0, -0.14, 0, 0.62, 0.16, 0.48));
  const face = new THREE.Group(); face.position.set(0, 0.04, 0.4);
  const eyeM = A.basic('#3b3557');
  const e1 = A.mesh(A.G.sphere(8), eyeM, -0.1, 0, 0, 0.035, 0.05, 0.02), e2 = A.mesh(A.G.sphere(8), eyeM, 0.1, 0, 0, 0.035, 0.05, 0.02);
  face.add(e1, e2, A.mesh(A.G.sphere(8), A.basic('#ff9fb4', { opacity: 0.8 }), -0.2, -0.05, -0.02, 0.05, 0.03, 0.01), A.mesh(A.G.sphere(8), A.basic('#ff9fb4', { opacity: 0.8 }), 0.2, -0.05, -0.02, 0.05, 0.03, 0.01));
  g.add(face);
  const ring = A.mesh(A.G.ring(), A.basic(kind === 'snow' ? '#ffffff' : kind === 'bolt' ? '#ffe066' : '#7fd0ff', { opacity: 0.9, depthWrite: false }), 0, -0.3, 0, 0.001);
  g.add(ring);
  g.userData = { face, eyes: [e1, e2], ring };
  return g;
}

function faceCamera(obj) { obj.rotation.y = view.yaw + Math.PI / 2 * 0 ; }

function sunFx(x, y) {
  const s = lv.s, i = L.idx(s, x, y), p = cellPos(x, y); p.y = cellTopY(i);
  const g = new THREE.Group(); g.position.set(p.x, p.y + 3.2, p.z); lvRoot.add(g);
  const disc = A.mesh(A.G.sphere(16), A.basic('#ffe066'), 0, 0, 0, 0.42); g.add(disc);
  const rays = new THREE.Group(); g.add(rays);
  for (let k = 0; k < 10; k++) { const r = A.mesh(A.G.cone(4), A.basic('#ffd23f'), 0, 0, 0, 0.1, 0.26, 0.1); const a = k / 10 * Math.PI * 2; r.position.set(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0); r.rotation.z = a - Math.PI / 2; rays.add(r); }
  const face = new THREE.Group(); face.position.z = 0.4; g.add(face);
  face.add(A.mesh(A.G.sphere(6), A.basic('#7a4a1a'), -0.13, 0.05, 0, 0.04, 0.05, 0.02), A.mesh(A.G.sphere(6), A.basic('#7a4a1a'), 0.13, 0.05, 0, 0.04, 0.05, 0.02));
  { const sm = A.mesh(A.G.torus(), A.basic('#7a4a1a'), 0, -0.07, 0, 0.08, 0.08, 0.03); sm.rotation.z = Math.PI; face.add(sm); }
  face.add(A.mesh(A.G.sphere(6), A.basic('#ff9fb4'), -0.25, -0.05, 0, 0.06, 0.035, 0.01), A.mesh(A.G.sphere(6), A.basic('#ff9fb4'), 0.25, -0.05, 0, 0.06, 0.035, 0.01));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 3.2, 16, 1, true), A.basic('#fff3a0', { opacity: 0.0, add: true, side: true, depthWrite: false }).clone());
  beam.position.set(p.x, p.y + 1.6, p.z); lvRoot.add(beam);
  const glow = A.mesh(A.G.disc(20), A.basic('#fff6c0', { opacity: 0.0, add: true, depthWrite: false }).clone(), p.x, p.y + 0.05, p.z, 0.6); lvRoot.add(glow);
  let t = 0;
  addFx(dt => {
    t += dt;
    const k = Math.min(1, t / 0.3);
    g.scale.setScalar(backOut(k) * (t > 1.0 ? Math.max(0, 1 - (t - 1.0) / 0.25) : 1));
    rays.rotation.z += dt * 1.5;
    g.lookAt(camera.position);
    const bk = t < 0.15 ? 0 : t < 0.35 ? (t - 0.15) / 0.2 : Math.max(0, 1 - (t - 0.6) / 0.6);
    beam.material.opacity = 0.38 * bk; glow.material.opacity = 0.55 * bk; glow.scale.setScalar(0.5 + bk * 0.3);
    if (t > 0.2 && t < 0.9 && Math.random() < 0.6) fxA.spawn({ x: p.x + (Math.random() - 0.5) * 0.8, y: p.y + 0.1 + Math.random() * 0.6, z: p.z + (Math.random() - 0.5) * 0.8, vy: 0.6, life: 0.7, size: 0.16, color: '#fff2a0', shape: 1, grav: 0 });
    if (t > 1.3) { disposeGroup(g); disposeGroup(beam); disposeGroup(glow); return false; }
    return true;
  });
}

function rainFx(x, y, kind, dur) {
  // the cloud keeps raining for a moment after the burst
  const cells = L.plus(x, y);
  let t = 0;
  addFx(dt => {
    t += dt;
    const rate = (kind === 'snow' ? 40 : 70) * (save.settings.reducedEffects ? 0.5 : 1);
    if (t < dur) {
      for (let n = 0; n < rate * dt * 5; n++) {
        const c = cells[(Math.random() * 5) | 0];
        if (!L.inb(lv.s, c[0], c[1])) continue;
        const i = L.idx(lv.s, c[0], c[1]), p = cellPos(c[0], c[1]);
        const floor = lv.s.t[i] === T.VOID ? -1.5 : cellTopY(i);
        if (kind === 'snow') fxN.spawn({ x: p.x + (Math.random() - 0.5) * 0.9, y: floor + 2.0 + Math.random() * 0.4, z: p.z + (Math.random() - 0.5) * 0.9, vy: -1.2, life: 2.2, size: 0.12, color: '#ffffff', shape: 2, wob: 0.6, fade: 0 , floor });
        else fxN.spawn({ x: p.x + (Math.random() - 0.5) * 0.9, y: floor + 2.1, z: p.z + (Math.random() - 0.5) * 0.9, vy: -8, life: 0.4, size: 0.1, color: '#6fc3ff', shape: 3, fade: 0, floor });
        if (kind !== 'snow' && Math.random() < 0.15 && lv.s.t[i] !== T.VOID) fxN.spawn({ x: p.x + (Math.random() - 0.5) * 0.8, y: floor + 0.03, z: p.z + (Math.random() - 0.5) * 0.8, life: 0.3, size: 0.12, color: '#bfe6ff', shape: 4, grow: 1.5 });
      }
    }
    return t < dur + 0.5;
  });
}

function windFx(x, y, dir, len) {
  const s = lv.s, d = L.DIRS[L.dirOf(dir)];
  const start = cellPos(x, y), i0 = L.idx(s, clamp(x, 0, s.w - 1), clamp(y, 0, s.h - 1));
  const baseY = Math.max(0.35, (s.t[i0] === T.VOID ? 0 : cellTopY(i0)) + 0.4);
  const ribbons = [];
  for (let r = 0; r < 3; r++) {
    const pts = [], segs = 40, L0 = len + 1.6, off = (r - 1) * 0.28, phase = r * 2.1;
    for (let k = 0; k <= segs; k++) {
      const u = k / segs, dist = -0.8 + u * L0;
      const curl = Math.sin(u * Math.PI * 3 + phase) * 0.12, loop = Math.exp(-Math.pow((u - 0.55 - r * 0.1) * 9, 2)) * 0.35;
      const px = start.x + d[0] * dist + (-d[1]) * (off + Math.cos(u * 12 + phase) * loop * 0.6);
      const pz = start.z + d[1] * dist + d[0] * (off + Math.cos(u * 12 + phase) * loop * 0.6);
      pts.push(new THREE.Vector3(px, baseY + r * 0.12 + curl + Math.sin(u * 12 + phase) * loop, pz));
    }
    const pos = [], us = [], idx = [];
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], w = 0.05 * Math.sin(k / segs * Math.PI) + 0.01;
      pos.push(p.x, p.y + w, p.z, p.x, p.y - w, p.z); us.push(k / segs, k / segs);
      if (k < segs) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ uniforms: { uHead: { value: -0.2 }, uCol: { value: new THREE.Color(r === 1 ? '#ffffff' : '#dff4ff') } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'attribute float aU; varying float vU; void main(){ vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uHead; uniform vec3 uCol; varying float vU; void main(){ float a = smoothstep(uHead - 0.55, uHead, vU) * (1.0 - smoothstep(uHead, uHead + 0.03, vU)); if (a < 0.01) discard; gl_FragColor = vec4(uCol, a * 0.95); }' });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 6; lvRoot.add(m); ribbons.push({ m, delay: r * 0.07 });
  }
  let t = 0;
  for (let k = 0; k < 14; k++) fxN.spawn({ x: start.x + (Math.random() - 0.5) * 0.6, y: baseY + Math.random() * 0.4, z: start.z + (Math.random() - 0.5) * 0.6, vx: d[0] * (3 + Math.random() * 3), vz: d[1] * (3 + Math.random() * 3), vy: 0.4, life: 0.9, size: 0.1, color: ['#9be06a', '#ffd35c', '#ff9f6b'][k % 3], shape: 0, wob: 2, drag: 0.6 });
  addFx(dt => {
    t += dt;
    ribbons.forEach(r => { r.m.material.uniforms.uHead.value = (t - r.delay) / 0.55 * 1.5 - 0.1; });
    if (t > 0.95) { ribbons.forEach(r => { disposeGroup(r.m); r.m.geometry.dispose(); r.m.material.dispose(); }); return false; }
    return true;
  });
}

function boltFx(x, y) {
  const s = lv.s, i = L.idx(s, x, y), p = cellPos(x, y); p.y = s.t[i] === T.VOID ? 0 : cellTopY(i);
  const cloud = makeCloud('bolt'); cloud.position.set(p.x, p.y + 3.4, p.z); cloud.scale.setScalar(1.1); lvRoot.add(cloud);
  const pts = [], n = 9;
  for (let k = 0; k <= n; k++) { const u = k / n; pts.push(new THREE.Vector3(p.x + (k && k < n ? (Math.random() - 0.5) * 0.5 : 0), p.y + 3.2 * (1 - u) + 0.05, p.z + (k && k < n ? (Math.random() - 0.5) * 0.5 : 0))); }
  const camDir = new THREE.Vector3().subVectors(camera.position, p).normalize();
  const strip = (w, col, op) => {
    const pos = [], idx = [];
    pts.forEach((q, k) => { const dir = k < n ? new THREE.Vector3().subVectors(pts[k + 1], q) : new THREE.Vector3().subVectors(q, pts[k - 1]); const side = new THREE.Vector3().crossVectors(dir, camDir).normalize().multiplyScalar(w); pos.push(q.x + side.x, q.y + side.y, q.z + side.z, q.x - side.x, q.y - side.y, q.z - side.z); if (k < n) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 8; lvRoot.add(m); return m;
  };
  const core = strip(0.05, '#ffffff', 1), glow = strip(0.2, '#ffe066', 0.5);
  flash(0.7); view.shake = 0.35;
  puff(p.x, p.y + 0.1, p.z, 22, { color: ['#fff6a0', '#ffffff', '#ffd23f'], add: true, shape: 1, speed: 3, size: 0.16, life: 0.6 });
  let t = 0;
  addFx(dt => {
    t += dt;
    const vis = t < 0.45 && (Math.floor(t * 30) % 3 !== 1);
    core.visible = glow.visible = vis;
    cloud.position.y += dt * (t > 0.6 ? 1.5 : 0); cloud.scale.setScalar(1.1 * (t > 0.6 ? Math.max(0.01, 1 - (t - 0.6) * 2) : backOut(Math.min(1, t * 5))));
    if (t > 1.2) { [core, glow].forEach(m => { disposeGroup(m); m.geometry.dispose(); m.material.dispose(); }); disposeGroup(cloud); return false; }
    return true;
  });
}

function flash(a) { const f = $('#flash'); if (save.settings.reducedMotion) a *= 0.35; f.style.transition = 'none'; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity .45s ease-out'; f.style.opacity = 0; }); }

function rainbowFx(e) {
  const a = cellPos(e.x, e.y), b = cellPos(e.x2, e.y2), s = lv.s;
  const y0 = cellTopY(L.idx(s, e.x, e.y)) + 0.0;
  const len = a.distanceTo(b), h = 0.45 + len * 0.1;
  const arc = A.rainbowArc(len, h);
  arc.position.set(a.x, y0, a.z);
  arc.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  arc.scale.set(0.001, 1, 1);
  lvRoot.add(arc);
  lv.arcs.push({ x1: e.x, y1: e.y, x2: e.x2, y2: e.y2, h, mesh: arc });
  let t = 0;
  addFx(dt => { t += dt; arc.scale.x = Math.max(0.001, ease(Math.min(1, t / 1.0))); if (Math.random() < 0.5) { const u = arc.scale.x; fxA.spawn({ x: lerp(a.x, b.x, u), y: y0 + Math.sin(u * Math.PI) * h + 0.1, z: lerp(a.z, b.z, u), vy: 0.3, life: 0.8, size: 0.18, color: ['#ff7b7b', '#ffe66b', '#6bc3ff', '#b48bff'][(Math.random() * 4) | 0], shape: 1, grav: 0 }); } return t < 1.1; });
  audio.rainbow(); save.stats.rainbows++;
}

// ───────────────────────── applying weather ─────────────────────────
const WEATHER_LABEL = { rain: 'Rain', sun: 'Sun', wind: 'Wind', snow: 'Snow', bolt: 'Lightning' };
function doWeather(a) {
  if (!lv.s || lv.won || state.screen !== 'play') return null;
  const w = a.w;
  if (!lv.weathers.includes(w)) { audio.nope(); say(w === 'sun' ? 'Hold to rain!' : 'Not here yet!', 'ask', 1.6); return null; }
  if (w === 'bolt' && lv.s.bolts <= 0) { audio.nope(); say('Out of lightning!', 'sad', 1.6); return null; }
  const s = lv.s, wx0 = s.wx, wy0 = s.wy;
  const r = L.apply(s, a);
  lv.uses++; lv.log.push(a); save.stats[w] = (save.stats[w] || 0) + 1; persist();
  lv.lastAct = performance.now();
  // weather visuals first, puzzle reactions land a beat later (when the drops hit / the beam lands)
  let delay = 0;
  if (w === 'sun') { sunFx(a.x, a.y); audio.sun(); delay = 0.28; lv.mood.sun = 2.5; }
  else if (w === 'rain' || w === 'snow') { delay = 0.2; lv.mood[w] = 3.5; if (w === 'snow') lv.mood.cold = 3; }
  else if (w === 'wind') { windFx(a.x, a.y, a.dir, a.len || 1); audio.wind(); delay = 0.12; lv.mood.wind = 1.6; shared.windPulse = 1; }
  else if (w === 'bolt') { boltFx(a.x, a.y); audio.bolt(); delay = 0.05; }
  const evs = r.events;
  // riding / gliding / floating must move the wanderer visual right away, the rest can wait for the weather to land
  later(delay, () => handleEvents(evs, { wx0, wy0 }));
  lv.wait = Math.max(lv.wait, delay + 0.35);
  updateHud();
  if (r.ok) lv.lastProgress = performance.now();
  hideHintMarker();
  return r;
}
const timers = [];
function later(t, fn) { if (t <= 0) fn(); else timers.push({ t, fn }); }

function cellOf(e) { return L.idx(lv.s, e.x, e.y); }
function handleEvents(evs, ctx) {
  const s = lv.s;
  for (const e of evs) {
    switch (e.type) {
      case 'tile': {
        const i = cellOf(e), p = cellPos(e.x, e.y); p.y = cellTopY(i) + 0.15;
        const rec = buildCell(i, true);
        const k = e.kind;
        if (k === 'grow') { audio.grow(); puff(p.x, p.y, p.z, 16, { color: ['#8be06a', '#5fbf4f', '#ffd35c'], speed: 1.8, up: 2, size: 0.14 }); }
        else if (k === 'fill') { audio.fill(); puff(p.x, p.y, p.z, 14, { color: ['#8fdcff', '#ffffff'], speed: 1.4, up: 2.2, size: 0.12 }); }
        else if (k === 'mud') { audio.mud(); puff(p.x, p.y, p.z, 10, { color: ['#7a5236', '#a57048'], speed: 1, up: 1.4, size: 0.12 }); if (e.x === s.wx && e.y === s.wy) say('Eww, squelchy!', 'sad', 1.6); }
        else if (k === 'wet') { audio.fill(); puff(p.x, p.y, p.z, 8, { color: '#bfe6ff', speed: 1, up: 1, size: 0.1 }); }
        else if (k === 'douse') { audio.douse(); puff(p.x, p.y, p.z, 20, { color: ['#ffffff', '#e8e8f0'], speed: 0.8, up: 2.2, size: 0.3, grav: -0.5, life: 1.4, grow: 1.5 }); }
        else if (k === 'freeze') { audio.freeze(); puff(p.x, p.y, p.z, 14, { color: ['#ffffff', '#c9f0ff'], speed: 1.2, up: 1.5, size: 0.14, shape: 2, add: true }); }
        else if (k === 'melt') { audio.melt(); puff(p.x, p.y, p.z, 14, { color: ['#8fdcff', '#ffffff'], speed: 1.2, up: 1.8, size: 0.1 }); }
        else if (k === 'dry') { audio.dry(); puff(p.x, p.y, p.z, 12, { color: ['#fff2a0', '#ffffff'], speed: 1, up: 1.2, size: 0.14, shape: 1, add: true, grav: 0 }); }
        else if (k === 'bloom') { audio.open(); puff(p.x, p.y + 0.5, p.z, 16, { color: ['#ffd23f', '#ffe066'], speed: 1.5, up: 1.5, size: 0.14 }); }
        else if (k === 'open') { const gt = rec.group.userData.gate; if (gt) animate(0.6, u => gt.userData.setOpen(backOut(u))); later(0.15, () => audio.creak()); rec.pop = undefined; rec.top.scale.set(1, 1, 1); }
        else if (k === 'shatter') { audio.shatter(); view.shake = Math.max(view.shake, 0.25); puff(p.x, p.y, p.z, 18, { color: [P.rock, '#ffffff'], speed: 2.5, up: 2.5, size: 0.14 }); }
        else if (k === 'ignite') { audio.ignite(); puff(p.x, p.y, p.z, 18, { color: ['#ff9a3c', '#ffe066'], speed: 1.5, up: 2.5, size: 0.12, add: true }); }
        else if (k === 'power') { audio.power(); puff(p.x, p.y + 0.6, p.z, 20, { color: ['#fff6a0', '#7fe8ff'], speed: 2, up: 2, size: 0.12, shape: 1, add: true }); }
        else if (k === 'extend') { const d = rec.group.userData.draw; if (d) animate(0.7, u => d.userData.set(backOut(u))); rec.pop = undefined; rec.top.scale.set(1, 1, 1); later(0.2, () => audio.creak()); }
        else if (k === 'rainbow' || k === 'rainbowsrc') { rec.pop = undefined; rec.top.scale.set(1, 1, 1); }
        // secrets sitting on a rebuilt tile: keep them at the new height
        lv.secrets.forEach(sc => { if (sc.q.x === e.x && sc.q.y === e.y) { sc.prop.position.y = cellTopY(i); } });
        break;
      }
      case 'push': {
        const from = L.idx(s, e.fx, e.fy), to = L.idx(s, e.x, e.y), ob = lv.objs.get(from);
        if (!ob) break;
        lv.objs.delete(from);
        const a = ob.holder.position.clone(), b = cellPos(e.x, e.y); b.y = a.y;
        const dist = Math.abs(e.x - e.fx) + Math.abs(e.y - e.fy), dur = 0.3 + dist * 0.16;
        audio.push();
        if (e.fill) {
          animate(dur, u => { ob.holder.position.lerpVectors(a, b, ease(u)); ob.mesh.rotation.x += 0.1; ob.holder.position.y = a.y - Math.max(0, u - 0.6) * 1.2; ob.holder.scale.setScalar(1 - Math.max(0, u - 0.6) * 1.5); },
            () => { disposeGroup(ob.holder); puff(b.x, b.y + 0.1, b.z, 18, { color: ob.kind === O.SNOWPILE ? ['#ffffff', '#dff4ff'] : ['#f6d995', '#e9c47a'], speed: 1.6, up: 1.6, size: 0.16 }); audio.fill(); });
        } else {
          lv.objs.set(to, ob);
          const roll = ob.kind === O.SANDPILE || ob.kind === O.SNOWPILE;
          animate(dur, u => { ob.holder.position.lerpVectors(a, b, easeIO(u)); if (roll) ob.mesh.rotation.z = -Math.sin(u * Math.PI) * 0.3; else ob.mesh.rotation.z = Math.sin(u * Math.PI) * 0.15; });
          if (e.ride) rideWanderer(a, b, dur);
        }
        break;
      }
      case 'lift': {
        const i = cellOf(e), rec = lv.cells[i], lt = rec.group.userData.lift, pi = rec.group.userData.piston;
        if (!lt) break;
        const y0 = lt.position.y, y1 = e.up ? HSTEP : 0;
        animate(0.7, u => { lt.position.y = lerp(y0, y1, backOut(u)); pi.scale.y = 0.01 + lt.position.y; pi.position.y = lt.position.y / 2 - 0.12; });
        lv.pick[i].position.y = cellTopY(i);
        later(0.1, () => audio.creak());
        break;
      }
      case 'mill': lv.cells.forEach(c => { if (c && c.group.userData.mill) c.group.userData.mill.userData.spin = 16; }); break;
      case 'rainbow': rainbowFx(e); break;
      case 'zap': e.cells.forEach(([x, y], k) => { const p = cellPos(x, y); p.y = cellTopY(L.idx(s, x, y)) + 0.08; later(k * 0.03, () => puff(p.x, p.y, p.z, 6, { color: ['#7fe8ff', '#ffffff'], add: true, shape: 1, speed: 1.2, up: 1, size: 0.14, grav: 0 })); }); break;
      case 'drop': revealDrop(e); break;
      case 'float': floatWanderer(e); break;
      case 'glide': glideWanderer(e); break;
      case 'wobble': { const ob = lv.objs.get(cellOf(e)); if (ob) animate(0.4, u => { ob.mesh.rotation.z = Math.sin(u * 20) * 0.12 * (1 - u); }); audio.nope(); break; }
      case 'gust': wobbleWanderer(); break;
      case 'win': lv.pendingWin = true; break;
    }
  }
  checkWinTrigger();
}

const anims = [];
function animate(dur, fn, done) { anims.push({ t: 0, dur, fn, done }); }

// ───────────────────────── the wanderer ─────────────────────────
function rideWanderer(a, b, dur) {
  const w = lv.wanderer, start = w.position.clone();
  lv.walk = { kind: 'ride', t: 0, dur, from: start, to: standPos(lv.s.wx, lv.s.wy), done: null };
  say('Wheee!', 'happy', 1.2);
}
function floatWanderer(e) {
  const w = lv.wanderer, from = w.position.clone(), to = standPos(e.x, e.y);
  save.stats.splashes++; lv.fails++;
  const p = cellPos(e.fx, e.fy); p.y = from.y;
  if (e.kind === 'splash') { audio.splash(); puff(p.x, p.y, p.z, 24, { color: ['#8fdcff', '#ffffff'], speed: 2, up: 3, size: 0.13 }); say('Splash!', 'wow', 1.6); }
  else { audio.mud(); say(e.kind === 'squelch' ? 'Stuck!' : 'Whoa!', 'sad', 1.4); }
  lv.walk = { kind: 'float', t: 0, dur: 1.2, from, to, done: null };
  lv.wait = Math.max(lv.wait, 1.3);
}
function glideWanderer(e) {
  const w = lv.wanderer, from = w.position.clone(), to = standPos(e.x, e.y);
  save.stats.glides++; audio.glide();
  lv.walk = { kind: 'glide', t: 0, dur: 0.5 + 0.28 * (Math.abs(e.x - e.fx) + Math.abs(e.y - e.fy)), from, to, done: null };
  w.userData.facing = Math.atan2(to.x - from.x, to.z - from.z);
  say('Wheee!', 'wow', 1.4);
  lv.wait = Math.max(lv.wait, lv.walk.dur + 0.2);
}
function wobbleWanderer() { const u = lv.wanderer.userData; u.wobble = 1; }

function wandererTick(dt) {
  const s = lv.s, w = lv.wanderer, u = w.userData;
  if (!s || !w) return;
  if (lv.walk) {
    const k = lv.walk; k.t += dt;
    const f = Math.min(1, k.t / k.dur);
    if (k.kind === 'walk' || k.kind === 'hop') {
      w.position.lerpVectors(k.from, k.to, f);
      const arc = k.kind === 'hop' ? 0.5 + Math.abs(k.to.y - k.from.y) * 0.5 : 0.1;
      w.position.y = lerp(k.from.y, k.to.y, f) + Math.sin(f * Math.PI) * arc;
      u.squash = Math.sin(f * Math.PI) * 0.12;
    } else if (k.kind === 'ride') {
      w.position.lerpVectors(k.from, k.to, easeIO(f));
    } else if (k.kind === 'glide') {
      w.position.lerpVectors(k.from, k.to, easeIO(f));
      w.position.y = lerp(k.from.y, k.to.y, f * f) + Math.sin(f * Math.PI) * 0.6;
      u.umbrella = 1;
    } else if (k.kind === 'float') {
      // dunk, bob, then float in an arc back to dry land
      if (f < 0.25) { w.position.copy(k.from); w.position.y = k.from.y - f * 1.4; }
      else { const g = (f - 0.25) / 0.75; w.position.lerpVectors(k.from, k.to, easeIO(g)); w.position.y = lerp(k.from.y - 0.35, k.to.y, g) + Math.sin(g * Math.PI) * 0.9; u.umbrella = 1; }
    }
    if (k.kind === 'walk' || k.kind === 'hop' || k.kind === 'glide') {
      const tgt = Math.atan2(k.to.x - k.from.x, k.to.z - k.from.z);
      if (Math.abs(k.to.x - k.from.x) + Math.abs(k.to.z - k.from.z) > 0.01) u.facing = tgt;
    }
    if (f >= 1) {
      w.position.copy(k.to); lv.walk = null; u.land = 1;
      if (k.kind === 'hop') audio.hop();
      if (k.done) k.done();
      checkWinTrigger();
    }
  } else if (!lv.won && !lv.pendingWin) {
    lv.wait -= dt;
    // keep the wanderer on its tile (lifts move under its feet)
    const i = L.idx(s, s.wx, s.wy), rec = lv.cells[i];
    const tgt = standPos(s.wx, s.wy);
    if (rec && rec.group.userData.lift) tgt.y = s.hh[i] * HSTEP + rec.group.userData.lift.position.y;
    const ob = lv.objs.get(i); if (ob) tgt.y += ob.mesh.position.y;
    w.position.x += (tgt.x - w.position.x) * Math.min(1, dt * 10); w.position.z += (tgt.z - w.position.z) * Math.min(1, dt * 10);
    w.position.y += (tgt.y - w.position.y) * Math.min(1, dt * 12);
    if (lv.wait <= 0 && state.screen === 'play') {
      const fx = s.wx, fy = s.wy, evs = L.step(s);
      if (evs) {
        const e = evs[0], from = w.position.clone(), to = standPos(e.x, e.y);
        const hop = Math.abs(e.dh) > 0 || lv.s.t[L.idx(s, e.x, e.y)] === T.MUSH || lv.s.t[L.idx(s, fx, fy)] === T.MUSH;
        lv.walk = { kind: hop ? 'hop' : 'walk', t: 0, dur: (hop ? 0.5 : 0.38) / speedK(), from, to };
        audio.step(lv.stepCount++);
        if (lv.s.t[L.idx(s, fx, fy)] === T.MUSH) { audio.boing(); const m = lv.cells[L.idx(s, fx, fy)].group.userData.mush; if (m) animate(0.4, k => m.userData.cap.scale.set(0.42 * (1 + Math.sin(k * Math.PI) * 0.25), 0.24 * (1 - Math.sin(k * Math.PI) * 0.35), 0.42 * (1 + Math.sin(k * Math.PI) * 0.25))); }
        if (evs.some(x => x.type === 'win')) lv.pendingWin = true;
        lv.idleT = 0; u.waiting = false;
      } else {
        lv.wait = 0.25;
        if (!u.waiting) { u.waiting = true; u.waitT = 0; }
      }
    }
  }
  // character life: blink, breathe, look, react to weather
  const t = clock.t;
  u.blink -= dt;
  const eyesY = u.blink < 0 ? 0.15 : 1;
  if (u.blink < -0.12) u.blink = 1.5 + Math.random() * 3.5;
  const happy = lv.mood.sun > 0 || lv.won;
  w.userData.eyes.forEach(e => { e.scale.y = happy ? Math.min(eyesY, 0.45) : eyesY; });
  w.userData.mouthO.visible = !!(lv.walk && (lv.walk.kind === 'glide' || lv.walk.kind === 'float')) || lv.mood.cold > 0;
  w.userData.mouth.visible = !w.userData.mouthO.visible;
  u.squash *= Math.pow(0.001, dt);
  if (u.land) { u.land = Math.max(0, u.land - dt * 5); }
  const breathe = Math.sin(t * 3) * 0.025;
  const land = u.land ? Math.sin(u.land * Math.PI) * 0.18 : 0;
  const sq = u.squash + (lv.won ? Math.abs(Math.sin(t * 8)) * 0.15 : 0);
  w.userData.bob.scale.set(1 + land * 0.8 - sq * 0.3 - breathe * 0.5, 1 - land + sq + breathe, 1 + land * 0.8 - sq * 0.3 - breathe * 0.5);
  if (lv.won) w.userData.bob.position.y = Math.abs(Math.sin(t * 8)) * 0.25; else w.userData.bob.position.y = 0;
  // facing: towards walking direction, or towards the camera while waiting
  let face = u.facing;
  if (u.waiting && !lv.walk) { u.waitT += dt; if (u.waitT > 1.2) face = view.yaw + Math.PI / 2 + Math.sin(t * 0.7) * 0.5; }
  if (lv.won) face = view.yaw + Math.PI / 2;
  let dr = face - w.rotation.y; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
  w.rotation.y += dr * Math.min(1, dt * 8);
  // weather reactions
  for (const k in lv.mood) lv.mood[k] = Math.max(0, lv.mood[k] - dt);
  const wantUmb = lv.mood.rain > 0 || lv.mood.snow > 0 || (lv.walk && (lv.walk.kind === 'glide' || lv.walk.kind === 'float'));
  u.umbrella += ((wantUmb ? 1 : 0) - u.umbrella) * Math.min(1, dt * 8);
  const umb = w.userData.umb; umb.visible = u.umbrella > 0.02; umb.scale.setScalar(Math.max(0.001, u.umbrella)); umb.rotation.z = -0.2 + Math.sin(t * 2) * 0.05 + (lv.mood.wind > 0 ? Math.sin(t * 18) * 0.2 : 0);
  let shiver = lv.mood.cold > 0 ? Math.sin(t * 60) * 0.015 : 0;
  if (u.wobble) { u.wobble = Math.max(0, u.wobble - dt * 1.5); }
  w.userData.bob.rotation.z = (u.wobble ? Math.sin(t * 20) * 0.25 * u.wobble : 0) + (lv.mood.wind > 0 ? Math.sin(t * 9) * 0.08 : 0);
  w.userData.bob.position.x = shiver;
  if (w.userData.sprout) w.userData.sprout.rotation.z = Math.sin(t * 4) * 0.15 + (lv.mood.wind > 0 ? Math.sin(t * 20) * 0.3 : 0);
  // feet patter while walking
  const walking = lv.walk && (lv.walk.kind === 'walk' || lv.walk.kind === 'hop');
  w.userData.feet.forEach((f, j) => { f.position.z = 0.03 + (walking ? Math.sin(t * 22 + j * Math.PI) * 0.06 : 0); f.position.y = 0.035 + (walking ? Math.max(0, Math.sin(t * 22 + j * Math.PI)) * 0.04 : 0); });
  w.userData.arms.forEach((a, j) => { a.position.y = 0.22 + (lv.won ? Math.abs(Math.sin(t * 8 + j)) * 0.15 : walking ? Math.sin(t * 22 + j * Math.PI) * 0.02 : 0); });
  // humming while waiting
  if (u.waiting && !lv.won) {
    u.hum -= dt;
    if (u.hum < 0) { u.hum = 4 + Math.random() * 4; audio.voice(Math.random() < 0.5 ? 'hum' : 'ask'); const p = w.position; fxN.spawn({ x: p.x + 0.2, y: p.y + 0.7, z: p.z, vy: 0.5, vx: 0.2, life: 1.4, size: 0.2, color: '#7a6ad8', shape: 1, grav: 0, wob: 0.5 }); if (!lv.bubbleT) say(['♪', 'Hmm?', '♪ ♫', '...?'][(Math.random() * 4) | 0], 'hum', 1.6); }
  }
}
function speedK() { return (DEBUG && window.__pwSpeed) || 1; }

function checkWinTrigger() {
  if (lv.pendingWin && !lv.walk && !lv.won) { lv.pendingWin = false; winLevel(); }
}

// ───────────────────────── sun drops, winning ─────────────────────────
function revealDrop(e) {
  const sc = lv.secrets.find(q => q.q.id === e.id);
  const sv = lvSave(lv.def.id);
  if (!sv.drops[e.id]) { sv.drops[e.id] = true; save.stats.drops++; persist(); }
  const p = cellPos(e.x, e.y); p.y = cellTopY(L.idx(lv.s, e.x, e.y));
  if (sc) { const pp = sc.prop.position.clone(); animate(0.3, u => sc.prop.scale.setScalar(1 + u * 0.6 - u * u * 1.6), () => disposeGroup(sc.prop)); puff(pp.x, pp.y + 0.15, pp.z, 14, { color: ['#ffd35c', '#ffffff'], add: true, shape: 1, speed: 1.6, up: 2, size: 0.15 }); }
  const d = A.sunDrop(); d.position.set(p.x + 0.28, p.y + 0.1, p.z + 0.28); lvRoot.add(d);
  audio.drop();
  let t = 0;
  addFx(dt => {
    t += dt;
    if (t < 0.9) { d.position.y = p.y + 0.1 + backOut(Math.min(1, t / 0.5)) * 0.9; d.rotation.y += dt * 8; d.scale.setScalar(Math.min(1, t * 4) * 1.4); }
    else { // fly to the HUD counter
      const v = d.position.clone().project(camera);
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      flyToHud(sx, sy, e.id);
      disposeGroup(d); return false;
    }
    return true;
  });
  say(['Ooh, shiny!', 'A sun drop!', 'Sparkly!'][e.id % 3], 'wow', 1.6);
}
function flyToHud(sx, sy, id) {
  const slot = document.querySelectorAll('#hud-drops .drop')[id];
  const el = document.createElement('div'); el.className = 'flydrop'; document.body.appendChild(el);
  el.style.transform = `translate(${sx - 14}px, ${sy - 14}px) scale(1.4)`;
  const r = slot ? slot.getBoundingClientRect() : { left: W / 2, top: 20, width: 20, height: 20 };
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `translate(${r.left + r.width / 2 - 14}px, ${r.top + r.height / 2 - 14}px) scale(0.8)`; }));
  setTimeout(() => { el.remove(); updateHud(); if (slot) { slot.classList.remove('pop'); void slot.offsetWidth; slot.classList.add('pop'); } audio.star(); }, 650);
}

function winLevel() {
  if (lv.won) return;
  lv.won = true; lv.winT = 0;
  const def = lv.def, sv = lvSave(def.id);
  const par = def.par || (def.solution ? def.solution.length : 99);
  const res = L.recordWin(save, def, lv.uses), firstClear = res.first, beatChallenge = res.beat;
  persist(true);
  audio.fanfare(); audio.voice('happy');
  setTimeout(() => audio.voice('wow'), 700);
  const g = lv.goal, gp = g.position;
  // goal reacts
  if (g.userData.door) animate(0.6, u => { g.userData.door.scale.x = 0.1 * (1 - u * 0.8); });
  if (g.userData.lan) animate(2.5, u => { g.userData.lan.position.y = 0.6 + ease(u) * 1.2; g.userData.lan.scale.setScalar(1 + u * 0.3); });
  if (g.userData.friend) animate(1.5, u => { g.userData.friend.position.y = Math.abs(Math.sin(u * Math.PI * 4)) * 0.3; });
  if (g.userData.seed) animate(1.2, u => { g.userData.seed.scale.set(0.13 + u * 0.1, 0.19 - u * 0.05, 0.13 + u * 0.1); });
  const cols = ['#ff7b7b', '#ffd35c', '#7be08a', '#6bc3ff', '#b48bff', '#ff9ec7'];
  for (let k = 0; k < 3; k++) later(k * 0.25, () => puff(gp.x, gp.y + 0.8, gp.z, 26, { color: cols, speed: 3, up: 4, size: 0.14, life: 1.6, grav: 5, drag: 0.8, shape: k === 1 ? 1 : 0 }));
  say(['Yay!', 'We did it!', 'Hooray!'][(Math.random() * 3) | 0], 'happy', 2);
  checkAchievements();
  setTimeout(() => showResult({ firstClear, beatChallenge, par }), save.settings.reducedMotion ? 900 : 1900);
}

// ───────────────────────── hints ─────────────────────────
let hintMarker = null;
function hideHintMarker() { if (hintMarker) { disposeGroup(hintMarker); hintMarker = null; } $('#hint-btn').classList.remove('glow'); }
function computeHint() {
  const s = lv.s, def = lv.def;
  let act = null;
  try {
    const r = L.solve(def, { state: s, maxNodes: 2500, maxDepth: 8 });
    if (r.actions && r.actions.length) act = r.actions[0];
    else if (r.actions === null && !r.aborted) return { stuck: true };
  } catch (e) { /* fall through to the scripted solution */ }
  if (!act && def.solution) {
    for (const a of def.solution) { const c = L.clone(s); const rr = L.apply(c, a); if (rr.ok) { act = a; break; } }
  }
  return act ? { act } : { stuck: true };
}
function showHint() {
  if (!lv.s || lv.won) return;
  const h = computeHint();
  lv.hintShown = true;
  if (h.stuck) { say('Hmm, maybe start fresh? Tap ↻', 'ask', 3.5); $('#btn-retry').classList.add('glow'); return; }
  const a = h.act, p = cellPos(a.x, a.y), i = L.idx(lv.s, a.x, a.y);
  p.y = (lv.s.t[i] === T.VOID ? 0 : cellTopY(i)) + 0.05;
  hideHintMarker();
  const g = new THREE.Group(); g.position.copy(p);
  const col = { rain: '#6fc3ff', snow: '#ffffff', sun: '#ffd23f', wind: '#bff0ff', bolt: '#ffe066' }[a.w];
  const ring = A.mesh(A.G.ring(), A.basic(col, { opacity: 0.9, depthWrite: false }), 0, 0.02, 0, 0.45); g.add(ring);
  const arrow = A.mesh(A.G.cone(8), A.toon(col, { rim: 0.8 }), 0, 0.9, 0, 0.14, 0.3, 0.14); arrow.rotation.x = Math.PI; g.add(arrow);
  if (a.w === 'wind') { const d = L.DIRS[L.dirOf(a.dir)]; const ar = A.mesh(A.G.cone(8), A.basic('#ffffff'), d[0] * 0.55, 0.25, d[1] * 0.55, 0.12, 0.35, 0.12); ar.rotation.set(d[1] * Math.PI / 2, 0, -d[0] * Math.PI / 2); g.add(ar); }
  g.userData.update = (t) => { ring.scale.setScalar(0.4 + (t * 1.2 % 1) * 0.2); ring.material.opacity = 1 - (t * 1.2 % 1); arrow.position.y = 0.85 + Math.abs(Math.sin(t * 4)) * 0.2; };
  lvRoot.add(g); hintMarker = g;
  const how = { rain: 'Hold here to rain', snow: 'Hold here to snow (switch your cloud to ❄)', sun: 'Tap here for sunshine', bolt: 'Arm ⚡, then tap here', wind: 'Swipe from here, ' + { e: 'that way', w: 'that way', n: 'that way', s: 'that way' }[a.dir] }[a.w];
  say(how, 'ask', 4);
}

// ───────────────────────── speech bubble ─────────────────────────
function say(text, mood, dur) {
  const b = $('#bubble'); b.textContent = text; b.classList.add('show');
  lv.bubbleT = dur || 1.8;
  if (mood && mood !== 'hum') audio.voice(mood);
}
function bubbleTick(dt) {
  const b = $('#bubble');
  if (!lv.bubbleT) return;
  lv.bubbleT -= dt;
  if (lv.bubbleT <= 0 || state.screen !== 'play') { lv.bubbleT = 0; b.classList.remove('show'); return; }
  const p = lv.wanderer.position.clone(); p.y += 0.9; p.project(camera);
  const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
  const hw = b.offsetWidth / 2 + 8;
  b.style.transform = `translate(${Math.round(clamp(x, hw, W - hw))}px, ${Math.round(Math.max(70, y))}px) translate(-50%, -100%)`;
}

// ───────────────────────── camera ─────────────────────────
const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
function fitCamera() { view.needFit = true; }
function camBasis(yaw) {
  const p = view.pitch;
  const dir = _v.set(Math.cos(p) * Math.sin(yaw), Math.sin(p), Math.cos(p) * Math.cos(yaw));
  _f.copy(dir).negate(); _r.crossVectors(_f, THREE.Object3D.DEFAULT_UP).normalize(); _u.crossVectors(_r, _f);
  return dir;
}
function hudMargins() {
  return { top: view.title ? 0.2 : (64 + safeTop()) / H, bot: view.title ? 0.3 : (112 + safeBottom()) / H };
}
function needDist(yaw) {
  camBasis(yaw);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
  const { top, bot } = hudMargins();
  const usableV = 1 - top - bot, mx = 0.94;
  let need = 4;
  const hw = view.fitW / 2 + 0.05, hd = view.fitH / 2 + 0.05;
  for (const cx of [-hw, hw]) for (const cz of [-hd, hd]) for (const cy of [-0.45, view.maxH]) {
    const c = new THREE.Vector3(cx, cy - view.target.y, cz);
    const x = c.dot(_r), yy = c.dot(_u), z = c.dot(_f);
    need = Math.max(need, Math.abs(x) / (tanH * mx) - z, Math.abs(yy) / (tanV * usableV) - z);
  }
  return need;
}
// pick a starting angle that shows the island as big as possible, with the goal up the screen
function bestYaw() {
  const s = lv.s, cands = [];
  for (const base of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const off of [-0.55, 0.55]) cands.push(base + off);
  const sp = cellPos(s.sx, s.sy), gp = cellPos(s.gx, s.gy);
  const scored = cands.map(y => {
    const d = needDist(y);
    const fwd = new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y));
    const up = gp.clone().sub(sp).dot(fwd);       // > 0 when the goal is further from the camera than the start
    return { y, d, up };
  });
  const min = Math.min(...scored.map(c => c.d));
  const ok = scored.filter(c => c.d <= min * 1.06);
  ok.sort((a, b) => b.up - a.up);
  return ok[0].y;
}
function updateCamera(dt) {
  view.yaw += view.yawV * dt; view.yawV *= Math.pow(0.02, dt);
  if (view.title) view.yaw += dt * 0.12;
  const need = needDist(view.yaw);
  const dir = camBasis(view.yaw);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const { top, bot } = hudMargins();
  if (view.needFit) { view.dist = need; view.needFit = false; } else view.dist += (need - view.dist) * Math.min(1, dt * 4);
  if (scene.fog) { scene.fog.near = view.dist + 6; scene.fog.far = view.dist + 60; }
  // shift the view so the island sits between the HUD bars
  const shift = (bot - top) * tanV * view.dist;
  camera.position.copy(view.target).addScaledVector(dir, view.dist).addScaledVector(_u, -shift);
  if (view.shake > 0 && !save.settings.reducedMotion) { view.shake = Math.max(0, view.shake - dt); camera.position.x += (Math.random() - 0.5) * view.shake * 0.4; camera.position.y += (Math.random() - 0.5) * view.shake * 0.4; }
  camera.lookAt(_v.copy(view.target).addScaledVector(_u, -shift));
  if (post) post.mat.uniforms.uFocus.value = 0.5 + (bot - top) * 0.5;
}
function safeTop() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0; }
function safeBottom() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0; }

// ───────────────────────── input ─────────────────────────
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickCell(cx, cy) {
  if (!lv.s) return null;
  ndc.set(cx / W * 2 - 1, -(cy / H) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(lv.pick, false);
  if (!hits.length) return null;
  const i = hits[0].object.userData.cell;
  return { i, x: i % lv.s.w, y: (i / lv.s.w) | 0 };
}
function groundPoint(cx, cy, yPlane) {
  ndc.set(cx / W * 2 - 1, -(cy / H) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yPlane), out = new THREE.Vector3();
  return ray.ray.intersectPlane(pl, out) ? out : null;
}
const ptrs = new Map();
let gest = null;
const HOLD_MS = 240, MOVE_PX = 14, CHARGE_S = 0.42;

function onDown(e) {
  audio.unlock();
  if (state.screen === 'map') return mapDown(e);
  if (state.screen !== 'play') return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { cancelGesture(); const [a, b] = [...ptrs.values()]; gest = { mode: 'twist', ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2 }; return; }
  if (ptrs.size > 2) return;
  const cell = pickCell(e.clientX, e.clientY);
  gest = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), mode: null, cell, lastX: e.clientX, lastT: performance.now() };
  if (e.button === 2 || !cell) gest.mode = 'rotate';
}
function onMove(e) {
  if (state.screen === 'map') return mapMove(e);
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gest) return;
  if (gest.mode === 'twist') {
    if (ptrs.size < 2) return;
    const [a, b] = [...ptrs.values()], ang = Math.atan2(b.y - a.y, b.x - a.x), cx = (a.x + b.x) / 2;
    let d = ang - gest.ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    view.yaw -= d + (cx - gest.cx) * 0.006; gest.ang = ang; gest.cx = cx; return;
  }
  if (e.pointerId !== gest.id) return;
  const dx = e.clientX - gest.x, now = performance.now();
  gest.x = e.clientX; gest.y = e.clientY;
  const dist = Math.hypot(gest.x - gest.x0, gest.y - gest.y0);
  if (gest.mode === null && dist > MOVE_PX) gest.mode = 'wind';
  if (gest.mode === 'rotate') { view.yaw -= dx * 0.008; view.yawV = -dx * 0.008 / Math.max(0.008, (now - gest.lastT) / 1000) * 0.5; gest.lastT = now; }
  else if (gest.mode === 'cloud') {
    const c = pickCell(gest.x, gest.y);
    if (c && !gest.burst && (!gest.aim || c.i !== gest.aim.i)) { gest.aim = c; gest.charge = 0; showTargets(L.plus(c.x, c.y), lv.cloudKind === 'snow' ? '#ffffff' : '#7fd0ff'); }
  } else if (gest.mode === 'wind') {
    if (Math.random() < 0.5) { const gp = groundPoint(gest.x, gest.y, 0.5); if (gp) fxN.spawn({ x: gp.x, y: gp.y, z: gp.z, vy: 0.3, life: 0.5, size: 0.12, color: '#ffffff', shape: 0 }); }
  }
}
function onUp(e) {
  if (state.screen === 'map') return mapUp(e);
  const had = ptrs.delete(e.pointerId);
  if (!had || !gest) return;
  if (gest.mode === 'twist') { if (ptrs.size === 0) gest = null; return; }
  if (e.pointerId !== gest.id) return;
  const g = gest; gest = null;
  const el = performance.now() - g.t0, dist = Math.hypot(g.x - g.x0, g.y - g.y0);
  if (g.mode === null && dist <= MOVE_PX && el < 600 && g.cell) {
    if (lv.armed) { lv.armed = false; doWeather({ w: 'bolt', x: g.cell.x, y: g.cell.y }); updateHud(); }
    else doWeather({ w: 'sun', x: g.cell.x, y: g.cell.y });
  } else if (g.mode === 'wind' && g.cell) {
    windFromSwipe(g);
  } else if (g.mode === 'cloud') {
    releaseCloud(g);
  }
}
function cancelGesture() { if (gest && gest.mode === 'cloud') releaseCloud(gest); gest = null; }
function windFromSwipe(g) {
  const dx = g.x - g.x0, dy = g.y - g.y0;
  // screen direction -> world direction using the camera's right / flattened forward
  const right = _r.clone(), fwd = new THREE.Vector3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw));
  right.y = 0; right.normalize();
  const wd = right.multiplyScalar(dx).add(fwd.multiplyScalar(-dy));
  const dirs = [[1, 0, 'e'], [0, 1, 's'], [-1, 0, 'w'], [0, -1, 'n']];
  let best = dirs[0], bd = -1e9;
  dirs.forEach(d => { const v = d[0] * wd.x + d[1] * wd.z; if (v > bd) { bd = v; best = d; } });
  const i0 = g.cell.i, y0 = lv.s.t[i0] === T.VOID ? 0 : cellTopY(i0);
  const a = groundPoint(g.x0, g.y0, y0), b = groundPoint(g.x, g.y, y0);
  let len = 1;
  if (a && b) { const along = (b.x - a.x) * best[0] + (b.z - a.z) * best[1]; len = clamp(Math.round(along) + 1, 1, 5); }
  doWeather({ w: 'wind', x: g.cell.x, y: g.cell.y, dir: best[2], len });
}
function startCloud(g) {
  g.mode = 'cloud';
  const kind = lv.cloudKind === 'snow' && lv.weathers.includes('snow') ? 'snow' : 'rain';
  if (!lv.weathers.includes(kind)) { audio.nope(); say('Tap for sunshine!', 'ask', 1.5); g.mode = 'dead'; return; }
  g.kind = kind; g.charge = 0; g.aim = g.cell;
  const cl = makeCloud(kind); cl.scale.setScalar(0.01); lvRoot.add(cl);
  lv.cloud = { group: cl, g, life: 0 };
  showTargets(L.plus(g.cell.x, g.cell.y), kind === 'snow' ? '#ffffff' : '#7fd0ff');
  audio.rainStart();
}
function releaseCloud(g) {
  clearTargets();
  if (!lv.cloud) return;
  const c = lv.cloud; lv.cloud = null;
  if (!g.burst) puff(c.group.position.x, c.group.position.y, c.group.position.z, 8, { color: '#ffffff', speed: 1, up: 0.5, size: 0.3, grav: 0 });
  const grp = c.group; let t = 0;
  addFx(dt => { t += dt; grp.position.y += dt * 1.5; grp.scale.multiplyScalar(Math.pow(0.05, dt)); if (t > 0.9) { disposeGroup(grp); return false; } return true; });
}
function cloudTick(dt) {
  if (gest && gest.mode === null && performance.now() - gest.t0 > HOLD_MS && gest.cell && state.screen === 'play') startCloud(gest);
  if (!lv.cloud) return;
  const c = lv.cloud, g = c.g, grp = c.group;
  c.life += dt;
  const aim = g.aim || g.cell, p = cellPos(aim.x, aim.y), i = aim.i;
  const ty = (lv.s.t[i] === T.VOID ? 0 : cellTopY(i)) + 2.0;
  grp.position.x += (p.x - grp.position.x) * Math.min(1, dt * 14); grp.position.z += (p.z - grp.position.z) * Math.min(1, dt * 14);
  grp.position.y = c.life < 0.05 ? ty : grp.position.y + (ty - grp.position.y) * Math.min(1, dt * 10);
  grp.lookAt(camera.position.x, grp.position.y, camera.position.z);
  const s0 = g.burst ? 1.05 + Math.sin(c.life * 10) * 0.03 : 0.5 + 0.55 * backOut(Math.min(1, g.charge));
  grp.scale.setScalar(s0);
  grp.userData.eyes.forEach(e => { e.scale.y = g.burst ? 0.02 : 0.05; });
  if (!g.burst) {
    g.charge += dt / CHARGE_S;
    grp.userData.ring.scale.setScalar(Math.max(0.001, 0.25 + Math.min(1, g.charge) * 0.45));
    if (g.charge >= 1) {
      g.burst = true; grp.userData.ring.visible = false; clearTargets();
      const r = doWeather({ w: g.kind, x: aim.x, y: aim.y });
      if (r) { rainFx(aim.x, aim.y, g.kind, 1.0); if (g.kind === 'snow') audio.snow(); else audio.rain(); }
    }
  }
}

function onKey(e) {
  if (state.screen !== 'play') { if (e.key === 'Escape' && state.screen !== 'title') closeSheet(); return; }
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'q') view.yawV += 3;
  else if (k === 'arrowright' || k === 'e') view.yawV -= 3;
  else if (k === 'r') retryLevel();
  else if (k === 'h') showHint();
  else if (k === 'escape' || k === 'p') openPause();
  else if (k === 'c' || k === ' ') toggleCloudKind();
  else if (k === 'b') armBolt();
}

// ───────────────────────── UI ─────────────────────────
const state = { screen: 'boot', mapSel: 0 };
const ICONS = {
  sun: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="6.5" fill="#ffd23f" stroke="#e8a21c" stroke-width="1.5"/><g stroke="#ffb02e" stroke-width="2.4" stroke-linecap="round"><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8"/></g></svg>',
  rain: '<svg viewBox="0 0 32 32"><path d="M9 19a5 5 0 01.6-10 7 7 0 0113.2 1.6A4.3 4.3 0 0123 19z" fill="#eef4ff" stroke="#8fb0e0" stroke-width="1.5"/><g stroke="#4fb3ff" stroke-width="2.4" stroke-linecap="round"><path d="M11 23l-1 3M17 23l-1 3M23 23l-1 3"/></g></svg>',
  snow: '<svg viewBox="0 0 32 32"><path d="M9 17a5 5 0 01.6-10 7 7 0 0113.2 1.6A4.3 4.3 0 0123 17z" fill="#fff" stroke="#9fb4e6" stroke-width="1.5"/><g stroke="#7fb8ff" stroke-width="1.8" stroke-linecap="round"><path d="M12 21v6M9.5 22.5l5 3M9.5 25.5l5-3M21 21v6M18.5 22.5l5 3M18.5 25.5l5-3"/></g></svg>',
  wind: '<svg viewBox="0 0 32 32"><g fill="none" stroke="#5fc8e8" stroke-width="2.6" stroke-linecap="round"><path d="M4 12h15a4 4 0 10-4-4"/><path d="M4 18h20a4 4 0 11-4 4"/><path d="M4 24h8"/></g></svg>',
  bolt: '<svg viewBox="0 0 32 32"><path d="M18 3L7 18h7l-3 11 12-16h-7z" fill="#ffe066" stroke="#e8a21c" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path d="M12 2c3 5 7 8.5 7 12.5A7 7 0 015 14.5C5 10.5 9 7 12 2z" fill="currentColor"/></svg>'
};
const GESTURE = { sun: 'Tap', rain: 'Hold', snow: 'Hold', wind: 'Swipe', bolt: 'Arm' };

function showScreen(name) {
  state.screen = name;
  document.body.dataset.screen = name;
  ['title', 'map', 'hud'].forEach(id => $('#' + id).classList.toggle('hidden', !(id === name || (id === 'hud' && name === 'play'))));
  $('#levelcard').classList.add('hidden');
  if (name !== 'play') { $('#bubble').classList.remove('show'); lv.bubbleT = 0; }
  activeScene = name === 'map' ? mapScene : scene;
}

function buildWeatherBar() {
  const bar = $('#weatherbar'); bar.innerHTML = '';
  const ws = lv.weathers;
  const chip = (w, extra) => {
    const b = document.createElement('button'); b.className = 'chip'; b.dataset.w = w;
    b.innerHTML = `<span class="ico">${ICONS[w]}</span><span class="lbl">${GESTURE[w]}</span>${extra || ''}`;
    bar.appendChild(b); return b;
  };
  if (ws.includes('sun')) chip('sun').addEventListener('click', () => { audio.ui(); say('Tap the island to shine!', 'happy', 2); });
  if (ws.includes('rain')) {
    const hasSnow = ws.includes('snow');
    const b = chip(lv.cloudKind === 'snow' && hasSnow ? 'snow' : 'rain', hasSnow ? '<span class="swap">⇄</span>' : '');
    b.id = 'chip-cloud';
    b.addEventListener('click', () => { if (hasSnow) toggleCloudKind(); else { audio.ui(); say('Press and hold the island to rain!', 'happy', 2.2); } });
  }
  if (ws.includes('wind')) chip('wind').addEventListener('click', () => { audio.ui(); say('Swipe across the island to blow!', 'happy', 2.2); });
  if (ws.includes('bolt') && (lv.def.bolts || 0) > 0) {
    const b = chip('bolt', `<span class="count" id="bolt-count">${lv.s.bolts}</span>`); b.id = 'chip-bolt';
    b.addEventListener('click', armBolt);
  }
}
function toggleCloudKind() {
  if (!lv.weathers.includes('snow')) return;
  lv.cloudKind = lv.cloudKind === 'snow' ? 'rain' : 'snow'; audio.ui();
  const b = $('#chip-cloud'); if (b) { b.dataset.w = lv.cloudKind; b.querySelector('.ico').innerHTML = ICONS[lv.cloudKind]; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  say(lv.cloudKind === 'snow' ? 'Snow cloud ready!' : 'Rain cloud ready!', 'happy', 1.4);
}
function armBolt() {
  if (!lv.s || lv.s.bolts <= 0) { audio.nope(); return; }
  lv.armed = !lv.armed; audio.ui(); updateHud();
  if (lv.armed) say('Tap where lightning should strike!', 'wow', 2);
}
function updateHud() {
  if (!lv.def) return;
  $('#hud-level').textContent = lv.def.id + ' · ' + lv.def.name;
  const sv = lvSave(lv.def.id);
  const drops = lv.s ? lv.s.secrets.map(q => q.taken || sv.drops[q.id]) : [false, false, false];
  $('#hud-drops').innerHTML = drops.map(d => `<span class="drop ${d ? 'got' : ''}">${ICONS.drop}</span>`).join('');
  const par = lv.def.par || 0;
  $('#hud-uses').innerHTML = `<b>${lv.uses}</b><small>/${par}</small>`;
  $('#hud-uses').classList.toggle('over', lv.uses > par);
  const bc = $('#bolt-count'); if (bc) bc.textContent = lv.s.bolts;
  const cb = $('#chip-bolt'); if (cb) { cb.classList.toggle('armed', !!lv.armed); cb.classList.toggle('empty', lv.s.bolts <= 0); }
  document.body.classList.toggle('armed', !!lv.armed);
}

function startLevel(k, opts = {}) {
  if (!unlocked(k) && !opts.force) return;
  const sameLevel = lv.k === k && lv.def && state.screen === 'play';
  if (!sameLevel) lv.fails = 0;
  loadLevel(k, opts);
  showScreen('play');
  buildWeatherBar(); updateHud();
  hideResult(); closeSheet();
  $('#hint-btn').classList.toggle('hidden', true);
  $('#btn-retry').classList.remove('glow');
  lv.wait = opts.retry ? 0.5 : 1.4;
  fitCamera();
  if (!opts.retry) {
    const b = $('#banner'); b.querySelector('.n').textContent = lv.def.id; b.querySelector('.t').textContent = lv.def.name;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    setTimeout(() => say(lv.def.tip, 'happy', 5), 1300);
  }
}
function retryLevel() {
  if (!lv.def) return;
  save.stats.retries++; lv.fails++; persist();
  audio.back();
  // a quick "rewind" sparkle, then rebuild
  startLevel(lv.k, { retry: true, keepYaw: true, force: true });
}
function hideResult() { $('#result').classList.add('hidden'); }
const GOAL_LINES = { seed: 'Seed found!', home: 'Home sweet home!', lantern: 'Lantern lit!', friend: 'Friend found!' };
function showResult(info) {
  if (state.screen !== 'play' || !lv.won) return;
  const def = lv.def, sv = lvSave(def.id), r = $('#result');
  $('#res-title').textContent = GOAL_LINES[def.goal] || 'Hooray!';
  $('#res-kicker').textContent = def.id + ' · ' + def.name;
  $('#res-drops').innerHTML = sv.drops.map(d => `<span class="drop ${d ? 'got' : ''}">${ICONS.drop}</span>`).join('');
  const chal = info.beatChallenge;
  $('#res-chal').innerHTML = `<span class="badge ${sv.challenge ? 'got' : ''}">☁</span> Weather used <b>${lv.uses}</b> · challenge <b>${info.par}</b> or fewer ${chal ? '<em>✓ Done!</em>' : ''}`;
  const missing = 3 - sv.drops.filter(Boolean).length;
  $('#res-sub').textContent = missing ? `${missing} sun drop${missing > 1 ? 's' : ''} still hidden here. Try every kind of weather!` : 'Every sun drop found. Lovely!';
  const next = lv.k + 1 < LEVELS.length;
  $('#res-next').classList.toggle('hidden', !next);
  $('#res-next').textContent = next && LEVELS[lv.k + 1].world !== def.world ? 'Next world' : 'Next';
  r.classList.remove('hidden');
  if (chal) setTimeout(() => audio.star(), 300);
  if (lv.k === LEVELS.length - 1) setTimeout(() => toast('🌈 The sky is yours', 'You finished Pocket Weather. Thank you for playing!'), 900);
}

function openSheet(title, html) {
  $('#sheet-title').textContent = title; $('#sheet-body').innerHTML = html; $('#sheet').classList.remove('hidden');
}
function closeSheet() { $('#sheet').classList.add('hidden'); if (state.screen === 'play') state.paused = false; }
function openPause() {
  if (state.screen !== 'play') return;
  state.paused = true; audio.ui();
  openSheet('Paused', `<div class="menu">
    <button class="primary" data-act="resume">Keep playing</button>
    <button data-act="retry">Start level again</button>
    <button data-act="hint">Show a hint</button>
    <button data-act="map">World map</button>
    <button data-act="settings">Settings</button></div>`);
}
function settingsHtml() {
  const s = save.settings;
  const tog = (k, label, sub) => `<label class="row toggle"><span>${label}<small>${sub}</small></span><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}><i></i></label>`;
  return `<div class="settings">
    <label class="row"><span>Music</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-set="music"></label>
    <label class="row"><span>Sounds</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-set="sfx"></label>
    ${tog('reducedMotion', 'Reduced motion', 'Calmer camera, no shaking or flashing')}
    ${tog('reducedEffects', 'Reduced effects', 'Fewer particles, no blur or shadows. Faster on older phones')}
    ${tog('leftHanded', 'Left-handed', 'Mirror the buttons')}
    <button class="danger" data-act="reset">Erase all progress</button>
    <p class="fine">Pocket Weather · build ${BUILD}</p></div>`;
}
function openSettings() { openSheet('Settings', settingsHtml()); }
function openCollection() {
  const st = save.stats, total = LEVELS.length;
  const ach = ACHIEVEMENTS.map(a => `<li class="${save.ach[a.id] ? 'got' : ''}"><b>${save.ach[a.id] ? '🏅' : '○'} ${a.name}</b><small>${a.desc}</small></li>`).join('');
  const worlds = WORLDS.map(w => { const ls = LEVELS.filter(l => l.world === w.id); const d = ls.filter(l => (save.levels[l.id] || {}).done).length; const dr = ls.reduce((n, l) => n + ((save.levels[l.id] || {}).drops || []).filter(Boolean).length, 0); return `<div class="wrow"><span>${w.name}</span><span>${d}/${ls.length} <i class="mini">${ICONS.drop}</i>${dr}/${ls.length * 3}</span></div>`; }).join('');
  openSheet('Collection', `<div class="stats">
    <div class="big"><div><b>${doneCount()}</b><small>of ${total} islands</small></div><div><b>${totalDrops()}</b><small>of ${total * 3} sun drops</small></div><div><b>${challengeCount()}</b><small>challenges</small></div></div>
    ${worlds}
    <div class="grid">
      <div>${ICONS.rain}<b>${st.rain}</b><small>rained</small></div><div>${ICONS.sun}<b>${st.sun}</b><small>shone</small></div><div>${ICONS.wind}<b>${st.wind}</b><small>blown</small></div>
      <div>${ICONS.snow}<b>${st.snow}</b><small>snowed</small></div><div>${ICONS.bolt}<b>${st.bolt}</b><small>struck</small></div><div><span class="emo">🌈</span><b>${st.rainbows}</b><small>rainbows</small></div>
      <div><span class="emo">💦</span><b>${st.splashes}</b><small>splashes</small></div><div><span class="emo">☂️</span><b>${st.glides}</b><small>glides</small></div><div><span class="emo">↻</span><b>${st.retries}</b><small>retries</small></div>
    </div>
    <h4>Achievements</h4><ul class="ach">${ach}</ul></div>`);
}
function applySettings() {
  const s = save.settings;
  audio.setVolumes(s.music, s.sfx);
  document.body.classList.toggle('lefty', !!s.leftHanded);
  document.body.classList.toggle('calm', !!s.reducedMotion);
}

let toastTimer = null;
function toast(title, sub) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `<b></b><small></small>`;
  t.querySelector('b').textContent = title; t.querySelector('small').textContent = sub || '';
  $('#toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3800);
}

function wireUi() {
  const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener('click', e => { audio.unlock(); fn(e); }); };
  on('#btn-play', () => { audio.ui(); openMap(); });
  on('#btn-collection', () => { audio.ui(); openCollection(); });
  on('#btn-settings', () => { audio.ui(); openSettings(); });
  on('#btn-pause', openPause);
  on('#btn-retry', retryLevel);
  on('#hint-btn', () => { audio.ui(); showHint(); });
  on('#rot-l', () => { view.yawV += 2.6; audio.ui(); });
  on('#rot-r', () => { view.yawV -= 2.6; audio.ui(); });
  on('#map-back', () => { audio.back(); openTitle(); });
  on('#map-collection', () => { audio.ui(); openCollection(); });
  on('#lc-play', () => { audio.ui(); startLevel(state.mapSel); });
  on('#lc-close', () => { audio.back(); $('#levelcard').classList.add('hidden'); });
  on('#res-next', () => { audio.ui(); const n = lv.k + 1; if (LEVELS[n] && LEVELS[n].world !== lv.def.world) { openMap(n); } else startLevel(n); });
  on('#res-retry', () => { hideResult(); retryLevel(); });
  on('#res-map', () => { audio.back(); openMap(lv.k); });
  on('#sheet-close', () => { audio.back(); closeSheet(); });
  $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
  $('#sheet-body').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act; audio.ui();
    if (act === 'resume') closeSheet();
    else if (act === 'retry') { closeSheet(); retryLevel(); }
    else if (act === 'hint') { closeSheet(); showHint(); }
    else if (act === 'map') { closeSheet(); openMap(lv.k); }
    else if (act === 'settings') openSettings();
    else if (act === 'reset') {
      if (b.dataset.confirm) { const keep = save.settings; save = freshSave(); save.settings = keep; persist(true); closeSheet(); toast('Progress erased', 'A fresh start under clear skies.'); if (state.screen !== 'title') openTitle(); }
      else { b.dataset.confirm = '1'; b.textContent = 'Tap again to erase everything'; }
    }
  });
  $('#sheet-body').addEventListener('input', e => {
    const k = e.target.dataset.set; if (!k) return;
    save.settings[k] = e.target.type === 'checkbox' ? e.target.checked : parseFloat(e.target.value);
    persist(); applySettings();
    if (k === 'reducedEffects') applyQuality();
  });
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); if (gest && gest.id === e.pointerId) { if (gest.mode === 'cloud') releaseCloud(gest); gest = null; } mapUp(e, true); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { if (state.screen === 'play') { view.yaw -= e.deltaY * 0.002 + e.deltaX * 0.002; e.preventDefault(); } else if (state.screen === 'map') { map.scrollV += e.deltaY * 0.02; e.preventDefault(); } }, { passive: false });
  window.addEventListener('keydown', onKey);
  // iOS: no double-tap zoom / long-press callouts on the game surface
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.suspend(); persist(true); } else audio.resume(); });
  window.addEventListener('pagehide', () => persist(true));
  const unlockOnce = () => audio.unlock();
  ['touchend', 'pointerup', 'keydown'].forEach(ev => window.addEventListener(ev, unlockOnce, { passive: true }));
}

// ───────────────────────── world map (a board game in the clouds) ─────────────────────────
const map = { built: false, nodes: [], scroll: 0, scrollV: 0, token: null, drag: null, islands: [], hop: null };
const MAP_SPACING = 7.5;
function mapNodePos(k) {
  const def = LEVELS[k], w = def.world, list = LEVELS.filter(l => l.world === w), j = list.indexOf(def);
  const cx = (w % 2 ? 1.6 : -1.6), cz = -w * MAP_SPACING;
  if (list.length === 1) return new THREE.Vector3(cx, 0.12, cz);
  const row = j < 3 ? 0 : 1, col = row === 0 ? j : 5 - j;
  return new THREE.Vector3(cx - 2 + col * 2, 0.12, cz + 1.4 - row * 2.6);
}
function buildMap() {
  const sc = mapScene;
  sc.background = skyTexture('#9fd0ff', '#ffe6f2');
  lights(sc, A.PALETTES[0]);
  makeCloudBank(sc, 14, 12, -3, rng(99));
  const rand = rng(1234);
  WORLDS.forEach(w => {
    const Pw = A.PALETTES[w.id], g = new THREE.Group();
    const cx = (w.id % 2 ? 1.6 : -1.6), cz = -w.id * MAP_SPACING;
    g.position.set(cx, 0, cz);
    const big = w.id === 4 ? 3.4 : 6.8, deep = w.id === 4 ? 3.4 : 5.4;
    g.add(A.mesh(A.slab(big, deep, 1.2, 0.8), A.toon(Pw.side, { rim: 0.3 }), 0, -1.2));
    g.add(A.mesh(A.slab(big + 0.12, deep + 0.12, 0.22, 0.85), A.toon(w.id === 2 ? '#f7faff' : w.id === 1 ? '#f6d995' : w.id === 3 ? Pw.ground : GRASS[w.id], { rim: 0.3 }), 0, -0.2));
    const cells = []; for (let x = -big / 2 + 0.6; x < big / 2; x += 1.1) for (let z = -deep / 2 + 0.6; z < deep / 2; z += 1.1) cells.push([x, z]);
    const under = A.underRocks(Pw, cells, rand); under.position.y = 0.2; g.add(under);
    // decorations around the edge
    const nodesHere = LEVELS.map((l, k) => l.world === w.id ? mapNodePos(k) : null).filter(Boolean);
    for (let k = 0; k < (w.id === 4 ? 6 : 14); k++) {
      const a = k / 14 * Math.PI * 2 + rand(), px = Math.cos(a) * big * 0.43, pz = Math.sin(a) * deep * 0.43;
      if (nodesHere.some(n => Math.hypot(n.x - cx - px, n.z - cz - pz) < 1.0)) continue;
      const tr = A.tree(Pw, w.id, rand); tr.position.set(px, 0, pz); tr.scale.multiplyScalar(0.75); g.add(tr);
    }
    if (w.id === 1) { const m = A.windmill(Pw); m.position.set(big * 0.42, 0, -deep * 0.1); g.add(m); }
    if (w.id === 4) { const r = A.rainbowArc(3.2, 1.4); r.position.set(-1.6, 0, -1.2); g.add(r); }
    // world name banner
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,0.92)'; const rr = 56; x.beginPath(); x.moveTo(rr, 8); x.arcTo(504, 8, 504, 120, rr); x.arcTo(504, 120, 8, 120, rr); x.arcTo(8, 120, 8, 8, rr); x.arcTo(8, 8, 504, 8, rr); x.fill();
    x.fillStyle = '#5a4a7a'; x.font = '800 52px ui-rounded, "SF Pro Rounded", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(w.name, 256, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false })); sp.scale.set(3.2, 0.8, 1); sp.position.set(0, 1.9, -deep / 2 + 0.2); g.add(sp);
    sc.add(g); map.islands.push(g);
  });
  // dotted path
  const dotM = A.toon('#ffffff', { rim: 0.3 });
  for (let k = 0; k < LEVELS.length - 1; k++) {
    const a = mapNodePos(k), b = mapNodePos(k + 1), n = Math.max(2, Math.round(a.distanceTo(b) / 0.42));
    for (let j = 1; j < n; j++) { const u = j / n, p = a.clone().lerp(b, u); const cross = LEVELS[k].world !== LEVELS[k + 1].world; p.y = 0.05 + (cross ? Math.sin(u * Math.PI) * 1.2 : 0); sc.add(A.mesh(A.G.sphere(8), dotM, p.x, p.y, p.z, 0.07, 0.04, 0.07)); }
  }
  LEVELS.forEach((def, k) => {
    const g = new THREE.Group(); g.position.copy(mapNodePos(k));
    const disc = A.mesh(A.G.cyl(20), A.toon('#ffffff', { rim: 0.4 }).clone(), 0, 0, 0, 0.42, 0.16, 0.42); disc.userData.node = k; g.add(disc);
    const rim = A.mesh(A.G.cyl(20), A.toon('#e2d8f6').clone(), 0, -0.06, 0, 0.48, 0.1, 0.48); rim.userData.node = k; g.add(rim);
    const label = makeLabelSprite(def.id, { font: 44 }); label.scale.setScalar(0.6); label.position.y = 0.62; g.add(label);
    const flag = new THREE.Group(); flag.add(A.mesh(A.G.cyl(5), A.toon('#9a6a44'), 0, 0.3, 0, 0.02, 0.5, 0.02)); flag.add(A.mesh(A.G.box(), A.toon('#ff7b7b', { side: true }), 0.12, 0.47, 0, 0.22, 0.14, 0.01)); flag.position.set(0.3, 0, -0.2); g.add(flag);
    const dots = new THREE.Group(); for (let j = 0; j < 3; j++) { const d = A.mesh(A.G.sphere(8), A.toon('#ffd35c', { emissive: '#ffb02e', emissiveIntensity: 0.5 }).clone(), -0.16 + j * 0.16, 0.12, 0.42, 0.055); dots.add(d); } g.add(dots);
    mapScene.add(g);
    map.nodes.push({ g, disc, rim, label, flag, dots });
  });
  const tok = A.creature('#fff3dc', '#ff9a6b'); tok.scale.setScalar(1.5); mapScene.add(tok); map.token = tok;
  map.built = true;
}
function refreshMap() {
  map.nodes.forEach((n, k) => {
    const sv = save.levels[LEVELS[k].id] || {}, open = unlocked(k);
    n.disc.material.color.set(sv.done ? '#ffd35c' : open ? '#ffffff' : '#c9c4d8');
    n.rim.material.color.set(sv.challenge ? '#7fd0ff' : sv.done ? '#f0b23c' : '#e2d8f6');
    n.flag.visible = !!sv.done;
    n.label.material.opacity = open ? 1 : 0.5;
    n.dots.children.forEach((d, j) => { d.visible = !!(sv.drops && sv.drops[j]); });
  });
}
function furthest() { let k = 0; while (k + 1 < LEVELS.length && unlocked(k + 1)) k++; return k; }
function openMap(focus) {
  if (!map.built) buildMap();
  refreshMap();
  showScreen('map');
  clearWeatherFx();
  const k = focus !== undefined ? clamp(focus, 0, furthest()) : furthest();
  state.mapSel = k;
  map.token.position.copy(mapNodePos(k)); map.token.position.y = 0.2;
  const isl = map.islands[LEVELS[k].world];
  map.scroll = isl ? (isl.parent ? isl.getWorldPosition(new THREE.Vector3()).z : isl.position.z) * 0.6 + mapNodePos(k).z * 0.4 : mapNodePos(k).z; map.scrollV = 0;
  $('#map-drops').textContent = totalDrops() + ' / ' + LEVELS.length * 3;
  audio.play('map');
  $('#levelcard').classList.add('hidden');
}
function selectNode(k) {
  if (!unlocked(k)) { audio.nope(); toast('Not yet!', 'Finish ' + LEVELS[k - 1].id + ' first to open this island.'); return; }
  audio.ui(); audio.voice('happy');
  const from = map.token.position.clone(), to = mapNodePos(k); to.y = 0.2;
  map.hop = { t: 0, dur: 0.25 + Math.min(1.2, from.distanceTo(to) * 0.08), from, to };
  state.mapSel = k;
  const def = LEVELS[k], sv = save.levels[def.id] || { drops: [false, false, false] };
  $('#lc-kicker').textContent = WORLDS[def.world].name + ' · ' + def.id;
  $('#lc-title').textContent = def.name;
  $('#lc-drops').innerHTML = (sv.drops || [false, false, false]).map(d => `<span class="drop ${d ? 'got' : ''}">${ICONS.drop}</span>`).join('');
  $('#lc-chal').textContent = `Challenge: reach the goal using ${def.par} weather or fewer` + (sv.challenge ? ' ✓' : '') + (sv.best != null ? ` · best ${sv.best}` : '');
  $('#lc-weather').innerHTML = L.weathersFor(def).filter(w => w !== 'bolt' || def.bolts).map(w => `<span class="wi">${ICONS[w]}</span>`).join('');
  $('#lc-play').textContent = sv.done ? 'Play again' : 'Play';
  $('#levelcard').classList.remove('hidden');
}
function mapDown(e) {
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
  map.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, y: e.clientY, t: performance.now(), moved: false, lastT: performance.now() };
  map.scrollV = 0;
}
function mapMove(e) {
  const d = map.drag; if (!d || d.id !== e.pointerId) return;
  const dy = e.clientY - d.y; d.y = e.clientY;
  if (Math.abs(e.clientY - d.y0) > 8 || Math.abs(e.clientX - d.x0) > 8) d.moved = true;
  const k = 22 / H;
  map.scroll -= dy * k; const now = performance.now(); map.scrollV = -dy * k / Math.max(0.008, (now - d.lastT) / 1000) * 0.6; d.lastT = now;
}
function mapUp(e, cancel) {
  const d = map.drag; if (!d || d.id !== e.pointerId) return;
  map.drag = null;
  if (cancel || d.moved) return;
  ndc.set(e.clientX / W * 2 - 1, -(e.clientY / H) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const objs = []; map.nodes.forEach(n => objs.push(n.disc, n.rim));
  const hit = ray.intersectObjects(objs, false)[0];
  if (hit) selectNode(hit.object.userData.node);
}
function mapTick(dt) {
  if (!map.drag) { map.scroll += map.scrollV * dt; map.scrollV *= Math.pow(0.05, dt); }
  map.scroll = clamp(map.scroll, -4 * MAP_SPACING, 1.5);
  // keep the selected node roughly in view when hopping
  if (map.hop) {
    const h = map.hop; h.t += dt; const f = Math.min(1, h.t / h.dur);
    map.token.position.lerpVectors(h.from, h.to, f); map.token.position.y = 0.2 + Math.sin(f * Math.PI) * (0.5 + h.from.distanceTo(h.to) * 0.08);
    map.token.rotation.y = Math.atan2(h.to.x - h.from.x, h.to.z - h.from.z);
    if (f >= 1) { map.hop = null; audio.hop(); }
    map.scroll += (h.to.z - map.scroll) * Math.min(1, dt * 2);
  } else map.token.rotation.y += ((0.3) - map.token.rotation.y) * Math.min(1, dt * 3);
  const u = map.token.userData; u.bob.scale.y = 1 + Math.sin(clock.t * 3) * 0.03;
  u.eyes.forEach(e => { e.scale.y = (clock.t % 3.7) < 0.12 ? 0.15 : 1; });
  map.nodes.forEach((n, k) => { const sel = k === state.mapSel; n.g.position.y = 0.12 + (sel ? Math.sin(clock.t * 4) * 0.05 + 0.05 : 0); n.g.scale.setScalar(sel ? 1.12 : 1); });
  map.islands.forEach((g, j) => { g.position.y = Math.sin(clock.t * 0.8 + j) * 0.08; });
  // camera
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
  const dist = Math.max(11, 4.6 / tanH, 5.5 / tanV);
  const tgt = new THREE.Vector3(0, 0, map.scroll - 0.6);
  camera.position.set(tgt.x, tgt.y + dist * Math.sin(1.0), tgt.z + dist * Math.cos(1.0));
  camera.lookAt(tgt);
  if (post) post.mat.uniforms.uFocus.value = 0.5;
}

// ───────────────────────── title ─────────────────────────
const TITLE_DEF = { id: 'title', world: 0, goal: 'home', name: 'Pocket Weather',
  map: ['_T..F._', '.oo..T.', 'M.o..*.', '_.T$.._'], drops: [] };
function openTitle() {
  loadLevel(TITLE_DEF);
  view.title = true; view.yaw = -0.5; fitCamera();
  showScreen('title');
  audio.play('title');
  $('#btn-play').textContent = doneCount() ? 'Continue' : 'Play';
}

// ───────────────────────── main loop ─────────────────────────
const clock = { t: 0, last: 0 };
let frames = 0, firstFrameDone = false;
function update(dt) {
  clock.t += dt;
  A.shared.time.value = clock.t;
  shared.windPulse = Math.max(0, (shared.windPulse || 0) - dt * 1.2);
  A.shared.wind.value = Math.sin(shared.windPulse * Math.PI) * 0.12;
  for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
  for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; const u = Math.min(1, a.t / a.dur); a.fn(u); if (u >= 1) { anims.splice(i, 1); if (a.done) a.done(); } }
  for (let i = fxItems.length - 1; i >= 0; i--) if (!fxItems[i](dt)) fxItems.splice(i, 1);
  if (state.screen === 'map') { mapTick(dt); return; }
  fxN.update(dt); fxA.update(dt);
  if (!lv.s) return;
  const t = clock.t;
  lv.cells.forEach(c => {
    if (!c) return;
    if (c.pop !== undefined) { c.pop += dt / 0.45; const k = Math.min(1, c.pop); const b = backOut(k); c.top.scale.set(lerp(0.6, 1, b), lerp(0.3, 1, b), lerp(0.6, 1, b)); if (k >= 1) { c.pop = undefined; c.top.scale.set(1, 1, 1); } }
    for (const u of c.updaters) u.userData.update(t, dt);
  });
  lv.objs.forEach(o => { if (o.mesh.userData.update) o.mesh.userData.update(t, dt); });
  if (lv.goal && lv.goal.userData.update) lv.goal.userData.update(t, dt);
  if (hintMarker) hintMarker.userData.update(t);
  lv.secrets.forEach(sc => { sc.prop.rotation.y = Math.sin(t * 1.5 + sc.prop.userData.twinkle) * 0.3; if (Math.random() < dt * 0.6) { const p = sc.prop.position; fxA.spawn({ x: p.x + (Math.random() - 0.5) * 0.2, y: p.y + 0.25, z: p.z + (Math.random() - 0.5) * 0.2, vy: 0.2, life: 0.9, size: 0.1, color: '#fff2a0', shape: 1, grav: 0 }); } });
  if (cloudBank) cloudBank.userData.update(t, dt);
  if (state.screen === 'title') {
    lvRoot.position.y = Math.sin(t * 0.9) * 0.15; lvRoot.rotation.z = Math.sin(t * 0.6) * 0.02;
    const w = lv.wanderer; if (w) { const u = w.userData; u.bob.scale.y = 1 + Math.sin(t * 3) * 0.03; u.arms[1].position.y = 0.26 + Math.abs(Math.sin(t * 6)) * 0.12; u.eyes.forEach(e => { e.scale.y = (t % 3.3) < 0.12 ? 0.15 : 1; }); w.rotation.y = view.yaw + 0.3; if (u.sprout) u.sprout.rotation.z = Math.sin(t * 4) * 0.15; }
  } else {
    lvRoot.position.y = 0; lvRoot.rotation.z = 0;
    if (!state.paused) { wandererTick(dt); cloudTick(dt); }
    bubbleTick(dt);
    // gentle hint offer
    if (!lv.won && !lv.hintShown && $('#hint-btn').classList.contains('hidden') && (lv.fails >= 2 || performance.now() - lv.lastProgress > 45000)) {
      $('#hint-btn').classList.remove('hidden'); $('#hint-btn').classList.add('glow'); say('Need a hint? Tap the bulb!', 'ask', 3);
    }
  }
  updateCamera(dt);
}
function render() {
  if (view.pose && lv.wanderer) {   // debug-only close-up (used to render the app icon from the game's own art)
    const w = lv.wanderer.getWorldPosition(new THREE.Vector3()), P = view.pose;
    camera.position.set(w.x + P[0], w.y + P[1], w.z + P[2]); camera.lookAt(w.x, w.y + P[3], w.z);
  }
  if (post && post.ok) {
    try {
      renderer.setRenderTarget(post.rt); renderer.render(activeScene, camera);
      renderer.setRenderTarget(null); renderer.render(post.scene, post.cam);
      return;
    } catch (e) { post.ok = false; post = null; console.warn('post disabled', e); }
  }
  renderer.setRenderTarget(null); renderer.render(activeScene, camera);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clock.last ? clamp((now - clock.last) / 1000, 0, 0.05) : 0.016;
  clock.last = now;
  update(dt * (DEBUG && window.__pwTime ? window.__pwTime : 1));
  render();
  frames++;
  if (!firstFrameDone) { firstFrameDone = true; bootDone(); }
  if (state.screen === 'play' && !lv.won) save.stats.seconds += dt;
}
function bootDone() {
  const ld = $('#loading'); if (ld && !ld.classList.contains('out')) { ld.classList.add('out'); setTimeout(() => ld.remove(), 700); }
  if (window.__pwBooted) window.__pwBooted();
}

// ───────────────────────── boot ─────────────────────────
function boot() {
  wireUi(); applySettings();
  post = save.settings.reducedEffects ? null : makePost();
  renderer.shadowMap.enabled = !save.settings.reducedEffects;
  resize();
  buildMap();
  if (DEBUG && params.get('level')) { const k = LEVELS.findIndex(l => l.id === params.get('level')); startLevel(Math.max(0, k), { force: true }); }
  else openTitle();
  // render one frame right away so a broken GPU path shows up as an error, not a hang
  update(0.016); render();
  requestAnimationFrame(frame);
  // loading screen fallback: never rely only on requestAnimationFrame (it pauses in background tabs)
  setTimeout(bootDone, 1200);
  window.__pwIdle = () => state.screen !== 'play' || lv.won || !lv.log.length;
  if (DEBUG) installDebug();
}

function installDebug() {
  const api = {
    ready: true, LEVELS, logic: L,
    screen: () => state.screen,
    state: () => ({ screen: state.screen, level: lv.def && lv.def.id, won: lv.won, wx: lv.s && lv.s.wx, wy: lv.s && lv.s.wy, uses: lv.uses, bolts: lv.s && lv.s.bolts, walking: !!lv.walk, cloud: lv.cloudKind, armed: !!lv.armed, post: !!post, gl2, frames }),
    tile: (x, y) => lv.s ? L.NAMES[lv.s.t[L.idx(lv.s, x, y)]] : null,
    obj: (x, y) => lv.s ? lv.s.o[L.idx(lv.s, x, y)] : null,
    load: (id, opts) => { const k = LEVELS.findIndex(l => l.id === id); startLevel(k, Object.assign({ force: true }, opts || {})); return k; },
    title: openTitle, map: (k) => openMap(k), select: selectNode,
    act: (a) => { const r = doWeather(a); return r ? { ok: r.ok, events: r.events.map(e => e.type + (e.kind ? ':' + e.kind : '')) } : null; },
    // screen position (CSS px) of a tile's centre, for real touch tests
    tilePos: (x, y) => { const i = L.idx(lv.s, x, y), p = cellPos(x, y); p.y = lv.s.t[i] === T.VOID ? 0 : cellTopY(i); p.project(camera); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H }; },
    nodePos: (k) => { const p = mapNodePos(k); p.y = 0.2; p.project(camera); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H }; },
    save: () => JSON.parse(JSON.stringify(save)),
    speed: (k) => { window.__pwSpeed = k; }, time: (k) => { window.__pwTime = k; },
    settled: () => !!lv.s && !lv.walk && !timers.length && !(lv.wait > 0) && (lv.won || !L.decide(lv.s)),
    hint: () => { const h = computeHint(); return h.act || null; },
    yaw: (v) => { if (v !== undefined) view.yaw = v; return view.yaw; },
    setting: (k, v) => { save.settings[k] = v; persist(true); applySettings(); if (k === 'reducedEffects') applyQuality(); },
    pose: (v) => { view.pose = v || null; },
    retry: retryLevel, pause: openPause, collection: openCollection, settings: openSettings, closeSheet
  };
  window.__pw = api;
}

try { boot(); }
catch (e) { console.error(e); if (window.__pwFatal) window.__pwFatal('Boot failed: ' + (e && e.message || e)); else throw e; }
