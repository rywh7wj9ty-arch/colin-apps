import { startGame } from '../shared/engine.js';

// ---------------- LEVEL — same 2.5D rules as A: gaps <= 3.5, steps <= 1.6, nothing hidden ----------------
const G = (x0, x1, top, kind = 'ground') => ({ x0, x1, y0: kind === 'plat' ? top - 0.8 : -16, y1: top, kind });
const solids = [
  { x0: -16, x1: -12, y0: -16, y1: 30, kind: 'wall' },
  G(-12, 20, 0), G(20, 28, 1.4), G(31.5, 50, 0.5), G(50, 64, 0.5),
  G(85, 104, 0.5), G(104, 120, 0.5), G(123.5, 140, 1.6), G(140, 160, 1.6),
  G(181, 210, 4), // Great Lantern terrace; Great Chasm 210..236
  G(236, 252, 4), G(255.5, 262, 5), G(265.5, 290, 5.5), { x0: 290, x1: 294, y0: -16, y1: 30, kind: 'wall' },
];
// light platforms: solid only while lit (your light, a flare, or a lantern). Always drawn as a faint outline — never invisible.
const lightPlats = [[67, 70, 1], [73, 76, 1.6], [79, 82, 1], [120.3, 123, 1.2], [163, 166, 2.8], [169, 172, 4], [175, 178, 5.2], [252.3, 255.2, 4.6], [262.3, 265.2, 5.2]];
// thorn patches [x0, x1, groundTop] — only a Flare (or a lit lantern) makes them recede
const thorns = [[53, 59, 0.5], [108, 113, 0.5], [128, 136, 1.6], [143, 147, 1.6], [240, 247, 4], [270, 276, 5.5]];
const coins = [[8, 1.2], [12, 1.2], [24, 2.6], [29.8, 2.6], [40, 1.7], [44, 1.7], [56, 2.2], [68.5, 2.4], [74.5, 3], [80.5, 2.4], [92, 1.7], [98, 1.7], [110.5, 2], [121.6, 2.6], [132, 3], [138, 2.8], [145, 3], [152, 2.8], [164.5, 4.2], [170.5, 5.4], [176.5, 6.6], [190, 5.2], [196, 5.2], [243.5, 5.4], [253.8, 6], [263.8, 6.6], [273, 6.8], [280, 6.8]];
const level = {
  solids, coins, start: [2, 0], bounds: [-11.5, 290], killY: -12, goal: [284, 5.5],
  springs: [], enemies: [],
  checkpoints: [[2, 0], [36, 0.5], [90, 0.5], [149.5, 1.6], [184, 4], [238, 4]],
  signs: [[5, 0, '◀ ▶ to run\n▲ to jump'], [48.6, 0.5, 'The dark fears light\nTap ✦ Flare!'], [62, 0.5, 'Light paths appear\nwhen you glow near'], [200, 4, 'Wake the\nGreat Lantern'], [250.5, 4, 'The Elder Tree\nis near']],
  great: { lantern: 205, x0: 210, x1: 236, top: 4 },
};
const story = {
  start: 'Wake, little <i>Ember</i>. The forest has forgotten its light… and so have I. — <i>Nara</i>',
  1: '<i>Nara:</i> I remember this path. The trees used to sing here.',
  2: '<i>Nara:</i> The dark crept in when the Elder fell asleep. It is not cruel… only lonely.',
  3: '<i>Nara:</i> Every wisp you carry is a memory finding its way home.',
  4: '<i>Nara:</i> Look — the Great Lantern. My sister lit it, long ago.',
  5: '<i>Nara:</i> Almost there. Whatever happens… thank you for remembering.',
};

