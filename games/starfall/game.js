/* STARFALL — Minesweeper on the surface of a Goldberg-polyhedron planet.
 * Rendering: three.js (vendored), one merged mesh for every tile (single draw call, per-cell state in a
 * float DataTexture read in the vertex + fragment shader), instanced meshes for beacons, mines and frost shards,
 * a baked per-world surface texture (equirect) for terrain, clouds, bands and city lights, UnrealBloomPass at
 * reduced resolution on mobile. Logic lives in logic.js (window.StarfallLogic), audio in audio.js.
 */
import * as THREE from 'three';
import { EffectComposer } from './vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/postprocessing/OutputPass.js';
import { Sfx } from './audio.js?v=20261009a';

const L = window.StarfallLogic;
/* Build guard: index.html, logic.js and game.js must come from the same release. A mixed set (e.g. an old cached
   page with new scripts during an update) used to crash on a missing element and leave the spinner up forever. */
const BUILD = '20261009a';   // keep in sync with sw.js VERSION, <html data-build>, logic.js BUILD and the ?v= strings
function bootFatal(msg, autoHeal) {
  if (window.__starfallFatal) { window.__starfallFatal(msg, autoHeal); return; }
  // very old page without the boot watchdog: heal once by itself (unregister SW, drop caches, reload), then offer a tap
  const heal = () => {
    const jobs = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))));
    if (window.caches) jobs.push(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('starfall-') === 0).map(k => caches.delete(k)))));
    const go = () => location.reload();
    Promise.all(jobs).then(go, go); setTimeout(go, 3000);
  };
  let tried = true;
  try { tried = !!sessionStorage.getItem('starfall.healed'); sessionStorage.setItem('starfall.healed', '1'); } catch (e) { /* no storage */ }
  if (!tried) { heal(); return; }
  const b = document.createElement('button'); b.id = 'booterr'; b.type = 'button'; b.textContent = 'Starfall didn\u2019t start. Tap to reload';
  b.style.cssText = 'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);z-index:1000;padding:14px 22px;border-radius:16px;background:#101630;border:1px solid #5fe3ff;color:#e8f4ff;font:600 16px system-ui,sans-serif';
  b.addEventListener('click', heal); document.body.appendChild(b);
}
if (!L || L.BUILD !== BUILD || document.documentElement.dataset.build !== BUILD) {
  const msg = `Version mismatch (page ${document.documentElement.dataset.build || 'old'}, logic ${(L && L.BUILD) || 'old'}, game ${BUILD})`;
  bootFatal(msg, true);
  throw new Error(msg);
}
const { buildGoldberg, Game, DIFFICULTIES, ACHIEVEMENTS } = L;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const SEED = params.has('seed') ? parseInt(params.get('seed'), 10) : null;
const DATE_OVERRIDE = DEBUG && /^\d{4}-\d\d-\d\d$/.test(params.get('date') || '') ? params.get('date') : null;
const $ = id => document.getElementById(id);

const IS_MOBILE = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const MIN_CELL_PX = IS_MOBILE ? 34 : 22;      // auto-zoom so cells are never smaller than a fingertip target
const todayKey = () => DATE_OVERRIDE || L.dateKey();

/* ---------------------------------------------------------------- settings + stats (localStorage) */
const SETTINGS_KEY = 'starfall.settings.v1', STATS_KEY = 'starfall.stats.v2';
const DEFAULT_SETTINGS = {
  muteAll: false, musicOn: true, musicVol: 0.6, sfxOn: true, sfxVol: 0.8, haptics: true, noGuess: true,
  colorBlind: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, longPress: 350,
};
function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
const savedSettings = loadJSON(SETTINGS_KEY) || {};
const settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
/* audio settings: migrate the old single 'sound' switch + 'music' volume (and the older 'starfall.muted' key), and never
   let a bad stored value (NaN, string, out of range) reach the audio graph */
(function migrateAudioSettings() {
  const vol = (v, d) => (typeof v === 'number' && Number.isFinite(v)) ? Math.max(0, Math.min(1, v)) : d;
  if (!('muteAll' in savedSettings)) {
    if ('sound' in savedSettings) settings.muteAll = savedSettings.sound === false;
    else settings.muteAll = localStorage.getItem('starfall.muted') === '1';
  }
  if (!('musicVol' in savedSettings) && 'music' in savedSettings) {
    const m = vol(savedSettings.music, 0.45);
    // old 45% default == new 60% (same loudness); an old 0 becomes "music off" with the slider at the default
    if (m <= 0) { settings.musicOn = false; settings.musicVol = DEFAULT_SETTINGS.musicVol; } else settings.musicVol = Math.min(1, Math.round(m / 0.75 * 100) / 100);
  }
  delete settings.sound; delete settings.music;
  settings.musicVol = vol(settings.musicVol, DEFAULT_SETTINGS.musicVol); settings.sfxVol = vol(settings.sfxVol, DEFAULT_SETTINGS.sfxVol);
  for (const k of ['muteAll', 'musicOn', 'sfxOn']) settings[k] = !!settings[k];
  try { saveSettings(); localStorage.removeItem('starfall.muted'); } catch (e) { /* private mode */ }
})();
function loadStats() {
  let s = loadJSON(STATS_KEY);
  if (!s) { // migrate v1 best times
    s = L.emptyStats(); const old = loadJSON('starfall.best.v1') || {};
    for (const k of L.WORLD_KEYS) if (typeof old[k] === 'number') s.worlds[k].best = old[k];
  }
  return L.normalizeStats(s);
}
let stats = loadStats();
function saveStats() { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); }
// ?debug&lp=<ms> lengthens the hold only for slow headless test runs
const longPressMs = () => (DEBUG && params.get('lp')) ? Math.max(settings.longPress, parseInt(params.get('lp'), 10) || 350) : settings.longPress;
const motionOn = () => !settings.reducedMotion;
function buzz(pattern) { if (settings.haptics && navigator.vibrate) try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }

/* ---------------------------------------------------------------- worlds */
const WORLDS = {
  moon: {
    id: 0, name: 'Moon', flavor: 'Frozen moon', rim: [0.55, 0.80, 1.0], seam: [0.25, 0.50, 1.0], atmo: [0.50, 0.75, 1.0], atmoGain: 0.55,
    sky: [0.85, 0.95, 1.2], city: [0.45, 0.95, 1.3], debrisA: [2.2, 2.6, 3.0], debrisB: [0.3, 0.6, 1.0], sunset: 0.0,
    dot: '#9cd6ff', shards: true, ring: 'ice', moonlet: false, clouds: false,
  },
  planet: {
    id: 1, name: 'Planet', flavor: 'Ocean world', rim: [0.22, 0.85, 1.0], seam: [0.05, 0.65, 0.9], atmo: [0.28, 0.62, 1.0], atmoGain: 1.1,
    sky: [0.9, 1.0, 1.1], city: [1.5, 0.85, 0.35], debrisA: [1.6, 1.5, 0.9], debrisB: [0.2, 0.7, 0.4], sunset: 1.0,
    dot: '#3ff0d8', shards: false, ring: null, moonlet: true, clouds: true,
  },
  giant: {
    id: 2, name: 'Gas Giant', flavor: 'Storm giant', rim: [1.0, 0.62, 0.35], seam: [0.9, 0.40, 0.25], atmo: [1.0, 0.62, 0.32], atmoGain: 0.9,
    sky: [1.15, 0.92, 1.05], city: [1.3, 0.55, 1.4], debrisA: [2.6, 1.6, 0.7], debrisB: [0.9, 0.25, 0.5], sunset: 0.4,
    dot: '#ff9a4a', shards: false, ring: 'giant', moonlet: true, clouds: false,
  },
};
const NUM_COLORS = ['#ffffff', '#5fd8ff', '#6dff8e', '#ffd84a', '#ff9440', '#ff4fae', '#c08bff'];
// colour-blind friendly: distinct in hue *and* brightness; digits also get pips in this mode
const NUM_COLORS_CB = ['#ffffff', '#56b4ff', '#f5e94a', '#ff7a2e', '#ee90dc', '#ffffff', '#20d6aa'];
const numColors = () => settings.colorBlind ? NUM_COLORS_CB : NUM_COLORS;
// sun direction in *view* space: the terminator always crosses the right side of the disc
const SUN_V = new THREE.Vector3(-0.82, 0.36, 0.45).normalize();

/* ---------------------------------------------------------------- renderer */
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE || DPR < 2, powerPreference: 'high-performance', alpha: false });
  if (!renderer.capabilities.isWebGL2) throw new Error('webgl2');
} catch (e) {
  $('nogl').classList.remove('hidden'); $('loading').classList.add('out');
  if (window.__starfallBooted) window.__starfallBooted();   // the "needs WebGL 2" message is the final state, not a hang
  throw e;
}
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x020309, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400);
scene.add(camera);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2); keyLight.position.copy(SUN_V).multiplyScalar(5); camera.add(keyLight);
scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x201030, 0.8));

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.45, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const BLOOM_SCALE = IS_MOBILE ? 0.5 : 1.0;

/* ---------------------------------------------------------------- GLSL helpers */
const NOISE_GLSL = /* glsl */`
float hash31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x), mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x), mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
`;
const EQ_GLSL = /* glsl */`
vec2 eqUV(vec3 d){ return vec2(atan(d.x, d.z) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5); }
vec3 rotAxis(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0 - c); }
`;

function renderToTexture(W, H, fragmentShader, uniforms = {}) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping });
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader, depthTest: false, depthWrite: false,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const s = new THREE.Scene(); s.add(q);
  renderer.setRenderTarget(rt); renderer.render(s, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)); renderer.setRenderTarget(null);
  mat.dispose(); q.geometry.dispose();
  rt.texture.wrapS = THREE.RepeatWrapping;
  return rt;
}

/* ---------------------------------------------------------------- backdrop: nebula + stars */
function makeNebulaTexture() {
  const W = IS_MOBILE ? 1024 : 2048, H = W / 2;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, generateMipmaps: false });
  const mat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: NOISE_GLSL + /* glsl */`
      varying vec2 vUv;
      void main(){
        float lon = vUv.x * 6.2831853; float lat = (vUv.y - 0.5) * 3.14159265;
        vec3 d = vec3(cos(lat)*sin(lon), sin(lat), cos(lat)*cos(lon));
        vec3 q = d*1.6;
        vec3 w = vec3(fbm(q + 3.1), fbm(q + 7.7), fbm(q + 1.3));
        float n = fbm(q*1.3 + w*1.8);
        float m = fbm(q*2.7 - w*1.2 + 5.0);
        float band = exp(-pow(dot(d, normalize(vec3(0.3, 1.0, 0.2))) * 2.6, 2.0));
        float dens = smoothstep(0.35, 0.85, n) * (0.35 + 0.9*band);
        vec3 c1 = vec3(0.10, 0.03, 0.22), c2 = vec3(0.02, 0.16, 0.30), c3 = vec3(0.45, 0.08, 0.30), c4 = vec3(0.05, 0.35, 0.40);
        vec3 col = mix(c1, c2, smoothstep(0.3, 0.7, w.x));
        col = mix(col, c3, smoothstep(0.55, 0.8, m) * 0.8);
        col = mix(col, c4, smoothstep(0.6, 0.9, w.y) * 0.5);
        col *= dens * 1.25;
        float dust = smoothstep(0.5, 0.75, fbm(q*4.0 + w*3.0));
        col *= 1.0 - 0.65*dust*band;
        col += vec3(0.6, 0.7, 1.0) * pow(band, 6.0) * 0.06 * n;
        gl_FragColor = vec4(col * 0.75, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const s = new THREE.Scene(); s.add(q);
  renderer.setRenderTarget(rt); renderer.render(s, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)); renderer.setRenderTarget(null);
  mat.dispose(); q.geometry.dispose();
  return rt.texture;
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 32),
  new THREE.MeshBasicMaterial({ map: makeNebulaTexture(), side: THREE.BackSide, depthWrite: false }));
scene.add(sky);

function makeStars(count) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), dat = new Float32Array(count * 2);
  const tints = [[1, 1, 1], [0.7, 0.85, 1.0], [1.0, 0.85, 0.65], [0.85, 0.75, 1.0]];
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([r * Math.cos(th) * 120, u * 120, r * Math.sin(th) * 120], i * 3);
    const t = tints[(Math.random() * tints.length) | 0];
    const b = Math.pow(Math.random(), 6) * 3.0 + 0.25;
    col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
    dat[i * 2] = 0.8 + Math.pow(Math.random(), 4) * 3.2; dat[i * 2 + 1] = Math.random() * 100;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aData', new THREE.BufferAttribute(dat, 2));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: DPR } },
    vertexShader: /* glsl */`
      attribute vec3 color; attribute vec2 aData; uniform float uTime; uniform float uPx; varying vec3 vC;
      void main(){ float tw = 0.75 + 0.25*sin(uTime*(0.6+fract(aData.y)*2.0) + aData.y);
        vC = color * tw; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aData.x * uPx; }`,
    fragmentShader: /* glsl */`varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vC * a * a, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  return new THREE.Points(g, m);
}
const stars = makeStars(IS_MOBILE ? 2600 : 4200);
scene.add(stars);

/* ---------------------------------------------------------------- per-world surface texture (baked once per world)
 * Equirect RGBA. moon: r craters, g ice cracks, b base lights, a frost.  planet: r land height, g sea depth,
 * b city lights, a clouds.  giant: r band value, g turbulence, b floating-city lights, a storm detail.
 */
const VORONOI_GLSL = /* glsl */`
vec3 hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
// x: distance to nearest feature point, y: hash of that cell
vec2 voro(vec3 x){ vec3 i = floor(x), f = fract(x); float d = 9.0, id = 0.0;
  for (int a=-1;a<=1;a++) for (int b=-1;b<=1;b++) for (int c=-1;c<=1;c++){
    vec3 g = vec3(float(a), float(b), float(c)); vec3 h = hash33(i + g); vec3 r = g + h - f; float dd = dot(r, r);
    if (dd < d) { d = dd; id = h.x; } }
  return vec2(sqrt(d), id); }
`;
const WORLD_BAKE = {
  moon: /* glsl */`
    float crater(vec3 p){ vec2 v = voro(p); float f = v.x / (0.35 + 0.5 * v.y);
      float bowl = smoothstep(0.0, 0.42, f); float rim = exp(-pow((f - 0.45) / 0.08, 2.0)); return (bowl - 1.0) * 0.6 + rim * 0.5; }
    vec4 world(vec3 d){
      float base = fbm(d * 3.0);
      float cr = crater(d * 5.0) * 0.6 + crater(d * 11.0 + 3.0) * 0.4 + crater(d * 23.0 + 7.0) * 0.25;
      float h = clamp(0.45 + 0.5 * (base - 0.5) + 0.35 * cr, 0.0, 1.0);
      vec3 w = vec3(fbm(d * 4.0 + 1.0), fbm(d * 4.0 + 5.0), 0.0);
      float c1 = 1.0 - smoothstep(0.0, 0.035, abs(fbm(d * 5.0 + w * 2.0) - 0.5));
      float c2 = 1.0 - smoothstep(0.0, 0.025, abs(fbm(d * 13.0 + w * 3.0 + 9.0) - 0.5));
      float crack = max(c1, c2 * 0.7);
      vec2 v = voro(d * 46.0); float lights = smoothstep(0.10, 0.0, v.x) * step(0.82, v.y) * smoothstep(0.45, 0.6, fbm(d * 3.0 + 11.0));
      float frost = fbm(d * 9.0 + w);
      return vec4(h, crack, lights, frost);
    }`,
  planet: /* glsl */`
    vec4 world(vec3 d){
      vec3 w = vec3(fbm(d * 1.6 + 2.0), fbm(d * 1.6 + 8.0), fbm(d * 1.6 + 4.0));
      float h = fbm(d * 1.7 + w * 1.6);
      h = clamp((h - 0.32) * 2.1, 0.0, 1.0);
      float depth = fbm(d * 4.0 + w);
      float pop = smoothstep(0.45, 0.62, fbm(d * 2.6 + 21.0)) * smoothstep(0.45, 0.6, h);
      vec2 v = voro(d * 70.0); float lights = smoothstep(0.16, 0.0, v.x) * step(0.45, v.y) * pop;
      vec2 v2 = voro(d * 150.0 + 3.0); lights = max(lights, smoothstep(0.14, 0.0, v2.x) * step(0.3, v2.y) * pop * 0.7);
      vec3 cw = vec3(fbm(d * 2.0 + 30.0), fbm(d * 2.0 + 40.0), 0.0) * 2.0;
      float cl = fbm(vec3(d.x * 2.6, d.y * 6.5, d.z * 2.6) + vec3(cw.xy, 0.0));
      cl = cl * 0.75 + 0.25 * fbm(d * 9.0 + cw);
      return vec4(h, depth, lights, cl);
    }`,
  giant: /* glsl */`
    vec4 world(vec3 d){
      float warp = fbm(vec3(d.x * 2.5, d.y * 9.0, d.z * 2.5)) - 0.5;
      float y = d.y + 0.07 * warp;
      float bands = 0.5 + 0.5 * sin(y * 19.0 + 1.8 * sin(y * 6.0) + 0.6);
      float fine = fbm(vec3(y * 48.0, d.x * 1.5, d.z * 1.5));
      float b = clamp(mix(bands, fine, 0.32) + 0.1 * (fbm(d * 6.0) - 0.5), 0.0, 1.0);
      float turb = fbm(vec3(d.x * 7.0, d.y * 30.0, d.z * 7.0) + warp * 4.0);
      vec2 v = voro(d * 40.0); float lights = smoothstep(0.08, 0.0, v.x) * step(0.8, v.y);
      return vec4(b, turb, lights, fbm(d * 12.0));
    }`,
};
const worldTex = {};
function getWorldTexture(key) {
  if (worldTex[key]) return worldTex[key];
  const W = IS_MOBILE ? 1024 : 2048;
  const rt = renderToTexture(W, W / 2, NOISE_GLSL + VORONOI_GLSL + WORLD_BAKE[key] + /* glsl */`
    varying vec2 vUv;
    void main(){ float lon = (vUv.x - 0.5) * 6.2831853; float lat = (vUv.y - 0.5) * 3.14159265;
      vec3 d = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
      gl_FragColor = world(d); }`);
  worldTex[key] = rt.texture;
  return rt.texture;
}

