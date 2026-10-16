// Shared 2.5D platformer engine — Three.js WebGPURenderer (auto WebGL2 fallback) + custom kinematic controller.
import * as T0 from '../vendor/three.webgpu.min.js';
// Node-material aliases so classic material names work in WebGPURenderer (both backends)
const THREE = { ...T0, MeshStandardMaterial: T0.MeshStandardNodeMaterial, MeshBasicMaterial: T0.MeshBasicNodeMaterial, SpriteMaterial: T0.SpriteNodeMaterial };
export { THREE };

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const FIXED = 1 / 120;

// ---------- physics constants (tuned for human-tolerant margins) ----------
export const PHYS = { run: 8, accG: 75, accA: 48, dec: 70, g: 38, gFall: 50, jump: 15, maxFall: 22, coyote: 0.13, buffer: 0.15, spring: 23, pw: 0.8, ph: 1.2 };
// max jump height = jump^2/(2g) ≈ 2.96 ; flat distance ≈ 5.9. Level rules: gaps <= 4, step-ups <= 1.8.

export async function startGame(cfg) {
  const L = cfg.level; // {solids, coins, springs, enemies, checkpoints, goal, signs, ...}
  const saveKey = cfg.id + '-save-v1';
  const save = Object.assign({ music: 0.6, sfx: 0.8, bright: 1, best: 0, runs: 0, wins: 0, deaths: 0, jumps: 0, collected: [], playTime: 0, bestCollect: 0 }, JSON.parse(localStorage.getItem(saveKey) || '{}'));
  const persist = () => { try { localStorage.setItem(saveKey, JSON.stringify(save)); } catch (e) {} };

  // ---------- renderer ----------
  const wrap = $('#stage');
  const forceGL = /[?&]gl=1/.test(location.search) || sessionStorage.getItem('p25-forcegl') === '1';
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: forceGL });
  await renderer.init();
  const backendName = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  window.__renderer = backendName;
  if (backendName === 'WebGPU') { // safety net: if the WebGPU device misbehaves early, transparently restart on WebGL2
    const bail = (m) => { if ((window.__frames || 0) < 600 && /GPU|createBuffer|WGSL|pipeline/i.test(String(m))) { try { sessionStorage.setItem('p25-forcegl', '1'); } catch (e) {} location.reload(); } };
    addEventListener('error', (e) => bail(e.message)); addEventListener('unhandledrejection', (e) => bail(e.reason && e.reason.message || e.reason));
    try { renderer.backend.device.addEventListener('uncapturederror', (e) => bail('GPU ' + (e.error && e.error.message))); renderer.backend.device.lost.then((i) => bail('GPU lost ' + i.message)); } catch (e) {}
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  wrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
  const pal = cfg.palette;
  scene.fog = new THREE.Fog(pal.fog, pal.fogNear || 55, pal.fogFar || 210);

  // sky dome with vertex-colour gradient
  const skyGeo = new THREE.SphereGeometry(300, 32, 16);
  const skyCols = []; const skyTop = new THREE.Color(pal.skyTop), skyBot = new THREE.Color(pal.skyBot);
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const t = clamp(pos.getY(i) / 300 * 1.6 + 0.35, 0, 1); const c = skyBot.clone().lerp(skyTop, t); skyCols.push(c.r, c.g, c.b); }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCols, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(skyGeo, skyMat); scene.add(sky);

  const hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, pal.hemiI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(pal.sun, pal.sunI);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);

  // ---------- materials / helpers ----------
  const mats = {};
  const mat = (c, o = {}) => { if (o.flatShading) { o = Object.assign({}, o); delete o.flatShading; } // r169 WebGL2 backend can't compile flatShading in vertex stage
    const k = c + JSON.stringify(o); return mats[k] || (mats[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, metalness: 0 }, o))); };
  const box = (w, h, d, m) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.castShadow = true; g.receiveShadow = true; return g; };
  const R = cfg.seed ? mulberry(cfg.seed) : Math.random;
  const ctx = { THREE, scene, mat, box, rand: R, pal, camera };

  // halo sprite texture
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const halo = (color, size, op = 0.7) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.scale.set(size, size, 1); return s; };
  ctx.halo = halo;

  // ---------- level geometry ----------
  const solids = []; // {x0,x1,y0,y1, mesh?, kind, dyn?}
  for (const s of L.solids) {
    const o = Object.assign({ kind: 'ground' }, s); solids.push(o);
    const w = o.x1 - o.x0, h = o.y1 - o.y0, cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
    o.mesh = cfg.buildSolid(ctx, o, w, h, cx, cy);
  }
  // scenery (parallax layers are real 3D at different depths)
  cfg.buildScenery(ctx, L);

  // coins / wisps
  const coins = L.coins.map((c, i) => { const m = cfg.buildCoin(ctx); m.position.set(c[0], c[1], 0); scene.add(m); return { x: c[0], y: c[1], id: i, m, got: false, t: R() * 6 }; });
  const springs = (L.springs || []).map((s) => { const m = cfg.buildSpring(ctx); m.position.set(s[0], s[1], 0); scene.add(m); return { x: s[0], y: s[1], m, sq: 0 }; });
  const enemies = (L.enemies || []).map((e) => { const m = cfg.buildEnemy(ctx); scene.add(m); return { x: e[0], y: e[1], x0: e[2], x1: e[3], vx: 2, m, dead: false, sx: e[0] }; });
  const checkpoints = L.checkpoints.map((c, i) => { const m = cfg.buildCheckpoint(ctx); m.position.set(c[0], c[1], 0); scene.add(m); return { x: c[0], y: c[1], m, on: i === 0, i }; });
  const signs = (L.signs || []).map((s) => { const m = makeSign(ctx, s[2]); m.position.set(s[0], s[1], -1.2); scene.add(m); return m; });
  const goalM = cfg.buildGoal(ctx); goalM.position.set(L.goal[0], L.goal[1], 0); scene.add(goalM);

  // ---------- player ----------
  const player = cfg.buildPlayer(ctx); scene.add(player.root);
  const P = { x: L.start[0], y: L.start[1], vx: 0, vy: 0, ground: false, coyote: 0, buf: 0, face: 1, cut: false, sq: 1, dead: 0, inv: 0, cp: 0, groundRef: null };

  // ---------- particles (instanced pool) ----------
  const PN = 260;
  const pGeo = new THREE.IcosahedronGeometry(0.09, 0);
  const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, fog: false });
  const parts = new THREE.InstancedMesh(pGeo, pMat, PN); parts.frustumCulled = false; scene.add(parts);
  const pool = []; for (let i = 0; i < PN; i++) pool.push({ life: 0 });
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  let pIdx = 0;
  const emit = (x, y, z, n, col, spd = 4, life = 0.7, size = 1, grav = 6) => {
    for (let k = 0; k < n; k++) { const p = pool[pIdx = (pIdx + 1) % PN]; const a = R() * Math.PI * 2, s = spd * (0.4 + R() * 0.6); p.x = x; p.y = y; p.z = z + (R() - 0.5) * 0.6; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.vz = (R() - 0.5) * s * 0.5; p.life = p.max = life * (0.6 + R() * 0.5); p.col = col; p.size = size; p.g = grav; }
  };
  for (let i = 0; i < PN; i++) { parts.setColorAt(i, tmpC.set(0xffffff)); }

  // ---------- audio ----------
  const audio = makeAudio(cfg.music, save);
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true }); window.addEventListener('touchend', unlock, { passive: true }); window.addEventListener('keydown', unlock);

  // ---------- input ----------
  const input = { left: false, right: false, jump: false, act: false, kl: false, kr: false, kj: false, ka: false, tl: false, tr: false, tj: false, ta: false, bot: null };
  const keys = { ArrowLeft: 'kl', KeyA: 'kl', ArrowRight: 'kr', KeyD: 'kr', Space: 'kj', ArrowUp: 'kj', KeyW: 'kj', KeyZ: 'kj', KeyX: 'ka', ShiftLeft: 'ka', KeyE: 'ka' };
  addEventListener('keydown', (e) => { if (keys[e.code]) { input[keys[e.code]] = true; e.preventDefault(); } if (e.code === 'Escape' || e.code === 'KeyP') togglePause(); });
  addEventListener('keyup', (e) => { if (keys[e.code]) input[keys[e.code]] = false; });
  setupTouch(input, !!cfg.actionLabel);

  // ---------- UI ----------
  const ui = setupUI(cfg, save, persist, audio, () => applyBright());
  function applyBright() { const b = save.bright; hemi.intensity = pal.hemiI * b; sun.intensity = pal.sunI * b; renderer.toneMappingExposure = 0.85 + 0.35 * b; }
  applyBright();

  // ---------- game state ----------
  const G = { t: 0, runTime: 0, state: 'title', got: 0, deaths: 0, jumps: 0, shake: 0, zoom: 0, slow: 0, won: false, flags: {}, msg: null };
  window.__game = { G, P, coins, solids, L, sim, botStart, backend: backendName, input, save, audio };
  const camS = { x: P.x, y: P.y + 2, z: 30 };

  const api = { THREE, scene, ctx, G, P, emit, audio, solids, shake: (v) => (G.shake = Math.max(G.shake, v)), toast: (t, d) => ui.toast(t, d), story: (t, d) => ui.story(t, d), halo, input, camS, player, R };
  const ext = cfg.mechanics ? cfg.mechanics(api) : {};

  function respawn() {
    const c = checkpoints[P.cp]; P.x = c.x; P.y = c.y + 0.2; P.vx = P.vy = 0; P.dead = 0; P.inv = 1;
    if (ext.onRespawn) ext.onRespawn();
  }
  function hurt() {
    if (P.inv > 0 || P.dead > 0 || G.won) return;
    P.dead = 0.8; G.deaths++; (G.deathLog = G.deathLog || []).push(+P.x.toFixed(1)); save.deaths++; audio.sfx('hurt'); G.shake = 0.5; emit(P.x, P.y + 0.6, 0, 30, pal.hurt, 6, 0.8);
  }
  api.hurt = hurt;

  function solidList() { return ext.extraSolids ? solids.concat(ext.extraSolids()) : solids; }
  function overlap(x, y, s) { return x - PHYS.pw / 2 < s.x1 && x + PHYS.pw / 2 > s.x0 && y < s.y1 && y + PHYS.ph > s.y0; }

  function step(dt) {
    G.t += dt;
    if (G.state !== 'play') return;
    G.runTime += dt; save.playTime += dt;
    // input merge
    let jl = input.kl || input.tl, jr = input.kr || input.tr, jj = input.kj || input.tj, ja = input.ka || input.ta;
    if (input.bot) { const b = input.bot(dt); jl = false; jr = b.r; jj = b.j; ja = b.a; }
    if (ext.locked && ext.locked()) { jl = jr = jj = ja = false; }
    const jumpPressed = jj && !input._pj; input._pj = jj;
    const actPressed = ja && !input._pa; input._pa = ja;
    if (P.dead > 0) { P.dead -= dt; if (P.dead <= 0) respawn(); return; }
    if (P.inv > 0) P.inv -= dt;
    const ax = (jr ? 1 : 0) - (jl ? 1 : 0);
    if (ax) P.face = ax;
    const target = ax * PHYS.run;
    const acc = ax ? (P.ground ? PHYS.accG : PHYS.accA) : (P.ground ? PHYS.dec : PHYS.accA * 0.4);
    P.vx += clamp(target - P.vx, -acc * dt, acc * dt);
    if (jumpPressed) P.buf = PHYS.buffer; else P.buf -= dt;
    if (P.ground) P.coyote = PHYS.coyote; else P.coyote -= dt;
    if (P.buf > 0 && P.coyote > 0) { P.vy = PHYS.jump; P.buf = 0; P.coyote = 0; P.ground = false; P.cut = false; P.sq = 1.35; G.jumps++; save.jumps++; audio.sfx('jump'); emit(P.x, P.y, 0, 8, pal.dust, 2.5, 0.45, 1, 3); }
    if (!jj && P.vy > 0 && !P.cut) { P.vy *= 0.5; P.cut = true; }
    P.vy -= (P.vy > 0 ? PHYS.g : PHYS.gFall) * dt; if (P.vy < -PHYS.maxFall) P.vy = -PHYS.maxFall;
    if (actPressed && ext.onAction) ext.onAction();
    // move & collide (x then y)
    const list = solidList();
    if (P.groundRef && P.groundRef.dx) P.x += P.groundRef.dx;
    P.x += P.vx * dt;
    for (const s of list) { if (s.off) continue; if (overlap(P.x, P.y, s)) { if (P.vx > 0) P.x = s.x0 - PHYS.pw / 2 - 1e-4; else if (P.vx < 0) P.x = s.x1 + PHYS.pw / 2 + 1e-4; else { P.x = (P.x < (s.x0 + s.x1) / 2) ? s.x0 - PHYS.pw / 2 : s.x1 + PHYS.pw / 2; } P.vx = 0; } }
    P.x = Math.max(P.x, L.bounds[0]);
    const wasGround = P.ground; P.ground = false; P.groundRef = null;
    const vyBefore = P.vy;
    P.y += P.vy * dt;
    for (const s of list) { if (s.off) continue; if (overlap(P.x, P.y, s)) { if (P.vy <= 0) { P.y = s.y1; P.ground = true; P.groundRef = s; } else { P.y = s.y0 - PHYS.ph - 1e-4; } P.vy = 0; } }
    if (!P.ground) { // ground probe for standing still
      for (const s of list) { if (!s.off && P.x - PHYS.pw / 2 < s.x1 && P.x + PHYS.pw / 2 > s.x0 && Math.abs(P.y - s.y1) < 1e-3) { P.ground = true; P.groundRef = s; } }
    }
    if (P.ground && !wasGround) { const imp = clamp(-vyBefore / 20, 0, 1); P.sq = 1 - 0.3 * imp - 0.05; if (imp > 0.35) { emit(P.x, P.y, 0, 6 + imp * 10 | 0, pal.dust, 3, 0.5, 1, 2); G.shake = Math.max(G.shake, imp * 0.18); audio.sfx('land'); } }
    if (P.y < L.killY) hurt();
    // springs
    for (const s of springs) if (Math.abs(P.x - s.x) < 0.9 && P.y >= s.y - 0.2 && P.y < s.y + 0.6 && P.vy <= 0) { P.vy = PHYS.spring; P.cut = true; P.ground = false; s.sq = 1; audio.sfx('spring'); emit(s.x, s.y + 0.4, 0, 14, pal.spark, 4, 0.6); G.shake = 0.15; }
    // enemies
    for (const e of enemies) {
      if (e.dead) { e.dt = (e.dt || 0) + dt; continue; }
      e.x += e.vx * dt; if (e.x > e.x1) { e.x = e.x1; e.vx = -2; } if (e.x < e.x0) { e.x = e.x0; e.vx = 2; }
      if (Math.abs(P.x - e.x) < 0.95 && P.y < e.y + 0.9 && P.y + PHYS.ph > e.y) {
        if (P.vy < 0 && P.y > e.y + 0.3) { e.dead = true; P.vy = 12; P.cut = true; audio.sfx('stomp'); emit(e.x, e.y + 0.5, 0, 20, pal.spark, 5, 0.7); G.shake = 0.2; G.stomps = (G.stomps || 0) + 1; }
        else hurt();
      }
    }
    // coins
    for (const c of coins) if (!c.got && Math.abs(P.x - c.x) < 0.9 && Math.abs(P.y + 0.6 - c.y) < 1.0) {
      c.got = true; G.got++; audio.sfx('coin', G.got); emit(c.x, c.y, 0, 18, pal.coin, 4.5, 0.7, 1, 0); G.zoom = Math.min(G.zoom + 0.6, 1.2); ui.count(G.got, coins.length);
      if (!save.collected.includes(c.id)) save.collected.push(c.id);
      if (ext.onCoin) ext.onCoin(c);
    }
    // checkpoints
    for (const c of checkpoints) if (!c.on && Math.abs(P.x - c.x) < 1.2 && Math.abs(P.y - c.y) < 2.5) { c.on = true; P.cp = c.i; audio.sfx('check'); emit(c.x, c.y + 2, 0, 30, pal.spark, 5, 0.9); ui.toast(cfg.checkText || 'Checkpoint!', 1.4); if (ext.onCheckpoint) ext.onCheckpoint(c); }
    if (ext.step) ext.step(dt);
    // goal
    if (!G.won && Math.abs(P.x - L.goal[0]) < 1.4 && P.y >= L.goal[1] - 0.5 && P.y < L.goal[1] + 4) win();
  }

  function win() {
    G.won = true; G.state = 'ending'; audio.sfx('win');
    save.wins++; if (!save.best || G.runTime < save.best) save.best = G.runTime; save.bestCollect = Math.max(save.bestCollect, G.got); persist();
    if (ext.onWin) ext.onWin();
    setTimeout(() => ui.showEnd({ time: G.runTime, got: G.got, total: coins.length, deaths: G.deaths, jumps: G.jumps, best: save.best }), cfg.endDelay || 3500);
  }

  // ---------- render ----------
  const tmpV = new THREE.Vector3();
  function render(dt) {
    // camera
    const asp = camera.aspect;
    const halfW = asp < 1 ? 5.4 : 10;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let dist = Math.max(15, halfW / (tanH * asp));
    dist = Math.min(dist, 34);
    dist *= 1 + (ext.camZoomOut ? ext.camZoomOut() : 0);
    G.zoom = Math.max(0, G.zoom - dt * 2);
    const look = ext.camTarget ? ext.camTarget() : null;
    const tx = look ? look[0] : P.x + P.face * (asp < 1 ? 1.2 : 2.5) + P.vx * 0.12;
    const ty = look ? look[1] : P.y + (asp < 1 ? 2.6 : 2.2);
    camS.x = lerp(camS.x, tx, 1 - Math.exp(-dt * 4));
    camS.y = lerp(camS.y, ty, 1 - Math.exp(-dt * 3));
    camS.z = lerp(camS.z, dist * (1 - G.zoom * 0.05), 1 - Math.exp(-dt * 3));
    G.shake = Math.max(0, G.shake - dt * 1.5);
    const sh = G.shake * G.shake * 1.2;
    camera.position.set(camS.x + (R() - 0.5) * sh + Math.sin(G.t * 0.7) * 0.08, camS.y + camS.z * 0.16 + (R() - 0.5) * sh + Math.sin(G.t * 0.9) * 0.06, camS.z);
    camera.lookAt(camS.x, camS.y, 0);
    sky.position.set(camera.position.x, 0, 0);
    sun.position.set(P.x + pal.sunDir[0], P.y + pal.sunDir[1], pal.sunDir[2]); sun.target.position.set(P.x, P.y, 0);
    // player visuals
    P.sq = lerp(P.sq, 1, 1 - Math.exp(-dt * 12));
    const run = Math.abs(P.vx) / PHYS.run;
    player.update({ x: P.x, y: P.y, face: P.face, sq: P.sq, run, ground: P.ground, vy: P.vy, t: G.t, dead: P.dead > 0, inv: P.inv, dt });
    if (P.ground && run > 0.6 && R() < dt * 10) emit(P.x - P.face * 0.3, P.y + 0.05, 0, 1, pal.dust, 1, 0.4, 0.8, 1);
    // coins
    for (const c of coins) { c.t += dt; if (c.got) { if (c.m.visible) { c.m.scale.multiplyScalar(0.85); c.m.position.y += dt * 4; if (c.m.scale.x < 0.05) c.m.visible = false; } } else { c.m.rotation.y = c.t * 2.2; c.m.position.y = c.y + Math.sin(c.t * 2.5) * 0.12; } }
    for (const s of springs) { s.sq = Math.max(0, s.sq - dt * 4); s.m.scale.y = 1 - Math.sin(s.sq * Math.PI) * 0.35 + s.sq * 0.4; }
    for (const e of enemies) { if (e.dead) { e.m.scale.y = Math.max(0.05, 1 - e.dt * 6); e.m.visible = e.dt < 1.2; } e.m.position.set(e.x, e.y, 0); e.m.rotation.y = e.vx > 0 ? 0.3 : Math.PI - 0.3; if (e.m.userData.anim) e.m.userData.anim(G.t); }
    for (const c of checkpoints) cfg.animCheckpoint && cfg.animCheckpoint(c, G.t);
    if (cfg.animGoal) cfg.animGoal(goalM, G.t, G.won);
    if (ext.render) ext.render(dt);
    // particles
    let n = 0;
    for (let i = 0; i < PN; i++) { const p = pool[i]; if (p.life <= 0) { tmpS.set(0, 0, 0); tmpM.compose(tmpP.set(0, -999, 0), tmpQ, tmpS); parts.setMatrixAt(i, tmpM); continue; }
      p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.98; const k = p.life / p.max; const s = p.size * (0.4 + k);
      tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(s, s, s)); parts.setMatrixAt(i, tmpM); parts.setColorAt(i, tmpC.set(p.col)); n++; }
    parts.instanceMatrix.needsUpdate = true; if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
    renderer.render(scene, camera);
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0, frames = 0;
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.slow > 0) { G.slow -= dt; dt *= 0.35; }
    if (!ui.paused) { acc += dt; while (acc >= FIXED) { step(FIXED); acc -= FIXED; } }
    render(ui.paused ? 0 : dt); frames++;
    window.__frames = frames;
    requestAnimationFrame(frame);
  }
  function sim(seconds) { const n = Math.round(seconds / FIXED); for (let i = 0; i < n && G.state === 'play'; i++) step(FIXED); }

  // resize from bounding rect (never 100vh)
  function resize() {
    const r = wrap.getBoundingClientRect(); const w = Math.max(1, r.width | 0), h = Math.max(1, r.height | 0);
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(wrap); addEventListener('orientationchange', () => setTimeout(resize, 200)); resize();

  function togglePause() { if (G.state === 'play') ui.pause(!ui.paused); }
  ui.onStart = () => { G.state = 'play'; G.runTime = 0; save.runs++; persist(); ui.count(0, coins.length); if (ext.onStart) ext.onStart(); };
  ui.onRestart = () => location.reload();
  ui.getStats = () => ({ save, G, total: coins.length, backend: backendName });
  setInterval(persist, 5000); addEventListener('pagehide', persist);
  ui.count(0, coins.length);
  ui.setBackend(backendName);

  // ---------- bot (scripted run for tests): hold right, jump at edges/walls/enemies with human timing jitter ----------
  function botStart(jitter = 0.07, seed = 1) {
    const rr = mulberry(seed); let pending = -1, hold = 0;
    input.bot = (dt) => {
      const out = { r: true, j: false, a: false };
      if (hold > 0) { hold -= dt; out.j = true; return out; }
      if (pending >= 0) { pending -= dt; if (pending < 0) { hold = 0.32; out.j = true; } return out; }
      if (P.ground && P.dead <= 0) {
        const list = solidList(); const ahead = P.x + 0.75;
        let floor = false, wall = false, drop = false;
        for (const s of list) { if (s.off) continue; if (ahead > s.x0 && ahead < s.x1 && s.y1 <= P.y + 0.01 && s.y1 > P.y - 0.6) floor = true; if (ahead + 0.4 > s.x0 && ahead < s.x1 && s.y1 <= P.y - 0.6 && s.y1 > P.y - 7) drop = true; if (s.x0 > P.x && s.x0 < P.x + 1.3 && s.y1 > P.y + 0.1 && s.y0 < P.y + PHYS.ph) wall = true; }
        let enemy = enemies.some((e) => !e.dead && e.x > P.x && e.x - P.x < 3.2 && Math.abs(e.y - P.y) < 1);
        const want = ((!floor && !drop) || wall || enemy || (ext.botWantJump && ext.botWantJump()));
        if (want) pending = rr() * jitter;
      }
      if (ext.botAction) out.a = ext.botAction();
      return out;
    };
  }

  $('#loader').classList.add('gone');
  window.__booted = true;
  requestAnimationFrame(frame);
  return api;
}

