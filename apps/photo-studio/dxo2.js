'use strict';
/* DxO round 2: control-brush raster, lensfun lens profiles, Fine contrast HL/SH, FilmPack extras, soft proofing,
   AI-style sensor dust detection for the Repair tool, PhotoLibrary-style search filters. */
const brushCache0=null, brushCache={key:'',v:null};
window.cpBrush=s=>{ const L=(s.cps||[]).filter(q=>q.kind==='brush'&&q.on!==false); if(!L.length) return null; const [Wp,Hp]=(window.photoDims?photoDims():[1500,1000]);
  const key=JSON.stringify([L.map(q=>[q.bch,q.strokes]),Wp,Hp]); if(brushCache.key===key) return brushCache.v;
  const k=512/Math.max(Wp,Hp); const w=Math.max(8,Math.round(Wp*k)), h=Math.max(8,Math.round(Hp*k)); const out=new Uint8Array(w*h*4);
  const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d');
  for(const q of L){ g.globalCompositeOperation='source-over'; g.clearRect(0,0,w,h); g.lineCap=g.lineJoin='round';
    for(const st of q.strokes||[]){ const r=st.size/100*Math.max(w,h)*0.25; g.globalCompositeOperation=st.erase?'destination-out':'source-over'; g.strokeStyle='#fff'; g.lineWidth=2*r; g.filter=`blur(${Math.max(0.5,r*0.35)}px)`;
      g.beginPath(); st.pts.forEach((p,i)=>{ const x=p[0]*w,y=p[1]*h; i?g.lineTo(x,y):g.moveTo(x,y); }); if(st.pts.length===1) g.lineTo(st.pts[0][0]*w+0.1,st.pts[0][1]*h); g.stroke(); }
    g.filter='none'; const d=g.getImageData(0,0,w,h).data; for(let i=0;i<w*h;i++) out[i*4+q.bch]=d[i*4+3]; }
  const v={w,h,data:out,key}; brushCache.key=key; brushCache.v=v; return v; };

/* ---------- lensfun profiles ---------- */
let LDB=null; const loadDB=()=>LDB||(LDB=fetch('lensdb.json').then(r=>r.json()));
const norm=s=>String(s||'').toLowerCase().replace(/[\u00a0]/g,' ').replace(/(\d)\.0(?=\s*mm)/g,'$1').replace(/(\d)\s*mm/g,'$1mm').replace(/f\s*\/\s*/g,'f').replace(/[()\[\],]/g,' ').replace(/\s+/g,' ').trim();
const toks=s=>norm(s).split(' ').filter(Boolean);
function fixedLens(db,exif){ const md=norm(exif.Model), mk=norm(exif.Make).split(' ')[0]; if(!md) return null; const md2=md.replace(/^(leica|ricoh|sony|fujifilm|canon|nikon|panasonic) /,'');
  for(const [cm,cmod,ln] of db.fx||[]){ const c2=cmod.replace(/^(leica|ricoh|sony|fujifilm|canon|nikon|panasonic) /,''); if((cmod===md||c2===md2)&&(!mk||cm.includes(mk)||mk.includes(cm.split(' ')[0]))){ const l=db.lenses.find(x=>x.n===ln); if(l) return {lens:l,score:1,fixed:true}; } } return null; }
function matchLens(db,exif){ const fx=fixedLens(db,exif); if(fx) return fx; const L=exif.LensModel; if(!L) return null; const et=new Set(toks(L)); const ef=norm(L).replace(/ /g,''); let best=null,bs=0;
  for(const l of db.lenses){ for(const nm of [l.n,...l.a]){ const t=toks(nm).filter(x=>!['lens','af','af-s','af-p','ef','rf','fe','oss','is','usm','stm','vr','ed','dc','dg','hsm','ii','iii','asph.','asph','g','di','vc','xf','xc','r','wr','lm','ois','pz','nikkor','canon','sony','fujifilm','fujinon','zeiss','sigma','tamron','samyang','|','–','-'].includes(x));
      if(!t.length) continue; const foc=t.filter(x=>/\d+(-\d+)?mm/.test(x)); if(!foc.length||!foc.every(x=>ef.includes(x))) continue;
      let hit=0; for(const x of t) if(et.has(x)||(x.length>=4&&ef.includes(x))) hit++; const mk=norm(l.mk), camMk=norm(exif.Make).split(' ')[0]; const third=/sigma|tamron|samyang|rokinon|zeiss|tokina|viltrox|laowa|voigtl|7artisans|ttartisan|sirui/.exec(norm(L));
      let sc=hit/t.length+t.length*0.01+(third?(mk.includes(third[0])?0.3:-0.4):((mk&&(mk.includes(camMk)||camMk.includes(mk.split(' ')[0])))?0.15:-0.3));
      if(sc>bs){ bs=sc; best=l; } } }
  return bs>=0.6?{lens:best,score:bs}:null; }
