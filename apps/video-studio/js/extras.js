// iMovie-style extras: soundtrack generator, trailers, themes, Magic Movie; FCPX-style stabilisation and auto-captions
import {newClip,newSeq,layout,clone,clamp,frameSize,allClips} from './model.js';
import {newTitle} from './titles.js';
import {probeVideo,decodeAudio,audioBuf} from './media.js';
import {scheduleMix} from './audio.js';
import {S} from './state.js';
// ---------- generated soundtrack ----------
export const MOODS={
  Uplifting:{bpm:112,chords:[[60,64,67],[67,71,74],[69,72,76],[65,69,72]],drums:'four',arp:true,pad:.05},
  Epic:{bpm:84,chords:[[62,65,69],[58,62,65],[65,69,72],[60,64,67]],drums:'epic',arp:false,pad:.07},
  Chill:{bpm:84,chords:[[65,69,72,76],[64,67,71,74],[62,65,69,72],[60,64,67,71]],drums:'soft',arp:true,pad:.045},
  Retro:{bpm:118,chords:[[57,60,64],[53,57,60],[60,64,67],[55,59,62]],drums:'four',arp:true,pad:.035,sq:true},
  Romance:{bpm:70,chords:[[60,64,67],[57,60,64],[53,57,60],[55,59,62]],drums:null,arp:true,pad:.05},
  Action:{bpm:132,chords:[[52,55,59],[52,55,59],[48,52,55],[50,54,57]],drums:'drive',arp:true,pad:.04,sq:true},
};
const hz=m=>440*Math.pow(2,(m-69)/12);
export async function makeMusic(mood,seconds){const M=MOODS[mood]||MOODS.Uplifting;const sr=44100;seconds=Math.max(4,Math.min(600,seconds));
  const ctx=new OfflineAudioContext(2,Math.ceil(sr*seconds),sr);const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;
  const master=ctx.createGain();master.gain.setValueAtTime(0,0);master.gain.linearRampToValueAtTime(.9,1);master.gain.setValueAtTime(.9,seconds-2.5);master.gain.linearRampToValueAtTime(0,seconds);
  master.connect(comp);comp.connect(ctx.destination);
  const noise=ctx.createBuffer(1,sr,sr);const nd=noise.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1600;lp.Q.value=.5;lp.connect(master);
  const pan=(p)=>{const n=ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain();if(n.pan)n.pan.value=p;n.connect(master);return n;};
  const panL=pan(-.35),panR=pan(.35);
  const beat=60/M.bpm,bar=beat*4;
  const tone=(type,f,t,d,v,dest,att=.01)=>{const o=ctx.createOscillator();o.type=type;o.frequency.value=f;const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+att);g.gain.setTargetAtTime(0,t+d*.6,d*.25);o.connect(g);g.connect(dest);o.start(t);o.stop(t+d*1.6+.1);};
  const kick=(t,v=1)=>{const o=ctx.createOscillator();const g=ctx.createGain();o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(42,t+.18);g.gain.setValueAtTime(.9*v,t);g.gain.exponentialRampToValueAtTime(.001,t+.45);o.connect(g);g.connect(master);o.start(t);o.stop(t+.5);};
  const nz=(t,d,v,f,type='highpass')=>{const s=ctx.createBufferSource();s.buffer=noise;const fl=ctx.createBiquadFilter();fl.type=type;fl.frequency.value=f;const g=ctx.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);s.connect(fl);fl.connect(g);g.connect(master);s.start(t,Math.random()*.5);s.stop(t+d+.05);};
  for(let b=0,t=0;t<seconds;b++,t+=bar){const ch=M.chords[b%M.chords.length];
    for(const n of ch){tone(M.sq?'square':'sawtooth',hz(n),t,bar*.95,M.pad,lp,.25);tone('sawtooth',hz(n)*1.004,t,bar*.95,M.pad*.7,lp,.3);}
    const root=ch[0]-24;for(let k=0;k<(M.drums==='drive'?8:4);k++){const bt=t+k*bar/(M.drums==='drive'?8:4);tone('triangle',hz(root),bt,beat*.8,.32,master,.005);}
    if(M.arp){const steps=M.bpm>100?16:8;for(let k=0;k<steps;k++){const n=ch[k%ch.length]+12*((k>>2)%2);tone(M.sq?'square':'triangle',hz(n),t+k*bar/steps,bar/steps*.9,M.sq?.025:.05,k%2?panL:panR,.005);}}
    if(M.drums==='four'||M.drums==='drive'){for(let k=0;k<4;k++){kick(t+k*beat);if(k%2)nz(t+k*beat,.18,.35,1800,'bandpass');}for(let k=0;k<8;k++)nz(t+k*beat/2,.05,.12,7000);}
    if(M.drums==='soft'){kick(t,.6);kick(t+beat*2.5,.45);nz(t+beat,.15,.18,2200,'bandpass');nz(t+beat*3,.15,.18,2200,'bandpass');for(let k=0;k<8;k++)nz(t+k*beat/2,.04,.05,8000);}
    if(M.drums==='epic'){kick(t,1.2);kick(t+beat*2,1);kick(t+beat*3.5,.7);nz(t+beat*2,.6,.25,400,'lowpass');if(b%2)for(let k=0;k<4;k++)tone('sine',90-k*10,t+bar-beat+k*beat/4,.3,.5,master,.002);}}
  const buf=await ctx.startRendering();return new File([wav(buf)],`${mood} soundtrack.wav`,{type:'audio/wav'});}
