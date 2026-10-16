// Video Studio — app shell, viewer, playback, panels, inspector, shortcuts
import {S,on,emit,seq,rootSeq,selClips,selClip,dirty,commit,undo,redo,initHistory,save,seqLen} from './state.js';
import {db} from './db.js';
import * as M from './model.js';
import {layout,dur,newClip,newProject,clone,clamp,frameSize,findClip,kfVal,setKf,delKf,hasKfAt,isMediaKind,allClips} from './model.js';
import {Renderer} from './gl.js';
import {collect,drawLayers,TRANSITIONS} from './comp.js';
import {Sources} from './frame.js';
import {VPool,importFile,loadMedia,warmAudio,decodeAudio,audioBuf} from './media.js';
import {scheduleMix} from './audio.js';
import {initTimeline,drawTimeline,fitView,ensureVisible,zoomBy,x2t,t2x} from './timeline.js';
import {STYLES,FONTS,newTitle,drawTitle} from './titles.js';
import {BUILTIN_LUTS,getLut,parseCube,dropLutCache} from './luts.js';
import {exportMovie} from './exporter.js';
import {MOODS,makeMusic,THEMES,applyTheme,TRAILERS,buildTrailer,buildMagic,analyseStab,transcribe,startVoiceover} from './extras.js';
const $=(s,r=document)=>r.querySelector(s);
function h(tag,props={},...kids){const e=document.createElement(tag);for(const k in props){const v=props[k];if(k==='class')e.className=v;else if(k==='style')e.style.cssText=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='html')e.innerHTML=v;else if(v!==undefined&&v!==null&&v!==false)e.setAttribute(k,v===true?'':v);}
  for(const c of kids.flat()){if(c==null||c===false)continue;e.append(c.nodeType?c:document.createTextNode(c));}return e;}
const fmtTC=(t,fps=30)=>{t=Math.max(0,t);const f=Math.floor((t%1)*fps+1e-6),s=Math.floor(t)%60,m=Math.floor(t/60)%60,hh=Math.floor(t/3600);return (hh?hh+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+':'+String(f).padStart(2,'0');};
const fmtD=t=>{t=Math.max(0,t);const m=Math.floor(t/60),s=t%60;return m?`${m}:${s.toFixed(0).padStart(2,'0')}`:`${s.toFixed(1)}s`;};
function toast(msg,ms=2600){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),ms);}
function modal(title,body,{wide}={}){$('#mTitle').textContent=title;const b=$('#mBody');b.innerHTML='';b.append(body);$('#modal').hidden=false;$('.sheet').style.maxWidth=wide?'760px':'560px';}
function closeModal(){$('#modal').hidden=true;$('#mBody').innerHTML='';if(closeModal.cb){const f=closeModal.cb;closeModal.cb=null;f();}}
$('#mClose').onclick=closeModal;$('#modal').addEventListener('pointerdown',e=>{if(e.target.id==='modal')closeModal();});
S.mobile=matchMedia('(max-width:820px)').matches;matchMedia('(max-width:820px)').addEventListener('change',e=>{S.mobile=e.matches;layoutViewer();});
// ================= HOME =================
async function renderHome(){$('#home').hidden=false;$('#editor').hidden=true;const list=(await db.all('projects')).sort((a,b)=>b.modified-a.modified);const g=$('#projList');g.innerHTML='';
  if(!list.length)g.append(h('div',{class:'empty'},'No projects yet. Tap ',h('b',{},'New Movie'),' to start.'));
  for(const p of list){const len=layout(p.timeline).len;
    g.append(h('div',{class:'proj',onclick:()=>openProject(p.id)},h('div',{class:'th',style:p.thumb?`background-image:url(${p.thumb})`:''}),
      h('div',{class:'nm'},p.name),h('div',{class:'mt'},`${p.aspect} · ${fmtD(len)} · ${new Date(p.modified).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`),
      h('div',{class:'acts'},h('button',{title:'Duplicate',onclick:async e=>{e.stopPropagation();const c=clone(p);c.id=M.uid();c.name=p.name+' copy';c.modified=Date.now();await db.put('projects',c);renderHome();}},'⧉'),
        h('button',{title:'Delete',onclick:async e=>{e.stopPropagation();if(!confirm(`Delete “${p.name}”? This can't be undone.`))return;await db.del('projects',p.id);await gcMedia();renderHome();}},'🗑'))));}}
async function gcMedia(){const ps=await db.all('projects');const used=new Set(ps.flatMap(p=>p.media));for(const r of await db.all('media'))if(!used.has(r.id))await db.del('media',r.id);}
function chooseAspect(cb){modal('New project',h('div',{},h('p',{class:'hint'},'Choose a shape. You can change it later.'),
  ...[['16:9','Landscape — YouTube, TV'],['9:16','Vertical — Reels, TikTok, Stories'],['1:1','Square — Instagram feed']].map(([a,d])=>h('button',{class:'big',onclick:()=>{closeModal();cb(a);}},h('b',{},a),' — ',d))));}
async function createProject(aspect,name){const p=newProject(name||nextName(),aspect);await db.put('projects',p);await openProject(p.id);return p;}
let nameCount=0;function nextName(){return 'My Movie '+new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})+(nameCount++?' '+nameCount:'');}
$('#newMovie').onclick=()=>chooseAspect(a=>createProject(a));
$('#newTrailer').onclick=()=>chooseAspect(async a=>{await createProject(a,'My Trailer');setLib('templates');openTrailerSheet();});
$('#newMagic').onclick=()=>chooseAspect(async a=>{await createProject(a,'Magic Movie');setLib('templates');openMagicSheet();});
// ================= EDITOR =================
let R=null,srcs=null;const pool=new VPool(8);
async function openProject(id){stop();const p=await db.get('projects',id);if(!p)return;S.proj=p;S.sel.clear();S.selTr=null;S.seqPath=[];S.T=0;S.source=null;S.range=null;S.scrollX=0;S.scrollY=0;S.autoFit=true;
  await loadMedia(p.media);warmAudio(p.media);initHistory();$('#home').hidden=true;$('#editor').hidden=false;
  $('#projName').value=p.name;$('#aspectSel').value=p.aspect;layoutViewer();requestAnimationFrame(()=>{fitView();dirty();});renderLib();renderInsp();renderToolbar();renderCrumbs();renderSrcBar();updateUndo();
  if(!p.media.length&&!S.mobile)setTimeout(()=>toast('Tip: drag files onto the window, or use Import'),600);}
function viewRes(){return frameSize(S.proj.aspect,S.mobile?480:720);}
function layoutViewer(){if(!S.proj)return;const [W,H]=viewRes();if(!R){R=new Renderer($('#view'));srcs=new Sources(pool,W,H);}R.size(W,H);srcs.size(W,H);
  const box=$('#viewer').getBoundingClientRect();const sc=Math.min((box.width-12)/W,(box.height-12)/H);const st=$('#stage');st.style.width=Math.max(10,W*sc)+'px';st.style.height=Math.max(10,H*sc)+'px';dirty();}
new ResizeObserver(()=>layoutViewer()).observe($('#viewer'));
$('#backBtn').onclick=async()=>{stop();closeSource();await snapshotThumb();await save(true);pool.clear();S.proj=null;renderHome();};
$('#projName').onchange=e=>{S.proj.name=e.target.value||'Untitled';commit('Rename');};
$('#aspectSel').onchange=e=>{S.proj.aspect=e.target.value;commit('Aspect');layoutViewer();};
$('#undoBtn').onclick=()=>{undo()?toast('Undo'):0;};$('#redoBtn').onclick=()=>{redo()?toast('Redo'):0;};
on('restore',()=>{$('#projName').value=S.proj.name;$('#aspectSel').value=S.proj.aspect;layoutViewer();renderLib();});
on('change',()=>{if(S.autoFit)fitView(true);renderInsp();renderCrumbs();updateUndo();if(libTab==='media')renderLib();});
on('sel',()=>{renderInsp();renderToolbar();updateNavDot();});on('inspect',c=>{S.sel.clear();S.sel.add(c.id);emit('sel');if(S.mobile)openSheet('insp');});
on('open-compound',c=>{S.seqPath.push(c.id);S.sel.clear();S.T=0;renderCrumbs();fitView();dirty();emit('sel');toast('Editing compound clip — Esc or the breadcrumb to go back');});
on('pause',()=>stop());on('seek',()=>{if(S.playing)restartPlayback();});
function updateUndo(){$('#undoBtn').disabled=S.hi<=0;$('#redoBtn').disabled=S.hi>=S.hist.length-1;}
function renderCrumbs(){const c=$('#crumbs');c.innerHTML='';if(!S.seqPath.length)return;c.append(h('a',{onclick:()=>{S.seqPath=[];renderCrumbs();fitView();dirty();emit('sel');}},'Project'));
  let s=rootSeq();S.seqPath.forEach((id,i)=>{const cl=findClip(s,id);if(!cl)return;s=cl.seq;c.append(' › ',i===S.seqPath.length-1?h('b',{},cl.name||'Compound'):h('a',{onclick:()=>{S.seqPath=S.seqPath.slice(0,i+1);renderCrumbs();dirty();}},cl.name));});}
async function snapshotThumb(){if(!R||!S.proj)return;try{const c=document.createElement('canvas');const [W,H]=viewRes();c.width=240;c.height=Math.round(240*H/W);c.getContext('2d').drawImage($('#view'),0,0,c.width,c.height);S.proj.thumb=c.toDataURL('image/jpeg',.6);}catch(e){}}
// ---------- viewer drawing ----------
let srcClip=null;
function viewSeq(){if(S.source){const m=S.media.get(S.source.id);if(!m)return {main:[],conn:[]};
    const c=srcClip||(srcClip=newClip(m.kind,{id:'__src'}));Object.assign(c,{kind:m.kind,media:m.id,in:0,out:m.kind==='image'?4:m.dur,s0:1,s1:1,rev:false,kb:null});c.tf.fit='fit';return {main:[c],conn:[]};}
  return seq();}
function curT(){return S.source?S.source.T:S.T;}
function setCurT(t){if(S.source)S.source.T=t;else S.T=t;}
function drawView(){if(!R)return;const sq=viewSeq();const T=S.source?S.source.T:(S.skimT!=null&&S.skim&&!S.playing?S.skimT:S.T);
  const layers=collect(sq,T);srcs.sync(layers,S.playing,S.rate);R.begin();drawLayers(R,layers,Ly=>srcs.get(Ly),n=>getLut(n,S.proj));
  if(Math.random()<.01)R.gc();
  const len=S.source?(S.media.get(S.source.id)?.dur||0):layout(sq).len;$('#tc').textContent=fmtTC(T,S.proj.fps);$('#tdur').textContent=fmtD(len);
  $('#vInfo').textContent=S.source?('Source: '+(S.media.get(S.source.id)?.name||'')):(S.skimT!=null&&S.skim&&!S.playing?'Skimming':'');}
