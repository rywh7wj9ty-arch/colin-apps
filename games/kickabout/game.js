(function(){
'use strict';
var PW=500,PH=800,GW=120,GD=26,GH=34,PR=7;
var X0=-120,Y0=-150,X1=PW+120,Y1=PH+150;
var TEAMC=[{shirt:'#1e7bff',dark:'#0d4fb8',shorts:'#ffffff',sock:'#1e7bff',name:'BLUE'},{shirt:'#ff7a1a',dark:'#c4500a',shorts:'#13223a',sock:'#ff7a1a',name:'ORANGE'}];
var cv=document.getElementById('c'),ctx=cv.getContext('2d');
var $=function(i){return document.getElementById(i)};
var cw=0,ch=0,dpr=1,scale=1;
// ---------- settings / stats ----------
var S={music:60,sfx:80,bright:100,len:3,diff:1};
try{Object.assign(S,JSON.parse(localStorage.getItem('kickabout-settings')||'{}'))}catch(e){}
function saveS(){try{localStorage.setItem('kickabout-settings',JSON.stringify(S))}catch(e){}}
var ST={matches:0,wins:0,draws:0,losses:0,goals:0,conceded:0,shots:0,time:0,best:0};
try{Object.assign(ST,JSON.parse(localStorage.getItem('kickabout-stats')||'{}'))}catch(e){}
function saveST(){try{localStorage.setItem('kickabout-stats',JSON.stringify(ST))}catch(e){}}
// ---------- audio ----------
var AC=null,mG,sG,crowdG,musicT=null,mstep=0,nextT=0,noiseBuf;
function initAudio(){if(AC){if(AC.state==='suspended')AC.resume();return}
 var C=window.AudioContext||window.webkitAudioContext;if(!C)return;AC=new C();
 mG=AC.createGain();sG=AC.createGain();mG.connect(AC.destination);sG.connect(AC.destination);applyVol();
 noiseBuf=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);var d=noiseBuf.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=Math.random()*2-1;
 var n=AC.createBufferSource();n.buffer=noiseBuf;n.loop=true;var f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=700;f.Q.value=0.6;
 crowdG=AC.createGain();crowdG.gain.value=0.05;n.connect(f);f.connect(crowdG);crowdG.connect(sG);n.start();
 nextT=AC.currentTime+0.1;musicT=setInterval(sched,50)}
function vol(v){v=v/100;return v<=0?0:v*v}
function applyVol(){if(!AC)return;mG.gain.value=vol(S.music)*0.5;sG.gain.value=vol(S.sfx)*0.9}
var BASS=[0,0,7,0,5,5,3,5,0,0,7,0,10,10,7,5],ARP=[12,16,19,24,19,16,12,16,15,19,22,27,22,19,17,19];
function sched(){if(!AC)return;if(S.music<=0){nextT=AC.currentTime+0.1;return}
 var sp=60/132/4;while(nextT<AC.currentTime+0.2){var s=mstep%16,bar=Math.floor(mstep/16)%4,root=[0,-4,-7,-2][bar];
  tone(mG,'triangle',55*Math.pow(2,(BASS[s]+root+12)/12),nextT,sp*1.8,0.22);
  if(s%2===0)tone(mG,'square',220*Math.pow(2,(ARP[s]+root)/12),nextT,sp*0.9,0.05);
  if(s%4===2)noise(mG,nextT,0.04,0.08,6000);if(s%8===0)tone(mG,'sine',90,nextT,0.12,0.4,40);
  nextT+=sp;mstep++}}
function tone(dst,type,f,t,d,g,f2){var o=AC.createOscillator(),a=AC.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);
 a.gain.setValueAtTime(g,t);a.gain.exponentialRampToValueAtTime(0.0001,t+d);o.connect(a);a.connect(dst);o.start(t);o.stop(t+d+0.02)}
function noise(dst,t,d,g,fq){var n=AC.createBufferSource();n.buffer=noiseBuf;var f=AC.createBiquadFilter();f.type='highpass';f.frequency.value=fq||1000;var a=AC.createGain();
 a.gain.setValueAtTime(g,t);a.gain.exponentialRampToValueAtTime(0.0001,t+d);n.connect(f);f.connect(a);a.connect(dst);n.start(t,Math.random());n.stop(t+d+0.02)}
function sfx(k,p){if(!AC||S.sfx<=0)return;var t=AC.currentTime;p=p||1;
 if(k==='kick'){tone(sG,'sine',180*p,t,0.09,0.5,60);noise(sG,t,0.05,0.25,1500)}
 else if(k==='pass'){tone(sG,'sine',260,t,0.06,0.35,110)}
 else if(k==='whistle'){tone(sG,'square',2300,t,0.25,0.08);tone(sG,'square',2380,t,0.25,0.06)}
 else if(k==='long'){tone(sG,'square',2300,t,0.7,0.07);tone(sG,'square',2380,t+0.1,0.6,0.05)}
 else if(k==='post'){tone(sG,'triangle',900,t,0.3,0.3,700)}
 else if(k==='tackle'){noise(sG,t,0.12,0.3,400)}
 else if(k==='goal'){noise(sG,t,2.2,0.5,500);[0,4,7,12].forEach(function(n,i){tone(sG,'square',523*Math.pow(2,n/12),t+i*0.09,0.3,0.08)});crowdG.gain.setValueAtTime(0.35,t);crowdG.gain.exponentialRampToValueAtTime(0.05,t+3)}
 else if(k==='click'){tone(sG,'sine',700,t,0.05,0.2)}}
// ---------- input ----------
function mkIn(){return{x:0,y:0,kick:false,kickT:0,sw:false,swipe:0,_kp:false}}
var IN=[mkIn(),mkIn()],keys={};
addEventListener('keydown',function(e){keys[e.code]=true;if(e.code==='Escape'&&G.state!=='menu')togglePause();if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code)>=0)e.preventDefault();initAudio()});
addEventListener('keyup',function(e){keys[e.code]=false});
var touches={};// id -> {kind,pl,x0,y0,x,y}
function zoneFor(x,y){var two=G.mode===2,port=ch>=cw;
 if(!two){return{pl:0,kind:x<cw*0.5?'joy':'kick'}}
 if(port){var pl=y>ch/2?0:1;if(pl===0)return{pl:0,kind:x<cw*0.55?'joy':'kick'};return{pl:1,kind:x>cw*0.45?'joy':'kick'}}
 var pl2=x<cw/2?0:1;if(pl2===0)return{pl:0,kind:x<cw*0.3?'joy':'kick'};return{pl:1,kind:x>cw*0.7?'joy':'kick'}}
cv.addEventListener('pointerdown',function(e){e.preventDefault();initAudio();if(G.state==='menu')return;try{cv.setPointerCapture(e.pointerId)}catch(_){}
 var r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,z=zoneFor(x,y);touches[e.pointerId]={kind:z.kind,pl:z.pl,x0:x,y0:y,x:x,y:y};
 if(z.kind==='kick'){IN[z.pl].tKick=true}});
