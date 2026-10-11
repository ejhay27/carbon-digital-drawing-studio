// CARBON: PRIME version: single source of truth for the Windows/desktop edition.
//
// Release identity:  MAJOR.MINOR.PATCH+ls   (e.g. 7.1.0+ls)
//   - WINDOWS_VERSION is bare semantic versioning; it drives ordering, packaging and the
//     diagnostics rules.
//   - LS_SUFFIX ("+ls", Local Storage) is appended wherever a display string or metadata
//     format supports it. Never rename the release to Carbon 8 or 8.x.
//   Semantic meaning:
//   MAJOR: headline releases (Carbon: Prime is the 7.x product line), MINOR: compatible features,
//   PATCH: maintenance fixes.
//
// When bumping WINDOWS_VERSION, add a matching entry at the TOP of src/release/releases.ts
// (bare version in `version`, set `suffix: '+ls'`). Help → Run Diagnostics fails if the two
// disagree. scripts/windows.mjs reads this file for packaging.
//
// The Android edition is versioned separately (scripts/android.mjs, default 1.0.0). It is
// intentionally NOT driven from here, and its displayed labels are kept exactly as they were.
import { EDITION } from './platform/edition';

export const WINDOWS_VERSION = '7.5.1';

/** Local-Storage release suffix ("ls" = Local Storage). Shown wherever the format allows. */
export const LS_SUFFIX = '+ls';

/** Full display version of the running edition, e.g. "7.1.1+ls". Android keeps its own line. */
export const APP_VERSION = EDITION.windows ? WINDOWS_VERSION + LS_SUFFIX : '1.0.0';

/** Human-readable label used in About and in saved-file metadata. Android keeps its legacy label unchanged. */
export const APP_LABEL = EDITION.windows ? `CARBON PRIME ${WINDOWS_VERSION}${LS_SUFFIX}` : 'CARBON 1.0';

/** Product identity (do not rename to Carbon 8). */
export const PRODUCT_NAME = 'Carbon: Prime';
export const PRODUCT_TAGLINE = 'Where all starts begin.';

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function compareSemver(a: string, b: string) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
