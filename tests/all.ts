/**
 * Carbon: Prime — unit tests for the DOM-free engine core (run via `npm test`).
 * These import the real modules; nothing here is a copy of engine code.
 * Canvas-dependent acceptance tests live in src/engine/selftest*.ts and run in-app
 * (Help → Run Diagnostics).
 */
import {
  APP_LABEL, APP_VERSION, LS_SUFFIX, PRODUCT_NAME, PRODUCT_TAGLINE, SEMVER, WINDOWS_VERSION, compareSemver,
} from '../src/version';
import { PUBLISHED_RELEASES, RELEASES } from '../src/release/releases';
import * as THREE from 'three';
import { DocEngine, Recorder, eventBytes } from '../src/engine/document';
import type { CamView } from '../src/engine/types';
import { inkStrokeSvgPath } from '../src/engine/crispInk';
import { buildDocumentSvg } from '../src/engine/svgExport';
import { appendRecordedSample } from '../src/engine/recording';
import { ABOUT_CREATOR, ABOUT_PROJECT_COPY } from '../src/components/aboutCopy';
import { replaceProjectFile, type ProjectFileSystem } from '../src/platform/safeProjectWrite';
import { createTouchGestureGate } from '../src/win/touchGestureGate';
import {
  DEFAULT_VIEW, applyMat, attachHierarchy, buildGuideGroups, close3DStroke, createViewGuide, curveGeometry, curvePath, defaultScene, guideFrame, guideFromLegacyPlane, guideLocalPoint, guidePlane, guideWorldPoint, intersectDrawPlane, localizeGuideStroke, localizeSurfaceNormal, localizeSurfaceStroke, persistSceneCamera, planarLoop, pressureFromPointer, projectSurfaceSymmetryPaths, remapSurfaceNormals, sceneOf, simplify3, simplify3WithPressures, smooth3, surfaceHit, symMatrices,
} from '../src/win/sceneRender';
import { buildPresets, ENGINE_VERSION, exportBrushes, parseBrushImport } from '../src/engine/brushes';
import { brushFingerprint } from '../src/engine/brushes';
import { DEFAULT_MAX_BRUSH_PACK_BYTES, exportPack, parsePack, withoutInstalledPackBrush } from '../src/engine/brushPacks';
import { downloadRemoteBrushPack, formatAssetSize, measureBrushDefinitionBytes, measureBrushPackBytes, megabytesToBytes, parseRemoteAssetCatalog, type RemoteBrushPack } from '../src/engine/assetStore';
import { MAX_BRUSH_QR_BYTES, makeBrushQrPayload, parseBrushQrPayload } from '../src/engine/brushQR';
import { MIME, FORMAT_VERSION, deserializeDoc, isComicArchive, serializeDoc, verifyBytes } from '../src/engine/fileFormat';
import { zipSync, strToU8 } from 'fflate';
import { LAYOUTS, PAGE_PRESETS, layoutPanels } from '../src/engine/comic';
import { clamp, hexToRgb, hexToHsv, hsvToHex, isHex, normHex, rgbToHex, rgbToHsv, hsvToRgb } from '../src/engine/util';
import { findProjects, recentPinId, togglePinnedId } from '../src/state/projectFinder';
import { firstPaletteSelection, nextPaletteSelection, searchPaletteItems } from '../src/state/commandPalette';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, allBrushes, brushById, dedupeToastList, getApp, mergeSettings, selectBrush, setApp, updateBrush } from '../src/state/store';
import { documentWorkspace, findWorkspaceDocument } from '../src/win/workspaceModel';
import { navigateHomeSafely } from '../src/state/actions';
import { buildQuickStartSample } from '../src/state/quickStartSample';
import { BEACH_LOOP_SECONDS, BEACH_MAX_DPR, beachLoopPhase, beachSurge, coverTransform } from '../src/components/oceanMath';
import * as nodeFs from 'node:fs/promises';
import nodePath from 'node:path';
import { tmpdir } from 'node:os';
import { atomicWriteFile } from '../electron/atomic-write.js';
import { createLibraryStore } from '../electron/library-store.js';
import { createSaveQueue } from '../src/state/saveQueue';
import {
  BUILT_IN_THEMES, DEFAULT_THEME_ID, LEGACY_THEME_TOKEN_KEYS, MAX_IMPORTED_THEMES, MAX_THEME_BUNDLE_BYTES, THEME_BUNDLE_FORMAT,
  THEME_BUNDLE_VERSION, THEME_CATEGORIES, THEME_TOKEN_KEYS,
  contrastRatio, createCustomTheme, exportThemeBundle, parseThemeBundleText, sanitizeThemePreferences,
  themeToSpec, validateCustomTheme, validateThemeSpec,
} from '../src/theme/themes';
import { useThemeStudio } from '../src/theme/themeStore';

// ---------------------------------------------------------------- tiny harness
let pass = 0;
const failures: string[] = [];
function ok(cond: unknown, msg: string) {
  if (cond) pass++;
  else failures.push(msg);
}
function eq<T>(a: T, b: T, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}
function throws(fn: () => unknown, msg: string) {
  try { fn(); failures.push(msg + ' (did not throw)'); } catch { pass++; }
}
async function rejects(fn: () => Promise<unknown>, msg: string) {
  try { await fn(); failures.push(msg + ' (did not reject)'); } catch { pass++; }
}
function section(name: string) {
  console.log(`\n▶ ${name}`);
}

// ---------------------------------------------------------------- 1. version identity
section('Release identity (Carbon: Prime 7.x+ls)');
ok(SEMVER.test(WINDOWS_VERSION), `WINDOWS_VERSION ${WINDOWS_VERSION} must be MAJOR.MINOR.PATCH`);
eq(APP_VERSION, WINDOWS_VERSION + LS_SUFFIX, 'APP_VERSION = WINDOWS_VERSION + "+ls"');
eq(APP_LABEL, `CARBON PRIME ${WINDOWS_VERSION}${LS_SUFFIX}`, 'APP_LABEL uses the PRIME +ls identity');
eq(LS_SUFFIX, '+ls', 'release suffix is "+ls" (Local Storage)');
eq(PRODUCT_NAME, 'Carbon: Prime', 'product name');
eq(PRODUCT_TAGLINE, 'Where all starts begin.', 'tagline preserved');
ok(compareSemver(WINDOWS_VERSION, '2.2.0') > 0, '7.x is newer than 2.2.0');
ok(compareSemver('7.1.0', '7.2.0') < 0, 'compareSemver orders minor versions');
ok(WINDOWS_VERSION.startsWith('7.'), 'release stays on the 7.x line (never Carbon 8)');
eq(WINDOWS_VERSION, '7.9.9', 'the requested Windows build identity is 7.9.9');

const first = RELEASES[0];
ok(!!first, 'release notes are bundled');
if (first) {
  eq(first.version, WINDOWS_VERSION, 'release notes start at the running version');
  eq(first.suffix, LS_SUFFIX, 'current release carries the +ls suffix');
  eq(first.status, 'candidate', 'unpublished build is explicitly labeled a source candidate');
  ok(first.date === null || /^\d{4}-\d{2}-\d{2}$/.test(first.date), 'release date is ISO or null');
  ok(first.features.length + first.improvements.length + first.fixes.length > 0, 'release notes list actual changes');
}
const seen = new Set<string>();
for (let i = 0; i < RELEASES.length; i++) {
  const r = RELEASES[i];
  ok(SEMVER.test(r.version), `${r.version} is bare semver`);
  ok(!seen.has(r.version), `no duplicate release ${r.version}`);
  seen.add(r.version);
  if (i) ok(compareSemver(RELEASES[i - 1].version, r.version) > 0, 'releases are ordered newest first');
}
ok(RELEASES.some((r) => r.version === '2.0.0' && /3D/i.test(r.title)), '2.0.0 remains the 3D Studio major release');
const primeLaunch = RELEASES.find((release) => release.version === '7.0.0');
ok(!!primeLaunch && primeLaunch.status !== 'candidate' && primeLaunch.date === '2026-10-11' && PUBLISHED_RELEASES.includes(primeLaunch), 'the verified 7.0.0 Carbon: Prime launch is restored as a published release');
ok(['1.0.0', '2.0.0', '7.0.0'].every((version) => RELEASES.some((release) => release.version === version)), 'About-history copy is grounded in documented 1.0.0, 2.0.0 and 7.0.0 release entries');
ok(!['3.0.0', '4.0.0', '6.0.0', '7.0.0cp'].some((version) => RELEASES.some((release) => release.version === version)), 'unverified major versions and the About-only cp label are not promoted as release IDs');
ok(!RELEASES.some((release) => /spice candidate/i.test(release.title + release.summary)), 'no unsupported Spice Candidate history is invented');
ok(PUBLISHED_RELEASES.length > 0 && PUBLISHED_RELEASES.every((release) => release.status !== 'candidate'), 'Latest Patches data excludes unpublished source candidates');
ok(RELEASES.includes(first!) && first!.status === 'candidate', 'unpublished candidates remain in the complete update archive rather than being deleted');

