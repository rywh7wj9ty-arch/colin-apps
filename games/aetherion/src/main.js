/* Aetherion: Skybound Realms. Rendering, input, UI, audio. Build __BUILD__ */
(function () {
'use strict';
const A = window.AE, T = window.THREE;
const $ = id => document.getElementById(id);
const SAVE_KEY = 'aetherion-save-v1', SET_KEY = 'aetherion-settings-v1';
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const isMobile = isTouch && Math.min(screen.width, screen.height) < 900;
const defaults = { music: 0.6, sfx: 0.8, quality: isMobile ? (Math.min(screen.width, screen.height) < 500 ? 'low' : 'medium') : 'high', daylight: false, sens: 1, invertY: false };
let settings = Object.assign({}, defaults);
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) {} };
if (isTouch) document.body.classList.add('touch');
const QUAL = { low: { dpr: 1.25, shadow: 0, far: 300, grass: 0, particles: 500, aa: false, trees: 0.55 }, medium: { dpr: 1.6, shadow: 1024, far: 420, grass: 1400, particles: 1100, aa: false, trees: 0.8 }, high: { dpr: 2, shadow: 2048, far: 560, grass: 3600, particles: 2200, aa: true, trees: 1 } };
let Qs = QUAL[settings.quality] || QUAL.medium;

// ---------- renderer ----------
const canvas = $('c');
let renderer;
try { renderer = new T.WebGLRenderer({ canvas, antialias: Qs.aa, powerPreference: 'high-performance' }); }
catch (e) { window.__bootErr('WebGL is not available: ' + e.message); return; }
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = Qs.shadow > 0; renderer.shadowMap.type = T.PCFSoftShadowMap;
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(60, 1, 0.2, Qs.far);
let dynScale = 1;
function resize() {
  const r = $('game').getBoundingClientRect();
  const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, Qs.dpr, 2) * dynScale);
  renderer.setPixelRatio(dpr); renderer.setSize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)), false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.fov = camera.aspect < 0.8 ? 72 : 60; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------- toon helpers ----------
const gradTex = (() => { const d = new Uint8Array([90, 160, 215, 255]); const t = new T.DataTexture(d, 4, 1, T.RedFormat); t.minFilter = t.magFilter = T.NearestFilter; t.needsUpdate = true; return t; })();
const toon = (color, o = {}) => new T.MeshToonMaterial(Object.assign({ color, gradientMap: gradTex }, o));
const glowMat = (color, op = 1) => new T.MeshBasicMaterial({ color, transparent: op < 1, opacity: op, depthWrite: op >= 1, blending: op < 1 ? T.AdditiveBlending : T.NormalBlending, fog: true });
const C = (h) => new T.Color(h);
function canvasTex(w, h, draw, repeat) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; } return t; }
const glowTex = canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
function glowSprite(color, size, op = 0.9) { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending })); s.scale.set(size, size, 1); return s; }

