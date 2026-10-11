# Carbon: Prime 7.6.0+ls — repository audit and source-candidate status

- **Audit/progress date:** 2026-10-11
- **Repository:** `ejhay27/carbon-digital-drawing-studio`
- **Session branch:** `arena/a19e311c-carbon-digital-drawing-studio`
- **Product line:** Carbon: Prime 7.x+ls (`+ls` = Local Storage)
- **Current source identity:** 7.6.0+ls (package/version metadata 7.6.0)
- **Release state:** unpublished local source candidate. This is not a release-complete or platform-support claim.
- **GitHub:** existing PR #2 is open from the session branch to `main`; this update is intended to update that branch only. No merge or release is included.

## Executive summary

The requested baseline audit found substantial existing drawing, project, replay, asset, QR, Brush Lab, eraser, Home, About and 3D work in the branch. This update prioritized Drawing Replay/local recovery, then My Illustrations and export clarity, while retaining the existing asset and 3D implementation. My Illustrations is now reachable from **File → My Illustrations** while editing as well as from Home/Welcome.

Current code-level verification passes **319 assertions**, TypeScript typecheck, Vite production build and `git diff --check`. There has been no manual browser interaction or acceptance of the Windows packaged runtime, Android APK/device, QR image decoding or actual MediaRecorder codecs. Do not treat the source checks as substitutes for those platform tests.

No cloud upload, screen recording, cursor/menu/idle capture, camera scanning/permission, AI drawing, generative fill, AI assistant, animation timeline or Carbon: Flux integration was added. The 7.6.0 identity is a candidate label only; do not publish or announce it as a completed release.

## Status definitions

- **Working in source/tests:** implementation exists and relevant automated checks pass; runtime acceptance can still be outstanding.
- **Partial:** only a documented subset exists, or required integration/acceptance is incomplete.
- **Absent:** no implementation was found for the requested capability.
- **Unverified:** the artifact/platform/runtime behavior was not exercised; this is not a pass.
- **Broken:** a reproducible failure was confirmed. No new reproducible broken item was established in the code-level checks below; that does not prove the absence of runtime defects.

## Feature audit and disposition

