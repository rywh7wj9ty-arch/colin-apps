import * as L from './logic.js?v=__V__';
import { AREAS, BOARDS, TIPS, CLASSIC, dailyDef, HATS, ACHIEVEMENTS } from './levels.js?v=__V__';
import { Audio, initAudio, unlock, applySettings, playMusic, sfx } from './audio.js?v=__V__';
import { World } from './render.js?v=__V__';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const KEY = 'digbuddies.save.v1';
const fresh = () => ({ boards: {}, coins: 0, coinsTotal: 0, hats: ['none', 'straw'], hat: 'straw', classic: {}, daily: { last: '', streak: 0, best: 0, done: {} },
  stats: { dug: 0, won: 0, played: 0, poofs: 0, flags: 0, chords: 0, sniffs: 0, bestFlood: 0, time: 0 }, ach: {}, seen: {},
  settings: { musicOn: true, musicVol: 0.7, sfxOn: true, sfxVol: 0.8, reduced: false, patterns: false, hints: true } });
let save = load();
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.boards) { const f = fresh(); return { ...f, ...s, stats: { ...f.stats, ...s.stats }, settings: { ...f.settings, ...s.settings }, daily: { ...f.daily, ...s.daily } }; } } catch (e) {} return fresh(); }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

const world = new World($('#gl'));
let screen = 'title', game = null, last = performance.now(), titleBoard = null;
const debug = /[?&]debug/.test(location.search);

// ---------------- screens ----------------
function show(name, arg) {
  screen = name; $$('.screen').forEach(s => s.classList.remove('on')); closeModal();
  if (name === 'title') { $('#title').classList.add('on'); titleScene(); playMusic(4); }
  else if (name === 'map') { $('#map').classList.add('on'); renderMap(); playMusic(4); }
  else if (name === 'hud') { $('#hud').classList.add('on'); }
  else { $('#panel').classList.add('on'); renderPanel(name, arg); playMusic(4); }
  $('#gl').style.visibility = (name === 'title' || name === 'hud') ? 'visible' : 'hidden';
}
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) { sfx('click'); show(g.dataset.go); } });
$('#panelBack').onclick = () => { sfx('click'); show(panelBackTo); };
let panelBackTo = 'title';

function titleScene() {
  world.titleMode = true; world.setArea(0); world.zoom = 1; world.pan.set(0, 0);
  const b = L.makeBoard({ w: 7, h: 5, mines: 5, seed: 7 }); L.generate(b, 17); L.dig(b, 17);
  for (let i = 0; i < b.N; i++) if (b.mine[i] && b.nb[i].some(j => b.revealed[j]) && i % 2) b.flagged[i] = 1;
  titleBoard = b; world.litFn = () => true; world.setBoard(b, 0);
  const pop = [...Array(b.N).keys()].find(i => b.mine[i] && !b.flagged[i]); if (pop !== undefined) { b.popped[pop] = 1; world.shroom(pop); }
  layoutRect(); world.mole.position.copy(world.worldOf(17, 0.2)); world.mole.position.z += 0.3; world.moleState.to.copy(world.mole.position); world.moleState.hopT = 1; world.moleDo('title'); world.setHat(save.hat);
}

