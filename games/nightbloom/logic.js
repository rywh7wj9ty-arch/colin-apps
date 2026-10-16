/**
 * NIGHTBLOOM — pure board logic (node + browser).
 * No DOM. Deterministic given an RNG.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NightbloomLogic = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DIFFICULTIES = {
    seedling: { id: "seedling", label: "Seedling", w: 9, h: 9, mines: 10, heat: 1 },
    grove: { id: "grove", label: "Grove", w: 16, h: 16, mines: 40, heat: 2 },
    wildwood: { id: "wildwood", label: "Wildwood", w: 30, h: 16, mines: 99, heat: 3 },
  };

  function clamp(n, lo, hi) {
    n = n | 0;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function clampCustom(w, h, mines) {
    w = clamp(w, 5, 40);
    h = clamp(h, 5, 24);
    const maxMines = Math.max(1, w * h - 9);
    mines = clamp(mines, 1, maxMines);
    return { w, h, mines, heat: mines >= 80 ? 3 : mines >= 30 ? 2 : 1 };
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function utcDateString(d) {
    d = d || new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function dailySeed(dateStr) {
    return hashString("nightbloom-daily/" + dateStr);
  }

  function key(r, c) {
    return r + "," + c;
  }

  function parseKey(k) {
    const i = k.indexOf(",");
    return { r: +k.slice(0, i), c: +k.slice(i + 1) };
  }

  function inBounds(w, h, r, c) {
    return r >= 0 && c >= 0 && r < h && c < w;
  }

  function neighbors(w, h, r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr,
          cc = c + dc;
        if (inBounds(w, h, rr, cc)) out.push({ r: rr, c: cc });
      }
    }
    return out;
  }

  function neighborhood9(w, h, r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr,
          cc = c + dc;
        if (inBounds(w, h, rr, cc)) out.push({ r: rr, c: cc });
      }
    }
    return out;
  }

  function createEmpty(w, h) {
    const n = w * h;
    return {
      w,
      h,
      mineCount: 0,
      mines: new Set(),
      flags: new Set(),
      revealed: new Set(),
      numbers: new Int8Array(n),
      placed: false,
    };
  }

  function idx(board, r, c) {
    return r * board.w + c;
  }

  function isMine(board, r, c) {
    return board.mines.has(key(r, c));
  }

  function recount(board) {
    const { w, h, numbers } = board;
    numbers.fill(0);
    for (const k of board.mines) {
      const { r, c } = parseKey(k);
      for (const n of neighbors(w, h, r, c)) {
        numbers[idx(board, n.r, n.c)]++;
      }
    }
  }

  function placeMines(board, mineCount, firstR, firstC, rng) {
    const { w, h } = board;
    const total = w * h;
    mineCount = clamp(mineCount, 0, total - 1);
    board.mineCount = mineCount;
    board.mines.clear();

    const blocked = new Set();
    const n9 = neighborhood9(w, h, firstR, firstC);
    if (total - n9.length >= mineCount) {
      for (const p of n9) blocked.add(key(p.r, p.c));
    } else {
      blocked.add(key(firstR, firstC));
    }

    const pool = [];
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const k = key(r, c);
        if (!blocked.has(k)) pool.push(k);
      }
    }

    for (let i = pool.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }

    for (let i = 0; i < mineCount && i < pool.length; i++) board.mines.add(pool[i]);
    board.placed = true;
    recount(board);
  }

  function isWin(board) {
    return board.revealed.size === board.w * board.h - board.mines.size;
  }

  /**
   * Collect flood cells from a starting safe cell (already known not a mine).
   * Returns array of {r,c,dist} in paint order (by Chebyshev ring).
   */
  function collectReveal(board, startR, startC) {
    const { w, h } = board;
    const startK = key(startR, startC);
    if (board.revealed.has(startK) || board.flags.has(startK)) return [];
    if (isMine(board, startR, startC)) return [{ r: startR, c: startC, dist: 0, mine: true }];

    const out = [];
    const seen = new Set([startK]);
    const q = [{ r: startR, c: startC, dist: 0 }];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi];
      out.push(cur);
      const n = board.numbers[idx(board, cur.r, cur.c)];
      if (n !== 0) continue;
      for (const nb of neighbors(w, h, cur.r, cur.c)) {
        const k = key(nb.r, nb.c);
        if (seen.has(k) || board.revealed.has(k) || board.flags.has(k)) continue;
        if (isMine(board, nb.r, nb.c)) continue;
        seen.add(k);
        const dist = Math.max(Math.abs(nb.r - startR), Math.abs(nb.c - startC));
        q.push({ r: nb.r, c: nb.c, dist });
      }
    }
    return out;
  }

  function applyReveal(board, cells) {
    let hitMine = null;
    for (const cell of cells) {
      const k = key(cell.r, cell.c);
      if (cell.mine) {
        hitMine = cell;
        board.revealed.add(k);
        continue;
      }
      if (board.flags.has(k)) continue;
      board.revealed.add(k);
    }
    return { hitMine, won: !hitMine && isWin(board) };
  }

  function toggleFlag(board, r, c) {
    if (!inBounds(board.w, board.h, r, c)) return { changed: false, flagged: false };
    const k = key(r, c);
    if (board.revealed.has(k)) return { changed: false, flagged: false };
    if (board.flags.has(k)) {
      board.flags.delete(k);
      return { changed: true, flagged: false };
    }
    board.flags.add(k);
    return { changed: true, flagged: true };
  }

  function remaining(board) {
    return board.mineCount - board.flags.size;
  }

  function chord(board, r, c) {
    const k = key(r, c);
    if (!board.revealed.has(k)) return { valid: false, cells: [], hitMine: null, won: false };
    const n = board.numbers[idx(board, r, c)];
    if (n <= 0) return { valid: false, cells: [], hitMine: null, won: false };
    const nbs = neighbors(board.w, board.h, r, c);
    let flagCount = 0;
    for (const nb of nbs) if (board.flags.has(key(nb.r, nb.c))) flagCount++;
    if (flagCount !== n) return { valid: false, cells: [], hitMine: null, won: false };

    const collected = [];
    const seen = new Set();
    let earliestMine = null;
    for (const nb of nbs) {
      const nk = key(nb.r, nb.c);
      if (board.flags.has(nk) || board.revealed.has(nk)) continue;
      const piece = collectReveal(board, nb.r, nb.c);
      for (const cell of piece) {
        const ck = key(cell.r, cell.c);
        if (seen.has(ck)) continue;
        seen.add(ck);
        collected.push(cell);
        if (cell.mine && !earliestMine) earliestMine = cell;
      }
    }
    const applied = applyReveal(board, collected);
    return {
      valid: true,
      cells: collected,
      hitMine: applied.hitMine,
      won: applied.won,
    };
  }

  function revealCell(board, r, c) {
    if (!inBounds(board.w, board.h, r, c)) {
      return { valid: false, cells: [], hitMine: null, won: false };
    }
    const k = key(r, c);
    if (board.revealed.has(k) || board.flags.has(k)) {
      return { valid: false, cells: [], hitMine: null, won: false };
    }
    const cells = collectReveal(board, r, c);
    const applied = applyReveal(board, cells);
    return { valid: true, cells, hitMine: applied.hitMine, won: applied.won };
  }

  /** Adjacent-mine density for an unrevealed unflagged tile. 0 if revealed/flagged/mine-cell treated as its count. */
  function heatValue(board, r, c) {
    const k = key(r, c);
    if (board.revealed.has(k) || board.flags.has(k)) return 0;
    if (!board.placed) return 0;
    return board.numbers[idx(board, r, c)];
  }

  function isAdjacent(r1, c1, r2, c2) {
    return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)) === 1;
  }

  function moveWouldChangeRevealed(board, fromR, fromC, toR, toC) {
    for (const k of board.revealed) {
      const p = parseKey(k);
      const was = isAdjacent(p.r, p.c, fromR, fromC);
      const now = isAdjacent(p.r, p.c, toR, toC);
      if (was !== now) return true;
    }
    return false;
  }

  function legalTargets(board, r, c) {
    const targets = [];
    for (const n of neighbors(board.w, board.h, r, c)) {
      const k = key(n.r, n.c);
      if (board.revealed.has(k)) continue;
      if (board.flags.has(k)) continue;
      if (board.mines.has(k)) continue;
      if (moveWouldChangeRevealed(board, r, c, n.r, n.c)) continue;
      targets.push(n);
    }
    return targets;
  }

  /**
   * Sequential migration: each unflagged mine, in shuffled order, may step once
   * into a random legal neighbor. Invariant: already-revealed numbers never change.
   */
  function migrateMines(board, rng) {
    if (!board.placed) return [];
    const list = [];
    for (const k of board.mines) {
      if (board.flags.has(k)) continue;
      list.push(parseKey(k));
    }
    for (let i = list.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    const moves = [];
    for (const m of list) {
      const k = key(m.r, m.c);
      if (!board.mines.has(k) || board.flags.has(k)) continue;
      const targets = legalTargets(board, m.r, m.c);
      if (!targets.length) continue;
      const t = targets[(rng() * targets.length) | 0];
      board.mines.delete(k);
      board.mines.add(key(t.r, t.c));
      moves.push({ from: { r: m.r, c: m.c }, to: { r: t.r, c: t.c } });
    }
    if (moves.length) recount(board);
    return moves;
  }

  function compute3BV(board) {
    if (!board.placed) return 0;
    const { w, h } = board;
    const seen = new Set();
    let openings = 0;
    let singles = 0;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const k = key(r, c);
        if (board.mines.has(k) || seen.has(k)) continue;
        if (board.numbers[idx(board, r, c)] === 0) {
          openings++;
          const q = [{ r, c }];
          seen.add(k);
          for (let qi = 0; qi < q.length; qi++) {
            const cur = q[qi];
            const n = board.numbers[idx(board, cur.r, cur.c)];
            for (const nb of neighbors(w, h, cur.r, cur.c)) {
              const nk = key(nb.r, nb.c);
              if (board.mines.has(nk) || seen.has(nk)) continue;
              if (n === 0) {
                seen.add(nk);
                q.push(nb);
              }
            }
          }
        }
      }
    }
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const k = key(r, c);
        if (board.mines.has(k) || seen.has(k)) continue;
        singles++;
      }
    }
    return openings + singles;
  }

  function verifyRevealedNumbers(board) {
    for (const k of board.revealed) {
      const p = parseKey(k);
      if (board.mines.has(k)) continue;
      let count = 0;
      for (const n of neighbors(board.w, board.h, p.r, p.c)) {
        if (board.mines.has(key(n.r, n.c))) count++;
      }
      if (count !== board.numbers[idx(board, p.r, p.c)]) return false;
    }
    return true;
  }

  return {
    DIFFICULTIES,
    clamp,
    clampCustom,
    mulberry32,
    hashString,
    utcDateString,
    dailySeed,
    key,
    parseKey,
    inBounds,
    neighbors,
    neighborhood9,
    createEmpty,
    idx,
    isMine,
    recount,
    placeMines,
    isWin,
    collectReveal,
    applyReveal,
    toggleFlag,
    remaining,
    chord,
    revealCell,
    heatValue,
    moveWouldChangeRevealed,
    legalTargets,
    migrateMines,
    compute3BV,
    verifyRevealedNumbers,
  };
});
