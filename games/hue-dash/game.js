// HUE DASH: rendering, input, UI, progress. Physics lives in logic.js (deterministic, tested in Node).
import * as THREE from './vendor/three/three.module.js';
import { DT, prepare, newState, step, clone, colorAt, platY, starsFor, speedAt } from './logic.js?v=__V__';
import { LEVELS, WORLDS } from './levels.js?v=__V__';
import { Audio } from './audio.js?v=__V__';

const $ = id => document.getElementById(id);
const HEX = [0xdedad8, 0xd6246e, 0xe2a21d, 0x1fb5c9];
const CSS = ['#9a929c', '#d6246e', '#e2a21d', '#1fb5c9'];
const THEMES = [
  { top: 0xfbf4ee, hor: 0xf5e6df, fog: 0xf6ebe5, neutral: 0xf2efee, back: [0xf0d9d4, 0xeadfe8, 0xf3e3d1], sun: 0xfff1e0 },
  { top: 0xe9eef3, hor: 0xdfe6ea, fog: 0xe1e8ec, neutral: 0xeef1f3, back: [0xc9d5dd, 0xd7dfe5, 0xbfcdd6], sun: 0xf4f7ff },
  { top: 0xf6d6c0, hor: 0xf3b9a0, fog: 0xf2c4ac, neutral: 0xf4e5da, back: [0xe8a98e, 0xdf9b86, 0xeebc9d], sun: 0xffe0c0 },
  { top: 0x1b1a33, hor: 0x40305a, fog: 0x2e2648, neutral: 0x8d88a6, back: [0x3a3260, 0x463a6e, 0x30294f], sun: 0xc8b8ff, night: true },
];
const OUTFITS = [
  { id: 'cap', name: 'Cap', stars: 0 }, { id: 'beanie', name: 'Beanie', stars: 6 }, { id: 'phones', name: 'Headphones', stars: 15 },
  { id: 'crown', name: 'Crown', stars: 30 }, { id: 'helmet', name: 'Helmet', stars: 45 }, { id: 'halo', name: 'Halo', stars: 70 },
];
const BOARDS = [
  { id: 'snow', name: 'Snow', c: 0xffffff, s: 0xd6246e, stars: 0 }, { id: 'mint', name: 'Mint', c: 0xbfeee0, s: 0x2fa58a, stars: 4 },
  { id: 'wood', name: 'Maple', c: 0xd9a36a, s: 0x8a5a2b, stars: 10 }, { id: 'ink', name: 'Ink', c: 0x35303d, s: 0xe2a21d, stars: 20 },
  { id: 'sky', name: 'Sky', c: 0x9fd0f5, s: 0xffffff, stars: 36 }, { id: 'gold', name: 'Gilded', c: 0xf2c84b, s: 0xffffff, stars: 55 },
  { id: 'prism', name: 'Prism', c: 0xffffff, s: 0x1fb5c9, stars: 84 },
];
const ACH = [
  { id: 'first', i: '🏁', n: 'First Finish', d: 'Finish any level' },
  { id: 'gems10', i: '💎', n: 'Gem Hunter', d: 'Collect 10 gems' },
  { id: 'perfect', i: '⭐', n: 'Perfectionist', d: 'Get 3 stars on a level' },
  { id: 'deaths50', i: '🧊', n: 'Shatterproof', d: 'Shatter 50 times and keep going' },
  { id: 'w1', i: '🌅', n: 'Dawn Rider', d: 'Finish Dawn Drift' },
  { id: 'w2', i: '🏔', n: 'Cloud Walker', d: 'Finish Misty Peaks' },
  { id: 'w3', i: '🏜', n: 'Dune Surfer', d: 'Finish Dune Dusk' },
  { id: 'w4', i: '🌃', n: 'Night Owl', d: 'Finish Neon Night' },
  { id: 'switch500', i: '🎨', n: 'Chromatic', d: 'Switch colour 500 times' },
  { id: 'all3', i: '👑', n: 'Hue Master', d: 'Get every star' },
];

// ---------- save ----------
const KEY = 'huedash.v1';
let save;
function loadSave() {
  try { save = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { save = {}; }
  save.levels = save.levels || {}; save.ach = save.ach || {};
  save.tot = Object.assign({ deaths: 0, jumps: 0, switches: 0, play: 0, runs: 0, finishes: 0 }, save.tot);
  save.set = Object.assign({ music: 0.7, sfx: 0.8, musicOn: true, sfxOn: true, reduced: false, ghost: true, bright: 1 }, save.set);
  save.look = Object.assign({ outfit: 'cap', board: 'snow' }, save.look);
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
const lvSave = id => save.levels[id] || (save.levels[id] = { done: false, stars: [false, false, false], gems: 0 });
const starCount = id => { const l = save.levels[id]; return l ? l.stars.filter(Boolean).length : 0; };
const totalStars = () => LEVELS.reduce((a, l) => a + starCount(l.id), 0);
const totalGems = () => LEVELS.reduce((a, l) => a + popc((save.levels[l.id] || {}).gems || 0), 0);
const popc = v => (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1);
const unlocked = id => id === 0 || !!(save.levels[id - 1] && save.levels[id - 1].done);

// ---------- renderer ----------
loadSave();
const audio = new Audio();
Object.assign(audio, { music: save.set.music, sfx: save.set.sfx, musicOn: save.set.musicOn, sfxOn: save.set.sfxOn });
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 260);
const hemi = new THREE.HemisphereLight(0xffffff, 0xd8cfc8, 1.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
function curTheme() { try { return theme; } catch (e) { return null; } }
function applyBright() { const b = save.set.bright || 1, n = THEMES.indexOf(curTheme()) === 3; hemi.intensity = (n ? 1.7 : 1.6) * b; sun.intensity = (n ? 0.9 : 1.9) * b; document.documentElement.style.setProperty('--bright', b); } sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 12, bottom: -12, near: 1, far: 60 });
sun.shadow.bias = -0.0006; sun.shadow.radius = 4; scene.add(sun); scene.add(sun.target);
scene.fog = new THREE.Fog(0xf6ebe5, 40, 150);
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vp; void main(){ float h = clamp(vp.y*1.8+0.15,0.0,1.0); gl_FragColor = vec4(mix(hor, top, h),1.0);\n#include <colorspace_fragment>\n}' });
const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 12), skyMat); sky.renderOrder = -1; scene.add(sky);

function resize() {
  const rc = $('game').getBoundingClientRect(); const w = Math.max(1, Math.round(rc.width || innerWidth)), h = Math.max(1, Math.round(rc.height || innerHeight)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 120)); if (window.visualViewport) visualViewport.addEventListener('resize', resize); resize();

