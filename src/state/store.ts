import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BrushParams, Symmetry, ToolId } from '../engine/types';
import type { DocEngine } from '../engine/document';
import type { ReplayPlayer } from '../engine/replay';
import { buildPresets } from '../engine/brushes';
import { extraBrushes } from '../engine/brushPacks';
import { EDITION } from '../platform/edition';
import { uid } from '../engine/util';
import type { ProjectSort } from './projectFinder';

export type PanelId = 'layers' | 'brushes' | 'brushStudio' | 'color' | 'history' | 'replay' | 'navigator' | 'toolOptions' | 'reference' | 'docInfo' | 'continuum' | 'timemachine' | 'palmem';
/** Panels that exist only in the Windows edition (never added to the Android layout). */
export const WIN_PANELS: PanelId[] = ['continuum', 'timemachine', 'palmem'];
export const PANEL_TITLES: Record<PanelId, string> = {
  layers: 'Layers', brushes: 'Brush Library', brushStudio: 'Brush Studio', color: 'Color Studio', history: 'History',
  replay: 'Drawing Replay', navigator: 'Navigator', toolOptions: 'Tool Options', reference: 'Reference Board', docInfo: 'Document Info',
  continuum: 'Continuum (Project Links)', timemachine: 'Creative Time Machine', palmem: 'Palette Memory',
};

export interface Layout {
  order: PanelId[];
  hidden: PanelId[];
  collapsed: PanelId[];
  floating: Partial<Record<PanelId, { x: number; y: number; w: number; h: number }>>;
  heights: Partial<Record<PanelId, number>>;
  dockWidth: number;
  dockOpen: boolean;
  railVisible: boolean;
}

export interface PaletteCfg {
  visible: boolean;
  collapsed: boolean;
  x: number;
  y: number;
  layout: 'grid' | 'horizontal' | 'vertical' | 'radial';
  iconSize: number;
  spacing: number;
  opacity: number;
  columns: number;
  items: string[];
}

export interface Settings {
  uiScale: number;
  uiMode: 'auto' | 'desktop' | 'tablet';
  homeSceneEnabled: boolean;
  homeSceneMotion: boolean;
  restoreSession: boolean;
  autosaveSec: number;
  recordByDefault: boolean;
  replayLimitMB: number;
  compressReplayPauses: boolean;
  assetMaxDownloadMB: number;
  assetMaxInstallMB: number;
  idleCapSec: number;
  undoLimit: number;
  stylusOnly: boolean;
  twoFingerTap: 'undo' | 'none';
  threeFingerTap: 'redo' | 'none';
  shortcuts: Record<string, string>;
  railTools: ToolId[];
  gridSize: number;
  showGrid: boolean;
  showRulers: boolean;
  showGuides: boolean;
  perspective: boolean;
  brushOutline: boolean;
  mousePressure: boolean;
  palmAuto: boolean; // once a stylus is used, finger touches pan instead of drawing
  shareExports: boolean; // Android: open the share sheet after exporting
  immersive: boolean; // Android: hide system bars in canvas-only mode
  pinnedProjects: string[]; // local Home/Welcome project finder pins; keys distinguish recents from device files
  homeProjectSort: ProjectSort;
  quickStartSeen: boolean; // dismissible, offline first-run guide
}

export interface ToolOpts {
  fillTol: number;
  fillAll: boolean;
  fillExpand: number;
  selMode: 'rect' | 'ellipse' | 'lasso';
  shapeFill: boolean;
  textFont: string;
  textSize: number;
  textBold: boolean;
  textItalic: boolean;
  inkErase: 'whole' | 'partial';
  pickerLayer: boolean;
  sym: Symmetry;
  transformSel: boolean;
  lineAssist: boolean;
}

export interface Palette { id: string; name: string; colors: string[]; names?: string[] }

