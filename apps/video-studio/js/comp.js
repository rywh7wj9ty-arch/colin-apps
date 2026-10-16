// Composition: which layers are visible at time T, and their render parameters
import {layout,srcAt,kfVal,clamp,lerp,ease,isVisual} from './model.js';
export function collect(seq,T){const L=layout(seq);const out=[];const main=L.main;
  for(let k=0;k<main.length;k++){const it=main[k];if(T<it.start-1e-6||T>=it.end-1e-6||it.c.disabled)continue;
    let tr=null;if(it.tr>0&&T<it.start+it.tr)tr={role:'in',p:(T-it.start)/it.tr,type:it.c.trans.type};
    const nx=main[k+1];if(nx&&nx.tr>0&&T>=nx.start)tr={role:'out',p:(T-nx.start)/nx.tr,type:nx.c.trans.type};
    out.push(mk(it,T,tr,0));}
  const conn=L.items.filter(i=>i.conn&&T>=i.start-1e-6&&T<i.end-1e-6&&!i.c.disabled&&isVisual(i.c));
  for(const it of conn)out.push(mk(it,T,null,it.lane));
  out.sort((a,b)=>a.lane-b.lane);return out;}
function mk(it,T,tr,lane){const c=it.c,lt=T-it.start;const Ly={c,lt,d:it.end-it.start,tr,lane};
  if(c.kind==='video'||c.kind==='freeze')Ly.srcT=srcAt(c,lt);
  if(c.kind==='compound')Ly.sub=collect(c.seq,c.in+lt);return Ly;}
export function stabAt(st,t){const i=(t-st.t0)*st.rate;const i0=Math.max(0,Math.min(st.dx.length-1,Math.floor(i)));const i1=Math.min(st.dx.length-1,i0+1);const u=clamp(i-i0);
  return [lerp(st.dx[i0],st.dx[i1],u)*st.amt,lerp(st.dy[i0],st.dy[i1],u)*st.amt];}
const wrgb=(w,k)=>{const a=Math.hypot(w.x,w.y),h=Math.atan2(w.y,w.x);return [a*Math.cos(h)*k,a*Math.cos(h-2.0944)*k,a*Math.cos(h+2.0944)*k];};
export function hex2rgb(h){h=(h||'#000').replace('#','');if(h.length===3)h=[...h].map(x=>x+x).join('');const n=parseInt(h,16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
export function fxUniforms(fx){const add=(a,v)=>a.map(x=>x+v);
  return {exp:fx.exp,con:fx.con,hl:fx.hl,sh:fx.sh,sat:fx.sat,vib:fx.vib,temp:fx.temp,tint:fx.tint,vig:fx.vig,
    lift:add(wrgb(fx.wl,.12),fx.wl.l*.12),gam:add(wrgb(fx.wm,.35),fx.wm.l*.4),gain:add(wrgb(fx.wh,.3),fx.wh.l*.4),offs:add(wrgb(fx.wo,.08),fx.wo.l*.1),
    ckC:fx.ck?hex2rgb(fx.ck.color):[0,1,0],ckP:fx.ck&&fx.ck.on?[1,fx.ck.tol,fx.ck.soft,fx.ck.spill]:[0,0,0,0]};}
export const TRANSITIONS={dissolve:'Cross Dissolve',black:'Fade to Black',white:'Fade to White',wipe:'Wipe',slide:'Slide',push:'Push',zoom:'Zoom',iris:'Circle',up:'Slide Up',flash:'Flash'};
export function layerParams(Ly,W,H,sw,sh){const c=Ly.c,t=Ly.lt,tf=c.tf;
  let x=kfVal(c,'x',t,tf.x),y=kfVal(c,'y',t,tf.y),s=kfVal(c,'s',t,tf.s),r=kfVal(c,'r',t,tf.r),o=kfVal(c,'o',t,tf.o);let fit=tf.fit;
  if(c.kb){const u=ease(clamp(t/Math.max(.01,Ly.d)));s*=lerp(c.kb.a.s,c.kb.b.s,u);x+=lerp(c.kb.a.x,c.kb.b.x,u);y+=lerp(c.kb.a.y,c.kb.b.y,u);fit='fill';}
  if(c.stab&&c.stab.dx&&Ly.srcT!=null){const d=stabAt(c.stab,Ly.srcT);x+=d[0]*s;y+=d[1]*s;s*=c.stab.zoom;}
  let fadeTo=[0,0,0,0],maskT=0,maskP=0;
  if(Ly.tr){const p=clamp(Ly.tr.p),e=ease(p),inn=Ly.tr.role==='in';
    switch(Ly.tr.type){
      case 'dissolve':if(inn)o*=p;break;
      case 'black':case 'white':{const col=Ly.tr.type==='black'?[0,0,0]:[1,1,1];if(inn){if(p<.5)o=0;else fadeTo=[...col,1-(p-.5)*2];}else{fadeTo=[...col,Math.min(1,p*2)];}break;}
      case 'flash':{if(inn){o*=p>.5?1:0;fadeTo=[1,1,1,Math.max(0,1-Math.abs(p-.5)*2.5)];}else{fadeTo=[1,1,1,Math.max(0,1-Math.abs(p-.5)*2.5)];}break;}
      case 'wipe':if(inn){maskT=1;maskP=p;}break;
      case 'iris':if(inn){maskT=3;maskP=e;}break;
      case 'slide':if(inn)x+=(1-e);break;
      case 'up':if(inn)y+=(1-e);break;
      case 'push':if(inn)x+=(1-e);else x-=e;break;
      case 'zoom':if(inn){s*=.5+.5*e;o*=p;}else s*=1+.4*e;break;}}
  const sc=fit==='fill'?Math.max(W/sw,H/sh):Math.min(W/sw,H/sh);const w=sw*sc*s,h=sh*sc*s;const cx=W/2+x*W,cy=H/2+y*H;
  const rr=r*Math.PI/180,co=Math.cos(rr),si=Math.sin(rr);
  const M=[co*w*2/W,-(si*w*2/H),0,-si*h*2/W,-(co*h*2/H),0,cx*2/W-1,1-cy*2/H,1];
  return {M,crop:tf.crop,op:clamp(o),fadeTo,maskT,maskP};}
// Draw a layer list with a source resolver. getSrc(Ly) -> {el,w,h,key,static,raw} or null
export function drawLayers(R,layers,getSrc,lutGet){const W=R.W,H=R.H;
  for(const Ly of layers){let tex,sw=W,sh=H,raw=false;
    if(Ly.c.kind==='compound'){R.pushFB();drawLayers(R,Ly.sub,getSrc,lutGet);tex=R.popFB();}
    else{const s=getSrc(Ly);if(!s)continue;tex=R.texFor(s.key,s.el,s.static);if(!tex)continue;sw=s.w;sh=s.h;raw=s.raw;}
    const p=layerParams(Ly,W,H,sw,sh);if(p.op<=0.001)continue;
    p.fx=fxUniforms(Ly.c.fx);p.raw=raw&&!Ly.c.fx.ck;const ln=Ly.c.fx.lut;p.lut=ln?R.lut(ln,lutGet):null;p.lutA=Ly.c.fx.lutAmt??1;
    if(Ly.c.kind==='compound'){p.crop=[0,0,0,0];p.M[3]*=-1;p.M[4]*=-1;}
    R.draw(tex,p);}}