// ---------- sky ----------
const skyUniforms = { top: { value: C('#4aa6ea') }, mid: { value: C('#9fd6f2') }, bot: { value: C('#f4e9d6') }, sunDir: { value: new T.Vector3(0, 1, 0) }, sunCol: { value: C('#fff3c4') }, night: { value: 0 }, t: { value: 0 }, aurora: { value: 0 } };
const sky = new T.Mesh(new T.SphereGeometry(Qs.far * 0.8, 32, 20), new T.ShaderMaterial({
  uniforms: skyUniforms, side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform vec3 top,mid,bot,sunDir,sunCol; uniform float night,t,aurora; varying vec3 vP;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
  void main(){ float y=vP.y; vec3 c = y>0.? mix(mid,top,pow(clamp(y,0.,1.),0.7)) : mix(mid,bot,clamp(-y*3.,0.,1.));
    float sd = max(dot(vP,sunDir),0.); c += sunCol*(pow(sd,600.)*2.5+pow(sd,12.)*.35+pow(sd,3.)*.12);
    vec3 md = -sunDir; float m = max(dot(vP,md),0.); c += vec3(.85,.9,1.)*(pow(m,900.)*1.6+pow(m,40.)*.18)*night;
    if(night>0.01 && y>0.){ vec2 sp = vec2(atan(vP.z,vP.x)*90., y*140.); float s = step(.992, h(floor(sp))); c += vec3(s)*night*smoothstep(0.,.3,y)*(.6+.4*sin(t*3.+h(floor(sp))*30.)); }
    float cl = n2(vec2(atan(vP.z,vP.x)*6.+t*.02, y*14.))*n2(vec2(atan(vP.z,vP.x)*13.-t*.03, y*30.)); c = mix(c, mix(vec3(1.),sunCol,.25)*(1.-night*.45), smoothstep(.35,.7,cl)*smoothstep(-.05,.25,y)*smoothstep(.7,.2,y)*.55);
    if(aurora>0. && y>0.05){ float a = n2(vec2(atan(vP.z,vP.x)*4.+t*.15, y*3.)); float band = smoothstep(.15,.0,abs(y-.35-a*.25)); c += mix(vec3(.2,1.,.7),vec3(.7,.4,1.),a)*band*aurora*1.2; }
    gl_FragColor = vec4(c,1.); }`
}));
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
scene.fog = new T.Fog(C('#bfe3f5'), 80, Qs.far * 0.92);
const hemi = new T.HemisphereLight(C('#dff3ff'), C('#8c9a6a'), 1.25); scene.add(hemi);
const sun = new T.DirectionalLight(C('#fff2d6'), 2.1); scene.add(sun); scene.add(sun.target);
const amb = new T.AmbientLight(C('#ffffff'), 0.35); scene.add(amb);
if (Qs.shadow) { sun.castShadow = true; sun.shadow.mapSize.set(Qs.shadow, Qs.shadow); const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; }
// cloud sea between the sky realm and the Hollows
const cloudMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, fog: false, uniforms: { t: { value: 0 }, col: { value: C('#ffffff') }, shade: { value: C('#c7d9ee') }, camY: { value: 0 } },
  vertexShader: 'varying vec2 vU; varying vec3 vW; void main(){ vU = position.xy; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader: `uniform float t,camY; uniform vec3 col,shade; varying vec2 vU; varying vec3 vW;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
  float fb(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n2(p);p*=2.03;a*=.5;}return v;}
  void main(){ vec2 p = vW.xz*.012 + vec2(t*.01,t*.006); float d = fb(p); float d2 = fb(p*2.3+3.);
    float a = smoothstep(.38,.72,d*.75+d2*.4); float r = length(vW.xz); a *= smoothstep(900.,500.,r);
    float below = step(vW.y, camY); a *= mix(1., .55, 1.-below);
    vec3 c = mix(shade, col, smoothstep(.4,.9,d2));
    gl_FragColor = vec4(c, a*.92); }` });
const clouds = new T.Mesh(new T.PlaneGeometry(1800, 1800, 1, 1), cloudMat); clouds.rotation.x = -Math.PI / 2; clouds.position.y = -42; clouds.renderOrder = 2; scene.add(clouds);
const clouds2 = clouds.clone(); clouds2.position.y = -48; clouds2.material = cloudMat.clone(); clouds2.material.uniforms = { t: { value: 50 }, col: { value: C('#eef6ff') }, shade: { value: C('#b8cbe2') }, camY: cloudMat.uniforms.camY }; scene.add(clouds2);

// ---------- world building ----------
let G = A.createGame();
const W0 = () => G.W;
const PAL = {
  verdant: { g1: '#6cc653', g2: '#a6dd5e', r1: '#c79a6b', r2: '#9a7a5e', lip: '#5aa845' },
  plateau: { g1: '#d6c461', g2: '#a9c858', r1: '#d2ae7c', r2: '#a8845d', lip: '#b9b252' },
  peaks: { g1: '#8fd4c0', g2: '#b8e6d4', r1: '#a3acd0', r2: '#7c86b0', lip: '#7fc4b1', snow: '#eaf3ff' },
  ruins: { g1: '#86b98a', g2: '#a8cf9a', r1: '#a6a7bb', r2: '#7f8399', lip: '#76a77a' },
  hollows: { g1: '#2f7f95', g2: '#4b9fa8', r1: '#4a5f8f', r2: '#36487a', lip: '#4fb0a3' },
  sunken: { g1: '#86d39c', g2: '#c5e89c', r1: '#bba585', r2: '#93806a', lip: '#7cc48c' },
  shrine: { g1: '#f1f2f7', g2: '#e4e8f2', r1: '#c9c0b0', r2: '#9a9284', lip: '#e9ecf5' },
};
const islandMeshes = [];
const tmpC = new T.Color(), tmpC2 = new T.Color();
function buildIsland(I) {
  const pal = I.shrine ? PAL.shrine : PAL[I.biome];
  const big = I.r > 100, NR = big ? 34 : Math.max(8, Math.round(I.r / 2.2)), NS = big ? 110 : Math.max(24, Math.round(I.r * 1.5)), NK = I.flat ? 5 : 9;
  const pos = [], col = [], idx = [];
  const g1 = C(pal.g1), g2 = C(pal.g2), r1 = C(pal.r1), r2 = C(pal.r2), lip = C(pal.lip);
  const R = []; for (let j = 0; j < NS; j++) { const a = j / NS * Math.PI * 2; R.push(A.islandRadius(I, I.x + Math.cos(a) * I.r, I.z + Math.sin(a) * I.r)); }
  pos.push(I.x, A.islandTop(I, I.x, I.z), I.z); { const n = A.fbm(I.x * .1, I.z * .1, 3) * .5 + .5; tmpC.copy(g1).lerp(g2, n); col.push(tmpC.r, tmpC.g, tmpC.b); }
  for (let i = 1; i <= NR; i++) for (let j = 0; j < NS; j++) {
    const a = j / NS * Math.PI * 2, rr = R[j] * (i / NR) * (i === NR ? 0.999 : 1);
    const x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr, y = A.islandTop(I, x, z);
    pos.push(x, y, z);
    const n = A.fbm(x * 0.08, z * 0.08, I.seed) * 0.5 + 0.5;
    tmpC.copy(g1).lerp(g2, n);
    if (I.biome === 'peaks' && !I.shrine) { const hh = y - I.y; if (hh > 9) tmpC.lerp(C(pal.snow), Math.min(1, (hh - 9) / 3)); else if (n > 0.72) tmpC.lerp(r1, 0.5); }
    if (I.biome === 'hollows' && !I.shrine) { const gl = A.fbm(x * 0.03, z * 0.03, 77); if (gl > 0.2) tmpC.lerp(C('#7ff2d6'), Math.min(0.85, (gl - 0.2) * 2.2)); const gl2 = A.fbm(x * 0.05 + 9, z * 0.05, 31); if (gl2 > 0.35) tmpC.lerp(C('#c8a6ff'), Math.min(0.6, (gl2 - 0.35) * 2)); }
    if (I.shrine) { const d = Math.hypot(x - I.x, z - I.z); if (Math.abs(d - I.r * 0.72) < 0.5 || Math.abs(d - I.r * 0.3) < 0.35) tmpC.set('#ffd98a'); }
    if (I.lake) { const ld = Math.hypot(x - I.lake.x, z - I.lake.z) / I.lake.r; if (ld < 1.15) tmpC.lerp(C('#e2d29a'), 0.7); }
    if (i === NR) tmpC.lerp(lip, 0.5);
    col.push(tmpC.r, tmpC.g, tmpC.b);
  }
  const ring = i => 1 + (i - 1) * NS;
  for (let j = 0; j < NS; j++) idx.push(0, ring(1) + (j + 1) % NS, ring(1) + j);
  for (let i = 1; i < NR; i++) for (let j = 0; j < NS; j++) { const a = ring(i) + j, b = ring(i) + (j + 1) % NS, c = ring(i + 1) + j, d = ring(i + 1) + (j + 1) % NS; idx.push(a, b, d, a, d, c); }
  // underside
  const edgeStart = ring(NR); let prev = edgeStart; const base = pos.length / 3;
  for (let k = 1; k <= NK; k++) {
    const f = k / NK;
    for (let j = 0; j < NS; j++) {
      const a = j / NS * Math.PI * 2; const jag = 1 + 0.18 * A.noise2(j * 0.7, k * 1.3, I.seed);
      const rr = R[j] * Math.max(0.04, (1 - Math.pow(f, I.flat ? 0.9 : 1.35) * 0.97)) * (k < 2 ? 1.02 : jag);
      const ex = I.x + Math.cos(a) * R[j], ez = I.z + Math.sin(a) * R[j];
      const ey = A.islandTop(I, ex, ez);
      const y = ey - (k === 1 ? 0.9 : 0) - I.thick * Math.pow(f, 1.15) * (0.85 + 0.3 * (A.noise2(j * 0.4, 7, I.seed) * 0.5 + 0.5));
      pos.push(I.x + Math.cos(a) * rr, y, I.z + Math.sin(a) * rr);
      const band = Math.sin(y * 0.9 + A.noise2(j * 0.3, k, 2) * 2) * 0.5 + 0.5;
      tmpC.copy(r1).lerp(r2, band * 0.8 + f * 0.3); if (k === 1) tmpC.lerp(lip, 0.6);
      if (I.biome === 'hollows' && !I.shrine) tmpC.lerp(C('#6fdcd0'), 0.15 * band);
      col.push(tmpC.r, tmpC.g, tmpC.b);
    }
    const cur = base + (k - 1) * NS;
    for (let j = 0; j < NS; j++) { const a = prev + j, b = prev + (j + 1) % NS, c = cur + j, d = cur + (j + 1) % NS; idx.push(a, c, d, a, d, b); }
    prev = cur;
  }
  const tip = pos.length / 3; pos.push(I.x, I.y - I.thick * 1.25, I.z); col.push(r2.r, r2.g, r2.b);
  for (let j = 0; j < NS; j++) idx.push(prev + j, tip, prev + (j + 1) % NS);
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const mat = toon(0xffffff, { vertexColors: true });
  const m = new T.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = !big && Qs.shadow > 0; m.userData.island = I; m.userData.y0 = I.y;
  scene.add(m); islandMeshes.push(m);
  return m;
}
for (const I of G.W.islands) buildIsland(I);
const sunkenMesh = islandMeshes.find(m => m.userData.island === G.W.sunken);
const sunkenGroup = new T.Group(); scene.add(sunkenGroup); // decorations that ride with the Sunken Isle

// rng for decoration
const R = A.rng(1234);
const nearFeature = (x, z) => {
  const W = G.W; if (Math.hypot(x - 0, z - 8) < 9) return true;
  for (const B of W.boxes) if (Math.abs(x - B.x) < B.hx + B.hz + 2.5 && Math.abs(z - B.z) < B.hx + B.hz + 2.5) return true;
  for (const w of W.waters) if (Math.hypot(x - w.x, z - w.z) < w.r + 2.5) return true;
  for (const j of W.journals) if (Math.hypot(x - j.pos.x, z - j.pos.z) < 3) return true;
  for (const n of W.nodes) if (Math.hypot(x - n.pos.x, z - n.pos.z) < 2) return true;
  for (const c of W.cores) if (Math.hypot(x - c.pos.x, z - c.pos.z) < 3) return true;
  for (const u of W.updrafts) if (Math.hypot(x - u.x, z - u.z) < u.r + 2) return true;
  if (Math.hypot(x - 40, z + 3) < 0 ) return true;
  return false;
};
// --- trees (instanced) ---
const treeSpecs = [];
function scatter(I, n, fn) { for (let k = 0; k < n; k++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * I.r * 0.86; const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d; if (d > A.islandRadius(I, x, z) - 2.5 || nearFeature(x, z)) continue; const y = A.islandTop(I, x, z); fn(x, y, z); } }
const byName = n => G.W.islands.find(i => i.name === n);
const dens = Qs.trees;
scatter(byName('Verdant Reach'), 120 * dens, (x, y, z) => treeSpecs.push({ kind: 'round', x, y, z, s: 0.8 + R() * 0.8, c: ['#4fb54a', '#72c94c', '#3fa65a', '#8fd65a'][R() * 4 | 0] }));
scatter(byName('Mossback Isle'), 26 * dens, (x, y, z) => treeSpecs.push({ kind: 'round', x, y, z, s: 0.8 + R() * 0.6, c: ['#5cc160', '#9ad65a'][R() * 2 | 0] }));
scatter(byName('Galewind Plateau'), 40 * dens, (x, y, z) => treeSpecs.push({ kind: 'wind', x, y, z, s: 0.8 + R() * 0.6, c: ['#a9c44f', '#c9c95a', '#8fbf54'][R() * 3 | 0] }));
scatter(byName('Kite Spur'), 8, (x, y, z) => treeSpecs.push({ kind: 'wind', x, y, z, s: 0.8, c: '#b9c957' }));
scatter(byName('Prism Peaks'), 60 * dens, (x, y, z) => { if (y - 38 < 9) treeSpecs.push({ kind: 'pine', x, y, z, s: 0.8 + R() * 0.7, c: ['#3d9f8a', '#4fb59a', '#2f8f80'][R() * 3 | 0] }); });
scatter(byName('Tempest Ruins'), 24 * dens, (x, y, z) => treeSpecs.push({ kind: R() < 0.5 ? 'dead' : 'round', x, y, z, s: 0.7 + R() * 0.5, c: '#6fa77a' }));
scatter(byName('Lumen Hollows'), 160 * dens, (x, y, z) => treeSpecs.push({ kind: 'shroom', x, y, z, s: 0.8 + R() * 1.8, c: ['#6ff7e4', '#ff9ee6', '#a4a1ff', '#8ff79a'][R() * 4 | 0] }));
scatter(G.W.sunken, 24, (x, y, z) => treeSpecs.push({ kind: 'blossom', x, y, z, s: 0.9 + R() * 0.6, c: ['#ffb3d1', '#ffd1e6', '#ffc6a8'][R() * 3 | 0], sunken: true }));
const trunkGeo = new T.CylinderGeometry(0.18, 0.32, 1, 6); trunkGeo.translate(0, 0.5, 0);
const blobGeo = new T.IcosahedronGeometry(1, 1);
const coneGeo = new T.ConeGeometry(1, 1.6, 7); coneGeo.translate(0, 0.8, 0);
const capGeo = new T.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
function instanced(geo, mat, list, setter, opts = {}) {
  if (!list.length) return null;
  const im = new T.InstancedMesh(geo, mat, list.length); const m4 = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3();
  list.forEach((it, i) => { setter(it, p, q, s); m4.compose(p, q, s); im.setMatrixAt(i, m4); if (it._c) im.setColorAt(i, tmpC.set(it._c)); });
  im.castShadow = !!opts.shadow && Qs.shadow > 0; im.receiveShadow = true; (opts.parent || scene).add(im); return im;
}
const trunkMat = toon(0xffffff), leafMat = toon(0xffffff), shroomCapMat = new T.MeshBasicMaterial({ color: 0xffffff }), stemMat = toon('#eef4ff', { emissive: C('#4a6a8a'), emissiveIntensity: 0.4 });
const yq = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
function treeParts(list) {
  const trunks = [], blobs = [], cones = [], caps = [], stems = [];
  for (const t of list) {
    const lean = t.kind === 'wind' ? 0.35 : 0;
    if (t.kind === 'round' || t.kind === 'wind' || t.kind === 'blossom') {
      trunks.push({ x: t.x, y: t.y - 0.2, z: t.z, sx: t.s, sy: 3.2 * t.s, lean, _c: '#8a5f3c' });
      const n = 3; for (let k = 0; k < n; k++) { const a = k * 2.1 + t.x; blobs.push({ x: t.x + Math.cos(a) * 0.9 * t.s + lean * 2.4 * t.s, y: t.y + (3.2 + (k === 0 ? 0.9 : 0.1)) * t.s, z: t.z + Math.sin(a) * 0.9 * t.s, s: (k === 0 ? 1.7 : 1.3) * t.s, sy: t.kind === 'wind' ? 0.6 : 0.9, _c: tmpC2.set(t.c).offsetHSL(0, 0, (k - 1) * 0.04).getStyle() }); }
    } else if (t.kind === 'pine') {
      trunks.push({ x: t.x, y: t.y - 0.2, z: t.z, sx: t.s * 0.8, sy: 1.6 * t.s, lean: 0, _c: '#6b4b34' });
      for (let k = 0; k < 3; k++) cones.push({ x: t.x, y: t.y + (1.2 + k * 1.3) * t.s, z: t.z, s: (1.9 - k * 0.5) * t.s, _c: t.c });
    } else if (t.kind === 'dead') trunks.push({ x: t.x, y: t.y - 0.2, z: t.z, sx: t.s * 0.9, sy: 3.6 * t.s, lean: 0.25, _c: '#7d6a5a' });
    else if (t.kind === 'shroom') { stems.push({ x: t.x, y: t.y - 0.2, z: t.z, sx: t.s * 0.9, sy: 2.4 * t.s, lean: 0, _c: '#eaf2ff' }); caps.push({ x: t.x, y: t.y + 2.2 * t.s, z: t.z, s: 1.5 * t.s, _c: t.c }); }
  }
  const setT = (it, p, q, s) => { p.set(it.x, it.y, it.z); q.setFromAxisAngle(new T.Vector3(1, 0, 0.3).normalize(), it.lean || 0); s.set(it.sx, it.sy, it.sx); };
  const setB = (it, p, q, s) => { p.set(it.x, it.y, it.z); q.setFromAxisAngle(up, it.x); s.set(it.s, it.s * (it.sy || 1), it.s); };
  return [instanced(trunkGeo, trunkMat, trunks, setT, { shadow: true }), instanced(blobGeo, leafMat, blobs, setB, { shadow: true }), instanced(coneGeo, leafMat, cones, setB, { shadow: true }), instanced(capGeo, shroomCapMat, caps, setB), instanced(trunkGeo, stemMat, stems, setT)];
}
treeParts(treeSpecs.filter(t => !t.sunken));
const sunkenTrees = treeParts(treeSpecs.filter(t => t.sunken)); sunkenTrees.forEach(m => { if (m) { scene.remove(m); sunkenGroup.add(m); } });
// grass with wind sway
const grassUniform = { value: 0 };
if (Qs.grass) {
  const bg = new T.BufferGeometry(); const gp = []; for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3, c = Math.cos(a) * 0.18, s = Math.sin(a) * 0.18; gp.push(-c, 0, -s, c, 0, s, 0, 0.7, 0); } bg.setAttribute('position', new T.Float32BufferAttribute(gp, 3)); bg.computeVertexNormals();
  const gm = toon(0xffffff, { side: T.DoubleSide });
  gm.onBeforeCompile = sh => { sh.uniforms.uT = grassUniform; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.); float sw = sin(uT*1.7 + ip.x*.35 + ip.z*.27)*.18 + sin(uT*3.1+ip.z)*.05; transformed.x += sw*position.y; transformed.z += sw*.6*position.y;'); };
  const blades = [];
  const grassOn = [['Verdant Reach', 0.55, '#7bd35a'], ['Mossback Isle', 0.12, '#93da5e'], ['Galewind Plateau', 0.25, '#d8cf6a'], ['Tempest Ruins', 0.08, '#9fcf8f']];
  for (const [n, frac, c] of grassOn) scatter(byName(n), Qs.grass * frac, (x, y, z) => blades.push({ x, y, z, s: 0.7 + R() * 0.8, _c: tmpC2.set(c).offsetHSL(0, 0, (R() - 0.5) * 0.12).getStyle() }));
  instanced(bg, gm, blades, (it, p, q, s) => { p.set(it.x, it.y - 0.05, it.z); q.setFromAxisAngle(up, it.x * 3); s.set(it.s, it.s, it.s); });
}
// crystals
const crystalGeo = new T.OctahedronGeometry(1, 0); crystalGeo.scale(0.5, 1.6, 0.5);
const crystalMat = new T.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, emissive: C('#3fb7d9'), emissiveIntensity: 0.55, transparent: true, opacity: 0.92 });
const crystals = [];
scatter(byName('Prism Peaks'), 70 * dens, (x, y, z) => crystals.push({ x, y, z, s: 0.5 + R() * 1.2, _c: ['#9ff3ff', '#c9b6ff', '#ffc4f2'][R() * 3 | 0] }));
scatter(byName('Lumen Hollows'), 110 * dens, (x, y, z) => crystals.push({ x, y, z, s: 0.6 + R() * 2.4, _c: ['#7ff7e6', '#c7a6ff', '#9fd0ff'][R() * 3 | 0] }));
instanced(crystalGeo, crystalMat, crystals, (it, p, q, s) => { p.set(it.x, it.y + it.s * 0.6, it.z); q.setFromEuler(new T.Euler((it.x % 1) * 0.6, it.z, (it.z % 1) * 0.5)); s.set(it.s, it.s, it.s); });
// glowing flora (small emissive bulbs)
const bulbs = [];
scatter(byName('Lumen Hollows'), 260 * dens, (x, y, z) => bulbs.push({ x, y, z, s: 0.15 + R() * 0.25, _c: ['#aaffe9', '#ffc7f3', '#fff3a8'][R() * 3 | 0] }));
scatter(byName('Verdant Reach'), 60 * dens, (x, y, z) => bulbs.push({ x, y, z, s: 0.12 + R() * 0.12, _c: ['#fff6a8', '#ffffff', '#ffc4e1', '#c4d8ff'][R() * 4 | 0] }));
scatter(G.W.sunken, 40, (x, y, z) => bulbs.push({ x, y, z, s: 0.15, _c: '#fff3b8', sunken: true }));
const bulbGeo = new T.IcosahedronGeometry(1, 0);
instanced(bulbGeo, new T.MeshBasicMaterial({ color: 0xffffff }), bulbs.filter(b => !b.sunken), (it, p, q, s) => { p.set(it.x, it.y + it.s + 0.15, it.z); q.identity(); s.setScalar(it.s); });
instanced(bulbGeo, new T.MeshBasicMaterial({ color: 0xffffff }), bulbs.filter(b => b.sunken), (it, p, q, s) => { p.set(it.x, it.y + it.s + 0.15, it.z); q.identity(); s.setScalar(it.s); }, { parent: sunkenGroup });

// ---------- structures ----------
const runeTex = canvasTex(128, 128, (g, w) => { g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, w, w); g.strokeStyle = '#3fd9c0'; g.lineWidth = 5; g.lineCap = 'round'; const rr = A.rng(9); for (let k = 0; k < 7; k++) { g.beginPath(); const x = 20 + rr() * 88, y = 20 + rr() * 88; g.moveTo(x, y); g.lineTo(x + (rr() - 0.5) * 50, y + (rr() - 0.5) * 50); g.stroke(); } g.strokeRect(8, 8, w - 16, w - 16); });
const stoneTex = canvasTex(128, 128, (g, w) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w); const rr = A.rng(4); for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(80,90,110,${rr() * 0.12})`; g.fillRect(rr() * w, rr() * w, 2 + rr() * 8, 2 + rr() * 8); } g.strokeStyle = 'rgba(70,80,100,.25)'; g.lineWidth = 2; for (let y = 0; y < w; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 32 % 2) * 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } } }, true);
const crackTex = canvasTex(128, 128, (g, w) => { g.fillStyle = '#b9a58a'; g.fillRect(0, 0, w, w); g.strokeStyle = '#4a3a2a'; g.lineWidth = 3; const rr = A.rng(12); for (let k = 0; k < 6; k++) { g.beginPath(); let x = w / 2, y = w / 2; g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (rr() - 0.5) * 40; y += (rr() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); } g.fillStyle = 'rgba(255,220,120,.6)'; g.beginPath(); g.arc(w / 2, w / 2, 6, 0, 7); g.fill(); });
const matRuin = toon('#d9d6cc', { map: stoneTex }), matSmooth = toon('#f6f7fb', { map: runeTex, emissive: C('#2a6f68'), emissiveIntensity: 0.12 }), matTower = toon('#e8e2d2', { map: stoneTex }), matCave = toon('#a89a88', { map: stoneTex }), matSeal = toon('#ffffff', { map: crackTex }), matGold = toon('#ffd36b', { emissive: C('#7a5200'), emissiveIntensity: 0.35 });
const boxMeshes = [];
for (const B of G.W.boxes) {
  const mat = { ruin: matRuin, smooth: matSmooth, tower: matTower, towertop: matGold, cave: matCave, seal: matSeal, curb: matGold, road: matRuin }[B.kind] || matRuin;
  const geo = new T.BoxGeometry(B.hx * 2, B.hy * 2, B.hz * 2);
  if (mat.map) { const uv = geo.attributes.uv; const p = geo.attributes.position; for (let i = 0; i < uv.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const nx = Math.abs(geo.attributes.normal.getX(i)), ny = Math.abs(geo.attributes.normal.getY(i)); uv.setXY(i, (nx > 0.5 ? z : x) / 2.5, (ny > 0.5 ? z : y) / 2.5); } }
  const m = new T.Mesh(geo, mat); m.position.set(B.x, B.y, B.z); m.rotation.y = B.yaw; m.castShadow = Qs.shadow > 0; m.receiveShadow = true; scene.add(m); B.mesh = m; boxMeshes.push(m);
  if (B.kind === 'ruin' && B.hy > 1.5) { const moss = new T.Mesh(new T.BoxGeometry(B.hx * 2 + 0.1, 0.25, B.hz * 2 + 0.1), toon('#7cc46a')); moss.position.y = B.hy; m.add(moss); }
}
// caves: dress the chambers as rocky mounds
for (const Cv of G.W.caves) { const rr = A.rng(Cv.x | 0); for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2 + 0.3; if (Math.abs(Math.sin(a)) > 0.75 && Math.sin(a) > 0) continue; const m = new T.Mesh(new T.DodecahedronGeometry(1.6 + rr() * 1.2, 0), toon(['#b8a993', '#a39784', '#c4b8a2'][k % 3])); m.position.set(Cv.x + Math.cos(a) * 3.6, Cv.y + 1.5 + rr() * 3, Cv.z + Math.sin(a) * 3.4 - 0.5); m.rotation.set(rr() * 3, rr() * 3, 0); m.castShadow = Qs.shadow > 0; scene.add(m); } const top = new T.Mesh(new T.DodecahedronGeometry(3.4, 1), toon('#b3a690')); top.scale.set(1.2, 0.6, 1.1); top.position.set(Cv.x, Cv.y + 6, Cv.z - 0.4); scene.add(top); const moss = new T.Mesh(new T.DodecahedronGeometry(3.3, 1), toon('#7cc46a')); moss.scale.set(1.15, 0.35, 1.05); moss.position.set(Cv.x, Cv.y + 7.2, Cv.z - 0.4); scene.add(moss); const gl = glowSprite('#ffd66b', 5, 0.5); gl.position.set(Cv.x, Cv.y + 1.5, Cv.z); scene.add(gl); }
// towers: decorative rings, rune strips, beacon
const towerFx = [];
for (const Tw of G.W.towers) {
  const g = new T.Group(); scene.add(g);
  for (let k = 0; k < 4; k++) { const ring = new T.Mesh(new T.BoxGeometry(4.9, 0.35, 4.9), matGold); ring.position.set(Tw.x, Tw.base + 3 + k * (Tw.h - 4) / 3, Tw.z); g.add(ring); }
  const strip = new T.Mesh(new T.BoxGeometry(0.25, Tw.h - 2, 4.45), new T.MeshBasicMaterial({ color: '#7ff5dc' })); strip.position.set(Tw.x, Tw.base + Tw.h / 2, Tw.z); g.add(strip);
  const strip2 = strip.clone(); strip2.rotation.y = Math.PI / 2; g.add(strip2);
  const gem = new T.Mesh(new T.OctahedronGeometry(1.1, 0), new T.MeshToonMaterial({ color: '#c9fff2', gradientMap: gradTex, emissive: C('#2fbf9f'), emissiveIntensity: 0.6 }));
  gem.position.set(Tw.x, Tw.top.y + 2.2, Tw.z); g.add(gem);
  const glow = glowSprite('#7ff5dc', 6, 0.7); glow.position.copy(gem.position); g.add(glow);
  const beam = new T.Mesh(new T.CylinderGeometry(0.9, 1.6, 400, 12, 1, true), new T.MeshBasicMaterial({ color: '#9ffbe6', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
  beam.position.set(Tw.x, Tw.top.y + 204, Tw.z); g.add(beam);
  towerFx.push({ Tw, gem, glow, beam, strip, strip2 });
}
// shrines
const shrineFx = [];
const altarMat = toon('#f4f1ea', { map: runeTex });
for (const S of G.W.shrines) {
  const g = new T.Group(); scene.add(g); const fx = { S, g };
  const ped = new T.Mesh(new T.CylinderGeometry(1.1, 1.4, 1.0, 8), altarMat); ped.position.set(S.altar.x, S.altar.y + 0.5, S.altar.z); g.add(ped);
  // arch gate
  for (const sx of [-1, 1]) { const p = new T.Mesh(new T.BoxGeometry(0.7, 5, 0.7), matSmooth); p.position.set(S.x + sx * 3, S.y + 2.5, S.z - 12); g.add(p); }
  const lint = new T.Mesh(new T.BoxGeometry(7.6, 0.7, 1), matGold); lint.position.set(S.x, S.y + 5.2, S.z - 12); g.add(lint);
  const ringG = new T.Mesh(new T.TorusGeometry(1.1, 0.08, 6, 32), new T.MeshBasicMaterial({ color: '#7ff5dc' })); ringG.rotation.x = Math.PI / 2; ringG.position.set(S.altar.x, S.altar.y + 1.02, S.altar.z); g.add(ringG); fx.ring = ringG;
  if (S.plate) { const pl = new T.Mesh(new T.CylinderGeometry(S.plate.r, S.plate.r + 0.2, 0.12, 24), new T.MeshBasicMaterial({ color: '#ffd36b' })); pl.position.set(S.plate.x, S.plate.y + 0.06, S.plate.z); g.add(pl); fx.plate = pl; }
  if (S.ring) { const rr = new T.Mesh(new T.RingGeometry(0.3, S.ring.r, 24), new T.MeshBasicMaterial({ color: '#ffd36b', side: T.DoubleSide })); rr.rotation.x = -Math.PI / 2; rr.position.set(S.ring.x, S.ring.y + 0.03, S.ring.z); g.add(rr); fx.plate = rr; }
  if (S.bell) { const bell = new T.Mesh(new T.CylinderGeometry(0.55, 1.4, 1.8, 16, 1, true), toon('#ffcf5a', { side: T.DoubleSide, emissive: C('#6a4300'), emissiveIntensity: 0.3 })); bell.position.copy(S.bell); bell.position.y += 0.6; g.add(bell); fx.bell = bell; }
  if (S.halo) { const h = new T.Mesh(new T.TorusGeometry(S.haloR, 0.22, 8, 40), new T.MeshBasicMaterial({ color: '#ffd36b' })); h.rotation.x = Math.PI / 2; h.position.copy(S.halo); g.add(h); const gs = glowSprite('#ffe9a8', 9, 0.5); gs.position.copy(S.halo); g.add(gs); fx.halo = h; }
  if (S.target && S.kind === 'bridge') { const goalP = new T.Mesh(new T.CylinderGeometry(1.2, 1.4, 0.2, 16), new T.MeshBasicMaterial({ color: '#ffd36b' })); goalP.position.set(S.target.x, S.target.y + 0.1, S.target.z); g.add(goalP); fx.plate = goalP; }
  if (S.target && (S.kind === 'stack' || S.kind === 'lift')) { const goalP = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 0.15, 16), new T.MeshBasicMaterial({ color: '#ffd36b' })); goalP.position.set(S.target.x, S.target.y + 0.08, S.target.z); g.add(goalP); fx.plate = goalP; }
  shrineFx.push(fx);
}
// journals (rune stones)
const journalMat = toon('#e9e4d6', { map: runeTex, emissive: C('#1d6d63'), emissiveIntensity: 0.25 });
for (const J of G.W.journals) { const m = new T.Mesh(new T.BoxGeometry(0.9, 1.7, 0.35), journalMat); m.position.set(J.pos.x, J.pos.y + 0.8, J.pos.z); m.rotation.y = J.pos.x; m.castShadow = Qs.shadow > 0; scene.add(m); const gs = glowSprite('#9ffbe6', 1.6, 0.6); gs.position.set(0, 1.2, 0); m.add(gs); }
// water
const waterMat = new T.ShaderMaterial({ transparent: true, side: T.DoubleSide, uniforms: { t: { value: 0 }, col: { value: C('#5fd0f0') }, deep: { value: C('#2f96d6') } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader: 'uniform float t; uniform vec3 col,deep; varying vec3 vW; void main(){ float r = sin(vW.x*1.3+t*1.6)*sin(vW.z*1.1-t*1.3)+sin((vW.x+vW.z)*.7+t); vec3 c = mix(deep,col,.55+.25*r); c += vec3(1.)*smoothstep(1.2,1.9,r)*.35; gl_FragColor = vec4(c,.84); }' });
for (const w of G.W.waters) { const m = new T.Mesh(new T.CircleGeometry(w.r * 1.05, 40), waterMat); m.rotation.x = -Math.PI / 2; m.position.set(w.x, w.y, w.z); if (w.biome === 'hollows') { m.material = waterMat.clone(); m.material.uniforms.col.value = C('#7ff7e0'); m.material.uniforms.deep.value = C('#2a9fb0'); } scene.add(m); }
// waterfalls
const fallTex = canvasTex(64, 256, (g, w, h) => { g.fillStyle = 'rgba(255,255,255,0)'; g.clearRect(0, 0, w, h); for (let k = 0; k < 90; k++) { const x = Math.random() * w, y = Math.random() * h, l = 20 + Math.random() * 60; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + Math.random() * 4, l); } }, true);
const falls = [];
function addFall(x, y, z, ang, h, wdt, parent, tint = '#bfeeff') {
  const tex = fallTex.clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(wdt / 3, h / 18);
  const m = new T.Mesh(new T.PlaneGeometry(wdt, h, 1, 1), new T.MeshBasicMaterial({ map: tex, color: tint, transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));
  m.position.set(x, y - h / 2, z); m.rotation.y = ang; (parent || scene).add(m);
  const back = new T.Mesh(new T.PlaneGeometry(wdt * 0.9, h, 1, 1), new T.MeshBasicMaterial({ color: '#7fd3f0', transparent: true, opacity: 0.45, depthWrite: false, side: T.DoubleSide })); back.position.copy(m.position); back.rotation.y = ang; back.translateZ(-0.2); (parent || scene).add(back);
  falls.push({ tex, x, y, z, h });
}
{ // Verdant river + falls
  const I = G.W.islands[0]; const pts = []; for (let k = 0; k <= 12; k++) { const f = k / 12; const x = 27 + f * 26, z = 9 - f * 12; pts.push([x, A.islandTop(I, x, z) + 0.12, z]); }
  const rg = new T.BufferGeometry(); const rp = []; for (let k = 0; k < pts.length - 1; k++) { const [x0, y0, z0] = pts[k], [x1, y1, z1] = pts[k + 1]; const nx = -(z1 - z0), nz = x1 - x0; const l = Math.hypot(nx, nz); const ox = nx / l * 1.6, oz = nz / l * 1.6; rp.push(x0 - ox, y0, z0 - oz, x0 + ox, y0, z0 + oz, x1 + ox, y1, z1 + oz, x0 - ox, y0, z0 - oz, x1 + ox, y1, z1 + oz, x1 - ox, y1, z1 - oz); }
  rg.setAttribute('position', new T.Float32BufferAttribute(rp, 3)); rg.computeVertexNormals(); const river = new T.Mesh(rg, waterMat); river.material.side = T.DoubleSide; scene.add(river);
  const last = pts[pts.length - 1]; addFall(last[0] + 0.6, last[1], last[2], Math.PI / 2 + Math.atan2(12, 26) , 70, 3.4);
  addFall(-60, 7.2, 73, 0.4, 40, 2.4); addFall(-24, 38.4, -214, 0.1, 60, 3, null, '#dff7ff');
  addFall(G.W.sunken.x + 26, G.W.sunken.y0 + 3, G.W.sunken.z + 8, Math.PI / 2, 60, 4, sunkenGroup);
}
// updraft columns
const draftMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { t: { value: 0 }, op: { value: 0.35 } },
  vertexShader: 'varying vec2 vU; varying float vY; void main(){ vU = uv; vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform float t,op; varying vec2 vU; void main(){ float s = fract(vU.x*6. + vU.y*3. - t*.5); float l = smoothstep(.0,.15,s)*smoothstep(.4,.15,s); float e = smoothstep(0.,.08,vU.y)*smoothstep(1.,.85,vU.y); gl_FragColor = vec4(vec3(.85,1.,.97)*l*e*op, 1.); }' });
