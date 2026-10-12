# Carbon: Prime 7.1.0+ls — source audit and release readiness

> **Historical baseline snapshot:** this report records the initial 7.1.0+ls source state, before completion of the local-first feature increment. The four proposals below were subsequently implemented in the completed 7.1.0+ls candidate. The 7.1.1+ls snapshot was a documentation/version-metadata patch; the later 7.5.1+ls and 7.6.0+ls snapshots are historical; the current local candidate is 7.7.2+ls. See [`AUDIT-7.1.0+ls.md`](AUDIT-7.1.0+ls.md) for the historical feature audit, [`AUDIT-CURRENT-7.1.1+ls.md`](AUDIT-CURRENT-7.1.1+ls.md) for the intermediate progress snapshot, [`AUDIT-7.6.0-candidate.md`](AUDIT-7.6.0-candidate.md) for the historical 7.6.0 status and [`AUDIT-7.7.2-candidate.md`](AUDIT-7.7.2-candidate.md) for current implementation progress and verification boundaries. The initial test/build metrics and acceptance gaps remain historical evidence.

**Audit date:** 2026-10-11<br>
**Checkout:** `arena/a19e311c-carbon-digital-drawing-studio`<br>
**Audited source baseline:** `06aa2fbd566084fff49f332d53b829a08093c9b1`<br>
**Product target:** Carbon: Prime **7.x+ls** for Windows/desktop; Android remains separately identified as **CARBON 1.0.0**.

## Executive summary

The actual repository was audited and upgraded in place; this is not a replacement prototype. The working tree now includes source changes for safer Android project replacement, rejection of broken `.carbon` references, reliable dirty/autosave marking for 3D camera edits, multi-touch navigation latching, accurate surface normals under non-uniform transforms, a locally bundled Philippine-coast Home scene with motion controls, and the requested exact About/Project Information content.

**Code-level checks pass:** strict TypeScript, **218 Node assertions**, and a Vite single-file build. `node scripts/windows.mjs` also produced a browser-openable `CARBON.html` portable folder; that HTML is **not** a Windows installer or executable. This audit did **not** run the UI in a browser, build an Electron installer/EXE or Android APK, run the in-app Canvas/WebGL diagnostics, or test on physical Windows/Android hardware.

**Release verdict: not ready to call a 7.x release/platform installer accepted.** There is no 7.x GitHub tag/release in the audited repository state, and the required native/browser/device acceptance remains outstanding. No installer/APK is claimed for this 7.x candidate.

## Audit method and evidence boundaries

- Reviewed the checked-out implementation, its existing tests, package/build scripts, Android and Windows configuration, release notes, and checked-in workflows before making targeted changes.
- Regression evidence comes from `tests/all.ts` and actual command output recorded below. Node tests cover code paths and Three.js math; they do not prove React interaction, browser rendering, OS file-provider behavior, or device compatibility.
- The app's in-app diagnostics remain available from Help, but were **not run** here. No browser automation or Android device was available.
- GitHub state below was queried through the authenticated GitHub CLI/API on the audit date. A tag, workflow run, or documentation statement is not treated as proof of a published/working artifact.
- The existing stash `pre-audit working tree from prior Carbon: Prime pass` was inspected by name/stat and left intact; it was not applied or dropped. No history, tag, branch, user file, or remote release was deleted or rewritten.

## Evidence-based feature inventory

