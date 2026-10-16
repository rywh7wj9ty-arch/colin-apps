'use strict';
/* DxO PhotoLab-style tools: Smart Lighting (face-aware), ClearView Plus, Microcontrast / Fine contrast,
   U Point control points & control lines, Colour Wheel, FilmPack-style film emulations, optics (auto CA, fringing,
   lens softness, auto vignetting), ViewPoint volume deformation. GPU work lives in engine.js (FS_DXO + FS_FIN vol()). */
const M3=(a,b,c,d,e,f,g,h,i)=>[a,b,c,d,e,f,g,h,i], BW=(r,g,b)=>[r,g,b,r,g,b,r,g,b];
window.FILMS={
  'Kodak Portra 400':{m:M3(1.05,-0.03,-0.02,-0.02,1.02,0,-0.02,-0.04,1.02),con:0.9,sat:0.86,fade:0.03,sh:[0.01,0,-0.01],hi:[0.03,0.015,-0.02],grain:[18,20]},
  'Kodak Ektar 100':{m:M3(1.1,-0.07,-0.03,-0.03,1.06,-0.03,-0.02,-0.06,1.08),con:1.2,sat:1.35,hi:[0.02,0.01,-0.02],grain:[8,12]},
  'Kodachrome 64':{m:M3(1.12,-0.09,-0.03,-0.03,1.03,0,-0.04,-0.06,1.04),con:1.28,sat:1.18,crush:0.02,sh:[-0.012,0,0.015],hi:[0.03,0.02,-0.01],grain:[12,15]},
  'Fuji Velvia 50':{m:M3(1.08,-0.06,-0.02,-0.04,1.12,-0.08,-0.02,-0.08,1.1),con:1.35,sat:1.45,sh:[0,0,0.015],grain:[6,10]},
  'Fuji Provia 100F':{m:M3(1.03,-0.02,-0.01,-0.02,1.05,-0.03,0,-0.03,1.04),con:1.15,sat:1.15,grain:[6,10]},
  'Fuji Pro 400H':{m:M3(0.98,0.02,0,-0.02,1.03,0,0,0.02,0.98),con:0.92,sat:0.88,fade:0.04,sh:[-0.01,0.012,0.02],hi:[0,0.01,0.01],grain:[18,20]},
  'CineStill 800T':{m:M3(0.95,0.02,0.03,0,1,0,0.02,0.04,1.08),con:1.1,sat:1.05,sh:[-0.02,0,0.03],hi:[0.045,0,-0.02],grain:[30,30]},
  'Agfa Vista 200':{m:M3(1.06,-0.04,-0.02,-0.01,1.04,-0.03,-0.03,-0.02,1.0),con:1.15,sat:1.15,sh:[0,0.01,0],hi:[0.03,0.01,-0.03],grain:[16,18]},
  'Polaroid 600':{m:M3(1.02,0.0,-0.02,0,0.98,0.02,0.02,0.02,0.96),con:0.82,sat:0.8,fade:0.08,crush:0.05,sh:[0,0.02,0.03],hi:[0.03,0.02,-0.02],grain:[10,25]},
  'Kodak Tri-X 400 (B&W)':{m:BW(0.32,0.52,0.16),bw:1,con:1.35,fade:0.02,grain:[35,25]},
  'Ilford HP5 Plus (B&W)':{m:BW(0.3,0.55,0.15),bw:1,con:1.12,fade:0.01,grain:[30,25]},
  'Ilford Delta 3200 (B&W)':{m:BW(0.3,0.5,0.2),bw:1,con:1.25,fade:0.05,grain:[55,35]},
  'Fuji Acros 100 (B&W)':{m:BW(0.25,0.6,0.15),bw:1,con:1.2,grain:[8,12]},
  'Sepia toned (B&W)':{m:BW(0.3,0.59,0.11),bw:1,con:1.08,fade:0.03,sh:[0.035,0.01,-0.025],hi:[0.06,0.03,-0.03],grain:[14,20]}};
const lin=v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
// Face-aware gains for Smart Lighting (faces stored in settings so exports reproduce them)
window.faceGains=s=>(s.faces||[]).slice(0,4).map(f=>({x:f.x,y:f.y,w:f.w*1.5,h:f.h*1.5,g:Math.max(-0.7,Math.min(1.5,Math.log2(0.21/Math.max(lin(f.L),1e-3))))*(s.sl/100)*0.8}));
let faceP=null, faceFail=false;
async function loadFace(){ if(faceFail) return null; if(!faceP) faceP=(async()=>{ const v=await import('./mediapipe/vision_bundle.mjs'); const fs=await v.FilesetResolver.forVisionTasks(new URL('mediapipe/wasm',location.href).href);
  return await v.FaceDetector.createFromOptions(fs,{baseOptions:{modelAssetPath:new URL('mediapipe/blaze_face_short_range.tflite',location.href).href,delegate:'CPU'},runningMode:'IMAGE',minDetectionConfidence:0.5}); })();
  try{ return await faceP; }catch(e){ console.warn('face detector unavailable',e); faceFail=true; return null; } }
