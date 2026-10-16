/* ===== AI Assist: suggestions, prompt edits, tap-to-remove, sky replacement, Learn my style (all on-device) ===== */
addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
const clampv=(v,a,b)=>Math.max(a,Math.min(b,v));
const PRIV='<span class="privBadge">🔒 On your device</span>';
/* ---------- image statistics ---------- */
function statsOf(data,w,h){ let n=0,sL=0,sL2=0,hi=0,lo=0,r=0,g=0,b=0,sat=0; const step=Math.max(1,Math.floor(w*h/40000));
  for(let i=0;i<w*h;i+=step){ const R=data[i*4]/255,G=data[i*4+1]/255,B=data[i*4+2]/255; const L=0.2126*R+0.7152*G+0.0722*B; n++; sL+=L; sL2+=L*L; if(Math.max(R,G,B)>0.985) hi++; if(L<0.02) lo++; r+=R; g+=G; b+=B; const mx=Math.max(R,G,B),mn=Math.min(R,G,B); sat+=mx>0?(mx-mn)/mx:0; }
  const m=sL/n; return {L:m,sd:Math.sqrt(Math.max(0,sL2/n-m*m)),hi:hi/n,lo:lo/n,cast:(r-b)/n,tint:(g-(r+b)/2)/n,sat:sat/n}; }
const curStats=()=>{ const D=window.srcHi; return D?statsOf(D.data,D.w,D.h):null; };
async function photoStats(p){ const bl=await blobGet(p.rawStored?p.id+':prev':p.id); const im=await decode(bl); const c=scaledCanvas(im,256); im.close&&im.close(); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; return statsOf(d,c.width,c.height); }
const aiMask=(kind,adj,name)=>{ const m=Object.assign(newMaskOf(kind),{id:'m'+uid(),name:name||kind,on:true,adj:newAdj(),parts:[]}); Object.assign(m.adj,adj); if(window.ensureAI) ensureAI(kind); return m; };
const maskArea=k=>{ const c=window.aiMaskFor&&aiMaskFor(k); if(!c) return null; const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let a=0,n=0; for(let i=3;i<d.length;i+=16){ n++; if(d[i]>128) a++; } return a/n; };

/* ---------- panel ---------- */
const body=section('✨ AI Assist',false); body.parentElement.id='aiAssistSec';
body.innerHTML=`<div class="aiPriv">🔒 Private: analysis and edits run on your device, nothing is uploaded.</div>
<div class="sub">Describe an edit</div><div class="row aiPrompt"><input id="aiPrompt" type="text" placeholder="e.g. warmer, make the sky more dramatic, remove the person" enterkeyhint="go"><button class="btn primary" id="aiGo">Apply</button></div><div id="aiParsed" class="hint"></div>
<div class="sub">Suggestions</div><div class="row"><button class="btn" id="aiSuggest">Analyse photo</button></div><div id="aiCards" class="aiCards"></div>
<div class="sub">Remove</div><div class="row"><button class="btn" id="aiTapRm">🪄 Tap an object to remove</button></div>
<div class="sub">Replace sky</div><div class="row"><select id="aiSkyKind"><option value="sunset">Sunset</option><option value="blue">Blue sky, clouds</option><option value="dramatic">Dramatic storm</option><option value="golden">Golden hour</option><option value="night">Night, stars</option></select><button class="btn" id="aiSkyBtn">Replace…</button></div>
<div class="sub">Learn my style</div><div class="row"><button class="btn" id="aiLearn">Learn from my edits</button><button class="btn" id="aiApplyStyle">Apply my style</button></div><div id="aiStyleInfo" class="hint"></div>`;

