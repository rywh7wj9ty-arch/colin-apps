'use strict';
/* Lightroom-style round 3: Navigator, Apply Previous, B&W Mixer, Solo mode,
   Lights Out, Quick Collection, Info overlay, thumbnail size, sharpen masking overlay. */
addEventListener('DOMContentLoaded',()=>{
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selected=()=>photos.filter(p=>sel.has(p.id));

/* ===== Apply Previous (Ctrl+Alt+V) ===== */
let prevDevId=null;
const _openDevelop=window.openDevelop;
window.openDevelop=async function(id){
  if(cur&&cur!==id){ prevDevId=cur; }
  const r=await _openDevelop.apply(this,arguments);
  try{ updateNavigator(); refreshLoupe(); }catch(_){}
  return r;
};
function applyPrevious(){
  if(!S) return toast('Open a photo in Develop first');
  const a=filtered(); const i=a.findIndex(p=>p.id===cur);
  let src=null;
  if(prevDevId&&prevDevId!==cur) src=photos.find(p=>p.id===prevDevId);
  if(!src&&i>0) src=a[i-1];
  if(!src) return toast('No previous photo to apply from');
  const keep={}; GEOM.forEach(k=>keep[k]=S[k]);
  const incoming=clone(src.settings); GEOM.forEach(k=>delete incoming[k]);
  S=fillDefaults(Object.assign(clone(S),incoming,keep));
  curPhoto().settings=S; syncUI();
  if(window.syncMaskUI) try{syncMaskUI();}catch(_){}
  if(window.syncSpotUI) try{syncSpotUI();}catch(_){}
  schedule(true); commit('Apply Previous'); toast('Applied settings from previous photo',1400);
}
{ const b=document.createElement('button'); b.className='btn'; b.id='prevSetBtn'; b.title='Apply Previous (Ctrl+Alt+V)'; b.textContent='Previous';
  const paste=$('#pasteBtn'); if(paste) paste.after(b); else $('.quick')?.appendChild(b); b.onclick=applyPrevious; }

/* ===== B&W Mixer panel ===== */
(function(){
  const after=[...$$('#sections details.sec')].find(d=>{
    const t=(d.querySelector('summary')?.textContent||''); return t.includes('Colour Mixer');
  });
  const d=document.createElement('details'); d.className='sec'; d.id='bwSec';
  d.innerHTML=`<summary>B&amp;W Mixer</summary><div class="secbody" id="bwBody">
    <label class="chk"><input type="checkbox" id="bwOn"> Convert to black &amp; white</label>
    <div class="hint">Per-hue luminance weights for mono conversion (Lightroom-style). Colour grading can still tint afterwards. Independent of FilmPack films.</div>
    <div id="bwSl"></div>
    <div class="row"><button class="btn" id="bwAuto">Auto B&amp;W</button><button class="btn" id="bwReset">Reset mix</button></div>
  </div>`;
  if(after) after.after(d); else $('#sections')?.appendChild(d);
  const host=$('#bwSl'); if(!host||typeof slider!=='function') return;
  HUES.forEach((n,i)=>{
    const trk=`linear-gradient(90deg,#222,${HUECOL[i]},#fff)`;
    slider(host,n,s=>((s.bwMix&&s.bwMix[i])||0),(s,v)=>{ if(!s.bwMix||s.bwMix.length!==8) s.bwMix=[0,0,0,0,0,0,0,0]; s.bwMix[i]=v; if(!s.bwOn){ s.bwOn=true; const c=$('#bwOn'); if(c) c.checked=true; } },-100,100,1,trk,'B&W '+n);
  });
  $('#bwOn').onchange=e=>{ if(!S) return; S.bwOn=!!e.target.checked; schedule(true); commit(S.bwOn?'B&W on':'B&W off'); };
  syncers.push(()=>{ const c=$('#bwOn'); if(c&&S) c.checked=!!S.bwOn; });
  $('#bwReset').onclick=()=>{ if(!S) return; S.bwMix=[0,0,0,0,0,0,0,0]; syncUI(); schedule(true); commit('Reset B&W mix'); };
  $('#bwAuto').onclick=()=>{ if(!S) return;
    let mix=[15,20,10,-5,-25,-40,-10,5];
    try{
      const id=prevData; if(id&&id.data){ const d=id.data; let warm=0,cool=0,green=0;
        for(let i=0;i<d.length;i+=16){ const r=d[i],g=d[i+1],b=d[i+2]; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); if(mx-mn<12) continue;
          if(r>g&&r>b) warm++; else if(b>r&&b>g) cool++; else if(g>=r&&g>=b) green++; }
        const t=Math.max(1,warm+cool+green), wr=warm/t, cr=cool/t, gr=green/t;
        mix=[Math.round(10+wr*40),Math.round(15+wr*35),Math.round(5+gr*20),Math.round(-5+gr*15),Math.round(-15-cr*25),Math.round(-30-cr*40),Math.round(-5-cr*10),Math.round(wr*15)];
      }
    }catch(_){}
    S.bwOn=true; S.bwMix=mix; $('#bwOn').checked=true; syncUI(); schedule(true); commit('Auto B&W'); toast('Auto B&W applied (heuristic)',1200);
  };
  setTimeout(()=>{ if(typeof addSectionResets==='function') addSectionResets(); },0);
})();

/* ===== Solo mode ===== */
let soloMode=localStorage.getItem('ps.solo')==='1';
function applySolo(keep){ $$('#sections details.sec').forEach(d=>{ if(d!==keep) d.open=false; }); if(keep) keep.open=true; }
$('#sections')?.addEventListener('click',e=>{
  if(e.target.closest('.secReset')) return;
  const sm=e.target.closest('summary'); if(!sm||!sm.parentElement?.classList.contains('sec')) return;
  if(!(e.altKey||soloMode)) return;
  e.preventDefault(); const d=sm.parentElement; const open=!d.open; applySolo(open?d:null); d.open=open;
},{capture:true});
{ const b=document.createElement('button'); b.className='btn'; b.id='soloBtn';
  b.title='Solo mode: only one Develop panel open (Alt-click a section always solos)';
  b.textContent=soloMode?'Solo: On':'Solo: Off';
  $('.quick')?.appendChild(b);
  b.onclick=()=>{ soloMode=!soloMode; localStorage.setItem('ps.solo',soloMode?'1':'0'); b.textContent=soloMode?'Solo: On':'Solo: Off';
    toast(soloMode?'Solo mode on — opening a panel closes the others':'Solo mode off (Alt-click still solos)',1600);
    if(soloMode){ const open=$('#sections details.sec[open]'); if(open) applySolo(open); } };
}

/* ===== Lights Out (L) ===== */
let lights=+(localStorage.getItem('ps.lights')||0)|0;
function setLights(n){
  lights=((n%3)+3)%3; localStorage.setItem('ps.lights',String(lights));
  document.body.classList.toggle('lights-dim',lights===1);
  document.body.classList.toggle('lights-out',lights===2);
  if(lights) toast(lights===1?'Lights dim':'Lights out — press L to restore',900);
}
setLights(lights);

/* ===== Quick Collection (B) ===== */
const QC_ID='__quick';
function ensureQCColl(){
  const list=(typeof getCollections==='function'?getCollections():null)||JSON.parse(localStorage.getItem('ps.colls')||'[]');
  if(!list.find(c=>c.id===QC_ID)){ list.push({id:QC_ID,name:'Quick Collection'}); localStorage.setItem('ps.colls',JSON.stringify(list)); }
  const cs=$('#fColl'); if(cs&&!cs.querySelector(`option[value="${QC_ID}"]`)){
    const opt=document.createElement('option'); opt.value=QC_ID; opt.textContent='▣ Quick Collection';
    const neu=cs.querySelector('option[value="__new"]'); if(neu) cs.insertBefore(opt,neu); else cs.appendChild(opt);
  }
}
ensureQCColl();
function toggleQC(list){
  if(!list.length) return toast('Select photos first');
  ensureQCColl();
  const allIn=list.every(p=>(p.collections||[]).includes(QC_ID));
  list.forEach(p=>{ const c=new Set(p.collections||[]); if(allIn) c.delete(QC_ID); else c.add(QC_ID); p.collections=[...c]; savePhoto(p,0); });
  // refresh count in select
  const cs=$('#fColl'); if(cs){ const n=photos.filter(p=>(p.collections||[]).includes(QC_ID)).length;
    const opt=cs.querySelector(`option[value="${QC_ID}"]`); if(opt) opt.textContent=`▣ Quick Collection (${n})`; }
  renderLibrary(); toast(allIn?`Removed ${list.length} from Quick Collection`:`Added ${list.length} to Quick Collection`,1200);
}
{ const b=document.createElement('button'); b.className='btn'; b.id='qcBtn'; b.title='Quick Collection (B) — click again to filter'; b.textContent='Quick';
  const ref=$('#selAll'); if(ref) ref.before(b); else $('.filterbar')?.appendChild(b);
  b.onclick=()=>{
    ensureQCColl(); const cs=$('#fColl');
    if(cs&&cs.value===QC_ID){ cs.value=''; cs.dispatchEvent(new Event('change')); toast('Showing all photos'); return; }
    if(cs){ cs.value=QC_ID; cs.dispatchEvent(new Event('change')); toast('Quick Collection'); }
    else toggleQC(targets().length?targets():selected());
  };
}

/* ===== Info overlay (I) ===== */
let infoOn=localStorage.getItem('ps.info')==='1';
const loupe=document.createElement('div'); loupe.id='loupeInfo'; loupe.hidden=true;
$('#stage')?.appendChild(loupe);
function refreshLoupe(){
  const p=curPhoto(); if(!p||!infoOn||mode!=='develop'){ loupe.hidden=true; return; }
  const lines=[]; lines.push(esc(p.name)); lines.push(`${p.w}×${p.h}${p.raw?' · RAW':''}`);
  if(p.exif){ const s=exifSummary(p.exif); if(s) lines.push(esc(s));
    if(p.exif.LensModel) lines.push(esc(p.exif.LensModel));
    const dt=String(p.exif.DateTimeOriginal||p.exif.DateTime||''); if(dt) lines.push(esc(dt.replace(/^(\d{4}):(\d{2}):(\d{2})/,'$1-$2-$3'))); }
  if(p.rating) lines.push('★'.repeat(p.rating));
  loupe.innerHTML=lines.join('<br>'); loupe.hidden=false;
}
{ const prev=window.updateDevMeta; window.updateDevMeta=function(){ if(typeof prev==='function') prev(); refreshLoupe(); }; }
function setInfo(on){ infoOn=!!on; localStorage.setItem('ps.info',infoOn?'1':'0'); refreshLoupe(); }

/* ===== Navigator ===== */
const nav=document.createElement('div'); nav.id='navBox'; nav.hidden=true;
nav.innerHTML='<canvas id="navCan" width="160" height="120"></canvas><div id="navRect"></div>';
$('#stage')?.appendChild(nav);
const navCan=$('#navCan'), navRect=$('#navRect'), navG=navCan?.getContext('2d');
let navDrag=null, navThumbFor=null;
function updateNavigator(){
  if(!navCan||mode!=='develop'||!zoom||cropOn||!S){ if(nav) nav.hidden=true; return; }
  nav.hidden=false; const p=curPhoto(); if(!p) return;
  if(navThumbFor===p.id&&navCan.width>1){ placeNavRect(); return; }
  const img=new Image();
  img.onload=()=>{
    const ar=img.naturalWidth/Math.max(1,img.naturalHeight); let nw=160, nh=Math.round(160/ar); if(nh>120){ nh=120; nw=Math.round(120*ar); }
    navCan.width=nw; navCan.height=nh; nav.style.width=nw+'px'; nav.style.height=nh+'px';
    navG.fillStyle='#111'; navG.fillRect(0,0,nw,nh); navG.drawImage(img,0,0,nw,nh);
    navThumbFor=p.id; placeNavRect();
  };
  try{ img.src=thumbURL(p); }catch(_){ nav.hidden=true; }
}
function placeNavRect(){
  if(!zoom||!nav||nav.hidden||!navCan) return;
  try{
    const V=zoomView(); const [vx,vy,vw,vh]=V.view; const W=navCan.width, H=navCan.height;
    navRect.style.left=(vx*W)+'px'; navRect.style.top=(vy*H)+'px';
    navRect.style.width=Math.max(6,vw*W)+'px'; navRect.style.height=Math.max(6,vh*H)+'px';
  }catch(_){}
}
navRect?.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); navDrag={ox:e.clientX,oy:e.clientY,c0:[...zc]}; try{navRect.setPointerCapture(e.pointerId);}catch(_){} });
navRect?.addEventListener('pointermove',e=>{ if(!navDrag||!zoom) return;
  const r=navCan.getBoundingClientRect(); const dx=(e.clientX-navDrag.ox)/Math.max(1,r.width), dy=(e.clientY-navDrag.oy)/Math.max(1,r.height);
  zc=[navDrag.c0[0]+dx, navDrag.c0[1]+dy]; schedule(); placeNavRect(); });
