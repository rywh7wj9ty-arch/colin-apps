'use strict';
/* Lightroom-style round 2: Colour labels, Assisted Culling, Stacks, Batch Rename (enhanced),
   Match Total Exposures, 2× Enhance upscale, Duplicate detection. */
addEventListener('DOMContentLoaded',()=>{
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABELS=['','red','yellow','green','blue','purple'];
const LABEL_HEX={red:'#e44',yellow:'#e8c020',green:'#3a8',blue:'#48c',purple:'#a6c'};
const LABEL_NAME={red:'Red',yellow:'Yellow',green:'Green',blue:'Blue',purple:'Purple'};
const selected=()=>photos.filter(p=>sel.has(p.id));
const mk=(id,t,title)=>{ const b=document.createElement('button'); b.className='btn'; b.id=id; b.textContent=t; b.title=title||''; const ref=$('#selAll'); if(ref) ref.before(b); return b; };
const dateParts=p=>{ const m=String((p.exif&&(p.exif.DateTimeOriginal||p.exif.DateTime))||'').match(/(\d{4}):(\d\d):(\d\d)/); if(m) return {yyyy:m[1],mm:m[2],dd:m[3],date:`${m[1]}-${m[2]}-${m[3]}`};
  const d=new Date(p.added||Date.now()); return {yyyy:String(d.getFullYear()),mm:String(d.getMonth()+1).padStart(2,'0'),dd:String(d.getDate()).padStart(2,'0'),date:d.toISOString().slice(0,10)}; };
const captureMs=p=>{ const s=String((p.exif&&(p.exif.DateTimeOriginal||p.exif.DateTime))||''); const m=s.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
  if(m) return Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]); return p.added||0; };

/* ===== Colour labels ===== */
const fb=$('.filterbar');
const fLab=document.createElement('select'); fLab.id='fLabel'; fLab.title='Colour label';
fLab.innerHTML=`<option value="all">Any colour</option><option value="none">No label</option>${['red','yellow','green','blue','purple'].map(c=>`<option value="${c}">${LABEL_NAME[c]}</option>`).join('')}`;
const fFlag=$('#fFlag'); if(fFlag) fFlag.after(fLab); else fb.appendChild(fLab);
fLab.addEventListener('input',()=>renderLibrary());

function setColorLabel(list,lab){ const v=lab||''; list.forEach(p=>{ p.colorLabel=v; savePhoto(p,0); }); renderLibrary(); updateDevMeta(); toast(v?`Label: ${LABEL_NAME[v]||v}`:'Colour label cleared',900); }
window.setColorLabel=setColorLabel;

function labelChip(lab){ if(!lab) return ''; return `<span class="clabel" data-lab="${esc(lab)}" title="${esc(LABEL_NAME[lab]||lab)}" style="--lc:${LABEL_HEX[lab]||'#888'}"></span>`; }

const prevUD=window.updateDevMeta; window.updateDevMeta=function(){ if(typeof prevUD==='function') prevUD(); const p=curPhoto(); if(!p) return;
  const ds=$('#devStars'); if(!ds) return; let chip=ds.querySelector('.clabel'); if(!p.colorLabel){ if(chip) chip.remove(); return; }
  if(!chip){ chip=document.createElement('span'); chip.className='clabel'; chip.style.marginLeft='6px'; ds.appendChild(chip); }
  chip.dataset.lab=p.colorLabel; chip.style.setProperty('--lc',LABEL_HEX[p.colorLabel]||'#888'); chip.title=LABEL_NAME[p.colorLabel]||p.colorLabel;
  chip.onclick=e=>{ e.stopPropagation(); const order=['','red','yellow','green','blue','purple']; const i=order.indexOf(p.colorLabel||''); setColorLabel([p],order[(i+1)%order.length]); };
};

const KEY_LAB={6:'red',7:'yellow',8:'green',9:'blue'};
addEventListener('keydown',e=>{
  const t=e.target; if(t.tagName==='INPUT'&&t.type!=='range'||t.tagName==='SELECT'||t.tagName==='TEXTAREA'||!$('#modal').hidden) return;
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  const list=typeof targets==='function'?targets():selected(); if(!list.length) return;
  if(e.shiftKey&&e.key==='0'){ e.preventDefault(); const cur=list[0].colorLabel; setColorLabel(list,cur==='purple'?'':'purple'); return; }
  if(!e.shiftKey&&KEY_LAB[e.key]){ e.preventDefault(); const lab=KEY_LAB[e.key]; const same=list.every(p=>p.colorLabel===lab); setColorLabel(list,same?'':lab); }
});

