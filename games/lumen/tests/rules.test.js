import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, SHAPES, Bag, mulberry32, dailySeed, clearScore, attackFor, kicksFor, gravityMsPerRow, HIDDEN, ROWS, COLS, TYPES } from '../js/rules.js';
import { recordGame, newStats, sanitizeStats, addDays, ACHIEVEMENTS } from '../js/stats.js';

const noop = () => {};
function g0(opts = {}) { return new Game({ seed: 1, ...opts }); }
const sortCells = c => c.map(a => a.join(',')).sort();

test('shapes: SRS spawn + rotation states', () => {
  assert.deepEqual(sortCells(SHAPES.T[1]), sortCells([[1, 0], [1, 1], [2, 1], [1, 2]]));
  assert.deepEqual(sortCells(SHAPES.T[2]), sortCells([[0, 1], [1, 1], [2, 1], [1, 2]]));
  assert.deepEqual(sortCells(SHAPES.I[1]), sortCells([[2, 0], [2, 1], [2, 2], [2, 3]]));
  assert.deepEqual(sortCells(SHAPES.I[2]), sortCells([[0, 2], [1, 2], [2, 2], [3, 2]]));
  assert.deepEqual(SHAPES.O[0], SHAPES.O[3]);
});

test('spawn position: centred, one row in view', () => {
  const g = g0(); g.setQueue(['T']); g.spawn();
  const cells = g.cellsOf();
  assert.deepEqual(sortCells(cells), sortCells([[4, HIDDEN - 1], [3, HIDDEN], [4, HIDDEN], [5, HIDDEN]]));
  g.setQueue(['I']); g.spawn();
  assert.deepEqual(sortCells(g.cellsOf()), sortCells([[3, HIDDEN], [4, HIDDEN], [5, HIDDEN], [6, HIDDEN]]));
  g.setQueue(['O']); g.spawn();
  assert.deepEqual(sortCells(g.cellsOf()).length, 4); assert.ok(g.cellsOf().every(([x]) => x === 4 || x === 5));
});

test('7-bag: every bag is a permutation; seeded and deterministic', () => {
  const b = new Bag(mulberry32(42)); const seq = [];
  for (let i = 0; i < 700; i++) seq.push(b.next());
  for (let i = 0; i < 700; i += 7) assert.deepEqual(seq.slice(i, i + 7).sort(), TYPES.slice().sort());
  const b2 = new Bag(mulberry32(42)); for (let i = 0; i < 700; i++) assert.equal(b2.next(), seq[i]);
  // max gap between I pieces in a 7-bag is 12
  let last = -1, gap = 0; seq.forEach((t, i) => { if (t === 'I') { if (last >= 0) gap = Math.max(gap, i - last - 1); last = i; } });
  assert.ok(gap <= 12);
});

test('daily seed: same date -> same pieces, different date -> different', () => {
  assert.equal(dailySeed('2026-10-09'), dailySeed('2026-10-09'));
  assert.notEqual(dailySeed('2026-10-09'), dailySeed('2026-10-10'));
  const a = new Game({ mode: 'daily', seed: dailySeed('2026-10-09') }), b = new Game({ mode: 'daily', seed: dailySeed('2026-10-09') });
  const seqA = [a.cur.type, ...a.queue.slice(0, 5)], seqB = [b.cur.type, ...b.queue.slice(0, 5)];
  assert.deepEqual(seqA, seqB);
  for (let i = 0; i < 30; i++) { a.hardDrop(); b.hardDrop(); if (a.over) break; assert.equal(a.cur.type, b.cur.type); }
});

test('kick tables: SRS I and JLSTZ values', () => {
  assert.deepEqual(kicksFor('T', 0, 1), [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]);
  assert.deepEqual(kicksFor('I', 0, 1), [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]);
  assert.deepEqual(kicksFor('I', 1, 2), [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]);
  assert.deepEqual(kicksFor('O', 0, 1), [[0, 0]]);
  assert.equal(kicksFor('T', 0, 2).length, 6);
});