// ---------------- MUSIC: slow, wistful, hopeful (A minor → F → C → G) ----------------
const chords = [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]];
const bells = [0, 2, 4, 7, 9, 12, 14, 16];
function music(ac, out, t, step, swell) {
  const bar = Math.floor(step / 16) % 4, s = step % 16, ch = chords[bar];
  const tone = (semi, d, type, v, oct, det = 0) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = 220 * Math.pow(2, semi / 12 + oct); o.detune.value = det; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + d * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.1); };
  if (s === 0) for (const n of ch) { tone(n, 4.4, 'sine', 0.05, 0, -6); tone(n, 4.4, 'triangle', 0.025, 0, 7); }
  if (s === 0) tone(ch[0], 4, 'sine', 0.09, -1);
  const r = ((step * 9301 + 49297) % 233280) / 233280;
  if ((s % 4 === 2 && r < 0.55) || (swell > 0 && s % 2 === 0)) tone(ch[0] + bells[Math.floor(r * 8)], 1.6, 'sine', 0.05 + swell * 0.03, 1);
}
music.stepLen = 0.25;

const pal = { skyTop: 0x2a2f78, skyBot: 0xf0a3c4, fog: 0x7a70b4, hemiSky: 0xc6ccff, hemiGround: 0x5a4a7a, hemiI: 2.0, sun: 0xd8e4ff, sunI: 1.9, sunDir: [10, 20, 16], dust: 0xbfe9ff, spark: 0x9ff3ff, coin: 0xfff0a8, hurt: 0xb06bff };