navRect?.addEventListener('pointerup',()=>{ navDrag=null; });
navCan?.addEventListener('pointerdown',e=>{ if(e.target===navRect) return; e.preventDefault();
  const r=navCan.getBoundingClientRect(); zc=[clamp((e.clientX-r.left)/r.width,0,1), clamp((e.clientY-r.top)/r.height,0,1)]; schedule(); placeNavRect(); });
// Hook setZoom (function declaration → global)
try{ const __sz=setZoom; setZoom=function(z,px,py){ __sz(z,px,py); navThumbFor=null; updateNavigator(); }; }catch(e){ console.warn('nav setZoom hook',e); }
addEventListener('resize',()=>{ if(zoom) placeNavRect(); });

/* ===== Thumbnail size ===== */
(function(){
  const fb=$('.filterbar'); if(!fb) return;
  const wrap=document.createElement('label'); wrap.className='thumbSz'; wrap.title='Thumbnail size';
  const v=localStorage.getItem('ps.thumbSz')||'180';
  wrap.innerHTML=`<span>Size</span><input type="range" id="thumbSz" min="90" max="280" step="10" value="${v}">`;
  const sp=fb.querySelector('.sp'); if(sp) sp.before(wrap); else fb.appendChild(wrap);
  const apply=()=>{ const n=+$('#thumbSz').value; localStorage.setItem('ps.thumbSz',String(n)); document.documentElement.style.setProperty('--cell-min',n+'px'); };
  $('#thumbSz').oninput=apply; apply();
})();