const draftMeshes = [];
function addDraft(u, parent) { const h = u.y1 - u.y0; const m = new T.Mesh(new T.CylinderGeometry(u.r * 0.8, u.r, h, 18, 1, true), draftMat); m.position.set(u.x, u.y0 + h / 2, u.z); (parent || scene).add(m); draftMeshes.push({ m, u }); return m; }
for (const u of G.W.updrafts) addDraft(u);
const bigDraftMesh = addDraft(G.W.bigDraft); bigDraftMesh.visible = false;
// crumbling tiles
const crumbleMat = toon('#e3d2b0', { map: crackTex }), solidTileMat = toon('#d9d6cc', { map: stoneTex });
const crumbleMeshes = G.W.crumbles.map(Cb => { const m = new T.Mesh(new T.BoxGeometry(3, Cb.h, 3), Cb.crumble ? crumbleMat : solidTileMat); m.position.set(Cb.x, Cb.y - Cb.h / 2, Cb.z); m.castShadow = Qs.shadow > 0; m.receiveShadow = true; scene.add(m); return m; });
// rings
const ringMeshes = G.W.rings.map(r => { const m = new T.Mesh(new T.TorusGeometry(r.r, 0.2, 8, 40), new T.MeshBasicMaterial({ color: '#ffd36b' })); m.position.set(r.x, r.y, r.z); m.lookAt(r.x + 4, r.y - 2.2, r.z + 9); scene.add(m); return m; });
// cores
const coreGeo = new T.OctahedronGeometry(0.55, 0); coreGeo.scale(1, 1.35, 1);
const coreMat = new T.MeshToonMaterial({ color: '#ffe17a', gradientMap: gradTex, emissive: C('#ff9a1f'), emissiveIntensity: 0.6 });
const coreMeshes = G.W.cores.map(c => { const g = new T.Group(); const m = new T.Mesh(coreGeo, coreMat); g.add(m); const s = glowSprite('#ffd66b', 3.4, 0.85); g.add(s); const beam = new T.Mesh(new T.CylinderGeometry(0.08, 0.35, 60, 8, 1, true), new T.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, fog: false })); beam.position.y = 30; g.add(beam); g.position.set(c.pos.x, c.pos.y, c.pos.z); scene.add(g); return { c, g, m, beam }; });
// resource nodes
const nodeMeshes = G.W.nodes.map(n => {
  let m;
  if (n.type === 'ore') { m = new T.Mesh(new T.DodecahedronGeometry(0.8, 0), toon('#a8a39a')); const fl = new T.Mesh(new T.OctahedronGeometry(0.25, 0), matGold); fl.position.set(0.3, 0.4, 0.4); m.add(fl); m.position.set(n.pos.x, n.pos.y + 0.5, n.pos.z); }
  else if (n.type === 'bush') { m = new T.Group(); for (let k = 0; k < 3; k++) { const b = new T.Mesh(blobGeo, toon(['#4fb54a', '#6ec95a', '#3d9f50'][k])); b.scale.setScalar(0.55); b.position.set(Math.cos(k * 2.1) * 0.4, 0.45, Math.sin(k * 2.1) * 0.4); m.add(b); } const berry = new T.Mesh(bulbGeo, new T.MeshBasicMaterial({ color: '#ff6f8f' })); berry.scale.setScalar(0.12); berry.position.set(0.3, 0.8, 0.3); m.add(berry); m.position.set(n.pos.x, n.pos.y, n.pos.z); }
  else { m = new T.Group(); for (let k = 0; k < 4; k++) { const c = new T.Mesh(crystalGeo, new T.MeshToonMaterial({ color: '#b8f6ff', gradientMap: gradTex, emissive: C('#38b6d8'), emissiveIntensity: 0.7 })); c.scale.setScalar(0.35 + k * 0.08); c.position.set(Math.cos(k * 1.7) * 0.35, 0.5, Math.sin(k * 1.7) * 0.35); c.rotation.z = (k - 1.5) * 0.3; m.add(c); } m.position.set(n.pos.x, n.pos.y, n.pos.z); }
  m.traverse(o => { if (o.isMesh) o.castShadow = Qs.shadow > 0; }); scene.add(m); return m;
});

// ---------- player model ----------
const player = new T.Group(); scene.add(player);
const pm = { tunic: toon('#33b3a6'), trim: toon('#ffd36b'), skin: toon('#ffd7b5'), hair: toon('#5a3a2a'), dark: toon('#3b4a66'), scarf: toon('#ff7a59'), wood: toon('#a8744a'),
  hand: new T.MeshToonMaterial({ color: '#c8fff1', gradientMap: gradTex, emissive: C('#29d9b0'), emissiveIntensity: 0.4 }), glider: toon('#fff1d6', { side: T.DoubleSide }), glider2: toon('#ff8a5c', { side: T.DoubleSide }) };
