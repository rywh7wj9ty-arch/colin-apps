#!/usr/bin/env node
/* Node tests for STARFALL logic: node test-logic.js */
'use strict';
const assert = require('assert');
const L = require('./logic.js');
const { buildGoldberg, Game, DIFFICULTIES, solve, generateMines, computeAdj, mulberry32 } = L;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok  ' + name); }

for (const d of Object.values(DIFFICULTIES)) {
  const b = buildGoldberg(d.freq);
  test(`${d.name}: ${b.count} cells = 10n²+2, 12 pentagons, rest hexagons`, () => {
    assert.strictEqual(b.count, d.cells);
    let p = 0, h = 0;
    b.neighbors.forEach((nb, i) => {
      assert.ok(nb.length === 5 || nb.length === 6, `cell ${i} has ${nb.length} neighbours`);
      assert.strictEqual(b.corners[i].length, nb.length);
      nb.length === 5 ? p++ : h++;
      for (const j of nb) assert.ok(b.neighbors[j].includes(i), 'neighbour relation symmetric');
      assert.ok(!nb.includes(i));
    });
    assert.strictEqual(p, 12); assert.strictEqual(h, b.count - 12);
  });
}

const board = buildGoldberg(DIFFICULTIES.planet.freq);
test('first click is always safe and opens an area (500 random games)', () => {
  for (let s = 0; s < 500; s++) {
    const g = new Game(board, DIFFICULTIES.planet.mines, s);
    const c = (s * 7919) % board.count;
    const r = g.reveal(c);
    assert.strictEqual(r.type, 'open');
    assert.strictEqual(g.mine[c], 0);
    for (const nb of board.neighbors[c]) assert.strictEqual(g.mine[nb], 0);
    assert.strictEqual(g.adj[c], 0);
    assert.ok(r.opened.length >= 1 + board.neighbors[c].length, 'opens cell + all neighbours at least');
    let m = 0; for (let i = 0; i < board.count; i++) m += g.mine[i];
    assert.strictEqual(m, DIFFICULTIES.planet.mines);
  }
});

test('adjacency counts match neighbours', () => {
  const g = new Game(board, 60, 42); g.reveal(0);
  for (let i = 0; i < board.count; i++) {
    const c = board.neighbors[i].reduce((a, nb) => a + g.mine[nb], 0);
    assert.strictEqual(g.adj[i], c);
  }
});

test('flood fill is exactly the zero-region plus its border (vs reference DFS)', () => {
  for (let s = 0; s < 100; s++) {
    const g = new Game(board, 60, 1000 + s);
    const start = (s * 31) % board.count;
    const r = g.reveal(start);
    // reference
    const seen = new Set([start]); const stack = [start];
    while (stack.length) {
      const c = stack.pop();
      if (g.adj[c] !== 0) continue;
      for (const nb of board.neighbors[c]) if (!seen.has(nb) && !g.mine[nb]) { seen.add(nb); stack.push(nb); }
    }
    const got = new Set(r.opened.map(o => o.cell));
    assert.strictEqual(got.size, r.opened.length, 'no duplicates');
    assert.deepStrictEqual([...got].sort((a, b) => a - b), [...seen].sort((a, b) => a - b));
    for (const o of r.opened) assert.strictEqual(g.mine[o.cell], 0);
    // depths are BFS layers: each non-root opened cell has a zero neighbour opened one layer earlier
    const depth = new Map(r.opened.map(o => [o.cell, o.depth]));
    for (const o of r.opened) if (o.depth > 0)
      assert.ok(board.neighbors[o.cell].some(nb => depth.get(nb) === o.depth - 1 && g.adj[nb] === 0));
  }
});

