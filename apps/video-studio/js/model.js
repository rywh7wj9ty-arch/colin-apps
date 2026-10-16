// Video Studio — project model, magnetic timeline layout and edit operations
export const uid=()=>Math.random().toString(36).slice(2,9)+(Date.now()%1e6).toString(36);
export const env={mediaDur:()=>1e9, hasAudio:()=>true};
export const clone=o=>JSON.parse(JSON.stringify(o));
export const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const lerp=(a,b,u)=>a+(b-a)*u;
export const ease=u=>u*u*(3-2*u);
export const ASPECTS={'16:9':[16,9],'9:16':[9,16],'1:1':[1,1]};
export const EPS=1e-6;
export function frameSize(aspect,short=1080){const [a,b]=ASPECTS[aspect]||[16,9];
  if(a>=b) return [Math.round(short*a/b/2)*2,short]; return [short,Math.round(short*b/a/2)*2];}
export const isMediaKind=k=>k==='video'||k==='audio';
export const isVisual=c=>c.kind!=='audio';
export function defFx(){return {exp:0,con:0,hl:0,sh:0,sat:1,vib:0,temp:0,tint:0,vig:0,
  wl:{x:0,y:0,l:0},wm:{x:0,y:0,l:0},wh:{x:0,y:0,l:0},wo:{x:0,y:0,l:0},lut:'',lutAmt:1,ck:null};}
export function defTf(){return {x:0,y:0,s:1,r:0,o:1,fit:'fit',crop:[0,0,0,0]};}
export function newClip(kind,o={}){return Object.assign({id:uid(),kind,name:'',media:null,in:0,out:4,s0:1,s1:1,rev:false,
  vol:1,mute:false,fadeIn:0,fadeOut:0,aIn:0,aOut:0,duck:false,duckLvl:0.25,trans:null,fx:defFx(),tf:defTf(),kb:null,kf:{},
  title:null,color:'#000000',stab:null,seq:null,ft:0,off:0,lane:0,anchor:null,disabled:false},o);}
export function newSeq(){return {main:[],conn:[]};}
export function newProject(name='My Movie',aspect='16:9'){return {id:uid(),name,aspect,fps:30,created:Date.now(),modified:Date.now(),
  media:[],luts:{},theme:null,timeline:newSeq(),thumb:null,v:1};}

export function dur(c){const l=Math.max(0,c.out-c.in);return isMediaKind(c.kind)?l*2/Math.max(0.02,c.s0+c.s1):l;}
export function speedAt(c,t){const D=dur(c);return D>0?c.s0+(c.s1-c.s0)*clamp(t/D):c.s0;}
export function srcAt(c,t){if(c.kind==='freeze')return c.ft;if(!isMediaKind(c.kind))return c.in+t;
  const D=dur(c)||1;const f=c.s0*t+(c.s1-c.s0)*t*t/(2*D);return c.rev?c.out-f:c.in+f;}

// Magnetic layout: primary storyline is sequential; transitions overlap neighbours; connected clips follow their anchor.
export function layout(seq){
  const items=[],byId={},main=[];let t=0;
  seq.main.forEach((c,i)=>{const d=dur(c);let tr=0;
    if(i>0&&c.trans) tr=Math.min(c.trans.dur,d/2,dur(seq.main[i-1])/2);
    const s=t-tr;const it={c,start:s,end:s+d,lane:0,idx:i,tr,trOut:0};
    if(i>0) main[i-1].trOut=tr;
    items.push(it);main.push(it);byId[c.id]=it;t=s+d;});
  const mainLen=t;
  for(const c of seq.conn){const a=byId[c.anchor];const s=(a?a.start:0)+c.off;
    const it={c,start:s,end:s+dur(c),lane:c.lane||1,conn:true};items.push(it);byId[c.id]=it;}
  let len=mainLen;for(const it of items)len=Math.max(len,it.end);
  return {items,byId,main,len,mainLen};
}
export function findClip(seq,id){return seq.main.find(c=>c.id===id)||seq.conn.find(c=>c.id===id)||null;}
export function mainAt(seq,T,L=layout(seq)){let r=null;for(const it of L.main)if(T>=it.start-EPS&&T<it.end-EPS)r=it;return r;}

