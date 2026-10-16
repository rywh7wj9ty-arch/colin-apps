'use strict';
/* ===== View / zoom / tools state ===== */
let zoom=null, zc=[0.5,0.5], tile=null, tileTimer=null, fullImg=null, fullImgP=null, prevData=null;
let tool=null, selMaskId=null, selSpot=-1, ovOn=true, brushMode=false, spaceDown=false;
const brush={size:8,feather:60,flow:70,erase:false};
const spotDef={r:0.02,feather:40,opacity:100,mode:'heal'};
const dpr=()=>Math.min(window.devicePixelRatio||1,2);
const photoDims=()=>{ const p=curPhoto(); return [p.w,p.h]; };
function rotFull(){ const [w,h]=photoDims(); return S.orient%2?[h,w]:[w,h]; }
function frameFull(){ const [Wr,Hr]=rotFull(); return cropOn?[Wr,Hr]:[Wr*S.crop.w,Hr*S.crop.h]; }
function stageSize(){ const st=$('#stage'); return [st.clientWidth, st.clientHeight]; }
function fitZoom(){ const [sw,sh]=stageSize(), [fw,fh]=frameFull(); return Math.min((sw-12)/fw,(sh-12)/fh); }
function zoomView(){
  const [w,h]=stageSize(), [fw,fh]=frameFull(); const vw=w/(zoom*fw), vh=h/(zoom*fh);
  zc[0]= vw>=1?0.5:clamp(zc[0],vw/2,1-vw/2); zc[1]= vh>=1?0.5:clamp(zc[1],vh/2,1-vh/2);
  return {css:[w,h], size:[Math.round(w*dpr()),Math.round(h*dpr())], view:[zc[0]-vw/2,zc[1]-vh/2,vw,vh], need:zoom*dpr()};
}
function currentView(){ return zoom&&!cropOn? zoomView().view : [0,0,1,1]; }
function setZoom(z, px, py){ // px,py: client point to keep fixed
  const fz=fitZoom(); if(z!==null&&z<=fz*1.001) z=null;
  if(z!==null){ const r=$('#gl').getBoundingClientRect(); const v=currentView();
    let fx=0.5, fy=0.5; if(px!==undefined){ fx=v[0]+clamp((px-r.left)/r.width,0,1)*v[2]; fy=v[1]+clamp((py-r.top)/r.height,0,1)*v[3]; }
    const [w,h]=stageSize(), [fw,fh]=frameFull(); const nvw=w/(z*fw), nvh=h/(z*fh);
    const ux=px!==undefined?(px-$('#stage').getBoundingClientRect().left)/w:0.5, uy=py!==undefined?(py-$('#stage').getBoundingClientRect().top)/h:0.5;
    zc=[fx-(ux-0.5)*nvw, fy-(uy-0.5)*nvh]; }
  zoom=z; $('#stage').classList.toggle('zoomed',!!zoom); $('#zoomBtn').textContent=zoom?Math.round(zoom*100)+'%':'Fit'; schedule();
}
function toggleZoom(px,py){ if(cropOn) return; setZoom(zoom?null:1,px,py); }

/* ===== Display <-> image mapping ===== */
function dispToSrc(x,y){ const r=$('#gl').getBoundingClientRect(); const v=currentView();
  const f=[v[0]+(x-r.left)/r.width*v[2], v[1]+(y-r.top)/r.height*v[3]]; const c=cropOn?{x:0,y:0,w:1,h:1}:S.crop;
  const [Wr,Hr]=rotFull(); return geomMap(c.x+f[0]*c.w, c.y+f[1]*c.h, S, Wr, Hr); }
function srcToDisp(t,guess){ const r=$('#gl').getBoundingClientRect(); let x=guess?guess[0]:r.left+r.width/2, y=guess?guess[1]:r.top+r.height/2; const e=1;
  for(let i=0;i<12;i++){ const a=dispToSrc(x,y), ex=a[0]-t[0], ey=a[1]-t[1]; if(Math.abs(ex)+Math.abs(ey)<1e-7) break;
    const bx=dispToSrc(x+e,y), by=dispToSrc(x,y+e); const j11=(bx[0]-a[0])/e, j21=(bx[1]-a[1])/e, j12=(by[0]-a[0])/e, j22=(by[1]-a[1])/e; const det=j11*j22-j12*j21; if(Math.abs(det)<1e-14) break;
    x-=( j22*ex-j12*ey)/det; y-=(-j21*ex+j11*ey)/det; }
  return [x,y]; }
function srcPxPerDisp(x,y){ const a=dispToSrc(x,y), b=dispToSrc(x+10,y); const [w]=photoDims(); return Math.hypot((b[0]-a[0])*w,(b[1]-a[1])*photoDims()[1])/10; }