/* ---------- suggestions ---------- */
function suggestions(){ const st=curStats(); if(!st) return []; const out=[]; const sky=maskArea('sky'), subj=maskArea('subject');
  out.push({t:'Auto balance',d:'Auto+ tone and white balance',auto:true});
  if(st.L<0.38) out.push({t:'Brighten',d:`Photo is dark (avg ${Math.round(st.L*100)}%)`,f:s=>{ s.exposure=+(s.exposure+clampv((0.46-st.L)*3.2,0.2,1.6)).toFixed(2); s.shadows=Math.min(100,s.shadows+30); s.blacks=s.blacks+5; }});
  if(st.L>0.62||st.hi>0.02) out.push({t:'Recover highlights',d:`${(st.hi*100).toFixed(1)}% near clipping`,f:s=>{ s.highlights=Math.max(-100,s.highlights-60); s.whites=s.whites-20; if(st.L>0.62) s.exposure=+(s.exposure-0.3).toFixed(2); }});
  if(Math.abs(st.cast)>0.035) out.push({t:'Neutralise colour cast',d:st.cast>0?'Image looks warm/orange':'Image looks cool/blue',f:s=>{ s.wbTemp=clampv(s.wbTemp-Math.round(st.cast*350),-100,100); s.wbTint=clampv(s.wbTint+Math.round(st.tint*250),-100,100); }});
  if(sky!=null&&sky>0.06) out.push({t:'Dramatic sky',d:`Sky covers ${Math.round(sky*100)}%`,f:s=>{ s.masks.push(aiMask('sky',{exposure:-0.45,contrast:30,clarity:20,saturation:15,temp:-8},'Sky (AI suggestion)')); }});
  else if(sky==null) ensureAI&&ensureAI('sky');
  if(subj!=null&&subj>0.03&&subj<0.7) out.push({t:'Make subject pop',d:'Brighter, crisper subject with a subtle vignette',f:s=>{ s.masks.push(aiMask('subject',{exposure:0.25,clarity:12,saturation:5},'Subject (AI suggestion)')); s.vigAmount=Math.min(s.vigAmount,-15); }});
  else if(subj==null) ensureAI&&ensureAI('subject');
  if(st.sat<0.22) out.push({t:'Richer colour',d:'Colours are muted',f:s=>{ s.vibrance=Math.min(100,s.vibrance+30); s.saturation+=5; }});
  if(st.sd<0.17) out.push({t:'Add punch',d:'Low contrast',f:s=>{ s.contrast=Math.min(100,s.contrast+25); s.clarity+=10; s.dehaze+=8; }});
  out.push({t:'Moody',d:'Darker, cooler, cinematic',f:s=>{ s.exposure=+(s.exposure-0.2).toFixed(2); s.contrast+=15; s.blacks-=15; s.saturation-=15; s.wbTemp-=8; s.vigAmount=Math.min(s.vigAmount,-22); }});
  return out.slice(0,6); }
let preview=null; const endPreview=()=>{ if(preview){ S=preview; curPhoto().settings=S; preview=null; syncUI(); schedule(true); } };
function showCards(){ const list=suggestions(); window.__aiSug=list.map(x=>x.t); const host=$('#aiCards');
  host.innerHTML=list.map((x,i)=>`<div class="aiCard" data-i="${i}"><b>${x.t}</b><span>${x.d}</span><div class="row"><button class="btn" data-pv="${i}">Preview</button><button class="btn primary" data-ap="${i}">Apply</button></div></div>`).join('')||'<div class="hint">Open a photo first.</div>';
  host.onclick=e=>{ const pv=e.target.dataset.pv, ap=e.target.dataset.ap;
    if(pv!=null){ const x=list[+pv]; if(preview){ endPreview(); if(e.target.classList.contains('on')){ e.target.classList.remove('on'); return; } } $$('#aiCards [data-pv]').forEach(b=>b.classList.remove('on'));
      if(x.auto){ toast('Tap Apply for Auto balance'); return; } preview=clone(S); const s=clone(S); x.f(s); S=s; curPhoto().settings=S; syncUI(); schedule(true); e.target.classList.add('on'); }
    if(ap!=null){ const x=list[+ap]; endPreview(); if(x.auto){ autoPlus(); } else { const s=clone(S); x.f(s); S=s; curPhoto().settings=S; syncUI(); schedule(true); commit('AI: '+x.t); } toast('Applied: '+x.t); } }; }
$('#aiSuggest').onclick=()=>{ showCards(); setTimeout(()=>{ if(!preview) showCards(); },2500); };

