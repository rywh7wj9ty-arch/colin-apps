// Hollow Isle: rendering, post-processing, input, creatures, UI. Logic lives in core.js (globalThis.Hollow).
import * as THREE from './vendor/three/three.module.js';
import { Audio } from './audio.js?v=__V__';
const C = window.Hollow, M = window.HollowMesher, { B, BLOCKS, W, D, H, SEA } = C;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (!TOUCH) document.body.classList.add('desk');
const SKEY = 'hollow-settings';

// ---------- WebGL check ----------
const canvas = $('c');
{ const t = document.createElement('canvas'); if (!t.getContext('webgl2')) throw new Error('This game needs WebGL 2. Please update to iOS 15 or newer, or try another browser.'); }
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
const bigScreen = Math.min(screen.width, screen.height) >= 700;
const QUAL = {
  low: { dpr: 1, bloom: 0.25, rays: false, lights: 4, shadow: 0, lanternShadow: false, samples: 0, rain: 350, motes: 120 },
  medium: { dpr: 1.5, bloom: 0.33, rays: true, lights: 6, shadow: 1024, lanternShadow: false, samples: 0, rain: 800, motes: 260 },
  high: { dpr: 2, bloom: 0.5, rays: true, lights: 8, shadow: 2048, lanternShadow: true, samples: 4, rain: 1500, motes: 420 },
};
const settings = Object.assign({ low: false, quality: TOUCH ? (bigScreen ? 'medium' : 'medium') : 'high', gentle: false, bright: 1.3 }, (() => { try { return JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch (e) { return {}; } })());
if (!QUAL[settings.quality]) settings.quality = 'medium';
const Q = () => QUAL[settings.quality];
function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) {} }

// ---------- height fog (patched into every built-in material) ----------
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\nvarying float vFogDepth; varying vec3 vFogW;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\nvFogDepth = - mvPosition.z; vec4 fogW4 = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nfogW4 = instanceMatrix * fogW4;\n#endif\nvFogW = (modelMatrix * fogW4).xyz;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\nuniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogW; uniform float fogNear; uniform float fogFar;\n#endif';
// fogNear = density, fogFar = height of the fog layer. Thick near the ground and water, thinner up high.
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  float fh = clamp(exp(-(vFogW.y - fogFar) * 0.16), 0.15, 5.0);
  float fd = fogNear * vFogDepth;
  float fogFactor = 1.0 - exp(-(fd * fd * 0.5 + fd * fh * 0.7));
  #ifdef ROLL_FOG
  vec2 fq = vFogW.xz * 0.06 + vec2(uTime * 0.035, uTime * 0.018);
  float rn = sin(fq.x * 3.1 + sin(fq.y * 2.3)) * 0.5 + sin(fq.y * 4.7 - fq.x * 1.3 + uTime * 0.05) * 0.5;
  fogFactor = clamp(fogFactor * (0.82 + 0.28 * rn * fh * 0.4), 0.0, 1.0);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactor, 0.0, 1.0));
#endif`;
scene.fog = new THREE.Fog(0x4a5c78, 0.013, SEA + 4);

// ---------- post-processing: HDR scene -> bloom + light shafts -> grade (vignette, grain, aberration, heartbeat) ----------
const post = { ok: false, type: THREE.UnsignedByteType, float: false };
const fsGeo = new THREE.BufferGeometry(); fsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsScene = new THREE.Scene(), fsQuad = new THREE.Mesh(fsGeo); fsQuad.frustumCulled = false; fsScene.add(fsQuad);
const VS = 'varying vec2 vUv; void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }';
const sm = (u, fs) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false });
const PU = {
  tScene: { value: null }, tBloom: { value: null }, tRays: { value: null }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 },
  bloom: { value: 0.9 }, rays: { value: 0.5 }, sat: { value: 0.62 }, exposure: { value: 1.15 }, vig: { value: 1 }, grain: { value: 0.06 }, ca: { value: 0 },
  lift: { value: 1 }, bright: { value: 1 }, heart: { value: 0 }, fear: { value: 0 }, flash: { value: 0 }, fade: { value: 0 }, blood: { value: 0 }, dawn: { value: 0 }, tint: { value: new THREE.Color(0.86, 0.9, 1.08) },
};
const brightMat = sm({ tScene: PU.tScene, thr: { value: 0.95 } }, `uniform sampler2D tScene; uniform float thr; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tScene, vUv).rgb; if (!(c.r == c.r && c.g == c.g && c.b == c.b) || max(c.r, max(c.g, c.b)) > 6e4) c = vec3(0.); c = clamp(c, 0., 64.); float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(thr, thr + .6, l), 1.); }`);
const blurMat = sm({ tIn: { value: null }, dir: { value: new THREE.Vector2() } }, `uniform sampler2D tIn; uniform vec2 dir; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tIn, vUv).rgb * .227;
    c += (texture2D(tIn, vUv + dir * 1.385).rgb + texture2D(tIn, vUv - dir * 1.385).rgb) * .316;
    c += (texture2D(tIn, vUv + dir * 3.231).rgb + texture2D(tIn, vUv - dir * 3.231).rgb) * .07;
    gl_FragColor = vec4(c, 1.); }`);
// screen-space light shafts: radial blur of the bright pass toward the light on screen (moon or the hero's lantern)
const raysMat = sm({ tIn: { value: null }, lp: { value: new THREE.Vector2(.5, .5) }, str: { value: 0 }, n: { value: 24 } }, `uniform sampler2D tIn; uniform vec2 lp; uniform float str; uniform float n; varying vec2 vUv;
  void main(){ vec2 d = (vUv - lp) / 30.; vec2 uv = vUv; float w = 1.; vec3 acc = vec3(0.);
    for (int i = 0; i < 30; i++) { if (float(i) >= n) break; uv -= d; acc += texture2D(tIn, uv).rgb * w; w *= .94; }
    gl_FragColor = vec4(acc / n * str, 1.); }`);
const gradeMat = sm(PU, `uniform sampler2D tScene, tBloom, tRays; uniform vec2 res; uniform float time, bloom, rays, sat, exposure, vig, grain, ca, lift, bright, heart, fear, flash, fade, blood, dawn; uniform vec3 tint; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
  vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
  void main(){
    vec2 cc = vUv - .5; float r2 = dot(cc, cc);
    vec3 c;
    if (ca > .001) { vec2 o = cc * ca * .012; c = vec3(texture2D(tScene, vUv + o).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - o).b); }
    else c = texture2D(tScene, vUv).rgb;
    if (!(c.r == c.r && c.g == c.g && c.b == c.b)) c = vec3(0.); c = clamp(c, 0., 64.);
    c += texture2D(tBloom, vUv).rgb * bloom + texture2D(tRays, vUv).rgb * rays;
    c *= exposure * bright * tint; c += flash * vec3(.75, .8, 1.);
    c = aces(c);
    // lift the shadow floor toward a cool indigo so nothing crushes to black (dim and blue, never black)
    c += vec3(.014, .02, .034) * lift * (1. - c);
    float l = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(l), c, sat);
    // blood moon: a touch colder and flatter, never a red wash (the moon itself carries the colour)
    c = mix(c, vec3(l) * vec3(.94, .96, 1.08), blood * .22);
    c *= mix(1., smoothstep(.95, .18, r2 * 2.2), vig);
    float pulse = heart * (.55 + .45 * sin(time * (6. + fear * 6.))) ;
    // heartbeat: the screen edges dim and drain of colour on each beat (dark, desaturated, no red)
    float edge = clamp(pulse * smoothstep(.16, .6, r2 * 2.), 0., .55);
    c = mix(c, vec3(l) * vec3(.22, .25, .32), edge);
    c = srgb(c);
    c += (h(vUv * res + fract(time * 7.3) * 91.) - .5) * grain;
    c *= 1. - fade;
    gl_FragColor = vec4(c, 1.); }`);