/* ===== Full-resolution tile for zoomed view ===== */
async function ensureFullImg(){ if(fullImg) return fullImg; if(!fullImgP){ const id=cur; fullImgP=(async()=>{ const b=await blobGet(id); const im=await decode(b); if(id!==cur){ im.close&&im.close(); return null; } fullImg=im; return im; })(); } return fullImgP; }
function visibleBox(V){ const [W,H]=photoDims(); return srcBox(S,V.view,W,H,48); }
function tileFor(V){
  const want=Math.min(1,V.need); const bx=visibleBox(V);
  const ok = tile && Math.abs(tile.k-want)<0.02 && bx[0]>=tile.box[0]&&bx[1]>=tile.box[1]&&bx[2]<=tile.box[2]&&bx[3]<=tile.box[3];
  if(!ok){ clearTimeout(tileTimer); tileTimer=setTimeout(()=>buildTile(),140); }
  return ok?tile.st:null; }
async function buildTile(){
  if(!zoom||!S) return; const id=cur; let src;
  if(curRaw){ const R=await ensureRawFull(); if(!R) return; src={R}; } else { const img=await ensureFullImg(); if(!img) return; src={img}; }
  if(!zoom||cur!==id) return;
  const V=zoomView(); let k=Math.min(1,V.need); const [W,H]=photoDims(); const b=visibleBox(V); const bw=b[2]-b[0], bh=b[3]-b[1]; if(bw<4||bh<4) return;
  if(bw*bh*k*k>14e6) k=Math.sqrt(14e6/(bw*bh)); k=Math.min(k,engine.maxTex/Math.max(bw,bh));
  const st=regionState(src,b,k,W,H,engine.state);
  if(tile) engine.freeState(tile.st); tile={st,box:b,k:Math.min(1,V.need)}; schedule();
}
function dropTile(){ if(tile){ engine.freeState(tile.st); tile=null; } }
function dropFull(){ dropTile(); if(typeof freeRaws==='function') freeRaws(); if(fullImg&&fullImg.close) fullImg.close(); fullImg=null; fullImgP=null; }

