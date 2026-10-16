'use strict';
/* Library metadata (keywords, captions, collections, search), export presets (+watermark, output sharpening),
   catalog backup/restore, HDR merge and panorama stitching */
addEventListener('DOMContentLoaded',()=>{
/* ================= (7) keywords / captions / collections / search ================= */
let colls=JSON.parse(localStorage.getItem('ps.colls')||'[]'); const saveColls=()=>localStorage.setItem('ps.colls',JSON.stringify(colls));
window.getCollections=()=>colls;
const fb=$('.filterbar'); const cs=document.createElement('select'); cs.id='fColl'; fb.insertBefore(cs,$('#fSearch'));
$('#fSearch').placeholder='Search name, keyword, caption, camera…';
function renderColls(){ const v=cs.value; cs.innerHTML=`<option value="">All photos</option>${colls.map(c=>`<option value="${c.id}">▣ ${esc(c.name)} (${photos.filter(p=>(p.collections||[]).includes(c.id)).length})</option>`).join('')}<option value="__new">+ New collection…</option>`; cs.value=colls.find(c=>c.id===v)?v:''; }
const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
cs.onchange=()=>{ if(cs.value==='__new'){ const n=prompt('Collection name'); if(n){ const c={id:'c'+uid(),name:n}; colls.push(c); saveColls(); const sl=photos.filter(p=>sel.has(p.id)); sl.forEach(p=>{ p.collections=[...(p.collections||[]),c.id]; savePhoto(p,0); }); renderColls(); cs.value=c.id; toast(sl.length?`Created “${n}” with ${sl.length} photo(s)`:`Created “${n}”`); } else cs.value=''; } renderLibrary(); };
window.matchPhoto=(p,q)=>{ const c=cs.value; if(c&&c!=='__new'&&!(p.collections||[]).includes(c)) return false; if(!q) return true;
  const e=p.exif||{}; const hay=[p.name,p.caption,(p.keywords||[]).join(' '),(p.autoKw||[]).join(' '),e.Make,e.Model,e.LensModel,p.hdr?'hdr':'',p.pano?'panorama':'',p.virtual?'virtual copy':''].join(' ').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every(t=>hay.includes(t)); };
const bInfo=document.createElement('button'); bInfo.className='btn'; bInfo.id='infoBtn'; bInfo.textContent='Info / Keywords'; $('#selAll').before(bInfo);
const bMerge=document.createElement('button'); bMerge.className='btn'; bMerge.id='mergeBtn'; bMerge.textContent='Merge…'; $('#selAll').before(bMerge);
const bBak=document.createElement('button'); bBak.className='btn'; bBak.id='bakBtn'; bBak.textContent='Backup'; $('#selAll').before(bBak);
const qInfo=document.createElement('button'); qInfo.className='btn'; qInfo.id='devInfoBtn'; qInfo.textContent='Info'; $('.quick').appendChild(qInfo);
function openInfo(){ const list=targets(); if(!list.length) return toast('Select photos first'); const one=list.length===1?list[0]:null;
  const kwAll=[...new Set(list.flatMap(p=>p.keywords||[]))]; const kwCommon=kwAll.filter(k=>list.every(p=>(p.keywords||[]).includes(k)));
  const allKw=[...new Set(photos.flatMap(p=>p.keywords||[]))].sort();
  dlg(`<h3>${one?esc(one.name):list.length+' photos'}</h3>
   <div class="f"><label>Caption</label><textarea id="iCap" rows="2" placeholder="${one?'':'(leave empty to keep each caption)'}">${one?esc(one.caption||''):''}</textarea></div>
   <div class="f"><label>Keywords</label><div class="kw" id="iKw">${kwAll.map(k=>`<span class="chip ${kwCommon.includes(k)?'':'part'}" data-k="${esc(k)}">${esc(k)} <b>×</b></span>`).join('')}</div>
     ${(()=>{ const au=[...new Set(list.flatMap(p=>p.autoKw||[]))]; return au.length?`<div class="kw" id="iAuto"><small>Auto (AI) – tap ✓ to keep, × to remove:</small> ${au.map(k=>`<span class="chip auto" data-k="${esc(k)}"><u data-keep="1" title="Keep as keyword">✓</u> ${esc(k)} <b title="Remove">×</b></span>`).join('')}</div>`:''; })()}
     <input id="iKwIn" list="kwl" placeholder="Add keywords, comma separated"><datalist id="kwl">${allKw.map(k=>`<option value="${esc(k)}">`).join('')}</datalist></div>
   <div class="f"><label>Collections</label><div id="iColl">${colls.map(c=>{ const n=list.filter(p=>(p.collections||[]).includes(c.id)).length; return `<label class="chk"><input type="checkbox" data-c="${c.id}" ${n===list.length?'checked':''} ${n&&n<list.length?'data-mixed="1"':''}> ${esc(c.name)}</label>`; }).join('')||'<small>No collections yet.</small>'}</div>
     <div class="row"><input id="iNewColl" placeholder="New collection name"><button class="btn" id="iAddColl">Add</button></div></div>
   ${one?`<div class="f"><small>${esc(exifSummary(one.exif)||'No camera info')}${one.w?` · ${one.w}×${one.h}`:''}</small></div>`:''}
   <div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="iSave">Save</button></div>`);
  const rmA=new Set(), keepA=new Set(); if($('#iAuto')) $('#iAuto').onclick=e=>{ const c=e.target.closest('.chip'); if(!c) return; const k=c.dataset.k; if(e.target.dataset.keep){ keepA.add(k); c.classList.add('kept'); } else { rmA.add(k); c.remove(); } };
  const rm=new Set(); $('#iKw').onclick=e=>{ const c=e.target.closest('.chip'); if(!c) return; rm.add(c.dataset.k); c.remove(); };
  $$('#iColl input[data-mixed]').forEach(x=>x.indeterminate=true);
  $('#iAddColl').onclick=()=>{ const n=$('#iNewColl').value.trim(); if(!n) return; const c={id:'c'+uid(),name:n}; colls.push(c); saveColls(); const l=document.createElement('label'); l.className='chk'; l.innerHTML=`<input type="checkbox" data-c="${c.id}" checked> ${esc(n)}`; $('#iColl').appendChild(l); $('#iNewColl').value=''; };
  $('#iSave').onclick=()=>{ const cap=$('#iCap').value; const add=$('#iKwIn').value.split(',').map(s=>s.trim()).filter(Boolean);
    const cb=$$('#iColl input[data-c]').map(x=>[x.dataset.c,x.indeterminate?null:x.checked]);
    for(const p of list){ if(one||cap.trim()) p.caption=cap.trim(); p.keywords=[...new Set([...(p.keywords||[]).filter(k=>!rm.has(k)),...add])];
      if(p.autoKw){ const kp=p.autoKw.filter(k=>keepA.has(k)); p.keywords=[...new Set([...p.keywords,...kp])]; p.autoKw=p.autoKw.filter(k=>!rmA.has(k)&&!keepA.has(k)); p.kwBlock=[...new Set([...(p.kwBlock||[]),...[...rmA].filter(k=>true)])]; }
      let c=new Set(p.collections||[]); for(const [id,v] of cb){ if(v===true) c.add(id); else if(v===false) c.delete(id); } p.collections=[...c]; savePhoto(p,0); }
    closeDlg(); renderColls(); if(mode==='library') renderLibrary(); toast('Saved',900); }; }
bInfo.onclick=openInfo; qInfo.onclick=openInfo; window.openInfo=openInfo;
const rl=window.renderLibrary; window.renderLibrary=function(){ rl(); renderColls(); // keyword badges
  $$('#grid .cell').forEach(c=>{ const p=photos.find(x=>x.id===c.dataset.id); if(!p) return; const t=[p.caption,(p.keywords||[]).join(', ')].filter(Boolean).join(' — '); if(t) c.title=t; if((p.keywords||[]).length&&!c.querySelector('.kwb')){ const b=document.createElement('span'); b.className='kwb'; b.textContent='🏷'+p.keywords.length; c.appendChild(b); } }); };
renderColls(); setTimeout(()=>{ if(mode==='library') renderLibrary(); },300);

/* ================= (8) export presets, watermark, output sharpening ================= */
const BUILTIN=[{name:'Full quality JPEG',q:95,size:'full',fmt:'jpeg',sharp:'off',wm:'',exif:true},
 {name:'Web 2048px (screen sharpening)',q:85,size:'edge',edge:2048,fmt:'jpeg',sharp:'screen',wm:'',exif:true},
 {name:'Instagram 1080px',q:90,size:'edge',edge:1080,fmt:'jpeg',sharp:'screen',wm:'',exif:false},
 {name:'Email / small 1200px',q:80,size:'edge',edge:1200,fmt:'jpeg',sharp:'screen',wm:'',exif:false},
 {name:'Print (matte) full',q:100,size:'full',fmt:'jpeg',sharp:'matte',wm:'',exif:true},
 {name:'PNG (lossless) full',q:100,size:'full',fmt:'png',sharp:'off',wm:'',exif:false}];
let userEP=JSON.parse(localStorage.getItem('ps.exportPresets')||'[]'); let last=JSON.parse(localStorage.getItem('ps.exp2')||'null')||{...BUILTIN[0],sharpAmt:'std',wmPos:'br',wmSize:4,wmOp:70,wmColor:'#ffffff',tmpl:'{name}-edit',edge:2048};
function openExport2(){
  const list = mode==='develop'? (curPhoto()?[curPhoto()]:[]) : (sel.size?photos.filter(p=>sel.has(p.id)):filtered()); if(!list.length) return toast('Nothing to export');
  const all=[...BUILTIN.map((p,i)=>({...p,id:'b'+i})),...userEP.map((p,i)=>({...p,id:'u'+i,user:true}))]; const o={...last};
  dlg(`<h3>Export ${list.length} photo${list.length>1?'s':''}</h3>
   <div class="f"><label>Preset</label><div class="row"><select id="xPre"><option value="">— Custom —</option>${all.map(p=>`<option value="${p.id}">${p.user?'★ ':''}${esc(p.name)}</option>`).join('')}</select><button class="btn" id="xSaveP" title="Save as preset">Save…</button><button class="btn" id="xDelP" title="Delete preset">Delete</button></div></div>
   <div class="grid2">
    <div class="f"><label>Format</label><select id="xFmt"><option value="jpeg">JPEG</option><option value="png">PNG (8-bit)</option><option value="png16">PNG 16-bit</option><option value="tiff">TIFF 8-bit</option><option value="tiff16">TIFF 16-bit</option><option value="webp">WebP</option></select></div>
    <div class="f" id="xQF"><label>Quality <b id="xQv"></b></label><input type="range" id="xQ" min="40" max="100"></div>
    <div class="f"><label>Size</label><select id="xSize"><option value="full">Full resolution</option><option value="edge">Long edge</option><option value="short">Short edge</option><option value="mp">Megapixels</option></select></div>
    <div class="f" id="xEF"><label id="xEL">Pixels</label><input type="number" id="xEdge" min="1" max="20000"></div>
    <div class="f"><label>Sharpen for</label><select id="xSh"><option value="off">None</option><option value="screen">Screen</option><option value="matte">Matte paper</option><option value="glossy">Glossy paper</option></select></div>
    <div class="f"><label>Amount</label><select id="xShA"><option value="low">Low</option><option value="std">Standard</option><option value="high">High</option></select></div>
   </div>
   <div class="f"><label>Watermark text (empty = none)</label><input id="xWm" placeholder="© Colin Diamond"></div>
   <div class="grid2" id="xWmOpts"><div class="f"><label>Position</label><select id="xWmPos">${[['tl','Top left'],['tr','Top right'],['c','Centre'],['bl','Bottom left'],['br','Bottom right']].map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></div>
    <div class="f"><label>Size (% of width)</label><input type="number" id="xWmSize" min="1" max="20" step="0.5"></div><div class="f"><label>Opacity %</label><input type="number" id="xWmOp" min="5" max="100"></div><div class="f"><label>Colour</label><input type="color" id="xWmCol"></div></div>
    <div class="grid2"><div class="f"><label class="chk"><input type="checkbox" id="xLogo"> Image logo (PNG with transparency)</label><input type="file" id="xLogoF" accept="image/png,image/webp,image/svg+xml,image/jpeg"><img id="xLogoPrev" style="max-height:34px;max-width:120px;background:repeating-conic-gradient(#555 0 25%,#333 0 50%) 0 0/10px 10px"></div><div class="f"><label>Logo size (% of width)</label><input type="number" id="xLogoSz" min="3" max="60" value="15"></div><div class="f"><label>Logo position</label><select id="xLogoPos"><option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option><option value="c">Centre</option></select></div><div class="f"><label>Logo margin %</label><input type="number" id="xLogoM" min="0" max="20" value="3"></div></div>
   <div class="f"><label>File name <small>({name} {seq} {date} {w} {h})</small></label><input id="xTmpl"></div>
   <label class="chk"><input type="checkbox" id="xExif"> Include camera info (EXIF, JPEG only)</label>
   ${list.length>1?'<div class="f"><label>Batch output</label><select id="ez"><option value="zip">Single ZIP file</option><option value="each">Separate files</option></select></div>':''}
   <div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="go">Export</button></div>`);
  const put=x=>{ $('#xFmt').value=x.fmt||'jpeg'; $('#xQ').value=x.q; $('#xQv').textContent=x.q; $('#xSize').value=x.size; $('#xEdge').value=x.size==='mp'?(x.mp||12):x.edge||2048; $('#xSh').value=x.sharp||'off'; $('#xShA').value=x.sharpAmt||'std';
    $('#xWm').value=x.wm||''; $('#xWmPos').value=x.wmPos||'br'; $('#xWmSize').value=x.wmSize||4; $('#xWmOp').value=x.wmOp||70; $('#xWmCol').value=x.wmColor||'#ffffff'; $('#xTmpl').value=x.tmpl||'{name}-edit'; $('#xExif').checked=x.exif!==false; $('#xLogo').checked=!!x.wmLogo; $('#xLogoSz').value=x.logoSz||15; $('#xLogoPos').value=x.logoPos||'br'; $('#xLogoM').value=x.logoM??3; const lg=localStorage.getItem('ps.wmLogo'); if(lg) $('#xLogoPrev').src=lg;
    $('#xLogoF').onchange=e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ localStorage.setItem('ps.wmLogo',r.result); }catch(_){ toast('Logo too large to store'); } $('#xLogoPrev').src=r.result; $('#xLogo').checked=true; }; r.readAsDataURL(f); };
    upd(); };
  const get=()=>({fmt:$('#xFmt').value,q:+$('#xQ').value,size:$('#xSize').value,edge:+$('#xEdge').value||2048,mp:+$('#xEdge').value||12,sharp:$('#xSh').value,sharpAmt:$('#xShA').value,wm:$('#xWm').value,wmPos:$('#xWmPos').value,wmSize:+$('#xWmSize').value||4,wmOp:+$('#xWmOp').value||70,wmColor:$('#xWmCol').value,tmpl:$('#xTmpl').value||'{name}-edit',exif:$('#xExif').checked,wmLogo:$('#xLogo').checked,logoSz:+$('#xLogoSz').value||15,logoPos:$('#xLogoPos').value,logoM:+$('#xLogoM').value,aiDn:$('#xDn')?$('#xDn').value:'',sr:$('#xSR')?$('#xSR').checked:false});
  const upd=()=>{ $('#xEF').hidden=$('#xSize').value==='full'; $('#xEL').textContent={edge:'Long edge (px)',short:'Short edge (px)',mp:'Megapixels'}[$('#xSize').value]||''; $('#xQF').hidden=!['jpeg','webp'].includes($('#xFmt').value); $('#xWmOpts').hidden=!$('#xWm').value; $('#xShA').disabled=$('#xSh').value==='off'; };
  ['#xSize','#xFmt','#xWm','#xSh'].forEach(s=>$(s).addEventListener('input',upd)); $('#xQ').oninput=()=>{ const v=$('#xQv'); if(v) v.textContent=($('#xQ')||{}).value; };
  put(o); $('#xPre').value=o.presetId||'';
  $('#xPre').onchange=()=>{ const p=all.find(x=>x.id===$('#xPre').value); if(p) put({...o,...p}); };
  $('#xSaveP').onclick=()=>{ const n=prompt('Export preset name'); if(!n) return; userEP.push({name:n,...get()}); localStorage.setItem('ps.exportPresets',JSON.stringify(userEP)); closeDlg(); openExport2(); toast('Export preset saved',900); };
  $('#xDelP').onclick=()=>{ const id=$('#xPre').value; if(!id.startsWith('u')) return toast('Only your own presets can be deleted'); userEP.splice(+id.slice(1),1); localStorage.setItem('ps.exportPresets',JSON.stringify(userEP)); closeDlg(); openExport2(); };
  $('#go').onclick=async()=>{ const x=get(); last={...x,presetId:$('#xPre').value}; localStorage.setItem('ps.exp2',JSON.stringify(last)); 
    expOpts={...expOpts,...x}; if(x.size==='short'||x.size==='mp') expOpts.size='edge'; expOpts._x=x; closeDlg(); seq=0; await runExport(list,$('#ez')?$('#ez').value:'one'); };
}
window.openExport=openExport2; $('#exportBtn').onclick=openExport2;
let seq=0;
// convert short-edge / megapixel targets into the long-edge the renderer uses
const baseRE=window.renderExport; window.renderExport=async function(p,opts,onMsg){ const x=opts._x; if(x&&(x.size==='short'||x.size==='mp')){ const s=p.id===cur&&S?S:p.settings; const odd=s.orient%2; const W=(odd?p.h:p.w)*s.crop.w, H=(odd?p.w:p.h)*s.crop.h;
    const k = x.size==='short' ? x.edge/Math.min(W,H) : Math.sqrt(x.mp*1e6/(W*H)); opts={...opts,size:'edge',edge:Math.round(Math.max(W,H)*Math.min(1,k))}; } return baseRE(p,opts,onMsg); };