/* ---------- prompt parser ---------- */
function parsePrompt(txt){ const parts=txt.toLowerCase().replace(/black\s*(and|&)\s*white/g,'monochrome').replace(/rock and roll/g,'').split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b|\bplus\b|\balso\b)\s*/).filter(x=>x.trim()); if(parts.length>1){ const seen=new Set(), all=[]; let ctx=''; for(const q of parts){ const r=parsePrompt1((/\b(sky|subject|background|person|face)\b/.test(q)?'':ctx)+' '+q); r.forEach(x=>{ if(!seen.has(x.label)){ seen.add(x.label); all.push(x); } });  } return all; } return parsePrompt1(txt); }
function parsePrompt1(txt){ const t=' '+txt.toLowerCase().replace(/[^a-z0-9& ]/g,' ')+' '; const acts=[];
  const k=/\b(a (little )?bit|slightly|a touch|subtle|little)\b/.test(t)?0.5:/\b(very|much|lot|really|super|way|extremely)\b/.test(t)?1.6:1;
  const has=r=>r.test(t); const add=(label,f)=>acts.push({label,f});
  const sky=has(/\bsky|skies|clouds?\b/), subj=has(/\b(subject|person|people|face|him|her|portrait)\b/), bgw=has(/\bbackground\b/);
  const rm=t.match(/\b(remove|erase|delete|get rid of)\s+(the |that |this |a )?(\w+)/);
  const rep=t.match(/\breplace (the )?sky( with)?( a)? (\w+)/)||t.match(/\b(\w+) sky replacement/);
  if(rep){ const w=rep[4]||rep[1]; const kind=/sunset|orange|pink/.test(w)?'sunset':/night|star/.test(w)?'night':/storm|dramatic|dark|moody/.test(w)?'dramatic':/gold/.test(w)?'golden':'blue'; acts.push({label:'Replace sky: '+kind,special:()=>skyReplace(kind)}); }
  if(rm){ acts.push({label:'Remove '+rm[3],special:()=>removeByName(rm[3])}); }
  if(sky&&!rep){ if(has(/dramatic|moody|darker|stormy|intense|deeper|epic/)) add('Sky: more dramatic',s=>s.masks.push(aiMask('sky',{exposure:-0.5*k,contrast:Math.round(30*k),clarity:Math.round(22*k),saturation:Math.round(15*k)},'Sky (prompt)')));
    else if(has(/blue|bluer/)) add('Sky: bluer',s=>s.masks.push(aiMask('sky',{temp:Math.round(-25*k),saturation:Math.round(25*k),exposure:-0.15*k},'Sky (prompt)')));
    else if(has(/bright|lighter/)) add('Sky: brighter',s=>s.masks.push(aiMask('sky',{exposure:0.4*k},'Sky (prompt)')));
    else if(has(/warm|golden|orange/)) add('Sky: warmer',s=>s.masks.push(aiMask('sky',{temp:Math.round(30*k),saturation:Math.round(10*k)},'Sky (prompt)'))); }
  if(subj&&!rm){ if(has(/bright|lighter|pop|stand out|lift/)) add('Subject: brighter',s=>s.masks.push(aiMask('subject',{exposure:0.35*k,clarity:Math.round(8*k)},'Subject (prompt)'))); if(has(/sharp|crisp|detail/)) add('Subject: crisper',s=>s.masks.push(aiMask('subject',{clarity:Math.round(20*k),sharpness:Math.round(25*k)},'Subject (prompt)'))); }
  if(bgw){ if(has(/dark|darker|dim/)) add('Background: darker',s=>{ const m=aiMask('subject',{exposure:-0.45*k,saturation:-10},'Background (prompt)'); m.invert=true; s.masks.push(m); }); if(has(/blur|soft|bokeh/)) add('Background: softer',s=>{ const m=aiMask('subject',{clarity:Math.round(-60*k),sharpness:-60},'Background blur (prompt)'); m.invert=true; s.masks.push(m); }); }
  if(!sky&&!subj&&!bgw){
    if(has(/\bwarm(er)?\b|golden|cosy|cozy/)) add('Warmer',s=>{ s.wbTemp=clampv(s.wbTemp+Math.round(18*k),-100,100); });
    if(has(/\bcool(er)?\b|\bcold(er)?\b|blue(r)?\b/)) add('Cooler',s=>{ s.wbTemp=clampv(s.wbTemp-Math.round(18*k),-100,100); });
    if(has(/bright(er|en)?\b|lighter|lighten|too dark|underexposed/)) add('Brighter',s=>{ s.exposure=+(s.exposure+0.4*k).toFixed(2); s.shadows+=Math.round(10*k); });
    if(has(/\bdark(er|en)\b|too bright|overexposed/)) add('Darker',s=>{ s.exposure=+(s.exposure-0.4*k).toFixed(2); });
    if(has(/dramatic|moody|cinematic/)) add('Moody',s=>{ s.contrast+=Math.round(20*k); s.blacks-=Math.round(12*k); s.clarity+=Math.round(12*k); s.vigAmount=Math.min(s.vigAmount,Math.round(-20*k)); s.saturation-=Math.round(8*k); }); }
  if(has(/more contrast|punch|punchy|contrasty/)) add('More contrast',s=>{ s.contrast=clampv(s.contrast+Math.round(25*k),-100,100); });
  if(has(/less contrast|flat|softer|soft look|matte/)) add('Softer / matte',s=>{ s.contrast-=Math.round(20*k); s.blacks+=Math.round(12*k); });
  if(has(/vibrant|colou?rful|saturat|more colou?r|vivid|pop/)&&!subj) add('More colour',s=>{ s.vibrance=clampv(s.vibrance+Math.round(25*k),-100,100); });
  if(has(/muted|desaturat|less colou?r|faded/)) add('Muted colour',s=>{ s.saturation-=Math.round(25*k); });
  if(has(/black and white|b&w|\bbw\b|monochrome|greyscale|grayscale/)) add('Black & white',s=>{ s.bwOn=true; });
  if(has(/sharp|crisp|clearer|detail/)&&!subj) add('Crisper',s=>{ s.clarity+=Math.round(15*k); s.sharpAmount=Math.min(150,s.sharpAmount+Math.round(20*k)); });
  if(has(/haze|hazy|fog|clear up/)) add('Remove haze',s=>{ s.dehaze+=Math.round(25*k); });
  if(has(/vintage|retro|film look|analog/)) add('Vintage film',s=>{ s.grainAmount=Math.max(s.grainAmount,Math.round(25*k)); s.contrast-=8; s.blacks+=10; s.wbTemp+=8; s.vigAmount=Math.min(s.vigAmount,-15); s.saturation-=10; });
  if(has(/vignette/)) add('Vignette',s=>{ s.vigAmount=Math.round(-25*k); });
  if(has(/noise|grain(y)?|denoise/)&&!has(/add grain/)) add('Reduce noise',s=>{ s.nrLum=Math.max(s.nrLum,Math.round(35*k)); s.nrColor=Math.max(s.nrColor,40); });
  if(has(/shadows?/)&&has(/lift|open|brighter|recover/)) add('Lift shadows',s=>{ s.shadows=clampv(s.shadows+Math.round(35*k),-100,100); });
  if(has(/highlights?/)&&has(/recover|tame|reduce|less/)) add('Recover highlights',s=>{ s.highlights=clampv(s.highlights-Math.round(45*k),-100,100); });
  return acts; }