const copyMat = sm({ tIn: { value: null } }, 'uniform sampler2D tIn; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tIn, vUv); }');
let rtScene = null, rtA = null, rtB = null, rtR = null;
function probeFloat() {
  // half-float targets for HDR bloom when the GPU can render to them, else plain 8-bit (still works, a little more banding)
  const gl = renderer.getContext();
  if (!(renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'))) return false;
  try {
    const t = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    renderer.setRenderTarget(t); const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; renderer.setRenderTarget(null); t.dispose(); return ok;
  } catch (e) { renderer.setRenderTarget(null); return false; }
}
function makeTargets(w, h) {
  for (const t of [rtScene, rtA, rtB, rtR]) if (t) t.dispose();
  const o = { type: post.type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  rtScene = new THREE.WebGLRenderTarget(w, h, { type: post.type, samples: Q().samples, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const bw = Math.max(2, Math.round(w * Q().bloom)), bh = Math.max(2, Math.round(h * Q().bloom));
  rtA = new THREE.WebGLRenderTarget(bw, bh, o); rtB = new THREE.WebGLRenderTarget(bw, bh, o); rtR = new THREE.WebGLRenderTarget(bw, bh, o);
}
function pass(mat, target) { fsQuad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); }
function renderFrame(raysOn) {
  if (!post.ok) { renderer.setRenderTarget(null); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.render(scene, camera); return; }
  renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
  brightMat.uniforms.tScene.value = rtScene.texture; pass(brightMat, rtA);
  if (raysOn) { raysMat.uniforms.tIn.value = rtA.texture; raysMat.uniforms.n.value = settings.quality === 'high' ? 30 : 18; pass(raysMat, rtR); }
  for (let i = 0; i < 2; i++) {
    blurMat.uniforms.tIn.value = rtA.texture; blurMat.uniforms.dir.value.set((1 + i * 1.5) / rtA.width, 0); pass(blurMat, rtB);
    blurMat.uniforms.tIn.value = rtB.texture; blurMat.uniforms.dir.value.set(0, (1 + i * 1.5) / rtA.height); pass(blurMat, rtA);
  }
  PU.tScene.value = rtScene.texture; PU.tBloom.value = rtA.texture; PU.tRays.value = raysOn ? rtR.texture : blackTex;
  pass(gradeMat, null);
}
const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blackTex.needsUpdate = true;
function initPost() {
  try { post.float = probeFloat(); post.type = post.float ? THREE.HalfFloatType : THREE.UnsignedByteType; post.ok = true; }
  catch (e) { post.ok = false; }
}
let viewW = 1, viewH = 1, rect = { left: 0, top: 0, width: 1, height: 1 };
function resize() {
  // size from the canvas's real box (not 100vh / innerHeight): iOS Safari toolbars make those disagree, which shifts every tap
  const r = canvas.getBoundingClientRect();
  rect = { left: r.left, top: r.top, width: r.width || innerWidth, height: r.height || innerHeight };
  viewW = rect.width; viewH = rect.height;
  const dpr = Math.min(devicePixelRatio || 1, settings.low ? Math.min(1.25, Q().dpr) : Q().dpr, 2);
  renderer.setPixelRatio(dpr); renderer.setSize(viewW, viewH, false);
  camera.aspect = viewW / viewH; camera.updateProjectionMatrix();
  if (post.ok) { try { makeTargets(Math.round(viewW * dpr), Math.round(viewH * dpr)); } catch (e) { post.ok = false; } }
  PU.res.value.set(viewW * dpr, viewH * dpr);
}
addEventListener('resize', resize); if (window.visualViewport) visualViewport.addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 300));

// ---------- lights, sky ----------
const hemi = new THREE.HemisphereLight(0x8ea6dc, 0x2a3a4a, 1.3); scene.add(hemi);
const amb = new THREE.AmbientLight(0x3c4e70, 0.8); scene.add(amb);
const moon = new THREE.DirectionalLight(0x9fb4ff, 0.7); moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.04; scene.add(moon, moon.target);
const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, night: { value: 1 }, time: { value: 0 }, blood: { value: 0 }, dawn: { value: 0 }, flash: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform vec3 top, hor, sunDir, sunCol; uniform float night, time, blood, dawn, flash; varying vec3 vd;
  float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); float a = h(vec3(i,1.)), b = h(vec3(i+vec2(1,0),1.)), c = h(vec3(i+vec2(0,1),1.)), d = h(vec3(i+1.,1.)); return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
  void main(){ float y = clamp(vd.y,0.,1.); vec3 c = mix(hor, top, pow(y, .5));
    float s = max(dot(vd, sunDir), 0.);
    // moon: a big pale disc with a soft halo (bright enough to feed the light shafts); the sun at dawn
    vec3 mc = mix(mix(vec3(1.7,1.78,2.0), vec3(1.5,.22,.45), blood), vec3(3.,2.4,1.6), dawn);
    float md = mix(.9988, .9962, blood); c += mc * smoothstep(md, md + .0005, s) * (1. - dawn * .3) + sunCol * (pow(s, 40.) * .5 + pow(s, 6.) * .18);
    c += vec3(.5, .08, .22) * blood * (smoothstep(.991, .9962, s) - smoothstep(.9962, .9968, s)) * 1.1;
    vec3 cell = floor(vd * 180.); float st = step(.997, h(cell)) * night * smoothstep(0., .3, vd.y) * (1. - dawn);
    c += st * (.5 + .4 * sin(time * 2. + h(cell + 1.) * 30.));
    // slow ragged clouds lit from below by the horizon glow
    vec2 q = vd.xz / (vd.y + .25) * 2. + vec2(time * .01, time * .004);
    float cl = n2(q) * .55 + n2(q * 2.3 + 4.) * .3 + n2(q * 5.1) * .15; cl = smoothstep(.45, .85, cl) * smoothstep(0., .25, vd.y);
    c = mix(c, mix(hor * .55, hor * 1.2 + vec3(.05), 1. - y) + flash * .8, cl * (.75 - dawn * .3));
    c += flash * vec3(.6,.65,.8) * (.3 + cl);
    gl_FragColor = vec4(c, 1.); }` }));
sky.renderOrder = -1; scene.add(sky);
// dusk ↔ deep night palette (top, horizon, light colour, light intensity), and the restored day for the ending
const PAL = {
  dusk: [0x1c2a4c, 0x4a5e80, 0xd2dcff, 1.9], night: [0x0e1a34, 0x34486a, 0xbccdff, 1.75], blood: [0x161230, 0x2e2c52, 0xc6c0ff, 1.6], day: [0x5aa6e6, 0xffd29a, 0xffe8c4, 2.4],
};
const _ca = new THREE.Color(), _cb = new THREE.Color(), _cc = new THREE.Color();
function palMix(i, n, bl, dw) { _ca.setHex(PAL.dusk[i]).lerp(_cb.setHex(PAL.night[i]), n); if (bl) _ca.lerp(_cb.setHex(PAL.blood[i]), bl); if (dw) _ca.lerp(_cb.setHex(PAL.day[i]), dw); return _ca; }
function palNum(i, n, bl, dw) { let v = lerp(PAL.dusk[i], PAL.night[i], n); v = lerp(v, PAL.blood[i], bl); return lerp(v, PAL.day[i], dw); }

// ---------- materials ----------
const U = { time: { value: 0 }, glow: { value: 1 }, wet: { value: 0 }, dawn: { value: 0 } };
function voxelMat(kind) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'water' ? 0.12 : 0.92, metalness: kind === 'water' ? 0.1 : 0, transparent: kind === 'water' || kind === 'glass', opacity: kind === 'water' ? 0.86 : kind === 'glass' ? 0.45 : 1, side: kind === 'deco' ? THREE.DoubleSide : THREE.FrontSide, depthWrite: kind === 'solid' || kind === 'deco' });
  m.defines = { ROLL_FOG: '' };
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time; sh.uniforms.uGlow = U.glow; sh.uniforms.uWet = U.wet; sh.uniforms.uDawn = U.dawn;
    sh.vertexShader = 'attribute vec2 buv; attribute float glow; varying vec2 vB; varying float vG; varying vec3 vW; varying vec3 vN; uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vB = buv; vG = glow; vN = normal; vec3 wp = (modelMatrix * vec4(position,1.)).xyz;
      ${kind === 'water' ? 'if (normal.y > .5) transformed.y += sin(wp.x*.5 + uTime*1.1)*.05 + cos(wp.z*.45 + uTime*.9)*.05;' : ''}
      ${kind === 'deco' ? 'float sw = buv.y * (sin(uTime*1.4 + wp.x*.6 + wp.z*.4)*.12 + sin(uTime*3.7 + wp.z)*.03) * (1. - step(.5, glow) * .8); transformed.x += sw; transformed.z += sw*.6;' : ''}
      vW = wp;`);
    sh.fragmentShader = 'varying vec2 vB; varying float vG; varying vec3 vW; varying vec3 vN; uniform float uTime; uniform float uGlow; uniform float uWet; uniform float uDawn;\nfloat hh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `vec3 vc = pow(vColor, vec3(2.2));
      // dawn: colour floods back into the island
      float vl = dot(vc, vec3(.3,.59,.11)); vec3 restored = clamp(mix(vec3(vl), vc, 2.1) * 1.55 + vec3(.02,.03,.0), 0., 1.);
      diffuseColor.rgb *= mix(vc, restored, uDawn);
      ${kind === 'solid' ? `vec2 f = fract(vB); vec2 e = min(f, 1. - f); float edge = min(e.x, e.y);
        vec3 cell = floor(vW - vN * .5); float n = hh(cell), n2 = hh(floor(vW * 4.) + cell);
        diffuseColor.rgb *= (.86 + .2 * n) * (.9 + .14 * n2) * mix(.62, 1., smoothstep(.0, .12, edge));
        // cracks and grime on every face
        float cr = step(.93, hh(floor(vW * 6.) + 3.)) * (1. - step(.5, vG));
        diffuseColor.rgb *= 1. - cr * .35;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.7,.85,.6), step(.5, vN.y) * smoothstep(.55, .9, n2) * .5 * (1. - uDawn));` : ''}
      ${kind === 'water' ? `float wv = sin(vW.x*1.1+uTime*1.4)*sin(vW.z*.9-uTime*1.2); diffuseColor.rgb += vec3(.05,.07,.09) * smoothstep(.5,.95,wv) * step(.5, vN.y);
        float fall = (1. - step(.5, abs(vN.y))) * smoothstep(.6, 1., sin(vW.y * 3.1 + uTime * 9. + sin(vW.x * 5. + vW.z * 3.) * .35)); diffuseColor.rgb += vec3(.2) * fall; diffuseColor.a = min(1., diffuseColor.a + fall * .2);` : ''}
      ${kind === 'deco' ? `float shp = floor(vB.x * .5 + .001), u = vB.x - shp * 2., y = vB.y, al = 0.;
        if (shp < .5) { al = step(abs(fract(u * 3.) - .5) * 2., 1. - y); }
        else if (shp < 1.5) { vec2 d = vec2(u - .5, (y - .74) * 1.25); float ang = atan(d.y, d.x); al = max(step(abs(u - .5), .05) * step(y, .72), step(length(d), .2 + .05 * sin(ang * 5.))); }
        else if (shp < 2.5) { al = max(step(abs(u - .5), .09) * step(y, .62), step(.5, y) * step(length(vec2(u - .5, (y - .5) * 1.7)), .48)); }
        else if (shp < 3.5) { float fk = sin(uTime * 13. + vW.x * 3.) * .04; al = max(step(abs(u - .5), .07) * step(y, .62), step(length(vec2((u - .5 + fk) * 1.7, (y - .74) * 1.1)), .26)); }
        else { float fk = sin(uTime * 11. + vW.z * 3.) * .05; al = max(step(y, .22) * step(abs(u - .5), .42), step(.12, y) * step(abs(u - .5 + fk * y), (1. - y) * .34)); }
        if (al < .5) discard;` : ''}
      diffuseColor.rgb *= 1. - uWet * .18 * step(.5, vN.y);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, ${kind === 'water' ? '0.05' : '0.22'}, uWet * step(.5, vN.y) * ${kind === 'water' ? '1.' : '.85'});`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float pulse = .7 + .3 * sin(uTime * 2.1 + vW.x * .7 + vW.z * .5 + vW.y);
      totalEmissiveRadiance += diffuseColor.rgb * vG * uGlow * pulse * ${kind === 'deco' ? '2.2' : '2.6'};`);
  };
  m.customProgramCacheKey = () => 'hvox-' + kind;
  return m;
}
const MAT = { solid: voxelMat('solid'), glass: voxelMat('glass'), water: voxelMat('water'), deco: voxelMat('deco') };
const toon = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, o || {}));
// ---------- chunks + worker meshing ----------
const NC = W / M.CS;
const chunks = new Map(); let worker = null, jobN = 0; const jobs = new Map(); let sim = null;
const pendingSets = []; const dirty = new Set();
const world3 = new THREE.Group(); scene.add(world3);
function chunkMesh(cx, cz, r) {
  const key = cx + ',' + cz; let ch = chunks.get(key);
  if (!ch) { ch = { group: new THREE.Group() }; chunks.set(key, ch); world3.add(ch.group); }
  for (const c of ch.group.children.slice()) { c.geometry.dispose(); ch.group.remove(c); }
  for (const k of ['solid', 'glass', 'water', 'deco']) {
    const d = r[k]; if (!d.i.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(d.n, 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.c, 3)); g.setAttribute('buv', new THREE.BufferAttribute(d.u, 2)); g.setAttribute('glow', new THREE.BufferAttribute(d.g, 1));
    g.setIndex(new THREE.BufferAttribute(d.i, 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, MAT[k]); m.castShadow = k === 'solid'; m.receiveShadow = k !== 'glass';
    if (k === 'water') m.renderOrder = 2; if (k === 'glass') m.renderOrder = 3;
    ch.group.add(m);
  }
  ch.ready = true;
}
function initMesher(vox) {
  M.setInfo(BLOCKS);
  if (worker) worker.terminate(); worker = null; jobs.clear();
  try {
    worker = new Worker('mesher.js?v=' + window.__V);
    worker.onmessage = e => { const r = e.data, key = r.cx + ',' + r.cz; if (jobs.get(key) !== r.job) return; jobs.delete(key); chunkMesh(r.cx, r.cz, r); };
    worker.onerror = () => { worker = null; for (const k of jobs.keys()) dirty.add(k); jobs.clear(); };
    worker.postMessage({ type: 'init', vox: vox.buffer.slice(0), blocks: BLOCKS });
  } catch (e) { worker = null; }
}
function requestMesh(cx, cz) {
  const key = cx + ',' + cz;
  if (worker) { const j = ++jobN; jobs.set(key, j); worker.postMessage({ type: 'mesh', cx, cz, job: j }); }
  else chunkMesh(cx, cz, M.meshChunk(sim.world.vox, cx, cz));
}
function markDirty(x, z) {
  const cx = Math.floor(x / M.CS), cz = Math.floor(z / M.CS); dirty.add(cx + ',' + cz);
  const lx = x % M.CS, lz = z % M.CS;
  if (lx === 0 && cx > 0) dirty.add((cx - 1) + ',' + cz); if (lx === M.CS - 1 && cx < NC - 1) dirty.add((cx + 1) + ',' + cz);
  if (lz === 0 && cz > 0) dirty.add(cx + ',' + (cz - 1)); if (lz === M.CS - 1 && cz < NC - 1) dirty.add(cx + ',' + (cz + 1));
}
function flushMesh() {
  if (pendingSets.length && worker) worker.postMessage({ type: 'set', list: pendingSets.slice() });
  pendingSets.length = 0;
  for (const k of dirty) { const [a, b] = k.split(',').map(Number); requestMesh(a, b); } dirty.clear();
}
function meshAll() { for (let cz = 0; cz < NC; cz++) for (let cx = 0; cx < NC; cx++) requestMesh(cx, cz); }
const allMeshed = () => chunks.size === NC * NC && jobs.size === 0;

// ---------- voxel raycast ----------
function voxRay(o, d, max, test) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
  let nx = 0, ny = 0, nz = 0, t = 0;
  while (t <= max) {
    const id = sim.world.get(x, y, z);
    if (id && test(id)) return { x, y, z, nx, ny, nz, id, t };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    if (y < -1 || y > H + 8) break;
  }
  return null;
}
const hittable = id => id !== B.WATER;
const camBlock = id => BLOCKS[id].solid && BLOCKS[id].opaque;
// ---------- hero ----------
function makeHero() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const fur = toon(0xffc7a0), dark = new THREE.MeshBasicMaterial({ color: 0x2b2238 }), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.46, 28, 20), fur); torso.scale.set(1, 0.92, 0.95); torso.position.y = 0.46; torso.castShadow = true; body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), toon(0xfff1e0)); belly.position.set(0, 0.36, 0.25); belly.scale.set(1, 0.9, 0.5); body.add(belly);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(0.16 * s, 0.56, 0.4);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), dark); ball.scale.set(0.85, 1.15, 0.6); e.add(ball);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), white); hl.position.set(0.025, 0.04, 0.05); e.add(hl);
    body.add(e); eyes.push(e);
    const ck = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toon(0xff8fa6)); ck.position.set(0.28 * s, 0.43, 0.34); ck.scale.set(1, 0.6, 0.4); body.add(ck);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), fur); ear.position.set(0.3 * s, 0.86, -0.02); ear.scale.set(0.8, 1, 0.6); body.add(ear);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.016, 6, 12, Math.PI), dark); mouth.position.set(0, 0.44, 0.44); mouth.rotation.z = Math.PI; body.add(mouth);
  const sprout = new THREE.Group(); sprout.position.set(0, 0.9, 0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.16), toon(0x5aa84e)); stem.position.y = 0.06; sprout.add(stem);
  for (const s of [-1, 1]) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), toon(0x7fd18f)); lf.scale.set(1.3, 0.35, 0.7); lf.position.set(0.08 * s, 0.15, 0); lf.rotation.z = -0.5 * s; sprout.add(lf); }
  body.add(sprout);
  const feet = [];
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), toon(0xe89a78)); f.scale.set(1, 0.6, 1.3); f.position.set(0.2 * s, 0.06, 0.05); f.castShadow = true; g.add(f); feet.push(f); }
  const arms = [];
  for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), fur); a.position.set(0.44 * s, 0.38, 0.06); a.scale.set(0.8, 1.1, 0.8); body.add(a); arms.push(a); }
  const pick = new THREE.Group(); const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45), toon(0xa8754f)); pick.add(hnd);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.07), toon(0xb9b6c8)); head.position.y = 0.22; pick.add(head);
  pick.position.set(0.5, 0.45, 0.12); pick.rotation.x = 0.6; pick.visible = false; body.add(pick);
  // handheld lantern: brass cage with a glowing core, raised overhead when lit
  const lan = new THREE.Group(), brass = toon(0x9a8448, { metalness: 0.7, roughness: 0.45 });
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 0, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); lan.add(cage);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.1, 6), brass); cap.position.y = 0.16; lan.add(cap);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 6), brass); base.position.y = -0.12; lan.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12), brass); ring.position.y = 0.25; lan.add(ring);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd08a })); lan.add(core);
  lan.position.set(-0.5, 0.35, 0.15); body.add(lan);
  return { g, body, eyes, feet, arms, mouth, pick, pickHead: head, lan, lanCage: cage, lanCore: core };
}
const hero = makeHero(); scene.add(hero.g);
// rim light so Cubby always pops from the night: a cool silver fresnel edge (warm at dawn)
const rimU = { value: new THREE.Color(0x9fc0ff) };
hero.g.traverse(o => { const m = o.material; if (!o.isMesh || !m || !m.isMeshStandardMaterial || m.userData.rim) return; m.userData.rim = true;
  const prev = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); sh.uniforms.uRim = rimU;
    sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uRim * pow(1. - clamp(dot(normal, normalize(vViewPosition)), 0., 1.), 2.6);'); };
  m.customProgramCacheKey = () => 'rim' + m.uuid; m.needsUpdate = true; });
// how enclosed the hero is (0 open sky .. 1 deep under rock), plus a bit extra in low foggy hollows
function coverAt() {
  const w = sim.world, x = Math.floor(P.x), z = Math.floor(P.z); let y0 = Math.floor(P.y + 1.5), solid = 0;
  for (let y = y0; y < Math.min(H, y0 + 14); y++) if (BLOCKS[w.get(x, y, z)].solid) { solid++; if (solid >= 2) break; }
  let c = solid >= 2 ? 1 : solid ? 0.5 : 0;
  if (!c && P.y < SEA + 2.5) c = 0.35;
  return c;
}
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); blob.rotation.x = -Math.PI / 2; scene.add(blob);
const P = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ground: false, inWater: false, yaw: 0, walk: 0, squash: 0, bonkT: 0, blink: 2, happy: 0, stepT: 0, air: 0 };
const HR = 0.3, HH = 0.95;
function solidAt(x, y, z) { if (x < 0 || z < 0 || x >= W || z >= D) return true; return BLOCKS[sim.world.get(Math.floor(x), Math.floor(y), Math.floor(z))].solid; }
function boxHit(x, y, z) {
  for (let yy = Math.floor(y); yy <= Math.floor(y + HH); yy++) for (let zz = Math.floor(z - HR); zz <= Math.floor(z + HR); zz++) for (let xx = Math.floor(x - HR); xx <= Math.floor(x + HR); xx++) if (solidAt(xx + 0.5, yy + 0.5, zz + 0.5)) return true;
  return false;
}
function physics(dt, mx, mz, jump) {
  const sp = 4.2, acc = P.ground ? 14 : 7;
  P.vx = lerp(P.vx, mx * sp, 1 - Math.exp(-acc * dt)); P.vz = lerp(P.vz, mz * sp, 1 - Math.exp(-acc * dt));
  const wet = sim.world.get(Math.floor(P.x), Math.floor(P.y + 0.45), Math.floor(P.z)) === B.WATER;
  if (wet && !P.inWater) { sfx('splash'); burst(P.x, P.y + 0.5, P.z, 0xbfefff, 14, 4); }
  P.inWater = wet;
  if (wet) { P.vy += (7 - 3 * P.vy) * dt; P.vy = Math.min(P.vy, 2.2); if (jump) P.vy = 5; }
  else { P.vy -= 24 * dt; if (jump && (P.ground || P.air < 0.12)) { P.vy = 8.2; P.ground = false; P.air = 1; P.squash = -0.35; sfx('jump'); } }
  P.vy = Math.max(P.vy, -22);
  for (const ax of ['x', 'z']) {
    const v = ax === 'x' ? P.vx : P.vz, nx = P.x + (ax === 'x' ? v * dt : 0), nz = P.z + (ax === 'z' ? v * dt : 0);
    if (!boxHit(nx, P.y, nz)) { P.x = nx; P.z = nz; }
    else if ((P.ground || wet) && !boxHit(nx, P.y + 1.05, nz) && !boxHit(P.x, P.y + 1.05, P.z) && Math.abs(v) > 0.5) { P.vy = Math.max(P.vy, 7.2); P.ground = false; P.squash = -0.25; }
    else if (ax === 'x') P.vx = 0; else P.vz = 0;
  }
  const ny = P.y + P.vy * dt;
  if (!boxHit(P.x, ny, P.z)) { P.y = ny; P.ground = false; }
  else {
    if (P.vy < 0) { const sy = Math.floor(ny) + 1; if (sy <= P.y + 0.01 && !boxHit(P.x, sy, P.z)) P.y = sy; if (!P.ground && P.air > 0.25) { P.squash = 0.4; sfx('step'); } P.ground = true; P.air = 0; }
    P.vy = 0;
  }
  if (!P.ground) P.air += dt;
  P.x = clamp(P.x, 0.4, W - 0.4); P.z = clamp(P.z, 0.4, D - 0.4);
  if (P.y < -5) { const s = sim.s.camp || sim.world.spawn; P.x = s.x + 0.5; P.y = s.y + 2; P.z = s.z + 0.5; }
}

