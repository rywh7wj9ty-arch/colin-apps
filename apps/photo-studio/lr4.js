'use strict';
/* Lightroom / DxO round 4: Selective Tone, dual Defringe, Red-eye, Slideshow,
   Library Loupe, spot source nudge, filter chips. */
addEventListener('DOMContentLoaded',()=>{
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selected=()=>photos.filter(p=>sel.has(p.id));

/* ===== DxO Selective Tone panel ===== */
(function(){
  const after=[...$$('#sections details.sec')].find(d=>{
    const t=(d.querySelector('summary')?.textContent||''); return t.startsWith('Basic')||t.includes('Basic');
  });
  const d=document.createElement('details'); d.className='sec'; d.id='stSec';
  d.innerHTML=`<summary>Selective Tone</summary><div class="secbody" id="stBody">
    <div class="hint">DxO-style luminance-weighted bands — independent of Basic Highlights / Shadows / Whites / Blacks.</div>
    <div id="stSl"></div>
    <div class="row"><button class="btn" id="stReset">Reset Selective Tone</button></div>
  </div>`;
  if(after) after.after(d); else $('#sections')?.prepend(d);
  const host=$('#stSl'); if(host&&typeof slider==='function'){
    slider(host,'Highlights',s=>s.stHi||0,(s,v)=>s.stHi=v,-100,100,1,null,'Selective Tone highlights');
    slider(host,'Midtones',s=>s.stMid||0,(s,v)=>s.stMid=v,-100,100,1,null,'Selective Tone midtones');
    slider(host,'Shadows',s=>s.stSh||0,(s,v)=>s.stSh=v,-100,100,1,null,'Selective Tone shadows');
    slider(host,'Blacks',s=>s.stBlk||0,(s,v)=>s.stBlk=v,-100,100,1,null,'Selective Tone blacks');
  }
  $('#stReset').onclick=()=>{ if(!S) return; S.stHi=S.stMid=S.stSh=S.stBlk=0; syncUI(); schedule(true); commit('Reset Selective Tone'); };
  setTimeout(()=>{ if(typeof addSectionResets==='function') addSectionResets(); },0);
})();

/* ===== Dual Defringe (purple + green + hue ranges) ===== */
(function(){
  const lens=[...$$('#sections details.sec')].find(d=>(d.querySelector('summary')?.textContent||'').startsWith('Lens'));
  if(!lens||typeof slider!=='function') return;
  const body=lens.querySelector('.secbody')||lens.lastElementChild;
  // Find purple fringing slider row and append green + ranges after optical block
  const wrap=document.createElement('div'); wrap.id='defringeExtra';
  wrap.innerHTML='<div class="hint" style="margin-top:6px">Defringe: separate purple &amp; green amounts with hue range (Lightroom-style).</div>';
  body.appendChild(wrap);
  slider(wrap,'Green fringing',s=>s.fringeG||0,(s,v)=>s.fringeG=v,0,100,1,null,'Green fringing');
  slider(wrap,'Purple hue range',s=>s.fringePR??40,(s,v)=>s.fringePR=v,8,80,1,null,'Purple fringe hue range');
  slider(wrap,'Green hue range',s=>s.fringeGR??30,(s,v)=>s.fringeGR=v,6,70,1,null,'Green fringe hue range');
})();

/* ===== Red-eye correction ===== */
let selRE=-1, reTool=false;
const reDef={r:0.018,amt:100};
function ensureRE(){ if(S&&!Array.isArray(S.redEyes)) S.redEyes=[]; }
function syncREUI(){
  ensureRE();
  const list=$('#reList'); if(!list||!S) return;
  const L=S.redEyes||[];
  list.innerHTML=L.length?L.map((e,i)=>`<button class="btn ${i===selRE?'on':''}" data-i="${i}">Eye ${i+1}</button>`).join('')+'':'<span class="hint">No red-eye pins yet</span>';
  list.onclick=ev=>{ const b=ev.target.closest('[data-i]'); if(!b) return; selRE=+b.dataset.i; syncREUI(); if(typeof drawOverlay==='function') drawOverlay(); };
  const del=$('#reDel'); if(del) del.disabled=selRE<0||selRE>=L.length;
}
function detectRedEye(nx,ny){
  /* Heuristic: sample a neighbourhood around the click for reddish/saturated pixels and fit a pupil radius. */
  const D=window.srcHi||window.prevData; if(!D||!D.data) return {x:nx,y:ny,r:reDef.r,amt:reDef.amt};
  const W=D.w,H=D.h,d=D.data;
  const cx=Math.round(nx*(W-1)), cy=Math.round(ny*(H-1));
  const R=Math.max(4,Math.round(Math.min(W,H)*0.035));
  let sx=0,sy=0,sw=0,bestR=reDef.r;
  for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){
    if(dx*dx+dy*dy>R*R) continue;
    const x=cx+dx,y=cy+dy; if(x<0||y<0||x>=W||y>=H) continue;
    const i=(y*W+x)*4; const r=d[i],g=d[i+1],b=d[i+2];
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b); const sat=mx?(mx-mn)/mx:0;
    const redBias=(r>g*1.15&&r>b*1.05&&r>40)? (r-Math.max(g,b))/255*sat : 0;
    if(redBias>0.04){ const w=redBias; sx+=x*w; sy+=y*w; sw+=w; }
  }
  let fx=nx,fy=ny;
  if(sw>0.15){ fx=sx/sw/(W-1); fy=sy/sw/(H-1);
    // radius from spread of red pixels
    let rs=0,rn=0;
    for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){
      const x=Math.round(sx/sw)+dx,y=Math.round(sy/sw)+dy; if(x<0||y<0||x>=W||y>=H) continue;
      const i=(y*W+x)*4; const r=d[i],g=d[i+1],b=d[i+2];
      if(r>g*1.15&&r>b*1.05&&r>40){ rs+=Math.hypot(dx,dy); rn++; }
    }
    if(rn>3) bestR=clamp((rs/rn*1.35)/Math.max(W,H),0.006,0.06);
  }
  return {x:+fx.toFixed(5),y:+fy.toFixed(5),r:+bestR.toFixed(5),amt:reDef.amt};
}
function drawREOverlay(){ if(typeof drawOverlay==='function') drawOverlay(); }

