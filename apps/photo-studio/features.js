/* Photo Studio — compare views, clipping overlay, WB eyedropper, snapshots, virtual copies, crop grids, tips */
addEventListener("DOMContentLoaded",()=>{
let cmpMode='off', clipOn=false, wbPick=false, split=0.5, bKey='', gridMode=+(localStorage.getItem('ps.grid')||0);
const bc=document.createElement('canvas'), ac=document.createElement('canvas');
const cmp=document.createElement('canvas'); cmp.id='cmp'; cmp.hidden=true; $('#stage').appendChild(cmp);
const cl=document.createElement('div'); cl.id='cmpLabels'; cl.hidden=true; $('#stage').appendChild(cl);

// ---- toolbar buttons ----
const vt=$('.vtools'), mkB=(id,txt,title,after)=>{ const b=document.createElement('button'); b.className='btn'; b.id=id; b.textContent=txt; b.title=title; after.after(b); return b; };
const cmpBtn=mkB('cmpBtn','Compare','Compare: split / side-by-side / off (Y)',$('#baBtn'));
const wbBtn=mkB('wbBtn','WB ⌖','White balance eyedropper (W): tap something neutral grey/white',$('#zoomBtn'));
const clipBtn=mkB('clipBtn','Clip','Show highlight (red) / shadow (blue) clipping (J)',wbBtn);
const q=$('.quick'); const vcB=document.createElement('button'); vcB.className='btn'; vcB.id='vcBtn'; vcB.textContent='V-Copy'; vcB.title="Create virtual copy (Ctrl+')"; q.appendChild(vcB);

function active(){ return mode==='develop' && (cmpMode!=='off'||clipOn) && !cropOn; }
function setCmp(m){ cmpMode=m; if(m!=='off'){ if(tool) setTool(tool); if(cropOn) toggleCrop(false); setWB(false); }
  cmpBtn.classList.toggle('on',m!=='off'); cmpBtn.textContent=m==='off'?'Compare':m==='split'?'Split':'Side by side'; bKey=''; schedule(true); }
function cycleCmp(){ setCmp(cmpMode==='off'?'split':cmpMode==='split'?'side':'off'); }
function setClip(on){ clipOn=on; clipBtn.classList.toggle('on',on); schedule(true); }
cmpBtn.onclick=cycleCmp; clipBtn.onclick=()=>setClip(!clipOn);
window.setCompare=setCmp; window.setClip=setClip;

// ---- compositor hook ----
const baseFrame=window.frame;
window.frame=function(){ baseFrame(); try{ composite(); }catch(e){ console.error(e); } };
function fitRect(W,H,bw,bh,ox){ const k=Math.min(bw/W,bh/H); const w=W*k,h=H*k; return [ox+(bw-w)/2,(bh-h)/2,w,h]; }
function composite(){
  const gl=$('#gl'); const on=active(); cmp.hidden=!on; cl.hidden=!(on&&cmpMode!=='off'); gl.style.visibility=on?'hidden':'';
  if(!on||!engine.state) return;
  const stg=$('#stage'), dpr=Math.min(2,devicePixelRatio||1), pad=8; const SW=stg.clientWidth, SH=stg.clientHeight;
  if(cmp.width!==Math.round(SW*dpr)||cmp.height!==Math.round(SH*dpr)){ cmp.width=Math.round(SW*dpr); cmp.height=Math.round(SH*dpr); }
  const g=cmp.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,SW,SH);
  if(zoom){ composeZoomed(g,SW,SH,dpr); return; }
  ac.width=gl.width; ac.height=gl.height; ac.getContext('2d').drawImage(gl,0,0); // after (current frame)
  if(cmpMode!=='off'){ const bs=defaults(); VIEWGEOM.forEach(k=>bs[k]=S[k]); const key=cur+'|'+engine.state.w+'|'+JSON.stringify(bs);
    if(key!==bKey){ engine.render(bs); bc.width=gl.width; bc.height=gl.height; bc.getContext('2d').drawImage(gl,0,0); engine.render(S); bKey=key; } }
  let A=ac; if(clipOn) A=clipify(ac);
  const W=ac.width,H=ac.height;
  if(cmpMode==='side'){ const hw=(SW-pad*3)/2; const r1=fitRect(W,H,hw,SH-pad*2,pad), r2=fitRect(W,H,hw,SH-pad*2,pad*2+hw);
    r1[1]+=pad; r2[1]+=pad; g.drawImage(bc,...r1); g.drawImage(A,...r2); cl.innerHTML=`<span style="left:${r1[0]+6}px;top:${r1[1]+6}px">Before</span><span style="left:${r2[0]+6}px;top:${r2[1]+6}px">After</span>`; }
  else { const r=fitRect(W,H,SW-pad*2,SH-pad*2,pad); r[1]+=pad; g.drawImage(A,...r);
    if(cmpMode==='split'){ const sx=r[2]*split; g.save(); g.beginPath(); g.rect(r[0],r[1],sx,r[3]); g.clip(); g.drawImage(bc,...r); g.restore();
      const x=r[0]+sx; if(!window.__baUI){ g.fillStyle='#fff'; g.fillRect(x-1,r[1],2,r[3]); g.beginPath(); g.arc(x,r[1]+r[3]/2,14,0,7); g.fill(); g.fillStyle='#222'; g.font='bold 13px sans-serif'; g.textAlign='center'; g.fillText('⇔',x,r[1]+r[3]/2+5); }
      cl.innerHTML=`<span style="left:${r[0]+6}px;top:${r[1]+6}px">Before</span><span style="right:${SW-r[0]-r[2]+6}px;top:${r[1]+6}px">After</span>`; cmp._r=r; } }
}
/* ---- compare while zoomed: both sides show the same region (synced zoom/pan), before = full-res original of that region ---- */
function zst(V){ let st=engine.state; if(V.need>engine.state.scale*1.1){ const t=tileFor(V); if(t) st=t; } return st; }
function grab(dst,set,opt){ engine.render(set,opt); const gl=$('#gl'); dst.width=gl.width; dst.height=gl.height; dst.getContext('2d').drawImage(gl,0,0); return dst; }
function beforeSet(){ if(window.beforeEditSettings) return beforeEditSettings(); const bs=defaults(); VIEWGEOM.forEach(k=>bs[k]=S[k]); return bs; }
function composeZoomed(g,SW,SH,dpr){
  const V=zoomView(), st=zst(V), bs=beforeSet(); const [fw,fh]=frameFull();
  if(cmpMode==='side'){ const gap=4, hw=(SW-gap)/2; const vw=hw/(zoom*fw), vh=SH/(zoom*fh);
    const view=[zc[0]-vw/2, V.view[1], vw, V.view[3]]; if(vw>=1){ view[0]=(1-vw)/2; } else view[0]=Math.min(1-vw,Math.max(0,view[0]));
    const size=[Math.round(hw*dpr),Math.round(SH*dpr)];
    grab(bc,bs,{st,size,view}); let A=grab(ac,S,{st,size,view}); if(clipOn) A=clipify(A);
    engine.render(viewSettings(),{st,size:V.size,view:V.view}); // restore main canvas for tools/readers
    g.drawImage(bc,0,0,hw,SH); g.drawImage(A,hw+gap,0,hw,SH); g.fillStyle='#000'; g.fillRect(hw,0,gap,SH);
    cl.innerHTML=`<span style="left:6px;top:6px">Before</span><span style="left:${hw+gap+6}px;top:6px">After</span>`; cmp._r=null; bKey=''; return; }
  let A=grab(ac,viewSettings(),{st,size:V.size,view:V.view}); if(clipOn) A=clipify(A);
  const r=[0,0,SW,SH]; g.drawImage(A,...r);
  if(cmpMode==='split'){ grab(bc,bs,{st,size:V.size,view:V.view}); engine.render(viewSettings(),{st,size:V.size,view:V.view});
    const sx=r[2]*split; g.save(); g.beginPath(); g.rect(0,0,sx,SH); g.clip(); g.drawImage(bc,...r); g.restore();
    if(!window.__baUI){ g.fillStyle='#fff'; g.fillRect(sx-1,0,2,SH); g.beginPath(); g.arc(sx,SH/2,14,0,7); g.fill(); g.fillStyle='#222'; g.font='bold 13px sans-serif'; g.textAlign='center'; g.fillText('⇔',sx,SH/2+5); }
    cl.innerHTML=`<span style="left:6px;top:6px">Before</span><span style="right:6px;top:6px">After</span>`; cmp._r=r; }
  else cl.innerHTML='';
  bKey='';
}
window.__cmpState=()=>({mode:cmpMode,split,zoom,active:active()});
window.__setSplit=v=>{ split=Math.min(1,Math.max(0,v)); schedule(true); }; window.__cmpRect=()=>cmp._r;
const cc=document.createElement('canvas');
function clipify(src){ cc.width=src.width; cc.height=src.height; const g=cc.getContext('2d'); g.drawImage(src,0,0); const im=g.getImageData(0,0,cc.width,cc.height), d=im.data;
  for(let i=0;i<d.length;i+=4){ const mx=Math.max(d[i],d[i+1],d[i+2]), mn=Math.min(d[i],d[i+1],d[i+2]);
    if(mx>=254){ d[i]=255; d[i+1]=d[i+2]=0; } else if(mn<=1 && mx<=6){ d[i]=d[i+1]=40; d[i+2]=255; } }
  g.putImageData(im,0,0); return cc; }
// split drag
let drag=false; const spl=e=>{ const r=cmp._r; if(!r) return; const b=cmp.getBoundingClientRect(); split=Math.min(1,Math.max(0,(e.clientX-b.left-r[0])/r[2])); schedule(true); };
cmp.addEventListener('pointerdown',e=>{ if(cmpMode!=='split'||!cmp._r) return; const b=cmp.getBoundingClientRect(), r=cmp._r, dx=e.clientX-b.left-(r[0]+r[2]*split); if(Math.abs(dx)>(e.pointerType==='mouse'?18:32)) return; drag=true; try{cmp.setPointerCapture(e.pointerId);}catch(_){} spl(e); e.stopPropagation(); });
cmp.addEventListener('pointermove',e=>{ if(drag){ spl(e); e.stopPropagation(); } else if(cmpMode==='split'&&cmp._r&&e.pointerType==='mouse'){ const b=cmp.getBoundingClientRect(), r=cmp._r; cmp.style.cursor=Math.abs(e.clientX-b.left-(r[0]+r[2]*split))<=18?'ew-resize':(zoom?'grab':''); } }); cmp.addEventListener('pointerup',e=>{ if(drag){ drag=false; e.stopPropagation(); } }); cmp.addEventListener('pointercancel',()=>drag=false);

// ---- WB eyedropper ----
function setWB(on){ wbPick=on; wbBtn.classList.toggle('on',on); $('#stage').classList.toggle('picking',on); if(on){ if(cmpMode!=='off') setCmp('off'); if(tool) setTool(tool); toast('Tap something that should be neutral grey/white',2500); } }
wbBtn.onclick=()=>setWB(!wbPick);
function sampleAt(s,u,v){ const st=engine.state; engine.process(st,s); const os=Engine.outSize(st,s); const k=Math.min(1,400/Math.max(os.w,os.h)); const w=Math.max(8,Math.round(os.w*k)), h=Math.max(8,Math.round(os.h*k));
  const opt=zoom?{view:zoomView().view}:{}; const px=engine.readOut(st,s,w,h,opt); const cx=Math.round(u*(w-1)), cy=Math.round(v*(h-1)); const m=[0,0,0]; let n=0;
  for(let y=cy-2;y<=cy+2;y++) for(let x=cx-2;x<=cx+2;x++){ if(x<0||y<0||x>=w||y>=h) continue; const i=(y*w+x)*4; m[0]+=px[i];m[1]+=px[i+1];m[2]+=px[i+2]; n++; }
  return m.map(x=>x/Math.max(1,n)); }
function wbErr(c){ const sm=c[0]+c[1]+c[2]+1; return [(c[2]-c[0])/sm,(c[1]-(c[0]+c[2])/2)/sm]; }
function pickWB(u,v){ const s=clone(S); let x=[s.wbTemp,s.wbTint]; const ev=x2=>{ const t=clone(s); t.wbTemp=x2[0]; t.wbTint=x2[1]; return wbErr(sampleAt(t,u,v)); };
  const c0=sampleAt(s,u,v); if(Math.max(...c0)>=253||Math.max(...c0)<4){ toast('That spot is clipped — pick a mid-tone neutral area'); return; }
  for(let it=0;it<5;it++){ const f=ev(x); if(Math.abs(f[0])+Math.abs(f[1])<0.004) break; const d=8, fa=ev([x[0]+d,x[1]]), fb=ev([x[0],x[1]+d]);
    const J=[[(fa[0]-f[0])/d,(fb[0]-f[0])/d],[(fa[1]-f[1])/d,(fb[1]-f[1])/d]]; const det=J[0][0]*J[1][1]-J[0][1]*J[1][0]; if(Math.abs(det)<1e-9) break;
    const dx=[(J[1][1]*f[0]-J[0][1]*f[1])/det,(-J[1][0]*f[0]+J[0][0]*f[1])/det]; x=[clamp(x[0]-dx[0],-100,100),clamp(x[1]-dx[1],-100,100)]; }
  S.wbTemp=Math.round(x[0]); S.wbTint=Math.round(x[1]); syncUI(); schedule(true); commit('White balance (eyedropper)'); toast(`WB set: Temp ${S.wbTemp}, Tint ${S.wbTint}`,1500); }
$('#stage').addEventListener('pointerdown',e=>{ if(!wbPick||mode!=='develop') return; e.stopPropagation(); e.preventDefault();
  const r=$('#gl').getBoundingClientRect(); const u=(e.clientX-r.left)/r.width, v=(e.clientY-r.top)/r.height; if(u<0||v<0||u>1||v>1) return;
  pickWB(u,v); setWB(false); },true);
window.pickWB=pickWB; window.setWB=setWB;

// ---- Snapshots ----
const sec=document.createElement('details'); sec.className='sec'; sec.innerHTML='<summary>Snapshots</summary><div class="secbody"><div class="plist" id="snapList"></div><div class="row"><button class="btn" id="snapAdd">+ Snapshot current state</button></div></div>';
const hl=$('#hlist').closest('details'); hl.after(sec);
function renderSnaps(){ const p=curPhoto(), el=$('#snapList'); if(!el) return; const a=(p&&p.snapshots)||[];
  el.innerHTML=a.length?a.map((x,i)=>`<div class="pi" data-i="${i}"><span>${x.name.replace(/</g,'&lt;')}</span><button class="snapDel" data-i="${i}" title="Delete">×</button></div>`).join(''):'<div class="hint">No snapshots yet. Save one to keep a version you can return to.</div>'; }
$('#snapAdd').onclick=()=>{ const p=curPhoto(); if(!p||!S) return; const n=prompt('Snapshot name',`Snapshot ${((p.snapshots||[]).length+1)}`); if(!n) return; (p.snapshots=p.snapshots||[]).push({name:n,s:clone(S),t:Date.now()}); savePhoto(p,0); renderSnaps(); toast('Snapshot saved',900); };
$('#snapList').addEventListener('click',e=>{ const p=curPhoto(); if(!p) return; const d=e.target.closest('.snapDel'); if(d){ p.snapshots.splice(+d.dataset.i,1); savePhoto(p,0); renderSnaps(); return; }
  const it=e.target.closest('.pi'); if(!it) return; const sn=p.snapshots[+it.dataset.i]; S=fillDefaults(clone(sn.s)); p.settings=S; syncUI(); schedule(true); commit('Snapshot: '+sn.name); });
const baseRH=window.renderHistory; window.renderHistory=function(){ baseRH(); renderSnaps(); };
window.renderSnaps=renderSnaps;

// ---- Virtual copies ----
async function virtualCopy(){ const list=targets(); if(!list.length) return toast('Select photos first'); let last=null;
  for(const p of list){ const th=p.thumb; const c=clone(Object.assign({},p,{thumb:null})); c.thumb=th; c.id=uid(); c.master=p.master||p.id; const n=photos.filter(x=>(x.master||x.id)===c.master).length; c.name=p.name.replace(/ \(Copy \d+\)$/,'')+` (Copy ${n})`; c.virtual=true; c.added=Date.now(); c.snapshots=[];
    c.history=[{label:'Virtual copy',s:clone(p.settings)}]; c.hIdx=0; await dbPut(c); photos.splice(photos.indexOf(p)+1,0,c); last=c; }
  toast(list.length>1?`${list.length} virtual copies created`:'Virtual copy created',1200);
  if(mode==='develop'&&last) openDevelop(last.id); else renderLibrary(); }
vcB.onclick=virtualCopy; window.virtualCopy=virtualCopy;

// ---- crop grid overlays ----
const GRIDS=['thirds','grid','golden','diagonal','off'];
function applyGrid(){ const g=$('#cropBox .grid3'); if(g) g.dataset.g=GRIDS[gridMode]; const b=$('#gridBtn'); if(b) b.textContent='Grid: '+GRIDS[gridMode]; localStorage.setItem('ps.grid',gridMode); }
const cropRow=$('#cropTool').parentElement; const gb=document.createElement('button'); gb.className='btn'; gb.id='gridBtn'; gb.title='Cycle crop overlay (O while cropping)'; cropRow.appendChild(gb); gb.onclick=()=>{ gridMode=(gridMode+1)%GRIDS.length; applyGrid(); }; applyGrid();

// ---- per-slider double-tap reset on touch ----
let lastTap={el:null,t:0};
document.addEventListener('pointerup',e=>{ const lab=e.target.closest('.sl label'); if(!lab||e.pointerType==='mouse') return; const now=Date.now();
  if(lastTap.el===lab&&now-lastTap.t<400){ lab.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); lastTap={el:null,t:0}; toast('Reset '+lab.textContent,700); } else lastTap={el:lab,t:now}; });

