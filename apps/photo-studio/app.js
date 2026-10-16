'use strict';
/* ================= Utilities ================= */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clone=o=>JSON.parse(JSON.stringify(o));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const isTouch = matchMedia('(pointer:coarse)').matches;
function toast(m,ms=2200){ const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),ms); }
function busy(on,msg){ $('#busy').hidden=!on; if(msg) $('#busyMsg').textContent=msg; }
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));

/* ================= Settings model ================= */
const LINE=()=>[[0,0],[1,1]];
function defaults(){ return {
  wbTemp:0,wbTint:0,exposure:0,contrast:0,highlights:0,shadows:0,whites:0,blacks:0,
  texture:0,clarity:0,dehaze:0,vibrance:0,saturation:0,
  curve:{m:LINE(),r:LINE(),g:LINE(),b:LINE()},
  hsl:{h:[0,0,0,0,0,0,0,0],s:[0,0,0,0,0,0,0,0],l:[0,0,0,0,0,0,0,0]},
  bwOn:false,bwMix:[0,0,0,0,0,0,0,0],
  grade:{sh:{h:220,s:0,l:0},mid:{h:40,s:0,l:0},hi:{h:45,s:0,l:0},glob:{h:30,s:0,l:0},blend:50,balance:0},
  sharpAmount:40,sharpRadius:1.0,sharpDetail:25,sharpMasking:0,
  nrLum:0,nrLumDetail:50,nrLumContrast:0,nrColor:25,nrColorDetail:50,nrColorSmooth:50,
  vigAmount:0,vigMid:50,vigRound:0,vigFeather:50,vigStyle:0,vigHi:0,grainAmount:0,grainSize:25,grainRough:50,
  crop:{x:0,y:0,w:1,h:1},angle:0,orient:0,flipH:false,aspect:'orig',
  masks:[],spots:[],healStrokes:[],guides:[],upright:'off',rawProfile:'standard',lensVig:0,lensVigMid:50,distortion:0,perspV:0,perspH:0,perspScale:100,perspRot:0,perspAspect:0,perspX:0,perspY:0,
  lb:null,pcol:[],cal:null,pcurve:null,moire:0,lsharp:0,lshC:0.6,lshB:30,psc:0,rend:'none',rendAmt:100,hcurve:null,slMode:'face',slSpot:null,sl:0,slFace:true,cv:0,air:null,mc:0,fc:0,caR:0,caB:0,fringe:0,fringeG:0,fringePR:40,fringeGR:30,lsoft:0,vol:0,volMode:'diag',volF:24,cw:{on:false,h:20,range:25,fall:25,dh:0,ds:0,dl:0},cps:[],film:'none',filmAmt:100,fcH:0,fcS:0,stHi:0,stMid:0,stSh:0,stBlk:0,redEyes:[],fBlur:0,leak:0,leakPos:'left',leakCol:'warm',texture2:0,frame:'none',frameW:25
};}
const GEOM=['crop','angle','orient','flipH','aspect','masks','spots','healStrokes','guides','upright','cps','faces','redEyes'];
const VIEWGEOM=['crop','angle','orient','flipH','aspect','distortion','perspV','perspH','perspScale','perspRot','perspAspect','perspX','perspY','vol','volMode','volF'];
function fillDefaults(s){ const d=defaults(); for(const k in d) if(s[k]===undefined) s[k]=Array.isArray(d[k])?d[k].slice():d[k]; for(const k of ['curve','hsl','grade']) for(const j in d[k]) if(s[k][j]===undefined) s[k][j]=Array.isArray(d[k][j])?d[k][j].slice():d[k][j]; if(!Array.isArray(s.bwMix)||s.bwMix.length!==8) s.bwMix=(d.bwMix||[0,0,0,0,0,0,0,0]).slice(); if(!Array.isArray(s.redEyes)) s.redEyes=[]; return s; }
function isEdited(s){ const d=defaults(); return JSON.stringify(s)!==JSON.stringify(d); }

/* ================= IndexedDB ================= */
let DB;
function openDB(){ return new Promise((res,rej)=>{ const r=indexedDB.open('photostudio',1);
  r.onupgradeneeded=()=>{ const d=r.result; d.createObjectStore('photos',{keyPath:'id'}); d.createObjectStore('blobs'); };
  r.onsuccess=()=>{DB=r.result;res();}; r.onerror=()=>rej(r.error); }); }
function tx(store,mode,fn){ return new Promise((res,rej)=>{ const t=DB.transaction(store,mode); const s=t.objectStore(store); const r=fn(s); t.oncomplete=()=>res(r&&r.result); t.onerror=()=>rej(t.error); }); }
const dbAll=()=>tx('photos','readonly',s=>s.getAll());
const dbPut=p=>tx('photos','readwrite',s=>s.put(p));
const dbDelAll=id=>Promise.all([tx('photos','readwrite',s=>s.delete(id)),tx('blobs','readwrite',s=>s.delete(id)),tx('blobs','readwrite',s=>s.delete(id+':prev'))]);
// virtual copies share the master's blobs: only delete blobs when nothing else references them
const dbDel=async id=>{ const p=photos.find(x=>x.id===id); const owner=(p&&p.master)||id; const others=photos.filter(x=>x.id!==id&&(x.id===owner||x.master===owner));
  await tx('photos','readwrite',s=>s.delete(id)); if(!others.length){ await tx('blobs','readwrite',s=>s.delete(owner)); await tx('blobs','readwrite',s=>s.delete(owner+':prev')); } };
function blobKey(k){ const [a,...r]=String(k).split(':'); const p=photos.find(x=>x.id===a); return p&&p.master?[p.master,...r].join(':'):k; }
const blobPut=(id,b)=>tx('blobs','readwrite',s=>s.put(b,id));
const blobGet=id=>tx('blobs','readonly',s=>s.get(blobKey(id)));
const saveTimers={};
function savePhoto(p,delay=400){ clearTimeout(saveTimers[p.id]); saveTimers[p.id]=setTimeout(()=>dbPut(p).catch(e=>console.error(e)),delay); }

/* ================= Decoding / RAW ================= */
const RAW_EXT=/\.(dng|cr2|cr3|crw|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|srw|3fr|iiq|erf|kdc|mrw|x3f|raw|rwl|mos)$/i;
// Find embedded JPEG previews in a RAW container by walking JPEG segment structure.
function extractRawJpegs(buf){
  const b=new Uint8Array(buf), found=[];
  for(let i=0;i<b.length-4;i++){
    if(b[i]!==0xFF||b[i+1]!==0xD8||b[i+2]!==0xFF) continue;
    let p=i+2, ok=false, sof=null;
    while(p<b.length-4){
      if(b[p]!==0xFF){ break; }
      const m=b[p+1]; if(m===0xFF){p++;continue;}
      if(m===0xD9){ ok=true; p+=2; break; }
      const len=(b[p+2]<<8)|b[p+3];
      if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC) sof={m,h:(b[p+5]<<8)|b[p+6],w:(b[p+7]<<8)|b[p+8]};
      if(m===0xDA){ p+=2+len; // entropy-coded data
        while(p<b.length-1){ if(b[p]===0xFF){ const n=b[p+1]; if(n===0x00||(n>=0xD0&&n<=0xD7)){p+=2;continue;} if(n===0xD9){ok=true;p+=2;} else if(n===0xFF){p++;continue;} break;} p++; }
        if(ok) break; continue; }
      p+=2+len;
    }
    if(ok && sof && sof.m!==0xC3 && p-i>20000){ found.push({start:i,end:p,w:sof.w,h:sof.h}); i=p-1; }
  }
  found.sort((a,b)=>b.w*b.h-a.w*a.h);
  return found.map(f=>new Blob([b.subarray(f.start,f.end)],{type:'image/jpeg'}));
}
async function decode(blob){
  try{ return await createImageBitmap(blob,{imageOrientation:'from-image'}); }catch(e){}
  try{ return await createImageBitmap(blob); }catch(e){}
  const url=URL.createObjectURL(blob); const img=new Image(); img.src=url;
  try{ await img.decode(); }finally{ setTimeout(()=>URL.revokeObjectURL(url),5000); }
  return img;
}
const dimsOf=im=>({w:im.naturalWidth||im.width,h:im.naturalHeight||im.height});
function scaledCanvas(img,maxDim,maxArea=16e6){
  const {w,h}=dimsOf(img); let k=Math.min(1,maxDim/Math.max(w,h)); if(w*h*k*k>maxArea) k=Math.sqrt(maxArea/(w*h));
  const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
  const g=c.getContext('2d'); g.imageSmoothingQuality='high'; g.drawImage(img,0,0,c.width,c.height); return c;
}
function orientCanvas(c,o,fl){ const d=document.createElement('canvas'); const odd=o%2; d.width=odd?c.height:c.width; d.height=odd?c.width:c.height; const g=d.getContext('2d');
  g.translate(d.width/2,d.height/2); g.rotate(o*Math.PI/2); if(fl) g.scale(-1,1); g.drawImage(c,-c.width/2,-c.height/2); return d; }
const canvasBlob=(c,type='image/jpeg',q=0.85)=>new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Encoding failed (image too large for this browser?)')),type,q));

/* ================= App state ================= */
let photos=[], cur=null, sel=new Set(), lastSel=null, mode='library';
let engine, S=null; // S = settings of current photo (live)
let beforeOn=false, cropOn=false, dirty=false, histT=0;
let clip=JSON.parse(localStorage.getItem('ps.clip')||'null');
const curPhoto=()=>photos.find(p=>p.id===cur);