test('flags block reveal and flood; chord reveals neighbours; wrong chord explodes', () => {
  const g = new Game(board, 0, 1);
  const c = 100; const nbs = board.neighbors[c];
  g.setMines([nbs[0]]);
  g.status = 'playing';
  assert.ok(g.toggleFlag(nbs[1]));
  assert.strictEqual(g.reveal(nbs[1]).type, 'none');
  assert.strictEqual(g.reveal(c).type, 'open');        // adj=1, opens just itself
  assert.strictEqual(g.adj[c], 1);
  const r = g.chord(c);                                 // flag on wrong cell -> boom
  assert.strictEqual(r.type, 'boom'); assert.strictEqual(r.cell, nbs[0]); assert.strictEqual(g.status, 'lost');
  const g2 = new Game(board, 0, 1); g2.setMines([nbs[0]]); g2.status = 'playing';
  g2.reveal(c); g2.toggleFlag(nbs[0]);
  const r2 = g2.chord(c);
  assert.strictEqual(r2.type, 'open'); assert.ok(r2.opened.length >= nbs.length - 1);
});

test('win detection: revealing every safe cell wins, not before', () => {
  for (let s = 0; s < 30; s++) {
    const g = new Game(board, 68, 77 + s);
    g.reveal(5);
    const safe = []; for (let i = 0; i < board.count; i++) if (!g.mine[i] && g.cell[i] === 0) safe.push(i);
    for (let k = 0; k < safe.length; k++) {
      if (g.cell[safe[k]] !== 0) continue;
      assert.strictEqual(g.status, 'playing');
      g.reveal(safe[k]);
    }
    assert.strictEqual(g.status, 'won');
    assert.strictEqual(g.revealedCount, board.count - 68);
    assert.strictEqual(g.reveal(safe[0]).type, 'none');
  }
});

test('loss: revealing a mine loses and stops further play', () => {
  const g = new Game(board, 68, 9); g.reveal(3);
  const m = g.mine.indexOf(1);
  const r = g.reveal(m);
  assert.strictEqual(r.type, 'boom'); assert.strictEqual(g.status, 'lost');
  assert.strictEqual(g.toggleFlag(g.cell.indexOf(0)), false);
});

/* ---------------------------------------------------------------- v2: solver + no-guess */
const boards = {}; for (const d of Object.values(DIFFICULTIES)) boards[d.key] = buildGoldberg(d.freq);
const oracle = (mine, adj) => c => (mine[c] ? -1 : adj[c]);

test('solver is sound: never probes a mine, every cell it marks is a mine (600 random boards)', () => {
  let solved = 0, total = 0;
  for (const d of Object.values(DIFFICULTIES)) {
    const b = boards[d.key];
    for (let s = 0; s < 200; s++) {
      const rand = mulberry32(5000 + s);
      const start = Math.floor(rand() * b.count);
      const g = generateMines(b, d.mines, start, rand, { noGuess: false });
      const adj = computeAdj(b, g.mine);
      const r = solve(b, d.mines, start, oracle(g.mine, adj));   // throws if it ever probes a mine
      for (let i = 0; i < b.count; i++) {
        if (r.known[i] === 2) assert.strictEqual(g.mine[i], 1, 'marked mine is a mine');
        if (r.known[i] === 1) assert.strictEqual(g.mine[i], 0, 'opened cell is safe');
      }
      total++; if (r.solved) solved++;
    }
  }
  console.log(`      (plain random boards already logic-solvable: ${solved}/${total})`);
});

test('solver uses pair reasoning (a board that singles alone cannot finish)', () => {
  // Find a board where a singles-only pass stalls but the full solver finishes.
  const b = boards.planet; let found = false;
  for (let s = 0; s < 400 && !found; s++) {
    const rand = mulberry32(900 + s); const start = Math.floor(rand() * b.count);
    const g = generateMines(b, 68, start, rand, { noGuess: false });
    const adj = computeAdj(b, g.mine);
    const full = solve(b, 68, start, oracle(g.mine, adj));
    // singles-only reference
    const K = new Int8Array(b.count); let rev = 0;
    const open = c => { const st = [c]; while (st.length) { const x = st.pop(); if (K[x]) continue; K[x] = 1; rev++; if (adj[x] === 0) for (const y of b.neighbors[x]) if (!K[y]) st.push(y); } };
    open(start);
    for (let changed = true; changed;) {
      changed = false;
      for (let c = 0; c < b.count; c++) {
        if (K[c] !== 1 || !adj[c]) continue;
        const u = b.neighbors[c].filter(y => K[y] === 0), m = b.neighbors[c].filter(y => K[y] === 2).length;
        if (!u.length) continue;
        if (adj[c] - m === 0) { u.forEach(open); changed = true; } else if (adj[c] - m === u.length) { u.forEach(y => K[y] = 2); changed = true; }
      }
    }
    if (full.solved && rev < b.count - 68) found = true;
  }
  assert.ok(found, 'expected at least one board needing subset/pair logic');
});

