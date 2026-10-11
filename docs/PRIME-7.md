# Carbon: Prime — 7.0.0+ls release documentation

**Product:** Carbon: Prime · **Tagline:** Where all starts begin. · **Identity:** `7.0.0+ls`
(`+ls` = Local Storage). The release line is **7.x+ls**; it is never renamed to Carbon 8.

This document describes what shipped in **7.0.0+ls**, how it is built and tested, and what
remains open. It is the extended version of the in-app *Latest Patches* notes.

---

## 1. What 7.0.0+ls delivered

### 1.1 Identity & platform repair
- Product renamed to **Carbon: Prime** everywhere user-visible (home, About, title bars,
  saved-file metadata, packaging) while keeping the Carbon mark and tagline.
- One version source (`src/version.ts`): `WINDOWS_VERSION = '7.0.0'` plus `LS_SUFFIX = '+ls'`;
  About, release notes, saved-file metadata, diagnostics rules and packaging all agree.
- **Repaired `package.json`** (it was invalid JSON — a trailing comma — so all npm scripts,
  installs and Electron packaging failed). Added `typecheck` and `test` scripts.
- Fixed the stray unused import that failed `tsc --noEmit` under the repo's strict settings.
- Android edition untouched: version line, labels, config and build path are exactly as before.

### 1.2 Prime home screen + cinematic ocean
- New home screen (Windows edition) with a **procedural animated ocean**: calm blue/teal
  water, gentle wave bands, sun glitter, drifting clouds and a bright late-morning sky
  (the feel of ~11 AM Philippine time, with no weather/location service).
- Implementation is Canvas 2D (`src/components/Ocean.tsx`): no WebGL requirement, capped
  device-pixel ratio, one rAF loop that **pauses when the tab is hidden or the hero scrolls
  out of view**, a single static frame under `prefers-reduced-motion`, and a CSS sky/sea
  gradient fallback if the 2D context cannot start. Drawing tools are never delayed by it.
- Every home destination is real and wired:
  **New Drawing** (new-canvas dialog) · **Open Project** (file dialog) · **Recent Projects**
  (live list with thumbnails) · **Import Artwork** (image → document) · **Brush Studio**
  (opens the brush panel on a working canvas) · **3D Studio** · **Comics Studio** ·
  **Carbon Library** (local Brush Market) · **Latest Patches** · **Settings** ·
  **Help & About**. Session-recovery and on-device project lists are preserved.

### 1.3 3D Studio — White Ground
- New scenes start on a **genuine, flat, pure-white ground plane** (a real mesh, not a
  backdrop image) with a neutral bright background and a **perspective grid** that extends
  across the workspace and responds correctly to camera movement.
- No decorative starter cube: new scenes are empty.
- Environment controls: ground on/off, ground color, **subtle shadows** (a separate
  `ShadowMaterial` catcher keeps the ground itself pure white), grid spacing (0.05–2), grid
  and axes toggles, ambient light, background color, camera **field of view** (18°–95°).
- The grid derives from the spacing setting and switches line colors for light/dark scenes.
- Legacy 2.0–2.2 scenes migrate with the ground enabled; objects, strokes, planes and camera
  data are untouched. The ground sits at y = −0.002 so strokes on the XZ plane never z-fight.
- Render-to-layer and comic panel captures include the same environment for opaque captures;
  transparent captures isolate the strokes.

### 1.4 3D Studio — direct camera control
- New dedicated **Camera tool** (`C`): left-drag orbits, middle/right-drag pans, wheel zooms.
- **Input separation:** draw tools own the pointer (left-drag/one-finger draws; the camera
  never moves), navigation tools own it (drag never draws). A mode indicator labels the
  active tool and input hints adapt to mouse vs touch.
- **Touch:** one-finger orbit in Camera/Select tools; in draw tools one finger draws and
  **two fingers pan & pinch-zoom** (a second finger cancels an in-progress stroke so
  navigation always wins).
- **Trackpad:** pinch zooms; **Shift+wheel pans**.
- Camera reset, front/back/left/right/top/bottom/iso/focus views, perspective↔orthographic
  and named saved views continue to work; FOV is saved with the scene camera.

### 1.5 Quick Color Pick (outside the canvas)
- New **system screen color picker** in the Color Dock (`src/platform/screenPick.ts`) using
  the Chromium EyeDropper API where the platform exposes it (Windows Chromium: samples the
  whole screen). If unavailable, Carbon says so honestly and points to the canvas eyedropper
  and Import-Artwork sampling. No online service involved.

