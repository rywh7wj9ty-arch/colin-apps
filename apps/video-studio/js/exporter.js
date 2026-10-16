// Export: WebCodecs H.264 + AAC into MP4 (mp4-muxer); MediaRecorder fallback
import {Muxer,ArrayBufferTarget} from '../vendor/mp4-muxer.mjs';
import {layout,frameSize} from './model.js';
import {Renderer} from './gl.js';
import {collect,drawLayers} from './comp.js';
import {scheduleMix,seqHasAudio} from './audio.js';
import {VPool,decodeAudio,audioBuf} from './media.js';
import {Sources} from './frame.js';
import {getLut} from './luts.js';
import {allClips} from './model.js';
import {wav} from './extras.js';
async function muxAacFFmpeg(videoBuf,abuf,onProgress){onProgress(.96,'Loading audio encoder (ffmpeg.wasm, first time ~31 MB)…');const {FFmpeg}=await import('../vendor/ffmpeg/index.js');const ff=new FFmpeg();
  const base=new URL('../vendor/ffmpeg-core/',import.meta.url).href;await ff.load({coreURL:base+'ffmpeg-core.js',wasmURL:base+'ffmpeg-core.wasm'});
  onProgress(.98,'Encoding AAC audio…');await ff.writeFile('v.mp4',new Uint8Array(videoBuf));await ff.writeFile('a.wav',new Uint8Array(wav(abuf)));
  const rc=await ff.exec(['-i','v.mp4','-i','a.wav','-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart','out.mp4']);if(rc!==0)throw new Error('ffmpeg mux failed');
  const out=await ff.readFile('out.mp4');ff.terminate();return out;}
const AVC={720:['avc1.64001f','avc1.4d401f','avc1.42001f'],1080:['avc1.640028','avc1.4d4028','avc1.42e028','avc1.640032'],2160:['avc1.640033','avc1.640034','avc1.4d4033']};
export async function pickCodec(W,H,fps,short){const list=[...(AVC[short]||AVC[1080])];if(fps>30)list.unshift(short>=2160?'avc1.640034':short>=1080?'avc1.64002a':'avc1.640020');
  if(!('VideoEncoder' in window))return null;
  for(const codec of list){for(const hw of ['no-preference','prefer-software']){const cfg={codec,width:W,height:H,bitrate:bitrate(W,H,fps),framerate:fps,avc:{format:'avc'},hardwareAcceleration:hw};
    try{const r=await VideoEncoder.isConfigSupported(cfg);if(r.supported)return cfg;}catch(e){}}}return null;}
function bitrate(W,H,fps,q=1){return Math.round(W*H*fps*0.16*q);}
export async function aacSupported(){if(!('AudioEncoder' in window))return false;try{const r=await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:192000});return !!r.supported;}catch(e){return false;}}
async function renderAudio(seq,t0,t1){const len=Math.max(.1,t1-t0);const ctx=new OfflineAudioContext(2,Math.ceil(len*48000),48000);
  for(const c of allClips(seq))if(c.media)await decodeAudio(c.media);
  scheduleMix(ctx,ctx.destination,seq,t0,t1,0,(id,rev)=>audioBuf(id,rev));return await ctx.startRendering();}
