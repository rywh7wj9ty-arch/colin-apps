/* ===== Round 14 / 2pm (2026-10-16): harden filmstrip collapse + 44px ▴ bar,
   panel & Library scroll memory, double-tap thumb → Fit, toast coalesce,
   Esc closes Compare, safer More/overlay cleanup ===== */
(function(){
const $id=id=>document.getElementById(id);
const touch=(typeof isTouch!=='undefined'&&isTouch)||matchMedia('(pointer:coarse)').matches;
const LSg=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } };
const LSs=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
const api=window.__lr14={ready:false};

/* ---------- 1. Harden soft filmstrip collapse (measure real height) + 44px ▴ bar ---------- */
function filmstripHarden(){
  const wrap=$id('fsWrap'), fs=$id('filmstrip');
  if(wrap){
    wrap.classList.add('fsAnim','fsHard');
    const measure=()=>{
      if(document.body.classList.contains('fsCollapsed')) return;
      // temporarily clear max-height so we measure natural height
      const prev=wrap.style.maxHeight;
      wrap.style.maxHeight='none';
      const h=Math.ceil(wrap.getBoundingClientRect().height)||(touch?96:86);
      wrap.style.maxHeight=prev||'';
      const px=Math.max(h+4, touch?100:90)+'px';
      wrap.style.setProperty('--fsH',px);
      // also set inline max-height for non-collapsed so CSS var is used
      if(!document.body.classList.contains('fsCollapsed')){
        // CSS uses var(--fsH, 120px); keep measured value on the wrap
      }
      api.fsH=px;
    };
    if(window.ResizeObserver) new ResizeObserver(()=>requestAnimationFrame(measure)).observe(fs||wrap);
    setTimeout(measure,300); setTimeout(measure,900);
    api.measureFs=measure;
  }
  // bump ▴ Filmstrip hit target + safe-area
  const bar=$id('fsShowBar'), btn=$id('fsShowBtn');
  if(bar) bar.classList.add('fsBarPad');
  if(btn){ btn.classList.add('fsHit'); btn.style.minHeight=''; /* CSS owns it */ }
  api.fsHard=true;
}

/* ---------- 2. Double-tap current filmstrip thumb → Fit / reset view ---------- */
function filmstripDblFit(){
  const fs=$id('filmstrip'); if(!fs||fs.__lr14dbl) return;
  fs.__lr14dbl=true;
  let lastT=0, lastId=null;
  fs.addEventListener('click',e=>{
    const img=e.target.closest('img'); if(!img) return;
    const id=img.dataset.id;
    const now=Date.now();
    // double-tap detection (same thumb within 320ms)
    if(id&&id===lastId&&now-lastT<320){
      lastT=0; lastId=null;
      // if already current, reset view; otherwise openDevelop already ran on first tap
      if(typeof cur!=='undefined'&&id===cur){
        e.preventDefault(); e.stopPropagation();
        try{
          if(typeof zoom!=='undefined'&&zoom&&typeof setZoom==='function') setZoom(null);
          else if(typeof toggleZoom==='function'&&zoom) toggleZoom();
          if(typeof toast==='function') toast('Fit',900);
          api.dblFit=true;
        }catch(err){}
      }
      return;
    }
    lastT=now; lastId=id;
  },true);
  // also native dblclick for desktop precision
  fs.addEventListener('dblclick',e=>{
    const img=e.target.closest('img'); if(!img) return;
    e.preventDefault(); e.stopPropagation();
    const id=img.dataset.id;
    if(typeof cur!=='undefined'&&id===cur){
      try{
        if(typeof zoom!=='undefined'&&zoom&&typeof setZoom==='function') setZoom(null);
        else if(typeof toggleZoom==='function'&&zoom) toggleZoom();
        if(typeof toast==='function') toast('Fit',900);
        api.dblFit=true;
      }catch(err){}
    } else if(id&&typeof openDevelop==='function'){
      openDevelop(id);
    }
  });
  api.dblFitHook=true;
}