// ---------- helpers ----------
export function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeSign(ctx, text) {
  const { THREE } = ctx; const c = document.createElement('canvas'); c.width = 512; c.height = 192; const g = c.getContext('2d');
  g.fillStyle = '#fff6e0'; roundRect(g, 8, 8, 496, 176, 30); g.fill(); g.lineWidth = 10; g.strokeStyle = '#7a4f2a'; g.stroke();
  g.fillStyle = '#4a2f18'; g.font = '700 46px system-ui, -apple-system, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = text.split('\n'); lines.forEach((l, i) => g.fillText(l, 256, 96 + (i - (lines.length - 1) / 2) * 54));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const grp = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.27), new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false })); board.position.y = 2.1; grp.add(board);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2, 6), ctx.mat(0x7a4f2a)); post.position.y = 0.9; grp.add(post);
  return grp;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function makeAudio(music, save) {
  let ac = null, master, mus, sfx, started = false, nextT = 0, step = 0, timer = null;
  const A = {
    unlock() {
      if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; ac = new C(); master = ac.createGain(); master.connect(ac.destination); mus = ac.createGain(); sfx = ac.createGain(); mus.connect(master); sfx.connect(master); A.apply();
        const b = ac.createBuffer(1, 1, 22050); const s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); }
      if (ac.state === 'suspended') ac.resume();
      if (!started) { started = true; nextT = ac.currentTime + 0.1; timer = setInterval(sched, 100); }
    },
    apply() { if (!ac) return; mus.gain.setTargetAtTime(save.music * 0.5, ac.currentTime, 0.05); sfx.gain.setTargetAtTime(save.sfx * 0.7, ac.currentTime, 0.02); if (save.music === 0) mus.gain.value = 0; if (save.sfx === 0) sfx.gain.value = 0; },
    swell: 0,
    sfx(name, n = 0) {
      if (!ac || save.sfx === 0) return; const t = ac.currentTime;
      const tone = (f, f2, d, type = 'sine', v = 0.3, delay = 0) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t + delay); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + delay + d); g.gain.setValueAtTime(0.0001, t + delay); g.gain.exponentialRampToValueAtTime(v, t + delay + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + d); o.connect(g); g.connect(sfx); o.start(t + delay); o.stop(t + delay + d + 0.05); };
      const noise = (d, v, fc) => { const b = ac.createBuffer(1, ac.sampleRate * d, ac.sampleRate); const ch = b.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length); const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fc; const g = ac.createGain(); g.gain.value = v; s.connect(f); f.connect(g); g.connect(sfx); s.start(t); };
      const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
      if (name === 'jump') tone(320, 640, 0.14, 'triangle', 0.18);
      else if (name === 'land') noise(0.12, 0.25, 700);
      else if (name === 'coin') { const f = 880 * Math.pow(2, scale[n % scale.length] / 12); tone(f, 0, 0.25, 'sine', 0.22); tone(f * 1.5, 0, 0.35, 'sine', 0.12, 0.06); }
      else if (name === 'spring') tone(200, 900, 0.3, 'square', 0.08);
      else if (name === 'stomp') { noise(0.15, 0.4, 1200); tone(500, 150, 0.18, 'triangle', 0.2); }
      else if (name === 'hurt') tone(400, 90, 0.5, 'sawtooth', 0.12);
      else if (name === 'check') [0, 4, 7, 12].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0, 0.4, 'triangle', 0.15, i * 0.08));
      else if (name === 'win') [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0, 0.8, 'triangle', 0.15, i * 0.11));
      else if (name === 'rumble') { noise(2.5, 0.6, 180); tone(55, 40, 2.5, 'sine', 0.3); }
      else if (name === 'flare') { tone(600, 1400, 0.4, 'sine', 0.15); tone(900, 2000, 0.6, 'sine', 0.08, 0.05); }
      else if (name === 'chime') [0, 7, 12].forEach((s, i) => tone(784 * Math.pow(2, s / 12), 0, 1.2, 'sine', 0.12, i * 0.15));
      else if (name === 'tick') tone(1200, 0, 0.05, 'square', 0.04);
    },
  };
  function sched() {
    if (!ac) return;
    while (nextT < ac.currentTime + 0.3) {
      if (save.music > 0) music(ac, mus, nextT, step, A.swell);
      nextT += music.stepLen; step++;
    }
  }
  return A;
}

