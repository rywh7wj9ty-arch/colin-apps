/* ===== Round 13 / 1pm (2026-10-16): soft filmstrip collapse, stronger › tip,
   jump-edited empty toast, collapse peek hint, clearer zoom %, last-opened ring,
   adjacent thumb decode, Esc clears Find when focus is elsewhere ===== */
(function(){
const $id=id=>document.getElementById(id);
const touch=(typeof isTouch!=='undefined'&&isTouch)||matchMedia('(pointer:coarse)').matches;
const LSg=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } };
const LSs=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
const api=window.__lr13={ready:false};

/* ---------- 1. Soft filmstrip collapse (CSS-driven) + one-shot peek/nav hint ---------- */
function filmstripSoft(){
  // mark wrap for CSS transitions (round-13 styles override display:none)
  const wrap=$id('fsWrap'); if(wrap) wrap.classList.add('fsAnim');
  // wrap lr12.fsToggle to flash a one-shot hint after collapse
  const hook=()=>{
    if(!window.__lr12||typeof __lr12.fsToggle!=='function'||__lr12.fsToggle.__lr13) return false;
    const prev=__lr12.fsToggle;
    const w=function(on){
      const was=document.body.classList.contains('fsCollapsed');
      const r=prev.apply(this,arguments);
      const now=document.body.classList.contains('fsCollapsed');
      if(on===true||(!was&&now)){
        // ensure ‹ › still work (they live in .vtools — no-op assert path)
        api.navOk=!!($id('prevBtn')&&$id('nextBtn'));
        if(LSg('ps.fsPeekHint','0')!=='1'){
          LSs('ps.fsPeekHint','1');
          const bar=$id('fsShowBar');
          if(bar){ bar.classList.add('fsPeekFlash'); setTimeout(()=>bar.classList.remove('fsPeekFlash'),900); }
          if(typeof toast==='function') toast('‹ › change photos · ▴ restores filmstrip',2200);
          api.peekHint=true;
        }
      }
      return r;
    };
    w.__lr13=true; __lr12.fsToggle=w; api.fsSoft=true;
    return true;
  };
  if(!hook()){ let n=0; const t=()=>{ if(!hook()&&n++<40) setTimeout(t,50); }; setTimeout(t,50); }
}

/* ---------- 2. Stronger › tip contrast (dark pill; pointer-events stay none) ---------- */
function tipContrast(){
  const tip=document.querySelector('.vtScrollTip'); if(!tip) return;
  tip.classList.add('vtTipStrong');
  const ch=tip.querySelector('.vtScrollChevron'); if(ch) ch.classList.add('vtPill');
  api.tipStrong=true;
}

/* ---------- 3. Jump-to-edited: toast when nothing is marked edited ---------- */
function jumpEmptyToast(){
  const ed=$id('pfEd'); if(!ed||ed.__lr13) return;
  ed.__lr13=true;
  ed.addEventListener('click',()=>{
    setTimeout(()=>{
      if(api._skipJumpToast){ api._skipJumpToast=false; return; }
      try{ if(window.__lr8&&typeof __lr8.markEdited==='function') __lr8.markEdited(); }catch(e){}
      const list=[...document.querySelectorAll('#sections details.sec.edited')]
        .filter(d=>d.offsetParent!==null||!d.classList.contains('pfHide'));
      if(!list.length){
        if(typeof toast==='function') toast('No edited sections yet',1600);
        api.jumpEmpty=true;
      } else {
        api.jumpEmpty=false;
      }
    },55);
  });
  api.jumpToast=true;
}