cv.addEventListener('pointermove',function(e){var t=touches[e.pointerId];if(!t)return;var r=cv.getBoundingClientRect();t.x=e.clientX-r.left;t.y=e.clientY-r.top});
function pend(e){var t=touches[e.pointerId];if(!t)return;delete touches[e.pointerId];if(t.kind==='kick'){var i=IN[t.pl];i.tKick=false;var dx=t.x-t.x0,dy=t.y-t.y0;i.swipeV={x:dx,y:dy}}}
cv.addEventListener('pointerup',pend);cv.addEventListener('pointercancel',pend);
function readInput(){
 for(var p=0;p<2;p++){var i=IN[p],x=0,y=0,k=false,sw=false;
  if(p===0){if(keys.KeyA)x--;if(keys.KeyD)x++;if(keys.KeyW)y--;if(keys.KeyS)y++;k=keys.Space;sw=keys.ShiftLeft;
   if(G.mode===1){if(keys.ArrowLeft)x--;if(keys.ArrowRight)x++;if(keys.ArrowUp)y--;if(keys.ArrowDown)y++;k=k||keys.Enter;sw=sw||keys.ShiftRight}}
  else{if(keys.ArrowLeft)x--;if(keys.ArrowRight)x++;if(keys.ArrowUp)y--;if(keys.ArrowDown)y++;k=keys.Enter;sw=keys.ShiftRight}
  for(var id in touches){var t=touches[id];if(t.pl!==p||t.kind!=='joy')continue;var dx=t.x-t.x0,dy=t.y-t.y0,m=Math.hypot(dx,dy),R=48;
   if(m>R){t.x0=t.x-dx/m*R;t.y0=t.y-dy/m*R;dx=t.x-t.x0;dy=t.y-t.y0;m=R}
   if(m>6){x=dx/R;y=dy/R}
   if(p===1&&G.mode===2&&ch>=cw){x=-x;y=-y}}
  var m2=Math.hypot(x,y);if(m2>1){x/=m2;y/=m2}
  i.x=x;i.y=y;i.kickPrev=i.kick;i.kick=!!(k||i.tKick);i.swPress=sw&&!i._sw;i._sw=sw}}
// ---------- game state ----------
var G={state:'menu',mode:1,score:[0,0],time:0,paused:false,slow:1,shake:0,timer:0,players:[],ctrl:[null,null],parts:[],net:[[],[]],flash:[],matchShots:[0,0]};
for(var q=0;q<2;q++)for(var k2=0;k2<24;k2++){G.net[q].push({d:0,v:0})}
var ball={x:PW/2,y:PH/2,z:0,vx:0,vy:0,vz:0,spin:0,rot:0,owner:null,last:0,after:null,trail:[]};
var FORM=[[0.5,0.985],[0.27,0.76],[0.73,0.76],[0.5,0.6],[0.5,0.53]];
function mkPlayers(){G.players=[];for(var t=0;t<2;t++)for(var i=0;i<5;i++){var f=FORM[i],hx=f[0]*PW,hy=f[1]*PH;if(t===1){hx=PW-hx;hy=PH-hy}
 G.players.push({t:t,i:i,gk:i===0,num:[1,2,3,8,9][i],hx:hx,hy:hy,x:hx,y:hy,vx:0,vy:0,fx:0,fy:t===0?-1:1,run:Math.random()*6,kickA:0,noT:0,slide:0,think:0,dive:0,hold:0,recv:0,ox:0,oy:0})}}
function team(t){return G.players.filter(function(p){return p.t===t})}
function human(t){return G.mode===2||t===0}
function kickoff(t){G.players.forEach(function(p){var y=p.hy;if(p.t===0)y=Math.max(y,PH/2+30);else y=Math.min(y,PH/2-30);p.x=p.hx;p.y=y;p.vx=p.vy=0;p.slide=0;p.hold=0;p.dive=0;p.fx=0;p.fy=p.t===0?-1:1});
 var f=G.players.find(function(p){return p.t===t&&p.i===4});f.x=PW/2;f.y=PH/2+(t===0?12:-12);
 ball.x=PW/2;ball.y=PH/2;ball.z=ball.vx=ball.vy=ball.vz=ball.spin=0;ball.owner=null;ball.after=null;
 for(var h=0;h<2;h++)if(human(h))G.ctrl[h]=G.players.find(function(p){return p.t===h&&p.i===4});
 G.state='kickoff';G.timer=1.1;G.koTeam=t}
function startMatch(mode){G.mode=mode;G.score=[0,0];G.time=S.len*60;G.matchShots=[0,0];G.played=0;mkPlayers();G.ctrl=[null,null];
 $('n0').textContent=mode===2?'P1':'YOU';$('n1').textContent=mode===2?'P2':'CPU';
 hideAll();$('hud').classList.remove('hidden');kickoff(Math.random()<0.5?0:1);sfx('whistle');updHud()}
function updHud(){$('score').textContent=G.score[0]+' - '+G.score[1];var t=Math.max(0,Math.ceil(G.time));$('clock').textContent=Math.floor(t/60)+':'+('0'+t%60).slice(-2)}
// ---------- helpers ----------
function d2(a,b){var dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy}
function clamp(v,a,b){return v<a?a:v>b?b:v}
function goalY(t){return t===0?0:PH}// goal team t attacks
function kick(p,dx,dy,sp,vz,spin,isHuman){var m=Math.hypot(dx,dy)||1;dx/=m;dy/=m;ball.owner=null;ball.x=p.x+dx*(PR+3);ball.y=p.y+dy*(PR+3);ball.vx=dx*sp;ball.vy=dy*sp;ball.vz=vz;ball.z=Math.max(ball.z,1);ball.spin=spin||0;ball.last=p.t;
 p.noT=0.28;p.kickA=0.2;p.fx=dx;p.fy=dy;ball.after=isHuman?{p:p,t:0.5}:null;sfx(sp>420?'kick':'pass',sp>420?1:1.2)}
function bestPass(p,fx,fy){var best=null,bs=1e9;team(p.t).forEach(function(o){if(o===p||o.gk&&Math.random()<0.7)return;var dx=o.x-p.x,dy=o.y-p.y,d=Math.hypot(dx,dy);if(d<30||d>380)return;
 var ang=Math.acos(clamp((dx*fx+dy*fy)/d,-1,1));if(ang>1.0)return;var block=0;team(1-p.t).forEach(function(e){var ex=e.x-p.x,ey=e.y-p.y,pr=(ex*dx+ey*dy)/d;if(pr>0&&pr<d){var perp=Math.abs(ex*dy-ey*dx)/d;if(perp<16)block+=120}});
 var s=d*0.6+ang*220+block;if(s<bs){bs=s;best=o}});return best}
function doPass(p,fx,fy,isHuman){var o=bestPass(p,fx,fy);if(o){var tx=o.x+o.vx*0.35,ty=o.y+o.vy*0.35,d=Math.hypot(tx-p.x,ty-p.y);kick(p,tx-p.x,ty-p.y,clamp(d*1.5+140,230,470),d>220?110:0,0,isHuman);o.recv=1.2;
  if(isHuman&&human(p.t))G.ctrl[p.t]=o}else kick(p,fx,fy,380,40,0,isHuman)}
function doShot(p,fx,fy,charge,isHuman,swipe){var sp=400+charge*330,vz=50+charge*230;var spin=0;
 if(swipe){var m=Math.hypot(fx,fy)||1;spin=clamp((swipe.x*(-fy/m)+swipe.y*(fx/m))*-6,-420,420)}
 kick(p,fx,fy,sp,vz,spin,isHuman);G.matchShots[p.t]++;if(human(p.t)&&(G.mode===1?p.t===0:true))ST.shots++}