function setupTouch(input, hasAct) {
  const pad = document.getElementById('pad'), jb = document.getElementById('btnJump'), ab = document.getElementById('btnAct');
  const moves = new Map();
  const upd = () => { let l = false, r = false; for (const d of moves.values()) { if (d < 0) l = true; if (d > 0) r = true; } input.tl = l; input.tr = r; pad.dataset.dir = l ? 'l' : r ? 'r' : ''; };
  const dirOf = (e) => { const rc = pad.getBoundingClientRect(); const dx = e.clientX - (rc.left + rc.width / 2); return Math.abs(dx) < rc.width * 0.08 ? 0 : Math.sign(dx); };
  pad.addEventListener('pointerdown', (e) => { try { pad.setPointerCapture(e.pointerId); } catch (_) {} moves.set(e.pointerId, dirOf(e)); upd(); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (moves.has(e.pointerId)) { moves.set(e.pointerId, dirOf(e)); upd(); } });
  const end = (e) => { moves.delete(e.pointerId); upd(); };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); pad.addEventListener('lostpointercapture', end);
  const btn = (el, k) => { if (!el) return; const ids = new Set(); el.addEventListener('pointerdown', (e) => { try { el.setPointerCapture(e.pointerId); } catch (_) {} ids.add(e.pointerId); input[k] = true; el.classList.add('on'); e.preventDefault(); }); const up = (e) => { ids.delete(e.pointerId); if (!ids.size) { input[k] = false; el.classList.remove('on'); } }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up); };
  btn(jb, 'tj'); btn(ab, 'ta');
  if (!hasAct && ab) ab.remove();
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
}

