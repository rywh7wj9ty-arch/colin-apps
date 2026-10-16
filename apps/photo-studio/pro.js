'use strict';
/* Photo Studio pro tools: range/AI masks + combine, heal/clone/remove brush, Upright, targeted adjustment */
addEventListener('DOMContentLoaded',()=>{
let ptool=null;               // 'hb' | 'guide' | 'tat' | 'pick'
const hb={mode:'remove',size:4,feather:30}; let tatTarget='curve', selPart=null, fillBusy=false, fillWanted='';
window.setSelPart=v=>{ selPart=v; }; window.getSelPart=()=>selPart;
const pov=document.createElement('canvas'); pov.id='pov'; $('#stage').appendChild(pov);
const toolBtns={};
function setPTool(t){ ptool = ptool===t?null:t; if(ptool){ if(tool&&ptool!=='pick') setTool(tool); if(cropOn) toggleCrop(false); if(window.setCompare) setCompare('off'); if(window.setWB) setWB(false); }
  Object.entries(toolBtns).forEach(([k,b])=>b.forEach(x=>x.classList.toggle('on',ptool===k))); $('#stage').classList.toggle('tooling',!!ptool); drawPov(); }
window.setPTool=setPTool; window.getPTool=()=>ptool;
const reg=(k,b)=>{ (toolBtns[k]=toolBtns[k]||[]).push(b); b.addEventListener('click',()=>setPTool(k)); };
['#healBtn','#maskBtn','#cropBtn','#cmpBtn','#wbBtn'].forEach(s=>{ const b=$(s); if(b) b.addEventListener('click',()=>{ if(ptool&&!(s==='#maskBtn'&&ptool==='pick')) setPTool(ptool); },true); });
const srcPx=(t)=>{ const D=maskSrcData(); if(!D) return null; const x=Math.min(D.w-1,Math.max(0,Math.round(t[0]*D.w))), y=Math.min(D.h-1,Math.max(0,Math.round(t[1]*D.h))); let s=[0,0,0],n=0;
  for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){ const xx=Math.min(D.w-1,Math.max(0,x+i)), yy=Math.min(D.h-1,Math.max(0,y+j)), k=(yy*D.w+xx)*4; s[0]+=D.data[k]; s[1]+=D.data[k+1]; s[2]+=D.data[k+2]; n++; } return s.map(v=>v/n); };

/* ================= (1) Range & AI masks, combine ================= */
const M=$('#maskSec'); const addRow=document.createElement('div'); addRow.className='row'; addRow.innerHTML='<button class="btn" data-addx="color">+ Colour</button><button class="btn" data-addx="luma">+ Luminance</button><button class="btn" data-addx="subject">+ Subject</button><button class="btn" data-addx="sky">+ Sky</button><button class="btn" data-addx="depth">+ Depth</button><select id="addPeople"><option value="">+ People…</option><option value="person">All people</option><option value="faceskin">Face skin</option><option value="skin">All skin</option><option value="hair">Hair</option><option value="eyes">Eyes</option><option value="irises">Irises</option><option value="lips">Lips</option><option value="brows">Eyebrows</option><option value="clothes">Clothes</option></select>';
M.firstElementChild.after(addRow);
const NM={color:'Colour range',luma:'Luminance range',subject:'Subject',sky:'Sky',depth:'Depth',person:'People',hair:'Hair',skin:'Skin',faceskin:'Face skin',clothes:'Clothes',eyes:'Eyes',irises:'Irises',lips:'Lips',brows:'Eyebrows'};
const AIK=['subject','sky','person','hair','skin','faceskin','clothes','eyes','irises','lips','brows'];
function newMaskOf(kind){ const t=AIK.includes(kind)?'ai':kind; const o={type:t,range:t==='color'?{pts:[],amt:50}:t==='luma'?{lo:60,hi:100,feather:25}:t==='depth'?{lo:0,hi:35,feather:20}:undefined,ai:t==='ai'?kind:undefined,geo:{},strokes:[],invert:false}; return o; }
const addMask=k=>{ if(!k||!S) return; const b=newMaskOf(k); const cnt=(S.masks||[]).filter(m=>(m.ai||m.type)===(b.ai||b.type)).length+1;
  const m=Object.assign(b,{id:'m'+uid(),name:`${NM[k]} ${cnt}`,on:true,adj:newAdj(),parts:[]}); m.adj.exposure=k==='sky'?-0.4:0.4;
  S.masks.push(m); selMaskId=m.id; selPart=null; brushMode=false; if(tool!=='mask') setTool('mask'); syncMaskUI(); schedule(true); commit('Add '+NM[k].toLowerCase()+' mask');
  if(b.ai&&window.ensureAI) ensureAI(b.ai); if(k==='depth'&&window.ensureAI) ensureAI('depth'); if(k==='color'){ setPTool('pick'); toast('Tap colours on the photo to select them',2200); } };
addRow.addEventListener('click',e=>{ const k=e.target.dataset.addx; if(k) addMask(k); }); $('#addPeople').onchange=e=>{ const k=e.target.value; e.target.value=''; if(k) addMask(k); }; window.addMaskOf=addMask; window.newMaskOf=newMaskOf;
const box=document.createElement('div'); box.id='rangeBox'; $('#mEdit').prepend(box);
box.innerHTML=`<div class="sub">Components</div><div class="plist" id="partList"></div>
 <div class="row"><select id="partOp"><option value="add">Add</option><option value="sub">Subtract</option><option value="int" selected>Intersect</option></select>
  <select id="partAdd"><option value="">+ component…</option><option value="color">Colour range</option><option value="luma">Luminance range</option><option value="subject">Subject (AI)</option><option value="sky">Sky (AI)</option><option value="depth">Depth (AI)</option><option value="person">People (AI)</option><option value="faceskin">Face skin (AI)</option><option value="hair">Hair (AI)</option><option value="eyes">Eyes (AI)</option><option value="lips">Lips (AI)</option><option value="merge">Another mask…</option></select></div>
 <div id="rangeEd"></div>`;
const tgt=()=>{ const m=selMask(); if(!m) return null; if(selPart){ const p=(m.parts||[]).find(x=>x.id===selPart); if(p) return p; } return m; };
function syncRange(){ const m=selMask(); if(!m){ return; } m.parts=m.parts||[];
  const icon=x=>x.type==='color'?'◉':x.type==='luma'?'◐':x.type==='depth'?'⧗':x.type==='ai'?(x.ai==='sky'?'☁':'👤'):x.type==='linear'?'▤':x.type==='radial'?'◎':'✎';
  const nm=x=>x.name||(x.type==='ai'?NM[x.ai]:NM[x.type]||x.type);
  $('#partList').innerHTML=`<button data-p="" class="${!selPart?'cur':''}"><span>${icon(m)} Base: ${nm(m)}</span></button>`+m.parts.map(p=>`<button data-p="${p.id}" class="${selPart===p.id?'cur':''}"><span>${icon(p)} ${{add:'＋',sub:'－',int:'∩'}[p.op]} ${nm(p)}</span><span class="x" data-del="${p.id}" title="Remove component">×</span></button>`).join('');
  const t=tgt(); const ed=$('#rangeEd'); ed.innerHTML='';
  if(!t||(t.type!=='color'&&t.type!=='luma'&&t.type!=='ai'&&t.type!=='depth')){ if(selPart&&t){ ed.innerHTML=`<div class="row"><select id="pOp">${['add','sub','int'].map(o=>`<option value="${o}" ${t.op===o?'selected':''}>${{add:'Add',sub:'Subtract',int:'Intersect'}[o]}</option>`).join('')}</select><label class="chk"><input type="checkbox" id="pInv" ${t.invert?'checked':''}> Invert</label><button class="btn" id="pExtract">Make separate mask</button></div>`; bindPart(t); } return; }
  if(selPart) { ed.innerHTML=`<div class="row"><select id="pOp">${['add','sub','int'].map(o=>`<option value="${o}" ${t.op===o?'selected':''}>${{add:'Add',sub:'Subtract',int:'Intersect'}[o]}</option>`).join('')}</select><label class="chk"><input type="checkbox" id="pInv" ${t.invert?'checked':''}> Invert</label></div>`; bindPart(t); }
  const host=document.createElement('div'); ed.appendChild(host);
  const R=t.range;
  if(t.type==='color'){ const sw=(R.pts||[]).map((p,i)=>`<span class="swatch" data-i="${i}" title="Remove" style="background:rgb(${p.map(Math.round)})"></span>`).join('');
    host.innerHTML=`<div class="row"><button class="btn ${ptool==='pick'?'on':''}" id="pickBtn">⌖ Pick colours</button><span class="sw">${sw||'<small>No colours yet</small>'}</span></div>`;
    slider(host,'Range',()=>R.amt,(s,v)=>{ R.amt=v; },0,100,1,null,'Colour range amount'); }
  if(t.type==='luma'){ host.innerHTML=`<div class="row"><button class="btn ${ptool==='pick'?'on':''}" id="pickBtn">⌖ Pick brightness</button></div>`;
    slider(host,'Low',()=>R.lo,(s,v)=>{ R.lo=Math.min(v,R.hi); },0,100,1,'linear-gradient(90deg,#000,#fff)','Luminance low');
    slider(host,'High',()=>R.hi,(s,v)=>{ R.hi=Math.max(v,R.lo); },0,100,1,'linear-gradient(90deg,#000,#fff)','Luminance high');
    slider(host,'Smoothness',()=>R.feather,(s,v)=>{ R.feather=v; },0,100,1,null,'Luminance smoothness'); }
  if(t.type==='depth'){ host.innerHTML=`<div class="hint" id="aiSt">${window.aiStatus?aiStatus('depth'):''}</div><div class="hint">0 = nearest, 100 = farthest</div>`;
    slider(host,'Near',()=>R.lo,(s,v)=>{ R.lo=Math.min(v,R.hi); },0,100,1,'linear-gradient(90deg,#fff,#000)','Depth near');
    slider(host,'Far',()=>R.hi,(s,v)=>{ R.hi=Math.max(v,R.lo); },0,100,1,'linear-gradient(90deg,#fff,#000)','Depth far');
    slider(host,'Smoothness',()=>R.feather,(s,v)=>{ R.feather=v; },0,100,1,null,'Depth smoothness'); }
  if(t.type==='ai'){ const st=window.aiStatus?aiStatus(t.ai):''; host.innerHTML=`<div class="hint" id="aiSt">${st}</div><div class="row"><button class="btn" id="aiRedo">Re-detect</button></div>`; $('#aiRedo').onclick=()=>window.ensureAI&&ensureAI(t.ai,true); }
  const pb=$('#pickBtn'); if(pb) pb.onclick=()=>{ setPTool('pick'); syncRange(); };
  host.querySelectorAll('.swatch').forEach(s=>s.onclick=()=>{ R.pts.splice(+s.dataset.i,1); schedule(true); commit('Remove colour sample'); syncRange(); });
  host.querySelectorAll('.sl').forEach(r=>{ const rng=r.querySelector('input[type=range]'); rng.addEventListener('input',()=>schedule()); });
}
function bindPart(t){ const o=$('#pOp'); if(o) o.onchange=()=>{ t.op=o.value; schedule(true); commit('Mask component mode'); syncRange(); };
  const iv=$('#pInv'); if(iv) iv.onchange=()=>{ t.invert=iv.checked; schedule(true); commit('Invert component'); };
  const ex=$('#pExtract'); if(ex) ex.onclick=()=>{ const m=selMask(); m.parts=m.parts.filter(p=>p!==t); const n=Object.assign(clone(t),{id:'m'+uid(),on:true,adj:clone(m.adj),parts:[]}); delete n.op; S.masks.push(n); selPart=null; selMaskId=n.id; schedule(true); commit('Extract component'); syncMaskUI(); }; }
window.syncRange=syncRange;
$('#partList').addEventListener('click',e=>{ const m=selMask(); if(!m) return; const d=e.target.dataset.del; if(d){ m.parts=m.parts.filter(p=>p.id!==d); if(selPart===d) selPart=null; schedule(true); commit('Remove mask component'); syncRange(); return; }
  const b=e.target.closest('[data-p]'); if(!b) return; selPart=b.dataset.p||null; syncRange(); });
$('#partAdd').onchange=e=>{ const k=e.target.value; e.target.value=''; const m=selMask(); if(!m||!k) return; const op=$('#partOp').value;
  if(k==='merge'){ const others=S.masks.filter(x=>x.id!==m.id); if(!others.length) return toast('Create another mask first'); 
    const names=others.map((x,i)=>`${i+1}: ${x.name}`).join('\n'); const i=+prompt('Merge which mask into "'+m.name+'"?\n'+names,'1')-1; const o=others[i]; if(!o) return;
    const p=clone(o); delete p.adj; delete p.on; const sub=p.parts||[]; delete p.parts; p.id='p'+uid(); p.op=op; m.parts.push(p); sub.forEach(q=>m.parts.push(Object.assign(q,{id:'p'+uid()})));
    S.masks=S.masks.filter(x=>x!==o); selPart=p.id; schedule(true); commit('Combine masks'); syncMaskUI(); return; }
  const p=Object.assign(newMaskOf(k),{id:'p'+uid(),op,name:NM[k]}); m.parts.push(p); selPart=p.id; schedule(true); commit('Add '+NM[k].toLowerCase()+' component'); syncRange();
  if(p.ai&&window.ensureAI) ensureAI(p.ai); if(k==='depth'&&window.ensureAI) ensureAI('depth'); if(k==='color'){ setPTool('pick'); } };
const baseSync=window.syncMaskUI; window.syncMaskUI=function(){ baseSync(); const m=selMask(); $('#rangeBox').hidden=!m; if(m){ if(selPart&&!(m.parts||[]).find(p=>p.id===selPart)) selPart=null; syncRange(); }
  // list icons for new types
  $$('#mlist [data-id]').forEach(b=>{ const mm=S.masks.find(x=>x.id===b.dataset.id); if(mm&&(mm.type==='color'||mm.type==='luma'||mm.type==='ai')){ const sp=b.querySelector('span'); sp.textContent=(mm.type==='color'?'◉ ':mm.type==='luma'?'◐ ':mm.ai==='sky'?'☁ ':'👤 ')+mm.name+((mm.parts||[]).length?' +'+mm.parts.length:''); } }); };
syncers.push(()=>{ if(selMask()) syncRange(); });
// commit after range slider drags (slider() commits on change already)

/* ================= (3) Heal / clone / remove brush ================= */
const H=$('#healSec'); const hbBox=document.createElement('div');
hbBox.innerHTML=`<div class="sub">Brush (paint over larger areas)</div>
 <div class="row"><button class="btn" id="hbTool">🖌 Paint</button><div class="tabs" id="hbMode" style="flex:1;margin:0"><button data-m="remove" class="on">Remove</button><button data-m="heal">Heal</button><button data-m="clone">Clone</button></div></div>
 <div id="hbSl"></div><div class="row"><button class="btn" id="hbUndo">Undo stroke</button><button class="btn" id="hbClear">Clear strokes</button></div><div class="hint" id="hbInfo">Remove: paint over an object and it is filled from its surroundings (content-aware). Heal/Clone: paint, then drag the ⊕ source marker.</div>`;
H.appendChild(hbBox); reg('hb',$('#hbTool'));
slider($('#hbSl'),'Size',()=>hb.size,(s,v)=>{ hb.size=v; drawPov(); },0.5,30,0.5,null,null,true);
slider($('#hbSl'),'Feather',()=>hb.feather,(s,v)=>{ hb.feather=v; },0,100,1,null,null,true);
$('#hbMode').onclick=e=>{ const m=e.target.dataset.m; if(!m) return; hb.mode=m; $$('#hbMode button').forEach(b=>b.classList.toggle('on',b.dataset.m===m)); if(ptool!=='hb') setPTool('hb'); };
$('#hbUndo').onclick=()=>{ if(!S.healStrokes.length) return; S.healStrokes.pop(); commit('Undo brush stroke'); refreshFill(); };
$('#hbClear').onclick=()=>{ if(!S.healStrokes.length) return; S.healStrokes=[]; commit('Clear brush strokes'); refreshFill(); };
let worker=null, wid=0; const wcb=new Map();
function runInpaint(W,H,rgba,hole){ if(!worker){ worker=new Worker('inpaint.js'); worker.onmessage=e=>{ const f=wcb.get(e.data.id); wcb.delete(e.data.id); f&&f(e.data); }; }
  return new Promise((res,rej)=>{ const id=++wid; wcb.set(id,d=>d.err?rej(new Error(d.err)):res(d.r)); worker.postMessage({W,H,rgba,hole,id}); }); }
const fillCache=new Map();
function strokeR(st,L){ return Math.max(1,st.size/100*0.25*L); }
function rasterStroke(st,W,H){ const c=document.createElement('canvas'); c.width=W; c.height=H; const g=c.getContext('2d'); const L=Math.max(W,H); const r=strokeR(st,L); const spr=dabSprite(r,st.feather,100);
  let prev=null; const dab=(x,y)=>g.drawImage(spr,x*W-spr.width/2,y*H-spr.height/2);
  for(const p of st.pts){ if(!prev){ dab(p[0],p[1]); prev=p; continue; } const dx=(p[0]-prev[0])*W, dy=(p[1]-prev[1])*H, d=Math.hypot(dx,dy), stp=Math.max(0.7,r*0.2), n=Math.floor(d/stp);
    for(let i=1;i<=n;i++){ const t=i*stp/d; dab(prev[0]+(p[0]-prev[0])*t, prev[1]+(p[1]-prev[1])*t); } if(n>0) prev=[prev[0]+(p[0]-prev[0])*n*stp/d, prev[1]+(p[1]-prev[1])*n*stp/d]; }
  return g.getImageData(0,0,W,H).data; }
async function buildFill(strokes,D,onMsg){
  const W=D.w,Hh=D.h; const f=new Float32Array(W*Hh*4); let bx=[1,1,0,0], sb=[1,1,0,0], hr=0.01; const L=Math.max(W,Hh);
  const grow=(b,x,y)=>{ b[0]=Math.min(b[0],x); b[1]=Math.min(b[1],y); b[2]=Math.max(b[2],x); b[3]=Math.max(b[3],y); };
  const rem=strokes.filter(s=>s.mode==='remove');
  if(rem.length){ const a=new Float32Array(W*Hh); for(const s of rem){ const d=rasterStroke(s,W,Hh); for(let i=0;i<W*Hh;i++) a[i]=Math.max(a[i],d[i*4+3]/255); }
    const hole=new Uint8Array(W*Hh); for(let i=0;i<W*Hh;i++) if(a[i]>0.01) hole[i]=1;
    // dilate by 1 so the soft edge has offsets too
    const h2=hole.slice(); for(let y=1;y<Hh-1;y++) for(let x=1;x<W-1;x++){ const i=y*W+x; if(hole[i-1]||hole[i+1]||hole[i-W]||hole[i+W]) h2[i]=1; }
    onMsg&&onMsg('Content-aware fill…'); const r=await runInpaint(W,Hh,D.data,h2); if(!r) throw new Error('Not enough surrounding area to fill from');
    for(let k=0;k<r.idx.length;k++){ const i=r.idx[k]; const x=i%W, y=(i/W)|0; const al=Math.min(1,a[i]*1.15); f[i*4]=r.dx[k]/W; f[i*4+1]=r.dy[k]/Hh; f[i*4+2]=al; f[i*4+3]=0;
      if(al>0){ grow(bx,x/W,y/Hh); grow(bx,(x+1)/W,(y+1)/Hh); grow(sb,(x+r.dx[k])/W,(y+r.dy[k])/Hh); grow(sb,(x+r.dx[k]+1)/W,(y+r.dy[k]+1)/Hh); } } }
  for(const s of strokes){ if(s.mode==='remove') continue; const d=rasterStroke(s,W,Hh); const md=s.mode==='heal'?2:1; const ox=s.off[0], oy=s.off[1]; hr=Math.max(hr,strokeR(s,L)/L*1.6);
    for(let i=0;i<W*Hh;i++){ const al=d[i*4+3]/255; if(al>0.003&&al>=f[i*4+2]){ f[i*4]=ox; f[i*4+1]=oy; f[i*4+2]=al; f[i*4+3]=md; const x=(i%W)/W, y=((i/W)|0)/Hh; grow(bx,x,y); grow(sb,x+ox,y+oy); } } }
  const pad=hr*1.2+2/L; sb=[Math.max(0,Math.min(sb[0],bx[0])-pad),Math.max(0,Math.min(sb[1],bx[1])-pad),Math.min(1,Math.max(sb[2],bx[2])+pad),Math.min(1,Math.max(sb[3],bx[3])+pad)];
  return {w:W,h:Hh,data:f,r:hr,box:bx,sbox:sb}; }
function fillKey(){ return S&&S.healStrokes&&S.healStrokes.length? (cur+'|'+JSON.stringify(S.healStrokes)) : ''; }
async function refreshFill(){ schedule(true); }
window.computeFillFor=async(strokes,D,key)=>{ if(fillCache.has(key)) return fillCache.get(key); const f=await buildFill(strokes,D); f.key=key; if(fillCache.size>12) fillCache.delete(fillCache.keys().next().value); fillCache.set(key,f); return f; };
async function ensureFill(){ const k=fillKey(); if(!k){ if(engine.fill){ engine.setFill(null); schedule(true); } fillWanted=''; return; }
  if(engine.fill&&engine.fill.key===k) return; if(fillBusy&&fillWanted===k) return; fillWanted=k; const D=window.srcHi; if(!D) return;
  fillBusy=true; const needPM=S.healStrokes.some(s=>s.mode==='remove')&&!fillCache.has(k); if(needPM) rawBadgeMsg('Content-aware fill…',true);
  try{ const f=await computeFillFor(clone(S.healStrokes),D,k); if(fillKey()===k){ engine.setFill(f); if(typeof dropTile==='function') dropTile(); schedule(true); } }
  catch(e){ console.error(e); toast('Fill failed: '+e.message,3000); }
  finally{ fillBusy=false; if(needPM) rawBadgeMsg(''); if(fillKey()!==k) ensureFill(); } }
function rawBadgeMsg(m,hold){ try{ rawBadge(m,hold); }catch(e){} }
window.ensureFill=ensureFill;
function autoOffset(st){ const D=window.srcHi; if(!D) return [0.05,0]; const W=D.w,Hh=D.h,L=Math.max(W,Hh); const r=strokeR(st,L);
  const xs=st.pts.map(p=>p[0]*W), ys=st.pts.map(p=>p[1]*Hh); const x0=Math.min(...xs)-r*1.5, x1=Math.max(...xs)+r*1.5, y0=Math.min(...ys)-r*1.5, y1=Math.max(...ys)+r*1.5;
  const bw=x1-x0, bh=y1-y0; const step=Math.max(1,Math.round(Math.max(bw,bh)/40)); const px=(x,y)=>{ x=Math.max(0,Math.min(W-1,x|0)); y=Math.max(0,Math.min(Hh-1,y|0)); const k=(y*W+x)*4; return [D.data[k],D.data[k+1],D.data[k+2]]; };
  let best=1e18, bo=[bw*1.2,0];
  for(const dist of [1.1,1.5,2.2]) for(let a=0;a<16;a++){ const ox=Math.cos(a*Math.PI/8)*Math.max(bw,bh)*dist, oy=Math.sin(a*Math.PI/8)*Math.max(bw,bh)*dist;
    if(x0+ox<0||y0+oy<0||x1+ox>=W||y1+oy>=Hh) continue; let e=0;
    for(let y=y0;y<=y1;y+=step) for(let x=x0;x<=x1;x+=step){ // compare the border ring only (inside is what we're replacing)
      const inner=x>x0+r&&x<x1-r&&y>y0+r&&y<y1-r; if(inner) continue; const a1=px(x,y), b1=px(x+ox,y+oy); e+=(a1[0]-b1[0])**2+(a1[1]-b1[1])**2+(a1[2]-b1[2])**2; }
    e*=1+0.05*dist; if(e<best){ best=e; bo=[ox,oy]; } }
  return [bo[0]/W,bo[1]/Hh]; }

/* ================= pointer handling for pro tools ================= */
let drag=null;
const stage=$('#stage');
stage.addEventListener('pointerdown',e=>{ if(!ptool||mode!=='develop'||!S) return; if(!e.isPrimary){ if(drag&&drag.kind==='hb'){ drag=null; drawPov(); } return; }
  const t=dispToSrc(e.clientX,e.clientY); e.stopPropagation(); e.preventDefault(); try{ stage.setPointerCapture(e.pointerId); }catch(_){}
  if(ptool==='pick'){ const m=tgt(); if(!m) return; const c=srcPx(t); if(!c) return;
    if(m.type==='color'){ m.range.pts=m.range.pts||[]; if(m.range.pts.length>=5) m.range.pts.shift(); m.range.pts.push(c.map(v=>Math.round(v))); commit('Pick colour'); }
    else if(m.type==='luma'){ const L=(0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/2.55; m.range.lo=Math.max(0,Math.round(L-15)); m.range.hi=Math.min(100,Math.round(L+15)); commit('Pick brightness'); }
    schedule(true); syncRange(); return; }
  if(ptool==='hb'){ // drag a heal/clone source marker?
    const hs=S.healStrokes; for(let i=hs.length-1;i>=0;i--){ const s=hs[i]; if(s.mode==='remove') continue; const c=centroid(s), q=srcToDisp([c[0]+s.off[0],c[1]+s.off[1]]); if(Math.hypot(q[0]-e.clientX,q[1]-e.clientY)<(isTouch?26:14)){ drag={kind:'src',s,t0:t,o:s.off.slice()}; return; } }
    const st={id:'h'+uid(),mode:hb.mode,size:hb.size,feather:hb.feather,pts:[[+t[0].toFixed(5),+t[1].toFixed(5)]],off:[0,0]}; drag={kind:'hb',st}; drawPov(); return; }
  if(ptool==='guide'){ drag={kind:'guide',a:t,b:t,pa:[e.clientX,e.clientY],pb:[e.clientX,e.clientY]}; drawPov(); return; }
  if(ptool==='tat'){ drag={kind:'tat',y0:e.clientY,t,base:clone(S),sample:tatSample(t,e)}; return; }
},true);
stage.addEventListener('pointermove',e=>{ if(!drag) return; e.stopPropagation(); const t=dispToSrc(e.clientX,e.clientY);
  if(drag.kind==='hb'){ const pts=drag.st.pts, l=pts[pts.length-1]; if(Math.hypot(t[0]-l[0],t[1]-l[1])>0.002) pts.push([+t[0].toFixed(5),+t[1].toFixed(5)]); drawPov(); }
  else if(drag.kind==='src'){ drag.s.off=[drag.o[0]+t[0]-drag.t0[0],drag.o[1]+t[1]-drag.t0[1]]; drawPov(); }
  else if(drag.kind==='guide'){ drag.b=t; drag.pb=[e.clientX,e.clientY]; drawPov(); }
  else if(drag.kind==='tat'){ tatApply(drag,(drag.y0-e.clientY)); }
},true);
const up=e=>{ if(!drag) return; e.stopPropagation(); const d=drag; drag=null;
  if(d.kind==='hb'){ const st=d.st; if(st.mode!=='remove') st.off=autoOffset(st); S.healStrokes.push(st); commit(st.mode==='remove'?'Content-aware remove':st.mode==='heal'?'Heal brush':'Clone brush'); ensureFill(); }
  else if(d.kind==='src'){ commit('Move source'); ensureFill(); }
  else if(d.kind==='guide'){ if(Math.hypot(d.pb[0]-d.pa[0],d.pb[1]-d.pa[1])>20){ S.guides=(S.guides||[]).concat([{a:d.a,b:d.b}]).slice(-4); S.upright='guided'; solveUpright('guided'); commit('Guided upright'); } }
  else if(d.kind==='tat'){ commit('Targeted '+tatTarget); }
  drawPov(); };
stage.addEventListener('pointerup',up,true); stage.addEventListener('pointercancel',up,true);
function centroid(s){ let x=0,y=0; s.pts.forEach(p=>{x+=p[0];y+=p[1];}); return [x/s.pts.length,y/s.pts.length]; }

function drawPov(){ const glc=$('#gl'); const r=glc.getBoundingClientRect(), sr=stage.getBoundingClientRect(); const dp=Math.min(2,devicePixelRatio||1);
  pov.style.left=(r.left-sr.left)+'px'; pov.style.top=(r.top-sr.top)+'px'; pov.style.width=r.width+'px'; pov.style.height=r.height+'px';
  const W=Math.round(r.width*dp), Hh=Math.round(r.height*dp); if(pov.width!==W||pov.height!==Hh){ pov.width=W; pov.height=Hh; }
  const g=pov.getContext('2d'); g.setTransform(dp,0,0,dp,-r.left*dp,-r.top*dp); g.clearRect(r.left,r.top,r.width,r.height);
  if(!S||mode!=='develop') return;
  const pxR=s=>{ const [Wp,Hp]=photoDims(); const L=Math.max(Wp,Hp); return strokeR(s,L)/srcPxPerDisp(r.left+r.width/2,r.top+r.height/2); };
  if(ptool==='hb'){ const list=(S.healStrokes||[]).concat(drag&&drag.kind==='hb'?[drag.st]:[]);
    for(const s of list){ const rr=pxR(s); g.lineCap=g.lineJoin='round'; g.lineWidth=rr*2; g.strokeStyle=s.mode==='remove'?'rgba(255,80,80,.35)':s.mode==='heal'?'rgba(80,200,255,.3)':'rgba(255,220,80,.3)';
      g.beginPath(); s.pts.forEach((p,i)=>{ const q=srcToDisp(p); i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]); }); if(s.pts.length===1){ const q=srcToDisp(s.pts[0]); g.lineTo(q[0]+0.1,q[1]); } g.stroke();
      if(s.mode!=='remove'&&s!==(drag&&drag.st)){ const c=centroid(s), a=srcToDisp(c), b=srcToDisp([c[0]+s.off[0],c[1]+s.off[1]]); g.lineWidth=1.5; g.strokeStyle='#fff'; g.setLineDash([4,4]); g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(b[0],b[1],9,0,7); g.stroke(); g.beginPath(); g.moveTo(b[0]-6,b[1]); g.lineTo(b[0]+6,b[1]); g.moveTo(b[0],b[1]-6); g.lineTo(b[0],b[1]+6); g.stroke(); } } }
  if(ptool==='guide'||(S.upright==='guided'&&ptool==='guide')){ const list=(S.guides||[]).map(x=>[srcToDisp(x.a),srcToDisp(x.b)]); if(drag&&drag.kind==='guide') list.push([drag.pa,drag.pb]);
    g.lineWidth=2; for(const [a,b] of list){ g.strokeStyle='#ffd23f'; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); g.fillStyle='#ffd23f'; [a,b].forEach(q=>{ g.beginPath(); g.arc(q[0],q[1],4,0,7); g.fill(); }); } }
}
window.drawPov=drawPov;
const bf=window.frame; window.frame=function(){ bf(); try{ drawPov(); if(mode==='develop'&&S) ensureFill(); }catch(e){ console.error(e); } };
// tie fill to the open photo / undo
window.onDevelopOpen=p=>{ engine.setFill(null); fillWanted=''; selPart=null; if(ptool) setPTool(ptool); if(window.aiOnOpen) aiOnOpen(p); };