window.parsePrompt=t=>parsePrompt(t).map(a=>a.label);
async function runPrompt(){ const txt=$('#aiPrompt').value.trim(); if(!txt||!S) return; const acts=parsePrompt(txt);
  $('#aiParsed').innerHTML=acts.length?'Understood: '+acts.map(a=>`<span class="aiChip">${a.label}</span>`).join(' '):'Sorry, I didn\'t recognise that. Try words like warmer, brighter, dramatic sky, blur background, remove the person, replace sky with sunset.';
  const edits=acts.filter(a=>a.f); if(edits.length){ endPreview(); const s=clone(S); edits.forEach(a=>a.f(s)); S=s; curPhoto().settings=S; syncUI(); schedule(true); commit('Prompt: '+txt.slice(0,40)); }
  for(const a of acts.filter(a=>a.special)) await a.special(); window.__lastPrompt=acts.map(a=>a.label); }
$('#aiGo').onclick=runPrompt; $('#aiPrompt').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); runPrompt(); } e.stopPropagation(); });

/* ---------- tap to remove (AI segmentation -> shape-following remove strokes) ---------- */
const DL=['background','aeroplane','bicycle','bird','boat','bottle','bus','car','cat','chair','cow','table','dog','horse','motorbike','person','plant','sheep','sofa','train','tv'];
const ALIAS={people:'person',man:'person',woman:'person',guy:'person',girl:'person',boy:'person',child:'person',kid:'person',tourist:'person',bike:'bicycle',motorcycle:'motorbike',plane:'aeroplane',vehicle:'car',van:'car',truck:'car'};
async function segAll(){ const D=window.srcHi; const c=document.createElement('canvas'); c.width=D.w; c.height=D.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(D.data),D.w,D.h),0,0);
  const seg=await psSegmenter(); const r=seg.segment(c); const ms=r.confidenceMasks; const mw=ms[0].width,mh=ms[0].height; const arr=ms.map(m=>m.getAsFloat32Array()); const cls=new Uint8Array(mw*mh);
  for(let i=0;i<mw*mh;i++){ let b=0,bv=-1; for(let k=0;k<arr.length;k++) if(arr[k][i]>bv){ bv=arr[k][i]; b=k; } cls[i]=b; } ms.forEach(m=>m.close&&m.close()); return {cls,mw,mh}; }