/* ---------------------------------------------------------------- digit atlas (rebuilt for the colour-blind palette) */
function drawDigitAtlas(c, colors, pips) {
  const S = 128; c.width = S * 8; c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 6; i++) {
    const x = i * S + S / 2, y = S / 2 + S * 0.03;
    // soft dark chip behind the digit so it reads on any terrain
    const rg = g.createRadialGradient(x, S / 2, S * 0.05, x, S / 2, S * 0.5);
    rg.addColorStop(0, 'rgba(2,4,10,0.72)'); rg.addColorStop(0.62, 'rgba(2,4,10,0.5)'); rg.addColorStop(1, 'rgba(2,4,10,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, S / 2, S * 0.5, 0, Math.PI * 2); g.fill();
    g.font = `800 ${S * (pips ? 0.70 : 0.80)}px ui-rounded, "SF Pro Rounded", -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    const yy = pips ? y - S * 0.07 : y;
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = S * 0.13; g.strokeText(String(i), x, yy);
    g.shadowColor = colors[i]; g.shadowBlur = S * 0.16;
    g.fillStyle = colors[i]; g.fillText(String(i), x, yy);
    g.shadowBlur = 0;
    const lg = g.createLinearGradient(0, yy - S * 0.35, 0, yy + S * 0.35);
    lg.addColorStop(0, 'rgba(255,255,255,0.55)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.12)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillText(String(i), x, yy);
    if (pips) { // dot count under the digit: a shape cue that doesn't rely on colour
      const r = S * 0.045, gap = S * 0.115, y0 = S * 0.86;
      for (let k = 0; k < i; k++) { g.beginPath(); g.arc(x + (k - (i - 1) / 2) * gap, y0, r, 0, Math.PI * 2); g.fillStyle = colors[i]; g.fill(); }
    }
  }
}
const digitCanvas = document.createElement('canvas');
drawDigitAtlas(digitCanvas, numColors(), settings.colorBlind);
const digitAtlas = new THREE.CanvasTexture(digitCanvas);
digitAtlas.colorSpace = THREE.SRGBColorSpace; digitAtlas.anisotropy = 4;
digitAtlas.minFilter = THREE.LinearMipmapLinearFilter; digitAtlas.generateMipmaps = true;

/* ---------------------------------------------------------------- tile shaders */
const STATE_GLSL = /* glsl */`
uniform sampler2D uState; uniform vec2 uStateSize;
vec4 cellState(float i){ vec2 uv = (vec2(mod(i, uStateSize.x), floor(i/uStateSize.x)) + 0.5) / uStateSize; return texture2D(uState, uv); }
`;
const TILE_VS = STATE_GLSL + /* glsl */`
attribute vec4 aCenter;  // xyz unit centre, w = cell index
attribute vec4 aRole;    // x moves-with-top, y edge factor (1 centre .. 0 rim), z top face, w cell radius
uniform float uTime; uniform vec3 uUp;
uniform vec4 uShock; uniform vec4 uWin; uniform vec4 uPulse; uniform float uHover; uniform float uPress; uniform float uPressAmt; uniform float uMotion;
varying vec3 vN; varying vec3 vView; varying vec3 vObj; varying vec3 vSph; varying vec4 vState; varying vec4 vRole;
varying vec2 vLocal; varying vec2 vCrack; varying float vShock; varying float vAfter; varying float vWin; varying float vWinCrest;
varying float vReveal; varying float vHash; varying float vSel; varying float vMine; varying float vFlipShade; varying float vPulse;
float h1(float n){ return fract(sin(n*12.9898)*43758.5453); }
void main(){
  float idx = aCenter.w; vec3 C = aCenter.xyz;
  vec4 st = cellState(idx); vState = st; vRole = aRole; vHash = h1(idx + 0.37);
  float r = length(position); vec3 dir = position / r;
  float isRev = step(0.5, st.x) * step(st.x, 1.5);
  float dur = mix(0.35, 0.5, uMotion);
  float rp = isRev * clamp((uTime - st.z) / dur, 0.0, 1.0);
  vReveal = rp;
  float flipping = uMotion * isRev * step(rp, 0.999);
  float sq = mix(1.0, abs(cos(rp * 3.14159265)), flipping);
  vFlipShade = mix(1.0, 0.45 + 0.55 * sq, flipping);
  float e = uMotion > 0.5 ? isRev * smoothstep(0.4, 1.0, rp) : isRev * (1.0 - pow(1.0 - rp, 3.0));
  float target = 0.990 + (r - 1.02) * 0.25;
  float h = mix(r, target, e * aRole.x);
  float sel = (abs(idx - uHover) < 0.5 ? 1.0 : 0.0);
  float prs = (abs(idx - uPress) < 0.5 ? uPressAmt : 0.0);
  vSel = max(sel * 0.6, prs);
  h += aRole.x * (1.0 - isRev) * (sel * 0.004 + prs * 0.014);
  float mineT = st.x > 2.5 && st.x < 4.5 ? clamp((uTime - st.w) / 0.5, 0.0, 1.0) : 0.0;
  vMine = mineT;
  h += aRole.x * mineT * 0.012;
  float ang = acos(clamp(dot(C, uShock.xyz), -1.0, 1.0));
  float front = (uTime - uShock.w) * 2.3;
  float on = uShock.w > 0.0 && uTime > uShock.w ? 1.0 : 0.0;
  float sw = on * exp(-pow((ang - front) / 0.17, 2.0)) * smoothstep(3.9, 3.0, front);
  vShock = sw; vAfter = on * smoothstep(0.0, 0.35, front - ang);
  h += sw * 0.055 * uMotion;
  float pang = acos(clamp(dot(C, uPulse.xyz), -1.0, 1.0));
  float pfront = (uTime - uPulse.w) * 1.4;
  float pon = uPulse.w > 0.0 && uTime > uPulse.w ? 1.0 : 0.0;
  vPulse = pon * exp(-pow((pang - pfront) / 0.09, 2.0)) * smoothstep(1.0, 0.25, pfront);
  h += vPulse * 0.02 * aRole.x * uMotion;
  float wang = acos(clamp(dot(C, uWin.xyz), -1.0, 1.0));
  float wfront = (uTime - uWin.w) * 1.7;
  float won = uWin.w > 0.0 && uTime > uWin.w ? 1.0 : 0.0;
  vWinCrest = won * exp(-pow((wang - wfront) / 0.22, 2.0));
  vWin = won * smoothstep(0.0, 0.5, wfront - wang);
  h += vWinCrest * 0.035 * aRole.x * uMotion;
  vec3 p = dir * h;
  vec3 t1 = normalize(cross(C, abs(C.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))); vec3 t2 = cross(C, t1);
  if (flipping > 0.5) {
    // reveal flip: the tile pops out of its socket and turns over across a random axis;
    // the fragment shader swaps to the revealed face at the midpoint
    float fa = vHash * 6.2831853; vec3 ax = t1 * cos(fa) + t2 * sin(fa);
    p += C * sin(rp * 3.14159265) * aRole.w * 0.55;
    vec3 dd = p - C * dot(p, C);
    p -= ax * dot(dd, ax) * (1.0 - sq);
  }
  vec3 up = uUp - dot(uUp, C) * C; float ul = length(up);
  up = ul > 1e-3 ? up / ul : normalize(cross(C, vec3(1.0, 0.0, 0.0)));
  vec3 rt = cross(up, C);
  vec3 d = position - C * dot(position, C);
  vLocal = vec2(dot(d, rt), dot(d, up)) / (aRole.w * 0.60);
  vCrack = vec2(dot(d, t1), dot(d, t2)) / aRole.w;
  vObj = p;
  vSph = normalize(normalMatrix * dir);
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const TILE_FS = NOISE_GLSL + EQ_GLSL + /* glsl */`
uniform sampler2D uDigits; uniform sampler2D uWorldTex; uniform float uTime; uniform float uWorld;
uniform vec3 uRim; uniform vec3 uCity; uniform vec3 uSunV; uniform vec3 uNum[7];
uniform float uScan; uniform float uLose; uniform float uMotion; uniform float uCalm;
varying vec3 vN; varying vec3 vView; varying vec3 vObj; varying vec3 vSph; varying vec4 vState; varying vec4 vRole;
varying vec2 vLocal; varying vec2 vCrack; varying float vShock; varying float vAfter; varying float vWin; varying float vWinCrest;
varying float vReveal; varying float vHash; varying float vSel; varying float vMine; varying float vFlipShade; varying float vPulse;
float gStorm;
vec4 worldSample(vec3 d){
  gStorm = 0.0;
  if (uWorld > 1.5) {
    // gas giant: a swirling storm vortex + zonal winds (each latitude drifts at its own speed)
    vec3 S = normalize(vec3(0.62, -0.30, 0.72));
    float ds = 1.0 - dot(d, S);
    gStorm = exp(-ds * 55.0);
    d = rotAxis(d, S, exp(-ds * 26.0) * (2.4 + 1.1 * sin(uTime * 0.13 * uMotion)));
    vec2 uv = eqUV(d);
    uv.x += uTime * uMotion * (0.0025 + 0.0035 * sin(uv.y * 31.0));
    return texture2D(uWorldTex, uv);
  }
  return texture2D(uWorldTex, eqUV(d));
}
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(-vView);
  vec3 Ls = uSunV; vec3 H = normalize(Ls + V);
  float ndl = max(dot(N, Ls), 0.0); float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 3.0);
  float dayF = smoothstep(-0.12, 0.30, dot(normalize(vSph), Ls));
  float light = mix(0.24, 1.0, dayF) * (0.50 + 0.70 * ndl);
  float state = vState.x; float num = floor(vState.y + 0.5);
  float top = step(0.5, vRole.z);
  vec4 w = worldSample(normalize(vObj));
  float edge = 1.0 - smoothstep(0.0, 0.10, vRole.y);
  vec3 R = reflect(-V, N);
  vec3 env = mix(vec3(0.05, 0.015, 0.09), vec3(0.04, 0.16, 0.24), smoothstep(-0.4, 0.9, R.y));
  float spec = pow(max(dot(N, H), 0.0), 90.0);
  float isRevState = (state > 0.5 && state < 1.5) ? 1.0 : 0.0;
  float revMix = isRevState * (uMotion > 0.5 ? step(0.5, vReveal) : smoothstep(0.2, 0.8, vReveal));

  vec3 hid = vec3(0.0);
  if (revMix < 0.999) {
    float specAmt, sparkleAmt;
    if (uWorld < 0.5) {            // frozen moon: frosted ice plates with dark cracks
      vec3 ice = mix(vec3(0.16, 0.25, 0.38), vec3(0.40, 0.54, 0.70), w.a);
      ice = mix(ice, vec3(0.015, 0.04, 0.10), w.g * 0.8);
      hid = ice * light + vec3(0.35, 0.75, 1.0) * w.g * 0.06 * (0.3 + dayF);
      specAmt = 1.0; sparkleAmt = 2.6;
    } else if (uWorld < 1.5) {     // ocean world: deep glassy water with a moving shimmer and sun glint
      float sh = vnoise(vObj * 34.0 + vec3(0.0, uTime * 0.45, uTime * 0.3) * uMotion);
      vec3 sea = mix(vec3(0.003, 0.018, 0.06), vec3(0.008, 0.075, 0.16), w.g);
      sea += vec3(0.03, 0.20, 0.24) * pow(sh, 3.0) * 0.45;
      hid = sea * light + vec3(1.0, 0.85, 0.6) * pow(max(dot(N, H), 0.0), 28.0) * 0.14 * dayF;
      specAmt = 1.3; sparkleAmt = 0.5;
    } else {                       // gas giant: flowing cloud bands and a red storm
      vec3 c = mix(vec3(0.13, 0.055, 0.035), vec3(0.42, 0.22, 0.09), smoothstep(0.15, 0.48, w.r));
      c = mix(c, vec3(0.52, 0.43, 0.31), smoothstep(0.55, 0.85, w.r));
      c *= 0.8 + 0.4 * w.g;
      c = mix(c, vec3(0.50, 0.12, 0.05), gStorm * 0.8);
      hid = c * light;
      specAmt = 0.35; sparkleAmt = 0.25;
    }
    hid += env * (0.04 + 0.40 * fres) * (0.6 + 0.4 * dayF) * (uWorld > 0.5 && uWorld < 1.5 ? 0.6 : 1.0);
    hid += vec3(0.85, 0.92, 1.0) * spec * specAmt * (0.25 + 0.75 * dayF);
    float sparkle = pow(vnoise(vObj * 60.0 + vHash * 10.0), 12.0) * sparkleAmt * top;
    hid += uRim * sparkle * (0.3 + 0.7 * fres);
    hid += uRim * edge * top * 0.14;
    hid *= mix(0.45, 1.0, top);
    hid += uRim * (1.0 - top) * vRole.x * 0.02;
  }
  vec3 rev = vec3(0.0);
  if (revMix > 0.001) {
    vec3 floorC;
    if (uWorld < 0.5) floorC = mix(vec3(0.004, 0.006, 0.012), vec3(0.020, 0.026, 0.040), w.r) + vec3(0.002, 0.006, 0.014) * w.g;
    else if (uWorld < 1.5) {
      floorC = mix(vec3(0.016, 0.046, 0.020), vec3(0.068, 0.058, 0.026), smoothstep(0.35, 0.75, w.r));
      floorC = mix(floorC, vec3(0.12, 0.12, 0.13), smoothstep(0.82, 0.95, w.r));
      floorC = mix(vec3(0.085, 0.078, 0.045), floorC, smoothstep(0.0, 0.12, w.r));
    } else floorC = mix(vec3(0.026, 0.010, 0.038), vec3(0.07, 0.026, 0.08), w.g);
    vec3 tint = num > 0.5 ? uNum[int(num)] : uRim;
    rev = floorC * mix(0.55, 1.0, dayF) * (0.75 + 0.5 * ndl);
    float n1 = vnoise(vObj * 9.0 + vec3(0.0, uTime * 0.12 * uMotion, 0.0));
    float vein = 1.0 - smoothstep(0.0, 0.04, abs(n1 - 0.5));
    float flick = uWorld > 1.5 ? (0.55 + 0.45 * sin(uTime * 7.0 + vHash * 40.0) * sin(uTime * 3.1 + vHash * 13.0)) : 1.0;
    rev += mix(uRim, tint, 0.5) * vein * (uWorld < 0.5 ? 0.07 : 0.12) * flick;
    rev += tint * 0.03;
    float night = 1.0 - dayF;   // city lights glow on revealed land on the night side
    rev += uCity * w.b * night * (0.85 + 0.15 * sin(uTime * 2.0 + vHash * 20.0)) * 1.3 * top;
    rev *= mix(1.0, 0.5 + 0.5 * smoothstep(0.0, 0.5, vRole.y), top);
    rev += uRim * edge * 0.12 * top;
    rev *= mix(0.3, 1.0, top);
    rev += env * fres * 0.10;
    float fl = clamp(1.0 - (vReveal - 0.5) * 2.0, 0.0, 1.0);
    rev += mix(vec3(1.0), uRim, 0.4) * fl * fl * 1.1 * (vReveal > 0.999 ? 0.0 : 1.0);
    if (num > 0.5 && top > 0.5 && abs(vLocal.x) < 1.0 && abs(vLocal.y) < 1.0) {
      vec2 uv = vec2((num + vLocal.x * 0.5 + 0.5) / 8.0, vLocal.y * 0.5 + 0.5);
      vec4 dg = texture2D(uDigits, uv);
      float a = dg.a * smoothstep(0.55, 0.9, vReveal);
      rev = rev * (1.0 - a) + dg.rgb * a * 1.3;
    }
  }
  vec3 col = mix(hid, rev, revMix) * vFlipShade;
  if (state > 1.5 && state < 2.5) {   // flagged: a bright beacon-orange hex outline
    float pul = 0.75 + 0.25 * sin(uTime * 3.0 + vHash * 6.0);
    col = col * 0.8 + vec3(1.0, 0.32, 0.10) * (0.05 + edge * top * 0.9 * pul + (1.0 - top) * 0.15);
  }
  if (state > 5.5) {                  // Zen: a mine found by a shield
    col = col * 0.5 + vec3(0.25, 0.8, 1.0) * (0.04 + edge * top * 0.9 + (1.0 - top) * 0.12) * (0.8 + 0.2 * sin(uTime * 2.0));
  }
  if (state > 2.5 && state < 5.5) {
    if (state < 4.5) {
      float hot = state > 3.5 ? 1.0 : 0.0;
      float pulse = 0.75 + 0.25 * sin(uTime * 7.0 + vHash * 20.0);
      vec3 mc = mix(mix(vec3(1.0, 0.18, 0.06), vec3(1.0, 0.8, 0.5), hot), vec3(0.2, 0.65, 1.0), uCalm);
      vec3 m = mc * (1.2 + 2.0 * hot) * pulse;
      float core = pow(vRole.y, 1.6);
      vec3 charred = vec3(0.035, 0.012, 0.01) * (0.5 + ndl) + m * (0.08 + 0.9 * core) * top + m * 0.06 * (1.0 - top);
      col = mix(col, charred, vMine);
    } else {
      col = mix(col, vec3(0.25, 0.22, 0.4) * (0.5 + 0.5 * ndl), 0.6);
    }
  }
  if (vAfter > 0.0) {
    float a1 = vHash * 6.2831; vec2 n1 = vec2(-sin(a1), cos(a1));
    float a2 = a1 + 1.9; vec2 n2 = vec2(-sin(a2), cos(a2));
    float l1 = abs(dot(vCrack, n1) + (vHash - 0.5) * 0.3 + 0.025 * sin(dot(vCrack, n1.yx) * 18.0));
    float l2 = abs(dot(vCrack, n2) - (vHash - 0.5) * 0.2);
    float l = vHash > 0.55 ? min(l1, l2) : l1;
    float lines = (1.0 - smoothstep(0.0, 0.022, l)) * top * step(0.2, vHash);
    float crack = max(edge * 0.75 * top, lines) * vAfter;
    float flick = 0.8 + 0.4 * sin(uTime * 5.0 + vHash * 30.0);
    col += vec3(1.0, 0.30, 0.06) * crack * 1.4 * flick;
    col = mix(col, col * vec3(1.0, 0.55, 0.45), vAfter * 0.5);
  }
  col += vec3(1.0, 0.55, 0.22) * vShock * 1.8;
  col += vec3(0.3, 0.8, 1.0) * vPulse * 1.3;
  if (vWin > 0.0 || vWinCrest > 0.0) {
    float sh = 0.6 + 0.4 * sin(uTime * 2.2 + vObj.y * 9.0 + vObj.x * 5.0);
    vec3 gold = mix(vec3(1.0, 0.82, 0.45), vec3(0.6, 1.0, 0.85), 0.5 + 0.5 * sin(uTime * 0.7 + vObj.z * 4.0));
    col += gold * vWin * 0.10 * sh * (0.4 + top);
    col += vec3(1.0, 0.9, 0.7) * vWinCrest * 1.1;
  }
  if (uScan > 0.0) {
    float s = fract(vObj.y * 0.5 + 0.5 - uTime * 0.18);
    float band = exp(-pow((s - 0.5) / 0.03, 2.0));
    col += uRim * band * uScan * 0.45 * (0.4 + top) * (1.0 - step(0.5, state));
  }
  col += vec3(0.25, 0.55, 0.85) * vSel * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---------------------------------------------------------------- board mesh */
const H_BASE = 0.972, H_OUTER = 1.020, H_INNER = 1.028, H_CENTER = 1.037, GAP = 0.93, BEVEL = 0.80;
const sunV = { value: SUN_V.clone() }, sunW = { value: SUN_V.clone() }, timeU = { value: 0 };
const tileUniforms = {
  uState: { value: null }, uStateSize: { value: new THREE.Vector2(64, 1) }, uTime: timeU, uUp: { value: new THREE.Vector3(0, 1, 0) },
  uShock: { value: new THREE.Vector4(0, 0, 1, -1) }, uWin: { value: new THREE.Vector4(0, 0, 1, -1) }, uPulse: { value: new THREE.Vector4(0, 0, 1, -1) },
  uHover: { value: -1 }, uPress: { value: -1 }, uPressAmt: { value: 0 }, uMotion: { value: motionOn() ? 1 : 0 },
  uDigits: { value: digitAtlas }, uWorldTex: { value: null }, uWorld: { value: 1 }, uRim: { value: new THREE.Color() }, uCity: { value: new THREE.Color() },
  uSunV: sunV, uNum: { value: numColors().map(c => new THREE.Color(c)) }, uScan: { value: 1 }, uLose: { value: 0 }, uCalm: { value: 0 },
};
const tileMaterial = new THREE.ShaderMaterial({ uniforms: tileUniforms, vertexShader: TILE_VS, fragmentShader: TILE_FS });

const planet = new THREE.Group();
scene.add(planet);

function buildTileGeometry(board) {
  const { count, centers, corners, radius } = board;
  let triCount = 0;
  for (let i = 0; i < count; i++) triCount += corners[i].length * 5;
  const pos = new Float32Array(triCount * 9), nor = new Float32Array(triCount * 9);
  const cen = new Float32Array(triCount * 12), role = new Float32Array(triCount * 12);
  let vi = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  function tri(a, b, c, ra, rb, rc, ref, cell, cx, R) {
    A.fromArray(a); B.fromArray(b); Cc.fromArray(c);
    e1.subVectors(B, A); e2.subVectors(Cc, A); n.crossVectors(e1, e2).normalize();
    if (n.dot(ref) < 0) { const t = b; b = c; c = t; const tr = rb; rb = rc; rc = tr; n.negate(); }
    const vs = [a, b, c], rs = [ra, rb, rc];
    for (let k = 0; k < 3; k++) {
      pos.set(vs[k], vi * 3); nor[vi * 3] = n.x; nor[vi * 3 + 1] = n.y; nor[vi * 3 + 2] = n.z;
      cen[vi * 4] = cx[0]; cen[vi * 4 + 1] = cx[1]; cen[vi * 4 + 2] = cx[2]; cen[vi * 4 + 3] = cell;
      role[vi * 4] = rs[k][0]; role[vi * 4 + 1] = rs[k][1]; role[vi * 4 + 2] = rs[k][2]; role[vi * 4 + 3] = R;
      vi++;
    }
  }
  const sc = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const lerpN = (c, p, t) => nrm([c[0] + (p[0] - c[0]) * t, c[1] + (p[1] - c[1]) * t, c[2] + (p[2] - c[2]) * t]);
  const refV = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const c = [centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2]];
    const R = radius[i];
    const cs = corners[i];
    const q = cs.map(p => lerpN(c, p, GAP));
    const Tt = q.map(p => sc(lerpN(c, p, BEVEL), H_INNER));
    const O = q.map(p => sc(p, H_OUTER));
    const Bs = q.map(p => sc(p, H_BASE));
    const top = sc(c, H_CENTER);
    const rC = [1, 1, 1], rT = [1, 0, 1], rTb = [1, 0, 0], rO = [1, 0, 0], rB = [0, 0, 0];
    const m = cs.length;
    for (let k = 0; k < m; k++) {
      const k2 = (k + 1) % m;
      refV.set(c[0], c[1], c[2]);
      tri(top, Tt[k], Tt[k2], rC, rT, rT, refV, i, c, R);
      tri(Tt[k], O[k], O[k2], rTb, rO, rO, refV, i, c, R);
      tri(Tt[k], O[k2], Tt[k2], rTb, rO, rTb, refV, i, c, R);
      const mid = [(q[k][0] + q[k2][0]) / 2, (q[k][1] + q[k2][1]) / 2, (q[k][2] + q[k2][2]) / 2];
      const dd = mid[0] * c[0] + mid[1] * c[1] + mid[2] * c[2];
      refV.set(mid[0] - c[0] * dd, mid[1] - c[1] * dd, mid[2] - c[2] * dd);
      tri(O[k], Bs[k], Bs[k2], rO, rB, rB, refV, i, c, R);
      tri(O[k], Bs[k2], O[k2], rO, rB, rO, refV, i, c, R);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aCenter', new THREE.BufferAttribute(cen, 4));
  g.setAttribute('aRole', new THREE.BufferAttribute(role, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
  return g;
}

// core sphere: glowing seams between tiles
const coreMat = new THREE.ShaderMaterial({
  uniforms: { uTime: timeU, uSeam: { value: new THREE.Color() }, uLose: tileUniforms.uLose, uWinAmt: { value: 0 } },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: NOISE_GLSL + `uniform float uTime; uniform vec3 uSeam; uniform float uLose; uniform float uWinAmt; varying vec3 vP;
    void main(){ float n = vnoise(vP*7.0 + uTime*0.15); vec3 c = uSeam * (0.35 + 0.65*n);
      c = mix(c, vec3(1.0,0.3,0.06)*1.4, uLose); c = mix(c, vec3(1.0,0.8,0.45)*1.1, uWinAmt);
      gl_FragColor = vec4(c, 1.0); }`,
});
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.976, 6), coreMat);
planet.add(core);

// atmosphere: outer halo (backside) + front limb shell; brighter on the day side, warm band at the terminator
const atmoUniforms = { uColor: { value: new THREE.Color() }, uTime: timeU, uShock: tileUniforms.uShock, uBoost: { value: 1 }, uSunV: sunV, uSunset: { value: 0 } };
const atmoOuter = new THREE.Mesh(new THREE.SphereGeometry(1.26, 96, 48), new THREE.ShaderMaterial({
  uniforms: atmoUniforms, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = mv.xyz; gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uBoost; uniform vec3 uSunV; uniform float uSunset; varying vec3 vN; varying vec3 vV;
    void main(){ vec3 n = normalize(vN); float d = -dot(n, normalize(-vV)); float i = pow(clamp(d, 0.0, 1.0), 2.2) * 1.15;
      i = smoothstep(0.0, 1.0, i) * 1.3;
      float s = dot(normalize(vec3(n.xy, 0.0001)), normalize(vec3(uSunV.xy, 0.0001)));
      float day = mix(0.35, 1.15, smoothstep(-0.6, 0.5, s));
      vec3 c = uColor * i * uBoost * day + vec3(1.0, 0.45, 0.18) * i * uSunset * 0.45 * exp(-pow(s / 0.35, 2.0));
      gl_FragColor = vec4(c, 1.0); }`,
}));
const atmoInner = new THREE.Mesh(new THREE.SphereGeometry(1.055, 96, 48), new THREE.ShaderMaterial({
  uniforms: atmoUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = mv.xyz; gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uBoost; uniform float uTime; uniform vec4 uShock; uniform vec3 uSunV; uniform float uSunset; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ vec3 n = normalize(vN); float f = 1.0 - max(dot(n, normalize(-vV)), 0.0); float i = pow(f, 4.0) * 0.55;
      float s = dot(n, uSunV); float day = mix(0.3, 1.2, smoothstep(-0.25, 0.35, s));
      vec3 c = uColor * i * uBoost * day + vec3(1.0, 0.5, 0.2) * i * uSunset * 0.8 * exp(-pow(s / 0.18, 2.0));
      if (uShock.w > 0.0 && uTime > uShock.w) { float ang = acos(clamp(dot(normalize(vP), uShock.xyz), -1.0, 1.0)); float fr = (uTime - uShock.w) * 2.3;
        float ring = exp(-pow((ang - fr) / 0.06, 2.0)) * smoothstep(3.6, 2.6, fr); c += vec3(1.0, 0.7, 0.4) * ring * 1.4; }
      gl_FragColor = vec4(c, 1.0); }`,
}));
planet.add(atmoOuter, atmoInner);

/* ---------------------------------------------------------------- clouds (ocean world): a separate drifting layer */
const cloudMat = new THREE.ShaderMaterial({
  uniforms: { uTime: timeU, uWorldTex: tileUniforms.uWorldTex, uSunV: sunV, uMotion: tileUniforms.uMotion, uFade: { value: 1 } },
  transparent: true, depthWrite: false,
  vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = mv.xyz; gl_Position = projectionMatrix*mv; }`,
  fragmentShader: EQ_GLSL + `uniform float uTime; uniform sampler2D uWorldTex; uniform vec3 uSunV; uniform float uMotion; uniform float uFade; varying vec3 vP; varying vec3 vN; varying vec3 vV;
    void main(){ vec3 d = normalize(vP); vec2 uv = eqUV(d);
      float t = uTime * uMotion;
      float c1 = texture2D(uWorldTex, uv + vec2(t * 0.0030, 0.0)).a;
      float c2 = texture2D(uWorldTex, uv * vec2(1.0, 1.0) + vec2(0.37 - t * 0.0016, 0.012 * sin(t * 0.05))).a;
      float dens = smoothstep(0.54, 0.80, c1 * 0.68 + c2 * 0.42);
      vec3 n = normalize(vN); float ndv = max(dot(n, normalize(-vV)), 0.0);
      float viewFade = mix(0.16, 1.0, pow(1.0 - ndv, 1.6));   // thin over the play area, thick at the limb
      float day = smoothstep(-0.18, 0.3, dot(n, uSunV));
      vec3 col = mix(vec3(0.03, 0.035, 0.06), vec3(0.92, 0.95, 1.0), day);
      gl_FragColor = vec4(col, dens * 0.72 * viewFade * uFade); }`,
});
const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.072, 96, 48), cloudMat);
clouds.renderOrder = 2; clouds.visible = false; planet.add(clouds);