/* ================= Import ================= */
async function importFiles(files){
  files=[...files].filter(f=>f.type.startsWith('image/')||RAW_EXT.test(f.name)||/\.(heic|heif|avif|jpe?g|png|webp|tiff?)$/i.test(f.name));
  if(!files.length) return toast('No supported images found');
  let n=0, failed=[];
  for(const f of files){
    busy(true,`Importing ${++n} of ${files.length}…`);
    try{
      let blob=f, img=null, raw=RAW_EXT.test(f.name), prevBlob=null;
      if(raw){ const cands=extractRawJpegs(await f.arrayBuffer());
        for(const c of cands){ try{ img=await decode(c); prevBlob=c; break; }catch(e){} }
        if(!img){ // no usable embedded preview: decode the RAW itself (half size) for a preview
          const d=await (await rawLib())(await f.arrayBuffer(),{half:true}); const R=toRawSource(d); const tmp=engine.makeState(null,{raw:R,w:R.w,h:R.h,fullW:R.fullW,fullH:R.fullH}); const s0=defaults();
          engine.process(tmp,s0); const px=engine.readOut(tmp,s0,R.w,R.h); engine.freeState(tmp); engine.freeRaw(R); const c=document.createElement('canvas'); c.width=d.w; c.height=d.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer),d.w,d.h),0,0); prevBlob=await canvasBlob(c,'image/jpeg',0.9); img=await decode(prevBlob); }
      } else img=await decode(f);
      const {w,h}=dimsOf(img);
      let exif=null; try{ exif=parseExif(await f.slice(0,Math.min(f.size,raw?4e6:/\.(heic|heif|hif)$/i.test(f.name)?64e6:1e6)).arrayBuffer()); }catch(e){}
      const s=defaults(); let tc=scaledCanvas(img,480);
      if(raw&&exif&&exif.Orientation>1){ const [o,fl]=orientToSettings(exif.Orientation); s.orient=o; s.flipH=!!fl; tc=orientCanvas(tc,o,fl); }
      const thumb=await canvasBlob(tc,'image/jpeg',0.82);
      const p={id:uid(),name:f.name,added:Date.now(),w,h,raw,exif,rawStored:raw,rating:0,flag:0,settings:s,history:[{label:'Import',s:clone(s)}],hIdx:0,thumb,edited:false,size:f.size};
      await blobPut(p.id,blob); if(prevBlob) await blobPut(p.id+':prev',prevBlob); await dbPut(p); photos.push(p);
      if(img.close) img.close();
    }catch(e){ console.error(e); failed.push(f.name); }
    await nextFrame();
  }
  busy(false); renderLibrary();
  toast(failed.length?`Imported ${files.length-failed.length}. Could not read: ${failed.join(', ')}`:`Imported ${files.length} photo${files.length>1?'s':''}`, failed.length?5000:2200);
}
// Synthetic sample photo (landscape with deliberate sensor-style noise)
async function makeSample(){
  const c=document.createElement('canvas'); c.width=3000; c.height=2000; const g=c.getContext('2d');
  let gr=g.createLinearGradient(0,0,0,1300); gr.addColorStop(0,'#1d3b6e'); gr.addColorStop(.6,'#c77a55'); gr.addColorStop(1,'#f3c27a'); g.fillStyle=gr; g.fillRect(0,0,3000,2000);
  g.fillStyle='#ffe9b0'; g.beginPath(); g.arc(2100,1050,120,0,7); g.fill();
  const hill=(y,a,col)=>{ g.fillStyle=col; g.beginPath(); g.moveTo(0,2000); for(let x=0;x<=3000;x+=20) g.lineTo(x,y+Math.sin(x/a)*80+Math.sin(x/(a*.37))*30); g.lineTo(3000,2000); g.fill(); };
  hill(1150,300,'#4b4a6b'); hill(1300,220,'#2f4a3a'); hill(1500,170,'#1e3324');
  g.fillStyle='#b8322a'; g.fillRect(600,1450,260,180); g.fillStyle='#e8e2d0'; g.fillRect(640,1500,60,60);
  g.fillStyle='#d9c23b'; g.beginPath(); g.arc(1500,1700,90,0,7); g.fill(); g.fillStyle='#3b8fd9'; g.fillRect(1900,1650,200,200);
  g.font='bold 90px sans-serif'; g.fillStyle='#fff'; g.fillText('Photo Studio',150,300);
  const id=g.getImageData(0,0,3000,2000), d=id.data;
  for(let i=0;i<d.length;i+=4){ const l=(Math.random()+Math.random()+Math.random()-1.5)*26; for(let k=0;k<3;k++) d[i+k]=clamp(d[i+k]*0.85+l+(Math.random()-.5)*22,0,255); }
  g.putImageData(id,0,0);
  const b=await canvasBlob(c,'image/jpeg',0.92); return new File([b],'sample-noisy-landscape.jpg',{type:'image/jpeg'});
}

/* ================= Library ================= */
function filtered(){
  const r=+$('#fRating').value, fl=$('#fFlag').value, q=$('#fSearch').value.toLowerCase(), so=$('#fSort').value;
  let a=photos.filter(p=>p.rating>=r && (fl==='all'||(fl==='pick'&&p.flag===1)||(fl==='reject'&&p.flag===-1)||(fl==='none'&&p.flag===0)||(fl==='norej'&&p.flag!==-1)) && (window.matchPhoto?matchPhoto(p,q):p.name.toLowerCase().includes(q)));
  a.sort(so==='name'?(x,y)=>x.name.localeCompare(y.name):so==='rating'?(x,y)=>y.rating-x.rating||x.added-y.added:(x,y)=>x.added-y.added);
  return a;
}
const urlCache=new Map();
function thumbURL(p){ let e=urlCache.get(p.id); if(e&&e.b===p.thumb) return e.u; if(e) URL.revokeObjectURL(e.u); const u=URL.createObjectURL(p.thumb); urlCache.set(p.id,{b:p.thumb,u}); return u; }
function starsHTML(r){ let h=''; for(let i=1;i<=5;i++) h+=`<span data-r="${i}" class="${i<=r?'on':''}">${i<=r?'★':'☆'}</span>`; return h; }
const flagHTML=f=>f===1?'<span class="flag pick" title="Picked">⚑</span>':f===-1?'<span class="flag reject" title="Rejected">✕</span>':'<span class="flag" title="Unflagged" style="color:#555">⚐</span>';
function renderLibrary(){
  const a=filtered(), grid=$('#grid');
  grid.innerHTML=a.map(p=>`<div class="cell ${sel.has(p.id)?'sel':''} ${p.flag===-1?'rej':''}" data-id="${p.id}"><div class="im"><img loading="lazy" src="${thumbURL(p)}" alt=""></div>${p.edited?'<span class="edited">Edited</span>':''}<div class="meta"><span class="nm" title="${p.name}">${p.raw?'RAW · ':''}${p.name}</span><span class="stars">${starsHTML(p.rating)}</span>${flagHTML(p.flag)}</div></div>`).join('');
  $('#empty').hidden=photos.length>0;
  { const picks=a.filter(p=>p.flag===1).length, rejs=a.filter(p=>p.flag===-1).length, rated=a.filter(p=>p.rating>0).length;
  $('#libCount').textContent=`${a.length} of ${photos.length}${sel.size?` · ${sel.size} selected`:''}${picks||rejs||rated?` · ✦${picks} ✕${rejs} ★${rated}`:''}`; }
  renderFilmstrip();
}
function refreshSel(){ $$('#grid .cell').forEach(c=>c.classList.toggle('sel',sel.has(c.dataset.id))); const a=filtered(), n=a.length; const picks=a.filter(p=>p.flag===1).length, rejs=a.filter(p=>p.flag===-1).length, rated=a.filter(p=>p.rating>0).length;
  $('#libCount').textContent=`${n} of ${photos.length}${sel.size?` · ${sel.size} selected`:''}${picks||rejs||rated?` · ✦${picks} ✕${rejs} ★${rated}`:''}`; }
function renderFilmstrip(){
  const a=filtered(); $('#filmstrip').innerHTML=a.map(p=>`<img data-id="${p.id}" class="${p.id===cur?'cur':''}" src="${thumbURL(p)}" alt="">`).join('');
  const c=$('#filmstrip img.cur'); if(c) c.scrollIntoView({block:'nearest',inline:'center'});
}
$('#grid').addEventListener('click',e=>{
  const cell=e.target.closest('.cell'); if(!cell) return; const id=cell.dataset.id, p=photos.find(x=>x.id===id);
  const st=e.target.closest('.stars span'); if(st){ setRating([p], p.rating===+st.dataset.r?0:+st.dataset.r); return; }
  if(e.target.closest('.flag')){ setFlag([p], p.flag===1?-1:p.flag===-1?0:1); return; }
  if(e.shiftKey&&lastSel){ const a=filtered().map(x=>x.id); const i0=a.indexOf(lastSel), i1=a.indexOf(id); a.slice(Math.min(i0,i1),Math.max(i0,i1)+1).forEach(x=>sel.add(x)); }
  else if(e.metaKey||e.ctrlKey){ sel.has(id)?sel.delete(id):sel.add(id); lastSel=id; }
  else { if(isTouch&&sel.size===1&&sel.has(id)){ openDevelop(id); return; } sel=new Set([id]); lastSel=id; }
  refreshSel();
});
$('#grid').addEventListener('dblclick',e=>{ const cell=e.target.closest('.cell'); if(cell&&!e.target.closest('.stars,.flag')) openDevelop(cell.dataset.id); });
['#fRating','#fFlag','#fSort','#fSearch'].forEach(s=>$(s).addEventListener('input',renderLibrary));
$('#selAll').onclick=()=>{ const a=filtered(); sel = sel.size===a.length? new Set(): new Set(a.map(p=>p.id)); renderLibrary(); };
$('#delSel').onclick=removeSelected;
async function removeSelected(){
  if(!sel.size) return toast('Select photos first');
  if(!confirm(`Remove ${sel.size} photo(s) from Photo Studio? (Your original files are not affected.)`)) return;
  for(const id of sel){ await dbDel(id); photos=photos.filter(p=>p.id!==id); if(cur===id) cur=null; }
  sel.clear(); renderLibrary();
}
function setRating(list,r){ list.forEach(p=>{p.rating=r; savePhoto(p,0);}); renderLibrary(); updateDevMeta(); toast(r?`Rated ${'★'.repeat(r)}`:'Rating cleared',900); }
function setFlag(list,f){ list.forEach(p=>{p.flag=f; savePhoto(p,0);}); renderLibrary(); updateDevMeta(); toast(f===1?'Flagged as pick':f===-1?'Rejected':'Unflagged',900); }
function targets(){ if(mode==='develop'){ const p=curPhoto(); return p?[p]:[]; } return photos.filter(p=>sel.has(p.id)); }

/* ================= Modules ================= */
function setMode(m){
  if(m==='develop'&&!cur){ const a=filtered(); if(!a.length) return toast('Import a photo first'); return openDevelop((sel.size?[...sel][0]:a[0].id)); }
  mode=m; $$('.modules button').forEach(b=>b.classList.toggle('on',b.dataset.mod===m)); $$('.module').forEach(s=>s.classList.toggle('on',s.id===m));
  if(m==='library'){ if(cropOn) toggleCrop(false); if(tool) setTool(tool); if(zoom) setZoom(null); dropTile(); flushThumb(); renderLibrary(); } else { requestAnimationFrame(()=>{ layoutCrop(); }); }
}
$$('.modules button').forEach(b=>b.onclick=()=>setMode(b.dataset.mod));