/* ================= (4) Upright ================= */
const LS=$('#lensSec'); const up4=document.createElement('div');
up4.innerHTML=`<div class="sub">Upright</div><div class="tabs" id="uprTabs"><button data-u="off">Off</button><button data-u="auto">Auto</button><button data-u="level">Level</button><button data-u="vertical">Vertical</button><button data-u="full">Full</button><button data-u="guided">Guided</button></div>
 <div class="row"><button class="btn" id="guideTool">✎ Draw guides</button><button class="btn" id="guideClear">Clear guides</button></div><div class="hint" id="uprInfo">Auto detects lines and straightens verticals/horizon. Guided: draw 2–4 lines along edges that should be vertical or horizontal.</div>`;
LS.insertBefore(up4,LS.querySelector('.sub:nth-of-type(2)')||LS.lastChild); reg('guide',$('#guideTool'));
$('#uprTabs').onclick=e=>{ const u=e.target.dataset.u; if(!u||!S) return; if(u==='guided'){ S.upright='guided'; if(!(S.guides||[]).length){ if(ptool!=='guide') setPTool('guide'); syncUpr(); toast('Draw lines along edges that should be straight',2500); return; } }
  if(u==='off'){ S.upright='off'; S.angle=0; S.perspV=0; S.perspH=0; constrainCrop(); syncUI(); schedule(true); commit('Upright off'); syncUpr(); return; }
  S.upright=u; solveUpright(u); commit('Upright: '+u); };