export async function exportMovie(proj,seq,{short=1080,fps=30,quality=1,range=null,onProgress=()=>{},signal={}}){
  const [W,H]=frameSize(proj.aspect,short);const L=layout(seq);const t0=range?range[0]:0,t1=range?range[1]:L.len;if(t1-t0<0.05)throw new Error('Nothing to export: the timeline is empty');
  const N=Math.max(1,Math.round((t1-t0)*fps));
  const cfg=await pickCodec(W,H,fps,short);const hasAud=seqHasAudio(seq);const aac=hasAud?await aacSupported():true;
  if(!cfg)return exportRecorder(proj,seq,{W,H,fps,t0,t1,N,onProgress,signal});
  cfg.bitrate=bitrate(W,H,fps,quality);
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const R=new Renderer(cv);R.size(W,H);
  const pool=new VPool(10);const src=new Sources(pool,W,H);
  let abuf=null;if(hasAud){onProgress(0,'Mixing audio…');abuf=await renderAudio(seq,t0,t1);}
  const muxer=new Muxer({target:new ArrayBufferTarget(),video:{codec:'avc',width:W,height:H,frameRate:fps},
    audio:abuf&&aac?{codec:'aac',numberOfChannels:2,sampleRate:48000}:undefined,fastStart:'in-memory',firstTimestampBehavior:'offset'});
  let err=null;const venc=new VideoEncoder({output:(ch,meta)=>muxer.addVideoChunk(ch,meta),error:e=>err=e});venc.configure(cfg);
  const lutGet=n=>getLut(n,proj);const started=performance.now();
  try{
  for(let i=0;i<N;i++){if(signal.cancel)throw new Error('cancelled');if(err)throw err;
    const T=t0+(i+0.001)/fps;const layers=collect(seq,T);await src.prepare(layers);
    R.begin();drawLayers(R,layers,Ly=>src.get(Ly),lutGet);
    const fr=new VideoFrame(cv,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});venc.encode(fr,{keyFrame:i%(fps*2)===0});fr.close();
    while(venc.encodeQueueSize>6)await new Promise(r=>setTimeout(r,5));
    if(i%5===0){const el=(performance.now()-started)/1000;onProgress((i+1)/N*(abuf?.93:1),`Rendering frame ${i+1} of ${N}`,el/(i+1)*(N-i-1));await new Promise(r=>setTimeout(r,0));}}
  await venc.flush();
  if(abuf&&aac){onProgress(.95,'Encoding audio…');let aerr=null;const aenc=new AudioEncoder({output:(ch,meta)=>muxer.addAudioChunk(ch,meta),error:e=>aerr=e});
    aenc.configure({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:192000});const F=1024*4;const l=abuf.getChannelData(0),r=abuf.getChannelData(1);
    for(let s=0;s<abuf.length;s+=F){const n=Math.min(F,abuf.length-s);const d=new Float32Array(n*2);d.set(l.subarray(s,s+n),0);d.set(r.subarray(s,s+n),n);
      const ad=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(s/48000*1e6),data:d});aenc.encode(ad);ad.close();
      if(aenc.encodeQueueSize>20)await new Promise(r=>setTimeout(r,1));}
    await aenc.flush();if(aerr)throw aerr;}
  muxer.finalize();}finally{pool.clear();try{venc.close();}catch(e){}}
  if(abuf&&!aac){try{const out=await muxAacFFmpeg(muxer.target.buffer,abuf,onProgress);onProgress(1,'Done');return {blob:new Blob([out],{type:'video/mp4'}),W,H,fps,codec:cfg.codec,method:'WebCodecs H.264 + ffmpeg.wasm AAC'};}
    catch(e){console.warn('ffmpeg.wasm failed, using real-time fallback',e);return exportRecorder(proj,seq,{W,H,fps,t0,t1,N,onProgress,signal});}}
  onProgress(1,'Done');return {blob:new Blob([muxer.target.buffer],{type:'video/mp4'}),W,H,fps,codec:cfg.codec,method:'WebCodecs H.264'+(abuf?' + AAC':'')};}
// Fallback: real-time capture with MediaRecorder (Safari/Chrome produce MP4 where supported)
async function exportRecorder(proj,seq,{W,H,fps,t0,t1,N,onProgress,signal}){
  if(!window.MediaRecorder)throw new Error('This browser cannot encode video (no WebCodecs or MediaRecorder)');
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const R=new Renderer(cv);const pool=new VPool(10);const src=new Sources(pool,W,H);
  const stream=cv.captureStream(0);const track=stream.getVideoTracks()[0];
  const actx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});const dest=actx.createMediaStreamDestination();
  for(const c of allClips(seq))if(c.media)await decodeAudio(c.media);
  dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  const types=['video/mp4;codecs=avc1.640028,mp4a.40.2','video/mp4;codecs=avc1,mp4a','video/mp4','video/webm;codecs=vp9,opus','video/webm'];const mime=types.find(t=>MediaRecorder.isTypeSupported(t))||'';
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate(W,H,fps)});const parts=[];rec.ondataavailable=e=>e.data.size&&parts.push(e.data);
  const done=new Promise(r=>rec.onstop=r);await actx.resume();rec.start(1000);const at=actx.currentTime+0.15;
  scheduleMix(actx,dest,seq,t0,t1,at,(id,rev)=>audioBuf(id,rev));const lutGet=n=>getLut(n,proj);
  for(let i=0;i<N;i++){if(signal.cancel)break;const T=t0+i/fps;const layers=collect(seq,T);await src.prepare(layers);
    const wait=(at+(T-t0))-actx.currentTime;if(wait>0)await new Promise(r=>setTimeout(r,wait*1000));
    R.begin();drawLayers(R,layers,Ly=>src.get(Ly),lutGet);track.requestFrame&&track.requestFrame();
    if(i%5===0)onProgress(i/N,`Recording in real time ${i+1}/${N}`,(N-i)/fps);}
  rec.stop();await done;actx.close();pool.clear();if(signal.cancel)throw new Error('cancelled');
  return {blob:new Blob(parts,{type:mime.split(';')[0]||'video/webm'}),W,H,fps,codec:mime,method:'MediaRecorder (real-time fallback)'};}
