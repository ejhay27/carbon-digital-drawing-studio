# Carbon: Prime 7.9.9+ls — Windows source-candidate audit

> **Status:** local Windows/desktop source candidate only. This document does not claim a published release, accepted Windows installer, Android APK, or platform-certified build.

## Identity and scope

- Windows/package semantic version: **7.9.9** (`src/version.ts`, `package.json`, `package-lock.json`). Windows display identity appends `+ls` where supported.
- The Android app keeps its independent `CARBON 1.0.0` identity and versioning path. This candidate does not change Android version/build configuration.
- Release metadata starts with 7.9.9 marked `candidate`. No public release is claimed.

## Current increment

- Theme Studio has 40 categorized built-in themes and 25 UI-only semantic tokens. The existing Preferences integration supports category/search, custom create/edit/duplicate, confirmed delete, reset, local persistence, and bounded versioned inert JSON import/export.
- Theme JSON v2 validates exact fields, plain text, HEX colors, contrast and size. Existing v1 custom theme preferences and exported bundles migrate into the expanded token set.
- Shared CSS chrome plus 2D/3D selection/helper overlays consume UI tokens. Artwork pixels, document colors, brush colors and project files do not. The Home ocean image and canvas surf loop remain separate from theme tokens.
- The 1.0.0 black mark in About is explicitly a local vector reconstruction, not an archival source file. The `7.0.0cp` Prime mark is an About display label only; release metadata records Carbon: Prime as 7.0.0. No 3.0.0, 4.0.0 or 6.0.0 release/logo history is asserted without source evidence.
- The bundled release archive already contains the published 7.0.0 Carbon: Prime entry. No duplicate patch entry or unsupported “Spice Candidate” history was added.

## Verification performed

- `npm test` — 568 assertions passed, 0 failed.
- `npm run typecheck` — passed.
- `npm run build` — passed with the single-file Vite output.
- SVG logo assets parse as XML.

These checks do not establish visual acceptance in Windows Electron, native downloads, installer/restart behavior, input-device behavior or Help → Run Diagnostics. Those still require Windows/manual testing.

## Explicitly deferred

- Home contains a packaged local still image and a repeating Canvas 2D surf effect. No beach video, `<video>` element or natural `ended` trigger is present. The requested end-triggered message sequence was not implemented as a canvas-loop substitute; its exact text/timings and the video asset must be supplied and verified first.
- The repository's available release data and assets do not substantiate historical logo designs for 3.0.0, 4.0.0 or 6.0.0. Those marks remain withheld pending archival artwork or documentation.
