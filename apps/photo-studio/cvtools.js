/* ===== Private on-device tools (OpenCV.js, lazy-loaded): Background removal (AI subject + GrabCut) and Document scan ===== */
(function(){
const PRIV='<div class="privBadge" title="Everything in this tool runs inside your browser. No photo or data leaves your device.">🔒 Private: runs on your device, nothing uploaded</div>';
let CVP=null;
function loadCV(){ if(CVP) return CVP; CVP=new Promise((res,rej)=>{
  const s=document.createElement('script'); s.src='opencv/opencv.js'; s.async=true;
  s.onload=()=>{ // never 'await cv': the Emscripten module is a thenable that resolves to itself
    const c=window.cv; let done=false; const ok=()=>{ if(done) return; done=true; const m=window.cv; try{ delete m.then; }catch(e){ m.then=undefined; } res(m); };
    if(c&&c.Mat) return ok(); if(c) c.onRuntimeInitialized=ok; let n=0; const iv=setInterval(()=>{ if(window.cv&&window.cv.Mat){ clearInterval(iv); ok(); } else if(++n>600){ clearInterval(iv); if(!done) rej(new Error('OpenCV timed out')); } },100); };
  s.onerror=()=>{ CVP=null; rej(new Error('Could not load OpenCV')); }; document.head.appendChild(s); }); return CVP; }
window.loadCV=loadCV;
let SEGP=null;
function loadSegmenter(){ if(SEGP) return SEGP; SEGP=(async()=>{ const v=await import('./mediapipe/vision_bundle.mjs'); const fs=await v.FilesetResolver.forVisionTasks(new URL('mediapipe/wasm',location.href).href);
  return v.ImageSegmenter.createFromOptions(fs,{baseOptions:{modelAssetPath:new URL('mediapipe/deeplab_v3.tflite',location.href).href,delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true}); })().catch(e=>{ SEGP=null; throw e; }); return SEGP; }
const mkC=(w,h)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; };
const fitC=(src,max)=>{ const k=Math.min(1,max/Math.max(src.width,src.height)); const c=mkC(Math.round(src.width*k),Math.round(src.height*k)); const g=c.getContext('2d'); g.imageSmoothingQuality='high'; g.drawImage(src,0,0,c.width,c.height); return c; };
async function editedCanvas(maxEdge){ const p=curPhoto(); if(!p) throw new Error('Open a photo first');
  const r=await renderExport(p,{fmt:'png',q:100,size:'edge',edge:maxEdge,exif:false},m=>busy(true,m)); const bm=await createImageBitmap(r.blob); const c=mkC(bm.width,bm.height); c.getContext('2d').drawImage(bm,0,0); bm.close&&bm.close(); return c; }
function openDlg(html){ $('#dlg').innerHTML=html; $('#dlg').classList.add('cvDlg'); $('#modal').hidden=false; }
function closeDlg(){ $('#modal').hidden=true; $('#dlg').classList.remove('cvDlg'); }
async function addToLibrary(blob,name){ await importFiles([new File([blob],name,{type:blob.type})]); toast('Added '+name+' to your library'); }
function download(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); }
const baseName=()=>(curPhoto()?.name||'photo').replace(/\.[^.]+$/,'');

/* ---------- Background removal ---------- */
async function cutoutMask(img){ // returns alpha canvas (white with alpha) at img size
  const cv=await loadCV(); const sm=fitC(img,640); const w=sm.width,h=sm.height; let fg=null, how='GrabCut';
  try{ const seg=await loadSegmenter(); const r=seg.segment(sm); const m0=r.confidenceMasks[0]; const mw=m0.width,mh=m0.height, a=m0.getAsFloat32Array();
    fg=new Float32Array(w*h); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ fg[y*w+x]=1-a[Math.min(mh-1,Math.floor(y*mh/h))*mw+Math.min(mw-1,Math.floor(x*mw/w))]; }
    r.confidenceMasks.forEach(m=>m.close&&m.close()); let area=0; for(const v of fg) if(v>0.5) area++; if(area<w*h*0.01) fg=null; else how='AI subject + GrabCut'; }catch(e){ console.warn(e); }
  const src=cv.imread(sm); const rgb=new cv.Mat(); cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);
  const mask=new cv.Mat(h,w,cv.CV_8UC1), bgd=new cv.Mat(), fgd=new cv.Mat(); let rect=new cv.Rect(Math.round(w*.08),Math.round(h*.05),Math.round(w*.84),Math.round(h*.9));
  if(fg){ const d=mask.data; for(let i=0;i<w*h;i++){ const v=fg[i]; d[i]=v>0.9?cv.GC_FGD:v>0.5?cv.GC_PR_FGD:v>0.3?cv.GC_PR_BGD:cv.GC_BGD; }
    cv.grabCut(rgb,mask,rect,bgd,fgd,4,cv.GC_INIT_WITH_MASK); }
  else cv.grabCut(rgb,mask,rect,bgd,fgd,5,cv.GC_INIT_WITH_RECT);
  const al=new cv.Mat(h,w,cv.CV_8UC1); const md=mask.data, ad=al.data; for(let i=0;i<w*h;i++) ad[i]=(md[i]===cv.GC_FGD||md[i]===cv.GC_PR_FGD)?255:0;
  // clean: keep sizeable blobs, smooth edges
  const k=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(3,3)); cv.morphologyEx(al,al,cv.MORPH_OPEN,k); cv.morphologyEx(al,al,cv.MORPH_CLOSE,k);
  { const lab=new cv.Mat(), st=new cv.Mat(), ce=new cv.Mat(); const n=cv.connectedComponentsWithStats(al,lab,st,ce,8,cv.CV_32S); let mx=0; for(let i=1;i<n;i++) mx=Math.max(mx,st.intAt(i,cv.CC_STAT_AREA));
    const keep=new Uint8Array(n); for(let i=1;i<n;i++) keep[i]=st.intAt(i,cv.CC_STAT_AREA)>=mx*0.2?1:0; const L=lab.data32S, A=al.data; for(let i=0;i<w*h;i++) A[i]=keep[L[i]]?255:0; [lab,st,ce].forEach(m=>m.delete()); }
  const big=new cv.Mat(); cv.resize(al,big,new cv.Size(img.width,img.height),0,0,cv.INTER_LINEAR); const kb=Math.max(3,(Math.round(Math.max(img.width,img.height)/700)|1)); cv.GaussianBlur(big,big,new cv.Size(kb,kb),0);
  const out=mkC(img.width,img.height), g=out.getContext('2d'), id=g.createImageData(img.width,img.height), bd=big.data; for(let i=0;i<bd.length;i++){ id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=255; id.data[i*4+3]=bd[i]; } g.putImageData(id,0,0);
  [src,rgb,mask,bgd,fgd,al,k,big].forEach(m=>m.delete()); return {mask:out,how};
}
function composeCut(img,mask,o){ const W=img.width,H=img.height, c=mkC(W,H), g=c.getContext('2d');
  const fgc=mkC(W,H), f=fgc.getContext('2d'); f.drawImage(mask,0,0); f.globalCompositeOperation='source-in'; f.drawImage(img,0,0);
  if(o.bg==='colour'){ g.fillStyle=o.colour; g.fillRect(0,0,W,H); }
  else if(o.bg==='blur'){ g.filter=`blur(${Math.round(o.blur*Math.max(W,H)/1000)}px)`; g.drawImage(img,-W*.02,-H*.02,W*1.04,H*1.04); g.filter='none'; }
  else if(o.bg==='image'&&o.image){ const k=Math.max(W/o.image.width,H/o.image.height); g.drawImage(o.image,(W-o.image.width*k)/2,(H-o.image.height*k)/2,o.image.width*k,o.image.height*k); }
  g.drawImage(fgc,0,0); return c; }
