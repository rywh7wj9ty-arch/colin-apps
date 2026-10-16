/* ===== Round 11am (2026-10-16): iPhone tool-row scroll fade, ⋯ shows active tool name when
   something on is hidden, Find-a-control remembers recent searches + Enter jumps to next match (flush fixed in lr12/this patch),
   Fit more discoverable when zoomed, tighter Develop chrome (more photo space) ===== */
(function(){
const $id=id=>document.getElementById(id);
const touch=(typeof isTouch!=='undefined'&&isTouch)||matchMedia('(pointer:coarse)').matches;
const api=window.__lr11={ready:false};
const LSg=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } };
const LSs=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };

/* ---------- 1. iPhone tool-row: clearer right-edge fade while more tools are off-screen ---------- */
function scrollFade(){
  const vt=document.querySelector('.vtools'); if(!vt) return;
  // reuse the sticky Undo group as the fade surface (no extra chrome in the row)
  const upd=()=>{
    const overflow=vt.scrollWidth-vt.clientWidth>4;
    const atEnd=vt.scrollLeft+vt.clientWidth>=vt.scrollWidth-3;
    vt.classList.toggle('vtCanScroll', overflow && matchMedia('(max-width:820px)').matches);
    vt.classList.toggle('vtAtEnd', atEnd);
  };
  vt.addEventListener('scroll',upd,{passive:true});
  addEventListener('resize',upd);
  if(window.ResizeObserver) new ResizeObserver(upd).observe(vt);
  setTimeout(upd,200); setTimeout(upd,800);
  api.scrollFade=upd;
}

/* ---------- 2. ⋯ More tools: short label when an active tool is hidden inside ---------- */
const ACT_NAME={proofSel:'Proof',autoSyncBtn:'Sync',clipBtn:'Clip',tatBtn:'Target',cmpBtn:'Compare',wbBtn:'WB',refBtn:'Ref',fsBtn:'Full',zoomBtn:'Fit'};
function activeHiddenNames(){
  const pop=$id('vtMore'); if(!pop||pop.children.length===0) return [];
  const names=[];
  [...pop.children].forEach(el=>{
    if(el.id==='proofSel'&&el.value) names.push('Proof');
    else if(el.classList&&el.classList.contains('on')&&ACT_NAME[el.id]) names.push(ACT_NAME[el.id]);
    else if(el.id==='devStars'&&el.querySelector('.on')) names.push('★');
  });
  return names;
}
function polishMoreBtn(){
  const btn=$id('vtMoreBtn'); if(!btn) return;
  const names=activeHiddenNames();
  const base='More tools';
  const tip=btn.title||base;
  // keep ⋯ glyph; append a short active name so you can see what's on without opening
  const label=names.length?('⋯ '+names[0]):'⋯';
  if(btn.childNodes.length===1&&btn.firstChild.nodeType===3){ if(btn.textContent!==label) btn.textContent=label; }
  else if(!btn.querySelector('.vtMoreLab')){
    btn.textContent='';
    const s=document.createTextNode(label); btn.appendChild(s);
  } else {
    btn.textContent=label;
  }
  btn.classList.toggle('hasAct',names.length>0);
  const al=names.length?base+' — '+names.join(', ')+' on':base;
  if(btn.getAttribute('aria-label')!==al) btn.setAttribute('aria-label',al);
  // don't fight lr10's tooltip listing of hidden tools; extend it when something is active
  if(names.length&&!/ on$/.test(tip)){
    const t=(btn.title||base)+(btn.title&&btn.title!==base?'':'') ;
    // lr10 already sets "More tools: A, B"; append active hint once
    if(btn.title&&!btn.title.includes(' (on:')) btn.title=btn.title+' (on: '+names.join(', ')+')';
  }
}
function watchMore(){
  const go=()=>{ polishMoreBtn(); };
  const pop=$id('vtMore'), btn=$id('vtMoreBtn');
  if(pop) new MutationObserver(go).observe(pop,{childList:true,subtree:true,attributes:true,attributeFilter:['class','value']});
  if(btn) new MutationObserver(()=>{ /* lr10 toggles .dot / title */ requestAnimationFrame(go); }).observe(btn,{attributes:true,attributeFilter:['class','title','hidden']});
  const ps=$id('proofSel'); if(ps) ps.addEventListener('change',go);
  // after lr10 relayouts
  let n=0; const tick=()=>{ go(); if(++n<20) setTimeout(tick,200); }; tick();
  addEventListener('resize',()=>setTimeout(go,50));
  api.polishMore=go;
}

