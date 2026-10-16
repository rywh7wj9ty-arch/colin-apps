import { startGame } from '../shared/engine.js';

// ---------------- LEVEL (units: 1 = player width-ish). Max jump ≈ 2.96 high / 5.9 far; every gap <= 3.5, step <= 1.6 ----------------
const G = (x0, x1, top, kind = 'ground') => ({ x0, x1, y0: kind === 'plat' ? top - 0.8 : -16, y1: top, kind });
const solids = [
  G(-12, 18, 0), G(18, 26, 1.4), G(26, 34, 0),
  G(37.5, 52, 0.5), G(52, 62, 0.5), G(57.5, 61, 6.2, 'plat'),
  G(65.5, 70, 1.5, 'plat'), G(73, 77, 2.5, 'plat'), G(80.5, 86, 1.5, 'plat'), G(89, 104, 0),
  G(104, 116, 0), // shell-bell meadow, then the whale chasm 116..134
  G(134, 150, 0), G(150, 156, 1.6), G(156, 162, 3.2), G(162, 176, 3.2),
  G(179.5, 190, 2), G(185, 189, 7.5, 'plat'), G(193.5, 198, 3.5, 'plat'), G(201, 205, 5, 'plat'), G(208, 222, 4),
  G(222, 228, 5.5), G(228, 234, 7), G(237.5, 262, 7), { x0: 262, x1: 266, y0: -16, y1: 30, kind: 'wall' },
  { x0: -16, x1: -12, y0: -16, y1: 30, kind: 'wall' },
];
const coins = [];
const line = (x0, n, y, dx = 1.4) => { for (let i = 0; i < n; i++) coins.push([x0 + i * dx, y]); };
const arc = (x0, x1, y, h = 1.6, n = 3) => { for (let i = 0; i < n; i++) { const t = (i + 1) / (n + 1); coins.push([x0 + (x1 - x0) * t, y + Math.sin(t * Math.PI) * h]); } };
line(6, 4, 1); coins.push([22, 2.6]); arc(34, 37.5, 1.6, 1.4, 2); line(58, 3, 7.2); arc(62, 65.5, 2.2, 1.2, 1); arc(70, 73, 3.2, 1.2, 1); arc(77, 80.5, 3.2, 1.2, 1); arc(86, 89, 2.2, 1.2, 1);
line(119, 4, 1.2, 3.6); line(152, 2, 2.8, 5.5); arc(176, 179.5, 4.4, 1.2, 2); line(185.6, 3, 8.7); arc(198, 201, 5, 1.2, 1); line(212, 3, 5);
coins.push([231, 8.2]); coins.push([244, 8.2]); coins.push([250, 8.2]);
const level = {
  solids, coins, start: [2, 0], bounds: [-11.5, 262], killY: -12, goal: [256, 7],
  springs: [[54, 0.5], [181, 2]],
  enemies: [[46, 0.5, 42, 50], [97, 0, 93, 102], [169, 3.2, 165, 174], [246, 7, 241, 251]],
  checkpoints: [[2, 0], [60, 0.5], [100, 0], [137, 0], [212, 4]],
  signs: [[4, 0, '◀ ▶ to run\n▲ to jump'], [31.5, 0, 'Hold ▲ to\nleap further'], [53.5, 0.5, 'Bounce for\nbonus seeds!'], [43, 0.5, 'Hop on\nbeetles!'], [110.5, 0, 'Ring the shell-bell\nto wake the whale'], [150.5, 1.6, 'Climb to\nthe summit!']],
  whale: { x0: 116.4, x1: 133.6, top: 0, bell: 113 },
};
// ---- insert 'Breezy Bluffs' section (x 150..260): everything at x>=150 shifts right by 110 ----
(() => {
  const SH = 110, sx = (x) => (x >= 150 ? x + SH : x);
  for (const o of level.solids) { if (o.x0 >= 150) { o.x0 += SH; o.x1 += SH; } }
  for (const arr of [level.coins, level.springs, level.checkpoints, level.signs]) for (const a of arr) a[0] = sx(a[0]);
  for (const e of level.enemies) if (e[0] >= 150) { e[0] += SH; e[2] += SH; e[3] += SH; }
  level.goal[0] = sx(level.goal[0]); level.bounds[1] += SH;
  level.solids.push(G(153.5, 157, 1.2, 'plat'), G(160, 163, 2.4, 'plat'), G(166, 169, 3.4, 'plat'), G(172, 186, 2), G(189.5, 196, 2.8), G(196, 204, 1.4), G(207.5, 232, 1.4), G(221.5, 226, 8, 'plat'), G(235.5, 239, 2.6, 'plat'), G(242, 246, 3.6, 'plat'), G(249, 260, 1.6));
  level.enemies.push([180, 2, 175, 184], [214, 1.4, 211, 216]);
  level.springs.push([217, 1.4]); level.checkpoints.splice(4, 0, [209, 1.4]);
  level.signs.push([174, 2, 'Breezy Bluffs'], [212.2, 1.4, 'Seeds up high?\nFind a mushroom!']);
  const cs = level.coins; cs.push([155.2, 2.4], [161.5, 3.6], [167.5, 4.6], [176, 3], [178.5, 3], [187.8, 4.2], [192.5, 3.8], [200, 2.4], [222.6, 9], [224, 9], [225.4, 9], [233.8, 3.6], [240.5, 4.6], [247.5, 4.6], [253, 2.6], [256, 2.6]);
})();

