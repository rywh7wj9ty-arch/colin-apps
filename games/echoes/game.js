/* ECHOES — a time-loop co-op puzzle game where you cooperate with yourself.
 * Single-file game: deterministic simulation core (shared with verify.js under Node)
 * followed by the browser layer (rendering, audio, input, menus).
 */
(function () {
'use strict';

// ======================================================================
//  SIMULATION CORE (deterministic, integer-only, fixed 60 Hz timestep)
// ======================================================================
const TPS = 60;            // simulation ticks per second
const MOVE = 8;            // ticks to cross one tile
const DX = [0, 0, 1, 0, -1];
const DY = [0, -1, 0, 1, 0]; // 0 none, 1 up, 2 right, 3 down, 4 left
const ACT = 8;             // input bit: drop / toss key

const T_FLOOR = 0, T_WALL = 1, T_FENCE = 2, T_PLATE = 3, T_DOOR = 4, T_GATE = 5,
      T_EMIT = 6, T_LOCK = 7, T_EXIT = 8, T_SPAWN = 9;

/* Legend
 *  #  wall            .  floor          P  start (time anchor)    @  exit portal
 *  a-f pressure plate (channel)         A-F door, open while ALL plates of its channel are held
 *  1-4 timed gate (schedule in `gates`) > < ^ v  laser emitter (fires in that direction)
 *  o  crate           k  key            L  lock (walk into it holding a key)
 *  =  fence: blocks walking, but keys can be tossed over it
 *
 * Each level carries a `solution`: one script per loop (the last one is the live run).
 * Script tokens: U D L R = step (held until it succeeds), u d l r = tap one tick (turn to face),
 * E = drop/toss key, wN = idle N ticks, X = rewind now. verify.js replays these through
 * this exact simulation and checks every level is won with at most `par` echoes.
 */
const LEVELS = [
  { name: 'First Steps', loop: 10, par: 0,
    intro: 'Reach the glowing portal. Move with the arrow keys or WASD.',
    hint: 'Go down the left side, then wind up into the alcove on the right.',
    map: [
      '###############',
      '#.....#.......#',
      '#.P...#.......#',
      '#.....#..###..#',
      '#..####..#@#..#',
      '#........#.#..#',
      '#.....####.#..#',
      '#.....#....#..#',
      '#.....#.####..#',
      '#.............#',
      '###############'],
    solution: ['DDDDDDDRRRRRUURRRUUU'] },

  { name: 'Pressure', loop: 10, par: 1,
    intro: 'Plates hold doors open. Stand on one and press R: your echo will keep standing there.',
    hint: 'Walk onto the plate and press R. Next loop, your echo holds the door for you.',
    map: [
      '###############',
      '#.....#.......#',
      '#..a..#.......#',
      '#.....#.......#',
      '#.............#',
      '#..P......#####',
      '#.........A..@#',
      '#.........#####',
      '#.............#',
      '#.............#',
      '###############'],
    solution: ['UUUX', 'RRRRRRDRRRR'] },

  { name: 'Relay', loop: 10, par: 2,
    intro: 'Echoes stack. Never touch one of your past selves: that is a PARADOX.',
    hint: 'Echo 1 holds the first plate. Echo 2 walks through and holds the second.',
    map: [
      '###############',
      '#......#......#',
      '#.a....#..b...#',
      '#......#......#',
      '#......A......#',
      '#..P...#......#',
      '#......####B###',
      '#......#......#',
      '#......#...@..#',
      '#......#......#',
      '###############'],
    solution: ['UUULX', 'RRRURRRRUUX', 'w10 RRRURRRRRDDDD'] },

  { name: 'Together', loop: 10, par: 2,
    intro: 'This door needs both of its plates held at the same moment.',
    hint: 'One echo per plate. Take different routes so you never bump into yourself.',
    map: [
      '###############',
      '#.............#',
      '#..a.......a..#',
      '#.............#',
      '#.............#',
      '#......P......#',
      '#.............#',
      '#######A#######',
      '#.............#',
      '#......@......#',
      '###############'],
    solution: ['UUULLLLX', 'RRRRUUUX', 'DDDD'] },

  { name: 'Clockwork', loop: 8, par: 0,
    intro: 'Timed gates follow the loop clock. Every loop, the same rhythm.',
    hint: 'Wait beside a gate until it opens. The pattern never changes.',
    gates: { 1: { period: 96, open: 32, offset: 0 }, 2: { period: 96, open: 32, offset: 48 } },
    map: [
      '###############',
      '#.............#',
      '#.P...........#',
      '#.............#',
      '#####1#####2###',
      '#.............#',
      '#.............#',
      '###2#####1#####',
      '#.............#',
      '#...........@.#',
      '###############'],
    solution: ['RRRDDDDLLDDDRRRRRRRRR'] },

  { name: 'Window', loop: 8, par: 1,
    intro: 'Some gates open only once per loop. An echo can stay trapped behind one. That is fine.',
    hint: 'Rush through the gate onto the plate, then rewind. Let your echo be the one locked in.',
    gates: { 1: { period: 100000, open: 48, offset: 0 } },
    map: [
      '###############',
      '#.....#.......#',
      '#..a..1...P...#',
      '#.....#.......#',
      '#######.......#',
      '#.............#',
      '#.............#',
      '#####A#########',
      '#.............#',
      '#..........@..#',
      '###############'],
    solution: ['LLLLLLLX', 'DDDDLLLLLDDDRRRRRR'] },

  { name: 'Lightwork', loop: 10, par: 1,
    intro: 'Lasers end your loop. But the echo you leave behind absorbs the beam.',
    hint: 'Walk into the beam on purpose. Next loop, cross in your echo\'s shadow.',
    map: [
      '###############',
      '#.............#',
      '#......P......#',
      '#.............#',
      '#.............#',
      '>.............#',
      '#.............#',
      '#####.....#####',
      '#.............#',
      '#......@......#',
      '###############'],
    solution: ['DDD', 'RDDDDDDDL'] },

  { name: 'Crossfire', loop: 10, par: 2,
    intro: 'Where you fall matters.',
    hint: 'Fall on the plate: one echo can block a beam and hold a door at the same time.',
    map: [
      '##########v####',
      '#......#......#',
      '#..P...#......#',
      '#......#......#',
      '#......#......#',
      '>...a..A......#',
      '#......#......#',
      '#......#......#',
      '#......#...@..#',
      '#......#......#',
      '###############'],
    solution: ['DDRD', 'RRRDDDRRRR', 'w12 RRRDDDRRRDRRDD'] },

  { name: 'Heavy Things', loop: 10, par: 0,
    intro: 'Walk into a crate to push it. Crates press plates and block lasers.',
    hint: 'Line up to the left of the crate and push it all the way onto the plate.',
    map: [
      '###############',
      '#.............#',
      '#..P..........#',
      '#.............#',
      '#.....o...a...#',
      '#.............#',
      '#.............#',
      '#######A#######',
      '#.............#',
      '#......@......#',
      '###############'],
    solution: ['DDRRRRRRDDLLDDD'] },

  { name: 'Shield', loop: 10, par: 1,
    intro: 'A crate in a beam casts a shadow you can walk through.',
    hint: 'Let an echo hold the far plate, then push the crate down into the beam.',
    map: [
      '###############',
      '#.............#',
      '#..........a..#',
      '#..P..........#',
      '#....o........#',
      '#.............#',
      '#.............<',
      '###A###########',
      '#.............#',
      '#..@..........#',
      '###############'],
    solution: ['URRRRRRRRX', 'RRDDLDLDDD'] },

  { name: 'Skeleton Key', loop: 10, par: 0,
    intro: 'Keys open locks. Press E or Space to drop a key, or toss it over a fence.',
    hint: 'Pick up the key, then walk straight into the lock.',
    map: [
      '###############',
      '#.............#',
      '#..P......k...#',
      '#.............#',
      '#.............#',
      '#######L#######',
      '#.............#',
      '#.............#',
      '#......@......#',
      '#.............#',
      '###############'],
    solution: ['RRRRRRRDDLLLDDDD'] },

  { name: 'Over the Fence', loop: 7, par: 1,
    intro: 'Face a fence and press E to toss a key over it. Your past self can throw it to you.',
    hint: 'Slip through the gate before it shuts, grab the key, toss it over. Next loop, catch it.',
    gates: { 1: { period: 100000, open: 100, offset: 0 } },
    map: [
      '###############',
      '#.....=.......#',
      '#..k..=...P...#',
      '#.....=.......#',
      '###1###.......#',
      '#.............#',
      '#.............#',
      '#########L#####',
      '#.............#',
      '#.........@...#',
      '###############'],
    solution: ['DDDLLLLLLLUUURREX', 'LLw120LDDDDRRDDDR'] },

  { name: 'Choreography', loop: 7, par: 4,
    intro: 'Four echoes, three doors, one narrow hallway.',
    hint: 'Two echoes on the top plates. One holds the pink plate. One slips through to the gold plate.',
    map: [
      '###############',
      '#a...........a#',
      '#.............#',
      '#......P......#',
      '#.............#',
      '###A###########',
      '#b....#.......#',
      '#.....B....c..#',
      '###C###.......#',
      '#..@..#.......#',
      '###############'],
    solution: ['UULLLLLLX', 'RRRRRRUUX', 'DLLLLDDLLX',
               'w16 DLLLw9LDDDRRRRRRRRX', 'w32 DLLw2LLDDDDD'] },

  { name: 'Echo Chamber', loop: 6, par: 5,
    intro: 'Everything you have learned. Every self you have been.',
    hint: 'Two plates, one fall in each beam, and a thrower sealed in the gated room.',
    gates: { 1: { period: 100000, open: 60, offset: 90 } },
    map: [
      '###############',
      '#a.....P.....a#',
      '#.............#',
      '#######A#######',
      '#.............#',
      '>.............#',
      '#.............#',
      '####L###=###1##',
      '#.....#.k.....#',
      '#.@...#.......#',
      '#########^#####'],
    solution: ['LLLLLLX', 'RRRRRRX', 'DDDLD',
               'w42 DDDRRRRRDDDDDLLL', 'w58 DDDRRRRRDDDDLLLLuEX', 'w66 DDDDDw84RLLLLDDLLD'] },
];

function parseLevel(def, index) {
  const h = def.map.length, w = def.map[0].length;
  const L = {
    def, index, w, h, name: def.name, par: def.par,
    loopTicks: Math.round(def.loop * TPS),
    maxEchoes: Math.max(3, def.par + 3),
    tile: new Uint8Array(w * h), ch: new Int8Array(w * h).fill(-1),
    plates: [], doors: [], gates: [], emitters: [], crates: [], keys: [], locks: [],
    start: null, exit: null, gateCfg: {}, chanCount: [0, 0, 0, 0, 0, 0],
    doorIdx: new Int16Array(w * h).fill(-1), gateIdx: new Int16Array(w * h).fill(-1),
    lockIdx: new Int16Array(w * h).fill(-1), plateIdx: new Int16Array(w * h).fill(-1),
  };
  for (let y = 0; y < h; y++) {
    if (def.map[y].length !== w) throw new Error(def.name + ': row ' + y + ' has wrong width');
    for (let x = 0; x < w; x++) {
      const c = def.map[y][x], i = y * w + x;
      let t = T_FLOOR;
      if (c === '#') t = T_WALL;
      else if (c === '.') t = T_FLOOR;
      else if (c === 'P') { t = T_SPAWN; L.start = { x, y }; }
      else if (c === '@') { t = T_EXIT; L.exit = { x, y }; }
      else if (c === '=') t = T_FENCE;
      else if (c >= 'a' && c <= 'f') { t = T_PLATE; L.ch[i] = c.charCodeAt(0) - 97; L.plateIdx[i] = L.plates.length; L.plates.push({ x, y, ch: L.ch[i] }); L.chanCount[L.ch[i]]++; }
      else if (c >= 'A' && c <= 'F') { t = T_DOOR; L.ch[i] = c.charCodeAt(0) - 65; L.doorIdx[i] = L.doors.length; L.doors.push({ x, y, ch: L.ch[i] }); }
      else if (c >= '1' && c <= '4') { t = T_GATE; L.ch[i] = +c; L.gateIdx[i] = L.gates.length; L.gates.push({ x, y, g: +c }); }
      else if (c === '>' || c === '<' || c === '^' || c === 'v') { t = T_EMIT; L.emitters.push({ x, y, dir: { '^': 1, '>': 2, 'v': 3, '<': 4 }[c] }); }
      else if (c === 'o') { t = T_FLOOR; L.crates.push({ x, y }); }
      else if (c === 'k') { t = T_FLOOR; L.keys.push({ x, y }); }
      else if (c === 'L') { t = T_LOCK; L.lockIdx[i] = L.locks.length; L.locks.push({ x, y }); }
      else throw new Error(def.name + ': unknown tile ' + c);
      L.tile[i] = t;
    }
  }
  if (!L.start || !L.exit) throw new Error(def.name + ': needs start and exit');
  const gc = def.gates || {};
  for (const g of L.gates) {
    const cfg = gc[g.g];
    if (!cfg) throw new Error(def.name + ': gate ' + g.g + ' has no schedule');
    L.gateCfg[g.g] = cfg;
  }
  return L;
}

function gateScheduled(cfg, t) {
  const p = cfg.period;
  return (((t - cfg.offset) % p) + p) % p < cfg.open;
}

function newAgent(L, echo, id) {
  return { x: L.start.x, y: L.start.y, fx: L.start.x, fy: L.start.y, mv: 0, face: 3,
           hold: -1, ev: 0, echo, id, frozen: false };
}

function createWorld(L, echoes) {
  const W = {
    L, t: 0, echoes, agents: [],
    crates: L.crates.map(c => ({ x: c.x, y: c.y, fx: c.x, fy: c.y, mv: 0 })),
    keys: L.keys.map(k => ({ x: k.x, y: k.y, holder: -1, fx: k.x, fy: k.y, tossT: -99, gone: false })),
    lockOpen: new Uint8Array(L.locks.length),
    doorOpen: new Uint8Array(L.doors.length),
    gateOpen: new Uint8Array(L.gates.length),
    platePressed: new Uint8Array(L.plates.length),
    beams: [], events: [], zapped: false,
    rec: { inputs: [], sigs: [], evs: [], frames: [] },
  };
  for (let i = 0; i < echoes.length; i++) W.agents.push(newAgent(L, true, i));
  W.live = newAgent(L, false, echoes.length);
  W.agents.push(W.live);
  updateEnv(W, true);
  return W;
}

function inB(L, x, y) { return x >= 0 && y >= 0 && x < L.w && y < L.h; }
function agentAt(W, x, y) {
  for (const a of W.agents) if (a.x === x && a.y === y) return a;
  return null;
}
function crateAt(W, x, y) {
  for (let i = 0; i < W.crates.length; i++) { const c = W.crates[i]; if (c.x === x && c.y === y) return i; }
  return -1;
}
function keyAt(W, x, y) {
  for (let i = 0; i < W.keys.length; i++) { const k = W.keys[i]; if (!k.gone && k.holder < 0 && k.x === x && k.y === y) return i; }
  return -1;
}
function tileOpen(W, i) {
  const L = W.L, t = L.tile[i];
  if (t === T_FLOOR || t === T_SPAWN || t === T_EXIT || t === T_PLATE) return true;
  if (t === T_DOOR) return !!W.doorOpen[L.doorIdx[i]];
  if (t === T_GATE) return !!W.gateOpen[L.gateIdx[i]];
  if (t === T_LOCK) return !!W.lockOpen[L.lockIdx[i]];
  return false;
}
function crateCanEnter(W, x, y) {
  const L = W.L;
  if (!inB(L, x, y)) return false;
  const i = y * L.w + x;
  if (L.tile[i] === T_EXIT || !tileOpen(W, i)) return false;
  return crateAt(W, x, y) < 0 && !agentAt(W, x, y) && keyAt(W, x, y) < 0;
}
function droppable(W, x, y) {
  const L = W.L;
  if (!inB(L, x, y)) return false;
  const i = y * L.w + x, t = L.tile[i];
  if (!(t === T_FLOOR || t === T_SPAWN || t === T_PLATE || (t === T_LOCK && W.lockOpen[L.lockIdx[i]]))) return false;
  return crateAt(W, x, y) < 0 && keyAt(W, x, y) < 0 && !agentAt(W, x, y);
}
function evt(W, type, x, y, a) { W.events.push({ type, x, y, a }); }

function tryMove(W, a, d) {
  const L = W.L;
  a.face = d;
  const nx = a.x + DX[d], ny = a.y + DY[d];
  if (!inB(L, nx, ny)) return false;
  const i = ny * L.w + nx, tt = L.tile[i];
  if (tt === T_LOCK && !W.lockOpen[L.lockIdx[i]]) {
    if (a.hold < 0) { return false; }
    W.keys[a.hold].gone = true; W.keys[a.hold].holder = -1; a.hold = -1;
    W.lockOpen[L.lockIdx[i]] = 1;
    a.ev = a.ev * 31 + 4 + 8 * i;
    evt(W, 'unlock', nx, ny, a);
  } else if (!tileOpen(W, i)) return false;
  const ci = crateAt(W, nx, ny);
  if (ci >= 0) {
    const c = W.crates[ci];
    const bx = nx + DX[d], by = ny + DY[d];
    if (c.mv > 0 || !crateCanEnter(W, bx, by)) return false;
    c.fx = c.x; c.fy = c.y; c.x = bx; c.y = by; c.mv = MOVE;
    a.ev = a.ev * 31 + 1 + 8 * (by * L.w + bx);
    evt(W, 'push', bx, by, a);
  }
  a.fx = a.x; a.fy = a.y; a.x = nx; a.y = ny; a.mv = MOVE;
  return true;
}

function doAction(W, a) {
  if (a.hold < 0) return;
  const L = W.L;
  const fx = a.x + DX[a.face], fy = a.y + DY[a.face];
  let tx = -1, ty = -1, tossed = false;
  if (inB(L, fx, fy) && L.tile[fy * L.w + fx] === T_FENCE) {
    const gx = fx + DX[a.face], gy = fy + DY[a.face];
    if (droppable(W, gx, gy)) { tx = gx; ty = gy; tossed = true; }
  } else if (droppable(W, fx, fy)) { tx = fx; ty = fy; }
  if (tx < 0 && keyAt(W, a.x, a.y) < 0) { tx = a.x; ty = a.y; }
  if (tx < 0) return;
  const k = W.keys[a.hold];
  k.holder = -1; k.fx = a.x; k.fy = a.y; k.x = tx; k.y = ty; k.tossT = W.t; k.tossed = tossed;
  a.hold = -1;
  a.ev = a.ev * 31 + 3 + 8 * (ty * L.w + tx);
  evt(W, tossed ? 'toss' : 'drop', tx, ty, a);
}

function updateAgent(W, a, inp) {
  a.ev = 0;
  if (a.mv > 0) {
    a.mv--;
    if (a.mv === 0 && !a.frozen && a.hold < 0) {
      const k = keyAt(W, a.x, a.y);
      if (k >= 0) { W.keys[k].holder = a.id; a.hold = k; a.ev = 2; evt(W, 'pickup', a.x, a.y, a); }
    }
  }
  if (a.mv === 0 && !a.frozen) {
    if (inp & ACT) doAction(W, a);
    const d = inp & 7;
    if (d) tryMove(W, a, d);
  }
}

function occupied(W, x, y) { return !!agentAt(W, x, y) || crateAt(W, x, y) >= 0; }

function updateEnv(W, silent) {
  const L = W.L;
  const tNext = silent ? W.t : W.t + 1; // gate state is what the NEXT tick will see
  const pressedCount = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < L.plates.length; i++) {
    const p = L.plates[i];
    const on = occupied(W, p.x, p.y) ? 1 : 0;
    if (on !== W.platePressed[i] && !silent) evt(W, on ? 'plateOn' : 'plateOff', p.x, p.y);
    W.platePressed[i] = on;
    if (on) pressedCount[p.ch]++;
  }
  for (let i = 0; i < L.doors.length; i++) {
    const d = L.doors[i];
    const open = (pressedCount[d.ch] === L.chanCount[d.ch] && L.chanCount[d.ch] > 0) || occupied(W, d.x, d.y) ? 1 : 0;
    if (open !== W.doorOpen[i] && !silent) evt(W, open ? 'doorOpen' : 'doorClose', d.x, d.y);
    W.doorOpen[i] = open;
  }
  for (let i = 0; i < L.gates.length; i++) {
    const g = L.gates[i];
    const open = gateScheduled(L.gateCfg[g.g], tNext) || occupied(W, g.x, g.y) ? 1 : 0;
    if (open !== W.gateOpen[i] && !silent) evt(W, open ? 'gateOpen' : 'gateClose', g.x, g.y);
    W.gateOpen[i] = open;
  }
  // lasers
  W.beams.length = 0;
  let zap = false;
  for (const e of L.emitters) {
    let x = e.x + DX[e.dir], y = e.y + DY[e.dir];
    const sx = x, sy = y;
    let ex = e.x, ey = e.y, hit = 'wall';
    while (inB(L, x, y)) {
      const i = y * L.w + x, t = L.tile[i];
      if (t === T_WALL || t === T_EMIT ||
          (t === T_DOOR && !W.doorOpen[L.doorIdx[i]]) ||
          (t === T_GATE && !W.gateOpen[L.gateIdx[i]]) ||
          (t === T_LOCK && !W.lockOpen[L.lockIdx[i]])) { hit = 'wall'; break; }
      if (crateAt(W, x, y) >= 0) { hit = 'crate'; break; }
      const ag = agentAt(W, x, y);
      if (ag) {
        hit = ag.echo ? 'echo' : 'live';
        if (!ag.echo && ag.mv <= MOVE / 2) zap = true;
        break;
      }
      ex = x; ey = y;
      x += DX[e.dir]; y += DY[e.dir];
    }
    W.beams.push({ e, sx, sy, ex, ey, hx: x, hy: y, hit, dir: e.dir });
  }
  return zap;
}

function sigOf(W, a) { return (a.y * W.L.w + a.x) * 16 + (a.hold + 1); }

function echoInput(e, t) { return t < e.len ? e.inputs[t] : 0; }

/* One fixed tick. Returns null or { type: 'paradox'|'zap'|'win'|'timeout', ... } */
function simStep(W, liveInput) {
  const L = W.L, t = W.t;
  W.events.length = 0;
  for (const c of W.crates) if (c.mv > 0) c.mv--;
  for (let i = 0; i < W.agents.length; i++) {
    const a = W.agents[i];
    if (a.echo) {
      const e = W.echoes[i];
      a.frozen = t >= e.len;
      updateAgent(W, a, echoInput(e, t));
    } else updateAgent(W, a, liveInput);
  }
  const zap = updateEnv(W, false);
  const live = W.live;
  W.rec.inputs.push(liveInput);
  W.rec.sigs.push(sigOf(W, live));
  W.rec.evs.push(live.ev);
  let res = null;
  // Paradox 1: an echo could not do what it did before (blocked, lost its key, crate moved...)
  for (let i = 0; i < W.echoes.length && !res; i++) {
    const e = W.echoes[i], a = W.agents[i];
    const expSig = t < e.len ? e.sigs[t] : e.sigs[e.len - 1];
    const expEv = t < e.len ? e.evs[t] : 0;
    if (sigOf(W, a) !== expSig || a.ev !== expEv) res = { type: 'paradox', who: i, x: a.x, y: a.y, reason: 'diverge' };
  }
  // Paradox 2: the live self touches an echo (the time anchor tile is a safe zone)
  if (!res) {
    for (let i = 0; i < W.echoes.length; i++) {
      const a = W.agents[i];
      if (a.x === live.x && a.y === live.y && L.tile[a.y * L.w + a.x] !== T_SPAWN) {
        res = { type: 'paradox', who: i, x: a.x, y: a.y, reason: 'touch' }; break;
      }
    }
  }
  if (!res && zap) res = { type: 'zap', x: live.x, y: live.y };
  if (!res && live.mv === 0 && L.tile[live.y * L.w + live.x] === T_EXIT) res = { type: 'win' };
  W.t++;
  if (!res && W.t >= L.loopTicks) res = { type: 'timeout' };
  return res;
}

/* Freeze the live run that just ended into an echo record. */
function makeEcho(W) {
  const n = W.rec.inputs.length;
  return {
    inputs: Uint8Array.from(W.rec.inputs),
    sigs: Int32Array.from(n ? W.rec.sigs : [sigOf(W, W.live)]),
    evs: Float64Array.from(n ? W.rec.evs : [0]),
    len: Math.max(1, n),
    frames: W.rec.frames,
  };
}

// ======================================================================
//  BROWSER LAYER
// ======================================================================
const SAVE_KEY = 'echoes.save.v1';
const CH_COLORS = ['#46d2ff', '#ff6fcf', '#ffcf5a', '#6dffa0', '#b28dff', '#ff8c5a'];
const ECHO_HUES = [272, 28, 158, 330, 205, 52, 0, 112];
const FONT = "'Avenir Next', 'Montserrat', 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CONTROLS = [
  ['Arrows / WASD', 'move'], ['R', 'rewind now (keep this run as an echo)'], ['U / Backspace', 'undo last echo'],
  ['E / Space', 'drop or toss a key'], ['Esc', 'pause / rooms'], ['Enter / Space', 'start'],
];
const TOUCH_CONTROLS = [
  ['D-PAD', 'move, hold to walk'], ['REWIND', 'keep run as echo'], ['UNDO', 'erase last echo'],
  ['KEY', 'drop / toss key'], ['\u275a\u275a', 'pause / rooms'],
];
// touch layer state (purely presentational: it feeds the same Input path the keyboard uses)
const TC = { on: false, safe: { t: 0, r: 0, b: 0, l: 0 }, rect: null, root: null, dpad: null, dpadDir: 0, dpadId: null,
             swipe: null, unlocked: false, winBtns: null, shown: null };