(function(){
  const after=$('#healSec')?.parentElement || [...$$('#sections details.sec')].find(d=>(d.querySelector('summary')?.textContent||'').includes('Spot'));
  const d=document.createElement('details'); d.className='sec'; d.id='reSecWrap';
  d.innerHTML=`<summary>Red-eye</summary><div class="secbody" id="reSec">
    <div class="row"><button class="btn" id="reToolBtn" title="Red-eye tool (E)">Red-eye tool</button>
      <button class="btn" id="reDel" disabled>Delete pin</button>
      <button class="btn" id="reClear">Clear all</button></div>
    <div id="reList" class="row" style="flex-wrap:wrap;gap:4px"></div>
    <div id="reSl"></div>
    <div class="hint">Click an eye: a local red-pupil heuristic places a pin, then darkens &amp; desaturates. Drag pin to move; Size / Amount adjust the selected pin. Not AI face detection.</div>
  </div>`;
  if(after) after.after(d); else $('#sections')?.appendChild(d);
  if(typeof slider==='function'){
    slider($('#reSl'),'Size',()=>{ const e=S&&S.redEyes&&S.redEyes[selRE]; return e?+(e.r*100).toFixed(2):+(reDef.r*100).toFixed(2); },
      (s,v)=>{ reDef.r=v/100; const e=S&&S.redEyes&&S.redEyes[selRE]; if(e){ e.r=v/100; schedule(true); } },0.4,6,0.05,null,'Red-eye size');
    slider($('#reSl'),'Amount',()=>{ const e=S&&S.redEyes&&S.redEyes[selRE]; return e?e.amt??100:reDef.amt; },
      (s,v)=>{ reDef.amt=v; const e=S&&S.redEyes&&S.redEyes[selRE]; if(e){ e.amt=v; schedule(true); } },0,100,1,null,'Red-eye amount');
  }
  $('#reToolBtn').onclick=()=>setRedEyeTool(!reTool);
  $('#reDel').onclick=()=>{ if(!S||selRE<0) return; S.redEyes.splice(selRE,1); selRE=-1; schedule(true); commit('Delete red-eye'); syncREUI(); if(typeof drawOverlay==='function') drawOverlay(); };
  $('#reClear').onclick=()=>{ if(!S||!(S.redEyes||[]).length) return; S.redEyes=[]; selRE=-1; schedule(true); commit('Clear red-eyes'); syncREUI(); if(typeof drawOverlay==='function') drawOverlay(); };
  setTimeout(()=>{ if(typeof addSectionResets==='function') addSectionResets(); },0);
})();