/* ================= Develop ================= */
let loadToken=0;
async function openDevelop(id){
  const p=photos.find(x=>x.id===id); if(!p) return;
  flushThumb();
  if(cropOn) toggleCrop(false);
  cur=id; sel=new Set([id]); lastSel=id; setMode('develop');
  const tok=++loadToken; busy(true,'Loading…');
  try{
    freeRaws(); $('#rawRow').hidden=true; rawBadge(null);
    const blob=await blobGet(p.rawStored?id+':prev':id); const img=await decode(blob); if(tok!==loadToken) return;
    const {w,h}=dimsOf(img); const maxP=isTouch?2048:2560;
    const prev=scaledCanvas(img,Math.min(maxP,engine.maxTex));
    dropFull(); zoom=null; zc=[.5,.5]; $('#stage').classList.remove('zoomed'); $('#zoomBtn').textContent='Fit'; selMaskId=null; selSpot=-1; brushMode=false;
    if(!p.rawDecoded){ p.w=w; p.h=h; } maskDims = p.w>=p.h?[MASK_RES,Math.max(8,Math.round(MASK_RES*p.h/p.w))]:[Math.max(8,Math.round(MASK_RES*p.w/p.h)),MASK_RES]; maskCanvases.clear();
    engine.maskTex.forEach(e=>engine.gl.deleteTexture(e.tex)); engine.maskTex.clear();
    try{ const sm=scaledCanvas(prev,640); prevData=sm.getContext('2d').getImageData(0,0,sm.width,sm.height); }catch(e){ prevData=null; }
    try{ const hc=scaledCanvas(prev,1024); window.srcHi={w:hc.width,h:hc.height,data:hc.getContext('2d').getImageData(0,0,hc.width,hc.height).data,tag:p.id}; }catch(e){ window.srcHi=null; }
    if(window.onDevelopOpen) try{ onDevelopOpen(p); }catch(e){ console.error(e); }
    engine.setImage(prev,p.w,p.h); if(img.close) img.close();
    S=fillDefaults(p.settings); beforeOn=false; $('#baLabel').hidden=true; $('#baBtn').classList.remove('on');
    syncUI(); updateDevMeta(); renderFilmstrip(); schedule(true);
    if(p.rawStored) startRawPreview(p,tok);
  }catch(e){ console.error(e); toast('Could not open photo: '+e.message,4000); }
  busy(false);
}
function updateDevMeta(){ const p=curPhoto(); if(!p) return; $('#devStars').innerHTML=starsHTML(p.rating)+' '+flagHTML(p.flag);
  $('#info').textContent=`${p.name} · ${p.w}×${p.h}${p.raw?(curRaw?(p.hdr?' · HDR (32-bit merge)':' · RAW (LibRaw)'):' · RAW embedded preview'):''}`+(p.exif&&exifSummary(p.exif)?'\n'+exifSummary(p.exif):''); }
$('#devStars').addEventListener('click',e=>{ const p=curPhoto(); const s=e.target.closest('[data-r]'); if(s) setRating([p],p.rating===+s.dataset.r?0:+s.dataset.r); else if(e.target.closest('.flag')) setFlag([p],p.flag===1?-1:p.flag===-1?0:1); });
$('#filmstrip').addEventListener('click',e=>{ const i=e.target.closest('img'); if(i) openDevelop(i.dataset.id); });
function step(d){ const a=filtered(); if(!a.length) return; let i=a.findIndex(p=>p.id===cur); i=clamp(i+d,0,a.length-1);
  if(mode==='develop') openDevelop(a[i].id); else { cur=a[i].id; sel=new Set([cur]); lastSel=cur; renderLibrary(); const c=$(`.cell[data-id="${cur}"]`); c&&c.scrollIntoView({block:'nearest'}); } }
$('#prevBtn').onclick=()=>step(-1); $('#nextBtn').onclick=()=>step(1);

// Render scheduling
let rafPending=false;
function schedule(hist){ if(hist) histT=0; if(rafPending) return; rafPending=true; requestAnimationFrame(frame); }
function viewSettings(){ if(!beforeOn) return S; if(window.beforeEditSettings) return beforeEditSettings(); const d=defaults(); VIEWGEOM.forEach(k=>d[k]=S[k]); return d; }
function frame(){
  rafPending=false; if(!S||!engine.state||mode!=='develop') return;
  try{
    const vs=viewSettings(); const ov=(tool==='mask'&&ovOn&&!beforeOn)?selMask():null; const gl=$('#gl');
    if(zoom&&!cropOn){ const V=zoomView(); let st=engine.state; if(V.need>engine.state.scale*1.1){ const t=tileFor(V); if(t) st=t; }
      engine.render(vs,{st,size:V.size,view:V.view,ovMask:ov}); gl.style.width=V.css[0]+'px'; gl.style.height=V.css[1]+'px';
      $('#zoomInfo').textContent = st===engine.state && V.need>engine.state.scale*1.1 ? 'Rendering full resolution…' : (st!==engine.state?'Full resolution':''); }
    else { engine.render(vs,{fullFrame:cropOn,ovMask:ov}); gl.style.width=''; gl.style.height=''; $('#zoomInfo').textContent=''; }
    const now=performance.now(); if(now-histT>120){ histT=now; drawHisto(engine.histogram(vs,{fullFrame:cropOn})); } else schedule();
    if(cropOn) layoutCrop(); drawOverlay();
  }catch(e){ console.error(e); }
}
function drawHisto(H){
  if(!H) return; const c=$('#histo'), g=c.getContext('2d'), W=c.width, Hh=c.height; g.clearRect(0,0,W,Hh);
  g.fillStyle='#1d1d1d'; g.fillRect(0,0,W,Hh);
  let mx=1; for(const h of H) for(let i=2;i<254;i++) mx=Math.max(mx,h[i]); mx=Math.sqrt(mx);
  g.globalCompositeOperation='lighter';
  ['#d33','#3c3','#36f'].forEach((col,k)=>{ g.fillStyle=col; g.globalAlpha=.75; g.beginPath(); g.moveTo(0,Hh);
    for(let i=0;i<256;i++) g.lineTo(i/255*W, Hh-Math.min(1,Math.sqrt(H[k][i])/mx)*Hh*0.95); g.lineTo(W,Hh); g.fill(); });
  g.globalAlpha=1; g.globalCompositeOperation='source-over';
  const tot=H[0].reduce((a,b)=>a+b,0)||1, clipHi=(H[0][255]+H[1][255]+H[2][255])/3/tot, clipLo=(H[0][0]+H[1][0]+H[2][0])/3/tot;
  g.fillStyle=clipLo>0.002?'#4af':'#555'; g.fillRect(4,4,10,10); g.fillStyle=clipHi>0.002?'#f44':'#555'; g.fillRect(W-14,4,10,10);
  lastHist=H; if(curveCtx) drawCurve();
}
let lastHist=null;

/* ---- History ---- */
let thumbTimer=null;
function commit(label){
  const p=curPhoto(); if(!p||!S) return;
  const snap=clone(S); const last=p.history[p.hIdx];
  if(last && JSON.stringify(last.s)===JSON.stringify(snap)) return;
  p.history=p.history.slice(0,p.hIdx+1); p.history.push({label,s:snap}); if(p.history.length>120) p.history.splice(1,1);
  p.hIdx=p.history.length-1; p.settings=S; p.edited=isEdited(S); savePhoto(p); renderHistory(); queueThumb();
}
function gotoHistory(i){ const p=curPhoto(); if(!p||i<0||i>=p.history.length) return; p.hIdx=i; S=clone(p.history[i].s); fillDefaults(S); p.settings=S; p.edited=isEdited(S); savePhoto(p); syncUI(); schedule(true); queueThumb(); }
function undo(){ const p=curPhoto(); if(p&&p.hIdx>0){ toast('Undo: '+p.history[p.hIdx].label,900); gotoHistory(p.hIdx-1);} }
function redo(){ const p=curPhoto(); if(p&&p.hIdx<p.history.length-1){ gotoHistory(p.hIdx+1); toast('Redo: '+p.history[p.hIdx].label,900);} }
$('#undoBtn').onclick=undo; $('#redoBtn').onclick=redo;
function queueThumb(){ clearTimeout(thumbTimer); thumbTimer=setTimeout(updateThumb,900); }
function flushThumb(){ if(thumbTimer){ clearTimeout(thumbTimer); thumbTimer=null; updateThumb(); } }
async function updateThumb(){
  thumbTimer=null; const p=curPhoto(); if(!p||!engine.state||!S) return;
  try{ engine.process(engine.state,S); const os=Engine.outSize(engine.state,S); const k=Math.min(1,480/Math.max(os.w,os.h)); const w=Math.round(os.w*k),h=Math.round(os.h*k);
    const px=engine.readOut(engine.state,S,w,h); const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer),w,h),0,0);
    p.thumb=await canvasBlob(c,'image/jpeg',0.82); savePhoto(p); renderFilmstrip(); schedule(); }catch(e){ console.error(e); }
}