window.exportName=p=>{ const x=expOpts._x||{}; seq++; const d=new Date(); const t=(x.tmpl||'{name}-edit').replace(/\{name\}/g,p.name.replace(/\.[^.]+$/,'')).replace(/\{seq\}/g,String(seq).padStart(3,'0')).replace(/\{date\}/g,d.toISOString().slice(0,10)).replace(/\{w\}/g,p.w).replace(/\{h\}/g,p.h).replace(/[\\/:*?"<>|]/g,'_');
  return t+({png:'.png',png16:'.png',tiff:'.tif',tiff16:'.tif',webp:'.webp'}[x.fmt]||'.jpg'); };
window.postExport=async(c,opts)=>{ const x=opts._x; if(!x) return; if(x.sharp&&x.sharp!=='off') outputSharpen(c,x.sharp,x.sharpAmt); if(x.wm) watermark(c,x); if(x.wmLogo) await logoMark(c,x); };
async function logoMark(c,x){ const src=localStorage.getItem('ps.wmLogo'); if(!src) return; const im=new Image(); im.src=src; await im.decode(); const W=c.width,H=c.height; const w=W*(x.logoSz||15)/100, h=w*im.naturalHeight/im.naturalWidth; const m=Math.min(W,H)*(x.logoM??3)/100;
  let px=W-m-w, py=H-m-h; const P=x.logoPos||'br'; if(P[1]==='l') px=m; if(P[0]==='t') py=m; if(P==='c'){ px=(W-w)/2; py=(H-h)/2; } const g=c.getContext('2d'); g.save(); g.globalAlpha=(x.wmOp||70)/100; g.drawImage(im,px,py,w,h); g.restore(); }
function outputSharpen(c,kind,amt){ const g=c.getContext('2d'); const W=c.width,H=c.height; const A={low:0.6,std:1,high:1.5}[amt||'std']*({screen:0.55,matte:1.1,glossy:0.8}[kind]); const rad=kind==='screen'?1:Math.max(1,Math.round(Math.max(W,H)/3000));
  const SH=256; for(let y0=0;y0<H;y0+=SH){ const a=Math.max(0,y0-rad), b=Math.min(H,y0+SH+rad); const im=g.getImageData(0,a,W,b-a), d=im.data; const h=b-a; const L=new Float32Array(W*h);
    for(let i=0;i<W*h;i++) L[i]=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2];
    const tmp=new Float32Array(W*h), bl=new Float32Array(W*h); const k=[1,2,1]; // separable blur (radius rad via repeated)
    let src=L; for(let r=0;r<rad;r++){ for(let y=0;y<h;y++) for(let x=0;x<W;x++){ const i=y*W+x; tmp[i]=(src[y*W+Math.max(0,x-1)]+2*src[i]+src[y*W+Math.min(W-1,x+1)])/4; }
      for(let y=0;y<h;y++) for(let x=0;x<W;x++){ const i=y*W+x; bl[i]=(tmp[Math.max(0,y-1)*W+x]+2*tmp[i]+tmp[Math.min(h-1,y+1)*W+x])/4; } src=bl.slice(); }
    const out=g.createImageData(W,Math.min(SH,H-y0)); const o=out.data; const off=y0-a;
    for(let y=0;y<out.height;y++) for(let x=0;x<W;x++){ const i=(y+off)*W+x, j=(y*W+x)*4; let det=L[i]-src[i]; det=Math.sign(det)*Math.max(0,Math.abs(det)-1.5); const f=A*det;
      o[j]=d[i*4]+f; o[j+1]=d[i*4+1]+f; o[j+2]=d[i*4+2]+f; o[j+3]=255; }
    g.putImageData(out,0,y0); } }
function watermark(c,x){ const g=c.getContext('2d'); const W=c.width,H=c.height; const fs=Math.max(10,Math.round(W*x.wmSize/100*0.55)); g.save(); g.font=`600 ${fs}px -apple-system,Segoe UI,Roboto,sans-serif`; g.globalAlpha=x.wmOp/100; g.fillStyle=x.wmColor;
  g.shadowColor='rgba(0,0,0,.45)'; g.shadowBlur=fs*0.15; const m=Math.round(fs*0.8); const tw=g.measureText(x.wm).width; let px=m, py=H-m; g.textBaseline='alphabetic';
  if(x.wmPos==='tr'||x.wmPos==='br') px=W-m-tw; if(x.wmPos==='tl'||x.wmPos==='tr') py=m+fs; if(x.wmPos==='c'){ px=(W-tw)/2; py=(H+fs*0.7)/2; } g.fillText(x.wm,px,py); g.restore(); }

/* ================= (9) backup / restore ================= */
bBak.onclick=()=>dlg(`<h3>Backup & restore</h3><p>Back up your catalog (ratings, flags, keywords, collections, edits, history, snapshots, presets). A full backup also contains your original files, so it can rebuild everything on another device.</p>
  <div class="btns" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" id="bkJson">Catalog only (.json)</button><button class="btn primary" id="bkFull">Full backup with originals</button></div>
  <hr><p><b>Restore</b> from a .json or .psbackup file. Edits are matched to photos already here (by id, or name + size); a full backup also re-adds missing photos.</p>
  <label class="btn">Choose backup file…<input type="file" id="bkIn" accept=".json,.psbackup,application/json" hidden></label><div id="bkMsg" class="hint"></div>`) ||bindBak();
function bindBak(){ $('#bkJson').onclick=()=>doBackup(false); $('#bkFull').onclick=()=>doBackup(true); $('#bkIn').onchange=e=>{ const f=e.target.files[0]; if(f) restore(f); }; }
bBak.addEventListener('click',()=>setTimeout(bindBak,0));
const strip=p=>{ const o={...p}; delete o.thumb; return JSON.parse(JSON.stringify(o)); };
function catalog(){ return {app:'photo-studio',version:2,created:new Date().toISOString(),photos:photos.map(strip),collections:colls,presets:JSON.parse(localStorage.getItem('ps.presets')||'[]'),exportPresets:userEP}; }
async function doBackup(full){ busy(true,'Preparing backup…'); try{ const cat=catalog(); let blob, name;
    if(!full){ blob=new Blob([JSON.stringify(cat)],{type:'application/json'}); name=`photo-studio-catalog-${new Date().toISOString().slice(0,10)}.json`; }
    else { const parts=[]; let off=0; cat.blobs=[]; const keys=[...new Set(photos.flatMap(p=>p.master?[]:[p.id,...(p.rawStored?[p.id+':prev']:[])]))];
      for(const k of keys){ const b=await blobGet(k); if(!b) continue; cat.blobs.push({key:k,off,size:b.size,type:b.type}); parts.push(b); off+=b.size; }
      for(const p of photos){ if(p.thumb instanceof Blob){ cat.blobs.push({key:'thumb:'+p.id,off,size:p.thumb.size,type:p.thumb.type}); parts.push(p.thumb); off+=p.thumb.size; } }
      const js=new TextEncoder().encode(JSON.stringify(cat)); const hdr=new Uint8Array(12); hdr.set(new TextEncoder().encode('PSBAK1\n\0')); new DataView(hdr.buffer).setUint32(8,js.length,true);
      blob=new Blob([hdr,js,...parts],{type:'application/octet-stream'}); name=`photo-studio-backup-${new Date().toISOString().slice(0,10)}.psbackup`; }
    window.__lastBackup={name,size:blob.size,blob}; const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),60000);
    $('#bkMsg')&&($('#bkMsg').textContent=`Saved ${name} (${(blob.size/1048576).toFixed(1)} MB)`); }
  catch(e){ console.error(e); toast('Backup failed: '+e.message,4000); } finally{ busy(false); } }