/* ===== Sharpening Masking overlay ===== */
(function(){
  let showMask=false;
  const de=[...$$('#sections details.sec')].find(d=>(d.querySelector('summary')?.textContent||'').includes('Detail'));
  if(!de) return;
  const maskRow=[...de.querySelectorAll('.sl')].find(r=>r.querySelector('label')?.textContent==='Masking');
  if(!maskRow) return;
  const tog=document.createElement('button'); tog.className='btn'; tog.id='shMaskBtn';
  tog.style.cssText='grid-column:1/-1;padding:4px 8px;min-height:28px;font-size:11px;justify-self:start';
  tog.textContent='Show mask'; tog.title='Show sharpening edge mask (or hold Alt while dragging Masking)';
  maskRow.after(tog);
  const ov=$('#ov');
  function drawSharpMask(){
    if(!showMask||!S||mode!=='develop'||!prevData||!ov) return;
    const {data,width:w,height:h}=prevData; const thr=(S.sharpMasking||0)/100*0.12;
    const out=new ImageData(w,h); const d=data, o=out.data;
    for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
      const i=(y*w+x)*4; const L=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255;
      let ed=0; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const j=((y+dy)*w+(x+dx))*4; const Li=(0.2126*d[j]+0.7152*d[j+1]+0.0722*d[j+2])/255; ed=Math.max(ed,Math.abs(Li-L)); }
      const m=ed>thr+0.02?255:ed>thr?Math.round((ed-thr)/0.02*255):0;
      o[i]=o[i+1]=o[i+2]=m; o[i+3]=210;
    }
    const gl=$('#gl'); if(!gl) return;
    const r=gl.getBoundingClientRect(), sr=$('#stage').getBoundingClientRect();
    const dpr=devicePixelRatio||1;
    ov.width=Math.max(1,Math.round(r.width*dpr)); ov.height=Math.max(1,Math.round(r.height*dpr));
    ov.style.left=(r.left-sr.left)+'px'; ov.style.top=(r.top-sr.top)+'px'; ov.style.width=r.width+'px'; ov.style.height=r.height+'px';
    const g=ov.getContext('2d'); const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').putImageData(out,0,0);
    g.imageSmoothingEnabled=false; g.clearRect(0,0,ov.width,ov.height); g.drawImage(c,0,0,ov.width,ov.height);
  }
  tog.onclick=()=>{ showMask=!showMask; tog.classList.toggle('on',showMask); if(showMask) drawSharpMask(); else { try{drawOverlay();}catch(_){ schedule(); } } toast(showMask?'Sharpening mask overlay on':'Overlay off',900); };
  const rng=maskRow.querySelector('input[type=range]');
  if(rng){
    rng.addEventListener('pointerdown',e=>{ if(e.altKey){ showMask=true; tog.classList.add('on'); drawSharpMask(); } });
    rng.addEventListener('input',e=>{ if(showMask||e.altKey){ showMask=true; tog.classList.add('on'); drawSharpMask(); } });
  }
  syncers.push(()=>{ if(showMask) setTimeout(drawSharpMask,40); });
})();

