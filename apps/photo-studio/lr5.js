'use strict';
/* Lightroom / DxO round 5: Preset Amount slider, Vignette Style + Highlights, Visualize Spots, pixel RGB readout,
   per-slider Auto (Shift+double-click + white/black point buttons), Contact Sheet (Print-lite),
   touch swipe between photos in Develop, full-screen preview (F). */
addEventListener('DOMContentLoaded',()=>{
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cl=x=>x===undefined?undefined:clone(x);
const findSec=t=>[...$$('#sections details.sec')].find(d=>(d.querySelector('summary')?.textContent||'').startsWith(t));
const rowOf=(sec,label)=>sec&&[...sec.querySelectorAll('.sl')].find(r=>(r.querySelector('label')?.textContent||'').trim()===label);

/* ===== shared: rendered output-frame buffer of the current edit (cached by settings) ===== */
let rb=null, rbKey='', rbVer=0;
function frameBuf(maxEdge){
  if(!S||!engine.state||cropOn||mode!=='develop') return null;
  const vs=viewSettings(); const key=cur+'|'+maxEdge+'|'+JSON.stringify(vs);
  if(rb&&rbKey===key) return rb;
  engine.process(engine.state,vs); const os=Engine.outSize(engine.state,vs); const k=Math.min(1,maxEdge/Math.max(os.w,os.h));
  const w=Math.max(1,Math.round(os.w*k)), h=Math.max(1,Math.round(os.h*k));
  const px=engine.readOut(engine.state,vs,w,h); rb={w,h,px,ver:++rbVer}; rbKey=key; return rb;
}
window.frameBuf=frameBuf;
function glRelRect(){ const g=$('#gl').getBoundingClientRect(), s=$('#stage').getBoundingClientRect(); return {x:g.left-s.left,y:g.top-s.top,w:g.width,h:g.height,g}; }

/* ===== Pixel RGB readout under the cursor (Lightroom shows R/G/B % under the histogram) ===== */
const pxr=document.createElement('div'); pxr.id='pxRead'; pxr.innerHTML='&nbsp;'; $('.histo')?.appendChild(pxr);
let pxPend=null;
function readAt(cx,cy){
  if(mode!=='develop'||!S||cropOn){ pxr.innerHTML='&nbsp;'; return; }
  const r=$('#gl').getBoundingClientRect(); const fx=(cx-r.left)/r.width, fy=(cy-r.top)/r.height;
  if(fx<0||fy<0||fx>1||fy>1){ pxr.innerHTML='&nbsp;'; return; }
  const v=currentView(); const u=v[0]+fx*v[2], w=v[1]+fy*v[3]; if(u<0||w<0||u>1||w>1){ pxr.innerHTML='&nbsp;'; return; }
  const B=frameBuf(isTouch?768:1024); if(!B) return;
  const x=Math.min(B.w-1,Math.floor(u*B.w)), y=Math.min(B.h-1,Math.floor(w*B.h)); let R=0,G=0,Bl=0,n=0;
  for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){ const xx=Math.min(B.w-1,Math.max(0,x+i)), yy=Math.min(B.h-1,Math.max(0,y+j)), k=(yy*B.w+xx)*4; R+=B.px[k]; G+=B.px[k+1]; Bl+=B.px[k+2]; n++; }
  const p=c=>(c/n/2.55).toFixed(1);
  pxr.innerHTML=`<span style="color:#f77">R ${p(R)}</span> <span style="color:#7d7">G ${p(G)}</span> <span style="color:#7af">B ${p(Bl)}</span> %`;
  window.__pxRead=[+p(R),+p(G),+p(Bl)];
}
const st=$('#stage');
st.addEventListener('pointermove',e=>{ if(pxPend) { pxPend=[e.clientX,e.clientY]; return; } pxPend=[e.clientX,e.clientY]; requestAnimationFrame(()=>{ const q=pxPend; pxPend=null; try{ readAt(q[0],q[1]); }catch(err){ console.error(err); } }); });
st.addEventListener('pointerleave',()=>{ pxr.innerHTML='&nbsp;'; });
window.readPixelAt=readAt;

/* ===== Visualize Spots (Spot Removal) — high-pass view to find dust ===== */
let vsOn=false, vsThr=+(localStorage.getItem('ps.vsThr')||45), vsCache={k:'',c:null}, vsT=0;
const vc=document.createElement('canvas'); vc.id='vsCv'; vc.hidden=true; st.insertBefore(vc,$('#ov'));
const H=$('#healSec');
if(H){ const d=document.createElement('div'); d.className='vsBox';
  d.innerHTML=`<div class="row" style="align-items:center"><label class="chk"><input type="checkbox" id="vsChk"> Visualize spots (A)</label></div>
  <div class="sl"><label>Threshold</label><input type="range" id="vsThr" min="1" max="100" step="1" value="${vsThr}"><input type="number" id="vsThrN" min="1" max="100" value="${vsThr}"></div>
  <div class="hint">Inverted high-pass view of the edited image — dust and sensor spots show as bright dots. Approximate (computed from a ≤2048px render).</div>`;
  H.appendChild(d);
  $('#vsChk').onchange=e=>setVS(e.target.checked);
  const upd=v=>{ vsThr=clamp(+v||45,1,100); $('#vsThr').value=vsThr; $('#vsThrN').value=vsThr; localStorage.setItem('ps.vsThr',vsThr); drawVS(); };
  $('#vsThr').oninput=e=>upd(e.target.value); $('#vsThrN').onchange=e=>upd(e.target.value);
}
function setVS(on){ vsOn=!!on; const c=$('#vsChk'); if(c) c.checked=vsOn; if(vsOn&&tool!=='heal'&&typeof setTool==='function') setTool('heal'); drawVS(); if(vsOn) toast('Visualize spots: bright dots are likely dust',1400); }
window.setVisualizeSpots=setVS;
{ const _st=window.setTool; if(typeof _st==='function') window.setTool=function(){ const r=_st.apply(this,arguments); try{ drawVS(); }catch(e){} return r; }; }
function vsMap(B){
  const key=B.ver+'|'+vsThr; if(vsCache.k===key) return vsCache.c;
  const {w,h,px}=B; const L=new Float32Array(w*h); for(let i=0,j=0;i<w*h;i++,j+=4) L[i]=0.299*px[j]+0.587*px[j+1]+0.114*px[j+2];
  const I=new Float64Array((w+1)*(h+1)); for(let y=0;y<h;y++){ let s=0; for(let x=0;x<w;x++){ s+=L[y*w+x]; I[(y+1)*(w+1)+x+1]=I[y*(w+1)+x+1]+s; } }
  const r=Math.max(2,Math.round(Math.max(w,h)/500)), r2=Math.max(6,Math.round(Math.max(w,h)/110)); const gain=0.25+vsThr/25, off=Math.max(2,14-vsThr/8);
  const box=(x,y,rr)=>{ const x0=Math.max(0,x-rr), x1=Math.min(w,x+rr+1), y0=Math.max(0,y-rr), y1=Math.min(h,y+rr+1); return (I[y1*(w+1)+x1]-I[y0*(w+1)+x1]-I[y1*(w+1)+x0]+I[y0*(w+1)+x0])/((x1-x0)*(y1-y0)); };
  const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); const im=g.createImageData(w,h), o=im.data;
  for(let y=0;y<h;y++){ for(let x=0;x<w;x++){
    const m=box(x,y,r), mid=box(x,y,Math.max(1,r>>1)), m2=box(x,y,r2); const d=Math.max(Math.abs(L[y*w+x]-m), Math.abs(mid-m2)*1.6); // fine edges + soft blobs (DoG)
    const v=clamp((d-off)*gain*4,0,255), k=(y*w+x)*4; o[k]=o[k+1]=o[k+2]=v; o[k+3]=255; } }
  g.putImageData(im,0,0); vsCache={k:key,c}; return c;
}
function drawVS(){
  const show=vsOn&&tool==='heal'&&mode==='develop'&&!!S&&!cropOn; vc.hidden=!show; if(!show) return;
  const B=frameBuf(isTouch?1400:2048); if(!B) { vc.hidden=true; return; }
  const m=vsMap(B); const dp=Math.min(devicePixelRatio||1,2); const sw=st.clientWidth, sh=st.clientHeight;
  if(vc.width!==Math.round(sw*dp)||vc.height!==Math.round(sh*dp)){ vc.width=Math.round(sw*dp); vc.height=Math.round(sh*dp); }
  vc.style.width=sw+'px'; vc.style.height=sh+'px';
  const g=vc.getContext('2d'); g.setTransform(dp,0,0,dp,0,0); g.clearRect(0,0,sw,sh); const R=glRelRect(), v=currentView();
  g.imageSmoothingEnabled=true; g.drawImage(m, v[0]*B.w, v[1]*B.h, v[2]*B.w, v[3]*B.h, R.x, R.y, R.w, R.h);
  window.__vs={w:B.w,h:B.h,thr:vsThr};
}