// ---------- update ----------
function nearestTo(t,x,y,excl){var b=null,bd=1e9;G.players.forEach(function(p){if(p.t!==t||p.gk||p===excl)return;var d=(p.x-x)*(p.x-x)+(p.y-y)*(p.y-y);if(d<bd){bd=d;b=p}});return b}
function steer(p,tx,ty,sp,dt){var dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy);var vx=0,vy=0;if(d>3){var s=Math.min(sp,d*4);vx=dx/d*s;vy=dy/d*s}
 p.vx+=(vx-p.vx)*Math.min(1,dt*10);p.vy+=(vy-p.vy)*Math.min(1,dt*10)}
function humanUpdate(p,inp,dt){var sp=p===ball.owner?140:158;
 if(p.slide>0){p.slide-=dt;p.vx*=Math.exp(-dt*3);p.vy*=Math.exp(-dt*3)}
 else{p.vx+=(inp.x*sp-p.vx)*Math.min(1,dt*12);p.vy+=(inp.y*sp-p.vy)*Math.min(1,dt*12)}
 if(inp.x||inp.y){var m=Math.hypot(inp.x,inp.y);if(p.slide<=0){p.fx=inp.x/m;p.fy=inp.y/m}}
 // kick handling
 if(inp.kick&&!inp.kickPrev){inp.kickT=0;inp.charging=true;
  if(ball.owner!==p){var d=Math.sqrt(d2(p,ball));if(d<48&&p.slide<=0&&ball.z<10){p.slide=0.38;p.vx=p.fx*270;p.vy=p.fy*270;sfx('tackle')}
   else if(d>=48){var n=nearestTo(p.t,ball.x,ball.y);if(n)G.ctrl[p.t]=n}inp.charging=false}}
 if(inp.kick&&inp.charging){inp.kickT+=dt;if(ball.owner!==p&&!(Math.sqrt(d2(p,ball))<16&&ball.z<12))inp.kickT=Math.min(inp.kickT,0.75);
  if(inp.kickT>0.75&&ball.owner===p){release(p,inp)}}
 if(!inp.kick&&inp.kickPrev&&inp.charging){release(p,inp)}
 if(inp.swPress){var n2=nearestTo(p.t,ball.x,ball.y,p);if(n2)G.ctrl[p.t]=n2}}
function release(p,inp){inp.charging=false;var has=ball.owner===p||(d2(p,ball)<16*16&&ball.z<12&&!ball.owner);var sw=inp.swipeV;inp.swipeV=null;if(!has)return;
 var fx=p.fx,fy=p.fy;if(inp.kickT<0.2){doPass(p,fx,fy,true)}else doShot(p,fx,fy,clamp((inp.kickT-0.2)/0.55,0,1),true,sw)}
function aiOwner(p,dt){var gy=goalY(p.t),dir=p.t===0?-1:1;p.think-=dt;var dg=Math.hypot(PW/2-p.x,gy-p.y);
 var opp=team(1-p.t),near=null,nd=1e9;opp.forEach(function(o){var d=d2(o,p);if(d<nd){nd=d;near=o}});nd=Math.sqrt(nd);
 if(p.gk){p.hold-=dt;p.vx*=0.8;p.vy*=0.8;if(p.hold<=0){var fx=(Math.random()-0.5)*0.8,fy=-dir;var o=bestPass(p,fx,-dir===1?1:-1);if(o&&Math.random()<0.6)doPass(p,o.x-p.x,o.y-p.y,false);else kick(p,fx,dir===-1?-1:1,430,180,0,false)}return}
 var skill=[0.75,0.9,1.0][S.diff];
 if(p.think<=0){p.think=0.22+Math.random()*0.2;
  if(dg<175&&Math.random()<0.75*skill+0.15){var ax=PW/2+(Math.random()<0.5?-1:1)*GW*(0.18+Math.random()*0.22);doShot(p,ax-p.x,gy-p.y,0.35+Math.random()*0.55,false);if(Math.random()<0.4)ball.spin=(Math.random()-0.5)*300;return}
  if(nd<34&&Math.random()<0.55*skill+0.1){var o2=bestPass(p,0,dir);if(o2){doPass(p,o2.x-p.x,o2.y-p.y,false);return}}}
 var tx=PW/2,ty=gy,sx=0;if(near&&nd<70){var side=(p.x-near.x)>=0?1:-1;sx=side*60}
 tx=clamp(p.x+sx+(PW/2-p.x)*0.3,30,PW-30);steer(p,tx,p.y+dir*80,128*(0.88+0.12*skill),dt)}
function aiMove(p,dt){var dir=p.t===0?-1:1,bx=ball.x,by=ball.y,skill=[0.8,0.92,1.0][S.diff];
 if(p.gk){gkUpdate(p,dt);return}
 var poss=ball.owner?ball.owner.t:-1;
 if(p.recv>0&&!ball.owner){p.recv-=dt;steer(p,bx+ball.vx*0.15,by+ball.vy*0.15,165,dt);return}
 var chaser=nearestTo(p.t,bx,by,human(p.t)?G.ctrl[p.t]:null);
 var isCh=chaser===p&&(poss!==p.t)&&(!human(p.t)||d2(p,ball)<70*70);
 if(isCh){var lx=bx+ball.vx*0.2,ly=by+ball.vy*0.2;steer(p,lx,ly,(human(p.t)?150:158)*(p.t===1&&G.mode===1?skill:1),dt);return}
 var shiftY=(by-PH/2)*0.55,fwd=poss===p.t?dir*-0.0:0;var ax=p.hx+(bx-PW/2)*0.35,ay=p.hy+shiftY+(poss===p.t?dir*70:-dir*20);
 if(p.i===4&&poss===p.t)ay=by+dir*110;steer(p,clamp(ax,20,PW-20),clamp(ay,25,PH-25),130,dt)}
function gkUpdate(p,dt){var gl=p.t===0?PH:0,dir=p.t===0?-1:1;var tx=clamp(PW/2+(ball.x-PW/2)*0.35,PW/2-GW/2+6,PW/2+GW/2-6),ty=gl+dir*12;
 var coming=(p.t===0?ball.vy>60:ball.vy<-60)&&Math.abs(ball.y-gl)<260&&!ball.owner;
 if(coming){var tt=(gl-ball.y)/(ball.vy||1);var ix=ball.x+ball.vx*tt;tx=clamp(ix,PW/2-GW/2-4,PW/2+GW/2+4);var sp=[150,175,195][S.diff];if(G.mode===2)sp=175;steer(p,tx,ty,sp,dt);if(Math.abs(ix-p.x)>14&&Math.abs(ball.y-gl)<70)p.dive=0.3}
 else if(!ball.owner&&Math.abs(ball.y-gl)<90&&Math.abs(ball.x-PW/2)<130&&nearestTo(1-p.t,ball.x,ball.y)&&Math.sqrt(d2(nearestTo(1-p.t,ball.x,ball.y),ball))>30){steer(p,ball.x,ball.y,150,dt)}
 else steer(p,tx,ty,120,dt);p.fx=0;p.fy=dir;if(p.dive>0)p.dive-=dt}