// ---------- playback ----------
let actx=null,master=null,anodes=[],aAt=0,playFrom=0,playStart=0,audioGen=0;
function ensureCtx(){if(!actx){actx=new (window.AudioContext||window.webkitAudioContext)();master=actx.createGain();master.connect(actx.destination);}if(actx.state!=='running')actx.resume();return actx;}
function stopAudio(){audioGen++;for(const n of anodes){try{n.stop();n.disconnect();}catch(e){}}anodes=[];}
async function startAudio(){stopAudio();const gen=audioGen;if(S.rate!==1)return;const sq=viewSeq();const need=allClips(sq).filter(c=>c.media&&S.media.get(c.media)?.hasAudio&&!audioBuf(c.media,c.rev));
  if(need.length){await Promise.all(need.map(c=>decodeAudio(c.media)));if(!S.playing||gen!==audioGen)return;need.forEach(c=>audioBuf(c.media,c.rev));}
  ensureCtx();master.gain.value=recCtl?0:1;aAt=actx.currentTime+0.05;playFrom=curT();
  anodes=scheduleMix(actx,master,sq,playFrom,S.source?1e9:layout(sq).len,aAt,(id,rev)=>audioBuf(id,rev));}
function play(rate=1){if(!S.proj)return;ensureCtx();const len=S.source?S.media.get(S.source.id)?.dur||0:seqLen();
  if(rate>0&&curT()>=len-0.05)setCurT(S.range&&!S.source?S.range[0]:0);S.playing=true;S.rate=rate;playFrom=curT();playStart=performance.now();aAt=0;startAudio();$('#playBtn').textContent='❚❚';S.skimT=null;dirty();}
function restartPlayback(){if(!S.playing)return;playFrom=curT();playStart=performance.now();aAt=0;startAudio();}
function stop(){stopAudio();if(!S.playing)return;S.playing=false;pool.pauseExcept(new Set());$('#playBtn').textContent='▶';dirty();}
function togglePlay(){S.playing?stop():play(1);}
function tick(){const len=S.source?S.media.get(S.source.id)?.dur||0:layout(viewSeq()).len;let T;
  if(S.rate===1&&aAt&&actx)T=playFrom+Math.max(0,actx.currentTime-aAt);else if(S.rate===1&&!aAt)T=playFrom;else T=playFrom+Math.max(0,performance.now()-playStart)/1000*S.rate;
  const end=S.range&&!S.source&&S.T<S.range[1]?S.range[1]:len;
  if(T>=end){setCurT(end);stop();return;}if(T<=0&&S.rate<0){setCurT(0);stop();return;}setCurT(T);if(!S.source)ensureVisible(T);S.tlDirty=true;S.dirty=true;}
$('#playBtn').onclick=togglePlay;
function loop(){requestAnimationFrame(loop);if(!S.proj||$('#editor').hidden)return;if(S.playing)tick();if(S.dirty){S.dirty=false;drawView();if(S.source)updateSrcBar();}if(S.tlDirty)drawTimeline();}
requestAnimationFrame(loop);
// ---------- source (browser) clip ----------
function openSource(id){stop();const m=S.media.get(id);if(!m)return;const keep=S.source&&S.source.id===id;S.source=keep?S.source:{id,T:0,in:0,out:m.kind==='image'?4:m.dur};renderSrcBar();renderLib();dirty();}
function closeSource(){if(!S.source)return;stop();S.source=null;renderSrcBar();renderLib();dirty();}
function renderSrcBar(){const b=$('#srcBar');b.innerHTML='';if(!S.source){b.hidden=true;layoutViewer();return;}b.hidden=false;const m=S.media.get(S.source.id);
  const tr=h('div',{class:'strack'},...(m.thumbs||[]).map(t=>h('img',{src:t,style:`width:${100/Math.max(1,m.thumbs.length)}%`})),h('div',{class:'rng'}),h('div',{class:'ph'}));
  const scrub=e=>{const r=tr.getBoundingClientRect();S.source.T=clamp((e.clientX-r.left)/r.width,0,1)*(m.kind==='image'?4:m.dur);stop();dirty();};
  tr.addEventListener('pointerdown',e=>{tr.setPointerCapture(e.pointerId);scrub(e);tr.onpointermove=scrub;});tr.addEventListener('pointerup',()=>{tr.onpointermove=null;});
  b.append(h('div',{class:'srow'},h('b',{style:'font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'},m.name),h('span',{class:'hint',id:'srcRange',style:'margin:0'}),h('button',{class:'ib',onclick:closeSource,title:'Back to timeline (Esc)'},'✕')),tr,
    h('div',{class:'srow'},m.kind!=='image'?[h('button',{onclick:()=>markSrc('in')},'In (I)'),h('button',{onclick:()=>markSrc('out')},'Out (O)')]:null,h('div',{class:'sp'}),
      h('button',{onclick:()=>addFromSource('connect'),title:'Connect above the storyline at the playhead (Q)'},'Connect'),h('button',{onclick:()=>addFromSource('insert'),title:'Insert at the playhead (W)'},'Insert'),h('button',{class:'primary',onclick:()=>addFromSource('append'),title:'Append to the end (E)'},'Append')));
  updateSrcBar();layoutViewer();}
function updateSrcBar(){if(!S.source)return;const m=S.media.get(S.source.id);const D=m.kind==='image'?4:m.dur;const tr=$('#srcBar .strack');if(!tr)return;
  tr.querySelector('.rng').style.cssText=`left:${S.source.in/D*100}%;width:${(S.source.out-S.source.in)/D*100}%`;tr.querySelector('.ph').style.left=(S.source.T/D*100)+'%';const r=$('#srcRange');if(r)r.textContent=m.kind==='image'?'':`${fmtD(S.source.out-S.source.in)} selected`;}
function markSrc(w){if(!S.source)return;const s=S.source;if(w==='in'){s.in=Math.min(s.T,s.out-0.1);}else{s.out=Math.max(s.T,s.in+0.1);}updateSrcBar();}
function clipFromMedia(m,a,b){if(m.kind==='video')return newClip('video',{media:m.id,in:a??0,out:b??m.dur,name:m.name});
  if(m.kind==='audio')return newClip('audio',{media:m.id,in:a??0,out:b??m.dur,name:m.name});
  const c=newClip('image',{media:m.id,in:0,out:4,name:m.name});c.kb={a:{x:0,y:0,s:1},b:{x:0,y:0,s:1.12}};return c;}
function addMedia(m,mode,T,lane,range){const sq=seq();const c=clipFromMedia(m,range?range[0]:undefined,range?range[1]:undefined);T=T??S.T;
  if(m.kind==='audio'&&mode!=='insert'&&!lane){if(!sq.main.length)M.appendMain(sq,c);else M.connectClip(sq,c,mode==='append'?0:T,-1);}
  else if(mode==='append')M.appendMain(sq,c);else if(mode==='insert')M.insertMain(sq,c,T);else M.connectClip(sq,c,T,m.kind==='audio'?-1:1,lane);
  S.selTr=null;S.sel.clear();S.sel.add(c.id);if(mode==='append'&&sq.main.includes(c))S.T=layout(sq).byId[c.id].start;commit('Add clip');emit('sel');return c;}
function addFromSource(mode){if(!S.source)return toast('Choose a clip in Media first');const m=S.media.get(S.source.id);const r=m.kind==='image'?null:[S.source.in,S.source.out];closeSource();addMedia(m,mode,undefined,undefined,r);toast(mode==='append'?'Appended to the end':mode==='insert'?'Inserted at the playhead':'Connected at the playhead');}
// ---------- import ----------
$('#fileIn').onchange=async e=>{const files=[...e.target.files];e.target.value='';const after=e.target.dataset.after;e.target.dataset.after='';await importFiles(files);if(after==='magic')openMagicSheet();if(after==='trailer')openTrailerSheet();};
async function importFiles(files,place){if(!files.length)return[];const msg=h('span',{},'Importing…'),bar=h('i');modal('Importing media',h('div',{},h('p',{},h('span',{class:'spin'}),' ',msg),h('div',{class:'prog'},bar)));
  const added=[],errs=[];let i=0;for(const f of files){i++;msg.textContent=`${f.name} (${i}/${files.length})`;
    try{const m=await importFile(f,st=>{msg.textContent=`${f.name}: ${st}…`;});S.proj.media.push(m.id);added.push(m);}catch(err){errs.push(err.message);}
    bar.style.width=(i/files.length*100)+'%';}
  closeModal();commit('Import');renderLib();
  if(errs.length)modal('Some files could not be imported',h('div',{},h('ul',{},...errs.map(e=>h('li',{},e))),h('p',{class:'hint'},'iPhone HEVC/MOV videos open in Safari on iPhone and Mac; some desktop browsers can’t decode them. Try MP4 (H.264), or share from Photos with “Most Compatible”.')));
  else if(added.length)toast(`Imported ${added.length} item${added.length>1?'s':''}`);
  if(place&&added.length){for(const m of added)addMedia(m,place.mode,place.T,place.lane);}return added;}
document.addEventListener('dragover',e=>{if(!S.proj)return;e.preventDefault();});
document.addEventListener('drop',async e=>{if(!S.proj)return;e.preventDefault();const files=[...e.dataTransfer.files];if(!files.length)return;
  const tl=$('#tl').getBoundingClientRect();const place=(e.clientY>tl.top&&e.clientY<tl.bottom)?{mode:'append'}:null;await importFiles(files,place);});
// ================= LIBRARY =================
const LIBTABS=[['media','Media','🎞'],['titles','Titles','T'],['transitions','Transitions','⋈'],['effects','Looks','◐'],['audio','Audio','♫'],['templates','Themes','✨']];
let libTab='media';
function setLib(t){libTab=t;renderLib();}
function renderLib(){if(!S.proj)return;const tabs=$('#libTabs');tabs.innerHTML='';for(const [k,n] of LIBTABS)tabs.append(h('button',{class:k===libTab?'on':'',onclick:()=>setLib(k)},n));
  const b=$('#libBody');const st=b.scrollTop;b.innerHTML='';({media:libMedia,titles:libTitles,transitions:libTrans,effects:libLooks,audio:libAudio,templates:libTemplates})[libTab](b);b.scrollTop=st;renderNav();}
function libMedia(b){b.append(h('div',{class:'drop'},h('button',{class:'primary',onclick:()=>$('#fileIn').click()},'＋ Import photos, videos & audio'),h('div',{class:'hint',style:'margin:6px 0 0'},S.mobile?'Tap a clip to preview & choose a range; ＋ adds it to the end; long-press to drag it onto the timeline.':'Or drag files here. Click a clip to preview and mark In/Out; drag it onto the timeline.')));
  const ms=S.proj.media.map(id=>S.media.get(id)).filter(Boolean);if(!ms.length){b.append(h('p',{class:'hint'},'No media yet.'));return;}
  const g=h('div',{class:'mgrid'});for(const m of ms){const t=h('div',{class:'tile'+(m.kind==='audio'?' audio':'')+(S.source&&S.source.id===m.id?' on':''),title:m.name},
      m.kind==='audio'?'♫':h('img',{src:m.thumbs[Math.floor(m.thumbs.length/2)]||m.thumbs[0]||''}),h('span',{class:'n'},m.name),h('span',{class:'d'},m.kind==='image'?'Photo':fmtD(m.dur)),
      h('button',{class:'add',title:'Append to timeline (E)',onclick:e=>{e.stopPropagation();addMedia(m,'append');toast('Added to the end');}},'＋'));
    tileDrag(t,m);g.append(t);}b.append(g);}
