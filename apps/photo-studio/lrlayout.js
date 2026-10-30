/* ===== Lightroom Classic layout (panel order, left panel, tool strip) + press-and-hold Original on the photo ===== */
(function(){
const $id=id=>document.getElementById(id);
const LEFT=['Presets','Snapshots','History'];
const RIGHT=['Crop & Rotate','Spot Removal','Red-eye','Masks',
 'Basic','Tone Curve','Colour Mixer','Point Color','Colour Grading',
 'Detail','Lens & Transform','Lens Blur','Effects','Calibration',
 // Photo Studio extras (not in Lightroom) follow the Lightroom panels
 'Colour Rendering','Selective Tone','Smart Lighting','B&W Mixer','Colour Wheel',
 'Control Points','ViewPoint','Film Emulation','✨ AI Assist','Metadata'];
const title=d=>((d.querySelector('summary')||d).textContent||'').replace('↺','').trim();
const rank=(list,t)=>{ const i=list.findIndex(n=>t.startsWith(n)); return i<0?999:i; };
const wide=()=>matchMedia('(min-width:1000px)').matches;
let busy=false;
function lpanel(){ let lp=$id('lpanel'); if(!lp){ lp=document.createElement('aside'); lp.id='lpanel';
  lp.innerHTML='<div class="lpHead">Navigator</div><div id="lpNav"></div><div id="lpSecs"></div>';
  const dev=$id('develop'); dev.insertBefore(lp,dev.firstChild); } return lp; }
function arrange(){ const secs=$id('sections'); if(!secs||busy) return; busy=true;
 try{
  const lp=lpanel(), ls=$id('lpSecs'), useLeft=wide();
  lp.hidden=!useLeft; document.body.classList.toggle('lrLeft',useLeft);
  const all=[...secs.children,...ls.children].filter(d=>d.tagName==='DETAILS');
  const left=all.filter(d=>rank(LEFT,title(d))<999).sort((a,b)=>rank(LEFT,title(a))-rank(LEFT,title(b)));
  const right=all.filter(d=>rank(LEFT,title(d))===999).sort((a,b)=>rank(RIGHT,title(a))-rank(RIGHT,title(b)));
  const want=useLeft?right:[...right,...left];
  if(useLeft) left.forEach(d=>{ if(d.parentNode!==ls||d!==ls.children[left.indexOf(d)]) ls.appendChild(d); });
  want.forEach((d,i)=>{ if(secs.children[i]!==d) secs.insertBefore(d,secs.children[i]||null); });
  // Navigator thumbnail lives top-left in LR
  const nav=$id('navBox'), ln=$id('lpNav');
  if(nav){ if(useLeft&&nav.parentNode!==ln){ ln.appendChild(nav); nav.classList.add('inLeft'); }
    else if(!useLeft&&nav.parentNode===ln){ $id('stage').appendChild(nav); nav.classList.remove('inLeft'); } }
  strip();
 }catch(e){ console.warn('lrlayout',e); } finally{ setTimeout(()=>busy=false,0); } }
function strip(){ if($id('lrStrip')) return; const h=document.querySelector('#panel .histo'); if(!h) return;
 const s=document.createElement('div'); s.id='lrStrip'; s.setAttribute('role','toolbar'); s.setAttribute('aria-label','Tool strip');
 const T=[['Crop','cropBtn','⛶ Crop'],['Spot Removal / Heal','healBtn','✚ Heal'],['Red Eye','','◉ Red Eye'],['Masking','maskBtn','◍ Mask']];
 T.forEach(([t,id,l])=>{ const b=document.createElement('button'); b.className='btn'; b.textContent=l; b.title=t; b.dataset.for=id;
  b.onclick=()=>{ if(id){ $id(id)?.click(); }
   else{ const d=[...document.querySelectorAll('details')].find(x=>title(x).startsWith('Red-eye')); if(d){ d.open=true; d.scrollIntoView({block:'start',behavior:'smooth'}); } } };
  s.appendChild(b); });
 h.after(s);
 setInterval(()=>s.querySelectorAll('button[data-for]').forEach(b=>{ const t=b.dataset.for&&$id(b.dataset.for); b.classList.toggle('on',!!(t&&t.classList.contains('on'))); }),400);
}
/* ---- press-and-hold on photo = Original ---- */
function holdPreview(){ const st=$id('stage'); if(!st||st._lrHold) return; st._lrHold=1;
 let tm=null, held=false, sx=0, sy=0, pid=null; const pts=new Set();
 const toolActive=()=>{ try{ if(typeof tool!=='undefined'&&tool) return true; if(typeof cropOn!=='undefined'&&cropOn) return true; }catch(e){}
   return !!document.querySelector('#cropBtn.on,#healBtn.on,#maskBtn.on,#tatBtn.on,#wbBtn.on,#cmpBtn.on,#baSplitBtn.on'); };
 const lbl=$id('baLabel'); let oldTxt='';
 const end=()=>{ clearTimeout(tm); tm=null; if(held){ held=false; setBefore(false); if(lbl){ lbl.textContent=oldTxt||lbl.textContent; lbl.classList.remove('lrHold'); } } pid=null; };
 st.addEventListener('pointerdown',e=>{ pts.add(e.pointerId);
  if(pts.size>1){ end(); return; }               // pinch → never preview
  if(e.button>0||toolActive()||(typeof beforeOn!=='undefined'&&beforeOn)||(typeof mode!=='undefined'&&mode!=='develop')) return;
  if(e.target.closest('#cropBox,#navBox,#cmpLabels,button,input,select')) return;
  sx=e.clientX; sy=e.clientY; pid=e.pointerId;
  tm=setTimeout(()=>{ tm=null; if(pts.size!==1||toolActive()) return; held=true; if(lbl){ oldTxt=lbl.textContent; lbl.textContent='Original'; lbl.classList.add('lrHold'); } setBefore(true); },150);
 },true);
 st.addEventListener('pointermove',e=>{ if(e.pointerId!==pid||!tm) return; if(Math.hypot(e.clientX-sx,e.clientY-sy)>8){ clearTimeout(tm); tm=null; } },true);
 const up=e=>{ pts.delete(e.pointerId); if(e.pointerId===pid||pts.size===0) end(); };
 ['pointerup','pointercancel','lostpointercapture'].forEach(t=>st.addEventListener(t,up,true));
 st.addEventListener('pointerleave',e=>{ if(e.target===st&&e.pointerType==='mouse') up(e); });
 addEventListener('blur',()=>{ pts.clear(); end(); });
 st.addEventListener('contextmenu',e=>{ if(held||tm) e.preventDefault(); });
 window.__lrHold={isHeld:()=>held};
}
function init(){ arrange(); holdPreview();
 const secs=$id('sections'); if(secs) new MutationObserver(()=>{ if(!busy) setTimeout(arrange,30); }).observe(secs,{childList:true});
 let rt; addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(arrange,150); });
 window.lrArrange=arrange; }
if(document.readyState==='complete') setTimeout(init,300); else addEventListener('load',()=>setTimeout(init,300));
})();