/* ---------- 4. Clearer zoom % (esp. iPhone) + tap zoomInfo to fit ---------- */
function zoomClarity(){
  const zi=$id('zoomInfo'); if(!zi||zi.__lr13) return;
  zi.__lr13=true;
  const sync=()=>{
    try{
      const z=(typeof zoom!=='undefined')?zoom:null;
      const zb=$id('zoomBtn');
      if(z){
        const pct=Math.round(z*100)+'%';
        // keep status lines from app.js when present; otherwise show zoom %
        const cur=zi.textContent||'';
        if(!cur||/^\d+%$/.test(cur)||cur==='Fit') zi.textContent=pct;
        zi.classList.add('zoomOn');
        zi.setAttribute('title','Zoom '+pct+' — tap to fit');
        if(zb&&!/Fit/i.test(zb.textContent)&&!/%/.test(zb.textContent)) zb.textContent=pct;
      } else {
        zi.classList.remove('zoomOn');
        if(/^\d+%$/.test(zi.textContent||'')) zi.textContent='';
      }
    }catch(e){}
  };
  // observe zoomBtn text (setZoom updates it) + stage class
  const zb=$id('zoomBtn'), st=$id('stage');
  if(zb) new MutationObserver(sync).observe(zb,{characterData:true,childList:true,subtree:true,attributes:true});
  if(st) new MutationObserver(sync).observe(st,{attributes:true,attributeFilter:['class']});
  // coarse: allow tap on zoomInfo to fit (double-tap still on photo)
  if(touch||matchMedia('(max-width:820px)').matches){
    zi.style.pointerEvents='auto';
    zi.addEventListener('click',e=>{
      e.preventDefault(); e.stopPropagation();
      if(typeof zoom!=='undefined'&&zoom&&typeof setZoom==='function') setZoom(null);
      else if(typeof toggleZoom==='function') toggleZoom();
    });
  }
  setTimeout(sync,300);
  api.zoomSync=sync;
}

/* ---------- 5. Library: subtle last-opened ring (local only) ---------- */
function lastOpenedRing(){
  const mark=(id)=>{
    if(!id) return;
    LSs('ps.lastOpened',String(id));
    const grid=$id('grid'); if(!grid) return;
    grid.querySelectorAll('.cell.lastOpened').forEach(c=>c.classList.remove('lastOpened'));
    const cell=grid.querySelector(`.cell[data-id="${CSS.escape?CSS.escape(id):id}"]`);
    if(cell) cell.classList.add('lastOpened');
  };
  api.markLastOpened=mark;
  // when leaving Develop → Library, ring the photo we were on
  const sm=window.setMode;
  if(typeof sm==='function'&&!sm.__lr13lo){
    const w=function(m){
      const prevMode=(typeof mode!=='undefined')?mode:null;
      const id=(typeof cur!=='undefined')?cur:null;
      const r=sm.apply(this,arguments);
      if(m==='library'&&prevMode==='develop'&&id) setTimeout(()=>mark(id),30);
      return r;
    };
    w.__lr13lo=true;
    if(sm.__lr12) w.__lr12=true;
    if(sm.__lr10) w.__lr10=true;
    window.setMode=w; try{ setMode=w; }catch(e){}
  }
  // re-apply after grid re-renders
  const grid=$id('grid');
  if(grid&&!grid.__lr13lo){
    grid.__lr13lo=true;
    const apply=()=>{ const id=LSg('ps.lastOpened',''); if(id) mark(id); };
    new MutationObserver(()=>requestAnimationFrame(apply)).observe(grid,{childList:true});
    setTimeout(apply,400);
  }
  api.lastOpened=true;
}