/* ===== Overlay drawing ===== */
const selMask=()=>S&&(S.masks||[]).find(m=>m.id===selMaskId);
function drawOverlay(){
  const ov=$('#ov'), glc=$('#gl'); const r=glc.getBoundingClientRect(), sr=$('#stage').getBoundingClientRect();
  ov.style.left=(r.left-sr.left)+'px'; ov.style.top=(r.top-sr.top)+'px'; ov.style.width=r.width+'px'; ov.style.height=r.height+'px';
  const W=Math.round(r.width*dpr()), H=Math.round(r.height*dpr()); if(ov.width!==W||ov.height!==H){ ov.width=W; ov.height=H; }
  const g=ov.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,W,H); if(!S||!tool||cropOn) return; g.setTransform(dpr(),0,0,dpr(),-r.left*dpr(),-r.top*dpr());
  const line=(pts,col,wid,dash)=>{ g.beginPath(); pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])); g.setLineDash(dash||[]); g.strokeStyle='#000a'; g.lineWidth=wid+2; g.stroke(); g.strokeStyle=col; g.lineWidth=wid; g.stroke(); g.setLineDash([]); };
  const dot=(p,rad,fill)=>{ g.beginPath(); g.arc(p[0],p[1],rad,0,7); g.fillStyle=fill||'#fff'; g.fill(); g.lineWidth=2; g.strokeStyle='#000'; g.stroke(); };
  const [Wp,Hp]=photoDims(); const ellipse=(cx,cy,rx,ry,rot)=>{ const pts=[]; let gs; const a=(rot||0)*Math.PI/180; for(let i=0;i<=48;i++){ const th=i/48*Math.PI*2; const ex=Math.cos(th)*rx, ey=Math.sin(th)*ry; const px=cx+(ex*Math.cos(a)-ey*Math.sin(a)), py=cy+(ex*Math.sin(a)+ey*Math.cos(a))*Wp/Hp; gs=srcToDisp([px,py],gs); pts.push(gs); } return pts; };
  if(tool==='heal'){ (S.spots||[]).forEach((sp,i)=>{ const on=i===selSpot; const d=ellipse(sp.x,sp.y,sp.r,sp.r), s=ellipse(sp.sx,sp.sy,sp.r,sp.r);
      line(s,on?'#9cf':'#fff8',on?2:1.2,[5,4]); line(d,on?'#fff':'#fffa',on?2.4:1.4); const a=srcToDisp([sp.sx,sp.sy]), b=srcToDisp([sp.x,sp.y]); line([a,b],'#fff6',1); });
    if(hover&&!gest){ const rad=spotDef.r*Wp/srcPxPerDisp(hover[0],hover[1]); g.beginPath(); g.arc(hover[0],hover[1],rad,0,7); g.strokeStyle='#fff9'; g.lineWidth=1; g.stroke(); }
  }
  if(tool==='mask'){ const m=selMask(); if(!m) return; const G=m.geo;
    if(m.type==='linear'){ const dx=G.x1-G.x0, dy=(G.y1-G.y0)*Hp/Wp; const L=Math.hypot(dx,dy)||1e-3; const px=-dy/L*2, py=dx/L*2*Wp/Hp;
      const seg=(x,y)=>{ const pts=[]; let gs; for(let i=-10;i<=10;i++){ gs=srcToDisp([x+px*i/10,y+py*i/10],gs); pts.push(gs);} return pts; };
      line(seg(G.x0,G.y0),'#fff',1.5); line(seg(G.x1,G.y1),'#fff',1.5,[6,4]); line(seg((G.x0+G.x1)/2,(G.y0+G.y1)/2),'#fff8',1);
      if(!paintingMode(m)){ dot(srcToDisp([G.x0,G.y0]),7); dot(srcToDisp([G.x1,G.y1]),7,'#9cf'); dot(srcToDisp([(G.x0+G.x1)/2,(G.y0+G.y1)/2]),6,'#ccc'); } }
    if(m.type==='radial'){ line(ellipse(G.cx,G.cy,G.rx,G.ry,G.rot),'#fff',1.6); const f=1-(G.feather??50)/100; if(f>0.02) line(ellipse(G.cx,G.cy,G.rx*f,G.ry*f,G.rot),'#fff8',1,[4,4]);
      if(!paintingMode(m)){ const hs=radialHandles(G); dot(srcToDisp(hs.c),7); dot(srcToDisp(hs.x),6,'#9cf'); dot(srcToDisp(hs.y),6,'#9cf'); } }
    if(paintingMode(m)&&hover){ const rad=brush.size/100*0.25*Math.max(Wp,Hp)/srcPxPerDisp(hover[0],hover[1]); g.beginPath(); g.arc(hover[0],hover[1],rad,0,7); g.strokeStyle='#fff'; g.lineWidth=1.2; g.stroke();
      g.beginPath(); g.arc(hover[0],hover[1],rad*(1-brush.feather/100),0,7); g.strokeStyle='#fff8'; g.setLineDash([3,3]); g.stroke(); g.setLineDash([]);
      g.fillStyle='#fff'; g.font='bold 14px sans-serif'; g.fillText(brush.erase?'−':'+',hover[0]-4,hover[1]+5); }
  }
}
function radialHandles(G){ const [Wp,Hp]=photoDims(); const a=(G.rot||0)*Math.PI/180; return {c:[G.cx,G.cy], x:[G.cx+Math.cos(a)*G.rx, G.cy+Math.sin(a)*G.rx*Wp/Hp], y:[G.cx-Math.sin(a)*G.ry, G.cy+Math.cos(a)*G.ry*Wp/Hp]}; }
const paintingMode=m=>m&&(m.type==='brush'||brushMode);

