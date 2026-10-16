// Audio mixing: fades, transitions, keyframed volume, J/L cuts, speed ramps, ducking
import {layout,srcAt,speedAt,kfVal,clamp,env} from './model.js';
export function collectAudio(seq,base=0,win=[-1e9,1e9],gm=1,out=[]){const L=layout(seq);
  for(const it of L.items){const c=it.c;if(c.disabled)continue;const s=base+it.start,e=base+it.end;
    if(c.kind==='compound'){if(!c.mute)collectAudio(c.seq,s-c.in,[Math.max(win[0],s),Math.min(win[1],e)],gm*c.vol,out);continue;}
    const aud=c.kind==='audio'||(c.kind==='video'&&!c.mute&&env.hasAudio(c.media));if(!aud||c.mute)continue;
    out.push({c,s,e,as:s-(c.aIn||0),ae:e+(c.aOut||0),trIn:it.tr||0,trOut:it.trOut||0,win,g:gm});}
  return out;}
export function gainAt(ai,t,all){const c=ai.c;if(t<ai.win[0]||t>ai.win[1])return 0;
  let g=(c.kf&&c.kf.vol&&c.kf.vol.length?kfVal(c,'vol',t-ai.s,c.vol):c.vol)*ai.g;
  if(c.fadeIn>0)g*=clamp((t-ai.as)/c.fadeIn);if(c.fadeOut>0)g*=clamp((ai.ae-t)/c.fadeOut);
  if(ai.trIn>0&&!c.aIn)g*=clamp((t-ai.s)/ai.trIn);if(ai.trOut>0&&!c.aOut)g*=clamp((ai.e-t)/ai.trOut);
  if(!c.duck){let f=1;for(const d of all)if(d!==ai&&d.c.duck){const dist=t<d.as?d.as-t:t>d.ae?t-d.ae:0;const k=Math.min(1,dist/0.4);f=Math.min(f,d.c.duckLvl+(1-d.c.duckLvl)*k);}g*=f;}
  return Math.max(0,g);}
// schedule into ctx; `at` = context time that corresponds to timeline time fromT. rate = playback rate (1 normally)
export function scheduleMix(ctx,dest,seq,fromT,toT,at,getBuf){const all=collectAudio(seq);const nodes=[];
  for(const ai of all){let st=Math.max(fromT,ai.as,ai.win[0]);const en=Math.min(toT,ai.ae,ai.win[1]);if(en-st<0.01)continue;
    const c=ai.c;const buf=getBuf(c.media,c.rev);if(!buf)continue;
    const posAt=t=>{const lt=t-ai.s;if(lt<0)return c.rev?c.out+(-lt)*c.s0:c.in-(-lt)*c.s0;if(t>ai.e)return c.rev?c.in-(t-ai.e)*c.s1:c.out+(t-ai.e)*c.s1;return srcAt(c,lt);};
    let sp=posAt(st);let off=c.rev?buf.duration-sp:sp;
    if(off<0){st+=-off/Math.max(.05,c.s0);off=0;if(en-st<0.01)continue;}
    if(off>=buf.duration)continue;
    const src=ctx.createBufferSource();src.buffer=buf;const g=ctx.createGain();src.connect(g);g.connect(dest);
    const t0=at+(st-fromT);const lt0=st-ai.s;
    src.playbackRate.setValueAtTime(Math.max(.05,speedAt(c,clamp(lt0,0,ai.e-ai.s))),t0);
    if(c.s0!==c.s1&&st<ai.e)src.playbackRate.linearRampToValueAtTime(Math.max(.05,c.s1),at+(ai.e-fromT));
    let pv=gainAt(ai,st,all);g.gain.setValueAtTime(pv,t0);let pt=st,chg=false;
    for(let t=st+0.04;t<en+0.04;t+=0.04){const tt=Math.min(t,en);const v=gainAt(ai,tt,all);
      if(Math.abs(v-pv)>1e-4){if(!chg)g.gain.setValueAtTime(pv,at+(pt-fromT));g.gain.linearRampToValueAtTime(v,at+(tt-fromT));chg=true;}else chg=false;pv=v;pt=tt;}
    src.start(Math.max(ctx.currentTime,t0),off);src.stop(at+(en-fromT)+0.01);nodes.push(src);}
  return nodes;}
export function seqHasAudio(seq){return collectAudio(seq).length>0;}
