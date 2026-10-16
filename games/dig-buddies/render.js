// Dig Buddies 3D diorama renderer (Three.js r169). Instanced tiles, toon lighting, tilt-shift, particles and Pip the mole.
import * as THREE from './vendor/three/three.module.js';

export const PALETTE = [ // per area
  { sky: ['#8fd3ff', '#dff5ff', '#fff4d6'], fog: '#cdeeff', grass: [0x7ccf4f, 0x6cbf43], soil: [0xb07a4a, 0xa06b3e], dirt: 0x8a5a33, base: 0x6cbf43, ground: 0x8ad35c, sun: 0xfff1d0, sunI: 2.3, hemi: [0xdff4ff, 0x6a8a3a, 1.1] },
  { sky: ['#57c3f0', '#bff0ff', '#fff6dc'], fog: '#c8f1ff', grass: [0xf3dc9a, 0xe9cf86], soil: [0xc99a62, 0xbb8b55], dirt: 0xb48a5a, base: 0xf0d796, ground: 0x46c3d6, sun: 0xfff3d6, sunI: 2.5, hemi: [0xe8fbff, 0xc9a96a, 1.1] },
  { sky: ['#1b1440', '#3a2a6e', '#7a4f8a'], fog: '#2c2457', grass: [0x6a9a5a, 0x5c8a50], soil: [0x9a6a48, 0x8a5e40], dirt: 0x6a4630, base: 0x4f7a4a, ground: 0x3a5e3c, sun: 0xb4c4ff, sunI: 1.35, hemi: [0x9a9ae0, 0x3a3048, 1.15] },
  { sky: ['#9fc3e8', '#dbe9f7', '#fdf2ef'], fog: '#e3edf7', grass: [0xf6f9ff, 0xe6eef9], soil: [0x9a7458, 0x8c684e], dirt: 0x7c5a42, base: 0xf2f6fc, ground: 0xeef3fa, sun: 0xfff0e0, sunI: 2.0, hemi: [0xeaf3ff, 0x9aa7bf, 1.15] },
];
// colour-blind-friendly number colours (Okabe-Ito based) with strong outlines
const NUMCOL = ['#000', '#1f6fd1', '#0f9a6c', '#e0571b', '#7b3fb0', '#b5790a', '#0b8aa0', '#3a3a3a', '#8a8a8a'];