/* ---------------------------------------------------------------- rings: banded, shadowed by the planet, fade where they cross the board */
function ringBandTexture(kind) {
  const W = 512, data = new Uint8Array(W * 4);
  let s = kind === 'giant' ? 7 : 3; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  let v = 0.5;
  for (let i = 0; i < W; i++) {
    const x = i / (W - 1);
    v += (rnd() - 0.5) * 0.35; v = Math.min(1, Math.max(0, v * 0.92 + 0.04));
    let a = (0.35 + 0.65 * v) * Math.min(1, x / 0.06) * Math.min(1, (1 - x) / 0.12);
    if (kind === 'giant' && Math.abs(x - 0.63) < 0.025) a *= 0.08;        // a Cassini-style gap
    if (kind === 'giant' && Math.abs(x - 0.84) < 0.01) a *= 0.3;
    const warm = kind === 'giant' ? [235 - v * 70, 205 - v * 80, 165 - v * 90] : [190 + v * 50, 220 + v * 30, 255];
    data.set([warm[0], warm[1], warm[2], Math.round(a * 255)], i * 4);
  }
  const t = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat); t.needsUpdate = true;
  t.magFilter = t.minFilter = THREE.LinearFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ringTex = { giant: ringBandTexture('giant'), ice: ringBandTexture('ice') };
const ringMat = new THREE.ShaderMaterial({
  uniforms: { uBand: { value: ringTex.giant }, uInner: { value: 1.4 }, uOuter: { value: 2.3 }, uSunW: sunW, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0.85 }, uTime: timeU, uGlint: { value: 0 } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: `varying vec3 vW; varying float vR; void main(){ vR = length(position.xy); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform sampler2D uBand; uniform float uInner; uniform float uOuter; uniform vec3 uSunW; uniform vec3 uCam; uniform float uAlpha; uniform float uTime; uniform float uGlint;
    varying vec3 vW; varying float vR;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ float x = (vR - uInner) / (uOuter - uInner); vec4 b = texture2D(uBand, vec2(x, 0.5));
      float along = dot(vW, uSunW); vec3 perp = vW - along * uSunW;
      float lit = along < 0.0 ? smoothstep(0.95, 1.05, length(perp)) : 1.0;
      vec3 D = vW - uCam; float L = length(D); D /= L; float tca = dot(-uCam, D); float d2 = dot(uCam, uCam) - tca * tca;
      float covers = tca > L ? 1.0 - smoothstep(0.96, 1.12, sqrt(max(d2, 0.0))) : 0.0;
      float a = b.a * uAlpha * (1.0 - 0.85 * covers);
      vec3 col = b.rgb * (0.12 + 0.95 * lit);
      float g = step(0.996, h(floor(vW.xz * 260.0))) * uGlint * (0.5 + 0.5 * sin(uTime * 3.0 + vR * 80.0));
      col += vec3(0.8, 0.95, 1.2) * g * lit * 2.0;
      gl_FragColor = vec4(col, a); }`,
});
const rings = new THREE.Mesh(new THREE.RingGeometry(1, 2, 192, 1), ringMat);
rings.renderOrder = 3; rings.visible = false; scene.add(rings);
function setRing(kind) {
  if (!kind) { rings.visible = false; return; }
  rings.visible = true;
  const giant = kind === 'giant';
  const inner = giant ? 1.42 : 1.30, outer = giant ? 2.35 : 1.62;
  rings.geometry.dispose(); rings.geometry = new THREE.RingGeometry(inner, outer, 192, 1);
  ringMat.uniforms.uInner.value = inner; ringMat.uniforms.uOuter.value = outer;
  ringMat.uniforms.uBand.value = ringTex[kind]; ringMat.uniforms.uAlpha.value = giant ? 0.9 : 0.42; ringMat.uniforms.uGlint.value = giant ? 0 : 1;
  rings.rotation.set(-Math.PI / 2 + (giant ? 0.42 : -0.55), giant ? 0.3 : 0.9, giant ? 0.12 : -0.2, 'YXZ');
}

