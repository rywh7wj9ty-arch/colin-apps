/* LUMEN stats, records, achievements. Pure aggregation (recordGame) + thin localStorage wrappers. */
export const STATS_KEY = 'lumen.stats.v1';
export const SETTINGS_KEY = 'lumen.settings.v1';
export const MODE_IDS = ['marathon', 'sprint', 'ultra', 'zen', 'daily'];
const TOP_N = 10, RECENT_N = 60;

export const DEFAULT_SETTINGS = {
  controls: 'gestures',   // 'gestures' | 'buttons'
  tapMode: 'sides',       // 'sides' (left half CCW, right half CW) | 'cw' (any tap CW)
  sensitivity: 1.0,       // drag cells per finger-cell
  das: 133, arr: 10, sdf: 30,   // sdf >= 1000 = instant
  music: 0.7, sfx: 0.8,
  effects: 'high',        // 'high' | 'reduced'
  shake: true, ghost: true, grid: true, lean: true,
};

function zeroT() { return { mini0: 0, mini1: 0, mini2: 0, full0: 0, full1: 0, full2: 0, full3: 0 }; }
function zeroC() { return { single: 0, double: 0, triple: 0, tetris: 0 }; }
export function newModeStats() { return { played: 0, best: { score: 0, lines: 0, level: 0, timeMs: null, pps: 0 }, top: [] }; }
export function newStats() {
  const modes = {}; for (const m of MODE_IDS) modes[m] = newModeStats();
  return {
    version: 1,
    lifetime: { games: 0, lines: 0, timeMs: 0, pieces: 0, score: 0, attack: 0, clears: zeroC(), tspin: zeroT(), pcs: 0, maxCombo: 0, maxB2B: 0, bestPPS: 0, bestAPM: 0, holds: 0, zenResets: 0 },
    modes, recent: [],
    daily: { lastDate: null, streak: 0, bestStreak: 0, days: {} },
    achievements: {},
  };
}

/** Merge whatever was stored with the current defaults so older / partial data never crashes the UI. */
export function sanitizeStats(raw) {
  const d = newStats();
  if (!raw || typeof raw !== 'object') return d;
  const out = d;
  if (raw.lifetime) { Object.assign(out.lifetime, raw.lifetime); out.lifetime.clears = { ...zeroC(), ...(raw.lifetime.clears || {}) }; out.lifetime.tspin = { ...zeroT(), ...(raw.lifetime.tspin || {}) }; }
  for (const m of MODE_IDS) {
    const r = raw.modes && raw.modes[m];
    if (r) { out.modes[m].played = r.played | 0; out.modes[m].best = { ...out.modes[m].best, ...(r.best || {}) }; out.modes[m].top = Array.isArray(r.top) ? r.top.slice(0, TOP_N) : []; }
  }
  if (Array.isArray(raw.recent)) out.recent = raw.recent.slice(-RECENT_N);
  if (raw.daily) out.daily = { ...out.daily, ...raw.daily, days: { ...(raw.daily.days || {}) } };
  if (raw.achievements && typeof raw.achievements === 'object') out.achievements = { ...raw.achievements };
  return out;
}

/** Is `a` a better leaderboard entry than `b` for this mode? */
export function better(mode, a, b) {
  if (mode === 'sprint') return a.timeMs < b.timeMs;
  if (a.score !== b.score) return a.score > b.score;
  return a.lines > b.lines;
}
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export const ACHIEVEMENTS = [
  { id: 'first_light', name: 'First Light', desc: 'Clear your first line', test: (s) => s.lines >= 1 },
  { id: 'four_fold', name: 'Fourfold', desc: 'Clear a Tetris', test: (s) => s.clears.tetris >= 1 },
  { id: 'twist', name: 'The Twist', desc: 'Clear lines with a T-spin', test: (s) => s.tspin.full1 + s.tspin.full2 + s.tspin.full3 >= 1 },
  { id: 'triple_twist', name: 'Triple Helix', desc: 'Land a T-spin triple', test: (s) => s.tspin.full3 >= 1 },
  { id: 'clean_slate', name: 'Clean Slate', desc: 'Perfect clear: empty the whole well', test: (s) => s.pcs >= 1 },
  { id: 'chain', name: 'Chain Reaction', desc: 'Reach a 5 combo', test: (s) => s.maxCombo >= 5 },
  { id: 'unbroken', name: 'Unbroken', desc: 'Back-to-back x4', test: (s) => s.maxB2B >= 4 },
  { id: 'sprinter', name: 'Sprinter', desc: 'Finish Sprint 40', test: (s) => s.mode === 'sprint' && s.result === 'complete' },
  { id: 'quicksilver', name: 'Quicksilver', desc: 'Sprint 40 in under 90 seconds', test: (s) => s.mode === 'sprint' && s.result === 'complete' && s.timeMs < 90000 },
  { id: 'bright_minute', name: 'Bright Minutes', desc: 'Score 30,000 in Ultra', test: (s) => s.mode === 'ultra' && s.score >= 30000 },
  { id: 'ascent', name: 'Ascent', desc: 'Reach level 10 in Marathon', test: (s) => s.mode === 'marathon' && s.level >= 10 },
  { id: 'into_sun', name: 'Into the Sun', desc: 'Reach level 16, the Solar Crown', test: (s) => s.level >= 16 && s.mode !== 'zen' },
  { id: 'marathoner', name: 'Long Light', desc: 'Clear 150 lines in one Marathon', test: (s) => s.mode === 'marathon' && s.lines >= 150 },
  { id: 'velocity', name: 'Velocity', desc: '2 pieces per second over 100+ pieces', test: (s) => s.pieces >= 100 && s.pps >= 2 },
  { id: 'stillness', name: 'Stillness', desc: 'Stay in Zen for 10 minutes', test: (s) => s.mode === 'zen' && s.timeMs >= 600000 },
  { id: 'ritual', name: 'Ritual', desc: 'Play the Daily three days running', test: (s, st) => st.daily.streak >= 3 },
  { id: 'centurion', name: 'Thousand Lights', desc: 'Clear 1,000 lines in total', test: (s, st) => st.lifetime.lines >= 1000 },
];