// ---------------------------------------------------------------- Windows Theme Studio data, contrast and inert JSON
section('Windows Theme Studio registry, accessibility checks and safe JSON transfer');
ok(BUILT_IN_THEMES.length >= 30, 'Theme Studio provides at least 30 built-in themes');
eq(BUILT_IN_THEMES.length, 40, 'the registry contains 40 curated built-in palettes');
eq(THEME_TOKEN_KEYS.length, 25, 'every theme defines the complete shared UI token set');
eq(new Set(BUILT_IN_THEMES.map((theme) => theme.id)).size, BUILT_IN_THEMES.length, 'built-in theme IDs are unique');
eq(new Set(BUILT_IN_THEMES.map((theme) => JSON.stringify(theme.tokens))).size, BUILT_IN_THEMES.length, 'each built-in theme has a distinct complete palette');
for (const category of THEME_CATEGORIES.filter((item) => item !== 'All' && item !== 'Custom')) {
  ok(BUILT_IN_THEMES.some((theme) => theme.category === category), `${category} has built-in themes`);
}
for (const theme of BUILT_IN_THEMES) {
  const checked = validateThemeSpec(themeToSpec(theme));
  ok(checked.ok, `${theme.name} satisfies strict data and WCAG contrast rules`);
  if (checked.ok) eq(checked.value.tokens, theme.tokens, `${theme.name} round-trips the complete supported HEX token set`);
}
ok(['graphite', 'forest', 'ocean-depth', 'ember', 'lavender', 'high-contrast-light', 'high-contrast-dark'].every((id) => BUILT_IN_THEMES.some((theme) => theme.id === id)), 'existing theme IDs remain available and both contrast themes are present');
const primeThemeSpec = themeToSpec(BUILT_IN_THEMES[0]);
eq(BUILT_IN_THEMES[0].id, DEFAULT_THEME_ID, 'Carbon Prime remains the default theme');
const customSpec = { ...themeToSpec(BUILT_IN_THEMES[1]), name: 'Local Study', description: 'A locally saved theme.' };
const customTheme = createCustomTheme(customSpec, [DEFAULT_THEME_ID]);
ok(validateCustomTheme(customTheme).ok && customTheme.category === 'Custom', 'custom theme definitions use a safe unique local identity');
const themeCopy = createCustomTheme({ ...customSpec, name: 'Local Study Copy' }, [DEFAULT_THEME_ID, customTheme.id]);
ok(themeCopy.id !== customTheme.id && JSON.stringify(themeCopy.tokens) === JSON.stringify(customTheme.tokens), 'theme duplication produces an independent editable identity without changing the source palette');
const validThemeBundle = exportThemeBundle([BUILT_IN_THEMES[0], customTheme]);
const allBuiltInThemeBundle = exportThemeBundle(BUILT_IN_THEMES);
ok(new TextEncoder().encode(allBuiltInThemeBundle).byteLength <= MAX_THEME_BUNDLE_BYTES, 'the complete built-in collection exports within the bounded bundle size');
ok(parseThemeBundleText(allBuiltInThemeBundle).ok, 'all built-in palettes are importable together in one validated bundle');
ok(MAX_IMPORTED_THEMES >= BUILT_IN_THEMES.length, 'the import-count limit supports a complete built-in bundle');
const parsedThemeBundle = parseThemeBundleText(validThemeBundle);
ok(parsedThemeBundle.ok, 'an exported theme bundle passes strict import validation');
if (parsedThemeBundle.ok) {
  eq(parsedThemeBundle.value.length, 2, 'theme export/import preserves both selected entries');
  eq(parsedThemeBundle.value[0], primeThemeSpec, 'theme bundle round-trip preserves name, mode and all tokens');
}
eq(JSON.parse(validThemeBundle).format, THEME_BUNDLE_FORMAT, 'theme JSON is explicitly namespaced');
eq(JSON.parse(validThemeBundle).version, THEME_BUNDLE_VERSION, 'theme JSON emits the current schema version');
const legacyBundle = JSON.parse(validThemeBundle);
legacyBundle.version = 1;
legacyBundle.themes[0].tokens = Object.fromEntries(LEGACY_THEME_TOKEN_KEYS.map((key) => [key, primeThemeSpec.tokens[key]]));
const migratedBundle = parseThemeBundleText(JSON.stringify(legacyBundle));
ok(migratedBundle.ok, 'previously exported v1 theme JSON remains importable');
if (migratedBundle.ok) eq(migratedBundle.value[0].tokens, primeThemeSpec.tokens, 'v1 themes migrate legacy colors into the full semantic token model');
const legacyStoredTheme = { ...customTheme, tokens: Object.fromEntries(LEGACY_THEME_TOKEN_KEYS.map((key) => [key, customTheme.tokens[key]])) };
const migratedPreferences = sanitizeThemePreferences({ activeThemeId: customTheme.id, customThemes: [legacyStoredTheme] });
eq(migratedPreferences.activeThemeId, customTheme.id, 'v1 local preferences preserve their selected custom theme');
eq(Object.keys(migratedPreferences.customThemes[0].tokens).length, THEME_TOKEN_KEYS.length, 'v1 local custom themes upgrade to all UI tokens');
const injectionBundle = JSON.parse(validThemeBundle);
injectionBundle.themes[0].tokens.accent = 'red; background:url(https://example.invalid)';
ok(!parseThemeBundleText(JSON.stringify(injectionBundle)).ok, 'CSS, URLs and non-HEX color payloads are rejected as inert data');
const markupBundle = JSON.parse(validThemeBundle);
markupBundle.themes[0].name = '<script>alert(1)</script>';
ok(!parseThemeBundleText(JSON.stringify(markupBundle)).ok, 'HTML-like theme names are rejected as plain text');
const extraFieldBundle = JSON.parse(validThemeBundle);
extraFieldBundle.script = 'alert(1)';
ok(!parseThemeBundleText(JSON.stringify(extraFieldBundle)).ok, 'unknown theme bundle fields are rejected');
ok(!validateThemeSpec({ ...primeThemeSpec, script: 'alert(1)' }).ok, 'theme editor data rejects executable/unknown properties');
ok(!parseThemeBundleText(' '.repeat(MAX_THEME_BUNDLE_BYTES + 1)).ok, 'oversized theme files are rejected before JSON parsing');
const lowContrastTheme = { ...primeThemeSpec, tokens: { ...primeThemeSpec.tokens, text: primeThemeSpec.tokens.background } };
ok(!validateThemeSpec(lowContrastTheme).ok, 'themes that fail accessible text contrast are rejected');
const lowFocusTheme = { ...primeThemeSpec, tokens: { ...primeThemeSpec.tokens, focus: primeThemeSpec.tokens.background } };
ok(!validateThemeSpec(lowFocusTheme).ok, 'themes with an invisible keyboard-focus color are rejected');
const lowSelectionTheme = { ...primeThemeSpec, tokens: { ...primeThemeSpec.tokens, selection: primeThemeSpec.tokens.background } };
ok(!validateThemeSpec(lowSelectionTheme).ok, 'themes with low-contrast selection fills are rejected');
ok(contrastRatio(BUILT_IN_THEMES[0].tokens.text, BUILT_IN_THEMES[0].tokens.surface) >= 4.5, 'the standard text contrast threshold is at least 4.5:1');
const sanitizedThemes = sanitizeThemePreferences({ activeThemeId: customTheme.id, customThemes: [customTheme, customTheme, { ...customTheme, id: 'custom-invalid', tokens: { ...customTheme.tokens, accent: 'url(x)' } }] });
eq(sanitizedThemes.customThemes.length, 1, 'persisted themes are validated and duplicate IDs are removed');
eq(sanitizedThemes.activeThemeId, customTheme.id, 'a valid persisted custom theme remains selected');
eq(sanitizeThemePreferences({ activeThemeId: 'missing', customThemes: [] }).activeThemeId, DEFAULT_THEME_ID, 'an unknown saved theme safely falls back to Carbon Prime');
ok(useThemeStudio.getState().addCustomTheme(customTheme), 'the Windows theme store accepts a validated custom definition');
const savedThemePreferences = JSON.parse(localStorage.getItem('carbon-theme-studio-v1') || 'null');
ok(savedThemePreferences?.state?.customThemes?.some((theme: { id: string }) => theme.id === customTheme.id), 'custom theme definitions persist in the preserved local theme key');
eq(savedThemePreferences?.version, 2, 'local theme preferences are migrated to schema version 2');
eq(savedThemePreferences?.state?.activeThemeId, customTheme.id, 'saving a custom theme persists its immediate active selection');
const updatedCustom = { ...customTheme, name: 'Local Study Revised' };
ok(useThemeStudio.getState().addCustomTheme(updatedCustom), 'saving an existing custom ID edits its local theme rather than creating a duplicate');
eq(useThemeStudio.getState().customThemes.filter((theme) => theme.id === customTheme.id).length, 1, 'editing a custom theme retains exactly one record');
useThemeStudio.getState().deleteCustomTheme(customTheme.id);
const resetThemePreferences = JSON.parse(localStorage.getItem('carbon-theme-studio-v1') || 'null');
eq(resetThemePreferences?.state?.activeThemeId, DEFAULT_THEME_ID, 'deleting the active custom theme safely resets to Carbon Prime');

// ---------------------------------------------------------------- Home beach wave loop
section('Home beach wave loop timing and image-cover alignment');
eq(beachLoopPhase(0), 0, 'beach loop starts at phase zero');
eq(beachLoopPhase(BEACH_LOOP_SECONDS * 1000), 0, 'loop phase resets exactly at its duration');
eq(beachLoopPhase(23_000), beachLoopPhase(9_000), 'loop phase repeats after one complete cycle');
ok(Math.abs(beachSurge(0, 0.37) - beachSurge(1, 0.37)) < 1e-12, 'shore run-up returns to its starting position');
ok(Math.abs(beachSurge(0.999, 0.37) - beachSurge(0.001, 0.37)) < 0.01, 'shore movement remains continuous across the loop seam');
ok(beachSurge(0, 0) >= 0 && beachSurge(0.5, 0) <= 1, 'run-up remains bounded between low and high tide');
eq(BEACH_MAX_DPR, 1.25, 'home canvas caps backing-store pixel ratio for memory use');
const wideBeachCover = coverTransform(1600, 600, 1376, 768, 0.5, 0.35);
ok(Math.abs(wideBeachCover.scale - 1600 / 1376) < 1e-9 && Math.abs(wideBeachCover.y - ((600 - 768 * wideBeachCover.scale) * 0.35)) < 1e-9, 'wave canvas aligns with CSS object-cover on a wide hero');
const tallBeachCover = coverTransform(1000, 800, 1376, 768);
ok(Math.abs(tallBeachCover.scale - 800 / 768) < 1e-9 && Math.abs(tallBeachCover.x - (1000 - 1376 * tallBeachCover.scale) * 0.5) < 1e-9, 'wave canvas aligns with CSS object-cover on a taller hero');

// ---------------------------------------------------------------- Drawing Replay timing, input capture & sizing
section('Drawing Replay timing, terminal samples and conservative sizing');
const replayClock = new Recorder();
replayClock.time = 25;
replayClock.lastWall = 0;
replayClock.idleCap = Number.MAX_SAFE_INTEGER;
eq(replayClock.clockAt(15_000), 15_025, 'replay clock preserves a long real-time pause by default');
replayClock.time = 0;
replayClock.lastWall = 1_000;
replayClock.idleCap = 2_500;
eq(replayClock.clockAt(20_000), 2_500, 'optional pause shortening still respects the configured cap');
const capturedSamples = [10, 20, 0.7, 0, 0, 12];
appendRecordedSample(capturedSamples, [14, 26, 0, 8, -4, 8], true);
eq(capturedSamples.slice(-6), [14, 26, 0.7, 8, -4, 12], 'pointer-up terminal sample keeps time monotonic and avoids zero-pressure taper');
ok(appendRecordedSample(capturedSamples, [14, 26, 0.7, 8, -4, 12]) === false, 'exact duplicate terminal samples are not added');
const estimatedStrokeBytes = eventBytes({ t: 0, c: { k: 'stroke', s: new Array(600).fill(0), brush: {} } as never }, 64, 64);
ok(estimatedStrokeBytes >= 600 * 16, 'stroke sample estimate includes conservative in-memory overhead');
ok(DEFAULT_SETTINGS.compressReplayPauses === false && mergeSettings({}).compressReplayPauses === false, 'pause compression is disabled for new and migrated preferences');
eq(mergeSettings({ compressReplayPauses: true }).compressReplayPauses, true, 'explicit pause-compression choice survives settings migration');
const recordingControls = new DocEngine(16, 16);
recordingControls.startRecording();
ok(recordingControls.rec.enabled && recordingControls.rec.active, 'start enables event capture');
recordingControls.pauseRecording();
ok(recordingControls.rec.enabled && recordingControls.rec.paused && !recordingControls.rec.active, 'pause stops capture without disabling or deleting the replay');
recordingControls.resumeRecording();
ok(recordingControls.rec.active, 'resume restarts capture');
const historyBeforeStop = recordingControls.rec.events.length;
recordingControls.stopRecording();
ok(!recordingControls.rec.enabled && recordingControls.rec.events.length === historyBeforeStop, 'stop disables capture while preserving replay history');
recordingControls.startRecording();
ok(recordingControls.rec.active && recordingControls.rec.events.length > historyBeforeStop, 'recording can be started again and appends a new checkpoint');
recordingControls.clearRecording();
ok(!recordingControls.rec.events.length && !recordingControls.rec.enabled, 'confirmed deletion clears only replay state');

