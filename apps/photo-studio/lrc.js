/* ===== Lightroom Classic skin for Develop (lrc.js, 2026-10-17)
   Re-dresses the existing Photo Studio UI to match Lightroom Classic: identity plate + module picker,
   Navigator/Presets/Copy-Paste left panel, EXIF info overlay, histogram header, tool icon strip with
   dots, eye/triangle panel headers, Mixer|Point Color tabs, Profile/WB rows, Previous/Reset footer and
   a Lightroom filmstrip. Every control forwards to the real Photo Studio control, nothing is faked. ===== */
(function(){
const $id=id=>document.getElementById(id);
const g=n=>{ try{ return eval(n); }catch(e){ return undefined; } }; // read top-level let/const from app scripts
const svg=(p,w)=>'<svg viewBox="0 0 24 24" width="'+(w||18)+'" height="'+(w||18)+'" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
const IC={
 edit:svg('<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="#2a2a2a"/><circle cx="15" cy="12" r="2" fill="#2a2a2a"/><circle cx="8" cy="18" r="2" fill="#2a2a2a"/>'),
 crop:svg('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/><path d="M15 3l3 3-3 3" opacity=".7"/>'),
 heal:svg('<path d="M19 14l-7 7-9-9 7-7z"/><path d="M8 7l9 9"/><path d="M3 21h9"/>'),
 eye:svg('<path d="M2 13s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 13 2 13z"/><circle cx="12" cy="13" r="2.6"/><path d="M17 2v4M15 4h4"/>'),
 mask:svg('<circle cx="12" cy="12" r="8.5" stroke-dasharray="1.6 1.8"/><circle cx="12" cy="12" r="5" fill="currentColor" opacity=".35" stroke="none"/>'),
 sync:svg('<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 21v-5h-5"/>'),
 pick:svg('<path d="M15 4l5 5"/><path d="M17.5 1.5l5 5-3 3-5-5z"/><path d="M14 8l-9 9-1 4 4-1 9-9"/>',22),
 grid:svg('<rect x="4" y="5" width="6" height="5"/><rect x="14" y="5" width="6" height="5"/><rect x="4" y="14" width="6" height="5"/><rect x="14" y="14" width="6" height="5"/>'),
 peye:svg('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>',14),
};
const mob=matchMedia('(max-width:820px)');
let built=false, tool='edit';
const title=d=>((d.querySelector('summary')||d).textContent||'').replace('↺','').trim();
const sec=n=>[...document.querySelectorAll('details.sec')].find(d=>title(d).startsWith(n));

/* ---------- top bar ---------- */
function topbar(){
 const top=$id('top'); if(!top||$id('lrcPlate')) return;
 const brand=top.querySelector('.brand');
 const plate=document.createElement('div'); plate.id='lrcPlate'; plate.title='Identity plate (tap to change the name)';
 const nm=()=>localStorage.getItem('ps.idplate')||'colin diamond';
 plate.innerHTML='<span class="lrcBadge">Ps</span><span class="lrcPT"><small>Photo Studio</small><b></b></span>';
 plate.querySelector('b').textContent=nm();
 plate.onclick=()=>{ const v=prompt('Name on the identity plate',nm()); if(v!==null){ localStorage.setItem('ps.idplate',v.trim()||'colin diamond'); plate.querySelector('b').textContent=nm(); } };
 if(brand) brand.replaceWith(plate); else top.prepend(plate);
 const nav=top.querySelector('.modules');
 if(nav&&!$id('lrcExportMod')){ const b=document.createElement('button'); b.id='lrcExportMod'; b.textContent='Export'; b.title='Export (Ctrl+E)';
  b.onclick=()=>$id('exportBtn')?.click(); nav.appendChild(b); }
 document.body.classList.add('lrc');
}

/* ---------- left panel ---------- */
function left(){
 const lp=$id('lpanel'); if(!lp) return;
 const h=lp.querySelector('.lpHead');
 if(h&&!h.dataset.lrc){ h.dataset.lrc=1; h.innerHTML='<span class="lrcTri">▼</span> Navigator<span class="lrcZ"><button data-z="fit">FIT</button><button data-z="1">100%</button><button data-z="0.5">50%</button></span>';
  h.querySelectorAll('[data-z]').forEach(b=>b.onclick=()=>{ const z=b.dataset.z; try{ setZoom(z==='fit'?null:+z); }catch(e){} }); }
 const ln=$id('lpNav');
 if(ln&&!$id('lrcNavImg')){ const im=document.createElement('img'); im.id='lrcNavImg'; im.alt=''; ln.appendChild(im);
  im.onclick=()=>{ try{ setZoom(1); }catch(e){} }; }
 // presets: open + filter box
 const pr=sec('Presets'); if(pr&&!pr.dataset.lrc){ pr.dataset.lrc=1; pr.open=true; const body=pr.querySelector('.secbody'), pl=$id('plist');
  const f=document.createElement('input'); f.type='search'; f.id='lrcPFilter'; f.placeholder='Filter Presets'; f.setAttribute('aria-label','Filter presets');
  f.oninput=()=>{ const q=f.value.toLowerCase(); pl.querySelectorAll('button').forEach(b=>b.hidden=!!q&&!b.textContent.toLowerCase().includes(q)); };
  body.insertBefore(f,body.firstChild); }
 if(!$id('lrcLFoot')){ const ft=document.createElement('div'); ft.id='lrcLFoot';
  ft.innerHTML='<button id="lrcCopy" title="Copy settings (Ctrl+Shift+C)">Copy…</button><button id="lrcPaste" title="Paste settings (Ctrl+Shift+V)">Paste</button>';
  ft.querySelector('#lrcCopy').onclick=()=>$id('copyBtn')?.click(); ft.querySelector('#lrcPaste').onclick=()=>$id('pasteBtn')?.click(); lp.appendChild(ft); }
}

/* ---------- info overlay on the photo ---------- */
function rat(v){ if(Array.isArray(v)) return v[1]?v[0]/v[1]:0; return +v||0; }
function infoBox(){
 const st=$id('stage'); if(!st) return; let ib=$id('lrcInfo');
 if(!ib){ ib=document.createElement('div'); ib.id='lrcInfo'; ib.title='Info overlay (I) – tap to hide'; st.appendChild(ib);
  ib.onclick=()=>{ localStorage.setItem('ps.info','0'); upd(); }; }
}
function infoHTML(p){
 const e=p.exif||{}, out=[]; const esc=s=>String(s).replace(/[<&]/g,c=>c==='<'?'&lt;':'&amp;');
 out.push('<div class="n">'+esc(p.name)+'</div>');
 const et=rat(e.ExposureTime), fn=rat(e.FNumber), fl=rat(e.FocalLength); const a=[];
 if(et) a.push(et>=1?et+' sec':'<sup>1</sup>/<sub>'+Math.round(1/et)+'</sub> sec'); if(fn) a.push('<i>ƒ</i> / '+(+fn.toFixed(1))); if(e.ISO) a.push('ISO '+e.ISO);
 if(a.length) out.push('<div>'+a.join(' at ').replace(' at ISO',', ISO')+'</div>');
 if(fl) out.push('<div>'+Math.round(fl)+' mm'+(e.LensModel?' ('+esc(e.LensModel)+')':'')+'</div>');
 else if(!a.length) out.push('<div>'+p.w+' × '+p.h+'</div>');
 return out.join('');
}

/* ---------- right panel: histogram header, tool strip, panel headers, footer ---------- */
const TOOLS=[['edit','Edit',null],['crop','Crop Overlay (R)','cropBtn'],['heal','Remove / Heal (Q)','healBtn'],['eye','Red Eye Correction','__redeye'],['mask','Masking (M)','maskBtn'],['sync','Auto Sync (edits apply to other selected photos)','autoSyncBtn']];
const TOOLSEC={crop:'Crop & Rotate',heal:'Spot Removal',eye:'Red-eye',mask:'Masks'};
function right(){
 const panel=$id('panel'), h=panel&&panel.querySelector('.histo'); if(!h) return;
 if(!$id('lrcHHead')){ const hh=document.createElement('div'); hh.id='lrcHHead'; hh.className='lrcPH'; hh.innerHTML='<span>Histogram</span><span class="lrcTri">▼</span>';
  hh.onclick=()=>{ h.classList.toggle('lrcCollapsed'); hh.querySelector('.lrcTri').textContent=h.classList.contains('lrcCollapsed')?'◀':'▼'; };
  h.prepend(hh); }
 if(!$id('lrcTools')){ const t=document.createElement('div'); t.id='lrcTools'; t.setAttribute('role','toolbar'); t.setAttribute('aria-label','Develop tools');
  TOOLS.forEach(([k,lab,id])=>{ const b=document.createElement('button'); b.type='button'; b.dataset.t=k; b.title=lab; b.setAttribute('aria-label',lab); b.innerHTML=IC[k]+'<i class="dot"></i>';
   b.onclick=()=>pickTool(k); t.appendChild(b); });
  h.after(t); }
 // Previous / Reset footer
 if(!$id('lrcFoot')){ const f=document.createElement('div'); f.id='lrcFoot';
  f.innerHTML='<button id="lrcPrev" title="Apply settings from the previous photo (Ctrl+Alt+V)">Previous</button><button id="lrcReset" title="Reset all settings">Reset</button>';
  f.querySelector('#lrcPrev').onclick=()=>{ const b=$id('prevSetBtn'); if(b) b.click(); else window.__lr3?.applyPrevious(); };
  f.querySelector('#lrcReset').onclick=()=>$id('resetBtn')?.click();
  panel.appendChild(f); }
 headers(); basic(); mixerTabs();
}
function activeTool(){
 for(const [k,,id] of TOOLS){ if(id&&id!=='__redeye'&&k!=='sync'){ const r=$id(id); if(r&&r.classList.contains('on')) return k; } }
 return tool==='eye'?'eye':'edit';
}
function pickTool(k){
 const cur=activeTool();
 if(k==='sync'){ $id('autoSyncBtn')?.click(); return upd(); }
 // leave whatever tool is on
 if(cur!=='edit'&&cur!=='eye'){ const id=TOOLS.find(x=>x[0]===cur)[2]; if(cur!==k) $id(id)?.click(); }
 tool='edit';
 if(k==='eye'){ tool=cur==='eye'?'edit':'eye'; }
 else if(k!=='edit'&&k!==cur){ $id(TOOLS.find(x=>x[0]===k)[2])?.click(); }
 else if(k===cur&&k!=='edit'){ $id(TOOLS.find(x=>x[0]===k)[2])?.click(); }
 setTimeout(upd,30);
}
function used(k,s){ if(!s) return false; try{
 if(k==='crop'){ const c=s.crop; return !!(s.angle||s.orient||s.flipH||(c&&(c.x>0.001||c.y>0.001||c.w<0.999||c.h<0.999))); }
 if(k==='heal') return !!((s.spots&&s.spots.length)||(s.healStrokes&&s.healStrokes.length));
 if(k==='eye') return !!(s.redEyes&&s.redEyes.length);
 if(k==='mask') return !!(s.masks&&s.masks.length);
 if(k==='sync') return !!$id('autoSyncBtn')?.classList.contains('on');
}catch(e){} return false; }

const NAMES={'Masks (local adjustments)':'Masking','Colour Mixer (HSL)':'Colour Mixer','Lens & Transform':'Lens Corrections & Transform','ViewPoint (volume deformation)':'ViewPoint','Film Emulation (FilmPack)':'Film Emulation','Smart Lighting & ClearView':'Smart Lighting & ClearView','Spot Removal':'Remove (Spot Healing)'};
const LRSET=['Crop & Rotate','Spot Removal','Red-eye','Masks','Basic','Tone Curve','Colour Mixer','Point Color','Colour Grading','Detail','Lens & Transform','Lens Blur','Effects','Calibration'];
const off={}; // section key -> stashed values while its eye is off
function headers(){
 document.querySelectorAll('#sections>details.sec>summary').forEach(sm=>{
  const d=sm.parentNode;
  if(!sm.dataset.lrc){ sm.dataset.lrc=1;
   // keep textContent identical (other scripts look sections up by it); show the Lightroom name via CSS
   const tn=[...sm.childNodes].find(n=>n.nodeType===3&&n.data.trim());
   if(tn){ const raw=tn.data.trim(); const sp=document.createElement('span'); sp.className='lrcName'; sp.textContent=tn.data; if(NAMES[raw]){ sp.dataset.n=NAMES[raw]; sp.classList.add('ren'); } tn.replaceWith(sp); }
   const rs=sm.querySelector('.secReset');
   const key=rs&&(rs.title||'').replace(/^Reset /,'');
   if(key&&g('SEC_KEYS')&&g('SEC_KEYS')[key]&&!['Crop','Mask','Spot','Red-eye'].includes(key)){
    const e=document.createElement('button'); e.type='button'; e.className='lrcEye'; e.dataset.k=key; e.title='Turn '+key+' adjustments off/on'; e.setAttribute('aria-label',e.title); e.innerHTML=IC.peye;
    e.onclick=ev=>{ ev.preventDefault(); ev.stopPropagation(); eyeToggle(key); };
    sm.prepend(e);
   } else { const s=document.createElement('span'); s.className='lrcEyeGap'; sm.prepend(s); }
   const tri=document.createElement('span'); tri.className='lrcTri'; sm.appendChild(tri);
  }
  const t=title(d); d.classList.toggle('lrcExtra',!LRSET.some(n=>t.startsWith(n)));
 });
 // divider before the Photo Studio-only panels
 const secs=$id('sections'); const firstX=secs&&secs.querySelector('details.lrcExtra:not(.lrcGone)');
 let dv=$id('lrcXDiv'); if(!dv&&secs){ dv=document.createElement('div'); dv.id='lrcXDiv'; dv.textContent='Photo Studio extras'; }
 if(dv&&firstX&&dv.nextSibling!==firstX) secs.insertBefore(dv,firstX);
}
function eyeToggle(key){
 const S_=g('S'); if(!S_) return; const keys=g('SEC_KEYS')[key]; const d=g('defaults')();
 const cp=v=>JSON.parse(JSON.stringify(v===undefined?null:v));
 if(off[key]&&off[key].pid===g('cur')){ const st=off[key].v; keys.forEach(k=>{ if(k in st) S_[k]=cp(st[k]); }); delete off[key]; }
 else { const st={}; keys.forEach(k=>{ st[k]=cp(S_[k]); S_[k]=cp(d[k]); }); off[key]={pid:g('cur'),v:st}; }
 try{ g('curPhoto')().settings=S_; g('syncUI')(); g('schedule')(true); g('commit')((off[key]?'Hide ':'Show ')+key); }catch(e){ console.warn(e); }
 upd();
}

/* Basic: Auto | B&W row, Profile row, WB eyedropper row (all forward to real controls) */
function basic(){
 const b=sec('Basic'); if(!b||b.dataset.lrcb) return; const body=b.querySelector('.secbody'); if(!body) return; b.dataset.lrcb=1;
 const top=document.createElement('div'); top.className='lrcAutoRow';
 top.innerHTML='<button id="lrcAuto" title="Auto tone">Auto</button><button id="lrcBW" title="Black & White (V)">B&amp;W</button>';
 top.querySelector('#lrcAuto').onclick=()=>$id('autoBtn')?.click();
 top.querySelector('#lrcBW').onclick=()=>{ const S_=g('S'); if(!S_) return; S_.bwOn=!S_.bwOn; try{ g('syncUI')(); g('schedule')(true); g('commit')(S_.bwOn?'Black & White':'Colour'); }catch(e){} upd(); };
 // profile row
 const pf=document.createElement('div'); pf.className='lrcProf';
 pf.innerHTML='<span class="lab">Profile :</span><select id="lrcProfSel" aria-label="Profile"></select><button id="lrcProfGrid" title="Profile browser" aria-label="Profile browser">'+IC.grid+'</button>';
 const rp=$id('rawProf'), selp=pf.querySelector('select');
 if(rp){ rp.querySelectorAll('button').forEach(x=>{ const o=document.createElement('option'); o.value=x.dataset.p; o.textContent=x.textContent; selp.appendChild(o); });
  selp.onchange=()=>rp.querySelector('[data-p="'+selp.value+'"]')?.click(); } else selp.hidden=true;
 pf.querySelector('#lrcProfGrid').onclick=()=>$id('profBrowse')?.click();
 // WB row
 const wb=document.createElement('div'); wb.className='lrcWB';
 wb.innerHTML='<button id="lrcWBPick" title="White balance selector (W)" aria-label="White balance selector">'+IC.pick+'</button><span class="lab">WB :</span>';
 wb.querySelector('#lrcWBPick').onclick=()=>$id('wbBtn')?.click();
 const wbp=body.querySelector('.wbPre'); if(wbp){ wb.appendChild(wbp); }
 body.prepend(top,pf,wb);
 $id('profBrowse')?.closest('.row')?.classList.add('lrcHidden'); $id('rawRow')?.classList.add('lrcHidden');
 body.classList.add('lrcBasic');
 // group labels like Lightroom
 [...body.querySelectorAll(':scope>.sub')].forEach(s=>{ const t=s.textContent.trim().toLowerCase(); if(t==='white balance'||t==='raw profile') s.classList.add('lrcHideSub'); else s.classList.add('lrcGrp'); });
 // insert a thin divider row between Contrast|Highlights and Dehaze|Vibrance
 const sl=[...body.querySelectorAll(':scope>.sl')]; const by=n=>sl.find(r=>r.querySelector('label')?.textContent.trim()===n);
 ['Temp','Exposure','Highlights','Texture','Vibrance'].forEach(n=>by(n)?.classList.add('lrcGStart'));
 const TRK={Temp:'linear-gradient(90deg,#3d58c9,#8a9ad0 45%,#c9c46a 60%,#d8cf2e)',Tint:'linear-gradient(90deg,#2fa32f,#9ab89a 45%,#c08ac0 60%,#c032c0)',
  Vibrance:'linear-gradient(90deg,#9a9a9a,#5a9a8a 25%,#4a7ad0 50%,#b04ab0 75%,#e03a3a)',Saturation:'linear-gradient(90deg,#9a9a9a,#5a9a8a 25%,#4a7ad0 50%,#b04ab0 75%,#e03a3a)'};
 Object.entries(TRK).forEach(([n,v])=>by(n)?.querySelector('input[type=range]')?.style.setProperty('--trk',v));
}
function mixerTabs(){
 const m=sec('Colour Mixer'), pc=sec('Point Color'); if(!m||!pc||m.dataset.lrct) return; m.dataset.lrct=1;
 const mb=m.querySelector('.secbody'), pb=pc.querySelector('.secbody'); if(!mb||!pb) return;
 const tabs=document.createElement('div'); tabs.className='lrcTabs'; tabs.innerHTML='<button data-v="m" class="on">Mixer</button><span>|</span><button data-v="p">Point Color</button>';
 const wm=document.createElement('div'); wm.className='lrcMix'; while(mb.firstChild) wm.appendChild(mb.firstChild);
 const wp=document.createElement('div'); wp.className='lrcPC'; wp.hidden=true; while(pb.firstChild) wp.appendChild(pb.firstChild);
 const prs=pc.querySelector('.secReset'); if(prs){ const r=document.createElement('button'); r.className='lrcMini'; r.textContent='Reset Point Color'; r.onclick=e=>prs.click(); wp.appendChild(r); }
 mb.append(tabs,wm,wp); pc.classList.add('lrcGone');
 tabs.onclick=e=>{ const b=e.target.closest('button'); if(!b) return; tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); wm.hidden=b.dataset.v!=='m'; wp.hidden=b.dataset.v!=='p'; };
}

/* ---------- filmstrip header + stars ---------- */
const starSVG=n=>{ let s=''; for(let i=0;i<5;i++) s+='<text x="'+(i*9+4)+'" y="8" font-size="8" text-anchor="middle" fill="'+(i<n?'%23ddd':'%23555')+'">'+(i<n?'★':'·')+'</text>'; return 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'45\' height=\'10\'>'+s+'</svg>")'; };
function film(){
 const fs=$id('filmstrip'); if(!fs) return; const wrap=$id('fsWrap')||fs.parentNode;
 let hd=$id('lrcFsHead');
 if(!hd){ hd=document.createElement('div'); hd.id='lrcFsHead';
  hd.innerHTML='<button id="lrcGridB" title="Library grid (G)" aria-label="Library grid">'+IC.grid+'</button><button class="lrcArr" id="lrcPrevP" title="Previous photo (←)" aria-label="Previous photo">◀</button><button class="lrcArr" id="lrcNextP" title="Next photo (→)" aria-label="Next photo">▶</button><span id="lrcPath"></span><span class="sp"></span><label class="lrcFL">Filter :<span id="lrcFStars"></span></label>';
  hd.querySelector('#lrcGridB').onclick=()=>document.querySelector('[data-mod=library]')?.click();
  hd.querySelector('#lrcPrevP').onclick=()=>$id('prevBtn')?.click(); hd.querySelector('#lrcNextP').onclick=()=>$id('nextBtn')?.click();
  const fst=hd.querySelector('#lrcFStars'); const fr=$id('fRating');
  for(let i=1;i<=5;i++){ const b=document.createElement('button'); b.textContent='★'; b.dataset.r=i; b.title='Show '+i+'+ stars'; b.setAttribute('aria-label',b.title);
   b.onclick=()=>{ if(!fr) return; fr.value=(+fr.value===i?0:i); fr.dispatchEvent(new Event('input',{bubbles:true})); try{ g('renderFilmstrip')(); }catch(e){} upd(); }; fst.appendChild(b); }
  wrap.parentNode.insertBefore(hd,wrap); }
 const ph=g('photos')||[], list=(()=>{ try{ return g('filtered')(); }catch(e){ return ph; } })(), p=(()=>{ try{ return g('curPhoto')(); }catch(e){ return null; } })();
 const pt=$id('lrcPath'); const txt='Folder : Photos   '+list.length+' of '+ph.length+' photos'+(p?' / 1 selected / '+p.name:'');
 if(pt.textContent!==txt) pt.innerHTML='<span class="dim">Folder : Photos</span> &nbsp; '+list.length+' of '+ph.length+' photos'+(p?' / 1 selected / <b></b>':''), p&&(pt.querySelector('b').textContent=p.name);
 const fr=$id('fRating'); hd.querySelectorAll('#lrcFStars button').forEach(b=>b.classList.toggle('on',fr&&+b.dataset.r<=+fr.value));
 const byId={}; ph.forEach(x=>byId[x.id]=x);
 fs.querySelectorAll('img[data-id]').forEach(im=>{ const q=byId[im.dataset.id]; const r=q?(q.rating|0):0; if(im.dataset.lrcR!==String(r)){ im.dataset.lrcR=r; im.style.backgroundImage=starSVG(r); } });
}

/* ---------- soft proofing checkbox in the thin toolbar ---------- */
function toolbar(){
 const bar=$id('dtBar'); if(!bar||$id('lrcProof')) return;
 const ps=$id('proofSel'); if(!ps) return;
 const l=document.createElement('label'); l.id='lrcProof'; l.className='deskOnlyL'; l.innerHTML='<input type="checkbox"> Soft Proofing';
 const cb=l.querySelector('input'); cb.onchange=()=>{ const s=$id('proofSel'); if(!s) return; s.value=cb.checked?(s.dataset.lrcLast||'glossy'):''; s.dispatchEvent(new Event('change',{bubbles:true})); s.dispatchEvent(new Event('input',{bubbles:true})); };
 const ur=bar.querySelector('.dtUR'); bar.insertBefore(l,ur);
 const ib=document.createElement('button'); ib.type='button'; ib.id='lrcInfoB'; ib.className='dtB dtIcon deskOnly'; ib.title='Info overlay (I)'; ib.setAttribute('aria-label','Info overlay');
 ib.innerHTML=svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',20)+'<span class="dtL">Info</span>';
 ib.onclick=()=>{ localStorage.setItem('ps.info',localStorage.getItem('ps.info')==='0'?'1':'0'); upd(); };
 bar.insertBefore(ib,l);
}

/* ---------- state sync ---------- */
function upd(){
 if(!built) return;
 const p=(()=>{ try{ return g('curPhoto')(); }catch(e){ return null; } })(), S_=g('S'), at=activeTool();
 // tool strip
 document.querySelectorAll('#lrcTools button').forEach(b=>{ const k=b.dataset.t; const on=k==='sync'?used('sync',S_):k===at; b.classList.toggle('on',on); b.setAttribute('aria-pressed',on?'true':'false'); b.classList.toggle('used',k!=='edit'&&used(k,S_)); });
 // tool drawers: tool sections only show while their tool is active (like Lightroom's tool drawer)
 Object.entries(TOOLSEC).forEach(([k,n])=>{ const d=sec(n); if(!d) return; const show=at===k; d.classList.toggle('lrcDrawer',show); d.classList.toggle('lrcToolHidden',!show); if(show&&!d.dataset.lrcOpened){ d.open=true; d.dataset.lrcOpened=1; } if(!show) delete d.dataset.lrcOpened; });
 document.body.classList.toggle('lrcToolOn',at!=='edit');
 // eyes
 document.querySelectorAll('.lrcEye').forEach(e=>{ const o=off[e.dataset.k]&&off[e.dataset.k].pid===g('cur'); e.classList.toggle('off',!!o); e.closest('details')?.classList.toggle('lrcOff',!!o); });
 // B&W button
 const bw=$id('lrcBW'); if(bw) bw.classList.toggle('on',!!(S_&&S_.bwOn));
 const ps=$id('lrcProfSel'), rp=$id('rawProf'); if(ps&&rp){ const on=rp.querySelector('button.on'); if(on&&ps.value!==on.dataset.p) ps.value=on.dataset.p; const rr=$id('rawRow'); ps.closest('.lrcProf').classList.toggle('noraw',!!(rr&&(rr.hidden||rr.style.display==='none'))); }
 // info overlay
 const ib=$id('lrcInfo'); const infoOn=localStorage.getItem('ps.info')!=='0';
 if(ib){ const show=!!p&&infoOn&&g('mode')==='develop'; ib.hidden=!show; if(show){ const h=infoHTML(p); if(ib._h!==h){ ib._h=h; ib.innerHTML=h; } } }
 $id('lrcInfoB')?.classList.toggle('on',infoOn);
 // navigator image
 const ni=$id('lrcNavImg'), nb=$id('navBox'); if(ni&&p){ try{ const u=g('thumbURL')(p); if(ni._u!==u){ ni._u=u; ni.src=u; } }catch(e){} ni.hidden=!!(nb&&!nb.hidden&&nb.parentNode===$id('lpNav')); }
 // soft proof checkbox mirrors the select
 const sp=$id('proofSel'), cb=$id('lrcProof')?.querySelector('input'); if(sp&&cb){ if(sp.value) sp.dataset.lrcLast=sp.value; cb.checked=!!sp.value; }
 // module picker: Export is an action, keep Library/Develop as the bright one
 film(); headers();
}
function build(){
 if(built) return; if(!$id('panel')||!$id('dtBar')) return setTimeout(build,200);
 try{ topbar(); left(); infoBox(); right(); toolbar(); film(); built=true; upd();
  setInterval(()=>{ try{ left(); right(); toolbar(); upd(); }catch(e){ console.warn('lrc',e); } },600);
  document.addEventListener('keydown',e=>{ if(e.key==='i'||e.key==='I') setTimeout(upd,20); });
  const fs=$id('filmstrip'); if(fs) new MutationObserver(()=>film()).observe(fs,{childList:true});
  window.__lrc={upd,pickTool,eyeToggle};
 }catch(e){ console.warn('lrc build',e); }
}
topbar();
if(document.readyState==='complete') setTimeout(build,700); else addEventListener('load',()=>setTimeout(build,700));
})();
