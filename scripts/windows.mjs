#!/usr/bin/env node
/**
 * CARBON for Windows: build & packaging (Windows edition only).
 *
 *   node scripts/windows.mjs              build web bundle + portable folder  → release/windows/CARBON-portable/
 *   node scripts/windows.mjs --exe        + Electron portable .exe and .zip   → release/windows/*.exe, *.zip
 *   node scripts/windows.mjs --source     + source archive                    → release/windows/CARBON-source.zip
 *
 * ANDROID IS NEVER TOUCHED: this script does not read or write android/, capacitor.config.json,
 * assets/, scripts/android.mjs or release/*.apk. All outputs go to release/windows/.
 *
 * Launching / testing
 *   • Portable (no install): open release/windows/CARBON-portable/CARBON.html in Edge or Chrome
 *     (works offline; Edge → … → Apps → "Install this site as an app" gives a desktop window).
 *   • Electron build (--exe): run release/windows/CARBON <ver>.exe (portable, no installer needed).
 *   • In the app: Help → Run Diagnostics runs the automated acceptance tests (incl. the [Win] suite).
 *
 * Requirements for --exe: Node 18+, internet access for the first `electron` download, Windows (or wine).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'release', 'windows');
// Single source of truth: WINDOWS_VERSION in src/version.ts (the Android version is NOT read or changed here).
const VERSION = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'version.ts'), 'utf8');
  const m = src.match(/WINDOWS_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
  if (!m) { console.error('Could not read WINDOWS_VERSION from src/version.ts'); process.exit(1); }
  const notes = fs.readFileSync(path.join(ROOT, 'src', 'release', 'releases.ts'), 'utf8');
  const first = notes.match(/version:\s*'(\d+\.\d+\.\d+)'/);
  if (!first || first[1] !== m[1]) { console.error(`Release notes start at ${first?.[1]} but WINDOWS_VERSION is ${m[1]}. Add a release entry first.`); process.exit(1); }
  return m[1];
})();
const run = (c, cwd = ROOT) => { console.log('  › ' + c); execSync(c, { stdio: 'inherit', shell: true, cwd }); };
const log = (m) => console.log(`\n\x1b[38;5;208m◆\x1b[0m ${m}`);

if (!fs.existsSync(path.join(ROOT, 'package.json'))) { console.error('Run from the project root.'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

log('Building the CARBON web bundle (single offline file)');
run('npm run build');
const html = path.join(ROOT, 'dist', 'index.html');
if (!fs.existsSync(html)) { console.error('dist/index.html missing: build failed'); process.exit(1); }

log('Creating the portable folder');
const portable = path.join(OUT, 'CARBON-portable');
// keep the previous verified build recoverable instead of overwriting it
if (fs.existsSync(path.join(portable, 'CARBON.html'))) {
  let prev = 'unknown';
  try { prev = (fs.readFileSync(path.join(portable, 'README.txt'), 'utf8').match(/CARBON(?: PRIME)? (\d+\.\d+\.\d+)/) || [])[1] || prev; } catch { /* no readme */ }
  const keep = path.join(OUT, 'previous', `CARBON-portable-${prev}${prev === VERSION ? '-' + Date.now() : ''}`);
  fs.mkdirSync(path.dirname(keep), { recursive: true });
  fs.renameSync(portable, keep);
  console.log('  ✓ previous build kept at ' + keep);
}
fs.rmSync(portable, { recursive: true, force: true });
fs.mkdirSync(portable, { recursive: true });
fs.copyFileSync(html, path.join(portable, 'CARBON.html'));
fs.writeFileSync(path.join(portable, 'README.txt'), [
  `CARBON PRIME ${VERSION}+ls (Windows edition): portable`,
  '',
  'Open CARBON.html in Microsoft Edge or Google Chrome. Everything runs offline; artwork stays on this PC.',
  'Tip: Edge > ... > Apps > "Install this site as an app" opens CARBON in its own window.',
  'Help > Run Diagnostics runs the built-in acceptance tests.',
].join('\r\n'));
console.log('  ✓ ' + portable);

if (args.has('--exe')) {
  log('Packaging an Electron portable executable');
  const app = path.join(OUT, 'electron-app');
  fs.rmSync(app, { recursive: true, force: true });
  fs.mkdirSync(app, { recursive: true });
  fs.copyFileSync(html, path.join(app, 'index.html'));
  fs.writeFileSync(path.join(app, 'main.cjs'), `
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1600, height: 1000, backgroundColor: '#141416', title: 'CARBON', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
`);
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'carbon-studio', productName: 'CARBON', version: VERSION, main: 'main.cjs', description: 'CARBON: Where all starts begin.', author: 'CARBON' }, null, 2));
  run('npm install --no-save --no-audit --no-fund electron@33 electron-builder@25', app);
  const cfg = { appId: 'studio.carbon.windows', productName: 'CARBON', directories: { output: OUT }, files: ['index.html', 'main.cjs', 'package.json'], win: { target: ['portable', 'zip'] } };
  fs.writeFileSync(path.join(app, 'builder.json'), JSON.stringify(cfg));
  run('npx electron-builder --win --config builder.json --publish never', app);
  console.log('  ✓ executables in ' + OUT);
}

if (args.has('--source')) {
  log('Creating the source archive (excludes node_modules, build output, secrets)');
  const { zipSync } = await import('fflate');
  const files = {};
  const skip = /(^|[\\/])(node_modules|dist|release|android|\.git|\.gradle)([\\/]|$)|\.(keystore|jks|env)$/i;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name), rel = path.relative(ROOT, p);
      if (skip.test(rel)) continue;
      if (e.isDirectory()) walk(p); else files['CARBON/' + rel.replace(/\\/g, '/')] = new Uint8Array(fs.readFileSync(p));
    }
  };
  walk(ROOT);
  const zip = path.join(OUT, `CARBON-${VERSION}-source.zip`);
  fs.writeFileSync(zip, zipSync(files, { level: 6 }));
  console.log(`  ✓ ${zip} (${Object.keys(files).length} files)`);
}

log('Done. Windows outputs: ' + OUT);