function compAt(S_,mw,mh,x,y,cl){ const lab=new Uint8Array(mw*mh); const st=[y*mw+x]; lab[st[0]]=1; let n=0; while(st.length){ const i=st.pop(); n++; const px=i%mw,py=(i/mw)|0; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const X=px+dx,Y=py+dy; if(X<0||Y<0||X>=mw||Y>=mh) continue; const j=Y*mw+X; if(!lab[j]&&S_[j]===cl){ lab[j]=1; st.push(j); } } } return {lab,n}; }
function removeMask(lab,mw,mh,name){ // zig-zag strokes per band covering the mask extent (dilated), like removeBox but shape-following
  const [Wp,Hp]=photoDims(); const Lm=Math.max(Wp,Hp); let y0=mh,y1=-1,x0=mw,x1=-1; for(let y=0;y<mh;y++) for(let x=0;x<mw;x++) if(lab[y*mw+x]){ if(y<y0)y0=y; if(y>y1)y1=y; if(x<x0)x0=x; if(x>x1)x1=x; }
  if(y1<0) return false; const bw=(x1-x0+1)/mw*Wp, bh=(y1-y0+1)/mh*Hp; const rpx=Math.max(6,Math.min(Math.min(bw,bh)/3.2,0.06*Lm)); const size=+(rpx/(0.25*Lm)*100).toFixed(2);
  const band=Math.max(1,Math.round(rpx*1.2/Hp*mh)); const pad=rpx*0.35/Wp; const pts=[]; let k=0;
  for(let y=y0;y<=y1;y+=band){ let a=mw,b=-1; for(let yy=y;yy<Math.min(mh,y+band);yy++) for(let x=x0;x<=x1;x++) if(lab[yy*mw+x]){ if(x<a)a=x; if(x>b)b=x; } if(b<0) continue;
    const yc=(Math.min(y1,y+band/2)+0.5)/mh; const L=[(a/mw)-pad+rpx*0.5/Wp,yc], R=[((b+1)/mw)+pad-rpx*0.5/Wp,yc]; if(R[0]<L[0]){ const m=(L[0]+R[0])/2; L[0]=R[0]=m; } pts.push(...(k++%2?[R,L]:[L,R])); }
  S.healStrokes.push({id:'h'+uid(),mode:'remove',size,feather:30,pts:pts.map(p=>[+clampv(p[0],0,1).toFixed(5),+clampv(p[1],0,1).toFixed(5)]),off:[0,0],det:name+' (AI)'}); schedule(true); commit('Remove '+name+' (AI)'); window.ensureFill&&ensureFill(); return true; }
async function removeAt(u,v){ busy(true,'Finding the object (on this device)…'); try{ const {cls,mw,mh}=await segAll(); const x=clampv(Math.floor(u*mw),0,mw-1), y=clampv(Math.floor(v*mh),0,mh-1); let cl=cls[y*mw+x];
    if(!cl){ // search a small neighbourhood for an object class
      let best=0,bd=1e9; const R=Math.round(mw*0.03); for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){ const X=x+dx,Y=y+dy; if(X<0||Y<0||X>=mw||Y>=mh) continue; const c=cls[Y*mw+X]; if(c&&dx*dx+dy*dy<bd){ bd=dx*dx+dy*dy; best=c; } } cl=best; }
    busy(false); if(!cl){ toast('No object found there. Try the Remove brush instead.',3000); return false; }
    let sx=x,sy=y; if(cls[y*mw+x]!==cl){ outer: for(let r=1;r<mw;r++) for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){ const X=x+dx,Y=y+dy; if(X>=0&&Y>=0&&X<mw&&Y<mh&&cls[Y*mw+X]===cl){ sx=X; sy=Y; break outer; } } }
    const {lab,n}=compAt(cls,mw,mh,sx,sy,cl); if(n>mw*mh*0.45){ toast('That object is too large to remove cleanly',3000); return false; }
    window.__tapRm={cls:DL[cl],n,frac:n/(mw*mh)}; const ok=removeMask(lab,mw,mh,DL[cl]); if(ok) toast('Removing '+DL[cl]+'…'); return ok; }catch(e){ busy(false); console.error(e); toast('AI segmentation unavailable: '+e.message,3000); return false; } }
window.aiRemoveAt=removeAt;
async function removeByName(word){ word=ALIAS[word]||word.replace(/s$/,''); if(!DL.includes(word)) word=word==='object'||word==='thing'?null:word;
  const {cls,mw,mh}=await segAll(); const want=word?DL.indexOf(word):-1; const seen=new Uint8Array(mw*mh); let best=null;
  for(let i=0;i<mw*mh;i++){ const c=cls[i]; if(!c||seen[i]||(want>0&&c!==want)) continue; const r=compAt(cls,mw,mh,i%mw,(i/mw)|0,c); for(let j=0;j<r.lab.length;j++) if(r.lab[j]) seen[j]=1; if(r.n<mw*mh*0.45&&(!best||r.n>best.n)) best={...r,c}; }
  if(!best){ toast(word?`No ${word} found to remove`:'Nothing removable found',3000); return; } removeMask(best.lab,mw,mh,DL[best.c]); toast('Removing '+DL[best.c]+'…'); }