for (const d of Object.values(DIFFICULTIES)) {
  test(`no-guess generation: ${d.name} boards are always solvable by logic (60 boards, safe start kept)`, () => {
    const b = boards[d.key]; let maxMs = 0, maxSolves = 0;
    for (let s = 0; s < 60; s++) {
      const rand = mulberry32(31337 + s * 17); const start = Math.floor(rand() * b.count);
      const g = generateMines(b, d.mines, start, rand, { noGuess: true });
      assert.strictEqual(g.solvable, true, `seed ${s} not solvable after ${g.solves} solves`);
      let m = 0; for (let i = 0; i < b.count; i++) m += g.mine[i];
      assert.strictEqual(m, d.mines, 'mine count preserved');
      assert.strictEqual(g.mine[start], 0); for (const y of b.neighbors[start]) assert.strictEqual(g.mine[y], 0);
      const adj = computeAdj(b, g.mine);
      assert.ok(solve(b, d.mines, start, oracle(g.mine, adj)).solved);
      maxMs = Math.max(maxMs, g.ms); maxSolves = Math.max(maxSolves, g.solves);
    }
    console.log(`      (worst case: ${maxSolves} solver runs, ${maxMs} ms)`);
  });
}

test('no-guess repair loop works at high density (Planet with 120 mines: most raw boards need repair)', () => {
  const b = boards.planet; let repaired = 0, ok = 0;
  for (let s = 0; s < 40; s++) {
    const rand = mulberry32(777 + s); const start = Math.floor(rand() * b.count);
    const g = generateMines(b, 120, start, rand, { noGuess: true, maxSolves: 2000 });
    if (g.solves > 1) repaired++;
    if (g.solvable) { ok++; const adj = computeAdj(b, g.mine); assert.ok(solve(b, 120, start, oracle(g.mine, adj)).solved); }
  }
  console.log(`      (${repaired}/40 needed repair, ${ok}/40 solvable)`);
  assert.ok(repaired >= 10 && ok >= 38);
});

test('no-guess falls back gracefully when the budget runs out', () => {
  const b = boards.moon; const rand = mulberry32(4);
  // absurd density + 1 solve allowed: must return a valid board flagged solvable=false, not hang/throw
  const g = generateMines(b, 150, 0, rand, { noGuess: true, maxSolves: 1 });
  let m = 0; for (let i = 0; i < b.count; i++) m += g.mine[i];
  assert.strictEqual(m, 150); assert.strictEqual(g.mine[0], 0);
  assert.ok(g.solvable === true || g.solvable === false);
  let t = 0; const g2 = generateMines(b, 150, 0, mulberry32(4), { noGuess: true, maxSolves: 1e9, timeBudgetMs: 5, now: () => (t += 3) });
  assert.ok(g2.solves <= 3, 'time budget respected (fake clock)'); assert.strictEqual(g2.mine[0], 0);
});

test('a no-guess Game can be won by following the solver move by move', () => {
  for (const d of Object.values(DIFFICULTIES)) for (let s = 0; s < 8; s++) {
    const b = boards[d.key]; const g = new Game(b, d.mines, 70 + s, { noGuess: true });
    const start = (s * 101) % b.count; g.reveal(start);
    assert.ok(g.gen.solvable);
    const r = solve(b, g.mineCount, start, c => (g.mine[c] ? -1 : g.adj[c]));
    for (const c of r.order) { if (g.cell[c] === 0) assert.notStrictEqual(g.reveal(c).type, 'boom'); }
    assert.strictEqual(g.status, 'won', `${d.key} seed ${s}`);
  }
});