| Area | Status | Repository evidence and boundary |
|---|---|---|
| 2D drawing, brush engine, layers and undo | **Working in source/tests; browser unverified** | `src/engine/document.ts`, rendering/brush modules and Canvas UI implement raster and editable Crisp Ink work, commands, undo/redo, layers, masks, selection, filters and transforms. Existing Node tests exercise representative engine paths. No live browser drawing session or hardware stylus acceptance was run. |
| Drawing Replay capture | **Working in source/tests; runtime unverified** | `DocEngine` records committed commands, undo/redo markers, tool/brush/color markers and sampled drawing strokes. New drawings and opened projects without replay history auto-start when “Automatically record…” is on; projects with existing history are not restarted/duplicated. The setting defaults on but can be disabled for future projects. This is event/sample recording, not desktop or whole-screen recording; no idle frames, cursor-only/hand movement, menus, camera or microphone are captured. |
| Replay timing and lifecycle | **Working in source/tests; runtime unverified** | Full real pauses are retained by default. Pause shortening is opt-in, terminal pointer-up/cancel samples are retained, stroke sample clocks are monotonic, and interrupted strokes commit the captured segment. Per-document controls now start, pause, resume and stop capture without discarding prior events; separately confirmed history deletion does not delete artwork. The default recorder limit pauses capture at an estimated memory threshold. Older recordings that already lost time under an earlier cap cannot recover it. |
| Replay recovery and project persistence | **Working in source/tests; platform acceptance pending** | Changed document revisions schedule a debounced local IndexedDB session-recovery serialization, alongside periodic and app-lifecycle sweeps. Revision tracking requests another pass if the document changes during encoding. `.carbon` save/copy/open retains editable artwork and replay events together. Recovery is local; it is not a hidden cloud upload. |
| Replay export formats | **Partial** | `.carbon` is the native editable project containing the replay; image export is a flattened PNG/JPEG/WebP and does not include editable layers or replay. Video renders the replay to a canvas and uses the MediaRecorder type the platform reports/returns, with a matching `.webm` or `.mp4` extension. No transcoding is implemented and codec output was not exercised here. A standalone replay-only archive/exporter/importer is **absent**. 3D Studio and Orbit Board edits are outside the 2D replay stream. |
| My Illustrations / recent projects | **Partial; current source route implemented** | `ProjectFinder` offers search, pinning and sort for browser-local recent project snapshots, plus Android CARBON-folder files. It appears on Windows Home and Android Welcome and is now available from File → My Illustrations while editing. Cards open a project or its Replay controls. Recent-list removal does not erase an external Windows file. The Windows view is not a directory scanner and has no Explorer reveal/open-folder workflow; other paths use Open. Browser recents are capped/size-limited by the existing recent-store policy. Android folder listing is scoped to storage the adapter can access. |
| Save/open and project format | **Working in source/tests; platform acceptance pending** | `.carbon` v1 serialization and validation live in `src/engine/fileFormat.ts`; project save verifies the archive before writing. Browser/Electron paths use file pickers when available and a save-dialog/download fallback. Android uses its Capacitor adapter and guarded staged replacement/rollback helper. Unit tests cover archive guards and mocked Android write rollback, not actual provider/runtime behavior. |
| Windows storage and File Explorer | **Partial / unverified** | Packaged NSIS configuration is per-user and uses the user-selected install path. Project saving is user-selected through File System Access or the Electron/browser download path; browser recents use local app storage. There is no fixed Carbon illustration folder index or File Explorer reveal workflow. The folder icon in About opens the exact About / Project Information dialog—not Explorer. The Windows installer/runtime was not built or launched in this environment. |
| Android storage/document provider | **Partial / unverified** | `src/platform/native.ts` writes to `Documents/CARBON` when available, otherwise app-specific storage; it lists only that CARBON folder and has an explicit system picker for other locations. Export/share uses the native adapter. Safe-replacement logic has mocked tests, but APK build, storage permissions, provider behavior, sharing and physical-device operation were not verified. |
| Brush Marketplace | **Partial — honest offline catalog** | The desktop panel uses bundled compatible brush packs and real local install/import/export paths. There is no configured remote catalog or asset host: remote downloads, ratings, popularity and online availability are not claimed. Source size/storage limits and reporting are present; the catalog is not a hosted marketplace. |
| Brush/asset storage | **Partial** | `src/engine/assetStore.ts` stores brush-pack bytes and metadata locally and enforces configured byte/size guards; imported/untrusted pack data is validated. Custom brushes and eraser presets still use app-local preferences, so a complete unified registry/library for every asset type is not implemented. No project artwork or dependent artwork is silently replaced by asset deletion. |
| QR brush sharing/import | **Partial; image decode unverified** | QR payloads are bounded/versioned and use validated brush data. Import is from a user-selected image file only; no camera scanner or camera permission is present. Code-level validation tests pass, but real QR PNG encode/decode and the browser/native picker UI were not exercised end to end. |
| Brush Lab and Custom Eraser Studio | **Working in source; interaction unverified** | Draft brush preview uses the actual Carbon brush model/renderer, and saved custom brush and eraser presets are separate. Eraser-tip selection is gated to the Eraser tool. Destructive preset removal confirms and cleans up references without changing artwork. No manual UI/visual acceptance was run. |
| 3D Studio and surface strokes | **Working in source/tests; interactive WebGL unverified** | Three.js source includes camera/input separation, real ray-hit strokes on supported 3D mesh surfaces, local-space editable stroke geometry and symmetry projection to matching surfaces. Tests cover ray hits, transformed normals/local coordinates and omission of unmatched copies. This is more than a scene/grid implementation, but interactive Windows/WebGL/touch acceptance was not run. |
| Home coast scene | **Partial; visual/performance unverified** | The local bundled coast image and Canvas 2D wave/reflection motion have disable/reduced-motion paths. Asset and source implementation exist; browser framing, visual accessibility and low-memory-device performance were not evaluated. |
| About / Project Information | **Working in source/tests; visual acceptance unverified** | Supplied copy is exact in the source/test. The folder icon opens the scrollable About / Project Information modal, not a filesystem folder. No screenshot or browser interaction acceptance was performed. |
| Command palette, Quick Start and diagnostics | **Working in source/tests; in-app diagnostics unverified** | Search/navigation and editable sample safety have source tests. The Help → Run Diagnostics canvas/WebGL suite was not run in an interactive browser. |
| AI, generative fill, animation timeline, Carbon: Flux | **Absent by explicit scope** | These were not added; Carbon: Flux remains separate. |