// ---- keyboard ----
document.addEventListener('keydown',e=>{ const t=e.target; if(t.tagName==='INPUT'&&t.type!=='range'||t.tagName==='SELECT'||t.tagName==='TEXTAREA'||!$('#modal').hidden) return;
  const mod=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();
  if(mod&&k==="'"){ e.preventDefault(); virtualCopy(); return; }
  if(mod||mode!=='develop') return;
  if(k==='y'){ e.preventDefault(); e.stopImmediatePropagation(); cycleCmp(); } else if(k==='j'){ setClip(!clipOn); } else if(k==='w'){ setWB(!wbPick); }
  else if(k==='o'&&cropOn){ e.stopImmediatePropagation(); gridMode=(gridMode+1)%GRIDS.length; applyGrid(); } else if(k==='escape'&&wbPick) setWB(false); },true);

// ---- onboarding tips ----
const TIPS=[['Import','Tap <b>Import</b> or drag photos in. JPEG, PNG, WebP and RAW (CR2/CR3/NEF/ARW/RAF/DNG…) are decoded on your device. Nothing is uploaded.'],
 ['Develop','Open a photo, then use the panels on the right (below the image on iPhone). Double-click/double-tap a slider label to reset it, or tap the number to type a value. ↺ resets a whole section.'],
 ['Compare','<b>◐ Original</b>: tap to toggle, or hold to peek. <b>Compare</b> cycles through split view (drag the divider) and side-by-side.'],
 ['Colour & exposure','<b>WB ⌖</b>: tap something neutral to set white balance. <b>Clip</b> shows blown highlights in red and crushed shadows in blue.'],
 ['Versions','<b>Snapshots</b> save named versions. <b>V-Copy</b> makes a virtual copy so you can try a second edit without duplicating the file. Undo/redo (↶ ↷) and full History are always there.'],
 ['Noise','On high-ISO shots try Detail → Luminance 30–50. Colour NR is on by default and adapts to the noise it measures.'],
 ['Export','<b>Export</b> renders full resolution JPEGs (batch supported) with basic EXIF. Edits are saved automatically in this browser.']];
