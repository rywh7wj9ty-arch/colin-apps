/* Before/After: prominent draggable split handle (grip + Original/Edited labels) and a one-tap Before/After button in the Develop tool row */
addEventListener('DOMContentLoaded',()=>setTimeout(()=>{ try{
  const stage=$('#stage'); if(!stage||!window.setCompare) return; window.__baUI=true;
  const h=document.createElement('div'); h.id='baHandle'; h.hidden=true; h.setAttribute('role','slider'); h.setAttribute('aria-label','Before/after divider'); h.tabIndex=0;
  h.innerHTML='<div class="baLine"></div><div class="baGrip"><span class="baArr">‹</span><span class="baDots"><i></i><i></i><i></i></span><span class="baArr">›</span></div><span class="baTag baL">Original</span><span class="baTag baR">Edited</span>';
  stage.appendChild(h);
  // tool-row button
  const vt=$('.vtools'); const b=document.createElement('button'); b.className='btn baToggle'; b.id='baSplitBtn'; b.type='button'; b.title='Before / After split (drag the handle)'; b.setAttribute('aria-pressed','false'); b.innerHTML='<span class="baIco">◧</span><span class="baTxt"> Before/After</span>';
  vt.prepend(b); const keepVis=()=>{ if(vt.firstElementChild!==b) vt.prepend(b); }; new MutationObserver(keepVis).observe(vt,{childList:true});
  b.onclick=()=>{ const st=__cmpState(); setCompare(st.mode==='split'?'off':'split'); if(st.mode!=='split') __setSplit(0.5); };
  let dragging=false, pend=null, raf=0;
  const place=()=>{ const st=__cmpState(), r=__cmpRect(), on=st.active&&st.mode==='split'&&r&&!$('#cmp').hidden;
    b.classList.toggle('on',st.mode==='split'); b.setAttribute('aria-pressed',st.mode==='split'?'true':'false'); stage.classList.toggle('baOn',!!on);
    if(!on){ if(!h.hidden) h.hidden=true; return; } h.hidden=false;
    const s=pend!=null?pend:st.split, x=r[0]+r[2]*s; h.style.left=x+'px'; h.style.top=r[1]+'px'; h.style.height=r[3]+'px';
    h.setAttribute('aria-valuenow',Math.round(s*100)); h.classList.toggle('hideL',s<0.12); h.classList.toggle('hideR',s>0.88); };
  (function loop(){ place(); requestAnimationFrame(loop); })();
  const at=e=>{ const r=__cmpRect(); if(!r) return 0.5; const bb=stage.getBoundingClientRect(); return Math.min(1,Math.max(0,(e.clientX-bb.left-r[0])/r[2])); };
  const push=v=>{ pend=v; place(); if(!raf) raf=requestAnimationFrame(()=>{ raf=0; if(pend!=null) __setSplit(pend); if(!dragging) pend=null; }); };
  h.addEventListener('pointerdown',e=>{ if(!e.target.closest('.baGrip,.baLine')&&e.target!==h) return; dragging=true; h.classList.add('drag'); try{h.setPointerCapture(e.pointerId);}catch(_){} push(at(e)); e.preventDefault(); e.stopPropagation(); });
  h.addEventListener('pointermove',e=>{ if(!dragging) return; push(at(e)); e.preventDefault(); e.stopPropagation(); });
  const end=e=>{ if(!dragging) return; dragging=false; h.classList.remove('drag'); if(pend!=null) __setSplit(pend); pend=null; e&&e.stopPropagation(); };
  h.addEventListener('pointerup',end); h.addEventListener('pointercancel',end); h.addEventListener('lostpointercapture',()=>end());
  h.addEventListener('dblclick',e=>{ e.stopPropagation(); __setSplit(0.5); });
  h.addEventListener('keydown',e=>{ const s=__cmpState().split; if(e.key==='ArrowLeft'||e.key==='ArrowRight'){ __setSplit(s+(e.key==='ArrowLeft'?-0.05:0.05)); e.preventDefault(); e.stopPropagation(); } });
  window.__baHandle=h;
}catch(e){ console.warn('ba.js',e); } },60));