$('#guideClear').onclick=()=>{ S.guides=[]; if(S.upright==='guided'){ S.upright='off'; } commit('Clear guides'); syncUpr(); drawPov(); };
function syncUpr(){ if(!S) return; $$('#uprTabs button').forEach(b=>b.classList.toggle('on',b.dataset.u===(S.upright||'off'))); }
syncers.push(syncUpr);
let segCache={id:null,segs:null};
function detectSegments(){ const D=window.srcHi; if(!D) return []; if(segCache.id===D.tag+D.w) return segCache.segs;
  const k=Math.min(1,900/Math.max(D.w,D.h)); const w=Math.round(D.w*k), h=Math.round(D.h*k); const Y=new Float32Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=(Math.min(D.h-1,Math.round(y/k))*D.w+Math.min(D.w-1,Math.round(x/k)))*4; Y[y*w+x]=0.3*D.data[i]+0.59*D.data[i+1]+0.11*D.data[i+2]; }
  const gx=new Float32Array(w*h), gy=new Float32Array(w*h), mag=new Float32Array(w*h); const mags=[];
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=y*w+x; const a=Y[i-w-1],b=Y[i-w],c=Y[i-w+1],d=Y[i-1],f=Y[i+1],g2=Y[i+w-1],hh=Y[i+w],ii=Y[i+w+1];
    gx[i]=(c+2*f+ii)-(a+2*d+g2); gy[i]=(g2+2*hh+ii)-(a+2*b+c); mag[i]=Math.hypot(gx[i],gy[i]); if((x+y)%3===0) mags.push(mag[i]); }
  mags.sort((p,q)=>p-q); const thr=Math.max(40,mags[Math.floor(mags.length*0.9)]||0);
  // Hough over line normal angle (0..180), votes from edge pixels near their gradient direction
  const NT=360, diag=Math.hypot(w,h), NR=Math.ceil(diag*2)+1; const acc=new Float32Array(NT*NR); const cs=new Float32Array(NT), sn=new Float32Array(NT);
  for(let t=0;t<NT;t++){ cs[t]=Math.cos(t*Math.PI/NT); sn[t]=Math.sin(t*Math.PI/NT); }
  const edges=[]; for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=y*w+x; if(mag[i]<thr) continue; let th=Math.atan2(gy[i],gx[i]); if(th<0) th+=Math.PI; if(th>=Math.PI) th-=Math.PI; const t0=Math.round(th/Math.PI*NT);
    edges.push(i); for(let dt=-4;dt<=4;dt++){ const t=(t0+dt+NT)%NT; const rho=Math.round(x*cs[t]+y*sn[t]+diag); acc[t*NR+rho]+=1; } }
  const segs=[]; const minLen=Math.min(w,h)*0.08;
  for(let pk=0;pk<60;pk++){ let bi=-1,bv=minLen*0.8; for(let i=0;i<acc.length;i++) if(acc[i]>bv){ bv=acc[i]; bi=i; } if(bi<0) break;
    const t=(bi/NR)|0, rho=bi%NR-diag; for(let dt=-6;dt<=6;dt++) for(let dr=-6;dr<=6;dr++){ const tt=(t+dt+NT)%NT, rr=bi%NR+dr; if(rr>=0&&rr<NR) acc[tt*NR+rr]=0; }
    // walk along the line, collect longest run of edge support
    const dx=-sn[t], dy=cs[t], x0=cs[t]*rho, y0=sn[t]*rho; let run=0,gap=0,best=null,start=null,last=null;
    for(let s=-diag;s<=diag;s+=1){ const x=Math.round(x0+dx*s), y=Math.round(y0+dy*s); if(x<1||y<1||x>=w-1||y>=h-1){ continue; }
      let on=false; for(let o=-1;o<=1&&!on;o++){ const xx=Math.round(x+cs[t]*o), yy=Math.round(y+sn[t]*o); if(xx>0&&yy>0&&xx<w&&yy<h&&mag[yy*w+xx]>=thr*0.7) on=true; }
      if(on){ if(!start) start=[x,y]; last=[x,y]; gap=0; } else if(start&&++gap>4){ const L=Math.hypot(last[0]-start[0],last[1]-start[1]); if(L>=minLen&&(!best||L>best.L)) best={a:start,b:last,L}; start=null; gap=0; } }
    if(start&&last){ const L=Math.hypot(last[0]-start[0],last[1]-start[1]); if(L>=minLen&&(!best||L>best.L)) best={a:start,b:last,L}; }
    if(best) segs.push({a:[best.a[0]/w,best.a[1]/h],b:[best.b[0]/w,best.b[1]/h],L:best.L/Math.max(w,h)}); }
  segCache={id:D.tag+D.w,segs}; return segs; }
