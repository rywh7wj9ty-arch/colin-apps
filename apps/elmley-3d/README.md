# Elmley Nature Reserve — Interactive 3D Map

Phone-friendly, stylised **Three.js** model of **Elmley National Nature Reserve** (Kingshill Farm, Isle of Sheppey, Kent). Single self-contained HTML — no build step, no npm.

## Open the model

1. Open `elmley-nature-reserve-3d.html` (or `index.html`) in **Safari / Chrome / Firefox / Edge**.
2. On a phone: if you only see source code, use **Share → Open in Browser**.
3. Works from `file://` or any static host. Needs the network **once** to load Three.js r134 + OrbitControls from CDN.
4. Optional local server:

```bash
cd elmley-3d
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`.

## Controls

| Control | Action |
|--------|--------|
| Left-drag / one-finger drag | Orbit |
| Scroll / pinch | Zoom |
| Right-drag / two-finger drag | Pan |
| Tap / click marker | Open info card (facts + optional walk distance) |
| **Fly to** (on card) | Animate camera to that point |
| **Layers** | Paths, Buildings, Hides, Waterways, Salt marsh, Wildlife, Labels |
| **Overview** | High view of the whole peninsula |
| **Walk the hides** | Mid-level view along the hide trail |
| **Foundation** | Close view of the visitor hub / farm |
| **Fly to Spitend** | Camera to hide 4 (~5.5 km east) |
| **Visit tips** | Practical booking, hours, access rules |
| **Controls** (mobile) | Collapse / expand the bottom panel |

North indicator (top-left) rotates with the camera so **N** always matches world **+Z**. Scale bar ≈ **1 km** (model scale: **1 unit = 100 m**).

## What’s modelled

- Sage-green grazing marsh peninsula, pale **Swale**, yellow-green **salt marsh**, teal **creeks**
- Vehicle dashed track (Entrance Gate → Visitor Car Park)
- Red reserve footpaths + dashed coastal paths
- Buildings: Kings Hill Farm, Old School House, Old Brickworks, Rose Cottage, Cod’s House
- Hides 1–4 (Well Marsh, Counterwall, South Fleet, Spitend) + Swale viewing screen + Blue Badge bay
- Clickable wildlife markers + a small animated flock near the southern hides
- Soft lighting, fog, gently rippling water

## Files

| File | Purpose |
|------|---------|
| `elmley-nature-reserve-3d.html` | Full interactive model (self-contained) |
| `index.html` | Identical copy for static-server root |
| `map-source.jpg` | Original map art (visual reference only — **not required** at runtime) |
| `README.md` | This file |
| `BUILD_NOTES.md` | Modelled vs map, assumptions, tech |

## Sources

- Official site: [elmleynaturereserve.co.uk](https://www.elmleynaturereserve.co.uk)
- Day visits / booking: pre-booked tickets online only (check current hours on the site)
- Reserve map layout: Elmley visitor map (Aug 2020 style key — hides 1–4, paths, salt marsh)
- Facts embedded in info cards: access rules, hide distances, wildlife, family NNR history (Merricks / Fulton)

**Always verify opening times and ticket availability on the official website before travelling.**

## Tech

- Three.js **r134** (cdnjs) + `OrbitControls` (jsDelivr `three@0.134.0/examples/js/controls/…`)
- Classic `<script>` tags (not ES modules) so `file://` and in-chat previews keep working
