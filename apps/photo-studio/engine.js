// Photo Studio GPU engine (WebGL2)
'use strict';
const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

const HDR = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
vec3 s2l(vec3 c){ c=max(c,0.); return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045,c)); }
vec3 l2s(vec3 c){ c=max(c,0.); return mix(c*12.92, 1.055*pow(c, vec3(1./2.4))-0.055, step(0.0031308,c)); }
`;

// ---- Noise reduction: NLM luminance + cross-bilateral chroma, in YCbCr ----
const FS_NR = HDR + `
uniform sampler2D uTex; uniform vec2 uPx; uniform float uStep;
uniform float uLum, uLumDetail, uLumContrast, uCol, uColDetail, uColSmooth;
vec3 ycc(vec3 c){ float y=dot(c,vec3(.299,.587,.114)); return vec3(y,(c.b-y)*0.564,(c.r-y)*0.713); }
vec3 rgb(vec3 q){ float r=q.x+1.403*q.z; float b=q.x+1.773*q.y; float g=(q.x-.299*r-.114*b)/.587; return vec3(r,g,b); }
float Y(vec2 uv){ return dot(texture(uTex,uv).rgb, vec3(.299,.587,.114)); }
void main(){
  vec3 src = texture(uTex,vUv).rgb; vec3 c0 = ycc(src);
  float yOut = c0.x; vec2 cOut = c0.yz;
  vec2 st = uPx*uStep;
  if(uLum>0.){
    // centre patch 3x3
    float p[9]; int k=0;
    for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ p[k++] = Y(vUv+vec2(i,j)*st); }
    float a = uLum/100.;
    float sig = mix(0.002, 0.075, pow(a,1.05));
    float h = sig*mix(1.5, 0.55, uLumDetail/100.);
    float inv = 1./(h*h); float sub2 = 2.*sig*sig;
    float ws=0., ys=0., gs=0., gw=0.;
    for(int dj=-3;dj<=3;dj++) for(int di=-3;di<=3;di++){
      vec2 d = vec2(di,dj)*st; float dist=0.; int m=0;
      for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ float t=Y(vUv+d+vec2(i,j)*st)-p[m++]; dist+=t*t; }
      float sp = exp(-float(di*di+dj*dj)/18.);
      float w = exp(-max(dist/9.-sub2,0.)*inv)*sp;
      float yy = p[4]; yy = Y(vUv+d);
      ws+=w; ys+=w*yy; gs+=sp*yy; gw+=sp;
    }
    float den = ys/ws; float mean = gs/gw;
    // contrast: restore local contrast lost to smoothing
    den = mean + (den-mean)*(1.+uLumContrast/100.*0.6);
    // detail: protect a fraction of fine structure
    float keep = uLumDetail/100.*0.08*(1.-a*0.7);
    yOut = mix(den, c0.x, keep);
  }
  if(uCol>0.){
    float a = uCol/100.;
    float sc = mix(0.004,0.05,a);      // chroma range
    float sy = mix(0.25,0.03,uColDetail/100.); // luma edge stop
    float stride = mix(1.0,3.5,uColSmooth/100.)*mix(0.8,1.6,a);
    float ws=0.; vec2 cs=vec2(0.);
    for(int dj=-4;dj<=4;dj++) for(int di=-4;di<=4;di++){
      vec2 o2 = vec2(di,dj)*st*stride; vec3 q = ycc(texture(uTex,vUv+o2).rgb);
      vec2 dc=q.yz-c0.yz; float dy=q.x-c0.x;
      float w = exp(-float(di*di+dj*dj)/24.)*exp(-dot(dc,dc)/(sc*sc))*exp(-dy*dy/(sy*sy));
      ws+=w; cs+=w*q.yz;
    }
    cOut = mix(c0.yz, cs/ws, smoothstep(0.,0.15,a));
  }
  o = vec4(max(rgb(vec3(yOut,cOut)),0.),1.);
}`;


// ---- Noise reduction v3: noise-estimated NLM (luma) + Laplacian-pyramid shrinkage (YCbCr) ----
const YCC = `
vec3 ycc(vec3 c){ float y=dot(c,vec3(.299,.587,.114)); return vec3(y,(c.b-y)*0.564+0.5,(c.r-y)*0.713+0.5); }
vec3 rgbOf(vec3 q){ float cb=q.y-0.5, cr=q.z-0.5; float r=q.x+1.403*cr; float b=q.x+1.773*cb; float g=(q.x-.299*r-.114*b)/.587; return vec3(r,g,b); }`;
const FS_HP = HDR + YCC + `
uniform sampler2D uTex; uniform ivec2 uOrg[5]; uniform int uWin;
vec3 T(ivec2 p){ return ycc(texelFetch(uTex,p,0).rgb); }
void main(){ ivec2 fc=ivec2(gl_FragCoord.xy); int wi=fc.x/uWin; ivec2 p=uOrg[wi]+ivec2(fc.x-wi*uWin, fc.y);
  vec3 c=T(p); vec3 n=0.25*(T(p+ivec2(1,0))+T(p-ivec2(1,0))+T(p+ivec2(0,1))+T(p-ivec2(0,1)));
  o=vec4(clamp(abs(c-n)*8.,0.,1.),1.); }`;
const FS_NLM = HDR + YCC + `
uniform sampler2D uTex; uniform vec2 uPx; uniform float uH, uSub, uKeep;
float Y(vec2 uv){ return dot(texture(uTex,uv).rgb, vec3(.299,.587,.114)); }
void main(){
  vec3 c0=ycc(texture(uTex,vUv).rgb); float yo=c0.x;
  if(uH>0.){ float p[9]; int k=0; for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++) p[k++]=Y(vUv+(vec2(i,j)+0.5)*uPx);
    float inv=1./(uH*uH), ws=0., ys=0., wm=0.;
    for(int dj=-3;dj<=3;dj++) for(int di=-3;di<=3;di++){ if(di==0&&dj==0) continue; vec2 d=vec2(di,dj)*uPx; float dist=0., yc=0.; int m=0;
      for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ float v=Y(vUv+d+(vec2(i,j)+0.5)*uPx); if(m==4) yc=Y(vUv+d); float t=v-p[m++]; dist+=t*t; }
      float w=exp(-max(dist/9.-uSub,0.)*inv)*exp(-float(di*di+dj*dj)/24.); ws+=w; ys+=w*yc; wm=max(wm,w); }
    wm=max(wm,1e-4); ws+=wm; ys+=wm*c0.x;
    yo=mix(ys/ws, c0.x, uKeep); }
  o=vec4(yo,c0.yz,1.); }`;
const FS_PDOWN = HDR + `
uniform sampler2D uTex; uniform vec2 uPx; // source texel
void main(){ vec2 d=uPx*0.75; o=0.25*(texture(uTex,vUv+vec2(-d.x,-d.y))+texture(uTex,vUv+vec2(d.x,-d.y))+texture(uTex,vUv+vec2(-d.x,d.y))+texture(uTex,vUv+vec2(d.x,d.y))); }`;
const FS_COARSE = HDR + `
uniform sampler2D uTex; uniform vec2 uPx; uniform float uSy, uSc, uMixY, uMixC;
void main(){ vec3 c0=texture(uTex,vUv).rgb; vec3 acc=vec3(0.); float ws=0.;
  for(int j=-3;j<=3;j++) for(int i=-3;i<=3;i++){ vec3 q=texture(uTex,vUv+vec2(i,j)*uPx).rgb; float dy=q.x-c0.x; vec2 dc=q.yz-c0.yz;
    float w=exp(-float(i*i+j*j)/8.)*exp(-dy*dy/(uSy*uSy))*exp(-dot(dc,dc)/(uSc*uSc)); acc+=w*q; ws+=w; }
  vec3 b=acc/ws; o=vec4(mix(c0.x,b.x,uMixY), mix(c0.yz,b.yz,uMixC), 1.); }`;
const FS_REC = HDR + YCC + `
uniform sampler2D uG, uGl, uRl; uniform vec3 uT; uniform float uBoost; uniform bool uFinal;
vec3 shrink(vec3 d, vec3 t){ vec3 d2=d*d; return d*d2/(d2+t*t+1e-12); }
void main(){ vec3 g=texture(uG,vUv).rgb, gl2=texture(uGl,vUv).rgb, rl=texture(uRl,vUv).rgb;
  vec3 d=shrink(g-gl2,uT); d.x*=uBoost; vec3 r=rl+d;
  o = uFinal ? vec4(max(rgbOf(r),0.),1.) : vec4(r,1.); }`;

const FS_DOWN = HDR + `
uniform sampler2D uTex; uniform vec2 uPx;
void main(){ vec3 s=vec3(0.); float mn=0.;
  for(int j=0;j<4;j++) for(int i=0;i<4;i++){ vec3 c=texture(uTex, vUv+(vec2(i,j)-1.5)*uPx).rgb; s+=c; mn+=min(c.r,min(c.g,c.b)); }
  o=vec4(s/16., mn/16.); }`;
const FS_BLUR = HDR + `
uniform sampler2D uTex; uniform vec2 uDir;
void main(){ float w[5]=float[](0.227,0.1946,0.1216,0.054,0.0162); vec4 s=texture(uTex,vUv)*w[0];
  for(int i=1;i<5;i++){ s+=texture(uTex,vUv+uDir*float(i))*w[i]; s+=texture(uTex,vUv-uDir*float(i))*w[i]; } o=s; }`;


const FS_HEAL = HDR + `
uniform sampler2D uTex, uFill; uniform vec4 uXf; uniform int uN; uniform vec4 uSA[32]; uniform vec4 uSB[32]; uniform vec2 uAsp; uniform float uFillOn, uFillR;
vec3 S(vec2 imgUv){ return texture(uTex,(imgUv-uXf.xy)/uXf.zw).rgb; }
void main(){
  vec2 iu = uXf.xy + vUv*uXf.zw; vec3 c = texture(uTex,vUv).rgb;
  for(int k=0;k<32;k++){ if(k>=uN) break;
    vec2 dst=uSA[k].xy, src=uSA[k].zw; float r=uSB[k].x, fe=uSB[k].y, op=uSB[k].z, mode=uSB[k].w;
    vec2 ruv=vec2(r, r*uAsp.x/uAsp.y); vec2 d=(iu-dst)/ruv; float dn=length(d); if(dn>=1.) continue;
    vec3 col=S(src+(iu-dst));
    if(mode<0.5){ vec3 acc=vec3(0.); float ws=0.;
      for(int i=0;i<24;i++){ float an=float(i)*0.261799; vec2 bd=vec2(cos(an),sin(an))*ruv*1.02;
        vec3 diff=S(dst+bd)-S(src+bd); vec2 pd=(iu-(dst+bd))/ruv; float w=1./(dot(pd,pd)+0.02); acc+=w*diff; ws+=w; }
      col+=acc/ws; }
    float a=op*(1.-smoothstep(1.-max(fe,0.01),1.,dn));
    c=mix(c,max(col,0.),a); }
  if(uFillOn>0.5){ vec4 f=texture(uFill,iu); if(f.z>0.002){ vec3 col=S(iu+f.xy);
      if(f.w>1.5){ vec3 acc=vec3(0.); float ws=0.; // heal: transfer low-frequency colour from around the destination
        for(int i=0;i<16;i++){ float an=float(i)*0.392699; vec2 bd=vec2(cos(an),sin(an)*uAsp.x/uAsp.y)*uFillR; float w=1.-texture(uFill,iu+bd).z;
          acc+=w*(S(iu+bd)-S(iu+f.xy+bd)); ws+=w; }
        if(ws>0.01) col+=acc/ws; }
      c=mix(c,max(col,0.),f.z); } }
  o=vec4(c,1.);
}`;
const FS_LB = HDR + `
uniform sampler2D uTex, uDep; uniform vec4 uXf; uniform vec2 uFull; uniform float uR, uF, uW, uHB, uCat; uniform int uShape, uN;
float near(vec2 iu){ return texture(uDep,clamp(iu,0.,1.)).a; }
float coc(vec2 iu){ return clamp((abs(near(iu)-uF)-uW)/max(1.-uW,0.05)*1.6,0.,1.); }
float shapeW(vec2 p, vec2 iu){ float r=length(p);
  if(uShape==1){ vec2 q=abs(p); float hx=max(q.x*0.866+q.y*0.5,q.y); return 1.-smoothstep(0.9,1.,hx); }
  if(uShape==2){ vec2 c=(iu-0.5)*2.; vec2 o=p+c*uCat*0.55; return (1.-smoothstep(0.92,1.,r))*(1.-smoothstep(0.92,1.,length(o))); }
  if(uShape==3){ return (1.-smoothstep(0.92,1.,r))*(0.35+1.3*r*r); }
  return 1.-smoothstep(0.92,1.,r); }
