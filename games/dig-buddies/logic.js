// Dig Buddies core rules. Pure ES module: used by the game and by the Node unit tests.
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function dailyKey(d = new Date()) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
export function dailySeed(key) { return hashStr('dig-buddies-daily:' + key); }
export function prevDayKey(key) { const [y, m, d] = key.split('-').map(Number); return dailyKey(new Date(y, m - 1, d - 1)); }

// ---- shapes: 0 = hole, 1 = playable ----
export function shapeMask(shape, W, H, seed = 1) {
  const m = new Uint8Array(W * H).fill(1);
  if (!shape || shape === 'rect') return m;
  const R = rng(seed ^ 0x9e37);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const x = (c + 0.5) / W * 2 - 1, y = 1 - (r + 0.5) / H * 2; let inside = true;
    if (shape === 'heart') { const X = x * 1.2, Y = y * 1.25 + 0.25; const v = (X * X + Y * Y - 1); inside = v * v * v - X * X * Y * Y * Y <= 0.02; }
    else if (shape === 'star') { const a = Math.atan2(y, x), d = Math.hypot(x, y); const k = Math.cos(5 * (a - Math.PI / 2)); const rad = 0.6 + 0.42 * Math.max(0, k) ** 0.8; inside = d <= rad; if (d < 0.12) inside = false; }
    else if (shape === 'round') { const d = Math.hypot(x, y); inside = d <= 1.02 && d >= 0.22; }
    else if (shape === 'island') { const a = Math.atan2(y, x), d = Math.hypot(x * 0.95, y); const wob = 0.86 + 0.1 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 5 + seed * 2); inside = d <= wob; }
    m[r * W + c] = inside ? 1 : 0;
  }
  if (shape === 'island') { // a couple of tidepools
    for (let k = 0; k < 2; k++) { const c = 2 + Math.floor(R() * (W - 4)), r = 2 + Math.floor(R() * (H - 4)); m[r * W + c] = 0; if (R() < 0.6 && c + 1 < W) m[r * W + c + 1] = 0; }
  }
  return m;
}

// ---- board ----
// kind: 0 hole, 1 playable, 2 boulder
export function makeBoard(def) {
  const W = def.w, H = def.h, N = W * H;
  const kind = shapeMask(def.shape, W, H, def.seed || 1);
  const R = rng((def.seed || 1) ^ 0x51ed);
  if (def.boulders) {
    let placed = 0, tries = 0;
    while (placed < def.boulders && tries++ < 5000) { const i = Math.floor(R() * N); if (kind[i] === 1) { kind[i] = 2; placed++; } }
  }
  const b = { W, H, N, kind, nb: [], mine: new Uint8Array(N), ice: new Uint8Array(N), lantern: new Uint8Array(N), coin: new Uint8Array(N), num: new Uint8Array(N),
    revealed: new Uint8Array(N), flagged: new Uint8Array(N), popped: new Uint8Array(N), generated: false, mines: def.mines, night: !!def.night, lightR: def.lightR || 3, def };
  for (let i = 0; i < N; i++) b.nb.push(kind[i] === 1 ? neighbours(b, i) : []);
  return b;
}
export function neighbours(b, i) {
  const out = [], c = i % b.W, r = (i / b.W) | 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue; const cc = c + dc, rr = r + dr;
    if (cc < 0 || rr < 0 || cc >= b.W || rr >= b.H) continue; const j = rr * b.W + cc; if (b.kind[j] === 1) out.push(j);
  }
  return out;
}
export const playable = b => { const o = []; for (let i = 0; i < b.N; i++) if (b.kind[i] === 1) o.push(i); return o; };
export function computeNumbers(b) { for (let i = 0; i < b.N; i++) { let n = 0; for (const j of b.nb[i]) n += b.mine[j]; b.num[i] = n; } }

