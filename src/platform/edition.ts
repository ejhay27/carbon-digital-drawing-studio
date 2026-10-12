// Edition gating. The Windows (desktop) edition enables advanced studios such as Comics, 3D, Effects,
// Brush Market, advanced layers and the screen eyedropper. Shared local-first entry points—including
// Home/Welcome project finding and Quick Start—remain available on both editions. Android keeps its
// separate Capacitor project files, scripts, configuration, app identity and version line.
import { Capacitor } from '@capacitor/core';

const native = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

export const EDITION = {
  windows: !native,
  name: native ? 'Android' : 'Windows',
  electron: typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent),
};