async function restore(file){ busy(true,'Restoring…'); try{ let cat, base=null; const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
    if(new TextDecoder().decode(head.slice(0,6))==='PSBAK1'){ const n=new DataView(head.buffer).getUint32(8,true); cat=JSON.parse(new TextDecoder().decode(await file.slice(12,12+n).arrayBuffer())); base=12+n; }
    else cat=JSON.parse(await file.text());
    if(cat.app!=='photo-studio') throw new Error('Not a Photo Studio backup');
    const bl=new Map((cat.blobs||[]).map(b=>[b.key,b])); let upd=0, added=0, skipped=0;
    for(const q of cat.photos){ let p=photos.find(x=>x.id===q.id) || photos.find(x=>!q.master&&x.name===q.name&&x.size===q.size&&!x.master);
      if(p){ const keep={id:p.id,thumb:p.thumb,master:q.master&&p.master?p.master:p.master}; Object.assign(p,q,keep); fillDefaults(p.settings); savePhoto(p,0); upd++; continue; }
      const own=q.master?null:bl.get(q.id); const masterOK=q.master&&(photos.find(x=>x.id===q.master)||bl.get(q.master));
      if(base!=null&&(own||masterOK)){ if(own){ await blobPut(q.id,file.slice(base+own.off,base+own.off+own.size,own.type)); const pv=bl.get(q.id+':prev'); if(pv) await blobPut(q.id+':prev',file.slice(base+pv.off,base+pv.off+pv.size,pv.type)); }
        const t=bl.get('thumb:'+q.id); const np={...q,thumb:t?file.slice(base+t.off,base+t.off+t.size,t.type):null}; if(np.thumb) np.thumb=new Blob([await np.thumb.arrayBuffer()],{type:t.type}); fillDefaults(np.settings); await dbPut(np); photos.push(np); added++; }
      else skipped++; }
    for(const c of cat.collections||[]) if(!colls.find(x=>x.id===c.id)) colls.push(c); saveColls();
    const pr=JSON.parse(localStorage.getItem('ps.presets')||'[]'); for(const x of cat.presets||[]) if(!pr.find(y=>y.name===x.name)) pr.push(x); localStorage.setItem('ps.presets',JSON.stringify(pr));
    for(const x of cat.exportPresets||[]) if(!userEP.find(y=>y.name===x.name)) userEP.push(x); localStorage.setItem('ps.exportPresets',JSON.stringify(userEP));
    window.__lastRestore={upd,added,skipped}; closeDlg(); renderLibrary(); toast(`Restored: ${upd} updated, ${added} added${skipped?`, ${skipped} not found (originals not in this file)`:''}`,5000); }
  catch(e){ console.error(e); toast('Restore failed: '+e.message,5000); } finally{ busy(false); } }
