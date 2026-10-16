'use strict';
/* Lightroom-style additions: Lens Blur (depth bokeh), Point Color, Calibration, Adaptive presets (AI masks), Auto+ (auto WB + tone),
   Sync / Auto Sync, Quick Develop, Survey & Compare, Reference view, Smart collections (rule builder), Map view (Leaflet, GPS EXIF),
   histogram drag-to-adjust, parametric tone curve, Profile browser, renameable history steps, Remove: detect people & objects. */
// Calibration: rotate/saturate each primary's contribution (Lightroom "Calibration" panel)
window.calMatrix=c=>{ if(!c) return null; const K=['r','g','b']; if(K.every(k=>!(c[k+'h']||0)&&!(c[k+'s']||0))) return null; const cols=[];
  const k3=1/Math.sqrt(3);
  K.forEach((k,i)=>{ let v=[0,0,0]; v[i]=1; const th=(c[k+'h']||0)/100*Math.PI/6; const cs=Math.cos(th), sn=Math.sin(th), t=1-cs; const [x,y,z]=[k3,k3,k3];
    const Rm=[t*x*x+cs,t*x*y-sn*z,t*x*z+sn*y, t*x*y+sn*z,t*y*y+cs,t*y*z-sn*x, t*x*z-sn*y,t*y*z+sn*x,t*z*z+cs];
    v=[Rm[0]*v[0]+Rm[1]*v[1]+Rm[2]*v[2],Rm[3]*v[0]+Rm[4]*v[1]+Rm[5]*v[2],Rm[6]*v[0]+Rm[7]*v[1]+Rm[8]*v[2]]; const m=(v[0]+v[1]+v[2])/3, f=1+(c[k+'s']||0)/100; v=v.map(a=>m+(a-m)*f); cols.push(v); });
  return [cols[0][0],cols[1][0],cols[2][0], cols[0][1],cols[1][1],cols[2][1], cols[0][2],cols[1][2],cols[2][2]].map(v=>+v.toFixed(4)); };
// depth source for Lens Blur
let depK=0; window.lbDepth=()=>{ const c=window.aiMaskFor&&aiMaskFor('depth'); if(!c) return null; if(!c._lbk) c._lbk='d'+(++depK); return {canvas:c,key:c._lbk}; };

