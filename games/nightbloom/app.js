(function () {
  "use strict";
  const L = window.NightbloomLogic;
  const $ = (id) => document.getElementById(id);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const STORE_MUTE = "nightbloom-mute";
  const STORE_BEST = "nightbloom-best";
  const STORE_DAILY = "nightbloom-daily-best";

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(STORE_BEST) || "{}");
    } catch (e) {
      return {};
    }
  }
  function saveBest(map) {
    localStorage.setItem(STORE_BEST, JSON.stringify(map));
  }

  const PIN_SVG =
    '<svg class="pin" viewBox="0 0 24 32" aria-hidden="true"><path d="M9.2 30.2 L14.6 6.4" fill="none" stroke="#c9d2dc" stroke-width="1.15" stroke-linecap="round"/><circle cx="15.1" cy="5.2" r="2.05" fill="#e8eef4"/><circle cx="15.1" cy="5.2" r="0.7" fill="#8a94a0"/></svg>';

  const POD_SVG =
    '<svg class="pod" viewBox="0 0 24 32" aria-hidden="true"><ellipse cx="12" cy="18" rx="6.2" ry="9.2" fill="#1a1022"/><ellipse cx="12" cy="18" rx="5.2" ry="8.2" fill="#2a1830"/><path d="M12 9.2 C14.4 14 14.6 22 12 26.8 C9.4 22 9.6 14 12 9.2Z" fill="#4a2848"/><ellipse cx="12" cy="14.5" rx="1.15" ry="2.4" fill="#c9a8c4" opacity="0.55"/><path d="M8.2 16.5 Q12 13.2 15.8 16.5" fill="none" stroke="#6a4060" stroke-width="0.6"/></svg>';

  const BLOOM_SVG =
    '<svg class="bloom" viewBox="0 0 24 32" aria-hidden="true"><ellipse cx="12" cy="22" rx="1.1" ry="6" fill="#3a3040"/><g fill="#e8d5a0" opacity="0.95"><ellipse cx="12" cy="12" rx="2.2" ry="5.5"/><ellipse cx="12" cy="12" rx="2.2" ry="5.5" transform="rotate(72 12 12)"/><ellipse cx="12" cy="12" rx="2.2" ry="5.5" transform="rotate(144 12 12)"/><ellipse cx="12" cy="12" rx="2.2" ry="5.5" transform="rotate(216 12 12)"/><ellipse cx="12" cy="12" rx="2.2" ry="5.5" transform="rotate(288 12 12)"/></g><circle cx="12" cy="12" r="1.6" fill="#fff6d8"/></svg>';

  const ROOT_SVG =
    '<svg class="root" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 C11 8 8 11 5 14 M12 3 C13 9 16 12 19 16 M12 8 C10 13 10 18 9 22 M12 8 C14 14 15 18 16 21" fill="none" stroke="rgba(190,200,210,0.45)" stroke-width="0.7"/></svg>';

  /* ---------------- Audio ---------------- */
  const AudioGarden = {
    ctx: null,
    master: null,
    muted: localStorage.getItem(STORE_MUTE) === "1",
    drone: null,
    unlocked: false,

    async unlock() {
      if (this.unlocked && this.ctx) {
        if (this.ctx.state === "suspended") await this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);
      this._drone();
      this.unlocked = true;
    },

    setMuted(m) {
      this.muted = m;
      localStorage.setItem(STORE_MUTE, m ? "1" : "0");
      if (this.master) {
        this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
      }
      $("btn-mute").setAttribute("aria-pressed", m ? "true" : "false");
      $("btn-mute").textContent = m ? "Sound" : "Mute";
    },

    _drone() {
      const ctx = this.ctx;
      const make = (freq, type, gain, q) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = gain;
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 160;
        f.Q.value = q;
        o.connect(g);
        g.connect(f);
        f.connect(this.master);
        o.start();
        return { o, g, f };
      };
      this.drone = [
        make(49, "sine", 0.045, 0.4),
        make(49.4, "sine", 0.04, 0.4),
        make(73.5, "triangle", 0.012, 0.7),
      ];
    },

    setWarmth(t) {
      if (!this.drone || !this.ctx) return;
      const now = this.ctx.currentTime;
      this.drone[0].f.frequency.setTargetAtTime(160 + t * 260, now, 1.4);
      this.drone[2].g.gain.setTargetAtTime(0.012 + t * 0.028, now, 1.4);
      this.drone[2].o.frequency.setTargetAtTime(73.5 + t * 24, now, 2);
    },

    _env(freq, dur, type, gain, slide) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(this.master);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    },

    tick() {
      this._env(1860, 0.045, "sine", 0.035);
    },
    pin() {
      this._env(2450, 0.07, "triangle", 0.04, 1800);
      this._env(1320, 0.09, "sine", 0.02);
    },
    unpin() {
      this._env(980, 0.06, "sine", 0.02, 700);
    },
    cascade(rings) {
      const notes = [523.25, 587.33, 659.25, 783.99, 880];
      const n = Math.min(5, Math.max(2, rings | 0));
      for (let i = 0; i < n; i++) {
        setTimeout(() => this._env(notes[i % notes.length], 0.18, "sine", 0.03), i * 55);
      }
    },
    lose() {
      this._env(110, 0.9, "sine", 0.08, 48);
      this._env(138, 0.7, "triangle", 0.04, 55);
      setTimeout(() => this._env(64, 1.1, "sine", 0.06, 36), 180);
    },
    win() {
      const chord = [261.63, 329.63, 392.0, 523.25];
      chord.forEach((f, i) => {
        setTimeout(() => {
          this._env(f, 1.35, "sine", 0.045);
          this._env(f * 2.005, 1.1, "sine", 0.012);
        }, i * 90);
      });
    },
    heat() {
      this._env(240, 0.35, "sine", 0.03, 420);
    },
  };

  /* ---------------- Sky canvas ---------------- */
  const Sky = {
    c: null,
    ctx: null,
    w: 0,
    h: 0,
    motes: [],
    pollen: [],
    ripples: [],
    t: 0,
    still: false,
    warm: false,
    grain: null,
    raf: 0,

    init() {
      this.c = $("sky");
      this.ctx = this.c.getContext("2d");
      this.resize();
      window.addEventListener("resize", () => this.resize());
      for (let i = 0; i < 42; i++) this.motes.push(this._mote());
      this._grain();
      this.loop();
    },
    _mote() {
      return {
        x: Math.random(),
        y: Math.random(),
        r: 0.4 + Math.random() * 1.4,
        s: 0.04 + Math.random() * 0.12,
        a: 0.08 + Math.random() * 0.18,
        p: Math.random() * Math.PI * 2,
      };
    },
    _grain() {
      const g = document.createElement("canvas");
      g.width = 128;
      g.height = 128;
      const x = g.getContext("2d");
      const img = x.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() * 255) | 0;
        img.data[i] = n;
        img.data[i + 1] = n;
        img.data[i + 2] = n;
        img.data[i + 3] = 22 + ((Math.random() * 18) | 0);
      }
      x.putImageData(img, 0, 0);
      this.grain = g;
    },
    resize() {
      this.w = this.c.width = window.innerWidth * devicePixelRatio;
      this.h = this.c.height = window.innerHeight * devicePixelRatio;
      this.c.style.width = window.innerWidth + "px";
      this.c.style.height = window.innerHeight + "px";
    },
    burstPollen(nx, ny, n) {
      if (reduceMotion) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.4 + Math.random() * 1.6;
        this.pollen.push({
          x: nx,
          y: ny,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 0.3,
          life: 1,
          r: 0.8 + Math.random(),
        });
      }
    },
    ripple(nx, ny) {
      this.ripples.push({ x: nx, y: ny, r: 8, a: 0.45 });
    },
    loop() {
      const draw = (ts) => {
        this.t = ts * 0.001;
        this.paint();
        this.raf = requestAnimationFrame(draw);
      };
      this.raf = requestAnimationFrame(draw);
    },
    paint() {
      const { ctx, w, h, t } = this;
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#070814");
      g.addColorStop(0.45, "#0a0c18");
      g.addColorStop(1, "#08060f");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const mx = w * 0.78;
      const my = h * 0.16;
      const mr = Math.min(w, h) * 0.26;
      const moon = ctx.createRadialGradient(mx - mr * 0.18, my - mr * 0.2, mr * 0.08, mx, my, mr);
      if (this.warm) {
        moon.addColorStop(0, "rgba(255, 228, 186, 0.62)");
        moon.addColorStop(0.35, "rgba(236, 196, 140, 0.18)");
        moon.addColorStop(1, "rgba(200, 140, 80, 0)");
      } else {
        moon.addColorStop(0, "rgba(226, 228, 232, 0.48)");
        moon.addColorStop(0.4, "rgba(170, 180, 210, 0.12)");
        moon.addColorStop(1, "rgba(100, 110, 170, 0)");
      }
      ctx.fillStyle = moon;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = this.warm ? "rgba(255, 236, 210, 0.88)" : "rgba(232, 234, 236, 0.78)";
      ctx.beginPath();
      ctx.arc(mx, my, mr * 0.22, 0, Math.PI * 2);
      ctx.fill();

      if (!reduceMotion) {
        for (let i = 0; i < 3; i++) {
          const fx = ((t * (4 + i) + i * 80) % (w + 200)) - 100;
          const fy = h * (0.35 + i * 0.18);
          const fg = ctx.createRadialGradient(fx, fy, 10, fx, fy, w * 0.28);
          fg.addColorStop(0, "rgba(90, 100, 150, 0.05)");
          fg.addColorStop(1, "rgba(90, 100, 150, 0)");
          ctx.fillStyle = fg;
          ctx.fillRect(0, fy - h * 0.2, w, h * 0.4);
        }
      }

      const drift = this.still || reduceMotion ? 0 : 1;
      ctx.save();
      for (const m of this.motes) {
        const x = (m.x + (drift ? Math.sin(t * m.s + m.p) * 0.02 : 0)) * w;
        const y = ((m.y + (drift ? t * m.s * 0.015 : 0)) % 1) * h;
        ctx.globalAlpha = this.still ? m.a * 0.35 : m.a;
        ctx.fillStyle = this.warm ? "#f0e0c0" : "#dce4f0";
        ctx.beginPath();
        ctx.arc(x, y, m.r * devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (!reduceMotion) {
        for (let i = this.pollen.length - 1; i >= 0; i--) {
          const p = this.pollen[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy -= 0.01;
          p.life -= 0.016;
          if (p.life <= 0) {
            this.pollen.splice(i, 1);
            continue;
          }
          ctx.globalAlpha = p.life * 0.7;
          ctx.fillStyle = "#f2e2a8";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * devicePixelRatio, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        for (let i = this.ripples.length - 1; i >= 0; i--) {
          const r = this.ripples[i];
          r.r += 7 * devicePixelRatio;
          r.a *= 0.94;
          if (r.a < 0.02) {
            this.ripples.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = "rgba(232, 214, 164," + r.a + ")";
          ctx.lineWidth = 1.2 * devicePixelRatio;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 0.09;
      ctx.fillStyle = ctx.createPattern(this.grain, "repeat");
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.fillRect(0, 0, this.c.width, this.c.height);
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  };

  /* ---------------- Game ---------------- */
  const G = {
    spec: { id: "grove", label: "Grove", w: 16, h: 16, mines: 40, heat: 2 },
    zen: false,
    migration: false,
    daily: false,
    dateStr: L.utcDateString(),
    custom: { w: 16, h: 16, mines: 40 },
    board: null,
    tiles: [],
    status: "idle",
    focus: { r: 0, c: 0 },
    startedAt: 0,
    elapsed: 0,
    timer: null,
    heatLeft: 2,
    heatMax: 2,
    touchFlag: false,
    bv: 0,
    rng: null,
    seed: (Math.random() * 0xffffffff) >>> 0,
    struck: null,
    buttons: 0,
    longPress: null,
    migrating: false,
    lastBest: false,
    busy: false,
    mineSnap: null,
    snapBv: 0,
  };

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }

  function newRng() {
    if (G.daily) {
      G.dateStr = L.utcDateString();
      G.seed = L.dailySeed(G.dateStr);
    } else {
      G.seed = (Math.random() * 0xffffffff) >>> 0;
    }
    G.rng = L.mulberry32(G.seed);
  }

  function currentSpec() {
    if (G.daily) {
      const d = L.DIFFICULTIES.grove;
      return { ...d, id: "daily", label: "Daily", heat: 1 };
    }
    if (G.spec.id === "custom") {
      const c = L.clampCustom(G.custom.w, G.custom.h, G.custom.mines);
      return { id: "custom", label: "Custom", w: c.w, h: c.h, mines: c.mines, heat: c.heat };
    }
    return G.spec;
  }

  function newGarden(keepSeed) {
    hideVeil();
    if (!keepSeed) newRng();
    else G.rng = L.mulberry32(G.seed);
    const spec = currentSpec();
    G.board = L.createEmpty(spec.w, spec.h);
    G.board.mineCount = spec.mines;
    G.status = "idle";
    G.struck = null;
    G.elapsed = 0;
    G.startedAt = 0;
    G.bv = 0;
    G.lastBest = false;
    G.heatMax = spec.heat;
    G.heatLeft = spec.heat;
    G.migrating = false;
    G.busy = false;
    G.focus = { r: 0, c: 0 };
    Sky.still = false;
    Sky.warm = false;
    document.body.classList.remove("still", "won");
    stopTimer();
    if (keepSeed && G.mineSnap && G.mineSnap.length) {
      const spec = currentSpec();
      G.board = L.createEmpty(spec.w, spec.h);
      G.board.mineCount = spec.mines;
      for (const k of G.mineSnap) G.board.mines.add(k);
      G.board.placed = true;
      L.recount(G.board);
      G.bv = G.snapBv || L.compute3BV(G.board);
    } else {
      G.mineSnap = null;
      G.snapBv = 0;
    }
    buildBoard();
    fitBoard();
    paintHUD();
    $("date-chip").textContent = G.daily ? G.dateStr : "";
  }

  function buildBoard() {
    const el = $("board");
    const b = G.board;
    el.style.setProperty("--cols", b.w);
    el.style.setProperty("--rows", b.h);
    el.innerHTML = "";
    G.tiles = [];
    const frag = document.createDocumentFragment();
    for (let r = 0; r < b.h; r++) {
      G.tiles[r] = [];
      for (let c = 0; c < b.w; c++) {
        const t = document.createElement("button");
        t.type = "button";
        t.className = "tile";
        t.dataset.r = String(r);
        t.dataset.c = String(c);
        t.setAttribute("aria-label", "Hidden cell");
        t.addEventListener("pointerdown", onTileDown);
        t.addEventListener("pointerup", onTileUp);
        t.addEventListener("pointerleave", onTileLeave);
        t.addEventListener("contextmenu", onTileContext);
        t.addEventListener("auxclick", onTileAux);
        t.addEventListener("click", onTileClick);
        frag.appendChild(t);
        G.tiles[r][c] = t;
      }
    }
    el.appendChild(frag);
    setFocus(0, 0, false);
  }

  function fitBoard() {
    const stage = $("stage");
    const b = G.board;
    if (!b) return;
    const rect = stage.getBoundingClientRect();
    const gap = b.w >= 24 ? 2 : b.w >= 16 ? 3 : 4;
    const pad = 20;
    const cw = Math.floor((rect.width - pad - gap * (b.w - 1)) / b.w);
    const ch = Math.floor((rect.height - pad - gap * (b.h - 1)) / b.h);
    const cell = Math.max(14, Math.min(46, cw, ch));
    const board = $("board");
    board.style.setProperty("--cell", cell + "px");
    board.style.setProperty("--gap", gap + "px");
  }

  function paintHUD() {
    const spec = currentSpec();
    $("mine-count").textContent = String(G.board ? L.remaining(G.board) : spec.mines);
    $("clock").textContent = G.zen ? "zen" : fmtTime(G.elapsed);
    $("diff-label").textContent = G.daily ? "Daily" : spec.label;
    $("btn-heat").disabled = G.heatLeft <= 0 || !G.board.placed || G.status === "won" || G.status === "lost" || G.status === "ghost";
    const dots = $("heat-dots");
    dots.innerHTML = "";
    for (let i = 0; i < G.heatMax; i++) {
      const d = document.createElement("i");
      if (i < G.heatLeft) d.className = "full";
      dots.appendChild(d);
    }
    $("btn-flagmode").setAttribute("aria-pressed", G.touchFlag ? "true" : "false");
    $("btn-flagmode").textContent = G.touchFlag ? "Flag" : "Reveal";
    $("btn-mute").setAttribute("aria-pressed", AudioGarden.muted ? "true" : "false");
    $("btn-mute").textContent = AudioGarden.muted ? "Sound" : "Mute";
    $("date-chip").textContent = G.daily ? G.dateStr : "";
  }

  function tileEl(r, c) {
    return G.tiles[r] && G.tiles[r][c];
  }

  function setFocus(r, c, scroll) {
    const b = G.board;
    r = L.clamp(r, 0, b.h - 1);
    c = L.clamp(c, 0, b.w - 1);
    const prev = tileEl(G.focus.r, G.focus.c);
    if (prev) prev.classList.remove("focus");
    G.focus = { r, c };
    const t = tileEl(r, c);
    if (t) {
      t.classList.add("focus");
      if (scroll) t.focus({ preventScroll: true });
    }
  }

  function startTimer() {
    if (G.zen || G.timer) return;
    G.startedAt = performance.now() - G.elapsed;
    G.timer = setInterval(() => {
      G.elapsed = performance.now() - G.startedAt;
      $("clock").textContent = fmtTime(G.elapsed);
    }, 250);
  }
  function stopTimer() {
    if (G.timer) {
      clearInterval(G.timer);
      G.timer = null;
    }
  }

  function ensurePlaced(r, c) {
    if (G.board.placed) return;
    const spec = currentSpec();
    L.placeMines(G.board, spec.mines, r, c, G.rng);
    G.bv = L.compute3BV(G.board);
    G.mineSnap = [...G.board.mines];
    G.snapBv = G.bv;
  }

  function paintCell(r, c, opts) {
    const t = tileEl(r, c);
    if (!t) return;
    const b = G.board;
    const k = L.key(r, c);
    t.className = "tile";
    if (G.focus.r === r && G.focus.c === c) t.classList.add("focus");
    t.innerHTML = "";
    if (b.revealed.has(k)) {
      t.classList.add("revealed");
      if (b.mines.has(k)) {
        t.classList.add("lost-mine");
        t.innerHTML = POD_SVG + '<span class="flash"></span>';
        if (G.struck && G.struck.r === r && G.struck.c === c) t.classList.add("struck");
        t.setAttribute("aria-label", "Night seed");
        return;
      }
      const n = b.numbers[L.idx(b, r, c)];
      if (n > 0) {
        t.classList.add("n" + n);
        t.innerHTML = '<span class="glyph">' + n + "</span>";
        t.setAttribute("aria-label", n + " adjacent");
      } else {
        t.classList.add("n0");
        t.setAttribute("aria-label", "Empty");
      }
    } else if (G.status === "ghost" && b.mines.has(k)) {
      t.classList.add("ghost-root");
      t.innerHTML = ROOT_SVG;
      t.setAttribute("aria-label", "Root");
    } else if (G.status === "won" && b.mines.has(k)) {
      t.classList.add("blooming", "revealed");
      t.innerHTML = BLOOM_SVG;
      t.setAttribute("aria-label", "Bloom");
    } else if (b.flags.has(k)) {
      t.classList.add("flagged");
      t.innerHTML = PIN_SVG;
      t.setAttribute("aria-label", "Pinned");
    } else {
      t.setAttribute("aria-label", "Hidden cell");
    }
  }

  function paintAll() {
    const b = G.board;
    for (let r = 0; r < b.h; r++) for (let c = 0; c < b.w; c++) paintCell(r, c);
  }

  function warmth() {
    const b = G.board;
    const safe = b.w * b.h - b.mineCount;
    AudioGarden.setWarmth(safe ? b.revealed.size / safe : 0);
  }

  function groupByRing(cells) {
    const max = cells.reduce((m, x) => Math.max(m, x.dist || 0), 0);
    const rings = [];
    for (let i = 0; i <= max; i++) rings[i] = [];
    for (const c of cells) rings[c.dist || 0].push(c);
    return rings;
  }

  function cellCenter(r, c) {
    const t = tileEl(r, c);
    if (!t) return { x: 0, y: 0 };
    const rect = t.getBoundingClientRect();
    return {
      x: (rect.left + rect.width / 2) * devicePixelRatio,
      y: (rect.top + rect.height / 2) * devicePixelRatio,
    };
  }

  async function animateReveal(cells, pollen) {
    if (!cells.length) return;
    const rings = groupByRing(cells);
    const delay = reduceMotion ? 0 : rings.length > 2 ? 12 : 16;
    for (let i = 0; i < rings.length; i++) {
      for (const cell of rings[i]) {
        if (cell.mine) continue;
        G.board.revealed.add(L.key(cell.r, cell.c));
        paintCell(cell.r, cell.c);
      }
      if (pollen && rings[i].length && !reduceMotion) {
        const mid = rings[i][rings[i].length >> 1];
        const p = cellCenter(mid.r, mid.c);
        Sky.burstPollen(p.x, p.y, Math.min(10, 3 + rings[i].length / 4));
      }
      if (delay && i < rings.length - 1) await wait(delay);
    }
  }

  function wait(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function doReveal(r, c) {
    if (G.status === "won" || G.status === "lost") return;
    if (G.migrating || G.busy) return;
    const b = G.board;
    const k = L.key(r, c);
    if (G.status === "ghost") {
      if (b.mines.has(k) || b.flags.has(k)) return;
      const res = L.revealCell(b, r, c);
      for (const cell of res.cells) paintCell(cell.r, cell.c);
      paintHUD();
      return;
    }
    if (b.flags.has(k) || b.revealed.has(k)) return;

    ensurePlaced(r, c);
    if (G.status === "idle") {
      G.status = "playing";
      startTimer();
    }

    const res = L.revealCell(b, r, c);
    if (!res.valid) return;

    G.busy = true;
    AudioGarden.tick();
    if (res.hitMine) {
      G.struck = res.hitMine;
      await lose(res.hitMine);
      G.busy = false;
      return;
    }

    const cascade = res.cells.length > 2;
    if (cascade) AudioGarden.cascade(groupByRing(res.cells).length);
    await animateReveal(res.cells, cascade);
    warmth();
    paintHUD();

    if (res.won) {
      await win();
      G.busy = false;
      return;
    }
    if (G.migration && !G.daily) await runMigration();
    G.busy = false;
  }

  async function doChord(r, c) {
    if (G.status === "won" || G.status === "lost" || G.status === "ghost") return;
    if (G.migrating || G.busy) return;
    const b = G.board;
    if (!b.placed || !b.revealed.has(L.key(r, c))) return;
    const res = L.chord(b, r, c);
    if (!res.valid) return;
    G.busy = true;
    AudioGarden.tick();
    if (res.hitMine) {
      G.struck = res.hitMine;
      for (const cell of res.cells) paintCell(cell.r, cell.c);
      await lose(res.hitMine);
      G.busy = false;
      return;
    }
    const cascade = res.cells.length > 2;
    if (cascade) AudioGarden.cascade(groupByRing(res.cells).length);
    await animateReveal(res.cells, cascade);
    warmth();
    paintHUD();
    if (res.won) {
      await win();
      G.busy = false;
      return;
    }
    if (G.migration && !G.daily) await runMigration();
    G.busy = false;
  }

  function doFlag(r, c) {
    if (G.status === "won" || G.status === "lost") return;
    const b = G.board;
    const res = L.toggleFlag(b, r, c);
    if (!res.changed) return;
    if (res.flagged) AudioGarden.pin();
    else AudioGarden.unpin();
    paintCell(r, c);
    paintHUD();
  }

  async function runMigration() {
    const moves = L.migrateMines(G.board, G.rng);
    if (!moves.length) return;
    G.migrating = true;
    if (!reduceMotion) {
      for (const mv of moves) {
        const a = tileEl(mv.from.r, mv.from.c);
        const b = tileEl(mv.to.r, mv.to.c);
        if (a) a.style.transition = "box-shadow 0.3s";
        if (b) b.style.boxShadow = "inset 0 0 10px rgba(140, 90, 120, 0.35)";
      }
      await wait(300);
      for (const mv of moves) {
        const a = tileEl(mv.from.r, mv.from.c);
        const b = tileEl(mv.to.r, mv.to.c);
        if (a) a.style.boxShadow = "";
        if (b) b.style.boxShadow = "";
      }
    }
    paintAll();
    G.migrating = false;
  }

  async function lose(hit) {
    G.status = "lost";
    stopTimer();
    Sky.still = true;
    document.body.classList.add("still");
    AudioGarden.lose();
    paintCell(hit.r, hit.c);
    await wait(reduceMotion ? 0 : 520);
    const b = G.board;
    for (const k of b.mines) {
      const p = L.parseKey(k);
      if (p.r === hit.r && p.c === hit.c) continue;
      if (b.flags.has(k)) continue;
      b.revealed.add(k);
      paintCell(p.r, p.c);
    }
    for (const fk of [...b.flags]) {
      if (!b.mines.has(fk)) {
        const p = L.parseKey(fk);
        const t = tileEl(p.r, p.c);
        if (t) t.style.opacity = "0.45";
      }
    }
    await wait(reduceMotion ? 80 : 420);
    showResults(false);
  }

  async function win() {
    G.status = "won";
    stopTimer();
    Sky.warm = true;
    document.body.classList.add("won");
    AudioGarden.win();
    const b = G.board;
    const mines = [...b.mines].map(L.parseKey);
    for (let i = 0; i < mines.length; i++) {
      const p = mines[i];
      paintCell(p.r, p.c);
      if (!reduceMotion && i % 4 === 0) {
        const c = cellCenter(p.r, p.c);
        Sky.burstPollen(c.x, c.y, 6);
        await wait(18);
      }
    }
    recordBest();
    await wait(reduceMotion ? 80 : 280);
    showResults(true);
  }

  function vanillaTimed() {
    return !G.zen && !G.daily && !G.migration && (G.spec.id === "seedling" || G.spec.id === "grove" || G.spec.id === "wildwood");
  }

  function recordBest() {
    G.lastBest = false;
    if (!vanillaTimed()) {
      if (G.daily && !G.zen) {
        try {
          const map = JSON.parse(localStorage.getItem(STORE_DAILY) || "{}");
          const prev = map[G.dateStr];
          const sec = G.elapsed / 1000;
          if (!prev || sec < prev) {
            map[G.dateStr] = sec;
            localStorage.setItem(STORE_DAILY, JSON.stringify(map));
            G.lastBest = !prev || sec < prev;
          }
        } catch (e) {}
      }
      return;
    }
    const best = loadBest();
    const sec = G.elapsed / 1000;
    const prev = best[G.spec.id];
    if (prev == null || sec < prev) {
      best[G.spec.id] = sec;
      saveBest(best);
      G.lastBest = true;
    }
  }

  function showResults(won) {
    const card = $("results-card");
    $("help-card").hidden = true;
    $("new-card").hidden = true;
    card.hidden = false;
    $("results-title").textContent = won ? "The garden woke" : "The garden stills";
    $("results-lede").textContent = won
      ? "Every safe bed opened. Night-blooming buds unfurled in the dark."
      : "A seed split underfoot. The motes hang still.";
    $("res-time").textContent = G.zen ? "—" : fmtTime(G.elapsed);
    $("res-bv").textContent = G.bv ? String(G.bv) : "—";
    $("res-diff").textContent = currentSpec().label + (G.daily ? " · " + G.dateStr : "");
    const note = $("best-note");
    if (won && G.lastBest) {
      note.hidden = false;
      note.textContent = G.daily ? "Quietest walk of the day." : "A personal best for this garden.";
    } else if (won && vanillaTimed()) {
      const prev = loadBest()[G.spec.id];
      note.hidden = false;
      note.textContent = prev != null ? "Best " + currentSpec().label + " · " + prev.toFixed(1) + "s" : "";
      if (!prev) note.hidden = true;
    } else {
      note.hidden = true;
    }
    $("btn-ghost").hidden = won;
    $("veil").classList.add("open");
  }

  function showHelp() {
    $("results-card").hidden = true;
    $("new-card").hidden = true;
    $("help-card").hidden = false;
    $("veil").classList.add("open");
  }

  function showNew() {
    $("results-card").hidden = true;
    $("help-card").hidden = true;
    $("new-card").hidden = false;
    $("veil").classList.add("open");
    document.querySelectorAll(".diff-pick").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.diff === (G.daily ? "daily" : G.spec.id));
    });
    $("tog-zen").classList.toggle("on", G.zen);
    $("tog-mig").classList.toggle("on", G.migration);
    $("tog-mig").disabled = G.daily;
    $("custom-fields").hidden = G.spec.id !== "custom" || G.daily;
    $("in-w").value = G.custom.w;
    $("in-h").value = G.custom.h;
    $("in-m").value = G.custom.mines;
  }

  function hideVeil() {
    $("veil").classList.remove("open");
  }

  function heatPulse() {
    if (G.heatLeft <= 0 || !G.board.placed) return;
    if (G.status === "won" || G.status === "lost" || G.status === "ghost") return;
    G.heatLeft--;
    paintHUD();
    AudioGarden.heat();
    const b = G.board;
    const mid = tileEl(G.focus.r, G.focus.c);
    if (mid) {
      const p = cellCenter(G.focus.r, G.focus.c);
      Sky.ripple(p.x, p.y);
    }
    for (let r = 0; r < b.h; r++) {
      for (let c = 0; c < b.w; c++) {
        const v = L.heatValue(b, r, c);
        if (v <= 0) continue;
        const t = tileEl(r, c);
        const cls = "heat-" + Math.min(8, v);
        t.classList.add(cls);
      }
    }
    setTimeout(() => {
      for (let r = 0; r < b.h; r++) for (let c = 0; c < b.w; c++) {
        const t = tileEl(r, c);
        t.className = t.className.replace(/heat-\d+/g, "").trim();
      }
      paintAll();
    }, reduceMotion ? 500 : 1100);
  }

  function enterGhost() {
    hideVeil();
    G.status = "ghost";
    Sky.still = true;
    const b = G.board;
    for (const k of b.mines) {
      if (!b.revealed.has(k)) {
        const p = L.parseKey(k);
        paintCell(p.r, p.c);
      }
    }
  }

  /* ---------------- Pointer ---------------- */
  function rcFromEvent(e) {
    const t = e.currentTarget;
    return { r: +t.dataset.r, c: +t.dataset.c };
  }

  function onTileDown(e) {
    AudioGarden.unlock();
    if (e.button === 1) e.preventDefault();
    const { r, c } = rcFromEvent(e);
    setFocus(r, c, false);
    G.buttons |= 1 << e.button;
    if (e.button === 0 && e.pointerType === "touch") {
      clearTimeout(G.longPress);
      G.longPress = setTimeout(() => {
        G.longPress = "fired";
        doFlag(r, c);
      }, 480);
    }
    if ((G.buttons & 3) === 3) {
      e.preventDefault();
      doChord(r, c);
    }
  }
  function onTileUp(e) {
    G.buttons &= ~(1 << e.button);
    if (G.longPress && G.longPress !== "fired") clearTimeout(G.longPress);
  }
  function onTileLeave() {
    if (G.longPress && G.longPress !== "fired") clearTimeout(G.longPress);
  }
  function onTileContext(e) {
    e.preventDefault();
    AudioGarden.unlock();
    const { r, c } = rcFromEvent(e);
    doFlag(r, c);
  }
  function onTileAux(e) {
    if (e.button === 1) {
      e.preventDefault();
      const { r, c } = rcFromEvent(e);
      doChord(r, c);
    }
  }
  function onTileClick(e) {
    if (G.longPress === "fired") {
      G.longPress = null;
      return;
    }
    G.longPress = null;
    const { r, c } = rcFromEvent(e);
    const b = G.board;
    if (b.revealed.has(L.key(r, c))) {
      doChord(r, c);
      return;
    }
    if (G.touchFlag) doFlag(r, c);
    else doReveal(r, c);
  }

  /* ---------------- Keyboard ---------------- */
  function onKey(e) {
    const veil = $("veil").classList.contains("open");
    if (e.key === "Escape") {
      if (veil) hideVeil();
      return;
    }
    if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
      e.preventDefault();
      showHelp();
      return;
    }
    if (veil) return;
    const { r, c } = G.focus;
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      e.preventDefault();
      setFocus(r - 1, c, true);
    } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
      e.preventDefault();
      setFocus(r + 1, c, true);
    } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      e.preventDefault();
      setFocus(r, c - 1, true);
    } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      e.preventDefault();
      setFocus(r, c + 1, true);
    } else if (e.key === "f" || e.key === "F") {
      doFlag(r, c);
    } else if (e.key === "h" || e.key === "H") {
      heatPulse();
    } else if (e.key === "q" || e.key === "Q" || ((e.key === " " || e.key === "Enter") && e.shiftKey)) {
      e.preventDefault();
      doChord(r, c);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const k = L.key(r, c);
      if (G.board.revealed.has(k)) doChord(r, c);
      else doReveal(r, c);
    } else if (e.key === "n" || e.key === "N") {
      showNew();
    }
  }

  /* ---------------- Bind HUD ---------------- */
  function bind() {
    $("btn-new").addEventListener("click", () => {
      AudioGarden.unlock();
      showNew();
    });
    $("diff-label").addEventListener("click", () => {
      AudioGarden.unlock();
      showNew();
    });
    $("btn-help").addEventListener("click", () => {
      AudioGarden.unlock();
      showHelp();
    });
    $("btn-mute").addEventListener("click", () => {
      AudioGarden.unlock();
      AudioGarden.setMuted(!AudioGarden.muted);
    });
    $("btn-heat").addEventListener("click", () => {
      AudioGarden.unlock();
      heatPulse();
    });
    $("btn-flagmode").addEventListener("click", () => {
      G.touchFlag = !G.touchFlag;
      paintHUD();
    });
    $("btn-ghost").addEventListener("click", enterGhost);
    $("btn-replay").addEventListener("click", () => newGarden(true));
    $("btn-again").addEventListener("click", () => newGarden(false));
    $("btn-close-help").addEventListener("click", hideVeil);
    $("veil").addEventListener("click", (e) => {
      if (e.target.id === "veil") hideVeil();
    });

    document.querySelectorAll(".diff-pick").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.diff;
        G.daily = id === "daily";
        if (id === "daily") {
          G.spec = L.DIFFICULTIES.grove;
          G.migration = false;
        } else if (id === "custom") {
          G.spec = { id: "custom", label: "Custom", w: G.custom.w, h: G.custom.h, mines: G.custom.mines, heat: 2 };
        } else {
          G.spec = L.DIFFICULTIES[id];
        }
        document.querySelectorAll(".diff-pick").forEach((b) => b.classList.toggle("active", b === btn));
        $("tog-mig").disabled = G.daily;
        $("custom-fields").hidden = id !== "custom";
      });
    });
    $("tog-zen").addEventListener("click", () => {
      G.zen = !G.zen;
      $("tog-zen").classList.toggle("on", G.zen);
    });
    $("tog-mig").addEventListener("click", () => {
      if (G.daily) return;
      G.migration = !G.migration;
      $("tog-mig").classList.toggle("on", G.migration);
    });
    $("btn-plant").addEventListener("click", () => {
      G.custom.w = +$("in-w").value;
      G.custom.h = +$("in-h").value;
      G.custom.mines = +$("in-m").value;
      if (G.spec.id === "custom") {
        const c = L.clampCustom(G.custom.w, G.custom.h, G.custom.mines);
        G.custom = { w: c.w, h: c.h, mines: c.mines };
        G.spec = { id: "custom", label: "Custom", ...c };
      }
      newGarden(false);
    });

    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", fitBoard);
    window.addEventListener("blur", () => (G.buttons = 0));

    AudioGarden.setMuted(AudioGarden.muted);
  }

  function boot() {
    Sky.init();
    bind();
    newGarden(false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