/* ===== frame hook (visualize refresh, preset-amount visibility) ===== */
const baseFrame=window.frame;
window.frame=function(){ baseFrame(); try{ clearTimeout(vsT); if(vsOn||!vc.hidden) vsT=setTimeout(()=>{ try{ drawVS(); }catch(e){ console.error(e); } },70); if(pa&&pa.id!==cur) hidePA(); }catch(e){ console.error(e); } };
new ResizeObserver(()=>{ if(vsOn) drawVS(); }).observe(st);

/* ===== Per-slider Auto: Shift+double-click a Basic tone label; White/Black point buttons ===== */
function histOf(s){ const Hh=engine.histogram(s); let n=0; for(let i=0;i<256;i++) n+=Hh[1][i]; return {H:Hh,n}; }
function clipHi(s){ const {H:Hh,n}=histOf(s); return Math.max(...[0,1,2].map(c=>Hh[c][255]+Hh[c][254]))/n; }
function clipLo(s){ const {H:Hh,n}=histOf(s); return Math.max(...[0,1,2].map(c=>Hh[c][0]+Hh[c][1]))/n; }
function autoKey(k,label){
  if(!S||!engine.state) return toast('Open a photo in Develop first');
  const T=0.0015; let v;
  if(k==='whites'||k==='blacks'){ const t=clone(S); let lo=-100, hi=100;
    for(let it=0;it<9;it++){ const mid=(lo+hi)/2; t[k]=mid; const f=k==='whites'?clipHi(t):clipLo(t);
      if(k==='whites'){ if(f>T) hi=mid; else lo=mid; } else { if(f>T) lo=mid; else hi=mid; } }
    v=Math.round(k==='whites'?lo:hi);
  } else {
    const t=clone(S); Object.assign(t,{exposure:0,contrast:0,highlights:0,shadows:0,whites:0,blacks:0,curve:defaults().curve});
    const Hh=engine.histogram(t); const L=new Float64Array(256); let n=0; for(let i=0;i<256;i++){ L[i]=0.2126*Hh[0][i]+0.7152*Hh[1][i]+0.0722*Hh[2][i]; n+=L[i]; }
    const pct=q=>{ let a=0; for(let i=0;i<256;i++){ a+=L[i]; if(a>=q*n) return i/255; } return 1; };
    let mean=0; for(let i=0;i<256;i++) mean+=L[i]*Math.pow(i/255,2.2); mean/=n; const p01=pct(0.005), p99=pct(0.995);
    v={exposure:+clamp(Math.log2(0.18/Math.max(mean,1e-3))*0.6,-2.5,2.5).toFixed(2),contrast:Math.round(clamp((0.75-(p99-p01))*60,-20,30)),
       highlights:Math.round(clamp(-(p99-0.85)*200,-70,0)),shadows:Math.round(clamp((0.2-p01)*150,0,50))}[k];
  }
  S[k]=v; syncUI(); schedule(true); commit('Auto '+label); toast(`Auto ${label}: ${v}`,1200); return v;
}
window.autoSlider=autoKey;
const AUTOK={Exposure:'exposure',Contrast:'contrast',Highlights:'highlights',Shadows:'shadows',Whites:'whites',Blacks:'blacks'};
document.addEventListener('dblclick',e=>{ if(!e.shiftKey) return; const row=e.target.closest&&e.target.closest('.sl'); if(!row) return;
  const b=findSec('Basic'); if(!b||!b.contains(row)) return; const lab=(row.querySelector('label')?.textContent||'').trim(); const k=AUTOK[lab]; if(!k) return;
  e.stopPropagation(); e.preventDefault(); autoKey(k,lab); },true);
{ const b=findSec('Basic'), r=rowOf(b,'Blacks'); if(r){ const d=document.createElement('div'); d.className='row autoWB';
  d.innerHTML='<button class="btn" id="autoWhites" title="Set Whites so highlights just clip (Shift+double-click Whites)">Auto Whites</button><button class="btn" id="autoBlacks" title="Set Blacks so shadows just clip (Shift+double-click Blacks)">Auto Blacks</button><span class="hint" style="flex:1;min-width:140px">Shift+double-click a tone label to auto-set just that slider.</span>';
  r.after(d); $('#autoWhites').onclick=()=>autoKey('whites','Whites'); $('#autoBlacks').onclick=()=>autoKey('blacks','Blacks'); } }

