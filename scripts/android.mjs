#!/usr/bin/env node
/**
 * CARBON → Android APK build pipeline (Capacitor 8).
 *
 *   node scripts/android.mjs               build web app, create/sync android/ project
 *   node scripts/android.mjs --apk         … and build a debug APK  → release/CARBON-<ver>-debug.apk
 *   node scripts/android.mjs --release     … and a signed release APK (needs CARBON_KEYSTORE* env vars)
 *   node scripts/android.mjs --open        … and open the project in Android Studio
 *   flags: --icons (regenerate launcher icons / splash), --skip-web (reuse existing dist/)
 *
 * Requirements: Node 22+, JDK 21 (JAVA_HOME), Android SDK 36 (ANDROID_HOME).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const WIN = process.platform === 'win32';
const VERSION_NAME = process.env.CARBON_VERSION_NAME || '1.0.0';
const VERSION_CODE = String(parseInt(process.env.CARBON_VERSION_CODE || '1', 10) || 1);

const log = (m) => console.log(`\n\x1b[38;5;208m◆\x1b[0m ${m}`);
const fail = (m) => { console.error(`\n\x1b[31m✗ ${m}\x1b[0m`); process.exit(1); };
const run = (cmd, cwd = process.cwd()) => { console.log(`  › ${cmd}`); execSync(cmd, { stdio: 'inherit', shell: true, cwd }); };
const tryRun = (cmd) => { try { execSync(cmd, { stdio: 'pipe', shell: true }); return true; } catch { return false; } };

// ---------------------------------------------------------------- preflight
if (parseInt(process.versions.node, 10) < 22) fail(`Node 22 or newer is required by Capacitor 8 (found ${process.versions.node}).`);
if (!fs.existsSync('capacitor.config.json')) fail('Run this script from the project root.');
const wantsNative = args.has('--apk') || args.has('--release');
if (wantsNative) {
  if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) fail('ANDROID_HOME is not set. Install Android Studio (SDK 36) and set ANDROID_HOME.');
  try {
    const v = execSync('java -version 2>&1', { shell: true }).toString();
    const m = v.match(/version "(\d+)/);
    if (m && parseInt(m[1], 10) < 21) fail(`JDK 21 is required (found Java ${m[1]}). Point JAVA_HOME to a JDK 21.`);
  } catch { fail('Java not found. Install JDK 21 and set JAVA_HOME.'); }
}

// ---------------------------------------------------------------- 1. web build
if (!args.has('--skip-web')) { log('Building the CARBON web bundle'); run('npm run build'); }
if (!fs.existsSync('dist/index.html')) fail('dist/index.html missing: the web build failed.');

// ---------------------------------------------------------------- 2. android project
if (!fs.existsSync('android')) { log('Creating the Android project (npx cap add android)'); run('npx cap add android'); }

// ---------------------------------------------------------------- 3. patch manifest + gradle (idempotent)
log('Configuring the Android manifest and Gradle');
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let mf = fs.readFileSync(manifestPath, 'utf8');
const appAttrs = {
  'android:largeHeap': 'true', // big canvases + undo history
  'android:hardwareAccelerated': 'true', // GPU canvas compositing
  'android:requestLegacyExternalStorage': 'true', // Documents/CARBON on Android 10
};
for (const [k, v] of Object.entries(appAttrs)) {
  if (!mf.includes(k)) mf = mf.replace(/<application\b/, `<application\n        ${k}="${v}"`);
}
const perms = [
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
];
for (const p of perms) {
  const name = p.match(/name="([^"]+)"/)[1];
  if (!mf.includes(name)) mf = mf.replace(/(\s*)<application\b/, `$1${p}$1<application`);
}
// keep the WebView alive across rotation / keyboard / multi-window resizes (no reload, no lost strokes)
mf = mf.replace(/android:configChanges="([^"]*)"/, (all, v) => {
  const need = ['orientation', 'keyboardHidden', 'keyboard', 'screenSize', 'smallestScreenSize', 'screenLayout', 'uiMode', 'density', 'navigation'];
  const have = new Set(v.split('|'));
  need.forEach((n) => have.add(n));
  return `android:configChanges="${[...have].join('|')}"`;
});
if (!mf.includes('android:windowSoftInputMode')) mf = mf.replace(/<activity\b/, '<activity\n            android:windowSoftInputMode="adjustResize"');
fs.writeFileSync(manifestPath, mf);

const gradlePath = 'android/app/build.gradle';
let gr = fs.readFileSync(gradlePath, 'utf8');
gr = gr.replace(/(versionCode\s*=?\s*)\d+/, `$1${VERSION_CODE}`).replace(/(versionName\s*=?\s*)"[^"]*"/, `$1"${VERSION_NAME}"`);
fs.writeFileSync(gradlePath, gr);
console.log(`  ✓ versionName ${VERSION_NAME}, versionCode ${VERSION_CODE}`);

// ---------------------------------------------------------------- 4. icons & splash
const iconMarker = 'android/.carbon-icons';
if (args.has('--icons') || !fs.existsSync(iconMarker)) {
  log('Generating launcher icons and splash from the CARBON brand assets');
  const haveTools = tryRun('node -e "require.resolve(\'sharp\');require.resolve(\'@capacitor/assets/package.json\')"');
  if (!haveTools) run('npm install --no-save sharp @capacitor/assets');
  try {
    run('node scripts/render-icons.mjs');
    run('npx @capacitor/assets generate --android --iconBackgroundColor "#1A1A1D" --iconBackgroundColorDark "#1A1A1D" --splashBackgroundColor "#141416" --splashBackgroundColorDark "#141416"');
    fs.writeFileSync(iconMarker, new Date().toISOString());
  } catch {
    console.warn('  ! Icon generation failed. The default Capacitor icon will be used. Re-run with --icons.');
  }
}

// ---------------------------------------------------------------- 5. sync web bundle + plugins
log('Syncing web assets and native plugins');
run('npx cap sync android');

// ---------------------------------------------------------------- 6. gradle
const gradlew = WIN ? 'gradlew.bat' : './gradlew';
const outDir = path.resolve('release');
if (wantsNative) fs.mkdirSync(outDir, { recursive: true });

if (args.has('--apk')) {
  log('Building the debug APK');
  if (!WIN) fs.chmodSync('android/gradlew', 0o755);
  run(`${gradlew} assembleDebug --no-daemon`, path.resolve('android'));
  const src = 'android/app/build/outputs/apk/debug/app-debug.apk';
  const dst = path.join(outDir, `CARBON-${VERSION_NAME}-debug.apk`);
  fs.copyFileSync(src, dst);
  console.log(`  ✓ ${dst}`);
}

if (args.has('--release')) {
  const { CARBON_KEYSTORE, CARBON_KEYSTORE_PASSWORD, CARBON_KEY_ALIAS, CARBON_KEY_PASSWORD } = process.env;
  if (!CARBON_KEYSTORE || !CARBON_KEYSTORE_PASSWORD || !CARBON_KEY_ALIAS) {
    fail('Release signing needs CARBON_KEYSTORE, CARBON_KEYSTORE_PASSWORD, CARBON_KEY_ALIAS (and optionally CARBON_KEY_PASSWORD).');
  }
  log('Building the release APK');
  if (!WIN) fs.chmodSync('android/gradlew', 0o755);
  run(`${gradlew} assembleRelease --no-daemon`, path.resolve('android'));
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const bt = path.join(sdk, 'build-tools');
  const latest = fs.readdirSync(bt).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
  if (!latest) fail('No Android build-tools found in ' + bt);
  const tool = (n) => `"${path.join(bt, latest, n + (WIN ? (n === 'apksigner' ? '.bat' : '.exe') : ''))}"`;
  const unsigned = 'android/app/build/outputs/apk/release/app-release-unsigned.apk';
  const aligned = path.join(outDir, 'app-release-aligned.apk');
  const final = path.join(outDir, `CARBON-${VERSION_NAME}.apk`);
  run(`${tool('zipalign')} -p -f 4 "${unsigned}" "${aligned}"`);
  run(`${tool('apksigner')} sign --ks "${CARBON_KEYSTORE}" --ks-key-alias "${CARBON_KEY_ALIAS}" --ks-pass env:CARBON_KEYSTORE_PASSWORD --key-pass env:${CARBON_KEY_PASSWORD ? 'CARBON_KEY_PASSWORD' : 'CARBON_KEYSTORE_PASSWORD'} --out "${final}" "${aligned}"`);
  run(`${tool('apksigner')} verify --print-certs "${final}"`);
  fs.rmSync(aligned, { force: true });
  console.log(`  ✓ ${final}`);
}

if (args.has('--open')) run('npx cap open android');

log('Done.' + (wantsNative ? ` APKs are in ${outDir}` : ' Use --apk to build an installable APK, or --open for Android Studio.'));