function tileDrag(t,m){let st=null,timer=null,dragging=false;const gh=$('#dragGhost');
  t.addEventListener('pointerdown',e=>{if(e.target.classList.contains('add'))return;st={x:e.clientX,y:e.clientY,id:e.pointerId,touch:e.pointerType!=='mouse'};dragging=false;
    if(st.touch)timer=setTimeout(()=>{dragging=true;begin(e);},350);});
  const begin=e=>{try{t.setPointerCapture(st.id);}catch(x){}gh.hidden=false;gh.style.backgroundImage=m.thumbs[0]?`url(${m.thumbs[0]})`:'';gh.style.left=e.clientX+'px';gh.style.top=e.clientY+'px';if(S.mobile)closeSheets();navigator.vibrate&&navigator.vibrate(10);};
  t.addEventListener('pointermove',e=>{if(!st)return;const d=Math.hypot(e.clientX-st.x,e.clientY-st.y);if(!dragging){if(st.touch){if(d>8){clearTimeout(timer);st=null;}return;}if(d>6){dragging=true;begin(e);}else return;}
    e.preventDefault();gh.style.left=e.clientX+'px';gh.style.top=e.clientY+'px';});
  t.addEventListener('pointerup',e=>{clearTimeout(timer);if(!st)return;const was=dragging;dragging=false;st=null;gh.hidden=true;
    if(!was){openSource(m.id);if(S.mobile)closeSheets();return;}const r=$('#tl').getBoundingClientRect();if(e.clientY<r.top||e.clientY>r.bottom||e.clientX<r.left||e.clientX>r.right)return;
    const T=Math.max(0,x2t(e.clientX-r.left));const lane=laneAtY(e.clientY-r.top);if(lane===0)addMedia(m,'insert',T);else addMedia(m,'connect',T,lane);});
  t.addEventListener('pointercancel',()=>{clearTimeout(timer);st=null;dragging=false;gh.hidden=true;});
  t.addEventListener('contextmenu',e=>e.preventDefault());}
function laneAtY(y){const L=layout(seq());let mx=1;for(const it of L.items)mx=Math.max(mx,it.lane);const laneH=S.mobile?44:50;const top=32-S.scrollY;const mainTop=top+mx*laneH;const mainH=S.mobile?62:74;
  if(y<mainTop)return Math.max(1,mx-Math.floor((y-top)/laneH));if(y<mainTop+mainH)return 0;return -1;}
let titleToMain=false;
function libTitles(b){b.append(h('div',{class:'row2'},h('label',{},h('input',{type:'checkbox',checked:titleToMain,onchange:e=>titleToMain=e.target.checked}),' Put in the storyline (on black) instead of over video')));
  const g=h('div',{class:'cards'});for(const k in STYLES){const cv=h('canvas',{width:320,height:180});const c=newClip('title');c.title=newTitle(k,k==='lower'?'Jane Appleseed':k==='credits'?'Directed by\nYou':k==='caption'?'Captions look like this':'Your Title',k==='lower'?'Photographer':k==='standard'||k==='cinematic'?'Subtitle':'');
    const x=cv.getContext('2d');const grd=x.createLinearGradient(0,0,320,180);grd.addColorStop(0,'#2b3a55');grd.addColorStop(1,'#553a2b');x.fillStyle=grd;x.fillRect(0,0,320,180);
    const tmp=document.createElement('canvas');tmp.width=320;tmp.height=180;drawTitle(tmp.getContext('2d'),320,180,c,k==='credits'?2:k==='typewriter'?3:1.5,4);x.drawImage(tmp,0,0);
    g.append(h('div',{class:'card',onclick:()=>addTitle(k)},cv,STYLES[k].name));}b.append(g);
  b.append(h('p',{class:'hint'},'Tap a style to add it at the playhead, then edit the words in the Inspector.'));}
function addTitle(style,text){const sq=seq();const c=newClip('title',{in:0,out:4,name:STYLES[style].name});c.title=newTitle(style,text||(style==='lower'?'Name':style==='credits'?'Directed by\nYour Name\n\nStarring\nEveryone':'Title'),style==='lower'?'Subtitle':'');
  if(S.proj.theme&&THEMES[S.proj.theme])c.title.font=THEMES[S.proj.theme].font;
  if(titleToMain||!sq.main.length){c.title.bg='#000000';M.insertMain(sq,c,S.T);}else M.connectClip(sq,c,S.T,1);S.selTr=null;S.sel.clear();S.sel.add(c.id);commit('Add title');emit('sel');toast('Title added — edit it in the Inspector');if(S.mobile)openSheet('insp');return c;}
let trDur=1;
function libTrans(b){b.append(rowSlider('Duration',.2,3,.1,()=>trDur,v=>trDur=v,v=>v.toFixed(1)+'s'));
  const g=h('div',{class:'cards'});for(const k in TRANSITIONS)g.append(h('div',{class:'card',onclick:()=>applyTrans(k)},transIcon(k),TRANSITIONS[k]));b.append(g);
  b.append(h('div',{class:'btnrow'},h('button',{onclick:()=>{const sq=seq();sq.main.forEach((c,i)=>{if(i>0)c.trans={type:'dissolve',dur:trDur};});commit('Transitions');toast('Cross dissolves added to every cut');}},'Dissolve every cut'),
    h('button',{onclick:()=>{seq().main.forEach(c=>c.trans=null);S.selTr=null;commit('Remove transitions');}},'Remove all')));
  b.append(h('p',{class:'hint'},'Tap a transition to put it on the selected clip’s start, or on the cut nearest the playhead. Tap one in the timeline to change it; drag it to change its length.'));}
function transIcon(k){const c=h('canvas',{width:160,height:90});const x=c.getContext('2d');const A='#3d6fd6',B='#d6863d';x.fillStyle=A;x.fillRect(0,0,160,90);x.fillStyle=B;
  ({dissolve:()=>{x.globalAlpha=.5;x.fillRect(0,0,160,90);},black:()=>{x.fillStyle='#000';x.fillRect(40,0,80,90);},white:()=>{x.fillStyle='#fff';x.fillRect(40,0,80,90);},wipe:()=>x.fillRect(0,0,80,90),slide:()=>x.fillRect(80,0,80,90),
    push:()=>{x.fillRect(80,0,80,90);x.fillStyle='#244a99';x.fillRect(0,0,80,90);},zoom:()=>x.fillRect(40,22,80,46),iris:()=>{x.beginPath();x.arc(80,45,32,0,7);x.fill();},up:()=>x.fillRect(0,45,160,45),flash:()=>{x.fillStyle='#fff';x.globalAlpha=.8;x.fillRect(0,0,160,90);}})[k]();x.globalAlpha=1;return c;}
function applyTrans(type){const sq=seq();const L=layout(sq);let id=null;const sc=selClip();
  if(S.selTr)id=S.selTr;else if(sc&&sq.main.includes(sc)&&sq.main.indexOf(sc)>0)id=sc.id;
  else{let best=null,bd=1e9;for(const it of L.main.slice(1)){const d=Math.abs(it.start-S.T);if(d<bd){bd=d;best=it;}}id=best&&best.c.id;}
  if(!id)return toast('Add at least two clips to the storyline first');M.setTransition(sq,id,type,trDur);S.selTr=id;S.sel.clear();commit('Transition');emit('sel');toast(TRANSITIONS[type]+' added');}
function libLooks(b){const sc=selClips().filter(c=>M.isVisual(c)&&c.kind!=='title');b.append(h('p',{class:'hint'},sc.length?`Tap a look to apply it to ${sc.length} selected clip${sc.length>1?'s':''}.`:'Select clips in the timeline, then tap a look. With nothing selected, looks apply to every clip.'));
  const g=h('div',{class:'cards'});const names=['',...BUILTIN_LUTS,...Object.keys(S.proj.luts||{})];const base=lookBase();
  for(const n of names){const cv=h('canvas',{width:160,height:90});paintLook(cv,base,n);g.append(h('div',{class:'card',onclick:()=>applyLook(n)},cv,n||'None'));}b.append(g);
  b.append(h('div',{class:'btnrow'},h('button',{onclick:()=>$('#lutIn').click()},'Import LUT (.cube)')));
  b.append(h('h4',{},'Colour mattes'));const cg=h('div',{class:'btnrow'});for(const col of ['#000000','#ffffff','#1e2a44','#f2c14e','#d94f70','#2a9d8f'])cg.append(h('button',{style:`background:${col};width:40px;height:32px`,title:'Insert a colour clip at the playhead',onclick:()=>{const c=newClip('color',{in:0,out:3,color:col,name:'Colour'});M.insertMain(seq(),c,S.T);commit('Colour');}}));b.append(cg);}
let lookImg=null;
function lookBase(){const cv=document.createElement('canvas');cv.width=160;cv.height=90;const x=cv.getContext('2d');const sc=selClip();const m=sc&&sc.media&&S.media.get(sc.media)?.thumbs?.length?S.media.get(sc.media):S.proj.media.map(id=>S.media.get(id)).find(m=>m&&m.thumbs&&m.thumbs.length);
  const g=x.createLinearGradient(0,0,160,90);g.addColorStop(0,'#87a9d6');g.addColorStop(.5,'#d9a066');g.addColorStop(1,'#2c3e2d');x.fillStyle=g;x.fillRect(0,0,160,90);
  if(m){const src=m.thumbs[Math.floor(m.thumbs.length/2)];if(lookImg&&lookImg.src===src&&lookImg.complete)x.drawImage(lookImg,0,0,160,90);else{lookImg=new Image();lookImg.onload=()=>{if(libTab==='effects')renderLib();};lookImg.src=src;}}return cv;}
function paintLook(cv,base,name){const x=cv.getContext('2d');x.drawImage(base,0,0);if(!name)return;const d=x.getImageData(0,0,160,90);const l=getLut(name,S.proj);if(!l)return;const n=l.n;
  for(let i=0;i<d.data.length;i+=4){const r=Math.round(d.data[i]/255*(n-1)),g=Math.round(d.data[i+1]/255*(n-1)),b=Math.round(d.data[i+2]/255*(n-1));const j=3*(r+g*n+b*n*n);d.data[i]=l.data[j];d.data[i+1]=l.data[j+1];d.data[i+2]=l.data[j+2];}x.putImageData(d,0,0);}
