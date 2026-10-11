# Carbon: Prime — 7.x+ls release documentation

**Product:** Carbon: Prime · **Tagline:** Where all starts begin. · **Current local source candidate:** `7.1.1+ls`
(`+ls` = Local Storage). The release line is **7.x+ls**; it is never renamed to Carbon 8.

The four discoverability and surface-symmetry features were implemented in the 7.1.0+ls
feature increment. The current 7.1.1+ls patch updates README documentation and version metadata
only; it does not add runtime features. This document retains the initial 7.1.0+ls baseline audit.
It is not proof of publication: no 7.1.x GitHub release, Windows installer/EXE, or current-branch
Android APK is claimed. See [`AUDIT-7.1.0+ls.md`](AUDIT-7.1.0+ls.md) for feature evidence and
remaining browser/platform acceptance.

---

## Current local source candidate — 7.1.1+ls

- **Project finder:** search/filter browser-local recent documents and Android device files in separate labeled sections; pin/unpin and sort by recent activity, name or size. Pin keys and sort preference persist in Carbon's local settings, with defaults backfilled for existing preference records.
- **Command palette:** **Ctrl+K** opens searchable actions, tools, Windows workspaces, settings and recent files. Arrow Up/Down, Home/End, Enter and Escape navigate/run/close; commands display their assigned shortcuts. The shortcut can be changed in Preferences → Shortcuts.
- **Offline first-run guide/sample:** a dismissible tour is offered from Home/Welcome, with a reusable Help/Home entry. The bundled sample is a new 1200×900 document with separately editable paint and ink layers; every open constructs a fresh sample and does not overwrite an existing document or file. No network fetch is used.
- **3D surface symmetry:** mirror/radial copies of object-surface strokes are ray-projected to real visible meshes using transformed sample normals. A copy is accepted only if its complete path can stay on one surface; copies with no matching geometry are skipped rather than emitted as floating curves. Accepted paths are parented to their target meshes, stored in target-local coordinates, and stay individually editable.
- **Compatibility/version:** Windows/desktop version metadata is `7.1.1+ls`; package and lockfile are `7.1.1`. This is a documentation-only patch over the 7.1.0 feature increment. Android remains separately identified as `CARBON 1.0.0`, with no Android version bump. The `.carbon` archive/manifest format is unchanged.
- **README/about update (7.1.1+ls):** the project README now gives an app description, credits developer Ejhay Claus B. Predonio, names the source languages/technologies, summarizes features and explains the local-first architecture and build paths. No product-runtime code changed in this patch.
- **Code-level evidence:** current 7.1.1+ls source passes `npm run typecheck` and `npm test` (**258 assertions, 0 failures**). The suite covers finder/pin/sort, palette search/navigation, settings migration, sample isolation and mesh ray-projection/editability. This does not constitute browser UI, WebGL interaction, Windows executable/installer, or Android device acceptance.
- **Local-only status:** no release was published. The candidate remains subject to browser visual/accessibility testing, Help → Run Diagnostics in a browser, Windows packaging/runtime checks and separate Android build/device validation.

## 1. Historical 7.1.0+ls source foundation

### 1.1 Identity & platform repair
- Product renamed to **Carbon: Prime** everywhere user-visible (home, About, title bars,
  saved-file metadata, packaging) while keeping the Carbon mark and tagline.
- One version source (`src/version.ts`): `WINDOWS_VERSION = '7.1.0'` plus `LS_SUFFIX = '+ls'`;
  About, release notes, saved-file metadata, diagnostics rules and packaging all agree.
- **Repaired `package.json`** (it was invalid JSON — a trailing comma — so all npm scripts,
  installs and Electron packaging failed). Added `typecheck` and `test` scripts.
- Fixed the stray unused import that failed `tsc --noEmit` under the repo's strict settings.
- Android keeps its separate `CARBON 1.0.0` name/version identity. This pass changes shared project-save and validation code; the Capacitor build path remains available, but neither APK packaging nor Android runtime behavior was exercised here.

### 1.2 Prime home screen + local Philippine coast
- The Home hero uses a locally bundled coast photograph (pale-blue sky, turquoise water, daylight and lighthouse) with a subtle Canvas 2D wave/reflection overlay; it is not a remote image, live weather feed, or procedural 3D ocean. The intended art direction is a Philippine tropical coast around 11 AM.
- `src/components/Ocean.tsx` uses a capped device-pixel ratio and one rAF loop that pauses when the page is hidden or the hero is outside the viewport. The preference can disable motion; the animation also respects `prefers-reduced-motion`. If Canvas 2D is unavailable, the bundled image/sky and CSS sea-color fallback remain. This code and its local asset are present; final browser rendering, exact half-area layout, clickable-over-hero behavior, and resource behavior still require visual acceptance.
- Home destinations are wired in source: **New Drawing** (new-canvas dialog) · **Open Project** (file dialog) · **Recent Projects** (project list) · **Import Artwork** · **Brush Studio** · **3D Studio** · **Comics Studio** · **Carbon Library** (local Brush Market) · **Latest Patches** · **Settings** · **Help & About**. Session recovery and local project-list paths remain in place; UI navigation has not been browser-driven in this audit.

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