/* ================= Panel construction ================= */
const HUES=['Red','Orange','Yellow','Green','Aqua','Blue','Purple','Magenta'];
const HUECOL=['#e33','#f80','#ee3','#3c3','#3cc','#36f','#93f','#e3c'];
const sliders={}; // key -> {input,num,def,get,set}
function slider(parent,label,get,set,min,max,stepv,trk,histLabel,noCommit){
  const row=document.createElement('div'); row.className='sl';
  row.innerHTML=`<label title="Double-click to reset">${label}</label><input type="range" min="${min}" max="${max}" step="${stepv}"><input type="number" min="${min}" max="${max}" step="${stepv}">`;
  const [lab,rng,num]=row.children; if(trk) rng.style.setProperty('--trk',trk);
  const def=get(defaults()); const dec=stepv<1?(stepv<0.1?2:1):0;
  const show=v=>{ rng.value=v; num.value=(+v).toFixed(dec); };
  const cm=()=>{ if(!noCommit) commit(histLabel||label); };
  rng.addEventListener('input',()=>{ if(!S&&!noCommit) return; set(S,+rng.value); num.value=(+rng.value).toFixed(dec); schedule(); });
  rng.addEventListener('change',cm);
  num.addEventListener('change',()=>{ const v=clamp(+num.value||0,min,max); set(S,v); show(v); schedule(true); cm(); });
  const reset=()=>{ set(S,def); show(def); schedule(true); cm(); };
  lab.addEventListener('dblclick',reset); rng.addEventListener('dblclick',reset);
  parent.appendChild(row); const o={sync:()=>{ if(document.activeElement!==num) show(get(S)); }}; sliders[label+Math.random()]=o; return o;
}
function section(title,open=true){ const d=document.createElement('details'); d.className='sec'; d.open=open; d.innerHTML=`<summary>${title}</summary><div class="secbody"></div>`; $('#sections').appendChild(d); return d.lastChild; }
const sub=(p,t)=>{ const e=document.createElement('div'); e.className='sub'; e.textContent=t; p.appendChild(e); return e; };
const K=(k)=>[s=>s[k],(s,v)=>s[k]=v];
let curveCtx=null, curveCh='m', wheelDraws=[], syncers=[];
function buildPanel(){
  // Presets
  const pr=section('Presets',false); pr.innerHTML='<div class="plist" id="plist"></div><div class="row"><button class="btn" id="newPreset">+ Save current as preset</button></div>';
  // History
  const hi=section('History',false); hi.innerHTML='<div class="plist hist" id="hlist"></div>';
  // Crop
  const cr=section('Crop & Rotate',false); cr.id='cropSec';
  cr.innerHTML=`<div class="row"><button class="btn" id="cropTool">Edit crop</button><button class="btn" id="rotL" title="Rotate left">⟲ 90°</button><button class="btn" id="rotR" title="Rotate right">⟳ 90°</button><button class="btn" id="flipH">Flip ⇋</button></div>
   <div class="sub">Aspect</div><div class="tabs" id="aspects">${['orig','free','1:1','4:5','5:4','3:2','2:3','16:9','9:16','4:3','3:4'].map(a=>`<button data-a="${a}">${a==='orig'?'Original':a==='free'?'Free':a}</button>`).join('')}</div><div id="angleHost"></div><div class="row"><button class="btn" id="cropReset">Reset crop</button></div>`;
  slider($('#angleHost'),'Straighten',s=>s.angle,(s,v)=>{ s.angle=v; constrainCrop(); },-45,45,0.1);
  // Basic
  const b=section('Basic');
  b.insertAdjacentHTML('beforeend','<div id="rawRow" hidden><div class="sub">RAW profile</div><div class="tabs" id="rawProf"><button data-p="standard">Standard</button><button data-p="vivid">Vivid</button><button data-p="flat">Flat / linear</button></div></div>');
  $('#rawProf').onclick=e=>{ const v=e.target.dataset.p; if(!v||!S) return; S.rawProfile=v; syncUI(); schedule(true); commit('Profile: '+v); };
  syncers.push(()=>$$('#rawProf button').forEach(x=>x.classList.toggle('on',x.dataset.p===(S.rawProfile||'standard'))));
  sub(b,'White balance');
  slider(b,'Temp',...K('wbTemp'),-100,100,1,'linear-gradient(90deg,#4f7fd6,#ccc,#e6c34a)');
  slider(b,'Tint',...K('wbTint'),-100,100,1,'linear-gradient(90deg,#4bb54b,#ccc,#c74bc7)');
  sub(b,'Tone');
  slider(b,'Exposure',...K('exposure'),-5,5,0.01); slider(b,'Contrast',...K('contrast'),-100,100,1);
  slider(b,'Highlights',...K('highlights'),-100,100,1); slider(b,'Shadows',...K('shadows'),-100,100,1);
  slider(b,'Whites',...K('whites'),-100,100,1); slider(b,'Blacks',...K('blacks'),-100,100,1);
  sub(b,'Presence');
  slider(b,'Texture',...K('texture'),-100,100,1); slider(b,'Clarity',...K('clarity'),-100,100,1); slider(b,'Dehaze',...K('dehaze'),-100,100,1);
  slider(b,'Vibrance',...K('vibrance'),-100,100,1,'linear-gradient(90deg,#888,#c55,#5c5,#55c)'); slider(b,'Saturation',...K('saturation'),-100,100,1,'linear-gradient(90deg,#888,#c55,#5c5,#55c)');
  // Curve
  const cu=section('Tone Curve',false);
  cu.innerHTML=`<div class="tabs" id="cch"><button data-c="m" class="on">RGB</button><button data-c="r" style="color:#f66">Red</button><button data-c="g" style="color:#6d6">Green</button><button data-c="b" style="color:#69f">Blue</button></div><div class="curvebox"><canvas id="curve"></canvas></div><div class="row" style="color:var(--dim);font-size:11px">Tap to add a point, drag to move, double-tap or drag off to delete.</div><div class="row"><button class="btn" id="curveReset">Reset channel</button><button class="btn" id="curveS">Medium contrast</button><button class="btn" id="curveFade">Faded</button></div>`;
  initCurve();
  // HSL
  const hs=section('Colour Mixer (HSL)',false);
  hs.innerHTML='<div class="tabs" id="hslTabs"><button data-t="h" class="on">Hue</button><button data-t="s">Saturation</button><button data-t="l">Luminance</button></div>';
  const hostH={}; ['h','s','l'].forEach(t=>{ const d=document.createElement('div'); d.dataset.t=t; d.hidden=t!=='h'; hs.appendChild(d); hostH[t]=d;
    HUES.forEach((n,i)=>{ const nx=HUECOL[(i+1)%8], pv=HUECOL[(i+7)%8];
      const trk = t==='h'?`linear-gradient(90deg,${pv},${HUECOL[i]},${nx})`: t==='s'?`linear-gradient(90deg,#888,${HUECOL[i]})`:`linear-gradient(90deg,#222,${HUECOL[i]},#fff)`;
      slider(d,n,s=>s.hsl[t][i],(s,v)=>s.hsl[t][i]=v,-100,100,1,trk,`${({h:'Hue',s:'Sat',l:'Lum'})[t]} ${n}`); }); });
  $('#hslTabs').onclick=e=>{ const t=e.target.dataset.t; if(!t) return; $$('#hslTabs button').forEach(x=>x.classList.toggle('on',x.dataset.t===t)); Object.entries(hostH).forEach(([k,d])=>d.hidden=k!==t); };
  // Grading
  const gr=section('Colour Grading',false);
  gr.innerHTML='<div class="wheels" id="wheels"></div>';
  [['sh','Shadows'],['mid','Midtones'],['hi','Highlights'],['glob','Global']].forEach(([k,n])=>{ const w=document.createElement('div'); w.className='wheel'; w.innerHTML=`<canvas></canvas><div>${n}</div>`; $('#wheels').appendChild(w); initWheel(w.firstChild,k,n);
    slider(w,'Lum',s=>s.grade[k].l,(s,v)=>s.grade[k].l=v,-100,100,1,null,n+' luminance'); });
  slider(gr,'Blending',s=>s.grade.blend,(s,v)=>s.grade.blend=v,0,100,1); slider(gr,'Balance',s=>s.grade.balance,(s,v)=>s.grade.balance=v,-100,100,1);
  // Detail
  const de=section('Detail',false);
  sub(de,'Sharpening');
  slider(de,'Amount',...K('sharpAmount'),0,150,1,null,'Sharpen amount'); slider(de,'Radius',...K('sharpRadius'),0.5,3,0.1,null,'Sharpen radius');
  slider(de,'Detail',...K('sharpDetail'),0,100,1,null,'Sharpen detail'); slider(de,'Masking',...K('sharpMasking'),0,100,1,null,'Sharpen masking');
  sub(de,'Noise reduction');
  slider(de,'Luminance',...K('nrLum'),0,100,1,null,'Luminance NR'); slider(de,'Detail',...K('nrLumDetail'),0,100,1,null,'Luminance NR detail'); slider(de,'Contrast',...K('nrLumContrast'),0,100,1,null,'Luminance NR contrast');
  slider(de,'Colour',...K('nrColor'),0,100,1,null,'Colour NR'); slider(de,'Detail',...K('nrColorDetail'),0,100,1,null,'Colour NR detail'); slider(de,'Smoothness',...K('nrColorSmooth'),0,100,1,null,'Colour NR smoothness');
  const tip=document.createElement('div'); tip.className='row'; tip.style.cssText='color:var(--dim);font-size:11px'; tip.textContent='Tip: press \\ or the Before/After button to compare. Noise reduction is non-local-means on luminance and edge-aware bilateral on colour, and is applied to full-resolution export.'; de.appendChild(tip);
  // Effects
  const ef=section('Effects',false);
  sub(ef,'Post-crop vignette');
  slider(ef,'Amount',...K('vigAmount'),-100,100,1,null,'Vignette amount'); slider(ef,'Midpoint',...K('vigMid'),0,100,1,null,'Vignette midpoint');
  slider(ef,'Roundness',...K('vigRound'),-100,100,1,null,'Vignette roundness'); slider(ef,'Feather',...K('vigFeather'),0,100,1,null,'Vignette feather');
  sub(ef,'Grain');
  slider(ef,'Amount',...K('grainAmount'),0,100,1,null,'Grain amount'); slider(ef,'Size',...K('grainSize'),0,100,1,null,'Grain size'); slider(ef,'Roughness',...K('grainRough'),0,100,1,null,'Grain roughness');

  // wiring
  $('#cropTool').onclick=()=>toggleCrop();
  $('#rotL').onclick=()=>rotate(-1); $('#rotR').onclick=()=>rotate(1);
  $('#flipH').onclick=()=>{ S.flipH=!S.flipH; schedule(true); commit('Flip'); };
  $('#aspects').onclick=e=>{ const a=e.target.dataset.a; if(!a) return; S.aspect=a; applyAspect(true); syncUI(); schedule(true); commit('Aspect '+a); };
  $('#cropReset').onclick=()=>{ S.crop={x:0,y:0,w:1,h:1}; S.angle=0; S.aspect='orig'; syncUI(); schedule(true); commit('Reset crop'); };
  $('#newPreset').onclick=()=>{ const n=prompt('Preset name'); if(!n) return; const s=clone(S); GEOM.forEach(k=>delete s[k]); userPresets.push({name:n,s}); localStorage.setItem('ps.presets',JSON.stringify(userPresets)); renderPresets(); toast('Preset saved'); };
  renderPresets();
  buildToolPanels(); addSectionResets();
}
function syncUI(){ if(!S) return; syncers.forEach(f=>f()); Object.values(sliders).forEach(o=>o.sync());
  $$('#aspects button').forEach(b=>b.classList.toggle('on',b.dataset.a===S.aspect)); renderHistory(); }
function renderHistory(){ const p=curPhoto(); const h=$('#hlist'); if(!p||!h) return;
  h.innerHTML=p.history.map((x,i)=>({x,i})).reverse().map(({x,i})=>`<button data-i="${i}" class="${i===p.hIdx?'cur':''}">${x.label}</button>`).join('');
  $('#undoBtn').disabled=p.hIdx<=0; $('#redoBtn').disabled=p.hIdx>=p.history.length-1; }
