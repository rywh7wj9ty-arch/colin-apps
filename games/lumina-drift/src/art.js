// ===== Procedural painterly art =====
var Art = (function () {
  var R = {};
  function rng(seed) { var s = (seed * 9301 + 49297) % 233280 || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  R.rng = rng;
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : a) + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function shade(c, k) { return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]; }
  R.rgba = rgba; R.mix = mix; R.shade = shade;
  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  R.cv = cv;
  R.PAL = [
    { grass: [118, 204, 112], hi: [214, 248, 150], rockT: [168, 128, 110], rockB: [78, 64, 110], glow: [255, 214, 130], acc: [140, 255, 200], fog: [190, 230, 215], far: [120, 170, 170], tint: [150, 225, 180], flora: 'forest' },
    { grass: [110, 190, 210], hi: [200, 250, 255], rockT: [120, 110, 170], rockB: [50, 44, 100], glow: [140, 225, 255], acc: [235, 160, 255], fog: [190, 180, 245], far: [120, 110, 190], tint: [165, 140, 240], flora: 'caves' },
    { grass: [126, 170, 150], hi: [205, 235, 215], rockT: [128, 132, 156], rockB: [52, 56, 86], glow: [190, 210, 255], acc: [255, 226, 150], fog: [175, 185, 215], far: [100, 110, 150], tint: [140, 150, 190], flora: 'storm' },
    { grass: [236, 246, 255], hi: [255, 255, 255], rockT: [140, 150, 196], rockB: [66, 70, 128], glow: [130, 255, 220], acc: [255, 160, 225], fog: [200, 235, 245], far: [130, 160, 200], tint: [150, 235, 225], flora: 'aurora' }
  ];
  // soft glow sprite (white)
  R.glow = (function () { var c = cv(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; })();
  var tintCache = {};
  R.tinted = function (c3) { var k = (c3[0] | 0) + ',' + (c3[1] | 0) + ',' + (c3[2] | 0); if (tintCache[k]) return tintCache[k];
    var c = cv(128, 128), g = c.getContext('2d'); g.drawImage(R.glow, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = rgba(c3); g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6; g.drawImage(R.glow, 32, 32, 64, 64); return (tintCache[k] = c); };
  // painterly cloud sprite
  R.cloud = function (seed, w, h, col) {
    var r = rng(seed), c = cv(w, h), g = c.getContext('2d');
    for (var i = 0; i < 26; i++) {
      var x = w * (0.15 + r() * 0.7), y = h * (0.45 + r() * 0.3) - Math.sin((x / w) * Math.PI) * h * 0.2, rad = h * (0.18 + r() * 0.25);
      var gr = g.createRadialGradient(x, y - rad * 0.3, 0, x, y, rad);
      gr.addColorStop(0, rgba(col || [255, 255, 255], 0.5)); gr.addColorStop(0.6, rgba(col || [255, 255, 255], 0.22)); gr.addColorStop(1, rgba(col || [255, 255, 255], 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    }
    return c;
  };
  // island body path
  function islandPath(g, r, x0, top, w, h, depth) {
    var pts = [], n = Math.max(4, Math.round(w / 40));
    g.beginPath(); g.moveTo(x0 + 6, top);
    g.lineTo(x0 + w - 6, top); g.quadraticCurveTo(x0 + w + 2, top, x0 + w, top + 10);
    g.lineTo(x0 + w - 2, top + h * 0.8);
    for (var i = n; i >= 0; i--) {
      var t = i / n, cx = x0 + w * t, prof = Math.sin(Math.PI * Math.min(1, Math.max(0, t * 1.05 - 0.025)));
      var y = top + h * 0.8 + depth * Math.pow(prof, 0.8) * (0.7 + r() * 0.35);
      g.lineTo(cx + (r() - 0.5) * 14, y);
    }
    g.lineTo(x0 + 2, top + h * 0.8); g.lineTo(x0, top + 10); g.quadraticCurveTo(x0 - 2, top, x0 + 6, top); g.closePath();
  }
  R.island = function (s, bi) {
    var P = R.PAL[bi], r = rng(s.id * 7 + 3), pad = 34, top = 30;
    if (s.type === 'w') return R.wall(s, bi);
    var crumbly = s.type === 'c';
    var depth = s.tunnel ? 6 : s.type === 'help' ? 30 : crumbly ? 26 : Math.min(s.big ? 520 : 300, 50 + s.w * (s.big ? 0.55 : 0.5));
    var W = s.w + pad * 2, H = top + s.h + depth + 60, c = cv(W, H), g = c.getContext('2d');
    var rockT = crumbly ? mix(P.rockT, [220, 190, 150], 0.35) : P.rockT;
    islandPath(g, r, pad, top, s.w, s.tunnel ? s.h / 0.8 - 2 : s.h, s.tunnel ? 4 : depth); // tunnel: underside drawn exactly at the collision line
    var gr = g.createLinearGradient(0, top, 0, top + s.h + depth);
    gr.addColorStop(0, rgba(rockT)); gr.addColorStop(0.45, rgba(mix(rockT, P.rockB, 0.6))); gr.addColorStop(1, rgba(P.rockB, 0.85));
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    // painterly dabs
    for (var i = 0; i < (s.w * (s.h + depth)) / 500; i++) {
      var dx = pad + r() * s.w, dy = top + r() * (s.h + depth), rad = 6 + r() * 22, k = 0.75 + r() * 0.5;
      g.fillStyle = rgba(shade(mix(rockT, P.rockB, (dy - top) / (s.h + depth)), k), 0.18); g.beginPath(); g.ellipse(dx, dy, rad, rad * 0.55, (r() - 0.5) * 0.6, 0, 7); g.fill();
    }
    // strata
    g.lineWidth = 2; for (var j = 0; j < 4; j++) { var yy = top + s.h * 0.6 + j * (depth / 5) + r() * 10; g.strokeStyle = rgba(shade(rockT, 1.25), 0.2);
      g.beginPath(); g.moveTo(pad - 4, yy); for (var xx = 0; xx <= s.w; xx += 30) g.lineTo(pad + xx, yy + Math.sin(xx * 0.03 + j) * 5 + (r() - 0.5) * 4); g.stroke(); }
    // rim light (sun side) + ambient occlusion below the grass
    var rl = g.createLinearGradient(pad, 0, pad + 60, 0); rl.addColorStop(0, 'rgba(255,240,220,0.32)'); rl.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = rl; g.fillRect(pad - 10, top, 70, s.h + depth);
    var ao = g.createLinearGradient(0, top, 0, top + 34); ao.addColorStop(0, 'rgba(20,10,40,0.35)'); ao.addColorStop(1, 'rgba(20,10,40,0)'); g.fillStyle = ao; g.fillRect(0, top, W, 34);
    if (crumbly) { g.strokeStyle = 'rgba(40,20,30,0.45)'; g.lineWidth = 1.5; for (var q = 0; q < s.w / 25; q++) { var cx0 = pad + r() * s.w; g.beginPath(); g.moveTo(cx0, top); g.lineTo(cx0 + (r() - 0.5) * 14, top + 10); g.lineTo(cx0 + (r() - 0.5) * 20, top + s.h + 10); g.stroke(); } }
    g.restore();
    // bottom fade into atmosphere
    g.globalCompositeOperation = 'destination-out'; var fo = g.createLinearGradient(0, top + s.h + depth * 0.45, 0, top + s.h + depth); fo.addColorStop(0, 'rgba(0,0,0,0)'); fo.addColorStop(1, 'rgba(0,0,0,0.75)'); g.fillStyle = fo; g.fillRect(0, top + s.h, W, depth + 10); g.globalCompositeOperation = 'source-over';
    // hanging roots / icicles / crystals
    var nh = s.tunnel ? 0 : Math.round(s.w / 45);
    for (var h2 = 0; h2 < nh; h2++) {
      var hx = pad + 12 + r() * (s.w - 24), prof2 = Math.sin(Math.PI * (hx - pad) / s.w), hy = top + s.h * 0.8 + depth * Math.pow(prof2, 0.8) * 0.6, len = 20 + r() * 50;
      if (P.flora === 'forest' || P.flora === 'storm') { g.strokeStyle = rgba(shade(P.grass, 0.6), 0.75); g.lineWidth = 1.6; g.beginPath(); g.moveTo(hx, hy - 10); g.quadraticCurveTo(hx + (r() - 0.5) * 20, hy + len * 0.5, hx + (r() - 0.5) * 10, hy + len); g.stroke();
        if (P.flora === 'forest' && r() < 0.5) { g.fillStyle = rgba(P.acc, 0.9); g.beginPath(); g.arc(hx, hy + len, 2.2, 0, 7); g.fill(); } }
      else { var cc = P.flora === 'caves' ? (r() < 0.5 ? P.glow : P.acc) : [220, 245, 255]; var cw = 3 + r() * 5;
        var cg = g.createLinearGradient(0, hy - 10, 0, hy + len); cg.addColorStop(0, rgba(cc, 0.9)); cg.addColorStop(1, rgba(shade(cc, 1.2), 0.25));
        g.fillStyle = cg; g.beginPath(); g.moveTo(hx - cw, hy - 10); g.lineTo(hx + cw, hy - 10); g.lineTo(hx + (r() - 0.5) * 4, hy + len * 0.8); g.closePath(); g.fill(); }
    }
    // grass / snow / moss cap
    var capH = crumbly ? 7 : 12;
    g.fillStyle = rgba(shade(P.grass, 0.72)); roundCap(g, pad - 3, top - 2, s.w + 6, capH + 5, r);
    var cgr = g.createLinearGradient(0, top - 6, 0, top + capH); cgr.addColorStop(0, rgba(P.hi)); cgr.addColorStop(0.5, rgba(P.grass)); cgr.addColorStop(1, rgba(shade(P.grass, 0.85)));
    g.fillStyle = cgr; roundCap(g, pad - 4, top - 6, s.w + 8, capH + 2, r);
    for (var d = 0; d < s.w / 6; d++) { g.fillStyle = rgba(r() < 0.5 ? P.hi : shade(P.grass, 1.1), 0.35); g.beginPath(); g.ellipse(pad + r() * s.w, top - 3 + r() * 6, 3 + r() * 6, 1.5 + r() * 1.5, 0, 0, 7); g.fill(); }
    // drips over the edges
    for (var e2 = 0; e2 < s.w / 30; e2++) { var ex = pad + r() * s.w, el = 4 + r() * 12; g.fillStyle = rgba(shade(P.grass, 0.85)); g.beginPath(); g.ellipse(ex, top + capH - 2, 4 + r() * 4, el * 0.5, 0, 0, 7); g.fill(); }
    return { c: c, ox: s.x - pad, oy: s.y - top };
  };
  function roundCap(g, x, y, w, h, r) { var rr = Math.min(h / 2, 8); g.beginPath(); g.moveTo(x + rr, y); g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr); g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h); g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr); g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y); g.fill(); }
  R.wall = function (s, bi) {
    var P = R.PAL[bi], r = rng(s.id * 13 + 1), pad = 16, W = s.w + pad * 2, H = s.h + 40, c = cv(W, H), g = c.getContext('2d');
    g.beginPath(); g.moveTo(pad + 2, 10); g.lineTo(pad + s.w - 2, 10);
    for (var y = 10; y < s.h + 10; y += 24) g.lineTo(pad + s.w + (r() - 0.3) * 6, y + 12);
    g.lineTo(pad + s.w / 2, s.h + 34);
    for (var y2 = s.h + 10; y2 > 10; y2 -= 24) g.lineTo(pad + (r() - 0.7) * 6, y2);
    g.closePath();
    var gr = g.createLinearGradient(pad, 0, pad + s.w, 0); gr.addColorStop(0, rgba(shade(P.rockT, 1.1))); gr.addColorStop(1, rgba(P.rockB)); g.fillStyle = gr; g.fill();
    g.save(); g.clip(); for (var i = 0; i < s.h / 6; i++) { g.fillStyle = rgba(shade(P.rockT, 0.7 + r() * 0.6), 0.2); g.beginPath(); g.ellipse(pad + r() * s.w, 10 + r() * s.h, 6 + r() * 8, 4, 0, 0, 7); g.fill(); } g.restore();
    // glowing climbable moss on both faces
    for (var side = 0; side < 2; side++) for (var m = 14; m < s.h; m += 9 + r() * 8) {
      var mx = side ? pad + s.w - 1 : pad + 1; g.fillStyle = rgba(mix([120, 255, 190], P.glow, 0.3), 0.85); g.beginPath(); g.ellipse(mx, 10 + m, 3.5, 5 + r() * 4, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(230,255,240,0.7)'; g.beginPath(); g.arc(mx + (side ? 1 : -1), 10 + m - 2, 1.4, 0, 7); g.fill(); }
    g.fillStyle = rgba(P.grass); roundCap(g, pad - 3, 4, s.w + 6, 10, r);
    return { c: c, ox: s.x - pad, oy: s.y - 10, wall: 1 };
  };
  // trees: trunk + painterly canopy blobs with glowing lantern fruit
  R.tree = function (seed, bi) {
    var P = R.PAL[bi], r = rng(seed), W = 220, H = 260, c = cv(W, H), g = c.getContext('2d'), bx = W / 2, by = H - 4;
    var storm = P.flora === 'storm', snow = P.flora === 'aurora';
    g.strokeStyle = rgba(storm ? [70, 64, 84] : [92, 66, 80]); g.lineCap = 'round';
    function branch(x, y, a, len, w, d) { var x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.3) * len * 0.5, y + Math.sin(a + 0.3) * len * 0.5, x2, y2); g.stroke();
      if (d > 0) { branch(x2, y2, a - 0.4 - r() * 0.3, len * 0.72, w * 0.66, d - 1); branch(x2, y2, a + 0.4 + r() * 0.3, len * 0.72, w * 0.66, d - 1); } return [x2, y2]; }
    if (snow) { // crystalline pine
      g.fillStyle = rgba([84, 74, 110]); g.fillRect(bx - 4, by - 40, 8, 40);
      for (var l = 0; l < 5; l++) { var ly = by - 30 - l * 34, lw = 70 - l * 12; var pg = g.createLinearGradient(0, ly - 40, 0, ly); pg.addColorStop(0, 'rgba(250,255,255,1)'); pg.addColorStop(1, rgba(mix([110, 170, 190], P.glow, 0.3)));
        g.fillStyle = pg; g.beginPath(); g.moveTo(bx, ly - 46); g.lineTo(bx + lw, ly); g.lineTo(bx - lw, ly); g.closePath(); g.fill(); }
      return c; }
    branch(bx, by, -Math.PI / 2 + (r() - 0.5) * 0.2, 60 + r() * 20, 12, storm ? 4 : 3);
    if (storm) return c;
    var leaf = P.flora === 'caves' ? [120, 120, 220] : [92, 170, 120];
    for (var i = 0; i < 34; i++) { var a = r() * Math.PI * 2, d = r() * 70, x = bx + Math.cos(a) * d * 1.2, y = by - 150 + Math.sin(a) * d * 0.7, rad = 18 + r() * 26;
      var lg = g.createRadialGradient(x - rad * 0.3, y - rad * 0.4, 2, x, y, rad); lg.addColorStop(0, rgba(mix(leaf, [230, 255, 190], 0.45), 0.9)); lg.addColorStop(1, rgba(shade(leaf, 0.55), 0.85));
      g.fillStyle = lg; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
    for (var k = 0; k < 7; k++) { var fx = bx + (r() - 0.5) * 140, fy = by - 150 + (r() - 0.2) * 70; g.fillStyle = rgba(P.glow); g.beginPath(); g.arc(fx, fy, 3.2, 0, 7); g.fill(); }
    return c;
  };
  R.crystal = function (seed, bi) {
    var P = R.PAL[bi], r = rng(seed), W = 90, H = 120, c = cv(W, H), g = c.getContext('2d');
    for (var i = 0; i < 5; i++) { var x = W / 2 + (r() - 0.5) * 40, w = 6 + r() * 9, h = 30 + r() * 70, a = (r() - 0.5) * 0.7, col = r() < 0.6 ? P.glow : P.acc;
      g.save(); g.translate(x, H - 4); g.rotate(a);
      var gr = g.createLinearGradient(-w, 0, w, 0); gr.addColorStop(0, rgba(shade(col, 1.25), 0.95)); gr.addColorStop(0.5, rgba(col, 0.8)); gr.addColorStop(1, rgba(shade(col, 0.55), 0.9));
      g.fillStyle = gr; g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w * 0.8, -h * 0.8); g.lineTo(0, -h); g.lineTo(w * 0.8, -h * 0.8); g.lineTo(w, 0); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-w * 0.3, -2); g.lineTo(-w * 0.2, -h * 0.85); g.stroke(); g.restore(); }
    return c;
  };
  R.farIsland = function (seed, col, w, h) {
    var r = rng(seed), c = cv(w, h), g = c.getContext('2d');
    islandPath(g, r, 10, h * 0.25, w - 20, 10, h * 0.6); g.fillStyle = rgba(col); g.fill();
    // little trees silhouettes on top
    for (var i = 0; i < w / 40; i++) { var x = 20 + r() * (w - 40), rr = 6 + r() * 12; g.beginPath(); g.arc(x, h * 0.25 - rr * 0.6, rr, 0, 7); g.fill(); }
    var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, w, h);
    return c;
  };
  return R;
})();
