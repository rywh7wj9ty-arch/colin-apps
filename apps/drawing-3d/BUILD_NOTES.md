# Build notes — GRP Enclosure 3D (EDS 07-3102_01 Sheets 1–5)

Model units: **metres** (1 unit = 1 m). Drawing dimensions are millimetres.

## Sheet → features mapped

| Sheet | Title | Model features |
|-------|-------|----------------|
| **1** | Civil layout | 2.8×2.8×2.4 m dark-green GRP housing; 150 mm front/back roof overhang; double doors +Z (0–90°); 2 louvred panels each on left/right/rear; 3.0×3.0×0.15 m RC plinth (TOC 150 mm above GL, 25 mm chamfers); 500 mm hardstanding sides/rear; cable recess ~1.2 m × 0.3 m deep + ring beam; DANGER OF DEATH door sign; explode / colour / dimensions |
| **2** | Concrete reinforcement | Layer `gRebar` (OFF by default): top A393 mesh ~2.85×1.4 m; bottom A393 ~2.85×1.0 m; front + side ground-beam cages (H12 longs + H10 links); bars 01/02/03 as distinct running lines; red earth-bond point on top mesh; orange-rust semi-transparent/emissive material |
| **3** | GRP flooring layout | Layer `gFlooring` (ON by default): two panels 1.19×1.19×0.038 m side-by-side; green gritted open grating (main + short bars); UA 65×50×6 at front & rear (~2.36 m) with 7-slot hole hint (180 then 400 centres); RHS 100×50×6 central beam ~2.59 m; GRP cut-outs for cable entry with rising cable stubs (Detail A) |
| **4** | Earthing layout | Layer `gEarthing` (OFF by default): 4 earth rods at plinth corners, 2.4 m deep; earth ring electrode at 0.6 m below GL; 25×3 mm copper tape / insulated conductors as segmented tubes; **10-way earth bar on RIGHT** interior (foundation face, ~190 mm below FFL); red connection markers to LV, RMU, RTU, DB, rebar, rods, ring; rebar bond links |
| **5** | Small power & lighting | Layer `gServices` (ON by default) on **LEFT interior wall (−X)**: 2× 1500 mm twin LED wall lights at ~1.8 m AFFL (PointLights); light switch at ~1.3 m AFFL near doors; 13A switched double socket; 13A unswitched FCU for RTU; distribution board at 1.4 m AFFL near RTU; dual cable tray along inside of front wall |

## Equipment layout (Sheet 1 GA + Sheet 5 plan)

Viewed from the doors looking −Z:

| Item | Placement |
|------|-----------|
| **Transformer** | Rear (−Z); fins on ±X sides and rear (−Z); front clear for cabinets |
| **LV cabinet** | Front-left of transformer (+Z / −X); operator face toward doors |
| **RMU** | Front-right of transformer (+Z / +X); handles/mimic face doors |
| **RTU** | Left GRP side wall (−X), wall-mounted |
| **Distribution board** | Left wall near RTU (Sheet 5); replaces previous consumer-unit label |

## Main dimensions modelled

| Element | Drawing | Modelled |
|--------|---------|----------|
| GRP housing external footprint | 2800 × 2800 mm | 2.8 × 2.8 m |
| Housing height (TOC to eaves/wall top) | 2400 mm | 2.4 m |
| Roof overhang (front & back) | 150 mm | 0.15 m each |
| RC base / plinth | 3000 × 3000 mm | 3.0 × 3.0 m |
| TOC above finished ground level | 150 mm | 0.15 m |
| Chamfers on exposed external edges | 25 × 25 mm | Approximate bevel strips |
| Clear hardstanding (sides & rear) | 500 mm | Context pad ~4.0 m overall + front apron |
| Central cable recess | ~1200 mm wide × ~300 mm deep | 1.2 m × 0.3 m deep |
| GRP panels (Sheet 3) | 1190 × 1190 × 38 mm × 2 | 1.19 × 1.19 × 0.038 m each |
| UA supports | 65×50×6, 2360 mm | L-section visual, slotted-hole hint |
| RHS central beam | 100×50×6, 2590 mm | 2.59 m along X |
| Top A393 mesh | 2850 × 1400 mm | 2.85 × 1.40 m grid |
| Bottom A393 mesh | 2850 × 1000 mm | 2.85 × 1.00 m grid |
| Earth rods | 4No., min 2.4 m deep | At plinth corners |
| Earth ring | 600 mm below GL | Loop around foundation |
| Twin LED fittings | 1500 mm, 1800 mm AFFL | 2No. on −X wall |
| Distribution board | 1400 mm AFFL | Left wall near RTU |

## UI

1. **Visibility** — walls, roof, doors, foundation, interior, ground, dims, pole, labels  
2. **Drawing layers** — S2 Reinforcement · S3 Flooring · S4 Earthing · S5 Services  
3. **Doors / explode / colour / cameras** — angle 0–90°, explode, dark green / mid brown, reset, iso  
4. **Sheet presets** — Civil only · Show all layers · Foundation dig  
5. **Legend** — sheet-coloured swatches; click focuses camera  

## Assumptions

- Housing centred on the 3.0 m plinth (100 mm concrete reveal each side)
- Recess centred on plinth centreline, running front–back
- Doors on +Z (front); left door carries the danger sign
- Foundation mass shown extending below G.L. for isometric clarity
- Reinforcement / earthing are simplified visualisations of the schedules (not bend-by-bend fabrication models)
- 10-way earth bar on the **right** (Sheet 4); RTU / DB / lights on the **left** (Sheet 5) so they do not conflict
- Classic Three.js **r134** + OrbitControls (no ES modules); single HTML file

## Source

EDS 07-3102_01 Sheets 1–5 (figured dimensions only; drawing note: do not scale).
