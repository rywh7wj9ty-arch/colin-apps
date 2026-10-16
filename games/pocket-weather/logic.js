/* Pocket Weather: pure game logic (no DOM). Shared by the game (window.PWLogic) and the Node tests.
   The island is a grid of tiles. The wanderer walks by itself toward the goal; the player only changes the weather. */
(function (root, factory) {
  var L = factory();
  if (typeof module === 'object' && module.exports) module.exports = L; else root.PWLogic = L;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var T = {
    VOID: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, SNOW: 5, START: 6, GOAL: 7,
    SPROUT: 8, VINE: 9, SPORE: 10, MUSH: 11, BASIN: 12, POND: 13, WATER: 14, ICE: 15,
    MUD: 16, PUDDLE: 17, ICEBLOCK: 18, FIRE: 19, ASH: 20, BUSH: 21, ROCK: 22, RUBBLE: 23,
    FLOWER: 24, FLOWERON: 25, GATE: 26, GATEOPEN: 27, MILL: 28, LIFT: 29, GEN: 30, GENON: 31,
    DRAW: 32, DRAWON: 33, RSTONE: 34, RAINBOW: 35, STEPS: 36, TREE: 37, FROZEN: 38
  };
  var NAMES = [];
  Object.keys(T).forEach(function (k) { NAMES[T[k]] = k.toLowerCase(); });
  var O = { NONE: 0, BOAT: 1, CLOUD: 2, SANDPILE: 3, SNOWPILE: 4 };

  var CHARS = {
    '_': [T.VOID], ' ': [T.VOID], '.': [T.GRASS], ',': [T.DIRT], '=': [T.STONE], ':': [T.SAND], '+': [T.SNOW],
    '$': [T.START], '*': [T.GOAL], 's': [T.SPROUT], 'm': [T.SPORE], 'b': [T.BASIN], 'o': [T.POND],
    'w': [T.WATER], 'B': [T.WATER, O.BOAT], 'c': [T.VOID, O.CLOUD], '~': [T.MUD], 'p': [T.PUDDLE],
    'i': [T.ICE], 'I': [T.ICEBLOCK], 'f': [T.FIRE], 'k': [T.BUSH], 'r': [T.ROCK], 'F': [T.FLOWER],
    'G': [T.GATE], 'M': [T.MILL], 'L': [T.LIFT], 'E': [T.GEN], 'D': [T.DRAW], 'R': [T.RSTONE],
    'd': [T.SAND, O.SANDPILE], 'n': [T.SNOW, O.SNOWPILE], '^': [T.STEPS], 'T': [T.TREE], 'v': [T.VINE]
  };

  var WALK = {}; [T.GRASS, T.DIRT, T.STONE, T.SAND, T.SNOW, T.START, T.GOAL, T.VINE, T.SPORE, T.MUSH, T.POND,
    T.ICE, T.PUDDLE, T.ASH, T.RUBBLE, T.GATEOPEN, T.LIFT, T.DRAWON, T.RSTONE, T.RAINBOW, T.STEPS, T.FROZEN
  ].forEach(function (t) { WALK[t] = 1; });
  var WATERY = {}; [T.WATER, T.POND].forEach(function (t) { WATERY[t] = 1; });
  var CONDUCT = {}; [T.WATER, T.POND, T.PUDDLE, T.MUD].forEach(function (t) { CONDUCT[t] = 1; });
  var TALL = {}; [T.TREE, T.MILL, T.GATE, T.GEN, T.GENON, T.FLOWER, T.FLOWERON, T.ROCK, T.ICEBLOCK, T.BUSH].forEach(function (t) { TALL[t] = 1; });
  var GROUND = {}; [T.GRASS, T.DIRT, T.STONE, T.SAND, T.SNOW, T.ASH, T.RUBBLE, T.PUDDLE, T.FROZEN, T.START].forEach(function (t) { GROUND[t] = 1; });

  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];          // E S W N (grid y grows "south")
  var WEATHERS = ['rain', 'sun', 'wind', 'snow', 'bolt'];
  var F_LILY = 1, F_WET = 2, F_UP = 4;

  function parse(def) {
    var rows = def.map, H = rows.length, W = 0, i, x, y;
    for (i = 0; i < H; i++) W = Math.max(W, rows[i].length);
    var n = W * H, s = {
      w: W, h: H, t: new Array(n), hh: new Array(n), f: new Array(n), o: new Array(n),
      wx: 0, wy: 0, px: -1, py: -1, gx: 0, gy: 0, sx: 0, sy: 0, bolts: def.bolts || 0, won: false,
      secrets: [], uses: { rain: 0, sun: 0, wind: 0, snow: 0, bolt: 0 }, moves: 0
    };
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var ch = rows[y][x] || '_', c = CHARS[ch];
      if (!c) throw new Error('Level ' + def.id + ': unknown tile "' + ch + '" at ' + x + ',' + y);
      i = y * W + x;
      s.t[i] = c[0]; s.o[i] = c[1] || 0; s.f[i] = 0;
      var hr = def.heights && def.heights[y];
      s.hh[i] = hr ? (parseInt(hr[x], 10) || 0) : 0;
      if (ch === 'o') s.f[i] |= F_LILY;
      if (c[0] === T.START) { s.wx = s.sx = x; s.wy = s.sy = y; }
      if (c[0] === T.GOAL) { s.gx = x; s.gy = y; }
    }
    (def.up || []).forEach(function (p) { s.f[p[1] * s.w + p[0]] |= F_UP; });
    (def.lily || []).forEach(function (p) { s.f[p[1] * W + p[0]] |= F_LILY; });
    (def.drops || []).forEach(function (d, k) { s.secrets.push({ x: d[0], y: d[1], w: d[2], taken: false, id: k }); });
    return s;
  }

  function clone(s) {
    return {
      w: s.w, h: s.h, t: s.t.slice(), hh: s.hh.slice(), f: s.f.slice(), o: s.o.slice(),
      wx: s.wx, wy: s.wy, px: s.px, py: s.py, gx: s.gx, gy: s.gy, sx: s.sx, sy: s.sy, bolts: s.bolts, won: s.won,
      secrets: s.secrets.map(function (q) { return { x: q.x, y: q.y, w: q.w, taken: q.taken, id: q.id }; }),
      uses: { rain: s.uses.rain, sun: s.uses.sun, wind: s.uses.wind, snow: s.uses.snow, bolt: s.uses.bolt }, moves: s.moves
    };
  }

  function inb(s, x, y) { return x >= 0 && y >= 0 && x < s.w && y < s.h; }
  function idx(s, x, y) { return y * s.w + x; }
  function height(s, i) { return s.hh[i] + ((s.t[i] === T.LIFT && (s.f[i] & F_UP)) ? 1 : 0); }
  function walkable(s, i) {
    var t = s.t[i], o = s.o[i];
    if (o === O.SANDPILE || o === O.SNOWPILE) return false;
    if (o === O.BOAT && WATERY[t]) return true;
    if (o === O.CLOUD && t === T.VOID) return true;
    return !!WALK[t] && !(t === T.POND && !(s.f[i] & F_LILY));
  }
  function canMove(s, a, b) {
    if (!walkable(s, b)) return false;
    var dh = height(s, b) - height(s, a), ta = s.t[a], tb = s.t[b];
    if (dh === 0 || dh === -1) return true;
    if (dh === 1) return ta === T.STEPS || ta === T.MUSH || tb === T.STEPS;
    if (dh === 2) return ta === T.MUSH;
    if (dh === -2) return tb === T.MUSH;
    return false;
  }

  // Breadth-first search from the wanderer. Returns {dist, prev} over reachable tiles.
  function bfs(s, from) {
    var n = s.w * s.h, dist = new Array(n), prev = new Array(n), q = [from], head = 0, k;
    for (k = 0; k < n; k++) dist[k] = -1;
    dist[from] = 0; prev[from] = -1;
    while (head < q.length) {
      var a = q[head++], ax = a % s.w, ay = (a / s.w) | 0;
      for (k = 0; k < 4; k++) {
        var bx = ax + DIRS[k][0], by = ay + DIRS[k][1];
        if (!inb(s, bx, by)) continue;
        var b = idx(s, bx, by);
        if (dist[b] >= 0 || !canMove(s, a, b)) continue;
        dist[b] = dist[a] + 1; prev[b] = a; q.push(b);
      }
    }
    return { dist: dist, prev: prev };
  }

  // Where the wanderer wants to go next: the goal if reachable, else the reachable tile closest to it.
  function decide(s) {
    if (s.won) return null;
    var here = idx(s, s.wx, s.wy), g = idx(s, s.gx, s.gy);
    if (here === g) return null;
    var r = bfs(s, here), target = -1;
    if (r.dist[g] >= 0) target = g;
    else {
      var best = 1e9;
      for (var i = 0; i < r.dist.length; i++) {
        if (r.dist[i] < 0) continue;
        var m = Math.abs(i % s.w - s.gx) + Math.abs(((i / s.w) | 0) - s.gy);
        if (m < best) { best = m; target = i; }
      }
      var hm = Math.abs(s.wx - s.gx) + Math.abs(s.wy - s.gy);
      if (hm <= best) target = here;
    }
    if (target === here || target < 0) return null;
    var c = target; while (r.prev[c] !== here) c = r.prev[c];
    return { x: c % s.w, y: (c / s.w) | 0, reachGoal: target === g };
  }

  // Take one step. Returns events.
  function step(s) {
    var d = decide(s);
    if (!d) return null;
    var fx = s.wx, fy = s.wy;
    s.px = fx; s.py = fy; s.wx = d.x; s.wy = d.y; s.moves++;
    var ev = [{ type: 'walk', fx: fx, fy: fy, x: d.x, y: d.y,
      dh: height(s, idx(s, d.x, d.y)) - height(s, idx(s, fx, fy)) }];
    if (d.x === s.gx && d.y === s.gy) { s.won = true; ev.push({ type: 'win' }); }
    return ev;
  }

  // The wanderer's tile stopped being walkable (pond dried, ice melted...): float them back to where they came from.
  function checkFeet(s, ev) {
    var here = idx(s, s.wx, s.wy);
    if (walkable(s, here)) return;
    var t0 = s.t[here], best = -1, k;
    if (inb(s, s.px, s.py) && idx(s, s.px, s.py) !== here && walkable(s, idx(s, s.px, s.py))) best = idx(s, s.px, s.py);
    for (k = 0; k < 4 && best < 0; k++) {
      var nx = s.wx + DIRS[k][0], ny = s.wy + DIRS[k][1];
      if (inb(s, nx, ny) && walkable(s, idx(s, nx, ny))) best = idx(s, nx, ny);
    }
    if (best < 0) best = idx(s, s.sx, s.sy);
    var kind = (WATERY[t0] || t0 === T.BASIN) ? 'splash' : (t0 === T.MUD ? 'squelch' : 'bump');
    ev.push({ type: 'float', kind: kind, fx: s.wx, fy: s.wy, x: best % s.w, y: (best / s.w) | 0 });
    s.px = s.wx; s.py = s.wy;
    s.wx = best % s.w; s.wy = (best / s.w) | 0;
  }

  function reveal(s, x, y, w, ev) {
    for (var k = 0; k < s.secrets.length; k++) {
      var q = s.secrets[k];
      if (!q.taken && q.x === x && q.y === y && q.w === w) { q.taken = true; ev.push({ type: 'drop', x: x, y: y, id: q.id }); }
    }
  }

  function set(s, i, t, ev, kind) {
    var from = s.t[i]; s.t[i] = t;
    ev.push({ type: 'tile', x: i % s.w, y: (i / s.w) | 0, from: from, to: t, kind: kind || 'change' });
  }

  function rainOn(s, i, ev) {
    var t = s.t[i];
    switch (t) {
      case T.SPROUT: set(s, i, T.VINE, ev, 'grow'); return true;
      case T.SPORE: set(s, i, T.MUSH, ev, 'grow'); return true;
      case T.BASIN: s.f[i] |= F_LILY; set(s, i, T.POND, ev, 'fill'); return true;
      case T.DIRT: set(s, i, T.MUD, ev, 'mud'); return true;
      case T.STONE: set(s, i, T.PUDDLE, ev, 'wet'); return true;
      case T.FIRE: set(s, i, T.ASH, ev, 'douse'); return true;
      case T.RSTONE: if (!(s.f[i] & F_WET)) { s.f[i] |= F_WET; ev.push({ type: 'tile', x: i % s.w, y: (i / s.w) | 0, from: t, to: t, kind: 'wet' }); return true; } return false;
    }
    return false;
  }
  function snowOn(s, i, ev) {
    var t = s.t[i];
    switch (t) {
      case T.WATER: case T.POND:
        if (s.o[i] === O.BOAT) return false;
        if (t === T.POND) s.f[i] |= F_LILY; else s.f[i] &= ~F_LILY;
        set(s, i, T.ICE, ev, 'freeze'); return true;
      case T.MUD: set(s, i, T.FROZEN, ev, 'freeze'); return true;
      case T.FIRE: set(s, i, T.ASH, ev, 'douse'); return true;
    }
    return false;
  }
  function sunOn(s, i, ev) {
    var t = s.t[i], k;
    switch (t) {
      case T.ICE: set(s, i, (s.f[i] & F_LILY) ? T.POND : T.WATER, ev, 'melt'); return true;
      case T.ICEBLOCK: set(s, i, T.PUDDLE, ev, 'melt'); return true;
      case T.POND: s.f[i] &= ~F_LILY; set(s, i, T.BASIN, ev, 'dry'); return true;
      case T.MUD: set(s, i, T.DIRT, ev, 'dry'); return true;
      case T.FROZEN: set(s, i, T.MUD, ev, 'melt'); return true;
      case T.PUDDLE: set(s, i, T.STONE, ev, 'dry'); return true;
      case T.FLOWER:
        set(s, i, T.FLOWERON, ev, 'bloom');
        for (k = 0; k < s.t.length; k++) if (s.t[k] === T.GATE) set(s, k, T.GATEOPEN, ev, 'open');
        return true;
      case T.RSTONE:
        if (!(s.f[i] & F_WET)) return false;
        s.f[i] &= ~F_WET;
        var x = i % s.w, y = (i / s.w) | 0, made = false;
        for (var d = 0; d < 4; d++) {
          var cells = [], cx = x + DIRS[d][0], cy = y + DIRS[d][1];
          while (inb(s, cx, cy)) {
            var j = idx(s, cx, cy), tj = s.t[j];
            if (tj === T.RSTONE) { if (cells.length) { made = true;
              ev.push({ type: 'rainbow', x: x, y: y, x2: cx, y2: cy });
              cells.forEach(function (c) { s.hh[c] = s.hh[i]; s.o[c] = 0; set(s, c, T.RAINBOW, ev, 'rainbow'); }); }
              break; }
            if (tj === T.VOID || tj === T.WATER || tj === T.BASIN) { cells.push(j); cx += DIRS[d][0]; cy += DIRS[d][1]; continue; }
            break;
          }
        }
        ev.push({ type: 'tile', x: x, y: y, from: t, to: t, kind: made ? 'rainbowsrc' : 'dry' });
        return true;
    }
    if (s.o[i] === O.SNOWPILE) { s.o[i] = 0; set(s, i, T.PUDDLE, ev, 'melt'); return true; }
    return false;
  }
  function boltOn(s, i, ev) {
    var t = s.t[i], k;
    if (s.bolts <= 0) return false;
    var did = false;
    if (t === T.ROCK) { set(s, i, T.RUBBLE, ev, 'shatter'); did = true; }
    else if (t === T.BUSH) { set(s, i, T.FIRE, ev, 'ignite'); did = true; }
    else if (t === T.ICEBLOCK) { set(s, i, T.PUDDLE, ev, 'shatter'); did = true; }
    else if (CONDUCT[t]) {
      // electricity runs through connected water, puddles and mud and wakes any generator touching it
      var seen = {}, q = [i], region = [], gens = [];
      seen[i] = 1;
      while (q.length) {
        var a = q.shift(); region.push(a);
        var ax = a % s.w, ay = (a / s.w) | 0;
        for (k = 0; k < 4; k++) {
          var bx = ax + DIRS[k][0], by = ay + DIRS[k][1];
          if (!inb(s, bx, by)) continue;
          var b = idx(s, bx, by);
          if (seen[b]) continue;
          if (s.t[b] === T.GEN && gens.indexOf(b) < 0) gens.push(b);
          if (CONDUCT[s.t[a]] && CONDUCT[s.t[b]]) { seen[b] = 1; q.push(b); }
        }
      }
      // a coil is insulated: it only drinks electricity through the water touching it
      ev.push({ type: 'zap', cells: region.map(function (c) { return [c % s.w, (c / s.w) | 0]; }) });
      if (gens.length) {
        gens.forEach(function (g) { set(s, g, T.GENON, ev, 'power'); });
        for (k = 0; k < s.t.length; k++) if (s.t[k] === T.DRAW) set(s, k, T.DRAWON, ev, 'extend');
        did = true;
      }
    }
    return did;
  }

  function pushObj(s, i, d, ev) {
    var o = s.o[i], x = i % s.w, y = (i / s.w) | 0, dx = DIRS[d][0], dy = DIRS[d][1];
    var here = idx(s, s.wx, s.wy), riding = here === i;
    if (o === O.BOAT || o === O.CLOUD) {
      var cx = x, cy = y;
      for (;;) {
        var nx = cx + dx, ny = cy + dy;
        if (!inb(s, nx, ny)) break;
        var j = idx(s, nx, ny);
        if (s.o[j] || (o === O.BOAT ? !WATERY[s.t[j]] || s.t[j] === T.POND && (s.f[j] & F_LILY) : s.t[j] !== T.VOID)) break;
        cx = nx; cy = ny;
      }
      if (cx === x && cy === y) return false;
      var e = idx(s, cx, cy);
      s.o[i] = 0; s.o[e] = o;
      if (o === O.CLOUD) s.hh[e] = s.hh[i];
      ev.push({ type: 'push', obj: o, fx: x, fy: y, x: cx, y: cy, ride: riding });
      if (riding) { s.px = s.wx; s.py = s.wy; s.wx = cx; s.wy = cy; }
      return true;
    }
    if (o === O.SANDPILE || o === O.SNOWPILE) {
      var px = x + dx, py = y + dy;
      if (!inb(s, px, py)) return false;
      var p = idx(s, px, py), tp = s.t[p];
      if (p === here || s.o[p]) return false;
      if (tp === T.VOID || WATERY[tp] || tp === T.BASIN) {
        s.o[i] = 0;
        var nt = o === O.SANDPILE ? T.SAND : (WATERY[tp] ? T.ICE : T.SNOW);
        if (tp === T.VOID || tp === T.BASIN) s.hh[p] = s.hh[i];
        ev.push({ type: 'push', obj: o, fx: x, fy: y, x: px, y: py, fill: true });
        s.f[p] &= ~F_LILY;
        set(s, p, nt, ev, 'fill');
        return true;
      }
      if (GROUND[tp] && s.hh[p] === s.hh[i]) {
        s.o[i] = 0; s.o[p] = o;
        ev.push({ type: 'push', obj: o, fx: x, fy: y, x: px, y: py });
        return true;
      }
      return false;
    }
    return false;
  }

  function glide(s, d, ev) {
    var here = idx(s, s.wx, s.wy), dx = DIRS[d][0], dy = DIRS[d][1];
    for (var k = 1; k <= 4; k++) {
      var x = s.wx + dx * k, y = s.wy + dy * k;
      if (!inb(s, x, y)) return false;
      var j = idx(s, x, y);
      if (walkable(s, j)) {
        // gliding needs a drop: the landing must be lower than where the wanderer stands
        if (k < 2 || height(s, j) >= height(s, here)) return false;
        ev.push({ type: 'glide', fx: s.wx, fy: s.wy, x: x, y: y });
        s.px = s.wx; s.py = s.wy; s.wx = x; s.wy = y;
        if (x === s.gx && y === s.gy) { s.won = true; ev.push({ type: 'win' }); }
        return true;
      }
      if (TALL[s.t[j]] || s.o[j] === O.SANDPILE || s.o[j] === O.SNOWPILE) return false;
    }
    return false;
  }

  function plus(x, y) { return [[x, y], [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]; }
  function dirOf(name) { return typeof name === 'number' ? name : { e: 0, s: 1, w: 2, n: 3 }[name]; }

  /* Apply one weather action. Returns {ok, events}. ok=false means it had no effect on the puzzle (still counted by the game). */
  function apply(s, a) {
    var ev = [], did = false, i, k;
    if (s.won) return { ok: false, events: ev };
    var w = a.w;
    if (w === 'rain' || w === 'snow') {
      // a rain or snow cloud bursts over a plus shape: the tile under it and its four neighbours
      var cells = a.cells || plus(a.x, a.y), seen = {};
      for (k = 0; k < cells.length; k++) {
        var cx = cells[k][0], cy = cells[k][1];
        if (!inb(s, cx, cy)) continue;
        i = idx(s, cx, cy); if (seen[i]) continue; seen[i] = 1;
        if ((w === 'rain' ? rainOn : snowOn)(s, i, ev)) did = true;
        reveal(s, cx, cy, w, ev);
      }
    } else if (w === 'sun') {
      if (inb(s, a.x, a.y)) { i = idx(s, a.x, a.y); did = sunOn(s, i, ev); reveal(s, a.x, a.y, 'sun', ev); }
    } else if (w === 'bolt') {
      if (inb(s, a.x, a.y) && s.bolts > 0) {
        i = idx(s, a.x, a.y); did = boltOn(s, i, ev); reveal(s, a.x, a.y, 'bolt', ev);
        s.bolts--; ev.push({ type: 'bolt', x: a.x, y: a.y, left: s.bolts });
      }
    } else if (w === 'wind') {
      var d = dirOf(a.dir), len = Math.max(1, Math.min(6, a.len || 1)), list = [];
      for (k = 0; k < len; k++) {
        var lx = a.x + DIRS[d][0] * k, ly = a.y + DIRS[d][1] * k;
        if (inb(s, lx, ly)) list.push(idx(s, lx, ly));
      }
      var mill = false, wHere = idx(s, s.wx, s.wy), onW = list.indexOf(wHere) >= 0, moved = {};
      for (k = list.length - 1; k >= 0; k--) {
        i = list[k];
        if (s.t[i] === T.MILL) mill = true;
        if (s.o[i] && !moved[i]) { var before = s.o[i]; if (pushObj(s, i, d, ev)) { did = true; moved[i] = 1; } else if (before) ev.push({ type: 'wobble', x: i % s.w, y: (i / s.w) | 0 }); }
        reveal(s, i % s.w, (i / s.w) | 0, 'wind', ev);
      }
      if (mill) {
        for (k = 0; k < s.t.length; k++) if (s.t[k] === T.LIFT) { s.f[k] ^= F_UP; ev.push({ type: 'lift', x: k % s.w, y: (k / s.w) | 0, up: !!(s.f[k] & F_UP) }); }
        ev.push({ type: 'mill' }); did = true;
      }
      if (onW && idx(s, s.wx, s.wy) === wHere) { if (glide(s, d, ev)) did = true; else ev.push({ type: 'gust', x: s.wx, y: s.wy }); }
    }
    if (s.uses[w] !== undefined) s.uses[w]++;
    checkFeet(s, ev);
    return { ok: did, events: ev };
  }

  function settle(s, max) {
    var all = [], n = 0;
    max = max || 400;
    while (n++ < max) { var e = step(s); if (!e) break; all.push.apply(all, e); if (s.won) break; }
    return all;
  }

  function key(s) {
    var parts = [s.wx, s.wy, s.bolts, s.won ? 1 : 0];
    for (var i = 0; i < s.t.length; i++) parts.push(s.t[i] + '.' + s.f[i] + '.' + s.o[i] + '.' + s.hh[i]);
    return parts.join(',');
  }

  function weathersFor(def) {
    if (def.weathers) return def.weathers.slice();
    var base = [['rain', 'sun'], ['rain', 'sun', 'wind'], ['rain', 'sun', 'wind', 'snow'], ['rain', 'sun', 'wind', 'snow', 'bolt'], ['rain', 'sun', 'wind', 'snow', 'bolt']][def.world] || WEATHERS;
    return base.slice();
  }

  function candidates(s, weathers) {
    var out = [];
    for (var y = 0; y < s.h; y++) for (var x = 0; x < s.w; x++) {
      var i = idx(s, x, y), t = s.t[i];
      var isVoid = t === T.VOID && !s.o[i];
      for (var k = 0; k < weathers.length; k++) {
        var w = weathers[k];
        if (isVoid && w !== 'rain' && w !== 'snow') continue;
        if (w === 'wind') { for (var d = 0; d < 4; d++) out.push({ w: 'wind', x: x, y: y, dir: 'eswn'[d], len: 1 }); }
        else if (w === 'bolt') { if (s.bolts > 0) out.push({ w: w, x: x, y: y }); }
        else out.push({ w: w, x: x, y: y });
      }
    }
    return out;
  }

  /* Breadth-first search over weather actions (the wanderer settles after each). Finds the fewest actions to win. */
  function solve(def, opts) {
    opts = opts || {};
    var start = opts.state ? clone(opts.state) : parse(def), weathers = weathersFor(def);
    settle(start);
    if (start.won) return { actions: [], nodes: 1 };
    var seen = {}, q = [{ s: start, path: [] }], head = 0, maxNodes = opts.maxNodes || 200000, maxDepth = opts.maxDepth || 12;
    seen[key(start)] = 1;
    while (head < q.length) {
      var cur = q[head++];
      if (cur.path.length >= maxDepth) continue;
      var acts = candidates(cur.s, weathers);
      for (var k = 0; k < acts.length; k++) {
        var n = clone(cur.s), r = apply(n, acts[k]);
        if (!r.ok) continue;
        settle(n);
        var kk = key(n);
        if (seen[kk]) continue;
        seen[kk] = 1;
        var p = cur.path.concat([acts[k]]);
        if (n.won) return { actions: p, nodes: head };
        q.push({ s: n, path: p });
        if (q.length > maxNodes) return { actions: null, nodes: head, aborted: true };
      }
    }
    return { actions: null, nodes: head };
  }

  /* Replay a scripted solution headlessly; returns the final state. */
  function replay(def, actions) {
    var s = parse(def); settle(s);
    for (var k = 0; k < actions.length && !s.won; k++) { apply(s, actions[k]); settle(s); }
    return s;
  }

  // ── saves (pure helpers so they can be unit-tested) ──
  var DEFAULT_SETTINGS = { music: 0.6, sfx: 0.8, reducedMotion: false, reducedEffects: false, leftHanded: false };
  function freshSave() {
    var st = {}; Object.keys(DEFAULT_SETTINGS).forEach(function (k) { st[k] = DEFAULT_SETTINGS[k]; });
    return { v: 1, levels: {}, stats: { rain: 0, sun: 0, wind: 0, snow: 0, bolt: 0, splashes: 0, glides: 0, rainbows: 0, wins: 0, retries: 0, drops: 0, seconds: 0 },
      ach: {}, settings: st, tips: {} };
  }
  // Parse whatever is in storage; anything missing or broken falls back to defaults, never throws.
  function mergeSave(raw) {
    var f = freshSave(), d;
    try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return f; }
    if (!d || typeof d !== 'object') return f;
    var k;
    if (d.levels && typeof d.levels === 'object') for (k in d.levels) {
      var l = d.levels[k] || {};
      f.levels[k] = { done: !!l.done, best: typeof l.best === 'number' ? l.best : null, challenge: !!l.challenge, plays: l.plays | 0,
        drops: [0, 1, 2].map(function (j) { return !!(l.drops && l.drops[j]); }) };
    }
    if (d.stats) for (k in f.stats) if (typeof d.stats[k] === 'number') f.stats[k] = d.stats[k];
    if (d.settings) for (k in f.settings) if (typeof d.settings[k] === typeof f.settings[k]) f.settings[k] = d.settings[k];
    if (d.ach && typeof d.ach === 'object') f.ach = d.ach;
    if (d.tips && typeof d.tips === 'object') f.tips = d.tips;
    return f;
  }
  function isUnlocked(save, levels, k) { return k === 0 || !!(save.levels[levels[k - 1].id] || {}).done; }
  // Record a finished level: keeps the best (fewest) weather count and never un-finds a drop.
  function recordWin(save, def, uses) {
    var l = save.levels[def.id] || (save.levels[def.id] = { done: false, best: null, drops: [false, false, false], challenge: false, plays: 0 });
    var first = !l.done;
    l.done = true; l.plays = (l.plays || 0) + 1;
    if (l.best === null || uses < l.best) l.best = uses;
    var beat = uses <= (def.par || 99);
    if (beat) l.challenge = true;
    save.stats.wins++;
    return { first: first, beat: beat };
  }

  return { freshSave: freshSave, mergeSave: mergeSave, isUnlocked: isUnlocked, recordWin: recordWin, T: T, O: O, NAMES: NAMES, DIRS: DIRS, WEATHERS: WEATHERS, F_LILY: F_LILY, F_WET: F_WET, F_UP: F_UP,
    parse: parse, clone: clone, walkable: walkable, canMove: canMove, height: height, bfs: bfs, decide: decide,
    step: step, apply: apply, settle: settle, key: key, solve: solve, replay: replay, weathersFor: weathersFor,
    candidates: candidates, plus: plus, idx: idx, inb: inb, dirOf: dirOf, CONDUCT: CONDUCT, WATERY: WATERY };
});
