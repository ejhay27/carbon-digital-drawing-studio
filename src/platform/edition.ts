// Edition gating. The Windows (desktop) edition enables the advanced studio: Comic Studio, 3D Studio,
// Effects, Brush Market, advanced layers and the eyedropper loupe. The Android build (Capacitor) keeps its
// existing feature set: every new entry point checks EDITION.windows, and the Android project files,
// scripts and configuration were not modified.
import { Capacitor } from '@capacitor/core';

const native = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

export const EDITION = {
  windows: !native,
  name: native ? 'Android' : 'Windows',
  electron: typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent),
};