/* ===== Pointer handling on stage ===== */
const ptrs=new Map(); let gest=null, pinch=null, hover=null, lastTapT=0, lastTapP=null;
const HIT=()=>isTouch?26:14;
const dist2=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function stageDown(e){
  if(e.target.closest('#cropBox')||mode!=='develop'||!S) return;
  e.preventDefault(); try{ $('#stage').setPointerCapture(e.pointerId); }catch(_){} ptrs.set(e.pointerId,[e.clientX,e.clientY]);
  if(ptrs.size===2){ if(gest&&gest.snap){ S=gest.snap; curPhoto().settings=S; } gest=null; const [a,b]=[...ptrs.values()]; pinch={d:dist2(a,b),m:[(a[0]+b[0])/2,(a[1]+b[1])/2],z:zoom||fitZoom(),c:[...zc]}; schedule(true); return; }
  if(ptrs.size>2) return;
  const p=[e.clientX,e.clientY]; gest=null;
  if(tool&&!spaceDown&&e.button!==1){ gest=toolDown(p); if(gest) return; }
  if(zoom) gest={type:'pan',p0:p,c0:[...zc],moved:false}; else gest={type:'tap',p0:p};
}
function stageMove(e){
  const p=[e.clientX,e.clientY]; if(ptrs.has(e.pointerId)) ptrs.set(e.pointerId,p);
  if(pinch&&ptrs.size>=2){ const [a,b]=[...ptrs.values()]; const d=dist2(a,b), m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const z=clamp(pinch.z*d/pinch.d,fitZoom()*0.999,4); const [w,h]=stageSize(), [fw,fh]=frameFull();
    if(z<=fitZoom()*1.001){ if(zoom) setZoom(null); return; }
    if(!zoom){ zoom=pinch.z; }
    // keep the frame point under the original midpoint under the current midpoint
    const sr=$('#stage').getBoundingClientRect(); const v0w=w/(pinch.z*fw), v0h=h/(pinch.z*fh);
    const fx=pinch.c[0]+((pinch.m[0]-sr.left)/w-0.5)*v0w, fy=pinch.c[1]+((pinch.m[1]-sr.top)/h-0.5)*v0h;
    const vw=w/(z*fw), vh=h/(z*fh); zc=[fx-((m[0]-sr.left)/w-0.5)*vw, fy-((m[1]-sr.top)/h-0.5)*vh]; setZoom(z); return; }
  if(!gest){ if(tool){ hover=p; drawOverlay(); } return; }
  if(gest.type==='pan'){ const [w,h]=stageSize(), [fw,fh]=frameFull(); if(dist2(p,gest.p0)>4) gest.moved=true; zc=[gest.c0[0]-(p[0]-gest.p0[0])/(zoom*fw), gest.c0[1]-(p[1]-gest.p0[1])/(zoom*fh)]; schedule(); return; }
  if(gest.type==='tap') return;
  hover=p; toolMove(gest,p);
}
function stageUp(e){
  ptrs.delete(e.pointerId); if(pinch){ if(ptrs.size<2) pinch=null; gest=null; return; }
  const g=gest; gest=null; if(!g) return; const p=[e.clientX,e.clientY];
  if(g.type==='tap'||(g.type==='pan'&&!g.moved)){ const now=Date.now(); if(now-lastTapT<320&&lastTapP&&dist2(p,lastTapP)<30){ toggleZoom(p[0],p[1]); lastTapT=0; } else { lastTapT=now; lastTapP=p; } return; }
  if(g.type==='pan') return;
  toolUp(g,p);
}
function initStage(){
  const st=$('#stage'); st.addEventListener('pointerdown',stageDown); st.addEventListener('pointermove',stageMove); st.addEventListener('pointerup',stageUp); st.addEventListener('pointercancel',e=>{ ptrs.delete(e.pointerId); if(gest&&gest.snap){ S=gest.snap; curPhoto().settings=S; schedule(true);} gest=null; pinch=null; });
  st.addEventListener('pointerleave',()=>{ hover=null; if(tool) drawOverlay(); });
  st.addEventListener('wheel',e=>{ if(mode!=='develop'||cropOn) return; e.preventDefault(); const z=(zoom||fitZoom())*Math.exp(-e.deltaY*(e.ctrlKey?0.01:0.0025)); setZoom(clamp(z,0,4),e.clientX,e.clientY); },{passive:false});
  addEventListener('keydown',e=>{ if(e.code==='Space'&&e.target.tagName!=='INPUT'){ spaceDown=true; } });
  addEventListener('keyup',e=>{ if(e.code==='Space') spaceDown=false; });
  new ResizeObserver(()=>{ if(mode==='develop') schedule(); }).observe(st);
}

