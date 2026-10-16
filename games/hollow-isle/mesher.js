/* Hollow Isle mesher. Greedy chunk mesher with per-vertex ambient occlusion. Classic script: works in the page, in a Web Worker
   (importScripts), and in Node (require). Faces only merge when block, direction and all 4 AO values match. */
(function (G) {
'use strict';
const W = 128, D = 128, H = 48, CS = 16;
// per-block render info: [topColor, sideColor, kind] kind: 0 none, 1 solid cube, 2 glass, 3 water, 4 deco
const INFO = [];
function setInfo(blocks) {
  for (const b of blocks) if (b) INFO[b.id] = { top: b.top || b.color, side: b.side || b.color, bot: b.side ? 0x3e3128 : b.color, glow: b.glow || 0,
    kind: b.id === 0 || b.item ? 0 : b.id === 7 ? 3 : b.deco ? 4 : b.id === 10 ? 2 : 1, opaque: b.opaque, color: b.color, ht: b.ht || 0.5, shape: b.shape || 0, base: b.base || 0x3b3a2c };
}
function rgb(c) { return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]; }
const AOF = [0.55, 0.72, 0.87, 1.0];
function mkBuf() { return { p: [], n: [], c: [], u: [], g: [], i: [] }; }
function quad(buf, v, nrm, col, ao, uv, glow, flip) {
  const base = buf.p.length / 3;
  for (let k = 0; k < 4; k++) {
    buf.p.push(v[k][0], v[k][1], v[k][2]); buf.n.push(nrm[0], nrm[1], nrm[2]);
    const a = AOF[ao[k]]; buf.c.push(col[0] * a, col[1] * a, col[2] * a); buf.u.push(uv[k][0], uv[k][1]); buf.g.push(glow);
  }
  if (flip) buf.i.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  else buf.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function meshChunk(vox, cx, cz) {
  const ox = cx * CS, oz = cz * CS;
  const get = (x, y, z) => (x < 0 || z < 0 || y < 0 || x >= W || z >= D || y >= H) ? 0 : vox[(y * D + z) * W + x];
  const opq = id => { const f = INFO[id]; return !!f && f.kind === 1 && f.opaque; };
  const out = { solid: mkBuf(), glass: mkBuf(), water: mkBuf(), deco: mkBuf() };
  const lo = [ox, 0, oz], dims = [CS, H, CS];
  const p = [0, 0, 0], q = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const mask = new Int32Array(dims[u] * dims[v]);
    for (const dir of [1, -1]) {
      for (let s = 0; s < dims[d]; s++) {
        let n = 0;
        for (let j = 0; j < dims[v]; j++) for (let i = 0; i < dims[u]; i++, n++) {
          p[d] = lo[d] + s; p[u] = lo[u] + i; p[v] = lo[v] + j;
          const a = get(p[0], p[1], p[2]); mask[n] = 0;
          const fa = INFO[a]; if (!fa || fa.kind === 0 || fa.kind === 4) continue;
          q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[d] += dir;
          const b = get(q[0], q[1], q[2]);
          if (fa.kind === 3) { if (b !== 0 && !(INFO[b] && INFO[b].kind === 4)) continue; if (dir < 0 && d === 1) continue; }
          else if (opq(b) || b === a) continue;
          // AO around the neighbour cell q in the u/v plane (solid only)
          let pack = 0;
          if (fa.kind === 1) {
            const sol = (du, dv) => { const r = [q[0], q[1], q[2]]; r[u] += du; r[v] += dv; return opq(get(r[0], r[1], r[2])) ? 1 : 0; };
            const cr = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
            for (let k = 0; k < 4; k++) {
              const s1 = sol(cr[k][0], 0), s2 = sol(0, cr[k][1]), c = sol(cr[k][0], cr[k][1]);
              const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + c); pack |= ao << (k * 2);
            }
          } else pack = 255;
          mask[n] = (a << 8 | pack) + 1;
        }
        // greedy merge
        n = 0;
        for (let j = 0; j < dims[v]; j++) for (let i = 0; i < dims[u];) {
          const m = mask[j * dims[u] + i];
          if (!m) { i++; continue; }
          let w = 1; while (i + w < dims[u] && mask[j * dims[u] + i + w] === m) w++;
          let h = 1, ok = true;
          while (j + h < dims[v] && ok) { for (let k = 0; k < w; k++) if (mask[(j + h) * dims[u] + i + k] !== m) { ok = false; break; } if (ok) h++; }
          for (let jj = 0; jj < h; jj++) for (let k = 0; k < w; k++) mask[(j + jj) * dims[u] + i + k] = 0;
          const id = (m - 1) >> 8, pack = (m - 1) & 255, f = INFO[id];
          const ao = [pack & 3, (pack >> 2) & 3, (pack >> 4) & 3, (pack >> 6) & 3];
          const base = [0, 0, 0]; base[d] = lo[d] + s + (dir > 0 ? 1 : 0); base[u] = lo[u] + i; base[v] = lo[v] + j;
          const wat = f.kind === 3 && d === 1 && dir > 0 ? -0.12 : 0; // water surface sits a little lower
          base[1] += wat;
          const c0 = base.slice(), c1 = base.slice(), c2 = base.slice(), c3 = base.slice();
          c1[u] += w; c2[u] += w; c2[v] += h; c3[v] += h;
          let vs = [c0, c1, c2, c3], uv = [[0, 0], [w, 0], [w, h], [0, h]], aos = ao;
          if (dir < 0) { vs = [c0, c3, c2, c1]; uv = [[0, 0], [0, h], [w, h], [w, 0]]; aos = [ao[0], ao[3], ao[2], ao[1]]; }
          const nrm = [0, 0, 0]; nrm[d] = dir;
          const col = rgb(d === 1 ? (dir > 0 ? f.top : f.bot) : f.side);
          const flip = aos[0] + aos[2] < aos[1] + aos[3];
          const buf = f.kind === 1 ? out.solid : f.kind === 2 ? out.glass : out.water;
          quad(buf, vs, nrm, col, f.kind === 1 ? aos : [3, 3, 3, 3], uv, f.glow, flip);
          i += w;
        }
      }
    }
  }
  // decorations: crossed quads that sway (uv.y = 1 at the tips)
  for (let y = 1; y < H; y++) for (let z = oz; z < oz + CS; z++) for (let x = ox; x < ox + CS; x++) {
    const id = get(x, y, z); const fi = INFO[id]; if (!fi || fi.kind !== 4) continue;
    const hsh = ((x * 73856093) ^ (z * 19349663) ^ (y * 83492791)) >>> 0;
    const jx = ((hsh & 255) / 255 - 0.5) * 0.3, jz = (((hsh >> 8) & 255) / 255 - 0.5) * 0.3;
    const cx2 = x + 0.5 + jx * (fi.glow ? 0.2 : 1), cz2 = z + 0.5 + jz * (fi.glow ? 0.2 : 1), ht = fi.ht + ((hsh >> 16) & 63) / (fi.glow ? 2000 : 400);
    const top = rgb(fi.color), bot = rgb(fi.base);
    for (let k = 0; k < 2; k++) {
      const wd = fi.shape === 4 ? 0.42 : fi.shape === 3 ? 0.2 : fi.shape ? 0.3 : 0.32, a = k * Math.PI / 2 + Math.PI / 4 + (hsh & 7) * 0.2, dx = Math.cos(a) * wd, dz = Math.sin(a) * wd;
      const b = out.deco, base = b.p.length / 3;
      const vs = [[cx2 - dx, y, cz2 - dz], [cx2 + dx, y, cz2 + dz], [cx2 + dx, y + ht, cz2 + dz], [cx2 - dx, y + ht, cz2 - dz]];
      for (let t = 0; t < 4; t++) { b.p.push(...vs[t]); b.n.push(0, 1, 0); const c = t < 2 ? bot : top; b.c.push(c[0], c[1], c[2]); b.u.push((t === 1 || t === 2 ? 1 : 0) + fi.shape * 2, t >= 2 ? 1 : 0); b.g.push(t < 2 ? fi.glow * 0.3 : fi.glow); }
      b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const pack = b => ({ p: new Float32Array(b.p), n: new Float32Array(b.n), c: new Float32Array(b.c), u: new Float32Array(b.u), g: new Float32Array(b.g), i: (b.p.length / 3 > 65535 ? new Uint32Array(b.i) : new Uint16Array(b.i)) });
  return { cx, cz, solid: pack(out.solid), glass: pack(out.glass), water: pack(out.water), deco: pack(out.deco) };
}
function transfers(r) { const t = []; for (const k of ['solid', 'glass', 'water', 'deco']) for (const a of ['p', 'n', 'c', 'u', 'g', 'i']) t.push(r[k][a].buffer); return t; }
const api = { setInfo, meshChunk, transfers, CS };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else G.HollowMesher = api;
// worker mode
if (typeof WorkerGlobalScope !== 'undefined' && G instanceof WorkerGlobalScope) {
  let vox = null;
  G.onmessage = e => {
    const m = e.data;
    if (m.type === 'init') { vox = new Uint8Array(m.vox); setInfo(m.blocks); }
    else if (m.type === 'set') { for (let k = 0; k < m.list.length; k += 2) vox[m.list[k]] = m.list[k + 1]; }
    else if (m.type === 'mesh') { const r = meshChunk(vox, m.cx, m.cz); r.job = m.job; G.postMessage(r, transfers(r)); }
  };
}
})(typeof self !== 'undefined' ? self : globalThis);
