// Quick Color Pick outside the canvas (Prime 7).
// Uses the Chromium EyeDropper API where the platform exposes it (Windows: samples the whole
// screen, not just the CARBON window). Where it is unavailable we say so honestly and point to
// the in-app alternatives - never pretending screen sampling works.
import { toast } from '../state/store';

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

export function screenPickAvailable(): boolean {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
}

/** Open the system screen picker. Resolves a hex color, or null when cancelled/unavailable. */
export async function pickScreenColor(): Promise<string | null> {
  const api = (typeof window !== 'undefined' ? (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper : undefined);
  if (!api) {
    toast('System screen picking is not available here. Use the canvas eyedropper, or Import Artwork and sample from the imported image.', 'error');
    return null;
  }
  try {
    const r = await new api().open();
    return r.sRGBHex;
  } catch {
    return null; // user cancelled (Esc)
  }
}