document.addEventListener('click',e=>{ const b=e.target.closest('#hlist button'); if(b) gotoHistory(+b.dataset.i); });

/* ---- Presets ---- */
const C=(pts)=>pts; // curve helper
const BUILTIN=[
 ['Colour','Vivid',{vibrance:35,saturation:8,contrast:18,clarity:12,dehaze:6}],
 ['Colour','Warm Golden',{wbTemp:22,wbTint:4,vibrance:15,highlights:-15,grade:{sh:{h:30,s:8,l:0},mid:{h:40,s:6,l:0},hi:{h:45,s:15,l:0},glob:{h:30,s:0,l:0},blend:50,balance:0}}],
 ['Colour','Cool Blue',{wbTemp:-20,wbTint:-3,vibrance:10,contrast:10,grade:{sh:{h:215,s:15,l:0},mid:{h:200,s:5,l:0},hi:{h:190,s:5,l:0},glob:{h:30,s:0,l:0},blend:50,balance:0}}],
 ['Colour','Teal & Orange',{vibrance:15,contrast:15,hsl:{h:[0,-8,-20,25,10,-12,0,0],s:[0,15,-10,-20,10,15,0,0],l:[0,8,0,-10,0,-10,0,0]},grade:{sh:{h:195,s:25,l:0},mid:{h:40,s:6,l:0},hi:{h:35,s:22,l:0},glob:{h:30,s:0,l:0},blend:60,balance:0}}],
 ['Colour','Vivid Landscape',{vibrance:30,dehaze:15,clarity:20,highlights:-40,shadows:30,contrast:15,hsl:{h:[0,0,0,10,0,0,0,0],s:[0,0,10,15,10,20,0,0],l:[0,0,0,-5,0,-15,0,0]}}],
 ['Colour','Soft Portrait',{texture:-20,clarity:-10,highlights:-20,shadows:15,vibrance:-5,hsl:{h:[0,4,0,0,0,0,0,0],s:[-5,-8,0,0,0,0,0,0],l:[5,12,0,0,0,0,0,0]}}],
 ['Film','Matte Film',{contrast:-10,highlights:-20,shadows:15,curve:{m:[[0,0.08],[0.25,0.24],[0.75,0.78],[1,0.95]],r:LINE(),g:LINE(),b:LINE()},grainAmount:18,grainSize:30,saturation:-10}],
 ['Film','Faded Warm',{curve:{m:[[0,0.1],[0.5,0.52],[1,0.94]],r:[[0,0.04],[1,1]],g:LINE(),b:[[0,0],[1,0.92]]},saturation:-15,wbTemp:10,grainAmount:12}],
 ['Film','Cross Process',{curve:{m:LINE(),r:[[0,0],[0.25,0.18],[0.75,0.85],[1,1]],g:[[0,0],[0.25,0.22],[0.75,0.82],[1,1]],b:[[0,0.12],[1,0.85]]},contrast:10,vibrance:15}],
 ['B&W','B&W Classic',{saturation:-100,contrast:20,clarity:10,hsl:{h:[0,0,0,0,0,0,0,0],s:[0,0,0,0,0,0,0,0],l:[10,15,10,-10,-10,-25,0,0]}}],
 ['B&W','B&W High Contrast',{saturation:-100,contrast:55,whites:25,blacks:-30,clarity:30,hsl:{h:[0,0,0,0,0,0,0,0],s:[0,0,0,0,0,0,0,0],l:[0,10,20,-20,-20,-50,0,0]},vigAmount:-20}],
 ['B&W','B&W Soft Matte',{saturation:-100,contrast:-15,curve:{m:[[0,0.1],[1,0.92]],r:LINE(),g:LINE(),b:LINE()},grainAmount:25}],
 ['Detail','Clean High ISO',{nrLum:55,nrLumDetail:45,nrLumContrast:20,nrColor:50,nrColorDetail:50,nrColorSmooth:60,sharpAmount:30,sharpMasking:35}],
 ['Detail','Extreme Noise Clean-up',{nrLum:85,nrLumDetail:35,nrLumContrast:30,nrColor:80,nrColorSmooth:80,sharpAmount:25,sharpMasking:50}],
 ['Detail','Crisp',{sharpAmount:80,sharpRadius:1.0,sharpDetail:40,sharpMasking:20,texture:15}],
];
let userPresets=JSON.parse(localStorage.getItem('ps.presets')||'[]');
function renderPresets(){
  let h='', g=null; BUILTIN.forEach(([grp,n],i)=>{ if(grp!==g){ h+=`<div class="grp">${grp}</div>`; g=grp; } h+=`<button data-b="${i}">${n}</button>`; });
  h+='<div class="grp">User presets</div>'+(userPresets.length?userPresets.map((p,i)=>`<button data-u="${i}"><span>${p.name.replace(/</g,'&lt;')}</span><span class="x" data-del="${i}" title="Delete">✕</span></button>`).join(''):'<div style="color:#777;padding:4px 6px">None yet</div>');
  $('#plist').innerHTML=h;
}
document.addEventListener('click',e=>{ const b=e.target.closest('#plist button'); if(!b||!S) return;
  if(e.target.dataset.del!==undefined){ userPresets.splice(+e.target.dataset.del,1); localStorage.setItem('ps.presets',JSON.stringify(userPresets)); renderPresets(); return; }
  let name, ps; if(b.dataset.b!==undefined){ [, name, ps]=BUILTIN[+b.dataset.b]; } else { ({name, s:ps}=userPresets[+b.dataset.u]); }
  applyPreset(ps, name); });
function applyPreset(ps,name){ const keep={}; GEOM.forEach(k=>keep[k]=S[k]); S=Object.assign(clone(S), clone(ps), keep); fillDefaults(S); const p=curPhoto(); p.settings=S; syncUI(); schedule(true); commit('Preset: '+name); toast('Applied '+name,1000); }

/* ---- Tone curve editor ---- */
function initCurve(){
  const cv=$('#curve'); curveCtx=cv.getContext('2d'); let drag=-1, moved=false, lastTap=0;
  $('#cch').onclick=e=>{ const c=e.target.dataset.c; if(!c) return; curveCh=c; $$('#cch button').forEach(b=>b.classList.toggle('on',b.dataset.c===c)); drawCurve(); };
  const pos=e=>{ const r=cv.getBoundingClientRect(); return [clamp((e.clientX-r.left)/r.width,0,1), clamp(1-(e.clientY-r.top)/r.height,0,1), (e.clientY-r.top)/r.height, r]; };
  cv.addEventListener('pointerdown',e=>{ if(!S) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); const [x,y,,r]=pos(e); const pts=S.curve[curveCh];
    let best=-1, bd=1e9; pts.forEach((p,i)=>{ const d=Math.hypot((p[0]-x)*r.width,(p[1]-y)*r.height); if(d<bd){bd=d;best=i;} });
    const now=Date.now(); const tol=isTouch?24:12;
    if(bd<tol){ if(now-lastTap<350 && best>0 && best<pts.length-1){ pts.splice(best,1); drawCurve(); schedule(true); commit('Tone curve'); drag=-1; return; } drag=best; }
    else { const lut=Engine.spline(pts); const ny=lut[Math.round(x*255)]; let i=pts.findIndex(p=>p[0]>x); if(i<=0) i=pts.length; pts.splice(i,0,[x,ny]); drag=i; }
    lastTap=now; moved=false; drawCurve(); });
  cv.addEventListener('pointermove',e=>{ if(drag<0) return; const pts=S.curve[curveCh]; const [x,y,ry]=pos(e); moved=true;
    const lo=drag===0?0:pts[drag-1][0]+0.01, hi=drag===pts.length-1?1:pts[drag+1][0]-0.01;
    pts[drag]=[clamp(x,lo,hi),y]; pts[drag]._off = (ry<-0.15||ry>1.15) && drag>0 && drag<pts.length-1; drawCurve(); schedule(); });
  const up=()=>{ if(drag<0) return; const pts=S.curve[curveCh]; if(pts[drag]&&pts[drag]._off) pts.splice(drag,1); S.curve[curveCh]=pts.map(p=>[+p[0].toFixed(4),+p[1].toFixed(4)]); drag=-1; drawCurve(); schedule(true); commit('Tone curve'); };
  cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up);
  $('#curveReset').onclick=()=>{ S.curve[curveCh]=LINE(); drawCurve(); schedule(true); commit('Tone curve reset'); };
  $('#curveS').onclick=()=>{ S.curve.m=[[0,0],[0.25,0.2],[0.75,0.8],[1,1]]; drawCurve(); schedule(true); commit('Tone curve: contrast'); };
  $('#curveFade').onclick=()=>{ S.curve.m=[[0,0.1],[0.3,0.3],[0.75,0.78],[1,0.95]]; drawCurve(); schedule(true); commit('Tone curve: faded'); };
  syncers.push(drawCurve);
  new ResizeObserver(drawCurve).observe(cv);
}
function drawCurve(){
  const cv=$('#curve'); if(!cv||!S||!cv.clientWidth) return; const dpr=devicePixelRatio||1, W=Math.round(cv.clientWidth*dpr);
  if(cv.width!==W){ cv.width=W; cv.height=W; } const g=curveCtx; g.clearRect(0,0,W,W);
  if(lastHist){ const L=new Float32Array(256); let mx=1; for(let i=0;i<256;i++){ L[i]=lastHist[0][i]+lastHist[1][i]+lastHist[2][i]; if(i>1&&i<254) mx=Math.max(mx,L[i]); }
    g.fillStyle='#333'; g.beginPath(); g.moveTo(0,W); for(let i=0;i<256;i++) g.lineTo(i/255*W, W-Math.min(1,L[i]/mx)*W*0.6); g.lineTo(W,W); g.fill(); }
  g.strokeStyle='#3a3a3a'; g.lineWidth=1; for(let i=1;i<4;i++){ g.beginPath(); g.moveTo(i*W/4,0); g.lineTo(i*W/4,W); g.moveTo(0,i*W/4); g.lineTo(W,i*W/4); g.stroke(); }
  g.strokeStyle='#555'; g.beginPath(); g.moveTo(0,W); g.lineTo(W,0); g.stroke();
  const col={m:'#ddd',r:'#f55',g:'#5d5',b:'#58f'};
  for(const ch of ['r','g','b','m']){ if(ch!==curveCh && JSON.stringify(S.curve[ch])===JSON.stringify(LINE())) continue; if(ch!==curveCh && curveCh!=='m') continue;
    const pts=S.curve[ch].filter(p=>!p._off); const lut=Engine.spline(pts); g.strokeStyle=col[ch]; g.globalAlpha=ch===curveCh?1:0.35; g.lineWidth=2*dpr; g.beginPath();
    for(let i=0;i<256;i++){ const x=i/255*W, y=W-lut[i]*W; i?g.lineTo(x,y):g.moveTo(x,y); } g.stroke(); }
  g.globalAlpha=1; S.curve[curveCh].forEach(p=>{ g.fillStyle=p._off?'#f44':'#fff'; g.beginPath(); g.arc(p[0]*W,W-p[1]*W,5*dpr,0,7); g.fill(); });
}

