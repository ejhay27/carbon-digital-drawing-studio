import type { LibraryKind } from './windowsLibrary';

export interface DesktopProjectPayload {
  id: string;
  kind: LibraryKind;
  name: string;
  bytes: ArrayBuffer;
  thumbnail: ArrayBuffer;
  width: number;
  height: number;
  pages: number;
  size: number;
  createdAt: number;
  modifiedAt: number;
  savedAt: number;
  hasReplay: boolean;
}

export interface DesktopLibrarySummary extends Omit<DesktopProjectPayload, 'bytes'> {
  bytes?: never;
}

export interface DesktopLibraryEntry extends DesktopProjectPayload {}

export type DesktopProjectFileResult =
  | { canceled: true }
  | { canceled: false; fileId: string; name: string; path: string; bytes: ArrayBuffer; extension: 'carbon' | 'carboncomic' };

export type DesktopSaveResult =
  | { canceled: true }
  | { canceled: false; fileId?: string; name: string; path: string; bytesWritten: number };

export interface DesktopLibraryListResult {
  entries: DesktopLibrarySummary[];
  deletedIds: string[];
}

export interface CarbonDesktopBridge {
  openProject(): Promise<DesktopProjectFileResult>;
  saveProject(input: { fileId?: string; name: string; extension: 'carbon' | 'carboncomic'; bytes: ArrayBuffer }): Promise<DesktopSaveResult>;
  saveExport(input: { name: string; bytes: ArrayBuffer }): Promise<DesktopSaveResult>;
  putLibraryProject(input: DesktopProjectPayload): Promise<void>;
  listLibraryProjects(): Promise<DesktopLibraryListResult>;
  getLibraryProject(id: string): Promise<DesktopLibraryEntry | null>;
  deleteLibraryProject(id: string): Promise<void>;
}

declare global {
  interface Window { carbonDesktop?: CarbonDesktopBridge }
}

export function desktopBridge(): CarbonDesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return window.carbonDesktop || null;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = bytes.slice();
  return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer;
}

export function fromArrayBuffer(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
}