test('SRS: I-piece wall kick off the right wall', () => {
  const g = g0(); g.setBoard([]);
  g.setPiece('I', 1, 7, 30); // vertical in column 9 (box x 7 + 2)
  assert.ok(g.cellsOf().every(([x]) => x === 9));
  assert.ok(g.rotate(1));  // R -> 2 needs a kick left: test 1 (-1,0) fails? -> uses a kick so it stays in bounds
  assert.ok(g.cellsOf().every(([x]) => x >= 0 && x < COLS));
  assert.equal(g.cur.rot, 2);
  assert.ok(g.lastKick > 0);
});

test('SRS: I-piece floor kick (0->R at the floor kicks up)', () => {
  const g = g0(); g.setBoard([]);
  g.setPiece('I', 0, 3, ROWS - 2); // flat on the floor (cells in row 39)
  assert.ok(g.cellsOf().every(([, y]) => y === ROWS - 1));
  assert.ok(g.rotate(1));
  assert.ok(g.cellsOf().every(([, y]) => y < ROWS));
  assert.equal(g.lastKick, 4); // (1,+2): up two
});

test('T-spin triple (classic TST via 5th kick) scores 1600 and clears 3', () => {
  const g = g0(); g.setQueue(['O', 'O', 'O']);
  g.setBoard([
    '.#........', // row 35: overhang over column 1
    '..........', // 36
    '#.########', // 37
    '#..#######', // 38
    '#.########', // 39
  ]);
  g.setPiece('T', 0, 1, 35); // flat T, cells (2,35),(1,36),(2,36),(3,36)
  assert.ok(g.fits('T', 0, 1, 35));
  assert.ok(g.rotate(1));
  assert.equal(g.lastKick, 4);
  assert.equal(g.detectSpin(), 'full');
  g.hardDrop();
  assert.equal(g.lines, 3); assert.equal(g.st.tspin.full3, 1); assert.equal(g.score, 1600);
});

test('T-spin double (rotate into a TSD slot)', () => {
  const g = g0(); g.setQueue(['O', 'O']);
  g.setBoard([
    '###.......', // 37: overhang
    '##...#####', // 38
    '###.######', // 39
  ]);
  g.setPiece('T', 2, 2, 36); // pointing down, sitting above the slot? place in state R then rotate into slot
  // drop a T in state 0 into the slot cavity: rotate from R -> 2 at the bottom
  g.setPiece('T', 1, 2, 37); // cells (3,37),(3,38),(4,38),(3,39)
  assert.ok(g.fits('T', 1, 2, 37));
  assert.ok(g.rotate(1)); // R -> 2 : cells (2,38),(3,38),(4,38),(3,39)
  assert.equal(g.cur.rot, 2);
  const spin = g.detectSpin();
  assert.equal(spin, 'full');
  g.hardDrop();
  assert.equal(g.lines, 2); assert.equal(g.st.tspin.full2, 1); assert.equal(g.score, 1200);
});

test('Mini T-spin single', () => {
  const g = g0(); g.setQueue(['O', 'O']);
  g.setBoard([
    '....#.....', // 37: one front corner
    '####...###', // 38
    '....#.#...', // 39
  ]);
  g.setPiece('T', 3, 4, 37); // state L: cells (5,37),(4,38),(5,38),(5,39)
  assert.ok(g.fits('T', 3, 4, 37));
  assert.ok(g.rotate(1)); // L -> 0 in place
  assert.equal(g.cur.rot, 0); assert.equal(g.lastKick, 0);
  assert.equal(g.detectSpin(), 'mini');
  g.hardDrop();
  assert.equal(g.lines, 1); assert.equal(g.st.tspin.mini1, 1); assert.equal(g.score, 200);
});

test('no T-spin when the last move was not a rotation', () => {
  const g = g0(); g.setBoard(['###.......', '##...#####', '###.######']);
  g.setPiece('T', 2, 2, 37); assert.ok(g.fits('T', 2, 2, 37)); // placed, never rotated
  assert.equal(g.detectSpin(), 'none');
  g.hardDrop(); assert.equal(g.st.tspin.full2, 0); assert.equal(g.st.double, 1);
});