/* ---------------------------------------------------------------- moonlet: a small moon on a slow inclined orbit */
const moonletMat = new THREE.ShaderMaterial({
  uniforms: { uSunW: sunW, uAlpha: { value: 1 }, uTint: { value: new THREE.Color(0.75, 0.74, 0.72) } },
  transparent: true,
  vertexShader: `varying vec3 vNw; varying vec3 vP; void main(){ vP = position; vNw = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: NOISE_GLSL + `uniform vec3 uSunW; uniform float uAlpha; uniform vec3 uTint; varying vec3 vNw; varying vec3 vP;
    void main(){ float c = vnoise(vP * 3.0) * 0.5 + vnoise(vP * 7.0) * 0.3 + vnoise(vP * 16.0) * 0.2;
      float cr = smoothstep(0.62, 0.7, vnoise(vP * 5.0 + 3.0)) * 0.35;
      float l = max(dot(normalize(vNw), uSunW), 0.0);
      vec3 col = uTint * (0.35 + 0.65 * c - cr) * (0.03 + 1.25 * l);
      gl_FragColor = vec4(col, uAlpha); }`,
});
const moonlet = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), moonletMat);
moonlet.visible = false; moonlet.renderOrder = 1; scene.add(moonlet);
const moonOrbit = { r: 2.25, size: 0.13, incl: 0.38, speed: 0.07, phase: 2.2, alpha: 1 };

/* ---------------------------------------------------------------- frost shards (moon): shatter when their cell is revealed */
const shardGeo = new THREE.OctahedronGeometry(1, 0).scale(0.16, 0.62, 0.16).translate(0, 0.32, 0);
const shardMat = new THREE.ShaderMaterial({
  uniforms: { uState: tileUniforms.uState, uStateSize: tileUniforms.uStateSize, uTime: timeU, uSunV: sunV },
  vertexShader: STATE_GLSL + /* glsl */`
    attribute float aCell; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vK;
    void main(){
      vec4 st = cellState(aCell);
      float rev = step(0.5, st.x) * step(st.x, 1.5);
      float k = rev * clamp((uTime - st.z) / 0.3, 0.0, 1.0);
      float vis = st.x < 0.5 ? 1.0 : (rev > 0.5 ? 1.0 - k : 0.0);
      vK = k;
      vec4 wp = instanceMatrix * vec4(position * vis, 1.0);
      wp.xyz += normalize(wp.xyz) * k * 0.05;
      vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
      vec4 mv = modelViewMatrix * wp; vV = mv.xyz; gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `uniform vec3 uSunV; varying vec3 vN; varying vec3 vV; varying float vK;
    void main(){ vec3 n = normalize(vN); vec3 v = normalize(-vV); float ndv = max(dot(n, v), 0.0);
      float l = max(dot(n, uSunV), 0.0);
      vec3 col = vec3(0.10, 0.22, 0.40) * (0.35 + 0.9 * l) + vec3(0.6, 0.85, 1.0) * pow(1.0 - ndv, 2.5) * 0.8;
      col += vec3(1.0) * pow(max(dot(reflect(-uSunV, n), v), 0.0), 40.0) * 1.2;
      col += vec3(0.7, 0.9, 1.0) * vK * 2.0;
      gl_FragColor = vec4(col, 1.0); }`,
});
let shards = null;
function buildShards(board) {
  if (shards) { planet.remove(shards); shards.geometry.dispose(); shards = null; }
  const C = board.centers, list = [];
  let s = 12345; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < board.count; i++) {
    if (rnd() > 0.3) continue;
    const k = rnd() < 0.25 ? 2 : 1;
    for (let j = 0; j < k; j++) list.push([i, rnd(), rnd(), rnd(), rnd()]);
  }
  const geo = shardGeo.clone();
  const cells = new Float32Array(list.length);
  const mesh = new THREE.InstancedMesh(geo, shardMat, list.length);
  const n = new THREE.Vector3(), t = new THREE.Vector3(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), m = new THREE.Matrix4(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  list.forEach(([i, a, b, c, d], k) => {
    const R = board.radius[i];
    n.set(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]);
    t.set(a - 0.5, b - 0.5, c - 0.5).cross(n).normalize();
    p.copy(n).multiplyScalar(H_CENTER - 0.004).addScaledVector(t, R * 0.32 * d);
    q.setFromUnitVectors(Y, n);
    q2.setFromAxisAngle(t, (a - 0.5) * 0.6); q.premultiply(q2);
    const h = R * (0.20 + 0.24 * b);
    sc.set(R * (0.6 + 0.4 * c), h, R * (0.6 + 0.4 * a));
    m.compose(p, q, sc); mesh.setMatrixAt(k, m); cells[k] = i;
  });
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
  mesh.frustumCulled = false;
  shards = mesh; planet.add(mesh);
}

/* ---------------------------------------------------------------- aurora (win) */
const auroraMat = new THREE.ShaderMaterial({
  uniforms: { uTime: timeU, uFade: { value: 0 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: NOISE_GLSL + `uniform float uTime; uniform float uFade; varying vec2 vUv;
    void main(){ float x = vUv.x * 6.2831853;
      float cur = vnoise(vec3(cos(x)*3.0, sin(x)*3.0, uTime*0.25));
      float streak = pow(vnoise(vec3(cos(x)*28.0, sin(x)*28.0, uTime*0.6)), 2.0);
      float y = vUv.y + (cur - 0.5) * 0.35;
      float curtain = smoothstep(0.0, 0.12, y) * pow(1.0 - clamp(y, 0.0, 1.0), 1.6);
      vec3 green = vec3(0.15, 1.0, 0.55), violet = vec3(0.6, 0.25, 1.0), pink = vec3(1.0, 0.35, 0.6);
      vec3 col = mix(green, violet, smoothstep(0.25, 0.9, y));
      col = mix(col, pink, 0.35 * smoothstep(0.55, 0.9, vnoise(vec3(x*2.0, 0.0, uTime*0.2))));
      float a = curtain * (0.35 + 1.1 * streak) * uFade;
      gl_FragColor = vec4(col * a * 1.5, 1.0); }`,
});
const aurora = new THREE.Group();
const ringA = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.48, 0.42, 160, 1, true), auroraMat);
const ringB = new THREE.Mesh(new THREE.CylinderGeometry(1.70, 1.62, 0.30, 160, 1, true), auroraMat);
ringA.rotation.set(0.42, 0, 0.18); ringB.rotation.set(-0.3, 0, -0.55);
aurora.add(ringA, ringB); aurora.visible = false;
scene.add(aurora);

