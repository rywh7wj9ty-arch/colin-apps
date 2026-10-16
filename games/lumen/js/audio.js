/* LUMEN sound: a procedural Web Audio score per world, and play sounds that are always in key with it.
   Layers (pad, bass, arp, drums) come in as intensity rises with level, stack height and combos. */
import { WORLDS } from './worlds.js';

const fold = m => { while (m > 98) m -= 12; while (m < 24) m += 12; return m; };
const mtof = m => 440 * Math.pow(2, (fold(m) - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null; this.music = 0.7; this.sfx = 0.8; this.cfg = WORLDS[0].music; this.pending = null;
    this.intensity = 0.2; this.playing = false; this.step = 0; this.nextT = 0; this.timer = null; this.chordIdx = 0;
    this.rotIdx = 0; this.calm = false;
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' }); this.build();
      }
      if (this.ctx.state !== 'running') { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    } catch (e) { /* audio is optional */ }
  }
  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.music * 0.55; this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfx * 0.7; this.sfxBus.connect(this.master);
    // reverb from a generated impulse
    const len = Math.floor(c.sampleRate * 2.6), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = c.createConvolver(); this.verb.buffer = ir;
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.5; this.verbIn.connect(this.verb);
    const vOut = c.createGain(); vOut.gain.value = 0.55; this.verb.connect(vOut); vOut.connect(this.master);
    // tempo delay for bells
    this.delay = c.createDelay(1.5); this.delay.delayTime.value = 0.375;
    const fb = c.createGain(); fb.gain.value = 0.32; const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 3200;
    this.delayIn = c.createGain(); this.delayIn.gain.value = 0.35;
    this.delayIn.connect(this.delay); this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(this.master); dl.connect(this.verbIn);
    // noise buffer
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
  }
  setVolumes(music, sfx) {
    this.music = music; this.sfx = sfx;
    if (this.ctx) { const t = this.ctx.currentTime; this.musicBus.gain.setTargetAtTime(music * 0.55, t, 0.1); this.sfxBus.gain.setTargetAtTime(sfx * 0.7, t, 0.05); }
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  // ---------- harmony helpers ----------
  get spb() { return 60 / this.cfg.bpm; }
  chordDeg() { return this.cfg.prog[this.chordIdx % this.cfg.prog.length]; }
  scaleNote(deg, base = this.cfg.root) { const sc = this.cfg.scale; const o = Math.floor(deg / sc.length); return base + sc[((deg % sc.length) + sc.length) % sc.length] + 12 * o; }
  chordNotes(deg = this.chordDeg(), base = this.cfg.root) { return [0, 2, 4, 6].map(k => this.scaleNote(deg + k, base)); }
  nextGrid(div = 4) { if (!this.ctx) return 0; const now = this.ctx.currentTime; if (!this.playing) return now; const g = this.spb / div; const since = now - this.gridT0; return this.gridT0 + Math.ceil(since / g - 0.02) * g; }

  // ---------- sequencer ----------
  startMusic(worldIdx = 0, calm = false) {
    this.cfg = WORLDS[worldIdx].music; this.calm = calm; this.pending = null;
    if (!this.ctx) return;
    this.stopMusic(true);
    this.playing = true; this.step = 0; this.chordIdx = 0;
    this.nextT = this.ctx.currentTime + 0.08; this.gridT0 = this.nextT;
    this.timer = setInterval(() => this.tick(), 25);
  }
  setWorld(i) { if (WORLDS[i].music !== this.cfg) this.pending = WORLDS[i].music; }
  stopMusic(now) {
    if (this.timer) clearInterval(this.timer); this.timer = null; this.playing = false;
  }
  tick() {
    if (!this.ctx || this.ctx.state !== 'running') { if (this.ctx) this.nextT = this.ctx.currentTime + 0.05; return; }
    const c = this.ctx; const ahead = c.currentTime + 0.14;
    if (this.nextT < c.currentTime - 0.3) this.nextT = c.currentTime + 0.02; // after a stall, don't machine-gun catch-up notes
    while (this.nextT < ahead) {
      this.playStep(this.step, this.nextT);
      const dur = this.spb / 4;
      const swing = this.cfg.swing && this.step % 2 === 0 ? dur * this.cfg.swing : this.cfg.swing && this.step % 2 ? -dur * this.cfg.swing : 0;
      this.nextT += dur + swing;
      this.step++;
      if (this.step % 16 === 0) {
        this.chordIdx++;
        if (this.pending && this.chordIdx % this.cfg.prog.length === 0) { this.cfg = this.pending; this.pending = null; this.chordIdx = 0; this.gridT0 = this.nextT; this.step = 0; }
        else if (this.pending && this.chordIdx % 2 === 0) { this.cfg = this.pending; this.pending = null; this.chordIdx = 0; this.gridT0 = this.nextT; this.step = 0; }
      }
    }
  }
  playStep(step, t) {
    const s = step % 16, I = this.calm ? Math.min(this.intensity, 0.45) : this.intensity;
    const bar = this.spb * 4; const ch = this.chordNotes();
    if (s === 0) this.pad(ch, t, bar * 1.02, I);
    if (I > 0.12) {
      const pat = I > 0.55 ? [0, 6, 8, 11, 14] : [0, 8];
      if (pat.includes(s)) this.bass(ch[0] - 24 + (s === 11 ? 7 : 0), t, this.spb * (s === 0 ? 1.4 : 0.6), I);
    }
    if (I > 0.3) {
      const every = I > 0.72 ? 1 : 2;
      if (s % every === 0) {
        const seq = [0, 1, 2, 3, 2, 1, 3, 2];
        const k = seq[(s / every) % seq.length]; const n = ch[k % 4] + 12 + (s >= 8 && I > 0.85 ? 12 : 0);
        this.bell(n, t, 0.05 + (I - 0.3) * 0.06, 0.5, true);
      }
    }
    if (I > 0.45 && !this.calm) {
      if (s === 0 || s === 8 || (I > 0.8 && s === 10)) this.kick(t, 0.55);
      if (I > 0.6 && s % 4 === 2) this.hat(t, 0.08);
      if (I > 0.66 && s % 2 === 1 && I > 0.85) this.hat(t, 0.04);
      if (I > 0.78 && (s === 4 || s === 12)) this.snare(t, 0.16);
    }
  }
  // ---------- instruments ----------
  env(g, t, a, peak, d, sus, rel, end) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.setTargetAtTime(Math.max(0.0001, peak * sus), t + a, d);
    g.gain.setTargetAtTime(0.0001, end, rel);
  }
  pad(notes, t, dur, I) {
    const c = this.ctx; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600 + I * 2600; f.Q.value = 0.6;
    const g = c.createGain(); this.env(g, t, 0.8, 0.07, 1.2, 0.85, 0.5, t + dur - 0.3);
    f.connect(g); g.connect(this.musicBus); g.connect(this.verbIn);
    for (const n of notes.slice(0, 3)) for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = this.cfg.pad; o.frequency.value = mtof(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 2);
    }
  }
  bass(n, t, dur, I) {
    const c = this.ctx; const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(n);
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(n - 12);
    const g = c.createGain(); this.env(g, t, 0.01, 0.16 + I * 0.06, 0.15, 0.6, 0.08, t + dur);
    o.connect(g); o2.connect(g); g.connect(this.musicBus); o.start(t); o2.start(t); o.stop(t + dur + 0.6); o2.stop(t + dur + 0.6);
  }
  bell(n, t, vol, decay = 0.8, delay = false, bus = this.musicBus) {
    const c = this.ctx; const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(n);
    const m = c.createOscillator(); m.type = 'sine'; m.frequency.value = Math.min(16000, mtof(n) * 3.5);
    const mg = c.createGain(); mg.gain.setValueAtTime(mtof(n) * 1.1, t); mg.gain.exponentialRampToValueAtTime(1, t + decay * 0.6);
    m.connect(mg); mg.connect(o.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(bus); g.connect(this.verbIn); if (delay) g.connect(this.delayIn);
    o.start(t); m.start(t); o.stop(t + decay + 0.05); m.stop(t + decay + 0.05);
  }
  pluck(n, t, vol, decay = 0.18, type = 'triangle', bus = this.sfxBus) {
    const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.value = mtof(n);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(600, t + decay);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(f); f.connect(g); g.connect(bus); g.connect(this.verbIn); o.start(t); o.stop(t + decay + 0.05);
  }
  kick(t, vol) {
    const c = this.ctx; const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.35);
  }
  noiseHit(t, vol, type, freq, dur, bus) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    return g;
  }
  hat(t, vol) { this.noiseHit(t, vol, 'highpass', 8000, 0.05, this.musicBus); }
  snare(t, vol) { const g = this.noiseHit(t, vol, 'bandpass', 1800, 0.18, this.musicBus); g.connect(this.verbIn); }

  // ---------- play sounds (in key) ----------
  ok() { return this.ctx && this.ctx.state === 'running' && this.sfx > 0; }
  move(x) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this.pluck(this.scaleNote(x + 7, this.cfg.root), t, 0.07, 0.09, 'triangle');
  }
  rotate(dir) {
    if (!this.ok()) return; const t = this.ctx.currentTime; const ch = this.chordNotes();
    this.rotIdx = (this.rotIdx + (dir < 0 ? 3 : 1)) % 4;
    this.bell(ch[this.rotIdx] + 24, t, 0.06, 0.35, false, this.sfxBus);
  }
  softTick() { if (!this.ok()) return; this.noiseHit(this.ctx.currentTime, 0.015, 'highpass', 5000, 0.02, this.sfxBus); }
  hardDrop(dist) {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    const c = this.ctx; const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    const g = c.createGain(); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.25);
    this.noiseHit(t, 0.06, 'lowpass', 1200, 0.08, this.sfxBus);
  }
  lock() {
    if (!this.ok()) return; const t = this.ctx.currentTime; const ch = this.chordNotes();
    this.pluck(ch[0] + 12, t, 0.09, 0.22, 'sine'); this.pluck(ch[2] + 12, t + 0.01, 0.05, 0.2, 'sine');
  }
  hold() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    this.noiseHit(t, 0.05, 'bandpass', 2400, 0.18, this.sfxBus);
    this.bell(this.chordNotes()[2] + 12, t, 0.05, 0.4, false, this.sfxBus);
  }
  clear(lines, spin, combo, b2b, pc) {
    if (!this.ok()) return;
    const t0 = this.nextGrid(4) ; const g = this.spb / 4;
    const ch = this.chordNotes(); const up = Math.min(combo, 10);
    if (spin !== 'none') {
      const c = this.ctx; const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(mtof(ch[0] + 12), t0); o.frequency.exponentialRampToValueAtTime(mtof(ch[0] + 36), t0 + 0.25);
      const gg = c.createGain(); gg.gain.setValueAtTime(0.0001, t0); gg.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05); gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.connect(gg); gg.connect(this.sfxBus); gg.connect(this.verbIn); o.start(t0); o.stop(t0 + 0.45);
    }
    const n = Math.max(1, lines) + (spin !== 'none' ? 2 : 0);
    for (let i = 0; i < n; i++) this.bell(this.scaleNote(this.chordDeg() + i * 2 + up, this.cfg.root + 12), t0 + i * g * (lines === 4 ? 0.5 : 1), 0.11, 0.9, true, this.sfxBus);
    if (lines === 4 || pc) {
      for (const k of ch) this.bell(k + 24, t0 + g * 2, 0.06, 2.2, true, this.sfxBus);
      this.kick(t0, 0.5); this.noiseHit(t0, 0.08, 'highpass', 6000, 1.2, this.sfxBus).connect(this.verbIn);
      const c = this.ctx; const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(ch[0] - 12);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(200, t0); f.frequency.exponentialRampToValueAtTime(3000, t0 + 0.6); f.frequency.exponentialRampToValueAtTime(300, t0 + 1.6);
      const gg = c.createGain(); gg.gain.setValueAtTime(0.0001, t0); gg.gain.exponentialRampToValueAtTime(0.1, t0 + 0.3); gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
      o.connect(f); f.connect(gg); gg.connect(this.sfxBus); gg.connect(this.verbIn); o.start(t0); o.stop(t0 + 1.9);
    }
    if (pc) for (let i = 0; i < 8; i++) this.bell(this.scaleNote(i * 2, this.cfg.root + 24), t0 + 0.4 + i * g * 0.5, 0.06, 1.2, true, this.sfxBus);
    if (b2b) this.bell(ch[3] + 24, t0 + g * n, 0.05, 1.0, true, this.sfxBus);
  }
  levelUp() {
    if (!this.ok()) return; const t0 = this.nextGrid(4); const g = this.spb / 4;
    [0, 2, 4, 7].forEach((d, i) => this.bell(this.scaleNote(this.chordDeg() + d, this.cfg.root + 12), t0 + i * g * 0.75, 0.07, 1.4, true, this.sfxBus));
  }
  countdown(final) { if (!this.ok()) return; const t = this.ctx.currentTime; this.bell(this.cfg.root + (final ? 24 : 12), t, final ? 0.12 : 0.07, final ? 1.2 : 0.4, final, this.sfxBus); }
  ui() { if (!this.ok()) return; this.bell(this.chordNotes()[1] + 24, this.ctx.currentTime, 0.035, 0.25, false, this.sfxBus); }
  gameOver() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    [7, 4, 2, 0, -3].forEach((d, i) => this.bell(this.scaleNote(d, this.cfg.root + 12), t + i * 0.16, 0.07, 1.4, true, this.sfxBus));
  }
  success() {
    if (!this.ok()) return; const t = this.ctx.currentTime;
    [0, 2, 4, 7, 9, 11, 14].forEach((d, i) => this.bell(this.scaleNote(d, this.cfg.root + 12), t + i * 0.09, 0.07, 1.6, true, this.sfxBus));
  }
}