async function bgRemove(){
  try{ busy(true,'Rendering your edit…'); const img=await editedCanvas(isTouch?2400:3600); busy(true,'Finding the subject (on this device)…'); const {mask,how}=await cutoutMask(img); busy(false);
    const o={bg:'transparent',colour:'#ffffff',blur:12,image:null}; window.__cut={img,mask,o,how};
    openDlg(`<h3>Remove background</h3>${PRIV}<div class="cvView checker"><canvas id="cutPrev"></canvas></div><div class="cvNote">${how}. Check the edges before you export.</div>
      <div class="row cvRow"><label><input type="radio" name="cutBg" value="transparent" checked> Transparent</label><label><input type="radio" name="cutBg" value="colour"> Colour <input type="color" id="cutCol" value="#ffffff"></label>
      <label><input type="radio" name="cutBg" value="blur"> Blur <input type="range" id="cutBlur" min="2" max="40" value="12" style="width:90px"></label><label><input type="radio" name="cutBg" value="image"> Image <input type="file" id="cutImg" accept="image/*" style="width:150px"></label></div>
      <div class="row cvBtns"><button class="btn primary" id="cutDl">Download PNG</button><button class="btn" id="cutAdd">Add to library</button><button class="btn" id="cutClose">Close</button></div>`);
    const prev=$('#cutPrev'); const draw=()=>{ const r=composeCut(fitC(img,1200),fitC(mask,1200),o); prev.width=r.width; prev.height=r.height; prev.getContext('2d').drawImage(r,0,0); };
    draw(); $$('input[name=cutBg]').forEach(r=>r.onchange=()=>{ o.bg=r.value; draw(); });
    $('#cutCol').oninput=e=>{ o.colour=e.target.value; o.bg='colour'; $('input[name=cutBg][value=colour]').checked=true; draw(); };
    $('#cutBlur').oninput=e=>{ o.blur=+e.target.value; o.bg='blur'; $('input[name=cutBg][value=blur]').checked=true; draw(); };
    $('#cutImg').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; o.image=await decode(f); o.bg='image'; $('input[name=cutBg][value=image]').checked=true; draw(); };
    const final=async()=>{ busy(true,'Building full-size cut-out…'); await new Promise(r=>setTimeout(r,30)); const c=composeCut(img,mask,o); const b=await canvasBlob(c,o.bg==='transparent'?'image/png':'image/jpeg',0.93); busy(false); return [b,baseName()+(o.bg==='transparent'?'-cutout.png':'-newbg.jpg')]; };
    $('#cutDl').onclick=async()=>{ const [b,n]=await final(); download(b,n); };
    $('#cutAdd').onclick=async()=>{ const [b,n]=await final(); closeDlg(); await addToLibrary(b,n); };
    $('#cutClose').onclick=closeDlg;
  }catch(e){ busy(false); console.error(e); toast('Background removal failed: '+e.message,4000); }
}

