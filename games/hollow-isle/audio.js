// Hollow Isle audio: everything is synthesised with Web Audio. Every source, including the looping wind, rain and drone,
// goes through its channel gain (music or sfx) BEFORE the reverb send, so a channel at 0 is truly silent.
const N = n => 440 * Math.pow(2, (n - 69) / 12);
const KEY = 'hollow-audio';
export class Audio {
  constructor() {
    this.ctx = null; this.vol = { music: 0.6, sfx: 0.8, musicOn: true, sfxOn: true };
    this.night = 1; this.fear = 0; this.rain = 0; this.blood = false; this.dawn = false; this.wind = 0.5; this.started = false; this.hbT = 0; this.ambT = 6;
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) Object.assign(this.vol, s); } catch (e) {}
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor(); this.master.connect(comp); comp.connect(c.destination);
      this.rev = c.createConvolver(); this.rev.buffer = this.impulse(3.4); this.rev.connect(this.master);
      this.ch = {};
      for (const k of ['music', 'sfx']) {
        const g = c.createGain(), send = c.createGain();
        g.connect(this.master); g.connect(send); send.gain.value = k === 'music' ? 0.5 : 0.3; send.connect(this.rev);
        this.ch[k] = g;
      }
      this.apply();
      // iOS: play a silent buffer inside the gesture
      const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
      this.loops();
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (!this.started) { this.started = true; this.bar = 0; this.next = this.ctx.currentTime + 0.2; this.tick = setInterval(() => this.schedule(), 100); }
  }
  impulse(sec) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    return b;
  }
  noiseBuf() { const c = this.ctx; if (!this.nb) { const len = c.sampleRate * 2; this.nb = c.createBuffer(1, len, c.sampleRate); const d = this.nb.getChannelData(0); let br = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = w; } } return this.nb; }
  // continuous beds: wind + rain (sfx channel) and the eerie drone (music channel)
  loops() {
    const c = this.ctx, nb = this.noiseBuf();
    const loopNoise = () => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; s.start(0, Math.random()); return s; };
    // wind: band-passed noise with a slow wandering centre
    const wn = loopNoise(), wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 0.9; wf.frequency.value = 420;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 260; lfo.connect(lg); lg.connect(wf.frequency); lfo.start();
    this.windG = c.createGain(); this.windG.gain.value = 0; wn.connect(wf); wf.connect(this.windG); this.windG.connect(this.ch.sfx);
    // rain: bright hiss + low patter
    const rn = loopNoise(), rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1800;
    const rn2 = loopNoise(), rf2 = c.createBiquadFilter(); rf2.type = 'lowpass'; rf2.frequency.value = 500;
    this.rainG = c.createGain(); this.rainG.gain.value = 0; rn.connect(rf); rf.connect(this.rainG); rn2.connect(rf2); rf2.connect(this.rainG); this.rainG.connect(this.ch.sfx);
    // drone: detuned low saws through a breathing low-pass
    this.droneG = c.createGain(); this.droneG.gain.value = 0; const df = c.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 260; df.Q.value = 4;
    const dl = c.createOscillator(), dlg = c.createGain(); dl.frequency.value = 0.05; dlg.gain.value = 140; dl.connect(dlg); dlg.connect(df.frequency); dl.start();
    this.droneO = [];
    for (const [n, det] of [[33, -7], [33, 6], [40, 3], [44, -4]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = N(n); o.detune.value = det; const g = c.createGain(); g.gain.value = n === 44 ? 0.0 : 0.05; o.connect(g); g.connect(df); o.start(); this.droneO.push({ o, g, n }); }
    df.connect(this.droneG); this.droneG.connect(this.ch.music); this.droneF = df;
  }
  level(k) { const on = k === 'music' ? this.vol.musicOn : this.vol.sfxOn; const v = on ? this.vol[k] : 0; return v <= 0 ? 0 : v * v; }
  apply() {
    try { localStorage.setItem(KEY, JSON.stringify(this.vol)); } catch (e) {}
    if (!this.ctx) return;
    for (const k of ['music', 'sfx']) { const g = this.ch[k].gain, v = this.level(k); g.cancelScheduledValues(0); g.setValueAtTime(v, this.ctx.currentTime); g.value = v; }
  }
  set(k, v) { this.vol[k] = v; this.apply(); }
  gains() { return this.ctx ? { music: this.ch.music.gain.value, sfx: this.ch.sfx.gain.value } : { music: this.level('music'), sfx: this.level('sfx') }; }
  // per-frame: loop levels, heartbeat, random ambience
  update(dt, playing) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, k = 0.25;
    this.windG.gain.setTargetAtTime(this.dawn ? 0.03 : (0.08 + this.wind * 0.12 + this.rain * 0.05), t, k * 4);
    this.rainG.gain.setTargetAtTime(this.rain * 0.22, t, k * 3);
    this.droneG.gain.setTargetAtTime(this.dawn ? 0 : (0.35 + this.fear * 0.4) * (playing ? 1 : 0.6), t, k * 6);
    if (this.droneO) { const d = this.droneO[3]; d.g.gain.setTargetAtTime(this.blood || this.fear > 0.5 ? 0.04 : 0, t, 1); d.o.frequency.setTargetAtTime(N(this.blood ? 45 : 44), t, 2); }
    if (!playing || this.level('sfx') === 0) return;
    // heartbeat speeds up with fear
    if (this.fear > 0.15 && !this.dawn) { this.hbT -= dt; if (this.hbT <= 0) { const bpm = 60 + this.fear * 90; this.hbT = 60 / bpm; this.sfx('heart', this.fear); } }
    this.ambT -= dt;
    if (this.ambT <= 0 && !this.dawn) { this.ambT = 5 + Math.random() * 9; const r = Math.random(); this.sfx(r < 0.3 ? 'creak' : r < 0.55 ? 'distantbell' : r < 0.8 || this.fear > 0.3 ? 'whisper' : 'owl'); }
  }
  // ---------- voices ----------
  tone(ch, freq, t, dur, { type = 'triangle', vol = 0.2, a = 0.01, slide = 0, cut = 0, det = 0 } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (det) o.detune.value = det; if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cut) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; o.connect(f); node = f; }
    node.connect(g); g.connect(this.ch[ch]); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(ch, t, dur, { vol = 0.2, f = 1200, q = 1, type = 'bandpass', sweep = 0, a = 0 } = {}) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur);
    if (a) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.ch[ch]); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  bell(ch, f, t, vol, len) { [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12], [0.5, 0.35]].forEach(([m, v]) => this.tone(ch, f * m, t, len * (m < 1 ? 1.4 : 1 / Math.sqrt(m)), { type: 'sine', vol: vol * v, a: 0.004 })); }
  sfx(name, p = 0) {
    if (!this.ctx || this.level('sfx') === 0) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'bonk': this.tone('sfx', 180 + p * 80, t, 0.18, { type: 'sine', vol: 0.45, slide: 0.45 }); this.noise('sfx', t, 0.09, { vol: 0.25, f: 500 + p * 300 }); break;
      case 'pop': this.tone('sfx', 300, t, 0.14, { type: 'sine', vol: 0.3, slide: 1.8 }); this.noise('sfx', t, 0.16, { vol: 0.16, f: 1500, sweep: 0.3 }); break;
      case 'collect': [0, 3, 7].forEach((n, i) => this.tone('sfx', N(81 + n), t + i * 0.06, 0.3, { type: 'sine', vol: 0.12 })); break;
      case 'place': this.tone('sfx', 110, t, 0.16, { type: 'sine', vol: 0.5, slide: 0.6 }); this.noise('sfx', t, 0.07, { vol: 0.2, f: 300, type: 'lowpass' }); break;
      case 'step': { // footsteps by surface: grass, stone, wood, sand, water
        const s = p || 'grass', r = Math.random();
        if (s === 'stone') { this.noise('sfx', t, 0.05, { vol: 0.1, f: 2200 + r * 600, q: 3 }); this.tone('sfx', 160 + r * 30, t, 0.04, { type: 'sine', vol: 0.06 }); }
        else if (s === 'wood') { this.tone('sfx', 120 + r * 40, t, 0.09, { type: 'triangle', vol: 0.12, slide: 0.7 }); this.noise('sfx', t, 0.04, { vol: 0.05, f: 900 }); if (r < 0.12) this.sfx('creak'); }
        else if (s === 'sand') this.noise('sfx', t, 0.09, { vol: 0.07, f: 3500, q: 0.6, type: 'highpass' });
        else if (s === 'water') this.noise('sfx', t, 0.2, { vol: 0.12, f: 1400, sweep: 0.4, q: 0.8 });
        else { this.noise('sfx', t, 0.07, { vol: 0.07 + r * 0.03, f: 700 + r * 400, q: 1.5 }); }
        break; }
      case 'jump': this.noise('sfx', t, 0.12, { vol: 0.06, f: 900, sweep: 2 }); break;
      case 'splash': this.noise('sfx', t, 0.7, { vol: 0.28, f: 2200, sweep: 0.2, q: 0.7 }); this.tone('sfx', 140, t, 0.3, { type: 'sine', vol: 0.12, slide: 2 }); break;
      case 'deny': this.tone('sfx', 196, t, 0.14, { type: 'triangle', vol: 0.12 }); this.tone('sfx', 185, t + 0.12, 0.2, { type: 'triangle', vol: 0.12 }); break;
      case 'craft': [0, 7, 12, 15].forEach((n, i) => this.tone('sfx', N(69 + n), t + i * 0.06, 0.4, { type: 'sine', vol: 0.1 })); break;
      case 'click': this.tone('sfx', 660, t, 0.05, { type: 'sine', vol: 0.1 }); break;
      case 'quest': [[69, 0], [72, 0.18], [76, 0.36], [81, 0.54]].forEach(([n, d]) => this.bell('sfx', N(n), t + d, 0.12, 1.6)); break;
      case 'fanfare': [57, 64, 69, 72, 76].forEach((n, i) => this.bell('sfx', N(n), t + i * 0.09, 0.1, 2.4)); break;
      case 'ward': [[57, 0], [64, 0.1], [69, 0.2], [73, 0.3], [76, 0.45]].forEach(([n, d]) => this.bell('sfx', N(n), t + d, 0.13, 3)); this.noise('sfx', t, 2.4, { vol: 0.1, f: 6000, type: 'highpass', a: 0.6 }); break;
      case 'ignite': this.noise('sfx', t, 0.6, { vol: 0.25, f: 800, sweep: 3, a: 0.05 }); this.tone('sfx', 90, t, 0.5, { type: 'sine', vol: 0.2, slide: 1.6 }); break;
      case 'lantern': this.tone('sfx', p ? 520 : 390, t, 0.08, { type: 'triangle', vol: 0.08 }); this.noise('sfx', t + 0.02, 0.25, { vol: p ? 0.12 : 0.05, f: 700, sweep: p ? 2 : 0.5, a: 0.03 }); break;
      case 'handbell': for (let i = 0; i < 3; i++) this.bell('sfx', N(76) * (1 + i * 0.003), t + i * 0.22, 0.22, 3.2); break;
      case 'distantbell': this.bell('sfx', N(45 + [0, 3, 7][Math.floor(Math.random() * 3)]), t, 0.035, 5); break;
      case 'creak': { const f = 70 + Math.random() * 60; this.tone('sfx', f, t, 0.7, { type: 'sawtooth', vol: 0.03, slide: 1.35, cut: 900, a: 0.15 }); this.tone('sfx', f * 1.5, t + 0.1, 0.5, { type: 'sawtooth', vol: 0.015, slide: 0.8, cut: 700, a: 0.1 }); break; }
      case 'whisper': for (let i = 0; i < 4; i++) { const st = t + i * (0.18 + Math.random() * 0.2); this.noise('sfx', st, 0.35, { vol: 0.05 + this.fear * 0.06, f: 1800 + Math.random() * 2400, q: 9, sweep: 0.6 + Math.random() * 0.8, a: 0.08 }); } break;
      case 'owl': this.tone('sfx', 420, t, 0.4, { type: 'sine', vol: 0.03, slide: 0.85, a: 0.06 }); this.tone('sfx', 400, t + 0.55, 0.7, { type: 'sine', vol: 0.03, slide: 0.8, a: 0.08 }); break;
      case 'heart': { const v = 0.18 + p * 0.25; this.tone('sfx', 58, t, 0.16, { type: 'sine', vol: v, slide: 0.6 }); this.tone('sfx', 52, t + 0.17, 0.2, { type: 'sine', vol: v * 0.7, slide: 0.6 }); break; }
      case 'thunder': this.noise('sfx', t, 3.5 + Math.random() * 2, { vol: 0.5, f: 180, type: 'lowpass', q: 0.5, a: 0.04 }); this.noise('sfx', t, 0.4, { vol: 0.35, f: 900, sweep: 0.2 }); this.tone('sfx', 40, t, 2.5, { type: 'sine', vol: 0.25, slide: 0.7 }); break;
      case 'sting': [61, 62, 67, 68, 73].forEach(n => this.tone('sfx', N(n), t, 1.6, { type: 'sawtooth', vol: p ? 0.012 : 0.03, a: p ? 0.4 : 0.05, cut: 2600 })); if (!p) { this.noise('sfx', t, 1.2, { vol: 0.3, f: 300, sweep: 8, a: 0.03 }); this.tone('sfx', 45, t, 1.2, { type: 'sine', vol: 0.4 }); } break;
      case 'hollowfade': this.noise('sfx', t, 1.2, { vol: 0.12, f: 2600, sweep: 0.15, q: 4, a: 0.05 }); this.tone('sfx', N(76), t, 1.0, { type: 'sine', vol: 0.03, slide: 0.5 }); break;
      case 'caught': this.noise('sfx', t, 1.6, { vol: 0.35, f: 200, sweep: 6, a: 0.3 }); this.tone('sfx', 70, t, 1.8, { type: 'sine', vol: 0.3, slide: 0.4 }); break;
      case 'wake': [57, 60, 64].forEach((n, i) => this.tone('sfx', N(n + 12), t + i * 0.3, 1.4, { type: 'sine', vol: 0.06, a: 0.2 })); break;
      case 'hush': this.tone('sfx', 300, t, 0.3, { type: 'triangle', vol: 0.05, slide: 0.7, det: 30 }); break;
      case 'cured': [72, 76, 79, 84].forEach((n, i) => this.tone('sfx', N(n), t + i * 0.08, 0.6, { type: 'sine', vol: 0.12 })); break;
      case 'chirp': this.tone('sfx', 2200 + Math.random() * 600, t, 0.08, { type: 'sine', vol: 0.04, slide: 1.4 }); break;
      case 'dawn': [45, 52, 57, 61, 64, 69].forEach((n, i) => this.tone('sfx', N(n), t + i * 0.25, 6, { type: 'sine', vol: 0.06, a: 1.5 })); this.noise('sfx', t, 6, { vol: 0.06, f: 7000, type: 'highpass', a: 2 }); break;
    }
  }
  // ---------- music: a broken music box over the drone; a hopeful theme once dawn breaks ----------
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    while (this.next < this.ctx.currentTime + 0.5) { this.playBar(this.next, this.bar); this.next += this.barLen; this.bar++; }
  }
  get barLen() { return this.dawn ? 60 / 84 * 4 : 60 / 66 * 4; }
  box(f, t, len, vol, broken) {
    const det = broken ? (Math.random() - 0.5) * 40 + Math.sin(t * 0.7) * 18 : 0;
    this.tone('music', f, t, len, { type: 'sine', vol, a: 0.003, det });
    this.tone('music', f * 2.01, t, len * 0.45, { type: 'sine', vol: vol * 0.35, a: 0.002, det });
    this.tone('music', f * 4.2, t, 0.12, { type: 'sine', vol: vol * 0.12, a: 0.001 });
  }
  playBar(t, bar) {
    if (this.level('music') === 0) return;
    const beat = this.barLen / 4;
    if (this.dawn) { // A major, warm pads and the music box finally in tune
      const prog = [[57, [0, 4, 7]], [54, [0, 3, 7]], [50, [0, 4, 7]], [52, [0, 4, 7]]], [root, ch] = prog[bar % 4];
      this.tone('music', N(root - 12), t, beat * 4, { type: 'triangle', vol: 0.12, a: 0.3, cut: 600 });
      ch.forEach(n => this.tone('music', N(root + n), t, beat * 4.2, { type: 'sine', vol: 0.04, a: 0.8 }));
      const mel = [[7, 1], [12, 1], [11, 0.5], [9, 0.5], [7, 1], [4, 2], [7, 1], [9, 1]]; let x = t, k = (bar % 2) * 4;
      for (let i = 0; i < 4; i++) { const [n, l] = mel[(k + i) % mel.length]; this.box(N(root + 12 + n), x, beat * 2, 0.06, false); x += beat * l; if (x - t >= beat * 4) break; }
      return;
    }
    // A minor music box, slow, slightly detuned; every few bars a note drops out or warps
    const prog = [[45, [0, 3, 7]], [41, [0, 4, 7]], [43, [0, 4, 7]], [40, [0, 4, 7, 10]], [45, [0, 3, 7]], [38, [0, 3, 7]], [41, [0, 4, 7]], [40, [0, 4, 8]]];
    const [root, ch] = prog[bar % 8];
    const mel = [[12, 0.5], [15, 0.5], [19, 1], [17, 0.5], [15, 0.5], [14, 1]];
    const blood = this.blood;
    let x = t;
    for (let i = 0; i < mel.length; i++) {
      const [n, l] = mel[i];
      if (Math.random() < 0.12 + this.fear * 0.2) { x += beat * l; continue; } // a tooth missing from the comb
      const note = root + 24 + (i % 2 ? ch[(i + bar) % ch.length] : n - 12 + ch[0]);
      this.box(N(note + (blood && i % 3 === 2 ? 1 : 0)), x, beat * 2.4, 0.05, true);
      x += beat * l;
    }
    if (bar % 4 === 0) this.tone('music', N(root + 12), t, beat * 4, { type: 'sine', vol: 0.03, a: 1.2 });
  }
}
