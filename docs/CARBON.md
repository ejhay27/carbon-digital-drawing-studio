# Carbon: Prime — *Where all starts begin.*

A professional, local-first creative studio for drawing, painting, illustration, spatial (3D) drawing and comics: a canvas-first, customizable workspace with an extensive brush engine, editable Crisp Ink paths, a complete Drawing Replay system, the White-Ground 3D Studio, Comic Studio and a local brush library. It works fully offline, needs no account and sends no telemetry. Release line: 7.x+ls (see [PRIME-7.md](./PRIME-7.md)).

> **Documentation scope:** This engine deep-dive began as Carbon 1.0 documentation and preserves some historical platform, limitation and roadmap notes below. Those notes are not current Carbon: Prime 7.1.1+ls status. The current source-candidate audit and platform boundaries are in [`AUDIT-7.1.0+ls.md`](./AUDIT-7.1.0+ls.md), [`WINDOWS.md`](./WINDOWS.md) and [`ANDROID.md`](./ANDROID.md). The 3D workspace discussed as future work in §9 now exists as 3D Studio.

---

## 1. Build & run

```bash
npm install
npm run build      # produces dist/index.html (single self-contained file)
npm run dev        # development server
```

`dist/index.html` runs offline in any modern Chromium, Firefox or Safari browser:

* **Windows desktop:** open in Edge or Chrome, or install it as an app from the browser ("Install CARBON").
* **Android tablets:** open in Chrome and use *Add to Home screen*. The tablet interface turns on automatically on coarse-pointer devices, or you can force it in *Settings → Interface*.

* **Android APK:** see [`ANDROID.md`](./ANDROID.md). `node scripts/android.mjs --apk` wraps the same build in a Capacitor 8 shell with native file storage, sharing, back-button handling, lifecycle autosave and palm rejection. This checkout has no current Android GitHub Actions workflow; the documented local build path and its verification limits are in `ANDROID.md`.

> **Platform note (honest scope):** this release is implemented as a web application (TypeScript + React + Canvas 2D), not as the C++/Qt native build described in the master brief. The engine has no UI dependencies (`src/engine/*`), and platform-specific work (file access, storage, input) sits behind small adapters (`state/actions.ts`, `engine/persist.ts`, Pointer Events). That leaves room for native packaging (Tauri/Capacitor, or a Qt port of the engine) later. Native installers were **not** produced or tested in this milestone.

## 2. Architecture

```
src/engine/        UI-independent core
  types.ts         Command, Layer, BrushParams, RecEvent, UndoRec …
  document.ts      DocEngine: deterministic command application, undo/redo, recorder, checkpoints, flood fill
  strokeRenderer.ts Seeded dab engine: spacing, smoothing, pressure/tilt/speed, scatter, colour dynamics,
                   paper grain, watercolor wash post-process, paint mixing, smudge
  tips.ts          Procedural brush tips and tileable paper grains (deterministic, cached, LRU tints)
  brushes.ts       ~115 distinct presets in 13 categories, search, fingerprints, pack import/export
  crispInk.ts      Editable vector-like paths: Catmull-Rom, variable-width outlines, hit-test, split-erase
  render.ts        Shared compositor (view, export, navigator, replay, picking)
  replay.ts        ReplayPlayer: isolated reconstruction, progressive strokes, seek checkpoints
  fileFormat.ts    .carbon v1 serialise / validate / deserialise
  persist.ts       IndexedDB (session recovery, recent files, references, backups)
  selftest.ts      Automated acceptance tests (Help → Run Diagnostics)
src/state/         zustand store (persisted prefs and workspace), actions (file I/O), commands (shortcuts and menus)
src/components/    Studio UI: CanvasView, MenuBar, Dock (panels), FloatingPalette, Brushes, ColorStudio …
```

**Single source of truth.** Every edit is a serialisable `Command` applied by `applyCommand()`. Live editing, Drawing Replay, autosave recovery and the tests all use this one function.

