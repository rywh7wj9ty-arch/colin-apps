/* ===== Round 12pm (2026-10-16): Find Enter flush (via lr8/lr11), clearer iPhone tool-row
   scroll affordance (› edge + one-shot bounce), filmstrip collapse, jump-to-edited,
   focus rings, toast/busy safe-area, Compare/Original clarity, close ⋯ on leave Develop ===== */
(function(){
const $id=id=>document.getElementById(id);
const touch=(typeof isTouch!=='undefined'&&isTouch)||matchMedia('(pointer:coarse)').matches;
const LSg=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } };
const LSs=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
const api=window.__lr12={ready:false};

/* ---------- 1. iPhone tool-row: right-edge › + fade; one-shot bounce hint ---------- */
function scrollAffordance(){
  const vt=document.querySelector('.vtools'); if(!vt||vt.__lr12fade) return;
  vt.__lr12fade=true;
  let tip=vt.querySelector('.vtScrollTip');
  if(!tip){
    tip=document.createElement('div'); tip.className='vtScrollTip'; tip.setAttribute('aria-hidden','true');
    tip.innerHTML='<span class="vtScrollChevron">›</span>';
    vt.appendChild(tip);
  }
  const upd=()=>{
    const narrow=matchMedia('(max-width:820px)').matches;
    const overflow=vt.scrollWidth-vt.clientWidth>4;
    const atEnd=vt.scrollLeft+vt.clientWidth>=vt.scrollWidth-3;
    const show=narrow&&overflow&&!atEnd;
    tip.classList.toggle('on',show);
    // keep lr11 classes in sync if present
    if(window.__lr11&&typeof __lr11.scrollFade==='function') __lr11.scrollFade();
  };
  vt.addEventListener('scroll',upd,{passive:true});
  addEventListener('resize',upd);
  if(window.ResizeObserver) new ResizeObserver(upd).observe(vt);
  setTimeout(upd,250); setTimeout(upd,900);
  api.scrollTip=upd;

  // one-shot subtle bounce the first time the row can scroll
  const maybeBounce=()=>{
    if(!matchMedia('(max-width:820px)').matches) return;
    if(LSg('ps.vtScrollHint','0')==='1') return;
    if(vt.scrollWidth-vt.clientWidth<=4) return;
    LSs('ps.vtScrollHint','1');
    vt.classList.add('vtBounceHint');
    // nudge scroll a little then back
    const x0=vt.scrollLeft;
    vt.scrollTo({left:Math.min(x0+28,vt.scrollWidth),behavior:'smooth'});
    setTimeout(()=>{ vt.scrollTo({left:x0,behavior:'smooth'}); },320);
    setTimeout(()=>vt.classList.remove('vtBounceHint'),700);
    api.bounced=true;
  };
  setTimeout(maybeBounce,1100);
  api.maybeBounce=maybeBounce;
}

/* ---------- 2. Filmstrip collapse → more photo space (toggle lives on the strip, not in the tool row) ---------- */
function filmstripToggle(){
  const fs=$id('filmstrip'), viewer=$id('viewer'); if(!fs||$id('fsToggle')) return;
  // wrap filmstrip so the toggle can sit on its edge without joining .vtools overflow math
  let wrap=fs.parentNode;
  if(!fs.parentNode.classList.contains('fsWrap')){
    wrap=document.createElement('div'); wrap.className='fsWrap'; wrap.id='fsWrap';
    fs.before(wrap); wrap.appendChild(fs);
  }
  const b=document.createElement('button');
  b.type='button'; b.id='fsToggle'; b.className='btn icon fsToggle';
  b.title='Hide filmstrip'; b.setAttribute('aria-label','Hide filmstrip'); b.setAttribute('aria-pressed','false');
  b.textContent='▾';
  wrap.appendChild(b);
  // when collapsed, keep a slim show-bar with the toggle
  let bar=$id('fsShowBar');
  let apply=on=>{
    document.body.classList.toggle('fsCollapsed',on);
    b.setAttribute('aria-pressed',on?'true':'false');
    b.title=on?'Show filmstrip':'Hide filmstrip';
    b.setAttribute('aria-label',b.title);
    b.textContent=on?'▴':'▾';
    b.classList.toggle('on',on);
    bar.hidden=!on;
    LSs('ps.fsCollapsed',on?'1':'0');
  };
  if(!bar){
    bar=document.createElement('div'); bar.id='fsShowBar'; bar.className='fsShowBar'; bar.hidden=true;
    const b2=document.createElement('button'); b2.type='button'; b2.className='btn fsShowBtn'; b2.id='fsShowBtn';
    b2.textContent='▴ Filmstrip'; b2.title='Show filmstrip'; b2.setAttribute('aria-label','Show filmstrip');
    bar.appendChild(b2); wrap.after(bar);
    b2.onclick=()=>apply(false);
  }
  b.onclick=()=>apply(!document.body.classList.contains('fsCollapsed'));
  apply(LSg('ps.fsCollapsed','0')==='1');
  api.fsToggle=apply;
}