// ---------------------------------------------------------------- 2. Home project finder, preferences & command palette
section('Home project finder, pinning, sorting and command palette search');
const finderEntries = [
  { id: recentPinId('z'), name: 'Zebra Study', savedAt: 100, size: 50, searchText: '1600 1200' },
  { id: recentPinId('a'), name: 'Apple Coast', savedAt: 50, size: 200, searchText: '1200 900' },
  { id: 'device:/CARBON/Lighthouse.carbon', name: 'Lighthouse', savedAt: 300, size: 120, searchText: '/CARBON/Lighthouse.carbon 1600 900' },
];
eq(findProjects(finderEntries, '', [recentPinId('a')], 'recent').map((p) => p.id), [recentPinId('a'), 'device:/CARBON/Lighthouse.carbon', recentPinId('z')], 'pinned projects stay ahead of recency sort');
eq(findProjects(finderEntries, 'coast 1200', [], 'name').map((p) => p.id), [recentPinId('a')], 'project finder applies every search term to name/metadata');
eq(findProjects(finderEntries, '', [], 'name').map((p) => p.name), ['Apple Coast', 'Lighthouse', 'Zebra Study'], 'project finder sorts names naturally');
eq(findProjects(finderEntries, '', [], 'size').map((p) => p.size), [200, 120, 50], 'project finder sorts by file size');
eq(togglePinnedId([recentPinId('a')], recentPinId('z')), [recentPinId('a'), recentPinId('z')], 'pinning adds without losing other projects');
eq(togglePinnedId([recentPinId('a'), recentPinId('z')], recentPinId('a')), [recentPinId('z')], 'unpinning removes only that project');
const paletteEntries = [
  { id: 'surface', title: 'Surface symmetry', category: 'Workspaces', keywords: '3D mirrored radial mesh' },
  { id: 'save', title: 'Save current project', category: 'Actions', keywords: 'local carbon' },
  { id: 'disabled', title: '3D surface options', category: 'Workspaces', keywords: 'mesh', disabled: true },
];
eq(searchPaletteItems(paletteEntries, '3d mesh').map((p) => p.id), ['surface', 'disabled'], 'palette searches actions across label, category and aliases');
eq(firstPaletteSelection(paletteEntries), 0, 'palette initially selects the first enabled result');
eq(nextPaletteSelection(paletteEntries, 0, 1), 1, 'ArrowDown skips disabled commands');
eq(nextPaletteSelection(paletteEntries, 1, 1), 0, 'keyboard selection wraps to the first enabled command');
eq(nextPaletteSelection(paletteEntries, 0, -1), 1, 'ArrowUp wraps to the last enabled command');
eq(DEFAULT_SHORTCUTS['app.commandPalette'], 'ctrl+k', 'command palette has a configurable Ctrl+K shortcut');
const migratedSettings = mergeSettings({ homeSceneEnabled: false, pinnedProjects: ['recent:a', 'recent:a'], homeProjectSort: 'name', quickStartSeen: true, shortcuts: { 'file.save': 'ctrl+alt+s' } });
ok(!migratedSettings.homeSceneEnabled && migratedSettings.quickStartSeen, 'new preferences preserve existing settings values');
eq(migratedSettings.pinnedProjects, ['recent:a'], 'persisted project pins are de-duplicated');
eq(migratedSettings.homeProjectSort, 'name', 'project sort persists in preferences');
eq(migratedSettings.shortcuts['file.save'], 'ctrl+alt+s', 'custom shortcuts are retained');
eq(mergeSettings({}).shortcuts['app.commandPalette'], 'ctrl+k', 'older preference records gain the default palette shortcut');
ok(DEFAULT_SETTINGS.quickStartSeen === false && DEFAULT_SETTINGS.pinnedProjects.length === 0, 'first-run guide and pins start safely for new installs');

// ---------------------------------------------------------------- Document workspace isolation and toast de-duplication
section('Draw / Infinite Painter / Comic / 3D document isolation and duplicate-toast handling');
const typedDocs = [
  { id: 'draw-a' },
  { id: 'infinite-a', infinitePainter: true },
  { id: 'comic-a', comic: { id: 'comic-project' } },
  { id: 'scene-a', scene3d: { version: 1 } },
  { id: 'draw-b' },
];
eq(typedDocs.map(documentWorkspace), ['draw', 'infinite', 'comic', '3d', 'draw'], 'document extensions determine their owning studio');
eq(findWorkspaceDocument(typedDocs, 'draw')?.id, 'draw-a', 'Draw selection never falls through to a specialized document');
eq(findWorkspaceDocument(typedDocs, 'infinite')?.id, 'infinite-a', 'Infinite Painter selects its own independent drawing document');
eq(findWorkspaceDocument(typedDocs, 'comic')?.id, 'comic-a', 'Comic selection returns a document with comic metadata');
eq(findWorkspaceDocument(typedDocs, '3d')?.id, 'scene-a', '3D selection returns a document with scene metadata');
eq(findWorkspaceDocument([], '3d'), null, 'an unavailable studio has no candidate document');
const oneUndoToast = dedupeToastList([{ id: 'toast-1', msg: 'Nothing to undo', kind: 'info' }], { id: 'toast-2', msg: 'Nothing to undo', kind: 'info' });
eq(oneUndoToast.length, 1, 'identical active undo messages do not accumulate');
eq(oneUndoToast[0].id, 'toast-1', 'a duplicate toast refresh keeps the visible toast identity stable');
const distinctToastKinds = dedupeToastList(oneUndoToast, { id: 'toast-error', msg: 'Nothing to undo', kind: 'error' });
eq(distinctToastKinds.length, 2, 'different toast kinds remain distinct');

section('Safe Home waits for saves across Draw, Comic and 3D');
const savedAppState = getApp();
for (const workspace of ['Draw', 'Comic', '3D'] as const) {
  const doc = new DocEngine(16, 16, { name: `${workspace} home-save test` });
  if (workspace === 'Comic') doc.comic = { id: 'comic-home-test', name: 'Comic home test', index: 0, bleed: 0, safe: 0, pageName: 'Page 1' };
  if (workspace === '3D') doc.scene3d = defaultScene();
  doc.dirty = true;
  setApp({ docs: [doc], activeId: doc.id, homeScreen: false, homeSaving: false, dialog: null });
  let saveCalls = 0;
  let resolveSave!: (saved: boolean) => void;
  const pendingSave = new Promise<boolean>((resolve) => { resolveSave = resolve; });
  const navigating = navigateHomeSafely(async () => { saveCalls++; return pendingSave; });
  await Promise.resolve();
  eq(saveCalls, 1, `${workspace} Home calls the active project's save path`);
  ok(!getApp().homeScreen && getApp().homeSaving, `${workspace} stays in the editor while saving is pending`);
  resolveSave(true);
  ok(await navigating, `${workspace} Home proceeds only after a successful save`);
  ok(getApp().homeScreen && !getApp().homeSaving, `${workspace} Home completes and clears its saving state`);

  doc.dirty = true;
  setApp({ homeScreen: false, homeSaving: false, activeId: doc.id });
  const failed = await navigateHomeSafely(async () => false);
  ok(!failed && !getApp().homeScreen && !getApp().homeSaving, `${workspace} canceled/failed save keeps the editor open`);
}
setApp(savedAppState);

// ---------------------------------------------------------------- 3. About identity and supplied copy
section('About / Project Information copy');
eq(ABOUT_CREATOR, '© Ejhay Claus B. Predonio', 'creator credit is exact');
eq(ABOUT_PROJECT_COPY, `This Project lasted 5 years to create. If you're reading this, it might be the final updated version, or I'll fix it if there's any bugs, or more features to add in the future.

I'm a solo Developer who created Carbon: Prime. It has been distributed to Android devices such as tablets and etc., Windows support, and more in the future.

About the Carbon${'  '}
This app was created in Scratch, with 0 Budget, and with only a small compiler, and of course an Acer Laptop.

Performance${'  '}
The performance of Carbon is based on your Hardware's performance.

Android version${'  '}
On Android version (Tablets) it supports all features, and of course based on its hardware performance.

Windows version${'  '}
It supports all Features in Windows, and also based on the hardware (Windows) performance.

Other Projects Created${'  '}
O.R.V.Y.N, Folian, Carbon: Flux, Purge, Basalt, MyClassmate, and more.

© Ejhay Claus B. Predonio`, 'About copy keeps the supplied wording, headings and paragraph breaks exactly');

section('Offline quick-start sample safety and editability');
const untouchedDoc = new DocEngine(48, 48, { name: 'User work - preserve me' });
const untouchedLayerIds = untouchedDoc.layers.map((layer) => layer.id);
const sampleOne = buildQuickStartSample();
const sampleTwo = buildQuickStartSample();
ok(sampleOne !== sampleTwo && sampleOne.id !== sampleTwo.id, 'each sample launch constructs a fresh document');
eq(sampleOne.name, 'CARBON Quick Start Sample', 'sample has a clear identifying project name');
eq([sampleOne.width, sampleOne.height], [1200, 900], 'sample uses a modest canvas size');
eq(sampleOne.layers.map((layer) => layer.type), ['raster', 'raster', 'ink'], 'sample separates paint and editable ink into three layers');
eq(sampleOne.layers.map((layer) => layer.name), ['Sky and turquoise water', 'Island, lighthouse and palms', 'Crisp Ink details'], 'sample layers are named for practice');
ok((sampleOne.layers[2].strokes?.length || 0) >= 8, 'sample contains editable Crisp Ink strokes');
ok(!sampleOne.dirty && sampleOne.fileName === null && sampleOne.fileHandle === null, 'sample starts unsaved without targeting or overwriting a file');
eq(untouchedDoc.name, 'User work - preserve me', 'building the sample never renames an existing document');
eq(untouchedDoc.layers.map((layer) => layer.id), untouchedLayerIds, 'building the sample never mutates existing user layers');