let tapArm=false; $('#aiTapRm').onclick=()=>{ tapArm=!tapArm; $('#aiTapRm').classList.toggle('on',tapArm); if(tapArm) toast('Tap the person or object you want to remove',2500); };
let tp=null; $('#stage').addEventListener('pointerdown',e=>{ if(tapArm) tp=[e.clientX,e.clientY]; },true);
$('#stage').addEventListener('pointerup',e=>{ if(!tapArm||!tp) return; const d=Math.hypot(e.clientX-tp[0],e.clientY-tp[1]); tp=null; if(d>10) return; e.stopPropagation(); tapArm=false; $('#aiTapRm').classList.remove('on'); const [u,v]=dispToSrc(e.clientX,e.clientY); removeAt(u,v); },true);

/* ---------- sky replacement (procedural built-in skies + relighting) ---------- */
function rnd(seed){ return ()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; }; }
function makeSky(kind,W,H){ const c=document.createElement('canvas'); c.width=W; c.height=H; const g=c.getContext('2d'); const R=rnd(7+kind.length);
  const P={sunset:[['#1b2a5a',0],['#7b3f7a',.35],['#f06a3a',.7],['#ffc46b',1]],blue:[['#2f6fd0',0],['#6aa7ea',.6],['#cfe6fb',1]],dramatic:[['#1d232c',0],['#3b4654',.5],['#8b939c',1]],golden:[['#4a6fa8',0],['#e9a85a',.65],['#ffe0a0',1]],night:[['#03061a',0],['#0c1840',.7],['#1d2f63',1]]}[kind];
  const gr=g.createLinearGradient(0,0,0,H); P.forEach(([col,p])=>gr.addColorStop(p,col)); g.fillStyle=gr; g.fillRect(0,0,W,H);
  if(kind==='sunset'||kind==='golden'){ const sx=W*0.68,sy=H*0.86; const rg=g.createRadialGradient(sx,sy,0,sx,sy,H*0.9); rg.addColorStop(0,'rgba(255,240,190,0.95)'); rg.addColorStop(.12,'rgba(255,200,120,0.6)'); rg.addColorStop(1,'rgba(255,120,60,0)'); g.fillStyle=rg; g.fillRect(0,0,W,H); }
  if(kind==='night'){ for(let i=0;i<W*H/900;i++){ const a=R(); g.fillStyle=`rgba(255,255,255,${0.3+0.7*R()*a})`; const r=R()<0.97?0.6+R()*0.8:1.6; g.beginPath(); g.arc(R()*W,R()*H*0.95,r,0,7); g.fill(); } return c; }
  const cl={sunset:'255,170,140',blue:'255,255,255',dramatic:'40,46,56',golden:'255,225,180'}[kind], hl={sunset:'255,215,170',blue:'255,255,255',dramatic:'150,158,170',golden:'255,240,200'}[kind];
  const n=kind==='dramatic'?140:kind==='blue'?60:70; g.filter=`blur(${Math.round(W/90)}px)`;
  for(let i=0;i<n;i++){ const x=R()*W, y=(kind==='blue'?0.15+R()*0.6:R()*0.75)*H, rx=W*(0.04+R()*0.12), ry=rx*(0.25+R()*0.25); g.fillStyle=`rgba(${R()<0.5?cl:hl},${kind==='dramatic'?0.55:0.35+R()*0.35})`; g.beginPath(); g.ellipse(x,y,rx,ry,0,0,7); g.fill(); }
  g.filter='none'; return c; }