/* ===== matchPhoto: colour filter + label: token + stack collapse ===== */
let collapseStacks=localStorage.getItem('ps.stackCollapse')!=='0';
const expandedStacks=new Set();
const prevMP=window.matchPhoto;
window.matchPhoto=(p,q)=>{
  const fl=fLab.value; if(fl==='none'&&p.colorLabel) return false; if(fl&&fl!=='all'&&fl!=='none'&&p.colorLabel!==fl) return false;
  if(collapseStacks&&p.stackId&&!p.stackTop&&!expandedStacks.has(p.stackId)) return false;
  q=(q||'').trim();
  if(q){ const toks=q.split(/\s+/); const rest=[]; for(const t of toks){ const m=t.match(/^label:(.+)$/i); if(m){ const v=m[1].toLowerCase(); if(v==='none'||v===''||v==='-'){ if(p.colorLabel) return false; } else if((p.colorLabel||'')!==v) return false; continue; }
    if(/^stacked$/i.test(t)){ if(!p.stackId) return false; continue; }
    rest.push(t); } q=rest.join(' '); }
  return typeof prevMP==='function'?prevMP(p,q):!q||p.name.toLowerCase().includes(q.toLowerCase());
};

/* ===== renderLibrary: colour badges + stack count ===== */
const prevRL=window.renderLibrary;
window.renderLibrary=function(){ prevRL();
  $$('#grid .cell').forEach(c=>{ const p=photos.find(x=>x.id===c.dataset.id); if(!p) return;
    if(p.colorLabel&&!c.querySelector('.clabel')){ const b=document.createElement('span'); b.className='clabel corner'; b.style.setProperty('--lc',LABEL_HEX[p.colorLabel]||'#888'); b.title=LABEL_NAME[p.colorLabel]||p.colorLabel; c.appendChild(b); }
    if(p.stackId&&p.stackTop){ const n=photos.filter(x=>x.stackId===p.stackId).length; if(n>1&&!c.querySelector('.stackb')){ const b=document.createElement('button'); b.className='stackb'; b.type='button'; b.textContent='▤ '+n; b.title=expandedStacks.has(p.stackId)?'Collapse stack':'Expand stack ('+n+')';
      b.onclick=e=>{ e.stopPropagation(); if(expandedStacks.has(p.stackId)) expandedStacks.delete(p.stackId); else expandedStacks.add(p.stackId); renderLibrary(); }; c.appendChild(b); } }
  });
};

/* ===== Assisted culling ===== */
async function thumbImageData(p,max=160){ try{ const url=thumbURL(p); const im=new Image(); im.src=url; await im.decode(); const s=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
  const w=Math.max(8,Math.round(im.naturalWidth*s)), h=Math.max(8,Math.round(im.naturalHeight*s)); const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(im,0,0,w,h); return g.getImageData(0,0,w,h); }catch(e){ return null; } }
function scoreExposure(id){ const d=id.data,n=d.length/4; let dark=0,bright=0,mid=0,sum=0; for(let i=0;i<d.length;i+=4){ const L=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255; sum+=L; if(L<0.08) dark++; else if(L>0.92) bright++; else mid++; }
  const mean=sum/n; const clip=(dark+bright)/n; let exp=1-Math.min(1,Math.abs(mean-0.42)*2.2)-clip*0.8; return {exp:+Math.max(0,Math.min(1,exp)).toFixed(3),mean:+mean.toFixed(3),clip:+clip.toFixed(3)}; }
function scoreSharp(id){ const {data:d,width:w,height:h}=id; const gray=new Float32Array(w*h); for(let i=0,j=0;i<d.length;i+=4,j++) gray[j]=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
  let sum=0,sum2=0,n=0; for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=y*w+x; const lap=gray[i]*4-gray[i-1]-gray[i+1]-gray[i-w]-gray[i+w]; sum+=lap; sum2+=lap*lap; n++; }
  const v=n?(sum2-sum*sum/n)/n:0; // variance of Laplacian
  const sharp=Math.min(1,Math.log10(1+v)/3.2); return {sharp:+Math.max(0,sharp).toFixed(3),var:+v.toFixed(1)}; }