export function wav(b){const ch=b.numberOfChannels,n=b.length,sr=b.sampleRate;const dv=new DataView(new ArrayBuffer(44+n*ch*2));const w=(o,s)=>[...s].forEach((c,i)=>dv.setUint8(o+i,c.charCodeAt(0)));
  w(0,'RIFF');dv.setUint32(4,36+n*ch*2,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,ch,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*ch*2,true);dv.setUint16(32,ch*2,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,n*ch*2,true);
  const data=[...Array(ch)].map((_,i)=>b.getChannelData(i));let o=44;for(let i=0;i<n;i++)for(let c=0;c<ch;c++){dv.setInt16(o,Math.max(-1,Math.min(1,data[c][i]))*32767,true);o+=2;}return dv.buffer;}
// ---------- themes ----------
export const THEMES={
  modern:{name:'Modern',style:'standard',font:'sans',trans:'dissolve',look:'',col:'#ffffff'},
  bright:{name:'Bright',style:'boxed',font:'heavy',trans:'push',look:'Vivid',col:'#111111',acc:'#ffd23f'},
  neon:{name:'Neon',style:'neon',font:'round',trans:'flash',look:'Cross Process',col:'#4df3ff',acc:'#ff4dd8'},
  playful:{name:'Playful',style:'pop',font:'heavy',trans:'zoom',look:'Golden Hour',col:'#ffe14d',acc:'#ff3d7f'},
  cinematic:{name:'Cinematic',style:'cinematic',font:'serif',trans:'black',look:'Teal & Orange',col:'#f3efe6'},
  news:{name:'News',style:'lower',font:'sans',trans:'wipe',look:'',col:'#ffffff',acc:'#e53935'},
  vintage:{name:'Vintage',style:'typewriter',font:'mono',trans:'dissolve',look:'Vintage',col:'#fff4dc'},
};
export function applyTheme(seq,proj,key,{look=true}={}){const th=THEMES[key];if(!th)return;proj.theme=key;
  seq.conn=seq.conn.filter(c=>!c.themeTag);
  seq.main.forEach((c,i)=>{if(i>0)c.trans={type:th.trans,dur:.8};if(look&&c.kind!=='title'&&c.kind!=='gap')c.fx.lut=th.look||'';});
  if(!seq.main.length)return;const L=layout(seq);
  const mk=(text,sub,T,d,style=th.style)=>{const t=newClip('title',{in:0,out:d,name:text,themeTag:true});t.title=newTitle(style,text,sub);t.title.font=th.font;t.title.color=th.col;if(th.acc)t.title.accent=th.acc;
    t.lane=99;seq.conn.push(t);const a=L.main.find(i=>i.start<=T+1e-6&&i.end>T)||L.main[0];t.anchor=a.c.id;t.off=T-a.start;return t;};
  const fix=t=>{let l=1;while(layout(seq).items.some(i=>i.lane===l&&i.c.id!==t.id&&i.start<layout(seq).byId[t.id].end&&i.end>layout(seq).byId[t.id].start))l++;t.lane=l;};
  const a=mk(proj.name||'My Movie',new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}),0.3,Math.min(4,L.len*.4));fix(a);
  if(L.len>8){const e=mk('The End','',Math.max(0,L.len-3.2),3);fix(e);}}