const num=x=>x==null?NaN:typeof x==='number'?x:Array.isArray(x)?x[0]/(x[1]||1):x.numerator!=null?x.numerator/x.denominator:+x;
function interp(arr,f,idx){ if(!arr.length) return null; const a=arr.slice().sort((p,q)=>p[0]-q[0]); if(f<=a[0][0]) return a[0]; if(f>=a[a.length-1][0]) return a[a.length-1];
  for(let i=1;i<a.length;i++) if(f<=a[i][0]){ const p=a[i-1],q=a[i],t=(f-p[0])/((q[0]-p[0])||1); return p.map((v,j)=>j===0?f:v+(q[j]-v)*t); } }
function profileFor(db,p){ const e=p.exif||{}; const m=matchLens(db,e); if(!m) return null; const l=m.lens; const f=num(e.FocalLength)||num(e.FocalLength35)||(l.d[0]||l.v[0]||[24])[0]; const N=num(e.FNumber)||5.6;
  let camCF=null; const mk=norm(e.Make).split(' ')[0], md=norm(e.Model); for(const [cm,cmod,cf] of db.cams){ if(norm(cmod)===md&&(!mk||norm(cm).includes(mk))){ camCF=cf; break; } }
  if(!camCF){ const f35=num(e.FocalLength35), fl=num(e.FocalLength); camCF=f35&&fl?f35/fl:l.cf; }
  const sc=l.cf/camCF; const W=p.w||3,H=p.h||2; const longS=Math.max(W,H), shortS=Math.min(W,H), diag=Math.hypot(W,H);
  const out={name:l.mk+' '+l.n+(m.fixed?' (built-in lens)':''),score:+m.score.toFixed(2),focal:f,camCF:+camCF.toFixed(2),lensCF:l.cf};
  const d=interp(l.d.map(x=>x.length===5?x:[x[0],0,0,x[3],0]),f); // [f,a,b,c|k1,isPt]
  if(d){ const isPt=l.d.some(x=>x.length===5); const rho=r=>isPt?(d[1]*r**3+d[2]*r**2+d[3]*r+1-d[1]-d[2]-d[3]):(1-d[3]+d[3]*r*r);
    let num1=0,den=0; const corner=Math.hypot(W,H)/longS; for(let i=1;i<=40;i++){ const n=corner*i/40; const rl=n*(longS/shortS)*sc; const gN=rho(rl)/rho(0)-1; num1+=gN*n*n; den+=n**4; }
    const dist=num1/den; out.distortion=Math.round(Math.max(-100,Math.min(100,-dist/0.25*100))); }
  const vv=l.v.length?(()=>{ const byF={}; for(const x of l.v){ (byF[x[0]]=byF[x[0]]||[]).push(x); } const pick=a=>a.reduce((b,x)=>Math.abs(Math.log(x[1]/N))<Math.abs(Math.log(b[1]/N))?x:b); return interp(Object.values(byF).map(pick).map(x=>[x[0],x[2],x[3],x[4]]),f); })():null;
  if(vv){ let best=[0,50,1e9]; for(let mid=0;mid<=100;mid+=5){ const pw=1.5+3*mid/100; let s1=0,s2=0; const T=[]; for(let i=1;i<=30;i++){ const rr=i/30, rl=rr*sc; const gain=1/(1+vv[1]*rl**2+vv[2]*rl**4+vv[3]*rl**6)-1; const b=1.6*rr**pw; T.push([gain,b]); s1+=gain*b; s2+=b*b; }
      const A=s1/s2; const err=T.reduce((e,[g,b])=>e+(g-A*b)**2,0); if(err<best[2]) best=[A,mid,err]; } out.vig=Math.round(Math.max(0,Math.min(100,best[0]*100))); out.vigMid=best[1]; }
  const t=interp(l.t,f); if(t){ out.caR=+((t[1]-1)*1000).toFixed(2); out.caB=+((t[2]-1)*1000).toFixed(2); }
  return out; }
