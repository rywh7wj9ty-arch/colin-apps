# Elmley 3D — Build notes

## Deliverables

- `/workspace/elmley-3d/elmley-nature-reserve-3d.html` — self-contained interactive model
- `/workspace/elmley-3d/index.html` — byte-identical copy
- `/workspace/elmley-3d/README.md` — controls & sources
- `/workspace/elmley-3d/BUILD_NOTES.md` — this file
- `/workspace/elmley-3d/map-source.jpg` — reference only (not loaded by the HTML)

## Tech stack (matches prior GRP project constraints)

- Three.js **r134** via `cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js`
- OrbitControls via `cdn.jsdelivr.net/npm/three@0.134.0/examples/js/controls/OrbitControls.js`
- No ES modules / importmap; no npm; no build step
- Touch OrbitControls (`TOUCH.ROTATE` + `TOUCH.DOLLY_PAN`), collapsible mobile panel, large tap targets

## Coordinate system & scale

- **1 unit ≈ 100 m**
- **+X = east**, **+Y = up**, **+Z = north** (map north arrow → +Z)
- Origin near **Visitor Car Park & Facilities**
- Spitend Hide placed ~**52 units** east ≈ **5.2–5.5 km** walking distance from farm (matches published ~5.5 km)

## Modelled vs map

| Map feature | In 3D model | Notes |
|-------------|-------------|--------|
| Sage grazing marsh peninsula | Yes | Extruded irregular outline (stylised, not surveyed coastline) |
| The Swale (pale blue) | Yes | Large plane with vertex ripple animation + fog |
| Salt marshes (yellow-green) | Yes | Coastal bands south / west / tip |
| Dark teal creeks / ditches | Yes | Catmull-Rom `TubeGeometry` network (schematic, not every ditch) |
| Mudflats / sandbanks | Yes | Brownish shapes in The Swale |
| Seawalls / counterwalls | Yes | Slight raised ribbons near hide trail |
| Entrance Gate + vehicle dashed track | Yes | NW gate → hub |
| Reserve footpaths (solid red) | Yes | Hub → hides 1–4, south to screen, short school path, southern loop |
| Coastal footpaths (dashed red) | Yes | West + east tip; green posts ≈ English Coastal Path entries |
| Visitor Car Park & Facilities | Yes | Pad + marker + shed |
| Kings Hill Farm / Old School / Brickworks / Rose / Cod’s | Yes | Low-poly beige boxes + pitched roofs |
| Hides 1–4 numbered | Yes | Wooden shelters + red numbered markers + CSS labels |
| Swale viewing screen | Yes | Screen wall + blue torus marker |
| Blue Badge car park @ Well Marsh | Yes | Blue marker |
| A249 Sheppey Crossing hint | Yes | Simple bridge + road stub far NW |
| ~1 km scale bar | Yes | HUD scale bar + ground reference ribbon |
| Lapwing illustration | Skipped | Prefer interactivity; wildlife markers cover highlights |
| Straymarsh Farm | Not labelled | Off main visitor focus / unclear on simplified layout |
| Exact surveyed creek geometry | No | Artistic / schematic for performance |

## Interactive features checklist

- [x] Orbit / pan / zoom (mouse + touch)
- [x] Start camera overlooking visitor centre looking SE toward hides
- [x] Collapsible side/bottom panel (auto-collapsed on narrow screens)
- [x] Layer toggles: Paths, Buildings, Hides, Waterways, Salt marsh, Wildlife, Labels
- [x] Presets: Overview / Walk the hides / Foundation / Fly to Spitend / Reset
- [x] Legend matching map palette
- [x] Clickable POI markers → info cards with research facts
- [x] Fly-to from info card
- [x] Walking distance from Visitor Car Park on hide/hub cards
- [x] Visit tips drawer
- [x] North indicator (camera-linked) + approx scale
- [x] Soft ambient + directional + hemisphere lights; fog; animated water
- [x] Simple bird flock (instanced) near southern hides
- [x] Colour-contrast UI; ≥36–42 px tap targets on mobile

## Verification performed

- `node --check` on extracted inline JS — **pass**
- `python3 -m http.server` on port **8877** — both HTML paths return **200**, body matches file (~51 KB)
- CDN HEAD checks for three r134 + OrbitControls — **200**
- `index.html` byte-identical to `elmley-nature-reserve-3d.html`

## Known limitations

- Coastline and creek paths are **stylised approximations** of the visitor map, not GIS-accurate survey data.
- Map image is **not** used as a texture (keeps the HTML self-contained and offline-friendly after CDN cache).
- Hours / ticket rules can change — UI states “check website”.
- Moderate poly count aimed at mid-range phones; very old devices may need to disable wildlife layer.
- North on the printed map art can look slightly tilted on the page; model forces clean **+Z = north**.

## Hosting / Cloudflare tunnel

Ready to host as static files. Point any tunnel or Pages/Workers static site at `elmley-3d/` (serves `index.html`). Only runtime dependency is public CDN access for Three.js on first load.