/* ---------- 3. Remember Develop panel scroll across photo switches ---------- */
function panelScrollMem(){
  const panel=$id('panel'); if(!panel||panel.__lr14ps) return;
  panel.__lr14ps=true;
  const map=new Map(); // photoId → scrollTop
  let lastCur=null;
  const save=()=>{
    try{
      if(typeof cur!=='undefined'&&cur!=null) map.set(String(cur),panel.scrollTop);
      lastCur=cur;
    }catch(e){}
  };
  const restore=()=>{
    try{
      if(typeof cur==='undefined'||cur==null) return;
      const y=map.get(String(cur));
      if(y!=null){
        // wait for sections to settle after openDevelop
        requestAnimationFrame(()=>{ panel.scrollTop=y; api.panelRestored=y; });
      }
    }catch(e){}
  };
  panel.addEventListener('scroll',()=>{
    if(typeof mode!=='undefined'&&mode==='develop'&&typeof cur!=='undefined'&&cur!=null)
      map.set(String(cur),panel.scrollTop);
  },{passive:true});
  // hook openDevelop
  const hook=()=>{
    if(typeof openDevelop!=='function'||openDevelop.__lr14) return false;
    const prev=openDevelop;
    const w=async function(id){
      // capture outgoing scroll against the photo we are leaving
      try{ if(typeof cur!=='undefined'&&cur!=null) map.set(String(cur),panel.scrollTop); }catch(e){}
      const want=id!=null?String(id):null;
      const r=await prev.apply(this,arguments);
      const apply=()=>{
        if(!want) return;
        const y=map.get(want);
        if(y==null) return;
        if(Math.abs(panel.scrollTop-y)>2) panel.scrollTop=y;
        api.panelRestored=panel.scrollTop;
      };
      // openDevelop / syncUI can reset scroll after load — retry across the busy window
      [0,50,120,250,450,700].forEach(ms=>setTimeout(apply,ms));
      return r;
    };
    w.__lr14=true;
    window.openDevelop=w; try{ openDevelop=w; }catch(e){}
    api.panelHook=true;
    return true;
  };
  if(!hook()){ let n=0; const t=()=>{ if(!hook()&&n++<40) setTimeout(t,50); }; setTimeout(t,50); }
  api.panelMap=map;
  api.panelScroll=true;
}

/* ---------- 4. Library grid scroll restore when returning from Develop ---------- */
function libScrollMem(){
  const grid=$id('grid'); if(!grid||grid.__lr14ls) return;
  grid.__lr14ls=true;
  let saved=0;
  let pending=false;
  const save=()=>{ saved=grid.scrollTop; api.libScrollY=saved; };
  const restore=()=>{
    if(saved<=0) return;
    const apply=()=>{ grid.scrollTop=saved; api.libRestored=grid.scrollTop; };
    [0,40,120,280,500].forEach(ms=>setTimeout(apply,ms));
  };
  grid.addEventListener('scroll',()=>{
    if(typeof mode!=='undefined'&&mode==='library'&&!pending) saved=grid.scrollTop;
  },{passive:true});
  // renderLibrary rebuilds cells and can zero scroll — re-apply after childList changes when returning
  if(window.MutationObserver&&!grid.__lr14lsObs){
    grid.__lr14lsObs=true;
    new MutationObserver(()=>{
      if(pending&&typeof mode!=='undefined'&&mode==='library'&&saved>0){
        requestAnimationFrame(()=>{ grid.scrollTop=saved; api.libRestored=grid.scrollTop; });
      }
    }).observe(grid,{childList:true});
  }
  const sm=window.setMode;
  if(typeof sm==='function'&&!sm.__lr14ls){
    const w=function(m){
      const prevMode=(typeof mode!=='undefined')?mode:null;
      if(prevMode==='library'&&m!=='library'){ save(); pending=true; }
      const r=sm.apply(this,arguments);
      if(m==='library'&&prevMode&&prevMode!=='library'){
        restore();
        setTimeout(()=>{ pending=false; },600);
      }
      return r;
    };
    w.__lr14ls=true;
    if(sm.__lr13lo) w.__lr13lo=true;
    if(sm.__lr12) w.__lr12=true;
    if(sm.__lr10) w.__lr10=true;
    if(sm.__lr14more) w.__lr14more=true;
    window.setMode=w; try{ setMode=w; }catch(e){}
  }
  api.libScroll=true;
}

/* ---------- 5. Toast coalesce — suppress identical rapid duplicates ---------- */
function toastCoalesce(){
  if(typeof toast!=='function'||toast.__lr14) return;
  const prev=toast;
  let lastMsg='', lastAt=0;
  const w=function(m,ms){
    const now=Date.now();
    const s=String(m==null?'':m);
    if(s&&s===lastMsg&&now-lastAt<520){ api.toastSkipped=(api.toastSkipped||0)+1; return; }
    lastMsg=s; lastAt=now;
    return prev.apply(this,arguments);
  };
  w.__lr14=true;
  window.toast=w; try{ toast=w; }catch(e){}
  api.toastCoalesce=true;
}