/* ===== Vignette Style + Highlights (Effects → Post-crop vignette) ===== */
{ const ef=findSec('Effects'), r=rowOf(ef,'Feather'); if(r){ const box=document.createElement('div'); box.className='vigX';
  box.innerHTML=`<div class="sl"><label>Style</label><select id="vigStyle" style="grid-column:span 2"><option value="0">Highlight Priority</option><option value="1">Colour Priority</option><option value="2">Paint Overlay</option></select></div>`;
  r.after(box); const hs=slider(box,'Highlights',s=>s.vigHi||0,(s,v)=>s.vigHi=v,0,100,1,null,'Vignette highlights');
  const sel=$('#vigStyle'); const hiRow=box.lastElementChild;
  const sync=()=>{ if(!S) return; sel.value=String(S.vigStyle||0); hiRow.style.opacity=(+S.vigStyle===2)?0.4:1; };
  sel.onchange=()=>{ if(!S) return; S.vigStyle=+sel.value; sync(); schedule(true); commit('Vignette style'); };
  if(typeof syncers!=='undefined') syncers.push(sync); } }

/* ===== Preset Amount (Lightroom-style 0–200% fade/boost of the last applied preset) ===== */
let pa=null;
function mixV(b,a,t){
  if(typeof a==='number'&&typeof b==='number'){ let v=b+(a-b)*t; if(t>1){ const lo=Math.min(a,b), hi=Math.max(a,b);
      const [L,Hh]= lo>=0&&hi<=1?[0,1]: lo>=-100&&hi<=100?[-100,100]: lo>=0&&hi<=360?[0,360]: [lo-Math.abs(hi-lo),hi+Math.abs(hi-lo)]; v=clamp(v,L,Hh); }
    return Number.isInteger(a)&&Number.isInteger(b)?Math.round(v):+v.toFixed(4); }
  if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length) return a.map((x,i)=>mixV(b[i],x,t));
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){ const o={}; for(const k of new Set([...Object.keys(a),...Object.keys(b)])){ o[k]= (k in a)? ((k in b)? mixV(b[k],a[k],t) : (t>0?cl(a[k]):undefined)) : cl(b[k]); } return o; }
  return t>0?cl(a):cl(b);
}
const prSec=findSec('Presets'); const pab=document.createElement('div'); pab.id='paBox'; pab.hidden=true;
pab.innerHTML=`<div class="hint" id="paName"></div><div class="sl"><label title="Double-click for 100%">Amount</label><input type="range" id="paAmt" min="0" max="200" step="1" value="100"><input type="number" id="paAmtN" min="0" max="200" step="1" value="100"></div>`;
if(prSec) prSec.querySelector('.secbody').prepend(pab);
function hidePA(){ pa=null; pab.hidden=true; }
function showPA(){ pab.hidden=false; $('#paName').textContent=`Preset amount — “${pa.name}”`; $('#paAmt').value=pa.amt; $('#paAmtN').value=pa.amt; }
function setAmt(v,doCommit){ if(!pa||!S||pa.id!==cur) return; v=clamp(Math.round(+v||0),0,200); pa.amt=v; $('#paAmt').value=v; $('#paAmtN').value=v;
  const out=mixV(pa.base,pa.target,v/100);
  for(const k of Object.keys(S)){ if(JSON.stringify(S[k])!==JSON.stringify(pa.last[k])) out[k]=S[k]; } // keep edits made after the preset
  GEOM.forEach(k=>out[k]=S[k]); for(const k of Object.keys(out)) if(out[k]===undefined) delete out[k];
  S=fillDefaults(out); curPhoto().settings=S; pa.last=clone(S); syncUI(); schedule(true); if(doCommit) commit(`Preset amount ${v}%`);
}
window.setPresetAmount=setAmt;
$('#paAmt').oninput=e=>setAmt(e.target.value,false); $('#paAmt').onchange=e=>setAmt(e.target.value,true); $('#paAmtN').onchange=e=>setAmt(e.target.value,true);
pab.querySelector('label').ondblclick=()=>setAmt(100,true);
const _ap=window.applyPreset;
if(typeof _ap==='function') window.applyPreset=function(ps,name){ const base=S?clone(S):null; const r=_ap.apply(this,arguments);
  if(base&&S&&!/^Paste/i.test(name||'')){ pa={id:cur,name:name||'Preset',base,target:clone(S),last:clone(S),amt:100}; showPA(); } return r; };