function detectTouch() {
  const q = /[?&]touch=([01])/.exec(location.search);
  if (q) return q[1] === '1';
  return !!((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window));
}
// rewrite keyboard wording in level text for touch players
function tt(s) {
  if (!TC.on || !s) return s;
  return s.replace('Move with the arrow keys or WASD.', 'Move with the D-pad. Hold a direction to keep walking.')
    .replace(/Press E or Space to drop a key/g, 'Tap KEY to drop a key')
    .replace(/\bpress R\b/g, 'tap REWIND').replace(/\bpress E\b/g, 'tap KEY').replace(/Press U\b/g, 'Tap UNDO');
}

let canvas, ctx, buf, bctx, fxc, fxctx, tmpc, tmpctx, staticC = null;
let dpr = 1, VW = 0, VH = 0, TS = 32, OX = 0, OY = 0;
let realTime = 0;

const G = {
  screen: 'title', phase: 'live', paused: false, pauseSel: 0,
  levelIdx: 0, L: null, W: null, echoes: [], loopNo: 0, fails: 0,
  trails: [], toast: null, pending: null, rw: null, px: null, winT: 0, winStars: 0,
  selCursor: 0, particles: [], shake: 0, save: { best: {}, unlocked: 1 },
  hover: -1,
};

// ---------------------------------------------------------------- save
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') G.save = { best: s.best || {}, unlocked: Math.max(1, s.unlocked | 0) };
  } catch (e) { /* storage unavailable: play without saving */ }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* ignore */ } }
function starsFor(n, par) { return n <= par ? 3 : n === par + 1 ? 2 : 1; }
function totalStars() { let s = 0; for (const k in G.save.best) s += G.save.best[k] | 0; return s; }