**Undo:** region pixel snapshots (paint), structural snapshots that share canvases (layer ops, which never mutate canvases in place), and immutable path arrays (Crisp Ink). History is capped by step count (configurable) and by a memory budget.

**Rendering:** GPU-backed Canvas 2D compositing with 16 blend modes. Strokes paint into a document-sized buffer, and grain/selection post-processing runs only on the dirty rectangle. The view repaints on demand through `requestAnimationFrame`. Crisp Ink layers are rasterised at the current view or export resolution. A full tiled renderer was not needed at the supported canvas limits; replacing the compositor would not affect the command model.

**Limits:** 8192 px per side, 40 MP per canvas, 64 layers. Every limit has a clear error message.

## 3. Brush engine

There are five engines. Presets combine them with tip, dynamics and texture parameters:

| Engine | Behaviour | Example presets |
|---|---|---|
| Dry build-up | dabs accumulate at *flow*, capped at stroke *opacity* | pencils, inks, pastels, airbrush, markers |
| Watercolor wash | build-up, then wet-edge darkening (blur-difference), granulation, back-run blooms | Transparent / Wet / Granulating / Bloom watercolor, pencil-watercolor hybrids |
| Paint mixing | colour picked up from the canvas under the brush and blended with the loaded colour | Oil, Wet Paint, Palette Knife, Oil Pastel |
| Smudge / blend | premultiplied carry buffer lerped with the canvas | Smudge, Water Brush, Blending Pencil |
| Crisp Ink | editable path geometry on Crisp Ink layers | Crisp Liner / Taper / Brush … |

Parameters include size range, opacity, flow, spacing, hardness, roundness, angle, follow-direction, stabilisation, pressure→size/opacity, tilt→angle/size, speed thinning, entry taper, scatter, count, size/angle/opacity jitter, hue/sat/value jitter, paper grain (5 types, scale), wetness, pickup and composite mode. Brush tips include custom image stamps.

**Library:** search (name, category, tags, engine), favorites, recents, custom collections, lazy thumbnails (IntersectionObserver + idle callback), duplicate and edit, `.carbonbrush` pack import/export with fingerprint duplicate detection, plus missing-stamp warnings with a round-tip fallback.

## 4. Crisp Ink

Each stroke is stored as control points `(x, y, pressure)` plus `size`, `opacity`, `taperStart` and `taperEnd`. Outlines are rebuilt from Catmull-Rom splines with variable width, so they stay sharp at any zoom level and export scale. Supported: select, multi-select, move, control-point drag, recolour, thicken/thin, opacity and taper editing, whole-stroke or partial (path-splitting) erasing, transforms, merging and rasterising. Every operation is undoable and replayable.

## 5. Drawing Replay

* **Recording:** an ordered event log per document. Events are `{t, c}` (command with full input samples `x, y, pressure, tiltX, tiltY, t` and complete brush parameters plus RNG seed), `{t, u}` (undo/redo), `{t, m}` (tool, brush or colour markers) and `{t, cp}` (checkpoint). Idle gaps are compressed (configurable).
* **Checkpoints** are written when recording starts or resumes, and whenever an undo reaches history from before a gap (epoch logic). Reconstruction therefore never depends on unrecorded state.
* **Playback** rebuilds the document in an isolated `DocEngine`. In-progress strokes are rendered progressively from their samples at the recorded pace, so playback never just shows the finished image. Transport: play, pause/resume, restart, jump to start/end, previous/next event, timeline scrubbing with markers, speed presets from 0.25× to 32× or a custom speed, and *Return to artwork*.
* **Seeking** uses in-memory engine checkpoints that clone layers and undo stacks with consistent canvas identity.
* **Video export:** WebM via MediaRecorder, rendered from an isolated player.
* **Storage:** per-document limit (default 250 MB estimate). When it is reached, recording pauses and you are notified. The REC indicator appears in the tab, the status bar and the panel. Everything stays local.
* **Known limitation:** smudge brushes ignore symmetry mirrors. Replay matches the live document within the 2-unit colour tolerance used by the tests; PNG round-trips of semi-transparent pixels can differ by ±1 because of premultiplied alpha.

