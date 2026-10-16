'use strict';
/* Exemplar-based inpainting (multi-scale PatchMatch with EM voting). Runs in a Web Worker.
   in: {W,H,rgb:Uint8ClampedArray RGBA, hole:Uint8Array (1=fill)}  out: {idx:Int32Array, dx:Int16Array, dy:Int16Array} */
function inpaint(W,H,rgba,hole){
  let x0=W,y0=H,x1=-1,y1=-1; for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(hole[y*W+x]){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  if(x1<0) return {idx:new Int32Array(0),dx:new Int16Array(0),dy:new Int16Array(0)};
  const m=Math.max(40,Math.round(1.6*Math.max(x1-x0,y1-y0))); const rx0=Math.max(0,x0-m), ry0=Math.max(0,y0-m), rx1=Math.min(W-1,x1+m), ry1=Math.min(H-1,y1+m);
  const w0=rx1-rx0+1, h0=ry1-ry0+1;
  // level 0 (ROI)
  let img=new Float32Array(w0*h0*3), hl=new Uint8Array(w0*h0);
  for(let y=0;y<h0;y++) for(let x=0;x<w0;x++){ const gi=(y+ry0)*W+x+rx0, i=y*w0+x; img[i*3]=rgba[gi*4]; img[i*3+1]=rgba[gi*4+1]; img[i*3+2]=rgba[gi*4+2]; hl[i]=hole[gi]; }
  const levels=[{w:w0,h:h0,img,hole:hl}];
  while(true){ const L=levels[levels.length-1]; const hb=holeBox(L); if(Math.max(hb[2]-hb[0],hb[3]-hb[1])<=20||Math.min(L.w,L.h)<48) break;
    const w=L.w>>1, h=L.h>>1; const im=new Float32Array(w*h*3), ho=new Uint8Array(w*h);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ let s0=0,s1=0,s2=0,n=0,hh=0; for(let j=0;j<2;j++) for(let i=0;i<2;i++){ const k=(2*y+j)*L.w+2*x+i; if(L.hole[k]){hh=1;continue;} s0+=L.img[k*3]; s1+=L.img[k*3+1]; s2+=L.img[k*3+2]; n++; }
      const o=y*w+x; ho[o]=hh; if(n){ im[o*3]=s0/n; im[o*3+1]=s1/n; im[o*3+2]=s2/n; } }
    levels.push({w,h,img:im,hole:ho}); }
  let nnf=null, prevW=0;
  for(let li=levels.length-1;li>=0;li--){ const L=levels[li]; const r=li===0?2:3; const {w,h}=L;
    // valid sources: patch fully inside image and free of hole pixels
    const dil=dilate(L.hole,w,h,r); const valid=[]; const ok=new Uint8Array(w*h);
    for(let y=r;y<h-r;y++) for(let x=r;x<w-r;x++){ const i=y*w+x; if(!dil[i]){ ok[i]=1; valid.push(i); } }
    if(!valid.length) return null;
    const tgt=[]; for(let i=0;i<w*h;i++) if(L.hole[i]) tgt.push(i);
    const cur=L.img.slice(); const nf=new Int32Array(w*h).fill(-1);
    const rnd=()=>valid[(Math.random()*valid.length)|0];
    if(!nnf){ for(const i of tgt) nf[i]=rnd(); diffuse(cur,L.hole,w,h); }
    else { for(const i of tgt){ const x=i%w, y=(i/w)|0; const px=Math.min(prevW.w-1,x>>1), py=Math.min(prevW.h-1,y>>1); const q=nnf[py*prevW.w+px];
        let s=-1; if(q>=0){ const sx=(q%prevW.w)*2+(x&1), sy=((q/prevW.w)|0)*2+(y&1); if(sx<w&&sy<h&&ok[sy*w+sx]) s=sy*w+sx; } nf[i]=s>=0?s:rnd(); }
      for(const i of tgt){ const q=nf[i]; cur[i*3]=L.img[q*3]; cur[i*3+1]=L.img[q*3+1]; cur[i*3+2]=L.img[q*3+2]; } }
    const D=(p,q,best)=>{ const px=p%w, py=(p/w)|0, qx=q%w, qy=(q/w)|0; let d=0;
      for(let j=-r;j<=r;j++){ const yy=py+j; if(yy<0||yy>=h) continue; for(let i=-r;i<=r;i++){ const xx=px+i; if(xx<0||xx>=w) continue;
        const a=(yy*w+xx)*3, b=((qy+j)*w+qx+i)*3; const e0=cur[a]-L.img[b], e1=cur[a+1]-L.img[b+1], e2=cur[a+2]-L.img[b+2]; d+=e0*e0+e1*e1+e2*e2; }
        if(d>best) return d; } return d; };
    const em=li===0?2:(li===levels.length-1?6:4); const dist=new Float64Array(w*h);
    for(let e=0;e<em;e++){
      for(const i of tgt) dist[i]=D(i,nf[i],Infinity);
      for(let it=0;it<2;it++){ const rev=(it&1)===1; const n=tgt.length;
        for(let k=0;k<n;k++){ const p=tgt[rev?n-1-k:k]; const px=p%w, py=(p/w)|0; let best=dist[p], bq=nf[p];
          for(const [dx,dy] of rev?[[1,0],[0,1]]:[[-1,0],[0,-1]]){ const nx=px+dx, ny=py+dy; if(nx<0||ny<0||nx>=w||ny>=h) continue; const nb=ny*w+nx; const q0=nf[nb]; if(q0<0) continue;
            const cx=q0%w-dx, cy=((q0/w)|0)-dy; if(cx<0||cy<0||cx>=w||cy>=h) continue; const c=cy*w+cx; if(!ok[c]||c===bq) continue; const d=D(p,c,best); if(d<best){ best=d; bq=c; } }
          let R=Math.max(w,h); const bx=bq%w, by=(bq/w)|0;
          while(R>=1){ const cx=Math.round(bx+(Math.random()*2-1)*R), cy=Math.round(by+(Math.random()*2-1)*R); if(cx>=0&&cy>=0&&cx<w&&cy<h){ const c=cy*w+cx; if(ok[c]){ const d=D(p,c,best); if(d<best){ best=d; bq=c; } } } R*=0.5; }
          nf[p]=bq; dist[p]=best; } }
      // EM vote: each hole pixel = mean of the sources implied by all overlapping patches
      const nv=new Float32Array(tgt.length*3);
      for(let k=0;k<tgt.length;k++){ const p=tgt[k], px=p%w, py=(p/w)|0; let s0=0,s1=0,s2=0,wn=0;
        for(let j=-r;j<=r;j++) for(let i=-r;i<=r;i++){ const nx=px+i, ny=py+j; if(nx<0||ny<0||nx>=w||ny>=h) continue; const nb=ny*w+nx; if(!L.hole[nb]) continue;
          const q=nf[nb]; const sx=q%w-i, sy=((q/w)|0)-j; if(sx<0||sy<0||sx>=w||sy>=h) continue; const b=(sy*w+sx)*3; const wt=Math.exp(-dist[nb]/(2*(2*r+1)*(2*r+1)*3*400)); s0+=wt*L.img[b]; s1+=wt*L.img[b+1]; s2+=wt*L.img[b+2]; wn+=wt; }
        if(wn>0){ nv[k*3]=s0/wn; nv[k*3+1]=s1/wn; nv[k*3+2]=s2/wn; } else { const b=nf[p]*3; nv[k*3]=L.img[b]; nv[k*3+1]=L.img[b+1]; nv[k*3+2]=L.img[b+2]; } }
      for(let k=0;k<tgt.length;k++){ const p=tgt[k]; cur[p*3]=nv[k*3]; cur[p*3+1]=nv[k*3+1]; cur[p*3+2]=nv[k*3+2]; }
    }
    nnf=nf; prevW={w,h}; }
  const ids=[]; for(let i=0;i<w0*h0;i++) if(hl[i]) ids.push(i);
  const idx=new Int32Array(ids.length), dx=new Int16Array(ids.length), dy=new Int16Array(ids.length);
  ids.forEach((i,k)=>{ const x=i%w0, y=(i/w0)|0, q=nnf[i]; idx[k]=(y+ry0)*W+x+rx0; dx[k]=q%w0-x; dy[k]=((q/w0)|0)-y; });
  return {idx,dx,dy};
}
function holeBox(L){ let a=L.w,b=L.h,c=-1,d=-1; for(let y=0;y<L.h;y++) for(let x=0;x<L.w;x++) if(L.hole[y*L.w+x]){ if(x<a)a=x; if(x>c)c=x; if(y<b)b=y; if(y>d)d=y; } return [a,b,c,d]; }
function dilate(m,w,h,r){ const t=new Uint8Array(w*h), o=new Uint8Array(w*h);
  for(let y=0;y<h;y++){ let last=-1e9; for(let x=0;x<w;x++){ if(m[y*w+x]) last=x; if(x-last<=r) t[y*w+x]=1; } last=1e9; for(let x=w-1;x>=0;x--){ if(m[y*w+x]) last=x; if(last-x<=r) t[y*w+x]=1; } }
  for(let x=0;x<w;x++){ let last=-1e9; for(let y=0;y<h;y++){ if(t[y*w+x]) last=y; if(y-last<=r) o[y*w+x]=1; } last=1e9; for(let y=h-1;y>=0;y--){ if(t[y*w+x]) last=y; if(last-y<=r) o[y*w+x]=1; } }
  return o; }
function diffuse(img,hole,w,h){ for(let it=0;it<Math.max(w,h);it++){ for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=y*w+x; if(!hole[i]) continue; let s0=0,s1=0,s2=0,n=0;
  for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){ const xx=x+a,yy=y+b; if(xx<0||yy<0||xx>=w||yy>=h) continue; const k=(yy*w+xx)*3; s0+=img[k];s1+=img[k+1];s2+=img[k+2];n++; } img[i*3]=s0/n; img[i*3+1]=s1/n; img[i*3+2]=s2/n; } } }
if(typeof self!=='undefined'&&typeof window==='undefined'){ self.onmessage=e=>{ const {W,H,rgba,hole,id}=e.data; try{ const r=inpaint(W,H,rgba,hole); self.postMessage({id,r}); }catch(err){ self.postMessage({id,err:String(err)}); } }; }