### 1.6 Tests
- New Node suite (`npm test`, esbuild-bundled): release identity (7.x+ls, ordering, suffix),
  White-Ground defaults + legacy migration, grid construction, curve/symmetry math, brush
  preset library (≥100 presets, unique fingerprints, category coverage), color math,
  comic page layouts, `.carbon` archive rejection. **184 assertions, all passing.**
- In-app diagnostics gained a `[Win 7]` Prime suite (White-Ground rules) and updated
  release-metadata rules for the `+ls` identity.

## 2. Architecture overview

```
src/
  engine/        UI-free core: DocEngine (commands/undo/replay), strokeRenderer (5 brush
                 engines), tips, brushes, brushPacks, crispInk, render, filters, liquify,
                 comic, fileFormat (.carbon zip), persist (IndexedDB), selftest
  state/         zustand store (settings/layouts/palettes), actions (file I/O), commands
  components/    CanvasView, MenuBar, Dock panels, FloatingPalette, ColorStudio, Dialogs,
                 Home (Prime homepage), Ocean (animated sea), Welcome (Android home)
  win/           Windows-edition studios: Studio3D + sceneRender (three.js), WinPanels
                 (Comic/Effects/Brush Market), ColorDock, OrbitBoard, TimeMachine, Continuum
  platform/      edition gating, native (Capacitor) adapter, screenPick (EyeDropper)
  release/       bundled release notes (Latest Patches works offline)
tests/           Node unit suite (npm test)
electron/        Electron main process (context-isolated, sandboxed)
scripts/         windows.mjs (portable/exe/source), android.mjs, icon tooling
```

Key invariants preserved from earlier releases: every edit is a serialisable `Command`
applied by `applyCommand()`; replay/autosave/tests share that one path; safe saves verify the
archive before committing; all core features run offline with no account.

## 3. Verified in this build

| Check | Result |
|---|---|
| `npm run typecheck` (strict) | ✅ clean |
| `npm run build` (vite production) | ✅ single-file `dist/index.html` (~1.56 MB) |
| `npm test` (Node unit suite) | ✅ 184/184 assertions |
| `node scripts/windows.mjs` (portable) | ✅ `release/windows/CARBON-portable/CARBON.html` |
| `node scripts/windows.mjs --source` | ✅ `release/windows/CARBON-7.0.0-source.zip` (81 files) |
| Built app serves & renders Prime branding | ✅ smoke-tested over HTTP |
| `node scripts/windows.mjs --exe` | ⚠️ blocked in this sandbox (see §4) |
| In-app diagnostics (canvas/WebGL suite) | browser-run; not executable in this sandbox |

## 4. Known limitations (honest)

1. **Electron installers are not produced in this source environment.** The sandbox's network
   policy blocks the Electron binary download (`RequestError: unable to verify the first
   certificate` from the electron postinstall). Build installers with:
   - `npm run desktop:package` on Windows, or
   - `node scripts/windows.mjs --exe` on Windows/wine, or
   - push a `v7.0.0` tag → GitHub Actions (`.github/workflows/windows.yml`) attaches
     `CARBON-Setup-7.0.0.exe` and the portable exe to the release.
   The portable HTML build **is** produced and verified here.
2. **Hardware-in-the-loop checks remain manual:** stylus pressure/tilt, palm rejection,
   touch gestures on real tablets, and trackpad-gesture quirks (drivers differ). The input
   code paths are implemented and unit-logic-checked, but physical verification needs devices.
3. Carried forward from 2.2.0 (unchanged, documented in-app): Drawing Replay does not record
   3D edits; symmetry is not applied to surface strokes; very large canvases apply expensive
   filters on the main thread (previews are reduced-size).
4. The 3D grid clamps visible divisions (≤400); at extreme spacings the drawn spacing may
   round slightly. Snap behaviour always uses the exact setting.

## 5. For maintainers

- Bump versions in `src/version.ts` **and** add a matching entry at the top of
  `src/release/releases.ts` (bare semver in `version`, `suffix: '+ls'` for this line) —
  diagnostics and packaging fail loudly if they disagree.
- `+ls` marks Local Storage builds; keep it on every 7.x release entry.
- Run `npm run typecheck && npm test && npm run build` before tagging; tag `v7.x.y` to have
  CI produce the Windows installers.
