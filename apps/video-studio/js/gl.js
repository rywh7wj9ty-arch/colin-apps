// WebGL2 compositor: per-layer transform, colour grading, 3D LUT, chroma key, transition masks
const VS=`#version 300 es
in vec2 p;uniform mat3 M;uniform vec4 crop;out vec2 uv;
void main(){vec2 l=vec2(mix(crop.x,1.-crop.y,p.x),mix(crop.z,1.-crop.w,p.y));uv=l;vec3 q=M*vec3(l-.5,1.);gl_Position=vec4(q.xy,0.,1.);}`;
const FS=`#version 300 es
precision highp float;precision highp sampler3D;
in vec2 uv;out vec4 o;
uniform sampler2D T;uniform sampler3D L;
uniform float lutA,lutN,op,expo,con,sat,vib,temp,tint,hl,sh,vig,raw;
uniform vec3 lift,gam,gain,offs,ckC;uniform vec4 ckP,fadeTo;uniform int maskT;uniform float maskP;uniform vec2 res;
const vec3 W3=vec3(.2126,.7152,.0722);
vec2 cbcr(vec3 c){return vec2(-.1146*c.r-.3854*c.g+.5*c.b,.5*c.r-.4542*c.g-.0458*c.b);}
void main(){vec4 c=texture(T,uv);vec3 x=c.rgb;float a=c.a;
 if(raw<.5){
  if(ckP.x>.5){vec2 kc0=cbcr(ckC);vec2 cc=cbcr(x);float d=length(cc-kc0);float k=smoothstep(ckP.y,ckP.y+ckP.z+1e-4,d);a*=k;
   vec2 kc=normalize(kc0+1e-5);float pr=dot(cc,kc);if(pr>0.){float y=dot(x,W3);vec2 nc=cc-kc*pr*ckP.w;
   x=vec3(y+1.5748*nc.y,y-.1873*nc.x-.4681*nc.y,y+1.8556*nc.x);}}
  x*=exp2(expo);
  x*=vec3(1.+.18*temp+.04*tint,1.-.12*tint,1.-.18*temp+.04*tint);
  float l=dot(x,W3);x*=1.+sh*.9*pow(clamp(1.-l,0.,1.),3.);
  l=dot(x,W3);x*=1.+hl*.6*smoothstep(.45,1.,l);
  x=(x-.5)*(1.+con)+.5;
  x+=offs;x=x*(1.+gain)+lift*(1.-x);x=pow(max(x,0.),1./max(vec3(.25),1.+gam));
  l=dot(x,W3);float s0=length(x-l);float sv=sat*(1.+vib*(1.-clamp(s0*2.,0.,1.)));x=mix(vec3(l),x,sv);
  x=clamp(x,0.,1.);
  if(lutA>0.){vec3 q=x*((lutN-1.)/lutN)+.5/lutN;x=mix(x,texture(L,q).rgb,lutA);}
  vec2 f=uv-.5;x*=1.-vig*smoothstep(.25,.75,length(f)*1.15);
 }
 x=mix(x,fadeTo.rgb,fadeTo.a);
 if(maskT>0){vec2 f=gl_FragCoord.xy/res;float u;
  if(maskT==1)u=f.x;else if(maskT==2)u=1.-f.y;else{vec2 r=vec2(res.x/res.y,1.);u=length((f-.5)*r)/(.5*length(r));}
  float w=.05;float pp=maskP*(1.+2.*w)-w;a*=1.-smoothstep(pp-w,pp+w,u);}
 a*=op;o=vec4(clamp(x,0.,1.)*a,a);}`;