window.makeSky=makeSky;
function geomNeutral(){ const d=defaults(); return ['crop','angle','aspect','distortion','perspV','perspH','perspScale','perspRot','perspAspect','perspX','perspY','vol'].every(k=>JSON.stringify(S[k])===JSON.stringify(d[k])); }
async function skyReplace(kind){ const p=curPhoto(); if(!p) return; if(!geomNeutral()){ toast('Sky replacement works on the uncropped, untransformed photo: reset crop & transform first (or use a snapshot).',5000); return; }
  busy(true,'Finding the sky (on this device)…'); if(window.ensureAI) await ensureAI('sky'); let m=null; for(let i=0;i<300&&!(m=aiMaskFor('sky'));i++) await new Promise(r=>setTimeout(r,100)); if(!m){ busy(false); return toast('Could not find a sky in this photo',3000); }
  busy(true,'Rendering…'); const r=await renderExport(p,{fmt:'png',q:100,size:'edge',edge:isTouch?2400:3600,exif:false}); const bm=await createImageBitmap(r.blob); const W=bm.width,H=bm.height;
  let mk=m; if(S.orient||S.flipH) mk=orientCanvas(m,S.orient,S.flipH); const mc=document.createElement('canvas'); mc.width=W; mc.height=H; const mg=mc.getContext('2d'); mg.imageSmoothingQuality='high'; mg.drawImage(mk,0,0,W,H);
  const mi=mg.getImageData(0,0,W,H), md=mi.data; for(let i=3;i<md.length;i+=4){ const t=Math.max(0,Math.min(1,(md[i]/255-0.4)/0.45)); md[i]=Math.round(t*t*(3-2*t)*255); } mg.putImageData(mi,0,0); let top=H,bot=0,area=0; for(let y=0;y<H;y+=4) for(let x=0;x<W;x+=4) if(md[(y*W+x)*4+3]>128){ area++; if(y<top) top=y; if(y>bot) bot=y; } if(area<(W*H/16)*0.03){ busy(false); bm.close&&bm.close(); return toast('Not enough sky found to replace',3000); }
  const skyH=Math.max(bot+H*0.08,H*0.3); const sky=makeSky(kind,Math.round(W/2),Math.round(skyH/2));
  const out=document.createElement('canvas'); out.width=W; out.height=H; const g=out.getContext('2d'); g.drawImage(bm,0,0); bm.close&&bm.close();
  const sc=document.createElement('canvas'); sc.width=W; sc.height=H; const sg=sc.getContext('2d'); sg.drawImage(sky,0,0,W,skyH); sg.fillStyle=sg.createLinearGradient(0,0,0,1); sg.globalCompositeOperation='destination-in'; sg.drawImage(mc,0,0); sg.globalCompositeOperation='source-over';
  // relight foreground toward the new sky's colour and brightness
  const sd=sky.getContext('2d').getImageData(0,0,sky.width,sky.height).data; let sr=0,sgc=0,sb=0,n=0; for(let i=0;i<sd.length;i+=64){ sr+=sd[i]; sgc+=sd[i+1]; sb+=sd[i+2]; n++; } sr/=n; sgc/=n; sb/=n; const avg=(sr+sgc+sb)/3||1;
  const amt=0.22; g.globalCompositeOperation='multiply'; g.globalAlpha=amt; g.fillStyle=`rgb(${Math.min(255,sr/avg*235)|0},${Math.min(255,sgc/avg*235)|0},${Math.min(255,sb/avg*235)|0})`; g.fillRect(0,0,W,H);
  g.globalAlpha=1; g.globalCompositeOperation='source-over'; if(kind==='night'||kind==='dramatic'){ g.fillStyle=`rgba(0,0,20,${kind==='night'?0.35:0.15})`; g.fillRect(0,0,W,H); }
  g.drawImage(sc,0,0); busy(false);
  const blob=await canvasBlob(out,'image/jpeg',0.92); window.__skyOut={W,H,area:+(area/(W*H/16)).toFixed(3),size:blob.size};
  const url=URL.createObjectURL(blob); $('#dlg').innerHTML=`<h3>Replace sky: ${kind}</h3><div class="privBadge">🔒 Private: runs on your device, nothing uploaded</div><div class="cvView"><img src="${url}" style="max-width:100%;max-height:62vh"></div><div class="cvNote">Built-in procedural sky with foreground relighting. Saved as a new photo so your original edit stays untouched.</div><div class="row cvBtns"><button class="btn primary" id="skyAdd">Add to library</button><button class="btn" id="skyDl">Download JPG</button><button class="btn" id="skyClose">Close</button></div>`; $('#dlg').classList.add('cvDlg'); $('#modal').hidden=false;
  const nm=p.name.replace(/\.[^.]+$/,'')+'-sky-'+kind+'.jpg'; $('#skyClose').onclick=()=>{ $('#modal').hidden=true; URL.revokeObjectURL(url); };
  $('#skyDl').onclick=()=>{ const a=document.createElement('a'); a.href=url; a.download=nm; a.click(); }; $('#skyAdd').onclick=async()=>{ $('#modal').hidden=true; await importFiles([new File([blob],nm,{type:'image/jpeg'})]); toast('Added '+nm); }; }
window.skyReplace=skyReplace; $('#aiSkyBtn').onclick=()=>skyReplace($('#aiSkyKind').value);