function srcCanvas(D){ const c=document.createElement('canvas'); c.width=D.w; c.height=D.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(D.data.buffer?D.data:D.data),D.w,D.h),0,0); return c; }
async function detectFaces(){ const D=window.srcHi; if(!D||!S) return []; const det=await loadFace(); if(!det) return [];
  const t0=performance.now(); const r=det.detect(srcCanvas(D)); const out=[];
  for(const d of (r.detections||[]).slice(0,4)){ const b=d.boundingBox; const x0=Math.max(0,b.originX|0), y0=Math.max(0,b.originY|0), x1=Math.min(D.w,(b.originX+b.width)|0), y1=Math.min(D.h,(b.originY+b.height)|0);
    let s=0,n=0; for(let y=y0;y<y1;y+=2) for(let x=x0;x<x1;x+=2){ const k=(y*D.w+x)*4; s+=0.2126*D.data[k]+0.7152*D.data[k+1]+0.0722*D.data[k+2]; n++; }
    out.push({x:+((x0+x1)/2/D.w).toFixed(4),y:+((y0+y1)/2/D.h).toFixed(4),w:+((x1-x0)/2/D.w).toFixed(4),h:+((y1-y0)/2/D.h).toFixed(4),L:+(s/Math.max(n,1)/255).toFixed(3)}); }
  window.__faceMs=Math.round(performance.now()-t0); return out; }
// ClearView airlight: mean colour of the brightest 0.2% of the dark channel
function estimateAir(D){ const n=D.w*D.h, dc=new Uint8Array(n); for(let i=0;i<n;i++){ const k=i*4; dc[i]=Math.min(D.data[k],D.data[k+1],D.data[k+2]); }
  const H=new Uint32Array(256); dc.forEach(v=>H[v]++); let t=255, acc=0; while(t>0&&acc<n*0.002) acc+=H[t--];
  let r=0,g=0,b=0,c=0; for(let i=0;i<n;i++) if(dc[i]>t){ const k=i*4; r+=D.data[k]; g+=D.data[k+1]; b+=D.data[k+2]; c++; } const m=x=>Math.max(0.72,Math.min(1,x/c/255)); return [m(r),m(g),m(b)].map(v=>+v.toFixed(3)); }
// Auto lateral CA: find radial scale of R and B maximising gradient correlation with G at strong edges
function estimateCA(D){ const W=D.w,H=D.h,d=D.data; const ch=(c,x,y)=>{ const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0; if(x0<0||y0<0||x0>=W-1||y0>=H-1) return NaN; const k=(y0*W+x0)*4+c;
    return (d[k]*(1-fx)+d[k+4]*fx)*(1-fy)+(d[k+W*4]*(1-fx)+d[k+W*4+4]*fx)*fy; };
  const cx=W/2, cy=H/2, R=Math.hypot(cx,cy); const pts=[];
  for(let y=4;y<H-4;y+=2) for(let x=4;x<W-4;x+=2){ const rx=x-cx, ry=y-cy, r=Math.hypot(rx,ry); if(r<0.35*R) continue; const ux=rx/r, uy=ry/r;
    const g=ch(1,x+ux*1.5,y+uy*1.5)-ch(1,x-ux*1.5,y-uy*1.5); if(Math.abs(g)>28) pts.push([x,y,ux,uy,g]); }
  for(let i=pts.length-1;i>0&&pts.length>40000;i--){ const j=(Math.random()*(i+1))|0; [pts[i],pts[j]]=[pts[j],pts[i]]; } pts.length=Math.min(pts.length,40000);
  if(pts.length<300) return {r:0,b:0,n:pts.length};
  const best=c=>{ let bk=0,bs=-1; for(let k=-0.004;k<=0.00401;k+=0.0002){ let sxy=0,sxx=0,syy=0; for(const [x,y,ux,uy,g] of pts){ const px=cx+(x-cx)*(1+k), py=cy+(y-cy)*(1+k); const a=ch(c,px+ux*1.5,py+uy*1.5)-ch(c,px-ux*1.5,py-uy*1.5); if(a!==a) continue; sxy+=a*g; sxx+=a*a; syy+=g*g; }
      const s=sxy/Math.sqrt(sxx*syy+1e-9); if(s>bs){ bs=s; bk=k; } } return bk; };
  return {r:+(best(0)*1000).toFixed(2),b:+(best(2)*1000).toFixed(2),n:pts.length}; }