/* ---- Colour wheels ---- */
function initWheel(cv,k,name){
  const g=cv.getContext('2d'); let bg=null;
  const draw=()=>{ if(!S) return; const dpr=devicePixelRatio||1; const W=Math.round((cv.clientWidth||120)*dpr); if(cv.width!==W){ cv.width=W; cv.height=W; bg=null; }
    const R=W/2-4*dpr;
    if(!bg){ const id=g.createImageData(W,W); for(let y=0;y<W;y++) for(let x=0;x<W;x++){ const dx=x-W/2, dy=y-W/2, r=Math.hypot(dx,dy)/R; const o=(y*W+x)*4; if(r>1){ id.data[o+3]=0; continue; }
        const h=(Math.atan2(-dy,dx)*180/Math.PI+360)%360; const c=hsv2rgb(h,r*0.75,0.55+0.1*(1-r)); id.data[o]=c[0]; id.data[o+1]=c[1]; id.data[o+2]=c[2]; id.data[o+3]=255; } bg=id; }
    g.putImageData(bg,0,0); const v=S.grade[k]; const a=v.h*Math.PI/180, r=v.s/100*R;
    g.strokeStyle='#0006'; g.beginPath(); g.moveTo(W/2-6,W/2); g.lineTo(W/2+6,W/2); g.moveTo(W/2,W/2-6); g.lineTo(W/2,W/2+6); g.stroke();
    g.fillStyle='#fff'; g.strokeStyle='#000'; g.lineWidth=2*dpr; g.beginPath(); g.arc(W/2+Math.cos(a)*r, W/2-Math.sin(a)*r, 6*dpr,0,7); g.fill(); g.stroke(); };
  let down=false, lastTap=0;
  const set=e=>{ const r=cv.getBoundingClientRect(); const dx=e.clientX-r.left-r.width/2, dy=e.clientY-r.top-r.height/2; const R=r.width/2-4;
    S.grade[k].h=Math.round((Math.atan2(-dy,dx)*180/Math.PI+360)%360); S.grade[k].s=Math.round(clamp(Math.hypot(dx,dy)/R,0,1)*100); draw(); schedule(); };
  cv.addEventListener('pointerdown',e=>{ if(!S) return; e.preventDefault(); const now=Date.now(); if(now-lastTap<350){ S.grade[k].s=0; draw(); schedule(true); commit(name+' colour reset'); lastTap=0; return; } lastTap=now; down=true; cv.setPointerCapture(e.pointerId); set(e); });
  cv.addEventListener('pointermove',e=>{ if(down) set(e); });
  const up=()=>{ if(!down) return; down=false; schedule(true); commit(name+' colour'); }; cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up);
  syncers.push(draw); new ResizeObserver(draw).observe(cv);
}
function hsv2rgb(h,s,v){ const f=n=>{ const k=(n+h/60)%6; return v-v*s*Math.max(0,Math.min(k,4-k,1)); }; return [f(5)*255,f(3)*255,f(1)*255]; }

/* ---- Crop ---- */
function rotSize(){ const st=engine.state; return S.orient%2?[st.h,st.w]:[st.w,st.h]; }
function cropValid(c){ const [W,H]=rotSize();
  for(let i=0;i<=6;i++){ const u=i/6; for(const [qx,qy] of [[c.x+u*c.w,c.y],[c.x+u*c.w,c.y+c.h],[c.x,c.y+u*c.h],[c.x+c.w,c.y+u*c.h]]){ const t=geomMap(qx,qy,S,W,H); if(t[0]<-0.001||t[0]>1.001||t[1]<-0.001||t[1]>1.001) return false; } } return true; }
function shrinkToFit(c){ if(cropValid(c)) return c; const cx=c.x+c.w/2, cy=c.y+c.h/2; let lo=0, hi=1;
  for(let i=0;i<30;i++){ const m=(lo+hi)/2; const t={x:cx-c.w*m/2,y:cy-c.h*m/2,w:c.w*m,h:c.h*m}; cropValid(t)?lo=m:hi=m; } return {x:cx-c.w*lo/2,y:cy-c.h*lo/2,w:c.w*lo,h:c.h*lo}; }
function ratioVal(){ const a=S.aspect; if(a==='free') return null; const [W,H]=rotSize(); if(a==='orig') return W/H; const [x,y]=a.split(':').map(Number); return x/y; }
function applyAspect(maximize){ const r=ratioVal(); if(!r){ S.crop=shrinkToFit(S.crop); return; } const [W,H]=rotSize();
  let c=S.crop; const cx=maximize?0.5:c.x+c.w/2, cy=maximize?0.5:c.y+c.h/2; const area=maximize?1:Math.sqrt(c.w*c.h);
  let w=1, h=(W/H)/r; if(h>1){ w=1/h; h=1; } if(!maximize){ const k=Math.min(1,area/Math.sqrt(w*h)); w*=k; h*=k; }
  c={x:clamp(cx-w/2,0,1-w),y:clamp(cy-h/2,0,1-h),w,h}; S.crop=shrinkToFit(c); }
function constrainCrop(){ S.crop=shrinkToFit(S.crop); }
function rotate(d){ S.orient=(S.orient+d+4)%4; const c=S.crop; // rotate crop rect with image
  S.crop = d>0 ? {x:1-c.y-c.h,y:c.x,w:c.h,h:c.w} : {x:c.y,y:1-c.x-c.w,w:c.h,h:c.w}; S.crop=shrinkToFit(S.crop); schedule(true); commit(d>0?'Rotate right':'Rotate left'); }
function toggleCrop(on){ cropOn = on===undefined?!cropOn:on; if(cropOn){ if(zoom) setZoom(null); if(tool) setTool(tool); } $('#cropBox').hidden=!cropOn; $('#cropBtn').classList.toggle('on',cropOn); const t=$('#cropTool'); if(t) t.textContent=cropOn?'Done':'Edit crop';
  if(cropOn){ $('#cropSec').parentElement.open=true; } schedule(true); }
function layoutCrop(){ if(!cropOn||!S) return; const cv=$('#gl'), st=$('#stage'); const r=cv.getBoundingClientRect(), sr=st.getBoundingClientRect(); const b=$('#cropBox');
  b.style.left=(r.left-sr.left+S.crop.x*r.width)+'px'; b.style.top=(r.top-sr.top+S.crop.y*r.height)+'px'; b.style.width=S.crop.w*r.width+'px'; b.style.height=S.crop.h*r.height+'px'; }
(function cropDrag(){
  const box=$('#cropBox'); let d=null;
  box.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); box.setPointerCapture(e.pointerId); const r=$('#gl').getBoundingClientRect(); d={h:e.target.dataset.h||'move',x0:e.clientX,y0:e.clientY,c:{...S.crop},W:r.width,H:r.height}; });
  box.addEventListener('pointermove',e=>{ if(!d) return; const dx=(e.clientX-d.x0)/d.W, dy=(e.clientY-d.y0)/d.H; let {x,y,w,h}=d.c; const hd=d.h;
    if(hd==='move'){ x=clamp(x+dx,0,1-w); y=clamp(y+dy,0,1-h); const t={x,y,w,h}; if(!cropValid(t)) return; S.crop=t; }
    else{ let x1=x+w, y1=y+h; if(hd.includes('w')) x=clamp(x+dx,0,x1-0.03); if(hd.includes('e')) x1=clamp(x1+dx,x+0.03,1); if(hd.includes('n')) y=clamp(y+dy,0,y1-0.03); if(hd.includes('s')) y1=clamp(y1+dy,y+0.03,1);
      let nw=x1-x, nh=y1-y; const r=ratioVal();
      if(r){ const [W,H]=rotSize(); const tgt=r*H/W; // nw/nh must equal tgt
        if(hd==='n'||hd==='s') nw=nh*tgt; else if(hd==='e'||hd==='w') nh=nw/tgt; else { if(nw/nh>tgt) nh=nw/tgt; else nw=nh*tgt; }
        if(hd.includes('w')) x=x1-nw; else if(!hd.includes('e')) x=d.c.x+d.c.w/2-nw/2; if(hd.includes('n')) y=y1-nh; else if(!hd.includes('s')) y=d.c.y+d.c.h/2-nh/2; }
      const t={x,y,w:nw,h:nh}; if(t.x<-1e-6||t.y<-1e-6||t.x+t.w>1+1e-6||t.y+t.h>1+1e-6||!cropValid(t)) return; S.crop=t; }
    layoutCrop(); });
  const up=()=>{ if(!d) return; d=null; schedule(true); commit('Crop'); }; box.addEventListener('pointerup',up); box.addEventListener('pointercancel',up);
})();
$('#cropBtn').onclick=()=>toggleCrop();
addEventListener('resize',()=>{ layoutCrop(); });

/* ---- Before/after, copy/paste, auto ---- */
function setBefore(on){ beforeOn=on; $('#baLabel').hidden=!on; $('#baBtn').classList.toggle('on',on); schedule(true); }
$('#baBtn').onclick=()=>setBefore(!beforeOn);
function copySettings(){ if(!S) return; clip=clone(S); GEOM.forEach(k=>delete clip[k]); localStorage.setItem('ps.clip',JSON.stringify(clip)); toast('Settings copied'); }
function pasteSettings(){ if(!clip) return toast('Nothing copied yet');
  const list = mode==='develop'?[curPhoto()]:targets(); if(!list.length) return toast('Select photos first');
  const part=Array.isArray(clip.__keys)?clip.__keys:null;
  if(part){ for(const p of list){ const src=p.id===cur&&S?S:p.settings; const ns=clone(src); part.forEach(k=>{ if(clip[k]!==undefined) ns[k]=clone(clip[k]); }); fillDefaults(ns);
      if(p.id===cur&&S&&mode==='develop'){ S=ns; p.settings=S; syncUI(); schedule(true); commit('Paste settings'); continue; }
      p.settings=ns; p.history=p.history.slice(0,p.hIdx+1); p.history.push({label:'Paste settings',s:clone(ns)}); p.hIdx=p.history.length-1; p.edited=true; savePhoto(p,0); }
    if(mode==='library'){ renderLibrary(); toast(`Pasted ${part.length} setting(s) onto ${list.length} photo(s).`); } else toast('Pasted selected settings',1200); return; }
  for(const p of list){ if(p.id===cur&&S&&mode==='develop'){ applyPreset(clip,'Paste settings'); continue; }
    const keep={}; GEOM.forEach(k=>keep[k]=p.settings[k]); p.settings=fillDefaults(Object.assign(defaults(),clone(clip),keep)); p.history=p.history.slice(0,p.hIdx+1); p.history.push({label:'Paste settings',s:clone(p.settings)}); p.hIdx=p.history.length-1; p.edited=true; savePhoto(p,0); }
  if(mode==='library'){ renderLibrary(); toast(`Pasted onto ${list.length} photo(s). Thumbnails update when opened.`); } }