// ---------------- world map ----------------
function boardDone(i) { return save.boards[i] && save.boards[i].stars && save.boards[i].stars[0]; }
function unlocked(i) { return i === 0 || boardDone(i - 1) || debug; }
function totalStars() { return Object.values(save.boards).reduce((a, b) => a + (b.stars ? b.stars.filter(Boolean).length : 0), 0); }
function renderMap() {
  $('#mapCoins').textContent = save.coins; $('#mapStars').textContent = totalStars() + ' / ' + BOARDS.length * 3;
  const inner = $('#mapInner'); inner.innerHTML = ''; const W = Math.min(window.innerWidth, 700); inner.style.maxWidth = '700px'; inner.style.margin = '0 auto';
  const step = 110, top = 130; let cur = BOARDS.findIndex((b, i) => !boardDone(i)); if (cur < 0) cur = BOARDS.length - 1;
  AREAS.forEach((A, a) => {
    const list = BOARDS.filter(b => b.area === a); const h = top + list.length * step + 30;
    const sec = document.createElement('div'); sec.className = 'area a' + a; sec.style.height = h + 'px';
    sec.innerHTML = `<h3>${a + 1}. ${A.name}</h3><div class="blurb">${A.blurb}</div>`;
    const pts = list.map((b, k) => [W / 2 + Math.sin(k * 1.05 + a) * W * 0.28, top + k * step + 30]);
    const svg = `<svg class="pathsvg" width="${W}" height="${h}"><path d="M${pts.map(p => p.join(' ')).join(' L')}" fill="none" stroke="rgba(255,248,236,.85)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 22"/></svg>`;
    sec.insertAdjacentHTML('beforeend', svg);
    for (let k = 0; k < 7; k++) { const d = document.createElement('div'); d.className = 'deco tree'; const left = k % 2 ? 6 + (k * 13) % 14 : 80 + (k * 7) % 12; d.style.left = left + '%'; d.style.top = (top + k * step * 0.95 + 40) + 'px'; d.style.transform = `scale(${0.7 + (k % 3) * 0.2})`; sec.appendChild(d); }
    list.forEach((b, k) => {
      const n = document.createElement('button'); const st = (save.boards[b.id] && save.boards[b.id].stars) || [0, 0, 0];
      n.className = 'node' + (b.boss ? ' boss' : '') + (unlocked(b.id) ? '' : ' locked') + (b.id === cur ? ' current' : '');
      n.style.left = pts[k][0] + 'px'; n.style.top = pts[k][1] + 'px'; n.dataset.board = b.id;
      n.innerHTML = `<span>${a + 1}-${k + 1}</span><div class="st">${st.map(s => `<i class="${s ? 'on' : ''}"></i>`).join('')}</div>`;
      n.onclick = () => { if (!unlocked(b.id)) { sfx('unflag'); return; } sfx('click'); boardIntro(b.id); };
      sec.appendChild(n);
      if (b.id === cur) { const t = document.createElement('div'); t.className = 'token'; t.innerHTML = '<div class="b"></div><div class="e1"></div><div class="e2"></div><div class="n"></div>' + (save.hat !== 'none' ? '<div class="h"></div>' : ''); t.style.left = pts[k][0] + 'px'; t.style.top = pts[k][1] + 'px'; sec.appendChild(t); }
    });
    inner.appendChild(sec);
  });
  requestAnimationFrame(() => { const c = inner.querySelector('.node.current'); if (c) $('#mapScroll').scrollTop = Math.max(0, c.offsetTop + c.parentNode.offsetTop - window.innerHeight / 2); });
}
const fmt = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function boardIntro(id) {
  const b = BOARDS[id], st = (save.boards[id] && save.boards[id].stars) || [0, 0, 0], tip = b.tip && TIPS[b.tip];
  modal(`<h2>${b.name}</h2><p style="margin:0;opacity:.7">${AREAS[b.area].name} &middot; ${b.area + 1}-${BOARDS.filter(x => x.area === b.area).indexOf(b) + 1}${b.boss ? ' &middot; Boss' : ''}</p>
    ${tip ? `<div class="tipbox"><b>New: ${tip[0]}</b><br>${tip[1]}</div>` : ''}
    <div class="goals"><div><i class="${st[0] ? 'on' : ''}"></i>Clear the patch</div><div><i class="${st[1] ? 'on' : ''}"></i>${b.hearts ? 'Lose no hearts' : 'No Boomshroom bumps'}</div><div><i class="${st[2] ? 'on' : ''}"></i>Finish within ${fmt(b.target)}</div></div><br>
    <button class="grey" id="mCancel">Back</button><button class="green" id="mPlay">Dig in!</button>`);
  $('#mCancel').onclick = () => { sfx('click'); closeModal(); }; $('#mPlay').onclick = () => { sfx('click'); start({ mode: 'adv', id }); };
}
// ---------------- panels ----------------
function renderPanel(name) {
  const body = $('#panelBody'); panelBackTo = 'title'; let html = '';
  const titles = { classic: 'Classic', daily: 'Daily Garden', hats: 'Hats', stats: 'Stats', settings: 'Settings' }; $('#panelTitle').textContent = titles[name] || '';
  if (name === 'classic') {
    html = `<div class="grid diffs">${CLASSIC.map(c => `<div class="tile"><h4>${c.name}</h4><p>${c.w} &times; ${c.h} &middot; ${c.mines} Boomshrooms</p><p>Best: <b>${save.classic[c.key] ? fmt(save.classic[c.key]) : '&ndash;'}</b></p><button data-classic="${c.key}">Play</button></div>`).join('')}</div>
      <p class="wrap" style="text-align:center;opacity:.8">Classic rules: one bump and the patch is over. Every board is still solvable without guessing.</p>`;
  } else if (name === 'daily') {
    const k = L.dailyKey(), done = save.daily.done[k];
    html = `<div class="wrap"><div class="tile"><h4>${k}</h4><p>A fresh garden every day. Same patch for everyone.</p><p>Streak: <b>${save.daily.streak}</b> day${save.daily.streak === 1 ? '' : 's'} &middot; Best streak: <b>${save.daily.best}</b></p>${done ? `<p>Today: cleared in <b>${fmt(done)}</b></p>` : ''}<button data-daily="1">${done ? 'Play again' : 'Play today\u2019s garden'}</button></div></div>`;
  } else if (name === 'hats') {
    html = `<p class="wrap" style="text-align:center">You have <b>${save.coins}</b> coins. Dig them up on Adventure and Daily boards.</p><div class="grid">${HATS.map(h => { const own = save.hats.includes(h.id); return `<div class="tile ${own || save.coins >= h.price ? '' : 'locked'}"><div class="hatpic">${hatSvg(h.id)}</div><h4>${h.name}</h4><button data-hat="${h.id}">${save.hat === h.id ? 'Wearing' : own ? 'Wear' : h.price + ' coins'}</button></div>`; }).join('')}</div>`;
  } else if (name === 'stats') {
    const s = save.stats, S = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
    html = `<div class="wrap"><div class="stats">${S(s.won, 'Patches cleared')}${S(s.played, 'Patches played')}${S(s.dug, 'Tiles dug')}${S(s.flags, 'Signposts planted')}${S(s.poofs, 'Boomshroom bumps')}${S(s.chords, 'Chord taps')}${S(s.bestFlood, 'Biggest single dig')}${S(totalStars(), 'Stars')}${S(save.coinsTotal, 'Coins found')}${S(fmt(s.time), 'Time digging')}${CLASSIC.map(c => S(save.classic[c.key] ? fmt(save.classic[c.key]) : '\u2013', 'Best ' + c.name)).join('')}</div>
      <h3 style="text-align:center">Achievements (${Object.keys(save.ach).length}/${ACHIEVEMENTS.length})</h3>${ACHIEVEMENTS.map(([id, n, d]) => `<div class="ach ${save.ach[id] ? 'on' : ''}"><i></i><div><b>${n}</b><span>${d}</span></div></div>`).join('')}</div>`;
  } else if (name === 'settings') {
    html = `<div class="wrap">${audioControls()}
      <div class="setrow">Reduced effects (smoother on older phones)<button class="tog ${save.settings.reduced ? 'on' : ''}" data-set="reduced"></button></div>
      <div class="setrow">Number patterns (dots around each number)<button class="tog ${save.settings.patterns ? 'on' : ''}" data-set="patterns"></button></div>
      <div class="setrow">Pip's hints (gasps at risky tiles)<button class="tog ${save.settings.hints ? 'on' : ''}" data-set="hints"></button></div>
      <div class="setrow">Reset all progress<button class="pill" id="resetBtn">Reset</button></div><p style="text-align:center;opacity:.6">Dig Buddies v${window.__V}</p></div>`;
  }
  body.innerHTML = html; wireAudio(body);
  body.querySelectorAll('[data-classic]').forEach(b => b.onclick = () => { sfx('click'); start({ mode: 'classic', key: b.dataset.classic }); });
  body.querySelectorAll('[data-daily]').forEach(b => b.onclick = () => { sfx('click'); start({ mode: 'daily' }); });
  body.querySelectorAll('[data-hat]').forEach(b => b.onclick = () => buyHat(b.dataset.hat));
  body.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { const k = b.dataset.set; save.settings[k] = !save.settings[k]; persist(); b.classList.toggle('on', save.settings[k]); sfx('click'); applyVisual(); });
  const r = $('#resetBtn'); if (r) r.onclick = () => { modal(`<h2>Reset everything?</h2><p>Stars, coins, hats and stats will be cleared.</p><button class="grey" id="rNo">Keep</button><button class="pink" id="rYes">Reset</button>`); $('#rNo').onclick = closeModal; $('#rYes').onclick = () => { const st = save.settings; save = fresh(); save.settings = st; persist(); closeModal(); show('title'); }; };
}
function hatSvg(id) {
  const mole = '<ellipse cx="45" cy="55" rx="26" ry="22" fill="#5a4a5e"/><ellipse cx="45" cy="62" rx="9" ry="6" fill="#ff9fb0"/><circle cx="37" cy="52" r="3" fill="#111"/><circle cx="53" cy="52" r="3" fill="#111"/>';
  const h = { none: '', straw: '<ellipse cx="45" cy="34" rx="30" ry="6" fill="#f2d27a"/><rect x="31" y="22" width="28" height="12" rx="5" fill="#f2d27a"/><rect x="31" y="29" width="28" height="4" fill="#e8463c"/>', flower: [0, 1, 2, 3, 4, 5].map(k => `<circle cx="${23 + k * 9}" cy="${36 - Math.sin(k / 5 * 3.14) * 4}" r="5" fill="${k % 2 ? '#fff' : '#ff9fd0'}"/>`).join(''),
    beanie: '<path d="M22 38 Q45 6 68 38 Z" fill="#ff6a5a"/><rect x="20" y="35" width="50" height="7" rx="3" fill="#fff"/><circle cx="45" cy="14" r="6" fill="#fff"/>', party: '<path d="M33 38 L45 6 L57 38 Z" fill="#7b5cff"/><circle cx="45" cy="6" r="4" fill="#ffd34d"/>', pot: '<path d="M32 22 L58 22 L54 40 L36 40 Z" fill="#d9783c"/><circle cx="45" cy="14" r="6" fill="#ff5a8a"/>',
    top: '<rect x="20" y="35" width="50" height="5" rx="2" fill="#2a2430"/><rect x="32" y="10" width="26" height="27" fill="#2a2430"/><rect x="32" y="29" width="26" height="5" fill="#e8463c"/>', crown: '<path d="M28 40 L28 22 L36 30 L45 16 L54 30 L62 22 L62 40 Z" fill="#ffc83a"/><circle cx="45" cy="34" r="3" fill="#ff5a6a"/>' }[id];
  return `<svg viewBox="0 0 90 80" width="90" height="70">${mole}${h}</svg>`;
}
function buyHat(id) {
  const h = HATS.find(x => x.id === id); if (!h) return;
  if (!save.hats.includes(id)) { if (save.coins < h.price) { sfx('unflag'); return; } save.coins -= h.price; save.hats.push(id); achieve('hat'); sfx('coin'); }
  save.hat = id; world.setHat(id); persist(); sfx('star', 1); renderPanel('hats');
}
function audioControls() {
  const s = save.settings;
  return `<div class="setrow">Music<button class="tog ${s.musicOn ? 'on' : ''}" data-aud="musicOn"></button><input type="range" min="0" max="100" value="${Math.round(s.musicVol * 100)}" data-vol="musicVol" aria-label="Music volume"></div>
    <div class="setrow">Sound effects<button class="tog ${s.sfxOn ? 'on' : ''}" data-aud="sfxOn"></button><input type="range" min="0" max="100" value="${Math.round(s.sfxVol * 100)}" data-vol="sfxVol" aria-label="Sound effects volume"></div>`;
}
function wireAudio(root) {
  root.querySelectorAll('[data-aud]').forEach(b => b.onclick = () => { const k = b.dataset.aud; save.settings[k] = !save.settings[k]; b.classList.toggle('on', save.settings[k]); syncAudio(); sfx('click'); });
  root.querySelectorAll('[data-vol]').forEach(r => r.oninput = () => { save.settings[r.dataset.vol] = r.value / 100; syncAudio(); });
  root.querySelectorAll('[data-vol]').forEach(r => r.onchange = () => sfx('pop', 3));
}
function syncAudio() { const s = save.settings; applySettings({ musicOn: s.musicOn, musicVol: s.musicVol, sfxOn: s.sfxOn, sfxVol: s.sfxVol }); persist(); }
function applyVisual() { world.setQuality(save.settings.reduced); if (world.patterns !== save.settings.patterns) { world.patterns = save.settings.patterns; if (game) restoreWorld(); } }