function applyLook(n){let cl=selClips().filter(c=>M.isVisual(c)&&c.kind!=='title');if(!cl.length)cl=allClips(seq()).filter(c=>M.isVisual(c)&&c.kind!=='title'&&c.kind!=='gap');for(const c of cl){c.fx.lut=n;c.fx.lutAmt=1;}commit('Look');toast(n?`Applied ${n}`:'Look removed');}
$('#lutIn').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const l=parseCube(await f.text());const name=f.name.replace(/\.cube$/i,'');S.proj.luts[name]=l;dropLutCache(name);if(R)R.luts.delete(name);commit('Import LUT');renderLib();toast('LUT imported: '+name);}catch(err){toast(err.message);}};
let recCtl=null;
function libAudio(b){b.append(h('h4',{},'Soundtracks'),h('p',{class:'hint'},'Royalty-free music composed on your device to fit your movie’s length.'));
  const g=h('div',{class:'btnrow'});for(const k in MOODS)g.append(h('button',{onclick:()=>addMusic(k)},'♫ '+k));b.append(g);
  b.append(h('h4',{},'Voiceover'),h('button',{class:recCtl?'on':'',onclick:toggleVO},recCtl?'■ Stop recording':'● Record voiceover at playhead'));
  b.append(h('h4',{},'Auto captions'),h('p',{class:'hint'},'Transcribes speech with Whisper running in your browser (downloads about 40 MB once) and adds caption titles.'),
    h('div',{class:'btnrow'},h('button',{class:'primary',onclick:()=>runCaptions('en')},'Caption (English)'),h('button',{onclick:()=>runCaptions('auto')},'Other language')));
  b.append(h('h4',{},'Tips'),h('p',{class:'hint'},'Turn on “Duck other audio” for a voiceover or interview clip to lower the music automatically while it plays. Drag the white handles on selected audio to fade.'));}
async function addMusic(mood){const len=Math.max(15,Math.ceil(seqLen()));modal('Making soundtrack',h('p',{},h('span',{class:'spin'}),` Composing a ${len}s ${mood} track…`));
  try{const f=await makeMusic(mood,len);const m=await importFile(f);S.proj.media.push(m.id);const sq=seq();const c=clipFromMedia(m);c.vol=.7;c.fadeOut=2;c.name=mood+' soundtrack';
    if(!sq.main.length)M.appendMain(sq,c);else{c.lane=M.freeLane(sq,0,dur(c),-1);sq.conn.push(c);M.reanchor(sq,c,0);}commit('Soundtrack');closeModal();toast('Soundtrack added under your movie');}catch(e){closeModal();toast('Could not make music: '+e.message);}}
async function toggleVO(){if(recCtl){const {ctl,T}=recCtl;recCtl=null;stop();const f=await ctl.stop();renderLib();try{const m=await importFile(f);S.proj.media.push(m.id);const c=clipFromMedia(m);c.name='Voiceover';c.duck=true;M.connectClip(seq(),c,T,-1);commit('Voiceover');toast('Voiceover added (ducks other audio)');}catch(e){toast(e.message);}return;}
  try{const ctl=await startVoiceover();recCtl={ctl,T:S.T};play(1);toast('Recording… tap Stop when done (timeline sound is muted)');renderLib();}catch(e){toast('Microphone unavailable: '+e.message);}}
async function runCaptions(lang){const msg=h('span',{},'Preparing…');const bar=h('i');modal('Auto captions',h('div',{},h('p',{},h('span',{class:'spin'}),' ',msg),h('div',{class:'prog'},bar),h('p',{class:'hint'},'Runs entirely on this device. Long movies take a while.')));
  try{const segs=await transcribe(seq(),(m,p)=>{msg.textContent=m;bar.style.width=(p*100)+'%';},{lang:lang==='auto'?'auto':'en'});
    if(!segs.length){closeModal();return toast('No speech found');}const sq=seq();const L=layout(sq);let lane=1;for(const it of L.items)lane=Math.max(lane,it.lane+1);
    for(const s of segs){const c=newClip('title',{in:0,out:Math.max(.5,s.e-s.s),name:'Caption'});c.title=newTitle('caption',s.text,'');M.connectClip(sq,c,s.s,1,lane);}
    commit('Captions');closeModal();toast(`Added ${segs.length} captions`);return segs;}catch(e){closeModal();modal('Captions failed',h('p',{},String(e.message||e)));}}
function libTemplates(b){b.append(h('h4',{},'Themes'),h('p',{class:'hint'},'A theme adds matching opening & closing titles, a transition on every cut and a colour look.'));
  const g=h('div',{class:'cards'});for(const k in THEMES){const th=THEMES[k];const cv=h('canvas',{width:160,height:90});const x=cv.getContext('2d');x.fillStyle='#1b2130';x.fillRect(0,0,160,90);const c=newClip('title');c.title=newTitle(th.style,th.name,'');c.title.font=th.font;c.title.color=th.col;if(th.acc)c.title.accent=th.acc;
    const t2=document.createElement('canvas');t2.width=160;t2.height=90;drawTitle(t2.getContext('2d'),160,90,c,1.5,4);x.drawImage(t2,0,0);
    g.append(h('div',{class:'card',style:S.proj.theme===k?'border-color:var(--ac)':'',onclick:()=>{if(!seq().main.length)return toast('Add some clips first');applyTheme(seq(),S.proj,k);commit('Theme');toast(th.name+' theme applied');renderLib();}},cv,th.name));}b.append(g);
  b.append(h('h4',{},'Trailers'),h('p',{class:'hint'},'Hollywood-style trailers: fill in the names and your clips are cut to music with animated titles.'),h('button',{class:'primary big',onclick:openTrailerSheet},'🎞 Make a trailer'));
  b.append(h('h4',{},'Magic Movie'),h('p',{class:'hint'},'Automatically edits all your media: picks highlights, adds Ken Burns to photos, a theme and music.'),h('button',{class:'big',onclick:openMagicSheet},'✨ Make Magic Movie'));}
function importBtn(after){return h('button',{class:'big',onclick:()=>{closeModal();$('#fileIn').dataset.after=after||'';$('#fileIn').click();}},'＋ Import photos & videos');}
function openTrailerSheet(){const f={name:S.proj.name||'My Trailer',studio:'Diamond Pictures',who:'Colin',date:'Summer '+new Date().getFullYear()};let key='epic';
  const ms=S.proj.media.map(id=>S.media.get(id)).filter(m=>m&&m.kind!=='audio');
  const pick=h('div',{class:'cards'});const draw=()=>{pick.innerHTML='';for(const k in TRAILERS)pick.append(h('div',{class:'card',style:k===key?'border-color:var(--ac)':'',onclick:()=>{key=k;draw();}},h('div',{style:'font-size:22px'},{epic:'⚔️',adventure:'🏔',retro:'📼',romance:'💞',action:'💥'}[k]),TRAILERS[k].name,h('div',{class:'hint',style:'margin:2px 0 0'},`${TRAILERS[k].slots.filter(s=>s[0]==='s').length} shots · ${Math.round(TRAILERS[k].slots.reduce((a,s)=>a+(s[0]==='t'?s[2]:s[1]),0))}s`)));};draw();
  const inp=(k,l)=>h('div',{class:'row2'},h('label',{style:'width:110px'},l),h('input',{value:f[k],oninput:e=>f[k]=e.target.value,style:'flex:1'}));
  modal('Make a trailer',h('div',{},pick,h('h4',{},'Outline'),inp('name','Movie title'),inp('studio','Studio'),inp('who','Starring'),inp('date','Release date'),
    h('p',{class:'hint'},ms.length?`Uses your ${ms.length} photo/video item${ms.length>1?'s':''} in order (repeated if needed). Replaces the current timeline — undo is available.`:'Import some photos or videos first.'),
    ms.length?null:importBtn('trailer'),
    h('button',{class:'primary big',disabled:!ms.length,onclick:()=>makeTrailer(key,f,ms)},'Create trailer')),{wide:true});}
async function makeTrailer(key,f,ms){closeModal();modal('Building trailer',h('p',{},h('span',{class:'spin'}),' Cutting shots & composing music…'));
  try{const sq=buildTrailer(key,f,ms);const L=layout(sq);const mf=await makeMusic(TRAILERS[key].mood,Math.ceil(L.len)+1);const m=await importFile(mf);S.proj.media.push(m.id);
    const mc=clipFromMedia(m);mc.out=Math.min(m.dur,L.len);mc.fadeOut=1.5;mc.name='Trailer music';mc.lane=-1;mc.anchor=sq.main[0].id;mc.off=0;sq.conn.push(mc);
    S.proj.timeline=sq;S.seqPath=[];S.proj.name=f.name;$('#projName').value=f.name;S.sel.clear();S.T=0;commit('Trailer');fitView();closeModal();toast('Trailer ready — press play!');}catch(e){closeModal();toast(e.message);}}
function openMagicSheet(){const ms=S.proj.media.map(id=>S.media.get(id)).filter(m=>m&&m.kind!=='audio');let theme='modern',mood='Uplifting';
  const sel=(obj,get,set)=>{const s=h('select',{onchange:e=>set(e.target.value)});for(const k in obj)s.append(h('option',{value:k,selected:k===get()},obj[k].name||k));return s;};
  modal('Magic Movie',h('div',{},h('p',{class:'hint'},ms.length?`${ms.length} photos & videos will be edited into a movie. Replaces the current timeline — undo is available.`:'Import photos & videos first.'),
    h('div',{class:'row2'},h('label',{style:'width:80px'},'Theme'),sel(THEMES,()=>theme,v=>theme=v)),h('div',{class:'row2'},h('label',{style:'width:80px'},'Music'),sel(MOODS,()=>mood,v=>mood=v)),
    ms.length?null:importBtn('magic'),
    h('button',{class:'primary big',disabled:!ms.length,onclick:()=>makeMagic(ms,theme,mood)},'Make it')));}
async function makeMagic(ms,theme,mood){closeModal();modal('Magic Movie',h('p',{},h('span',{class:'spin'}),' Editing…'));
  try{const sq=buildMagic(ms);S.proj.timeline=sq;S.seqPath=[];applyTheme(sq,S.proj,theme);const L=layout(sq);const mf=await makeMusic(mood,Math.ceil(L.len)+1);const m=await importFile(mf);S.proj.media.push(m.id);
    const mc=clipFromMedia(m);mc.out=Math.min(m.dur,L.len);mc.vol=.55;mc.fadeOut=2;mc.name=mood+' music';mc.lane=-1;mc.anchor=sq.main[0].id;mc.off=0;sq.conn.push(mc);
    S.sel.clear();S.T=0;commit('Magic Movie');fitView();closeModal();toast('Your Magic Movie is ready');}catch(e){closeModal();toast(e.message);}}
// ================= INSPECTOR =================
function localT(c){const L=layout(seq());const it=L.byId[c.id];return it?clamp(S.T-it.start,0,it.end-it.start):0;}
function rowSlider(label,min,max,step,get,set,fmt=v=>(+v).toFixed(2),opt={}){const r=h('div',{class:'row'});const lab=h('label',{title:label+(opt.def!==undefined?' — double-click to reset':'')},label);
  const inp=h('input',{type:'range',min,max,step,value:get()});const out=h('output',{title:'Tap to type a value'},fmt(get()));
  const kfb=opt.kf?h('button',{class:'kf',title:'Add/remove keyframe at the playhead'},'◆'):h('span');
  const sync=()=>{inp.value=get();out.textContent=fmt(get());if(opt.kf){const c=opt.kf.c,p=opt.kf.p;kfb.className='kf'+(c.kf[p]?' has':'')+(hasKfAt(c,p,localT(c))?' at':'');}};
  inp.oninput=()=>{set(+inp.value);out.textContent=fmt(+inp.value);dirty();};inp.onchange=()=>{commit(label);};
  lab.ondblclick=()=>{if(opt.def!==undefined){set(opt.def);sync();dirty();commit(label);}};
  out.onclick=()=>{const v=prompt(label,(+get()).toFixed(3));if(v!=null&&v.trim()!==''&&!isNaN(+v)){set(+v);sync();dirty();commit(label);}};
  if(opt.kf)kfb.onclick=()=>{const c=opt.kf.c,p=opt.kf.p;const t=localT(c);if(hasKfAt(c,p,t))delKf(c,p,t);else setKf(c,p,t,get());commit('Keyframe');};
  r.append(lab,inp,out,kfb);sync();return r;}
