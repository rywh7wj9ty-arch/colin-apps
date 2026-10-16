# ECHOES

A time-loop co-op puzzle game where the only teammate you have is yourself.

Every room is a single screen and each loop lasts a few seconds. When the loop ends,
or when you press **R**, time rewinds and a glowing **echo** of your last run replays
exactly what you did, tick for tick, while you play again. Echoes stack: on loop 3 you
have two past selves plus you. Get your echoes to hold plates, block lasers, push
crates and throw you keys, then walk your live self into the portal.

Watch out for **PARADOX**. If you touch one of your echoes, or change the world so an
echo can no longer do what it did (you stand in its way, take its key, move its
crate...), the timeline fractures and the loop restarts.

## Play

```
cd /workspace/echoes
python3 -m http.server 8766 --bind 127.0.0.1
```

Open http://127.0.0.1:8766 in Chrome. It's all static files: no build step, no dependencies.

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | move (tap for one step, hold to keep walking) |
| R | rewind now: this run becomes an echo |
| U / Backspace | undo (erase) the last echo |
| E / Space | drop a key, or toss it over a fence you're facing |
| Esc | pause: resume, restart room, room select, title |
| Enter / Space | start / confirm |

## Rules in one breath

- **Plates** (colored squares) open the **doors** of the same color while held. If a
  door has two plates, both have to be held at once.
- **Echoes stay put** once their recording ends, so rewinding while you stand on a
  plate leaves an echo holding it for the whole next loop.
- **Timed gates** (violet bars) open and close on the loop clock. The little arc shows
  how long until they change. Some open only once per loop.
- **Lasers** end your loop, but the run is still kept as an echo. That echo stands
  where it fell and soaks up the beam, so you can walk through in its shadow.
- **Crates** can be pushed. They press plates and block lasers.
- **Keys** open gold locks. Walk onto a key to pick it up and walk into a lock to use
  it. Face a fence and press E to toss the key over it.
- **The time anchor** (the ringed start tile) is the one place you can overlap your echoes.
- **Stars:** clear a room with par echoes or fewer for ★★★, par+1 for ★★, anything
  else for ★. Each room caps how many echoes you can keep (par + 3, at least 3).

## Rooms

| # | Room | Teaches | Par |
| --- | --- | --- | --- |
| 1 | First Steps | moving, the portal | 0 |
| 2 | Pressure | one plate, one door, your first echo | 1 |
| 3 | Relay | chained doors, stacking echoes, paradox | 2 |
| 4 | Together | a door that needs two plates held at once | 2 |
| 5 | Clockwork | timed gates | 0 |
| 6 | Window | a gate that opens once (a trapped echo) | 1 |
| 7 | Lightwork | lasers, and echoes that absorb them | 1 |
| 8 | Crossfire | lasers + plates: where you fall matters | 2 |
| 9 | Heavy Things | crates onto plates | 0 |
| 10 | Shield | a crate shadowing a laser, plus a plate echo | 1 |
| 11 | Skeleton Key | keys and locks | 0 |
| 12 | Over the Fence | an echo tosses a key over a fence to you | 1 |
| 13 | Choreography | 4 echoes through one hallway, three doors | 4 |
| 14 | Echo Chamber | everything: 5 echoes, 2 beams, a gate trap, a key toss | 5 |

Progress and best stars are saved in `localStorage` (`echoes.save.v1`).

## How it works

- `game.js` has two halves. The **simulation core** is deterministic and integer-only
  and runs at a fixed 60 Hz (8 ticks per tile step). Live input is recorded once per
  tick, and an echo is just that input stream played back through the same `simStep`.
  Each tick, every echo's position, held key and actions are compared with its recording.
  Any mismatch is a paradox. The **browser layer** handles canvas 2D rendering, the
  rewind and paradox effects, Web Audio music and SFX, menus, input and saving.
- Music and sound are all procedural Web Audio: a calm pad and bass loop that adds one
  layer for each active echo (arpeggio, bells, percussion, shimmer, choir), plus plate
  clicks, door hums, a rewind whoosh, a reversed swell into the paradox crack, and a win chime.

## Verification

Every room ships with a scripted solution (`solution` in `LEVELS`). The headless checker
replays it loop by loop through the exact simulation the browser uses. It records each
loop as an echo, requires a win within the loop time using at most par echoes, then
re-runs the recorded live inputs to confirm the result is deterministic. It also
unit-checks paradox detection (touch, blocking, stolen key), lasers and echo shielding.

```
node --check game.js
node verify.js        # add -v to print every sim event
```

## Phone / touch play
On touch devices (pointer: coarse, or `?touch=1` to force; `?touch=0` to disable) ECHOES shows an
on-screen D-pad (hold to keep walking, slide between directions) plus UNDO, PAUSE, KEY and REWIND
buttons; swipes on the room also take single steps. Title, room select, pause menu and the win panel
are all tappable. The room is laid out in the space left over by the controls, in portrait and landscape.
