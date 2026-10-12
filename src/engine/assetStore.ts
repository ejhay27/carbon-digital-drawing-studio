import type { BrushParams } from './types';
import { CATALOG, MAX_BRUSH_PACK_BYTES, exportPack, parsePack, type InstalledPack } from './brushPacks';
import { ENGINE_VERSION } from './brushes';
import { idbAll, idbDel, idbGet, idbPut } from './persist';

export const DEFAULT_ASSET_DOWNLOAD_LIMIT_MB = 100;
export const DEFAULT_ASSET_INSTALLED_LIMIT_MB = 500;
export const REMOTE_CATALOG_FORMAT = 'carbon-brush-catalog';
export const REMOTE_CATALOG_VERSION = 1;
export const BRUSH_PACK_FORMAT = 'carbon-brushpack';
export const MAX_REMOTE_CATALOG_BYTES = 2 * 1024 * 1024;
export const MAX_REMOTE_CATALOG_ENTRIES = 2000;

export type AssetSource = 'catalog' | 'import' | 'remote';
export interface StoredBrushPack {
  id: string;
  packId: string;
  kind: 'brush-pack';
  format: typeof BRUSH_PACK_FORMAT;
  name: string;
  category: string;
  version: number;
  engineVersion: number;
  source: AssetSource;
  installedAt: number;
  sizeBytes: number;
  downloadBytes: number | null;
  sha256: string | null;
  bytes: Uint8Array;
}

export interface BrushPackAssetInput {
  id: string;
  name: string;
  category: string;
  version: number;
  source: AssetSource;
  brushes: BrushParams[];
  downloadBytes?: number | null;
}

export interface RemoteBrushPack {
  id: string;
  name: string;
  category: string;
  version: number;
  description: string;
  creator: string | null;
  license: string | null;
  featured: boolean;
  free: true;
  format: typeof BRUSH_PACK_FORMAT;
  engineVersion: number;
  url: string;
  sizeBytes: number;
  sha256: string;
}

export interface AssetDownloadProgress {
  loadedBytes: number;
  totalBytes: number;
}

export type AssetFetch = typeof fetch;

function notifyAssetChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('carbon-assets-changed'));
}

export function megabytesToBytes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 1024 * 1024));
}

