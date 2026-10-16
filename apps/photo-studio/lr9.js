/* ===== Round 9am (2026-10-16): tidier quick row (⋯ for secondary actions), help with touch gestures
   + filter, iPhone dialog polish (sticky action row, no focus-zoom), accessibility names for icon
   buttons / sliders / thumbnails, overlay resync after photo switch ===== */
(function(){
const $id=id=>document.getElementById(id);
const LSg=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } };
const LSs=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
const touch=(typeof isTouch!=='undefined'&&isTouch)||matchMedia('(pointer:coarse)').matches;
const escH=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- 1. Quick row: keep the everyday actions, tuck the rest behind ⋯ ---------- */
const SECONDARY=['prevSetBtn','vcBtn','devInfoBtn','matchExpBtn','enhanceBtn','soloBtn'];
function buildQuickMore(){
  const q=document.querySelector('#panel .quick'); if(!q||$id('quickMore')) return;
  const box=document.createElement('div'); box.id='quickMore'; box.className='quick quickMore';
  box.setAttribute('role','group'); box.setAttribute('aria-label','More quick actions');
  SECONDARY.forEach(id=>{ const b=$id(id); if(b&&b.parentNode===q) box.appendChild(b); });
  if(!box.children.length) return;
  const t=document.createElement('button'); t.type='button'; t.className='btn quickMoreBtn'; t.id='quickMoreBtn'; t.textContent='⋯';
  t.title='More quick actions: Apply Previous, Virtual copy, Info, Match exposure, Enhance 2×, Solo';
  t.setAttribute('aria-label','More quick actions'); t.setAttribute('aria-controls','quickMore');
  q.appendChild(t); q.after(box);
  const set=on=>{ box.hidden=!on; t.classList.toggle('on',on); t.setAttribute('aria-expanded',on?'true':'false'); };
  t.onclick=()=>{ const on=box.hidden; set(on); LSs('ps.quickMore',on?'1':'0'); };
  set(LSg('ps.quickMore','0')==='1');
  // anything a later script appends to the primary row after the ⋯ button keeps ⋯ last
  new MutationObserver(()=>{ if(q.lastElementChild!==t) q.appendChild(t); }).observe(q,{childList:true});
}

