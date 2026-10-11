# CARBON: PRIME 7.x+ls — Reconstruction & Implementation Checklist

Historical working document for the reconstruction of the repository into the **Carbon: Prime 7.1.0+ls** source candidate. Its audit findings, version references, “live” checklist and Android-scope statements below describe that earlier snapshot, not the current checkout. The current tree is the local **7.1.1+ls** candidate: its 7.1.0+ls feature increment includes the finder and Quick Start, while 7.1.1+ls updates the README and version metadata only. Android's own app/version identity remains separate, and no device acceptance is implied. See [`docs/AUDIT-7.1.0+ls.md`](docs/AUDIT-7.1.0+ls.md) for feature evidence and remaining checks.

## 1. What was supplied

The repository `carbon-digital-drawing-studio` is a multi-language source drop for the CARBON
creative studio (historically versioned 1.0 → 2.2.0). Languages/technologies present:

| Language / tech | Files |
|---|---|
| TypeScript (UI, React 19 + TSX) | `src/components/*`, `src/win/*`, `src/App.tsx`, `src/main.tsx` |
| TypeScript (engine, UI-free) | `src/engine/*` (document, strokeRenderer, brushes, comic, filters, replay, fileFormat, persist, crispInk, render, tips, util, selftest) |
| TypeScript (state) | `src/state/store.ts`, `actions.ts`, `commands.ts` |
| JavaScript (Electron main) | `electron/main.js` |
| JavaScript (build/tooling) | `scripts/windows.mjs`, `scripts/android.mjs`, `scripts/render-icons.mjs`, `scripts/make-desktop-icon.mjs` |
| YAML (CI) | `.github/workflows/windows.yml` |
| JSON (config) | `package.json`, `package-lock.json`, `tsconfig.json`, `capacitor.config.json`, `vite.config.ts` (TS) |
| CSS (Tailwind 4) | `src/index.css` |
| HTML | `index.html` |
| SVG / ICO (assets) | `assets/icon*.svg`, `assets/splash.svg`, `assets/icon.ico`, `assets/icon.png` |
| Markdown (docs) | `docs/CARBON.md`, `docs/WINDOWS.md`, `docs/ANDROID.md` |

All blocks belong to **one application** (a local-first drawing studio) with two editions:
Windows (full studio incl. 3D, comics, board) and Android (Capacitor shell, versioned 1.0.0,
intentionally separate). No second project was found; nothing needed to be split off.

## 2. Audit findings (initial)

### Defects found & repaired
1. **`package.json` was unparseable JSON** (trailing comma after `"desktop:package"`) — every
   `npm`/`electron-builder` operation failed before doing anything. **Fixed** by rewriting the
   manifest (same dependency versions; added `typecheck` and `test` scripts).