addEventListener('DOMContentLoaded',()=>{
const secOf=t=>[...$$('#sections details.sec')].find(d=>d.firstChild.textContent.startsWith(t));
const row=(p,html)=>{ const r=document.createElement('div'); r.className='row'; r.innerHTML=html; p.appendChild(r); return r; };
const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const after=(el,ref)=>{ if(ref) ref.after(el.parentNode); };
const pickOnce=(msg,fn)=>{ toast(msg,2500); $('#stage').classList.add('picking'); const h=e=>{ e.stopPropagation(); e.preventDefault(); $('#stage').removeEventListener('pointerdown',h,true); $('#stage').classList.remove('picking'); fn(e); }; $('#stage').addEventListener('pointerdown',h,true); };

/* ===== Lens Blur ===== */
const lb=section('Lens Blur',false); after(lb,secOf('Effects')||secOf('Film'));
const LBd=()=>({on:true,amt:50,focus:0.8,range:15,shape:'circle',boost:30,cat:50,q:'std'}); const L=()=>S.lb||(S.lb=LBd());
row(lb,'<label class="ckrow"><input type="checkbox" id="lbOn"> Apply Lens Blur</label><button class="btn" id="lbFocus">⌖ Pick focus</button><button class="btn" id="lbAuto">Subject focus</button>');
const lbSt=document.createElement('div'); lbSt.className='hint'; lbSt.id='lbSt'; lb.appendChild(lbSt);
slider(lb,'Blur amount',s=>s.lb?s.lb.amt:50,(s,v)=>{ L().amt=v; },0,100,1,null,'Lens Blur amount');
slider(lb,'Focal range',s=>s.lb?s.lb.range:15,(s,v)=>{ L().range=v; },0,100,1,null,'Lens Blur focal range');
slider(lb,'Bokeh highlights',s=>s.lb?s.lb.boost:30,(s,v)=>{ L().boost=v; },0,100,1,null,'Bokeh highlights');
row(lb,'<select id="lbShape"><option value="circle">Bokeh: Circle</option><option value="hexagon">Bokeh: Hexagon (6 blades)</option><option value="cateye">Bokeh: Cat eye (swirl)</option><option value="ring">Bokeh: Bubble (soap ring)</option></select><select id="lbQ"><option value="std">Quality: Standard</option><option value="high">Quality: High</option></select>');
slider(lb,'Cat-eye strength',s=>s.lb?s.lb.cat:50,(s,v)=>{ L().cat=v; },0,100,1,null,'Cat-eye');
const needDepth=()=>{ if(!lbDepth()){ lbSt.textContent='Estimating depth (Depth-Anything, first time ~30 MB)…'; window.aiMaskFor&&aiMaskFor('depth'); const t=setInterval(()=>{ if(lbDepth()){ clearInterval(t); lbSt.textContent='Depth ready'+(S.lb?` · focus at ${(S.lb.focus*100|0)}% near`:''); schedule(true); } },500); setTimeout(()=>clearInterval(t),180000); } };
$('#lbOn').onchange=e=>{ L().on=e.target.checked; if(e.target.checked) needDepth(); schedule(true); commit('Lens Blur'); };
$('#lbShape').onchange=e=>{ L().shape=e.target.value; schedule(true); commit('Bokeh shape'); }; $('#lbQ').onchange=e=>{ L().q=e.target.value; schedule(true); };
syncers.push(()=>{ $('#lbOn').checked=!!(S.lb&&S.lb.on); $('#lbShape').value=(S.lb&&S.lb.shape)||'circle'; $('#lbQ').value=(S.lb&&S.lb.q)||'std'; });
const depAt=(x,y)=>{ const d=lbDepth(); if(!d) return null; const c=d.canvas, g=c.getContext('2d'); const X=Math.max(2,Math.min(c.width-3,x*c.width|0)), Y=Math.max(2,Math.min(c.height-3,y*c.height|0)); const im=g.getImageData(X-2,Y-2,5,5).data; let s=0; for(let i=3;i<im.length;i+=4) s+=im[i]; return s/25/255; };
const setFocus=(x,y)=>{ const v=depAt(x,y); if(v==null){ needDepth(); return false; } L().on=true; S.lb.focus=+v.toFixed(3); S.lb.fx=+x.toFixed(4); S.lb.fy=+y.toFixed(4); lbSt.textContent=`Focus set (${(v*100|0)}% near)`; syncUI(); schedule(true); commit('Lens Blur focus'); return true; };
$('#lbFocus').onclick=()=>{ needDepth(); pickOnce('Tap the point that should stay sharp',e=>{ const t=dispToSrc(e.clientX,e.clientY); setFocus(t[0],t[1]); }); };
const ftried=new Set(); const autoFocus=()=>{ const f=(S.faces||[])[0]; if(f) return setFocus(f.x,f.y); if(!ftried.has(cur)&&window.dxoEstimate){ ftried.add(cur); dxoEstimate.detectFaces().then(fs=>{ if(fs&&fs.length){ S.faces=fs; autoFocus(); } }).catch(()=>{}); } const d=lbDepth(); if(!d) return needDepth(),false; // nearest large region around centre
  let best=0,bx=0.5,by=0.5; for(let y=0.3;y<=0.75;y+=0.05) for(let x=0.3;x<=0.7;x+=0.05){ const v=depAt(x,y); if(v>best){ best=v; bx=x; by=y; } } return setFocus(bx,by); };
$('#lbAuto').onclick=()=>{ if(!autoFocus()){ const t=setInterval(()=>{ if(lbDepth()){ clearInterval(t); autoFocus(); } },500); } };
window.lensBlurAutoFocus=autoFocus;
// export: make sure the depth map exists for other photos
const pe=window.prepareExportPhoto; window.prepareExportPhoto=async(p,s)=>pe(p,s&&s.lb&&s.lb.on?{...s,masks:[...(s.masks||[]),{type:'depth'}]}:s);
// extra tile margin for big blur radii during export
const rt=window.renderTiled; if(rt){ /* srcBox margin handled by blur radius cap: 2.2% of width */ }

/* ===== Point Color ===== */
const pc=section('Point Color',false); after(pc,secOf('Colour Mixer'));
row(pc,'<button class="btn" id="pcAdd">＋ Pick colour</button><span class="hint">Tap a colour in the photo, then shift it</span>');
const pcl=document.createElement('div'); pcl.className='plist'; pcl.id='pcList'; pc.appendChild(pcl); let pcSel=0;
const P=()=>S&&S.pcol&&S.pcol[pcSel];
const pbox=document.createElement('div'); pbox.id='pcBox'; pc.appendChild(pbox);
slider(pbox,'Hue shift',s=>P()?P().dh:0,(s,v)=>{ if(P()) P().dh=v; },-180,180,1,null,'Point Color hue');
slider(pbox,'Saturation',s=>P()?P().ds:0,(s,v)=>{ if(P()) P().ds=v; },-100,100,1,null,'Point Color saturation');
slider(pbox,'Luminance',s=>P()?P().dl:0,(s,v)=>{ if(P()) P().dl=v; },-100,100,1,null,'Point Color luminance');
slider(pbox,'Range',s=>P()?(P().range??50):50,(s,v)=>{ if(P()) P().range=v; },5,100,1,null,'Point Color range');
const hsv=(r,g,b)=>{ const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn; let h=0; if(d){ if(mx===r) h=((g-b)/d)%6; else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h/=6; if(h<0) h+=1; } return [h,mx?d/mx:0,mx]; };
function renderPC(){ const a=(S&&S.pcol)||[]; pcSel=Math.min(pcSel,Math.max(0,a.length-1)); pcl.innerHTML=a.map((q,i)=>`<button data-i="${i}" class="${i===pcSel?'cur':''}"><span><i style="display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:middle;background:hsl(${q.h*360},${q.s*100}%,${q.v*50}%)"></i> Colour ${i+1} ${q.dh||q.ds||q.dl?'·':''}</span><span class="x" data-del="${i}">✕</span></button>`).join(''); pbox.hidden=!a.length; }
syncers.push(renderPC);
pcl.onclick=e=>{ const d=e.target.dataset.del; if(d!==undefined){ S.pcol.splice(+d,1); renderPC(); schedule(true); commit('Remove Point Color'); return; } const b=e.target.closest('[data-i]'); if(b){ pcSel=+b.dataset.i; syncUI(); } };
$('#pcAdd').onclick=()=>{ if(!S) return; if((S.pcol||[]).length>=4) return toast('Up to 4 point colours'); pickOnce('Tap the colour to adjust',e=>{ const gl=$('#gl'), r=gl.getBoundingClientRect(); const c=document.createElement('canvas'); c.width=gl.width; c.height=gl.height; const g=c.getContext('2d'); g.drawImage(gl,0,0);
  const x=(e.clientX-r.left)/r.width*gl.width|0, y=(e.clientY-r.top)/r.height*gl.height|0; const d=g.getImageData(Math.max(0,x-2),Math.max(0,y-2),5,5).data; let R=0,G=0,B=0; for(let i=0;i<d.length;i+=4){ R+=d[i]; G+=d[i+1]; B+=d[i+2]; } const n=d.length/4;
  const [h,s,v]=hsv(R/n/255,G/n/255,B/n/255); if(s<0.06) return toast('That colour is almost grey: pick a more saturated one');
  S.pcol=[...(S.pcol||[]),{h:+h.toFixed(4),s:+s.toFixed(3),v:+v.toFixed(3),dh:0,ds:0,dl:0,range:50}]; pcSel=S.pcol.length-1; syncUI(); schedule(true); commit('Add Point Color'); }); };
window.addPointColor=(h,s,v,adj)=>{ S.pcol=[...(S.pcol||[]),{h,s,v,dh:0,ds:0,dl:0,range:50,...adj}]; pcSel=S.pcol.length-1; syncUI(); schedule(true); commit('Add Point Color'); };

/* ===== Calibration ===== */
const cal=section('Calibration',false); after(cal,secOf('Colour Rendering')||secOf('Colour Grading'));
const C=()=>S.cal||(S.cal={});
for(const [k,n] of [['r','Red'],['g','Green'],['b','Blue']]){ sub(cal,n+' primary'); slider(cal,'Hue',s=>s.cal?(s.cal[k+'h']||0):0,(s,v)=>{ C()[k+'h']=v; },-100,100,1,null,n+' primary hue'); slider(cal,'Saturation',s=>s.cal?(s.cal[k+'s']||0):0,(s,v)=>{ C()[k+'s']=v; },-100,100,1,null,n+' primary saturation'); }

/* ===== Parametric tone curve ===== */
const tc=secOf('Tone Curve'); if(tc){ const b=tc.lastChild; const d=document.createElement('div'); b.appendChild(d); sub(d,'Parametric curve');
  const PC=()=>S.pcurve||(S.pcurve={hl:0,lt:0,dk:0,sh:0,s1:25,s2:50,s3:75});
  const build=()=>{ const q=PC(); const a=q.s1/100,b2=q.s2/100,c=q.s3/100; const k=0.0016; const pts=[[0,0],[a/2,a/2+q.sh*k*0.8*(a)],[ (a+b2)/2,(a+b2)/2+q.dk*k*((b2-a)+0.1)],[(b2+c)/2,(b2+c)/2+q.lt*k*((c-b2)+0.1)],[(c+1)/2,(c+1)/2+q.hl*k*0.8*(1-c)],[1,1]];
    S.curve.m=pts.map(([x,y])=>[+x.toFixed(4),+Math.max(0,Math.min(1,y)).toFixed(4)]); if(typeof drawCurve==='function') drawCurve(); };
  for(const [k,n,lo,hi] of [['hl','Highlights',-100,100],['lt','Lights',-100,100],['dk','Darks',-100,100],['sh','Shadows',-100,100],['s1','Split: shadows/darks',5,45],['s2','Split: darks/lights',30,70],['s3','Split: lights/highlights',55,95]])
    slider(d,n,s=>s.pcurve?s.pcurve[k]:({s1:25,s2:50,s3:75}[k]||0),(s,v)=>{ PC()[k]=v; build(); },lo,hi,1,null,'Parametric curve '+n); }

/* ===== Profile browser ===== */
async function previewGrid(title,items,apply){ if(!S||!engine.state) return;
  dlg(`<h3>${title}</h3><div class="pgrid" id="pgrid">${items.map((p,i)=>`<button class="pcell" data-i="${i}"><canvas></canvas><span>${esc(p.n)}<small>${esc(p.g||'')}</small></span></button>`).join('')}</div><div class="btns"><button class="btn" onclick="closeDlg()">Close</button></div>`);
  const st=engine.state; const os=Engine.outSize(st,S); const k=Math.min(1,150/Math.max(os.w,os.h)); const w=Math.max(1,Math.round(os.w*k)), h=Math.max(1,Math.round(os.h*k)); const cells=[...$$('#pgrid .pcell')]; const t0=performance.now();
  for(let i=0;i<items.length;i++){ if($('#modal').hidden) break; const s2=fillDefaults(Object.assign(clone(S),items[i].s)); engine.process(st,s2); const px=engine.readOut(st,s2,w,h,{}); const c=cells[i].querySelector('canvas'); c.width=w; c.height=h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer),w,h),0,0); if(i%4===3) await new Promise(r=>setTimeout(r,0)); }
  window.__gridMs=Math.round(performance.now()-t0); schedule(true); $('#pgrid').onclick=e=>{ const b=e.target.closest('.pcell'); if(!b) return; closeDlg(); apply(items[+b.dataset.i]); }; }