window.restoreBackup=restore; window.makeBackup=doBackup;

/* ================= (6) HDR merge & panorama ================= */
bMerge.onclick=()=>{ const list=photos.filter(p=>sel.has(p.id)); if(list.length<2) return toast('Select 2 or more photos to merge');
  dlg(`<h3>Merge ${list.length} photos</h3><div class="btns" style="justify-content:flex-start"><button class="btn primary" id="mHdr">HDR (bracketed exposures)</button><button class="btn primary" id="mPano">Panorama</button></div>
   <label class="chk"><input type="checkbox" id="mAlign" checked> Auto-align (handheld)</label><p class="hint">HDR creates a high-dynamic-range photo you can develop like a RAW (Exposure/Highlights/Shadows have extra headroom). Panorama: shoot left→right (or select in order) with ~30–50% overlap.</p>`);
  $('#mHdr').onclick=()=>{ const al=$('#mAlign').checked; closeDlg(); mergeHDR(list,al); }; $('#mPano').onclick=()=>{ closeDlg(); stitchPano(list); }; };
const LIN=new Float32Array(256); for(let i=0;i<256;i++){ const v=i/255; LIN[i]=v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4); }
async function loadPx(p,maxDim){ const img=await decode(await blobGet(p.rawStored?p.id+':prev':p.id)); let c=scaledCanvas(img,maxDim); if(img.close) img.close();
  const s=p.settings; if(p.raw&&s&&s.orient) c=orientCanvas(c,s.orient,s.flipH); const d=c.getContext('2d').getImageData(0,0,c.width,c.height); return {w:c.width,h:c.height,data:d.data}; }