2. `src/components/MenuBar.tsx` imported `CarbonMark` without using it → `tsc --noEmit`
   failed (the repo's own strict settings). **Fixed** during the 7.x rebrand.
3. The 3D Studio default environment violated the Prime spec: dark `#26262b` background, a
   **decorative default cube**, dark grid colors, and **no ground plane at all**. **Fixed**
   (white ground plane, neutral background, perspective grid, empty default scene).
4. 3D camera input had no dedicated navigation tool and no touch gesture separation
   (one-finger touch could not orbit at all in draw tools; no mode indicator). **Fixed.**

### Already working (preserved, not rewritten)
2D command-based engine (`DocEngine`) with undo/redo & region snapshots; seeded dab brush
engine (~115 presets, 5 engines incl. watercolor/oil mixing/smudge); Crisp Ink editable
vector strokes; Drawing Replay record/playback/seek/video; `.carbon` v1 zip format with
verify-before-commit safe save; IndexedDB autosave/session recovery/recents; layers, blend
modes, filters, liquify, gradient; comic pages/panels/balloons/PDF export; Brush Market
(local packs, import/export, duplicate detection); Continuum 3D↔2D linking; Time Machine
snapshots; floating tool palette; keyboard shortcuts; tablet mode; Android integration.

## 3. Engineering decisions

1. **Reuse, don't rewrite.** The existing React + TypeScript + Vite + Zustand + Canvas 2D +
   three.js architecture satisfies every requirement; it was extended, not replaced.
2. **Version identity.** `WINDOWS_VERSION = '7.1.0'` stays bare semver (ordering, packaging,
   diagnostics) and the user-facing identity is `7.1.0+ls` via `LS_SUFFIX`. Android keeps its
   own 1.0.0 line and labels, exactly as before. Never "Carbon 8".
3. **Homepage.** The Windows-edition home screen is rebuilt as the Prime home with a
   procedural Canvas-2D ocean (no WebGL dependency, static fallback, pauses when hidden,
   honours `prefers-reduced-motion`). The Android edition keeps its existing Welcome screen.
4. **3D white ground.** Pure-white basic-material ground plane + separate `ShadowMaterial`
   catcher (subtle optional shadows keep the ground white); grid built from `gridSize`;
   legacy scenes migrate with the ground enabled (strokes stay at their coordinates; the
   ground sits at y = −0.002 so coplanar strokes do not z-fight).
5. **Camera control.** New dedicated **Camera** tool; OrbitControls mouse/touch maps are
   switched per tool (brush tools never orbit on left-drag/one-finger); two-finger touch
   cancels an in-progress stroke and pans/zooms; Shift+wheel pans for trackpad users.
6. **Testing.** Node-runnable unit suite (`tests/`, esbuild-bundled) for DOM-free engine
   logic + the existing in-app diagnostics (Help → Run Diagnostics) extended for the new
   release rules and white-ground defaults.
7. **Packaging honesty.** The sandbox cannot download the Electron/NSIS binaries (network
   policy), so Windows `.exe` artifacts are produced by CI (`.github/workflows/windows.yml`)
   or locally with the documented commands; the portable HTML build **is** produced here.

## 4. Implementation checklist

- [x] Phase A — audit repo, write this checklist
- [x] Phase B — repair `package.json`; baseline `tsc`/`build` green
- [x] Phase C — version/identity: `7.1.0+ls`, Prime lockup, About/title/electron metadata
- [x] Phase C — release notes entry 7.1.0 (+ls) describing *actual* changes; diagnostics rules updated
- [x] Phase D — Prime homepage: ocean scene (animation, pause, reduced-motion, fallback) + all destinations wired
- [x] Phase D — 3D: white ground default environment, perspective grid from spacing, empty default scene, env. controls
- [x] Phase D — 3D: Camera tool, touch one-finger orbit / two-finger pan+pinch, Shift+wheel pan, mode indicator, FOV
- [x] Phase E — headless/Continuum renderer draws the same ground
- [x] Phase F — Node unit tests (`npm test`) + extended in-app diagnostics
- [x] Phase G — typecheck, build, tests, portable Windows build, source ZIP
- [x] Phase H — docs: README, PRIME-7 release doc, updated WINDOWS/CARBON docs
- [x] Phase I — Android untouched (verified by git diff), release metadata consistent

## 5. Known limitations (honest)

- Electron/NSIS installers must be built on Windows/CI (sandbox network policy blocks the
  Electron binary download); commands are documented in README §Packaging.
- Manual stylus/touch hardware checks (pressure, palm rejection, real trackpad gestures)
  require physical devices and remain manual acceptance steps.
- The 2.2.0 known issues that were not addressed in this release (Replay does not record 3D
  edits; symmetry not applied to surface strokes) carry forward unchanged.

## 6. Block → file mapping (supplied code → project)

Every supplied block is already organised in the tree; reconstruction mapped them 1:1:

| Supplied block | Purpose | Project path |
|---|---|---|
| React entry | App bootstrap | `src/main.tsx`, `index.html` |
| Studio shell / routing / workspaces | UI chrome | `src/App.tsx`, `src/components/Chrome.tsx`, `src/components/MenuBar.tsx`, `src/win/WinPanels.tsx` |
| 2D engine | commands, undo, layers | `src/engine/document.ts`, `src/engine/types.ts` |
| Brush engine | dabs, tips, presets | `src/engine/strokeRenderer.ts`, `src/engine/tips.ts`, `src/engine/brushes.ts`, `src/engine/brushPacks.ts` |
| Crisp Ink | vector strokes | `src/engine/crispInk.ts` |
| Replay | recording/playback | `src/engine/replay.ts`, `src/components/ReplayPanel.tsx` |
| File format | `.carbon` zip | `src/engine/fileFormat.ts`, `src/engine/persist.ts` |
| 3D | scene model + viewport | `src/win/sceneRender.ts`, `src/win/Studio3D.tsx` |
| Comics | pages/panels/export | `src/engine/comic.ts`, `src/win/WinPanels.tsx` (Comic Studio), `src/state/actions.ts` |
| Electron shell | desktop window | `electron/main.js` |
| Packaging | portable/installer/CI | `scripts/windows.mjs`, `package.json` (`build`), `.github/workflows/windows.yml` |
| Android | Capacitor shell | `capacitor.config.json`, `scripts/android.mjs`, `docs/ANDROID.md` |
| Version/notes | release identity | `src/version.ts`, `src/release/releases.ts` |
| Diagnostics | in-app tests | `src/engine/selftest.ts`, `src/engine/selftest2.ts` |

New in this release: `src/components/Home.tsx`, `src/components/Ocean.tsx`, `tests/*`,
`README.md`, `docs/PRIME-7.md`.