// lit: on night boards a number reads clearly only within lightR (Chebyshev) of a dug-up lantern
export function isLit(b, i, rev = b.revealed) {
  if (!b.night) return true;
  const c = i % b.W, r = (i / b.W) | 0, L = b.lightR;
  for (let rr = Math.max(0, r - L); rr <= Math.min(b.H - 1, r + L); rr++) for (let cc = Math.max(0, c - L); cc <= Math.min(b.W - 1, c + L); cc++) {
    const j = rr * b.W + cc; if (b.lantern[j] && rev[j]) return true;
  }
  return false;
}
// ice: a dug ice tile hides its number until one of its neighbours is dug too
export function iceClear(b, i, rev = b.revealed) { if (!b.ice[i]) return true; for (const j of b.nb[i]) if (rev[j]) return true; return false; }
export function numberVisible(b, i, rev = b.revealed) { return iceClear(b, i, rev) && isLit(b, i, rev); }

// flood reveal on a scratch array; returns cells in BFS order with their ring distance
export function floodFrom(b, start, rev, known) {
  const order = [];
  if (rev[start] || b.mine[start]) return order;
  const q = [start]; rev[start] = 1; const dist = new Map([[start, 0]]);
  while (q.length) {
    const i = q.shift(); order.push([i, dist.get(i)]);
    if (b.num[i] === 0) for (const j of b.nb[i]) if (!rev[j] && !b.mine[j] && !(known && known[j])) { rev[j] = 1; dist.set(j, dist.get(i) + 1); q.push(j); }
  }
  return order;
}

// ---- no-guess solver ----
// Simulates a logical player: single-tile rules, pairwise overlap rules and the global mine count.
export function solve(b, start, capSteps = 1e6) {
  const N = b.N, rev = new Uint8Array(N), mk = new Uint8Array(N);
  let safeLeft = 0; for (let i = 0; i < N; i++) if (b.kind[i] === 1 && !b.mine[i]) safeLeft++;
  const total = b.mines; let minesKnown = 0;
  const open = i => { for (const [j] of floodFrom(b, i, rev, mk)) safeLeft--; };
  if (b.mine[start]) return { solved: false, reason: 'mine at start' };
  open(start);
  let steps = 0;
  while (safeLeft > 0 && steps++ < capSteps) {
    let progress = false; const cons = [];
    for (let i = 0; i < N; i++) {
      if (!rev[i] || b.kind[i] !== 1 || !numberVisible(b, i, rev)) continue;
      const U = []; let m = b.num[i];
      for (const j of b.nb[i]) { if (mk[j]) m--; else if (!rev[j]) U.push(j); }
      if (!U.length) continue;
      if (m === 0) { for (const j of U) if (!rev[j]) { open(j); progress = true; } continue; }
      if (m === U.length) { for (const j of U) if (!mk[j]) { mk[j] = 1; minesKnown++; progress = true; } continue; }
      cons.push({ U, m });
    }
    if (progress) continue;
    // pairwise: if mA - mB == |A\B| then A\B are all mines and B\A all safe
    const byCell = new Map(); cons.forEach((c, k) => { c.set = new Set(c.U); for (const j of c.U) { if (!byCell.has(j)) byCell.set(j, []); byCell.get(j).push(k); } });
    outer: for (let a = 0; a < cons.length; a++) {
      const A = cons[a], seen = new Set();
      for (const j of A.U) for (const bk of byCell.get(j)) {
        if (bk === a || seen.has(bk)) continue; seen.add(bk); const B = cons[bk];
        const AnB = A.U.filter(x => !B.set.has(x)), BnA = B.U.filter(x => !A.set.has(x));
        if (A.m - B.m === AnB.length && AnB.length + BnA.length > 0) {
          for (const x of AnB) if (!mk[x]) { mk[x] = 1; minesKnown++; }
          for (const x of BnA) if (!rev[x] && !mk[x]) open(x);
          progress = true; break outer;
        }
      }
    }
    if (progress) continue;
    // exhaustive check of each small frontier group: a tile that is a mine (or safe) in every consistent layout is certain
    if (enumerate(b, cons, rev, mk, total - minesKnown, open, () => minesKnown++)) continue;
    // global count
    const unk = []; for (let i = 0; i < N; i++) if (b.kind[i] === 1 && !rev[i] && !mk[i]) unk.push(i);
    if (total - minesKnown === 0) { for (const i of unk) open(i); continue; }
    if (total - minesKnown === unk.length) { for (const i of unk) { mk[i] = 1; minesKnown++; } continue; }
    return { solved: false, reason: 'stuck', safeLeft };
  }
  return { solved: safeLeft === 0, steps };
}