/* ===== Keyboard ===== */
addEventListener('keydown',e=>{
  const t=e.target; if((t.tagName==='INPUT'&&t.type!=='range')||t.tagName==='SELECT'||t.tagName==='TEXTAREA'||!$('#modal').hidden) return;
  const mod=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();
  if(mod&&e.altKey&&k==='v'){ e.preventDefault(); applyPrevious(); return; }
  if(mod) return;
  if(k==='l'){ e.preventDefault(); setLights(lights+1); return; }
  if(k==='b'){ e.preventDefault(); const list=targets().length?targets():selected(); toggleQC(list); return; }
  if(k==='i'&&!e.shiftKey){ e.preventDefault(); setInfo(!infoOn); toast(infoOn?'Info overlay on':'Info overlay off',800); return; }
});

/* ===== Help additions ===== */
{ const hb=$('#helpBtn'); if(hb){ const o=hb.onclick; hb.onclick=ev=>{ if(typeof o==='function') o.call(hb,ev);
  setTimeout(()=>{ const tbl=$('#dlg table'); if(!tbl||tbl.dataset.lr3) return; tbl.dataset.lr3='1';
    [['L','Lights Out (cycle dim / hide chrome)'],['B','Toggle Quick Collection'],['I','Info / EXIF overlay'],['Ctrl+Alt+V','Apply Previous settings'],['Alt-click panel','Solo that Develop section']].forEach(([k,v])=>{
      const tr=document.createElement('tr'); tr.innerHTML=`<td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td>`; tbl.appendChild(tr); });
  },0); }; } }

refreshLoupe();
window.__lr3={applyPrevious,toggleQC,setLights,setInfo,updateNavigator};
});
