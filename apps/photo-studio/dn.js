'use strict';
/* AI denoise at export ("DeepPRIME-style"): SCUNet real-noise (PSNR) model, fp16 ONNX, tiled, WebGPU when available else WASM.
   SCUNet: Zhang et al. 2022, Apache-2.0 (github.com/cszn/SCUNet). Runs on the rendered result before output sharpening/watermark. */
(()=>{
const U=p=>new URL(p,location.href).href; const SP={}; let backend='';
async function session(name='models/scunet_real_psnr_fp16.onnx',f16=true){ let sessP=SP[name]; if(sessP) return sessP; sessP=SP[name]=(async()=>{ const model=U(name);
  if(navigator.gpu&&!window.__dnForceWasm){ try{ const ad=await navigator.gpu.requestAdapter(); if(ad&&(!f16||ad.features.has('shader-f16'))){ const o=await import('./ort/ort.webgpu.min.mjs'); o.env.wasm.wasmPaths=U('ort/'); o.env.wasm.numThreads=1;
      const s=await o.InferenceSession.create(model,{executionProviders:['webgpu'],graphOptimizationLevel:'all'}); backend='WebGPU'; return {o,s}; } }catch(e){ console.warn('WebGPU denoise unavailable, using WASM',e); } }
  const o=await import('./ort/ort.wasm.min.mjs'); o.env.wasm.wasmPaths=U('ort/'); if(!window.__dnNoProxy) o.env.wasm.proxy=true; o.env.wasm.numThreads=self.crossOriginIsolated?Math.min(8,navigator.hardwareConcurrency||2):1;
  const s=await o.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all'}); backend='WASM'+(o.env.wasm.numThreads>1?` ×${o.env.wasm.numThreads}`:''); return {o,s}; })();
  try{ return await sessP; }catch(e){ delete SP[name]; throw e; } }
const f2h=(()=>{ const f=new Float32Array(1), u=new Uint32Array(f.buffer); return v=>{ f[0]=v; const x=u[0]; const s=(x>>>16)&0x8000; let e=((x>>>23)&0xff)-112; let m=x&0x7fffff; if(e<=0) return s; if(e>=31) return s|0x7c00; return s|(e<<10)|((m+0x1000)>>>13); }; })();
const h2f=h=>{ const s=h&0x8000?-1:1, e=(h>>10)&31, m=h&1023; return e===0?s*m*5.960464477539063e-8:e===31?NaN:s*(1+m/1024)*Math.pow(2,e-15); };
const H2F=new Float32Array(65536); for(let i=0;i<65536;i++) H2F[i]=h2f(i);
// generic tiled runner. read(x0,y0,w,h)->Float32 RGB interleaved (clamped coords), write(x0,y0,w,h,rgbInterleaved)
async function run(W,H,read,write,amt,onMsg){ const {o,s}=await session(); const T=256, OV=16, ST=T-2*OV; const nx=Math.max(1,Math.ceil(W/ST)), ny=Math.max(1,Math.ceil(H/ST)); const n=nx*ny; const t0=performance.now(); let done=0;
  let inp;
  for(let ty=0;ty<ny;ty++) for(let tx=0;tx<nx;tx++){ if(window.__dnCancel) throw new Error('AI denoise cancelled');
    const ix=tx*ST, iy=ty*ST, iw=Math.min(ST,W-ix), ih=Math.min(ST,H-iy); const x0=ix-OV, y0=iy-OV; const src=read(x0,y0,T,T); inp=new Uint16Array(3*T*T); // fresh per tile: the WASM proxy worker takes ownership of the buffer
    for(let i=0;i<T*T;i++){ inp[i]=f2h(src[i*3]); inp[T*T+i]=f2h(src[i*3+1]); inp[2*T*T+i]=f2h(src[i*3+2]); }
    const r=await s.run({input:new o.Tensor('float16',inp,[1,3,T,T])}); const out=r.output.data; const isH=out instanceof Uint16Array; const g=k=>isH?H2F[out[k]]:out[k];
    const res=new Float32Array(iw*ih*3); for(let y=0;y<ih;y++) for(let x=0;x<iw;x++){ const k=(y+OV)*T+(x+OV), j=(y*iw+x)*3; for(let c=0;c<3;c++){ const a=src[k*3+c], d=g(c*T*T+k); res[j+c]=a+(Math.max(0,Math.min(1,d))-a)*amt; } }
    write(ix,iy,iw,ih,res); done++; const el=(performance.now()-t0)/1000; onMsg&&onMsg(`AI denoise (${backend}) tile ${done}/${n} · ~${Math.max(0,Math.round(el/done*(n-done)))} s left`); await new Promise(r=>setTimeout(r,0)); }
  window.__dnStats={backend,tiles:n,ms:Math.round(performance.now()-t0),W,H}; }
async function onCanvas(c,amt,onMsg){ const W=c.width,H=c.height,g=c.getContext('2d',{willReadFrequently:true}); const out=document.createElement('canvas'); out.width=W; out.height=H; const go=out.getContext('2d');
  const read=(x0,y0,w,h)=>{ const cx=Math.max(0,x0), cy=Math.max(0,y0), cw=Math.min(W,x0+w)-cx, ch=Math.min(H,y0+h)-cy; const d=g.getImageData(cx,cy,cw,ch).data; const r=new Float32Array(w*h*3);
    for(let y=0;y<h;y++){ const sy=Math.min(ch-1,Math.max(0,y0+y-cy)); for(let x=0;x<w;x++){ const sx=Math.min(cw-1,Math.max(0,x0+x-cx)); const k=(sy*cw+sx)*4, j=(y*w+x)*3; r[j]=d[k]/255; r[j+1]=d[k+1]/255; r[j+2]=d[k+2]/255; } } return r; };
  const write=(x0,y0,w,h,res)=>{ const im=go.createImageData(w,h), d=im.data; for(let i=0;i<w*h;i++){ d[i*4]=res[i*3]*255+0.5; d[i*4+1]=res[i*3+1]*255+0.5; d[i*4+2]=res[i*3+2]*255+0.5; d[i*4+3]=255; } go.putImageData(im,x0,y0); };
  await run(W,H,read,write,amt,onMsg); g.drawImage(out,0,0); out.width=out.height=1; }
async function on16(D,amt,onMsg){ const {w:W,h:H}=D, src=D.data, dst=new Uint16Array(src.length);
  const read=(x0,y0,w,h)=>{ const r=new Float32Array(w*h*3); for(let y=0;y<h;y++){ const sy=Math.min(H-1,Math.max(0,y0+y)); for(let x=0;x<w;x++){ const sx=Math.min(W-1,Math.max(0,x0+x)); const k=(sy*W+sx)*3, j=(y*w+x)*3; r[j]=src[k]/65535; r[j+1]=src[k+1]/65535; r[j+2]=src[k+2]/65535; } } return r; };
  const write=(x0,y0,w,h,res)=>{ for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const k=((y0+y)*W+x0+x)*3, j=(y*w+x)*3; dst[k]=res[j]*65535+0.5; dst[k+1]=res[j+1]*65535+0.5; dst[k+2]=res[j+2]*65535+0.5; } };
  await run(W,H,read,write,amt,onMsg); D.data=dst; }
const amtOf=o=>{ const x=o&&o._x; return x&&x.aiDn?({low:0.55,std:0.8,high:1}[x.aiDn]||0.8):0; };
const busyCancel=on=>{ let b=document.getElementById('dnCancel'); if(on&&!b){ b=document.createElement('button'); b.id='dnCancel'; b.className='btn'; b.textContent='Cancel AI denoise'; b.onclick=()=>window.__dnCancel=true; document.getElementById('busy').appendChild(b); } if(b) b.hidden=!on; };
window.preEncode=async(c,o,p,onMsg)=>{ const a=amtOf(o), sr=o&&o._x&&o._x.sr; if(!a&&!sr) return; window.__dnCancel=false; busyCancel(true);
  try{ if(a){ onMsg&&onMsg('Loading AI denoise model (38 MB, first time only)'); await onCanvas(c,a,onMsg); }
    if(sr){ const lim=(typeof isTouch!=='undefined'&&isTouch)?16.7e6:60e6; if(c.width*c.height*4>lim){ toast('Super Resolution skipped: result would exceed this device\'s canvas limit',4000); return; } onMsg&&onMsg('Loading Super Resolution model (5 MB)'); return await superRes(c,onMsg); } } finally{ busyCancel(false); } };
window.preEncode16=async(D,o,p,onMsg)=>{ const a=amtOf(o); if(!a) return; window.__dnCancel=false; busyCancel(true); try{ onMsg&&onMsg('Loading AI denoise model (38 MB, first time only)'); await on16(D,a,onMsg); } finally{ busyCancel(false); } };
// Super Resolution 2x: Real-ESRGAN general x4v3 (BSD-3-Clause, xinntao/Real-ESRGAN), tiled at 96px LR, x4 then 2x2 box-downsampled to 2x
async function superRes(c,onMsg){ const {o,s}=await session('models/realesr_general_x4v3.onnx',false); const W=c.width,H=c.height, g=c.getContext('2d',{willReadFrequently:true}); const out=document.createElement('canvas'); out.width=W*2; out.height=H*2; const go=out.getContext('2d');
  const T=96, OV=8, ST=T-2*OV; const nx=Math.ceil(W/ST), ny=Math.ceil(H/ST), n=nx*ny; const t0=performance.now(); let done=0; const inp=new Float32Array(3*T*T);
  for(let ty=0;ty<ny;ty++) for(let tx=0;tx<nx;tx++){ if(window.__dnCancel) throw new Error('Super Resolution cancelled'); const ix=tx*ST, iy=ty*ST, iw=Math.min(ST,W-ix), ih=Math.min(ST,H-iy);
    const x0=ix-OV, y0=iy-OV; const cx=Math.max(0,x0), cy=Math.max(0,y0), cw=Math.min(W,x0+T)-cx, ch=Math.min(H,y0+T)-cy; const d=g.getImageData(cx,cy,cw,ch).data;
    for(let y=0;y<T;y++){ const sy=Math.min(ch-1,Math.max(0,y0+y-cy)); for(let x=0;x<T;x++){ const sx=Math.min(cw-1,Math.max(0,x0+x-cx)); const k=(sy*cw+sx)*4, j=y*T+x; inp[j]=d[k]/255; inp[T*T+j]=d[k+1]/255; inp[2*T*T+j]=d[k+2]/255; } }
    const r=await s.run({input:new o.Tensor('float32',inp,[1,3,T,T])}); const y4=r.output.data, T4=T*4; const im=go.createImageData(iw*2,ih*2), od=im.data;
    for(let y=0;y<ih*2;y++) for(let x=0;x<iw*2;x++){ const X=(x+OV*2)*2, Y=(y+OV*2)*2; const j=(y*iw*2+x)*4; for(let c2=0;c2<3;c2++){ const b=c2*T4*T4; const v=(y4[b+Y*T4+X]+y4[b+Y*T4+X+1]+y4[b+(Y+1)*T4+X]+y4[b+(Y+1)*T4+X+1])/4; od[j+c2]=Math.max(0,Math.min(1,v))*255+0.5; } od[j+3]=255; }
    go.putImageData(im,ix*2,iy*2); done++; const el=(performance.now()-t0)/1000; onMsg&&onMsg(`Super Resolution (${backend}) tile ${done}/${n} · ~${Math.max(0,Math.round(el/done*(n-done)))} s left`); await new Promise(r=>setTimeout(r,0)); }
  window.__srStats={backend,tiles:n,ms:Math.round(performance.now()-t0),W:W*2,H:H*2}; return out; }
window.aiDenoise={superRes,session,onCanvas,on16,get backend(){ return backend; }};
// export dialog option
addEventListener('DOMContentLoaded',()=>{ const ox=window.openExport; if(ox){ window.openExport=function(){ ox(); const ex=document.getElementById('xExif'); if(!ex) return; const d=document.createElement('div'); d.className='f';
  const touch=typeof isTouch!=='undefined'&&isTouch; d.innerHTML=`<label>AI denoise (DeepPRIME-style, export only)</label><select id="xDn"><option value="">Off</option><option value="low">Low</option><option value="std">Standard</option><option value="high">High</option></select><label class="chk"><input type="checkbox" id="xSR"> Super Resolution 2× (AI upscale, 8-bit formats)</label><div class="hint">${touch?'Very slow on phones (minutes per megapixel); best used on a computer.':'Uses WebGPU when available, otherwise CPU: roughly 10–60 s per megapixel.'} Downloads a 38 MB model the first time.</div>`;
  ex.closest('label').before(d); const last=JSON.parse(localStorage.getItem('ps.exp2')||'{}'); document.getElementById('xDn').value=last.aiDn||''; document.getElementById('xSR').checked=!!last.sr; };
  document.getElementById('exportBtn').onclick=window.openExport; } });
})();
