import type { BrushParams } from './types';
import { hashString, uid } from './util';

export const ENGINE_VERSION = 1;

type Core = Omit<BrushParams, 'id' | 'name' | 'category' | 'tags' | 'description'>;

export const BASE: Core = {
  version: ENGINE_VERSION, mode: 'normal', tip: 'round', size: 12, minSize: 0.2, maxSize: 120,
  opacity: 1, flow: 1, spacing: 0.08, hardness: 0.9, smoothing: 0.25, pressureSize: 1,
  pressureOpacity: 0, tiltAngle: false, tiltSize: 0, angle: 0, followDirection: false, roundness: 1,
  scatter: 0, count: 1, sizeJitter: 0, angleJitter: 0, opacityJitter: 0, hueJitter: 0, satJitter: 0,
  valJitter: 0, grain: 0, grainType: 'paper', grainScale: 1, wetEdges: 0, granulation: 0, bloom: 0,
  wetness: 0, pickup: 0, taperStart: 0, taperEnd: 0, speedSize: 0, composite: 'source-over',
};

export const CATEGORIES = [
  'Pencil & Graphite', 'Ink & Pen', 'Crisp Ink', 'Watercolor', 'Pencil-Watercolor', 'Pastel & Chalk',
  'Paint & Acrylic', 'Oil', 'Airbrush', 'Markers', 'Texture & Effects', 'Blending', 'Erasers',
] as const;

const [PG, IP, CI, WC, PW, PC, PA, OL, AB, MK, TX, BL, ER] = CATEGORIES;

let defaultStampUrl: string | undefined;
export function getDefaultStamp() {
  if (defaultStampUrl) return defaultStampUrl;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000';
  x.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    x.lineTo(48 + Math.cos(a) * 44, 48 + Math.sin(a) * 44);
  }
  x.closePath();
  x.fill();
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    x.lineTo(48 + Math.cos(a) * 26, 48 + Math.sin(a) * 26);
  }
  x.closePath();
  x.fill();
  defaultStampUrl = c.toDataURL('image/png');
  return defaultStampUrl;
}

function P(id: string, name: string, category: string, tags: string, description: string, o: Partial<Core>): BrushParams {
  return { ...BASE, ...o, id, name, category, tags: tags.split(' '), description, builtin: true };
}