| Area | What the checked-out source contains | Evidence and boundary |
|---|---|---|
| Product identity and editions | Windows/desktop identity is sourced from `src/version.ts`: `7.1.0+ls`, Carbon: Prime, tagline “Where all starts begin.” Android is separately selected by `src/platform/edition.ts` and retains the `CARBON 1.0` / `1.0.0` identity. | `tests/all.ts` checks the 7.x line, `+ls`, product strings, release ordering and metadata. Does not imply a published 7.x release. |
| 2D painting and documents | Canvas/document command model, raster and Crisp Ink layers, brush renderer, undo/redo, selection/transforms, color tools, filters/liquify, import/export, replay, recovery/autosave and `.carbon` serialization are present across `src/engine/`, `src/components/`, `src/state/` and `src/platform/`. | Source inventory; Node regressions cover selected engine/color/brush behaviors. Full canvas rendering and end-to-end save/reopen were not run in a browser. |
| Brush library | `src/engine/brushes.ts` creates the built-in presets; custom brushes/packs and Brush Studio code are present. | Node tests assert at least 100 presets, unique IDs/fingerprints, and expected brush categories. |
| Project format and local persistence | `.carbon` archives store a manifest, layers, masks, assets and optional replay data. Browser preferences/docs use local persistence; Android uses the Capacitor filesystem adapter. | `src/engine/fileFormat.ts`, `src/engine/persist.ts`, `src/state/actions.ts`, `src/platform/native.ts`; tests now cover missing mask/asset/replay references and Android replacement rollback. Historical customer projects were not opened in this environment. |
| 3D workspace | Three.js scene data, real ground-plane mesh, White Ground settings, perspective `GridHelper`, lights/objects, editable 3D curves, plane drawing, surface-target drawing, camera controls, saved views and render/capture integration exist in `src/win/sceneRender.ts`, `src/win/Studio3D.tsx` and related modules. | Automated checks verify defaults/migration, grid geometry, camera dirty state, touch gate, actual ray intersections against a Three.js mesh, transformed normals, and local/world coordinate round-trip. Browser/WebGL UI acceptance is still needed. |
| Comics and connected creative tools | Comic page/panel model and studio, 3D-to-panel captures, linked scene layers, Brush Fusion, Orbit Board, Palette Memory, Creative Time Machine and Brush Market code are present under `src/engine/` and `src/win/`. | Tests cover page layouts and selected model logic; no UI-driven export/restore acceptance was run. |
| Home scene | `Home.tsx` overlays the launch UI on a local coast photograph; `Ocean.tsx` adds subtle Canvas 2D wave/reflection motion. Preferences can hide the scene or motion, persist with Zustand settings, and system reduced-motion is respected. Motion work is stopped/observers detached on unmount. | Source and bundled image were checked; production build contains the photo as a JPEG data URI. The 52vh layout and clickable overlay are in source; the decorative scene layer is pointer-transparent, and the Recent Projects jump uses non-smooth scrolling under reduced motion. Exact visual area, browser rendering and resource use were not visually accepted. |
| About / Project Information | About shows `© Ejhay Claus B. Predonio`; its folder icon opens an in-app modal with the supplied project copy. The shared `Modal` implementation provides a close control, max-height and scrolling. | `ABOUT_CREATOR` / `ABOUT_PROJECT_COPY` are compared exactly in `tests/all.ts`. The click route and visual scrolling were not browser-driven. |
| Android build path | Capacitor 8 configuration, Android adapter, `scripts/android.mjs`, project listing/open/share/lifecycle code and `docs/ANDROID.md` are present; generated `android/` is created by the script. | This audit did not generate the Gradle project, build the APK, or test an Android storage provider/device. Historical GitHub APK evidence below is from v1.0.2, not this 7.x candidate. |
| Local-first / offline posture | No account, cloud collaboration, mandatory backend, AI drawing feature, telemetry integration or remote asset service was introduced. The Home image is bundled. Source search found no application `WebSocket`/`sendBeacon` or external service `fetch`; the `fetch` in project serialization reads local image/data URLs. | Source inspection, not packet capture or a formal privacy/security audit. |

This inventory distinguishes **source presence** from **runtime acceptance**. It intentionally does not equate a menu label with a tested workflow.

## Bug and root-cause report

### 1. Android save could destroy the previous project on a failed replacement — corrected

**Baseline cause:** `src/platform/native.ts` wrote and size-checked a temporary file, then deleted the destination before attempting the rename. If rename was unsupported and the fallback write failed, the old project had already been removed. The comment calling the temporary file a backup did not make it a recoverable copy.

**Change:** `src/platform/safeProjectWrite.ts` writes to a unique staging path, verifies the staged size, preserves an existing file by rename or verified rollback copy, installs and verifies the replacement, and restores the old project on failure (or leaves a recovery backup if restoration itself fails). `src/platform/native.ts` delegates to this protocol.

**Evidence:** tests simulate success, rename-limited storage, and a failed install, asserting that the previous contents survive. This is a mocked filesystem test—not Android provider/device evidence.

### 2. Missing archive references could silently omit artwork data — corrected

**Baseline cause:** manifest checks rejected missing raster layer images and malformed Crisp Ink arrays, but did not validate layer-mask or declared asset references. Layer decoding silently skipped an absent mask; asset loading warned and continued when an asset file was absent. A replay reference was checked in `verifyBytes`, but validation was not centralized with the other manifest references.