function buildSolid(c, o, w, h, cx, cy) {
  const { THREE, scene, mat, box, rand } = c; const grp = new THREE.Group(); scene.add(grp);
  if (o.kind === 'wall') { const m = box(w, h, 6, mat(0x3a3366)); m.position.set(cx, cy, 0); grp.add(m); return grp; }
  const D = 3.2;
  const top = box(w + 0.3, 0.5, D + 0.3, mat(0x46d8b4, { emissive: 0x0f5a50, emissiveIntensity: 0.6 })); top.position.set(cx, o.y1 - 0.25, 0); grp.add(top);
  const soil = box(w, 5, D, mat(0x7a6ac0, { emissive: 0x241a50, emissiveIntensity: 0.6 })); soil.position.set(cx, o.y1 - 3, 0); grp.add(soil);
  const vein = box(w + 0.02, 0.22, D + 0.02, mat(0x9ff3ff, { emissive: 0x4fc8ff, emissiveIntensity: 0.8 })); vein.position.set(cx, o.y1 - 1.3, 0); grp.add(vein);
  const roots = box(w * 0.9, 6, D * 0.9, mat(0x5a4c96, { emissive: 0x1a1240, emissiveIntensity: 0.5 })); roots.position.set(cx, o.y1 - 8.5, 0); grp.add(roots);
  for (let x = o.x0 + 0.5; x < o.x1 - 0.3; x += 0.7 + rand() * 1.2) {
    const z = -0.5 - rand() * 1.3;
    if (rand() < 0.45) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.35, 5), mat(0xfff3e0)); st.position.set(x, o.y1 + 0.17, z); grp.add(st); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat([0x7ff9ff, 0xff9fe0, 0xfff27a][Math.floor(rand() * 3)], { emissive: 0x6fd8ff, emissiveIntensity: 0.8 })); cap.position.set(x, o.y1 + 0.33, z); grp.add(cap); }
    else { const g = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 4), mat(0x5fe8c4, { emissive: 0x1a6a5a })); g.position.set(x, o.y1 + 0.25, z); grp.add(g); }
  }
  return grp;
}
function spiritTree(c, x, y, z, s, glow) {
  const { THREE, mat, rand } = c; const g = new THREE.Group();
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.4 * s, 4 * s, 7), mat(0x5a4a8a)); tr.position.y = 2 * s; g.add(tr);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry((1.3 - i * 0.2) * s, 1), mat(glow ? 0x8af0ff : 0x6f78d8, { emissive: glow ? 0x2aa0c0 : 0x2a2a70, emissiveIntensity: 0.5 })); b.position.set((rand() - 0.5) * 1.4 * s, (4 + i * 0.8) * s, (rand() - 0.5) * s); g.add(b); }
  g.position.set(x, y, z); c.scene.add(g); return g;
}
function buildScenery(c, L) {
  const { THREE, scene, mat, rand, halo } = c;
  // moonlit cloud sea
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat(0x9a90d8, { emissive: 0x4a4090, emissiveIntensity: 0.5, roughness: 1 }), 220);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < 220; i++) { const s = 2 + rand() * 4; M.compose(v.set(-30 + rand() * 350, -10 - rand() * 3, -60 + rand() * 72), q, sc.set(s * 1.6, s * 0.7, s)); inst.setMatrixAt(i, M); } scene.add(inst);
  // big moon
  const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff6e6, fog: false })); moon.position.set(140, 70, -220); scene.add(moon); const mh = halo(0xffe6f0, 90, 0.35); mh.position.copy(moon.position); scene.add(mh);
  // stars
  for (let i = 0; i < 160; i++) { const st = halo(0xffffff, 0.6 + rand() * 1.4, 0.8); st.position.set(-60 + rand() * 420, 30 + rand() * 90, -180 - rand() * 40); scene.add(st); }
  // distant spirit forest silhouettes and mid trees
  for (let i = 0; i < 40; i++) spiritTree(c, -30 + i * 9 + rand() * 5, -6 + rand() * 4, -50 - rand() * 40, 2 + rand() * 2, rand() < 0.3);
  for (const s of L.solids) { if (s.kind === 'wall') continue; for (let x = s.x0 + 1; x < s.x1 - 1; x += 5 + rand() * 5) spiritTree(c, x, s.y1, -3 - rand() * 3, 0.6 + rand() * 0.5, rand() < 0.5); }
  // glowing waterfall landmarks
  for (const x of [26, 118, 178]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(3, 26), mat(0x9ff3ff, { emissive: 0x4fc8ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.55 })); f.position.set(x, -2, -9); scene.add(f); }
}
function outline(c, mesh, s = 1.08) { const o = new c.THREE.Mesh(mesh.geometry, c.mat(0x1d1840, { side: c.THREE.BackSide, roughness: 1 })); o.scale.setScalar(s); mesh.add(o); return o; }
function buildPlayer(c) {
  const { THREE, mat, halo } = c; const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  // readable, not blown-out: soft cyan-white body, dark outline, modest glow
  const skin = mat(0xe6fbff, { emissive: 0x3fbfe0, emissiveIntensity: 0.35, roughness: 0.5 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), skin); head.position.y = 0.72; body.add(head); outline(c, head);
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.75, 16), mat(0x5b6cff, { emissive: 0x1a2080, emissiveIntensity: 0.4 })); cloak.position.y = 0.33; body.add(cloak); outline(c, cloak, 1.08);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(0x1d1840)); e.scale.y = 1.4; e.position.set(sx * 0.14, 0.76, 0.37); body.add(e);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 8), skin); ear.position.set(sx * 0.22, 1.12, -0.05); ear.rotation.z = -sx * 0.5; body.add(ear); outline(c, ear, 1.12); }
  const h = halo(0x9ff3ff, 2.2, 0.32); h.position.y = 0.7; root.add(h);
  const light = new THREE.PointLight(0x9ff3ff, 6, 9, 1.6); light.position.set(0, 1.2, 1.2); root.add(light);
  // light-radius ring (shows exactly how far your light reaches)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.35, depthWrite: false, fog: false })); ring.position.set(0, 0.6, 0.3); root.add(ring);
  let face = 0;
  const P = { root, ring, light, update(s) {
    root.position.set(s.x, s.y, 0); face += ((s.face > 0 ? 0.5 : Math.PI - 0.5) - face) * Math.min(1, (s.dt || 0.016) * 14); body.rotation.y = face;
    body.scale.set(1 / Math.sqrt(s.sq), s.sq, 1 / Math.sqrt(s.sq)); body.position.y = 0.06 + Math.sin(s.t * 3) * 0.06; cloak.rotation.z = -s.run * 0.15 * (s.face);
    root.visible = !s.dead && !(s.inv > 0 && Math.floor(s.t * 20) % 2);
  } };
  return P;
}
function buildCoin(c) { const { THREE, mat, halo } = c; const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(0xfff6c8, { emissive: 0xffd36a, emissiveIntensity: 0.9 })); g.add(m); const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 8), mat(0xfff6c8, { emissive: 0xffd36a, emissiveIntensity: 0.7, transparent: true, opacity: 0.6 })); t.rotation.z = Math.PI / 2; t.position.x = -0.28; g.add(t); g.add(halo(0xffe9a0, 1.6, 0.5)); return g; }
function buildSpring() {} function buildEnemy() {}
function buildCheckpoint(c) { const { THREE, mat, halo } = c; const g = new THREE.Group(); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), mat(0x2f2850)); post.position.set(0, 1.1, -0.8); g.add(post); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.08), mat(0x2f2850)); arm.position.set(0.3, 2.15, -0.8); g.add(arm);
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat(0x6a6a90, { emissive: 0x000000 })); lamp.position.set(0.55, 1.8, -0.8); g.add(lamp); const h = halo(0xffc46b, 4, 0); h.position.copy(lamp.position); g.add(h); g.userData = { lamp, h }; return g; }
function animCheckpoint(cp, t) { const u = cp.m.userData; if (cp.on && !cp.lit) { cp.lit = true; u.lamp.material = u.lamp.material.clone(); u.lamp.material.color.set(0xffd58a); u.lamp.material.emissive.set(0xffa040); } u.lamp.rotation.y = t; if (cp.on) u.h.material.opacity = 0.55 + Math.sin(t * 3 + cp.x) * 0.1; }
function buildGoal(c) { const g = new c.THREE.Group(); const tree = spiritTree(c, 0, 0, -2.5, 2.2, false); c.scene.remove(tree); g.add(tree); g.userData.tree = tree; const h = c.halo(0x9ff3ff, 10, 0.25); h.position.set(0, 9, -2); g.add(h); g.userData.h = h; return g; }
function animGoal(g, t, won) { g.userData.h.material.opacity = won ? Math.min(0.9, g.userData.h.material.opacity + 0.01) : 0.2 + Math.sin(t) * 0.06; }

