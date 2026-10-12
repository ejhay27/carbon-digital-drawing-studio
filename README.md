# Carbon: Prime 7.7.2+ls

**Where all starts begin.**

## About Carbon: Prime

Carbon: Prime is a local-first digital drawing and creative studio for making illustrations,
paintings, line art, comics and spatial sketches. Its existing TypeScript/React application
runs as an offline-capable web app and has a separate Capacitor-based Android build path.
Projects and preferences stay on the user's device; the app does not require an account or a
cloud service.

- **Current Windows/desktop source candidate:** `7.7.2+ls` — not published.
- **Android identity:** `CARBON 1.0.0` — separately versioned and unchanged by this update.
- **`+ls`:** the Carbon: Prime Local Storage release line; data is kept in local browser storage
  and project files, or through Android's local file adapter.
- **Developer:** Ejhay Claus B. Predonio.

The `7.7.2+ls` source candidate centralizes workspace creation and typed document routing,
adds pressure-sensitive Carbon 2D brush ribbons to 3D Studio, restores the illustrated Philippine
coast surf loop, and makes Home wait for the active project's save result. Existing event-based
Drawing Replay, local recovery, brush-asset and local-first boundaries are retained. The version
bump is Windows/desktop only; Android remains `CARBON 1.0.0`. This is not a published release.
Node tests, strict TypeScript and the web bundle can be run locally, but browser visuals, Windows
packaging/runtime and Android APK/device acceptance remain separate. See
[`docs/AUDIT-7.7.2-candidate.md`](docs/AUDIT-7.7.2-candidate.md) for scope, evidence and gaps.

## Features

- **2D drawing and painting:** customizable brushes, color tools, layers, selections, shapes,
  filters and transform tools.
- **Crisp Ink:** editable vector-like line-art strokes that can be adjusted after drawing.
- **Coast homepage (Windows/desktop):** original offline Philippine-coast illustration, pale daylight sky, turquoise water, lighthouse and a static skiff, with a periodic Canvas 2D surf loop; no source video, branding, or network asset is embedded. See [`docs/HOME-BEACH-ANIMATION.md`](docs/HOME-BEACH-ANIMATION.md) for provenance and limits.
- **Drawing Replay:** record, play, seek and export a local drawing session. Real pauses are
  preserved by default; start/pause/resume/stop controls do not conflate stopping with deleting
  replay history. Native replay stays in the editable `.carbon` project.
- **My Illustrations:** search, pin and sort browser-local recent projects and Android device
  files, accessible from Home or File → My Illustrations while editing. Project cards can open
  the associated Drawing Replay and recording controls; browser recents remain distinct from
  Android folder files. Windows still relies on browser-local recents rather than a full folder scan.
- **Command palette:** press **Ctrl+K** to search actions, drawing tools, workspaces, settings
  and recent files; navigate with the keyboard.
- **Offline Quick Start:** an optional, dismissible guide with a multi-layer editable sample.
  The sample opens as a new unsaved document and does not replace existing work.
- **Brush Marketplace and asset storage (Windows/desktop):** offline bundled packs, size/storage
  reporting, validated `.carbonpack` import/export and safe local removal. No remote catalog is
  configured in this repository; the UI does not pretend online packs exist.
- **Brush Lab and Custom Erasers:** isolated draft editing through the real brush preview and
  separate local custom brush/eraser presets.
- **QR brush sharing:** bounded payloads, QR PNG/text sharing, and camera-free scanning of a
  selected QR image; the first imported brush is selected for use. The Brushes panel has an
  Imported Brushes section with export-and-remove controls. Arbitrary URLs are rejected;
  end-to-end scanner acceptance is pending.
- **3D Studio (Windows/desktop):** White Ground, perspective grid and separate camera navigation; drawing-first textured ribbons use Carbon 2D brush tips and pen-pressure width, with surface strokes stored against real editable meshes. Tube/sweep geometry and mirror/radial symmetry remain available.
- **Comics Studio (Windows/desktop):** pages, panels, balloons, lettering and export tools.
- **Local-first projects:** `.carbon` v1 project archives, local recovery/autosave, and local
  brush packs and palettes. The Android build uses its own Capacitor file/storage adapter.

Feature availability is edition-gated. This source candidate has not had full browser, Windows
installer or Android device acceptance; the feature list describes implementation in source,
not a claim that each platform has passed release testing.

## How it works

1. The **React** interface dispatches editing actions to Carbon's TypeScript `DocEngine`.
   Document edits use the existing command/undo system; raster paint is rendered with the
   Canvas 2D engine, while Crisp Ink keeps editable path data.