// ---------- trailers ----------
export const TRAILERS={
  epic:{name:'Epic',mood:'Epic',look:'Teal & Orange',trans:'black',slots:[['t','{studio} presents',2.6],['s',2.2],['s',1.8],['t','In a world',2],['s',1.5],['s',1.5],['t','one {who}',2],['s',1.1],['s',1.1],['s',1.1],['t','will change everything',2.2],['s',.8],['s',.8],['s',.8],['s',.8],['s',.8],['t','{name}',3.6,1.4],['t','{date}',2.2]]},
  adventure:{name:'Adventure',mood:'Uplifting',look:'Golden Hour',trans:'dissolve',slots:[['t','{studio}',2.2],['s',2.4],['t','Some journeys',1.8],['s',1.6],['s',1.6],['t','begin with a single step',2],['s',1.2],['s',1.2],['s',1.2],['t','{who}',2],['s',.9],['s',.9],['s',.9],['s',.9],['t','{name}',3.5,1.4],['t','Coming {date}',2.2]]},
  retro:{name:'Retro',mood:'Retro',look:'Cross Process',trans:'flash',slots:[['t','{studio} pictures',2.2],['s',1.5],['s',1.5],['t','This summer',1.6],['s',1.2],['s',1.2],['s',1.2],['t','{who}',1.8],['s',.9],['s',.9],['s',.9],['s',.9],['t','{name}',3.2,1.4],['t','{date}',2]]},
  romance:{name:'Romance',mood:'Romance',look:'Warm Film',trans:'dissolve',slots:[['t','{studio} presents',2.6],['s',2.6],['s',2.4],['t','Every story',2.2],['s',2.2],['t','has a beginning',2.2],['s',2],['s',2],['t','{who}',2.4],['s',1.8],['s',1.8],['t','{name}',4,1.3],['t','{date}',2.4]]},
  action:{name:'Action',mood:'Action',look:'Bleach Bypass',trans:'push',slots:[['t','{studio}',1.6],['s',1],['s',1],['t','No limits',1.4],['s',.8],['s',.8],['s',.8],['t','no fear',1.4],['s',.6],['s',.6],['s',.6],['s',.6],['s',.6],['t','{who}',1.6],['s',.5],['s',.5],['s',.5],['s',.5],['t','{name}',3,1.5],['t','{date}',1.8]]},
};
function kbPreset(i){const P=[{a:{x:0,y:0,s:1},b:{x:0,y:0,s:1.15}},{a:{x:0,y:0,s:1.18},b:{x:0,y:0,s:1}},{a:{x:-.04,y:0,s:1.12},b:{x:.04,y:0,s:1.12}},{a:{x:.04,y:.02,s:1.15},b:{x:-.03,y:-.02,s:1.05}}];return clone(P[i%P.length]);}
function shot(m,d,k){if(m.kind==='image'){const c=newClip('image',{media:m.id,in:0,out:d,name:m.name});c.kb=kbPreset(k);return c;}
  const segs=Math.max(1,Math.floor(m.dur/Math.max(d,0.5)));const start=Math.min(Math.max(0,m.dur-d-0.05),((k*0.37)%1)*m.dur*0.8+m.dur*0.1);const s=Math.max(0,Math.min(start,m.dur-d));
  return newClip('video',{media:m.id,in:s,out:Math.min(m.dur,s+d),name:m.name,vol:.0001,mute:true});}
export function buildTrailer(key,fields,media){const tp=TRAILERS[key];const seq=newSeq();let k=0;const vis=media.filter(m=>m.kind!=='audio');if(!vis.length)throw new Error('Import some photos or videos first');
  for(const sl of tp.slots){if(sl[0]==='t'){const txt=sl[1].replace(/\{(\w+)\}/g,(_,f)=>fields[f]||'');const c=newClip('title',{in:0,out:sl[2],name:txt});c.title=newTitle('trailer',txt,'');c.title.size=sl[3]||1;c.title.bg='#000000';seq.main.push(c);}
    else{const m=vis[k%vis.length];const c=shot(m,sl[1],k);c.fx.lut=tp.look;k++;seq.main.push(c);}}
  seq.main.forEach((c,i)=>{if(i>0&&(c.kind==='title'||seq.main[i-1].kind==='title'))c.trans={type:tp.trans,dur:.4};});return seq;}
export function buildMagic(media,{theme='modern'}={}){const seq=newSeq();let k=0;
  for(const m of media){if(m.kind==='audio')continue;if(m.kind==='image'){const c=newClip('image',{media:m.id,in:0,out:3.5,name:m.name});c.kb=kbPreset(k++);seq.main.push(c);}
    else{const d=Math.min(m.dur,m.dur>12?5:m.dur);const s=m.dur>12?m.dur*.3:0;seq.main.push(newClip('video',{media:m.id,in:s,out:s+d,name:m.name,fadeIn:.3,fadeOut:.3}));}}
  return seq;}
