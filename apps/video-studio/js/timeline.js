// Magnetic timeline (canvas): primary storyline, connected lanes, skimming, trim/roll/slip, blade, fades, transitions, pinch zoom
import {S,seq,commit,emit,dirty} from './state.js';
import {layout,dur,srcAt,blade,trimClip,rollEdit,slipClip,moveMain,toConnected,toMain,reanchor,clone,clamp,findClip,isMediaKind} from './model.js';
import {TRANSITIONS} from './comp.js';
let cv,ctx,W=0,H=0,dpr=1,L=null,Gm=null,drag=null;const ptrs=new Map();let pinch=null;
const G={ruler:26,mainH:74,laneH:46,aH:42,gap:4,pad:14};
const COL={video:'#3d6fd6',image:'#7a52d1',freeze:'#4f7fc9',audio:'#22a06b',title:'#a24bd1',color:'#5d6470',gap:'#2a2f38',compound:'#0e9aa7'};
export const x2t=x=>(x-G.pad+S.scrollX)/S.pps;export const t2x=t=>t*S.pps-S.scrollX+G.pad;
const imgCache=new Map();function img(src){let i=imgCache.get(src);if(!i){i=new Image();i.onload=()=>{S.tlDirty=true;};i.src=src;imgCache.set(src,i);}return i.complete&&i.naturalWidth?i:null;}
export function initTimeline(canvas){cv=canvas;ctx=cv.getContext('2d');
  const ro=new ResizeObserver(()=>{resize();});ro.observe(cv.parentElement);resize();
  cv.addEventListener('pointerdown',down);cv.addEventListener('pointermove',move);cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('pointerleave',()=>{if(S.skimT!=null&&!drag){S.skimT=null;dirty();}});
  cv.addEventListener('wheel',wheel,{passive:false});cv.addEventListener('dblclick',dbl);cv.addEventListener('contextmenu',e=>e.preventDefault());}
function resize(){const r=cv.parentElement.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);W=r.width;H=r.height;if(S.autoFit&&S.proj)setTimeout(()=>fitView(true));cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);cv.style.width=W+'px';cv.style.height=H+'px';
  G.mainH=S.mobile?62:74;G.laneH=S.mobile?40:46;G.aH=S.mobile?36:42;S.tlDirty=true;}
function geo(extra){L=layout(seq());let mx=1,mn=-1;for(const it of L.items){mx=Math.max(mx,it.lane);mn=Math.min(mn,it.lane);}
  if(extra){mx=Math.max(mx,extra.up||0);mn=Math.min(mn,extra.down||0);}
  const top=G.ruler+6-S.scrollY;const up=(G.laneH+G.gap);
  const y=l=>l>0?top+(mx-l)*up:l===0?top+mx*up:top+mx*up+G.mainH+G.gap+(-l-1)*(G.aH+G.gap);
  const h=l=>l>0?G.laneH:l===0?G.mainH:G.aH;const total=mx*up+G.mainH+G.gap+(-mn)*(G.aH+G.gap)+G.ruler+20;
  const laneAt=py=>{for(let l=mx+1;l>=mn-1;l--){const yy=y(l),hh=h(l);if(py>=yy-G.gap/2&&py<yy+hh+G.gap/2)return l;}return py<y(mx)?mx+1:mn-1;};
  Gm={mx,mn,y,h,total,laneAt};return Gm;}
