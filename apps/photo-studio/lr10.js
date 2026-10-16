/* ===== Round 10am (2026-10-16): desktop tool row never wraps (overflow ⋯ that collects the least-used
   tools when the window is narrow), Proof dropdown sized to its choice (no truncation), iPhone tool row
   puts Crop / Heal / Mask first, shorter placeholders that don't get cut off ===== */
(function(){
const $id=id=>document.getElementById(id);
const touch=(typeof isTouch!=='undefined'&&isTouch)||matchMedia('(pointer:coarse)').matches;
const api=window.__lr10={ready:false};

/* ---------- 1. Proof dropdown: width follows the selected label, so "Adobe RGB-ish" etc. are never cut ---------- */
let ctx2=null;
function fitProof(){
  const ps=$id('proofSel'); if(!ps) return;
  const o=ps.options[ps.selectedIndex]; const txt=o?o.text:'';
  const ti=(o&&ps.value?o.text+' — ':'')+'Soft proofing: simulate export colour space or print paper (browser approximation)';
  if(ps.title!==ti) ps.title=ti;
  if(ps.closest('#vtMore')){ ps.style.removeProperty('width'); return; }
  const cs=getComputedStyle(ps);
  if(!ctx2) ctx2=document.createElement('canvas').getContext('2d');
  ctx2.font=`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const pad=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0)+(parseFloat(cs.borderLeftWidth)||0)*2;
  const w=Math.ceil(ctx2.measureText(txt).width+pad+26); // + native arrow
  const px=Math.max(84,Math.min(240,w))+'px'; if(ps.style.width!==px) ps.style.setProperty('width',px,'important');
  if(!ps.classList.contains('fitw')) ps.classList.add('fitw');
}

/* ---------- 2. Desktop tool row: one line at any width; extra tools move into a ⋯ popover ---------- */
// first entry is moved out first. Each entry is a list of ids that move together.
const PRIORITY=[['autoSyncBtn'],['refBtn'],['proofSel','proofWarnL'],['tatBtn'],['clipBtn'],['wbBtn'],['fsBtn'],['cmpBtn'],['devStars'],['zoomBtn']];
let vt,btn,pop,anchors=new Map(),busy=false,mo=null;
function build(){
  vt=document.querySelector('.vtools'); if(!vt||$id('vtMoreBtn')) return false;
  btn=document.createElement('button'); btn.type='button'; btn.className='btn vtMoreBtn'; btn.id='vtMoreBtn'; btn.textContent='⋯';
  btn.title='More tools'; btn.setAttribute('aria-label','More tools'); btn.setAttribute('aria-haspopup','true'); btn.setAttribute('aria-expanded','false'); btn.setAttribute('aria-controls','vtMore'); btn.hidden=true;
  pop=document.createElement('div'); pop.id='vtMore'; pop.className='vtMore'; pop.hidden=true; pop.setAttribute('role','group'); pop.setAttribute('aria-label','More tools');
  const ur=$id('vtUR'); if(ur&&ur.parentNode===vt) ur.before(btn); else vt.appendChild(btn);
  document.body.appendChild(pop);
  PRIORITY.flat().forEach(id=>{ const el=$id(id); if(el&&el.parentNode===vt){ const a=document.createComment('vt:'+id); el.before(a); anchors.set(id,a); } });
  btn.onclick=e=>{ e.stopPropagation(); setOpen(pop.hidden); };
  document.addEventListener('pointerdown',e=>{ if(!pop.hidden&&!pop.contains(e.target)&&e.target!==btn) setOpen(false); },true);
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!pop.hidden){ setOpen(false); btn.focus(); } });
  // a button tapped in the popover does its job, then the popover closes (selects/checkboxes stay open)
  pop.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) setTimeout(()=>{ setOpen(false); markActive(); },0); });
  pop.addEventListener('change',()=>{ markActive(); fitProof(); });
  addEventListener('resize',schedule);
  if(window.ResizeObserver){ let lw=0; new ResizeObserver(en=>{ const w=Math.round(en[0].contentRect.width); if(w!==lw){ lw=w; schedule(); } }).observe(vt); }
  // only react to real changes (some scripts re-set hidden/class to the same value on a timer)
  mo=new MutationObserver(rs=>{ if(busy) return;
    const real=rs.some(r=>{ if(r.target===btn) return false;
      if(r.type==='attributes') return r.oldValue!==r.target.getAttribute(r.attributeName);
      if(r.type==='childList') return [...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&n!==btn);
      return true; });
    if(real) schedule(); });
  mo.observe(vt,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['hidden','class'],childList:true,characterData:true});
  return true;
}
function setOpen(on){
  if(!pop) return;
  if(on&&!pop.children.length) on=false;
  const was=!pop.hidden; pop.hidden=!on; btn.classList.toggle('on',on); btn.setAttribute('aria-expanded',on?'true':'false');
  if(on){ place(); const f=pop.querySelector('button,select'); if(f&&document.activeElement===btn&&!touch) f.focus({preventScroll:true}); }
  else if(was) schedule();
}
function place(){
  const r=btn.getBoundingClientRect(); const pw=pop.offsetWidth;
  pop.style.left=Math.max(6,Math.min(innerWidth-pw-6,r.right-pw))+'px';
  pop.style.bottom=Math.max(6,innerHeight-r.top+6)+'px';
  pop.style.maxHeight=Math.max(120,r.top-12)+'px'; // short screens (iPhone landscape): scroll inside, never off the top
}
function markActive(){
  if(!btn) return;
  const act=[...pop.querySelectorAll('.btn.on,button.on')].length>0||(pop.contains($id('proofSel'))&&!!$id('proofSel').value);
  btn.classList.toggle('dot',act);
  const names=[...pop.children].map(c=>c.id==='proofSel'?'Proof':c.id==='proofWarnL'?null:(c.textContent||'').trim()).filter(Boolean);
  const ti='More tools'+(names.length?': '+names.join(', '):''); if(btn.title!==ti) btn.title=ti;
}
let raf=0; function schedule(){ if(raf) return; raf=requestAnimationFrame(()=>{ raf=0; relayout(); }); }
function restoreAll(){ PRIORITY.flat().forEach(id=>{ const el=$id(id), a=anchors.get(id); if(el&&a&&a.parentNode===vt&&el.parentNode!==vt) a.after(el); }); }
function fits(){
  const cs=getComputedStyle(vt); const gap=parseFloat(cs.columnGap)||parseFloat(cs.gap)||0;
  const avail=vt.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0);
  const kids=[...vt.children].filter(c=>c.offsetParent!==null&&getComputedStyle(c).display!=='none');
  const need=kids.reduce((s,c)=>{ const st=getComputedStyle(c); return s+c.getBoundingClientRect().width+(parseFloat(st.marginLeft)||0)+(parseFloat(st.marginRight)||0); },0)+gap*Math.max(0,kids.length-1);
  return need<=avail-1;
}
function relayout(){
  if(!vt||!btn) return;
  api.relayouts=(api.relayouts||0)+1;
  if(pop&&!pop.hidden){ place(); markActive(); return; } // never move controls while the popover is in use
  busy=true;
  try{
    const desk=getComputedStyle(vt).flexWrap==='wrap'&&vt.offsetParent!==null;
    restoreAll(); if(!btn.hidden) btn.hidden=true; fitProof();
    if(desk&&!fits()){
      if(btn.hidden) btn.hidden=false;
      // tools that are currently ON (Auto Sync, an active proof, Clip…) stay in the row as long as possible
      const isOn=grp=>grp.some(id=>{ const el=$id(id); return el&&(el.classList.contains('on')||(el.tagName==='SELECT'&&!!el.value)); });
      const order=[...PRIORITY.filter(g=>!isOn(g)),...PRIORITY.filter(isOn)];
      const moved=[];
      for(const grp of order){
        if(fits()) break;
        grp.forEach(id=>{ const el=$id(id); if(el&&el.parentNode===vt) pop.appendChild(el); });
        moved.push(grp);
      }
      // refill: put back anything that fits again (e.g. a wide active Proof went out last, so Compare can return)
      for(const grp of moved.slice(0,-1).reverse()){
        grp.forEach(id=>{ const el=$id(id), a=anchors.get(id); if(el&&a&&el.parentNode!==vt) a.after(el); });
        if(!fits()) grp.forEach(id=>{ const el=$id(id); if(el&&el.parentNode===vt) pop.appendChild(el); });
      }
      // keep popover in the row's order (top = leftmost)
      [...pop.children].sort((a,b)=>{ const A=anchors.get(a.id),B=anchors.get(b.id); return A&&B?(A.compareDocumentPosition(B)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1):0; }).forEach(c=>pop.appendChild(c));
    }
    if(!pop.children.length){ btn.hidden=true; setOpen(false); }
    else if(!pop.hidden) place();
    fitProof(); markActive();
  } finally { if(mo) mo.takeRecords(); busy=false; }
  api.overflow=[...pop.children].map(c=>c.id);
}

/* ---------- 3. Shorter placeholders (the long ones were cut off on iPhone and narrow panels) ---------- */
function placeholders(){
  const q=$id('pfQ'); if(q&&q.placeholder.length>18){ q.title=q.title||'Find a control — e.g. clarity, wb, noise, vignette, colour mixer (press / to focus)'; q.placeholder='Find a control…'; }
  const s=$id('fSearch'); if(s&&(touch||innerWidth<=820)&&s.placeholder.length>9){ s.title=s.title||'Search name, keyword, caption, camera — e.g. dog iso>800 rating>=3'; s.placeholder='Search…'; }
}

/* ---------- 4. close the popover when leaving Develop; refit on entering ---------- */
function hookMode(){
  const sm=window.setMode; if(typeof sm!=='function'||sm.__lr10) return;
  const w=function(m){ const r=sm.apply(this,arguments); if(m!=='develop') setOpen(false); else setTimeout(schedule,30); return r; };
  w.__lr10=true; window.setMode=w; try{ setMode=w; }catch(e){}
}

function init(){
  build(); hookMode(); placeholders(); setTimeout(placeholders,700);
  const ps=$id('proofSel'); if(ps) ps.addEventListener('change',()=>{ fitProof(); schedule(); });
  relayout(); setTimeout(relayout,400);
  api.relayout=relayout; api.setOpen=setOpen; api.ready=true;
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0)); else setTimeout(init,0);
})();
