'use strict';
/* ================= EXIF ================= */
const EXIF_TAGS={0x010F:'Make',0x0110:'Model',0x0112:'Orientation',0x0132:'DateTime',0x013B:'Artist',0x8298:'Copyright',
  0x829A:'ExposureTime',0x829D:'FNumber',0x8827:'ISO',0x9003:'DateTimeOriginal',0x9204:'ExposureBias',0x920A:'FocalLength',0xA405:'FocalLength35',0xA434:'LensModel'};
const GPS_TAGS={1:'GPSLatitudeRef',2:'GPSLatitude',3:'GPSLongitudeRef',4:'GPSLongitude',6:'GPSAltitude'};
function parseTiff(dv,base){
  const le=dv.getUint16(base)===0x4949; const u16=o=>dv.getUint16(base+o,le), u32=o=>dv.getUint32(base+o,le), i32=o=>dv.getInt32(base+o,le);
  if(u16(2)!==42) return null; const out={}; const len=dv.byteLength-base;
  const readIFD=(off,depth,gps)=>{ if(off<8||off+2>len||depth>2) return false; const n=u16(off); if(n<1||n>500||off+2+n*12>len) return false;
    for(let i=0;i<n;i++){ const e=off+2+i*12, tag=u16(e), type=u16(e+2), cnt=u32(e+4); const sz=[0,1,1,2,4,8,1,1,2,4,8][type]||1; const voff=sz*cnt>4?u32(e+8):e+8;
      if(voff+sz*cnt>len) continue;
      if(tag===0x8769){ readIFD(u32(e+8),depth+1); continue; } if(tag===0x8825&&!gps){ readIFD(u32(e+8),depth+1,true); continue; }
      const name=(gps?GPS_TAGS:EXIF_TAGS)[tag]; if(!name||out[name]!==undefined) continue;
      let v; if(type===2){ v=''; for(let k=0;k<Math.min(cnt,200);k++){ const c=dv.getUint8(base+voff+k); if(!c) break; v+=String.fromCharCode(c); } if(/[\x80-\xff]/.test(v)){ try{ v=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(v,ch=>ch.charCodeAt(0))); }catch(_){} } v=v.trim(); if(!v) continue; }
      else if(type===3) v=cnt===2?[u16(voff),u16(voff+2)]:u16(voff); else if(type===4) v=cnt===2?[u32(voff),u32(voff+4)]:u32(voff);
      else if(type===5) v=gps&&cnt===3?[0,1,2].map(k=>u32(voff+k*8)/(u32(voff+k*8+4)||1)):[u32(voff),u32(voff+4)]; else if(type===10) v=[i32(voff),i32(voff+4)]; else continue;
      out[name]=v; }
    return true; };
  if(!readIFD(u32(4),0)) return null; if(Array.isArray(out.GPSLatitude)&&Array.isArray(out.GPSLongitude)&&out.GPSLatitude.length===3){ const dms=a=>a[0]+a[1]/60+a[2]/3600; const lat=dms(out.GPSLatitude)*(/S/i.test(out.GPSLatitudeRef||'')?-1:1), lon=dms(out.GPSLongitude)*(/W/i.test(out.GPSLongitudeRef||'')?-1:1); if(lat||lon) out.GPS=[+lat.toFixed(6),+lon.toFixed(6)]; } return out;
}
function parseExif(buf){
  const dv=new DataView(buf), b=new Uint8Array(buf), lim=Math.min(b.length-8, 600000); let res={}, found=0;
  for(let i=0;i<lim&&found<4;i++){
    if((b[i]===0x49&&b[i+1]===0x49&&b[i+2]===0x2A&&b[i+3]===0)||(b[i]===0x4D&&b[i+1]===0x4D&&b[i+2]===0&&b[i+3]===0x2A)){
      try{ const r=parseTiff(dv,i); if(r&&Object.keys(r).length){ for(const k in r) if(res[k]===undefined) res[k]=r[k]; found++; } }catch(e){} } }
  return Object.keys(res).length?res:null;
}
const rat=v=>Array.isArray(v)&&v[1]?v[0]/v[1]:null;
function exifSummary(e){ if(!e) return ''; const parts=[];
  if(e.Model) parts.push((e.Make&&!e.Model.toLowerCase().startsWith(e.Make.toLowerCase().split(' ')[0])?e.Make.split(' ')[0]+' ':'')+e.Model);
  const fl=rat(e.FocalLength); if(fl) parts.push(Math.round(fl)+'mm'); const fn=rat(e.FNumber); if(fn&&fn<=64) parts.push('f/'+(+fn.toFixed(1)));
  const et=rat(e.ExposureTime); if(et&&et<3600) parts.push(et>=1?et+'s':'1/'+Math.round(1/et)+'s'); if(e.ISO) parts.push('ISO '+e.ISO);
  return parts.join(' · '); }
