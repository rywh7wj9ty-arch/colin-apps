/* ===== Responsiveness layer: drag state for the low-res proxy preview, crisp re-render + histogram on release ===== */
(function(){
const D=window.__psDrag={on:false,rect:null,proxy:false};
const CTL='input[type=range],#curve,.wheels canvas,.cwheel,#cropBox,#baHandle';
function start(e){ if(e.button>0||!e.target.closest||!e.target.closest(CTL)) return; D.on=true; D.rect=null; }
function end(){ if(!D.on) return; D.on=false; D.rect=null; if(typeof schedule==='function'){ schedule(true); } }
document.addEventListener('pointerdown',start,{capture:true,passive:true});
['pointerup','pointercancel'].forEach(t=>document.addEventListener(t,end,{capture:true,passive:true}));
addEventListener('blur',end);
addEventListener('resize',()=>{ D.rect=null; },{passive:true});
})();