/* ---------------------------------------------------------------- beacons (flags) and mines */
const MAX_INST = 1100;
const poleGeo = new THREE.CylinderGeometry(0.0024, 0.0045, 0.085, 6).translate(0, 0.0425, 0);
const orbGeo = new THREE.IcosahedronGeometry(0.010, 2).translate(0, 0.088, 0);
const beamGeo = new THREE.CylinderGeometry(0.0030, 0.0010, 0.16, 8, 1, true).translate(0, 0.16, 0);
const baseGeo = new THREE.TorusGeometry(0.026, 0.0035, 6, 24).rotateX(Math.PI / 2).translate(0, 0.004, 0);
// pennant: a strip subdivided along its length so it can ripple; tapered to a point in the shader
const pennantGeo = new THREE.PlaneGeometry(0.046, 0.030, 8, 1).translate(0.023, 0.068, 0);
const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0xb8c2dc, metalness: 0.6, roughness: 0.3 }), MAX_INST);
const orbs = new THREE.InstancedMesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_INST);
const bases = new THREE.InstancedMesh(baseGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_INST);
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uTime: timeU, uColor: { value: new THREE.Color(1.0, 0.45, 0.15) } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying float vY; void main(){ vY = uv.y; vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * p; }`,
  fragmentShader: `uniform float uTime; uniform vec3 uColor; varying float vY; void main(){ float a = pow(1.0 - vY, 2.0) * (0.45 + 0.25*sin(uTime*4.0 - vY*12.0)); gl_FragColor = vec4(uColor * a, 1.0); }`,
});
const pennantMat = new THREE.ShaderMaterial({
  uniforms: { uTime: timeU, uMotion: tileUniforms.uMotion }, side: THREE.DoubleSide,
  vertexShader: `uniform float uTime; uniform float uMotion; varying vec3 vC; varying float vX; varying float vShade;
    void main(){ vec3 p = position; float x = clamp(p.x / 0.046, 0.0, 1.0); vX = x;
      p.y = 0.068 + (p.y - 0.068) * (1.0 - x * 0.92);
      float ph = 0.0;
      #ifdef USE_INSTANCING
        ph = instanceMatrix[3].x * 37.0 + instanceMatrix[3].z * 19.0;
      #endif
      float wv = sin(x * 7.0 - uTime * 6.0 + ph) * x * 0.010 * uMotion;
      p.z += wv; p.y += sin(x * 4.0 - uTime * 5.0 + ph) * x * 0.002 * uMotion;
      vShade = 0.75 + 0.35 * cos(x * 7.0 - uTime * 6.0 + ph) * uMotion;
      vC = vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
      #endif
      vec4 q = vec4(p, 1.0);
      #ifdef USE_INSTANCING
        q = instanceMatrix * q;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * q; }`,
  fragmentShader: `varying vec3 vC; varying float vX; varying float vShade; void main(){ gl_FragColor = vec4(vC * vShade * (1.15 - 0.4 * vX), 1.0); }`,
});
const beams = new THREE.InstancedMesh(beamGeo, beamMat, MAX_INST);
const pennants = new THREE.InstancedMesh(pennantGeo, pennantMat, MAX_INST);
orbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INST * 3), 3);
bases.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INST * 3), 3);
pennants.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INST * 3), 3);
const BEACONS = [poles, orbs, bases, beams, pennants];
for (const m of BEACONS) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); planet.add(m); }

function makeSpikyGeo() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const dirs = []; const ip = ico.attributes.position;
  for (let i = 0; i < ip.count; i++) dirs.push(new THREE.Vector3().fromBufferAttribute(ip, i));
  const p = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (dirs.some(d => d.dot(v) > 0.999)) v.multiplyScalar(2.1); else v.multiplyScalar(0.92);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g.scale(0.017, 0.017, 0.017);
}
const mines3d = new THREE.InstancedMesh(makeSpikyGeo(), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_INST);
mines3d.count = 0; mines3d.frustumCulled = false;
mines3d.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INST * 3), 3);
planet.add(mines3d);

/* ---------------------------------------------------------------- particles */
const PARTICLE_VS = `attribute vec3 aVel; attribute vec4 aData; uniform float uTime; uniform float uT0; uniform float uPx; uniform float uGrav;
  varying float vLife; varying float vMix;
  void main(){ float t = uTime - uT0 - aData.z; float life = aData.x;
    vLife = (t < 0.0 || t > life) ? -1.0 : t / life; vMix = aData.w; t = max(t, 0.0);
    float k = 1.6; vec3 o = position; vec3 p = o + aVel * (1.0 - exp(-k*t)) / k - normalize(o) * uGrav * t * t * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = vLife < 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
    gl_PointSize = vLife < 0.0 ? 0.0 : aData.y * uPx * (1.0 - vLife*0.6) / -mv.z; }`;
const PARTICLE_FS = `uniform vec3 uA; uniform vec3 uB; varying float vLife; varying float vMix;
  void main(){ if (vLife < 0.0) discard; vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d));
    vec3 c = mix(uA, uB, clamp(vLife*1.4 + vMix*0.4, 0.0, 1.0)); float f = pow(1.0 - vLife, 1.5);
    gl_FragColor = vec4(c * a * a * f, 1.0); }`;
function makeBurst(capacity, gravity, colA, colB) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
  g.setAttribute('aVel', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
  g.setAttribute('aData', new THREE.BufferAttribute(new Float32Array(capacity * 4), 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: timeU, uT0: { value: -100 }, uPx: { value: 0 }, uGrav: { value: gravity }, uA: { value: new THREE.Color(...colA) }, uB: { value: new THREE.Color(...colB) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false;
  planet.add(pts);
  return { pts, g, m, capacity, head: 0 };
}
const boom = makeBurst(IS_MOBILE ? 700 : 1200, 0.9, [4.0, 2.4, 1.2], [1.2, 0.15, 0.04]);
const sparkle = makeBurst(IS_MOBILE ? 700 : 1200, -0.12, [3.0, 2.7, 1.6], [0.4, 1.4, 1.0]);
const debris = makeBurst(IS_MOBILE ? 1800 : 3000, 0.55, [2, 2, 2], [0.5, 0.5, 0.5]);   // uT0 = 0: aData.z holds absolute start
debris.m.uniforms.uT0.value = 0;
const shieldBurst = makeBurst(IS_MOBILE ? 260 : 400, 0.0, [1.2, 2.6, 3.4], [0.2, 0.5, 1.2]);

function fireBoom(dir, t0) {
  const { g, capacity } = boom; const P = g.attributes.position.array, Vv = g.attributes.aVel.array, D = g.attributes.aData.array;
  const n = new THREE.Vector3(...dir).normalize(); const tmp = new THREE.Vector3(); const o = n.clone().multiplyScalar(1.03);
  for (let i = 0; i < capacity; i++) {
    const ring = i % 3 === 0;
    tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    if (ring) tmp.addScaledVector(n, -tmp.dot(n)).normalize().multiplyScalar(0.9 + Math.random() * 0.8).addScaledVector(n, 0.1);
    else tmp.addScaledVector(n, 1.4 + Math.random() * 1.5).normalize().multiplyScalar(0.4 + Math.random() * 1.5);
    P[i * 3] = o.x; P[i * 3 + 1] = o.y; P[i * 3 + 2] = o.z;
    Vv[i * 3] = tmp.x; Vv[i * 3 + 1] = tmp.y; Vv[i * 3 + 2] = tmp.z;
    D[i * 4] = 0.9 + Math.random() * 1.8; D[i * 4 + 1] = (ring ? 10 : 6) + Math.random() * 18; D[i * 4 + 2] = Math.random() * 0.12; D[i * 4 + 3] = Math.random();
  }
  for (const k of ['position', 'aVel', 'aData']) g.attributes[k].needsUpdate = true;
  boom.m.uniforms.uT0.value = t0; boom.pts.visible = true;
}
function fireShieldBurst(dir, t0) {
  const { g, capacity } = shieldBurst; const P = g.attributes.position.array, Vv = g.attributes.aVel.array, D = g.attributes.aData.array;
  const n = new THREE.Vector3(...dir).normalize(); const tmp = new THREE.Vector3(); const o = n.clone().multiplyScalar(1.04);
  for (let i = 0; i < capacity; i++) {
    tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    tmp.addScaledVector(n, -tmp.dot(n)).normalize().multiplyScalar(0.25 + Math.random() * 0.25).addScaledVector(n, 0.05 + Math.random() * 0.2);
    P[i * 3] = o.x; P[i * 3 + 1] = o.y; P[i * 3 + 2] = o.z;
    Vv[i * 3] = tmp.x; Vv[i * 3 + 1] = tmp.y; Vv[i * 3 + 2] = tmp.z;
    D[i * 4] = 0.5 + Math.random() * 0.7; D[i * 4 + 1] = 5 + Math.random() * 9; D[i * 4 + 2] = Math.random() * 0.05; D[i * 4 + 3] = Math.random();
  }
  for (const k of ['position', 'aVel', 'aData']) g.attributes[k].needsUpdate = true;
  shieldBurst.m.uniforms.uT0.value = t0; shieldBurst.pts.visible = true;
}
function fireSparkles(t0) {
  const { g, capacity } = sparkle; const P = g.attributes.position.array, Vv = g.attributes.aVel.array, D = g.attributes.aData.array;
  const v = new THREE.Vector3();
  for (let i = 0; i < capacity; i++) {
    v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    P[i * 3] = v.x * 1.04; P[i * 3 + 1] = v.y * 1.04; P[i * 3 + 2] = v.z * 1.04;
    const s = 0.05 + Math.random() * 0.25;
    Vv[i * 3] = v.x * s; Vv[i * 3 + 1] = v.y * s; Vv[i * 3 + 2] = v.z * s;
    D[i * 4] = 1.5 + Math.random() * 2.5; D[i * 4 + 1] = 4 + Math.random() * 12; D[i * 4 + 2] = Math.random() * 3.5; D[i * 4 + 3] = Math.random();
  }
  for (const k of ['position', 'aVel', 'aData']) g.attributes[k].needsUpdate = true;
  sparkle.m.uniforms.uT0.value = t0; sparkle.pts.visible = true;
}
/** reveal crumble: a few chips fly off each tile as it flips (ring buffer, absolute start times) */
function emitDebris(cells, times) {
  if (!motionOn() || !cells.length) return;
  const { g, capacity } = debris; const P = g.attributes.position.array, Vv = g.attributes.aVel.array, D = g.attributes.aData.array;
  const C = state.board.centers; const per = cells.length > 250 ? 1 : cells.length > 80 ? 2 : 3;
  const sz = state.cellR / 0.1;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k], cx = C[i * 3], cy = C[i * 3 + 1], cz = C[i * 3 + 2];
    for (let j = 0; j < per; j++) {
      const h = debris.head; debris.head = (debris.head + 1) % capacity;
      let tx = Math.random() - 0.5, ty = Math.random() - 0.5, tz = Math.random() - 0.5;
      const dd = tx * cx + ty * cy + tz * cz; tx -= cx * dd; ty -= cy * dd; tz -= cz * dd;
      const r = state.cellR * 0.9;
      P[h * 3] = cx * 1.04 + tx * r; P[h * 3 + 1] = cy * 1.04 + ty * r; P[h * 3 + 2] = cz * 1.04 + tz * r;
      const up = 0.10 + Math.random() * 0.22, side = 0.25 + Math.random() * 0.3;
      Vv[h * 3] = cx * up + tx * side; Vv[h * 3 + 1] = cy * up + ty * side; Vv[h * 3 + 2] = cz * up + tz * side;
      D[h * 4] = 0.45 + Math.random() * 0.5; D[h * 4 + 1] = (3 + Math.random() * 5) * sz; D[h * 4 + 2] = times[k] + Math.random() * 0.08; D[h * 4 + 3] = Math.random();
    }
  }
  for (const k of ['position', 'aVel', 'aData']) g.attributes[k].needsUpdate = true;
  debris.pts.visible = true;
}

// eruption column at the exploded mine
const eruptMat = new THREE.ShaderMaterial({
  uniforms: { uTime: timeU, uT0: { value: -100 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: NOISE_GLSL + `uniform float uTime; uniform float uT0; varying vec2 vUv;
    void main(){ float t = uTime - uT0; if (t < 0.0) discard; float f = exp(-t*1.6);
      float n = vnoise(vec3(vUv.x*12.0, vUv.y*4.0 - t*6.0, t));
      float a = pow(1.0 - vUv.y, 1.5) * (0.5 + n) * f;
      vec3 c = mix(vec3(1.0,0.9,0.7)*4.0, vec3(1.0,0.25,0.05)*2.0, vUv.y + (1.0-f)*0.5);
      gl_FragColor = vec4(c * a, 1.0); }`,
});
const erupt = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.025, 1, 24, 1, true).translate(0, 0.5, 0), eruptMat);
erupt.visible = false; planet.add(erupt);

/* ---------------------------------------------------------------- game state */
const state = {
  mode: 'title',          // title | playing | over
  play: ['classic', 'zen', 'daily'].includes(localStorage.getItem('starfall.play')) ? localStorage.getItem('starfall.play') : 'classic',
  diff: localStorage.getItem('starfall.diff') || 'planet',   // chosen world for classic / zen
  size: null, theme: null, daily: null,
  board: null, game: null, mesh: null, cellR: 0.1,
  stateData: null, stateTex: null, stateDirty: false,
  flagMode: false, usedFlags: false,
  startTime: 0, endTime: 0, timerRunning: false, pausedAt: 0,
  flagTimes: new Map(),      // cell -> time placed (pop animation)
  mineList: [],              // {cell, t, exploded, defused}
  pendingWin: null, overAt: 0, lastCell: 0,
  winT: -1, loseT: -1, calm: false, result: null, pressPulse: 0, hintTimer: 0, recorded: false,
  toastLog: [],
};
if (!DIFFICULTIES[state.diff]) state.diff = 'planet';
const clock0 = performance.now();
const T = () => (performance.now() - clock0) / 1000;
const fmt = s => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${String(Math.floor(r)).padStart(2, '0')}`; };
const fmtBest = s => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(1).padStart(4, '0')}`; };
const baseAtmo = new THREE.Color();
const LOSE_ATMO = new THREE.Color(1.0, 0.25, 0.08), WIN_ATMO = new THREE.Color(1.0, 0.85, 0.55), CALM_ATMO = new THREE.Color(0.35, 0.45, 1.0);
const debrisCols = { a: new THREE.Color(), b: new THREE.Color() };

function applyWorld(key) {
  const W = WORLDS[key];
  state.theme = key;
  tileUniforms.uWorld.value = W.id;
  tileUniforms.uWorldTex.value = getWorldTexture(key);
  tileUniforms.uRim.value.setRGB(...W.rim); tileUniforms.uCity.value.setRGB(...W.city);
  coreMat.uniforms.uSeam.value.setRGB(...W.seam);
  baseAtmo.setRGB(...W.atmo).multiplyScalar(W.atmoGain);
  atmoUniforms.uSunset.value = W.sunset;
  sky.material.color.setRGB(...W.sky);
  debris.m.uniforms.uA.value.setRGB(...W.debrisA); debris.m.uniforms.uB.value.setRGB(...W.debrisB);
  clouds.visible = W.clouds;
  setRing(W.ring);
  moonlet.visible = W.moonlet;
  if (key === 'giant') { moonOrbit.r = 2.75; moonOrbit.size = 0.11; moonOrbit.incl = 0.30; moonletMat.uniforms.uTint.value.setRGB(0.85, 0.80, 0.70); }
  else { moonOrbit.r = 2.2; moonOrbit.size = 0.14; moonOrbit.incl = 0.42; moonletMat.uniforms.uTint.value.setRGB(0.72, 0.72, 0.74); }
  if (shards) shards.visible = W.shards;
  if (W.shards && (!shards || shards.userData.board !== state.board)) { buildShards(state.board); shards.userData.board = state.board; }
  Sfx.setWorld(key);
}

function setupBoard(sizeKey, themeKey = sizeKey) {
  const d = DIFFICULTIES[sizeKey];
  if (!state.board || state.board.n !== d.freq) {
    state.board = buildGoldberg(d.freq);
    if (state.mesh) { planet.remove(state.mesh); state.mesh.geometry.dispose(); }
    state.mesh = new THREE.Mesh(buildTileGeometry(state.board), tileMaterial);
    state.mesh.frustumCulled = false;
    planet.add(state.mesh);
    const N = state.board.count, W = 64, Hh = Math.ceil(N / W);
    if (state.stateTex) state.stateTex.dispose();
    state.stateData = new Float32Array(W * Hh * 4);
    state.stateTex = new THREE.DataTexture(state.stateData, W, Hh, THREE.RGBAFormat, THREE.FloatType);
    state.stateTex.minFilter = state.stateTex.magFilter = THREE.NearestFilter;
    tileUniforms.uState.value = state.stateTex; tileUniforms.uStateSize.value.set(W, Hh);
    let r = 0; for (let i = 0; i < N; i++) r += state.board.radius[i]; state.cellR = r / N;
  }
  state.size = sizeKey;
  applyWorld(themeKey);
  resetVisuals();
}

function resetVisuals() {
  const D = state.stateData; D.fill(0);
  for (let i = 0; i < D.length; i += 4) { D[i + 2] = -100; D[i + 3] = -100; }
  state.stateTex.needsUpdate = true;
  state.flagTimes.clear(); state.mineList = [];
  for (const m of BEACONS) m.count = 0;
  mines3d.count = 0;
  tileUniforms.uShock.value.w = -1; tileUniforms.uWin.value.w = -1; tileUniforms.uPulse.value.w = -1; tileUniforms.uLose.value = 0; tileUniforms.uCalm.value = 0;
  coreMat.uniforms.uWinAmt.value = 0;
  aurora.visible = false; auroraMat.uniforms.uFade.value = 0;
  boom.pts.visible = false; sparkle.pts.visible = false; erupt.visible = false; shieldBurst.pts.visible = false;
  state.winT = state.loseT = -1; state.calm = false; state.pendingWin = null; state.overAt = 0;
  beamMat.uniforms.uColor.value.setRGB(1.0, 0.45, 0.15);
}

function setCell(i, s, num, t, aux) {
  const D = state.stateData, o = i * 4;
  if (s != null) D[o] = s; if (num != null) D[o + 1] = num; if (t != null) D[o + 2] = t; if (aux != null) D[o + 3] = aux;
  state.stateDirty = true;
}

/* ---------------------------------------------------------------- camera / view
 * The planet is framed inside the area the HUD leaves free (between the top bar and the bottom controls) using
 * a projection view offset, so the HUD never covers the fitted planet. On touch screens the default distance is
 * also capped so a cell is at least MIN_CELL_PX across (Gas Giant on a phone zooms in instead of shrinking).
 */
const view = {
  q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.38, 0.6, 0, 'YXZ')),
  dist: 4, distTarget: 4, vx: 0, vy: 0, shake: 0, minD: 1.35, maxD: 8, ease: null,
};
const viewport = { w: 1, h: 1 };
const free = { top: 0, bottom: 1, left: 0, right: 1 };
function measureFree() {
  const w = viewport.w, h = viewport.h;
  let top = 0, bottom = h;
  const vis = el => el && !el.classList.contains('hidden') && el.offsetParent !== null;
  if (state.mode === 'title') {
    const b = document.querySelector('#title .brand'), bt = document.querySelector('#title .bottom');
    if (b) top = b.getBoundingClientRect().bottom + 6;
    if (bt) bottom = bt.getBoundingClientRect().top - 6;
    if (bottom - top < h * 0.32) { top = h * 0.12; bottom = h * 0.62; }
  } else {
    const bar = document.querySelector('#hud .bar'), chip = $('chip'), fab = $('btn-flag');
    if (vis(bar)) top = bar.getBoundingClientRect().bottom + 6;
    if (vis(chip)) top = Math.max(top, chip.getBoundingClientRect().bottom + 6);
    if (vis(fab)) {
      const r = fab.getBoundingClientRect();
      // the fab only matters if it sits under the planet's column (portrait-ish screens)
      bottom = (w < h * 1.25) ? r.top - 6 : h - Math.max(8, h - r.bottom);
    }
  }
  free.top = top; free.bottom = Math.max(top + 100, bottom); free.left = 0; free.right = w;
}
function applyViewOffset() {
  const cy = (free.top + free.bottom) / 2;
  camera.setViewOffset(viewport.w, viewport.h, 0, viewport.h / 2 - cy, viewport.w, viewport.h);
}
function fitDistance(R = 1.10) {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const availH = Math.max(80, free.bottom - free.top - 8), availW = Math.max(80, viewport.w - 16);
  const aV = Math.atan(t * availH / viewport.h), aH = Math.atan(t * camera.aspect * availW / viewport.w);
  return Math.max(R / Math.sin(aV), R / Math.sin(aH));
}
function cellPxAt(dist) {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return (2 * state.cellR * 0.9) / ((dist - 1) * t) * (viewport.h / 2);
}
function defaultDist() {
  if (state.mode === 'title') return fitDistance(1.22) * 1.02;
  const f = fitDistance(1.10);
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const dCell = 1 + (2 * state.cellR * 0.9) * (viewport.h / 2) / (t * MIN_CELL_PX);
  return Math.min(f, dCell);
}
function updateZoomLimits() {
  view.maxD = Math.max(fitDistance(1.22) * 1.5, 3);
  view.minD = 1.0 + state.cellR * (IS_MOBILE ? 3.0 : 4.0);
}
function reframe(snap) {
  measureFree(); applyViewOffset(); updateZoomLimits();
  view.distTarget = THREE.MathUtils.clamp(defaultDist(), view.minD, view.maxD);
  if (snap) view.dist = view.distTarget;
}
const _yAxis = new THREE.Vector3(0, 1, 0), _xAxis = new THREE.Vector3(1, 0, 0), _zAxis = new THREE.Vector3(0, 0, 1), _tq = new THREE.Quaternion();
function rotateBy(dxPx, dyPx) {
  const k = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.max(view.dist - 1, 0.15) / (viewport.h / 2);
  view.q.multiply(_tq.setFromAxisAngle(_yAxis, -dxPx * k));
  view.q.multiply(_tq.setFromAxisAngle(_xAxis, -dyPx * k));
  view.q.normalize();
}
function twistBy(rad) { view.q.multiply(_tq.setFromAxisAngle(_zAxis, rad)).normalize(); }
const _cd = new THREE.Vector3(), _cd2 = new THREE.Vector3(), _dq = new THREE.Quaternion();
/** Ease the camera so `dir` (unit, planet space) moves `frac` of the way to the centre of the view. */
function easeToward(dir, frac, dur = 0.7) {
  _cd.set(0, 0, 1).applyQuaternion(view.q);
  const ang = _cd.angleTo(dir); if (ang < 0.02) return;
  _cd2.copy(_cd).lerp(dir, 1).normalize();
  const to = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), _dq.setFromUnitVectors(_cd, _cd2), frac).multiply(view.q);
  view.ease = { from: view.q.clone(), to, t0: T(), dur };
}
/** Point the camera straight at dir with a north-up horizon. */
function lookQuat(dir) {
  const m = new THREE.Matrix4().lookAt(dir, new THREE.Vector3(), Math.abs(dir.y) > 0.95 ? _xAxis : _yAxis);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
function applyCamera(dt) {
  if (view.ease) {
    const k = Math.min(1, (T() - view.ease.t0) / view.ease.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    view.q.slerpQuaternions(view.ease.from, view.ease.to, e);
    if (k >= 1) view.ease = null;
  }
  view.dist += (view.distTarget - view.dist) * (1 - Math.exp(-dt * 9));
  camera.position.set(0, 0, view.dist).applyQuaternion(view.q);
  camera.quaternion.copy(view.q);
  if (view.shake > 0.0005) {
    const s = motionOn() ? view.shake : 0; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
    view.shake *= Math.exp(-dt * 3.5);
  }
  camera.updateMatrixWorld();
  tileUniforms.uUp.value.set(0, 1, 0).applyQuaternion(view.q);
  sunW.value.copy(SUN_V).applyQuaternion(view.q);
  ringMat.uniforms.uCam.value.copy(camera.position);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  viewport.w = w; viewport.h = h;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(DPR); composer.setSize(w, h);
  bloom.setSize(w * DPR * BLOOM_SCALE, h * DPR * BLOOM_SCALE);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  for (const p of [boom, sparkle, debris, shieldBurst]) p.m.uniforms.uPx.value = h * DPR * 0.0028;
  measureFree(); applyViewOffset(); updateZoomLimits();
  view.distTarget = THREE.MathUtils.clamp(state.mode === 'title' ? defaultDist() : Math.min(view.distTarget, defaultDist() * 1.6), view.minD, view.maxD);
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

/* ---------------------------------------------------------------- picking */
const raycaster = new THREE.Raycaster(); const _ndc = new THREE.Vector2(); const _hit = new THREE.Vector3();
const _sphere = new THREE.Sphere(new THREE.Vector3(), H_INNER);
function pickDir(x, y, out) {
  _ndc.set((x / viewport.w) * 2 - 1, -(y / viewport.h) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  if (!raycaster.ray.intersectSphere(_sphere, out)) return null;
  return out.normalize();
}
function pickCell(x, y) {
  if (!state.board) return -1;
  if (!pickDir(x, y, _hit)) return -1;
  const C = state.board.centers; let best = -1, bd = -2;
  for (let i = 0, n = state.board.count; i < n; i++) {
    const d = C[i * 3] * _hit.x + C[i * 3 + 1] * _hit.y + C[i * 3 + 2] * _hit.z;
    if (d > bd) { bd = d; best = i; }
  }
  return best;
}
const _proj = new THREE.Vector3(), _cdir = new THREE.Vector3();
function cellScreen(i) {
  const C = state.board.centers;
  _proj.set(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]).multiplyScalar(H_CENTER).project(camera);
  _cdir.copy(camera.position).normalize();
  const facing = C[i * 3] * _cdir.x + C[i * 3 + 1] * _cdir.y + C[i * 3 + 2] * _cdir.z;
  return { x: (_proj.x + 1) / 2 * viewport.w, y: (1 - _proj.y) / 2 * viewport.h, facing };
}
const cellDir = i => new THREE.Vector3(state.board.centers[i * 3], state.board.centers[i * 3 + 1], state.board.centers[i * 3 + 2]);

/* ---------------------------------------------------------------- actions */
const PLAY_LABEL = { classic: 'Classic', zen: 'Zen', daily: 'Daily Planet' };
function currentRecordWorld() { return state.play === 'daily' ? state.theme : state.diff; }

/** Count a game that was started (first tap made) but left unfinished. */
function recordAbandon() {
  const g = state.game;
  if (!g || state.recorded || g.status !== 'playing' || !state.touched) return;
  state.recorded = true;
  stats = L.recordGame(stats, { mode: state.play, world: currentRecordWorld(), win: false, dateKey: state.daily && state.daily.key, abandoned: true }).stats;
  saveStats();
}

function startGame(play = state.play, world = state.diff) {
  recordAbandon();
  state.play = play; localStorage.setItem('starfall.play', play);
  if (play !== 'daily') { state.diff = world; localStorage.setItem('starfall.diff', world); }
  state.mode = 'playing';
  state.recorded = false; state.usedFlags = false; state.touched = false; state.result = null;
  closeMixer();
  state.timerRunning = false; state.startTime = 0; state.endTime = 0; state.pausedAt = 0;
  view.ease = null; view.vx = view.vy = 0; view.shake = 0;
  let landing = -1;
  if (play === 'daily') {
    const key = todayKey();
    const size = 'planet', d = DIFFICULTIES[size];
    const board = (state.board && state.board.n === d.freq) ? state.board : buildGoldberg(d.freq);
    const plan = L.dailyPlan(key, board);
    setupBoard(size, plan.theme);
    const { game } = L.dailyGame(key, state.board, d.mines);
    state.game = game; state.daily = plan; landing = plan.landing;
  } else {
    setupBoard(world, world);
    const d = DIFFICULTIES[world];
    state.game = new Game(state.board, d.mines, SEED, { noGuess: settings.noGuess, shields: play === 'zen' ? 3 : 0, timeBudgetMs: 250 });
    state.daily = null;
  }
  tileUniforms.uScan.value = 0;
  $('title').classList.add('out'); setTimeout(() => { if (state.mode !== 'title') $('title').classList.add('hidden'); }, 600);
  $('result').classList.add('hidden');
  $('hud').classList.remove('hidden');
  updateChip();
  $('hint').textContent = hintText();
  $('hint').classList.remove('fade');
  clearTimeout(state.hintTimer); state.hintTimer = setTimeout(() => $('hint').classList.add('fade'), 7000);
  reframe(false);
  if (landing >= 0) {
    // Daily: everyone lands on the same spot. Swing the camera there and open the landing zone.
    const dir = cellDir(landing);
    view.ease = { from: view.q.clone(), to: lookQuat(dir), t0: T(), dur: motionOn() ? 1.1 : 0.01 };
    const t0 = T() + (motionOn() ? 0.8 : 0.1);
    const res = state.game.reveal(landing);
    const dur = applyOpened(res.opened, t0);
    state.startTime = t0 + dur; state.timerRunning = true;
    $('hint').textContent = 'Daily Planet: same world for everyone today. The landing zone is open.';
  }
  updateHud();
}

function toTitle() {
  closeMixer();
  recordAbandon();
  state.mode = 'title'; state.game = null;
  $('hud').classList.add('hidden'); $('result').classList.add('hidden');
  const t = $('title'); t.classList.remove('hidden'); requestAnimationFrame(() => t.classList.remove('out'));
  previewTitleWorld();
  tileUniforms.uScan.value = 1;
  renderTitle();
  requestAnimationFrame(() => reframe(false));
}
function previewTitleWorld() {
  if (state.play === 'daily') { const plan = L.dailyPlan(todayKey(), state.board && state.board.n === 7 ? state.board : buildGoldberg(7)); setupBoard('planet', plan.theme); }
  else setupBoard(state.diff, state.diff);
}

function hintText() {
  if (state.flagMode) return 'Flag mode: tap to flag · hold to reveal';
  if (state.play === 'zen') return 'Zen: 3 shields. A wrong tap cracks a shield, not the world.';
  return 'Tap to reveal · Hold to flag · Drag to spin · Pinch to zoom';
}

function updateChip() {
  const chip = $('chip'), g = state.game;
  if (state.play === 'classic' || !g) { chip.classList.add('hidden'); return; }
  chip.classList.remove('hidden');
  if (state.play === 'daily') {
    $('chip-label').textContent = `Daily #${state.daily.number}`;
    $('shields').innerHTML = '';
  } else {
    $('chip-label').textContent = 'Zen';
    const sv = '<svg viewBox="0 0 24 24"><path d="M12 2.8l7.5 3v5.6c0 4.6-3.1 8.3-7.5 9.8-4.4-1.5-7.5-5.2-7.5-9.8V5.8z"/></svg>';
    const box = $('shields');
    if (box.children.length !== g.maxShields) box.innerHTML = Array.from({ length: g.maxShields }, () => `<span class="sh">${sv}</span>`).join('');
    [...box.children].forEach((el, i) => el.classList.toggle('lost', i >= g.shields));
  }
}

