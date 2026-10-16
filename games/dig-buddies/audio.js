// Procedural audio. Every source ends in musicGain or sfxGain (reverb sends included), so 0 is truly silent.
export const Audio = { ctx: null, musicGain: null, sfxGain: null, settings: { musicOn: true, musicVol: 0.7, sfxOn: true, sfxVol: 0.8 }, area: -1, playing: false };
let ctx, mBus, sBus, noiseBuf, nextT = 0, step = 0, timer = null;
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
function ir(sec, decay) { const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return b; }
function bus(out, wet) { const g = ctx.createGain(); const dry = ctx.createGain(); dry.gain.value = 1; const send = ctx.createGain(); send.gain.value = wet; const cv = ctx.createConvolver(); cv.buffer = ir(1.8, 3); g.connect(dry).connect(out); g.connect(send).connect(cv).connect(out); return g; }
export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  ctx = Audio.ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  Audio.musicGain = ctx.createGain(); Audio.sfxGain = ctx.createGain(); Audio.musicGain.connect(master); Audio.sfxGain.connect(master);
  mBus = bus(Audio.musicGain, 0.22); sBus = bus(Audio.sfxGain, 0.15);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applySettings();
  return ctx;
}
export function unlock() {
  const c = initAudio(); if (!c) return;
  if (c.state !== 'running') c.resume();
  const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(Audio.sfxGain); s.start(0);
}
export function applySettings(s) {
  if (s) Object.assign(Audio.settings, s); if (!ctx) return;
  const S = Audio.settings, mv = S.musicOn ? S.musicVol : 0, sv = S.sfxOn ? S.sfxVol : 0;
  const set = (g, v) => { const val = v <= 0 ? 0 : v * v * 0.9; g.gain.cancelScheduledValues(0); g.gain.setValueAtTime(val, ctx.currentTime); g.gain.value = val; };
  set(Audio.musicGain, mv); set(Audio.sfxGain, sv);
}
function env(g, t, a, peak, dec, sus = 0) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + dec); }
function tone(out, t, freq, { type = 'triangle', a = 0.005, dec = 0.25, vol = 0.2, detune = 0, slide = 0, filt = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + a + dec);
  let n = o; if (filt) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt; o.connect(f); n = f; }
  n.connect(g); g.connect(out); env(g, t, a, vol, dec); o.start(t); o.stop(t + a + dec + 0.05);
}
function noise(out, t, { dur = 0.1, vol = 0.2, type = 'bandpass', f = 2000, q = 1, f2 = 0 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); const g = ctx.createGain(); s.connect(fl).connect(g).connect(out); env(g, t, 0.004, vol, dur); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
// ---- music: per area tempo, instrument, chord progression and a hand-written melody (scale degrees, 8th notes) ----
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
const SONGS = [
  { bpm: 116, root: 60, scale: MAJ, prog: [0, 5, 3, 4], lead: 'pluck', mel: '4.5.4.2.0...|2.3.4.7.6.4...|5.5.4.3.4.2.0.|1.2.3.4.4...--|4.5.4.2.0...|2.3.4.7.9.7...|8.7.6.4.5.6.4.|4...........--' },
  { bpm: 100, root: 65, scale: MAJ, prog: [0, 2, 3, 4], lead: 'uke', mel: '0.2.4..4.5.4..|2.4.6..6.5.4..|3.4.5..7.5.3..|4.3.2..1.2....|0.2.4..4.5.4..|7.6.4..2.4.5..|5.4.3..2.1.2..|0.............' },
  { bpm: 92, root: 57, scale: MIN, prog: [0, 5, 2, 6], lead: 'box', mel: '7.6.4.2.4...0.|2.4.5.4.2.....|7.6.4.2.4...9.|8.7.6.7.4.....|4.5.7.9.7.5.4.|2.4.5.4.2.0...|7.6.4.2.4.7.9.|7.............' },
  { bpm: 84, root: 62, scale: MAJ, prog: [0, 3, 5, 4], lead: 'bell', mel: '4...5.4.2...0.|1.2.4...2.....|5...6.5.3...1.|4.5.6.7.6.....|4...5.4.2...0.|1.2.4...7.6.4.|5.6.5.4.2.1.2.|0.............' },
  { bpm: 108, root: 67, scale: MAJ, prog: [0, 4, 5, 3], lead: 'pluck', mel: '0.2.4.7...4...|5.4.2.4.......|0.2.4.7...9...|8.7.6.7.......|7.6.5.4...2...|3.4.5.2.......|1.2.3.4...6.5.|4.............' },
];
function parseMel(s) { const bars = s.split('|'); const out = []; for (const bar of bars) { for (let k = 0; k < 16; k++) { const ch = bar[k] || '-'; out.push(/\d/.test(ch) ? +ch : ch === '.' ? null : null); } } return out; }
SONGS.forEach(s => s.notes = parseMel(s.mel.replace(/(\d)\./g, '$1.')));
function deg(song, d, oct = 0) { const n = song.scale.length; return song.root + 12 * (Math.floor(d / n) + oct) + song.scale[((d % n) + n) % n]; }
function lead(song, t, midi, len) {
  const f = NOTE(midi);
  if (song.lead === 'pluck') { tone(mBus, t, f, { type: 'square', dec: 0.18 * len + 0.05, vol: 0.07, filt: 2600 }); tone(mBus, t, f, { type: 'triangle', dec: 0.25 * len + 0.1, vol: 0.12 }); }
  else if (song.lead === 'uke') { tone(mBus, t, f, { type: 'sawtooth', dec: 0.3, vol: 0.08, filt: 1800 }); tone(mBus, t, f * 2, { type: 'sine', dec: 0.12, vol: 0.04 }); }
  else if (song.lead === 'box') { tone(mBus, t, f * 2, { type: 'sine', dec: 0.6, vol: 0.13 }); tone(mBus, t, f * 4, { type: 'sine', dec: 0.2, vol: 0.03 }); }
  else { tone(mBus, t, f * 2, { type: 'sine', dec: 0.9, vol: 0.12 }); tone(mBus, t, f * 5.4, { type: 'sine', dec: 0.25, vol: 0.025 }); }
}
function tick() {
  if (!ctx || !Audio.playing) return;
  const song = SONGS[Audio.area] || SONGS[4], spb = 60 / song.bpm / 2; // 8th note
  while (nextT < ctx.currentTime + 0.15) {
    const t = nextT, s = step % song.notes.length, bar = Math.floor(s / 16) % song.prog.length, beat = s % 16;
    const ch = song.prog[(Math.floor(step / 16)) % song.prog.length];
    if (beat % 4 === 0) tone(mBus, t, NOTE(deg(song, ch, -2)), { type: 'triangle', dec: spb * 3, vol: 0.16 });
    if (beat % 4 === 2) tone(mBus, t, NOTE(deg(song, ch + 4, -2)), { type: 'triangle', dec: spb * 1.5, vol: 0.09 });
    if (beat % 2 === 1 || (song.lead === 'pluck' && beat % 4 === 2)) for (const k of [0, 2, 4]) tone(mBus, t, NOTE(deg(song, ch + k, -1)), { type: 'sine', dec: spb * 0.9, vol: 0.035 });
    if (beat % 8 === 0) tone(mBus, t, 120, { type: 'sine', dec: 0.15, vol: 0.18, slide: 0.4 });
    if (beat % 2 === 1) noise(mBus, t, { dur: 0.04, vol: song.lead === 'bell' ? 0.05 : 0.035, type: 'highpass', f: 7000 });
    if (beat % 8 === 4) noise(mBus, t, { dur: 0.09, vol: 0.06, f: 1800, q: 0.7 });
    const m = song.notes[s]; if (m !== null && m !== undefined) { let len = 1; while (song.notes[(s + len) % song.notes.length] === null && len < 4) len++; lead(song, t, deg(song, m, 0), len); }
    nextT += spb; step++;
  }
}
export function playMusic(area) {
  if (!initAudio()) return;
  if (Audio.playing && Audio.area === area) return;
  Audio.area = area; Audio.playing = true; step = 0; nextT = ctx.currentTime + 0.1;
  if (!timer) timer = setInterval(tick, 40);
}
export function stopMusic() { Audio.playing = false; }
// ---- sound effects ----
const PENTA = [0, 2, 4, 7, 9];
export function sfx(name, p = 0) {
  if (!ctx || ctx.state !== 'running') return; const t = ctx.currentTime + 0.005;
  switch (name) {
    case 'dig': { const st = Math.min(p, 24), n = 72 + PENTA[st % 5] + 12 * Math.floor(st / 5) * 0.5; noise(sBus, t, { dur: 0.07, vol: 0.18, f: 900 + st * 60, q: 1.2, f2: 400 }); tone(sBus, t + 0.01, NOTE(Math.min(n, 100)), { type: 'triangle', dec: 0.12, vol: 0.11, slide: 1.3 }); break; }
    case 'flag': tone(sBus, t, 300, { type: 'square', dec: 0.04, vol: 0.06, filt: 1500 }); tone(sBus, t + 0.03, 520, { type: 'triangle', dec: 0.25, vol: 0.13, slide: 1.6 }); break;
    case 'unflag': tone(sBus, t, 600, { type: 'triangle', dec: 0.15, vol: 0.1, slide: 0.6 }); break;
    case 'poof': noise(sBus, t, { dur: 0.55, vol: 0.35, type: 'lowpass', f: 3000, f2: 200 }); tone(sBus, t, 180, { type: 'sine', dec: 0.4, vol: 0.3, slide: 0.35 }); tone(sBus, t + 0.12, 660, { type: 'square', dec: 0.2, vol: 0.05, slide: 0.5, filt: 1800 }); break;
    case 'coin': tone(sBus, t, NOTE(83), { type: 'square', dec: 0.08, vol: 0.06, filt: 4000 }); tone(sBus, t + 0.07, NOTE(88), { type: 'square', dec: 0.35, vol: 0.07, filt: 4000 }); break;
    case 'heart': [76, 72, 67].forEach((n, k) => tone(sBus, t + k * 0.12, NOTE(n), { type: 'triangle', dec: 0.2, vol: 0.13 })); break;
    case 'chord': [0, 4, 7, 12].forEach((n, k) => tone(sBus, t + k * 0.035, NOTE(76 + n), { type: 'triangle', dec: 0.15, vol: 0.09 })); break;
    case 'star': [0, 7, 12, 19].forEach((n, k) => tone(sBus, t + k * 0.05, NOTE(84 + n + p * 2), { type: 'sine', dec: 0.3, vol: 0.09 })); break;
    case 'sniff': for (let k = 0; k < 3; k++) noise(sBus, t + k * 0.11, { dur: 0.07, vol: 0.2, type: 'highpass', f: 2500 + k * 300 }); tone(sBus, t + 0.4, NOTE(84), { type: 'sine', dec: 0.3, vol: 0.1, slide: 1.5 }); break;
    case 'click': tone(sBus, t, 880, { type: 'triangle', dec: 0.05, vol: 0.08 }); break;
    case 'pop': tone(sBus, t, 500 + p * 40, { type: 'sine', dec: 0.08, vol: 0.12, slide: 2 }); break;
    case 'win': { const m = [72, 76, 79, 84, 79, 84, 88]; const d = [0, .12, .24, .36, .6, .72, .84]; m.forEach((n, k) => { tone(sBus, t + d[k], NOTE(n), { type: 'square', dec: k === 6 ? 0.8 : 0.16, vol: 0.06, filt: 3000 }); tone(sBus, t + d[k], NOTE(n), { type: 'triangle', dec: k === 6 ? 0.9 : 0.2, vol: 0.12 }); }); [60, 64, 67].forEach(n => tone(sBus, t + 0.84, NOTE(n), { type: 'triangle', dec: 1.2, vol: 0.08 })); break; }
    case 'lose': [67, 66, 65, 64].forEach((n, k) => tone(sBus, t + k * 0.22, NOTE(n), { type: 'triangle', dec: k === 3 ? 0.8 : 0.2, vol: 0.12, slide: k === 3 ? 0.8 : 1 })); break;
    case 'gasp': noise(sBus, t, { dur: 0.15, vol: 0.08, f: 1500, q: 3, f2: 3000 }); break;
  }
}