$('#copyBtn').onclick=copySettings; $('#pasteBtn').onclick=pasteSettings;
$('#resetBtn').onclick=()=>{ if(!S) return; const keep={}; ['crop','angle','orient','flipH','aspect'].forEach(k=>keep[k]=S[k]); S=Object.assign(defaults(),keep); curPhoto().settings=S; syncUI(); schedule(true); commit('Reset'); };
$('#autoBtn').onclick=()=>{ if(!S) return; const t=clone(S); Object.assign(t,{exposure:0,contrast:0,highlights:0,shadows:0,whites:0,blacks:0,curve:defaults().curve});
  const H=engine.histogram(t); const L=new Float64Array(256); let n=0; for(let i=0;i<256;i++){ L[i]=0.2126*H[0][i]+0.7152*H[1][i]+0.0722*H[2][i]; n+=L[i]; }
  const pct=q=>{ let a=0; for(let i=0;i<256;i++){ a+=L[i]; if(a>=q*n) return i/255; } return 1; };
  let mean=0; for(let i=0;i<256;i++) mean+=L[i]*Math.pow(i/255,2.2); mean/=n;
  const p01=pct(0.005), p99=pct(0.995);
  S.exposure=+clamp(Math.log2(0.18/Math.max(mean,1e-3))*0.6,-2.5,2.5).toFixed(2);
  S.contrast=Math.round(clamp((0.75-(p99-p01))*60,-20,30)); S.highlights=Math.round(clamp(-(p99-0.85)*200,-70,0)); S.shadows=Math.round(clamp((0.2-p01)*150,0,50));
  S.whites=Math.round(clamp((0.97-p99)*100,-20,40)); S.blacks=Math.round(clamp(-(p01-0.02)*100,-40,10)); S.vibrance=Math.max(S.vibrance,15);
  syncUI(); schedule(true); commit('Auto'); toast('Auto tone applied',1000); };

/* ================= Export ================= */
function dlg(html){ $('#dlg').innerHTML=html; $('#modal').hidden=false; }
function closeDlg(){ $('#modal').hidden=true; }
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal') closeDlg(); });
let expOpts=JSON.parse(localStorage.getItem('ps.exp')||'{"q":92,"size":"full","edge":2048,"fmt":"jpeg"}');
$('#exportBtn').onclick=openExport;
function openExport(){
  const list = mode==='develop'? (curPhoto()?[curPhoto()]:[]) : (sel.size?photos.filter(p=>sel.has(p.id)):filtered());
  if(!list.length) return toast('Nothing to export');
  dlg(`<h3>Export ${list.length} photo${list.length>1?'s':''}</h3>
   <div class="f"><label>JPEG quality: <b id="qv">${expOpts.q}</b></label><input type="range" id="eq" min="40" max="100" value="${expOpts.q}"></div>
   <div class="f"><label>Size</label><select id="es"><option value="full">Full resolution</option><option value="edge">Long edge…</option></select></div>
   <div class="f" id="edgeF"><label>Long edge (px)</label><input type="number" id="ee" value="${expOpts.edge}" min="64" max="20000"></div>
   <label class="chk" style="margin:8px 0"><input type="checkbox" id="eExif" ${expOpts.exif!==false?'checked':''}> Include camera info (EXIF)</label>
   ${list.length>1?'<div class="f"><label>Batch output</label><select id="ez"><option value="zip">Single ZIP file</option><option value="each">Separate files</option></select></div>':''}
   <div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="go">Export</button></div>`);
  $('#es').value=expOpts.size; const upd=()=>$('#edgeF').hidden=$('#es').value!=='edge'; upd(); $('#es').onchange=upd;
  $('#eq').oninput=()=>$('#qv').textContent=$('#eq').value;
  $('#go').onclick=async()=>{ expOpts={...expOpts,exif:$('#eExif').checked,q:+$('#eq').value,size:$('#es').value,edge:+$('#ee').value||2048}; localStorage.setItem('ps.exp',JSON.stringify(expOpts)); closeDlg();
    await runExport(list, $('#ez')?$('#ez').value:'one'); };
}
async function renderExport(p, opts, onMsg){
  const s=fillDefaults(clone(p.id===cur&&S?S:p.settings)); let note='', src=null, W, H, tmpR=null, img=null, parent=null, ownParent=false;
  if(p.rawStored){
    try{ if(p.id===cur&&curRaw){ src={R:await ensureRawFull()}; }
         else { try{ tmpR=await decodeFullRaw(p,onMsg); } catch(e){ onMsg&&onMsg('Decoding RAW (half size)'); tmpR=toRawSource(await (await rawLib())(await (await blobGet(p.id)).arrayBuffer(),{half:true})); note=' (half-resolution RAW on this device)'; } src={R:tmpR}; }
         if(src.R.half) note=note||' (half-resolution RAW on this device)';
         W=src.R.fullW; H=src.R.fullH; }
    catch(e){ console.error(e); src=null; note=' (RAW decode failed: used embedded preview)'; }
  }
  if(!src){ img=await decode(await blobGet(p.rawStored?p.id+':prev':p.id)); src={img}; ({w:W,h:H}=dimsOf(img)); }
  const _msO=window.maskSrcOverride, _fill=engine.fill; if(p.id!==cur&&window.prepareExportPhoto) await prepareExportPhoto(p,s);
  const savedDims=maskDims; maskDims = W>=H?[MASK_RES,Math.max(8,Math.round(MASK_RES*H/W))]:[Math.max(8,Math.round(MASK_RES*W/H)),MASK_RES];
  try{
    const odd=s.orient%2; const ow=s.crop.w*(odd?H:W), oh=s.crop.h*(odd?W:H);
    let k=1; if(opts.size==='edge') k=Math.min(1,opts.edge/Math.max(ow,oh));
    const maxArea=isTouch?16.7e6:60e6; if(ow*oh*k*k>maxArea){ k=Math.sqrt(maxArea/(ow*oh)); if(opts.size!=='edge') note+=' (reduced to fit device limits)'; }
    const OW=Math.max(1,Math.round(ow*k)), OH=Math.max(1,Math.round(oh*k));
    if(p.id===cur&&engine.state&&(!p.rawStored||curRaw||!src.R)) parent=engine.state;
    else { ownParent=true; const kk=Math.min(1,1024/Math.max(W,H)); parent= src.R ? engine.makeState(null,{raw:src.R,w:Math.round(W*kk),h:Math.round(H*kk),fullW:W,fullH:H}) : engine.makeState(scaledCanvas(src.img,1024),{fullW:W,fullH:H}); }
    const onT=(i,n)=>onMsg&&n>1&&onMsg(`Rendering tile ${i}/${n}`); const hb=/16$/.test(opts.fmt||'');
    if(hb){ const D=await renderTiled16(src,s,W,H,OW,OH,parent,onT); if(window.preEncode16) await preEncode16(D,opts,p,onMsg); const out=await encode16(D,opts); return {blob:out,w:OW,h:OH,note}; }
    let c=await renderTiled(src,s,W,H,OW,OH,parent,onT); if(window.preEncode){ const r2=await preEncode(c,opts,p,onMsg); if(r2&&r2!==c){ c.width=c.height=1; c=r2; } } if(window.postExport) await postExport(c,opts,p);
    let out=(opts.fmt==='tiff'||opts.fmt==='webp')?await encode8(c,opts):await canvasBlob(c,opts.fmt==='png'?'image/png':'image/jpeg',opts.q/100); const FW=c.width, FH=c.height; c.width=c.height=1; if(opts.exif!==false&&(!opts.fmt||opts.fmt==='jpeg')) out=await insertExif(out,p.exif,FW,FH); return {blob:out,w:FW,h:FH,note};
  } finally { window.maskSrcOverride=_msO; if(p.id!==cur){ if(engine.fill&&engine.fill!==_fill) engine.setFill(null); engine.fill=_fill; } maskDims=savedDims; if(ownParent) engine.freeState(parent); if(tmpR) engine.freeRaw(tmpR); if(img&&img.close) img.close(); engine.lutKey='';
    if(p.id!==cur) (s.masks||[]).forEach(m=>{ const e=engine.maskTex.get(m.id); if(e){ engine.gl.deleteTexture(e.tex); engine.maskTex.delete(m.id); } maskCanvases.delete(m.id); }); }
}
const outName=p=>window.exportName?exportName(p):p.name.replace(/\.[^.]+$/,'')+'-edit.jpg';
async function runExport(list, how){
  const files=[]; let notes='';
  try{
    for(let i=0;i<list.length;i++){ busy(true,`Exporting ${i+1} of ${list.length}…`); await nextFrame(); const r=await renderExport(list[i],expOpts,m=>busy(true,`Exporting ${i+1} of ${list.length}: ${m}…`)); notes+=r.note; files.push({name:outName(list[i]),blob:r.blob,w:r.w,h:r.h}); }
  }catch(e){ console.error(e); busy(false); return toast('Export failed: '+e.message,5000); }
  busy(false); schedule(true);
  window.__lastExport=files.map(f=>({name:f.name,size:f.blob.size,w:f.w,h:f.h}));
  let final; if(files.length>1&&how==='zip'){ final=[{name:'photo-studio-export.zip',blob:await makeZip(files)}]; } else final=files;
  const canShare = navigator.canShare && navigator.canShare({files:final.map(f=>new File([f.blob],f.name,{type:f.blob.type}))});
  dlg(`<h3>Export ready</h3><p>${files.length} photo${files.length>1?'s':''}${files.length===1?` · ${files[0].w}×${files[0].h} · ${(files[0].blob.size/1048576).toFixed(1)} MB`:''}${notes?'<br><small>'+notes+'</small>':''}</p>
    <div class="btns">${canShare?'<button class="btn" id="shareB">Share / Save to Photos</button>':''}<button class="btn primary" id="dlB">Download</button></div>`);
  $('#dlB').onclick=()=>{ final.forEach((f,i)=>setTimeout(()=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(f.blob); a.download=f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),60000); },i*400)); closeDlg(); };
  if(canShare) $('#shareB').onclick=async()=>{ try{ await navigator.share({files:final.map(f=>new File([f.blob],f.name,{type:f.blob.type}))}); }catch(e){} closeDlg(); };
}
// Minimal ZIP (store) writer
const CRC=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function crc32(b){ let c=0xFFFFFFFF; for(let i=0;i<b.length;i++) c=CRC[(c^b[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
async function makeZip(files){
  const parts=[], cen=[]; let off=0; const enc=new TextEncoder(); const used=new Set();
  for(const f of files){ let name=f.name, n=1; while(used.has(name)) name=f.name.replace(/(\.\w+)$/,`-${n++}$1`); used.add(name);
    const data=new Uint8Array(await f.blob.arrayBuffer()), nm=enc.encode(name), crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30)); h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true); h.setUint16(26,nm.length,true); h.setUint16(12,33,true);
    parts.push(h.buffer,nm,data);
    const c=new DataView(new ArrayBuffer(46)); c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true); c.setUint16(28,nm.length,true); c.setUint16(14,33,true); c.setUint32(42,off,true);
    cen.push(c.buffer,nm); off+=30+nm.length+data.length; }
  const csz=cen.reduce((a,b)=>a+(b.byteLength||b.length),0); const e=new DataView(new ArrayBuffer(22)); e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,csz,true); e.setUint32(16,off,true);
  return new Blob([...parts,...cen,e.buffer],{type:'application/zip'});
}

