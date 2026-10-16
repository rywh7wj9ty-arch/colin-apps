# STARFALL: Minesweeper on a living world

Minesweeper played on the surface of a 3D planet. The board is a **Goldberg polyhedron**, the dual of a
frequency-n geodesic icosphere. Every cell is a hexagon (6 neighbours) except exactly 12 pentagons
(5 neighbours), so a number can mean something slightly different from classic Minesweeper.

Static files, no build step. three.js r169 is vendored in `vendor/three/` (MIT, see LICENSE there).
Installable and fully offline as a PWA.

## Run
```
python3 -m http.server 8767 --bind 127.0.0.1   # from this folder
open http://127.0.0.1:8767/
```
It must be served over HTTP (ES modules + import map). It doesn't work from `file://`.

## Worlds
| | cells (10n²+2) | mines | density | look |
|---|---|---|---|---|
| Moon | 252 (n=5) | 30 | 12% | frozen moon: cratered ice, frost shards that grow from hidden cells, a thin ring |
| Planet | 492 (n=7) | 68 | 14% | ocean world: continents, a separately drifting cloud layer, an orbiting moon |
| Gas Giant | 1002 (n=10) | 155 | 15.5% | banded giant: zonal winds, swirling storms, wide shadowed rings |

Every world has a day/night terminator (fixed sun). Revealed land on the night side glows with city lights.

## Modes
- **Classic**: one mine ends the run.
- **Zen**: you carry 3 shields. A wrong tap cracks a shield, the mine is locked in as a flag and you play on.
  The 4th mistake ends the run calmly (no explosion). Zen has its own best times.
- **Daily Planet**: the same board for everyone on a given local date. It's seeded from the date, the world rotates
  daily (Planet, Moon, Gas Giant theme on a 492-cell board), and it's always no-guess. You land in an
  already-opened zone and the clock starts after the landing. It has its own best time per day, a day streak
  (it lapses if you miss a day) and a best streak.

## No-guess boards (on by default)
`logic.js` has a solver that only uses what a player can see: single-cell rules, subset/pair reasoning
between overlapping numbers, and the global mine count. Generation runs the solver from the first tap.
If it gets stuck, one mine on the stuck frontier moves to a far cell and it re-solves. This is bounded
by a solve budget (and a 250 ms wall-clock cap outside the Daily). If the budget runs out, it keeps the
board that got furthest (a graceful fallback). At normal densities this takes ~1–12 ms. The Daily uses a
deterministic budget only, so every device builds the identical board. Turn it off in Settings.

## Progression
- **Stats** (chart button on the title): played, wins, win rate, current/best win streak, best Classic and
  Zen time per world, and Daily streak/best/fastest. Abandoning a game after your first move counts as played.
- **Achievements** pop a toast when unlocked: First Light, Bare Hands (win without flags), Moonwalker
  (Moon < 60 s), Giant Slayer, Cartographer (all three worlds), Unshaken (Zen without losing a shield),
  Hat Trick (3 wins in a row), Dawn Patrol (a Daily), Seven Suns (7-day Daily streak).
- Saved in `localStorage`: `starfall.stats.v2` (old `starfall.best.v1` best times are migrated) and `starfall.settings.v1`.

## Settings (gear button)
Sound, music volume, haptics (`navigator.vibrate`; iPhone/iPad Safari ignore it), no-guess, colour-blind
numbers (Okabe–Ito-style palette plus dot counts), reduced motion (crossfade reveals; no shake, flashes or
debris; defaults to the OS setting), hold-to-flag duration (200–800 ms), and reset stats.

## Controls
| | Touch | Mouse / keyboard |
|---|---|---|
| Spin planet (with fling inertia) | drag | left-drag |
| Zoom (toward your fingers / cursor) | pinch (twist with two fingers to roll) | scroll wheel |
| Reveal | tap | left-click |
| Flag | hold (a ring fills, default 350 ms) | right-click |
| Flag mode | FLAG button: tap flags, hold reveals | `F` |
| Chord | tap a number whose flags are all placed | click it |
| Restart / menu | ↻ / ☰ in the HUD | `R` / `Esc` |