export function kfVal(c,p,t,base){const a=c.kf&&c.kf[p];if(!a||!a.length)return base;
  if(t<=a[0].t)return a[0].v;const z=a[a.length-1];if(t>=z.t)return z.v;
  for(let i=0;i<a.length-1;i++){const k0=a[i],k1=a[i+1];if(t>=k0.t&&t<=k1.t){const u=ease((t-k0.t)/Math.max(1e-6,k1.t-k0.t));return lerp(k0.v,k1.v,u);}}
  return base;}
export function setKf(c,p,t,v){const a=(c.kf[p]||=[]);const k=a.find(k=>Math.abs(k.t-t)<1/60);if(k)k.v=v;else{a.push({t,v});a.sort((x,y)=>x.t-y.t);}}
export function delKf(c,p,t){const a=c.kf[p];if(!a)return;const i=a.findIndex(k=>Math.abs(k.t-t)<1/60);if(i>=0)a.splice(i,1);if(!a.length)delete c.kf[p];}
export function hasKfAt(c,p,t){const a=c.kf[p];return !!(a&&a.find(k=>Math.abs(k.t-t)<1/60));}

export function splitClip(c,t){const D=dur(c);if(t<=1/100||t>=D-1/100)return null;
  const a=clone(c),b=clone(c);b.id=uid();
  if(isMediaKind(c.kind)){const p=srcAt(c,t),sm=speedAt(c,t);
    if(!c.rev){a.out=p;b.in=p;}else{a.in=p;b.out=p;} a.s1=sm;b.s0=sm;}
  else {a.out=c.in+t;b.in=c.in+t; if(c.kind!=='compound'){/* duration-based clips restart at 0 */const bd=c.out-(c.in+t);b.in=0;b.out=bd;a.in=0;a.out=t;}}
  a.fadeOut=0;b.fadeIn=0;b.trans=null;a.aOut=0;b.aIn=0;
  for(const p in c.kf){b.kf[p]=c.kf[p].map(k=>({t:k.t-t,v:k.v}));}
  if(c.kb){const u=ease(t/D);const m={x:lerp(c.kb.a.x,c.kb.b.x,u),y:lerp(c.kb.a.y,c.kb.b.y,u),s:lerp(c.kb.a.s,c.kb.b.s,u)};a.kb.b=m;b.kb.a={...m};}
  if(c.kind==='title'&&c.title){b.title.cont=true;}
  b.off=c.off+t;return [a,b];}

export function blade(seq,T,opts={}){const L=layout(seq);let targets;
  if(opts.id){const it=L.byId[opts.id];targets=it?[it]:[];}
  else if(opts.all) targets=L.items.filter(i=>T>i.start+0.01&&T<i.end-0.01);
  else {const m=L.main.filter(i=>T>i.start+0.01&&T<i.end-0.01);targets=m.length===1?m:[];}
  let n=0;
  for(const it of targets){const t=T-it.start;const r=splitClip(it.c,t);if(!r)continue;n++;
    if(it.lane===0){const i=seq.main.indexOf(it.c);seq.main.splice(i,1,r[0],r[1]);
      for(const k of seq.conn)if(k.anchor===it.c.id&&k.off>=t-EPS){k.anchor=r[1].id;k.off-=t;}}
    else {const i=seq.conn.indexOf(it.c);seq.conn.splice(i,1,r[0],r[1]);}}
  return n;}

export function freeLane(seq,s,e,dir,exclude){const L=layout(seq);
  for(let l=dir;Math.abs(l)<40;l+=dir){if(!L.items.some(i=>i.lane===l&&i.c.id!==exclude&&i.start<e-EPS&&i.end>s+EPS))return l;}return dir;}
export function reanchor(seq,c,abs){const L=layout(seq);let a=null;
  for(const it of L.main){if(it.c.id===c.id)continue;if(it.start<=abs+EPS)a=it;}
  if(!a)a=L.main.find(i=>i.c.id!==c.id);
  if(!a){c.anchor=null;c.off=abs;return;} c.anchor=a.c.id;c.off=abs-a.start;}
