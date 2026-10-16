/* LUMEN renderer: 2D canvas over the WebGL sky. Glass blocks are pre-rendered sprites per world palette;
   the settled stack is cached in its own layer and only redrawn when it changes. */
import { COLS, ROWS, HIDDEN, VISIBLE, SHAPES, TYPES, TYPE_ID, ID_TYPE } from './rules.js';
import { WORLDS } from './worlds.js';

const TAU = Math.PI * 2;
function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function mixc(c, t, f) { return c.map((v, i) => Math.round(v + (t[i] - v) * f)); }
function shade(h, f) { const c = rgb(h); return f >= 0 ? mixc(c, [255, 255, 255], f) : mixc(c, [0, 0, 0], -f); }
function css(c, a = 1) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
const easeOut = t => 1 - Math.pow(1 - t, 3);

export function blockSprite(px, color) {
  const s = Math.max(4, Math.round(px)); const c = mk(s, s); const g = c.getContext('2d');
  const ins = Math.max(0.5, s * 0.04), w = s - ins * 2, r = s * 0.17;
  const base = rgb(color);
  // body
  let gr = g.createLinearGradient(0, ins, 0, ins + w);
  gr.addColorStop(0, css(shade(color, 0.28), 0.96)); gr.addColorStop(0.5, css(base, 0.86)); gr.addColorStop(1, css(shade(color, -0.42), 0.94));
  rrect(g, ins, ins, w, w, r); g.fillStyle = gr; g.fill();
  g.save(); rrect(g, ins, ins, w, w, r); g.clip();
  // inner light: a soft core, slightly low, as if lit from inside
  let rg = g.createRadialGradient(s * 0.52, s * 0.6, 0, s * 0.52, s * 0.6, s * 0.62);
  rg.addColorStop(0, css(shade(color, 0.7), 0.8)); rg.addColorStop(0.45, css(shade(color, 0.3), 0.28)); rg.addColorStop(1, css(base, 0));
  g.fillStyle = rg; g.fillRect(0, 0, s, s);
  // refraction: darker inner rim at the bottom-right
  let rf = g.createLinearGradient(s, s, s * 0.55, s * 0.55);
  rf.addColorStop(0, css(shade(color, -0.6), 0.45)); rf.addColorStop(0.35, css(shade(color, -0.6), 0)); g.fillStyle = rf; g.fillRect(0, 0, s, s);
  // specular sheen: hard-edged diagonal glass reflection, top-left
  g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 0.78, 0); g.lineTo(0, s * 0.62); g.closePath();
  let sg = g.createLinearGradient(0, 0, s * 0.45, s * 0.45);
  sg.addColorStop(0, 'rgba(255,255,255,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0.06)'); g.fillStyle = sg; g.fill();
  // tiny caustic hotspot
  let hs = g.createRadialGradient(s * 0.74, s * 0.76, 0, s * 0.74, s * 0.76, s * 0.16);
  hs.addColorStop(0, 'rgba(255,255,255,0.55)'); hs.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hs; g.fillRect(0, 0, s, s);
  g.restore();
  // rim
  const lw = Math.max(1, s * 0.05);
  rrect(g, ins + lw / 2, ins + lw / 2, w - lw, w - lw, r - lw / 2);
  let st = g.createLinearGradient(0, 0, s, s);
  st.addColorStop(0, 'rgba(255,255,255,0.85)'); st.addColorStop(0.5, css(shade(color, 0.4), 0.45)); st.addColorStop(1, css(shade(color, -0.2), 0.6));
  g.strokeStyle = st; g.lineWidth = lw; g.stroke();
  return c;
}
function glowSprite(px, color, a = 0.6) {
  const s = Math.max(8, Math.round(px)); const c = mk(s, s); const g = c.getContext('2d'); const base = rgb(color);
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rg.addColorStop(0, css(shade(color, 0.3), a)); rg.addColorStop(0.35, css(base, a * 0.42)); rg.addColorStop(1, css(base, 0));
  g.fillStyle = rg; g.fillRect(0, 0, s, s); return c;
}
function ghostSprite(px, color) {
  const s = Math.max(4, Math.round(px)); const c = mk(s, s); const g = c.getContext('2d');
  const ins = Math.max(1, s * 0.09), w = s - ins * 2, r = s * 0.16;
  rrect(g, ins, ins, w, w, r); g.fillStyle = css(rgb(color), 0.10); g.fill();
  g.lineWidth = Math.max(1, s * 0.05); g.strokeStyle = css(shade(color, 0.25), 0.55); g.stroke();
  return c;
}
function shardSprite(px, color) { // a triangular glass shard for shatter
  const s = Math.max(4, Math.round(px)); const c = mk(s, s); const g = c.getContext('2d');
  g.beginPath(); g.moveTo(s * 0.1, s * 0.15); g.lineTo(s * 0.92, s * 0.4); g.lineTo(s * 0.3, s * 0.9); g.closePath();
  const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, css(shade(color, 0.7), 0.95)); gr.addColorStop(1, css(rgb(color), 0.5));
  g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(1, s * 0.06); g.stroke();
  return c;
}