export const ALL_TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: 'brush', label: 'Brush', key: 'B' },
  { id: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'picker', label: 'Color Picker', key: 'I' },
  { id: 'fill', label: 'Fill', key: 'G' },
  { id: 'select', label: 'Selection', key: 'M' },
  { id: 'transform', label: 'Transform', key: 'T' },
  { id: 'move', label: 'Move', key: 'V' },
  { id: 'line', label: 'Line', key: 'L' },
  { id: 'rect', label: 'Rectangle', key: 'U' },
  { id: 'ellipse', label: 'Ellipse', key: 'O' },
  { id: 'text', label: 'Text', key: 'X' },
  { id: 'inkedit', label: 'Crisp Ink Edit', key: 'A' },
  { id: 'hand', label: 'Hand / Pan', key: 'H' },
  { id: 'zoom', label: 'Zoom', key: 'Z' },
  { id: 'rotate', label: 'Rotate View', key: 'R' },
  { id: 'symmetry', label: 'Symmetry', key: 'Y' },
];

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'tool.brush': 'b', 'tool.eraser': 'e', 'tool.picker': 'i', 'tool.fill': 'g', 'tool.select': 'm', 'tool.transform': 't',
  'tool.move': 'v', 'tool.line': 'l', 'tool.rect': 'u', 'tool.ellipse': 'o', 'tool.text': 'x', 'tool.inkedit': 'a',
  'tool.hand': 'h', 'tool.zoom': 'z', 'tool.rotate': 'r', 'tool.symmetry': 'y',
  'edit.undo': 'ctrl+z', 'edit.redo': 'ctrl+shift+z', 'edit.redo2': 'ctrl+y',
  'file.new': 'ctrl+alt+n', 'file.open': 'ctrl+o', 'file.save': 'ctrl+s', 'file.saveAs': 'ctrl+shift+s', 'file.export': 'ctrl+e',
  'view.fit': 'ctrl+0', 'view.actual': 'ctrl+1', 'view.zoomIn': 'ctrl+=', 'view.zoomOut': 'ctrl+-', 'view.canvasOnly': 'tab', 'view.resetRotation': 'shift+r',
  'brush.smaller': '[', 'brush.larger': ']', 'color.swap': 's', 'color.reset': 'd',
  'select.all': 'ctrl+a', 'select.none': 'ctrl+d', 'select.invert': 'ctrl+shift+i', 'edit.clear': 'delete',
  'layer.new': 'ctrl+shift+n', 'layer.newInk': 'ctrl+shift+k', 'replay.toggle': 'ctrl+shift+p',
  'app.commandPalette': 'ctrl+k',
};

export const SHORTCUT_LABELS: Record<string, string> = {
  'edit.undo': 'Undo', 'edit.redo': 'Redo', 'edit.redo2': 'Redo (alt)', 'file.new': 'New canvas', 'file.open': 'Open', 'file.save': 'Save',
  'file.saveAs': 'Save As', 'file.export': 'Export image', 'view.fit': 'Fit to screen', 'view.actual': 'Actual size', 'view.zoomIn': 'Zoom in',
  'view.zoomOut': 'Zoom out', 'view.canvasOnly': 'Canvas-only mode', 'view.resetRotation': 'Reset rotation', 'brush.smaller': 'Brush smaller',
  'brush.larger': 'Brush larger', 'color.swap': 'Swap colors', 'color.reset': 'Reset colors', 'select.all': 'Select all', 'select.none': 'Deselect',
  'select.invert': 'Invert selection', 'edit.clear': 'Clear / delete', 'layer.new': 'New layer', 'layer.newInk': 'New Crisp Ink layer',
  'replay.toggle': 'Open Drawing Replay', 'app.commandPalette': 'Open command palette',
  ...Object.fromEntries(ALL_TOOLS.map((t) => ['tool.' + t.id, t.label + ' tool'])),
};