const P3 = {};
{
  const body = new T.Mesh(new T.CylinderGeometry(0.28, 0.42, 0.85, 10), pm.tunic); body.position.y = 0.95; player.add(body);
  const belt = new T.Mesh(new T.CylinderGeometry(0.36, 0.38, 0.1, 10), pm.trim); belt.position.y = 0.78; player.add(belt);
  const head = new T.Mesh(new T.SphereGeometry(0.3, 14, 10), pm.skin); head.position.y = 1.58; player.add(head); P3.head = head;
  const hair = new T.Mesh(new T.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), pm.hair); hair.position.y = 1.62; hair.rotation.x = -0.25; player.add(hair);
  const tuft = new T.Mesh(new T.ConeGeometry(0.12, 0.35, 6), pm.hair); tuft.position.set(0, 1.72, 0.28); tuft.rotation.x = 1.9; player.add(tuft);
  for (const sx of [-1, 1]) { const eye = new T.Mesh(new T.SphereGeometry(0.045, 6, 6), pm.dark); eye.position.set(sx * 0.11, 1.6, -0.27); player.add(eye); }
  const scarf = new T.Mesh(new T.BoxGeometry(0.16, 0.05, 0.9), pm.scarf); scarf.geometry.translate(0, 0, 0.45); scarf.position.set(0.1, 1.33, 0.18); player.add(scarf); P3.scarf = scarf;
  const collar = new T.Mesh(new T.TorusGeometry(0.24, 0.07, 6, 14), pm.scarf); collar.rotation.x = Math.PI / 2; collar.position.y = 1.36; player.add(collar);
  const mkLimb = (r, l, mat) => { const g = new T.Group(); const m = new T.Mesh(new T.CylinderGeometry(r, r * 0.85, l, 7), mat); m.position.y = -l / 2; g.add(m); return g; };
  P3.legL = mkLimb(0.11, 0.6, pm.dark); P3.legL.position.set(-0.14, 0.6, 0); player.add(P3.legL);
  P3.legR = mkLimb(0.11, 0.6, pm.dark); P3.legR.position.set(0.14, 0.6, 0); player.add(P3.legR);
  P3.armL = mkLimb(0.08, 0.55, pm.tunic); P3.armL.position.set(-0.38, 1.3, 0); player.add(P3.armL);
  const hand = new T.Mesh(new T.SphereGeometry(0.11, 8, 6), pm.hand); hand.position.y = -0.58; P3.armL.add(hand); P3.hand = hand;
  const handGlow = glowSprite('#6ff7d0', 1.0, 0); handGlow.position.y = -0.58; P3.armL.add(handGlow); P3.handGlow = handGlow;
  P3.armR = mkLimb(0.08, 0.55, pm.tunic); P3.armR.position.set(0.38, 1.3, 0); player.add(P3.armR);
  const staff = new T.Group(); const shaft = new T.Mesh(new T.CylinderGeometry(0.045, 0.055, 1.5, 6), pm.wood); shaft.position.y = 0.3; staff.add(shaft); staff.position.y = -0.55; staff.rotation.x = -1.3; P3.armR.add(staff); P3.staff = staff;
  P3.tips = { rock: new T.Mesh(new T.DodecahedronGeometry(0.2, 0), toon('#a8a39a')), leaf: new T.Mesh(new T.ConeGeometry(0.28, 0.6, 4), toon('#5cc160')), crystal: new T.Mesh(new T.OctahedronGeometry(0.2, 0), new T.MeshToonMaterial({ color: '#b8f6ff', gradientMap: gradTex, emissive: C('#38b6d8'), emissiveIntensity: 0.8 })) };
  for (const k in P3.tips) { P3.tips[k].position.y = 1.08; P3.tips[k].visible = false; staff.add(P3.tips[k]); }
  P3.tips.leaf.scale.set(1, 1, 0.25);
  const glider = new T.Group(); const wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute([0, 0, -0.3, -1.6, -0.15, 0.35, 0, 0.12, 0.45, 0, 0, -0.3, 0, 0.12, 0.45, 1.6, -0.15, 0.35], 3)); wg.computeVertexNormals();
  const wing = new T.Mesh(wg, pm.glider); glider.add(wing); const stripe = new T.Mesh(wg, pm.glider2); stripe.scale.set(0.45, 1.02, 1); stripe.position.y = 0.01; glider.add(stripe);
  const pole = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 1.0, 5), pm.wood); pole.position.set(0, -0.5, 0.05); glider.add(pole);
  glider.position.y = 2.4; glider.visible = false; player.add(glider); P3.glider = glider;
  player.traverse(o => { if (o.isMesh) o.castShadow = Qs.shadow > 0; });
  const shadowBlob = new T.Mesh(new T.CircleGeometry(0.5, 16), new T.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false })); shadowBlob.rotation.x = -Math.PI / 2; scene.add(shadowBlob); P3.blob = shadowBlob;
}
// ---------- enemies ----------
const enMat = { body: toon('#8a7fb0'), mask: toon('#efe2c4', { map: runeTex }), eye: new T.MeshBasicMaterial({ color: '#ffd84a' }), foot: toon('#5f567f') };
const enemyMeshes = G.W.enemies.map(e => {
  const g = new T.Group(); const b = new T.Mesh(new T.SphereGeometry(0.55, 14, 10), enMat.body); b.scale.set(1, 0.85, 1); b.position.y = 0.55; g.add(b);
  const mask = new T.Mesh(new T.BoxGeometry(0.7, 0.55, 0.15), enMat.mask); mask.position.set(0, 0.62, -0.48); g.add(mask);
  for (const sx of [-1, 1]) { const eye = new T.Mesh(new T.SphereGeometry(0.07, 6, 6), enMat.eye); eye.position.set(sx * 0.15, 0.68, -0.57); g.add(eye); const f = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), enMat.foot); f.position.set(sx * 0.25, 0.1, 0); g.add(f); }
  const horn = new T.Mesh(new T.ConeGeometry(0.12, 0.4, 6), enMat.mask); horn.position.y = 1.1; g.add(horn);
  g.traverse(o => { if (o.isMesh) o.castShadow = Qs.shadow > 0; }); scene.add(g); return g;
});
// ---------- part meshes ----------
const partMat = {
  wood: toon('#cf9356'), woodDark: toon('#a8703c'), bark: toon('#8a5a3a'), logEnd: toon('#e8c08a'), stone: toon('#cfcabf', { map: stoneTex }), crate: toon('#e0ad6a'),
  fan: toon('#e9f6f4'), fanBlade: toon('#4fd0b8'), dark: toon('#3b4a66'), gold: matGold, balloon: toon('#ff6f7d'), balloon2: toon('#fff2e2'), rocket: toon('#f2f0ea'), rocketRed: toon('#ff5f57'),
  spring: toon('#7ddc6a'), orb: new T.MeshToonMaterial({ color: '#e9f3ff', gradientMap: gradTex, map: runeTex, emissive: C('#2aa894'), emissiveIntensity: 0.25 }), urn: toon('#f3e6c8', { emissive: C('#6a4a10'), emissiveIntensity: 0.15 }),
};
const auraMat = new T.MeshBasicMaterial({ color: '#5ff5d0', transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false });
const auraSelMat = new T.MeshBasicMaterial({ color: '#ffd66b', transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false });
function makePartMesh(type) {
  const d = A.PART_DEFS[type]; const g = new T.Group(); let m;
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const mm = new T.Mesh(geo, mat); mm.position.set(x, y, z); mm.rotation.set(rx, ry, rz); mm.castShadow = Qs.shadow > 0; mm.receiveShadow = true; g.add(mm); return mm; };
  if (type === 'plank') { add(new T.BoxGeometry(1, 0.24, 5), partMat.wood); for (const z of [-1.8, 0, 1.8]) add(new T.BoxGeometry(1.04, 0.26, 0.12), partMat.woodDark, 0, 0, z); }
  if (type === 'log') { add(new T.CylinderGeometry(0.35, 0.35, 3.6, 10), partMat.bark, 0, 0, 0, Math.PI / 2); for (const z of [-1.81, 1.81]) add(new T.CircleGeometry(0.33, 10), partMat.logEnd, 0, 0, z, 0, z > 0 ? 0 : Math.PI); }
  if (type === 'stone') add(new T.BoxGeometry(1.2, 1.2, 1.2), partMat.stone);
  if (type === 'crate') { add(new T.BoxGeometry(1.2, 1.2, 1.2), partMat.crate); for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) add(new T.BoxGeometry(0.14, 1.24, 0.14), partMat.woodDark, x, 0, z); }
  if (type === 'fan') { add(new T.CylinderGeometry(0.45, 0.45, 0.6, 16, 1, true), partMat.fan, 0, 0, 0, Math.PI / 2).material.side = T.DoubleSide; add(new T.BoxGeometry(0.9, 0.12, 0.5), partMat.fan, 0, -0.42, 0); const rot = new T.Group(); for (let k = 0; k < 4; k++) { const bl = new T.Mesh(new T.BoxGeometry(0.12, 0.38, 0.04), partMat.fanBlade); bl.position.y = 0.2; const arm = new T.Group(); arm.rotation.z = k * Math.PI / 2; arm.add(bl); rot.add(arm); } const hub = new T.Mesh(new T.SphereGeometry(0.09, 8, 6), partMat.gold); rot.add(hub); g.add(rot); g.userData.rot = rot; add(new T.ConeGeometry(0.1, 0.25, 6), partMat.gold, 0, 0, 0.42, Math.PI / 2); }
  if (type === 'wheel') { const w = new T.Group(); const tire = new T.Mesh(new T.TorusGeometry(0.4, 0.15, 8, 18), partMat.dark); tire.rotation.y = Math.PI / 2; w.add(tire); const hub = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.22, 10), partMat.gold); hub.rotation.z = Math.PI / 2; w.add(hub); for (let k = 0; k < 4; k++) { const sp = new T.Mesh(new T.BoxGeometry(0.08, 0.7, 0.08), partMat.gold); sp.rotation.x = k * Math.PI / 4; w.add(sp); } g.add(w); g.userData.rot = w; w.traverse(o => { if (o.isMesh) o.castShadow = Qs.shadow > 0; }); }
  if (type === 'balloon') { add(new T.SphereGeometry(0.9, 16, 12), partMat.balloon); add(new T.TorusGeometry(0.9, 0.08, 6, 24), partMat.balloon2, 0, 0, 0, Math.PI / 2); add(new T.ConeGeometry(0.16, 0.3, 8), partMat.balloon, 0, -0.95, 0, Math.PI); }
  if (type === 'stick') { add(new T.BoxGeometry(0.5, 0.12, 0.5), partMat.gold, 0, -0.34, 0); add(new T.CylinderGeometry(0.05, 0.05, 0.7, 6), partMat.dark, 0, 0.02, 0, -0.35); add(new T.SphereGeometry(0.11, 8, 6), partMat.gold, 0, 0.36, -0.12); add(new T.ConeGeometry(0.08, 0.2, 5), partMat.rocketRed, 0, -0.2, -0.3, -Math.PI / 2); }
  if (type === 'rocket') { add(new T.CylinderGeometry(0.22, 0.22, 1.1, 10), partMat.rocket, 0, 0, -0.1, Math.PI / 2); add(new T.ConeGeometry(0.22, 0.4, 10), partMat.rocketRed, 0, 0, 0.62, Math.PI / 2); for (let k = 0; k < 3; k++) add(new T.BoxGeometry(0.04, 0.3, 0.3), partMat.rocketRed, Math.cos(k * 2.1) * 0.22, Math.sin(k * 2.1) * 0.22, -0.55, 0, 0, k * 2.1); const fl = glowSprite('#ffb347', 1.6, 0); fl.position.z = -0.95; g.add(fl); g.userData.flame = fl; }
  if (type === 'spring') { add(new T.BoxGeometry(1, 0.08, 1), partMat.gold, 0, -0.16, 0); add(new T.BoxGeometry(1, 0.08, 1), partMat.spring, 0, 0.16, 0); for (let k = 0; k < 3; k++) add(new T.TorusGeometry(0.3, 0.04, 6, 14), partMat.spring, 0, -0.08 + k * 0.08, 0, Math.PI / 2); }
  if (type === 'ball') add(new T.SphereGeometry(0.8, 18, 12), partMat.orb);
  if (type === 'urn') { const pts = []; for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new T.Vector2(0.32 + Math.sin(t * Math.PI) * 0.28 - (t > 0.85 ? 0.12 : 0), -0.7 + t * 1.4)); } add(new T.LatheGeometry(pts, 14), partMat.urn); add(new T.TorusGeometry(0.5, 0.05, 6, 20), partMat.gold, 0, 0, 0, Math.PI / 2); const gl = glowSprite('#ffd66b', 1.8, 0.7); gl.position.y = 0.75; g.add(gl); }
  // aura (highlight shell)
  const aG = d.shape === 'sphere' ? new T.SphereGeometry(d.r + 0.1, 14, 10) : new T.BoxGeometry(d.half.x * 2 + 0.16, d.half.y * 2 + 0.16, d.half.z * 2 + 0.16);
  const aura = new T.Mesh(aG, auraMat); aura.visible = false; g.add(aura); g.userData.aura = aura;
  g.userData.type = type;
  return g;
}
const partMeshes = new Map(); // part -> group
function syncBodies(dt) {
  const seen = new Set();
  for (const b of G.bodies) {
    for (const p of b.parts) {
      let g = partMeshes.get(p);
      if (!g) { g = makePartMesh(p.type); scene.add(g); partMeshes.set(p, g); }
      seen.add(p);
      const w = A.partWorld(b, p); g.position.set(w.pos.x, w.pos.y, w.pos.z); g.quaternion.set(w.q.x, w.q.y, w.q.z, w.q.w);
      g.userData.b = b; g.userData.p = p;
      if (g.userData.rot) { if (p.type === 'fan') g.userData.rot.rotation.z = p.spin; else g.userData.rot.rotation.x = -(p.spin || 0) - (b.drive ? 0 : 0); }
      if (p.type === 'wheel' && !b.drive) { const fv = A.driveDir(b); p.spin = (p.spin || 0) + A.vdot(b.vel, fv) * dt / 0.55; }
      if (g.userData.flame) { const on = p.on && p.fuel > 0; g.userData.flame.material.opacity = on ? 0.9 + Math.random() * 0.1 : 0; g.userData.flame.scale.setScalar(on ? 1.4 + Math.random() * 0.6 : 0.1); if (on && Math.random() < 0.8) { const fw = A.qrot(w.q, A.V(0, 0, -1)); emitP(w.pos.x + fw.x, w.pos.y + fw.y, w.pos.z + fw.z, fw.x * 8 + rnd(1), fw.y * 8 + rnd(1), fw.z * 8 + rnd(1), Math.random() < 0.5 ? '#ffd36b' : '#ff7a3c', 0.9, 0.5, -2); } }
      if (p.type === 'fan' && (p.on || b.drive > 0) && Math.random() < 0.3) { const fw = A.qrot(w.q, A.V(0, 0, -1)); emitP(w.pos.x + fw.x * 0.5, w.pos.y + fw.y * 0.5, w.pos.z + fw.z * 0.5, fw.x * 6, fw.y * 6, fw.z * 6, '#ffffff', 0.5, 0.5, 0); }
      const aura = g.userData.aura; let vis = false, mat = auraMat;
      if (G.held === b) { vis = true; } else if (sel && sel.b === b && sel.p === p) { vis = true; mat = auraSelMat; } else if (G.buildMode && A.vlen(A.vsub(b.pos, G.player.pos)) < A.FORGE_RANGE + 2 && !A.hasPart(b, 'urn')) { vis = true; }
      aura.visible = vis; aura.material = mat;
    }
  }
  for (const [p, g] of partMeshes) if (!seen.has(p)) { scene.remove(g); partMeshes.delete(p); }
  auraMat.opacity = G.held ? 0.28 + 0.12 * Math.sin(clock * 6) : 0.14 + 0.06 * Math.sin(clock * 3);
}
// ---------- particles ----------
const PN = Qs.particles;
const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN), pAlpha = new Float32Array(PN);
const pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pGrav = new Float32Array(PN), pBase = new Float32Array(PN);
let pHead = 0;
const pGeo = new T.BufferGeometry();
pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new T.BufferAttribute(pCol, 3)); pGeo.setAttribute('size', new T.BufferAttribute(pSize, 1)); pGeo.setAttribute('alpha', new T.BufferAttribute(pAlpha, 1));
const pMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { map: { value: glowTex }, scale: { value: 300 } },
  vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*scale/max(.5,-mv.z); gl_Position = projectionMatrix*mv; }',
  fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC*t.a*vA, 1.); }' });
const points = new T.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 5; scene.add(points);
const rnd = s => (Math.random() - 0.5) * 2 * s;
function emitP(x, y, z, vx, vy, vz, color, size, life, grav = 0) {
  const i = pHead; pHead = (pHead + 1) % PN;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  tmpC.set(color); pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b; pBase[i] = size; pSize[i] = size; pLife[i] = life; pMax[i] = life; pGrav[i] = grav; pAlpha[i] = 1;
}
function burst(pos, kind) {
  const n = { core: 60, weld: 26, hit: 14, shock: 22, poof: 26, ore: 16, bush: 18, crystal: 18, rubble: 30, ring: 30, land: 12, dust: 8, shrine: 80 }[kind] || 16;
  const cols = { core: ['#ffe17a', '#fff6c9', '#ffb347'], weld: ['#7ff5dc', '#ffffff', '#ffd66b'], hit: ['#ffffff', '#ffe9a8'], shock: ['#9ff3ff', '#ffffff', '#c9b6ff'], poof: ['#c9b6ff', '#ffffff'], ore: ['#c9c4b8', '#ffd36b'], bush: ['#7bd35a', '#c4f08a'], crystal: ['#9ff3ff', '#ffffff'], rubble: ['#d9c7a6', '#a89a88'], ring: ['#ffd66b', '#ffffff'], land: ['#f5ead2', '#ffffff'], dust: ['#f5ead2'], shrine: ['#7ff5dc', '#ffd66b', '#ffffff'] }[kind] || ['#ffffff'];
  const sp = { core: 7, shrine: 9, rubble: 6, land: 3, dust: 2 }[kind] || 5;
  for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, e = Math.random() * 2 - 0.5; emitP(pos.x, pos.y, pos.z, Math.cos(a) * sp * Math.random(), (kind === 'land' || kind === 'dust' ? 0.8 : e * sp) + 1, Math.sin(a) * sp * Math.random(), cols[k % cols.length], kind === 'rubble' ? 0.6 : 0.45, 0.5 + Math.random() * 0.7, kind === 'rubble' || kind === 'ore' ? 12 : (kind === 'land' ? 1 : 2)); }
}
function updateParticles(dt) {
  for (let i = 0; i < PN; i++) {
    if (pLife[i] <= 0) { if (pAlpha[i] !== 0) { pAlpha[i] = 0; pSize[i] = 0; } continue; }
    pLife[i] -= dt; const f = Math.max(0, pLife[i] / pMax[i]);
    pVel[i * 3 + 1] -= pGrav[i] * dt; pVel[i * 3] *= 1 - 1.2 * dt; pVel[i * 3 + 2] *= 1 - 1.2 * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    pAlpha[i] = Math.min(1, f * 2.5) * Math.min(1, (1 - f) * 8 + 0.2); pSize[i] = pBase[i] * (0.6 + 0.4 * f);
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.size.needsUpdate = true; pGeo.attributes.alpha.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}
// build-mode helpers: attachment points & connection line
const apN = 160; const apPos = new Float32Array(apN * 3); const apGeo = new T.BufferGeometry(); apGeo.setAttribute('position', new T.BufferAttribute(apPos, 3));
const apMat = new T.PointsMaterial({ map: glowTex, color: '#8ffbe0', size: 0.55, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending });
const apPoints = new T.Points(apGeo, apMat); apPoints.frustumCulled = false; apPoints.renderOrder = 6; scene.add(apPoints);
const linkGeo = new T.BufferGeometry(); linkGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
const link = new T.Line(linkGeo, new T.LineBasicMaterial({ color: '#ffd66b', transparent: true, depthTest: false })); link.frustumCulled = false; link.renderOrder = 7; scene.add(link);
const linkDot = glowSprite('#ffd66b', 1.4, 1); linkDot.material.depthTest = false; linkDot.renderOrder = 8; scene.add(linkDot);
const beamGeo = new T.BufferGeometry(); beamGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(3 * 12), 3));
const forgeBeam = new T.Line(beamGeo, new T.LineBasicMaterial({ color: '#7ff5dc', transparent: true, opacity: 0.85 })); forgeBeam.frustumCulled = false; scene.add(forgeBeam);
let sel = null; // selected {b,p}

