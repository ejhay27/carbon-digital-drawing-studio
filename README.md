# Carbon: Prime 7.0.0+ls

**Where all starts begin.**

A professional, local-first creative studio for digital drawing, painting, illustration,
spatial (3D) drawing and comic creation. Carbon works fully offline, needs no account and
sends no telemetry — artwork, brushes, palettes, comics, 3D scenes and settings live in
**Local Storage** on your device (that is what the **`+ls`** release suffix stands for).

- Product: **Carbon: Prime** · release line **7.x+ls** (this build: `7.0.0+ls`)
- Editions: **Windows/desktop** (this tree, full studio) and **Android** (Capacitor shell,
  separately versioned 1.0.0 — see [`docs/ANDROID.md`](docs/ANDROID.md))
- Stack: TypeScript · React 19 · Vite · Tailwind 4 · Zustand · Canvas 2D engine · three.js ·
  Electron packaging · Capacitor (Android)

## Quick start

```bash
npm install        # Node 22+ recommended
npm run dev        # development server (http://localhost:5173)
npm run build      # production build → dist/index.html (single self-contained offline file)
npm run typecheck  # strict TypeScript check
npm test           # Node unit suite (engine core, no browser needed)
npm run desktop    # build + launch in Electron
```

`dist/index.html` runs offline in any modern Chromium/Firefox/Safari — open it directly in
Edge or Chrome, or install it as an app from the browser.

## What's inside

| Area | Where |
|---|---|
| 2D drawing engine (commands, undo/redo, layers, selections) | `src/engine/document.ts`, `src/engine/types.ts` |
| Brush engine (~115 presets: graphite, ink, watercolor, oil, pastel, marker, airbrush…) | `src/engine/strokeRenderer.ts`, `src/engine/tips.ts`, `src/engine/brushes.ts` |
| Crisp Ink (editable vector-like strokes) | `src/engine/crispInk.ts` |
| Drawing Replay (record / play / seek / video export) | `src/engine/replay.ts`, `src/components/ReplayPanel.tsx` |
| Color system, eyedropper + loupe, Quick Color Pick (system picker) | `src/components/ColorStudio.tsx`, `src/win/ColorDock.tsx`, `src/win/dockModel.ts`, `src/platform/screenPick.ts` |
| Filters, liquify, gradients | `src/engine/filters.ts`, `src/engine/liquify.ts` |
| **Prime home screen + animated ocean** | `src/components/Home.tsx`, `src/components/Ocean.tsx` |
| **3D Studio: White Ground, Spatial Ink Lab, camera controls** | `src/win/sceneRender.ts`, `src/win/Studio3D.tsx` |
| Comics Studio (pages, panels, balloons, PDF) | `src/engine/comic.ts`, `src/win/WinPanels.tsx` |
| Carbon Library / local Brush Market | `src/engine/brushPacks.ts`, `src/win/WinPanels.tsx` (Brush Market) |
| `.carbon` project format (zip, verified saves, autosave, recovery) | `src/engine/fileFormat.ts`, `src/engine/persist.ts`, `src/state/actions.ts` |
| Settings, shortcuts, layouts | `src/state/store.ts`, `src/state/commands.ts`, `src/components/Dialogs.tsx` |
| Release identity & patch notes | `src/version.ts`, `src/release/releases.ts` |
| In-app acceptance tests (Help → Run Diagnostics) | `src/engine/selftest.ts`, `src/engine/selftest2.ts` |
| Node unit tests | `tests/` (`npm test`) |
| Windows packaging & CI | `scripts/windows.mjs`, `package.json` (`build`), `.github/workflows/windows.yml` |
| Android build path | `scripts/android.mjs`, `capacitor.config.json`, `docs/ANDROID.md` |

## Packaging (Windows)

```bash
node scripts/windows.mjs              # portable build → release/windows/CARBON-portable/CARBON.html
node scripts/windows.mjs --source     # + source archive → release/windows/CARBON-7.0.0-source.zip
node scripts/windows.mjs --exe        # + Electron portable .exe/.zip (needs Windows or wine;
                                      #   the Electron binary downloads on first run)
npm run desktop:package               # electron-builder NSIS installer + portable → release-desktop/
```

Installer/portable artifacts are produced by CI on every `v*` tag
([`.github/workflows/windows.yml`](.github/workflows/windows.yml)) or locally on Windows with
the commands above. The version comes from `src/version.ts`; the packaging script refuses to
build if `src/release/releases.ts` does not start at that version.

## Testing

- `npm test` — Node unit suite (183+ assertions): release identity, White-Ground defaults and
  legacy scene migration, curve/symmetry math, brush-preset library, color math, comic page
  model, `.carbon` archive guards.
- **Help → Run Diagnostics** inside the app — the full canvas/WebGL acceptance suite
  (rendering determinism, undo/redo, replay reconstruction, save/reopen round-trips, comic
  export, 3D capture, Time Machine, Color Dock, release-metadata rules).
- Manual hardware checks that cannot be automated here are listed in
  [`docs/PRIME-7.md`](docs/PRIME-7.md) (stylus pressure, palm rejection, real trackpads).

## Documentation

- [`docs/PRIME-7.md`](docs/PRIME-7.md) — Carbon: Prime 7.0.0+ls release notes, features,
  architecture, shortcuts, known limitations, test report.
- [`docs/CARBON.md`](docs/CARBON.md) — engine and format deep-dive.
- [`docs/WINDOWS.md`](docs/WINDOWS.md) — Windows edition history and packaging.
- [`docs/ANDROID.md`](docs/ANDROID.md) — Android edition (untouched by 7.0.0).
- [`RECONSTRUCTION.md`](RECONSTRUCTION.md) — audit, decisions and reconstruction checklist.
