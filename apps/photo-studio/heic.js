/* ===== HEIC/HEIF import in every browser: native decode first (Safari), else local libheif WASM (lazy, on-device) ===== */
(function(){
let LH=null;
function loadHeif(){ if(LH) return LH; LH=new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='heif/libheif-bundle.js'; s.onload=()=>{ try{ const L=window.libheif(); res(L); }catch(e){ rej(e); } }; s.onerror=()=>rej(new Error('Could not load HEIC decoder')); document.head.appendChild(s); }); return LH; }
async function isHeif(blob){ if(/hei[cf]/i.test(blob.type||'')||/\.(heic|heif|hif)$/i.test(blob.name||'')) return true;
  try{ const b=new Uint8Array(await blob.slice(4,12).arrayBuffer()); const t=String.fromCharCode(...b); return t.startsWith('ftyp')&&/hei[cxsm]|hev[cx]|mif1|msf1/.test(t.slice(4)); }catch(e){ return false; } }
async function heifDecode(blob){
  const L=await loadHeif(); const buf=new Uint8Array(await blob.arrayBuffer()); const dec=new L.HeifDecoder(); const imgs=dec.decode(buf);
  if(!imgs||!imgs.length) throw new Error('No image in HEIC file');
  const im=imgs[0]; const w=im.get_width(), h=im.get_height(); const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); const id=g.createImageData(w,h);
  await new Promise((res,rej)=>im.display(id,d=>d?res():rej(new Error('HEIC decode error'))));
  g.putImageData(id,0,0); imgs.forEach(i=>{ try{ i.free&&i.free(); }catch(e){} });
  try{ return await createImageBitmap(c); }catch(e){ return c; }
}
window.isHeif=isHeif;
// HEIC keeps its Exif item anywhere in the file (often at the end): scan the whole buffer for TIFF headers
const baseExif=window.parseExif;
window.parseExif=function(buf){ let r=null; try{ r=baseExif(buf); }catch(e){}
  if(r&&Object.keys(r).length>2) return r;
  const b=new Uint8Array(buf); const t=String.fromCharCode(...b.subarray(4,12)); if(!t.startsWith('ftyp')) return r;
  for(let i=600000;i<b.length-8;i++){ if((b[i]===0x4D&&b[i+1]===0x4D&&b[i+2]===0&&b[i+3]===0x2A)||(b[i]===0x49&&b[i+1]===0x49&&b[i+2]===0x2A&&b[i+3]===0)){ try{ const x=baseExif(buf.slice(i,Math.min(b.length,i+600000))); if(x){ r=Object.assign({},x,r||{}); if(Object.keys(x).length>2) break; } }catch(e){} } }
  return r; }; window.heifDecode=heifDecode;
const base=window.decode;
window.decode=async function(blob){
  if(blob&&await isHeif(blob)){
    try{ const n=await createImageBitmap(blob,{imageOrientation:'from-image'}); return n; }catch(e){} // Safari native
    if(typeof busyMsg!=='undefined'||document.getElementById('busyMsg')){ const m=document.getElementById('busyMsg'); if(m&&!/HEIC/.test(m.textContent)) m.textContent+=' (decoding HEIC on this device)'; }
    return heifDecode(blob);
  }
  return base(blob);
};
// accept .heic files with empty MIME type (Chrome/Firefox on Windows/Linux)
const fi=document.getElementById('fileIn'); if(fi&&!/\.heic/.test(fi.accept)) fi.accept+=',.heic,.heif,.hif,image/heic,image/heif';

/* ---- Convert HEIC to JPG (batch) ---- */
async function convertHeic(list){
  list=list.filter(Boolean); if(!list.length) return toast('No HEIC files found');
  const out=[]; let i=0;
  for(const f of list){ busy(true,`Converting ${++i} of ${list.length} to JPG…`);
    try{ const img=await window.decode(f); const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; c.getContext('2d').drawImage(img,0,0);
      let jb=await canvasBlob(c,'image/jpeg',0.92);
      try{ const ex=parseExif(await f.arrayBuffer()); if(ex&&typeof insertExif==='function'){ ex.Orientation=1; jb=await insertExif(jb,ex,c.width,c.height); } }catch(e){}
      out.push(new File([jb],(f.name||'photo').replace(/\.(heic|heif|hif)$/i,'')+'.jpg',{type:'image/jpeg'})); img.close&&img.close(); }
    catch(e){ console.error(e); }
    await new Promise(r=>setTimeout(r,0)); }
  busy(false); window.__heicOut=out;
  if(!out.length) return toast('Could not convert those files');
  if(navigator.canShare&&navigator.canShare({files:out})&&/iPhone|iPad/.test(navigator.userAgent)){ try{ await navigator.share({files:out}); return; }catch(e){} }
  out.forEach((f,k)=>setTimeout(()=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(f); a.download=f.name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); },k*300));
  toast(`Converted ${out.length} HEIC file${out.length>1?'s':''} to JPG — on this device, nothing uploaded`,3000);
}
window.convertHeic=convertHeic;
addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
  const pick=document.createElement('input'); pick.type='file'; pick.multiple=true; pick.accept='.heic,.heif,.hif,image/heic,image/heif'; pick.hidden=true; document.body.appendChild(pick);
  pick.onchange=()=>{ convertHeic([...pick.files]); pick.value=''; };
  const b=document.createElement('button'); b.className='btn'; b.id='heicBtn'; b.textContent='Convert HEIC → JPG…'; b.title='Convert HEIC/HEIF files (or selected HEIC photos) to JPG on this device';
  b.onclick=async()=>{ const sel=photos.filter(p=>targets().includes(p)&&/\.(heic|heif|hif)$/i.test(p.name));
    if(sel.length){ const files=[]; for(const p of sel){ const bl=await blobGet(p.id); files.push(new File([bl],p.name,{type:'image/heic'})); } convertHeic(files); } else pick.click(); };
  const grp=[...document.querySelectorAll('#libMore .mGrp')].find(g=>g.firstChild&&g.firstChild.textContent==='Output'); if(grp) grp.appendChild(b); else (document.querySelector('.filterbar')||document.body).appendChild(b);
},0));
})();