export function buildPresets(): BrushParams[] {
  const stamp = getDefaultStamp();
  return [
    // Pencil & graphite
    P('pencil-hb', 'HB Pencil', PG, 'pencil graphite sketch', 'Balanced graphite with paper tooth; tilt broadens the line.', { tip: 'pencil', size: 4, maxSize: 30, flow: 0.8, spacing: 0.12, hardness: 0.7, pressureSize: 0.6, pressureOpacity: 0.7, grain: 0.55, tiltSize: 1.5, tiltAngle: true, smoothing: 0.15 }),
    P('pencil-2h', '2H Pencil', PG, 'pencil hard light', 'Hard, pale lead for construction lines.', { tip: 'pencil', size: 3, maxSize: 20, flow: 0.5, opacity: 0.7, grain: 0.7, pressureOpacity: 0.9, pressureSize: 0.3, hardness: 0.9, spacing: 0.12, smoothing: 0.15 }),
    P('pencil-2b', '2B Pencil', PG, 'pencil soft sketch', 'Slightly soft lead, darker deposit.', { tip: 'pencil', size: 5, maxSize: 30, flow: 0.85, grain: 0.45, pressureOpacity: 0.6, pressureSize: 0.6, spacing: 0.11, smoothing: 0.15, tiltSize: 1.5 }),
    P('pencil-4b', '4B Pencil', PG, 'pencil soft dark', 'Soft and dark with broad tilt shading.', { tip: 'pencil', size: 7, maxSize: 40, flow: 0.9, grain: 0.4, pressureSize: 0.8, pressureOpacity: 0.5, spacing: 0.1, tiltSize: 2, smoothing: 0.12 }),
    P('pencil-6b', '6B Pencil', PG, 'pencil very-soft dark', 'Very soft graphite that fills paper grain quickly.', { tip: 'grain', size: 10, maxSize: 50, flow: 1, grain: 0.35, pressureSize: 0.8, pressureOpacity: 0.45, spacing: 0.1, hardness: 0.6, tiltSize: 2 }),
    P('pencil-mech', 'Mechanical Pencil', PG, 'pencil fine technical', 'Constant thin 0.5mm lead, slight grain.', { tip: 'round', hardness: 1, size: 2, maxSize: 12, pressureSize: 0.2, pressureOpacity: 0.6, grain: 0.3, spacing: 0.05, smoothing: 0.2 }),
    P('graphite-soft', 'Soft Graphite', PG, 'graphite shading soft', 'Wide soft graphite for tonal shading.', { tip: 'grain', size: 18, maxSize: 80, flow: 0.5, opacity: 0.8, grain: 0.5, tiltSize: 3, hardness: 0.3, pressureOpacity: 0.8, pressureSize: 0.4 }),
    P('graphite-hard', 'Hard Graphite', PG, 'graphite crisp', 'Light, crisp graphite with strong tooth.', { tip: 'pencil', size: 6, maxSize: 30, flow: 0.45, grain: 0.75, hardness: 0.9, pressureOpacity: 0.8 }),
    P('sketch-rough', 'Rough Sketch Pencil', PG, 'sketch rough loose', 'Loose, jittery line for gesture drawing.', { tip: 'chalk', size: 6, maxSize: 30, scatter: 0.15, angleJitter: 1, grain: 0.5, sizeJitter: 0.2, spacing: 0.12, smoothing: 0.05 }),
    P('sketch-textured', 'Textured Sketch Pencil', PG, 'sketch texture rough-paper', 'Pencil on rough cold-press paper.', { tip: 'pencil', size: 8, maxSize: 40, grain: 0.7, grainType: 'rough', flow: 0.85, pressureOpacity: 0.6 }),
    P('pencil-colored', 'Colored Pencil', PG, 'colored pencil wax', 'Waxy coloured pencil with subtle value variance.', { tip: 'pencil', size: 6, maxSize: 30, flow: 0.7, grain: 0.6, valJitter: 0.03, opacity: 0.9, pressureOpacity: 0.7, tiltSize: 1.5 }),
    P('pencil-blend', 'Blending Pencil', PG, 'blend smudge pencil', 'Colourless blender that pushes graphite around.', { mode: 'smudge', tip: 'grain', size: 14, maxSize: 60, pickup: 0.55, wetness: 0.7, hardness: 0.5, spacing: 0.1 }),
    P('graphite-stick', 'Graphite Stick', PG, 'graphite block broad', 'Directional flat stick for big value blocks.', { tip: 'charcoal', size: 22, maxSize: 90, followDirection: true, grain: 0.5, flow: 0.8, pressureOpacity: 0.6, spacing: 0.08 }),
    P('pencil-shader', 'Tilt Shader', PG, 'shading tilt pencil', 'Responds strongly to stylus tilt for side-of-lead shading.', { tip: 'grain', size: 26, maxSize: 90, flow: 0.25, tiltSize: 4, grain: 0.65, pressureOpacity: 1, pressureSize: 0.3, hardness: 0.4, tiltAngle: true }),

    // Ink & pen
    P('ink-technical', 'Technical Pen', IP, 'ink technical uniform', 'Uniform width, perfectly opaque.', { size: 3, maxSize: 30, hardness: 1, pressureSize: 0, smoothing: 0.4, spacing: 0.04 }),
    P('ink-fineliner', 'Fine Liner', IP, 'ink fineliner', 'Fibre-tip liner with a whisper of pressure.', { size: 2, maxSize: 16, hardness: 1, pressureSize: 0.15, smoothing: 0.35, spacing: 0.04 }),
    P('ink-dip', 'Dip Pen', IP, 'ink nib dip pressure', 'Flexible nib: thin hairlines, swelling under pressure.', { size: 6, maxSize: 40, minSize: 0.05, hardness: 1, smoothing: 0.45, taperStart: 0.6, speedSize: 0.3, spacing: 0.04 }),
    P('ink-brushpen', 'Brush Pen', IP, 'ink brush pen taper', 'Juicy tapered brush-pen strokes.', { size: 12, maxSize: 60, minSize: 0.1, hardness: 0.95, taperStart: 1, speedSize: 0.5, smoothing: 0.4, spacing: 0.04 }),
    P('ink-calligraphy', 'Calligraphy Pen', IP, 'ink calligraphy chisel', 'Fixed 45° chisel nib.', { tip: 'flat', hardness: 1, size: 16, maxSize: 80, angle: 45, pressureSize: 0.5, smoothing: 0.4, spacing: 0.02 }),
    P('ink-comic', 'Comic Inker', IP, 'ink comic manga', 'Stabilised inker with tapering starts.', { size: 8, maxSize: 40, minSize: 0.15, taperStart: 0.8, smoothing: 0.55, speedSize: 0.35, spacing: 0.04 }),
    P('ink-variable', 'Variable Width Pen', IP, 'ink variable pressure', 'Extreme pressure range from hairline to bold.', { size: 10, maxSize: 60, minSize: 0.02, speedSize: 0.6, spacing: 0.04, smoothing: 0.35 }),
    P('ink-tapered', 'Tapered Liner', IP, 'ink taper', 'Long automatic entry taper.', { size: 7, maxSize: 40, taperStart: 1.5, minSize: 0.1, smoothing: 0.5, spacing: 0.04 }),
    P('ink-monoline', 'Monoline Pen', IP, 'ink monoline', 'Heavily stabilised constant line.', { size: 5, maxSize: 40, pressureSize: 0, hardness: 1, smoothing: 0.65, spacing: 0.04 }),
    P('ink-dry', 'Dry Ink', IP, 'ink dry texture', 'Ink skipping over rough paper.', { tip: 'grain', hardness: 0.9, size: 9, maxSize: 50, grain: 0.45, grainType: 'rough', flow: 0.95 }),
    P('ink-textured', 'Textured Ink', IP, 'ink texture sponge', 'Porous, broken ink edge.', { tip: 'sponge', size: 10, maxSize: 60, spacing: 0.15, grain: 0.3 }),
    P('ink-sumi', 'Sumi Brush', IP, 'ink sumi bristle', 'Bristle brush that follows stroke direction.', { tip: 'bristle', size: 24, maxSize: 120, followDirection: true, pressureSize: 0.9, flow: 0.9, spacing: 0.05, minSize: 0.15 }),
    P('ink-ballpoint', 'Ballpoint', IP, 'ink ballpoint pen', 'Ballpoint with pressure-driven density.', { size: 2.5, maxSize: 10, pressureOpacity: 0.5, pressureSize: 0.2, grain: 0.15, flow: 0.85, hardness: 0.95, spacing: 0.05 }),

    // Crisp Ink (editable vector-like paths)
    P('crisp-liner', 'Crisp Liner', CI, 'crisp vector ink editable', 'Editable path with pressure and soft tapers.', { mode: 'crisp', size: 6, maxSize: 60, taperStart: 0.3, taperEnd: 0.3, smoothing: 0.5 }),
    P('crisp-mono', 'Crisp Monoline', CI, 'crisp vector uniform', 'Editable path of constant width.', { mode: 'crisp', size: 4, maxSize: 60, pressureSize: 0, smoothing: 0.5 }),
    P('crisp-taper', 'Crisp Taper', CI, 'crisp taper elegant', 'Both ends taper to a point.', { mode: 'crisp', size: 10, maxSize: 80, taperStart: 0.8, taperEnd: 0.8, pressureSize: 0.8, smoothing: 0.6 }),
    P('crisp-brush', 'Crisp Brush', CI, 'crisp brush pressure', 'Wide pressure range, brush-like.', { mode: 'crisp', size: 16, maxSize: 100, minSize: 0.1, taperStart: 0.5, taperEnd: 0.5, smoothing: 0.45 }),
    P('crisp-detail', 'Crisp Detail', CI, 'crisp fine detail', 'Fine detail line with end taper.', { mode: 'crisp', size: 2, maxSize: 20, taperEnd: 0.4, smoothing: 0.35 }),
    P('crisp-bold', 'Crisp Bold', CI, 'crisp bold outline', 'Heavy outline, highly stabilised.', { mode: 'crisp', size: 28, maxSize: 150, taperStart: 0.2, taperEnd: 0.2, smoothing: 0.7 }),

    // Watercolor
    P('wc-transparent', 'Transparent Watercolor', WC, 'watercolor transparent glaze', 'Glazing wash with darkened wet edges.', { mode: 'wash', hardness: 0.4, size: 40, maxSize: 300, flow: 0.18, opacity: 0.55, spacing: 0.06, wetEdges: 0.5, granulation: 0.15, grain: 0.15, pressureSize: 0.5, smoothing: 0.2 }),
    P('wc-wet', 'Wet Watercolor', WC, 'watercolor wet bloom', 'Very wet, feathered paint with blooms.', { mode: 'wash', hardness: 0.1, size: 60, maxSize: 300, flow: 0.1, opacity: 0.5, wetEdges: 0.35, bloom: 0.5, granulation: 0.1, scatter: 0.05, pressureSize: 0.4 }),
    P('wc-dry', 'Dry Watercolor', WC, 'watercolor dry-brush', 'Dry-brush pigment catching paper tooth.', { mode: 'wash', tip: 'grain', hardness: 0.6, size: 30, maxSize: 200, flow: 0.3, opacity: 0.7, grain: 0.55, grainType: 'rough', wetEdges: 0.2 }),
    P('wc-granulating', 'Granulating Watercolor', WC, 'watercolor granulation pigment', 'Pigment settles into the paper texture.', { mode: 'wash', hardness: 0.4, size: 45, maxSize: 300, flow: 0.2, opacity: 0.6, granulation: 0.7, wetEdges: 0.4 }),
    P('wc-wash', 'Watercolor Wash', WC, 'watercolor wash large', 'Huge, even background wash.', { mode: 'wash', hardness: 0, size: 140, maxSize: 500, flow: 0.06, opacity: 0.45, wetEdges: 0.25, spacing: 0.05, pressureSize: 0.2 }),
    P('wc-edge', 'Edge Darkening', WC, 'watercolor edge', 'Strong pooled pigment at stroke edges.', { mode: 'wash', hardness: 0.6, size: 35, maxSize: 200, flow: 0.2, opacity: 0.5, wetEdges: 1 }),
    P('wc-bloom', 'Watercolor Bloom', WC, 'watercolor bloom cauliflower', 'Back-run blooms and cauliflower edges.', { mode: 'wash', hardness: 0.2, size: 50, maxSize: 260, flow: 0.15, opacity: 0.55, bloom: 1, wetEdges: 0.6 }),
    P('wc-detail', 'Watercolor Detail', WC, 'watercolor detail round', 'Pointed round for detail work.', { mode: 'wash', hardness: 0.7, size: 8, maxSize: 40, flow: 0.35, opacity: 0.75, wetEdges: 0.4, minSize: 0.1 }),
    P('wc-water', 'Water Brush', WC, 'watercolor water blend', 'Clear water that lifts and moves wet paint.', { mode: 'smudge', hardness: 0.1, size: 50, maxSize: 250, pickup: 0.35, wetness: 0.85, spacing: 0.08 }),
    P('wc-blender', 'Watercolor Blender', WC, 'watercolor blend', 'Damp brush for softening edges.', { mode: 'smudge', hardness: 0.3, size: 30, maxSize: 200, pickup: 0.6, wetness: 0.6, spacing: 0.08 }),
    P('wc-splatter', 'Watercolor Splatter', WC, 'watercolor splatter', 'Flicked droplets with wet edges.', { mode: 'wash', tip: 'splatter', size: 60, maxSize: 250, scatter: 0.3, flow: 0.3, opacity: 0.6, wetEdges: 0.3, angleJitter: 1, spacing: 0.5 }),

    // Pencil-watercolor
    P('pw-colored-wash', 'Colored Pencil + Wash', PW, 'mixed pencil watercolor', 'Pencil texture dissolving into a wash.', { mode: 'wash', tip: 'pencil', size: 14, maxSize: 80, flow: 0.3, opacity: 0.65, grain: 0.6, wetEdges: 0.45, granulation: 0.2 }),
    P('pw-graphite-wash', 'Graphite Wash', PW, 'mixed graphite watercolor', 'Water-soluble graphite.', { mode: 'wash', tip: 'grain', size: 20, maxSize: 100, flow: 0.25, opacity: 0.6, grain: 0.5, wetEdges: 0.3, hardness: 0.5 }),
    P('pw-underpainting', 'Watercolor Underpainting', PW, 'mixed underpainting', 'Loose toned ground for pencil work.', { mode: 'wash', hardness: 0.3, size: 80, maxSize: 400, flow: 0.1, opacity: 0.4, grain: 0.35, wetEdges: 0.2 }),
    P('pw-pigment', 'Pencil-Textured Pigment', PW, 'mixed pigment texture', 'Dry pigment with pencil tooth.', { tip: 'pencil', size: 10, maxSize: 50, flow: 0.55, grain: 0.7, grainType: 'rough', valJitter: 0.05 }),
    P('pw-dry-wet', 'Dry Pencil, Wet Edges', PW, 'mixed edges', 'Chalky core with pooled wet rims.', { mode: 'wash', tip: 'chalk', size: 16, maxSize: 80, flow: 0.4, opacity: 0.7, wetEdges: 0.8, grain: 0.4 }),
    P('pw-mixed', 'Mixed Media Brush', PW, 'mixed bristle wash', 'Bristle marks inside a transparent wash.', { mode: 'wash', tip: 'bristle', size: 26, maxSize: 120, flow: 0.3, opacity: 0.65, wetEdges: 0.5, grain: 0.3, followDirection: true }),
    P('pw-soluble', 'Water-Soluble Pencil', PW, 'mixed soluble pencil', 'Pencil that blooms slightly when wet.', { mode: 'wash', tip: 'pencil', size: 8, maxSize: 40, flow: 0.55, opacity: 0.85, wetEdges: 0.25, grain: 0.5, bloom: 0.2 }),

    // Pastel & chalk
    P('pastel-soft', 'Soft Pastel', PC, 'pastel soft', 'Powdery, broad pastel.', { tip: 'chalk', size: 28, maxSize: 120, flow: 0.7, grain: 0.6, grainType: 'rough', spacing: 0.1, angleJitter: 0.3, tiltSize: 1 }),
    P('pastel-hard', 'Hard Pastel', PC, 'pastel hard', 'Firmer stick, sharper marks.', { tip: 'pencil', size: 12, maxSize: 60, flow: 0.8, grain: 0.65 }),
    P('pastel-oil', 'Oil Pastel', PC, 'pastel oil waxy mix', 'Waxy stick that drags existing colour.', { mode: 'mix', tip: 'bristle', size: 24, maxSize: 100, flow: 0.95, pickup: 0.25, wetness: 0.4, grain: 0.2, spacing: 0.06 }),
    P('chalk', 'Chalk', PC, 'chalk board', 'Classic chalk with rough breakup.', { tip: 'chalk', size: 20, maxSize: 90, flow: 0.9, grain: 0.75, grainType: 'rough', angleJitter: 1 }),
    P('chalk-dust', 'Chalk Dust', PC, 'chalk dust powder', 'Scattered powder particles.', { tip: 'splatter', size: 40, maxSize: 160, scatter: 0.6, count: 2, flow: 0.4, sizeJitter: 0.5, angleJitter: 1, opacity: 0.8, spacing: 0.3 }),
    P('pastel-blended', 'Blended Pastel', PC, 'pastel blend smudge', 'Finger-blend pastel layers.', { mode: 'smudge', tip: 'chalk', size: 30, maxSize: 120, pickup: 0.5, wetness: 0.7 }),
    P('pastel-rough', 'Rough Pastel', PC, 'pastel rough canvas', 'Side of the stick on canvas texture.', { tip: 'charcoal', size: 30, maxSize: 120, followDirection: true, grain: 0.7, grainType: 'canvas', angleJitter: 0.2 }),
    P('chalk-colored', 'Colored Chalk', PC, 'chalk color jitter', 'Chalk with natural colour variation.', { tip: 'chalk', size: 18, maxSize: 80, flow: 0.8, grain: 0.7, hueJitter: 0.04, valJitter: 0.1 }),
    P('charcoal-vine', 'Vine Charcoal', PC, 'charcoal vine', 'Light, dusty charcoal.', { tip: 'charcoal', size: 16, maxSize: 80, flow: 0.7, grain: 0.55, grainType: 'rough', pressureOpacity: 0.8, tiltAngle: true }),

    // Paint & acrylic
    P('paint-flat', 'Flat Brush', PA, 'paint flat acrylic', 'Flat brush following the stroke.', { tip: 'flat', hardness: 0.9, size: 30, maxSize: 150, followDirection: true, spacing: 0.04, pressureSize: 0.4 }),
    P('paint-round', 'Round Brush', PA, 'paint round', 'All-purpose round.', { hardness: 0.85, size: 20, maxSize: 150, flow: 0.9, pressureSize: 0.7, pressureOpacity: 0.3, spacing: 0.05 }),
    P('paint-filbert', 'Filbert Brush', PA, 'paint filbert oval', 'Soft oval flat.', { tip: 'flat', hardness: 0.55, size: 28, maxSize: 150, followDirection: true, spacing: 0.04, pressureSize: 0.5 }),
    P('paint-bristle', 'Bristle Brush', PA, 'paint bristle', 'Visible bristle tracks.', { tip: 'bristle', size: 30, maxSize: 150, followDirection: true, flow: 0.85, spacing: 0.03, sizeJitter: 0.05 }),
    P('paint-dry', 'Dry Brush', PA, 'paint dry broken', 'Broken paint skipping over canvas.', { tip: 'bristle', size: 34, maxSize: 150, grain: 0.6, grainType: 'canvas', flow: 0.7, followDirection: true }),
    P('paint-wet', 'Wet Paint', PA, 'paint wet mix', 'Wet paint that mixes with what is beneath.', { mode: 'mix', hardness: 0.7, size: 26, maxSize: 150, pickup: 0.45, wetness: 0.6, spacing: 0.05 }),
    P('paint-opaque', 'Opaque Paint', PA, 'paint opaque cover', 'Solid covering paint.', { hardness: 0.95, size: 24, maxSize: 200, pressureSize: 0.3, spacing: 0.05 }),
    P('acrylic-textured', 'Textured Acrylic', PA, 'acrylic texture', 'Spongy acrylic on canvas.', { tip: 'sponge', size: 30, maxSize: 150, grain: 0.4, grainType: 'canvas', flow: 0.9 }),
    P('paint-roller', 'Paint Roller', PA, 'roller wide', 'Broad roller with fabric texture.', { tip: 'square', hardness: 0.85, size: 60, maxSize: 250, roundness: 0.3, followDirection: true, angle: 90, grain: 0.5, grainType: 'fabric', pressureSize: 0.1, spacing: 0.03 }),
    P('palette-knife', 'Palette Knife', PA, 'knife impasto mix', 'Drags and mixes thick paint.', { mode: 'mix', tip: 'square', hardness: 1, size: 40, maxSize: 160, roundness: 0.18, followDirection: true, angle: 90, pickup: 0.6, wetness: 0.3, spacing: 0.02, pressureSize: 0.3 }),
    P('gouache', 'Gouache', PA, 'gouache matte', 'Matte, almost-opaque gouache.', { hardness: 0.75, size: 24, maxSize: 150, flow: 0.85, grain: 0.25, grainType: 'canvas', opacity: 0.95, spacing: 0.05 }),

    // Oil
    P('oil-paint', 'Oil Paint', OL, 'oil paint mix', 'Buttery oil that picks up wet colour.', { mode: 'mix', hardness: 0.75, size: 26, maxSize: 160, pickup: 0.35, wetness: 0.55, spacing: 0.05 }),
    P('oil-thick', 'Thick Paint', OL, 'oil thick bristle', 'Loaded bristle brush on canvas.', { mode: 'mix', tip: 'bristle', size: 34, maxSize: 160, pickup: 0.25, wetness: 0.4, grain: 0.25, grainType: 'canvas', followDirection: true, spacing: 0.04 }),
    P('oil-soft', 'Soft Oil Brush', OL, 'oil soft blend', 'Soft mop that melts colours.', { mode: 'mix', hardness: 0.3, size: 40, maxSize: 200, pickup: 0.5, wetness: 0.7, flow: 0.7, spacing: 0.05 }),
    P('oil-bristle', 'Bristle Oil Brush', OL, 'oil bristle', 'Hog bristle with streaks.', { mode: 'mix', tip: 'bristle', size: 30, maxSize: 160, pickup: 0.4, followDirection: true, spacing: 0.03, wetness: 0.5 }),
    P('oil-blender', 'Oil Blender', OL, 'oil blend smudge', 'Dry fan blender.', { mode: 'smudge', hardness: 0.4, size: 40, maxSize: 200, pickup: 0.75, wetness: 0.8 }),
    P('oil-impasto', 'Impasto Knife', OL, 'oil impasto texture', 'Heavy textured impasto marks.', { mode: 'mix', tip: 'flat', hardness: 0.9, size: 36, maxSize: 160, pickup: 0.3, wetness: 0.3, grain: 0.35, grainType: 'canvas', followDirection: true, spacing: 0.03 }),
    P('oil-glaze', 'Oil Glaze', OL, 'oil glaze multiply', 'Thin multiplying glaze.', { hardness: 0.3, size: 60, maxSize: 300, flow: 0.12, opacity: 0.35, composite: 'multiply', spacing: 0.06 }),

    // Airbrush
    P('air-soft', 'Soft Airbrush', AB, 'airbrush soft', 'Feather-soft build-up.', { hardness: 0, size: 80, maxSize: 600, flow: 0.06, spacing: 0.05, pressureOpacity: 1, pressureSize: 0.2 }),
    P('air-hard', 'Hard Airbrush', AB, 'airbrush hard', 'Tighter airbrush edge.', { hardness: 0.7, size: 40, maxSize: 400, flow: 0.15, pressureOpacity: 1, pressureSize: 0.3, spacing: 0.05 }),
    P('air-fine', 'Fine Spray', AB, 'spray fine', 'Fine spatter of tiny droplets.', { hardness: 0.5, size: 3, maxSize: 12, scatter: 6, count: 8, flow: 0.4, sizeJitter: 0.5, spacing: 0.3, pressureSize: 0 }),
    P('air-broad', 'Broad Spray', AB, 'spray broad can', 'Spray-can coverage.', { hardness: 0.4, size: 6, maxSize: 20, scatter: 10, count: 14, flow: 0.35, sizeJitter: 0.6, spacing: 0.3, pressureSize: 0, pressureOpacity: 0.6 }),
    P('air-shading', 'Soft Shading', AB, 'shading soft', 'Gentle tonal shading.', { hardness: 0, size: 120, maxSize: 600, flow: 0.05, opacity: 0.6, pressureOpacity: 1, pressureSize: 0.1, spacing: 0.05 }),
    P('air-glow', 'Glow Brush', AB, 'glow light additive', 'Additive light for glows.', { hardness: 0, size: 60, maxSize: 400, flow: 0.1, composite: 'lighter', pressureOpacity: 1, spacing: 0.05 }),
    P('air-blend-low', 'Low-Opacity Blender', AB, 'blend soft low', 'Barely-there blending.', { mode: 'smudge', hardness: 0, size: 60, maxSize: 300, pickup: 0.3, wetness: 0.9 }),

    // Markers
    P('marker-alcohol', 'Alcohol Marker', MK, 'marker alcohol layering', 'Even layer that darkens where strokes overlap.', { hardness: 0.85, size: 18, maxSize: 80, opacity: 0.7, composite: 'multiply', spacing: 0.03, pressureSize: 0.2 }),
    P('marker-broad', 'Broad Marker', MK, 'marker chisel broad', 'Chisel nib at 30°.', { tip: 'flat', hardness: 0.9, size: 30, maxSize: 100, angle: 30, opacity: 0.8, composite: 'multiply', pressureSize: 0.1, spacing: 0.03 }),
    P('marker-fine', 'Fine Marker', MK, 'marker fine', 'Fine bullet tip.', { hardness: 0.95, size: 4, maxSize: 20, opacity: 0.9, composite: 'multiply', pressureSize: 0.1, spacing: 0.04 }),
    P('marker-brush', 'Brush Marker', MK, 'marker brush', 'Flexible brush-tip marker.', { hardness: 0.9, size: 14, maxSize: 60, minSize: 0.15, opacity: 0.75, composite: 'multiply', taperStart: 0.5, spacing: 0.03 }),
    P('highlighter', 'Highlighter', MK, 'highlighter', 'Translucent chisel highlighter.', { tip: 'square', hardness: 0.95, size: 24, maxSize: 60, roundness: 0.5, opacity: 0.45, composite: 'multiply', pressureSize: 0, spacing: 0.03 }),
    P('flat-color', 'Flat Color', MK, 'flat color fill', 'Hard opaque colour blocking.', { hardness: 1, size: 20, maxSize: 200, pressureSize: 0.2, smoothing: 0.3, spacing: 0.03 }),
    P('cel-shade', 'Cel Shading', MK, 'cel shading anime', 'Hard multiply shadow tone.', { hardness: 1, size: 30, maxSize: 200, opacity: 0.5, composite: 'multiply', pressureSize: 0, spacing: 0.03 }),
    P('comic-fill', 'Comic Fill', MK, 'comic fill block', 'Large, solid fill brush.', { hardness: 1, size: 60, maxSize: 400, pressureSize: 0, spacing: 0.03 }),

    // Texture & effects
    P('tex-grain', 'Grain', TX, 'texture grain noise', 'Speckled noise texture.', { tip: 'grain', size: 50, maxSize: 250, flow: 0.5, grain: 0.8, grainType: 'noise', scatter: 0.1, hardness: 0.4 }),
    P('tex-paper', 'Paper Texture', TX, 'texture paper', 'Reveals paper fibre texture.', { hardness: 0.2, size: 80, maxSize: 400, flow: 0.3, grain: 0.9 }),
    P('tex-fabric', 'Fabric Texture', TX, 'texture fabric weave', 'Woven fabric pattern.', { tip: 'fabric', size: 40, maxSize: 200, grain: 0.6, grainType: 'fabric', hardness: 0.6 }),
    P('tex-foliage', 'Foliage', TX, 'foliage leaves nature', 'Scattered leaves with colour variation.', { tip: 'leaf', size: 30, maxSize: 120, scatter: 0.9, count: 2, angleJitter: 1, sizeJitter: 0.5, spacing: 0.6, hueJitter: 0.06, valJitter: 0.2, satJitter: 0.1, pressureSize: 0.5 }),
    P('tex-clouds', 'Clouds', TX, 'clouds sky', 'Billowing soft cloud forms.', { tip: 'cloud', size: 120, maxSize: 400, flow: 0.3, scatter: 0.4, sizeJitter: 0.4, angleJitter: 1, spacing: 0.2, pressureSize: 0.4 }),
    P('tex-smoke', 'Smoke', TX, 'smoke wisps', 'Wispy translucent smoke.', { tip: 'cloud', size: 60, maxSize: 300, flow: 0.12, spacing: 0.08, scatter: 0.2, opacityJitter: 0.5, angleJitter: 1, pressureSize: 0.5 }),
    P('tex-stars', 'Stars', TX, 'stars sparkle', 'Scattered star shapes.', { tip: 'star', size: 10, maxSize: 60, scatter: 4, sizeJitter: 0.8, spacing: 1.2, opacityJitter: 0.6, angleJitter: 1, pressureSize: 0.3 }),
    P('tex-particles', 'Particles', TX, 'particles glow', 'Glowing dust particles.', { hardness: 0.6, size: 4, maxSize: 20, scatter: 6, count: 3, spacing: 0.9, sizeJitter: 0.8, opacityJitter: 0.5, composite: 'lighter', pressureSize: 0 }),
    P('tex-splatter', 'Splatter', TX, 'splatter ink drops', 'Ink splatter.', { tip: 'splatter', size: 60, maxSize: 250, scatter: 0.5, angleJitter: 1, sizeJitter: 0.5, spacing: 0.8 }),
    P('tex-organic', 'Organic Texture', TX, 'organic moss sponge', 'Mossy organic texture.', { tip: 'sponge', size: 40, maxSize: 200, angleJitter: 1, sizeJitter: 0.3, scatter: 0.2, valJitter: 0.08, spacing: 0.25 }),
    P('tex-halftone', 'Halftone Pattern', TX, 'pattern halftone dots', 'Comic halftone dots.', { tip: 'dots', hardness: 1, size: 40, maxSize: 200, spacing: 0.5, pressureSize: 0 }),
    P('tex-hatch', 'Hatching Pattern', TX, 'pattern hatching', 'Diagonal hatching.', { tip: 'hatch', size: 30, maxSize: 150, spacing: 0.4, pressureSize: 0 }),
    P('tex-sparkle', 'Sparkle Glow', TX, 'sparkle glow additive', 'Additive star glints.', { tip: 'star', size: 18, maxSize: 80, scatter: 2, sizeJitter: 0.7, spacing: 1.5, angleJitter: 1, composite: 'lighter', pressureSize: 0.2 }),
    P('stamp-hex', 'Image Stamp', TX, 'stamp custom image', 'Image-stamp brush — load your own image in Brush Studio.', { tip: 'stamp', stamp, size: 40, maxSize: 200, spacing: 1.1, angleJitter: 0.3, sizeJitter: 0.3, pressureSize: 0.4 }),

    // Blending
    P('blend-smudge', 'Smudge', BL, 'smudge blend', 'Classic smudge.', { mode: 'smudge', hardness: 0.5, size: 30, maxSize: 200, pickup: 0.7, wetness: 0.8 }),
    P('blend-soft', 'Soft Blender', BL, 'blend soft', 'Wide soft blend.', { mode: 'smudge', hardness: 0, size: 60, maxSize: 300, pickup: 0.45, wetness: 0.9 }),
    P('blend-texture', 'Textured Blender', BL, 'blend texture', 'Blends with a grainy tip.', { mode: 'smudge', tip: 'grain', hardness: 0.5, size: 30, maxSize: 200, pickup: 0.6, wetness: 0.7 }),
    P('blend-finger', 'Finger Blend', BL, 'blend finger', 'Strong finger-drag.', { mode: 'smudge', hardness: 0.7, size: 20, maxSize: 150, pickup: 0.85, wetness: 0.95 }),

    // Erasers
    P('eraser-hard', 'Hard Eraser', ER, 'eraser hard', 'Clean hard eraser.', { hardness: 1, size: 20, maxSize: 300, pressureSize: 0.3, spacing: 0.05 }),
    P('eraser-soft', 'Soft Eraser', ER, 'eraser soft', 'Airbrush-style eraser.', { hardness: 0, size: 60, maxSize: 400, flow: 0.25, pressureOpacity: 0.8, spacing: 0.05 }),
    P('eraser-pencil', 'Pencil Eraser', ER, 'eraser pencil', 'Textured kneaded-eraser feel.', { tip: 'pencil', size: 8, maxSize: 60, grain: 0.5 }),
    P('eraser-texture', 'Textured Eraser', ER, 'eraser texture chalk', 'Rough chalky erasing.', { tip: 'chalk', size: 30, maxSize: 150, grain: 0.6, grainType: 'rough' }),
  ];
}

