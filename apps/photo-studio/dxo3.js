'use strict';
/* DxO round 3: colour rendering profiles + protect saturated colours, HSL curves, Smart Lighting spot-weighted mode,
   lens sharpness (per-profile) + moire, selective graduated filter, dust → editable heal spots, 16-bit PNG/TIFF + TIFF/WebP
   encoders, multi-criteria search + Projects, batch rename, partial presets + preset browser with previews. */
const _M3=(a,b,c,d,e,f,g,h,i)=>[a,b,c,d,e,f,g,h,i];
const satM=(k,[wr,wg,wb]=[0.2126,0.7152,0.0722])=>_M3(wr+(1-wr)*k,wg-wg*k,wb-wb*k, wr-wr*k,wg+(1-wg)*k,wb-wb*k, wr-wr*k,wg-wg*k,wb+(1-wb)*k);
const mul3=(A,B)=>{ const o=[]; for(let r=0;r<3;r++) for(let c=0;c<3;c++) o.push(A[r*3]*B[c]+A[r*3+1]*B[3+c]+A[r*3+2]*B[6+c]); return o; };
window.RENDERS={
  'Generic neutral':{m:satM(0.96),con:0.96},
  'Generic vivid':{m:satM(1.18),con:1.12},
  'Canon-style standard':{m:mul3(_M3(1.04,-0.03,-0.01,-0.015,1.03,-0.015,-0.01,-0.035,1.045),satM(1.08)),con:1.1},
  'Nikon-style standard':{m:mul3(_M3(1.03,-0.02,-0.01,-0.02,1.045,-0.025,-0.005,-0.025,1.03),satM(1.06)),con:1.08},
  'Sony-style standard':{m:mul3(_M3(1.02,-0.005,-0.015,-0.03,1.04,-0.01,0,-0.045,1.045),satM(1.05)),con:1.06},
  'Fujifilm Provia-style':{m:mul3(_M3(1.02,-0.01,-0.01,-0.015,1.035,-0.02,0,-0.02,1.02),satM(1.1)),con:1.12},
  'Fujifilm Velvia-style':{m:mul3(_M3(1.04,-0.03,-0.01,-0.03,1.07,-0.04,-0.01,-0.05,1.06),satM(1.3)),con:1.22},
  'Fujifilm Astia-style':{m:mul3(_M3(1.02,0,-0.02,-0.01,1.02,-0.01,0,-0.01,1.01),satM(1.05)),con:0.95},
  'Fujifilm Classic Chrome-style':{m:mul3(_M3(1.0,0.02,-0.02,-0.01,0.99,0.02,-0.02,0.04,0.98),satM(0.78)),con:1.14},
  'Leica-style':{m:mul3(_M3(1.03,-0.02,-0.01,-0.01,1.0,0.01,-0.02,-0.01,1.03),satM(1.04)),con:1.15},
  'Portrait (soft skin)':{m:mul3(_M3(1.0,0.01,-0.01,0,1.0,0,0,0.01,0.99),satM(0.92)),con:0.92}};
/* HSL curves → 256x2 RGBA LUT (row 0: hue→hue/sat/lum, row 1: lum→sat). Anchors are y values (0.5 = no change). */
const HN=8, LN=6; const flat=a=>!a||a.every(v=>Math.abs(v-0.5)<0.004);
function crP(a,x){ const n=a.length, t=x*n, i=Math.floor(t), f=t-i, g=k=>a[((k%n)+n)%n]; const p0=g(i-1),p1=g(i),p2=g(i+1),p3=g(i+2); return p1+0.5*f*(p2-p0+f*(2*p0-5*p1+4*p2-p3+f*(3*(p1-p2)+p3-p0))); }
function crL(a,x){ const n=a.length-1, t=x*n, i=Math.min(n-1,Math.floor(t)), f=t-i, g=k=>a[Math.max(0,Math.min(n,k))]; const p0=g(i-1),p1=g(i),p2=g(i+1),p3=g(i+2); return p1+0.5*f*(p2-p0+f*(2*p0-5*p1+4*p2-p3+f*(3*(p1-p2)+p3-p0))); }
let hcCache={key:'',v:null};
window.hcData=s=>{ const h=s.hcurve; if(!h||(flat(h.hh)&&flat(h.hs)&&flat(h.hl)&&flat(h.ls))) return null; const key=JSON.stringify(h); if(hcCache.key===key) return hcCache.v;
  const d=new Uint8Array(256*2*4); const C=v=>Math.round(Math.max(0,Math.min(1,v))*255);
  for(let i=0;i<256;i++){ const x=(i+0.5)/256; d[i*4]=C(h.hh?crP(h.hh,x):0.5); d[i*4+1]=C(h.hs?crP(h.hs,x):0.5); d[i*4+2]=C(h.hl?crP(h.hl,x):0.5); d[i*4+3]=255; d[1024+i*4]=C(h.ls?crL(h.ls,i/255):0.5); d[1024+i*4+3]=255; }
  return hcCache={key,v:{w:256,h:2,data:d,key}}, hcCache.v; };