// ---------------- MUSIC: bouncy pentatonic, 120 bpm ----------------
const pent = [0, 2, 4, 7, 9];
const chords = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]];
function music(ac, out, t, step, swell) {
  const bar = Math.floor(step / 16) % 4, s = step % 16, ch = chords[bar];
  const note = (semi, d, type, v, oct = 0) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = 261.6 * Math.pow(2, semi / 12 + oct); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); };
  if (s % 4 === 0) note(ch[0], 0.4, 'triangle', 0.22, -2);
  if (s % 4 === 2) note(ch[2], 0.2, 'triangle', 0.1, -1);
  if (s % 2 === 0) note(ch[(s / 2) % 3] , 0.22, 'sine', 0.07, 0);
  const mel = [0, -1, 2, -1, 4, 3, -1, 2, 7, -1, 4, 2, 3, -1, 0, -1];
  const m = mel[(s + bar * 3) % 16]; if (m >= 0 && step % 64 >= 32) note(ch[0] + pent[m % 5] + (m > 4 ? 12 : 0), 0.3, 'square', 0.035, 1);
  if (swell > 0 && s % 2 === 0) note(ch[s % 3] + 12, 0.6, 'sine', 0.05 * swell, 1);
}
music.stepLen = 0.125;

// ---------------- ART ----------------
const pal = { skyTop: 0x4fa8ff, skyBot: 0xd8f1ff, fog: 0xc6e8ff, hemiSky: 0xdff2ff, hemiGround: 0x9b7b55, hemiI: 1.5, sun: 0xfff1d6, sunI: 2.6, sunDir: [-14, 22, 18], dust: 0xf3e1c0, spark: 0xffffff, coin: 0xffd23f, hurt: 0xff6b6b };

function buildSolid(c, o, w, h, cx, cy) {
  const { THREE, scene, mat, box, rand } = c; const grp = new THREE.Group(); scene.add(grp);
  if (o.kind === 'wall') { const m = box(w, h, 6, mat(0x9aa3b8)); m.position.set(cx, cy, 0); grp.add(m); return grp; }
  const D = 3.2;
  if (o.kind === 'plat') {
    const top = box(w + 0.3, 0.45, D + 0.3, mat(0x7ed957)); top.position.set(cx, o.y1 - 0.22, 0); grp.add(top);
    const soil = box(w, 0.6, D, mat(0xc98b55)); soil.position.set(cx, o.y1 - 0.75, 0); grp.add(soil);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, D) * 0.55, 2.6, 7), mat(0xa0704a, { flatShading: true })); cone.rotation.x = Math.PI; cone.position.set(cx, o.y1 - 2.3, 0); cone.scale.z = D / w; cone.castShadow = true; grp.add(cone);
  } else {
    const top = box(w + 0.3, 0.5, D + 0.3, mat(0x6fd36a)); top.position.set(cx, o.y1 - 0.25, 0); grp.add(top);
    const soil = box(w, 4, D, mat(0xc98b55)); soil.position.set(cx, o.y1 - 2.5, 0); grp.add(soil);
    const rock = box(w * 0.92, 6, D * 0.9, mat(0x9a6b45, { flatShading: true })); rock.position.set(cx, o.y1 - 7.5, 0); grp.add(rock);
    const stripe = box(w + 0.02, 0.35, D + 0.02, mat(0xe0a96a)); stripe.position.set(cx, o.y1 - 1.6, 0); grp.add(stripe);
  }
  // flowers & tufts on top (behind the play plane so they never hide the player)
  const n = Math.floor(w * 0.9);
  for (let i = 0; i < n; i++) {
    const x = o.x0 + 0.3 + rand() * (w - 0.6), z = -0.6 - rand() * 1.2;
    if (rand() < 0.5) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4), mat(0x4fbf4a)); t.position.set(x, o.y1 + 0.2, z); grp.add(t); }
    else { const f = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), mat([0xff7eb6, 0xfff27a, 0xffffff, 0x9fd8ff][i % 4], { emissive: 0x222222 })); f.position.set(x, o.y1 + 0.25, z); grp.add(f); }
  }
  return grp;
}