/* ---------- Learn my style: ridge regression from image stats to slider values ---------- */
const SK=['exposure','contrast','highlights','shadows','whites','blacks','wbTemp','wbTint','vibrance','saturation','clarity','dehaze','texture'];
const FK=['L','sd','hi','lo','cast','tint','sat'];
function solve(A,b){ const n=b.length; const M=A.map((r,i)=>[...r,b[i]]); for(let c=0;c<n;c++){ let p=c; for(let r=c+1;r<n;r++) if(Math.abs(M[r][c])>Math.abs(M[p][c])) p=r; [M[c],M[p]]=[M[p],M[c]]; const d=M[c][c]||1e-9; for(let r=0;r<n;r++){ if(r===c) continue; const f=M[r][c]/d; for(let k=c;k<=n;k++) M[r][k]-=f*M[c][k]; } } return M.map((r,i)=>r[n]/(r[i]||1e-9)); }
async function learn(){ const ed=photos.filter(p=>p.edited&&!p.virtual); if(ed.length<2){ $('#aiStyleInfo').textContent='Edit at least 2 photos first (3+ works better), then tap Learn.'; return; }
  busy(true,'Learning your style…'); const X=[],Y=[]; for(const p of ed){ try{ const st=await photoStats(p); X.push(FK.map(k=>st[k])); Y.push(SK.map(k=>+p.settings[k]||0)); }catch(e){} } busy(false);
  const n=X.length, d=FK.length; const mu=FK.map((_,j)=>X.reduce((a,r)=>a+r[j],0)/n), sdv=FK.map((_,j)=>Math.sqrt(X.reduce((a,r)=>a+(r[j]-mu[j])**2,0)/n)||1);
  const Z=X.map(r=>[1,...r.map((v,j)=>(v-mu[j])/sdv[j])]); const lam=n<5?4:1.5; const W=SK.map((_,s)=>{ const A=Array.from({length:d+1},(_,i)=>Array.from({length:d+1},(_,j)=>Z.reduce((a,z)=>a+z[i]*z[j],0)+(i===j&&i>0?lam:0))); const b=Array.from({length:d+1},(_,i)=>Z.reduce((a,z,k)=>a+z[i]*Y[k][s],0)); return solve(A,b); });
  const model={n,mu,sdv,W,at:Date.now()}; localStorage.setItem('ps.style',JSON.stringify(model)); window.__style=model;
  const mean=SK.map((_,s)=>Y.reduce((a,y)=>a+y[s],0)/n); $('#aiStyleInfo').textContent=`Learned from ${n} edited photos. Typical: `+SK.map((k,i)=>Math.abs(mean[i])>=(k==='exposure'?0.05:2)?`${k} ${mean[i]>0?'+':''}${k==='exposure'?mean[i].toFixed(2):Math.round(mean[i])}`:null).filter(Boolean).slice(0,6).join(', '); return model; }
function predict(model,st){ const z=[1,...FK.map((k,j)=>(st[k]-model.mu[j])/model.sdv[j])]; const o={}; SK.forEach((k,s)=>{ let v=model.W[s].reduce((a,w,i)=>a+w*z[i],0); v=k==='exposure'?clampv(+v.toFixed(2),-3,3):clampv(Math.round(v),-100,100); o[k]=v; }); return o; }
async function applyStyle(){ const model=JSON.parse(localStorage.getItem('ps.style')||'null'); if(!model) return toast('Tap “Learn from my edits” first');
  const list=(typeof targets==='function'?targets():[]).filter(Boolean); const L=list.length?list:(curPhoto()?[curPhoto()]:[]); if(!L.length) return toast('Select photos (Library) or open one');
  busy(true,'Applying your style…'); let n=0; const res=[];
  for(const p of L){ try{ const st=await photoStats(p); const v=predict(model,st); res.push(v);
      if(p.id===cur&&S){ Object.assign(S,v); syncUI(); schedule(true); commit('My style'); }
      else { const s=fillDefaults(clone(p.settings)); Object.assign(s,v); p.settings=s; p.history=p.history.slice(0,p.hIdx+1); p.history.push({label:'My style',s:clone(s)}); p.hIdx=p.history.length-1; p.edited=true; p.editedAt=Date.now(); savePhoto(p); }
      n++; }catch(e){ console.error(e); } }
  busy(false); window.__styleOut=res; if(mode==='library') renderLibrary(); toast(`Applied your style to ${n} photo${n>1?'s':''}`); }
window.learnStyle=learn; window.applyStyle=applyStyle; $('#aiLearn').onclick=learn; $('#aiApplyStyle').onclick=applyStyle;
{ const m=localStorage.getItem('ps.style'); if(m){ try{ $('#aiStyleInfo').textContent='Style model saved from '+JSON.parse(m).n+' photos.'; }catch(e){} } }
// Library: apply style to selection from the More menu
const lb=document.createElement('button'); lb.className='btn'; lb.id='styleLibBtn'; lb.textContent='✨ Apply my style'; lb.title='Apply your learned style to the selected photos'; lb.onclick=applyStyle;
const grp=[...document.querySelectorAll('#libMore .mGrp')].find(g=>g.firstChild&&g.firstChild.textContent==='Edit'); if(grp) grp.appendChild(lb);
},0));
