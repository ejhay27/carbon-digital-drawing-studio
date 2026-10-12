# Carbon: Prime 7.8.7+ls — implementation audit and source-candidate status

**Status:** unpublished Windows/desktop source candidate. The build label is `7.8.7+ls` and the package version is `7.8.7`. Android remains separately versioned as CARBON 1.0.0.

## Scope implemented

- **3D drawing workflow:** Freehand strokes are previewed as brush-based geometry while the pointer is down. Input uses pointer capture, coalesced samples, normalized pressure and cancellation handling. Drawing-plane points are computed from the camera ray; strokes on actual meshes retain target-local coordinates so they are designed to follow their surface as the camera or object moves. Flat 2D brush tips are supported. A parallel ray has no unique plane hit and is rejected.
- **Navigation and workspace:** Orbit, pan and zoom are handled separately from drawing gestures. The drawing-focused viewport omits the persistent grid, XYZ gizmo and unrelated modeling controls; secondary scene and advanced curve settings remain available. The White Ground visual is a four-vertex patch recentered under the camera target, not a giant mesh. The mathematical drawing plane is not limited by the patch's visual boundary.
- **Infinite Painter:** The Create dialog offers an Infinite Painter document/workspace. Its document has an independent identity and remains an editable `.carbon` project. Existing Draw documents and workspace remain separate and unchanged in format.
- **Editable Project Library:** Windows projects use a dedicated local IndexedDB database, separate from the shared persistence database. Save/autosave, opening/continuing, rename, independent duplicate, confirmed deletion and external export are wired to actual project data. Native project saves remain distinct from image/video exports. Home navigation waits for the internal Windows save result; cancellation or a reported failure keeps the editor open.
- **Exports:** PNG and JPEG render the active project; SVG is a valid SVG file embedding the lossless PNG rendering (it is not vectorized artwork). MP4 is only offered when Drawing Replay data exists and the platform reports an MP4-capable MediaRecorder. It never substitutes a still image or mislabeled WebM. 3D scene edits have no Drawing Replay timeline and are rejected for replay-video export.

## Automated verification

- `npm test`: **388 assertions passed, 0 failed**.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite emitted the single-file web build at `dist/index.html`.
- The tests cover bounded ground geometry and recentering, plane intersection including parallel rays, pressure normalization, flat dabs, closed-stroke sample alignment, Infinite Painter document routing, and existing project/engine regressions.

## Not manually verified

No browser visual/interaction session, real stylus/pressure hardware, Windows Electron launch/installer, or Android runtime/device test was performed. Unit-level ray/geometry assertions do not prove continuous rendering or surface attachment in an actual WebGL session. Help → Run Diagnostics was not executed in a browser. `npm ci --ignore-scripts` was required in this environment, so Electron's install script/binary was not installed or verified. The web build is not a Windows installer.

MP4 export depends on actual MP4 encoder support and local 2D Drawing Replay events. SVG preserves appearance using embedded raster data. These limitations are surfaced in the UI/release notes rather than represented as vector conversion or 3D timeline support.

## Compatibility and boundaries

- `.carbon` stays at format v1; no project archive migration is intended.
- Android `versionName`/`versionCode`, Android project files and Android storage workflow were not changed for the Windows version bump. Runtime compatibility on Android has not been retested.
- The local-only boundaries remain: no upload/cloud feature, screen/cursor/menu/idle capture, camera/microphone capture, AI drawing, generative fill, animation timeline, or Carbon: Flux integration.
