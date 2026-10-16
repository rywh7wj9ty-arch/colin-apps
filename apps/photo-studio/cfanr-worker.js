/* Sensor-level (CFA/Bayer) noise reduction + demosaic + lateral CA correction, in a Web Worker.
   1) estimate Poisson-Gaussian noise per CFA channel  2) generalized Anscombe VST  3) orthonormal 2x2 (Y + 3 colour-difference) transform
   4) undecimated B3 wavelet with locally-adaptive Wiener shrinkage (strip-tiled with overlap)  5) exact-unbiased inverse VST
   6) Malvar-He-Cutler gradient-corrected demosaic  7) lateral chromatic aberration: estimate R/B radial scale vs G, resample. */
'use strict';
let cancelled=false;
onmessage=e=>{ const m=e.data; if(m.cancel){ cancelled=true; return; } cancelled=false;
  try{ const t0=performance.now(); const r=run(m); r.ms=Math.round(performance.now()-t0); postMessage({id:m.id,done:true,res:r},[r.data.buffer]); }
  catch(err){ postMessage({id:m.id,err:String(err&&err.message||err)}); } };
const prog=(id,p,stage)=>postMessage({id,progress:p,stage});
function pattern(d,w,h){ const cnt=[[0,0,0],[0,0,0],[0,0,0],[0,0,0]]; for(let y=0;y<Math.min(h,400);y++) for(let x=0;x<Math.min(w,400);x++){ const i=(y*w+x)*3; const nz=(d[i]>0)+(d[i+1]>0)+(d[i+2]>0); if(nz!==1) continue; const c=d[i]>0?0:d[i+1]>0?1:2; cnt[(y&1)*2+(x&1)][c]++; }
  const pat=cnt.map(c=>c.indexOf(Math.max(...c))); if(!(pat.filter(c=>c===1).length===2&&pat.includes(0)&&pat.includes(2))) throw new Error('not a Bayer sensor'); return pat; }
function estNoise(cfa,w,h,pat){ // per channel: sigma^2 = a*mean + b fitted on lower-percentile local variances of a high-pass
  const res=[]; for(let c=0;c<3;c++){ const pts=[]; const B=16;
    for(let by=4;by+B*2+4<h;by+=B*2*3) for(let bx=4;bx+B*2+4<w;bx+=B*2*3){ let s=0,ss=0,n=0,mean=0;
      for(let y=by;y<by+B*2;y++) for(let x=bx;x<bx+B*2;x++){ if(pat[(y&1)*2+(x&1)]!==c) continue; const v=cfa[y*w+x]; mean+=v; const hp=v-0.25*(cfa[(y-2)*w+x]+cfa[(y+2)*w+x]+cfa[y*w+x-2]+cfa[y*w+x+2]); s+=hp; ss+=hp*hp; n++; }
      if(n<8) continue; mean/=n; const v=(ss/n-(s/n)**2)/1.25; if(mean<65000*0.9) pts.push([mean,v]); }
    pts.sort((p,q)=>p[0]-q[0]); const nb=12, bins=[]; for(let i=0;i<nb;i++){ const seg=pts.slice(Math.floor(i*pts.length/nb),Math.floor((i+1)*pts.length/nb)); if(seg.length<3) continue; const vs=seg.map(p=>p[1]).sort((a,b)=>a-b); bins.push([seg.reduce((a,p)=>a+p[0],0)/seg.length,vs[Math.floor(vs.length*0.2)]]); }
    let a=1,b=1; if(bins.length>=2){ const n=bins.length, mx=bins.reduce((s,p)=>s+p[0],0)/n, my=bins.reduce((s,p)=>s+p[1],0)/n; let sxy=0,sxx=0; bins.forEach(p=>{ sxy+=(p[0]-mx)*(p[1]-my); sxx+=(p[0]-mx)**2; }); a=Math.max(1e-3,sxx?sxy/sxx:1); b=Math.max(0.1,my-a*mx); }
    else if(bins.length===1){ a=Math.max(1e-3,bins[0][1]/Math.max(1,bins[0][0])); b=0.1; }
    res.push({a,b}); } return res; }
