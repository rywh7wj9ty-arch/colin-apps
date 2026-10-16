// Resolves layer sources (video frames, stills, titles, colour mattes) for preview and export
import {S} from './state.js';
import {getImage,getImageAsync,seekTo} from './media.js';
import {drawTitle} from './titles.js';
import {hex2rgb} from './comp.js';
export class Sources{
  constructor(pool,W,H){this.pool=pool;this.W=W;this.H=H;this.tc=new Map();this.cc=new Map();}
  size(W,H){if(W!==this.W||H!==this.H){this.W=W;this.H=H;this.tc.clear();}}
  titleCanvas(id){let c=this.tc.get(id);if(!c){c=document.createElement('canvas');c.width=this.W;c.height=this.H;this.tc.set(id,c);}return c;}
  colorCanvas(col){let c=this.cc.get(col);if(!c){c=document.createElement('canvas');c.width=c.height=4;const x=c.getContext('2d');x.fillStyle=col;x.fillRect(0,0,4,4);this.cc.set(col,c);}return c;}
  vkey(Ly){return Ly.c.kind==='freeze'?'f'+Ly.c.id:'v'+Ly.c.id;}
  flat(layers,out=[]){for(const l of layers){if(l.sub)this.flat(l.sub,out);else out.push(l);}return out;}
  get(Ly){const c=Ly.c;
    if(c.kind==='video'||c.kind==='freeze'){const v=this.pool.get(this.vkey(Ly),c.media);if(!v||v.readyState<2||!v.videoWidth)return null;return {el:v,w:v.videoWidth,h:v.videoHeight,key:this.vkey(Ly)};}
    if(c.kind==='image'){const i=getImage(c.media);if(!i)return null;return {el:i,w:i.naturalWidth,h:i.naturalHeight,key:'i'+c.media,static:true};}
    if(c.kind==='title'){const cv=this.titleCanvas(c.id);drawTitle(cv.getContext('2d'),this.W,this.H,c,Ly.lt,Ly.d);return {el:cv,w:this.W,h:this.H,key:'t'+c.id,raw:true};}
    if(c.kind==='color'){return {el:this.colorCanvas(c.color),w:this.W,h:this.H,key:'c'+c.color,static:true,raw:false};}
    return null;}
  // preview: nudge video elements towards the wanted frame without blocking
  sync(layers,playing,rate){const keys=new Set();
    for(const Ly of this.flat(layers)){const c=Ly.c;if(c.kind!=='video'&&c.kind!=='freeze')continue;const k=this.vkey(Ly);keys.add(k);
      const v=this.pool.get(k,c.media);if(!v)continue;const want=Ly.srcT;
      const live=playing&&rate>0&&c.kind==='video'&&!c.rev;
      if(live){const sp=Math.max(.0625,Math.min(16,(c.s0+(c.s1-c.s0)*Math.min(1,Ly.lt/Ly.d))*rate));if(Math.abs(v.playbackRate-sp)>.01)v.playbackRate=sp;
        if(v.paused){v.currentTime=want;const p=v.play();if(p)p.catch(()=>{});}else if(Math.abs(v.currentTime-want)>0.3)v.currentTime=want;}
      else{if(!v.paused)v.pause();if(!v.seeking&&Math.abs(v.currentTime-want)>0.015&&v.readyState>=1)v.currentTime=Math.max(0,Math.min(want,(v.duration||1e9)-0.03));}}
    this.pool.pauseExcept(keys);return keys;}
  // export: wait until every needed frame is exactly ready
  async prepare(layers){for(const Ly of this.flat(layers)){const c=Ly.c;
      if(c.kind==='video'||c.kind==='freeze'){const v=this.pool.get(this.vkey(Ly),c.media);if(v){if(!v.paused)v.pause();await seekTo(v,Ly.srcT);}}
      else if(c.kind==='image')await getImageAsync(c.media);}}
}
