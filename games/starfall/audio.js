/* STARFALL audio: procedural Web Audio SFX + generative ambient music. No audio files.
 * Two channels (effects, music) with their own on/off + volume, plus mute-all: see setMix().
 * unlock() must be called from a user gesture (iOS). setWorld() retunes the music and the reveal scale.
 */
const WORLD_TUNING = {
  // root (Hz) for reveal ticks + timbre; pad chords as semitone offsets from padRoot
  moon:   { tickRoot: 880, tickType: 'sine', partial: 3.01, padRoot: 146.83, chords: [[0, 7, 14, 19], [-3, 4, 12, 16], [-5, 2, 10, 14], [-1, 7, 11, 18]] },
  planet: { tickRoot: 660, tickType: 'triangle', partial: 2.0, padRoot: 130.81, chords: [[0, 7, 16, 23], [5, 12, 16, 21], [-3, 7, 12, 19], [2, 9, 14, 17]] },
  giant:  { tickRoot: 440, tickType: 'triangle', partial: 1.5, padRoot: 110.0, chords: [[0, 7, 15, 22], [-4, 3, 12, 19], [-2, 5, 14, 17], [-7, 3, 10, 15]] },
};
const PENTA = [0, 2, 4, 7, 9];

export const Sfx = (() => {
  /* Signal graph (every source goes through exactly one channel gain, so 0 there is true silence):
   *   sfx voices   -> sfxIn   -> sfxGain   -> master -> compressor -> destination
   *   sfx sends    -> sfxWet  -> sfxVerb  -> sfxGain
   *   music voices -> musicIn -> musicGain -> master
   *   music sends  -> musicWet -> musicVerb -> musicGain
   * The reverb used to be one shared send straight into master, so turning music down to 0 left the pad drone
   * playing through the reverb (and the drone itself was never stopped). */
  let ctx = null, master = null, noiseBuf = null;
  const ch = { sfx: { in: null, wet: null, gain: null }, music: { in: null, wet: null, gain: null } };
  let muteAll = false, sfxOn = true, sfxVol = 0.8, musicOn = true, musicVol = 0.6, world = 'planet';
  let musicTimer = 0, nextChordAt = 0, nextChimeAt = 0, chordIdx = 0, padVoices = [];
  let sfxSources = 0, musicSources = 0;
  // levels are scaled so the default mix (music 60%, effects 80%) sounds exactly like the old one
  // (old: effects bus 0.85, music 0.22 x 45%, reverb send 0.34 straight to master)
  const SFX_DEFAULT = 0.8, MUSIC_DEFAULT = 0.6;
  const LEVEL = { sfx: 0.85 / SFX_DEFAULT, music: 0.22 * 0.45 / MUSIC_DEFAULT }, WET = { sfx: 0.34 / SFX_DEFAULT, music: 0.34 / MUSIC_DEFAULT };
  const clamp01 = v => { v = Number(v); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; };
  const sfxTarget = () => (muteAll || !sfxOn) ? 0 : sfxVol;
  const musicTarget = () => (muteAll || !musicOn) ? 0 : musicVol;
  const sfxAudible = () => sfxTarget() > 0;
  const musicAudible = () => musicTarget() > 0;

  /** linear ramp that lands exactly on the target (exponential ramps can't reach 0) */
  function rampTo(param, v, secs = 0.04) {
    const t = ctx.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else { const cur = param.value; param.cancelScheduledValues(t); param.setValueAtTime(cur, t); }
    param.linearRampToValueAtTime(v, t + secs);
    param.setValueAtTime(v, t + secs + 0.001);
  }
  function applyGains(instant) {
    if (!ctx) return;
    if (instant) { ch.sfx.gain.gain.value = sfxTarget(); ch.music.gain.gain.value = musicTarget(); }
    else { rampTo(ch.sfx.gain.gain, sfxTarget()); rampTo(ch.music.gain.gain, musicTarget()); }
    if (!musicAudible()) stopPads();
    else if (!padVoices.length) nextChordAt = Math.min(nextChordAt, ctx.currentTime + 0.1);  // music back on: start a chord now
  }
  function stopPads() {
    if (!ctx) return; const t = ctx.currentTime;
    for (const v of padVoices) { try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.05); v.o.stop(t + 0.5); } catch (e) { /* ignore */ } }
    padVoices = [];
  }

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 2.8);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.0); }
      for (const name of ['sfx', 'music']) {
        const C = ch[name];
        C.gain = ctx.createGain(); C.gain.connect(master);
        C.in = ctx.createGain(); C.in.gain.value = LEVEL[name]; C.in.connect(C.gain);
        const verb = ctx.createConvolver(); verb.buffer = ir;
        C.wet = ctx.createGain(); C.wet.gain.value = WET[name]; C.wet.connect(verb); verb.connect(C.gain);
      }
      applyGains(true);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); // iOS unlock (one silent sample)
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend(); else ctx.resume();
      });
      startMusic();
    }
    if (ctx.state !== 'running' && !document.hidden) ctx.resume();
  }
  const now = () => ctx ? ctx.currentTime : 0;
  const live = () => !!ctx && sfxAudible();
  /** one voice on a channel: osc/noise -> env gain -> channel in (+ reverb send to that channel's reverb) */
  function voice(g, sendWet, chan) {
    const C = ch[chan]; g.connect(C.in);
    if (sendWet) { const s = ctx.createGain(); s.gain.value = sendWet; g.connect(s); s.connect(C.wet); }
    if (chan === 'sfx') sfxSources++; else musicSources++;
  }
  function tone(freq, t, dur, { type = 'sine', gain = 0.2, attack = 0.004, sendWet = 0.4, freqEnd = null, chan = 'sfx', detune = 0 } = {}) {
    if (!ctx || (chan === 'sfx' ? !sfxAudible() : !musicAudible())) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (detune) o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); voice(g, sendWet, chan);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, { type = 'bandpass', f0 = 2000, f1 = null, q = 1, gain = 0.2, attack = 0.005, sendWet = 0.3 } = {}) {
    if (!live()) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); voice(g, sendWet, 'sfx');
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }
  const penta = (root, step) => root * Math.pow(2, (PENTA[step % 5] + 12 * Math.floor(step / 5)) / 12);

  /* ---------------- music: slow pad chords + sparse pentatonic chimes, retuned per world */
  function startMusic() {
    if (!ctx || musicTimer) return;
    nextChordAt = now() + 0.3; nextChimeAt = now() + 3;
    musicTimer = setInterval(scheduleMusic, 400);
    scheduleMusic();
  }
  function scheduleMusic() {
    if (!ctx || ctx.state !== 'running') return;
    if (!musicAudible()) { if (padVoices.length) stopPads(); return; }
    const t = now(), W = WORLD_TUNING[world];
    if (t + 0.6 >= nextChordAt) {
      const at = Math.max(nextChordAt, t + 0.05), len = 9.5;
      const chord = W.chords[chordIdx++ % W.chords.length];
      for (const v of padVoices) { try { v.g.gain.cancelScheduledValues(at); v.g.gain.setTargetAtTime(0.0001, at, 1.4); v.o.stop(at + 6); } catch (e) { /* ignore */ } }
      padVoices = [];
      chord.forEach((semi, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = W.padRoot * Math.pow(2, semi / 12); o.detune.value = (Math.random() - 0.5) * 10;
        lp.type = 'lowpass'; lp.frequency.value = 700 + i * 180; lp.Q.value = 0.4;
        g.gain.setValueAtTime(0.0001, at); g.gain.setTargetAtTime(i === 0 ? 0.22 : 0.10, at, 1.6);
        o.connect(lp); lp.connect(g); voice(g, 0.9, 'music');
        o.start(at); padVoices.push({ o, g });
      });
      nextChordAt = at + len;
    }
    if (t + 0.6 >= nextChimeAt) {
      const at = Math.max(nextChimeAt, t + 0.05);
      const step = 5 + Math.floor(Math.random() * 8);
      const f = penta(W.padRoot * 4, step);
      tone(f, at, 2.6, { type: 'sine', gain: 0.05, attack: 0.01, sendWet: 1.0, chan: 'music' });
      if (Math.random() < 0.4) tone(penta(W.padRoot * 4, step + 2), at + 0.38, 2.2, { type: 'sine', gain: 0.035, attack: 0.01, sendWet: 1.0, chan: 'music' });
      nextChimeAt = at + 2.5 + Math.random() * 4.5;
    }
  }

  return {
    unlock,
    get ready() { return !!ctx && ctx.state === 'running'; },
    /** channel mixer. Any of: { muteAll, sfxOn, sfxVol, musicOn, musicVol } (volumes 0..1). Applies instantly. */
    setMix(m = {}) {
      if ('muteAll' in m) muteAll = !!m.muteAll;
      if ('sfxOn' in m) sfxOn = !!m.sfxOn;
      if ('musicOn' in m) musicOn = !!m.musicOn;
      if ('sfxVol' in m) sfxVol = clamp01(m.sfxVol);
      if ('musicVol' in m) musicVol = clamp01(m.musicVol);
      applyGains(false);
    },
    get mix() { return { muteAll, sfxOn, sfxVol, musicOn, musicVol }; },
    /** for ?debug tests */
    debug() {
      return { ctx: ctx ? ctx.state : null, sfxGain: ch.sfx.gain ? ch.sfx.gain.gain.value : null, musicGain: ch.music.gain ? ch.music.gain.gain.value : null,
        master: master ? master.gain.value : null, sfxSources, musicSources, padVoices: padVoices.length, sfxTarget: sfxTarget(), musicTarget: musicTarget() };
    },
    setWorld(w) { if (WORLD_TUNING[w] && w !== world) { world = w; chordIdx = 0; if (ctx) nextChordAt = Math.min(nextChordAt, now() + 0.4); } },
    /** reveal cascade: steps climb a pentatonic scale in the world's timbre */
    tick(delay, step) {
      if (!live()) return; const t = now() + delay, W = WORLD_TUNING[world];
      const f = penta(W.tickRoot, Math.min(step, 14));
      tone(f, t, 0.09, { type: W.tickType, gain: 0.075, sendWet: 0.3 });
      tone(f * W.partial, t, 0.05, { gain: 0.022, sendWet: 0.25 });
    },
    /** a big flood also gets a soft airy whoosh, scaled by how much opened */
    sweep(cells, dur) {
      if (!live() || cells < 25) return; const t = now();
      noise(t, Math.max(0.5, dur + 0.4), { type: 'bandpass', f0: 500, f1: 3500, q: 0.8, gain: Math.min(0.09, 0.02 + cells / 4000), attack: 0.12, sendWet: 0.6 });
    },
    flag(on) {
      if (!live()) return; const t = now();
      if (on) {
        tone(1320, t, 0.05, { type: 'square', gain: 0.025, sendWet: 0 });
        tone(740, t + 0.01, 0.14, { gain: 0.13 }); tone(1110, t + 0.06, 0.24, { gain: 0.11 }); tone(1480, t + 0.06, 0.2, { type: 'triangle', gain: 0.03 });
      } else { tone(880, t, 0.09, { gain: 0.08 }); tone(590, t + 0.05, 0.14, { gain: 0.07 }); }
    },
    deny() { if (!live()) return; tone(180, now(), 0.12, { type: 'square', gain: 0.025, sendWet: 0 }); },
    ui() { if (!live()) return; tone(1500, now(), 0.04, { type: 'sine', gain: 0.03, sendWet: 0.1 }); },
    chord() { if (!live()) return; const t = now(); tone(520, t, 0.1, { type: 'triangle', gain: 0.07 }); tone(780, t + 0.03, 0.12, { type: 'triangle', gain: 0.06 }); },
    shield() {
      if (!live()) return; const t = now();
      noise(t, 0.5, { type: 'highpass', f0: 3000, q: 0.7, gain: 0.22, attack: 0.002, sendWet: 0.5 });
      [1760, 1318, 988, 740].forEach((f, i) => tone(f, t + i * 0.055, 0.35, { type: 'triangle', gain: 0.06, sendWet: 0.6 }));
      tone(220, t, 0.5, { gain: 0.18, freqEnd: 110, sendWet: 0.2 });
    },
    explode() {
      if (!live()) return; const t = now();
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(90, t + 2.2);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      src.connect(lp); lp.connect(g); voice(g, 0.6, 'sfx');
      src.start(t); src.stop(t + 3);
      tone(110, t, 1.6, { gain: 0.7, freqEnd: 28, sendWet: 0.2 });
      tone(55, t + 0.02, 2.2, { type: 'triangle', gain: 0.35, freqEnd: 22, sendWet: 0.1 });
    },
    /** Zen run end: no explosion, a low settling chord */
    fade() {
      if (!live()) return; const t = now();
      [196, 233.08, 293.66].forEach((f, i) => tone(f, t + i * 0.12, 2.6, { type: 'triangle', gain: 0.07, sendWet: 0.8, attack: 0.08 }));
      noise(t, 2.0, { type: 'lowpass', f0: 1200, f1: 200, q: 0.5, gain: 0.08, attack: 0.3, sendWet: 0.6 });
    },
    mine(delay, i) { if (!live()) return; const t = now() + delay; const f = 196 * Math.pow(2, ((i * 5) % 12) / 12); tone(f, t, 0.9, { gain: 0.06, sendWet: 0.8 }); tone(f * 3, t, 0.3, { type: 'triangle', gain: 0.015, sendWet: 0.8 }); },
    win() {
      if (!live()) return; const t = now();
      const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1318.5, 1567.98];
      notes.forEach((f, i) => { tone(f, t + i * 0.085, 1.6, { type: 'triangle', gain: 0.08, sendWet: 0.7 }); tone(f / 2, t + i * 0.085, 0.4, { gain: 0.03 }); });
      [261.63, 329.63, 392.0, 493.88].forEach(f => {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 14;
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(2200, t + 1.5);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
        o.connect(lp); lp.connect(g); voice(g, 0.8, 'sfx');
        o.start(t); o.stop(t + 4.6);
      });
    },
    achievement() {
      if (!live()) return; const t = now();
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.07, 0.9, { type: 'sine', gain: 0.07, sendWet: 0.8 }));
      tone(2637, t + 0.3, 1.2, { type: 'triangle', gain: 0.02, sendWet: 1.0 });
    },
  };
})();