// orientation -> settings {orient, flipH}
function orientToSettings(o){ return ({1:[0,0],2:[0,1],3:[2,0],4:[2,1],5:[1,1],6:[1,0],7:[3,1],8:[3,0]})[o]||[0,0]; }
function buildExifSegment(e,w,h){
  const enc=s=>{ const a=[...new TextEncoder().encode(s)].slice(0,250); a.push(0); return a; };
  const ifd0=[], ex=[]; const A=(L,tag,type,vals)=>L.push({tag,type,vals});
  if(e.Make) A(ifd0,0x010F,2,enc(e.Make)); if(e.Model) A(ifd0,0x0110,2,enc(e.Model)); A(ifd0,0x0112,3,[1]);
  A(ifd0,0x0131,2,enc('Photo Studio')); const d=new Date(), p=n=>String(n).padStart(2,'0');
  A(ifd0,0x0132,2,enc(`${d.getFullYear()}:${p(d.getMonth()+1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`));
  if(e.ImageDescription) A(ifd0,0x010E,2,enc(e.ImageDescription)); if(e.Artist) A(ifd0,0x013B,2,enc(e.Artist)); if(e.Copyright) A(ifd0,0x8298,2,enc(e.Copyright));
  if(e.ExposureTime) A(ex,0x829A,5,e.ExposureTime); if(e.FNumber) A(ex,0x829D,5,e.FNumber); if(e.ISO) A(ex,0x8827,3,[Math.min(65535,+e.ISO||0)]);
  if(e.DateTimeOriginal) A(ex,0x9003,2,enc(e.DateTimeOriginal)); if(e.ExposureBias) A(ex,0x9204,10,e.ExposureBias); if(e.FocalLength) A(ex,0x920A,5,e.FocalLength);
  A(ex,0xA002,4,[w]); A(ex,0xA003,4,[h]); if(e.FocalLength35) A(ex,0xA405,3,[e.FocalLength35]); if(e.LensModel) A(ex,0xA434,2,enc(e.LensModel));
  A(ifd0,0x8769,4,[0]); // patched
  const size=[0,1,1,2,4,8,1,1,2,4,8]; const bytes=[]; const w8=(o,v)=>bytes[o]=v&255, w16=(o,v)=>{w8(o,v);w8(o+1,v>>8);}, w32=(o,v)=>{w16(o,v&0xFFFF);w16(o+2,(v>>>16)&0xFFFF);};
  w16(0,0x4949); w16(2,42); w32(4,8);
  const writeIFD=(L,off)=>{ L.sort((a,b)=>a.tag-b.tag); w16(off,L.length); let data=off+2+L.length*12+4; const ptrs={};
    L.forEach((en,i)=>{ const e2=off+2+i*12; const cnt=en.type===5||en.type===10?en.vals.length/2:en.vals.length; w16(e2,en.tag); w16(e2+2,en.type); w32(e2+4,cnt);
      const sz=size[en.type]*cnt; let vo=e2+8; if(sz>4){ w32(e2+8,data); vo=data; data+=sz+(sz&1); } else w32(e2+8,0);
      en.vals.forEach((v,k)=>{ if(en.type===2) w8(vo+k,v); else if(en.type===3) w16(vo+k*2,v); else w32(vo+k*4,v|0); }); ptrs[en.tag]=e2+8; });
    w32(off+2+L.length*12,0); return {end:data,ptrs}; };
  const r0=writeIFD(ifd0,8); w32(r0.ptrs[0x8769],r0.end); const r1=writeIFD(ex,r0.end);
  const tiff=new Uint8Array(r1.end); for(let i=0;i<r1.end;i++) tiff[i]=bytes[i]||0;
  const seg=new Uint8Array(4+6+tiff.length); seg[0]=0xFF; seg[1]=0xE1; const L=2+6+tiff.length; seg[2]=L>>8; seg[3]=L&255; seg.set([0x45,0x78,0x69,0x66,0,0],4); seg.set(tiff,10); return seg;
}
async function insertExif(jpegBlob,e,w,h){ if(!e) return jpegBlob; try{ const b=new Uint8Array(await jpegBlob.arrayBuffer()); let at=2; if(b[2]===0xFF&&b[3]===0xE0) at=4+((b[4]<<8)|b[5]);
  return new Blob([b.subarray(0,at),buildExifSegment(e,w,h),b.subarray(at)],{type:'image/jpeg'}); }catch(err){ console.error(err); return jpegBlob; } }