// ---------------------------------------------------------------- 3. Stable guide planes and clean spatial environment
section('3D stable guides & clean environment');
const fresh = defaultScene();
eq(fresh.ground, false, 'new scenes do not create a floor mesh');
eq(fresh.objects.length, 0, 'new scenes are empty (no decorative starter cube)');
eq(fresh.guides, [], 'new scenes wait for the first guide-creating gesture');
eq(fresh.activeGuideId, null, 'new scenes start without an active guide');
eq(fresh.grid, false, 'new drawing scenes keep the editor grid off');
eq(fresh.axes, false, 'new drawing scenes keep the editor axes off');
eq(fresh.bg, '#c5c9cf', 'new scenes use a neutral backdrop distinct from drawing guides');
ok(fresh.ground === false && fresh.bg === '#c5c9cf', 'neutral backdrop uses no physical ground mesh or arbitrary edge');
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
camera.position.set(4, 3, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
const guide = createViewGuide(camera, [0, 0, 0], 'Test guide', 'g-test');
const savedGuide = structuredClone(guide);
camera.position.set(-9, 12, 4); camera.lookAt(3, 1, -2); camera.updateMatrixWorld(true);
eq(guide, savedGuide, 'guide origin and orientation are frozen when the camera later navigates');
const frame3d = guideFrame(guide);
const sampleWorld = guideWorldPoint(guide, [1.25, -2.5, 0]);
const sampleLocal = guideLocalPoint(guide, sampleWorld);
ok(Math.abs(sampleLocal[0] - 1.25) < 1e-9 && Math.abs(sampleLocal[1] + 2.5) < 1e-9 && Math.abs(sampleLocal[2]) < 1e-9, 'world-to-guide conversion preserves stable local stroke coordinates');
const localStroke = localizeGuideStroke(guide, [...sampleWorld, ...guideWorldPoint(guide, [2, -1, 0])]);
eq(localStroke.length, 6, 'guide-local stroke conversion keeps complete XYZ triples');
ok(Math.abs(localStroke[2]) < 1e-9 && Math.abs(localStroke[5]) < 1e-9, 'points on a guide are stored on local z=0');
const guideRoot = new THREE.Group();
const guideTransformMap = buildGuideGroups([guide], guide.id, false);
guideTransformMap.forEach((group) => guideRoot.add(group));
const attachedStroke = new THREE.Group();
attachHierarchy([{ id: 'guide-stroke', guideId: guide.id } as never], new Map([['guide-stroke', attachedStroke]]), guideRoot, guideTransformMap);
guideRoot.updateMatrixWorld(true);
const restoredStrokePoint = attachedStroke.localToWorld(new THREE.Vector3(...localStroke.slice(0, 3)));
ok(restoredStrokePoint.distanceTo(new THREE.Vector3(...sampleWorld)) < 1e-8, 'guide-local artwork follows its immutable world-space transform');
const guidePlaneTest = guidePlane(guide);
const guideRayHit = intersectDrawPlane(new THREE.Ray(new THREE.Vector3(...guide.origin).addScaledVector(frame3d.normal, 2), frame3d.normal.clone().negate()), guidePlaneTest);
ok(!!guideRayHit && guideRayHit.distanceTo(new THREE.Vector3(...guide.origin)) < 1e-8, 'camera rays map to the exact saved guide plane');
eq(intersectDrawPlane(new THREE.Ray(new THREE.Vector3(...guide.origin), frame3d.right), guidePlaneTest), null, 'parallel rays do not invent a guide coordinate');
const guideGroups = buildGuideGroups([{ ...guide, visible: false }], null, true);
const guideGroup = guideGroups.get(guide.id)!;
ok(guideGroup.visible && guideGroup.children[0]?.visible === false, 'hiding a guide surface does not hide its attached artwork group');
const guidesOnly = buildGuideGroups([guide], guide.id, false);
eq(guidesOnly.get(guide.id)?.children.length, 0, 'headless export guide transforms exclude editor visuals');
const savedGuideScene = defaultScene();
savedGuideScene.guides = [structuredClone(guide)]; savedGuideScene.activeGuideId = guide.id;
savedGuideScene.objects.push({
  id: 'saved-guide-stroke', name: 'Saved guide stroke', kind: 'curve', guideId: guide.id, pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], visible: true,
  mat: { color: '#123456', roughness: 0.7, metalness: 0, opacity: 1 },
  curve: { pts: localStroke, type: 'catmull', closed: false, geo: 'ribbon', thickness: 0.04, width: 0.04, segments: 32, radial: 10, normal: [0, 0, 1] },
});
const guideDoc = new DocEngine(24, 24, { blank: true });
const guideDocLayer = guideDoc.makeLayer('ink', 'Editable layer');
guideDoc.layers = [guideDocLayer]; guideDoc.activeLayerId = guideDocLayer.id;
guideDoc.scene3d = savedGuideScene;
const guideRoundTrip = await deserializeDoc(await serializeDoc(guideDoc));
const reopenedGuideScene = sceneOf(guideRoundTrip.scene3d);
eq(reopenedGuideScene.guides?.[0], guide, 'guide frame and visibility survive editable .carbon save/reopen');
eq(reopenedGuideScene.activeGuideId, guide.id, 'active guide selection survives .carbon save/reopen');
eq(reopenedGuideScene.objects[0].guideId, guide.id, 'saved stroke remains attached to its guide after reopen');
eq(reopenedGuideScene.objects[0].curve?.pts, localStroke, 'guide-local stroke points remain editable after reopen');
eq(pressureFromPointer('pen', 0), 0.08, 'pen pointer with transient zero pressure receives the small native fallback');
eq(pressureFromPointer('pen', 0.65), 0.65, 'pen pressure is clamped and preserved');
eq(pressureFromPointer('touch', 0.4), 0.4, 'supported touch pressure is preserved');
eq(pressureFromPointer('mouse', 0.3), 1, 'mouse pressure is full-width rather than fabricated');
const dabLoop = planarLoop([2, 3, 4], [0, 0, 1], 0.25, 24);
eq(dabLoop.length, 72, 'single brush taps can form a closed flat editable dab');
ok(Math.abs(Math.hypot(dabLoop[0] - 2, dabLoop[1] - 3) - 0.25) < 1e-9, 'flat dab loop has the requested radius');
const loopClosed = close3DStroke([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0], [0.1, 0.2, 0.3, 0.4]);
ok(loopClosed.closed, 'closed circle gesture becomes an explicitly closed spline');
eq(loopClosed.pts.length, 9, 'duplicate closure control point is removed so the spline closes without a seam');
eq(loopClosed.pressures.length, 3, 'closed spline pressure samples stay aligned with unique control points');

const legacy = sceneOf({
  version: 1, bg: '#26262b', ambient: 0.5,
  lights: [], grid: true, axes: true, gridSize: 0.25, snap: false, ortho: false,
  objects: [{ id: 'o1', kind: 'sphere', pos: [1, 2, 3] }], draw: { mode: 'xz', offset: 0.5, pos: [0, 0, 0], rot: [0, 0, 0] },
  sym: { mirror: { x: true, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] }, views: [],
} as never);
eq(legacy.objects.length, 1, 'legacy scene keeps its objects');
eq(legacy.objects[0].pos, [1, 2, 3], 'legacy stroke coordinates untouched');
eq(legacy.ground, false, 'legacy scene does not migrate a giant floor mesh');
eq(legacy.guides?.length, 1, 'legacy drawing settings migrate to one reusable guide');
eq(legacy.guides?.[0].origin, [0, 0.5, 0], 'legacy drawing-guide offset is preserved');
eq(legacy.bg, '#26262b', 'legacy background preserved');
eq(legacy.draw.offset, 0.5, 'legacy draw plane remains readable for older versions');
const legacyCamera: CamView = { pos: [0, 0, 10], target: [0, 0, 0], ortho: false, zoom: 1, fov: 45 };
const legacyViewScene = sceneOf({
  version: 1, bg: '#26262b', ambient: 0.5, lights: [], objects: [], grid: false, axes: false, gridSize: 0.25, snap: false, ortho: false,
  draw: { mode: 'view', offset: 2, pos: [0, 0, 0], rot: [0, 0, 0] }, sym: { mirror: { x: false, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] }, views: [], camera: legacyCamera,
} as never);
eq(legacyViewScene.guides?.[0].origin, [0, 0, -2], 'legacy view-guide offset preserves the saved forward camera direction');
const unsafeRibbonScene = sceneOf({
  ...defaultScene(),
  objects: [{
    id: 'unsafe-ribbon', name: 'Imported ribbon', kind: 'curve', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], visible: true,
    mat: { color: '#222222', roughness: 0.7, metalness: 0, opacity: 1 },
    curve: { pts: [0, 0, 0, 1, 0, 0], type: 'poly', closed: false, geo: 'ribbon', thickness: 0.08, width: 0.08, segments: 8, radial: 6, normal: [0, 0, 1], pressures: [-2, 3], pressureSize: 4, minSize: -1, brushAsset: '../../outside', brushId: 'b'.repeat(200), brushName: 'n'.repeat(100) },
  }],
} as never);
eq(unsafeRibbonScene.objects[0].curve?.pressures, [0, 1], 'imported pressure values are clamped to a bounded range');
eq(unsafeRibbonScene.objects[0].curve?.pressureSize, 1, 'imported pressure-size settings are clamped');
eq(unsafeRibbonScene.objects[0].curve?.minSize, 0.02, 'imported minimum width is clamped');
eq(unsafeRibbonScene.objects[0].curve?.brushAsset, undefined, 'imported brush asset references reject unsafe path-like IDs');
eq(unsafeRibbonScene.objects[0].curve?.brushId?.length, 128, 'imported brush labels are bounded');
eq(unsafeRibbonScene.objects[0].curve?.brushName?.length, 80, 'imported brush names are bounded');

const v20 = sceneOf({ version: 1, bg: '#111', ambient: 1, lights: [], objects: [], grid: true, axes: true, plane: 'xy', planeOffset: 0.5, symmetry: true, snap: false, gridSize: 0.25, ortho: false } as never);
eq(v20.draw.mode, 'xy', '2.0 plane field migrates into draw.mode');
eq(v20.sym.mirror.x, true, '2.0 symmetry field migrates');
eq(v20.guides?.[0].normal, [0, 0, 1], 'legacy XY drawing plane migrates to a front-facing guide');
eq(sceneOf(null).objects.length, 0, 'null scene data falls back to the default scene');