window.previewGrid=previewGrid;
const pbB=document.createElement('button'); pbB.className='btn'; pbB.id='profBrowse'; pbB.textContent='▦ Profile browser'; const basic=secOf('Basic'); if(basic){ const r=document.createElement('div'); r.className='row'; r.appendChild(pbB); basic.lastChild.prepend(r); }
pbB.onclick=()=>{ const it=[]; const raw=curPhoto()&&curPhoto().raw; if(raw) for(const v of ['standard','vivid','flat']) it.push({n:'RAW '+v,g:'Adobe-style base',s:{rawProfile:v,rend:'none',film:'none'}});
  for(const k of Object.keys(window.RENDERS||{})) it.push({n:k,g:'Camera matching',s:{rend:k,rendAmt:100,film:'none'}});
  for(const k of Object.keys(window.FILMS||{})) it.push({n:k,g:k.includes('B&W')?'B&W':'Artistic / film',s:{film:k,filmAmt:100,rend:'none'}});
  previewGrid('Profile browser',it,p=>{ Object.assign(S,p.s); syncUI(); schedule(true); commit('Profile: '+p.n); }); };

/* ===== Adaptive presets (AI masks) ===== */
const AP=[['Sky: Blue drama','sky',{exposure:-0.35,saturation:25,temp:-12,contrast:15,clarity:10}],['Sky: Golden sunset','sky',{exposure:-0.2,temp:35,tint:8,saturation:20}],
  ['Subject: Pop','subject',{exposure:0.25,contrast:15,clarity:20,saturation:10}],['Subject: Darken background','subject',{exposure:-0.7,saturation:-15},true],
  ['Portrait: Smooth skin','faceskin',{clarity:-45,sharpness:-20}],['Portrait: Brighten face','faceskin',{exposure:0.3,shadows:20}],['Portrait: Enhance eyes','irises',{exposure:0.35,saturation:20,clarity:25}],['Portrait: Hair shine','hair',{clarity:20,highlights:15,saturation:8}],
  ['Background: Lens Blur','__lb',null]];
