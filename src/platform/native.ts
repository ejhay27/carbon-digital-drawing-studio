// Android (Capacitor) platform adapter. Everything here is a no-op in the browser build.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';

export const isNative = () => Capacitor.isNativePlatform();
export const isAndroid = () => Capacitor.getPlatform() === 'android';

export const PROJECT_DIR = 'CARBON';
export const EXPORT_DIR = 'CARBON/Exports';

/** Where projects live on this device; falls back to app-specific storage if public Documents is not writable. */
let baseDir: Directory = Directory.Documents;
export const storageLabel = () => (baseDir === Directory.Documents ? 'Documents/CARBON' : 'Android/data/…/files/CARBON (app storage)');

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function ensureStorage() {
  if (baseDir !== Directory.Documents) return;
  try {
    const p = await Filesystem.checkPermissions();
    if (p.publicStorage !== 'granted') await Filesystem.requestPermissions().catch(() => null);
    await Filesystem.mkdir({ path: PROJECT_DIR, directory: Directory.Documents, recursive: true }).catch(() => null);
    // probe write access
    await Filesystem.writeFile({ path: PROJECT_DIR + '/.probe', data: 'MQ==', directory: Directory.Documents, recursive: true });
    await Filesystem.deleteFile({ path: PROJECT_DIR + '/.probe', directory: Directory.Documents }).catch(() => null);
  } catch {
    baseDir = Directory.External;
    await Filesystem.mkdir({ path: PROJECT_DIR, directory: baseDir, recursive: true }).catch(() => null);
  }
}

const safe = (n: string) => n.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Untitled';

/**
 * Safe project write: data goes to a temp file first; the existing project is only
 * replaced after the temp file has been fully written and its size verified.
 */
export async function writeProject(fileName: string, bytes: Uint8Array): Promise<{ path: string; uri: string }> {
  await ensureStorage();
  const name = safe(fileName).replace(/(\.carbon)?$/i, '.carbon');
  const path = `${PROJECT_DIR}/${name}`;
  const tmp = `${PROJECT_DIR}/.${name}.tmp`;
  const data = toBase64(bytes);
  await Filesystem.writeFile({ path: tmp, data, directory: baseDir, recursive: true });
  const st = await Filesystem.stat({ path: tmp, directory: baseDir });
  if (st.size !== bytes.length) {
    await Filesystem.deleteFile({ path: tmp, directory: baseDir }).catch(() => null);
    throw new Error(`Write verification failed (${st.size} of ${bytes.length} bytes). The previous file is untouched.`);
  }
  await Filesystem.deleteFile({ path, directory: baseDir }).catch(() => null);
  try {
    await Filesystem.rename({ from: tmp, to: path, directory: baseDir, toDirectory: baseDir });
  } catch {
    // rename unsupported on this storage: write directly (bytes still in memory, temp copy kept as backup)
    await Filesystem.writeFile({ path, data, directory: baseDir, recursive: true });
  }
  const { uri } = await Filesystem.getUri({ path, directory: baseDir });
  return { path, uri };
}

export interface DeviceProject { name: string; path: string; size: number; mtime: number }
export async function listProjects(): Promise<DeviceProject[]> {
  if (!isNative()) return [];
  await ensureStorage();
  try {
    const r = await Filesystem.readdir({ path: PROJECT_DIR, directory: baseDir });
    return r.files
      .filter((f) => f.type === 'file' && /\.carbon$/i.test(f.name) && !f.name.startsWith('.'))
      .map((f) => ({ name: f.name, path: `${PROJECT_DIR}/${f.name}`, size: f.size, mtime: Number(f.mtime) || 0 }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}
export async function readProject(path: string): Promise<Uint8Array> {
  const r = await Filesystem.readFile({ path, directory: baseDir });
  if (typeof r.data === 'string') return fromBase64(r.data);
  return new Uint8Array(await r.data.arrayBuffer());
}
export async function deleteProject(path: string) {
  await Filesystem.deleteFile({ path, directory: baseDir });
}

/** Deliver an exported file: keep a copy in Documents/CARBON/Exports and optionally open the share sheet. */
export async function deliverFile(blob: Blob, name: string, share: boolean): Promise<string> {
  await ensureStorage();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const data = toBase64(bytes);
  const fname = safe(name);
  await Filesystem.writeFile({ path: `${EXPORT_DIR}/${fname}`, data, directory: baseDir, recursive: true });
  if (share) {
    // share from cache: always covered by the FileProvider configuration
    const { uri } = await Filesystem.writeFile({ path: `share/${fname}`, data, directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ title: fname, files: [uri], dialogTitle: 'Share from CARBON' });
    } catch (e) {
      if (!/cancel/i.test(String(e))) throw e;
    }
  }
  return `${storageLabel().replace('/CARBON', '')}/${EXPORT_DIR}/${fname}`;
}

export async function shareProjectFile(fileName: string, bytes: Uint8Array) {
  const { uri } = await Filesystem.writeFile({ path: `share/${safe(fileName)}`, data: toBase64(bytes), directory: Directory.Cache, recursive: true });
  await Share.share({ title: fileName, files: [uri], dialogTitle: 'Share CARBON project' }).catch((e) => {
    if (!/cancel/i.test(String(e))) throw e;
  });
}

export interface NativeHooks {
  onBack: () => boolean | Promise<boolean>; // return true if handled
  onPause: () => void;
}

export async function initNative(h: NativeHooks) {
  if (!isNative()) return;
  document.documentElement.classList.add('native', 'platform-' + Capacitor.getPlatform());
  try { await SystemBars.setStyle({ style: SystemBarsStyle.Dark }); } catch { /* older webview */ }
  await ensureStorage().catch(() => null);
  App.addListener('backButton', async () => {
    const handled = await h.onBack();
    if (!handled) App.minimizeApp().catch(() => App.exitApp());
  });
  App.addListener('appStateChange', ({ isActive }) => { if (!isActive) h.onPause(); });
  App.addListener('pause', () => h.onPause());
}

export async function setImmersive(on: boolean) {
  if (!isNative()) return;
  try { if (on) await SystemBars.hide(); else await SystemBars.show(); } catch { /* ignore */ }
}

export const exitApp = () => App.exitApp();