section('Truthful SVG vector paths and raster fallback');
const svgStroke = { id: 'ink-vector', pts: [4, 8, 1, 14, 4, 0.55, 26, 10, 0.9], color: '#123456', size: 5, opacity: 0.7, taperStart: 0.25, taperEnd: 0.2 };
const svgPath = inkStrokeSvgPath(svgStroke);
ok(svgPath.startsWith('M') && svgPath.endsWith('Z') && svgPath.includes('L'), 'Crisp Ink exports a closed variable-width outline path, not a centerline imitation');
const dabPath = inkStrokeSvgPath({ ...svgStroke, pts: [8, 9, 1], taperStart: 0, taperEnd: 0 });
ok(dabPath.startsWith('M') && dabPath.includes('A') && dabPath.endsWith('Z'), 'single-point brush dabs export as vector arcs');
const vectorDoc = new DocEngine(64, 48, { blank: true, background: null });
const vectorLayer = vectorDoc.makeLayer('ink', 'Editable ink');
vectorLayer.strokes = [svgStroke];
vectorDoc.layers = [vectorLayer];
const vectorSvg = buildDocumentSvg(vectorDoc, 2, true);
eq(vectorSvg.vectorPaths, 1, 'supported Crisp Ink content is exported as one real SVG path');
eq(vectorSvg.rasterLayers, 0, 'pure ink export has no raster substitute');
ok(vectorSvg.markup.includes('<path') && !vectorSvg.markup.includes('<image'), 'pure ink SVG contains path geometry, not an embedded screenshot');
ok(vectorSvg.markup.includes('width="128" height="96"'), 'SVG export scale is represented in output dimensions');
const mixedDoc = new DocEngine(32, 24, { blank: true, background: '#ffffff' });
const rasterLayer = mixedDoc.makeLayer('raster', 'Paint');
const mixedInk = mixedDoc.makeLayer('ink', 'Ink');
mixedInk.strokes = [svgStroke];
mixedDoc.layers = [rasterLayer, mixedInk];
const mixedSvg = buildDocumentSvg(mixedDoc, 1, false);
eq([mixedSvg.vectorPaths, mixedSvg.rasterLayers, mixedSvg.flattened], [1, 1, false], 'mixed SVG preserves vectors and embeds the unsupported raster layer');
ok(mixedSvg.markup.includes('<image') && mixedSvg.markup.includes('<path'), 'mixed SVG contains distinct raster and vector content');
mixedInk.blend = 'multiply';
const complexSvg = buildDocumentSvg(mixedDoc, 1, false);
ok(complexSvg.flattened && complexSvg.vectorPaths === 0 && complexSvg.markup.includes('<image'), 'nonstandard compositing is truthfully flattened into raster content');

section('3D camera persistence and input ownership');
const cameraDoc = new DocEngine(16, 16);
const cameraScene = defaultScene();
const cameraRevision = cameraDoc.rev;
const cameraView = { pos: [3, 2, 4] as [number, number, number], target: [0, 0.5, 0] as [number, number, number], ortho: true, zoom: 1.4, fov: 52 };
persistSceneCamera(cameraDoc, cameraScene, cameraView);
eq(cameraDoc.scene3d, cameraScene, 'camera update is attached to the active document');
eq(cameraScene.camera, cameraView, 'camera pose and projection are stored in scene data');
ok(cameraDoc.dirty && cameraDoc.rev === cameraRevision + 1, 'camera-only edit marks the project dirty and advances autosave revision');
eq(cameraScene.ortho, true, 'orthographic state is persisted with the camera');

const touchGate = createTouchGestureGate();
ok(!touchGate.down(10), 'first touch remains eligible to draw in a drawing tool');
ok(touchGate.down(11) && touchGate.isNavigationOnly, 'second touch latches the complete gesture to navigation');
ok(touchGate.up(10) && touchGate.isNavigationOnly, 'lifting one finger does not re-enable drawing mid-gesture');
ok(touchGate.up(11) && !touchGate.isNavigationOnly, 'drawing is re-enabled only after every finger is lifted');
ok(!touchGate.down(12), 'a later one-finger gesture can draw normally');
touchGate.up(12);

section('3D surface ray hit and local-space stroke path');
const surface = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
surface.userData.surface = true;
surface.userData.objId = 'surface-box';
surface.position.set(0.2, 0.1, -0.1);
surface.rotation.set(0.08, 0.22, -0.04);
surface.scale.set(1.3, 0.9, 1.1);
surface.updateMatrixWorld(true);
const surfaceCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
surfaceCamera.position.set(0.2, 0.1, 5);
surfaceCamera.lookAt(0.2, 0.1, -0.1);
surfaceCamera.updateMatrixWorld(true);
const surfacePoints: number[] = [];
for (const x of [-0.16, 0.16]) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(x, 0), surfaceCamera);
  const rawHit = ray.intersectObject(surface, false)[0];
  const hit = surfaceHit(ray, [surface], 0.02);
  ok(!!hit && hit.object === surface, `surface drawing ray at x=${x} intersects the editable mesh`);
  if (hit && rawHit?.face) {
    const expectedNormal = rawHit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(surface.matrixWorld));
    ok(hit.normal.distanceTo(expectedNormal) < 1e-9, `surface hit normal is correct under non-uniform object scale at x=${x}`);
    const displacement = hit.point.clone().sub(rawHit.point);
    ok(Math.abs(displacement.dot(expectedNormal) - (0.02 * 0.6 + 0.003)) < 1e-9, `surface stroke offset follows the transformed face normal at x=${x}`);
    surfacePoints.push(hit.point.x, hit.point.y, hit.point.z);
  }
}
const localized = localizeSurfaceStroke(surfacePoints, surface);
const roundTripPoints = applyMat(localized.points, surface.matrixWorld);
const pointError = Math.max(...roundTripPoints.map((v, i) => Math.abs(v - surfacePoints[i])));
ok(pointError < 1e-6, `surface stroke returns to the actual hit positions (max error ${pointError})`);
ok(localized.averageWorldScale > 0 && localized.points.every(Number.isFinite), 'surface stroke width and local points remain valid');
const movedWorld = applyMat(localized.points, new THREE.Matrix4().makeTranslation(1, 0, 0).multiply(surface.matrixWorld));
eq(movedWorld[0] - roundTripPoints[0], 1, 'surface stroke local coordinates follow its target object');
const sourceNormal: [number, number, number] = [0.3, 0.1, Math.sqrt(0.9)];
const localSurfaceNormal = localizeSurfaceNormal(sourceNormal, surface);
const restoredNormal = new THREE.Vector3(...localSurfaceNormal).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(surface.matrixWorld)).normalize();
ok(restoredNormal.distanceTo(new THREE.Vector3(...sourceNormal).normalize()) < 1e-6, 'surface stroke geometry normal converts correctly through a rotated non-uniform target');
const remappedNormal = remapSurfaceNormals([0, 0, 0, 1, 0, 0], [0, 1, 0, 0, 0, 1], [0.5, 0, 0]);
ok(remappedNormal.length === 3 && Math.abs(new THREE.Vector3(...remappedNormal).length() - 1) < 1e-9, 'simplified surface paths retain interpolated unit normals');

const sphereGeo = new THREE.SphereGeometry(1, 64, 32);
const leftSphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial());
leftSphere.position.x = -1.5; leftSphere.userData.surface = true; leftSphere.userData.objId = 'left-sphere'; leftSphere.updateMatrixWorld(true);
const rightSphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial());
rightSphere.position.x = 1.5; rightSphere.userData.surface = true; rightSphere.userData.objId = 'right-sphere'; rightSphere.updateMatrixWorld(true);
const sampleSurfacePoints: number[] = [], sampleSurfaceNormals: number[] = [];
for (const x of [0.24, 0.37, 0.48]) {
  const normal = new THREE.Vector3(x, 0.08, Math.sqrt(1 - x * x - 0.08 * 0.08)).normalize();
  const point = rightSphere.position.clone().add(normal).addScaledVector(normal, 0.02 * 0.6 + 0.003);
  sampleSurfacePoints.push(point.x, point.y, point.z); sampleSurfaceNormals.push(normal.x, normal.y, normal.z);
}
const xMirror = symMatrices({ mirror: { x: true, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] });
const surfaceCopies = projectSurfaceSymmetryPaths(sampleSurfacePoints, sampleSurfaceNormals, xMirror, [leftSphere, rightSphere], 0.02, rightSphere);
eq(surfaceCopies.length, 2, 'surface mirror keeps its source and creates a projected counterpart');
ok(surfaceCopies[1]?.target === leftSphere, 'mirrored surface path attaches to the matching second sphere mesh');
if (surfaceCopies[1]) {
  let maxRadiusError = 0;
  for (let i = 0; i < surfaceCopies[1].points.length; i += 3) {
    const point = new THREE.Vector3(surfaceCopies[1].points[i], surfaceCopies[1].points[i + 1], surfaceCopies[1].points[i + 2]);
    maxRadiusError = Math.max(maxRadiusError, Math.abs(point.distanceTo(leftSphere.position) - (1 + 0.02 * 0.6 + 0.003)));
  }
  ok(maxRadiusError < 0.01, `mirrored path vertices are offset from actual sphere surface (max radius error ${maxRadiusError})`);
  const mirrorLocal = localizeSurfaceStroke(surfaceCopies[1].points, leftSphere);
  const mirrorWorld = applyMat(mirrorLocal.points, leftSphere.matrixWorld);
  ok(Math.max(...mirrorWorld.map((v, i) => Math.abs(v - surfaceCopies[1].points[i]))) < 1e-6, 'projected symmetry copy remains editable in target-local coordinates');
}
const missingSurface = projectSurfaceSymmetryPaths(sampleSurfacePoints, sampleSurfaceNormals, xMirror, [rightSphere], 0.02, rightSphere);
eq(missingSurface.length, 1, 'a symmetry copy without a matching mesh is omitted instead of floating in space');
sphereGeo.dispose();

// ---------------------------------------------------------------- 4. curve & symmetry math
section('3D curve math & symmetry');
const noisy: number[] = [];
for (let i = 0; i < 50; i++) noisy.push(i, Math.sin(i * 0.2) * 0.01, 0);
noisy.push(49, 0.005, 0);
const simp = simplify3(noisy, 0.02);
ok(simp[0] === noisy[0] && simp[1] === noisy[1], 'simplify keeps the first point');
const n = simp.length / 3;
ok(simp[(n - 1) * 3] === noisy[(noisy.length / 3 - 1) * 3], 'simplify keeps the last point');
ok(simp.length < noisy.length, 'simplify reduces collinear/noise points');
eq(simplify3([0, 0, 0, 1, 1, 1], 1), [0, 0, 0, 1, 1, 1], 'simplify keeps 2-point strokes');
const pressureSimplified = simplify3WithPressures([0, 0, 0, 1, 0.2, 0, 2, 0.1, 0, 3, 0, 0], [0.1, 0.9, 0.5, 1], 0.05);
eq(pressureSimplified.pressures.length, pressureSimplified.pts.length / 3, 'pressure samples stay aligned with simplified 3D stroke points');
eq([pressureSimplified.pressures[0], pressureSimplified.pressures[pressureSimplified.pressures.length - 1]], [0.1, 1], 'pressure simplification keeps the endpoint values');
ok(pressureSimplified.pts.length < 12 && pressureSimplified.pressures.includes(0.9), 'pressure simplification drops straight points without erasing meaningful width variation');
const pressureRibbon = curveGeometry({
  pts: [0, 0, 0, 1, 0, 0], type: 'poly', closed: false, geo: 'ribbon', thickness: 0.02, width: 1, segments: 8, radial: 6,
  normal: [0, 0, 1], pressures: [0, 1], pressureSize: 1, minSize: 0.1, taper: 0,
});
const ribbonPositions = pressureRibbon.getAttribute('position');
const firstRibbonWidth = new THREE.Vector3().fromBufferAttribute(ribbonPositions, 0).distanceTo(new THREE.Vector3().fromBufferAttribute(ribbonPositions, 1));
const lastRibbonWidth = new THREE.Vector3().fromBufferAttribute(ribbonPositions, ribbonPositions.count - 2).distanceTo(new THREE.Vector3().fromBufferAttribute(ribbonPositions, ribbonPositions.count - 1));
ok(Math.abs(firstRibbonWidth - 0.1) < 0.01 && Math.abs(lastRibbonWidth - 1) < 0.01, 'ribbon mesh converts pen pressure into real variable width');
eq(pressureRibbon.getAttribute('uv').count, ribbonPositions.count, 'brush ribbons include a UV channel for 2D tip textures');
pressureRibbon.dispose();