// ---------------- modal / toasts ----------------
function modal(html) { $('#modalCard').innerHTML = html; $('#modal').classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); }
function toast(title, sub) { const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `<i></i><div><b>${title}</b><br>${sub}</div>`; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3400); }
function achieve(id) { if (save.ach[id]) return; save.ach[id] = Date.now(); persist(); const a = ACHIEVEMENTS.find(x => x[0] === id); if (a) { toast('Achievement: ' + a[1], a[2]); sfx('star', 2); } }
function floaty(x, y, text, color) { const d = document.createElement('div'); d.className = 'floaty'; d.textContent = text; d.style.left = x + 'px'; d.style.top = y + 'px'; if (color) d.style.color = color; document.body.appendChild(d); setTimeout(() => d.remove(), 1000); }

// ---------------- a game ----------------
function start(opts) {
  let def;
  if (opts.mode === 'adv') def = BOARDS[opts.id];
  else if (opts.mode === 'classic') { const c = CLASSIC.find(x => x.key === opts.key); def = { ...c, area: 0, hearts: false, coins: 0, sniff: false, seed: (Math.random() * 1e9) | 0, target: c.w * c.h }; }
  else { const key = L.dailyKey(); def = { ...dailyDef(L.dailySeed(key)), dayKey: key }; }
  const b = L.makeBoard(def);
  game = { opts, def, b, hearts: def.hearts ? 3 : 1, heartsLost: 0, time: 0, running: false, over: false, coins: 0, sniffPts: 0, sniffs: 0, flagMode: false, flagsUsed: 0, paused: false };
  world.titleMode = false; world.zoom = 1; world.pan.set(0, 0); world.setArea(def.area, !!def.night); world.litFn = i => L.isLit(b, i);
  world.setBoard(b, def.area); world.setHat(save.hat); for (let i = 0; i < b.N; i++) if (b.ice[i]) world.setTileFrost(i, true);
  show('hud'); layoutRect(); hud(); playMusic(def.area); save.stats.played++; persist();
  const tip = def.tip && TIPS[def.tip]; const first = opts.mode === 'adv' && opts.id === 0;
  hint(first ? 'Tap any patch of grass to start digging!' : def.ice ? 'Frosty tiles show their number once a neighbour is dug.' : def.night ? 'Your first dig finds a lantern. Light up the numbers!' : '');
  if (tip && !save.seen[def.tip]) { save.seen[def.tip] = 1; persist(); }
}
function restoreWorld() {
  const b = game.b; world.setBoard(b, game.def.area); for (let i = 0; i < b.N; i++) { if (b.ice[i]) world.setTileFrost(i, true); if (b.revealed[i]) { world.revT[i] = -9; world.numT[i] = -9; if (b.lantern[i]) world.lanternOn(i); } if (b.popped[i]) world.shroom(i); }
  world.refreshAll(); layoutRect();
}
function hint(t) { $('#hint').textContent = t || ''; }
function hud() {
  if (!game) return; const g = game;
  $('#hearts').innerHTML = g.def.hearts ? [0, 1, 2].map(k => `<i class="${k >= g.hearts ? 'lost' : ''}"></i>`).join('') : '';
  $('#minesLeft').textContent = L.minesLeft(g.b); $('#timer').textContent = fmt(g.time); $('#hudCoins').textContent = g.coins; $('#coinChip').style.display = g.def.coins ? '' : 'none';
  const sb = $('#sniffBtn'); sb.classList.toggle('hide', !g.def.sniff); sb.classList.toggle('ready', g.sniffs > 0); sb.style.setProperty('--fill', (g.sniffPts / 3 * 100) + '%');
  sb.querySelector('.cnt')?.remove(); if (g.sniffs > 0) sb.insertAdjacentHTML('beforeend', `<b class="cnt">${g.sniffs}</b>`);
  $('#modeBtn').classList.toggle('flag', g.flagMode);
}
function layoutRect() {
  const W = window.innerWidth, H = window.innerHeight, land = W > H && H < 620; $('#hud').classList.toggle('land', land);
  if (screen === 'title') { world.setRect({ x: 0, y: H * 0.18, w: W, h: H * 0.62 }); return; }
  if (!game) return;
  if (land) { const a = $('#hudTop').getBoundingClientRect(), c = $('#hudBottom').getBoundingClientRect(); world.setRect({ x: a.right, y: 0, w: c.left - a.right, h: H }); }
  else { const a = $('#hudTop').getBoundingClientRect(), c = $('#hudBottom').getBoundingClientRect(); const top = a.bottom, bot = Math.min(c.top + 10, H); world.setRect({ x: 0, y: top, w: W, h: bot - top }); }
}
function startClock() { if (!game.running && !game.over) game.running = true; }
function doDig(i, viaSniff = false) {
  const g = game; if (!g || g.over || g.paused) return;
  const b = g.b; const wasGen = b.generated; const res = L.dig(b, i, { capMs: 1200 });
  if (res.type === 'none') return; startClock(); achieve('firstdig');
  if (!wasGen) { for (let k = 0; k < b.N; k++) if (b.ice[k]) world.setTileFrost(k, true); else world.setTileFrost(k, false); }
  if (res.type === 'poof') return poof(i);
  world.moleTo(i, res.cells.length >= 20 ? 'cheer' : 'dig'); afterReveal(res.cells);
  if (res.cells.length >= 30) achieve('flood'); save.stats.bestFlood = Math.max(save.stats.bestFlood, res.cells.length);
  checkWin();
}
function afterReveal(cells) {
  const g = game, b = g.b; if (!cells.length) return; const dur = world.reveal(cells);
  const rings = Math.min(16, cells[cells.length - 1][1] + 1); for (let r = 0; r < rings; r++) setTimeout(() => sfx('dig', r), r * 45);
  let coins = 0; for (const [i, ring] of cells) if (b.coin[i]) { coins++; setTimeout(() => { sfx('coin'); const p = world.screenOf(i); floaty(p.x, p.y, '+1', '#ffd34d'); }, ring * 45 + 60); }
  g.coins += coins; save.stats.dug += cells.length; if (cells.length > 1 && g.def.night) setTimeout(() => world.refreshAll(), dur * 1000 + 50);
  if (b.night) world.refreshAll();
  hud(); if (cells.length > 0 && $('#hint').textContent.startsWith('Tap any')) hint(g.def.id === 0 ? 'Numbers count the sleepy Boomshrooms touching that tile. Hold to plant a signpost.' : '');
}
function poof(i) {
  const g = game; world.poof(i); sfx('poof'); world.moleTo(nearestRevealed(i), 'dusty'); save.stats.poofs++;
  const p = world.screenOf(i); floaty(p.x, p.y, 'POOF!', '#fff');
  if (g.def.hearts) { g.hearts--; g.heartsLost++; setTimeout(() => sfx('heart'), 250); hud(); const hs = $$('#hearts i'); if (hs[g.hearts]) hs[g.hearts].classList.add('ouch'); hint(g.hearts > 0 ? `Pip bumped a Boomshroom! ${g.hearts} heart${g.hearts > 1 ? 's' : ''} left.` : ''); }
  else g.hearts = 0;
  if (g.hearts <= 0) lose(); else checkWin();
}
function nearestRevealed(i) { const b = game.b; for (const j of b.nb[i]) if (b.revealed[j]) return j; return i; }
function doFlag(i) {
  const g = game; if (!g || g.over || g.paused) return; const b = g.b; if (!L.toggleFlag(b, i)) return;
  world.flag(i); sfx(b.flagged[i] ? 'flag' : 'unflag'); if (b.flagged[i]) { save.stats.flags++; g.flagsUsed++; } hud();
}
function doChord(i) {
  const g = game; if (!g || g.over || g.paused) return false; const b = g.b; if (!L.canChord(b, i)) return false;
  const res = L.chord(b, i); save.stats.chords++; sfx('chord'); world.moleTo(i, res.cells.length >= 6 ? 'cheer' : 'dig');
  if (res.cells.length) afterReveal(res.cells.map(([c, r]) => [c, r + 1]));
  if (res.cells.length >= 6) achieve('chord');
  if (g.def.sniff && res.cells.length >= 3 && !res.poofs.length) { g.sniffPts++; if (g.sniffPts >= 3) { g.sniffPts = 0; if (g.sniffs < 3) { g.sniffs++; sfx('star', 0); hint('Sniff ready! Tap Sniff to find a safe tile.'); } } hud(); }
  for (const p of res.poofs) { poof(p); if (g.over) return true; }
  checkWin(); return true;
}
function doSniff() {
  const g = game; if (!g || g.over || g.paused || !g.def.sniff || g.sniffs <= 0 || !g.b.generated) { if (g && !g.b.generated) hint('Dig your first tile, then Pip can sniff.'); return; }
  const t = L.sniffTarget(g.b); if (t < 0) return; g.sniffs--; save.stats.sniffs++; achieve('sniff'); sfx('sniff'); world.moleTo(t, 'gasp'); world.sparkle(world.worldOf(t, 0.6), 14, 0xbfff9a); hud();
  setTimeout(() => doDig(t, true), 550);
}
function checkWin() {
  const g = game; if (g.over || !L.isWon(g.b)) return; g.over = true; g.running = false; const b = g.b;
  for (let i = 0; i < b.N; i++) if (b.mine[i] && !b.flagged[i] && !b.popped[i]) { b.flagged[i] = 1; const k = i; setTimeout(() => world.flag(k), 300 + Math.random() * 500); }
  if (g.flagsUsed === 0 && g.heartsLost === 0) achieve('nofl');
  world.celebrate(); world.moleDo('dance'); sfx('win'); hud(); save.stats.won++; achieve('firstwin');
  const stars = L.starsFor({ won: true, heartsLost: g.heartsLost, time: g.time, target: g.def.target });
  save.coins += g.coins; save.coinsTotal += g.coins; if (save.coinsTotal >= 50) achieve('coins50');
  let isBest = false, extra = '';
  if (g.opts.mode === 'adv') {
    const prev = save.boards[g.def.id] || { stars: [false, false, false] }; const merged = prev.stars.map((s, k) => s || stars[k]);
    isBest = !prev.best || g.time < prev.best; save.boards[g.def.id] = { stars: merged, best: Math.min(prev.best || 1e9, g.time) };
    if (stars.every(Boolean)) achieve('three');
    const areaDone = a => BOARDS.filter(x => x.area === a).every(x => boardDone(x.id)); if (areaDone(0)) achieve('world1'); if ([0, 1, 2, 3].every(areaDone)) achieve('allworlds');
  } else if (g.opts.mode === 'classic') { const k = g.opts.key; isBest = !save.classic[k] || g.time < save.classic[k]; if (isBest) save.classic[k] = Math.floor(g.time * 10) / 10; if (k === 'hard') achieve('hard'); }
  else { const key = g.def.dayKey, D = save.daily; if (!D.done[key]) { D.streak = D.last === L.prevDayKey(key) ? D.streak + 1 : D.last === key ? D.streak : 1; D.last = key; D.best = Math.max(D.best, D.streak); D.done[key] = Math.floor(g.time); if (D.streak >= 3) achieve('streak3'); } extra = `<p>Daily streak: <b>${D.streak}</b></p>`; }
  persist();
  setTimeout(() => {
    if (game !== g) return; const next = g.opts.mode === 'adv' && g.def.id + 1 < BOARDS.length;
    modal(`<h2>Patch cleared!</h2><div class="bigstars">${g.opts.mode === 'classic' ? '' : stars.map(() => '<i></i>').join('')}</div>
      <p>Time <b>${fmt(g.time)}</b>${isBest ? ' &middot; <b style="color:#3f8f2a">New best!</b>' : ''}${g.def.coins ? ` &middot; Coins <b>+${g.coins}</b>` : ''}</p>${extra}
      ${g.opts.mode === 'adv' ? `<div class="goals"><div><i class="${stars[0] ? 'on' : ''}"></i>Cleared</div><div><i class="${stars[1] ? 'on' : ''}"></i>No hearts lost</div><div><i class="${stars[2] ? 'on' : ''}"></i>Within ${fmt(g.def.target)}</div></div><br>` : ''}
      <button class="grey" id="rMap">${g.opts.mode === 'adv' ? 'Map' : 'Menu'}</button><button class="blue" id="rAgain">Again</button>${next ? '<button class="green" id="rNext">Next</button>' : ''}`);
    $$('.bigstars i').forEach((s, k) => { if (stars[k]) setTimeout(() => { s.classList.add('on'); sfx('star', k); }, 250 + k * 320); });
    wireResult(g);
  }, 1600);
}
function wireResult(g) {
  $('#rMap').onclick = () => { sfx('click'); game = null; show(g.opts.mode === 'adv' ? 'map' : g.opts.mode === 'classic' ? 'classic' : 'daily'); };
  $('#rAgain').onclick = () => { sfx('click'); start(g.opts); };
  const n = $('#rNext'); if (n) n.onclick = () => { sfx('click'); if (BOARDS[g.def.id + 1].tip) boardIntro(g.def.id + 1); else start({ mode: 'adv', id: g.def.id + 1 }); };
}
function lose() {
  const g = game; g.over = true; g.running = false; const b = g.b; const rest = []; for (let i = 0; i < b.N; i++) if (b.mine[i] && !b.popped[i] && !b.flagged[i]) rest.push(i);
  world.revealShrooms(rest); setTimeout(() => sfx('lose'), 500); persist();
  setTimeout(() => { if (game !== g) return; modal(`<h2>The Boomshrooms woke up!</h2><p>Pip is a bit dusty but totally fine. Every patch can be solved with logic, so have another go!</p><button class="grey" id="rMap">${g.opts.mode === 'adv' ? 'Map' : 'Menu'}</button><button class="green" id="rAgain">Try again</button>`); wireResult(g); }, 1500);
}
function pause() {
  if (!game || game.over) return; game.paused = true; sfx('click');
  modal(`<h2>Paused</h2>${audioControls().replace(/setrow/g, 'slid')}<br><button class="grey" id="pQuit">Quit</button><button class="blue" id="pRestart">Restart</button><button class="green" id="pResume">Resume</button>`);
  wireAudio($('#modalCard'));
  $('#pResume').onclick = () => { sfx('click'); closeModal(); game.paused = false; };
  $('#pRestart').onclick = () => { sfx('click'); start(game.opts); };
  $('#pQuit').onclick = () => { sfx('click'); const m = game.opts.mode; game = null; show(m === 'adv' ? 'map' : m === 'classic' ? 'classic' : 'daily'); };
}
$('#pauseBtn').onclick = pause;
$('#modeBtn').onclick = () => { if (!game) return; game.flagMode = !game.flagMode; sfx(game.flagMode ? 'flag' : 'click'); hud(); };
$('#sniffBtn').onclick = doSniff;

