/* LUMEN: app shell. Screens, layout, HUD, game flow, stats/settings UI, offline updates. */
import { Game, HIDDEN, ROWS, COLS, localDateStr, dailySeed, TYPE_ID } from './js/rules.js';
import { WORLDS, worldIndexFor } from './js/worlds.js';
import { Background } from './js/bg.js';
import { Renderer } from './js/render.js';
import { Sound } from './js/audio.js';
import { Input } from './js/input.js';
import * as S from './js/stats.js';

export const VERSION = '2026.10.09-1';
const qs = new URLSearchParams(location.search);
const DEBUG = qs.has('debug');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtInt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function fmtTime(ms, cs = false) {
  const t = Math.max(0, ms); const m = Math.floor(t / 60000), s = Math.floor(t / 1000) % 60, c = Math.floor(t / 10) % 100;
  return m + ':' + String(s).padStart(2, '0') + (cs ? '.' + String(c).padStart(2, '0') : '');
}
function fmtLong(ms) { const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60; return h ? `${h}h ${m}m` : `${m}m ${Math.floor(ms / 1000) % 60}s`; }
function fmtDate(iso) { try { const d = new Date(iso); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch (e) { return ''; } }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const MODE_INFO = {
  marathon: { name: 'Marathon', desc: 'Endless. Level up every 10 lines.' },
  sprint: { name: 'Sprint 40', desc: 'Clear 40 lines as fast as you can.' },
  ultra: { name: 'Ultra', desc: 'Two minutes. Score attack.' },
  zen: { name: 'Zen', desc: 'No game over. Just light.' },
  daily: { name: 'Daily', desc: 'Same pieces for everyone today. Three minutes.' },
};
const MODE_ORDER = ['marathon', 'sprint', 'ultra', 'zen'];

class App {
  constructor() {
    this.settings = S.loadSettings();
    this.stats = S.loadStats();
    this.sound = new Sound();
    this.bg = new Background($('#bg'));
    this.fx = new Renderer($('#fx'));
    this.input = new Input(this);
    this.screen = 'title'; this.overlayStack = [];
    this.game = null; this.running = false; this.mode = 'marathon';
    this.world = 0; this.titleWorld = 0; this.titleT = 0;
    this.last = 0; this.shownScore = 0; this.hudCache = {};
    this.intensity = 0.2; this.liveToasted = new Set(); this.timers = [];
    this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.frameErrors = 0; this.statsTab = 'marathon';
  }

  // ---------------------------------------------------------------- boot
  async boot() {
    try { await Promise.race([document.fonts ? document.fonts.load('300 20px Outfit').then(() => document.fonts.load('italic 400 20px Cormorant')) : null, new Promise(r => setTimeout(r, 1200))]); } catch (e) { /* fonts are optional */ }
    this.applySettings(true);
    this.layout();
    window.addEventListener('resize', () => this.layoutSoon());
    window.addEventListener('orientationchange', () => this.layoutSoon());
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.layoutSoon());
    this.input.attachSurface($('#surface'));
    this.input.attachButtons($('#buttons'));
    this.bindUI();
    this.buildTitle();
    this.show('title');
    const unlock = () => { this.sound.unlock(); if (!this.sound.playing && this.sound.ctx) { this.sound.setVolumes(this.settings.music, this.settings.sfx); this.sound.startMusic(this.inGameWorld(), !this.game); } };
    ['pointerdown', 'touchend', 'keydown', 'click'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    requestAnimationFrame(t => { this.last = t; requestAnimationFrame(this.loop); });
    window.__lumenBooted = true;
    this.hideLoading();
    this.registerSW();
    if (DEBUG) this.exposeDebug();
  }
  hideLoading() {
    const l = $('#loading'); if (!l) return;
    l.classList.add('out'); setTimeout(() => { l.style.display = 'none'; }, 450);
  }
  inGameWorld() { return this.game ? this.world : this.titleWorld; }

  // ---------------------------------------------------------------- layout
  layoutSoon() { clearTimeout(this.layoutT); this.layoutT = setTimeout(() => this.layout(), 60); }
  safe() {
    if (!this.probe) { this.probe = document.createElement('div'); this.probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(this.probe); }
    const cs = getComputedStyle(this.probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  layout() {
    const w = window.innerWidth, h = window.innerHeight, sf = this.safe();
    const W = w - sf.l - sf.r, H = h - sf.t - sf.b;
    const buttons = this.settings.controls === 'buttons';
    const btnH = buttons ? clamp(H * 0.19, 132, 190) : 0;
    const bs = buttons ? clamp((btnH - 26) / 2.1, 48, 74) : 58;
    document.documentElement.style.setProperty('--bs', bs + 'px');
    const hudTop = 54;
    const cSide = Math.min((W - 28) / 18, (H - hudTop - btnH - 18) / 20.6);
    const cStrip = Math.min((W - 14) / 10.6, (H - 52 - btnH) / 23.1);
    const side = cSide >= cStrip * 0.88;
    const c = Math.max(10, Math.floor(Math.min(side ? cSide : cStrip, 46)));
    const bw = c * 10, bh = c * 20, pad = Math.round(c * 0.28);
    const L = { w, h, cell: c, bw, bh, side, safe: sf, btnH };
    if (side) {
      const m = Math.round(c * 0.62);
      L.bx = Math.round(sf.l + (W - bw) / 2);
      L.by = Math.round(sf.t + hudTop + Math.max(0, (H - hudTop - btnH - 18 - bh) / 2) + 6);
      const colW = Math.round(m * 4 + c * 0.8), gap = Math.round(c * 0.4);
      L.hold = { x: L.bx - pad - gap - colW, y: L.by - pad, w: colW, h: Math.round(c * 0.8 + m * 2 + c * 0.9), m, labelH: Math.round(c * 0.7), pad: Math.round(c * 0.3) };
      L.next = { x: L.bx + bw + pad + gap, y: L.by - pad, w: colW, h: Math.round(c * 0.8 + m * 12.2), m, labelH: Math.round(c * 0.7), pad: Math.round(c * 0.3), horizontal: false };
    } else {
      const m = Math.round(c * 0.5);
      L.bx = Math.round(sf.l + (W - bw) / 2);
      const stripY = Math.round(sf.t + 50);
      const stripH = Math.round(c * 2.15);
      L.by = Math.round(stripY + stripH + pad + c * 0.32);
      const extra = H - (L.by - sf.t) - bh - pad - btnH - 6;
      if (extra > 0) L.by += Math.round(extra * 0.35);
      const holdW = Math.round(m * 4 + c * 0.6);
      L.hold = { x: L.bx - pad, y: stripY + (L.by - pad - c * 0.32 - stripY - stripH), w: holdW, h: stripH, m, labelH: Math.round(c * 0.55), pad: Math.round(c * 0.25) };
      L.next = { x: L.hold.x + holdW + Math.round(c * 0.3), y: L.hold.y, w: (L.bx + bw + pad) - (L.hold.x + holdW + Math.round(c * 0.3)), h: stripH, m, labelH: Math.round(c * 0.55), pad: Math.round(c * 0.25), horizontal: true };
    }
    this.L = L;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.fx.resize(L, dpr);
    this.bg.resize(w, h);
    this.placeHud();
  }
  placeHud() {
    const L = this.L, c = L.cell, hud = $('#hud');
    hud.classList.toggle('strip', !L.side);
    const pos = (el, x, y, extra = '') => { el.style.cssText = `left:${Math.round(x)}px;top:${Math.round(y)}px;${extra}`; };
    const sf = L.safe;
    pos($('#btn-pause'), L.w - sf.r - 56, sf.t + 6);
    pos($('#lbl-hold'), L.hold.x + L.hold.pad, L.hold.y + L.hold.pad * 0.8);
    pos($('#lbl-next'), L.next.x + L.next.pad, L.next.y + L.next.pad * 0.8);
    const blocks = ['score', 'level', 'lines', 'time', 'pps'].map(k => $('#hud-' + k));
    if (L.side) {
      const x = L.hold.x + 4; let y = L.hold.y + L.hold.h + c * 0.9;
      const fs = clamp(c * 0.5, 15, 22), fsBig = clamp(c * 0.66, 20, 32);
      blocks.forEach((el, i) => { pos(el, x, y, `width:${L.hold.w}px`); el.querySelector('.val').style.fontSize = (i === 0 ? fsBig : fs) + 'px'; y += (i === 0 ? fsBig : fs) + 26; });
      blocks.forEach(el => { el.style.alignItems = 'flex-start'; });
      pos($('#hud-world'), L.bx + L.bw / 2, sf.t + 14, 'transform:translateX(-50%)');
      $('#hud-world').style.display = '';
      pos($('#hud-b2b'), L.next.x + 4, L.next.y + L.next.h + c * 0.6);
      $('#toasts').className = 'side';
    } else {
      const top = sf.t + 6, left = L.bx - Math.round(c * 0.28), right = L.bx + L.bw + Math.round(c * 0.28);
      const usableR = Math.min(right, L.w - sf.r - 64);
      pos(blocks[1], left, top); pos(blocks[2], left + 64, top);
      pos(blocks[0], (left + usableR) / 2 + 22, top, 'transform:translateX(-50%);align-items:center');
      pos(blocks[3], usableR - 2, top, 'transform:translateX(-100%);align-items:flex-end');
      blocks.forEach((el, i) => { el.querySelector('.val').style.fontSize = ''; if (i === 1 || i === 2) el.style.alignItems = 'flex-start'; });
      $('#hud-world').style.display = 'none';
      pos($('#hud-b2b'), L.next.x + L.next.w - L.next.pad, L.next.y + L.next.pad * 0.8, 'transform:translateX(-100%)');
      $('#toasts').className = '';
    }
    const pop = $('#popups'); pop.style.left = (L.bx + L.bw / 2) + 'px'; pop.style.top = (L.by + L.bh * 0.38) + 'px';
    pop.style.setProperty('--ps', clamp(c * 0.82, 18, 36) + 'px');
    const cd = $('#countdown'); cd.style.left = (L.bx + L.bw / 2) + 'px'; cd.style.top = (L.by + L.bh * 0.42) + 'px'; cd.style.fontSize = clamp(c * 1.6, 36, 72) + 'px';
    $('#buttons').classList.toggle('hidden', !(this.settings.controls === 'buttons' && this.game && this.screen === 'game'));
  }

  // ---------------------------------------------------------------- settings
  applySettings(first) {
    const s = this.settings;
    const reduced = s.effects === 'reduced';
    this.fx.setOptions({ reduced, reducedMotion: this.reducedMotion, shakeOn: s.shake && !this.reducedMotion, leanOn: s.lean, showGhost: s.ghost, showGrid: s.grid });
    this.bg.setQuality(reduced);
    this.sound.setVolumes(s.music, s.sfx);
    if (this.game) { this.game.das = s.das; this.game.arr = s.arr; this.game.sdf = s.sdf; }
    if (!first) { this.layout(); this.fx.buildFrame(); }
  }
  setSetting(k, v) { this.settings[k] = v; S.saveSettings(this.settings); this.applySettings(); }

  // ---------------------------------------------------------------- screens
  show(name, push = false) {
    const prev = this.screen;
    if (push) this.overlayStack.push(prev); else this.overlayStack = [];
    this.screen = name;
    $$('.screen').forEach(s => s.classList.toggle('on', s.id === 'scr-' + name));
    const inGame = name === 'game';
    $('#hud').classList.toggle('hidden', !(this.game && (inGame || name === 'pause')));
    $('#buttons').classList.toggle('hidden', !(this.settings.controls === 'buttons' && this.game && inGame));
    $('#surface').style.pointerEvents = inGame ? 'auto' : 'none';
    if (name === 'title') this.buildTitle();
    if (name === 'stats') this.buildStats();
    if (name === 'settings') this.buildSettings();
    if (name !== 'game' && name !== 'pause') this.maybeApplyUpdate();
  }
  back() { const to = this.overlayStack.pop() || (this.game ? 'pause' : 'title'); this.show(to, false); if (to === 'pause' || to === 'results') this.overlayStack = []; }
  bindUI() {
    document.addEventListener('click', e => {
      const t = e.target.closest('button, [data-go], [data-do], [data-back]'); if (!t) return;
      if (t.closest('#buttons') || t.id === 'btn-pause') return;
      this.sound.ui();
      if (t.dataset.go) this.show(t.dataset.go, true);
      else if (t.hasAttribute('data-back')) this.back();
      else if (t.dataset.do) this.doAction(t.dataset.do);
    });
    $('#btn-pause').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.togglePause(); });
  }
  doAction(a) {
    switch (a) {
      case 'resume': this.resume(); break;
      case 'restart': this.restart(); break;
      case 'quit': this.quit(); break;
      case 'again': this.startGame(this.mode); break;
      case 'end-zen': if (this.game) { this.show('game'); this.game.end('ended'); } break;
    }
  }
  menuKey(e) {
    const k = e.code || e.key;
    if (k === 'Escape') { e.preventDefault(); if (this.screen === 'pause') this.resume(); else if (this.screen !== 'title' && this.screen !== 'results') this.back(); }
    if (k === 'Enter' && this.screen === 'results') { e.preventDefault(); this.startGame(this.mode); }
    if (k === 'KeyR' && (this.screen === 'pause' || this.screen === 'results')) this.restart();
  }

  buildTitle() {
    const st = this.stats; const el = $('#mode-list');
    const best = m => {
      const b = st.modes[m].best; if (!st.modes[m].played) return 'Not played yet';
      if (m === 'sprint') return b.timeMs != null && st.modes[m].top.length ? 'Best ' + fmtTime(b.timeMs, true) : 'Best: unfinished';
      if (m === 'zen') return fmtInt(b.lines) + ' lines best';
      return 'Best ' + fmtInt(b.score);
    };
    const today = this.dailyDate();
    const dBest = st.daily.days[today]; const streak = st.daily.lastDate && (st.daily.lastDate === today || S.addDays(st.daily.lastDate, 1) === today) ? st.daily.streak : 0;
    let html = MODE_ORDER.map(m => `<button class="mode" data-mode="${m}"><span class="glint"></span><span class="m-name">${MODE_INFO[m].name}</span><span class="m-desc">${MODE_INFO[m].desc}</span><span class="m-best">${best(m)}</span></button>`).join('');
    html += `<button class="mode daily" data-mode="daily"><span class="glint"></span><span class="m-name">Daily Challenge</span><span class="m-desc">${MODE_INFO.daily.desc}</span><span class="m-best">${dBest != null ? 'Today ' + fmtInt(dBest) : 'Not played today'}${streak ? ' &nbsp;·&nbsp; streak ' + streak + (streak > 1 ? ' days' : ' day') : ''}</span></button>`;
    el.innerHTML = html;
    $$('.mode', el).forEach(b => b.addEventListener('click', () => this.startGame(b.dataset.mode)));
  }
  dailyDate() { return qs.get('date') || localDateStr(); }

  // ---------------------------------------------------------------- game flow
  startGame(mode) {
    this.clearTimers();
    this.mode = mode;
    const s = this.settings;
    let seed = qs.has('seed') ? +qs.get('seed') : undefined;
    if (mode === 'daily') seed = dailySeed(this.dailyDate());
    this.game = new Game({ mode, seed, das: s.das, arr: s.arr, sdf: s.sdf });
    this.liveToasted = new Set(); this.shownScore = 0; this.hudCache = {}; this.maxStack = 0;
    this.input.releaseAll();
    $('#popups').innerHTML = '';
    this.world = worldIndexFor(mode, this.game.level, 0);
    this.fx.setWorld(this.world, true); this.fx.vis = null; this.fx.P.n = 0; this.fx.rings = []; this.fx.collapse = null; this.fx.stackDirty = true;
    this.bg.setWorld(this.world, false); this.bg.board = 1;
    this.setAccent(this.world);
    this.sound.unlock(); this.sound.setVolumes(s.music, s.sfx);
    this.sound.startMusic(this.world, mode === 'zen');
    this.layout();
    this.show('game');
    $('#hud-world').textContent = WORLDS[this.world].name;
    this.running = false;
    this.countdown(DEBUG && qs.has('nocd') ? 0 : 1);
  }
  countdown(full) {
    this.clearTimers();
    const cd = $('#countdown');
    const say = (txt) => { cd.textContent = txt; cd.classList.remove('go'); void cd.offsetWidth; cd.classList.add('go'); };
    if (!full) { this.running = true; cd.textContent = ''; return; }
    say('READY'); this.sound.countdown(false);
    this.timers.push(setTimeout(() => { say('GO'); this.sound.countdown(true); this.running = true; }, 800));
    this.timers.push(setTimeout(() => { cd.textContent = ''; }, 1400));
  }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; $('#countdown').textContent = ''; }
  restart() { if (this.game) this.startGame(this.mode); }
  togglePause() { if (this.screen === 'game') this.pause(); else if (this.screen === 'pause') this.resume(); }
  pause() {
    if (!this.game || this.game.over || this.screen !== 'game') return;
    this.clearTimers(); this.running = false; this.input.releaseAll();
    $('#pause-sub').textContent = MODE_INFO[this.mode].name + ' · ' + WORLDS[this.world].name;
    $('#btn-endzen').style.display = this.mode === 'zen' ? '' : 'none';
    this.show('pause');
  }
  resume() {
    if (!this.game) { this.show('title'); return; }
    this.show('game'); this.input.releaseAll();
    const cd = $('#countdown'); cd.textContent = 'GO'; cd.classList.remove('go'); void cd.offsetWidth; cd.classList.add('go');
    this.timers.push(setTimeout(() => { this.running = true; }, 350));
    this.timers.push(setTimeout(() => { cd.textContent = ''; }, 700));
  }
  quit() {
    this.clearTimers(); this.running = false; this.game = null; this.input.releaseAll();
    this.fx.P.n = 0; this.bg.board = 0; this.bg.danger = 0;
    this.sound.startMusic(this.titleWorld, true);
    this.show('title');
  }
  onVisibility() {
    if (document.hidden) { if (this.screen === 'game' && this.running) this.pause(); this.sound.suspend(); }
    else { this.sound.resume(); if (this.reg) this.reg.update().catch(() => {}); }
  }

  // ---------------------------------------------------------------- frame
  loop = (ts) => {
    requestAnimationFrame(this.loop);
    try { this.frame(ts); this.frameErrors = 0; }
    catch (e) { console.error('[lumen] frame', e); if (++this.frameErrors > 30 && !this.reportedFrame) { this.reportedFrame = true; this.toast('Something went wrong', String(e.message || e)); } }
  };
  frame(ts) {
    const dt = clamp((ts - this.last) / 1000, 0, 0.1); this.last = ts;
    const g = this.game;
    if (g && this.screen === 'game' && this.running && !g.over && this.timeScale !== 0) g.update(dt * 1000);
    if (g) {
      this.processEvents(g);
      const wi = worldIndexFor(this.mode, g.level, g.lines);
      if (wi !== this.world) this.changeWorld(wi);
    }
    if (g) {
      // stack height drives danger + music intensity
      let top = ROWS; for (let y = HIDDEN - 2; y < ROWS; y++) if (g.board[y].some(v => v)) { top = y; break; }
      const height = ROWS - top; this.stackH = height;
      const danger = this.mode === 'zen' ? 0 : clamp((height - 13) / 5, 0, 1);
      this.fx.danger += (danger - this.fx.danger) * Math.min(1, dt * 4);
      this.bg.danger = this.fx.danger * 0.8;
      const lvlIn = this.mode === 'sprint' ? (g.lines % 8) / 8 : ((g.level - 1) % 3) / 3;
      const target = clamp(0.22 + lvlIn * 0.3 + this.world * 0.06 + height / 20 * 0.3 + Math.max(0, g.combo) * 0.05 + (g.b2b > 0 ? 0.05 : 0), 0, 1);
      this.intensity += (target - this.intensity) * Math.min(1, dt * 0.8);
      this.sound.intensity = this.intensity; this.bg.energy = this.intensity * 0.6;
    } else {
      this.titleT += dt;
      if (this.titleT > 14) { this.titleT = 0; this.titleWorld = (this.titleWorld + 1) % WORLDS.length; this.bg.setWorld(this.titleWorld); this.fx.setWorld(this.titleWorld); this.setAccent(this.titleWorld); }
      this.bg.energy = 0.1; this.sound.intensity = 0.25;
    }
    const vdt = dt * (this.timeScale == null ? 1 : this.timeScale); // timeScale: debug hook to freeze effects for screenshots
    if (!this.skipRender) { this.bg.render(vdt); this.fx.render(vdt, { game: g, title: !g }); }
    if (g && (this.screen === 'game' || this.screen === 'pause')) this.updateHud(g, dt);
  }
  setAccent(i) {
    const w = WORLDS[i]; const r = document.documentElement.style;
    r.setProperty('--accent', w.accent); r.setProperty('--accent2', w.accent2);
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.setAttribute('content', w.sky[0]);
  }
  processEvents(g) {
    const evs = g.drainEvents(); if (!evs.length) return;
    let softTicks = 0;
    for (const e of evs) {
      this.fx.handle(e, g);
      switch (e.type) {
        case 'move': this.sound.move(e.x); break;
        case 'rotate': this.sound.rotate(e.dir); break;
        case 'soft': softTicks++; break;
        case 'harddrop': this.sound.hardDrop(e.dist); break;
        case 'lock': if (!e.lines) this.sound.lock(); break;
        case 'hold': this.sound.hold(); break;
        case 'clear': this.onClear(e, g); break;
        case 'levelup': this.onLevel(g); break;
        case 'zenclear': this.popup('Breathe', 'the well is clear again', 'big', WORLDS[this.world].accent2); this.sound.success(); this.bg.pulseAt(0.5, 0.5); break;
        case 'end': this.onEnd(e, g); break;
      }
    }
    if (softTicks) this.sound.softTick();
  }
  boardUV() { const L = this.L; return [(L.bx + L.bw / 2) / L.w, 1 - (L.by + L.bh / 2) / L.h]; }
  onClear(e, g) {
    this.sound.clear(e.lines, e.spin, Math.max(0, e.combo), e.b2b, e.pc);
    const W = WORLDS[this.world];
    const tColor = W.pieces[5];
    if (e.pc) { this.popup('Perfect Clear', '+' + fmtInt(e.score), 'big', '#ffffff'); const [u, v] = this.boardUV(); this.bg.pulseAt(u, v); this.bg.flash = 0.7; }
    else if (e.spin !== 'none') { this.popup(e.name, (e.b2b ? 'back-to-back · ' : '') + '+' + fmtInt(e.score), e.spin === 'full' && e.lines ? 'big' : '', tColor); if (e.lines) { const [u, v] = this.boardUV(); this.bg.pulseAt(u, v); } }
    else if (e.lines === 4) { this.popup('Tetris', (e.b2b ? 'back-to-back · ' : '') + '+' + fmtInt(e.score), 'big', W.pieces[0]); const [u, v] = this.boardUV(); this.bg.pulseAt(u, v); this.bg.flash = 0.35; }
    else if (e.lines >= 2) this.popup(e.name, '+' + fmtInt(e.score), '', W.accent);
    if (e.combo >= 1) this.popup(`${e.combo + 1}× combo`, '', 'combo', W.accent2, 1 + Math.min(e.combo, 10) * 0.08, 0.55);
    $('#hud-b2b').textContent = g.b2b >= 1 ? 'BACK-TO-BACK ×' + g.b2b : '';
    $('#hud-b2b').classList.toggle('on', g.b2b >= 1);
    // achievements as they happen
    const live = S.liveUnlocks(this.stats, g.summary());
    for (const id of live) if (!this.liveToasted.has(id)) { this.liveToasted.add(id); this.achToast(id); }
  }
  onLevel(g) {
    this.sound.levelUp();
    if (this.mode !== 'zen' && this.mode !== 'sprint') this.popup('Level ' + g.level, '', '', WORLDS[this.world].accent, 0.8, 0.62);
  }
  changeWorld(i) {
    this.world = i;
    this.bg.setWorld(i); this.fx.setWorld(i); this.sound.setWorld(i); this.setAccent(i);
    $('#hud-world').textContent = WORLDS[i].name;
    this.popup(WORLDS[i].name, WORLDS[i].line, 'world', WORLDS[i].accent);
  }
  popup(text, sub, cls = '', color, scale = 1, yFrac) {
    const host = $('#popups'); const el = document.createElement('div');
    el.className = 'pop ' + cls; el.style.setProperty('--pc', color || 'var(--accent)');
    if (scale !== 1) el.style.setProperty('--ps', `calc(${clamp(this.L.cell * 0.82, 18, 36)}px * ${scale})`);
    if (yFrac != null) el.style.top = ((yFrac - 0.38) * this.L.bh) + 'px';
    if (cls === 'combo') el.style.left = '0px';
    el.innerHTML = `<span class="main">${esc(text)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}`;
    // fit long names (T-SPIN DOUBLE, PERFECT CLEAR) inside the screen and close to the well
    const base = clamp(this.L.cell * 0.82, 18, 36) * scale * (cls.includes('big') ? 1.45 : cls.includes('world') ? 1.3 : 1);
    const spacing = cls.includes('big') ? 0.22 : cls.includes('combo') || cls.includes('world') ? 0.02 : 0.16;
    const avail = Math.min(this.L.w - 24, this.L.bw * 1.35);
    const fit = avail / (text.length * (0.62 + spacing));
    el.querySelector('.main').style.fontSize = Math.min(base, fit).toFixed(1) + 'px';
    host.appendChild(el);
    // keep only a couple of the same kind on screen
    const same = $$('.pop.' + (cls || 'plain').split(' ')[0], host); if (cls === 'combo') same.slice(0, -1).forEach(n => n.remove());
    if (!cls) el.classList.add('plain');
    const kill = () => el.remove(); el.addEventListener('animationend', kill); setTimeout(kill, 3600);
  }
  updateHud(g, dt) {
    const set = (k, v) => { if (this.hudCache[k] !== v) { this.hudCache[k] = v; $('#hud-' + k + ' .val').textContent = v; } };
    this.shownScore += (g.score - this.shownScore) * Math.min(1, dt * 12); if (Math.abs(g.score - this.shownScore) < 1) this.shownScore = g.score;
    set('score', fmtInt(this.shownScore));
    if (this.mode === 'sprint') { set('level', String(Math.max(0, 40 - g.lines))); this.lbl('level', 'Left'); }
    else { set('level', String(g.level)); this.lbl('level', 'Level'); }
    set('lines', String(g.lines));
    const lim = g.def.timeLimit;
    if (lim) { set('time', fmtTime(lim - g.time + 999)); this.lbl('time', 'Left'); } else { set('time', fmtTime(g.time, this.mode === 'sprint')); this.lbl('time', 'Time'); }
    set('pps', (g.pieces / Math.max(1, g.time / 1000)).toFixed(2));
  }
  lbl(k, v) { const key = 'l_' + k; if (this.hudCache[key] !== v) { this.hudCache[key] = v; $('#hud-' + k + ' .lbl').textContent = v; } }

  onEnd(e, g) {
    this.running = false; this.input.releaseAll();
    const summary = g.summary();
    if (e.result === 'topout') {
      const cells = []; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (g.board[y][x]) cells.push([x, y, g.board[y][x]]);
      this.fx.handle({ type: 'zenclear', cells }, g);
      g.board.forEach(r => r.fill(0)); this.fx.stackDirty = true; g.cur = null;
      this.sound.gameOver(); this.popup('Game Over', '', 'big', '#ffffff');
    } else if (e.result === 'complete') {
      this.sound.success(); this.popup('Complete', fmtTime(g.time, true), 'big', WORLDS[this.world].accent);
      this.fx.handle({ type: 'clear', rows: [], rowCells: [], lines: 0, spin: 'none', pc: true, combo: 0 }, g); this.bg.flash = 0.5;
    } else if (e.result === 'timeup') { this.sound.success(); this.popup('Time', fmtInt(g.score), 'big', WORLDS[this.world].accent); }
    else { this.sound.success(); }
    const day = localDateStr();
    const out = S.recordGame(this.stats, summary, new Date().toISOString(), this.mode === 'daily' ? this.dailyDate() : day);
    this.stats = out.stats; S.saveStats(this.stats);
    this.lastResult = { summary, ...out };
    this.timers.push(setTimeout(() => this.showResults(), DEBUG && qs.has('nocd') ? 300 : 1500));
  }
  showResults() {
    const { summary: s, records: r, unlocked } = this.lastResult; const st = this.stats; const M = st.modes[s.mode];
    $('#res-mode').textContent = MODE_INFO[s.mode].name + (s.mode === 'daily' ? ' · ' + this.dailyDate() : '');
    const titles = { topout: 'Game Over', complete: 'Complete', timeup: 'Time', ended: 'Session complete' };
    $('#res-title').textContent = titles[s.result] || 'Results';
    const isRecord = r.score || r.time || (r.rank === 1 && !r.first);
    const banner = $('#res-record');
    banner.hidden = !isRecord;
    banner.textContent = r.time ? 'New best time' : 'New record';
    const scoreEl = $('#res-score');
    const sprint = s.mode === 'sprint';
    const big = sprint ? s.timeMs : s.score;
    const fmtBig = v => sprint ? fmtTime(v, true) : fmtInt(v);
    let sub = r.rank ? `#${r.rank} on your ${MODE_INFO[s.mode].name} board` : (sprint && s.result !== 'complete' ? `${s.lines} of 40 lines` : '');
    if (s.mode === 'daily') sub = (sub ? sub + ' · ' : '') + `streak ${st.daily.streak}`;
    $('#res-sub').textContent = sub;
    const tsp = s.tspin.full0 + s.tspin.full1 + s.tspin.full2 + s.tspin.full3 + s.tspin.mini0 + s.tspin.mini1 + s.tspin.mini2;
    const cells = [
      ['Lines', s.lines, M.best.lines, v => fmtInt(v), r.lines],
      ['Level', s.level, M.best.level, v => v, r.level],
      ['Time', s.timeMs, sprint ? M.best.timeMs : null, v => fmtTime(v, sprint), r.time],
      ['Pieces', s.pieces, null, v => fmtInt(v)],
      ['Pieces / sec', s.pps, M.best.pps, v => (+v).toFixed(2), s.pieces >= 20 && s.pps >= (M.best.pps || 0) && M.played > 1],
      ['Attack / min', s.apm, st.lifetime.bestAPM, v => (+v).toFixed(1)],
      ['Tetrises', s.clears.tetris, null, v => v],
      ['T-spins', tsp, null, v => v],
      ['Max combo', s.maxCombo, st.lifetime.maxCombo, v => v],
      ['Max back-to-back', s.maxB2B, st.lifetime.maxB2B, v => v],
      ['Perfect clears', s.pcs, null, v => v],
      ['Score', s.score, sprint ? null : M.best.score, v => fmtInt(v), r.score],
    ].filter(c => !(sprint && c[0] === 'Level') && !(s.mode === 'zen' && c[0] === 'Score' && false));
    $('#res-grid').innerHTML = cells.map((c, i) => {
      const [k, v, best, f, isBest] = c;
      const bline = isBest ? 'new best' : (M.played > 1 && best != null && best !== '') ? 'best ' + f(best) : '';
      return `<div class="res-cell${isBest ? ' best' : ''}" style="animation-delay:${0.25 + i * 0.05}s"><span class="k">${k}</span><span class="v">${f(v)}</span>${bline ? `<span class="b">${bline}</span>` : ''}</div>`;
    }).join('');
    this.show('results');
    // count-up
    const t0 = performance.now(), dur = 1100;
    const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); const e = 1 - Math.pow(1 - k, 3); scoreEl.textContent = fmtBig(Math.round(big * e)); if (k < 1 && this.screen === 'results') requestAnimationFrame(step); else scoreEl.textContent = fmtBig(big); };
    step(); setTimeout(() => { scoreEl.textContent = fmtBig(big); }, dur + 200);
    if (isRecord) this.celebrate();
    unlocked.filter(id => !this.liveToasted.has(id)).forEach((id, i) => setTimeout(() => this.achToast(id), 600 + i * 900));
  }
  celebrate() {
    this.sound.success();
    const L = this.L; const n = this.fx.reduced ? 60 : 180;
    for (let i = 0; i < n; i++) this.fx.emit(Math.random() * L.w, L.h + 10, (Math.random() - 0.5) * 120, -200 - Math.random() * 380, 2 + Math.random() * 1.5, 3 + Math.random() * 4, 1 + (i % 7), 0, 0.8, 60);
    this.bg.pulseAt(0.5, 0.6); this.bg.flash = 0.3;
  }
  achToast(id) {
    const a = S.ACHIEVEMENTS.find(x => x.id === id); if (!a) return;
    this.toast('Achievement', a.name);
  }
  toast(t1, t2) { // one at a time, so they never pile up over the HUD
    (this.toastQ = this.toastQ || []).push([t1, t2]);
    if (!this.toastBusy) this.nextToast();
  }
  nextToast() {
    const item = this.toastQ.shift(); if (!item) { this.toastBusy = false; return; }
    this.toastBusy = true;
    const el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = `<span class="ic"></span><span><span class="t1">${esc(item[0])}</span><span class="t2">${esc(item[1])}</span></span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.remove(); this.nextToast(); }, 2900);
  }

  // ---------------------------------------------------------------- stats screen
  buildStats() {
    const st = this.stats; const tabs = $('#stats-tabs');
    const order = ['marathon', 'sprint', 'ultra', 'zen', 'daily'];
    tabs.innerHTML = order.map(m => `<button data-tab="${m}" class="${m === this.statsTab ? 'on' : ''}">${MODE_INFO[m].name}</button>`).join('');
    $$('button', tabs).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this.statsTab = b.dataset.tab; this.buildStats(); }));
    const m = this.statsTab, M = st.modes[m]; const sprint = m === 'sprint';
    const bestTime = M.best.timeMs != null && (!sprint || M.top.length) ? fmtTime(M.best.timeMs, sprint) : '–';
    let html = `<div class="best-row">
      <div><span class="k">${sprint ? 'Fastest' : 'Best score'}</span><span class="v">${sprint ? bestTime : fmtInt(M.best.score)}</span></div>
      <div><span class="k">Most lines</span><span class="v">${fmtInt(M.best.lines)}</span></div>
      <div><span class="k">${sprint ? 'Best PPS' : 'Top level'}</span><span class="v">${sprint ? (M.best.pps || 0).toFixed(2) : M.best.level}</span></div>
      <div><span class="k">Played</span><span class="v">${M.played}</span></div></div>`;
    if (m === 'daily') html += `<p class="sub" style="margin-top:12px">Streak ${st.daily.streak} · best streak ${st.daily.bestStreak} · today ${st.daily.days[this.dailyDate()] != null ? fmtInt(st.daily.days[this.dailyDate()]) : 'not played'}</p>`;
    if (M.top.length) {
      const last = this.lastResult && this.lastResult.summary.mode === m ? this.lastResult.records.rank : null;
      html += `<table class="top"><tr><th>#</th><th class="r">${sprint ? 'Time' : 'Score'}</th><th class="r">Lines</th><th class="r">${sprint ? 'PPS' : 'Level'}</th><th class="r">Date</th></tr>` +
        M.top.map((e, i) => `<tr class="${last === i + 1 ? 'hi' : ''}"><td>${i + 1}</td><td class="r">${sprint ? fmtTime(e.timeMs, true) : fmtInt(e.score)}</td><td class="r">${e.lines}</td><td class="r">${sprint ? (e.pps || 0).toFixed(2) : e.level}</td><td class="r">${fmtDate(e.date)}</td></tr>`).join('') + '</table>';
    } else html += `<p class="empty">No ${MODE_INFO[m].name} games yet.</p>`;
    $('#stats-mode').innerHTML = html;
    this.drawChart(m);
    const L = st.lifetime;
    const tsp = L.tspin.full0 + L.tspin.full1 + L.tspin.full2 + L.tspin.full3 + L.tspin.mini0 + L.tspin.mini1 + L.tspin.mini2;
    const life = [
      ['Games', fmtInt(L.games)], ['Time played', fmtLong(L.timeMs)], ['Lines', fmtInt(L.lines)], ['Pieces', fmtInt(L.pieces)],
      ['Avg PPS', S.avgPPS(st).toFixed(2)], ['Best PPS', L.bestPPS.toFixed(2)], ['Avg APM', S.avgAPM(st).toFixed(1)], ['Best APM', L.bestAPM.toFixed(1)],
      ['Tetrises', fmtInt(L.clears.tetris)], ['T-spins', fmtInt(tsp)], ['Perfect clears', fmtInt(L.pcs)], ['Max combo', L.maxCombo], ['Max B2B', L.maxB2B], ['Total score', fmtInt(L.score)],
    ];
    $('#life-grid').innerHTML = life.map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
    const W = WORLDS[this.inGameWorld()].pieces;
    const parts = [['Singles', L.clears.single, W[6]], ['Doubles', L.clears.double, W[3]], ['Triples', L.clears.triple, W[2]], ['Tetrises', L.clears.tetris, W[0]],
      ['Mini T-spins', L.tspin.mini0 + L.tspin.mini1 + L.tspin.mini2, W[1]], ['T-spin singles', L.tspin.full1, W[4]], ['T-spin doubles', L.tspin.full2, W[5]], ['T-spin triples', L.tspin.full3, '#ffffff']];
    const tot = parts.reduce((a, p) => a + p[1], 0);
    $('#clear-break').innerHTML = tot ? `<div class="cb-bar">${parts.filter(p => p[1]).map(p => `<i style="width:${(p[1] / tot * 100).toFixed(2)}%;background:${p[2]}"></i>`).join('')}</div>
      <div class="cb-legend">${parts.map(p => `<span style="--c:${p[2]}">${p[0]} ${fmtInt(p[1])}</span>`).join('')}</div>` : '<p class="empty">Clear some lines and they will show up here.</p>';
    const got = S.ACHIEVEMENTS.filter(a => st.achievements[a.id]).length;
    $('#ach-count').textContent = `${got} / ${S.ACHIEVEMENTS.length}`;
    $('#ach-grid').innerHTML = S.ACHIEVEMENTS.map(a => `<div class="ach${st.achievements[a.id] ? ' got' : ''}"><span class="n">${a.name}</span><span class="d">${a.desc}${st.achievements[a.id] ? ' · ' + fmtDate(st.achievements[a.id]) : ''}</span></div>`).join('');
  }
  drawChart(mode) {
    const cv = $('#chart'); const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 300, h = 140; cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    const sprint = mode === 'sprint';
    const data = this.stats.recent.filter(r => r.mode === mode && (!sprint || r.result === 'complete')).slice(-24).map(r => sprint ? r.timeMs / 1000 : r.score);
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ffd2a1';
    g.font = '12px Outfit, sans-serif'; g.fillStyle = 'rgba(238,241,255,.4)';
    if (data.length < 2) { g.fillText(data.length ? 'One game so far. Play another to see a trend.' : 'Your recent games will chart here.', 14, h / 2 + 4); return; }
    const max = Math.max(...data), min = Math.min(...data); const span = max - min || 1;
    const px = i => 14 + (w - 28) * (i / (data.length - 1)); const py = v => h - 18 - (h - 40) * ((v - min) / span);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const y = 22 + (h - 40) * i / 3; g.beginPath(); g.moveTo(14, y); g.lineTo(w - 14, y); g.stroke(); }
    const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, acc + '66'); grad.addColorStop(1, acc + '00');
    g.beginPath(); data.forEach((v, i) => i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))); g.lineTo(px(data.length - 1), h); g.lineTo(px(0), h); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); data.forEach((v, i) => i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v)));
    g.strokeStyle = acc; g.lineWidth = 2; g.shadowColor = acc; g.shadowBlur = 10; g.stroke(); g.shadowBlur = 0;
    data.forEach((v, i) => { g.beginPath(); g.arc(px(i), py(v), i === data.length - 1 ? 4 : 2.2, 0, Math.PI * 2); g.fillStyle = i === data.length - 1 ? '#fff' : acc; g.fill(); });
    g.fillStyle = 'rgba(238,241,255,.5)'; g.fillText(sprint ? 'best ' + min.toFixed(1) + 's' : 'best ' + fmtInt(max), 16, 14);
  }

  // ---------------------------------------------------------------- settings screen
  buildSettings() {
    const s = this.settings; const body = $('#settings-body');
    const rows = [
      ['group', 'Controls'],
      ['seg', 'controls', 'Touch controls', 'Gestures on the board, or on-screen buttons', [['gestures', 'Gestures'], ['buttons', 'Buttons']]],
      ['seg', 'tapMode', 'Tap to rotate', 'Two-finger tap always turns left', [['sides', 'Left / right half'], ['cw', 'Any tap: right']]],
      ['range', 'sensitivity', 'Drag sensitivity', 'How far the piece moves per finger movement', 0.6, 2, 0.1, v => (+v).toFixed(1) + '×'],
      ['range', 'das', 'DAS', 'Delay before a held key or button repeats', 50, 300, 1, v => v + ' ms'],
      ['range', 'arr', 'ARR', 'Repeat rate once DAS kicks in (0 = instant)', 0, 80, 1, v => v + ' ms'],
      ['seg', 'sdf', 'Soft drop', 'Speed of soft drop (keys and buttons)', [[10, '10×'], [30, '30×'], [1000, 'Instant']]],
      ['group', 'Sound'],
      ['range', 'music', 'Music', '', 0, 1, 0.05, v => Math.round(v * 100) + '%'],
      ['range', 'sfx', 'Effects', 'Play sounds are tuned to the music', 0, 1, 0.05, v => Math.round(v * 100) + '%'],
      ['group', 'Visuals'],
      ['seg', 'effects', 'Effects quality', 'Reduced saves battery on older phones', [['high', 'High'], ['reduced', 'Reduced']]],
      ['toggle', 'shake', 'Screen shake', 'Subtle impact on hard drops and Tetrises'],
      ['toggle', 'lean', 'Board lean', 'The well tilts gently toward the piece'],
      ['toggle', 'ghost', 'Ghost piece', 'Shows where the piece will land'],
      ['toggle', 'grid', 'Grid', ''],
    ];
    let html = '';
    for (const r of rows) {
      if (r[0] === 'group') { html += `<h3>${r[1]}</h3>`; continue; }
      const [type, key, label, hint] = r;
      const left = `<div><span class="l">${label}</span>${hint ? `<span class="h">${hint}</span>` : ''}</div>`;
      if (type === 'seg') html += `<div class="set-row">${left}<div class="seg" data-key="${key}">${r[4].map(([v, t]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
      else if (type === 'range') html += `<div class="set-row">${left}<div class="slider"><input type="range" data-key="${key}" min="${r[4]}" max="${r[5]}" step="${r[6]}" value="${s[key]}"><output>${r[7](s[key])}</output></div></div>`;
      else if (type === 'toggle') html += `<div class="set-row">${left}<button class="toggle${s[key] ? ' on' : ''}" data-key="${key}" aria-label="${label}"></button></div>`;
    }
    html += `<h3>Your data</h3><div class="set-actions"><button data-act2="export">Export stats</button><button data-act2="copy">Copy stats</button><button data-act2="reset-settings">Reset settings</button><button class="danger" data-act2="reset">Reset stats</button></div>`;
    html += `<div class="about">LUMEN ${VERSION} · <button data-act2="update" style="text-decoration:underline">Check for update</button> <span id="upd-msg"></span></div>`;
    body.innerHTML = html;
    const fmts = {}; rows.filter(r => r[0] === 'range').forEach(r => { fmts[r[1]] = r[7]; });
    $$('.seg', body).forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
      const key = seg.dataset.key; let v = b.dataset.v; if (!isNaN(+v)) v = +v;
      this.setSetting(key, v); $$('button', seg).forEach(x => x.classList.toggle('on', x === b)); this.sound.ui();
    }));
    $$('input[type=range]', body).forEach(inp => inp.addEventListener('input', () => {
      const key = inp.dataset.key; const v = +inp.value; inp.nextElementSibling.textContent = fmts[key](v);
      this.settings[key] = v; S.saveSettings(this.settings); this.applySettingsLite(key);
    }));
    $$('.toggle', body).forEach(t => t.addEventListener('click', e => { e.stopPropagation(); const k = t.dataset.key; this.setSetting(k, !this.settings[k]); t.classList.toggle('on', this.settings[k]); }));
    $$('[data-act2]', body).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this.settingsAction(b.dataset.act2, b); }));
  }
  applySettingsLite(key) {
    const s = this.settings;
    if (key === 'music' || key === 'sfx') this.sound.setVolumes(s.music, s.sfx);
    if (this.game && (key === 'das' || key === 'arr')) { this.game.das = s.das; this.game.arr = s.arr; }
  }
  settingsAction(a, btn) {
    if (a === 'export' || a === 'copy') {
      const json = JSON.stringify({ app: 'LUMEN', version: VERSION, exported: new Date().toISOString(), stats: this.stats, settings: this.settings }, null, 2);
      if (a === 'copy') {
        const done = ok => { btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { btn.textContent = 'Copy stats'; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(() => done(true), () => done(false)); else done(false);
        return;
      }
      const name = `lumen-stats-${localDateStr()}.json`;
      try {
        const file = typeof File === 'function' ? new File([json], name, { type: 'application/json' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'LUMEN stats' }).catch(() => {}); return; }
      } catch (e) { /* fall through to download */ }
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } else if (a === 'reset') {
      if (btn.dataset.armed) { this.stats = S.newStats(); S.saveStats(this.stats); this.lastResult = null; btn.textContent = 'Stats cleared'; delete btn.dataset.armed; this.buildTitle(); }
      else { btn.dataset.armed = '1'; btn.textContent = 'Tap again to erase everything'; setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = 'Reset stats'; } }, 4000); }
    } else if (a === 'reset-settings') {
      this.settings = { ...S.DEFAULT_SETTINGS }; S.saveSettings(this.settings); this.applySettings(); this.buildSettings();
    } else if (a === 'update') {
      const msg = $('#upd-msg');
      if (!this.reg) { msg.textContent = 'offline updates unavailable here'; return; }
      msg.textContent = 'checking…';
      this.reg.update().then(() => { msg.textContent = this.reg.installing || this.reg.waiting ? 'update found, applying…' : 'you have the latest'; this.maybeApplyUpdate(); }).catch(() => { msg.textContent = 'could not reach the server'; });
    }
  }

  // ---------------------------------------------------------------- offline / updates
  registerSW() {
    if (!('serviceWorker' in navigator) || qs.has('nosw') || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      this.reg = reg;
      const watch = w => { if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) this.maybeApplyUpdate(); }); };
      if (reg.waiting && navigator.serviceWorker.controller) this.maybeApplyUpdate();
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
    }).catch(e => console.warn('[lumen] sw', e && e.message));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (this.swapping) location.reload(); });
  }
  maybeApplyUpdate() {
    const reg = this.reg; if (!reg || !reg.waiting || !navigator.serviceWorker.controller) return;
    if (this.game && (this.screen === 'game' || this.screen === 'pause')) return; // never mid-game
    if (this.swapping) return;
    this.swapping = true;
    this.toast('Updating', 'A new version of LUMEN is ready');
    setTimeout(() => reg.waiting && reg.waiting.postMessage('skipWaiting'), 600);
  }

  // ---------------------------------------------------------------- debug hooks (?debug)
  exposeDebug() {
    const app = this;
    window.LUMEN = {
      app, VERSION, WORLDS,
      get game() { return app.game; }, get screen() { return app.screen; }, get stats() { return app.stats; }, get settings() { return app.settings; }, get layout() { return app.L; },
      start(mode) { app.startGame(mode); app.countdown(0); return true; },
      setBoard(rows) { app.game.setBoard(rows); app.fx.stackDirty = true; },
      setPiece(t, r, x, y) { app.game.setPiece(t, r, x, y); app.fx.vis = null; },
      setQueue(q) { app.game.setQueue(q); },
      setLevel(l) { app.game.level = l; },
      world(i) { app.changeWorld(i); },
      topOut() { const g = app.game; g.noGravity = false; for (let y = HIDDEN - 2; y < ROWS; y++) for (let x = 0; x < COLS; x++) g.board[y][x] = x === (y % COLS) ? 0 : 1 + (x + y) % 7; g.setPiece('O', 0, 3, HIDDEN - 4); g.hardDrop(); },
      freeze(on) { app.game.noGravity = !!on; },
      advance(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (app.game) app.processEvents(app.game); app.bg.render(1 / 60); app.fx.render(1 / 60, { game: app.game, title: !app.game }); } },
      finish() { app.game.end(app.mode === 'sprint' ? 'complete' : 'timeup'); },
      pause() { app.pause(); }, resume() { app.resume(); },
      events: [],
    };
  }
}

const app = new App();
app.boot().catch(e => { console.error(e); if (window.__lumenFail) window.__lumenFail('Startup failed: ' + (e && e.message ? e.message : e)); });