export function fitView(auto){if(!auto)S.autoFit=true;const len=Math.max(layout(seq()).len,auto?5:1)||10;if(!W)return;if(auto&&len*S.pps<=W-G.pad*2-10&&len*S.pps>=(W-G.pad*2)*.55)return;S.pps=clamp((W-G.pad*2-20)/len,4,800);S.scrollX=0;S.tlDirty=true;}
export function ensureVisible(T){const x=t2x(T);if(x>W-40||x<10){S.scrollX=Math.max(0,T*S.pps-W*.3);S.tlDirty=true;}}
export function zoomBy(f,cx=W/2){S.autoFit=false;const t=x2t(cx);S.pps=clamp(S.pps*f,2,1200);S.scrollX=Math.max(0,t*S.pps-cx+G.pad);S.tlDirty=true;}
function rr(x,y,w,h,r){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);}
function fmtRuler(t){const m=Math.floor(t/60),s=Math.floor(t%60);return `${m}:${String(s).padStart(2,'0')}`;}
export function drawTimeline(){if(!cv||!W)return;S.tlDirty=false;const g=geo(drag&&drag.extra);ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#121418';ctx.fillRect(0,0,W,H);
  // lane backgrounds
  for(let l=g.mx;l>=g.mn;l--){const y=g.y(l);ctx.fillStyle=l===0?'#1a1e25':'#15181d';ctx.fillRect(0,y,W,g.h(l));}
  ctx.fillStyle='rgba(255,255,255,.04)';ctx.fillRect(0,g.y(0)-2,W,1);
  // range
  if(S.range){ctx.fillStyle='rgba(255,196,0,.08)';const a=t2x(S.range[0]),b=t2x(S.range[1]);ctx.fillRect(a,G.ruler,b-a,H);}
  // connection lines
  ctx.strokeStyle='rgba(255,255,255,.25)';ctx.lineWidth=1;
  for(const it of L.items)if(it.conn){const a=L.byId[it.c.anchor];if(!a)continue;const x=t2x(it.start);if(x<-5||x>W+5)continue;
    const y0=g.y(it.lane)+(it.lane>0?g.h(it.lane):0),y1=g.y(0)+(it.lane>0?0:G.mainH);ctx.beginPath();ctx.moveTo(x+.5,y0);ctx.lineTo(x+.5,y1);ctx.stroke();ctx.fillStyle='rgba(255,255,255,.5)';ctx.beginPath();ctx.arc(x+.5,y1,2.5,0,7);ctx.fill();}
  for(const it of L.items){if(drag&&drag.type==='move'&&drag.id===it.c.id)continue;drawClip(it,g);}
  // transitions
  for(const it of L.main)if(it.tr>0){const x0=t2x(it.start),x1=t2x(it.start+it.tr);const y=g.y(0);const sel=S.selTr===it.c.id;
    ctx.fillStyle=sel?'#ffcc33':'rgba(20,22,28,.85)';rr(x0,y+2,Math.max(10,x1-x0),18,5);ctx.fill();ctx.strokeStyle='#ffcc33';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=sel?'#111':'#ffcc33';ctx.font='600 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';if(x1-x0>26)ctx.fillText(x1-x0>90?TRANSITIONS[it.c.trans.type]||'⋈':'⋈',(x0+x1)/2,y+11.5);ctx.textAlign='left';}
  // drag ghost
  if(drag&&drag.type==='move'&&drag.ghost){const gh=drag.ghost;const y=g.y(gh.lane),hh=g.h(gh.lane);ctx.globalAlpha=.75;const it={c:drag.c,start:gh.start,end:gh.start+dur(drag.c),lane:gh.lane};drawClip(it,g,true);ctx.globalAlpha=1;
    if(gh.lane===0&&gh.insX!=null){ctx.fillStyle='#ffcc33';ctx.fillRect(gh.insX-1.5,g.y(0)-4,3,G.mainH+8);}}
  // ruler
  ctx.fillStyle='#0d0f12';ctx.fillRect(0,0,W,G.ruler);ctx.strokeStyle='#333a45';ctx.fillStyle='#8b93a1';ctx.font='10px system-ui';ctx.textBaseline='top';
  const steps=[1/30,.1,.25,.5,1,2,5,10,15,30,60,120,300,600];const minor=steps.find(s=>s*S.pps>=8)||600;const major=steps.find(s=>s*S.pps>=70)||600;
  const t0=Math.max(0,Math.floor(x2t(0)/minor)*minor),t1=x2t(W);ctx.beginPath();
  for(let t=t0;t<=t1;t+=minor){const x=Math.round(t2x(t))+.5;const isM=Math.abs(t/major-Math.round(t/major))<1e-3;ctx.moveTo(x,isM?10:19);ctx.lineTo(x,G.ruler);if(isM)ctx.fillText(major<1?(t).toFixed(major<.25?2:1)+'s':fmtRuler(t),x+3,4);}ctx.stroke();
  if(S.range){ctx.fillStyle='#ffc400';const a=t2x(S.range[0]),b=t2x(S.range[1]);ctx.fillRect(a,G.ruler-4,b-a,4);}
  // skimmer
  if(S.skimT!=null&&S.skim){const x=t2x(S.skimT);ctx.fillStyle='#ff4d6d';ctx.fillRect(x-.5,0,1,H);}
  // playhead
  const px=t2x(S.T);ctx.fillStyle='#ffffff';ctx.fillRect(Math.round(px)-1,0,2,H);ctx.beginPath();ctx.moveTo(px-7,0);ctx.lineTo(px+7,0);ctx.lineTo(px,10);ctx.fill();
  if(drag&&drag.snapX!=null){ctx.fillStyle='#ffcc33';ctx.fillRect(drag.snapX-.5,G.ruler,1,H);}
  if(!L.items.length){ctx.fillStyle='#6b7380';ctx.font='14px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(S.mobile?'Tap Media below to add photos & videos':'Import media, then drag it here or press E to append',W/2,g.y(0)+G.mainH/2);ctx.textAlign='left';}}
function drawClip(it,g,ghost){const c=it.c;const x0=t2x(it.start),x1=t2x(it.end);if(x1<-2||x0>W+2)return;const y=g.y(it.lane),h=g.h(it.lane);const w=Math.max(2,x1-x0);
  const sel=S.sel.has(c.id);const m=c.media?S.media.get(c.media):null;
  ctx.save();rr(x0+.5,y,w-1,h,6);ctx.fillStyle=COL[c.kind]||'#555';ctx.fill();ctx.clip();
  const audioBand=(c.kind==='video'&&!c.mute&&m&&m.hasAudio&&it.lane===0);const vh=audioBand?h*.64:h;
  if((c.kind==='video'||c.kind==='freeze'||c.kind==='image')&&m&&m.thumbs&&m.thumbs.length){const th=vh-16;const tw=th*(m.w&&m.h?m.w/m.h:16/9);
    if(tw>4)for(let x=Math.max(x0,x0+Math.floor((0-x0)/tw)*tw);x<Math.min(x1,W);x+=tw){const lt=(x+tw/2-x0)/S.pps;let idx=0;
      if(c.kind==='video'){idx=Math.floor(clamp(srcAt(c,Math.min(lt,it.end-it.start))/m.dur,0,.999)*m.thumbs.length);}else if(c.kind==='freeze')idx=Math.floor(clamp(c.ft/m.dur,0,.999)*m.thumbs.length);
      const im=img(m.thumbs[idx]);if(im)ctx.drawImage(im,x,y+14,tw,th);}}
  if(c.kind==='title'){ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(x0,y+14,w,h-14);}
  if(c.kind==='compound'){ctx.fillStyle='rgba(255,255,255,.07)';for(let k=0;k<3;k++)ctx.fillRect(x0+4+k*3,y+16+k*3,Math.max(0,w-12),h-24);}
  // waveform
  const wave=(yy,hh,colr)=>{if(!m||!m.peaks)return;ctx.fillStyle=colr;const pk=m.peaks;const n=pk.length;const mid=yy+hh/2;ctx.beginPath();
    const xa=Math.max(x0,0),xb=Math.min(x1,W);for(let x=xa;x<xb;x+=2){const lt=(x-x0)/S.pps;const st=srcAt(c,lt);const v=pk[Math.min(n-1,Math.max(0,Math.floor(st*50)))]||0;const gv=c.vol;const a=Math.min(hh/2,v*gv*hh/2+.5);ctx.rect(x,mid-a,1.5,a*2);}ctx.fill();};
  if(audioBand){ctx.fillStyle='#16804f';ctx.fillRect(x0,y+vh,w,h-vh);wave(y+vh,h-vh,'#7ff0b7');}
  if(c.kind==='audio')wave(y+14,h-16,'rgba(220,255,235,.85)');
  // label
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(x0,y,w,14);ctx.fillStyle='#fff';ctx.font='600 10px system-ui';ctx.textBaseline='top';
  let label=c.name||(c.kind==='title'?(c.title&&c.title.text)||'Title':m?m.name:c.kind);if(c.kind==='gap')label='Gap';
  const sp=(c.s0!==1||c.s1!==1)&&isMediaKind(c.kind)?(c.s0===c.s1?` ${Math.round(c.s0*100)}%`:` ${Math.round(c.s0*100)}→${Math.round(c.s1*100)}%`):'';
  const badge=(c.rev?' ◀':'')+sp+(c.stab?' ⛶':'')+(c.fx&&c.fx.lut?' ◐':'')+(c.fx&&c.fx.ck&&c.fx.ck.on?' ▣':'')+(c.duck?' ⇩':'');
  if(w>24)ctx.fillText((c.kind==='title'?'T  ':c.kind==='compound'?'⧉ ':'')+label+badge,Math.max(x0,0)+5,y+2);
  // fades
  const hasA=c.kind==='audio'||audioBand;if(hasA&&w>30){const ay=c.kind==='audio'?y+14:y+vh;const ah=h-(ay-y);ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=1;
    const fi=c.fadeIn*S.pps,fo=c.fadeOut*S.pps;ctx.beginPath();ctx.moveTo(x0,ay+ah);ctx.lineTo(x0+fi,ay+2);ctx.lineTo(x1-fo,ay+2);ctx.lineTo(x1,ay+ah);ctx.stroke();
    if(sel){ctx.fillStyle='#fff';for(const xx of [x0+fi+5,x1-fo-5]){ctx.beginPath();ctx.arc(clamp(xx,x0+5,x1-5),ay+5,4,0,7);ctx.fill();}}}
  // keyframes
  const ks=new Set();for(const p in c.kf)for(const k of c.kf[p])ks.add(Math.round(k.t*100)/100);ctx.fillStyle='#ffd34d';
  for(const t of ks){const xx=x0+t*S.pps;ctx.save();ctx.translate(xx,y+h-7);ctx.rotate(Math.PI/4);ctx.fillRect(-3,-3,6,6);ctx.restore();}
  if(c.disabled){ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(x0,y,w,h);}
  ctx.restore();
  // J/L extensions
  if(hasA&&(c.aIn>0||c.aOut>0)){ctx.fillStyle='rgba(34,160,107,.55)';const ay=y+h-6;if(c.aIn>0)ctx.fillRect(x0-c.aIn*S.pps,ay,c.aIn*S.pps,6);if(c.aOut>0)ctx.fillRect(x1,ay,c.aOut*S.pps,6);}
  rr(x0+.5,y,w-1,h,6);ctx.lineWidth=sel?2.5:1;ctx.strokeStyle=sel?'#ffcc33':'rgba(255,255,255,.18)';ctx.stroke();
  if(sel&&w>20){ctx.fillStyle='#ffcc33';rr(x0+1,y+h/2-12,5,24,2);ctx.fill();rr(x1-6,y+h/2-12,5,24,2);ctx.fill();}}
function pos(e){const r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function hit(p){const g=Gm||geo();const touch=S.mobile;const E=touch?14:7;let best=null;
  for(let i=L.items.length-1;i>=0;i--){const it=L.items[i];const x0=t2x(it.start),x1=t2x(it.end),y=g.y(it.lane),h=g.h(it.lane);
    if(p.y<y||p.y>y+h||p.x<x0-E||p.x>x1+E)continue;
    if(it.lane===0&&it.tr>0&&p.y<y+22&&p.x>=t2x(it.start)-4&&p.x<=t2x(it.start+it.tr)+4)return {it,part:'trans'};
    const c=it.c;const sel=S.sel.has(c.id);const m=c.media&&S.media.get(c.media);const audioBand=c.kind==='audio'||(c.kind==='video'&&!c.mute&&m&&m.hasAudio&&it.lane===0);
    if(sel&&audioBand){const ay=c.kind==='audio'?y+14:y+h*.64;if(Math.abs(p.y-(ay+5))<10){const fi=x0+c.fadeIn*S.pps+5,fo=x1-c.fadeOut*S.pps-5;if(Math.abs(p.x-fi)<10)return {it,part:'fi'};if(Math.abs(p.x-fo)<10)return {it,part:'fo'};}}
    const ew=Math.min(E+2,(x1-x0)/3);
    if(p.x<x0+ew&&(sel||!touch||true))best=best||{it,part:'l'};else if(p.x>x1-ew)best=best||{it,part:'r'};else return {it,part:'body'};}
  return best;}
function snapPts(ex){const pts=[S.T];for(const it of L.items){if(ex&&ex.has(it.c.id))continue;pts.push(it.start,it.end);}return pts;}
function snap(t,ex){if(!S.snap)return {t,x:null};const th=8/S.pps;let b=null,bd=th;for(const p of snapPts(ex)){const d=Math.abs(p-t);if(d<bd){bd=d;b=p;}}return b==null?{t,x:null}:{t:b,x:t2x(b)};}
function setT(t){S.T=clamp(t,0,Math.max(0,L?L.len:0));S.skimT=null;emit('seek');dirty();}
function down(e){cv.setPointerCapture(e.pointerId);const p=pos(e);ptrs.set(e.pointerId,p);
  if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch={d:Math.abs(a.x-b.x)+1,pps:S.pps,cx:(a.x+b.x)/2,t:x2t((a.x+b.x)/2)};drag=null;return;}
  emit('stop-if-playing-scrub');geo();
  if(p.y<G.ruler){drag={type:'scrub'};emit('pause');setT(x2t(p.x));return;}
  const h=hit(p);const seqv=seq();
  if(S.tool==='blade'&&h&&h.part!=='trans'){const t=x2t(p.x);if(blade(seqv,t,{id:h.it.c.id}))commit('Blade');S.T=t;dirty();return;}
  if(h){const c=h.it.c;
    if(h.part==='trans'){S.selTr=c.id;S.sel.clear();emit('sel');drag={type:'trdur',c,x0:p.x,d0:c.trans.dur};dirty();return;}
    S.selTr=null;
    if(h.part==='fi'||h.part==='fo'){drag={type:'fade',c,which:h.part,x0:p.x,v0:h.part==='fi'?c.fadeIn:c.fadeOut,max:(h.it.end-h.it.start)};return;}
    if(h.part==='l'||h.part==='r'){if(!S.sel.has(c.id)&&!e.shiftKey){S.sel.clear();S.sel.add(c.id);emit('sel');}
      if(S.tool==='trim'&&h.it.lane===0){const i=h.it.idx;const a=h.part==='l'?L.main[i-1]:h.it,b=h.part==='l'?h.it:L.main[i+1];
        if(a&&b){drag={type:'roll',a:a.c,b:b.c,x0:p.x,sa:clone(a.c),sb:clone(b.c)};return;}}
      drag={type:'trim',c,edge:h.part,x0:p.x,snap0:clone(c),it:h.it,lane:h.it.lane};return;}
    const wasSel=S.sel.has(c.id);
    if(e.shiftKey||e.metaKey||e.ctrlKey){if(wasSel)S.sel.delete(c.id);else S.sel.add(c.id);}else if(!wasSel){S.sel.clear();S.sel.add(c.id);}
    emit('sel');dirty();
    if(S.tool==='trim'&&isMediaKind(c.kind)){drag={type:'slip',c,x0:p.x,s0:clone(c)};return;}
    drag={type:'maybe',c,it:h.it,x0:p.x,y0:p.y,touch:e.pointerType==='touch',wasSel,sx0:S.scrollX,sy0:S.scrollY};return;}
  if(!e.shiftKey){S.sel.clear();S.selTr=null;emit('sel');}
  drag={type:'pan',x0:p.x,y0:p.y,sx0:S.scrollX,sy0:S.scrollY,moved:false,mouse:e.pointerType==='mouse'};dirty();}
function move(e){const p=pos(e);if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,p);
  if(pinch&&ptrs.size>=2){const [a,b]=[...ptrs.values()];const d=Math.abs(a.x-b.x)+1;S.autoFit=false;S.pps=clamp(pinch.pps*d/pinch.d,2,1200);S.scrollX=Math.max(0,pinch.t*S.pps-pinch.cx+G.pad);S.tlDirty=true;return;}
  if(!drag){if(e.pointerType==='mouse'&&S.skim&&p.y>0){S.skimT=Math.max(0,x2t(p.x));emit('skim');dirty();}return;}
  const dx=p.x-drag.x0;
  switch(drag.type){
    case 'scrub':setT(x2t(p.x));break;
    case 'maybe':if(Math.hypot(dx,p.y-drag.y0)>7){if(drag.touch&&!drag.wasSel){drag={type:'pan',x0:drag.x0,y0:drag.y0,sx0:drag.sx0,sy0:drag.sy0,moved:true};move(e);return;}
        drag={type:'move',id:drag.c.id,c:drag.c,it:drag.it,x0:drag.x0,y0:drag.y0,grab:x2t(drag.x0)-drag.it.start};}else break;
    case 'move':{const ex=new Set([drag.id]);let st=Math.max(0,x2t(p.x)-drag.grab);const s1=snap(st,ex),s2=snap(st+dur(drag.c),ex);
      let sx=null;if(s1.x!=null){st=s1.t;sx=s1.x;}else if(s2.x!=null){st=s2.t-dur(drag.c);sx=s2.x;}drag.snapX=sx;
      let lane=Gm.laneAt(p.y);if(drag.c.kind==='audio'&&lane>0&&drag.it.lane<0)lane=lane;drag.extra={up:lane>0?lane:0,down:lane<0?lane:0};
      let insX=null,insIdx=null;if(lane===0){const t=x2t(p.x);const others=L.main.filter(i=>i.c.id!==drag.id);insIdx=others.filter(i=>(i.start+i.end)/2<t).length;
        const ref=others[insIdx-1];insX=ref?t2x(ref.end):t2x(others[0]?others[0].start:0);}
      drag.ghost={start:lane===0?x2t(p.x)-drag.grab:st,lane,insX,insIdx};S.tlDirty=true;break;}
    case 'trim':{Object.assign(drag.c,clone(drag.snap0));let dt=dx/S.pps;
      if(drag.edge==='r'){const target=drag.it.end+dt;const s=snap(target,new Set([drag.c.id]));if(s.x!=null){dt=s.t-drag.it.end;drag.snapX=s.x;}else drag.snapX=null;}
      else if(drag.lane!==0){const target=drag.it.start+dt;const s=snap(target,new Set([drag.c.id]));if(s.x!=null){dt=s.t-drag.it.start;drag.snapX=s.x;}else drag.snapX=null;}
      trimClip(seq(),drag.c,drag.edge,dt);emit('trim',drag.c,drag.edge);dirty();break;}
    case 'roll':{Object.assign(drag.a,clone(drag.sa));Object.assign(drag.b,clone(drag.sb));rollEdit(seq(),drag.a,drag.b,dx/S.pps);emit('trim',drag.a,'r');dirty();break;}
    case 'slip':{Object.assign(drag.c,clone(drag.s0));slipClip(drag.c,dx/S.pps);emit('trim',drag.c,'l');dirty();break;}
    case 'fade':{const v=clamp(drag.v0+(drag.which==='fi'?dx:-dx)/S.pps,0,drag.max/2);if(drag.which==='fi')drag.c.fadeIn=v;else drag.c.fadeOut=v;dirty();break;}
    case 'trdur':{drag.c.trans.dur=clamp(drag.d0+dx*2/S.pps,.1,5);dirty();break;}
    case 'pan':{if(Math.hypot(dx,p.y-drag.y0)>4)drag.moved=true;if(drag.mouse&&!e.shiftKey&&drag.moved&&Math.abs(p.y-drag.y0)<200){/* mouse drag on empty = marquee-free scrub */setT(x2t(p.x));break;}
      S.scrollX=Math.max(0,drag.sx0-dx);S.scrollY=clamp(drag.sy0-(p.y-drag.y0),0,Math.max(0,(Gm?Gm.total:0)-H));S.tlDirty=true;break;}}}
function up(e){ptrs.delete(e.pointerId);if(pinch){if(ptrs.size<2)pinch=null;drag=null;return;}
  const p=pos(e);const d=drag;drag=null;if(!d)return;const sq=seq();
  switch(d.type){
    case 'maybe':setT(x2t(p.x));break;
    case 'pan':if(!d.moved)setT(x2t(p.x));break;
    case 'move':{const gh=d.ghost;if(!gh){break;}const c=findClip(sq,d.id);if(!c)break;const fromMain=sq.main.includes(c);
      if(gh.lane===0){if(fromMain){const others=sq.main.filter(x=>x.id!==d.id);const ref=others[gh.insIdx];moveMain(sq,d.id,ref?sq.main.indexOf(ref):sq.main.length);}
        else{toMain(sq,d.id,x2t(gh.insX+1));}}
      else{if(fromMain)toConnected(sq,d.id,Math.max(0,gh.start),gh.lane);else{c.lane=gh.lane;reanchor(sq,c,Math.max(0,gh.start));}}
      commit('Move');break;}
    case 'trim':case 'roll':case 'slip':case 'fade':case 'trdur':commit(d.type);break;}
  S.tlDirty=true;}
function wheel(e){e.preventDefault();if(e.ctrlKey||e.metaKey){zoomBy(Math.exp(-e.deltaY*0.01),pos(e).x);return;}
  const g=Gm||geo();if(e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)||g.total<=H)S.scrollX=Math.max(0,S.scrollX+(e.deltaX||e.deltaY));
  else S.scrollY=clamp(S.scrollY+e.deltaY,0,Math.max(0,g.total-H));S.tlDirty=true;}
function dbl(e){const h=hit(pos(e));if(h&&h.it.c.kind==='compound')emit('open-compound',h.it.c);else if(h)emit('inspect',h.it.c);}
export function tlHeightNeeded(){const g=geo();return g.total;}