// ---------- materials ----------
const matCache = {};
const mat = (hex, o = {}) => { const k = hex + JSON.stringify(o); return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, flatShading: true, ...o })); };
let platMats = [];
function setThemeMats(th) {
  platMats = [mat(th.neutral), mat(HEX[1], { roughness: 0.6 }), mat(HEX[2], { roughness: 0.6 }), mat(HEX[3], { roughness: 0.6 })];
  if (th.night) platMats = platMats.map((m, i) => i ? mat(HEX[i], { emissive: HEX[i], emissiveIntensity: 0.35 }) : m);
}
const box = new THREE.BoxGeometry(1, 1, 1);

// ---------- soft particle texture & smoke ----------
function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
}
const SOFT = softTex();
class Smoke {
  constructor(n) {
    this.n = n; const geo = new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); geo.setAttribute('aAlpha', this.alpha);
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { map: { value: SOFT } },
      vertexShader: 'attribute float aAlpha; varying float va; varying vec3 vc; varying vec2 vu; void main(){ va=aAlpha; vc=instanceColor; vu=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform sampler2D map; varying float va; varying vec3 vc; varying vec2 vu; void main(){ vec4 t=texture2D(map,vu); gl_FragColor=vec4(vc, t.a*va);\n#include <colorspace_fragment>\n}' });
    this.mesh = new THREE.InstancedMesh(geo, m, n); this.mesh.frustumCulled = false; this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.p = Array.from({ length: n }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, s: 1, gs: 1, c: new THREE.Color(), grey: new THREE.Color() }));
    this.i = 0; this.m4 = new THREE.Matrix4(); this.col = new THREE.Color(); scene.add(this.mesh);
  }
  emit(x, y, z, hex, o = {}) {
    const p = this.p[this.i = (this.i + 1) % this.n];
    p.life = p.max = o.life || 1.3 + Math.random() * 0.6; p.x = x; p.y = y; p.z = z; p.vx = o.vx ?? (-1.5 - Math.random()); p.vy = o.vy ?? (0.3 + Math.random() * 1.1);
    p.s = o.s || 0.7 + Math.random() * 0.5; p.gs = o.gs || 3.6; p.c.setHex(hex); p.grey.setHex(o.grey ?? 0x9a949c); p.a = o.a ?? 0.7;
  }
  clear() { this.p.forEach(p => p.life = 0); }
  update(dt) {
    const q = new THREE.Quaternion(); const camQ = camera.quaternion;
    for (let k = 0; k < this.n; k++) {
      const p = this.p[k];
      if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.985; }
      const f = Math.max(0, p.life / p.max), age = 1 - f, s = p.life > 0 ? p.s + age * p.gs : 0;
      this.m4.compose(new THREE.Vector3(p.x, p.y, p.z), camQ, new THREE.Vector3(s, s, s)); this.mesh.setMatrixAt(k, this.m4);
      this.col.copy(p.c).lerp(p.grey, Math.min(1, age * 1.3)); this.mesh.setColorAt(k, this.col);
      this.alpha.array[k] = p.life > 0 ? p.a * Math.min(1, f * 1.6) * Math.min(1, age * 8 + 0.2) : 0;
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; this.alpha.needsUpdate = true;
  }
}
class Cubes {
  constructor(n) {
    this.n = n; this.mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), n);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.p = Array.from({ length: n }, () => ({ life: 0 })); this.i = 0; this.m4 = new THREE.Matrix4(); this.e = new THREE.Euler(); this.q = new THREE.Quaternion(); scene.add(this.mesh);
  }
  burst(x, y, hex, n, o = {}) {
    const c = new THREE.Color(hex);
    for (let k = 0; k < n; k++) {
      const p = this.p[this.i = (this.i + 1) % this.n];
      Object.assign(p, { life: o.life || 1.4, x: x + (Math.random() - .5) * 0.6, y: y + Math.random() * 1.2, z: (Math.random() - .5) * 0.6,
        vx: (Math.random() - .3) * (o.v || 9), vy: Math.random() * (o.v || 9) + 2, vz: (Math.random() - .5) * 8, r: Math.random() * 6, vr: (Math.random() - .5) * 14, s: o.s || 0.12 + Math.random() * 0.2, g: o.g ?? 26 });
      this.mesh.setColorAt(this.i, Math.random() < 0.25 ? new THREE.Color(0xffffff) : c);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.p.forEach(p => p.life = 0); }
  update(dt) {
    for (let k = 0; k < this.n; k++) {
      const p = this.p[k], alive = p.life > 0;
      if (alive) { p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += p.vr * dt; }
      const s = alive ? p.s * Math.min(1, p.life * 2) : 0;
      this.q.setFromEuler(this.e.set(p.r || 0, (p.r || 0) * 0.7, 0)); this.m4.compose(new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0), this.q, new THREE.Vector3(s, s, s)); this.mesh.setMatrixAt(k, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
let smoke = new Smoke(save.set.reduced ? 140 : 360), cubes = new Cubes(160);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), ringMat); ring.visible = false; scene.add(ring);
const ring2Mat = ringMat.clone(); const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), ring2Mat); ring2.visible = false; scene.add(ring2); let ring2T = 0, skyPulse = 0, hitStop = 0;
const skyBase = { top: new THREE.Color(), hor: new THREE.Color() }, tint = new THREE.Color();
// DOM-level instant feedback: a ripple under the finger and a soft colour flash (no WebGL cost)
function tapFx(x, y) { if (!$('hud').classList.contains('on')) return; const d = document.createElement('i'); d.className = 'ripple'; d.style.left = x + 'px'; d.style.top = y + 'px'; $('fx').appendChild(d); setTimeout(() => d.remove(), 420); }
function flash(col, a) { if (save.set.reduced) a *= 0.5; const f = $('flash'); f.style.transition = 'none'; f.style.background = col; f.style.opacity = a; void f.offsetWidth; f.style.transition = 'opacity .28s ease-out'; f.style.opacity = 0; }
let ringT = 0;

