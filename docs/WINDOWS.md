# CARBON for Windows

## Current source candidate: Carbon: Prime 7.8.7+ls

The Windows/desktop source identity remains **Carbon: Prime 7.x+ls** (`+ls` = Local Storage).
`7.8.7+ls` is the unpublished Windows/desktop source candidate. It adds a drawing-focused 3D
workflow with live brush geometry, pressure-aware pointer sampling and mesh-local strokes; a bounded
camera-following ground patch; an independent Infinite Painter creation path; an internal editable
Project Library; and PNG/JPEG/SVG/MP4 exports with explicit capability limits. Home waits for an
internal project save before navigating away. Android remains **CARBON 1.0.0**; its `versionName`
and `versionCode` are not driven by this Windows bump. Node tests, strict TypeScript and the web
build pass; browser/WebGL/stylus behavior, in-app diagnostics, Windows installer/runtime and Android
acceptance remain unverified. See [`AUDIT-7.8.7-candidate.md`](./AUDIT-7.8.7-candidate.md) for
scope and [`PRIME-7.md`](./PRIME-7.md) for version history.

---

## Previous release: 2.2.0

The Windows edition is the full connected studio: **Draw · Comic Studio · 3D Studio (Spatial Ink Lab) · Effects · Orbit Board · Brush Library**, plus Color Dock, Palette Memory, Continuum links and the Creative Time Machine.
The Android edition is a separate 1.0.0 line. **No Android project file, configuration, asset, version field or artifact was modified.** Windows-only features are gated by `EDITION.windows` in shared code.

## Build, launch, package

```bash
npm install
npm run build                         # dist/index.html: single offline file
node scripts/windows.mjs              # → release/windows/CARBON-portable/CARBON.html
node scripts/windows.mjs --exe        # + Electron portable .exe and .zip (run on Windows)
node scripts/windows.mjs --source     # + release/windows/CARBON-<version>-source.zip
```

* **Portable:** open `CARBON-portable/CARBON.html` in Edge or Chrome. It works offline. Edge → … → Apps → *Install this site as an app* gives it its own window.
* Before writing a new portable build, the script moves the existing one to `release/windows/previous/CARBON-portable-<old version>/`.
* The script reads its version from `src/version.ts` and refuses to package if the release notes don't start at that version. It never touches `android/`, `capacitor.config.json`, `assets/` or `scripts/android.mjs`.
* **Acceptance tests:** *Help → Run Diagnostics* runs the core suite, `[Win]`, `[Win 2.2]` and `[Win 7.1]` finder/palette/sample/surface-symmetry checks. These are source paths; this browser-based diagnostics suite has not yet been executed for the current candidate.

## Architecture (what was reused)

| Area | Implementation |
|---|---|
| 2D engine | One command-based `DocEngine` (undo, Drawing Replay). New commands are `imagePixels` (recapture) and `image` with `props` (linked captures). |
| Rendering | One compositor (`engine/render.ts`), now with per-panel clipping (`layer.panelId`) and a corrected sampling policy. |
| 3D | three.js. `win/sceneRender.ts` is the shared data model and geometry and drives both the interactive viewport (`win/Studio3D.tsx`) and the headless capture renderer. |
| Storage | `.carbon` v1 zip. New data is optional manifest extensions (`scene3d` extended, `board`, `paletteMemory`) plus layer keys (`link`, `panelId`) and a stable `meta.uuid`. Time Machine uses its own IndexedDB database `carbon-timemachine`. |

## Features (2.2.0)