function step(dt){readInput();
 G.players.forEach(function(p){p.noT=Math.max(0,p.noT-dt);p.kickA=Math.max(0,p.kickA-dt)});
 if(G.state==='kickoff'||G.state==='setpiece'){G.timer-=dt;G.players.forEach(function(p){p.vx*=0.8;p.vy*=0.8;p.x+=p.vx*dt;p.y+=p.vy*dt});
  if(G.state==='setpiece'&&G.sp){var tk=G.sp.p;tk.x+= (G.sp.x-tk.x)*Math.min(1,dt*8);tk.y+=(G.sp.y-tk.y)*Math.min(1,dt*8);ball.x=G.sp.x+G.sp.fx*9;ball.y=G.sp.y+G.sp.fy*9;ball.z=0;tk.fx=G.sp.fx;tk.fy=G.sp.fy;
   G.players.forEach(function(o){if(o.t!==tk.t){var d=Math.sqrt(d2(o,ball));if(d<55){o.x+=(o.x-ball.x)/(d||1)*80*dt;o.y+=(o.y-ball.y)/(d||1)*80*dt}}})}
  if(G.timer<=0){if(G.state==='kickoff'){sfx('whistle');var f=G.players.find(function(p){return p.t===G.koTeam&&p.i===4});ball.owner=f;f.noT=0}
   else{ball.owner=G.sp.p;G.sp.p.noT=0;if(human(G.sp.p.t))G.ctrl[G.sp.p.t]=G.sp.p;else G.sp.p.think=0.4}
   G.state='play'}
  updBallOwned();return}
 if(G.state==='goal'){G.timer-=dt;physBall(dt);G.players.forEach(function(p){var sc=p.t===G.goalTeam;if(sc){steer(p,p.x+Math.sin(G.timer*6+p.i)*20,p.y+(p.t===0?-1:1)*20,90,dt)}else p.vx*=0.9,p.vy*=0.9;p.x+=p.vx*dt;p.y+=p.vy*dt;p.run+=Math.hypot(p.vx,p.vy)*dt*0.12});
  if(G.timer<=0){if(G.time<=0)endMatch();else kickoff(1-G.goalTeam)}return}
 if(G.state!=='play')return;
 G.time-=dt;G.played+=dt;if(G.time<=0&&!(ball.z>0&&Math.abs(ball.y-PH/2)>PH*0.35)){G.time=0;updHud();endMatch();return}
 for(var h=0;h<2;h++)if(human(h)){var c=G.ctrl[h];
  // auto switch to nearest when ball is loose & far
  if(c&&ball.owner!==c&&!IN[h].charging){var n=nearestTo(h,ball.x,ball.y);if(n&&n!==c&&d2(n,ball)+50*50<d2(c,ball)&&(!ball.owner||ball.owner.t!==h)&&c.slide<=0)G.ctrl[h]=n}
  if(ball.owner&&ball.owner.t===h&&!ball.owner.gk)G.ctrl[h]=ball.owner}
 G.players.forEach(function(p){var hc=human(p.t)&&G.ctrl[p.t]===p;
  if(hc&&!(p.gk&&ball.owner===p))humanUpdate(p,IN[p.t],dt);else if(ball.owner===p)aiOwner(p,dt);else aiMove(p,dt);
  if(!hc&&(p.vx||p.vy)&&p.slide<=0&&!p.gk){var m=Math.hypot(p.vx,p.vy);if(m>20){p.fx=p.vx/m;p.fy=p.vy/m}}
  p.x+=p.vx*dt;p.y+=p.vy*dt;p.x=clamp(p.x,-30,PW+30);p.y=clamp(p.y,-20,PH+20);p.run+=Math.hypot(p.vx,p.vy)*dt*0.12});
 // separation
 var P=G.players;for(var i=0;i<P.length;i++)for(var j=i+1;j<P.length;j++){var a=P[i],b=P[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>0&&d<PR*2){var o=(PR*2-d)/2;a.x-=dx/d*o;a.y-=dy/d*o;b.x+=dx/d*o;b.y+=dy/d*o}}
 // aftertouch
 if(ball.after){var A=ball.after;A.t-=dt;var inp=IN[A.p.t];if(A.t<=0||ball.owner||!human(A.p.t))ball.after=null;else{var sp=Math.hypot(ball.vx,ball.vy)||1,nx=-ball.vy/sp,ny=ball.vx/sp;var side=inp.x*nx+inp.y*ny,along=inp.x*ball.vx/sp+inp.y*ball.vy/sp;ball.spin+=side*900*dt;if(along<-0.4)ball.vz+=260*dt;else if(along>0.4&&ball.z>2)ball.vz-=300*dt}}
 // possession/tackles
 updBallOwned();
 if(!ball.owner){physBall(dt);var took=null,bd=1e9;P.forEach(function(p){if(p.noT>0)return;var d=d2(p,ball);var reach=p.gk?(p.dive>0?20:14):(p.slide>0?14:11);var zr=p.gk?GH:9;if(d<reach*reach&&ball.z<zr&&d<bd){bd=d;took=p}});
  if(took){var spd=Math.hypot(ball.vx,ball.vy);if(took.gk&&spd>360&&Math.random()<clamp((spd-360)/500,0,0.55)){ball.vx=-ball.vx*0.3+(Math.random()-0.5)*200;ball.vy=-ball.vy*0.35;ball.vz=80;took.noT=0.4;ball.last=took.t;sfx('tackle')}
   else{ball.owner=took;ball.last=took.t;took.recv=0;if(took.gk){took.hold=0.8;ball.z=0}if(human(took.t)&&!took.gk)G.ctrl[took.t]=took;ball.after=null;if(spd>200)sfx('pass',0.8)}}}
 else{var ow=ball.owner;P.forEach(function(p){if(p.t===ow.t||p.noT>0||ow.gk)return;var d=d2(p,ball);if(d<12*12){var rate=p.slide>0?60:(human(p.t)&&G.ctrl[p.t]===p?3.2:[1.4,2.2,3.0][S.diff]);if(Math.random()<rate*dt){ball.owner=p;ball.last=p.t;ow.noT=0.5;if(p.slide>0){ball.owner=null;ball.vx=p.vx*0.9+(Math.random()-0.5)*80;ball.vy=p.vy*0.9;p.noT=0.15}sfx('tackle');if(human(p.t))G.ctrl[p.t]=p}}})}
 checkOut()}
function updBallOwned(){var o=ball.owner;if(!o)return;var fx=o.fx,fy=o.fy;ball.x+=(o.x+fx*(PR+3)-ball.x)*0.5;ball.y+=(o.y+fy*(PR+3)-ball.y)*0.5;ball.z=o.gk?6:0;ball.vx=o.vx;ball.vy=o.vy;ball.vz=0;ball.spin=0;ball.rot+=Math.hypot(o.vx,o.vy)*0.016*0.25}
function physBall(dt){var b=ball;b.vz-=900*dt;b.z+=b.vz*dt;if(b.z<=0){b.z=0;if(b.vz<-70){b.vz=-b.vz*0.5;if(b.vz>120&&G.state==='play')sfx('pass',0.6)}else b.vz=0}
 var sp=Math.hypot(b.vx,b.vy);if(sp>1){b.vx+=(-b.vy/sp)*b.spin*dt;b.vy+=(b.vx/sp)*b.spin*dt}b.spin*=Math.exp(-1.4*dt);
 var fr=b.z>0?0.25:1.25;b.vx*=Math.exp(-fr*dt);b.vy*=Math.exp(-fr*dt);if(b.z===0&&sp<8){b.vx=b.vy=0}
 var ox=b.x,oy=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;b.rot+=sp*dt*0.25;
 // posts
 [0,PH].forEach(function(gl){[PW/2-GW/2,PW/2+GW/2].forEach(function(px){var dx=b.x-px,dy=b.y-gl,d=Math.hypot(dx,dy);if(d<5&&b.z<GH){var nx=dx/d,ny=dy/d,vn=b.vx*nx+b.vy*ny;if(vn<0){b.vx-=1.7*vn*nx;b.vy-=1.7*vn*ny;b.x=px+nx*5;b.y=gl+ny*5;sfx('post')}}})});
 // inside net
 var inG=b.x>PW/2-GW/2&&b.x<PW/2+GW/2;if(G.state==='goal'||G.netBall){if(b.y<-GD+3){b.y=-GD+3;b.vy=Math.abs(b.vy)*0.15;ripple(0,b.x)}if(b.y>PH+GD-3){b.y=PH+GD-3;b.vy=-Math.abs(b.vy)*0.15;ripple(1,b.x)}
  if(b.y<0||b.y>PH){if(b.x<PW/2-GW/2+3){b.x=PW/2-GW/2+3;b.vx=Math.abs(b.vx)*0.2;ripple(b.y<0?0:1,b.x)}if(b.x>PW/2+GW/2-3){b.x=PW/2+GW/2-3;b.vx=-Math.abs(b.vx)*0.2;ripple(b.y<0?0:1,b.x)}if(b.z>GH-4){b.z=GH-4;b.vz=-Math.abs(b.vz)*0.2}}}
 b.trail.push({x:b.x,y:b.y,z:b.z});if(b.trail.length>10)b.trail.shift()}
