import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function bytesOf(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  throw new TypeError('Project save data must be a byte buffer.');
}

async function removeIfPresent(io, file) {
  try { await io.unlink(file); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

async function restoreBackup(io, backup, destination) {
  await removeIfPresent(io, destination);
  await io.rename(backup, destination);
}

/**
 * Stage in the destination directory, flush and verify the staged bytes, then rename into place.
 * A verified copy of the previous project remains available until the replacement has passed its
 * final size check. This also gives filesystems that reject replace-by-rename a rollback path.
 */
export async function atomicWriteFile(destination, data, io = fs, pathApi = path, token = randomUUID()) {
  const bytes = bytesOf(data);
  const folder = pathApi.dirname(destination);
  const leaf = pathApi.basename(destination);
  const temporary = pathApi.join(folder, `.${leaf}.${token}.tmp`);
  const backup = pathApi.join(folder, `.${leaf}.${token}.bak`);
  let handle = null;
  let staged = false;
  let backupMade = false;

  try {
    handle = await io.open(temporary, 'wx', 0o600);
    staged = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;

    const stagedStat = await io.stat(temporary);
    if (stagedStat.size !== bytes.byteLength) {
      throw new Error(`Temporary project write verification failed (${stagedStat.size} of ${bytes.byteLength} bytes).`);
    }

    let oldStat = null;
    try { oldStat = await io.stat(destination); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (oldStat) {
      await io.copyFile(destination, backup);
      const backupStat = await io.stat(backup);
      if (backupStat.size !== oldStat.size) throw new Error('The previous project could not be verified in its recovery copy; it was not replaced.');
      const backupHandle = await io.open(backup, 'r');
      try { await backupHandle.sync(); } finally { await backupHandle.close(); }
      backupMade = true;
    }

    try {
      await io.rename(temporary, destination);
      staged = false;
    } catch (renameError) {
      if (!backupMade) throw renameError;
      try {
        await io.unlink(destination);
        await io.rename(temporary, destination);
        staged = false;
      } catch (installError) {
        try {
          await restoreBackup(io, backup, destination);
          backupMade = false;
        } catch (restoreError) {
          throw new Error(`The new project could not be installed (${installError.message}). The previous project remains in recovery file ${backup}; automatic restoration failed (${restoreError.message}).`);
        }
        throw installError;
      }
    }

    const finalStat = await io.stat(destination);
    if (finalStat.size !== bytes.byteLength) {
      if (backupMade) {
        try { await restoreBackup(io, backup, destination); backupMade = false; }
        catch (restoreError) {
          throw new Error(`Final project write verification failed (${finalStat.size} of ${bytes.byteLength} bytes). The previous project remains in recovery file ${backup}; automatic restoration failed (${restoreError.message}).`);
        }
      }
      throw new Error(`Final project write verification failed (${finalStat.size} of ${bytes.byteLength} bytes); the previous file was restored where available.`);
    }

    if (backupMade) {
      await removeIfPresent(io, backup);
      backupMade = false;
    }
    // Flush directory metadata when supported; some Windows filesystems do not allow opening a
    // directory handle, so the already-synced file remains the durability boundary there.
    try { const dir = await io.open(folder, 'r'); await dir.sync(); await dir.close(); } catch { /* platform-dependent */ }
  } catch (error) {
    if (handle) { try { await handle.close(); } catch { /* preserve the original write error */ } }
    if (staged) { try { await removeIfPresent(io, temporary); } catch { /* leave the recoverable original untouched */ } }
    throw error;
  }
}

export function asNodeBuffer(value) {
  return bytesOf(value);
}