const DEFAULT_LAYOUT: Layout = {
  order: ['color', 'brushes', 'layers', 'toolOptions', 'brushStudio', 'replay', 'history', 'navigator', 'reference', 'docInfo'],
  hidden: ['reference', 'docInfo', 'navigator'],
  collapsed: ['brushStudio', 'history', 'replay'],
  floating: {},
  heights: {},
  dockWidth: 320,
  dockOpen: true,
  railVisible: true,
};

export const DEFAULT_PALETTE: PaletteCfg = {
  visible: true, collapsed: false, x: 24, y: 120, layout: 'vertical', iconSize: 36, spacing: 4, opacity: 0.92, columns: 2,
  items: ['color', 'brush', 'eraser', 'picker', 'fill', 'select', 'transform', 'undo', 'redo'],
};

export const DEFAULT_SETTINGS: Settings = {
  uiScale: 1, uiMode: 'auto', homeSceneEnabled: true, homeSceneMotion: true, restoreSession: true, autosaveSec: 30, recordByDefault: true, replayLimitMB: 250,
  compressReplayPauses: false, assetMaxDownloadMB: 100, assetMaxInstallMB: 500, idleCapSec: 2.5,
  undoLimit: 80, stylusOnly: false, twoFingerTap: 'undo', threeFingerTap: 'redo', shortcuts: { ...DEFAULT_SHORTCUTS },
  railTools: ALL_TOOLS.map((t) => t.id), gridSize: 64, showGrid: false, showRulers: false, showGuides: true, perspective: false,
  brushOutline: true, mousePressure: false, palmAuto: true, shareExports: true, immersive: true,
  pinnedProjects: [], homeProjectSort: 'recent', quickStartSeen: false,
};

/** Backfill new preference fields without replacing any settings from an existing install. */
export function mergeSettings(persisted: Partial<Settings> = {}): Settings {
  const pins = Array.isArray(persisted.pinnedProjects)
    ? [...new Set(persisted.pinnedProjects.filter((x): x is string => typeof x === 'string'))].slice(0, 200)
    : DEFAULT_SETTINGS.pinnedProjects;
  const sort: ProjectSort = persisted.homeProjectSort === 'name' || persisted.homeProjectSort === 'size' ? persisted.homeProjectSort : 'recent';
  const assetMaxDownloadMB = Number.isFinite(persisted.assetMaxDownloadMB)
    ? Math.max(1, Math.min(512, Math.round(persisted.assetMaxDownloadMB as number))) : DEFAULT_SETTINGS.assetMaxDownloadMB;
  const assetMaxInstallMB = Number.isFinite(persisted.assetMaxInstallMB)
    ? Math.max(1, Math.min(4096, Math.round(persisted.assetMaxInstallMB as number))) : DEFAULT_SETTINGS.assetMaxInstallMB;
  return {
    ...DEFAULT_SETTINGS,
    ...persisted,
    pinnedProjects: pins,
    homeProjectSort: sort,
    compressReplayPauses: typeof persisted.compressReplayPauses === 'boolean' ? persisted.compressReplayPauses : false,
    assetMaxDownloadMB,
    assetMaxInstallMB,
    quickStartSeen: typeof persisted.quickStartSeen === 'boolean' ? persisted.quickStartSeen : DEFAULT_SETTINGS.quickStartSeen,
    shortcuts: { ...DEFAULT_SHORTCUTS, ...(persisted.shortcuts || {}) },
  };
}

export interface Toast { id: string; msg: string; kind: 'info' | 'error' | 'success' }
export interface ConfirmReq { title: string; message: string; actions: { label: string; value: string; variant?: 'primary' | 'danger' }[]; resolve: (v: string) => void; input?: string }
export type DialogType = 'new' | 'newInfinite' | 'create' | 'settings' | 'export' | 'canvasSize' | 'imageSize' | 'about' | 'projectInfo' | 'projects' | 'shortcuts' | 'diagnostics' | 'space' | 'docs' | 'paletteEdit' | 'colorDock' | 'patches' | 'fusion' | 'commandPalette' | 'quickStart' | 'settingsHome' | null;

