/* LUMEN input: keyboard, touch gestures (cell-snapped drag, tap rotate, flick drop, swipe-up hold) and on-screen buttons. */
export class Input {
  constructor(app) {
    this.app = app; this.ptrs = new Map(); this.multi = null; this.keys = new Set();
    window.addEventListener('keydown', e => this.keyDown(e));
    window.addEventListener('keyup', e => this.keyUp(e));
    window.addEventListener('blur', () => this.releaseAll());
  }
  get game() { const a = this.app; return a.screen === 'game' && a.running && a.game && !a.game.over ? a.game : null; }
  releaseAll() { const g = this.app.game; if (g) { g.held.left = g.held.right = false; g.dasDir = 0; g.setSoft(false); } this.keys.clear(); this.ptrs.clear(); this.multi = null; }

  // ---------------- keyboard ----------------
  keyDown(e) {
    const a = this.app; const k = e.code || e.key;
    if (a.screen !== 'game') { a.menuKey(e); return; }
    const game = this.game;
    const handled = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyZ', 'KeyX', 'KeyA', 'KeyC', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'Escape', 'KeyP', 'KeyR'];
    if (handled.includes(k)) e.preventDefault();
    if (k === 'Escape' || k === 'KeyP') { if (!e.repeat) a.togglePause(); return; }
    if (k === 'KeyR' && !e.repeat) { a.restart(); return; }
    if (!game || e.repeat) return;
    a.sound.unlock();
    switch (k) {
      case 'ArrowLeft': game.pressDir(-1); break;
      case 'ArrowRight': game.pressDir(1); break;
      case 'ArrowDown': game.setSoft(true); break;
      case 'ArrowUp': case 'KeyX': game.rotate(1); break;
      case 'KeyZ': case 'ControlLeft': game.rotate(-1); break;
      case 'KeyA': game.rotate(2); break;
      case 'KeyC': case 'ShiftLeft': case 'ShiftRight': game.holdPiece(); break;
      case 'Space': game.hardDrop(); break;
    }
  }
  keyUp(e) {
    const g = this.app.game; if (!g) return; const k = e.code || e.key;
    if (k === 'ArrowLeft') g.releaseDir(-1);
    else if (k === 'ArrowRight') g.releaseDir(1);
    else if (k === 'ArrowDown') g.setSoft(false);
  }