// ---------- audio ----------
const AU = { ctx: null, master: null, music: null, sfx: null, revM: null, revS: null, conv: null, started: false, nextNote: 0, step: 0, chord: 0, wind: null, windGain: null, glideGain: null };
function initAudio() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = new AC(); AU.ctx = ctx;
  AU.master = ctx.createGain(); AU.master.gain.value = 0.9; AU.master.connect(ctx.destination);
  AU.music = ctx.createGain(); AU.sfx = ctx.createGain();
  AU.conv = ctx.createConvolver(); const len = ctx.sampleRate * 2.6, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  AU.conv.buffer = buf;
  // every source -> channel gain -> (dry -> master) + (send -> reverb -> master). Sends sit AFTER the channel gain so 0 is silent.
  AU.revM = ctx.createGain(); AU.revM.gain.value = 0.5; AU.revS = ctx.createGain(); AU.revS.gain.value = 0.3;
  AU.music.connect(AU.master); AU.music.connect(AU.revM); AU.revM.connect(AU.conv);
  AU.sfx.connect(AU.master); AU.sfx.connect(AU.revS); AU.revS.connect(AU.conv);
  const revOut = ctx.createGain(); revOut.gain.value = 0.8; AU.conv.connect(revOut); revOut.connect(AU.master);
  applyVolumes();
  // wind bed (sfx channel)
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7;
  AU.windGain = ctx.createGain(); AU.windGain.gain.value = 0.0; ns.connect(bp); bp.connect(AU.windGain); AU.windGain.connect(AU.sfx); ns.start(); AU.windFilter = bp;
  AU.noise = nb;
  AU.nextNote = ctx.currentTime + 0.3;
}
function applyVolumes() {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime, m = settings.music <= 0 ? 0 : Math.pow(settings.music, 1.6) * 0.55, s = settings.sfx <= 0 ? 0 : Math.pow(settings.sfx, 1.4);
  AU.music.gain.cancelScheduledValues(t); AU.sfx.gain.cancelScheduledValues(t);
  AU.music.gain.value = m; AU.sfx.gain.value = s; AU.music.gain.setValueAtTime(m, t); AU.sfx.gain.setValueAtTime(s, t);
}
function tone(f, dur, o = {}) {
  const ctx = AU.ctx; if (!ctx) return; const t = (o.at || ctx.currentTime);
  const osc = ctx.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
  const g = ctx.createGain(); const v = o.vol || 0.2; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc; if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; osc.connect(f2); node = f2; }
  node.connect(g); g.connect(o.bus || AU.sfx); osc.start(t); osc.stop(t + dur + 0.05);
}
function noiseHit(dur, o = {}) {
  const ctx = AU.ctx; if (!ctx) return; const t = ctx.currentTime + (o.delay || 0);
  const s = ctx.createBufferSource(); s.buffer = AU.noise; const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f || 1200, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(o.vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(AU.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function sfx(name, ev) {
  if (!AU.ctx) return; const n = AU.ctx.currentTime;
  switch (name) {
    case 'jump': tone(380, 0.14, { type: 'triangle', slide: 620, vol: 0.12 }); break;
    case 'climbjump': tone(300, 0.16, { type: 'triangle', slide: 700, vol: 0.12 }); break;
    case 'dash': noiseHit(0.22, { type: 'bandpass', f: 1800, f2: 500, vol: 0.25 }); break;
    case 'glideopen': noiseHit(0.3, { type: 'bandpass', f: 600, f2: 1600, vol: 0.25 }); tone(520, 0.2, { type: 'triangle', vol: 0.06 }); break;
    case 'glideclose': noiseHit(0.15, { f: 900, vol: 0.15 }); break;
    case 'grabwall': noiseHit(0.08, { f: 700, vol: 0.18 }); break;
    case 'mantle': tone(260, 0.12, { type: 'triangle', slide: 400, vol: 0.1 }); break;
    case 'land': noiseHit(0.12, { f: 500, vol: 0.2 }); break;
    case 'swing': noiseHit(0.14, { type: 'bandpass', f: 2400, f2: 800, vol: 0.18 }); break;
    case 'swingheavy': noiseHit(0.22, { type: 'bandpass', f: 1200, f2: 300, vol: 0.28 }); break;
    case 'hit': case 'thunk': tone(150, 0.12, { type: 'square', slide: 70, vol: 0.12, lp: 900 }); noiseHit(0.08, { f: 2000, vol: 0.18 }); break;
    case 'harvest': [0, 4, 7].forEach((k, i) => tone(mtof(76 + k), 0.18, { type: 'triangle', vol: 0.08, at: n + i * 0.05 })); break;
    case 'enemydie': tone(500, 0.3, { type: 'square', slide: 120, vol: 0.08, lp: 1600 }); noiseHit(0.3, { f: 3000, f2: 400, vol: 0.2 }); break;
    case 'hurt': tone(220, 0.25, { type: 'sawtooth', slide: 110, vol: 0.12, lp: 1200 }); break;
    case 'core': [0, 4, 7, 12, 16, 19].forEach((k, i) => tone(mtof(72 + k), 0.9, { type: 'sine', vol: 0.14, at: n + i * 0.07 })); tone(mtof(48), 1.4, { type: 'triangle', vol: 0.1 }); break;
    case 'shrine': [0, 7, 12, 16, 19, 24].forEach((k, i) => { tone(mtof(64 + k), 1.6, { type: 'triangle', vol: 0.09, at: n + i * 0.12 }); tone(mtof(64 + k + 12), 1.2, { type: 'sine', vol: 0.05, at: n + i * 0.12 + 0.03 }); }); break;
    case 'tower': tone(mtof(43), 3, { type: 'sawtooth', vol: 0.08, lp: 500 }); [0, 7, 12, 19].forEach((k, i) => tone(mtof(67 + k), 2, { type: 'sine', vol: 0.08, at: n + 0.3 + i * 0.25 })); break;
    case 'grab': tone(660, 0.18, { type: 'sine', slide: 990, vol: 0.12 }); tone(1320, 0.25, { type: 'sine', vol: 0.04 }); break;
    case 'release': tone(800, 0.15, { type: 'sine', slide: 500, vol: 0.08 }); break;
    case 'rotate': tone(900, 0.07, { type: 'triangle', vol: 0.06 }); break;
    case 'attach': tone(523, 0.3, { type: 'triangle', vol: 0.14 }); tone(784, 0.4, { type: 'sine', vol: 0.1, at: n + 0.06 }); noiseHit(0.15, { type: 'highpass', f: 3000, vol: 0.12 }); break;
    case 'detach': tone(700, 0.2, { type: 'triangle', slide: 350, vol: 0.1 }); break;
    case 'spawn': tone(392, 0.25, { type: 'sine', slide: 784, vol: 0.1 }); break;
    case 'devon': tone(200, 0.4, { type: 'sawtooth', slide: 400, vol: 0.06, lp: 900 }); break;
    case 'devoff': tone(380, 0.3, { type: 'sawtooth', slide: 150, vol: 0.05, lp: 900 }); break;
    case 'deny': tone(180, 0.15, { type: 'square', vol: 0.06, lp: 700 }); tone(150, 0.15, { type: 'square', vol: 0.06, lp: 700, at: n + 0.1 }); break;
    case 'fuse': [0, 5, 9, 12].forEach((k, i) => tone(mtof(69 + k), 0.4, { type: 'triangle', vol: 0.08, at: n + i * 0.05 })); noiseHit(0.3, { type: 'highpass', f: 2500, vol: 0.1 }); break;
    case 'break': noiseHit(0.4, { f: 3000, f2: 300, vol: 0.3 }); tone(300, 0.3, { type: 'square', slide: 80, vol: 0.06, lp: 1000 }); break;
    case 'rockbreak': case 'crumble': noiseHit(0.6, { f: 900, f2: 120, vol: 0.4 }); tone(90, 0.5, { type: 'sine', slide: 40, vol: 0.2 }); break;
    case 'clank': tone(1200, 0.12, { type: 'square', vol: 0.05, lp: 2500 }); break;
    case 'page': noiseHit(0.2, { type: 'highpass', f: 2000, vol: 0.1 }); tone(mtof(79), 0.6, { type: 'sine', vol: 0.06 }); break;
    case 'helm': tone(330, 0.15, { type: 'triangle', vol: 0.1 }); tone(495, 0.2, { type: 'triangle', vol: 0.08, at: n + 0.08 }); break;
    case 'spring': tone(200, 0.35, { type: 'triangle', slide: 900, vol: 0.14 }); break;
    case 'splash': noiseHit(0.3, { f: 1500, f2: 400, vol: 0.25 }); break;
    case 'ring': tone(mtof(76 + PENTA[(ev && ev.n) || 0]), 0.6, { type: 'sine', vol: 0.12 }); break;
    case 'ending': [0, 4, 7, 11, 14, 19, 23, 26].forEach((k, i) => tone(mtof(60 + k), 3, { type: 'sine', vol: 0.06, at: n + i * 0.18, bus: AU.music })); break;
  }
}
// generative music: soft pads + pentatonic arpeggio, shaped by biome and time of day
const CHORDS = [[0, 4, 7, 11], [5, 9, 12, 16], [9, 12, 16, 19], [7, 11, 14, 17]];
const BIOME_ROOT = { verdant: 60, plateau: 62, peaks: 64, ruins: 57, hollows: 55, sunken: 65 };
function musicTick(biome) {
  const ctx = AU.ctx; if (!ctx || settings.music <= 0) { if (ctx) AU.nextNote = ctx.currentTime + 0.2; return; }
  const bpm = 72, stepDur = 60 / bpm / 2;
  while (AU.nextNote < ctx.currentTime + 0.25) {
    const t = AU.nextNote, s = AU.step++;
    const root = BIOME_ROOT[biome] || 60;
    if (s % 16 === 0) { AU.chord = (AU.chord + 1) % CHORDS.length; const ch = CHORDS[AU.chord]; for (const k of ch) { tone(mtof(root - 12 + k), stepDur * 16, { type: 'triangle', vol: 0.035, att: 1.2, at: t, bus: AU.music, lp: 1400 }); } tone(mtof(root - 24 + ch[0]), stepDur * 16, { type: 'sine', vol: 0.06, att: 0.8, at: t, bus: AU.music }); }
    if (Math.random() < (s % 2 === 0 ? 0.55 : 0.25)) { const ch = CHORDS[AU.chord]; const k = ch[(Math.random() * ch.length) | 0] + (Math.random() < 0.4 ? 12 : 0); tone(mtof(root + k), stepDur * 3, { type: 'sine', vol: 0.05, at: t, bus: AU.music }); if (biome === 'peaks' || biome === 'hollows') tone(mtof(root + k + 24), stepDur * 4, { type: 'sine', vol: 0.015, at: t + 0.02, bus: AU.music }); }
    AU.nextNote += stepDur;
  }
}

// ---------- input ----------
const input = { mx: 0, mz: 0, jumpHeld: false, sprint: false, jumpPressed: false, dashPressed: false };
const keys = new Set();
const cam = { yaw: Math.PI, pitch: -0.28, dist: 8.5, tDist: 8.5, pos: new T.Vector3(), target: new T.Vector3(), shake: 0, free: 0 };
let paused = false, started = false, uiOpen = null, locked = false, hitstop = 0;
const raycaster = new T.Raycaster();
function pickAt(cx, cy) {
  const r = canvas.getBoundingClientRect();
  const ndc = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const objs = []; for (const g of partMeshes.values()) g.traverse(o => { if (o.isMesh && o !== g.userData.aura) objs.push(o); });
  const hits = raycaster.intersectObjects(objs, false);
  for (const h of hits) { let o = h.object; while (o && !o.userData.p) o = o.parent; if (o) return { b: o.userData.b, p: o.userData.p, point: h.point, dist: h.distance }; }
  return null;
}
function screenOf(v) { const p = new T.Vector3(v.x, v.y, v.z).project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height, vis: p.z < 1 }; }
function tapPick(cx, cy) {
  const h = pickAt(cx, cy);
  if (!G.buildMode) { if (h) { sel = { b: h.b, p: h.p }; } return h; }
  if (!h) { if (G.held) A.releaseHeld(G); sel = null; return null; }
  sel = { b: h.b, p: h.p };
  if (G.held !== h.b) A.grab(G, h.b);
  return h;
}
function frontBody() { // nearest body in view in range
  let best = null, bs = 1e9; const f = G.cam.fwd;
  for (const b of G.bodies) { const d = A.vsub(b.pos, G.player.pos); const L = A.vlen(d); if (L > A.FORGE_RANGE || A.hasPart(b, 'urn')) continue; const dot = A.vdot(A.vnorm(d), A.vnorm(A.V(f.x, 0, f.z))); const score = L * (1.6 - dot); if (dot > 0.2 && score < bs) { bs = score; best = b; } }
  return best;
}
const actions = {
  jump: (down) => { if (down) { input.jumpPressed = true; input.jumpHeld = true; } else input.jumpHeld = false; },
  sprint: (down) => { input.sprint = down; },
  dash: (down) => { if (down) input.dashPressed = true; },
  attack: (down) => { if (down && !G.buildMode) A.attack(G); },
  forge: (down) => { if (down) toggleForge(); },
  act: (down) => { if (down) { const r = A.interact(G); if (r === 'helm' && G.buildMode) toggleForge(false); } },
  grab: (down) => { if (!down) return; if (G.held) A.releaseHeld(G); else { const b = (sel && sel.b && G.bodies.includes(sel.b)) ? sel.b : frontBody(); if (b) { A.grab(G, b); sel = sel && sel.b === b ? sel : { b, p: b.parts[0] }; } else toast('Tap an object to grab it.'); } },
  roty: (down) => { if (down) A.rotateHeld(G, 'y', 1); },
  rotx: (down) => { if (down) A.rotateHeld(G, 'x', 1); },
  attach: (down) => { if (down) { const nb = A.attach(G); if (nb) sel = null; } },
  detach: (down) => { if (down) { if (sel && G.bodies.includes(sel.b)) { A.detachSel(G, sel.b, sel.b.parts.indexOf(sel.p)); sel = null; } else A.detachSel(G, G.held, null); } },
  parts: (down) => { if (down) openParts(); },
};
function toggleForge(on) {
  G.buildMode = on == null ? !G.buildMode : on;
  document.body.classList.toggle('build', G.buildMode);
  if (!G.buildMode) { A.releaseHeld(G); sel = null; $('partsMenu').classList.add('hidden'); }
  else { if (G.helm) { const b = G.helm.body; b.drive = 0; b.steer = 0; G.helm = null; } if (document.pointerLockElement) document.exitPointerLock(); }
  sfx(G.buildMode ? 'grab' : 'release'); cam.free = G.buildMode ? 1 : 0;
}
// keyboard
const KEYMAP = { Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyQ: 'dash', KeyF: 'forge', KeyE: 'act', KeyG: 'grab', KeyR: 'roty', KeyT: 'rotx', KeyC: 'attach', KeyX: 'detach', KeyB: 'parts' };
window.addEventListener('keydown', e => {
  if (!started) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (uiOpen) closeUI(); else openPause(); e.preventDefault(); return; }
  if (e.code === 'KeyM') { uiOpen === 'map' ? closeUI() : openMap(); return; }
  if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); uiOpen === 'bag' ? closeUI() : openBag(); return; }
  if (uiOpen || paused) return;
  if (e.repeat) return;
  keys.add(e.code);
  const a = KEYMAP[e.code]; if (a) { if (['roty', 'rotx', 'attach', 'detach', 'parts', 'grab'].includes(a) && !G.buildMode) return; actions[a](true); e.preventDefault(); }
  if (e.code === 'KeyR' && e.shiftKey) A.rotateHeld(G, 'y', -2);
  initAudio();
});
window.addEventListener('keyup', e => { keys.delete(e.code); const a = KEYMAP[e.code]; if (a === 'jump' || a === 'sprint') actions[a](false); });
function keyMove() { let x = 0, z = 0; if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1; return { x, z }; }
// pointer (mouse + touch)
const ptrs = new Map(); let stick = null, pinch = null;
const stickBase = $('stickBase'), stickKnob = $('stickKnob');
function stickHome() { stickBase.style.left = ''; stickBase.style.top = ''; stickBase.style.bottom = ''; stickKnob.style.transform = ''; }
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  initAudio();
  if (!started || paused || uiOpen) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
  const r = canvas.getBoundingClientRect();
  if (e.pointerType === 'mouse') {
    if (e.button === 2) { toggleForge(); return; }
    if (!G.buildMode && !document.pointerLockElement && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (er) {} }
    if (!G.buildMode && e.button === 0 && (document.pointerLockElement || locked)) { A.attack(G); return; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), kind: 'cam' });
    return;
  }
  const leftZone = (e.clientX - r.left) < r.width * 0.45 && (e.clientY - r.top) > r.height * 0.3;
  if (leftZone && !stick) {
    stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    const br = stickBase.getBoundingClientRect();
    stickBase.style.left = (e.clientX - br.width / 2) + 'px'; stickBase.style.top = (e.clientY - br.height / 2) + 'px'; stickBase.style.bottom = 'auto';
    ptrs.set(e.pointerId, { kind: 'stick' });
  } else {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), kind: 'cam' });
    const cams = [...ptrs.entries()].filter(([, p]) => p.kind === 'cam');
    if (cams.length === 2) { const [a, b] = cams.map(c => c[1]); pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.tDist, held: G.heldDist }; }
  }
});
canvas.addEventListener('pointermove', e => {
  if (document.pointerLockElement === canvas && e.pointerType === 'mouse') { rotateCam(e.movementX, e.movementY, 0.0026); return; }
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (p.kind === 'stick') {
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const L = Math.hypot(dx, dy), max = 50;
    if (L > max) { dx *= max / L; dy *= max / L; }
    stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
    const m = Math.min(1, L / max); const dead = 0.12; const k = m < dead ? 0 : (m - dead) / (1 - dead);
    input.mx = L ? (dx / max) * (k / Math.max(m, 1e-3)) : 0; input.mz = L ? (dy / max) * (k / Math.max(m, 1e-3)) : 0;
    return;
  }
  const cams = [...ptrs.entries()].filter(([, q]) => q.kind === 'cam');
  if (pinch && cams.length === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = cams.map(c => c[1]); const d = Math.hypot(a.x - b.x, a.y - b.y); const f = pinch.d / Math.max(20, d); if (G.held) G.heldDist = A.clamp(pinch.held / f, 2.5, 12); else cam.tDist = A.clamp(pinch.dist * f, 3.2, 16); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  rotateCam(dx, dy, e.pointerType === 'mouse' ? 0.005 : 0.0062);
});
function endPtr(e) {
  const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
  if (p.kind === 'stick') { stick = null; input.mx = 0; input.mz = 0; stickHome(); return; }
  if (pinch) { if ([...ptrs.values()].filter(q => q.kind === 'cam').length < 2) pinch = null; return; }
  const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy), dt = performance.now() - p.t;
  if (moved < 12 && dt < 450 && e.type === 'pointerup') tapPick(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); if (G.buildMode && G.held) G.heldDist = A.clamp(G.heldDist - e.deltaY * 0.01, 2.5, 12); else cam.tDist = A.clamp(cam.tDist + e.deltaY * 0.01, 3.2, 16); }, { passive: false });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; $('crosshair').style.opacity = locked ? 0.8 : 0; });