/* ---------- Document scan ---------- */
function orderQuad(p){ const c=p.reduce((a,b)=>[a[0]+b[0]/4,a[1]+b[1]/4],[0,0]); return p.slice().sort((a,b)=>Math.atan2(a[1]-c[1],a[0]-c[0])-Math.atan2(b[1]-c[1],b[0]-c[0])); } // tl,tr,br,bl (angle order from -pi)
async function detectQuad(img){ const cv=await loadCV(); const sm=fitC(img,800), k=img.width/sm.width; const src=cv.imread(sm), g=new cv.Mat(), e=new cv.Mat();
  cv.cvtColor(src,g,cv.COLOR_RGBA2GRAY); cv.GaussianBlur(g,g,new cv.Size(5,5),0); cv.Canny(g,e,40,130); cv.dilate(e,e,cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3)));
  const cs=new cv.MatVector(), hi=new cv.Mat(); cv.findContours(e,cs,hi,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE); let best=null, bestA=sm.width*sm.height*0.15;
  for(let i=0;i<cs.size();i++){ const c=cs.get(i); const peri=cv.arcLength(c,true); const ap=new cv.Mat(); cv.approxPolyDP(c,ap,0.02*peri,true);
    if(ap.rows===4&&cv.isContourConvex(ap)){ const a=cv.contourArea(ap); if(a>bestA){ bestA=a; best=[]; for(let j=0;j<4;j++) best.push([ap.data32S[j*2]*k,ap.data32S[j*2+1]*k]); } } ap.delete(); c.delete(); }
  [src,g,e,cs,hi].forEach(m=>m.delete());
  const W=img.width,H=img.height; return {quad:orderQuad(best||[[W*.04,H*.04],[W*.96,H*.04],[W*.96,H*.96],[W*.04,H*.96]]),found:!!best}; }