window.lensProfile={loadDB,matchLens,profileFor};

addEventListener('DOMContentLoaded',()=>{
const row=(p,html)=>{ const r=document.createElement('div'); r.className='row'; r.innerHTML=html; p.appendChild(r); return r; };
const secOf=t=>[...$$('#sections details.sec')].find(d=>d.firstChild.textContent.startsWith(t));
/* lens profile UI */
const ob=$('#optAuto').closest('div').parentNode; const lp=document.createElement('div'); ob.insertBefore(lp,$('#optAuto').closest('.row'));
lp.innerHTML='<div class="row"><button class="btn" id="lensProf">⌾ Apply lens profile</button><label class="ckrow"><input type="checkbox" id="lensAuto"> Auto-apply on open</label></div><div class="hint" id="lensSt"></div>';
$('#lensAuto').checked=localStorage.getItem('ps.lensAuto')!=='0'; $('#lensAuto').onchange=e=>localStorage.setItem('ps.lensAuto',e.target.checked?'1':'0');
async function applyProfile(quiet){ const p=curPhoto(); if(!p||!S) return null; const db=await loadDB(); const pr=profileFor(db,p); const st=$('#lensSt');
  if(!pr){ st.textContent=(p.exif&&p.exif.LensModel)?`No profile for “${p.exif.LensModel}” in the lens database`:'No lens model in EXIF: use Auto optics'; S.lensProfile='none'; return null; }
  if(pr.distortion!=null) S.distortion=pr.distortion; if(pr.vig!=null){ S.lensVig=pr.vig; S.lensVigMid=pr.vigMid; } if(pr.caR!=null){ S.caR=pr.caR; S.caB=pr.caB; } S.lensProfile=pr.name;
  st.textContent=`Profile: ${pr.name} @ ${pr.focal}mm (crop ${pr.camCF}) → distortion ${pr.distortion??'–'}, vignetting ${pr.vig??'–'}, CA ${pr.caR??'–'}/${pr.caB??'–'}‰`; window.__lensProf=pr;
  syncUI(); schedule(true); if(!quiet) commit('Lens profile'); else commit('Auto lens profile'); return pr; }
$('#lensProf').onclick=()=>applyProfile(false); window.applyLensProfile=applyProfile;
const bo=window.onDevelopOpen; window.onDevelopOpen=p=>{ bo&&bo(p); const ps0=p.settings||{}; $('#lensSt').textContent=ps0.lensProfile&&ps0.lensProfile!=='none'?'Profile: '+ps0.lensProfile:'';
  if($('#lensAuto').checked&&ps0.lensProfile==null&&p.exif&&(p.exif.LensModel||p.exif.Model)) setTimeout(()=>{ if(curPhoto()===p) window.applyLensProfile(true); },200); };
/* Fine contrast HL / SH */
const sl=$('#slSec'); const fcRow=[...sl.querySelectorAll('.sl')].find(r=>r.textContent.startsWith('Fine contrast'));
const tmp=document.createElement('div'); slider(tmp,'Fine contrast highlights',s=>s.fcH,(s,v)=>s.fcH=v,-100,100,1,null,'Fine contrast highlights'); slider(tmp,'Fine contrast shadows',s=>s.fcS,(s,v)=>s.fcS=v,-100,100,1,null,'Fine contrast shadows'); fcRow.after(...tmp.children);
/* FilmPack extras */
const fm=secOf('Film Emulation').lastChild; const fx=document.createElement('div'); fm.appendChild(fx);
sub(fx,'Creative extras (FilmPack)');
slider(fx,'Lens blur (edges)',s=>s.fBlur,(s,v)=>s.fBlur=v,0,100,1,null,'Edge blur');
slider(fx,'Light leak',s=>s.leak,(s,v)=>s.leak=v,0,100,1,null,'Light leak');
const lr=row(fx,'<select id="leakPos"><option value="left">Leak: left</option><option value="right">Leak: right</option><option value="top">Leak: top</option><option value="bottom">Leak: bottom</option></select><select id="leakCol"><option value="warm">Warm orange</option><option value="red">Red</option><option value="golden">Golden</option><option value="magenta">Magenta</option></select>');
slider(fx,'Texture (dust & scratches)',s=>s.texture2,(s,v)=>s.texture2=v,0,100,1,null,'Film texture');
row(fx,'<select id="frameSel"><option value="none">No frame</option><option value="white">White border</option><option value="black">Black border</option><option value="film">35mm film rebate</option><option value="polaroid">Instant (Polaroid)</option><option value="rounded">Rounded corners</option></select>');
slider(fx,'Frame width',s=>s.frameW,(s,v)=>s.frameW=v,2,100,1,null,'Frame width');
for(const [id,k,lab] of [['leakPos','leakPos','Light leak position'],['leakCol','leakCol','Light leak colour'],['frameSel','frame','Frame']]){ $('#'+id).onchange=e=>{ S[k]=e.target.value; schedule(true); commit(lab); }; syncers.push(()=>$('#'+id).value=S[k]||$('#'+id).options[0].value); }
/* Soft proofing */
const vt=$('.vtools'); const ps=document.createElement('select'); ps.id='proofSel'; ps.title='Soft proofing'; ps.innerHTML='<option value="">Proof: off</option><option value="glossy">Proof: print glossy</option><option value="matte">Proof: print matte</option><option value="web">Proof: web/sRGB paper-white</option>'; ($('#tatSel')||vt.lastChild).after(ps);
const pw=document.createElement('label'); pw.className='ckrow'; pw.id='proofWarnL'; pw.innerHTML='<input type="checkbox" id="proofWarn"> gamut ⚠'; ps.after(pw);
const upP=()=>{ window.proofMode=ps.value||null; window.proofWarn=$('#proofWarn').checked; pw.hidden=!ps.value; schedule(true); $('#stage').classList.toggle('proofing',!!ps.value); }; ps.onchange=upP; $('#proofWarn').onchange=upP; upP();
/* Repair: sensor dust detection */
const sp=secOf('Spot Removal'); if(sp){ const b=sp.lastChild; const r=row(b,'<button class="btn" id="dustBtn">✦ Find sensor dust</button><span class="hint" id="dustSt"></span>'); b.prepend(r);
  $('#dustBtn').onclick=()=>{ const D=window.srcHi; if(!D||!S) return; const t0=performance.now(); const spots=findDust(D); const [Wp,Hp]=photoDims(); const L=Math.max(Wp,Hp);
    for(const d of spots){ const size=Math.max(0.6,Math.min(6,d.r/Math.max(D.w,D.h)*4*100)); S.healStrokes.push({id:'h'+uid(),mode:'remove',size:+size.toFixed(2),feather:40,pts:[[+d.x.toFixed(5),+d.y.toFixed(5)]],off:[0,0],dust:1}); }
    $('#dustSt').textContent=spots.length?`${spots.length} dust spot(s) removed (${Math.round(performance.now()-t0)} ms)`:'No dust spots found'; window.__dust=spots; if(spots.length){ schedule(true); commit('Remove sensor dust'); window.ensureFill&&ensureFill(); } }; }
function findDust(D){ const W=D.w,H=D.h,d=D.data; const Y=new Float32Array(W*H); for(let i=0;i<W*H;i++) Y[i]=0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2];
  const box=(a,r)=>{ const I=new Float64Array((W+1)*(H+1)); for(let y=0;y<H;y++){ let s=0; for(let x=0;x<W;x++){ s+=a[y*W+x]; I[(y+1)*(W+1)+x+1]=I[y*(W+1)+x+1]+s; } } const o=new Float32Array(W*H);
    for(let y=0;y<H;y++){ const y0=Math.max(0,y-r), y1=Math.min(H,y+r+1); for(let x=0;x<W;x++){ const x0=Math.max(0,x-r), x1=Math.min(W,x+r+1); o[y*W+x]=(I[y1*(W+1)+x1]-I[y0*(W+1)+x1]-I[y1*(W+1)+x0]+I[y0*(W+1)+x0])/((y1-y0)*(x1-x0)); } } return o; };
  const bg=box(Y,9), sm=box(Y,1); const sq=new Float32Array(W*H); for(let i=0;i<W*H;i++) sq[i]=Y[i]*Y[i]; const v=box(sq,9);
  const G=new Float32Array(W*H); for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ const i=y*W+x; G[i]=Math.abs(Y[i+1]-Y[i-1])+Math.abs(Y[i+W]-Y[i-W]); } const G9=box(G,12), G4=box(G,7);
  const cand=new Uint8Array(W*H); for(let i=0;i<W*H;i++){ const ring=(G9[i]*625-G4[i]*225)/400; const dip=bg[i]-sm[i]; if(bg[i]>70&&dip>Math.max(4,bg[i]*0.04)&&dip<bg[i]*0.45&&ring<4) cand[i]=1; }
  const seen=new Uint8Array(W*H), out=[]; for(let i=0;i<W*H;i++){ if(!cand[i]||seen[i]) continue; const st=[i]; seen[i]=1; let n=0,sx=0,sy=0,x0=1e9,x1=-1,y0=1e9,y1=-1;
    while(st.length){ const j=st.pop(); const x=j%W,y=(j/W)|0; n++; sx+=x; sy+=y; x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const xx=x+dx,yy=y+dy; if(xx<0||yy<0||xx>=W||yy>=H) continue; const k=yy*W+xx; if(cand[k]&&!seen[k]){ seen[k]=1; st.push(k); } } }
    const bw=x1-x0+1, bh=y1-y0+1; if(n>=30&&n<=400&&bw<=18&&bh<=18&&n/(bw*bh)>0.35&&Math.max(bw,bh)/Math.min(bw,bh)<2.5) out.push({x:sx/n/W,y:sy/n/H,r:Math.max(bw,bh)/2+2,n}); }
  return out.slice(0,60); }