/* ===== Contact Sheet (Lightroom Print module, simplified) ===== */
const PAGES={a4:[210,297,'A4'],letter:[215.9,279.4,'Letter'],a3:[297,420,'A3'],'4x6':[101.6,152.4,'4×6 in'],sq:[200,200,'Square 20 cm']};
let csOpt=Object.assign({page:'a4',orient:'p',dpi:isTouch?150:300,cols:4,rows:5,margin:10,gap:4,bg:'#ffffff',cap:'name',fit:'fit',title:'Contact sheet'},JSON.parse(localStorage.getItem('ps.cs')||'{}'));
function csList(){ return sel.size? photos.filter(p=>sel.has(p.id)) : filtered(); }
function openCS(){
  const list=csList(); if(!list.length) return toast('No photos to lay out');
  const o=csOpt, opt=(v,t,cur)=>`<option value="${v}"${String(cur)===String(v)?' selected':''}>${t}</option>`;
  dlg(`<h3>Contact sheet — ${list.length} photo${list.length>1?'s':''}</h3>
   <div class="csGrid">
   <div class="f"><label>Page</label><select id="csPage">${Object.entries(PAGES).map(([k,v])=>opt(k,v[2],o.page)).join('')}</select></div>
   <div class="f"><label>Orientation</label><select id="csOr">${opt('p','Portrait',o.orient)}${opt('l','Landscape',o.orient)}</select></div>
   <div class="f"><label>Columns</label><input id="csCols" type="number" min="1" max="10" value="${o.cols}"></div>
   <div class="f"><label>Rows</label><input id="csRows" type="number" min="1" max="12" value="${o.rows}"></div>
   <div class="f"><label>Margin (mm)</label><input id="csMar" type="number" min="0" max="40" value="${o.margin}"></div>
   <div class="f"><label>Gap (mm)</label><input id="csGap" type="number" min="0" max="20" value="${o.gap}"></div>
   <div class="f"><label>Resolution</label><select id="csDpi">${opt(150,'150 ppi',o.dpi)}${opt(300,'300 ppi',o.dpi)}</select></div>
   <div class="f"><label>Background</label><select id="csBg">${opt('#ffffff','White',o.bg)}${opt('#e6e6e6','Light grey',o.bg)}${opt('#202020','Dark',o.bg)}${opt('#000000','Black',o.bg)}</select></div>
   <div class="f"><label>Captions</label><select id="csCap">${opt('none','None',o.cap)}${opt('name','Filename',o.cap)}${opt('rate','Filename + rating',o.cap)}${opt('exif','Filename + camera settings',o.cap)}</select></div>
   <div class="f"><label>Cells</label><select id="csFit">${opt('fit','Fit whole photo',o.fit)}${opt('fill','Fill cell (crop)',o.fit)}</select></div>
   </div>
   <div class="f"><label>Title (optional)</label><input id="csTitle" value="${esc(o.title)}" maxlength="80"></div>
   <div class="hint" id="csInfo"></div>
   <div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="csGo">Create</button></div>`);
  const info=()=>{ const r=readCS(); const per=r.cols*r.rows; const [W,Hh]=pageMM(r); $('#csInfo').textContent=`${Math.ceil(list.length/per)} page(s) · ${per} per page · ${Math.round(W/25.4*r.dpi)}×${Math.round(Hh/25.4*r.dpi)} px`; };
  $$('#dlg input,#dlg select').forEach(x=>x.addEventListener('input',info)); info();
  $('#csGo').onclick=async()=>{ csOpt=readCS(); localStorage.setItem('ps.cs',JSON.stringify(csOpt)); closeDlg(); await makeCS(list,csOpt); };
}
function readCS(){ const n=(id,a,b,d)=>clamp(Math.round(+$(id).value||d),a,b);
  return {page:$('#csPage').value,orient:$('#csOr').value,dpi:+$('#csDpi').value,cols:n('#csCols',1,10,4),rows:n('#csRows',1,12,5),margin:n('#csMar',0,40,10),gap:n('#csGap',0,20,4),bg:$('#csBg').value,cap:$('#csCap').value,fit:$('#csFit').value,title:$('#csTitle').value.trim()}; }
