// ===== Lumina Drift core: level, physics, progression (pure, testable) =====
(function (root) {
'use strict';
var C = {
  DT: 1 / 120, G: 2300, FALL_MAX: 950, RUN: 265, ACC_G: 3200, ACC_A: 2000, DEC_G: 3600, DEC_A: 1000,
  JUMP_V: 720, DJUMP_V: 650, LOW_JUMP_MULT: 2.0, APEX_MULT: 0.6, COYOTE: 0.1, BUFFER: 0.13,
  DASH_V: 600, DASH_T: 0.16, DASH_CD: 0.28, WALL_SLIDE: 115, WALLJ_VX: 330, WALLJ_VY: 690, WALL_LOCK: 0.13,
  GLIDE_FALL: 80, PW: 18, PH: 22, DEATH_Y: 1700
};
var ABILITIES = [
  { id: 'double', at: 4, name: 'Double Jump', hint: 'Press Jump again in mid-air' },
  { id: 'dash', at: 10, name: 'Dash', hint: 'Tap Dash to burst forward, even in the air' },
  { id: 'wall', at: 18, name: 'Wall Leap', hint: 'Cling to glowing moss walls and jump off them' },
  { id: 'glide', at: 26, name: 'Glide', hint: 'Hold Jump while falling to drift on the wind' }
];
var BIOMES = [
  { id: 'forest', name: 'Lanternwood', x0: -400, x1: 2600 },
  { id: 'caves', name: 'Crystal Hollows', x0: 2600, x1: 5100 },
  { id: 'storm', name: 'Stormbreak Edge', x0: 5100, x1: 7750 },
  { id: 'aurora', name: 'Aurora Steppe', x0: 7750, x1: 11200 }
];
function biomeAt(x) { for (var i = 0; i < BIOMES.length; i++) if (x < BIOMES[i].x1) return i; return BIOMES.length - 1; }

function buildLevel() {
  var L = { solids: [], echoes: [], winds: [], runes: [], lore: [], checkpoints: [], falls: [], gates: [], start: { x: 120, y: 878 } };
  function P(x, y, w, h, type, o) { var s = { id: L.solids.length, x: x, y: y, w: w, h: h || 40, type: type || 'g' }; if (o) for (var k in o) s[k] = o[k]; L.solids.push(s); return s; }
  function E(x, y, o) { var e = { id: L.echoes.length, x: x, y: y, r: 14 }; if (o) for (var k in o) e[k] = o[k]; L.echoes.push(e); return e; }
  function W(x, y, w, h, fx, fy) { L.winds.push({ x: x, y: y, w: w, h: h, fx: fx, fy: fy }); }
  function R(x, y, g) { L.runes.push({ id: L.runes.length, x: x, y: y, group: g }); }
  function T(x, y, text) { L.lore.push({ x: x, y: y, text: text }); }
  function K(x, y) { L.checkpoints.push({ id: L.checkpoints.length, x: x, y: y }); }
  // gate signs: where an ability is needed, a hint stone tells you which one (and how many Echoes to go)
  function G(x, y, need, text, o) { var g = { id: L.gates.length, x: x, y: y, need: need, text: text }; if (o) for (var k in o) g[k] = o[k]; L.gates.push(g); return g; }
  // assist ledge: appears only after the player has struggled at a gate (with the needed ability) for a while
  function A(gate, x, y, w, h) { return P(x, y, w, h || 26, 'help', { gate: gate }); }
  function F(x, y, len) { L.falls.push({ x: x, y: y, len: len }); }
  P(-60, -400, 60, 2200, 'x'); // world left boundary (invisible)
  // ---------- Lanternwood (floating forest) ----------
  P(0, 900, 540, 60); K(120, 900); T(260, 900, 'Once, the night sky was whole.');
  E(330, 862); E(110, 730);
  P(620, 860, 200, 40, 'g', { tree: 1 }); E(720, 755); F(805, 880, 260);
  P(900, 820, 170);
  P(1140, 780, 290, 50, 'g', { tree: 1 }); E(1290, 690);
  P(1150, 640, 180, 34); E(1240, 600); // high branch lowered 40px: comfortable double jump
  P(1430, 515, 170, 34); E(1515, 470); T(1500, 515, 'Each Echo is a star that remembers.');
  P(1680, 440, 210, 36, 'rise', { trig: 'e:7' }); E(1785, 395);
  P(1490, 900, 210); E(1590, 862); F(1690, 920, 300);
  P(1760, 845, 140, 34); E(1830, 805);
  P(1960, 785, 220, 44, 'g', { tree: 1 }); E(2070, 745); K(2000, 785);
  P(2240, 720, 200); E(2340, 545);
  P(2500, 590, 150, 34); E(2575, 545);
  P(2140, 1040, 170, 30); E(2225, 1000); // low secret ledge (walk off to escape)
  // ---------- Crystal Hollows ----------
  P(2660, 740, 320, 50); K(2720, 740); E(2830, 700); T(2900, 740, 'The crystals hum when light passes.');
  P(3050, 790, 170, 40, 'g', { cry: 1 }); E(3135, 640);
  P(3290, 740, 130, 24, 'c'); E(3355, 600);
  P(3500, 700, 220, 40, 'g', { cry: 1 }); R(3560, 700, 0);
  P(3520, 950, 300, 40); R(3700, 950, 0); E(3600, 905);
  P(3880, 865, 120, 30); P(4040, 775, 150, 40, 'g', { cry: 1 }); E(4115, 735);
  P(4280, 700, 200); R(4380, 700, 0); K(4300, 700);
  P(3760, 560, 140, 26, 'rise', { trig: 'r:0', cry: 1 }); P(3900, 450, 150, 26, 'rise', { trig: 'r:0', cry: 1 }); E(3975, 405); E(3975, 300);
  P(4600, 420, 660, 305, 'g', { cry: 1, tunnel: 1 }); // underside at y725: 45px headroom // low crystal arch: only a Dash carries you under it (flat, lit underside so the tunnel reads)
  P(4580, 770, 350, 40, 'g', { cry: 1 }); // tunnel floor: 140px gap. Hop (up to ~80ms early) then Dash 50-175ms later always clears it; on foot it never does (swept in unit test)
  W(4930, 771, 140, 700, 0, 600000); L.winds[L.winds.length - 1].down = 1; // crystal downdraft in the tunnel gap: once you drop below the floor line you can't double-jump back up
  G(4610, 770, 'dash', 'Hop, then Dash under the low crystal ceiling', { gx1: 4930 }); A(0, 4940, 770, 60); E(4535, 625);
  E(4900, 900); // risky: over the void
  P(3300, 1080, 160, 30, 'g', { cry: 1 }); E(3380, 1040); // crystal pocket below
  // ---------- Stormbreak Edge ----------
  P(5070, 770, 370, 50); K(5320, 770); E(5380, 730); T(5250, 770, 'Here the wind still argues with the sky.');
  P(5500, 650, 170, 40); E(5585, 520);
  G(5530, 650, 'wall', 'Leap up between the glowing moss walls', { gx0: 5480, gx1: 5720, gy0: 380 }); A(1, 5590, 530, 70); A(1, 5640, 410, 60);
  P(5720, 300, 40, 480, 'w'); P(5900, 300, 40, 480, 'w'); P(5760, 740, 140, 40);
  E(5830, 540); E(5830, 360);
  P(5940, 300, 220, 40); E(6050, 255); K(6000, 300);
  P(6250, 360, 100, 22, 'c'); P(6430, 400, 100, 22, 'c'); P(6610, 360, 100, 22, 'c');
  W(6200, 0, 560, 900, -650, 0); E(6480, 300);
  E(6470, 640); // risky low in the gale
  P(6800, 420, 240, 44); E(6900, 380);
  G(6830, 420, 'wall', 'Climb the moss chimney with Wall Leap', { gx0: 6780, gx1: 7040, gy0: 180 }); A(2, 6900, 310, 70); A(2, 6960, 200, 60);
  P(7040, 120, 40, 300, 'w'); P(7220, 120, 40, 330, 'w'); P(7080, 420, 140, 40);
  E(7150, 330); E(7150, 170);
  P(7260, 120, 200, 40); E(7360, 80);
  P(7520, 340, 200, 44); E(7620, 290, { heart: 1 }); K(7560, 340);
  // ---------- Aurora Steppe ----------
  P(7800, 420, 920, 120, 'rise', { trig: 'e:big', big: 1 });
  E(8000, 380); E(8420, 250); T(8300, 420, 'The sky is almost ready to remember.'); K(8100, 420);
  P(8380, 330, 90, 24, 'rise', { trig: 'e:big' });
  W(8820, -200, 420, 1500, 0, -3400); G(8660, 420, 'glide', 'Hold Jump to glide up the rising wind', { noAssist: 1 }); E(9020, 250);
  P(9340, 560, 220); E(9450, 520); K(9380, 560);
  P(9640, 470, 200, 40, 'c'); E(9740, 430);
  P(9920, 380, 300); E(10070, 340); E(10070, 170);
  P(10300, 300, 120, 30, 'w', { wallTop: 1 });
  P(10420, 290, 460, 60); E(10520, 250); E(10780, 120); T(10650, 290, 'Remember, and the sky remembers you.'); K(10460, 290);
  W(10900, -200, 300, 1500, 0, -3000);
  P(11050, 520, 160, 30); E(11130, 480);
  P(9480, 900, 200, 30); E(9580, 860); // drift-down secret
  return L;
}

// resolve echo triggers by index after build
function prepLevel(L) {
  var heart = L.echoes.filter(function (e) { return e.heart; })[0];
  L.solids.forEach(function (s) { if (s.trig === 'e:big') s.trig = 'e:' + heart.id; });
  L.total = L.echoes.length;
  L.endAt = Math.ceil(L.total * 0.85);
  return L;
}

function newProgress() { return { got: {}, count: 0, runes: {}, cp: 0, ended: false, seenUnlock: {} }; }
function hasAbility(prog, id) { for (var i = 0; i < ABILITIES.length; i++) if (ABILITIES[i].id === id) return prog.count >= ABILITIES[i].at; return false; }
function abilitiesFor(count) { var a = {}; ABILITIES.forEach(function (x) { a[x.id] = count >= x.at; }); return a; }
function runeGroupLit(L, prog, g) { var all = L.runes.filter(function (r) { return r.group === g; }); return all.length > 0 && all.every(function (r) { return prog.runes[r.id]; }); }
function solidActive(L, prog, s) {
  if (s.type === 'rise') {
    var t = s.trig.split(':');
    if (t[0] === 'e') return !!prog.got[+t[1]];
    if (t[0] === 'r') return runeGroupLit(L, prog, +t[1]);
  }
  if (s.type === 'c' && s.fallen) return false;
  if (s.type === 'help') return !!(prog.assist && prog.assist[s.gate]);
  return true;
}

function Grid(solids, cell) {
  this.cell = cell || 256; this.map = {};
  for (var i = 0; i < solids.length; i++) {
    var s = solids[i];
    for (var gx = Math.floor(s.x / this.cell); gx <= Math.floor((s.x + s.w) / this.cell); gx++)
      for (var gy = Math.floor(s.y / this.cell); gy <= Math.floor((s.y + s.h) / this.cell); gy++) {
        var k = gx + ',' + gy; (this.map[k] || (this.map[k] = [])).push(s);
      }
  }
}
Grid.prototype.query = function (x, y, w, h, out) {
  out.length = 0; var c = this.cell, seen = Grid._seen = (Grid._seen || 0) + 1;
  for (var gx = Math.floor(x / c); gx <= Math.floor((x + w) / c); gx++)
    for (var gy = Math.floor(y / c); gy <= Math.floor((y + h) / c); gy++) {
      var a = this.map[gx + ',' + gy]; if (!a) continue;
      for (var i = 0; i < a.length; i++) if (a[i]._q !== seen) { a[i]._q = seen; out.push(a[i]); }
    }
  return out;
};

function newPlayer(x, y) {
  return { x: x, y: y - C.PH, vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0, jumps: 0, dashT: 0, dashCd: 0, canDash: true,
    dashDir: 1, facing: 1, wallDir: 0, sliding: false, wallLock: 0, gliding: false, jumpHeld: false, standing: null, airT: 0 };
}
var _tmp = [];
function overlap(a, s) { return a.x < s.x + s.w && a.x + C.PW > s.x && a.y < s.y + s.h && a.y + C.PH > s.y; }
// in: {x:-1..1, jump: held, jumpP: pressed this step, dashP: pressed}; ab: abilities; env: {grid, active(s), winds}
function step(p, inp, ab, env, ev) {
  var dt = C.DT; ev = ev || [];
  if (inp.jumpP) p.buffer = C.BUFFER;
  p.jumpHeld = !!inp.jump;
  if (inp.x) p.facing = inp.x > 0 ? 1 : -1;
  p.coyote -= dt; p.buffer -= dt; p.dashCd -= dt; p.wallLock -= dt;
  // wall contact probe
  p.wallDir = 0;
  if (ab.wall && !p.onGround) {
    var q = env.grid.query(p.x - 3, p.y + 2, C.PW + 6, C.PH - 4, _tmp);
    for (var i = 0; i < q.length; i++) { var s = q[i]; if (s.type !== 'w' || !env.active(s)) continue;
      if (p.y + C.PH > s.y + 2 && p.y < s.y + s.h) {
        if (Math.abs(p.x - (s.x + s.w)) < 3) p.wallDir = -1; else if (Math.abs(p.x + C.PW - s.x) < 3) p.wallDir = 1; } }
  }
  // dash
  if (inp.dashP && ab.dash && p.canDash && p.dashCd <= 0 && p.dashT <= 0) {
    p.dashT = C.DASH_T; p.dashDir = inp.x ? (inp.x > 0 ? 1 : -1) : p.facing; p.canDash = false; p.dashCd = C.DASH_CD;
    p.vx = p.dashDir * C.DASH_V; p.vy = 0; p.gliding = false; ev.push('dash');
  }
  // wind
  var wx = 0, wy = 0;
  for (var j = 0; j < env.winds.length; j++) { var w = env.winds[j];
    if (p.x + C.PW > w.x && p.x < w.x + w.w && p.y + C.PH > w.y && p.y < w.y + w.h) { wx += w.fx; wy += w.fy; } }
  p.sliding = false;
  if (p.dashT > 0) {
    p.dashT -= dt; p.vy = 0;
    if (p.dashT <= 0) p.vx *= 0.5;
  } else {
    var target = inp.x * C.RUN, acc;
    if (p.onGround) acc = inp.x ? C.ACC_G : C.DEC_G; else acc = inp.x ? C.ACC_A : C.DEC_A;
    if (p.wallLock > 0) acc *= 0.25;
    if (Math.abs(p.vx) > C.RUN && Math.sign(p.vx) === Math.sign(target)) acc = C.DEC_A * 0.5;
    if (p.vx < target) p.vx = Math.min(target, p.vx + acc * dt); else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * dt);
    p.vx += wx * dt * (p.onGround ? 0.35 : 1);
    var g = C.G;
    if (p.vy < 0 && !p.jumpHeld) g *= C.LOW_JUMP_MULT;
    else if (Math.abs(p.vy) < 90 && p.jumpHeld) g *= C.APEX_MULT;
    p.vy += g * dt;
    var glideOk = ab.glide && p.jumpHeld && p.vy > 0 && !p.onGround && p.airT > 0.12;
    p.gliding = false;
    if (p.wallDir && p.vy > 0 && (inp.x === p.wallDir || p.wallDir)) { p.sliding = true; if (p.vy > C.WALL_SLIDE) p.vy = C.WALL_SLIDE; }
    else if (glideOk) { p.gliding = true; p.vy += wy * dt * 0.9; if (p.vy > C.GLIDE_FALL) p.vy = Math.max(C.GLIDE_FALL, p.vy - 2600 * dt); }
    else p.vy += wy * dt * 0.25;
    if (p.vy > C.FALL_MAX) p.vy = C.FALL_MAX;
  }
  // jumps
  if (p.buffer > 0) {
    if (p.onGround || p.coyote > 0) { p.vy = -C.JUMP_V; p.buffer = 0; p.coyote = 0; p.onGround = false; ev.push('jump'); }
    else if (ab.wall && p.wallDir) { p.vy = -C.WALLJ_VY; p.vx = -p.wallDir * C.WALLJ_VX; p.wallLock = C.WALL_LOCK; p.buffer = 0; p.jumps = 0; p.canDash = true; p.dashT = 0; p.facing = -p.wallDir; ev.push('walljump'); }
    else if (ab.double && p.jumps < 1 && p.dashT <= 0) { p.vy = -C.DJUMP_V; p.jumps = 1; p.buffer = 0; ev.push('djump'); }
  }
  // integrate + collide
  var wasGround = p.onGround, fallV = p.vy;
  p.x += p.vx * dt;
  var q2 = env.grid.query(p.x - 2, p.y - 2, C.PW + 4, C.PH + 4, _tmp);
  for (var a = 0; a < q2.length; a++) { var s2 = q2[a]; if (!env.active(s2) || !overlap(p, s2)) continue;
    if (p.vx > 0) p.x = s2.x - C.PW; else if (p.vx < 0) p.x = s2.x + s2.w; else { p.x = (p.x + C.PW / 2 < s2.x + s2.w / 2) ? s2.x - C.PW : s2.x + s2.w; }
    if (p.dashT <= 0) p.vx = 0; }
  p.y += p.vy * dt; p.onGround = false; p.standing = null;
  var q3 = env.grid.query(p.x - 2, p.y - 2, C.PW + 4, C.PH + 4, _tmp);
  for (var b = 0; b < q3.length; b++) { var s3 = q3[b]; if (!env.active(s3) || !overlap(p, s3)) continue;
    if (p.vy >= 0) { p.y = s3.y - C.PH; p.onGround = true; p.standing = s3; }
    else { p.y = s3.y + s3.h; ev.push('bonk'); }
    p.vy = 0; }
  if (!p.onGround) { // ground probe for resting contact
    var q4 = env.grid.query(p.x, p.y + C.PH, C.PW, 1, _tmp);
    for (var c = 0; c < q4.length; c++) { var s4 = q4[c]; if (env.active(s4) && p.x < s4.x + s4.w && p.x + C.PW > s4.x && Math.abs(p.y + C.PH - s4.y) < 0.5 && p.vy >= 0) { p.onGround = true; p.standing = s4; } }
  }
  if (p.onGround) { p.jumps = 0; p.airT = 0; if (p.dashT <= 0) p.canDash = true; if (!wasGround) ev.push('land:' + Math.round(fallV)); }
  else { p.airT += dt; if (wasGround && p.vy >= 0) p.coyote = C.COYOTE; }
  if (p.sliding) { p.canDash = true; }
  return ev;
}

function makeEnv(L, prog, extraActive) {
  var grid = new Grid(L.solids);
  return { grid: grid, winds: L.winds, active: function (s) { return solidActive(L, prog, s) && (!extraActive || extraActive(s)); } };
}

function collect(L, prog, id) {
  if (prog.got[id]) return null;
  prog.got[id] = true; prog.count++;
  var res = { unlocked: null, ending: false };
  ABILITIES.forEach(function (a) { if (prog.count === a.at) res.unlocked = a; });
  if (!prog.ended && prog.count >= L.endAt) { res.ending = true; }
  return res;
}
function serialize(prog) { return JSON.stringify({ v: 1, got: Object.keys(prog.got).map(Number), runes: Object.keys(prog.runes).map(Number), cp: prog.cp, ended: prog.ended, seen: prog.seenUnlock }); }
function deserialize(str) {
  var p = newProgress(); try { var o = JSON.parse(str); if (!o || o.v !== 1) return p;
    (o.got || []).forEach(function (i) { p.got[i] = true; }); p.count = (o.got || []).length;
    (o.runes || []).forEach(function (i) { p.runes[i] = true; }); p.cp = o.cp | 0; p.ended = !!o.ended; p.seenUnlock = o.seen || {}; } catch (e) {}
  return p;
}
function echoHit(p, e) {
  var cx = Math.max(p.x, Math.min(e.x, p.x + C.PW)), cy = Math.max(p.y, Math.min(e.y, p.y + C.PH));
  var dx = e.x - cx, dy = e.y - cy; return dx * dx + dy * dy < (e.r + 4) * (e.r + 4);
}
root.LDCore = { C: C, ABILITIES: ABILITIES, BIOMES: BIOMES, biomeAt: biomeAt, buildLevel: function () { return prepLevel(buildLevel()); }, newProgress: newProgress,
  hasAbility: hasAbility, abilitiesFor: abilitiesFor, solidActive: solidActive, runeGroupLit: runeGroupLit, Grid: Grid, newPlayer: newPlayer,
  step: step, makeEnv: makeEnv, collect: collect, serialize: serialize, deserialize: deserialize, echoHit: echoHit };
})(typeof window !== 'undefined' ? window : globalThis);
