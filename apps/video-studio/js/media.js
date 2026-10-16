// Media library: import, probing, thumbnails, waveforms, decoders and element pools
import {uid,env} from './model.js';
import {db} from './db.js';
import {S} from './state.js';
let hidden=null;
function holder(){if(!hidden){hidden=document.createElement('div');hidden.style.cssText='position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';document.body.appendChild(hidden);}return hidden;}
export function kindOf(f){const t=f.type||'';const n=(f.name||'').toLowerCase();
  if(t.startsWith('video')||/\.(mov|mp4|m4v|webm|mkv|3gp)$/.test(n))return 'video';
  if(t.startsWith('audio')||/\.(mp3|m4a|wav|aac|ogg|flac|caf|aiff?)$/.test(n))return 'audio';
  if(t.startsWith('image')||/\.(jpe?g|png|gif|webp|heic|heif|avif)$/.test(n))return 'image';return null;}
export function probeVideo(url){return new Promise((res,rej)=>{const v=document.createElement('video');v.muted=true;v.playsInline=true;v.setAttribute('playsinline','');v.preload='auto';
  const to=setTimeout(()=>rej(new Error('timeout')),20000);
  v.onloadeddata=()=>{clearTimeout(to);res(v);};v.onerror=()=>{clearTimeout(to);rej(new Error('This video format is not supported by this browser'));};v.src=url;holder().appendChild(v);v.load();});}
function waitSeek(v,t){return new Promise(r=>{let done=false;const f=()=>{if(done)return;done=true;v.removeEventListener('seeked',f);r();};v.addEventListener('seeked',f);setTimeout(f,1500);v.currentTime=t;});}
export async function videoThumbs(v,n){const d=v.duration;const out=[];const cv=document.createElement('canvas');const w=160,h=Math.round(160*v.videoHeight/Math.max(1,v.videoWidth))||90;cv.width=w;cv.height=h;const c=cv.getContext('2d');
  for(let i=0;i<n;i++){await waitSeek(v,Math.min(d-0.05,(i+0.5)*d/n));c.drawImage(v,0,0,w,h);out.push(cv.toDataURL('image/jpeg',0.6));}return out;}
export function loadImage(url){return new Promise((res,rej)=>{const i=new Image();i.decoding='async';i.onload=()=>res(i);i.onerror=()=>rej(new Error('This image format is not supported by this browser'));i.src=url;});}
let dctx=null;
function decodeCtx(){return dctx||=new OfflineAudioContext(2,48000,48000);}
const bufs=new Map(),rbufs=new Map(),decoding=new Map();
export async function decodeAudio(id){if(bufs.has(id))return bufs.get(id);if(decoding.has(id))return decoding.get(id);
  const p=(async()=>{const m=S.media.get(id);if(!m)return null;try{const ab=await m.blob.arrayBuffer();const b=await decodeCtx().decodeAudioData(ab);bufs.set(id,b);return b;}catch(e){bufs.set(id,null);return null;}})();
  decoding.set(id,p);const r=await p;decoding.delete(id);return r;}
export function audioBuf(id,rev){const b=bufs.get(id);if(!b)return null;if(!rev)return b;let r=rbufs.get(id);if(r)return r;
  r=new AudioBuffer({length:b.length,numberOfChannels:b.numberOfChannels,sampleRate:b.sampleRate});
  for(let ch=0;ch<b.numberOfChannels;ch++){const s=b.getChannelData(ch),d=r.getChannelData(ch);for(let i=0,n=s.length;i<n;i++)d[i]=s[n-1-i];}rbufs.set(id,r);return r;}
export function peaksOf(b,perSec=50){const ch=b.getChannelData(0);const step=Math.max(1,Math.floor(b.sampleRate/perSec));const n=Math.ceil(ch.length/step);const out=new Array(n);
  for(let i=0;i<n;i++){let m=0;const e=Math.min(ch.length,(i+1)*step);for(let j=i*step;j<e;j+=4){const v=Math.abs(ch[j]);if(v>m)m=v;}out[i]=Math.round(Math.min(1,m)*100)/100;}return out;}
