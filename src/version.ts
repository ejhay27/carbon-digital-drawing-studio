// CARBON version: single source of truth for the Windows edition.
//
// Semantic versioning MAJOR.MINOR.PATCH:
//   MAJOR: incompatible or headline releases (2.0.0 = 3D Studio)
//   MINOR: compatible feature additions (2.1.0 = Color Dock, Latest Patches)
//   PATCH: maintenance / bug-fix releases (e.g. 2.1.1)
//
// When bumping WINDOWS_VERSION, add a matching entry at the TOP of src/release/releases.ts.
// Help → Run Diagnostics fails if the two disagree. scripts/windows.mjs reads this file for packaging.
//
// The Android edition is versioned separately (scripts/android.mjs, default 1.0.0). It is intentionally
// NOT driven from here, and its displayed labels are kept exactly as they were.
import { EDITION } from './platform/edition';

export const WINDOWS_VERSION = '2.2.0';

/** Version of the running edition. Android keeps its own 1.0.0 line. */
export const APP_VERSION = EDITION.windows ? WINDOWS_VERSION : '1.0.0';

/** Human-readable label used in About and in saved-file metadata. Android keeps its legacy label unchanged. */
export const APP_LABEL = EDITION.windows ? `CARBON ${WINDOWS_VERSION}` : 'CARBON 1.0';

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function compareSemver(a: string, b: string) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
