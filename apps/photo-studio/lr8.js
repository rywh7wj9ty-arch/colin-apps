/* ===== Round 8am (2026-10-16): panel finder + edited markers, iPhone photo/panel split,
   pinned Undo/Redo on iPhone, More-menu close on module switch ===== */
(function(){
const $id=id=>document.getElementById(id);
const LSg=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } };
const LSs=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
const mob=matchMedia('(max-width:820px)');

/* ---------- 1. Edited markers on section headers ---------- */
let D0=null;
function secKey(sm){ if(typeof SEC_KEYS==='undefined') return null; const t=sm.textContent; return Object.keys(SEC_KEYS).find(k=>t.startsWith(k)||t.includes(k))||null; }
function isEdited(key){
  if(typeof S==='undefined'||!S) return false;
  if(!D0) D0=defaults();
  return SEC_KEYS[key].some(k=>{ const d=D0[k], v=S[k]; if(v===undefined) return false;
    if(Array.isArray(d)&&!d.length) return Array.isArray(v)&&v.length>0;
    try{ return JSON.stringify(v)!==JSON.stringify(d); }catch(e){ return false; } });
}
function markEdited(){
  let n=0;
  document.querySelectorAll('#sections details.sec>summary').forEach(sm=>{ const k=secKey(sm); if(!k) return;
    const e=isEdited(k); sm.parentNode.classList.toggle('edited',e); if(e) n++; });
  const c=$id('pfEdN'); if(c) c.textContent=n?String(n):'';
  if(edOnly) applyFilter();
  return n;
}
let mt=0; const markSoon=()=>{ clearTimeout(mt); mt=setTimeout(markEdited,160); };
window.__lr8={markEdited,applyFilter};

/* ---------- 2. Panel finder ("Find a control"), Edited-only, Collapse all ---------- */
let edOnly=false, saved=null;
const SYN={color:'colour',colors:'colour',gray:'grey',wb:'white balance',temperature:'temp',sharpen:'sharp',sharpness:'sharp',noise:'noise',nr:'noise',vignette:'vignet',hsl:'colour mixer',straighten:'crop',rotate:'rotate',perspective:'transform',keystone:'transform',bw:'b&w',mono:'b&w',monochrome:'b&w',blur:'blur',bokeh:'lens blur',orange:'orange',haze:'dehaze',fog:'dehaze',skin:'skin',grain:'grain',film:'film',curve:'curve',split:'grading',toning:'grading',fringe:'fringing',distortion:'distortion',copyright:'copyright',caption:'caption',title:'title',heal:'spot',spots:'spot',dust:'spot',redeye:'red-eye'};
const norm=s=>String(s||'').toLowerCase().replace(/↺/g,'').replace(/colou?r/g,'colour').replace(/gr[ae]y/g,'grey').replace(/\s+/g,' ').trim();
function terms(q){ return norm(q).split(' ').filter(Boolean).map(w=>SYN[w]?norm(SYN[w]):w); }
const has=(txt,ts)=>ts.every(t=>txt.includes(t));
const vis=e=>!e.closest('[hidden]')&&!e.closest('[style*="display: none"],[style*="display:none"]');
function applyFilter(){
  const inp=$id('pfQ'); if(!inp) return;
  const q=inp.value.trim(), ts=terms(q), active=!!q||edOnly;
  const secs=[...document.querySelectorAll('#sections details.sec')];
  if(active&&!saved) saved=secs.map(d=>d.open);
  if(!active){ secs.forEach((d,i)=>{ d.classList.remove('pfHide'); d.querySelectorAll('.pfHide,.pfHit').forEach(e=>e.classList.remove('pfHide','pfHit')); if(saved&&saved[i]!=null) d.open=saved[i]; }); saved=null; $id('pfNone').hidden=true; $id('pfX').hidden=true; return; }
  let shown=0, first=null;
  secs.forEach(d=>{
    d.querySelectorAll('.pfHide,.pfHit').forEach(e=>e.classList.remove('pfHide','pfHit'));
    const sm=d.querySelector('summary'); let ok=true;
    if(edOnly&&!d.classList.contains('edited')) ok=false;
    if(ok&&ts.length){
      const tMatch=has(norm(sm.textContent),ts);
      if(!tMatch){
        const rows=[...d.querySelectorAll('.sl')].filter(vis); let hit=0;
        rows.forEach(r=>{ const l=r.querySelector('label'); const m=l&&has(norm(l.textContent),ts); r.classList.toggle('pfHide',!m); if(m){ r.classList.add('pfHit'); hit++; if(!first) first=r; } });
        if(!hit){ // labels, buttons, headings inside the section
          const other=[...d.querySelectorAll('.secbody label,.secbody button,.secbody h4,.secbody .sub')].filter(vis).some(e=>has(norm(e.textContent),ts));
          rows.forEach(r=>r.classList.remove('pfHide'));
          if(!other) ok=false;
        } else { // tidy: hide other blocks in this section that hold no matching control
          const body=d.querySelector('.secbody'); if(body) [...body.children].forEach(ch=>{ if(!ch.classList.contains('pfHit')&&!ch.querySelector('.pfHit')) ch.classList.add('pfHide'); });
        }
      } else if(!first) first=sm;
    }
    d.classList.toggle('pfHide',!ok);
    if(ok){ shown++; if(ts.length||edOnly) d.open=true; }
  });
  $id('pfNone').hidden=shown>0; $id('pfNone').textContent=edOnly&&!ts.length?'No edits yet on this photo.':'No controls match “'+q+'”.';
  $id('pfX').hidden=!q;
  return first;
}
function buildFinder(){
  const secs=$id('sections'); if(!secs||$id('pfBar')) return;
  const bar=document.createElement('div'); bar.id='pfBar'; bar.className='pfBar';
  bar.innerHTML='<div class="pfIn"><span class="pfI">⌕</span><input id="pfQ" type="search" placeholder="Find a control… (e.g. clarity, wb)" autocomplete="off" enterkeyhint="search" aria-label="Find a control"><button type="button" id="pfX" class="pfX" title="Clear" hidden>✕</button></div>'+
    '<button type="button" class="btn" id="pfEd" title="Show only sections you have changed on this photo">✎ Edited <b id="pfEdN"></b></button>'+
    '<button type="button" class="btn icon" id="pfCol" title="Collapse all sections">⊟</button>';
  const none=document.createElement('div'); none.id='pfNone'; none.className='pfNone'; none.hidden=true;
  secs.parentNode.insertBefore(bar,secs); secs.parentNode.insertBefore(none,secs);
  const q=$id('pfQ'); let t=0;
  q.addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(applyFilter,90); });
  window.__lr8.flushFilter=()=>{ clearTimeout(t); return applyFilter(); };
  q.addEventListener('keydown',e=>{ e.stopPropagation();
    if(e.key==='Escape'){ q.value=''; applyFilter(); q.blur(); }
    if(e.key==='Enter'){ e.preventDefault(); const f=applyFilter(); if(f){ f.scrollIntoView({block:'center',behavior:'smooth'}); const r=f.querySelector&&f.querySelector('input[type=range]'); if(r&&!matchMedia('(pointer:coarse)').matches) r.focus(); q.blur(); } } });
  $id('pfX').onclick=()=>{ q.value=''; applyFilter(); };
  $id('pfEd').onclick=()=>{ edOnly=!edOnly; $id('pfEd').classList.toggle('on',edOnly); markEdited(); applyFilter(); };
  $id('pfCol').onclick=()=>{ if(q.value||edOnly){ q.value=''; edOnly=false; $id('pfEd').classList.remove('on'); applyFilter(); } document.querySelectorAll('#sections details.sec').forEach(d=>d.open=false); $id('panel').scrollTop=0; };
  // "/" focuses the finder in Develop (like Lightroom's search fields)
  addEventListener('keydown',e=>{ if(e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey) return; if(typeof mode!=='undefined'&&mode!=='develop') return;
    const tg=e.target; if(tg&&(/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)&&!/^(range|checkbox)$/.test(tg.type)||tg.isContentEditable)) return;
    if($id('modal')&&!$id('modal').hidden) return; e.preventDefault(); q.focus(); q.select(); },true);
}

/* ---------- 3. iPhone: drag handle between photo and panel ---------- */
function buildSplit(){
  const viewer=$id('viewer'), panel=$id('panel'); if(!viewer||!panel||$id('splitH')) return;
  const h=document.createElement('div'); h.id='splitH'; h.className='splitH'; h.title='Drag to resize photo · double-tap for a big photo'; h.setAttribute('role','separator'); h.setAttribute('aria-label','Resize photo');
  h.innerHTML='<i></i>'; viewer.after(h);
  const MIN=.30, MAX=.84, BIG=.78;
  const apply=f=>{ if(!mob.matches){ viewer.style.height=''; return; } f=Math.max(MIN,Math.min(MAX,f)); viewer.style.height=Math.round(f*innerHeight)+'px'; h.dataset.f=f.toFixed(3); };
  const cur=()=>viewer.getBoundingClientRect().height/innerHeight;
  let f0=parseFloat(LSg('ps.viewerH',''))||0; if(f0) apply(f0);
  let y0=0, h0=0, drag=false, last=0, prevF=0;
  h.addEventListener('pointerdown',e=>{ if(!mob.matches) return; drag=true; y0=e.clientY; h0=viewer.getBoundingClientRect().height; h.setPointerCapture(e.pointerId); h.classList.add('on'); e.preventDefault(); });
  h.addEventListener('pointermove',e=>{ if(!drag) return; apply((h0+e.clientY-y0)/innerHeight); });
  const end=e=>{ if(!drag) return; drag=false; h.classList.remove('on'); const moved=Math.abs(e.clientY-y0)>6;
    if(moved) LSs('ps.viewerH',cur().toFixed(3));
    else { const now=Date.now(); if(now-last<350){ const c=cur(); if(c<BIG-.03){ prevF=c; apply(BIG); } else apply(prevF&&prevF<BIG-.03?prevF:.52); LSs('ps.viewerH',cur().toFixed(3)); last=0; } else last=now; } };
  h.addEventListener('pointerup',end); h.addEventListener('pointercancel',end);
  h.addEventListener('dblclick',e=>{ e.preventDefault(); });
  const re=()=>{ const f=parseFloat(LSg('ps.viewerH',''))||0; if(mob.matches&&f) apply(f); else viewer.style.height=''; };
  mob.addEventListener?mob.addEventListener('change',re):mob.addListener(re);
  addEventListener('orientationchange',()=>setTimeout(re,250));
  window.setViewerSplit=f=>{ apply(f); LSs('ps.viewerH',cur().toFixed(3)); };
}

/* ---------- 4. iPhone: keep Undo / Redo reachable in the scrolling tool row ---------- */
function pinUndo(){
  const u=$id('undoBtn'), r=$id('redoBtn'); if(!u||!r||$id('vtUR')) return;
  const vt=u.closest('.vtools'); const nx=$id('nextBtn');
  const g=document.createElement('span'); g.id='vtUR'; g.className='vtUR';
  u.before(g); g.append(u,r);
  if(nx&&nx.parentNode===vt) g.before(nx); // keep › with the other nav, group sits last
  const upd=()=>{ g.classList.toggle('stuck',vt.scrollWidth-vt.clientWidth-vt.scrollLeft>2); };
  vt.addEventListener('scroll',upd,{passive:true}); addEventListener('resize',upd); setTimeout(upd,300);
  new MutationObserver(()=>{ if(g.parentNode===vt&&vt.lastElementChild!==g) vt.appendChild(g); upd(); }).observe(vt,{childList:true});
}

/* ---------- 5. Library ⋯ More menu closes when leaving the Library ---------- */
function moreGuard(){
  const lib=$id('library'); if(!lib) return;
  new MutationObserver(()=>{ if(!lib.classList.contains('on')){ const m=$id('libMore'); if(m&&!m.hidden){ m.hidden=true; $id('libMoreBtn')?.classList.remove('on'); } } }).observe(lib,{attributes:true,attributeFilter:['class']});
}

function hook(){
  const c=window.commit; if(c&&!c.__lr8){ const w=function(){ const r=c.apply(this,arguments); markSoon(); return r; }; w.__lr8=1; window.commit=w; }
  const s=window.syncUI; if(s&&!s.__lr8){ const w=function(){ const r=s.apply(this,arguments); markSoon(); return r; }; w.__lr8=1; window.syncUI=w; }
}
function init(){ try{ buildFinder(); }catch(e){ console.warn('lr8 finder',e); } try{ buildSplit(); }catch(e){ console.warn('lr8 split',e); }
  try{ pinUndo(); }catch(e){ console.warn('lr8 undo',e); } try{ moreGuard(); }catch(e){} hook(); setTimeout(markEdited,300); window.__lr8.ready=true; }
if(document.readyState==='loading') addEventListener('DOMContentLoaded',()=>setTimeout(init,80)); else setTimeout(init,80);
})();