function kfProp(c,obj,key,p){return {get:()=>c.kf[p]&&c.kf[p].length?kfVal(c,p,localT(c),obj[key]):obj[key],set:v=>{if(c.kf[p]&&c.kf[p].length)setKf(c,p,localT(c),v);else obj[key]=v;}};}
const secOpen={};
function sec(title,open,reset,...kids){const d=h('details',{open:(secOpen[title]??open)||undefined},h('summary',{},title,reset?h('button',{class:'rst',onclick:e=>{e.preventDefault();reset();commit('Reset '+title);}},'Reset'):null),...kids);
  d.addEventListener('toggle',()=>{secOpen[title]=d.open;});return d;}
function seg(opts,get,set){const s=h('div',{class:'seg'});for(const [v,l] of opts)s.append(h('button',{class:get()===v?'on':'',onclick:()=>{set(v);commit('Change');}},l));return s;}
let inspTimer=null;
function renderInsp(){clearTimeout(inspTimer);inspTimer=setTimeout(_renderInsp,10);}
function _renderInsp(){const b=$('#inspBody');if(!S.proj)return;const st=b.scrollTop;b.innerHTML='';const sq=seq();
  if(S.selTr){const c=findClip(sq,S.selTr);if(c&&c.trans){b.append(h('div',{class:'ihead'},h('b',{},'Transition'),h('span',{class:'kind'},TRANSITIONS[c.trans.type])));
    const g=h('div',{class:'cards'});for(const k in TRANSITIONS)g.append(h('div',{class:'card',style:k===c.trans.type?'border-color:var(--ac)':'',onclick:()=>{c.trans.type=k;commit('Transition');}},transIcon(k),TRANSITIONS[k]));
    b.append(rowSlider('Duration',.1,4,.05,()=>c.trans.dur,v=>c.trans.dur=v,v=>v.toFixed(2)+'s'),g,h('button',{class:'big',onclick:()=>{c.trans=null;S.selTr=null;commit('Remove transition');}},'Remove transition'));b.scrollTop=st;return;}S.selTr=null;}
  const cl=selClips();
  if(!cl.length){const L=layout(sq);b.append(h('div',{class:'ihead'},h('b',{},'Project')),h('div',{class:'kv'},h('span',{},'Length'),fmtD(L.len),h('span',{},'Clips'),String(L.items.length),h('span',{},'Shape'),S.proj.aspect,h('span',{},'Theme'),S.proj.theme?THEMES[S.proj.theme].name:'None'),
      h('div',{class:'row2'},h('label',{},'Frame rate'),seg([[24,'24'],[25,'25'],[30,'30'],[60,'60']],()=>S.proj.fps,v=>S.proj.fps=v)),
      h('p',{class:'hint'},'Select a clip to adjust it. Double-tap a clip to open it here. Press ? for keyboard shortcuts.'));
    if(S.range)b.append(h('p',{class:'hint'},`Range: ${fmtD(S.range[0])} → ${fmtD(S.range[1])}`),h('button',{onclick:()=>{S.range=null;dirty();renderInsp();}},'Clear range'));return;}
  if(cl.length>1){b.append(h('div',{class:'ihead'},h('b',{},`${cl.length} clips selected`)),h('div',{class:'btnrow'},h('button',{onclick:makeCompound},'Make compound clip (⌥G)'),h('button',{onclick:()=>deleteSel(true)},'Delete'),lookClip?h('button',{onclick:pasteLook},'Paste look'):null),
      h('p',{class:'hint'},'Looks in the Looks tab apply to all selected clips.'));return;}
  const c=cl[0];const m=c.media?S.media.get(c.media):null;const visual=M.isVisual(c)&&c.kind!=='gap';const kindName={video:'Video',image:'Photo',audio:'Audio',title:'Title',color:'Colour',gap:'Gap',freeze:'Freeze frame',compound:'Compound'}[c.kind];
  b.append(h('div',{class:'ihead'},h('input',{value:c.name||(m?m.name:kindName),onchange:e=>{c.name=e.target.value;commit('Name');}}),h('span',{class:'kind'},kindName)),
    h('div',{class:'hint',style:'margin-top:0'},`${fmtD(dur(c))}${m&&isMediaKind(c.kind)?` · source ${fmtD(c.in)}–${fmtD(c.out)}`:''}${sq.main.includes(c)?' · storyline':' · connected'}`));
  if(c.kind==='title'){const T=c.title;const fs=h('select',{onchange:e=>{T.font=e.target.value;commit('Font');}});for(const k in FONTS)fs.append(h('option',{value:k,selected:T.font===k},FONTS[k].name));
    const ss=h('select',{onchange:e=>{T.style=e.target.value;const d=STYLES[T.style];T.color=d.color;T.accent=d.accent||T.accent;T.font=d.font;commit('Style');}});for(const k in STYLES)ss.append(h('option',{value:k,selected:T.style===k},STYLES[k].name));
    b.append(sec('Title',true,null,h('textarea',{oninput:e=>{T.text=e.target.value;dirty();},onchange:()=>commit('Text')},T.text),h('input',{placeholder:'Subtitle (optional)',value:T.sub||'',style:'width:100%;margin-top:6px',oninput:e=>{T.sub=e.target.value;dirty();},onchange:()=>commit('Subtitle')}),
      h('div',{class:'row2'},h('label',{},'Style'),ss,h('label',{},'Font'),fs),
      h('div',{class:'row2'},h('label',{},'Colour'),h('input',{type:'color',value:T.color,oninput:e=>{T.color=e.target.value;dirty();},onchange:()=>commit('Colour')}),h('label',{},'Accent'),h('input',{type:'color',value:T.accent||'#ffb000',oninput:e=>{T.accent=e.target.value;dirty();},onchange:()=>commit('Accent')}),
        h('label',{},h('input',{type:'checkbox',checked:!!T.bg,onchange:e=>{T.bg=e.target.checked?'#000000':null;commit('Background');}}),' Background'),T.bg?h('input',{type:'color',value:T.bg,oninput:e=>{T.bg=e.target.value;dirty();},onchange:()=>commit('Bg')}):null),
      rowSlider('Size',.3,3,.05,()=>T.size,v=>T.size=v,v=>Math.round(v*100)+'%',{def:1}),rowSlider('Position',-.45,.45,.01,()=>T.y||0,v=>T.y=v,v=>v.toFixed(2),{def:0})));}
  if(c.kind==='color')b.append(sec('Colour',true,null,h('div',{class:'row2'},h('label',{},'Colour'),h('input',{type:'color',value:c.color,oninput:e=>{c.color=e.target.value;dirty();},onchange:()=>commit('Colour')}))));
  if(!isMediaKind(c.kind)&&c.kind!=='compound')b.append(rowSlider('Duration',.2,30,.1,()=>c.out-c.in,v=>{c.out=c.in+v;},v=>v.toFixed(1)+'s'));
  if(visual){const tf=c.tf;const P=(k)=>kfProp(c,tf,k,k);
    const pip=h('div',{class:'btnrow'},...[['Full',{x:0,y:0,s:1}],['PiP ↗',{x:.3,y:-.3,s:.33}],['PiP ↙',{x:-.3,y:.3,s:.33}],['Left half',{x:-.25,y:0,s:.5}],['Right half',{x:.25,y:0,s:.5}]].map(([n,v])=>h('button',{onclick:()=>{delete c.kf.x;delete c.kf.y;delete c.kf.s;Object.assign(tf,v);commit('Position');}},n)));
    const x=P('x'),y=P('y'),s=P('s'),r=P('r'),o=P('o');
    b.append(sec('Transform',!S.mobile&&c.kind!=='title',()=>{c.tf=M.defTf();for(const k of ['x','y','s','r','o'])delete c.kf[k];},
      rowSlider('Position X',-1,1,.005,x.get,x.set,v=>v.toFixed(2),{kf:{c,p:'x'},def:0}),rowSlider('Position Y',-1,1,.005,y.get,y.set,v=>v.toFixed(2),{kf:{c,p:'y'},def:0}),
      rowSlider('Scale',.05,4,.01,s.get,s.set,v=>Math.round(v*100)+'%',{kf:{c,p:'s'},def:1}),rowSlider('Rotation',-180,180,.5,r.get,r.set,v=>v.toFixed(0)+'°',{kf:{c,p:'r'},def:0}),
      rowSlider('Opacity',0,1,.01,o.get,o.set,v=>Math.round(v*100)+'%',{kf:{c,p:'o'},def:1}),
      h('div',{class:'row2'},h('label',{},'Fit'),seg([['fit','Fit'],['fill','Fill']],()=>tf.fit,v=>tf.fit=v),h('button',{class:S.moveMode?'on':'',onclick:()=>{S.moveMode=!S.moveMode;$('#moveBtn').classList.toggle('on',S.moveMode);renderInsp();}},'✥ Move in viewer')),pip,
      h('div',{class:'hint'},'◆ adds a keyframe at the playhead. Once a property has keyframes, changing it adds or updates one.'),
      ...['Left','Right','Top','Bottom'].map((n,i)=>rowSlider('Crop '+n,0,.45,.005,()=>tf.crop[i],v=>tf.crop[i]=v,v=>Math.round(v*100)+'%',{def:0}))));
    if(c.kind==='image'||c.kind==='video'||c.kind==='freeze'){const kb=c.kb;
      b.append(sec('Ken Burns',c.kind==='image',null,h('div',{class:'row2'},h('label',{},h('input',{type:'checkbox',checked:!!kb,onchange:e=>{c.kb=e.target.checked?{a:{x:0,y:0,s:1},b:{x:0,y:0,s:1.15}}:null;commit('Ken Burns');}}),' Ken Burns pan & zoom')),
        kb?h('div',{class:'btnrow'},...[['Zoom in',{a:{x:0,y:0,s:1},b:{x:0,y:0,s:1.2}}],['Zoom out',{a:{x:0,y:0,s:1.2},b:{x:0,y:0,s:1}}],['Pan →',{a:{x:-.05,y:0,s:1.15},b:{x:.05,y:0,s:1.15}}],['Pan ←',{a:{x:.05,y:0,s:1.15},b:{x:-.05,y:0,s:1.15}}],['Rise',{a:{x:0,y:.05,s:1.15},b:{x:0,y:-.05,s:1.15}}]].map(([n,v])=>h('button',{onclick:()=>{c.kb=clone(v);commit('Ken Burns');}},n))):null,
        kb?[rowSlider('Start zoom',1,2,.01,()=>kb.a.s,v=>kb.a.s=v,v=>Math.round(v*100)+'%'),rowSlider('End zoom',1,2,.01,()=>kb.b.s,v=>kb.b.s=v,v=>Math.round(v*100)+'%'),
          rowSlider('Start X',-.3,.3,.005,()=>kb.a.x,v=>kb.a.x=v),rowSlider('End X',-.3,.3,.005,()=>kb.b.x,v=>kb.b.x=v),rowSlider('Start Y',-.3,.3,.005,()=>kb.a.y,v=>kb.a.y=v),rowSlider('End Y',-.3,.3,.005,()=>kb.b.y,v=>kb.b.y=v)]:null));}
    if(c.kind!=='title'){const fx=c.fx;const F=(l,k,mn,mx,st,d,fmt)=>rowSlider(l,mn,mx,st,()=>fx[k],v=>fx[k]=v,fmt||(v=>v.toFixed(2)),{def:d});
      const lut=h('select',{onchange:e=>{fx.lut=e.target.value;commit('LUT');}},h('option',{value:''},'None'));for(const n of [...BUILTIN_LUTS,...Object.keys(S.proj.luts||{})])lut.append(h('option',{value:n,selected:fx.lut===n},n));
      b.append(sec('Colour',!S.mobile,()=>{const ck=fx.ck;c.fx=M.defFx();c.fx.ck=ck;},F('Exposure','exp',-3,3,.01,0,v=>(v>0?'+':'')+v.toFixed(2)),F('Contrast','con',-1,1,.01,0),F('Highlights','hl',-1,1,.01,0),F('Shadows','sh',-1,1,.01,0),
        F('Saturation','sat',0,2,.01,1,v=>Math.round(v*100)+'%'),F('Vibrance','vib',-1,1,.01,0),F('Temperature','temp',-1,1,.01,0),F('Tint','tint',-1,1,.01,0),F('Vignette','vig',-1,1,.01,0),
        h('h4',{},'Colour wheels'),wheels(fx),h('h4',{},'LUT / look'),h('div',{class:'row2'},lut,h('button',{onclick:()=>$('#lutIn').click()},'Import .cube')),fx.lut?F('LUT amount','lutAmt',0,1,.01,1,v=>Math.round(v*100)+'%'):null,
        h('div',{class:'btnrow'},h('button',{onclick:()=>{lookClip=clone(c.fx);toast('Look copied');renderInsp();}},'Copy look'),h('button',{disabled:!lookClip,onclick:()=>pasteLook()},'Paste look'),h('button',{onclick:()=>{for(const x of allClips(seq()).filter(x=>M.isVisual(x)&&x.kind!=='title'&&x.kind!=='gap'))x.fx=clone(c.fx);commit('Match');toast('Look applied to every clip');}},'Apply to all'))));
      const ck=fx.ck||{on:false,color:'#00b140',tol:.12,soft:.1,spill:.6};
      b.append(sec('Keyer (green/blue screen)',!!(fx.ck&&fx.ck.on),null,h('div',{class:'row2'},h('label',{},h('input',{type:'checkbox',checked:!!ck.on,onchange:e=>{ck.on=e.target.checked;fx.ck=ck;commit('Keyer');}}),' Chroma key'),
          h('input',{type:'color',value:ck.color,oninput:e=>{ck.color=e.target.value;fx.ck=ck;dirty();},onchange:()=>commit('Key colour')}),h('button',{onclick:()=>{fx.ck=ck;ck.on=true;autoKey(c,ck);}},'Auto-pick'),h('button',{onclick:()=>{ck.color='#00b140';ck.on=true;fx.ck=ck;commit('Key');}},'Green'),h('button',{onclick:()=>{ck.color='#0047bb';ck.on=true;fx.ck=ck;commit('Key');}},'Blue')),
        ck.on?[rowSlider('Tolerance',0,.5,.005,()=>ck.tol,v=>ck.tol=v),rowSlider('Softness',0,.4,.005,()=>ck.soft,v=>ck.soft=v),rowSlider('Spill removal',0,1,.01,()=>ck.spill,v=>ck.spill=v)]:null,
        h('p',{class:'hint'},'Put the keyed clip above the background as a connected clip.')));}
    if(c.kind==='video'){b.append(sec('Stabilisation',false,null,c.stab?[h('p',{class:'hint'},'Smoothing camera shake.'),rowSlider('Strength',0,1,.01,()=>c.stab.amt,v=>c.stab.amt=v,v=>Math.round(v*100)+'%'),rowSlider('Zoom',1,1.4,.01,()=>c.stab.zoom,v=>c.stab.zoom=v,v=>Math.round(v*100)+'%'),h('button',{onclick:()=>{c.stab=null;commit('Stabilise off');}},'Remove stabilisation')]:
      [h('p',{class:'hint'},'Analyses camera movement and smooths it out (shift + zoom).'),h('button',{class:'primary',onclick:()=>stabilise(c)},'Analyse & stabilise')]));}}
  if(c.kind==='compound')b.append(sec('Compound clip',true,null,h('div',{class:'btnrow'},h('button',{onclick:()=>emit('open-compound',c)},'Open'),h('button',{onclick:()=>{M.breakApart(seq(),c.id);S.sel.clear();commit('Break apart');}},'Break apart'))));
  const hasA=c.kind==='audio'||(c.kind==='video'&&m&&m.hasAudio)||c.kind==='compound';
  if(hasA){const vp=kfProp(c,c,'vol','vol');const db=v=>v<=0.001?'-∞':((20*Math.log10(v))>0?'+':'')+(20*Math.log10(v)).toFixed(1)+'dB';
    b.append(sec('Audio',c.kind==='audio',null,rowSlider('Volume',0,2,.01,vp.get,vp.set,db,{kf:{c,p:'vol'},def:1}),
      h('div',{class:'row2'},h('label',{},h('input',{type:'checkbox',checked:c.mute,onchange:e=>{c.mute=e.target.checked;commit('Mute');}}),' Mute'),h('label',{},h('input',{type:'checkbox',checked:c.duck,onchange:e=>{c.duck=e.target.checked;commit('Ducking');}}),' Duck other audio while this plays')),
      c.duck?rowSlider('Duck to',0,1,.01,()=>c.duckLvl,v=>c.duckLvl=v,db):null,
      rowSlider('Fade in',0,Math.min(10,dur(c)/2),.05,()=>c.fadeIn,v=>c.fadeIn=v,v=>v.toFixed(2)+'s',{def:0}),rowSlider('Fade out',0,Math.min(10,dur(c)/2),.05,()=>c.fadeOut,v=>c.fadeOut=v,v=>v.toFixed(2)+'s',{def:0}),
      isMediaKind(c.kind)?[rowSlider('J-cut: audio early',0,3,.05,()=>c.aIn,v=>c.aIn=c.rev?v:Math.min(v,c.in/Math.max(.05,c.s0)),v=>v.toFixed(2)+'s',{def:0}),rowSlider('L-cut: audio late',0,3,.05,()=>c.aOut,v=>c.aOut=v,v=>v.toFixed(2)+'s',{def:0})]:null,
      c.kind==='video'?h('button',{onclick:()=>{const a=M.detachAudio(seq(),c);if(a){S.sel.clear();S.sel.add(a.id);commit('Detach audio');emit('sel');toast('Audio detached to its own lane');}}},'Detach audio'):null));}
  if(isMediaKind(c.kind)){const pct=v=>Math.round(v*100)+'%';
    b.append(sec('Speed',false,()=>{c.s0=c.s1=1;c.rev=false;},h('div',{class:'btnrow'},...[[.25,'¼×'],[.5,'½×'],[1,'Normal'],[2,'2×'],[4,'4×'],[8,'8×']].map(([v,l])=>h('button',{class:c.s0===v&&c.s1===v?'on':'',onclick:()=>{c.s0=c.s1=v;commit('Speed');}},l))),
      rowSlider('Speed',.1,8,.05,()=>c.s0,v=>{c.s0=v;c.s1=v;},pct,{def:1}),h('h4',{},'Speed ramp'),rowSlider('Start speed',.1,8,.05,()=>c.s0,v=>c.s0=v,pct),rowSlider('End speed',.1,8,.05,()=>c.s1,v=>c.s1=v,pct),
      h('div',{class:'btnrow'},h('button',{onclick:()=>{c.s0=1;c.s1=.25;commit('Ramp');}},'Ramp to slow-mo'),h('button',{onclick:()=>{c.s0=.25;c.s1=1;commit('Ramp');}},'Ramp from slow-mo'),h('button',{onclick:()=>{c.s0=1;c.s1=4;commit('Ramp');}},'Ramp to fast')),
      h('div',{class:'row2'},h('label',{},h('input',{type:'checkbox',checked:c.rev,onchange:e=>{c.rev=e.target.checked;commit('Reverse');}}),' Reverse'),c.kind==='video'?h('button',{onclick:freeze},'Freeze frame at playhead'):null)));}
  b.append(h('div',{class:'btnrow',style:'margin-top:10px'},h('button',{onclick:()=>{c.disabled=!c.disabled;commit('Enable');}},c.disabled?'Enable clip':'Disable (V)'),h('button',{onclick:()=>deleteSel(true)},'Delete'),sq.main.includes(c)?h('button',{onclick:()=>deleteSel(false)},'Replace with gap'):null));
  b.scrollTop=st;}