/* ---------- 6. Prefetch / decode adjacent filmstrip thumbs (cheap snappiness) ---------- */
function prefetchAdj(){
  const run=()=>{
    try{
      if(typeof mode==='undefined'||mode!=='develop') return;
      if(typeof filtered!=='function'||typeof cur==='undefined') return;
      const a=filtered(); if(!a||!a.length) return;
      const i=a.findIndex(p=>p.id===cur); if(i<0) return;
      [i-1,i+1].forEach(j=>{
        if(j<0||j>=a.length) return;
        const p=a[j]; if(!p||!p.thumb) return;
        const u=(typeof thumbURL==='function')?thumbURL(p):null;
        if(!u) return;
        const im=new Image(); im.decoding='async'; im.src=u;
        if(im.decode) im.decode().catch(()=>{});
      });
      api.prefetched=true;
    }catch(e){}
  };
  // after filmstrip updates
  const fs=$id('filmstrip');
  if(fs&&!fs.__lr13pf){
    fs.__lr13pf=true;
    new MutationObserver(()=>setTimeout(run,40)).observe(fs,{childList:true});
  }
  // after next/prev
  ['prevBtn','nextBtn'].forEach(id=>{
    const b=$id(id); if(!b||b.__lr13pf) return;
    b.__lr13pf=true;
    b.addEventListener('click',()=>setTimeout(run,80),{passive:true});
  });
  setTimeout(run,600);
  api.prefetch=run;
}

/* ---------- 7. Esc clears Find / edited filter when focus is not already in pfQ ---------- */
function escFind(){
  if(document.__lr13esc) return;
  document.__lr13esc=true;
  const onEsc=e=>{
    const k=e.key||e.code; if(k!=='Escape'&&k!=='Esc') return;
    if(typeof mode!=='undefined'&&mode!=='develop') return;
    if(typeof cropOn!=='undefined'&&cropOn) return;
    const modal=$id('modal'); if(modal&&!modal.hidden) return;
    const q=$id('pfQ'); if(!q) return;
    // if focus is in pfQ, lr8 already clears the query — still clear Edited filter if on
    const inQ=document.activeElement===q;
    const ed=$id('pfEd');
    const hasQ=!!(q.value&&q.value.trim());
    const edOn=ed&&ed.classList.contains('on');
    if(!hasQ&&!edOn) return;
    if(hasQ&&!inQ){ q.value=''; if(window.__lr8&&typeof __lr8.flushFilter==='function') __lr8.flushFilter();
      else if(window.__lr8&&typeof __lr8.applyFilter==='function') __lr8.applyFilter(); }
    if(edOn){
      try{ api._skipJumpToast=true; ed.click(); }catch(err){ api._skipJumpToast=false; }
    }
    api.escCleared=true;
  };
  addEventListener('keydown',onEsc,true);
  api.escFind=true;
}

/* ---------- 8. Compare badge: ensure Original stays clear when peeking ---------- */
function compareBadge(){
  const lab=$id('baLabel'); if(!lab||lab.__lr13) return;
  lab.__lr13=true;
  const sync=()=>{
    if(lab.hidden) return;
    if(lab.textContent!=='Original') lab.textContent='Original';
    lab.classList.add('baOrig');
  };
  // only watch hidden — never childList/characterData (setting text would re-fire forever)
  new MutationObserver(sync).observe(lab,{attributes:true,attributeFilter:['hidden']});
  setTimeout(sync,200);
  api.baBadge=true;
}

function init(){
  try{ filmstripSoft(); }catch(e){ console.warn('lr13 film',e); }
  try{ tipContrast(); }catch(e){ console.warn('lr13 tip',e); }
  try{ zoomClarity(); }catch(e){ console.warn('lr13 zoom',e); }
  try{ lastOpenedRing(); }catch(e){ console.warn('lr13 last',e); }
  try{ prefetchAdj(); }catch(e){ console.warn('lr13 prefetch',e); }
  try{ escFind(); }catch(e){ console.warn('lr13 esc',e); }
  try{ compareBadge(); }catch(e){ console.warn('lr13 badge',e); }
  // finder / tip built async
  let n=0; const retry=()=>{
    try{ jumpEmptyToast(); tipContrast(); filmstripSoft(); }catch(e){}
    if((!$id('pfEd')||!$id('pfEd').__lr13||!document.querySelector('.vtScrollTip'))&&n++<40) setTimeout(retry,80);
  };
  retry();
  api.ready=true;
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,240)); else setTimeout(init,240);
})();
