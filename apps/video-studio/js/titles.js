// Animated title renderer (2D canvas → texture)
import {clamp,ease} from './model.js';
export const FONTS={
  sans:{name:'Sans',f:(s,w=700)=>`${w} ${s}px -apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif`},
  serif:{name:'Serif',f:(s,w=400)=>`${w} ${s}px "Didot", "Bodoni 72", Georgia, "Times New Roman", serif`},
  cond:{name:'Condensed',f:(s,w=800)=>`${w} ${s}px "Avenir Next Condensed", "DIN Condensed", "Arial Narrow", "Roboto Condensed", Impact, sans-serif`},
  heavy:{name:'Heavy',f:(s)=>`900 ${s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`},
  round:{name:'Rounded',f:(s)=>`700 ${s}px "Avenir Next", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif`},
  mono:{name:'Typewriter',f:(s)=>`500 ${s}px "American Typewriter", "Courier New", Menlo, monospace`},
  hand:{name:'Script',f:(s)=>`${s}px "Snell Roundhand", "Brush Script MT", "Segoe Script", cursive`},
};
export const STYLES={
  standard:{name:'Centre',font:'sans',color:'#ffffff',size:1},
  lower:{name:'Lower Third',font:'sans',color:'#ffffff',size:.6,accent:'#ffb000'},
  cinematic:{name:'Cinematic',font:'serif',color:'#f3efe6',size:.8},
  pop:{name:'Pop',font:'heavy',color:'#ffe14d',size:1.2,accent:'#ff3d7f'},
  typewriter:{name:'Typewriter',font:'mono',color:'#ffffff',size:.7},
  neon:{name:'Neon',font:'round',color:'#4df3ff',size:1,accent:'#ff4dd8'},
  trailer:{name:'Trailer',font:'cond',color:'#e9e4d8',size:1.15},
  credits:{name:'Scrolling Credits',font:'sans',color:'#ffffff',size:.55},
  caption:{name:'Caption',font:'sans',color:'#ffffff',size:.45},
  boxed:{name:'Boxed',font:'heavy',color:'#111111',size:.8,accent:'#ffffff'},
};
export function newTitle(style='standard',text='Title',sub=''){const s=STYLES[style]||STYLES.standard;
  return {text,sub,style,font:s.font,size:1,color:s.color,accent:s.accent||'#ffb000',bg:null,y:0};}
const backOut=u=>{const c=1.7;u-=1;return 1+u*u*((c+1)*u+c);};
function lines(ctx,text,maxW){const out=[];for(const para of String(text||'').split('\n')){const words=para.split(' ');let cur='';
  for(const w of words){const t=cur?cur+' '+w:w;if(ctx.measureText(t).width>maxW&&cur){out.push(cur);cur=w;}else cur=t;}out.push(cur);}return out;}
function spaced(ctx,str,x,y,sp,fill=true){const ws=[...str].map(ch=>ctx.measureText(ch).width);const tot=ws.reduce((a,b)=>a+b,0)+sp*(ws.length-1);
  let cx=x-tot/2;const al=ctx.textAlign;ctx.textAlign='left';[...str].forEach((ch,i)=>{fill?ctx.fillText(ch,cx,y):ctx.strokeText(ch,cx,y);cx+=ws[i]+sp;});ctx.textAlign=al;return tot;}