export interface AppState {
  docs: DocEngine[];
  activeId: string | null;
  tick: number;
  tool: ToolId;
  presets: BrushParams[];
  customBrushes: BrushParams[];
  customErasers: BrushParams[];
  overrides: Record<string, Partial<BrushParams>>;
  brushId: string;
  eraserBrushId: string;
  favorites: string[];
  recentBrushes: string[];
  collections: { id: string; name: string; ids: string[] }[];
  fg: string;
  bg: string;
  recentColors: string[];
  palettes: Palette[];
  activePalette: string;
  toolOpts: ToolOpts;
  layout: Layout;
  palette: PaletteCfg;
  palettePresets: { name: string; cfg: PaletteCfg }[];
  settings: Settings;
  guides: Record<string, { v: number[]; h: number[] }>;
  vps: { x1: number; x2: number; y: number };
  canvasOnly: boolean;
  /** Show the launch pad while keeping the current document session open. */
  homeScreen: boolean;
  /** True only while the explicit Home action is waiting for a save result. */
  homeSaving: boolean;
  replay: { docId: string; player: ReplayPlayer; playing: boolean; speed: number } | null;
  toasts: Toast[];
  dialog: DialogType;
  confirmReq: ConfirmReq | null;
  pointer: { x: number; y: number } | null;
  inkSelection: string[];
  textEdit: { x: number; y: number } | null;
  transformActive: boolean;
  set: (p: Partial<AppState>) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      docs: [],
      activeId: null,
      tick: 0,
      tool: 'brush',
      presets: buildPresets(),
      customBrushes: [],
      customErasers: [],
      overrides: {},
      brushId: 'pencil-hb',
      eraserBrushId: 'eraser-hard',
      favorites: ['pencil-hb', 'ink-brushpen', 'wc-transparent', 'oil-paint', 'crisp-liner', 'air-soft'],
      recentBrushes: [],
      collections: [{ id: 'col-sketch', name: 'Sketching', ids: ['pencil-2h', 'pencil-hb', 'pencil-4b', 'sketch-rough', 'pencil-blend'] }],
      fg: '#1d1d1f',
      bg: '#ffffff',
      recentColors: [],
      palettes: [
        { id: 'pal-studio', name: 'Studio', colors: ['#1d1d1f', '#f5f2ea', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#6d4c41', '#95a5a6', '#e8b4a0', '#34495e'] },
        { id: 'pal-earth', name: 'Earth', colors: ['#3e2723', '#5d4037', '#8d6e63', '#a1887f', '#c8b6a6', '#e9dcc9', '#556b2f', '#808000', '#b8860b', '#cd853f'] },
      ],
      activePalette: 'pal-studio',
      toolOpts: {
        fillTol: 0.12, fillAll: false, fillExpand: 1, selMode: 'rect', shapeFill: false, textFont: 'Inter, system-ui, sans-serif',
        textSize: 48, textBold: false, textItalic: false, inkErase: 'partial', pickerLayer: false,
        sym: { mode: 'off', count: 6, cx: 0.5, cy: 0.5 }, transformSel: true, lineAssist: true,
      },
      layout: DEFAULT_LAYOUT,
      palette: DEFAULT_PALETTE,
      palettePresets: [
        { name: 'Sketch', cfg: { ...DEFAULT_PALETTE, items: ['color', 'brush', 'eraser', 'undo', 'redo'] } },
        { name: 'Painting (radial)', cfg: { ...DEFAULT_PALETTE, layout: 'radial', items: ['color', 'brush', 'eraser', 'picker', 'fill', 'undo', 'redo', 'hand'] } },
      ],
      settings: DEFAULT_SETTINGS,
      guides: {},
      vps: { x1: 0.15, x2: 0.85, y: 0.45 },
      canvasOnly: false,
      homeScreen: false,
      homeSaving: false,
      replay: null,
      toasts: [],
      dialog: null,
      confirmReq: null,
      pointer: null,
      inkSelection: [],
      textEdit: null,
      transformActive: false,
      set: (p) => set(p),
    }),
    {
      name: 'carbon-prefs-v1',
      partialize: (s) => ({
        customBrushes: s.customBrushes, customErasers: s.customErasers, overrides: s.overrides, brushId: s.brushId, eraserBrushId: s.eraserBrushId,
        favorites: s.favorites, recentBrushes: s.recentBrushes, collections: s.collections, fg: s.fg, bg: s.bg,
        recentColors: s.recentColors, palettes: s.palettes, activePalette: s.activePalette, toolOpts: s.toolOpts,
        layout: s.layout, palette: s.palette, palettePresets: s.palettePresets, settings: s.settings, tool: s.tool, vps: s.vps,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          customBrushes: Array.isArray(p.customBrushes) ? p.customBrushes : current.customBrushes,
          customErasers: Array.isArray(p.customErasers) ? p.customErasers : current.customErasers,
          settings: mergeSettings(p.settings),
          layout: { ...DEFAULT_LAYOUT, ...(p.layout || {}) },
          palette: { ...DEFAULT_PALETTE, ...(p.palette || {}) },
          toolOpts: { ...current.toolOpts, ...(p.toolOpts || {}) },
          tool: p.tool && p.tool !== 'transform' ? p.tool : 'brush',
        };
      },
    },
  ),
);

