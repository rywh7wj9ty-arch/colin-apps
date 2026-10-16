/* LUMEN background: one full-screen WebGL1 fragment shader, rendered at low resolution and scaled up
   (it is soft by design). Each world is a set of feature weights + four colours; transitions lerp them. */
import { WORLDS } from './worlds.js';

const VS = `attribute vec2 a; varying vec2 vUv; void main(){ vUv = a*.5+.5; gl_Position = vec4(a,0.,1.); }`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform vec2 uRes; uniform float uTime;
uniform vec3 uA, uB, uC, uD;
uniform vec4 uP1, uP2;
uniform vec3 uPulse; uniform float uEnergy, uDanger, uFlash, uBoard;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1.,0.)), f.x), mix(h21(i+vec2(0.,1.)), h21(i+vec2(1.,1.)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++){ v += a*noise(p); p = m*p; a *= .5; } return v; }
void main(){
  vec2 uv = vUv; float asp = uRes.x/uRes.y;
  vec2 p = vec2((uv.x-.5)*asp, uv.y-.5);
  float t = uTime;
  vec3 col = mix(uB, uA, smoothstep(-.15, 1.05, uv.y));
  // nebula / mist
  if (uP2.z > .01) {
    float n1 = fbm(p*1.7 + vec2(t*.012, t*.008));
    float n2 = fbm(p*3.2 - vec2(t*.018, -t*.01) + n1*1.5);
    float m = smoothstep(.35, 1.0, n1 + n2*.55);
    col += (uC*.55*n2 + uD*.75*n1*n1) * m * uP2.z;
  }
  // stars
  if (uP1.z > .01) {
    vec2 g = p*55.; vec2 id = floor(g); float r = h21(id);
    vec2 o = vec2(h21(id+1.3), h21(id+2.7)) - .5;
    float d = length(fract(g) - .5 - o*.6);
    float s = step(.955, r) * smoothstep(.22, 0., d);
    float tw = .55 + .45*sin(t*(.8 + r*3.) + r*40.);
    col += vec3(.92, .95, 1.) * s * tw * uP1.z * (.6 + .8*fract(r*13.));
  }
  // aurora curtains
  if (uP1.x > .01) {
    vec3 ac = vec3(0.);
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float y0 = .02 + fk*.11 + .08*sin(p.x*1.6 + t*.11 + fk*2.1) + .035*sin(p.x*4.3 - t*.23 + fk*4.) + .14*(fbm(vec2(p.x*1.1 + fk*3., t*.04)) - .5);
      float d = p.y - y0;
      float body = smoothstep(-.012, .03, d) * exp(-max(d, 0.)*(4.5 + fk*1.5));
      float rays = .45 + .55*noise(vec2(p.x*26. + fk*7. + t*.35, d*1.5));
      ac += mix(uC, uD, clamp(d*2.6 + fk*.25, 0., 1.)) * body * rays * (1. - fk*.22);
    }
    col += ac * uP1.x * .95;
  }
  // dawn ocean: sun, horizon, perspective swells
  if (uP2.x > .01) {
    float hz = -.16;
    vec2 sp = p - vec2(0., hz + .03);
    float sun = exp(-length(sp*vec2(1., 1.8))*5.);
    col += uC * sun * .85 * uP2.x;
    col += uC * exp(-abs(p.y - hz)*22.) * .35 * uP2.x;
    if (p.y < hz) {
      float dp = hz - p.y;
      vec2 q = vec2(p.x/(dp + .06)*.32, .16/(dp + .02) + t*.22);
      float w = noise(q*vec2(3.5, 1.2))*.6 + noise(q*vec2(8., 2.6) + 4.)*.4;
      vec3 water = mix(mix(uB, uA, .35)*.75, uA*.5, smoothstep(0., .4, dp));
      float glint = pow(w, 5.) * exp(-abs(p.x)*2.6) * exp(-dp*2.5) * 1.6;
      water += uC*glint + uC*sun*.35*(.4 + w) + uD*.06*w;
      col = mix(col, water, uP2.x * smoothstep(0., .006, dp));
    }
  }
  // neon rain: skyline, lit windows, bokeh, streaks, street glow
  if (uP1.y > .01) {
    float bxi = floor(p.x*7. + 40.);
    float bh = -.30 + .16*h21(vec2(bxi, 3.)) + .07*h21(vec2(floor(p.x*19. + 90.), 5.));
    float far = -.20 + .12*h21(vec2(floor(p.x*4. + 20.), 8.));
    col = mix(col, mix(uB, uD, .15)*.55, smoothstep(.004, -.004, p.y - far) * .55 * uP1.y);
    if (p.y < bh) {
      col = mix(col, uB*.28, .9*uP1.y);
      vec2 wq = vec2(p.x*80., p.y*60.); vec2 wid = floor(wq);
      float lit = step(.78, h21(wid)) * step(.25, fract(wq.x)) * step(.3, fract(wq.y));
      col += mix(uC, uD, step(.5, h21(wid + 1.))) * lit * .55 * uP1.y * (.7 + .3*sin(t*.4 + h21(wid)*20.));
    }
    vec3 bk = vec3(0.);
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      vec2 g = p*(7. + fk*5.) + vec2(fk*3.1, t*(.02 + fk*.015));
      vec2 id = floor(g); vec2 f = fract(g) - .5; float r = h21(id + fk*7.);
      vec2 o = (vec2(h21(id + 3.1), h21(id + 5.7)) - .5)*.5;
      float d = length(f - o);
      float b = smoothstep(.2, .14, d) * step(.62, r) * (.22 + .12*sin(t*.6 + r*30.));
      bk += mix(uC, uD, step(.8, r)) * b * (1. - fk*.4);
    }
    col += bk * uP1.y * .5;
    vec2 rq = vec2(p.x*70. + p.y*6., p.y*1.1 + t*1.9);
    float cid = floor(rq.x); float rr = h21(vec2(cid, 1.7));
    float fy = fract(rq.y*(.7 + rr*.6) + rr*10.);
    float streak = smoothstep(0., .04, fy)*smoothstep(.16, .04, fy) * step(.5, rr) * smoothstep(.5, .25, abs(fract(rq.x) - .5));
    col += mix(uD, vec3(1.), .55) * streak * .2 * uP1.y;
    col += uC * exp(-(p.y + .5)*4.) * .35 * uP1.y;
    col += uD * exp(-(p.y + .6)*9.) * .3 * uP1.y;
  }
  // crystal hollow: faceted gem walls with caustic light
  if (uP1.w > .01) {
    vec2 q = p*3.6 + vec2(0., t*.015);
    vec2 ip = floor(q), fp = fract(q);
    float d1 = 8., d2 = 8.; float cid = 0.; vec2 mv = vec2(0.);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 b = vec2(float(i), float(j));
      vec2 o = vec2(h21(ip + b), h21(ip + b + 9.1));
      o = .5 + .36*sin(t*.08 + 6.2831*o);
      vec2 r = b + o - fp; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; cid = h21(ip + b + 2.); mv = r; } else if (d < d2) d2 = d;
    }
    d1 = sqrt(d1); d2 = sqrt(d2);
    float edge = smoothstep(.06, .0, d2 - d1);
    vec2 ld = vec2(cos(t*.07), sin(t*.07));
    float shade = .5 + .5*dot(normalize(-mv + 1e-4), ld);
    vec3 cc = mix(uC, uD, cid);
    float depth = smoothstep(-.8, .4, p.y + .25*sin(cid*7.));
    col += cc * (shade*shade*.16 + edge*.10) * uP1.w * depth;
    col += vec3(1.) * pow(shade, 12.) * .06 * uP1.w * depth;
    float ca = pow(1. - abs(sin((p.x + fbm(p*2. + t*.05))*9.)*sin((p.y + fbm(p*2.2 - t*.04))*9.)), 9.);
    col += uD * ca * .12 * uP1.w;
  }
  // solar crown: corona and rising embers
  if (uP2.y > .01) {
    vec2 sc = vec2(0., .78);
    vec2 dv = p - sc; float r = length(dv);
    float ang = atan(dv.y, dv.x);
    float fl = fbm(vec2(ang*3.2, r*3.5 - t*.22));
    float corona = exp(-max(r - .32, 0.)*2.6) * (.55 + .9*fl);
    col += mix(uD, uC, clamp(1.2 - r, 0., 1.)) * corona * .55 * uP2.y;
    col += vec3(1., .85, .6) * smoothstep(.34, .3, r) * .6 * uP2.y;
    vec2 g = p*vec2(16., 9.) + vec2(0., -t*.5); vec2 id = floor(g); float rr = h21(id);
    float e = smoothstep(.1, 0., length(fract(g) - .5 - (vec2(h21(id + .5), h21(id + 1.5)) - .5)*.6)) * step(.86, rr);
    col += mix(uC, vec3(1.), .3) * e * .7 * uP2.y * (.5 + .5*sin(t*2. + rr*50.));
  }
  // board halo: soft light behind the well
  vec2 bp = (uv - vec2(.5, .5)) * vec2(asp*1.5, 1.05);
  col += mix(uC, uD, .5) * exp(-dot(bp, bp)*3.5) * .07 * uBoard;
  // pulse ring (Tetris / T-spin / perfect clear)
  if (uPulse.x < 1.) {
    float d = length((uv - uPulse.yz)*vec2(asp, 1.));
    float pr = uPulse.x;
    float ring = exp(-pow((d - pr*1.5)*7., 2.)) * (1. - pr);
    col += (uC + uD)*.55*ring + uC*.22*(1. - pr)*(1. - pr);
  }
  col += uFlash * vec3(1., .96, .9) * .45;
  float vig = smoothstep(1.25, .25, length(p*vec2(.85, 1.15)));
  col *= mix(.5, 1., vig);
  col = mix(col, col*vec3(1.25, .55, .6) + vec3(.07, 0., .015), uDanger*(1. - vig*.7)*.85);
  col *= 1. + uEnergy*.22;
  col += (h21(uv*uRes + fract(t*7.)*91.) - .5)*.03;
  col = col/(1. + col*.18);
  gl_FragColor = vec4(col, 1.);
}`;

const lerp = (a, b, t) => a + (b - a) * t;
function worldVec(w) { return { A: w.skyRGB[0], B: w.skyRGB[1], C: w.skyRGB[2], D: w.skyRGB[3], P1: w.p1, P2: w.p2 }; }
function mixVec(a, b, t) {
  const o = {};
  for (const k in a) o[k] = a[k].map((v, i) => lerp(v, b[k][i], t));
  return o;
}

export class Background {
  constructor(canvas) {
    this.canvas = canvas; this.ok = false; this.scale = 0.6; this.time = 0;
    this.from = worldVec(WORLDS[0]); this.to = this.from; this.mixT = 1; this.mixDur = 3;
    this.pulse = [1, .5, .5]; this.flash = 0; this.energy = 0; this.danger = 0; this.board = 1;
    this.lowFps = false; this.frame = 0;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.ok = false; }, false);
    canvas.addEventListener('webglcontextrestored', () => this.init(), false);
    this.init();
  }
  init() {
    try {
      const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'low-power' })
        || this.canvas.getContext('experimental-webgl');
      if (!gl) { this.ok = false; return; }
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.bindAttribLocation(prog, 0, 'a'); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      for (const n of ['uRes', 'uTime', 'uA', 'uB', 'uC', 'uD', 'uP1', 'uP2', 'uPulse', 'uEnergy', 'uDanger', 'uFlash', 'uBoard']) this.u[n] = gl.getUniformLocation(prog, n);
      this.gl = gl; this.ok = true;
    } catch (e) { console.warn('[lumen] background disabled:', e.message); this.ok = false; }
  }
  resize(w, h) {
    this.w = w; this.h = h;
    // the sky is soft by design: render small and let the compositor scale it (capped pixel budget)
    const sc = Math.min(this.scale, Math.sqrt((this.lowFps ? 110000 : 240000) / Math.max(1, w * h)));
    const cw = Math.max(2, Math.round(w * sc)), ch = Math.max(2, Math.round(h * sc));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
  }
  setQuality(reduced) { this.scale = reduced ? 0.38 : 0.6; this.lowFps = reduced; if (this.w) this.resize(this.w, this.h); }
  setWorld(i, instant) {
    const target = worldVec(WORLDS[i]);
    const cur = this.current();
    if (instant) { this.from = target; this.to = target; this.mixT = 1; return; }
    this.from = cur; this.to = target; this.mixT = 0;
  }
  current() { return this.mixT >= 1 ? this.to : mixVec(this.from, this.to, this.ease(this.mixT)); }
  ease(t) { return t * t * (3 - 2 * t); }
  pulseAt(x, y) { this.pulse = [0, x, y]; }
  render(dt) {
    this.time += dt;
    if (this.mixT < 1) this.mixT = Math.min(1, this.mixT + dt / this.mixDur);
    if (this.pulse[0] < 1) this.pulse[0] = Math.min(1, this.pulse[0] + dt / 1.6);
    this.flash = Math.max(0, this.flash - dt * 3);
    if (!this.ok) return;
    this.frame++;
    if (this.lowFps && (this.frame & 1)) return;
    const gl = this.gl, u = this.u, v = this.current();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, this.time % 3600);
    gl.uniform3fv(u.uA, v.A); gl.uniform3fv(u.uB, v.B); gl.uniform3fv(u.uC, v.C); gl.uniform3fv(u.uD, v.D);
    gl.uniform4fv(u.uP1, v.P1); gl.uniform4fv(u.uP2, v.P2);
    gl.uniform3fv(u.uPulse, this.pulse);
    gl.uniform1f(u.uEnergy, this.energy); gl.uniform1f(u.uDanger, this.danger); gl.uniform1f(u.uFlash, this.flash); gl.uniform1f(u.uBoard, this.board);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