function toonRamp() { const d = new Uint8Array([90, 160, 225, 255]); const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; }
function roundedBox(w, h, d, r, seg = 4) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); c.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
    const dir = v.clone().sub(c); if (dir.lengthSq() < 1e-9) dir.copy(n.array.length ? new THREE.Vector3().fromBufferAttribute(n, i) : new THREE.Vector3(0, 1, 0)); dir.normalize();
    p.setXYZ(i, c.x + dir.x * r, c.y + dir.y * r, c.z + dir.z * r); n.setXYZ(i, dir.x, dir.y, dir.z);
  }
  return g;
}
function paint(g, fn) { const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), C = new THREE.Color(); for (let i = 0; i < p.count; i++) { fn(C, p.getX(i), p.getY(i), p.getZ(i), n.getY(i)); col.set([C.r, C.g, C.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; }
function merge(list) { // [geometry, colorHex|null, matrix]
  const pos = [], nor = [], col = [], C = new THREE.Color();
  for (const [g0, hex, m] of list) {
    const g = (g0.index ? g0.toNonIndexed() : g0.clone()); if (m) g.applyMatrix4(m);
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); if (hex !== null && hex !== undefined) { C.set(hex); col.push(C.r, C.g, C.b); } else if (c) col.push(c.getX(i), c.getY(i), c.getZ(i)); else col.push(1, 1, 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g;
}
const M = (x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const easeOutBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const clamp01 = t => Math.max(0, Math.min(1, t));

function glyphTex(n, mode) { // mode: 0 normal, 1 patterns, 2 '?' frost, 3 '?' dark
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d');
  x.fillStyle = 'rgba(60,35,15,0.35)'; x.beginPath(); x.ellipse(S / 2 + 3, S / 2 + 6, 50, 46, 0, 0, 7); x.fill();
  const grd = x.createRadialGradient(S / 2 - 14, S / 2 - 16, 6, S / 2, S / 2, 54); grd.addColorStop(0, mode === 3 ? '#8c86a8' : '#fffdf6'); grd.addColorStop(1, mode === 3 ? '#5a5478' : mode === 2 ? '#cfe9ff' : '#efe2c8');
  x.fillStyle = grd; x.beginPath(); x.ellipse(S / 2, S / 2, 50, 46, 0, 0, 7); x.fill(); x.lineWidth = 4; x.strokeStyle = 'rgba(90,60,30,0.35)'; x.stroke();
  x.font = '700 78px Fredoka, "Arial Rounded MT Bold", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const t = mode >= 2 ? '?' : String(n); const col = mode === 2 ? '#5b95c9' : mode === 3 ? '#c9c4e6' : NUMCOL[n];
  x.lineWidth = 10; x.strokeStyle = '#fffaf0'; x.lineJoin = 'round'; if (mode < 2) x.strokeText(t, S / 2, S / 2 + 4); x.fillStyle = col; x.fillText(t, S / 2, S / 2 + 4);
  if (mode === 1) { x.fillStyle = col; for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + k / n * Math.PI * 2; x.beginPath(); x.arc(S / 2 + Math.cos(a) * 41, S / 2 + Math.sin(a) * 37, 5.5, 0, 7); x.fill(); } }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
function faceTex() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d');
  x.fillStyle = '#fff3dc'; x.fillRect(0, 0, S, S); x.strokeStyle = '#3a2418'; x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); x.moveTo(30, 44); x.lineTo(54, 54); x.moveTo(98, 44); x.lineTo(74, 54); x.stroke(); // grumpy brows
  x.fillStyle = '#3a2418'; x.beginPath(); x.arc(46, 66, 7, 0, 7); x.arc(82, 66, 7, 0, 7); x.fill();
  x.beginPath(); x.arc(64, 98, 12, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
  x.fillStyle = 'rgba(255,120,120,0.5)'; x.beginPath(); x.arc(30, 80, 9, 0, 7); x.arc(98, 80, 9, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function capTex() { const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'); x.fillStyle = '#e8463c'; x.fillRect(0, 0, S, S); x.fillStyle = '#fff6ea'; for (const [a, b, r] of [[20, 30, 10], [64, 20, 13], [104, 34, 9], [40, 70, 8], [88, 76, 11], [14, 100, 7], [64, 108, 6], [116, 96, 8]]) { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t; }
function glowTex(inner = 'rgba(255,214,140,1)') { const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'); const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, inner); g.addColorStop(1, 'rgba(255,200,120,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); return new THREE.CanvasTexture(cv); }
function skyTex(stops) { const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256; const x = cv.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 256); stops.forEach((s, k) => g.addColorStop(k / (stops.length - 1), s)); x.fillStyle = g; x.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }

const TiltShift = {
  uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, focus: { value: 0.5 }, amount: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float focus; uniform float amount; varying vec2 vUv;
  void main(){ float d = abs(vUv.y - focus); float b = smoothstep(0.28, 0.62, d) * amount * 5.0; vec4 c = texture2D(tDiffuse, vUv);
    if (b > 0.05) { vec4 acc = c; float w = 1.0; for (int i = 0; i < 12; i++) { float a = float(i) * 2.39996; float r = sqrt(float(i) + 0.5) / 3.6; vec2 o = vec2(cos(a), sin(a)) * r * b / res; acc += texture2D(tDiffuse, vUv + o); w += 1.0; } c = acc / w; }
    vec2 q = vUv - 0.5; c.rgb *= 1.0 - dot(q, q) * 0.45; c.rgb = mix(vec3(dot(c.rgb, vec3(0.299,0.587,0.114))), c.rgb, 1.08);
    gl_FragColor = c;
    #include <colorspace_fragment>
  }`,
};

export class World {
  constructor(canvas) {
    this.canvas = canvas; this.reduced = false; this.patterns = false; this.time = 0; this.anims = []; this.hat = 'straw';
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 300);
    this.ramp = toonRamp();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1); this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(-8, 16, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 }); sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02; this.scene.add(sun, sun.target);
    this.board = new THREE.Group(); this.scene.add(this.board); this.props = new THREE.Group(); this.scene.add(this.props);
    this.target = new THREE.Vector3(); this.zoom = 1; this.pan = new THREE.Vector2(); this.fitD = 20; this.rect = { x: 0, y: 0, w: 100, h: 100 };
    this.mats = {
      toonV: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.ramp }),
      ice: new THREE.MeshToonMaterial({ color: 0xcfeeff, gradientMap: this.ramp, transparent: true, opacity: 0.82, emissive: 0x335577, emissiveIntensity: 0.2 }),
    };
    this.glyphTexs = {}; this.buildShared(); this.buildPost(); this.buildMole();
    this.area = -1; this.b = null;
  }
  buildShared() {
    const T = this.mats.toonV;
    this.geo = {
      grass: paint(roundedBox(0.94, 0.36, 0.94, 0.13, 3), (C, x, y, z, ny) => { const v = ny > 0.6 ? 1 : ny < -0.5 ? 0.45 : 0.62 + (y + 0.18) * 0.9; C.setRGB(v, v, v); }),
      soil: paint(roundedBox(0.96, 0.62, 0.96, 0.1, 3), (C, x, y, z, ny) => { if (ny > 0.6) { C.setRGB(1.08, 1.02, 0.95); return; } const band = Math.floor((y + 0.31) * 9) % 3; const v = (ny < -0.5 ? 0.35 : 0.55 + band * 0.12 + (y + 0.31) * 0.4); C.setRGB(v, v * 0.95, v * 0.9); }),
      glyph: new THREE.PlaneGeometry(0.88, 0.88),
      ice: roundedBox(0.9, 0.16, 0.9, 0.07, 2),
    };
    const post = new THREE.CylinderGeometry(0.035, 0.045, 0.6, 6), board = roundedBox(0.4, 0.22, 0.05, 0.03, 1), cap = new THREE.ConeGeometry(0.06, 0.08, 6);
    this.geo.flag = merge([[post, 0x9a6a3c, M(0, 0.3, 0)], [board, 0xf4e3c1, M(0.06, 0.5, 0, 1, 1, 1, 0, 0, -0.06)], [roundedBox(0.3, 0.06, 0.055, 0.02, 1), 0xe8463c, M(0.06, 0.52, 0.002, 1, 1, 1, 0, 0, -0.06)], [cap, 0xe8463c, M(0, 0.63, 0)], [new THREE.SphereGeometry(0.07, 6, 4), 0x6cbf43, M(0, 0.02, 0, 1.3, 0.4, 1.3)]]);
    const rock = new THREE.IcosahedronGeometry(0.4, 1); { const p = rock.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.12 * Math.sin(p.getX(i) * 9 + p.getZ(i) * 7) + 0.08 * Math.cos(p.getY(i) * 11); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); } rock.computeVertexNormals(); }
    this.geo.rock = merge([[paint(rock, (C, x, y) => { const v = 0.55 + y * 0.6; C.setRGB(v * 0.95, v, v * 1.02); }), null, M(0, 0.48, 0)], [new THREE.SphereGeometry(0.12, 6, 4), 0x7fbf55, M(0.12, 0.72, 0.05, 1.3, 0.35, 1)]]);
    const blade = new THREE.ConeGeometry(0.035, 0.2, 4);
    this.decoGeos = [
      [merge([[blade, 0x5aa83a, M(0, 0.1, 0, 1, 1, 1, 0.2, 0, 0.25)], [blade, 0x66b842, M(0.05, 0.1, 0.02, 1, 1.2, 1, -0.1, 0, -0.2)], [blade, 0x4f9a33, M(-0.04, 0.09, -0.03, 1, 0.9, 1, 0, 0, 0.1)]]),
       merge([[new THREE.CylinderGeometry(0.012, 0.012, 0.18, 4), 0x4f9a33, M(0, 0.09, 0)], ...[0, 1, 2, 3, 4].map(k => [new THREE.SphereGeometry(0.045, 6, 4), 0xffffff, M(Math.cos(k * 1.256) * 0.055, 0.19, Math.sin(k * 1.256) * 0.055, 1, 0.5, 1)]), [new THREE.SphereGeometry(0.04, 6, 4), 0xffcc33, M(0, 0.2, 0)]])],
      [merge([[new THREE.ConeGeometry(0.07, 0.06, 5), 0xffd7c4, M(0, 0.03, 0, 1, 1, 0.6, 0, 0, 0)], [new THREE.ConeGeometry(0.05, 0.05, 5), 0xff9e88, M(0.02, 0.05, 0, 1, 1, 0.6)]]),
       merge([...[0, 1, 2, 3, 4].map(k => [new THREE.ConeGeometry(0.03, 0.12, 4), 0xff8a5c, M(Math.cos(k * 1.256) * 0.05, 0.02, Math.sin(k * 1.256) * 0.05, 1, 1, 1, Math.PI / 2, -k * 1.256, 0)])])],
      [merge([[blade, 0x3f7a3a, M(0, 0.1, 0, 1, 1, 1, 0.2, 0, 0.25)], [blade, 0x467f3d, M(0.05, 0.1, 0.02, 1, 1.2, 1, -0.1, 0, -0.2)]]),
       merge([[new THREE.SphereGeometry(0.09, 8, 6), 0xf28c28, M(0, 0.07, 0, 1.2, 0.8, 1.2)], [new THREE.CylinderGeometry(0.012, 0.015, 0.06, 4), 0x5a7a2a, M(0, 0.15, 0)]])],
      [merge([[new THREE.SphereGeometry(0.07, 8, 6), 0xffffff, M(0, 0.05, 0)], [new THREE.SphereGeometry(0.05, 8, 6), 0xffffff, M(0, 0.13, 0)], [new THREE.ConeGeometry(0.012, 0.05, 4), 0xff8a3c, M(0, 0.13, 0.05, 1, 1, 1, Math.PI / 2, 0, 0)]]),
       merge([[new THREE.ConeGeometry(0.06, 0.16, 6), 0x2f7a4f, M(0, 0.1, 0)], [new THREE.ConeGeometry(0.04, 0.08, 6), 0xffffff, M(0, 0.17, 0)]])],
    ];
    // particles
    const P = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = n; const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < n; i++) { m.setMatrixAt(i, z); m.setColorAt(i, new THREE.Color(1, 1, 1)); } this.scene.add(m); return { m, n, live: [], next: 0 }; };
    this.crumbs = P(new THREE.DodecahedronGeometry(0.05, 0), new THREE.MeshToonMaterial({ gradientMap: this.ramp }), 500);
    this.sparks = P(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 200);
    this.dust = P(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshToonMaterial({ gradientMap: this.ramp, transparent: true, opacity: 0.9 }), 80);
    this.confetti = P(new THREE.PlaneGeometry(0.12, 0.07), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 360);
    this.coinGeo = merge([[new THREE.CylinderGeometry(0.2, 0.2, 0.06, 18), 0xffc83a, M(0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0)], [new THREE.CylinderGeometry(0.12, 0.12, 0.07, 4), 0xffe58a, M(0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0)]]);
    this.coinMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.ramp, emissive: 0x553300, emissiveIntensity: 0.4 });
    this.faceTex = faceTex(); this.capTex = capTex(); this.glow = glowTex();
  }
  buildPost() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType });
    this.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.postMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(TiltShift.uniforms), vertexShader: TiltShift.vertexShader, fragmentShader: TiltShift.fragmentShader, depthTest: false, depthWrite: false });
    this.postMat.uniforms.tDiffuse.value = this.rt.texture;
    this.postScene = new THREE.Scene(); this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
  }
  setQuality(reduced) {
    this.reduced = reduced; const dpr = Math.min(window.devicePixelRatio || 1, reduced ? 1.5 : 2); this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = !reduced; this.sun.castShadow = !reduced; this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }
  resize() {
    // Size from the canvas's real on-screen box (CSS px), not window.innerWidth/innerHeight: on iOS the canvas (100vh) and
    // innerHeight disagree, so the picture got stretched relative to the maths used for taps.
    const r = this.renderer.domElement.getBoundingClientRect(); const w = Math.max(1, Math.round(r.width) || window.innerWidth), h = Math.max(1, Math.round(r.height) || window.innerHeight);
    this.cvX = r.left || 0; this.cvY = r.top || 0; this.vw = w; this.vh = h; this.renderer.setSize(w, h, false);
    const dpr = this.renderer.getPixelRatio(); this.rt.setSize(Math.floor(w * dpr), Math.floor(h * dpr)); this.postMat.uniforms.res.value.set(w * dpr, h * dpr);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.fit();
  }
  // ---------- area backdrop ----------
  setArea(a, night = false) {
    const key = a + (night ? 'n' : ''); if (this.areaKey === key) return; this.areaKey = key; this.area = a; this.night = night || a === 2;
    const P = this.pal = PALETTE[this.night && a !== 2 ? 2 : a] && PALETTE[a];
    const pal = this.night ? { ...P, sky: a === 3 ? ['#141a3c', '#2c3770', '#6a6aa0'] : P.sky, fog: a === 3 ? '#2b3264' : P.fog, sunI: 1.3, sun: 0xb4c4ff, hemi: [0x9a9ae0, 0x3a3858, 1.15] } : P;
    this.scene.background = skyTex(pal.sky); this.scene.fog = new THREE.Fog(pal.fog, 40, 110);
    this.sun.color.set(pal.sun); this.sun.intensity = pal.sunI; this.hemi.color.set(pal.hemi[0]); this.hemi.groundColor.set(pal.hemi[1]); this.hemi.intensity = pal.hemi[2];
    this.props.clear(); this.livers = [];
    const T = this.mats.toonV, ramp = this.ramp, add = (g, x, y, z, s = 1, ry = 0) => { const m = new THREE.Mesh(g, T); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = ry; m.castShadow = !this.reduced; m.receiveShadow = true; this.props.add(m); return m; };
    // ground
    if (a === 1) {
      const wm = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, fogColor: { value: new THREE.Color(pal.fog) } }, transparent: false,
        vertexShader: 'uniform float t; varying vec3 vP; void main(){ vec3 p = position; p.z += sin(p.x*0.5+t*1.2)*0.12 + cos(p.y*0.4+t*0.9)*0.12; vP = p; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.); }',
        fragmentShader: 'uniform float t; varying vec3 vP; void main(){ float w = sin(vP.x*0.5+t*1.2)+cos(vP.y*0.4+t*0.9); float r = length(vP.xy); vec3 deep = vec3(0.12,0.62,0.78), shal = vec3(0.45,0.88,0.9); vec3 c = mix(shal, deep, smoothstep(10.,40.,r)); c += step(1.55, w + sin(vP.x*2.+vP.y*1.7+t*2.)*0.4)*0.25; gl_FragColor = vec4(c,1.);\n#include <colorspace_fragment>\n}' });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 60, 60), wm); water.rotation.x = -Math.PI / 2; water.position.y = -0.95; this.props.add(water); this.water = wm;
    } else { this.water = null; const g = new THREE.Mesh(new THREE.CircleGeometry(140, 48), new THREE.MeshToonMaterial({ color: pal.ground, gradientMap: ramp })); g.rotation.x = -Math.PI / 2; g.position.y = -0.9; g.receiveShadow = true; this.props.add(g); }
    this.rebuildProps();
  }
  rebuildProps() {
    if (!this.b || this.area < 0) return; const a = this.area, W = this.b.W, H = this.b.H; const big = Math.max(W, H);
    // remove previous ring props (keep ground/water = first child)
    while (this.props.children.length > 1) this.props.remove(this.props.children[1]);
    this.livers = []; const T = this.mats.toonV, P = PALETTE[a];
    const add = (g, x, y, z, s = 1, ry = 0) => { const m = new THREE.Mesh(g, T); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = ry; m.castShadow = !this.reduced; m.receiveShadow = true; this.props.add(m); return m; };
    const slab = paint(roundedBox(1, 1, 1, 0.08, 2), (C, x, y, z, ny) => { const c = new THREE.Color(ny > 0.6 ? P.base : P.dirt); if (ny <= 0.6) c.multiplyScalar(0.7 + (y + 0.5) * 0.5); C.copy(c); });
    const s = add(slab, 0, -0.62, 0); s.scale.set(Math.max(W, H) + 1.6, 0.9, Math.max(W, H) + 1.6); // square slab so rotation never shows a gap
    const R = (k => () => (k = (k * 16807) % 2147483647) / 2147483647)(a * 97 + 13);
    const tree = a === 1 ? merge([[new THREE.CylinderGeometry(0.12, 0.18, 2.6, 6), 0xa47a4a, M(0, 1.3, 0, 1, 1, 1, 0, 0, 0.12)], ...[0, 1, 2, 3, 4].map(k => [new THREE.ConeGeometry(0.35, 1.6, 4), 0x3fae5a, M(0.16 + Math.cos(k * 1.26) * 0.7, 2.6, Math.sin(k * 1.26) * 0.7, 1, 1, 0.4, Math.cos(k * 1.26) * 1.2, -k * 1.26, Math.sin(k * 1.26) * -1.2)])])
      : a === 3 ? merge([[new THREE.CylinderGeometry(0.1, 0.14, 0.5, 6), 0x7a5232, M(0, 0.25, 0)], [new THREE.ConeGeometry(0.8, 1.1, 8), 0x2f7a4f, M(0, 0.9, 0)], [new THREE.ConeGeometry(0.62, 0.9, 8), 0x3a8a58, M(0, 1.45, 0)], [new THREE.ConeGeometry(0.42, 0.7, 8), 0xffffff, M(0, 1.95, 0)], [new THREE.ConeGeometry(0.7, 0.3, 8), 0xffffff, M(0, 1.05, 0)]])
      : merge([[new THREE.CylinderGeometry(0.12, 0.18, 1.0, 6), a === 2 ? 0x4a3428 : 0x8a5a36, M(0, 0.5, 0)], [new THREE.IcosahedronGeometry(0.75, 1), a === 2 ? 0x2f5a3a : 0x5cbf4a, M(0, 1.45, 0)], [new THREE.IcosahedronGeometry(0.5, 1), a === 2 ? 0x3a6a42 : 0x72d15a, M(0.4, 1.2, 0.3)], ...(a === 2 || a === 0 ? [0, 1, 2, 3].map(k => [new THREE.SphereGeometry(0.1, 6, 4), a === 2 ? 0xd94a3a : 0xff6f8a, M(Math.cos(k * 1.6) * 0.62, 1.3 + (k % 2) * 0.3, Math.sin(k * 1.6) * 0.62)]) : [])]);
    const bush = merge([[new THREE.IcosahedronGeometry(0.4, 1), a === 3 ? 0xffffff : a === 1 ? 0x6fc46a : a === 2 ? 0x2f5a3a : 0x4fae3f, M(0, 0.25, 0, 1.2, 0.8, 1)], [new THREE.IcosahedronGeometry(0.3, 1), a === 3 ? 0xf0f4ff : 0x5ab84a, M(0.35, 0.2, 0.1)]]);
    const house = merge([[roundedBox(1.2, 0.9, 1, 0.05, 1), 0xf3d9b8, M(0, 0.45, 0)], [new THREE.ConeGeometry(0.98, 0.7, 4), 0xc9483c, M(0, 1.25, 0, 1, 1, 0.8, 0, Math.PI / 4, 0)], [new THREE.ConeGeometry(0.98, 0.25, 4), 0xffffff, M(0, 1.5, 0, 0.8, 1, 0.65, 0, Math.PI / 4, 0)], [new THREE.BoxGeometry(0.25, 0.25, 0.02), 0xffd76a, M(-0.25, 0.55, 0.51)], [new THREE.BoxGeometry(0.25, 0.25, 0.02), 0xffd76a, M(0.28, 0.55, 0.51)], [new THREE.BoxGeometry(0.15, 0.4, 0.15), 0x9a6a5a, M(0.35, 1.5, 0)]]);
    const umbrella = merge([[new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), 0xffffff, M(0, 0.8, 0, 1, 1, 1, 0, 0, 0.15)], ...[0, 1, 2, 3, 4, 5, 6, 7].map(k => [new THREE.ConeGeometry(1, 0.4, 3, 1, true, k * Math.PI / 4, Math.PI / 4), k % 2 ? 0xffffff : 0xff6a5a, M(0.12, 1.6, 0)])]);
    const pumpkin = merge([[new THREE.SphereGeometry(0.35, 10, 8), 0xf28c28, M(0, 0.25, 0, 1.25, 0.85, 1.25)], [new THREE.CylinderGeometry(0.04, 0.05, 0.14, 5), 0x4a6a2a, M(0, 0.55, 0)], [new THREE.BoxGeometry(0.1, 0.08, 0.02), 0xffe680, M(-0.12, 0.3, 0.43)], [new THREE.BoxGeometry(0.1, 0.08, 0.02), 0xffe680, M(0.12, 0.3, 0.43)]]);
    const edge = big / 2 + 1.7;
    for (let k = 0; k < 26; k++) {
      const ang = R() * Math.PI * 2, rad = edge + 0.6 + R() * 9; const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad * 0.9 - 2;
      if (z > edge * 0.6 && Math.abs(x) < edge + 2) continue; // keep the front clear
      const y = a === 1 ? -0.95 : -0.9; const roll = R();
      if (a === 1) { if (rad > edge + 4) continue; add(roll < 0.4 ? tree : roll < 0.7 ? umbrella : bush, x, -0.2, z, 0.8 + R() * 0.5, R() * 6); }
      else if (a === 3 && roll < 0.3) add(house, x, y, z, 0.9 + R() * 0.4, Math.atan2(-x, -z));
      else if (a === 2 && roll < 0.25) add(pumpkin, x, y, z, 0.8 + R() * 0.6, R() * 6);
      else add(roll < 0.6 ? tree : bush, x, y, z, 0.8 + R() * 0.6, R() * 6);
    }
    if (a === 1) { // sand ring around the slab
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(edge + 3.5, edge + 4.5, 0.4, 40), new THREE.MeshToonMaterial({ color: 0xf3dc9a, gradientMap: this.ramp })); sand.position.y = -0.95; sand.receiveShadow = true; this.props.add(sand);
    }
    // living things
    const n = this.reduced ? 0.5 : 1;
    if (a === 0 || a === 1) { // butterflies / gulls
      for (let k = 0; k < Math.round(6 * n); k++) {
        const g = new THREE.Group(); const wing = new THREE.MeshBasicMaterial({ color: a === 1 ? 0xffffff : [0xffd34d, 0xff8fb1, 0x8fd3ff][k % 3], side: THREE.DoubleSide });
        const w1 = new THREE.Mesh(new THREE.CircleGeometry(a === 1 ? 0.22 : 0.14, 8), wing), w2 = w1.clone(); w1.position.x = 0.12; w2.position.x = -0.12; g.add(w1, w2); g.userData = { w1, w2, ph: R() * 6, r: edge + 1 + R() * 4, h: 1.5 + R() * 2.5, sp: 0.15 + R() * 0.2 };
        this.props.add(g); this.livers.push(o => { const d = g.userData, t = this.time * d.sp + d.ph; g.position.set(Math.cos(t) * d.r, d.h + Math.sin(t * 3) * 0.4, Math.sin(t) * d.r * 0.8 - edge * 0.4); g.visible = g.position.z < 0; g.rotation.y = -t; const f = Math.sin(this.time * (a === 1 ? 6 : 16) + d.ph) * 0.9; d.w1.rotation.y = f; d.w2.rotation.y = -f; });
      }
    }
    if (a === 2 || this.night) { // fireflies + hanging lanterns
      const cnt = Math.round(60 * n), geo = new THREE.BufferGeometry(), pos = new Float32Array(cnt * 3), seeds = [];
      for (let k = 0; k < cnt; k++) seeds.push([R() * 6.28, edge * (0.4 + R() * 1.2), 0.5 + R() * 3, R() * 6.28]);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff2a0, size: 0.18, map: this.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.props.add(pts);
      this.livers.push(() => { for (let k = 0; k < cnt; k++) { const [a0, r, h, p] = seeds[k], t = this.time * 0.2 + a0; pos[k * 3] = Math.cos(t) * r + Math.sin(this.time + p) * 0.4; pos[k * 3 + 1] = h + Math.sin(this.time * 1.3 + p) * 0.5; pos[k * 3 + 2] = Math.sin(t) * r * 0.8; } geo.attributes.position.needsUpdate = true; pts.material.opacity = 0.7 + Math.sin(this.time * 3) * 0.3; });
      const lantern = merge([[new THREE.CylinderGeometry(0.04, 0.05, 2.2, 5), 0x3a2a20, M(0, 1.1, 0)], [new THREE.BoxGeometry(0.5, 0.04, 0.04), 0x3a2a20, M(0.2, 2.15, 0)]]);
      for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2 + 0.3, x = Math.cos(ang) * (edge + 0.4), z = Math.sin(ang) * (edge + 0.4); if (z > edge * 0.5) continue; add(lantern, x, -0.2, z); const gl = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb54a })); gl.position.set(x + 0.4, 1.75, z); this.props.add(gl); const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffb860, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); halo.scale.setScalar(1.8); halo.position.copy(gl.position); this.props.add(halo); }
    }
    if (a === 3) { // snowfall
      const cnt = Math.round(220 * n), geo = new THREE.BufferGeometry(), pos = new Float32Array(cnt * 3); for (let k = 0; k < cnt; k++) { pos[k * 3] = (R() - 0.5) * 40; pos[k * 3 + 1] = R() * 16; pos[k * 3 + 2] = (R() - 0.5) * 34; }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, map: this.glow, transparent: true, depthWrite: false })); this.props.add(pts);
      this.livers.push(dt => { for (let k = 0; k < cnt; k++) { pos[k * 3 + 1] -= dt * (0.6 + (k % 5) * 0.12); pos[k * 3] += Math.sin(this.time + k) * dt * 0.2; if (pos[k * 3 + 1] < -0.8) pos[k * 3 + 1] = 16; } geo.attributes.position.needsUpdate = true; });
    }
    if (a === 1) this.livers.push(() => { if (this.water) this.water.uniforms.t.value = this.time; });
  }
  // ---------- board ----------
  setBoard(b, area) {
    this.b = b; this.board.clear(); this.anims = []; this.pops = []; this.lanternFx = new Map(); this.shrooms = new Map();
    const N = b.N, P = PALETTE[area], T = this.mats.toonV; this.areaPal = P;
    const mk = (geo, mat, cast = true) => { const m = new THREE.InstancedMesh(geo, mat, N); m.castShadow = cast && !this.reduced; m.receiveShadow = true; m.frustumCulled = false; this.board.add(m); return m; };
    this.mGrass = mk(this.geo.grass, T); this.mSoil = mk(this.geo.soil, T); this.mFlag = mk(this.geo.flag, T); this.mRock = mk(this.geo.rock, T); this.mIce = mk(this.geo.ice, this.mats.ice, false);
    const dg = this.decoGeos[area]; this.mDeco = [mk(dg[0], T, false), mk(dg[1], T, false)];
    this.mGlyph = []; this.glyphOf = new Int8Array(N).fill(-1);
    for (let g = 0; g <= 10; g++) { // 1..8 numbers, 9 frost '?', 10 dark '?'
      const key = g + (this.patterns ? 'p' : ''); if (!this.glyphTexs[key]) this.glyphTexs[key] = glyphTex(g + 1, g === 9 ? 2 : g === 10 ? 3 : this.patterns ? 1 : 0);
      const m = mk(this.geo.glyph, new THREE.MeshBasicMaterial({ map: this.glyphTexs[key], transparent: true, depthWrite: false, opacity: g === 10 ? 0.75 : 1 }), false); m.receiveShadow = false; m.renderOrder = 2; this.mGlyph.push(m);
    }
    const Z = new THREE.Matrix4().makeScale(0, 0, 0), C = new THREE.Color();
    this.decoKind = new Int8Array(N).fill(-1); const R = (k => () => (k = (k * 16807) % 2147483647) / 2147483647)(b.W * 131 + b.H * 7 + 1);
    this.tileY = new Float32Array(N); this.press = -1; this.flagT = new Float32Array(N).fill(-9); this.revT = new Float32Array(N).fill(-9); this.numT = new Float32Array(N).fill(-9);
    for (let i = 0; i < N; i++) {
      const c = i % b.W, r = (i / b.W) | 0, chk = (c + r) % 2;
      for (const m of [this.mGrass, this.mSoil, this.mFlag, this.mRock, this.mIce, ...this.mDeco, ...this.mGlyph]) m.setMatrixAt(i, Z);
      this.mGrass.setColorAt(i, C.set(P.grass[chk])); this.mSoil.setColorAt(i, C.set(P.soil[chk])); this.mFlag.setColorAt(i, C.set(0xffffff)); this.mRock.setColorAt(i, C.set(0xffffff)); this.mDeco[0].setColorAt(i, C.set(0xffffff)); this.mDeco[1].setColorAt(i, C.set(0xffffff));
      if (R() < 0.42) this.decoKind[i] = R() < 0.6 ? 0 : 1; this.decoRot = this.decoRot || new Float32Array(4096); this.decoRot[i] = R() * 6.28; this.decoOff = this.decoOff || new Float32Array(8192); this.decoOff[i * 2] = (R() - 0.5) * 0.5; this.decoOff[i * 2 + 1] = (R() - 0.5) * 0.5;
    }
    for (const m of this.board.children) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.dirty = new Set(); for (let i = 0; i < N; i++) if (b.kind[i]) this.dirty.add(i);
    this.light = new THREE.Group(); this.board.add(this.light);
    this.orient(); this.rebuildProps(); this.fit(); this.placeMoleAtStart();
  }
  orient() { // rotate tall/wide boards to match the screen
    if (!this.b) return; const wide = this.vw > this.vh, bw = this.b.W, bh = this.b.H;
    const rot = (wide && bh > bw * 1.15) || (!wide && bw > bh * 1.15); this.board.rotation.y = rot ? Math.PI / 2 : 0; this.board.updateMatrixWorld(true);
    this.dirty && this.b && this.dirty.forEach(() => {}); if (this.b) for (let i = 0; i < this.b.N; i++) if (this.b.kind[i]) this.dirty.add(i);
  }
  cellPos(i, y = 0) { const b = this.b; return new THREE.Vector3(i % b.W - (b.W - 1) / 2, y, ((i / b.W) | 0) - (b.H - 1) / 2); }
  worldOf(i, y = 0) { return this.board.localToWorld(this.cellPos(i, y)); }
  setTileFrost(i, on) { const C = new THREE.Color(this.areaPal.grass[((i % this.b.W) + ((i / this.b.W) | 0)) % 2]); if (on) C.lerp(new THREE.Color(0xbfe6ff), 0.55); this.mGrass.setColorAt(i, C); this.mGrass.instanceColor.needsUpdate = true; }
  updateTile(i) {
    const b = this.b, t = this.time, p = this.cellPos(i), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
    let busy = false;
    // soil
    const rt = t - this.revT[i]; let sy = 1; if (rt < 0.4 && rt > 0) { sy = 1 - Math.sin(rt / 0.4 * Math.PI) * 0.18; busy = true; }
    this.mSoil.setMatrixAt(i, m4.compose(v.set(p.x, -0.11, p.z), q.identity(), s.set(1, sy, 1)));
    if (b.kind[i] === 2) { this.mRock.setMatrixAt(i, m4.compose(v.set(p.x, -0.0, p.z), q.setFromEuler(new THREE.Euler(0, i * 1.7, 0)), s.set(1, 1, 1))); return false; }
    // grass cap
    const pressed = this.press === i ? 0.82 : 1;
    if (!b.revealed[i] && !b.popped[i]) {
      this.mGrass.setMatrixAt(i, m4.compose(v.set(p.x, 0.2 + 0.18 * pressed, p.z), q.identity(), s.set(1, pressed, 1)));
      const dk = this.decoKind[i]; if (dk >= 0) { this.mDeco[dk].setMatrixAt(i, m4.compose(v.set(p.x + this.decoOff[i * 2], 0.2 + 0.36 * pressed, p.z + this.decoOff[i * 2 + 1]), q.setFromEuler(new THREE.Euler(0, this.decoRot[i], Math.sin(t * 2 + i) * 0.08)), s.set(1, 1, 1))); this.mDeco[1 - dk].setMatrixAt(i, Z); busy = busy || true; }
    } else if (rt < 0.45 && rt >= 0) {
      const k = rt / 0.45; this.mGrass.setMatrixAt(i, m4.compose(v.set(p.x, 0.38 + k * 0.9, p.z), q.setFromEuler(new THREE.Euler(k * 2, i, k * 1.5)), s.setScalar(Math.max(0.001, 1 - k))));
      const dk = this.decoKind[i]; if (dk >= 0) this.mDeco[dk].setMatrixAt(i, Z); busy = true;
    } else { this.mGrass.setMatrixAt(i, Z); const dk = this.decoKind[i]; if (dk >= 0) this.mDeco[dk].setMatrixAt(i, Z); }
    // flag signpost wobble
    if (b.flagged[i]) { const ft = t - this.flagT[i]; const drop = ft < 0.18 ? (1 - ft / 0.18) * 0.6 : 0; const wob = Math.exp(-ft * 4) * Math.sin(ft * 22) * 0.35; const sq = ft < 0.3 && ft > 0.18 ? 1 - Math.sin((ft - 0.18) / 0.12 * Math.PI) * 0.25 : 1;
      this.mFlag.setMatrixAt(i, m4.compose(v.set(p.x - 0.08, 0.56 + drop, p.z), q.setFromEuler(new THREE.Euler(0, -this.board.rotation.y - 0.3, wob)), s.set(1 / sq ** 0.5, sq, 1 / sq ** 0.5))); if (ft < 1.6) busy = true; }
    else this.mFlag.setMatrixAt(i, Z);
    // ice slab on a dug tile whose number is still frozen
    const hid = b.revealed[i] && b.ice[i] && !this.vis(i, 'ice');
    this.mIce.setMatrixAt(i, hid ? m4.compose(v.set(p.x, 0.27, p.z), q.identity(), s.set(1, 1, 1)) : Z);
    // number pebble
    const g = this.glyphOf[i], want = this.wantGlyph(i);
    if (g >= 0 && g !== want) this.mGlyph[g].setMatrixAt(i, Z);
    if (want >= 0) { const nt = t - this.numT[i]; const sc = nt < 0 ? 0 : nt < 0.35 ? easeOutBack(nt / 0.35) : 1; if (nt < 0.35) busy = true;
      this.mGlyph[want].setMatrixAt(i, m4.compose(v.set(p.x, 0.3 + (hid ? 0.1 : 0) + sc * 0.02, p.z - 0.04), q.setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.5, -this.board.rotation.y, 0, 'YXZ')), s.setScalar(Math.max(0.001, sc)))); }
    this.glyphOf[i] = want;
    return busy;
  }
  vis(i, what) { const b = this.b; if (what === 'ice') { if (!b.ice[i]) return true; for (const j of b.nb[i]) if (b.revealed[j]) return true; return false; } return true; }
  wantGlyph(i) { const b = this.b; if (!b.revealed[i] || !b.num[i] || b.mine[i]) return -1; if (!this.vis(i, 'ice')) return 9; if (b.night && !this.litFn(i)) return 10; return b.num[i] - 1; }
  refreshAll() { if (!this.b) return; for (let i = 0; i < this.b.N; i++) if (this.b.kind[i]) this.dirty.add(i); }
  // ---------- events ----------
  reveal(cells, opts = {}) { // cells: [[i, ring]]
    const t = this.time, b = this.b; let maxRing = 0;
    for (const [i, ring] of cells) {
      const d = ring * (opts.fast ? 0.02 : 0.045); maxRing = Math.max(maxRing, ring); this.revT[i] = t + d; this.numT[i] = t + d + 0.12; this.dirty.add(i);
      this.later(d, () => { this.dirty.add(i); if (!this.reduced || ring % 2 === 0) this.burst(i, opts.n ?? (cells.length > 40 ? 3 : 6)); if (b.coin[i]) this.coinFx(i); if (b.lantern[i]) this.lanternOn(i); if (b.ice[i]) this.refreshNeighbours(i); });
      // ice neighbours may thaw
      for (const j of b.nb[i]) if (b.ice[j] && b.revealed[j]) this.later(d + 0.05, () => { this.dirty.add(j); if (this.vis(j, 'ice')) this.thaw(j); });
    }
    if (cells.length > 12) this.moleHoles(cells);
    return maxRing * (opts.fast ? 0.02 : 0.045);
  }
  refreshNeighbours(i) { for (const j of this.b.nb[i]) this.dirty.add(j); this.dirty.add(i); }
  thaw(i) { if (this.thawed && this.thawed.has(i)) return; (this.thawed = this.thawed || new Set()).add(i); this.sparkle(this.worldOf(i, 0.4), 8, 0xbfe9ff); }
  setPress(i) { const o = this.press; this.press = i; if (o >= 0) this.dirty.add(o); if (i >= 0) this.dirty.add(i); }
  flag(i) { this.flagT[i] = this.time; this.dirty.add(i); if (this.b.flagged[i]) this.burst(i, 4, 0.5); }
  later(d, fn) { this.anims.push({ t: this.time + d, fn }); }
  burst(i, n = 6, up = 1) {
    const w = this.worldOf(i, 0.35), c = new THREE.Color(this.areaPal.dirt), c2 = new THREE.Color(this.areaPal.grass[0]);
    for (let k = 0; k < n; k++) this.emit(this.crumbs, w, [(Math.random() - 0.5) * 3, (2 + Math.random() * 3) * up, (Math.random() - 0.5) * 3], 0.7 + Math.random() * 0.4, k % 3 ? c : c2, 0.6 + Math.random() * 0.8, 9);
  }
  sparkle(w, n = 10, col = 0xfff2a0) { const c = new THREE.Color(col); for (let k = 0; k < n; k++) this.emit(this.sparks, w, [(Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3], 0.6 + Math.random() * 0.4, c, 1, 2); }
  emit(sys, w, vel, life, col, size, grav) { const k = sys.next; sys.next = (k + 1) % sys.n; sys.live = sys.live.filter(p => p.k !== k); sys.live.push({ k, x: w.x, y: w.y, z: w.z, vx: vel[0], vy: vel[1], vz: vel[2], life, t: 0, size, grav, rx: Math.random() * 6, spin: (Math.random() - 0.5) * 12 }); sys.m.setColorAt(k, col); sys.m.instanceColor.needsUpdate = true; }
  stepParticles(dt) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const sys of [this.crumbs, this.sparks, this.dust, this.confetti]) {
      if (!sys.live.length && !sys.wasLive) continue; sys.wasLive = sys.live.length > 0;
      sys.live = sys.live.filter(p => {
        p.t += dt; if (p.t >= p.life) { sys.m.setMatrixAt(p.k, Z); return false; }
        p.vy -= p.grav * dt; if (sys === this.confetti) { p.vx *= 0.985; p.vz *= 0.985; p.vy = Math.max(p.vy, -1.6); } if (sys === this.dust) { p.vx *= 0.93; p.vy *= 0.93; p.vz *= 0.93; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (sys === this.crumbs && p.y < 0.22) { p.y = 0.22; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
        const k = p.t / p.life; let sc = p.size * (sys === this.dust ? (0.6 + k * 1.2) * (1 - k * k) : sys === this.sparks ? Math.sin(k * Math.PI) : 1 - k * k * k);
        p.rx += p.spin * dt; sys.m.setMatrixAt(p.k, m4.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e.set(p.rx, p.rx * 0.7, p.rx * 0.3)), s.setScalar(Math.max(0.001, sc)))); return true;
      });
      sys.m.instanceMatrix.needsUpdate = true;
    }
  }
  coinFx(i) {
    const m = new THREE.Mesh(this.coinGeo, this.coinMat); const w = this.worldOf(i, 0.4); m.position.copy(w); this.scene.add(m); const t0 = this.time;
    this.pops.push(() => { const k = (this.time - t0) / 0.9; if (k >= 1) { this.scene.remove(m); this.sparkle(m.position, 8); return false; } m.position.y = w.y + easeOutBack(Math.min(1, k * 2)) * 0.8 + Math.max(0, k - 0.6) * 2; m.rotation.y = k * 14; m.scale.setScalar(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1); return true; });
    this.sparkle(w, 12);
  }
  lanternOn(i) {
    if (this.lanternFx.has(i)) return; const g = new THREE.Group(); const p = this.cellPos(i);
    const post = new THREE.Mesh(merge([[new THREE.CylinderGeometry(0.03, 0.04, 0.5, 5), 0x3a2a20, M(-0.32, 0.25, -0.32)], [new THREE.BoxGeometry(0.2, 0.03, 0.03), 0x3a2a20, M(-0.24, 0.5, -0.32)]]), this.mats.toonV);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc35a })); lamp.position.set(-0.16, 0.42, -0.32); lamp.scale.set(1, 1.25, 1);
    const R = this.b.lightR * 2 + 1.4; const pool = new THREE.Mesh(new THREE.PlaneGeometry(R, R), new THREE.MeshBasicMaterial({ map: this.glow, color: 0xffc890, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.25; pool.renderOrder = 1;
    g.add(post, lamp, pool); g.position.copy(p); g.position.y = 0.2; this.board.add(g); this.lanternFx.set(i, g); const t0 = this.time;
    this.pops.push(() => { const k = Math.min(1, (this.time - t0) / 0.6); pool.material.opacity = 0.2 * k + Math.sin(this.time * 3 + i) * 0.02; lamp.scale.set(1 + Math.sin(this.time * 4 + i) * 0.05, 1.25, 1); return true; });
    this.sparkle(this.worldOf(i, 0.6), 10, 0xffc35a); this.refreshAll();
  }
  shroom(i, popped = true) {
    const g = new THREE.Group(); const p = this.cellPos(i);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.32, 14), new THREE.MeshToonMaterial({ map: this.faceTex, gradientMap: this.ramp })); stem.position.y = 0.16; stem.rotation.y = -this.board.rotation.y - Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ map: this.capTex, gradientMap: this.ramp })); cap.position.y = 0.28; cap.scale.set(1, 0.75, 1);
    stem.castShadow = cap.castShadow = !this.reduced; g.add(stem, cap); g.position.set(p.x, 0.2, p.z); this.board.add(g); this.shrooms.set(i, g); const t0 = this.time;
    const zz = popped ? null : null;
    this.pops.push(() => { const k = this.time - t0; const s = k < 0.4 ? easeOutBack(k / 0.4) : 1; const breathe = 1 + Math.sin(this.time * 2.5 + i) * 0.03; g.scale.set(s * breathe, s / breathe, s * breathe); return true; });
  }
  poof(i) {
    const w = this.worldOf(i, 0.5), c = new THREE.Color(0xf6efe4);
    for (let k = 0; k < (this.reduced ? 10 : 22); k++) this.emit(this.dust, w, [(Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5], 0.9 + Math.random() * 0.5, k % 4 ? c : new THREE.Color(0xd9c7b0), 0.8 + Math.random() * 0.8, -0.6);
    const sp = new THREE.Color(0xff6a5a); for (let k = 0; k < 10; k++) this.emit(this.crumbs, w, [(Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6], 1, k % 2 ? sp : new THREE.Color(0xffffff), 0.9, 9);
    this.shroom(i); this.shake = 0.35; this.dirty.add(i);
  }
  revealShrooms(list) { list.forEach((i, k) => this.later(k * 0.05, () => { if (!this.shrooms.has(i)) { this.shroom(i, false); this.burst(i, 4); } })); }
  celebrate() {
    const cols = [0xff5a6a, 0xffc83a, 0x5ad1ff, 0x7be36a, 0xc78cff, 0xffffff].map(c => new THREE.Color(c));
    for (let k = 0; k < (this.reduced ? 120 : 300); k++) { const a = Math.random() * 6.28, r = Math.random() * 3; this.emit(this.confetti, new THREE.Vector3(this.target.x + Math.cos(a) * r, 6 + Math.random() * 4, this.target.z + Math.sin(a) * r), [(Math.random() - 0.5) * 8, Math.random() * 4, (Math.random() - 0.5) * 8], 3 + Math.random() * 2, cols[k % cols.length], 1.2, 4); }
    // tiles bounce in a wave
    const b = this.b; for (let i = 0; i < b.N; i++) if (b.kind[i] === 1 && b.revealed[i]) { const c = i % b.W, r = (i / b.W) | 0; const d = Math.hypot(c - b.W / 2, r - b.H / 2) * 0.05; this.revT[i] = this.time + d; this.numT[i] = this.time + d; this.dirty.add(i); }
  }
  // ---------- Pip the mole ----------
  buildMole() {
    const T = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: this.ramp });
    const fur = T(0x5a4a5e), belly = T(0x8a7a8e), pink = T(0xff9fb0), dark = T(0x221a22), white = new THREE.MeshBasicMaterial({ color: 0xffffff }), scarf = T(0x4fb0ff);
    const g = this.mole = new THREE.Group(), body = this.moleBody = new THREE.Group(); g.add(body);
    const S = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; body.add(o); return o; };
    S(0.3, fur, 0, 0.32, 0, 1, 1.05, 0.95); S(0.2, belly, 0, 0.26, 0.2, 1, 1.05, 0.55);
    const head = this.moleHead = new THREE.Group(); head.position.y = 0.58; body.add(head);
    const H = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); head.add(o); return o; };
    H(0.24, fur, 0, 0, 0, 1, 0.95, 1); const snout = H(0.1, pink, 0, -0.04, 0.22, 1, 0.8, 1.2); H(0.05, T(0xe0607a), 0, -0.02, 0.33);
    this.eyes = [H(0.035, dark, -0.09, 0.05, 0.2), H(0.035, dark, 0.09, 0.05, 0.2)]; H(0.012, white, -0.08, 0.065, 0.23); H(0.012, white, 0.1, 0.065, 0.23);
    H(0.04, T(0xff8fa0), -0.15, -0.05, 0.16, 1, 0.6, 0.5); H(0.04, T(0xff8fa0), 0.15, -0.05, 0.16, 1, 0.6, 0.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 20), scarf); ring.rotation.x = Math.PI / 2; ring.position.y = 0.5; body.add(ring);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), scarf); tail.position.set(0.12, 0.42, 0.2); tail.rotation.set(1.2, 0, -0.5); body.add(tail);
    this.paws = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.27, 0.36, 0.1); const pad = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), pink); pad.scale.set(1, 0.6, 1.1); p.add(pad); for (let k = -1; k <= 1; k++) { const cl = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 5), T(0xfff3e0)); cl.position.set(k * 0.045, 0, 0.1); cl.rotation.x = Math.PI / 2; p.add(cl); } body.add(p); return p; });
    for (const sx of [-1, 1]) S(0.08, pink, sx * 0.13, 0.04, 0.08, 1.1, 0.5, 1.4);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; g.add(sh); this.moleShadow = sh;
    this.hatSlot = new THREE.Group(); this.hatSlot.position.y = 0.2; head.add(this.hatSlot); this.setHat(this.hat);
    this.scene.add(g); g.scale.setScalar(1.15); this.moleState = { anim: 'idle', t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), hopT: 1, tile: -1, blink: 2, dusty: 0 };
    // pop-up buddies for big floods
    this.popHeads = [0, 1, 2, 3].map(() => { const h = new THREE.Group(); const hd = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), fur); const sn = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), pink); sn.position.set(0, -0.02, 0.19); const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), dark), e2 = e1.clone(); e1.position.set(-0.07, 0.05, 0.16); e2.position.set(0.07, 0.05, 0.16); h.add(hd, sn, e1, e2); h.visible = false; this.scene.add(h); return h; });
  }
  setHat(id) {
    this.hat = id; this.hatSlot.clear(); const T = c => new THREE.MeshToonMaterial({ color: c, gradientMap: this.ramp }); const add = (geo, c, x = 0, y = 0, z = 0, rx = 0) => { const m = new THREE.Mesh(geo, T(c)); m.position.set(x, y, z); m.rotation.x = rx; this.hatSlot.add(m); return m; };
    if (id === 'straw') { add(new THREE.CylinderGeometry(0.3, 0.32, 0.03, 20), 0xf2d27a, 0, 0.0, 0, -0.15); add(new THREE.CylinderGeometry(0.15, 0.17, 0.12, 16), 0xf2d27a, 0, 0.06, -0.01, -0.15); add(new THREE.CylinderGeometry(0.172, 0.172, 0.04, 16), 0xe8463c, 0, 0.02, -0.01, -0.15); }
    if (id === 'flower') for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; add(new THREE.SphereGeometry(0.05, 8, 6), k % 2 ? 0xffffff : 0xff9fd0, Math.cos(a) * 0.17, -0.04, Math.sin(a) * 0.17); }
    if (id === 'beanie') { add(new THREE.SphereGeometry(0.2, 16, 10, 0, 6.29, 0, 1.6), 0xff6a5a, 0, -0.06, 0); add(new THREE.TorusGeometry(0.19, 0.04, 8, 18), 0xffffff, 0, -0.06, 0, Math.PI / 2); add(new THREE.SphereGeometry(0.07, 10, 8), 0xffffff, 0, 0.15, 0); }
    if (id === 'party') { add(new THREE.ConeGeometry(0.13, 0.32, 16), 0x7b5cff, 0, 0.12, 0); add(new THREE.SphereGeometry(0.05, 8, 6), 0xffd34d, 0, 0.3, 0); }
    if (id === 'pot') { add(new THREE.CylinderGeometry(0.15, 0.11, 0.16, 14), 0xd9783c, 0, 0.04, 0); add(new THREE.SphereGeometry(0.06, 8, 6), 0xff5a8a, 0, 0.2, 0); add(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 4), 0x3a9a3a, 0, 0.14, 0); }
    if (id === 'top') { add(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 20), 0x2a2430, 0, 0, 0); add(new THREE.CylinderGeometry(0.15, 0.15, 0.26, 18), 0x2a2430, 0, 0.13, 0); add(new THREE.CylinderGeometry(0.155, 0.155, 0.05, 18), 0xe8463c, 0, 0.04, 0); }
    if (id === 'crown') { add(new THREE.CylinderGeometry(0.16, 0.15, 0.1, 6, 1, true), 0xffc83a, 0, 0.03, 0).material.side = THREE.DoubleSide; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; add(new THREE.ConeGeometry(0.04, 0.1, 4), 0xffc83a, Math.cos(a) * 0.15, 0.12, Math.sin(a) * 0.15); } add(new THREE.SphereGeometry(0.04, 8, 6), 0xff5a6a, 0, 0.05, 0.16); }
  }
  placeMoleAtStart() { const b = this.b; const p = this.board.localToWorld(new THREE.Vector3(0, 0, b.H / 2 + 0.65)); this.mole.position.copy(p); this.mole.position.y = -0.05; this.moleState.tile = -1; this.moleState.hopT = 1; this.moleState.to.copy(this.mole.position); }
  moleTo(i, anim = 'dig') {
    const st = this.moleState; const w = this.worldOf(i, 0); const b = this.b; w.y = b.revealed[i] ? 0.2 : 0.56;
    // stand just in front of the tile so the dug soil stays visible
    w.z += 0.38; st.from.copy(this.mole.position); st.to.copy(w); st.hopT = 0; st.tile = i; this.moleDo(anim);
  }
  moleDo(anim) { const st = this.moleState; if (st.anim === 'dance' && anim !== 'idle' && anim !== 'title') return; st.anim = anim; st.t = 0; if (anim === 'dusty') st.dusty = 1; }
  moleHoles(cells) { const pick = cells.filter(([i]) => !this.b.num[i]).sort(() => Math.random() - 0.5).slice(0, this.reduced ? 2 : 4); pick.forEach(([i, ring], k) => { const h = this.popHeads[k]; const w = this.worldOf(i, 0.2); const t0 = this.time + ring * 0.045 + 0.1; h.position.copy(w); h.visible = false; this.pops.push(() => { const kk = (this.time - t0) / 0.9; if (kk < 0) return true; if (kk >= 1) { h.visible = false; return false; } h.visible = true; const up = Math.sin(kk * Math.PI); h.position.y = w.y - 0.25 + up * 0.38; h.rotation.y = Math.sin(kk * 12) * 0.4; h.scale.set(1 + (1 - up) * 0.2, 0.8 + up * 0.3, 1); return true; }); }); }
  stepMole(dt) {
    const st = this.moleState, g = this.mole, body = this.moleBody, head = this.moleHead; st.t += dt; const t = st.t;
    if (st.hopT < 1) { st.hopT = Math.min(1, st.hopT + dt / 0.28); const k = st.hopT; g.position.lerpVectors(st.from, st.to, k); g.position.y = THREE.MathUtils.lerp(st.from.y, st.to.y, k) + Math.sin(k * Math.PI) * 0.55; }
    // face toward the camera, a little toward travel
    const camDir = Math.atan2(this.camera.position.x - g.position.x, this.camera.position.z - g.position.z); g.rotation.y += (camDir - g.rotation.y) * Math.min(1, dt * 8);
    let sx = 1, sy = 1, bodyY = 0, headTilt = 0, pawL = 0, pawR = 0, spin = 0;
    const breathe = Math.sin(this.time * 3) * 0.03;
    if (st.hopT < 1) { sy = 1 + Math.sin(st.hopT * Math.PI) * 0.18; sx = 1 / Math.sqrt(sy); }
    else if (st.anim === 'dig' && t < 0.35) { const k = t / 0.35; sy = 1 - Math.sin(k * Math.PI) * 0.3; sx = 1 / Math.sqrt(sy); pawL = pawR = Math.sin(k * Math.PI * 4) * 0.8; }
    else if (st.anim === 'cheer' && t < 1.2) { const k = t / 1.2; bodyY = Math.abs(Math.sin(k * Math.PI * 2)) * 0.4; sy = 1 + Math.abs(Math.sin(k * Math.PI * 2)) * 0.15; sx = 1 / Math.sqrt(sy); pawL = pawR = -2.4; }
    else if (st.anim === 'gasp' && t < 0.8) { sy = 1.14; sx = 0.92; pawL = pawR = -1.6; headTilt = -0.15; }
    else if (st.anim === 'dusty' && t < 1.8) { const k = t / 1.8; sx = 1 + Math.sin(t * 40) * 0.05 * (1 - k); headTilt = Math.sin(t * 9) * 0.3 * (k > 0.4 ? 1 : 0); pawL = k > 0.4 ? Math.sin(t * 18) * 1.2 : 0.4; pawR = k > 0.4 ? -Math.sin(t * 18) * 1.2 : 0.4; st.dusty = Math.max(0, 1 - Math.max(0, k - 0.4) * 1.6); }
    else if (st.anim === 'dance') { const k = t % 1.0; bodyY = Math.abs(Math.sin(t * Math.PI * 2)) * 0.32; spin = Math.floor(t) % 2 ? t * 6.28 : 0; pawL = Math.sin(t * 12) * 1.5 - 1; pawR = -Math.sin(t * 12) * 1.5 - 1; sy = 1 + Math.abs(Math.sin(t * 6.28)) * 0.12; sx = 1 / Math.sqrt(sy); }
    else if (st.anim === 'title') { pawR = -2 + Math.sin(this.time * 9) * 0.6; headTilt = Math.sin(this.time * 2) * 0.12; }
    else { if (st.anim !== 'idle' && st.anim !== 'dance' && st.anim !== 'title') st.anim = 'idle'; headTilt = Math.sin(this.time * 0.7) * 0.15; }
    body.position.y = bodyY; body.scale.set(sx, sy + breathe, sx); body.rotation.y = spin; head.rotation.z = headTilt; head.rotation.y = Math.sin(this.time * 0.43) * 0.25;
    this.paws[0].rotation.x = pawL; this.paws[1].rotation.x = pawR;
    st.blink -= dt; const bl = st.blink < 0.12 ? 0.15 : 1; if (st.blink < 0) st.blink = 2 + Math.random() * 3; const gasp = st.anim === 'gasp' && t < 0.8 ? 1.6 : 1; this.eyes.forEach(e => e.scale.set(gasp, bl * gasp, 1));
    const d = st.dusty; this.moleBody.children.forEach(o => { if (o.material && o.material.color && o.userData.base === undefined) o.userData.base = o.material.color.getHex(); }); // base colours kept for dust tint
    if (d > 0) { this.moleBody.children.forEach(o => { if (o.material && o.userData.base !== undefined) o.material.color.setHex(o.userData.base).lerp(new THREE.Color(0x777777), d * 0.6); }); }
    else if (this._wasDusty) this.moleBody.children.forEach(o => { if (o.material && o.userData.base !== undefined) o.material.color.setHex(o.userData.base); });
    this._wasDusty = d > 0;
    this.moleShadow.scale.setScalar(1 - Math.min(0.5, (g.position.y - st.to.y + bodyY) * 0.6));
  }
  // ---------- camera ----------
  setRect(rect) { this.rect = rect; this.fit(); }
  fit() {
    if (!this.vw) return; const cam = this.camera, rc = this.rect; const b = this.b; const bw = b ? b.W : 7, bh = b ? b.H : 7;
    cam.clearViewOffset(); cam.aspect = this.vw / this.vh; cam.updateProjectionMatrix();
    const el = THREE.MathUtils.degToRad(this.titleMode ? 38 : 56), dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    const corners = []; for (const x of [-bw / 2 - 0.2, bw / 2 + 0.2]) for (const z of [-bh / 2 - 0.2, bh / 2 + 0.75]) for (const y of [-0.3, 0.8]) corners.push(this.board.localToWorld(new THREE.Vector3(x, y, z)));
    const c0 = new THREE.Vector3(); corners.forEach(c => c0.add(c)); c0.divideScalar(corners.length); c0.y = 0;
    let lo = 3, hi = 300; const v = new THREE.Vector3();
    const fits = d => { cam.position.copy(c0).addScaledVector(dir, d); cam.lookAt(c0); cam.updateMatrixWorld(); let mx = 0, my = 0; for (const c of corners) { v.copy(c).project(cam); mx = Math.max(mx, Math.abs(v.x) * this.vw / 2); my = Math.max(my, Math.abs(v.y) * this.vh / 2); } return mx <= rc.w / 2 - 8 && my <= rc.h / 2 - 8; };
    for (let k = 0; k < 28; k++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    this.fitD = hi * (this.titleMode ? 0.62 : 1); this.center = c0; this.dir = dir;
    const offX = this.vw / 2 - (rc.x - (this.cvX || 0) + rc.w / 2), offY = this.vh / 2 - (rc.y - (this.cvY || 0) + rc.h / 2); cam.setViewOffset(this.vw, this.vh, offX, offY, this.vw, this.vh);
    this.applyCam();
  }
  applyCam() {
    if (!this.center) return; const lim = this.b ? Math.max(this.b.W, this.b.H) / 2 : 3; this.pan.x = THREE.MathUtils.clamp(this.pan.x, -lim, lim); this.pan.y = THREE.MathUtils.clamp(this.pan.y, -lim, lim);
    this.target.set(this.center.x + this.pan.x, 0, this.center.z + this.pan.y); const d = this.fitD / this.zoom;
    this.camera.position.copy(this.target).addScaledVector(this.dir, d); if (this.titleMode) { const a = Math.sin(this.time * 0.15) * 0.35; this.camera.position.x += Math.sin(a) * d * 0.5; }
    this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
    if (this.scene.fog) { this.scene.fog.near = d * 1.2 + 10; this.scene.fog.far = d * 3 + 60; }
    this.sun.target.position.copy(this.target); this.sun.position.copy(this.target).add(new THREE.Vector3(-8, 16, 10));
  }
  zoomBy(f, sx, sy) { const z0 = this.zoom; this.zoom = THREE.MathUtils.clamp(this.zoom * f, 1, 3.2); if (this.zoom === 1) this.pan.set(0, 0); this.applyCam(); }
  panBy(dx, dy) { const s = (this.fitD / this.zoom) * 0.0016 * (900 / Math.max(this.vh, 400)); this.pan.x -= dx * s; this.pan.y -= dy * s; if (this.zoom <= 1.001) this.pan.set(0, 0); this.applyCam(); }
  pick(x, y) {
    if (!this.b) return -1; const r = this.renderer.domElement.getBoundingClientRect(); const cw = r.width || this.vw, ch = r.height || this.vh;
    const ndc = new THREE.Vector2((x - r.left) / cw * 2 - 1, -((y - r.top) / ch) * 2 + 1); const rc = new THREE.Raycaster(); this.camera.updateMatrixWorld(); rc.setFromCamera(ndc, this.camera);
    const b = this.b, ok = i => i >= 0 && i < b.N && b.kind[i] === 1;
    // 1) real geometry: raised grass caps, signposts and dug soil are instanced per cell, so instanceId is the cell index
    this.board.updateMatrixWorld(true);
    const hits = rc.intersectObjects([this.mGrass, this.mFlag, this.mSoil].filter(Boolean), false);
    for (const h of hits) { const i = h.instanceId; if (!ok(i)) continue; if (h.object === this.mGrass && (b.revealed[i] || b.popped[i])) continue; if (h.object === this.mFlag && !b.flagged[i]) continue; return i; }
    // 2) fallback: tile-top planes (grass top, then dug top)
    for (const hh of [0.56, 0.22]) { const pt = new THREE.Vector3(); if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -hh), pt)) continue; const l = this.board.worldToLocal(pt); const c = Math.round(l.x + (b.W - 1) / 2), rr = Math.round(l.z + (b.H - 1) / 2); if (c < 0 || rr < 0 || c >= b.W || rr >= b.H) continue; const i = rr * b.W + c; if (!ok(i)) continue; if (hh === 0.56 && b.revealed[i]) continue; return i; }
    return -1;
  }
  screenOf(i, y = 0.5) { const r = this.renderer.domElement.getBoundingClientRect(); const v = this.worldOf(i, y).project(this.camera); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }
  // ---------- frame ----------
  frame(dt) {
    this.time += dt;
    this.anims = this.anims.filter(a => { if (this.time >= a.t) { a.fn(); return false; } return true; });
    if (this.pops) this.pops = this.pops.filter(f => f());
    if (this.b) {
      const next = new Set(); for (const i of this.dirty) if (this.updateTile(i)) next.add(i);
      // deco sway only for a few tiles per frame keeps it cheap: skip continual sway when reduced
      this.dirty = this.reduced ? new Set([...next].filter(i => this.b.revealed[i] || this.b.flagged[i] || this.press === i)) : next;
      for (const m of this.board.children) if (m.isInstancedMesh) m.instanceMatrix.needsUpdate = true;
    }
    this.livers && this.livers.forEach(f => f(dt)); this.stepParticles(dt); this.stepMole(dt);
    if (this.titleMode) this.applyCam();
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5; }
    if (this.reduced) { this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera); }
    else {
      this.renderer.setRenderTarget(this.rt); this.renderer.render(this.scene, this.camera); this.renderer.setRenderTarget(null);
      const f = 1 - (this.rect.y + this.rect.h / 2) / this.vh; this.postMat.uniforms.focus.value = f; this.postMat.uniforms.amount.value = this.titleMode ? 1.4 : 0.9 / this.zoom;
      this.renderer.render(this.postScene, this.postCam);
    }
    if (this.shake > 0) this.applyCam();
  }
}