const H=[1/16,4/16,6/16,4/16,1/16];
function atrousLevel(src,w,h,step,dst,tmp){ for(let y=0;y<h;y++){ const o=y*w; for(let x=0;x<w;x++){ let s=0; for(let k=-2;k<=2;k++){ let xx=x+k*step; if(xx<0) xx=-xx; if(xx>=w) xx=2*w-2-xx; xx=xx<0?0:xx>=w?w-1:xx; s+=H[k+2]*src[o+xx]; } tmp[o+x]=s; } }
  for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ let s=0; for(let k=-2;k<=2;k++){ let yy=y+k*step; if(yy<0) yy=-yy; if(yy>=h) yy=2*h-2-yy; yy=yy<0?0:yy>=h?h-1:yy; s+=H[k+2]*tmp[yy*w+x]; } dst[y*w+x]=s; } } }
const SIG=[0.8908,0.2007,0.0856,0.0413,0.0205,0.0103]; // B3 a-trous noise std per level for unit white noise
function boxVar(c,w,h,r,out){ // local mean of c^2 with box radius r (integral image)
  const I=new Float64Array((w+1)*(h+1)); for(let y=0;y<h;y++){ let row=0; for(let x=0;x<w;x++){ const v=c[y*w+x]; row+=v*v; I[(y+1)*(w+1)+x+1]=I[y*(w+1)+x+1]+row; } }
  for(let y=0;y<h;y++){ const y0=Math.max(0,y-r), y1=Math.min(h,y+r+1); for(let x=0;x<w;x++){ const x0=Math.max(0,x-r), x1=Math.min(w,x+r+1); out[y*w+x]=(I[y1*(w+1)+x1]-I[y0*(w+1)+x1]-I[y1*(w+1)+x0]+I[y0*(w+1)+x0])/((y1-y0)*(x1-x0)); } } }
function denoisePlane(p,w,h,k,levels){ // p: unit-variance noise plane, k: strength multiplier on noise variance
  if(k<=0) return; let cur=p.slice(), nxt=new Float32Array(w*h), tmp=new Float32Array(w*h), det=new Float32Array(w*h), lv=new Float32Array(w*h); const out=new Float32Array(w*h);
  for(let j=0;j<levels;j++){ atrousLevel(cur,w,h,1<<j,nxt,tmp); for(let i=0;i<w*h;i++) det[i]=cur[i]-nxt[i];
    const s2=(SIG[j]**2)*k; boxVar(det,w,h,j<2?3:4,lv); for(let i=0;i<w*h;i++){ const g=Math.max(0,1-s2/Math.max(lv[i],1e-9)); out[i]+=det[i]*g; } const t=cur; cur=nxt; nxt=t; }
  for(let i=0;i<w*h;i++) p[i]=out[i]+cur[i]; }