async function scoreFaces(p,id){ if(!window.dxoEstimate||!dxoEstimate.detectFaces) return null;
  try{ // only when this photo is current and faces already known
    if(p.id===cur&&S&&Array.isArray(S.faces)&&S.faces.length) return S.faces.length;
    return null; }catch(_){ return null; } }

mk('cullBtn','Cull…','Assisted culling: exposure + sharpness heuristics').onclick=async()=>{
  let list=selected(); if(!list.length) list=filtered(); if(!list.length) return toast('No photos to cull');
  busy(true,`Scoring ${list.length} photo(s)…`); const rows=[];
  try{ for(let i=0;i<list.length;i++){ const p=list[i]; busy(true,`Scoring ${i+1}/${list.length}…`); const id=await thumbImageData(p,144); if(!id){ rows.push({p,exp:0.5,sharp:0.5,face:null}); continue; }
    const e=scoreExposure(id), s=scoreSharp(id); const face=await scoreFaces(p,id); const ms=performance.now();
    p.cullScore={exp:e.exp,sharp:s.sharp,face:face==null?undefined:face,mean:e.mean,ms:Math.round(ms)}; savePhoto(p,0); rows.push({p,...e,...s,face}); if(i%4===3) await nextFrame(); }
  } finally{ busy(false); }
  const redraw=()=>{ const te=+$('#cuExp').value/100, ts=+$('#cuSh').value/100; const needFace=$('#cuFace').checked;
    const picks=rows.filter(r=>r.exp>=te&&r.sharp>=ts&&(!needFace||(r.face!=null&&r.face>0))); const rejects=rows.filter(r=>!picks.includes(r));
    $('#cuSum').textContent=`Would pick ${picks.length} · reject ${rejects.length} of ${rows.length} (heuristic — not Adobe cloud AI)`;
    $('#cuPrev').innerHTML=picks.slice(0,8).map(r=>`<div class="cullRow"><img src="${thumbURL(r.p)}"><span>${esc(r.p.name)}<small>exp ${r.exp} · sharp ${r.sharp}${r.face!=null?` · faces ${r.face}`:''}</small></span></div>`).join('')+(picks.length>8?`<div class="hint">+${picks.length-8} more picks</div>`:'');
    window.__cullPreview={picks:picks.length,rejects:rejects.length,te,ts}; return {picks,rejects}; };
  dlg(`<h3>Assisted culling · ${list.length} photo(s)</h3>
    <p class="hint">Scores use thumbnail exposure (midtone bias) and Laplacian sharpness. Face count is used only when already detected on the open photo. This is a local heuristic, not Adobe’s Assisted Culling.</p>
    <div class="f"><label>Exposure pickiness <b id="cuExpV">50</b></label><input type="range" id="cuExp" min="0" max="90" value="45"></div>
    <div class="f"><label>Sharpness pickiness <b id="cuShV">50</b></label><input type="range" id="cuSh" min="0" max="90" value="35"></div>
    <label class="chk"><input type="checkbox" id="cuFace"> Require face (only where already detected)</label>
    <label class="chk"><input type="checkbox" id="cuStars" checked> Also set ★★★★ on picks / ★ on rejects</label>
    <div class="hint" id="cuSum"></div><div id="cuPrev" class="cullPrev"></div>
    <div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn" id="cuRejOnly">Reject only</button><button class="btn primary" id="cuApply">Apply picks & rejects</button></div>`);
  const syncL=()=>{ $('#cuExpV').textContent=$('#cuExp').value; $('#cuShV').textContent=$('#cuSh').value; redraw(); };
  ['#cuExp','#cuSh','#cuFace'].forEach(s=>$(s).oninput=syncL); syncL();
  const apply=(mode)=>{ const {picks,rejects}=redraw(); const stars=$('#cuStars').checked;
    for(const r of picks){ r.p.flag=1; if(stars) r.p.rating=Math.max(r.p.rating||0,4); savePhoto(r.p,0); }
    for(const r of rejects){ r.p.flag=-1; if(stars&&mode!=='pickonly') r.p.rating=r.p.rating||1; savePhoto(r.p,0); }
    closeDlg(); renderLibrary(); toast(`Culled: ${picks.length} pick(s), ${rejects.length} reject(s)`); window.__culled={picks:picks.length,rejects:rejects.length}; };
  $('#cuApply').onclick=()=>apply('both'); $('#cuRejOnly').onclick=()=>{ const {picks,rejects}=redraw(); for(const r of rejects){ r.p.flag=-1; savePhoto(r.p,0); } closeDlg(); renderLibrary(); toast(`Rejected ${rejects.length} (picks untouched)`); };
};