## 6. `.carbon` v1 file format

A zip container (fflate):

```
mimetype               application/x-carbon (stored first)
manifest.json          format, version, name, width, height, background, activeLayerId, selection,
                       meta, layers[], assets[], replay{file,enabled,paused,epoch,idleCap}, extensions{}
layers/<id>.png        raster layer pixels (lossless)
assets/<id>            embedded imported images (needed for replay of imports)
replay/events.json     { brushes: [deduplicated BrushParams], events: [...] }
replay/cp/<n>/<id>.png checkpoint layer pixels
thumbnail.png          ≤320 px preview
```

Readers reject files with `version > 1`, a missing manifest, invalid dimensions or missing layer data, and they report clear errors. The `extensions` object is reserved for future modules such as CARBON Space scenes.

**Safe save:** serialise, then `verifyBytes` (unzip plus manifest/layer validation), then write. With the File System Access API, data goes to a swap file and replaces the original only when `close()` succeeds. Otherwise a new file is downloaded. A backup copy goes to IndexedDB. Autosave (default every 30 s, and when the tab is hidden) stores every open document for session restore and crash recovery.

## 7. Testing (Help → Run Diagnostics)

Automated tests run in isolated documents:

1. View transform round-trip (zoom/pan/rotate/mirror keeps document coordinates).
2. Incremental stroke rendering is pixel-identical to one-shot rendering (5 engines).
3. Undo/redo restores hash-identical pixels.
4. Drawing Replay reconstructs a multi-layer session (pencil, watercolor, oil mixing, smudge, symmetry, fill, eraser, Crisp Ink, transform, layer props, undo/redo, selection fill, pause/resume, cross-epoch undo) **pixel-identically**.
5. Seeking backward and forward stays deterministic.
6. Playback never modifies the source document (hash check).
7. Save → reopen preserves layer order, properties, raster pixels, Crisp Ink paths and replay history; the reopened replay reconstructs as well.
8. Corrupt or truncated archives are rejected before commit.
9. Every preset is distinct (fingerprint) and deposits paint.
10. Search, export, import and duplicate detection.
11. Recording overhead per stroke event (µs).

**Manual acceptance checklist:** stylus pressure and tilt on real hardware, palm rejection (OS-provided), two-finger undo and three-finger redo, layout persistence after restart, multi-tab switching, File System Access saving in Edge/Chrome, and Android Chrome install. These still need testing on physical devices.

## 8. Known limitations (1.0)

* Web implementation; native Windows and Android installers are not included (see §1).
* Layer groups, masks and clipping layers are planned in the model (layer list plus `extensions`) but not implemented.
* Text is rasterised when placed (not re-editable).
* The perspective guide is visual only (no stroke snapping). Shape assistance is Shift-constrained shapes and Shift-click straight lines.
* Smudge ignores symmetry. Wet-media simulation is procedural (no fluid simulation).
* WebP export depends on browser encoder support (with a warning and PNG fallback).
* Video export runs in real time at the chosen speed (playback is capped at about 90 s).

## 9. Historical CARBON Space roadmap (1.0)

This section records the original 1.0 roadmap, not the current 7.x product scope. Its planned spatial canvas—drawing on planes and surfaces, orbit/pan/dolly navigation, reference objects, scene organisation and hybrid 2D/3D compositions—was later implemented as the existing 3D Studio; see [`WINDOWS.md`](./WINDOWS.md) and [`PRIME-7.md`](./PRIME-7.md). Animation (timelines, keyframes, onion skinning) remains explicitly outside this project scope.