// ---------- runner ----------
function makeRunner(ghost) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const m = o => ghost ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }) : mat(o);
  const parts = {};
  const add = (name, w, h, d, x, y, z, color, parent = body) => { const ms = new THREE.Mesh(box, m(color)); ms.scale.set(w, h, d); ms.position.set(x, y, z); ms.castShadow = !ghost; parent.add(ms); parts[name] = ms; return ms; };
  add('board', 1.35, 0.12, 0.5, 0, 0.1, 0, 0xffffff); add('stripe', 1.0, 0.03, 0.52, 0, 0.17, 0, 0xd6246e);
  add('legB', 0.2, 0.55, 0.2, -0.2, 0.45, 0, 0xcfc9cc); add('legF', 0.2, 0.55, 0.2, 0.22, 0.45, 0, 0xcfc9cc);
  add('torso', 0.5, 0.55, 0.38, 0, 0.98, 0, 0xd6246e);
  add('armB', 0.14, 0.45, 0.14, -0.3, 0.98, -0.12, 0xd6246e); add('armF', 0.14, 0.45, 0.14, 0.32, 0.98, 0.12, 0xd6246e);
  add('head', 0.42, 0.4, 0.4, 0.04, 1.48, 0, 0xf4f1f0);
  const hat = new THREE.Group(); hat.position.set(0.04, 1.7, 0); body.add(hat); parts.hat = hat;
  return { g, body, parts, ghost, m };
}
function dressRunner(r) {
  const hat = r.parts.hat; while (hat.children.length) hat.remove(hat.children[0]);
  const hm = id => { const ms = new THREE.Mesh(box, r.m(0xd6246e)); ms.castShadow = !r.ghost; hat.add(ms); return ms; };
  const o = save.look.outfit;
  const a = hm(), b = hm();
  if (o === 'cap') { a.scale.set(0.46, 0.14, 0.44); b.scale.set(0.24, 0.05, 0.36); b.position.set(0.3, -0.05, 0); }
  else if (o === 'beanie') { a.scale.set(0.46, 0.24, 0.44); a.position.y = 0.04; b.scale.set(0.14, 0.14, 0.14); b.position.y = 0.24; }
  else if (o === 'phones') { a.scale.set(0.5, 0.08, 0.12); a.position.y = 0.0; b.scale.set(0.14, 0.24, 0.5); b.position.y = -0.18; }
  else if (o === 'crown') { a.scale.set(0.44, 0.16, 0.42); a.position.y = 0.02; b.scale.set(0.1, 0.3, 0.1); b.position.y = 0.14; }
  else if (o === 'helmet') { a.scale.set(0.52, 0.3, 0.5); a.position.y = -0.04; b.scale.set(0.1, 0.18, 0.44); b.position.set(0.26, -0.12, 0); }
  else if (o === 'halo') { a.scale.set(0.5, 0.04, 0.5); a.position.y = 0.2; b.scale.set(0.04, 0.2, 0.04); b.position.y = 0.08; }
  r.hatParts = [a, b];
  const bd = BOARDS.find(x => x.id === save.look.board) || BOARDS[0];
  if (!r.ghost) { r.parts.board.material = mat(bd.c); r.parts.stripe.material = mat(bd.s); }
}
function paintRunner(r, c) {
  if (r.ghost) return;
  const m = mat(HEX[c], { roughness: 0.55 });
  ['torso', 'armB', 'armF'].forEach(k => r.parts[k].material = m); r.hatParts.forEach(p => p.material = m);
  const bd = BOARDS.find(x => x.id === save.look.board); if (bd.id === 'snow' || bd.id === 'prism') r.parts.stripe.material = m;
}
const runner = makeRunner(false); scene.add(runner.g); dressRunner(runner);
const ghost = makeRunner(true); scene.add(ghost.g); dressRunner(ghost); ghost.g.visible = false;

// ---------- level building ----------
let level = null, lvlGroup = null, dyn = [], gemMeshes = [], boostMeshes = [], backGroup = null, theme = THEMES[0], finishMesh = null;
const gemGeo = new THREE.OctahedronGeometry(0.42, 0), torus = new THREE.TorusGeometry(0.7, 0.12, 8, 24), cone = new THREE.ConeGeometry(0.4, 0.6, 4);
function applyTheme(wi) {
  theme = THEMES[wi]; setThemeMats(theme);
  skyMat.uniforms.top.value.setHex(theme.top); skyMat.uniforms.hor.value.setHex(theme.hor); scene.fog.color.setHex(theme.fog);
  hemi.color.setHex(theme.night ? 0x9c90d0 : 0xffffff); hemi.groundColor.setHex(theme.night ? 0x2a2040 : 0xd8cfc8); hemi.intensity = theme.night ? 1.7 : 1.6;
  sun.color.setHex(theme.sun); applyBright(); skyBase.top.setHex(theme.top); skyBase.hor.setHex(theme.hor); skyBase.ok = true;
  document.documentElement.style.setProperty('--ink', theme.night ? '#ece6ff' : '#4a4350');
}
function buildBackdrop(wi, len) {
  if (backGroup) scene.remove(backGroup);
  backGroup = new THREE.Group(); scene.add(backGroup);
  const th = THEMES[wi]; let seed = wi * 99 + 1; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let x = -60; x < len + 120; x += 7 + R() * 9) {
    const z = -45 - R() * 80, c = th.back[Math.floor(R() * 3)], m = mat(c, { fog: true });
    let ms;
    if (wi === 0) { ms = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + R() * 10, 0), m); ms.scale.y = 0.45; ms.position.set(x, -6, z); }
    else if (wi === 1) { const h = 14 + R() * 26; ms = new THREE.Mesh(new THREE.ConeGeometry(6 + R() * 8, h, 5), m); ms.position.set(x, -8 + h / 2, z); ms.rotation.y = R() * 3; }
    else if (wi === 2) { if (R() < 0.35) { const h = 6 + R() * 10; ms = new THREE.Mesh(new THREE.CylinderGeometry(4 + R() * 4, 6 + R() * 5, h, 6), m); ms.position.set(x, -8 + h / 2, z); } else { ms = new THREE.Mesh(new THREE.SphereGeometry(10 + R() * 8, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), m); ms.scale.y = 0.3; ms.position.set(x, -7, z); } }
    else { const h = 10 + R() * 34, w = 3 + R() * 5; ms = new THREE.Mesh(box, m); ms.scale.set(w, h, w); ms.position.set(x, -8 + h / 2, z);
      if (R() < 0.7) for (let k = 0; k < 4; k++) { const win = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: [0xff4fa0, 0xffd166, 0x5ee6ff][Math.floor(R() * 3)], fog: true })); win.scale.set(w * 0.8, 0.25, 0.1); win.position.set(x, -8 + h * (0.3 + k * 0.17), z + w / 2 + 0.05); backGroup.add(win); } }
    backGroup.add(ms);
  }
  if (wi === 3) for (let k = 0; k < 60; k++) { const s = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); s.scale.setScalar(0.25); s.position.set(-60 + R() * (len + 180), 25 + R() * 40, -120); backGroup.add(s); }
}
function buildLevel(lvl) {
  if (lvlGroup) scene.remove(lvlGroup);
  lvlGroup = new THREE.Group(); scene.add(lvlGroup); dyn = []; gemMeshes = []; boostMeshes = [];
  applyTheme(lvl.world);
  for (const e of lvl.els) {
    if (e.t === 'p') {
      const ms = new THREE.Mesh(box, platMats[e.fp ? e.c : e.c]); ms.scale.set(e.w, e.h, 3); ms.position.set(e.x + e.w / 2, e.y - e.h / 2, 0);
      ms.receiveShadow = true; ms.castShadow = e.h < 3; lvlGroup.add(ms);
      if (e.pad) for (let k = 0; k < 2; k++) { const a = new THREE.Mesh(cone, mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 })); a.scale.set(0.8, 0.6, 0.8); a.position.set(e.x + e.w / 2, e.y + 0.35 + k * 0.45, 0); a.rotation.y = Math.PI / 4; lvlGroup.add(a); e._arrows = (e._arrows || []).concat(a); }
      if (e.ma || e.fp || e.fall || e.pad) dyn.push({ e, ms });
    } else if (e.t === 'w') {
      const ms = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: HEX[e.c], transparent: true, opacity: 0.62, emissive: HEX[e.c], emissiveIntensity: 0.4, depthWrite: false }));
      ms.scale.set(0.18, e.h, 3.1); ms.position.set(e.x, e.y + e.h / 2, 0); lvlGroup.add(ms);
    } else if (e.t === 's') {
      const n = Math.max(1, Math.round(e.w / 0.8));
      for (let k = 0; k < n; k++) { const sp = new THREE.Mesh(cone, mat(0x5f5866)); sp.position.set(e.x + 0.4 + k * 0.8, e.up ? e.y - 0.3 : e.y + 0.3, 0); if (e.up) sp.rotation.z = Math.PI; sp.castShadow = true; lvlGroup.add(sp);
        const sp2 = sp.clone(); sp2.position.z = 0.9; lvlGroup.add(sp2); const sp3 = sp.clone(); sp3.position.z = -0.9; lvlGroup.add(sp3); }
    } else if (e.t === 'e') {
      const ms = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fe8ff, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.3, flatShading: true }));
      ms.position.set(e.x, e.y, 0); ms.castShadow = true; lvlGroup.add(ms); gemMeshes[e.k] = ms;
    } else if (e.t === 'b') {
      const ms = new THREE.Mesh(torus, new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffc94a, emissiveIntensity: 0.7 })); ms.position.set(e.x, e.y, 0); ms.rotation.y = Math.PI / 2; lvlGroup.add(ms); boostMeshes[e.k] = ms;
    } else if (e.t === 'G') {
      const ms = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0xb48cff, emissive: 0x8a5cff, emissiveIntensity: 0.8, transparent: true, opacity: 0.45, depthWrite: false }));
      ms.scale.set(0.3, 12, 3.2); ms.position.set(e.x, e.y + 3.5, 0); lvlGroup.add(ms);
      for (let k = 0; k < 3; k++) { const a = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0xffffff })); a.scale.setScalar(0.7); a.position.set(e.x, e.y + 1 + k * 2, 1.7); a.rotation.z = e.k % 2 ? Math.PI : 0; lvlGroup.add(a); }
    }
  }
  // finish arch
  const f = new THREE.Group(), fy = lvl.els.filter(e => e.t === 'p' && e.x <= lvl.end && e.x + e.w >= lvl.end).map(e => e.y)[0] ?? 0;
  for (const z of [-1.6, 1.6]) { const p = new THREE.Mesh(box, mat(0xffffff)); p.scale.set(0.3, 5, 0.3); p.position.set(0, 2.5, z); p.castShadow = true; f.add(p); }
  for (let k = 0; k < 8; k++) { const t = new THREE.Mesh(box, mat(HEX[1 + (k % lvl.ncol)])); t.scale.set(0.35, 0.6, 3.6 / 8); t.position.set(0, 4.8, -1.6 + 0.225 + k * 0.45); f.add(t); }
  f.position.set(lvl.end, fy, 0); lvlGroup.add(f); finishMesh = f;
  buildBackdrop(lvl.world, lvl.end);
}