/** Fold one finished game (rules.Game#summary) into the stats. Returns a new stats object plus what changed.
 *  dateISO: when the game ended; day: local YYYY-MM-DD (daily streak). */
export function recordGame(prev, s, dateISO = new Date().toISOString(), day = dateISO.slice(0, 10)) {
  const st = sanitizeStats(JSON.parse(JSON.stringify(prev || newStats())));
  const L = st.lifetime;
  L.games++; L.lines += s.lines; L.timeMs += s.timeMs; L.pieces += s.pieces; L.score += s.score; L.attack += s.attack || 0;
  for (const k in L.clears) L.clears[k] += (s.clears && s.clears[k]) || 0;
  for (const k in L.tspin) L.tspin[k] += (s.tspin && s.tspin[k]) || 0;
  L.pcs += s.pcs || 0; L.holds += s.holds || 0; L.zenResets += s.zenResets || 0;
  L.maxCombo = Math.max(L.maxCombo, s.maxCombo || 0); L.maxB2B = Math.max(L.maxB2B, s.maxB2B || 0);
  const meaningful = s.pieces >= 20;
  if (meaningful) { L.bestPPS = Math.max(L.bestPPS, s.pps || 0); L.bestAPM = Math.max(L.bestAPM, s.apm || 0); }

  const M = st.modes[s.mode] || (st.modes[s.mode] = newModeStats());
  const firstGame = M.played === 0;
  M.played++;
  const rec = { score: false, lines: false, level: false, time: false, rank: null, first: firstGame };
  const entry = { score: s.score, lines: s.lines, level: s.level, timeMs: s.timeMs, pps: +(s.pps || 0).toFixed(2), date: dateISO };
  const eligible = s.mode !== 'sprint' || s.result === 'complete';
  if (eligible) {
    if (s.score > M.best.score) { rec.score = !firstGame && s.score > 0; M.best.score = s.score; }
    if (s.lines > M.best.lines) { rec.lines = !firstGame; M.best.lines = s.lines; }
    if (s.level > M.best.level) { rec.level = !firstGame && s.level > 1; M.best.level = s.level; }
    if (meaningful && (s.pps || 0) > (M.best.pps || 0)) M.best.pps = +(s.pps).toFixed(2);
    if (s.mode === 'sprint') { if (M.best.timeMs == null || s.timeMs < M.best.timeMs) { rec.time = !firstGame; M.best.timeMs = s.timeMs; } }
    else if (M.best.timeMs == null || s.timeMs > M.best.timeMs) M.best.timeMs = s.timeMs;
    const top = M.top.concat([entry]).sort((a, b) => (better(s.mode, a, b) ? -1 : better(s.mode, b, a) ? 1 : 0));
    const idx = top.indexOf(entry);
    M.top = top.slice(0, TOP_N);
    if (idx < TOP_N) rec.rank = idx + 1;
  }
  st.recent.push({ mode: s.mode, score: s.score, lines: s.lines, timeMs: s.timeMs, result: s.result, date: dateISO });
  if (st.recent.length > RECENT_N) st.recent = st.recent.slice(-RECENT_N);

  if (s.mode === 'daily') {
    const D = st.daily;
    if (D.lastDate !== day) {
      D.streak = D.lastDate && addDays(D.lastDate, 1) === day ? D.streak + 1 : 1;
      D.lastDate = day;
    }
    D.bestStreak = Math.max(D.bestStreak, D.streak);
    D.days[day] = Math.max(D.days[day] || 0, s.score);
    const keys = Object.keys(D.days).sort(); while (keys.length > 120) delete D.days[keys.shift()];
  }

  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (st.achievements[a.id]) continue;
    let ok = false; try { ok = a.test(s, st); } catch (e) { ok = false; }
    if (ok) { st.achievements[a.id] = dateISO; unlocked.push(a.id); }
  }
  return { stats: st, records: rec, unlocked };
}

/** Achievements that can be awarded mid-game from a live summary (for toasts as they happen). */
export function liveUnlocks(st, s) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (st.achievements[a.id] || ['ritual', 'centurion', 'sprinter', 'quicksilver', 'bright_minute', 'stillness', 'velocity'].includes(a.id)) continue;
    let ok = false; try { ok = a.test(s, st); } catch (e) { ok = false; }
    if (ok) out.push(a.id);
  }
  return out;
}

export function avgPPS(st) { return st.lifetime.timeMs > 0 ? st.lifetime.pieces / (st.lifetime.timeMs / 1000) : 0; }
export function avgAPM(st) { return st.lifetime.timeMs > 0 ? st.lifetime.attack / (st.lifetime.timeMs / 60000) : 0; }

// ---------- storage ----------
function store() { try { return window.localStorage; } catch (e) { return null; } }
export function loadStats() {
  try { const s = store(); const raw = s && s.getItem(STATS_KEY); return sanitizeStats(raw ? JSON.parse(raw) : null); } catch (e) { return newStats(); }
}
export function saveStats(st) { try { const s = store(); s && s.setItem(STATS_KEY, JSON.stringify(st)); return true; } catch (e) { return false; } }
export function loadSettings() {
  try { const s = store(); const raw = s && s.getItem(SETTINGS_KEY); return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) }; } catch (e) { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(v) { try { const s = store(); s && s.setItem(SETTINGS_KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } }
