'use strict';
/* Extra AI masks: people parts (MediaPipe selfie-multiclass), facial features (MediaPipe Face Landmarker),
   Depth (Depth-Anything-V2-small, int8 ONNX via onnxruntime-web). All lazy-loaded; heuristic fallbacks. */
(()=>{
let mcP=null, flP=null, ortP=null; const once={};
const vision=()=>import('./mediapipe/vision_bundle.mjs');
const fsr=async v=>v.FilesetResolver.forVisionTasks(new URL('mediapipe/wasm',location.href).href);
const U=n=>new URL(n,location.href).href;
async function multiclass(){ if(!mcP) mcP=(async()=>{ const v=await vision(); return v.ImageSegmenter.createFromOptions(await fsr(v),{baseOptions:{modelAssetPath:U('mediapipe/selfie_multiclass_256x256.tflite'),delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true}); })(); return mcP; }
async function landmarker(){ if(!flP) flP=(async()=>{ const v=await vision(); return v.FaceLandmarker.createFromOptions(await fsr(v),{baseOptions:{modelAssetPath:U('mediapipe/face_landmarker.task'),delegate:'CPU'},runningMode:'IMAGE',numFaces:6,minFaceDetectionConfidence:0.4}); })(); return flP; }
// selfie multiclass: 0 bg, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 others
const mcCache=new Map();
async function partsFor(D,cv){ if(mcCache.has(D.tag+D.w)) return mcCache.get(D.tag+D.w); const seg=await multiclass(); const r=seg.segment(cv);
  const maps=r.confidenceMasks.map(m=>{ const a=window.aiResize(m.getAsFloat32Array(),m.width,m.height,D.w,D.h); m.close&&m.close(); return a; }); mcCache.set(D.tag+D.w,maps); return maps; }
const MC={person:m=>m[0].map(v=>1-v),hair:m=>m[1],skin:m=>m[2].map((v,i)=>Math.min(1,v+m[3][i])),faceskin:m=>m[3],clothes:m=>m[4]};
for(const k of Object.keys(MC)) (window.aiExtra=window.aiExtra||{})[k]=async(D,cv)=>{ const maps=await partsFor(D,cv); return {alpha:MC[k](maps),how:'MediaPipe multiclass selfie segmentation'}; };
// facial features from 478 landmarks
const LIPS_O=[61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185], LIPS_I=[78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191];
const EYE_L=[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246], EYE_R=[263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466];
const BROW_L=[70,63,105,66,107,55,65,52,53,46], BROW_R=[300,293,334,296,336,285,295,282,283,276];
const lmCache=new Map();
async function faces(D,cv){ const k=D.tag+D.w; if(lmCache.has(k)) return lmCache.get(k); const fl=await landmarker(); const r=fl.detect(cv); const f=r.faceLandmarks||[]; lmCache.set(k,f); return f; }
function featMask(D,list,kind){ const c=document.createElement('canvas'); c.width=D.w; c.height=D.h; const g=c.getContext('2d'); g.fillStyle='#fff'; g.strokeStyle='#fff'; g.lineJoin='round';
  const P=(lm,ids)=>ids.map(i=>[lm[i].x*D.w,lm[i].y*D.h]); const poly=(pts)=>{ g.moveTo(pts[0][0],pts[0][1]); pts.slice(1).forEach(p=>g.lineTo(p[0],p[1])); g.closePath(); };
  for(const lm of list){ const fw=Math.hypot((lm[454].x-lm[234].x)*D.w,(lm[454].y-lm[234].y)*D.h);
    g.beginPath(); if(kind==='lips'){ poly(P(lm,LIPS_O)); poly(P(lm,LIPS_I).reverse()); g.fill('evenodd'); continue; }
    if(kind==='eyes'){ poly(P(lm,EYE_L)); poly(P(lm,EYE_R)); g.fill(); g.lineWidth=fw*0.012; g.stroke(); continue; }
    if(kind==='brows'){ poly(P(lm,BROW_L)); poly(P(lm,BROW_R)); g.fill(); g.lineWidth=fw*0.015; g.stroke(); continue; }
    if(kind==='irises'&&lm.length>=478){ for(const c0 of [468,473]){ const cx=lm[c0].x*D.w, cy=lm[c0].y*D.h; const r=[1,2,3,4].reduce((a,j)=>a+Math.hypot(lm[c0+j].x*D.w-cx,lm[c0+j].y*D.h-cy),0)/4; g.moveTo(cx+r,cy); g.arc(cx,cy,r,0,7); } g.fill(); } }
  g.filter='blur('+Math.max(0.6,D.w/1400)+'px)'; const c2=document.createElement('canvas'); c2.width=D.w; c2.height=D.h; const g2=c2.getContext('2d'); g2.filter='blur('+Math.max(0.6,D.w/1400)+'px)'; g2.drawImage(c,0,0);
  const d=g2.getImageData(0,0,D.w,D.h).data; const a=new Float32Array(D.w*D.h); for(let i=0;i<a.length;i++) a[i]=d[i*4+3]/255; return a; }
for(const k of ['eyes','irises','lips','brows']) window.aiExtra[k]=async(D,cv)=>{ const f=await faces(D,cv); if(!f.length) throw new Error('no face found'); return {alpha:featMask(D,f,k),how:`Face Landmarker, ${f.length} face(s)`,raw:true}; };
// Depth
async function ort(){ if(!ortP) ortP=(async()=>{ const o=await import('./ort/ort.wasm.min.mjs'); o.env.wasm.wasmPaths=U('ort/'); o.env.wasm.numThreads=self.crossOriginIsolated?Math.min(4,navigator.hardwareConcurrency||2):1;
  const s=await o.InferenceSession.create(U('models/depth_anything_v2_small_q8.onnx'),{executionProviders:['wasm'],graphOptimizationLevel:'all'}); return {o,s}; })(); return ortP; }
window.aiExtra.depth=async(D,cv)=>{ const t0=performance.now();
  try{ const {o,s}=await ort(); const L=(window.isTouch||matchMedia('(pointer:coarse)').matches)?308:392; const k=L/Math.max(D.w,D.h); const w=Math.max(14,Math.round(D.w*k/14)*14), h=Math.max(14,Math.round(D.h*k/14)*14);
    const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); g.drawImage(cv,0,0,w,h); const d=g.getImageData(0,0,w,h).data;
    const M=[0.485,0.456,0.406], S=[0.229,0.224,0.225]; const x=new Float32Array(3*w*h); for(let i=0;i<w*h;i++) for(let ch=0;ch<3;ch++) x[ch*w*h+i]=(d[i*4+ch]/255-M[ch])/S[ch];
    const feeds={}; feeds[s.inputNames[0]]=new o.Tensor('float32',x,[1,3,h,w]); const out=(await s.run(feeds))[s.outputNames[0]]; const dims=out.dims, ow=dims[dims.length-1], oh=dims[dims.length-2]; const z=out.data;
    const srt=Float32Array.from(z).sort(); const lo=srt[Math.floor(srt.length*0.01)], hi=srt[Math.floor(srt.length*0.99)]; const n=new Float32Array(ow*oh); for(let i=0;i<n.length;i++) n[i]=Math.min(1,Math.max(0,(z[i]-lo)/((hi-lo)||1)));
    window.__depthMs=Math.round(performance.now()-t0); return {alpha:window.aiResize(n,ow,oh,D.w,D.h),how:`Depth-Anything-V2 small (${ow}×${oh})`}; }
  catch(e){ console.warn('depth model unavailable, using heuristic',e); const a=new Float32Array(D.w*D.h); for(let y=0;y<D.h;y++) for(let x2=0;x2<D.w;x2++) a[y*D.w+x2]=Math.pow(y/D.h,1.3); return {alpha:a,how:'heuristic (model unavailable)'}; } };
})();