let lookClip=null;
function pasteLook(){for(const c of selClips())if(M.isVisual(c)&&c.kind!=='title')c.fx=clone(lookClip);commit('Paste look');toast('Look pasted');}
function wheels(fx){const g=h('div',{class:'wheels'});for(const [k,n] of [['wl','Shadows'],['wm','Midtones'],['wh','Highlights'],['wo','Global']]){const w=fx[k];const cv=h('canvas',{width:240,height:240});
    const paint=()=>{const x=cv.getContext('2d');const img=x.createImageData(240,240);for(let yy=0;yy<240;yy++)for(let xx=0;xx<240;xx++){const dx=(xx-120)/110,dy=-(yy-120)/110;const r=Math.hypot(dx,dy);if(r>1)continue;const hh=Math.atan2(dy,dx);
        const cr=[Math.cos(hh),Math.cos(hh-2.0944),Math.cos(hh+2.0944)].map(v=>((.5+.5*v*r)*200+30)*.8);const i=(yy*240+xx)*4;img.data[i]=cr[0];img.data[i+1]=cr[1];img.data[i+2]=cr[2];img.data[i+3]=255;}
      x.putImageData(img,0,0);x.strokeStyle='rgba(0,0,0,.4)';x.beginPath();x.moveTo(120,10);x.lineTo(120,230);x.moveTo(10,120);x.lineTo(230,120);x.stroke();
      x.fillStyle='#fff';x.strokeStyle='#000';x.lineWidth=3;x.beginPath();x.arc(120+w.x*110,120-w.y*110,11,0,7);x.fill();x.stroke();};paint();
    const setP=e=>{const r=cv.getBoundingClientRect();let dx=((e.clientX-r.left)/r.width*240-120)/110,dy=-((e.clientY-r.top)/r.height*240-120)/110;const L=Math.hypot(dx,dy);if(L>1){dx/=L;dy/=L;}w.x=dx*.999;w.y=dy*.999;paint();dirty();};
    cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);setP(e);cv.onpointermove=setP;});cv.addEventListener('pointerup',()=>{cv.onpointermove=null;commit('Colour wheel');});
    cv.addEventListener('dblclick',()=>{w.x=0;w.y=0;w.l=0;paint();commit('Reset wheel');});
    g.append(h('div',{class:'wheel'},cv,h('input',{type:'range',min:-1,max:1,step:.01,value:w.l,title:'Brightness',oninput:e=>{w.l=+e.target.value;dirty();},onchange:()=>commit('Wheel')}),n));}
  return g;}