window.detectSegments=detectSegments;
function invMap(t,s,Wr,Hr){ let q=[0.5,0.5]; for(let i=0;i<20;i++){ const a=geomMap(q[0],q[1],s,Wr,Hr); const ex=a[0]-t[0], ey=a[1]-t[1]; if(Math.abs(ex)+Math.abs(ey)<1e-9) break; const e=1e-4;
  const bx=geomMap(q[0]+e,q[1],s,Wr,Hr), by=geomMap(q[0],q[1]+e,s,Wr,Hr); const j11=(bx[0]-a[0])/e,j21=(bx[1]-a[1])/e,j12=(by[0]-a[0])/e,j22=(by[1]-a[1])/e; const det=j11*j22-j12*j21; if(Math.abs(det)<1e-12) break;
  q=[q[0]-( j22*ex-j12*ey)/det, q[1]-(-j21*ex+j11*ey)/det]; } return q; }
function solveUpright(mode){ if(!S) return; const [Wp,Hp]=photoDims(); const odd=S.orient%2, Wr=odd?Hp:Wp, Hr=odd?Wp:Hp;
  const s0=Object.assign(clone(S),{angle:0,perspV:0,perspH:0,distortion:S.distortion,perspScale:100});
  let lines; if(mode==='guided') lines=(S.guides||[]).map(g=>({a:g.a,b:g.b,L:1,w:4})); else lines=detectSegments().map(x=>({...x,w:1}));
  // classify in the uncorrected output frame
  const V=[],Hz=[]; for(const l of lines){ const a=invMap(l.a,s0,Wr,Hr), b=invMap(l.b,s0,Wr,Hr); const dx=(b[0]-a[0])*Wr, dy=(b[1]-a[1])*Hr; const ang=Math.abs(Math.atan2(dx,dy)*180/Math.PI); const av=Math.min(ang,180-ang);
    if(av<(mode==='guided'?40:22)) V.push(l); else if(av>(mode==='guided'?50:68)) Hz.push(l); }
  if(V.length+Hz.length<1){ toast('No usable straight lines found'); $('#uprInfo').textContent='No strong straight lines were detected in this photo.'; return; }
  const useV = mode!=='level', useH = mode==='full'||mode==='guided'||mode==='level'||mode==='auto';
  const free = mode==='level'?['angle']:mode==='vertical'?['angle','perspV']:mode==='auto'?['angle','perspV']:['angle','perspV','perspH'];
  const cost=p=>{ const s=Object.assign(clone(s0),p); let c=0;
    for(const l of V){ const a=invMap(l.a,s,Wr,Hr), b=invMap(l.b,s,Wr,Hr); const dx=(b[0]-a[0])*Wr, dy=(b[1]-a[1])*Hr; const sn=dx/Math.hypot(dx,dy); c+=l.w*l.L*sn*sn*(useV?1:0.3); }
    if(useH) for(const l of Hz){ const a=invMap(l.a,s,Wr,Hr), b=invMap(l.b,s,Wr,Hr); const dx=(b[0]-a[0])*Wr, dy=(b[1]-a[1])*Hr; const sn=dy/Math.hypot(dx,dy); c+=l.w*l.L*sn*sn*(mode==='full'||mode==='guided'?1:0.5); }
    c+=1e-6*((p.perspV||0)**2+(p.perspH||0)**2)+1e-6*(p.angle||0)**2; return c; };
  let p={angle:0,perspV:0,perspH:0}; let step={angle:4,perspV:20,perspH:20}; let c=cost(p);
  for(let it=0;it<60;it++){ let improved=false; for(const k of free){ for(const sg of [1,-1]){ const q={...p,[k]:p[k]+sg*step[k]}; if(k==='angle'&&Math.abs(q.angle)>20) continue; if(k!=='angle'&&Math.abs(q[k])>100) continue; const cq=cost(q); if(cq<c){ c=cq; p=q; improved=true; } } }
    if(!improved){ free.forEach(k=>step[k]*=0.5); if(step.angle<0.02) break; } }
  S.angle=+p.angle.toFixed(2); S.perspV=Math.round(p.perspV); S.perspH=Math.round(p.perspH); constrainCrop(); syncUI(); schedule(true); syncUpr();
  $('#uprInfo').textContent=`${mode==='guided'?'Guides':'Detected'}: ${V.length} vertical, ${Hz.length} horizontal line(s) → rotate ${S.angle}°, vertical ${S.perspV}, horizontal ${S.perspH}.`; }