// ---------------- input ----------------
const cv = $('#gl'), pts = new Map(); let gest = null, lpTimer = null; const ring = $('#ring');
function ringAt(x, y, on) { if (!on) { ring.style.display = 'none'; ring.classList.remove('go'); return; } ring.style.left = x + 'px'; ring.style.top = y + 'px'; ring.style.display = 'block'; ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go'); }
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  firstTouch(); if (screen !== 'hud' || !game || game.paused) return; try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  for (const [id, q] of pts) if (performance.now() - q.t > 1500) pts.delete(id); // drop pointers whose 'up' never arrived
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
  if (pts.size === 2) { cancelLP(); const [a, b] = [...pts.values()]; gest = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; world.setPress(-1); return; }
  if (pts.size > 2) return;
  const i = world.pick(e.clientX, e.clientY); gest = { x: e.clientX, y: e.clientY, i, moved: false, lp: false, btn: e.button, type: e.pointerType, t: performance.now() };
  if (e.pointerType === 'mouse' && e.button === 2) { if (i >= 0) doFlag(i); gest.lp = true; return; }
  if (e.pointerType === 'mouse' && e.button === 1) { e.preventDefault(); if (i >= 0) doChord(i); gest.lp = true; return; }
  if (i >= 0 && !game.b.revealed[i]) {
    world.setPress(i); maybeGasp(i);
    lpTimer = setTimeout(() => { if (!gest || gest.moved) return; gest.lp = true; ringAt(0, 0, false); world.setPress(-1); if (game.flagMode) doDig(i); else doFlag(i); }, 350);
    if (e.pointerType !== 'mouse') ringAt(e.clientX, e.clientY, true);
  }
});
function cancelLP() { clearTimeout(lpTimer); ringAt(0, 0, false); }
cv.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId) || !gest) return; const p = pts.get(e.pointerId); const px = p.x, py = p.y; p.x = e.clientX; p.y = e.clientY; p.t = performance.now();
  if (gest.pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; world.zoomBy(d / gest.d); world.panBy(mx - gest.mx, my - gest.my); gest.d = d; gest.mx = mx; gest.my = my; return; }
  if (!gest.moved && Math.hypot(e.clientX - gest.x, e.clientY - gest.y) > 12) { gest.moved = true; cancelLP(); world.setPress(-1); }
  if (gest.moved && !gest.lp) world.panBy(e.clientX - px, e.clientY - py);
});
function endPtr(e) {
  if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); cancelLP(); world.setPress(-1);
  if (!gest) return; if (gest.pinch) { if (pts.size === 0) gest = null; return; }
  const g = gest; gest = null; if (e.type === 'pointercancel' || g.moved || g.lp || g.i < 0 || !game) return;
  const i = g.i, b = game.b;
  if (b.revealed[i]) { if (!doChord(i)) { /* tapped a number that isn't ready */ world.dirty.add(i); } return; }
  if (game.flagMode) doFlag(i); else if (!b.flagged[i]) doDig(i); else { sfx('unflag'); world.flag(i); }
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr); window.addEventListener('pointerup', endPtr); window.addEventListener('pointercancel', endPtr);
cv.addEventListener('dblclick', e => { if (!game) return; const i = world.pick(e.clientX, e.clientY); if (i >= 0 && game.b.revealed[i]) doChord(i); });
cv.addEventListener('wheel', e => { if (screen !== 'hud') return; e.preventDefault(); world.zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
function maybeGasp(i) {
  if (!save.settings.hints || !game.b.generated || game.b.flagged[i]) return; const b = game.b; if (!b.nb[i].some(j => b.revealed[j])) return;
  if (!L.provablySafe(b).has(i)) { world.moleDo('gasp'); sfx('gasp'); }
}
let unlocked1 = false;
function firstTouch() { if (unlocked1) { if (Audio.ctx && Audio.ctx.state !== 'running') Audio.ctx.resume(); return; } unlocked1 = true; unlock(); syncAudio(); playMusic(screen === 'hud' && game ? game.def.area : 4); }
['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, firstTouch, { capture: true, passive: true }));
window.addEventListener('keydown', e => { if (e.key === 'Escape' && game && !game.over) { if (game.paused) { closeModal(); game.paused = false; } else pause(); } if ((e.key === 'f' || e.key === 'F') && game) $('#modeBtn').click(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.over && !game.paused) pause(); });

// ---------------- loop ----------------
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game && game.running && !game.paused) { const rdt = Math.min(0.25, (now - (loop.prev || now)) / 1000); game.time += rdt; save.stats.time += rdt; const t = $('#timer'), s = fmt(game.time); if (t.textContent !== s) t.textContent = s; }
  loop.prev = now;
  if (screen === 'title' || screen === 'hud') world.frame(dt);
  requestAnimationFrame(loop);
}
let rzT = 0; const onResize = () => { world.resize(); world.orient(); layoutRect(); if (screen === 'map') renderMap(); };
const rzSoon = () => { onResize(); clearTimeout(rzT); rzT = setTimeout(onResize, 350); }; // iOS settles its viewport a beat after rotating
window.addEventListener('resize', rzSoon); window.addEventListener('orientationchange', rzSoon);
if (window.visualViewport) window.visualViewport.addEventListener('resize', rzSoon);
if (window.ResizeObserver) { let lw = 0, lh = 0; new ResizeObserver(() => { const r = cv.getBoundingClientRect(); if (Math.round(r.width) !== lw || Math.round(r.height) !== lh) { lw = Math.round(r.width); lh = Math.round(r.height); onResize(); } }).observe(cv); }
// ?debug: show the tile under the finger
if (debug) { const dbg = document.createElement('div'); dbg.id = 'pickDbg'; dbg.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;background:rgba(0,0,0,.7);color:#fff;font:12px monospace;padding:4px 6px;border-radius:6px;pointer-events:none';
  document.body.appendChild(dbg); window.__lastPick = null;
  const sh = e => { if (!game) return; const i = world.pick(e.clientX, e.clientY), W = game.b.W; window.__lastPick = i < 0 ? null : { i, r: (i / W) | 0, c: i % W }; dbg.textContent = `x${Math.round(e.clientX)} y${Math.round(e.clientY)} → ` + (i < 0 ? 'none' : `row ${(i / W) | 0} col ${i % W}`); };
  cv.addEventListener('pointerdown', sh); cv.addEventListener('pointermove', sh); }
setInterval(() => { if (game && game.running) persist(); }, 5000);

// ---------------- debug / test hooks ----------------
window.DB = {
  get game() { return game; }, get save() { return save; }, world, L, start, show, doDig, doFlag, doChord,
  screenOf: (i, y) => world.screenOf(i, y), pick: (x, y) => world.pick(x, y), audio: () => ({ music: Audio.musicGain ? Audio.musicGain.gain.value : null, sfx: Audio.sfxGain ? Audio.sfxGain.gain.value : null, state: Audio.ctx && Audio.ctx.state }),
  hiddenSafe: () => { const b = game.b; const o = []; for (let i = 0; i < b.N; i++) if (b.kind[i] === 1 && !b.revealed[i] && !b.mine[i]) o.push(i); return o; },
  hiddenMine: () => { const b = game.b; for (let i = 0; i < b.N; i++) if (b.mine[i] && !b.popped[i] && !b.flagged[i]) return i; return -1; },
  chordable: () => { const b = game.b; for (let i = 0; i < b.N; i++) { if (!b.revealed[i] || !b.num[i] || !L.numberVisible(b, i)) continue; const hid = b.nb[i].filter(j => !b.revealed[j]); if (hid.length && hid.some(j => !b.mine[j])) return i; } return -1; },
  flagAround: i => { const b = game.b; for (const j of b.nb[i]) if (b.mine[j] && !b.flagged[j] && !b.popped[j]) doFlag(j); },
  winNow: () => { const b = game.b; const list = []; for (let i = 0; i < b.N; i++) if (b.kind[i] === 1 && !b.mine[i] && !b.revealed[i]) { b.revealed[i] = 1; list.push([i, 0]); } afterReveal(list); checkWin(); },
};

// ---------------- boot ----------------
function boot() {
  world.patterns = save.settings.patterns; world.setQuality(save.settings.reduced); world.setHat(save.hat); initAudio(); syncAudio();
  show('title'); requestAnimationFrame(t => { last = t; loop(t); });
  requestAnimationFrame(() => requestAnimationFrame(() => { $('#loading').style.display = 'none'; window.__booted = true; }));
  if (debug) { const m = location.search.match(/board=(\d+)/); if (m) start({ mode: 'adv', id: +m[1] }); }
}
try { (document.fonts && document.fonts.load ? Promise.race([document.fonts.load('700 40px Fredoka'), new Promise(r => setTimeout(r, 1500))]) : Promise.resolve()).then(boot, boot).catch(e => window.__bootFail(e.message)); }
catch (e) { window.__bootFail(e.message); }