function gray(P,k){ const w=Math.max(1,Math.round(P.w*k)), h=Math.max(1,Math.round(P.h*k)); const o=new Float32Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ let s=0,n=0; const x0=Math.floor(x/k), y0=Math.floor(y/k), x1=Math.min(P.w,Math.floor((x+1)/k)), y1=Math.min(P.h,Math.floor((y+1)/k));
    for(let yy=y0;yy<Math.max(y0+1,y1);yy+=Math.max(1,(y1-y0)>>1)) for(let xx=x0;xx<Math.max(x0+1,x1);xx+=Math.max(1,(x1-x0)>>1)){ const i=(yy*P.w+xx)*4; s+=0.3*P.data[i]+0.59*P.data[i+1]+0.11*P.data[i+2]; n++; } o[y*w+x]=s/n; } return {w,h,o}; }
// Median-threshold-bitmap alignment (Ward 2003): robust across exposures
function mtbAlign(A,B){ const n=Math.max(1,Math.floor(Math.log2(Math.max(A.w,A.h)/64))); let sh=[0,0];
  const bm=g=>{ const s=Float32Array.from(g.o).sort(); const med=s[s.length>>1]; const t=new Uint8Array(g.o.length), e=new Uint8Array(g.o.length); for(let i=0;i<g.o.length;i++){ t[i]=g.o[i]>med; e[i]=Math.abs(g.o[i]-med)>4; } return {t,e}; };
  for(let l=n;l>=0;l--){ const k=1/(1<<l); const a=gray(A,k), b=gray(B,k); sh=[sh[0]*2,sh[1]*2]; if(l===n) sh=[0,0];
    const ba=bm(a), bb=bm(b); let best=1e18, bs=sh; const st=l===0?2:1;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const sx=sh[0]+dx, sy=sh[1]+dy; let err=0;
      for(let y=Math.max(0,-sy);y<Math.min(a.h,b.h-sy);y+=st) for(let x=Math.max(0,-sx);x<Math.min(a.w,b.w-sx);x+=st){ const i=y*a.w+x, j=(y+sy)*b.w+x+sx; if((ba.t[i]^bb.t[j])&ba.e[i]&bb.e[j]) err++; }
      if(err<best){ best=err; bs=[sx,sy]; } } sh=bs; }
  return sh; }