function pageMM(o){ const [a,b]=PAGES[o.page]||PAGES.a4; return o.orient==='l'?[Math.max(a,b),Math.min(a,b)]:[Math.min(a,b),Math.max(a,b)]; }
function capText(p,o){ if(o.cap==='none') return ['','']; const n=p.name; if(o.cap==='name') return [n,''];
  if(o.cap==='rate') return [n,(p.rating?'★'.repeat(p.rating):'')+(p.flag===1?'  ✦ Pick':p.flag===-1?'  ✕ Reject':'')];
  const e=p.exif||{}; const ex=[e.Model,e.FNumber?'f/'+(+e.FNumber).toFixed(1).replace(/\.0$/,''):'',e.ExposureTime?(e.ExposureTime<1?'1/'+Math.round(1/e.ExposureTime):e.ExposureTime)+'s':'',e.ISO?'ISO '+e.ISO:'',e.FocalLength?Math.round(e.FocalLength)+'mm':''].filter(Boolean).join(' · ');
  return [n,ex]; }
async function makeCS(list,o){
  const t0=performance.now(); const [Wmm,Hmm]=pageMM(o); const k=o.dpi/25.4; const W=Math.round(Wmm*k), Hh=Math.round(Hmm*k);
  const M=o.margin*k, G=o.gap*k, titleH=o.title?9*k:0, capH=o.cap==='none'?0:(o.cap==='name'?4.2*k:7.6*k), footH=4*k;
  const cw=(W-2*M-(o.cols-1)*G)/o.cols, ch=(Hh-2*M-titleH-footH-(o.rows-1)*G)/o.rows, ih=ch-capH;
  if(cw<20||ih<20) return toast('Too many rows/columns for this page size',3000);
  const per=o.cols*o.rows, np=Math.ceil(list.length/per), pages=[]; const dark=/^#[0-3]/.test(o.bg); const fg=dark?'#e8e8e8':'#222', fg2=dark?'#aaa':'#666';
  try{
    for(let pi=0;pi<np;pi++){ const c=document.createElement('canvas'); c.width=W; c.height=Hh; const g=c.getContext('2d'); g.fillStyle=o.bg; g.fillRect(0,0,W,Hh);
      if(o.title){ g.fillStyle=fg; g.font=`600 ${Math.round(5*k)}px -apple-system,Segoe UI,Helvetica,Arial,sans-serif`; g.textBaseline='middle'; g.fillText(o.title,M,M+titleH*0.45); }
      const items=list.slice(pi*per,(pi+1)*per);
      for(let i=0;i<items.length;i++){ const p=items[i], gi=pi*per+i; busy(true,`Contact sheet: rendering ${gi+1} of ${list.length}…`); await nextFrame();
        const cx=M+(i%o.cols)*(cw+G), cy=M+titleH+Math.floor(i/o.cols)*(ch+G);
        let bmp=null; try{ const r=await renderExport(p,{size:'edge',edge:Math.ceil(Math.max(cw,ih)*1.05),fmt:'jpeg',q:92,exif:false}); bmp=await createImageBitmap(r.blob); }catch(e){ console.error(e); }
        let capY=cy+ih+0.8*k;
        if(bmp){ const s=o.fit==='fill'?Math.max(cw/bmp.width,ih/bmp.height):Math.min(cw/bmp.width,ih/bmp.height); const dw=bmp.width*s, dh=bmp.height*s;
          g.save(); g.beginPath(); g.rect(cx,cy,cw,ih); g.clip(); g.drawImage(bmp,cx+(cw-dw)/2,cy+(ih-dh)/2,dw,dh); g.restore(); bmp.close&&bmp.close(); if(o.fit!=='fill') capY=cy+(ih+Math.min(dh,ih))/2+1.2*k; }
        else { g.fillStyle=dark?'#333':'#ddd'; g.fillRect(cx,cy,cw,ih); }
        const [a,b]=capText(p,o); if(a||b){ g.textBaseline='top'; g.textAlign='center'; const fs=Math.round(3*k);
          const fitT=(t)=>{ if(g.measureText(t).width<=cw) return t; while(t.length>3&&g.measureText(t+'…').width>cw) t=t.slice(0,-1); return t+'…'; };
          g.font=`500 ${fs}px -apple-system,Segoe UI,Helvetica,Arial,sans-serif`; g.fillStyle=fg; if(a) g.fillText(fitT(a),cx+cw/2,capY);
          g.font=`${Math.round(2.3*k)}px -apple-system,Segoe UI,Helvetica,Arial,sans-serif`; g.fillStyle=fg2; if(b) g.fillText(fitT(b),cx+cw/2,capY+fs*1.25); g.textAlign='left'; } }
      g.fillStyle=fg2; g.font=`${Math.round(2.3*k)}px -apple-system,Segoe UI,Helvetica,Arial,sans-serif`; g.textBaseline='bottom'; g.textAlign='right';
      g.fillText(`${np>1?`Page ${pi+1} of ${np} · `:''}${new Date().toLocaleDateString('en-GB')}`,W-M,Hh-M*0.5); g.textAlign='left';
      const blob=await canvasBlob(c,'image/jpeg',0.92); pages.push({name:`contact-sheet${np>1?'-'+(pi+1):''}.jpg`,blob,w:W,h:Hh}); c.width=c.height=1; }
  }catch(e){ console.error(e); busy(false); return toast('Contact sheet failed: '+e.message,4000); }
  busy(false); window.__cs={pages:pages.length,w:W,h:Hh,ms:Math.round(performance.now()-t0),photos:list.length,sizes:pages.map(p=>p.blob.size)}; showCS(pages);
}
function showCS(pages){
  const url=URL.createObjectURL(pages[0].blob); const files=pages.map(f=>new File([f.blob],f.name,{type:'image/jpeg'}));
  const canShare=navigator.canShare&&navigator.canShare({files});
  dlg(`<h3>Contact sheet ready</h3><p>${pages.length} page${pages.length>1?'s':''} · ${pages[0].w}×${pages[0].h} px</p><img id="csPrev" src="${url}" alt="Contact sheet preview" style="width:100%;max-height:52vh;object-fit:contain;background:#111;border-radius:6px">
   <div class="btns">${canShare?'<button class="btn" id="csShare">Share / Save</button>':''}<button class="btn" id="csPrint">Print</button><button class="btn primary" id="csDl">Download${pages.length>1?' ZIP':''}</button></div>`);
  $('#csDl').onclick=async()=>{ const f=pages.length>1?{name:'contact-sheets.zip',blob:await makeZip(pages)}:pages[0]; const a=document.createElement('a'); a.href=URL.createObjectURL(f.blob); a.download=f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),60000); };
  if(canShare) $('#csShare').onclick=async()=>{ try{ await navigator.share({files}); }catch(e){} };
  $('#csPrint').onclick=()=>{ const fr=document.createElement('iframe'); fr.style.cssText='position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(fr);
    const urls=pages.map(p=>URL.createObjectURL(p.blob)); const d=fr.contentDocument; d.open(); d.write(`<!doctype html><html><head><style>@page{margin:0}html,body{margin:0}img{display:block;width:100%;height:auto;page-break-after:always}</style></head><body>${urls.map(u=>`<img src="${u}">`).join('')}</body></html>`); d.close();
    const imgs=[...d.images]; Promise.all(imgs.map(im=>im.decode().catch(()=>{}))).then(()=>{ try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){ toast('Printing is not available here — use Download or Share'); } setTimeout(()=>{ fr.remove(); urls.forEach(URL.revokeObjectURL); },60000); }); };
}
window.openContactSheet=openCS; window.makeContactSheet=makeCS;
{ const fb=$('.filterbar'); if(fb){ const b=document.createElement('button'); b.className='btn'; b.id='csBtn'; b.textContent='Contact Sheet'; b.title='Contact sheet / print layout of the selected (or filtered) photos';
  const after=$('#slideBtn')||$('#delSel'); if(after) after.after(b); else fb.appendChild(b); b.onclick=openCS; } }

