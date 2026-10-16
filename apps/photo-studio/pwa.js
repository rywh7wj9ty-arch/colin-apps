/* ===== iOS / PWA polish: standalone detection + one-time "Add to Home Screen" guide ===== */
(function(){
const ua=navigator.userAgent, iOS=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const safari=iOS&&!/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
const standalone=()=>!!(navigator.standalone||matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches);
window.isStandalone=standalone;
function apply(){ document.documentElement.classList.toggle('standalone',standalone()); document.documentElement.classList.toggle('ios',iOS); }
apply(); try{ matchMedia('(display-mode: standalone)').addEventListener('change',apply); }catch(e){}
function guide(force){
  if(standalone()&&!force) return; if(document.getElementById('a2hs')) return;
  const d=document.createElement('div'); d.id='a2hs'; d.setAttribute('role','dialog'); d.setAttribute('aria-label','Add to Home Screen');
  const share='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg>';
  d.innerHTML=`<div class="a2Card"><button class="a2X" aria-label="Close">✕</button><img src="icon-180.png" alt="" width="52" height="52"><div class="a2T">Install Photo Studio on your iPhone</div>
  ${standalone()?'<p class="a2Ok">✓ You are already using the Home Screen app.</p>':''}
  <ol><li>Tap the <b>Share</b> button ${share} in Safari's toolbar${iOS&&!safari?' (open this page in <b>Safari</b> first)':''}.</li><li>Scroll and tap <b>Add to Home Screen</b>.</li><li>Leave <b>Open as Web App</b> switched <b>on</b>, then tap <b>Add</b>.</li></ol>
  <p class="a2S">It opens full-screen like a normal app, and your photos stay on this device.</p><button class="btn primary a2Done">Got it</button></div>`;
  document.body.appendChild(d);
  const close=()=>{ d.remove(); try{ localStorage.setItem('ps.a2hs','1'); }catch(e){} };
  d.querySelector('.a2X').onclick=close; d.querySelector('.a2Done').onclick=close; d.addEventListener('click',e=>{ if(e.target===d) close(); });
}
window.showA2HS=()=>guide(true);
addEventListener('DOMContentLoaded',()=>{
  if(safari&&!standalone()&&!localStorage.getItem('ps.a2hs')) setTimeout(()=>{ if(document.getElementById('modal')?.hidden!==false) guide(false); },2500);
  const hb=document.getElementById('helpBtn'); if(hb){ hb.addEventListener('click',()=>setTimeout(()=>{ const dl=document.getElementById('dlg'); if(!dl||dl.querySelector('#a2hsHelp')) return;
    const b=document.createElement('button'); b.className='btn'; b.id='a2hsHelp'; b.textContent=standalone()?'📱 Home Screen app: installed':'📱 Add to Home Screen (iPhone)…'; b.style.margin='8px 0';
    b.onclick=()=>{ const m=document.getElementById('modal'); if(m) m.hidden=true; guide(true); }; dl.appendChild(b); },60)); }
});
})();