### 1.4 3D Studio — camera, surface drawing, input separation
- A dedicated **Camera tool** (`C`) owns navigation gestures: left-drag orbits, middle/right-drag pans, the wheel zooms; reset, standard/focus views, perspective↔orthographic, and saved views have dedicated paths.
- Draw tools keep pointer input for drawing. Camera gestures are gated so a camera drag does not also create a stroke; a multi-touch gesture latches navigation for its lifetime and cancels an in-progress touch stroke. Automated tests cover the gesture gate and Three.js ray hits against a real mesh plus local/world stroke-coordinate round trips. Mouse/stylus/touch behavior still needs browser and device verification.
- In draw mode, surface strokes raycast to the visible mesh and store points in that mesh's local coordinates; the grid alone is not treated as a drawable object.
- Trackpad pinch and Shift+wheel navigation remain source paths. Camera mutations mark the scene dirty and persist through the existing scene-save path. Camera/UI behavior has not been driven in a browser during this audit.

### 1.5 Quick Color Pick (outside the canvas)
- New **system screen color picker** in the Color Dock (`src/platform/screenPick.ts`) using
  the Chromium EyeDropper API where the platform exposes it (Windows Chromium: samples the
  whole screen). If unavailable, Carbon says so honestly and points to the canvas eyedropper
  and Import-Artwork sampling. No online service involved.

### 1.6 About / Project Information
- The creator credit is `© Ejhay Claus B. Predonio`.
- A folder icon beside the credit opens an in-app, scrollable, closable Project Information dialog (it does not open the operating-system file manager).
- The dialog uses the requested wording and paragraph breaks verbatim:

```text
This Project lasted 5 years to create. If you're reading this, it might be the final updated version, or I'll fix it if there's any bugs, or more features to add in the future.

I'm a solo Developer who created Carbon: Prime. It has been distributed to Android devices such as tablets and etc., Windows support, and more in the future.

About the Carbon
This app was created in Scratch, with 0 Budget, and with only a small compiler, and of course an Acer Laptop.

Performance
The performance of Carbon is based on your Hardware's performance.

Android version
On Android version (Tablets) it supports all features, and of course based on its hardware performance.

Windows version
It supports all Features in Windows, and also based on the hardware (Windows) performance.

Other Projects Created
O.R.V.Y.N, Folian, Carbon: Flux, Purge, Basalt, MyClassmate, and more.

© Ejhay Claus B. Predonio
```

### 1.7 Tests
- `npm test` runs the Node/esbuild suite. **218 assertions passed, 0 failed** in this audit, including release identity, White-Ground defaults/migration, grid math, brush/color/comic regressions, exact About content, camera persistence, touch gesture latching, actual Three.js surface ray hits/local-space round trips, Android staged-write/rollback behavior, and rejection of missing archive references.
- These unit checks are not a substitute for browser interaction, Windows packaging, Android device testing, stylus/touch verification, or accessibility review. In-app browser/WebGL diagnostics were not run.

## 2. Architecture overview

```
src/
  engine/        UI-free core: DocEngine (commands/undo/replay), strokeRenderer (5 brush
                 engines), tips, brushes, brushPacks, crispInk, render, filters, liquify,
                 comic, fileFormat (.carbon zip), persist (IndexedDB), selftest
  state/         zustand store (settings/layouts/palettes), actions (file I/O), commands
  components/    CanvasView, MenuBar, Dock panels, FloatingPalette, ColorStudio, Dialogs,
                 aboutCopy, Home (Prime homepage), Ocean, Welcome (Android home)
  win/           Windows-edition studios: Studio3D + sceneRender (three.js), touchGestureGate,
                 WinPanels (Comic/Effects/Brush Market), ColorDock, OrbitBoard, TimeMachine,
                 Continuum
  platform/      edition gating, native (Capacitor) adapter, safeProjectWrite, screenPick
  release/       bundled release notes (Latest Patches works offline)
tests/           Node unit suite (npm test)
electron/        Electron main process (context-isolated, sandboxed)
scripts/         windows.mjs (portable/exe/source), android.mjs, icon tooling
```

Key invariants preserved from earlier releases: every edit is a serialisable `Command`
applied by `applyCommand()`; replay/autosave/tests share that one path; safe saves verify the
archive before committing; all core features run offline with no account.

## 3. Verification record (this audit)