function setRedEyeTool(on){
  reTool=!!on;
  if(reTool){
    if(tool==='heal'||tool==='mask'){ tool=null; }
    tool='redeye';
  } else if(tool==='redeye'){ tool=null; }
  $('#reToolBtn')?.classList.toggle('on',tool==='redeye');
  $('#healBtn')?.classList.toggle('on',tool==='heal');
  $('#maskBtn')?.classList.toggle('on',tool==='mask');
  $('#stage')?.classList.toggle('tooling',!!tool);
  if(reTool){ const w=$('#reSecWrap'); if(w) w.open=true; toast('Red-eye: tap pupils',1200); }
  schedule(); if(typeof drawOverlay==='function') drawOverlay();
}
// Hook setTool so heal/mask clear redeye mode
{ const _st=typeof setTool==='function'?setTool:null;
  if(_st){
    const wrapped=function(t){
      if(t==='redeye'){ setRedEyeTool(tool!=='redeye'); return; }
      const r=_st.apply(this,arguments);
      if(tool!=='redeye'){ reTool=false; $('#reToolBtn')?.classList.remove('on'); }
      return r;
    };
    try{ window.setTool=wrapped; }catch(_){}
    try{ setTool=wrapped; }catch(_){ try{ window.setTool=wrapped; }catch(__){} }
  }
}

// Pointer: red-eye place / move
$('#stage')?.addEventListener('pointerdown',e=>{
  if(mode!=='develop'||!S||tool!=='redeye'||e.button===1) return;
  if(e.target.closest('#cropBox,#navBox')) return;
  e.preventDefault(); e.stopPropagation();
  ensureRE();
  const p=[e.clientX,e.clientY]; const t=dispToSrc(p[0],p[1]);
  let hit=-1; (S.redEyes||[]).forEach((ey,i)=>{
    const d=srcToDisp([ey.x,ey.y]); const rad=ey.r*photoDims()[0]/srcPxPerDisp(d[0],d[1]);
    if(Math.hypot(p[0]-d[0],p[1]-d[1])<=Math.max(rad,14)) hit=i;
  });
  if(hit>=0){ selRE=hit; syncREUI();
    const ey=S.redEyes[hit], o={x:ey.x,y:ey.y};
    const move=ev=>{ const t2=dispToSrc(ev.clientX,ev.clientY); ey.x=clamp(t2[0],0,1); ey.y=clamp(t2[1],0,1); schedule(); drawREOverlay(); };
    const up=()=>{ removeEventListener('pointermove',move); removeEventListener('pointerup',up);
      if(Math.hypot(ey.x-o.x,ey.y-o.y)>1e-4){ schedule(true); commit('Move red-eye'); } if(typeof drawOverlay==='function') drawOverlay(); };
    addEventListener('pointermove',move); addEventListener('pointerup',up);
    return;
  }
  if((S.redEyes||[]).length>=8){ toast('Maximum of 8 red-eye pins'); return; }
  const pin=detectRedEye(t[0],t[1]); S.redEyes.push(pin); selRE=S.redEyes.length-1;
  schedule(true); commit('Add red-eye'); syncREUI(); toast('Red-eye pin added (heuristic)',1000); if(typeof drawOverlay==='function') drawOverlay();
},true);

