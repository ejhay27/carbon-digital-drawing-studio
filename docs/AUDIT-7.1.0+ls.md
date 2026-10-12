# Carbon: Prime 7.1.0+ls — feature implementation and verification

> **Historical feature audit:** this report captures the 7.1.0+ls feature candidate before the 7.1.1+ls documentation/version-metadata patch. Its implementation, build and test results refer to that audited state; see the current [README](../README.md) and [release overview](PRIME-7.md) for current source-version context.

**Audit date:** 2026-10-11<br>
**Checkout:** `arena/a19e311c-carbon-digital-drawing-studio`<br>
**Product:** Carbon: Prime · **Tagline:** Where all starts begin. · **Candidate:** `7.1.0+ls`<br>
**Android identity:** unchanged `CARBON 1.0.0` · **Publication:** not published; no release was created.

## Summary

The four local-first features proposed in the initial 7.1.0+ls baseline audit are implemented in the completed source candidate. Existing project code, local storage, `.carbon` v1 compatibility, platform gates and Android version identity were preserved. No account, cloud service, telemetry, AI drawing, generative fill, remote asset, mandatory backend or animation timeline was added.

The 7.1.0+ls version is a **local source candidate**, not evidence of an accepted Windows or Android release. TypeScript, Node regression tests and the single-file web/portable HTML build pass. Browser visuals and UI interaction, in-app diagnostics, Electron packaging, Android packaging/device behavior, and physical-platform acceptance remain unverified.

## Implemented features

### 1. Home project finder

- `src/components/ProjectFinder.tsx` is shared by the Windows/desktop `Home` and Android `Welcome` screens.
- Search filters both project groups by all query words against names and useful local metadata. Sorting supports recent activity, name, and size; pinned items appear first.
- Browser/IndexedDB recent projects and Android CARBON-folder device files have separate section labels, handlers and pin-key namespaces (`recent:` vs `device:`). Removing an item from browser recents removes only its local recent-index entry; deleting an Android device file remains a separate, confirmation-gated action. Removing either entry also clears its pin. The existing recent database remains capped at 12 entries; search, pinning and sorting do not move or rewrite project files.
- Pins and sort preference live in the existing persisted Carbon settings. `mergeSettings()` backfills new fields and the default Ctrl+K binding without discarding older user preferences.
- **Automated evidence:** `tests/all.ts` covers multi-term filtering, pinned-first order, all three sorts, pin/unpin, separate IDs and legacy preference migration. Search/card visual layout and actual IndexedDB/native filesystem interaction were not browser/device-driven.

### 2. Ctrl+K command palette

- `src/components/CommandPalette.tsx` is routed through the app's dialog host and opened by the configurable `app.commandPalette` shortcut, default **Ctrl+K**. Help and Home also expose discoverable entries.
- It searches local file actions, edit/view/layer actions, the existing 2D tool list, Windows workspaces, preferences/help, browser-local recent files, and (on Android) device project files. Browser and Android file entries are categorized separately.
- Arrow Up/Down skip disabled commands and wrap; Home/End select the first/last enabled result, Enter runs it, and Escape closes the palette. Shortcut labels are sourced from the user's current shortcut preferences.
- **Automated evidence:** `tests/all.ts` covers search across labels/categories/keywords, disabled-command filtering and keyboard index movement; TypeScript checks the actual React component and shortcut wiring. No visual/accessibility or end-to-end keyboard run was performed in a browser.

### 3. Offline guide and editable sample project

- `src/components/QuickStartNudge.tsx` offers a first-run reminder on Home and Android Welcome; it can be dismissed. `src/components/QuickStartDialog.tsx` provides the optional guide and remains reachable from Home/Help.
- `src/state/quickStartSample.ts` deterministically builds an offline 1200×900 coastal illustration with separate paint and editable Crisp Ink layers. On opening, Carbon serializes and deserializes it through the real `.carbon` v1 format **in memory**, then adds the result as a new unsaved document. It does not assign a file path, overwrite a file, replace an open tab, or add a synthetic entry to the recent-file list. User work is left untouched.
- The sample and guide use bundled code only; no network access is needed. On Android the sample canvas is below the existing 25 MP limit.
- **Automated evidence:** `tests/all.ts` verifies fresh independent sample documents, layer types/names, editable ink, unsaved/no-path state, and that an existing document is unchanged. Browser Canvas PNG encode/decode of the `.carbon` round-trip was not executed in this environment.

### 4. 3D surface-stroke symmetry

