const L = require("./logic.js");
const assert = require("assert");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok  " + name);
}

test("first click is never a mine", () => {
  for (let seed = 1; seed < 80; seed++) {
    const rng = L.mulberry32(seed);
    const b = L.createEmpty(9, 9);
    const fr = (rng() * 9) | 0;
    const fc = (rng() * 9) | 0;
    L.placeMines(b, 10, fr, fc, rng);
    assert.equal(L.isMine(b, fr, fc), false, "mine on first click seed " + seed);
  }
});

test("first click prefers a zero opening", () => {
  let zeros = 0;
  for (let seed = 1; seed < 60; seed++) {
    const rng = L.mulberry32(seed * 17);
    const b = L.createEmpty(16, 16);
    L.placeMines(b, 40, 8, 8, rng);
    if (b.numbers[L.idx(b, 8, 8)] === 0) zeros++;
  }
  assert.ok(zeros === 59, "expected all grove center clicks to be zeros, got " + zeros);
});

test("when mines are dense, first click is still safe though not zero", () => {
  const rng = L.mulberry32(3);
  const b = L.createEmpty(9, 9);
  L.placeMines(b, 72, 4, 4, rng); // only 9 cells free if we protect neighborhood; 81-9=72
  assert.equal(L.isMine(b, 4, 4), false);
  assert.equal(b.mines.size, 72);
});

test("flood fill reveals the zero region and its numbered border", () => {
  const b = L.createEmpty(5, 5);
  b.mineCount = 1;
  b.mines.add("0,0");
  b.placed = true;
  L.recount(b);
  const res = L.revealCell(b, 4, 4);
  assert.equal(res.hitMine, null);
  assert.ok(res.cells.length > 1);
  assert.ok(b.revealed.has("4,4"));
  assert.ok(b.revealed.has("1,1")); // numbered border of the mine
  assert.equal(b.revealed.has("0,0"), false);
});

test("flag toggle and remaining counter", () => {
  const b = L.createEmpty(9, 9);
  b.mineCount = 10;
  const a = L.toggleFlag(b, 0, 0);
  assert.equal(a.flagged, true);
  assert.equal(L.remaining(b), 9);
  L.toggleFlag(b, 0, 0);
  assert.equal(L.remaining(b), 10);
  L.revealCell(b, 1, 1); // not placed — still ok, not a mine
  const no = L.toggleFlag(b, 1, 1);
  assert.equal(no.changed, false);
});

test("chord reveals neighbors when flag count matches", () => {
  const b = L.createEmpty(3, 3);
  b.mineCount = 1;
  b.mines.add("0,0");
  b.placed = true;
  L.recount(b);
  L.revealCell(b, 0, 1);
  L.toggleFlag(b, 0, 0);
  const res = L.chord(b, 0, 1);
  assert.equal(res.valid, true);
  assert.equal(res.hitMine, null);
  assert.ok(b.revealed.has("1,0"));
  assert.ok(b.revealed.has("1,1"));
});

test("chord onto a wrongly flagged cell hits a mine", () => {
  const b = L.createEmpty(3, 3);
  b.mineCount = 1;
  b.mines.add("0,0");
  b.placed = true;
  L.recount(b);
  L.revealCell(b, 2, 2);
  // flag a safe cell next to a 1? 2,2 may be 0 so flood. Use a numbered cell.
  // Reset with a clearer layout: mine at 0,0, reveal 0,1 (which is 1)
  const b2 = L.createEmpty(3, 3);
  b2.mineCount = 1;
  b2.mines.add("0,0");
  b2.placed = true;
  L.recount(b2);
  const open = L.revealCell(b2, 0, 1);
  assert.equal(b2.numbers[L.idx(b2, 0, 1)], 1);
  L.toggleFlag(b2, 0, 2); // wrong flag
  const res = L.chord(b2, 0, 1);
  assert.equal(res.valid, true);
  assert.ok(res.hitMine, "should hit the unflagged mine at 0,0");
  assert.equal(res.hitMine.r, 0);
  assert.equal(res.hitMine.c, 0);
});