test('scoring table, B2B, combo, perfect clear', () => {
  assert.equal(clearScore({ lines: 1, level: 1 }), 100);
  assert.equal(clearScore({ lines: 4, level: 1 }), 800);
  assert.equal(clearScore({ lines: 4, level: 3 }), 2400);
  assert.equal(clearScore({ lines: 4, level: 1, b2b: true }), 1200);
  assert.equal(clearScore({ lines: 2, spin: 'full', level: 1, b2b: true }), 1800);
  assert.equal(clearScore({ lines: 0, spin: 'full', level: 1 }), 400);
  assert.equal(clearScore({ lines: 0, spin: 'mini', level: 1 }), 100);
  assert.equal(clearScore({ lines: 1, level: 2, combo: 3 }), 200 + 300);
  assert.equal(clearScore({ lines: 4, level: 1, pc: true }), 2800);
  assert.equal(clearScore({ lines: 4, level: 1, pc: true, b2b: true }), 1200 + 3200);
  assert.equal(attackFor({ lines: 4 }), 4); assert.equal(attackFor({ lines: 2, spin: 'full', b2b: true }), 5);
  assert.equal(attackFor({ lines: 1, combo: 2 }), 1); assert.equal(attackFor({ lines: 4, pc: true }), 14);
});

function tetrisBoard(g, n = 4) { g.setBoard(Array.from({ length: n }, () => '#########.')); }
function dropIVertical(g) { g.setPiece('I', 1, 7, ROWS - 4); g.hardDrop(); }

test('in-game B2B Tetrises and chain break', () => {
  const g = g0();
  tetrisBoard(g, 8);
  // put junk on top-left so the board isn't a perfect clear
  g.board[31][0] = 1; g.board[30][0] = 1;
  dropIVertical(g); assert.equal(g.st.tetris, 1); const s1 = g.score; assert.equal(s1, 800);
  dropIVertical(g); assert.equal(g.st.tetris, 2); assert.equal(g.score - s1, 1200 + 50 * 1); // b2b + combo 1
  assert.equal(g.b2b, 1); assert.equal(g.st.maxB2B, 1);
  // a single breaks the chain
  g.setBoard(['X.........', '#########.']); g.setPiece('I', 1, 7, 10); g.hardDrop();
  assert.equal(g.b2b, -1);
});

test('combo counter grows over consecutive clears and resets', () => {
  // direct counter check: three locks with lines then one without
  const c = g0(); c.setBoard(['X.........', '#########.']);
  c.setPiece('I', 1, 7, 10); c.hardDrop(); assert.equal(c.combo, 0); let s0 = c.score;
  c.setBoard(['X.........', '#########.']); c.setPiece('I', 1, 7, ROWS - 4); s0 = c.score; c.hardDrop(); assert.equal(c.combo, 1); assert.equal(c.score - s0, 100 + 50);
  c.setBoard(['X.........', '#########.']); c.setPiece('I', 1, 7, ROWS - 4); s0 = c.score; c.hardDrop(); assert.equal(c.combo, 2); assert.equal(c.score - s0, 100 + 100);
  assert.equal(c.st.maxCombo, 2);
  c.setBoard(['X.........']); c.setPiece('O', 0, 3, 10); c.hardDrop(); assert.equal(c.combo, -1);
});

test('perfect clear detection', () => {
  const g = g0(); tetrisBoard(g, 4); dropIVertical(g);
  assert.equal(g.st.pcs, 1); assert.equal(g.score, 800 + 2000);
  assert.ok(g.board.every(r => r.every(v => !v)));
});

test('lock delay: 500 ms without input, then locks', () => {
  const g = g0(); g.setBoard([]); g.setPiece('T', 0, 3, ROWS - 2);
  assert.ok(g.grounded());
  const p = g.cur; g.update(499); assert.equal(g.cur, p); g.update(2); assert.notEqual(g.cur, p); assert.equal(g.pieces, 1);
});