// ---------------------------------------------------------------- audio (procedural, Web Audio only)
const AudioSys = {
  ctx: null, layers: [], target: [0, 0, 0, 0, 0, 0, 0], step: 0, nextT: 0, mode: 'title', echoCount: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.85;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3.5;
    this.master.connect(comp); comp.connect(c.destination);
    this.rev = c.createConvolver(); this.rev.buffer = this.impulse(3.2);
    const rg = c.createGain(); rg.gain.value = 0.42; this.rev.connect(rg); rg.connect(this.master);
    this.mfilter = c.createBiquadFilter(); this.mfilter.type = 'lowpass'; this.mfilter.frequency.value = 18000;
    this.music = c.createGain(); this.music.gain.value = 0.5;
    this.music.connect(this.mfilter); this.mfilter.connect(this.master);
    const ms = c.createGain(); ms.gain.value = 0.7; this.mfilter.connect(ms); ms.connect(this.rev);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.75; this.sfx.connect(this.master);
    const ss = c.createGain(); ss.gain.value = 0.25; this.sfx.connect(ss); ss.connect(this.rev);
    const n = c.sampleRate * 2, nb = c.createBuffer(1, n, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 4); }
    this.shaper.curve = curve; this.shaper.connect(this.sfx);
    for (let i = 0; i < 7; i++) { const g = c.createGain(); g.gain.value = 0; g.connect(this.music); this.layers.push(g); }
    this.stepDur = 60 / 76 / 2;
    setInterval(() => this.schedule(), 25);
    this.applyLayers();
  },
  impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return b;
  },
  setMode(mode, echoes) { this.mode = mode; this.echoCount = echoes || 0; this.applyLayers(); },
  applyLayers() {
    const m = this.mode, n = this.echoCount || 0;
    const t = [0, 0, 0, 0, 0, 0, 0];
    if (m === 'title') { t[0] = 0.9; t[3] = 0.45; }
    if (m === 'play') { t[0] = 1; t[1] = 1; t[2] = n >= 1 ? 1 : 0; t[3] = n >= 2 ? 1 : 0; t[4] = n >= 3 ? 1 : 0; t[5] = n >= 4 ? 1 : 0; t[6] = n >= 5 ? 1 : 0; }
    if (m === 'menu') { t[0] = 0.8; t[2] = 0.5; }
    this.target = t;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.layers.forEach((g, i) => g.gain.setTargetAtTime(t[i], now, 0.9));
  },
  duck(amount, dur) {
    if (!this.ctx) return;
    const g = this.music.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.5 * amount, now + 0.05);
    g.setTargetAtTime(0.5, now + dur, 0.6);
  },
  sweep(down, dur) {
    if (!this.ctx) return;
    const f = this.mfilter.frequency, now = this.ctx.currentTime;
    f.cancelScheduledValues(now); f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(down, now + dur * 0.5);
    f.exponentialRampToValueAtTime(18000, now + dur + 0.4);
  },
  schedule() {
    const c = this.ctx; if (!c || this.mode === 'off') return;
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.06;
    while (this.nextT < c.currentTime + 0.22) { this.playStep(this.step, this.nextT); this.nextT += this.stepDur; this.step++; }
  },
  mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  tone(o) {
    const c = this.ctx, t = o.t != null ? o.t : c.currentTime;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const a = o.a != null ? o.a : 0.005, peak = o.g != null ? o.g : 0.2;
    g.gain.setValueAtTime(0.0001, t);
    if (o.rev) { g.gain.exponentialRampToValueAtTime(peak, t + o.dur); g.gain.setValueAtTime(0.0001, t + o.dur + 0.01); }
    else { g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur); }
    let node = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.dest || this.sfx);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  },
  noise(o) {
    const c = this.ctx, t = o.t != null ? o.t : c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    if (o.rev) { g.gain.exponentialRampToValueAtTime(o.g, t + o.dur); g.gain.setValueAtTime(0.0001, t + o.dur + 0.01); }
    else { g.gain.exponentialRampToValueAtTime(o.g, t + (o.a || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur); }
    src.connect(f); f.connect(g); g.connect(o.dest || this.sfx);
    src.start(t, Math.random()); src.stop(t + o.dur + 0.05);
  },
  bell(m, t, g, dest) {
    const f = this.mtof(m);
    this.tone({ f, t, dur: 1.6, g, a: 0.004, dest });
    this.tone({ f: f * 2.76, t, dur: 0.6, g: g * 0.35, a: 0.002, dest });
    this.tone({ f: f * 5.4, t, dur: 0.25, g: g * 0.12, a: 0.002, dest });
  },
  // calm loop track: pad + bass always, one extra layer per active echo
  playStep(s, t) {
    const CH = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 55, 59, 64, 67], [52, 55, 59, 62, 67]];
    const ROOT = [45, 41, 48, 40];
    const MEL = [[76, 72, 74], [72, 69, 71], [71, 67, 72], [74, 71, 67]];
    const bar = Math.floor(s / 8) % 4, st = s % 8, ch = CH[bar], L = this.layers, T = this.target;
    const barDur = this.stepDur * 8;
    if (st === 0 && T[0] > 0) {
      for (let i = 0; i < 4; i++) for (const det of [-7, 7])
        this.tone({ type: 'sawtooth', f: this.mtof(ch[i]), t, dur: barDur + 0.9, g: 0.018, a: 1.1, detune: det, lp: 900, dest: L[0] });
    }
    if (T[1] > 0 && (st === 0 || st === 4 || st === 7))
      this.tone({ type: 'sine', f: this.mtof(ROOT[bar] - 12 + (st === 7 ? 12 : 0)), t, dur: st === 7 ? 0.3 : 1.2, g: st === 7 ? 0.08 : 0.22, a: 0.02, dest: L[1] });
    if (T[2] > 0) {
      const pat = [0, 2, 4, 1, 3, 2, 4, 3];
      this.tone({ type: 'triangle', f: this.mtof(ch[pat[st]] + 12), t, dur: 0.45, g: 0.07, a: 0.004, lp: 3000, dest: L[2] });
    }
    if (T[3] > 0 && (st === 0 || st === 3 || st === 6)) this.bell(MEL[bar][st / 3], t, 0.06, L[3]);
    if (T[4] > 0) {
      if (st === 0 || st === 4) this.tone({ type: 'sine', f: 120, f2: 40, glide: 0.18, t, dur: 0.3, g: 0.3, dest: L[4] });
      if (st % 2 === 1) this.noise({ f: 8000, ft: 'highpass', t, dur: 0.05, g: st === 3 || st === 7 ? 0.06 : 0.03, dest: L[4] });
      if (st === 4) this.noise({ f: 1800, t, dur: 0.15, g: 0.05, q: 0.8, dest: L[4] });
    }
    if (T[5] > 0) this.tone({ type: 'sine', f: this.mtof(ch[(st * 3) % 5] + 24), t: t + this.stepDur * 0.5, dur: 0.7, g: 0.025, dest: L[5] });
    if (T[6] > 0 && st === 0)
      for (const det of [-5, 5]) this.tone({ type: 'square', f: this.mtof(ch[0] + 12), t, dur: barDur, g: 0.012, a: 1.5, detune: det, lp: 1200, dest: L[6] });
  },
  sfxPlay(name, arg) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'plateOn':
        this.tone({ type: 'square', f: 1500, f2: 700, t, dur: 0.06, g: 0.06, lp: 4000 });
        this.tone({ f: 180, f2: 60, t, dur: 0.15, g: 0.25 }); break;
      case 'plateOff': this.tone({ type: 'square', f: 700, f2: 1100, t, dur: 0.05, g: 0.04, lp: 3000 }); break;
      case 'doorOpen':
        this.tone({ f: 98, t, dur: 0.6, g: 0.18, a: 0.08 }); this.tone({ f: 196, f2: 294, t, dur: 0.5, g: 0.06, a: 0.05 });
        this.noise({ f: 400, f2: 1600, t, dur: 0.35, g: 0.05, q: 2 }); break;
      case 'doorClose':
        this.tone({ f: 147, f2: 73, t, dur: 0.35, g: 0.15, a: 0.01 }); this.noise({ f: 1200, f2: 300, t, dur: 0.2, g: 0.04, q: 2 }); break;
      case 'gateOpen': this.tone({ type: 'triangle', f: 660, f2: 990, t, dur: 0.12, g: 0.03 }); break;
      case 'gateClose': this.tone({ type: 'triangle', f: 660, f2: 330, t, dur: 0.12, g: 0.03 }); break;
      case 'push': this.noise({ f: 260, ft: 'lowpass', t, dur: 0.18, g: 0.25, a: 0.01 }); this.tone({ f: 70, t, dur: 0.15, g: 0.15 }); break;
      case 'pickup': this.tone({ f: 880, f2: 1760, glide: 0.08, t, dur: 0.25, g: 0.1 }); this.bell(88, t + 0.05, 0.04); break;
      case 'drop': this.tone({ type: 'triangle', f: 700, f2: 350, t, dur: 0.15, g: 0.08 }); break;
      case 'toss': this.noise({ f: 900, f2: 3000, t, dur: 0.25, g: 0.05, q: 3 }); this.tone({ type: 'triangle', f: 500, f2: 1000, t, dur: 0.2, g: 0.06 }); break;
      case 'unlock': [64, 71, 76, 83].forEach((m, i) => this.bell(m, t + i * 0.05, 0.06)); this.noise({ f: 3000, t, dur: 0.1, g: 0.05 }); break;
      case 'warn': this.tone({ f: arg ? 1320 : 1760, t, dur: 0.08, g: 0.05 }); break;
      case 'loop': this.bell(69, t, 0.05); this.bell(76, t + 0.09, 0.035); break;
      case 'rewind': {
        const d = arg || 1;
        this.noise({ f: 5000, f2: 250, glide: d, t, dur: d, g: 0.22, q: 1.4, a: d * 0.3 });
        this.tone({ type: 'sawtooth', f: 900, f2: 60, glide: d, t, dur: d, g: 0.05, a: d * 0.2, lp: 2200 });
        this.tone({ f: 220, f2: 880, glide: d * 0.8, t, dur: d, g: 0.06, a: d * 0.5 });
        this.sweep(500, d); break;
      }
      case 'paradox': {
        // a reversed swell (rises, then cuts dead) followed by the crack
        this.noise({ f: 300, f2: 6000, glide: 0.55, t, dur: 0.55, g: 0.4, q: 0.8, rev: true });
        [55, 56, 61, 62].forEach(m => this.tone({ type: 'sawtooth', f: this.mtof(m), f2: this.mtof(m + 12), glide: 0.55, t, dur: 0.55, g: 0.05, rev: true }));
        const t2 = t + 0.56;
        this.noise({ f: 2500, ft: 'highpass', t: t2, dur: 0.35, g: 0.6, a: 0.002 });
        this.tone({ f: 90, f2: 28, t: t2, dur: 0.9, g: 0.9, dest: this.shaper });
        this.tone({ type: 'square', f: 1200, f2: 80, t: t2, dur: 0.25, g: 0.08, lp: 5000 });
        this.duck(0.05, 1.4); break;
      }
      case 'zap':
        this.tone({ type: 'sawtooth', f: 1400, f2: 60, t, dur: 0.35, g: 0.12, lp: 4000 });
        this.noise({ f: 3000, f2: 400, t, dur: 0.3, g: 0.2, q: 1 }); this.duck(0.3, 0.6); break;
      case 'win':
        [72, 76, 79, 83, 88, 91].forEach((m, i) => this.bell(m, t + i * 0.09, 0.08));
        this.tone({ type: 'triangle', f: this.mtof(57), t, dur: 2.5, g: 0.08, a: 0.3 }); break;
      case 'undo': this.tone({ type: 'triangle', f: 1200, f2: 300, t, dur: 0.25, g: 0.07 }); break;
      case 'ui': this.tone({ f: 1250, t, dur: 0.05, g: 0.04 }); break;
      case 'select': this.bell(76, t, 0.06); this.bell(83, t + 0.07, 0.05); break;
      case 'deny': this.tone({ type: 'square', f: 180, t, dur: 0.12, g: 0.05, lp: 900 }); break;
      case 'star': this.bell(arg || 84, t, 0.08); break;
    }
  },
};
function sfx(n, a) { AudioSys.sfxPlay(n, a); }

// ---------------------------------------------------------------- layout + static room layer
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, TC.on ? 3 : 2);
  VW = window.innerWidth; VH = window.innerHeight;
  for (const c of [canvas, buf, fxc, tmpc]) { c.width = Math.round(VW * dpr); c.height = Math.round(VH * dpr); }
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
  if (TC.on) layoutTouch(); else TC.rect = null;
  layoutRoom();
}
function readSafe() {
  const cs = getComputedStyle(document.documentElement), g = k => parseFloat(cs.getPropertyValue(k)) || 0;
  TC.safe = { t: g('--sat'), r: g('--sar'), b: g('--sab'), l: g('--sal') };
}
function place(el, x, y, w, h) {
  el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
  el.style.width = Math.round(w) + 'px'; el.style.height = Math.round(h) + 'px';
}
// Reserve screen space for the controls and leave the rest (TC.rect) to the room + HUD.
function layoutTouch() {
  readSafe();
  const s = TC.safe, pad = 12, gap = 10, aw = VW - s.l - s.r, ah = VH - s.t - s.b;
  const btns = document.getElementById('tbtns');
  let dp, b;
  if (VW <= VH) {           // portrait: controls along the bottom
    dp = Math.round(Math.min(200, aw * 0.48, VH * 0.26));
    b = Math.floor(Math.min((aw - dp - pad * 3 - gap) / 2, (dp - gap) / 2));
    const ch = Math.max(dp, 2 * b + gap) + pad * 2, y0 = VH - s.b - ch;
    place(TC.dpad, s.l + pad, y0 + pad + (ch - 2 * pad - dp) / 2, dp, dp);
    place(btns, VW - s.r - pad - (2 * b + gap), y0 + pad + (ch - 2 * pad - (2 * b + gap)) / 2, 2 * b + gap, 2 * b + gap);
    TC.rect = { x: s.l, y: s.t, w: aw, h: ah - ch };
  } else {                  // landscape: D-pad in a left column, buttons in a right column
    const cw = Math.round(Math.min(200, VH * 0.5, aw * 0.22));
    dp = Math.min(cw - pad * 2, ah - pad * 2);
    b = Math.floor((cw - pad * 2 - gap) / 2);
    place(TC.dpad, s.l + pad + (cw - 2 * pad - dp) / 2, VH - s.b - pad - dp, dp, dp);
    place(btns, VW - s.r - cw + pad + (cw - 2 * pad - (2 * b + gap)) / 2, VH - s.b - pad - (2 * b + gap), 2 * b + gap, 2 * b + gap);
    TC.rect = { x: s.l + cw, y: s.t, w: aw - 2 * cw, h: ah };
  }
  btns.style.setProperty('--b', b + 'px'); btns.style.setProperty('--gap', gap + 'px');
}
function layoutRoom() {
  if (!G.L) return;
  if (TC.on && TC.rect) {
    const R = TC.rect, top = 52, bottom = 44;
    TS = Math.floor(Math.min((R.w - 12) / G.L.w, (R.h - top - bottom) / G.L.h));
    TS = Math.max(10, TS);
    OX = Math.round(R.x + (R.w - TS * G.L.w) / 2);
    OY = Math.round(R.y + top + (R.h - top - bottom - TS * G.L.h) / 2);
    buildStatic();
    return;
  }
  const top = Math.max(76, VH * 0.11), bottom = Math.max(78, VH * 0.12);
  TS = Math.floor(Math.min((VW - 40) / G.L.w, (VH - top - bottom) / G.L.h));
  TS = Math.max(12, TS);
  OX = Math.round((VW - TS * G.L.w) / 2);
  OY = Math.round(top + (VH - top - bottom - TS * G.L.h) / 2);
  buildStatic();
}
function sx(x) { return OX + (x + 0.5) * TS; }
function sy(y) { return OY + (y + 0.5) * TS; }
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function isWallOrFence(L, x, y) { if (!inB(L, x, y)) return false; const t = L.tile[y * L.w + x]; return t === T_WALL || t === T_FENCE; }