export function drawTitle(ctx,W,H,c,t,d){const T=c.title||{};const st=STYLES[T.style]||STYLES.standard;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);
  if(T.bg){ctx.fillStyle=T.bg;ctx.fillRect(0,0,W,H);}
  const B=Math.min(W,H)*0.085*(T.size||1)*(st.size||1);const F=FONTS[T.font]||FONTS.sans;
  const inA=clamp(t/0.6),outA=clamp((d-t)/0.6);const vis=Math.min(inA,outA);
  const cx=W/2,cy=H/2+(T.y||0)*H;ctx.textAlign='center';ctx.textBaseline='middle';
  const col=T.color||st.color,acc=T.accent||st.accent||'#ffb000';
  const shadow=(b=B*.08)=>{ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=b;ctx.shadowOffsetY=b*.25;};
  const noShadow=()=>{ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;};
  const style=T.style||'standard';
  if(style==='lower'){const y=H*.8+(T.y||0)*H;const x0=W*.07;const u=ease(inA),v=ease(outA);
    ctx.font=F.f(B);ctx.textAlign='left';const tw=Math.max(ctx.measureText(T.text||'').width,(()=>{ctx.font=F.f(B*.55,500);return ctx.measureText(T.sub||'').width})());
    ctx.globalAlpha=v;ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(x0-B*.4,y-B*.85,(tw+B*.9)*u,B*(T.sub?2.05:1.4));
    ctx.fillStyle=acc;ctx.fillRect(x0-B*.4,y-B*.85,B*.12,B*(T.sub?2.05:1.4)*u);
    ctx.save();ctx.beginPath();ctx.rect(x0-B*.3,0,(tw+B)*u,H);ctx.clip();
    ctx.fillStyle=col;ctx.font=F.f(B);ctx.fillText(T.text||'',x0+(1-u)*-B*2,y-B*.2);
    if(T.sub){ctx.font=F.f(B*.55,500);ctx.fillStyle=acc;ctx.fillText(T.sub,x0+(1-u)*-B*3,y+B*.65);}ctx.restore();ctx.globalAlpha=1;return;}
  if(style==='credits'){ctx.font=F.f(B,600);const ls=lines(ctx,(T.text||'')+(T.sub?'\n\n'+T.sub:''),W*.85);const lh=B*1.5;const total=ls.length*lh;
    const y0=H+B-(H+total+B*2)*clamp(t/Math.max(.1,d));ctx.fillStyle=col;shadow();
    ls.forEach((l,i)=>{ctx.font=i===0?F.f(B*1.2,800):F.f(B,500);ctx.fillText(l,cx,y0+i*lh);});noShadow();return;}
  if(style==='caption'){ctx.font=F.f(B,600);const ls=lines(ctx,T.text||'',W*.86);const lh=B*1.25;const y=H*.86+(T.y||0)*H-(ls.length-1)*lh;
    ctx.globalAlpha=Math.min(clamp(t/.12),clamp((d-t)/.12));
    ls.forEach((l,i)=>{const w=ctx.measureText(l).width;ctx.fillStyle='rgba(0,0,0,.62)';const yy=y+i*lh;
      if(ctx.roundRect){ctx.beginPath();ctx.roundRect(cx-w/2-B*.35,yy-lh/2,w+B*.7,lh,B*.2);ctx.fill();}else ctx.fillRect(cx-w/2-B*.35,yy-lh/2,w+B*.7,lh);
      ctx.fillStyle=col;ctx.fillText(l,cx,yy+B*.04);});ctx.globalAlpha=1;return;}
  let alpha=vis,scale=1,dy=0;
  if(style==='standard'){alpha=ease(vis);dy=(1-ease(inA))*B*.5;}
  if(style==='cinematic'){alpha=ease(Math.min(clamp(t/1.2),clamp((d-t)/1)));scale=1+.06*(t/Math.max(d,.1));}
  if(style==='pop'){scale=inA<1?backOut(inA):1;scale*=outA<1?ease(outA):1;alpha=1;}
  if(style==='trailer'){scale=1.18-.18*ease(clamp(t/(d*.9)));alpha=Math.min(ease(clamp(t/.35)),ease(clamp((d-t)/.35)));}
  if(style==='neon'){const fl=t<.7?((Math.sin(t*90)>0.2)?1:.25):1;alpha=Math.min(fl,ease(outA));}
  if(style==='boxed'){dy=(1-ease(inA))*B*1.2+(1-ease(outA))*-B*1.2;alpha=Math.min(clamp(inA*2),clamp(outA*2));}
  if(style==='typewriter')alpha=ease(outA);
  ctx.globalAlpha=clamp(alpha);ctx.translate(cx,cy+dy);ctx.scale(scale,scale);
  let text=T.text||'';if(style==='trailer'||style==='cinematic')text=text.toUpperCase();
  if(style==='typewriter'){const n=Math.floor(t*16);text=text.slice(0,n);}
  ctx.font=F.f(B);const ls=lines(ctx,text,W*.86/(style==='trailer'?1.2:1));const lh=B*1.18;const top=-(ls.length-1)*lh/2-(T.sub?B*.4:0);
  if(style==='boxed'){const w=Math.max(...ls.map(l=>ctx.measureText(l).width))+B*1.2;const hh=ls.length*lh+B*.5;ctx.fillStyle=acc;ctx.fillRect(-w/2,top-lh/2-B*.25,w,hh);}
  if(style==='neon'){ctx.shadowColor=col;ctx.shadowBlur=B*.5;}else if(style!=='boxed')shadow();
  ctx.fillStyle=col;
  if(style==='pop'){ctx.lineJoin='round';ctx.lineWidth=B*.16;ctx.strokeStyle=acc;ls.forEach((l,i)=>ctx.strokeText(l,0,top+i*lh));}
  ls.forEach((l,i)=>{const y=top+i*lh;
    if(style==='trailer'){const g=ctx.createLinearGradient(0,y-B/2,0,y+B/2);g.addColorStop(0,'#fff');g.addColorStop(.5,col);g.addColorStop(1,'#8d8673');ctx.fillStyle=g;spaced(ctx,l,0,y,B*.08);}
    else if(style==='cinematic')spaced(ctx,l,0,y,B*.35);
    else ctx.fillText(l,0,y);});
  if(style==='typewriter'&&Math.floor(t*2)%2===0){const l=ls[ls.length-1]||'';const w=ctx.measureText(l).width;ctx.fillRect(w/2+B*.08,top+(ls.length-1)*lh-B*.45,B*.08,B*.9);}
  if(style==='neon'){ctx.shadowColor=acc;ctx.shadowBlur=B*.9;ctx.globalAlpha*=.5;ls.forEach((l,i)=>ctx.fillText(l,0,top+i*lh));ctx.globalAlpha=clamp(alpha);}
  if(T.sub){noShadow();if(style!=='boxed')shadow(B*.05);ctx.font=F.f(B*.48,500);ctx.fillStyle=style==='boxed'?acc:(style==='pop'?'#fff':col);
    const y=top+(ls.length-1)*lh+B*1.05;if(style==='cinematic'||style==='trailer')spaced(ctx,T.sub.toUpperCase(),0,y,B*.2);else ctx.fillText(T.sub,0,y);}
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;noShadow();}
