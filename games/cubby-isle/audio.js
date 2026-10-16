// Cubby Isle audio: everything is synthesised with Web Audio. Every source goes through its channel gain
// (music or sfx) BEFORE the reverb send, so a channel at 0 is truly silent.
const N = n => 440 * Math.pow(2, (n - 69) / 12);
export class Audio {
  constructor() {
    this.ctx = null; this.vol = { music: 0.6, sfx: 0.8, musicOn: true, sfxOn: true }; this.night = 0; this.started = false;
    try { const s = JSON.parse(localStorage.getItem('cubby-audio') || 'null'); if (s) Object.assign(this.vol, s); } catch (e) {}
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor(); this.master.connect(comp); comp.connect(c.destination);
      this.rev = c.createConvolver(); this.rev.buffer = this.impulse(2.2); this.rev.connect(this.master);
      this.ch = {};
      for (const k of ['music', 'sfx']) {
        const g = c.createGain(), send = c.createGain();
        g.connect(this.master); g.connect(send); send.gain.value = k === 'music' ? 0.35 : 0.2; send.connect(this.rev);
        this.ch[k] = g;
      }
      this.apply();
      // iOS: play a silent buffer inside the gesture
      const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (!this.started) { this.started = true; this.bar = 0; this.next = this.ctx.currentTime + 0.1; this.tick = setInterval(() => this.schedule(), 100); }
  }
  impulse(sec) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    return b;
  }
  level(k) { const on = k === 'music' ? this.vol.musicOn : this.vol.sfxOn; const v = on ? this.vol[k] : 0; return v <= 0 ? 0 : v * v; }
  apply() {
    try { localStorage.setItem('cubby-audio', JSON.stringify(this.vol)); } catch (e) {}
    if (!this.ctx) return;
    for (const k of ['music', 'sfx']) { const g = this.ch[k].gain, v = this.level(k); g.cancelScheduledValues(0); g.setValueAtTime(v, this.ctx.currentTime); g.value = v; }
  }
  set(k, v) { this.vol[k] = v; this.apply(); }
  gains() { return this.ctx ? { music: this.ch.music.gain.value, sfx: this.ch.sfx.gain.value } : { music: this.level('music'), sfx: this.level('sfx') }; }
  // ---------- voices ----------
  tone(ch, freq, t, dur, { type = 'triangle', vol = 0.2, a = 0.01, slide = 0, cut = 0 } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cut) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; o.connect(f); node = f; }
    node.connect(g); g.connect(this.ch[ch]); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(ch, t, dur, { vol = 0.2, f = 1200, q = 1, type = 'bandpass', sweep = 0 } = {}) {
    const c = this.ctx; if (!this.nb) { const len = c.sampleRate; this.nb = c.createBuffer(1, len, c.sampleRate); const d = this.nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nb; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.ch[ch]); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  sfx(name, p = 0) {
    if (!this.ctx || this.level('sfx') === 0) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'bonk': this.tone('sfx', 300 + p * 120, t, 0.16, { type: 'sine', vol: 0.5, slide: 0.45 }); this.noise('sfx', t, 0.08, { vol: 0.25, f: 700 + p * 300 }); break;
      case 'pop': this.tone('sfx', 520, t, 0.12, { type: 'sine', vol: 0.35, slide: 2.2 }); this.noise('sfx', t, 0.12, { vol: 0.15, f: 2500, sweep: 0.4 }); break;
      case 'collect': [0, 4, 7].forEach((n, i) => this.tone('sfx', N(84 + n), t + i * 0.05, 0.18, { type: 'sine', vol: 0.15 })); break;
      case 'place': this.tone('sfx', 150, t, 0.14, { type: 'sine', vol: 0.5, slide: 0.6 }); this.noise('sfx', t, 0.06, { vol: 0.2, f: 400, type: 'lowpass' }); break;
      case 'step': this.noise('sfx', t, 0.05, { vol: 0.06 + Math.random() * 0.03, f: 900 + Math.random() * 500, q: 2 }); break;
      case 'jump': this.tone('sfx', 330, t, 0.16, { type: 'square', vol: 0.06, slide: 1.8, cut: 1800 }); break;
      case 'splash': this.noise('sfx', t, 0.6, { vol: 0.3, f: 3000, sweep: 0.2, q: 0.7 }); this.tone('sfx', 200, t, 0.3, { type: 'sine', vol: 0.15, slide: 2 }); break;
      case 'deny': this.tone('sfx', 220, t, 0.12, { type: 'square', vol: 0.06, cut: 900 }); this.tone('sfx', 185, t + 0.12, 0.16, { type: 'square', vol: 0.06, cut: 900 }); break;
      case 'craft': [0, 7, 12, 16, 19].forEach((n, i) => this.tone('sfx', N(76 + n), t + i * 0.045, 0.3, { type: 'sine', vol: 0.12 })); break;
      case 'click': this.tone('sfx', 880, t, 0.05, { type: 'sine', vol: 0.12 }); break;
      case 'chirp': this.tone('sfx', 2200 + Math.random() * 600, t, 0.08, { type: 'sine', vol: 0.04, slide: 1.4 }); break;
      case 'quest': [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [83, 0.6], [84, 0.72]].forEach(([n, d]) => this.tone('sfx', N(n), t + d, 0.35, { type: 'triangle', vol: 0.22 })); [60, 64, 67].forEach(n => this.tone('sfx', N(n), t + 0.72, 1.0, { type: 'sine', vol: 0.1 })); break;
      case 'fanfare': [[67, 0], [72, 0.1], [76, 0.2], [79, 0.3], [84, 0.45]].forEach(([n, d]) => this.tone('sfx', N(n), t + d, 0.5, { type: 'square', vol: 0.07, cut: 3000 })); [72, 76, 79, 84, 88].forEach((n, i) => this.tone('sfx', N(n), t + 0.6 + i * 0.03, 1.4, { type: 'sine', vol: 0.09 })); this.noise('sfx', t + 0.6, 1.2, { vol: 0.08, f: 8000, type: 'highpass' }); break;
      case 'alive': [60, 64, 67, 71, 72, 76].forEach((n, i) => this.tone('sfx', N(n + 12), t + i * 0.09, 0.8, { type: 'sine', vol: 0.12 })); break;
    }
  }
  // ---------- music: a day theme (C major, I-vi-IV-V / IV-V-iii-vi) and a gentler night theme ----------
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    while (this.next < this.ctx.currentTime + 0.4) { this.playBar(this.next, this.bar); this.next += this.barLen; this.bar++; }
  }
  get barLen() { return this.isNight ? 60 / 70 * 4 : 60 / 104 * 4; }
  playBar(t, bar) {
    this.isNight = this.night > 0.5;
    if (this.level('music') === 0) return;
    const day = [[48, [0, 4, 7]], [45, [0, 3, 7]], [41, [0, 4, 7]], [43, [0, 4, 7]], [41, [0, 4, 7]], [43, [0, 4, 7, 10]], [40, [0, 3, 7]], [45, [0, 3, 7]]];
    const night = [[45, [0, 3, 7]], [41, [0, 4, 7]], [48, [0, 4, 7]], [43, [0, 4, 7]], [41, [0, 4, 7, 11]], [48, [0, 4, 7]], [38, [0, 3, 7]], [40, [0, 4, 7]]];
    const prog = this.isNight ? night : day, [root, ch] = prog[bar % 8], beat = this.barLen / 4;
    const mel = this.isNight ? [[0, 2], [2, 1], [1, 1], [-1, 0], [2, 2], [1, 2], [0, 4], [-1, 0]] : [[2, 1], [1, 0.5], [0, 0.5], [1, 1], [2, 1], [3, 0.5], [2, 0.5], [1, 1], [0, 2]];
    if (this.isNight) {
      this.tone('music', N(root), t, beat * 4, { type: 'sine', vol: 0.12 });
      ch.forEach((n, i) => this.tone('music', N(root + 24 + n), t + i * 0.02, beat * 4, { type: 'sine', vol: 0.025, a: 0.6 }));
      for (let i = 0; i < 6; i++) { const n = ch[(i * 2 + bar) % ch.length] + 12 * (1 + (i % 2)); this.tone('music', N(root + 24 + n), t + i * beat * 0.66, beat * 2, { type: 'sine', vol: 0.05 }); }
      if (bar % 2 === 0) { let x = t; for (const [deg, len] of mel.slice(0, 4)) { if (deg >= 0) this.tone('music', N(root + 36 + ch[deg % ch.length]), x + 0.01, beat * len * 1.4, { type: 'triangle', vol: 0.05 }); x += beat * (len || 1); } }
    } else {
      this.tone('music', N(root), t, beat * 1.6, { type: 'triangle', vol: 0.2, cut: 700 }); this.tone('music', N(root + 7), t + beat * 2, beat * 1.6, { type: 'triangle', vol: 0.15, cut: 700 });
      for (let i = 0; i < 8; i++) { const n = ch[[0, 1, 2, 1, 0, 2, 1, 2][i] % ch.length]; this.tone('music', N(root + 24 + n), t + i * beat / 2, beat * 0.45, { type: 'square', vol: 0.025, cut: 2200 }); }
      ch.forEach(n => this.tone('music', N(root + 12 + n), t, beat * 3.8, { type: 'sine', vol: 0.03, a: 0.3 }));
      let x = t; const shift = bar % 4 === 3 ? 1 : 0;
      for (const [deg, len] of mel) { if (x - t >= beat * 4 - 0.01) break; if (deg >= 0) this.tone('music', N(root + 36 + ch[(deg + shift) % ch.length]), x, beat * len * 0.9, { type: 'triangle', vol: 0.08 }); x += beat * len; }
      this.noise('music', t, 0.04, { vol: 0.05, f: 6000, type: 'highpass' }); this.noise('music', t + beat * 2, 0.04, { vol: 0.05, f: 6000, type: 'highpass' });
    }
  }
}
