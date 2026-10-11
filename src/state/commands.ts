import type { DocEngine } from '../engine/document';
import { clamp, uid } from '../engine/util';
import { closeReplay, openFileDialog, openReplay, saveDoc } from './actions';
import { activeDoc, currentBrush, getApp, setApp, setTool, toast, updateBrush } from './store';
import type { ToolId } from '../engine/types';

export const viewport = { w: 1000, h: 700 };
export const canvasBus = new EventTarget();
export const emitCanvas = (name: string) => canvasBus.dispatchEvent(new Event(name));

let lastViewBump = 0;
let viewTimer: ReturnType<typeof setTimeout> | undefined;
/** Repaint the canvas immediately; refresh the rest of the UI (status bar, navigator) at most ~8×/s. */
export function viewChanged(doc: DocEngine) {
  canvasBus.dispatchEvent(new Event('view'));
  const now = performance.now();
  clearTimeout(viewTimer);
  if (now - lastViewBump > 120) {
    lastViewBump = now;
    doc.emit();
  } else {
    viewTimer = setTimeout(() => { lastViewBump = performance.now(); doc.emit(); }, 140);
  }
}

export function fitView(doc: DocEngine, mode: 'fit' | 'width' | 'actual' = 'fit') {
  const pad = 48;
  const z = mode === 'actual' ? 1 : mode === 'width'
    ? (viewport.w - pad) / doc.width
    : Math.min((viewport.w - pad) / doc.width, (viewport.h - pad) / doc.height);
  doc.view = { ...doc.view, zoom: clamp(z, 0.02, 64), panX: viewport.w / 2, panY: viewport.h / 2, rot: mode === 'actual' ? doc.view.rot : 0 };
  doc.viewInit = true;
  doc.emit();
}

export function zoomAt(doc: DocEngine, factor: number, sx = viewport.w / 2, sy = viewport.h / 2) {
  const v = doc.view;
  const z = clamp(v.zoom * factor, 0.02, 64);
  const k = z / v.zoom;
  doc.view = { ...v, zoom: z, panX: sx + (v.panX - sx) * k, panY: sy + (v.panY - sy) * k };
  viewChanged(doc);
}

export function setZoom(doc: DocEngine, z: number) {
  zoomAt(doc, z / doc.view.zoom);
}

export function rotateView(doc: DocEngine, deg: number, absolute = false) {
  let r = absolute ? deg : doc.view.rot + deg;
  r = ((r + 180) % 360 + 360) % 360 - 180;
  doc.view = { ...doc.view, rot: r };
  viewChanged(doc);
}

export function undo() {
  if (getApp().transformActive) return emitCanvas('cancel-transform');
  const d = activeDoc();
  if (d && !getApp().replay && !d.undo()) toast('Nothing to undo');
}
export function redo() {
  const d = activeDoc();
  if (d && !getApp().replay && !d.redo()) toast('Nothing to redo');
}

export function addLayer(type: 'raster' | 'ink') {
  const d = activeDoc();
  if (!d) return;
  const i = d.layers.findIndex((l) => l.id === d.activeLayerId);
  const n = d.layers.filter((l) => l.type === type).length + 1;
  if (!d.exec({ k: 'layerAdd', id: uid('L'), name: type === 'ink' ? `Crisp Ink ${n}` : `Layer ${d.layers.length + 1}`, type, index: i + 1 }))
    toast('Layer limit reached (64 layers).', 'error');
}

export function runAction(id: string) {
  const d = activeDoc();
  const s = getApp();
  if (id.startsWith('tool.')) return setTool(id.slice(5) as ToolId);
  switch (id) {
    case 'edit.undo': return undo();
    case 'edit.redo': case 'edit.redo2': return redo();
    case 'file.new': return setApp({ dialog: 'new' });
    case 'file.open': return void openFileDialog();
    case 'file.save': return d && void saveDoc(d, 'save');
    case 'file.saveAs': return d && void saveDoc(d, 'saveAs');
    case 'file.export': return d && setApp({ dialog: 'export' });
    case 'view.fit': return d && fitView(d, 'fit');
    case 'view.actual': return d && fitView(d, 'actual');
    case 'view.zoomIn': return d && zoomAt(d, 1.25);
    case 'view.zoomOut': return d && zoomAt(d, 0.8);
    case 'view.canvasOnly': return setApp({ canvasOnly: !s.canvasOnly });
    case 'view.resetRotation': return d && rotateView(d, 0, true);
    case 'brush.smaller':
    case 'brush.larger': {
      const b = currentBrush(s.tool === 'eraser');
      const f = id === 'brush.larger' ? 1.15 : 1 / 1.15;
      return updateBrush(b.id, { size: clamp(Math.round(b.size * f * 10) / 10, 0.5, b.maxSize) });
    }
    case 'color.swap': return setApp({ fg: s.bg, bg: s.fg });
    case 'color.reset': return setApp({ fg: '#1d1d1f', bg: '#ffffff' });
    case 'select.all': return d && d.exec({ k: 'select', sel: { pts: [0, 0, d.width, 0, d.width, d.height, 0, d.height], inverted: false } });
    case 'select.none': return d && d.selection && d.exec({ k: 'select', sel: null });
    case 'select.invert': return d && d.selection && d.exec({ k: 'select', sel: { ...d.selection, inverted: !d.selection.inverted } });
    case 'edit.clear': {
      if (!d) return;
      if (s.inkSelection.length && d.active?.type === 'ink') {
        const ids = new Set(s.inkSelection);
        setApp({ inkSelection: [] });
        return d.exec({ k: 'inkSet', layerId: d.activeLayerId, strokes: (d.active.strokes || []).filter((x) => !ids.has(x.id)), label: 'Delete strokes' });
      }
      if (d.active?.locked) return toast('Layer is locked', 'error');
      return d.exec({ k: 'clearSel', layerId: d.activeLayerId });
    }
    case 'edit.fillSel': return d && d.exec({ k: 'fillSel', layerId: d.activeLayerId, color: s.fg });
    case 'layer.new': return addLayer('raster');
    case 'layer.newInk': return addLayer('ink');
    case 'replay.toggle': return s.replay ? closeReplay() : void openReplay();
  }
}

export function comboFromEvent(e: KeyboardEvent) {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  let k = e.key.toLowerCase();
  if (k === ' ') k = 'space';
  if (k === '+') k = '=';
  if (k === '_') k = '-';
  if (['control', 'shift', 'alt', 'meta'].includes(k)) return '';
  if (k === 'backspace') k = 'delete';
  if (e.shiftKey && k.length === 1 && /[a-z]/.test(k) === false && !['[', ']', '=', '-'].includes(k)) {
    // keep shifted symbol keys as typed
  }
  parts.push(k);
  return parts.join('+');
}

export function prettyCombo(c: string) {
  return c.split('+').map((p) => (p === 'ctrl' ? 'Ctrl' : p === 'shift' ? 'Shift' : p === 'alt' ? 'Alt' : p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join('+');
}
