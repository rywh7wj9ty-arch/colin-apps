import * as L from '../logic.js';
import { BOARDS, CLASSIC, dailyDef } from '../levels.js';
import fs from 'fs';
let pass = 0, fail = 0; const out = [];
const ok = (c, m) => { if (c) pass++; else { fail++; out.push('FAIL ' + m); } };
const note = s => { console.log(s); fs.appendFileSync('/tmp/dig-buddies-notes.txt', s + '\n'); };
// neighbours on shaped boards
{ const b = L.makeBoard({ w: 13, h: 12, mines: 5, shape: 'heart', seed: 3 });
  let holes = 0; for (let i = 0; i < b.N; i++) if (!b.kind[i]) holes++; ok(holes > 10, 'heart has holes');
  for (let i = 0; i < b.N; i++) for (const j of b.nb[i]) { ok(b.kind[j] === 1, 'nb playable'); ok(Math.abs(j % 13 - i % 13) <= 1 && Math.abs(((j / 13) | 0) - ((i / 13) | 0)) <= 1, 'nb adjacent'); }
  ok(b.nb.every((n, i) => n.length <= 8 && (b.kind[i] === 1 || n.length === 0)), 'nb counts'); }
{ const b = L.makeBoard({ w: 3, h: 3, mines: 1 }); ok(b.nb[4].length === 8 && b.nb[0].length === 3, 'rect nb'); }
{ const b = L.makeBoard({ w: 6, h: 6, mines: 3, boulders: 4, seed: 9 }); for (let i = 0; i < b.N; i++) if (b.kind[i] === 2) ok(!b.nb.some(n => n.includes(i)), 'boulder never a neighbour'); }
// safe first tap + flood
for (let s = 0; s < 40; s++) {
  const b = L.makeBoard({ w: 9, h: 9, mines: 10, seed: s }); const f = (s * 7) % 81; const r = L.dig(b, f);
  ok(r.type === 'dig' && b.num[f] === 0 && !b.mine[f], 'safe first tap opens a zero ' + s);
  ok(r.cells.length > 1, 'first tap floods');
  for (const [i] of r.cells) { ok(!b.mine[i], 'flood never mines'); ok(b.revealed[i], 'flood revealed'); }
  for (const [i] of r.cells) if (b.num[i] === 0) for (const j of b.nb[i]) ok(b.revealed[j], 'zero neighbours opened');
}
// chording
{ const b = L.makeBoard({ w: 9, h: 9, mines: 10, seed: 5 }); L.dig(b, 40);
  let tested = 0;
  for (let i = 0; i < b.N && tested < 5; i++) {
    if (!b.revealed[i] || !b.num[i]) continue; const hid = b.nb[i].filter(j => !b.revealed[j]); if (!hid.length) continue;
    if (!b.nb[i].some(j => b.flagged[j])) ok(!L.canChord(b, i), 'no chord before flags');
    for (const j of b.nb[i]) if (b.mine[j] && !b.flagged[j]) L.toggleFlag(b, j);
    if (L.canChord(b, i)) { const r = L.chord(b, i); ok(r.poofs.length === 0, 'correct chord safe'); ok(b.nb[i].every(j => b.revealed[j] || b.flagged[j]), 'chord opened all'); tested++; }
  }
  ok(tested > 0, 'chord tested');
  const b2 = L.makeBoard({ w: 9, h: 9, mines: 10, seed: 6 }); L.dig(b2, 40);
  // wrong flag: chord pops a mine
  let did = false;
  for (let i = 0; i < b2.N && !did; i++) { if (!b2.revealed[i] || b2.num[i] !== 1) continue; const hid = b2.nb[i].filter(j => !b2.revealed[j]); const safe = hid.find(j => !b2.mine[j]); if (!safe || hid.length < 2) continue; L.toggleFlag(b2, safe); const r = L.chord(b2, i); ok(r.poofs.length === 1, 'wrong flag chord poofs'); did = true; }
  ok(did, 'wrong chord tested'); }