/* ---------- 6. Esc closes Compare (Split / Side) before Find clear ---------- */
function escCompare(){
  if(document.__lr14escCmp){ api.escCompare=true; return; }
  document.__lr14escCmp=true;
  addEventListener('keydown',e=>{
    const k=e.key||e.code; if(k!=='Escape'&&k!=='Esc') return;
    if(typeof mode!=='undefined'&&mode!=='develop') return;
    if(typeof cropOn!=='undefined'&&cropOn) return;
    const modal=$id('modal'); if(modal&&!modal.hidden) return;
    const cmp=$id('cmpBtn');
    if(cmp&&cmp.classList.contains('on')&&typeof setCompare==='function'){
      setCompare('off');
      api.escCmp=true;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);
  api.escCompare=true;
}
// register ASAP (before lr13's delayed Esc Find) so Compare wins on the same keystroke
try{ escCompare(); }catch(e){}

/* ---------- 7. Close Library ⋯ More on Escape / leave Library ---------- */
function closeLibMore(){
  const close=()=>{
    const menu=$id('libMore'), btn=$id('libMoreBtn');
    if(menu&&!menu.hidden){ menu.hidden=true; if(btn) btn.classList.remove('on'); api.libMoreClosed=true; }
  };
  if(!document.__lr14libEsc){
    document.__lr14libEsc=true;
    addEventListener('keydown',e=>{
      const k=e.key||e.code; if(k!=='Escape'&&k!=='Esc') return;
      if(typeof mode!=='undefined'&&mode!=='library') return;
      const menu=$id('libMore'); if(menu&&!menu.hidden){ close(); e.preventDefault(); }
    },true);
  }
  const sm=window.setMode;
  if(typeof sm==='function'&&!sm.__lr14more){
    const w=function(m){
      if(m!=='library') close();
      return sm.apply(this,arguments);
    };
    w.__lr14more=true;
    if(sm.__lr14ls) w.__lr14ls=true;
    if(sm.__lr13lo) w.__lr13lo=true;
    if(sm.__lr12) w.__lr12=true;
    if(sm.__lr10) w.__lr10=true;
    window.setMode=w; try{ setMode=w; }catch(e){}
  }
  api.libMoreEsc=true;
}

/* ---------- 8. Compare labels: Original / After (match baLabel language) ---------- */
function compareLabels(){
  const cl=$id('cmpLabels'); if(!cl||cl.__lr14) return;
  cl.__lr14=true;
  const sync=()=>{
    if(cl.hidden) return;
    cl.querySelectorAll('span').forEach(s=>{
      if(/^Before$/i.test(s.textContent.trim())) s.textContent='Original';
    });
  };
  new MutationObserver(sync).observe(cl,{childList:true,subtree:true,characterData:true,attributes:true});
  setTimeout(sync,200);
  api.cmpLabels=true;
}

/* ---------- 9. Mark adjacent filmstrip thumbs decode=async + fetchpriority ---------- */
function thumbPriority(){
  const run=()=>{
    try{
      const fs=$id('filmstrip'); if(!fs) return;
      const imgs=[...fs.querySelectorAll('img')];
      const i=imgs.findIndex(im=>im.classList.contains('cur'));
      imgs.forEach((im,j)=>{
        im.decoding='async';
        if(j===i||j===i-1||j===i+1){ try{ im.fetchPriority='high'; }catch(e){} im.loading='eager'; }
        else { try{ im.fetchPriority='low'; }catch(e){} }
      });
      api.thumbPri=true;
    }catch(e){}
  };
  const fs=$id('filmstrip');
  if(fs&&!fs.__lr14pri){
    fs.__lr14pri=true;
    new MutationObserver(()=>setTimeout(run,30)).observe(fs,{childList:true});
  }
  setTimeout(run,500);
  api.thumbPriority=run;
}

function init(){
  try{ toastCoalesce(); }catch(e){ console.warn('lr14 toast',e); }
  try{ filmstripHarden(); }catch(e){ console.warn('lr14 film',e); }
  try{ filmstripDblFit(); }catch(e){ console.warn('lr14 dbl',e); }
  try{ panelScrollMem(); }catch(e){ console.warn('lr14 panel',e); }
  try{ libScrollMem(); }catch(e){ console.warn('lr14 lib',e); }
  try{ escCompare(); }catch(e){ console.warn('lr14 escCmp',e); }
  try{ closeLibMore(); }catch(e){ console.warn('lr14 more',e); }
  try{ compareLabels(); }catch(e){ console.warn('lr14 cmpLab',e); }
  try{ thumbPriority(); }catch(e){ console.warn('lr14 thumb',e); }
  // re-hook setMode after earlier wrappers settle
  setTimeout(()=>{ try{ libScrollMem(); closeLibMore(); }catch(e){} },450);
  setTimeout(()=>{ try{ filmstripHarden(); }catch(e){} },600);
  api.ready=true;
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,280)); else setTimeout(init,280);
})();