/* ===== Tool gestures ===== */
function toolDown(p){
  const t=dispToSrc(p[0],p[1]); const snap=clone(S);
  if(tool==='heal'){
    let hit=-1, which=null; (S.spots||[]).forEach((sp,i)=>{ const rp=sp.r*photoDims()[0]/srcPxPerDisp(p[0],p[1]); const dd=dist2(p,srcToDisp([sp.x,sp.y])), ds=dist2(p,srcToDisp([sp.sx,sp.sy]));
      if(dd<Math.max(rp,HIT())) { hit=i; which='dst'; } else if(ds<Math.max(rp,HIT())&&which!=='dst'){ hit=i; which='src'; } });
    if(hit>=0){ selSpot=hit; syncSpotUI(); return {type:'spot',which,i:hit,t0:t,o:clone(S.spots[hit]),snap,moved:false}; }
    if(S.spots.length>=32){ toast('Maximum of 32 spots'); return {type:'none'}; }
    const sp={x:t[0],y:t[1],sx:t[0],sy:t[1],r:spotDef.r,feather:spotDef.feather,opacity:spotDef.opacity,mode:spotDef.mode}; autoSource(sp);
    S.spots.push(sp); selSpot=S.spots.length-1; syncSpotUI(); schedule(true); return {type:'newspot',i:selSpot,snap,p0:p,moved:false};
  }
  if(tool==='mask'){ const m=selMask(); if(!m){ toast('Add a mask first'); return {type:'none'}; }
    if(paintingMode(m)){ const s={erase:brush.erase,size:brush.size,feather:brush.feather,flow:brush.flow,pts:[[+t[0].toFixed(5),+t[1].toFixed(5)]]}; m.strokes=m.strokes||[]; m.strokes.push(s); schedule(); return {type:'paint',s,snap}; }
    const G=m.geo;
    if(m.type==='linear'){ const hs=[['p0',[G.x0,G.y0]],['p1',[G.x1,G.y1]],['mid',[(G.x0+G.x1)/2,(G.y0+G.y1)/2]]];
      for(const [n,q] of hs) if(dist2(p,srcToDisp(q))<HIT()) return {type:'lin',h:n,t0:t,o:{...G},snap};
      G.x0=G.x1=t[0]; G.y0=G.y1=t[1]; return {type:'lin',h:'p1',t0:t,o:{...G},snap}; }
    if(m.type==='radial'){ const H=radialHandles(G); for(const [n,q] of [['x',H.x],['y',H.y],['c',H.c]]) if(dist2(p,srcToDisp(q))<HIT()) return {type:'rad',h:n,t0:t,o:{...G},snap};
      const [Wp,Hp]=photoDims(); const d=Math.hypot((t[0]-G.cx)*Wp,(t[1]-G.cy)*Hp); if(d<G.rx*Wp*0.8) return {type:'rad',h:'c',t0:t,o:{...G},snap};
      G.cx=t[0]; G.cy=t[1]; G.rx=G.ry=0.01; G.rot=0; return {type:'rad',h:'new',t0:t,o:{...G},snap}; }
  }
  return null;
}
function toolMove(g,p){
  const t=dispToSrc(p[0],p[1]); const [Wp,Hp]=photoDims();
  if(g.type==='spot'){ g.moved=true; const sp=S.spots[g.i], dx=t[0]-g.t0[0], dy=t[1]-g.t0[1]; if(g.which==='dst'){ sp.x=g.o.x+dx; sp.y=g.o.y+dy; } else { sp.sx=g.o.sx+dx; sp.sy=g.o.sy+dy; } schedule(); }
  else if(g.type==='newspot'){ if(dist2(p,g.p0)>8){ g.moved=true; const sp=S.spots[g.i]; sp.sx=t[0]; sp.sy=t[1]; schedule(); } }
  else if(g.type==='paint'){ const last=g.s.pts[g.s.pts.length-1]; const r=brush.size/100*0.25*Math.max(Wp,Hp); if(Math.hypot((t[0]-last[0])*Wp,(t[1]-last[1])*Hp)>r*0.12){ g.s.pts.push([+t[0].toFixed(5),+t[1].toFixed(5)]); schedule(); } }
  else if(g.type==='lin'){ const G=selMask().geo, dx=t[0]-g.t0[0], dy=t[1]-g.t0[1];
    if(g.h==='p0'){ G.x0=t[0]; G.y0=t[1]; } else if(g.h==='p1'){ G.x1=t[0]; G.y1=t[1]; } else { G.x0=g.o.x0+dx; G.y0=g.o.y0+dy; G.x1=g.o.x1+dx; G.y1=g.o.y1+dy; } schedule(); }
  else if(g.type==='rad'){ const G=selMask().geo; const dx=(t[0]-G.cx)*Wp, dy=(t[1]-G.cy)*Hp; const a=(G.rot||0)*Math.PI/180;
    if(g.h==='c'){ G.cx=g.o.cx+t[0]-g.t0[0]; G.cy=g.o.cy+t[1]-g.t0[1]; }
    else if(g.h==='x'){ G.rx=Math.max(0.005,Math.abs(dx*Math.cos(a)+dy*Math.sin(a))/Wp); }
    else if(g.h==='y'){ G.ry=Math.max(0.005,Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))/Wp); }
    else { G.rx=Math.max(0.005,Math.abs(dx)/Wp); G.ry=Math.max(0.005,Math.abs(dy)/Wp); }
    syncMaskUI(); schedule(); }
}
function toolUp(g){
  if(g.type==='none') return;
  if(g.type==='newspot'||g.type==='spot'){ if(g.type==='spot'&&!g.moved) { drawOverlay(); return; } schedule(true); commit(g.type==='newspot'?'Add spot':'Move spot'); return; }
  if(g.type==='paint'){ schedule(true); commit(g.s.erase?'Brush erase':'Brush paint'); return; }
  if(g.type==='lin'||g.type==='rad'){ const G=selMask().geo; if(g.h==='new'&&G.rx<0.01){ G.rx=G.ry=0.15; } if(g.type==='lin'&&Math.hypot(G.x1-G.x0,G.y1-G.y0)<0.005){ Object.assign(G,g.o); if(g.h==='p1'&&g.o.x0===g.o.x1){ G.x0=G.x0; G.y0=Math.max(0,G.y0-0.1); G.y1=Math.min(1,G.y1+0.1);} }
    syncMaskUI(); schedule(true); commit(g.type==='lin'?'Edit linear mask':'Edit radial mask'); }
}
// Pick a healing source whose surroundings best match the destination's surroundings
function autoSource(sp){
  const [Wp,Hp]=photoDims(); if(!prevData){ sp.sx=clamp(sp.x+sp.r*2.4,sp.r,1-sp.r); return; }
  const {w,h,data}=prevData; const px=(x,y)=>{ const i=(clamp(Math.round(y*h),0,h-1)*w+clamp(Math.round(x*w),0,w-1))*4; return [data[i],data[i+1],data[i+2]]; };
  const ry=sp.r*Wp/Hp; const ring=(x,y)=>{ const out=[]; for(let k=0;k<20;k++){ const a=k/20*Math.PI*2; for(const f of [1.15,1.5]) out.push(px(x+Math.cos(a)*sp.r*f,y+Math.sin(a)*ry*f)); } return out; };
  const ref=ring(sp.x,sp.y); let best=null, bs=1e18;
  for(let k=0;k<16;k++){ for(const dd of [2.2,3.2,4.5]){ const a=k/16*Math.PI*2; const x=sp.x+Math.cos(a)*sp.r*dd, y=sp.y+Math.sin(a)*ry*dd; if(x<sp.r||x>1-sp.r||y<ry||y>1-ry) continue;
    const rr=ring(x,y); let s=0; for(let i=0;i<rr.length;i++) for(let c=0;c<3;c++){ const d=rr[i][c]-ref[i][c]; s+=d*d; } s*=1+dd*0.05; if(s<bs){ bs=s; best=[x,y]; } } }
  if(best){ sp.sx=best[0]; sp.sy=best[1]; } else { sp.sx=clamp(sp.x+sp.r*2.4,0,1); sp.sy=sp.y; }
}

