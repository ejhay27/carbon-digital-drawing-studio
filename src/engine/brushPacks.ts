// CARBON Brush Market: local catalog, Windows core presets and safe pack import.
// Bundled packs are always offline-ready. No remote endpoint is configured by default; imported packs remain pure JSON data.
import type { BrushParams, TipShape, GrainType, BrushMode } from './types';
import { BASE, brushFingerprint, ENGINE_VERSION } from './brushes';

type Core = Partial<Omit<BrushParams, 'id' | 'name' | 'category' | 'tags' | 'description'>>;
const mk = (id: string, name: string, category: string, tags: string, description: string, o: Core): BrushParams =>
  ({ ...BASE, ...o, id, name, category, tags: tags.split(' '), description, builtin: true });

// ---------------------------------------------------------------- Windows core presets (always available)
export function winCorePresets(): BrushParams[] {
  const PG = 'Pencil & Graphite', IP = 'Ink & Pen', PA = 'Paint & Acrylic', TX = 'Texture & Effects', NA = 'Nature', AR = 'Architecture & Materials';
  const grade = (id: string, name: string, flow: number, grain: number, hard: number, size: number, desc: string) =>
    mk(id, name, PG, 'pencil graphite grade', desc, { tip: 'pencil', size, maxSize: 40, flow, grain, hardness: hard, pressureOpacity: 0.75, pressureSize: 0.5, spacing: 0.11, smoothing: 0.15, tiltSize: 1.5, tiltAngle: true });
  return [
    grade('w-pencil-h', 'H Pencil', 0.58, 0.68, 0.88, 3.5, 'Hard grade: light, crisp, strong tooth.'),
    grade('w-pencil-b', 'B Pencil', 0.82, 0.48, 0.72, 5, 'Soft-medium grade, darker than HB.'),
    grade('w-pencil-3b', '3B Pencil', 0.88, 0.44, 0.66, 6, 'Soft grade for rich mid-tones.'),
    mk('w-pencil-8b', '8B Pencil', PG, 'pencil graphite very-soft', 'Softest grade: near-black, buttery, fills tooth.', { tip: 'grain', size: 12, maxSize: 60, flow: 1, grain: 0.28, hardness: 0.5, pressureSize: 0.85, pressureOpacity: 0.35, spacing: 0.09, tiltSize: 2.5 }),
    mk('w-pencil-tech', 'Hard Technical Pencil', PG, 'pencil technical drafting', 'Constant fine drafting line with light grain.', { tip: 'round', hardness: 1, size: 1.5, maxSize: 8, pressureSize: 0, pressureOpacity: 0.4, grain: 0.25, flow: 0.8, spacing: 0.05, smoothing: 0.5 }),
    mk('w-pencil-construct', 'Construction Pencil', PG, 'pencil construction light', 'Very light blue-grey-friendly line for layouts.', { tip: 'pencil', size: 3, maxSize: 20, flow: 0.35, opacity: 0.5, grain: 0.6, pressureOpacity: 0.6, smoothing: 0.3 }),
    mk('w-pencil-lineart', 'Clean Line-Art Pencil', PG, 'pencil lineart clean', 'Smooth, stabilised pencil with minimal grain for clean-up.', { tip: 'round', hardness: 0.9, size: 4, maxSize: 30, flow: 0.9, grain: 0.12, pressureSize: 0.8, minSize: 0.15, smoothing: 0.6, spacing: 0.04 }),
    mk('w-pencil-wcolor', 'Watercolor Pencil', PG, 'pencil watercolor soluble', 'Pencil lines that bleed softly with wet edges.', { mode: 'wash', tip: 'pencil', size: 7, maxSize: 40, flow: 0.6, opacity: 0.9, grain: 0.55, wetEdges: 0.35, bloom: 0.1 }),
    mk('w-pencil-charcoal', 'Charcoal Pencil', PG, 'pencil charcoal', 'Dense, dusty charcoal in pencil form.', { tip: 'charcoal', size: 7, maxSize: 40, flow: 0.95, grain: 0.5, grainType: 'rough', pressureOpacity: 0.5, tiltAngle: true }),
    mk('w-pen-fountain', 'Fountain Pen', IP, 'ink fountain pen nib', 'Angled italic nib: thick-thin variation by direction.', { tip: 'flat', hardness: 1, size: 7, maxSize: 30, angle: 35, roundness: 0.35, pressureSize: 0.35, smoothing: 0.4, spacing: 0.02, flow: 0.95 }),
    mk('w-pen-flex', 'Flexible Nib', IP, 'ink flex nib copperplate', 'Pointed flex nib: hairlines that swell under pressure.', { size: 9, maxSize: 40, minSize: 0.03, hardness: 1, pressureSize: 1, smoothing: 0.5, spacing: 0.03, taperStart: 0.4 }),
    mk('w-pen-gpen', 'G-Pen', IP, 'ink gpen manga', 'Manga G-pen: strong pressure range, crisp tapers.', { size: 8, maxSize: 40, minSize: 0.06, hardness: 1, pressureSize: 1, taperStart: 0.7, speedSize: 0.25, smoothing: 0.55, spacing: 0.03 }),
    mk('w-pen-mapping', 'Mapping Pen', IP, 'ink mapping fine manga', 'Very fine, stiff nib for detail and hatching.', { size: 2.5, maxSize: 12, minSize: 0.2, hardness: 1, pressureSize: 0.6, smoothing: 0.45, spacing: 0.03 }),
    mk('w-marker-soft', 'Soft Marker', IP, 'marker soft', 'Soft-edged felt marker with gentle build-up.', { hardness: 0.55, size: 16, maxSize: 70, opacity: 0.75, flow: 0.7, composite: 'multiply', pressureSize: 0.2, spacing: 0.04 }),
    mk('w-ink-rough', 'Rough Ink', IP, 'ink rough dry', 'Broken, dry-brush ink edge.', { tip: 'bristle', size: 14, maxSize: 60, grain: 0.55, grainType: 'rough', followDirection: true, flow: 0.95, spacing: 0.04 }),
    mk('w-ink-lineart', 'Pressure Line-Art', IP, 'ink lineart pressure', 'Clean pressure-sensitive line art with auto tapers.', { size: 6, maxSize: 40, minSize: 0.08, hardness: 1, pressureSize: 1, taperStart: 0.5, smoothing: 0.65, spacing: 0.03 }),
    mk('w-paint-acrylic', 'Acrylic Paint', PA, 'acrylic paint opaque', 'Opaque, slightly textured acrylic.', { mode: 'mix', tip: 'bristle', size: 26, maxSize: 150, pickup: 0.18, wetness: 0.3, grain: 0.15, grainType: 'canvas', followDirection: true, spacing: 0.04 }),
    mk('w-paint-wetblend', 'Wet Blending Brush', PA, 'blend wet paint', 'Wet brush that softens and mixes colours already down.', { mode: 'mix', hardness: 0.35, size: 40, maxSize: 200, pickup: 0.7, wetness: 0.85, flow: 0.55, spacing: 0.05 }),
    mk('w-paint-spray', 'Spray Paint', PA, 'spray graffiti can', 'Dense spray can with drippy edges.', { hardness: 0.3, size: 8, maxSize: 30, scatter: 7, count: 18, flow: 0.45, sizeJitter: 0.6, spacing: 0.25, pressureSize: 0, pressureOpacity: 0.7 }),
    mk('w-tex-grass', 'Grass', NA, 'grass nature', 'Clumps of grass blades with colour variation.', { tip: 'grass', size: 50, maxSize: 200, scatter: 0.6, count: 2, sizeJitter: 0.4, angleJitter: 0.05, spacing: 0.35, hueJitter: 0.04, valJitter: 0.18, pressureSize: 0.6, hardness: 1 }),
    mk('w-tex-leaves', 'Leaves', NA, 'leaves foliage', 'Dense, rotated leaf scatter.', { tip: 'leaf', size: 22, maxSize: 100, scatter: 1.2, count: 3, angleJitter: 1, sizeJitter: 0.6, spacing: 0.5, hueJitter: 0.08, valJitter: 0.25, satJitter: 0.15 }),
    mk('w-tex-flowers', 'Flowers', NA, 'flowers petals', 'Scattered blossoms with hue variation.', { tip: 'flower', size: 26, maxSize: 120, scatter: 1.4, count: 2, angleJitter: 1, sizeJitter: 0.5, spacing: 0.9, hueJitter: 0.12, valJitter: 0.1, pressureSize: 0.4 }),
    mk('w-tex-tree', 'Tree Canopy', NA, 'trees foliage canopy', 'Clumped canopy mass with dark/light variation.', { tip: 'cloud', size: 80, maxSize: 300, scatter: 0.5, count: 2, sizeJitter: 0.5, angleJitter: 1, valJitter: 0.25, hueJitter: 0.05, grain: 0.35, flow: 0.7, spacing: 0.25 }),
    mk('w-tex-hair', 'Hair Strands', NA, 'hair strands', 'Flowing strands that follow the stroke.', { tip: 'hair', size: 40, maxSize: 160, followDirection: true, flow: 0.6, spacing: 0.06, pressureSize: 0.7, opacityJitter: 0.3, valJitter: 0.06 }),
    mk('w-tex-fur', 'Fur', NA, 'fur animal', 'Short directional fur tufts.', { tip: 'hair', size: 18, maxSize: 80, followDirection: true, angleJitter: 0.12, scatter: 0.3, count: 2, spacing: 0.2, flow: 0.7, sizeJitter: 0.4, valJitter: 0.12 }),
    mk('w-tex-stone', 'Stone', AR, 'stone rock', 'Mottled stone surface.', { tip: 'rock', size: 60, maxSize: 250, angleJitter: 1, sizeJitter: 0.3, valJitter: 0.15, grain: 0.3, grainType: 'rough', spacing: 0.3 }),
    mk('w-tex-concrete', 'Concrete', AR, 'concrete wall', 'Porous concrete with pitting.', { tip: 'sponge', size: 70, maxSize: 300, flow: 0.45, grain: 0.7, grainType: 'noise', angleJitter: 1, spacing: 0.2, opacityJitter: 0.4 }),
    mk('w-tex-wood', 'Wood Grain', AR, 'wood grain plank', 'Directional wood grain.', { tip: 'wood', size: 60, maxSize: 260, followDirection: true, flow: 0.8, spacing: 0.08, valJitter: 0.05 }),
    mk('w-tex-metal', 'Brushed Metal', AR, 'metal brushed scratch', 'Fine brushed-metal scratches.', { tip: 'scratch', size: 70, maxSize: 260, followDirection: true, flow: 0.35, opacityJitter: 0.5, spacing: 0.1, composite: 'screen' }),
    mk('w-tex-brick', 'Brick Wall', AR, 'brick architecture pattern', 'Running-bond brick pattern stamp.', { tip: 'brick', size: 80, maxSize: 300, spacing: 0.98, pressureSize: 0, valJitter: 0.1, hueJitter: 0.02 }),
    mk('w-tex-windows', 'Building Windows', AR, 'buildings architecture windows city', 'Façade window grid for city scenes.', { tip: 'window', size: 70, maxSize: 260, spacing: 1, pressureSize: 0, opacityJitter: 0.3 }),
    mk('w-tex-rain', 'Rain', TX, 'rain weather', 'Slanted streaks of rain.', { tip: 'drop', size: 24, maxSize: 90, scatter: 4, count: 4, angle: 15, roundness: 0.25, sizeJitter: 0.6, opacityJitter: 0.6, spacing: 0.5, pressureSize: 0 }),
    mk('w-tex-snow', 'Snow', TX, 'snow weather flakes', 'Snowflakes of varying size.', { tip: 'snow', size: 12, maxSize: 60, scatter: 5, count: 3, sizeJitter: 0.8, angleJitter: 1, opacityJitter: 0.5, spacing: 0.8, pressureSize: 0 }),
    mk('w-tex-fire', 'Fire', TX, 'fire flames', 'Licking flames with additive glow.', { tip: 'flame', size: 60, maxSize: 260, followDirection: false, angleJitter: 0.08, scatter: 0.3, sizeJitter: 0.5, flow: 0.5, hueJitter: 0.04, composite: 'lighter', spacing: 0.2 }),
    mk('w-tex-sparks', 'Sparks', TX, 'sparks embers fire', 'Hot embers flying off.', { hardness: 0.8, size: 3, maxSize: 14, scatter: 8, count: 3, sizeJitter: 0.8, opacityJitter: 0.6, spacing: 0.8, hueJitter: 0.04, composite: 'lighter', pressureSize: 0 }),
    mk('w-tex-pattern', 'Ornament Pattern', TX, 'pattern decorative ornament', 'Repeating decorative ornament.', { tip: 'ornament', size: 40, maxSize: 160, spacing: 1.05, pressureSize: 0 }),
    mk('w-tex-lace', 'Dotted Lace', TX, 'pattern lace decorative', 'Delicate repeating dot lace.', { tip: 'dots', size: 30, maxSize: 120, spacing: 0.7, angle: 45, pressureSize: 0, roundness: 0.8 }),
  ].map((b) => ({ ...b, version: ENGINE_VERSION }));
}

