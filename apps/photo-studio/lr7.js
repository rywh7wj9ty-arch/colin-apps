'use strict';
/* Lightroom round 7: Soft Proofing colour spaces (sRGB / Display P3 / Adobe RGB-ish) + paper modes,
   Range Mask refine on AI/brush/linear/radial masks, Sharpening Masking visualize (Alt-drag),
   History → Before anchor for Compare/Original, Auto Sync respects Copy Settings groups,
   Export colour-space option. */
addEventListener('DOMContentLoaded',()=>{
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const findSec=t=>[...$$('#sections details.sec')].find(d=>(d.querySelector('summary')?.textContent||'').startsWith(t));
const selected=()=>photos.filter(p=>sel.has(p.id));
window.__lr7={};

/* ===== 1. Soft Proofing — colour spaces + paper (extends dxo2 proofSel) ===== */
(function(){
  const ps=$('#proofSel'); if(!ps) return;
  const cur=ps.value;
  ps.innerHTML=`<option value="">Proof: off</option>
    <optgroup label="Colour space">
      <option value="srgb">Proof: sRGB</option>
      <option value="p3">Proof: Display P3</option>
      <option value="adobergb">Proof: Adobe RGB-ish</option>
    </optgroup>
    <optgroup label="Paper / web">
      <option value="web">Proof: web / paper-white</option>
      <option value="glossy">Proof: print glossy</option>
      <option value="matte">Proof: print matte</option>
    </optgroup>`;
  if([...ps.options].some(o=>o.value===cur)) ps.value=cur;
  ps.title='Soft proofing — simulate export colour space or print paper (browser approximation)';
  // ensure gamut warning defaults on when enabling a colour-space proof
  const base=ps.onchange;
  ps.onchange=e=>{ if(ps.value&&['srgb','p3','adobergb'].includes(ps.value)){ const w=$('#proofWarn'); if(w&&!w.checked){ w.checked=true; } } if(typeof base==='function') base.call(ps,e); else { window.proofMode=ps.value||null; window.proofWarn=!!$('#proofWarn')?.checked; $('#proofWarnL').hidden=!ps.value; schedule(true); $('#stage').classList.toggle('proofing',!!ps.value); } };
  // badge under stage
  let badge=$('#proofBadge'); if(!badge){ badge=document.createElement('div'); badge.id='proofBadge'; badge.hidden=true; $('#stage').appendChild(badge); }
  const lab={srgb:'Soft proof · sRGB',p3:'Soft proof · Display P3',adobergb:'Soft proof · Adobe RGB',web:'Soft proof · Web',glossy:'Soft proof · Glossy',matte:'Soft proof · Matte'};
  const syncBadge=()=>{ const m=window.proofMode; badge.hidden=!m; badge.textContent=(lab[m]||'Soft proof')+(window.proofWarn?' · gamut ⚠':''); };
  const up=()=>{ const f=ps.onchange; /* already bound */ syncBadge(); };
  ps.addEventListener('change',syncBadge); $('#proofWarn')?.addEventListener('change',syncBadge); syncBadge();
  // tuck proof select into More on very narrow toolbars? keep in vtools — already compact
  window.__lr7.proof=()=>window.proofMode;
})();

/* ===== 2. Range Mask refine (Lightroom-style) on selected mask ===== */
(function(){
  const edit=$('#mEdit'); if(!edit) return;
  const box=document.createElement('div'); box.id='rmBox'; box.hidden=true;
  box.innerHTML=`<div class="sub">Range Mask</div>
    <div class="row rmRow"><label for="rmType">Refine</label>
      <select id="rmType"><option value="none">None</option><option value="luma">Luminance</option><option value="color">Colour</option></select>
      <button class="btn" id="rmPick" hidden title="Sample from the photo">⌖</button></div>
    <div id="rmSl"></div>
    <div class="hint">Intersect the selected mask with a luminance or colour range (like Lightroom’s Range Mask). Uses the existing mask pipeline.</div>`;
  // place after brush/adj or at end of mEdit
  edit.appendChild(box);
  const host=$('#rmSl');
  let syncing=false;
  const RM_ID='__rangeMask';
  const getRM=m=>(m.parts||[]).find(p=>p.id===RM_ID||p._rm);
  function ensureRM(m,type){
    m.parts=m.parts||[]; let p=getRM(m);
    if(type==='none'){ if(p){ m.parts=m.parts.filter(x=>x!==p); } return null; }
    if(p&&p.type!==type){ m.parts=m.parts.filter(x=>x!==p); p=null; }
    if(!p){ p=Object.assign(window.newMaskOf?newMaskOf(type):{type,range:type==='luma'?{lo:0,hi:100,feather:50}:{pts:[],amt:50},geo:{},strokes:[],invert:false},
      {id:RM_ID,op:'int',name:'Range Mask',_rm:1}); m.parts.push(p); }
    return p;
  }
  function syncRM(){
    const m=typeof selMask==='function'?selMask():null; box.hidden=!m; if(!m) return;
    syncing=true; const p=getRM(m); const t=p?p.type:'none'; $('#rmType').value=t==='color'?'color':t==='luma'?'luma':'none';
    host.innerHTML=''; $('#rmPick').hidden=t==='none';
    if(t==='luma'){ const R=p.range;
      slider(host,'Low',()=>R.lo,(s,v)=>{ R.lo=Math.min(v,R.hi); },0,100,1,'linear-gradient(90deg,#000,#fff)','Range Mask low');
      slider(host,'High',()=>R.hi,(s,v)=>{ R.hi=Math.max(v,R.lo); },0,100,1,'linear-gradient(90deg,#000,#fff)','Range Mask high');
      slider(host,'Smoothness',()=>R.feather,(s,v)=>{ R.feather=v; },0,100,1,null,'Range Mask smoothness'); }
    if(t==='color'){ const R=p.range; const sw=(R.pts||[]).map((c,i)=>`<span class="swatch" data-i="${i}" style="background:rgb(${c.map(Math.round)})" title="Remove"></span>`).join('');
      host.innerHTML=`<div class="row"><span class="sw">${sw||'<small>No colours — tap ⌖ then the photo</small>'}</span></div>`;
      slider(host,'Amount',()=>R.amt,(s,v)=>{ R.amt=v; },0,100,1,null,'Range Mask amount');
      host.querySelectorAll('.swatch').forEach(s=>s.onclick=()=>{ R.pts.splice(+s.dataset.i,1); schedule(true); commit('Range Mask colour'); syncRM(); }); }
    host.querySelectorAll('.sl input[type=range]').forEach(r=>r.addEventListener('input',()=>schedule()));
    syncing=false;
  }
  $('#rmType').onchange=()=>{ if(syncing||!S) return; const m=selMask(); if(!m) return; const t=$('#rmType').value;
    ensureRM(m,t); if(t==='color'&&window.setPTool){ const p=getRM(m); if(p&&!(p.range.pts||[]).length){ /* wait for pick */ } }
    if(window.syncRange) try{syncRange();}catch(_){} syncRM(); schedule(true); commit(t==='none'?'Clear Range Mask':'Range Mask: '+(t==='luma'?'Luminance':'Colour'));
    if(t==='color'||t==='luma') toast('Range Mask: adjust the refine, or ⌖ to sample',1600); };
  $('#rmPick').onclick=()=>{ const m=selMask(); if(!m) return;
    let typ=$('#rmType').value; if(typ==='none'){ typ='color'; $('#rmType').value='color'; ensureRM(m,'color'); }
    let p=ensureRM(m,typ); window.__rmPick=p;
    if(window.setSelPart) setSelPart(RM_ID); if(window.syncRange) try{syncRange();}catch(_){}
    if(window.setPTool) setPTool('pick');
    toast(p.type==='color'?'Tap colours to refine the mask':'Tap a brightness to centre the luminance range',2000);
  };
  // After each pick, refresh Range Mask UI
  { const st=$('#stage'); st.addEventListener('pointerup',()=>{ if(!window.__rmPick) return; setTimeout(()=>{ try{ syncRM(); if(window.syncRange) syncRange(); }catch(_){} },30); }); }
  const _spt=window.setPTool; if(_spt) window.setPTool=function(t){ const r=_spt.apply(this,arguments);
    if(t==='pick'&&window.__rmPick){ if(window.setSelPart) setSelPart(RM_ID); const btn=$(`#partList [data-p="${RM_ID}"]`); if(btn) btn.click(); }
    if(t!=='pick') window.__rmPick=null; return r; };
  const baseSync=window.syncMaskUI; window.syncMaskUI=function(){ baseSync&&baseSync(); try{ syncRM(); }catch(e){ console.warn(e); } };
  syncers.push(()=>{ if(selMask()) syncRM(); });
  window.__lr7.rangeMask=getRM;
})();

/* ===== 3. Sharpening / Masking visualize (Alt-drag or hold on Amount / Masking) ===== */
(function(){
  const de=findSec('Detail'); if(!de) return;
  const tip=document.createElement('div'); tip.className='hint'; tip.id='shVisTip';
  tip.textContent='Tip: hold Alt (⌥) while dragging Amount or Masking to see the sharpening mask (white = sharpened). On touch, hold the 👁 button.';
  const maskRow=[...de.querySelectorAll('.sl')].find(r=>(r.querySelector('label')?.textContent||'').trim()==='Masking');
  const amtRow=[...de.querySelectorAll('.sl')].find(r=>(r.querySelector('label')?.textContent||'').trim()==='Amount');
  if(maskRow) maskRow.after(tip); else de.appendChild(tip);
  // touch / always-available toggle
  const row=document.createElement('div'); row.className='row'; row.style.marginTop='4px';
  row.innerHTML=`<button class="btn" id="shVisBtn" title="Show sharpening mask (like Alt-drag in Lightroom)">👁 Masking</button>`;
  tip.before(row);
  let held=false;
  function setVis(on){ window.sharpVis=!!on; $('#shVisBtn').classList.toggle('on',!!on); $('#stage').classList.toggle('sharpVis',!!on); schedule(true); }
  window.setSharpVis=setVis;
  $('#shVisBtn').onpointerdown=e=>{ e.preventDefault(); held=true; setVis(true); };
  const up=()=>{ if(held){ held=false; setVis(false); } };
  addEventListener('pointerup',up); addEventListener('pointercancel',up);
  $('#shVisBtn').onclick=e=>{ if(held) return; setVis(!window.sharpVis); };
  function bindAlt(row){ if(!row) return; const rng=row.querySelector('input[type=range]'); if(!rng) return;
    const go=e=>{ if(e.altKey||held) setVis(true); };
    let eAlt=false;
    rng.addEventListener('pointerdown',e=>{ eAlt=e.altKey; if(e.altKey) setVis(true); });
    rng.addEventListener('input',e=>{ if(e.altKey||eAlt) setVis(true); });
    rng.addEventListener('pointerup',()=>{ eAlt=false; if(!held&&!$('#shVisBtn').classList.contains('on')) setVis(false); });
    rng.addEventListener('pointercancel',()=>{ eAlt=false; if(!held&&!$('#shVisBtn').classList.contains('on')) setVis(false); });
  }
  bindAlt(amtRow); bindAlt(maskRow);
  // Alt key alone while over Detail also works with keydown on range focus
  addEventListener('keydown',e=>{ if(e.key!=='Alt'||mode!=='develop') return; const a=document.activeElement; if(a&&a.matches('input[type=range]')&&(amtRow?.contains(a)||maskRow?.contains(a))) setVis(true); });
  addEventListener('keyup',e=>{ if(e.key==='Alt'&&!held&&!$('#shVisBtn').classList.contains('on')) setVis(false); });
  window.__lr7.sharpVis=()=>!!window.sharpVis;
})();

/* ===== 4. History → Before anchor for Compare / Original ===== */
(function(){
  const hi=findSec('History'); if(!hi) return;
  const bar=document.createElement('div'); bar.className='row beforeBar';
  bar.innerHTML=`<button class="btn" id="baSet" title="Use the selected history step as Before for Compare / Original">Set as Before</button>
    <button class="btn" id="baClear" title="Reset Before to the import (unedited) state">Before: Import</button>
    <span class="hint" id="baHint"></span>`;
  hi.prepend(bar);
  function beforeIdx(p){ return p&&p.beforeIdx!=null?p.beforeIdx:0; }
  function labelOf(p){ if(!p||!p.history||!p.history.length) return 'Import'; const i=beforeIdx(p); const h=p.history[Math.min(i,p.history.length-1)]; return h?h.label:'Import'; }
  function syncHint(){ const p=curPhoto(); const el=$('#baHint'); if(!el) return; el.textContent=p?`Before = “${labelOf(p)}”`:''; const lab=$('#baLabel'); if(lab&&!lab.hidden) lab.textContent='Before · '+labelOf(p); }
  window.beforeEditSettings=function(){
    const p=curPhoto(); const d=defaults();
    if(p&&p.history&&p.history.length){ const i=Math.min(Math.max(0,beforeIdx(p)),p.history.length-1); const src=fillDefaults(clone(p.history[i].s));
      VIEWGEOM.forEach(k=>src[k]=S[k]); return src; }
    VIEWGEOM.forEach(k=>d[k]=S[k]); return d;
  };
  $('#baSet').onclick=()=>{ const p=curPhoto(); if(!p) return; p.beforeIdx=p.hIdx; savePhoto(p,0); syncHint(); // invalidate compare cache
    try{ if(window.setCompare){ /* bump bKey via schedule */ } }catch(_){}
    schedule(true); toast('Before is now “'+labelOf(p)+'” — use Original / Compare to preview',2200); };
  $('#baClear').onclick=()=>{ const p=curPhoto(); if(!p) return; p.beforeIdx=0; savePhoto(p,0); syncHint(); schedule(true); toast('Before reset to Import',1200); };
  const baseRH=window.renderHistory; window.renderHistory=function(){ baseRH&&baseRH(); syncHint();
    // mark the before step in the list
    const p=curPhoto(); if(!p) return; const bi=beforeIdx(p);
    $$('#hlist button').forEach(b=>{ b.classList.toggle('before',+b.dataset.i===bi); if(+b.dataset.i===bi) b.title=(b.title||'')+' (Before)'; }); };
  // context: right-click / long-press history item → set as before
  $('#hlist')?.addEventListener('contextmenu',e=>{ const b=e.target.closest('button[data-i]'); if(!b) return; e.preventDefault(); const p=curPhoto(); if(!p) return; p.beforeIdx=+b.dataset.i; savePhoto(p,0); syncHint(); schedule(true); toast('Before = “'+labelOf(p)+'”',1400); });
  syncers.push(syncHint);
  // when Original turns on, refresh label
  const _sb=window.setBefore; if(typeof _sb==='function'){ /* setBefore is local */ }
  { const ba=$('#baBtn'); if(ba){ const obs=new MutationObserver(syncHint); obs.observe($('#baLabel'),{attributes:true,attributeFilter:['hidden']}); } }
  { const _sb=window.setBefore; if(typeof _sb==='function') window.setBefore=function(on){ _sb(on); syncHint(); if(on){ const lab=$('#baLabel'); if(lab) lab.textContent='Before · '+labelOf(curPhoto()); } }; }
  window.__lr7.beforeLabel=labelOf;
})();

/* ===== 5. Auto Sync — respect Copy Settings groups + clearer toast ===== */
(function(){
  const btn=$('#autoSyncBtn'); if(!btn) return;
  // Add configure affordance via long-title + Shift-click opens group picker (reuses Copy Settings groups from lr6)
  btn.title='Auto Sync: edits to the active photo apply to other selected photos. Shift-click to choose which settings sync (uses Copy Settings groups).';
  const allowedKeys=()=>{
    try{
      const saved=JSON.parse(localStorage.getItem('ps.copyGroups')||'null');
      if(!saved||!saved.length) return null; // null = all non-GEOM keys (legacy)
      // GROUPS from lr6 may not be exported; rebuild from SEC_KEYS + known
      const map={};
      if(window.__lr6&&window.__lr6.groups){ for(const g of window.__lr6.groups) map[g[0]]=g[1]; }
      else {
        map['White Balance']=['wbTemp','wbTint']; map['Basic Tone']=['exposure','contrast','highlights','shadows','whites','blacks','rawProfile'];
        map['Presence']=['texture','clarity','dehaze','vibrance','saturation'];
        for(const [k,v] of Object.entries(SEC_KEYS||{})) if(!['Basic','Mask','Spot','Red-eye','Crop'].includes(k)) map[k==='Lens'?'Lens Corrections & Transform':k]=v.slice();
      }
      const keys=new Set(); for(const n of saved){ (map[n]||[]).forEach(k=>keys.add(k)); } return keys;
    }catch(_){ return null; }
  };
  // wrap commit again (outermost) to filter keys
  const prev=window.commit;
  window.commit=function(label){ const r=prev.apply(this,arguments); try{
    // The lr.js Auto Sync already ran inside prev. Re-apply with filter? Better: patch by re-doing only if needed.
    // Instead intercept: if auto sync already applied all keys, we can't easily undo. So replace lr auto-sync behaviour:
  }catch(_){ } return r; };
  // Disable lr.js auto-apply by zeroing sel during its hook? Too fragile.
  // Patch applyKeys wrapper used by auto sync — filter inside a new commit wrapper that runs BEFORE lr's by replacing after both loaded.
  // Approach: store flag and monkey-patch applyKeys
  const _ak=window.applyKeys;
  // applyKeys is local to lr.js — not on window. Expose it:
  // Re-bind Auto Sync button to our implementation
  let autoSync=false;
  btn.onclick=e=>{
    if(e.shiftKey){ openAutoSyncGroups(); return; }
    autoSync=!autoSync; btn.classList.toggle('on',autoSync);
    const n=Math.max(0,sel.size-1);
    toast(autoSync?(n?`Auto Sync on → ${n} other selected photo(s)`:'Auto Sync on — select more photos in the filmstrip/library'):'Auto Sync off',1800);
  };
  // Replace the lr.js commit wrapper's auto-sync by tracking: wrap commit and do OUR sync, prevent double by setting a guard
  let guard=false;
  const cm=window.commit;
  window.commit=function(label){
    if(guard) return cm.apply(this,arguments);
    guard=true; const r=cm.apply(this,arguments); guard=false;
    try{
      if(!autoSync||mode!=='develop'||sel.size<=1) return r;
      const p=curPhoto(); const a=p.history[p.hIdx-1], b=p.history[p.hIdx]; if(!a||!b) return r;
      let ks=Object.keys(b.s).filter(k=>!GEOM.includes(k)&&!['faces','air'].includes(k)&&JSON.stringify(a.s[k])!==JSON.stringify(b.s[k]));
      const allow=allowedKeys(); if(allow) ks=ks.filter(k=>allow.has(k));
      if(!ks.length) return r;
      // If lr.js already synced (all keys), we may have over-synced. Mitigate: only sync when lr's autoSync is false.
      // Force lr's autoSync off by clicking? It keeps its own closed-over variable.
      // Solution: turn off lr button state confusion — leave lr's autoSync always false by not using its button.
      // Our button replaced onclick, but lr's commit still checks its closed-over autoSync which stays false. Perfect!
      const targets=photos.filter(x=>sel.has(x.id)&&x.id!==cur);
      for(const t of targets){ const s=t.settings; ks.forEach(k=>{ if(b.s[k]!==undefined) s[k]=clone(b.s[k]); });
        t.history=(t.history||[]).slice(0,(t.hIdx??0)+1); t.history.push({label:'Auto Sync: '+label,s:clone(s)}); t.hIdx=t.history.length-1; t.edited=true; savePhoto(t,0); }
      window.__autoSynced=(window.__autoSynced||0)+1; window.__autoSyncKeys=ks.slice();
    }catch(err){ console.warn(err); }
    return r;
  };
  function openAutoSyncGroups(){
    // Prefer opening Copy Settings dialog groups; quick checklist
    const names=JSON.parse(localStorage.getItem('ps.copyGroups')||'null')||['White Balance','Basic Tone','Presence','Tone Curve','Colour Mixer','Colour Grading','Detail','Effects'];
    const all=['White Balance','Basic Tone','Presence','Tone Curve','Colour Mixer','B&W Mixer','Colour Grading','Detail','Effects','Lens Corrections & Transform','Colour Rendering','Calibration','Film','Point Color','Selective Tone','Smart Lighting'];
    dlg(`<h3>Auto Sync groups</h3><div class="hint">When Auto Sync is on, only these groups are copied (same list as Copy Settings). Leave empty to sync everything except crop/masks.</div>
      <div class="cpList">${all.map(n=>`<label class="chk"><input type="checkbox" data-n="${esc(n)}" ${names.includes(n)?'checked':''}> ${esc(n)}</label>`).join('')}</div>
      <div class="btns"><button class="btn" id="asAll">Check All</button><button class="btn" id="asNone">Check None</button><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="asGo">Save</button></div>`);
    const boxes=$$('#dlg .cpList input');
    $('#asAll').onclick=()=>boxes.forEach(b=>b.checked=true); $('#asNone').onclick=()=>boxes.forEach(b=>b.checked=false);
    $('#asGo').onclick=()=>{ const gs=boxes.filter(b=>b.checked).map(b=>b.dataset.n); localStorage.setItem('ps.copyGroups',JSON.stringify(gs)); closeDlg(); toast(gs.length?`Auto Sync will use ${gs.length} group(s)`:'Auto Sync will copy all settings',1500); };
  }
  window.__lr7.autoSync=()=>autoSync;
  window.__lr7.openAutoSyncGroups=openAutoSyncGroups;
})();

/* ===== 6. Export colour space (metadata + soft-proof reminder) ===== */
(function(){
  const wrap=window.openExport;
  if(typeof wrap!=='function') return;
  window.openExport=function(){
    wrap.apply(this,arguments);
    const dlgEl=$('#dlg'); if(!dlgEl||!$('#go')) return;
    if($('#xCS')) return;
    const f=document.createElement('div'); f.className='f'; f.id='xCSWrap';
    f.innerHTML=`<label>Colour space</label><select id="xCS"><option value="srgb">sRGB</option><option value="p3">Display P3 (tag only)</option><option value="adobergb">Adobe RGB (tag only)</option></select>
      <div class="hint">Pixels stay in the browser’s working space (≈sRGB). P3 / Adobe RGB only set an ICC intent tag where the format allows — use Soft Proof to preview.</div>`;
    const ex=$('#xExif')||$('#go'); ex.parentElement.insertBefore(f,ex);
    const last=JSON.parse(localStorage.getItem('ps.exp2')||'null')||{};
    $('#xCS').value=last.colorSpace||'srgb';
    const go=$('#go'); const prev=go.onclick;
    go.onclick=async e=>{ const cs=$('#xCS').value; try{ const o=JSON.parse(localStorage.getItem('ps.exp2')||'{}'); o.colorSpace=cs; localStorage.setItem('ps.exp2',JSON.stringify(o)); }catch(_){}
      if(expOpts) expOpts.colorSpace=cs; if(expOpts&&expOpts._x) expOpts._x.colorSpace=cs;
      window.__exportCS=cs; return prev&&prev.call(go,e); };
  };
  // After JPEG encode, if tools embedICC exists — optional no-op; store for verification
  window.__lr7.exportCS=()=>window.__exportCS||'srgb';
})();

/* ===== 7. Small bugfixes / polish ===== */
(function(){
  // Soft-proof select was max-width 150px and got clipped with longer labels — allow wrap in vtools
  const ps=$('#proofSel'); if(ps){ ps.style.maxWidth='min(200px,40vw)'; }
  // History before marker style injected via CSS
  // Filmstrip multi-select: Ctrl/Shift-click to build Auto Sync selection without leaving Develop
  const fs=$('#filmstrip'); if(fs&&!fs._lr7sel){ fs._lr7sel=1;
    fs.addEventListener('click',e=>{ if(!(e.metaKey||e.ctrlKey||e.shiftKey)) return; const i=e.target.closest('img'); if(!i) return;
      e.preventDefault(); e.stopPropagation(); const id=i.dataset.id;
      if(e.shiftKey&&lastSel){ const a=filtered(); const i0=a.findIndex(p=>p.id===lastSel), i1=a.findIndex(p=>p.id===id); if(i0>=0&&i1>=0){ const [lo,hi]=i0<i1?[i0,i1]:[i1,i0]; for(let j=lo;j<=hi;j++) sel.add(a[j].id); } }
      else { if(sel.has(id)&&sel.size>1) sel.delete(id); else sel.add(id); }
      lastSel=id; i.classList.toggle('sel',sel.has(id));
      $$('#filmstrip img').forEach(im=>im.classList.toggle('sel',sel.has(im.dataset.id)));
      const b=$('#autoSyncBtn'); if(b&&b.classList.contains('on')) toast(`Auto Sync targets: ${Math.max(0,sel.size-1)} other photo(s)`,1200);
    },true); }
})();

window.__lr7.ready=true;
});
