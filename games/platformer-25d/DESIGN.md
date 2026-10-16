# Two 2.5D platformer directions: design doc

**For Colin, October 2026.** There are two playable vertical slices, built on one shared engine:

- **A: Pip & the Sky Gardens** (`a/`) is a bright, classic run-and-jump platformer with everything modelled in 3D.
- **B: Elderglow** (`b/`) is an Ori-inspired light-and-darkness hybrid with the same 2.5D structure.

Both slices run on iPhone (portrait or landscape), iPad Safari and desktop. They load from a static link with no install, and each works offline as a PWA.

---

## 1. Shared foundations

### Camera and space
- **True 3D with a side-on camera.** Gameplay happens on a single plane (z = 0) with collision in 2D. All geometry is real 3D: the terrain blocks have depth, the characters have volume, and the shadows are real.
- **Depth layers give parallax for free, through perspective:**
  - foreground bushes (z = +2.4), kept below the walking line so they never hide the player;
  - the play plane;
  - near trees (z = -3 to -6);
  - mid floating islands (z = -30 to -65);
  - far mountains or forest (z = -50 to -150);
  - a cloud sea and the sky dome.
- **The camera** has a soft lag, looks ahead in your running direction and bobs gently. Landing and impacts shake it, and collecting something gives it a small zoom pulse. Cut-scenes pull it out for the "wow" moments.
- **Portrait support.** The camera works out its distance from the aspect ratio, so a portrait iPhone shows about 11 units across and landscape shows about 20. The player stays readable in both.

### Feel: the custom kinematic controller
| Parameter | Value | Why |
|---|---|---|
| Run speed | 8 u/s, ground accel 75, air accel 48 | Quick to start, still controllable in the air |
| Gravity | 38 rising, 50 falling | A snappy, weighty arc |
| Jump velocity | 15, giving a 2.96 u max height and about 5.9 u on the flat | |
| Variable jump | Releasing Jump halves the upward speed | Short hops |
| Coyote time | 0.13 s | You can still jump just after leaving a ledge |
| Jump buffer | 0.15 s | A press just before landing still counts |
| Max fall speed | 22 u/s | |

**Level rules, enforced in both slices:**
- every gap is at most 3.5 u, or about 60% of max jump distance;
- every step up is at most 1.6 u, or about 55% of max height;
- there are no invisible gates;
- every ability a section needs is introduced with a signpost right before it;
- a "wall" is never a dead end without a sign.

The two cut-scene chasms, the whale and the light bridge, each have a sign in front reading "Ring the shell-bell…" or "Wake the Great Lantern". The trigger sits directly on the path, so you can't walk past it.

### Accessibility and comfort (Colin's list)
- **Touch controls.** A slide pad on the left (◀ ▶, and you can slide between sides without lifting your finger) and a big Jump button on the right. B adds a Flare button. Every control uses pointer capture and supports multi-touch.
- **Layout.** The canvas is sized from its container's `getBoundingClientRect()` through a ResizeObserver, never from `100vh`. Every HUD element respects `env(safe-area-inset-*)`.
- **Audio.** It unlocks on the first touch, using a silent buffer plus `resume()`. Music and SFX each have their own gain bus, and a slider at 0 really is silent: the gain is set to 0 and nothing new is scheduled.
- **Brightness slider** (60–160%). It scales the hemisphere and sun light and the tone-mapping exposure.
- **Readable characters.**
  - Pip is a saturated orange against a cool sky.
  - Ember is a soft cyan-white with an emissive intensity of only 0.35 and a modest halo.
  - Both have a dark inverted-hull outline, so neither turns into a blown-out blob.
- **Stats screen and save.** Stats cover this run, best time, items ever found, completions, total jumps, tumbles and play time. They are saved to localStorage (`p25a-save-v1` and `p25b-save-v1`) along with the settings.
- **Reliability.** A boot-error card with "Tap to reload" appears, and a 20 s loader watchdog shows it if the game never starts.

---

## 2. Concept A: Pip & the Sky Gardens ("Mario-style 2.5D")

**Pillars**
1. Joy of movement.
2. Toy-box readability, so you always know what's solid, what's dangerous and what's collectible.
3. One big surprise per world.

**Mechanics in the slice:**
- run, variable jump, coyote time and jump buffering;
- stomping Bumble-beetles;
- mushroom springs that send you to high bonus ledges;
- floating isles;
- checkpoint flags;
- 48 sun seeds, with a pitch-rising chime for each one in a row;
- landing dust and screen shake.

**The level, 5 sections plus a finale (about 3–5 minutes for a human collecting seeds; the scripted perfect run takes about 52 s):**
1. **Meadow.** Teaches running and jumping, a step up and a drop down, the first gap, and the first beetle.
2. **Mushroom Hollow.** A spring-launch to a sky ledge, then floating isles over the clouds.
3. **The Shell-bell (the wow moment).** Stepping on the glowing shell-bell freezes play for about 4 s. The camera pulls back as a giant **Sky Whale** rises out of the cloud sea with rumble, spray and a music swell. Its mossy back becomes the bridge.
4. **Breezy Bluffs.** Rising isles, a beetle patrol, and a mushroom to a high seed ledge.
5. **Summit climb.** Stairs, isles and a final beetle.
6. **Finale.** You reach the summit bell tower. The bell swings, fireworks go off in slow motion, and the end card shows your stats.

**Art:** pastel sunshine, low-poly shapes, a gradient sky, ACES tone mapping, shadow-casting sunlight, flowers and tufts, a windmill landmark, waterfalls on the background islands, and an atmospheric fog falloff.

## 3. Concept B: Elderglow ("Ori hybrid")