function rotateCam(dx, dy, s) { s *= settings.sens; cam.yaw -= dx * s; cam.pitch = A.clamp(cam.pitch - dy * s * (settings.invertY ? -1 : 1), -1.25, 0.95); }
// touch buttons
document.querySelectorAll('.tb').forEach(btn => {
  const k = btn.dataset.k;
  btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); initAudio(); btn.classList.add('on'); try { btn.setPointerCapture(e.pointerId); } catch (er) {} if (k === 'sprint') input.sprintBtn = true; actions[k] && actions[k](true); });
  const up = e => { btn.classList.remove('on'); if (k === 'sprint') input.sprintBtn = false; if (k === 'jump' || k === 'sprint') actions[k](false); };
  btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
});

// ---------- UI ----------
const PART_ICON = { plank: '🪵', log: '🪵', stone: '🧱', fan: '🌀', wheel: '☸️', balloon: '🎈', stick: '🕹️', rocket: '🚀', spring: '➰' };
function toast(text, big) { const el = document.createElement('div'); el.className = 'toast' + (big ? ' big' : ''); el.textContent = text; const box = $('toasts'); box.appendChild(el); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = 0; setTimeout(() => el.remove(), 520); }, big ? 3600 : 2600); }
function showPanel(html) { const p = $('panel'); p.innerHTML = html; p.classList.remove('hidden'); paused = true; input.mx = input.mz = 0; if (document.pointerLockElement) document.exitPointerLock(); }
function closeUI() { $('panel').classList.add('hidden'); $('mapWrap').classList.add('hidden'); uiOpen = null; paused = false; }
$('panel').addEventListener('pointerdown', e => { if (e.target.id === 'panel') closeUI(); });
function openPause() {
  uiOpen = 'pause';
  const q = settings.quality;
  showPanel(`<div class="card"><h2>Paused</h2>
  <div class="row">Music <input type="range" id="sMusic" min="0" max="1" step="0.01" value="${settings.music}"></div>
  <div class="row">Sound effects <input type="range" id="sSfx" min="0" max="1" step="0.01" value="${settings.sfx}"></div>
  <div class="row">Quality <div class="seg" id="sQual">${['low', 'medium', 'high'].map(k => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
  <div class="row">Sky <div class="seg" id="sDay"><button data-d="0" class="${!settings.daylight ? 'on' : ''}">Day &amp; night</button><button data-d="1" class="${settings.daylight ? 'on' : ''}">Always day</button></div></div>
  <div class="row">Camera speed <input type="range" id="sSens" min="0.4" max="2" step="0.05" value="${settings.sens}"></div>
  <div class="keys">${isTouch ? 'Left thumb: move. Drag right side: look. Pinch: zoom. Tap <b>Forge</b>, then tap any object to grab it.' : '<kbd>WASD</kbd> move · <kbd>Mouse</kbd> look · <kbd>Space</kbd> jump / glide · <kbd>Shift</kbd> sprint · <kbd>Q</kbd> dash · <kbd>Click</kbd> attack · <kbd>E</kbd> use · <kbd>F</kbd>/<kbd>Right-click</kbd> Forge Hand · in Forge: <kbd>Click</kbd> grab · <kbd>R</kbd>/<kbd>T</kbd> rotate · <kbd>C</kbd> attach · <kbd>X</kbd> detach · <kbd>B</kbd> parts · <kbd>Wheel</kbd> distance · <kbd>M</kbd> map · <kbd>I</kbd> bag'}</div>
  <div style="text-align:center;margin-top:12px"><button class="pill gold" id="pResume">Resume</button><button class="pill small" id="pNew">New Journey</button></div></div>`);
  $('sMusic').oninput = e => { settings.music = +e.target.value; applyVolumes(); saveSettings(); };
  $('sSfx').oninput = e => { settings.sfx = +e.target.value; applyVolumes(); saveSettings(); if (settings.sfx > 0) sfx('rotate'); };
  $('sSens').oninput = e => { settings.sens = +e.target.value; saveSettings(); };
  $('sQual').onclick = e => { const k = e.target.dataset.q; if (!k || k === settings.quality) return; settings.quality = k; saveSettings(); saveGame(); location.reload(); };
  $('sDay').onclick = e => { const d = e.target.dataset.d; if (d == null) return; settings.daylight = d === '1'; saveSettings(); [...$('sDay').children].forEach(b => b.classList.toggle('on', b.dataset.d === d)); };
  $('pResume').onclick = closeUI;
  $('pNew').onclick = () => { if (confirm('Start a new journey? Your progress will be erased.')) { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} noSave = true; location.reload(); } };
}
function openBag() {
  uiOpen = 'bag'; const w = G.weapon, inv = G.inv;
  const fuseNames = { rock: 'Stone', leaf: 'Leaf', crystal: 'Crystal' };
  showPanel(`<div class="card"><h2>Bag</h2>
  <div class="row"><span>Staff ${w.fuse ? '+ ' + fuseNames[w.fuse] : '(plain)'}</span><span>${w.dur}/${w.maxDur}</span></div>
  <div class="inv">${['rock', 'leaf', 'crystal'].map(m => `<div><b>${{ rock: '🪨', leaf: '🍃', crystal: '💎' }[m]}</b>${fuseNames[m]} × ${inv[m]}<br><button class="pill small" data-f="${m}" ${inv[m] ? '' : 'disabled'}>Fuse</button></div>`).join('')}</div>
  <p style="font-size:13px;opacity:.8">Stone: heavy hits that break cracked seals. Leaf: wide gusting swings. Crystal: shock damage that arcs to nearby foes.</p>
  <div class="row"><span>Ancient Cores</span><span>${A.coresTaken(G)} / ${G.W.cores.length} (the realm heals at ${A.coreGoal(G)})</span></div>
  <div class="row"><span>Shrines</span><span>${G.W.shrines.filter(s => s.done).length} / ${G.W.shrines.length}</span></div>
  <div class="row"><span>Spires awakened</span><span>${G.W.towers.filter(t => t.active).length} / ${G.W.towers.length}</span></div>
  <div class="row"><span>Stamina</span><span>${G.player.maxStamina}</span></div>
  <div class="row"><span>Inscriptions read</span><span>${G.W.journals.filter(j => j.read).length} / ${G.W.journals.length}</span></div>
  <div style="font-weight:800;margin-top:6px">Forge parts</div><div style="font-size:22px;margin:4px 0">${A.BUILD_PARTS.map(t => `<span title="${A.PART_DEFS[t].name}" style="opacity:${A.unlockedParts(G).includes(t) ? 1 : 0.25}">${PART_ICON[t]}</span>`).join(' ')}</div>
  <div style="text-align:center"><button class="pill gold" id="bagClose">Close</button></div></div>`);
  $('panel').querySelectorAll('[data-f]').forEach(b => b.onclick = () => { A.fuse(G, b.dataset.f); flushEvents(); openBag(); });
  $('bagClose').onclick = closeUI;
}
function openJournal(title, text) { uiOpen = 'journal'; showPanel(`<div class="card"><h2>${title}</h2><p>${text}</p><div style="text-align:center"><button class="pill gold" id="jClose">Close</button></div></div>`); $('jClose').onclick = closeUI; }
function openParts() {
  const list = $('partsList'); const un = A.unlockedParts(G);
  list.innerHTML = A.BUILD_PARTS.map(t => { const d = A.PART_DEFS[t]; const ok = un.includes(t); return `<button class="part ${ok ? '' : 'locked'}" data-p="${t}"><b>${PART_ICON[t]}</b>${d.name}${ok ? '' : `<br><small>${d.unlock} cores</small>`}</button>`; }).join('');
  list.querySelectorAll('.part').forEach(b => b.onpointerdown = e => { e.stopPropagation(); const t = b.dataset.p; const nb = A.spawnPart(G, t); if (nb) { sel = { b: nb, p: nb.parts[0] }; $('partsMenu').classList.add('hidden'); } });
  $('partsMenu').classList.toggle('hidden');
}
document.querySelectorAll('[data-close]').forEach(b => b.onpointerdown = e => { e.stopPropagation(); $(b.dataset.close).classList.add('hidden'); });
$('bPause').onclick = () => openPause(); $('bBag').onclick = () => openBag(); $('bMap').onclick = () => openMap();
$('mapClose').onclick = closeUI;
// map
const BCOL = { verdant: '#7fd35f', plateau: '#e0cd6c', peaks: '#a9dccd', ruins: '#9fbf9a', hollows: '#3e8fa3', sunken: '#9fe0ae' };
function openMap() {
  uiOpen = 'map'; paused = true; if (document.pointerLockElement) document.exitPointerLock();
  $('mapWrap').classList.remove('hidden');
  const cv = $('mapC'); const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = r.height * dpr;
  const g = cv.getContext('2d'); const S = cv.width / 520, cx = cv.width / 2, cy = cv.height / 2; const X = x => cx + x * S, Y = z => cy + z * S;
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, cv.width * 0.7); grd.addColorStop(0, '#cfeefc'); grd.addColorStop(1, '#8cc8ea'); g.fillStyle = grd; g.fillRect(0, 0, cv.width, cv.height);
  const isles = G.W.islands.slice().sort((a, b) => (a.depths ? -1 : 0) - (b.depths ? -1 : 0));
  for (const I of isles) {
    const rev = G.revealed[I.biome] || I.shrine && G.revealed[G.W.shrines.find(s => s.id === I.shrine).biome];
    if (I === G.W.sunken && G.sunkenRise === 0) continue;
    g.beginPath(); for (let k = 0; k <= 48; k++) { const a = k / 48 * Math.PI * 2; const rr = A.islandRadius(I, I.x + Math.cos(a) * I.r, I.z + Math.sin(a) * I.r); const x = X(I.x + Math.cos(a) * rr), y = Y(I.z + Math.sin(a) * rr); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.fillStyle = I.depths ? (rev ? 'rgba(40,110,130,.35)' : 'rgba(40,80,110,.15)') : (rev ? (I.shrine ? '#f4f2ea' : BCOL[I.biome]) : 'rgba(255,255,255,.35)'); g.fill();
    g.strokeStyle = rev ? 'rgba(40,60,80,.35)' : 'rgba(255,255,255,.7)'; g.setLineDash(rev ? [] : [6, 6]); g.lineWidth = 2 * dpr; g.stroke(); g.setLineDash([]);
  }
  g.font = `${11 * dpr}px ui-rounded, system-ui`; g.textAlign = 'center';
  for (const Tw of G.W.towers) { g.fillStyle = Tw.active ? '#2fbf9f' : '#556'; g.beginPath(); g.moveTo(X(Tw.x), Y(Tw.z) - 9 * dpr); g.lineTo(X(Tw.x) - 6 * dpr, Y(Tw.z) + 6 * dpr); g.lineTo(X(Tw.x) + 6 * dpr, Y(Tw.z) + 6 * dpr); g.fill(); }
  for (const Sh of G.W.shrines) { const rev = G.revealed[Sh.biome] || Math.hypot(Sh.x - G.player.pos.x, Sh.z - G.player.pos.z) < 90; if (!rev) continue; g.fillStyle = Sh.done ? '#ffc93c' : '#ffffff'; g.strokeStyle = '#2a4a66'; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(X(Sh.x), Y(Sh.z), 6 * dpr, 0, 7); g.fill(); g.stroke(); }
  for (const c of G.W.cores) if (c.taken) { g.fillStyle = '#ffb347'; g.fillRect(X(c.pos.x) - 2 * dpr, Y(c.pos.z) - 2 * dpr, 4 * dpr, 4 * dpr); }
  const Pp = G.player.pos; g.save(); g.translate(X(Pp.x), Y(Pp.z)); g.rotate(-G.player.yaw); g.fillStyle = '#ff5f7a'; g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(0, -11 * dpr); g.lineTo(7 * dpr, 8 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-7 * dpr, 8 * dpr); g.closePath(); g.fill(); g.stroke(); g.restore();
  g.fillStyle = '#21405c'; for (const I of G.W.islands) if (!I.shrine && I.r > 20 && G.revealed[I.biome] && !(I === G.W.sunken && G.sunkenRise === 0)) g.fillText(I.name, X(I.x), Y(I.z) - (I.depths ? 120 * S : 0));
  $('mapLegend').textContent = '▲ Spires (wake them to reveal regions)   ● Shrines   ■ Cores found   Dashed = unexplored';
}
// ---------- save ----------
let noSave = false;
function saveGame() { if (noSave || !started) return; try { localStorage.setItem(SAVE_KEY, A.serialize(G)); } catch (e) {} }
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
window.addEventListener('pagehide', saveGame);
// ---------- events from the sim ----------
let flash = 0, endT = 0, wowT = 0, lastBiome = '', biomeTimer = 0;
function flushEvents() {
  const evs = G.events; G.events = [];
  for (const e of evs) {
    switch (e.type) {
      case 'sfx': sfx(e.s, e); break;
      case 'toast': toast(e.text); break;
      case 'burst': burst(e.pos, e.kind); break;
      case 'shake': cam.shake = Math.max(cam.shake, e.a); break;
      case 'hitstop': hitstop = 0.05; break;
      case 'land': if (e.v > 6) { burst(e.pos, 'land'); sfx('land'); if (e.v > 14) cam.shake = Math.max(cam.shake, 0.2); } break;
      case 'jump': burst(A.vadd(e.pos, A.V(0, 0.05, 0)), 'dust'); break;
      case 'core': { burst(e.pos, 'core'); toast(`Ancient Core  ${e.n} / ${e.goal}`, true); const cc = $('coreCount'); cc.classList.remove('pulse'); void cc.offsetWidth; cc.classList.add('pulse'); flash = 0.35; saveGame(); break; }
      case 'unlock': toast(`New Forge part: ${PART_ICON[e.part]} ${e.name}`, true); break;
      case 'shrine': burst(A.vadd(e.pos, A.V(0, 1.5, 0)), 'shrine'); toast(`${e.name} solved! A Core rises from the altar.`, true); flash = 0.4; cam.shake = 0.3; saveGame(); break;
      case 'tower': toast(`${e.name} awakened! The map reveals new lands.`, true); flash = 0.5; saveGame(); break;
      case 'wow': wowT = 0.0001; toast('The ground trembles far below…', true); break;
      case 'journal': openJournal(e.title, e.text); break;
      case 'ending': endT = 0.0001; saveGame(); break;
      case 'respawn': flash = 0.3; break;
      case 'weaponbreak': burst(A.vadd(G.player.pos, A.V(0, 1.2, 0)), 'rubble'); break;
      case 'attach': linkFlash = 0.4; break;
    }
  }
}
let linkFlash = 0;

