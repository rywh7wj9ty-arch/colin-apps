/* ===== Noise reduction round: Smart NR (selective, mask-based) + model caching service worker ===== */
if('serviceWorker' in navigator&&location.protocol==='https:') addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(e=>console.warn('SW',e)));
addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
const secOf=t=>[...$$('#sections details.sec')].find(d=>d.firstChild.textContent.startsWith(t));
const det=secOf('Detail'); if(!det) return; const body=det.querySelector('.secbody')||det.lastChild;
const box=document.createElement('div'); box.id='smartNR'; body.appendChild(box);
box.innerHTML=`<div class="sub">Smart NR (selective)</div><div class="hint">Stronger on background & sky, gentler on the subject, skin and fine detail. Uses on-device AI masks.</div>
<div class="row"><label class="chk"><input type="checkbox" id="snrOn"> Smart NR</label><button class="btn" id="snrShow">Show mask</button></div><div id="snrSl"></div>`;
const K='Smart NR: background';
const getM=s=>(s.masks||[]).find(m=>m.smartNR);
function apply(s,o){ s.smartNR=o; let m=getM(s);
  if(!o.on){ if(m) s.masks=s.masks.filter(x=>x!==m); if(o.prevLum!=null) s.nrLum=o.prevLum; return; }
  if(!m){ m=Object.assign(newMaskOf('subject'),{id:'m'+uid(),name:K,on:true,adj:newAdj(),parts:[],invert:true,smartNR:true}); s.masks.push(m); if(window.ensureAI) ensureAI('subject'); }
  s.nrLum=o.subj; s.nrColor=Math.max(s.nrColor,Math.round((o.bg+o.subj)/2)); m.adj.noise=Math.max(0,Math.min(100,o.bg-o.subj)); }