function showTips(){ dlg(`<h3>Quick tips</h3><ol class="tips">${TIPS.map(([h,t])=>`<li><b>${h}</b> — ${t}</li>`).join('')}</ol><div class="row"><button class="btn" onclick="closeDlg()">Got it</button></div>`); localStorage.setItem('ps.tips3','1'); }
window.showTips=showTips;
const hb=$('#helpBtn'); const baseHelp=hb.onclick; hb.onclick=()=>{ baseHelp(); const d=$('#dlg'); const extra=document.createElement('div'); extra.innerHTML=`<table>${[['Y','Compare: split / side-by-side'],['J','Clipping overlay'],['W','White balance eyedropper'],["Ctrl+'",'Virtual copy'],['O (crop)','Cycle crop grid']].map(([a,b])=>`<tr><td><kbd>${a}</kbd></td><td>${b}</td></tr>`).join('')}</table><div class="row"><button class="btn" id="tipsAgain">Show tips</button></div>`; d.appendChild(extra); $('#tipsAgain').onclick=showTips; };
if(!localStorage.getItem('ps.tips3')) setTimeout(()=>{ if($('#modal').hidden) showTips(); },900);

// exit compare when other tools start
['#cropBtn','#healBtn','#maskBtn'].forEach(s=>$(s).addEventListener('click',()=>{ if(cmpMode!=='off') setCmp('off'); if(wbPick) setWB(false); },true));
});
