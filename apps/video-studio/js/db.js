// Tiny IndexedDB wrapper
let dbp=null;
function open(){return dbp||=new Promise((res,rej)=>{const r=indexedDB.open('video-studio',1);
  r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('projects'))d.createObjectStore('projects',{keyPath:'id'});
    if(!d.objectStoreNames.contains('media'))d.createObjectStore('media',{keyPath:'id'});};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function tx(store,mode,fn){const d=await open();return new Promise((res,rej)=>{const t=d.transaction(store,mode);const s=t.objectStore(store);let out;
  let r;try{r=fn(s);}catch(e){rej(e);return;}if(r)r.onsuccess=()=>{out=r.result;};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error||new Error('Storage error'));t.onabort=()=>rej(t.error||new Error('Storage aborted'));});}
export const db={
  get:(s,k)=>tx(s,'readonly',st=>st.get(k)),
  put:(s,v)=>tx(s,'readwrite',st=>st.put(v)),
  del:(s,k)=>tx(s,'readwrite',st=>st.delete(k)),
  all:(s)=>tx(s,'readonly',st=>st.getAll()),
};
