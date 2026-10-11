# Carbon: Prime — repository baseline and implementation progress

**Baseline audit date:** 2026-10-11 · **Progress updated:** 2026-10-11

**Repository:** [`ejhay27/carbon-digital-drawing-studio`](https://github.com/ejhay27/carbon-digital-drawing-studio)

**Session branch:** `arena/a19e311c-carbon-digital-drawing-studio`

**Existing PR:** #2 is open against `main`; the changes documented below have not been committed or pushed to GitHub. No rebase, merge, force-push, or default-branch edit was performed.

**Current working-tree build identity:** `7.5.1+ls` (package version `7.5.1`). The user clarified the requested bare version as `7.5.1`; the release line stays Carbon: Prime `7.x+ls`. This is a local, unpublished source candidate, not a published GitHub release.

## Progress after the 7.1.1 baseline

- **Marketplace/shared asset foundation:** bundled packs remain usable offline; validated brush-pack bytes/metadata use a local IndexedDB asset store with configurable size limits, origin storage estimates and input-versus-installed size reporting. No remote catalog URL is configured; online packs are unavailable.
- **QR brush sharing:** versioned `carbon-brush-qr` payloads are capped at 1,800 UTF-8 bytes, reject arbitrary URLs and embedded stamp data, and flow through validated pack storage. The UI includes QR PNG/text shares, image-file decoding and an explicit camera flow; end-to-end camera/browser/platform acceptance has not been done.
- **Brush Lab/custom erasers:** Brush Lab edits an isolated draft using the actual brush renderer's preview and saves custom presets in local app state. Custom Eraser Studio stores eraser tips separately; selection is guarded by Eraser tool mode. Deletion confirms and cleans up app references. These flows are code-level implemented but not manually browser-tested.
- **Build identity:** `package.json`, `package-lock.json`, `src/version.ts`, release notes and current docs are being kept on `7.5.1` / `7.5.1+ls`; Android retains its separate `CARBON 1.0.0` identity.
- **Remaining requested roadmap:** a fully unified asset manager, illustration-file browser/storage workflows, later 3D/Home/about performance acceptance, and Windows/Android platform packaging/testing are not claimed complete.

## GitHub version/release baseline

- Published release list: **`v1.0.2`** is the only listed release. Remote tags are `v1.0.0`, `v1.0.2`, `v1.0.3`, and `v1.0.4`; a tag alone does not establish a published artifact.
- Current `main` is inconsistent: README title is `7.1.0+ls`, its summary still calls the build `7.0.0+ls`, and `package.json`, `package-lock.json`, and `src/version.ts` remain `7.0.0`.
- At the audited baseline commit, the session branch had the 7.1.1+ls source/README candidate and matching package, lockfile, source, and release-note metadata. Subsequent 7.5.1+ls work remains only in the local session working tree; PR #2 is not merged.
- The only checked-in GitHub Actions workflow is `.github/workflows/windows.yml`; no Android workflow is present in the current main tree.

## Languages, frameworks and architecture

- **TypeScript/TSX:** React application, state, drawing/document engine, platform adapters and workspace UI.
- **JavaScript:** Electron main process and Node build/test scripts.
- **HTML/CSS, JSON and YAML:** Vite entry/styling, configuration/project metadata and Actions workflow.
- **UI/build:** React 19, Vite 7 with single-file output, Tailwind CSS 4, Zustand.
- **Rendering:** Canvas 2D raster engine and custom deterministic brush renderer; Three.js for the desktop 3D scene.
- **Desktop:** `EDITION.windows` enables the advanced desktop workspaces. Electron wraps the web build with context isolation, sandboxing and Node integration disabled. The web-portable build is separate from an Electron installer.
- **Android:** shared React/engine code in a Capacitor 8 shell; `EDITION` selects the native path and Android retains its separate `CARBON 1.0.0` identity. `scripts/android.mjs` generates the Gradle project; the generated project is not checked in.

## Initial 7.1.1 feature inventory (pre-implementation snapshot)

This table records the original audit before the 7.5.1+ls work above; rows that said brush Marketplace, asset storage, QR or Brush Lab were absent/partial describe that earlier snapshot, not current source. Status below still describes repository evidence, not unperformed browser, packaged-app or device acceptance.

| Area | Status | Evidence and boundary |
|---|---|---|
| Canvas, documents and drawing engine | **Working in source/tests; runtime unverified** | `DocEngine`, Canvas 2D rendering, deterministic `StrokeRenderer`, brush parameter model, transforms, fills, masks/selections, editable Crisp Ink, and rendering/compositing are implemented. Existing unit suite exercises core rendering and document operations; no current-browser drawing session was run for this audit. |
| Brushes and erasers | **Partial** | Built-in presets and 19 bundled/generated Windows pack definitions use the real `BrushParams` renderer. The eraser uses `destination-out` (or mask operations), not background-color painting, and shares brush-tip settings. Brush Library has search/favorites/collections, custom duplication/editing, stamp-image import and JSON export/import. There is no separate Eraser Studio or isolated eraser asset library. |
| Brush Marketplace | **Partial — local catalog only** | Windows `BrushMarket` in `src/win/WinPanels.tsx` browses the code-bundled catalog, previews through `brushPreview`, filters by category/search, installs/uninstalls and imports/exports validated `.carbonpack` JSON. `src/engine/brushPacks.ts` generates pack brush definitions. It is not an online marketplace: no remote endpoint, actual downloads, progress/cancel/retry, creator/ratings metadata, storage-size reporting or separate installed-asset store exists. |
| Asset storage | **Partial** | Browser projects/session/recent/backup use IndexedDB; preferences, custom brushes, and Windows installed-pack state use localStorage. Imported packs can embed all brush definitions in the persisted Windows state. There is no unified asset registry/size manager, configured download/install quota, or transactional brush-pack storage. |
| QR brush import | **Absent** | No QR/barcode decoder, camera scanner, QR image workflow, or supported QR brush-reference schema was found. |
| Brush Lab/custom brush creation | **Partial** | Existing `BrushStudio` changes real renderer parameters and shows a generated stroke preview; “Save as new” duplicates a brush, and custom stamp images can be imported. It is a dock panel, not a dedicated Brush Lab; no named descriptions/folders/variant workflow or independently managed asset files/sizes exist. |
| Unified asset manager | **Absent** | Brush Market and Brush Library are separate Windows UI surfaces; no common registry for brush/eraser/palette/pattern assets or missing-resource/compatibility management exists. |
| Project format and save/import/export | **Working in source/tests; platform unverified** | `.carbon` v1 ZIP archives use `fflate`, manifest/layer data and bundled assets; `.carboncomic` supports comics. Browser save uses the File System Access API when available and download fallback otherwise. Android writes to `Documents/CARBON` when possible, with app-specific fallback and tested safe replacement logic. No whole-project QR import is present. |
| Carbon local illustration folder / My Illustrations | **Partial** | Android exposes `Documents/CARBON` files through its project finder. Browser Home shows IndexedDB recents, not a fixed Windows Carbon folder; no Windows File Explorer reveal/open-folder workflow or full external-project rescan screen was verified. |
| Layers, undo/history and recovery | **Working/partial** | Raster, ink, group, adjustment and comic layers; selection-aware commands; bounded undo/redo; autosave/session recovery; Drawing Replay; and Windows Creative Time Machine snapshots exist. Dedicated Undo Until, Layer Rescue and Art DNA UI were not found. |
| 3D drawing | **Partial; browser/platform acceptance unverified** | The desktop source contains a Three.js scene, white ground, perspective grid, persisted camera, orbit/pan/zoom controls, plane and mesh-surface drawing, and surface-projected symmetry. Node tests cover scene math/raycast/local-space persistence. Interactive WebGL and touch/stylus/mouse acceptance were not run. |
| Home coast scene | **Partial; visual/performance acceptance unverified** | The working branch bundles a local coast image and overlays Canvas 2D waves/reflections with disable/motion preferences and reduced-motion handling. It is not a video. No current browser visual or lower-memory-device performance test was run. |
| About / Project Information | **Working in source; UI acceptance unverified** | Credit and supplied copy are in `src/components/aboutCopy.ts`; the folder button opens a distinct modal. The shared `Modal` has a max-height scrollable body and close button. No screenshot/browser acceptance was run. |
| Drawing recording | **Partial** | Drawing Replay records document events and has a MediaRecorder-based video export path. Whole-application and whole-screen recording modes are not implemented. |
| Themes and fullscreen | **Partial** | UI scaling/mode, workspace and input preferences exist. The interface is essentially the current dark styling rather than a verified broad theme system. Canvas-only mode exists; Android can hide system bars, but a Windows F11/taskbar true-fullscreen workflow was not found. |
| Command palette and diagnostics | **Working in source/tests; UI unverified** | Ctrl+K command palette and source-level acceptance tests are present. Help → Run Diagnostics was not run in a browser during this audit. |
| Roadmap concepts | **Mixed/absent** | Orbit Board, Continuum links, Palette Memory, Brush Fusion and Creative Time Machine exist. What-If/Worldboard, Asset Forge, Studio Pipeline and a dedicated procedural-art/compositor pipeline were not found under those names; existing adjacent features are not treated as equivalent. Comic PNG/PDF export is present, but a full print/publishing workflow is not established. |

## Historical baseline verification before new implementation

### Session branch baseline (`8585ee9`, Carbon: Prime 7.1.1+ls)

| Check | Result |
|---|---|
| `npm test` | **Pass — 258 assertions, 0 failures.** |
| `npm run typecheck` | **Pass — `tsc --noEmit`.** |
| `npm run build` | **Pass — Vite single-file build, 1,802,541 bytes (gzip 620.89 kB).** |
| Lint | **Not configured**; `package.json` has no lint script or linter dependency. |
| Electron installer / Windows executable | **Not built or runtime-tested.** |
| Android APK / physical device | **Not built or device-tested.** |

## 7.5.1+ls worktree verification

| Check | Result |
|---|---|
| `npm test` | **Pass — 296 assertions, 0 failures**, including custom eraser lookup, selection, edit and local-preference persistence. |
| `npm run typecheck` | **Pass — `tsc --noEmit`.** |
| `npm run build` | **Pass — Vite 7.3.2 single-file output, 2,010.08 kB (gzip 693.74 kB).** |
| `git diff --check` | **Pass.** |
| Lint | **Not configured**; no lint script exists. |
| Browser UI / QR camera | **Not manually tested end to end.** |
| Windows package/runtime | **Not built or runtime-tested.** |
| Android APK/device | **Not built or device-tested.** |
| `npm audit --omit=dev` | Earlier check reported three moderate `uuid`/`xcode`/Capacitor CLI findings; no breaking dependency upgrade was applied. Recheck before publication. |

These are working-tree code/build checks, not a claim of publishing, installer readiness, device acceptance or completion of the full roadmap.

### GitHub `main` snapshot (`c51fef6`, package version 7.0.0)

Audited from a temporary source archive without switching the session branch. `npm test` passed **184 assertions**, typecheck passed, and Vite built successfully (1,560.82 kB; gzip 455.00 kB). Lint is also not configured. Native installers/APK and device workflows were not built or tested.

## Marketplace implementation decision and limits

The baseline decision was to extend the actual local catalog and brush engine rather than create a fake online shop. Bundled packs remain usable offline. No legitimate remote asset host or catalog URL is configured, so remote browsing/downloads remain unavailable until an HTTPS catalog and matching hosted, versioned, integrity-checked `.carbonpack` assets are configured. Pack bytes/metadata have since moved to the shared local IndexedDB asset store; QR import uses the same validated path.

The worktree does **not** claim full specification completion or Windows/Android acceptance. Unified management of pack assets plus custom brush/eraser state, illustration storage/browser workflows, Home/3D acceptance and platform-specific packaging/testing remain outstanding.