async function warpEnhance(img,q,mode){ const cv=await loadCV(); const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  let ow=Math.round(Math.max(d(q[0],q[1]),d(q[3],q[2]))), oh=Math.round(Math.max(d(q[0],q[3]),d(q[1],q[2]))); const s=Math.min(1,4000/Math.max(ow,oh)); ow=Math.round(ow*s); oh=Math.round(oh*s);
  const src=cv.imread(img), dst=new cv.Mat(); const M=cv.getPerspectiveTransform(cv.matFromArray(4,1,cv.CV_32FC2,q.flat()),cv.matFromArray(4,1,cv.CV_32FC2,[0,0,ow,0,ow,oh,0,oh]));
  cv.warpPerspective(src,dst,M,new cv.Size(ow,oh),cv.INTER_CUBIC,cv.BORDER_REPLICATE); let out=dst;
  if(mode!=='original'){ const kz=(Math.round(Math.max(ow,oh)/25)|1);
    if(mode==='bw'||mode==='grey'){ const g=new cv.Mat(); cv.cvtColor(dst,g,cv.COLOR_RGBA2GRAY); const bg=new cv.Mat(); cv.morphologyEx(g,bg,cv.MORPH_CLOSE,cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(kz,kz)));
      const n=new cv.Mat(); cv.divide(g,bg,n,255); if(mode==='bw'){ cv.adaptiveThreshold(n,n,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY,(Math.round(Math.max(ow,oh)/60)|1),9); }
      out=new cv.Mat(); cv.cvtColor(n,out,cv.COLOR_GRAY2RGBA); [g,bg,n,dst].forEach(m=>m.delete()); }
    else { const ch=new cv.MatVector(); cv.split(dst,ch); const k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(kz,kz));
      for(let i=0;i<3;i++){ const c=ch.get(i), bg=new cv.Mat(); cv.morphologyEx(c,bg,cv.MORPH_CLOSE,k); cv.divide(c,bg,c,255); c.convertTo(c,-1,1.15,-20); ch.set(i,c); bg.delete(); c.delete(); }
      out=new cv.Mat(); cv.merge(ch,out); ch.delete(); dst.delete(); } }
  const c=mkC(ow,oh); cv.imshow(c,out); [src,M,out].forEach(m=>{ try{ m.delete(); }catch(e){} }); return c; }