/* ---------- 2. Help: touch gestures first on phones, a filter box, missing shortcuts, sticky Close ---------- */
const EXTRA_KEYS=[['/','Find a control in the Develop panel (Enter jumps, Esc clears)'],['Ctrl+Alt+O','Loupe grid overlay'],['Alt + drag Amount / Masking','Show the sharpening mask (Detail)'],['Shift+L','Library: collections & projects sidebar'],['Shift+F','Library: filter panel'],['?','This help']];
const GESTURES=[['Tap a selected thumbnail','Open it in Develop'],['Swipe ← → on the photo','Next / previous photo (at fit zoom)'],['Pinch / drag the photo','Zoom / pan'],['Tap ◐ Original · hold it','Toggle before/after · peek while held'],['Double-tap a slider label','Reset that slider'],['Drag the grab bar ═','Give the photo or the panel more room (double-tap: big photo)'],['Find a control…','Type e.g. clarity, wb, noise to show only that control'],['⋯ in the quick row','Apply Previous, Virtual copy, Info, Match exposure, Enhance, Solo'],['↶ ↷ (right end of the tool row)','Undo / redo — always visible']];
function enhanceHelp(){
  const d=$id('dlg'); if(!d||$id('modal').hidden||d.querySelector('.hlp9')) return;
  const h=d.querySelector('h3'); if(!h||!/Keyboard shortcuts/i.test(h.textContent)) return;
  const tbl=d.querySelector('table');
  if(tbl){ const have=new Set([...d.querySelectorAll('kbd')].map(k=>k.textContent.trim()));
    EXTRA_KEYS.forEach(([k,v])=>{ if(have.has(k)) return; const tr=document.createElement('tr'); tr.innerHTML=`<td><kbd>${escH(k)}</kbd></td><td>${escH(v)}</td>`; tbl.appendChild(tr); }); }
  const btns=d.querySelector(':scope > .btns');
  const tip=[...d.querySelectorAll(':scope > p')].find(p=>/On iPhone/.test(p.textContent));
  // everything that is shortcut content (between the title and the end, minus the buttons)
  const content=[...d.children].filter(e=>e!==h&&e!==btns&&e!==tip);
  const keys=document.createElement('details'); keys.className='hlpKeys'; keys.open=!touch;
  keys.innerHTML=`<summary>${touch?'Keyboard shortcuts (with a keyboard)':'Keyboard shortcuts'}</summary>`;
  content.forEach(e=>keys.appendChild(e));
  const wrap=document.createElement('div'); wrap.className='hlp9';
  wrap.innerHTML=`<input type="search" id="hlpQ" class="hlpQ" placeholder="Filter, e.g. crop, undo, label" aria-label="Filter shortcuts and gestures" autocomplete="off"><div class="hlpNone" id="hlpNone" hidden>Nothing matches.</div>`;
  const ges=document.createElement('details'); ges.className='hlpTouch'; ges.open=touch;
  ges.innerHTML=`<summary>Touch gestures (iPhone / iPad)</summary><table>${GESTURES.map(([k,v])=>`<tr><td><b>${escH(k)}</b></td><td>${escH(v)}</td></tr>`).join('')}</table>`;
  h.textContent=touch?'Help & gestures':'Help & shortcuts';
  h.after(wrap);
  if(touch){ wrap.after(ges); ges.after(keys); } else { wrap.after(keys); keys.after(ges); }
  if(tip) tip.remove();
  if(btns) d.appendChild(btns);
  const q=$id('hlpQ');
  q.addEventListener('input',()=>{
    const t=q.value.trim().toLowerCase(); let n=0;
    d.querySelectorAll('.hlpKeys tr,.hlpTouch tr').forEach(tr=>{ const ok=!t||tr.textContent.toLowerCase().includes(t); tr.hidden=!ok; if(ok) n++; });
    d.querySelectorAll('.hlpKeys h3').forEach(x=>{ const tb=x.nextElementSibling&&x.nextElementSibling.tagName==='TABLE'?x.nextElementSibling:x.parentNode.querySelector('table'); x.hidden=!!t&&tb&&![...tb.rows].some(r=>!r.hidden); });
    if(t){ keys.open=true; ges.open=true; } else { keys.open=!touch||keys.dataset.user==='1'; ges.open=touch||ges.dataset.user==='1'; }
    $id('hlpNone').hidden=n>0;
  });
  [keys,ges].forEach(x=>x.querySelector('summary').addEventListener('click',()=>{ x.dataset.user=x.open?'0':'1'; }));
  if(!touch) setTimeout(()=>{ try{ q.focus({preventScroll:true}); }catch(e){} },30);
}
function hookHelp(){
  const hb=$id('helpBtn'); if(!hb||hb.__lr9) return;
  const o=hb.onclick; hb.onclick=function(ev){ if(typeof o==='function') o.call(hb,ev); setTimeout(enhanceHelp,25); }; hb.__lr9=1;
}