export function formatAssetSize(value: number | null | undefined): string {
  const bytes = Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit++; }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[unit]}`;
}

/** UTF-8 bytes of the exact JSON asset representation written to the shared asset store. */
type PackSerializationInput = Pick<BrushPackAssetInput, 'id' | 'name' | 'brushes'> & Partial<Pick<BrushPackAssetInput, 'category' | 'version'>>;

export function serializeBrushPack(input: PackSerializationInput): Uint8Array {
  return new TextEncoder().encode(exportPack(input.name, input.brushes, input.id, input.category || 'Imported', input.version || 1));
}

/** UTF-8 bytes of one brush's exported JSON definition (not a compressed image or pack estimate). */
export function measureBrushDefinitionBytes(brush: BrushParams): number {
  const { builtin: _builtin, ...definition } = brush;
  return new TextEncoder().encode(JSON.stringify(definition)).byteLength;
}

export function measureBrushPackBytes(input: PackSerializationInput): number {
  return serializeBrushPack(input).byteLength;
}

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest('SHA-256', bytes.slice().buffer);
    return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

export async function storeBrushPackAsset(input: BrushPackAssetInput, maxInstalledBytes = Infinity): Promise<StoredBrushPack> {
  if (!/^[a-z0-9:._-]{1,100}$/i.test(input.id)) throw new Error('Invalid asset identifier.');
  if (!Array.isArray(input.brushes) || input.brushes.length === 0) throw new Error('A brush pack must contain at least one validated brush.');
  const bytes = serializeBrushPack(input);
  if (bytes.byteLength > MAX_BRUSH_PACK_BYTES) throw new Error(`The installed brush pack exceeds the ${formatAssetSize(MAX_BRUSH_PACK_BYTES)} hard safety limit.`);
  if (bytes.byteLength > maxInstalledBytes) throw new Error(`Installing this pack would exceed the ${formatAssetSize(maxInstalledBytes)} installed-asset limit.`);
  const record: StoredBrushPack = {
    id: input.id,
    packId: input.id,
    kind: 'brush-pack',
    format: BRUSH_PACK_FORMAT,
    name: input.name,
    category: input.category,
    version: input.version,
    engineVersion: ENGINE_VERSION,
    source: input.source,
    installedAt: Date.now(),
    sizeBytes: bytes.byteLength,
    downloadBytes: Number.isFinite(input.downloadBytes) ? Math.max(0, Math.floor(input.downloadBytes as number)) : null,
    sha256: await sha256Hex(bytes),
    bytes,
  };
  await idbPut('assets', record.id, record);
  notifyAssetChange();
  return record;
}

export async function getStoredBrushPack(id: string): Promise<StoredBrushPack | undefined> {
  return idbGet<StoredBrushPack | undefined>('assets', id);
}

export async function listStoredBrushPacks(): Promise<StoredBrushPack[]> {
  const rows = await idbAll<StoredBrushPack>('assets');
  return rows.map(({ value }) => value).filter((asset) => asset?.kind === 'brush-pack' && asset.format === BRUSH_PACK_FORMAT && asset.bytes instanceof Uint8Array)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function removeStoredBrushPack(id: string): Promise<void> {
  await idbDel('assets', id);
  notifyAssetChange();
}

export async function restoreStoredBrushPack(asset: StoredBrushPack): Promise<InstalledPack> {
  if (!asset || asset.kind !== 'brush-pack' || asset.format !== BRUSH_PACK_FORMAT || !(asset.bytes instanceof Uint8Array) || asset.id !== asset.packId) {
    throw new Error('Stored asset is missing or has an unsupported format.');
  }
  if (!Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes !== asset.bytes.byteLength || asset.sizeBytes > MAX_BRUSH_PACK_BYTES) {
    throw new Error('Stored asset size metadata is invalid.');
  }
  const storedDigest = await sha256Hex(asset.bytes);
  if (asset.sha256 && storedDigest && storedDigest !== asset.sha256) throw new Error('Stored asset failed its SHA-256 integrity check.');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(asset.bytes);
  const { pack } = parsePack(text, [], Math.max(asset.sizeBytes, 1));
  if (asset.source === 'catalog') {
    const bundled = CATALOG.find((item) => item.id === asset.packId && item.version === asset.version);
    // Bundled packs have stable generated brush IDs; retain those IDs across app restarts.
    if (bundled) return { ...pack, id: asset.packId, source: 'catalog', name: bundled.name, category: bundled.category, brushes: bundled.brushes() };
  }
  return { ...pack, id: asset.packId, source: asset.source, category: asset.category };
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
}

function httpsSameOriginUrl(value: unknown, catalogUrl: URL): URL {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Remote pack URL is missing or too long.');
  let target: URL;
  try { target = new URL(value, catalogUrl); } catch { throw new Error('Remote pack URL is invalid.'); }
  if (target.protocol !== 'https:' || target.origin !== catalogUrl.origin || target.username || target.password || target.hash) {
    throw new Error('Remote assets must use HTTPS on the configured catalog origin; cross-origin URLs and redirects are not accepted.');
  }
  return target;
}

function catalogBase(url: string): URL {
  let base: URL;
  try { base = new URL(url); } catch { throw new Error('Remote catalog URL is invalid.'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.hash) throw new Error('Remote catalog must use an HTTPS URL without credentials or a fragment.');
  return base;
}

/** Strictly parse the optional remote index; only free, HTTPS/same-origin, digest-pinned assets are accepted. */
export function parseRemoteAssetCatalog(text: string, catalogUrl: string): RemoteBrushPack[] {
  if (new TextEncoder().encode(text).byteLength > MAX_REMOTE_CATALOG_BYTES) throw new Error('Remote catalog exceeds the 2 MB safety limit.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('Remote catalog is not valid JSON.'); }
  if (!plainRecord(raw) || raw.format !== REMOTE_CATALOG_FORMAT || raw.version !== REMOTE_CATALOG_VERSION || !Array.isArray(raw.packs)) {
    throw new Error('Unsupported remote brush catalog format.');
  }
  if (raw.packs.length > MAX_REMOTE_CATALOG_ENTRIES) throw new Error('Remote catalog contains too many entries.');
  const base = catalogBase(catalogUrl);
  const seen = new Set<string>();
  const packs: RemoteBrushPack[] = [];
  for (const item of raw.packs) {
    if (!plainRecord(item)) throw new Error('Remote catalog contains an invalid pack entry.');
    const id = safeText(item.id, 80);
    const name = safeText(item.name, 80);
    const category = safeText(item.category, 40);
    const description = safeText(item.description, 300);
    const version = Number(item.version);
    const engineVersion = Number(item.engineVersion);
    const sizeBytes = Number(item.sizeBytes);
    const sha256 = safeText(item.sha256, 64).toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id) || seen.has(id)) throw new Error('Remote catalog has an invalid or duplicate pack ID.');
    if (!name || !category || !description || !Number.isSafeInteger(version) || version < 1) throw new Error(`Remote pack “${id}” has invalid text or version metadata.`);
    if (item.free !== true) throw new Error(`Remote pack “${id}” is not explicitly marked free; paid assets are not supported.`);
    if (item.format !== BRUSH_PACK_FORMAT || engineVersion !== ENGINE_VERSION) throw new Error(`Remote pack “${id}” requires an unsupported brush format or engine.`);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_BRUSH_PACK_BYTES) throw new Error(`Remote pack “${id}” has an invalid declared size.`);
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`Remote pack “${id}” is missing a valid SHA-256 digest.`);
    const assetUrl = httpsSameOriginUrl(item.url, base);
    seen.add(id);
    packs.push({
      id, name, category, version, description,
      creator: safeText(item.creator, 80) || null,
      license: safeText(item.license, 120) || null,
      featured: item.featured === true,
      free: true,
      format: BRUSH_PACK_FORMAT,
      engineVersion,
      url: assetUrl.href,
      sizeBytes,
      sha256,
    });
  }
  return packs;
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  onProgress?: (progress: AssetDownloadProgress) => void,
): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error(`Response exceeds the ${formatAssetSize(maxBytes)} safety limit.`);
  const expected = Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : maxBytes;
  if (!response.body) {
    const result = new Uint8Array(await response.arrayBuffer());
    if (result.byteLength > maxBytes) throw new Error(`Response exceeds the ${formatAssetSize(maxBytes)} safety limit.`);
    onProgress?.({ loadedBytes: result.byteLength, totalBytes: expected });
    return result;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('asset-size-limit');
        throw new Error(`Response exceeds the ${formatAssetSize(maxBytes)} safety limit.`);
      }
      chunks.push(value);
      onProgress?.({ loadedBytes: total, totalBytes: expected });
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function checkedFetch(url: URL, fetcher: AssetFetch, signal?: AbortSignal): Promise<Response> {
  const response = await fetcher(url.href, { cache: 'no-store', redirect: 'error', signal });
  if (!response.ok) throw new Error(`Asset server returned HTTP ${response.status}.`);
  if (response.redirected) throw new Error('Asset redirects are not accepted.');
  if (response.url) {
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== 'https:' || finalUrl.origin !== url.origin) throw new Error('Asset response came from an unexpected origin.');
  }
  return response;
}

export async function fetchRemoteAssetCatalog(
  url: string,
  options: { fetcher?: AssetFetch; signal?: AbortSignal } = {},
): Promise<RemoteBrushPack[]> {
  const base = catalogBase(url);
  const response = await checkedFetch(base, options.fetcher || fetch, options.signal);
  const bytes = await readBoundedResponse(response, MAX_REMOTE_CATALOG_BYTES);
  return parseRemoteAssetCatalog(new TextDecoder('utf-8', { fatal: true }).decode(bytes), base.href);
}

export async function downloadRemoteBrushPack(
  entry: RemoteBrushPack,
  catalogUrl: string,
  maxBytes: number,
  options: {
    fetcher?: AssetFetch;
    signal?: AbortSignal;
    onProgress?: (progress: AssetDownloadProgress) => void;
  } = {},
): Promise<Uint8Array> {
  const base = catalogBase(catalogUrl);
  const url = httpsSameOriginUrl(entry.url, base);
  const limit = Math.min(MAX_BRUSH_PACK_BYTES, Math.max(1, Math.floor(maxBytes)));
  if (entry.sizeBytes > limit) throw new Error(`Pack download (${formatAssetSize(entry.sizeBytes)}) exceeds the configured ${formatAssetSize(limit)} per-download limit.`);
  const response = await checkedFetch(url, options.fetcher || fetch, options.signal);
  const bytes = await readBoundedResponse(response, limit, options.onProgress);
  if (bytes.byteLength !== entry.sizeBytes) throw new Error(`Downloaded pack size does not match catalog metadata (${bytes.byteLength} vs ${entry.sizeBytes} bytes).`);
  const actualHash = await sha256Hex(bytes);
  if (!actualHash) throw new Error('This platform cannot verify SHA-256; remote installation is disabled.');
  if (actualHash !== entry.sha256) throw new Error('Downloaded pack failed its SHA-256 integrity check.');
  return bytes;
}

export function configuredRemoteCatalogUrl(): string {
  const env = (import.meta as ImportMeta & { env?: { VITE_CARBON_ASSET_CATALOG_URL?: string } }).env;
  return typeof env?.VITE_CARBON_ASSET_CATALOG_URL === 'string' ? env.VITE_CARBON_ASSET_CATALOG_URL.trim() : '';
}