// Wrap drawOverlay to paint red-eye pins whenever present
{ const _d=window.drawOverlay||(typeof drawOverlay!=='undefined'?drawOverlay:null);
  if(typeof drawOverlay==='function'){
    const orig=drawOverlay;
    window.drawOverlay=function(){ orig.apply(this,arguments); try{ drawREOverlayPins(); }catch(_){} };
  }
}
function drawREOverlayPins(){
  if(!S||!(S.redEyes||[]).length||mode!=='develop') return;
  const ov=$('#ov'), glc=$('#gl'); if(!ov||!glc) return;
  const g=ov.getContext('2d'); const r=glc.getBoundingClientRect();
  g.save(); g.setTransform(dpr(),0,0,dpr(),-r.left*dpr(),-r.top*dpr());
  const [Wp]=photoDims();
  (S.redEyes||[]).forEach((e,i)=>{
    const p=srcToDisp([e.x,e.y]); const rad=e.r*Wp/srcPxPerDisp(p[0],p[1]);
    g.beginPath(); g.arc(p[0],p[1],Math.max(rad,6),0,7);
    g.strokeStyle=i===selRE?'#ff5555':'#ffaa66'; g.lineWidth=i===selRE?2.2:1.4; g.stroke();
    g.setLineDash([3,3]); g.beginPath(); g.arc(p[0],p[1],Math.max(rad*0.55,3),0,7); g.strokeStyle='#fff8'; g.stroke(); g.setLineDash([]);
  });
  g.restore();
}
syncers.push(()=>{ syncREUI(); });
const _od=window.onDevelopOpen; window.onDevelopOpen=p=>{ _od&&_od(p); selRE=-1; reTool=false; $('#reToolBtn')?.classList.remove('on'); syncREUI(); };

/* ===== Spot source nudge (arrow keys when Heal spot selected) ===== */
addEventListener('keydown',e=>{
  if(mode!=='develop'||tool!=='heal'||typeof selSpot==='undefined'||selSpot<0||!S||!S.spots) return;
  const t=e.target; if((t.tagName==='INPUT'&&t.type!=='range')||t.tagName==='SELECT'||t.tagName==='TEXTAREA') return;
  const k=e.key; if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(k)) return;
  // Only nudge source when Shift held (plain arrows still change photo)
  if(!e.shiftKey) return;
  e.preventDefault(); e.stopPropagation();
  const sp=S.spots[selSpot]; if(!sp) return;
  const step=e.altKey?0.0008:0.003;
  if(k==='ArrowLeft') sp.sx-=step; if(k==='ArrowRight') sp.sx+=step;
  if(k==='ArrowUp') sp.sy-=step; if(k==='ArrowDown') sp.sy+=step;
  sp.sx=clamp(sp.sx,0,1); sp.sy=clamp(sp.sy,0,1);
  schedule(true); if(typeof drawOverlay==='function') drawOverlay();
  clearTimeout(window.__nudgeT); window.__nudgeT=setTimeout(()=>commit('Nudge spot source'),350);
},true);

/* ===== Library Loupe (Space) ===== */
let loupeOn=false, loupeId=null;
const loupeEl=document.createElement('div'); loupeEl.id='libLoupe'; loupeEl.hidden=true;
loupeEl.innerHTML=`<div class="llInner"><img id="llImg" alt=""><div class="llMeta" id="llMeta"></div><div class="llHint">Space / Esc to close · ← → to browse · click background to close</div></div>`;
document.body.appendChild(loupeEl);
function showLoupe(id){
  const a=filtered(); const p=photos.find(x=>x.id===id)||a[0]; if(!p) return;
  loupeId=p.id; loupeOn=true; loupeEl.hidden=false;
  $('#llImg').src=thumbURL(p);
  const flag=p.flag===1?'Picked':p.flag===-1?'Rejected':'';
  $('#llMeta').innerHTML=`<b>${esc(p.name)}</b>${p.rating?` · ${'★'.repeat(p.rating)}`:''}${flag?` · ${flag}`:''}${p.raw?' · RAW':''}`;
  document.body.classList.add('lib-loupe');
}
function hideLoupe(){ loupeOn=false; loupeId=null; loupeEl.hidden=true; document.body.classList.remove('lib-loupe'); }
function stepLoupe(dir){
  const a=filtered(); if(!a.length) return; let i=a.findIndex(p=>p.id===loupeId); if(i<0) i=0;
  i=(i+dir+a.length)%a.length; showLoupe(a[i].id); sel=new Set([a[i].id]); lastSel=a[i].id; refreshSel();
}
loupeEl.addEventListener('click',e=>{ if(e.target===loupeEl||e.target.classList.contains('llInner')) hideLoupe(); });