const smooth = smooth3([0, 0, 0, 1, 5, 0, 2, 0, 0], 3, 0.5);
eq([smooth[0], smooth[1], smooth[2]], [0, 0, 0], 'smoothing fixes the first endpoint');
eq([smooth[6], smooth[7], smooth[8]], [2, 0, 0], 'smoothing fixes the last endpoint');

const path = curvePath({ pts: [0, 0, 0, 1, 1, 0, 2, 0, 0], type: 'catmull', closed: false, geo: 'tube', thickness: 0.02, width: 0.08, segments: 32, radial: 8, normal: [0, 1, 0] });
ok(Number.isFinite(path.getPointAt(0.5).x), 'curvePath evaluates finite points');

eq(symMatrices({ mirror: { x: false, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] }).length, 1, 'no symmetry = identity only');
eq(symMatrices({ mirror: { x: true, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] }).length, 2, 'mirror X doubles');
eq(symMatrices({ mirror: { x: true, y: true, z: true }, radial: 1, axis: 'y', center: [0, 0, 0] }).length, 8, '3 mirrors = 8 copies');
eq(symMatrices({ mirror: { x: false, y: false, z: false }, radial: 6, axis: 'y', center: [0, 0, 0] }).length, 6, 'radial 6 = 6 copies');
eq(symMatrices({ mirror: { x: true, y: false, z: false }, radial: 4, axis: 'y', center: [0, 0, 0] }).length, 8, 'mirror × radial 4 = 8 copies');
const mirrored = applyMat([3, 0, 0], symMatrices({ mirror: { x: true, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] })[1]);
eq(mirrored, [-3, 0, 0], 'mirror X negates world X through the center');

// ---------------------------------------------------------------- 4. brush library
section('Brush engine presets');
const presets = buildPresets();
ok(presets.length >= 100, `brush library is large (${presets.length} presets)`);
ok(new Set(presets.map((p) => p.id)).size === presets.length, 'preset ids are unique');
ok(new Set(presets.map(brushFingerprint)).size === presets.length, 'every preset is visually distinct (fingerprint)');
const cats = new Set(presets.map((p) => p.category));
for (const need of ['Graphite', 'Ink', 'Watercolor', 'Pastel', 'Marker', 'Paint', 'Airbrush', 'Texture', 'Blending', 'Eraser']) {
  ok([...cats].some((c) => c.toLowerCase().includes(need.toLowerCase())), `category covers ${need}`);
}
for (const want of ['pencil-hb', 'pencil-2b', 'ink-fine', 'wc-transparent', 'oil-paint', 'crisp-liner']) {
  if (presets.some((p) => p.id === want)) pass++; else console.log(`  · optional preset ${want} renamed/absent (informational)`);
}
ok(presets.every((p) => p.size > 0 && p.opacity > 0 && p.flow > 0), 'preset basics are in range');

// ---------------------------------------------------------------- 5. color math
section('Color system math');
eq(hexToRgb('#ff8000'), [255, 128, 0], 'hexToRgb');
eq(rgbToHex(255, 128, 0), '#ff8000', 'rgbToHex');
ok(isHex('#ff8000') && isHex('f80') && !isHex('#ff80'), 'isHex accepts 3/6-digit and rejects others');
eq(normHex('#FF8000'), '#ff8000', 'normHex lowercases');
eq(normHex('f80'), '#ff8800', 'normHex expands 3-digit');
eq(rgbToHsv(255, 0, 0), [0, 1, 1], 'pure red HSV');
eq(hsvToRgb(0, 1, 1), [255, 0, 0], 'HSV → RGB pure red');
for (const hex of ['#1d1d1f', '#e8913a', '#3f9db8', '#12506e', '#ffffff']) {
  const [h, s, v] = hexToHsv(hex);
  eq(hsvToHex(h, s, v), normHex(hex), `HSV round-trip ${hex}`);
}
eq(clamp(5, 0, 1), 1, 'clamp upper');
eq(clamp(-5, 0, 1), 0, 'clamp lower');

// ---------------------------------------------------------------- 6. comic layout
section('Comic page model');
const page = { w: 1988, h: 3056, bleed: 38, safe: 75 };
for (const l of LAYOUTS) {
  const panels = layoutPanels(l.id, page, 30);
  if (l.id !== 'blank') ok(panels.length >= 1, `layout ${l.id} produces panels`); // 'blank' is intentionally empty (freeform)
  else ok(panels.length === 0, 'blank layout starts empty');
  for (const p of panels) {
    // panels are quads: pts = [x0,y0, x1,y0, x1,y1, x0,y1]
    const xs = p.pts.filter((_, i) => i % 2 === 0), ys = p.pts.filter((_, i) => i % 2 === 1);
    ok(Math.min(...xs) >= 0 && Math.min(...ys) >= 0 && Math.max(...xs) <= page.w && Math.max(...ys) <= page.h, `layout ${l.id} panel stays inside the page`);
    ok(p.pts.length === 8 && p.type === 'panel', `layout ${l.id} panel is an editable quad`);
  }
}
ok(PAGE_PRESETS.every((p) => p.w > 0 && p.h > 0), 'page presets have dimensions');

// ---------------------------------------------------------------- 8. Android project replacement integrity
section('Android verified project replacement and rollback');
class MemoryProjectFs implements ProjectFileSystem {
  files = new Map<string, string>();
  failWritePaths = new Set<string>();
  partialWritePaths = new Set<string>();
  failRename: ((from: string, to: string) => boolean) | null = null;
  async writeFile({ path, data }: Parameters<ProjectFileSystem['writeFile']>[0]) {
    if (this.partialWritePaths.has(path)) { this.files.set(path, data.slice(0, 4)); throw new Error('simulated interrupted storage write'); }
    if (this.failWritePaths.has(path)) throw new Error('simulated storage write failure');
    this.files.set(path, data);
  }
  async readFile({ path }: Parameters<ProjectFileSystem['readFile']>[0]) {
    const data = this.files.get(path);
    if (data === undefined) throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
    return { data };
  }
  async stat({ path }: Parameters<ProjectFileSystem['stat']>[0]) {
    const data = this.files.get(path);
    if (data === undefined) throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
    return { size: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).length };
  }
  async rename({ from, to }: Parameters<ProjectFileSystem['rename']>[0]) {
    if (this.failRename?.(from, to)) throw new Error('simulated rename failure');
    const data = this.files.get(from);
    if (data === undefined) throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
    if (this.files.has(to)) throw new Error('Destination already exists');
    this.files.set(to, data);
    this.files.delete(from);
  }
  async deleteFile({ path }: Parameters<ProjectFileSystem['deleteFile']>[0]) {
    if (!this.files.delete(path)) throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
  }
}
const writePaths = { directory: 'Documents/CARBON', path: 'Documents/CARBON/Sketch.carbon', temporaryPath: 'Documents/CARBON/.Sketch.tmp', backupPath: 'Documents/CARBON/.Sketch.bak' };
const newProjectData = btoa('new verified drawing');
const newProjectSize = new TextEncoder().encode('new verified drawing').length;
const oldProjectData = btoa('previous safe drawing');
const oldProjectText = 'previous safe drawing';

const atomicFs = new MemoryProjectFs();
atomicFs.files.set(writePaths.path, oldProjectData);
await replaceProjectFile(atomicFs, { ...writePaths, data: newProjectData, expectedSize: newProjectSize });
eq(atob(atomicFs.files.get(writePaths.path)!), 'new verified drawing', 'successful replacement installs the verified new bytes');
ok(!atomicFs.files.has(writePaths.temporaryPath) && !atomicFs.files.has(writePaths.backupPath), 'successful replacement cleans staging and backup files');

const partialStageFs = new MemoryProjectFs();
partialStageFs.files.set(writePaths.path, oldProjectData);
partialStageFs.partialWritePaths.add(writePaths.temporaryPath);
await rejects(() => replaceProjectFile(partialStageFs, { ...writePaths, data: newProjectData, expectedSize: newProjectSize }), 'interrupted staging write reports failure');
eq(atob(partialStageFs.files.get(writePaths.path)!), oldProjectText, 'failed staging does not touch the existing project');
ok(!partialStageFs.files.has(writePaths.temporaryPath) && !partialStageFs.files.has(writePaths.backupPath), 'partial staging file is cleaned after write failure');

const fallbackFs = new MemoryProjectFs();
fallbackFs.files.set(writePaths.path, oldProjectData);
fallbackFs.failRename = () => true;
await replaceProjectFile(fallbackFs, { ...writePaths, data: newProjectData, expectedSize: newProjectSize });
eq(atob(fallbackFs.files.get(writePaths.path)!), 'new verified drawing', 'rename-limited storage uses a verified rollback copy before direct write');
ok(!fallbackFs.files.has(writePaths.backupPath), 'verified fallback removes its recovery copy only after final verification');

const rollbackFs = new MemoryProjectFs();
rollbackFs.files.set(writePaths.path, oldProjectData);
rollbackFs.failRename = (from) => from === writePaths.temporaryPath;
rollbackFs.failWritePaths.add(writePaths.path);
await rejects(() => replaceProjectFile(rollbackFs, { ...writePaths, data: newProjectData, expectedSize: newProjectSize }), 'failed installation reports failure');
eq(atob(rollbackFs.files.get(writePaths.path)!), oldProjectText, 'failed installation restores the previous project instead of deleting it');
ok(!rollbackFs.files.has(writePaths.backupPath), 'rollback restores the existing project to its original path');