function gat(x,a,b){ return 2/a*Math.sqrt(Math.max(0,a*x+0.375*a*a+b)); }
function igat(D,a,b){ const s2=b/(a*a); let z; if(D<1){ z=Math.max(0,D*D/4-0.375-s2); } else { const r=Math.sqrt(1.5); z=D*D/4+0.25*r/D-1.375/(D*D)+0.625*r/(D*D*D)-0.125-s2; } return Math.max(0,z*a); }
function run(m){ const {w,h,id}=m; const d=new Uint16Array(m.data); const pat=pattern(d,w,h); const str=m.strength, chroma=m.chroma??1.4;
  const cfa=new Float32Array(w*h); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=y*w+x; cfa[i]=d[i*3+pat[(y&1)*2+(x&1)]]; }
  prog(id,0.03,'Estimating sensor noise'); const nm=m.noise||estNoise(cfa,w,h,pat); if(m.estimateOnly) return {data:new Uint16Array(0),noise:nm}; const NM=[0,1,2,3].map(q=>nm[pat[q]]);
  const hw=w>>1, hh=h>>1;
  if(str>0){ const SH=256, OV=40; const nstrip=Math.ceil(hh/SH);
    for(let si=0;si<nstrip;si++){ if(cancelled) throw new Error('cancelled'); const y0=si*SH, y1=Math.min(hh,y0+SH), a0=Math.max(0,y0-OV), a1=Math.min(hh,y1+OV), sh=a1-a0, n=hw*sh;
      const P=[0,1,2,3].map(()=>new Float32Array(n));
      for(let y=0;y<sh;y++) for(let x=0;x<hw;x++){ const Y=(a0+y)*2, X=x*2; for(let q=0;q<4;q++){ const v=cfa[(Y+(q>>1))*w+X+(q&1)]; P[q][y*hw+x]=gat(v,NM[q].a,NM[q].b); } }
      const T=[new Float32Array(n),new Float32Array(n),new Float32Array(n),new Float32Array(n)];
      for(let i=0;i<n;i++){ const p0=P[0][i],p1=P[1][i],p2=P[2][i],p3=P[3][i]; T[0][i]=(p0+p1+p2+p3)/2; T[1][i]=(p0-p1-p2+p3)/2; T[2][i]=(p0+p1-p2-p3)/2; T[3][i]=(p0-p1+p2-p3)/2; }
      denoisePlane(T[0],hw,sh,str,5); for(let c=1;c<4;c++) denoisePlane(T[c],hw,sh,str*chroma,6);
      for(let y=y0-a0;y<y1-a0;y++) for(let x=0;x<hw;x++){ const i=y*hw+x, t0=T[0][i],t1=T[1][i],t2=T[2][i],t3=T[3][i]; const q=[(t0+t1+t2+t3)/2,(t0-t1+t2-t3)/2,(t0-t1-t2+t3)/2,(t0+t1-t2-t3)/2]; const Y=(a0+y)*2, X=x*2;
        for(let k=0;k<4;k++) cfa[(Y+(k>>1))*w+X+(k&1)]=igat(q[k],NM[k].a,NM[k].b); }
      prog(id,0.05+0.7*(si+1)/nstrip,`Sensor-level noise reduction ${si+1}/${nstrip}`); } }
  prog(id,0.78,'Demosaicing'); const out=d; demosaic(cfa,w,h,pat,out);
  let ca=null; if(m.ca){ if(cancelled) throw new Error('cancelled'); prog(id,0.9,'Correcting chromatic aberration'); ca=caFix(out,w,h); }
  return {data:out,pattern:pat,noise:nm.map(o=>({a:+o.a.toFixed(4),b:+o.b.toFixed(1)})),ca}; }
function demosaic(c,w,h,pat,out){ // Malvar-He-Cutler 5x5
  const P=(x,y)=>{ x=x<0?-x:x>=w?2*w-2-x:x; y=y<0?-y:y>=h?2*h-2-y:y; return c[y*w+x]; }; const cl=v=>v<0?0:v>65535?65535:v+0.5|0;
  const rowHasR=[0,1].map(r=>pat[r*2]===0||pat[r*2+1]===0);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const q=(y&1)*2+(x&1), col=pat[q], C=P(x,y), i=(y*w+x)*3; let r,g,b;
    const Gat=(4*C+2*(P(x-1,y)+P(x+1,y)+P(x,y-1)+P(x,y+1))-(P(x-2,y)+P(x+2,y)+P(x,y-2)+P(x,y+2)))/8;
    if(col===1){ const hor=(5*C+4*(P(x-1,y)+P(x+1,y))-(P(x-2,y)+P(x+2,y))-(P(x-1,y-1)+P(x+1,y-1)+P(x-1,y+1)+P(x+1,y+1))+0.5*(P(x,y-2)+P(x,y+2)))/8;
      const ver=(5*C+4*(P(x,y-1)+P(x,y+1))-(P(x,y-2)+P(x,y+2))-(P(x-1,y-1)+P(x+1,y-1)+P(x-1,y+1)+P(x+1,y+1))+0.5*(P(x-2,y)+P(x+2,y)))/8;
      g=C; if(rowHasR[y&1]){ r=hor; b=ver; } else { r=ver; b=hor; } }
    else { const diag=(6*C+2*(P(x-1,y-1)+P(x+1,y-1)+P(x-1,y+1)+P(x+1,y+1))-1.5*(P(x-2,y)+P(x+2,y)+P(x,y-2)+P(x,y+2)))/8; g=Gat; if(col===0){ r=C; b=diag; } else { b=C; r=diag; } }
    out[i]=cl(r); out[i+1]=cl(g); out[i+2]=cl(b); } }