// hearts: popping is recorded and counts as a known mine
{ const b = L.makeBoard({ w: 9, h: 9, mines: 10, seed: 2 }); L.dig(b, 0); const m = b.mine.indexOf(1); const before = L.minesLeft(b); const r = L.dig(b, m);
  ok(r.type === 'poof' && b.popped[m] && L.minesLeft(b) === before - 1, 'poof recorded'); ok(L.dig(b, m).type === 'none', 'popped tile inert'); }
// ice and lantern rules
{ const b = L.makeBoard({ w: 5, h: 1, mines: 0 }); b.generated = true; b.ice[2] = 1; b.revealed[2] = 1; ok(!L.numberVisible(b, 2), 'ice hides alone'); b.revealed[3] = 1; ok(L.numberVisible(b, 2), 'ice shows with neighbour'); }
{ const b = L.makeBoard({ w: 9, h: 1, mines: 0, night: true }); b.lantern[0] = 1; b.revealed[4] = 1; ok(!L.isLit(b, 4), 'dark without lantern'); b.revealed[0] = 1; ok(!L.isLit(b, 4), 'lantern too far'); b.lantern[3] = 1; b.revealed[3] = 1; ok(L.isLit(b, 4) && L.isLit(b, 6) && !L.isLit(b, 7), 'lantern radius 3'); }
{ const b = L.makeBoard({ w: 10, h: 10, mines: 15, night: true, seed: 4 }); L.dig(b, 55); ok(b.lantern[55] && L.isLit(b, 55), 'first dig finds a lantern'); }
// stars
ok(JSON.stringify(L.starsFor({ won: true, heartsLost: 0, time: 10, target: 20 })) === '[true,true,true]', 'stars 3');
ok(JSON.stringify(L.starsFor({ won: true, heartsLost: 1, time: 30, target: 20 })) === '[true,false,false]', 'stars 1');
ok(JSON.stringify(L.starsFor({ won: false, heartsLost: 0, time: 1, target: 20 })) === '[false,false,false]', 'stars 0');
// daily seed
ok(L.dailySeed('2026-10-11') === L.dailySeed('2026-10-11') && L.dailySeed('2026-10-11') !== L.dailySeed('2026-10-12'), 'daily seed stable');
ok(L.prevDayKey('2026-03-01') === '2026-02-28' && L.prevDayKey('2026-01-01') === '2025-12-31', 'prev day');
{ const a = L.makeBoard(dailyDef(L.dailySeed('2026-10-11'))); L.generate(a, 50); const b = L.makeBoard(dailyDef(L.dailySeed('2026-10-11'))); L.generate(b, 50); ok(a.mine.join() === b.mine.join(), 'daily same board for same tap'); }
// no-guess: every adventure board from several first taps
let worst = 0, reduced = 0;
for (const def of BOARDS) {
  const cells = L.playable(L.makeBoard(def)); const taps = [cells[Math.floor(cells.length / 2)], cells[0], cells[cells.length - 1], cells[Math.floor(cells.length / 3)], cells[Math.floor(cells.length * 0.8)]];
  for (const t of taps) {
    const b = L.makeBoard(def); L.generate(b, t, { capMs: 1500 }); worst = Math.max(worst, b.genMs); if (b.genMs > 600) note(`slow: board ${def.id} tap ${t} ${b.genMs.toFixed(0)} ms tries ${b.genTries}`); if (b.mines < def.mines) reduced++;
    ok(L.solve(b, t).solved, `board ${def.id} ${def.name} solvable from ${t}`);
    // and a simulated game actually wins
    const b2 = L.makeBoard(def); L.generate(b2, t); ok(b2.mine.join() === b.mine.join(), 'deterministic ' + def.id);
  }
}
note(`adventure gen worst ${worst.toFixed(0)} ms, reduced-mine boards ${reduced}/${BOARDS.length * 5}`);
for (const c of CLASSIC) { const b = L.makeBoard({ ...c, seed: 77 }); L.generate(b, Math.floor(b.N / 2) + 3, { capMs: 2500 }); ok(L.solve(b, b.first).solved, 'classic ' + c.key); note(`classic ${c.key}: ${b.genMs.toFixed(0)} ms, ${b.genTries} tries, mines ${b.mines}/${c.mines}`); }
out.forEach(s => note(s)); note(`unit: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
