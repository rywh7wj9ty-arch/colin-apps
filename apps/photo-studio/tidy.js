/* ===== Develop tool bar tidy (2026-10-17)
   The old row under the photo had grown to ~18 controls and scrolled sideways on iPhone.
   It is replaced by one calm bar: Before/After · Crop · Heal · Mask · More (+ Undo/Redo).
   Everything else lives in the More sheet (bottom sheet on iPhone, popover on desktop).
   The original buttons stay in the DOM (hidden), so every keyboard shortcut and every script
   that drives them keeps working; the new controls simply forward to them and mirror their state. ===== */
(function(){
const $id=id=>document.getElementById(id);
const mobQ=matchMedia('(max-width:820px)');
const svg=p=>'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
const I={
 ba:svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 3v18"/><path d="M12 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7z" fill="currentColor" stroke="none" opacity=".45"/>'),
 crop:svg('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>'),
 heal:svg('<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M10.5 10.5h.01M13.5 13.5h.01M13.5 10.5h.01M10.5 13.5h.01"/>'),
 mask:svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>'),
 more:svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'),
 undo:svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
 redo:svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
 prev:svg('<path d="M15 18l-6-6 6-6"/>'),
 next:svg('<path d="M9 18l6-6-6-6"/>'),
 orig:svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
 cmp:svg('<rect x="2.5" y="5" width="8" height="14" rx="1.5"/><rect x="13.5" y="5" width="8" height="14" rx="1.5"/>'),
 zoom:svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/><path d="M8 11h6M11 8v6"/>'),
 wb:svg('<path d="M14.5 4.5l5 5"/><path d="M17 2l5 5-3 3-5-5z"/><path d="M14 8l-9 9v3h3l9-9"/>'),
 clip:svg('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>'),
 tat:svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>'),
 ref:svg('<rect x="2.5" y="4" width="12" height="10" rx="1.5"/><rect x="9.5" y="10" width="12" height="10" rx="1.5"/>'),
 sync:svg('<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 21v-5h-5"/>'),
 fs:svg('<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>'),
 eye:svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3.2" fill="#e5484d" stroke="none"/>'),
 strip:svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M7.5 6v12M16.5 6v12"/>'),
};
// [real id, icon, label, where]  where: 'bar' always in bar, 'deskbar' bar on desktop / sheet on iPhone, 'sheet' always sheet
const BAR=[['prevBtn','prev','Previous','deskbar'],['baBtn','orig','Original','deskbar'],['baSplitBtn','ba','Before/After','bar'],
 ['cropBtn','crop','Crop','bar'],['healBtn','heal','Heal','bar'],['maskBtn','mask','Mask','bar'],['zoomBtn','zoom','Fit','deskbar']];
const SHEET=[['cmpBtn','cmp','Compare'],['wbBtn','wb','White balance'],['clipBtn','clip','Clipping'],['tatBtn','tat','Target adjust'],
 ['__redeye','eye','Red eye'],['refBtn','ref','Reference'],['autoSyncBtn','sync','Auto Sync'],['fsBtn','fs','Full screen']];
const api=window.__tidy={ready:false};
let bar,sheet,back,moreB,built=false;

function mkBtn(id,ico,lab,cls){ const b=document.createElement('button'); b.type='button'; b.className='dtB '+(cls||''); b.dataset.for=id;
  b.innerHTML=I[ico]+'<span class="dtL">'+lab+'</span>'; b.setAttribute('aria-label',lab); return b; }
function real(id){ return $id(id); }
function fire(id){
  if(id==='__redeye'){ const d=[...document.querySelectorAll('#panel details, #lpanel details')].find(x=>/^Red-eye/.test(((x.querySelector('summary')||x).textContent||'').replace('↺','').trim()));
    if(d){ d.open=true; d.scrollIntoView({block:'start',behavior:'smooth'}); } return; }
  const r=real(id); if(r&&!r.disabled) r.click(); }
// Original keeps "tap to toggle, hold to peek" by forwarding the pointer sequence to the real button
function forwardHold(b,id){ ['pointerdown','pointerup','pointercancel','pointerleave'].forEach(t=>b.addEventListener(t,e=>{ const r=real(id); if(!r) return;
  try{ r.dispatchEvent(new PointerEvent(t,{bubbles:false,pointerId:e.pointerId,pointerType:e.pointerType})); }catch(_){ r.dispatchEvent(new Event(t)); } })); }

function build(){
  const vt=document.querySelector('.vtools'); if(!vt||built) return false; built=true;
  document.body.classList.add('dtOn');
  // lr10's overflow logic re-inserts tools at comment anchors; drop the anchors so nothing gets pulled back
  [...vt.childNodes].filter(n=>n.nodeType===8&&/^vt:/.test(n.data)).forEach(n=>n.remove());
  if(window.__lr10&&__lr10.setOpen) try{ __lr10.setOpen(false); }catch(e){}

  bar=document.createElement('div'); bar.id='dtBar'; bar.setAttribute('role','toolbar'); bar.setAttribute('aria-label','Develop tools');
  const main=document.createElement('div'); main.className='dtMain';
  BAR.forEach(([id,ico,lab,w])=>{ const b=mkBtn(id,ico,lab,w==='deskbar'?'deskOnly':''); if(id==='prevBtn') b.classList.add('dtNav','dtIcon');
    if(id==='baBtn') forwardHold(b,id); b.addEventListener('click',()=>{ fire(id); sync(); }); main.appendChild(b); });
  moreB=mkBtn('','more','More','dtMore'); moreB.id='dtMoreBtn'; moreB.setAttribute('aria-haspopup','dialog'); moreB.setAttribute('aria-expanded','false'); moreB.setAttribute('aria-controls','dtSheet');
  moreB.title='More tools'; moreB.addEventListener('click',e=>{ e.stopPropagation(); open(sheet.hidden); }); main.appendChild(moreB);
  const ur=document.createElement('div'); ur.className='dtUR';
  [['undoBtn','undo','Undo'],['redoBtn','redo','Redo'],['nextBtn','next','Next']].forEach(([id,ico,lab])=>{ const b=mkBtn(id,ico,lab,'dtIcon'+(id==='nextBtn'?' deskOnly dtNav':''));
    b.addEventListener('click',()=>{ fire(id); setTimeout(sync,0); }); ur.appendChild(b); });
  bar.append(main,ur);
  vt.after(bar);

  // More sheet
  back=document.createElement('div'); back.id='dtBack'; back.hidden=true;
  sheet=document.createElement('div'); sheet.id='dtSheet'; sheet.hidden=true; sheet.setAttribute('role','dialog'); sheet.setAttribute('aria-label','More tools');
  sheet.innerHTML='<div class="dtGrab" aria-hidden="true"></div><div class="dtHead"><span>More tools</span><button type="button" class="dtX" aria-label="Close">'+svg('<path d="M6 6l12 12M18 6L6 18"/>')+'</button></div><div class="dtGrid"></div><div class="dtRow dtRate"><span class="dtRL">Rating</span></div><div class="dtRow dtProof"><span class="dtRL">Soft proof</span></div>';
  const grid=sheet.querySelector('.dtGrid');
  // iPhone-only tiles for the things that sit in the bar on desktop
  [['baBtn','orig','Original'],['zoomBtn','zoom','Fit'],['prevBtn','prev','Previous'],['nextBtn','next','Next']].forEach(([id,ico,lab])=>{ const t=mkBtn(id,ico,lab,'dtTile mobOnly');
    t.addEventListener('click',()=>{ fire(id); sync(); if(id!=='prevBtn'&&id!=='nextBtn') open(false); }); grid.appendChild(t); });
  SHEET.forEach(([id,ico,lab])=>{ const t=mkBtn(id,ico,lab,'dtTile'); t.addEventListener('click',()=>{ fire(id); sync(); open(false); }); grid.appendChild(t); });
  sheet.querySelector('.dtX').onclick=()=>open(false);
  back.addEventListener('pointerdown',e=>{ e.preventDefault(); open(false); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!sheet.hidden){ e.stopPropagation(); open(false); moreB.focus({preventScroll:true}); } },true);
  document.addEventListener('pointerdown',e=>{ if(!sheet.hidden&&!sheet.contains(e.target)&&!moreB.contains(e.target)&&e.target!==back) open(false); },true);
  document.body.append(back,sheet);
  adopt();
  // close when leaving Develop
  const dev=$id('develop'); if(dev) new MutationObserver(()=>{ if(!dev.classList.contains('on')) open(false); }).observe(dev,{attributes:true,attributeFilter:['class']});
  addEventListener('resize',()=>{ if(!sheet.hidden) place(); });
  if(window.MutationObserver) new MutationObserver(()=>schedSync()).observe(vt,{subtree:true,attributes:true,attributeFilter:['class','disabled','hidden'],childList:true,characterData:true});
  const fsw=$id('fsToggle'); if(fsw) new MutationObserver(()=>schedSync()).observe(fsw,{attributes:true,attributeFilter:['class']});
  const over=()=>bar.scrollWidth>bar.clientWidth+1;
  const fit=()=>{ bar.classList.remove('dtCompact','dtTight'); if(mobQ.matches) return; if(over()) bar.classList.add('dtTight'); if(over()) bar.classList.add('dtCompact'); };
  if(window.ResizeObserver) new ResizeObserver(fit).observe(bar); addEventListener('resize',fit); api.fit=fit;
  setInterval(sync,700); sync(); fit();
  return true;
}
// rating stars + soft-proof select are real form controls with their own handlers: move them into the sheet
function adopt(){
  const rate=sheet.querySelector('.dtRate'), proof=sheet.querySelector('.dtProof');
  const st=$id('devStars'); if(st&&st.parentNode!==rate) rate.appendChild(st);
  const ps=$id('proofSel'), pw=$id('proofWarnL');
  if(ps&&ps.parentNode!==proof){ proof.appendChild(ps); ps.addEventListener('change',()=>setTimeout(()=>ps.style.removeProperty('width'),0)); }
  if(pw&&pw.parentNode!==proof) proof.appendChild(pw);
  if(ps) ps.style.removeProperty('width');
  rate.hidden=!st; proof.hidden=!ps;
}
let sr=0; function schedSync(){ if(sr) return; sr=requestAnimationFrame(()=>{ sr=0; sync(); }); }
function sync(){
  if(!bar) return;
  document.querySelectorAll('#dtBar .dtB[data-for], #dtSheet .dtB[data-for]').forEach(b=>{ const id=b.dataset.for; if(!id) return;
    if(id==='__redeye'){ b.hidden=false; return; }
    const r=real(id); if(!r){ b.hidden=true; return; } if(b.hidden) b.hidden=false;
    b.classList.toggle('on',r.classList.contains('on')); b.disabled=!!r.disabled;
    b.setAttribute('aria-pressed',r.classList.contains('on')?'true':'false');
    if(r.title&&b.title!==r.title) b.title=r.title;
    if(id==='zoomBtn'){ const t=(r.textContent||'').trim()||'Fit'; const l=b.querySelector('.dtL'); if(l.textContent!==t) l.textContent=t; b.setAttribute('aria-label','Zoom: '+t); }
    if(id==='fsToggle'){ const l=b.querySelector('.dtL'); const t=r.classList.contains('on')?'Show filmstrip':'Hide filmstrip'; if(l.textContent!==t) l.textContent=t; }
  });
  // a dot on More when something inside it is switched on
  const ps=$id('proofSel');
  const act=[...sheet.querySelectorAll('.dtTile.on:not(.mobOnly)')].length>0||(mobQ.matches&&!!sheet.querySelector('.dtTile.mobOnly.on'))||!!(ps&&ps.value);
  moreB.classList.toggle('dot',act);
  if(ps&&ps.style.width) ps.style.removeProperty('width');
  adopt();
}
function place(){
  if(mobQ.matches){ sheet.style.left=sheet.style.bottom=sheet.style.maxHeight=''; return; }
  const r=moreB.getBoundingClientRect(), w=sheet.offsetWidth;
  sheet.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px';
  sheet.style.bottom=Math.max(8,innerHeight-r.top+8)+'px';
  sheet.style.maxHeight=Math.max(160,r.top-16)+'px';
}
function open(on){
  if(!sheet) return; on=!!on;
  sheet.hidden=!on; back.hidden=!on||!mobQ.matches; moreB.classList.toggle('on',on); moreB.setAttribute('aria-expanded',on?'true':'false');
  if(on){ adopt(); sync(); place(); requestAnimationFrame(()=>sheet.classList.add('in')); const f=sheet.querySelector('.dtTile:not([hidden])'); if(f&&!mobQ.matches) f.focus({preventScroll:true}); }
  else sheet.classList.remove('in');
}
function init(){ try{ if(build()){ api.open=open; api.sync=sync; api.ready=true; setTimeout(sync,400); setTimeout(()=>{ adopt(); sync(); },1500); } }catch(e){ console.warn('tidy',e); } }
if(document.readyState==='complete') setTimeout(init,450); else addEventListener('load',()=>setTimeout(init,450));
})();