export class Renderer{
  constructor(cv){this.cv=cv;const gl=this.gl=cv.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true,premultipliedAlpha:true});
    if(!gl)throw new Error('WebGL2 is not available on this device');
    const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o;};
    const p=this.p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,VS));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);this.u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
    for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);this.u[a.name]=gl.getUniformLocation(p,a.name);}
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(p,'p');
    gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    gl.uniform1i(this.u.T,0);gl.uniform1i(this.u.L,1);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    this.tex=new Map();this.luts=new Map();this.fbs=[];this.stack=[];
    this.idLut=this.makeLut(new Uint8Array([0,0,0,255,0,0,0,255,0,255,255,0,0,0,255,255,0,255,0,255,255,255,255,255]),2);
    this.W=cv.width;this.H=cv.height;}
  size(W,H){if(this.cv.width!==W)this.cv.width=W;if(this.cv.height!==H)this.cv.height=H;this.W=W;this.H=H;}
  begin(bg=[0,0,0]){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.stack=[];gl.viewport(0,0,this.W,this.H);gl.clearColor(bg[0],bg[1],bg[2],1);gl.clear(gl.COLOR_BUFFER_BIT);}
  texFor(key,el,isStatic){const gl=this.gl;let t=this.tex.get(key);
    if(!t){t={t:gl.createTexture(),fresh:true};gl.bindTexture(gl.TEXTURE_2D,t.t);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);this.tex.set(key,t);}
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t.t);
    if(!isStatic||t.fresh){try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,el);t.fresh=false;}catch(e){return null;}}
    t.used=performance.now();return t.t;}
  gc(){const now=performance.now();for(const [k,t] of this.tex)if(now-t.used>15000){this.gl.deleteTexture(t.t);this.tex.delete(k);}}
  makeLut(data,n){const gl=this.gl;const t=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGB8,n,n,n,0,gl.RGB,gl.UNSIGNED_BYTE,data);
    for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);return {t,n};}
  lut(name,get){if(!name)return null;let l=this.luts.get(name);if(l)return l;const d=get(name);if(!d)return null;l=this.makeLut(d.data,d.n);this.luts.set(name,l);return l;}
  pushFB(){const gl=this.gl;const d=this.stack.length;let f=this.fbs[d];
    if(!f||f.w!==this.W||f.h!==this.H){if(f){gl.deleteFramebuffer(f.fb);gl.deleteTexture(f.tex);}
      const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,this.W,this.H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
      f=this.fbs[d]={fb,tex,w:this.W,h:this.H};}
    gl.bindFramebuffer(gl.FRAMEBUFFER,f.fb);this.stack.push(f);gl.viewport(0,0,this.W,this.H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
  popFB(){const gl=this.gl;const f=this.stack.pop();const parent=this.stack[this.stack.length-1];gl.bindFramebuffer(gl.FRAMEBUFFER,parent?parent.fb:null);return f.tex;}
  // u: {M,crop,op,raw,fx:{...uniform values},lut:{t,n}|null,lutA,maskT,maskP,fadeTo}
  draw(tex,u){const gl=this.gl,U=this.u;gl.useProgram(this.p);gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);
    const L=u.lut||this.idLut;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,L.t);gl.activeTexture(gl.TEXTURE0);
    gl.uniformMatrix3fv(U.M,false,u.M);gl.uniform4fv(U.crop,u.crop||[0,0,0,0]);
    const f=u.fx||{};
    gl.uniform1f(U.lutA,u.lut?u.lutA:0);gl.uniform1f(U.lutN,L.n);gl.uniform1f(U.op,u.op??1);gl.uniform1f(U.raw,u.raw?1:0);
    gl.uniform1f(U.expo,f.exp||0);gl.uniform1f(U.con,f.con||0);gl.uniform1f(U.sat,f.sat??1);gl.uniform1f(U.vib,f.vib||0);
    gl.uniform1f(U.temp,f.temp||0);gl.uniform1f(U.tint,f.tint||0);gl.uniform1f(U.hl,f.hl||0);gl.uniform1f(U.sh,f.sh||0);gl.uniform1f(U.vig,f.vig||0);
    gl.uniform3fv(U.lift,f.lift||[0,0,0]);gl.uniform3fv(U.gam,f.gam||[0,0,0]);gl.uniform3fv(U.gain,f.gain||[0,0,0]);gl.uniform3fv(U.offs,f.offs||[0,0,0]);
    gl.uniform3fv(U.ckC,f.ckC||[0,1,0]);gl.uniform4fv(U.ckP,f.ckP||[0,0,0,0]);gl.uniform4fv(U.fadeTo,u.fadeTo||[0,0,0,0]);
    gl.uniform1i(U.maskT,u.maskT||0);gl.uniform1f(U.maskP,u.maskP||0);gl.uniform2f(U.res,this.W,this.H);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
}