test("win when all non-mine cells revealed, flags not required", () => {
  const b = L.createEmpty(4, 4);
  b.mineCount = 2;
  b.mines.add("0,0");
  b.mines.add("3,3");
  b.placed = true;
  L.recount(b);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!L.isMine(b, r, c)) L.revealCell(b, r, c);
    }
  }
  assert.equal(L.isWin(b), true);
  assert.equal(b.flags.size, 0);
});

test("custom clamps", () => {
  const a = L.clampCustom(2, 100, 10000);
  assert.equal(a.w, 5);
  assert.equal(a.h, 24);
  assert.ok(a.mines <= a.w * a.h - 9);
  const b = L.clampCustom(40, 24, 1);
  assert.equal(b.w, 40);
  assert.equal(b.mines, 1);
});

test("daily seed is deterministic", () => {
  const s1 = L.dailySeed("2026-08-27");
  const s2 = L.dailySeed("2026-08-27");
  const s3 = L.dailySeed("2026-08-28");
  assert.equal(s1, s2);
  assert.notEqual(s1, s3);
  const rngA = L.mulberry32(s1);
  const rngB = L.mulberry32(s1);
  const b1 = L.createEmpty(16, 16);
  const b2 = L.createEmpty(16, 16);
  L.placeMines(b1, 40, 4, 4, rngA);
  L.placeMines(b2, 40, 4, 4, rngB);
  assert.deepEqual([...b1.mines].sort(), [...b2.mines].sort());
});

test("heat does not reveal and reports density", () => {
  const b = L.createEmpty(3, 3);
  b.mineCount = 2;
  b.mines.add("0,0");
  b.mines.add("0,2");
  b.placed = true;
  L.recount(b);
  assert.equal(L.heatValue(b, 1, 1), 2);
  assert.equal(b.revealed.size, 0);
  L.revealCell(b, 2, 1);
  assert.equal(L.heatValue(b, 2, 1), 0);
});

test("migration never changes already-revealed numbers", () => {
  for (let seed = 1; seed < 40; seed++) {
    const rng = L.mulberry32(seed * 99);
    const b = L.createEmpty(9, 9);
    L.placeMines(b, 10, 4, 4, rng);
    L.revealCell(b, 4, 4);
    const revealedNums = {};
    for (const k of b.revealed) {
      const p = L.parseKey(k);
      revealedNums[k] = b.numbers[L.idx(b, p.r, p.c)];
    }
    for (let step = 0; step < 8; step++) {
      L.migrateMines(b, rng);
      assert.ok(L.verifyRevealedNumbers(b), "invariant broken seed " + seed + " step " + step);
      for (const k of Object.keys(revealedNums)) {
        const p = L.parseKey(k);
        assert.equal(
          b.numbers[L.idx(b, p.r, p.c)],
          revealedNums[k],
          "number changed at " + k
        );
      }
    }
  }
});

test("migration does not step onto revealed or flagged cells", () => {
  const rng = L.mulberry32(7);
  const b = L.createEmpty(9, 9);
  L.placeMines(b, 10, 4, 4, rng);
  L.revealCell(b, 4, 4);
  L.toggleFlag(b, 0, 0);
  const revealed = new Set(b.revealed);
  const flagged = new Set(b.flags);
  L.migrateMines(b, rng);
  for (const k of b.mines) {
    assert.equal(revealed.has(k), false);
    assert.equal(flagged.has(k), false);
  }
});

test("3BV is positive and finite", () => {
  const rng = L.mulberry32(42);
  const b = L.createEmpty(16, 16);
  L.placeMines(b, 40, 0, 0, rng);
  const v = L.compute3BV(b);
  assert.ok(v >= 1 && v <= 216);
});

test("chord is invalid when flag count mismatches", () => {
  const b = L.createEmpty(3, 3);
  b.mineCount = 2;
  b.mines.add("0,0");
  b.mines.add("0,2");
  b.placed = true;
  L.recount(b);
  L.revealCell(b, 1, 1); // should be 2
  assert.equal(b.numbers[L.idx(b, 1, 1)], 2);
  L.toggleFlag(b, 0, 0);
  const res = L.chord(b, 1, 1);
  assert.equal(res.valid, false);
});

console.log("\n" + passed + " tests passed");