const prs=secOf('Presets'); if(prs){ const d=document.createElement('div'); prs.lastChild.appendChild(d); sub(d,'Adaptive presets (AI)'); const pl=document.createElement('div'); pl.className='plist'; pl.id='adaptList'; d.appendChild(pl);
  pl.innerHTML=AP.map(([n],i)=>`<button data-a="${i}">✦ ${n}</button>`).join('');
  pl.onclick=e=>{ const b=e.target.closest('[data-a]'); if(!b||!S) return; const [n,k,adj,inv]=AP[+b.dataset.a];
    if(k==='__lb'){ S.lb={...LBd(),amt:45}; syncUI(); needDepth(); $('#lbAuto').click(); commit('Adaptive: '+n); return; }
    addMaskOf(k); const m=S.masks[S.masks.length-1]; Object.assign(m.adj,adj); if(inv) m.invert=true; m.name=n; window.syncMaskUI&&syncMaskUI(); schedule(true); commit('Adaptive preset: '+n); toast('Applied '+n+' (AI mask is computed in the background)',2000); }; }

/* ===== Auto+ (auto white balance + tone, feedback on the rendered image) ===== */
function measure(s){ const st=engine.state; const os=Engine.outSize(st,s); const k=Math.min(1,128/Math.max(os.w,os.h)); const w=Math.max(8,Math.round(os.w*k)), h=Math.max(8,Math.round(os.h*k)); engine.process(st,s); const px=engine.readOut(st,s,w,h,{});
  const lin=v=>{ v/=255; return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4); }; let R=0,G=0,B=0,n=0; const Ls=[];
  for(let i=0;i<px.length;i+=4){ const r=px[i],g=px[i+1],b=px[i+2]; const L=(0.2126*r+0.7152*g+0.0722*b)/255; Ls.push(L); const mx=Math.max(r,g,b), mn=Math.min(r,g,b); if(L<0.12||L>0.92||mx-mn>0.35*mx) continue; const wgt=1-(mx-mn)/mx; R+=lin(r)*wgt; G+=lin(g)*wgt; B+=lin(b)*wgt; n+=wgt; }
  Ls.sort((a,b)=>a-b); const q=p=>Ls[Math.min(Ls.length-1,Math.floor(p*Ls.length))]; return {rb:n?Math.log2((R+1e-4)/(B+1e-4)):0, gm:n?Math.log2((G+1e-4)/Math.sqrt((R+1e-4)*(B+1e-4))):0, med:q(0.5), p995:q(0.995), p005:q(0.005), n}; }
function wbSolve(s){ const f=s2=>{ const m=measure(s2); return [m.rb,m.gm]; }; let lo=f(s);
  for(let it=0;it<4;it++){ const a=clone(s); a.wbTemp=Math.max(-100,Math.min(100,s.wbTemp+8)); const b=clone(s); b.wbTint=Math.max(-100,Math.min(100,s.wbTint+8)); const fa=f(a), fb=f(b);
    const J=[[(fa[0]-lo[0])/8,(fb[0]-lo[0])/8],[(fa[1]-lo[1])/8,(fb[1]-lo[1])/8]]; const det=J[0][0]*J[1][1]-J[0][1]*J[1][0]; if(Math.abs(det)<1e-6) break;
    const dT=(-lo[0]*J[1][1]+lo[1]*J[0][1])/det, dN=(-lo[1]*J[0][0]+lo[0]*J[1][0])/det; const k=0.85; s.wbTemp=Math.round(Math.max(-60,Math.min(60,s.wbTemp+dT*k))); s.wbTint=Math.round(Math.max(-40,Math.min(40,s.wbTint+dN*k))); lo=f(s); if(Math.abs(lo[0])<0.03&&Math.abs(lo[1])<0.03) break; }
  return s; }
window.autoWB=()=>{ if(!S||!engine.state) return null; const s=wbSolve(clone(S)); return [s.wbTemp,s.wbTint]; };
function autoPlus(){ if(!S||!engine.state) return; const t0=performance.now(); const s=clone(S);
  // white balance: Newton steps on (R/B, G/RB) imbalance of near-neutral pixels
  wbSolve(s);
  // tone: exposure to a mid-grey median, then protect highlights / set black point
  for(let it=0;it<3;it++){ const m=measure(s); s.exposure=+Math.max(-3,Math.min(3,s.exposure+Math.log2(0.46/Math.max(m.med,0.02))*0.8)).toFixed(2); }
  let m=measure(s); s.highlights=Math.round(Math.max(-80,Math.min(0,-(m.p995-0.93)*400))); s.shadows=Math.round(Math.max(0,Math.min(45,(0.16-(m.p005+0.05))*220)));
  m=measure(s); s.whites=Math.round(Math.max(-30,Math.min(30,(0.985-m.p995)*150))); s.blacks=Math.round(Math.max(-30,Math.min(10,-(m.p005-0.015)*150))); s.vibrance=Math.max(s.vibrance||0,12);
  m=measure(s); Object.assign(S,{wbTemp:s.wbTemp,wbTint:s.wbTint,exposure:s.exposure,highlights:s.highlights,shadows:s.shadows,whites:s.whites,blacks:s.blacks,vibrance:s.vibrance});
  syncUI(); schedule(true); commit('Auto+'); window.__autoPlus={ms:Math.round(performance.now()-t0),wb:[S.wbTemp,S.wbTint],exp:S.exposure,cast:[+m.rb.toFixed(3),+m.gm.toFixed(3)],median:+m.med.toFixed(3)}; toast(`Auto+: WB ${S.wbTemp}/${S.wbTint}, exposure ${S.exposure}`,1500); }
window.autoPlus=autoPlus; { const ab=$('#autoBtn'); if(ab){ const b=document.createElement('button'); b.className=ab.className; b.id='autoPlusBtn'; b.textContent='Auto+'; b.title='AI-style Auto: white balance + tone measured on the rendered image'; ab.after(b); b.onclick=autoPlus; } }