/* ===== Touch swipe between photos in Develop (fit view, no active tool) ===== */
let sw=null, touches=0;
st.addEventListener('pointerdown',e=>{ if(e.pointerType!=='touch') return; touches++; sw= touches===1?{x:e.clientX,y:e.clientY,t:Date.now()}:null; });
const swEnd=e=>{ if(e.pointerType!=='touch') return; touches=Math.max(0,touches-1); const s=sw; if(touches===0) sw=null; if(!s||e.type==='pointercancel') return;
  const dx=e.clientX-s.x, dy=e.clientY-s.y, dt=Date.now()-s.t;
  const busyTool= tool || (window.getPTool&&getPTool()) || cropOn || zoom || st.classList.contains('tooling') || st.classList.contains('picking') || (typeof cpTool!=='undefined'&&cpTool) || ($('#cmp')&&!$('#cmp').hidden);
  if(mode!=='develop'||busyTool||dt>700||Math.abs(dx)<70||Math.abs(dy)>Math.abs(dx)*0.6) return;
  step(dx<0?1:-1); window.__swipe=(window.__swipe||0)+1; };
st.addEventListener('pointerup',swEnd); st.addEventListener('pointercancel',swEnd);

/* ===== Full-screen preview (F) ===== */
function toggleFS(){
  if(mode!=='develop') return;
  const v=$('#viewer'); const fe=document.fullscreenElement||document.webkitFullscreenElement;
  if(fe){ (document.exitFullscreen||document.webkitExitFullscreen).call(document); return; }
  const req=v.requestFullscreen||v.webkitRequestFullscreen;
  if(req&&document.fullscreenEnabled!==false){ Promise.resolve(req.call(v)).catch(()=>fallback()); } else fallback();
  function fallback(){ if(window.__lr3&&__lr3.setLights){ __lr3.setLights(2); toast('Full-screen not supported here — using Lights Out (L to cycle)',2500); } }
}
window.toggleFullscreenView=toggleFS;
if(!isTouch){ const zb=$('#zoomBtn'); if(zb){ const b=document.createElement('button'); b.className='btn'; b.id='fsBtn'; b.title='Full-screen preview (F)'; b.textContent='⛶'; zb.after(b); b.onclick=toggleFS; } }
document.addEventListener('fullscreenchange',()=>{ schedule(true); });