async function docScan(){
  try{ busy(true,'Rendering…'); const img=await editedCanvas(isTouch?3000:4000); busy(true,'Finding the page edges (on this device)…'); const {quad,found}=await detectQuad(img); busy(false);
    let q=quad, mode='colour'; window.__scan={img,q:()=>q,found};
    openDlg(`<h3>Document scan</h3>${PRIV}<div class="cvNote">${found?'Page found automatically. Drag the corners to adjust.':'No clear page edge found. Drag the corners onto the page.'}</div>
      <div class="cvView"><canvas id="scanPrev"></canvas></div>
      <div class="row cvRow"><label>Enhance <select id="scanMode"><option value="colour">Colour (whiten paper)</option><option value="grey">Greyscale</option><option value="bw">Black &amp; white</option><option value="original">None</option></select></label></div>
      <div class="row cvBtns"><button class="btn" id="scanPreview">Preview result</button><button class="btn primary" id="scanDl">Download JPG</button><button class="btn" id="scanAdd">Add to library</button><button class="btn" id="scanClose">Close</button></div>`);
    const cv_=$('#scanPrev'); const pv=fitC(img,1100), k=pv.width/img.width; cv_.width=pv.width; cv_.height=pv.height; let showRes=null;
    const draw=()=>{ const g=cv_.getContext('2d'); if(showRes){ cv_.width=showRes.width; cv_.height=showRes.height; g.drawImage(showRes,0,0); return; } cv_.width=pv.width; cv_.height=pv.height; g.drawImage(pv,0,0);
      g.fillStyle='#4af3'; g.strokeStyle='#4af'; g.lineWidth=2; g.beginPath(); q.forEach((p,i)=>i?g.lineTo(p[0]*k,p[1]*k):g.moveTo(p[0]*k,p[1]*k)); g.closePath(); g.fill(); g.stroke();
      q.forEach(p=>{ g.beginPath(); g.arc(p[0]*k,p[1]*k,isTouch?14:9,0,7); g.fillStyle='#fff'; g.fill(); g.stroke(); }); };
    draw(); let drag=-1;
    const pt=e=>{ const r=cv_.getBoundingClientRect(); return [(e.clientX-r.left)/r.width*cv_.width/k,(e.clientY-r.top)/r.height*cv_.height/k]; };
    cv_.style.touchAction='none';
    cv_.onpointerdown=e=>{ if(showRes){ showRes=null; draw(); return; } const p=pt(e); let bi=-1,bd=1e9; q.forEach((c,i)=>{ const dd=Math.hypot(c[0]-p[0],c[1]-p[1]); if(dd<bd){ bd=dd; bi=i; } }); if(bd*k<50){ drag=bi; cv_.setPointerCapture(e.pointerId); } };
    cv_.onpointermove=e=>{ if(drag<0) return; const p=pt(e); q=q.slice(); q[drag]=[Math.max(0,Math.min(img.width,p[0])),Math.max(0,Math.min(img.height,p[1]))]; draw(); };
    cv_.onpointerup=()=>{ drag=-1; };
    $('#scanMode').onchange=e=>{ mode=e.target.value; if(showRes) $('#scanPreview').click(); };
    const result=async()=>{ busy(true,'Straightening and enhancing…'); await new Promise(r=>setTimeout(r,30)); const c=await warpEnhance(img,orderQuad(q),mode); busy(false); return c; };
    $('#scanPreview').onclick=async()=>{ const c=await result(); showRes=fitC(c,1100); draw(); };
    $('#scanDl').onclick=async()=>{ const c=await result(); download(await canvasBlob(c,'image/jpeg',0.9),baseName()+'-scan.jpg'); };
    $('#scanAdd').onclick=async()=>{ const c=await result(); const b=await canvasBlob(c,'image/jpeg',0.9); closeDlg(); await addToLibrary(b,baseName()+'-scan.jpg'); };
    $('#scanClose').onclick=closeDlg;
  }catch(e){ busy(false); console.error(e); toast('Document scan failed: '+e.message,4000); }
}
window.psSegmenter=loadSegmenter; window.bgRemove=bgRemove; window.docScan=docScan; window.cvWarpEnhance=warpEnhance; window.cvDetectQuad=detectQuad; window.cvCutoutMask=cutoutMask;

/* ---------- OpenCV inpaint (fast Telea) for the Remove tool, as an option ---------- */
window.cvInpaint=async function(canvas,holeCanvas,radius=5){ const cv=await loadCV(); const s=cv.imread(canvas), rgb=new cv.Mat(); cv.cvtColor(s,rgb,cv.COLOR_RGBA2RGB);
  const hm=cv.imread(holeCanvas), m=new cv.Mat(); cv.cvtColor(hm,m,cv.COLOR_RGBA2GRAY); cv.threshold(m,m,10,255,cv.THRESH_BINARY); const o=new cv.Mat(); cv.inpaint(rgb,m,o,radius,cv.INPAINT_TELEA);
  const out=new cv.Mat(); cv.cvtColor(o,out,cv.COLOR_RGB2RGBA); const c=mkC(canvas.width,canvas.height); cv.imshow(c,out); [s,rgb,hm,m,o,out].forEach(x=>x.delete()); return c; };

addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
  const q=document.querySelector('#panel .quick'); if(q){ const b1=document.createElement('button'); b1.className='btn'; b1.id='cutBtn'; b1.textContent='✂ Cut-out'; b1.title='Remove background (private, on-device)'; b1.onclick=bgRemove;
    const b2=document.createElement('button'); b2.className='btn'; b2.id='scanBtn'; b2.textContent='📄 Scan'; b2.title='Document scan: find page, straighten, enhance (private, on-device)'; b2.onclick=docScan; q.append(b1,b2); }
},0));
})();