/* ===== History: rename steps ===== */
document.addEventListener('dblclick',e=>{ const b=e.target.closest('#hlist button'); if(!b) return; const p=curPhoto(); const i=+b.dataset.i; const n=prompt('Name this history step',p.history[i].label); if(n){ p.history[i].label=n; p.history[i].named=true; savePhoto(p,0); renderHistory(); } });
{ const hl=$('#hlist'); if(hl){ const h=document.createElement('div'); h.className='hint'; h.textContent='Double-click a step to rename it'; hl.after(h); } }

/* ===== Histogram drag-to-adjust ===== */
{ const hc=$('#histo'); if(hc){ hc.style.touchAction='none'; hc.style.cursor='ew-resize'; const zones=[[0.12,'blacks','Blacks',100],[0.35,'shadows','Shadows',100],[0.65,'exposure','Exposure',3],[0.88,'highlights','Highlights',100],[1.01,'whites','Whites',100]];
  let d=null; const zone=x=>zones.find(z=>x<z[0]); const tip=document.createElement('div'); tip.id='histTip'; tip.className='histTip'; hc.parentNode.style.position='relative'; hc.after(tip);
  hc.addEventListener('pointermove',e=>{ const r=hc.getBoundingClientRect(); const z=zone((e.clientX-r.left)/r.width); if(d){ const dv=(e.clientX-d.x)/r.width*(z&&d.z[1]==='exposure'?4:200); let v=d.v+dv; v=d.z[1]==='exposure'?+Math.max(-5,Math.min(5,v)).toFixed(2):Math.round(Math.max(-100,Math.min(100,v))); S[d.z[1]]=v; tip.textContent=`${d.z[2]}: ${v}`; syncUI(); schedule(); } else if(z) tip.textContent=z[2]+' (drag ↔)'; });
  hc.addEventListener('pointerdown',e=>{ if(!S) return; const r=hc.getBoundingClientRect(); const z=zone((e.clientX-r.left)/r.width); d={z,x:e.clientX,v:S[z[1]]||0}; hc.setPointerCapture(e.pointerId); e.preventDefault(); });
  const up=()=>{ if(!d) return; const z=d.z; d=null; schedule(true); commit('Histogram: '+z[2]); }; hc.addEventListener('pointerup',up); hc.addEventListener('pointercancel',up); hc.addEventListener('pointerleave',()=>{ if(!d) tip.textContent=''; }); } }

/* ===== Remove: detect people & objects ===== */
let detP=null; const loadDet=()=>detP||(detP=(async()=>{ const v=await import('./mediapipe/vision_bundle.mjs'); const fs=await v.FilesetResolver.forVisionTasks(new URL('mediapipe/wasm',location.href).href);
  return v.ObjectDetector.createFromOptions(fs,{baseOptions:{modelAssetPath:new URL('mediapipe/efficientdet_lite0.tflite',location.href).href,delegate:'CPU'},runningMode:'IMAGE',maxResults:12,scoreThreshold:0.35}); })());
const sp=secOf('Spot Removal'); if(sp){ const b=sp.lastChild; const r=document.createElement('div'); r.innerHTML='<div class="row"><button class="btn" id="detBtn">🔍 Detect people & objects to remove</button></div><div class="plist" id="detList"></div>'; b.prepend(r);
  $('#detBtn').onclick=async()=>{ const D=window.srcHi; if(!D||!S) return; $('#detList').innerHTML='<div class="hint">Detecting…</div>'; try{ const det=await loadDet(); const c=document.createElement('canvas'); c.width=D.w; c.height=D.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(D.data),D.w,D.h),0,0);
      const t0=performance.now(); const r=det.detect(c); const list=(r.detections||[]).map(d=>({n:d.categories[0].categoryName,s:d.categories[0].score,x:d.boundingBox.originX/D.w,y:d.boundingBox.originY/D.h,w:d.boundingBox.width/D.w,h:d.boundingBox.height/D.h})).filter(d=>d.w*d.h<0.5);
      window.__det={ms:Math.round(performance.now()-t0),list}; $('#detList').innerHTML=list.length?list.map((d,i)=>`<button data-d="${i}"><span>${d.n==='person'?'👤':'▣'} ${esc(d.n)} ${Math.round(d.s*100)}%</span><span>Remove</span></button>`).join(''):'<div class="hint">Nothing removable found</div>';
      $('#detList').onclick=e=>{ const bb=e.target.closest('[data-d]'); if(!bb) return; removeBox(list[+bb.dataset.d]); bb.remove(); }; }catch(e){ console.error(e); $('#detList').innerHTML='<div class="hint">Detector unavailable</div>'; } }; }
function removeBox(d){ const [Wp,Hp]=photoDims(); const Lm=Math.max(Wp,Hp); const pad=0.06; const x0=Math.max(0,d.x-d.w*pad), x1=Math.min(1,d.x+d.w*(1+pad)), y0=Math.max(0,d.y-d.h*pad), y1=Math.min(1,d.y+d.h*(1+pad));
  const rpx=Math.max(6,Math.min(Math.min((x1-x0)*Wp,(y1-y0)*Hp)/3,0.075*Lm)); const size=+(rpx/(0.25*Lm)*100).toFixed(2); const pts=[]; const dy=rpx*1.3/Hp, mx=rpx*0.6/Wp; let k=0;
  for(let y=y0+dy*0.5;y<=y1-dy*0.2+1e-9;y+=dy,k++){ const a=[x0+mx,y], b=[x1-mx,y]; pts.push(...(k%2?[b,a]:[a,b])); } if(!pts.length) pts.push([(x0+x1)/2,(y0+y1)/2]);
  S.healStrokes.push({id:'h'+uid(),mode:'remove',size,feather:30,pts:pts.map(p=>[+p[0].toFixed(5),+p[1].toFixed(5)]),off:[0,0],det:d.n}); schedule(true); commit('Remove '+d.n); window.ensureFill&&ensureFill(); }
window.removeBox=removeBox;

