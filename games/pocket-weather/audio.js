/* Pocket Weather: procedural Web Audio. Music per world with real chord progressions and melodies,
   adaptive weather layers (rain shaker, sun bells, wind flute, snow celesta, storm toms), sound effects and voice blips. */
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n) {               // 'C#5' -> 73
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) return null;
  return 12 * (parseInt(m[3], 10) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function chord(name) {           // 'Am' 'F' 'G7' 'Bb' 'Dm' 'Cmaj7' -> semitone list from root (octave 3)
  const m = /^([A-G][#b]?)(m|maj7|7|sus4|m7)?$/.exec(name);
  const root = midi(m[1] + '3');
  const q = m[2] || '';
  const iv = q === 'm' ? [0, 3, 7] : q === 'maj7' ? [0, 4, 7, 11] : q === '7' ? [0, 4, 7, 10] : q === 'sus4' ? [0, 5, 7] : q === 'm7' ? [0, 3, 7, 10] : [0, 4, 7];
  return iv.map(i => root + i);
}
// Melody strings: one token per eighth note. NOTE = play, '-' = hold, '.' = rest.
function parseMel(s) {
  const out = [], toks = s.trim().split(/\s+/);
  toks.forEach((t, i) => {
    if (t === '-' && out.length) { out[out.length - 1].len++; return; }
    if (t === '.' || t === '-') return;
    out.push({ at: i, m: midi(t), len: 1 });
  });
  return { notes: out, len: toks.length };
}

const SONGS = {
  title: { bpm: 92, beats: 4, swing: 0.08, chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'],
    mel: 'E5 - G5 - A5 G5 E5 - C5 - D5 E5 D5 - . .  F5 - A5 - G5 F5 E5 - D5 - - - . . . .  E5 - G5 - C6 - B5 A5 G5 - E5 - C5 D5 E5 -  F5 - E5 - D5 - C5 - D5 - - - . . . .',
    lead: 'box', bass: 'soft', drums: 0 },
  map: { bpm: 112, beats: 4, swing: 0.12, chords: ['G', 'C', 'D', 'G', 'Em', 'C', 'D', 'D'],
    mel: 'B4 . D5 . G5 - F#5 G5 A5 - G5 . E5 - D5 .  C5 . E5 . G5 - E5 . F#5 - A5 - D5 - . .  B4 . D5 . G5 . B5 . A5 G5 E5 . D5 - B4 .  C5 . E5 G5 A5 - G5 . F#5 - - - . . . .',
    lead: 'flute', bass: 'walk', drums: 1 },
  w0: { bpm: 112, beats: 4, swing: 0.1, chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
    mel: 'E5 . G5 . A5 G5 E5 .  C5 . E5 D5 C5 . A4 .  F5 . A5 . C6 A5 F5 .  G5 . F5 E5 D5 - - .  E5 G5 C6 . B5 G5 E5 .  A5 . G5 E5 C5 . D5 E5  F5 E5 D5 . A4 . C5 D5  G4 . B4 D5 C5 - - .',
    lead: 'ocarina', bass: 'bounce', drums: 1 },
  w1: { bpm: 120, beats: 4, swing: 0.16, chords: ['D', 'C', 'G', 'D', 'Bm', 'C', 'A', 'D'],
    mel: 'A4 D5 F#5 . E5 D5 C5 .  G4 C5 E5 . D5 C5 B4 .  D5 . G5 F#5 E5 D5 B4 .  A4 - - . F#4 G4 A4 .  B4 D5 F#5 . A5 F#5 D5 .  C5 . E5 G5 E5 C5 G4 .  A4 C#5 E5 . G5 F#5 E5 C#5  D5 - - . . . . .',
    lead: 'reed', bass: 'bounce', drums: 2 },
  w2: { bpm: 100, beats: 3, swing: 0, chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C'],
    mel: 'A5 - C6  A5 - F5  F5 - D5  D5 - .  D5 F5 Bb5  A5 - G5  G5 - E5  C5 - .  A5 - C6  E6 - D6  C6 - A5  E5 - .  D5 F5 Bb5  A5 G5 F5  G5 - E5  F5 - .',
    lead: 'celesta', bass: 'waltz', drums: 0 },
  w3: { bpm: 104, beats: 4, swing: 0.14, chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E'],
    mel: 'A4 . C5 E5 . D5 C5 .  A4 . . F4 A4 C5 . .  G4 . C5 E5 . G5 F5 E5  D5 - . B4 - . G4 .  A4 . C5 E5 . A5 G5 E5  F5 . E5 C5 . A4 . .  D5 . F5 A5 . G5 F5 D5  E5 - - G#4 - B4 E5 .',
    lead: 'square', bass: 'funk', drums: 3 },
  w4: { bpm: 116, beats: 4, swing: 0.08, chords: ['Eb', 'Cm', 'Ab', 'Bb', 'Eb', 'Gm', 'Ab', 'Bb'],
    mel: 'G5 . Bb5 . Eb6 - D6 C6  Bb5 - G5 . Eb5 - . .  C6 . Bb5 Ab5 G5 . F5 Eb5  F5 - - . D5 Eb5 F5 .  G5 . Bb5 . Eb6 - F6 G6  F6 - D6 . Bb5 - . .  C6 . Eb6 C6 Ab5 . C6 Bb5  Bb5 - - - . . . .',
    lead: 'ocarina', bass: 'bounce', drums: 2 }
};
Object.keys(SONGS).forEach(k => { SONGS[k].melody = parseMel(SONGS[k].mel); });

export class Audio {
  constructor() {
    this.ctx = null; this.ok = false; this.musicVol = 0.6; this.sfxVol = 0.8;
    this.song = null; this.songName = null; this.layers = { rain: 0, sun: 0, wind: 0, snow: 0, bolt: 0 };
    this.beat = 0; this.nextTime = 0; this.timer = null; this.muted = false;
  }
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const c = this.ctx;
        this.master = c.createGain(); this.master.gain.value = 0.9;
        const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
        this.master.connect(comp); comp.connect(c.destination);
        this.music = c.createGain(); this.music.gain.value = this.musicVol * 0.55; this.music.connect(this.master);
        this.sfx = c.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
        // soft room: a short feedback delay for the music bus
        const d = c.createDelay(1); d.delayTime.value = 0.23; const fb = c.createGain(); fb.gain.value = 0.22;
        const wet = c.createGain(); wet.gain.value = 0.18; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        this.music.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(this.master);
        this.sfx.connect(d);
        const len = c.sampleRate * 1; const buf = c.createBuffer(1, len, c.sampleRate); const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
        this.noise = buf;
        // iOS: play a silent buffer inside the gesture
        const sb = c.createBufferSource(); sb.buffer = c.createBuffer(1, 1, 22050); sb.connect(c.destination); sb.start(0);
        this.ok = true;
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      if (this.songName && !this.timer) this._start();
    } catch (e) { this.ok = false; }
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }
  setVolumes(m, s) {
    this.musicVol = m; this.sfxVol = s;
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(m * 0.55, this.ctx.currentTime, 0.05);
    this.sfx.gain.setTargetAtTime(s, this.ctx.currentTime, 0.05);
  }
  play(name) {
    if (!SONGS[name]) name = 'w0';
    if (this.songName === name) return;
    this.songName = name; this.song = SONGS[name];
    if (!this.ctx) return;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    // quick duck so songs don't collide
    this.music.gain.cancelScheduledValues(this.ctx.currentTime);
    this.music.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.music.gain.linearRampToValueAtTime(this.musicVol * 0.55, this.ctx.currentTime + 0.6);
    this._start();
  }
  _start() {
    if (!this.ctx || !this.song) return;
    this.beat = 0; this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this._tick(), 25);
  }
  stopMusic() { if (this.timer) clearInterval(this.timer); this.timer = null; this.songName = null; }
  bump(layer, amt) { this.layers[layer] = Math.min(1, (this.layers[layer] || 0) + (amt || 1)); }
  _tick() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const S = this.song, eighth = 60 / S.bpm / 2;
    while (this.nextTime < c.currentTime + 0.12) {
      const st = this.beat, t = this.nextTime + ((st % 2) ? S.swing * eighth : 0);
      this._play(st, t, eighth);
      this.beat++; this.nextTime += eighth;
    }
    for (const k in this.layers) this.layers[k] = Math.max(0, this.layers[k] - 0.025 * 0.12);
  }
  _play(st, t, e) {
    const S = this.song, per = S.beats * 2, bar = Math.floor(st / per), inBar = st % per;
    const chordName = S.chords[bar % S.chords.length], ch = chord(chordName), root = ch[0];
    const melLen = S.melody.len, ms = st % melLen;
    // melody
    for (const n of S.melody.notes) if (n.at === ms) this._lead(S.lead, n.m, t, n.len * e * 0.95, 0.16);
    // bass
    const b = S.bass;
    if (b === 'waltz') { if (inBar === 0) this._bass(root - 12, t, e * 1.8); else if (inBar === 2 || inBar === 4) this._chordStab(ch, t, e * 1.2, 0.035); }
    else if (b === 'walk') { if (inBar % 2 === 0) { const walk = [0, 4, 7, 9][(inBar / 2) | 0] || 0; this._bass(root - 12 + walk, t, e * 1.6); } }
    else if (b === 'funk') { if ([0, 3, 6, 7].includes(inBar)) this._bass(root - 12 + (inBar === 6 ? 12 : 0), t, e * 0.8); }
    else if (b === 'soft') { if (inBar === 0) this._bass(root - 12, t, e * 6); }
    else { if (inBar % 4 === 0) this._bass(root - 12, t, e * 1.4); else if (inBar % 4 === 2) this._bass(root - 5, t, e * 0.9); }
    // pad / arpeggio
    if (b !== 'waltz') {
      if (inBar === 0) this._pad(ch, t, e * per * 0.98);
      if (S.lead === 'box' || inBar % 2 === 1) { const a = ch[(st >> 1) % ch.length] + 12; this._pluck(a, t, e * 0.9, 0.04); }
    } else if (inBar === 0) this._pad(ch, t, e * per * 0.98);
    // drums
    const d = S.drums;
    if (d) {
      if (d === 3) { if (inBar === 0 || inBar === 5) this._kick(t); if (inBar === 2 || inBar === 6) this._snare(t, 0.25); }
      else { if (inBar % 4 === 0) this._kick(t); if (d >= 2 && inBar % 4 === 2) this._snare(t, 0.18); }
      if (inBar % 2 === 1) this._hat(t, 0.05);
    }
    // adaptive weather layers
    const L = this.layers;
    if (L.rain > 0.02) { this._hat(t, 0.06 * L.rain, 6000); this._hat(t + e / 2, 0.04 * L.rain, 7000); }
    if (L.sun > 0.02 && inBar % 2 === 0) this._bell(ch[(st >> 1) % ch.length] + 24, t, 0.06 * L.sun);
    if (L.snow > 0.02 && inBar % 3 === 0) this._bell(ch[(st) % ch.length] + 36, t, 0.05 * L.snow);
    if (L.wind > 0.02 && inBar === 0) this._lead('flute', ch[1] + 12, t, e * per * 0.8, 0.05 * L.wind);
    if (L.bolt > 0.02 && (inBar === 0 || inBar === 3)) this._tom(root - 12, t, 0.2 * L.bolt);
  }
  // ── instruments ──
  _env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * 0.6, t + a, dur * 0.4); g.gain.setTargetAtTime(0.0001, t + dur, rel || 0.08);
  }
  _osc(type, f, t, dur, g, out) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.connect(g); o.start(t); o.stop(t + dur + 0.6); return o;
  }
  _lead(kind, m, t, dur, vol) {
    const c = this.ctx, g = c.createGain(), f = hz(m);
    g.connect(this.music);
    if (kind === 'celesta' || kind === 'box') { this._bell(m, t, vol * 1.1, this.music); return; }
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'square' ? 1800 : 2600; lp.connect(g);
    this._env(g, t, kind === 'flute' ? 0.05 : 0.012, vol, dur, 0.09);
    const type = kind === 'square' ? 'square' : kind === 'reed' ? 'sawtooth' : 'triangle';
    const o = this._osc(type, f, t, dur, lp);
    const o2 = this._osc('sine', f * 2, t, dur, lp); const g2 = c.createGain(); g2.gain.value = 0.25; o2.disconnect(); o2.connect(g2); g2.connect(lp);
    if (kind === 'reed') lp.frequency.value = 1500;
    // gentle vibrato after the attack
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.25);
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.3);
  }
  _bell(m, t, vol, out) {
    const c = this.ctx, g = c.createGain(); g.connect(out || this.music);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    const f = hz(m); this._osc('sine', f, t, 1.2, g);
    const g2 = c.createGain(); g2.gain.value = 0.3; g2.connect(g); this._osc('sine', f * 2.76, t, 0.5, g2);
  }
  _pluck(m, t, dur, vol) {
    const c = this.ctx, g = c.createGain(); g.connect(this.music);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    this._osc('triangle', hz(m), t, dur + 0.2, g);
  }
  _pad(ch, t, dur) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    lp.connect(g); g.connect(this.music);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + 0.25); g.gain.setTargetAtTime(0.0001, t + dur - 0.1, 0.2);
    ch.forEach((m, i) => { const o = this._osc('sawtooth', hz(m + 12), t, dur, lp); o.detune.value = (i % 2 ? 7 : -7); });
  }
  _chordStab(ch, t, dur, vol) { ch.forEach(m => this._pluck(m + 12, t, dur, vol)); }
  _bass(m, t, dur) {
    const c = this.ctx, g = c.createGain(); g.connect(this.music);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.01); g.gain.setTargetAtTime(0.0001, t + dur * 0.7, 0.06);
    this._osc('triangle', hz(m), t, dur, g);
    const g2 = c.createGain(); g2.gain.value = 0.5; g2.connect(g); this._osc('sine', hz(m), t, dur, g2);
  }
  _noise(t, dur, vol, type, freq, q, out) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out || this.music);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    return { src, f, g };
  }
  _kick(t) {
    const c = this.ctx, g = c.createGain(); g.connect(this.music);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    const o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    o.connect(g); o.start(t); o.stop(t + 0.3);
  }
  _snare(t, vol) { this._noise(t, 0.16, vol, 'bandpass', 1800, 0.8); }
  _hat(t, vol, f) { this._noise(t, 0.05, vol, 'highpass', f || 8000, 0.7); }
  _tom(m, t, vol) {
    const c = this.ctx, g = c.createGain(); g.connect(this.music);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const o = c.createOscillator(); o.frequency.setValueAtTime(hz(m) * 2, t); o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.3);
    o.connect(g); o.start(t); o.stop(t + 0.45);
  }
  // ── sound effects ──
  _fx(fn) { if (!this.ok || !this.ctx || this.ctx.state !== 'running') return; try { fn(this.ctx.currentTime + 0.005); } catch (e) { /* never break the game for a sound */ } }
  tone(f0, f1, dur, type, vol, delay) {
    this._fx(t => {
      t += delay || 0;
      const c = this.ctx, g = c.createGain(); g.connect(this.sfx);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.9);
      o.connect(g); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  arp(notes, gap, type, vol, len) { notes.forEach((m, i) => this.tone(hz(m), hz(m), len || 0.25, type || 'triangle', vol || 0.12, i * gap)); }
  sfxNoise(dur, vol, type, f0, f1, q) {
    this._fx(t => {
      const n = this._noise(t, dur, vol, type, f0, q, this.sfx);
      if (f1) n.f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(0.0001, t); n.g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); n.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    });
  }
  ui() { this.tone(900, 1200, 0.07, 'sine', 0.08); }
  back() { this.tone(700, 500, 0.08, 'sine', 0.08); }
  sun() { this.arp([79, 83, 86, 91], 0.05, 'sine', 0.1, 0.5); this.bump('sun'); }
  rainStart() { this.sfxNoise(0.9, 0.12, 'bandpass', 1200, 4000, 0.6); }
  rain() { this.sfxNoise(1.6, 0.16, 'highpass', 3000, 2000, 0.5); for (let i = 0; i < 6; i++) this.tone(1200 + Math.random() * 1400, 900, 0.08, 'sine', 0.05, 0.1 + i * 0.13); this.bump('rain'); }
  snow() { for (let i = 0; i < 7; i++) this.tone(hz(84 + [0, 4, 7, 12, 16, 19, 24][i]), 0, 0.5, 'sine', 0.05, i * 0.08); this.sfxNoise(1.2, 0.05, 'highpass', 6000, 9000); this.bump('snow'); }
  wind() { this.sfxNoise(0.9, 0.22, 'bandpass', 300, 1400, 1.5); this.tone(500, 900, 0.5, 'sine', 0.03); this.bump('wind'); }
  bolt() { this.sfxNoise(0.25, 0.5, 'highpass', 2000, 800); this.sfxNoise(1.4, 0.4, 'lowpass', 300, 60, 0.8); this.tone(90, 40, 1.0, 'sine', 0.35); this.bump('bolt'); }
  grow() { this.tone(220, 880, 0.35, 'sine', 0.14); this.tone(330, 1320, 0.3, 'triangle', 0.05, 0.05); }
  boing() { this.tone(200, 600, 0.22, 'sine', 0.16); this.tone(600, 300, 0.2, 'sine', 0.08, 0.18); }
  melt() { this.arp([88, 84, 79, 76], 0.06, 'sine', 0.07, 0.3); }
  fill() { this.tone(300, 700, 0.18, 'sine', 0.14); this.tone(500, 900, 0.15, 'sine', 0.08, 0.12); }
  mud() { this.tone(160, 90, 0.3, 'sawtooth', 0.04); this.sfxNoise(0.3, 0.08, 'lowpass', 400, 200); }
  dry() { this.sfxNoise(0.4, 0.06, 'highpass', 4000, 8000); this.tone(1200, 1600, 0.12, 'sine', 0.04); }
  douse() { this.sfxNoise(0.7, 0.18, 'highpass', 2500, 6000); }
  freeze() { this.arp([96, 91, 100, 103], 0.04, 'sine', 0.06, 0.4); }
  open() { this.arp([67, 71, 74, 79], 0.07, 'triangle', 0.1, 0.35); }
  creak() { this.tone(180, 240, 0.4, 'sawtooth', 0.03); }
  push() { this.sfxNoise(0.5, 0.1, 'bandpass', 600, 300); this.tone(300, 200, 0.2, 'sine', 0.06); }
  power() { this.tone(80, 640, 0.6, 'sawtooth', 0.06); this.arp([72, 76, 79, 84], 0.06, 'square', 0.04, 0.2); }
  shatter() { this.sfxNoise(0.5, 0.3, 'bandpass', 900, 300, 0.5); this.tone(200, 60, 0.4, 'square', 0.06); }
  ignite() { this.sfxNoise(0.8, 0.15, 'lowpass', 600, 2000); }
  rainbow() { this.arp([72, 76, 79, 83, 86, 88, 91, 95], 0.07, 'sine', 0.09, 0.8); }
  splash() { this.sfxNoise(0.4, 0.2, 'bandpass', 1500, 500, 0.7); this.tone(400, 150, 0.25, 'sine', 0.12); }
  step(i) { this.tone(i % 2 ? 520 : 440, i % 2 ? 480 : 400, 0.05, 'sine', 0.035); }
  hop() { this.tone(300, 700, 0.12, 'sine', 0.07); }
  drop() { this.arp([84, 88, 91, 96], 0.06, 'square', 0.05, 0.25); this.arp([84, 88, 91, 96], 0.06, 'sine', 0.08, 0.4); }
  glide() { this.tone(400, 1000, 0.8, 'sine', 0.06); this.sfxNoise(1.0, 0.1, 'bandpass', 500, 1500, 1); }
  nope() { this.tone(300, 260, 0.12, 'sine', 0.06); this.tone(260, 220, 0.14, 'sine', 0.06, 0.1); }
  fanfare() { this.arp([72, 76, 79, 84], 0.1, 'triangle', 0.13, 0.4); this.arp([79, 84, 88, 91], 0.1, 'sine', 0.07, 0.8); this.tone(hz(96), hz(96), 1.2, 'sine', 0.06, 0.45); }
  star() { this.arp([91, 95, 98, 103], 0.05, 'sine', 0.07, 0.6); }
  // Sprig's little voice: a few chirps shaped by mood
  voice(mood) {
    const shapes = { happy: [[0, 4], [4, 7], [7, 12]], ask: [[0, 2], [2, 9]], sad: [[5, 2], [2, -3]], wow: [[0, 12], [12, 7], [7, 14]], hum: [[0, 0], [4, 4], [2, 2], [7, 7]], cold: [[0, 1], [1, 0], [0, 1], [1, 0]] };
    const sh = shapes[mood] || shapes.happy, base = 76 + Math.floor(Math.random() * 3);
    sh.forEach((p, i) => this.tone(hz(base + p[0]), hz(base + p[1]), mood === 'hum' ? 0.18 : 0.09, mood === 'hum' ? 'sine' : 'triangle', mood === 'hum' ? 0.04 : 0.07, i * (mood === 'hum' ? 0.2 : 0.085)));
  }
}