// ---------- particles + effects ----------
const PMAX = 400;
const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshStandardMaterial({ roughness: 0.9 }), PMAX);
parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parts.count = 0; parts.frustumCulled = false; scene.add(parts);
const plist = []; const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
function burst(x, y, z, color, n, spd, opt) {
  n = settings.low ? Math.ceil(n / 2) : n;
  for (let i = 0; i < n && plist.length < PMAX; i++) plist.push({ x, y, z, vx: (Math.random() - 0.5) * spd, vy: Math.random() * spd * 0.9 + 1, vz: (Math.random() - 0.5) * spd, life: 0.6 + Math.random() * 0.5, t: 0, c: color, s: opt && opt.s || 1, g: opt && opt.g !== undefined ? opt.g : 14, r: Math.random() * 6 });
}
function updParts(dt) {
  let k = 0;
  for (let i = plist.length - 1; i >= 0; i--) {
    const p = plist[i]; p.t += dt; if (p.t > p.life) { plist.splice(i, 1); continue; }
    p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.g > 0 && solidAt(p.x, p.y, p.z)) { p.vy = Math.abs(p.vy) * 0.4; p.vx *= 0.6; p.vz *= 0.6; p.y += 0.05; }
    const sc = p.s * Math.sqrt(1 - p.t / p.life);
    _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.r + p.t * 4, p.r, 0)), _s.set(sc, sc, sc));
    parts.setMatrixAt(k, _m); parts.setColorAt(k, _c.setHex(p.c)); k++;
  }
  parts.count = k; parts.instanceMatrix.needsUpdate = true; if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
}
const crackTex = [1, 2, 3].map(st => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineWidth = 3; x.lineCap = 'round'; let r = 7 + st; const R = () => (Math.sin(r++ * 91.7) * 0.5 + 0.5);
  for (let i = 0; i < st * 3; i++) { x.beginPath(); let px = 32, py = 32; x.moveTo(px, py); for (let j = 0; j < 3; j++) { px += (R() - 0.5) * 40; py += (R() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; });
const crack = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); crack.visible = false; scene.add(crack);
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }))); ghost.visible = false; scene.add(ghost);
const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); sel.visible = false; scene.add(sel);
const flyers = []; const cubeG = new THREE.BoxGeometry(0.34, 0.34, 0.34);
function flyItem(x, y, z, id) {
  const m = new THREE.Mesh(id === B.FLOWER || BLOCKS[id].item ? new THREE.SphereGeometry(0.16, 10, 8) : cubeG, toon(BLOCKS[id].color, BLOCKS[id].glow ? { emissive: BLOCKS[id].color, emissiveIntensity: 1.2 } : {}));
  m.position.set(x + 0.5, y + 0.5, z + 0.5); m.castShadow = true; scene.add(m); flyers.push({ m, t: 0, vy: 4.5, id, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2 });
}
function updFlyers(dt) {
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i]; f.t += dt; const m = f.m;
    if (f.pop) { const k = f.t / 0.18; m.scale.setScalar(lerp(0.6, 1.0, Math.min(1, k)) + Math.sin(Math.min(1, k) * Math.PI) * 0.12); if (k >= 1.3) { scene.remove(m); flyers.splice(i, 1); } continue; }
    m.rotation.y += dt * 5;
    if (f.t < 0.55) { f.vy -= 16 * dt; m.position.x += f.vx * dt; m.position.z += f.vz * dt; m.position.y += f.vy * dt; if (solidAt(m.position.x, m.position.y - 0.17, m.position.z) && f.vy < 0) f.vy = -f.vy * 0.55; }
    else { const k = Math.min(1, (f.t - 0.55) / 0.3); m.position.lerp(_p.set(P.x, P.y + 0.6, P.z), k * 0.5); m.scale.setScalar(1 - k * 0.7);
      if (k >= 1) { scene.remove(m); flyers.splice(i, 1); sfx('collect'); hotPulse(f.id); } }
  }
}
function popIn(x, y, z, id) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), toon(BLOCKS[id].color, { transparent: true, opacity: 0.6, emissive: BLOCKS[id].color, emissiveIntensity: BLOCKS[id].glow ? 1 : 0.15 })); m.position.set(x + 0.5, y + 0.5, z + 0.5); scene.add(m); flyers.push({ m, t: 0, pop: true });
}

// ---------- creatures ----------
const ghostMat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, emissive: c, emissiveIntensity: 0.28, transparent: true, opacity: 0.45, depthWrite: false, roughness: 1 }, o || {}));
function makeGuide() { // ghostly Moss: a translucent, glowing echo of the island's old keeper
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 26, 18), ghostMat(0x7fd8c8)); body.scale.set(1, 0.9, 1); body.position.y = 0.55; inner.add(body);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 16), ghostMat(0xd8f4ff, { opacity: 0.6 })); face.position.set(0, 0.55, 0.3); face.scale.set(1, 0.8, 0.6); inner.add(face);
  const dark = new THREE.MeshBasicMaterial({ color: 0x0a1820 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), dark); e.position.set(0.14 * s, 0.62, 0.53); e.scale.set(1, 0.5, 0.5); inner.add(e);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), ghostMat(0x5fbfa3)); leaf.position.set(0.32 * s, 1.08, 0); leaf.scale.set(1.4, 0.3, 0.8); leaf.rotation.z = 0.5 * s; inner.add(leaf);
  }
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbff8ff })); fl.position.set(0, 1.12, 0.05); inner.add(fl);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 16, 1, true), ghostMat(0x7fd8c8, { opacity: 0.3, side: THREE.DoubleSide })); tail.position.y = 0.05; tail.rotation.x = Math.PI; inner.add(tail);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, map: glowTex, color: 0x7ff0e0, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(3.2, 3.2, 1); halo.position.y = 0.7; inner.add(halo);
  const mark = new THREE.Group(); const ex = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.25, 4, 8), new THREE.MeshBasicMaterial({ color: 0x9ff8ff })); ex.position.y = 0.2; mark.add(ex);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), ex.material); mark.add(dot); mark.position.y = 1.7; g.add(mark);
  g.userData.mark = mark; g.userData.body = body; g.userData.inner = inner; return g;
}
// a Hollow: tall, faceless, wispy; only two pale eyes. Made of fog-coloured cloth so it emerges from the mist.
const hollowGeo = (() => {
  const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(0.06 + Math.sin(t * Math.PI) * 0.34 * (1 - t * 0.45) + (1 - t) * 0.22, t * 2.5)); }
  const g = new THREE.LatheGeometry(pts, 14); return g;
})();
const hollowMat = new THREE.MeshStandardMaterial({ color: 0x07060c, roughness: 1, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
hollowMat.onBeforeCompile = sh => { sh.uniforms.uTime = U.time;
  sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float hem = 1. - smoothstep(0., 1.4, position.y); float ang = atan(position.z, position.x);
    transformed.xz *= 1. + hem * (.25 * sin(ang * 5. + uTime * 3.1) + .15 * sin(ang * 9. - uTime * 4.3));
    transformed.y += hem * .12 * sin(ang * 7. + uTime * 5.);
    transformed.x += sin(uTime * 1.3 + position.y * 1.7) * .05 * position.y;`);
};
hollowMat.customProgramCacheKey = () => 'hollow';
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8ffff, transparent: true });
function makeHollow() {
  const g = new THREE.Group(), body = new THREE.Mesh(hollowGeo, hollowMat.clone()); body.material.onBeforeCompile = hollowMat.onBeforeCompile; body.material.customProgramCacheKey = hollowMat.customProgramCacheKey; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), body.material); head.scale.set(0.85, 1.35, 0.85); head.position.y = 2.65; g.add(head);
  const eyes = new THREE.Group(); eyes.position.set(0, 2.72, 0.2);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat.clone()); e.scale.set(1.5, 0.7, 0.5); e.position.x = 0.09 * s; eyes.add(e); }
  g.add(eyes);
  for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 1.6, 5), body.material); a.position.set(0.32 * s, 1.55, 0.05); a.rotation.z = 0.12 * s; g.add(a); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, map: glowTex, color: 0x5ff4ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(1.2, 0.6, 1); glow.position.set(0, 2.72, 0.25); g.add(glow);
  g.userData = { body, eyes, glow }; return g;
}
function makeBun(col, hush) {
  const g = new THREE.Group(); const m = toon(col, { roughness: 1 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), m); b.position.y = 0.28; b.castShadow = true; g.add(b);
  const eyes = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.22, 4, 8), m); ear.position.set(0.1 * s, 0.62, -0.04); ear.rotation.z = -0.25 * s - (hush ? 0.6 * s : 0); g.add(ear);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: hush ? 0xc78bff : 0x2b2238 })); e.position.set(0.1 * s, 0.34, 0.26); g.add(e); eyes.push(e);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(hush ? 0x2a2630 : 0xffffff)); tail.position.set(0, 0.22, -0.3); g.add(tail);
  g.userData.body = b; g.userData.eyes = eyes; g.userData.mat = m; g.userData.tail = tail; return g;
}
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
const EMBER = new THREE.OctahedronGeometry(0.22, 0), emberMat = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a10, emissiveIntensity: 2.2, roughness: 0.4 });
let guide, buns = [], hollows = [], seedMeshes = [], wisps, motes, lightPool = [], halos = [], shafts = [], heroLamp, beam = null, cottageFx = null, arrow, wardFx = [], rain, deadTrees, mist;
const ents = new THREE.Group(); scene.add(ents);
function surf(x, z) { for (let y = H - 1; y > 0; y--) { const id = sim.world.get(Math.floor(x), y, Math.floor(z)); if (BLOCKS[id].solid) return y + 1; } return SEA + 1; }
// light shaft: a soft additive cone under a light, fading toward its rim and its foot (volumetric look, no raymarch)
const shaftMat = new THREE.ShaderMaterial({ uniforms: { col: { value: new THREE.Color(0xffb060) }, a: { value: 0.18 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 col; uniform float a; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float f = pow(abs(dot(vN, vV)), 1.6); gl_FragColor = vec4(col * a * f * smoothstep(0., .7, vY) * (.6 + .4 * vY), 1.); }' });
function makeShaft(r, h, col, a) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, r, h, 20, 1, true), shaftMat.clone()); m.geometry.translate(0, -h / 2, 0); m.material.uniforms.col.value.setHex(col); m.material.uniforms.a.value = a; m.renderOrder = 5; return m; }
function mergeGeos(list) { // tiny merge for the dead-tree prop
  let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index.count; }
  const p = new Float32Array(n * 3), no = new Float32Array(n * 3), idx = new Uint32Array(ni); let o = 0, oi = 0;
  for (const g of list) { p.set(g.attributes.position.array, o * 3); no.set(g.attributes.normal.array, o * 3); for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + o; o += g.attributes.position.count; oi += g.index.count; }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(p, 3)); r.setAttribute('normal', new THREE.BufferAttribute(no, 3)); r.setIndex(new THREE.BufferAttribute(idx, 1)); return r;
}
function deadTreeGeo() {
  const parts = [], R = C.rng(77);
  const limb = (x0, y0, z0, len, rad, ax, az, depth) => {
    const g = new THREE.CylinderGeometry(rad * 0.55, rad, len, 5, 1); g.translate(0, len / 2, 0);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, 0, az)); m.setPosition(x0, y0, z0); g.applyMatrix4(m); parts.push(g);
    const tip = new THREE.Vector3(0, len, 0).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, 0, az))).add(new THREE.Vector3(x0, y0, z0));
    if (depth > 0) for (let i = 0; i < (depth > 1 ? 3 : 2); i++) limb(tip.x, tip.y, tip.z, len * (0.55 + R() * 0.2), rad * 0.55, ax + (R() - 0.5) * 1.6, az + (R() - 0.5) * 1.8, depth - 1);
  };
  limb(0, -0.5, 0, 3.2, 0.32, 0.05, -0.08, 3);
  return mergeGeos(parts);
}
function buildEntities() {
  ents.clear(); buns = []; hollows = []; seedMeshes = []; lightPool = []; halos = []; shafts = []; wardFx = [];
  if (beam) { scene.remove(beam); beam = null; } if (cottageFx) { scene.remove(cottageFx.light); cottageFx = null; }
  const w = sim.world, q = Q();
  guide = makeGuide(); guide.position.set(w.guide.x, surf(w.guide.x, w.guide.z), w.guide.z); ents.add(guide);
  // Hushlings (corrupted Puffbuns) roam the meadow; cured ones turn back into Puffbuns and follow you
  const R = C.rng(w.seed + 99), cols = [0xffffff, 0xffd6e6, 0xfff0c2, 0xd8f0ff, 0xe8dcff, 0xffe0cc];
  for (let i = 0; i < 6; i++) {
    let x, z, t = 0; do { x = 52 + R() * 50; z = 74 + R() * 34; t++; } while ((surf(x, z) <= SEA + 1 || C.inRiver(x, z)) && t < 60);
    const cured = sim.s.cured.includes(i), b = makeBun(cured ? cols[i] : 0x3a3644, !cured); b.position.set(x, surf(x, z), z); ents.add(b);
    buns.push({ i, m: b, vy: 0, t: R() * 3, cured, follow: cured, home: { x, z }, tx: x, tz: z, hop: 0, x, z, col: cols[i], hushT: 0 });
  }
  for (const sd of w.seeds) {
    if (sim.s.found.includes(sd.id)) continue;
    const m = new THREE.Mesh(EMBER, emberMat); m.position.set(sd.x, sd.y, sd.z); m.userData.sd = sd;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, map: glowTex, color: 0xff8a3a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(2.2, 2.2, 1); m.add(halo);
    ents.add(m); seedMeshes.push(m);
  }
  for (const wd of w.wards) { const g = new THREE.Group(); g.position.set(wd.x + 0.5, wd.y + 0.5, wd.z + 0.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.035, 6, 40), new THREE.MeshBasicMaterial({ color: 0x9fefff, transparent: true, opacity: 0 })); ring.rotation.x = Math.PI / 2; g.add(ring);
    const ring2 = ring.clone(); ring2.material = ring.material; ring2.scale.setScalar(0.65); g.add(ring2);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, map: glowTex, color: 0x9fefff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(5, 5, 1); g.add(halo);
    const sh = makeShaft(1.6, 14, 0x9fefff, 0); sh.position.y = 13; g.add(sh);
    ents.add(g); wardFx.push({ g, ring, ring2, halo, sh, wd, on: sim.s.wards.includes(wd.id) ? 1 : 0 }); }
  // ghost wisps (replacing fireflies)
  const n = settings.low ? 50 : 120, pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { let x, z, t = 0; do { x = 10 + R() * 108; z = 10 + R() * 108; } while (surf(x, z) <= SEA + 1 && t++ < 30); pos.set([x, surf(x, z) + 0.8 + R() * 3, z], i * 3); ph[i] = R() * 100; }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); fg.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  wisps = new THREE.Points(fg, new THREE.ShaderMaterial({ uniforms: { time: U.time, vis: { value: 1 }, px: { value: renderer.getPixelRatio() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float ph; uniform float time, vis, px; varying float a; void main(){ vec3 p = position + vec3(sin(time*.35+ph)*2.2, sin(time*.8+ph*2.)*.6, cos(time*.3+ph)*2.2); vec4 mv = modelViewMatrix*vec4(p,1.); a = vis * (.35+.65*pow(.5+.5*sin(time*1.7+ph*5.), 3.)); gl_PointSize = px * 120. / -mv.z; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying float a; void main(){ float d = length(gl_PointCoord-.5); gl_FragColor = vec4(vec3(.62,1.,.72) * 1.5, a * smoothstep(.5, .0, d) * .8); }' }));
  wisps.frustumCulled = false; ents.add(wisps);
  // drifting embers (rise, additive) and ash (falls), wrapped in a box around the camera
  const mn = q.motes, mp = new Float32Array(mn * 3), mk = new Float32Array(mn); for (let i = 0; i < mn; i++) { mp.set([R() * 40, R() * 20, R() * 40], i * 3); mk[i] = R(); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('k', new THREE.BufferAttribute(mk, 1));
  motes = new THREE.Points(mg, new THREE.ShaderMaterial({ uniforms: { time: U.time, cam: { value: new THREE.Vector3() }, px: { value: renderer.getPixelRatio() }, vis: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float k; uniform float time, px, vis; uniform vec3 cam; varying float a; varying float e;
      void main(){ e = step(.55, k); vec3 p = position; p.y += e > .5 ? time * (.6 + k) : -time * (.35 + k * .4); p.x += sin(time * .5 + k * 40.) * 1.5 + time * .4; p.z += cos(time * .4 + k * 30.) * 1.2;
        p = mod(p - cam + vec3(20., 8., 20.), vec3(40., 20., 40.)) + cam - vec3(20., 8., 20.);
        vec4 mv = modelViewMatrix * vec4(p, 1.); a = vis * (e > .5 ? (.5 + .5 * sin(time * 6. + k * 90.)) : .35) * smoothstep(40., 8., -mv.z);
        gl_PointSize = px * (e > .5 ? 14. : 10.) / -mv.z * 6.; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'varying float a; varying float e; void main(){ float d = length(gl_PointCoord-.5); vec3 c = e > .5 ? vec3(1.6,.6,.15) : vec3(.35,.33,.32); gl_FragColor = vec4(c, a * smoothstep(.5, .1, d)); }' }));
  motes.frustumCulled = false; ents.add(motes);
  // rain streaks around the camera
  const rn = q.rain, rp = new Float32Array(rn * 6); for (let i = 0; i < rn; i++) { const x = R() * 40, y = R() * 26, z = R() * 40; rp.set([x, y, z, x + 0.05, y + 0.7, z + 0.02], i * 6); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({ uniforms: { time: U.time, cam: { value: new THREE.Vector3() }, amt: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `uniform float time; uniform vec3 cam; varying float a; void main(){ vec3 p = position; p.y -= time * 22.; p.x -= time * 2.;
      p = mod(p - cam + vec3(20., 10., 20.), vec3(40., 26., 40.)) + cam - vec3(20., 10., 20.); vec4 mv = modelViewMatrix * vec4(p, 1.); a = smoothstep(30., 3., -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'uniform float amt; varying float a; void main(){ gl_FragColor = vec4(.6,.68,.8, a * amt * .35); }' }));
  rain.frustumCulled = false; rain.visible = false; ents.add(rain);
  // swaying dead trees at the island's edges (scenery)
  const tg = deadTreeGeo(), tm = new THREE.MeshStandardMaterial({ color: 0x241c16, roughness: 1 });
  tm.onBeforeCompile = sh => { sh.uniforms.uTime = U.time; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.); float sway = max(position.y, 0.) * max(position.y, 0.) * .012; transformed.x += sway * sin(uTime * .9 + ip.x * .3); transformed.z += sway * .6 * sin(uTime * 1.1 + ip.z * .3);`); };
  tm.customProgramCacheKey = () => 'deadtree';
  const spots = []; for (let i = 0; i < 400 && spots.length < 34; i++) { const a = R() * Math.PI * 2, r = 30 + R() * 22, x = 64 + Math.cos(a) * r, z = 64 + Math.sin(a) * r; const y = surf(x, z); if (y <= SEA + 1.5 || Math.hypot(x - C.LANDMARKS.village.x, z - C.LANDMARKS.village.z) < 14) continue; if (w.wards.some(d => Math.hypot(d.x - x, d.z - z) < 5) || Math.hypot(w.lighthouse.x - x, w.lighthouse.z - z) < 8) continue; spots.push([x, y, z]); }
  deadTrees = new THREE.InstancedMesh(tg, tm, spots.length); deadTrees.castShadow = true; deadTrees.receiveShadow = true;
  spots.forEach((s, i) => { const k = 1.1 + R() * 1.3; _m.compose(_p.set(s[0], s[1] - 0.2, s[2]), _q.setFromEuler(_e.set((R() - 0.5) * 0.2, R() * 6.28, (R() - 0.5) * 0.25)), _s.set(k, k * (0.9 + R() * 0.4), k)); deadTrees.setMatrixAt(i, _m); });
  ents.add(deadTrees);
  // mist lying on the water
  mist = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 1, 1), new THREE.ShaderMaterial({ uniforms: { time: U.time, col: { value: new THREE.Color() }, amt: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = (modelMatrix * vec4(position,1.)).xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float time, amt; uniform vec3 col; varying vec2 vP; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+1.),f.x), f.y); }
      void main(){ vec2 q = vP * .08 + vec2(time * .02, time * .01); float n = n2(q) * .6 + n2(q * 2.7 - time * .03) * .4; gl_FragColor = vec4(col, smoothstep(.35, .85, n) * .42 * amt); }` }));
  mist.rotation.x = -Math.PI / 2; mist.position.set(64, SEA + 0.75, 64); mist.renderOrder = 4; ents.add(mist);
  // pooled flickering point lights for the nearest light blocks, each with a halo and a soft light shaft
  for (let i = 0; i < q.lights; i++) { const l = new THREE.PointLight(0xffa850, 0, 12, 1.8); ents.add(l); lightPool[i] = l;
    const hs = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, map: glowTex, color: 0xffa850, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); hs.scale.set(2.6, 2.6, 1); ents.add(hs); halos[i] = hs;
    const sh = makeShaft(2.2, 4.5, 0xffa040, 0); ents.add(sh); shafts[i] = sh; }
  heroLamp = new THREE.PointLight(0xffa850, 0, 17, 1.15); heroLamp.castShadow = q.lanternShadow && !settings.low; heroLamp.shadow.mapSize.set(256, 256); heroLamp.shadow.bias = -0.004; heroLamp.shadow.camera.near = 0.3; ents.add(heroLamp);
  heroLamp.userData.shaft = makeShaft(3.2, 3.4, 0xffb060, 0); ents.add(heroLamp.userData.shaft);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 4), new THREE.MeshBasicMaterial({ color: 0x9ff8ff })); cone.rotation.x = Math.PI / 2;
  arrow = new THREE.Group(); arrow.add(cone); ents.add(arrow);
  for (let i = 0; i < 2; i++) spawnHollow(true);
  if (sim.s.c.lighthouse) lightUp(sim.s.c.lighthouse, true);
  if (sim.s.c.cottage) cottageAlive(sim.s.c.cottage, true);
}
function lightUp(t, quiet) {
  const g = new THREE.Group(); g.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3, 30, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  cone.geometry.translate(0, -15, 0); const arm = new THREE.Group(); cone.rotation.z = Math.PI / 2 + 0.12; arm.add(cone); g.add(arm);
  const l = new THREE.PointLight(0xffe8a0, 40, 70, 1.2); g.add(l); scene.add(g); beam = g;
  if (!quiet) { for (let i = 0; i < 4; i++) setTimeout(() => burst(t.x + 0.5, t.y + 1, t.z + 0.5, [0xffd34a, 0xff8fb8, 0x9be3c0, 0xffffff][i], 30, 9), i * 250); }
}
function cottageAlive(c, quiet) {
  cottageFx = { x: c.x + 0.5, y: c.y + 4.5, z: c.z + 0.5, t: 0 };
  const l = new THREE.PointLight(0xffa860, 5, 9, 1.6); l.position.set(c.x + 0.5, c.y + 1.2, c.z + 0.5); scene.add(l); cottageFx.light = l;
  if (!quiet) { banner('Shelter built', 'Light a lantern inside and wait out the Blood Moon'); sfx('ignite'); burst(c.x + 0.5, c.y + 2, c.z + 0.5, 0xffa040, 24, 6); }
}
// Hollows spawn in the dark fog, out of the light, 18-30 blocks away
function spawnHollow(initial, at) {
  if (sim.s.dawn) return null;
  let x, z, tries = 0;
  if (at) { x = at.x; z = at.z; }
  else do { const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 12; x = P.x + Math.cos(a) * r; z = P.z + Math.sin(a) * r; tries++; }
  while (tries < 30 && (x < 4 || z < 4 || x > W - 4 || z > D - 4 || surf(x, z) <= SEA + 1 || sim.lightAt(x, surf(x, z), z, false) > 0.05));
  if (!at && tries >= 30) return null;
  const m = makeHollow(); m.position.set(x, surf(x, z), z); ents.add(m);
  const h = { x, z, m, state: 'stalk', fade: initial ? 0 : 0.9, speed: 0.85 + Math.random() * 0.3, scared: 0, born: 0 };
  hollows.push(h); return h;
}
// ---------- audio ----------
const audio = new Audio();
const sfx = (n, p) => audio.sfx(n, p);

