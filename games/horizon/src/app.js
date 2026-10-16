/* Horizon — interactive Kerr black hole
   Units: G = c = M = 1. Spin a ∈ [0, 0.998].
   Lensing: RK4 integration of Schwarzschild null geodesics in Cartesian form
   with Lense–Thirring / spin-potential Kerr approximation (labeled in UI).
*/
(function () {
  'use strict';

  var PARAMS = new URLSearchParams(location.search);
  var Q = (PARAMS.get('q') || 'auto').toLowerCase();
  var hash = location.hash.replace(/^#/, '');

  function $(id) { return document.getElementById(id); }

  // Quality tiers
  var quality = { steps: 120, stepScale: 1.0, dpr: Math.min(devicePixelRatio || 1, 2), bloom: 1.0 };
  if (Q === 'low') quality = { steps: 90, stepScale: 1.1, dpr: 1, bloom: 0.7 };
  else if (Q === 'medium') quality = { steps: 110, stepScale: 1.0, dpr: Math.min(devicePixelRatio || 1, 1.5), bloom: 0.9 };
  else if (Q === 'high') quality = { steps: 160, stepScale: 0.9, dpr: Math.min(devicePixelRatio || 1, 2), bloom: 1.2 };
  else {
    // auto: phones lower
    var mobile = /Mobi|Android|iPhone/i.test(navigator.userAgent) || Math.min(innerWidth, innerHeight) < 600;
    if (mobile) quality = { steps: 95, stepScale: 1.1, dpr: Math.min(devicePixelRatio || 1, 1.25), bloom: 0.75 };
  }

  var state = {
    spin: 0.7,
    camDist: 12.5,
    camTheta: 1.15,
    camPhi: 0.35,
    fov: 0.62,
    mode: 0, // 0 explore 1 light 2 fabric 3 fall
    fallT: 0,
    falling: false,
    compare: false,
    laserOn: false,
    laserOrigin: new THREE.Vector3(12, 3, 0),
    laserDir: new THREE.Vector3(-1, -0.15, 0.05).normalize(),
    probes: [],
    hudHidden: false,
    cinematic: true,
    cineT: 0,
    caption: '',
    captionUntil: 0,
    audioOn: false,
    exposure: 1.1,
    dragging: false,
    lastX: 0, lastY: 0,
    vx: 0, vy: 0,
    pinchD: 0,
    fabricRipple: 0,
    shareSpin: true
  };

  // Restore from hash: spin,theta,phi,dist
  if (hash) {
    var parts = hash.split(',');
    if (parts.length >= 1 && !isNaN(+parts[0])) state.spin = Math.min(0.998, Math.max(0, +parts[0]));
    if (parts.length >= 2 && !isNaN(+parts[1])) state.camTheta = +parts[1];
    if (parts.length >= 3 && !isNaN(+parts[2])) state.camPhi = +parts[2];
    if (parts.length >= 4 && !isNaN(+parts[3])) state.camDist = +parts[3];
    state.cinematic = false;
  }

  var renderer, scene, camera, material, mesh, clock;
  var audioCtx = null, drone = null;

  function init() {
    var canvas = $('c');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(quality.dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setClearColor(0x000000, 1);

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    var uniforms = {
      uRes: { value: new THREE.Vector2(innerWidth * quality.dpr, innerHeight * quality.dpr) },
      uTime: { value: 0 },
      uSpin: { value: state.spin },
      uCamDist: { value: state.camDist },
      uCamTheta: { value: state.camTheta },
      uCamPhi: { value: state.camPhi },
      uFov: { value: state.fov },
      uSteps: { value: quality.steps },
      uStepScale: { value: quality.stepScale },
      uMode: { value: 0 },
      uFallT: { value: 0 },
      uProbePos: { value: [] },
      uProbeAge: { value: [] },
      uProbeCount: { value: 0 },
      uLaserOrigin: { value: state.laserOrigin.clone() },
      uLaserDir: { value: state.laserDir.clone() },
      uLaserOn: { value: 0 },
      uCompare: { value: 0 },
      uBloom: { value: quality.bloom },
      uExposure: { value: state.exposure },
      uSeed: { value: Math.random() * 100 }
    };
    for (var i = 0; i < 8; i++) {
      uniforms.uProbePos.value.push(new THREE.Vector3(0, 0, 0));
      uniforms.uProbeAge.value.push(0);
    }

    material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: window.HORIZON_VERT,
      fragmentShader: window.HORIZON_FRAG,
      depthTest: false,
      depthWrite: false
    });

    mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), material);
    scene.add(mesh);
    clock = new THREE.Clock();

    bindUI();
    bindPointer();
    window.addEventListener('resize', onResize);
    onResize();

    // Hide loader
    var loader = $('loader');
    if (loader) {
      setTimeout(function () {
        loader.classList.add('out');
        setTimeout(function () { loader.style.display = 'none'; }, 700);
      }, 600);
    }

    if (state.cinematic) startCinematic();
    else showCaption('Drag to orbit · pinch to zoom', 2800);

    window.HORIZON = {
      pause: function (p) { state._paused = !!p; },
      render: function () { renderFrame(0); },
      state: state,
      setSpin: function (a) { state.spin = a; $('spin').value = a; },
      setMode: function (m) { setMode(m); },
      dropProbe: dropProbe,
      fall: startFall,
      skipCine: function () { state.cinematic = false; state.cineT = 99; $('cinebar').style.display = 'none'; }
    };

    requestAnimationFrame(loop);
  }

  function onResize() {
    var w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(quality.dpr);
    renderer.setSize(w, h, false);
    material.uniforms.uRes.value.set(w * quality.dpr, h * quality.dpr);
  }

  // --- Probes (CPU timelike-ish integration with same accel) ---
  function horizonR(a) { return 1.0 + Math.sqrt(Math.max(1 - a * a, 0)); }

  function accelCPU(p, v, a) {
    var r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    var soft = Math.max(r, 0.15);
    var hx = p.y * v.z - p.z * v.y;
    var hy = p.z * v.x - p.x * v.z;
    var hz = p.x * v.y - p.y * v.x;
    var h2 = hx * hx + hy * hy + hz * hz;
    var rs = 2.0;
    var s5 = Math.pow(soft, 5);
    var ax = -1.5 * rs * h2 * p.x / s5;
    var ay = -1.5 * rs * h2 * p.y / s5;
    var az = -1.5 * rs * h2 * p.z / s5;
    var omega = 2.0 * a / (soft * soft * soft + a * a * soft * 0.5);
    // frame drag
    ax += -2.0 * omega * (-v.z) + omega * 0.45 * a * (-p.z);
    az += -2.0 * omega * (v.x) + omega * 0.45 * a * (p.x);
    // gravity for matter (extra Newtonian pull so probes fall in)
    var grav = -1.0 / (soft * soft);
    ax += grav * p.x / soft;
    ay += grav * p.y / soft;
    az += grav * p.z / soft;
    return new THREE.Vector3(ax, ay, az);
  }

  function dropProbe() {
    if (state.probes.length >= 8) state.probes.shift();
    // Drop from near camera, with slight tangential velocity
    var ct = Math.cos(state.camTheta), st = Math.sin(state.camTheta);
    var cp = Math.cos(state.camPhi), sp = Math.sin(state.camPhi);
    var pos = new THREE.Vector3(st * cp, ct, st * sp).multiplyScalar(Math.min(state.camDist * 0.85, 11));
    // Circular-ish velocity in xz
    var tang = new THREE.Vector3(-pos.z, 0, pos.x).normalize();
    var vel = tang.multiplyScalar(0.35 + Math.random() * 0.15);
    vel.y += (Math.random() - 0.5) * 0.05;
    // Inward nudge
    vel.add(pos.clone().normalize().multiplyScalar(-0.08));
    state.probes.push({ pos: pos, vel: vel, age: 0, trail: [] });
    showCaption('Probe released. Watch its clock slow as it nears the horizon.', 4000);
    beep(180, 0.08);
  }

  function updateProbes(dt) {
    var a = state.spin;
    var rh = horizonR(a);
    for (var i = state.probes.length - 1; i >= 0; i--) {
      var pr = state.probes[i];
      pr.age += dt;
      // RK2
      var k1 = accelCPU(pr.pos, pr.vel, a);
      var midP = pr.pos.clone().add(pr.vel.clone().multiplyScalar(dt * 0.5));
      var midV = pr.vel.clone().add(k1.clone().multiplyScalar(dt * 0.5));
      var k2 = accelCPU(midP, midV, a);
      pr.vel.add(k2.multiplyScalar(dt));
      pr.pos.add(pr.vel.clone().multiplyScalar(dt));
      pr.trail.push(pr.pos.clone());
      if (pr.trail.length > 120) pr.trail.shift();
      var r = pr.pos.length();
      // Freeze visually near horizon (coordinate slowing)
      var freeze = Math.max(0, 1 - (r - rh * 1.05) / 2.0);
      if (freeze > 0) {
        pr.vel.multiplyScalar(1 - freeze * 0.85);
      }
      if (r < rh * 1.01 || pr.age > 90) {
        state.probes.splice(i, 1);
        showCaption('Crossed the horizon — signals stop.', 2500);
        chirp();
      }
    }
  }

  function fireLaser() {
    state.laserOn = true;
    state.mode = 1;
    material.uniforms.uMode.value = 1;
    // Aim roughly toward hole with offset so it can skim photon sphere
    var ct = Math.cos(state.camTheta), st = Math.sin(state.camTheta);
    var cp = Math.cos(state.camPhi), sp = Math.sin(state.camPhi);
    var ro = new THREE.Vector3(st * cp, ct, st * sp).multiplyScalar(state.camDist);
    state.laserOrigin.copy(ro);
    // Impact parameter near critical ~5.2 for Schwarzschild
    var right = new THREE.Vector3().crossVectors(ro.clone().normalize().negate(), new THREE.Vector3(0, 1, 0)).normalize();
    var aim = ro.clone().normalize().negate();
    var b = 4.2 + Math.random() * 2.5;
    state.laserDir.copy(aim).add(right.multiplyScalar(b / state.camDist)).normalize();
    material.uniforms.uLaserOrigin.value.copy(state.laserOrigin);
    material.uniforms.uLaserDir.value.copy(state.laserDir);
    material.uniforms.uLaserOn.value = 1;
    showCaption("That's light skimming the photon sphere — some loops once before escaping.", 4500);
    setModeUI('light');
  }

  function startFall() {
    state.falling = true;
    state.fallT = 0;
    state.mode = 3;
    material.uniforms.uMode.value = 3;
    showCaption('Falling in. Time dilates. What lies beyond is unknown — the ending is speculative.', 5000);
    setModeUI('fall');
    chirp();
  }

  function setMode(m) {
    state.mode = m;
    material.uniforms.uMode.value = m;
    if (m !== 1) { state.laserOn = false; material.uniforms.uLaserOn.value = 0; }
    if (m !== 3) { state.falling = false; state.fallT = 0; material.uniforms.uFallT.value = 0; }
  }

  function setModeUI(name) {
    var btns = document.querySelectorAll('.modebtn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].dataset.mode === name);
    }
  }

  function showCaption(text, ms) {
    state.caption = text;
    state.captionUntil = performance.now() + (ms || 3000);
    var el = $('caption');
    el.textContent = text;
    el.classList.add('show');
  }

  function startCinematic() {
    state.cinematic = true;
    state.cineT = 0;
    state.spin = 0.0;
    state.camDist = 22;
    state.camTheta = 1.05;
    state.camPhi = 0.2;
    $('cinebar').style.display = 'block';
    showCaption('HORIZON — a spinning black hole, rendered by bending light', 3500);
  }

  function updateCinematic(dt) {
    state.cineT += dt;
    var t = state.cineT;
    $('cinebar').style.width = Math.min(100, (t / 28) * 100) + '%';
    if (t < 6) {
      state.camPhi += dt * 0.15;
      state.camDist = 22 - t * 0.7;
    } else if (t < 14) {
      // Spin up
      state.spin = Math.min(0.95, (t - 6) / 8 * 0.95);
      state.camPhi += dt * 0.12;
      state.camDist = 18 - (t - 6) * 0.3;
      if (t > 6.1 && t < 6.3) showCaption('Spinning up — watch the shadow go D-shaped', 3500);
    } else if (t < 20) {
      state.spin = 0.95;
      state.camPhi += dt * 0.1;
      if (t > 14.1 && t < 14.3) {
        dropProbe();
        showCaption('A probe falls. Its clock slows; its light reddens.', 4000);
      }
    } else if (t < 28) {
      state.camTheta = 1.05 + Math.sin((t - 20) * 0.4) * 0.15;
      state.camDist = Math.max(11, state.camDist - dt * 0.2);
    } else {
      state.cinematic = false;
      $('cinebar').style.display = 'none';
      showCaption('Your move. Try Spin, Drop, Light, Fabric or Fall.', 4000);
      $('spin').value = state.spin;
      updateSpinLabel();
    }
    $('spin').value = state.spin;
    updateSpinLabel();
  }

  // --- Audio (off by default) ---
  function ensureAudio() {
    if (!state.audioOn) return null;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      drone = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      drone.type = 'sine';
      drone.frequency.value = 42;
      g.gain.value = 0.03;
      drone.connect(g); g.connect(audioCtx.destination);
      drone.start();
      state._gain = g;
    }
    return audioCtx;
  }
  function beep(f, d) {
    if (!state.audioOn) return;
    var ctx = ensureAudio(); if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f; g.gain.value = 0.05;
    o.connect(g); g.connect(ctx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d);
    o.stop(ctx.currentTime + d);
  }
  function chirp() {
    if (!state.audioOn) return;
    var ctx = ensureAudio(); if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(600, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 1.2);
    g.gain.value = 0.08;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.3);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 1.4);
  }

  function updateSpinLabel() {
    var a = +state.spin;
    var lab = $('spinlab');
    if (!lab) return;
    var kind = a < 0.05 ? 'Schwarzschild (no spin)' : a > 0.9 ? 'near-extremal Kerr' : 'Kerr';
    lab.textContent = 'a = ' + a.toFixed(3) + ' · ' + kind;
  }

  function updateReadout() {
    var a = state.spin;
    var rh = horizonR(a);
    var rs = 2;
    // Physical scale: for M = 1 geom unit. Labels:
    var el = $('readout');
    if (!el) return;
    var txt = 'r₊ = ' + rh.toFixed(3) + ' M';
    if (state.probes.length) {
      var p = state.probes[state.probes.length - 1];
      var r = p.pos.length();
      var dil = Math.sqrt(Math.max(1 - rs / Math.max(r, rs * 1.01), 0.001));
      txt += ' · probe r=' + r.toFixed(2) + 'M · clock ×' + dil.toFixed(3);
    }
    el.textContent = txt;
  }

  function writeHash() {
    if (!state.shareSpin) return;
    var h = state.spin.toFixed(3) + ',' + state.camTheta.toFixed(3) + ',' + state.camPhi.toFixed(3) + ',' + state.camDist.toFixed(2);
    if (history.replaceState) history.replaceState(null, '', '#' + h);
  }

  function bindUI() {
    $('spin').addEventListener('input', function (e) {
      state.spin = +e.target.value;
      updateSpinLabel();
      state.cinematic = false;
      writeHash();
    });
    updateSpinLabel();

    $('btn-drop').addEventListener('click', function () { state.cinematic = false; dropProbe(); });
    $('btn-light').addEventListener('click', function () { state.cinematic = false; fireLaser(); });
    $('btn-fabric').addEventListener('click', function () {
      state.cinematic = false;
      if (state.mode === 2) { setMode(0); setModeUI('explore'); showCaption('Back to the hole', 1500); }
      else { setMode(2); setModeUI('fabric'); showCaption('Spacetime as a fabric — the swirl is frame dragging.', 3500); }
    });
    $('btn-fall').addEventListener('click', function () { state.cinematic = false; startFall(); });
    $('btn-compare').addEventListener('click', function () {
      state.compare = !state.compare;
      material.uniforms.uCompare.value = state.compare ? 1 : 0;
      $('btn-compare').classList.toggle('on', state.compare);
      showCaption(state.compare ? 'Left: no spin. Right: spinning. Same mass.' : '', 3000);
    });
    $('btn-photo').addEventListener('click', function () {
      writeHash();
      try {
        var url = renderer.domElement.toDataURL('image/png');
        var a = document.createElement('a');
        a.href = url; a.download = 'horizon.png'; a.click();
        showCaption('Photo saved. Link hash stores spin & camera.', 2500);
      } catch (e) { showCaption('Could not save photo in this browser.', 2500); }
    });
    $('btn-audio').addEventListener('click', function () {
      state.audioOn = !state.audioOn;
      $('btn-audio').classList.toggle('on', state.audioOn);
      if (state.audioOn) ensureAudio();
      else if (state._gain) state._gain.gain.value = 0;
      showCaption(state.audioOn ? 'Audio on' : 'Audio off', 1200);
    });
    $('btn-hide').addEventListener('click', function () {
      document.body.classList.toggle('hud-hidden');
    });
    var skip = $('skip');
    if (skip) skip.addEventListener('click', function () {
      state.cinematic = false; state.cineT = 99; $('cinebar').style.display = 'none';
      showCaption('Your move.', 2000);
    });

    // Sheet toggle for phone
    var sheet = $('sheet');
    var handle = $('sheet-handle');
    if (handle) handle.addEventListener('click', function () { sheet.classList.toggle('open'); });

    // Keyboard
    window.addEventListener('keydown', function (e) {
      if (e.key === ' ') { e.preventDefault(); dropProbe(); }
      if (e.key === 'f' || e.key === 'F') startFall();
      if (e.key === 'l' || e.key === 'L') fireLaser();
      if (e.key === 'g' || e.key === 'G') $('btn-fabric').click();
      if (e.key === 'c' || e.key === 'C') $('btn-compare').click();
      if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('hud-hidden');
      if (e.key === 'Escape') { setMode(0); setModeUI('explore'); state.falling = false; }
    });
  }

  function bindPointer() {
    var el = $('c');
    el.addEventListener('pointerdown', function (e) {
      state.dragging = true;
      state.lastX = e.clientX; state.lastY = e.clientY;
      state.vx = state.vy = 0;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      state.cinematic = false;
      $('cinebar').style.display = 'none';
    });
    el.addEventListener('pointermove', function (e) {
      if (!state.dragging) return;
      var dx = e.clientX - state.lastX, dy = e.clientY - state.lastY;
      state.lastX = e.clientX; state.lastY = e.clientY;
      state.vx = dx; state.vy = dy;
      state.camPhi -= dx * 0.005;
      state.camTheta = Math.max(0.15, Math.min(Math.PI - 0.15, state.camTheta + dy * 0.005));
    });
    el.addEventListener('pointerup', function () { state.dragging = false; writeHash(); });
    el.addEventListener('pointercancel', function () { state.dragging = false; });
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.camDist = Math.max(4.5, Math.min(40, state.camDist * (1 + e.deltaY * 0.001)));
      state.cinematic = false;
      writeHash();
    }, { passive: false });
    el.addEventListener('dblclick', function () {
      state.camDist = 14; state.camTheta = 1.15; state.camPhi = 0.35;
      writeHash();
      showCaption('View reset', 1200);
    });

    // Pinch
    var pointers = {};
    el.addEventListener('pointerdown', function (e) { pointers[e.pointerId] = e; });
    el.addEventListener('pointerup', function (e) { delete pointers[e.pointerId]; state.pinchD = 0; });
    el.addEventListener('pointermove', function (e) {
      pointers[e.pointerId] = e;
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (state.pinchD) {
          state.camDist = Math.max(4.5, Math.min(40, state.camDist * (state.pinchD / d)));
        }
        state.pinchD = d;
      }
    });
  }

  var fpsFrames = 0, fpsT = 0, fps = 60;

  function loop() {
    requestAnimationFrame(loop);
    if (state._paused) return;
    var dt = Math.min(clock.getDelta(), 0.05);
    fpsFrames++; fpsT += dt;
    if (fpsT > 0.5) {
      fps = fpsFrames / fpsT;
      fpsFrames = 0; fpsT = 0;
      // Adaptive quality
      if (Q === 'auto' && fps < 22 && quality.steps > 40) {
        quality.steps = Math.max(40, quality.steps - 8);
        material.uniforms.uSteps.value = quality.steps;
      } else if (Q === 'auto' && fps > 45 && quality.steps < 100) {
        quality.steps = Math.min(100, quality.steps + 4);
        material.uniforms.uSteps.value = quality.steps;
      }
      var fp = $('fps'); if (fp) fp.textContent = Math.round(fps) + ' fps · ' + quality.steps + ' steps';
    }
    renderFrame(dt);
  }

  function renderFrame(dt) {
    if (state.cinematic) updateCinematic(dt);

    // Inertia
    if (!state.dragging && !state.cinematic && !state.falling) {
      state.camPhi -= state.vx * 0.005;
      state.camTheta = Math.max(0.15, Math.min(Math.PI - 0.15, state.camTheta + state.vy * 0.005));
      state.vx *= 0.92; state.vy *= 0.92;
    }

    if (state.falling) {
      state.fallT = Math.min(1, state.fallT + dt * 0.12);
      material.uniforms.uFallT.value = state.fallT;
      if (state.fallT >= 1) {
        // Speculative emergence then reset
        showCaption('Speculative fiction — physics has no confirmed “other side.” Returning.', 4500);
        state.falling = false;
        state.fallT = 0;
        material.uniforms.uFallT.value = 0;
        setMode(0);
        setModeUI('explore');
        state.camDist = 16;
      }
    }

    updateProbes(dt);

    var U = material.uniforms;
    U.uTime.value += dt;
    U.uSpin.value = state.spin;
    U.uCamDist.value = state.camDist;
    U.uCamTheta.value = state.camTheta;
    U.uCamPhi.value = state.camPhi;
    U.uFov.value = state.fov;
    U.uMode.value = state.mode;
    U.uCompare.value = state.compare ? 1 : 0;
    U.uFallT.value = state.fallT;
    U.uLaserOn.value = state.laserOn ? 1 : 0;
    U.uLaserOrigin.value.copy(state.laserOrigin);
    U.uLaserDir.value.copy(state.laserDir);
    U.uExposure.value = state.exposure * (state.falling ? (1 + state.fallT) : 1);

    for (var i = 0; i < 8; i++) {
      if (i < state.probes.length) {
        U.uProbePos.value[i].copy(state.probes[i].pos);
        U.uProbeAge.value[i] = state.probes[i].age;
      } else {
        U.uProbePos.value[i].set(0, 0, 0);
        U.uProbeAge.value[i] = 0;
      }
    }
    U.uProbeCount.value = state.probes.length;

    if (state.caption && performance.now() > state.captionUntil) {
      $('caption').classList.remove('show');
      state.caption = '';
    }

    updateReadout();
    renderer.render(scene, camera);
  }

  // Boot when THREE + shaders ready
  if (window.THREE && window.HORIZON_FRAG) init();
  else window.addEventListener('load', function () {
    if (!window.THREE) { $('loader').innerHTML = '<p>Could not load Three.js</p>'; return; }
    init();
  });
})();
