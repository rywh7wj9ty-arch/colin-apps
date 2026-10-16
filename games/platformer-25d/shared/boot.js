// classic script: boot-error card + loader timeout + SW registration
(function(){
  function fail(msg){ var e=document.getElementById('err'); if(!e) return; document.getElementById('errMsg').textContent=String(msg||'Unknown error').slice(0,200); e.classList.add('show'); var l=document.getElementById('loader'); if(l) l.classList.add('gone'); }
  window.__fail=fail;
  window.addEventListener('error',function(ev){ if(!window.__booted) fail(ev.message); });
  window.addEventListener('unhandledrejection',function(ev){ if(!window.__booted) fail(ev.reason&&ev.reason.message||ev.reason); });
  setTimeout(function(){ if(!window.__booted) fail('The game took too long to start.'); }, 20000);
  if('serviceWorker' in navigator && location.protocol!=='file:' && !/[?&]nosw=1/.test(location.search)) navigator.serviceWorker.register('sw.js').catch(function(){});
  if(/[?&]touch=1/.test(location.search)) document.documentElement.classList.add('ft');
})();