window.solveUpright=solveUpright;

/* ================= (5) Targeted adjustment ================= */
const vt=$('.vtools'); const tatB=document.createElement('button'); tatB.className='btn'; tatB.id='tatBtn'; tatB.textContent='◎ Target'; tatB.title='Targeted adjustment (T): drag up/down on the photo'; ($('#clipBtn')||$('#zoomBtn')).after(tatB); reg('tat',tatB);
const tsel=document.createElement('select'); tsel.id='tatSel'; tsel.innerHTML='<option value="curve">Tone curve</option><option value="hue">Hue</option><option value="sat">Saturation</option><option value="lum">Luminance</option>'; tatB.after(tsel); tsel.hidden=true;
tsel.onchange=()=>tatTarget=tsel.value; const obs=()=>tsel.hidden=ptool!=='tat'; tatB.addEventListener('click',()=>setTimeout(obs,0)); setInterval(obs,500);
const CEN=[0,30,60,120,180,240,280,320];
function hueW(H){ const w=CEN.map((c,i)=>{ let d=Math.abs(H-c); d=Math.min(d,360-d); const wd=i===3||i===4?55:(i<=2?30:42); let x=Math.max(0,1-d/wd); return x*x*(3-2*x); }); const s=w.reduce((a,b)=>a+b,0)||1; return w.map(x=>x/s); }
function tatSample(t){ const c=srcPx(t)||[128,128,128]; const [r,g,b]=c.map(v=>v/255); const mx=Math.max(r,g,b), mn=Math.min(r,g,b); let h=0; const d=mx-mn;
  if(d>1e-6){ h= mx===r?((g-b)/d)%6 : mx===g?(b-r)/d+2 : (r-g)/d+4; h*=60; if(h<0) h+=360; }
  // output luminance at that point for the curve
  let L=0.5; try{ const st=engine.state; engine.process(st,S); const os=Engine.outSize(st,S); const k=Math.min(1,300/Math.max(os.w,os.h)); const w=Math.max(8,Math.round(os.w*k)), hh=Math.max(8,Math.round(os.h*k));
    const r0=$('#gl').getBoundingClientRect(); const opt=zoom?{view:zoomView().view}:{}; const px=engine.readOut(st,S,w,hh,opt); const q=srcToDisp(t); const u=(q[0]-r0.left)/r0.width, v=(q[1]-r0.top)/r0.height;
    const i=(Math.min(hh-1,Math.max(0,Math.round(v*(hh-1))))*w+Math.min(w-1,Math.max(0,Math.round(u*(w-1)))))*4; L=(0.2126*px[i]+0.7152*px[i+1]+0.0722*px[i+2])/255; }catch(e){}
  return {h,w:hueW(h),L}; }