/* ===== Reference view ===== */
{ const vt=$('.vtools'); const b=document.createElement('button'); b.className='btn'; b.id='refBtn'; b.textContent='Ref'; b.title='Reference view: compare against another photo'; if(vt) vt.appendChild(b);
  const pane=document.createElement('div'); pane.id='refPane'; pane.hidden=true; pane.innerHTML='<div class="refHead"><select id="refSel"></select><button class="btn" id="refX">✕</button></div><img id="refImg" alt="reference">'; $('#stage').appendChild(pane);
  b.onclick=()=>{ if(!pane.hidden){ pane.hidden=true; b.classList.remove('on'); return; } const opts=photos.filter(p=>p.id!==cur); if(!opts.length) return toast('Import another photo to use as reference');
    $('#refSel').innerHTML=opts.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''); const last=localStorage.getItem('ps.ref'); if(opts.find(p=>p.id===last)) $('#refSel').value=last; show(); pane.hidden=false; b.classList.add('on'); };
  const show=()=>{ const p=photos.find(x=>x.id===$('#refSel').value); if(!p) return; localStorage.setItem('ps.ref',p.id); $('#refImg').src=thumbURL(p); window.__ref=p.name; };
  $('#refSel').onchange=show; $('#refX').onclick=()=>{ pane.hidden=true; b.classList.remove('on'); }; }

/* ===== Library: Sync, Quick Develop, Survey/Compare, Smart collections, Map ===== */
const tb=$('#selAll'); const mk=(id,t,title)=>{ const b=document.createElement('button'); b.className='btn'; b.id=id; b.textContent=t; b.title=title||''; tb.before(b); return b; };
const selected=()=>photos.filter(p=>sel.has(p.id));
// Sync
function syncDlg(){ const src=mode==='develop'?curPhoto():photos.find(p=>p.id===lastSel)||selected()[0]; const targets=selected().filter(p=>p!==src); if(!src||!targets.length) return toast('Select the photos to sync (the active photo is the source)');
  const ks=Object.keys(SEC_KEYS).filter(k=>!['Crop','Mask','Spot'].includes(k));
  dlg(`<h3>Sync settings from “${esc(src.name)}” to ${targets.length} photo(s)</h3><div class="grid2" id="syK">${ks.map(k=>`<label class="chk"><input type="checkbox" value="${k}" ${['Basic','Tone Curve','Colour Mixer','Colour Grading','Detail','Effects','Lens','Colour Rendering','Calibration','Film'].includes(k)?'checked':''}> ${k}</label>`).join('')}<label class="chk"><input type="checkbox" value="Crop"> Crop</label><label class="chk"><input type="checkbox" value="Mask"> Masks</label></div>
   <div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="syGo">Synchronize</button></div>`);
  $('#syGo').onclick=()=>{ const keys=[...$$('#syK input:checked')].flatMap(i=>SEC_KEYS[i.value]); const s0=src.id===cur&&S?S:src.settings; applyKeys(targets,s0,keys,'Sync settings'); closeDlg(); toast(`Synced ${keys.length} settings to ${targets.length} photo(s)`); window.__synced=targets.length; }; }
function applyKeys(targets,s0,keys,label){ for(const p of targets){ const s=p.settings; keys.forEach(k=>{ if(s0[k]!==undefined) s[k]=clone(s0[k]); }); p.history=(p.history||[]).slice(0,(p.hIdx??0)+1); p.history.push({label,s:clone(s)}); p.hIdx=p.history.length-1; p.edited=true; savePhoto(p,0); } if(mode==='library') renderLibrary(); }
mk('syncBtn','Sync…','Sync settings from the active photo to the selection').onclick=syncDlg;
// Auto Sync (develop): mirror each change to the other selected photos
let autoSync=false; { const vt=$('.vtools'); const b=document.createElement('button'); b.className='btn'; b.id='autoSyncBtn'; b.textContent='Auto Sync'; b.title='Apply every change to all selected photos'; if(vt) vt.appendChild(b);
  b.onclick=()=>{ autoSync=!autoSync; b.classList.toggle('on',autoSync); toast(autoSync?`Auto Sync on: changes go to ${Math.max(0,sel.size-1)} other selected photo(s)`:'Auto Sync off',1500); }; }
const cm0=window.commit; window.commit=function(label){ const r=cm0.apply(this,arguments); try{ if(autoSync&&mode==='develop'&&sel.size>1){ const p=curPhoto(); const a=p.history[p.hIdx-1], b=p.history[p.hIdx]; if(a&&b){ const ks=Object.keys(b.s).filter(k=>!GEOM.includes(k)&&!['faces','air'].includes(k)&&JSON.stringify(a.s[k])!==JSON.stringify(b.s[k]));
      if(ks.length){ applyKeys(photos.filter(x=>sel.has(x.id)&&x.id!==cur),b.s,ks,'Auto Sync: '+label); window.__autoSynced=(window.__autoSynced||0)+1; } } } }catch(e){ console.warn(e); } return r; };