test('lock delay: move reset limited to 15, 16th grounded move locks', () => {
  const g = g0(); g.setBoard([]); g.setPiece('T', 0, 3, ROWS - 2);
  const p = g.cur;
  for (let i = 0; i < 15; i++) { g.update(400); assert.equal(g.cur, p, 'alive after reset ' + i); i % 2 ? g.moveLeft() : g.moveRight(); }
  assert.equal(g.resets, 15); assert.equal(g.cur, p);
  g.update(400); assert.equal(g.cur, p); // timer was reset by move 15
  g.moveRight();                       // 16th: no more resets, touching the ground -> locks
  assert.notEqual(g.cur, p); assert.equal(g.pieces, 1);
});

test('lock delay: reaching a new lowest row restores resets', () => {
  const g = g0(); g.setBoard(['#####.....']); g.setPiece('O', 0, -1, ROWS - 3); // on top of the ledge
  assert.ok(g.grounded());
  for (let i = 0; i < 3; i++) { g.moveRight(); g.moveLeft(); }
  assert.equal(g.resets, 6);
  // slide off the ledge to fall further: move right until it can fall
  while (g.grounded()) g.moveRight();
  assert.ok(g.cur);
  g.tryMove(0, 1); assert.equal(g.resets, 0);
});

test('gravity: level 1 = 1 row per second; DAS + ARR 0 slides to the wall', () => {
  const g = g0({ arr: 0, das: 133 }); g.setBoard([]); g.setQueue(['T']); g.spawn();
  const y0 = g.cur.y; g.update(999); assert.equal(g.cur.y, y0); g.update(2); assert.equal(g.cur.y, y0 + 1);
  assert.ok(Math.abs(gravityMsPerRow(1) - 1000) < 1e-9); assert.ok(gravityMsPerRow(15) < 10);
  g.pressDir(1); assert.equal(g.cur.x, 4); g.update(140); assert.equal(Math.max(...g.cellsOf().map(c => c[0])), 9);
  g.releaseDir(1);
});

test('hold: once per piece, swaps, resets after lock', () => {
  const g = g0(); g.setQueue(['I', 'O', 'S']); g.spawn(); // cur I
  assert.ok(g.holdPiece()); assert.equal(g.hold, 'I'); assert.equal(g.cur.type, 'O');
  assert.equal(g.holdPiece(), false);
  g.hardDrop(); assert.ok(g.holdPiece()); assert.equal(g.cur.type, 'I'); assert.equal(g.hold, 'S');
});

test('top out ends the game; Zen clears the board instead', () => {
  const g = g0();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (x !== 0 || y < 30) g.board[y][x] = 0;
  for (let i = 0; i < 60 && !g.over; i++) g.hardDrop();
  assert.ok(g.over); assert.equal(g.result, 'topout');
  const z = new Game({ mode: 'zen', seed: 1 });
  for (let i = 0; i < 80; i++) z.hardDrop();
  assert.ok(!z.over); assert.ok(z.st.zenResets >= 1);
});

test('Sprint completes at 40 lines; Ultra ends at 2:00; marathon levels every 10', () => {
  const s = new Game({ mode: 'sprint', seed: 3 }); s.lines = 36; tetrisBoard(s, 4); s.board[30][0] = 1; dropIVertical(s);
  assert.ok(s.over); assert.equal(s.result, 'complete');
  const u = new Game({ mode: 'ultra', seed: 3 }); u.time = 119500; u.update(600); assert.ok(u.over); assert.equal(u.result, 'timeup'); assert.equal(u.time, 120000);
  const m = new Game({ mode: 'marathon', seed: 3 }); m.lines = 8; tetrisBoard(m, 4); m.board[30][0] = 1; dropIVertical(m); assert.equal(m.level, 2);
});

test('summary: PPS and APM', () => {
  const g = g0(); tetrisBoard(g, 4); g.time = 2000; g.board[30][0] = 1; dropIVertical(g);
  const s = g.summary(); assert.equal(s.pieces, 1); assert.equal(s.pps, 0.5); assert.equal(s.attack, 4); assert.equal(s.apm, 120);
});