/** Fingerprint of behaviour-relevant parameters (for duplicate detection). */
export function brushFingerprint(b: BrushParams) {
  const { id: _i, name: _n, category: _c, tags: _t, description: _d, builtin: _b, ...rest } = b;
  return hashString(JSON.stringify(rest, Object.keys(rest).sort()));
}

export function searchBrushes(list: BrushParams[], q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  const parts = s.split(/\s+/);
  return list.filter((b) => {
    const hay = (b.name + ' ' + b.category + ' ' + b.tags.join(' ') + ' ' + b.mode + ' ' + b.tip).toLowerCase();
    return parts.every((p) => hay.includes(p));
  });
}

export function exportBrushes(brushes: BrushParams[]) {
  return JSON.stringify({ format: 'carbon-brushes', version: 1, engine: ENGINE_VERSION, brushes }, null, 1);
}

const VALID_TIPS = ['round', 'square', 'grain', 'pencil', 'chalk', 'charcoal', 'bristle', 'flat', 'splatter', 'star', 'leaf', 'cloud', 'fabric', 'dots', 'sponge', 'hatch', 'stamp'];
const VALID_MODES = ['normal', 'wash', 'smudge', 'mix', 'crisp'];

export function parseBrushImport(text: string, existing: BrushParams[]) {
  let data: { format?: string; brushes?: unknown[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!data || data.format !== 'carbon-brushes' || !Array.isArray(data.brushes)) {
    throw new Error('Not a CARBON brush pack (.carbonbrush).');
  }
  const fps = new Set(existing.map(brushFingerprint));
  const added: BrushParams[] = [];
  const warnings: string[] = [];
  let duplicates = 0;
  for (const raw of data.brushes as Partial<BrushParams>[]) {
    if (!raw || typeof raw !== 'object') continue;
    const b: BrushParams = { ...BASE, ...raw, id: uid('cb-'), name: String(raw.name || 'Imported Brush'), category: String(raw.category || 'Imported'), tags: Array.isArray(raw.tags) ? raw.tags.map(String) : ['imported'], description: String(raw.description || ''), builtin: false };
    if (!VALID_TIPS.includes(b.tip)) {
      warnings.push(`"${b.name}": unknown tip "${b.tip}" — replaced with round.`);
      b.tip = 'round';
    }
    if (!VALID_MODES.includes(b.mode)) {
      warnings.push(`"${b.name}": unknown engine mode — using normal.`);
      b.mode = 'normal';
    }
    if (b.tip === 'stamp' && !b.stamp) warnings.push(`"${b.name}": missing stamp image — falls back to a round tip.`);
    if ((b.version || 1) > ENGINE_VERSION) warnings.push(`"${b.name}": authored for a newer brush engine; may look different.`);
    const fp = brushFingerprint(b);
    if (fps.has(fp)) {
      duplicates++;
      continue;
    }
    fps.add(fp);
    added.push(b);
  }
  return { added, duplicates, warnings };
}
