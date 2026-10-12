type FileOptions = { path: string; directory: string; recursive?: boolean };
type WriteOptions = FileOptions & { data: string };
type RenameOptions = { from: string; to: string; directory: string; toDirectory?: string };

/** Minimal filesystem surface so the replacement protocol can be exercised without Android. */
export interface ProjectFileSystem {
  writeFile(options: WriteOptions): Promise<unknown>;
  readFile(options: FileOptions): Promise<{ data: string | Blob | ArrayBuffer | Uint8Array }>;
  stat(options: FileOptions): Promise<{ size: number }>;
  rename(options: RenameOptions): Promise<unknown>;
  deleteFile(options: FileOptions): Promise<unknown>;
}

interface ReplaceOptions {
  directory: string;
  path: string;
  temporaryPath: string;
  backupPath: string;
  data: string;
  expectedSize: number;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isNotFound(error: unknown) {
  const e = error as { code?: unknown; message?: unknown } | null;
  const text = `${String(e?.code ?? '')} ${String(e?.message ?? error)}`;
  return /ENOENT|not found|no such file|does not exist|file not found/i.test(text);
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function asBase64(data: string | Blob | ArrayBuffer | Uint8Array): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return toBase64(new Uint8Array(await data.arrayBuffer()));
  return toBase64(data instanceof Uint8Array ? data : new Uint8Array(data));
}

async function remove(fs: ProjectFileSystem, path: string, directory: string) {
  await fs.deleteFile({ path, directory }).catch(() => undefined);
}

/**
 * Replace a project only after the staged bytes have been size-verified. When the platform
 * cannot rename over an existing file, first keep a verified rollback copy before writing
 * the destination. If installation fails, restore the old project or leave its backup intact.
 */
export async function replaceProjectFile(fs: ProjectFileSystem, options: ReplaceOptions) {
  const { directory, path, temporaryPath, backupPath, data, expectedSize } = options;
  let staged = false;
  let hadOriginal = false;
  let backupReady = false;
  let backupWasMoved = false;
  let originalData: string | null = null;

  try {
    staged = true; // clean up a partial staging file even if the provider throws mid-write
    await fs.writeFile({ path: temporaryPath, data, directory, recursive: true });
    const stagedStat = await fs.stat({ path: temporaryPath, directory });
    if (stagedStat.size !== expectedSize) {
      throw new Error(`Temporary write verification failed (${stagedStat.size} of ${expectedSize} bytes).`);
    }

    let originalSize = 0;
    try {
      originalSize = (await fs.stat({ path, directory })).size;
      hadOriginal = true;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }

    if (hadOriginal) {
      try {
        await fs.rename({ from: path, to: backupPath, directory, toDirectory: directory });
        backupReady = true;
        backupWasMoved = true;
      } catch {
        // Some Android storage providers do not support rename. Copy and verify a recovery
        // file first; abort before touching the original if that copy cannot be made.
        const old = await fs.readFile({ path, directory });
        originalData = await asBase64(old.data);
        await fs.writeFile({ path: backupPath, data: originalData, directory, recursive: true });
        const backupStat = await fs.stat({ path: backupPath, directory });
        if (backupStat.size !== originalSize) {
          throw new Error(`Rollback copy verification failed (${backupStat.size} of ${originalSize} bytes). The existing project was not changed.`);
        }
        backupReady = true;
      }
    }

    try {
      try {
        await fs.rename({ from: temporaryPath, to: path, directory, toDirectory: directory });
        staged = false;
      } catch {
        // The verified staging file and, when needed, the old project backup are still intact.
        await fs.writeFile({ path, data, directory, recursive: true });
      }

      const finalStat = await fs.stat({ path, directory });
      if (finalStat.size !== expectedSize) {
        throw new Error(`Final write verification failed (${finalStat.size} of ${expectedSize} bytes).`);
      }
      if (staged) {
        await remove(fs, temporaryPath, directory);
        staged = false;
      }
    } catch (installError) {
      if (hadOriginal && backupReady) {
        try {
          await remove(fs, path, directory);
          if (backupWasMoved) {
            await fs.rename({ from: backupPath, to: path, directory, toDirectory: directory });
            backupReady = false;
          } else if (originalData !== null) {
            await fs.writeFile({ path, data: originalData, directory, recursive: true });
            const restored = await fs.stat({ path, directory });
            if (restored.size !== originalSize) throw new Error(`Restored project size is ${restored.size}, expected ${originalSize}.`);
            await remove(fs, backupPath, directory);
            backupReady = false;
          }
        } catch (restoreError) {
          throw new Error(
            `New project could not be installed (${errorText(installError)}). The previous project remains in recovery file ${backupPath}; automatic restoration failed (${errorText(restoreError)}).`,
          );
        }
      } else {
        await remove(fs, path, directory);
      }
      throw installError;
    }

    if (backupReady) await remove(fs, backupPath, directory);
  } catch (error) {
    if (staged) await remove(fs, temporaryPath, directory);
    // Remove an incomplete copy, but never remove a verified backup containing user data.
    if (hadOriginal && !backupReady) await remove(fs, backupPath, directory);
    throw error;
  }
}