**Spatial Ink Lab (3D Studio)**
* Strokes are real 3D curves (control points in world space, or in an object's local space for surface strokes). They render as tapered tubes, ribbons, swept profiles, lines or surfaces, and the geometry type stays a live, editable property of the curve.
* **Drawing targets:**
  * *Depth plane:* faces the camera through the orbit pivot; move it with **[ / ]** or the slider.
  * *Ground / front / side* planes with an offset, or a *custom plane* with tilt and origin (it can be aligned to an object).
  * *Object surfaces:* cube, sphere, cylinder, cone, plane, torus and reference images. Surface strokes are parented to their object and follow its transforms.
* The active plane is drawn as an orange grid, so the depth is visible rather than guessed.
* **Editing:**
  * Select strokes and individual control points, then move them with the gizmo.
  * Add or delete points, smooth, simplify, convert Bézier to spline, mirror X/Y/Z, duplicate, transform, and change color, opacity, thickness and taper.
* **Symmetry:** mirror X/Y/Z plus radial copies (up to 16) around a chosen axis and center, with live preview lines while drawing.
* **Camera:**
  * Front, back, left, right, top, bottom and iso views, focus (F), reset, and perspective/orthographic projection.
  * Named saved views.
  * Middle-drag orbits, Shift+middle-drag or right-drag pans, wheel zooms. In draw tools Alt+left orbits; in Select, left-drag on empty space orbits.
* **Keyboard (3D only):** Ctrl+Z / Ctrl+Y undo and redo 3D edits, W/E/R switch gizmo modes, Delete removes, Esc cancels, V selects, B draws.
* **Kept from earlier versions:** the object editor (cube and the other primitives, transform gizmo, materials, lights and shadows), surface painting, GLB export, and 2.0/2.1 scenes (migrated automatically).

**Carbon Continuum**
* *Render view to linked 2D layer* produces a normal raster layer that stores `layer.link` (scene document ID, camera, view name, time).
* From that layer: *Return to scene* (restores the camera), *Recapture* (undoable and replayable) and *Unlink*. Missing scene documents are reported, never guessed.
* 2D artwork can enter 3D as a reference plane (current canvas or an image file), and the canvas plane can be refreshed.
* The *Continuum* panel lists the project's scene, board, palette memory, comic pages, every linked layer with its status, and other open documents that use this scene.

**Orbit-to-Comic**
* In Comic Studio's panel editor, *3D capture* renders any open scene (scene camera or a saved view) at the panel's size into a layer clipped to that panel. The layer remembers its own camera, so other panels never move.
* *Frame in 3D…* opens the scene with that panel's camera and a frame overlay showing the panel's aspect. *Save camera to panel & recapture* updates only that panel.
* Balloons, text, layouts, effects, and PNG/ZIP/PDF export are unchanged from 2.0.

**Brush Fusion** (*Brush menu*, or Brush Library → My library)
* Combine a base brush with up to 6 components, each contributing one aspect (tip, texture, dynamics, scatter, color, wet media or overlay stamps) at an adjustable strength.
* **Overlay stamps** are a new engine pass (`layer2`) that stamps a secondary tip around each dab, e.g. watercolor plus pigment speckles. They are deterministic, so Drawing Replay matches.
* The result sliders cover size, opacity, flow, spacing, rotation, angle jitter, scatter, grain and blending. The preview is drawn by the real stroke engine.
* Incompatibilities are listed explicitly (e.g. Crisp Ink ignores texture and overlays; mixing and smudge ignore overlays).
* Saving creates a new custom brush and never modifies the sources. The recipe is stored with the brush so it can be edited again.

**Palette Memory** (dock panel)
* Global palettes show HEX and RGB values with copy buttons and *Copy all*.
* Generate a palette from an image file or the current artwork (median cut, 3–16 colors).
* Project palette snapshots are stored in the .carbon file and can be restored as new palettes with exact values.

**Orbit Board** (workspace)
* A zoomable, pannable board stored in the project.
* **Item types:** images (validated, ≤25 MB, de-duplicated project assets), artwork snapshots, notes, palettes, and links to layers, 3D scenes, saved views, comic pages and panels.
* **Organizing:** group frames carry their contents, items can be tagged (characters, environments, props, scenes, palettes) with a filter, and each item has a label and description.
* **Health and actions:** broken references (missing document, layer, panel, view or image) are flagged. You can extract a palette from an image item. The board has its own undo (Ctrl+Z / Ctrl+Y) and accepts drag-and-drop of image files.

**Creative Time Machine** (dock panel)
* **Snapshots:** named, with a description and timestamp, each a full project archive (2D layers, 3D scene, board, palette memory, project Color Dock; replay data excluded). They are stored locally and kept separate from undo and from your files.
* **Compare:** pick two snapshots, or a snapshot and the current state, to see before/after images, a change heatmap and percentage, and lists of added, removed and renamed layers, plus 3D and board counts.
* **Restore:** requires confirmation, which explains exactly what is replaced. An automatic "Before restoring…" snapshot is always written first, so a restore can itself be undone.
* **Branches:** a branch opens as a new document with its own ID and shares the history list.
* **Retention:** automatic snapshots are pruned to a configurable count (default 10). Named snapshots are only deleted by you. Storage size is shown, and history can be deleted per snapshot or entirely.

## Bug fixes found in this release's audit
1. Canvas zoom sharpness. The canvas passed `smoothing: zoom < 2`, so the renderer's automatic policy never ran and 100% zoom was resampled under 125%/150% Windows scaling. The policy is now exact at integer zooms, filtered at fractional magnification below 200%, and filtered when reducing. There is a regression test.
2. Display-scale changes (and moving between monitors) left the canvas at the old resolution. It now re-creates the backing store.
3. Ctrl+wheel over the Windows overlay (eyedropper, gradient, liquify, comic tools) zoomed the whole UI, because React's passive listener can't block it.
4. The Color Dock eyedropper never added the sampled color (a 2.1.0 edit didn't land).
5. Color Studio swatch removal left swatch names misaligned.
6. The 2.1.0 diagnostics referenced missing imports.
7. `.carboncomic` drag-and-drop was ignored.
8. Duplicated documents and comic pages shared one identity.
9. Ctrl+Z in 3D Studio undid 2D artwork.
10. Orbit Board card controls (found and fixed during development before release).

## Verification status
* **Build:** `npm run build` succeeds, and every edited module type-checks clean (the Vite build itself doesn't type-check).
* **Automated:**
  * `[Win 2.2]` tests cover the sampling regression, spatial curves and symmetry, scene migration, spatial persistence, offscreen capture (skipped with an explicit message where WebGL is unavailable), links, recapture, undo/redo, replay, panel clipping, fusion determinism and incompatibility, palette extraction, board persistence and health, and Time Machine snapshot, restore and recovery.
  * They run in-app via *Help → Run Diagnostics*. **They were not run during development in this environment**, so run them on the target PC.
* **Manual (not yet performed on Windows hardware):**
  * Drawing 3D strokes with a mouse.
  * Point editing, surface drawing and symmetry preview.
  * Frame in 3D → panel recapture.
  * Board drag, resize and grouping.
  * Time Machine compare, restore and branch.
  * Display-scale switching.
  * The Electron `.exe` build.

## Known limitations
* Drawing Replay doesn't record 3D Studio or Orbit Board edits; both have their own undo.
* In the 7.1.0+ls source candidate, mirror/radial symmetry is projected onto mesh surfaces for freehand and straight-line strokes; Bézier anchors remain plane-only. Browser/WebGL interaction and target-platform acceptance are still unverified (see `AUDIT-7.1.0+ls.md`).
* Filters run on the main thread when applied (previews are reduced-size).
* Recapture needs the scene's document open.
* Time Machine history lives in the browser profile (IndexedDB), not inside the .carbon file.
* There is no online brush or update service; both catalogs are local and honest about it.