/* ---------- 3. Accessibility names: icon-only buttons, sliders, number boxes, thumbnails ---------- */
const ICON={'✕':'Close','↺':'Reset','‹':'Previous','›':'Next','↶':'Undo','↷':'Redo','⋯':'More','⛶':'Full screen','⊟':'Collapse all sections','?':'Help','☰':'Menu','⌖':'Pick colour','❚❚':'Pause','▶':'Play'};
function a11y(){
  document.querySelectorAll('button:not([aria-label])').forEach(b=>{
    const t=b.textContent.trim(); if(/[A-Za-z0-9]/.test(t)) return;
    let l=(b.title||'').replace(/\s*\([^)]*\)\s*$/,'').trim()||ICON[t]||'';
    if(!l&&b.closest('summary')){ const s=b.closest('summary'); l='Reset '+s.textContent.replace(/[↺▾◂▸]/g,'').trim(); }
    if(l) b.setAttribute('aria-label',l);
  });
  document.querySelectorAll('.sl').forEach(row=>{ const lb=row.querySelector('label'); if(!lb) return; const name=lb.textContent.trim(); if(!name) return;
    row.querySelectorAll('input[type=range]:not([aria-label]),input[type=number]:not([aria-label])').forEach(i=>i.setAttribute('aria-label',name+(i.type==='number'?' value':''))); });
  if(typeof photos!=='undefined') document.querySelectorAll('#grid [data-id] img[alt=""], #filmstrip [data-id] img[alt=""], #filmstrip img[data-id][alt=""]').forEach(img=>{
    const host=img.dataset.id?img:img.closest('[data-id]'); const p=host&&photos.find(x=>String(x.id)===host.dataset.id); if(p&&p.name) img.alt=p.name; });
}
let at=0; const a11ySoon=()=>{ clearTimeout(at); at=setTimeout(()=>{ try{ a11y(); }catch(e){} },250); };

/* ---------- 4. Overlay resync after a photo switch / leaving Develop (defensive) ---------- */
function hookOverlay(){
  const od=window.openDevelop; if(od&&!od.__lr9){ const w=async function(){ const r=await od.apply(this,arguments);
      requestAnimationFrame(()=>{ try{ if(typeof drawOverlay==='function') drawOverlay(); }catch(e){} }); a11ySoon(); return r; };
    w.__lr9=1; window.openDevelop=w; }
  const dev=$id('develop'); if(dev) new MutationObserver(()=>{ if(!dev.classList.contains('on')){ const ov=$id('ov'); if(ov&&ov.width) ov.getContext('2d').clearRect(0,0,ov.width,ov.height); } }).observe(dev,{attributes:true,attributeFilter:['class']});
}

/* ---------- 5. Dialogs: flag long ones so the action row can stick to the bottom ---------- */
function watchDlg(){
  const d=$id('dlg'), m=$id('modal'); if(!d||!m) return;
  const upd=()=>{ if(m.hidden) return; d.classList.toggle('dlgLong',d.scrollHeight>d.clientHeight+4); a11ySoon(); };
  new MutationObserver(()=>requestAnimationFrame(upd)).observe(d,{childList:true});
  new MutationObserver(()=>requestAnimationFrame(upd)).observe(m,{attributes:true,attributeFilter:['hidden']});
  addEventListener('resize',()=>requestAnimationFrame(upd));
}

/* ---------- 6. Keep our own buttons clear of the injected "Powered by Netlify" badge on phones ---------- */
function badgeCheck(){ const on=!!document.getElementById('nl-badge-frame'); if(document.body.classList.contains('nlBadge')!==on) document.body.classList.toggle('nlBadge',on); }

function init(){
  try{ buildQuickMore(); }catch(e){ console.warn('lr9 quick',e); }
  try{ hookHelp(); }catch(e){ console.warn('lr9 help',e); }
  try{ hookOverlay(); }catch(e){ console.warn('lr9 overlay',e); }
  try{ watchDlg(); }catch(e){ console.warn('lr9 dlg',e); }
  try{ a11y(); }catch(e){ console.warn('lr9 a11y',e); }
  new MutationObserver(a11ySoon).observe(document.body,{childList:true,subtree:true});
  badgeCheck(); new MutationObserver(badgeCheck).observe(document.body,{childList:true});
  window.__lr9={ready:true,a11y,enhanceHelp,SECONDARY};
}
if(document.readyState==='loading') addEventListener('DOMContentLoaded',()=>setTimeout(init,120)); else setTimeout(init,120);
})();
