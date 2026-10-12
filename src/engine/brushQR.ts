import type { BrushParams } from './types';
import { ENGINE_VERSION } from './brushes';
import { exportPack, parsePack, type InstalledPack } from './brushPacks';

export const BRUSH_QR_FORMAT = 'carbon-brush-qr';
export const BRUSH_QR_VERSION = 1;
/** Conservative text budget for reliable screen-to-screen QR sharing with error correction. */
export const MAX_BRUSH_QR_BYTES = 1800;

export function makeBrushQrPayload(input: {
  id: string;
  name: string;
  category: string;
  brushes: BrushParams[];
  version?: number;
}, maxBytes = MAX_BRUSH_QR_BYTES): string {
  if (!input.brushes.length) throw new Error('A QR share must contain at least one brush.');
  if (input.brushes.some((brush) => !!brush.stamp)) throw new Error('This brush contains an embedded stamp image. Export a .carbonpack file instead of putting the image in a QR code.');
  const pack = JSON.parse(exportPack(input.name, input.brushes, input.id, input.category, input.version || 1)) as Record<string, unknown>;
  const payload = JSON.stringify({ format: BRUSH_QR_FORMAT, version: BRUSH_QR_VERSION, pack });
  const bytes = new TextEncoder().encode(payload).byteLength;
  if (bytes > maxBytes) throw new Error(`QR payload is ${bytes} bytes; this workflow supports up to ${maxBytes} bytes. Export a .carbonpack file for larger packs.`);
  return payload;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Decode only Carbon brush QR data. Text that happens to be a URL is never opened. */
export function parseBrushQrPayload(payload: string, existing: BrushParams[], maxBytes = MAX_BRUSH_QR_BYTES): {
  pack: InstalledPack;
  duplicates: number;
  warnings: string[];
} {
  const byteLength = new TextEncoder().encode(payload).byteLength;
  if (byteLength > maxBytes) throw new Error(`QR payload exceeds the ${maxBytes}-byte safety limit.`);
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { throw new Error('This QR does not contain a Carbon brush payload.'); }
  if (!plainObject(parsed) || parsed.format !== BRUSH_QR_FORMAT || parsed.version !== BRUSH_QR_VERSION || !plainObject(parsed.pack)) {
    throw new Error('Unsupported QR data. Only Carbon brush QR format v1 is accepted; URLs are not opened.');
  }
  const pack = parsed.pack;
  if (pack.engine !== ENGINE_VERSION) throw new Error(`QR pack requires brush engine v${String(pack.engine)}; this app supports v${ENGINE_VERSION}.`);
  if (pack.format !== 'carbon-brushpack' || !Array.isArray(pack.brushes)) throw new Error('QR does not contain a valid Carbon brush pack.');
  return parsePack(JSON.stringify(pack), existing, maxBytes);
}
