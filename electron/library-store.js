import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWriteFile } from './atomic-write.js';

const MAX_PROJECT_BYTES = 1024 * 1024 * 1024;
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);

function bytesOf(value, label) {
  let bytes;
  if (value instanceof ArrayBuffer) bytes = Buffer.from(value);
  else if (Buffer.isBuffer(value)) bytes = value;
  else if (value instanceof Uint8Array) bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  else throw new Error(`The ${label} data is not a byte buffer.`);
  if (!bytes.byteLength && label !== 'Library thumbnail') throw new Error(`The ${label} is empty.`);
  if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error(`The ${label} is larger than the 1 GB desktop file limit.`);
  return bytes;
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function validateMeta(input) {
  if (!input || !validId(input.id) || !['draw', 'infinite', '3d', 'comic'].includes(input.kind) || typeof input.name !== 'string' || !input.name.trim()) {
    throw new Error('Invalid project metadata; the Library was not changed.');
  }
  for (const key of ['width', 'height', 'pages', 'size', 'createdAt', 'modifiedAt', 'savedAt']) {
    if (!Number.isFinite(input[key]) || input[key] < 0) throw new Error(`Invalid project ${key} metadata.`);
  }
}

function validateIdAndVersion(id, version) {
  if (!validId(id) || typeof version !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(version)) {
    throw new Error('Invalid local Library project identity.');
  }
}

function bufferToArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Durable disk-backed local Library used by Electron. The versioned archive and thumbnail are
 * staged first; the small metadata pointer is committed last so a failed save keeps the old entry.
 * A mutation lane also protects the shared deletion tombstone file across Electron windows.
 */
export function createLibraryStore({ rootPath, io = fs, writeFile = atomicWriteFile }) {
  if (typeof rootPath !== 'function' && typeof rootPath !== 'string') throw new TypeError('A Library root path is required.');
  const rootFor = () => typeof rootPath === 'function' ? rootPath() : rootPath;
  let mutationLane = Promise.resolve();
  const mutate = (operation) => {
    const result = mutationLane.then(operation, operation);
    mutationLane = result.then(() => undefined, () => undefined);
    return result;
  };
  const pathsFor = (id, version) => {
    validateIdAndVersion(id, version);
    const root = rootFor();
    return {
      root,
      project: path.join(root, `${id}.${version}.carbon`),
      thumbnail: path.join(root, `${id}.${version}.png`),
      metadata: path.join(root, `${id}.json`),
      tombstones: path.join(root, 'deleted.json'),
    };
  };

  async function readTombstones(root) {
    try {
      const data = JSON.parse(await io.readFile(path.join(root, 'deleted.json'), 'utf8'));
      return Array.isArray(data) ? data.filter(validId) : [];
    } catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  }
  async function writeTombstones(root, ids) {
    await writeFile(path.join(root, 'deleted.json'), Buffer.from(JSON.stringify([...new Set(ids)])), io, path);
  }

  async function put(input = {}) {
    validateMeta(input);
    const project = bytesOf(input.bytes, 'Library project');
    const thumbnail = input.thumbnail === undefined || input.thumbnail === null
      ? Buffer.alloc(0) : bytesOf(input.thumbnail, 'Library thumbnail');
    return mutate(async () => {
      const root = rootFor();
      await io.mkdir(root, { recursive: true });
      const metadataPath = path.join(root, `${input.id}.json`);
      let old = null;
      try { old = JSON.parse(await io.readFile(metadataPath, 'utf8')); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; }

      const version = randomUUID();
      const current = pathsFor(input.id, version);
      const meta = {
        id: input.id,
        kind: input.kind,
        name: input.name.trim().slice(0, 120),
        width: input.width,
        height: input.height,
        pages: Math.max(1, Math.round(input.pages || 1)),
        size: project.byteLength,
        createdAt: input.createdAt,
        modifiedAt: input.modifiedAt,
        savedAt: input.savedAt,
        hasReplay: !!input.hasReplay,
        version,
      };
      let committed = false;
      const tombstonesBefore = await readTombstones(root);
      try {
        await writeFile(current.project, project, io, path);
        if (thumbnail.byteLength) await writeFile(current.thumbnail, thumbnail, io, path);
        if (tombstonesBefore.includes(input.id)) await writeTombstones(root, tombstonesBefore.filter((id) => id !== input.id));
        try { await writeFile(current.metadata, Buffer.from(JSON.stringify(meta)), io, path); }
        catch (error) {
          if (tombstonesBefore.includes(input.id)) await writeTombstones(root, tombstonesBefore).catch(() => {});
          throw error;
        }
        committed = true;
      } finally {
        if (!committed) {
          await Promise.all([io.unlink(current.project).catch(() => {}), io.unlink(current.thumbnail).catch(() => {})]);
        }
      }
      if (old?.version && old.version !== version && /^[a-zA-Z0-9-]{1,64}$/.test(old.version)) {
        const previous = pathsFor(input.id, old.version);
        await Promise.all([io.unlink(previous.project).catch(() => {}), io.unlink(previous.thumbnail).catch(() => {})]);
      }
      return { id: input.id, savedAt: meta.savedAt, size: project.byteLength };
    });
  }

  async function list() {
    const root = rootFor();
    await io.mkdir(root, { recursive: true });
    const deletedIds = await readTombstones(root);
    const deleted = new Set(deletedIds);
    const names = await io.readdir(root);
    const entries = [];
    for (const name of names) {
      if (name === 'deleted.json' || !/^[a-zA-Z0-9_-]{1,128}\.json$/.test(name)) continue;
      try {
        const id = name.slice(0, -5);
        if (deleted.has(id)) continue;
        const meta = JSON.parse(await io.readFile(path.join(root, name), 'utf8'));
        validateMeta(meta);
        validateIdAndVersion(meta.id, meta.version);
        if (meta.id !== id) continue;
        const files = pathsFor(id, meta.version);
        const [st, thumb] = await Promise.all([
          io.stat(files.project),
          io.readFile(files.thumbnail).catch((error) => error?.code === 'ENOENT' ? Buffer.alloc(0) : Promise.reject(error)),
        ]);
        entries.push({ ...meta, size: st.size, thumbnail: toArrayBuffer(thumb) });
      } catch (error) {
        if (error?.code !== 'ENOENT') console.warn('[CARBON] Could not index a local Library project:', error);
      }
    }
    entries.sort((a, b) => b.savedAt - a.savedAt || a.name.localeCompare(b.name));
    return { entries, deletedIds };
  }

  async function get(id) {
    if (!validId(id)) throw new Error('Invalid local Library project identity.');
    const root = rootFor();
    if ((await readTombstones(root)).includes(id)) return null;
    let meta;
    try { meta = JSON.parse(await io.readFile(path.join(root, `${id}.json`), 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
    validateMeta(meta);
    validateIdAndVersion(meta.id, meta.version);
    if (meta.id !== id) throw new Error('Library project metadata does not match its file.');
    const files = pathsFor(id, meta.version);
    const [bytes, thumbnail] = await Promise.all([
      io.readFile(files.project),
      io.readFile(files.thumbnail).catch((error) => error?.code === 'ENOENT' ? Buffer.alloc(0) : Promise.reject(error)),
    ]);
    return { ...meta, size: bytes.byteLength, bytes: toArrayBuffer(bytes), thumbnail: toArrayBuffer(thumbnail) };
  }

  async function remove(id) {
    if (!validId(id)) throw new Error('Invalid local Library project identity.');
    return mutate(async () => {
      const root = rootFor();
      await io.mkdir(root, { recursive: true });
      const tombstones = await readTombstones(root);
      await writeTombstones(root, [...tombstones, id]);
      try {
        const meta = JSON.parse(await io.readFile(path.join(root, `${id}.json`), 'utf8'));
        if (meta?.version && /^[a-zA-Z0-9-]{1,64}$/.test(meta.version)) {
          const files = pathsFor(id, meta.version);
          await Promise.all([io.unlink(files.project).catch(() => {}), io.unlink(files.thumbnail).catch(() => {})]);
        }
        await io.unlink(path.join(root, `${id}.json`)).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
      } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    });
  }

  return { put, list, get, delete: remove };
}
