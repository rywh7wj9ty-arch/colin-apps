// Composes the 28 levels from hand-built pattern pieces + per-level specs, validates each with the solver,
// and writes levels.js (runtime data) and tools/solutions.json (scripted perfect runs).
import fs from 'fs';
import { solve } from './solver.mjs';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const WORLDS = [
  { name: 'Dawn Drift', ncol: 2 },
  { name: 'Misty Peaks', ncol: 2 },
  { name: 'Dune Dusk', ncol: 3 },
  { name: 'Neon Night', ncol: 3 },
];
// [name, chunk recipe, difficulty]. Recipes list pattern pieces in order; first use of a mechanic is an intro piece.
const SPECS = [
  // World 1: colour basics, gates, pads
  ['First Light', 'run hopN hopN run hop gemA hop run hopC gemB hop hop gemC run', 0.05],
  ['Morning Breeze', 'run hopN hopG hopG gemA hopM hopN hopG gemB hopM hopG gemC hopN', 0.15],
  ['Quick Change', 'run hopC hopC hop gemA hopC stairs gemB hopC hop gemC hopC hop', 0.25],
  ['Thin Lines', 'run gateI hop gate gemA hop gate hopC gemB gate hop gemC gate', 0.3],
  ['Spring Step', 'run padI hop pad gemA hop gate pad gemB hopC hop gemC pad hop', 0.35],
  ['Paint the Sky', 'run hopC gate pad gemA stairs gate hopC gemB pad gate gemC hopC gate', 0.45],
  ['Sunrise Rush', 'run stairs gateAir hopC pad gemA gateAir hopC stairs gemB pad gateAir gemC hopC gate hop', 0.55],
  // World 2: spikes, movers, ceilings
  ['Thorn Valley', 'run spikeI hop spike gemA hopC spike gemB hop gate gemC spike hop', 0.3],
  ['Drifting Stones', 'run moverI hop mover gemA spike hopC mover gemB hop gemC mover hop', 0.4],
  ['Low Clouds', 'run ceilI hop ceil gemA hopC spike gemB ceil hop gemC mover ceil', 0.45],
  ['Fog Bank', 'run gate spike mover gemA ceil hopC pad gemB gate spike gemC mover hopC', 0.5],
  ['Ridge Runner', 'run stairs spike ceil gemA mover gateAir pad gemB spike stairs gemC ceil hopC', 0.6],
  ['Summit Sprint', 'run mover spike gateAir gemA ceil pad stairs gemB mover spike gateAir gemC hopC ceil', 0.65],
  ['Peak Hour', 'run pad spike mover gemA gateAir ceil stairs gemB spike mover gateAir gemC pad hopC', 0.7],
  // World 3: third colour, flips, falling
  ['Third Hue', 'run hop3 hopC hopC gemA gate hopC gemB stairs hop gemC hopC', 0.35],
  ['Shifting Sand', 'run flipI hop flip gemA hopC flip gemB gate gemC flip hop', 0.4],
  ['Crumble Road', 'run fallI hop fall gemA hopC fall gemB gate flip gemC fall hop', 0.45],
  ['Mirage', 'run flip gateAir fall gemA spike mover gemB flip stairs gemC fall hopC', 0.55],
  ['Dust Devil', 'run stairs fall flip gemA ceil gateAir pad gemB fall spike gemC flip hopC', 0.6],
  ['Sunset Spiral', 'run flip fall gateAir gemA mover flip spike gemB fall stairs gemC gateAir hopC', 0.7],
  ['Ember Dunes', 'run fall flip pad gemA gateAir fall spike gemB flip mover gemC stairs fall hopC', 0.75],
  // World 4: gravity gates + everything
  ['Upside', 'run gravI hop gemA grav hopC gemB grav hop gemC hopC', 0.4],
  ['City Lights', 'run grav gate hopC gemA grav spike gemB flip grav gemC hop', 0.5],
  ['Overpass', 'run ceil grav mover gemA gateAir grav gemB fall pad gemC grav hopC', 0.55],
  ['Neon Rain', 'run grav flip spike gemA grav fall gemB gateAir grav gemC stairs hopC', 0.62],
  ['Skyline', 'run stairs grav gateAir gemA flip grav mover gemB spike grav gemC fall hopC', 0.68],
  ['Midnight Line', 'run grav fall gateAir gemA grav flip spike gemB mover grav pad gemC hopC', 0.74],
  ['Prism Heart', 'run grav gateAir flip gemA grav fall stairs gemB grav spike mover gemC gateAir grav hopC', 0.8],
];