function enumerate(b, cons, rev, mk, left, open, addMine) {
  if (!cons.length) return false;
  const cellCons = new Map(); cons.forEach((c, k) => c.U.forEach(j => { if (!cellCons.has(j)) cellCons.set(j, []); cellCons.get(j).push(k); }));
  const seen = new Set(); let progress = false;
  for (const startCell of cellCons.keys()) {
    if (seen.has(startCell)) continue;
    const comp = [], cs = new Set(), st = [startCell]; seen.add(startCell);
    while (st.length) { const x = st.pop(); comp.push(x); for (const k of cellCons.get(x)) { if (cs.has(k)) continue; cs.add(k); for (const y of cons[k].U) if (!seen.has(y)) { seen.add(y); st.push(y); } } }
    if (comp.length > 18) continue;
    const idx = new Map(comp.map((x, k) => [x, k])), C = [...cs].map(k => ({ cells: cons[k].U.map(x => idx.get(x)), m: cons[k].m }));
    const byCell = comp.map(() => []); C.forEach((c, k) => c.cells.forEach(x => byCell[x].push(k)));
    const asg = new Int8Array(comp.length).fill(-1), cnt = C.map(() => 0), unset = C.map(c => c.cells.length);
    const mineIn = new Int32Array(comp.length); let sols = 0, nodes = 0;
    const rec = (x, used) => {
      if (++nodes > 15000) return;
      if (x === comp.length) { sols++; for (let k = 0; k < comp.length; k++) if (asg[k]) mineIn[k]++; return; }
      for (const v of [0, 1]) {
        if (v && used >= left) continue;
        let okv = true; for (const k of byCell[x]) { const c = C[k], nc = cnt[k] + v, nu = unset[k] - 1; if (nc > c.m || nc + nu < c.m) { okv = false; break; } }
        if (!okv) continue;
        asg[x] = v; for (const k of byCell[x]) { cnt[k] += v; unset[k]--; }
        rec(x + 1, used + v);
        for (const k of byCell[x]) { cnt[k] -= v; unset[k]++; } asg[x] = -1;
      }
    };
    rec(0, 0);
    if (nodes > 15000 || !sols) continue;
    for (let k = 0; k < comp.length; k++) {
      const x = comp[k];
      if (mineIn[k] === 0 && !rev[x]) { open(x); progress = true; }
      else if (mineIn[k] === sols && !mk[x]) { mk[x] = 1; addMine(); progress = true; }
    }
    if (progress) return true;
  }
  return progress;
}

// which unknown tiles can a logical player prove safe right now? (used for the mole's gasp and Sniff)
export function provablySafe(b) {
  const N = b.N, safe = new Set();
  const known = i => b.flagged[i] || b.popped[i];
  for (let i = 0; i < N; i++) {
    if (!b.revealed[i] || b.kind[i] !== 1 || !numberVisible(b, i)) continue;
    let m = b.num[i]; const U = [];
    for (const j of b.nb[i]) { if (b.popped[j] || (b.flagged[j] && b.mine[j])) m--; else if (!b.revealed[j]) U.push(j); }
    if (m === 0) U.forEach(j => safe.add(j));
  }
  return safe;
}