// ---------- time of day ----------
const KEYS = [
  { t: 0.00, top: '#24448a', mid: '#5579bd', bot: '#7b98cf', fog: '#6a8ac4', sky: '#b4ccff', gnd: '#58688c', li: '#d6e4ff', lI: 1.3, hI: 1.35, night: 1 },
  { t: 0.22, top: '#3a62b0', mid: '#9c9fd0', bot: '#e6b9a8', fog: '#b9a9c8', sky: '#d7d4ff', gnd: '#7a7a8c', li: '#ffd2b0', lI: 1.4, hI: 1.3, night: 0.3 },
  { t: 0.30, top: '#4d8fdc', mid: '#ffc29a', bot: '#ffe0b8', fog: '#f4d2b4', sky: '#fff0dc', gnd: '#9a9a78', li: '#ffd7a6', lI: 1.8, hI: 1.25, night: 0 },
  { t: 0.42, top: '#3d9ae8', mid: '#a6dcf5', bot: '#f4ecd9', fog: '#c6e7f6', sky: '#e4f5ff', gnd: '#93a070', li: '#fff4dc', lI: 2.2, hI: 1.25, night: 0 },
  { t: 0.60, top: '#3f97e4', mid: '#acdcf2', bot: '#f6ead2', fog: '#cbe6f2', sky: '#e8f5ff', gnd: '#98a070', li: '#fff0d0', lI: 2.15, hI: 1.25, night: 0 },
  { t: 0.70, top: '#4a7fcc', mid: '#ffd08a', bot: '#ffe4b6', fog: '#f4d4a6', sky: '#ffeccc', gnd: '#a09468', li: '#ffc77a', lI: 2.0, hI: 1.25, night: 0 },
  { t: 0.79, top: '#3c4f9e', mid: '#ff9f8f', bot: '#ffc9a4', fog: '#d8a8b0', sky: '#ffd8d0', gnd: '#8a7a80', li: '#ffab7a', lI: 1.5, hI: 1.3, night: 0.35 },
  { t: 0.88, top: '#24448a', mid: '#5579bd', bot: '#7b98cf', fog: '#6a8ac4', sky: '#b4ccff', gnd: '#58688c', li: '#d6e4ff', lI: 1.3, hI: 1.35, night: 1 },
  { t: 1.00, top: '#24448a', mid: '#5579bd', bot: '#7b98cf', fog: '#6a8ac4', sky: '#b4ccff', gnd: '#58688c', li: '#d6e4ff', lI: 1.3, hI: 1.35, night: 1 },
];
const HOL = { top: '#1f4f7a', mid: '#3d8fa8', bot: '#58b5b5', fog: '#3f8ea6', sky: '#c6fff6', gnd: '#3f6088', li: '#d4fbff', lI: 1.35, hI: 1.5 };
const STORM = { top: '#5d7aa8', mid: '#a9b8cc', bot: '#c8d0d8', fog: '#a9b7c8', sky: '#dfe7f2', gnd: '#7c8a84', li: '#f0f2ff' };
let stormMix = 0, lightning = 0;
const cA = new T.Color(), cB = new T.Color();
const lerpC = (a, b, f, out) => out.set(a).lerp(cB.set(b), f);
let depthMix = 0;
function applyTime(t, dt) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1], f = (t - a.t) / (b.t - a.t);
  const mix = (k, out) => lerpC(a[k], b[k], f, out);
  const targetDepth = A.clamp((-G.player.pos.y - 35) / 25, 0, 1); depthMix += (targetDepth - depthMix) * Math.min(1, dt * 2);
  const Pp0 = G.player.pos; const inStorm = Math.hypot(Pp0.x - 172, Pp0.z - 10) < 80 && Pp0.y > -30 ? 1 : 0; stormMix += (inStorm - stormMix) * Math.min(1, dt * 0.8);
  if (stormMix > 0.5 && Math.random() < dt * 0.12) { lightning = 1; setTimeout(() => sfx('rockbreak'), 300 + Math.random() * 600); }
  lightning = Math.max(0, lightning - dt * 3);
  const dm = (k, out) => { mix(k, out); if (stormMix > 0 && STORM[k]) out.lerp(cA.set(STORM[k]), stormMix * 0.6); if (depthMix > 0) out.lerp(cA.set(HOL[k]), depthMix); if (lightning > 0 && (k === 'top' || k === 'mid' || k === 'fog')) out.lerp(cA.set('#ffffff'), lightning * 0.6); return out; };
  dm('top', skyUniforms.top.value); dm('mid', skyUniforms.mid.value); dm('bot', skyUniforms.bot.value); dm('fog', scene.fog.color);
  dm('sky', hemi.color); dm('gnd', hemi.groundColor); dm('li', sun.color);
  const nightV = a.night + (b.night - a.night) * f;
  skyUniforms.night.value = nightV * (1 - depthMix);
  sun.intensity = (a.lI + (b.lI - a.lI) * f) * (1 - depthMix * 0.4); hemi.intensity = (a.hI + (b.hI - a.hI) * f) + depthMix * 0.3 + lightning * 0.8;
  amb.intensity = 0.35 + nightV * 0.25 + depthMix * 0.25;
  const ang = (t - 0.25) * Math.PI * 2; const sd = new T.Vector3(Math.cos(ang) * 0.75, Math.sin(ang), 0.45).normalize();
  skyUniforms.sunDir.value.copy(sd); skyUniforms.sunCol.value.copy(sun.color);
  const ld = sd.y > -0.05 ? sd : sd.clone().negate(); // moon lights the night
  ld.y = Math.max(ld.y, 0.35); ld.normalize();
  const Pp = G.player.pos; sun.position.set(Pp.x + ld.x * 120, Pp.y + ld.y * 120, Pp.z + ld.z * 120); sun.target.position.set(Pp.x, Pp.y, Pp.z);
  scene.fog.near = 70 - depthMix * 10 - stormMix * 20; scene.fog.far = Qs.far * (0.92 - depthMix * 0.2 - stormMix * 0.25);
  cloudMat.uniforms.col.value.copy(cA.set('#ffffff').lerp(skyUniforms.mid.value, 0.25)); cloudMat.uniforms.shade.value.copy(scene.fog.color).lerp(cA.set('#9fb6d6'), 0.3);
  renderer.toneMappingExposure = 1.1 + nightV * 0.08;
}
// ---------- HUD ----------
let hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updateHUD(dt) {
  const P = G.player;
  const hk = P.hearts + '/' + P.maxHearts;
  if (hudCache.hearts !== hk) { hudCache.hearts = hk; $('hearts').innerHTML = Array.from({ length: P.maxHearts }, (_, i) => `<i class="${i < P.hearts ? '' : 'e'}">♥</i>`).join(''); }
  setText('coreN', String(A.coresTaken(G))); setText('coreG', '/' + A.coreGoal(G));
  const w = G.weapon; setText('wIcon', (w.fuse ? { rock: '🪨', leaf: '🍃', crystal: '💎' }[w.fuse] : '🪄') + ' Staff');
  $('wBar').firstChild.style.width = (100 * w.dur / w.maxDur) + '%';
  // stamina wheel
  const st = $('stam'); const frac = P.stamina / P.maxStamina;
  const show = frac < 0.995 || P.mode === 'climb' || P.mode === 'glide';
  st.style.opacity = show ? 1 : 0;
  const f1 = Math.min(1, P.stamina / 100), f2 = Math.max(0, (P.stamina - 100) / 100);
  $('stamFg').style.strokeDashoffset = 113.1 * (1 - f1 * Math.min(1, P.maxStamina / 100)); $('stamFg2').style.strokeDashoffset = 75.4 * (1 - f2); $('stamFg2').style.opacity = P.maxStamina > 100 ? 1 : 0;
  st.classList.toggle('low', frac < 0.3); st.classList.toggle('ex', P.exhausted);
  // compass
  const yawDeg = cam.yaw; let html = '';
  const W = $('compass').clientWidth || 300; const fov = Math.PI * 0.9;
  const mark = (ang, label, cls) => { let d = Math.atan2(Math.sin(ang - yawDeg), Math.cos(ang - yawDeg)); if (Math.abs(d) > fov / 2) return; html += `<span class="${cls || ''}" style="left:${W / 2 - d / fov * W}px">${label}</span>`; };
  // camera looks along (-sin yaw, -cos yaw); world north = -z -> yaw 0
  mark(0, 'N'); mark(Math.PI / 2, 'W'); mark(Math.PI, 'S'); mark(-Math.PI / 2, 'E');
  const angTo = (x, z) => Math.atan2(-(x - P.pos.x), -(z - P.pos.z));
  for (const Sh of G.W.shrines) if (!Sh.done && (G.revealed[Sh.biome] || Math.hypot(Sh.x - P.pos.x, Sh.z - P.pos.z) < 90)) mark(angTo(Sh.x, Sh.z), '◈', 'm');
  for (const Tw of G.W.towers) if (!Tw.active) mark(angTo(Tw.x, Tw.z), '▲', 'm');
  if (hudCache.compass !== html) { hudCache.compass = html; $('compassStrip').innerHTML = html; }
  // prompt + use button
  const it = (!G.buildMode || true) ? A.nearestInteract(G) : null;
  const label = G.helm ? 'Jump to let go' : it ? it.label : '';
  if (hudCache.prompt !== label) { hudCache.prompt = label; $('prompt').textContent = label ? (isTouch ? label : 'E · ' + label) : ''; $('prompt').style.opacity = label ? 1 : 0; $('tAct').classList.toggle('show', !!it); $('tAct').firstChild.textContent = it ? it.label.split(' ')[0] : 'Use'; }
  // abilities
  const un = A.unlockedParts(G).filter(t => !['plank', 'log', 'stone'].includes(t));
  const ab = '🪁✋' + un.map(t => PART_ICON[t]).join('');
  if (hudCache.ab !== ab) { hudCache.ab = ab; $('abilities').innerHTML = `<span title="Glider">🪁</span><span title="Forge Hand">✋</span>` + un.map(t => `<span title="${A.PART_DEFS[t].name}">${PART_ICON[t]}</span>`).join(''); }
  // biome banner
  const g = A.groundAt(G.W, P.pos.x, P.pos.y + 1, P.pos.z, 0); let biome = g.island ? (g.island.shrine ? g.island.name : g.island.name) : '';
  if (g.island && !g.island.shrine && g.island.r < 20) biome = '';
  if (biome && biome !== lastBiome) { biomeTimer += dt; if (biomeTimer > 0.6) { lastBiome = biome; const bn = $('biomeName'); bn.innerHTML = biome + `<small>${g.island.shrine ? (G.W.shrines.find(s => s.id === g.island.shrine).hint) : A.BIOMES[g.island.biome].name.toUpperCase() === biome.toUpperCase() ? 'AETHERION' : A.BIOMES[g.island.biome].name.toUpperCase()}</small>`; bn.style.opacity = 1; clearTimeout(bn._t); bn._t = setTimeout(() => bn.style.opacity = 0, 3200); } } else biomeTimer = 0;
}