- `src/win/sceneRender.ts` now provides normal remapping, target-local normal conversion and `projectSurfaceSymmetryPaths()`. The source path is projected back to its source mesh after smoothing; mirror/radial transforms are then ray-projected onto visible target meshes using per-sample transformed normals.
- `src/win/Studio3D.tsx` previews the projected copies and stores accepted copies as independent editable curves in the target mesh's local coordinates, parented to the mesh so object transforms carry the strokes. Freehand and straight-line surface strokes use this path. Bézier anchors remain plane/depth-target-only and show an explicit message when surfaces are selected.
- A copy is created only if every point projects to one consistent visible mesh within a bounded tolerance. A missing/incomplete counterpart is skipped; Carbon does not fall back to a floating geometric copy. The initial source stroke is retained only if its samples can be projected to its original mesh.
- **Automated evidence:** Node tests raycast a mirror onto a second real Three.js sphere, check offset-to-surface distance and target-local round-trip, verify normal conversion, and assert an unmatched copy is omitted. The actual Studio3D pointer/preview interaction and WebGL rendering have not been browser-tested.

## Version, compatibility and platform boundaries

- Windows/desktop source identity: `src/version.ts` → `7.1.0` plus `+ls`. `package.json` and the root/package manifest entries in `package-lock.json` are `7.1.0`; Electron Builder metadata uses `CARBON PRIME` while keeping the existing application ID; `src/release/releases.ts` starts with a compatible feature (`MINOR`) entry and no invented publication date.
- Android's separate `CARBON 1.0.0` identity, versionName/versionCode defaults and application ID were not changed. The shared Android Welcome screen source uses the finder and quick-start guide; this is not Android device acceptance.
- `.carbon` archive/manifest format remains v1. Existing Windows/Android code paths and saved data schemas are unchanged; the project finder and sample use new local UI/preferences only.
- The initial 7.1.0+ls baseline audit is retained in `docs/AUDIT-7.1.0+ls-baseline.md`; its proposals are recorded as implemented in the completed 7.1.0+ls feature candidate.

## Verification results

| Check | Result |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | **Pass**, 603 packages installed. Lifecycle scripts were intentionally skipped; Electron's binary/package installation was not validated. |
| `npm run typecheck` | **Pass** (`tsc --noEmit`). |
| `npm test` | **Pass: 255 assertions, 0 failures.** Includes focused finder/pinning/sort, palette filtering/navigation, settings migration, sample isolation, ray-projected editable surface symmetry, and existing core/platform/archive regressions. |
| `node scripts/windows.mjs` | **Pass**; Vite single-file bundle generated and copied to `release/windows/CARBON-portable/CARBON.html`. |
| Vite bundle | `dist/index.html`: **1,801,665 bytes** (1,801.67 kB; gzip **620.58 kB**). |
| Portable HTML | `release/windows/CARBON-portable/CARBON.html`: **1,801,665 bytes**, byte-identical to `dist/index.html`; SHA-256 `5c1b6e275e14af0ff8c7621105989ffd0d564fb630287209a49eff077afde7a0`. |
| Version consistency | `src/version.ts`, `package.json`, `package-lock.json` root and first release note all report 7.1.0 / +ls as appropriate. |
| `git diff --check` | **Pass** after the implementation and documentation changes present at this check. |
| Browser visual/interaction acceptance | **Not performed.** No browser automation or human-driven UI session was run. |
| Help → Run Diagnostics | **Not run.** New 7.1 diagnostic cases are present in source only. |
| Electron installer / Windows EXE | **Not built or tested.** `npm ci --ignore-scripts` does not install the Electron binary. The portable HTML is not an installer or executable. |
| Android APK / physical device | **Not built or tested.** Android version metadata remains separate; no runtime/platform claim is made. |

## Remaining acceptance work

1. In a Chromium/WebGL-capable browser, verify Home and Android Welcome finder search, persistent pin/sort, separate project sources, Ctrl+K focus/navigation/actions, guide dismissal/sample opening, and no loss or replacement of existing tabs/files.
2. In Help → Run Diagnostics, execute the core and `[Win 7.1]` tests. Visually test surface symmetry with actual 3D mesh objects (including a symmetric match, no-match skip, preview, line/freehand creation, object movement, selection/editing, and save/reopen).
3. Build and launch a Windows installer/EXE after Electron installation succeeds; test offline behavior and upgrade/data preservation.
4. Generate the separate Android project/APK with the documented toolchain; verify Welcome, recent-vs-device distinction, file permissions/storage, lifecycle and touch/stylus on representative hardware.
5. Preserve the coast/Home art-direction visual acceptance caveat from the 7.0 audit: this feature increment does not establish browser framing, contrast, reduced-motion behavior or resource cleanup by screenshot/runtime test.

No release was published and no installer/APK is claimed.