// ---------------------------------------------------------------- catalog packs
export interface PackDef { id: string; name: string; category: string; version: number; description: string; featured?: boolean; creator?: string; license?: string; brushes: () => BrushParams[] }

type Recipe = { name: string; o: Core };
function family(packId: string, category: string, bases: Recipe[], mods: Recipe[], tag: string): BrushParams[] {
  const out: BrushParams[] = [];
  bases.forEach((b, i) => mods.forEach((m, j) => {
    const o = { ...b.o, ...m.o };
    // relative modifiers
    if (m.o.size && b.o.size) o.size = b.o.size * (m.o.size as number);
    out.push(mk(`pk-${packId}-${i}-${j}`, `${b.name} · ${m.name}`, category, `${tag} ${packId} pack`, `${b.name} with ${m.name.toLowerCase()} behaviour.`, o));
  }));
  return out;
}
const R = (name: string, o: Core): Recipe => ({ name, o });
const grains: GrainType[] = ['paper', 'rough', 'canvas', 'fabric', 'noise'];

export const CATALOG: PackDef[] = [
  { id: 'sketch', name: 'Sketching Essentials', category: 'Sketching', version: 1, description: 'Loose gesture tools for thumbnails and roughs.', featured: true, brushes: () => family('sketch', 'Sketching', [R('Gesture Graphite', { tip: 'pencil', size: 6, flow: 0.8, grain: 0.5 }), R('Blue Line', { tip: 'pencil', size: 4, flow: 0.4, opacity: 0.6, grain: 0.4 }), R('Rough Liner', { tip: 'chalk', size: 5, scatter: 0.12, angleJitter: 1 }), R('Felt Sketch', { hardness: 0.7, size: 5, composite: 'multiply', opacity: 0.8 })], [R('Smooth paper', { grain: 0.15, grainType: 'paper' }), R('Cold press', { grainType: 'rough', grain: 0.6 }), R('Stabilised', { smoothing: 0.65 }), R('Fast taper', { taperStart: 0.8, speedSize: 0.5 }), R('Broad', { size: 2, pressureSize: 0.4 })], 'sketch') },
  { id: 'pencil', name: 'Graphite Atelier', category: 'Pencil', version: 1, description: 'Graphite on many papers, from drafting to shading.', featured: true, brushes: () => family('pencil', 'Pencil', [R('Graphite Lead', { tip: 'pencil', size: 5, flow: 0.8 }), R('Carbon Lead', { tip: 'charcoal', size: 6, flow: 0.95 }), R('Wax Colored', { tip: 'pencil', size: 6, flow: 0.7, valJitter: 0.04 }), R('Woodless Graphite', { tip: 'grain', size: 12, hardness: 0.5 })], [R('Bristol', { grain: 0.2 }), R('Cartridge', { grain: 0.5, grainType: 'paper' }), R('Toothy', { grain: 0.75, grainType: 'rough' }), R('Tilt shader', { tiltSize: 3, tiltAngle: true, pressureOpacity: 0.9 }), R('Pressure dark', { pressureOpacity: 1, pressureSize: 0.2 }), R('Canvas board', { grain: 0.5, grainType: 'canvas' })], 'pencil') },
  { id: 'ink', name: 'Ink & Nib', category: 'Ink', version: 1, description: 'Nibs, brushes and technical pens for line art.', featured: true, brushes: () => family('ink', 'Ink', [R('Round Nib', { hardness: 1, size: 6, minSize: 0.08 }), R('Chisel Nib', { tip: 'flat', hardness: 1, size: 10, angle: 40 }), R('Sable Brush', { size: 12, minSize: 0.05, taperStart: 1 }), R('Tech Pen', { hardness: 1, size: 3, pressureSize: 0 })], [R('Clean', { smoothing: 0.55 }), R('Dry drag', { grain: 0.45, grainType: 'rough' }), R('Speed thin', { speedSize: 0.6 }), R('Heavy', { size: 1.8 }), R('Splotchy', { tip: 'sponge', spacing: 0.12 }), R('Taper in', { taperStart: 1.2 })], 'ink') },
  { id: 'paint', name: 'Studio Paint', category: 'Painting', version: 1, description: 'Bristle, flat and round painting tools.', brushes: () => family('paint', 'Painting', [R('Hog Round', { tip: 'bristle', size: 28, followDirection: true }), R('Synthetic Flat', { tip: 'flat', size: 30, followDirection: true, hardness: 0.9 }), R('Filbert', { tip: 'flat', size: 26, hardness: 0.55, followDirection: true }), R('Fan', { tip: 'hair', size: 40, followDirection: true, flow: 0.7 })], [R('Opaque', { flow: 1 }), R('Mixing', { mode: 'mix', pickup: 0.4, wetness: 0.5 }), R('Dry', { grain: 0.6, grainType: 'canvas', flow: 0.7 }), R('Glaze', { opacity: 0.4, flow: 0.4, composite: 'multiply' }), R('Loaded', { size: 1.5, pressureSize: 0.6 })], 'paint') },
  { id: 'water', name: 'Watercolor Garden', category: 'Watercolor', version: 1, description: 'Washes, blooms and granulating pigments.', brushes: () => family('water', 'Watercolor', [R('Round Wash', { mode: 'wash', hardness: 0.3, size: 40, flow: 0.18, opacity: 0.55 }), R('Mop', { mode: 'wash', hardness: 0.05, size: 90, flow: 0.08, opacity: 0.45 }), R('Rigger', { mode: 'wash', hardness: 0.75, size: 6, flow: 0.4 }), R('Dry Pigment', { mode: 'wash', tip: 'grain', size: 30, flow: 0.3 })], [R('Wet edges', { wetEdges: 0.8 }), R('Blooms', { bloom: 0.8, wetEdges: 0.4 }), R('Granulating', { granulation: 0.75 }), R('Rough paper', { grain: 0.5, grainType: 'rough' }), R('Soft', { wetEdges: 0.15 }), R('Salt', { bloom: 0.5, granulation: 0.4 })], 'watercolor') },
  { id: 'oil', name: 'Oil Masters', category: 'Oil', version: 1, description: 'Buttery mixing oils and impasto knives.', brushes: () => family('oil', 'Oil', [R('Oil Round', { mode: 'mix', size: 26, hardness: 0.75 }), R('Oil Bristle', { mode: 'mix', tip: 'bristle', size: 32, followDirection: true }), R('Knife', { mode: 'mix', tip: 'square', roundness: 0.2, size: 40, angle: 90, followDirection: true, hardness: 1 }), R('Soft Sable Oil', { mode: 'mix', hardness: 0.3, size: 36 })], [R('Fat', { pickup: 0.2, wetness: 0.35 }), R('Lean', { pickup: 0.55, wetness: 0.7, flow: 0.7 }), R('Impasto', { grain: 0.35, grainType: 'canvas' }), R('Scumble', { flow: 0.5, grain: 0.5, grainType: 'rough' }), R('Blender', { mode: 'smudge', pickup: 0.7, wetness: 0.8 })], 'oil') },
  { id: 'pastel', name: 'Pastel Box', category: 'Pastel', version: 1, description: 'Soft, hard and oil pastels.', brushes: () => family('pastel', 'Pastel', [R('Soft Stick', { tip: 'chalk', size: 26 }), R('Hard Stick', { tip: 'pencil', size: 12 }), R('Oil Stick', { mode: 'mix', tip: 'bristle', size: 22, pickup: 0.25 }), R('Pan Pastel', { tip: 'cloud', size: 50, flow: 0.4 })], [R('Sanded paper', { grain: 0.75, grainType: 'rough' }), R('Velour', { grain: 0.3, grainType: 'fabric' }), R('Side stroke', { tip: 'charcoal', followDirection: true }), R('Dusty', { scatter: 0.3, angleJitter: 1 }), R('Blended', { mode: 'smudge', pickup: 0.5, wetness: 0.7 })], 'pastel') },
  { id: 'charcoal', name: 'Charcoal Studio', category: 'Charcoal', version: 1, description: 'Vine, compressed and powdered charcoal.', brushes: () => family('charcoal', 'Charcoal', [R('Vine', { tip: 'charcoal', size: 14, flow: 0.7 }), R('Compressed', { tip: 'charcoal', size: 18, flow: 1, hardness: 0.8 }), R('Powder', { tip: 'cloud', size: 70, flow: 0.25 }), R('Willow', { tip: 'chalk', size: 10 })], [R('Laid paper', { grain: 0.65, grainType: 'fabric' }), R('Rough', { grain: 0.7, grainType: 'rough' }), R('Tilted', { tiltSize: 3, tiltAngle: true }), R('Smudged', { mode: 'smudge', pickup: 0.6, wetness: 0.8 }), R('Heavy', { pressureOpacity: 0.3, size: 1.4 })], 'charcoal') },
  { id: 'texture', name: 'Surface Textures', category: 'Texture', version: 1, description: 'Grains, sponges and noise for surfaces.', brushes: () => family('texture', 'Texture', [R('Sponge', { tip: 'sponge', size: 50 }), R('Grain Dust', { tip: 'grain', size: 60, hardness: 0.4 }), R('Dots', { tip: 'dots', size: 40, spacing: 0.6 }), R('Stipple', { hardness: 0.9, size: 3, scatter: 6, count: 6, spacing: 0.4 })], grains.map((g) => R(`${g[0].toUpperCase()}${g.slice(1)} grain`, { grain: 0.6, grainType: g })).concat([R('Jittered', { angleJitter: 1, sizeJitter: 0.5 })]), 'texture') },
  { id: 'nature', name: 'Nature Kit', category: 'Nature', version: 1, description: 'Grass, flowers and natural elements.', brushes: () => family('nature', 'Nature', [R('Grass Clump', { tip: 'grass', size: 50, scatter: 0.5, spacing: 0.35 }), R('Wild Flowers', { tip: 'flower', size: 24, scatter: 1.3, spacing: 0.9, angleJitter: 1 }), R('Pebbles', { tip: 'rock', size: 30, scatter: 1, spacing: 0.6, angleJitter: 1 }), R('Moss', { tip: 'sponge', size: 40, angleJitter: 1 })], [R('Spring', { hueJitter: 0.08, valJitter: 0.2 }), R('Autumn', { hueJitter: 0.14, satJitter: 0.2 }), R('Dense', { count: 3, spacing: 0.25 }), R('Sparse', { count: 1, spacing: 1.2 }), R('Tall', { roundness: 0.6, sizeJitter: 0.6 })], 'nature') },
  { id: 'foliage', name: 'Foliage & Trees', category: 'Foliage', version: 1, description: 'Leaves, canopies and bushes.', brushes: () => family('foliage', 'Foliage', [R('Leaf Scatter', { tip: 'leaf', size: 22, scatter: 1.1, count: 2, angleJitter: 1 }), R('Canopy', { tip: 'cloud', size: 80, scatter: 0.4 }), R('Bush', { tip: 'sponge', size: 50, scatter: 0.4, angleJitter: 1 }), R('Pine Needles', { tip: 'hair', size: 30, angleJitter: 0.3, scatter: 0.4 })], [R('Sunlit', { valJitter: 0.25, hueJitter: 0.05 }), R('Shadow mass', { flow: 0.6, valJitter: 0.1 }), R('Distant', { grain: 0.4, flow: 0.5 }), R('Wind', { angle: 25, angleJitter: 0.15 }), R('Lush', { count: 3, satJitter: 0.15 })], 'foliage') },
  { id: 'clouds', name: 'Skies & Clouds', category: 'Clouds', version: 1, description: 'Cumulus, wisps, fog and smoke.', brushes: () => family('clouds', 'Clouds', [R('Cumulus', { tip: 'cloud', size: 120, scatter: 0.4, sizeJitter: 0.4 }), R('Cirrus Wisp', { tip: 'hair', size: 90, followDirection: true, flow: 0.25 }), R('Fog', { hardness: 0, size: 200, flow: 0.05 }), R('Smoke Plume', { tip: 'cloud', size: 70, flow: 0.12, opacityJitter: 0.5 })], [R('Soft', { flow: 0.2 }), R('Bright rim', { composite: 'screen' }), R('Stormy', { valJitter: 0.25, grain: 0.3 }), R('Billowing', { angleJitter: 1, sizeJitter: 0.6 }), R('Sunset glow', { composite: 'lighter', flow: 0.15 })], 'clouds sky') },
  { id: 'hair', name: 'Hair & Fur', category: 'Hair', version: 1, description: 'Strands, locks and fur textures.', brushes: () => family('hair', 'Hair', [R('Strands', { tip: 'hair', size: 40, followDirection: true, flow: 0.6 }), R('Fine Hair', { hardness: 1, size: 1.5, minSize: 0.05, taperStart: 1, smoothing: 0.4 }), R('Fur Tufts', { tip: 'hair', size: 18, scatter: 0.3, count: 2 }), R('Curls', { tip: 'ornament', size: 20, scatter: 0.3 })], [R('Silky', { smoothing: 0.6, opacityJitter: 0.2 }), R('Coarse', { grain: 0.4 }), R('Highlights', { composite: 'screen', flow: 0.4 }), R('Dense', { count: 3 }), R('Tapered', { taperStart: 1.2, speedSize: 0.4 })], 'hair fur') },
  { id: 'fabric', name: 'Fabric & Cloth', category: 'Fabric', version: 1, description: 'Weaves, knits and fabric folds.', brushes: () => family('fabric', 'Fabric', [R('Weave', { tip: 'fabric', size: 40 }), R('Denim', { tip: 'hatch', size: 40, angle: 30 }), R('Velvet', { hardness: 0.1, size: 60, flow: 0.2 }), R('Lace', { tip: 'dots', size: 30, spacing: 0.7 })], [R('Fine', { size: 0.6 }), R('Coarse', { size: 1.6, grain: 0.4, grainType: 'fabric' }), R('Worn', { opacityJitter: 0.5, grain: 0.5 }), R('Sheen', { composite: 'screen', flow: 0.4 }), R('Shadow fold', { composite: 'multiply', opacity: 0.5 })], 'fabric cloth') },
  { id: 'arch', name: 'Architecture', category: 'Architecture', version: 1, description: 'Bricks, windows, stone and wood.', brushes: () => family('arch', 'Architecture', [R('Brick', { tip: 'brick', size: 80, spacing: 0.98, pressureSize: 0 }), R('Windows', { tip: 'window', size: 70, spacing: 1, pressureSize: 0 }), R('Stone Block', { tip: 'rock', size: 60 }), R('Planks', { tip: 'wood', size: 60, followDirection: true })], [R('New', { valJitter: 0.05 }), R('Weathered', { grain: 0.5, grainType: 'rough', opacityJitter: 0.3 }), R('Night', { valJitter: 0.4 }), R('Blueprint', { composite: 'screen', flow: 0.6 }), R('Large', { size: 1.8 })], 'architecture buildings') },
  { id: 'manga', name: 'Manga Toolkit', category: 'Manga', version: 1, description: 'G-pens, tones and manga effects brushes.', brushes: () => family('manga', 'Manga', [R('G-Pen', { hardness: 1, size: 8, minSize: 0.06, taperStart: 0.7 }), R('Maru Pen', { hardness: 1, size: 3, minSize: 0.15 }), R('Tone Dots', { tip: 'dots', size: 40, spacing: 0.5, pressureSize: 0 }), R('Hatch Tone', { tip: 'hatch', size: 40, spacing: 0.4, pressureSize: 0 })], [R('Crisp', { smoothing: 0.6 }), R('Wide', { size: 1.6 }), R('Light', { opacity: 0.5 }), R('Angled', { angle: 45 }), R('Gradient fade', { pressureOpacity: 1 })], 'manga') },
  { id: 'comics', name: 'Comic Inks', category: 'Comics', version: 1, description: 'Western comic inking brushes and fills.', brushes: () => family('comics', 'Comics', [R('Brush Inker', { size: 12, minSize: 0.08, taperStart: 1, speedSize: 0.4 }), R('Feather', { size: 6, minSize: 0.02, taperStart: 1.5 }), R('Spot Black', { hardness: 1, size: 60, pressureSize: 0 }), R('Crosshatch', { tip: 'hatch', size: 30 })], [R('Clean', { smoothing: 0.6 }), R('Dry brush', { tip: 'bristle', grain: 0.4 }), R('Splatter', { tip: 'splatter', scatter: 0.5, spacing: 0.8 }), R('Bold', { size: 1.6 }), R('Fine', { size: 0.6 })], 'comics ink') },
  { id: 'fx', name: 'Special Effects', category: 'Special effects', version: 1, description: 'Glows, sparks, weather and magic.', brushes: () => family('fx', 'Special effects', [R('Glow', { hardness: 0, size: 60, flow: 0.1, composite: 'lighter' }), R('Sparkle', { tip: 'star', size: 18, scatter: 2, spacing: 1.4, composite: 'lighter' }), R('Embers', { hardness: 0.8, size: 3, scatter: 8, count: 3, composite: 'lighter' }), R('Rain', { tip: 'drop', size: 24, scatter: 4, count: 4, roundness: 0.3 })], [R('Warm', { hueJitter: 0.04 }), R('Cool', { hueJitter: 0.02, satJitter: 0.3 }), R('Intense', { flow: 0.4 }), R('Subtle', { flow: 0.06, opacity: 0.6 }), R('Chaotic', { angleJitter: 1, sizeJitter: 0.8 })], 'effects') },
  { id: 'blend', name: 'Blending Suite', category: 'Blending', version: 1, description: 'Smudgers, blenders and softeners.', brushes: () => family('blend', 'Blending', [R('Smudge', { mode: 'smudge', size: 30, pickup: 0.7, wetness: 0.8 }), R('Wet Blender', { mode: 'mix', size: 40, pickup: 0.7, wetness: 0.85, flow: 0.5 }), R('Soft Blender', { mode: 'smudge', hardness: 0, size: 60, pickup: 0.4, wetness: 0.9 }), R('Tortillon', { mode: 'smudge', tip: 'grain', size: 12, pickup: 0.6 })], [R('Gentle', { pickup: 0.3 }), R('Strong', { pickup: 0.9 }), R('Textured', { tip: 'chalk' }), R('Bristle', { tip: 'bristle', followDirection: true }), R('Wide', { size: 2 })], 'blend') },
].map((p) => ({ ...p, brushes: memo(p.brushes) }));