// ---------------- MECHANICS: light orb, flare, light platforms, receding thorns, reactive darkness, companion, Great Lantern, dawn ----------------
function mechanics(api) {
  const { THREE, scene, ctx, G, P, emit, audio, player, input } = api; const mat = ctx.mat;
  const BASE = 1.9, FLARE = 7.2;
  const L = { r: BASE, flare: 0, cd: 0 };
  const lit = []; // lantern light sources [x,y,r]
  // light platforms
  const lps = lightPlats.map(([x0, x1, top]) => {
    const w = x1 - x0, grp = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 2.6), mat(0xfff0b0, { emissive: 0xffc460, emissiveIntensity: 0.0, transparent: true, opacity: 0.25 })); grp.add(m);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.08, 2.7), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.7, fog: false })); edge.position.y = 0.25; grp.add(edge);
    grp.position.set((x0 + x1) / 2, top - 0.25, 0); scene.add(grp);
    return { col: { x0, x1, y0: top - 0.5, y1: top, kind: 'light', off: true }, m, grp, glow: 0, timer: 0 };
  });
  // thorns (per 1-unit cell)
  const cells = [];
  const thornMat = mat(0x2a1b4a, { emissive: 0x6a2ab0, emissiveIntensity: 0.35, roughness: 0.6 });
  for (const [x0, x1, top] of thorns) for (let x = x0; x < x1; x += 1) {
    const grp = new THREE.Group(); for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1 + (k % 2) * 0.4, 5), thornMat); s.position.set(0.2 + k * 0.3, 0.5, -0.8 + k * 0.8); s.rotation.z = (k - 1) * 0.25; grp.add(s); }
    grp.position.set(x, top, 0); scene.add(grp); cells.push({ x0: x, x1: x + 1, top, ext: 1, last: -9, grp });
  }
  // reactive darkness: mist blobs that flee from light
  const mistTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(30,10,60,.9)'); gr.addColorStop(1, 'rgba(30,10,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); return t; })();
  const mists = [];
  for (const [x0, x1, top] of thorns) for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.55, depthWrite: false, fog: false })); const hx = x0 + Math.random() * (x1 - x0), hy = top + 0.3 + Math.random() * 2; s.scale.set(2.4, 2.4, 1); s.position.set(hx, hy, 0.6 + Math.random()); scene.add(s); mists.push({ s, hx, hy, ox: 0, oy: 0, ph: Math.random() * 6 }); }
  // companion Nara
  const nara = new THREE.Group(); const nb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(0xfff0b0, { emissive: 0xffc860, emissiveIntensity: 1 })); nara.add(nb); nara.add(ctx.halo(0xffd890, 1.4, 0.5)); scene.add(nara); const nPos = new THREE.Vector3(P.x - 1, P.y + 2, 0.5);
  // Great Lantern + light bridge
  const GL = level.great; const gl = new THREE.Group(); const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.2, 8), mat(0x3a3366)); ped.position.y = 0.6; gl.add(ped); const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), mat(0x8a86b8, { emissive: 0x20204a })); gem.position.y = 2; gl.add(gem); const glh = ctx.halo(0xffd890, 6, 0.15); glh.position.y = 2; gl.add(glh); gl.position.set(GL.lantern, GL.top, -0.6); scene.add(gl);
  const bridge = []; const BN = 9, bw = (GL.x1 - GL.x0) / BN;
  for (let i = 0; i < BN; i++) { const x0 = GL.x0 + i * bw + 0.15, x1 = x0 + bw - 0.3; const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.5, 2.6), mat(0xfff0b0, { emissive: 0xffb84a, emissiveIntensity: 0.9, transparent: true, opacity: 0.12 })); m.position.set((x0 + x1) / 2, GL.top - 0.25 - 3, 0); scene.add(m); bridge.push({ col: { x0: x0 - 0.15, x1: x1 + 0.15, y0: GL.top - 0.5, y1: GL.top, kind: 'bridge', off: true }, m, t: -1 }); }
  let woke = -1, lock = 0, dawn = 0;
  const lightAt = (x, y, base) => { let best = Infinity; const dx = x - P.x, dy = y - (P.y + 0.6); const d = Math.hypot(dx, dy); if (d < (base ? L.r : (L.flare > 0 ? L.r : -1))) return true; for (const l of lit) if (Math.hypot(x - l[0], y - l[1]) < l[2]) return true; return woke >= 0 && x > GL.x0 - 30 && x < GL.x1 + 4 && false; };
  const rectDist = (c) => { const dx = Math.max(c.x0 - P.x, 0, P.x - c.x1), dy = Math.max(c.y0 - (P.y + 0.6), 0, (P.y + 0.6) - c.y1); return Math.hypot(dx, dy); };
  const flareBtn = document.getElementById('btnAct');
  return {
    extraSolids: () => lps.map((l) => l.col).concat(bridge.map((b) => b.col)),
    locked: () => lock > 0,
    camTarget: () => (lock > 0 ? [(GL.x0 + GL.x1) / 2 - 2, GL.top + 1] : null),
    camZoomOut: () => (lock > 0 ? 0.4 : 0) + dawn * 0.25,
    onStart() { setTimeout(() => api.story(story.start, 5.5), 600); },
    onCheckpoint(cp) { lit.push([cp.x + 0.5, cp.y + 1.8, 4.5]); if (story[cp.i]) api.story(story[cp.i], 5); },
    onCoin() { G.slow = Math.max(G.slow, 0.12); },
    onAction() { if (L.flare <= 0 && L.cd <= 0) { L.flare = 2.8; audio.sfx('flare'); emit(P.x, P.y + 0.6, 0, 40, 0xbff6ff, 9, 0.8, 1.2, 0); G.zoom = 0.6; G.flares = (G.flares || 0) + 1; } },
    botAction: () => { if (L.flare > 0 || L.cd > 0) return false; return cells.some((c) => c.ext > 0.3 && c.x0 > P.x - 1 && c.x0 - P.x < 4.5 && Math.abs(c.top - P.y) < 3); },
    step(dt) {
      if (L.flare > 0) { L.flare -= dt; if (L.flare <= 0) L.cd = 0.7; } else if (L.cd > 0) L.cd -= dt;
      const target = L.flare > 0 ? FLARE : BASE; L.r += (target - L.r) * Math.min(1, dt * (L.flare > 0 ? 10 : 3));
      for (const l of lps) { const inL = rectDist(l.col) < L.r || lit.some((s) => Math.hypot(Math.max(l.col.x0 - s[0], 0, s[0] - l.col.x1), l.col.y1 - s[1]) < s[2]); if (inL) l.timer = 1.6; else l.timer -= dt; l.col.off = l.timer <= 0; }
      for (const c of cells) { const cx = (c.x0 + c.x1) / 2, cy = c.top + 0.5; const pushed = (L.flare > 0 && Math.hypot(cx - P.x, cy - P.y - 0.6) < L.r) || lit.some((s) => Math.hypot(cx - s[0], cy - s[1]) < s[2]); if (pushed) { c.last = G.t; c.ext = Math.max(0, c.ext - dt * 7); } else if (G.t - c.last > 1.4) c.ext = Math.min(1, c.ext + dt * 1.5);
        // forgiving hitbox: only the middle of the cell, only when thorns are mostly grown
        if (c.ext > 0.45 && P.x + 0.25 > c.x0 + 0.15 && P.x - 0.25 < c.x1 - 0.15 && P.y < c.top + 0.9 * c.ext) api.hurt(); }
      if (woke < 0 && Math.abs(P.x - GL.lantern) < 1.2 && Math.abs(P.y - GL.top) < 1) { woke = 0; lock = 4.6; audio.sfx('chime'); api.toast('The Great Lantern remembers!', 3); api.story('<i>Nara:</i> Sister… you kept it burning for me.', 5); }
      if (lock > 0) lock -= dt;
      if (woke >= 0) { woke += dt; audio.swell = woke < 8 ? 1 : 0; bridge.forEach((b, i) => { if (b.t < 0 && woke > 0.8 + i * 0.35) { b.t = 0; b.col.off = false; audio.sfx('coin', i * 2); emit(b.m.position.x, GL.top, 0, 16, 0xffe9a0, 5, 0.9, 1.2, 1); G.shake = 0.15; } }); }
      if (G.won) dawn = Math.min(1, dawn + dt / 4);
    },
    render(dt) {
      const pr = player.ring; pr.scale.setScalar(L.r); pr.material.opacity = L.flare > 0 ? 0.5 : 0.22; player.light.intensity = 5 + (L.r - BASE) * 2.5; player.light.distance = 6 + L.r * 1.5;
      if (flareBtn) flareBtn.style.opacity = L.flare > 0 || L.cd > 0 ? 0.45 : 1;
      if (P.dead <= 0 && Math.random() < dt * 40) emit(P.x - P.face * 0.2, P.y + 0.5, -0.2, 1, Math.random() < 0.5 ? 0x9ff3ff : 0xfff0b0, 0.6, 0.9, 0.9, -0.6);
      for (const l of lps) { const on = !l.col.off; l.glow += ((on ? 1 : 0) - l.glow) * Math.min(1, dt * 8); l.m.material.opacity = 0.25 + l.glow * 0.7; l.m.material.emissiveIntensity = l.glow * 0.9; }
      for (const c of cells) { c.grp.scale.y = 0.05 + c.ext * 0.95; c.grp.visible = c.ext > 0.02; }
      for (const m of mists) { const dx = m.hx - P.x, dy = m.hy - P.y - 0.6, d = Math.hypot(dx, dy) || 1; const push = Math.max(0, L.r + 1.5 - d); const lx = lit.some((s) => Math.hypot(m.hx - s[0], m.hy - s[1]) < s[2]); m.ox += ((dx / d) * push * 1.2 - m.ox) * Math.min(1, dt * 4); m.oy += ((dy / d) * push * 0.8 - m.oy) * Math.min(1, dt * 4); m.ph += dt; m.s.position.x = m.hx + m.ox + Math.sin(m.ph) * 0.2; m.s.position.y = m.hy + m.oy + Math.cos(m.ph * 1.3) * 0.15; m.s.material.opacity = (lx || dawn > 0 ? 0.08 : 0.5) * (push > 0 ? 0.6 : 1) * (1 - dawn); }
      const tx = P.x - P.face * 1.1 + Math.sin(G.t * 1.7) * 0.4, ty = P.y + 1.9 + Math.sin(G.t * 2.3) * 0.3; nPos.x += (tx - nPos.x) * Math.min(1, dt * 3); nPos.y += (ty - nPos.y) * Math.min(1, dt * 3); nara.position.copy(nPos);
      if (Math.random() < dt * 8) emit(nPos.x, nPos.y, 0.4, 1, 0xffe9a0, 0.4, 0.8, 0.7, -0.3);
      if (woke >= 0) { gem.material = gem.material.isClone ? gem.material : Object.assign(gem.material.clone(), { isClone: true }); gem.material.emissive.set(0xffb040); gem.material.color.set(0xfff0b0); gem.rotation.y += dt; glh.material.opacity = Math.min(0.8, glh.material.opacity + dt * 0.4); glh.scale.setScalar(6 + Math.sin(G.t * 2)); }
      for (const b of bridge) if (b.t >= 0) { b.t += dt; const k = Math.min(1, b.t / 0.6); b.m.position.y = GL.top - 0.25 - 3 * (1 - k) * (1 - k); b.m.material.opacity = 0.12 + k * 0.78; }
      if (dawn > 0) { ctx.dawnFx && ctx.dawnFx(dawn); }
    },
    onWin() {
      G.slow = 1.5; document.getElementById('endTitle').textContent = 'The Elder Tree wakes — dawn returns';
      api.story('<i>Nara:</i> Do you hear it? The trees are singing again. Rest now, little Ember… we remember.', 7);
      for (let i = 0; i < 28; i++) setTimeout(() => emit(level.goal[0] + (Math.random() - 0.5) * 30, level.goal[1] + Math.random() * 8, -2, 14, [0x9ff3ff, 0xfff0b0, 0xff9fe0][i % 3], 4, 1.6, 1.3, -1), i * 140);
      audio.swell = 1;
    },
  };
}

