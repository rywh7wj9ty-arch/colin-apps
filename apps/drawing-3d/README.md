# GRP Enclosure 3D Model — EDS 07-3102_01 Sheets 1–5

Interactive Three.js model of a UK Power Networks **GRP enclosure for a unit or padmount substation**, covering **civil, reinforcement, flooring, earthing, and small power & lighting** (EDS 07-3102_01 Sheets 1–5).

## Open the model

1. **Download** `grp-enclosure-3d.html` (or the whole `drawing-3d` folder).
2. **Open it in a browser** — Safari, Chrome, Firefox, or Edge. On a phone: tap the file, then use **Share → Open in Browser** if you only see source code.
3. Works from `file://` **or** any static host. No build step and no local server required.
4. An internet connection is needed **once** to load **Three.js r134** and OrbitControls from a CDN.

### Optional: local static server

```bash
cd drawing-3d
python3 -m http.server 8080
```

Then open `http://localhost:8080/` (serves `index.html`) or `http://localhost:8080/grp-enclosure-3d.html`.

## Controls

| Control | Action |
|--------|--------|
| Left-drag | Orbit |
| Scroll | Zoom |
| Right-drag | Pan |
| **1. Visibility** | Walls, roof, doors, foundation, interior equipment, ground, dims, pole, labels |
| **2. Drawing layers** | Sheet 2 Reinforcement · Sheet 3 GRP flooring · Sheet 4 Earthing · Sheet 5 Small power & lighting |
| Door open angle | 0–90° (doors hinge from outer edges) |
| Exploded view | Lifts enclosure off plinth; flooring offsets |
| Colour | Dark Green (standard) / Mid Brown |
| **Civil only** | Enclosure + flooring; hide S2/S4/S5 layers |
| **Show all layers** | Turn on reinforcement, flooring, earthing, and services |
| **Foundation dig** | Hide enclosure; show rebar + earthing + recess |
| Legend items | Click to focus camera on that element |
| Reset camera / Iso front | Restore isometric front-three-quarter view |

Mobile: the control panel is scrollable along the bottom; orbit/zoom still use the canvas.

## Equipment layout

- **Transformer** at rear (−Z), fins on ±X and rear  
- **LV cabinet** attached front-left of transformer (toward doors)  
- **RMU** attached front-right (handles/mimic face doors)  
- **RTU + distribution board / small power** on left GRP wall (−X)  
- **10-way earth bar** on right foundation/wall face (Sheet 4)

## Files

- `grp-enclosure-3d.html` — interactive model (UMD / classic scripts; file:// friendly)
- `index.html` — identical copy for static-server root
- `BUILD_NOTES.md` — sheet→feature map, dimensions, assumptions
- `README.md` — this file

## Drawing reference

UK Power Networks — GRP Enclosure for a Unit or Padmount Substation — EDS 07-3102_01 Sheets 1–5.