// ---------- stabilisation (global translation smoothing) ----------
export async function analyseStab(clip,onProgress){const m=S.media.get(clip.media);const v=await probeVideo(m.url);
  const w=96,h=54;const cv=document.createElement('canvas');cv.width=w;cv.height=h;const cx=cv.getContext('2d',{willReadFrequently:true});
  const t0=Math.max(0,clip.in),t1=Math.min(m.dur-0.05,clip.out);let rate=10;if((t1-t0)*rate>900)rate=900/(t1-t0);const n=Math.max(2,Math.floor((t1-t0)*rate)+1);
  const seek=t=>new Promise(r=>{let d=false;const f=()=>{if(d)return;d=true;v.removeEventListener('seeked',f);r();};v.addEventListener('seeked',f);setTimeout(f,3000);v.currentTime=t;});
  let prev=null;const px=[0],py=[0];
  for(let i=0;i<n;i++){await seek(t0+i/rate);cx.drawImage(v,0,0,w,h);const d=cx.getImageData(0,0,w,h).data;const g=new Float32Array(w*h);for(let j=0;j<w*h;j++)g[j]=d[j*4]*.3+d[j*4+1]*.59+d[j*4+2]*.11;
    if(prev){let best=1e18,bx=0,by=0;const R=6,mg=8;for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){let s=0;for(let y=mg;y<h-mg;y+=2)for(let x=mg;x<w-mg;x+=2){s+=Math.abs(g[y*w+x]-prev[(y-dy)*w+(x-dx)]);}if(s<best){best=s;bx=dx;by=dy;}}
      px.push(px[px.length-1]+bx);py.push(py[py.length-1]+by);}
    prev=g;onProgress&&onProgress(i/n);}
  v.removeAttribute('src');v.load();v.remove();
  const sm=a=>{const r=Math.round(rate*.8);return a.map((_,i)=>{let s=0,c=0;for(let k=-r;k<=r;k++){const j=Math.min(a.length-1,Math.max(0,i+k));const wgt=1-Math.abs(k)/(r+1);s+=a[j]*wgt;c+=wgt;}return s/c;});};
  const sx=sm(px),sy=sm(py);const dx=sx.map((v,i)=>(v-px[i])/w),dy=sy.map((v,i)=>(v-py[i])/h);
  const mx=Math.max(0.01,...dx.map(Math.abs),...dy.map(Math.abs));return {t0,rate,dx,dy,zoom:Math.min(1.3,1+2.2*mx),amt:1};}
// ---------- auto captions (Whisper in the browser) ----------
export async function transcribe(seq,onProgress,{lang='en'}={}){const len=layout(seq).len;if(len<0.5)throw new Error('Timeline is empty');
  for(const c of allClips(seq))if(c.media)await decodeAudio(c.media);
  onProgress('Mixing audio…',0);const ctx=new OfflineAudioContext(1,Math.ceil(len*16000),16000);scheduleMix(ctx,ctx.destination,seq,0,len,0,(id,rev)=>audioBuf(id,rev));
  const buf=await ctx.startRendering();const data=buf.getChannelData(0);
  onProgress('Loading the speech model (about 40 MB, first time only)…',.05);
  const T=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1');T.env.allowLocalModels=false;
  const model=lang==='en'?'Xenova/whisper-tiny.en':'Xenova/whisper-tiny';
  const asr=await T.pipeline('automatic-speech-recognition',model,{dtype:'q8',progress_callback:p=>{if(p.status==='progress'&&p.total>1e6)onProgress(`Downloading model ${Math.round(p.progress)}%`,.05+p.progress/100*.4);}});
  onProgress('Transcribing…',.5);
  const opts={chunk_length_s:30,stride_length_s:5,return_timestamps:true};if(lang!=='en')opts.language=lang;
  const r=await asr(data,opts);const out=[];
  for(const ch of (r.chunks||[])){const [a,b]=ch.timestamp;const text=(ch.text||'').trim();if(!text||/^\[.*\]$/.test(text))continue;const e=b??Math.min(len,a+3);
    const words=text.split(/\s+/);if(words.length>12){const parts=Math.ceil(words.length/10);const dd=(e-a)/parts;for(let p=0;p<parts;p++)out.push({s:a+p*dd,e:a+(p+1)*dd,text:words.slice(p*10,(p+1)*10).join(' ')});}
    else out.push({s:a,e:Math.max(e,a+.6),text});}
  onProgress('Done',1);return out;}
// ---------- voiceover ----------
export async function startVoiceover(){const st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  const types=['audio/mp4','audio/webm;codecs=opus','audio/webm'];const mime=types.find(t=>MediaRecorder.isTypeSupported(t))||'';const rec=new MediaRecorder(st,mime?{mimeType:mime}:{});const parts=[];
  rec.ondataavailable=e=>e.data.size&&parts.push(e.data);rec.start(500);
  return {stop:()=>new Promise(res=>{rec.onstop=()=>{st.getTracks().forEach(t=>t.stop());const type=(rec.mimeType||mime||'audio/webm').split(';')[0];
    res(new File(parts,`Voiceover ${new Date().toLocaleTimeString('en-GB')}.${type.includes('mp4')?'m4a':'webm'}`,{type}));};rec.stop();})};}
