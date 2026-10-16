// ===== Procedural audio: two channels (music, sfx); every source incl. reverb goes through its channel gain =====
var Audio2 = (function () {
  var A = { ctx: null, ready: false, music: 0.7, sfx: 0.8, bus: {}, biome: 0, night: 0 };
  function mkReverb(ctx, secs, decay) {
    var len = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = b.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    var cv = ctx.createConvolver(); cv.buffer = b; return cv;
  }
  function mkChannel(name, vol) {
    var ctx = A.ctx, out = ctx.createGain(); out.gain.value = vol; out.connect(ctx.destination);
    var dry = ctx.createGain(); dry.connect(out);
    var send = ctx.createGain(); send.gain.value = 0.55; var rv = mkReverb(ctx, 3.2, 2.6); send.connect(rv); rv.connect(out); // reverb returns into channel gain
    var ch = { out: out, dry: dry, send: send, input: ctx.createGain() };
    ch.input.connect(dry); ch.input.connect(send);
    A.bus[name] = ch; return ch;
  }
  A.unlock = function () {
    try {
      if (!A.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        A.ctx = new AC(); mkChannel('music', A.music); mkChannel('sfx', A.sfx);
        var nb = A.ctx.createBuffer(1, A.ctx.sampleRate * 2, A.ctx.sampleRate), nd = nb.getChannelData(0);
        for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; A.noise = nb;
        // silent buffer kick for iOS
        var s = A.ctx.createBufferSource(); s.buffer = A.ctx.createBuffer(1, 1, 22050); s.connect(A.ctx.destination); s.start(0);
        A.ready = true; startMusic();
      }
      if (A.ctx.state !== 'running') A.ctx.resume();
    } catch (e) {}
  };
  A.setVolume = function (name, v) {
    A[name] = v; if (!A.ctx) return; var g = A.bus[name].out.gain, t = A.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + 0.05);
    if (v === 0) g.setValueAtTime(0, t + 0.06);
  };
  A.gainOf = function (name) { return A.ctx ? A.bus[name].out.gain.value : A[name]; };
  function note(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function tone(ch, f, t, dur, type, vol, atk, wet) {
    var ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.bus[ch].input); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  function noiseHit(ch, t, dur, f0, f1, q, vol, type) {
    var ctx = A.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = A.noise; f.type = type || 'bandpass'; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.bus[ch].input); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  var SCALE = [0, 2, 4, 7, 9, 11, 14, 16, 19, 21, 23, 26]; // lydian-ish pentatonic stack
  var ROOTS = [62, 59, 57, 64]; // per biome: D, B, A, E
  A.sfx_ = function (name, arg) {
    if (!A.ready || A.sfx <= 0) return; var t = A.ctx.currentTime, r = ROOTS[A.biome];
    switch (name) {
      case 'jump': tone('sfx', note(r + 24), t, 0.16, 'sine', 0.08, 0.005); tone('sfx', note(r + 31), t + 0.03, 0.14, 'sine', 0.04); noiseHit('sfx', t, 0.12, 900, 2400, 1, 0.03); break;
      case 'djump': tone('sfx', note(r + 31), t, 0.22, 'triangle', 0.07); tone('sfx', note(r + 36), t + 0.05, 0.25, 'sine', 0.06); noiseHit('sfx', t, 0.2, 2000, 5000, 2, 0.04); break;
      case 'walljump': tone('sfx', note(r + 28), t, 0.18, 'triangle', 0.07); noiseHit('sfx', t, 0.1, 600, 1800, 2, 0.05); break;
      case 'dash': noiseHit('sfx', t, 0.3, 3000, 400, 0.8, 0.14); tone('sfx', note(r + 19), t, 0.25, 'sine', 0.05); break;
      case 'land': var v = Math.min(1, (arg || 300) / 900); noiseHit('sfx', t, 0.12 + v * 0.1, 500, 120, 1.2, 0.05 + v * 0.1, 'lowpass'); break;
      case 'echo': // rising arpeggio, step grows with count
        var k = (arg || 0) % 7, base = r + 24;
        [0, 4, 7, 11, 14].forEach(function (s, i) { tone('sfx', note(base + SCALE[(k + i) % SCALE.length] ), t + i * 0.055, 1.6, 'sine', 0.09 - i * 0.01, 0.005); });
        tone('sfx', note(base + 36), t + 0.28, 2.2, 'sine', 0.03); break;
      case 'unlock':
        [0, 7, 12, 16, 19, 24].forEach(function (s, i) { tone('sfx', note(r + 12 + s), t + i * 0.09, 3.5, i % 2 ? 'triangle' : 'sine', 0.07, 0.02); });
        noiseHit('sfx', t, 2.5, 300, 6000, 0.5, 0.05); break;
      case 'rune': tone('sfx', note(r + 19), t, 1.4, 'sine', 0.08); tone('sfx', note(r + 26), t + 0.12, 1.4, 'sine', 0.05); break;
      case 'crystal': tone('sfx', note(r + 36 + SCALE[(arg | 0) % 6]), t, 0.9, 'sine', 0.025, 0.003); break;
      case 'crumble': noiseHit('sfx', t, 0.5, 300, 80, 0.7, 0.12, 'lowpass'); break;
      case 'checkpoint': tone('sfx', note(r + 24), t, 1.2, 'triangle', 0.05); tone('sfx', note(r + 31), t + 0.1, 1.4, 'sine', 0.05); break;
      case 'respawn': tone('sfx', note(r + 12), t, 1.2, 'sine', 0.06, 0.3); tone('sfx', note(r + 19), t + 0.1, 1.2, 'sine', 0.04, 0.3); break;
      case 'rumble': noiseHit('sfx', t, 3.5, 120, 40, 0.5, 0.35, 'lowpass'); tone('sfx', 40, t, 3.5, 'sine', 0.2, 0.4); break;
      case 'tap': tone('sfx', note(r + 31), t, 0.08, 'sine', 0.04); break;
    }
  };
  // ---- music: slow evolving pads + distant chimes + wind ----
  var chords = [[0, 4, 7, 11, 14], [-3, 0, 4, 7, 11], [5, 9, 12, 16, 19], [2, 5, 9, 12, 16]];
  function startMusic() {
    var ctx = A.ctx;
    // wind bed
    var ws = ctx.createBufferSource(); ws.buffer = A.noise; ws.loop = true;
    var wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.6;
    var wg = ctx.createGain(); wg.gain.value = 0.035; ws.connect(wf); wf.connect(wg); wg.connect(A.bus.music.input); ws.start();
    A.wind = { f: wf, g: wg };
    var ci = 0;
    function pad() {
      if (!A.ctx) return; var t = ctx.currentTime + 0.05, r = ROOTS[A.biome] - 12, ch = chords[ci++ % chords.length], dur = 9;
      ch.forEach(function (s, i) {
        var o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o2.type = 'triangle'; o.frequency.value = note(r + s); o2.frequency.value = note(r + s + 12) * 1.003; o.detune.value = (i - 2) * 6;
        f.type = 'lowpass'; f.frequency.setValueAtTime(500 + A.night * -150, t); f.frequency.linearRampToValueAtTime(1100 - A.night * 300, t + dur * 0.5); f.frequency.linearRampToValueAtTime(500, t + dur); f.Q.value = 0.7;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + 3); g.gain.linearRampToValueAtTime(0.018, t + dur - 2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.5);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(A.bus.music.input); o.start(t); o2.start(t); o.stop(t + dur + 2); o2.stop(t + dur + 2);
      });
      // bass
      tone('music', note(r - 12 + ch[0]), t, dur, 'sine', 0.05, 2.5);
      setTimeout(pad, (dur - 1.5) * 1000);
    }
    function chime() {
      if (!A.ctx) return; var t = ctx.currentTime + 0.02, r = ROOTS[A.biome] + 24;
      var n = 1 + (Math.random() * 3 | 0);
      for (var i = 0; i < n; i++) tone('music', note(r + SCALE[Math.random() * 8 | 0]), t + i * (0.3 + Math.random() * 0.4), 3, 'sine', 0.018 + Math.random() * 0.015, 0.01);
      setTimeout(chime, 2500 + Math.random() * 5000);
    }
    pad(); setTimeout(chime, 3000);
  }
  A.setWind = function (amt) { if (!A.wind) return; var t = A.ctx.currentTime; A.wind.g.gain.setTargetAtTime(amt < 0 ? 0 : 0.02 + amt * 0.09, t, 0.3); if (amt < 0) return; A.wind.f.frequency.setTargetAtTime(350 + amt * 900, t, 0.3); };
  return A;
})();
