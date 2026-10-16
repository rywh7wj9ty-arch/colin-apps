/* LUMEN rules engine: pure game logic, no DOM. Runs in the browser and in Node (unit tests).
   Coordinates: x 0..9 left->right, y 0..39 top->bottom. Rows 0..19 are hidden (above the well),
   rows 20..39 are the visible 10x20 field. Kick tables are written in the usual SRS y-up form and
   flipped when applied. */
export const COLS = 10, ROWS = 40, VISIBLE = 20, HIDDEN = ROWS - VISIBLE;
export const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
export const TYPE_ID = { I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 };
export const ID_TYPE = [null, 'I', 'J', 'L', 'O', 'S', 'T', 'Z'];

const BASE = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};
export const BOX = { I: 4, J: 3, L: 3, O: 3, S: 3, T: 3, Z: 3 };
export const SHAPES = {};
for (const t of TYPES) {
  const states = [BASE[t]];
  for (let r = 1; r < 4; r++) {
    const n = BOX[t];
    states.push(t === 'O' ? BASE.O : states[r - 1].map(([x, y]) => [n - 1 - y, x]));
  }
  SHAPES[t] = states;
}

// SRS kicks, y-up. Key = from + to.
const KICK_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICK_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
const KICK_180 = {
  '02': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  '20': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  '13': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  '31': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]],
};
export function kicksFor(type, from, to) {
  if (type === 'O') return [[0, 0]];
  const key = '' + from + to;
  if ((from + 2) % 4 === to) return KICK_180[key];
  return (type === 'I' ? KICK_I : KICK_JLSTZ)[key];
}

// T-spin corners (relative to the 3x3 box) and the two "front" corners per state
const T_CORNERS = [[0, 0], [2, 0], [0, 2], [2, 2]];
const T_FRONT = [[[0, 0], [2, 0]], [[2, 0], [2, 2]], [[0, 2], [2, 2]], [[0, 0], [0, 2]]];