2. **Vite** bundles the browser application into a single HTML file. The web app uses bundled
   assets and local storage paths, so drawing does not depend on a network connection.
3. Projects are saved as **`.carbon` v1 ZIP archives** containing a manifest, artwork layers,
   optional assets and project extensions. Browser recovery and recent-file metadata use
   IndexedDB; saving a project creates or updates a local project file through the relevant
   platform adapter.
4. The Windows/desktop edition adds Electron packaging and three.js-based 3D/Comics workspaces.
   The Android edition wraps the web app with Capacitor and keeps its own `CARBON 1.0.0` app and
   version identity.

This repository adds no account system, cloud collaboration, telemetry, AI drawing/generative
fill, AI assistant or animation timeline.

## Programming languages and technologies

| Language / format | Use in this repository |
|---|---|
| **TypeScript / TSX** | Main application, UI components, drawing engine, state, 3D workspace and tests |
| **JavaScript** | Electron main process and Node.js build/test scripts |
| **HTML** | Web application entry point and generated single-file build |
| **CSS** | Styling through Tailwind CSS 4 and the app stylesheet |
| **JSON** | Package, Capacitor, TypeScript and project/build configuration |
| **YAML** | GitHub Actions workflow configuration |

The Android project is generated by Capacitor's build script; generated Android Gradle/native
files are not checked in here.

## Quick start

Requirements: **Node.js 22 or newer** and npm.

```bash
npm ci
npm run dev        # start the local Vite development server
npm run typecheck  # TypeScript check
npm test           # Node regression suite
npm run build      # build dist/index.html
```

To launch the Electron desktop shell during development, run `npm run desktop` after the
Electron install completes. The web app's drawing features run locally; installing development
dependencies and packaging native builds still require the corresponding platform toolchains.

## Build and package

### Portable offline web build

```bash
node scripts/windows.mjs
```

This writes `release/windows/CARBON-portable/CARBON.html`, a browser-openable offline HTML file.
It is **not** a Windows installer or executable. The script gets the version from
`src/version.ts` and checks the first entry in `src/release/releases.ts`.

### Windows installer / executable

```bash
npm run desktop:package
```

This uses Electron Builder and requires Electron and native packaging dependencies to be
installed on a supported Windows packaging environment. An installer or EXE has not been built
or verified for the current source candidate.

### Android APK

See [`docs/ANDROID.md`](docs/ANDROID.md). The separate Android build uses JDK 21, Android SDK
36 and `node scripts/android.mjs --apk`. Android remains versioned independently as
`CARBON 1.0.0`; an APK/device build is not claimed for this candidate.

## Testing and project status

- `npm run typecheck` — strict TypeScript check.
- `npm test` — Node regression suite (**365 assertions passed, 0 failed** in the 7.7.2+ls source-candidate check).
- `npm run build` — Vite 7.3.2; single-file `dist/index.html` 1,998.29 kB (668.37 kB gzip).
- `git diff --check` — pass.
- **Help → Run Diagnostics** — in-app Canvas/WebGL acceptance tests; not yet run in a browser
  for this candidate.
- Browser interaction and visual acceptance, Windows installer/runtime testing, and Android
  APK/device testing remain outstanding.

The current Windows/desktop 7.7.2+ls build identity is an **unpublished source candidate**, not a
completed release. No native installer or Android APK is claimed. Android remains 1.0.0. See
[`docs/AUDIT-7.7.2-candidate.md`](docs/AUDIT-7.7.2-candidate.md) for status, evidence, verification
results and remaining acceptance work; earlier 7.x audit documents are historical.

## Project documentation

- [`docs/AUDIT-7.7.2-candidate.md`](docs/AUDIT-7.7.2-candidate.md) — current repository audit, source-candidate evidence and platform acceptance gaps.
- [`docs/AUDIT-7.1.0+ls.md`](docs/AUDIT-7.1.0+ls.md) — historical feature implementation evidence and
  verification limits for the 7.1.0+ls feature candidate.
- [`docs/AUDIT-7.1.0+ls-baseline.md`](docs/AUDIT-7.1.0+ls-baseline.md) — initial source-baseline audit.
- [`docs/PRIME-7.md`](docs/PRIME-7.md) — Carbon: Prime 7.x feature and platform notes.
- [`docs/WINDOWS.md`](docs/WINDOWS.md) — Windows/desktop packaging and status.
- [`docs/ANDROID.md`](docs/ANDROID.md) — separate Android build path and verification limits.
- [`docs/CARBON.md`](docs/CARBON.md) — engine and `.carbon` format deep-dive.