/* ===== Slideshow ===== */
let showOn=false, showIdx=0, showTimer=null, showPaused=false, showFade=true, showKen=false;
const showEl=document.createElement('div'); showEl.id='slideshow'; showEl.hidden=true;
showEl.innerHTML=`<img id="ssImg" alt=""><div id="ssBar">
  <button class="btn" id="ssPrev" title="Previous">‹</button>
  <button class="btn" id="ssPlay" title="Play/Pause">❚❚</button>
  <button class="btn" id="ssNext" title="Next">›</button>
  <label class="ckrow"><input type="checkbox" id="ssFade" checked> Fade</label>
  <label class="ckrow"><input type="checkbox" id="ssKen"> Ken Burns</label>
  <span id="ssPos"></span>
  <button class="btn" id="ssClose">Esc</button>
</div>`;
document.body.appendChild(showEl);
function showList(){ return filtered().length?filtered():photos.slice(); }
function renderSlide(){
  const L=showList(); if(!L.length){ stopShow(); return; }
  showIdx=((showIdx%L.length)+L.length)%L.length;
  const p=L[showIdx]; const img=$('#ssImg');
  img.classList.remove('ss-in','ss-ken'); void img.offsetWidth;
  img.src=thumbURL(p);
  if(showFade) img.classList.add('ss-in');
  if(showKen) img.classList.add('ss-ken');
  $('#ssPos').textContent=`${showIdx+1} / ${L.length} · ${p.name}`;
  $('#ssPlay').textContent=showPaused?'▶':'❚❚';
}
function nextSlide(dir=1){ showIdx+=dir; renderSlide(); armShow(); }
function armShow(){
  clearTimeout(showTimer);
  if(!showOn||showPaused) return;
  showTimer=setTimeout(()=>nextSlide(1),3500);
}
function startShow(fromId){
  const L=showList(); if(!L.length) return toast('No photos to play');
  if(fromId){ const i=L.findIndex(p=>p.id===fromId); showIdx=i>=0?i:0; }
  else if(sel.size===1){ const i=L.findIndex(p=>sel.has(p.id)); showIdx=i>=0?i:0; }
  else showIdx=0;
  showOn=true; showPaused=false; showEl.hidden=false; document.body.classList.add('slideshow-on');
  hideLoupe(); renderSlide(); armShow(); toast('Slideshow — Esc to exit',1400);
}
function stopShow(){ showOn=false; clearTimeout(showTimer); showEl.hidden=true; document.body.classList.remove('slideshow-on'); }
$('#ssPrev').onclick=()=>nextSlide(-1);
$('#ssNext').onclick=()=>nextSlide(1);
$('#ssPlay').onclick=()=>{ showPaused=!showPaused; renderSlide(); armShow(); };
$('#ssClose').onclick=stopShow;
$('#ssFade').onchange=e=>{ showFade=e.target.checked; };
$('#ssKen').onchange=e=>{ showKen=e.target.checked; renderSlide(); };

{ const fb=$('.filterbar'); if(fb){
  const b=document.createElement('button'); b.className='btn'; b.id='slideBtn'; b.title='Slideshow (Ctrl+Enter)'; b.textContent='Slideshow';
  const after=$('#delSel')||$('#selAll'); if(after) after.after(b); else fb.appendChild(b);
  b.onclick=()=>startShow();
}}