function buildStatic() {
  const L = G.L;
  staticC = staticC || document.createElement('canvas');
  staticC.width = Math.round(VW * dpr); staticC.height = Math.round(VH * dpr);
  const c = staticC.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, VW, VH);
  const isWall = (x, y) => !inB(L, x, y) || L.tile[y * L.w + x] === T_WALL || L.tile[y * L.w + x] === T_EMIT;
  const g = c.createRadialGradient(VW / 2, OY + TS * L.h / 2, TS, VW / 2, OY + TS * L.h / 2, TS * L.w * 0.75);
  g.addColorStop(0, 'rgba(60,80,160,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const t = L.tile[y * L.w + x], px = OX + x * TS, py = OY + y * TS;
    if (t === T_WALL || t === T_EMIT) continue;
    c.fillStyle = '#0b0e1b'; c.fillRect(px, py, TS, TS);
    c.fillStyle = (x + y) % 2 ? '#10142a' : '#0f1327';
    rr(c, px + 1.5, py + 1.5, TS - 3, TS - 3, TS * 0.12); c.fill();
    if (t === T_SPAWN) {
      c.save(); c.translate(px + TS / 2, py + TS / 2);
      c.strokeStyle = 'rgba(160,220,255,0.35)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, TS * 0.38, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = 'rgba(160,220,255,0.18)';
      c.beginPath(); c.arc(0, 0, TS * 0.26, 0, Math.PI * 2); c.stroke();
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * TS * 0.38, Math.sin(a) * TS * 0.38); c.lineTo(Math.cos(a) * TS * 0.44, Math.sin(a) * TS * 0.44); c.stroke(); }
      c.restore();
    }
    if (t === T_FENCE) {
      c.save(); c.strokeStyle = 'rgba(170,150,255,0.65)'; c.lineWidth = Math.max(1.5, TS * 0.05);
      c.shadowColor = 'rgba(150,120,255,0.8)'; c.shadowBlur = 8;
      const vert = isWallOrFence(L, x, y - 1) || isWallOrFence(L, x, y + 1);
      c.beginPath();
      if (vert) {
        c.moveTo(px + TS * 0.35, py); c.lineTo(px + TS * 0.35, py + TS); c.moveTo(px + TS * 0.65, py); c.lineTo(px + TS * 0.65, py + TS);
        for (let k = 0; k < 3; k++) { c.moveTo(px + TS * 0.35, py + TS * (k + 0.5) / 3); c.lineTo(px + TS * 0.65, py + TS * (k + 0.5) / 3); }
      } else {
        c.moveTo(px, py + TS * 0.35); c.lineTo(px + TS, py + TS * 0.35); c.moveTo(px, py + TS * 0.65); c.lineTo(px + TS, py + TS * 0.65);
        for (let k = 0; k < 3; k++) { c.moveTo(px + TS * (k + 0.5) / 3, py + TS * 0.35); c.lineTo(px + TS * (k + 0.5) / 3, py + TS * 0.65); }
      }
      c.stroke(); c.restore();
    }
  }
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    if (!isWall(x, y)) continue;
    const px = OX + x * TS, py = OY + y * TS;
    let nearFloor = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isWall(x + dx, y + dy)) nearFloor = true;
    c.fillStyle = nearFloor ? '#161c36' : '#0d1124';
    c.fillRect(px, py, TS + 0.5, TS + 0.5);
    if (nearFloor) { c.fillStyle = 'rgba(120,140,255,0.06)'; c.fillRect(px + 2, py + 2, TS - 4, TS * 0.35); }
  }
  c.save(); c.lineWidth = Math.max(1.2, TS * 0.045); c.strokeStyle = 'rgba(120,150,255,0.55)';
  c.shadowColor = 'rgba(100,140,255,0.9)'; c.shadowBlur = TS * 0.35; c.beginPath();
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    if (!isWall(x, y)) continue;
    const px = OX + x * TS, py = OY + y * TS;
    if (!isWall(x, y - 1)) { c.moveTo(px, py); c.lineTo(px + TS, py); }
    if (!isWall(x, y + 1)) { c.moveTo(px, py + TS); c.lineTo(px + TS, py + TS); }
    if (!isWall(x - 1, y)) { c.moveTo(px, py); c.lineTo(px, py + TS); }
    if (!isWall(x + 1, y)) { c.moveTo(px + TS, py); c.lineTo(px + TS, py + TS); }
  }
  c.stroke(); c.restore();
  for (const e of L.emitters) {
    c.save(); c.translate(sx(e.x), sy(e.y)); c.rotate((e.dir - 2) * Math.PI / 2);
    c.fillStyle = '#2a1020'; rr(c, -TS * 0.42, -TS * 0.36, TS * 0.84, TS * 0.72, TS * 0.12); c.fill();
    c.strokeStyle = 'rgba(255,90,120,0.8)'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#ff4d6d'; c.shadowColor = '#ff2850'; c.shadowBlur = 12;
    c.beginPath(); c.moveTo(TS * 0.1, -TS * 0.18); c.lineTo(TS * 0.46, 0); c.lineTo(TS * 0.1, TS * 0.18); c.closePath(); c.fill();
    c.restore();
  }
}

// ---------------------------------------------------------------- views (render snapshots)
function lerpObj(o, alpha) {
  if (o.mv > 0) { const p = Math.min(1, (MOVE - o.mv + alpha) / MOVE); return [o.fx + (o.x - o.fx) * p, o.fy + (o.y - o.fy) * p]; }
  return [o.x, o.y];
}
function viewOf(W, alpha) {
  const v = { t: W.t, agents: [], crates: [], keys: [], door: Array.from(W.doorOpen), gate: Array.from(W.gateOpen),
              plate: Array.from(W.platePressed), lock: Array.from(W.lockOpen),
              beams: W.beams.map(b => ({ ox: b.e.x, oy: b.e.y, hx: b.hx, hy: b.hy, hit: b.hit, dir: b.dir })) };
  for (const a of W.agents) { const p = lerpObj(a, alpha); v.agents.push({ x: p[0], y: p[1], echo: a.echo, id: a.id, face: a.face, hold: a.hold, frozen: a.frozen }); }
  for (const c of W.crates) { const p = lerpObj(c, alpha); v.crates.push({ x: p[0], y: p[1] }); }
  for (const k of W.keys) {
    if (k.gone) { v.keys.push(null); continue; }
    if (k.holder >= 0) { const a = v.agents[k.holder]; v.keys.push({ x: a.x, y: a.y, h: 0.62, held: true }); continue; }
    const tt = (W.t - k.tossT + alpha) / (k.tossed ? 16 : 8);
    if (tt < 1) v.keys.push({ x: k.fx + (k.x - k.fx) * tt, y: k.fy + (k.y - k.fy) * tt, h: Math.sin(Math.PI * tt) * (k.tossed ? 1.3 : 0.45) + 0.62 * (1 - tt), held: false });
    else v.keys.push({ x: k.x, y: k.y, h: 0, held: false });
  }
  return v;
}

// ---------------------------------------------------------------- game flow
function startLevel(idx) {
  G.levelIdx = idx; G.L = parseLevel(LEVELS[idx], idx);
  G.echoes = []; G.loopNo = 0; G.fails = 0; G.particles = [];
  G.screen = 'play'; G.paused = false;
  layoutRoom();
  startLoop();
  showToast(LEVELS[idx].name.toUpperCase(), 'title');
}
function startLoop() {
  G.W = createWorld(G.L, G.echoes);
  G.loopNo++; G.phase = 'live'; G.pending = null;
  Input.bufTTL = 0; Input.actTTL = 0; // nothing pressed in a menu or mid-rewind leaks into the new loop
  G.trails = G.W.agents.map(() => []);
  G.W.rec.frames.push(viewOf(G.W, 0));
  AudioSys.setMode('play', G.echoes.length);
  if (G.loopNo > 1) sfx('loop');
}
function showToast(text, kind) { G.toast = { text, kind: kind || 'info', t: 0 }; }
function hintVisible() { return G.fails >= 2 || G.loopNo > G.L.par + 2; }

function startRewind(frames, after, opts) {
  opts = opts || {};
  const n = frames.length;
  const dur = opts.dur || Math.round(Math.max(36, Math.min(72, 28 + n * 0.12)));
  G.rw = { frames, after, t: 0, dur };
  G.phase = 'rewind';
  sfx('rewind', dur / 60);
}
function endLoop(kind, res) {
  const W = G.W;
  if (G.echoes.length < G.L.maxEchoes) {
    G.echoes.push(makeEcho(W));
    const n = G.echoes.length;
    if (kind === 'zap') showToast('Echo ' + n + ' fell into the beam. Now it absorbs it.', 'echo');
    else if (kind === 'timeout') showToast('Time\u2019s up. Echo ' + n + ' recorded.', 'echo');
    else showToast('Echo ' + n + ' recorded', 'echo');
    if (n > G.L.par) G.fails++;
  } else {
    G.fails++;
    showToast('Echo limit reached (' + G.L.maxEchoes + '). Press U to undo one.', 'warn');
  }
  if (kind === 'zap') { burst(res.x, res.y, '#ff4d6d', 40, 0.12); G.shake = 10; sfx('zap'); }
  startRewind(W.rec.frames, startLoop);
}
function doUndo() {
  if (!G.echoes.length) { showToast('No echoes to undo', 'warn'); sfx('deny'); return; }
  G.echoes.pop();
  showToast('Echo ' + (G.echoes.length + 1) + ' erased', 'info');
  sfx('undo');
  startRewind(G.W.rec.frames, startLoop, { dur: 34 });
}
function restartLevel() {
  G.echoes = []; G.loopNo = 0; G.fails = 0; G.paused = false;
  showToast('Timeline cleared', 'info');
  startRewind(G.W.rec.frames, startLoop, { dur: 40 });
}
function handleResult(res) {
  G.lastResult = res.type + (res.reason ? '/' + res.reason : '') + '@' + G.W.t;
  if (res.type === 'paradox') {
    G.phase = 'paradox'; G.px = { t: 0, x: res.x, y: res.y, who: res.who, reason: res.reason };
    G.fails++; G.shake = 18; sfx('paradox');
    burst(res.x, res.y, '#ffffff', 50, 0.16);
  } else if (res.type === 'zap') endLoop('zap', res);
  else if (res.type === 'timeout') endLoop('timeout', res);
  else if (res.type === 'win') {
    G.phase = 'win'; G.winT = 0;
    const n = G.echoes.length, st = starsFor(n, G.L.par);
    G.winStars = st; G.winEchoes = n;
    const prev = G.save.best[G.levelIdx] | 0;
    G.save.best[G.levelIdx] = Math.max(prev, st);
    G.save.unlocked = Math.max(G.save.unlocked, Math.min(LEVELS.length, G.levelIdx + 2));
    writeSave();
    sfx('win'); AudioSys.setMode('menu');
    burst(G.L.exit.x, G.L.exit.y, '#bff6ff', 70, 0.14);
  }
}
function handleEvents(W) {
  for (const e of W.events) {
    switch (e.type) {
      case 'plateOn': sfx('plateOn'); burst(e.x, e.y, CH_COLORS[G.L.ch[e.y * G.L.w + e.x]], 10, 0.05); break;
      case 'plateOff': sfx('plateOff'); break;
      case 'doorOpen': sfx('doorOpen'); break;
      case 'doorClose': sfx('doorClose'); break;
      case 'gateOpen': sfx('gateOpen'); break;
      case 'gateClose': sfx('gateClose'); break;
      case 'push': if (!e.a.echo) sfx('push'); break;
      case 'pickup': sfx('pickup'); burst(e.x, e.y, '#ffd75a', 14, 0.06); break;
      case 'drop': sfx('drop'); break;
      case 'toss': sfx('toss'); break;
      case 'unlock': sfx('unlock'); burst(e.x, e.y, '#ffd75a', 26, 0.1); break;
    }
  }
}

// ---------------------------------------------------------------- input
const Input = { stack: [], buffered: 0, bufTTL: 0, actTTL: 0, pressT: [0, 0, 0, 0, 0] };
function dirOf(code) {
  return ({ ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4 })[code] || 0;
}
// The exact value returned here is what gets recorded for the echo, tick by tick.
function liveInput() {
  const W = G.W;
  let inp = 0;
  if (W.live.mv <= 1) {
    let d = Input.bufTTL > 0 ? Input.buffered : 0;
    if (!d && Input.stack.length) {
      // a held key keeps walking, but a quick tap only ever takes one step
      const h = Input.stack[Input.stack.length - 1];
      if (realTime - Input.pressT[h] >= 0.15) d = h;
    }
    inp = d;
    if (Input.actTTL > 0) { inp |= ACT; Input.actTTL = 0; }
    Input.bufTTL = 0;
  }
  if (Input.bufTTL > 0) Input.bufTTL--;
  if (Input.actTTL > 0) Input.actTTL--;
  return inp;
}
function onKeyDown(e) {
  const code = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace', 'Tab'].includes(code)) e.preventDefault();
  AudioSys.init();
  const d = dirOf(code);
  if (d && !e.repeat) {
    Input.stack = Input.stack.filter(x => x !== d); Input.stack.push(d);
    Input.pressT[d] = realTime; Input.buffered = d; Input.bufTTL = MOVE + 2;
  }
  if (e.repeat && !(d && G.screen === 'select')) return;
  const enter = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
  if (G.screen === 'title') {
    if (enter) { sfx('select'); gotoSelect(); }
    return;
  }
  if (G.screen === 'end') { if (enter || code === 'Escape') { sfx('select'); gotoSelect(); } return; }
  if (G.screen === 'select') {
    const n = LEVELS.length, cols = selCols();
    let c = G.selCursor;
    if (d === 2) c = Math.min(n - 1, c + 1);
    if (d === 4) c = Math.max(0, c - 1);
    if (d === 3) c = Math.min(n - 1, c + cols);
    if (d === 1) c = Math.max(0, c - cols);
    if (c !== G.selCursor) { G.selCursor = c; sfx('ui'); }
    if (enter) trySelect(G.selCursor);
    if (code === 'Escape') { G.screen = 'title'; AudioSys.setMode('title'); sfx('ui'); }
    return;
  }
  if (G.screen !== 'play') return;
  if (G.paused) {
    const items = 4;
    if (d === 1) { G.pauseSel = (G.pauseSel + items - 1) % items; sfx('ui'); }
    if (d === 3) { G.pauseSel = (G.pauseSel + 1) % items; sfx('ui'); }
    if (code === 'Escape') { G.paused = false; sfx('ui'); }
    if (enter) pauseChoose(G.pauseSel);
    return;
  }
  if (G.phase === 'win') {
    if (G.winT < 30) return;
    if (enter) {
      sfx('select');
      if (G.levelIdx + 1 < LEVELS.length) startLevel(G.levelIdx + 1);
      else { G.screen = 'end'; G.endT = 0; AudioSys.setMode('title'); }
    }
    if (code === 'KeyR') { sfx('select'); startLevel(G.levelIdx); }
    if (code === 'Escape') { sfx('ui'); gotoSelect(); }
    return;
  }
  if (code === 'Escape') { G.paused = true; G.pauseSel = 0; sfx('ui'); return; }
  if (G.phase !== 'live') return;
  if (code === 'KeyR') G.pending = 'rewind';
  else if (code === 'KeyU' || code === 'Backspace') G.pending = 'undo';
  else if (code === 'KeyE' || code === 'Space') Input.actTTL = MOVE + 4;
}
function onKeyUp(e) { const d = dirOf(e.code); if (d) Input.stack = Input.stack.filter(x => x !== d); }
function gotoSelect() {
  G.screen = 'select'; G.paused = false; AudioSys.setMode('menu');
  let c = 0;
  for (let i = 0; i < Math.min(LEVELS.length, G.save.unlocked); i++) { c = i; if (!G.save.best[i]) break; }
  G.selCursor = c;
}
function trySelect(i) {
  if (i < G.save.unlocked) { sfx('select'); startLevel(i); }
  else { sfx('deny'); showToast('Clear the previous room to unlock this one', 'warn'); }
}
function pauseChoose(i) {
  sfx('select');
  if (i === 0) G.paused = false;
  else if (i === 1) restartLevel();
  else if (i === 2) gotoSelect();
  else { G.screen = 'title'; G.paused = false; AudioSys.setMode('title'); }
}
function selCols() { return TC.on && VW < VH ? 4 : 7; }
function selectCardRects() {
  if (TC.on) {
    const n = LEVELS.length, cols = selCols(), rows = Math.ceil(n / cols), gx = 12, gy = 14;
    const portrait = VW < VH, s = TC.safe;
    const top = portrait ? VH * 0.13 + 70 : s.t + 100, bottomRes = portrait ? 120 : 64;
    const byW = (VW - s.l - s.r - 32 - (cols - 1) * gx) / cols;
    const byH = ((VH - s.b - bottomRes - top) - (rows - 1) * gy) / rows / 1.05;
    const cw = Math.max(40, Math.min(150, byW, byH)), ch = cw * 1.05;
    const tw = cols * cw + (cols - 1) * gx, x0 = (VW - tw) / 2, y0 = top;
    const r = [];
    for (let i = 0; i < n; i++) r.push({ x: x0 + (i % cols) * (cw + gx), y: y0 + Math.floor(i / cols) * (ch + gy), w: cw, h: ch });
    return r;
  }
  const n = LEVELS.length, cols = 7, rows = Math.ceil(n / cols);
  const cw = Math.min(150, (VW - 80) / cols - 14), ch = cw * 1.05;
  const gx = 14, gy = 18, tw = cols * cw + (cols - 1) * gx, th = rows * ch + (rows - 1) * gy;
  const x0 = (VW - tw) / 2, y0 = Math.max(VH * 0.26, (VH - th) / 2);
  const r = [];
  for (let i = 0; i < n; i++) r.push({ x: x0 + (i % cols) * (cw + gx), y: y0 + Math.floor(i / cols) * (ch + gy), w: cw, h: ch });
  return r;
}
function onMouseMove(e) {
  if (G.screen !== 'select') { canvas.style.cursor = 'default'; return; }
  const r = selectCardRects(); G.hover = -1;
  r.forEach((c, i) => { if (e.clientX >= c.x && e.clientX <= c.x + c.w && e.clientY >= c.y && e.clientY <= c.y + c.h) G.hover = i; });
  if (G.hover >= 0 && G.hover !== G.selCursor) { G.selCursor = G.hover; sfx('ui'); }
  canvas.style.cursor = G.hover >= 0 ? 'pointer' : 'default';
}
function hitRect(list, x, y) {
  if (!list) return -1;
  for (let i = 0; i < list.length; i++) { const r = list[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i; }
  return -1;
}
// one handler for mouse and touch taps on the canvas (title, room select, pause menu, win panel, swipes)
function onPointerDown(e) {
  const touch = e.pointerType !== 'mouse';
  if (touch) { e.preventDefault(); if (!TC.on) enableTouch(); }
  unlockAudio();
  const x = e.clientX, y = e.clientY;
  if (G.screen === 'title') { sfx('select'); gotoSelect(); return; }
  if (G.screen === 'end') { if (touch) { sfx('select'); gotoSelect(); } return; }
  if (G.screen === 'select') {
    if (!touch) { onMouseMove(e); if (G.hover >= 0) trySelect(G.hover); return; }
    const i = hitRect(selectCardRects(), x, y);
    if (i >= 0) { G.selCursor = i; trySelect(i); }
    return;
  }
  if (G.screen !== 'play') return;
  if (G.paused) { const i = hitRect(pauseLayout().items, x, y); if (i >= 0) { G.pauseSel = i; pauseChoose(i); } return; }
  if (G.phase === 'win') {
    if (G.winT < 30 || !TC.on) return;
    const i = hitRect(TC.winBtns, x, y);
    if (i >= 0) { const code = TC.winBtns[i].code; synthKey(code, true); synthKey(code, false); }
    return;
  }
  if (touch && G.phase === 'live') TC.swipe = { id: e.pointerId, x, y };
}
function onPointerUp(e) {
  const sw = TC.swipe;
  if (!sw || sw.id !== e.pointerId) return;
  TC.swipe = null;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 28 || G.screen !== 'play' || G.paused || G.phase !== 'live') return;
  const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 4) : (dy > 0 ? 3 : 1);
  synthKey(DIR_CODE[d], true); synthKey(DIR_CODE[d], false);   // a swipe = one tap-step
}