// ---------- random ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return h >>> 0;
}
export function localDateStr(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
export function dailySeed(dateStr) { return hashString('lumen-daily:' + dateStr); }

export class Bag {
  constructor(rng) { this.rng = rng; this.pool = []; }
  next() {
    if (!this.pool.length) {
      const a = TYPES.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      this.pool = a;
    }
    return this.pool.shift();
  }
}

// ---------- scoring ----------
export const LINE_SCORE = [0, 100, 300, 500, 800];
export const TSPIN_SCORE = [400, 800, 1200, 1600];
export const MINI_SCORE = [100, 200, 400];
export const PC_SCORE = [0, 800, 1200, 1800, 2000];
export const PC_B2B_TETRIS = 3200;
export const COMBO_ATTACK = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

export function isDifficult(lines, spin) { return lines > 0 && (lines === 4 || spin !== 'none'); }

/** Guideline score for one lock. b2b = this clear continues a back-to-back chain. combo = combo count (0 = first clear). */
export function clearScore({ lines, spin = 'none', level = 1, b2b = false, combo = 0, pc = false }) {
  let base = spin === 'full' ? TSPIN_SCORE[lines] : spin === 'mini' ? MINI_SCORE[Math.min(lines, 2)] : LINE_SCORE[lines];
  let s = base * level;
  if (b2b && isDifficult(lines, spin)) s = Math.floor(s * 1.5);
  if (lines > 0 && combo > 0) s += 50 * combo * level;
  if (pc && lines > 0) s += (lines === 4 && b2b ? PC_B2B_TETRIS : PC_SCORE[lines]) * level;
  return s;
}
/** Lines "sent" (versus-style attack) for APM figures. */
export function attackFor({ lines, spin = 'none', b2b = false, combo = 0, pc = false }) {
  if (!lines) return 0;
  let a = spin === 'full' ? [0, 2, 4, 6][lines] : spin === 'mini' ? [0, 0, 1][Math.min(lines, 2)] : [0, 0, 1, 2, 4][lines];
  if (b2b && isDifficult(lines, spin)) a += 1;
  a += combo < COMBO_ATTACK.length ? COMBO_ATTACK[Math.max(0, combo)] : 5;
  if (pc) a += 10;
  return a;
}
export function clearName(lines, spin) {
  if (spin === 'full') return ['T-SPIN', 'T-SPIN SINGLE', 'T-SPIN DOUBLE', 'T-SPIN TRIPLE'][lines];
  if (spin === 'mini') return ['MINI T-SPIN', 'MINI T-SPIN SINGLE', 'MINI T-SPIN DOUBLE'][Math.min(lines, 2)];
  return ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'][lines];
}

// ---------- speed ----------
export function gravityMsPerRow(level) {
  const l = Math.max(1, Math.min(level, 20));
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
}
export function lockDelayFor(level, base = 500) {
  return level <= 20 ? base : Math.max(250, base - (level - 20) * 25);
}

export const MODES = {
  marathon: { id: 'marathon', name: 'Marathon', levelUp: true },
  sprint: { id: 'sprint', name: 'Sprint 40', levelUp: false, goalLines: 40 },
  ultra: { id: 'ultra', name: 'Ultra', levelUp: true, timeLimit: 120000 },
  zen: { id: 'zen', name: 'Zen', levelUp: true, maxGravityLevel: 4, noTopOut: true },
  daily: { id: 'daily', name: 'Daily', levelUp: true, timeLimit: 180000 },
};

export function emptyBoard() { return Array.from({ length: ROWS }, () => new Uint8Array(COLS)); }

export class Game {
  constructor(opts = {}) {
    this.mode = opts.mode || 'marathon';
    this.def = MODES[this.mode] || MODES.marathon;
    this.seed = opts.seed != null ? opts.seed >>> 0 : (Math.random() * 2 ** 32) >>> 0;
    this.startLevel = opts.startLevel || 1;
    this.das = opts.das ?? 133; this.arr = opts.arr ?? 10; this.sdf = opts.sdf ?? 30;
    this.baseLockDelay = opts.lockDelay ?? 500; this.moveLimit = opts.moveLimit ?? 15;
    this.board = emptyBoard();
    this.rng = mulberry32(this.seed); this.bag = new Bag(this.rng);
    this.queue = []; this.fillQueue();
    this.hold = null; this.holdUsed = false;
    this.score = 0; this.lines = 0; this.level = this.startLevel;
    this.combo = -1; this.b2b = -1; this.time = 0; this.pieces = 0;
    this.over = false; this.result = null;
    this.st = {
      single: 0, double: 0, triple: 0, tetris: 0,
      tspin: { mini0: 0, mini1: 0, mini2: 0, full0: 0, full1: 0, full2: 0, full3: 0 },
      pcs: 0, maxCombo: 0, maxB2B: 0, attack: 0, holds: 0, inputs: 0, zenResets: 0,
    };
    this.events = [];
    this.held = { left: false, right: false }; this.dasDir = 0; this.dasT = 0; this.arrT = 0;
    this.soft = false; this.gravT = 0; this.lockT = 0; this.resets = 0; this.lowest = 0;
    this.lastRot = false; this.lastKick = -1;
    this.spawn();
  }
  emit(e) { this.events.push(e); if (this.events.length > 200) this.events.shift(); }
  drainEvents() { const e = this.events; this.events = []; return e; }
  fillQueue() { while (this.queue.length < 7) this.queue.push(this.bag.next()); }
  get gravityLevel() { return this.def.maxGravityLevel ? Math.min(this.level, this.def.maxGravityLevel) : this.level; }
  get lockDelay() { return lockDelayFor(this.level, this.baseLockDelay); }

  cellsOf(p = this.cur) { return SHAPES[p.type][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy]); }
  fits(type, rot, x, y) {
    for (const [cx, cy] of SHAPES[type][rot]) {
      const bx = x + cx, by = y + cy;
      if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS) return false;
      if (this.board[by][bx]) return false;
    }
    return true;
  }
  occupied(x, y) { return x < 0 || x >= COLS || y < 0 || y >= ROWS || this.board[y][x] !== 0; }
  grounded() { const p = this.cur; return !!p && !this.fits(p.type, p.rot, p.x, p.y + 1); }
  ghostY() { const p = this.cur; let y = p.y; while (this.fits(p.type, p.rot, p.x, y + 1)) y++; return y; }

  spawn(type) {
    const t = type || this.queue.shift();
    this.fillQueue();
    this.cur = { type: t, rot: 0, x: 3, y: HIDDEN - 2 };
    this.lockT = 0; this.gravT = 0; this.resets = 0; this.lastRot = false; this.lastKick = -1;
    if (!this.fits(t, 0, 3, this.cur.y)) { this.topOut('blockout'); if (this.over) return; }
    if (this.fits(t, 0, 3, this.cur.y + 1)) this.cur.y++;
    this.lowest = this.cur.y;
    this.emit({ type: 'spawn', piece: t });
  }

  topOut(reason) {
    if (this.def.noTopOut) {
      const cells = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (this.board[y][x]) cells.push([x, y, this.board[y][x]]);
      this.board = emptyBoard(); this.st.zenResets++;
      this.combo = -1;
      this.emit({ type: 'zenclear', cells });
      if (this.cur && !this.fits(this.cur.type, this.cur.rot, this.cur.x, this.cur.y)) this.cur.y = HIDDEN - 2;
      return;
    }
    this.end('topout', reason);
  }
  end(result, reason) {
    if (this.over) return;
    this.over = true; this.result = result;
    this.emit({ type: 'end', result, reason });
  }

  // reset rules: successful move/rotate while on (or just left) the ground resets the lock timer up to moveLimit times;
  // reaching a new lowest row restores the allowance. Once the allowance is spent, touching down locks at once.
  afterShift(wasGrounded) {
    const g = this.grounded();
    if (wasGrounded || g) {
      this.resets++;
      if (this.resets <= this.moveLimit) this.lockT = 0;
    }
    if (g && this.resets > this.moveLimit) this.lock();
  }
  tryMove(dx, dy, source = 'input') {
    if (this.over || !this.cur) return false;
    const p = this.cur;
    if (!this.fits(p.type, p.rot, p.x + dx, p.y + dy)) return false;
    const wasGrounded = dx !== 0 && this.grounded();
    p.x += dx; p.y += dy;
    this.lastRot = false;
    if (dy > 0) {
      if (p.y > this.lowest) { this.lowest = p.y; this.resets = 0; this.lockT = 0; }
      if (source === 'soft') this.score += dy;
    }
    if (dx !== 0) { this.emit({ type: 'move', dx, x: p.x }); this.afterShift(wasGrounded); }
    return true;
  }
  moveLeft() { this.st.inputs++; return this.tryMove(-1, 0); }
  moveRight() { this.st.inputs++; return this.tryMove(1, 0); }
  shiftBy(dir, n) { const p = this.cur; let k = 0; for (let i = 0; i < n; i++) { if (this.cur !== p || !this.tryMove(dir, 0)) break; k++; this.st.inputs += i === 0 ? 1 : 0; } return k; }
  rotate(dir) { // 1 = CW, -1 = CCW, 2 = 180
    if (this.over || !this.cur) return false;
    this.st.inputs++;
    const p = this.cur;
    if (p.type === 'O') { this.emit({ type: 'rotate', dir, kick: 0, o: true }); return true; }
    const to = (p.rot + (dir === 2 ? 2 : dir) + 4) % 4;
    const kicks = kicksFor(p.type, p.rot, to);
    const wasGrounded = this.grounded();
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (this.fits(p.type, to, p.x + kx, p.y - ky)) {
        p.x += kx; p.y -= ky; p.rot = to;
        this.lastRot = true; this.lastKick = i;
        if (p.y > this.lowest) { this.lowest = p.y; this.resets = 0; }
        this.emit({ type: 'rotate', dir, kick: i, x: p.x });
        this.afterShift(wasGrounded);
        return true;
      }
    }
    this.emit({ type: 'rotatefail', dir });
    return false;
  }
  softDropRows(n) { // touch drag: move down up to n rows, soft-drop scoring
    let k = 0; for (let i = 0; i < n; i++) { if (!this.tryMove(0, 1, 'soft')) break; k++; }
    if (k) this.emit({ type: 'soft', rows: k });
    return k;
  }
  hardDrop() {
    if (this.over || !this.cur) return;
    this.st.inputs++;
    const p = this.cur, gy = this.ghostY(), dist = gy - p.y;
    const from = this.cellsOf();
    if (dist > 0) { p.y = gy; this.lastRot = false; }
    this.score += 2 * dist;
    this.emit({ type: 'harddrop', dist, from, to: this.cellsOf(), piece: p.type });
    this.lock();
  }
  holdPiece() {
    if (this.over || !this.cur || this.holdUsed) return false;
    this.st.inputs++; this.st.holds++;
    const t = this.cur.type;
    const prev = this.hold;
    this.hold = t; this.holdUsed = true;
    this.emit({ type: 'hold', piece: t });
    this.spawn(prev || undefined);
    return true;
  }
  pressDir(dir) { // keyboard / button: immediate move then DAS
    if (dir < 0) this.held.left = true; else this.held.right = true;
    this.dasDir = dir; this.dasT = 0; this.arrT = 0;
    dir < 0 ? this.moveLeft() : this.moveRight();
  }
  releaseDir(dir) {
    if (dir < 0) this.held.left = false; else this.held.right = false;
    if (this.dasDir === dir) {
      this.dasDir = this.held.left ? -1 : this.held.right ? 1 : 0;
      this.dasT = 0; this.arrT = 0;
    }
  }
  setSoft(on) { this.soft = on; }

  detectSpin() {
    const p = this.cur;
    if (p.type !== 'T' || !this.lastRot) return 'none';
    let n = 0;
    for (const [cx, cy] of T_CORNERS) if (this.occupied(p.x + cx, p.y + cy)) n++;
    if (n < 3) return 'none';
    const front = T_FRONT[p.rot].every(([cx, cy]) => this.occupied(p.x + cx, p.y + cy));
    if (front || this.lastKick === 4) return 'full';
    return 'mini';
  }

  lock() {
    if (this.over || !this.cur) return;
    const p = this.cur, cells = this.cellsOf(p), id = TYPE_ID[p.type];
    const spin = this.detectSpin();
    for (const [x, y] of cells) this.board[y][x] = id;
    this.pieces++;
    this.lockedThisTick = true;
    const lockOut = cells.every(([, y]) => y < HIDDEN);
    // line clears
    const rows = [];
    for (let y = 0; y < ROWS; y++) if (this.board[y].every(v => v)) rows.push(y);
    const rowCells = rows.map(y => Array.from(this.board[y]));
    if (rows.length) {
      const keep = this.board.filter((_, y) => !rows.includes(y));
      while (keep.length < ROWS) keep.unshift(new Uint8Array(COLS));
      this.board = keep;
    }
    const lines = rows.length;
    const pc = lines > 0 && this.board.every(r => r.every(v => !v));
    const difficult = isDifficult(lines, spin);
    if (lines > 0) {
      this.combo++;
      this.b2b = difficult ? this.b2b + 1 : -1;
    } else this.combo = -1;
    const b2bBonus = difficult && this.b2b >= 1;
    const gained = clearScore({ lines, spin, level: this.level, b2b: b2bBonus, combo: Math.max(0, this.combo), pc });
    const atk = attackFor({ lines, spin, b2b: b2bBonus, combo: Math.max(0, this.combo), pc });
    this.score += gained; this.st.attack += atk;
    if (spin === 'full') this.st.tspin['full' + lines]++;
    else if (spin === 'mini') this.st.tspin['mini' + Math.min(lines, 2)]++;
    else if (lines) this.st[['', 'single', 'double', 'triple', 'tetris'][lines]]++;
    if (pc) this.st.pcs++;
    if (lines) { this.st.maxCombo = Math.max(this.st.maxCombo, this.combo); this.st.maxB2B = Math.max(this.st.maxB2B, this.b2b); }
    const prevLevel = this.level;
    this.lines += lines;
    if (this.def.levelUp) this.level = Math.max(this.level, this.startLevel + Math.floor(this.lines / 10));
    this.holdUsed = false;
    this.emit({ type: 'lock', cells, piece: p.type, spin, lines });
    if (lines || spin !== 'none') this.emit({ type: 'clear', rows, rowCells, lines, spin, b2b: b2bBonus, b2bCount: this.b2b, combo: this.combo, pc, score: gained, attack: atk, name: clearName(lines, spin), difficult });
    if (this.level > prevLevel) this.emit({ type: 'levelup', level: this.level });
    this.cur = null;
    if (lockOut) { this.topOut('lockout'); if (this.over) return; }
    if (this.def.goalLines && this.lines >= this.def.goalLines) { this.end('complete'); return; }
    this.spawn();
  }

  update(dt) {
    if (this.over || !this.cur) return;
    this.lockedThisTick = false;
    this.time += dt;
    if (this.def.timeLimit && this.time >= this.def.timeLimit) { this.time = this.def.timeLimit; this.end('timeup'); return; }
    // DAS / ARR
    if (this.dasDir) {
      this.dasT += dt;
      if (this.dasT >= this.das) {
        if (this.arr <= 0) { while (this.cur && !this.lockedThisTick && this.tryMove(this.dasDir, 0)); }
        else {
          this.arrT += dt;
          while (this.arrT >= this.arr && this.cur && !this.lockedThisTick) { this.arrT -= this.arr; if (!this.tryMove(this.dasDir, 0)) { this.arrT = 0; break; } }
        }
      }
    }
    if (!this.cur || this.lockedThisTick || this.noGravity) return; // noGravity: debug/test hook only
    // gravity (+ soft drop)
    const g = gravityMsPerRow(this.gravityLevel);
    let ms = g;
    let softSrc = false;
    if (this.soft) {
      if (this.sdf === Infinity || this.sdf >= 1000) { const k = this.softDropRows(ROWS); if (k) this.gravT = 0; ms = Infinity; }
      else { ms = g / Math.max(1, this.sdf); softSrc = true; }
    }
    if (ms !== Infinity) {
      this.gravT += dt;
      let guard = 0;
      while (this.gravT >= ms && guard++ < ROWS) {
        this.gravT -= ms;
        if (!this.tryMove(0, 1, softSrc ? 'soft' : 'gravity')) { this.gravT = 0; break; }
      }
      if (guard >= ROWS) this.gravT = 0;
    }
    if (!this.cur) return;
    // lock delay
    if (this.grounded()) {
      if (this.resets > this.moveLimit) { this.lock(); return; }
      this.lockT += dt;
      if (this.lockT >= this.lockDelay) this.lock();
    } else this.lockT = 0;
  }

  summary() {
    const t = Math.max(1, this.time);
    return {
      mode: this.mode, score: this.score, lines: this.lines, level: this.level, timeMs: Math.round(this.time),
      pieces: this.pieces, pps: this.pieces / (t / 1000), apm: this.st.attack / (t / 60000), attack: this.st.attack,
      clears: { single: this.st.single, double: this.st.double, triple: this.st.triple, tetris: this.st.tetris },
      tspin: { ...this.st.tspin }, pcs: this.st.pcs, maxCombo: Math.max(0, this.st.maxCombo), maxB2B: Math.max(0, this.st.maxB2B),
      result: this.result, completed: this.mode === 'sprint' ? this.result === 'complete' : true,
      holds: this.st.holds, inputs: this.st.inputs, zenResets: this.st.zenResets, seed: this.seed,
    };
  }

  // ---- debug helpers (tests / ?debug) ----
  /** rows: array of strings for the bottom rows, top to bottom; '.' empty, any other char filled (piece letter or '#'). */
  setBoard(rows) {
    this.board = emptyBoard();
    const off = ROWS - rows.length;
    rows.forEach((r, i) => { for (let x = 0; x < COLS; x++) { const c = r[x]; if (c && c !== '.' && c !== ' ') this.board[off + i][x] = TYPE_ID[c] || TYPE_ID.Z; } });
  }
  setPiece(type, rot = 0, x = 3, y = HIDDEN - 1) {
    this.cur = { type, rot, x, y }; this.lowest = y; this.resets = 0; this.lockT = 0; this.lastRot = false; this.lastKick = -1;
  }
  setQueue(types) { this.queue = types.slice(); this.fillQueue(); }
}