function updateHud() {
  const g = state.game; if (!g) return;
  $('mines').textContent = g.minesLeft;
  let s = 0;
  if (state.timerRunning) s = Math.max(0, (state.pausedAt || T()) - state.startTime); else if (state.endTime) s = state.endTime - state.startTime;
  $('timer').textContent = fmt(s);
}

function applyOpened(opened, t0) {
  if (!opened.length) return 0;
  const g = state.game;
  let maxD = 0; for (const o of opened) if (o.depth > maxD) maxD = o.depth;
  const step = maxD ? THREE.MathUtils.clamp(1.1 / maxD, 0.022, 0.06) : 0;
  const cells = [], times = [];
  for (const o of opened) {
    const tt = t0 + o.depth * step;
    setCell(o.cell, 1, g.adj[o.cell], tt, null);
    cells.push(o.cell); times.push(tt + 0.2);
  }
  emitDebris(cells, times);
  const lead = Math.max(0, t0 - T());
  if (maxD === 0) Sfx.tick(lead, opened.length > 1 ? 2 : 0);
  else { let last = -1; for (let d = 0; d <= maxD; d++) { const tt = d * step; if (last >= 0 && tt - last < 0.028) continue; last = tt; Sfx.tick(lead + tt, d); } }
  Sfx.sweep(opened.length, maxD * step);
  buzz(opened.length > 20 ? [8, 30, 8] : 8);
  return maxD * step;
}

function startTimerIfNeeded(t0) {
  if (!state.timerRunning && !state.endTime) { state.timerRunning = true; state.startTime = t0; $('hint').classList.add('fade'); }
}
function act(cell, alt) {
  const g = state.game;
  if (state.mode !== 'playing' || !g || g.over || cell < 0) return;
  state.touched = true;
  if (g.cell[cell] === 1) { chord(cell); return; }
  const wantFlag = alt !== state.flagMode;   // flag mode swaps tap and hold
  if (wantFlag) { flagCell(cell); return; }
  if (g.flag[cell]) { Sfx.deny(); buzz(20); return; }
  revealCell(cell);
}
function revealCell(cell) {
  const g = state.game; const t0 = T();
  const res = g.reveal(cell);
  if (res.type === 'none') return;
  startTimerIfNeeded(t0);
  handleResult(res, t0);
  if (res.type === 'open' && motionOn() && g.status === 'playing') {
    const s = cellScreen(cell);
    if (s.facing < 0.9) easeToward(cellDir(cell), 0.45);
  }
}
function chord(cell) {
  const g = state.game;
  if (!g.canChord(cell)) {
    if (g.adj[cell] > 0) { tileUniforms.uPress.value = cell; state.pressPulse = T(); }
    return;
  }
  Sfx.chord(); buzz(10);
  handleResult(g.chord(cell), T());
}
function handleResult(res, t0) {
  const g = state.game;
  const dur = applyOpened(res.opened, t0);
  if (res.type === 'boom') {
    if (state.play === 'zen') loseCalm(res.cell, t0 + Math.min(dur, 0.3));
    else lose(res.cell, t0 + Math.min(dur, 0.3));
  } else {
    if (res.type === 'shield') for (const c of res.defused) shieldHit(c, t0);
    if (g.status === 'won') {
      state.timerRunning = false; state.endTime = t0;
      state.pendingWin = t0 + dur + 0.35;
      state.lastCell = res.opened.length ? res.opened[res.opened.length - 1].cell : 0;
    }
  }
  updateHud();
}
function flagCell(cell) {
  const g = state.game;
  if (!g.toggleFlag(cell)) return;
  const on = !!g.flag[cell];
  if (on) state.usedFlags = true;
  setCell(cell, on ? 2 : 0, null, null, T());
  if (on) state.flagTimes.set(cell, T()); else state.flagTimes.delete(cell);
  Sfx.flag(on); buzz(on ? 14 : 8);
  updateHud();
}

/** Zen: a mine was hit but a shield absorbed it. The mine is marked and play continues. */
function shieldHit(cell, t0) {
  const C = state.board.centers; const dir = [C[cell * 3], C[cell * 3 + 1], C[cell * 3 + 2]];
  setCell(cell, 6, 0, null, t0);
  state.flagTimes.delete(cell);
  state.mineList.push({ cell, t: t0, defused: true });
  tileUniforms.uPulse.value.set(dir[0], dir[1], dir[2], t0);
  fireShieldBurst(dir, t0);
  view.shake = 0.03;
  flash(0.22, 600, '#7fd6ff');
  Sfx.shield(); buzz([30, 40, 30]);
  updateChip();
  const box = $('shields'); const lost = box.children[state.game.shields];
  if (lost && motionOn()) { lost.classList.remove('crack'); void lost.offsetWidth; lost.classList.add('crack'); }
  toastMsg(state.game.shields ? `Shield lost · ${state.game.shields} left` : 'Last shield gone · careful now', 'shield');
}

function lose(cell, t0) {
  const g = state.game; const C = state.board.centers;
  state.mode = 'over'; state.timerRunning = false; state.endTime = t0; state.loseT = t0;
  const dir = [C[cell * 3], C[cell * 3 + 1], C[cell * 3 + 2]];
  setCell(cell, 4, 0, null, t0);
  state.mineList.push({ cell, t: t0, exploded: true });
  tileUniforms.uShock.value.set(dir[0], dir[1], dir[2], t0 + 0.05);
  if (motionOn()) {
    fireBoom(dir, t0);
    erupt.visible = true; eruptMat.uniforms.uT0.value = t0;
    erupt.position.set(dir[0], dir[1], dir[2]);
    erupt.quaternion.setFromUnitVectors(_yAxis, new THREE.Vector3(dir[0], dir[1], dir[2]));
    const sc = state.cellR / 0.139; erupt.scale.set(sc, 1, sc);
  }
  view.shake = 0.1; view.vx = view.vy = 0; view.ease = null;
  flash(0.45, 700);
  Sfx.explode(); buzz([60, 40, 120]);
  revealMinesFrom(cell, dir, t0, true);
  finishRecord(false);
  updateHud();
}
/** Zen run end: no explosion; the planet goes quiet and the mines light up in calm blue. */
function loseCalm(cell, t0) {
  const C = state.board.centers;
  state.mode = 'over'; state.timerRunning = false; state.endTime = t0; state.loseT = t0; state.calm = true;
  tileUniforms.uCalm.value = 1;
  const dir = [C[cell * 3], C[cell * 3 + 1], C[cell * 3 + 2]];
  setCell(cell, 3, 0, null, t0);
  state.mineList.push({ cell, t: t0, exploded: false });
  tileUniforms.uPulse.value.set(dir[0], dir[1], dir[2], t0);
  view.vx = view.vy = 0; view.ease = null;
  Sfx.fade(); buzz([40, 60, 40]);
  revealMinesFrom(cell, dir, t0, false);
  finishRecord(false);
  updateHud();
}
function revealMinesFrom(cell, dir, t0, wrongFlags) {
  const g = state.game; const C = state.board.centers;
  const others = [];
  for (let i = 0; i < g.N; i++) {
    if (i === cell) continue;
    if (g.mine[i] && !g.flag[i]) others.push(i);
    if (wrongFlags && !g.mine[i] && g.flag[i]) setCell(i, 5, null, null, t0 + 1.0);
  }
  const dd = i => C[i * 3] * dir[0] + C[i * 3 + 1] * dir[1] + C[i * 3 + 2] * dir[2];
  others.sort((a, b) => dd(b) - dd(a));
  const span = Math.min(2.6, others.length * 0.08);
  others.forEach((m, k) => {
    const tt = t0 + 0.7 + (others.length > 1 ? (k / (others.length - 1)) * span : 0);
    setCell(m, 3, 0, null, tt);
    state.mineList.push({ cell: m, t: tt, exploded: false });
    if (k < 48 || k % 3 === 0) Sfx.mine(tt - T(), k);
  });
  state.overAt = t0 + 0.7 + span + 1.0;
}

function win() {
  const g = state.game; const t0 = T(); const C = state.board.centers;
  state.mode = 'over'; state.winT = t0;
  const c = state.lastCell;
  tileUniforms.uWin.value.set(C[c * 3], C[c * 3 + 1], C[c * 3 + 2], t0);
  aurora.visible = true;
  fireSparkles(t0 + 0.3);
  Sfx.win(); buzz([20, 40, 20, 40, 80]);
  flash(0.25, 1400);
  const dir = new THREE.Vector3(C[c * 3], C[c * 3 + 1], C[c * 3 + 2]);
  for (let m = 0; m < g.N; m++) {
    if (!g.mine[m] || g.flag[m]) continue;
    const ang = Math.acos(THREE.MathUtils.clamp(C[m * 3] * dir.x + C[m * 3 + 1] * dir.y + C[m * 3 + 2] * dir.z, -1, 1));
    const tt = t0 + ang / 1.7;
    g.flag[m] = 1; g.flagCount++;
    setCell(m, 2, null, null, tt); state.flagTimes.set(m, tt);
  }
  beamMat.uniforms.uColor.value.setRGB(0.35, 1.0, 0.6);
  view.distTarget = THREE.MathUtils.clamp(fitDistance(1.22) * 1.05, view.minD, view.maxD);
  finishRecord(true);
  state.overAt = t0 + 3.2;
  updateHud();
}

function finishRecord(won) {
  if (state.recorded) return;
  state.recorded = true;
  const g = state.game;
  const time = state.endTime - state.startTime;
  const today = state.daily ? state.daily.key : todayKey();
  const r = L.recordGame(stats, { mode: state.play, world: currentRecordWorld(), win: won, time, flagsUsed: state.usedFlags,
    shieldsLost: g.maxShields - g.shields, dateKey: today });
  stats = r.stats; saveStats();
  state.result = { win: won, time, isBest: r.isBest, prev: r.prevBest, unlocked: r.unlocked };
  // achievements pop in as the celebration plays
  r.unlocked.forEach((id, k) => setTimeout(() => toastAchievement(id), 1200 + k * 1500));
}

function showResult() {
  const r = state.result; const g = state.game;
  if (!r || !g) return;
  const d = DIFFICULTIES[state.size], W = WORLDS[state.theme];
  const card = $('result').querySelector('.card');
  card.classList.toggle('win', r.win); card.classList.toggle('lose', !r.win); card.classList.toggle('calm', state.calm);
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  const best = $('res-best'); best.classList.remove('newbest');
  const lines = [];
  const winRate = stats.played ? Math.round(stats.wins / stats.played * 100) : 0;
  $('res-again').textContent = state.play === 'daily' ? (r.win ? 'Replay' : 'Try again') : 'Play again';
  if (r.win) {
    $('res-kicker').textContent = state.play === 'daily' ? `Daily Planet #${state.daily.number} cleared` : `${W.name} cleared${state.play === 'zen' ? ' · Zen' : ''}`;
    $('res-title').textContent = 'World saved';
    $('res-sub').textContent = `${d.cells} cells · ${d.mines} mines · ${fmtBest(r.time)}`;
    if (r.isBest) { best.textContent = r.prev != null ? `New best! (was ${fmtBest(r.prev)})` : (state.play === 'daily' ? 'Cleared today!' : 'New best time!'); best.classList.add('newbest'); }
    else best.textContent = `Best ${fmtBest(r.prev)}`;
  } else {
    const safe = g.N - g.mineCount; let rev = 0; for (let i = 0; i < g.N; i++) if (g.cell[i] && !g.mine[i]) rev++;
    if (state.calm) {
      $('res-kicker').textContent = 'Shields depleted';
      $('res-title').textContent = 'Out of shields';
    } else {
      $('res-kicker').textContent = 'Detonation';
      $('res-title').textContent = state.play === 'daily' ? 'Daily Planet lost' : `${DIFFICULTIES[state.diff].name} lost`;
    }
    $('res-sub').textContent = `You cleared ${Math.floor(rev / safe * 100)}% of the ${state.play === 'daily' ? 'Daily Planet' : W.name.toLowerCase()} in ${fmt(state.endTime - state.startTime)}`;
    const b = state.play === 'daily' ? stats.daily.history[state.daily.key] : stats.worlds[state.diff][state.play === 'zen' ? 'zenBest' : 'best'];
    best.textContent = b != null ? `Best ${fmtBest(b)}` : '';
  }
  if (state.play === 'daily') {
    const ds = L.dailyStreakNow(stats, todayKey());
    lines.push(`<span class="pill fire">${ds}-day streak</span>`);
    if (r.win) lines.push('<span class="pill">New planet tomorrow</span>');
  } else {
    lines.push(`<span class="pill fire">Win streak ${stats.streak}</span>`);
    lines.push(`<span class="pill">Win rate ${winRate}%</span>`);
  }
  if (state.play === 'zen') lines.push(`<span class="pill">Shields ${g.shields}/${g.maxShields}</span>`);
  $('res-stats').innerHTML = lines.join('');
  $('result').classList.remove('hidden', 'out');
}

function flash(amount, ms, color = '#fff3e0') {
  if (!motionOn()) amount *= 0.35;
  const f = $('flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = amount;
  requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0; }));
}

/* ---------------------------------------------------------------- toasts */
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 013 0V12M11 11V5a1.5 1.5 0 013 0v6M14 11V6.5a1.5 1.5 0 013 0V14c0 4-2.5 7-6 7-2.6 0-4-1.4-5.4-3.6L4 14.6a1.5 1.5 0 012.5-1.6L8 15"/>',
  bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  ring: '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10" ry="3.4" transform="rotate(-18 12 12)"/>',
  map: '<path d="M3 6l6-2.5 6 2.5 6-2.5v14.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 3.5v14.5M15 6v14.5"/>',
  shield: '<path d="M12 2.8l7.5 3v5.6c0 4.6-3.1 8.3-7.5 9.8-4.4-1.5-7.5-5.2-7.5-9.8V5.8z"/>',
  fire: '<path d="M12 21.5c-3.9 0-6.5-2.7-6.5-6.3 0-3.3 2.3-5.4 3.6-8 .5 1.6 1.4 2.6 2.4 3.1C11.8 6.9 13.2 4 15.5 2.5c-.3 3 2.9 5.1 2.9 9.6 0 5.4-2.8 9.4-6.4 9.4z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 2.8v4M16 2.8v4"/>',
  crown: '<path d="M3.5 8l4.3 4 4.2-7 4.2 7 4.3-4-1.8 11H5.3z"/>',
};
const toastQueue = []; let toastBusy = false;
function pushToast(html, cls) {
  toastQueue.push({ html, cls }); if (!toastBusy) nextToast();
}
function nextToast() {
  const t = toastQueue.shift(); if (!t) { toastBusy = false; return; }
  toastBusy = true;
  const el = document.createElement('div'); el.className = 'toast glass ' + (t.cls || ''); el.innerHTML = t.html;
  $('toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => { el.remove(); nextToast(); }, 450); }, t.cls === 'ach' ? 3200 : 1700);
}
function toastAchievement(id) {
  const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) return;
  state.toastLog.push(id);
  Sfx.achievement(); buzz([15, 30, 15]);
  pushToast(`<div class="badge"><svg viewBox="0 0 24 24">${ICONS[a.icon]}</svg></div><div class="tx"><div class="k">Achievement unlocked</div><div class="n">${a.name}</div><div class="d">${a.desc}</div></div>`, 'ach');
}
function toastMsg(text, icon) {
  pushToast(`<div class="badge small"><svg viewBox="0 0 24 24">${ICONS[icon] || ''}</svg></div><div class="tx"><div class="n">${text}</div></div>`, 'msg');
}