// Generate a no-guess layout around the first tap. Time-capped; drops a mine at a time if the cap is hit.
export function generate(b, first, opts = {}) {
  const cap = opts.capMs ?? 1500, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const seed = (opts.seed ?? b.def.seed ?? 1) ^ Math.imul(first + 1, 2654435761);
  const R = rng(seed);
  const cells = playable(b);
  // a roomy first opening (5x5 when the board can afford it) makes no-guess layouts far easier to find
  const ban = new Set([first, ...b.nb[first]]);
  if (cells.length - b.def.mines > 40) for (const j of b.nb[first]) for (const k of b.nb[j]) ban.add(k);
  let mines = Math.min(b.def.mines, cells.length - ban.size - 1);
  const t0 = now(); let tries = 0, budget = opts.tries ?? 80, lastCut = 0;
  for (;;) {
    tries++;
    b.mine.fill(0); b.ice.fill(0); b.lantern.fill(0); b.coin.fill(0);
    const pool = cells.filter(i => !ban.has(i));
    for (let k = 0; k < mines; k++) { const p = k + Math.floor(R() * (pool.length - k)); [pool[k], pool[p]] = [pool[p], pool[k]]; b.mine[pool[k]] = 1; }
    computeNumbers(b);
    if (b.def.ice) for (const i of cells) if (i !== first && R() < b.def.ice) b.ice[i] = 1;
    if (b.night) {
      b.lantern[first] = 1;
      const safe = cells.filter(i => !b.mine[i] && i !== first);
      const want = Math.max(2, Math.round(cells.length / (b.def.lanternEvery || 10)));
      for (let k = 0; k < want; k++) b.lantern[safe[Math.floor(R() * safe.length)]] = 1;
    }
    const s = solve(b, first);
    if (s.solved) break;
    // deterministic try budget per mine count, so the same tap always gives the same board
    if (tries - lastCut >= budget) { if (mines > 1) mines--; lastCut = tries; budget = Math.max(40, budget >> 1); }
  }
  b.mines = mines;
  if (b.def.coins) { const safe = cells.filter(i => !b.mine[i] && i !== first); for (let k = 0; k < b.def.coins && safe.length; k++) { const p = Math.floor(R() * safe.length); b.coin[safe[p]] = 1; safe.splice(p, 1); } }
  b.generated = true; b.first = first; b.genTries = tries; b.genMs = now() - t0;
  return b;
}

// ---- play actions (return lists of events for the renderer) ----
export function dig(b, i, opts = {}) {
  if (b.kind[i] !== 1 || b.revealed[i] || b.flagged[i] || b.popped[i]) return { type: 'none', cells: [] };
  if (!b.generated) generate(b, i, opts);
  if (b.mine[i]) { b.popped[i] = 1; return { type: 'poof', cells: [[i, 0]] }; }
  const known = new Uint8Array(b.N); for (let k = 0; k < b.N; k++) known[k] = b.flagged[k] || b.popped[k];
  const order = floodFrom(b, i, b.revealed, known);
  return { type: 'dig', cells: order };
}
export function toggleFlag(b, i) { if (b.kind[i] !== 1 || b.revealed[i] || b.popped[i]) return false; b.flagged[i] ^= 1; return true; }
export function canChord(b, i) {
  if (!b.revealed[i] || !b.num[i] || !numberVisible(b, i)) return false;
  let f = 0, hidden = 0; for (const j of b.nb[i]) { if (b.flagged[j] || b.popped[j]) f++; else if (!b.revealed[j]) hidden++; }
  return f === b.num[i] && hidden > 0;
}
export function chord(b, i) {
  const res = { type: 'chord', cells: [], poofs: [] };
  if (!canChord(b, i)) return res;
  for (const j of b.nb[i]) {
    if (b.revealed[j] || b.flagged[j] || b.popped[j]) continue;
    const r = dig(b, j); if (r.type === 'poof') res.poofs.push(j); else res.cells.push(...r.cells);
  }
  return res;
}
export function isWon(b) { if (!b.generated) return false; for (let i = 0; i < b.N; i++) if (b.kind[i] === 1 && !b.mine[i] && !b.revealed[i]) return false; return true; }
export function minesLeft(b) { let f = 0; for (let i = 0; i < b.N; i++) f += b.flagged[i] + b.popped[i]; return b.mines - f; }
export function sniffTarget(b, R = Math.random) {
  // prefer a hidden safe tile next to dug ground, so the hint actually helps
  const front = [], rest = [];
  for (let i = 0; i < b.N; i++) {
    if (b.kind[i] !== 1 || b.revealed[i] || b.mine[i] || b.flagged[i]) continue;
    (b.nb[i].some(j => b.revealed[j]) ? front : rest).push(i);
  }
  const L = front.length ? front : rest; return L.length ? L[Math.floor(R() * L.length)] : -1;
}
export function starsFor({ won, heartsLost, time, target }) { return [!!won, !!won && heartsLost === 0, !!won && time <= target]; }