// ---------- UI helpers ----------
const iconCache = {};
function shade(hex, f) { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`; }
function icon(id) {
  if (iconCache[id]) return iconCache[id];
  if (id === 'fuel' || id === 'bell') return iconCache[id] = specialIcon(id);
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  if (id === 'pick1' || id === 'pick2') { x.lineCap = 'round'; x.strokeStyle = '#5f4630'; x.lineWidth = 7; x.beginPath(); x.moveTo(18, 52); x.lineTo(44, 18); x.stroke(); x.strokeStyle = id === 'pick1' ? '#a08060' : '#8d8a9a'; x.lineWidth = 9; x.beginPath(); x.arc(40, 22, 18, Math.PI * 1.05, Math.PI * 1.85); x.stroke(); }
  else if (BLOCKS[id] && BLOCKS[id].item) { x.fillStyle = id === B.RESIN ? '#d08a2a' : '#e8dcb0'; x.beginPath(); x.ellipse(32, 36, 16, 20, 0.3, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.arc(26, 28, 5, 0, 7); x.fill(); }
  else if (id === B.TORCH || id === B.CAMPFIRE) { x.fillStyle = '#4f3e2e'; if (id === B.TORCH) x.fillRect(28, 26, 8, 32); else { x.save(); x.translate(32, 50); for (const r of [-0.5, 0.5]) { x.save(); x.rotate(r); x.fillRect(-20, -4, 40, 8); x.restore(); } x.restore(); } const gr = x.createRadialGradient(32, 22, 2, 32, 22, 18); gr.addColorStop(0, '#fff0a0'); gr.addColorStop(0.5, '#ff8a2a'); gr.addColorStop(1, 'rgba(255,80,0,0)'); x.fillStyle = gr; x.beginPath(); x.arc(32, id === B.TORCH ? 20 : 34, 18, 0, 7); x.fill(); }
  else if (id === B.WAXCAP) { x.fillStyle = '#8a7e66'; x.fillRect(29, 34, 6, 22); x.fillStyle = '#e8dcb0'; x.beginPath(); x.arc(32, 36, 18, Math.PI, 0); x.fill(); }
  else if (id === B.FLOWER) { x.fillStyle = '#3d5a40'; x.fillRect(30, 30, 4, 28); for (let i = 0; i < 5; i++) { x.fillStyle = '#cfe0ff'; x.beginPath(); x.arc(32 + Math.cos(i * 1.256) * 10, 24 + Math.sin(i * 1.256) * 10, 8, 0, 7); x.fill(); } x.fillStyle = '#9ff8ff'; x.beginPath(); x.arc(32, 24, 6, 0, 7); x.fill(); }
  else {
    const b = BLOCKS[id], top = b.top || b.color, side = b.side || b.color;
    const poly = (pts, f) => { x.fillStyle = f; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); };
    poly([[32, 6], [58, 19], [32, 32], [6, 19]], shade(top, 1.08)); poly([[6, 19], [32, 32], [32, 60], [6, 47]], shade(side, 0.88)); poly([[58, 19], [32, 32], [32, 60], [58, 47]], shade(side, 0.72));
    if (b.glow) { x.fillStyle = 'rgba(255,240,200,.6)'; x.beginPath(); x.arc(32, 32, 10, 0, 7); x.fill(); }
    if (id === B.DOOR) { x.fillStyle = '#7a4f2e'; x.beginPath(); x.arc(24, 42, 3, 0, 7); x.fill(); }
    if (id === B.GLASS) { x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 3; x.beginPath(); x.moveTo(14, 30); x.lineTo(22, 24); x.stroke(); }
  }
  return iconCache[id] = c.toDataURL();
}
function specialIcon(id) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  if (id === 'fuel') { x.fillStyle = '#6b4a2a'; x.fillRect(20, 20, 24, 36); x.fillStyle = '#d08a2a'; x.fillRect(22, 32, 20, 22); x.fillStyle = '#9a8448'; x.fillRect(26, 12, 12, 10); }
  else { x.fillStyle = '#b59a52'; x.beginPath(); x.moveTo(32, 10); x.quadraticCurveTo(14, 14, 14, 48); x.lineTo(50, 48); x.quadraticCurveTo(50, 14, 32, 10); x.fill(); x.fillStyle = '#6b5a2a'; x.beginPath(); x.arc(32, 52, 5, 0, 7); x.fill(); }
  return c.toDataURL();
}
let toastT = 0;
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 2200); }
function banner(a, b) { const e = $('banner'); e.innerHTML = a + (b ? '<small>' + b + '</small>' : ''); e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }
let bubbleCb = null;
function say(text, cb) { $('bubText').textContent = text; $('bubble').classList.remove('hidden'); bubbleCb = cb || null; }
$('bubOk').onclick = () => { $('bubble').classList.add('hidden'); sfx('click'); const f = bubbleCb; bubbleCb = null; if (f) f(); };

let hotSel = 0, hotIds = [];
function hotOrder() { const s = sim.s; s.hot = (s.hot || []).filter(id => sim.count(id) > 0); for (const id of C.PLACEABLE) if (sim.count(id) > 0 && !s.hot.includes(id)) s.hot.push(id); return s.hot.slice(0, 9); }
function renderHot() {
  const el = $('hotbar'); const prev = hotIds[hotSel]; hotIds = hotOrder();
  if (prev !== undefined && hotIds.includes(prev)) hotSel = hotIds.indexOf(prev); else hotSel = clamp(hotSel, 0, Math.max(0, hotIds.length - 1));
  let h = '';
  if (sim.s.tool) h += `<div class="hs tool" title="Pick"><img src="${icon('pick' + sim.s.tool)}"></div>`;
  for (let i = 0; i < 9; i++) { const id = hotIds[i]; h += id !== undefined ? `<div class="hs${i === hotSel ? ' sel' : ''}" data-i="${i}" data-id="${id}"><img src="${icon(id)}"><b>${sim.count(id)}</b></div>` : (i < 5 ? `<div class="hs empty"></div>` : ''); }
  el.innerHTML = h;
}
$('hotbar').addEventListener('pointerdown', e => { const s = e.target.closest('.hs[data-i]'); if (!s) return; hotSel = +s.dataset.i; sfx('click'); renderHot(); if (TOUCH && mode !== 'build') setMode('build'); e.stopPropagation(); });
function hotPulse(id) { renderHot(); const s = document.querySelector(`.hs[data-id="${id}"]`); if (s) { s.classList.remove('pulse'); void s.offsetWidth; s.classList.add('pulse'); } }
const selId = () => hotIds[hotSel];

function renderQuest() {
  const q = sim.quest();
  if (!q) { $('qTitle').textContent = 'The curse is lifted ✦'; $('qText').textContent = 'The island is yours again. Build, explore, and enjoy the sunshine.'; $('qBar').style.width = '100%'; }
  else { $('qTitle').textContent = `${sim.s.quest + 1}. ${q.title}`; $('qText').textContent = q.text + (q.id === 'shelter' && sim.s.bloodIn > 0 ? ` (Blood Moon in ${Math.ceil(sim.s.bloodIn)}s)` : q.id === 'survive' && sim.s.bloodT > 0 ? ` (${Math.ceil(sim.s.bloodT)}s left)` : ''); $('qBar').style.width = (100 * sim.progress() / q.need) + '%'; }
  $('seedN').textContent = sim.s.found.length + '/12'; $('wardN').textContent = sim.s.wards.length + '/6';
  if (guide) guide.userData.mark.visible = !!q && !sim.s.talked;
}
function renderCraft() {
  const R = C.RECIPES; let h = `<div class="hub">Craft<small>Resin ×${sim.count(B.RESIN)} · Wax ×${sim.count(B.WAX)}<br>Lantern fuel ${Math.round(sim.s.fuel)}%</small></div>`;
  R.forEach((r, i) => {
    const ring = i % 2, a = -Math.PI / 2 + i / R.length * Math.PI * 2, rr = ring ? 27 : 43, rx = 50 + Math.cos(a) * rr, ry = 50 + Math.sin(a) * rr;
    const can = sim.canCraft(r.id), locked = !sim.s.unlocked.includes(r.id), out = r.tool ? 'pick' + r.tool : r.fuel ? 'fuel' : r.bell ? 'bell' : +Object.keys(r.out)[0];
    const need = Object.entries(sim.needFor(r)).map(([k, v]) => `${v} ${BLOCKS[k].name}`).join(' + ');
    h += `<button class="rc ${locked ? 'locked' : can.ok ? 'ok' : 'no'}" data-r="${r.id}" style="left:${rx}%;top:${ry}%"><img src="${icon(out)}">${locked ? '🔒 ' : ''}${r.name}<span class="need">${locked ? 'Unlock by questing' : can.why === 'Already have it' ? 'Got it!' : can.why === 'Lantern is full' ? 'Full' : need}</span></button>`;
  });
  $('wheel').innerHTML = h;
}
$('wheel').addEventListener('click', e => { const b = e.target.closest('.rc'); if (!b) return; sim.craft(b.dataset.r); renderCraft(); });
function openCraft() { if (!playing) return; $('bubble').classList.add('hidden'); renderCraft(); $('craft').classList.remove('hidden'); sfx('click'); }
function closeCraft() { $('craft').classList.add('hidden'); }
$('bCraft').onclick = () => openCraft(); $('craftClose').onclick = () => { closeCraft(); sfx('click'); };

let mode = 'mine';
function setMode(m) { mode = m; $('bMode').classList.toggle('build', m === 'build'); $('modeIco').textContent = m === 'build' ? '▣' : '⛏'; $('modeTxt').textContent = m === 'build' ? 'Build' : 'Mine'; }
$('bMode').onclick = () => { setMode(mode === 'mine' ? 'build' : 'mine'); sfx('click'); };

function syncPause() {
  $('tMusic').classList.toggle('on', audio.vol.musicOn); $('tSfx').classList.toggle('on', audio.vol.sfxOn); $('tLow').classList.toggle('on', settings.low); $('tGentle').classList.toggle('on', settings.gentle);
  for (const b of document.querySelectorAll('[data-q]')) b.classList.toggle('sel', b.dataset.q === settings.quality);
  $('sBright').value = settings.bright || 1.3; $('sMusic').value = audio.vol.music; $('sSfx').value = audio.vol.sfx;
  $('qLog').textContent = C.QUESTS.map((q, i) => (i < sim.s.quest ? '★ ' : i === sim.s.quest ? '▶ ' : '· ') + q.title).join('  ');
}
let slot = 0, playing = false, paused = false, saveT = 0;
function openPause() { if (!playing) return; paused = true; syncPause(); $('pause').classList.remove('hidden'); }
function closePause() { paused = false; $('pause').classList.add('hidden'); }
$('bMenu').onclick = () => { sfx('click'); openPause(); }; $('bResume').onclick = () => { sfx('click'); closePause(); };
$('tMusic').onclick = () => { audio.vol.musicOn = !audio.vol.musicOn; audio.apply(); syncPause(); };
$('tSfx').onclick = () => { audio.vol.sfxOn = !audio.vol.sfxOn; audio.apply(); syncPause(); sfx('click'); };
$('tLow').onclick = () => { settings.low = !settings.low; applyLow(); syncPause(); };
$('tGentle').onclick = () => { settings.gentle = !settings.gentle; saveSettings(); syncPause(); };
for (const b of document.querySelectorAll('[data-q]')) b.onclick = () => { setQuality(b.dataset.q); syncPause(); };
$('sBright').oninput = e => { settings.bright = +e.target.value; saveSettings(); };
$('sMusic').oninput = e => audio.set('music', +e.target.value); $('sSfx').oninput = e => audio.set('sfx', +e.target.value);
$('sSfx').onchange = () => sfx('click');
$('bTitle').onclick = async () => { await save(); closePause(); showTitle(); };

// ---------- blueprints ----------
let bp = null; const bpMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 0.92, 0.92), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }), 200); bpMesh.count = 0; bpMesh.frustumCulled = false; scene.add(bpMesh);
function startBlueprint(id) {
  const def = C.BLUEPRINTS.find(b => b.id === id);
  const ox = Math.floor(P.x + Math.sin(P.yaw) * 5) - 2, oz = Math.floor(P.z + Math.cos(P.yaw) * 5) - 2; let oy = 0;
  for (let dz = 0; dz < 5; dz++) for (let dx = 0; dx < 5; dx++) oy = Math.max(oy, surf(ox + dx + 0.5, oz + dz + 0.5));
  bp = { def, ox, oy, oz }; updBlueprint(); toast(def.name + ' blueprint placed. Fill in the ghost blocks!');
}
function updBlueprint() {
  if (!bp) { bpMesh.count = 0; $('bpTag').classList.add('hidden'); return; }
  let k = 0, done = 0;
  for (const [x, y, z, id] of bp.def.blocks) {
    const X = bp.ox + x, Y = bp.oy + y, Z = bp.oz + z;
    if (sim.world.get(X, Y, Z) === id) { done++; continue; }
    _m.makeTranslation(X + 0.5, Y + 0.5, Z + 0.5); bpMesh.setMatrixAt(k, _m); bpMesh.setColorAt(k, _c.setHex(BLOCKS[id].color)); k++;
  }
  bpMesh.count = k; bpMesh.instanceMatrix.needsUpdate = true; if (bpMesh.instanceColor) bpMesh.instanceColor.needsUpdate = true;
  $('bpTag').classList.remove('hidden'); $('bpTag').textContent = `${bp.def.name}: ${done}/${bp.def.blocks.length}`;
  if (k === 0) { banner('Blueprint complete!'); sfx('quest'); bp = null; setTimeout(updBlueprint, 50); }
}
$('bpCottage').onclick = () => { closePause(); startBlueprint('cottage'); }; $('bpOff').onclick = () => { bp = null; updBlueprint(); closePause(); };
function bpWants(x, y, z) { if (!bp) return null; for (const b of bp.def.blocks) if (bp.ox + b[0] === x && bp.oy + b[1] === y && bp.oz + b[2] === z) return b[3]; return null; }

// ---------- saves (IndexedDB 'hollow-isle', localStorage 'hollow-slot-*' fallback; never touches Cubby Isle's keys) ----------
const store = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('hollow-isle', 1); r.onupgradeneeded = () => r.result.createObjectStore('slots'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); setTimeout(() => rej(new Error('idb timeout')), 3000); } catch (e) { rej(e); } }));
  const tx = async (m, f) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('slots', m), s = t.objectStore('slots'), r = f(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  return {
    async get(n) { try { const v = await tx('readonly', s => s.get(n)); return v || localStorage.getItem('hollow-slot-' + n); } catch (e) { return localStorage.getItem('hollow-slot-' + n); } },
    async put(n, v) { try { await tx('readwrite', s => s.put(v, n)); } catch (e) { localStorage.setItem('hollow-slot-' + n, v); } },
    async del(n) { try { await tx('readwrite', s => s.delete(n)); } catch (e) {} localStorage.removeItem('hollow-slot-' + n); },
  };
})();
async function save() { if (!sim || !playing) return; sim.s.hero = { x: P.x, y: P.y, z: P.z, yaw: P.yaw }; await store.put(slot, sim.serialize()); }
addEventListener('pagehide', () => { save(); }); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---------- quality ----------
function setQuality(q) { if (!QUAL[q]) return; settings.quality = q; saveSettings(); applyLow(); if (sim) buildEntities(); }
function applyLow() {
  document.body.classList.toggle('low', settings.low);
  const q = Q(); const sh = q.shadow > 0 && !settings.low;
  renderer.shadowMap.enabled = sh; moon.castShadow = sh; if (sh && moon.shadow.mapSize.x !== q.shadow) { moon.shadow.mapSize.set(q.shadow, q.shadow); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } }
  if (heroLamp) heroLamp.castShadow = q.lanternShadow && !settings.low;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  resize(); saveSettings();
}

// ---------- start / title ----------
function bindSim(s) {
  sim = s; const w = sim.world, orig = w.set.bind(w);
  w.set = (x, y, z, id) => { const r = orig(x, y, z, id); if (r) { pendingSets.push(w.idx(x, y, z), id); markDirty(x, z); } return r; };
  sim.on(onEvent);
  initMesher(w.vox); meshAll();
  buildEntities();
}
let dawnT = 0, fadeV = 0, caughtT = 0, storm = { on: false, t: 40 + Math.random() * 40, flash: 0, next: 4, amt: 0 }, bellCd = 0, scareCd = 0;
async function showTitle() {
  playing = false; $('hud').classList.add('hidden'); $('title').classList.remove('hidden'); closeCraft(); closePause(); task = null;
  if (!sim || sim.world.seed !== 7 || sim.world.deltas.size) bindSim(new C.Sim(7));
  const s = sim.world.spawn; P.x = s.x; P.y = s.y; P.z = s.z; camS.dist = 58; camS.pitch = 0.55; dawnT = 0;
  let h = '';
  for (let n = 0; n < 3; n++) {
    const raw = await store.get(n); let meta = null; try { meta = raw && JSON.parse(raw); if (meta && meta.game !== 'hollow') meta = null; } catch (e) {}
    if (meta) { const q = meta.s.quest, wd = (meta.s.wards || []).length; h += `<button class="slot" data-n="${n}"><h3>Island ${n + 1}</h3><p>${meta.s.dawn ? '☀ Curse lifted' : `✦ ${wd}/6 wards · ${q}/${C.QUESTS.length} quests`}</p><span class="go">Continue</span><span class="del" data-del="${n}">start over</span></button>`; }
    else h += `<button class="slot" data-n="${n}"><h3>Island ${n + 1}</h3><p>A cursed island</p><span class="go">Wake up</span></button>`;
  }
  $('slots').innerHTML = h;
}
$('slots').addEventListener('click', async e => {
  audio.unlock();
  const d = e.target.closest('[data-del]'); if (d) { e.stopPropagation(); if (confirm('Start Island ' + (+d.dataset.del + 1) + ' over? Its save will be erased.')) { await store.del(+d.dataset.del); showTitle(); } return; }
  const b = e.target.closest('.slot'); if (b) start(+b.dataset.n);
});
async function start(n, seedOverride) {
  slot = n; const raw = await store.get(n); let s = null;
  try { if (raw) s = new C.Sim(JSON.parse(raw).seed, raw); } catch (e) { s = null; }
  const fresh = !s; if (!s) s = new C.Sim(seedOverride !== undefined ? seedOverride : (Math.random() * 1e9) >>> 0);
  bindSim(s);
  const h = sim.s.hero; P.x = h.x; P.y = h.y + 0.05; P.z = h.z; P.yaw = h.yaw || 0; P.vx = P.vy = P.vz = 0;
  camS.yaw = Math.PI * 0.15; camS.dist = 10; camS.pitch = 0.55; camS.cy = P.y; dawnT = sim.s.dawn ? 1 : 0; fadeV = 0;
  $('title').classList.add('hidden'); $('hud').classList.remove('hidden'); playing = true; paused = false; bp = null; updBlueprint();
  renderHot(); renderQuest(); setMode('mine'); syncLantern();
  if (fresh) { await save(); setTimeout(() => say("Cubby... can you hear me? It's Moss. Or what's left of me. The dark took the island while you slept. Stay near the light. Tap me whenever you're lost.", () => { sim.s.talked = true; renderQuest(); if (sim.quest()) say(sim.quest().text); }), 900); }
}
function talk() {
  sim.s.talked = true; renderQuest(); sfx('whisper');
  const q = sim.quest();
  const tips = { tool: 'The craft wheel is the button with the flower. Planks first, then the pick.', torch: 'Every log you bonk gives a drop of resin. Torches need planks and resin. Set them on the ground.', camp: 'Two logs and a stone make a campfire. Wherever it burns, you wake.',
    ward: 'The Wardstones kept the Hollows away. Hold a torch, walk up and tap the dark stone.', fuel: 'Waxcaps are pale mushrooms in the dead forest east of here. Then raise your lantern with the lantern button.', deep: 'The cave mouth is at the south foot of the mountain. Raise your lantern down there.',
    shelter: 'Try the Shelter blueprint in the menu. It shows where every block goes.', survive: 'Stay inside your shelter, near a light. The Hollows grow bold under a red moon.', cure: 'Craft a Moonflower from dead leaves. Light freezes a Hushling. Then tap it.',
    wards: 'Six stones: village, forest, lake, the west cliff, the eastern dunes, and the bottom of the cave.', embers: 'Embers hide high, wet and deep. The arrow above you points to the nearest.', lighthouse: 'The dead lighthouse is on the south beach. Climb the spiral stair and set the lamp on top.' };
  say(q ? `${q.title}: ${q.text} ${tips[q.id] || ''}` : 'Look, Cubby. The sun. I can finally rest. Thank you.');
}
function syncLantern() { $('bLantern').classList.toggle('lit', !!(sim && sim.s.lanternUp)); $('bBell').classList.toggle('dim', !(sim && sim.s.bell)); }

// ---------- events from the sim ----------
function onEvent(type, d) {
  if (!playing) return;
  if (type === 'bonk') { sfx('bonk', d.stage); crack.visible = true; crack.position.set(d.x + 0.5, d.y + 0.5, d.z + 0.5); crack.material.map = crackTex[Math.min(2, Math.floor(d.stage * 3))]; crack.material.needsUpdate = true; burst(d.x + 0.5, d.y + 0.9, d.z + 0.5, BLOCKS[d.id].color, 5, 3); }
  else if (type === 'break') { crack.visible = false; sfx('pop'); burst(d.x + 0.5, d.y + 0.5, d.z + 0.5, BLOCKS[d.id].color, 18, 6); if (d.drop) flyItem(d.x, d.y, d.z, d.drop); else renderHot(); if (d.id === B.LOG || d.id === B.BIRCH) setTimeout(() => flyItem(d.x, d.y, d.z, B.RESIN), 120); renderQuest(); updBlueprint(); lightScan = 0; }
  else if (type === 'place') { sfx(BLOCKS[d.id].light ? 'ignite' : 'place'); popIn(d.x, d.y, d.z, d.id); burst(d.x + 0.5, d.y + 0.1, d.z + 0.5, BLOCKS[d.id].light ? 0xffa040 : 0x888888, 6, 2.5); renderHot(); renderQuest(); updBlueprint(); P.squash = 0.2; lightScan = 0;
    if (d.id === B.CAMPFIRE) toast('You will wake here if the dark takes you.'); }
  else if (type === 'deny') { if (d.why && d.why !== 'far' && d.why !== 'empty') { toast(d.why); sfx('deny'); } }
  else if (type === 'craft') { sfx('craft'); toast('Crafted ' + sim.recipe(d.id).name + '!'); renderHot(); renderQuest(); burst(P.x, P.y + 1.2, P.z, 0xffa040, 14, 4); P.happy = 1.2; syncLantern(); }
  else if (type === 'quest') { sfx('quest'); banner('Quest complete', '✦ ' + d.q.title); P.happy = 2; renderQuest(); save();
    if (d.q.unlock.length) setTimeout(() => toast('New recipes: ' + d.q.unlock.map(u => sim.recipe(u).name).join(', ')), 2600);
    if (d.next) setTimeout(() => say('Well done, little one. Next: ' + d.next.text), 1800); }
  else if (type === 'seed') { sfx('fanfare'); banner('Ember Seed', d.name + ' · ' + sim.s.found.length + '/12'); P.happy = 2; const m = seedMeshes.find(s => s.userData.sd.id === d.id); if (m) { burst(m.position.x, m.position.y, m.position.z, 0xff8a3a, 30, 7); ents.remove(m); seedMeshes = seedMeshes.filter(s => s !== m); } renderQuest(); save(); }
  else if (type === 'ward') { sfx('ward'); banner('Wardstone relit', d.ward.name + ' · ' + d.n + '/6'); const f = wardFx.find(f => f.wd.id === d.ward.id); if (f) f.flare = 1; burst(d.ward.x + 0.5, d.ward.y + 0.5, d.ward.z + 0.5, 0x9fefff, 40, 8, { g: -2 }); for (const h of hollows) if (Math.hypot(h.x - d.ward.x, h.z - d.ward.z) < 20) h.scared = 5; renderHot(); renderQuest(); save(); lightScan = 0; }
  else if (type === 'cured') { sfx('cured'); const b = buns.find(b => b.i === d.i); if (b) cureBun(b); toast('The Hushling is a Puffbun again!'); renderHot(); renderQuest(); }
  else if (type === 'cottage') cottageAlive(d);
  else if (type === 'lighthouse') lightUp(d);
  else if (type === 'dawn') startDawn();
  else if (type === 'bloodmoon') { banner('Blood Moon', 'Stay in the light'); sfx('sting', settings.gentle ? 1 : 0); for (let i = 0; i < 2; i++) spawnHollow(false); }
  else if (type === 'bloodend') { banner('The red moon sets', 'You made it through'); sfx('wake'); }
  else if (type === 'fuelout') { toast('Your lantern sputters out. Craft more fuel.'); sfx('lantern', 0); syncLantern(); }
  else if (type === 'lantern') { sfx('lantern', d.up ? 1 : 0); syncLantern(); }
  else if (type === 'bell') { sfx('handbell'); bellCd = 12; for (const h of hollows) if (Math.hypot(h.x - P.x, h.z - P.z) < 28) h.scared = 6; burst(P.x, P.y + 1.6, P.z, 0xffe0a0, 16, 5, { g: -1 }); $('ring').classList.remove('go'); void $('ring').offsetWidth; $('ring').classList.add('go'); }
  else if (type === 'caught') { const n = Object.values(d.lost).reduce((a, b) => a + b, 0); setTimeout(() => toast(n ? `You woke by the ${sim.s.camp ? 'campfire' : 'old well'}, but dropped ${n} things in the dark.` : 'You woke up, shaking. The dark let you go.'), 900); renderHot(); }
}
function cureBun(b) {
  b.cured = true; b.follow = true; const m = b.m; ents.remove(m);
  const n = makeBun(b.col, false); n.position.copy(m.position); ents.add(n); b.m = n;
  for (let i = 0; i < 6; i++) setTimeout(() => burst(n.position.x, n.position.y + 0.8, n.position.z, 0xcfe0ff, 4, 2, { g: -1 }), i * 90);
}
function startDawn() {
  dawnT = 0.0001; audio.dawn = true; sfx('dawn'); banner('The curse is lifted', 'Dawn breaks over the island');
  for (const h of hollows) h.scared = 99; for (const b of buns) if (!b.cured) { sim.s.cured.push(b.i); cureBun(b); }
  setTimeout(() => say('Look, Cubby. The sun! The fog is burning away, and the colours are coming home. You did it. I can finally rest. Thank you.'), 5000);
  save();
}

// ---------- actions ----------
let task = null;
const reachOk = (x, y, z, r) => { sim.s.hero.x = P.x; sim.s.hero.y = P.y; sim.s.hero.z = P.z; return sim.reach(x, y, z, r); };
function act(kind, hit) {
  if (!hit) return;
  if (hit.id === B.WARDSTONE && !sim.s.wards.includes((sim.wardAt(hit.x, hit.y, hit.z) || {}).id)) { task = { kind: 'mine', x: hit.x, y: hit.y, z: hit.z, t: 0, next: 0 }; return; }
  if (kind === 'mine') {
    const can = sim.canMine(hit.x, hit.y, hit.z);
    if (!can.ok && can.why !== 'far') { if (can.why !== 'empty') { toast(can.why); sfx('deny'); } return; }
    task = { kind, x: hit.x, y: hit.y, z: hit.z, t: 0, next: 0 };
  } else {
    let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (hit.id === B.TALLGRASS) { x = hit.x; y = hit.y; z = hit.z; }
    let id = selId(); const want = bpWants(x, y, z); if (want && sim.count(want) > 0) id = want;
    if (id === undefined) { toast('Your pocket is empty. Bonk some blocks first!'); sfx('deny'); return; }
    task = { kind: 'place', x, y, z, id, t: 0 };
  }
}
function runTask(dt) {
  if (!task) return { mx: 0, mz: 0 };
  task.t += dt; if (task.t > 6) { task = null; crack.visible = false; return { mx: 0, mz: 0 }; }
  const tx = task.x + 0.5, tz = task.z + 0.5;
  const inReach = task.kind === 'walk' || task.kind === 'cure' ? Math.hypot(tx - P.x, tz - P.z) < (task.kind === 'cure' ? 1.8 : 0.7) : reachOk(task.x, task.y, task.z, task.kind === 'place' ? 5.2 : 4.3);
  if (!inReach) { const dx = tx - P.x, dz = tz - P.z, l = Math.hypot(dx, dz) || 1; if (l < 0.35) { task = null; return { mx: 0, mz: 0 }; } return { mx: dx / l, mz: dz / l }; }
  P.yaw = Math.atan2(tx - P.x, tz - P.z);
  if (task.kind === 'mine') {
    task.next -= dt;
    if (task.next <= 0) { P.bonkT = 0.22; task.next = 0.28; const r = sim.bonk(task.x, task.y, task.z); if (!r.hit || r.broke) task = null; }
  } else if (task.kind === 'place') { sim.place(task.x, task.y, task.z, task.id); task = null; }
  else if (task.kind === 'cure') { sim.cure(task.bun.i); task = null; }
  else { if (task.then === 'talk') talk(); task = null; }
  return { mx: 0, mz: 0 };
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), sph = new THREE.Sphere(), _hp = new THREE.Vector3();
function pick(sx, sy) {
  // client coords -> NDC using the canvas's real rect (the same rect the renderer is sized from)
  ndc.set((sx - rect.left) / rect.width * 2 - 1, -((sy - rect.top) / rect.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  const hit = voxRay(o, d, 80, hittable);
  let ent = null, best = hit ? hit.t + 0.6 : 80;
  const test = (x, y, z, r, what) => { sph.center.set(x, y, z); sph.radius = r; if (ray.ray.intersectSphere(sph, _hp)) { const t = _hp.distanceTo(o); if (t < best) { best = t; ent = what; } } };
  if (guide) test(guide.position.x, guide.position.y + 0.6, guide.position.z, 0.9, { kind: 'guide' });
  for (const b of buns) if (!b.cured) test(b.m.position.x, b.m.position.y + 0.3, b.m.position.z, 0.6, { kind: 'bun', b });
  for (const m of seedMeshes) test(m.position.x, m.position.y, m.position.z, 0.8, { kind: 'seed', m });
  return { hit, ent };
}
function tapAt(sx, sy, kind) {
  const { hit, ent } = pick(sx, sy);
  if (ent) {
    const e = ent.kind === 'guide' ? guide : ent.kind === 'bun' ? ent.b.m : ent.m;
    const x = e.position.x - 0.5, z = e.position.z - 0.5;
    if (ent.kind === 'guide') task = Math.hypot(guide.position.x - P.x, guide.position.z - P.z) < 6 ? (talk(), null) : { kind: 'walk', x, y: 0, z, t: 0, then: 'talk' };
    else if (ent.kind === 'bun') { if (sim.count(B.FLOWER) <= 0) { toast('Hushlings calm down with a Moonflower.'); sfx('deny'); } else task = { kind: 'cure', bun: ent.b, x, y: 0, z, t: 0 }; }
    else task = { kind: 'walk', x, y: 0, z, t: 0 };
    return;
  }
  act(kind, hit);
}
function hover(sx, sy, show) {
  if (!show || !playing) { ghost.visible = false; sel.visible = false; return; }
  const { hit } = pick(sx, sy);
  if (!hit) { ghost.visible = sel.visible = false; return; }
  let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz; if (hit.id === B.TALLGRASS) { x = hit.x; y = hit.y; z = hit.z; }
  const id = bpWants(x, y, z) || selId();
  ghost.visible = id !== undefined && (mode === 'build' || !TOUCH); ghost.position.set(x + 0.5, y + 0.5, z + 0.5);
  if (id !== undefined) ghost.material.color.setHex(BLOCKS[id].color);
  sel.visible = true; sel.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
}
function toggleLantern() { if (!playing || paused) return; audio.unlock(); sim.setLantern(!sim.s.lanternUp); }
function ringBell() { if (!playing || paused) return; audio.unlock(); if (bellCd > 0) { toast('The bell is still humming…'); return; } sim.ringBell(); }
// ---------- input ----------
const keys = {}; const stick = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
const looks = new Map(); let pinchD = 0, jumpReq = false;
const camS = { yaw: 0, pitch: 0.55, dist: 10, cy: 0, cyaw: 0, cpitch: 0.55, cdist: 10, shake: 0 };
addEventListener('keydown', e => {
  if (!playing) return;
  keys[e.code] = true; audio.unlock();
  if (e.code === 'Space') { jumpReq = true; e.preventDefault(); }
  if (e.code === 'KeyE') { $('craft').classList.contains('hidden') ? openCraft() : closeCraft(); }
  if (e.code === 'Escape') { if (!$('craft').classList.contains('hidden')) closeCraft(); else paused ? closePause() : openPause(); }
  if (e.code === 'KeyQ') setMode(mode === 'mine' ? 'build' : 'mine');
  if (e.code === 'KeyF') toggleLantern();
  if (e.code === 'KeyB') ringBell();
  if (/^Digit[1-9]$/.test(e.code)) { const i = +e.code[5] - 1; if (hotIds[i] !== undefined) { hotSel = i; renderHot(); } }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
const stickEl = $('stick'), knob = stickEl.firstElementChild;
canvas.addEventListener('pointerdown', e => {
  audio.unlock(); if (!playing) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
  if (e.pointerType !== 'mouse' && stick.id === null && e.clientX - rect.left < rect.width * 0.4 && e.clientY - rect.top > rect.height * 0.3) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; stick.t0 = performance.now(); stick.far = false;
    stickEl.style.left = (e.clientX - stickEl.offsetWidth / 2) + 'px'; stickEl.style.top = (e.clientY - stickEl.offsetHeight / 2) + 'px'; stickEl.style.bottom = 'auto'; return;
  }
  const L = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), drag: false, btn: e.button, type: e.pointerType, lp: null };
  looks.set(e.pointerId, L);
  if (looks.size === 2) { const [a, b] = [...looks.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); for (const l of looks.values()) { l.drag = true; clearTimeout(l.lp); } }
  if (e.pointerType !== 'mouse') {
    if (mode === 'build') hover(e.clientX, e.clientY, true);
    L.lp = setTimeout(() => { if (!L.drag && looks.get(e.pointerId) === L) { L.done = true; const m0 = mode; mode = 'build'; hover(L.x, L.y, true); tapAt(L.x, L.y, 'place'); mode = m0; setTimeout(() => hover(0, 0, false), 300); if (navigator.vibrate) navigator.vibrate(12); } }, 480);
  }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId === stick.id) {
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const l = Math.hypot(dx, dy), mx = 52; if (l > mx) { dx *= mx / l; dy *= mx / l; }
    if (l > 10) stick.far = true; stick.x = dx / mx; stick.y = dy / mx; knob.style.transform = `translate(${dx}px,${dy}px)`; return;
  }
  const L = looks.get(e.pointerId);
  if (!L) { if (e.pointerType === 'mouse' && playing) hover(e.clientX, e.clientY, true); return; }
  const dx = e.clientX - L.x, dy = e.clientY - L.y; L.x = e.clientX; L.y = e.clientY;
  if (looks.size === 2) { const [a, b] = [...looks.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinchD && d) camS.dist = clamp(camS.dist * pinchD / d, 4.5, 26); pinchD = d; return; }
  if (!L.drag && Math.hypot(L.x - L.sx, L.y - L.sy) > (L.type === 'mouse' ? 5 : 10)) { L.drag = true; clearTimeout(L.lp); if (L.type !== 'mouse') hover(0, 0, false); }
  if (L.drag) { camS.yaw -= dx * 0.0065; camS.pitch = clamp(camS.pitch + dy * 0.0045, 0.12, 1.25); }
  else if (L.type !== 'mouse' && mode === 'build') hover(L.x, L.y, true);
});
function endPointer(e) {
  if (e.pointerId === stick.id) { if (e.type !== 'pointercancel' && !stick.far && performance.now() - stick.t0 < 300) tapAt(stick.ox, stick.oy, mode === 'build' ? 'place' : 'mine'); stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; stickEl.style.left = ''; stickEl.style.top = ''; stickEl.style.bottom = ''; return; }
  const L = looks.get(e.pointerId); if (!L) return; looks.delete(e.pointerId); clearTimeout(L.lp); if (looks.size < 2) pinchD = 0;
  if (e.type === 'pointercancel' || L.drag || L.done) { if (L.type !== 'mouse') hover(0, 0, false); return; }
  if (L.type === 'mouse') tapAt(L.x, L.y, L.btn === 2 ? 'place' : 'mine');
  else { tapAt(L.x, L.y, mode === 'build' ? 'place' : 'mine'); setTimeout(() => hover(0, 0, false), 250); }
}
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => { camS.dist = clamp(camS.dist * (1 + Math.sign(e.deltaY) * 0.1), 4.5, 26); e.preventDefault(); }, { passive: false });
for (const [id, f] of [['bLantern', toggleLantern], ['bBell', ringBell]]) { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); f(); }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => el.classList.remove('on')); }
const jb = $('bJump'); jb.addEventListener('pointerdown', e => { audio.unlock(); jumpReq = true; jb.classList.add('on'); e.preventDefault(); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) jb.addEventListener(ev, () => jb.classList.remove('on'));
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
document.addEventListener('touchend', () => audio.unlock(), { passive: true });

// ---------- camera ----------
const camTarget = new THREE.Vector3(), dir = new THREE.Vector3();
function updCamera(dt, idle) {
  if (idle) camS.yaw += dt * 0.06;
  const k = 1 - Math.exp(-10 * dt);
  camS.cyaw = lerp(camS.cyaw, camS.yaw, k); camS.cpitch = lerp(camS.cpitch, camS.pitch, k); camS.cdist = lerp(camS.cdist, camS.dist, 1 - Math.exp(-6 * dt));
  camS.cy = lerp(camS.cy, P.y, 1 - Math.exp(-6 * dt));
  camTarget.set(P.x, camS.cy + 0.9, P.z);
  if (idle) camTarget.set(64, SEA + 4, 66);
  dir.set(Math.sin(camS.cyaw) * Math.cos(camS.cpitch), Math.sin(camS.cpitch), Math.cos(camS.cyaw) * Math.cos(camS.cpitch));
  let dist = idle ? 92 : camS.cdist;
  if (!idle) { const h = voxRay(camTarget, dir, dist, camBlock); if (h) dist = Math.max(1.6, h.t - 0.35); }
  camera.position.copy(camTarget).addScaledVector(dir, dist); camera.lookAt(camTarget);
  if (camS.shake > 0 && !settings.low) { camS.shake = Math.max(0, camS.shake - dt * 2); camera.position.x += (Math.random() - 0.5) * camS.shake * 0.25; camera.position.y += (Math.random() - 0.5) * camS.shake * 0.25; }
}

// ---------- frame ----------
let last = performance.now(), fps = 60, frames = 0, bootDone = false, lightScan = 0, qtCache = { t: 0, v: null }, hudT = 0, spawnT = 8, fear = 0, bloodK = 0, scareLock = 0;
const _fw = new THREE.Vector3(), _v = new THREE.Vector3(), _mdir = new THREE.Vector3();
function questTarget() {
  const q = sim.quest(); if (!q) return null;
  if (performance.now() - qtCache.t < 1500) return qtCache.v; qtCache.t = performance.now();
  const near = id => { let best = null, bd = 1e9; const x0 = Math.floor(P.x), z0 = Math.floor(P.z); for (let z = Math.max(0, z0 - 40); z < Math.min(D, z0 + 40); z++) for (let x = Math.max(0, x0 - 40); x < Math.min(W, x0 + 40); x++) { const y = surf(x + 0.5, z + 0.5); for (let yy = y + 1; yy > y - 6 && yy > 0; yy--) if (sim.world.get(x, yy, z) === id) { const d = (x - P.x) ** 2 + (z - P.z) ** 2; if (d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; } break; } } return best; };
  const Lm = C.LANDMARKS, w = sim.world; let v = null;
  const nearWard = () => { let bd = 1e9, r = null; for (const d of w.wards) if (!sim.s.wards.includes(d.id)) { const dd = Math.hypot(d.x - P.x, d.z - P.z); if (dd < bd) { bd = dd; r = { x: d.x + 0.5, z: d.z + 0.5 }; } } return r; };
  if (q.id === 'wood') v = near(B.LOG) || near(B.BIRCH);
  else if (q.id === 'ward') v = { x: w.wards[0].x + 0.5, z: w.wards[0].z + 0.5 };
  else if (q.id === 'wards') v = nearWard();
  else if (q.id === 'fuel') v = sim.count(B.WAX) ? null : near(B.WAXCAP);
  else if (q.id === 'deep') v = w.underground(Math.floor(P.x), Math.floor(P.y), Math.floor(P.z)) ? { x: Lm.cave.x + 0.5, z: Lm.cave.z + 0.5 } : { x: Lm.mountain.x + 2, z: Lm.mountain.z + 22 };
  else if (q.id === 'cure') { const b = buns.find(b => !b.cured); v = b && { x: b.m.position.x, z: b.m.position.z }; }
  else if (q.id === 'embers') { let bd = 1e9; for (const m of seedMeshes) { const d = Math.hypot(m.position.x - P.x, m.position.z - P.z); if (d < bd) { bd = d; v = { x: m.position.x, z: m.position.z }; } } }
  else if (q.id === 'lighthouse') v = { x: w.lighthouse.x + 0.5, z: w.lighthouse.z + 0.5 };
  return qtCache.v = v;
}
function surfaceUnder() {
  if (P.inWater) return 'water';
  const id = sim.world.get(Math.floor(P.x), Math.floor(P.y - 0.1), Math.floor(P.z));
  if ([B.STONE, B.BRICK, B.ASH, B.BEDROCK, B.GLOWSTONE, B.WARDSTONE, B.WARDLIT, B.BRASS, B.GLASS].includes(id)) return 'stone';
  if ([B.PLANKS, B.LOG, B.BIRCH, B.FENCE, B.DOOR, B.ROOF].includes(id)) return 'wood';
  if (id === B.SAND) return 'sand';
  return 'grass';
}
function isLooked(h) {
  if ((h.fade || 0) > 0.85) return false;
  _v.set(h.x, h.m.position.y + 1.8, h.z).sub(camera.position); const dist = _v.length(); if (dist > 40) return false;
  camera.getWorldDirection(_fw); if (_v.dot(_fw) / dist < 0.8) return false;
  const hit = voxRay(camera.position, _v.clone().normalize(), dist - 0.6, camBlock); return !hit;
}
const lightHere = (x, z, y) => sim.lightAt(x, y !== undefined ? y : surf(x, z) + 0.8, z);
function doCaught() { if (caughtT > 0 || sim.s.dawn) return; caughtT = 2.4; sfx('caught'); camS.shake = 0.7; task = null; for (const k in keys) keys[k] = false; }
function updCaught(dt) {
  if (caughtT <= 0) { fadeV = Math.max(0, fadeV - dt * 2); return false; }
  const el = 2.4 - caughtT; caughtT -= dt; const el2 = 2.4 - caughtT;
  fadeV = el2 < 0.9 ? el2 / 0.9 : el2 < 1.4 ? 1 : Math.max(0, 1 - (el2 - 1.4) / 1.0);
  if (el < 1.0 && el2 >= 1.0) { sim.caught(); const h = sim.s.hero; P.x = h.x; P.y = h.y + 0.1; P.z = h.z; P.vx = P.vy = P.vz = 0; camS.cy = P.y;
    for (const hh of hollows) if (Math.hypot(hh.x - P.x, hh.z - P.z) < 24) { hh.state = 'gone'; } spawnT = 12; sfx('wake'); }
  if (caughtT <= 0) caughtT = 0;
  return true;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; fps = lerp(fps, 1 / Math.max(dt, 1e-3), 0.05); frames++;
  const t = now / 1000; U.time.value = t; skyU.time.value = t; PU.time.value = t;
  flushMesh();
  if (!sim) return;
  if (!bootDone && allMeshed()) { bootDone = true; window.__booted = true; $('loading').style.display = 'none'; }
  const inCaught = playing && updCaught(dt);
  const live = playing && !paused && !inCaught;
  if (live) {
    let mx = 0, mz = 0;
    const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), kz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    let ix = stick.x + kx, iz = stick.y + kz; const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const steer = il > 0.12;
    if (steer) {
      if (task && !(task.kind === 'mine' && reachOk(task.x, task.y, task.z, 4.3))) task = null;
      const fx = -Math.sin(camS.yaw), fz = -Math.cos(camS.yaw), rx = Math.cos(camS.yaw), rz = -Math.sin(camS.yaw);
      mx = rx * ix - fx * iz; mz = rz * ix - fz * iz;
    }
    const auto = runTask(dt); if (!steer) { mx = auto.mx; mz = auto.mz; }
    physics(dt, mx, mz, jumpReq || (keys.Space && P.ground)); jumpReq = false;
    const spd = Math.hypot(P.vx, P.vz);
    if (spd > 0.4) { P.yaw = Math.atan2(P.vx, P.vz); P.walk += dt * spd * 3.2; P.stepT -= dt; if (P.stepT <= 0 && (P.ground || P.inWater)) { P.stepT = 0.34; sfx('step', surfaceUnder()); } }
    sim.s.hero.x = P.x; sim.s.hero.y = P.y; sim.s.hero.z = P.z;
    for (const m of seedMeshes.slice()) if (Math.hypot(m.position.x - P.x, m.position.y - (P.y + 0.6), m.position.z - P.z) < 1.5) sim.collectSeed(m.userData.sd.id);
    // courage, fuel, blood moon
    if (sim.tick(dt, fear, coverAt()) === 'faint') { toast('The dark is too much…'); doCaught(); }
    // Hollows
    const heroL = sim.lightAt(P.x, P.y + 0.6, P.z), blood = sim.s.bloodT > 0; let minD = 99;
    for (const h of hollows) {
      if (h.state === 'gone') continue;
      h.scared = Math.max(0, (h.scared || 0) - dt);
      const env = { hx: P.x, hz: P.z, light: (x, z) => h.scared > 0 ? 1 : lightHere(x, z), looked: isLooked(h), dark: 1 - heroL, blood };
      const prev = h.state; C.stepHollow(h, env, dt);
      if (h.state === 'flee' && prev !== 'flee' && Math.hypot(h.x - P.x, h.z - P.z) < 20) sfx('hollowfade');
      if (h.state === 'caught') { h.state = 'stalk'; doCaught(); }
      if (h.state !== 'gone' && h.fade < 0.8) minD = Math.min(minD, Math.hypot(h.x - P.x, h.z - P.z));
    }
    for (const h of hollows.filter(h => h.state === 'gone')) { if (!h.dead) { h.dead = true; burst(h.x, h.m.position.y + 1.4, h.z, 0x8fd8e8, 14, 2.2, { g: -1.5, s: 0.8 }); } ents.remove(h.m); }
    hollows = hollows.filter(h => h.state !== 'gone');
    const want = sim.s.dawn ? 0 : sim.s.quest < 2 ? 1 : blood ? 5 : sim.s.quest >= 8 ? 3 : 2;
    spawnT -= dt; if (hollows.length < want && spawnT <= 0) { spawnHollow(false); spawnT = 10 + Math.random() * 14; }
    // Hushlings creep, freeze in light; cured Puffbuns follow
    for (const b of buns) {
      if (b.cured) continue;
      b.x = b.m.position.x; b.z = b.m.position.z; b.hushT = Math.max(0, b.hushT - dt);
      C.stepHush(b, { hx: P.x, hz: P.z, light: (x, z) => sim.lightAt(x, surf(x, z) + 0.5, z, false), lanternNear: sim.s.lanternUp && Math.hypot(b.x - P.x, b.z - P.z) < 6.5 }, dt);
      if (surf(b.x, b.z) > SEA + 1 && surf(b.x, b.z) <= b.m.position.y + 1.1) { b.m.position.x = b.x; b.m.position.z = b.z; }
      b.m.position.y = lerp(b.m.position.y, surf(b.m.position.x, b.m.position.z), 0.3);
      if (b.state !== 'frozen' && b.state !== 'idle') b.m.rotation.y = Math.atan2(P.x - b.x, P.z - b.z);
      if (b.state === 'touch' && b.hushT <= 0) { b.hushT = 2; sim.s.courage = Math.max(0, sim.s.courage - 12); sfx('hush'); P.vx += (P.x - b.x) * 6; P.vz += (P.z - b.z) * 6; toast('A Hushling! Light freezes them.'); }
      if (b.state === 'creep' && Math.random() < dt * 0.5) sfx('hush');
    }
    if (minD < 99 && Math.random() < dt * 0.2) sfx('whisper');
    fear = clamp(Math.max(1 - minD / 18, 0) + (1 - sim.s.courage / 100) * 0.5, 0, 1);
    // scares (Gentle turns the jump scares off)
    scareLock -= dt;
    const S = sim.s.scares || (sim.s.scares = {});
    const ent = { x: C.LANDMARKS.mountain.x + 2, z: C.LANDMARKS.mountain.z + 22 };
    if (!S.cave && sim.world.underground(Math.floor(P.x), Math.floor(P.y), Math.floor(P.z)) && Math.hypot(P.x - ent.x, P.z - ent.z) < 14) { S.cave = true;
      if (!settings.gentle && !sim.s.dawn) { const dx = C.LANDMARKS.cave.x - P.x, dz = C.LANDMARKS.cave.z - P.z, l = Math.hypot(dx, dz) || 1; const h = spawnHollow(false, { x: P.x + dx / l * 6, z: P.z + dz / l * 6 }); if (h) { h.fade = 0; h.m.position.y = P.y - 0.3; } sfx('sting'); camS.shake = 1; }
      else sfx('whisper'); }
    if (!S.low && sim.s.courage < 25 && scareLock <= 0 && !sim.s.dawn) { S.low = true;
      if (!settings.gentle) { camera.getWorldDirection(_fw); const h = spawnHollow(false, { x: P.x + _fw.x * 9, z: P.z + _fw.z * 9 }); if (h) h.fade = 0.1; sfx('sting'); camS.shake = 0.6; } else sfx('whisper'); }
    saveT += dt; if (saveT > 15) { saveT = 0; save(); }
    if (!task && crack.visible) crack.visible = false;
  }
  // hero animation: squash & stretch, waddle, blink, bonk lean
  const hb = hero.body; P.squash = lerp(P.squash, 0, 1 - Math.exp(-9 * dt));
  const sp = Math.hypot(P.vx, P.vz), wk = Math.min(1, sp / 3), wob = Math.sin(P.walk * 2) * wk;
  const st = !P.ground && !P.inWater ? clamp(Math.abs(P.vy) * 0.025, 0, 0.18) : 0, sq = P.squash;
  hb.scale.set(1 + sq * 0.5 - st * 0.5, 1 - sq + st + Math.sin(now / 400) * 0.015, 1 + sq * 0.5 - st * 0.5);
  hb.position.y = Math.abs(wob) * 0.08 + (P.inWater ? Math.sin(now / 300) * 0.05 : 0); hb.rotation.z = wob * 0.08 + (fear > 0.5 ? Math.sin(t * 40) * 0.01 * fear : 0);
  P.bonkT = Math.max(0, P.bonkT - dt); const bk = P.bonkT > 0 ? Math.sin((1 - P.bonkT / 0.22) * Math.PI) : 0;
  hb.rotation.x = bk * 0.45; hero.pick.visible = !!sim.s.tool; hero.pick.rotation.x = 0.6 - bk * 2.2; hero.pickHead.material.color.setHex(sim.s.tool >= 2 ? 0x8d8a9a : 0x8a6a48);
  const fs = Math.sin(P.walk * 2) * Math.min(1, sp / 2);
  hero.feet[0].position.z = 0.05 + fs * 0.16; hero.feet[1].position.z = 0.05 - fs * 0.16;
  hero.feet[0].position.y = 0.06 + Math.max(0, fs) * 0.08; hero.feet[1].position.y = 0.06 + Math.max(0, -fs) * 0.08;
  const up = playing && sim.s.lanternUp;
  hero.arms[0].position.y = 0.38 + wob * 0.05 + bk * 0.15 + (up ? 0.4 : 0); hero.arms[1].position.y = 0.38 - wob * 0.05 + bk * 0.15;
  hero.lan.position.lerp(_v.set(up ? -0.32 : -0.5, up ? 1.05 : 0.32, up ? 0.12 : 0.15), 1 - Math.exp(-10 * dt)); hero.lan.rotation.z = Math.sin(t * 3 + P.walk) * 0.15;
  const flick = 0.85 + 0.1 * Math.sin(t * 23) + 0.06 * Math.sin(t * 37 + 1.3);
  hero.lanCage.material.emissiveIntensity = up ? 2.5 * flick : 0; hero.lanCore.visible = up;
  P.blink -= dt; if (P.blink < -0.12) P.blink = 2 + Math.random() * 3; P.happy = Math.max(0, P.happy - dt);
  const ey = P.blink < 0 ? 0.1 : bk > 0.3 ? 0.25 : P.happy > 0 ? 0.45 : fear > 0.6 ? 1.25 : 1; for (const e of hero.eyes) e.scale.y = lerp(e.scale.y, ey, 0.5);
  hero.mouth.scale.set(P.happy > 0 || bk > 0.3 ? 1.5 : 1, P.happy > 0 ? 1.6 : 1, 1); hero.mouth.rotation.z = fear > 0.5 && P.happy <= 0 ? 0 : Math.PI;
  hero.g.visible = playing;
  hero.g.position.set(P.x, P.y, P.z);
  let dy = P.yaw - hero.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); hero.g.rotation.y += dy * (1 - Math.exp(-12 * dt));
  let gy = P.y; for (let y = Math.floor(P.y + 0.2); y > 0; y--) if (BLOCKS[sim.world.get(Math.floor(P.x), y - 1, Math.floor(P.z))].solid) { gy = y; break; }
  blob.visible = playing; blob.position.set(P.x, gy + 0.02, P.z); blob.scale.setScalar(clamp(1 - (P.y - gy) * 0.15, 0.4, 1));
  // creatures
  if (guide) { const gi = guide.userData.inner; guide.lookAt(P.x, guide.position.y, P.z); gi.position.y = 0.35 + Math.sin(t * 1.5) * 0.15; guide.userData.body.material.opacity = 0.38 + Math.sin(t * 7) * 0.05 + (Math.random() < 0.02 ? -0.2 : 0); guide.userData.mark.position.y = 1.9 + Math.sin(t * 4) * 0.1; guide.userData.mark.rotation.y = t * 2; }
  for (const h of hollows) {
    const m = h.m; m.position.x = h.x; m.position.z = h.z; m.position.y = lerp(m.position.y, surf(h.x, h.z) - 0.1, 1 - Math.exp(-4 * dt));
    m.lookAt(P.x, m.position.y, P.z);
    const op = clamp(1 - (h.fade || 0), 0, 1); m.userData.body.material.opacity = 0.94 * op; m.visible = op > 0.02;
    for (const e of m.userData.eyes.children) { e.material.opacity = op * (h.state === 'frozen' ? 1 : 0.75 + 0.25 * Math.sin(t * 9 + h.x)); }
    m.userData.glow.material.opacity = 0.6 * op; const s = h.state === 'frozen' ? 1 : 1 + Math.sin(t * 2 + h.z) * 0.02; m.scale.set(1, s, 1);
    if (Math.random() < dt * 6 && op > 0.2) burst(h.x + (Math.random() - 0.5) * 0.6, m.position.y + 0.2 + Math.random() * 2, h.z + (Math.random() - 0.5) * 0.6, 0x0d0b14, 1, 0.6, { g: -0.8, s: 1.6 });
  }
  let fi = 0;
  for (const b of buns) {
    const m = b.m;
    if (!b.cured) { m.userData.body.scale.set(1 + Math.sin(t * 6 + b.i) * 0.03, 1 - Math.sin(t * 6 + b.i) * 0.03, 1); for (const e of m.userData.eyes) e.material.color.setHex(b.state === 'frozen' ? 0x6a5a8a : 0xd59bff); continue; }
    b.t -= dt; let tx = b.tx, tz = b.tz;
    if (b.follow && playing) { const k = 1.3 + (fi++) * 0.9; tx = P.x - Math.sin(P.yaw) * k; tz = P.z - Math.cos(P.yaw) * k; }
    else if (b.t < 0) { b.t = 2 + Math.random() * 3; b.tx = b.home.x + (Math.random() - 0.5) * 10; b.tz = b.home.z + (Math.random() - 0.5) * 10; }
    const dx = tx - m.position.x, dz = tz - m.position.z, dd = Math.hypot(dx, dz), g = surf(m.position.x, m.position.z);
    if (b.hop <= 0 && dd > 0.6 && m.position.y <= g + 0.01) { b.vy = 4.2; b.hop = 1; }
    if (m.position.y > g || b.vy > 0) {
      b.vy -= 18 * dt; const s = Math.min(dd, (b.follow ? 4.5 : 1.6) * dt) / (dd || 1), nx = m.position.x + dx * s, nz = m.position.z + dz * s, ng = surf(nx, nz);
      if ((ng <= m.position.y + 1.1 && ng > SEA + 0.5) || b.follow) { m.position.x = nx; m.position.z = nz; }
      m.position.y += b.vy * dt; if (dd > 0.1) m.rotation.y = Math.atan2(dx, dz);
    }
    const g2 = surf(m.position.x, m.position.z);
    if (m.position.y <= g2) { m.position.y = g2; b.vy = 0; b.hop -= dt * 6; }
    if (b.follow && dd > 14) { m.position.set(P.x, P.y, P.z); }
    const air = m.position.y - g2; m.userData.body.scale.set(air < 0.05 ? 1.12 : 0.95, air < 0.05 ? 0.86 : 1.1, 1);
  }
  for (const m of seedMeshes) { m.rotation.y = t * 1.6; m.rotation.x = t * 0.7; m.position.y = m.userData.sd.y + Math.sin(t * 2 + m.position.x) * 0.12; m.children[0].material.opacity = 0.6 + 0.3 * Math.sin(t * 8 + m.position.z); }
  // ---------- atmosphere ----------
  if (dawnT > 0 && dawnT < 1) dawnT = Math.min(1, dawnT + dt / 14);
  const dw = playing ? smooth(0, 1, sim.s.dawn ? Math.max(dawnT, 0.0001) : 0) : 0;
  const nightK = playing ? clamp((sim.darkness() - 0.55) / 0.45, 0, 1) : 0.35;
  bloodK = lerp(bloodK, playing && sim.s.bloodT > 0 ? 1 : 0, 1 - Math.exp(-1.2 * dt)); const bl = bloodK * (1 - dw);
  // storms: rain, wet surfaces, lightning that lights the island with harsh shadows
  if (!sim.s.dawn) { storm.t -= dt; if (storm.t < 0) { storm.on = !storm.on; storm.t = storm.on ? 55 + Math.random() * 45 : 80 + Math.random() * 120; } } else storm.on = false;
  storm.amt = lerp(storm.amt, storm.on ? 1 : 0, 1 - Math.exp(-0.4 * dt));
  if (storm.on && storm.amt > 0.6) { storm.next -= dt; if (storm.next < 0) { storm.next = 6 + Math.random() * 12; storm.flash = 1; storm.fdir = Math.random() * 6.28; setTimeout(() => sfx('thunder'), 300 + Math.random() * 1700); } }
  storm.flash = Math.max(0, storm.flash - dt * 2.6);
  const fl = storm.flash > 0 ? storm.flash * (0.55 + 0.45 * Math.sin(storm.flash * 40)) * (settings.low ? 0.3 : 1) : 0;
  skyU.night.value = nightK * (1 - dw); skyU.blood.value = bl; skyU.dawn.value = dw; skyU.flash.value = fl;
  skyU.top.value.copy(palMix(0, nightK, bl, dw)); skyU.hor.value.copy(palMix(1, nightK, bl, dw));
  // moon hangs high in the south-west and drifts; at dawn the sun climbs from the east
  const ma = 0.9 + Math.sin((playing ? sim.s.time : 0.3) * Math.PI * 2) * 0.25;
  _mdir.set(Math.cos(ma) * 0.55, 0.42 + nightK * 0.12 - bl * 0.3, Math.sin(ma) * 0.75).normalize();
  if (dw > 0) _mdir.lerp(_v.set(0.75, 0.15 + dw * 0.45, 0.35).normalize(), dw).normalize();
  skyU.sunDir.value.copy(_mdir); skyU.sunCol.value.copy(palMix(2, nightK, bl, dw)).multiplyScalar(0.25 + dw * 0.75);
  scene.fog.color.copy(skyU.hor.value).lerp(skyU.top.value, 0.3).lerp(_cc.setHex(0x4a5c78), 0.55 * (1 - dw)).multiplyScalar(1 + fl * 1.5);
  scene.fog.near = lerp(lerp(0.0115, 0.0145, nightK) * (1 + storm.amt * 0.25) * (1 + bl * 0.1) * (settings.gentle ? 0.85 : 1), 0.0035, dw);
  scene.fog.far = lerp(SEA + 5, SEA - 6, dw);
  const fx = playing ? P.x : 64, fz = playing ? P.z : 64, fy = playing ? P.y : SEA;
  let ld = _mdir; if (fl > 0) ld = _v.set(Math.cos(storm.fdir) * 0.4, 1, Math.sin(storm.fdir) * 0.4).normalize();
  moon.position.set(fx + ld.x * 70, fy + ld.y * 70, fz + ld.z * 70); moon.target.position.set(fx, fy, fz);
  const big = !playing; moon.shadow.camera.left = moon.shadow.camera.bottom = big ? -75 : -32; moon.shadow.camera.right = moon.shadow.camera.top = big ? 75 : 32; moon.shadow.camera.updateProjectionMatrix();
  moon.color.copy(palMix(2, nightK, bl, dw)).lerp(_cc.setHex(0xeef2ff), Math.min(1, fl)); moon.intensity = palNum(3, nightK, bl, dw) + fl * 7;
  const gb = settings.gentle ? 1.18 : 1;
  hemi.intensity = lerp(1.75 - nightK * 0.15, 1.3, dw) * gb + fl * 0.6; hemi.color.setHex(0x8ea6dc).lerp(skyU.top.value, 0.15).lerp(_cc.setHex(0xfff2e0), dw); hemi.groundColor.setHex(0x2c3e4c).lerp(_cc.setHex(0x8a7a5a), dw);
  amb.intensity = lerp(1.05, 0.35, dw) * gb; amb.color.setHex(0x3c4e70).lerp(_cc.setHex(0xfff0e0), dw);
  rimU.value.setHex(0x8fb4ff).multiplyScalar(0.38).lerp(_cc.setHex(0xffd9a0).multiplyScalar(0.35), dw); U.glow.value = 1 - dw * 0.5; U.wet.value = storm.amt * (1 - dw); U.dawn.value = dw;
  sky.position.copy(camera.position);
  if (wisps) wisps.material.uniforms.vis.value = 1 - dw;
  if (motes) { motes.material.uniforms.cam.value.copy(camera.position); motes.material.uniforms.vis.value = 1 - dw * 0.8; }
  if (rain) { rain.visible = storm.amt > 0.02; rain.material.uniforms.cam.value.copy(camera.position); rain.material.uniforms.amt.value = storm.amt; }
  if (mist) { mist.material.uniforms.col.value.copy(scene.fog.color).multiplyScalar(1.3); mist.material.uniforms.amt.value = 1 - dw; }
  // light pool: nearest light blocks get real flickering point lights, halos and soft shafts
  lightScan -= dt;
  if (lightScan < 0 && lightPool.length) { lightScan = 0.35; const list = sim.lights.slice().sort((p, q) => Math.hypot(p[0] - P.x, p[2] - P.z) - Math.hypot(q[0] - P.x, q[2] - P.z));
    lightPool.forEach((l, i) => { const p = list[i]; l.userData.src = p && Math.hypot(p[0] - P.x, p[2] - P.z) < 45 ? p : null; }); }
  lightPool.forEach((l, i) => {
    const p = l.userData.src, hs = halos[i], sh = shafts[i];
    if (!p) { l.intensity = 0; hs.material.opacity = 0; sh.material.uniforms.a.value = 0; return; }
    const id = p[4], cold = id === B.WARDLIT || id === B.WARDLIGHT || id === B.GLOWSTONE, f = cold ? 0.92 + 0.08 * Math.sin(t * 2 + i) : 0.78 + 0.14 * Math.sin(t * 17 + i * 3) + 0.08 * Math.sin(t * 31 + i * 7);
    const base = id === B.CAMPFIRE ? 7 : id === B.LAMP ? 10 : id === B.TORCH ? 3.5 : id === B.GLOWSTONE ? 1.6 : cold ? 5 : 4.5;
    l.color.setHex(id === B.GLOWSTONE ? 0x7fe8c8 : cold ? 0x9fdcff : id === B.CAMPFIRE ? 0xff8a3a : 0xffa850);
    l.distance = p[3] * 1.8; l.position.set(p[0] + Math.sin(t * 9 + i) * 0.03, p[1] + (id === B.TORCH ? 0.35 : 0.2), p[2]); l.intensity = base * 1.5 * f * (1 - dw * 0.6) * (settings.low ? 0.8 : 1);
    hs.position.copy(l.position); hs.material.color.copy(l.color); hs.material.opacity = (cold ? 0.35 : 0.5) * f * (1 - dw * 0.7); const hsz = id === B.CAMPFIRE ? 4 : id === B.TORCH ? 2 : 2.8; hs.scale.set(hsz, hsz, 1);
    const shaftOn = !settings.low && (id === B.LANTERN || id === B.TORCH || id === B.CAMPFIRE || id === B.WARDLIGHT);
    sh.position.set(p[0], p[1] + 0.5, p[2]); sh.material.uniforms.col.value.copy(l.color); sh.material.uniforms.a.value = shaftOn ? 0.16 * f * (1 - dw) : 0; sh.scale.set(id === B.CAMPFIRE ? 1.4 : 1, 1, id === B.CAMPFIRE ? 1.4 : 1);
  });
  if (heroLamp) {
    hero.lan.getWorldPosition(heroLamp.position); heroLamp.position.y += 0.55;
    heroLamp.intensity = up ? 6.5 * flick * (1 - dw * 0.7) : 0;
    const hsft = heroLamp.userData.shaft; hsft.position.copy(heroLamp.position); hsft.position.y += 0.2; hsft.material.uniforms.a.value = up && !settings.low ? 0.06 * flick : 0;
  }
  for (const f of wardFx) {
    const lit = playing && sim.s.wards.includes(f.wd.id); f.on = lerp(f.on, lit ? 1 : 0, 1 - Math.exp(-2 * dt)); f.flare = Math.max(0, (f.flare || 0) - dt * 0.4);
    f.ring.material.opacity = f.on * (0.6 + 0.3 * Math.sin(t * 3)); f.ring.rotation.z = t * 0.8; f.ring2.rotation.z = -t * 1.3; f.ring.position.y = 0.2 + Math.sin(t * 1.5) * 0.15; f.ring2.position.y = 0.5 + Math.sin(t * 1.5 + 1) * 0.15;
    f.halo.material.opacity = f.on * 0.5 + f.flare * 0.8; f.sh.material.uniforms.a.value = f.on * (0.1 + f.flare * 0.4) * (1 - dw * 0.7); f.sh.rotation.x = Math.PI;
  }
  if (beam) { beam.children[0].rotation.y = t * 0.8; beam.children[1].intensity = 15 + (1 - dw) * 30; }
  if (playing && Math.random() < dt * 10) { const L = C.LANDMARKS.waterfall; if (Math.hypot(L.x - P.x, L.z - P.z) < 40) burst(L.x + 0.5 + Math.random(), SEA + 0.9, L.z - 1 + Math.random() * 3, 0x8fa8b8, 1, 2.5, { s: 1.3 }); }
  if (cottageFx) { cottageFx.t -= dt; if (cottageFx.t < 0) { cottageFx.t = 0.35; } cottageFx.light.intensity = 4 + Math.sin(t * 13) * 0.6; }
  if (arrow) {
    const tgt = live ? questTarget() : null;
    arrow.visible = !!tgt && Math.hypot(tgt.x - P.x, tgt.z - P.z) > 7 && !task;
    if (arrow.visible) { arrow.position.set(P.x, P.y + 1.9 + Math.sin(t * 4) * 0.08, P.z); arrow.lookAt(tgt.x, P.y + 1.9, tgt.z); }
  }
  // HUD + audio
  hudT -= dt; if (hudT < 0 && playing) { hudT = 0.2; $('courageBar').style.width = sim.s.courage + '%'; $('courage').classList.toggle('low', sim.s.courage < 30); $('fuelBar').style.width = sim.s.fuel + '%';
    if (Math.floor(t) !== Math.floor(t - 0.2)) { const q = sim.quest(); if (q && (q.id === 'shelter' || q.id === 'survive')) renderQuest(); } }
  audio.fear = playing ? fear * (1 - dw) : 0.1; audio.rain = storm.amt; audio.blood = bl > 0.5; audio.wind = 0.4 + storm.amt * 0.6; audio.night = nightK; if (playing) audio.dawn = !!sim.s.dawn; else audio.dawn = false;
  audio.update(dt, playing && !paused);
  updParts(dt); updFlyers(dt);
  updCamera(dt, !playing);
  // post settings
  const cour = playing ? sim.s.courage : 100;
  PU.sat.value = lerp(0.88, 0.95, dw); PU.exposure.value = lerp(1.25, 1.0, dw); PU.vig.value = lerp(0.42, 0.22, dw); PU.lift.value = 1 - dw * 0.7;
  PU.bright.value = clamp(settings.bright || 1.3, 0.6, 1.8) * (settings.gentle ? 1.12 : 1);
  PU.grain.value = settings.low ? 0 : lerp(0.022, 0.008, dw); PU.ca.value = settings.low || settings.gentle ? 0 : smooth(25, 3, cour) * 0.45 + fear * 0.08;
  PU.heart.value = settings.low ? 0 : clamp(fear * 0.55 + smooth(35, 5, cour) * 0.45, 0, 1) * (1 - dw) * (settings.gentle ? 0.5 : 1); PU.fear.value = fear; PU.flash.value = fl * 0.22; PU.fade.value = fadeV; PU.blood.value = bl; PU.dawn.value = dw;
  PU.tint.value.setRGB(lerp(0.9, 1.05, dw), lerp(0.97, 1.0, dw), lerp(1.08, 0.93, dw));
  PU.bloom.value = lerp(0.85, 0.75, dw);
  let raysOn = post.ok && Q().rays && !settings.low;
  if (raysOn) {
    _v.copy(camera.position).addScaledVector(_mdir, 100).project(camera); camera.getWorldDirection(_fw);
    let str = 0;
    if (_fw.dot(_mdir) > 0 && Math.abs(_v.x) < 1.4 && Math.abs(_v.y) < 1.4) { raysMat.uniforms.lp.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5); str = 1.2 * smooth(1.4, 0.6, Math.max(Math.abs(_v.x), Math.abs(_v.y))); }
    else if (up && heroLamp) { _v.copy(heroLamp.position).project(camera); raysMat.uniforms.lp.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5); str = 0.4; }
    raysMat.uniforms.str.value = str * (1 - dw * 0.4); PU.rays.value = 1; raysOn = str > 0.01;
  }
  renderFrame(raysOn);
}

// ---------- test / debug API ----------
window.HI = {
  get sim() { return sim; }, get P() { return P; }, get fps() { return fps; }, get frames() { return frames; }, get playing() { return playing; }, audio, camS, settings,
  start, save, showTitle, tapAt, setMode, openCraft, closeCraft, openPause, closePause, startBlueprint, get mode() { return mode; },
  get meshed() { return allMeshed(); }, get worker() { return !!worker; }, get chunkCount() { return chunks.size; }, get task() { return task; },
  get hollows() { return hollows; }, get buns() { return buns; }, get post() { return { ok: post.ok, float: post.float, quality: settings.quality, w: rtScene && rtScene.width, h: rtScene && rtScene.height }; },
  get canvasRect() { return rect; }, get storm() { return storm; }, get fear() { return fear; }, get dawnT() { return dawnT; }, get moonYaw() { return Math.atan2(_mdir.x, _mdir.z); },
  spawnHollow: (x, z) => { const h = spawnHollow(false, { x, z }); if (h) h.fade = 0; return !!h; }, isLooked, toggleLantern, ringBell, setQuality,
  setStorm(on, flash) { storm.on = on; storm.amt = on ? 1 : 0; storm.t = 999; if (flash) storm.flash = 1; },
  setHero(x, y, z) { P.x = x; P.y = y; P.z = z; P.vx = P.vy = P.vz = 0; camS.cy = y; },
  setTime(t) { sim.s.time = t; }, view(yaw, pitch, dist) { camS.yaw = camS.cyaw = yaw; if (pitch !== undefined) camS.pitch = camS.cpitch = pitch; if (dist !== undefined) camS.dist = camS.cdist = dist; },
  project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height, z: v.z }; },
  give(id, n) { sim.add(id, n); renderHot(); }, renderHot, renderQuest, selectItem(id) { renderHot(); const i = hotIds.indexOf(id); if (i >= 0) { hotSel = i; renderHot(); } return i; },
  _dbg: { scene, MAT, PU, ents }, surf: (x, z) => surf(x, z), pickAt(x, y) { const r = pick(x, y); return { hit: r.hit && [r.hit.x, r.hit.y, r.hit.z, r.hit.id], ent: r.ent && r.ent.kind }; }, hideBubble() { $('bubble').classList.add('hidden'); }, dawnNow() { dawnT = 1; }, freezeCreatures() { for (const h of hollows) { h.state = 'gone'; } spawnT = 1e9; },
};

initPost(); resize(); applyLow();
showTitle().then(() => requestAnimationFrame(frame));