/* ===== Tools on/off ===== */
function setTool(t){
  if(t&&cropOn) toggleCrop(false);
  tool = tool===t? null : t; $('#healBtn').classList.toggle('on',tool==='heal'); $('#maskBtn').classList.toggle('on',tool==='mask');
  $('#stage').classList.toggle('tooling',!!tool);
  if(tool==='heal'){ openSec('healSec'); } if(tool==='mask'){ openSec('maskSec'); if(!(S.masks||[]).length) toast('Add a Linear, Radial or Brush mask'); }
  schedule(); drawOverlay();
}
function openSec(id){ const d=$('#'+id).parentElement; d.open=true; if(isTouch||innerWidth<820) setTimeout(()=>d.scrollIntoView({block:'start',behavior:'smooth'}),50); }

/* ===== Panel: Masks, Spot removal, Lens & Transform ===== */
const ADJ=[['exposure','Exposure',-4,4,0.01],['contrast','Contrast',-100,100,1],['highlights','Highlights',-100,100,1],['shadows','Shadows',-100,100,1],['temp','Temp',-100,100,1],['tint','Tint',-100,100,1],['saturation','Saturation',-100,100,1],['clarity','Clarity',-100,100,1],['sharpness','Sharpness',-100,100,1],['noise','Noise',0,100,1]];
const newAdj=()=>Object.fromEntries(ADJ.map(a=>[a[0],0]));
let maskN=0;
function addMask(type){
  const id='m'+uid(); const [Wp,Hp]=photoDims();
  // default geometry in display orientation: top-to-centre gradient / centred ellipse
  const r=$('#gl').getBoundingClientRect(); let geo={};
  if(type==='linear'){ const a=dispToSrc(r.left+r.width/2,r.top+r.height*0.1), b=dispToSrc(r.left+r.width/2,r.top+r.height*0.5); geo={x0:a[0],y0:a[1],x1:b[0],y1:b[1]}; }
  if(type==='radial'){ const c=dispToSrc(r.left+r.width/2,r.top+r.height/2); geo={cx:c[0],cy:c[1],rx:0.22,ry:0.22*Hp/Wp*0.9,rot:0,feather:50}; }
  const n={linear:'Linear',radial:'Radial',brush:'Brush'}[type]; const cnt=(S.masks||[]).filter(m=>m.type===type).length+1;
  const m={id,type,name:`${n} ${cnt}`,geo,strokes:[],invert:false,on:true,adj:newAdj()};
  if(type==='linear'||type==='radial') m.adj.exposure=0.5; // visible starting point
  S.masks.push(m); selMaskId=id; brushMode=false; if(tool!=='mask') setTool('mask'); syncMaskUI(); schedule(true); commit('Add '+n.toLowerCase()+' mask');
}
function buildToolPanels(){
  // insert after Crop section
  const after=$('#cropSec').parentElement;
  const mk=(title,id)=>{ const d=document.createElement('details'); d.className='sec'; d.innerHTML=`<summary>${title}</summary><div class="secbody" id="${id}"></div>`; return d; };
  const hs=mk('Spot Removal','healSec'), ms=mk('Masks (local adjustments)','maskSec'), ls=mk('Lens & Transform','lensSec');
  after.after(hs); hs.after(ms); $('#sections').lastElementChild.after(ls);
  const H=$('#healSec');
  H.innerHTML=`<div class="row"><button class="btn" id="healTool">Spot tool</button><div class="tabs" id="spotMode" style="flex:1;margin:0"><button data-m="heal" class="on">Heal</button><button data-m="clone">Clone</button></div></div><div id="spotSl"></div>
   <div class="row"><button class="btn" id="spotDel">Delete spot</button><button class="btn" id="spotClear">Clear all</button></div>
   <div class="hint">Tap a blemish to heal it (a matching source is chosen automatically). Press and drag to choose the source yourself. Drag circles to move them. Two-finger pinch zooms.</div>`;
  const spotSlider=(label,key,min,max,stepv,toUI,fromUI)=>{ const o=slider($('#spotSl'),label,()=>toUI(selSpotObj()?selSpotObj()[key]:spotDef[key]),(s,v)=>{ const sp=selSpotObj(); spotDef[key]=fromUI(v); if(sp){ sp[key]=fromUI(v); } },min,max,stepv,null,'Spot '+label.toLowerCase()); spotSliders.push(o); };
  spotSlider('Size','r',0.3,15,0.1,v=>+(v*100).toFixed(1),v=>v/100); spotSlider('Feather','feather',0,100,1,v=>v,v=>v); spotSlider('Opacity','opacity',0,100,1,v=>v,v=>v);
  $('#healTool').onclick=()=>setTool('heal');
  $('#spotMode').onclick=e=>{ const m=e.target.dataset.m; if(!m) return; spotDef.mode=m; const sp=selSpotObj(); if(sp){ sp.mode=m; schedule(true); commit('Spot mode'); } syncSpotUI(); };
  $('#spotDel').onclick=deleteSelected; $('#spotClear').onclick=()=>{ if(!S.spots.length) return; S.spots=[]; selSpot=-1; schedule(true); commit('Clear spots'); syncSpotUI(); };
  const M=$('#maskSec');
  M.innerHTML=`<div class="row"><button class="btn" data-add="linear">+ Linear</button><button class="btn" data-add="radial">+ Radial</button><button class="btn" data-add="brush">+ Brush</button></div>
   <div class="plist" id="mlist"></div>
   <div id="mEdit" hidden>
     <div class="row"><label class="chk"><input type="checkbox" id="ovChk" checked> Show overlay (O)</label><label class="chk"><input type="checkbox" id="invChk"> Invert</label></div>
     <div id="geoSl"></div>
     <div class="row" id="brushRow"><button class="btn" id="refineBtn">Refine with brush</button></div>
     <div id="brushBox"><div class="tabs" id="brushTabs"><button data-e="0" class="on">Paint</button><button data-e="1">Erase</button></div><div id="brushSl"></div></div>
     <div class="sub">Adjustments</div><div id="adjSl"></div>
     <div class="row"><button class="btn" id="mDup">Duplicate</button><button class="btn" id="mDel">Delete mask</button></div>
   </div><div class="hint">Linear: drag across the photo to draw a gradient. Radial: drag the handles or draw a new ellipse. Brush: paint, or switch to Erase. Use [ and ] to change brush size.</div>`;
  M.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addMask(b.dataset.add));
  slider($('#geoSl'),'Feather',()=>selMask()?.geo.feather??50,(s,v)=>{ const m=selMask(); if(m&&m.type==='radial') m.geo.feather=v; },0,100,1,null,'Mask feather');
  slider($('#geoSl'),'Angle',()=>selMask()?.geo.rot??0,(s,v)=>{ const m=selMask(); if(m&&m.type==='radial') m.geo.rot=v; },-90,90,1,null,'Mask angle');
  const bsl=(label,key,min,max)=>slider($('#brushSl'),label,()=>brush[key],(s,v)=>{ brush[key]=v; drawOverlay(); },min,max,label==='Size'?0.5:1,null,null,true);
  bsl('Size','size',0.5,40); bsl('Feather','feather',0,100); bsl('Flow','flow',5,100);
  ADJ.forEach(([k,n,mi,ma,st])=>slider($('#adjSl'),n,s=>{ const m=s&&(s.masks||[]).find(x=>x.id===selMaskId); return m?m.adj[k]:0; },(s,v)=>{ const m=selMask(); if(m) m.adj[k]=v; },mi,ma,st,k==='temp'?'linear-gradient(90deg,#4f7fd6,#ccc,#e6c34a)':k==='tint'?'linear-gradient(90deg,#4bb54b,#ccc,#c74bc7)':null,'Mask '+n.toLowerCase()));
  $('#ovChk').onchange=e=>{ ovOn=e.target.checked; schedule(); };
  $('#invChk').onchange=e=>{ const m=selMask(); if(!m) return; m.invert=e.target.checked; schedule(true); commit('Invert mask'); };
  $('#refineBtn').onclick=()=>{ brushMode=!brushMode; syncMaskUI(); drawOverlay(); };
  $('#brushTabs').onclick=e=>{ const v=e.target.dataset.e; if(v===undefined) return; brush.erase=v==='1'; syncMaskUI(); drawOverlay(); };
  $('#mDel').onclick=deleteSelected;
  $('#mDup').onclick=()=>{ const m=selMask(); if(!m) return; const c=clone(m); c.id='m'+uid(); c.name=m.name+' copy'; S.masks.push(c); selMaskId=c.id; syncMaskUI(); schedule(true); commit('Duplicate mask'); };
  $('#mlist').addEventListener('click',e=>{ const row=e.target.closest('[data-id]'); if(!row) return; const m=S.masks.find(x=>x.id===row.dataset.id);
    if(e.target.dataset.act==='eye'){ m.on=m.on===false; schedule(true); commit(m.on?'Show mask':'Hide mask'); syncMaskUI(); return; }
    selMaskId=m.id; brushMode=false; if(tool!=='mask') setTool('mask'); syncMaskUI(); schedule(); });
  // Lens & transform
  const L=$('#lensSec'); sub(L,'Lens corrections');
  const KC=k=>[s=>s[k],(s,v)=>{ s[k]=v; constrainCrop(); }];
  slider(L,'Distortion',...KC('distortion'),-100,100,1,null,'Lens distortion'); slider(L,'Vignetting',...K('lensVig'),-100,100,1,null,'Lens vignetting'); slider(L,'Midpoint',...K('lensVigMid'),0,100,1,null,'Lens vignette midpoint');
  sub(L,'Transform');
  slider(L,'Vertical',...KC('perspV'),-100,100,1,null,'Vertical perspective'); slider(L,'Horizontal',...KC('perspH'),-100,100,1,null,'Horizontal perspective'); slider(L,'Scale',...KC('perspScale'),50,150,1,null,'Transform scale');
  const tip=document.createElement('div'); tip.className='hint'; tip.textContent='The crop shrinks automatically so no blank edges appear after correction.'; L.appendChild(tip);
  syncers.push(syncMaskUI, syncSpotUI);
}
const spotSliders=[]; const selSpotObj=()=>S&&S.spots&&S.spots[selSpot];
function syncSpotUI(){ if(!S) return; if(selSpot>=S.spots.length) selSpot=-1; spotSliders.forEach(o=>o.sync()); const sp=selSpotObj(); const m=sp?sp.mode:spotDef.mode;
  $$('#spotMode button').forEach(b=>b.classList.toggle('on',b.dataset.m===m)); $('#spotDel').disabled=!sp; drawOverlay(); }