function evOf(p){ const e=p.exif||{}; const t=rat(e.ExposureTime)||(+e.ExposureTime||0), f=rat(e.FNumber)||(+e.FNumber||0), iso=+e.ISO||100; if(!t) return null; return Math.log2(t*(iso/100)/((f||1)*(f||1))); }
async function mergeHDR(list,align){ busy(true,'HDR: loading exposures…'); try{ await nextFrame(); const maxD=isTouch?2400:3600;
    const P=[]; for(const p of list) P.push({p,px:await loadPx(p,maxD),ev:evOf(p)});
    const w=Math.min(...P.map(x=>x.px.w)), h=Math.min(...P.map(x=>x.px.h)); 
    // exposure: from EXIF, else from brightness ratio
    const meanLin=x=>{ let s=0,n=0; for(let i=0;i<x.px.data.length;i+=4*7){ const v=x.px.data[i+1]; if(v>10&&v<245){ s+=LIN[v]; n++; } } return n?s/n:0.18; };
    P.forEach(x=>x.br=meanLin(x)); P.sort((a,b)=> (a.ev!=null&&b.ev!=null&&Math.abs(a.ev-b.ev)>0.3)? a.ev-b.ev : a.br-b.br);
    const ref=P[Math.floor((P.length-1)/2)];
    const evOK=P.every(x=>x.ev!=null)&&Math.max(...P.map(x=>x.ev))-Math.min(...P.map(x=>x.ev))>0.3; if(evOK) P.forEach(x=>x.k=Math.pow(2,x.ev-ref.ev));
    else { // relative gain from pixels well exposed in both
      P.forEach(x=>{ if(x===ref){ x.k=1; return; } const r=[]; for(let i=0;i<w*h*4;i+=4*11){ const a=x.px.data[i+1], b=ref.px.data[i+1]; if(a>25&&a<230&&b>25&&b<230) r.push(LIN[a]/LIN[b]); } r.sort((u,v)=>u-v); x.k=r.length?r[r.length>>1]:1; }); }
    if(align){ busy(true,'HDR: aligning…'); await nextFrame(); for(const x of P) x.sh = x===ref?[0,0]:mtbAlign(ref.px,x.px); } else P.forEach(x=>x.sh=[0,0]);
    busy(true,'HDR: merging…'); await nextFrame();
    const rad=new Float32Array(w*h*3); let mx=0; const n=P.length;
    const darkest=P[0], brightest=P[n-1];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ let s0=0,s1=0,s2=0,ws=0;
      for(const q of P){ const xx=x+q.sh[0], yy=y+q.sh[1]; if(xx<0||yy<0||xx>=q.px.w||yy>=q.px.h) continue; const i=(yy*q.px.w+xx)*4; const d=q.px.data; const m=Math.max(d[i],d[i+1],d[i+2])/255;
        let wt=1-Math.pow(2*m-1,12); if(m>0.96&&q!==darkest) wt*=0.001; if(m<0.03&&q!==brightest) wt*=0.05; wt=Math.max(wt,1e-4);
        s0+=wt*LIN[d[i]]/q.k; s1+=wt*LIN[d[i+1]]/q.k; s2+=wt*LIN[d[i+2]]/q.k; ws+=wt; }
      const o=(y*w+x)*3; rad[o]=s0/ws; rad[o+1]=s1/ws; rad[o+2]=s2/ws; if(rad[o+1]>mx) mx=Math.max(mx,rad[o],rad[o+1],rad[o+2]); }
     mx=Math.max(mx,1e-3); const u16=new Uint16Array(w*h*3); for(let i=0;i<u16.length;i++) u16[i]=Math.min(65535,Math.round(rad[i]/mx*65535));
    const hdr=new Blob([encodeHDR(w,h,Math.log2(mx),u16)],{type:'application/x-photostudio-hdr'});
    // tone-mapped preview JPEG (Reinhard) for thumbnail/fallback
    const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); const im=g.createImageData(w,h);
    for(let i=0,j=0;i<w*h*3;i+=3,j+=4){ for(let ch=0;ch<3;ch++){ const v=rad[i+ch]; const t=v/(1+v); im.data[j+ch]=255*Math.pow(t,1/2.2); } im.data[j+3]=255; } g.putImageData(im,0,0);
    const prev=await canvasBlob(c,'image/jpeg',0.9); const thumb=await canvasBlob(scaledCanvas(c,480),'image/jpeg',0.82);
    const s=defaults(); const base=list[0]; const name=base.name.replace(/\.[^.]+$/,'')+`-HDR.pshdr`;
    const np={id:uid(),name,added:Date.now(),w,h,raw:true,rawStored:true,hdr:true,exif:base.exif,rating:0,flag:0,settings:s,history:[{label:'HDR merge',s:clone(s)}],hIdx:0,thumb,edited:false,size:hdr.size,keywords:['HDR'],mergeInfo:{from:list.map(p=>p.name),ev:P.map(x=>+Math.log2(x.k).toFixed(2)),shifts:P.map(x=>x.sh),range:+Math.log2(mx/Math.max(1e-4,minPos(rad))).toFixed(1)}};
    await blobPut(np.id,hdr); await blobPut(np.id+':prev',prev); await dbPut(np); photos.push(np); window.__lastMerge=np.mergeInfo;
    busy(false); renderLibrary(); toast(`HDR created from ${list.length} exposures (${np.mergeInfo.ev.map(v=>(v>0?'+':'')+v).join(', ')} EV)`,4000); openDevelop(np.id); }
  catch(e){ console.error(e); busy(false); toast('HDR merge failed: '+e.message,5000); } }