/* ---------------------------------------------------------------- title: modes + world cards */
function renderTitle() {
  for (const b of document.querySelectorAll('#modes button')) b.setAttribute('aria-selected', String(b.dataset.play === state.play));
  const box = $('diffs'); box.innerHTML = ''; box.classList.toggle('single', state.play === 'daily');
  if (state.play === 'daily') {
    const key = todayKey(); const plan = L.dailyPlan(key, { count: DIFFICULTIES.planet.cells });
    const W = WORLDS[plan.theme], done = stats.daily.history[key], streak = L.dailyStreakNow(stats, key);
    const date = new Date(key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const b = document.createElement('div');
    b.className = 'diff daily glass'; b.dataset.diff = 'daily';
    b.innerHTML = `<span class="dot" style="background:${W.dot};box-shadow:0 0 10px ${W.dot}"></span>` +
      `<span class="n">Daily Planet #${plan.number}</span><span class="m">${date} · ${W.flavor} · ${DIFFICULTIES.planet.cells} cells · ${DIFFICULTIES.planet.mines} mines</span>` +
      `<span class="b ${done != null ? '' : 'none'}">${done != null ? '★ Cleared today in ' + fmtBest(done) : 'Not cleared yet today'}</span>` +
      `<span class="streak">${streak}<small>day streak</small></span>`;
    box.appendChild(b);
  } else {
    for (const d of Object.values(DIFFICULTIES)) {
      const W = WORLDS[d.key], w = stats.worlds[d.key];
      const best = state.play === 'zen' ? w.zenBest : w.best;
      const b = document.createElement('button');
      b.className = 'diff glass'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(d.key === state.diff));
      b.dataset.diff = d.key;
      b.innerHTML = `<span class="dot" style="background:${W.dot};box-shadow:0 0 10px ${W.dot}"></span><span class="n">${d.name}</span>` +
        `<span class="m">${W.flavor} · ${d.cells} cells · ${d.mines} mines</span>` +
        `<span class="b ${best != null ? '' : 'none'}">${best != null ? '★ ' + fmtBest(best) : 'No best yet'}</span>`;
      b.addEventListener('click', () => {
        Sfx.ui();
        state.diff = d.key; localStorage.setItem('starfall.diff', d.key);
        setupBoard(d.key, d.key); tileUniforms.uScan.value = 1; reframe(false); renderTitle();
      });
      box.appendChild(b);
    }
  }
  $('howto').innerHTML = {
    classic: 'Cells are hexagons and 12 pentagons: numbers count 6 neighbours (or 5).<br>Tap reveal · Hold flag · Tap a number to chord',
    zen: 'No explosions. You carry 3 shields: a wrong tap cracks one and you play on.',
    daily: 'The same planet for everyone today, no guessing needed. Clear it to grow your streak.',
  }[state.play];
  $('btn-play').textContent = state.play === 'daily' ? (stats.daily.history[todayKey()] != null ? 'Replay today' : 'Land') : 'Launch';
}
for (const b of document.querySelectorAll('#modes button')) {
  b.addEventListener('click', () => {
    Sfx.ui();
    state.play = b.dataset.play; localStorage.setItem('starfall.play', state.play);
    previewTitleWorld(); tileUniforms.uScan.value = 1; renderTitle(); reframe(false);
  });
}

/* ---------------------------------------------------------------- sheets: stats + settings */
function openSheet(title, html, onMount) {
  $('sheet-title').textContent = title; $('sheet-body').innerHTML = html; $('sheet-body').scrollTop = 0;
  const s = $('sheet'); s.classList.remove('hidden'); requestAnimationFrame(() => s.classList.add('in'));
  if (onMount) onMount($('sheet-body'));
}
function closeSheet() { const s = $('sheet'); s.classList.remove('in'); setTimeout(() => s.classList.add('hidden'), 250); renderTitle(); }
$('sheet-close').addEventListener('click', () => { Sfx.ui(); closeSheet(); });
$('sheet').addEventListener('click', e => { if (e.target === $('sheet')) closeSheet(); });

function statsHTML() {
  const s = stats, rate = s.played ? Math.round(s.wins / s.played * 100) : 0, today = todayKey();
  const tile = (v, k) => `<div class="tile"><b>${v}</b><span>${k}</span></div>`;
  const t = v => v != null ? fmtBest(v) : '—';
  const rows = L.WORLD_KEYS.map(k => { const w = s.worlds[k]; return `<tr><td><span class="dot" style="background:${WORLDS[k].dot}"></span>${DIFFICULTIES[k].name}</td><td>${w.wins}/${w.played}</td><td>${t(w.best)}</td><td>${t(w.zenBest)}</td></tr>`; }).join('');
  const got = ACHIEVEMENTS.filter(a => s.achievements[a.id]).length;
  const ach = ACHIEVEMENTS.map(a => `<div class="ach ${s.achievements[a.id] ? 'got' : ''}" data-ach="${a.id}"><div class="badge"><svg viewBox="0 0 24 24">${ICONS[a.icon]}</svg></div><div><b>${a.name}</b><span>${a.desc}</span></div></div>`).join('');
  return `<div class="tiles">${tile(s.played, 'Played')}${tile(s.wins, 'Wins')}${tile(rate + '%', 'Win rate')}${tile(`${s.streak}<small>/${s.bestStreak}</small>`, 'Streak / best')}</div>
    <h4>Best times</h4>
    <table class="best"><thead><tr><th>World</th><th>Won</th><th>Classic</th><th>Zen</th></tr></thead><tbody>${rows}</tbody></table>
    <h4>Daily Planet</h4>
    <div class="tiles">${tile(L.dailyStreakNow(s, today), 'Day streak')}${tile(s.daily.bestStreak, 'Best streak')}${tile(t(s.daily.best), 'Fastest')}${tile(s.daily.history[today] != null ? '✓' : '—', 'Today')}</div>
    <h4>Achievements <small>${got}/${ACHIEVEMENTS.length}</small></h4>
    <div class="achs">${ach}</div>`;
}
$('btn-stats').addEventListener('click', () => { Sfx.ui(); openSheet('Stats', statsHTML()); });

function settingsHTML() {
  const sw = (id, label, sub, on) => `<div class="setting"><div><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</div><button class="switch" role="switch" id="${id}" aria-checked="${on}" aria-label="${label}"><i></i></button></div>`;
  const vib = 'vibrate' in navigator;
  return `<div class="mixer-rows">${mixerHTML('set')}</div>
    ${sw('set-haptics', 'Haptics', vib ? 'Buzz on reveals, flags and hits' : 'Not supported by this browser (iPhone and iPad Safari ignore it)', settings.haptics)}
    ${sw('set-noguess', 'No-guess boards', 'Every board can be solved by logic from the first tap', settings.noGuess)}
    ${sw('set-cb', 'Colour-blind numbers', 'Distinct colours plus dot counts under each number', settings.colorBlind)}
    <div class="cbpreview">${[1, 2, 3, 4, 5, 6].map(i => `<span style="color:${numColors()[i]}">${i}</span>`).join('')}</div>
    ${sw('set-motion', 'Reduced motion', 'Calmer reveals, no shake, flashes or flying debris', settings.reducedMotion)}
    <div class="setting col"><div><b>Hold to flag</b><span id="set-lp-v">${settings.longPress} ms</span></div><input type="range" id="set-lp" min="200" max="800" step="25" value="${settings.longPress}" aria-label="Long-press duration"></div>
    <div class="setting"><div><b>Reset stats</b><span>Clears best times, streaks and achievements</span></div><button class="ghost small" id="set-reset">Reset</button></div>`;
}
/* ---------------------------------------------------------------- sound mixer (title settings + in-game popover) */
function mixerHTML(p) {
  const sw = (id, label, on) => `<button class="switch" role="switch" id="${p}-${id}" aria-checked="${on}" aria-label="${label}"><i></i></button>`;
  const ch = (id, label, sub, onKey, volKey) => `<div class="mix-ch" data-ch="${id}">
      <div class="mix-row"><div><b>${label}</b><span>${sub}</span></div><output id="${p}-${id}-v">${Math.round(settings[volKey] * 100)}%</output>${sw(id + '-on', label, settings[onKey])}</div>
      <input type="range" id="${p}-${id}-vol" min="0" max="100" step="5" value="${Math.round(settings[volKey] * 100)}" aria-label="${label} volume"></div>`;
  return `<div class="mix-row mix-all"><div><b>Mute all</b><span>Silences music and effects</span></div>${sw('muteall', 'Mute all', settings.muteAll)}</div>
    ${ch('music', 'Music', 'Background score', 'musicOn', 'musicVol')}
    ${ch('sfx', 'Sound effects', 'Reveals, flags, blasts, wins, taps', 'sfxOn', 'sfxVol')}`;
}
function syncMixer(root, p) {
  const q = id => root.querySelector(`#${p}-${id}`); if (!q('muteall')) return;
  q('muteall').setAttribute('aria-checked', String(settings.muteAll));
  for (const [id, onKey, volKey] of [['music', 'musicOn', 'musicVol'], ['sfx', 'sfxOn', 'sfxVol']]) {
    const v = Math.round(settings[volKey] * 100);
    q(id + '-on').setAttribute('aria-checked', String(settings[onKey]));
    if (+q(id + '-vol').value !== v) q(id + '-vol').value = v;
    q(id + '-v').textContent = v + '%';
    root.querySelector(`.mix-ch[data-ch="${id}"]`).classList.toggle('silent', settings.muteAll || !settings[onKey] || v === 0);
  }
}
function mountMixer(root, p) {
  const q = id => root.querySelector(`#${p}-${id}`);
  q('muteall').addEventListener('click', () => { settings.muteAll = !settings.muteAll; applySettings(); Sfx.ui(); });
  for (const [id, onKey, volKey] of [['music', 'musicOn', 'musicVol'], ['sfx', 'sfxOn', 'sfxVol']]) {
    q(id + '-on').addEventListener('click', () => { settings[onKey] = !settings[onKey]; if (settings[onKey]) settings.muteAll = false; applySettings(); Sfx.ui(); });
    q(id + '-vol').addEventListener('input', e => {
      settings[volKey] = Math.max(0, Math.min(1, (+e.target.value || 0) / 100));
      if (settings[volKey] > 0) { settings[onKey] = true; settings.muteAll = false; }   // dragging a slider up means "I want to hear this"
      applySettings();
    });
    q(id + '-vol').addEventListener('change', () => { if (id === 'sfx') Sfx.ui(); });   // a preview blip at the new effects level
  }
  syncMixer(root, p);
}
const soundSilent = () => settings.muteAll || ((!settings.musicOn || settings.musicVol === 0) && (!settings.sfxOn || settings.sfxVol === 0));
function applySettings() {
  saveSettings();
  Sfx.setMix({ muteAll: settings.muteAll, musicOn: settings.musicOn, musicVol: settings.musicVol, sfxOn: settings.sfxOn, sfxVol: settings.sfxVol });
  $('btn-sound').classList.toggle('off', soundSilent());
  syncMixer($('mixer'), 'mix'); if (!$('sheet').classList.contains('hidden')) syncMixer($('sheet-body'), 'set');
  tileUniforms.uMotion.value = motionOn() ? 1 : 0;
  document.documentElement.classList.toggle('reduce-motion', !motionOn());
  drawDigitAtlas(digitCanvas, numColors(), settings.colorBlind); digitAtlas.needsUpdate = true;
  numColors().forEach((c, i) => tileUniforms.uNum.value[i].set(c));
}
function mountSettings(body) {
  const bindSwitch = (id, key) => body.querySelector('#' + id).addEventListener('click', e => {
    settings[key] = !settings[key]; e.currentTarget.setAttribute('aria-checked', String(settings[key]));
    applySettings(); Sfx.ui(); if (key === 'haptics') buzz(20);
    if (key === 'colorBlind') body.querySelector('.cbpreview').innerHTML = [1, 2, 3, 4, 5, 6].map(i => `<span style="color:${numColors()[i]}">${i}</span>`).join('');
  });
  mountMixer(body, 'set');
  bindSwitch('set-haptics', 'haptics'); bindSwitch('set-noguess', 'noGuess');
  bindSwitch('set-cb', 'colorBlind'); bindSwitch('set-motion', 'reducedMotion');
  body.querySelector('#set-lp').addEventListener('input', e => { settings.longPress = +e.target.value; body.querySelector('#set-lp-v').textContent = e.target.value + ' ms'; applySettings(); });
  const rb = body.querySelector('#set-reset');
  rb.addEventListener('click', () => {
    if (!rb.classList.contains('confirm')) { rb.classList.add('confirm'); rb.textContent = 'Tap again'; setTimeout(() => { rb.classList.remove('confirm'); rb.textContent = 'Reset'; }, 3000); return; }
    stats = L.emptyStats(); saveStats(); localStorage.removeItem('starfall.best.v1'); rb.textContent = 'Done'; rb.classList.remove('confirm');
  });
}
$('btn-settings').addEventListener('click', () => { Sfx.ui(); openSheet('Settings', settingsHTML(), mountSettings); });

/* ---------------------------------------------------------------- input */
const ring = $('ring'); const ringFill = ring.querySelector('.fill'); const RING_LEN = 163.4;
const pointers = new Map();
let gesture = null; // {mode:'pending'|'drag'|'pinch'|'done', ...}
let lastMoveT = 0;
function hideRing() { ring.classList.remove('show', 'done'); ringFill.style.strokeDashoffset = RING_LEN; tileUniforms.uPress.value = -1; tileUniforms.uPressAmt.value = 0; }
const pinchInfo = (a, b) => ({ d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 });

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  Sfx.unlock();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  view.vx = view.vy = 0; view.ease = null;
  if (pointers.size === 1) {
    const cell = pickCell(e.clientX, e.clientY);
    gesture = { mode: 'pending', id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now(), cell, type: e.pointerType, button: e.button, hist: [] };
    lastMoveT = performance.now();
    if (e.pointerType === 'mouse' && e.button === 2) { act(cell, true); gesture.mode = 'done'; return; }
    if (e.pointerType === 'mouse' && e.button !== 0) { gesture.mode = 'drag'; return; }
    const g = state.game;
    if (state.mode === 'playing' && cell >= 0 && g && g.cell[cell] === 0) {
      gesture.pressable = true;
      gesture.lp = setTimeout(() => {
        if (!gesture || gesture.mode !== 'pending') return;
        gesture.mode = 'done';
        act(gesture.cell, true);
        ring.classList.add('done'); ringFill.style.strokeDashoffset = 0;
        setTimeout(hideRing, 300);
      }, longPressMs());
    }
  } else if (pointers.size === 2) {
    if (gesture && gesture.lp) clearTimeout(gesture.lp);
    hideRing();
    const [a, b] = [...pointers.values()];
    const p = pinchInfo(a, b);
    gesture = { mode: 'pinch', d0: p.d, dist0: view.distTarget, cx: p.cx, cy: p.cy, ang: p.ang };
  }
}, { passive: false });

const _pinchDir = new THREE.Vector3();
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse' && state.mode === 'playing') tileUniforms.uHover.value = pickCell(e.clientX, e.clientY);
    return;
  }
  p.x = e.clientX; p.y = e.clientY;
  if (!gesture) return;
  if (gesture.mode === 'pending') {
    const moved = Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy);
    if (moved > (gesture.type === 'mouse' ? 5 : 10)) { gesture.mode = 'drag'; clearTimeout(gesture.lp); hideRing(); }
  }
  if (gesture.mode === 'drag' && e.pointerId === gesture.id) {
    const dx = e.clientX - gesture.lx, dy = e.clientY - gesture.ly;
    rotateBy(dx, dy);
    const now = performance.now();
    gesture.hist.push({ t: now, dx, dy }); while (gesture.hist.length && now - gesture.hist[0].t > 90) gesture.hist.shift();
    lastMoveT = now; gesture.lx = e.clientX; gesture.ly = e.clientY;
    if (e.pointerType === 'mouse') tileUniforms.uHover.value = -1;
  } else if (gesture.mode === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const q = pinchInfo(a, b);
    const before = view.distTarget;
    view.distTarget = THREE.MathUtils.clamp(1 + (gesture.dist0 - 1) * gesture.d0 / Math.max(q.d, 1), view.minD, view.maxD);
    // zoom toward the fingers: drift the view centre toward the point under the pinch
    if (view.distTarget < before && pickDir(q.cx, q.cy, _pinchDir)) {
      const k = 1 - (view.distTarget - 1) / Math.max(before - 1, 1e-3);
      _cd.set(0, 0, 1).applyQuaternion(view.q);
      _dq.setFromUnitVectors(_cd, _pinchDir);
      view.q.premultiply(new THREE.Quaternion().slerp(_dq, Math.min(0.5, k * 0.9))).normalize();
    }
    rotateBy(q.cx - gesture.cx, q.cy - gesture.cy); gesture.cx = q.cx; gesture.cy = q.cy;
    let da = q.ang - gesture.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) < 0.5) twistBy(da); gesture.ang = q.ang;
  }
}, { passive: true });

function endPointer(e, cancelled) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.mode === 'pending') {
    clearTimeout(gesture.lp); hideRing();
    if (!cancelled && (gesture.type !== 'mouse' || gesture.button === 0)) act(gesture.cell, false);
    gesture.mode = 'done';
  }
  if (gesture.mode === 'drag') {
    // fling: average velocity over the last ~90ms; a pause before release means no inertia
    const now = performance.now(), h = gesture.hist || [];
    if (h.length && now - lastMoveT < 70) {
      const span = Math.max(16, now - h[0].t); let sx = 0, sy = 0; for (const s of h) { sx += s.dx; sy += s.dy; }
      view.vx = sx / span; view.vy = sy / span;
    } else view.vx = view.vy = 0;
  }
  if (gesture.mode === 'pinch') {
    if (pointers.size === 1) { const [id, p] = [...pointers.entries()][0]; gesture = { mode: 'drag', id, lx: p.x, ly: p.y, hist: [] }; }
    view.vx = view.vy = 0;
  }
  if (pointers.size === 0) gesture = null;
}
canvas.addEventListener('pointerup', e => endPointer(e, false));
canvas.addEventListener('pointercancel', e => endPointer(e, true));
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tileUniforms.uHover.value = -1; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const f = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
  view.distTarget = THREE.MathUtils.clamp(1 + (view.distTarget - 1) * f, view.minD, view.maxD);
}, { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || e.target === canvas) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const n = Date.now();
  if (n - lastTouchEnd < 320 && !(e.target.closest && e.target.closest('button, input, .sheet-body, .mixer'))) e.preventDefault();
  lastTouchEnd = n;
}, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('pointerdown', () => Sfx.unlock(), { capture: true });