function build(wi, spec, seed) {
  const [name, recipe, diff] = spec;
  const W = WORLDS[wi];
  const R = rng(seed);
  const ncol = (wi === 2 && recipe.includes('hop3')) || wi >= 2 ? 3 : 2;
  const els = [];
  let x = 0, y = 0, lastC = 0, gemK = 0, boostK = 0, gravK = 0;
  const rc = (allowN = true) => { const opts = []; for (let c = allowN ? 0 : 1; c <= ncol; c++) if (c !== lastC || c === 0) opts.push(c); return opts[Math.floor(R() * opts.length)]; };
  const rcol = () => 1 + Math.floor(R() * ncol);
  const plat = (w, c, yy, o = {}) => { els.push({ t: 'p', x, w, y: yy, h: o.h ?? 2.2, c, ...o }); x += w; y = yy; lastC = c; };
  const gap = g => { x += g; };
  const dyPick = (lo, hi) => { let ny = y + [-1.5, -1, 0, 0, 0.5, 1, 1.5][Math.floor(R() * 7)]; return Math.max(lo, Math.min(hi, ny)); };
  const G = (lo, hi) => lo + R() * (hi - lo) * (0.6 + diff * 0.6);
  const boost = (bx, by) => els.push({ t: 'b', x: bx, y: by, k: boostK++ });
  const pieces = {
    run: () => plat(14, 0, 0),
    hopN: () => { gap(G(2, 3)); plat(5 + R() * 3, 0, dyPick(-1, 2)); },
    hop: () => { gap(G(2, 4)); plat(4 + R() * 4 * (1 - diff * 0.5), rc(), dyPick(-1.5, 3)); },
    hopC: () => { gap(G(2.5, 4)); plat(3.5 + R() * 3, rc(false), dyPick(-1.5, 3)); },
    hopG: () => { gap(G(2.5, 3.5)); plat(5, 2, dyPick(-1, 2)); },
    hopM: () => { gap(G(2.5, 3.5)); plat(5, 1, dyPick(-1, 2)); },
    hop3: () => { gap(3); plat(6, 3, y); },
    stairs: () => { const n = 3 + Math.floor(diff * 3); for (let i = 0; i < n; i++) { gap(G(2.2, 3.2)); let c; do c = rcol(); while (c === lastC); plat(2.6 + R() * 1.4, c, Math.max(-1, Math.min(3.5, y + (R() < 0.6 ? 0.8 : -0.8)))); } },
    gateI: () => { gap(3); plat(16, 0, y); const c = rcol(); els.push({ t: 'w', x: x - 9, y: y - 0.5, h: 7, c }); },
    gate: () => { gap(G(2, 3)); const sx = x; plat(12, 0, y); const c1 = rcol(); let c2 = rcol(); if (diff > 0.25) while (c2 === c1) c2 = rcol(); els.push({ t: 'w', x: sx + 4, y: y - 0.5, h: 7, c: c1 }); els.push({ t: 'w', x: sx + 9, y: y - 0.5, h: 7, c: c2 }); },
    gateAir: () => { const g = 5.5; gap(g / 2); const c = rcol(); els.push({ t: 'w', x, y: y - 6, h: 14, c }); gap(g / 2); let c2; do c2 = rcol(); while (c2 === c); plat(5, c2, y); },
    padI: () => { gap(3); const c = rcol(); plat(2.5, c, y, { pad: 1 }); gap(7); plat(8, 0, Math.min(5, y + 4)); gap(3); plat(6, 0, y - 3); },
    pad: () => { gap(G(2.5, 3.5)); const c = rcol(); plat(2.5, c, y, { pad: 1 }); gap(7 + R() * 2); let c2 = rcol(); plat(6, c2, Math.min(5.5, y + 3.5 + R())); gap(3); plat(5, rc(), y - 2.5 - R()); },
    spikeI: () => { gap(3); plat(14, 0, y); els.push({ t: 's', x: x - 7, y, w: 0.9 }); },
    spike: () => { gap(G(2, 3)); const c = rc(); plat(13, c, y); const n = 1 + Math.floor(R() * (1 + diff * 3)); els.push({ t: 's', x: x - 7, y, w: 0.8 * n }); },
    moverI: () => { gap(3); plat(3.5, 0, y, { ma: 1.2, mp: 3, ph: 0, h: 0.8 }); gap(3); plat(8, 0, y); },
    mover: () => { gap(G(2.5, 3)); const c = rc(); plat(3.5, c, y + 0.5, { ma: 1 + diff, mp: 2.6, ph: R() * 6, h: 0.8 }); y -= 0.5; gap(G(2.5, 3.2)); plat(6, rc(), dyPick(-1, 2)); },
    ceilI: () => { gap(3); const sx = x; plat(16, 0, y); els.push({ t: 'p', x: sx + 4, w: 9, y: y + 9, h: 6.9, c: 0 }); },
    ceil: () => { gap(G(2.2, 3)); const sx = x, c = rc(); plat(15, c, y); els.push({ t: 'p', x: sx + 4, w: 8, y: y + 9, h: 6.9, c: 0 }); if (diff > 0.5) els.push({ t: 'w', x: sx + 8, y: y - 0.5, h: 2.6, c: rcol() }); },
    flipI: () => { gap(3); plat(10, 1, y, { c2: 2, fp: 1.6, fo: 0 }); gap(3); plat(6, 0, y); },
    flip: () => { gap(G(2.5, 3.5)); const c = rcol(); let c2; do c2 = rcol(); while (c2 === c); plat(8 + R() * 4, c, y, { c2, fp: 1.7 - diff * 0.5, fo: R() * 2 }); },
    fallI: () => { gap(3); for (let i = 0; i < 3; i++) { plat(3, 0, y, { fall: 1, h: 0.7 }); gap(1.4); } plat(6, 0, y); },
    fall: () => { gap(G(2.2, 3)); const n = 3 + Math.floor(diff * 2); for (let i = 0; i < n; i++) { plat(2.8, rc(), y, { fall: 1, h: 0.7 }); gap(1.4 + R() * diff * 1.5); } plat(5, 0, y); },
    gravI: () => grav(true),
    grav: () => grav(false),
    gemA: () => gem(), gemB: () => gem(), gemC: () => gem(),
  };
  function grav(intro) {
    gap(2.5); plat(5, 0, y);
    const gx = x - 1.5; els.push({ t: 'G', x: gx, y, k: gravK++ });
    const cy = y + 6.5; // ceiling underside
    let cx = x - 1;
    const n = intro ? 2 : 3 + Math.floor(diff * 2);
    let lc = 0;
    for (let i = 0; i < n; i++) {
      const w = intro ? 9 : 5 + R() * 3; let c = intro ? 0 : rcol(); if (c === lc && c) c = 1 + (c % ncol);
      els.push({ t: 'p', x: cx, w, y: cy + 1.2, h: 1.2, c }); lc = c;
      if (!intro && i === 1 && diff > 0.55) els.push({ t: 's', x: cx + w / 2, y: cy, w: 0.8, up: 1 });
      cx += w + (intro ? 3 : G(2.2, 3.2));
    }
    els.push({ t: 'G', x: cx - 1.5, y, k: gravK++ });
    x = cx + 2; plat(8, 0, y);
  }
  function gem() {
    const k = gemK++;
    const r = R();
    if (r < 0.5) { // high air gem across a gap: double jump needed
      gap(G(2, 3)); plat(6, 0, y); const g = 5; els.push({ t: 'e', x: x + g / 2, y: y + 4.6, k }); gap(g); plat(6, 0, y);
      boost(x - 3, y + 2.4);
    } else { // loft: floating platform above a base of another colour
      gap(G(2, 3)); const sx = x, base = rcol(); plat(18, base, y); let lc; do lc = rcol(); while (lc === base);
      els.push({ t: 'p', x: sx + 5, w: 6, y: y + 3.4, h: 0.6, c: lc }); els.push({ t: 'e', x: sx + 8, y: y + 4.6, k });
      boost(sx + 14, y + 2.2);
    }
  }
  const list = recipe.split(/\s+/);
  for (const p of list) { if (!pieces[p]) throw new Error('piece ' + p); pieces[p](); }
  // pad short levels to ~21 s using this level's own (non-intro) pieces
  const v0 = 8.6 + diff * 1.2 + wi * 0.25, v1 = 10.8 + diff * 1.6 + wi * 0.3, want = 21.5 * (v0 + v1) / 2 + 6;
  const fill = list.filter(p => !/^(run|gem|.*I$)/.test(p)); let fi = 0;
  while (x < want && fill.length) pieces[fill[fi++ % fill.length]]();
  gap(3); plat(24, 0, y); const end = x - 16;
  const minY = Math.min(...els.filter(e => e.t === 'p').map(e => e.y)) - 12;
  const maxY = Math.max(...els.filter(e => e.t === 'p').map(e => e.y)) + 14;
  return { name, world: wi, ncol, v0: 8.6 + diff * 1.2 + wi * 0.25, v1: 10.8 + diff * 1.6 + wi * 0.3, start: 2, end, minY, maxY, finish: end, els };
}