/** High-frequency cursor position lives in its own store so it never re-renders heavy panels. */
export const usePointer = create<{ p: { x: number; y: number } | null }>(() => ({ p: null }));

export const getApp = () => useApp.getState();
export const setApp = (p: Partial<AppState>) => useApp.setState(p);

export function activeDoc(): DocEngine | null {
  const s = getApp();
  return s.docs.find((d) => d.id === s.activeId) || null;
}

export function allBrushes(s: AppState = getApp()) {
  return [...s.presets, ...extraBrushes(EDITION.windows), ...s.customBrushes, ...s.customErasers];
}

export function brushById(id: string, s: AppState = getApp()): BrushParams | undefined {
  const b = s.presets.find((x) => x.id === id) || s.customBrushes.find((x) => x.id === id) || s.customErasers.find((x) => x.id === id) || extraBrushes(EDITION.windows).find((x) => x.id === id);
  if (!b) return undefined;
  return { ...b, ...(s.overrides[id] || {}) };
}

export function currentBrush(eraser = false, s: AppState = getApp()): BrushParams {
  return brushById(eraser ? s.eraserBrushId : s.brushId, s) || brushById('pencil-hb', s)!;
}

export function updateBrush(id: string, patch: Partial<BrushParams>) {
  const s = getApp();
  if (s.customErasers.some((brush) => brush.id === id)) {
    setApp({ customErasers: s.customErasers.map((brush) => (brush.id === id ? { ...brush, ...patch } : brush)) });
    return;
  }
  if (s.customBrushes.some((brush) => brush.id === id)) {
    setApp({ customBrushes: s.customBrushes.map((brush) => (brush.id === id ? { ...brush, ...patch } : brush)) });
    return;
  }
  setApp({ overrides: { ...s.overrides, [id]: { ...(s.overrides[id] || {}), ...patch } } });
}

/** Keep an identical active message in one toast slot instead of stacking duplicates. */
export function dedupeToastList(toasts: Toast[], next: Toast): Toast[] {
  const index = toasts.findIndex((item) => item.msg === next.msg && item.kind === next.kind);
  if (index < 0) return [...toasts, next];
  return toasts.map((item, i) => i === index ? { ...next, id: item.id } : item);
}