void main(){ vec2 iu=uXf.xy+vUv*uXf.zw; vec2 asp=vec2(1.,uFull.x/uFull.y); float c0=coc(iu); vec3 c=texture(uTex,vUv).rgb;
  if(uR<=0.){ o=vec4(c,1.); return; }
  vec3 acc=vec3(0.); float wsum=0.; float ga=2.39996;
  for(int i=0;i<160;i++){ if(i>=uN) break; float fi=float(i)+0.5; float r=sqrt(fi/float(uN)); float a=fi*ga; vec2 p=vec2(cos(a),sin(a))*r;
    vec2 off=p*uR*asp; vec2 siu=iu+off; float cs=coc(siu); float cmax=max(cs,min(c0,cs+0.15));
    float reach=smoothstep(r-0.12,r,cmax*1.02); float w=reach*shapeW(p,iu); vec3 q=texture(uTex,vUv+off/uXf.zw).rgb; float L=dot(q,vec3(0.2126,0.7152,0.0722));
    w*=1.+uHB*8.*pow(clamp(L,0.,1.),5.)*cs; acc+=q*w; wsum+=w; }
  vec3 b=wsum>0.?acc/wsum:c; o=vec4(mix(c,b,smoothstep(0.,0.12,c0)),1.); }`;
const FS_LOCAL = HDR + `
uniform sampler2D uTex, uMask, uBlur; uniform vec4 uXf; uniform vec2 uPx; uniform float uScale;
uniform float uExp,uCon,uHi,uSh,uTemp,uTint,uSat,uClar,uSharp,uNoise;
vec3 setL(vec3 c, float L, float nL){ vec3 a=c*(nL/max(L,1e-4)); vec3 b=c+(nL-L); return mix(b,a,smoothstep(0.,0.08,L)); }
void main(){
  vec2 iu=uXf.xy+vUv*uXf.zw; vec3 c0=texture(uTex,vUv).rgb; float m=texture(uMask,iu).a;
  if(m<0.002){ o=vec4(c0,1.); return; }
  vec3 c=c0;
  // noise (+ smooths edge-aware, - adds nothing) / sharpness
  if(uNoise>0.||uSharp!=0.){ float ws=1., l0=luma(c0); vec3 acc=c0; float sig=mix(0.02,0.12,uNoise/100.);
    for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++){ if(i==0&&j==0) continue; vec3 q=texture(uTex,vUv+vec2(i,j)*uPx*max(uScale,0.5)).rgb; float dl=luma(q)-l0; float w=exp(-float(i*i+j*j)/4.5)*exp(-dl*dl/(sig*sig)); acc+=w*q; ws+=w; }
    vec3 sm=acc/ws;
    if(uNoise>0.) c=mix(c,sm,uNoise/100.);
    if(uSharp>0.){ float L=luma(c); c=setL(c,L,max(L+(l0-luma(sm))*uSharp/100.*2.0,0.)); }
    else if(uSharp<0.) c=mix(c,sm,-uSharp/100.); }
  vec3 wb=vec3(exp(uTemp*0.0045+uTint*0.0012), exp(-uTint*0.0035), exp(-uTemp*0.0055+uTint*0.0012));
  c=l2s(s2l(c)*wb*exp2(uExp));
  float L=luma(c), Lb=luma(texture(uBlur,iu).rgb), nL=L;
  if(uClar!=0.){ float mid=clamp(4.*L*(1.-L),0.,1.); nL+= (L-Lb)*uClar/100.*1.2*(0.35+0.65*mid); }
  float mm=mix(L,Lb,0.5);
  nL += uHi/100.*0.42*smoothstep(0.35,1.,mm)*(uHi<0.? nL : (1.-min(nL,1.)));
  nL += uSh/100.*0.45*(1.-smoothstep(0.,0.6,mm))*(uSh>0.? (1.-nL) : nL);
  if(uCon!=0.){ float k=exp(uCon/100.*0.95); float x=clamp(nL,0.,1.); nL= x<0.5 ? 0.5*pow(2.*x,k) : 1.-0.5*pow(max(2.-2.*x,0.),k); }
  c=setL(c,L,max(nL,0.));
  c=mix(vec3(luma(c)),c,1.+uSat/100.);
  o=vec4(mix(c0,clamp(c,0.,1.),m),1.);
}`;

const FS_RAW = HDR + `
uniform sampler2D uRaw, uCurve; uniform vec4 uXf; uniform mat3 uM; uniform vec3 uWB; uniform float uBase, uClip, uProf;
vec3 curve(vec3 e){ vec3 r; for(int i=0;i<3;i++){ float x=e[i]; r[i]= x<=1. ? texture(uCurve,vec2(x*255./256.+0.5/256.,0.5)).r : texture(uCurve,vec2(255.5/256.,0.5)).r+(x-1.)*0.45; } return r; }
void main(){
  vec2 iu=uXf.xy+vUv*uXf.zw; vec3 cam=texture(uRaw,iu).rgb;
  float clipm=smoothstep(uClip*0.9, uClip*0.995, max(cam.r,max(cam.g,cam.b)));
  cam*=uWB;
  vec3 lin=max(uM*cam,0.)*exp2(uBase);
  // highlight reconstruction: clipped areas rebuilt as neutral with the brightest channel's energy
  float Y=dot(lin,vec3(0.2126,0.7152,0.0722)); float mx=max(lin.r,max(lin.g,lin.b));
  lin=mix(lin, vec3(mix(Y,mx,0.6)), clipm);
  vec3 e=l2s(lin);
  if(uProf<0.5) e=curve(e);                      // standard
  else if(uProf<1.5){ e=curve(e); float l=luma(e); e=max(mix(vec3(l),e,1.18),0.); } // vivid
  // uProf>=1.5: linear/flat
  o=vec4(e,1.);
}`;
const FS_DEV = HDR + `
uniform sampler2D uTex, uBlur, uLut; uniform vec2 uPx; uniform float uScale; uniform vec4 uXf; uniform float uLV,uLVM; uniform vec2 uFull;
uniform float uTemp,uTint,uExp,uCon,uHi,uSh,uWh,uBl,uTexA,uClar,uDehaze,uVib,uSat;
uniform float uHH[8],uHS[8],uHL[8];
uniform float uBW; uniform float uBWMix[8];
uniform float uSTHi,uSTMid,uSTSh,uSTBlk;
uniform vec3 uGS,uGM,uGH,uGG; // hue(0-360), sat(0-100), lum(-100..100)
uniform float uGBlend,uGBal;
uniform float uShAmt,uShRad,uShDet,uShMask,uShNoise; uniform int uShVis;
vec3 hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)),d/(q.x+1e-10),q.x); }
vec3 rgbh(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
vec3 hueCol(float h){ return rgbh(vec3(h/360.,1.,1.)); }
vec3 setL(vec3 c, float L, float nL){ vec3 a=c*(nL/max(L,1e-4)); vec3 b=c+(nL-L); return mix(b,a,smoothstep(0.,0.08,L)); }
vec3 dev(vec3 c, vec4 bl){
  // white balance + exposure in linear light
  vec3 wb = vec3(exp(uTemp*0.0045+uTint*0.0012), exp(-uTint*0.0035), exp(-uTemp*0.0055+uTint*0.0012));
  float e = exp2(uExp);
  vec2 iu=uXf.xy+vUv*uXf.zw; float rr=length((iu-0.5)*uFull)/(0.5*length(uFull));
  float lg = 1.+uLV/100.*1.6*pow(rr, mix(1.5,4.5,uLVM/100.));
  vec3 lin = s2l(c)*wb*e*lg; vec3 blin = s2l(bl.rgb)*wb*e*lg;
  c = l2s(lin); vec3 cb = l2s(blin);
  float L = luma(c); float Lb = luma(cb);
  // dehaze (dark-channel style using blurred min channel)
  if(uDehaze!=0.){ float d=uDehaze/100.; float dark=l2s(vec3(bl.a*e)).r;
    if(d>0.){ float t=clamp(d*0.85*dark,0.,0.9); c=(c-t)/(1.-t); c=mix(vec3(luma(c)),c,1.+d*0.25); }
    else { c=mix(c, vec3(0.75), -d*0.45*(0.5+0.5*(1.-L))); }
    L=luma(c); }
  // texture (fine) and clarity (large local contrast)
  if(uTexA!=0.){ float m=0.; for(int i=0;i<8;i++){ float an=float(i)*0.785398; m+=luma(l2s(s2l(texture(uTex,vUv+vec2(cos(an),sin(an))*uPx*3.*uScale).rgb)*wb*e)); } m/=8.;
    L = luma(c); c=setL(c,L,max(L+(L-m)*uTexA/100.*1.4,0.)); }
  if(uClar!=0.){ L=luma(c); float mid=clamp(4.*L*(1.-L),0.,1.); float det=L-Lb; c=setL(c,L,max(L+det*uClar/100.*1.2*(0.35+0.65*mid),0.)); }
  // highlights / shadows with local masks (halo-reduced)
  L=luma(c); float m = mix(L,Lb,0.55);
  float nL=L;
  float hm=smoothstep(0.35,1.0,m); float sm=1.-smoothstep(0.0,0.6,m);
  nL += uHi/100.*0.42*hm*(uHi<0.? nL : (1.-min(nL,1.)));
  nL += uSh/100.*0.45*sm*(uSh>0.? (1.-nL)*smoothstep(-0.02,0.25,nL+0.05) : nL);
  // whites / blacks (levels)
  float wp = 1.-uWh/100.*0.3; float bp = -uBl/100.*0.12;
  nL = (nL-bp)/(wp-bp);
  // DxO Selective Tone (luminance-weighted bands; independent of Basic Highlights/Shadows)
  if(uSTHi!=0.||uSTMid!=0.||uSTSh!=0.||uSTBlk!=0.){
    float x=clamp(nL,0.,1.5);
    float whi=smoothstep(0.55,0.95,x);
    float wmid=exp(-pow((clamp(x,0.,1.)-0.5)/0.22,2.));
    float wsh=1.-smoothstep(0.08,0.5,x);
    float wblk=1.-smoothstep(0.,0.18,x);
    nL += uSTHi/100.*0.38*whi*(uSTHi<0.? clamp(x,0.,1.) : (1.-min(x,1.)));
    nL += uSTMid/100.*0.30*wmid;
    nL += uSTSh/100.*0.40*wsh*(uSTSh>0.? (1.-clamp(x,0.,1.)) : clamp(x,0.,1.));
    nL += uSTBlk/100.*0.28*wblk;
  }
  // contrast S-curve around mid-grey
  if(uCon!=0.){ float k=exp(uCon/100.*0.95); float x=clamp(nL,0.,1.5); float y= x<0.5 ? 0.5*pow(2.*x,k) : 1.-0.5*pow(max(2.-2.*x,0.),k); nL = x>1.? y+(x-1.) : y; }
  c = setL(c,L,nL);
  // soft highlight roll-off
  vec3 kk=vec3(0.88); c = mix(c, kk+(1.-kk)*(1.-exp(-(c-kk)/(1.-kk))), step(kk,c));
  c=clamp(c,0.,1.);
  // tone curve LUT (master baked into per channel)
  c = vec3(texture(uLut,vec2(c.r*255./256.+0.5/256.,0.5)).r, texture(uLut,vec2(c.g*255./256.+0.5/256.,0.5)).g, texture(uLut,vec2(c.b*255./256.+0.5/256.,0.5)).b);
  // HSL mixer
  vec3 h=hsv(c); float H=h.x*360.;
  float cen[8]=float[](0.,30.,60.,120.,180.,240.,280.,320.);
  float dh=0., ds=0., dl=0., tw=0.;
  for(int i=0;i<8;i++){ float d=abs(H-cen[i]); d=min(d,360.-d); float wd = i==3||i==4 ? 55. : (i==0||i==1||i==2? 30.:42.); float w=max(0.,1.-d/wd); w=w*w*(3.-2.*w); dh+=w*uHH[i]; ds+=w*uHS[i]; dl+=w*uHL[i]; tw+=w; }
  if(tw>0.){ dh/=max(tw,1.); ds/=max(tw,1.); dl/=max(tw,1.); }
  float satw = smoothstep(0.02,0.25,h.y);
  h.x = fract(h.x + dh/100.*30./360.*satw);
  h.y = clamp(h.y*(1.+ds/100.*satw),0.,1.);
  vec3 c2 = rgbh(h); float Lc=luma(c2); c = setL(c2, Lc, max(Lc*(1.+dl/100.*0.6*satw),0.));
  // B&W mixer (mono conversion with per-hue luminance weights; grading can still tint)
  if(uBW>0.5){ float Hb=hsv(c).x*360.; float bm=0., twb=0.;
    for(int i=0;i<8;i++){ float d=abs(Hb-cen[i]); d=min(d,360.-d); float wd = i==3||i==4 ? 55. : (i==0||i==1||i==2? 30.:42.); float w=max(0.,1.-d/wd); w=w*w*(3.-2.*w); bm+=w*uBWMix[i]; twb+=w; }
    if(twb>0.) bm/=twb; float Lw=luma(c)*(1.+bm/100.*0.85); c=vec3(clamp(Lw,0.,1.)); }
  // colour grading
  L=luma(c); float bal=uGBal/100.*0.25; float bw=mix(0.12,0.4,uGBlend/100.);
  float ws=1.-smoothstep(0.25+bal-bw,0.25+bal+bw+0.15,L); float wh=smoothstep(0.75+bal-bw-0.15,0.75+bal+bw,L); float wm=clamp(1.-ws-wh,0.,1.);
  vec3 tint = ws*(hueCol(uGS.x)-0.5)*uGS.y/100. + wm*(hueCol(uGM.x)-0.5)*uGM.y/100. + wh*(hueCol(uGH.x)-0.5)*uGH.y/100. + (hueCol(uGG.x)-0.5)*uGG.y/100.;
  c += tint*0.35; c = setL(c, luma(c), max(luma(c)+(ws*uGS.z+wm*uGM.z+wh*uGH.z+uGG.z)/100.*0.15,0.));
  // vibrance & saturation
  L=luma(c); float sat = (max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b)));
  float skin = 1.-0.5*smoothstep(0.,1.,1.-abs(hsv(c).x*360.-25.)/25.);
  float vb = uVib/100.*(1.-sat)*(uVib>0.?skin:1.);
  c = mix(vec3(L), c, 1.+vb+uSat/100.);
  return clamp(c,0.,1.);
}
void main(){
  vec3 c = dev(texture(uTex,vUv).rgb, texture(uBlur,uXf.xy+vUv*uXf.zw));
  // sharpening (unsharp mask on luminance, edge masking); uShVis=1 shows the edge mask (Alt-drag Masking/Amount)
  if(uShAmt>0. || uShVis>0){ vec2 r=uPx*max(uShRad,0.5)*uScale; vec3 s=texture(uTex,vUv).rgb;
    float l0=luma(s); float acc=0.; float ed=0.;
    vec2 off[8]=vec2[](vec2(1,0),vec2(-1,0),vec2(0,1),vec2(0,-1),vec2(.7,.7),vec2(-.7,.7),vec2(.7,-.7),vec2(-.7,-.7));
    for(int i=0;i<8;i++){ float li=luma(texture(uTex,vUv+off[i]*r).rgb); acc+=li; ed=max(ed,abs(li-l0)); }
    float det=l0-acc/8.;
    det = sign(det)*max(abs(det)-(0.004+uShNoise)*(1.-uShDet/100.*0.7),0.)*(0.6+uShDet/100.*0.8);
    float mask=smoothstep(uShMask/100.*0.12, uShMask/100.*0.12+0.02, ed);
    if(uShVis>0){ float v=clamp(mask,0.,1.); o=vec4(vec3(v),1.); return; }
    float Lc=luma(c); c=clamp(setL(c,Lc,max(Lc+det*uShAmt/150.*2.5*mask,0.)),0.,1.);
  }
  o=vec4(c,1.);
}`;

const FS_FIN = HDR + `
uniform sampler2D uTex, uOv; uniform vec4 uCrop, uView, uSrc; uniform float uAngle,uPV,uPH,uDist,uPS,uOvOn,uVol,uVolF,uVolK,uTR,uTA; uniform vec2 uTO; uniform int uVolM; uniform int uOrient; uniform bool uFlipH, uFlipY;
uniform vec2 uRotSize; uniform vec2 uOutFull;
uniform float uVA,uVM,uVR,uVF,uVS,uVH,uGA,uGSz,uGR; uniform float uSeed; uniform float uFB,uLL,uLLp,uTx,uFrW; uniform vec3 uLLc; uniform int uFrS, uProof; uniform float uProofW;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32+uSeed); return fract(p.x*p.y); }
vec2 vol(vec2 n){ if(uVol==0.) return n; n*=uVolK; float f=uVolF;
  if(uVolM==0){ float r=length(n); if(r<1e-6) return n; float th=2.*atan(r/(2.*f)); float rs=f*tan(min(th,1.45)); return n*mix(1.,rs/r,uVol); }
  if(uVolM==1){ float th=n.x/f; return mix(n,vec2(f*tan(clamp(th,-1.45,1.45)),n.y/cos(clamp(th,-1.45,1.45))),uVol); }
  float th=n.y/f; return mix(n,vec2(n.x/cos(clamp(th,-1.45,1.45)),f*tan(clamp(th,-1.45,1.45))),uVol); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
vec2 geom(vec2 q){
  vec2 R=uRotSize; vec2 pc=(q-0.5)*R; float ca=cos(uAngle), sa=sin(uAngle);
  vec2 r=vec2(ca*pc.x-sa*pc.y, sa*pc.x+ca*pc.y); float hm=0.5*max(R.x,R.y); vec2 n=vol(r/hm/uPS);
  n-=uTO; if(uTR!=0.){ float cr=cos(uTR), sr=sin(uTR); n=vec2(cr*n.x-sr*n.y, sr*n.x+cr*n.y); } if(uTA!=0.){ float ka=exp(uTA*0.3); n=vec2(n.x*ka, n.y/ka); }
  float w=1.+uPV*n.y+uPH*n.x; n/=w; n*=1.+uDist*dot(n,n);
  vec2 s=n*hm/R+0.5; if(uFlipH) s.x=1.-s.x;
  vec2 t=s; if(uOrient==1) t=vec2(s.y,1.-s.x); else if(uOrient==2) t=vec2(1.-s.x,1.-s.y); else if(uOrient==3) t=vec2(1.-s.y,s.x);
  return t; }
void main(){
  vec2 uv=vUv; if(uFlipY) uv.y=1.-uv.y;
  vec2 f = uView.xy + uv*uView.zw;
  if(any(lessThan(f,vec2(0.)))||any(greaterThan(f,vec2(1.)))){ o=vec4(0.082,0.082,0.082,1.); return; }
  vec2 t = geom(uCrop.xy + f*uCrop.zw);
  vec3 c = texture(uTex,(t-uSrc.xy)/uSrc.zw).rgb;
  if(uFB>0.){ float rd=length((f-0.5)*vec2(uOutFull.x/uOutFull.y,1.))/0.6; float br=uFB/100.*0.012*smoothstep(0.35,1.1,rd); if(br>0.0004){ vec3 acc=c; for(int k=0;k<12;k++){ float an=float(k)*0.5236; float rr=br*(0.5+0.5*float(k%2)); acc+=texture(uTex,(t+vec2(cos(an),sin(an))*rr*vec2(1.,uOutFull.x/uOutFull.y)-uSrc.xy)/uSrc.zw).rgb; } c=acc/13.; } }
  if(any(lessThan(t,vec2(0.)))||any(greaterThan(t,vec2(1.)))) c=vec3(0.06);
  if(uVA!=0.){ vec2 p=(f-0.5)*2.; float asp=uOutFull.x/uOutFull.y; vec2 sc = asp>1. ? vec2(asp,1.) : vec2(1.,1./asp);
    float r=length(p*mix(vec2(1.), sc/max(sc.x,sc.y), 1.-(uVR+100.)/200.));
    float inner=mix(0.25,1.25,uVM/100.); float fe=smoothstep(inner, inner+mix(0.08,1.2,uVF/100.), r);
    float a=uVA/100.;
    if(uVS>1.5){ c = a<0. ? mix(c, vec3(0.), -a*fe*0.92) : mix(c, vec3(1.), a*fe*0.9); }
    else if(a<0.){ vec3 d;
      if(uVS>0.5){ float L0=luma(c); d=max(c+(L0*(1.+a*fe*0.95)-L0), vec3(0.)); }
      else d=c*(1.+a*fe*0.95);
      float hp=smoothstep(0.45,1.,max(c.r,max(c.g,c.b)))*uVH/100.; c=mix(d,c,hp*0.9); }
    else c=mix(c, vec3(1.), a*fe*0.9); }
  if(uGA>0.){ vec2 gp = f*uOutFull/mix(0.8,4.,uGSz/100.);
    float n = mix(vnoise(gp), hash(floor(gp)), uGR/100.*0.6) + mix(vnoise(gp*1.9+7.),0.5,0.4) - 1.;
    float L=luma(c); c += n*uGA/100.*0.22*(0.4+0.6*4.*L*(1.-L)+0.2); }
  if(uLL>0.){ vec2 lp = uLLp<0.5?vec2(-0.15,0.2):uLLp<1.5?vec2(1.15,0.25):uLLp<2.5?vec2(0.3,-0.15):vec2(0.75,1.15); vec2 dd=(f-lp)*vec2(uOutFull.x/uOutFull.y,1.);
    float w=exp(-dot(dd,dd)/0.18)*(0.8+0.2*vnoise(f*6.+uSeed)); c=1.-(1.-c)*(1.-uLLc*w*uLL/100.); }
  if(uTx>0.){ vec2 px=f*uOutFull; float a=uTx/100.; float mott=vnoise(px/180.)-0.5; c*=1.+mott*0.12*a; float sp=hash(floor(px/2.5)); if(sp>1.-0.0009*a) c=mix(c,vec3(hash(floor(px/2.5)+3.)>0.5?0.95:0.05),0.85);
    float sx=hash(vec2(floor(f.x*uOutFull.x/1.5),7.)); if(sx>1.-0.0015*a) c=mix(c,vec3(0.9),0.45*smoothstep(0.2,0.8,vnoise(vec2(f.y*8.,sx*9.)))); }
  if(uFrS>0){ vec2 P=f*uOutFull; float m=min(uOutFull.x,uOutFull.y); float bw=uFrW/100.*0.12*m; vec2 e=min(P,uOutFull-P);
    if(uFrS==1&&min(e.x,e.y)<bw) c=vec3(0.97);
    else if(uFrS==2&&min(e.x,e.y)<bw) c=vec3(0.02);
    else if(uFrS==3){ float bb=bw*1.6; if(e.y<bb||e.x<bw*0.5){ c=vec3(0.03); if(e.y<bb&&e.y>bb*0.25&&e.y<bb*0.65&&mod(P.x,bb*0.9)<bb*0.5) c=vec3(0.85,0.82,0.75); } }
    else if(uFrS==4){ if(e.x<bw||P.y<bw||uOutFull.y-P.y<bw*3.2) c=vec3(0.95,0.94,0.9); }
    else if(uFrS==5){ float r=bw*2.; vec2 q=max(vec2(r)-e,0.); if(length(q)>r) c=vec3(0.08); } }
  if(uProof>0){ float L=luma(c); float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)); float ch=mx-mn;
    float lim = uProof==4 ? 0.70*(1.-pow(abs(2.*L-1.),2.)*0.55)
             : uProof==5 ? 0.90*(1.-pow(abs(2.*L-1.),2.)*0.45)
             : uProof==6 ? 0.80*(1.-pow(abs(2.*L-1.),2.)*0.5)
             : (uProof==3?0.55:uProof==2?0.68:0.78)*(1.-pow(abs(2.*L-1.),2.)*0.6);
    bool oog=ch>lim; if(oog){ c=mix(vec3(L),c,lim/ch); }
    if(uProof<=3){ vec3 pw=uProof==3?vec3(0.93,0.92,0.88):uProof==2?vec3(0.95,0.94,0.91):vec3(0.97,0.965,0.95); float pb=uProof==3?0.16:uProof==2?0.1:0.05; c=pb+c*(pw-pb); }
    else if(uProof==5){ c=mix(vec3(L),c,1.08); c=clamp(c,0.,1.); float ch2=max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b)); if(ch2>lim) c=mix(vec3(luma(c)),c,lim/max(ch2,1e-4)); }
    else if(uProof==6){ c=vec3(c.r*0.98, mix(c.g, (c.g+c.b)*0.5, 0.04), c.b*0.99); c=0.02+c*0.96; }
    if(oog&&uProofW>0.) c=mix(c,vec3(0.2,0.9,0.95),0.7); }
  if(uOvOn>0.){ float m=texture(uOv,t).a; c=mix(c,vec3(1.,0.15,0.2),0.55*m); }
  o=vec4(clamp(c,0.,1.),1.);
}`;

// DxO-style optics / lighting / contrast / U-Point / colour wheel / film pass
const FS_DXO = HDR + `
uniform sampler2D uTex, uBlur, uSrc; uniform vec4 uXf; uniform vec2 uPx, uFull; uniform float uScale;
uniform float uFCH, uFCS; uniform sampler2D uBrush; uniform float uSL, uCV, uMC, uFC, uCAr, uCAb, uFr, uFrG, uFrPW, uFrGW, uLS; uniform vec3 uAir;
uniform int uNRE; uniform vec4 uRE[8];
uniform int uNF; uniform vec4 uFace[4]; uniform float uFaceG[4];
uniform vec4 uCW; uniform vec3 uCWd;
uniform int uNP; uniform vec4 uPA[8], uPB[8], uPC[8], uPD[8];
uniform float uMo, uLSh, uLSc, uLSb, uPSC, uROn, uRC, uHCOn; uniform mat3 uRM; uniform sampler2D uHC;
uniform int uNPC; uniform vec4 uPCo[4], uPCd[4]; uniform mat3 uCal; uniform float uCalOn;
uniform mat3 uFM; uniform vec4 uFT; uniform vec3 uFSh, uFHi; uniform float uFBW, uFOn;
vec2 T(vec2 iu){ return (iu-uXf.xy)/uXf.zw; }
vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d=q.x-min(q.w,q.y); return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)), d/(q.x+1e-10), q.x); }
vec3 hsv2rgb(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
vec3 setL(vec3 c, float L, float nL){ vec3 a=c*(nL/max(L,1e-4)); vec3 b=c+(nL-L); return mix(b,a,smoothstep(0.,0.08,L)); }
float scurve(float x, float k){ x=clamp(x,0.,1.); return x<0.5 ? 0.5*pow(2.*x,k) : 1.-0.5*pow(max(2.-2.*x,0.),k); }
void main(){
  vec2 iu=uXf.xy+vUv*uXf.zw; vec3 c=texture(uTex,vUv).rgb; vec2 dc=iu-0.5;
  float rr=length(dc*uFull)/(0.5*length(uFull));
  // lateral chromatic aberration (radial channel scale)
  if(uCAr!=0.||uCAb!=0.){ c.r=texture(uTex,T(0.5+dc*(1.+uCAr))).r; c.b=texture(uTex,T(0.5+dc*(1.+uCAb))).b; }
  float pr=max(uScale,0.6);
  vec3 n1=texture(uTex,vUv+vec2(pr,0)*uPx).rgb, n2=texture(uTex,vUv-vec2(pr,0)*uPx).rgb, n3=texture(uTex,vUv+vec2(0,pr)*uPx).rgb, n4=texture(uTex,vUv-vec2(0,pr)*uPx).rgb;
  // Moire removal: replace high-frequency false colour with the local mean chroma
  if(uMo>0.){ float R=max(4.,16.*uScale); vec3 acc=vec3(0.); float Lm=luma(c); float tex=0.;
    for(int k=0;k<8;k++){ float an=float(k)*0.7854; tex+=abs(luma(texture(uTex,vUv+vec2(cos(an),sin(an))*1.5*max(uScale,0.7)*uPx).rgb)-Lm); } tex/=8.;
    for(int k=0;k<16;k++){ float an=float(k)*0.3927+0.2; vec3 q=texture(uTex,vUv+vec2(cos(an),sin(an))*R*(k%2==0?1.:0.5)*uPx).rgb; acc+=q-vec3(luma(q)); }
    acc/=16.; vec3 ch=c-vec3(Lm); float gate=smoothstep(0.015,0.06,tex); float w=uMo/100.*gate; c=vec3(Lm)+mix(ch,acc*(1.-0.5*w),w); }
  // purple / green fringing (longitudinal CA) near strong edges — dual amounts + hue ranges
  if(uFr>0.||uFrG>0.){ float e=max(abs(luma(n1)-luma(n2)),abs(luma(n3)-luma(n4))); vec3 h=rgb2hsv(c); float hd=h.x*360.;
    float pr=max(uFrPW,8.), gr=max(uFrGW,6.);
    float pur=smoothstep(pr,pr*0.35,min(abs(hd-285.),min(abs(hd-300.),abs(hd-270.))));
    float gre=smoothstep(gr,gr*0.35,abs(hd-120.));
    float edge=smoothstep(0.04,0.18,e)*smoothstep(0.08,0.25,h.y);
    float w=max(pur*uFr/100.,gre*uFrG/100.)*edge;
    c=mix(c,vec3(luma(c)),clamp(w*1.25,0.,1.)); }
  // Red-eye correction (desaturate + darken reddish pupils inside pins)
  for(int i=0;i<8;i++){ if(i>=uNRE) break; vec4 re=uRE[i]; vec2 asp=vec2(uFull.x/uFull.y,1.);
    vec2 d=(iu-re.xy)*asp; float rr=length(d)/max(re.z,1e-4); float mask=1.-smoothstep(0.5,1.05,rr);
    if(mask<0.01) continue; vec3 hv=rgb2hsv(clamp(c,0.,1.)); float hd=hv.x*360.;
    float red=smoothstep(42.,14.,min(abs(hd),min(abs(hd-360.),abs(hd-20.))))*smoothstep(0.12,0.4,hv.y)*smoothstep(0.1,0.55,hv.z);
    float w=mask*max(red,0.15)*re.w; if(w<0.02) continue;
    float nL=hv.z*(1.-0.58*w); c=mix(c,vec3(nL),clamp(w*0.92,0.,1.)); }
  float L0=luma(c); float Lb=luma(texture(uBlur,iu).rgb);
  // ClearView Plus: dark-channel dehaze + local contrast
  if(uCV>0.){ float a=uCV/100.; vec3 bl=texture(uBlur,iu).rgb; float dcb=min(min(bl.r,bl.g),bl.b);
    vec3 Al=s2l(uAir); float dk=s2l(vec3(dcb)).x/max(max(Al.r,max(Al.g,Al.b)),1e-3);
    float t=max(1.-0.92*a*dk,0.18); vec3 cl=s2l(c); cl=(cl-Al)/t+Al; c=l2s(max(cl,0.));
    float L=luma(c); c=setL(c,L,max(L+(L-luma(l2s(max((s2l(bl)-Al)/t+Al,0.))))*a*0.45*(1.-L),0.)); c=mix(vec3(luma(c)),c,1.+0.15*a); }
  // Smart Lighting: edge-aware local exposure (shadow lift + highlight compression), face-weighted
  if(uSL>0.||uNF>0){ float a=uSL/100.; float L=luma(c); float lb=mix(Lb,L,smoothstep(0.06,0.3,abs(L-Lb)));
    float g=pow(max(lb,1e-4),1.-0.62*a); g-=a*0.6*smoothstep(0.5,1.,g)*(g-0.5); float gain=clamp(g/max(lb,1e-3),0.6,4.);
    for(int i=0;i<4;i++){ if(i>=uNF) break; vec2 d=(iu-uFace[i].xy)/uFace[i].zw; float w=exp(-dot(d,d)*0.9); gain*=exp2(uFaceG[i]*(0.45+0.55*w)); }
    float nL=L*gain; nL=nL/(1.+max(nL-1.,0.)); c=setL(c,L,nL); }
  // Microcontrast (+ lens softness, stronger toward the corners) and Fine contrast (mid-frequency)
  float mc=uMC/100.*1.6 + uLS/100.*(0.4+1.6*rr*rr);
  if(mc!=0.||uFC!=0.||uFCH!=0.||uFCS!=0.){ float L=luma(c); float avg=(luma(n1)+luma(n2)+luma(n3)+luma(n4))*0.25; float nL=L+(L0-avg)*mc*(0.3+0.7*clamp(4.*L*(1.-L),0.,1.));
    if(uFC!=0.||uFCH!=0.||uFCS!=0.){ float R=max(3.,10.*uScale); float m=0.; for(int k=0;k<8;k++){ float an=float(k)*0.785398; m+=luma(texture(uTex,vUv+vec2(cos(an),sin(an))*R*uPx).rgb); } m/=8.;
      nL+=(L0-m)*0.9/100.*(uFC*(0.25+0.75*clamp(4.*L*(1.-L),0.,1.))+uFCH*smoothstep(0.45,0.9,L)+uFCS*(1.-smoothstep(0.08,0.5,L))); }
    c=setL(c,L,max(nL,0.)); }
  // Lens sharpness: two-scale deblur, stronger toward the corners (profile), bokeh-protected by a detail gate
  if(uLSh>0.){ float L=luma(c); float a1=(luma(n1)+luma(n2)+luma(n3)+luma(n4))*.25; float R2=max(2.,2.5*uScale); float a2=0.;
    for(int k=0;k<6;k++){ float an=float(k)*1.0472+0.3; a2+=luma(texture(uTex,vUv+vec2(cos(an),sin(an))*R2*uPx).rgb); } a2/=6.;
    float d1=L0-a1, d2=L0-a2; float g=abs(d1)+abs(d2); float th=uLSb/100.*0.04; float gate=smoothstep(th,th+0.012,g);
    float amt=uLSh/100.*(1.+uLSc*rr*rr)*gate; float nL=L+amt*(1.5*d1+0.7*d2); nL=clamp(nL,L-0.1,L+0.1); c=setL(c,L,max(nL,0.)); }
  // U Point control points / control lines (colour-selective)
  vec3 sp=texture(uSrc,vUv).rgb;
  float prot=0.;
  for(int pass=0;pass<2;pass++) for(int i=0;i<8;i++){ if(i>=uNP) break; vec4 A=uPA[i], B=uPB[i], C=uPC[i], D=uPD[i]; float ws; float kind=C.w;
    if((pass==0)!=(kind>1.5&&kind<2.5)) continue;
    vec2 asp=vec2(uFull.x/uFull.y,1.);
    if(kind<0.5||(kind>1.5&&kind<2.5)){ vec2 d=(iu-A.xy)*asp; float ca=cos(D.y), sa=sin(D.y); d=vec2(ca*d.x+sa*d.y,-sa*d.x+ca*d.y); d.y*=max(D.x,0.05); float r=length(d)/max(A.z,1e-3); ws=1.-smoothstep(0.35,1.,r); }
    else if(kind<1.5){ vec2 a0=A.xy*asp, a1=D.xy*asp; vec2 ab=a1-a0; float t=dot(iu*asp-a0,ab)/max(dot(ab,ab),1e-6); ws=1.-smoothstep(0.,1.,t); }
    else { vec4 bm=texture(uBrush,iu); ws= D.x<0.5?bm.r:D.x<1.5?bm.g:D.x<2.5?bm.b:bm.a; }
    vec3 dv=(sp-C.rgb); float cd=sqrt(dot(dv*vec3(1.1,1.3,0.8),dv))+abs(luma(sp)-luma(C.rgb))*0.6; float sig=mix(0.9,0.07,A.w/100.); float wc=exp(-cd*cd/(sig*sig));
    if(pass==0){ prot=max(prot,ws*wc); continue; }
    float w=ws*wc*(1.-prot); if(w<0.003) continue;
    vec3 x=l2s(s2l(c)*exp2(B.x)*vec3(exp(B.w*0.004),1.,exp(-B.w*0.005))); float L=luma(x); float nL=L;
    if(B.y!=0.) nL=scurve(nL,exp(B.y/100.*0.95)); if(D.z!=0.) nL+=(L0-luma((n1+n2+n3+n4)*0.25))*D.z/100.*2.;
    x=setL(x,L,max(nL,0.)); x=mix(vec3(luma(x)),x,1.+B.z/100.); c=mix(c,max(x,0.),w); }
  // Colour wheel (selective hue)
  if(uCW.w>0.){ vec3 h=rgb2hsv(clamp(c,0.,1.)); float d=abs(fract(h.x-uCW.x+0.5)-0.5)*360.; float w=1.-smoothstep(uCW.y,uCW.y+uCW.z+0.01,d); w*=smoothstep(0.02,0.12,h.y);
    if(w>0.){ vec3 n=vec3(fract(h.x+uCWd.x/360.*w), clamp(h.y*(1.+uCWd.y/100.*w),0.,1.), h.z); vec3 r=hsv2rgb(n); float L=luma(r); r=setL(r,L,max(L+uCWd.z/100.*0.35*w,0.)); c=r; } }
  // Calibration (primary hue/saturation)
  if(uCalOn>0.) c=max(uCal*c,0.);
  // Point Color (Lightroom): up to 4 sampled colours with hue/sat/lum shifts
  for(int i=0;i<4;i++){ if(i>=uNPC) break; vec4 P=uPCo[i], Q=uPCd[i]; vec3 h=rgb2hsv(clamp(c,0.,1.)); float dh=abs(fract(h.x-P.x+0.5)-0.5);
    float rg=P.w; float w=exp(-dh*dh/(rg*rg*0.012))*exp(-pow(h.y-P.y,2.)/(0.18+rg*0.4))*exp(-pow(h.z-P.z,2.)/(0.25+rg*0.5))*smoothstep(0.03,0.12,h.y);
    if(w<0.004) continue; float L1=luma(c); vec3 n=vec3(fract(h.x+Q.x/360.*w), clamp(h.y*(1.+Q.y/100.*w),0.,1.), h.z); vec3 r=hsv2rgb(n); float L=luma(r); r=setL(r,L,L1*exp2(Q.z/100.*1.2*w)); c=r; }
  // Colour rendering (camera / generic profiles)
  if(uROn>0.){ vec3 r=max(uRM*c,0.); float L=luma(r); r=setL(r,L,scurve(L,uRC)); c=mix(c,r,uROn); }
  // HSL curves: hue->hue, hue->sat, hue->lum, lum->sat
  if(uHCOn>0.){ vec3 h=rgb2hsv(clamp(c,0.,1.)); vec3 a=texture(uHC,vec2(h.x,0.25)).rgb; float ls=texture(uHC,vec2(clamp(luma(c),0.,1.),0.75)).r; float w=smoothstep(0.02,0.15,h.y);
    float L1=luma(c); h.x=fract(h.x+(a.r-0.5)*0.33*w); h.y=clamp(h.y*exp2((a.g-0.5)*2.*w)*exp2((ls-0.5)*2.),0.,1.); vec3 r=hsv2rgb(h); float L=luma(r); r=setL(r,L,L1*exp2((a.b-0.5)*1.6*w)); c=r; }
  // Film emulation
  if(uFOn>0.){ vec3 f=clamp(uFM*clamp(c,0.,1.),0.,1.); if(uFBW>0.) f=vec3(luma(f));
    float L=luma(f); float nL=scurve(L,uFT.x); nL=uFT.z+nL*(1.-uFT.z-uFT.w); f=setL(f,L,nL); L=nL;
    f+=uFSh*(1.-smoothstep(0.,0.5,L))+uFHi*smoothstep(0.5,1.,L); if(uFBW<0.5) f=mix(vec3(luma(f)),f,uFT.y);
    c=mix(c,clamp(f,0.,1.),uFOn); }
  // Protect saturated colours: compress out-of-gamut chroma toward luminance and roll off the most saturated tones
  if(uPSC>0.){ float L=clamp(luma(c),0.,1.); vec3 d=c-vec3(L); float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)); float k=1.;
    if(mx>1.) k=min(k,(1.-L)/max(mx-L,1e-4)); if(mn<0.) k=min(k,L/max(L-mn,1e-4)); float s=uPSC/100.;
    float sat=(max(mx,1e-4)-mn)/max(mx,1e-4); float roll=1.-s*0.22*smoothstep(0.6,1.,sat); c=vec3(L)+d*mix(1.,k,s)*roll; }
  o=vec4(clamp(c,0.,1.),1.);
}`;

function volMap(x,y,P){ if(!P.vol) return [x,y]; x*=P.vk; y*=P.vk; const f=P.vf, a=P.vol, C=v=>Math.max(-1.45,Math.min(1.45,v));
  if(P.vm===0){ const r=Math.hypot(x,y); if(r<1e-6) return [x,y]; const th=2*Math.atan(r/(2*f)); const k=1+a*(f*Math.tan(Math.min(th,1.45))/r-1); return [x*k,y*k]; }
  if(P.vm===1){ const th=C(x/f); return [x+a*(f*Math.tan(th)-x), y+a*(y/Math.cos(th)-y)]; }
  const th=C(y/f); return [x+a*(x/Math.cos(th)-x), y+a*(f*Math.tan(th)-y)]; }
// Geometry mapping shared by JS (mirrors FS_FIN geom())
function geomMap(qx,qy,s,Wr,Hr){
  const px=(qx-.5)*Wr, py=(qy-.5)*Hr, a=s.angle*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
  const rx=ca*px-sa*py, ry=sa*px+ca*py, hm=0.5*Math.max(Wr,Hr); const P=Engine.geomU(s,Wr,Hr);
  let nx=rx/hm/P.ps, ny=ry/hm/P.ps; [nx,ny]=volMap(nx,ny,P); nx-=P.ox; ny-=P.oy; if(P.tr){ const cr=Math.cos(P.tr), sr=Math.sin(P.tr); const tx=cr*nx-sr*ny; ny=sr*nx+cr*ny; nx=tx; } if(P.ta){ const ka=Math.exp(P.ta*0.3); nx*=ka; ny/=ka; } const w=1+P.pv*ny+P.ph*nx; nx/=w; ny/=w; const d=1+P.dist*(nx*nx+ny*ny); nx*=d; ny*=d;
  let sx=nx*hm/Wr+.5, sy=ny*hm/Hr+.5; if(s.flipH) sx=1-sx;
  switch(s.orient){ case 1: return [sy,1-sx]; case 2: return [1-sx,1-sy]; case 3: return [1-sy,sx]; default: return [sx,sy]; }
}
class Engine {
  constructor(canvas){
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2',{preserveDrawingBuffer:true, antialias:false, premultipliedAlpha:false});
    if(!gl) throw new Error('WebGL2 not supported');
    this.gl = gl; this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.floatRT = !!(gl.getExtension('EXT_color_buffer_float')||gl.getExtension('EXT_color_buffer_half_float'));
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    this.p = { heal:this.prog(FS_HEAL), down:this.prog(FS_DOWN), blur:this.prog(FS_BLUR), dev:this.prog(FS_DEV), raw:this.prog(FS_RAW), hp:this.prog(FS_HP), nlm:this.prog(FS_NLM), pdown:this.prog(FS_PDOWN), coarse:this.prog(FS_COARSE), rec:this.prog(FS_REC), local:this.prog(FS_LOCAL), dxo:this.prog(FS_DXO), lb:this.prog(FS_LB), fin:this.prog(FS_FIN) };
    this.lut = this.tex(256,1,null); this.lutKey='';
    this.blank = this.tex(1,1,null);
    this.maskTex = new Map(); this.maskSource = null;
    this.state = null; this.seed = Math.random()*10;
  }
  dataTex(name,b){ const gl=this.gl; this._dt=this._dt||{}; let e=this._dt[name]; if(e&&e.key===b.key) return e.tex; if(!e) e=this._dt[name]={tex:this.tex(1,1,null)};
    gl.bindTexture(gl.TEXTURE_2D,e.tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,b.w,b.h,0,gl.RGBA,gl.UNSIGNED_BYTE,b.data); e.key=b.key; return e.tex; }
  brushTex(b){ if(!b) return this.blank; const gl=this.gl; if(this._bt&&this._bt.key===b.key) return this._bt.tex; if(!this._bt) this._bt={tex:this.tex(1,1,null)};
    gl.bindTexture(gl.TEXTURE_2D,this._bt.tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,b.w,b.h,0,gl.RGBA,gl.UNSIGNED_BYTE,b.data); this._bt.key=b.key; return this._bt.tex; }
  static dxoU(s){ const F=(window.FILMS||{})[s.film]; const I=[1,0,0,0,1,0,0,0,1];
    const film=F&&s.film!=='none'?{m:F.m||I,t:[F.con||1,F.sat??1,F.fade||0,F.crush||0],sh:F.sh||[0,0,0],hi:F.hi||[0,0,0],bw:F.bw?1:0,on:(s.filmAmt??100)/100}:{m:I,t:[1,1,0,0],sh:[0,0,0],hi:[0,0,0],bw:0,on:0};
    const cw=s.cw||{}; const cwOn=cw.on&&(cw.dh||cw.ds||cw.dl)?1:0; const faces=(s.slFace!==false&&s.sl>0&&window.faceGains)?window.faceGains(s):[];
    const cps=(s.cps||[]).filter(q=>q.on!==false).slice(0,8);
    const brush=window.cpBrush?cpBrush(s):null; const R=(window.RENDERS||{})[s.rend]; const rend=R&&s.rend!=='none'?{m:R.m,c:R.con||1,on:(s.rendAmt??100)/100}:{m:[1,0,0,0,1,0,0,0,1],c:1,on:0}; const hc=window.hcData?hcData(s):null;
    const lsc=s.lshC??0.6; const pcs=(s.pcol||[]).filter(q=>q.on!==false).slice(0,4); const cal=window.calMatrix?calMatrix(s.cal):null; const reyes=(s.redEyes||[]).filter(q=>q&&q.r>0).slice(0,8);
    const D={rend,hc,mo:s.moire||0,lsh:s.lsharp||0,lsc,lsb:s.lshB??30,psc:s.psc||0,brush,fch:s.fcH||0,fcs:s.fcS||0,sl:s.sl||0,cv:s.cv||0,mc:s.mc||0,fc:s.fc||0,car:(s.caR||0)/1000,cab:(s.caB||0)/1000,fr:s.fringe||0,frG:s.fringeG||0,frPW:s.fringePR??40,frGW:s.fringeGR??30,ls:s.lsoft||0,air:s.air||[1,1,1],faces,cw:[(cw.h||0)/360,cw.range??25,cw.fall??25,cwOn],cwd:[cw.dh||0,cw.ds||0,cw.dl||0],cps,film,reyes};
    D.pcs=pcs; D.cal=cal; D.on=!!(pcs.length||cal||D.mo||D.lsh||D.psc||rend.on||hc||D.fch||D.fcs||D.sl||D.cv||D.mc||D.fc||D.car||D.cab||D.fr||D.frG||D.ls||cwOn||cps.length||film.on||reyes.length); D.key=JSON.stringify([pcs,cal,s.moire,s.lsharp,lsc,s.lshB,s.psc,s.rend,s.rendAmt,hc&&hc.key,brush&&brush.key,s.fcH,s.fcS,D.on,s.sl,s.cv,s.mc,s.fc,s.caR,s.caB,s.fringe,s.fringeG,s.fringePR,s.fringeGR,s.lsoft,s.air,faces,s.cw,cps,s.film,s.filmAmt,reyes]); return D; }
  static geomU(s,Wr=1,Hr=1){ const G={pv:(s.perspV||0)/100*0.45, ph:(s.perspH||0)/100*0.45, dist:-(s.distortion||0)/100*0.25, ps:(s.perspScale||100)/100, vol:(s.vol||0)/100, vm:({diag:0,horiz:1,vert:2})[s.volMode||'diag']||0, vf:(s.volF||24)/18, vk:1, tr:(s.perspRot||0)*Math.PI/180, ta:(s.perspAspect||0)/100, ox:(s.perspX||0)/100*0.5, oy:-(s.perspY||0)/100*0.5};
    if(G.vol){ const ex=Wr/Math.max(Wr,Hr), ey=Hr/Math.max(Wr,Hr); const ck=[G.vol,G.vm,G.vf,ex,ey].join(); if(Engine._vk&&Engine._vk[0]===ck) G.vk=Engine._vk[1]; else { let lo=0.3,hi=1;
      for(let i=0;i<40;i++){ const m=(lo+hi)/2; G.vk=m; let ok=true; for(const [a,b] of [[ex,0],[0,ey],[ex,ey]]){ const [x,y]=volMap(a,b,G); if(Math.abs(x)>a+1e-6&&a>0||Math.abs(y)>b+1e-6&&b>0) ok=false; } if(ok) lo=m; else hi=m; } G.vk=lo; Engine._vk=[ck,lo]; } }
    return G; }
  prog(fs){ const gl=this.gl; const mk=(t,src)=>{const sh=gl.createShader(t); gl.shaderSource(sh,src); gl.compileShader(sh); if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh;};
    const p=gl.createProgram(); gl.attachShader(p,mk(gl.VERTEX_SHADER,VS)); gl.attachShader(p,mk(gl.FRAGMENT_SHADER,fs)); gl.bindAttribLocation(p,0,'aPos'); gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); p.u={}; return p; }
  U(p,n){ return p.u[n]!==undefined ? p.u[n] : (p.u[n]=this.gl.getUniformLocation(p,n)); }
  tex(w,h,src){ const gl=this.gl; const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    if(src) gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,src); else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    return t; }
  ftex(w,h){ const gl=this.gl; const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null); return t; }
  fbo(w,h,fl){ const gl=this.gl; const t=(fl&&this.floatRT)?this.ftex(w,h):this.tex(w,h,null); const f=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0); return {t,f,w,h}; }
  delFbo(x){ if(!x) return; this.gl.deleteTexture(x.t); this.gl.deleteFramebuffer(x.f); }
  // o: {fullW, fullH, scale, xf:[ox,oy,sx,sy], parent}
  makeState(img, o){
    const raw=o.raw||null; const w=raw?o.w:img.width, h=raw?o.h:img.height; const fl=!!raw;
    const st={w,h,fullW:o.fullW,fullH:o.fullH,scale:o.scale||w/o.fullW,xf:o.xf||[0,0,1,1],parent:o.parent||null,raw};
    if(raw){ st.srcF=this.fbo(w,h,true); st.src=st.srcF.t; } else st.src=this.tex(w,h,img);
    for(const k of ['heal','nr','dev','la','lb']) st[k]=this.fbo(w,h,fl);
    { const F=this.floatRT; st.y0=this.fbo(w,h,F); let pw=w, ph=h; st.G=[]; st.R=[];
      for(let i=1;i<=4;i++){ pw=Math.max(2,Math.ceil(pw/2)); ph=Math.max(2,Math.ceil(ph/2)); st.G[i]=this.fbo(pw,ph,F); st.R[i]=this.fbo(pw,ph,F); } }
    if(!st.parent){ const bw=Math.max(8,Math.round(w/8)), bh=Math.max(8,Math.round(h/8)); st.b1=this.fbo(bw,bh,fl); st.b2=this.fbo(bw,bh,fl); }
    st.keys={}; return st;
  }
  freeState(st){ if(!st) return; if(st.srcF) this.delFbo(st.srcF); else this.gl.deleteTexture(st.src); ['heal','nr','dev','la','lb','b1','b2','y0','lbF'].forEach(k=>this.delFbo(st[k])); (st.G||[]).forEach(x=>this.delFbo(x)); (st.R||[]).forEach(x=>this.delFbo(x)); }
  setImage(img, fullW, fullH){ this.freeState(this.state); this.state=this.makeState(img,{fullW,fullH}); }
  setRaw(R, w, h){ this.freeState(this.state); this.state=this.makeState(null,{raw:R,w,h,fullW:R.fullW,fullH:R.fullH}); }
  static halfTable(){ if(Engine._ht) return Engine._ht; const t=new Uint16Array(65536), f=new Float32Array(1), u=new Uint32Array(f.buffer);
    for(let v=0;v<65536;v++){ f[0]=v/65535; const x=u[0]; const e=((x>>>23)&255)-127+15, m=x&0x7fffff; t[v]= e<=0 ? (e<-10?0:((m|0x800000)>>>(14-e))) : ((e<<10)|(m>>>13)); } return Engine._ht=t; }
  // Raw source texture (linear camera RGB, as-shot WB), RGB16F. dec.data is converted in place.
  rawSource(meta, w, h){ const gl=this.gl; const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGB16F,w,h); return {tex:t,w,h,fullW:meta.fullW,fullH:meta.fullH,mat:meta.mat,base:meta.baseline||0,clip:0}; }
  rawPut(R, data, y0, rows, srcRow0){ const gl=this.gl; const H=Engine.halfTable(); const n=R.w*3; const a=srcRow0*n, b=(srcRow0+rows)*n; let mx=R.clip*65535;
    for(let i=a;i<b;i++){ const v=data[i]; if(v>mx) mx=v; data[i]=H[v]; } R.clip=mx/65535;
    gl.bindTexture(gl.TEXTURE_2D,R.tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT,1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,y0,R.w,rows,gl.RGB,gl.HALF_FLOAT,data.subarray(a,b)); gl.pixelStorei(gl.UNPACK_ALIGNMENT,4); }
  freeRaw(R){ if(R&&R.tex){ this.gl.deleteTexture(R.tex); R.tex=null; } }
  rawCurveTex(){ if(this._rc) return this._rc; const gl=this.gl; const c=Engine.spline([[0,0],[0.03,0.017],[0.12,0.095],[0.3,0.315],[0.5,0.565],[0.7,0.775],[0.85,0.895],[1,0.975]]);
    const d=new Float32Array(1024); for(let i=0;i<256;i++){ d[i*4]=d[i*4+1]=d[i*4+2]=c[i]; d[i*4+3]=1; }
    const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t); for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,256,1,0,gl.RGBA,gl.FLOAT,d); return this._rc=t; }
  // Robust noise estimate (luma, chroma) from 5 windows: min of per-window MAD of a Laplacian high-pass
  estimateNoise(st, srcT){ const gl=this.gl, p=this.p.hp, win=Math.max(8,Math.min(96,Math.floor(Math.min(st.w,st.h)/4)));
    const fb=this.fbo(win*5,win); gl.useProgram(p); this.bindTex(p,'uTex',0,srcT); gl.uniform1i(this.U(p,'uWin'),win);
    const org=[]; for(const [fx,fy] of [[.5,.5],[.25,.25],[.75,.25],[.25,.75],[.75,.75]]) org.push(Math.max(1,Math.min(st.w-win-1,Math.round(fx*st.w-win/2))),Math.max(1,Math.min(st.h-win-1,Math.round(fy*st.h-win/2))));
    gl.uniform2iv(this.U(p,'uOrg'),new Int32Array(org)); this.draw(p,fb,win*5,win); const px=new Uint8Array(win*5*win*4); gl.readPixels(0,0,win*5,win,gl.RGBA,gl.UNSIGNED_BYTE,px); this.delFbo(fb);
    const med=(ch,wi)=>{ const a=[]; for(let y=0;y<win;y++) for(let x=0;x<win;x++) a.push(px[((y*win*5)+wi*win+x)*4+ch]); a.sort((u,v)=>u-v); return a[a.length>>1]; };
    let sy=1e9, sc=1e9; for(let wi=0;wi<5;wi++){ sy=Math.min(sy,med(0,wi)); sc=Math.min(sc,(med(1,wi)+med(2,wi))/2); }
    const k=1/(255*8*0.6745*1.118); return [Math.max(sy*k,0.0015), Math.max(sc*k,0.0015)]; }
  draw(p, target, w, h){ const gl=this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, target?target.f:null); gl.viewport(0,0,w,h); gl.useProgram(p); gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES,0,3); }
  bindTex(p,name,unit,t){ const gl=this.gl; gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,t); gl.uniform1i(this.U(p,name),unit); }
  updateLut(lutBytes, key){ if(key===this.lutKey) return; const gl=this.gl; gl.bindTexture(gl.TEXTURE_2D,this.lut); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,lutBytes); this.lutKey=key; }
  // Content-aware / painted heal field: RGBA32F over image uv (dx,dy offset in uv, alpha, mode)
  setFill(f){ const gl=this.gl; if(this.fill&&this.fill.tex) gl.deleteTexture(this.fill.tex); this.fill=null; if(!f) return;
    const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,f.w,f.h,0,gl.RGBA,gl.FLOAT,f.data);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,k,v);
    this.fill={tex:t,key:f.key,r:f.r||0.01,box:f.box,sbox:f.sbox}; }
  getMaskTex(m){ const key=Engine.maskKey(m); let e=this.maskTex.get(m.id); if(e&&e.key===key) return e.tex;
    const cv=this.maskSource(m); const gl=this.gl; if(!e){ e={tex:this.tex(1,1,null)}; this.maskTex.set(m.id,e); }
    gl.bindTexture(gl.TEXTURE_2D,e.tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,cv); e.key=key; return e.tex; }
  static maskKey(m){ const sd=(typeof maskSrcData==='function'&&maskSrcData())||{}; return JSON.stringify([m.type,m.geo,m.strokes,m.invert,m.range,m.ai,m.parts,sd.w,sd.tag||'',window.aiVersion||0]); }
  static outSize(st, s){ const odd=s.orient%2===1; const Wr=odd?st.h:st.w, Hr=odd?st.w:st.h; return {Wr,Hr,w:Math.max(1,Math.round(s.crop.w*Wr)),h:Math.max(1,Math.round(s.crop.h*Hr))}; }
  static activeMasks(s){ return (s.masks||[]).filter(m=>m.on!==false && Object.values(m.adj).some(v=>v!==0)); }
  process(st, s){
    const gl=this.gl, scale=st.scale, xf=st.xf;
    if(st.parent) this.process(st.parent, s);
    if(st.raw){ const R=st.raw; const rk=[s.wbTemp,s.wbTint,s.rawProfile,R.clip].join();
      if(st.keys.raw!==rk){ const p=this.p.raw; const rcT=this.rawCurveTex(); gl.useProgram(p); this.bindTex(p,'uRaw',0,R.tex); this.bindTex(p,'uCurve',1,rcT);
        gl.uniform4f(this.U(p,'uXf'),...xf); gl.uniformMatrix3fv(this.U(p,'uM'),true,R.mat);
        const t=s.wbTemp, ti=s.wbTint; gl.uniform3f(this.U(p,'uWB'),Math.exp(t*0.0045+ti*0.0012),Math.exp(-ti*0.0035),Math.exp(-t*0.0055+ti*0.0012));
        gl.uniform1f(this.U(p,'uBase'),R.base+0.0); gl.uniform1f(this.U(p,'uClip'),R.clip||1); gl.uniform1f(this.U(p,'uProf'),({standard:0,vivid:1,flat:2})[s.rawProfile||'standard']);
        this.draw(p,st.srcF,st.w,st.h); st.keys.raw=rk; st.keys.heal=null; } }
    // 1. spot healing
    const spots=(s.spots||[]).slice(0,32); const F=this.fill; const healK=JSON.stringify(spots)+(F?F.key:'');
    if(st.keys.heal!==healK){ if(!spots.length) st.keys.nr=null;
      if(spots.length||F){ const p=this.p.heal; gl.useProgram(p); this.bindTex(p,'uTex',0,st.src); this.bindTex(p,'uFill',1,F?F.tex:this.blank); gl.uniform1f(this.U(p,'uFillOn'),F?1:0); gl.uniform1f(this.U(p,'uFillR'),F?F.r:0.01);
        gl.uniform4f(this.U(p,'uXf'),...xf); gl.uniform1i(this.U(p,'uN'),spots.length); gl.uniform2f(this.U(p,'uAsp'),st.fullW,st.fullH);
        const A=new Float32Array(128), B=new Float32Array(128); spots.forEach((sp,i)=>{ A.set([sp.x,sp.y,sp.sx,sp.sy],i*4); B.set([sp.r,sp.feather/100,sp.opacity/100,sp.mode==='clone'?1:0],i*4); });
        gl.uniform4fv(this.U(p,'uSA'),A); gl.uniform4fv(this.U(p,'uSB'),B); this.draw(p,st.heal,st.w,st.h); }
      st.keys.heal=healK; st.keys.nr=null; }
    const srcT = (spots.length||F)? st.heal.t : st.src;
    // 2. noise reduction
    const nrK=[healK,s.nrLum,s.nrLumDetail,s.nrLumContrast,s.nrColor,s.nrColorDetail,s.nrColorSmooth].join();
    if(st.keys.nr!==nrK){
      if(!st.sigma||st.keys.sig!==st.keys.raw) { st.sigma=this.estimateNoise(st,srcT); st.keys.sig=st.keys.raw; }
      this.denoise(st, srcT, s);
      if(!st.parent){
        const d=this.p.down; gl.useProgram(d); this.bindTex(d,'uTex',0,st.nr.t); gl.uniform2f(this.U(d,'uPx'),2/st.w,2/st.h); this.draw(d,st.b1,st.b1.w,st.b1.h);
        const b=this.p.blur; gl.useProgram(b);
        for(let i=0;i<2;i++){ const r=1.6+i;
          this.bindTex(b,'uTex',0,st.b1.t); gl.uniform2f(this.U(b,'uDir'),r/st.b1.w,0); this.draw(b,st.b2,st.b2.w,st.b2.h);
          this.bindTex(b,'uTex',0,st.b2.t); gl.uniform2f(this.U(b,'uDir'),0,r/st.b1.h); this.draw(b,st.b1,st.b1.w,st.b1.h); } }
      st.keys.nr=nrK; st.keys.dev=null;
    }
    const blurT=(st.parent||st).b1.t;
    // 3. global develop
    const lut = Engine.buildLut(s.curve); this.updateLut(lut.bytes, lut.key);
    const devK = nrK+JSON.stringify([s.wbTemp,s.wbTint,s.exposure,s.contrast,s.highlights,s.shadows,s.whites,s.blacks,s.texture,s.clarity,s.dehaze,s.vibrance,s.saturation,s.hsl,s.grade,s.sharpAmount,s.sharpRadius,s.sharpDetail,s.sharpMasking,s.lensVig,s.lensVigMid,lut.key,!!s.bwOn,s.bwMix,s.stHi,s.stMid,s.stSh,s.stBlk,!!window.sharpVis]);
    if(st.keys.dev!==devK){
      const p=this.p.dev; gl.useProgram(p);
      this.bindTex(p,'uTex',0,st.nr.t); this.bindTex(p,'uBlur',1,blurT); this.bindTex(p,'uLut',2,this.lut);
      gl.uniform2f(this.U(p,'uPx'),1/st.w,1/st.h); gl.uniform1f(this.U(p,'uScale'),Math.max(scale,0.35)); gl.uniform4f(this.U(p,'uXf'),...xf); gl.uniform2f(this.U(p,'uFull'),st.fullW,st.fullH);
      const f=(n,v)=>gl.uniform1f(this.U(p,n),v);
      f('uLV',s.lensVig||0); f('uLVM',s.lensVigMid??50);
      f('uTemp',st.raw?0:s.wbTemp); f('uTint',st.raw?0:s.wbTint); f('uExp',s.exposure); f('uCon',s.contrast); f('uHi',s.highlights); f('uSh',s.shadows); f('uWh',s.whites); f('uBl',s.blacks);
      f('uTexA',s.texture); f('uClar',s.clarity); f('uDehaze',s.dehaze); f('uVib',s.vibrance); f('uSat',s.saturation);
      gl.uniform1fv(this.U(p,'uHH'),s.hsl.h); gl.uniform1fv(this.U(p,'uHS'),s.hsl.s); gl.uniform1fv(this.U(p,'uHL'),s.hsl.l);
      f('uBW',s.bwOn?1:0); gl.uniform1fv(this.U(p,'uBWMix'),s.bwMix||[0,0,0,0,0,0,0,0]);
      f('uSTHi',s.stHi||0); f('uSTMid',s.stMid||0); f('uSTSh',s.stSh||0); f('uSTBlk',s.stBlk||0);
      const g=s.grade; const v3=(n,x)=>gl.uniform3f(this.U(p,n),x.h,x.s,x.l);
      v3('uGS',g.sh); v3('uGM',g.mid); v3('uGH',g.hi); v3('uGG',g.glob); f('uGBlend',g.blend); f('uGBal',g.balance);
      f('uShAmt',s.sharpAmount); f('uShRad',s.sharpRadius); f('uShDet',s.sharpDetail); f('uShMask',s.sharpMasking); f('uShNoise',st.sigma?(st.parent||st).sigma?((st.parent&&st.parent.sigma)||st.sigma)[0]*0.7:0:0); gl.uniform1i(this.U(p,'uShVis'),window.sharpVis?1:0);
      this.draw(p, st.dev, st.w, st.h); st.keys.dev=devK; st.keys.loc=null;
    }
    if(window.sharpVis){ st.out=st.dev; st.locOut=st.dev; st.dxoOut=st.dev; return; }
    // 4. local adjustment masks
    const masks=Engine.activeMasks(s); const locK=devK+JSON.stringify(masks.map(m=>[Engine.maskKey(m),m.adj]));
    if(st.keys.loc!==locK){
      let cur=st.dev, i=0; const p=this.p.local;
      for(const m of masks){ const mt=this.getMaskTex(m); gl.useProgram(p); const out=(i++%2)?st.lb:st.la;
        this.bindTex(p,'uTex',0,cur.t); this.bindTex(p,'uMask',1,mt); this.bindTex(p,'uBlur',2,blurT);
        gl.uniform4f(this.U(p,'uXf'),...xf); gl.uniform2f(this.U(p,'uPx'),1/st.w,1/st.h); gl.uniform1f(this.U(p,'uScale'),scale);
        const a=m.adj, f=(n,v)=>gl.uniform1f(this.U(p,n),v);
        f('uExp',a.exposure); f('uCon',a.contrast); f('uHi',a.highlights); f('uSh',a.shadows); f('uTemp',a.temp); f('uTint',a.tint); f('uSat',a.saturation); f('uClar',a.clarity); f('uSharp',a.sharpness); f('uNoise',a.noise);
        this.draw(p,out,st.w,st.h); cur=out; }
      st.locOut=cur; st.keys.loc=locK; st.keys.dxo=null;
    }
    // 5. DxO-style pass
    const D=Engine.dxoU(s); const dxoK=locK+D.key;
    if(st.keys.dxo!==dxoK){ const cur=st.locOut;
      if(!D.on){ st.out=cur; st.dxoOut=cur; st.keys.lb=null; } else {
        const p=this.p.dxo, out=cur===st.la?st.lb:st.la; gl.useProgram(p); this.bindTex(p,'uTex',0,cur.t); this.bindTex(p,'uBlur',1,blurT); this.bindTex(p,'uSrc',2,st.nr.t);
        gl.uniform4f(this.U(p,'uXf'),...xf); gl.uniform2f(this.U(p,'uPx'),1/st.w,1/st.h); gl.uniform2f(this.U(p,'uFull'),st.fullW,st.fullH); gl.uniform1f(this.U(p,'uScale'),Math.max(scale,0.35));
        const f=(n,v)=>gl.uniform1f(this.U(p,n),v); f('uSL',D.sl); f('uCV',D.cv); f('uMC',D.mc); f('uFC',D.fc); f('uFCH',D.fch); f('uFCS',D.fcs); this.bindTex(p,'uBrush',3,this.brushTex(D.brush)); f('uCAr',D.car); f('uCAb',D.cab); f('uFr',D.fr); f('uFrG',D.frG); f('uFrPW',D.frPW); f('uFrGW',D.frGW); f('uLS',D.ls); f('uMo',D.mo); { const RE=new Float32Array(32); (D.reyes||[]).forEach((q,i)=>RE.set([q.x,q.y,q.r,(q.amt??100)/100],i*4)); gl.uniform1i(this.U(p,'uNRE'),(D.reyes||[]).length); gl.uniform4fv(this.U(p,'uRE'),RE); } { const A=new Float32Array(16),B=new Float32Array(16); D.pcs.forEach((q,i)=>{ A.set([q.h,q.s,q.v,(q.range??50)/100],i*4); B.set([q.dh||0,q.ds||0,q.dl||0,0],i*4); }); gl.uniform1i(this.U(p,'uNPC'),D.pcs.length); gl.uniform4fv(this.U(p,'uPCo'),A); gl.uniform4fv(this.U(p,'uPCd'),B); f('uCalOn',D.cal?1:0); gl.uniformMatrix3fv(this.U(p,'uCal'),true,D.cal||[1,0,0,0,1,0,0,0,1]); } f('uLSh',D.lsh); f('uLSc',D.lsc); f('uLSb',D.lsb); f('uPSC',D.psc); f('uROn',D.rend.on); f('uRC',D.rend.c); gl.uniformMatrix3fv(this.U(p,'uRM'),true,D.rend.m); f('uHCOn',D.hc?1:0); this.bindTex(p,'uHC',4,D.hc?this.dataTex('hc',D.hc):this.blank);
        gl.uniform3f(this.U(p,'uAir'),...D.air); gl.uniform1i(this.U(p,'uNF'),D.faces.length);
        const FA=new Float32Array(16), FG=new Float32Array(4); D.faces.forEach((q,i)=>{ FA.set([q.x,q.y,q.w,q.h],i*4); FG[i]=q.g; }); gl.uniform4fv(this.U(p,'uFace'),FA); gl.uniform1fv(this.U(p,'uFaceG'),FG);
        gl.uniform4f(this.U(p,'uCW'),...D.cw); gl.uniform3f(this.U(p,'uCWd'),...D.cwd);
        const PA=new Float32Array(32),PB=new Float32Array(32),PC=new Float32Array(32),PD=new Float32Array(32);
        D.cps.forEach((q,i)=>{ PA.set([q.x,q.y,q.r,q.sel],i*4); PB.set([q.exp,q.con,q.sat,q.warm],i*4); const kd={pt:0,line:1,protect:2,brush:3}[q.kind]||0; PC.set([...q.ref,kd],i*4); PD.set(kd===1?[q.x1,q.y1,q.str||0,0]:kd===3?[q.bch||0,0,q.str||0,0]:[q.ratio||1,(q.angle||0)*Math.PI/180,q.str||0,0],i*4); });
        gl.uniform1i(this.U(p,'uNP'),D.cps.length); gl.uniform4fv(this.U(p,'uPA'),PA); gl.uniform4fv(this.U(p,'uPB'),PB); gl.uniform4fv(this.U(p,'uPC'),PC); gl.uniform4fv(this.U(p,'uPD'),PD);
        gl.uniformMatrix3fv(this.U(p,'uFM'),true,D.film.m); gl.uniform4f(this.U(p,'uFT'),...D.film.t); gl.uniform3f(this.U(p,'uFSh'),...D.film.sh); gl.uniform3f(this.U(p,'uFHi'),...D.film.hi); f('uFBW',D.film.bw); f('uFOn',D.film.on);
        this.draw(p,out,st.w,st.h); st.out=out; st.dxoOut=out; st.keys.lb=null; }
      st.keys.dxo=dxoK; }
    // 6. Lens Blur (depth-based bokeh)
    const LB=s.lb; const dep=(LB&&LB.on&&LB.amt>0&&window.lbDepth)?lbDepth():null; const lbK=dep?JSON.stringify([LB,dep.key]):'';
    if(!dep){ if(st.dxoOut) st.out=st.dxoOut; st.keys.lb=''; }
    else if(st.keys.lb!==lbK){ if(!st.lbF) st.lbF=this.fbo(st.w,st.h,this.floatRT); const p=this.p.lb; gl.useProgram(p); this.bindTex(p,'uTex',0,(st.dxoOut||st.out).t);
      if(!this._dep||this._dep.key!==dep.key){ if(!this._dep) this._dep={tex:this.tex(1,1,null)}; gl.bindTexture(gl.TEXTURE_2D,this._dep.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,dep.canvas); this._dep.key=dep.key; }
      this.bindTex(p,'uDep',1,this._dep.tex); gl.uniform4f(this.U(p,'uXf'),...xf); gl.uniform2f(this.U(p,'uFull'),st.fullW,st.fullH);
      const f=(n,v)=>gl.uniform1f(this.U(p,n),v); f('uR',LB.amt/100*0.022); f('uF',LB.focus??0.8); f('uW',(LB.range??15)/100*0.6); f('uHB',(LB.boost??30)/100); f('uCat',(LB.cat??50)/100);
      gl.uniform1i(this.U(p,'uShape'),({circle:0,hexagon:1,cateye:2,ring:3})[LB.shape||'circle']||0); gl.uniform1i(this.U(p,'uN'),LB.q==='high'?160:(typeof isTouch!=='undefined'&&isTouch)?56:96);
      this.draw(p,st.lbF,st.w,st.h); st.out=st.lbF; st.keys.lb=lbK; }
    else st.out=st.lbF;
  }
  // Multi-scale denoise: NLM on luma at full res, then 4-level Laplacian pyramid shrinkage in YCbCr
  denoise(st, srcT, s){
    const gl=this.gl; const sy=st.sigma[0], sc=Math.max(st.sigma[1],0.4*sy); const L=s.nrLum/50, C=s.nrColor/50; const det=s.nrLumDetail/100, cdet=s.nrColorDetail/100, smooth=s.nrColorSmooth/100, con=s.nrLumContrast/100;
    st.lastNR={sigma:st.sigma};
    // 1) NLM luminance, h scaled by measured noise
    let p=this.p.nlm; gl.useProgram(p); this.bindTex(p,'uTex',0,srcT); gl.uniform2f(this.U(p,'uPx'),1/st.w,1/st.h);
    const h=L>0? sy*Math.pow(L,0.9)*1.2*(1.35-0.7*det) : 0; gl.uniform1f(this.U(p,'uH'),h); gl.uniform1f(this.U(p,'uSub'),0.5*sy*sy*Math.min(1,L)); gl.uniform1f(this.U(p,'uKeep'),0.12*det*Math.max(0,1-L*0.6));
    this.draw(p,st.y0,st.w,st.h);
    // 2) Gaussian pyramid
    p=this.p.pdown; gl.useProgram(p); let prev=st.y0;
    for(let i=1;i<=4;i++){ this.bindTex(p,'uTex',0,prev.t); gl.uniform2f(this.U(p,'uPx'),1/prev.w,1/prev.h); this.draw(p,st.G[i],st.G[i].w,st.G[i].h); prev=st.G[i]; }
    // 3) coarsest level: luma-guided bilateral (removes large chroma blotches)
    p=this.p.coarse; gl.useProgram(p); this.bindTex(p,'uTex',0,st.G[4].t); gl.uniform2f(this.U(p,'uPx'),1/st.G[4].w,1/st.G[4].h);
    gl.uniform1f(this.U(p,'uSy'),Math.max(0.02,0.12-0.08*cdet)); gl.uniform1f(this.U(p,'uSc'),Math.max(1e-3,sc*(2+10*C)*(0.6+smooth)));
    gl.uniform1f(this.U(p,'uMixY'),Math.min(0.6,0.3*L)); gl.uniform1f(this.U(p,'uMixC'),Math.min(1,C*(0.5+smooth))); this.draw(p,st.R[4],st.R[4].w,st.R[4].h);
    // 4) reconstruct with per-scale soft shrinkage (noise std halves per level)
    p=this.p.rec; gl.useProgram(p);
    const ly=[1.1,1.1,0.85,0.6], lc=[1.2,1.8,2.2,2.4];
    for(let i=3;i>=0;i--){ const g=i===0?st.y0:st.G[i], out=i===0?st.nr:st.R[i]; const sl=Math.pow(0.62,i);
      this.bindTex(p,'uG',0,g.t); this.bindTex(p,'uGl',1,st.G[i+1].t); this.bindTex(p,'uRl',2,st.R[i+1].t);
      const ty= L>0 ? sy*sl*ly[i]*Math.pow(L,1.1)*(1.4-0.9*det) : 0;
      const tc= C>0 ? sc*sl*lc[i]*Math.pow(C,1.1)*(1.5-0.9*cdet)*(i>=2?(0.6+0.8*smooth):1) : 0;
      gl.uniform3f(this.U(p,'uT'),ty,tc,tc); gl.uniform1f(this.U(p,'uBoost'),(i===1||i===2)?1+con*0.5*Math.min(1,L):1); gl.uniform1i(this.U(p,'uFinal'),i===0?1:0);
      this.draw(p,out,out.w,out.h); }
  }
  // opt: fullFrame, view [x,y,w,h], ovMask (mask obj)
  finish(st, s, target, w, h, opt={}){
    const gl=this.gl, p=this.p.fin; gl.useProgram(p); this.bindTex(p,'uTex',0,st.out.t);
    // Sharpening-mask visualize: show DEV grayscale as-is (no vignette / proof / grain)
    if(window.sharpVis&&!opt.fullFrame){ const odd=s.orient%2===1; const Wr=odd?st.fullH:st.fullW, Hr=odd?st.fullW:st.fullH; const crop=s.crop, v=opt.view||[0,0,1,1];
      gl.uniform4f(this.U(p,'uCrop'),crop.x,crop.y,crop.w,crop.h); gl.uniform4f(this.U(p,'uView'),...v); gl.uniform4f(this.U(p,'uSrc'),...st.xf);
      gl.uniform1f(this.U(p,'uAngle'),s.angle*Math.PI/180); const G=Engine.geomU(s,Wr,Hr);
      gl.uniform1f(this.U(p,'uPV'),G.pv); gl.uniform1f(this.U(p,'uPH'),G.ph); gl.uniform1f(this.U(p,'uDist'),G.dist); gl.uniform1f(this.U(p,'uPS'),G.ps); gl.uniform1f(this.U(p,'uTR'),G.tr); gl.uniform1f(this.U(p,'uTA'),G.ta); gl.uniform2f(this.U(p,'uTO'),G.ox,G.oy); gl.uniform1f(this.U(p,'uVol'),G.vol); gl.uniform1f(this.U(p,'uVolF'),G.vf); gl.uniform1f(this.U(p,'uVolK'),G.vk); gl.uniform1i(this.U(p,'uVolM'),G.vm);
      gl.uniform1i(this.U(p,'uOrient'),s.orient); gl.uniform1i(this.U(p,'uFlipH'),s.flipH?1:0); gl.uniform1i(this.U(p,'uFlipY'),target?0:1);
      gl.uniform2f(this.U(p,'uRotSize'),Wr,Hr); gl.uniform2f(this.U(p,'uOutFull'),Wr*crop.w,Hr*crop.h);
      this.bindTex(p,'uOv',1,this.blank); gl.uniform1f(this.U(p,'uOvOn'),0);
      const z=(n)=>gl.uniform1f(this.U(p,n),0);
      z('uFB'); z('uLL'); z('uTx'); z('uVA'); z('uGA'); z('uProofW'); gl.uniform1i(this.U(p,'uProof'),0); gl.uniform1i(this.U(p,'uFrS'),0); gl.uniform1f(this.U(p,'uFrW'),0); gl.uniform1f(this.U(p,'uSeed'),0);
      z('uVM'); z('uVR'); z('uVF'); z('uVS'); z('uVH'); z('uGSz'); z('uGR'); z('uLLp');
      this.draw(p, target, w, h); return; }
    const odd=s.orient%2===1; const Wr=odd?st.fullH:st.fullW, Hr=odd?st.fullW:st.fullH;
    const crop = opt.fullFrame ? {x:0,y:0,w:1,h:1} : s.crop; const v=opt.view||[0,0,1,1];
    gl.uniform4f(this.U(p,'uCrop'),crop.x,crop.y,crop.w,crop.h); gl.uniform4f(this.U(p,'uView'),...v); gl.uniform4f(this.U(p,'uSrc'),...st.xf);
    gl.uniform1f(this.U(p,'uAngle'),s.angle*Math.PI/180); const G=Engine.geomU(s,Wr,Hr);
    gl.uniform1f(this.U(p,'uPV'),G.pv); gl.uniform1f(this.U(p,'uPH'),G.ph); gl.uniform1f(this.U(p,'uDist'),G.dist); gl.uniform1f(this.U(p,'uPS'),G.ps); gl.uniform1f(this.U(p,'uTR'),G.tr); gl.uniform1f(this.U(p,'uTA'),G.ta); gl.uniform2f(this.U(p,'uTO'),G.ox,G.oy); gl.uniform1f(this.U(p,'uVol'),G.vol); gl.uniform1f(this.U(p,'uVolF'),G.vf); gl.uniform1f(this.U(p,'uVolK'),G.vk); gl.uniform1i(this.U(p,'uVolM'),G.vm);
    gl.uniform1i(this.U(p,'uOrient'),s.orient); gl.uniform1i(this.U(p,'uFlipH'),s.flipH?1:0); gl.uniform1i(this.U(p,'uFlipY'),target?0:1);
    gl.uniform2f(this.U(p,'uRotSize'),Wr,Hr); gl.uniform2f(this.U(p,'uOutFull'),Wr*crop.w,Hr*crop.h);
    if(opt.ovMask){ this.bindTex(p,'uOv',1,this.getMaskTex(opt.ovMask)); gl.uniform1f(this.U(p,'uOvOn'),1); } else { this.bindTex(p,'uOv',1,this.blank); gl.uniform1f(this.U(p,'uOvOn'),0); }
    const f=(n,v)=>gl.uniform1f(this.U(p,n),v);
    const fx=opt.fullFrame?{}:s; f('uFB',fx.fBlur||0); f('uLL',fx.leak||0); f('uLLp',({left:0,right:1,top:2,bottom:3})[s.leakPos||'left']); gl.uniform3f(this.U(p,'uLLc'),...(({warm:[1,0.45,0.1],red:[1,0.15,0.1],golden:[1,0.75,0.3],magenta:[0.95,0.2,0.6]})[s.leakCol||'warm']));
    f('uTx',fx.texture2||0); gl.uniform1i(this.U(p,'uFrS'),opt.fullFrame?0:({none:0,white:1,black:2,film:3,polaroid:4,rounded:5})[s.frame||'none']); f('uFrW',s.frameW??25);
    gl.uniform1i(this.U(p,'uProof'),(!target&&window.proofMode)?({glossy:2,matte:3,web:1,srgb:4,p3:5,adobergb:6})[window.proofMode]||0:0); f('uProofW',window.proofWarn?1:0);
    f('uVA',opt.fullFrame?0:s.vigAmount); f('uVM',s.vigMid); f('uVR',s.vigRound); f('uVF',s.vigFeather); f('uVS',s.vigStyle||0); f('uVH',s.vigHi||0); f('uGA',s.grainAmount); f('uGSz',s.grainSize); f('uGR',s.grainRough); f('uSeed',this.seed);
    this.draw(p, target, w, h);
  }
  // Fit render of preview state into canvas, or zoom render with explicit size/view/state
  render(s, opt={}){
    const st=opt.st||this.state; if(!st) return; this.process(st, s);
    let fw,fh; if(opt.size){ [fw,fh]=opt.size; } else { const os=Engine.outSize(this.state,s); fw=opt.fullFrame?os.Wr:os.w; fh=opt.fullFrame?os.Hr:os.h; }
    if(this.canvas.width!==fw||this.canvas.height!==fh){ this.canvas.width=fw; this.canvas.height=fh; }
    this.finish(st, s, null, fw, fh, opt);
  }
  readOut(st, s, w, h, opt={}){
    const gl=this.gl; const fb=this.fbo(w,h); this.finish(st,s,fb,w,h,opt);
    const px=new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px); this.delFbo(fb); return px;
  }
  readOutF(st, s, w, h, opt={}){ const gl=this.gl; if(!this.floatRT) return null; const fb=this.fbo(w,h,true); this.finish(st,s,fb,w,h,opt);
    const px=new Float32Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,px); this.delFbo(fb); return px; }
  histogram(s, opt={}){
    const st=this.state; if(!st) return null; this.process(st,s); const os=Engine.outSize(st,s);
    const k=Math.min(1, 320/Math.max(os.w,os.h)); const w=Math.max(1,Math.round(os.w*k)), h=Math.max(1,Math.round(os.h*k));
    const px=this.readOut(st,s,w,h,{fullFrame:opt.fullFrame}); const H=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];
    for(let i=0;i<px.length;i+=4){ H[0][px[i]]++; H[1][px[i+1]]++; H[2][px[i+2]]++; } return H;
  }
  static spline(pts){
    const p=pts.slice().sort((a,b)=>a[0]-b[0]); const n=p.length, out=new Float32Array(256);
    if(n<2){ for(let i=0;i<256;i++) out[i]=i/255; return out; }
    const dx=[],dy=[],m=[]; for(let i=0;i<n-1;i++){ dx[i]=Math.max(1e-6,p[i+1][0]-p[i][0]); dy[i]=(p[i+1][1]-p[i][1])/dx[i]; }
    m[0]=dy[0]; m[n-1]=dy[n-2]; for(let i=1;i<n-1;i++) m[i]= dy[i-1]*dy[i]<=0?0:(dy[i-1]+dy[i])/2;
    for(let i=0;i<n-1;i++){ if(dy[i]===0){m[i]=m[i+1]=0;continue;} const a=m[i]/dy[i], b=m[i+1]/dy[i], s=a*a+b*b; if(s>9){const t=3/Math.sqrt(s); m[i]=t*a*dy[i]; m[i+1]=t*b*dy[i];} }
    for(let k=0;k<256;k++){ const x=k/255; let y;
      if(x<=p[0][0]) y=p[0][1]; else if(x>=p[n-1][0]) y=p[n-1][1]; else { let i=0; while(x>p[i+1][0]) i++; const h=dx[i], t=(x-p[i][0])/h, t2=t*t, t3=t2*t;
        y=(2*t3-3*t2+1)*p[i][1]+(t3-2*t2+t)*h*m[i]+(-2*t3+3*t2)*p[i+1][1]+(t3-t2)*h*m[i+1]; }
      out[k]=Math.min(1,Math.max(0,y)); } return out; }
  static buildLut(curve){
    const key=JSON.stringify(curve); if(Engine._lc && Engine._lc.key===key) return Engine._lc;
    const M=Engine.spline(curve.m), C=[Engine.spline(curve.r),Engine.spline(curve.g),Engine.spline(curve.b)];
    const bytes=new Uint8Array(1024);
    for(let i=0;i<256;i++){ const mv=M[i]*255; const i0=Math.floor(mv), i1=Math.min(255,i0+1), f=mv-i0;
      for(let c=0;c<3;c++) bytes[i*4+c]=Math.round(255*(C[c][i0]*(1-f)+C[c][i1]*f)); bytes[i*4+3]=255; }
    return Engine._lc={key,bytes};
  }
}
window.Engine=Engine; window.geomMap=geomMap;