window.findDust=findDust;
/* Library filters: camera, lens, ISO, date */
const fb=$('.filterbar'); const fw=document.createElement('span'); fw.id='exFilters'; fw.innerHTML='<select id="fCam"><option value="">Any camera</option></select><select id="fLens"><option value="">Any lens</option></select><select id="fIso"><option value="">Any ISO</option><option value="0-400">ISO ≤ 400</option><option value="401-1600">ISO 401–1600</option><option value="1601-6400">ISO 1601–6400</option><option value="6401-1e9">ISO > 6400</option></select><input type="date" id="fFrom" title="Taken from"><input type="date" id="fTo" title="Taken until">'; fb.insertBefore(fw,$('#fSearch'));
const cam=p=>[p.exif?.Make,p.exif?.Model].filter(Boolean).join(' ').replace(/^(\w+) \1 /i,'$1 ').trim(); const lens=p=>(p.exif?.LensModel||'').trim();
const dateOf=p=>{ const m=String(p.exif?.DateTimeOriginal||p.exif?.DateTime||'').match(/(\d{4}):(\d\d):(\d\d)/); return m?`${m[1]}-${m[2]}-${m[3]}`:new Date(p.added).toISOString().slice(0,10); };
function fillOpts(){ for(const [id,fn,lab] of [['fCam',cam,'Any camera'],['fLens',lens,'Any lens']]){ const el=$('#'+id); const v=el.value; const vals=[...new Set(photos.map(fn).filter(Boolean))].sort(); el.innerHTML=`<option value="">${lab}</option>`+vals.map(x=>`<option>${x.replace(/</g,'&lt;')}</option>`).join(''); el.value=vals.includes(v)?v:''; } }
const mp=window.matchPhoto; window.matchPhoto=(p,q)=>{ if(!mp(p,q)) return false; const c=$('#fCam').value, l=$('#fLens').value, iso=$('#fIso').value, a=$('#fFrom').value, b=$('#fTo').value;
  if(c&&cam(p)!==c) return false; if(l&&lens(p)!==l) return false; if(iso){ const v=num(p.exif?.ISO); const [lo,hi]=iso.split('-').map(Number); if(!(v>=lo&&v<=hi)) return false; } const d=dateOf(p); if(a&&d<a) return false; if(b&&d>b) return false; return true; };
['fCam','fLens','fIso','fFrom','fTo'].forEach(id=>$('#'+id).addEventListener('change',()=>renderLibrary()));
const rl=window.renderLibrary; window.renderLibrary=function(){ fillOpts(); rl(); };
});
