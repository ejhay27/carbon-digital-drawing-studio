#!/usr/bin/env node
/**
 * Carbon: Prime — Node test runner.
 *
 * Bundles tests/all.ts (real engine modules, not copies) with esbuild and runs it in Node.
 * Covers the DOM-free core plus browser-persistence behavior with small test shims.
 * The fuller acceptance suite (canvas-based) runs inside the app: Help → Run Diagnostics.
 *
 *   npm test
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const outDir = mkdtempSync(join(tmpdir(), 'carbon-test-'));
const outFile = join(outDir, 'all.mjs');

try {
  await build({
    entryPoints: [join(ROOT, 'tests', 'all.ts')],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
  });
  // --import evaluates the shims before static dependencies in the ESM test bundle.
  const r = spawnSync(process.execPath, ['--import', join(ROOT, 'tests', 'setup.mjs'), outFile], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
} catch (e) {
  console.error('Test bundle failed:', e);
  process.exit(1);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