function tree(c, x, y, z, s = 1) {
  const { THREE, mat, rand } = c; const g = new THREE.Group();
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.28 * s, 2 * s, 6), mat(0x8a5a34)); tr.position.y = s; tr.castShadow = true; g.add(tr);
  const col = [0x57c45a, 0x7fd65a, 0x3fae6a, 0xff9fc6][Math.floor(rand() * 4)];
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry((0.9 - i * 0.15) * s, 1), mat(col, { flatShading: true })); b.position.set((rand() - 0.5) * 0.6 * s, (2.1 + i * 0.6) * s, (rand() - 0.5) * 0.4 * s); b.castShadow = true; g.add(b); }
  g.position.set(x, y, z); c.scene.add(g); return g;
}

function buildScenery(c, L) {
  const { THREE, scene, mat, rand } = c;
  // cloud sea (instanced)
  const cg = new THREE.SphereGeometry(1, 10, 8), cm = mat(0xffffff, { roughness: 1, emissive: 0x6c7fa0, emissiveIntensity: 0.25 });
  const N = 260, inst = new THREE.InstancedMesh(cg, cm, N); const M = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < N; i++) { const s = 2 + rand() * 4; M.compose(v.set(-30 + rand() * 330, -10 - rand() * 3, -60 + rand() * 72), q, sc.set(s * 1.6, s * 0.7, s)); inst.setMatrixAt(i, M); }
  scene.add(inst);
  // far mountains (silhouettes with aerial perspective)
  for (let i = 0; i < 26; i++) { const h = 20 + rand() * 30; const m = new THREE.Mesh(new THREE.ConeGeometry(10 + rand() * 12, h, 6), mat(0x9fc3e8, { flatShading: true, emissive: 0x8fb6e0, emissiveIntensity: 0.35 })); m.position.set(-40 + i * 14 + rand() * 6, -10 + h / 2, -120 - rand() * 30); scene.add(m); const cap = new THREE.Mesh(new THREE.ConeGeometry(4, h * 0.25, 6), mat(0xffffff, { flatShading: true })); cap.position.set(m.position.x, m.position.y + h * 0.38, m.position.z + 0.5); scene.add(cap); }
  // mid floating islands (parallax layer)
  for (let i = 0; i < 22; i++) {
    const x = -20 + i * 14 + rand() * 6, y = 2 + rand() * 14, z = -30 - rand() * 35, r = 3 + rand() * 4;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 1, 8), mat(0x7ed957, { flatShading: true })); top.position.set(x, y, z); scene.add(top);
    const bot = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, r * 1.8, 8), mat(0xb07b4f, { flatShading: true })); bot.rotation.x = Math.PI; bot.position.set(x, y - r * 0.9 - 0.5, z); scene.add(bot);
    if (rand() < 0.8) tree(c, x + (rand() - 0.5) * r, y + 0.5, z, 1 + rand());
    if (rand() < 0.3) { const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 8, 6, 1, true), mat(0xbfe9ff, { emissive: 0x7fcfff, emissiveIntensity: 0.4, transparent: true, opacity: 0.8 })); fall.position.set(x + r * 0.7, y - 4, z + 1); scene.add(fall); }
  }
  // near background trees along the path (z = -3..-6)
  for (const s of L.solids) { if (s.kind === 'wall') continue; for (let x = s.x0 + 1; x < s.x1 - 1; x += 4 + rand() * 4) tree(c, x, s.y1, -2.8 - rand() * 3, 0.8 + rand() * 0.7); }
  // foreground bushes below the walking line (never cover the player)
  for (const s of L.solids) { if (s.kind !== 'ground') continue; for (let x = s.x0 + 1; x < s.x1; x += 5 + rand() * 5) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), mat(0x3fae6a)); b.position.set(x, s.y1 - 2.2, 2.4); scene.add(b); } }
  // windmill landmark
  const wm = new THREE.Group(); const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 9, 8), mat(0xfff3e0)); tw.position.y = 4.5; wm.add(tw); const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2, 8), mat(0xff6b5e)); roof.position.y = 10; wm.add(roof);
  const blades = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.1), mat(0xffffff)); b.position.y = 2.5; const h = new THREE.Group(); h.add(b); h.rotation.z = i * Math.PI / 2; blades.add(h); } blades.position.set(0, 8.5, 1.5); wm.add(blades); wm.position.set(30, 0, -14); scene.add(wm); c.blades = blades;
}