function ripple(g,x){var i=clamp(Math.round((x-(PW/2-GW/2))/GW*23),0,23);for(var k=-3;k<=3;k++){var n=G.net[g][clamp(i+k,0,23)];n.v+=(4-Math.abs(k))*40}}
function checkOut(){var b=ball;if(b.owner){if(b.owner.gk)return;}
 var inG=b.x>PW/2-GW/2&&b.x<PW/2+GW/2;
 if(b.y<0&&inG&&b.z<GH){goal(0);return}if(b.y>PH&&inG&&b.z<GH){goal(1);return}
 if(b.owner&&(b.x<-2||b.x>PW+2||b.y<-2||b.y>PH+2)){b.owner.x=clamp(b.owner.x,0,PW);b.owner.y=clamp(b.owner.y,0,PH);b.x=clamp(b.x,1,PW-1);b.y=clamp(b.y,1,PH-1);return}
 if(b.x<-3||b.x>PW+3){var t=1-b.last;setPiece(t,clamp(b.x,0,PW),clamp(b.y,8,PH-8),b.x<0?1:-1,0,'Throw-in');return}
 if(b.y<-3||b.y>PH+3){var top=b.y<0;var def=top?1:0;// defending team at this end
  if(b.last===def){var cx=b.x<PW/2?4:PW-4;setPiece(1-def,cx,top?4:PH-4,cx<PW/2?0.7:-0.7,top?0.7:-0.7,'Corner')}
  else{var gk=G.players.find(function(p){return p.t===def&&p.gk});setPiece(def,PW/2,top?40:PH-40,0,top?1:-1,'Goal kick',gk)}}}
function setPiece(t,x,y,fx,fy,label,taker){var p=taker||nearestTo(t,x,y);var m=Math.hypot(fx,fy)||1;G.sp={p:p,x:x,y:y,fx:fx/m,fy:fy/m};ball.owner=null;ball.vx=ball.vy=ball.vz=0;ball.spin=0;ball.after=null;G.state='setpiece';G.timer=0.9;banner(label,'',900);sfx('whistle');
 if(human(t))G.ctrl[t]=p}
function goal(t){G.score[t]++;G.state='goal';G.goalTeam=t;G.timer=2.8;G.netBall=true;G.slow=0.3;G.shake=1;ball.owner=null;ball.after=null;updHud();sfx('goal');
 var gy=t===0?0:PH;for(var i=0;i<140;i++){var a=Math.random()*Math.PI*2,s=60+Math.random()*260;G.parts.push({x:ball.x,y:gy,vx:Math.cos(a)*s,vy:Math.sin(a)*s,z:0,vz:150+Math.random()*250,c:Math.random()<0.6?TEAMC[t].shirt:['#ffe14d','#ffffff','#5df2a0'][i%3],l:1.6+Math.random(),r:Math.random()*6})}
 var who=G.mode===2?(t===0?'P1':'P2'):(t===0?'YOU':'CPU');banner('GOAL!',who+' scores  '+G.score[0]+'-'+G.score[1],2200);
 G.flashT=2.5}
function endMatch(){G.state='end';sfx('long');var s=G.score;ST.matches++;ST.time+=Math.round(G.played||0);ST.goals+=s[0];ST.conceded+=s[1];if(s[0]>s[1])ST.wins++;else if(s[0]<s[1])ST.losses++;else ST.draws++;ST.best=Math.max(ST.best,s[0]-s[1]);saveST();
 $('endS').textContent=s[0]+' - '+s[1];var a=G.mode===2?['P1 wins!','P2 wins!']:['You win!','CPU wins'];$('endM').textContent=s[0]>s[1]?a[0]:s[0]<s[1]?a[1]:'A draw!';$('end').classList.remove('hidden');$('hud').classList.add('hidden')}