/* Smart Lighting modes */
const fg0=window.faceGains; const lin_=v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
window.faceGains=s=>{ const m=s.slMode||'face'; if(m==='uniform') return []; if(m==='spot'){ const q=s.slSpot; if(!q) return []; return [{x:q.x,y:q.y,w:q.w*1.4,h:q.h*1.4,g:Math.max(-1,Math.min(1.8,Math.log2(0.2/Math.max(lin_(q.L),1e-3))))*(s.sl/100)*0.9}]; } return fg0?fg0(s):[]; };

addEventListener('DOMContentLoaded',()=>{
const secOf=t=>[...$$('#sections details.sec')].find(d=>d.firstChild.textContent.startsWith(t));
const row=(p,html)=>{ const r=document.createElement('div'); r.className='row'; r.innerHTML=html; p.appendChild(r); return r; };
const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const num=x=>x==null?NaN:typeof x==='number'?x:Array.isArray(x)?x[0]/(x[1]||1):x.numerator!=null?x.numerator/x.denominator:+x;

/* ---- Smart Lighting mode + spot ---- */
const sl=$('#slSec'); const ckF=[...sl.querySelectorAll('label.ckrow')].find(l=>l.textContent.includes('Face-aware')); if(ckF) ckF.hidden=true;
const mr=row(sl,'<select id="slMode"><option value="uniform">Mode: Uniform</option><option value="face">Mode: Spot weighted (faces)</option><option value="spot">Mode: Spot weighted (my spot)</option></select><button class="btn" id="slSpotB">◎ Set spot</button>');
(ckF||sl.querySelector('.sl')).after(mr);
const setMode=v=>{ S.slMode=v; S.slFace=v!=='uniform'; if(v==='face'&&!S.faces&&window.runFaces) runFaces(); $('#slSpotB').hidden=v!=='spot'; };
$('#slMode').onchange=e=>{ setMode(e.target.value); schedule(true); commit('Smart Lighting mode'); if(e.target.value==='spot'&&!S.slSpot) pickSpot(); };
syncers.push(()=>{ $('#slMode').value=S.slMode||(S.slFace===false?'uniform':'face'); $('#slSpotB').hidden=$('#slMode').value!=='spot'; });
let spotPick=false; const pickSpot=()=>{ spotPick=true; $('#stage').classList.add('picking'); toast('Tap the area to expose for (e.g. a face)',2500); }; $('#slSpotB').onclick=pickSpot;
$('#stage').addEventListener('pointerdown',e=>{ if(!spotPick||!S) return; e.stopPropagation(); e.preventDefault(); spotPick=false; $('#stage').classList.remove('picking'); const t=dispToSrc(e.clientX,e.clientY); const D=window.srcHi; if(!D) return;
  const w=0.08, h=0.08*D.w/D.h; let s=0,n=0; for(let y=Math.max(0,(t[1]-h)*D.h|0);y<Math.min(D.h,(t[1]+h)*D.h);y+=2) for(let x=Math.max(0,(t[0]-w)*D.w|0);x<Math.min(D.w,(t[0]+w)*D.w);x+=2){ const k=(y*D.w+(x|0))*4; s+=0.2126*D.data[k]+0.7152*D.data[k+1]+0.0722*D.data[k+2]; n++; }
  S.slSpot={x:+t[0].toFixed(4),y:+t[1].toFixed(4),w,h:+h.toFixed(4),L:+(s/Math.max(n,1)/255).toFixed(3)}; S.slMode='spot'; S.slFace=true; if(!S.sl) S.sl=40; syncUI(); schedule(true); commit('Smart Lighting spot'); },true);

/* ---- Lens: sharpness + moire ---- */
const lensSec=secOf('Lens'); const lb=lensSec?lensSec.lastChild:sl; const lx=document.createElement('div'); lb.appendChild(lx);
sub(lx,'Lens sharpness (deconvolution)');
slider(lx,'Lens sharpness',s=>s.lsharp,(s,v)=>s.lsharp=v,0,100,1,null,'Lens sharpness');
slider(lx,'Corner boost',s=>Math.round((s.lshC??0.6)*50),(s,v)=>s.lshC=v/50,0,100,1,null,'Lens sharpness corners');
slider(lx,'Bokeh protection',s=>s.lshB??30,(s,v)=>s.lshB=v,0,100,1,null,'Lens sharpness bokeh');
const lhs=document.createElement('div'); lhs.className='hint'; lhs.id='lshSt'; lx.appendChild(lhs);
sub(lx,'Moiré');
slider(lx,'Moiré removal',s=>s.moire,(s,v)=>s.moire=v,0,100,1,null,'Moiré');
const ap=window.applyLensProfile; if(ap) window.applyLensProfile=async q=>{ const pr=await ap(q); if(pr&&S){ const zoom=/\d+-\d+mm/i.test(pr.name), fixed=/built-in/.test(pr.name), small=pr.camCF>1.9;
  const N=num(curPhoto().exif?.FNumber)||5.6; S.lshC=+((zoom?0.9:0.55)+(small?0.35:0)+(N<2.8?0.25:0)).toFixed(2); S.lsharp=Math.round(25+(zoom?10:0)+(small||fixed?10:0)+(N<2.8?8:N>11?6:0)); S.lshB=N<2.8?45:30;
  $('#lshSt').textContent=`From profile: ${zoom?'zoom':'prime'}${fixed?' (built-in)':''}, f/${N} → sharpness ${S.lsharp}, corners ×${(1+S.lshC).toFixed(1)}`; syncUI(); schedule(true); } return pr; };
const lpB=$('#lensProf'); if(lpB) lpB.onclick=()=>window.applyLensProfile(false);

/* ---- Colour rendering + HSL curves ---- */
const cr=section('Colour Rendering',false); const crd=cr.parentNode; const after=secOf('Colour Mixer')||secOf('Colour Wheel'); if(after) after.after(crd);
sub(cr,'Rendering profile');
row(cr,`<select id="rendSel"><option value="none">None (as shot)</option>${Object.keys(RENDERS).map(k=>`<option>${k}</option>`).join('')}</select>`);
$('#rendSel').onchange=e=>{ S.rend=e.target.value; schedule(true); commit('Colour rendering'); }; syncers.push(()=>$('#rendSel').value=S.rend||'none');
slider(cr,'Rendering intensity',s=>s.rendAmt??100,(s,v)=>s.rendAmt=v,0,100,1,null,'Rendering intensity');
slider(cr,'Protect saturated colours',s=>s.psc,(s,v)=>s.psc=v,0,100,1,null,'Protect saturated colours');
sub(cr,'HSL curves');
const tabs=row(cr,'<div class="tabs" id="hcTabs"><button data-k="hh" class="on">Hue→Hue</button><button data-k="hs">Hue→Sat</button><button data-k="hl">Hue→Lum</button><button data-k="ls">Lum→Sat</button></div>');
const cv=document.createElement('canvas'); cv.id='hcCv'; cv.width=520; cv.height=200; cv.style.cssText='width:100%;height:110px;touch-action:none;border-radius:6px;background:#1b1b1b;display:block;margin:4px 0'; cr.appendChild(cv);
row(cr,'<button class="btn" id="hcReset">Reset curve</button><span class="hint">Drag points up/down</span>');
let hk='hh'; const arr=()=>{ S.hcurve=S.hcurve||{}; return S.hcurve[hk]||(S.hcurve[hk]=new Array(hk==='ls'?LN:HN).fill(0.5)); };
const xs=(i,n)=>hk==='ls'?i/(n-1):(i+0.5)/n;
function drawHC(){ const g=cv.getContext('2d'), W=cv.width, H=cv.height; g.clearRect(0,0,W,H);
  if(hk!=='ls'){ for(let x=0;x<W;x++){ g.fillStyle=`hsl(${x/W*360},70%,45%)`; g.fillRect(x,H-10,1,10); } } else { const gr=g.createLinearGradient(0,0,W,0); gr.addColorStop(0,'#000'); gr.addColorStop(1,'#fff'); g.fillStyle=gr; g.fillRect(0,H-10,W,10); }
  g.strokeStyle='#555'; g.beginPath(); g.moveTo(0,(H-10)/2); g.lineTo(W,(H-10)/2); g.stroke();
  const a=(S&&S.hcurve&&S.hcurve[hk])||new Array(hk==='ls'?LN:HN).fill(0.5); g.strokeStyle='#ddd'; g.lineWidth=2; g.beginPath();
  for(let x=0;x<=W;x+=2){ const v=hk==='ls'?crL(a,x/W):crP(a,x/W-0.5/a.length); const y=(1-v)*(H-10); x?g.lineTo(x,y):g.moveTo(x,y); } g.stroke();
  a.forEach((v,i)=>{ g.fillStyle='#fff'; g.beginPath(); g.arc(xs(i,a.length)*W,(1-v)*(H-10),7,0,7); g.fill(); }); }
syncers.push(drawHC);
$('#hcTabs').onclick=e=>{ const k=e.target.dataset.k; if(!k) return; hk=k; $$('#hcTabs button').forEach(b=>b.classList.toggle('on',b.dataset.k===k)); drawHC(); };
let hd=null; const pos=e=>{ const r=cv.getBoundingClientRect(); return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/(r.height*(cv.height-10)/cv.height)]; };
cv.addEventListener('pointerdown',e=>{ if(!S) return; const [x]=pos(e); const a=arr(); let bi=0,bd=9; a.forEach((v,i)=>{ const d=Math.abs(xs(i,a.length)-x); if(d<bd){ bd=d; bi=i; } }); hd=bi; cv.setPointerCapture(e.pointerId); e.preventDefault(); });
cv.addEventListener('pointermove',e=>{ if(hd==null) return; const [,y]=pos(e); arr()[hd]=+Math.max(0,Math.min(1,1-y)).toFixed(3); drawHC(); schedule(); });
cv.addEventListener('pointerup',()=>{ if(hd==null) return; hd=null; schedule(true); commit('HSL curve'); });
$('#hcReset').onclick=()=>{ if(S&&S.hcurve){ delete S.hcurve[hk]; drawHC(); schedule(true); commit('Reset HSL curve'); } };
window.setHC=(k,a)=>{ S.hcurve=S.hcurve||{}; S.hcurve[k]=a; drawHC(); schedule(true); commit('HSL curve'); };

/* ---- Selective graduated filter ---- */
const mAdd=$('#mlist')&&$('#mlist').parentNode; if(window.addMaskOf&&mAdd){ const r=document.createElement('div'); r.className='row'; r.innerHTML='<button class="btn" id="gradSel">▤ Graduated filter (selective)</button><select id="gradSelK"><option value="hi">protect darks (skies)</option><option value="lo">protect brights</option><option value="col">colour pick later</option></select>'; mAdd.insertBefore(r,mAdd.firstChild.nextSibling);
  $('#gradSel').onclick=()=>{ addMask('linear'); const m=S.masks[S.masks.length-1]; if(!m) return; const k=$('#gradSelK').value; m.parts=m.parts||[];
    const p=Object.assign(newMaskOf(k==='col'?'color':'luma'),{id:'p'+uid(),op:'int',name:k==='col'?'Colour range':'Luminance range'}); if(k==='hi') p.range={lo:45,hi:100,feather:30}; if(k==='lo') p.range={lo:0,hi:55,feather:30};
    m.parts.push(p); m.name='Graduated (selective)'; window.syncMaskUI&&syncMaskUI(); schedule(true); commit('Selective graduated filter'); }; }

/* ---- Dust → editable heal spots with source ---- */
const db=$('#dustBtn'); if(db) db.onclick=()=>{ const D=window.srcHi; if(!D||!S) return; const t0=performance.now(); const spots=findDust(D); S.spots=S.spots||[]; let nS=0, nR=0;
  for(const d of spots){ if(S.spots.length<32&&window.autoSource){ const sp={x:+d.x.toFixed(5),y:+d.y.toFixed(5),sx:d.x,sy:d.y,r:+Math.max(0.004,d.r/D.w*1.5).toFixed(4),feather:50,opacity:100,mode:'heal',dust:1}; autoSource(sp); S.spots.push(sp); nS++; }
    else { const size=Math.max(0.6,Math.min(6,d.r/Math.max(D.w,D.h)*4*100)); S.healStrokes.push({id:'h'+uid(),mode:'remove',size:+size.toFixed(2),feather:40,pts:[[+d.x.toFixed(5),+d.y.toFixed(5)]],off:[0,0],dust:1}); nR++; } }
  $('#dustSt').textContent=spots.length?`${spots.length} dust spot(s) fixed (${Math.round(performance.now()-t0)} ms)${nS?` · ${nS} as heal spots: switch to the Spot tool to drag each source`:''}`:'No dust spots found'; window.__dust=spots;
  if(spots.length){ window.syncSpotUI&&syncSpotUI(); schedule(true); commit('Remove sensor dust'); nR&&window.ensureFill&&ensureFill(); } };

/* ---- Multi-criteria search + Projects ---- */
$('#fSearch').placeholder='Search… e.g. dog iso>800 rating>=3 lens:85 f<2.8 date>=2024-06';
const cmp=(a,op,b)=>op==='>'?a>b:op==='<'?a<b:op==='>='?a>=b:op==='<='?a<=b:op==='!='?a!=b:a==b;
const dateOf=p=>{ const m=String(p.exif?.DateTimeOriginal||p.exif?.DateTime||'').match(/(\d{4}):(\d\d):(\d\d)/); return m?`${m[1]}-${m[2]}-${m[3]}`:new Date(p.added).toISOString().slice(0,10); };
const FIELDS={iso:p=>num(p.exif?.ISO),f:p=>num(p.exif?.FNumber),aperture:p=>num(p.exif?.FNumber),focal:p=>num(p.exif?.FocalLength),mm:p=>num(p.exif?.FocalLength),rating:p=>p.rating,stars:p=>p.rating,
  shutter:p=>num(p.exif?.ExposureTime), mp:p=>p.w*p.h/1e6, width:p=>p.w, height:p=>p.h};
const TXT={camera:p=>[p.exif?.Make,p.exif?.Model].join(' '),cam:p=>[p.exif?.Make,p.exif?.Model].join(' '),lens:p=>p.exif?.LensModel||'',kw:p=>[...(p.keywords||[]),...(p.autoKw||[])].join('|'),tag:p=>[...(p.keywords||[]),...(p.autoKw||[])].join('|'),
  name:p=>p.name,caption:p=>p.caption||'',ext:p=>p.name.split('.').pop(),type:p=>p.name.split('.').pop()};
function parseQ(q){ const out=[], rest=[]; for(let t of (q.match(/-?"[^"]*"|\S+/g)||[])){ let neg=false; if(t[0]==='-'&&t.length>1){ neg=true; t=t.slice(1); } t=t.replace(/"/g,'');
    let m=t.match(/^([a-z]+)(>=|<=|!=|>|<|=|:)(.+)$/i); if(m&&(FIELDS[m[1].toLowerCase()]||TXT[m[1].toLowerCase()]||['date','flag','edited','raw','label','project','year','orient'].includes(m[1].toLowerCase()))){ out.push({k:m[1].toLowerCase(),op:m[2],v:m[3].toLowerCase(),neg}); continue; }
    if(neg) out.push({k:'any',v:t.toLowerCase(),neg}); else rest.push(t); } return {out,rest:rest.join(' ')}; }
function evalC(p,c){ let r; const {k,op,v}=c;
  if(FIELDS[k]){ let x=FIELDS[k](p); let y=parseFloat(v.replace(/^1\//,'')); if(k==='shutter'&&/^1\//.test(v)) y=1/y; r=x===x&&cmp(x,op===':'?'=':op,y); }
  else if(TXT[k]) r=TXT[k](p).toLowerCase().includes(v);
  else if(k==='date'||k==='year'){ const d=dateOf(p).slice(0,k==='year'?4:v.length); r=cmp(d,op===':'?'=':op,v); }
  else if(k==='flag') r=({pick:1,picked:1,reject:-1,rejected:-1,none:0,unflagged:0})[v]===p.flag;
  else if(k==='edited') r=!!p.edited===/^(y|yes|true|1)$/.test(v);
  else if(k==='raw') r=!!p.raw===/^(y|yes|true|1)$/.test(v);
  else if(k==='orient') r=v.startsWith('p')?p.h>p.w:v.startsWith('l')?p.w>p.h:p.w===p.h;
  else if(k==='label') r=String(p.label||'').toLowerCase()===v;
  else if(k==='project'){ const pr=projs.find(x=>x.name.toLowerCase().includes(v)); r=!!pr&&inProj(p,pr); }
  else { const e=p.exif||{}; r=[p.name,p.caption,(p.keywords||[]).join(' '),(p.autoKw||[]).join(' '),e.Make,e.Model,e.LensModel].join(' ').toLowerCase().includes(v); }
  return c.neg?!r:r; }
let projs=JSON.parse(localStorage.getItem('ps.projects')||'[]'); const saveProj=()=>localStorage.setItem('ps.projects',JSON.stringify(projs));
let inSmart=0; const inProj=(p,pr)=>{ if(pr.ids) return pr.ids.includes(p.id); if(inSmart>2) return false; inSmart++; try{ return matchQ(p,pr.q||''); } finally{ inSmart--; } };
const prev=window.matchPhoto; function matchQ(p,q){ const {out,rest}=parseQ(q); if(!out.every(c=>evalC(p,c))) return false; return prev(p,rest.toLowerCase()); }
const fb=$('.filterbar'); const ps=document.createElement('select'); ps.id='fProj'; ps.title='Projects'; fb.insertBefore(ps,$('#fSearch'));
function renderProj(){ const v=ps.value; ps.innerHTML=`<option value="">All projects</option>${projs.map(p=>`<option value="${p.id}">${p.q!=null?'⚲':'▤'} ${esc(p.name)}</option>`).join('')}<option value="__new">+ New project from selection…</option><option value="__smart">+ Smart project from search…</option><option value="__add">→ Add selection to current project</option><option value="__del">✕ Delete current project</option>`; ps.value=projs.find(p=>p.id===v)?v:''; ps.dataset.cur=ps.value; }
ps.onchange=()=>{ const a=ps.value, curP=projs.find(p=>p.id===ps.dataset.cur);
  if(a==='__new'){ const n=prompt('Project name'); if(n){ const p={id:'pr'+uid(),name:n,ids:[...sel]}; projs.push(p); saveProj(); renderProj(); ps.value=p.id; toast(`Project “${n}” created with ${p.ids.length} photo(s)`); } }
  else if(a==='__smart'){ const q=$('#fSearch').value.trim(); const n=q&&prompt('Smart project name (live search: '+q+')'); if(n){ const p={id:'pr'+uid(),name:n,q}; projs.push(p); saveProj(); $('#fSearch').value=''; renderProj(); ps.value=p.id; } else if(!q) toast('Type a search first, e.g. iso>1600 rating>=3'); }
  else if(a==='__add'){ if(curP&&curP.ids){ for(const id of sel) if(!curP.ids.includes(id)) curP.ids.push(id); saveProj(); toast(`Added ${sel.size} photo(s) to “${curP.name}”`); } else toast('Choose a (non-smart) project first'); }
  else if(a==='__del'){ if(curP&&confirm(`Delete project “${curP.name}”? Photos are kept.`)){ projs=projs.filter(p=>p!==curP); saveProj(); } }
  if(a.startsWith('__')) { renderProj(); if(a==='__add'||a==='__del') ps.value=a==='__add'&&curP?curP.id:''; }
  ps.dataset.cur=ps.value; renderLibrary(); };
window.matchPhoto=(p,q)=>{ const pid=ps.value; if(pid&&!pid.startsWith('__')){ const pr=projs.find(x=>x.id===pid); if(pr&&!inProj(p,pr)) return false; } return matchQ(p,q||''); };
window.getProjects=()=>projs; ps.addEventListener('refresh',()=>{ projs=JSON.parse(localStorage.getItem('ps.projects')||'[]'); renderProj(); }); renderProj();

/* ---- Batch rename ---- */
const rb=document.createElement('button'); rb.className='btn'; rb.id='renameBtn'; rb.textContent='Rename…'; $('#selAll').before(rb);
rb.onclick=()=>{ const list=sel.size?photos.filter(p=>sel.has(p.id)):filtered(); if(!list.length) return toast('Nothing selected');
  dlg(`<h3>Batch rename ${list.length} photo(s)</h3><div class="f"><label>Template <small>{name} {seq} {date} {camera} {iso} {lens}</small></label><input id="rnT" value="${esc(localStorage.getItem('ps.rnT')||'{date}_{seq}')}"></div>
   <div class="grid2"><div class="f"><label>Start number</label><input type="number" id="rnS" value="1" min="0"></div><div class="f"><label>Digits</label><input type="number" id="rnD" value="3" min="1" max="6"></div></div>
   <div class="hint" id="rnP"></div><div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="rnGo">Rename</button></div>`);
  const mk=(p,i)=>{ const ext=(p.name.match(/\.[^.]+$/)||[''])[0]; const base=p.name.replace(/\.[^.]+$/,''); const e=p.exif||{};
    return ($('#rnT').value||'{name}').replace(/\{name\}/g,base).replace(/\{seq\}/g,String(+$('#rnS').value+i).padStart(+$('#rnD').value,'0')).replace(/\{date\}/g,dateOf(p)).replace(/\{camera\}/g,String(e.Model||'camera').replace(/\s+/g,'-'))
      .replace(/\{iso\}/g,'ISO'+(num(e.ISO)||'')).replace(/\{lens\}/g,String(e.LensModel||'').replace(/\s+/g,'-')).replace(/[\\/:*?"<>|]/g,'_')+ext; };
  const pv=()=>$('#rnP').innerHTML=list.slice(0,3).map((p,i)=>`${esc(p.name)} → <b>${esc(mk(p,i))}</b>`).join('<br>')+(list.length>3?'<br>…':''); ['#rnT','#rnS','#rnD'].forEach(s=>$(s).oninput=pv); pv();
  $('#rnGo').onclick=()=>{ localStorage.setItem('ps.rnT',$('#rnT').value); list.forEach((p,i)=>{ p.name=mk(p,i); savePhoto(p,0); }); closeDlg(); renderLibrary(); toast(`Renamed ${list.length} photo(s)`); window.__renamed=list.map(p=>p.name); }; };

/* ---- Partial presets + preset browser with previews ---- */
const np=$('#newPreset'); if(np){ const r=np.parentNode; const b1=document.createElement('button'); b1.className='btn'; b1.id='partPreset'; b1.textContent='Save partial…'; const b2=document.createElement('button'); b2.className='btn'; b2.id='presetBrowse'; b2.textContent='▦ Browse with previews'; r.append(b1,b2);
  b1.onclick=()=>{ if(!S) return; const ks=Object.keys(SEC_KEYS).filter(k=>!['Crop','Mask','Spot'].includes(k)); const d=defaults();
    const used=k=>SEC_KEYS[k].some(x=>JSON.stringify(S[x])!==JSON.stringify(d[x]));
    dlg(`<h3>Save partial preset</h3><div class="f"><label>Name</label><input id="ppN" placeholder="My look"></div><div class="hint">Only the ticked groups are stored; applying it leaves everything else untouched.</div>
     <div class="grid2" id="ppK">${ks.map(k=>`<label class="chk"><input type="checkbox" value="${k}" ${used(k)?'checked':''}> ${k}</label>`).join('')}</div><div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="ppGo">Save</button></div>`);
    $('#ppGo').onclick=()=>{ const n=$('#ppN').value.trim(); if(!n) return toast('Name it first'); const keys=[...$$('#ppK input:checked')].map(i=>i.value); if(!keys.length) return toast('Tick at least one group');
      const s={}; keys.forEach(k=>SEC_KEYS[k].forEach(x=>{ if(S[x]!==undefined) s[x]=clone(S[x]); })); userPresets.push({name:n,s,partial:keys}); localStorage.setItem('ps.presets',JSON.stringify(userPresets)); renderPresets(); closeDlg(); toast(`Partial preset “${n}” saved (${keys.join(', ')})`); }; };
  b2.onclick=()=>browsePresets(); }
async function browsePresets(){ if(!S||!engine.state) return; const all=[...BUILTIN.map(([g,n,ps])=>({g,n,ps})),...userPresets.map(u=>({g:'User'+(u.partial?' (partial)':''),n:u.name,ps:u.s}))];
  dlg(`<h3>Presets — preview on this photo</h3><div class="pgrid" id="pgrid">${all.map((p,i)=>`<button class="pcell" data-i="${i}"><canvas></canvas><span>${esc(p.n)}<small>${esc(p.g)}</small></span></button>`).join('')}</div><div class="btns"><button class="btn" onclick="closeDlg()">Close</button></div>`);
  const st=engine.state; const os=Engine.outSize(st,S); const k=Math.min(1,150/Math.max(os.w,os.h)); const w=Math.max(1,Math.round(os.w*k)), h=Math.max(1,Math.round(os.h*k)); const t0=performance.now();
  const cells=[...$$('#pgrid .pcell')];
  for(let i=0;i<all.length;i++){ if($('#modal').hidden) break; const keep={}; GEOM.forEach(x=>keep[x]=S[x]); const s2=fillDefaults(Object.assign(clone(S),clone(all[i].ps),keep));
    engine.process(st,s2); const px=engine.readOut(st,s2,w,h,{}); const c=cells[i].querySelector('canvas'); c.width=w; c.height=h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer),w,h),0,0); if(i%4===3) await new Promise(r=>setTimeout(r,0)); }
  window.__presetBrowseMs=Math.round(performance.now()-t0); schedule(true);
  $('#pgrid').onclick=e=>{ const b=e.target.closest('.pcell'); if(!b) return; const p=all[+b.dataset.i]; closeDlg(); applyPreset(p.ps,p.n); }; }
window.browsePresets=browsePresets;
});

/* ---------- 16-bit rendering + encoders ---------- */
async function renderTiled16(src,s,W,H,OW,OH,parent,onTile){ if(!engine.floatRT) throw new Error('16-bit export needs float render targets (not available on this device)');
  const out=new Uint16Array(OW*OH*3); const T=IOS_MEM?1024:2048; const nx=Math.ceil(OW/T), ny=Math.ceil(OH/T); const odd=s.orient%2; const Wf=(odd?H:W)*s.crop.w; const k=OW/Wf;
  for(let ty=0;ty<ny;ty++) for(let tx=0;tx<nx;tx++){ const ox=tx*T, oy=ty*T, tw=Math.min(T,OW-ox), th=Math.min(T,OH-oy); const view=[ox/OW,oy/OH,tw/OW,th/OH];
    onTile&&onTile(ty*nx+tx+1,nx*ny); await nextFrame(); const b=srcBox(s,view,W,H,Math.ceil(56/Math.max(k,0.05)+(s.lb&&s.lb.on?s.lb.amt/100*0.022*Math.max(W,H)*1.15:0))); const st=regionState(src,b,k,W,H,parent);
    try{ engine.process(st,s); const px=engine.readOutF(st,s,tw,th,{view}); for(let y=0;y<th;y++){ const o=((oy+y)*OW+ox)*3; for(let x=0;x<tw;x++){ const i=(y*tw+x)*4, j=o+x*3; out[j]=Math.round(Math.max(0,Math.min(1,px[i]))*65535); out[j+1]=Math.round(Math.max(0,Math.min(1,px[i+1]))*65535); out[j+2]=Math.round(Math.max(0,Math.min(1,px[i+2]))*65535); } } }
    finally{ engine.freeState(st); } }
  return {w:OW,h:OH,data:out,bits:16}; }
function tiff(w,h,bits,data){ const bps=bits/8, n=w*h*3*bps; const ne=11, ifd=8, ifdLen=2+ne*12+4, bpsOff=ifd+ifdLen, dataOff=bpsOff+8; const buf=new ArrayBuffer(dataOff+n); const v=new DataView(buf);
  v.setUint16(0,0x4949); v.setUint16(2,42,true); v.setUint32(4,ifd,true); v.setUint16(ifd,ne,true); let e=ifd+2; const ent=(tag,type,cnt,val)=>{ v.setUint16(e,tag,true); v.setUint16(e+2,type,true); v.setUint32(e+4,cnt,true); if(type===3&&cnt===1) v.setUint16(e+8,val,true); else v.setUint32(e+8,val,true); e+=12; };
  ent(256,4,1,w); ent(257,4,1,h); ent(258,3,3,bpsOff); ent(259,3,1,1); ent(262,3,1,2); ent(273,4,1,dataOff); ent(277,3,1,3); ent(278,4,1,h); ent(279,4,1,n); ent(284,3,1,1); ent(339,3,1,1); v.setUint32(e,0,true);
  for(let i=0;i<3;i++) v.setUint16(bpsOff+i*2,bits,true);
  if(bits===8) new Uint8Array(buf,dataOff).set(data); else { const o=new Uint16Array(buf,dataOff,w*h*3); o.set(data); } return new Blob([buf],{type:'image/tiff'}); }
const crcT=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
const crc=(b,c=0xFFFFFFFF)=>{ for(let i=0;i<b.length;i++) c=crcT[(c^b[i])&255]^(c>>>8); return c; };
function chunk(type,data){ const o=new Uint8Array(12+data.length); const v=new DataView(o.buffer); v.setUint32(0,data.length); for(let i=0;i<4;i++) o[4+i]=type.charCodeAt(i); o.set(data,8); v.setUint32(8+data.length,(crc(o.subarray(4,8+data.length))^0xFFFFFFFF)>>>0); return o; }
async function png16(w,h,data){ const rowB=w*6+1; const raw=new Uint8Array(rowB*h); for(let y=0;y<h;y++){ const o=y*rowB; raw[o]=0; for(let x=0;x<w*3;x++){ const v=data[y*w*3+x]; raw[o+1+x*2]=v>>8; raw[o+2+x*2]=v&255; } }
  const z=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const ih=new Uint8Array(13); const v=new DataView(ih.buffer); v.setUint32(0,w); v.setUint32(4,h); ih[8]=16; ih[9]=2;
  const srgb=chunk('sRGB',new Uint8Array([0])); return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),srgb,chunk('IDAT',z),chunk('IEND',new Uint8Array(0))],{type:'image/png'}); }
window.renderTiled16=renderTiled16;
window.encode16=async(D,o)=>o.fmt==='png16'?png16(D.w,D.h,D.data):tiff(D.w,D.h,16,D.data);
window.encode8=async(c,o)=>{ if(o.fmt==='webp'){ const b=await new Promise(r=>c.toBlob(r,'image/webp',(o.q||90)/100)); if(b&&b.type==='image/webp') return b; toast('This browser cannot encode WebP: saved PNG instead',3000); return await new Promise(r=>c.toBlob(r,'image/png')); }
  const g=c.getContext('2d'); const W=c.width,H=c.height; const rgb=new Uint8Array(W*H*3); const SH=512; for(let y0=0;y0<H;y0+=SH){ const h=Math.min(SH,H-y0); const d=g.getImageData(0,y0,W,h).data; for(let i=0,j=y0*W*3;i<d.length;i+=4,j+=3){ rgb[j]=d[i]; rgb[j+1]=d[i+1]; rgb[j+2]=d[i+2]; } }
  return tiff(W,H,8,rgb); };
window.__enc={tiff,png16};