function minPos(a){ let m=1e9; for(let i=1;i<a.length;i+=3*7) if(a[i]>0&&a[i]<m) m=a[i]; return m; }
function encodeHDR(w,h,base,u16){ const b=new ArrayBuffer(20+u16.byteLength); const dv=new DataView(b); new Uint8Array(b).set(new TextEncoder().encode('PSHDR1\0\0')); dv.setUint32(8,w,true); dv.setUint32(12,h,true); dv.setFloat32(16,base,true); new Uint16Array(b,20).set(u16); return b; }
// teach the RAW pipeline to read our HDR container (linear sRGB, identity matrix)
const baseLib=window.rawLib; window.rawLib=async()=>{ const isH=buf=>buf.byteLength>20&&new TextDecoder().decode(new Uint8Array(buf,0,6))==='PSHDR1';
  let lib=null; const get=async()=>lib||(lib=await baseLib());
  return async(buf,opt={})=>{ if(!isH(buf)) return (await get())(buf,opt); const t0=performance.now(); const dv=new DataView(buf); const W=dv.getUint32(8,true), H=dv.getUint32(12,true), base=dv.getFloat32(16,true); let d=new Uint16Array(buf,20,W*H*3);
    let w=W,h=H; if(opt.cropbox){ const [x,y,cw,ch]=opt.cropbox; const o=new Uint16Array(cw*ch*3); for(let r=0;r<ch;r++) o.set(d.subarray(((y+r)*W+x)*3,((y+r)*W+x+cw)*3),r*cw*3); d=o; w=cw; h=ch; }
    else if(opt.half){ w=W>>1; h=H>>1; const o=new Uint16Array(w*h*3); for(let y=0;y<h;y++) for(let x=0;x<w;x++) for(let c=0;c<3;c++){ const a=((2*y)*W+2*x)*3+c; o[(y*w+x)*3+c]=(d[a]+d[a+3]+d[a+W*3]+d[a+W*3+3])>>2; } d=o; }
    else d=d.slice();
    return {w,h,colors:3,bits:16,data:d,mat:[1,0,0,0,1,0,0,0,1],camMul:[1,1,1,1],baseline:base,fullW:W,fullH:H,make:'Photo Studio',model:'HDR merge',ms:performance.now()-t0,meta:{filters:0,width:W,height:H}}; }; };
// Panorama: cylindrical projection, translation alignment on gradient images, gain compensation, feather blending
async function stitchPano(list){ busy(true,'Panorama: loading…'); try{ await nextFrame(); const maxD=isTouch?1600:2400;
    const P=[]; for(const p of list) P.push({p,px:await loadPx(p,maxD)});
    const e=list[0].exif||{}; const f35=+(e.FocalLength35||0)||((rat(e.FocalLength)||0)*1.5)||28; 
    const W=P[0].px.w, H=P[0].px.h; const f=Math.max(W,H)*f35/36; // focal length in pixels (36mm-wide frame)
    busy(true,'Panorama: projecting…'); await nextFrame(); for(const q of P) q.cy=cyl(q.px,f);
    // pairwise alignment (consecutive, in selection/name order)
    const pos=[[0,0]]; const info=[];
    for(let i=1;i<P.length;i++){ busy(true,`Panorama: aligning ${i}/${P.length-1}…`); await nextFrame(); const r=matchPair(P[i-1].cy,P[i].cy); if(!r) throw new Error(`Couldn't find overlap between photo ${i} and ${i+1} (shoot with 30–50% overlap, left to right)`);
      pos.push([pos[i-1][0]+r.dx,pos[i-1][1]+r.dy]); info.push(r); }
    // gain compensation from overlaps
    const gains=[1]; for(let i=1;i<P.length;i++){ gains.push(gains[i-1]*info[i-1].gain); } const gm=Math.pow(gains.reduce((a,b)=>a*b,1),1/gains.length); for(let i=0;i<gains.length;i++) gains[i]/=gm;
    const x0=Math.min(...pos.map(p=>p[0])), y0=Math.min(...pos.map(p=>p[1])); const x1=Math.max(...pos.map((p,i)=>p[0]+P[i].cy.w)), y1=Math.max(...pos.map((p,i)=>p[1]+P[i].cy.h));
    const OW=Math.round(x1-x0), OH=Math.round(y1-y0); busy(true,'Panorama: blending…'); await nextFrame();
    const acc=new Float32Array(OW*OH*3), ws=new Float32Array(OW*OH);
    P.forEach((q,k)=>{ const c=q.cy, ox=Math.round(pos[k][0]-x0), oy=Math.round(pos[k][1]-y0); const gk=gains[k];
      for(let y=0;y<c.h;y++) for(let x=0;x<c.w;x++){ const i=y*c.w+x; const m=c.m[i]; if(!m) continue; const wx=Math.min(x,c.w-1-x)+1, wy=Math.min(y,c.h-1-y)+1; const wt=m*Math.min(wx,wy*3); const o=(y+oy)*OW+x+ox;
        acc[o*3]+=wt*LIN[c.d[i*4]]*gk; acc[o*3+1]+=wt*LIN[c.d[i*4+1]]*gk; acc[o*3+2]+=wt*LIN[c.d[i*4+2]]*gk; ws[o]+=wt; } });
    // crop to the largest fully covered horizontal band
    let top=0, bot=OH-1; const cov=y=>{ let n=0; for(let x=0;x<OW;x++) if(ws[y*OW+x]>0) n++; return n/OW; }; while(top<OH/3&&cov(top)<0.995) top++; while(bot>OH*2/3&&cov(bot)<0.995) bot--;
    let left=0,right=OW-1; const covc=x=>{ let n=0; for(let y=top;y<=bot;y++) if(ws[y*OW+x]>0) n++; return n/(bot-top+1); }; while(left<OW/4&&covc(left)<0.999) left++; while(right>OW*3/4&&covc(right)<0.999) right--;
    const cw=right-left+1, ch=bot-top+1; const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch; const g=cv.getContext('2d'); const im=g.createImageData(cw,ch); const enc=v=>255*(v<=0.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-0.055);
    for(let y=0;y<ch;y++) for(let x=0;x<cw;x++){ const o=(y+top)*OW+x+left, j=(y*cw+x)*4; const wv=ws[o]||1; im.data[j]=enc(acc[o*3]/wv); im.data[j+1]=enc(acc[o*3+1]/wv); im.data[j+2]=enc(acc[o*3+2]/wv); im.data[j+3]=255; }
    g.putImageData(im,0,0); const blob=await canvasBlob(cv,'image/jpeg',0.93); const name=list[0].name.replace(/\.[^.]+$/,'')+'-Pano.jpg';
    window.__lastMerge={pano:true,size:[cw,ch],pos,gains:gains.map(v=>+v.toFixed(3)),scores:info.map(r=>+r.score.toFixed(3))};
    busy(false); const n0=photos.length; await importFiles([new File([blob],name,{type:'image/jpeg'})]); const np=photos[photos.length-1]; if(photos.length>n0){ np.pano=true; np.keywords=['panorama']; savePhoto(np,0); renderLibrary(); openDevelop(np.id); }
    toast(`Panorama ${cw}×${ch} from ${list.length} photos`,3500); }
  catch(e){ console.error(e); busy(false); toast('Panorama failed: '+e.message,6000); } }