// ---------- game state ----------
const MODE = { title: 0, play: 1, dead: 2, finish: 3, replay: 4 };
let mode = MODE.title, S = null, G = null, ghostScript = null, input = { held: false, jp: false, sw: 0 }, script = [], acc = 0, deadT = 0, finT = 0, lastCol = 1, paused = false, timeScale = 1, attract = null, runStats = null;
let shake = 0, camY = 2, camX = 0, lastGrounded = true, squash = 0, emitAcc = 0, replayScript = null, replayIdx = 0, replayHeld = false;

function startLevel(id, opts = {}) {
  level = prepare(LEVELS[id]); buildLevel(level);
  const ls = save.levels[id]; ghostScript = ls && ls.best ? ls.best : null;
  replayScript = opts.replay ? (ghostScript || null) : null;
  showScreen(null); $('hud').classList.add('on'); $('replayTag').classList.toggle('on', !!replayScript);
  restart(true);
  banner(`${level.name}<small>${WORLDS[level.world].name} · ${level.id % 7 + 1} / 7</small>`);
  audio.start(level.world); audio.world = level.world;
  if (id === 0 && !save.tot.runs) { $('hint').classList.add('on'); setTimeout(() => $('hint').classList.remove('on'), 5000); }
}
function restart(first) {
  if (window.__deathAt) { window.__restartMs = performance.now() - window.__deathAt; window.__deathAt = 0; }
  S = newState(level); G = ghostScript && save.set.ghost && !replayScript ? { s: newState(level), i: 0, held: false } : null;
  ghost.g.visible = !!G; script = []; acc = 0; input = { held: input.held, jp: false, sw: 0 }; replayIdx = 0; replayHeld = false;
  mode = replayScript ? MODE.replay : MODE.play; smoke.clear(); lastCol = 1; paintRunner(runner, 1); runner.g.visible = true;
  gemMeshes.forEach(m => m && (m.visible = true)); boostMeshes.forEach(m => m && (m.visible = true));
  camX = S.x; camY = 2; timeScale = 1; save.tot.runs++; setAccent(1); updateHud(true);
}
function setAccent(c) { document.documentElement.style.setProperty('--accent', CSS[c]); }
function scriptInput(sc, st, sim) {
  let jp = false, sw = 0;
  while (sim.i < sc.length && sc[sim.i][0] <= st.step) { const k = sc[sim.i][1]; if (k === 'd') { jp = true; sim.held = true; } else if (k === 'u') sim.held = false; else sw++; sim.i++; }
  return { jp, jh: sim.held, sw };
}
const replaySim = { i: 0, held: false };
function simStep() {
  let inp;
  if (mode === MODE.replay) { if (S.step === 0) { replaySim.i = 0; replaySim.held = false; } inp = scriptInput(replayScript, S, replaySim); }
  else {
    const jh = input.held || input.jp;
    inp = { jp: input.jp, jh, sw: input.sw };
    if (input.jp) script.push([S.step, 'd']);
    for (let k = 0; k < input.sw; k++) script.push([S.step, 's']);
    if (!jh && input.wasHeld) script.push([S.step, 'u']);
    if (input.jp && !input.held) { script.push([S.step + 1, 'u']); input.wasHeld = false; } else input.wasHeld = jh;
    input.jp = false; input.sw = 0;
  }
  const pre = { g: S.grounded, gems: S.gems, boosts: S.boosts, gs: S.gs, jn: S.jumpsN, col: S.col, pad: S.padT, sv: S.saves, vy: S.vy };
  step(S, level, inp);
  if (G && !G.s.dead && !G.s.fin) step(G.s, level, scriptInput(ghostScript, G.s, G));
  // events -> juice
  if (S.col !== pre.col) onSwitch(S.col);
  if (S.jumpsN > pre.jn) { audio.sfxPlay('jump', pre.g ? 0 : 1); if (!pre.g) puff(8, S.col); if (mode !== MODE.replay) save.tot.jumps++; }
  if (S.grounded && !pre.g) { squash = 1; if (pre.vy && Math.abs(pre.vy) > 14) shake = Math.max(shake, 0.15); audio.sfxPlay('land'); cubes.burst(S.x - 0.3, S.y, 0xffffff, save.set.reduced ? 2 : 5, { v: 4, s: 0.06, life: 0.4, g: 20 }); }
  if (S.padT && !pre.pad) { audio.sfxPlay('pad'); puff(14, S.col); }
  if (S.gems !== pre.gems) { const k = Math.log2(S.gems ^ pre.gems); const gm = gemMeshes[k]; if (gm) { gm.visible = false; cubes.burst(gm.position.x, gm.position.y - 0.5, 0x9fe8ff, 18, { v: 6, s: 0.1, g: 6, life: 0.9 }); } audio.sfxPlay('gem'); }
  if (S.boosts !== pre.boosts) { const k = Math.log2(S.boosts ^ pre.boosts); if (boostMeshes[k]) boostMeshes[k].visible = false; audio.sfxPlay('boost'); }
  if (S.saves > (pre.sv || 0) && mode === MODE.play) { banner('<small>close one!</small>'); audio.sfxPlay('star', 0); }
  if (S.gs !== pre.gs) { audio.sfxPlay('grav'); shake = 0.3; }
  if (S.padT > 0) S.padT -= DT;
  if (S.dead) onDeath(); else if (S.fin) onFinish();
}
function onSwitch(c) {
  audio.sfxPlay('switch', c); setAccent(c); paintRunner(runner, c); puff(save.set.reduced ? 6 : 14, c);
  ring.visible = true; ringT = 0; ringMat.color.setHex(HEX[c]); if (mode !== MODE.replay) save.tot.switches++;
  ring2.visible = true; ring2T = 0; ring2Mat.color.setHex(HEX[c]); flash(CSS[c], 0.16); skyPulse = 1; shake = Math.max(shake, 0.12);
  cubes.burst(S.x, S.y + S.gs * 0.7, HEX[c], save.set.reduced ? 4 : 10, { v: 7, s: 0.08, g: 4, life: 0.5 });
}
function puff(n, c) { for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2; smoke.emit(S.x + Math.cos(a) * 0.4, S.y + S.gs * 0.8 + Math.sin(a) * 0.5, (Math.random() - .5), HEX[c], { vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, s: 0.4, gs: 1.6, life: 0.6 + Math.random() * 0.4 }); } }
let deathStreak = {};
function onDeath() {
  window.__deaths = (window.__deaths || []).concat([[level.id, S.cause, +S.x.toFixed(1), +S.y.toFixed(1), S.step]]);
  window.__deathAt = performance.now();
  mode = MODE.dead; deadT = 0; runner.g.visible = false; audio.sfxPlay('shatter'); shake = 0.6; hitStop = 0.06; flash('#ffffff', 0.35);
  const why = { color: 'Match the colour, <b>tap left</b> before you touch it', spike: 'Spikes! <b>Jump</b> over them', crash: '<b>Jump</b> sooner to clear that ledge', fall: 'Hold <b>jump</b> longer, or double-jump' }[S.cause];
  deathStreak = (deathStreak.id === level.id ? deathStreak : { id: level.id, n: 0 }); deathStreak.n++;
  if (why && !replayScript && (deathStreak.n <= 2 || deathStreak.n % 4 === 0)) setTimeout(() => mode === MODE.play && banner('<small>' + why + '</small>'), 280);
  cubes.burst(S.x, S.y - (S.gs < 0 ? 1.4 : 0), HEX[S.col], save.set.reduced ? 26 : 50); cubes.burst(S.x, S.y, 0xffffff, 12);
  if (!replayScript) { save.tot.deaths++; if (save.tot.deaths >= 50) ach('deaths50'); }
}
function onFinish() {
  mode = MODE.finish; finT = 0; audio.sfxPlay('finish');
  for (let k = 0; k < 4; k++) cubes.burst(level.end, S.y + 3, HEX[1 + (k % level.ncol)], 16, { v: 10, s: 0.15, g: 10, life: 2 });
  if (replayScript && !replayScript.__test) return;
  const r = { gems: S.gems, switches: S.switches, time: S.t }, st = starsFor(level, r), ls = lvSave(level.id);
  const first = !ls.done; ls.done = true; ls.gems |= S.gems; ls.stars = ls.stars.map((v, i) => v || st[i]);
  if (ls.bestTime === undefined || r.time < ls.bestTime) { ls.bestTime = r.time; ls.best = (replayScript && replayScript.__test ? replayScript : script).slice(); }
  if (ls.fewestSw === undefined || r.switches < ls.fewestSw) ls.fewestSw = r.switches;
  save.tot.finishes++;
  ach('first'); if (totalGems() >= 10) ach('gems10'); if (st.every(Boolean)) ach('perfect'); if (save.tot.switches >= 500) ach('switch500');
  for (let w = 0; w < 4; w++) if (LEVELS.filter(l => l.world === w).every(l => lvSave(l.id).done)) ach('w' + (w + 1));
  if (totalStars() === 84) ach('all3');
  persist();
  runStats = { r, st, first };
}
function ach(id) { if (save.ach[id]) return; save.ach[id] = Date.now(); const a = ACH.find(x => x.id === id); toast(`${a.i} <b>${a.n}</b> · ${a.d}`); persist(); }
function toast(html) { const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = html; $('toasts').appendChild(d); setTimeout(() => d.remove(), 3100); }
function banner(html) { const b = $('banner'); b.innerHTML = html; b.classList.add('on'); clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.remove('on'), 1800); }