function memo<T>(f: () => T): () => T {
  let v: T | undefined;
  return () => (v === undefined ? (v = f()) : v);
}

// ---------------------------------------------------------------- installed-pack registry
export interface InstalledPack { id: string; name: string; version: number; source: 'catalog' | 'import' | 'remote'; category: string; brushes?: BrushParams[]; missing?: boolean }
let installed: InstalledPack[] = [];
const winCoreMemo = memo(() => winCorePresets());
let cache: BrushParams[] | null = null;

export function setInstalledPacks(list: InstalledPack[]) {
  installed = list;
  const out = [...winCoreMemo()];
  for (const p of list) {
    if (p.brushes && !p.missing) out.push(...p.brushes);
    else if (p.source === 'catalog') { const d = CATALOG.find((c) => c.id === p.id); if (d) out.push(...d.brushes()); }
  }
  cache = out;
}
/** Brushes contributed by the Windows core set and installed packs (Windows edition only). */
export function extraBrushes(enabled: boolean): BrushParams[] { return enabled ? cache || winCoreMemo() : []; }
export const installedPacks = () => installed;

// ---------------------------------------------------------------- safe import
const TIPS: TipShape[] = ['round', 'square', 'grain', 'pencil', 'chalk', 'charcoal', 'bristle', 'flat', 'splatter', 'star', 'leaf', 'cloud', 'fabric', 'dots', 'sponge', 'hatch', 'stamp', 'grass', 'hair', 'flower', 'drop', 'snow', 'flame', 'brick', 'wood', 'scratch', 'rock', 'window', 'ornament'];
const MODES: BrushMode[] = ['normal', 'wash', 'smudge', 'mix', 'crisp'];
const NUM_KEYS = Object.keys(BASE).filter((k) => typeof (BASE as unknown as Record<string, unknown>)[k] === 'number');
function validStampDataUrl(value: string): boolean {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length >= 400_000 || match[2].length % 4 !== 0) return false;
  try {
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
    if (bytes.length < 12 || bytes.length > 300_000) return false;
    if (match[1] === 'png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    if (match[1] === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    return String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  } catch { return false; }
}
export const DEFAULT_MAX_BRUSH_PACK_BYTES = 100 * 1024 * 1024;
export const MAX_BRUSH_PACK_BYTES = 512 * 1024 * 1024;

/** Validate a .carbonpack / .carbonbrush file: JSON data only, bounded UTF-8 size/count, numeric ranges clamped, stamps must be small image data URLs. */
export function parsePack(text: string, existing: BrushParams[], maxBytes = DEFAULT_MAX_BRUSH_PACK_BYTES): { pack: InstalledPack; duplicates: number; warnings: string[] } {
  const limit = Number.isFinite(maxBytes) ? Math.max(1, Math.floor(maxBytes)) : DEFAULT_MAX_BRUSH_PACK_BYTES;
  if (new TextEncoder().encode(text).byteLength > limit) throw new Error(`Pack exceeds the ${Math.round(limit / (1024 * 1024))} MB import limit.`);
  let data: { format?: string; id?: string; name?: string; version?: number; engine?: unknown; category?: string; brushes?: unknown[] };
  try { data = JSON.parse(text); } catch { throw new Error('File is not valid JSON.'); }
  if (!data || (data.format !== 'carbon-brushpack' && data.format !== 'carbon-brushes') || !Array.isArray(data.brushes)) throw new Error('Not a CARBON brush pack.');
  if (data.engine !== undefined && Number(data.engine) !== ENGINE_VERSION) throw new Error(`Pack requires brush engine v${String(data.engine)}; this app supports v${ENGINE_VERSION}.`);
  if (data.brushes.length > 2000) throw new Error('Pack contains more than 2000 brushes.');
  const fps = new Set(existing.map(brushFingerprint));
  const warnings: string[] = [];
  let duplicates = 0;
  const rawPackId = String(data.id || 'import-' + Date.now().toString(36)).replace(/[^a-z0-9._-]/gi, '').slice(0, 80) || 'import';
  // Imported packs are namespaced once. Re-export/reload keeps the same namespace and brush IDs.
  const packId = rawPackId.replace(/^imp-/i, '') || 'import';
  const brushes: BrushParams[] = [];
  data.brushes.forEach((raw0, i) => {
    const raw = (raw0 || {}) as Record<string, unknown>;
    const b: BrushParams = { ...BASE, id: `ip-${packId}-${i}`, name: String(raw.name || `Brush ${i + 1}`).slice(0, 60), category: String(raw.category || data.category || 'Imported').slice(0, 40), tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 12) : ['imported'], description: String(raw.description || '').slice(0, 300), builtin: false };
    for (const k of NUM_KEYS) {
      const v = Number(raw[k]);
      if (Number.isFinite(v)) (b as unknown as Record<string, number>)[k] = Math.max(-360, Math.min(1000, v));
    }
    b.tip = TIPS.includes(raw.tip as TipShape) ? (raw.tip as TipShape) : 'round';
    b.mode = MODES.includes(raw.mode as BrushMode) ? (raw.mode as BrushMode) : 'normal';
    b.grainType = grains.includes(raw.grainType as GrainType) ? (raw.grainType as GrainType) : 'paper';
    b.composite = (['source-over', 'multiply', 'screen', 'lighter', 'darken'] as const).find((c) => c === raw.composite) || 'source-over';
    b.followDirection = !!raw.followDirection;
    b.tiltAngle = !!raw.tiltAngle;
    b.size = Math.max(0.5, Math.min(b.maxSize || 500, b.size));
    if (typeof raw.stamp === 'string') {
      if (validStampDataUrl(raw.stamp)) b.stamp = raw.stamp;
      else warnings.push(`“${b.name}”: stamp rejected (must be a valid PNG/JPEG/WebP image under 300 KB).`);
    }
    if (b.tip === 'stamp' && !b.stamp) { b.tip = 'round'; warnings.push(`“${b.name}”: missing stamp image, using a round tip.`); }
    const fp = brushFingerprint(b);
    if (fps.has(fp)) { duplicates++; return; }
    fps.add(fp);
    brushes.push(b);
  });
  if (!brushes.length) throw new Error(duplicates ? 'Every brush in this pack is already installed.' : 'The pack contains no usable brushes.');
  return { pack: { id: 'imp-' + packId, name: String(data.name || 'Imported pack').slice(0, 60), version: Number(data.version) || 1, source: 'import', category: String(data.category || 'Imported'), brushes }, duplicates, warnings };
}

export function exportPack(name: string, brushes: BrushParams[], packId = name, category = 'Imported', version = 1) {
  const id = String(packId).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'brush-pack';
  return JSON.stringify({ format: 'carbon-brushpack', id, name, category, version, engine: ENGINE_VERSION, brushes: brushes.map(({ builtin: _b, ...r }) => r) }, null, 1);
}