export async function importFile(f,onStep){const kind=kindOf(f);if(!kind)throw new Error(`${f.name}: unsupported file type`);
  const id=uid();const url=URL.createObjectURL(f);const m={id,name:f.name.replace(/\.[^.]+$/,''),kind,size:f.size,dur:4,w:0,h:0,hasAudio:false,thumbs:[],peaks:null,added:Date.now()};
  try{
    if(kind==='video'){const v=await probeVideo(url);m.dur=v.duration;m.w=v.videoWidth;m.h=v.videoHeight;if(!isFinite(m.dur))throw new Error('Could not read video duration');
      onStep&&onStep('thumbnails');m.thumbs=await videoThumbs(v,Math.max(4,Math.min(16,Math.ceil(m.dur/2))));v.removeAttribute('src');v.load();v.remove();}
    else if(kind==='image'){const i=await loadImage(url);m.w=i.naturalWidth;m.h=i.naturalHeight;const cv=document.createElement('canvas');cv.width=160;cv.height=Math.round(160*m.h/m.w);cv.getContext('2d').drawImage(i,0,0,cv.width,cv.height);m.thumbs=[cv.toDataURL('image/jpeg',.7)];}
    S.media.set(id,{...m,blob:f,url});
    if(kind!=='image'){onStep&&onStep('audio');const b=await decodeAudio(id);if(b){m.hasAudio=true;m.peaks=peaksOf(b);if(kind==='audio')m.dur=b.duration;}else if(kind==='audio')throw new Error('Could not decode this audio file');}
  }catch(e){URL.revokeObjectURL(url);S.media.delete(id);throw new Error(`${f.name}: ${e.message}`);}
  S.media.set(id,{...m,blob:f,url});
  try{await db.put('media',{...m,blob:f});}catch(e){try{await db.put('media',{...m,buf:await f.arrayBuffer(),type:f.type});}catch(e2){S.media.get(id).unsaved=true;console.warn('media not persisted',e2);}}
  return S.media.get(id);}
export async function loadMedia(ids){for(const id of ids){if(S.media.has(id))continue;const r=await db.get('media',id);if(!r)continue;
  if(!r.blob&&r.buf)r.blob=new Blob([r.buf],{type:r.type||''});delete r.buf;S.media.set(id,{...r,url:URL.createObjectURL(r.blob)});}}
export function warmAudio(ids){(async()=>{for(const id of ids){const m=S.media.get(id);if(m&&m.hasAudio)await decodeAudio(id);}})();}
env.mediaDur=id=>{const m=S.media.get(id);return m?m.dur:1e9;};
env.hasAudio=id=>{const m=S.media.get(id);return !!(m&&m.hasAudio);};
const imgs=new Map();
export function getImage(id){let e=imgs.get(id);if(e)return e.ok?e.img:null;const m=S.media.get(id);if(!m)return null;
  e={img:new Image(),ok:false};e.img.onload=()=>{e.ok=true;S.dirty=true;};e.img.src=m.url;imgs.set(id,e);return null;}
export async function getImageAsync(id){const i=getImage(id);if(i)return i;const e=imgs.get(id);if(!e)return null;
  if(e.img.decode)try{await e.img.decode();e.ok=true;}catch(x){}return e.ok?e.img:null;}
export class VPool{constructor(cap=8){this.m=new Map();this.cap=cap;}
  get(key,mediaId){let e=this.m.get(key);if(e&&e.mediaId!==mediaId){this.drop(key);e=null;}
    if(!e){const m=S.media.get(mediaId);if(!m)return null;const v=document.createElement('video');v.muted=true;v.playsInline=true;v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');v.preload='auto';
      v.src=m.url;v.addEventListener('seeked',()=>{S.dirty=true;});v.addEventListener('loadeddata',()=>{S.dirty=true;});holder().appendChild(v);e={v,mediaId,key};this.m.set(key,e);this.evict();}
    e.last=performance.now();return e.v;}
  drop(key){const e=this.m.get(key);if(!e)return;e.v.pause();e.v.removeAttribute('src');try{e.v.load();}catch(x){}e.v.remove();this.m.delete(key);}
  evict(){while(this.m.size>this.cap){let o=null;for(const e of this.m.values())if(!o||e.last<o.last)o=e;this.drop(o.key);}}
  pauseExcept(keys){for(const e of this.m.values())if(!keys.has(e.key)&&!e.v.paused)e.v.pause();}
  clear(){for(const k of [...this.m.keys()])this.drop(k);}}
export function seekTo(v,t){return new Promise(res=>{const go=()=>{t=Math.max(0,Math.min(t,(v.duration||1e9)-0.02));
    if(Math.abs(v.currentTime-t)<0.002&&v.readyState>=2&&!v.seeking)return res();
    let done=false;const fin=()=>{if(done)return;done=true;v.removeEventListener('seeked',fin);clearTimeout(to);
      if(v.requestVideoFrameCallback&&v.readyState<2){v.requestVideoFrameCallback(()=>res());setTimeout(res,500);}else res();};
    v.addEventListener('seeked',fin);const to=setTimeout(fin,5000);v.currentTime=t;};
  if(v.readyState<1)v.addEventListener('loadedmetadata',go,{once:true});else go();});}
