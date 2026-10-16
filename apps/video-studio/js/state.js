// Shared editor state, undo history and persistence
import {layout,findClip,fixCompounds} from './model.js';
import {db} from './db.js';
export const S={proj:null,media:new Map(),sel:new Set(),selTr:null,seqPath:[],T:0,skimT:null,playing:false,rate:1,tool:'select',
  snap:true,skim:true,pps:60,scrollX:0,scrollY:0,source:null,range:null,hist:[],hi:-1,dirty:true,tlDirty:true,mobile:false,moveMode:false};
const L={};
export const on=(e,f)=>(L[e]||=[]).push(f);
export const emit=(e,...a)=>(L[e]||[]).forEach(f=>f(...a));
export function rootSeq(){return S.proj.timeline;}
export function seq(){let s=S.proj.timeline;for(const id of S.seqPath){const c=findClip(s,id);if(!c||!c.seq){S.seqPath=[];return S.proj.timeline;}s=c.seq;}return s;}
export function selClips(){const s=seq();return [...S.sel].map(id=>findClip(s,id)).filter(Boolean);}
export function selClip(){const a=selClips();return a[a.length-1]||null;}
export function dirty(){S.dirty=true;S.tlDirty=true;}
let saveT=null;
export function save(now){clearTimeout(saveT);const go=async()=>{if(!S.proj)return;S.proj.modified=Date.now();try{await db.put('projects',JSON.parse(JSON.stringify(S.proj)));}catch(e){console.warn(e);}};
  if(now)return go();saveT=setTimeout(go,500);}
export function initHistory(){S.hist=[JSON.stringify(S.proj)];S.hi=0;}
export function commit(label){fixCompounds(S.proj.timeline);const j=JSON.stringify(S.proj);if(S.hist[S.hi]===j){dirty();emit('change');return;}
  S.hist=S.hist.slice(0,S.hi+1);S.hist.push(j);if(S.hist.length>150)S.hist.shift();S.hi=S.hist.length-1;S.lastLabel=label;
  save();dirty();emit('change');}
function restore(){S.proj=JSON.parse(S.hist[S.hi]);const s=seq();for(const id of [...S.sel])if(!findClip(s,id))S.sel.delete(id);save();dirty();emit('change');emit('restore');}
export function undo(){if(S.hi>0){S.hi--;restore();return true;}return false;}
export function redo(){if(S.hi<S.hist.length-1){S.hi++;restore();return true;}return false;}
export function seqLen(){return layout(seq()).len;}