/* ---------------------------------------------------------------- v2: Daily Planet */
test('daily: same date gives the identical board, theme and landing every time', () => {
  const b = boards.planet;
  for (const key of ['2026-10-07', '2027-01-01', '2026-02-28']) {
    const a = L.dailyGame(key, b, 68), c = L.dailyGame(key, b, 68);
    assert.strictEqual(a.plan.landing, c.plan.landing); assert.strictEqual(a.plan.theme, c.plan.theme);
    assert.deepStrictEqual([...a.game.mine], [...c.game.mine]);
    assert.strictEqual(a.game.gen.solvable, true, 'daily is no-guess');
    assert.strictEqual(a.game.mine[a.plan.landing], 0);
    assert.strictEqual(a.game.reveal(a.plan.landing).type, 'open');
  }
});

test('daily: different dates give different boards; themes rotate through all worlds', () => {
  const b = boards.planet; const sigs = new Set(), themes = new Set();
  let key = '2026-10-01';
  for (let i = 0; i < 30; i++) {
    const { game, plan } = L.dailyGame(key, b, 68);
    sigs.add(plan.landing + ':' + [...game.mine].join('')); themes.add(plan.theme);
    if (i === 0) assert.strictEqual(plan.number, 1);
    key = L.addDays(key, 1);
  }
  assert.strictEqual(sigs.size, 30); assert.deepStrictEqual([...themes].sort(), ['giant', 'moon', 'planet']);
});