var bT=null;function banner(t,sub,ms){var b=$('banner');b.innerHTML=t+(sub?'<small>'+sub+'</small>':'');b.classList.remove('hidden');b.style.animation='none';void b.offsetWidth;b.style.animation='';b.style.fontSize=t.length>6?'40px':'64px';clearTimeout(bT);bT=setTimeout(function(){b.classList.add('hidden')},ms)}
// ---------- rendering ----------
var bg=null,bgR=0;
function rnd(s){return function(){s=(s*16807)%2147483647;return s/2147483647}}
function buildBg(){var R=clamp(scale*dpr,1,2.6);if(bg&&Math.abs(R-bgR)<0.01)return;bgR=R;bg=document.createElement('canvas');bg.width=Math.ceil((X1-X0)*R);bg.height=Math.ceil((Y1-Y0)*R);var c=bg.getContext('2d');c.scale(R,R);c.translate(-X0,-Y0);var r=rnd(7);
 // stands
 var g=c.createLinearGradient(0,Y0,0,Y1);g.addColorStop(0,'#bfe3ff');g.addColorStop(0.5,'#d8efff');g.addColorStop(1,'#bfe3ff');c.fillStyle=g;c.fillRect(X0,Y0,X1-X0,Y1-Y0);
 var crowd=['#ff5d73','#ffd34d','#5dc8ff','#ffffff','#7cf29a','#ff9d3d','#b98bff','#1e7bff','#ff7a1a'];
 function stand(x,y,w,h){c.fillStyle='#8fb7d8';c.fillRect(x,y,w,h);for(var yy=y+3;yy<y+h-2;yy+=7){c.fillStyle=((yy/7|0)%2)?'#a9cbe6':'#9ac1e0';c.fillRect(x,yy-2,w,6);for(var xx=x+3;xx<x+w-2;xx+=6){if(r()<0.88){c.fillStyle=crowd[(r()*crowd.length)|0];c.beginPath();c.arc(xx+r()*2,yy,2.3,0,7);c.fill();c.fillStyle='rgba(255,224,190,.9)';c.beginPath();c.arc(xx+r()*2,yy-1.6,1.2,0,7);c.fill()}}}}
 stand(X0+6,Y0+6,X1-X0-12,70);stand(X0+6,Y1-76,X1-X0-12,70);stand(X0+6,Y0+80,58,Y1-Y0-160);stand(X1-64,Y0+80,58,Y1-Y0-160);
 // grass surround
 c.fillStyle='#3fae4b';c.fillRect(-48,-62,PW+96,PH+124);
 // ad boards
 var ads=['KICKABOUT','#1e7bff','GOAL!','#ff7a1a','PLAY ON','#16b36e','KICKABOUT','#e8417a'];c.font='bold 9px system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';
 for(var i=0;i<10;i++){var w=(PW+96)/10,col=ads[(i%4)*2+1];[[-48+i*w,-66],[-48+i*w,PH+58]].forEach(function(a,k){c.fillStyle=col;c.fillRect(a[0]+1,a[1],w-2,8);c.fillStyle='#fff';c.fillText(ads[(i%4)*2],a[0]+w/2,a[1]+4.5)})}
 for(i=0;i<16;i++){var hh=(PH+124)/16,col2=ads[((i+1)%4)*2+1];c.fillStyle=col2;c.fillRect(-56,-62+i*hh+1,8,hh-2);c.fillRect(PW+48,-62+i*hh+1,8,hh-2)}
 // stripes
 for(var s=0;s*40<PH+124;s++){c.fillStyle=s%2?'#47b852':'#55c860';c.fillRect(-48,-62+s*40,PW+96,40)}
 for(var s2=0;s2*50<PW+96;s2++){c.fillStyle=s2%2?'rgba(255,255,255,.035)':'rgba(0,0,0,.025)';c.fillRect(-48+s2*50,-62,50,PH+124)}
 for(i=0;i<5000;i++){c.fillStyle=r()<0.5?'rgba(255,255,255,.06)':'rgba(0,60,0,.06)';c.fillRect(-48+r()*(PW+96),-62+r()*(PH+124),1,1.6)}
 var lg=c.createRadialGradient(PW/2,PH/2,50,PW/2,PH/2,PH*0.7);lg.addColorStop(0,'rgba(255,255,220,.12)');lg.addColorStop(1,'rgba(0,40,0,.06)');c.fillStyle=lg;c.fillRect(-48,-62,PW+96,PH+124);
 // markings
 c.strokeStyle='rgba(255,255,255,.95)';c.lineWidth=2.4;c.strokeRect(0,0,PW,PH);c.beginPath();c.moveTo(0,PH/2);c.lineTo(PW,PH/2);c.stroke();c.beginPath();c.arc(PW/2,PH/2,60,0,7);c.stroke();
 c.fillStyle='#fff';[[PW/2,PH/2],[PW/2,90],[PW/2,PH-90]].forEach(function(p){c.beginPath();c.arc(p[0],p[1],2.6,0,7);c.fill()});
 [[0,1],[PH,-1]].forEach(function(e){var y=e[0],d=e[1];c.strokeRect(PW/2-130,Math.min(y,y+d*120),260,120);c.strokeRect(PW/2-60,Math.min(y,y+d*40),120,40);c.beginPath();c.arc(PW/2,y+d*90,58,d>0?0.3*Math.PI:1.3*Math.PI,d>0?0.7*Math.PI:1.7*Math.PI);c.stroke()});
 [[0,0,0],[PW,0,0.5],[PW,PH,1],[0,PH,1.5]].forEach(function(k){c.beginPath();c.arc(k[0],k[1],9,k[2]*Math.PI,(k[2]+0.5)*Math.PI);c.stroke()});
 // corner flags
 [[0,0],[PW,0],[0,PH],[PW,PH]].forEach(function(k,i){c.fillStyle='rgba(0,0,0,.15)';c.fillRect(k[0],k[1]-1,9,3);c.fillStyle=i%2?'#ff7a1a':'#ffe14d';c.beginPath();c.moveTo(k[0],k[1]-11);c.lineTo(k[0]+7,k[1]-8);c.lineTo(k[0],k[1]-5);c.fill();c.fillStyle='#fff';c.fillRect(k[0]-0.6,k[1]-11,1.2,11)})}
var cam={x:PW/2,y:PH/2};
function resize(){var r=document.getElementById('wrap').getBoundingClientRect();cw=r.width;ch=r.height;dpr=Math.min(window.devicePixelRatio||1,2.5);cv.width=Math.round(cw*dpr);cv.height=Math.round(ch*dpr);
 scale=clamp(Math.min(cw,ch)/330,1,2.6);if(G.mode===2&&ch>=cw)scale=clamp(cw/420,0.85,2.2);buildBg()}
addEventListener('resize',resize);addEventListener('orientationchange',function(){setTimeout(resize,200)});
function drawGoal(c,g){var gl=g===0?0:PH,d=g===0?-1:1,x0=PW/2-GW/2;var net=G.net[g];
 c.fillStyle='rgba(0,0,0,.12)';c.fillRect(x0+3,gl+(d<0?-GD+3:0),GW,GD);
 c.fillStyle='rgba(255,255,255,.18)';c.fillRect(x0,Math.min(gl,gl+d*GD),GW,GD);
 c.strokeStyle='rgba(255,255,255,.75)';c.lineWidth=0.7;c.beginPath();
 for(var i=0;i<24;i++){var x=x0+i/23*GW,off=net[i].d;c.moveTo(x,gl);c.lineTo(x+off*0.15,gl+d*(GD+off))}
 for(var r=1;r<=5;r++){var f=r/5;c.moveTo(x0,gl+d*GD*f);for(i=0;i<24;i++){c.lineTo(x0+i/23*GW,gl+d*(GD+net[i].d)*f)}}c.stroke();
 c.strokeStyle='#fff';c.lineWidth=3;c.lineCap='round';c.beginPath();c.moveTo(x0,gl);c.lineTo(x0,gl+d*GD);c.lineTo(x0+GW,gl+d*GD);c.lineTo(x0+GW,gl);c.stroke();
 c.lineWidth=4;c.strokeStyle='rgba(0,0,0,.18)';c.beginPath();c.moveTo(x0+3,gl+4);c.lineTo(x0+GW+3,gl+4);c.stroke();
 c.strokeStyle='#ffffff';c.lineWidth=3.6;c.beginPath();c.moveTo(x0,gl);c.lineTo(x0+GW,gl);c.stroke();c.lineCap='butt'}
function drawPlayer(c,p){var C=TEAMC[p.t];var x=p.x,y=p.y,a=Math.atan2(p.fy,p.fx);var sp=Math.hypot(p.vx,p.vy),sw=Math.sin(p.run)*Math.min(1,sp/60);
 c.fillStyle='rgba(20,60,20,.28)';c.beginPath();c.ellipse(x+3,y+4,8,5,0,0,7);c.fill();
 var hc=human(p.t)&&G.ctrl[p.t]===p&&G.state!=='menu';
 if(hc){c.strokeStyle=p.t===0?'#ffe14d':'#ffffff';c.lineWidth=1.8;c.beginPath();c.ellipse(x,y+1,11,8,0,0,7);c.stroke();
  c.fillStyle=c.strokeStyle;c.beginPath();c.moveTo(x+p.fx*16,y+p.fy*16);c.lineTo(x+p.fx*11-p.fy*4,y+p.fy*11+p.fx*4);c.lineTo(x+p.fx*11+p.fy*4,y+p.fy*11-p.fx*4);c.fill()}
 c.save();c.translate(x,y);c.rotate(a);if(p.slide>0||p.dive>0){c.scale(1.25,0.8)}
 var kk=p.kickA>0?1:0;
 // legs
 c.fillStyle='#ffd9b0';var l1=sw*5+kk*7,l2=-sw*5;c.fillStyle=C.sock;c.fillRect(l1-1,2,5,3);c.fillRect(l2-1,-5,5,3);
 c.fillStyle='#1a1a1a';c.fillRect(l1+3,2,2.5,3);c.fillRect(l2+3,-5,2.5,3);
 // arms
 c.fillStyle='#f2c497';c.beginPath();c.arc(-sw*3,6.4,1.9,0,7);c.arc(sw*3,-6.4,1.9,0,7);c.fill();
 // body
 c.fillStyle=p.gk?(p.t===0?'#2ad17a':'#c06bff'):C.shirt;c.beginPath();c.ellipse(0,0,4.6,6.6,0,0,7);c.fill();c.fillStyle='rgba(255,255,255,.35)';c.beginPath();c.ellipse(1,-1.5,2.4,3.6,0,0,7);c.fill();
 c.fillStyle=C.dark;c.fillRect(-4,-1,1.5,2);
 // head
 c.fillStyle='#f2c497';c.beginPath();c.arc(0.5,0,3.1,0,7);c.fill();c.fillStyle=['#3a2414','#e8b04a','#1a1a1a','#8a4a1e','#c9762b'][(p.i+p.t*2)%5];c.beginPath();c.arc(-0.5,0,2.8,Math.PI*0.45,Math.PI*1.55);c.fill();
 c.restore();
 if(hc){c.font='bold 7px system-ui,sans-serif';c.textAlign='center';c.fillStyle='#13223a';var lab=G.mode===2?(p.t===0?'P1':'P2'):'';if(lab){c.fillText(lab,x,y-12)}}}