  // ---------------- gestures ----------------
  attachSurface(el) {
    const opt = { passive: false };
    el.addEventListener('pointerdown', e => this.down(e), opt);
    el.addEventListener('pointermove', e => this.move(e), opt);
    el.addEventListener('pointerup', e => this.up(e), opt);
    el.addEventListener('pointercancel', e => { this.ptrs.delete(e.pointerId); if (!this.ptrs.size) this.multi = null; }, opt);
    // iOS: stop the page from scrolling / zooming under the game
    el.addEventListener('touchstart', e => e.preventDefault(), opt);
    el.addEventListener('touchmove', e => e.preventDefault(), opt);
    el.addEventListener('gesturestart', e => e.preventDefault(), opt);
  }
  pieceKey(g) { return g.pieces * 1000 + g.st.holds; }
  step() { const L = this.app.L; const s = this.app.settings.sensitivity || 1; return Math.max(10, L.cell * 0.92) / s; }
  down(e) {
    e.preventDefault();
    const a = this.app; a.sound.unlock();
    if (a.settings.controls === 'buttons') return;
    const g = this.game; if (!g) return;
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const now = performance.now();
    const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, x: e.clientX, y: e.clientY, t0: now, moved: 0, soft: 0, mode: null, key: this.pieceKey(g), samples: [[now, e.clientX, e.clientY]], maxD: 0 };
    this.ptrs.set(e.pointerId, p);
    if (this.ptrs.size >= 2) {
      // two fingers: a two-finger tap rotates counter-clockwise
      if (!this.multi) this.multi = { t0: now, maxD: 0 };
      for (const q of this.ptrs.values()) q.mode = 'multi';
    }
  }
  move(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return; e.preventDefault();
    const g = this.game; const now = performance.now();
    p.x = e.clientX; p.y = e.clientY; p.samples.push([now, p.x, p.y]); while (p.samples.length > 2 && now - p.samples[0][0] > 120) p.samples.shift();
    p.maxD = Math.max(p.maxD, Math.hypot(p.x - p.x0, p.y - p.y0));
    if (p.mode === 'multi') { if (this.multi) this.multi.maxD = Math.max(this.multi.maxD, p.maxD); return; }
    if (!g || p.mode === 'done') return;
    // a new piece arrived (lock / hold) mid-drag: re-anchor so the finger keeps relative control
    const key = this.pieceKey(g);
    if (key !== p.key) { p.key = key; p.ax = p.x; p.ay = p.y; p.moved = 0; p.soft = 0; if (p.mode === 'v') p.mode = 'v'; }
    const dx = p.x - p.ax, dy = p.y - p.ay, S = this.step();
    const v = this.velocity(p);
    if (!p.mode) {
      if (Math.abs(dx) > 12 && Math.abs(dx) >= Math.abs(dy)) p.mode = 'h';
      else if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) p.mode = 'v';
    }
    // flicks work from either mode
    if (dy > 26 && v.vy > 1.0 && Math.abs(v.vy) > Math.abs(v.vx) * 1.6) { g.hardDrop(); p.mode = 'done'; return; }
    // swipe up = hold: a fast flick, or any deliberate upward drag of ~1.5 cells that isn't a sideways drag
    const upFar = p.mode !== 'h' && dy < -Math.max(40, S * 1.5) && Math.abs(dy) > Math.abs(dx) * 1.5;
    if ((dy < -34 && v.vy < -0.7 && Math.abs(v.vy) > Math.abs(v.vx) * 1.4) || upFar) { g.holdPiece(); p.mode = 'done'; return; }
    if (p.mode === 'h') {
      const target = Math.trunc(dx / S);
      const delta = target - p.moved;
      if (delta) { g.shiftBy(Math.sign(delta), Math.abs(delta)); p.moved = target; }
    } else if (p.mode === 'v' && dy > 0) {
      const target = Math.floor(dy / (S * 0.85));
      const delta = target - p.soft;
      if (delta > 0) { g.softDropRows(delta); p.soft = target; }
    }
  }
  velocity(p) {
    const s = p.samples; if (s.length < 2) return { vx: 0, vy: 0 };
    const a = s[0], b = s[s.length - 1]; const dt = Math.max(8, b[0] - a[0]);
    return { vx: (b[1] - a[1]) / dt, vy: (b[2] - a[2]) / dt };
  }
  up(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return; e.preventDefault();
    this.ptrs.delete(e.pointerId);
    const g = this.game; const now = performance.now();
    if (p.mode === 'multi') {
      if (!this.ptrs.size && this.multi) {
        const m = this.multi; this.multi = null;
        if (g && now - m.t0 < 350 && m.maxD < 24) g.rotate(-1);
      }
      return;
    }
    if (!g) return;
    if (!p.mode && now - p.t0 < 320 && p.maxD < 14) {
      const mode = this.app.settings.tapMode;
      const dir = mode === 'sides' ? (p.x < window.innerWidth / 2 ? -1 : 1) : 1;
      g.rotate(dir);
      return;
    }
    if (p.mode !== 'done') {
      const v = this.velocity(p), dy = p.y - p.ay;
      if (dy > 26 && v.vy > 0.8 && Math.abs(v.vy) > Math.abs(v.vx) * 1.6) g.hardDrop();
      else if (dy < -34 && v.vy < -0.5 && p.mode !== 'h') g.holdPiece();
    }
  }

  // ---------------- on-screen buttons ----------------
  attachButtons(root) {
    const act = (name, on) => {
      const g = this.game; if (!g) return;
      switch (name) {
        case 'left': on ? g.pressDir(-1) : g.releaseDir(-1); break;
        case 'right': on ? g.pressDir(1) : g.releaseDir(1); break;
        case 'soft': g.setSoft(on); break;
        case 'hard': if (on) g.hardDrop(); break;
        case 'cw': if (on) g.rotate(1); break;
        case 'ccw': if (on) g.rotate(-1); break;
        case 'r180': if (on) g.rotate(2); break;
        case 'hold': if (on) g.holdPiece(); break;
      }
    };
    root.querySelectorAll('[data-act]').forEach(b => {
      const name = b.dataset.act; let held = new Set();
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.app.sound.unlock(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* */ } held.add(e.pointerId); b.classList.add('on'); act(name, true); });
      const end = e => { if (!held.has(e.pointerId)) return; held.delete(e.pointerId); if (!held.size) { b.classList.remove('on'); act(name, false); } };
      b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
      b.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    });
  }
}