export function connectClip(seq,c,T,dir=1,lane){
  if(!seq.main.length){c.lane=0;c.anchor=null;c.off=0;seq.main.push(c);return;}
  c.lane=lane||freeLane(seq,T,T+dur(c),dir);seq.conn.push(c);reanchor(seq,c,T);}
export function insertMain(seq,c,T){let L=layout(seq);const it=mainAt(seq,T,L);
  if(it&&T>it.start+0.05&&T<it.end-0.05){blade(seq,T,{id:it.c.id});L=layout(seq);}
  let idx=L.main.filter(i=>i.end<=T+0.05).length;seq.main.splice(idx,0,c);c.lane=0;c.anchor=null;c.off=0;}
export function appendMain(seq,c){c.lane=0;c.anchor=null;c.off=0;seq.main.push(c);}
export function removeClips(seq,ids,ripple=true){let removed=0;
  for(const id of ids){const i=seq.main.findIndex(c=>c.id===id);
    if(i>=0){const c=seq.main[i];
      if(ripple){seq.main.splice(i,1);const kids=seq.conn.filter(k=>k.anchor===id);seq.conn=seq.conn.filter(k=>k.anchor!==id);removed+=kids.length;
        if(seq.main[i]&&i===0)seq.main[0].trans=null;}
      else {const g=newClip('gap',{in:0,out:dur(c)});g.trans=c.trans;seq.main.splice(i,1,g);for(const k of seq.conn)if(k.anchor===id)k.anchor=g.id;}
      continue;}
    const j=seq.conn.findIndex(c=>c.id===id);if(j>=0)seq.conn.splice(j,1);}
  if(seq.main[0])seq.main[0].trans=null;return removed;}

function ratio(c){return isMediaKind(c.kind)?(c.s0+c.s1)/2:1;}
export function trimClip(seq,c,edge,dt,maxLen){const md=c.media&&isMediaKind(c.kind)?env.mediaDur(c.media):Infinity;
  const before=dur(c);const r=ratio(c);const min=1/30;
  if(isMediaKind(c.kind)){
    if(edge==='r'){if(!c.rev)c.out=clamp(c.out+dt*r,c.in+min*r,md);else c.in=clamp(c.in-dt*r,0,c.out-min*r);}
    else {if(!c.rev)c.in=clamp(c.in+dt*r,0,c.out-min*r);else c.out=clamp(c.out-dt*r,c.in+min*r,md);}
  } else if(c.kind==='compound'){const len=layout(c.seq).len;c.trimmed=true;
    if(edge==='r')c.out=clamp(c.out+dt,c.in+min,len);else c.in=clamp(c.in+dt,0,c.out-min);}
  else {if(edge==='r')c.out=Math.max(c.in+min,c.out+dt);else c.out=Math.max(c.in+min,c.out-dt);}
  const after=dur(c);
  if(edge==='l'&&c.lane!==0&&seq.conn.includes(c))c.off+=before-after;
  return after-before;}
export function rollEdit(seq,a,b,dt){
  // move the edit point between a and b: a gets longer, b shorter (or vice versa)
  const ca=clone(a),cb=clone(b);const da=trimClip(seq,a,'r',dt);const db=trimClip(seq,b,'l',da);
  if(Math.abs(da+db)>1e-3){Object.assign(a,ca);Object.assign(b,cb);return 0;}return da;}
export function slipClip(c,dt){if(!isMediaKind(c.kind))return;const md=env.mediaDur(c.media);const r=ratio(c);
  let d=-dt*r;d=clamp(d,-c.in,md-c.out);c.in+=d;c.out+=d;}
export function moveMain(seq,id,toIdx){const i=seq.main.findIndex(c=>c.id===id);if(i<0)return;const [c]=seq.main.splice(i,1);
  if(toIdx>i)toIdx--;seq.main.splice(clamp(toIdx,0,seq.main.length),0,c);if(seq.main[0])seq.main[0].trans=null;}
