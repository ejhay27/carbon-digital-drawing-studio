# Carbon: Prime 7.7.2+ls — repository audit and source-candidate status

- **Audit date:** 2026-10-12
- **Repository:** `ejhay27/carbon-digital-drawing-studio`
- **Session branch:** `arena/a19e311c-carbon-digital-drawing-studio`
- **Windows/desktop candidate:** Carbon: Prime `7.7.2+ls` (`+ls` = Local Storage)
- **Android identity:** CARBON `1.0.0`; the Android versionName/versionCode remain separately controlled.
- **Release state:** unpublished local source candidate. This is not a completed release or platform-support claim.
- **GitHub:** work is confined to the Arena session branch. A GitHub push, pull-request merge, tag or release is not evidence of platform acceptance.

## Executive summary

The requested source update centralizes supported workspace creation in **Create**, keeps Draw, Comic and 3D documents routed to their owning studio, retains Orbit Board, de-duplicates repeated Undo toasts, redesigns the 3D drawing controls around selected Carbon 2D brushes, connects the Home scene to a generated Philippine-coast illustration, and makes the Home action wait for the active project's save result. The Windows package/version identity is 7.7.2; Android remains CARBON 1.0.0.

The work has automated source-level evidence: Node tests exercise workspace classification, toast de-duplication, pressure-sample simplification, real variable-width ribbon geometry, surface ray hits, local-space conversion, symmetry projection and wave-loop math. These tests do **not** prove WebGL output, browser interactions, actual stylus input, save dialogs, visual framing or Windows/Android runtime behavior. Do not present any unverified platform path as complete.

No cloud upload, whole-screen/cursor/menu/idle recording, microphone/camera capture, camera QR scanning/permission, AI drawing, generative fill, AI assistant, animation timeline or Carbon: Flux integration is in scope or added. QR import remains based on a user-selected image. Windows user-selected-folder/File Explorer behavior remains distinct from Android scoped storage/document-provider behavior.

## Status definitions

- **Implemented in source:** code exists; this alone is not a runtime acceptance result.
- **Automated source check:** a named local test/check passed; its scope is limited to that check.
- **Unverified:** not exercised in the relevant browser, packaged Windows runtime or Android device.
- **Partial/limitation:** only the stated behavior exists, or required platform support remains outstanding.
- **Candidate:** local build metadata only; not a published or release-complete version.

## Scope audit and evidence

| Area | Source status | Evidence and verification boundary |
|---|---|---|
| Create and relocated workspace entries | Implemented in source; UI acceptance unverified | `src/components/Dialogs.tsx` centralizes creation choices. `src/win/WinPanels.tsx` and `src/components/CommandPalette.tsx` no longer offer Comic/3D as relocatable workspace entries. Orbit Board remains. The Create dialog's Windows/Android visibility and cancel paths still need browser/platform interaction checks. |
| Draw / Comic / 3D document isolation | Implemented in source and partly unit-tested | `src/win/workspaceModel.ts`, `src/App.tsx`, `src/components/Chrome.tsx`, `src/state/actions.ts` and `src/state/commands.ts` classify active project documents and route their saves. Open/reopen, tab switching and save behavior have not been exercised end to end in the UI. |
| Comic project container | Implemented in source; file-dialog behavior unverified | Normal close treats Comic tabs as a multi-page `.carboncomic` project with a project-level prompt/save. Explicit Delete Page remains separate and transfers the project handle when the first page is deleted. Actual save/open/reopen and cancel/failure dialogs still require platform testing. |
| Duplicate Undo toasts | Implemented and unit-tested | `dedupeToastList` refreshes an identical message in its existing slot; `tests/all.ts` checks message/kind identity and distinct kinds. No long-running UI toast interaction test was run. |
| Create and save routing | Implemented in source; end-to-end flows unverified | Save and Save As route based on the active document, and Comic saves use the `.carboncomic` project path. `.carbon`/`.carboncomic` correctness is covered by existing structural checks, not browser File System Access or Android document-provider tests. |
| 3D brush-first drawing | Implemented in source; browser/WebGL unverified | `src/win/Studio3D.tsx` selects an actual Carbon 2D brush, renders a deterministic alpha texture with the existing brush engine, stores the texture as a project asset, and creates textured ribbon geometry by default. Brush modes that rely on 2D mix/smudge/crisp blending are represented by a deterministic ink mask in 3D; 3D does not replay 2D blend operations. |
| Stylus pressure and width | Geometry/math unit-tested; physical pen unverified | Pointer pressure is captured for pen input, retained when points are simplified, and interpolated into real ribbon vertex widths using the selected brush's pressure-size/minimum-size values. Mouse input uses full pressure. Stylus hardware/browser reporting has not been tested. |
| Surface strokes and camera navigation | Surface math unit-tested; interactive camera/WebGL unverified | Surface paths are ray-hit, projected onto visible meshes, stored in target-local coordinates and rebuilt with the parent transform. Mirror/radial copies are projected onto matching meshes and unmatched paths are skipped. Ribbon centerline lift is kept small for pressure-thin portions. Camera controls are separated from draw input and multi-touch navigation cancels the pending stroke. Tests cover ray hits, transformed normals, surface-local round trips, symmetry projection and touch-gesture latching; they do not prove a rendered stroke stays visually attached through live camera motion. |
| 3D controls and compatibility | Implemented in source | The right-hand panel defaults to Spatial Ink, a Carbon brush selector, size, opacity, taper and smoothing. Solid tube/sweep forms are under advanced geometry. Existing scene data and alternative geometry choices remain. Canvas/WebGL visual acceptance is outstanding. |
| Home coast image and wave loop | Implemented in source; visual/low-memory acceptance outstanding | `assets/home-philippine-coast-11am.jpg` (1376×768, 110,363 bytes) is the local generated illustration used by `src/components/Ocean.tsx`. It depicts pale daylight sky, turquoise water, coast vegetation, a lighthouse and a stationary skiff. The Canvas 2D overlay loops over 14 seconds, caps painting at 30 fps and DPR 1.25, stops when hidden/offscreen, respects the saved motion switch and `prefers-reduced-motion`, and leaves the image/gradient fallback available. Tests cover loop math and cover alignment, not browser framing, visible wave quality or reduced-motion appearance. |
| Safe Home navigation | Implemented in source; UI/save-provider cases unverified | `navigateHomeSafely()` awaits the active document's save result; a canceled/reported failed save returns without switching Home, and a clean document can navigate without a save. Comic dirty detection is project-group-aware. The global Home action is in `src/components/MenuBar.tsx`; 3D Studio also exposes a shortcut button. File picker/download and native document-provider success/cancel/failure behavior has not been exercised. A browser download fallback can confirm only that the app initiated its save path, not that a person retained the downloaded file. |
| Preserve existing local-first/recording scope | Preserved in source | Replay remains local, event/sample-based; it does not add screen/cursor/menu/idle-frame, microphone or camera recording. No cloud/AI/timeline/Carbon: Flux integration is added. QR import remains selected-image-only. |
| Android | Version deliberately unchanged; runtime unverified | `src/version.ts` selects CARBON 1.0.0 when the Android edition is active; `scripts/android.mjs` defaults to versionName 1.0.0 / versionCode 1. Shared UI changes may affect Android-compatible Draw flows, but Android UI, storage, APK and device behavior were not validated in this update. |
| Windows packaging | Version source updated; package/runtime unverified | `src/version.ts`, `package.json`, the root lockfile version and top release entry use 7.7.2 for Windows/desktop. `scripts/windows.mjs` derives the Windows package version from `WINDOWS_VERSION`. No Windows installer, Electron runtime or physical Windows hardware test was performed. |