## 7.6.0+ls candidate changes in this update

- Preserved replay pause durations by default; shortened pauses now require an explicit preference.
- Kept the terminal input sample on pointer-up/cancel and tightened event-time monotonicity and stroke-interruption behavior.
- Made new/opened-without-history recording defaults explicit, and added non-destructive **Stop recording** in addition to start/pause/resume. Delete-history remains a separate confirmed action.
- Debounced local session recovery after committed changes and guarded against serializing a stale document revision as the final autosave.
- Improved conservative checkpoint/sample memory estimates and exposed `.carbon` save/copy outside active playback.
- Clarified that artwork image export is flattened and separated from native editable `.carbon`+replay and codec-dependent replay-video export.
- Added File → My Illustrations for access while editing; the dialog preserves the distinct browser-recents and Android-device-file sources.
- Marked 7.6.0 as an unpublished candidate in release metadata/UI rather than inventing a release date or presenting it as published.

## Version and dependency policy

- Windows/desktop/package identity is **7.6.0 / 7.6.0+ls** on the 7.x line. It is a source-candidate identity, not a completed/published release.
- Android remains separately identified as **CARBON 1.0.0**; no Android version code or app identity bump is implied.
- `.carbon` archive format remains v1. The 7.6.0 version alignment did not change dependency versions. Existing QR dependencies support the selected-image QR feature; no unrelated dependency upgrade was applied in this update.
- A prior `npm audit --omit=dev` found `GHSA-w5hq-g745-h8pq` affecting `uuid <11.1.1` in the existing `xcode`/Capacitor CLI chain. No potentially breaking Capacitor CLI upgrade was applied. Recheck before any publication.

## Verification results for this source tree

| Check | Result |
|---|---|
| `npm test` | **Pass — 319 assertions, 0 failures.** Includes replay clock/terminal samples/control lifecycle, asset validation, safe project replacement, About text, project-finder state and 3D surface geometry. |
| `npm run typecheck` | **Pass — `tsc --noEmit`.** |
| `npm run build` | **Pass — Vite 7.3.2; 2,056 modules; `dist/index.html` 2,023.64 kB (697.78 kB gzip).** |
| `git diff --check` | **Pass.** |
| Browser UI / visual / actual pointer acceptance | **Not run.** |
| Video encoder/codec and resulting media file | **Not run.** MediaRecorder support is platform-dependent. |
| QR image encode/decode and picker workflow | **Not run end to end.** |
| Windows installer/Electron runtime | **Not built or run.** Earlier normal `npm ci` stopped at Electron download certificate verification; JS checks were run with the already-installed dependencies. |
| Android APK / physical device | **Not built or run.** Android SDK/JDK/Gradle project are absent here; the build requires Node 22+, JDK 21 and Android SDK 36. |
| GitHub release / PR merge | **Not performed.** No publication or merge is authorized by these source checks. |

## Remaining acceptance plan (keep this order)

1. **Drawing Replay, My Illustrations and export:** manually draw with mouse/stylus/touch; verify idle and long-pause timing; test pause/resume/stop/start/delete; save/reopen `.carbon`; verify artwork and replay separately; exercise local recovery and automatic-recording preference; reach My Illustrations from File while editing; export PNG/JPEG/WebP and test actual supported video codecs/extensions.
2. **Marketplace and assets:** test bundled install/uninstall, import/export and real storage limits with malformed/oversized assets; confirm remote status remains unavailable without a real catalog/host and destructive actions preserve dependent artwork.
3. **QR and creation tools:** encode a brush share and import a selected image through the browser and Android picker; verify camera permissions remain absent; test Brush Lab save/use and eraser selection/deletion in the UI.
4. **3D, Home and About:** exercise surface strokes/symmetry, separate camera navigation, reduced motion, Home actions and exact About-copy/folder-button behavior in a real browser/runtime.
5. **Windows separately:** produce and launch the per-user installer/portable build, test file dialogs and backups, and document the lack of a full Windows folder scanner/Explorer workflow.
6. **Android separately:** generate the APK with the required toolchain; test Documents/fallback permissions, external document-provider open, save/copy/replace, exports/share sheet and back/resume behavior on hardware.
7. Only after applicable acceptance and approval should 7.6.0 be considered complete or published. Do not force-push, switch branches, merge the open PR, or publish a release without authorization.
