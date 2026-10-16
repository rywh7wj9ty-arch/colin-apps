'use strict';
/* Automatic keywording: MediaPipe EfficientNet-Lite0 (ImageNet) + EfficientDet-Lite0 (COCO) + face detector,
   plus colour/scene heuristics and EXIF-derived tags. Runs in a background idle queue after import. */
(()=>{
const R=(a,b,...t)=>({a,b,t}); // ImageNet index range -> keywords
const IN=[R(0,6,'fish','animal'),R(7,24,'bird','animal'),R(80,100,'bird','animal'),R(127,146,'bird','animal'),R(25,32,'amphibian','animal'),R(33,68,'reptile','animal'),
 R(69,79,'insect','animal'),R(300,326,'insect','animal'),R(101,106,'animal'),R(107,126,'sea life','animal'),R(147,150,'marine mammal','animal'),
 R(151,268,'dog','animal','pet'),R(269,280,'wild animal','animal'),R(281,285,'cat','animal','pet'),R(286,293,'big cat','wild animal','animal'),R(294,297,'bear','animal'),
 R(330,332,'rabbit','animal'),R(333,338,'rodent','animal'),R(339,339,'horse','animal'),R(340,340,'zebra','animal'),R(341,343,'pig','animal'),R(344,353,'animal'),R(354,355,'animal'),
 R(356,364,'animal'),R(365,384,'monkey','animal'),R(385,386,'elephant','animal'),R(387,388,'panda','animal'),R(389,397,'fish','animal'),
 R(923,969,'food'),R(948,957,'fruit','food'),R(936,947,'vegetable','food'),R(985,986,'flower'),R(947,947,'mushroom'),R(991,997,'mushroom'),
 R(970,980,'landscape','nature'),R(973,973,'underwater'),R(966,966,'drink'),R(967,969,'drink')];
const NAMES={279:'fox',277:'fox',278:'fox',280:'fox',269:'wolf',270:'wolf',271:'wolf',272:'coyote',273:'dingo',275:'african wild dog',291:'lion',292:'tiger',290:'jaguar',288:'leopard',293:'cheetah',
 963:'pizza',933:'burger',934:'hot dog',965:'burrito',930:'bread',931:'bagel',928:'ice cream',927:'dessert',937:'broccoli',924:'guacamole',959:'pasta',962:'meatloaf',926:'soup',925:'soup',935:'mashed potato',
 966:'wine',967:'coffee',968:'coffee',948:'apple',949:'strawberry',950:'orange',951:'lemon',953:'pineapple',954:'banana',957:'pomegranate',
 970:'mountains',972:'cliff',973:'coral reef',974:'geyser',975:'lake',976:'coast',977:'beach',978:'beach',979:'valley',980:'volcano',985:'daisy',
 339:'horse',340:'zebra',344:'hippo',345:'cattle',346:'buffalo',347:'bison',348:'sheep',349:'sheep',350:'goat',351:'deer',352:'antelope',353:'gazelle',354:'camel',355:'llama',356:'weasel',360:'otter',361:'skunk',362:'badger',
 385:'elephant',386:'elephant',387:'panda',388:'red panda',
 // vehicles
 407:'ambulance',436:'car',468:'taxi',511:'car',609:'jeep',627:'limousine',656:'van',661:'vintage car',717:'pickup truck',751:'race car',817:'sports car',864:'truck',867:'truck',569:'truck',675:'truck',734:'police car',757:'camper van',803:'snowplow',
 779:'bus',874:'bus',654:'bus',705:'train',565:'train',466:'train',547:'train',820:'steam train',829:'tram',444:'bicycle',671:'bicycle',870:'tricycle',880:'unicycle',665:'moped',670:'scooter',
 404:'airplane',895:'airplane',908:'airplane',417:'hot air balloon',403:'ship',510:'ship',628:'ship',724:'ship',780:'sailing boat',914:'sailing boat',484:'sailing boat',871:'sailing boat',554:'boat',576:'gondola',625:'boat',814:'speedboat',693:'canoe',472:'canoe',833:'submarine',
 // buildings & places
 425:'barn',449:'boathouse',483:'castle',497:'church',498:'cinema',580:'greenhouse',663:'monastery',668:'mosque',698:'palace',727:'planetarium',832:'stupa',762:'restaurant',582:'grocery store',
 821:'bridge',839:'bridge',888:'viaduct',437:'lighthouse',460:'breakwater',536:'harbour',858:'roof',900:'water tower',406:'altar',624:'library',
 // misc common subjects
 487:'phone',527:'computer',590:'computer',620:'laptop',681:'laptop',782:'monitor',664:'monitor',851:'television',759:'camera',732:'camera',
 834:'suit',655:'military uniform',841:'sweater',869:'trench coat',617:'lab coat',400:'academic gown',
 559:'folding chair',423:'chair',765:'chair',532:'table',526:'desk',831:'bed',
 489:'fence',716:'fence',912:'fence',825:'stone wall',
 508:'keyboard',402:'guitar',546:'guitar',889:'violin',579:'piano',881:'piano',
 440:'beer',720:'pill bottle',
 768:'rugby ball',805:'football',852:'tennis ball',890:'volleyball',430:'basketball',
 445:'swimwear',459:'swimwear',639:'swimwear',
 970:'mountains'};
const GROUPS=[[[436,468,511,609,627,656,661,717,751,817,734,757,407],['car','vehicle']],[[864,867,569,675,803],['truck','vehicle']],[[779,874,654],['bus','vehicle']],
 [[705,565,466,547,820,829],['train','transport']],[[444,671,870,880,665,670],['bicycle','transport']],[[404,895,908,417],['aircraft','transport']],
 [[403,510,628,724,780,914,484,871,554,576,625,814,693,472,833],['boat','water']],[[425,449,483,497,498,580,663,668,698,727,832,762,582,437,900,858,406,624],['building','architecture']],
 [[821,839,888],['bridge','architecture']],[[497,663,668,832,406],['religious building']],[[483,698],['historic']],[[975,976,977,978,460,536],['water']]];
const COCO={person:['people'],bicycle:['bicycle','transport'],car:['car','vehicle'],motorcycle:['motorcycle','vehicle'],airplane:['aircraft','transport'],bus:['bus','vehicle'],train:['train','transport'],truck:['truck','vehicle'],boat:['boat','water'],
 bird:['bird','animal'],cat:['cat','animal','pet'],dog:['dog','animal','pet'],horse:['horse','animal'],sheep:['sheep','animal'],cow:['cattle','animal'],elephant:['elephant','animal'],bear:['bear','animal'],zebra:['zebra','animal'],giraffe:['giraffe','animal'],
 banana:['banana','fruit','food'],apple:['apple','fruit','food'],orange:['orange','fruit','food'],sandwich:['sandwich','food'],broccoli:['broccoli','vegetable','food'],carrot:['carrot','vegetable','food'],'hot dog':['hot dog','food'],pizza:['pizza','food'],donut:['doughnut','food'],cake:['cake','food'],
 'wine glass':['drink'],cup:['drink'],bottle:['drink'],bowl:['food'],'dining table':['table'],'cell phone':['phone'],laptop:['laptop'],tv:['television'],book:['book'],'teddy bear':['toy'],umbrella:['umbrella'],
 'sports ball':['sport'],skis:['skiing','snow','sport'],snowboard:['snowboarding','snow','sport'],surfboard:['surfing','sport','water'],skateboard:['skateboarding','sport'],kite:['kite'],'tennis racket':['tennis','sport'],'baseball bat':['baseball','sport'],'baseball glove':['baseball','sport'],frisbee:['sport'],
 bench:['bench'],'traffic light':['street','city'],'fire hydrant':['street','city'],'stop sign':['street','city'],'parking meter':['street','city'],couch:['interior'],bed:['interior'],chair:['chair'],'potted plant':['plant'],clock:['clock'],vase:['vase'],suitcase:['travel'],backpack:['bag'],handbag:['bag']};
let models=null, fail=false;
async function load(){ if(fail) return null; if(!models) models=(async()=>{ const v=await import('./mediapipe/vision_bundle.mjs'); const fs=await v.FilesetResolver.forVisionTasks(new URL('mediapipe/wasm',location.href).href);
  const u=n=>new URL('mediapipe/'+n,location.href).href;
  const [cls,det]=await Promise.all([v.ImageClassifier.createFromOptions(fs,{baseOptions:{modelAssetPath:u('efficientnet_lite0.tflite'),delegate:'CPU'},runningMode:'IMAGE',maxResults:8,scoreThreshold:0.04}),
    v.ObjectDetector.createFromOptions(fs,{baseOptions:{modelAssetPath:u('efficientdet_lite0.tflite'),delegate:'CPU'},runningMode:'IMAGE',maxResults:25,scoreThreshold:0.3})]);
  let face=null; try{ face=window.loadFace?await loadFace():null; }catch(e){}
  return {cls,det,face}; })();
  try{ return await models; }catch(e){ console.warn('auto-tagging models unavailable',e); fail=true; return null; } }
const lin=v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
function stats(c){ const g=c.getContext('2d'); const {width:W,height:H}=c; const d=g.getImageData(0,0,W,H).data; let L=0,sat=0,n=0,skyTop=0,nTop=0,green=0,snow=0,warm=0,lowSat=0;
  for(let y=0;y<H;y+=2) for(let x=0;x<W;x+=2){ const k=(y*W+x)*4, r=d[k]/255,gg=d[k+1]/255,b=d[k+2]/255; const mx=Math.max(r,gg,b), mn=Math.min(r,gg,b), s=mx?(mx-mn)/mx:0; const l=0.2126*r+0.7152*gg+0.0722*b;
    L+=lin(l); sat+=s; n++; if(s<0.08) lowSat++; if(gg>r*1.05&&gg>b*1.05&&s>0.2) green++; if(l>0.85&&s<0.12) snow++; if(r>b*1.25&&s>0.25) warm++;
    if(y<H*0.3){ nTop++; const blue=b>r*1.08&&b>=gg*0.95&&l>0.35; const grey=s<0.1&&l>0.6; if(blue||grey) skyTop++; } }
  // edge density in top band (sky is smooth)
  let e=0,ne=0; for(let y=2;y<H*0.3;y+=3) for(let x=2;x<W-2;x+=3){ const k=(y*W+x)*4; e+=Math.abs(d[k+1]-d[k+5])+Math.abs(d[k+1]-d[k+1+W*4]); ne++; }
  return {L:L/n,sat:sat/n,sky:skyTop/Math.max(nTop,1),topEdge:e/Math.max(ne,1),green:green/n,snow:snow/n,warm:warm/n,bw:lowSat/n}; }
const exifNum=x=>x==null?NaN:typeof x==='number'?x:Array.isArray(x)?x[0]/(x[1]||1):x.numerator!=null?x.numerator/x.denominator:+x;
async function tagPhoto(p){ const M=await load(); const blob=p.thumb||await blobGet(p.rawStored?p.id+':prev':p.id); if(!blob) return null;
  const bmp=await createImageBitmap(blob); const k=Math.min(1,512/Math.max(bmp.width,bmp.height)); const c=document.createElement('canvas'); c.width=Math.round(bmp.width*k); c.height=Math.round(bmp.height*k); c.getContext('2d').drawImage(bmp,0,0,c.width,c.height); bmp.close&&bmp.close();
  const sc=new Map(); const add=(t,s,src)=>{ if(!t) return; const o=sc.get(t); if(!o||o.s<s) sc.set(t,{s,src}); };
  const st=stats(c); const dbg={cls:[],det:[]}; const clsAll=[]; const sumR=(a,b)=>clsAll.filter(([i])=>i>=a&&i<=b).reduce((x,[,v])=>x+v,0); let people=0, bigPerson=0, faces=[];
  if(M){ const t0=performance.now();
    const cr=M.cls.classify(c); for(const q of (cr.classifications[0]||{categories:[]}).categories){ dbg.cls.push([q.categoryName,+q.score.toFixed(2)]); const i=q.index, s=q.score;
      const nm=NAMES[i]; if(nm&&s>0.25) add(nm,s,'cls'); clsAll.push([i,s]); for(const r of IN) if(i>=r.a&&i<=r.b) r.t.forEach((t,j)=>add(t,s*(j?0.9:1)*(nm||j||s>0.2?1:0.8),'cls'));
      for(const [ids,tags] of GROUPS) if(ids.includes(i)) tags.forEach(t=>add(t,s*0.95,'cls'));
      if(!nm&&!IN.some(r=>i>=r.a&&i<=r.b)&&!GROUPS.some(([ids])=>ids.includes(i))&&s>0.45) add(q.categoryName.split(',')[0].toLowerCase(),s*0.8,'cls'); }
    const dr=M.det.detect(c); const A=c.width*c.height; const animalCls=sumR(0,397); const ANIM=['bird','cat','dog','horse','sheep','cow','elephant','bear','zebra','giraffe']; let detCat=0, detDog=0;
    for(const d of dr.detections||[]){ const q=d.categories[0]; dbg.det.push([q.categoryName,+q.score.toFixed(2)]); const s=q.score; const area=d.boundingBox.width*d.boundingBox.height/A;
      if(q.categoryName==='person'){ if(s>0.45){ people++; bigPerson=Math.max(bigPerson,area); } continue; }
      if(ANIM.includes(q.categoryName)&&animalCls<0.15&&s<0.75) continue; if(q.categoryName==='cat') detCat=Math.max(detCat,s); if(q.categoryName==='dog') detDog=Math.max(detDog,s);
      const tags=COCO[q.categoryName]; if(tags&&s>0.42) tags.forEach((t,j)=>add(t,Math.min(0.99,s*(j?0.9:1)*(0.75+Math.min(0.25,area*2))),'det')); }
    // resolve domestic vs wild animals
    const dom=sumR(281,285)+detCat*0.5, big=sumR(286,293); if(big&&dom>=big*0.7){ sc.delete('big cat'); sc.delete('wild animal'); }
    const wildC=sumR(269,280), dogs=sumR(151,268)+detDog*0.5; if(wildC>dogs){ sc.delete('dog'); sc.delete('pet'); } else if(wildC&&dogs>wildC){ ['wild animal','fox','wolf','coyote'].forEach(t=>sc.delete(t)); }
    if(M.face){ try{ faces=(M.face.detect(c).detections||[]).filter(f=>f.categories[0].score>0.6); }catch(e){} }
    dbg.ms=Math.round(performance.now()-t0); }
  // people / portrait / group
  const faceArea=Math.max(0,...faces.map(f=>f.boundingBox.width*f.boundingBox.height/(c.width*c.height)));
  if(people){ add('people',0.9,'det'); const n=Math.max(people,faces.length); if(n>=3) add('group',0.8,'det'); else if(bigPerson>0.12||faceArea>0.02) add('portrait',0.85,'det'); if(faceArea>0.12) add('close-up',0.6,'det'); }
  // scene heuristics
  const animalOrFood=[...sc.keys()].some(t=>t==='animal'||t==='food');
  if(st.sky>0.45&&st.topEdge<16) add('sky',0.7*Math.min(1,st.sky+0.2),'scene');
  if(sc.has('sky')&&!people&&!animalOrFood&&!sc.has('building')&&(st.green>0.12||st.snow>0.08||sc.has('mountains')||sc.has('water'))) add('landscape',0.72,'scene');
  if(st.green>0.25) add('nature',0.6,'scene'); if(st.snow>0.15&&st.L>0.35) add('snow',0.55,'scene');
  if(st.bw>0.97) add('black and white',0.95,'colour');
  // EXIF / file tags
  const e=p.exif||{}; const make=(e.Make||'').trim().split(/\s+/)[0]; if(make) add(make.charAt(0).toUpperCase()+make.slice(1).toLowerCase(),0.99,'exif');
  if(e.Model) add(String(e.Model).replace(new RegExp('^'+make,'i'),'').trim(),0.98,'exif');
  const ar=(p.w||c.width)/(p.h||c.height); add(ar>2.1?'panoramic':ar>1.05?'horizontal':ar<0.95?'vertical':'square',0.97,'exif');
  const dt=String(e.DateTimeOriginal||e.DateTime||''); const hr=+(dt.match(/\d{4}:\d\d:\d\d (\d\d)/)||[])[1]; const et=exifNum(e.ExposureTime), iso=exifNum(e.ISOSpeedRatings||e.ISO);
  const dark=st.L<0.06; const lowLight=(et>=1/15&&iso>=800)||iso>=3200;
  if(dark&&(lowLight||hr>=20||hr<=5)) add('night',0.85,'exif'); else if(dark) add('low key',0.6,'scene'); else if(hr>=7&&hr<=18||!dt) add('daytime',hr?0.6:0.45,'exif');
  if(p.raw) add('raw',0.99,'exif'); if(p.hdr) add('hdr',0.99,'exif'); if(p.pano) add('panorama',0.99,'exif');
  // rank: subject tags first (>=threshold), max 8, keep exif/meta tags after
  const TH=0.18; const subj=[...sc].filter(([t,o])=>o.src!=='exif'&&o.s>=TH).sort((a,b)=>b[1].s-a[1].s).map(x=>x[0]);
  const meta=[...sc].filter(([t,o])=>o.src==='exif').map(x=>x[0]);
  const block=new Set(p.kwBlock||[]); const tags=[...new Set([...subj.slice(0,8),...meta])].filter(t=>!block.has(t)&&!(p.keywords||[]).includes(t));
  return {tags,dbg,scores:Object.fromEntries([...sc].map(([t,o])=>[t,+o.s.toFixed(2)]))}; }
window.tagPhoto=tagPhoto;
// background queue
const on=()=>localStorage.getItem('ps.autotag')!=='0'; const Q=[]; let running=false; let done=0,total=0;
function status(){ const el=document.getElementById('tagStatus'); if(el) el.textContent=running?`🏷 Tagging ${done}/${total}…`:''; }
function enqueue(list,force){ for(const p of list){ if(!force&&(p.autoTagged||p.virtual)) continue; if(!Q.includes(p.id)) { Q.push(p.id); total++; } } status(); if(!running) setTimeout(run,force?50:800); }
async function run(){ if(running) return; running=true; status();
  while(Q.length){ const id=Q.shift(); const p=photos.find(x=>x.id===id); if(!p) { done++; continue; }
    await new Promise(r=>(window.requestIdleCallback||setTimeout)(r,{timeout:400}));
    try{ const r=await tagPhoto(p); if(r){ p.autoKw=r.tags; p.autoTagged=Date.now(); p.autoDbg=r.dbg; savePhoto(p,0); } }catch(e){ console.error('tagging failed',p.name,e); p.autoTagged=-1; }
    done++; status(); if(mode==='library'&&!Q.length) renderLibrary(); }
  running=false; done=total=0; status(); if(mode==='library') renderLibrary(); window.__tagIdle=Date.now(); }
window.autoTag={enqueue:(l,f)=>enqueue(l,f),busy:()=>running||Q.length>0,on};
addEventListener('DOMContentLoaded',()=>{
  const b=document.createElement('button'); b.className='btn'; b.id='retagBtn'; b.textContent='🏷 Re-tag'; b.title='Run automatic keywording on the selected photos (or all if none selected)'; $('#selAll').before(b);
  const l=document.createElement('label'); l.className='chk'; l.id='autoTagLbl'; l.title='Automatically suggest keywords after import (on-device AI)'; l.innerHTML=`<input type="checkbox" id="autoTagOn" ${on()?'checked':''}> Auto-tag`; $('#selAll').before(l);
  const s=document.createElement('span'); s.id='tagStatus'; s.className='tagStatus'; $('#selAll').before(s);
  $('#autoTagOn').onchange=e=>{ localStorage.setItem('ps.autotag',e.target.checked?'1':'0'); if(e.target.checked) enqueue(photos); toast(e.target.checked?'Auto-tagging on':'Auto-tagging off',1200); };
  b.onclick=()=>{ const list=sel.size?photos.filter(p=>sel.has(p.id)):photos; list.forEach(p=>{ p.autoKw=[]; }); enqueue(list,true); toast(`Re-tagging ${list.length} photo${list.length>1?'s':''}…`,1500); };
  const rl=window.renderLibrary; window.renderLibrary=function(){ rl(); if(on()) { const fresh=photos.filter(p=>!p.autoTagged&&!p.virtual); if(fresh.length) enqueue(fresh); }
    $$('#grid .cell').forEach(c=>{ const p=photos.find(x=>x.id===c.dataset.id); if(!p||!(p.autoKw||[]).length) return; const kw=(p.keywords||[]).length; let bd=c.querySelector('.kwb'); if(!bd){ bd=document.createElement('span'); bd.className='kwb'; c.appendChild(bd); }
      bd.innerHTML=(kw?'🏷'+kw+' ':'')+`<i class="ai">AI ${p.autoKw.length}</i>`; c.title=[p.caption,(p.keywords||[]).join(', '),'Auto: '+p.autoKw.join(', ')].filter(Boolean).join(' — '); }); };
});
})();