/* ---------- 3. Jump to edited: ✎ Edited chip scrolls / cycles edited sections ---------- */
function jumpEdited(){
  const ed=$id('pfEd'); if(!ed||ed.__lr12) return;
  ed.__lr12=true;
  let idx=-1;
  const editedSecs=()=>[...document.querySelectorAll('#sections details.sec.edited')].filter(d=>d.offsetParent!==null||!d.classList.contains('pfHide'));
  // augment click: after toggle filter, if turning ON (or already filtering edited), scroll to next edited
  const prev=ed.onclick;
  ed.addEventListener('click',()=>{
    // run after lr8 toggles edOnly
    setTimeout(()=>{
      if(window.__lr8&&typeof __lr8.markEdited==='function') __lr8.markEdited();
      const list=editedSecs();
      if(!list.length){ idx=-1; return; }
      // if filter is on (button has .on), cycle; if off, still jump once to first
      const cycling=ed.classList.contains('on');
      if(cycling) idx=(idx+1)%list.length; else idx=0;
      const d=list[idx];
      d.open=true;
      d.scrollIntoView({block:'center',behavior:'smooth'});
      d.classList.add('pfFlash'); setTimeout(()=>d.classList.remove('pfFlash'),650);
      api.editJump={i:idx,n:list.length};
    },40);
  },true);
  api.jumpEdited={get idx(){return idx;}};
}

/* ---------- 4. Compare / Original label clarity ---------- */
function labelClarity(){
  const ba=$id('baBtn');
  if(ba&&!ba.__lr12lab){
    ba.__lr12lab=true;
    const sync=()=>{
      const on=ba.classList.contains('on');
      // keep short label; clarify via title + aria
      const t=on
        ?'Showing Original (before edits) — tap to return to After (\\)'
        :'Original: tap to toggle Before/After, hold to peek (\\)';
      if(ba.title!==t) ba.title=t;
      ba.setAttribute('aria-pressed',on?'true':'false');
      ba.setAttribute('aria-label',on?'Showing Original — tap for After':'Original (Before/After)');
      // badge on stage already says Before; make it say Original when using baBtn
      const lab=$id('baLabel'); if(lab&&!lab.hidden) lab.textContent='Original';
    };
    new MutationObserver(sync).observe(ba,{attributes:true,attributeFilter:['class']});
    const lab=$id('baLabel'); if(lab) new MutationObserver(sync).observe(lab,{attributes:true,attributeFilter:['hidden']});
    setTimeout(sync,200);
    api.baSync=sync;
  }
  const cmp=$id('cmpBtn');
  if(cmp&&!cmp.__lr12lab){
    cmp.__lr12lab=true;
    const sync=()=>{
      const txt=cmp.textContent.trim();
      const on=cmp.classList.contains('on');
      let tip='Compare: cycle Split → Side by side → Off (Y)';
      if(txt==='Split') tip='Split view (Before | After) — tap again for Side by side (Y)';
      else if(/Side/i.test(txt)) tip='Side by side (Before · After) — tap again to turn off (Y)';
      if(cmp.title!==tip) cmp.title=tip;
      cmp.setAttribute('aria-pressed',on?'true':'false');
    };
    new MutationObserver(sync).observe(cmp,{attributes:true,attributeFilter:['class'],childList:true,characterData:true,subtree:true});
    setTimeout(sync,200);
  }
}

/* ---------- 5. Leave Develop: close vtMore + collapse quick More ---------- */
function closeOnLeave(){
  const sm=window.setMode; if(typeof sm!=='function'||sm.__lr12) return;
  const w=function(m){
    const r=sm.apply(this,arguments);
    if(m!=='develop'){
      try{ if(window.__lr10&&typeof __lr10.setOpen==='function') __lr10.setOpen(false); }catch(e){}
      const qm=$id('quickMore'), qb=$id('quickMoreBtn');
      if(qm&&!qm.hidden){ qm.hidden=true; if(qb){ qb.classList.remove('on'); qb.setAttribute('aria-expanded','false'); } }
    }
    return r;
  };
  w.__lr12=true; // preserve prior wrappers' flags
  if(sm.__lr10) w.__lr10=true;
  window.setMode=w; try{ setMode=w; }catch(e){}
  api.closeOnLeave=true;
}

/* ---------- 6. Soft enter-flush self-check API (harness) ---------- */
function finderFlushApi(){
  api.flushEnter=()=>{
    const q=$id('pfQ'); if(!q) return null;
    if(window.__lr8&&typeof __lr8.flushFilter==='function') return __lr8.flushFilter();
    if(window.__lr8&&typeof __lr8.applyFilter==='function') return __lr8.applyFilter();
    return null;
  };
  api.hasFlush=!!(window.__lr8&&(typeof __lr8.flushFilter==='function'||typeof __lr8.applyFilter==='function'));
}

function init(){
  try{ scrollAffordance(); }catch(e){ console.warn('lr12 scroll',e); }
  try{ filmstripToggle(); }catch(e){ console.warn('lr12 film',e); }
  try{ labelClarity(); }catch(e){ console.warn('lr12 labels',e); }
  try{ closeOnLeave(); }catch(e){ console.warn('lr12 leave',e); }
  finderFlushApi();
  // finder / Edited chip built by lr8 — retry
  let n=0; const tryJ=()=>{ try{ jumpEdited(); }catch(e){ console.warn('lr12 jump',e); }
    if(!$id('pfEd')?.__lr12&&n++<30) setTimeout(tryJ,80); };
  tryJ();
  // re-hook setMode after lr10 (lr10 may wrap later? lr10 inits at 0, we at 200 — should be after)
  setTimeout(()=>{ try{ closeOnLeave(); }catch(e){} },400);
  api.ready=true;
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,200)); else setTimeout(init,200);
})();