// ---------- main loop ----------
let clock = 0, last = performance.now(), saveT = 0, ambT = 0, lastCamInput = 0, fpsAcc = 0, fpsN = 0, fps = 60;
const tmpV = new T.Vector3(), tmpV2 = new T.Vector3();
const titleCam = { a: 0 };
function updateCamera(dt) {
  const P = G.player;
  if (!started) { // title orbit
    titleCam.a += dt * 0.05; const r = 86;
    camera.position.set(Math.sin(titleCam.a) * r, 22 + Math.sin(titleCam.a * 0.7) * 4, Math.cos(titleCam.a) * r); camera.lookAt(0, 4, 0); return;
  }
  if (endT > 0) { // ending: orbit high above the healed realm
    const k = G.ending; const a = clock * 0.06; const r = 230 - k * 40;
    tmpV.set(Math.sin(a) * r, 70 + k * 30, Math.cos(a) * r - 40); camera.position.lerp(tmpV, Math.min(1, dt * 0.8)); camera.lookAt(0, 0 + k * 10, -40); return;
  }
  if (wowT > 0 && wowT < 9.5) { // the Sunken Isle rises
    const I = G.W.sunken; tmpV2.set(I.x, I.y, I.z);
    const dir = tmpV.set(I.x - P.pos.x, 0, I.z - P.pos.z).normalize();
    tmpV.set(P.pos.x - dir.x * 10, P.pos.y + 6, P.pos.z - dir.z * 10); camera.position.lerp(tmpV, Math.min(1, dt * 2));
    camera.lookAt(tmpV2.x, tmpV2.y + 10, tmpV2.z); cam.yaw = Math.atan2(-dir.x, -dir.z);
    const s = 0.35 * Math.sin(wowT * Math.PI / 9.5); camera.position.x += rnd(s); camera.position.y += rnd(s);
    G.cam.fwd = A.vnorm(A.V(dir.x, 0, dir.z)); return;
  }
  // touch auto-follow: gently swing behind the player while moving
  const moving = Math.hypot(P.vel.x, P.vel.z) > 2;
  if (isTouch && moving && performance.now() - lastCamInput > 1400 && !G.buildMode && (P.mode === 'glide' || G.helm || Math.abs(input.mz) > 0.5)) {
    const want = P.yaw; let d = Math.atan2(Math.sin(want - cam.yaw), Math.cos(want - cam.yaw)); cam.yaw += d * Math.min(1, dt * (G.helm ? 1.6 : 0.8));
  }
  cam.dist += (cam.tDist * (G.buildMode ? 1.15 : 1) * (P.mode === 'glide' ? 1.15 : 1) - cam.dist) * Math.min(1, dt * 5);
  const f = tmpV.set(-Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch));
  const side = tmpV2.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const sh = G.buildMode ? 0.9 : 0.35;
  const tx = P.pos.x + side.x * sh, ty = P.pos.y + 1.6 + (G.buildMode ? 0.5 : 0), tz = P.pos.z + side.z * sh;
  cam.target.x += (tx - cam.target.x) * Math.min(1, dt * 14); cam.target.y += (ty - cam.target.y) * Math.min(1, dt * 9); cam.target.z += (tz - cam.target.z) * Math.min(1, dt * 14);
  let dist = cam.dist;
  // keep the camera above ground and out of rock
  for (let k = 0; k < 6; k++) {
    const cx = cam.target.x - f.x * dist, cy = cam.target.y - f.y * dist, cz = cam.target.z - f.z * dist;
    const g = A.groundAt(G.W, cx, cy + 3, cz, 0);
    if (g.island && cy < g.h + 0.6) { if (cam.target.y > g.h + 1) dist *= 0.8; else break; } else break;
  }
  camera.position.set(cam.target.x - f.x * dist, cam.target.y - f.y * dist, cam.target.z - f.z * dist);
  const g = A.groundAt(G.W, camera.position.x, camera.position.y + 3, camera.position.z, 0); if (g.island && camera.position.y < g.h + 0.5) camera.position.y = g.h + 0.5;
  if (cam.shake > 0) { camera.position.x += rnd(cam.shake * 0.4); camera.position.y += rnd(cam.shake * 0.4); cam.shake = Math.max(0, cam.shake - dt * 2.5); }
  camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
  G.cam.fwd = A.V(f.x, f.y, f.z); G.cam.yaw = cam.yaw; G.cam.pitch = cam.pitch;
}
function updateVisuals(dt) {
  const P = G.player, W = G.W;
  // player
  player.position.set(P.pos.x, P.pos.y, P.pos.z); player.rotation.set(0, P.yaw, 0);
  const sp = Math.hypot(P.vel.x, P.vel.z); P3.phase = (P3.phase || 0) + dt * (2 + sp * 1.6);
  const sw = Math.sin(P3.phase) * Math.min(1, sp / 6) * 0.8;
  P3.legL.rotation.x = sw; P3.legR.rotation.x = -sw; P3.armL.rotation.set(-sw * 0.8, 0, 0.1); P3.armR.rotation.set(sw * 0.8, 0, -0.1);
  player.children[0].rotation.x = 0;
  P3.glider.visible = P.mode === 'glide';
  if (P.mode === 'glide') { P3.armL.rotation.set(Math.PI, 0, 0.35); P3.armR.rotation.set(Math.PI, 0, -0.35); P3.legL.rotation.x = 0.3; P3.legR.rotation.x = 0.1; player.rotation.x = 0; P3.glider.rotation.z = Math.sin(clock * 2) * 0.05 - input.mx * 0.25; }
  if (P.mode === 'climb') { const c = Math.sin(clock * 9) * (Math.abs(input.mz) + Math.abs(input.mx) > 0.1 ? 0.6 : 0); P3.armL.rotation.set(Math.PI - 0.4 + c, 0, 0.2); P3.armR.rotation.set(Math.PI - 0.4 - c, 0, -0.2); P3.legL.rotation.x = 0.5 - c * 0.5; P3.legR.rotation.x = 0.5 + c * 0.5; }
  if (P.mode === 'swim') { P3.armL.rotation.set(-1.4 + Math.sin(clock * 4) * 0.8, 0, 0.3); P3.armR.rotation.set(-1.4 - Math.sin(clock * 4) * 0.8, 0, -0.3); }
  if (P.mode === 'helm') { P3.armL.rotation.set(-1.1, 0, 0); P3.armR.rotation.set(-1.1, 0, 0); P3.legL.rotation.x = 0; P3.legR.rotation.x = 0; }
  if (P.attackT > 0) { const k = P.attackT / 0.3; P3.armR.rotation.set(-2.6 * k + 0.4, -1.2 * (1 - k), -0.3); }
  if (G.buildMode) { P3.armL.rotation.set(-1.4, 0, 0.2); }
  P3.scarf.rotation.x = 0.25 + Math.sin(clock * 7) * 0.12 + Math.min(0.8, sp * 0.06) + (P.mode === 'glide' ? 0.3 : 0); P3.scarf.rotation.y = Math.sin(clock * 3.3) * 0.25;
  for (const k in P3.tips) P3.tips[k].visible = G.weapon.fuse === k;
  player.visible = !(P.inv > 0 && Math.floor(clock * 20) % 2 === 0 && P.hearts > 0) || !started;
  P3.handGlow.material.opacity = G.buildMode ? 0.8 + 0.2 * Math.sin(clock * 8) : 0; P3.hand.material.emissiveIntensity = G.buildMode ? 1.2 : 0.4;
  const gb = A.groundAt(W, P.pos.x, P.pos.y + 0.5, P.pos.z, 0); P3.blob.visible = !!gb.island && P.pos.y - gb.h < 12 && !Qs.shadow; if (P3.blob.visible) { P3.blob.position.set(P.pos.x, gb.h + 0.04, P.pos.z); P3.blob.scale.setScalar(1 - Math.min(0.6, (P.pos.y - gb.h) / 20)); }
  // forge beam
  forgeBeam.visible = !!G.held;
  if (G.held) { const h = P3.hand.getWorldPosition(tmpV); const b = G.held.pos; const arr = beamGeo.attributes.position.array; for (let k = 0; k < 12; k++) { const t = k / 11; const wob = Math.sin(t * Math.PI) * 0.25 * Math.sin(clock * 12 + t * 8); arr[k * 3] = h.x + (b.x - h.x) * t + wob; arr[k * 3 + 1] = h.y + (b.y - h.y) * t + Math.sin(t * Math.PI) * 0.6; arr[k * 3 + 2] = h.z + (b.z - h.z) * t - wob; } beamGeo.attributes.position.needsUpdate = true; if (Math.random() < 0.5) emitP(b.x + rnd(0.6), b.y + rnd(0.6), b.z + rnd(0.6), rnd(0.5), 0.6, rnd(0.5), '#7ff5dc', 0.35, 0.6, 0); }
  // attachment points + link
  let apn = 0;
  if (G.buildMode) {
    const addAP = (b) => { for (const p of b.parts) { const d = A.PART_DEFS[p.type]; const w = A.partWorld(b, p); const ex = d.shape === 'sphere' ? A.V(d.r, d.r, d.r) : d.half; for (const ax of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { if (apn >= apN) return; const o = A.qrot(w.q, A.V(ax[0] * ex.x, ax[1] * ex.y, ax[2] * ex.z)); apPos[apn * 3] = w.pos.x + o.x; apPos[apn * 3 + 1] = w.pos.y + o.y; apPos[apn * 3 + 2] = w.pos.z + o.z; apn++; } } };
    if (G.held) { addAP(G.held); for (const b of G.bodies) if (b !== G.held && A.vlen(A.vsub(b.pos, G.held.pos)) < b.radius + G.held.radius + 3) addAP(b); }
  }
  for (let k = apn; k < apN; k++) { apPos[k * 3 + 1] = -9999; }
  apGeo.attributes.position.needsUpdate = true; apMat.size = 0.4 + 0.12 * Math.sin(clock * 6);
  const cand = G.held ? A.attachCandidate(G) : null;
  link.visible = linkDot.visible = !!cand;
  if (cand) { const a = linkGeo.attributes.position.array; a[0] = cand.pa.x; a[1] = cand.pa.y; a[2] = cand.pa.z; a[3] = cand.pb.x; a[4] = cand.pb.y; a[5] = cand.pb.z; linkGeo.attributes.position.needsUpdate = true; linkDot.position.set(cand.pb.x, cand.pb.y, cand.pb.z); linkDot.scale.setScalar(1.2 + 0.4 * Math.sin(clock * 10)); }
  hudCache.cand = !!cand; $('tAttach').style.opacity = cand ? 1 : 0.55;
  syncBodies(dt);
  // enemies
  G.W.enemies.forEach((e, i) => { const m = enemyMeshes[i]; m.visible = e.alive; if (!e.alive) return; m.position.set(e.pos.x, e.pos.y + Math.abs(Math.sin(e.t * 8)) * 0.12, e.pos.z); m.rotation.y = e.face || 0; const s = e.hurt > 0 ? 1 + e.hurt * 0.8 : 1; m.scale.set(s, 2 - s, s); });
  G.W.nodes.forEach((n, i) => { nodeMeshes[i].visible = n.alive; });
  // cores
  for (const cm of coreMeshes) { const c = cm.c; const av = !c.taken && A.coreAvailable(G, c); cm.g.visible = av; if (!av) continue; cm.g.position.set(c.pos.x, c.pos.y + Math.sin(clock * 2 + c.pos.x) * 0.15, c.pos.z); cm.m.rotation.y = clock * 1.6; { const dd = A.vlen(A.vsub(c.pos, P.pos)); cm.beam.visible = dd > 18 && started; cm.beam.material.opacity = Math.min(0.1, (dd - 18) / 300); } if (Math.random() < 0.12) emitP(c.pos.x + rnd(0.5), c.pos.y + rnd(0.5), c.pos.z + rnd(0.5), 0, 0.8, 0, '#ffe17a', 0.3, 1.2, 0); }
  for (const fx of shrineFx) { const on = fx.S.done; if (fx.plate) fx.plate.material.color.set(on ? '#7ff5dc' : '#ffd36b'); fx.ring.material.color.set(on ? '#ffd36b' : '#7ff5dc'); fx.ring.position.y = fx.S.altar.y + 1.02 + (on ? Math.sin(clock * 3) * 0.08 : 0); if (fx.halo) fx.halo.rotation.z = clock; if (fx.bell && on) fx.bell.rotation.z = Math.sin(clock * 6) * 0.1 * Math.max(0, 1 - (clock % 6)); }
  for (const tf of towerFx) { const on = tf.Tw.active; { const cd = Math.hypot(camera.position.x - tf.Tw.x, camera.position.z - tf.Tw.z); tf.beam.material.opacity = on ? (0.16 + 0.05 * Math.sin(clock * 2)) * A.clamp((cd - 12) / 40, 0, 1) : 0; } tf.gem.rotation.y = clock * (on ? 1.5 : 0.4); tf.gem.material.emissive.set(on ? '#ffc93c' : '#2fbf9f'); tf.glow.material.color.set(on ? '#ffd66b' : '#7ff5dc'); tf.strip.material.color.set(on ? '#ffe9a8' : '#7ff5dc'); tf.strip2.material.color.copy(tf.strip.material.color); }
  G.W.crumbles.forEach((Cb, i) => { const m = crumbleMeshes[i]; if (Cb.fall > 0) { m.position.y = Cb.y - Cb.h / 2 - Cb.fall * Cb.fall * 6; m.visible = Cb.fall < 2.5; m.rotation.z = Cb.fall * 0.4; } else { m.visible = true; m.rotation.z = 0; m.position.y = Cb.y - Cb.h / 2 + (Cb.t > 0 ? rnd(0.04) : 0); } });
  G.W.rings.forEach((r, i) => { ringMeshes[i].material.color.set(r.hit ? '#7ff5dc' : '#ffd36b'); ringMeshes[i].scale.setScalar(1 + (r.hit ? 0 : Math.sin(clock * 3 + i) * 0.05)); });
  // Sunken Isle
  const I = G.W.sunken; const dy = I.y - I.y0; sunkenMesh.position.y = dy; sunkenGroup.position.y = dy; bigDraftMesh.visible = G.W.bigDraft.active;
  if (G.sunkenRise > 0 && G.sunkenRise < 1) { for (let k = 0; k < 6; k++) { const a = Math.random() * 6.28; emitP(I.x + Math.cos(a) * I.r, I.y - 2, I.z + Math.sin(a) * I.r, 0, -3 - Math.random() * 4, 0, Math.random() < 0.5 ? '#d9c7a6' : '#ffffff', 1.2, 2.5, 4); } }
  // water / falls / drafts / clouds
  waterMat.uniforms.t.value = clock; draftMat.uniforms.t.value = clock; grassUniform.value = clock;
  for (const f of falls) { f.tex.offset.y = (clock * 0.9) % 1; }
  cloudMat.uniforms.t.value = clock; clouds2.material.uniforms.t.value = clock + 50; cloudMat.uniforms.camY.value = camera.position.y;
  skyUniforms.t.value = clock; sky.position.copy(camera.position);
  skyUniforms.aurora.value += ((G.endingStarted ? (endT > 0 && G.ending < 1 ? 1 : 0.45 + 0.55 * skyUniforms.night.value) : 0) - skyUniforms.aurora.value) * Math.min(1, dt * 0.5);
  // ambient particles near the camera, per region
  ambT += dt; const n = Math.floor(ambT * 40); ambT -= n / 40;
  const reg = P.pos.y < -50 ? 'hollows' : (gb.island ? gb.island.biome : 'sky');
  for (let k = 0; k < n; k++) {
    const x = P.pos.x + rnd(22), y = P.pos.y + Math.random() * 12 - 2, z = P.pos.z + rnd(22);
    if (reg === 'hollows') emitP(x, y, z, rnd(0.3), 0.3 + Math.random() * 0.4, rnd(0.3), ['#9ffbe6', '#ffc7f3', '#fff3a8'][k % 3], 0.35, 4, 0);
    else if (reg === 'ruins') emitP(x, P.pos.y + 14, z, -2, -26, 0.6, '#cfe0ff', 0.14, 0.8, 0);
    else if (reg === 'peaks') emitP(x, y + 6, z, rnd(0.6), -1.2, rnd(0.6), Math.random() < 0.3 ? '#bff6ff' : '#ffffff', 0.2, 4, 0);
    else if (reg === 'plateau') emitP(x, y, z, 3 + Math.random() * 2, rnd(0.4), 2, '#f2e6a0', 0.18, 3, 0);
    else if (k % 2 === 0) emitP(x, y, z, rnd(0.4), 0.15, rnd(0.4), skyUniforms.night.value > 0.5 ? '#fff6a8' : '#ffffff', 0.16, 3.5, 0);
  }
  if (G.endingStarted && endT > 0) for (let k = 0; k < 8; k++) emitP(rnd(250), -20 + Math.random() * 120, rnd(250) - 40, 0, 2 + Math.random() * 3, 0, ['#9ffbe6', '#ffd66b', '#c9b6ff'][k % 3], 2.4, 5, 0);
  for (const u of activeDraftsVis()) if (A.vlen(A.V(u.x - P.pos.x, 0, u.z - P.pos.z)) < 60 && Math.random() < 0.5) emitP(u.x + rnd(u.r * 0.8), Math.max(u.y0, P.pos.y - 20) + Math.random() * 30, u.z + rnd(u.r * 0.8), 0, 10 + Math.random() * 6, 0, '#ffffff', 0.25, 1.4, 0);
  if (P.mode === 'glide' && Math.random() < 0.6) { const w = P3.glider.getWorldPosition(tmpV); emitP(w.x + rnd(1.4), w.y - 0.2, w.z + rnd(1.4), -P.vel.x * 0.3, 0, -P.vel.z * 0.3, '#ffffff', 0.25, 0.6, 0); }
  if ((Math.abs(P.vel.x) + Math.abs(P.vel.z) > 12) && P.mode !== 'helm' && Math.random() < 0.7) emitP(P.pos.x + rnd(0.3), P.pos.y + 1 + rnd(0.4), P.pos.z + rnd(0.3), 0, 0, 0, '#bff7ff', 0.5, 0.25, 0);
  updateParticles(dt);
  // vignette & flash
  $('flash').style.opacity = flash; flash = Math.max(0, flash - dt * 1.2);
}
const activeDraftsVis = () => G.W.bigDraft.active ? G.W.updrafts.concat([G.W.bigDraft]) : G.W.updrafts;
function frame() { const now = performance.now();
  requestAnimationFrame(frame);
  const rawDt = Math.max(0, (now - last) / 1000); let dt = Math.min(0.1, rawDt); last = now; clock += dt;
  fpsAcc += rawDt; fpsN++; if (fpsAcc > 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 24 && dynScale > 0.35) { dynScale = Math.max(0.35, dynScale * 0.75); resize(); } else if (fps > 52 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.1); resize(); } }
  if (started && !paused) {
    if (hitstop > 0) { hitstop -= dt; dt *= 0.15; }
    const km = keyMove(); const mx = A.clamp(input.mx + km.x, -1, 1), mz = A.clamp(input.mz + km.z, -1, 1);
    const inp = { mx, mz, jumpHeld: input.jumpHeld || keys.has('Space'), jumpPressed: input.jumpPressed, dashPressed: input.dashPressed, sprint: input.sprint || keys.has('ShiftLeft') || keys.has('ShiftRight') };
    if (wowT > 0 && wowT < 9.5) { inp.mx = inp.mz = 0; }
    A.step(G, inp, dt);
    input.jumpPressed = false; input.dashPressed = false;
    if (wowT > 0) wowT += dt;
    if (endT > 0) { endT += dt; if (G.ending > 0.4 && $('ending').classList.contains('hidden')) { $('ending').classList.remove('hidden'); $('endText').innerHTML = `With ${A.coresTaken(G)} Ancient Cores restored, the islands remember their place in the sky. Light flows from the spires, the aurora returns, and the realm of Aetherion is whole again.<br><br>Thank you for playing, wanderer.<br><small>A game made for Colin.</small>`; } }
    flushEvents();
    saveT += dt; if (saveT > 8) { saveT = 0; saveGame(); }
    if (AU.ctx) { const P = G.player; const reg = P.pos.y < -50 ? 'hollows' : (A.groundAt(G.W, P.pos.x, P.pos.y + 1, P.pos.z, 0).island || { biome: 'verdant' }).biome; musicTick(reg); const spd = A.vlen(P.vel); const wv = (P.mode === 'glide' ? 0.25 : 0) + Math.min(0.3, Math.max(0, -P.vel.y - 6) * 0.02) + (reg === 'plateau' || reg === 'ruins' ? 0.06 : 0.02); AU.windGain.gain.setTargetAtTime(wv, AU.ctx.currentTime, 0.3); AU.windFilter.frequency.setTargetAtTime(400 + spd * 40, AU.ctx.currentTime, 0.3); }
    updateHUD(dt);
  } else if (!started) { G.time = 0.44; }
  if (settings.daylight && !G.endingStarted) G.time = 0.45;
  if (endT > 0 && G.ending < 1) G.time += (0.9 - G.time) * Math.min(1, dt * 0.25);
  applyTime(G.time, dt);
  updateCamera(dt);
  updateVisuals(dt);
  renderer.render(scene, camera);
  if (!window.__booted) { window.__booted = true; const l = $('loader'); l.style.opacity = 0; setTimeout(() => l.style.display = 'none', 650); }
}
// ---------- boot ----------
function begin(cont) {
  initAudio();
  if (cont && hasSave()) { try { A.deserialize(G, localStorage.getItem(SAVE_KEY)); } catch (e) {} }
  if (G.endingStarted) G.ending = 0;
  started = true; $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
  cam.yaw = G.player.yaw; cam.target.set(G.player.pos.x, G.player.pos.y + 1.6, G.player.pos.z);
  for (const I of G.W.islands) if (A.groundAt(G.W, G.player.pos.x, G.player.pos.y + 1, G.player.pos.z, 0).island === I) lastBiome = I.name;
  if (!cont) { toast('Welcome to Aetherion. Wake the Spires and gather Ancient Cores.', true); setTimeout(() => toast(isTouch ? 'Tap Forge, then tap an object to grab it.' : 'Press F (or right-click) for the Forge Hand.'), 3200); }
  else toast('Welcome back, wanderer.');
  saveGame();
}
$('bPlay').textContent = hasSave() ? 'Continue' : 'Begin';
if (hasSave()) $('bNew').style.display = '';
$('bPlay').onclick = () => begin(hasSave());
$('bNew').onclick = () => { if (confirm('Start a new journey? Your progress will be erased.')) { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} begin(false); } };
$('tHint').textContent = isTouch ? 'Best with sound on. Rotate your phone either way.' : 'Click to look around · WASD to move · F for the Forge Hand';
$('bEndCont').onclick = () => { $('ending').classList.add('hidden'); endT = 0; G.ending = 0; toast('The realm is whole. Explore and build freely!', true); };
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__ae = { state: () => ({ started, paused, uiOpen, hitstop, last }), G: () => G, A, T, camera, renderer, scene, AU, settings, input, actions, cam, pickAt, screenOf, tapPick, toggleForge, applyVolumes, begin, fps: () => fps, partMeshes, openPause, closeUI, saveGame, build: '__BUILD__' };
requestAnimationFrame(frame);
})();