/* ---------- 3. Find a control: recent searches + Enter cycles to the next match ---------- */
function histLoad(){ try{ return JSON.parse(LSg('ps.pfHist','[]')).filter(x=>typeof x==='string'&&x.trim()).slice(0,6); }catch(e){ return []; } }
function histSave(q){
  q=String(q||'').trim(); if(!q||q.length<2) return;
  const h=histLoad().filter(x=>x.toLowerCase()!==q.toLowerCase());
  h.unshift(q); LSs('ps.pfHist',JSON.stringify(h.slice(0,6)));
  renderChips();
}
function renderChips(){
  const wrap=$id('pfHist'); if(!wrap) return;
  const h=histLoad();
  wrap.hidden=!h.length;
  wrap.innerHTML=h.map(q=>'<button type="button" class="pfChip" data-q="'+q.replace(/"/g,'&quot;')+'">'+q.replace(/[<>&]/g,c=>({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]))+'</button>').join('');
}
function collectHits(){
  // visible highlighted rows / section summaries after applyFilter
  const hits=[];
  document.querySelectorAll('#sections details.sec:not(.pfHide)').forEach(d=>{
    const rows=[...d.querySelectorAll('.pfHit')].filter(r=>r.offsetParent!==null);
    if(rows.length) rows.forEach(r=>hits.push(r));
    else if(d.open){ const sm=d.querySelector('summary'); if(sm) hits.push(sm); }
  });
  return hits;
}
function enhanceFinder(){
  const q=$id('pfQ'), bar=$id('pfBar'); if(!q||!bar||q.__lr11) return;
  q.__lr11=true;
  // chips row (only visible when the field is focused and empty — stays out of the way)
  let wrap=$id('pfHist');
  if(!wrap){
    wrap=document.createElement('div'); wrap.id='pfHist'; wrap.className='pfHist'; wrap.hidden=true;
    wrap.setAttribute('aria-label','Recent searches');
    bar.after(wrap);
    wrap.addEventListener('click',e=>{ const b=e.target.closest('.pfChip'); if(!b) return;
      q.value=b.dataset.q||b.textContent; q.dispatchEvent(new Event('input',{bubbles:true}));
      // jump to first match
      setTimeout(()=>{ const hits=collectHits(); if(hits[0]){ hits[0].scrollIntoView({block:'center',behavior:'smooth'}); hitIdx=0; } },120);
    });
  }
  renderChips();
  const showHist=()=>{ const empty=!q.value.trim(); wrap.classList.toggle('show',empty&&document.activeElement===q&&histLoad().length>0); if(empty) renderChips(); };
  q.addEventListener('focus',showHist); q.addEventListener('blur',()=>setTimeout(()=>wrap.classList.remove('show'),180));
  q.addEventListener('input',showHist);

  let hitIdx=-1;
  // capture Enter before lr8 blurs: cycle matches, remember search
  q.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ hitIdx=-1; wrap.classList.remove('show'); return; } // lr8 clears
    if(e.key!=='Enter') return;
    e.preventDefault(); e.stopImmediatePropagation();
    const v=q.value.trim();
    // flush pending debounce so the first Enter always cycles on current text (lr12 flushFilter)
    const flush=()=>{ if(window.__lr8&&typeof __lr8.flushFilter==='function') return __lr8.flushFilter();
      if(window.__lr8&&typeof __lr8.applyFilter==='function') return __lr8.applyFilter();
      q.dispatchEvent(new Event('input',{bubbles:true})); return null; };
    flush();
    const cycle=()=>{
      const hits=collectHits();
      if(!hits.length){ hitIdx=-1; api.lastHit={i:-1,n:0,q:v}; return; }
      hitIdx=(hitIdx+1)%hits.length;
      const el=hits[hitIdx];
      el.scrollIntoView({block:'center',behavior:'smooth'});
      el.classList.add('pfFlash'); setTimeout(()=>el.classList.remove('pfFlash'),650);
      const r=el.querySelector&&el.querySelector('input[type=range]');
      if(r&&!touch) try{ r.focus({preventScroll:true}); }catch(err){}
      histSave(v);
      try{ q.focus({preventScroll:true}); }catch(err){}
      api.lastHit={i:hitIdx,n:hits.length,q:v};
    };
    // sync when flush available; tiny rAF otherwise so DOM classes settle
    if(window.__lr8&&(__lr8.flushFilter||__lr8.applyFilter)) cycle();
    else requestAnimationFrame(()=>setTimeout(cycle,0));
  },true);
  api.finder={histLoad,histSave,collectHits,get hitIdx(){return hitIdx;},set hitIdx(v){hitIdx=v;}};
}

/* ---------- 4. Fit discoverability: accent the zoom control while zoomed ---------- */
function fitHint(){
  const zb=$id('zoomBtn'); if(!zb||zb.__lr11) return;
  zb.__lr11=true;
  const sync=()=>{
    const z=(typeof zoom!=='undefined')?zoom:null;
    const on=!!z;
    zb.classList.toggle('fitHint',on);
    const t=on?'Fit to screen (currently zoomed — tap or double-tap photo)':'Zoom to 100% (Z · double-tap photo)';
    if(zb.title!==t) zb.title=t;
    if(on&&zb.getAttribute('aria-label')!=='Fit') zb.setAttribute('aria-label','Fit');
  };
  // wrap setZoom if present
  const sz=window.setZoom;
  if(typeof sz==='function'&&!sz.__lr11){
    const w=function(){ const r=sz.apply(this,arguments); sync(); return r; }; w.__lr11=true; window.setZoom=w; try{ setZoom=w; }catch(e){}
  }
  zb.addEventListener('click',()=>setTimeout(sync,0));
  const mo=new MutationObserver(sync); mo.observe(zb,{characterData:true,childList:true,subtree:true});
  setTimeout(sync,400);
  api.fitSync=sync;
}

/* ---------- 5. Esc still closes ⋯ (belt-and-braces; lr10 already does this) + focus return ---------- */
function moreKeys(){
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape') return;
    const pop=$id('vtMore'), btn=$id('vtMoreBtn');
    if(pop&&!pop.hidden&&window.__lr10&&typeof __lr10.setOpen==='function'){
      __lr10.setOpen(false); if(btn) btn.focus({preventScroll:true});
    }
  },true);
}

function init(){
  try{ scrollFade(); }catch(e){ console.warn('lr11 fade',e); }
  try{ watchMore(); }catch(e){ console.warn('lr11 more',e); }
  try{ fitHint(); }catch(e){ console.warn('lr11 fit',e); }
  try{ moreKeys(); }catch(e){}
  // finder bar is built by lr8 (~80ms); retry until it's there
  let n=0; const tryF=()=>{ try{ enhanceFinder(); }catch(e){ console.warn('lr11 finder',e); }
    if(!$id('pfHist')&&n++<25) setTimeout(tryF,80); };
  tryF();
  api.ready=true;
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,160)); else setTimeout(init,160);
})();