function outline(c, mesh, s = 1.07) { const o = new c.THREE.Mesh(mesh.geometry, c.mat(0x2a2150, { side: c.THREE.BackSide, roughness: 1 })); o.scale.setScalar(s); mesh.add(o); return o; }

function buildPlayer(c) {
  const { THREE, mat } = c; const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const fur = mat(0xff8a3d, { roughness: 0.7 }), cream = mat(0xfff1dc), dark = mat(0x2a2150);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 16), fur); torso.scale.set(1, 1.05, 0.95); torso.position.y = 0.62; torso.castShadow = true; body.add(torso); outline(c, torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), cream); belly.position.set(0, 0.52, 0.26); belly.scale.set(1, 1.1, 0.6); body.add(belly);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 8), fur); ear.position.set(sx * 0.24, 1.08, 0); ear.rotation.z = -sx * 0.35; ear.castShadow = true; body.add(ear); outline(c, ear, 1.12);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), mat(0xffffff, { roughness: 0.3 })); eye.position.set(sx * 0.15, 0.76, 0.38); body.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), dark); pup.position.set(sx * 0.15, 0.76, 0.46); body.add(pup);
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.08, 8, 20), mat(0x24c6c6)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.38; body.add(scarf);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), fur); tail.scale.set(1, 1, 1.6); tail.position.set(0, 0.45, -0.45); body.add(tail); outline(c, tail, 1.1);
  const legs = []; for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.18, 4, 8), dark); l.position.set(sx * 0.2, 0.15, 0); body.add(l); legs.push(l); }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; c.scene.add(shadow);
  let face = 0;
  return { root, update(s) {
    root.position.set(s.x, s.y, 0); face += ((s.face > 0 ? 0.55 : Math.PI - 0.55) - face) * Math.min(1, s.dt * 14 || 0.2); body.rotation.y = face;
    body.scale.set(1 / Math.sqrt(s.sq), s.sq, 1 / Math.sqrt(s.sq));
    const ph = s.t * 18; legs.forEach((l, i) => { l.position.y = 0.15 + (s.ground ? Math.max(0, Math.sin(ph + i * Math.PI)) * 0.15 * s.run : 0.08); l.position.z = s.ground ? Math.cos(ph + i * Math.PI) * 0.15 * s.run : -0.05; });
    body.position.y = s.ground ? Math.abs(Math.sin(ph)) * 0.06 * s.run : 0; body.rotation.x = s.ground ? s.run * 0.12 : -s.vy * 0.01;
    tail.rotation.y = Math.sin(s.t * 6) * 0.4; root.visible = !s.dead && !(s.inv > 0 && Math.floor(s.t * 20) % 2);
    shadow.position.set(s.x, s.y + 0.02, 0); shadow.visible = s.ground && root.visible;
  } };
}
function buildCoin(c) { const { THREE, mat } = c; const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), mat(0xffc828, { emissive: 0xffa800, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3, flatShading: true })); m.scale.set(0.8, 1.15, 0.5); g.add(m); g.add(c.halo(0xffe066, 1.6, 0.45)); return g; }
function buildSpring(c) { const { THREE, mat } = c; const g = new THREE.Group(); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 10), mat(0xfff1dc)); st.position.y = 0.25; g.add(st); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xff4f6d)); cap.position.y = 0.45; cap.castShadow = true; g.add(cap); for (let i = 0; i < 5; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xffffff)); const a = i * 1.26; d.position.set(Math.cos(a) * 0.45, 0.85, Math.sin(a) * 0.45); g.add(d); } return g; }
function buildEnemy(c) { const { THREE, mat } = c; const g = new THREE.Group(); const sh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8e5cf7, { roughness: 0.4 })); sh.position.y = 0.2; sh.castShadow = true; g.add(sh); outline(c, sh, 1.08); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.25, 16), mat(0x3b2a6b)); b.position.y = 0.12; g.add(b); for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xffffff)); e.position.set(0.42, 0.4, sx * 0.16); g.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0x000000)); p.position.set(0.5, 0.4, sx * 0.16); g.add(p); }
  const legs = []; for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2), mat(0x2a2150)); l.position.set(-0.2 + (i % 2) * 0.4, 0.05, i < 2 ? 0.3 : -0.3); g.add(l); legs.push(l); }
  g.userData.anim = (t) => { legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 16 + i) * 0.5)); sh.position.y = 0.2 + Math.abs(Math.sin(t * 8)) * 0.04; }; return g; }