// ---------------- stats ----------------
function fakeSummary(o = {}) {
  return { mode: 'marathon', score: 1000, lines: 10, level: 2, timeMs: 60000, pieces: 30, pps: 0.5, apm: 4, attack: 4, clears: { single: 2, double: 1, triple: 0, tetris: 1 }, tspin: { mini0: 0, mini1: 0, mini2: 0, full0: 0, full1: 0, full2: 1, full3: 0 }, pcs: 0, maxCombo: 2, maxB2B: 1, result: 'topout', holds: 3, zenResets: 0, ...o };
}
test('stats: lifetime aggregation and per-mode bests', () => {
  let st = newStats();
  ({ stats: st } = recordGame(st, fakeSummary(), '2026-10-01T10:00:00Z'));
  const r = recordGame(st, fakeSummary({ score: 5000, lines: 25, level: 3, clears: { single: 0, double: 0, triple: 0, tetris: 3 } }), '2026-10-01T11:00:00Z');
  st = r.stats;
  assert.equal(st.lifetime.games, 2); assert.equal(st.lifetime.lines, 35); assert.equal(st.lifetime.clears.tetris, 4); assert.equal(st.lifetime.tspin.full2, 2);
  assert.equal(st.modes.marathon.best.score, 5000); assert.ok(r.records.score); assert.equal(r.records.rank, 1);
  assert.equal(st.lifetime.timeMs, 120000); assert.equal(st.lifetime.pieces, 60);
  assert.ok(st.achievements.first_light && st.achievements.four_fold && st.achievements.twist);
});
test('stats: top-10 leaderboard ordering and sprint time records', () => {
  let st = newStats();
  for (let i = 0; i < 14; i++) st = recordGame(st, fakeSummary({ score: i * 100 }), '2026-10-01T10:00:00Z').stats;
  assert.equal(st.modes.marathon.top.length, 10); assert.equal(st.modes.marathon.top[0].score, 1300); assert.equal(st.modes.marathon.top[9].score, 400);
  st = recordGame(st, fakeSummary({ mode: 'sprint', lines: 40, timeMs: 100000, result: 'complete' })).stats;
  const r = recordGame(st, fakeSummary({ mode: 'sprint', lines: 40, timeMs: 80000, result: 'complete' }));
  assert.ok(r.records.time); assert.equal(r.stats.modes.sprint.best.timeMs, 80000); assert.ok(r.unlocked.includes('quicksilver'));
  const r2 = recordGame(r.stats, fakeSummary({ mode: 'sprint', lines: 12, timeMs: 20000, result: 'topout' }));
  assert.equal(r2.stats.modes.sprint.best.timeMs, 80000); assert.equal(r2.records.rank, null);
});
test('stats: daily streak counts consecutive days, resets after a gap', () => {
  let st = newStats();
  const d = (day, score = 100) => { st = recordGame(st, fakeSummary({ mode: 'daily', score }), day + 'T12:00:00Z', day).stats; };
  d('2026-10-01'); d('2026-10-01'); assert.equal(st.daily.streak, 1);
  d('2026-10-02'); d('2026-10-03', 900); assert.equal(st.daily.streak, 3); assert.ok(st.achievements.ritual);
  assert.equal(st.daily.days['2026-10-03'], 900);
  d('2026-10-06'); assert.equal(st.daily.streak, 1); assert.equal(st.daily.bestStreak, 3);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('stats: sanitize survives garbage and partial data', () => {
  assert.equal(sanitizeStats(null).lifetime.games, 0);
  assert.equal(sanitizeStats('x').lifetime.games, 0);
  const s = sanitizeStats({ lifetime: { games: 4 }, modes: { sprint: { played: 2 } } });
  assert.equal(s.lifetime.games, 4); assert.equal(s.modes.sprint.played, 2); assert.deepEqual(s.modes.sprint.top, []);
  assert.ok(ACHIEVEMENTS.length >= 15);
});
