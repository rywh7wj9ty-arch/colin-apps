'use strict';
/* ===== True RAW: decode control, full-res, tiled rendering ===== */
let curRaw=null, curRawFull=null, rawFullP=null;
const IOS_MEM = isTouch;  // conservative memory mode for phones/tablets
function rawBadge(msg, hold){ const b=$('#rawBadge'); clearTimeout(b._t); clearInterval(b._i); if(!msg){ b.hidden=true; return; } b.hidden=false;
  if(hold){ const t0=Date.now(); const upd=()=>b.innerHTML=`<span class="mini-spin"></span>${msg} ${Math.round((Date.now()-t0)/1000)}s`; upd(); b._i=setInterval(upd,500); } else { b.textContent=msg; b._t=setTimeout(()=>b.hidden=true,2500); } }
function freeRaws(){ if(curRawFull&&curRawFull!==curRaw) engine.freeRaw(curRawFull); if(curRaw) engine.freeRaw(curRaw); curRaw=curRawFull=null; rawFullP=null; }
async function rawLib(){ if(window.decodeRaw) return window.decodeRaw; await new Promise((res,rej)=>{ addEventListener('rawready',res,{once:true}); setTimeout(()=>rej(new Error('RAW decoder failed to load')),20000); }); return window.decodeRaw; }
function resampleU16(d,w,h,nw,nh){ const o=new Uint16Array(nw*nh*3); const sx=w/nw, sy=h/nh;
  for(let y=0;y<nh;y++){ const fy=Math.min(h-1.001,(y+.5)*sy-.5), y0=Math.max(0,fy|0), ty=fy-y0, r0=y0*w*3, r1=Math.min(h-1,y0+1)*w*3;
    for(let x=0;x<nw;x++){ const fx=Math.min(w-1.001,(x+.5)*sx-.5), x0=Math.max(0,fx|0), tx=fx-x0, a=x0*3, b=Math.min(w-1,x0+1)*3, oi=(y*nw+x)*3;
      for(let c=0;c<3;c++) o[oi+c]=(d[r0+a+c]*(1-tx)+d[r0+b+c]*tx)*(1-ty)+(d[r1+a+c]*(1-tx)+d[r1+b+c]*tx)*ty; } } return o; }