async function autoKey(c,ck){try{const m=S.media.get(c.media);const cv=document.createElement('canvas');cv.width=64;cv.height=36;const x=cv.getContext('2d',{willReadFrequently:true});
    let src;if(c.kind==='image'){src=new Image();src.src=m.url;await src.decode();}else{src=pool.get('v'+c.id,c.media);if(!src||src.readyState<2){toast('Move the playhead over the clip first');return;}}
    x.drawImage(src,0,0,64,36);const d=x.getImageData(0,0,64,36).data;const px=[];for(let yy=0;yy<36;yy++)for(let xx=0;xx<64;xx++)if(xx<4||xx>59||yy<3||yy>32){const i=(yy*64+xx)*4;px.push([d[i],d[i+1],d[i+2]]);}
    const med=k=>px.map(p=>p[k]).sort((a,b)=>a-b)[px.length>>1];ck.color='#'+[med(0),med(1),med(2)].map(v=>v.toString(16).padStart(2,'0')).join('');ck.picked=true;commit('Key colour');toast('Key colour picked from the frame edges');}catch(e){toast('Could not pick: '+e.message);}}
async function stabilise(c){const bar=h('i');modal('Stabilising',h('div',{},h('p',{},h('span',{class:'spin'}),' Analysing camera motion…'),h('div',{class:'prog'},bar)));
  try{const st=await analyseStab(c,p=>bar.style.width=(p*100)+'%');c.stab=st;commit('Stabilise');closeModal();toast('Stabilised');}catch(e){closeModal();toast('Stabilisation failed: '+e.message);}}
// ================= EDIT COMMANDS =================
function deleteSel(ripple){const sq=seq();if(S.selTr){const c=findClip(sq,S.selTr);if(c)c.trans=null;S.selTr=null;commit('Remove transition');return;}const ids=[...S.sel];if(!ids.length)return toast('Select a clip first');
  const n=M.removeClips(sq,ids,ripple);S.sel.clear();commit('Delete');emit('sel');if(n)toast(`Also removed ${n} connected clip${n>1?'s':''}`);}
function bladeAt(all){const sq=seq();const sc=selClip();let n;if(!all&&sc&&!sq.main.includes(sc))n=M.blade(sq,S.T,{id:sc.id});else n=M.blade(sq,S.T,{all});if(n){commit('Blade');toast('Split');}else toast('Move the playhead over a clip to split it');}
function freeze(){const f=M.freezeFrame(seq(),S.T);if(!f)return toast('Put the playhead over a video clip in the storyline');S.sel.clear();S.sel.add(f.id);commit('Freeze frame');emit('sel');toast('Freeze frame added');}
function makeCompound(){const sq=seq();const c=M.makeCompound(sq,[...S.sel]);if(!c)return toast('Select neighbouring clips in the storyline');S.sel.clear();S.sel.add(c.id);commit('Compound');emit('sel');toast('Compound clip created — double-click to open');}
let clipBoard=null;
function copySel(){const cl=selClips();if(!cl.length)return;clipBoard=clone(cl);toast(`Copied ${cl.length} clip${cl.length>1?'s':''}`);}
function pasteClips(){if(!clipBoard)return;const sq=seq();let T=S.T;S.sel.clear();for(const c0 of clipBoard){const c=clone(c0);c.id=M.uid();if(c.seq)allClips(c.seq).forEach(y=>y.id=M.uid());
    if(c0.lane===0||!sq.main.length){c.trans=null;M.insertMain(sq,c,T);T+=dur(c);}else M.connectClip(sq,c,T,c0.lane>0?1:-1);S.sel.add(c.id);}commit('Paste');emit('sel');}
function nudgeEdit(dir){const L=layout(seq());const pts=[...new Set(L.items.flatMap(i=>[i.start,i.end]))].sort((a,b)=>a-b);const T=S.T;const p=dir>0?pts.find(x=>x>T+1e-3):[...pts].reverse().find(x=>x<T-1e-3);if(p!=null){stop();S.T=p;ensureVisible(p);dirty();}}
function setRange(w){if(S.source){markSrc(w);return;}const T=S.T;const r=S.range||[0,seqLen()];if(w==='in')r[0]=Math.min(T,r[1]-0.05);else r[1]=Math.max(T,r[0]+0.05);S.range=r;dirty();renderInsp();toast(w==='in'?'Range start set (⌥X clears)':'Range end set (⌥X clears)');}
function shuttle(dir){if(!S.playing||Math.sign(S.rate)!==dir)play(dir);else play(Math.min(8,Math.abs(S.rate)*2)*dir);if(Math.abs(S.rate)!==1||dir<0)toast(`${dir<0?'◀':'▶'} ${Math.abs(S.rate)}×`,900);}
function step(n){stop();const fps=S.proj.fps;setCurT(Math.max(0,Math.round(curT()*fps+n)/fps));if(!S.source)ensureVisible(S.T);dirty();}
// ================= TOOLBAR =================
function renderToolbar(){const t=$('#toolbar');t.innerHTML='';const tb=(lab,fn,title,on)=>h('button',{class:on?'on':'',title,onclick:fn},lab);
  t.append(tb('↖ Select',()=>{S.tool='select';renderToolbar();},'Select tool (A)',S.tool==='select'),tb('✂ Blade',()=>{S.tool='blade';renderToolbar();},'Blade tool (B): tap a clip to cut it',S.tool==='blade'),tb('⇹ Trim',()=>{S.tool='trim';renderToolbar();},'Trim tool (T): drag an edit point to roll, drag a clip body to slip',S.tool==='trim'),
    h('span',{class:'sep'}),tb('Split',()=>bladeAt(false),'Split at playhead (⌘B)'),tb('Delete',()=>deleteSel(true),'Ripple delete (⌫)'),tb('Detach audio',()=>{const c=selClip();if(!c||c.kind!=='video')return toast('Select a video clip');if(M.detachAudio(seq(),c)){commit('Detach');toast('Audio detached');}},'Detach audio'),
    tb('Freeze',freeze,'Freeze frame (⌥F)'),tb('Compound',makeCompound,'New compound clip (⌥G)'),tb('Dissolve',()=>applyTrans('dissolve'),'Add cross dissolve (⌘T)'),
    h('span',{class:'sep'}),tb('Snap',()=>{S.snap=!S.snap;renderToolbar();},'Snapping (N)',S.snap),!S.mobile?tb('Skim',()=>{S.skim=!S.skim;S.skimT=null;renderToolbar();dirty();},'Skimming (S)',S.skim):null,
    h('span',{class:'sep'}),tb('−',()=>zoomBy(1/1.5),'Zoom out (⌘−)'),tb('Fit',()=>fitView(),'Zoom to fit (⇧Z)'),tb('＋',()=>zoomBy(1.5),'Zoom in (⌘=)'));}