// dawn transition: re-tint sky, lights and fog when the Elder Tree wakes
const dawnFrom = { top: 0x2a2f78, bot: 0xf0a3c4, fog: 0x7a70b4 }, dawnTo = { top: 0x6fb8ff, bot: 0xffd9a0, fog: 0xffd8c0 };
startGame({ id: 'p25b', level, palette: pal, music, buildSolid, buildScenery, buildPlayer, buildCoin, buildSpring, buildEnemy, buildCheckpoint, animCheckpoint, buildGoal, animGoal, mechanics, coinName: 'Wisps', actionLabel: 'Flare', checkText: 'Lantern lit', seed: 11, endDelay: 6500 })
  .then((api) => {
    const { THREE, scene } = api; const sky = scene.children.find((o) => o.geometry && o.geometry.type === 'SphereGeometry' && o.material.side === THREE.BackSide);
    const cA = new THREE.Color(), cB = new THREE.Color(), tmp = new THREE.Color(); let lastK = -1;
    api.ctx.dawnFx = (k) => { if (Math.abs(k - lastK) < 0.02) return; lastK = k; const top = cA.set(dawnFrom.top).lerp(tmp.set(dawnTo.top), k).clone(), bot = cB.set(dawnFrom.bot).lerp(tmp.set(dawnTo.bot), k).clone();
      const pos = sky.geometry.attributes.position, col = sky.geometry.attributes.color; for (let i = 0; i < pos.count; i++) { const t = Math.max(0, Math.min(1, pos.getY(i) / 300 * 1.6 + 0.35)); tmp.copy(bot).lerp(top, t); col.setXYZ(i, tmp.r, tmp.g, tmp.b); } col.needsUpdate = true;
      scene.fog.color.set(dawnFrom.fog).lerp(tmp.set(dawnTo.fog), k); };
  })
  .catch((e) => window.__fail && window.__fail(e && e.message || e));