function showResults() {
  const { r, st } = runStats, ls = lvSave(level.id);
  $('rTitle').textContent = level.name + ' clear!';
  $('rStars').innerHTML = st.map((v, i) => v ? `<i style="animation-delay:${0.15 + i * 0.2}s">★</i>` : '★').join('');
  st.forEach((v, i) => v && setTimeout(() => audio.sfxPlay('star', i), 150 + i * 200));
  const g = (ok, label, val) => `<div class="goal ${ok ? 'ok' : ''}"><span>${label}</span><b>${val}</b></div>`;
  $('rGoals').innerHTML = g(st[0], 'Collect all 3 gems', '◆'.repeat(popc(r.gems)) + '◇'.repeat(3 - popc(r.gems))) +
    g(st[1], `Switch colour ${level.par} times or fewer`, r.switches) + g(st[2], `Finish under ${level.target.toFixed(1)}s`, r.time.toFixed(2) + 's') +
    `<div class="goal"><span>Best time</span><b style="color:var(--ink)">${ls.bestTime.toFixed(2)}s</b></div>`;
  $('rNext').style.display = level.id < 27 ? '' : 'none';
  showScreen('results');
}

// ---------- input ----------
function jumpDown() { audio.unlock(); if (mode === MODE.replay) { stopReplay(); return; } if (mode !== MODE.play || paused) return; input.jp = true; input.held = true; }
function jumpUp() { input.held = false; }
function switchTap() { audio.unlock(); if (mode === MODE.replay) { stopReplay(); return; } if (mode !== MODE.play || paused) return; input.sw++; }
function stopReplay() { replayScript = null; $('replayTag').classList.remove('on'); showResultsOrLevels(); }
function showResultsOrLevels() { mode = MODE.title; $('hud').classList.remove('on'); if (runStats) showResults(); else openLevels(level.world); }
const pointers = new Map();
const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); if (!$('hud').classList.contains('on')) { audio.unlock(); return; }
  tapFx(e.clientX, e.clientY); const rc = cv.getBoundingClientRect(); if (e.clientX >= rc.left + rc.width / 2) { pointers.set(e.pointerId, 'j'); jumpDown(); } else { pointers.set(e.pointerId, 's'); switchTap(); }
}, { passive: false });
const pUp = e => { if (pointers.get(e.pointerId) === 'j') { pointers.delete(e.pointerId); if (![...pointers.values()].includes('j')) jumpUp(); } else pointers.delete(e.pointerId); };
cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pUp);
document.addEventListener('touchmove', e => { if (!e.target.closest('.card')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
const JK = ['Space', 'ArrowUp', 'KeyW', 'KeyK', 'ArrowRight', 'KeyL'], SK = ['ArrowLeft', 'KeyA', 'KeyJ', 'ShiftLeft', 'ShiftRight', 'KeyF', 'ArrowDown', 'KeyS'];
addEventListener('keydown', e => {
  if (e.repeat) { if (JK.includes(e.code) || SK.includes(e.code)) e.preventDefault(); return; }
  if (JK.includes(e.code)) { e.preventDefault(); if ($('hud').classList.contains('on')) jumpDown(); else if (e.code === 'Space' && $('title').classList.contains('on')) openLevels(); }
  else if (SK.includes(e.code)) { e.preventDefault(); if ($('hud').classList.contains('on')) switchTap(); }
  else if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === MODE.play) setPause(!paused); }
  else if (e.code === 'KeyR' && mode === MODE.play && !paused) restart();
});
addEventListener('keyup', e => { if (JK.includes(e.code)) jumpUp(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === MODE.play) setPause(true); if (document.hidden) persist(); });

// ---------- UI ----------
function showScreen(id) { ['title', 'levels', 'pause', 'results', 'stats', 'wardrobe', 'settings'].forEach(s => $(s).classList.toggle('on', s === id)); }
const click = f => () => { audio.unlock(); audio.sfxPlay('click'); f(); };
function audioPanel(el) {
  el.innerHTML = `<label class="row"><span>Music</span><input type="checkbox" data-k="musicOn"><input type="range" min="0" max="100" data-k="music"></label>
  <label class="row"><span>Sound effects</span><input type="checkbox" data-k="sfxOn"><input type="range" min="0" max="100" data-k="sfx"></label>
  <label class="row"><span>Brightness</span><input type="range" min="60" max="140" data-k="bright"></label>`;
  el.querySelectorAll('input').forEach(i => {
    const k = i.dataset.k; if (i.type === 'checkbox') i.checked = save.set[k]; else i.value = Math.round(save.set[k] * 100);
    i.addEventListener('input', () => { audio.unlock(); save.set[k] = i.type === 'checkbox' ? i.checked : i.value / 100; if (k === 'bright') applyBright(); else { audio[k] = save.set[k]; audio.apply(); } persist(); syncAudioPanels(); if (k === 'sfx' || k === 'sfxOn') audio.sfxPlay('click'); });
  });
}
function syncAudioPanels() { document.querySelectorAll('.audio input').forEach(i => { const k = i.dataset.k; if (i.type === 'checkbox') i.checked = save.set[k]; else if (document.activeElement !== i) i.value = Math.round(save.set[k] * 100); }); }
document.querySelectorAll('.audio').forEach(audioPanel);
function setPause(p) {
  paused = p; persist(); if (p) { $('optGhost').checked = save.set.ghost; syncAudioPanels(); showScreen('pause'); } else { showScreen(null); input.held = false; }
}
let curWorld = 0;
function openLevels(w = curWorld) {
  mode = MODE.title; $('hud').classList.remove('on'); paused = false; curWorld = Math.max(0, Math.min(3, w)); attractWorld(curWorld);
  const lv = LEVELS.filter(l => l.world === curWorld), ws = lv.reduce((a, l) => a + starCount(l.id), 0);
  $('wName').textContent = `${curWorld + 1}. ${WORLDS[curWorld].name}`; $('wStars').textContent = `★ ${ws} / 21`;
  $('lgrid').innerHTML = lv.map(l => { const s = save.levels[l.id], ul = unlocked(l.id);
    return `<button class="lv ${ul ? '' : 'locked'}" data-id="${l.id}"><div class="n">${ul ? l.id % 7 + 1 : '🔒'}</div><div class="nm">${l.name}</div><div class="st">${[0, 1, 2].map(i => s && s.stars[i] ? '<i>★</i>' : '★').join('')}</div><div class="bt">${s && s.bestTime ? s.bestTime.toFixed(2) + 's' : '&nbsp;'}</div></button>`; }).join('');
  $('lgrid').querySelectorAll('.lv').forEach(b => b.onclick = click(() => { const id = +b.dataset.id; if (unlocked(id)) startLevel(id); else toast('Finish the level before it to unlock'); }));
  showScreen('levels');
}
$('bPlay').onclick = click(() => { const next = LEVELS.find(l => !lvSave(l.id).done && unlocked(l.id)); openLevels(next ? next.world : 0); });
$('bBack1').onclick = click(() => goTitle());
$('wPrev').onclick = click(() => openLevels(curWorld - 1)); $('wNext').onclick = click(() => openLevels(curWorld + 1));
$('bPause').onclick = e => { e.stopPropagation(); audio.sfxPlay('click'); if (mode === MODE.play) setPause(true); else if (mode === MODE.replay) stopReplay(); };
$('pResume').onclick = click(() => setPause(false));
$('pRestart').onclick = click(() => { setPause(false); restart(); });
$('pQuit').onclick = click(() => { setPause(false); runStats = null; openLevels(level.world); });
$('optGhost').onchange = () => { save.set.ghost = $('optGhost').checked; persist(); };
$('optGhost2').onchange = () => { save.set.ghost = $('optGhost2').checked; persist(); };
$('optReduced').onchange = () => { save.set.reduced = $('optReduced').checked; applyQuality(); persist(); };
$('bSettings').onclick = click(() => { $('optReduced').checked = save.set.reduced; $('optGhost2').checked = save.set.ghost; syncAudioPanels(); showScreen('settings'); });
$('sClose').onclick = click(() => goTitle());
$('rRetry').onclick = click(() => { runStats = null; startLevel(level.id); });
$('rWatch').onclick = click(() => startLevel(level.id, { replay: true }));
$('rLevels').onclick = click(() => { runStats = null; openLevels(level.world); });
$('rNext').onclick = click(() => { runStats = null; startLevel(level.id + 1); });
$('bStats').onclick = click(() => { renderStats(); showScreen('stats'); });
$('stClose').onclick = click(() => goTitle());
$('bWardrobe').onclick = click(() => { renderWardrobe(); showScreen('wardrobe'); });
$('wClose').onclick = click(() => goTitle());
function goTitle() { persist(); mode = MODE.title; $('hud').classList.remove('on'); showScreen('title'); $('starTotal').textContent = `★ ${totalStars()} / 84`; attractWorld(0); audio.stop(); }
function renderStats() {
  const t = save.tot, done = LEVELS.filter(l => lvSave(l.id).done).length;
  const fmt = s => s > 3600 ? (s / 3600).toFixed(1) + 'h' : Math.round(s / 60) + 'm';
  const st = [['★ ' + totalStars() + '/84', 'Stars'], [totalGems() + '/84', 'Gems'], [done + '/28', 'Levels cleared'], [t.deaths, 'Shatters'], [t.jumps, 'Jumps'], [t.switches, 'Colour switches'], [fmt(t.play), 'Play time'], [t.finishes, 'Finishes']];
  $('statGrid').innerHTML = st.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('') +
    `<div class="stat" style="grid-column:1/-1;text-align:left"><span>Best times &amp; fewest switches</span><div style="font-size:13px;columns:2;margin-top:6px">${LEVELS.map(l => { const s = save.levels[l.id]; return `<div>${l.world + 1}-${l.id % 7 + 1} ${l.name}: ${s && s.bestTime ? s.bestTime.toFixed(2) + 's · ' + s.fewestSw + ' sw' : '—'}</div>`; }).join('')}</div></div>`;
  $('achList').innerHTML = '<h3>Achievements</h3>' + ACH.map(a => `<div class="ach ${save.ach[a.id] ? 'got' : ''}"><i>${a.i}</i><div><b>${a.n}</b><br><small>${a.d}</small></div></div>`).join('');
}
function renderWardrobe() {
  const ts = totalStars();
  const item = (it, kind, sw) => `<button class="wi ${save.look[kind] === it.id ? 'sel' : ''} ${ts < it.stars ? 'locked' : ''}" data-k="${kind}" data-id="${it.id}" data-s="${it.stars}"><div class="sw" style="background:${sw}"></div>${it.name}<small>${ts < it.stars ? '★ ' + it.stars : 'unlocked'}</small></button>`;
  const hx = n => '#' + n.toString(16).padStart(6, '0');
  $('wOutfit').innerHTML = OUTFITS.map(o => item(o, 'outfit', 'linear-gradient(90deg,#d6246e,#e2a21d)')).join('');
  $('wBoard').innerHTML = BOARDS.map(b => item(b, 'board', `linear-gradient(90deg,${hx(b.c)} 60%,${hx(b.s)} 60%)`)).join('');
  document.querySelectorAll('.wi').forEach(b => b.onclick = click(() => {
    if (ts < +b.dataset.s) { toast(`Collect ${b.dataset.s} stars to unlock`); return; }
    save.look[b.dataset.k] = b.dataset.id; persist(); dressRunner(runner); dressRunner(ghost); paintRunner(runner, lastCol); renderWardrobe();
  }));
}
function applyQuality() {
  renderer.shadowMap.enabled = !save.set.reduced; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  scene.remove(smoke.mesh); smoke = new Smoke(save.set.reduced ? 140 : 360);
  renderer.setPixelRatio(Math.min(save.set.reduced ? 1.5 : 2, devicePixelRatio || 1)); resize();
}

// attract mode on menus: runner rides through an endless course with its smoke trail
function attractWorld(w) {
  const lvl = LEVELS[w * 7]; if (level !== lvl) { level = prepare(lvl); buildLevel(level); }
  S = newState(level); S.col = 1; attract = { t: 0, sw: 3 }; paintRunner(runner, 1); runner.g.visible = true; ghost.g.visible = false; G = null;
}

// ---------- frame ----------
let last = performance.now(), fpsT = 0, frames = 0;
window.__fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  frames++; fpsT += dt; if (fpsT > 1) { window.__fps = frames / fpsT; frames = 0; fpsT = 0; }
  if (!level) return;
  if (mode === MODE.title && S) {
    // attract: hover along, auto-colour, and loop
    const ft = dt * 1.0; attract.t += ft; S.x += 8 * ft; S.y = 0.6 + Math.sin(attract.t * 1.3) * 0.35; S.grounded = false;
    attract.sw -= ft; if (attract.sw < 0) { attract.sw = 3 + Math.random() * 2; S.col = S.col === 1 ? 2 : 1; paintRunner(runner, S.col); setAccent(S.col); puff(10, S.col); ring.visible = true; ringT = 0; ringMat.color.setHex(HEX[S.col]); }
    if (S.x > level.end + 60) S.x = -20;
  } else if (mode === MODE.play || mode === MODE.replay) {
    if (hitStop > 0) hitStop -= dt; else if (!paused) { acc += dt * timeScale; let n = 0; while (acc >= DT && n < 12 && (mode === MODE.play || mode === MODE.replay)) { simStep(); acc -= DT; n++; } if (mode === MODE.play) save.tot.play += dt; }
  } else if (mode === MODE.dead) {
    deadT += dt; if (performance.now() - window.__deathAt > 300 || deadT > 0.3) { if (replayScript) { stopReplay(); } else restart(); }
  } else if (mode === MODE.finish) {
    finT += dt; S.x += speedAt(level, S) * dt * Math.max(0.12, 1 - finT * 2);
    if (finT > 1.6) { mode = MODE.title; if (replayScript && !replayScript.__test) { stopReplay(); } else { $('hud').classList.remove('on'); showResults(); } }
  }
  updateVisuals(dt);
  renderer.render(scene, camera);
}
function updateVisuals(dt) {
  const t = S ? S.t : 0, sim = S;
  // dynamic platforms
  for (const d of dyn) {
    const e = d.e;
    if (e.ma || e.fall) d.ms.position.y = platY(e, t, sim) - e.h / 2;
    if (e.fp) d.ms.material = platMats[colorAt(e, t)];
    if (e._arrows) e._arrows.forEach((a, k) => { a.position.y = e.y + 0.35 + k * 0.45 + Math.sin(performance.now() / 200 + k) * 0.08; });
  }
  gemMeshes.forEach((m, k) => { if (m) { m.rotation.y += dt * 2; m.position.y = level.els.find(e => e.t === 'e' && e.k === k).y + Math.sin(performance.now() / 300 + k) * 0.12; } });
  boostMeshes.forEach(m => m && (m.rotation.x += dt * 3));
  if (finishMesh) finishMesh.rotation.y = 0;
  // runner
  const r = runner.g, gs = sim.gs;
  r.position.set(sim.x, sim.y, 0);
  r.rotation.x = gs < 0 ? Math.PI : 0;
  squash = Math.max(0, squash - dt * 5);
  const air = !sim.grounded && mode !== MODE.title;
  const lean = air ? Math.max(-0.4, Math.min(0.4, sim.vy * gs * 0.02)) : -0.12;
  runner.body.rotation.z = THREE.MathUtils.lerp(runner.body.rotation.z, lean, Math.min(1, dt * 10));
  runner.body.scale.set(1 + squash * 0.25, 1 - squash * 0.3, 1);
  const ph = performance.now() / 120; runner.parts.armB.rotation.z = air ? 1.2 : Math.sin(ph) * 0.3 + 0.5; runner.parts.armF.rotation.z = air ? -1.2 : -Math.sin(ph) * 0.3 - 0.4;
  // ghost
  if (G && ghost.g.visible) { ghost.g.position.set(G.s.x, G.s.y, -0.6); ghost.g.rotation.x = G.s.gs < 0 ? Math.PI : 0; ghost.g.visible = !G.s.fin && !G.s.dead; }
  // smoke trail
  if (runner.g.visible && (mode !== MODE.dead)) {
    emitAcc += dt * (save.set.reduced ? 26 : 62) * (mode === MODE.title ? 0.8 : 1);
    while (emitAcc > 1) { emitAcc--; smoke.emit(sim.x - 0.6 + Math.random() * 0.2, sim.y + gs * (0.15 + Math.random() * 0.3), (Math.random() - .5) * 0.5, HEX[sim.col], { grey: theme.night ? 0x5a5070 : 0x9a949c }); }
  }
  smoke.update(dt); cubes.update(dt);
  if (ring.visible) { ringT += dt; const s = 0.5 + ringT * 9; ring.scale.setScalar(s); ring.position.set(sim.x, sim.y + gs * 0.8, 0.2); ringMat.opacity = Math.max(0, 0.8 - ringT * 2.2); if (ringT > 0.4) ring.visible = false; }
  if (ring2.visible) { ring2T += dt; const e = 1 - Math.pow(1 - Math.min(1, ring2T / 0.5), 3); ring2.scale.setScalar(0.6 + e * 7); ring2.position.set(sim.x, sim.y + gs * 0.8, 0.1); ring2Mat.opacity = Math.max(0, 0.65 * (1 - ring2T / 0.5)); if (ring2T > 0.5) ring2.visible = false; }
  if (skyBase.ok) { skyPulse = Math.max(0, skyPulse - dt * 1.6); tint.setHex(HEX[sim.col] || 0xffffff); const k = theme.night ? 0.16 : 0.1 + skyPulse * 0.08;
    skyMat.uniforms.hor.value.copy(skyBase.hor).lerp(tint, k); skyMat.uniforms.top.value.copy(skyBase.top).lerp(tint, k * 0.5); }
  // camera
  const spd = mode === MODE.title ? 8 : speedAt(level, sim);
  camX = sim.x; camY += ((sim.y + (gs < 0 ? -2.5 : 1.2)) - camY) * Math.min(1, dt * 3);
  const portrait = innerHeight > innerWidth, dist = (portrait ? 36 : 25 * Math.pow(Math.max(1, 2 / camera.aspect), 0.6)) + (spd - 9) * 0.6 - (mode === MODE.finish ? Math.min(3, finT * 4) : 0);
  shake = Math.max(0, shake - dt * 1.5); const sx = (Math.random() - .5) * shake * 0.6, sy = (Math.random() - .5) * shake * 0.6;
  camera.position.set(camX + 5 + sx, camY + 5.5 + sy, dist); camera.lookAt(camX + 7.5, camY + 0.6, 0);
  sky.position.copy(camera.position);
  sun.position.set(sim.x - 8, sim.y + 18, 14); sun.target.position.set(sim.x + 4, sim.y, 0);
  if (mode === MODE.play || mode === MODE.replay) updateHud();
}
let hudLast = '';
function updateHud(force) {
  const s = `${S.t.toFixed(1)}|${S.gems}|${S.switches}`; if (s === hudLast && !force) return; hudLast = s;
  $('hTime').textContent = S.t.toFixed(1) + 's'; $('hGems').textContent = [0, 1, 2].map(k => S.gems & (1 << k) ? '◆' : '◇').join('');
  $('hSw').textContent = `⇄ ${S.switches}/${level.par}`;
}

// ---------- boot ----------
function hideLoading() { const l = $('loading'); l.style.opacity = 0; setTimeout(() => l.style.display = 'none', 400); }
attractWorld(0); goTitle();
window.__booted = true; hideLoading(); setTimeout(hideLoading, 3000);
requestAnimationFrame(frame);
addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/[?&]nosw/.test(location.search)) navigator.serviceWorker.register('sw.js').catch(() => {});
// test hooks
window.HD = {
  get state() { return S && { x: S.x, y: S.y, col: S.col, dead: S.dead, fin: S.fin, t: S.t, gems: S.gems, jumpsN: S.jumpsN, switches: S.switches, grounded: S.grounded }; },
  get mode() { return Object.keys(MODE).find(k => MODE[k] === mode); }, save: () => save, levels: LEVELS, startLevel, audio, setTimeScale: v => timeScale = v, openLevels,
  playScript(id, sc) { startLevel(id); replayScript = sc; mode = MODE.replay; restart(); $('replayTag').classList.remove('on'); replayScript.__test = true; },
};