const out = [], sols = [];
const only = process.argv[2] ? +process.argv[2] : -1;
const prev = fs.existsSync(new URL('./seeds.json', import.meta.url)) ? JSON.parse(fs.readFileSync(new URL('./seeds.json', import.meta.url))) : {};
let li = 0;
for (let wi = 0; wi < 4; wi++) {
  for (let j = 0; j < 7; j++, li++) {
    const spec = SPECS[li];
    let seed = prev[li] ?? (li * 101 + 7), lvl, sol;
    for (let tries = 0; tries < 40; tries++, seed++) {
      lvl = build(wi, spec, seed);
      if (only >= 0 && only !== li && prev[li] !== undefined) { sol = null; break; }
      sol = solve(JSON.parse(JSON.stringify(lvl)));
      if (sol && sol.gems === 7) break;
      process.stderr.write(`  L${li} seed ${seed} fail ${sol ? 'gems ' + sol.gems : 'nofinish'}\n`);
      sol = null;
    }
    prev[li] = seed;
    lvl.id = li;
    if (sol) {
      lvl.target = Math.ceil((sol.time + 0.6) * 10) / 10;
      lvl.par = sol.switches + 2;
      sols[li] = sol.script;
      console.log(`L${li} ${spec[0]} seed ${seed} time ${sol.time.toFixed(2)} sw ${sol.switches} boosts ${sol.boosts.toString(2)} len ${lvl.end.toFixed(0)}`);
    } else console.log(`L${li} ${spec[0]} UNSOLVED`);
    out.push(lvl);
  }
}
fs.writeFileSync(new URL('./seeds.json', import.meta.url), JSON.stringify(prev));
const solPath = new URL('./solutions.json', import.meta.url);
const oldSols = fs.existsSync(solPath) ? JSON.parse(fs.readFileSync(solPath)) : [];
const oldLv = fs.existsSync(new URL('../levels.js', import.meta.url)) ? null : null;
for (let i = 0; i < 28; i++) if (!sols[i] && oldSols[i]) sols[i] = oldSols[i];
fs.writeFileSync(solPath, JSON.stringify(sols));
const r = v => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
fs.writeFileSync(new URL('../levels.js', import.meta.url), '// Generated by tools/build-levels.mjs\nexport const WORLDS = ' + JSON.stringify(WORLDS) + ';\nexport const LEVELS = ' + JSON.stringify(out, (k, v) => k === 'i' ? undefined : r(v)) + ';\n');