// ---------------------------------------------------------------- 9. Shared asset storage / marketplace guards
section('Shared brush asset storage, size reporting and remote validation');
const assetBrush = buildPresets()[0];
const assetName = 'Remote sketch tools';
const assetCategory = 'Sketching';
const assetId = 'remote-sketch-tools';
const assetJson = exportPack(assetName, [assetBrush], assetId, assetCategory, 2);
const assetBytes = new TextEncoder().encode(assetJson);
eq(DEFAULT_MAX_BRUSH_PACK_BYTES, 100 * 1024 * 1024, 'default import/download limit is 100 MB and configurable');
eq(megabytesToBytes(1.5), 1_572_864, 'asset limits convert MiB to exact bytes');
eq(formatAssetSize(0), '0 B', 'zero-byte assets are formatted honestly');
eq(formatAssetSize(1024), '1.0 KB', 'asset sizes use binary kilobytes');
eq(formatAssetSize(1024 * 1024), '1.0 MB', 'asset sizes use binary megabytes');
const { builtin: _assetBuiltin, ...assetDefinition } = assetBrush;
eq(measureBrushDefinitionBytes(assetBrush), new TextEncoder().encode(JSON.stringify(assetDefinition)).byteLength, 'individual brush definition reports exact UTF-8 JSON bytes');
eq(measureBrushPackBytes({ id: assetId, name: assetName, category: assetCategory, version: 2, brushes: [assetBrush] }), assetBytes.byteLength, 'pack size matches its serialized installed asset');
const importedOnce = parsePack(assetJson, []);
ok(importedOnce.pack.brushes?.[0]?.tags.includes('imported'), 'pack imports are tagged for the Imported Brushes section');
const looseImported = parseBrushImport(exportBrushes([assetBrush]), []);
ok(looseImported.added[0]?.tags.includes('imported'), 'standalone brush imports are tagged for the Imported Brushes section');
const reserialized = exportPack(importedOnce.pack.name, importedOnce.pack.brushes || [], importedOnce.pack.id, importedOnce.pack.category, importedOnce.pack.version);
const importedAgain = parsePack(reserialized, []);
eq(importedAgain.pack.brushes?.map((b) => b.id), importedOnce.pack.brushes?.map((b) => b.id), 'brush IDs remain stable across safe pack store/reload');
const multiImportedPack = { ...importedOnce.pack, brushes: [...(importedOnce.pack.brushes || []), { ...importedOnce.pack.brushes![0], id: 'ip-remote-sketch-tools-extra' }] };
const keptPack = withoutInstalledPackBrush(multiImportedPack, multiImportedPack.brushes[0].id);
eq(keptPack?.brushes?.map((brush) => brush.id), ['ip-remote-sketch-tools-extra'], 'removing one imported brush preserves the rest of its pack');
const keptPackReload = parsePack(exportPack(keptPack!.name, keptPack!.brushes!, keptPack!.id, keptPack!.category, keptPack!.version), []);
eq(keptPackReload.pack.brushes?.map((brush) => brush.id), keptPack?.brushes?.map((brush) => brush.id), 'rewriting a pack after removal preserves remaining imported brush IDs across restart');
eq(withoutInstalledPackBrush(importedOnce.pack, importedOnce.pack.brushes![0].id), null, 'removing the last imported brush marks its empty pack for cleanup');
throws(() => withoutInstalledPackBrush({ ...importedOnce.pack, source: 'catalog' }, importedOnce.pack.brushes![0].id), 'bundled catalog brushes cannot be removed individually');
throws(() => parsePack(assetJson, [], 8), 'pack parser enforces a configurable UTF-8 byte limit');
const unsupportedEngine = JSON.parse(assetJson) as Record<string, unknown>;
unsupportedEngine.engine = ENGINE_VERSION + 1;
throws(() => parsePack(JSON.stringify(unsupportedEngine), []), 'pack parser rejects a newer unsupported brush engine');
const legacyLimits = mergeSettings({ assetMaxDownloadMB: 9000, assetMaxInstallMB: 0 });
eq(legacyLimits.assetMaxDownloadMB, 512, 'download setting is clamped to the 512 MB hard cap');
eq(legacyLimits.assetMaxInstallMB, 1, 'installed storage limit stays at least 1 MB');
eq(mergeSettings({}).assetMaxDownloadMB, 100, 'existing preferences gain the default per-pack limit');
const catalogUrl = 'https://assets.example/catalog.json';
const remoteManifest = {
  format: 'carbon-brush-catalog', version: 1,
  packs: [{
    id: 'remote-sketch-tools', name: assetName, category: assetCategory, version: 2, description: 'Validated test pack.',
    creator: 'Test Studio', license: 'CC0-1.0', featured: true, free: true,
    format: 'carbon-brushpack', engineVersion: ENGINE_VERSION, url: './packs/remote-sketch-tools.carbonpack',
    sizeBytes: assetBytes.byteLength, sha256: 'a'.repeat(64),
  }],
};
const remoteCatalog = parseRemoteAssetCatalog(JSON.stringify(remoteManifest), catalogUrl);
eq(remoteCatalog.length, 1, 'strict remote catalog parser accepts a well-formed entry');
eq(remoteCatalog[0].url, 'https://assets.example/packs/remote-sketch-tools.carbonpack', 'relative pack URLs remain on the configured HTTPS origin');
eq(remoteCatalog[0].creator, 'Test Studio', 'creator metadata is kept when provided');
throws(() => parseRemoteAssetCatalog(JSON.stringify({ ...remoteManifest, packs: [{ ...remoteManifest.packs[0], url: 'https://evil.example/pack.carbonpack' }] }), catalogUrl), 'remote catalog rejects cross-origin pack URLs');
throws(() => parseRemoteAssetCatalog(JSON.stringify(remoteManifest), 'http://assets.example/catalog.json'), 'remote catalog rejects non-HTTPS catalog endpoints');
throws(() => parseRemoteAssetCatalog(JSON.stringify({ ...remoteManifest, packs: [{ ...remoteManifest.packs[0], free: false }] }), catalogUrl), 'unsupported paid packs are not shown as free');
throws(() => parseRemoteAssetCatalog(JSON.stringify({ ...remoteManifest, packs: [{ ...remoteManifest.packs[0], sha256: '' }] }), catalogUrl), 'remote packs require a SHA-256 digest');
const assetDigest = await globalThis.crypto.subtle.digest('SHA-256', assetBytes.slice().buffer);
const assetHash = Array.from(new Uint8Array(assetDigest), (part) => part.toString(16).padStart(2, '0')).join('');
const verifiedRemoteEntry: RemoteBrushPack = { ...remoteCatalog[0], sha256: assetHash };
let transferProgress = 0;
const fakeAssetFetch: typeof fetch = async () => new Response(assetBytes.slice().buffer as ArrayBuffer, { status: 200, headers: { 'content-length': String(assetBytes.byteLength) } });
const verifiedBytes = await downloadRemoteBrushPack(verifiedRemoteEntry, catalogUrl, assetBytes.byteLength, {
  fetcher: fakeAssetFetch, onProgress: ({ loadedBytes }) => { transferProgress = loadedBytes; },
});
eq(verifiedBytes.byteLength, assetBytes.byteLength, 'verified remote downloader returns the declared bytes');
eq(transferProgress, assetBytes.byteLength, 'remote downloader reports real transferred bytes');
await rejects(() => downloadRemoteBrushPack({ ...verifiedRemoteEntry, sha256: '0'.repeat(64) }, catalogUrl, assetBytes.byteLength, { fetcher: fakeAssetFetch }), 'remote downloader rejects a mismatched SHA-256 digest');
await rejects(() => downloadRemoteBrushPack(verifiedRemoteEntry, catalogUrl, assetBytes.byteLength - 1, { fetcher: fakeAssetFetch }), 'remote downloader enforces the configurable download limit before fetching');
const qrPayload = makeBrushQrPayload({ id: 'qr-shared-brush', name: 'Shared Brush', category: 'Sketching', brushes: [assetBrush] });
const qrImport = parseBrushQrPayload(qrPayload, []);
eq(qrImport.pack.name, 'Shared Brush', 'Carbon QR carries safe pack metadata');
eq(qrImport.pack.brushes?.length, 1, 'Carbon QR restores a usable validated brush');
ok(new TextEncoder().encode(qrPayload).byteLength <= MAX_BRUSH_QR_BYTES, 'generated QR payload respects its conservative byte cap');
throws(() => parseBrushQrPayload('https://example.invalid/anything', []), 'QR import never auto-opens arbitrary URLs');
throws(() => makeBrushQrPayload({ id: 'large', name: 'Large QR', category: 'Test', brushes: [assetBrush] }, 10), 'QR creation refuses payloads larger than the encoded-byte budget');
throws(() => makeBrushQrPayload({ id: 'stamped', name: 'Stamp', category: 'Test', brushes: [{ ...assetBrush, stamp: 'data:image/png;base64,AA==' }] }), 'QR creation refuses to omit or truncate embedded stamp artwork');

// ---------------------------------------------------------------- 10. .carbon archive guards
section('.carbon file guards');
eq(MIME, 'application/x-carbon', 'format MIME');
eq(FORMAT_VERSION, 1, 'format version');
throws(() => verifyBytes(new Uint8Array([1, 2, 3, 4])), 'verifyBytes rejects non-archive bytes');
throws(() => verifyBytes(new TextEncoder().encode('not a zip at all')), 'verifyBytes rejects text bytes');
ok(!isComicArchive(new Uint8Array(64)), 'isComicArchive rejects empty bytes');
const archiveManifest = {
  format: 'carbon', version: FORMAT_VERSION, name: 'guard-test', width: 16, height: 16, background: '#ffffff',
  activeLayerId: 'L1', layers: [{ id: 'L1', name: 'Paint', type: 'raster', file: 'layers/L1.png' }], assets: [], replay: null,
};
const makeGuardArchive = (manifest: object, extra: Record<string, Uint8Array> = {}) => zipSync({
  'mimetype': strToU8(MIME), 'manifest.json': strToU8(JSON.stringify(manifest)), 'layers/L1.png': new Uint8Array([1, 2, 3]), ...extra,
});
eq(verifyBytes(makeGuardArchive(archiveManifest)).name, 'guard-test', 'well-formed archive references are accepted');
throws(() => verifyBytes(makeGuardArchive({
  ...archiveManifest, layers: [{ ...archiveManifest.layers[0], mask: 'layers/L1.mask.png' }],
})), 'verifyBytes rejects a missing layer-mask file instead of silently dropping it');
throws(() => verifyBytes(makeGuardArchive({
  ...archiveManifest, assets: [{ id: 'ref-1', file: 'assets/ref-1.png', mime: 'image/png' }],
})), 'verifyBytes rejects a missing declared project asset');
throws(() => verifyBytes(makeGuardArchive({
  ...archiveManifest, replay: { file: 'replay/events.json', enabled: true, paused: false, epoch: 0 },
})), 'verifyBytes rejects missing replay data');

section('Custom eraser presets persist separately and remain usable');
const testEraser = { ...assetBrush, id: 'ce-audit-eraser', name: 'Audit eraser tip', builtin: false };
setApp({ customErasers: [testEraser], tool: 'eraser', brushId: 'pencil-hb', eraserBrushId: 'eraser-hard' });
ok(allBrushes(getApp()).some((brush) => brush.id === testEraser.id), 'custom eraser tips are available in the shared brush lookup');
eq(brushById(testEraser.id)?.name, testEraser.name, 'custom eraser tip resolves through the real brush model');
selectBrush(testEraser.id);
eq(getApp().eraserBrushId, testEraser.id, 'selecting a custom eraser while Eraser is active updates its active tip');
updateBrush(testEraser.id, { size: 19 });
eq(getApp().customErasers.find((brush) => brush.id === testEraser.id)?.size, 19, 'custom eraser parameter edits update its persistent preset');
const storedPreferences = JSON.parse(localStorage.getItem('carbon-prefs-v1') || 'null')?.state;
eq(storedPreferences?.customErasers?.[0]?.id, testEraser.id, 'custom eraser list is included in local preference persistence');