The first tap is always safe and opens an area. Tapping near the limb gently eases the camera toward that spot.
On touch screens the camera keeps cells at least ~34 px wide, which matters for the Gas Giant on a phone: it
starts zoomed in and you spin to explore. The planet is framed inside the area left free by the HUD, so the bar,
the Zen/Daily chip and the FLAG button never cover it at the default zoom.

## Files
- `index.html`: markup (HUD, title with mode switch, result card, stats/settings sheet, toasts), import map, cache-busted tags.
- `style.css`: glass UI, sheets, toasts, safe-area insets, reduced-motion styles.
- `logic.js`: pure logic (browser + Node): Goldberg board, mines, flood fill, chording, Zen shields, solver,
  no-guess generation, Daily seeding, stats and achievements.
- `game.js`: rendering (worlds, clouds, rings, moonlet, frost shards, beacons, effects), camera, input, UI.
- `audio.js`: procedural Web Audio (per-world tuned ticks, flags, shields, explosion, win, achievement chime, ambient music).
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA.
- Tests: `test-logic.js`, `test-e2e.js`, `test-pwa.js`.

## Rendering notes
- All tiles are one merged mesh (one draw call). Per-cell state (hidden/revealed/flag/mine/exploded/wrong flag/defused,
  number, reveal time) lives in a float `DataTexture` that the shaders read. Each world's surface is baked once
  into an equirect texture (fbm + voronoi). Reveals flip each tile over a random axis (the crossfade with reduced motion).
- Numbers come from a canvas digit atlas, drawn on a dark chip and sampled screen-aligned so they always read upright.
- Clouds are a separate transparent shell that drifts on its own. Rings use a banded texture with the planet's
  shadow and fade where they pass in front of the board. Frost shards and beacons use `InstancedMesh`.
- UnrealBloomPass (half resolution on touch), ACES tone mapping, DPR capped at 2.

## Tests
```
node test-logic.js                                          # 26 logic tests (solver, no-guess, Daily, Zen, stats)
NODE_PATH=/tmp/sfdeps/node_modules node test-e2e.js [iphone|ipad-portrait|ipad-landscape|desktop]
NODE_PATH=/tmp/sfdeps/node_modules node test-pwa.js         # install + real offline reload, root and subpath
```
The e2e and PWA tests need puppeteer-core and Chrome. The e2e test expects this folder served on
`SF_BASE` (default `http://127.0.0.1:8767/`) and writes screenshots to `/tmp/starfall-v2/`.

## Debug hook
`?debug` exposes `window.SF` (`info()`, `visibleCells(filter)`, `screenOf(i)`, `settled()`, `cellPx()`, `planetRect()`,
`almostWin()`, `forceWin()`, `start(world, mode)`). `&seed=N` fixes the mine layout, `&date=YYYY-MM-DD` overrides the
Daily date, and `&lp=ms` lengthens the long-press for slow headless runs.

## Install / offline (PWA)
- `manifest.webmanifest` (start_url/scope `./`), iOS meta tags and `icons/` make it installable:
  on iPad/iPhone open it in Safari → Share → **Add to Home Screen**.
- `sw.js` precaches every file into a versioned cache (`starfall-<VERSION>`). Pages are network-first (4 s timeout,
  then the precached shell; offline uses the shell). Assets are cache-first. A `?v=` URL from another release is only ever
  answered with that exact file (its own cache, else the network), never with this release's file. On activate it keeps
  the current cache plus the newest older one and deletes the rest. All paths are relative, so it works at `/` or under a subpath.
- **Boot safety:** an inline watchdog in `index.html` shows "Tap to reload" if the game hasn't booted within 8 s or a
  script fails before boot. The tap unregisters the service worker, deletes `starfall-*` caches and reloads. `game.js`
  checks that `<html data-build>`, `logic.js` `BUILD` and its own `BUILD` match. On a mismatch it heals itself once
  (same hard reload), then shows the tap message. The spinner hides after the first frame, or after 2.5 s at the latest.
  The page checks for updates when the app comes back to the foreground, and it switches to a new version only between games.
- **Releasing a change:** bump all of these to the same value: `data-build` and the `?v=` strings in `index.html`,
  `VERSION` in `sw.js`, `BUILD` and the `./audio.js?v=` import at the top of `game.js`, and `BUILD` in `logic.js`.
  Any new file must be added to `ASSETS` in `sw.js`.
