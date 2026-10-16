/* ===== Double-tap / double-click any slider (track or thumb) to reset it — one undoable step ===== */
(function(){
const isR=e=>e&&e.tagName==='INPUT'&&e.type==='range';
let down=null, last=null, pend=null, bypass=false;
function defOf(r){
  if(r.dataset.def!=null&&r.dataset.def!=='') return +r.dataset.def;
  const a=r.getAttribute('value'); if(a!=null&&a!=='') return +a;
  if(r.__psDef!=null) return r.__psDef;
  const mn=+(r.min||0), mx=+(r.max||100); return mx<mn?mn:mn+(mx-mn)/2;
}
// remember the value a range had the first time it was shown, for ranges built without a value attribute
new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{ if(n.nodeType!==1) return; (isR(n)?[n]:n.querySelectorAll?n.querySelectorAll('input[type=range]'):[]).forEach(r=>{ if(r.__psDef==null&&r.getAttribute('value')==null) setTimeout(()=>{ if(r.__psDef==null) r.__psDef=+r.value; },0); }); }))).observe(document.documentElement,{childList:true,subtree:true});
document.querySelectorAll('input[type=range]').forEach(r=>{ if(r.__psDef==null) r.__psDef=+r.value; });
function fire(r,t){ bypass=true; try{ r.dispatchEvent(new Event(t,{bubbles:true})); } finally{ bypass=false; } }
function reset(r){
  if(pend){ clearTimeout(pend.t); pend=null; }
  const row=r.closest('.sl'), lab=row&&row.querySelector('label[title^="Double-click"]');
  if(lab&&row.contains(r)){ bypass=true; try{ lab.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); } finally{ bypass=false; } }
  else { const d=defOf(r); r.value=d; fire(r,'input'); fire(r,'change'); }
  const name=(row&&row.querySelector('label')?.textContent)||r.title||r.getAttribute('aria-label')||'slider';
  if(typeof toast==='function') toast('Reset '+name.trim(),700);
}
document.addEventListener('pointerdown',e=>{ const r=e.target; if(!isR(r)) return; down={r,x:e.clientX,y:e.clientY,t:e.timeStamp,v:r.value,moved:false}; },true);
document.addEventListener('pointermove',e=>{ if(down&&(Math.abs(e.clientX-down.x)>8||Math.abs(e.clientY-down.y)>8)) down.moved=true; },true);
document.addEventListener('pointerup',e=>{
  const d=down; down=null; if(!d||!isR(d.r)) return;
  const now=e.timeStamp, tap=!d.moved&&now-d.t<700;
  if(!tap){ last=null; return; }
  if(last&&last.r===d.r&&d.t-last.t<400){ last=null; if(e.pointerType!=='mouse') e.preventDefault(); reset(d.r); d.r.__psReset=performance.now(); return; }
  last={r:d.r,t:now,v:d.v};
},true);
// hold back the commit ('change') from a quick tap for ~320 ms so a double-tap becomes one history step
document.addEventListener('change',e=>{
  const r=e.target; if(bypass||!isR(r)) return;
  if(r.__psReset&&performance.now()-r.__psReset<500){ e.stopImmediatePropagation(); return; }
  if(!(last&&last.r===r&&performance.now()-last.t<600)) return;
  e.stopImmediatePropagation(); if(pend) clearTimeout(pend.t);
  pend={r,t:setTimeout(()=>{ pend=null; if(r.__psReset&&performance.now()-r.__psReset<500) return; fire(r,'change'); },420)};
},true);
// native dblclick (desktop): app.js sliders already reset themselves; the pointer logic above handles the rest,
// so swallow the browser dblclick for ranges the pointer handler just reset to avoid a second history step
document.addEventListener('dblclick',e=>{ const r=e.target; if(isR(r)&&r.__psReset&&performance.now()-r.__psReset<500) e.stopImmediatePropagation(); },true);
})();