// Quick Develop
const QD=[['Exposure','exposure',[-1,-1/3,1/3,1],2],['Contrast','contrast',[-20,-5,5,20]],['Highlights','highlights',[-20,-5,5,20]],['Shadows','shadows',[-20,-5,5,20]],['Whites','whites',[-20,-5,5,20]],['Blacks','blacks',[-20,-5,5,20]],['Clarity','clarity',[-20,-5,5,20]],['Vibrance','vibrance',[-20,-5,5,20]],['Temperature','wbTemp',[-20,-5,5,20]],['Tint','wbTint',[-20,-5,5,20]]];
mk('qdBtn','Quick Develop','Nudge settings on all selected photos').onclick=()=>{ const L2=selected(); if(!L2.length) return toast('Select photos first');
  dlg(`<h3>Quick Develop · ${L2.length} photo(s)</h3><div class="qd">${QD.map(([n,k,st],i)=>`<div class="qdr"><span>${n}</span>${st.map((v,j)=>`<button class="btn" data-q="${i}" data-j="${j}">${['◀◀','◀','▶','▶▶'][j]}</button>`).join('')}</div>`).join('')}</div>
   <div class="row"><select id="qdPre"><option value="">Saved preset…</option>${(typeof userPresets!=='undefined'?userPresets:[]).map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join('')}</select><button class="btn" id="qdReset">Reset all</button></div><div class="hint" id="qdSt">Thumbnails refresh when each photo is next opened.</div><div class="btns"><button class="btn primary" onclick="closeDlg()">Done</button></div>`);
  $('#dlg').querySelector('.qd').onclick=e=>{ const b=e.target.closest('[data-q]'); if(!b) return; const [n,k,st]=QD[+b.dataset.q]; const dv=st[+b.dataset.j];
    for(const p of L2){ const s=p.settings; s[k]=k==='exposure'?+Math.max(-5,Math.min(5,(s[k]||0)+dv)).toFixed(2):Math.max(-100,Math.min(100,Math.round((s[k]||0)+dv))); p.history.push({label:`Quick Develop: ${n} ${dv>0?'+':''}${k==='exposure'?dv.toFixed(2):dv}`,s:clone(s)}); p.hIdx=p.history.length-1; p.edited=true; savePhoto(p,0); }
    $('#qdSt').textContent=`${n}: ${L2.map(p=>p.settings[k]).slice(0,3).join(', ')}${L2.length>3?'…':''}`; window.__qd=L2.map(p=>[p.name,p.settings.exposure,p.settings.contrast]); };
  $('#qdReset').onclick=()=>{ for(const p of L2){ const keep={}; GEOM.forEach(k=>keep[k]=p.settings[k]); p.settings=Object.assign(defaults(),keep); p.history.push({label:'Quick Develop: reset',s:clone(p.settings)}); p.hIdx=p.history.length-1; savePhoto(p,0); } $('#qdSt').textContent='Reset'; };
  $('#qdPre').onchange=e=>{ const u=(typeof userPresets!=='undefined'?userPresets:[])[+e.target.value]; if(!u) return; for(const p of L2){ const keep={}; GEOM.forEach(k=>keep[k]=p.settings[k]); p.settings=fillDefaults(Object.assign(p.settings,clone(u.s),keep)); p.history.push({label:'Preset: '+u.name,s:clone(p.settings)}); p.hIdx=p.history.length-1; p.edited=true; savePhoto(p,0); } $('#qdSt').textContent='Applied '+u.name; }; };
// Survey & Compare
const ov=document.createElement('div'); ov.id='survey'; ov.hidden=true; document.body.appendChild(ov);
const star=p=>`<span class="svR">${[1,2,3,4,5].map(i=>`<b data-r="${i}" class="${p.rating>=i?'on':''}">★</b>`).join('')}</span><span class="svF"><b data-f="1" class="${p.flag===1?'on':''}">⚑</b><b data-f="-1" class="${p.flag===-1?'on':''}">✕</b></span>`;
function survey(){ let L2=selected(); if(L2.length<2) return toast('Select 2 or more photos for Survey'); const draw=()=>{ const n=L2.length, cols=Math.ceil(Math.sqrt(n*innerWidth/innerHeight*0.75));
    ov.innerHTML=`<div class="svHead"><b>Survey · ${n}</b><span class="hint">Click ✕ on a photo to drop it · rate & flag as you go</span><button class="btn" id="svX">Done</button></div><div class="svGrid" style="grid-template-columns:repeat(${Math.min(cols,n)},1fr)">${L2.map(p=>`<div class="svC" data-id="${p.id}"><img src="${thumbURL(p)}"><div class="svBar"><span>${esc(p.name)}</span>${star(p)}<button class="btn" data-drop="1">✕</button></div></div>`).join('')}</div>`;
    ov.hidden=false; $('#svX').onclick=()=>{ ov.hidden=true; renderLibrary(); }; };
  ov.onclick=e=>{ const c=e.target.closest('.svC'); if(!c) return; const p=photos.find(x=>x.id===c.dataset.id); if(e.target.dataset.drop){ L2=L2.filter(x=>x!==p); if(L2.length<1){ ov.hidden=true; return; } return draw(); } rate(p,e)&&draw(); }; draw(); window.__survey=L2.length; }
function rate(p,e){ const r=e.target.dataset.r, f=e.target.dataset.f; if(r){ p.rating=p.rating===+r?0:+r; savePhoto(p,0); return true; } if(f){ p.flag=p.flag===+f?0:+f; savePhoto(p,0); return true; } return false; }
function compare(){ const L2=selected(); if(L2.length<2) return toast('Select 2 or more photos for Compare'); let a=L2[0], ci=1; let z=1;
  const draw=()=>{ const b=L2[ci]; ov.innerHTML=`<div class="svHead"><b>Compare</b><span class="hint">Select (left) vs candidate (right) · zoom is synced</span><button class="btn" id="cmZ">Zoom ${z}×</button><button class="btn" id="cmPrev">◀</button><button class="btn" id="cmNext">▶</button><button class="btn" id="cmSwap">⇄ Make select</button><button class="btn" id="svX">Done</button></div>
    <div class="cmGrid">${[['Select',a],['Candidate',b]].map(([t,p])=>`<div class="svC cmC" data-id="${p.id}"><div class="cmV"><img src="${thumbURL(p)}" style="transform:scale(${z})"></div><div class="svBar"><span>${t}: ${esc(p.name)}</span>${star(p)}</div></div>`).join('')}</div>`; ov.hidden=false;
    $('#svX').onclick=()=>{ ov.hidden=true; renderLibrary(); }; $('#cmNext').onclick=()=>{ do{ ci=(ci+1)%L2.length; }while(L2[ci]===a); draw(); }; $('#cmPrev').onclick=()=>{ do{ ci=(ci-1+L2.length)%L2.length; }while(L2[ci]===a); draw(); };
    $('#cmSwap').onclick=()=>{ const t=a; a=L2[ci]; L2[ci]=t; draw(); }; $('#cmZ').onclick=()=>{ z=z===1?2:z===2?3:1; draw(); }; window.__compare=[a.name,L2[ci].name];
    const vs=[...ov.querySelectorAll('.cmV')]; vs.forEach(v=>v.onscroll=()=>vs.forEach(w=>{ if(w!==v){ w.scrollLeft=v.scrollLeft; w.scrollTop=v.scrollTop; } })); };
  ov.onclick=e=>{ const c=e.target.closest('.svC'); if(!c) return; const p=photos.find(x=>x.id===c.dataset.id); rate(p,e)&&draw(); }; draw(); }
