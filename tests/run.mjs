#!/usr/bin/env node
/**
 * Carbon: Prime — Node test runner.
 *
 * Bundles tests/all.ts (real engine modules, not copies) with esbuild and runs it in Node.
 * Covers the DOM-free core: version/release identity, White Ground scene defaults and
 * migration, curve/symmetry math, brush preset library, color math, comic layout and
 * .carbon archive validation. The fuller acceptance suite (canvas-based) runs inside the
 * app: Help → Run Diagnostics.
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
    banner: {
      // minimal browser shims so zustand/persist and the brush-preset stamp (canvas) import cleanly in Node
      js: `
        const __store = new Map();
        if (typeof globalThis.localStorage === 'undefined') {
          globalThis.localStorage = {
            getItem: (k) => ( __store.has(k) ? __store.get(k) : null),
            setItem: (k, v) => { __store.set(k, String(v)); },
            removeItem: (k) => { __store.delete(k); },
            clear: () => __store.clear(),
            key: (i) => Array.from(__store.keys())[i] ?? null,
            get length() { return __store.size; },
          };
        }
        if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'node', onLine: true };
        if (typeof globalThis.document === 'undefined') {
          const noopCtx = () => new Proxy({}, {
            get: (_t, k) => {
              if (k === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
              if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
              if (k === 'measureText') return () => ({ width: 0 });
              return () => {};
            },
            set: () => true,
          });
          globalThis.document = {
            createElement: (tag) => ({
              width: 300, height: 150, style: {},
              getContext: () => (tag === 'canvas' ? noopCtx() : null),
              toDataURL: () => 'data:image/png;base64,',
            }),
            createElementNS: (_ns, tag) => globalThis.document.createElement(tag),
            addEventListener() {}, removeEventListener() {},
          };
        }
      `,
    },
  });
  const r = spawnSync(process.execPath, [outFile], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
} catch (e) {
  console.error('Test bundle failed:', e);
  process.exit(1);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