// Auto vignetting: robust radial falloff fit L(r)=L0(1-v r^2) on low-texture pixels
function estimateVig(D){ const W=D.w,H=D.h,d=D.data,cx=W/2,cy=H/2,R=Math.hypot(cx,cy); const bins=Array.from({length:10},()=>[]);
  for(let y=1;y<H-1;y+=3) for(let x=1;x<W-1;x+=3){ const k=(y*W+x)*4; const L=lin((0.2126*d[k]+0.7152*d[k+1]+0.0722*d[k+2])/255); const k2=k+4; const g=Math.abs(d[k+1]-d[k2+1])+Math.abs(d[k+1]-d[k+W*4+1]); if(g>6||L<0.02||L>0.95) continue;
    const r=Math.hypot(x-cx,y-cy)/R; bins[Math.min(9,(r*10)|0)].push(L); }
  const med=a=>{ if(a.length<30) return NaN; a.sort((p,q)=>p-q); return a[a.length>>1]; }; const m=bins.map(med); const c0=m[0]===m[0]?m[0]:m[1]; let num=0,den=0;
  let prev=c0, mono=true; m.forEach((v,i)=>{ if(v!==v||i<2) return; if(v>prev*1.03) mono=false; prev=v; const r=(i+0.5)/10, q=1-v/c0; num+=q*r*r; den+=r**4; }); const v=den?num/den:0; return mono&&v<0.5?Math.max(0,Math.min(0.45,v)):0; }
window.dxoEstimate={estimateCA,estimateVig,estimateAir,detectFaces};