const cur_=()=>S&&(S.smartNR||{on:false,bg:70,subj:20});
slider($('#snrSl'),'Background',s=>(s.smartNR||{bg:70}).bg,(s,v)=>{ const o=Object.assign({on:true,bg:70,subj:20},s.smartNR,{bg:v}); apply(s,o); syncFlags(); },0,100,1,null,'Smart NR background');
slider($('#snrSl'),'Subject',s=>(s.smartNR||{subj:20}).subj,(s,v)=>{ const o=Object.assign({on:true,bg:70,subj:20},s.smartNR,{subj:v}); apply(s,o); syncFlags(); },0,100,1,null,'Smart NR subject');
function syncFlags(){ const o=cur_(); $('#snrOn').checked=!!(o&&o.on); $('#snrSl').style.opacity=o&&o.on?1:.5; }
$('#snrOn').onchange=e=>{ if(!S) return; const o=Object.assign({bg:70,subj:20},S.smartNR,{on:e.target.checked}); if(o.on&&o.prevLum==null) o.prevLum=S.nrLum; apply(S,o); if(!o.on) o.prevLum=null; syncUI(); schedule(true); commit(o.on?'Smart NR on':'Smart NR off'); };
$('#snrShow').onclick=()=>{ const m=S&&getM(S); if(!m) return toast('Turn on Smart NR first'); if(tool!=='mask') setTool('mask'); selMaskId=m.id; ovOn=true; if(typeof syncMaskUI==='function') syncMaskUI(); schedule(true); toast('Red overlay = background (stronger NR). Tap Mask to hide.',2600); };
window.setSmartNR=(on,bg=70,subj=20)=>{ const o={on,bg,subj,prevLum:S.nrLum}; apply(S,o); syncUI(); schedule(true); commit('Smart NR'); };
if(typeof syncers!=='undefined') syncers.push(syncFlags);
},0));
/* ===== Sensor-level RAW NR (CFA domain, Web Worker) wired into full-resolution RAW decoding (zoom + export) ===== */
(function(){
let W=null, wid=0; const cb=new Map();
function worker(){ if(!W){ W=new Worker('cfanr-worker.js'); W.onmessage=e=>{ const m=e.data, f=cb.get(m.id); if(!f) return; if(m.progress!=null){ f.onP&&f.onP(m.progress,m.stage); return; } cb.delete(m.id); m.err?f.rej(new Error(m.err)):f.res(m.res); }; W.onerror=e=>{ cb.forEach(f=>f.rej(new Error('worker error'))); cb.clear(); W=null; }; } return W; }
function cfaProcess(dec,opt,onP){ return new Promise((res,rej)=>{ const id=++wid; cb.set(id,{res,rej,onP}); const buf=dec.data.buffer.byteLength===dec.data.byteLength?dec.data.buffer:dec.data.slice().buffer; worker().postMessage({id,w:dec.w,h:dec.h,data:buf,strength:opt.strength,chroma:opt.chroma??1.4,ca:!!opt.ca,noise:opt.noise,estimateOnly:opt.estimateOnly},[buf]); }); }
let gen=0; window.cfaCancel=()=>{ gen++; if(W){ W.terminate(); W=null; cb.forEach(f=>f.rej(new Error('cancelled'))); cb.clear(); } };
window.cfaProcess=cfaProcess;
const strOf=s=>s&&s.cfaNR>0?Math.pow(s.cfaNR/50,1.3)*1.0:0;
window.cfaOpts=s=>({strength:strOf(s),ca:!!(s&&s.cfaCA)});
const base=window.decodeFullRaw;
window.decodeFullRaw=async function(p,onMsg){ const s=p.id===cur&&typeof S!=='undefined'&&S?S:p.settings; const o=window.cfaOpts(s); if(!(o.strength>0||o.ca)||(p.rawInfo&&p.rawInfo.filters===9)) return base(p,onMsg);
  const g0=gen, chk=()=>{ if(gen!==g0) throw new Error('Sensor-level NR cancelled'); }; const dec=await rawLib(); const buf=await (await blobGet(p.id)).arrayBuffer(); const px=p.w*p.h; if(IOS_MEM&&(px>62e6||!p.rawDecoded||Math.max(p.w,p.h)>engine.maxTex)) throw new Error('memory'); const strips=IOS_MEM?Math.max(1,Math.ceil(px/6e6)):1;
  let cancelBtn=document.getElementById('cfaCancel'); if(!cancelBtn){ cancelBtn=document.createElement('button'); cancelBtn.id='cfaCancel'; cancelBtn.className='btn'; cancelBtn.textContent='Cancel'; cancelBtn.onclick=()=>{ cfaCancel(); toast('Sensor-level NR cancelled'); }; }
  document.getElementById('busy').appendChild(cancelBtn); const msg=m=>{ onMsg&&onMsg(m); if(typeof rawBadge==='function') rawBadge(m,true); };
  try{ let R=null; const Hh=p.h, ov=64; window.__cfaStats=[];
    if(strips>1){ msg('Estimating sensor noise'); const mh=Math.min(p.h,1600)&~1, my=((p.h-mh)/2)&~1; const d=await dec(buf.slice(0),{cropbox:[0,my,p.w,mh],noInterp:true}); o.noise=(await cfaProcess(d,{estimateOnly:true})).noise; }
    for(let i=0;i<strips;i++){ const y0=Math.floor(i*Hh/strips/2)*2, y1=i===strips-1?Hh:Math.floor((i+1)*Hh/strips/2)*2; const a=Math.max(0,y0-ov), b=Math.min(Hh,y1+ov);
      msg(`Decoding RAW sensor data${strips>1?` ${i+1}/${strips}`:''}`); const d=await dec(buf.slice(0),strips>1?{cropbox:[0,a,p.w,b-a],noInterp:true}:{noInterp:true});
      chk(); const r=await cfaProcess(d,o,(pr,st)=>msg(`${st} · ${Math.round(pr*100)}%`)); chk(); window.__cfaStats.push({ms:r.ms,noise:r.noise,ca:r.ca,w:d.w,h:d.h}); d.data=new Uint16Array(r.data.buffer||r.data);
      if(strips===1){ if(typeof rawBadge==='function') rawBadge(`Sensor-level NR done (${(r.ms/1000).toFixed(1)} s)`); return toRawSource(d); }
      if(!R){ R=engine.rawSource({fullW:d.fullW,fullH:d.fullH,mat:d.mat,baseline:d.baseline},d.fullW,d.fullH); R.half=false; R.filters=d.meta.filters; }
      engine.rawPut(R,d.data,y0,y1-y0,y0-a); }
    if(typeof rawBadge==='function') rawBadge('Sensor-level NR done'); return R; }
  finally{ cancelBtn.remove(); } };
addEventListener('DOMContentLoaded',()=>setTimeout(()=>{ const box=document.getElementById('smartNR'); if(!box) return; const d=document.createElement('div'); d.id='cfaNRBox'; box.before(d);
  d.innerHTML='<div class="sub">Sensor-level NR (RAW)</div><div class="hint">Denoises the raw Bayer data before demosaicing, in a background worker. Applies to 100% zoom and export (not the fit-to-screen preview). Not for Fuji X-Trans.</div><div id="cfaSl"></div><div class="row"><label class="chk"><input type="checkbox" id="cfaCA"> Auto lateral CA fix (RAW)</label></div>';
  let it=0; const inval=()=>{ clearTimeout(it); it=setTimeout(()=>{ try{ if(curRawFull&&curRawFull!==curRaw) engine.freeRaw(curRawFull); curRawFull=null; rawFullP=null; dropTile(); schedule(true); }catch(e){ console.warn(e); } },400); };
  slider($('#cfaSl'),'Sensor NR',s=>s.cfaNR||0,(s,v)=>{ s.cfaNR=v; inval(); },0,100,1,null,'Sensor-level NR');
  $('#cfaCA').onchange=e=>{ S.cfaCA=e.target.checked; inval(); commit('Auto CA '+(S.cfaCA?'on':'off')); }; syncers.push(()=>{ $('#cfaCA').checked=!!S.cfaCA; $('#cfaNRBox').style.display=curPhoto()&&curPhoto().raw?'':'none'; });
},20));
})();