**Change:** `readManifest()` now rejects missing referenced masks, declared assets and replay files before opening; `readLayers()` repeats the mask/raster/ink checks at decode time rather than silently dropping data.

**Evidence:** `tests/all.ts` builds small real ZIP archives with absent mask, asset and replay entries and asserts rejection. This guards listed references; it is not a complete adversarial ZIP/security review.

### 3. 3D camera changes could remain outside dirty/autosave tracking — corrected

**Baseline cause:** the OrbitControls end callback updated `scene.camera` in memory but did not call `DocEngine.touch()` or otherwise advance the document revision. Several camera/projection updates used `commit(..., false)`, whose old path deliberately did not mark the document dirty. A camera-only change could therefore be missed by autosave/recovery.

**Change:** camera-end persistence now stores a copied pose/projection on the active scene and calls `doc.touch()`. Non-undoable scene edits now still mark the document dirty; only their undo-history behavior remains disabled.

**Evidence:** unit test checks the scene/document link, saved pose and orthographic flag, `dirty`, and revision increment. Actual camera drag and subsequent save/reopen still need UI acceptance.

### 4. A second touch could cancel a 3D stroke and then start another — corrected in the pointer path

**Baseline cause:** the previous pointer-count branch cancelled an existing stroke when the count exceeded one, but continued processing that same second pointer-down event. That event could start a new stroke while the user intended a two-finger navigation gesture.

**Change:** `createTouchGestureGate()` latches the complete multi-touch interval as navigation-only; the second touch cancels the active stroke and returns before drawing logic. One-finger touch orbit is configured only for Camera/Select; draw tools assign the two-touch pan/pinch gesture to navigation.

**Evidence:** tests cover the latch across finger-up order and re-enable drawing only after all active touches are lifted. The event gate is unit-tested; platform touch delivery still requires device testing.

### 5. Surface-stroke offset normal was inaccurate for non-uniformly scaled objects — corrected

**Baseline cause:** a local triangle normal was transformed by `transformDirection(matrixWorld)`, which applies the object's scale directly. That is not the correct normal transform for a non-uniform scale.

**Change:** `surfaceHit()` now uses the inverse-transpose normal matrix before offsetting the world-space hit. Surface strokes still raycast to a visible surface and are converted to that object's local coordinates so they follow later object transforms.

**Evidence:** tests raycast an actual scaled/rotated Three.js box, compare its returned normal and offset to the mathematically transformed face normal, and round-trip the resulting stroke points. This proves helper logic, not interactive WebGL drawing in a browser.

### 6. Home scene did not include the requested coast/lighthouse composition — source enhancement, visual acceptance pending

**Baseline cause:** the previous Home scene was procedural animated water/sky and did not provide a photographic coastal scene with a lighthouse. It should not be described as satisfying that art direction.

**Change:** `assets/home-philippine-coast.jpg` is bundled locally and placed behind, not instead of, the clickable Home UI. Canvas 2D adds gentle reflection/wave contours and subtle image drift. Settings can turn the scene or motion off; OS reduced-motion, page visibility, viewport intersection, cleanup, and a static image/gradient fallback have explicit paths in `Ocean.tsx`.

**Boundary:** the implementation targets the requested daylight/turquoise-water/lighthouse feel and uses `clamp(380px, 52vh, 620px)`. No browser screenshot/visual review was possible, so the exact Philippine setting, half-area composition, contrast, clickable hit targets and motion quality are not certified here.

### 7. About lacked the requested creator/project information — corrected in source

The previous About dialog had neither the exact creator credit nor the dedicated Project Information route. The current dialog adds the credit and a folder button that changes the app dialog state to `projectInfo`; it does not invoke the OS file manager. The full supplied text, punctuation, capitalization, headings, double-space line breaks and paragraph breaks are stored once and tested byte-for-byte as a JavaScript string. The modal implementation is scrollable and closable; its browser appearance remains untested.

## 3D workspace report