addEventListener('DOMContentLoaded',()=>{
const S_=()=>S; const sec=(t,after)=>{ const b=section(t,false); if(after){ const ref=[...$$('#sections details.sec')].find(d=>d.firstChild.textContent.startsWith(after)); if(ref) ref.after(b.parentNode); } return b; };
const ck=(parent,label,get,set,hist)=>{ const l=document.createElement('label'); l.className='ckrow'; l.innerHTML=`<input type="checkbox"> ${label}`; const i=l.firstChild; i.onchange=()=>{ set(S,i.checked); schedule(true); commit(hist||label); }; parent.appendChild(l); syncers.push(()=>i.checked=!!get(S)); return i; };
const row=(p,html)=>{ const r=document.createElement('div'); r.className='row'; r.innerHTML=html; p.appendChild(r); return r; };

/* Smart Lighting / ClearView / contrast */
const sl=sec('Smart Lighting & ClearView','Basic'); sl.id='slSec';
sub(sl,'DxO Smart Lighting');
slider(sl,'Smart Lighting',s=>s.sl,(s,v)=>{ s.sl=v; if(v>0&&s.slFace!==false&&!s.faces&&!faceBusy) runFaces(); },0,100,1,null,'Smart Lighting');
ck(sl,'Face-aware (spot weighted)',s=>s.slFace!==false,(s,v)=>{ s.slFace=v; if(v&&!s.faces) runFaces(); },'Smart Lighting face-aware');
const fst=document.createElement('div'); fst.className='hint'; fst.id='faceStatus'; sl.appendChild(fst);
row(sl,'<button class="btn" id="slAuto">Auto (Smart Lighting + ClearView)</button>');
sub(sl,'ClearView Plus (haze removal)');
slider(sl,'ClearView Plus',s=>s.cv,(s,v)=>{ s.cv=v; if(v>0&&!s.air&&window.srcHi) s.air=estimateAir(window.srcHi); },0,100,1,null,'ClearView Plus');
sub(sl,'Contrast');
slider(sl,'Microcontrast',s=>s.mc,(s,v)=>s.mc=v,-100,100,1,null,'Microcontrast');
slider(sl,'Fine contrast',s=>s.fc,(s,v)=>s.fc=v,-100,100,1,null,'Fine contrast');
let faceBusy=false;
async function runFaces(){ if(faceBusy||!S) return; faceBusy=true; const id=cur; $('#faceStatus').textContent='Detecting faces…';
  try{ const f=await detectFaces(); if(cur===id&&S){ S.faces=f; curPhoto().settings=S; savePhoto&&savePhoto(curPhoto()); schedule(true); }
    $('#faceStatus').textContent=faceFail?'Face detector unavailable: uniform Smart Lighting':f.length?`${f.length} face(s) found (${window.__faceMs} ms): exposure weighted on faces`:'No faces found: uniform mode'; }
  catch(e){ console.error(e); $('#faceStatus').textContent='Face detection failed: uniform mode'; } faceBusy=false; }
window.runFaces=runFaces;
$('#slAuto').onclick=()=>{ if(!S) return; const D=window.srcHi; let dark=0.4, haze=0;
  if(D){ let s=0,n=0,dcs=0; for(let i=0;i<D.data.length;i+=16){ s+=lin((0.2126*D.data[i]+0.7152*D.data[i+1]+0.0722*D.data[i+2])/255); dcs+=Math.min(D.data[i],D.data[i+1],D.data[i+2])/255; n++; } dark=s/n; haze=dcs/n; }
  S.sl=Math.round(Math.max(15,Math.min(70,40+(0.18-dark)*150))); S.cv=haze>0.35?Math.round(Math.min(60,(haze-0.25)*120)):0; if(S.cv&&D) S.air=estimateAir(D);
  if(S.slFace!==false&&!S.faces) runFaces(); syncUI(); schedule(true); commit('Auto Smart Lighting'); };

/* Colour wheel */
const cw=sec('Colour Wheel','Colour Mixer');
const C=k=>[s=>s.cw[k],(s,v)=>{ s.cw[k]=v; if(k!=='h'&&k!=='range'&&k!=='fall') s.cw.on=true; }];
ck(cw,'Enable colour wheel',s=>s.cw.on,(s,v)=>s.cw.on=v,'Colour wheel on/off');
const wc=document.createElement('canvas'); wc.width=wc.height=150; wc.className='cwheel'; cw.appendChild(wc); const wg=wc.getContext('2d');
function drawWheel(){ const s=S||defaults(); const c=s.cw; wg.clearRect(0,0,150,150); for(let a=0;a<360;a+=2){ wg.beginPath(); wg.moveTo(75,75); wg.arc(75,75,70,(a-91)*Math.PI/180,(a-88)*Math.PI/180); wg.fillStyle=`hsl(${a},90%,50%)`; wg.fill(); }
  wg.beginPath(); wg.arc(75,75,34,0,7); wg.fillStyle='#1b1b1b'; wg.fill();
  const seg=(a0,a1,r,col,w)=>{ wg.beginPath(); wg.arc(75,75,r,(a0-90)*Math.PI/180,(a1-90)*Math.PI/180); wg.strokeStyle=col; wg.lineWidth=w; wg.stroke(); };
  seg(c.h-c.range-c.fall,c.h+c.range+c.fall,52,'rgba(255,255,255,.35)',30); seg(c.h-c.range,c.h+c.range,52,'rgba(255,255,255,.85)',30);
  const t=c.h+c.dh; const q=[75+Math.sin(t*Math.PI/180)*52,75-Math.cos(t*Math.PI/180)*52]; wg.beginPath(); wg.arc(q[0],q[1],6,0,7); wg.fillStyle=`hsl(${t},90%,50%)`; wg.fill(); wg.strokeStyle='#fff'; wg.lineWidth=2; wg.stroke(); }
syncers.push(drawWheel);
let wdrag=false; const wpick=e=>{ const r=wc.getBoundingClientRect(); const x=e.clientX-r.left-r.width/2, y=e.clientY-r.top-r.height/2; if(Math.hypot(x,y)<r.width*0.2) return; S.cw.h=Math.round((Math.atan2(x,-y)*180/Math.PI+360)%360); S.cw.on=true; syncUI(); schedule(); };
wc.addEventListener('pointerdown',e=>{ if(!S) return; wdrag=true; wc.setPointerCapture(e.pointerId); wpick(e); }); wc.addEventListener('pointermove',e=>{ if(wdrag) wpick(e); }); wc.addEventListener('pointerup',()=>{ if(wdrag){ wdrag=false; commit('Colour wheel hue'); } });
slider(cw,'Hue (selection)',...C('h'),0,359,1,'linear-gradient(90deg,red,yellow,lime,cyan,blue,magenta,red)','Colour wheel hue');
slider(cw,'Range',...C('range'),2,90,1,null,'Colour wheel range'); slider(cw,'Falloff',...C('fall'),0,90,1,null,'Colour wheel falloff');
slider(cw,'Hue shift',...C('dh'),-180,180,1,null,'Colour wheel shift'); slider(cw,'Saturation',...C('ds'),-100,100,1,null,'Colour wheel saturation'); slider(cw,'Luminance',...C('dl'),-100,100,1,null,'Colour wheel luminance');
row(cw,'<button class="btn" id="cwPick">✚ Pick hue from photo</button>');

/* Control points / lines (U Point) */
const cp=sec('Control Points (U Point)','Masks');
cp.innerHTML='<div class="hint">Click the photo to drop a control point; it adjusts similar colours near it. Control lines apply a colour-selective graduated adjustment.</div>';
row(cp,'<button class="btn" id="cpPt">⊙ Point</button><button class="btn" id="cpEl">⬭ Ellipse</button><button class="btn" id="cpLn">⟋ Line</button><button class="btn" id="cpBr">🖌 Control brush</button><button class="btn" id="cpPr">⛨ Protect</button><button class="btn" id="cpShow">Show selection</button>');
const brRow=row(cp,'<label class="ckrow"><input type="checkbox" id="cpErase"> Erase</label>'); brRow.id='cpBrRow'; let brSize=6; slider(brRow,'Brush size',()=>brSize,(s,v)=>{ brSize=v; },1,30,0.5,null,'Brush size',true);
const lst=document.createElement('div'); lst.id='cpList'; lst.className='plist'; cp.appendChild(lst);
const cpBox=document.createElement('div'); cpBox.id='cpBox'; cp.appendChild(cpBox);
let selCP=null, cpTool=null, showSel=false;
const sc=()=>S&&(S.cps||[]).find(q=>q.id===selCP);
const P=k=>[s=>{ const q=(s.cps||[]).find(q=>q.id===selCP); return q?q[k]:({r:0.12,sel:60,exp:0,con:0,sat:0,warm:0,str:0,ratio:1,angle:0})[k]; },(s,v)=>{ const q=(s.cps||[]).find(q=>q.id===selCP); if(q) q[k]=v; }];
slider(cpBox,'Ellipse ratio',...P('ratio'),0.15,1,0.01,null,'Control point shape'); slider(cpBox,'Angle',...P('angle'),-90,90,1,null,'Control point angle');
slider(cpBox,'Size',...P('r'),0.02,0.6,0.005,null,'Control point size'); slider(cpBox,'Selectivity',...P('sel'),0,100,1,null,'Control point selectivity');
slider(cpBox,'Exposure',...P('exp'),-3,3,0.05,null,'Control point exposure'); slider(cpBox,'Contrast',...P('con'),-100,100,1,null,'Control point contrast');
slider(cpBox,'Saturation',...P('sat'),-100,100,1,null,'Control point saturation'); slider(cpBox,'Warmth',...P('warm'),-100,100,1,null,'Control point warmth'); slider(cpBox,'Structure',...P('str'),-100,100,1,null,'Control point structure');
row(cpBox,'<button class="btn" id="cpDel">Delete point</button>');
function syncCP(){ if(!S) return; const L=S.cps||[]; if(selCP&&!L.find(q=>q.id===selCP)) selCP=null; cpBox.hidden=!selCP;
  lst.innerHTML=L.map((q,i)=>`<div class="pitem${q.id===selCP?' on':''}" data-id="${q.id}">${({line:'⟋ Line',protect:'⛨ Protection',brush:'🖌 Brush'})[q.kind]||((q.ratio||1)<0.98?'⬭ Ellipse':'⊙ Point')} ${i+1}</div>`).join('');
  ['Pt','El','Ln','Br','Pr'].forEach(k=>$('#cp'+k).classList.toggle('on',cpTool===k.toLowerCase())); $('#cpBrRow').hidden=cpTool!=='br'; $('#cpShow').classList.toggle('on',showSel); }
syncers.push(syncCP);
lst.onclick=e=>{ const id=e.target.dataset.id; if(id){ selCP=id; syncUI(); drawPov(); } };
const setCPTool=t=>{ cpTool=cpTool===t?null:t; if(cpTool){ if(window.getPTool&&getPTool()) setPTool(getPTool()); if(typeof tool!=='undefined'&&tool) setTool(tool); } $('#stage').classList.toggle('tooling',!!cpTool); syncCP(); drawPov(); };
window.setCPTool=setCPTool;
$('#cpPt').onclick=()=>setCPTool('pt'); $('#cpLn').onclick=()=>setCPTool('ln'); $('#cpEl').onclick=()=>setCPTool('el'); $('#cpPr').onclick=()=>setCPTool('pr'); $('#cpBr').onclick=()=>setCPTool('br'); $('#cwPick').onclick=()=>setCPTool('cw');
$('#cpShow').onclick=()=>{ showSel=!showSel; syncCP(); drawPov(); };
$('#cpDel').onclick=()=>{ S.cps=S.cps.filter(q=>q.id!==selCP); selCP=null; syncUI(); schedule(true); commit('Delete control point'); drawPov(); };
const ref=t=>{ const D=window.srcHi; if(!D) return [0.5,0.5,0.5]; const x=Math.round(t[0]*(D.w-1)), y=Math.round(t[1]*(D.h-1)); let s=[0,0,0],n=0; for(let j=-2;j<=2;j++) for(let i=-2;i<=2;i++){ const xx=Math.min(D.w-1,Math.max(0,x+i)), yy=Math.min(D.h-1,Math.max(0,y+j)), k=(yy*D.w+xx)*4; s[0]+=D.data[k]; s[1]+=D.data[k+1]; s[2]+=D.data[k+2]; n++; } return s.map(v=>+(v/n/255).toFixed(4)); };
let cdrag=null; const stage=$('#stage');
const hit=(e)=>{ for(const q of (S.cps||[])){ const a=srcToDisp([q.x,q.y]); if(Math.hypot(a[0]-e.clientX,a[1]-e.clientY)<14) return [q,'a']; if(q.kind==='line'){ const b=srcToDisp([q.x1,q.y1]); if(Math.hypot(b[0]-e.clientX,b[1]-e.clientY)<14) return [q,'b']; } } return null; };
stage.addEventListener('pointerdown',e=>{ if(!S||mode!=='develop') return; const h=(cpTool&&cpTool!=='br'&&cpTool!=='cw'||!cpTool&&(S.cps||[]).length&&!getPTool?.())?hit(e):null;
  if(!cpTool&&!h) return; e.stopPropagation(); e.preventDefault(); const t=dispToSrc(e.clientX,e.clientY);
  if(cpTool==='cw'){ const c=ref(t); const mx=Math.max(...c), mn=Math.min(...c), d=mx-mn; let hh=0; if(d>1e-4){ hh=mx===c[0]?((c[1]-c[2])/d)%6:mx===c[1]?(c[2]-c[0])/d+2:(c[0]-c[1])/d+4; hh=(hh*60+360)%360; } S.cw.h=Math.round(hh); S.cw.on=true; setCPTool('cw'); syncUI(); schedule(true); commit('Colour wheel pick'); return; }
  if(cpTool==='br'){ let q=sc(); if(!q||q.kind!=='brush'){ const used=(S.cps||[]).filter(x=>x.kind==='brush').map(x=>x.bch); const ch=[0,1,2,3].find(c=>!used.includes(c)); if(ch==null){ toast('Up to 4 control brushes'); return; }
      q={id:'c'+uid(),kind:'brush',bch:ch,x:+t[0].toFixed(4),y:+t[1].toFixed(4),r:0.1,sel:55,exp:0.4,con:0,sat:0,warm:0,str:0,ref:ref(t),strokes:[]}; S.cps=(S.cps||[]).concat([q]); selCP=q.id; }
    const st={size:brSize,erase:$('#cpErase').checked,pts:[[+t[0].toFixed(4),+t[1].toFixed(4)]]}; q.strokes.push(st); cdrag={q,brush:st}; syncUI(); schedule(); drawPov(); return; }
  if(h){ selCP=h[0].id; cdrag={q:h[0],end:h[1]}; syncUI(); drawPov(); return; }
  const q={id:'c'+uid(),kind:cpTool==='ln'?'line':cpTool==='pr'?'protect':'pt',ratio:cpTool==='el'?0.55:1,angle:0,x:+t[0].toFixed(4),y:+t[1].toFixed(4),x1:+t[0].toFixed(4),y1:+t[1].toFixed(4),r:0.12,sel:60,exp:0,con:0,sat:0,warm:0,str:0,ref:ref(t)};
  S.cps=(S.cps||[]).concat([q]).slice(-8); selCP=q.id; cdrag={q,end:'b',isNew:true}; syncUI(); drawPov(); },true);
stage.addEventListener('pointermove',e=>{ if(!cdrag) return; e.stopPropagation(); const t=dispToSrc(e.clientX,e.clientY); const q=cdrag.q;
  if(cdrag.brush){ const P=cdrag.brush.pts, l=P[P.length-1]; if(Math.hypot(t[0]-l[0],t[1]-l[1])>0.003) P.push([+t[0].toFixed(4),+t[1].toFixed(4)]); schedule(); drawPov(); return; }
  if(cdrag.end==='a'){ const dx=t[0]-q.x, dy=t[1]-q.y; q.x=+t[0].toFixed(4); q.y=+t[1].toFixed(4); if(q.kind==='line'){ q.x1+=dx; q.y1+=dy; } q.ref=ref([q.x,q.y]); } else { q.x1=+t[0].toFixed(4); q.y1=+t[1].toFixed(4); }
  if(q.kind!=='line'&&cdrag.isNew){ q.r=Math.max(0.03,Math.min(0.6,Math.hypot((q.x1-q.x)*photoDims()[0]/photoDims()[1],q.y1-q.y)))||0.12; }
  cdrag.moved=true; schedule(); drawPov(); },true);
stage.addEventListener('pointerup',e=>{ if(!cdrag) return; e.stopPropagation(); const d=cdrag; cdrag=null; const q=d.q;
  if(d.brush){ commit(d.brush.erase?'Control brush erase':'Control brush'); syncUI(); schedule(true); drawPov(); return; }
  if(d.isNew){ if(q.kind==='protect'){ q.exp=0; } if(q.kind!=='line'&&!d.moved) q.r=0.12; if(q.kind==='line'&&Math.hypot(q.x1-q.x,q.y1-q.y)<0.02){ q.x1=q.x; q.y1=Math.min(1,q.y+0.25); } if(q.kind==='pt') q.exp=0.5; commit(q.kind==='protect'?'Add protection point':q.kind==='line'?'Add control line':'Add control point'); }
  else if(d.moved) commit('Move control point'); syncUI(); schedule(true); drawPov(); },true);
const bp=window.drawPov; window.drawPov=function(){ bp(); if(!S||mode!=='develop') return; const g=$('#pov').getContext('2d'); const L=S.cps||[]; if(!L.length&&!showSel) return;
  const r0=$('#gl').getBoundingClientRect();
  if(showSel&&sc()){ const q=sc(); const D=window.srcHi; if(D){ const k=Math.min(1,180/Math.max(D.w,D.h)); const w=Math.round(D.w*k), h=Math.round(D.h*k); const im=new ImageData(w,h); const asp=photoDims()[0]/photoDims()[1]; const sig=0.9+(0.07-0.9)*q.sel/100;
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const u=x/w, v=y/h, sk=(Math.round(v*(D.h-1))*D.w+Math.round(u*(D.w-1)))*4; const sp=[D.data[sk]/255,D.data[sk+1]/255,D.data[sk+2]/255];
        let ws; if(q.kind==='brush'){ const B=window.cpBrush(S); const bx=Math.min(B.w-1,u*B.w|0), by=Math.min(B.h-1,v*B.h|0); ws=B.data[(by*B.w+bx)*4+q.bch]/255; } else if(q.kind!=='line'){ let dx=(u-q.x)*asp, dy=v-q.y; const an=(q.angle||0)*Math.PI/180, ca=Math.cos(an), sa=Math.sin(an); const ex=ca*dx+sa*dy, ey=(-sa*dx+ca*dy)*Math.max(0.05,q.ratio||1); const rr=Math.hypot(ex,ey)/q.r; ws=1-sstep(0.35,1,rr); } else { const ax=q.x*asp, ay=q.y, bx=q.x1*asp-ax, by=q.y1-ay; const t=((u*asp-ax)*bx+(v-ay)*by)/Math.max(bx*bx+by*by,1e-6); ws=1-sstep(0,1,t); }
        const dv=[sp[0]-q.ref[0],sp[1]-q.ref[1],sp[2]-q.ref[2]]; const lu=c=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; const cd=Math.sqrt(dv[0]*dv[0]*1.1+dv[1]*dv[1]*1.3+dv[2]*dv[2]*0.8)+Math.abs(lu(sp)-lu(q.ref))*0.6;
        const m=ws*Math.exp(-cd*cd/(sig*sig)); const o=(y*w+x)*4; im.data[o]=255; im.data[o+1]=40; im.data[o+2]=60; im.data[o+3]=m*170; }
      const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').putImageData(im,0,0); g.save(); g.imageSmoothingEnabled=true;
      const a=srcToDisp([0,0]), b=srcToDisp([1,1]); g.drawImage(c,a[0],a[1],b[0]-a[0],b[1]-a[1]); g.restore(); } }
  for(const q of L){ const a=srcToDisp([q.x,q.y]); const on=q.id===selCP; g.lineWidth=on?2.5:1.5; g.strokeStyle=on?'#ffd23f':'#fff';
    if(q.kind==='line'){ const b=srcToDisp([q.x1,q.y1]); const dx=b[0]-a[0], dy=b[1]-a[1], l=Math.hypot(dx,dy)||1, nx=-dy/l*400, ny=dx/l*400;
      [[a,1],[b,0.5]].forEach(([p,al])=>{ g.globalAlpha=al; g.beginPath(); g.moveTo(p[0]-nx,p[1]-ny); g.lineTo(p[0]+nx,p[1]+ny); g.stroke(); }); g.globalAlpha=1; g.setLineDash([4,4]); g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(b[0],b[1],5,0,7); g.stroke(); }
    else if(q.kind==='brush'){ if(on){ const [Wp,Hp]=photoDims(); g.save(); g.lineCap=g.lineJoin='round'; for(const st of q.strokes||[]){ const r=Math.abs(srcToDisp([st.size/100*Math.max(Wp,Hp)/Wp*0.25,0])[0]-srcToDisp([0,0])[0]); g.lineWidth=2*r; g.strokeStyle=st.erase?'rgba(255,80,80,.25)':'rgba(120,200,255,.25)'; g.beginPath(); st.pts.forEach((p2,j)=>{ const d=srcToDisp(p2); j?g.lineTo(d[0],d[1]):g.moveTo(d[0],d[1]); }); if(st.pts.length===1){ const d=srcToDisp(st.pts[0]); g.lineTo(d[0]+0.1,d[1]); } g.stroke(); } g.restore(); } }
    else if(on||q.kind==='protect'){ const rx=Math.abs(srcToDisp([q.x+q.r*photoDims()[1]/photoDims()[0],q.y])[0]-a[0]); const ry=rx/Math.max(0.05,q.ratio||1); if(q.kind==='protect') g.strokeStyle=on?'#ff6b6b':'rgba(255,107,107,.8)'; g.setLineDash([5,5]); g.beginPath(); g.ellipse(a[0],a[1],rx,ry,(q.angle||0)*Math.PI/180,0,7); g.stroke(); g.setLineDash([]); }
    g.beginPath(); g.arc(a[0],a[1],8,0,7); g.fillStyle=`rgb(${q.ref.map(v=>v*255|0)})`; g.fill(); g.stroke(); } };

/* Film emulation */
const fm=sec('Film Emulation (FilmPack)','Colour Grading');
const fsel=document.createElement('select'); fsel.id='filmSel'; fsel.innerHTML='<option value="none">None</option>'+Object.keys(FILMS).map(n=>`<option>${n}</option>`).join(''); fm.appendChild(fsel);
fsel.onchange=()=>{ S.film=fsel.value; schedule(true); commit('Film: '+fsel.value); };
syncers.push(()=>fsel.value=S.film||'none');
slider(fm,'Intensity',s=>s.filmAmt,(s,v)=>s.filmAmt=v,0,100,1,null,'Film intensity');
row(fm,'<button class="btn" id="filmGrain">Add matching film grain</button>');
$('#filmGrain').onclick=()=>{ const F=FILMS[S.film]; if(!F) return; [S.grainAmount,S.grainSize]=F.grain||[15,20]; S.grainRough=50; syncUI(); schedule(true); commit('Film grain'); };

/* Optics: auto CA, fringing, lens softness, auto vignetting */
const lens=[...$$('#sections details.sec')].find(d=>d.firstChild.textContent.startsWith('Lens')); const lb=lens?lens.lastChild:sec('Lens Corrections');
const ob=document.createElement('div'); lb.prepend(ob);
sub(ob,'Optical corrections (auto)'); row(ob,'<button class="btn" id="optAuto">✦ Auto optics (CA + vignetting)</button>'); const ost=document.createElement('div'); ost.className='hint'; ost.id='optStatus'; ob.appendChild(ost);
slider(ob,'CA red/cyan',s=>s.caR,(s,v)=>s.caR=v,-4,4,0.05,null,'Chromatic aberration red'); slider(ob,'CA blue/yellow',s=>s.caB,(s,v)=>s.caB=v,-4,4,0.05,null,'Chromatic aberration blue');
slider(ob,'Purple fringing',s=>s.fringe,(s,v)=>s.fringe=v,0,100,1,null,'Purple fringing'); slider(ob,'Lens softness',s=>s.lsoft,(s,v)=>s.lsoft=v,0,100,1,null,'Lens softness');
$('#optAuto').onclick=()=>{ const D=window.srcHi; if(!D||!S) return; const t0=performance.now(); const ca=estimateCA(D), v=estimateVig(D);
  S.caR=ca.r; S.caB=ca.b; S.fringe=Math.max(S.fringe,25); S.lsoft=Math.max(S.lsoft,30); if(v>0.06){ S.lensVig=Math.round(Math.min(100,v/1.6*100*1.1)); S.lensVigMid=17; }
  window.__optAuto={ca,v,ms:Math.round(performance.now()-t0)}; ost.textContent=`CA R ${S.caR}‰, B ${S.caB}‰ from ${ca.n} edge samples; vignetting ${(v*100).toFixed(0)}% at corners${v>0.06?' corrected':' (none)'}; ${window.__optAuto.ms} ms`;
  syncUI(); schedule(true); commit('Auto optics'); };

/* ViewPoint volume deformation */
const vp=sec('ViewPoint (volume deformation)','Lens');
vp.innerHTML='<div class="hint">Restores natural proportions of people/objects stretched at the edges of wide-angle shots.</div>';
const vsel=document.createElement('select'); vsel.id='volMode'; vsel.innerHTML='<option value="diag">Diagonal (all edges)</option><option value="horiz">Horizontal</option><option value="vert">Vertical</option>'; vp.appendChild(vsel);
vsel.onchange=()=>{ S.volMode=vsel.value; schedule(true); commit('Volume mode'); }; syncers.push(()=>vsel.value=S.volMode||'diag');
slider(vp,'Volume correction',s=>s.vol,(s,v)=>s.vol=v,0,100,1,null,'Volume deformation'); slider(vp,'Focal (35mm eq.)',s=>s.volF,(s,v)=>s.volF=v,10,50,1,null,'Volume focal');

const bo=window.onDevelopOpen; window.onDevelopOpen=p=>{ bo&&bo(p); selCP=null; cpTool=null; $('#stage').classList.remove('tooling');
  const e=p.exif||{}; const fl=x=>x==null?0:(typeof x==='number'?x:Array.isArray(x)?x[0]/(x[1]||1):(x.numerator?x.numerator/x.denominator:+x));
  if(S&&S.volF===24&&!S.vol){ const f35=+(e.FocalLength35||0)||fl(e.FocalLength)*1.5; if(f35>5&&f35<60) S.volF=Math.round(f35); }
  ost.textContent=''; fst.textContent=S&&S.faces?`${S.faces.length} face(s) stored`:''; if(S&&S.sl>0&&S.slFace!==false&&!S.faces) setTimeout(runFaces,300); };
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&cpTool) setCPTool(cpTool); });
addSectionResets();
});