/* ===== Filter chips (flag quick filters) ===== */
(function(){
  const fb=$('.filterbar'); if(!fb||$('#flagChips')) return;
  const wrap=document.createElement('span'); wrap.id='flagChips'; wrap.className='flagChips';
  wrap.innerHTML=`<button type="button" class="chip on" data-f="all">All</button>
    <button type="button" class="chip" data-f="pick" title="Picked (P)">✦ Pick</button>
    <button type="button" class="chip" data-f="reject" title="Rejected (X)">✕ Reject</button>
    <button type="button" class="chip" data-f="none">Unflagged</button>
    <button type="button" class="chip" data-f="rated" title="Any stars">★ Rated</button>`;
  const fr=$('#fFlag'); if(fr) fr.before(wrap); else fb.prepend(wrap);
  wrap.addEventListener('click',e=>{
    const c=e.target.closest('.chip'); if(!c) return;
    const f=c.dataset.f;
    $$('#flagChips .chip').forEach(x=>x.classList.toggle('on',x===c));
    if(f==='rated'){ $('#fFlag').value='all'; $('#fRating').value='1'; }
    else { $('#fFlag').value=f; if(f!=='all'){ /* keep rating */ } }
    $('#fFlag').dispatchEvent(new Event('change'));
    $('#fRating').dispatchEvent(new Event('change'));
    renderLibrary();
  });
  const syncChips=()=>{
    const fl=$('#fFlag')?.value||'all'; const rt=+$('#fRating')?.value||0;
    let act=fl; if(rt>=1&&fl==='all') act='rated';
    $$('#flagChips .chip').forEach(x=>x.classList.toggle('on',x.dataset.f===act));
  };
  $('#fFlag')?.addEventListener('change',syncChips);
  $('#fRating')?.addEventListener('change',syncChips);
})();

/* ===== Keyboard ===== */
addEventListener('keydown',e=>{
  const t=e.target; if((t.tagName==='INPUT'&&t.type!=='range')||t.tagName==='SELECT'||t.tagName==='TEXTAREA') return;
  if(!$('#modal').hidden) return;
  const mod=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();

  if(showOn){
    if(k==='escape'){ e.preventDefault(); stopShow(); return; }
    if(k===' ' || k==='spacebar' || e.code==='Space'){ e.preventDefault(); showPaused=!showPaused; renderSlide(); armShow(); return; }
    if(k==='arrowleft'){ e.preventDefault(); nextSlide(-1); return; }
    if(k==='arrowright'){ e.preventDefault(); nextSlide(1); return; }
    if(k==='p'){ e.preventDefault(); const L=showList(); if(L[showIdx]) setFlag([L[showIdx]],1); return; }
    if(k==='x'){ e.preventDefault(); const L=showList(); if(L[showIdx]) setFlag([L[showIdx]],-1); return; }
    if(k==='u'){ e.preventDefault(); const L=showList(); if(L[showIdx]) setFlag([L[showIdx]],0); return; }
    return;
  }
  if(loupeOn){
    if(k==='escape'||k===' '||e.code==='Space'){ e.preventDefault(); hideLoupe(); return; }
    if(k==='arrowleft'){ e.preventDefault(); stepLoupe(-1); return; }
    if(k==='arrowright'){ e.preventDefault(); stepLoupe(1); return; }
    if(k==='d'||k==='enter'){ e.preventDefault(); const id=loupeId; hideLoupe(); if(id) openDevelop(id); return; }
    return;
  }
  if(mod&&k==='enter'){ e.preventDefault(); startShow(); return; }
  if(mod) return;
  if(k==='e'&&mode==='develop'){ e.preventDefault(); setRedEyeTool(tool!=='redeye'); return; }
  if(e.code==='Space'&&mode==='library'){
    e.preventDefault();
    const id=sel.size?([...sel][sel.size-1]):(filtered()[0]&&filtered()[0].id);
    if(id) showLoupe(id); else toast('Select a photo first');
  }
  if(k==='escape'&&tool==='redeye'){ setRedEyeTool(false); }
});

/* ===== Help ===== */
{ const hb=$('#helpBtn'); if(hb){ const o=hb.onclick; hb.onclick=ev=>{ if(typeof o==='function') o.call(hb,ev);
  setTimeout(()=>{ const tbl=$('#dlg table'); if(!tbl||tbl.dataset.lr4) return; tbl.dataset.lr4='1';
    [['Space (Library)','Loupe — full preview'],['Ctrl+Enter','Slideshow'],['E','Red-eye tool'],['Shift+←↑↓→','Nudge heal source'],['Esc','Exit slideshow / loupe / tool']].forEach(([k,v])=>{
      const tr=document.createElement('tr'); tr.innerHTML=`<td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td>`; tbl.appendChild(tr); });
  },0); }; } }

window.__lr4={startShow,stopShow,showLoupe,hideLoupe,setRedEyeTool};
});