function caFix(o,w,h){ // estimate radial scale of R and B relative to G on a downsampled luminance-edge map, then resample
  const k=Math.max(1,Math.floor(Math.max(w,h)/1200)), sw=Math.floor(w/k), sh=Math.floor(h/k); const ch=[0,1,2].map(c=>{ const a=new Float32Array(sw*sh); for(let y=0;y<sh;y++) for(let x=0;x<sw;x++){ let s=0; for(let j=0;j<k;j++) for(let i=0;i<k;i++) s+=o[((y*k+j)*w+x*k+i)*3+c]; a[y*sw+x]=Math.sqrt(s/(k*k)); } return a; });
  const cx=sw/2, cy=sh/2, R2=cx*cx+cy*cy; const grad=a=>{ const g=new Float32Array(sw*sh); for(let y=1;y<sh-1;y++) for(let x=1;x<sw-1;x++){ const i=y*sw+x; const dx=a[i+1]-a[i-1], dy=a[i+sw]-a[i-sw]; const rx=x-cx, ry=y-cy, r=Math.hypot(rx,ry)||1; g[i]=(dx*rx+dy*ry)/r; } return g; };
  const gG=grad(ch[1]); const samp=(a,x,y)=>{ const x0=Math.floor(x),y0=Math.floor(y); if(x0<0||y0<0||x0>=sw-1||y0>=sh-1) return 0; const fx=x-x0,fy=y-y0,i=y0*sw+x0; return a[i]*(1-fx)*(1-fy)+a[i+1]*fx*(1-fy)+a[i+sw]*(1-fx)*fy+a[i+sw+1]*fx*fy; };
  const pts=[]; for(let y=2;y<sh-2;y+=2) for(let x=2;x<sw-2;x+=2){ const i=y*sw+x; const rr=((x-cx)**2+(y-cy)**2)/R2; if(rr>0.15&&Math.abs(gG[i])>4) pts.push(i); } if(pts.length<200) return {r:0,b:0,note:'too few edges'};
  const best=c=>{ const gC=grad(ch[c]); let bs=0,be=Infinity; for(let s=-0.0024;s<=0.00241;s+=0.0002){ let e=0; for(const i of pts){ const x=i%sw,y=(i/sw)|0; const v=samp(gC,cx+(x-cx)*(1+s),cy+(y-cy)*(1+s)); const nG=gG[i]; e+=Math.abs(v-nG*(meanC[c]/meanC[1])); } if(e<be){ be=e; bs=s; } } return +bs.toFixed(4); };
  const meanC=ch.map(a=>{ let s=0; for(const i of pts) s+=a[i]; return s/pts.length||1; });
  const sr=best(0), sb=best(2);
  const fix=(c,s)=>{ if(!s) return; const src=new Uint16Array(w*h); for(let i=0;i<w*h;i++) src[i]=o[i*3+c]; const X=w/2,Y=h/2;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const fx=X+(x-X)*(1+s), fy=Y+(y-Y)*(1+s); const x0=Math.floor(fx),y0=Math.floor(fy); if(x0<0||y0<0||x0>=w-1||y0>=h-1) continue; const ax=fx-x0, ay=fy-y0, i=y0*w+x0;
      o[(y*w+x)*3+c]=src[i]*(1-ax)*(1-ay)+src[i+1]*ax*(1-ay)+src[i+w]*(1-ax)*ay+src[i+w+1]*ax*ay+0.5|0; } };
  fix(0,sr); fix(2,sb); return {r:sr,b:sb}; }
