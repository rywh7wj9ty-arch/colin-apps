/* STARFALL — pure game logic (no DOM, no WebGL).
 * Works as a classic browser script (window.StarfallLogic) and as a Node module (require).
 * - buildGoldberg(n): hex/pent Goldberg-polyhedron board = dual of a frequency-n geodesic icosphere.
 *   10n^2+2 cells: exactly 12 pentagons (5 neighbours), the rest hexagons (6 neighbours).
 * - Game: mines, safe first click (cell + all its neighbours mine-free), BFS flood fill with depths
 *   (used for the ripple animation), chording, flags, win/loss detection, Zen shields.
 * - solve / generateMines: logic-only solver and no-guess board generation.
 * - dailyPlan / dailyGame: date-seeded Daily Planet. recordGame: stats, streaks and achievements.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StarfallLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  const PHI = (1 + Math.sqrt(5)) / 2;
  const ICO_V = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]].map(norm);
  const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

  /** Build the Goldberg board. Returns {count, centers: Float32Array(3N), neighbors: number[][], corners: number[][][], radius: Float32Array(N)} */
  function buildGoldberg(n) {
    n = Math.max(1, n | 0);
    const verts = [];
    const keyToIdx = new Map();
    // Canonical point for barycentric weights over icosahedron vertex ids: sum terms in sorted id order so
    // shared edge points computed from different faces are bit-identical (exact dedupe, no epsilon).
    function point(ids, ws) {
      const terms = [];
      for (let k = 0; k < 3; k++) if (ws[k] !== 0) terms.push([ids[k], ws[k]]);
      terms.sort((a, b) => a[0] - b[0]);
      const key = terms.map(t => t[0] + ':' + t[1]).join('|');
      let idx = keyToIdx.get(key);
      if (idx !== undefined) return idx;
      let p = [0, 0, 0];
      for (const [id, w] of terms) { const v = ICO_V[id]; p[0] += v[0] * w / n; p[1] += v[1] * w / n; p[2] += v[2] * w / n; }
      p = norm(p);
      idx = verts.length; verts.push(p); keyToIdx.set(key, idx);
      return idx;
    }
    const tris = [];
    for (const f of ICO_F) {
      const grid = [];
      for (let i = 0; i <= n; i++) {
        grid[i] = [];
        for (let j = 0; j <= n - i; j++) grid[i][j] = point(f, [n - i - j, i, j]);
      }
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n - i; j++) {
          tris.push([grid[i][j], grid[i + 1][j], grid[i][j + 1]]);
          if (i + j < n - 1) tris.push([grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]);
        }
      }
    }
    const N = verts.length;
    const nbSets = Array.from({ length: N }, () => new Set());
    const vTris = Array.from({ length: N }, () => []);
    tris.forEach((t, ti) => {
      for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3];
        nbSets[a].add(b); nbSets[b].add(a);
        vTris[a].push(ti);
      }
    });
    const centroids = tris.map(t => norm([
      verts[t[0]][0] + verts[t[1]][0] + verts[t[2]][0],
      verts[t[0]][1] + verts[t[1]][1] + verts[t[2]][1],
      verts[t[0]][2] + verts[t[1]][2] + verts[t[2]][2]]));
    const centers = new Float32Array(N * 3);
    const radius = new Float32Array(N);
    const corners = [];
    const neighbors = [];
    for (let v = 0; v < N; v++) {
      const c = verts[v];
      centers[v * 3] = c[0]; centers[v * 3 + 1] = c[1]; centers[v * 3 + 2] = c[2];
      const ref = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const t1 = norm(cross(ref, c)), t2 = cross(c, t1);
      const ang = p => Math.atan2(dot(p, t2), dot(p, t1));
      const cs = vTris[v].map(ti => centroids[ti]).sort((a, b) => ang(a) - ang(b));
      corners.push(cs);
      let r = 0; for (const p of cs) r += Math.acos(Math.min(1, dot(p, c)));
      radius[v] = r / cs.length;
      neighbors.push([...nbSets[v]].sort((a, b) => ang(verts[a]) - ang(verts[b])));
    }
    return { n, count: N, centers, neighbors, corners, radius };
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const HIDDEN = 0, REVEALED = 1;

  function computeAdj(board, mine) {
    const N = board.count, adj = new Uint8Array(N), nb = board.neighbors;
    for (let i = 0; i < N; i++) { let c = 0; const a = nb[i]; for (let k = 0; k < a.length; k++) c += mine[a[k]]; adj[i] = c; }
    return adj;
  }

  /* ------------------------------------------------------------------ logic solver
   * Plays a board the way a careful human would, using only what is visible:
   *  1. single-cell rules: a number whose remaining mines are 0 opens all its hidden neighbours;
   *     one whose remaining mines equal its hidden neighbours flags them all;
   *  2. pair / subset reasoning between two overlapping numbers (bounds on the shared cells);
   *  3. the global mine count (all remaining hidden cells are mines, or none are).
   * It only learns about a cell through probe(c), which returns that cell's number (or -1 for a mine).
   * A sound solver never probes a mine; the test suite checks that across hundreds of boards.
   * Returns { solved, revealed, knownMines, known: Int8Array(0 unknown, 1 open, 2 mine), order }.
   */
  function solve(board, mineCount, start, probe) {
    const N = board.count, nb = board.neighbors;
    const K = new Int8Array(N), num = new Int8Array(N).fill(-1);
    const safeTotal = N - mineCount;
    let revealed = 0, knownMines = 0;
    const dirty = [], inDirty = new Uint8Array(N), order = [];
    const pushDirty = c => { if (!inDirty[c] && K[c] === 1 && num[c] > 0) { inDirty[c] = 1; dirty.push(c); } };
    function open(c) {
      const stack = [c];
      while (stack.length) {
        const x = stack.pop(); if (K[x] !== 0) continue;
        const v = probe(x);
        if (v < 0) throw new Error('solver probed a mine at ' + x);
        K[x] = 1; num[x] = v; revealed++; order.push(x);
        pushDirty(x);
        for (const y of nb[x]) { if (K[y] === 1) pushDirty(y); else if (v === 0 && K[y] === 0) stack.push(y); }
      }
    }
    function markMine(c) { if (K[c] !== 0) return; K[c] = 2; knownMines++; for (const y of nb[c]) if (K[y] === 1) pushDirty(y); }
    function singles() {
      let did = false;
      while (dirty.length) {
        const c = dirty.pop(); inDirty[c] = 0;
        let unk = 0, m = 0; for (const y of nb[c]) { if (K[y] === 0) unk++; else if (K[y] === 2) m++; }
        if (!unk) continue;
        const need = num[c] - m;
        if (need === 0) { for (const y of nb[c]) if (K[y] === 0) open(y); did = true; }
        else if (need === unk) { for (const y of nb[c]) if (K[y] === 0) markMine(y); did = true; }
      }
      return did;
    }
    function pairs() {
      const cons = []; const byCell = new Map();
      for (let c = 0; c < N; c++) {
        if (K[c] !== 1 || num[c] <= 0) continue;
        const u = []; let m = 0;
        for (const y of nb[c]) { if (K[y] === 0) u.push(y); else if (K[y] === 2) m++; }
        if (!u.length) continue;
        const idx = cons.length; cons.push({ u, need: num[c] - m });
        for (const y of u) { let l = byCell.get(y); if (!l) byCell.set(y, l = []); l.push(idx); }
      }
      const seen = new Int32Array(cons.length).fill(-1);
      for (let a = 0; a < cons.length; a++) {
        const A = cons[a];
        for (const y of A.u) for (const b of byCell.get(y)) {
          if (b <= a || seen[b] === a) continue; seen[b] = a;
          const B = cons[b];
          const onlyA = A.u.filter(v => !B.u.includes(v)), onlyB = B.u.filter(v => !A.u.includes(v));
          const common = A.u.length - onlyA.length;
          const lo = Math.max(0, A.need - onlyA.length, B.need - onlyB.length);
          const hi = Math.min(common, A.need, B.need);
          if (lo > hi) continue;
          let did = false;
          for (const [only, need] of [[onlyA, A.need], [onlyB, B.need]]) {
            if (!only.length) continue;
            if (need - lo <= 0) { for (const v of only) open(v); did = true; }
            else if (need - hi >= only.length) { for (const v of only) markMine(v); did = true; }
          }
          if (did) return true;
        }
      }
      return false;
    }
    function globalCount() {
      let U = 0; for (let i = 0; i < N; i++) if (K[i] === 0) U++;
      const left = mineCount - knownMines;
      if (!U) return false;
      if (left === 0) { for (let i = 0; i < N; i++) if (K[i] === 0) open(i); return true; }
      if (left === U) { for (let i = 0; i < N; i++) if (K[i] === 0) markMine(i); return true; }
      return false;
    }
    open(start);
    while (revealed < safeTotal) {
      if (singles()) continue;
      if (revealed >= safeTotal) break;
      if (pairs()) continue;
      if (globalCount()) continue;
      break;
    }
    return { solved: revealed === safeTotal, revealed, knownMines, known: K, order };
  }

  /* ------------------------------------------------------------------ mine generation
   * Safe first tap: safeCell and all its neighbours are mine-free (so the first tap always opens an area).
   * noGuess: run the solver; while it gets stuck, move one mine from the stuck frontier to a random cell
   * far from anything revealed, and re-solve from scratch. Bounded by maxSolves (deterministic) and an
   * optional wall-clock timeBudgetMs (non-deterministic, used only for snappiness outside the Daily).
   * If the budget runs out, the board that got furthest is kept and solvable=false is reported.
   */
  function generateMines(board, mineCount, safeCell, rand, opts = {}) {
    const N = board.count, nb = board.neighbors;
    const noGuess = !!opts.noGuess, maxSolves = opts.maxSolves || 600;
    const timeBudgetMs = opts.timeBudgetMs == null ? Infinity : opts.timeBudgetMs;
    const clock = opts.now || (() => Date.now());
    const forbid = new Uint8Array(N); forbid[safeCell] = 1; for (const y of nb[safeCell]) forbid[y] = 1;
    const pool = []; for (let i = 0; i < N; i++) if (!forbid[i]) pool.push(i);
    mineCount = Math.min(mineCount, pool.length);
    function randomLayout() {
      const p = pool.slice(), m = new Uint8Array(N);
      for (let k = 0; k < mineCount; k++) {
        const j = k + Math.floor(rand() * (p.length - k));
        const t = p[k]; p[k] = p[j]; p[j] = t; m[p[k]] = 1;
      }
      return m;
    }
    const t0 = clock();
    let cur = randomLayout();
    if (!noGuess) return { mine: cur, mineCount, solvable: null, solves: 0, restarts: 0, ms: 0 };
    let best = null, bestScore = -1, solves = 0, restarts = 0;
    for (;;) {
      const adj = computeAdj(board, cur);
      const m = cur;
      const r = solve(board, mineCount, safeCell, c => (m[c] ? -1 : adj[c]));
      solves++;
      if (r.solved) return { mine: cur, mineCount, solvable: true, solves, restarts, ms: clock() - t0 };
      if (r.revealed > bestScore) { bestScore = r.revealed; best = cur.slice(); }
      if (solves >= maxSolves || clock() - t0 > timeBudgetMs) return { mine: best, mineCount, solvable: false, solves, restarts, ms: clock() - t0 };
      const K = r.known, front = [], far = [];
      for (let i = 0; i < N; i++) {
        if (K[i] !== 0) continue;
        let touches = false; for (const y of nb[i]) if (K[y] === 1) { touches = true; break; }
        if (touches) { if (cur[i]) front.push(i); }
        else if (!cur[i] && !forbid[i]) far.push(i);
      }
      if (!front.length || !far.length) { cur = randomLayout(); restarts++; continue; }
      const x = front[Math.floor(rand() * front.length)], y = far[Math.floor(rand() * far.length)];
      cur[x] = 0; cur[y] = 1;
    }
  }

  class Game {
    /** opts: { noGuess, shields (Zen: mistakes absorbed), maxSolves, timeBudgetMs } */
    constructor(board, mineCount, seed, opts = {}) {
      this.board = board;
      this.N = board.count;
      this.mineCount = Math.min(mineCount, this.N - 8);
      this.seed = seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed >>> 0;
      this.rand = mulberry32(this.seed);
      this.opts = opts;
      this.mine = new Uint8Array(this.N);
      this.adj = new Uint8Array(this.N);
      this.cell = new Uint8Array(this.N);   // HIDDEN / REVEALED
      this.flag = new Uint8Array(this.N);
      this.defused = new Uint8Array(this.N); // Zen: mines found by mistake (locked flags)
      this.revealedCount = 0;
      this.flagCount = 0;
      this.shields = opts.shields || 0;
      this.maxShields = this.shields;
      this.mistakes = 0;
      this.status = 'ready';                // ready | playing | won | lost
      this.minesPlaced = false;
      this.exploded = -1;
      this.gen = null;
    }
    placeMines(safeCell) {
      const o = this.opts;
      this.gen = generateMines(this.board, this.mineCount, safeCell, this.rand,
        { noGuess: o.noGuess, maxSolves: o.maxSolves, timeBudgetMs: o.timeBudgetMs });
      this.mine = this.gen.mine; this.mineCount = this.gen.mineCount;
      this.adj = computeAdj(this.board, this.mine);
      this.minesPlaced = true;
    }
    /** Place mines explicitly (tests / debug). */
    setMines(list) {
      this.mine.fill(0); for (const i of list) this.mine[i] = 1;
      this.mineCount = list.length;
      this.adj = computeAdj(this.board, this.mine);
      this.minesPlaced = true;
    }
    get over() { return this.status === 'won' || this.status === 'lost'; }
    /** Flood-fill reveal starting from `starts` (all at depth 0). Returns [{cell, depth}] in BFS order. */
    _flood(starts) {
      const out = [];
      const queue = [];
      for (const s of starts) {
        if (this.cell[s] !== HIDDEN || this.flag[s]) continue;
        this.cell[s] = REVEALED; this.revealedCount++;
        queue.push(s); out.push({ cell: s, depth: 0 });
      }
      const depth = new Map(starts.map(s => [s, 0]));
      for (let qi = 0; qi < queue.length; qi++) {
        const c = queue[qi];
        if (this.adj[c] !== 0 || this.mine[c]) continue;
        const d = depth.get(c) + 1;
        for (const nb of this.board.neighbors[c]) {
          if (this.cell[nb] !== HIDDEN || this.flag[nb] || this.mine[nb]) continue;
          this.cell[nb] = REVEALED; this.revealedCount++;
          depth.set(nb, d); queue.push(nb); out.push({ cell: nb, depth: d });
        }
      }
      return out;
    }
    _checkWin() {
      if (this.status === 'playing' && this.revealedCount === this.N - this.mineCount) this.status = 'won';
    }
    _defuse(c) {
      this.defused[c] = 1; this.mistakes++;
      if (!this.flag[c]) { this.flag[c] = 1; this.flagCount++; }
    }
    /** A mine was hit: spend a shield (Zen) or lose. */
    _hit(c, opened) {
      if (this.shields > 0) { this.shields--; this._defuse(c); return null; }
      this.mistakes++;
      this.cell[c] = REVEALED; this.status = 'lost'; this.exploded = c;
      return { type: 'boom', cell: c, opened, defused: [] };
    }
    /** Reveal a cell. Returns {type:'none'|'open'|'shield'|'boom', opened, cell?, defused?} */
    reveal(c) {
      if (this.over || this.cell[c] !== HIDDEN || this.flag[c]) return { type: 'none', opened: [] };
      if (!this.minesPlaced) this.placeMines(c);
      if (this.status === 'ready') this.status = 'playing';
      if (this.mine[c]) return this._hit(c, []) || { type: 'shield', cell: c, opened: [], defused: [c] };
      const opened = this._flood([c]);
      this._checkWin();
      return { type: 'open', opened };
    }
    flaggedAround(c) { let f = 0; for (const nb of this.board.neighbors[c]) f += this.flag[nb]; return f; }
    canChord(c) {
      return !this.over && this.cell[c] === REVEALED && this.adj[c] > 0 && this.flaggedAround(c) === this.adj[c] &&
        this.board.neighbors[c].some(nb => this.cell[nb] === HIDDEN && !this.flag[nb]);
    }
    /** Chord: reveal all unflagged hidden neighbours of a satisfied number. */
    chord(c) {
      if (!this.canChord(c)) return { type: 'none', opened: [] };
      const targets = this.board.neighbors[c].filter(nb => this.cell[nb] === HIDDEN && !this.flag[nb]);
      const bad = targets.filter(nb => this.mine[nb]);
      const safe = targets.filter(nb => !this.mine[nb]);
      const opened = this._flood(safe);
      const defused = [];
      for (const b of bad) {
        const r = this._hit(b, opened);
        if (r) { r.defused = defused; return r; }
        defused.push(b);
      }
      this._checkWin();
      return { type: defused.length ? 'shield' : 'open', opened, defused, cell: defused[0] };
    }
    toggleFlag(c) {
      if (this.over || this.cell[c] !== HIDDEN || this.defused[c]) return false;
      this.flag[c] ^= 1; this.flagCount += this.flag[c] ? 1 : -1;
      return true;
    }
    get minesLeft() { return this.mineCount - this.flagCount; }
  }

  /* ------------------------------------------------------------------ Daily Planet
   * Everyone gets the same board on the same (local) calendar date: the seed is a hash of the date,
   * the landing cell comes from that seed, and generation is no-guess with a deterministic budget only.
   */
  function hashStr(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13;
    return h >>> 0;
  }
  const pad2 = n => String(n).padStart(2, '0');
  function dateKey(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function dayNumber(key) { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); }
  function addDays(key, n) {
    const t = new Date(Date.UTC(...(([y, m, d]) => [y, m - 1, d])(key.split('-').map(Number))) + n * 864e5);
    return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
  }
  const DAILY_THEMES = ['planet', 'moon', 'giant'];
  /** { key, seed, theme, size, landing } for a date key; caller builds the board for `size`. */
  function dailyPlan(key, board) {
    const seed = hashStr('starfall-daily:' + key);
    const r = mulberry32(seed ^ 0x5bd1e995);
    const landing = Math.floor(r() * board.count);
    return { key, seed, theme: DAILY_THEMES[((dayNumber(key) % 3) + 3) % 3], size: 'planet', landing, number: dayNumber(key) - dayNumber('2026-10-01') + 1 };
  }
  /** The Daily Planet game for a date, mines placed around the landing cell (deterministic). */
  function dailyGame(key, board, mines, opts = {}) {
    const plan = dailyPlan(key, board);
    const g = new Game(board, mines, plan.seed, { noGuess: true, maxSolves: 1500, timeBudgetMs: null, shields: opts.shields || 0 });
    g.placeMines(plan.landing);
    return { game: g, plan };
  }

  /* ------------------------------------------------------------------ progression */
  const ACHIEVEMENTS = [
    { id: 'first_win', name: 'First Light', desc: 'Clear any world', icon: 'sun' },
    { id: 'no_flags', name: 'Bare Hands', desc: 'Win without placing a single flag', icon: 'hand' },
    { id: 'speed_moon', name: 'Moonwalker', desc: 'Clear the Moon in under 60 seconds', icon: 'bolt' },
    { id: 'giant', name: 'Giant Slayer', desc: 'Clear the Gas Giant', icon: 'ring' },
    { id: 'all_worlds', name: 'Cartographer', desc: 'Clear all three worlds', icon: 'map' },
    { id: 'zen_perfect', name: 'Unshaken', desc: 'Win Zen without losing a shield', icon: 'shield' },
    { id: 'streak3', name: 'Hat Trick', desc: 'Win 3 games in a row', icon: 'fire' },
    { id: 'daily_first', name: 'Dawn Patrol', desc: 'Clear a Daily Planet', icon: 'cal' },
    { id: 'daily7', name: 'Seven Suns', desc: 'Clear the Daily Planet 7 days in a row', icon: 'crown' },
  ];
  const WORLD_KEYS = ['moon', 'planet', 'giant'];
  function emptyStats() {
    const worlds = {}; for (const w of WORLD_KEYS) worlds[w] = { played: 0, wins: 0, best: null, zenBest: null };
    return { v: 2, played: 0, wins: 0, streak: 0, bestStreak: 0, worlds,
      daily: { played: 0, wins: 0, best: null, lastWin: null, streak: 0, bestStreak: 0, history: {} },
      achievements: {} };
  }
  function normalizeStats(s) {
    const e = emptyStats();
    if (!s || typeof s !== 'object') return e;
    const out = Object.assign(e, s);
    out.worlds = Object.assign(emptyStats().worlds, s.worlds || {});
    for (const w of WORLD_KEYS) out.worlds[w] = Object.assign({ played: 0, wins: 0, best: null, zenBest: null }, out.worlds[w]);
    out.daily = Object.assign(emptyStats().daily, s.daily || {});
    out.daily.history = Object.assign({}, out.daily.history || {});
    out.achievements = Object.assign({}, s.achievements || {});
    return out;
  }
  /** Current daily streak as of `today` (it lapses if neither today nor yesterday was cleared). */
  function dailyStreakNow(stats, today) {
    const d = stats.daily; if (!d.lastWin) return 0;
    return (d.lastWin === today || d.lastWin === addDays(today, -1)) ? d.streak : 0;
  }
  /**
   * Record a finished (or abandoned) game. r: { mode: 'classic'|'zen'|'daily', world, win, time, flagsUsed,
   * shieldsLost, dateKey, abandoned }. Returns { stats, unlocked: [achievement ids], isBest, prevBest }.
   */
  function recordGame(stats, r) {
    const s = normalizeStats(JSON.parse(JSON.stringify(stats || {})));
    const w = s.worlds[r.world] || (s.worlds[r.world] = { played: 0, wins: 0, best: null, zenBest: null });
    let isBest = false, prevBest = null;
    s.played++;
    if (r.mode === 'daily') s.daily.played++; else w.played++;
    if (!r.win) { s.streak = 0; return { stats: s, unlocked: [], isBest, prevBest }; }
    s.wins++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (r.mode === 'daily') {
      const d = s.daily; d.wins++;
      prevBest = d.history[r.dateKey] != null ? d.history[r.dateKey] : null;
      const firstToday = prevBest == null;
      if (firstToday || r.time < prevBest) { d.history[r.dateKey] = r.time; isBest = true; }
      if (firstToday) {
        d.streak = d.lastWin === addDays(r.dateKey, -1) ? d.streak + 1 : (d.lastWin === r.dateKey ? d.streak : 1);
        d.lastWin = r.dateKey; d.bestStreak = Math.max(d.bestStreak, d.streak);
      }
      if (d.best == null || r.time < d.best) d.best = r.time;
      const keys = Object.keys(d.history).sort(); while (keys.length > 120) delete d.history[keys.shift()];
    } else {
      w.wins++;
      const field = r.mode === 'zen' ? 'zenBest' : 'best';
      prevBest = w[field];
      if (prevBest == null || r.time < prevBest) { w[field] = r.time; isBest = true; }
    }
    const want = [];
    want.push('first_win');
    if (!r.flagsUsed) want.push('no_flags');
    if (r.mode !== 'daily' && r.world === 'moon' && r.time < 60) want.push('speed_moon');
    if (r.mode !== 'daily' && r.world === 'giant') want.push('giant');
    if (WORLD_KEYS.every(k => s.worlds[k].wins > 0)) want.push('all_worlds');
    if (r.mode === 'zen' && !r.shieldsLost) want.push('zen_perfect');
    if (s.streak >= 3) want.push('streak3');
    if (r.mode === 'daily') want.push('daily_first');
    if (s.daily.streak >= 7) want.push('daily7');
    const unlocked = [];
    for (const id of want) if (!s.achievements[id]) { s.achievements[id] = r.at || Date.now(); unlocked.push(id); }
    return { stats: s, unlocked, isBest, prevBest };
  }

  const DIFFICULTIES = {
    moon:   { key: 'moon',   name: 'Moon',      freq: 5,  mines: 30,  blurb: 'A quiet little rock' },
    planet: { key: 'planet', name: 'Planet',    freq: 7,  mines: 68,  blurb: 'A whole world to clear' },
    giant:  { key: 'giant',  name: 'Gas Giant', freq: 10, mines: 155, blurb: 'Vast, dense, merciless' },
  };
  for (const d of Object.values(DIFFICULTIES)) d.cells = 10 * d.freq * d.freq + 2;

  return { BUILD: '20261009a', buildGoldberg, Game, mulberry32, DIFFICULTIES, HIDDEN, REVEALED, computeAdj, solve, generateMines,
    hashStr, dateKey, dayNumber, addDays, dailyPlan, dailyGame, ACHIEVEMENTS, WORLD_KEYS, emptyStats, normalizeStats,
    recordGame, dailyStreakNow };
});