function setFlagMode(on) {
  state.flagMode = on; $('btn-flag').setAttribute('aria-pressed', String(on));
  $('hint').textContent = hintText();
}
$('btn-flag').addEventListener('click', () => { setFlagMode(!state.flagMode); Sfx.flag(state.flagMode); buzz(8); });
$('btn-restart').addEventListener('click', () => { Sfx.ui(); startGame(state.play, state.diff); });
$('btn-home').addEventListener('click', () => { Sfx.ui(); toTitle(); });
$('btn-play').addEventListener('click', () => { Sfx.ui(); startGame(state.play, state.diff); });
$('res-again').addEventListener('click', () => startGame(state.play, state.diff));
$('res-menu').addEventListener('click', toTitle);
/* in-game sound popover: opens from the HUD speaker, pauses the clock, never ends or resets the game */
const mixerOpen = () => !$('mixer').classList.contains('hidden');
function openMixer() {
  if (mixerOpen()) return;
  if (state.timerRunning && !state.pausedAt) state.pausedAt = T();
  $('mixer').classList.remove('hidden'); requestAnimationFrame(() => $('mixer').classList.add('in'));
  document.documentElement.classList.add('mixer-open');
  $('btn-sound').setAttribute('aria-expanded', 'true');
  syncMixer($('mixer'), 'mix'); updateHud();
  for (const ptr of pointers.keys()) pointers.delete(ptr); gesture = null; hideRing();   // cancel any half-started hold/drag
}
function closeMixer() {
  if (!mixerOpen()) return;
  if (state.pausedAt) { if (state.timerRunning) state.startTime += T() - state.pausedAt; state.pausedAt = 0; }
  $('mixer').classList.remove('in'); $('mixer').classList.add('hidden');
  document.documentElement.classList.remove('mixer-open');
  $('btn-sound').setAttribute('aria-expanded', 'false');
  updateHud();
}
const mixer = $('mixer');
mixer.querySelector('.mixer-rows').innerHTML = mixerHTML('mix');
mountMixer(mixer, 'mix');
$('btn-sound').addEventListener('click', () => { Sfx.ui(); mixerOpen() ? closeMixer() : openMixer(); });
$('mix-close').addEventListener('click', () => { closeMixer(); Sfx.ui(); });
// tap outside the card closes it. Pointer events, not click: iOS Safari doesn't always synthesise a click on a plain div.
let mixerDownOutside = false;
mixer.addEventListener('pointerdown', e => { mixerDownOutside = e.target === mixer; if (mixerDownOutside) e.preventDefault(); });
mixer.addEventListener('pointerup', e => { if (mixerDownOutside && e.target === mixer) closeMixer(); mixerDownOutside = false; });
mixer.addEventListener('pointercancel', () => { mixerDownOutside = false; });
window.addEventListener('keydown', e => {
  if (mixerOpen()) { if (e.key === 'Escape') closeMixer(); return; }
  if (!$('sheet').classList.contains('hidden')) { if (e.key === 'Escape') closeSheet(); return; }
  if (e.key === 'f' || e.key === 'F') setFlagMode(!state.flagMode);
  else if (e.key === 'r' || e.key === 'R') { if (state.mode !== 'title') startGame(state.play, state.diff); }
  else if (e.key === 'Escape') toTitle();
  else if (e.key === 'Enter' && state.mode === 'title') startGame(state.play, state.diff);
});

/* ---------------------------------------------------------------- frame loop */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
const easeOutBack = x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function updateInstances(t) {
  const C = state.board.centers; const base = state.cellR / 0.139;
  let k = 0;
  const lost = state.loseT > 0, won = state.winT > 0;
  for (const [cell, ft] of state.flagTimes) {
    const a = THREE.MathUtils.clamp((t - ft) / 0.32, 0, 1);
    if (a <= 0) continue;
    const s = base * (motionOn() ? easeOutBack(a) : a);
    _n.set(C[cell * 3], C[cell * 3 + 1], C[cell * 3 + 2]);
    _p.copy(_n).multiplyScalar(H_INNER - 0.002);
    _q.setFromUnitVectors(_yAxis, _n).multiply(_q2.setFromAxisAngle(_yAxis, cell * 2.4)); _s.set(s, s, s);
    _m4.compose(_p, _q, _s);
    for (const m of BEACONS) m.setMatrixAt(k, _m4);
    const wrong = lost && state.game && !state.game.mine[cell];
    const pulse = 0.85 + 0.25 * Math.sin(t * 4 + cell * 1.3);
    if (wrong) { orbs.instanceColor.setXYZ(k, 0.35, 0.35, 0.5); bases.instanceColor.setXYZ(k, 0.2, 0.2, 0.3); pennants.instanceColor.setXYZ(k, 0.3, 0.3, 0.38); }
    else if (won) { orbs.instanceColor.setXYZ(k, 1.2 * pulse, 3.2 * pulse, 1.8 * pulse); bases.instanceColor.setXYZ(k, 0.5, 2.0, 1.2); pennants.instanceColor.setXYZ(k, 0.5, 2.2, 1.1); }
    else { orbs.instanceColor.setXYZ(k, 3.6 * pulse, 1.5 * pulse, 0.5 * pulse); bases.instanceColor.setXYZ(k, 2.2 * pulse, 0.6 * pulse, 0.15); pennants.instanceColor.setXYZ(k, 2.6, 0.75, 0.18); }
    k++;
  }
  for (const m of BEACONS) { m.count = k; m.instanceMatrix.needsUpdate = true; }
  orbs.instanceColor.needsUpdate = true; bases.instanceColor.needsUpdate = true; pennants.instanceColor.needsUpdate = true;
  let j = 0;
  for (const mi of state.mineList) {
    const a = THREE.MathUtils.clamp((t - mi.t) / 0.45, 0, 1);
    if (a <= 0) continue;
    const cell = mi.cell;
    _n.set(C[cell * 3], C[cell * 3 + 1], C[cell * 3 + 2]);
    _p.copy(_n).multiplyScalar(H_INNER + 0.012 * base);
    _q.setFromUnitVectors(_yAxis, _n).multiply(_q2.setFromAxisAngle(_yAxis, t * 0.8 + cell));
    const s = base * easeOutBack(a) * (mi.exploded ? 1.25 : 1.0);
    _s.set(s, s, s); _m4.compose(_p, _q, _s); mines3d.setMatrixAt(j, _m4);
    const fl = 0.8 + 0.3 * Math.sin(t * 9 + cell);
    if (mi.exploded) mines3d.instanceColor.setXYZ(j, 3.0 * fl, 1.0 * fl, 0.3 * fl);
    else if (mi.defused || state.calm) mines3d.instanceColor.setXYZ(j, 0.4 * fl, 1.6 * fl, 3.0 * fl);
    else mines3d.instanceColor.setXYZ(j, 3.2 * fl, 0.45 * fl, 0.12 * fl);
    j++;
  }
  mines3d.count = j; mines3d.instanceMatrix.needsUpdate = true; mines3d.instanceColor.needsUpdate = true;
}

const _mp = new THREE.Vector3();
function updateMoonlet(t) {
  if (!moonlet.visible) return;
  const o = moonOrbit, a = o.phase + t * o.speed * (motionOn() ? 1 : 0.3);
  _mp.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r).applyAxisAngle(_xAxis, o.incl).applyAxisAngle(_yAxis, 0.6);
  moonlet.position.copy(_mp); moonlet.scale.setScalar(o.size);
  // fade the moon while it passes in front of the board so it never hides cells
  _cd.copy(camera.position).normalize();
  const along = _mp.dot(_cd), perp = Math.sqrt(Math.max(0, _mp.lengthSq() - along * along));
  const camD = camera.position.length();
  const front = along > 0 && perp * camD / Math.max(camD - along, 0.1) < 1.1 + o.size * 2;
  o.alpha += ((front ? 0.22 : 1) - o.alpha) * 0.12;
  moonletMat.uniforms.uAlpha.value = o.alpha;
}

let lastT = T(), fpsAcc = 0, fpsFrames = 0, fps = 60;
// A render error must never kill the loop silently: log it once, and if no frame has ever drawn, offer the reload.
let frameOk = 0, frameErr = 0;
function frame() {
  requestAnimationFrame(frame);
  try { frameBody(); frameOk++; } catch (e) {
    if (frameErr++ === 0) console.error('STARFALL frame error', e);
    if (!frameOk && frameErr === 20 && window.__starfallFatal) window.__starfallFatal('Render error: ' + (e && e.message || e), false);
  }
}
function frameBody() {
  const t = T(); const dt = Math.min(0.05, t - lastT); lastT = t;
  fpsAcc += dt; fpsFrames++; if (fpsAcc > 1) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
  timeU.value = t; stars.material.uniforms.uTime.value = t;
  if (!gesture || gesture.mode !== 'drag') {
    if (Math.abs(view.vx) + Math.abs(view.vy) > 0.002) {
      rotateBy(view.vx * dt * 1000, view.vy * dt * 1000);
      const d = Math.exp(-dt * 3.2); view.vx *= d; view.vy *= d;
    } else if (!view.ease && (state.mode === 'title' || state.winT > 0)) {
      view.q.multiply(_tq.setFromAxisAngle(_yAxis, dt * (state.winT > 0 ? 0.12 : 0.09) * (motionOn() ? 1 : 0.4))).normalize();
    }
  }
  if (gesture && gesture.mode === 'pending' && gesture.pressable) {
    const el = performance.now() - gesture.t0; const a = Math.min(1, el / longPressMs());
    if (el > 90) {
      ring.style.left = gesture.sx + 'px'; ring.style.top = gesture.sy + 'px';
      ring.classList.add('show'); ringFill.style.strokeDashoffset = RING_LEN * (1 - a);
      tileUniforms.uPress.value = gesture.cell; tileUniforms.uPressAmt.value = a;
    }
  } else if (state.pressPulse) {
    const a = 1 - (t - state.pressPulse) / 0.25;
    if (a <= 0) { state.pressPulse = 0; tileUniforms.uPress.value = -1; tileUniforms.uPressAmt.value = 0; } else tileUniforms.uPressAmt.value = a * 0.8;
  }
  if (state.pendingWin && t >= state.pendingWin) { state.pendingWin = null; win(); }
  if (state.mode === 'over' && state.overAt && t >= state.overAt) { state.overAt = 0; showResult(); }
  if (state.timerRunning) updateHud();
  const atmo = atmoUniforms.uColor.value;
  let bloomTarget = 0.75;
  if (state.loseT > 0 && state.calm) {
    const a = t - state.loseT;
    atmo.lerpColors(baseAtmo, CALM_ATMO, Math.min(1, Math.max(0, a) / 1.5));
    atmoUniforms.uBoost.value = 1 + 0.4 * Math.exp(-Math.max(0, a));
  } else if (state.loseT > 0) {
    const a = t - state.loseT;
    atmo.lerpColors(baseAtmo, LOSE_ATMO, Math.min(1, Math.max(0, a) / 0.8));
    tileUniforms.uLose.value = Math.min(0.35, Math.max(0, a) * 0.2);
    bloomTarget = 0.9 + (motionOn() ? 1.3 : 0.4) * Math.exp(-Math.max(0, a) * 2.2);
    atmoUniforms.uBoost.value = 1 + 1.2 * Math.exp(-Math.max(0, a) * 1.2);
    if (a > 2.5) erupt.visible = false;
  } else if (state.winT > 0) {
    const a = t - state.winT;
    atmo.lerpColors(baseAtmo, WIN_ATMO, Math.min(1, a / 1.5));
    auroraMat.uniforms.uFade.value = Math.min(1, Math.max(0, (a - 0.6) / 1.8));
    coreMat.uniforms.uWinAmt.value = Math.min(0.5, a * 0.25);
    bloomTarget = 0.85 + 0.35 * Math.exp(-a * 1.2);
    atmoUniforms.uBoost.value = 1.1 + 0.4 * Math.exp(-a);
    aurora.rotation.y = t * 0.15;
  } else { atmo.copy(baseAtmo); atmoUniforms.uBoost.value = 1; }
  bloom.strength += (bloomTarget - bloom.strength) * Math.min(1, dt * 6);
  if (state.board) updateInstances(t);
  if (state.stateDirty) { state.stateTex.needsUpdate = true; state.stateDirty = false; }
  sky.rotation.y = t * 0.004;
  applyCamera(dt);
  updateMoonlet(t);
  composer.render(dt);
}

/* ---------------------------------------------------------------- debug hook (?debug) */
if (DEBUG) {
  window.SF = {
    get state() { return state; }, get fps() { return fps; }, get view() { return view; }, get settings() { return settings; }, get stats() { return stats; },
    get free() { return { ...free }; }, get camera() { return camera; },
    /** audio graph: channel gain values, SFX/music sources created so far, pad voices alive */
    audio: () => Sfx.debug(), openMixer, closeMixer, mixerOpen, elapsed: () => { const g = state; return g.timerRunning ? (g.pausedAt || T()) - g.startTime : 0; },
    start: (d = 'planet', play = 'classic') => startGame(play, d), title: toTitle,
    screenOf: i => cellScreen(i), pick: (x, y) => pickCell(x, y),
    settled: () => !view.ease && Math.abs(view.dist - view.distTarget) < 0.01 && Math.abs(view.vx) + Math.abs(view.vy) < 0.002,
    cellPx: () => cellPxAt(view.dist),
    /** on-screen bounding box of the planet's tile shell (radius 1.04) */
    planetRect() {
      const c = new THREE.Vector3(0, 0, 0).project(camera); const cam = camera.position.length(); const ang = Math.asin(Math.min(1, 1.04 / cam));
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2); const rpx = Math.tan(ang) / t * (viewport.h / 2);
      const cx = (c.x + 1) / 2 * viewport.w, cy = (1 - c.y) / 2 * viewport.h;
      return { cx, cy, r: rpx, top: cy - rpx, bottom: cy + rpx, left: cx - rpx, right: cx + rpx };
    },
    info() {
      const g = state.game;
      return g && { status: g.status, mode: state.mode, play: state.play, world: state.diff, theme: state.theme, revealed: g.revealedCount, flags: g.flagCount, mines: g.mineCount, N: g.N,
        minesLeft: g.minesLeft, flagMode: state.flagMode, resultShown: !$('result').classList.contains('hidden'), shields: g.shields, maxShields: g.maxShields,
        mistakes: g.mistakes, solvable: g.gen ? g.gen.solvable : null, genMs: g.gen ? g.gen.ms : null, daily: state.daily && { key: state.daily.key, landing: state.daily.landing, number: state.daily.number } };
    },
    /** on-screen, camera-facing cells inside the HUD-free area, filtered: hidden | safe | mine | number */
    visibleCells(filter = 'hidden') {
      const g = state.game; const out = [];
      for (let i = 0; i < state.board.count; i++) {
        const s = cellScreen(i); if (s.facing < 0.6) continue;
        if (s.x < 30 || s.y < free.top + 20 || s.x > viewport.w - 30 || s.y > free.bottom - 20) continue;
        if (s.x > viewport.w - 110 && s.y > viewport.h - 120) continue;   // under the flag button
        const hidden = g.cell[i] === 0 && !g.flag[i];
        if (filter === 'hidden' && !hidden) continue;
        if (filter === 'safe' && !(hidden && g.minesPlaced && !g.mine[i])) continue;
        if (filter === 'mine' && !(hidden && g.mine[i])) continue;
        if (filter === 'number' && !(g.cell[i] === 1 && g.adj[i] > 0)) continue;
        if (pickCell(s.x, s.y) !== i) continue;
        out.push({ i, x: s.x, y: s.y, f: s.facing });
      }
      return out.sort((a, b) => b.f - a.f);
    },
    /** reveal every safe cell except one visible one (returned) so a real tap can finish the win */
    almostWin() {
      const g = state.game; const cand = this.visibleCells('safe'); const keep = cand.length ? cand[0].i : -1;
      const t0 = T(); let k = 0;
      state.touched = true;
      for (let i = 0; i < g.N; i++) {
        if (g.flag[i] && !g.mine[i]) { g.flag[i] = 0; g.flagCount--; state.flagTimes.delete(i); }
        if (!g.mine[i] && g.cell[i] === 0 && i !== keep) { g.cell[i] = 1; g.revealedCount++; setCell(i, 1, g.adj[i], t0 + (k++ % 40) * 0.01, null); }
      }
      updateHud();
      return keep;
    },
    forceWin() { const k = this.almostWin(); if (k >= 0) revealCell(k); },
  };
}

/* ---------------------------------------------------------------- boot */
applySettings();
resize();
previewTitleWorld();
renderTitle();
reframe(true);
view.dist = defaultDist() * 1.7;
requestAnimationFrame(frame);
// Hide the spinner after the first frame, with a timer fallback: rAF can be paused (page opened in the background,
// iOS app switcher), and the spinner must never stay up once the game has booted.
let appShown = false;
function showApp() { if (appShown) return; appShown = true; $('loading').classList.add('out'); reframe(false); }
requestAnimationFrame(() => setTimeout(showApp, 300));
setTimeout(showApp, 2500);
window.__starfallIdle = () => state.mode !== 'playing';   // lets index.html apply a waiting update only between games
if (window.__starfallBooted) window.__starfallBooted();