/* ================= Mask rasterisation (image space) ================= */
const MASK_RES=1536; const maskCanvases=new Map(); let maskDims=[MASK_RES,MASK_RES];
// Mask = base shape (+invert, +brush strokes) combined with optional components (add / subtract / intersect)
function maskCanvasFor(m){
  const c=maskShape(m,m.id);
  if(m.parts&&m.parts.length){ const g=c.getContext('2d');
    for(const pt of m.parts){ if(pt.on===false) continue; const pc=maskShape(pt,m.id+'/'+pt.id);
      g.globalCompositeOperation= pt.op==='sub'?'destination-out': pt.op==='int'?'destination-in':'lighter'; g.drawImage(pc,0,0); }
    g.globalCompositeOperation='source-over'; }
  return c; }
// Range / AI alpha at source resolution: returns canvas (white with alpha) or null
const rangeCache=new Map();
function maskSrcData(){ return window.maskSrcOverride || window.srcHi || (typeof prevData!=='undefined'?prevData:null); }
function rangeCanvas(m){
  const D=maskSrcData(); if(!D) return null; const key=JSON.stringify([m.type,m.range,m.ai,D.w,D.h,D.tag||'',window.aiVersion||0]);
  const hit=rangeCache.get(key); if(hit) return hit; if(rangeCache.size>24) rangeCache.clear();
  const {w,h,data}=D; const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); const im=g.createImageData(w,h), o=im.data;
  const R=m.range||{};
  if(m.type==='color'){ const pts=(R.pts||[]).map(p=>lab(p[0],p[1],p[2])); const t=4+((R.amt??50)/100)*36;
    for(let i=0,j=0;i<data.length;i+=4,j++){ if(!pts.length) break; const L=lab(data[i],data[i+1],data[i+2]); let best=1e9;
      for(const q of pts){ const d=Math.hypot(L[1]-q[1],L[2]-q[2])+0.5*Math.abs(L[0]-q[0]); if(d<best) best=d; }
      const a=1-sstep(t*0.55,t,best); o[i]=o[i+1]=o[i+2]=255; o[i+3]=a*255; } }
  else if(m.type==='luma'){ const lo=(R.lo??50)/100, hi=(R.hi??100)/100, f=Math.max(0.005,(R.feather??20)/100*0.5);
    for(let i=0;i<data.length;i+=4){ const L=(0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2])/255; const a=sstep(lo-f,lo,L)*(1-sstep(hi,hi+f,L)); o[i]=o[i+1]=o[i+2]=255; o[i+3]=a*255; } }
  else if(m.type==='ai'){ const A=window.aiMaskFor&&aiMaskFor(m.ai); if(!A) return null; return A; }
  else if(m.type==='depth'){ const A=window.aiMaskFor&&aiMaskFor('depth'); if(!A) return null; const dd=A.getContext('2d').getImageData(0,0,A.width,A.height).data; c.width=A.width; c.height=A.height;
    const im2=g.createImageData(A.width,A.height), o2=im2.data; const lo=(R.lo??0)/100, hi=(R.hi??35)/100, f=Math.max(0.005,(R.feather??20)/100*0.5);
    for(let i=0;i<dd.length;i+=4){ const z=1-dd[i+3]/255; const a=sstep(lo-f,lo,z)*(1-sstep(hi,hi+f,z)); o2[i]=o2[i+1]=o2[i+2]=255; o2[i+3]=a*255; } g.putImageData(im2,0,0); rangeCache.set(key,c); return c; }
  g.putImageData(im,0,0); rangeCache.set(key,c); return c; }