function cyl(P,f){ const W=P.w,H=P.h, cx=W/2, cy=H/2; const ow=Math.round(2*f*Math.atan(W/2/f)); const d=new Uint8ClampedArray(ow*H*4), m=new Uint8Array(ow*H);
  for(let y=0;y<H;y++) for(let x=0;x<ow;x++){ const th=(x-ow/2)/f; const sx=f*Math.tan(th)+cx, sy=(y-cy)/Math.cos(th)+cy; if(sx<0||sy<0||sx>W-1||sy>H-1) continue;
    const x0=sx|0,y0=sy|0,tx=sx-x0,ty=sy-y0, i=(y*ow+x)*4; const a=(y0*W+x0)*4, b=a+4, c2=a+W*4, e=c2+4; const x1ok=x0+1<W, y1ok=y0+1<H;
    for(let ch=0;ch<3;ch++){ const p00=P.data[a+ch], p10=x1ok?P.data[b+ch]:p00, p01=y1ok?P.data[c2+ch]:p00, p11=x1ok&&y1ok?P.data[e+ch]:p00; d[i+ch]=(p00*(1-tx)+p10*tx)*(1-ty)+(p01*(1-tx)+p11*tx)*ty; } d[i+3]=255; m[y*ow+x]=1; }
  return {w:ow,h:H,d,m}; }
function matchPair(A,B){ // coarse-to-fine search of B's offset relative to A, using normalised gradient correlation
  const lv=(C,k)=>{ const w=Math.max(8,Math.round(C.w*k)), h=Math.max(8,Math.round(C.h*k)); const g=new Float32Array(w*h), m=new Uint8Array(w*h);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const sx=Math.min(C.w-1,Math.floor(x/k)), sy=Math.min(C.h-1,Math.floor(y/k)); const i=sy*C.w+sx; m[y*w+x]=C.m[i]; g[y*w+x]=0.3*C.d[i*4]+0.59*C.d[i*4+1]+0.11*C.d[i*4+2]; }
    const gr=new Float32Array(w*h); for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=y*w+x; gr[i]=(m[i-1]&&m[i+1]&&m[i-w]&&m[i+w])?Math.hypot(g[i+1]-g[i-1],g[i+w]-g[i-w]):0; } return {w,h,g:gr,lum:g,m}; };
  const score=(a,b,dx,dy,step)=>{ let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0; const x0=Math.max(1,dx+1), x1=Math.min(a.w-1,dx+b.w-1), y0=Math.max(1,dy+1), y1=Math.min(a.h-1,dy+b.h-1);
    if(x1-x0<a.w*0.12||y1-y0<a.h*0.5) return -1; for(let y=y0;y<y1;y+=step) for(let x=x0;x<x1;x+=step){ const i=y*a.w+x, j=(y-dy)*b.w+x-dx; if(!a.m[i]||!b.m[j]) continue; const u=a.g[i], v=b.g[j]; sa+=u; sb+=v; saa+=u*u; sbb+=v*v; sab+=u*v; n++; }
    if(n<50) return -1; const cv=sab/n-sa/n*sb/n, va=saa/n-(sa/n)**2, vb=sbb/n-(sb/n)**2; return cv/Math.sqrt(va*vb+1e-9); };
  let k=Math.min(1,160/A.w); let a=lv(A,k), b=lv(B,k); let best=-2, bd=[0,0];
  for(let dy=-Math.round(a.h*0.15);dy<=Math.round(a.h*0.15);dy++) for(let dx=Math.round(a.w*0.05);dx<=Math.round(a.w*0.9);dx++){ const s=score(a,b,dx,dy,2); if(s>best){ best=s; bd=[dx,dy]; } }
  if(best<0.15) return null;
  for(const kk of [Math.min(1,400/A.w),Math.min(1,900/A.w),1]){ const r=kk/k; k=kk; a=lv(A,k); b=lv(B,k); const c=[Math.round(bd[0]*r),Math.round(bd[1]*r)]; let bb=-2, b2=c; const R=Math.ceil(r)+1;
    for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){ const s=score(a,b,c[0]+dx,c[1]+dy,kk===1?2:1); if(s>bb){ bb=s; b2=[c[0]+dx,c[1]+dy]; } } bd=b2; best=bb; }
  // gain from overlap luminance
  let la=0,lb=0; for(let y=Math.max(0,bd[1]);y<Math.min(a.h,bd[1]+b.h);y+=3) for(let x=Math.max(0,bd[0]);x<Math.min(a.w,bd[0]+b.w);x+=3){ const i=y*a.w+x, j=(y-bd[1])*b.w+x-bd[0]; if(a.m[i]&&b.m[j]){ la+=LIN[Math.round(a.lum[i])]; lb+=LIN[Math.round(b.lum[j])]; } }
  return {dx:bd[0],dy:bd[1],score:best,gain:lb>0?la/lb:1}; }
});