function buildCheckpoint(c) { const { THREE, mat } = c; const g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), mat(0xfff3e0)); pole.position.set(0, 1.6, -0.8); g.add(pole); const flag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.05), mat(0xb8b3cc)); flag.position.set(0.58, 2.8, -0.8); g.add(flag); g.userData.flag = flag; const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat(0xffd23f, { emissive: 0x996600 })); knob.position.set(0, 3.25, -0.8); g.add(knob); return g; }
function animCheckpoint(cp, t) { const f = cp.m.userData.flag; if (cp.on && !cp.done) { cp.done = true; f.material = f.material.clone(); f.material.color.set(0x24c6c6); f.material.emissive.set(0x0a5a5a); } f.rotation.y = Math.sin(t * 3 + cp.x) * 0.25; }
function buildGoal(c) { const { THREE, mat } = c; const g = new THREE.Group(); for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 5, 8), mat(0xfff3e0)); p.position.set(sx * 1.4, 2.5, -1); p.castShadow = true; g.add(p); } const beam = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.7), mat(0xff6b5e)); beam.position.set(0, 5.2, -1); g.add(beam); const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.6, 4), mat(0xff6b5e, { flatShading: true })); roof.rotation.y = Math.PI / 4; roof.position.set(0, 6.2, -1); g.add(roof);
  const bell = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 1.4, 16, 1, true), mat(0xffc828, { metalness: 0.7, roughness: 0.25, emissive: 0x664400, side: THREE.DoubleSide })); b.position.y = -0.8; bell.add(b); bell.position.set(0, 4.95, -1); g.add(bell); { const h = c.halo(0xffe08a, 5, 0.35); h.position.set(0, 4.2, -0.5); g.add(h); } g.userData.bell = bell; return g; }
function animGoal(g, t, won) { g.userData.bell.rotation.z = won ? Math.sin(t * 8) * 0.5 : Math.sin(t * 1.5) * 0.06; }