function setupUI(cfg, save, persist, audio, onBright) {
  const ui = { paused: false };
  const q = (s) => document.querySelector(s);
  const show = (el, on) => el.classList.toggle('show', on);
  const fmt = (t) => { t = t || 0; const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); };
  ui.count = (n, tot) => { const el = q('#count'); el.textContent = n + ' / ' + tot; el.parentElement.classList.remove('pulse'); void el.offsetWidth; el.parentElement.classList.add('pulse'); };
  let tt; ui.toast = (t, d = 2) => { const el = q('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), d * 1000); };
  let st; ui.story = (t, d = 4.5) => { const el = q('#story'); el.innerHTML = t; el.classList.add('show'); clearTimeout(st); st = setTimeout(() => el.classList.remove('show'), d * 1000); };
  ui.setBackend = (b) => { q('#backend').textContent = b; };
  // sliders
  for (const k of ['music', 'sfx', 'bright']) {
    const el = q('#s-' + k); if (!el) continue; el.value = save[k]; const out = q('#v-' + k);
    const set = () => { save[k] = parseFloat(el.value); out.textContent = k === 'bright' ? Math.round(save[k] * 100) + '%' : (save[k] === 0 ? 'Off' : Math.round(save[k] * 100) + '%'); if (k === 'bright') onBright(); else audio.apply(); persist(); };
    el.addEventListener('input', set); set();
  }
  ui.pause = (on) => { ui.paused = on; show(q('#pause'), on); if (on) ui.fillStats('#statsInPause'); };
  ui.fillStats = (sel) => { const s = ui.getStats(); const sv = s.save; q(sel).innerHTML = `
    <div><b>${s.G.got}/${s.total}</b><span>${cfg.coinName} this run</span></div>
    <div><b>${fmt(s.G.runTime)}</b><span>This run</span></div>
    <div><b>${sv.best ? fmt(sv.best) : '—'}</b><span>Best time</span></div>
    <div><b>${sv.collected.length}/${s.total}</b><span>Ever found</span></div>
    <div><b>${sv.wins}</b><span>Completions</span></div>
    <div><b>${sv.jumps}</b><span>Total jumps</span></div>
    <div><b>${sv.deaths}</b><span>Total tumbles</span></div>
    <div><b>${fmt(sv.playTime)}</b><span>Play time</span></div>`; };
  q('#btnPause').addEventListener('click', () => { if (!q('#title').classList.contains('show')) ui.pause(!ui.paused); });
  q('#btnResume').addEventListener('click', () => ui.pause(false));
  q('#btnRestart').addEventListener('click', () => ui.onRestart());
  q('#btnStats').addEventListener('click', () => { ui.fillStats('#statsBig'); show(q('#statsPanel'), true); });
  q('#btnStatsClose').addEventListener('click', () => show(q('#statsPanel'), false));
  q('#btnStart').addEventListener('click', () => { audio.unlock(); show(q('#title'), false); document.body.classList.add('playing'); ui.onStart(); });
  q('#btnAgain').addEventListener('click', () => ui.onRestart());
  ui.showEnd = (r) => { q('#endStats').innerHTML = `<div><b>${r.got}/${r.total}</b><span>${cfg.coinName}</span></div><div><b>${fmt(r.time)}</b><span>Time</span></div><div><b>${fmt(r.best)}</b><span>Best</span></div><div><b>${r.deaths}</b><span>Tumbles</span></div>`; show(q('#end'), true); document.body.classList.remove('playing'); };
  return ui;
}