function drawBall(c){var b=ball,h=b.z;
 // trail
 if(!b.owner){var sp=Math.hypot(b.vx,b.vy);if(sp>300){for(var i=0;i<b.trail.length;i++){var t=b.trail[i];c.fillStyle='rgba(255,255,255,'+(i/b.trail.length*0.35)+')';c.beginPath();c.arc(t.x,t.y-t.z*0.9,2.6*i/b.trail.length+0.5,0,7);c.fill()}}}
 c.fillStyle='rgba(20,60,20,'+(0.32-Math.min(0.2,h/300))+')';c.beginPath();c.ellipse(b.x+h*0.35+1,b.y+h*0.2+1.5,3.4+h*0.02,2.4+h*0.015,0,0,7);c.fill();
 var r=3.3*(1+h/110),y=b.y-h*0.9;c.save();c.translate(b.x,y);c.fillStyle='#fff';c.beginPath();c.arc(0,0,r,0,7);c.fill();c.clip();c.rotate(b.rot);c.fillStyle='#13223a';
 for(var k=0;k<3;k++){var a=k*2.094;c.beginPath();c.arc(Math.cos(a)*r*0.7,Math.sin(a)*r*0.7,r*0.32,0,7);c.fill()}c.beginPath();c.arc(0,0,r*0.3,0,7);c.fill();c.restore();
 c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=0.6;c.beginPath();c.arc(b.x,y,r,0,7);c.stroke();c.fillStyle='rgba(255,255,255,.8)';c.beginPath();c.arc(b.x-r*0.35,y-r*0.35,r*0.28,0,7);c.fill()}