export function toConnected(seq,id,T,lane){const L=layout(seq);const i=seq.main.findIndex(c=>c.id===id);if(i<0)return;
  const c=seq.main[i];const kids=seq.conn.filter(k=>k.anchor===id).map(k=>({k,abs:L.byId[k.id].start}));
  seq.main.splice(i,1);if(seq.main[0])seq.main[0].trans=null;c.trans=null;
  for(const {k,abs} of kids)reanchor(seq,k,abs);
  c.lane=lane;seq.conn.push(c);reanchor(seq,c,T);}
export function toMain(seq,id,T){const j=seq.conn.findIndex(c=>c.id===id);if(j<0)return;const [c]=seq.conn.splice(j,1);c.trans=null;insertMain(seq,c,T);}
export function setTransition(seq,id,type,d){const c=seq.main.find(c=>c.id===id);if(!c||seq.main.indexOf(c)===0)return false;
  c.trans=type?{type,dur:d}:null;return true;}
export function detachAudio(seq,c){if(c.kind!=='video')return null;const L=layout(seq);const it=L.byId[c.id];
  const a=newClip('audio',{media:c.media,in:c.in,out:c.out,s0:c.s0,s1:c.s1,rev:c.rev,vol:c.vol,fadeIn:c.fadeIn,fadeOut:c.fadeOut,aIn:c.aIn,aOut:c.aOut,name:(c.name||'')+' audio',kf:c.kf.vol?{vol:clone(c.kf.vol)}:{}});
  a.lane=freeLane(seq,it.start,it.end,-1);seq.conn.push(a);reanchor(seq,a,it.start);c.mute=true;return a;}
export function makeCompound(seq,ids){const idx=ids.map(id=>seq.main.findIndex(c=>c.id===id)).filter(i=>i>=0).sort((a,b)=>a-b);
  if(!idx.length)return null;for(let k=1;k<idx.length;k++)if(idx[k]!==idx[k-1]+1)return null;
  const L=layout(seq);const first=L.main[idx[0]];
  const inner=seq.main.slice(idx[0],idx[idx.length-1]+1);const innerIds=new Set(inner.map(c=>c.id));
  const kids=seq.conn.filter(k=>innerIds.has(k.anchor));seq.conn=seq.conn.filter(k=>!innerIds.has(k.anchor));
  const sub={main:inner,conn:kids};const outerTrans=inner[0].trans;inner[0].trans=null;
  const cc=newClip('compound',{seq:sub,in:0,out:layout(sub).len,name:'Compound Clip',trans:outerTrans});
  seq.main.splice(idx[0],inner.length,cc);return cc;}
export function breakApart(seq,id){const i=seq.main.findIndex(c=>c.id===id);if(i<0)return false;const c=seq.main[i];if(c.kind!=='compound')return false;
  const inner=c.seq.main;if(!inner.length){seq.main.splice(i,1);return true;}
  inner[0].trans=c.trans;seq.main.splice(i,1,...inner);seq.conn.push(...c.seq.conn);
  for(const k of seq.conn)if(k.anchor===id){k.anchor=inner[0].id;}return true;}
export function freezeFrame(seq,T,len=2){const L=layout(seq);const it=mainAt(seq,T,L);if(!it||it.c.kind!=='video')return null;
  const t=T-it.start;const ft=srcAt(it.c,t);
  const f=newClip('freeze',{media:it.c.media,ft,in:0,out:len,name:'Freeze Frame',fx:clone(it.c.fx),tf:clone(it.c.tf)});
  if(t>0.02&&t<it.end-it.start-0.02)blade(seq,T,{id:it.c.id});
  const L2=layout(seq);const idx=L2.main.filter(i=>i.end<=T+0.02).length;seq.main.splice(idx,0,f);return f;}
export function fixCompounds(seq){for(const c of [...seq.main,...seq.conn])if(c.kind==='compound'&&c.seq){fixCompounds(c.seq);const len=layout(c.seq).len;
  if(!c.trimmed)c.out=len;else c.out=Math.min(c.out,len);if(c.in>=c.out)c.in=0;}}
export function allClips(seq,out=[]){for(const c of [...seq.main,...seq.conn]){out.push(c);if(c.seq)allClips(c.seq,out);}return out;}