test('date helpers: dateKey / addDays / dayNumber across month and year ends', () => {
  assert.strictEqual(L.dateKey(new Date(2026, 9, 7)), '2026-10-07');
  assert.strictEqual(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(L.addDays('2028-03-01', -1), '2028-02-29');
  assert.strictEqual(L.dayNumber('2026-10-08') - L.dayNumber('2026-10-07'), 1);
});

/* ---------------------------------------------------------------- v2: Zen shields */
test('zen: three mistakes are absorbed (mine locked as flag), the fourth ends the run', () => {
  const b = boards.planet; const g = new Game(b, 68, 123, { shields: 3 });
  g.reveal(0);
  const mines = []; for (let i = 0; i < b.count; i++) if (g.mine[i]) mines.push(i);
  for (let k = 0; k < 3; k++) {
    const r = g.reveal(mines[k]);
    assert.strictEqual(r.type, 'shield'); assert.deepStrictEqual(r.defused, [mines[k]]);
    assert.strictEqual(g.status, 'playing'); assert.strictEqual(g.shields, 2 - k);
    assert.strictEqual(g.flag[mines[k]], 1); assert.strictEqual(g.defused[mines[k]], 1);
    assert.strictEqual(g.toggleFlag(mines[k]), false, 'defused flag cannot be removed');
  }
  assert.strictEqual(g.mistakes, 3);
  const r = g.reveal(mines[3]); assert.strictEqual(r.type, 'boom'); assert.strictEqual(g.status, 'lost');
});

test('zen: a game with spent shields can still be won', () => {
  const b = boards.moon; const g = new Game(b, 30, 9, { shields: 3 }); g.reveal(10);
  const m = g.mine.indexOf(1); assert.strictEqual(g.reveal(m).type, 'shield');
  for (let i = 0; i < b.count; i++) if (!g.mine[i] && g.cell[i] === 0) g.reveal(i);
  assert.strictEqual(g.status, 'won'); assert.strictEqual(g.shields, 2);
});

test('zen: chording into a wrong flag spends a shield instead of exploding', () => {
  const c = 100, nbs = board.neighbors[c];
  const g = new Game(board, 0, 1, { shields: 3 }); g.setMines([nbs[0]]); g.status = 'playing';
  g.reveal(c); g.toggleFlag(nbs[1]);
  const r = g.chord(c);
  assert.strictEqual(r.type, 'shield'); assert.deepStrictEqual(r.defused, [nbs[0]]); assert.strictEqual(g.shields, 2);
  assert.strictEqual(g.status, 'playing');
});

/* ---------------------------------------------------------------- v2: stats + achievements */
test('stats: wins, losses, streaks and best times per world', () => {
  let s = L.emptyStats(), r;
  r = L.recordGame(s, { mode: 'classic', world: 'moon', win: true, time: 80, flagsUsed: 3 }); s = r.stats;
  assert.deepStrictEqual(r.unlocked, ['first_win']); assert.ok(r.isBest);
  r = L.recordGame(s, { mode: 'classic', world: 'moon', win: true, time: 95, flagsUsed: 3 }); s = r.stats;
  assert.ok(!r.isBest); assert.strictEqual(s.worlds.moon.best, 80); assert.strictEqual(r.prevBest, 80);
  r = L.recordGame(s, { mode: 'classic', world: 'moon', win: true, time: 50, flagsUsed: 0 }); s = r.stats;
  assert.deepStrictEqual(r.unlocked.sort(), ['no_flags', 'speed_moon', 'streak3']);
  assert.strictEqual(s.streak, 3); assert.strictEqual(s.bestStreak, 3);
  r = L.recordGame(s, { mode: 'classic', world: 'planet', win: false, time: 20 }); s = r.stats;
  assert.strictEqual(s.streak, 0); assert.strictEqual(s.bestStreak, 3); assert.strictEqual(s.played, 4); assert.strictEqual(s.wins, 3);
  r = L.recordGame(s, { mode: 'zen', world: 'giant', win: true, time: 400, flagsUsed: 9, shieldsLost: 0 }); s = r.stats;
  assert.deepStrictEqual(r.unlocked.sort(), ['giant', 'zen_perfect']); assert.strictEqual(s.worlds.giant.zenBest, 400); assert.strictEqual(s.worlds.giant.best, null);
  r = L.recordGame(s, { mode: 'classic', world: 'planet', win: true, time: 200, flagsUsed: 9 }); s = r.stats;
  assert.ok(r.unlocked.includes('all_worlds'));
  r = L.recordGame(s, { mode: 'classic', world: 'planet', win: true, time: 190, flagsUsed: 9 });
  assert.deepStrictEqual(r.unlocked, [], 'achievements unlock once');
  assert.deepStrictEqual(L.normalizeStats(JSON.parse(JSON.stringify(r.stats))), r.stats, 'round-trips through JSON');
});

test('daily streak: consecutive days count up, a gap resets, replaying today keeps it, 7 unlocks Seven Suns', () => {
  let s = L.emptyStats(), r, key = '2026-10-01';
  for (let i = 0; i < 7; i++) {
    r = L.recordGame(s, { mode: 'daily', world: 'planet', win: true, time: 100 - i, dateKey: key, flagsUsed: 2 }); s = r.stats;
    assert.strictEqual(s.daily.streak, i + 1);
    if (i === 0) assert.ok(r.unlocked.includes('daily_first'));
    if (i < 6) assert.ok(!r.unlocked.includes('daily7')); else assert.ok(r.unlocked.includes('daily7'));
    key = L.addDays(key, 1);
  }
  const today = L.addDays(key, -1);
  r = L.recordGame(s, { mode: 'daily', world: 'planet', win: true, time: 50, dateKey: today, flagsUsed: 2 }); s = r.stats;
  assert.strictEqual(s.daily.streak, 7, 'replay does not double count'); assert.ok(r.isBest); assert.strictEqual(s.daily.history[today], 50);
  assert.strictEqual(L.dailyStreakNow(s, today), 7); assert.strictEqual(L.dailyStreakNow(s, L.addDays(today, 1)), 7);
  assert.strictEqual(L.dailyStreakNow(s, L.addDays(today, 2)), 0, 'missed a day: lapsed');
  r = L.recordGame(s, { mode: 'daily', world: 'planet', win: true, time: 90, dateKey: L.addDays(today, 3), flagsUsed: 2 });
  assert.strictEqual(r.stats.daily.streak, 1); assert.strictEqual(r.stats.daily.bestStreak, 7);
});

test('normalizeStats tolerates junk / older saves', () => {
  for (const junk of [null, 5, 'x', {}, { played: 3, worlds: { moon: { wins: 1 } } }]) {
    const s = L.normalizeStats(junk);
    assert.ok(s.worlds.giant && s.daily && s.achievements);
  }
  assert.strictEqual(L.normalizeStats({ played: 3, worlds: { moon: { wins: 1 } } }).worlds.moon.played, 0);
});

console.log(`\n${passed} tests passed`);
