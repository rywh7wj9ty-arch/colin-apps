// Built-in creative LUTs (generated) and .cube import
const N=25;
const W3=[.2126,.7152,.0722];
const cl=v=>Math.min(1,Math.max(0,v));
const mix=(a,b,t)=>a+(b-a)*t;
const lum=(r,g,b)=>r*W3[0]+g*W3[1]+b*W3[2];
const sat=(c,s)=>{const l=lum(...c);return c.map(v=>l+(v-l)*s);};
const curve=(v,k)=>{const x=v-.5;return .5+x*(1+k)-k*4*x*x*x*(1);};
const F={
  'Teal & Orange':([r,g,b])=>{const l=lum(r,g,b);const w=cl((l-.35)*2.2);let c=[r+(.10*w-.06*(1-w)),g+(.03*w+.02*(1-w)),b+(-.10*w+.09*(1-w))];c=sat(c,1.15);return c.map(v=>curve(v,.15));},
  'Warm Film':([r,g,b])=>{let c=[r*1.06+.03,g*1.0+.015,b*.9+.02];c=c.map(v=>.04+v*.92);c=c.map(v=>curve(v,.1));return sat(c,.9);},
  'Bleach Bypass':([r,g,b])=>{const l=lum(r,g,b);let c=sat([r,g,b],.45);c=c.map(v=>curve(mix(v,l,.2),.45));return c;},
  'Noir':([r,g,b])=>{const l=curve(lum(r*1.1,g,b*.8),.6);return [l,l,l*.98];},
  'Cool Night':([r,g,b])=>{let c=[r*.82,g*.92+.01,b*1.12+.04];c=c.map(v=>curve(v*.92,.12));return sat(c,.8);},
  'Vintage':([r,g,b])=>{let c=[r*.95+.07,g*.92+.06,b*.78+.08];c=sat(c,.7);const l=lum(...c);c[1]+=.03*(1-l);return c.map(v=>mix(.06,.94,v));},
  'Vivid':([r,g,b])=>sat([r,g,b],1.45).map(v=>curve(v,.18)),
  'Golden Hour':([r,g,b])=>{const l=lum(r,g,b);let c=[r+.08*l+.02,g+.04*l+.01,b-.06*l];return sat(c,1.12).map(v=>curve(v,.08));},
  'Faded Matte':([r,g,b])=>[r,g,b].map(v=>mix(.1,.9,curve(v,-.1))).map((v,i)=>v+(i===2?.02:0)),
  'Cross Process':([r,g,b])=>[curve(r,.35)+.03,curve(g,.2)+.02,mix(.12,.85,b)],
  'Mono Warm':([r,g,b])=>{const l=curve(lum(r,g,b),.2);return [l*1.05+.02,l*.98+.01,l*.86];},
  'Cinema Green':([r,g,b])=>{let c=[r*.95,g*1.03+.01,b*.94+.02];c=sat(c,.85);return c.map(v=>curve(v,.2));},
};
export const BUILTIN_LUTS=Object.keys(F);
const cache=new Map();
export function getLut(name,proj){if(cache.has(name))return cache.get(name);let out=null;
  if(F[name]){const d=new Uint8Array(N*N*N*3);let i=0;for(let b=0;b<N;b++)for(let g=0;g<N;g++)for(let r=0;r<N;r++){const c=F[name]([r/(N-1),g/(N-1),b/(N-1)]);d[i++]=Math.round(cl(c[0])*255);d[i++]=Math.round(cl(c[1])*255);d[i++]=Math.round(cl(c[2])*255);}out={n:N,data:d};}
  else if(proj&&proj.luts&&proj.luts[name]){const l=proj.luts[name];const bin=atob(l.d);const d=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)d[i]=bin.charCodeAt(i);out={n:l.n,data:d};}
  if(out)cache.set(name,out);return out;}
export function applyLutCPU(name,proj,rgb){const l=getLut(name,proj);if(!l)return rgb;const n=l.n;const idx=(r,g,b)=>3*(r+g*n+b*n*n);
  const q=rgb.map(v=>Math.round(cl(v)*(n-1)));const i=idx(...q);return [l.data[i]/255,l.data[i+1]/255,l.data[i+2]/255];}
export function parseCube(text){let n=0;const vals=[];let mn=[0,0,0],mx=[1,1,1];
  for(const raw of text.split(/\r?\n/)){const s=raw.trim();if(!s||s[0]==='#')continue;const p=s.split(/\s+/);
    if(p[0]==='LUT_3D_SIZE')n=+p[1];else if(p[0]==='DOMAIN_MIN')mn=p.slice(1,4).map(Number);else if(p[0]==='DOMAIN_MAX')mx=p.slice(1,4).map(Number);
    else if(/^[-\d.eE+]+$/.test(p[0])&&p.length>=3)vals.push(+p[0],+p[1],+p[2]);}
  if(!n||vals.length<n*n*n*3)throw new Error('Not a valid 3D .cube LUT');
  const d=new Uint8Array(n*n*n*3);for(let i=0;i<d.length;i++){const ch=i%3;d[i]=Math.round(cl((vals[i]-mn[ch])/(mx[ch]-mn[ch]))*255);}
  let bin='';for(let i=0;i<d.length;i+=8192)bin+=String.fromCharCode.apply(null,d.subarray(i,i+8192));return {n,d:btoa(bin)};}
export function dropLutCache(name){cache.delete(name);}