function pieceBounds(type, rot = 0) {
  const cs = SHAPES[type][rot]; let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  for (const [x, y] of cs) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.g = canvas.getContext('2d');
    this.dpr = 1; this.L = null; this.world = 0; this.prevWorld = 0; this.wave = 1;
    this.sprites = {}; this.reduced = false; this.reducedMotion = false; this.shakeOn = true; this.leanOn = true; this.showGhost = true; this.showGrid = true;
    const N = 1200; this.P = { n: 0, max: N, x: new Float32Array(N), y: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), life: new Float32Array(N), max0: new Float32Array(N), size: new Float32Array(N), col: new Uint8Array(N), kind: new Uint8Array(N), rot: new Float32Array(N), vr: new Float32Array(N), drag: new Float32Array(N), grav: new Float32Array(N) };
    this.rings = []; this.beams = []; this.trails = []; this.rowFlash = []; this.flashCells = null; this.flashT = 0;
    this.collapse = null; this.shakeAmp = 0; this.shakeT = 0; this.kick = 0; this.lean = 0; this.leanV = 0;
    this.vis = null; this.twist = 0; this.spinTint = 0; this.stackDirty = true; this.time = 0; this.danger = 0;
    this.drift = []; this.spawnId = 0; this.pulseBoard = 0; this.waveFront = -1;
  }
  setOptions(o) { Object.assign(this, o); this.P.max = this.reduced ? 350 : 1200; this.stackDirty = true; }
  resize(L, dpr) {
    this.L = L; this.dpr = dpr;
    const c = this.canvas; const W = Math.round(L.w * dpr), H = Math.round(L.h * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    this.buildSprites(); this.buildFrame(); this.stackDirty = true;
  }
  palette(i) { return WORLDS[i].pieces; }
  buildSprites() {
    const L = this.L; if (!L) return; const d = this.dpr; const sp = {};
    const mk1 = (i) => {
      const pal = this.palette(i); const o = { block: [], glow: [], ghost: [], dot: [], shard: [], mini: [], flash: null };
      pal.forEach((col, k) => {
        const id = k + 1;
        o.block[id] = blockSprite(L.cell * d, col);
        o.mini[id] = blockSprite(Math.max(L.hold.m, L.next.m) * d, col);
        o.glow[id] = glowSprite(L.cell * 3 * d, col, 0.55);
        o.ghost[id] = ghostSprite(L.cell * d, col);
        o.dot[id] = glowSprite(24 * d, col, 0.95);
        o.shard[id] = shardSprite(Math.max(6, L.cell * 0.45) * d, col);
      });
      o.flash = glowSprite(L.cell * 1.6 * d, '#ffffff', 0.9);
      o.white = blockSprite(L.cell * d, '#f4f8ff');
      return o;
    };
    sp[this.world] = mk1(this.world);
    if (this.prevWorld !== this.world) sp[this.prevWorld] = mk1(this.prevWorld);
    this.sprites = sp;
  }
  setWorld(i, instant) {
    if (i === this.world) return;
    this.prevWorld = instant ? i : this.world; this.world = i; this.wave = instant ? 1 : 0;
    this.buildSprites(); this.buildFrame(); this.stackDirty = true;
  }
  buildFrame() {
    const L = this.L; if (!L) return; const d = this.dpr, c = L.cell, pad = Math.round(c * 0.28);
    const w = L.bw + pad * 2, h = L.bh + pad * 2;
    const f = mk(w * d, h * d); const g = f.getContext('2d'); g.scale(d, d);
    const W = WORLDS[this.world]; const ac = rgb(W.accent), ac2 = rgb(W.accent2);
    rrect(g, 0.5, 0.5, w - 1, h - 1, c * 0.42);
    const bgG = g.createLinearGradient(0, 0, 0, h); bgG.addColorStop(0, 'rgba(8,10,26,0.34)'); bgG.addColorStop(1, 'rgba(4,6,18,0.62)');
    g.fillStyle = bgG; g.fill();
    const st = g.createLinearGradient(0, 0, w, h); st.addColorStop(0, css(ac, 0.55)); st.addColorStop(0.5, 'rgba(255,255,255,0.10)'); st.addColorStop(1, css(ac2, 0.45));
    g.lineWidth = 1.2; g.strokeStyle = st; g.stroke();
    // inner well
    rrect(g, pad - 1, pad - 1, L.bw + 2, L.bh + 2, c * 0.18); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; g.stroke();
    if (this.showGrid) {
      g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1; g.beginPath();
      for (let x = 1; x < COLS; x++) { g.moveTo(pad + x * c + 0.5, pad); g.lineTo(pad + x * c + 0.5, pad + L.bh); }
      for (let y = 1; y < VISIBLE; y++) { g.moveTo(pad, pad + y * c + 0.5); g.lineTo(pad + L.bw, pad + y * c + 0.5); }
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      for (let x = 1; x < COLS; x++) for (let y = 1; y < VISIBLE; y++) g.fillRect(pad + x * c - 0.75, pad + y * c - 0.75, 1.5, 1.5);
    }
    // top lip glow
    const lip = g.createLinearGradient(pad, 0, pad + L.bw, 0);
    lip.addColorStop(0, css(ac, 0)); lip.addColorStop(0.5, css(ac, 0.6)); lip.addColorStop(1, css(ac, 0));
    g.fillStyle = lip; g.fillRect(pad, pad - 1, L.bw, 1.5);
    this.frame = { c: f, pad, w, h };
    // side panels (hold / next)
    const panel = (b) => {
      const p = mk(b.w * d, b.h * d); const q = p.getContext('2d'); q.scale(d, d);
      rrect(q, 0.5, 0.5, b.w - 1, b.h - 1, Math.min(14, c * 0.35));
      const pg = q.createLinearGradient(0, 0, 0, b.h); pg.addColorStop(0, 'rgba(255,255,255,0.07)'); pg.addColorStop(1, 'rgba(255,255,255,0.02)');
      q.fillStyle = pg; q.fill(); q.strokeStyle = 'rgba(255,255,255,0.12)'; q.lineWidth = 1; q.stroke();
      return p;
    };
    this.holdPanel = panel(L.hold); this.nextPanel = panel(L.next);
  }

  // ------------- events from the game -------------
  bx(x) { return this.L.bx + x * this.L.cell; }
  by(y) { return this.L.by + (y - HIDDEN) * this.L.cell; }
  handle(e, game) {
    const L = this.L; if (!L) return; const c = L.cell;
    switch (e.type) {
      case 'spawn': this.vis = null; this.spawnId++; break;
      case 'rotate': if (!this.reducedMotion) this.twist = -(e.dir === 2 ? 2 : e.dir) * 0.32; break;
      case 'harddrop': {
        const col = TYPE_ID[e.piece];
        const cols = {};
        for (const [x, y] of e.from) cols[x] = Math.min(cols[x] ?? 99, y);
        for (const [x, y] of e.to) cols[x + ':b'] = Math.max(cols[x + ':b'] ?? -1, y);
        for (const k in cols) if (!k.includes(':')) this.trails.push({ x: +k, y0: cols[k], y1: cols[k + ':b'], t: 0, col });
        if (e.dist > 0) {
          this.kick = Math.min(1, e.dist / 10) * c * 0.16;
          if (!this.reducedMotion) this.addShake(Math.min(3, 1 + e.dist / 8), 0.12);
          for (const [x, y] of e.to) {
            const n = this.reduced ? 1 : 3;
            for (let i = 0; i < n; i++) this.emit(this.bx(x + Math.random()), this.by(y + 1), (Math.random() - 0.5) * 120, -40 - Math.random() * 100, 0.25 + Math.random() * 0.3, 3 + Math.random() * 3, col, 0, 3, 120);
          }
        }
        break;
      }
      case 'lock':
        this.flashCells = e.cells.map(([x, y]) => [x, y]); this.flashT = 1; this.stackDirty = true;
        break;
      case 'clear': this.onClear(e, game); break;
      case 'zenclear': {
        for (const [x, y, id] of e.cells) if (y >= HIDDEN) this.burstCell(x, y, id, this.reduced ? 1 : 3, 1.4);
        this.rings.push({ x: L.bx + L.bw / 2, y: L.by + L.bh / 2, r0: 0, r1: L.bh * 0.9, t: 0, dur: 1.4, col: WORLDS[this.world].accent, w: 3 });
        this.stackDirty = true; break;
      }
      case 'hold': this.vis = null; break;
    }
  }
  onClear(e, game) {
    const L = this.L, c = L.cell; this.stackDirty = true;
    const big = e.lines === 4 || e.spin !== 'none' || e.pc;
    if (e.lines) {
      // collapse animation: rows above the cleared ones fall into place
      const removed = e.rows.slice().sort((a, b) => a - b);
      const shift = new Int8Array(ROWS);
      for (let y0 = 0; y0 < ROWS; y0++) { if (removed.includes(y0)) continue; let k = 0; for (const r of removed) if (r > y0) k++; if (y0 + k < ROWS) shift[y0 + k] = k; }
      this.collapse = { shift, t: 0, dur: 0.2 + 0.03 * e.lines, delay: 0.07 };
      e.rows.forEach((y, i) => {
        this.rowFlash.push({ y, t: 0, dur: 0.35 });
        const cells = e.rowCells[i];
        const n = this.reduced ? 1 : (e.lines === 4 ? 4 : 3);
        for (let x = 0; x < COLS; x++) this.burstCell(x, y, cells[x], n, e.lines === 4 ? 1.5 : 1);
      });
    }
    const cy = e.rows.length ? this.by(e.rows.reduce((a, b) => a + b, 0) / e.rows.length + 0.5) : L.by + L.bh * 0.6;
    const cx = L.bx + L.bw / 2;
    if (e.lines === 4) {
      for (let x = 0; x < COLS; x++) this.beams.push({ x, y: Math.max(...e.rows), t: -x * 0.012, dur: 0.75, col: WORLDS[this.world].pieces[(x * 3) % 7] });
      this.rings.push({ x: cx, y: cy, r0: c, r1: L.bw * 1.6, t: 0, dur: 0.9, col: WORLDS[this.world].accent, w: 4 });
      this.rings.push({ x: cx, y: cy, r0: 0, r1: L.bw * 1.1, t: -0.08, dur: 0.8, col: '#ffffff', w: 2 });
      this.pulseBoard = 1;
      if (!this.reducedMotion) this.addShake(5, 0.28);
    }
    if (e.spin !== 'none') {
      // T-spin flourish: a three-armed spiral of violet light that unwinds from the slot
      const tc = TYPE_ID.T; const n = this.reduced ? 24 : (e.lines ? 72 : 36);
      for (let i = 0; i < n; i++) {
        const arm = i % 3, k = Math.floor(i / 3) / (n / 3);
        const a = arm * TAU / 3 + k * 2.6, r = c * (0.4 + k * 2.4), sp = 120 + k * 220;
        this.emit(cx + Math.cos(a) * r, cy + Math.sin(a) * r, -Math.sin(a) * sp + Math.cos(a) * 60, Math.cos(a) * sp + Math.sin(a) * 60, 0.7 + k * 0.7, 3 + (1 - k) * 4, tc, 0, 2.4, -16);
      }
      const tcol = WORLDS[this.world].pieces[5];
      this.rings.push({ x: cx, y: cy, r0: c * 0.6, r1: c * (e.lines ? 5.5 : 3.5), t: 0, dur: 0.8, col: tcol, w: 6, spin: true });
      this.rings.push({ x: cx, y: cy, r0: c * 0.2, r1: c * (e.lines ? 3.5 : 2.2), t: 0.05, dur: 0.6, col: '#ffffff', w: 2, spin: true });
      this.pulseBoard = Math.max(this.pulseBoard, e.lines ? 0.9 : 0.5);
      this.spinTint = 1;
      if (!this.reducedMotion) this.addShake(e.lines >= 2 ? 4 : 2, 0.22);
    }
    if (e.pc) {
      const n = this.reduced ? 60 : 220;
      for (let i = 0; i < n; i++) {
        const x = L.bx + Math.random() * L.bw, y = L.by + Math.random() * L.bh;
        this.emit(x, y, (Math.random() - 0.5) * 80, -60 - Math.random() * 140, 1.2 + Math.random() * 1.2, 3 + Math.random() * 4, 1 + (i % 7), 0, 1.5, -30);
      }
      for (let k = 0; k < 3; k++) this.rings.push({ x: cx, y: L.by + L.bh / 2, r0: 0, r1: L.bh * (0.8 + k * 0.3), t: -k * 0.15, dur: 1.4, col: WORLDS[this.world].pieces[(k * 2) % 7], w: 3 });
      this.pulseBoard = 1;
    }
    if (!big && e.combo >= 2) this.rings.push({ x: cx, y: cy, r0: c * 0.3, r1: c * (2 + Math.min(e.combo, 8) * 0.4), t: 0, dur: 0.45, col: WORLDS[this.world].accent2, w: 2 });
  }
  burstCell(x, y, id, n, power) {
    const px = this.bx(x + 0.5), py = this.by(y + 0.5); const L = this.L;
    const cx = L.bx + L.bw / 2;
    for (let i = 0; i < n; i++) {
      const dir = (px - cx) / L.bw;
      const vx = dir * 260 * power + (Math.random() - 0.5) * 200 * power, vy = (Math.random() - 0.65) * 220 * power;
      const shard = !this.reduced && i === 0 && Math.random() < 0.55;
      this.emit(px + (Math.random() - 0.5) * L.cell * 0.6, py + (Math.random() - 0.5) * L.cell * 0.6, vx, vy, 0.7 + Math.random() * 0.9 * power, shard ? 1 : 2.5 + Math.random() * 4, id, shard ? 1 : 0, 1.8, -24);
    }
  }
  emit(x, y, vx, vy, life, size, col, kind = 0, drag = 2, grav = 0) {
    const P = this.P; if (P.n >= P.max) return; const i = P.n++;
    P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.life[i] = life; P.max0[i] = life; P.size[i] = size; P.col[i] = col; P.kind[i] = kind;
    P.rot[i] = Math.random() * TAU; P.vr[i] = (Math.random() - 0.5) * 12; P.drag[i] = drag; P.grav[i] = grav;
  }
  addShake(a, t) { if (!this.shakeOn) return; this.shakeAmp = Math.max(this.shakeAmp, a); this.shakeT = Math.max(this.shakeT, t); this.shakeDur = Math.max(this.shakeT, 0.01); }

  // ------------- stack layer -------------
  renderStack(game) {
    const L = this.L, d = this.dpr, c = L.cell, m = Math.ceil(c * 1.2);
    const W = L.bw + m * 2, H = L.bh + m * 2;
    if (!this.stackC || this.stackC.width !== Math.round(W * d) || this.stackC.height !== Math.round(H * d)) { this.stackC = mk(W * d, H * d); this.stackM = m; }
    const g = this.stackC.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.stackC.width, this.stackC.height);
    g.setTransform(d, 0, 0, d, 0, 0);
    if (!game) return;
    const col = this.collapse; let fall = 0;
    if (col) { const t = Math.max(0, col.t - col.delay) / col.dur; fall = 1 - Math.min(1, t) * Math.min(1, t); }
    const wave = this.wave < 1;
    const spNew = this.sprites[this.world], spOld = this.sprites[this.prevWorld] || spNew;
    const pick = (vy) => (wave && (VISIBLE - 1 - vy) / (VISIBLE - 1) > this.wave) ? spOld : spNew;
    const b = game.board;
    // glow pass
    if (!this.reduced) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.16;
      for (let y = HIDDEN; y < ROWS; y++) {
        const off = col ? col.shift[y] * fall : 0; const row = b[y];
        for (let x = 0; x < COLS; x++) { const id = row[x]; if (!id) continue; const sp = pick(y - HIDDEN); g.drawImage(sp.glow[id], m + (x - 1) * c, m + (y - HIDDEN - off - 1) * c, c * 3, c * 3); }
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    for (let y = HIDDEN - 2; y < ROWS; y++) {
      const off = col ? col.shift[y] * fall : 0; const row = b[y];
      for (let x = 0; x < COLS; x++) { const id = row[x]; if (!id) continue; const sp = pick(Math.max(0, y - HIDDEN)); g.drawImage(sp.block[id], m + x * c, m + (y - HIDDEN - off) * c, c, c); }
    }
  }

  // ------------- frame -------------
  render(dt, view) {
    const L = this.L; if (!L) return;
    this.time += dt;
    const g = this.g, d = this.dpr, c = L.cell, game = view.game;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (view.title) { this.renderDrift(dt, view); this.stepParticles(dt); this.drawParticles(); return; }
    if (!game) return;
    // animation clocks
    if (this.wave < 1) { this.wave = Math.min(1, this.wave + dt / 1.3); this.stackDirty = true; }
    if (this.collapse) { this.collapse.t += dt; this.stackDirty = true; if (this.collapse.t > this.collapse.delay + this.collapse.dur) this.collapse = null; }
    this.flashT = Math.max(0, this.flashT - dt / 0.22);
    this.twist *= Math.exp(-dt / 0.055); if (Math.abs(this.twist) < 0.002) this.twist = 0;
    this.kick *= Math.exp(-dt / 0.07);
    this.pulseBoard = Math.max(0, this.pulseBoard - dt * 1.4);
    if (this.stackDirty) { this.renderStack(game); this.stackDirty = false; }
    // shake + lean
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt; const k = Math.max(0, this.shakeT / (this.shakeDur || 0.2));
      sx = Math.sin(this.time * 91) * this.shakeAmp * k; sy = Math.cos(this.time * 73) * this.shakeAmp * k * 0.7;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    let leanTarget = 0;
    if (this.leanOn && !this.reducedMotion && game.cur) {
      const cx = game.cur.x + 1.5; leanTarget = (cx - COLS / 2) / (COLS / 2) * 0.012;
    }
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-dt / 0.25));
    const ox = L.bx + L.bw / 2, oy = L.by + L.bh;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.translate(ox + sx, oy + sy + this.kick); g.rotate(this.lean); g.translate(-ox, -oy);

    // frame
    const F = this.frame; g.drawImage(F.c, L.bx - F.pad, L.by - F.pad, F.w, F.h);
    if (this.danger > 0.01) {
      const a = this.danger * (0.5 + 0.5 * Math.sin(this.time * 6));
      const gr = g.createLinearGradient(0, L.by, 0, L.by + c * 5);
      gr.addColorStop(0, `rgba(255,60,90,${0.28 * a})`); gr.addColorStop(1, 'rgba(255,60,90,0)');
      g.fillStyle = gr; g.fillRect(L.bx, L.by, L.bw, c * 5);
    }
    if (this.spinTint > 0) {
      this.spinTint = Math.max(0, this.spinTint - dt * 1.6);
      g.globalCompositeOperation = 'lighter';
      const tc = rgb(WORLDS[this.world].pieces[5]);
      const gr = g.createLinearGradient(L.bx, L.by + L.bh, L.bx + L.bw, L.by);
      gr.addColorStop(0, css(tc, 0.28 * this.spinTint)); gr.addColorStop(0.5, css(tc, 0.05 * this.spinTint)); gr.addColorStop(1, css(tc, 0.2 * this.spinTint));
      g.fillStyle = gr; g.fillRect(L.bx, L.by, L.bw, L.bh);
      g.globalCompositeOperation = 'source-over';
    }
    if (this.pulseBoard > 0) {
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(ox, L.by + L.bh / 2, 0, ox, L.by + L.bh / 2, L.bh * 0.7);
      const ac = rgb(WORLDS[this.world].accent);
      gr.addColorStop(0, css(ac, 0.22 * this.pulseBoard)); gr.addColorStop(1, css(ac, 0));
      g.fillStyle = gr; g.fillRect(L.bx - c, L.by - c, L.bw + 2 * c, L.bh + 2 * c);
      g.globalCompositeOperation = 'source-over';
    }
    // stack
    g.drawImage(this.stackC, L.bx - this.stackM, L.by - this.stackM, this.stackC.width / d, this.stackC.height / d);
    // world wave front
    if (this.wave < 1) {
      const y = L.by + L.bh * (1 - this.wave);
      g.globalCompositeOperation = 'lighter';
      const gr = g.createLinearGradient(0, y - c * 1.5, 0, y + c * 0.5);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, css(rgb(WORLDS[this.world].accent), 0.45)); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(L.bx, y - c * 1.5, L.bw, c * 2);
      g.globalCompositeOperation = 'source-over';
    }
    // row flashes
    if (this.rowFlash.length) {
      g.globalCompositeOperation = 'lighter';
      for (const f of this.rowFlash) {
        f.t += dt; const k = 1 - f.t / f.dur; if (k <= 0) continue;
        const y = this.by(f.y);
        const gr = g.createLinearGradient(0, y - c * 0.6, 0, y + c * 1.6);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.85 * k})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; const ext = (1 - k) * c * 1.5;
        g.fillRect(L.bx - ext, y - c * 0.6, L.bw + ext * 2, c * 2.2);
      }
      this.rowFlash = this.rowFlash.filter(f => f.t < f.dur);
      g.globalCompositeOperation = 'source-over';
    }
    // Tetris light beams: every column fires a shaft of light up the well
    if (this.beams.length) {
      g.globalCompositeOperation = 'lighter';
      for (const b of this.beams) {
        b.t += dt; if (b.t < 0) continue; const k = b.t / b.dur; if (k >= 1) continue;
        const x = this.bx(b.x), yb = this.by(b.y + 1), h = (yb - L.by + c * 2) * Math.min(1, k * 4);
        const gr = g.createLinearGradient(0, yb, 0, yb - h);
        const cc = rgb(b.col); const a = (1 - k) * 0.7;
        gr.addColorStop(0, css(cc, a)); gr.addColorStop(0.6, css(cc, a * 0.35)); gr.addColorStop(1, css(cc, 0));
        g.fillStyle = gr; g.fillRect(x + c * 0.08, yb - h, c * 0.84, h);
      }
      this.beams = this.beams.filter(b => b.t < b.dur);
      g.globalCompositeOperation = 'source-over';
    }
    // hard drop trails
    if (this.trails.length) {
      g.globalCompositeOperation = 'lighter';
      const pal = WORLDS[this.world].pieces;
      for (const t of this.trails) {
        t.t += dt; const k = 1 - t.t / 0.24; if (k <= 0) continue;
        const x = this.bx(t.x), y0 = this.by(t.y0), y1 = this.by(t.y1 + 1);
        const gr = g.createLinearGradient(0, y0, 0, y1);
        const cc = rgb(pal[t.col - 1]);
        gr.addColorStop(0, css(cc, 0)); gr.addColorStop(1, css(cc, 0.55 * k));
        g.fillStyle = gr; g.fillRect(x + c * 0.18, y0, c * 0.64, Math.max(0, y1 - y0));
      }
      this.trails = this.trails.filter(t => t.t < 0.24);
      g.globalCompositeOperation = 'source-over';
    }
    const sp = this.sprites[this.world];
    // lock flash
    if (this.flashT > 0 && this.flashCells) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = this.flashT * 0.55;
      for (const [x, y] of this.flashCells) if (y >= HIDDEN - 1) g.drawImage(sp.white, this.bx(x), this.by(y), c, c);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // ghost + active piece
    if (game.cur && !game.over) {
      const p = game.cur, id = TYPE_ID[p.type];
      if (this.showGhost) {
        const gy = game.ghostY();
        if (gy !== p.y) for (const [cx, cy] of SHAPES[p.type][p.rot]) if (gy + cy >= HIDDEN) g.drawImage(sp.ghost[id], this.bx(p.x + cx), this.by(gy + cy), c, c);
      }
      // smoothed position
      const key = this.spawnId;
      if (!this.vis || this.vis.key !== key || this.vis.type !== p.type) this.vis = { key, type: p.type, x: p.x, y: p.y };
      const tc = this.reducedMotion ? 0.001 : 0.035;
      const a = 1 - Math.exp(-dt / tc);
      this.vis.x += (p.x - this.vis.x) * a; this.vis.y += (p.y - this.vis.y) * a;
      if (Math.abs(p.x - this.vis.x) > 3 || Math.abs(p.y - this.vis.y) > 4) { this.vis.x = p.x; this.vis.y = p.y; }
      const vx = this.vis.x, vy = this.vis.y;
      const cells = SHAPES[p.type][p.rot];
      let mx = 0, my = 0; for (const [cx, cy] of cells) { mx += cx + 0.5; my += cy + 0.5; } mx /= 4; my /= 4;
      const pcx = this.bx(vx + mx), pcy = this.by(vy + my);
      g.save();
      if (this.twist) { g.translate(pcx, pcy); g.rotate(this.twist); g.translate(-pcx, -pcy); }
      const lockK = game.grounded() ? Math.min(1, game.lockT / game.lockDelay) : 0;
      if (!this.reduced) {
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 + 0.15 * Math.sin(this.time * 5);
        for (const [cx, cy] of cells) { const yy = vy + cy; if (yy < HIDDEN - 2) continue; g.drawImage(sp.glow[id], this.bx(vx + cx - 1), this.by(yy - 1), c * 3, c * 3); }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
      for (const [cx, cy] of cells) {
        const yy = vy + cy; if (yy < HIDDEN - 2) continue;
        g.globalAlpha = yy < HIDDEN - 0.5 ? 0.55 : 1;
        g.drawImage(sp.block[id], this.bx(vx + cx), this.by(yy), c, c);
      }
      g.globalAlpha = 1;
      if (lockK > 0) { // the piece brightens as its lock delay runs out
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = lockK * 0.35;
        for (const [cx, cy] of cells) if (vy + cy >= HIDDEN - 1) g.drawImage(sp.white, this.bx(vx + cx), this.by(vy + cy), c, c);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
      g.restore();
    }
    // side panels
    this.drawHold(game); this.drawNext(game);
    // rings
    this.drawRings(dt);
    // particles
    this.stepParticles(dt); this.drawParticles();
  }
  drawMini(type, cx, cy, m, alpha = 1, sp = this.sprites[this.world]) {
    const b = pieceBounds(type); const id = TYPE_ID[type]; const g = this.g;
    const ox = cx - (b.w * m) / 2 - b.x0 * m, oy = cy - (b.h * m) / 2 - b.y0 * m;
    g.globalAlpha = alpha;
    for (const [x, y] of SHAPES[type][0]) g.drawImage(sp.mini[id], ox + x * m, oy + y * m, m, m);
    g.globalAlpha = 1;
  }
  drawHold(game) {
    const H = this.L.hold, g = this.g;
    g.drawImage(this.holdPanel, H.x, H.y, H.w, H.h);
    if (game.hold) this.drawMini(game.hold, H.x + H.w / 2, H.y + H.h / 2 + H.labelH / 2, H.m, game.holdUsed ? 0.35 : 1);
  }
  drawNext(game) {
    const N = this.L.next, g = this.g;
    g.drawImage(this.nextPanel, N.x, N.y, N.w, N.h);
    const q = game.queue.slice(0, 5);
    if (N.horizontal) {
      const slot = (N.w - N.pad * 2) / 5.4;
      q.forEach((t, i) => { const s = i === 0 ? 1.15 : 0.85; const x = N.x + N.pad + (i === 0 ? slot * 0.6 : slot * (i + 0.9)); this.drawMini(t, x, N.y + N.h / 2 + N.labelH / 2, N.m * s, i === 0 ? 1 : 0.8); });
    } else {
      const top = N.y + N.labelH, avail = N.h - N.labelH - N.pad;
      const first = avail * 0.26, rest = (avail - first) / 4;
      q.forEach((t, i) => { const s = i === 0 ? 1.12 : 0.82; const y = i === 0 ? top + first / 2 : top + first + rest * (i - 0.5); this.drawMini(t, N.x + N.w / 2, y, N.m * s, i === 0 ? 1 : 0.78); });
    }
  }
  drawRings(dt) {
    if (!this.rings.length) return; const g = this.g;
    g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      r.t += dt; if (r.t < 0) continue; const k = Math.min(1, r.t / r.dur); const e = easeOut(k);
      const rad = r.r0 + (r.r1 - r.r0) * e;
      g.strokeStyle = css(rgb(r.col), 0.8 * (1 - k)); g.lineWidth = r.w * (1 - k * 0.6);
      g.beginPath();
      if (r.spin) { for (let i = 0; i < 3; i++) { const a0 = i * TAU / 3 + e * 5; g.moveTo(r.x + Math.cos(a0) * rad, r.y + Math.sin(a0) * rad); g.arc(r.x, r.y, rad, a0, a0 + 1.9); } }
      else g.arc(r.x, r.y, rad, 0, TAU);
      g.stroke();
    }
    this.rings = this.rings.filter(r => r.t < r.dur);
    g.globalCompositeOperation = 'source-over';
  }
  stepParticles(dt) {
    const P = this.P; let n = P.n;
    for (let i = 0; i < n; i++) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) { // swap-remove
        n--; for (const k of ['x', 'y', 'vx', 'vy', 'life', 'max0', 'size', 'col', 'kind', 'rot', 'vr', 'drag', 'grav']) P[k][i] = P[k][n];
        i--; continue;
      }
      const dr = Math.exp(-P.drag[i] * dt);
      P.vx[i] *= dr; P.vy[i] = P.vy[i] * dr + P.grav[i] * dt;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.rot[i] += P.vr[i] * dt;
    }
    P.n = n;
  }
  drawParticles() {
    const P = this.P; if (!P.n) return; const g = this.g; const sp = this.sprites[this.world]; if (!sp) return;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < P.n; i++) {
      const k = P.life[i] / P.max0[i]; const a = k < 0.3 ? k / 0.3 : 1;
      const id = P.col[i] || 1;
      if (P.kind[i] === 1) {
        const s = this.L.cell * 0.45 * (0.6 + 0.4 * k);
        g.globalAlpha = a; g.save(); g.translate(P.x[i], P.y[i]); g.rotate(P.rot[i]); g.drawImage(sp.shard[id], -s / 2, -s / 2, s, s); g.restore();
      } else {
        const s = P.size[i] * 3.2 * (0.5 + 0.5 * k);
        g.globalAlpha = a * 0.95; g.drawImage(sp.dot[id], P.x[i] - s / 2, P.y[i] - s / 2, s, s);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  // title screen: glass tetrominoes drifting through the sky
  renderDrift(dt, view) {
    const L = this.L, g = this.g, d = this.dpr; const sp = this.sprites[this.world]; if (!sp) return;
    g.setTransform(d, 0, 0, d, 0, 0);
    const n = this.reduced ? 6 : 11;
    while (this.drift.length < n) this.drift.push(this.newDrift(this.drift.length < n && !this.driftInit));
    this.driftInit = true;
    const drift = this.drift.sort((a, b) => a.z - b.z);
    for (const p of drift) {
      p.y -= p.vy * dt * (this.reducedMotion ? 0.3 : 1); p.a += p.va * dt * (this.reducedMotion ? 0.3 : 1);
      const s = L.cell * 0.42 * p.z * (L.w < 600 ? 1 : 1.3);
      if (p.y < -s * 5) Object.assign(p, this.newDrift(false));
      const cells = SHAPES[p.type][0]; const b = pieceBounds(p.type); const id = TYPE_ID[p.type];
      g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.globalAlpha = Math.min(0.9, 0.18 + p.z * 0.5);
      if (!this.reduced && p.z > 0.9) { g.globalCompositeOperation = 'lighter'; for (const [x, y] of cells) g.drawImage(sp.glow[id], (x - b.x0 - b.w / 2 - 1) * s, (y - b.y0 - b.h / 2 - 1) * s, s * 3, s * 3); g.globalCompositeOperation = 'source-over'; }
      for (const [x, y] of cells) g.drawImage(sp.block[id], (x - b.x0 - b.w / 2) * s, (y - b.y0 - b.h / 2) * s, s, s);
      g.restore();
    }
    g.globalAlpha = 1;
  }
  newDrift(anywhere) {
    const L = this.L;
    return { type: TYPES[(Math.random() * 7) | 0], x: Math.random() * L.w, y: anywhere ? Math.random() * L.h : L.h + 80 + Math.random() * 200, z: 0.35 + Math.random() * 1.1, vy: 10 + Math.random() * 22, a: Math.random() * TAU, va: (Math.random() - 0.5) * 0.4 };
  }
  // icon art (also used to make the PWA icons): a glass T lit from within, over the Aurora Veil sky
  static drawIcon(canvas, size, worldIdx = 1, maskable = false) {
    const g = canvas.getContext('2d'); canvas.width = canvas.height = size;
    const W = WORLDS[worldIdx];
    const bgG = g.createLinearGradient(0, 0, 0, size); bgG.addColorStop(0, '#040820'); bgG.addColorStop(0.6, '#0b1f3f'); bgG.addColorStop(1, '#06122a');
    g.fillStyle = bgG; g.fillRect(0, 0, size, size);
    // aurora ribbons
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const y0 = size * (0.2 + k * 0.08);
      for (let x = 0; x < size; x += Math.max(1, size / 160)) {
        const y = y0 + Math.sin(x / size * 5 + k * 1.7) * size * 0.05;
        const h = size * (0.16 + 0.1 * Math.sin(x / size * 9 + k));
        const gr = g.createLinearGradient(0, y, 0, y + h);
        const col = rgb(k === 1 ? W.sky[3] : W.sky[2]);
        gr.addColorStop(0, css(col, 0)); gr.addColorStop(0.75, css(col, 0.10 + 0.06 * Math.sin(x / size * 40 + k * 3) ** 2)); gr.addColorStop(1, css(col, 0));
        g.fillStyle = gr; g.fillRect(x, y, Math.max(1, size / 160) + 0.5, h);
      }
    }
    // horizon glow
    const hz = g.createRadialGradient(size / 2, size * 0.86, 0, size / 2, size * 0.86, size * 0.6);
    hz.addColorStop(0, css(rgb(W.pieces[5]), 0.35)); hz.addColorStop(1, css(rgb(W.pieces[5]), 0));
    g.fillStyle = hz; g.fillRect(0, 0, size, size);
    // stars
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; const r = Math.max(0.5, size * 0.003 * rnd()); g.beginPath(); g.arc(rnd() * size, rnd() * size * 0.55, r, 0, TAU); g.fill(); }
    const s = size * (maskable ? 0.17 : 0.215);
    const cells = [[0, 0], [1, 0], [2, 0], [1, 1]];
    const ox = size / 2 - s * 1.5, oy = size / 2 - s * 0.85;
    const col = W.pieces[5];
    g.globalAlpha = 0.9; const glow = glowSprite(s * 4, col, 0.75);
    for (const [x, y] of cells) g.drawImage(glow, ox + (x - 1.5) * s, oy + (y - 1.5) * s, s * 4, s * 4);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const spr = blockSprite(s, col);
    for (const [x, y] of cells) g.drawImage(spr, ox + x * s, oy + y * s, s, s);
    // reflection
    g.globalAlpha = 0.18; g.save(); g.translate(0, oy * 2 + s * 4.1); g.scale(1, -1);
    for (const [x, y] of cells) g.drawImage(spr, ox + x * s, oy + y * s, s, s);
    g.restore(); g.globalAlpha = 1;
    return canvas;
  }
}
