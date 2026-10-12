import type { DocEngine } from './document';
import type { InkStroke, Layer } from './types';
import { inkStrokeSvgPath } from './crispInk';
import { compositeDoc, topLevel } from './render';

export interface SvgExportResult {
  markup: string;
  vectorPaths: number;
  rasterLayers: number;
  flattened: boolean;
}

const xml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
const safeScale = (value: number) => Math.max(0.1, Math.min(8, Number.isFinite(value) ? value : 1));

function dataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/png');
}

function standaloneLayer(doc: DocEngine, root: Layer, scale: number) {
  const inside = new Set<string>([root.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const layer of doc.layers) {
      if (layer.parent && inside.has(layer.parent) && !inside.has(layer.id)) { inside.add(layer.id); changed = true; }
    }
  }
  const layers = doc.layers.map((layer) => ({ ...layer, visible: inside.has(layer.id) && layer.visible }));
  const isolated = Object.assign(Object.create(Object.getPrototypeOf(doc)), doc, {
    layers,
    preview: null,
    propPreview: null,
    selection: null,
  }) as DocEngine;
  return compositeDoc(isolated, scale, false);
}

function hasCompositionFeatures(doc: DocEngine) {
  return doc.layers.some((layer) =>
    layer.type === 'adjust' || layer.clip || layer.blend !== 'source-over' || layer.panelClip || !!layer.panelId,
  );
}

/**
 * Export a 2D document as SVG. Plain Crisp Ink layers become variable-width vector outlines;
 * raster, comic, grouped, or masked layers are embedded losslessly as PNG images at export scale.
 * Advanced document compositing that cannot be represented consistently in SVG is flattened to
 * one accurately rendered PNG, still inside a correctly labelled SVG image element.
 */
export function buildDocumentSvg(doc: DocEngine, scale = 1, transparent = false): SvgExportResult {
  const exportScale = safeScale(scale);
  const width = Math.max(1, Math.round(doc.width * exportScale));
  const height = Math.max(1, Math.round(doc.height * exportScale));
  const viewBox = `0 0 ${doc.width} ${doc.height}`;
  const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">`;
  const background = !transparent && doc.background
    ? `<rect x="0" y="0" width="${doc.width}" height="${doc.height}" fill="${xml(doc.background)}"/>`
    : '';

  if (doc.preview || hasCompositionFeatures(doc)) {
    const flattened = compositeDoc(doc, exportScale, !transparent);
    const href = dataUrl(flattened);
    flattened.width = 0; flattened.height = 0;
    return {
      markup: `${header}<image x="0" y="0" width="${doc.width}" height="${doc.height}" preserveAspectRatio="none" href="${href}"/></svg>`,
      vectorPaths: 0, rasterLayers: 1, flattened: true,
    };
  }

  let vectorPaths = 0, rasterLayers = 0;
  const elements: string[] = [background];
  for (const layer of topLevel(doc)) {
    if (!layer.visible) continue;
    const inkControlPoints = layer.type === 'ink' ? (layer.strokes || []).reduce((sum, stroke) => sum + Math.floor(stroke.pts.length / 3), 0) : 0;
    const canVectorize = layer.type === 'ink' && (!layer.mask || layer.maskEnabled === false) && inkControlPoints <= 5000;
    if (canVectorize && layer.type === 'ink') {
      const paths: string[] = [];
      for (const stroke of layer.strokes || []) {
        const d = inkStrokeSvgPath(stroke as InkStroke);
        if (!d) continue;
        paths.push(`<path d="${d}" fill="${xml(stroke.color)}" opacity="${Math.max(0, Math.min(1, stroke.opacity))}" fill-rule="nonzero"/>`);
        vectorPaths++;
      }
      if (paths.length) elements.push(`<g opacity="${Math.max(0, Math.min(1, layer.opacity))}">${paths.join('')}</g>`);
      continue;
    }
    const raster = standaloneLayer(doc, layer, exportScale);
    const href = dataUrl(raster);
    raster.width = 0; raster.height = 0;
    elements.push(`<image x="0" y="0" width="${doc.width}" height="${doc.height}" preserveAspectRatio="none" href="${href}"/>`);
    rasterLayers++;
  }
  return { markup: `${header}${elements.join('')}</svg>`, vectorPaths, rasterLayers, flattened: false };
}

/** Wrap a real rendered canvas (for 3D or explicitly flattened content) without claiming vectors. */
export function svgFromRasterCanvas(canvas: HTMLCanvasElement, width = canvas.width, height = canvas.height) {
  const href = dataUrl(canvas);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" href="${href}"/></svg>`;
}
