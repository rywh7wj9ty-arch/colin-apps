// HUE DASH core simulation: deterministic fixed-timestep physics shared by the game and the Node tests.
export const DT = 1 / 120;
export const G = 60, JUMP = 18, DJUMP = 16, PAD = 27, HOLD_T = 0.22, HOLD_G = 0.42;
export const PW = 0.3, PH = 1.4;
// forgiveness windows (seconds): coyote jump after leaving a ledge, buffered jump before landing, colour-touch grace
export const COYOTE = 0 /* off: the always-available air jump already covers late ledge taps, and a full ground jump here broke the verified level routes */, BUFFER = 0.12, GRACE = 0.07;
export const COLORS = [null, 'magenta', 'gold', 'cyan'];

export function nextColor(c, n) { return (c % n) + 1; }

export function colorAt(p, t) {
  if (!p.fp) return p.c;
  return Math.floor((t + (p.fo || 0)) / p.fp) % 2 ? p.c2 : p.c;
}
export function platY(p, t, st) {
  let y = p.y;
  if (p.ma) y += p.ma * Math.sin((Math.PI * 2 * t) / p.mp + (p.ph || 0));
  if (p.fall && st && st.fallT[p.i] !== undefined) {
    const d = t - st.fallT[p.i] - 0.4;
    if (d > 0) y -= 12.5 * d * d;
  }
  return y;
}

// Build lookup buckets for a level once.
export function prepare(lvl) {
  if (lvl._b) return lvl;
  const B = 4, buckets = [];
  lvl.els.forEach((e, i) => {
    e.i = i;
    const x0 = e.x - 1, x1 = e.x + (e.w || 1) + 1;
    for (let k = Math.max(0, Math.floor(x0 / B)); k <= Math.floor(x1 / B); k++) (buckets[k] || (buckets[k] = [])).push(e);
  });
  Object.defineProperty(lvl, '_b', { value: buckets, enumerable: false });
  return lvl;
}

export function newState(lvl) {
  return { t: 0, step: 0, x: lvl.start || 2, y: 0, vy: 0, gs: 1, col: 1, jumps: 1, grounded: true, holdT: 0, holding: false,
    dead: false, cause: '', fin: false, gems: 0, boosts: 0, boostT: 0, switches: 0, jumpsN: 0, fallT: {}, grav: 0, padT: 0, events: null, airT: 0, bufT: 0, graceT: 0, coy: true, saves: 0 };
}
export function clone(s) { const c = { ...s }; c.fallT = { ...s.fallT }; return c; }
export function speedAt(lvl, s) { return lvl.v0 + (lvl.v1 - lvl.v0) * Math.min(1, s.x / lvl.end) + (s.boostT > 0 ? 4 : 0); }

function die(s, cause) { s.dead = true; s.cause = cause; }