mk('surveyBtn','Survey','Survey view (N)').onclick=survey; mk('compareBtn','Compare','Compare view (C)').onclick=compare;
addEventListener('keydown',e=>{ if(mode!=='library'||e.target.matches('input,textarea,select')||e.metaKey||e.ctrlKey) return; if(e.key==='n'||e.key==='N'){ survey(); } if(e.key==='c'||e.key==='C'){ compare(); } if(e.key==='Escape'&&!ov.hidden){ ov.hidden=true; renderLibrary(); } });
// Smart collection rule builder → smart project
const RF=[['rating','Rating','num'],['iso','ISO','num'],['f','Aperture f/','num'],['focal','Focal length mm','num'],['camera','Camera','txt'],['lens','Lens','txt'],['kw','Keyword','txt'],['date','Date (YYYY-MM-DD)','num'],['flag','Flag (pick/reject/none)','txt'],['edited','Edited (yes/no)','txt'],['raw','RAW (yes/no)','txt'],['orient','Orientation (portrait/landscape)','txt'],['name','File name','txt']];
mk('smartBtn','Smart collection…','Rule-based smart collection').onclick=()=>{ const rowH=()=>`<div class="row scR"><select class="scF">${RF.map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select><select class="scO"><option value=":">contains / is</option><option value=">=">≥</option><option value="<=">≤</option><option value=">">&gt;</option><option value="<">&lt;</option><option value="!=">is not</option></select><input class="scV" placeholder="value"><label class="chk"><input type="checkbox" class="scN"> not</label></div>`;
  dlg(`<h3>New smart collection</h3><div class="f"><label>Name</label><input id="scName" placeholder="Best high-ISO shots"></div><div id="scRows">${rowH()}</div><button class="btn" id="scAdd">＋ Rule</button><div class="hint" id="scPrev"></div><div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="scGo">Create</button></div>`);
  const q=()=>[...$$('.scR')].map(r=>{ const v=r.querySelector('.scV').value.trim(); if(!v) return ''; return (r.querySelector('.scN').checked?'-':'')+r.querySelector('.scF').value+r.querySelector('.scO').value+(/\s/.test(v)?'"'+v+'"':v); }).filter(Boolean).join(' ');
  const pv=()=>{ const s=q(); const n=s?photos.filter(p=>matchPhoto(p,s.toLowerCase())).length:0; $('#scPrev').textContent=s?`Query: ${s} → ${n} photo(s) now`:'Add rules (all must match)'; };
  $('#scAdd').onclick=()=>{ $('#scRows').insertAdjacentHTML('beforeend',rowH()); }; const dd=$('#dlg').firstElementChild.parentNode; $('#scRows').oninput=pv; $('#scRows').onchange=pv; pv();
  $('#scGo').onclick=()=>{ const s=q(), n=$('#scName').value.trim()||s; if(!s) return toast('Add at least one rule'); const pr=getProjects().slice(); pr.push({id:'pr'+uid(),name:n,q:s}); localStorage.setItem('ps.projects',JSON.stringify(pr)); closeDlg(); const fp=$('#fProj'); fp.dispatchEvent(new Event('refresh')); toast(`Smart collection “${n}” created`); window.__smart=[n,s]; renderLibrary(); }; };
// Map view
let leafP=null; const loadLeaf=()=>leafP||(leafP=new Promise((res,rej)=>{ const l=document.createElement('link'); l.rel='stylesheet'; l.href='leaflet/leaflet.css'; document.head.appendChild(l); const s=document.createElement('script'); s.src='leaflet/leaflet.js'; s.onload=()=>res(window.L); s.onerror=rej; document.head.appendChild(s); }));
let mapBounds=null; const mp=window.matchPhoto; window.matchPhoto=(p,q)=>{ if(mapBounds){ const g=p.exif&&p.exif.GPS; if(!g||!mapBounds.contains(g)) return false; } return mp(p,q); };
mk('mapBtn','Map','Map view of geotagged photos').onclick=async()=>{ const geo=photos.filter(p=>p.exif&&p.exif.GPS); dlg(`<h3>Map · ${geo.length} geotagged photo(s)</h3><div id="map" style="height:min(60vh,520px);border-radius:8px"></div><div class="row"><button class="btn" id="mapFilter">Show photos in this area</button><button class="btn" id="mapClear">Clear map filter</button></div><div class="hint">Map data © OpenStreetMap contributors. Photos without GPS EXIF are not shown.</div><div class="btns"><button class="btn primary" onclick="closeDlg()">Close</button></div>`);
  try{ const L=await loadLeaf(); const m=L.map('map',{zoomControl:true}); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(m);
    const icon=L.icon({iconUrl:'leaflet/images/marker-icon.png',iconRetinaUrl:'leaflet/images/marker-icon-2x.png',shadowUrl:'leaflet/images/marker-shadow.png',iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34]});
    const ms=geo.map(p=>L.marker(p.exif.GPS,{icon}).addTo(m).bindPopup(`<img src="${thumbURL(p)}" style="width:160px;border-radius:4px"><br>${esc(p.name)}`));
    if(geo.length) m.fitBounds(L.latLngBounds(geo.map(p=>p.exif.GPS)).pad(0.3),{maxZoom:12}); else m.setView([51.5,-0.12],3); window.__map={markers:ms.length};
    $('#mapFilter').onclick=()=>{ mapBounds=m.getBounds(); closeDlg(); renderLibrary(); toast(`Map filter: ${filtered().length} photo(s) in view`); }; $('#mapClear').onclick=()=>{ mapBounds=null; closeDlg(); renderLibrary(); }; }
  catch(e){ console.error(e); $('#map').textContent='Map library failed to load'; } };
window.setMapFilter=b=>{ mapBounds=b; renderLibrary(); };
});