/* ===== keys ===== */
addEventListener('keydown',e=>{
  const t=e.target; if(t.matches&&t.matches('input:not([type=range]):not([type=checkbox]),textarea,select')) return; if(!$('#modal').hidden) return;
  if(e.metaKey||e.ctrlKey||e.altKey) return; const k=e.key.toLowerCase();
  if(k==='f'&&mode==='develop'){ e.preventDefault(); toggleFS(); }
  else if(k==='a'&&mode==='develop'&&tool==='heal'){ e.preventDefault(); setVS(!vsOn); }
});

/* ===== Help ===== */
{ const hb=$('#helpBtn'); if(hb){ const o=hb.onclick; hb.onclick=ev=>{ if(typeof o==='function') o.call(hb,ev);
  setTimeout(()=>{ const tbl=$('#dlg table'); if(!tbl||tbl.dataset.lr5) return; tbl.dataset.lr5='1';
    [['F','Full-screen preview (Develop)'],['A (Spot tool)','Visualize spots'],['Shift+double-click','Auto-set one Basic tone slider'],['Swipe ← →','Next / previous photo (touch, Develop)']].forEach(([k,v])=>{
      const tr=document.createElement('tr'); tr.innerHTML=`<td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td>`; tbl.appendChild(tr); });
  },0); }; } }

window.__lr5={frameBuf,setVS,autoKey,setAmt,openCS,makeCS,toggleFS,mixV};
});