function tatApply(d,dy){ const B=d.base, sm=d.sample;
  if(tatTarget==='curve'){ const pts=clone(B.curve.m); const x=Math.min(0.97,Math.max(0.03,sm.L)); let i=pts.findIndex(p=>Math.abs(p[0]-x)<0.04);
    const yBase = i>=0?pts[i][1]:interp(pts,x); if(i<0){ pts.push([x,yBase]); pts.sort((a,b)=>a[0]-b[0]); i=pts.findIndex(p=>p[0]===x); }
    pts[i]=[pts[i][0],Math.min(1,Math.max(0,yBase+dy/600))]; S.curve.m=pts; }
  else { const key=tatTarget==='hue'?'h':tatTarget==='sat'?'s':'l'; const arr=B.hsl[key].slice(); sm.w.forEach((w,i)=>arr[i]=Math.max(-100,Math.min(100,Math.round(B.hsl[key][i]+w*dy/2)))); S.hsl[key]=arr; }
  syncUI(); schedule(); }
function interp(pts,x){ for(let i=1;i<pts.length;i++) if(x<=pts[i][0]){ const a=pts[i-1],b=pts[i]; return a[1]+(b[1]-a[1])*(x-a[0])/((b[0]-a[0])||1); } return x; }

/* keyboard */
document.addEventListener('keydown',e=>{ const t=e.target; if(t.tagName==='INPUT'&&t.type!=='range'||t.tagName==='SELECT'||t.tagName==='TEXTAREA'||!$('#modal').hidden||mode!=='develop') return;
  if(e.ctrlKey||e.metaKey) return; const k=e.key.toLowerCase();
  if(k==='t'){ setPTool('tat'); tsel.hidden=ptool!=='tat'; } else if(k==='b'&&e.shiftKey){ setPTool('hb'); } else if(k==='escape'&&ptool){ setPTool(ptool); } },true);
});
// Export of a photo that isn't open: provide its source pixels (range/AI masks, content-aware fill)
window.prepareExportPhoto=async(p,s)=>{ const needSrc=(s.masks||[]).some(m=>['color','luma','ai','depth'].includes(m.type)||(m.parts||[]).length)||(s.healStrokes||[]).length; if(!needSrc) return;
  const img=await decode(await blobGet(p.rawStored?p.id+':prev':p.id)); const c=scaledCanvas(img,1024); if(img.close) img.close();
  const D={w:c.width,h:c.height,data:c.getContext('2d').getImageData(0,0,c.width,c.height).data,tag:p.id}; window.maskSrcOverride=D;
  if(window.prepareAIFor) await prepareAIFor(p);
  if((s.healStrokes||[]).length){ const f=await computeFillFor(clone(s.healStrokes),D,p.id+'|'+JSON.stringify(s.healStrokes)); engine.fill=null; engine.setFill(f); } };
