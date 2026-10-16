// Add new games here.
var GAMES=[
 {id:'starfall',name:'Starfall',tagline:'Minesweeper on a glowing hex planet.',url:'https://starfall-colin.netlify.app/',accent:'#6ee2ff'},
 {id:'lumen',name:'Lumen',tagline:'Glass Tetris with music that plays along.',url:'https://lumen-colin.netlify.app/',accent:'#c49bff'},
 {id:'pocket-weather',name:'Pocket Weather',tagline:'Be the weather. Guide the wanderer.',url:'https://pocket-weather-colin.netlify.app/',accent:'#ffd36b'},
 {id:'hue-dash',name:'Hue Dash',tagline:'Switch colour. Match the landing. Run.',url:'https://hue-dash-colin.netlify.app/',accent:'#ff7ac0'},
 {id:'cubby-isle',name:'Cubby Isle',tagline:'Bonk blocks. Build a cosy island.',url:'https://cubby-isle-colin.netlify.app/',accent:'#8fe39a'},
 {id:'dig-buddies',name:'Dig Buddies',tagline:'Dig the garden. Dodge the Boomshrooms.',url:'https://dig-buddies-colin.netlify.app/',accent:'#ffb36b'},
 {id:'hollow-isle',name:'Hollow Isle',tagline:'Keep the lantern lit. Outlast the fog.',url:'https://hollow-isle-colin.netlify.app/',accent:'#9b7cff'},
 {id:'aetherion',name:'Aetherion: Skybound Realms',tagline:'Build, glide and explore a shattered sky.',url:'https://aetherion-colin.netlify.app/',accent:'#7ecbff'},
 {id:'lumina-drift',name:'Lumina Drift',tagline:'Drift through a dreaming sky. Gather the Echoes.',url:'https://lumina-drift-colin.netlify.app/',accent:'#f0a8ff'}
];
(function(){
 var root=document.getElementById('games');
 function esc(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 root.innerHTML=GAMES.map(function(g){return '<article class="card" style="--accent:'+g.accent+'"><div class="inner" data-url="'+esc(g.url)+'">'+
  '<div class="art-wrap"><img class="art" src="art/'+g.id+'.webp" alt="" loading="eager" decoding="async"></div>'+
  '<div class="meta"><img class="icon" src="art/'+g.id+'-icon.png" alt=""><div class="txt"><h2>'+esc(g.name)+'</h2><p>'+esc(g.tagline)+'</p></div>'+
  '<button class="play" aria-label="Play '+esc(g.name)+'">Play</button></div></div>'+
  '<p class="tip">Tip: open '+esc(g.name)+' in Safari to add it to your Home Screen on its own.</p></article>'}).join('');
 root.addEventListener('click',function(e){var c=e.target.closest('.inner');if(c)window.location.href=c.getAttribute('data-url')});
 var h=new Date().getHours();document.getElementById('greet').textContent=(h<12?'Good morning':h<18?'Good afternoon':'Good evening')+', Colin. Pick a world.';
 var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!reduce){
  root.querySelectorAll('.inner').forEach(function(el){
   function mv(x,y){var r=el.getBoundingClientRect();el.style.setProperty('--ry',((x-r.left)/r.width-.5)*10+'deg');el.style.setProperty('--rx',-((y-r.top)/r.height-.5)*10+'deg')}
   function rs(){el.style.setProperty('--rx','0deg');el.style.setProperty('--ry','0deg')}
   el.addEventListener('pointermove',function(e){mv(e.clientX,e.clientY)});
   el.addEventListener('pointerleave',rs);el.addEventListener('pointerup',rs);el.addEventListener('pointercancel',rs);
  });
 }
 window.__arcadeOK=true;clearTimeout(window.__bootTimer);
 if('serviceWorker' in navigator)window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})});
})();
