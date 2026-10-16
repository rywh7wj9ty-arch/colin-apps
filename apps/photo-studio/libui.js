/* ===== Library layout: slim top bar, collapsible Filter panel, sidebar, ⋯ More menu ===== */
addEventListener("DOMContentLoaded",()=>{ (function(){
const fb=document.querySelector('#library .filterbar'); if(!fb||document.getElementById('libTop')) return;
const lib=document.getElementById('library'), grid=document.getElementById('grid');
const LS=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v==='1'; }catch(e){ return d; } };
const SV=(k,v)=>{ try{ localStorage.setItem(k,v?'1':'0'); }catch(e){} };
const mk=(tag,props,html)=>{ const e=document.createElement(tag); Object.assign(e,props||{}); if(html!=null) e.innerHTML=html; return e; };
const byId=id=>document.getElementById(id);
fb.classList.add('libOld');

/* --- top bar --- */
const top=mk('div',{id:'libTop',className:'libTop'});
const sideBtn=mk('button',{type:'button',className:'btn icon',id:'libSideBtn',title:'Collections & projects (Shift+L)'},'☰');
const filtBtn=mk('button',{type:'button',className:'btn',id:'libFiltBtn',title:'Filters (Shift+F)'},'<span class="fic">⏷</span> Filter<b id="libFiltBadge" class="badge" hidden></b>');
const clr=mk('button',{type:'button',className:'clearPill',id:'libFiltClear',title:'Clear all filters',hidden:true},'✕ Clear');
const ctx=mk('span',{id:'libCtx',className:'libCtx'});
const sp=mk('span',{className:'sp'});
const moreBtn=mk('button',{type:'button',className:'btn',id:'libMoreBtn',title:'More library actions'},'⋯ More');
top.append(sideBtn,filtBtn,clr);
['fSearch','fSort'].forEach(id=>{ const e=byId(id); if(e) top.appendChild(e); });
if(byId('fSearch')) byId('fSearch').placeholder='Search… (dog iso>800 rating>=3)'; setTimeout(()=>{ byId('fSearch').placeholder='Search… e.g. dog iso>800'; },500);
const tsz=fb.querySelector('.thumbSz'); if(tsz) top.appendChild(tsz);
top.append(ctx,sp);
['tagStatus','libCount'].forEach(id=>{ const e=byId(id); if(e) top.appendChild(e); });
top.appendChild(moreBtn);

/* --- filter panel --- */
const fp=mk('div',{id:'libFilters',className:'libFilters'});
const row=(label,ids)=>{ const r=mk('div',{className:'fRow'}); r.appendChild(mk('span',{className:'fLbl'},label)); ids.forEach(id=>{ const e=byId(id); if(e) r.appendChild(e); }); if(r.children.length>1) fp.appendChild(r); };
row('Flag',['flagChips','fFlag']); row('Rating',['fRating']); row('Colour',['fLabel']); row('Camera',['exFilters']);
const kwRow=mk('div',{className:'fRow',id:'libKwRow'}); kwRow.appendChild(mk('span',{className:'fLbl'},'Keywords')); const kwChips=mk('span',{className:'kwChips',id:'libKwChips'}); kwRow.appendChild(kwChips); fp.appendChild(kwRow);
const fpFoot=mk('div',{className:'fRow fFoot'}); const clr2=mk('button',{type:'button',className:'btn',id:'libFiltClear2'},'Clear filters'); fpFoot.appendChild(clr2); fp.appendChild(fpFoot);

/* --- sidebar --- */
const side=mk('aside',{id:'libSide',className:'libSide'});
side.innerHTML='<div class="sdHead"><b>Library</b><button type="button" class="btn icon" id="libSideClose" title="Close">✕</button></div><div class="sdSec"><div class="sdT">Collections</div><div id="sdColl" class="sdList"></div></div><div class="sdSec"><div class="sdT">Projects</div><div id="sdProj" class="sdList"></div></div><div class="sdSec"><div class="sdT">Organise</div><div id="sdBtns" class="sdBtns"></div></div><div class="sdSec" id="sdSelects"></div>';
const body=mk('div',{id:'libBody',className:'libBody'}); const back=mk('div',{id:'libSideBack',className:'libSideBack'});
grid.before(body); body.append(side,back,grid);
const sdBtns=side.querySelector('#sdBtns');
[['qcBtn','▣ Quick Collection'],['smartBtn','✦ Smart collection…'],['kwListBtn','🏷 Keyword List'],['mapBtn','🗺 Map']].forEach(([id,t])=>{ const e=byId(id); if(e){ e.dataset.label=e.textContent; sdBtns.appendChild(e); }});
['fColl','fProj'].forEach(id=>{ const e=byId(id); if(e) side.querySelector('#sdSelects').appendChild(e); }); side.querySelector('#sdSelects').hidden=true;
function listFrom(selId,host){
  const s=byId(selId); if(!s){ host.closest('.sdSec').hidden=true; return; }
  host.innerHTML='';
  [...s.options].forEach(o=>{ const act=o.value.startsWith('__')&&o.value!=='__quick';
    const b=mk('button',{type:'button',className:'sdItem'+(act?' act':'')+(!act&&s.value===o.value?' on':'')},''); b.textContent=o.textContent; b.dataset.v=o.value;
    b.onclick=()=>{ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); s.dispatchEvent(new Event('input',{bubbles:true})); setTimeout(()=>{ refreshSide(); updBadge(); if(innerWidth<820&&!act) setSide(false); },30); };
    host.appendChild(b); });
}
function refreshSide(){ listFrom('fColl',side.querySelector('#sdColl')); listFrom('fProj',side.querySelector('#sdProj')); }
['fColl','fProj'].forEach(id=>{ const s=byId(id); if(s){ new MutationObserver(refreshSide).observe(s,{childList:true,subtree:true,characterData:true}); s.addEventListener('change',()=>setTimeout(refreshSide,30)); }});

/* --- More menu --- */
const menu=mk('div',{id:'libMore',className:'libMore',hidden:true});
const GROUPS=[['View',['surveyBtn','compareBtn','slideBtn']],['Selection',['selAll','delSel']],['Edit',['syncBtn','qdBtn','matchExpLib','enhanceLib','mergeBtn','mdBtn','infoBtn','renameBtn']],['Organise',['cullBtn','stackBtn','stackCollapseLbl','dupBtn','retagBtn','autoTagLbl']],['Output',['csBtn','bakBtn']]];
GROUPS.forEach(([t,ids])=>{ const g=mk('div',{className:'mGrp'}); g.appendChild(mk('div',{className:'mT'},t)); ids.forEach(id=>{ const e=byId(id); if(e) g.appendChild(e); }); if(g.children.length>1) menu.appendChild(g); });
const other=mk('div',{className:'mGrp',id:'libMoreOther'}); other.appendChild(mk('div',{className:'mT'},'Other'));
function sweep(){ // anything other scripts (or future rounds) add to the old filter bar lands in More → Other
  [...fb.children].forEach(e=>{ if(e.classList.contains('sp')||(e.tagName==='SPAN'&&!e.id&&!e.children.length)) return; other.appendChild(e); });
  if(other.children.length>1&&!other.parentNode) menu.appendChild(other);
}
sweep(); new MutationObserver(sweep).observe(fb,{childList:true});
document.body.appendChild(menu);
function placeMenu(){ const r=moreBtn.getBoundingClientRect(); menu.style.top=Math.round(r.bottom+4)+'px'; menu.style.right=Math.max(6,Math.round(innerWidth-r.right))+'px'; menu.style.maxHeight=Math.round(innerHeight-r.bottom-14)+'px'; }
const setMenu=o=>{ menu.hidden=!o; moreBtn.classList.toggle('on',o); if(o) placeMenu(); };
moreBtn.onclick=e=>{ e.stopPropagation(); setMenu(menu.hidden); };
menu.addEventListener('click',e=>{ if(e.target.closest('button')) setTimeout(()=>setMenu(false),0); });
document.addEventListener('click',e=>{ if(!menu.hidden&&!menu.contains(e.target)&&e.target!==moreBtn) setMenu(false); });
addEventListener('resize',()=>{ if(!menu.hidden) placeMenu(); });

lib.insertBefore(top,fb); top.after(fp); fb.hidden=true;

/* --- toggles --- */
function setFilt(o,save=true){ lib.classList.toggle('filtOpen',o); filtBtn.classList.toggle('on',o); if(save) SV('ps.libFilters',o); }
function setSide(o,save=true){ lib.classList.toggle('sideOpen',o); sideBtn.classList.toggle('on',o); if(save) SV('ps.libSidebar',o); if(o) refreshSide(); }
window.libToggleFilters=o=>setFilt(o==null?!lib.classList.contains('filtOpen'):!!o);
window.libToggleSidebar=o=>setSide(o==null?!lib.classList.contains('sideOpen'):!!o);
filtBtn.onclick=()=>window.libToggleFilters(); sideBtn.onclick=()=>window.libToggleSidebar();
sdBtns.addEventListener('click',e=>{ if(e.target.closest('button')&&innerWidth<820) setTimeout(()=>setSide(false),0); }); side.querySelector('#libSideClose').onclick=()=>setSide(false); back.onclick=()=>setSide(false);
setFilt(LS('ps.libFilters',false),false); setSide(LS('ps.libSidebar',false),false);
addEventListener('keydown',e=>{
  if(typeof mode!=='undefined'&&mode!=='library') return;
  const t=e.target; if(t&&(t.tagName==='INPUT'&&!/^(checkbox|range|radio|button)$/.test(t.type)||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable)) return;
  if(!byId('modal')?.hidden) return;
  if(e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey){ const k=e.key.toLowerCase();
    if(k==='f'){ e.preventDefault(); e.stopImmediatePropagation(); window.libToggleFilters(); }
    else if(k==='l'){ e.preventDefault(); e.stopImmediatePropagation(); window.libToggleSidebar(); } }
  else if(e.key==='Escape'&&!menu.hidden){ setMenu(false); }
},true);

/* --- active filter count, clear, keyword chips --- */
const FILTERS=[['fRating','0'],['fFlag','all'],['fLabel','all'],['fCam',''],['fLens',''],['fIso',''],['fFrom',''],['fTo','']];
function activeFilters(){ let n=0; FILTERS.forEach(([id,d])=>{ const e=byId(id); if(e&&e.value!==''&&e.value!==d) n++; }); return n; }
function updBadge(){
  const n=activeFilters(), q=(byId('fSearch')?.value||'').trim();
  const badge=byId('libFiltBadge'); badge.textContent=n; badge.hidden=!n; filtBtn.classList.toggle('active',n>0);
  clr.hidden=!(n||q); clr.textContent=n&&q?`✕ Clear (${n}+search)`:n?`✕ Clear ${n}`:'✕ Clear search';
  const parts=[]; const c=byId('fColl'), p=byId('fProj');
  if(c&&c.value&&!c.value.startsWith('__new')) parts.push(c.options[c.selectedIndex]?.textContent||''); if(p&&p.value&&!p.value.startsWith('__')) parts.push('📁 '+(p.options[p.selectedIndex]?.textContent||''));
  ctx.textContent=parts.join(' · '); ctx.hidden=!parts.length;
  [...kwChips.children].forEach(ch=>ch.classList.toggle('on',q.split(/\s+/).includes(ch.dataset.k)));
}
function clearAll(){
  FILTERS.forEach(([id,d])=>{ const e=byId(id); if(e&&e.value!==d){ e.value=d; e.dispatchEvent(new Event('change',{bubbles:true})); e.dispatchEvent(new Event('input',{bubbles:true})); } });
  const s=byId('fSearch'); if(s&&s.value){ s.value=''; s.dispatchEvent(new Event('input',{bubbles:true})); }
  if(typeof renderLibrary==='function') renderLibrary(); updBadge();
}
clr.onclick=clearAll; clr2.onclick=clearAll;
fp.addEventListener('change',()=>setTimeout(updBadge,0)); fp.addEventListener('click',()=>setTimeout(updBadge,0)); fp.addEventListener('input',()=>setTimeout(updBadge,0));
byId('fSearch')?.addEventListener('input',updBadge);
function kwStats(){ const m=new Map(); (typeof photos!=='undefined'?photos:[]).forEach(p=>{ const all=[...(p.keywords||[]),...((p.autoKw||p.autoTags||[]).map(x=>typeof x==='string'?x:x&&(x.k||x.label||x.name)))]; new Set(all.filter(Boolean).map(s=>String(s).toLowerCase())).forEach(k=>m.set(k,(m.get(k)||0)+1)); }); return [...m].sort((a,b)=>b[1]-a[1]).slice(0,24); }
function refreshKw(){ const st=kwStats(); kwRow.hidden=!st.length; kwChips.innerHTML=''; st.forEach(([k,n])=>{ if(/\s/.test(k)) return; const b=mk('button',{type:'button',className:'chip'}); b.dataset.k=k; b.textContent=`${k} ${n}`;
  b.onclick=()=>{ const s=byId('fSearch'); let w=s.value.trim().split(/\s+/).filter(Boolean); w=w.includes(k)?w.filter(x=>x!==k):[...w,k]; s.value=w.join(' '); s.dispatchEvent(new Event('input',{bubbles:true})); updBadge(); };
  kwChips.appendChild(b); }); updBadge(); }
if(typeof window.renderLibrary==='function'){ const orig=window.renderLibrary; let t=0; window.renderLibrary=function(){ const r=orig.apply(this,arguments); clearTimeout(t); t=setTimeout(()=>{ if(lib.classList.contains('filtOpen')) refreshKw(); else updBadge(); },60); return r; }; }
filtBtn.addEventListener('click',()=>{ if(lib.classList.contains('filtOpen')) refreshKw(); });
refreshSide(); refreshKw(); if(lib.classList.contains('filtOpen')) refreshKw();
})(); });
