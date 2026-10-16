// HUE DASH procedural audio. Every source routes through musicBus or sfxBus (including reverb sends),
// so a channel at 0 is exactly silent.
const W = [
  { bpm: 112, key: 62, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], scale: [0, 2, 4, 7, 9], lead: 'triangle' },
  { bpm: 100, key: 57, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], scale: [0, 3, 5, 7, 10], lead: 'sine' },
  { bpm: 120, key: 60, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [5, 9, 12]], scale: [0, 2, 4, 7, 9], lead: 'square' },
  { bpm: 126, key: 55, prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]], scale: [0, 3, 5, 7, 10], lead: 'sawtooth' },
];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export class Audio {
  constructor() { this.ctx = null; this.music = 0.7; this.sfx = 0.8; this.musicOn = true; this.sfxOn = true; this.world = 0; this.playing = false; }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.connect(c.destination);
    this.musicBus = c.createGain(); this.sfxBus = c.createGain();
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
    // separate reverbs per channel so sends obey the channel gain
    const ir = this.impulse(1.8);
    this.mRev = c.createConvolver(); this.mRev.buffer = ir; this.mRevIn = c.createGain(); this.mRevIn.gain.value = 0.25; this.mRevIn.connect(this.mRev); this.mRev.connect(this.musicBus);
    this.sRev = c.createConvolver(); this.sRev.buffer = ir; this.sRevIn = c.createGain(); this.sRevIn.gain.value = 0.3; this.sRevIn.connect(this.sRev); this.sRev.connect(this.sfxBus);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
  }
  unlock() {
    this.init(); const c = this.ctx; if (!c) return;
    if (c.state !== 'running') c.resume();
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
  }
  impulse(sec) { const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); } return b; }
  gains() { return { music: this.musicOn ? this.music : 0, sfx: this.sfxOn ? this.sfx : 0 }; }
  apply() { if (!this.ctx) return; const g = this.gains(), t = this.ctx.currentTime; this.musicBus.gain.cancelScheduledValues(t); this.sfxBus.gain.cancelScheduledValues(t); this.musicBus.gain.setValueAtTime(g.music * 0.55, t); this.sfxBus.gain.setValueAtTime(g.sfx, t); }
  // --- music ---
  start(world) { this.init(); if (!this.ctx) return; this.world = world; if (this.playing) return; this.playing = true; this.beat = 0; this.nextT = this.ctx.currentTime + 0.1; this.timer = setInterval(() => this.tick(), 50); }
  stop() { this.playing = false; clearInterval(this.timer); }
  tick() {
    const c = this.ctx; if (!c || !this.playing) return;
    const w = W[this.world % 4], sp = 60 / w.bpm / 2; // eighth notes
    while (this.nextT < c.currentTime + 0.25) { this.eighth(w, this.beat, this.nextT, sp); this.nextT += sp; this.beat++; }
  }
  eighth(w, b, t, sp) {
    const bar = Math.floor(b / 8) % 4, e = b % 8, ch = w.prog[bar], k = w.key;
    if (e === 0) ch.forEach(n => this.tone(mtof(k + n), t, sp * 7.5, 'sine', 0.05, this.musicBus, 0.6));
    if (e % 2 === 0) this.tone(mtof(k - 24 + ch[0] + (e === 6 ? 7 : 0)), t, sp * 1.6, 'triangle', 0.16, this.musicBus, 0.1);
    this.tone(mtof(k + 12 + ch[e % 3] + (e > 3 ? 12 : 0)), t, sp * 0.8, 'sine', 0.035, this.musicBus, 0.4);
    // melody: deterministic phrase per bar
    const seed = (bar * 7 + e * 3 + this.world * 5) % 11;
    if ([0, 3, 5, 6].includes(e) || (seed > 7 && e % 2)) {
      const deg = (seed + bar * 2 + (e > 4 ? 2 : 0)) % w.scale.length, oct = seed % 3 === 0 ? 12 : 0;
      this.tone(mtof(k + 12 + w.scale[deg] + oct), t, sp * (e === 6 ? 2 : 1.1), w.lead, w.lead === 'sawtooth' || w.lead === 'square' ? 0.025 : 0.06, this.musicBus, 0.5);
    }
    if (e === 0 || e === 4) this.kick(t); if (e === 2 || e === 6) this.hat(t, 0.05, this.musicBus); if (e === 4) this.hat(t, 0.08, this.musicBus, 1800);
  }
  tone(f, t, dur, type, vol, bus, rev = 0, slide) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); if (rev) { const s = c.createGain(); s.gain.value = rev; g.connect(s); s.connect(bus === this.musicBus ? this.mRevIn : this.sRevIn); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  kick(t) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.15); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.25); }
  hat(t, vol, bus, freq = 7000, dur = 0.05) { const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; f.type = freq > 5000 ? 'highpass' : 'bandpass'; f.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02); }
  // --- sfx ---
  sfxPlay(name, p = 0) {
    const c = this.ctx; if (!c || c.state !== 'running') return; const t = c.currentTime, B = this.sfxBus;
    if (name === 'jump') this.tone(320 + p * 80, t, 0.14, 'triangle', 0.18, B, 0.1, 620 + p * 120);
    else if (name === 'land') this.hat(t, 0.12, B, 900, 0.07);
    else if (name === 'switch') { this.hat(t, 0.16, B, 2500, 0.18); this.tone(p === 2 ? 660 : p === 3 ? 880 : 520, t, 0.15, 'sine', 0.12, B, 0.3, p === 2 ? 990 : 780); }
    else if (name === 'gem') [0, 4, 7, 12].forEach((n, i) => this.tone(mtof(84 + n), t + i * 0.05, 0.3, 'sine', 0.12, B, 0.6));
    else if (name === 'boost') this.tone(400, t, 0.3, 'sawtooth', 0.05, B, 0.3, 1200);
    else if (name === 'pad') this.tone(200, t, 0.35, 'square', 0.07, B, 0.3, 900);
    else if (name === 'grav') this.tone(900, t, 0.4, 'sine', 0.12, B, 0.5, 220);
    else if (name === 'shatter') { this.hat(t, 0.4, B, 3000, 0.35); this.tone(180, t, 0.3, 'square', 0.08, B, 0.2, 50); }
    else if (name === 'finish') [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(mtof(72 + n), t + i * 0.07, 0.6, 'triangle', 0.1, B, 0.6));
    else if (name === 'click') this.tone(700, t, 0.06, 'sine', 0.08, B);
    else if (name === 'star') this.tone(mtof(88 + p * 3), t, 0.4, 'sine', 0.12, B, 0.6);
  }
}