/* ===== Stacks ===== */
function stackHash(id){ if(!id) return ''; const {data:d,width:w,height:h}=id; const bw=8,bh=8; let s='';
  for(let by=0;by<bh;by++) for(let bx=0;bx<bw;bx++){ let R=0,G=0,B=0,n=0; const x0=(bx*w/bw)|0,x1=(((bx+1)*w/bw)|0), y0=(by*h/bh)|0,y1=(((by+1)*h/bh)|0);
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*w+x)*4; R+=d[i]; G+=d[i+1]; B+=d[i+2]; n++; }
    s+=String.fromCharCode(48+Math.round((R/n)/32),48+Math.round((G/n)/32),48+Math.round((B/n)/32)); } return s; }
function hashDist(a,b){ if(!a||!b||a.length!==b.length) return 99; let d=0; for(let i=0;i<a.length;i++) d+=Math.abs(a.charCodeAt(i)-b.charCodeAt(i)); return d/(a.length*7); }

function applyStacks(groups){ let n=0; for(const g of groups){ if(g.length<2) continue; const sid='st'+uid(); g.sort((a,b)=>(b.rating||0)-(a.rating||0)||captureMs(a)-captureMs(b));
  g.forEach((p,i)=>{ p.stackId=sid; p.stackTop=i===0; savePhoto(p,0); }); n++; } return n; }
function unstack(list){ const ids=new Set(list.map(p=>p.stackId).filter(Boolean)); let n=0;
  for(const p of photos){ if(p.stackId&&(ids.has(p.stackId)||list.includes(p))){ p.stackId=undefined; p.stackTop=undefined; savePhoto(p,0); n++; } } return n; }

mk('stackBtn','Stack…','Stack by capture time and/or visual similarity').onclick=()=>{
  const list=selected().length?selected():filtered();
  dlg(`<h3>Stack photos</h3>
    <label class="chk"><input type="checkbox" id="stTime" checked> By capture time (within <input type="number" id="stSec" value="2" min="0.5" max="60" step="0.5" style="width:4em"> seconds)</label>
    <label class="chk"><input type="checkbox" id="stVis"> By visual similarity (thumbnail colour blocks)</label>
    <div class="hint">Uses EXIF DateTimeOriginal when present, otherwise date added. Visual similarity is a coarse local hash — not Adobe’s stack AI.</div>
    <div class="row"><button class="btn" id="stCollapse">${collapseStacks?'Collapse stacks: On':'Collapse stacks: Off'}</button><button class="btn" id="stUn">Unstack selected</button></div>
    <div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="stGo">Stack ${list.length} photo(s)</button></div>`);
  $('#stCollapse').onclick=()=>{ collapseStacks=!collapseStacks; localStorage.setItem('ps.stackCollapse',collapseStacks?'1':'0'); $('#stCollapse').textContent=collapseStacks?'Collapse stacks: On':'Collapse stacks: Off'; renderLibrary(); };
  $('#stUn').onclick=()=>{ const L=selected(); if(!L.length) return toast('Select stacked photos first'); const n=unstack(L); closeDlg(); renderLibrary(); toast(`Unstacked ${n} photo(s)`); };
  $('#stGo').onclick=async()=>{ const byT=$('#stTime').checked, byV=$('#stVis').checked, sec=+$('#stSec').value||2; if(!byT&&!byV) return toast('Tick at least one method');
    closeDlg(); busy(true,'Stacking…'); try{
      let groups=[];
      if(byT){ const sorted=[...list].sort((a,b)=>captureMs(a)-captureMs(b)); let cur=[]; let last=-1e18;
        for(const p of sorted){ const t=captureMs(p); if(!cur.length||(t-last)<=sec*1000) cur.push(p); else { if(cur.length>1) groups.push(cur); cur=[p]; } last=t; }
        if(cur.length>1) groups.push(cur); }
      if(byV){ const hashes=new Map(); for(const p of list){ const id=await thumbImageData(p,64); hashes.set(p.id,id?stackHash(id):''); if(hashes.size%8===0) await nextFrame(); }
        const used=new Set(); const vgroups=[];
        for(const p of list){ if(used.has(p.id)) continue; const h=hashes.get(p.id); if(!h) continue; const g=[p]; used.add(p.id);
          for(const q of list){ if(used.has(q.id)) continue; if(hashDist(h,hashes.get(q.id))<0.12){ g.push(q); used.add(q.id); } }
          if(g.length>1) vgroups.push(g); }
        if(byT&&groups.length){ // keep time groups; add visual groups for photos not already stacked
          const taken=new Set(groups.flatMap(g=>g.map(p=>p.id)));
          for(const g of vgroups){ const fresh=g.filter(p=>!taken.has(p.id)); if(fresh.length>1){ groups.push(fresh); fresh.forEach(p=>taken.add(p.id)); } }
        } else if(!byT) groups=vgroups;
      }
      const n=applyStacks(groups); renderLibrary(); toast(n?`Created ${n} stack(s)`:'No groups of 2+ found'); window.__stacked=n;
    } finally{ busy(false); } };
};