// ---------------------------------------------------------------- Windows save serialization and verified atomic writes
section('Windows save serialization, large project writes and failure recovery');
const serialQueue = createSaveQueue();
const serialOrder: string[] = [];
let releaseOldSave: (() => void) | null = null;
let oldSaveStarted = false;
const oldSave = serialQueue('project-a', async () => {
  oldSaveStarted = true;
  await new Promise<void>((resolve) => { releaseOldSave = resolve; });
  serialOrder.push('older commit');
});
while (!oldSaveStarted) await Promise.resolve();
const newerSave = serialQueue('project-a', async () => { serialOrder.push('newer commit'); });
const unrelatedSave = serialQueue('project-b', async () => { serialOrder.push('unrelated project'); });
await unrelatedSave;
eq(serialOrder, ['unrelated project'], 'different projects can save independently while one project is still writing');
releaseOldSave?.();
await Promise.all([oldSave, newerSave]);
eq(serialOrder, ['unrelated project', 'older commit', 'newer commit'], 'same-project saves commit in submission order so an older save cannot land last');

const makeStorePayload = (length: number, seed: number) => {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + seed) & 255;
  return bytes;
};
const atomicRoot = await nodeFs.mkdtemp(nodePath.join(tmpdir(), 'carbon-atomic-save-test-'));
try {
  const projectPath = nodePath.join(atomicRoot, 'large-project.carbon');
  const makePayload = (length: number, seed: number) => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + seed) & 255;
    return bytes;
  };
  const originalBytes = makePayload(2_500_000, 7);
  const replacementBytes = makePayload(4_200_000, 19);
  await atomicWriteFile(projectPath, originalBytes);
  await atomicWriteFile(projectPath, replacementBytes);
  const storedLarge = await nodeFs.readFile(projectPath);
  ok(storedLarge.byteLength === replacementBytes.byteLength && Buffer.compare(storedLarge, Buffer.from(replacementBytes)) === 0, 'repeated multi-megabyte saves install the exact final archive');

  const baseIo = {
    open: nodeFs.open.bind(nodeFs),
    stat: nodeFs.stat.bind(nodeFs),
    rename: nodeFs.rename.bind(nodeFs),
    copyFile: nodeFs.copyFile.bind(nodeFs),
    unlink: nodeFs.unlink.bind(nodeFs),
  };
  const failedStageIo = {
    ...baseIo,
    open: async (file: string, flags: string, mode?: number) => {
      const handle = await nodeFs.open(file, flags, mode);
      if (!file.endsWith('.tmp')) return handle;
      return {
        writeFile: async () => { throw new Error('simulated disk full'); },
        sync: () => handle.sync(),
        close: () => handle.close(),
      };
    },
  } as unknown as typeof nodeFs;
  await rejects(() => atomicWriteFile(projectPath, originalBytes, failedStageIo, nodePath, 'fail-stage'), 'atomic project save reports a simulated staging failure');
  const afterStageFailure = await nodeFs.readFile(projectPath);
  ok(Buffer.compare(afterStageFailure, Buffer.from(replacementBytes)) === 0, 'a failed staged write leaves the previously saved project byte-for-byte intact');

  let failFirstRename = true;
  const renameFallbackIo = {
    ...baseIo,
    rename: async (from: string, to: string) => {
      if (from.endsWith('.tmp') && failFirstRename) {
        failFirstRename = false;
        throw Object.assign(new Error('simulated Windows replace-by-rename refusal'), { code: 'EPERM' });
      }
      await nodeFs.rename(from, to);
    },
  } as unknown as typeof nodeFs;
  await atomicWriteFile(projectPath, originalBytes, renameFallbackIo, nodePath, 'fallback-success');
  const afterFallback = await nodeFs.readFile(projectPath);
  ok(Buffer.compare(afterFallback, Buffer.from(originalBytes)) === 0, 'Windows-compatible rename fallback installs the new verified project');

  const failInstallIo = {
    ...baseIo,
    rename: async (from: string, to: string) => {
      if (from.endsWith('.tmp')) throw Object.assign(new Error('simulated replacement failure'), { code: 'EPERM' });
      await nodeFs.rename(from, to);
    },
  } as unknown as typeof nodeFs;
  await rejects(() => atomicWriteFile(projectPath, replacementBytes, failInstallIo, nodePath, 'fallback-restore'), 'atomic replacement reports a simulated install and rollback path');
  const afterRestoreFailure = await nodeFs.readFile(projectPath);
  ok(Buffer.compare(afterRestoreFailure, Buffer.from(originalBytes)) === 0, 'failed replacement restores the previous valid project from its recovery copy');
  const residue = (await nodeFs.readdir(atomicRoot)).filter((name) => name.endsWith('.tmp') || name.endsWith('.bak'));
  eq(residue, [], 'successful and recoverable failed writes clean up temporary and backup files');
} finally {
  await nodeFs.rm(atomicRoot, { recursive: true, force: true });
}

const libraryRoot = await nodeFs.mkdtemp(nodePath.join(tmpdir(), 'carbon-library-store-test-'));
let failLibraryWrite: 'project' | 'metadata' | null = null;
const testLibraryStore = createLibraryStore({
  rootPath: libraryRoot,
  writeFile: async (destination: string, data: Uint8Array, io: typeof nodeFs, pathApi: typeof nodePath) => {
    if (failLibraryWrite === 'project' && destination.endsWith('.carbon')) {
      failLibraryWrite = null;
      throw new Error('simulated Library disk failure');
    }
    if (failLibraryWrite === 'metadata' && destination.endsWith('roundtrip-project.json')) {
      failLibraryWrite = null;
      throw new Error('simulated Library metadata commit failure');
    }
    return atomicWriteFile(destination, data, io, pathApi);
  },
});
try {
  const archiveA = makeStorePayload(4_200_000, 44);
  const archiveB = makeStorePayload(3_100_000, 91);
  const previewA = makeStorePayload(1_024, 17);
  const previewB = makeStorePayload(1_536, 27);
  const libraryEntry = {
    id: 'roundtrip-project', kind: 'draw' as const, name: 'Large Roundtrip',
    bytes: archiveA.buffer.slice(archiveA.byteOffset, archiveA.byteOffset + archiveA.byteLength) as ArrayBuffer,
    thumbnail: previewA.buffer.slice(previewA.byteOffset, previewA.byteOffset + previewA.byteLength) as ArrayBuffer,
    width: 8192, height: 6144, pages: 1, size: archiveA.byteLength,
    createdAt: 10, modifiedAt: 20, savedAt: 30, hasReplay: true,
  };
  await testLibraryStore.put(libraryEntry);
  const reopened = await testLibraryStore.get(libraryEntry.id);
  ok(!!reopened, 'a saved local Library project can be reopened from disk');
  if (reopened) {
    ok(Buffer.compare(Buffer.from(reopened.bytes), Buffer.from(archiveA)) === 0, 'Library reopen restores the exact large editable archive bytes');
    ok(Buffer.compare(Buffer.from(reopened.thumbnail), Buffer.from(previewA)) === 0, 'Library reopen restores its verified preview bytes');
    eq(reopened.hasReplay, true, 'Library metadata preserves replay availability');
  }
  await testLibraryStore.put({ ...libraryEntry, name: 'Updated Roundtrip', bytes: archiveB.buffer.slice(archiveB.byteOffset, archiveB.byteOffset + archiveB.byteLength) as ArrayBuffer, thumbnail: previewB.buffer.slice(previewB.byteOffset, previewB.byteOffset + previewB.byteLength) as ArrayBuffer, savedAt: 40 });
  const repeated = await testLibraryStore.get(libraryEntry.id);
  ok(!!repeated && Buffer.compare(Buffer.from(repeated.bytes), Buffer.from(archiveB)) === 0, 'a repeated Library save commits the latest full-size archive');
  if (repeated) eq(repeated.name, 'Updated Roundtrip', 'the latest metadata pointer is committed with the latest artwork');

  failLibraryWrite = 'project';
  await rejects(() => testLibraryStore.put({ ...libraryEntry, bytes: archiveA.buffer.slice(archiveA.byteOffset, archiveA.byteOffset + archiveA.byteLength) as ArrayBuffer, savedAt: 50 }), 'a simulated Library project write failure is surfaced to the caller');
  const afterProjectFailure = await testLibraryStore.get(libraryEntry.id);
  ok(!!afterProjectFailure && Buffer.compare(Buffer.from(afterProjectFailure.bytes), Buffer.from(archiveB)) === 0, 'a failed project write preserves the previous Library archive');

  failLibraryWrite = 'metadata';
  await rejects(() => testLibraryStore.put({ ...libraryEntry, bytes: archiveA.buffer.slice(archiveA.byteOffset, archiveA.byteOffset + archiveA.byteLength) as ArrayBuffer, savedAt: 60 }), 'a failed Library metadata-pointer commit is surfaced to the caller');
  const afterMetadataFailure = await testLibraryStore.get(libraryEntry.id);
  ok(!!afterMetadataFailure && Buffer.compare(Buffer.from(afterMetadataFailure.bytes), Buffer.from(archiveB)) === 0, 'a failed metadata commit leaves the prior version selected and readable');

  const listed = await testLibraryStore.list();
  eq(listed.entries.length, 1, 'the disk-backed Library indexes the saved project once');
  eq(listed.entries[0]?.size, archiveB.byteLength, 'Library list reports the exact stored project size');
  const onDiskBeforeDelete = (await nodeFs.readdir(libraryRoot)).filter((name) => name.endsWith('.carbon'));
  eq(onDiskBeforeDelete.length, 1, 'superseded project versions are cleaned after a successful commit');
  await testLibraryStore.delete(libraryEntry.id);
  eq(await testLibraryStore.get(libraryEntry.id), null, 'a deleted project is no longer available to reopen');
  eq((await testLibraryStore.list()).entries.length, 0, 'deletion tombstones exclude projects from the Library index');
  await testLibraryStore.put({ ...libraryEntry, bytes: archiveA.buffer.slice(archiveA.byteOffset, archiveA.byteOffset + archiveA.byteLength) as ArrayBuffer, savedAt: 70 });
  eq((await testLibraryStore.list()).entries.length, 1, 'saving an explicitly re-added project clears its deletion tombstone');
} finally {
  await nodeFs.rm(libraryRoot, { recursive: true, force: true });
}

// ---------------------------------------------------------------- done
console.log(`\n${pass} assertions passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('Carbon: Prime — Node unit suite OK');

void DEFAULT_VIEW;