function sstep(a,b,x){ const t=Math.min(1,Math.max(0,(x-a)/((b-a)||1e-6))); return t*t*(3-2*t); }
const labLUT=new Float32Array(256); for(let i=0;i<256;i++){ const v=i/255; labLUT[i]=v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4); }
function lab(r,g,b){ r=labLUT[r]; g=labLUT[g]; b=labLUT[b]; const f=t=>t>0.008856?Math.cbrt(t):7.787*t+16/116;
  const X=f((0.4124*r+0.3576*g+0.1805*b)/0.9505), Y=f(0.2126*r+0.7152*g+0.0722*b), Z=f((0.0193*r+0.1192*g+0.9505*b)/1.089);
  return [116*Y-16, 500*(X-Y), 200*(Y-Z)]; }
function maskShape(m,cid){
  const [cw,ch]=maskDims; let c=maskCanvases.get(cid); if(!c){ c=document.createElement('canvas'); maskCanvases.set(cid,c); }
  if(c.width!==cw||c.height!==ch){ c.width=cw; c.height=ch; }
  const g=c.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation='source-over'; g.clearRect(0,0,cw,ch);
  const G=m.geo;
  if(m.type==='linear'){ const gr=g.createLinearGradient(G.x0*cw,G.y0*ch,G.x1*cw,G.y1*ch); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,cw,ch); }
  else if(m.type==='radial'){ g.save(); g.translate(G.cx*cw,G.cy*ch); g.rotate((G.rot||0)*Math.PI/180); g.scale(Math.max(1e-3,G.rx*cw),Math.max(1e-3,G.ry*cw));
    const inner=Math.max(0,1-(G.feather??50)/100); const gr=g.createRadialGradient(0,0,inner*0.999,0,0,1); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(-50,-50,100,100); g.restore(); }
  else if(m.type==='color'||m.type==='luma'||m.type==='ai'||m.type==='depth'){ const rc=rangeCanvas(m); if(rc){ g.imageSmoothingEnabled=true; g.imageSmoothingQuality='high'; g.drawImage(rc,0,0,cw,ch); } }
  if(m.invert){ g.globalCompositeOperation='source-out'; g.fillStyle='#fff'; g.fillRect(0,0,cw,ch); }
  const L=Math.max(cw,ch);
  for(const s of m.strokes||[]){ const r=Math.max(1,s.size/100*0.25*L); const spr=dabSprite(r,s.feather,s.flow);
    g.globalCompositeOperation=s.erase?'destination-out':'source-over'; const pts=s.pts; let prev=null;
    const dab=(x,y)=>g.drawImage(spr,x*cw-spr.width/2,y*ch-spr.height/2);
    for(const p of pts){ if(!prev){ dab(p[0],p[1]); prev=p; continue; } const dx=(p[0]-prev[0])*cw, dy=(p[1]-prev[1])*ch, d=Math.hypot(dx,dy), st=Math.max(1,r*0.18), n=Math.floor(d/st);
      for(let i=1;i<=n;i++){ const t=i*st/d; dab(prev[0]+(p[0]-prev[0])*t, prev[1]+(p[1]-prev[1])*t); } if(n>0) prev=[prev[0]+(p[0]-prev[0])*n*st/d, prev[1]+(p[1]-prev[1])*n*st/d]; }
  }
  g.globalCompositeOperation='source-over'; return c;
}
const spriteCache=new Map();
function dabSprite(r,feather,flow){ const key=[Math.round(r*2),feather,flow].join(); let c=spriteCache.get(key); if(c) return c; if(spriteCache.size>40) spriteCache.clear();
  const R=Math.ceil(r)+1; c=document.createElement('canvas'); c.width=c.height=R*2; const g=c.getContext('2d');
  const gr=g.createRadialGradient(R,R,r*Math.max(0,1-feather/100),R,R,r); const a=flow/100; gr.addColorStop(0,`rgba(255,255,255,${a})`); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,R*2,R*2); spriteCache.set(key,c); return c; }