const stToggle=document.createElement('label'); stToggle.className='chk'; stToggle.id='stackCollapseLbl'; stToggle.innerHTML=`<input type="checkbox" id="stackCollapse" ${collapseStacks?'checked':''}> Collapse stacks`;
$('#selAll')&&$('#selAll').before(stToggle);
$('#stackCollapse').onchange=e=>{ collapseStacks=e.target.checked; localStorage.setItem('ps.stackCollapse',collapseStacks?'1':'0'); expandedStacks.clear(); renderLibrary(); };

/* ===== Batch rename (enhance existing Rename…) ===== */
function bindRename(){ const rb=$('#renameBtn'); if(!rb) return; rb.onclick=()=>{
  const list=sel.size?photos.filter(p=>sel.has(p.id)):filtered(); if(!list.length) return toast('Nothing selected');
  dlg(`<h3>Batch rename ${list.length} photo(s)</h3>
    <div class="f"><label>Template <small>{name} {n} {nnn} {date} {yyyy} {mm} {dd} {camera} {rating} {label}</small></label>
    <input id="rnT" value="${esc(localStorage.getItem('ps.rnT')||'{yyyy}{mm}{dd}_{nnn}')}"></div>
    <div class="grid2"><div class="f"><label>Start number</label><input type="number" id="rnS" value="1" min="0"></div>
    <div class="f"><label>Pad digits (for {n})</label><input type="number" id="rnD" value="1" min="1" max="6"></div></div>
    <div class="rnTable wrap" id="rnPrev"></div>
    <div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn primary" id="rnGo">Rename</button></div>`);
  const mk=(p,i)=>{ const ext=(p.name.match(/\.[^.]+$/)||[''])[0]; const base=p.name.replace(/\.[^.]+$/,''); const e=p.exif||{}; const dp=dateParts(p); const start=+$('#rnS').value||0; const pad=+$('#rnD').value||1; const seq=start+i;
    const nnn=String(seq).padStart(3,'0'); const n=String(seq).padStart(pad,'0');
    return ($('#rnT').value||'{name}').replace(/\{name\}/g,base).replace(/\{nnn\}/g,nnn).replace(/\{n\}/g,n)
      .replace(/\{date\}/g,dp.date).replace(/\{yyyy\}/g,dp.yyyy).replace(/\{mm\}/g,dp.mm).replace(/\{dd\}/g,dp.dd)
      .replace(/\{camera\}/g,String(e.Model||'camera').replace(/\s+/g,'-'))
      .replace(/\{rating\}/g,String(p.rating||0)).replace(/\{label\}/g,p.colorLabel||'none')
      .replace(/\{seq\}/g,nnn).replace(/\{iso\}/g,'ISO'+(e.ISO||'')).replace(/\{lens\}/g,String(e.LensModel||'').replace(/\s+/g,'-'))
      .replace(/[\\/:*?"<>|]/g,'_')+ext; };
  const pv=()=>{ $('#rnPrev').innerHTML=`<table><tr><th>Before</th><th>After</th></tr>${list.slice(0,12).map((p,i)=>`<tr><td>${esc(p.name)}</td><td><b>${esc(mk(p,i))}</b></td></tr>`).join('')}</table>${list.length>12?`<div class="hint">Showing 12 of ${list.length}</div>`:''}`; };
  ['#rnT','#rnS','#rnD'].forEach(s=>$(s).oninput=pv); pv();
  $('#rnGo').onclick=()=>{ localStorage.setItem('ps.rnT',$('#rnT').value); list.forEach((p,i)=>{ p.name=mk(p,i); savePhoto(p,0); }); closeDlg(); renderLibrary(); toast(`Renamed ${list.length} photo(s)`); window.__renamed=list.map(p=>p.name); };
}; }
bindRename(); setTimeout(bindRename,200);

/* ===== Match Total Exposures ===== */
function measureLuma(st,s){ const os=Engine.outSize(st,s); const k=Math.min(1,96/Math.max(os.w,os.h)); const w=Math.max(8,Math.round(os.w*k)), h=Math.max(8,Math.round(os.h*k));
  engine.process(st,s); const px=engine.readOut(st,s,w,h,{}); const Ls=[]; for(let i=0;i<px.length;i+=4) Ls.push((0.2126*px[i]+0.7152*px[i+1]+0.0722*px[i+2])/255);
  Ls.sort((a,b)=>a-b); return Ls[Math.min(Ls.length-1,Ls.length>>1)]||0.18; }
async function measurePhotoLuma(p,s){ const blob=await blobGet(p.rawStored?p.id+':prev':p.id); const img=await decode(blob); const c=scaledCanvas(img,160); if(img.close) try{img.close();}catch(_){}
  const st=engine.makeState(c,{fullW:p.w||c.width,fullH:p.h||c.height}); try{ return measureLuma(st,fillDefaults(clone(s))); } finally{ engine.freeState(st); } }
async function matchTotalExposures(){ const src=mode==='develop'?curPhoto():(photos.find(p=>p.id===lastSel)||selected()[0]); if(!src) return toast('Open or select a source photo');
  const targets=selected().filter(p=>p.id!==src.id); if(!targets.length) return toast('Select other photos to match to the active one');
  busy(true,'Match Total Exposures…'); try{
    const sSrc=src.id===cur&&S?S:src.settings; let targetMed;
    if(src.id===cur&&engine.state) targetMed=measureLuma(engine.state,sSrc); else targetMed=await measurePhotoLuma(src,sSrc);
    let n=0; for(const p of targets){ busy(true,`Matching ${++n}/${targets.length}…`); const s=fillDefaults(clone(p.settings)); let med=await measurePhotoLuma(p,s);
      for(let it=0;it<5;it++){ const adj=Math.log2(Math.max(0.05,targetMed)/Math.max(0.05,med))*0.85; s.exposure=+Math.max(-5,Math.min(5,(s.exposure||0)+adj)).toFixed(2);
        med=await measurePhotoLuma(p,s); if(Math.abs(med-targetMed)<0.015) break; }
      if(med>targetMed+0.04) s.whites=Math.max(-40,Math.min(30,(s.whites||0)-8));
      if(med<targetMed-0.04) s.blacks=Math.max(-40,Math.min(30,(s.blacks||0)+6));
      p.settings=s; p.history=(p.history||[]).slice(0,(p.hIdx??0)+1); p.history.push({label:'Match Total Exposures',s:clone(s)}); p.hIdx=p.history.length-1; p.edited=true; savePhoto(p,0);
      if(p.id===cur){ Object.assign(S,{exposure:s.exposure,whites:s.whites,blacks:s.blacks}); syncUI(); schedule(true); }
      await nextFrame(); }
    if(mode==='library') renderLibrary(); toast(`Matched exposure on ${targets.length} photo(s) → median ≈ ${targetMed.toFixed(2)}`); window.__matchExp={n:targets.length,target:targetMed};
  }catch(e){ console.error(e); toast('Match failed: '+(e.message||e),4000); } finally{ busy(false); } }
window.matchTotalExposures=matchTotalExposures;
{ const q=$('.quick'); if(q){ const b=document.createElement('button'); b.className='btn'; b.id='matchExpBtn'; b.textContent='Match exp'; b.title='Match Total Exposures: match other selected photos to this one’s median luminance'; q.appendChild(b); b.onclick=matchTotalExposures; }
  const sy=$('#syncBtn'); if(sy){ const b=document.createElement('button'); b.className='btn'; b.id='matchExpLib'; b.textContent='Match exp'; b.title='Match Total Exposures'; sy.after(b); b.onclick=matchTotalExposures; } }

/* ===== Enhance 2× (high-quality upscale) ===== */
async function enhance2x(){ const p=mode==='develop'?curPhoto():(selected()[0]||curPhoto()); if(!p) return toast('Select a photo to enhance');
  busy(true,'Enhance 2× (high-quality upscale)…'); try{
    const blob=await blobGet(p.rawStored?p.id+':prev':p.id); const img=await decode(blob); const {w:sw,h:sh}=typeof dimsOf==='function'?dimsOf(img):{w:img.naturalWidth||img.width,h:img.naturalHeight||img.height};
    // Prefer working from a reasonably large decoded source (cap for memory on phones)
    const maxIn=isTouch?2400:4500; const src=scaledCanvas(img,maxIn); if(img.close) try{img.close();}catch(_){}
    const W=src.width*2, H=src.height*2; const out=document.createElement('canvas'); out.width=W; out.height=H;
    const g=out.getContext('2d'); g.imageSmoothingEnabled=true; g.imageSmoothingQuality='high'; g.drawImage(src,0,0,W,H);
    // mild unsharp after upscale
    try{ const im=g.getImageData(0,0,W,H); const d=im.data; const copy=new Uint8ClampedArray(d); const amt=0.35;
      for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ const i=(y*W+x)*4; for(let c=0;c<3;c++){ const lap=4*copy[i+c]-copy[i-4+c]-copy[i+4+c]-copy[i-W*4+c]-copy[i+W*4+c]; d[i+c]=Math.max(0,Math.min(255,copy[i+c]+amt*lap*0.15)); } }
      g.putImageData(im,0,0); }catch(_){}
    const full=await canvasBlob(out,'image/jpeg',0.92); const thumb=await canvasBlob(scaledCanvas(out,480),'image/jpeg',0.82);
    const base=p.name.replace(/\.[^.]+$/,''); const name=`${base}-Enhance.jpg`;
    const s=defaults(); const np={id:uid(),name,added:Date.now(),w:W,h:H,raw:false,exif:p.exif?{...p.exif}:null,rating:p.rating||0,flag:0,colorLabel:p.colorLabel||'',settings:s,
      history:[{label:'2× Enhance (high-quality upscale)',s:clone(s)}],hIdx:0,thumb,edited:false,size:full.size,keywords:[...(p.keywords||[]).filter(k=>k!=='enhanced'),'enhanced'],enhanced:true,enhanceFrom:p.name};
    await blobPut(np.id,full); await dbPut(np); photos.push(np); window.__enhanced={name,w:W,h:H,from:p.name};
    toast(`Created ${name} (${W}×${H}) — 2× Enhance (high-quality upscale, not AI Super Resolution)`,4000);
    sel=new Set([np.id]); openDevelop(np.id);
  }catch(e){ console.error(e); toast('Enhance failed: '+(e.message||e),4000); } finally{ busy(false); } }
window.enhance2x=enhance2x;
{ const q=$('.quick'); if(q){ const b=document.createElement('button'); b.className='btn'; b.id='enhanceBtn'; b.textContent='Enhance 2×'; b.title='2× Enhance (high-quality upscale) — not true AI Super Resolution'; q.appendChild(b); b.onclick=enhance2x; }
  mk('enhanceLib','Enhance 2×','2× Enhance (high-quality upscale)').onclick=enhance2x; }

/* ===== Duplicate detection ===== */
mk('dupBtn','Find duplicates','Find near-duplicate photos').onclick=async()=>{
  const list=photos.slice(); if(list.length<2) return toast('Need at least 2 photos');
  busy(true,'Scanning for duplicates…'); const hashes=new Map(); const groups=[];
  try{ for(let i=0;i<list.length;i++){ const p=list[i]; busy(true,`Hashing ${i+1}/${list.length}…`); const id=await thumbImageData(p,48); hashes.set(p.id,{h:id?stackHash(id):'',w:p.w,hgt:p.h,size:p.size||0,name:p.name}); if(i%10===9) await nextFrame(); }
    const used=new Set();
    for(const p of list){ if(used.has(p.id)) continue; const a=hashes.get(p.id); const g=[p]; used.add(p.id);
      for(const q of list){ if(used.has(q.id)) continue; const b=hashes.get(q.id);
        const sameSize=a.size&&b.size&&a.size===b.size; const sameDim=a.w&&b.w&&a.w===b.w&&a.hgt===b.hgt;
        const nameSim=a.name.replace(/[-_\s]?\(\d+\)|[-_\s]?copy\d*|-Enhance/ig,'').toLowerCase()===b.name.replace(/[-_\s]?\(\d+\)|[-_\s]?copy\d*|-Enhance/ig,'').toLowerCase();
        const vis=hashDist(a.h,b.h)<0.08; if((sameSize&&vis)||(sameDim&&nameSim)||(vis&&sameDim)){ g.push(q); used.add(q.id); } }
      if(g.length>1) groups.push(g); }
  } finally{ busy(false); }
  if(!groups.length) return toast('No duplicates found');
  dlg(`<h3>Duplicates · ${groups.length} group(s)</h3>
    <div class="hint">Grouped by file size + visual hash, or matching dimensions/name patterns. Review before removing.</div>
    <div id="dupList" class="dupList">${groups.map((g,gi)=>`<div class="dupG" data-g="${gi}"><div class="hint">Group ${gi+1} · ${g.length} photos</div>${g.map(p=>`<label class="dupRow"><input type="checkbox" data-id="${p.id}" ${p===g[0]?'':'checked'}> <img src="${thumbURL(p)}"> <span>${esc(p.name)}<small>${p.w||'?'}×${p.h||'?'} · ${p.size?Math.round(p.size/1024)+' KB':''}</small></span></label>`).join('')}</div>`).join('')}</div>
    <div class="btns"><button class="btn" onclick="closeDlg()">Cancel</button><button class="btn" id="dupStack">Stack groups</button><button class="btn primary" id="dupRm">Remove checked from library</button></div>`);
  $('#dupStack').onclick=()=>{ const n=applyStacks(groups); closeDlg(); renderLibrary(); toast(`Stacked ${n} duplicate group(s)`); };
  $('#dupRm').onclick=async()=>{ const ids=[...$$('#dupList input:checked')].map(i=>i.dataset.id); if(!ids.length) return toast('Tick photos to remove');
    if(!confirm(`Remove ${ids.length} photo(s) from Photo Studio? Original files on disk are not affected.`)) return;
    for(const id of ids){ await dbDel(id); photos=photos.filter(p=>p.id!==id); if(cur===id) cur=null; sel.delete(id); }
    closeDlg(); renderLibrary(); toast(`Removed ${ids.length} duplicate(s)`); window.__dupRemoved=ids.length; };
  window.__dups=groups.length;
};

/* ===== Help tip ===== */
const hb=$('#helpBtn'); if(hb){ const base=hb.onclick; hb.onclick=()=>{ if(typeof base==='function') base.call(hb); const d=$('#dlg'); if(!d) return;
  const extra=document.createElement('div'); extra.className='lr2Help';
  extra.innerHTML=`<h3 style="margin-top:14px;font-size:14px">Colour labels & library</h3><table>${[
    ['6 / 7 / 8 / 9','Colour label: Red / Yellow / Green / Blue (press again to clear)'],
    ['Shift+0','Purple colour label (toggle)'],
    ['Cull…','Assisted culling (exposure + sharpness heuristics)'],
    ['Stack…','Stack by time / visual similarity'],
    ['Match exp','Match Total Exposures to the active photo'],
    ['Enhance 2×','High-quality 2× upscale (not AI Super Resolution)'],
    ['Find duplicates','Group near-duplicates to stack or remove'],
    ['label:red','Search filter for a colour label']
  ].map(([a,b])=>`<tr><td><kbd>${a}</kbd></td><td>${b}</td></tr>`).join('')}</table>`;
  d.appendChild(extra); }; }

window.__lr2={labels:LABELS,version:1};
});