- **Ground:** `buildEnvironment()` constructs a 160-unit `PlaneGeometry` at `y = -0.002` with a pure-white `MeshBasicMaterial` by default. It is a real mesh, not a screenshot/backdrop. An optional separate `ShadowMaterial` catcher allows subtle shadows without tinting the white plane.
- **Grid:** `makeGrid()` creates a `THREE.GridHelper` sized to 24 units, spacing-derived divisions clamped to 400, with line colors selected for light/dark work surfaces. The geometry is attached to the scene and rendered through the active perspective/orthographic camera.
- **Camera/input:** OrbitControls is bound to the active camera. Source maps left-drag to orbit only in Camera/Select; right-drag pans; wheel zooms; middle-drag behavior depends on the active tool; Shift+wheel pans; two-touch navigation uses dolly/pan, while a one-touch orbit is restricted to navigation tools. Reset, standard views, focus, projection switching, FOV and named views have source paths.
- **Persistence:** Orbit end stores position, target, orthographic state, zoom and FOV in `scene.camera` and touches the document, enabling existing project/autosave routes to observe the edit.
- **Actual surface drawing:** surface mode raycasts against visible meshes/images, offsets from the face, stores stroke points in target-local space and parents the stroke to the target. Node tests prove ray-hit and coordinate math, including non-uniform normal transformation. They do **not** prove the in-app gesture produces/edits/renders a stroke correctly.
- **Regression and limits:** new scenes start empty with white ground and perspective grid; legacy scene migration preserves existing objects/strokes and fills in ground defaults. The 3D environment remains source/test evidenced; WebGL availability, render appearance, orbit feel, panel captures and real draw/camera separation require browser/GPU acceptance.

## Home scene and About report

### Home

`Home.tsx` sets a 52vh hero (clamped from 380 to 620 CSS pixels), with the Carbon lockup and launch actions at a higher z-index than the background. The coast JPEG is inlined into the single-file web build, not fetched from a service. `Ocean.tsx` caps canvas DPR at 1.4, pauses its animation while hidden/offscreen, responds to `prefers-reduced-motion`, stops its animation frame and disconnects observers/listeners during cleanup, and sets the decorative layer to `pointer-events: none` so it cannot intercept foreground controls. Persisted settings exposannot intercept foreground controls. Persisted settings expose scene on/off and wave/camera-motion on/off; the Recent Projects jump avoids smooth scrolling when reduced motion is requested.

The source satisfies the requested implementation direction; it has not been visually rendered in this audit. Manual acceptance should check the actual initial viewport, half-area balance, lighthouse crop, sky/water colors, reflection/wave subtlety, text/button contrast, offline open, reduced motion, turning both settings off, and resize/unmount behavior.

### About / Project Information

`ABOUT_CREATOR` is exactly `© Ejhay Claus B. Predonio`. The folder button sits beside it and routes to the separate `About / Project Information` modal. `ABOUT_PROJECT_COPY` is rendered with `white-space: pre-wrap`; the built-in modal has `max-h-[90vh]`, `overflow-y-auto`, and a close button. `tests/all.ts` checks the exact full string. Browser acceptance should still exercise click, scroll, close, back behavior, and Android/desktop layout.

## Feature-gap priorities

### P0 — required before describing 7.x as release-ready

1. **Build the real Windows deliverables on a supported Windows packaging environment.** Install Electron successfully, run `npm run desktop:package`, verify installer and portable EXE names, signatures, launch, offline behavior, upgrade/uninstall behavior, and data preservation. Do not treat the HTML portable folder or a tag as an installer.
2. **Build and test the separate Android package.** Run `node scripts/android.mjs --apk` with the documented Node/JDK/SDK; install on real Android hardware; verify public Documents and app-storage fallback, replacement/rollback with real provider semantics, import/open/share/export, lifecycle/back, app update/uninstall implications, and touch/stylus.
3. **Perform a browser acceptance pass against the actual 7.x web bundle.** Run Help → Run Diagnostics; manually exercise 2D draw/save/open/recovery and 3D ground/grid/camera/surface strokes. Capture screenshots/logs so visual and interaction claims have evidence.
4. **Visually accept Home and About.** Verify the hero proportion, foreground clickability/contrast, reduced-motion/static modes and cleanup; exercise the exact-copy dialog route and scrolling.

### P1 — data and compatibility confidence

- Run a fixture matrix of real historical `.carbon` projects (masks, references/assets, replay, comics, scene extensions) through open/save/reopen on Windows and Android. Current tests cover specific broken-reference cases, not a production project corpus.
- Verify that every 3D-only change (camera, projection, settings, draw object, surface stroke) survives save/close/reopen and document recovery in the browser/native app.
- Test storage-provider failure modes beyond the mock, including failed rename/write/stat and recovery-backup discoverability before releasing Android changes.