// inp: {jp: jump pressed this step, jh: jump held, sw: number of colour taps this step}
export function step(s, lvl, inp) {
  if (s.dead || s.fin) return s;
  const n = lvl.ncol;
  for (let k = 0; k < (inp.sw || 0); k++) { s.col = nextColor(s.col, n); s.switches++; }
  if (inp.jp) s.bufT = BUFFER;
  if (s.bufT > 0) {
    const coyote = !s.grounded && s.coy && s.airT < COYOTE && s.vy * s.gs <= 0;
    if (s.grounded || coyote) { s.vy = JUMP * s.gs; s.grounded = false; s.coy = false; s.holdT = 0; s.holding = !!inp.jh; s.jumpsN++; s.bufT = 0; }
    else if (inp.jp && s.jumps > 0) { s.jumps--; s.vy = DJUMP * s.gs; s.holdT = 0; s.holding = true; s.jumpsN++; s.bufT = 0; }
    else s.bufT -= DT;
  }
  if (!inp.jh) s.holding = false;
  let g = G;
  if (s.holding && s.vy * s.gs > 0 && s.holdT < HOLD_T) { g *= HOLD_G; s.holdT += DT; }
  s.vy -= g * s.gs * DT;
  const t = s.t;
  const px = s.x, py = s.y;
  s.x += speedAt(lvl, s) * DT;
  s.y += s.vy * DT;
  if (s.boostT > 0) s.boostT -= DT;
  const wasG = s.grounded; s._mis = false;
  s.grounded = false;
  const bk = lvl._b[Math.floor(s.x / 4)] || [];
  let support = null;
  const gs = s.gs;
  for (const p of bk) {
    if (p.t !== 'p') continue;
    const top = platY(p, t, s), bot = top - p.h;
    const xmin = s.x - PW, xmax = s.x + PW;
    const ymin = gs > 0 ? s.y : s.y - PH, ymax = gs > 0 ? s.y + PH : s.y;
    if (!(xmax > p.x && xmin < p.x + p.w && ymax > bot && ymin < top)) continue;
    const eps = p.ma ? 0.16 : 0.06;
    if (gs > 0) {
      if (s.vy <= 0 && py >= top - eps) { s.y = top; s.vy = 0; s.grounded = true; if (!support || (s.x >= p.x && s.x <= p.x + p.w)) support = p; }
      else if (s.vy > 0 && py + PH <= bot + eps) { s.y = bot - PH; s.vy = 0; touch(s, p, t); }
      else { die(s, 'crash'); return s; }
    } else {
      if (s.vy >= 0 && py <= bot + eps) { s.y = bot; s.vy = 0; s.grounded = true; if (!support || (s.x >= p.x && s.x <= p.x + p.w)) support = p; }
      else if (s.vy < 0 && py - PH >= top - eps) { s.y = top + PH; s.vy = 0; touch(s, p, t); }
      else { die(s, 'crash'); return s; }
    }
    if (s.dead) return s;
  }
  if (support) {
    s.jumps = 1; s.coy = true; s.airT = 0;
    touch(s, support, t);
    if (s.dead) return s;
    if (support.fall && s.fallT[support.i] === undefined) s.fallT[support.i] = t;
    if (support.pad && s._mis) { die(s, 'color'); return s; }
    if (support.pad) { s.vy = PAD * gs; s.grounded = false; s.holding = false; s.padT = 0.3; }
  }
  else { s.airT += DT; if (wasG && s.vy * s.gs <= 0) s.coy = true; }
  let mis = s._mis;
  // non-solid elements
  const ymin = gs > 0 ? s.y : s.y - PH, ymax = gs > 0 ? s.y + PH : s.y;
  for (const e of bk) {
    if (e.t === 'w') {
      if (s.x + PW > e.x - 0.12 && s.x - PW < e.x + 0.12 && ymax > e.y && ymin < e.y + e.h && e.c !== s.col) { mis = true; }
    } else if (e.t === 's') {
      const sy = gs > 0 || !e.up ? e.y : e.y;
      const y0 = e.up ? sy - 0.6 : sy, y1 = e.up ? sy : sy + 0.6;
      if (s.x + PW - 0.1 > e.x && s.x - PW + 0.1 < e.x + e.w && ymax > y0 + 0.05 && ymin < y1 - 0.05) { die(s, 'spike'); return s; }
    } else if (e.t === 'e') {
      const bit = 1 << e.k;
      if (!(s.gems & bit) && Math.abs(s.x - e.x) < 0.8 && e.y > ymin - 0.6 && e.y < ymax + 0.6) s.gems |= bit;
    } else if (e.t === 'b') {
      const bit = 1 << e.k;
      if (!(s.boosts & bit) && Math.abs(s.x - e.x) < 0.7 && e.y > ymin - 0.7 && e.y < ymax + 0.7) { s.boosts |= bit; s.boostT = 1.4; }
    } else if (e.t === 'G') {
      const bit = 1 << e.k;
      if (!(s.grav & bit) && s.x >= e.x) { s.grav |= bit; s.gs = -s.gs; s.grounded = false; s.jumps = 1; s.y += s.gs < 0 ? PH : -PH; s.vy = 0; }
    }
  }
  if (mis) { s.graceT += DT; if (s.graceT > GRACE) { die(s, 'color'); return s; } } else if (s.graceT > 0) { s.saves++; s.graceT = 0; }
  if (s.y < (lvl.minY ?? -14) || s.y > (lvl.maxY ?? 30)) { die(s, 'fall'); return s; }
  s.t += DT; s.step++;
  if (s.x >= lvl.end) s.fin = true;
  return s;
}
function touch(s, p, t) {
  const c = colorAt(p, t);
  if (c && c !== s.col) s._mis = true;
}

// Script = sorted events [step, kind] kind: 'd' jump down, 'u' jump up, 's' colour tap.
export function runScript(lvl, script, opts = {}) {
  prepare(lvl);
  const s = newState(lvl);
  let i = 0, held = false;
  const max = opts.maxSteps || 120 * 120;
  const frames = opts.record ? [] : null;
  while (!s.dead && !s.fin && s.step < max) {
    let jp = false, sw = 0;
    while (i < script.length && script[i][0] <= s.step) {
      const k = script[i][1];
      if (k === 'd') { jp = true; held = true; } else if (k === 'u') held = false; else if (k === 's') sw++;
      i++;
    }
    step(s, lvl, { jp, jh: held, sw });
    if (frames) frames.push([s.x, s.y, s.col]);
  }
  return opts.record ? { s, frames } : s;
}

export function starsFor(lvl, r) {
  return [r.gems === 7, r.switches <= lvl.par, r.time <= lvl.target];
}
