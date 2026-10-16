#!/usr/bin/env node
/* Headless solvability + determinism check for ECHOES.
 * Replays each level's scripted solution (see LEVELS[i].solution in game.js) through the
 * exact same simulation the browser uses, loop by loop, recording each run as an echo.
 * Usage: node verify.js [-v]
 */
'use strict';
const G = require('./game.js');
const VERBOSE = process.argv.includes('-v');
const DIRS = { U: 1, R: 2, D: 3, L: 4 };

function parseScript(s) {
  const toks = [];
  const re = /\s*(w\d+|[UDLRudlrEX])/gy;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) toks.push(m[1]);
  if (toks.join('') !== s.replace(/\s+/g, '')) throw new Error('bad script: ' + s);
  return toks;
}

function makeDriver(script) {
  const toks = parseScript(script);
  let i = 0, waitLeft = -1, holdTicks = 0, pendingMove = false;
  return {
    done() { return i >= toks.length; },
    err: null,
    input(W) {
      pendingMove = false;
      if (i >= toks.length) return 0;
      const live = W.live, willIdle = live.mv <= 1;
      const tok = toks[i];
      if (tok === 'X') { if (willIdle) { i++; return 'X'; } return 0; }
      if (!willIdle) return 0;
      if (tok[0] === 'w') {
        if (waitLeft < 0) waitLeft = +tok.slice(1);
        waitLeft--;
        if (waitLeft <= 0) { waitLeft = -1; i++; }
        return 0;
      }
      if (tok === 'E') { i++; return G.ACT; }
      if (DIRS[tok.toUpperCase()] && tok === tok.toLowerCase()) { i++; return DIRS[tok.toUpperCase()]; }
      pendingMove = true;
      return DIRS[tok];
    },
    after(W) {
      if (!pendingMove) return;
      if (W.live.mv === G.MOVE) { i++; holdTicks = 0; }
      else if (++holdTicks > 2000) this.err = 'stuck on token ' + i + ' (' + toks[i] + ')';
    },
  };
}

function runLoop(L, echoes, script, isLast) {
  const W = G.createWorld(L, echoes);
  const drv = makeDriver(script);
  let res = null;
  for (;;) {
    const inp = drv.input(W);
    if (inp === 'X') { res = { type: 'rewind' }; break; }
    res = G.simStep(W, inp);
    drv.after(W);
    if (VERBOSE && W.events.length) console.log('   t=' + W.t, W.events.map(e => e.type + '@' + e.x + ',' + e.y).join(' '));
    if (res) break;
  }
  return { W, res, endT: W.t, scriptDone: drv.done() };
}

let failures = 0;
function fail(msg) { failures++; console.log('  FAIL: ' + msg); }

for (let li = 0; li < G.LEVELS.length; li++) {
  const def = G.LEVELS[li];
  const L = G.parseLevel(def, li);
  const sol = def.solution;
  const echoes = [];
  let ok = true;
  console.log(`Level ${li + 1} "${def.name}"  loop=${def.loop}s  par=${def.par}  loops=${sol.length}`);
  for (let k = 0; k < sol.length && ok; k++) {
    const last = k === sol.length - 1;
    const r = runLoop(L, echoes, sol[k], last);
    const where = `(${r.W.live.x},${r.W.live.y})`;
    console.log(`  loop ${k + 1}: ${r.res.type}${r.res.reason ? '/' + r.res.reason : ''} at t=${r.endT} (${(r.endT / 60).toFixed(2)}s) live=${where}`);
    if (last) {
      if (r.res.type !== 'win') { fail('final loop did not reach the exit'); ok = false; }
      else {
        // determinism: replay the recorded live inputs and expect the same win tick
        const W2 = G.createWorld(L, echoes);
        let r2 = null;
        for (const inp of r.W.rec.inputs) { r2 = G.simStep(W2, inp); if (r2) break; }
        if (!r2 || r2.type !== 'win' || W2.t !== r.endT) { fail('replay of recorded inputs diverged'); ok = false; }
      }
    } else {
      if (!['rewind', 'zap', 'timeout'].includes(r.res.type)) { fail('echo loop ended with ' + r.res.type); ok = false; }
      else if (!r.scriptDone) { fail('echo loop ended before its script finished'); ok = false; }
      else echoes.push(G.makeEcho(r.W));
    }
  }
  if (ok && echoes.length > def.par) fail(`used ${echoes.length} echoes, par is ${def.par}`);
  if (ok && echoes.length > L.maxEchoes) fail('exceeds max echoes');
}

// ---- mechanic unit checks ------------------------------------------------
function unit(name, fn) { try { const m = fn(); if (m) fail(name + ': ' + m); else console.log('unit ok: ' + name); } catch (e) { fail(name + ': ' + e.message); } }
function runScript(li, scripts) {
  const L = G.parseLevel(G.LEVELS[li], li); const echoes = []; let r;
  for (let k = 0; k < scripts.length; k++) { r = runLoop(L, echoes, scripts[k], k === scripts.length - 1); if (k < scripts.length - 1) echoes.push(G.makeEcho(r.W)); }
  return r;
}
unit('touching an echo is a paradox', () => {
  const r = runScript(1, ['UUUX', 'UUU']);
  return r.res.type === 'paradox' && r.res.reason === 'touch' ? null : 'got ' + r.res.type;
});
unit('blocking an echo\'s path is a paradox', () => {
  // echo walks to the plate; live stands on (3,3) first? live moves up one tile and waits in the echo's way
  const r = runScript(1, ['w20 UUUX', 'Uw200']);
  return r.res.type === 'paradox' ? null : 'got ' + r.res.type;
});
unit('stealing an echo\'s key is a paradox', () => {
  const r = runScript(10, ['w30 RRRRRRRX', 'RRRRRRR']);
  return r.res.type === 'paradox' ? null : 'got ' + r.res.type;
});
unit('door stays shut without the echo (undo semantics)', () => {
  const r = runScript(1, ['RRRRRRDRRRR']);
  return r.res.type === 'timeout' ? null : 'got ' + r.res.type;
});
unit('laser zaps the live player', () => {
  const r = runScript(6, ['DDD']);
  return r.res.type === 'zap' ? null : 'got ' + r.res.type;
});
unit('echo blocks the laser', () => {
  const r = runScript(6, ['DDD', 'RDDD']);
  return r.res.type === 'timeout' ? null : 'got ' + r.res.type;
});

console.log(failures ? `\n${failures} FAILURE(S)` : `\nALL ${G.LEVELS.length} LEVELS VERIFIED SOLVABLE`);
process.exit(failures ? 1 : 0);