**Pillars**
1. Light is your verb.
2. Wonder tinged with melancholy.
3. The world answers you: platforms appear, thorns recede and the darkness flinches.

**Mechanics in the slice:**
- **The light orb.** Ember always carries a small light, with a 1.9 u radius shown as a soft ring.
- **Light paths.** Golden platforms are always drawn as faint outlines, so they're never invisible. They turn solid while lit and stay lit for 1.6 s after the light leaves.
- **Flare (✦).** Your light swells to 7.2 u for 2.8 s, with a 0.7 s cooldown. Only a Flare, or a lantern you've lit, makes the **dark thorns** recede. They regrow 1.4 s after the light leaves, and their hitbox is forgiving.
- **Reactive darkness.** Clots of violet mist drift around the thorn beds and flee from your light, fleeing harder when you Flare.
- **Lanterns** work as checkpoints and as permanent light sources.
- **Nara,** your companion wisp, follows you, leaves a trail, and narrates the story beats.
- **28 wisps** to collect, each with a brief slow-motion moment.
- **A glowing trail** follows Ember.

**Story (told in 7 short lines):** the Elder Tree fell asleep and the forest forgot its light. Nara, a wisp who has also forgotten, guides Ember home. At the Great Lantern she remembers her sister. The ending is gentle and bittersweet: "Rest now, little Ember… we remember."

**The level:**
1. **Awakening.** Running, jumping and a lantern.
2. **First Dark.** A sign teaches "Tap ✦ Flare", followed by the first thorn bed and the first light path.
3. **Dark Hollow.** Thorn beds of increasing length, plus a light path over the gap.
4. **Rising Lights.** A staircase of light platforms up to the terrace.
5. **The Great Lantern (the wow moment).** The lantern wakes, the camera pulls back, and a bridge of light assembles plank by plank across the Great Chasm with a rising arpeggio.
6. **The Elder Tree.** Last thorns and light steps lead to the tree, then the **dawn sequence:** the sky, fog and lights shift from violet night to golden morning, the darkness dissolves, wisps rise, and the credits line appears.

**Art:** a luminous dusk rather than a dark night. There is a big moon, stars, lavender fog, bioluminescent mushrooms, glowing waterfalls, blue spirit trees, and a cyan point light on Ember. The palette was chosen to stay bright and readable, after the earlier feedback that Hollow Isle was too dark.

---

## 4. Tech stack: what was actually used, and the production path

| Area | In this prototype | Production path |
|---|---|---|
| Renderer | **Three.js r169 `WebGPURenderer`** (`vendor/three.webgpu.min.js`, 824 KB). It tries **WebGPU** first and **falls back to WebGL2 automatically**. A safety net reloads on WebGL2 if the WebGPU device errors early. `?gl=1` forces WebGL2. | Upgrade to a newer Three.js and author TSL node materials: painterly toon ramps, fog volumes, light-mask shaders. |
| Materials | Node materials (`MeshStandardNodeMaterial` and friends) behind classic names, so the same code runs on both backends. Flat shading is disabled because r169's WebGL2 backend can't compile it. | TSL-based custom materials. |
| Post FX | No post pass in the slice. Glow comes from emissive materials plus additive halo sprites, and tone mapping is ACES. | TSL `PostProcessing`: bloom, light chromatic aberration on Flare, vignette, and WebGPU compute for volumetric fog and light shafts. |
| Physics | **A custom kinematic AABB controller** with a fixed 120 Hz step. **Rapier was not used.** `@dimforge/rapier2d-compat` (0.x) does install, but its inlined WASM adds about 1.5 MB, and a hand-tuned kinematic controller gives tighter, more predictable platformer feel (coyote time, buffering, variable jumps). | Add Rapier2D (WASM) only for dynamic props: rolling logs, swinging lanterns, physics puzzles. Keep the character kinematic. |
| Assets | 100% procedural geometry and procedural Web Audio. There are no texture or model downloads beyond the engine. | Author in Blender, export glTF with **Meshopt** compression, use **KTX2/Basis** textures loaded by KTX2Loader, set a per-world asset budget, and stream as you go. |
| Hosting | A static site with relative paths and **two PWAs with separate service workers and unique cache names** (`p25-a-<ver>` and `p25-b-<ver>`). Each version is precached as a whole, so versions never mix. | The same, plus CDN cache headers and immutable hashed filenames. |

### Performance budgets (targets for production)
- **Frame:** 60 fps on an A14 iPhone or iPad, under 16.6 ms in total, with the simulation under 1 ms.
- **Draw calls:** under 250. Background clouds are a single InstancedMesh, and particles are one pooled InstancedMesh of 260 particles.
- **Shadows:** one 1024² directional shadow map that follows the player.
- **Lights:** one hemisphere light, one directional light, and at most one point light (B's player light).
- **Download:** under 1.5 MB at first load (about 0.9 MB today, almost all of it the engine), and under 4 MB per world with Meshopt and KTX2.
- **Memory:** under 150 MB of GPU memory on iPhone.

## 5. Roadmap
1. **Pick a direction, or merge them.** Option: A's bright toy-box world combined with B's light mechanics as a power-up world.
2. **Polish pass.** TSL toon ramp and outline shader, bloom, real chromatic aberration on Flare, and a rim-light pass on the characters.
3. **Content.** 3 worlds × 4 levels, a boss per world, and a hub map.
4. **Systems.** Wall-jump and dash (A), light-charge puzzles and moving lanterns (B), time trials, and ghosts of your best run.
5. **Pipeline.** Blender to glTF with Meshopt and KTX2, a level editor in JSON with an automated reachability check (the bot already used in testing), and CI that runs Playwright on WebKit and Chromium.
6. **Audio.** Adaptive music layers per section, and stingers for the wow moments.