function drawControls(){if(G.state==='menu'||G.state==='end')return;var two=G.mode===2,port=ch>=cw;var touchy=('ontouchstart' in window)||navigator.maxTouchPoints>0;if(!touchy&&!Object.keys(touches).length)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 function btn(x,y,pl,lab){var i=IN[pl];var ch2=i.charging&&i.kick?Math.min(1,i.kickT/0.75):0;ctx.globalAlpha=0.85;ctx.fillStyle=i.kick?'#ffe14d':'rgba(255,255,255,.75)';ctx.beginPath();ctx.arc(x,y,34,0,7);ctx.fill();
  if(ch2>0){ctx.strokeStyle='#ff7a1a';ctx.lineWidth=6;ctx.beginPath();ctx.arc(x,y,40,-Math.PI/2,-Math.PI/2+ch2*Math.PI*2);ctx.stroke()}
  ctx.fillStyle='#13223a';ctx.font='bold 13px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(lab,x,y);ctx.globalAlpha=1}
 function joyHint(x,y){ctx.globalAlpha=0.35;ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,44,0,7);ctx.stroke();ctx.globalAlpha=1}
 var sb=Math.max(0,parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab'))||0);
 if(!two){btn(cw-62,ch-70-sb,0,'KICK');joyHint(80,ch-80-sb)}
 else if(port){btn(cw-62,ch-70,0,'KICK');joyHint(80,ch-80);ctx.save();ctx.translate(cw,0);ctx.rotate(Math.PI);ctx.translate(0,-0);ctx.restore();btn(62,70,1,'KICK');joyHint(cw-80,80);
  ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillRect(0,ch/2-1,cw,2)}
 else{btn(cw*0.5-70,ch-70,0,'KICK');joyHint(80,ch-80);btn(cw*0.5+70,ch-70,1,'KICK');joyHint(cw-80,ch-80);ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillRect(cw/2-1,0,2,ch)}
 for(var id in touches){var t=touches[id];if(t.kind!=='joy')continue;ctx.globalAlpha=0.5;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(t.x0,t.y0,44,0,7);ctx.fill();ctx.globalAlpha=0.9;ctx.fillStyle=t.pl===0?'#1e7bff':'#ff7a1a';ctx.beginPath();ctx.arc(t.x,t.y,20,0,7);ctx.fill();ctx.globalAlpha=1}}
function render(dt){var vw=cw/scale,vh=ch/scale;
 var tx=ball.x+ball.vx*0.12,ty=ball.y+ball.vy*0.12;if(G.state==='menu'){tx=PW/2+Math.sin(performance.now()/3000)*80;ty=PH/2+Math.cos(performance.now()/4000)*250}
 cam.x+=(tx-cam.x)*Math.min(1,dt*4);cam.y+=(ty-cam.y)*Math.min(1,dt*4);
 var cx=vw>=X1-X0?(X0+X1)/2:clamp(cam.x,X0+vw/2,X1-vw/2),cy=vh>=Y1-Y0?(Y0+Y1)/2:clamp(cam.y,Y0+vh/2,Y1-vh/2);
 var sh=G.shake*G.shake*6,ox=(Math.random()-0.5)*sh,oy=(Math.random()-0.5)*sh;
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#bfe3ff';ctx.fillRect(0,0,cv.width,cv.height);
 var k=dpr*scale;ctx.setTransform(k,0,0,k,(vw/2-cx+ox)*k,(vh/2-cy+oy)*k);
 ctx.imageSmoothingEnabled=true;ctx.drawImage(bg,X0,Y0,X1-X0,Y1-Y0);
 // crowd flashes
 if(Math.random()<(G.flashT>0?0.9:0.12)){G.flash.push({x:X0+10+Math.random()*(X1-X0-20),y:Math.random()<0.5?Y0+10+Math.random()*64:Y1-74+Math.random()*64,l:0.15})}
 G.flash=G.flash.filter(function(f){f.l-=dt;if(f.l<=0)return false;ctx.fillStyle='rgba(255,255,255,'+(f.l/0.15)+')';ctx.beginPath();ctx.arc(f.x,f.y,3+6*(1-f.l/0.15),0,7);ctx.fill();return true});
 if(G.flashT>0){G.flashT-=dt;for(var w=0;w<40;w++){var wx=X0+((w*37+performance.now()*0.05)%(X1-X0)),wy=(w%2?Y0+40:Y1-40)+Math.sin(performance.now()/120+w)*6;ctx.fillStyle=TEAMC[G.goalTeam].shirt;ctx.fillRect(wx,wy,4,7)}}
 drawGoal(ctx,1);
 var list=G.players.slice().sort(function(a,b){return a.y-b.y});
 var ballDrawn=false;list.forEach(function(p){if(!ballDrawn&&ball.y-ball.z*0.9<p.y){drawBall(ctx);ballDrawn=true}drawPlayer(ctx,p)});if(!ballDrawn)drawBall(ctx);
 drawGoal(ctx,0);
 if(ball.z>GH&&(ball.y<20||ball.y>PH-20)){}
 // particles
 G.parts=G.parts.filter(function(q){q.l-=dt;q.vz-=400*dt;q.z+=q.vz*dt;if(q.z<0){q.z=0;q.vz*=-0.3;q.vx*=0.7;q.vy*=0.7}q.x+=q.vx*dt;q.y+=q.vy*dt;q.vx*=0.99;q.vy*=0.99;q.r+=dt*8;if(q.l<=0)return false;
  ctx.save();ctx.globalAlpha=Math.min(1,q.l);ctx.translate(q.x,q.y-q.z);ctx.rotate(q.r);ctx.fillStyle=q.c;ctx.fillRect(-2,-1,4,2.4);ctx.restore();return true});
 // sun sheen
 ctx.setTransform(1,0,0,1,0,0);var gg=ctx.createLinearGradient(0,0,cv.width,cv.height);gg.addColorStop(0,'rgba(255,255,230,.10)');gg.addColorStop(0.5,'rgba(255,255,255,0)');gg.addColorStop(1,'rgba(255,255,255,.04)');ctx.fillStyle=gg;ctx.fillRect(0,0,cv.width,cv.height);
 drawControls()}
// net sim
function netStep(dt){for(var g=0;g<2;g++){var n=G.net[g];for(var i=0;i<24;i++){var l=n[Math.max(0,i-1)].d,r=n[Math.min(23,i+1)].d;n[i].v+=((l+r)/2-n[i].d)*60*dt-n[i].d*30*dt;n[i].v*=Math.exp(-3*dt)}for(i=0;i<24;i++){n[i].d=clamp(n[i].d+n[i].v*dt,-4,14)}}}
// ---------- loop ----------
var last=performance.now(),acc=0;
function frame(now){var dt=Math.min(0.05,(now-last)/1000);last=now;
 if(!G.paused&&G.state!=='menu'&&G.state!=='end'){G.slow+=(1-G.slow)*Math.min(1,dt*1.2);G.shake=Math.max(0,G.shake-dt*1.4);acc+=dt*G.slow;var n=0;while(acc>=1/120&&n<12){step(1/120);netStep(1/120);acc-=1/120;n++}if(G.netBall&&G.state!=='goal')G.netBall=false;
  if(G.state==='play'&&((now/250)|0)!==G._hud){G._hud=(now/250)|0;updHud()}}
 else if(G.state==='menu'){netStep(dt)}
 render(G.paused?0:dt);requestAnimationFrame(frame)}
// ---------- UI ----------
function hideAll(){['menu','pause','stats','help','end'].forEach(function(i){$(i).classList.add('hidden')})}
function show(i){hideAll();$(i).classList.remove('hidden')}
function bindSlider(id,key,fn){var el=$(id),out=el.nextElementSibling;el.value=S[key];out.textContent=S[key];el.addEventListener('input',function(){S[key]=+el.value;out.textContent=el.value;saveS();fn&&fn()})}
bindSlider('sMusic','music',applyVol);bindSlider('sSfx','sfx',function(){applyVol();sfx('click')});bindSlider('sBright','bright',applyBright);
function applyBright(){cv.style.filter=S.bright===100?'':'brightness('+(S.bright/100)+')'}applyBright();
var fromMenu=false;
function togglePause(){if(G.state==='menu'||G.state==='end')return;G.paused=!G.paused;if(G.paused){fromMenu=false;$('pTitle').textContent='Paused';$('bResume').textContent='Resume';$('bQuit').classList.remove('hidden');show('pause')}else hideAll()}
$('pauseBtn').addEventListener('click',function(){initAudio();togglePause()});
$('bResume').addEventListener('click',function(){sfx('click');if(fromMenu){show('menu');return}G.paused=false;hideAll()});
$('bQuit').addEventListener('click',function(){G.paused=false;toMenu()});
function toMenu(){G.state='menu';G.ctrl=[null,null];$('hud').classList.add('hidden');show('menu');mkPlayers()}
$('b1p').addEventListener('click',function(){initAudio();sfx('click');startMatch(1)});
$('b2p').addEventListener('click',function(){initAudio();sfx('click');startMatch(2)});
var LENS=[2,3,5,8];function updLen(){$('bLen').textContent=S.len+' min'}updLen();
$('bLen').addEventListener('click',function(){S.len=LENS[(LENS.indexOf(S.len)+1)%LENS.length];saveS();updLen();initAudio();sfx('click')});
var DIFFS=['Easy','Normal','Hard'];function updDiff(){$('bDiff').textContent=DIFFS[S.diff]}updDiff();
$('bDiff').addEventListener('click',function(){S.diff=(S.diff+1)%3;saveS();updDiff();initAudio();sfx('click')});
$('bSet').addEventListener('click',function(){initAudio();fromMenu=true;$('pTitle').textContent='Settings';$('bResume').textContent='Back';$('bQuit').classList.add('hidden');show('pause')});
function fmtT(s){var h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+'h '+m+'m':m+'m '+(s%60)+'s'}
$('bStats').addEventListener('click',function(){var rows=[['Matches',ST.matches],['Wins',ST.wins],['Draws',ST.draws],['Losses',ST.losses],['Goals scored',ST.goals],['Goals conceded',ST.conceded],['Shots',ST.shots],['Biggest win',ST.best>0?'+'+ST.best:'-'],['Play time',fmtT(ST.time)]];
 $('statList').innerHTML=rows.map(function(r){return '<span>'+r[0]+'</span><b>'+r[1]+'</b>'}).join('');show('stats')});
$('bStatsBack').addEventListener('click',function(){show('menu')});$('bReset').addEventListener('click',function(){if(confirm('Reset all stats?')){for(var k in ST)ST[k]=0;saveST();$('bStats').click()}});
$('bHelp').addEventListener('click',function(){show('help')});$('bHelpBack').addEventListener('click',function(){show(G.state==='menu'?'menu':'pause')});
$('bAgain').addEventListener('click',function(){startMatch(G.mode)});$('bMenu').addEventListener('click',toMenu);
document.addEventListener('visibilitychange',function(){if(document.hidden&&G.state!=='menu'&&G.state!=='end'&&!G.paused)togglePause()});
document.addEventListener('gesturestart',function(e){e.preventDefault()});
mkPlayers();resize();requestAnimationFrame(frame);
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(function(){});
// test hook
window.__ka={G:G,ball:ball,S:S,ST:ST,IN:IN,audio:function(){return AC?{music:mG.gain.value,sfx:sG.gain.value}:null},
 setupShot:function(t){t=t||0;var p=G.players.find(function(q){return q.t===t&&q.i===4});p.x=PW/2;p.y=t===0?110:PH-110;p.fx=0;p.fy=t===0?-1:1;ball.owner=p;G.state='play';if(human(t))G.ctrl[t]=p;
  G.players.forEach(function(q){if(q.t!==t&&!q.gk){q.x=q.hx;q.y=t===0?PH-80:80}if(q.gk&&q.t!==t){q.x=PW/2-GW/2+8}});return p}};
})();
