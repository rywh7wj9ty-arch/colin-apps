'use strict';
/* Lightroom round 6: Transform Rotate / Aspect / X-Y Offset (engine geom), White Balance presets (As Shot / Auto / Daylight…),
   Tone Curve point-curve presets (+ save your own), Copy Settings dialog with checkboxes (partial paste),
   Metadata panel (title, caption, creator, copyright, capture time; embedded in exported JPEG EXIF) + Library batch metadata
   with capture-time shift, Develop loupe grid overlay (Ctrl+Alt+O). */
addEventListener('DOMContentLoaded',()=>{
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const findSec=t=>[...$$('#sections details.sec')].find(d=>(d.querySelector('summary')?.textContent||'').startsWith(t));
const rowOf=(sec,label)=>sec&&[...sec.querySelectorAll('.sl')].find(r=>(r.querySelector('label')?.textContent||'').trim()===label);
const selected=()=>photos.filter(p=>sel.has(p.id));
window.__lr6={};


/* ===== 1. Transform: Rotate / Aspect / X Offset / Y Offset (Lightroom Transform panel) ===== */
(function(){
  const L=$('#lensSec'); if(!L) return; const scale=rowOf(L,'Scale');
  const KC=k=>[s=>s[k]||0,(s,v)=>{ s[k]=v; constrainCrop(); }];
  const box=document.createElement('div'); box.id='xfMore';
  slider(box,'Rotate',...KC('perspRot'),-10,10,0.1,null,'Transform rotate');
  slider(box,'Aspect',...KC('perspAspect'),-100,100,1,null,'Transform aspect');
  slider(box,'X Offset',...KC('perspX'),-100,100,1,null,'Transform X offset');
  slider(box,'Y Offset',...KC('perspY'),-100,100,1,null,'Transform Y offset');
  if(scale) scale.after(box); else L.appendChild(box);
  const r=document.createElement('div'); r.className='row'; r.innerHTML='<button class="btn" id="xfReset">Reset transform</button>';
  box.appendChild(r);
  $('#xfReset').onclick=()=>{ if(!S) return; Object.assign(S,{perspV:0,perspH:0,perspScale:100,perspRot:0,perspAspect:0,perspX:0,perspY:0}); restoreCrop(); syncUI(); schedule(true); commit('Reset transform'); };
})();

// After a transform is reduced/reset the auto-shrunk crop can grow back (same centre & aspect) up to the largest blank-free size.
function growCrop(){ const c=S.crop; if(c.w>=0.999&&c.h>=0.999) return; const cx=c.x+c.w/2, cy=c.y+c.h/2; const mk=m=>({x:cx-c.w*m/2,y:cy-c.h*m/2,w:c.w*m,h:c.h*m});
  const ok=m=>{ const t=mk(m); return t.x>=-1e-6&&t.y>=-1e-6&&t.x+t.w<=1+1e-6&&t.y+t.h<=1+1e-6&&cropValid(t); };
  let lo=1, hi=Math.min(1/c.w,1/c.h, (cx>0&&cx<1)?Math.min(cx,1-cx)*2/c.w:1, (cy>0&&cy<1)?Math.min(cy,1-cy)*2/c.h:1); if(hi<=1||!ok(1)){ constrainCrop(); return; }
  for(let i=0;i<30;i++){ const m=(lo+hi)/2; ok(m)?lo=m:hi=m; } const t=mk(lo); S.crop={x:Math.max(0,t.x),y:Math.max(0,t.y),w:Math.min(1,t.w),h:Math.min(1,t.h)}; }
window.growCrop=growCrop;
// remember the user's crop before transforms auto-shrink it, so Reset transform restores it exactly
const preXf=new Map();
{ const _cc=window.constrainCrop; window.constrainCrop=function(){ const b=S&&S.crop?JSON.stringify(S.crop):null; const r=_cc.apply(this,arguments); if(b&&JSON.stringify(S.crop)!==b&&!preXf.has(cur)) preXf.set(cur,JSON.parse(b)); return r; };
  const _tc=window.toggleCrop; if(_tc) window.toggleCrop=function(){ preXf.delete(cur); return _tc.apply(this,arguments); }; }
function restoreCrop(){ const r=preXf.get(cur); preXf.delete(cur); if(r&&cropValid(r)) S.crop=r; else growCrop(); }

/* ===== 2. White Balance presets ===== */
const WB=[['asshot','As Shot',0,0],['auto','Auto',null,null],['daylight','Daylight (≈5500K)',4,2],['cloudy','Cloudy (≈6500K)',18,4],['shade','Shade (≈7500K)',32,6],
  ['tungsten','Tungsten (≈2850K)',-55,-2],['fluor','Fluorescent (≈3800K)',-32,18],['flash','Flash (≈5500K)',7,3]];
(function(){
  const b=findSec('Basic'); const t=rowOf(b,'Temp'); if(!t) return;
  const row=document.createElement('div'); row.className='wbPre';
  row.innerHTML=`<label for="wbPreset">WB</label><select id="wbPreset">${WB.map(w=>`<option value="${w[0]}">${w[1]}</option>`).join('')}<option value="custom">Custom</option></select>`;
  t.before(row); const selEl=$('#wbPreset'); let autoKey=''; const autoMap=new Map();
  const cur_=()=>{ if(!S) return 'asshot'; const av=autoMap.get(cur); if(av&&S.wbTemp===av[0]&&S.wbTint===av[1]&&!WB.some(w=>w[2]===av[0]&&w[3]===av[1])) return 'auto';
    const m=WB.find(w=>w[2]!==null&&w[2]===S.wbTemp&&w[3]===S.wbTint); return m?m[0]:'custom'; };
  syncers.push(()=>{ selEl.value=cur_(); });
  selEl.onchange=()=>{ if(!S) return; const v=selEl.value; if(v==='custom'){ selEl.value=cur_(); return; }
    if(v==='auto'){ const k=cur+'|'+JSON.stringify(Object.assign({},S,{wbTemp:0,wbTint:0})); let r=autoKey===k?autoMap.get(cur):null;
      if(!r){ const s0=S.wbTemp, t0=S.wbTint; S.wbTemp=0; S.wbTint=0; r=window.autoWB?autoWB():null; S.wbTemp=s0; S.wbTint=t0; }
      if(!r){ toast('Auto white balance needs the photo to be loaded'); selEl.value=cur_(); return; } autoMap.set(cur,r); autoKey=k; S.wbTemp=r[0]; S.wbTint=r[1]; }
    else { const w=WB.find(x=>x[0]===v); S.wbTemp=w[2]; S.wbTint=w[3]; }
    syncUI(); schedule(true); commit('White balance: '+selEl.options[selEl.selectedIndex].text.replace(/ \(.*/,'')); };
  window.__lr6.wb=WB;
})();

/* ===== 3. Tone Curve presets (point curve) ===== */
const CURVES={'Linear':[[0,0],[1,1]],'Medium Contrast':[[0,0],[0.25,0.22],[0.5,0.5],[0.75,0.78],[1,1]],'Strong Contrast':[[0,0],[0.25,0.18],[0.5,0.5],[0.75,0.82],[1,1]],
  'Lighter':[[0,0],[0.5,0.58],[1,1]],'Darker':[[0,0],[0.5,0.42],[1,1]],'Matte (lifted blacks)':[[0,0.08],[0.25,0.26],[0.75,0.77],[1,0.97]],'Soft highlights':[[0,0],[0.5,0.5],[0.85,0.82],[1,0.93]]};
(function(){
  const sec=findSec('Tone Curve'); if(!sec) return; const body=sec.querySelector('.secbody');
  const row=document.createElement('div'); row.className='row tcPre';
  row.innerHTML=`<label for="tcPreset" style="align-self:center">Point curve</label><select id="tcPreset"></select><button class="btn" id="tcSave" title="Save the current RGB curve as a preset">Save…</button><button class="btn" id="tcDel" title="Delete the selected custom preset">✕</button>`;
  body.prepend(row); const s=$('#tcPreset');
  const user=()=>JSON.parse(localStorage.getItem('ps.curvePresets')||'{}');
  const all=()=>Object.assign({},CURVES,user());
  const same=(a,b)=>JSON.stringify((a||[]).map(p=>[+(+p[0]).toFixed(3),+(+p[1]).toFixed(3)]))===JSON.stringify(b.map(p=>[+p[0].toFixed(3),+p[1].toFixed(3)]));
  const fill=()=>{ const u=user(); s.innerHTML=Object.keys(CURVES).map(n=>`<option>${esc(n)}</option>`).join('')+Object.keys(u).map(n=>`<option value="${esc(n)}">★ ${esc(n)}</option>`).join('')+'<option value="__custom">Custom</option>'; };
  const sync=()=>{ if(!S) return; const A=all(); const n=Object.keys(A).find(k=>same(S.curve.m,A[k])); s.value=n||'__custom'; $('#tcDel').hidden=!(n&&user()[n]); };
  fill(); syncers.push(sync);
  s.onchange=()=>{ if(!S) return; const A=all(); const c=A[s.value]; if(!c){ sync(); return; } S.curve.m=c.map(p=>p.slice()); if(window.drawCurve) drawCurve(); schedule(true); commit('Point curve: '+s.value); sync(); };
  $('#tcSave').onclick=()=>{ if(!S) return; const n=(prompt('Name for this point curve preset:','My curve')||'').trim(); if(!n) return; if(CURVES[n]) return toast('That name is a built-in preset');
    const u=user(); u[n]=S.curve.m.filter(p=>!p._off).map(p=>[+p[0],+p[1]]); localStorage.setItem('ps.curvePresets',JSON.stringify(u)); fill(); sync(); toast('Saved curve preset “'+n+'”'); };
  $('#tcDel').onclick=()=>{ const u=user(); if(!u[s.value]) return; delete u[s.value]; localStorage.setItem('ps.curvePresets',JSON.stringify(u)); fill(); sync(); };
  window.__lr6.curves=CURVES;
})();

/* ===== 4. Copy Settings dialog (Lightroom: choose which settings to copy) ===== */
const GROUPS=(()=>{ const g=[['White Balance',['wbTemp','wbTint'],1],['Basic Tone',['exposure','contrast','highlights','shadows','whites','blacks','rawProfile'],1],['Presence',['texture','clarity','dehaze','vibrance','saturation'],1]];
  const skip={Basic:1,Mask:1,Spot:1,'Red-eye':1,Crop:1};
  for(const [k,v] of Object.entries(SEC_KEYS)) if(!skip[k]) g.push([k==='Lens'?'Lens Corrections & Transform':k,v.slice(),1]);
  g.push(['Crop & Straighten',['crop','angle','aspect','orient','flipH'],0],['Spot Removal',['spots','healStrokes'],0],['Red-eye',['redEyes'],0]); return g; })();
window.__lr6.groups=GROUPS;
function openCopyDialog(){
  if(!S) return toast('Open a photo in Develop first');
  const saved=JSON.parse(localStorage.getItem('ps.copyGroups')||'null');
  const on=g=>saved?saved.includes(g[0]):!!g[2];
  dlg(`<h3>Copy Settings</h3><div class="hint">Choose what Paste will apply. Masks are not copied (they belong to one photo).</div>
   <div class="row"><button class="btn" id="cpAll">Check All</button><button class="btn" id="cpNone">Check None</button><button class="btn" id="cpTone">Tone only</button></div>
   <div class="cpList">${GROUPS.map((g,i)=>`<label class="chk"><input type="checkbox" data-i="${i}" ${on(g)?'checked':''}> ${esc(g[0])}</label>`).join('')}</div>
   <div class="btns"><button class="btn" id="cpQuick" title="Copy everything except geometry, like before">Copy all (quick)</button><button class="btn" id="cpCancel">Cancel</button><button class="btn primary" id="cpGo">Copy</button></div>`);
  const boxes=$$('#dlg .cpList input');
  $('#cpAll').onclick=()=>boxes.forEach(b=>b.checked=true); $('#cpNone').onclick=()=>boxes.forEach(b=>b.checked=false);
  $('#cpTone').onclick=()=>boxes.forEach(b=>b.checked=['White Balance','Basic Tone','Presence','Tone Curve'].includes(GROUPS[+b.dataset.i][0]));
  $('#cpCancel').onclick=closeDlg; $('#cpQuick').onclick=()=>{ closeDlg(); quickCopy(); };
  $('#cpGo').onclick=()=>{ const gs=boxes.filter(b=>b.checked).map(b=>GROUPS[+b.dataset.i]); if(!gs.length) return toast('Nothing selected');
    localStorage.setItem('ps.copyGroups',JSON.stringify(gs.map(g=>g[0])));
    const keys=[...new Set(gs.flatMap(g=>g[1]))]; const c={__keys:keys}; keys.forEach(k=>{ if(S[k]!==undefined) c[k]=clone(S[k]); });
    clip=c; localStorage.setItem('ps.clip',JSON.stringify(c)); closeDlg(); toast(`Copied ${gs.length} group${gs.length>1?'s':''} of settings`); window.__lr6.copied=keys; };
}
const quickCopy=window.copySettings;
window.copySettings=openCopyDialog; const cb=$('#copyBtn'); if(cb){ cb.onclick=openCopyDialog; cb.title='Copy Settings… (Ctrl+Shift+C)'; cb.textContent='Copy…'; }

/* ===== 5. Metadata: title / caption / creator / copyright / capture time ===== */
const mdDef=()=>JSON.parse(localStorage.getItem('ps.metaDefault')||'{}');
const metaOf=p=>{ const m=p.meta||{}, d=mdDef(); return {title:m.title||'',creator:m.creator||d.creator||(p.exif&&p.exif.Artist)||'',copyright:m.copyright||d.copyright||(p.exif&&p.exif.Copyright)||''}; };
window.metaOf=metaOf;
const ex2local=s=>{ const m=/^(\d{4}):(\d\d):(\d\d)[ T](\d\d):(\d\d):?(\d\d)?/.exec(String(s||'')); return m?`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]||'00'}`:''; };
const local2ex=v=>{ const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?/.exec(v||''); return m?`${m[1]}:${m[2]}:${m[3]} ${m[4]}:${m[5]}:${m[6]||'00'}`:''; };
const shiftEx=(s,mins)=>{ const v=ex2local(s); if(!v) return s; const d=new Date(v); d.setMinutes(d.getMinutes()+mins); const P=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}:${P(d.getMonth()+1)}:${P(d.getDate())} ${P(d.getHours())}:${P(d.getMinutes())}:${P(d.getSeconds())}`; };
window.__lr6.shiftEx=shiftEx;
(function(){
  const body=section('Metadata',false); body.parentElement.id='mdSec';
  body.innerHTML=`<div class="f2"><label>Title</label><input id="mdTitle" maxlength="200"></div>
   <div class="f2"><label>Caption</label><textarea id="mdCap" rows="2" maxlength="1000"></textarea></div>
   <div class="f2"><label>Creator</label><input id="mdCreator" maxlength="120"></div>
   <div class="f2"><label>Copyright</label><input id="mdCopy" maxlength="160"></div>
   <div class="f2"><label>Capture time</label><input id="mdTime" type="datetime-local" step="1"></div>
   <div class="row"><button class="btn" id="mdDef" title="Pre-fill Creator & Copyright for every photo that has none">Use for all photos</button><button class="btn" id="mdCopyrightSym">Insert ©</button></div>
   <div class="hint" id="mdInfo"></div>`;
  const F={mdTitle:'title',mdCreator:'creator',mdCopy:'copyright'};
  const fill=()=>{ const p=curPhoto&&curPhoto(); if(!p) return; const m=p.meta||{}, d=mdDef();
    $('#mdTitle').value=m.title||''; $('#mdCreator').value=m.creator||''; $('#mdCopy').value=m.copyright||''; $('#mdCap').value=p.caption||'';
    $('#mdCreator').placeholder=d.creator||(p.exif&&p.exif.Artist)||'e.g. Colin Diamond'; $('#mdCopy').placeholder=d.copyright||(p.exif&&p.exif.Copyright)||'e.g. © 2026 Colin Diamond';
    $('#mdTime').value=ex2local(p.exif&&(p.exif.DateTimeOriginal||p.exif.DateTime));
    $('#mdInfo').textContent=(p.exif?exifSummary(p.exif):'')+' · Saved into exported JPEGs when “Include camera info (EXIF)” is on.'; };
  syncers.push(fill);
  const save=p=>{ p.meta=p.meta||{}; savePhoto(p); };
  for(const [id,k] of Object.entries(F)) $('#'+id).addEventListener('change',e=>{ const p=curPhoto(); if(!p) return; save(p); p.meta[k]=e.target.value.trim(); });
  $('#mdCap').addEventListener('change',e=>{ const p=curPhoto(); if(!p) return; p.caption=e.target.value.trim(); savePhoto(p); });
  $('#mdTime').addEventListener('change',e=>{ const p=curPhoto(); if(!p) return; const v=local2ex(e.target.value); if(!v) return; p.exif=p.exif||{}; p.exif.DateTimeOriginal=v; savePhoto(p); toast('Capture time set to '+v); });
  $('#mdDef').onclick=()=>{ const r=$('#mdCopy').value.trim();
    if(!r&&!$('#mdCreator').value.trim()) return toast('Type a creator and/or copyright first');
    localStorage.setItem('ps.metaDefault',JSON.stringify({creator:$('#mdCreator').value.trim(),copyright:r})); fill(); toast('Default creator/copyright saved for all photos'); };
  $('#mdCopyrightSym').onclick=()=>{ const i=$('#mdCopy'); if(!i.value.includes('©')){ i.value=('© '+new Date().getFullYear()+' '+(i.value||$('#mdCreator').value||'')).trim(); i.dispatchEvent(new Event('change')); } };
  // Library: batch metadata + capture time shift
  const ref=$('#selAll'); if(ref){ const b=document.createElement('button'); b.className='btn'; b.id='mdBtn'; b.textContent='Metadata…'; b.title='Title, creator, copyright and capture time for the selected photos'; ref.before(b); b.onclick=batchDlg; }
})();
function batchDlg(){
  const list=selected(); if(!list.length) return toast('Select photos first');
  dlg(`<h3>Metadata — ${list.length} photo${list.length>1?'s':''}</h3><div class="hint">Leave a field empty to keep each photo’s value.</div>
   <div class="f"><label>Title</label><input id="bmTitle"></div><div class="f"><label>Creator</label><input id="bmCreator" placeholder="${esc(mdDef().creator||'')}"></div>
   <div class="f"><label>Copyright</label><input id="bmCopy" placeholder="${esc(mdDef().copyright||'')}"></div>
   <div class="f"><label>Edit capture time — shift by (e.g. camera clock in the wrong time zone)</label><div class="row"><input id="bmH" type="number" value="0" step="1" min="-48" max="48" style="width:6em"> h <input id="bmM" type="number" value="0" step="1" min="-59" max="59" style="width:6em"> min</div></div>
   <div class="btns"><button class="btn" id="bmCancel">Cancel</button><button class="btn primary" id="bmGo">Apply</button></div>`);
  $('#bmCancel').onclick=closeDlg;
  $('#bmGo').onclick=()=>{ const t=$('#bmTitle').value.trim(), c=$('#bmCreator').value.trim(), r=$('#bmCopy').value.trim(); const mins=(+$('#bmH').value||0)*60+(+$('#bmM').value||0); let shifted=0;
    for(const p of list){ p.meta=p.meta||{}; if(t) p.meta.title=t; if(c) p.meta.creator=c; if(r) p.meta.copyright=r;
      if(mins&&p.exif&&(p.exif.DateTimeOriginal||p.exif.DateTime)){ p.exif.DateTimeOriginal=shiftEx(p.exif.DateTimeOriginal||p.exif.DateTime,mins); shifted++; } savePhoto(p,0); }
    closeDlg(); renderLibrary(); toast(`Metadata updated on ${list.length} photo(s)${mins?`, capture time shifted on ${shifted}`:''}`); window.__lr6.batch={n:list.length,shifted}; };
}
// Export: embed title/caption, creator, copyright and edited capture time into the JPEG EXIF block
{ const _re=window.renderExport; if(_re) window.renderExport=async function(p){ window.__expP=p; try{ return await _re.apply(this,arguments); } finally { window.__expP=null; } };
  const _ie=window.insertExif; window.insertExif=async function(blob,e,w,h){ const p=window.__expP; if(!p) return _ie(blob,e,w,h);
    const m=metaOf(p); const e2=Object.assign({},e||{}); if(m.creator) e2.Artist=m.creator; if(m.copyright) e2.Copyright=m.copyright; const desc=[m.title,p.caption].filter(Boolean).join(' — '); if(desc) e2.ImageDescription=desc;
    if(!e&&!m.creator&&!m.copyright&&!desc) return _ie(blob,e,w,h); return _ie(blob,e2,w,h); }; }

/* ===== 6. Loupe grid overlay (Lightroom View ▸ Loupe Overlay ▸ Grid) ===== */
(function(){
  const g=document.createElement('canvas'); g.id='loupeGrid'; g.hidden=true; $('#stage').appendChild(g);
  let on=false, size=+(localStorage.getItem('ps.lgSize')||8), op=+(localStorage.getItem('ps.lgOp')||45), raf=0, lastKey='';
  const sec=findSec('Crop'); const body=sec&&sec.querySelector('.secbody');
  if(body){ const d=document.createElement('div'); d.className='lgRow'; d.innerHTML=`<div class="sub">Loupe overlay</div><div class="row"><label class="chk"><input type="checkbox" id="lgOn"> Grid overlay <small>(Ctrl+Alt+O)</small></label></div>`; body.appendChild(d);
    const sl=document.createElement('div'); body.appendChild(sl);
    slider(sl,'Grid cells',()=>size,(s,v)=>{ size=v; localStorage.setItem('ps.lgSize',v); draw(true); },2,24,1,null,null,true);
    slider(sl,'Grid opacity',()=>op,(s,v)=>{ op=v; localStorage.setItem('ps.lgOp',v); draw(true); },10,100,1,null,null,true);
    $('#lgOn').onchange=e=>set(e.target.checked); }
  function set(v){ on=v; g.hidden=!on; const c=$('#lgOn'); if(c) c.checked=on; cancelAnimationFrame(raf); if(on) loop(); window.__lr6.grid=on; }
  function draw(force){ if(!on) return; const st=$('#stage'), gl=$('#gl'); const sr=st.getBoundingClientRect(), r=gl.getBoundingClientRect();
    const key=[r.left,r.top,r.width,r.height,sr.left,sr.top,size,op,cropOn].join(); if(!force&&key===lastKey) return; lastKey=key;
    const d=Math.min(devicePixelRatio||1,2); g.style.left=(r.left-sr.left)+'px'; g.style.top=(r.top-sr.top)+'px'; g.style.width=r.width+'px'; g.style.height=r.height+'px';
    g.width=Math.max(1,Math.round(r.width*d)); g.height=Math.max(1,Math.round(r.height*d)); const c=g.getContext('2d'); c.clearRect(0,0,g.width,g.height); if(cropOn) return;
    const step=Math.max(g.width,g.height)/size; c.strokeStyle=`rgba(255,255,255,${op/100})`; c.lineWidth=1; c.beginPath();
    for(let x=step;x<g.width-1;x+=step){ c.moveTo(Math.round(x)+0.5,0); c.lineTo(Math.round(x)+0.5,g.height); }
    for(let y=step;y<g.height-1;y+=step){ c.moveTo(0,Math.round(y)+0.5); c.lineTo(g.width,Math.round(y)+0.5); } c.stroke();
    c.strokeStyle=`rgba(0,0,0,${op/250})`; c.lineWidth=1; c.stroke(); }
  function loop(){ draw(false); raf=requestAnimationFrame(loop); }
  addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&e.altKey&&e.key.toLowerCase()==='o'&&mode==='develop'){ e.preventDefault(); e.stopImmediatePropagation(); set(!on); } },true);
  window.setLoupeGrid=set;
})();

/* ===== 7. Library: sort by capture time / edit time, search metadata, Keyword List ===== */
(function(){
  const so=$('#fSort'); if(so&&!so.querySelector('[value=capture]')){ so.insertAdjacentHTML('beforeend','<option value="capture">Capture time</option><option value="edited">Recently edited</option>'); const v=localStorage.getItem('ps.sort6'); if(v) so.value=v; so.addEventListener('change',()=>localStorage.setItem('ps.sort6',so.value)); }
  const capT=p=>{ const v=ex2local(p.exif&&(p.exif.DateTimeOriginal||p.exif.DateTime)); return v?Date.parse(v):(p.added||0); };
  window.__lr6.capT=capT;
  const _f=window.filtered; window.filtered=function(){ const a=_f.apply(this,arguments); const v=so&&so.value;
    if(v==='capture') a.sort((x,y)=>capT(x)-capT(y)||x.added-y.added); else if(v==='edited') a.sort((x,y)=>(y.editedAt||0)-(x.editedAt||0)||(y.edited?1:0)-(x.edited?1:0)||x.added-y.added); return a; };
  const _c=window.commit; if(_c) window.commit=function(){ const p=curPhoto&&curPhoto(); if(p) p.editedAt=Date.now(); return _c.apply(this,arguments); };
  const _m=window.matchPhoto; window.matchPhoto=function(p,q){ if(!_m) return true; if(_m(p,q)) return true; if(!q||/[:<>=]/.test(q)) return false; const m=metaOf(p); return [m.title,m.creator,m.copyright].join(' ').toLowerCase().includes(q.trim()); };
  const ref=$('#selAll'); if(ref){ const b=document.createElement('button'); b.className='btn'; b.id='kwListBtn'; b.textContent='Keywords'; b.title='Keyword List: every keyword with its photo count'; ref.before(b); b.onclick=kwDlg; }
  function kwDlg(){ const cnt=new Map(), auto=new Map(); for(const p of photos){ (p.keywords||[]).forEach(k=>cnt.set(k,(cnt.get(k)||0)+1)); (p.autoKw||[]).forEach(k=>{ if(!(p.keywords||[]).includes(k)) auto.set(k,(auto.get(k)||0)+1); }); }
    const row=(k,n,user)=>`<div class="kwRow"><button class="kwName" data-k="${esc(k)}">${esc(k)}</button><span class="kwN">${n}</span>${user?`<button class="btn kwRen" data-k="${esc(k)}" title="Rename">✎</button><button class="btn kwDel" data-k="${esc(k)}" title="Remove from all photos">✕</button>`:''}</div>`;
    const U=[...cnt].sort((a,b)=>a[0].localeCompare(b[0])), A=[...auto].sort((a,b)=>b[1]-a[1]).slice(0,60);
    dlg(`<h3>Keyword List</h3><input id="kwFind" placeholder="Filter keywords" type="search" style="width:100%;box-sizing:border-box">
      <div class="kwList">${U.length?'<div class="sub">Your keywords</div>'+U.map(([k,n])=>row(k,n,true)).join(''):'<div class="hint">No keywords yet — add them with Info/Keywords on selected photos.</div>'}
      ${A.length?'<div class="sub">Auto keywords</div>'+A.map(([k,n])=>row(k,n,false)).join(''):''}</div>
      <div class="hint">Tap a keyword to show its photos.</div><div class="btns"><button class="btn" id="kwClear">Clear filter</button><button class="btn primary" id="kwClose">Close</button></div>`);
    $('#kwClose').onclick=closeDlg; $('#kwClear').onclick=()=>{ $('#fSearch').value=''; renderLibrary(); closeDlg(); };
    $('#kwFind').oninput=e=>{ const q=e.target.value.toLowerCase(); $$('#dlg .kwRow').forEach(r=>r.hidden=!r.firstChild.dataset.k.toLowerCase().includes(q)); };
    $('#dlg .kwList').onclick=e=>{ const t=e.target.closest('button'); if(!t) return; const k=t.dataset.k;
      if(t.classList.contains('kwName')){ if(mode!=='library') setMode('library'); $('#fSearch').value=k; renderLibrary(); closeDlg(); toast(`Showing photos with “${k}”`); }
      else if(t.classList.contains('kwDel')){ if(!confirm(`Remove keyword “${k}” from ${cnt.get(k)} photo(s)?`)) return; photos.forEach(p=>{ if((p.keywords||[]).includes(k)){ p.keywords=p.keywords.filter(x=>x!==k); savePhoto(p,0); } }); renderLibrary(); kwDlg(); }
      else if(t.classList.contains('kwRen')){ const n=(prompt('Rename keyword',k)||'').trim(); if(!n||n===k) return; photos.forEach(p=>{ if((p.keywords||[]).includes(k)){ p.keywords=[...new Set(p.keywords.map(x=>x===k?n:x))]; savePhoto(p,0); } }); renderLibrary(); kwDlg(); } }; }
  window.kwDlg=kwDlg;
})();

window.__lr6.ok=true;
});
