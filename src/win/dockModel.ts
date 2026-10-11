// Color Dock model (Windows edition).
// Global swatch sets ARE Color Studio palettes (store.palettes), so the dock shares Carbon's color system.
// The project dock lives on the document (doc.colorDock) and is saved in manifest.extensions.colorDock.
// The dock is UI only: it never renders into artwork or exports.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ToolId } from '../engine/types';
import { hexToRgb, isHex, normHex, rgbToHex, uid } from '../engine/util';
import { activeDoc, getApp, setApp, setTool, toast, useApp } from '../state/store';

export interface Swatches { name: string; colors: string[]; names: string[] }
export type DockScope = 'global' | 'project';
export interface DockCfg {
  enabled: boolean;
  placement: 'left' | 'right' | 'bottom';
  layout: 'compact' | 'expanded';
  size: number;
  labels: boolean;
  scope: DockScope;
  setId: string | null;
}

export const DEFAULT_DOCK: DockCfg = { enabled: true, placement: 'bottom', layout: 'compact', size: 26, labels: false, scope: 'global', setId: null };

interface DockState { cfg: DockCfg; pick: { prevTool: ToolId; scope: DockScope } | null }
export const useDock = create<DockState>()(
  persist(() => ({ cfg: DEFAULT_DOCK, pick: null }) as DockState, {
    name: 'carbon-colordock-v1',
    partialize: (s) => ({ cfg: s.cfg }),
    merge: (p, c) => ({ ...c, cfg: { ...DEFAULT_DOCK, ...((p as Partial<DockState>)?.cfg || {}) } }),
  }),
);
/** Merge settings into the persisted Color Dock config. */
export const updateDock = (p: Partial<DockCfg>) => useDock.setState({ cfg: { ...useDock.getState().cfg, ...p } });

// ---------------------------------------------------------------- pure operations
export function norm(s: Partial<Swatches> | null | undefined): Swatches {
  const colors = (s?.colors || []).filter((c) => typeof c === 'string' && isHex(c)).map(normHex);
  const names = colors.map((_, i) => String(s?.names?.[i] ?? '').slice(0, 40));
  return { name: String(s?.name || 'Colors').slice(0, 60), colors, names };
}
export function addColor(s: Swatches, hex: string, name = ''): { s: Swatches; added: boolean } {
  const h = normHex(hex);
  if (s.colors.includes(h)) return { s, added: false };
  return { s: { ...s, colors: [...s.colors, h], names: [...s.names, name] }, added: true };
}
export function moveSwatch(s: Swatches, from: number, to: number): Swatches {
  if (from === to || from < 0 || from >= s.colors.length) return s;
  const t = Math.max(0, Math.min(s.colors.length - 1, to));
  const c = [...s.colors], n = [...s.names];
  const [cc] = c.splice(from, 1), [nn] = n.splice(from, 1);
  c.splice(t, 0, cc); n.splice(t, 0, nn);
  return { ...s, colors: c, names: n };
}
export const removeSwatch = (s: Swatches, i: number): Swatches => ({ ...s, colors: s.colors.filter((_, j) => j !== i), names: s.names.filter((_, j) => j !== i) });
export const renameSwatch = (s: Swatches, i: number, name: string): Swatches => ({ ...s, names: s.names.map((x, j) => (j === i ? name.slice(0, 40) : x)) });
export const replaceSwatch = (s: Swatches, i: number, hex: string): Swatches => ({ ...s, colors: s.colors.map((x, j) => (j === i ? normHex(hex) : x)) });
export function duplicateSwatch(s: Swatches, i: number): Swatches {
  if (i < 0 || i >= s.colors.length) return s;
  const c = [...s.colors], n = [...s.names];
  c.splice(i + 1, 0, s.colors[i]);
  n.splice(i + 1, 0, s.names[i] ? s.names[i] + ' copy' : '');
  return { ...s, colors: c, names: n };
}

/** Accepts #RGB, #RRGGBB, RRGGBB, "r,g,b", "r g b" or rgb(r,g,b). Returns a normalised hex or null. */
export function parseColorInput(v: string): string | null {
  const t = v.trim();
  if (isHex(t)) return normHex(t);
  const m = t.match(/^(?:rgba?\()?\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,\s]\s*[\d.]+\s*)?\)?$/i);
  if (m && [m[1], m[2], m[3]].every((x) => Number(x) <= 255)) return rgbToHex(+m[1], +m[2], +m[3]);
  return null;
}
export const rgbLabel = (hex: string) => hexToRgb(hex).join(', ');

// ---------------------------------------------------------------- targets
export function globalSetId(): string {
  const s = getApp();
  const id = useDock.getState().cfg.setId;
  if (id && s.palettes.some((p) => p.id === id)) return id;
  if (s.palettes.some((p) => p.id === s.activePalette)) return s.activePalette;
  if (s.palettes[0]) return s.palettes[0].id;
  const nid = uid('pal-');
  setApp({ palettes: [{ id: nid, name: 'Dock', colors: [] }], activePalette: nid });
  return nid;
}

export function readDock(scope: DockScope): Swatches | null {
  if (scope === 'project') {
    const d = activeDoc();
    return d?.colorDock ? norm(d.colorDock) : null;
  }
  const p = getApp().palettes.find((x) => x.id === globalSetId());
  return p ? norm(p) : null;
}

export function writeDock(scope: DockScope, sw: Swatches) {
  if (scope === 'project') {
    const d = activeDoc();
    if (!d) return;
    d.colorDock = norm(sw);
    d.dirty = true;
    d.meta.modified = Date.now();
    d.emit();
    return;
  }
  const id = globalSetId();
  setApp({ palettes: getApp().palettes.map((p) => (p.id === id ? { ...p, name: sw.name, colors: sw.colors, names: sw.names } : p)) });
}

/** Add a colour to the dock in the given scope (creates the project dock if needed). */
export function addToDock(hex: string, scope: DockScope = useDock.getState().cfg.scope, name = '') {
  const cur = readDock(scope) || norm({ name: (activeDoc()?.name || 'Project') + ' colors' });
  const r = addColor(cur, hex, name);
  if (!r.added) { toast(`${normHex(hex).toUpperCase()} is already in the dock`); return false; }
  writeDock(scope, r.s);
  toast(`Added ${normHex(hex).toUpperCase()} to the ${scope === 'project' ? 'project' : 'global'} dock`, 'success');
  return true;
}

// ---------------------------------------------------------------- eyedropper → dock
export function startDockPick() {
  const s = getApp();
  if (!activeDoc()) return toast('Open a document to sample colors', 'error');
  useDock.setState({ pick: { prevTool: s.tool === 'picker' ? 'brush' : s.tool, scope: useDock.getState().cfg.scope } });
  setTool('picker');
  toast('Click or tap the canvas to sample a color into the dock (Esc cancels)');
}
/** Called by the eyedropper when a sample is committed. Returns true if it was a dock pick. */
export function finishDockPick(hex: string | null) {
  const p = useDock.getState().pick;
  if (!p) return false;
  useDock.setState({ pick: null });
  if (hex) addToDock(hex, p.scope);
  setTool(p.prevTool);
  return true;
}
// switching away from the eyedropper abandons a pending dock sample
useApp.subscribe((s, p) => {
  if (p.tool === 'picker' && s.tool !== 'picker' && useDock.getState().pick) useDock.setState({ pick: null });
});

export function cancelDockPick() {
  const p = useDock.getState().pick;
  if (!p) return;
  useDock.setState({ pick: null });
  setTool(p.prevTool);
}