// ---------------------------------------------------------------- touch controls (D-pad + buttons)
const DIR_CODE = [null, 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
function synthKey(code, down) {
  const ev = { code, repeat: false, preventDefault() {} };
  if (down) onKeyDown(ev); else onKeyUp(ev);
}
function unlockAudio() {
  AudioSys.init();
  const c = AudioSys.ctx;
  if (!c) return;
  if (c.state !== 'running' && c.resume) c.resume().catch(() => {});
  if (!TC.unlocked) {   // iOS: play one silent sample inside the gesture to unlock output
    TC.unlocked = true;
    try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch (err) { /* ignore */ }
  }
}
function setDpadDir(d) {
  if (d === TC.dpadDir) return;
  if (TC.dpadDir) synthKey(DIR_CODE[TC.dpadDir], false);
  TC.dpadDir = d;
  if (d) synthKey(DIR_CODE[d], true);
  TC.dpad.dataset.dir = d ? ['', 'up', 'right', 'down', 'left'][d] : '';
}
function dpadDirAt(e) {
  const r = TC.dpad.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * 0.1) return TC.dpadDir;   // small dead zone in the hub
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 4) : (dy > 0 ? 3 : 1);
}
function initTouchUI() {
  TC.root = document.getElementById('touch');
  TC.dpad = document.getElementById('dpad');
  const stop = e => { e.preventDefault(); };
  for (const el of [TC.root, canvas]) {
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('contextmenu', stop);
  }
  const dp = TC.dpad;
  dp.addEventListener('pointerdown', e => {
    e.preventDefault(); unlockAudio();
    if (TC.dpadId !== null) return;
    TC.dpadId = e.pointerId;
    try { dp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    setDpadDir(dpadDirAt(e) || 0);
  });
  dp.addEventListener('pointermove', e => { if (e.pointerId === TC.dpadId) { e.preventDefault(); setDpadDir(dpadDirAt(e)); } });
  const end = e => { if (e.pointerId === TC.dpadId) { TC.dpadId = null; setDpadDir(0); } };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) dp.addEventListener(t, end);
  for (const btn of TC.root.querySelectorAll('.tbtn')) {
    const code = btn.dataset.code;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); unlockAudio();
      btn.classList.add('on');
      synthKey(code, true);
    });
    const up = () => { if (btn.classList.contains('on')) { btn.classList.remove('on'); synthKey(code, false); } };
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(t, up);
  }
}
function enableTouch() {
  TC.on = true;
  document.documentElement.classList.add('touch');
  resize();
}
function releaseTouch() {
  TC.dpadId = null; setDpadDir(0); TC.swipe = null;
  if (TC.root) for (const b of TC.root.querySelectorAll('.tbtn.on')) b.classList.remove('on');
}
function updateTouchUI() {
  if (!TC.root) return;
  const show = TC.on && G.screen === 'play';
  if (show === TC.shown) return;
  TC.shown = show;
  TC.root.classList.toggle('show', show);
  if (!show) releaseTouch();
}

// ---------------------------------------------------------------- particles (visual only, never touch the sim)
function burst(tx, ty, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
    G.particles.push({ x: tx, y: ty, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 25 + Math.random() * 30, color, size: 0.04 + Math.random() * 0.06 });
  }
}
function updateParticles() {
  for (const p of G.particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.93; p.life++; }
  G.particles = G.particles.filter(p => p.life < p.max);
}

// ---------------------------------------------------------------- main loop: fixed 60 Hz sim, render every frame
let lastT = 0, acc = 0;
const DT = 1 / TPS;
function frame(now) {
  now /= 1000;
  if (!lastT) lastT = now;
  const dt = Math.min(0.1, now - lastT); lastT = now;
  realTime += dt; acc += dt;
  let steps = 0;
  while (acc >= DT && steps < 6) { tick(); acc -= DT; steps++; }
  if (steps === 6) acc = 0;
  render(Math.min(1, acc / DT));
  requestAnimationFrame(frame);
}
function tick() {
  if (G.toast) { G.toast.t++; if (G.toast.t > 200) G.toast = null; }
  if (G.shake > 0) G.shake *= 0.86;
  if (G.screen === 'end') G.endT = (G.endT || 0) + 1;
  if (G.screen !== 'play' || G.paused || G.phase !== 'live') { Input.bufTTL = 0; Input.actTTL = 0; }
  if (G.screen !== 'play' || G.paused) return;
  updateParticles();
  if (G.phase === 'live') {
    if (G.pending === 'rewind') { G.pending = null; endLoop('rewind'); return; }
    if (G.pending === 'undo') { G.pending = null; doUndo(); return; }
    const W = G.W;
    const res = simStep(W, liveInput());
    W.rec.frames.push(viewOf(W, 0));
    handleEvents(W);
    for (let i = 0; i < W.agents.length; i++) {
      const p = lerpObj(W.agents[i], 0), tr = G.trails[i];
      tr.push({ x: p[0], y: p[1] }); if (tr.length > 18) tr.shift();
    }
    for (const b of W.beams) if (b.hit !== 'wall' && Math.random() < 0.5) {
      G.particles.push({ x: b.hx - DX[b.dir] * 0.3, y: b.hy - DY[b.dir] * 0.3, vx: (Math.random() - 0.5) * 0.06 - DX[b.dir] * 0.03, vy: (Math.random() - 0.5) * 0.06 - DY[b.dir] * 0.03, life: 0, max: 14, color: '#ff8aa0', size: 0.035 });
    }
    const left = G.L.loopTicks - W.t;
    if (!res && left <= 120 && left > 0 && left % 30 === 0) sfx('warn', left % 60 === 0);
    if (res) handleResult(res);
  } else if (G.phase === 'rewind') {
    G.rw.t++;
    if (G.rw.t >= G.rw.dur) { const f = G.rw.after; G.rw = null; f(); }
  } else if (G.phase === 'paradox') {
    G.px.t++;
    if (G.px.t >= 80) startRewind(G.W.rec.frames, startLoop, { dur: 40 });
  } else if (G.phase === 'win') {
    G.winT++;
    if (G.winT === 50 || G.winT === 62 || G.winT === 74) { const k = (G.winT - 50) / 12; if (k < G.winStars) sfx('star', 84 + k * 4); }
  }
}

// ---------------------------------------------------------------- rendering: room
function render(alpha) {
  updateTouchUI();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05060c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.screen === 'title') drawTitle();
  else if (G.screen === 'select') drawSelect();
  else if (G.screen === 'end') drawEnd();
  else drawPlay(alpha);
  drawToast();
}
function bgDrift(c) {
  const g = c.createRadialGradient(VW * 0.5, VH * 0.45, 0, VW * 0.5, VH * 0.45, Math.max(VW, VH) * 0.75);
  g.addColorStop(0, '#0c1024'); g.addColorStop(1, '#04050a');
  c.fillStyle = g; c.fillRect(0, 0, VW, VH);
}
function drawOrb(c, x, y, r, hue, alpha, live, label, face) {
  c.save();
  if (live) {
    c.shadowColor = 'rgba(150,240,255,0.95)'; c.shadowBlur = r * 2.2;
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#d8fbff'); g.addColorStop(1, '#7fe4ff');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    if (face) { c.fillStyle = '#0a2a3a'; c.beginPath(); c.arc(x + DX[face] * r * 0.45, y + DY[face] * r * 0.45, r * 0.17, 0, Math.PI * 2); c.fill(); }
  } else {
    c.globalAlpha *= alpha;
    c.shadowColor = `hsla(${hue},100%,65%,0.9)`; c.shadowBlur = r * 1.6;
    c.fillStyle = `hsla(${hue},95%,62%,0.38)`;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0; c.lineWidth = Math.max(1.2, r * 0.12); c.strokeStyle = `hsla(${hue},100%,78%,0.85)`; c.stroke();
    if (label) {
      c.fillStyle = `hsla(${hue},100%,92%,0.95)`; c.font = `600 ${Math.round(r * 0.95)}px ${FONT}`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, x, y + r * 0.04);
    }
  }
  c.restore();
}
function drawKey(c, x, y, h, time) {
  const px = sx(x), py = sy(y) - h * TS * 0.5 + Math.sin(time * 3 + x) * TS * 0.04, s = TS * 0.2;
  c.save();
  if (h > 0.05) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(sx(x), sy(y) + TS * 0.25, s * 0.9, s * 0.35, 0, 0, Math.PI * 2); c.fill(); }
  c.translate(px, py); c.rotate(-0.6);
  c.shadowColor = '#ffcf4a'; c.shadowBlur = TS * 0.4;
  c.strokeStyle = '#ffd75a'; c.lineWidth = Math.max(1.5, TS * 0.07);
  c.beginPath(); c.arc(-s * 0.6, 0, s * 0.55, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(0, 0); c.lineTo(s * 1.4, 0); c.moveTo(s * 1.0, 0); c.lineTo(s * 1.0, s * 0.5); c.moveTo(s * 1.35, 0); c.lineTo(s * 1.35, s * 0.4); c.stroke();
  c.restore();
}