// ================= MOBILE NAV =================
let sheet=null;
function renderNav(){const n=$('#mnav');n.innerHTML='';for(const [k,l,i] of [...LIBTABS,['insp','Inspect','⚙']])n.append(h('button',{class:(sheet===k||(k!=='insp'&&sheet==='lib'&&libTab===k))?'on':'',onclick:()=>{if(k==='insp')openSheet(sheet==='insp'?null:'insp');else{if(sheet==='lib'&&libTab===k)openSheet(null);else{libTab=k;renderLib();openSheet('lib');}}}},h('i',{},i),l));updateNavDot();}
function openSheet(w){sheet=w;$('#lib').classList.toggle('open',w==='lib');$('#insp').classList.toggle('open',w==='insp');renderNav();}
function closeSheets(){if(sheet)openSheet(null);}
function updateNavDot(){const b=$('#mnav button:last-child');if(b)b.classList.toggle('dot',S.sel.size>0||!!S.selTr);}
$('#insp .closeSheet').onclick=closeSheets;
// ================= VIEWER GESTURES =================
(()=>{const v=$('#viewer');let st=null;const ps=new Map();
  v.addEventListener('pointerdown',e=>{if(e.target.closest('.vbtn'))return;ps.set(e.pointerId,{x:e.clientX,y:e.clientY});const c=selClip();
    if(!S.moveMode||!c||!M.isVisual(c)||S.source){st={tap:true,x:e.clientX,y:e.clientY};return;}
    v.setPointerCapture(e.pointerId);const r=$('#stage').getBoundingClientRect();const X=kfProp(c,c.tf,'x','x'),Y=kfProp(c,c.tf,'y','y'),Sc=kfProp(c,c.tf,'s','s');
    st={c,r,x:e.clientX,y:e.clientY,tx:X.get(),ty:Y.get(),s:Sc.get(),d0:null};});
  v.addEventListener('pointermove',e=>{if(!st||!st.c)return;ps.set(e.pointerId,{x:e.clientX,y:e.clientY});const c=st.c;const X=kfProp(c,c.tf,'x','x'),Y=kfProp(c,c.tf,'y','y'),Sc=kfProp(c,c.tf,'s','s');
    if(ps.size>=2){const [a,b]=[...ps.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(st.d0==null){st.d0=d;st.s=Sc.get();}Sc.set(clamp(st.s*d/st.d0,.05,4));}
    else{X.set(st.tx+(e.clientX-st.x)/st.r.width);Y.set(st.ty+(e.clientY-st.y)/st.r.height);}dirty();});
  const end=e=>{ps.delete(e.pointerId);if(st&&st.c&&ps.size===0){commit('Move');st=null;}else if(st&&st.tap&&ps.size===0){if(Math.hypot(e.clientX-st.x,e.clientY-st.y)<8&&e.pointerType!=='mouse')togglePlay();st=null;}};
  v.addEventListener('pointerup',end);v.addEventListener('pointercancel',end);
  v.addEventListener('dblclick',()=>togglePlay());
  v.addEventListener('wheel',e=>{const c=selClip();if(!S.moveMode||!c)return;e.preventDefault();const Sc=kfProp(c,c.tf,'s','s');Sc.set(clamp(Sc.get()*Math.exp(-e.deltaY*.002),.05,4));dirty();clearTimeout(v.wt);v.wt=setTimeout(()=>commit('Scale'),300);},{passive:false});
  $('#moveBtn').onclick=()=>{S.moveMode=!S.moveMode;$('#moveBtn').classList.toggle('on',S.moveMode);toast(S.moveMode?'Select a clip, then drag to move it; pinch or scroll to scale':'Move mode off');renderInsp();};
  $('#fsBtn').onclick=()=>{v.classList.toggle('fs');layoutViewer();};})();
document.querySelectorAll('#transport .tb').forEach(b=>b.onclick=()=>key({key:b.dataset.k,preventDefault(){},synthetic:true}));
// ================= HELP / EXPORT =================
const KEYS=[['Space','Play / pause'],['J K L','Back / stop / forward (again = faster)'],['← →','Previous / next frame'],['↑ ↓','Previous / next edit'],['Home End','Start / end'],['I O','Mark range start / end'],['⌥X','Clear range'],['A','Select tool'],['B','Blade tool'],['T','Trim tool (roll / slip)'],['⌘B','Split at playhead'],['⇧⌘B','Split every lane'],['E','Append source clip'],['W','Insert at playhead'],['Q','Connect at playhead'],['⌫','Ripple delete'],['⇧⌫','Replace with gap'],['⌘T','Cross dissolve'],['⌥F','Freeze frame'],['⌥G','Compound clip'],['⇧⌘G','Break apart'],['V','Disable / enable'],['S','Skimming'],['N','Snapping'],['⌘= ⌘−','Zoom timeline'],['⇧Z','Zoom to fit'],['⌘C ⌘V','Copy / paste clips'],['⌥⌘V','Paste look'],['⌘Z ⇧⌘Z','Undo / redo'],['⌘E','Export'],['⌘I','Import'],['Esc','Close / leave compound']];
$('#helpBtn').onclick=()=>modal('Shortcuts & tips',h('div',{},h('div',{class:'keys'},...KEYS.map(([k,d])=>h('div',{},...k.split(' ').map(x=>h('kbd',{},x)),d))),
  h('h4',{},'How the timeline works'),h('p',{class:'hint'},'The main row is the primary storyline: clips there are magnetic and close up gaps automatically. Clips above or below are connected and move with the storyline clip they’re attached to. Drag clip edges to trim; with the Trim tool drag between two clips to roll, or drag a clip to slip. Tap a clip with the Blade tool to cut. Pinch to zoom the timeline. On iPhone, tap the picture to play/pause.')),{wide:true});
$('#exportBtn').onclick=openExport;
function openExport(){stop();const L=layout(rootSeq());if(L.len<0.05)return toast('Add something to the timeline first');const o={short:1080,fps:S.proj.fps,q:1,useRange:false};
  const wrap=h('div');const draw=()=>{wrap.innerHTML='';const [W,H]=frameSize(S.proj.aspect,o.short);const len=o.useRange&&S.range?S.range[1]-S.range[0]:L.len;
    const sg=(opts,k)=>{const s=h('div',{class:'seg'});for(const [v,l] of opts)s.append(h('button',{class:o[k]===v?'on':'',onclick:()=>{o[k]=v;draw();}},l));return s;};
    wrap.append(h('div',{class:'row2'},h('label',{style:'width:90px'},'Resolution'),sg([[720,'720p'],[1080,'1080p'],[2160,'4K']],'short')),
      h('div',{class:'row2'},h('label',{style:'width:90px'},'Frame rate'),sg([[24,'24'],[25,'25'],[30,'30'],[60,'60']],'fps')),
      h('div',{class:'row2'},h('label',{style:'width:90px'},'Quality'),sg([[.6,'Smaller'],[1,'High'],[1.6,'Best']],'q')),
      S.range&&!S.seqPath.length?h('div',{class:'row2'},h('label',{},h('input',{type:'checkbox',checked:o.useRange,onchange:e=>{o.useRange=e.target.checked;draw();}}),' Only the I/O range')):null,
      h('p',{class:'hint'},`${W}×${H} · ${o.fps} fps · ${fmtD(len)} · about ${Math.max(1,Math.round(W*H*o.fps*.16*o.q*len/8/1e6+len*0.024))} MB · MP4 (H.264 + AAC) — plays on iPhone`),
      h('button',{class:'primary big',onclick:()=>runExport({short:o.short,fps:o.fps,quality:o.q,range:o.useRange&&S.range?S.range:null})},'Export movie'),
      o.short===2160?h('p',{class:'hint'},'4K takes much longer and needs lots of memory; iPhones may run out on long movies.'):null);};draw();
  modal('Export',wrap);}
async function runExport(opts){const bar=h('i');const msg=h('span',{},'Starting…');const eta=h('span',{class:'hint'});const sig={};
  modal('Exporting',h('div',{},h('p',{},h('span',{class:'spin'}),' ',msg),h('div',{class:'prog'},bar),eta,h('p',{class:'hint'},'Keep this screen open until it finishes.'),h('button',{onclick:()=>{sig.cancel=true;}},'Cancel')));
  closeModal.cb=()=>{sig.cancel=true;};const t0=performance.now();let wl=null;try{wl=await navigator.wakeLock?.request('screen');}catch(e){}
  try{const r=await exportMovie(S.proj,rootSeq(),{...opts,signal:sig,onProgress:(p,m,e)=>{bar.style.width=(p*100)+'%';msg.textContent=m;if(e!=null)eta.textContent=`About ${Math.ceil(e)}s left`;}});
    closeModal.cb=null;window.__lastExport=r;showExport(r,(performance.now()-t0)/1000);return r;}
  catch(e){closeModal.cb=null;closeModal();if(e.message!=='cancelled')modal('Export failed',h('p',{},String(e.message||e)));else toast('Export cancelled');}
  finally{try{wl&&wl.release();}catch(e){}}}
function showExport(r,secs){const ext=r.blob.type.includes('mp4')?'mp4':'webm';const name=(S.proj.name||'movie').replace(/[^\w\- ]+/g,'').trim()+'.'+ext;const url=URL.createObjectURL(r.blob);
  const file=new File([r.blob],name,{type:r.blob.type});const canShare=!!(navigator.canShare&&navigator.canShare({files:[file]}));
  modal('Your movie is ready',h('div',{},h('video',{src:url,controls:true,playsinline:true,style:'width:100%;max-height:44vh;background:#000;border-radius:10px'}),h('p',{class:'hint'},`${r.W}×${r.H} · ${r.fps} fps · ${(r.blob.size/1e6).toFixed(1)} MB · ${r.method} · took ${secs.toFixed(0)}s`),
    canShare?h('button',{class:'primary big',onclick:async()=>{try{await navigator.share({files:[file],title:S.proj.name});}catch(e){}}},'Save to Photos / Share'):null,
    h('a',{href:url,download:name,style:'display:block'},h('button',{class:canShare?'big':'primary big'},'Download '+name))));}
// ================= KEYBOARD =================
function key(e){if(!S.proj||$('#editor').hidden)return;const tg=e.target;if(!e.synthetic&&tg&&((tg.tagName==='INPUT'&&!['range','checkbox','color'].includes(tg.type))||tg.tagName==='TEXTAREA'||tg.tagName==='SELECT'))return;
  if(!$('#modal').hidden){if(e.key==='Escape')closeModal();return;}
  const cmd=e.metaKey||e.ctrlKey,k=e.key,K=k.length===1?k.toLowerCase():k;let handled=true;
  if(cmd&&K==='z'){e.shiftKey?redo():undo();}else if(cmd&&K==='y'){redo();}
  else if(cmd&&K==='b'){bladeAt(e.shiftKey);}else if(cmd&&K==='t'){applyTrans('dissolve');}else if(cmd&&K==='e'){openExport();}else if(cmd&&K==='i'){$('#fileIn').click();}
  else if(cmd&&K==='c'){copySel();}else if(cmd&&e.altKey&&(K==='v'||e.code==='KeyV')){lookClip?pasteLook():toast('Copy a look first');}else if(cmd&&K==='v'){pasteClips();}
  else if(cmd&&e.shiftKey&&K==='g'){const c=selClip();if(c&&M.breakApart(seq(),c.id)){S.sel.clear();commit('Break apart');}}
  else if(cmd&&(k==='='||k==='+')){zoomBy(1.5);}else if(cmd&&k==='-'){zoomBy(1/1.5);}
  else if(cmd&&K==='a'){for(const it of layout(seq()).items)S.sel.add(it.c.id);emit('sel');dirty();}
  else if(cmd){handled=false;}
  else if(e.altKey&&e.code==='KeyF'){freeze();}else if(e.altKey&&e.code==='KeyG'){makeCompound();}else if(e.altKey&&e.code==='KeyX'){S.range=null;dirty();renderInsp();}
  else switch(K){
    case ' ':togglePlay();break;case 'j':shuttle(-1);break;case 'k':stop();break;case 'l':shuttle(1);break;
    case 'ArrowLeft':step(e.shiftKey?-10:-1);break;case 'ArrowRight':step(e.shiftKey?10:1);break;case 'ArrowUp':nudgeEdit(-1);break;case 'ArrowDown':nudgeEdit(1);break;
    case 'Home':stop();setCurT(0);S.scrollX=0;dirty();break;case 'End':stop();setCurT(S.source?S.media.get(S.source.id).dur:seqLen());if(!S.source)ensureVisible(S.T);dirty();break;
    case 'i':setRange('in');break;case 'o':setRange('out');break;
    case 'a':S.tool='select';renderToolbar();break;case 'b':S.tool='blade';renderToolbar();break;case 't':S.tool='trim';renderToolbar();break;
    case 'e':case 'w':case 'q':{const mode={e:'append',w:'insert',q:'connect'}[K];if(S.source)addFromSource(mode);else toast('Choose a clip in Media first');break;}
    case 'Delete':case 'Backspace':deleteSel(!e.shiftKey);break;
    case 'v':{const cl=selClips();cl.forEach(c=>c.disabled=!c.disabled);if(cl.length)commit('Enable');break;}
    case 's':S.skim=!S.skim;S.skimT=null;renderToolbar();dirty();toast('Skimming '+(S.skim?'on':'off'),900);break;
    case 'n':S.snap=!S.snap;renderToolbar();toast('Snapping '+(S.snap?'on':'off'),900);break;
    case 'z':if(e.shiftKey)fitView();else handled=false;break;
    case 'Escape':if(S.source)closeSource();else if(S.seqPath.length){S.seqPath.pop();renderCrumbs();fitView();dirty();emit('sel');}else{S.sel.clear();S.selTr=null;emit('sel');dirty();}break;
    case '?':$('#helpBtn').click();break;
    default:handled=false;}
  if(handled)e.preventDefault();}
document.addEventListener('keydown',key);
// ================= BOOT =================
initTimeline($('#tl'));
window.addEventListener('pagehide',()=>{if(S.proj){snapshotThumb();save(true);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&S.proj){stop();snapshotThumb();save(true);}});
renderHome();
window.VS={S,seq,commit,importFiles,addMedia,openProject,createProject,layout,M,play,stop,applyTrans,addTitle,openSource,addFromSource,rootSeq,runExport,applyTheme,makeTrailer,makeMagic,runCaptions,addMusic,TRAILERS,renderLib,setLib,openSheet,dirty};