const toastTimers = new Map<string, { id: string; timer: ReturnType<typeof setTimeout> }>();
export function toast(msg: string, kind: Toast['kind'] = 'info') {
  const key = JSON.stringify([kind, msg]);
  const previous = toastTimers.get(key);
  const id = previous?.id || uid('t');
  if (previous) clearTimeout(previous.timer);
  setApp({ toasts: dedupeToastList(getApp().toasts, { id, msg, kind }) });
  const timer = setTimeout(() => {
    const current = toastTimers.get(key);
    if (current?.id === id) toastTimers.delete(key);
    setApp({ toasts: getApp().toasts.filter((item) => item.id !== id) });
  }, kind === 'error' ? 6500 : 3200);
  // Node-based tests should not wait for UI-only toast timers; browser timer handles do not expose unref().
  (timer as unknown as { unref?: () => void }).unref?.();
  toastTimers.set(key, { id, timer });
}

export function confirmDialog(title: string, message: string, actions: ConfirmReq['actions']): Promise<string> {
  return new Promise((resolve) => setApp({ confirmReq: { title, message, actions, resolve } }));
}

/** In-app text prompt (works identically in browsers and the Android WebView). Resolves null on cancel. */
export function promptDialog(title: string, message: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) =>
    setApp({
      confirmReq: {
        title, message, input: initial,
        actions: [{ label: 'Cancel', value: '\u0000cancel' }, { label: 'OK', value: '\u0000ok', variant: 'primary' }],
        resolve: (v) => resolve(v.startsWith('\u0000cancel') ? null : v.replace(/^\u0000ok/, '').trim() || initial),
      },
    }),
  );
}

export function bump() {
  setApp({ tick: getApp().tick + 1 });
}

export function markActive(label: string) {
  const d = activeDoc();
  if (d && d.rec.active) d.mark(label);
}

export function setTool(t: ToolId) {
  const s = getApp();
  if (s.tool === t) return;
  setApp({ tool: t, textEdit: null });
  markActive('tool:' + t);
}

export function selectBrush(id: string) {
  const s = getApp();
  const b = brushById(id);
  if (!b) return toast('Brush not found — it may have been deleted.', 'error');
  const eraser = s.tool === 'eraser';
  if (!eraser && s.customErasers.some((brush) => brush.id === id)) return toast('This is a custom eraser tip. Select the Eraser tool to use it.', 'info');
  const recent = [id, ...s.recentBrushes.filter((x) => x !== id)].slice(0, 16);
  if (eraser) setApp({ eraserBrushId: id, recentBrushes: recent });
  else setApp({ brushId: id, recentBrushes: recent, tool: s.tool === 'brush' ? 'brush' : ['line', 'rect', 'ellipse'].includes(s.tool) ? s.tool : 'brush' });
  markActive('brush:' + b.name);
}

export function setColor(hex: string, commit = true) {
  const s = getApp();
  if (commit) {
    const rc = [hex, ...s.recentColors.filter((c) => c !== hex)].slice(0, 18);
    setApp({ fg: hex, recentColors: rc });
    markActive('color:' + hex);
  } else setApp({ fg: hex });
}

export function updateLayout(p: Partial<Layout>) {
  setApp({ layout: { ...getApp().layout, ...p } });
}
export function updateSettings(p: Partial<Settings>) {
  setApp({ settings: { ...getApp().settings, ...p } });
}
export function updatePalette(p: Partial<PaletteCfg>) {
  setApp({ palette: { ...getApp().palette, ...p } });
}
export function updateToolOpts(p: Partial<ToolOpts>) {
  setApp({ toolOpts: { ...getApp().toolOpts, ...p } });
}
export function showPanel(id: PanelId) {
  const l = getApp().layout;
  updateLayout({ hidden: l.hidden.filter((x) => x !== id), collapsed: l.collapsed.filter((x) => x !== id), dockOpen: true });
}
export function togglePanel(id: PanelId) {
  const l = getApp().layout;
  if (l.hidden.includes(id)) showPanel(id);
  else updateLayout({ hidden: [...l.hidden, id] });
}
export function resetLayout() {
  setApp({ layout: DEFAULT_LAYOUT, palette: DEFAULT_PALETTE });
}