### P2 — existing limitations / future work, not scope added here

- Existing release notes identify that Drawing Replay does not record 3D edits and symmetry is not applied to surface strokes; large-canvas filters can be main-thread intensive. Keep these explicit unless implemented and tested.
- Trackpad, touch, stylus, WebGL/GPU and accessibility/performance coverage should be expanded on representative hardware. No cloud, AI assistant/generative drawing, accounts, telemetry, or animation timeline is part of this scope.

### Optional local-first feature ideas (not found in the current source)

1. **Home project finder:** search and filter projects, pin favorites, sort by recent/name/size, and clearly distinguish browser-local recents from Android device files. Current Home shows at most eight recent entries; the underlying recent store trims to twelve and has remove-from-recents, but no project search or pinning.
2. **Command palette (for example, Ctrl+K):** searchable commands, tools, workspaces, settings and recent files, reusing existing shortcuts/actions. Source search found no command palette or Ctrl+K handler; this would improve discoverability without a backend.
3. **Offline first-run guide/sample project:** a short, dismissible walkthrough with a bundled example `.carbon` document that teaches layers, local save/recovery, and 3D surface drawing. The tree has Help/docs and diagnostics but no onboarding tour/sample-project flow.
4. **3D surface-stroke symmetry:** optionally mirror or radially repeat strokes on object surfaces while keeping the strokes editable and attached to the target. Current release notes explicitly list surface symmetry as unsupported; design and test coordinate-space rules before adding it.

These were proposals in the initial 7.1.0+ls baseline audit. **Follow-up status (2026-10-11): all four are implemented in the completed 7.1.0+ls candidate**—the project finder, Ctrl+K palette, offline guide/sample and projected 3D surface symmetry. They remain local/offline and do not add accounts, cloud, AI, telemetry, or a timeline. See [`AUDIT-7.1.0+ls.md`](AUDIT-7.1.0+ls.md) for the recorded code/test evidence and limitations; 7.1.1+ls is a documentation/version-metadata patch.

## Rechecked Home adjustments (follow-up)

A focused source recheck found two small improvements worth making: (1) the decorative Ocean wrapper is now `pointer-events: none`, so background media cannot intercept foreground input; (2) the Recent Projects shortcut now uses automatic scrolling when `prefers-reduced-motion` is active instead of forcing a smooth scroll. Typecheck/tests/build were rerun after those changes. The preview HTTP check remains static: browser visuals/interactions are still unverified.

## Real validation results

| Command/evidence | Result |
|---|---|
| `npm run typecheck` | **Pass** (`tsc --noEmit`). |
| `npm test` | **Pass: 218 assertions, 0 failures.** Covers identity, exact About string, White Ground/migration, grid, 3D camera dirty/revision, touch latch, mesh ray hits/normals/offset/local-world round-trip, brush/color/comic logic, Android mocked replacement/rollback, and archive references. |
| `node scripts/windows.mjs` | **Pass.** Script ran Vite build and copied `dist/index.html` to `release/windows/CARBON-portable/CARBON.html`; an existing portable folder was preserved under `release/windows/previous/`. |
| Web bundle size | `dist/index.html`: **1,764,839 bytes** (Vite reports 1,764.84 kB; gzip **607.32 kB**). The JPEG scene is present inline as `data:image/jpeg;base64`. |
| Portable HTML integrity | `cmp` confirmed `release/windows/CARBON-portable/CARBON.html` is byte-identical to `dist/index.html`. SHA-256: `da46fe97489ab9dfe57373a0b9d0e2ccc6448a68de47e89ae390a423ca025d8b`. |
| Vite preview HTTP smoke | `curl -fsS` against the production preview returned the Carbon: Prime HTML title and bundled JPEG URI (1,764,839-byte response). This is a static HTTP check, not browser rendering or interaction acceptance. |
| Normal `npm ci` | **Failed in this sandbox** during Electron postinstall: `unable to verify the first certificate`. Do not retry in this environment until the certificate trust/network issue is resolved. |
| `npm ci --ignore-scripts` | **Passed previously** and allowed typecheck/tests/web build. Electron's install script/binary was intentionally skipped; this is not suitable evidence for native packaging. |
| Electron installer / EXE | **Not built.** No native executable or installer is claimed. |
| Android APK / device | **Not built or tested.** No current-branch APK is claimed. |
| Browser UI / in-app diagnostics / real hardware | **Not run.** No claim of Windows runtime, Android runtime, browser visual acceptance, stylus or touch acceptance. |