function syncMaskUI(){
  if(!S) return; const ms=S.masks||[]; if(selMaskId&&!ms.find(m=>m.id===selMaskId)) selMaskId=null;
  $('#mlist').innerHTML=ms.map(m=>`<button data-id="${m.id}" class="${m.id===selMaskId?'cur':''}"><span>${m.type==='linear'?'▤':m.type==='radial'?'◎':'✎'} ${m.name}${m.invert?' (inv)':''}</span><span class="x" data-act="eye" title="Show/hide">${m.on===false?'◌':'●'}</span></button>`).join('')||'<div style="color:#777;padding:4px 6px">No masks yet</div>';
  const m=selMask(); $('#mEdit').hidden=!m; if(!m) return;
  $('#invChk').checked=!!m.invert; $('#geoSl').hidden=m.type!=='radial'; $('#brushRow').hidden=m.type==='brush'; $('#brushBox').hidden=!paintingMode(m);
  $('#refineBtn').classList.toggle('on',brushMode); $('#refineBtn').textContent=brushMode?'Done refining':'Refine with brush';
  $$('#brushTabs button').forEach(b=>b.classList.toggle('on',(b.dataset.e==='1')===brush.erase));
  Object.values(sliders).forEach(o=>o.sync());
}
function deleteSelected(){
  if(tool==='heal'&&selSpotObj()){ S.spots.splice(selSpot,1); selSpot=-1; schedule(true); commit('Delete spot'); syncSpotUI(); return true; }
  if(tool==='mask'&&selMask()){ S.masks=S.masks.filter(m=>m.id!==selMaskId); selMaskId=null; schedule(true); commit('Delete mask'); syncMaskUI(); return true; }
  return false;
}
