# NIGHTBLOOM

A nocturnal garden. Classic Minesweeper, no Windows chrome.

Open nightbloom.html (fully inlined, preferred) or serve this folder and open index.html.
No build step. No backend. A static page is enough.

## How to play

Open every safe bed. Pins mark seeds. Win when every non-seed cell is revealed (pins are optional).

Reveal: left click or tap. First step is always safe and prefers a clearing.
Pin: right click, long-press, or F. On touch, use the HUD Reveal/Flag toggle.
Chord: middle click, left+right, Q, Shift+Space, or click a number whose pins match. A wrong pin loses.
Move: arrows or WASD. Space/Enter reveal (or chord if open). Esc closes overlays. Question-mark for help. H heat pulse. N new garden.

## Gardens

Seedling: 9x9 / 10 mines, 1 heat pulse
Grove: 16x16 / 40 mines, 2 heat pulses
Wildwood: 30x16 / 99 mines, 3 heat pulses
Custom: width 5-40, height 5-24, mines 1 through cells-9
Daily Garden: Grove, seeded from the UTC date, 1 heat pulse

Same first cell on the same UTC date yields the same Daily garden.

Zen: no clock. Best times are not recorded.
Ghost: after a loss, Walk the roots. Seeds show as faint hairline roots. Not a second life.
Heat pulse (H): unrevealed unpinned tiles glow by adjacent-seed density. Does not open tiles.
Migration: off by default, not on Daily. After each reveal, unpinned seeds may step one cell iff already-revealed numbers would not change. About 300ms root-slide telegraph.

Best times in localStorage for vanilla timed Seedling / Grove / Wildwood (no Zen, no Migration, no Daily).

## Sound

Web Audio, silent until first gesture. Mute remembered. Drone warms as safe beds open.
prefers-reduced-motion skips stagger and drift.

## Files

nightbloom.html - single-file garden (fonts, CSS, logic inlined)
index.html + styles.css + logic.js + app.js + fonts/ - modular copy
test.js - node tests (node test.js)