## Repository and publication status checked 2026-10-11

- GitHub tags found: `v1.0.0`, `v1.0.2`, `v1.0.3`, `v1.0.4`; no 7.x tag was present.
- Latest listed GitHub Release is `v1.0.2`, containing `app-debug.apk` (4,783,850 bytes). This is a historical Android release, **not** a Carbon: Prime 7.x Windows installer or artifact.
- Windows workflow run [38107207936](https://github.com/ejhay27/carbon-digital-drawing-studio/actions/runs/38107207936) for `v1.0.4` failed at **Install deps**; the build, artifact upload and release steps were skipped.
- Windows workflow run [38106850282](https://github.com/ejhay27/carbon-digital-drawing-studio/actions/runs/38106850282) for `v1.0.3` installed dependencies, then failed at **Build Windows Installer & Portable**; artifact upload/release steps were skipped.
- Android workflow run `38106212551` for `v1.0.2` succeeded, consistent with the historical APK release. It does not establish that the current changed native adapter has been built or tested.
- `src/release/releases.ts` deliberately uses `date: null`; the source does not invent a 7.x publication date.

## Build instructions

Use the checked-in scripts; do not infer an artifact from the version label.

### Reproducible web build and browser-portable HTML

Requirements: Node 22+ and npm. From the repository root:

```bash
npm ci
npm run typecheck
npm test
npm run build                    # dist/index.html (self-contained web output)
node scripts/windows.mjs         # release/windows/CARBON-portable/CARBON.html
```

The `windows.mjs` output is a folder containing an offline-capable HTML app and a README; it is not an EXE or installer. In this sandbox, normal `npm ci` stopped at Electron's TLS-verified postinstall. A JS-only install with `npm ci --ignore-scripts` was enough for typecheck, tests and Vite, but skips Electron's binary and cannot validate desktop packaging.

### Windows installer and native portable EXE

On Windows (or a supported Windows/wine packaging environment) with normal dependencies/Electron installed:

```powershell
npm ci
npm run desktop:package
```

The checked-in electron-builder configuration targets x64 NSIS installer and portable EXE under `release-desktop/`. Alternatively, `node scripts/windows.mjs --exe` builds a separate Electron portable/ZIP output and downloads Electron on first use. **Neither packaging route was completed here.** Verify resulting files and install/launch them before distributing.

### Android APK

Requirements from `scripts/android.mjs`: Node 22+, JDK 21 (`JAVA_HOME`) and Android SDK 36 (`ANDROID_HOME` or `ANDROID_SDK_ROOT`). The script creates the untracked/generated `android/` Gradle project and syncs the Capacitor web bundle/plugins.

```bash
npm ci
node scripts/android.mjs --apk       # release/CARBON-1.0.0-debug.apk by default
node scripts/android.mjs --open      # open generated project in Android Studio
```

A signed release APK uses the `--release` option and `CARBON_KEYSTORE`, `CARBON_KEYSTORE_PASSWORD`, `CARBON_KEY_ALIAS` (optionally `CARBON_KEY_PASSWORD`) environment variables; see [`ANDROID.md`](ANDROID.md). This audit did not run these commands because the Android SDK/JDK/device were not set up here.

## Final diff summary and decision

**Diff summary:** 13 tracked files modified (**637 insertions / 375 deletions**, per `git diff --stat`) plus 6 new files: the local JPEG, this audit report, image-module typings, exact About copy, staged Android project-write helper, and 3D touch-gesture gate. Changes span the README/release/Android docs, About/Home/settings UI, archive validation, Android project writer, 3D camera/surface/input helpers, release notes and regression tests. Build output is ignored under `dist/` and `release/`; the generated HTML is not a version-controlled installer. All work remains uncommitted on the session branch; the pre-existing stash remains preserved.

**Decision:** the source candidate is ready for continued acceptance testing, not for a claim of a verified 7.x Windows/Android release. Promote only after P0 platform builds and UI/device checks pass and their artifacts/results are inspected.
