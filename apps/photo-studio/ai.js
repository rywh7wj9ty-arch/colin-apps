'use strict';
/* AI masks: Subject (MediaPipe DeepLab-v3 segmentation, lazy-loaded) and Sky (segmentation + colour/texture/connectivity),
   refined with an edge-aware guided filter. Falls back to heuristics when the model can't load. */
addEventListener('DOMContentLoaded',()=>{
const cache=new Map(); const status={}; let segP=null, segFail=false; window.aiVersion=0;
const key=()=>{ const D=maskSrcData(); return D&&D.tag; };
window.aiStatus=k=>status[(curPhoto()||{}).id+k]||'';
function setStatus(id,k,msg){ status[id+k]=msg; const el=$('#aiSt'); if(el&&id===cur) el.textContent=msg; }
window.aiMaskFor=k=>{ const t=key(); const e=cache.get(t); if(e&&e[k]) return e[k]; if(t===cur) ensureAI(k); return null; };
window.aiOnOpen=async p=>{ if(!p.aiMasks) return; const e=cache.get(p.id)||{}; for(const [k,url] of Object.entries(p.aiMasks)){ if(e[k]) continue; try{ const im=new Image(); im.src=url; await im.decode(); const c=document.createElement('canvas'); c.width=im.width; c.height=im.height; c.getContext('2d').drawImage(im,0,0); e[k]=c; }catch(_){} } cache.set(p.id,e); aiVersion++; schedule(true); };
window.prepareAIFor=async p=>{ if(p.aiMasks&&!cache.has(p.id)) await aiOnOpen(p); };
async function loadSeg(){ if(segFail) return null; if(!segP) segP=(async()=>{ const v=await import('./mediapipe/vision_bundle.mjs'); const fs=await v.FilesetResolver.forVisionTasks(new URL('mediapipe/wasm',location.href).href);
    return await v.ImageSegmenter.createFromOptions(fs,{baseOptions:{modelAssetPath:new URL('mediapipe/deeplab_v3.tflite',location.href).href,delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true}); })();
  try{ return await segP; }catch(e){ console.warn('AI segmentation unavailable',e); segFail=true; return null; } }
const running={};
async function ensureAI(k,force){ const p=curPhoto(); const D=window.srcHi; if(!p||!D) return; const id=p.id; const e=cache.get(id)||{}; cache.set(id,e);
  if(e[k]&&!force) return; if(running[id+k]) return; running[id+k]=true; setStatus(id,k,'Detecting '+k+'…'); rawBadge('Detecting '+k+'…',true);
  try{ const t0=performance.now(); const seg=await loadSeg(); let bg=null, how='heuristic';
    const w=D.w,h=D.h; const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(D.data),w,h),0,0);
    if(seg){ const r=seg.segment(cv); const cm=r.confidenceMasks; const m0=cm[0]; const mw=m0.width, mh=m0.height; const a=m0.getAsFloat32Array(); bg=resizeF(a,mw,mh,w,h); cm.forEach(m=>m.close&&m.close()); how='AI segmentation'; }
    const Y=new Float32Array(w*h); for(let i=0;i<w*h;i++) Y[i]=(0.299*D.data[i*4]+0.587*D.data[i*4+1]+0.114*D.data[i*4+2])/255;
    let alpha, raw=false;
    if(window.aiExtra&&aiExtra[k]){ const r=await aiExtra[k](D,cv,Y); alpha=r.alpha; how=r.how; raw=!!r.raw; }
    else if(k==='subject'){ let fg=null; if(bg){ fg=new Float32Array(w*h); let area=0; for(let i=0;i<w*h;i++){ fg[i]=1-bg[i]; if(fg[i]>0.5) area++; } if(area<w*h*0.004){ fg=null; how='saliency (no known object class found)'; } }
      if(!fg){ fg=saliency(D); if(how==='heuristic') how='saliency heuristic'; } alpha=fg; }
    else alpha=sky(D,Y,bg);
    if(k==='depth') alpha=guided(Y,alpha,w,h,Math.max(3,Math.round(Math.max(w,h)/200)),1e-3);
    else if(!raw){ alpha=guided(Y,alpha,w,h,Math.max(3,Math.round(Math.max(w,h)/160)),2e-3); for(let i=0;i<alpha.length;i++) alpha[i]=sst(0.3,0.7,alpha[i]); }
    const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); const im=g.createImageData(w,h); for(let i=0;i<w*h;i++){ im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=255; im.data[i*4+3]=alpha[i]*255; } g.putImageData(im,0,0);
    e[k]=c; aiVersion++; p.aiMasks=p.aiMasks||{}; try{ p.aiMasks[k]=c.toDataURL('image/png'); savePhoto(p); }catch(_){}
    const ms=Math.round(performance.now()-t0); setStatus(id,k,`${k[0].toUpperCase()+k.slice(1)} detected (${how}, ${ms} ms). Refine with brush or combine with a range.`); rawBadge(`${k} mask ready`);
    if(cur===id){ schedule(true); } }
  catch(err){ console.error(err); setStatus(id,k,'Detection failed: '+err.message); rawBadge(''); }
  finally{ running[id+k]=false; } }
window.ensureAI=ensureAI; window.aiGuided=guided; window.aiResize=resizeF;
function sst(a,b,x){ const t=Math.min(1,Math.max(0,(x-a)/(b-a))); return t*t*(3-2*t); }
function resizeF(a,w,h,W,H){ const o=new Float32Array(W*H); for(let y=0;y<H;y++){ const fy=Math.min(h-1.001,Math.max(0,(y+.5)*h/H-.5)), y0=fy|0, ty=fy-y0;
  for(let x=0;x<W;x++){ const fx=Math.min(w-1.001,Math.max(0,(x+.5)*w/W-.5)), x0=fx|0, tx=fx-x0; const i=y0*w+x0; o[y*W+x]=(a[i]*(1-tx)+a[i+1]*tx)*(1-ty)+(a[i+w]*(1-tx)+a[i+w+1]*tx)*ty; } } return o; }
function box(a,w,h,r){ const I=new Float64Array((w+1)*(h+1)); for(let y=0;y<h;y++){ let s=0; for(let x=0;x<w;x++){ s+=a[y*w+x]; I[(y+1)*(w+1)+x+1]=I[y*(w+1)+x+1]+s; } }
  const o=new Float32Array(w*h); for(let y=0;y<h;y++){ const y0=Math.max(0,y-r), y1=Math.min(h,y+r+1); for(let x=0;x<w;x++){ const x0=Math.max(0,x-r), x1=Math.min(w,x+r+1);
    o[y*w+x]=(I[y1*(w+1)+x1]-I[y0*(w+1)+x1]-I[y1*(w+1)+x0]+I[y0*(w+1)+x0])/((y1-y0)*(x1-x0)); } } return o; }
function guided(I,p,w,h,r,eps){ const n=w*h; const mI=box(I,w,h,r), mp=box(p,w,h,r); const Ip=new Float32Array(n), II=new Float32Array(n); for(let i=0;i<n;i++){ Ip[i]=I[i]*p[i]; II[i]=I[i]*I[i]; }
  const mIp=box(Ip,w,h,r), mII=box(II,w,h,r); const a=new Float32Array(n), b=new Float32Array(n);
  for(let i=0;i<n;i++){ const v=mII[i]-mI[i]*mI[i], c=mIp[i]-mI[i]*mp[i]; a[i]=c/(v+eps); b[i]=mp[i]-a[i]*mI[i]; }
  const ma=box(a,w,h,r), mb=box(b,w,h,r); const q=new Float32Array(n); for(let i=0;i<n;i++) q[i]=Math.min(1,Math.max(0,ma[i]*I[i]+mb[i])); return q; }
function small(D,S){ const k=S/Math.max(D.w,D.h); const w=Math.max(8,Math.round(D.w*k)), h=Math.max(8,Math.round(D.h*k)); const o=new Float32Array(w*h*3);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=(Math.min(D.h-1,Math.floor((y+.5)/k))*D.w+Math.min(D.w-1,Math.floor((x+.5)/k)))*4; o[(y*w+x)*3]=D.data[i]/255; o[(y*w+x)*3+1]=D.data[i+1]/255; o[(y*w+x)*3+2]=D.data[i+2]/255; } return {w,h,o}; }
function sky(D,Y,bg){ const {w,h,o}=small(D,256); const cand=new Uint8Array(w*h), L=new Float32Array(w*h);
  for(let i=0;i<w*h;i++) L[i]=0.299*o[i*3]+0.587*o[i*3+1]+0.114*o[i*3+2];
  const bgs = bg? resizeF(bg,D.w,D.h,w,h):null;
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=y*w+x; const r=o[i*3],g=o[i*3+1],b=o[i*3+2]; const mx=Math.max(r,g,b), mn=Math.min(r,g,b); const sat=mx>0?(mx-mn)/mx:0; const blu=b-(r+g)/2;
    const gr=Math.abs(L[i+1]-L[i-1])+Math.abs(L[i+w]-L[i-w]); const colorOK=(blu>0.02&&b>0.28)||(sat<0.2&&L[i]>0.5)||(L[i]>0.85);
    const v=colorOK&&gr<0.14&&L[i]>0.22&&(!bgs||bgs[i]>0.5); cand[i]=v?1:0; }
  const reg=new Uint8Array(w*h); const st=[]; for(let x=0;x<w;x++) for(let y=0;y<Math.max(2,h*0.06);y++){ const i=(y|0)*w+x; if(cand[i]){ reg[i]=1; st.push(i); } }
  while(st.length){ const i=st.pop(); const x=i%w, y=(i/w)|0; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const xx=x+dx,yy=y+dy; if(xx<0||yy<0||xx>=w||yy>=h) continue; const j=yy*w+xx; if(!reg[j]&&cand[j]){ reg[j]=1; st.push(j); } } }
  let area=0; for(let i=0;i<w*h;i++) area+=reg[i]; const out=new Float32Array(w*h); if(area>w*h*0.01) for(let i=0;i<w*h;i++) out[i]=reg[i];
  // close small holes (clouds/branches) by a box blur + threshold
  const bl=box(out,w,h,2); for(let i=0;i<w*h;i++) out[i]=bl[i]>0.55?1:bl[i]*0.6*out[i];
  return resizeF(out,w,h,D.w,D.h); }
function saliency(D){ const {w,h,o}=small(D,160); const lab=new Float32Array(w*h*3); for(let i=0;i<w*h;i++){ const l=window.lab(Math.round(o[i*3]*255),Math.round(o[i*3+1]*255),Math.round(o[i*3+2]*255)); lab.set(l,i*3); }
  const border=[]; for(let x=0;x<w;x+=2){ border.push(x, (h-1)*w+x); } for(let y=0;y<h;y+=2){ border.push(y*w, y*w+w-1); }
  const s=new Float32Array(w*h); let mx=0;
  for(let i=0;i<w*h;i++){ const x=i%w,y=(i/w)|0; let ds=[]; for(let k=0;k<border.length;k+=3){ const j=border[k]; ds.push(Math.hypot(lab[i*3]-lab[j*3],lab[i*3+1]-lab[j*3+1],lab[i*3+2]-lab[j*3+2])); } ds.sort((a,b)=>a-b);
    const d=ds[Math.floor(ds.length*0.1)]; const cp=Math.exp(-(((x/w-.5)**2)+((y/h-.5)**2))/0.18); s[i]=d*cp; if(s[i]>mx) mx=s[i]; }
  // Otsu threshold
  const hist=new Float64Array(64); for(let i=0;i<w*h;i++) hist[Math.min(63,Math.floor(s[i]/mx*63.999))]++; let sum=0; for(let i=0;i<64;i++) sum+=i*hist[i]; let sB=0,wB=0,best=0,th=32;
  for(let i=0;i<64;i++){ wB+=hist[i]; if(!wB) continue; const wF=w*h-wB; if(!wF) break; sB+=i*hist[i]; const mB=sB/wB, mF=(sum-sB)/wF; const v=wB*wF*(mB-mF)**2; if(v>best){ best=v; th=i; } }
  const f=new Float32Array(w*h); for(let i=0;i<w*h;i++) f[i]=s[i]/mx*64>th?1:0; return resizeF(box(f,w,h,1),w,h,D.w,D.h); }
});