| Check | Result / boundary |
|---|---|
| `npm run typecheck` | Pass (strict TypeScript) |
| `npm test` | Pass: **218 assertions, 0 failures**. See `tests/all.ts`; Node tests do not render the UI. |
| `npm run build` (via `node scripts/windows.mjs`) | Pass: Vite single-file `dist/index.html` (1,764.84 kB / 1,764,839 bytes, gzip 607.32 kB). The locally bundled coast photo is embedded as a JPEG data URI. |
| `node scripts/windows.mjs` portable HTML build | Pass: `release/windows/CARBON-portable/CARBON.html` (1,764,839 bytes), byte-identical to `dist/index.html`; previous portable folder retained under `release/windows/previous/`. This is a browser-openable HTML file, not an EXE/installer. |
| Android project replacement tests | Pass against a mocked filesystem for successful replace, rename-limited fallback and restoration after install failure; no Android storage provider/device was used. |
| 3D surface logic tests | Pass for Three.js ray hits on an actual mesh, inverse-transpose normals under non-uniform scale, offset direction, and local↔world stroke coordinate round-trip; no WebGL viewport/browser interaction was run. |
| `npm ci` (normal install) | Failed in this sandbox at Electron postinstall with `unable to verify the first certificate`. `npm ci --ignore-scripts` installed JS dependencies and was used for typecheck/tests/web build; it does not install Electron's binary. |
| Electron installer / portable executable | Not built or verified in this environment. |
| Browser UI / in-app Canvas+WebGL diagnostics | Not run; no browser automation/runtime was available. |
| Android APK / physical Android behavior | Not run; no generated Gradle project or device was used. |

## 4. Release-readiness gaps

1. **No verified native Windows installer or executable from this audit.** For a Windows release, run the packaging commands in §5 on a supported machine after Electron install succeeds. The checked-in Actions workflow is only an attempted build path; past failed runs and a tag do not establish a release artifact.
2. **No browser acceptance pass.** Visually inspect Home layout/scene, About routing/scroll/close, drawing, save/open/recovery, the 3D ground/grid, camera gestures, surface strokes, and accessibility in Chromium/WebGL-capable hardware. The regression suite is code-level only.
3. **No Android acceptance pass.** Build the separate CARBON 1.0.0 APK, test storage replacement/rollback on Android public Documents and app-storage fallback, then test open/share/back/lifecycle plus stylus and touch on physical hardware. The adapter tests use a mock.
4. **Performance and input remain device-dependent.** Stylus pressure/tilt, palm rejection, touch gestures, trackpads, WebGL limits, and large-canvas filters need representative hardware tests.
5. Historical 7.1.0 notes listed surface-stroke symmetry as unsupported; the 7.1.0+ls source candidate now implements mesh-projected editable copies (see the current-candidate section above). Drawing Replay still does not record 3D edits; very large canvases can run expensive filters on the main thread (previews are reduced-size).
6. The 3D grid clamps visible divisions (≤400); at extreme spacings the drawn spacing may round slightly. Snap behavior uses the configured spacing.

## 5. Actual build instructions

### Web / offline single-file build

Requirements: Node 22+ (recommended by the checked-in Windows workflow) and npm.

```bash
npm ci
npm run typecheck
npm test
npm run build                    # dist/index.html
node scripts/windows.mjs         # release/windows/CARBON-portable/CARBON.html
```

`node scripts/windows.mjs` creates the browser-portable HTML folder; it is not a Windows `.exe`. If the Electron postinstall TLS certificate error seen in this sandbox also blocks a web-only dependency install, `npm ci --ignore-scripts` was sufficient here for typecheck, tests and Vite build, but it intentionally does not install the Electron binary and must not be used to claim native packaging readiness.

### Windows installer / portable executable

On Windows (or a supported Windows packaging environment such as the script's documented Windows/wine path), use a normal install so Electron and native packaging dependencies are installed:

```powershell
npm ci
npm run desktop:package
```

The checked-in electron-builder config targets x64 NSIS installer and portable EXE; outputs go to `release-desktop/`. Alternatively, `node scripts/windows.mjs --exe` makes its own Electron portable/ZIP build and requires the Electron binary download. Neither command completed in this audit environment.

### Android APK

Android is a separate **CARBON 1.0.0** product identity. Follow [`ANDROID.md`](ANDROID.md): install Node 22+, JDK 21 and Android SDK 36, configure `JAVA_HOME` / `ANDROID_HOME`, then run `npm ci` and `node scripts/android.mjs --apk`. This audit did not build or test an APK.

### Release identity

Bump versions in `src/version.ts` and add a matchest entry at the top of `src/release/releases.ts` (bare semver in `version`, `suffix: '+ls'` for the Windows line). Keep Carbon: Prime on **7.x+ls**; do not change the Android edition's independent version. Run `npm run typecheck && npm test && npm run build` before tagging. A tag or workflow run is not proof of a published artifact; inspect the completed CI job and release assets.
ssets.