/* ================= Keyboard & misc ================= */
$('#helpBtn').onclick=()=>dlg(`<h3>Keyboard shortcuts</h3><table>${[['G','Library grid'],['D','Develop'],['← →','Previous / next photo'],['0–5','Set star rating'],['P / X / U','Pick / reject / unflag'],['\\','Before / after'],['R','Crop tool (Enter/Esc to finish)'],['Ctrl+Z / Ctrl+Shift+Z','Undo / redo'],['Ctrl+Shift+C / V','Copy / paste settings'],['Q','Spot removal tool'],['M','Masks tool'],['O','Show/hide mask overlay'],['[ / ]','Brush size'],['Z / double-click','Zoom fit ↔ 100%'],['Space+drag','Pan when zoomed'],['Ctrl+E','Export'],['Ctrl+I','Import'],['Ctrl+A','Select all (Library)'],['Delete','Remove from library'],['Double-click slider','Reset it']].map(([k,v])=>`<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table><p style="color:var(--dim)">On iPhone: tap a selected thumbnail to open it, double-tap slider labels to reset.</p><div class="btns"><button class="btn primary" onclick="closeDlg()">Close</button></div>`);
document.addEventListener('keydown',e=>{
  const t=e.target; if(t.tagName==='INPUT'&&t.type!=='range'||t.tagName==='SELECT'||t.tagName==='TEXTAREA') return;
  if(!$('#modal').hidden){ if(e.key==='Escape') closeDlg(); return; }
  const mod=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();
  if(mod&&k==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if(mod&&k==='y'){ e.preventDefault(); redo(); return; }
  if(mod&&e.shiftKey&&k==='c'){ e.preventDefault(); copySettings(); return; }
  if(mod&&e.shiftKey&&k==='v'){ e.preventDefault(); pasteSettings(); return; }
  if(mod&&k==='e'){ e.preventDefault(); openExport(); return; }
  if(mod&&k==='i'){ e.preventDefault(); $('#fileIn').click(); return; }
  if(mod&&k==='a'&&mode==='library'){ e.preventDefault(); sel=new Set(filtered().map(p=>p.id)); renderLibrary(); return; }
  if(mod) return;
  if(t.type==='range'&&(k.startsWith('arrow'))) return;
  if(k==='g'){ setMode('library'); } else if(k==='d'||k==='e'&&mode==='library'){ setMode('develop'); }
  else if(k>='0'&&k<='5'){ setRating(targets(),+k); }
  else if(k==='p') setFlag(targets(),1); else if(k==='x') setFlag(targets(),-1); else if(k==='u') setFlag(targets(),0);
  else if(k==='\\'&&mode==='develop') setBefore(!beforeOn);
  else if(k==='r'&&mode==='develop') toggleCrop();
  else if(k==='q'&&mode==='develop') setTool('heal');
  else if(k==='m'&&mode==='develop') setTool('mask');
  else if(k==='z'&&mode==='develop') toggleZoom();
  else if(k==='o'&&mode==='develop'){ ovOn=!ovOn; const c=$('#ovChk'); if(c) c.checked=ovOn; schedule(); }
  else if((k==='['||k===']')&&mode==='develop'){ brush.size=clamp(brush.size*(k===']'?1.15:1/1.15),0.5,40); syncUI(); drawOverlay(); }
  else if((k==='delete'||k==='backspace')&&mode==='develop'&&tool){ deleteSelected(); }
  else if(k==='escape'&&tool) setTool(tool);
  else if((k==='enter'||k==='escape')&&cropOn) toggleCrop(false);
  else if(k==='arrowleft'){ e.preventDefault(); step(-1); } else if(k==='arrowright'){ e.preventDefault(); step(1); }
  else if((k==='delete'||k==='backspace')&&mode==='library') removeSelected();
  else if(k==='?') $('#helpBtn').click();
});
$('#fileIn').onchange=e=>{ importFiles(e.target.files); e.target.value=''; };
$('#demoBtn').onclick=async()=>{ busy(true,'Creating sample…'); importFiles([await makeSample()]); };
addEventListener('dragover',e=>{ e.preventDefault(); document.body.classList.add('drag'); });
addEventListener('dragleave',e=>{ if(!e.relatedTarget) document.body.classList.remove('drag'); });
addEventListener('drop',e=>{ e.preventDefault(); document.body.classList.remove('drag'); if(e.dataTransfer.files.length) importFiles(e.dataTransfer.files); });
addEventListener('pagehide',flushThumb);

/* ================= Boot ================= */
addEventListener('DOMContentLoaded', async function boot(){
  try{ engine=new Engine($('#gl')); }catch(e){ document.body.innerHTML='<p style="padding:20px">Photo Studio needs WebGL2, which this browser does not support. '+e.message+'</p>'; return; }
  engine.maskSource=maskCanvasFor; initStage();
  $('#healBtn').onclick=()=>setTool('heal'); $('#maskBtn').onclick=()=>setTool('mask'); $('#zoomBtn').onclick=()=>toggleZoom();
  $('#gl').addEventListener('webglcontextlost',e=>{ e.preventDefault(); toast('Graphics context lost; reloading…'); setTimeout(()=>location.reload(),1200); });
  buildPanel();
  await openDB(); photos=(await dbAll()).map(p=>{ fillDefaults(p.settings); return p; });
  renderLibrary();
  if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(()=>{});
});

/* ---- Per-section Reset buttons (undoable) ---- */
const SEC_KEYS={'Basic':['wbTemp','wbTint','exposure','contrast','highlights','shadows','whites','blacks','texture','clarity','dehaze','vibrance','saturation','rawProfile'],
 'Tone Curve':['curve','pcurve'],'Colour Mixer':['hsl'],'B&W Mixer':['bwOn','bwMix'],'Colour Grading':['grade'],'Detail':['sharpAmount','sharpRadius','sharpDetail','sharpMasking','nrLum','nrLumDetail','nrLumContrast','nrColor','nrColorDetail','nrColorSmooth'],
 'Effects':['vigAmount','vigMid','vigRound','vigFeather','vigStyle','vigHi','grainAmount','grainSize','grainRough'],'Crop':['crop','angle','orient','flipH','aspect'],
 'Lens':['lensVig','lensVigMid','distortion','perspV','perspH','perspScale','perspRot','perspAspect','perspX','perspY','guides','upright','caR','caB','fringe','fringeG','fringePR','fringeGR','lsoft','moire','lsharp','lshC','lshB'],'Lens Blur':['lb'],'Point Color':['pcol'],'Calibration':['cal'],'Colour Rendering':['rend','rendAmt','psc','hcurve'],'Selective Tone':['stHi','stMid','stSh','stBlk'],'Smart Lighting':['sl','slFace','slMode','slSpot','cv','air','mc','fc','fcH','fcS'],'Colour Wheel':['cw'],'Control Points':['cps'],'Film':['film','filmAmt','fBlur','leak','leakPos','leakCol','texture2','frame','frameW'],'ViewPoint':['vol','volMode','volF'],'Mask':['masks'],'Spot':['spots','healStrokes'],'Red-eye':['redEyes']};
function addSectionResets(){ document.querySelectorAll('#sections details.sec>summary').forEach(sm=>{ if(sm.querySelector('.secReset')) return;
  const t=sm.textContent; const key=Object.keys(SEC_KEYS).find(k=>t.startsWith(k)||t.includes(k)); if(!key) return;
  const b=document.createElement('button'); b.className='secReset'; b.title='Reset '+key; b.textContent='↺';
  b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); if(!S) return; const d=defaults(); SEC_KEYS[key].forEach(k=>S[k]=JSON.parse(JSON.stringify(d[k]))); curPhoto().settings=S; syncUI(); if(window.syncMaskUI) try{syncMaskUI();}catch(_){} if(window.syncSpotUI) try{syncSpotUI();}catch(_){} schedule(true); commit('Reset '+key); };
  sm.appendChild(b); }); }
setTimeout(addSectionResets,0); document.addEventListener('DOMContentLoaded',()=>setTimeout(addSectionResets,50));
/* Before/After button: hold to view original on touch, tap toggles */
(()=>{ const bb=$('#baBtn'); let t0=0, held=false, tm=null;
  bb.addEventListener('pointerdown',()=>{ t0=Date.now(); held=false; tm=setTimeout(()=>{ held=true; setBefore(true); },250); });
  const up=()=>{ clearTimeout(tm); if(held){ setBefore(false); held=false; bb._skip=true; } };
  bb.addEventListener('pointerup',up); bb.addEventListener('pointercancel',up); bb.addEventListener('pointerleave',up);
  bb.onclick=()=>{ if(bb._skip){ bb._skip=false; return; } setBefore(!beforeOn); }; })();