function drawRoom(c, v, opts) {
  const L = G.L, time = realTime;
  opts = opts || {};
  c.drawImage(staticC, 0, 0, VW, VH);
  // faint plate -> door links
  c.save(); c.setLineDash([3, 6]); c.lineWidth = 1;
  for (let i = 0; i < L.plates.length; i++) {
    const p = L.plates[i];
    for (const d of L.doors) {
      if (d.ch !== p.ch) continue;
      c.strokeStyle = hexA(CH_COLORS[p.ch], v.plate[i] ? 0.35 : 0.1);
      c.beginPath(); c.moveTo(sx(p.x), sy(p.y)); c.lineTo(sx(d.x), sy(d.y)); c.stroke();
    }
  }
  c.restore();
  for (let i = 0; i < L.plates.length; i++) {
    const p = L.plates[i], col = CH_COLORS[p.ch], on = v.plate[i], x = sx(p.x), y = sy(p.y);
    c.save();
    c.shadowColor = col; c.shadowBlur = on ? TS * 0.6 : TS * 0.15;
    c.strokeStyle = hexA(col, on ? 1 : 0.6); c.lineWidth = Math.max(1.5, TS * 0.07);
    rr(c, x - TS * 0.36, y - TS * 0.36, TS * 0.72, TS * 0.72, TS * 0.14); c.stroke();
    c.fillStyle = hexA(col, on ? 0.45 : 0.1);
    rr(c, x - TS * 0.26, y - TS * 0.26, TS * 0.52, TS * 0.52, TS * 0.1); c.fill();
    c.restore();
  }
  for (let i = 0; i < L.doors.length; i++) {
    const d = L.doors[i], col = CH_COLORS[d.ch], x = OX + d.x * TS, y = OY + d.y * TS;
    c.save();
    if (!v.door[i]) {
      c.shadowColor = col; c.shadowBlur = TS * 0.5;
      c.fillStyle = hexA(col, 0.22); c.fillRect(x + 2, y + 2, TS - 4, TS - 4);
      c.strokeStyle = hexA(col, 0.95); c.lineWidth = Math.max(1.5, TS * 0.06);
      c.strokeRect(x + 2, y + 2, TS - 4, TS - 4);
      c.shadowBlur = 0; c.beginPath();
      for (let k = 1; k < 4; k++) { c.moveTo(x + 4, y + TS * k / 4); c.lineTo(x + TS - 4, y + TS * k / 4); }
      c.strokeStyle = hexA(col, 0.5 + 0.2 * Math.sin(time * 4)); c.lineWidth = 1; c.stroke();
    } else {
      c.strokeStyle = hexA(col, 0.35); c.lineWidth = 1; c.setLineDash([4, 4]);
      c.strokeRect(x + 3, y + 3, TS - 6, TS - 6);
    }
    c.restore();
  }
  for (let i = 0; i < L.gates.length; i++) {
    const g = L.gates[i], x = OX + g.x * TS, y = OY + g.y * TS, cfg = L.gateCfg[g.g];
    c.save();
    if (!v.gate[i]) {
      c.shadowColor = '#9d7bff'; c.shadowBlur = TS * 0.4;
      c.fillStyle = 'rgba(157,123,255,0.16)'; c.fillRect(x + 2, y + 2, TS - 4, TS - 4);
      c.strokeStyle = '#c9b6ff'; c.lineWidth = Math.max(1.5, TS * 0.06); c.beginPath();
      for (let k = 1; k < 5; k++) { c.moveTo(x + TS * k / 5, y + 3); c.lineTo(x + TS * k / 5, y + TS - 3); }
      c.stroke();
    } else {
      c.strokeStyle = 'rgba(201,182,255,0.3)'; c.setLineDash([3, 4]); c.lineWidth = 1; c.strokeRect(x + 3, y + 3, TS - 6, TS - 6);
    }
    // countdown pip until the gate next changes
    c.setLineDash([]); c.shadowBlur = 0;
    const p = cfg.period, ph = (((v.t - cfg.offset) % p) + p) % p, isOpen = ph < cfg.open;
    let frac;
    if (p > 50000) frac = isOpen ? 1 - ph / cfg.open : (v.t < cfg.offset ? 1 - v.t / Math.max(1, cfg.offset) : 0);
    else frac = isOpen ? 1 - ph / cfg.open : 1 - (ph - cfg.open) / (p - cfg.open);
    c.strokeStyle = isOpen ? 'rgba(160,255,200,0.95)' : 'rgba(255,170,200,0.8)';
    c.lineWidth = 2; c.beginPath(); c.arc(x + TS / 2, y + TS / 2, TS * 0.18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke();
    c.restore();
  }
  for (let i = 0; i < L.locks.length; i++) {
    const l = L.locks[i], x = OX + l.x * TS, y = OY + l.y * TS;
    c.save();
    if (!v.lock[i]) {
      c.shadowColor = '#ffcf4a'; c.shadowBlur = TS * 0.4;
      c.fillStyle = 'rgba(255,200,70,0.18)'; c.fillRect(x + 2, y + 2, TS - 4, TS - 4);
      c.strokeStyle = '#ffd75a'; c.lineWidth = Math.max(1.5, TS * 0.06); c.strokeRect(x + 2, y + 2, TS - 4, TS - 4);
      c.fillStyle = '#ffd75a'; c.beginPath(); c.arc(x + TS / 2, y + TS * 0.44, TS * 0.1, 0, Math.PI * 2); c.fill();
      c.fillRect(x + TS / 2 - TS * 0.04, y + TS * 0.46, TS * 0.08, TS * 0.2);
    } else { c.strokeStyle = 'rgba(255,215,90,0.25)'; c.setLineDash([3, 4]); c.strokeRect(x + 3, y + 3, TS - 6, TS - 6); }
    c.restore();
  }
  { // exit portal
    const x = sx(L.exit.x), y = sy(L.exit.y);
    c.save();
    const g = c.createRadialGradient(x, y, 0, x, y, TS * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(150,240,255,0.55)'); g.addColorStop(1, 'rgba(80,120,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, TS * 0.6, 0, Math.PI * 2); c.fill();
    c.shadowColor = '#9ff'; c.shadowBlur = 12; c.lineWidth = Math.max(1.5, TS * 0.05);
    for (let k = 0; k < 3; k++) {
      const a = time * (1.4 + k * 0.5) * (k % 2 ? -1 : 1) + k * 2;
      c.strokeStyle = `rgba(${180 + k * 25},${240 - k * 20},255,${0.8 - k * 0.15})`;
      c.beginPath(); c.arc(x, y, TS * (0.26 + k * 0.08), a, a + Math.PI * 1.1); c.stroke();
    }
    c.restore();
  }
  for (const cr of v.crates) {
    const x = sx(cr.x), y = sy(cr.y), s = TS * 0.78;
    c.save();
    c.shadowColor = 'rgba(255,170,80,0.6)'; c.shadowBlur = TS * 0.25;
    c.fillStyle = '#3a2614'; rr(c, x - s / 2, y - s / 2, s, s, TS * 0.1); c.fill();
    c.shadowBlur = 0; c.strokeStyle = '#ffb35c'; c.lineWidth = Math.max(1.5, TS * 0.06); c.stroke();
    c.strokeStyle = 'rgba(255,179,92,0.55)'; c.lineWidth = Math.max(1, TS * 0.04); c.beginPath();
    c.moveTo(x - s * 0.32, y - s * 0.32); c.lineTo(x + s * 0.32, y + s * 0.32); c.moveTo(x + s * 0.32, y - s * 0.32); c.lineTo(x - s * 0.32, y + s * 0.32); c.stroke();
    c.restore();
  }
  v.keys.forEach(k => { if (k && !k.held) drawKey(c, k.x, k.y, k.h, time); });
  for (const b of v.beams) {
    const x0 = sx(b.ox) + DX[b.dir] * TS * 0.46, y0 = sy(b.oy) + DY[b.dir] * TS * 0.46;
    const back = b.hit === 'wall' ? 0.5 : 0.32;
    const x1 = sx(b.hx) - DX[b.dir] * TS * back, y1 = sy(b.hy) - DY[b.dir] * TS * back;
    const fl = 0.75 + 0.25 * Math.sin(time * 40 + b.ox);
    c.save(); c.lineCap = 'round';
    c.shadowColor = '#ff2850'; c.shadowBlur = TS * 0.6;
    c.strokeStyle = `rgba(255,40,80,${0.35 * fl})`; c.lineWidth = TS * 0.28; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = `rgba(255,90,120,${0.9 * fl})`; c.lineWidth = TS * 0.1; c.stroke();
    c.shadowBlur = 0; c.strokeStyle = 'rgba(255,235,240,0.95)'; c.lineWidth = Math.max(1, TS * 0.035); c.stroke();
    if (b.hit !== 'wall') {
      const g = c.createRadialGradient(x1, y1, 0, x1, y1, TS * 0.35);
      g.addColorStop(0, 'rgba(255,220,230,0.9)'); g.addColorStop(1, 'rgba(255,40,80,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x1, y1, TS * 0.35, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  const R = TS * 0.32;
  v.agents.forEach((a, i) => {
    if (!a.echo) return;
    const hue = ECHO_HUES[a.id % ECHO_HUES.length];
    const tr = opts.trails && opts.trails[i];
    if (tr) for (let k = 0; k < tr.length; k++) {
      const f = k / tr.length;
      c.fillStyle = `hsla(${hue},100%,65%,${0.13 * f})`;
      c.beginPath(); c.arc(sx(tr[k].x), sy(tr[k].y), R * (0.35 + 0.55 * f), 0, Math.PI * 2); c.fill();
    }
    let al = a.frozen ? 0.75 : 1, jit = 0;
    if (opts.paradoxWho === i) { al *= 0.4 + 0.6 * Math.random(); jit = (Math.random() - 0.5) * TS * 0.3; }
    drawOrb(c, sx(a.x) + jit, sy(a.y), R, hue, 0.9 * al, false, String(a.id + 1));
  });
  const live = v.agents[v.agents.length - 1];
  if (live && !opts.hideLive) {
    if (opts.liveTrail) {
      const tr = opts.liveTrail;
      for (let k = 0; k < tr.length; k++) { const f = k / tr.length; c.fillStyle = `rgba(170,240,255,${0.08 * f})`; c.beginPath(); c.arc(sx(tr[k].x), sy(tr[k].y), R * 0.6 * f, 0, Math.PI * 2); c.fill(); }
    }
    drawOrb(c, sx(live.x), sy(live.y), R * (opts.liveScale != null ? opts.liveScale : 1), 0, 1, true, null, live.face);
  }
  v.keys.forEach(k => { if (k && k.held) drawKey(c, k.x, k.y, k.h, time); });
  for (const p of G.particles) {
    c.globalAlpha = 1 - p.life / p.max; c.fillStyle = p.color;
    c.beginPath(); c.arc(sx(p.x), sy(p.y), TS * p.size, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
}

function drawRing(c, v) {
  const L = G.L, live = v.agents[v.agents.length - 1];
  const left = L.loopTicks - v.t, frac = Math.max(0, left / L.loopTicks);
  const x = sx(live.x), y = sy(live.y), r = TS * 0.6;
  const urgent = left <= 120;
  const pulse = urgent ? 0.5 + 0.5 * Math.sin(realTime * 14) : 0;
  c.save();
  c.lineWidth = Math.max(2, TS * 0.07) + pulse * 2.5;
  c.strokeStyle = 'rgba(160,220,255,0.12)'; c.beginPath(); c.arc(x, y, r + pulse * 2, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = urgent ? `rgba(255,${90 + 80 * (1 - pulse)},120,${0.75 + 0.25 * pulse})` : 'rgba(170,240,255,0.85)';
  c.shadowColor = c.strokeStyle; c.shadowBlur = urgent ? 14 + pulse * 12 : 8;
  c.lineCap = 'round';
  c.beginPath(); c.arc(x, y, r + pulse * 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- rendering: play screen + effects
function drawPlay(alpha) {
  const W = G.W;
  let v;
  bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, buf.width, buf.height);
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bgDrift(bctx);
  if (G.phase === 'rewind') {
    // play the loop we just lived backwards, fast, easing in and out
    const rw = G.rw, n = rw.frames.length;
    const p = rw.t / rw.dur, e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const idx = Math.max(0, Math.round((n - 1) * (1 - e)));
    v = rw.frames[idx] || viewOf(W, 0);
    drawRoom(bctx, v, {});
    bctx.save();
    for (let k = 1; k <= 5; k++) {
      const f = rw.frames[Math.min(n - 1, idx + k * 4)];
      if (!f) break;
      bctx.globalAlpha = 0.3 / k;
      f.agents.forEach(a => drawOrb(bctx, sx(a.x), sy(a.y), TS * 0.3, a.echo ? ECHO_HUES[a.id % 8] : 190, 1, false, ''));
    }
    bctx.restore();
  } else {
    v = viewOf(W, G.phase === 'live' && !G.paused ? alpha : 0);
    const opts = { trails: G.trails, liveTrail: G.trails[G.trails.length - 1] };
    if (G.phase === 'paradox') opts.paradoxWho = G.px.who;
    if (G.phase === 'win') { opts.liveScale = Math.max(0, 1 - G.winT / 30); if (G.winT > 30) opts.hideLive = true; }
    drawRoom(bctx, v, opts);
    if (G.phase === 'live' || G.phase === 'paradox') drawRing(bctx, v);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const shx = G.shake > 0.5 ? (Math.random() - 0.5) * G.shake * dpr : 0, shy = G.shake > 0.5 ? (Math.random() - 0.5) * G.shake * dpr : 0;
  if (G.phase === 'paradox') composeParadox(shx, shy);
  else if (G.phase === 'rewind') composeRewind();
  else ctx.drawImage(buf, shx, shy);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawHUD(v);
  if (G.phase === 'paradox') drawParadoxText();
  if (G.phase === 'rewind') drawRewindIcon();
  if (G.phase === 'win' && G.winT > 40) drawWinPanel();
  if (G.paused) drawPause();
}
function composeRewind() {
  const p = G.rw.t / G.rw.dur, k = Math.sin(Math.PI * p);
  const Wd = buf.width, Hd = buf.height;
  ctx.drawImage(buf, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.2 * k; ctx.drawImage(buf, -12 * dpr * k, 0); ctx.drawImage(buf, 12 * dpr * k, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 6; i++) {
    const y = ((realTime * 900 * (i + 1) * 0.37 + i * 211) % Hd) | 0, h = (6 + i * 5) * dpr;
    const off = Math.sin(realTime * 50 + i) * 26 * k * dpr;
    ctx.drawImage(buf, 0, y, Wd, h, off, y, Wd, h);
  }
  ctx.fillStyle = `rgba(70,180,255,${0.1 * k})`; ctx.fillRect(0, 0, Wd, Hd);
  ctx.fillStyle = `rgba(0,0,0,${0.2 * k})`;
  for (let y = 0; y < Hd; y += 4 * dpr) ctx.fillRect(0, y, Wd, dpr);
}
function composeParadox(shx, shy) {
  const t = G.px.t, Wd = buf.width, Hd = buf.height;
  const k = t < 8 ? 1 : Math.max(0.15, 1 - (t - 8) / 70);
  const split = (6 + 22 * k) * dpr * (0.6 + Math.random() * 0.6);
  // RGB split: isolate each channel of the scene and add them back offset
  fxctx.setTransform(1, 0, 0, 1, 0, 0); fxctx.globalCompositeOperation = 'source-over';
  fxctx.fillStyle = '#000'; fxctx.fillRect(0, 0, Wd, Hd);
  fxctx.globalCompositeOperation = 'lighter';
  for (const [col, dx, dy] of [['#ff0000', -split, 0], ['#00ff00', 0, split * 0.25], ['#0000ff', split, 0]]) {
    tmpctx.setTransform(1, 0, 0, 1, 0, 0); tmpctx.globalCompositeOperation = 'source-over';
    tmpctx.drawImage(buf, 0, 0);
    tmpctx.globalCompositeOperation = 'multiply'; tmpctx.fillStyle = col; tmpctx.fillRect(0, 0, Wd, Hd);
    fxctx.drawImage(tmpc, dx + shx, dy + shy);
  }
  fxctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(fxc, 0, 0);
  // screen tears
  const tears = 4 + Math.floor(10 * k);
  for (let i = 0; i < tears; i++) {
    const y = Math.random() * Hd, h = (4 + Math.random() * 40 * k) * dpr, off = (Math.random() - 0.5) * 120 * k * dpr;
    ctx.drawImage(fxc, 0, y, Wd, h, off, y, Wd, h);
  }
  if (t < 10) {
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = `rgba(255,255,255,${1 - t / 10})`; ctx.fillRect(0, 0, Wd, Hd);
    ctx.globalCompositeOperation = 'source-over';
  }
  // fracture lines from the point of contact
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = sx(G.px.x), cy = sy(G.px.y);
  ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.85 * k})`; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.lineWidth = 1.5;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 11; i++) {
    let a = rnd() * Math.PI * 2, x = cx, y = cy;
    const len = Math.min(1, t / 14) * (TS * 3 + rnd() * TS * 8);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let d = 0; d < len; d += TS * 0.4) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * TS * 0.4; y += Math.sin(a) * TS * 0.4; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
function setLS(c, px) { if ('letterSpacing' in c) c.letterSpacing = px + 'px'; }
function drawParadoxText() {
  const t = G.px.t, a = Math.min(1, t / 6) * (t > 64 ? Math.max(0, 1 - (t - 64) / 16) : 1);
  const size = Math.min(VW * 0.12, 110);
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${size}px ${FONT}`; setLS(ctx, size * 0.12);
  const y = VH * 0.42, j = () => (Math.random() - 0.5) * 10;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,0,60,${0.8 * a})`; ctx.fillText('PARADOX', VW / 2 - 6 + j(), y + j() * 0.3);
  ctx.fillStyle = `rgba(0,220,255,${0.8 * a})`; ctx.fillText('PARADOX', VW / 2 + 6 + j(), y + j() * 0.3);
  ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`; ctx.fillText('PARADOX', VW / 2, y);
  ctx.globalCompositeOperation = 'source-over';
  setLS(ctx, 0.5);
  ctx.font = `500 ${Math.max(14, size * 0.19)}px ${FONT}`; ctx.fillStyle = `rgba(230,240,255,${0.9 * a})`;
  const n = G.px.who + 1;
  const sub = G.px.reason === 'touch' ? `You touched echo ${n}. The timeline fractures.` : `Echo ${n} can no longer do what it did. The timeline fractures.`;
  if (TC.on) {
    const wl = wrapLines(ctx, sub, VW - 24, Math.max(14, size * 0.19), 500, 2);
    wl.lines.forEach((ln, i) => ctx.fillText(ln, VW / 2, y + size * 0.75 + i * (wl.size + 5)));
  } else ctx.fillText(sub, VW / 2, y + size * 0.75);
  ctx.restore();
}
function drawRewindIcon() {
  const p = G.rw.t / G.rw.dur;
  ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * p) * (0.6 + 0.4 * Math.sin(realTime * 20));
  ctx.fillStyle = '#9fe8ff'; ctx.shadowColor = '#7fe4ff'; ctx.shadowBlur = 14;
  const s = Math.max(12, TS * 0.45), x = OX + G.L.w * TS - TS * 0.6, y = OY + TS * 0.55;
  ctx.beginPath();
  for (let k = 0; k < 2; k++) { const bx = x - k * s; ctx.moveTo(bx, y); ctx.lineTo(bx - s, y + s / 2); ctx.lineTo(bx, y + s); ctx.closePath(); }
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- HUD + overlays
function drawStar(c, x, y, r, filled, col) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  c.closePath();
  if (filled) { c.fillStyle = col || '#ffd75a'; c.fill(); } else { c.strokeStyle = 'rgba(255,215,90,0.35)'; c.lineWidth = 1.2; c.stroke(); }
}
// wrap text into at most maxLines lines of width w (shrinks the font if needed)
function wrapLines(c, text, w, size, weight, maxLines) {
  for (let sz = size; sz >= 9; sz--) {
    c.font = `${weight} ${sz}px ${FONT}`;
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (c.measureText(t).width > w && cur) { lines.push(cur); cur = wd; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines || sz === 9) return { lines, size: sz };
  }
}
function fitFont(c, text, w, size, weight, min) {
  let sz = size;
  for (; sz > (min || 9); sz--) { c.font = `${weight} ${sz}px ${FONT}`; if (c.measureText(text).width <= w) break; }
  c.font = `${weight} ${sz}px ${FONT}`;
  return sz;
}
function drawHUDTouch(v) {
  const L = G.L, rx = OX + L.w * TS, rw = L.w * TS, top = OY - 10;
  ctx.save(); ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left'; setLS(ctx, 2);
  ctx.fillStyle = 'rgba(160,190,255,0.65)'; ctx.font = `600 10px ${FONT}`;
  ctx.fillText('ROOM ' + String(G.levelIdx + 1).padStart(2, '0') + '/' + LEVELS.length + '  \u00b7  LOOP ' + G.loopNo, OX, top - 24);
  const left = Math.max(0, (L.loopTicks - v.t) / TPS), urgent = left <= 2 && G.phase === 'live';
  ctx.textAlign = 'right'; setLS(ctx, 1); ctx.font = `300 20px ${FONT}`;
  const timer = left.toFixed(1) + 's', tw = ctx.measureText(timer).width;
  ctx.fillStyle = urgent ? `rgba(255,${130 + 60 * Math.sin(realTime * 14)},150,1)` : '#e8f3ff';
  ctx.fillText(timer, rx, top);
  ctx.textAlign = 'left'; setLS(ctx, 2); ctx.fillStyle = '#e8f3ff';
  fitFont(ctx, L.name.toUpperCase(), rw - tw - 14, 18, 300, 10);
  ctx.fillText(L.name.toUpperCase(), OX, top);
  // echo slots + stars, top right
  const n = G.echoes.length, slots = L.maxEchoes, r = 5, st = starsFor(n, L.par);
  for (let i = 0; i < 3; i++) drawStar(ctx, rx - 5 - (2 - i) * 13, top - 28, 5.5, i < st);
  for (let i = 0; i < slots; i++) {
    const x = rx - 48 - (slots - 1 - i) * (r * 2 + 3) - r, y = top - 28;
    if (i < n) drawOrb(ctx, x, y, r, ECHO_HUES[i % 8], 1, false, '');
    else { ctx.strokeStyle = i < L.par ? 'rgba(200,220,255,0.55)' : 'rgba(200,220,255,0.18)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
  const def = LEVELS[G.levelIdx], by = OY + L.h * TS + 17, hint = hintVisible();
  const text = hint ? 'HINT \u00b7 ' + tt(def.hint) : tt(def.intro);
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; setLS(ctx, 0.3);
  const wl = wrapLines(ctx, text, Math.max(rw, Math.min(VW - 16, rw + 40)), 12.5, hint ? 500 : 400, 2);
  ctx.fillStyle = hint ? 'rgba(255,215,120,0.95)' : 'rgba(200,220,255,0.85)';
  wl.lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, OX + rw / 2, by + i * (wl.size + 3)));
  ctx.restore();
}
function drawHUD(v) {
  if (TC.on) { drawHUDTouch(v); return; }
  const L = G.L, top = OY - 16, rx = OX + L.w * TS;
  ctx.save(); ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left'; setLS(ctx, 3);
  ctx.fillStyle = 'rgba(160,190,255,0.6)'; ctx.font = `600 12px ${FONT}`;
  ctx.fillText('ROOM ' + String(G.levelIdx + 1).padStart(2, '0') + ' / ' + LEVELS.length, OX, top - 26);
  ctx.fillStyle = '#e8f3ff'; ctx.font = `300 22px ${FONT}`;
  ctx.fillText(L.name.toUpperCase(), OX, top);
  ctx.textAlign = 'center';
  const left = Math.max(0, (L.loopTicks - v.t) / TPS);
  ctx.fillStyle = 'rgba(160,190,255,0.6)'; ctx.font = `600 12px ${FONT}`;
  ctx.fillText('LOOP ' + G.loopNo, VW / 2, top - 26);
  const urgent = left <= 2 && G.phase === 'live';
  ctx.fillStyle = urgent ? `rgba(255,${130 + 60 * Math.sin(realTime * 14)},150,1)` : '#e8f3ff';
  ctx.font = `300 22px ${FONT}`; setLS(ctx, 1);
  ctx.fillText(left.toFixed(1) + 's', VW / 2, top);
  ctx.textAlign = 'right'; setLS(ctx, 3);
  ctx.fillStyle = 'rgba(160,190,255,0.6)'; ctx.font = `600 12px ${FONT}`;
  ctx.fillText('ECHOES ' + G.echoes.length + '/' + L.maxEchoes + '  ·  PAR ' + L.par, rx, top - 26);
  const n = G.echoes.length, slots = L.maxEchoes, r = 7;
  for (let i = 0; i < slots; i++) {
    const x = rx - 70 - (slots - 1 - i) * (r * 2 + 6) - r, y = top - 7;
    if (i < n) drawOrb(ctx, x, y, r, ECHO_HUES[i % 8], 1, false, '');
    else { ctx.strokeStyle = i < L.par ? 'rgba(200,220,255,0.5)' : 'rgba(200,220,255,0.16)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
  }
  const st = starsFor(n, L.par);
  for (let i = 0; i < 3; i++) drawStar(ctx, rx - 44 + i * 18, top - 7, 7, i < st);
  ctx.restore();
  const by = OY + L.h * TS + 32, def = LEVELS[G.levelIdx];
  ctx.save(); ctx.textAlign = 'center'; setLS(ctx, 0.5);
  if (hintVisible()) { ctx.font = `500 15px ${FONT}`; ctx.fillStyle = 'rgba(255,215,120,0.95)'; ctx.fillText('HINT  ·  ' + def.hint, VW / 2, by); }
  else { ctx.font = `400 15px ${FONT}`; ctx.fillStyle = 'rgba(200,220,255,0.82)'; ctx.fillText(def.intro, VW / 2, by); }
  ctx.font = `${G.levelIdx === 0 ? 600 : 500} 12px ${FONT}`; setLS(ctx, 1.5);
  ctx.fillStyle = G.levelIdx === 0 ? `rgba(170,230,255,${0.7 + 0.3 * Math.sin(realTime * 3)})` : 'rgba(150,170,220,0.45)';
  ctx.fillText('ARROWS / WASD  MOVE   ·   R  REWIND   ·   U  UNDO ECHO   ·   E  TOSS KEY   ·   ESC  PAUSE', VW / 2, by + 26);
  ctx.restore();
}
function drawPanel(w, h) {
  const x = (VW - w) / 2, y = (VH - h) / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(3,4,10,0.55)'; ctx.fillRect(0, 0, VW, VH);
  ctx.shadowColor = 'rgba(100,160,255,0.5)'; ctx.shadowBlur = 40;
  ctx.fillStyle = 'rgba(12,16,34,0.95)'; rr(ctx, x, y, w, h, 18); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(130,170,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  return { x, y };
}
function drawWinPanel() {
  const a = Math.min(1, (G.winT - 40) / 15);
  ctx.save(); ctx.globalAlpha = a;
  const pw = TC.on ? Math.min(460, VW - 24) : 460, ph = TC.on ? Math.min(300, VH - 20) : 300;
  const p = drawPanel(pw, ph);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(160,190,255,0.7)'; ctx.font = `600 12px ${FONT}`; setLS(ctx, 4);
  ctx.fillText('ROOM ' + (G.levelIdx + 1) + ' CLEARED', VW / 2, p.y + 46);
  ctx.fillStyle = '#eef6ff'; ctx.font = `200 34px ${FONT}`;
  ctx.fillText(G.L.name.toUpperCase(), VW / 2, p.y + 88);
  for (let i = 0; i < 3; i++) {
    const t = G.winT - 50 - i * 12, s = t < 0 ? 0 : Math.min(1, t / 8) * (1 + 0.25 * Math.max(0, 1 - t / 16));
    const x = VW / 2 + (i - 1) * 64, y = p.y + 150;
    drawStar(ctx, x, y, 24, false);
    if (i < G.winStars && s > 0) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.shadowColor = '#ffcf4a'; ctx.shadowBlur = 20; drawStar(ctx, 0, 0, 24, true); ctx.restore(); }
  }
  setLS(ctx, 1); ctx.font = `400 15px ${FONT}`; ctx.fillStyle = 'rgba(210,225,255,0.85)';
  let msg = 'Echoes used ' + G.winEchoes + '   ·   Par ' + G.L.par;
  if (G.winStars < 3) msg += '   ·   match par for three stars';
  if (TC.on) {
    fitFont(ctx, msg, pw - 28, 15, 400, 10);
    ctx.fillText(msg, VW / 2, p.y + ph * 0.66);
    const labels = [G.levelIdx + 1 < LEVELS.length ? 'NEXT ROOM' : 'CONTINUE', 'REPLAY', 'ROOMS'], codes = ['Enter', 'KeyR', 'Escape'];
    const bw = (pw - 28 - 16) / 3, bh = 44, byy = p.y + ph - bh - 16;
    TC.winBtns = labels.map((lb, i) => ({ x: p.x + 14 + i * (bw + 8), y: byy, w: bw, h: bh, code: codes[i] }));
    TC.winBtns.forEach((b, i) => {
      ctx.fillStyle = i === 0 ? 'rgba(80,170,255,0.28)' : 'rgba(120,150,255,0.1)'; rr(ctx, b.x, b.y, b.w, b.h, 12); ctx.fill();
      ctx.strokeStyle = i === 0 ? 'rgba(160,235,255,0.8)' : 'rgba(130,170,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = i === 0 ? '#dff8ff' : 'rgba(200,215,250,0.85)'; setLS(ctx, 1.5);
      fitFont(ctx, labels[i], b.w - 10, 13, 600, 9); ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], b.x + b.w / 2, b.y + b.h / 2); ctx.textBaseline = 'alphabetic';
    });
    ctx.restore();
    return;
  }
  ctx.fillText(msg, VW / 2, p.y + 212);
  ctx.font = `600 12px ${FONT}`; setLS(ctx, 2.5);
  ctx.fillStyle = 'rgba(170,230,255,' + (0.6 + 0.4 * Math.sin(realTime * 4)) + ')';
  ctx.fillText((G.levelIdx + 1 < LEVELS.length ? 'ENTER  NEXT ROOM' : 'ENTER  CONTINUE') + '     R  REPLAY     ESC  ROOMS', VW / 2, p.y + 264);
  ctx.restore();
}
function pauseLayout() {
  const w = TC.on ? Math.min(440, VW - 24) : 440, h = TC.on ? Math.min(340, VH - 20) : 340;
  const x = (VW - w) / 2, y = (VH - h) / 2, step = TC.on ? Math.min(42, (h - 130) / 4 + 6) : 42;
  const first = TC.on ? Math.min(120, 40 + (h - 4 * step) / 2 + 12) : 120;
  const items = [];
  for (let i = 0; i < 4; i++) items.push({ x: x + 16, y: y + first + i * step - step * 0.62, w: w - 32, h: step, base: y + first + i * step });
  return { w, h, x, y, items, step };
}
function drawPause() {
  const PL = pauseLayout();
  const p = drawPanel(PL.w, PL.h);
  ctx.save(); ctx.textAlign = 'center';
  ctx.fillStyle = '#eef6ff'; ctx.font = `200 34px ${FONT}`; setLS(ctx, 8);
  ctx.fillText('PAUSED', VW / 2, p.y + (TC.on ? Math.min(62, PL.items[0].y - 14) : 62));
  const items = ['Resume', 'Restart room (clear echoes)', 'Room select', 'Title screen'];
  setLS(ctx, 1);
  items.forEach((s, i) => {
    const y = PL.items[i].base, sel = i === G.pauseSel;
    if (TC.on) { const it = PL.items[i]; ctx.fillStyle = sel ? 'rgba(90,160,255,0.16)' : 'rgba(120,150,255,0.06)'; rr(ctx, it.x, it.y + 3, it.w, it.h - 6, 10); ctx.fill(); }
    ctx.font = `${sel ? 600 : 400} 17px ${FONT}`;
    ctx.fillStyle = sel ? '#bff3ff' : 'rgba(190,205,240,0.6)';
    if (sel) { ctx.shadowColor = '#7fe4ff'; ctx.shadowBlur = 12; }
    ctx.fillText(sel ? '›   ' + s + '   ‹' : s, VW / 2, y); ctx.shadowBlur = 0;
  });
  ctx.font = `500 11px ${FONT}`; ctx.fillStyle = 'rgba(150,170,220,0.5)'; setLS(ctx, 2);
  if (TC.on) ctx.fillText('TAP TO CHOOSE', VW / 2, p.y + PL.h - 18);
  else ctx.fillText('UP / DOWN   ·   ENTER   ·   ESC RESUME', VW / 2, p.y + 308);
  ctx.restore();
}
function drawToast() {
  const T = G.toast; if (!T || G.screen === 'title' || G.screen === 'end') return;
  if (TC.on && G.paused) return;
  if (G.screen === 'select' && T.kind !== 'warn') return;
  const a = Math.min(1, T.t / 10) * Math.min(1, (200 - T.t) / 30);
  ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (T.kind === 'title') {
    if (G.screen !== 'play') { ctx.restore(); return; }
    ctx.font = `200 ${Math.min(48, VW * 0.06)}px ${FONT}`; setLS(ctx, 10);
    ctx.fillStyle = 'rgba(230,245,255,0.92)'; ctx.shadowColor = '#7fe4ff'; ctx.shadowBlur = 24;
    ctx.fillText(T.text, VW / 2, OY + G.L.h * TS * 0.5);
  } else {
    const y = G.screen === 'play' ? OY + TS * 0.5 + 20 : VH * 0.88;
    ctx.font = `500 15px ${FONT}`; setLS(ctx, 0.5);
    const text = tt(T.text);
    if (TC.on) fitFont(ctx, text, VW - 60, 14, 500, 10);
    const w = ctx.measureText(text).width + 44;
    ctx.fillStyle = 'rgba(8,12,28,0.88)'; rr(ctx, VW / 2 - w / 2, y - 22, w, 34, 17); ctx.fill();
    ctx.strokeStyle = T.kind === 'warn' ? 'rgba(255,160,120,0.6)' : T.kind === 'echo' ? 'rgba(140,220,255,0.55)' : 'rgba(170,190,255,0.35)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = T.kind === 'warn' ? '#ffc2a8' : '#dff4ff';
    ctx.fillText(text, VW / 2, y);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- title / select / end
function drawGhosts(c, count, t, scale) {
  for (let i = 0; i < count; i++) {
    const hue = ECHO_HUES[i % 8];
    const pos = tt => [VW * (0.5 + 0.44 * Math.sin(tt * (0.11 + i * 0.017) + i * 1.7)), VH * (0.5 + 0.4 * Math.sin(tt * (0.083 + i * 0.013) + i * 2.9))];
    for (let k = 16; k >= 1; k--) {
      const p = pos(t - k * 0.09);
      c.fillStyle = `hsla(${hue},100%,65%,${0.05 * (1 - k / 17)})`;
      c.beginPath(); c.arc(p[0], p[1], scale * (1 - k / 22), 0, Math.PI * 2); c.fill();
    }
    const p = pos(t);
    drawOrb(c, p[0], p[1], scale, hue, 0.5, false, String(i + 1));
  }
}
function drawTitle() {
  bgDrift(ctx);
  drawGhosts(ctx, 6, realTime, Math.max(12, Math.min(VW, VH) * 0.024));
  const size = TC.on ? Math.min(VW * 0.15, VH * 0.2, 168) : Math.min(VW * 0.15, 168), y = VH * (TC.on && VW > VH ? 0.3 : 0.34);
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `200 ${size}px ${FONT}`; setLS(ctx, size * 0.18);
  const cx = VW / 2 + size * 0.09;
  for (let k = 4; k >= 1; k--) {
    const off = k * 12 + Math.sin(realTime * 0.9 + k) * 6;
    ctx.fillStyle = `hsla(${ECHO_HUES[k]},100%,70%,${0.06 * (5 - k)})`;
    ctx.fillText('ECHOES', cx - off, y + k * 1.5);
  }
  ctx.shadowColor = 'rgba(140,230,255,0.9)'; ctx.shadowBlur = 50;
  ctx.fillStyle = 'rgba(235,250,255,0.96)';
  ctx.fillText('ECHOES', cx, y);
  ctx.shadowBlur = 0;
  ctx.font = `400 ${Math.max(14, size * 0.11)}px ${FONT}`; setLS(ctx, 4);
  ctx.fillStyle = 'rgba(180,205,255,0.7)';
  if (TC.on) { setLS(ctx, 1.5); fitFont(ctx, 'every loop, a little help from yourself', VW - 32, 15, 400, 10); }
  ctx.fillText('every loop, a little help from yourself', VW / 2, y + size * 0.72);
  const pa = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(realTime * 3));
  ctx.font = `600 ${Math.max(14, size * 0.12)}px ${FONT}`; setLS(ctx, 8);
  ctx.fillStyle = `rgba(190,245,255,${pa})`; ctx.shadowColor = '#7fe4ff'; ctx.shadowBlur = 18;
  if (TC.on) { setLS(ctx, 6); ctx.font = `600 16px ${FONT}`; }
  ctx.fillText(TC.on ? 'TAP TO START' : 'PRESS SPACE', VW / 2, y + (TC.on ? Math.max(size * 1.22, size * 0.72 + 40) : size * 1.22));
  ctx.shadowBlur = 0; setLS(ctx, 1);
  const list = TC.on ? TOUCH_CONTROLS : CONTROLS;
  const cy = TC.on ? Math.min(VH - TC.safe.b - 20 - list.length * 22, y + Math.max(size * 1.65, size * 0.72 + 84))
                   : Math.min(VH - 30 - CONTROLS.length * 22, y + size * 1.65);
  const mid = TC.on && VW < 480 ? VW * 0.42 : VW / 2;
  list.forEach(([k, d], i) => {
    ctx.font = `600 13px ${FONT}`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(170,230,255,0.85)';
    ctx.fillText(k, mid - 14, cy + i * 22);
    ctx.font = `400 13px ${FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(190,205,240,0.6)';
    ctx.fillText(d, mid + 14, cy + i * 22);
  });
  ctx.restore();
}
function drawSelect() {
  bgDrift(ctx);
  drawGhosts(ctx, 3, realTime * 0.6, 10);
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#eef6ff'; ctx.font = `200 ${Math.min(46, VW * 0.06)}px ${FONT}`; setLS(ctx, 12);
  ctx.shadowColor = 'rgba(140,230,255,0.7)'; ctx.shadowBlur = 24;
  const ty = TC.on && VW > VH ? TC.safe.t + 48 : VH * 0.13;
  ctx.fillText('ECHOES', VW / 2, ty);
  ctx.shadowBlur = 0; ctx.font = `600 12px ${FONT}`; setLS(ctx, 5);
  ctx.fillStyle = 'rgba(160,190,255,0.65)';
  ctx.fillText('SELECT A ROOM', VW / 2, ty + (TC.on && VW > VH ? 26 : 34));
  const rects = selectCardRects();
  rects.forEach((r, i) => {
    const locked = i >= G.save.unlocked, sel = i === G.selCursor, best = G.save.best[i] | 0;
    ctx.save();
    if (sel) { ctx.shadowColor = 'rgba(120,220,255,0.8)'; ctx.shadowBlur = 24; }
    ctx.fillStyle = locked ? 'rgba(14,16,30,0.8)' : sel ? 'rgba(24,36,70,0.95)' : 'rgba(16,22,44,0.9)';
    rr(ctx, r.x, r.y, r.w, r.h, 12); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = sel ? 'rgba(160,235,255,0.9)' : locked ? 'rgba(100,110,150,0.25)' : 'rgba(130,160,255,0.35)';
    ctx.lineWidth = sel ? 1.6 : 1; ctx.stroke();
    ctx.textAlign = 'center'; setLS(ctx, 2);
    ctx.fillStyle = locked ? 'rgba(120,130,170,0.4)' : '#e8f3ff';
    ctx.font = `200 ${Math.round(r.w * 0.3)}px ${FONT}`;
    ctx.fillText(String(i + 1).padStart(2, '0'), r.x + r.w / 2, r.y + r.h * 0.42);
    setLS(ctx, 0.5);
    ctx.font = `500 ${Math.max(9, Math.round(r.w * 0.085))}px ${FONT}`;
    if (TC.on) fitFont(ctx, locked ? 'LOCKED' : LEVELS[i].name.toUpperCase(), r.w - 8, Math.max(9, Math.round(r.w * 0.11)), 500, 7);
    ctx.fillStyle = locked ? 'rgba(120,130,170,0.4)' : 'rgba(190,210,250,0.8)';
    ctx.fillText(locked ? 'LOCKED' : LEVELS[i].name.toUpperCase(), r.x + r.w / 2, r.y + r.h * 0.62);
    if (!locked) for (let s = 0; s < 3; s++) drawStar(ctx, r.x + r.w / 2 + (s - 1) * r.w * 0.17, r.y + r.h * 0.8, r.w * 0.06, s < best);
    else {
      const lx = r.x + r.w / 2, ly = r.y + r.h * 0.8;
      ctx.strokeStyle = 'rgba(120,130,170,0.45)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(lx - 7, ly - 3, 14, 10); ctx.beginPath(); ctx.arc(lx, ly - 3, 5, Math.PI, 0); ctx.stroke();
    }
    ctx.restore();
  });
  const last = rects[rects.length - 1];
  setLS(ctx, 3); ctx.font = `600 14px ${FONT}`; ctx.fillStyle = '#ffd75a';
  const g1 = TC.on ? (VW < VH ? 40 : 24) : 48, g2 = TC.on ? (VW < VH ? 66 : 44) : 78;
  ctx.fillText('★ ' + totalStars() + ' / ' + LEVELS.length * 3, VW / 2, last.y + last.h + g1);
  const d = LEVELS[G.selCursor];
  if (d) {
    ctx.font = `400 14px ${FONT}`; setLS(ctx, 0.5); ctx.fillStyle = 'rgba(200,215,250,0.75)';
    const info = G.selCursor < G.save.unlocked ? d.name + '   ·   par ' + d.par + ' echo' + (d.par === 1 ? '' : 'es') + '   ·   ' + d.loop + '-second loop' : 'Clear room ' + G.selCursor + ' to unlock';
    if (TC.on) fitFont(ctx, info, VW - 24, 14, 400, 10);
    ctx.fillText(info, VW / 2, last.y + last.h + g2);
  }
  ctx.font = `600 11px ${FONT}`; setLS(ctx, 2.5); ctx.fillStyle = 'rgba(150,170,220,0.5)';
  if (TC.on) { if (VW < VH) ctx.fillText('TAP A ROOM TO PLAY', VW / 2, VH - TC.safe.b - 24); }
  else ctx.fillText('ARROWS CHOOSE   ·   ENTER PLAY   ·   ESC TITLE', VW / 2, VH - 30);
  ctx.restore();
}
function drawEnd() {
  bgDrift(ctx);
  drawGhosts(ctx, 8, realTime, 14);
  const a = Math.min(1, (G.endT || 0) / 60);
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `200 ${Math.min(64, VW * 0.07)}px ${FONT}`; setLS(ctx, 10);
  ctx.fillStyle = '#eef8ff'; ctx.shadowColor = '#7fe4ff'; ctx.shadowBlur = 40;
  ctx.fillText('THE LOOP CLOSES', VW / 2, VH * 0.4);
  ctx.shadowBlur = 0; ctx.font = `400 16px ${FONT}`; setLS(ctx, 2);
  ctx.fillStyle = 'rgba(200,220,255,0.8)';
  const endMsg = 'All ' + LEVELS.length + ' rooms cleared. Every one of you made it out.';
  if (TC.on) { setLS(ctx, 0.5); fitFont(ctx, endMsg, VW - 24, 16, 400, 10); }
  ctx.fillText(endMsg, VW / 2, VH * 0.4 + 50);
  ctx.fillStyle = '#ffd75a'; ctx.font = `600 18px ${FONT}`;
  ctx.fillText('★ ' + totalStars() + ' / ' + LEVELS.length * 3, VW / 2, VH * 0.4 + 92);
  ctx.font = `600 12px ${FONT}`; setLS(ctx, 4); ctx.fillStyle = 'rgba(170,230,255,0.7)';
  const endCta = (totalStars() < LEVELS.length * 3 ? 'CHASE THE MISSING STARS   ·   ' : 'A PERFECT TIMELINE   ·   ') + (TC.on ? 'TAP' : 'ENTER');
  if (TC.on) { setLS(ctx, 2); fitFont(ctx, endCta, VW - 24, 12, 600, 9); }
  ctx.fillText(endCta, VW / 2, VH * 0.4 + 140);
  ctx.restore();
}

// ---------------------------------------------------------------- boot
function boot() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  buf = document.createElement('canvas'); bctx = buf.getContext('2d');
  fxc = document.createElement('canvas'); fxctx = fxc.getContext('2d');
  tmpc = document.createElement('canvas'); tmpctx = tmpc.getContext('2d');
  loadSave();
  initTouchUI();
  TC.on = detectTouch();
  if (TC.on) document.documentElement.classList.add('touch');
  resize();
  const relayout = () => { resize(); setTimeout(resize, 250); };   // iOS reports the new size late
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', relayout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { Input.stack = []; releaseTouch(); });
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', () => { TC.swipe = null; });
  // iOS only lets audio start from a gesture: resume on the first touch end as well
  document.addEventListener('touchend', unlockAudio, { passive: true });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseTouch();
    if (document.hidden && G.screen === 'play' && G.phase === 'live') { G.paused = true; G.pauseSel = 0; }
    if (!document.hidden && AudioSys.ctx && AudioSys.ctx.state !== 'running') AudioSys.ctx.resume().catch(() => {});
  });
  if (/[?&]debug\b/.test(location.search)) window.ECHOES_DEBUG = { G, LEVELS, startLevel, TC, selectCardRects, pauseLayout, layout: () => ({ OX, OY, TS, VW, VH, dpr }) };
  requestAnimationFrame(frame);
}

// ======================================================================
//  EXPORTS / BOOT
// ======================================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LEVELS, parseLevel, createWorld, simStep, makeEcho, MOVE, TPS, ACT,
                     T_SPAWN, T_EXIT };
} else if (typeof window !== 'undefined') {
  window.addEventListener('load', boot);
}
})();