function toRawSource(dec){ const M=engine.maxTex; if(dec.w>M||dec.h>M){ const k=M/Math.max(dec.w,dec.h); const nw=Math.floor(dec.w*k), nh=Math.floor(dec.h*k); dec.data=resampleU16(dec.data,dec.w,dec.h,nw,nh); dec.w=nw; dec.h=nh; } const R=engine.rawSource({fullW:dec.fullW,fullH:dec.fullH,mat:dec.mat,baseline:dec.baseline},dec.w,dec.h); engine.rawPut(R,dec.data,0,dec.h,0); R.half=dec.w<dec.fullW*0.9; R.limited=dec.w<dec.fullW&&!R.half; R.filters=dec.meta.filters; return R; }
// Preview: half-size decode (fast, low memory); switches the view from embedded JPEG to real RAW
async function startRawPreview(p,tok){
  rawBadge('Decoding RAW',true);
  try{ const dec=(await rawLib())(await (await blobGet(p.id)).arrayBuffer(),{half:true}); const d=await dec; if(tok!==loadToken||cur!==p.id) return;
    const R=toRawSource(d); const maxP=Math.min(isTouch?2048:2560,engine.maxTex); const k=Math.min(1,maxP/Math.max(R.w,R.h));
    dropTile(); freeRaws(); curRaw=R; engine.setRaw(R,Math.round(R.w*k),Math.round(R.h*k));
    p.w=R.fullW; p.h=R.fullH; p.rawDecoded=true; p.rawInfo={ms:Math.round(d.ms),filters:d.meta.filters}; savePhoto(p);
    maskDims = p.w>=p.h?[MASK_RES,Math.max(8,Math.round(MASK_RES*p.h/p.w))]:[Math.max(8,Math.round(MASK_RES*p.w/p.h)),MASK_RES]; maskCanvases.clear(); engine.maskTex.forEach(e=>engine.gl.deleteTexture(e.tex)); engine.maskTex.clear();
    $('#rawRow').hidden=false; updateDevMeta(); schedule(true); queueThumb();
    rawBadge(`RAW decoded (${(d.ms/1000).toFixed(1)}s)`);
  }catch(e){ console.error(e); if(tok===loadToken) rawBadge('RAW decode failed: showing embedded preview'); }
}
// Full resolution raw (for zoom/export). Phones decode Bayer files in horizontal strips to cap memory.
async function decodeFullRaw(p, onMsg){
  const dec=await rawLib(); const buf=await (await blobGet(p.id)).arrayBuffer(); const px=p.w*p.h;
  const xtrans=p.rawInfo&&p.rawInfo.filters===9;
  if(IOS_MEM && (xtrans || px>62e6 || !p.rawDecoded)) throw new Error('memory');
  if(Math.max(p.w,p.h)>engine.maxTex&&IOS_MEM) throw new Error('memory');
  const strips = IOS_MEM&&!xtrans ? Math.max(1,Math.ceil(px/9e6)) : 1;
  if(strips===1){ onMsg&&onMsg('Decoding full-resolution RAW'); return toRawSource(await dec(buf.slice(0),{})); }
  let R=null; const H=p.h, ov=16;
  for(let i=0;i<strips;i++){ onMsg&&onMsg(`Decoding RAW strip ${i+1}/${strips}`);
    const y0=Math.floor(i*H/strips/2)*2, y1=i===strips-1?H:Math.floor((i+1)*H/strips/2)*2; const a=Math.max(0,y0-ov), b=Math.min(H,y1+ov);
    const d=await dec(buf.slice(0),{cropbox:[0,a,p.w,b-a]});
    if(!R){ R=engine.rawSource({fullW:d.fullW,fullH:d.fullH,mat:d.mat,baseline:d.baseline},d.fullW,d.fullH); R.half=false; R.filters=d.meta.filters; }
    engine.rawPut(R,d.data,y0,y1-y0,y0-a); }
  return R;
}
async function ensureRawFull(){
  if(!curRaw) return null; if(!curRaw.half) return curRaw; if(curRawFull) return curRawFull;
  if(!rawFullP){ const p=curPhoto(), id=p.id; rawFullP=(async()=>{ try{ const R=await decodeFullRaw(p,m=>rawBadge(m,true)); if(cur!==id){ engine.freeRaw(R); return null; } curRawFull=R; rawBadge('Full-resolution RAW ready'); return R; }
    catch(e){ console.warn(e); rawBadge(e.message==='memory'?'Zoom uses half-resolution RAW on this device':'Full RAW decode failed: using half resolution'); curRawFull=curRaw; return curRaw; } })(); }
  return rawFullP;
}
// Source-space bounding box (full-res px) for a view rect of the output frame; includes heal sources
function srcBox(s, view, W, H, margin){
  const c=s.crop, odd=s.orient%2, Wr=odd?H:W, Hr=odd?W:H; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(let j=0;j<=8;j++) for(let i=0;i<=8;i++){ const fx=clamp(view[0]+view[2]*i/8,0,1), fy=clamp(view[1]+view[3]*j/8,0,1); const t=geomMap(c.x+fx*c.w,c.y+fy*c.h,s,Wr,Hr);
    x0=Math.min(x0,t[0]*W); x1=Math.max(x1,t[0]*W); y0=Math.min(y0,t[1]*H); y1=Math.max(y1,t[1]*H); }
  for(const sp of s.spots||[]){ const r=sp.r*W*1.1; if(sp.x*W+r>x0&&sp.x*W-r<x1&&sp.y*H+r>y0&&sp.y*H-r<y1){ x0=Math.min(x0,sp.sx*W-r); x1=Math.max(x1,sp.sx*W+r); y0=Math.min(y0,sp.sy*H-r); y1=Math.max(y1,sp.sy*H+r); } }
  const F=engine.fill; if(F&&F.box){ const b=F.box; if(b[0]*W<x1&&b[2]*W>x0&&b[1]*H<y1&&b[3]*H>y0){ x0=Math.min(x0,F.sbox[0]*W); y0=Math.min(y0,F.sbox[1]*H); x1=Math.max(x1,F.sbox[2]*W); y1=Math.max(y1,F.sbox[3]*H); } }
  return [clamp(Math.floor(x0-margin),0,W),clamp(Math.floor(y0-margin),0,H),clamp(Math.ceil(x1+margin),0,W),clamp(Math.ceil(y1+margin),0,H)];
}
// Make a processing state for source box b (full-res px) at scale k, from raw R or bitmap img
function regionState(src, b, k, W, H, parent){
  const bw=b[2]-b[0], bh=b[3]-b[1]; const w=Math.max(1,Math.round(bw*k)), h=Math.max(1,Math.round(bh*k)); const xf=[b[0]/W,b[1]/H,bw/W,bh/H];
  if(src.R) return engine.makeState(null,{raw:src.R,w,h,fullW:W,fullH:H,scale:w/bw,xf,parent});
  const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); g.imageSmoothingQuality='high'; const sc=dimsOf(src.img).w/W;
  g.drawImage(src.img,b[0]*sc,b[1]*sc,bw*sc,bh*sc,0,0,w,h); const st=engine.makeState(c,{fullW:W,fullH:H,scale:w/bw,xf,parent}); c.width=c.height=1; return st;
}
// Tiled full-quality render of a photo into a 2D canvas (bounded GPU memory)
async function renderTiled(src, s, W, H, OW, OH, parent, onTile){
  const out=document.createElement('canvas'); out.width=OW; out.height=OH; const g=out.getContext('2d'); if(!g) throw new Error('Canvas too large for this browser');
  const T=IOS_MEM?1024:2048; const nx=Math.ceil(OW/T), ny=Math.ceil(OH/T); const odd=s.orient%2; const Wf=(odd?H:W)*s.crop.w; const k=OW/Wf;
  for(let ty=0;ty<ny;ty++) for(let tx=0;tx<nx;tx++){
    const ox=tx*T, oy=ty*T, tw=Math.min(T,OW-ox), th=Math.min(T,OH-oy); const view=[ox/OW,oy/OH,tw/OW,th/OH];
    onTile&&onTile(ty*nx+tx+1,nx*ny); await nextFrame();
    const b=srcBox(s,view,W,H,Math.ceil(56/Math.max(k,0.05)+(s.lb&&s.lb.on?s.lb.amt/100*0.022*Math.max(W,H)*1.15:0))); const st=regionState(src,b,k,W,H,parent);
    try{ engine.process(st,s); const px=engine.readOut(st,s,tw,th,{view}); g.putImageData(new ImageData(new Uint8ClampedArray(px.buffer),tw,th),ox,oy); } finally { engine.freeState(st); }
  }
  return out;
}