## Version and dependency policy

- Carbon: Prime stays on the **7.x+ls** line. The Windows/desktop candidate is **7.7.2+ls**; it is not published and is not being called complete.
- Android remains **CARBON 1.0.0**. The Android `versionName`/`versionCode` are not changed by the Windows version bump.
- The `.carbon` archive format remains v1; no dependency upgrade was intended. The root package/lockfile version metadata changes to 7.7.2; dependency versions remain as pinned.
- No release tag or GitHub release should be inferred from this candidate metadata. Platform acceptance and release approval are separate.
- `npm audit --omit=dev` reports **3 moderate** advisories for `uuid <11.1.1` (`GHSA-w5hq-g745-h8pq`) through the existing `xcode`/Capacitor CLI chain. The offered `npm audit fix --force` would replace `@capacitor/cli` with a breaking version, so no dependency change was applied. Recheck before publishing.

## Verification results

| Check | Result |
|---|---|
| `npm test` | **Pass — 365 assertions, 0 failures** after the latest code and version edits. Includes workspace classification, duplicate-toast behavior, safe Home save-wait behavior for Draw/Comic/3D, pressure simplification/ribbon width, imported brush-metadata bounds, surface geometry, touch-gesture math, project guards and coast-loop math. |
| `npm run typecheck` | **Pass — `tsc --noEmit`** after the latest code and Windows version metadata edits. |
| `npm run build` | **Pass — Vite 7.3.2, 2,058 modules; single-file `dist/index.html` 1,998.29 kB (668.37 kB gzip)** after the latest code and Windows version metadata edits. |
| `git diff --check` | **Pass** after the latest code and version edits. |
| Browser/3D WebGL visual interaction | **Not verified.** No real-browser screenshot, pointer/stylus session or in-app Help → Run Diagnostics acceptance has been performed. |
| Home reduced-motion/static fallback/visual alignment | **Code and math tests only.** Browser visual review is still required. |
| Windows installer / Electron runtime | **Not built or run.** |
| Android APK / physical device | **Not built or run.** |
| Save/open/reopen and safe Home cases across Draw, Comic and 3D | **Source routing reviewed; UI/provider cancel, failure and success flows remain unverified.** |
| Publication | **Not published.** 7.7.2 is an unpublished local candidate. |

## Remaining acceptance plan

1. Use a real browser preview to review Home image crop/shore alignment/wave motion/static and reduced-motion states, then inspect Create and the Draw/Comic/3D workspaces.
2. In the browser, test save/open/reopen, typed workspace switching, Comic multi-page save/close/page-delete, and Home with clean, unsaved, canceled and failed saves for Draw, Comic and 3D.
3. In an actual WebGL browser, draw textured 2D-brush ribbons on a plane and supported surfaces, use pressure input, orbit/pan/zoom without marks, move the target object, and confirm strokes stay attached. Test the asset and scene through save/reopen.
4. On Windows, package and launch the supported desktop artifact and test user-selected file workflows. On Android, build with the separate 1.0.0 identity and test the scoped-storage/document-provider path on hardware.
5. Only after applicable acceptance and release approval may this candidate be called complete or published. Do not merge or tag solely from these source checks.