// ---------------- MECHANICS: shell-bell + the rising Sky Whale (wow moment) + finale fireworks ----------------
function mechanics(api) {
  const { THREE, scene, ctx, G, P, emit, audio } = api; const W = level.whale; const mat = ctx.mat;
  const whale = new THREE.Group(); scene.add(whale);
  const cx = (W.x0 + W.x1) / 2, len = (W.x1 - W.x0);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat(0x7fa8e8, { roughness: 0.55 })); body.scale.set(len / 2 + 1.5, 3.4, 3.6); body.position.y = -3.35; body.castShadow = true; body.receiveShadow = true; whale.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat(0xf3f6ff)); belly.scale.set(len / 2, 2.4, 3.2); belly.position.set(0, -4.6, 0.7); whale.add(belly);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 32), mat(0x7ed957)); pad.scale.set(len / 2 + 0.2, 1, 1.9); pad.position.y = -0.25; pad.receiveShadow = true; whale.add(pad);
  for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat([0xff7eb6, 0xfff27a, 0xffffff][i % 3])); f.position.set(-len / 2 + 1.5 + i * (len - 3) / 8, 0.12, -0.9 - (i % 2) * 0.5); whale.add(f); }
  const tailFin = new THREE.Mesh(new THREE.ConeGeometry(2, 3, 4), mat(0x6a93d8, { flatShading: true })); tailFin.rotation.z = Math.PI / 2; tailFin.scale.z = 0.3; tailFin.position.set(len / 2 + 3, -2.6, 0); whale.add(tailFin);
  for (const sz of [-1, 1]) { const fin = new THREE.Mesh(new THREE.ConeGeometry(1, 3, 4), mat(0x6a93d8, { flatShading: true })); fin.rotation.set(sz * 1.2, 0, 0.5); fin.position.set(-len / 4, -5, sz * 3.2); whale.add(fin);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), mat(0x1d1840)); eye.position.set(-len / 2 + 0.5, -3.2, sz * 3.15); whale.add(eye); const gl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0xffffff, { emissive: 0xffffff })); gl.position.set(-len / 2 + 0.6, -3.0, sz * 3.5); whale.add(gl); }
  const DOWN = -26; whale.position.set(cx, DOWN, 0);
  const col = { x0: W.x0, x1: W.x1, y0: W.top - 4, y1: W.top, kind: 'whale', off: true };
  const bellM = new THREE.Group(); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.4, 16), mat(0x3b2a6b)); post.position.y = 0.2; bellM.add(post); const shell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xff9fc6, { emissive: 0xff5fa0, emissiveIntensity: 0.4 })); shell.position.y = 0.4; bellM.add(shell); const hl = api.halo(0xff9fc6, 3, 0.5); hl.position.y = 0.8; bellM.add(hl); bellM.position.set(W.bell, 0, 0); scene.add(bellM);
  let rising = -1, risen = false, lock = 0;
  return {
    extraSolids: () => [col],
    locked: () => lock > 0,
    camTarget: () => (lock > 0 ? [cx - 2, -2.5] : null),
    camZoomOut: () => (lock > 0 ? 0.75 : 0),
    onRespawn() {},
    step(dt) {
      if (rising < 0 && Math.abs(P.x - W.bell) < 0.9 && P.y < 0.8) { rising = 0; lock = 4.4; audio.sfx('chime'); audio.sfx('rumble'); shell.position.y = 0.25; api.toast('The Sky Whale awakens!', 3); }
      if (lock > 0) lock -= dt;
      if (rising >= 0 && !risen) {
        rising += dt; const k = Math.min(1, rising / 3.6); const e = 1 - Math.pow(1 - k, 3);
        whale.position.y = DOWN + (W.top - DOWN) * e; G.shake = Math.max(G.shake, 0.35 * (1 - k)); audio.swell = 1;
        if (Math.random() < 0.6) emit(cx + (Math.random() - 0.5) * len, -9, 0, 3, 0xffffff, 6, 1.2, 2.5, 4);
        if (k >= 1) { risen = true; col.off = false; whale.position.y = W.top; emit(cx, 1, 0, 60, 0xbfe9ff, 8, 1.2, 1.5, 6); audio.sfx('win'); setTimeout(() => (audio.swell = 0), 6000); }
      }
    },
    render(dt) { if (risen) { body.rotation.z = Math.sin(G.t * 0.8) * 0.01; tailFin.rotation.y = Math.sin(G.t * 1.5) * 0.3; } if (ctx.blades) ctx.blades.rotation.z += dt * 0.8; },
    onWin() { G.slow = 1.2; G.zoom = 1.2; for (let i = 0; i < 6; i++) setTimeout(() => { audio.sfx('coin', i * 2); emit(level.goal[0] + (Math.random() - 0.5) * 8, level.goal[1] + 6 + Math.random() * 3, -1, 40, [0xff6b9d, 0xffd23f, 0x5ee0ff, 0x9dff6b][i % 4], 7, 1.4, 1.4, 3); }, i * 350); document.getElementById('endTitle').textContent = 'The summit bell rings!'; },
    botWantJump: () => false,
  };
}

startGame({ id: 'p25a', level, palette: pal, music, buildSolid, buildScenery, buildPlayer, buildCoin, buildSpring, buildEnemy, buildCheckpoint, animCheckpoint, buildGoal, animGoal, mechanics, coinName: 'Sun seeds', seed: 7 }).catch((e) => window.__fail && window.__fail(e && e.message || e));
