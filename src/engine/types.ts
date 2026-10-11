// CARBON core types — shared by the live editor, replay engine and file format.

export type TipShape =
  | 'round' | 'square' | 'grain' | 'pencil' | 'chalk' | 'charcoal' | 'bristle' | 'flat'
  | 'splatter' | 'star' | 'leaf' | 'cloud' | 'fabric' | 'dots' | 'sponge' | 'hatch' | 'stamp'
  | 'grass' | 'hair' | 'flower' | 'drop' | 'snow' | 'flame' | 'brick' | 'wood' | 'scratch' | 'rock' | 'window' | 'ornament';

export interface AdjustParams { hue: number; sat: number; bright: number; contrast: number; invert: number; gray: number; sepia: number; blur: number }
export interface GradStop { o: number; c: string; a: number }

export type BalloonStyle = 'speech' | 'thought' | 'narration' | 'shout' | 'whisper' | 'angular';
export type ComicFxKind = 'speed' | 'focus' | 'impact' | 'burst' | 'tone' | 'gradient' | 'hatch' | 'cross' | 'sweat' | 'shock' | 'emphasis';
export interface ComicPanel { id: string; type: 'panel'; pts: number[]; border: number; color: string; radius: number; fill: string | null }
export interface ComicBalloon {
  id: string; type: 'balloon'; style: BalloonStyle; x: number; y: number; w: number; h: number;
  tail: { x: number; y: number } | null; tailW: number; text: string; font: string; size: number; bold: boolean; italic: boolean;
  align: 'left' | 'center' | 'right'; lineH: number; letterSp: number; pad: number; vertical: boolean;
  fill: string; stroke: string; strokeW: number; color: string; link: string | null;
}
export interface ComicFx {
  id: string; type: 'fx'; kind: ComicFxKind; x: number; y: number; w: number; h: number; angle: number;
  density: number; scale: number; opacity: number; color: string; seed: number; contrast: number; pts?: number[];
}
export type ComicObject = ComicPanel | ComicBalloon | ComicFx;

export type BrushMode = 'normal' | 'wash' | 'smudge' | 'mix' | 'crisp';
export type GrainType = 'paper' | 'canvas' | 'fabric' | 'noise' | 'rough';
export type StrokeComposite = 'source-over' | 'multiply' | 'screen' | 'lighter' | 'darken';

export interface BrushParams {
  id: string;
  name: string;
  category: string;
  tags: string[];
  description: string;
  builtin?: boolean;
  /** brush engine version this preset was authored for (replay determinism) */
  version: number;
  mode: BrushMode;
  tip: TipShape;
  stamp?: string; // data URL for custom image-stamp brushes
  size: number;
  minSize: number; // fraction of size at zero pressure
  maxSize: number; // slider upper bound
  opacity: number; // stroke opacity cap
  flow: number; // per-dab alpha
  spacing: number; // fraction of size
  hardness: number;
  smoothing: number; // stabilisation 0..1
  pressureSize: number; // 0..1 amount
  pressureOpacity: number; // 0..1 amount
  tiltAngle: boolean; // tip follows stylus azimuth
  tiltSize: number; // broaden with tilt
  angle: number; // degrees
  followDirection: boolean;
  roundness: number; // 0.05..1
  scatter: number; // fraction of size
  count: number; // dabs per step
  sizeJitter: number;
  angleJitter: number;
  opacityJitter: number;
  hueJitter: number;
  satJitter: number;
  valJitter: number;
  grain: number; // paper grain strength
  grainType: GrainType;
  grainScale: number;
  wetEdges: number;
  granulation: number;
  bloom: number;
  wetness: number; // dilution / smudge persistence
  pickup: number; // colour pickup for mix / smudge strength
  taperStart: number;
  taperEnd: number;
  speedSize: number; // -1..1 dynamic thinning by speed
  composite: StrokeComposite;
  /** Brush Fusion: secondary stamp pass (e.g. pigment speckles) rendered with every dab. Optional; absent = classic brush. */
  layer2?: { tip: TipShape; sizeK: number; scatter: number; count: number; flow: number; angleJitter: number };
  /** Brush Fusion recipe the preset was built from (lets the fusion be edited later). */
  recipe?: FusionRecipe;
}

export type FusionAspect = 'tip' | 'texture' | 'dynamics' | 'scatter' | 'color' | 'wet' | 'overlay';
export interface FusionRecipe { base: string; comps: { brush: string; aspect: FusionAspect; strength: number }[] }

/** Saved 3D camera (Spatial Ink Lab, Orbit-to-Comic, Continuum links). */
export interface CamView { pos: [number, number, number]; target: [number, number, number]; ortho: boolean; zoom: number; fov: number }
/** A raster layer rendered from a 3D scene keeps a link back to its source scene and camera. */
export interface LayerLink { kind: 'scene'; doc: string; docName: string; view: CamView; viewName?: string; at: number }

export type BlendMode =
  | 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge'
  | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue'
  | 'saturation' | 'color' | 'luminosity' | 'lighter' | 'linear-burn';

export interface InkStroke {
  id: string;
  pts: number[]; // x,y,pressure triples (control points)
  color: string;
  size: number;
  opacity: number;
  taperStart: number;
  taperEnd: number;
}

export interface LayerProps {
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  alphaLock: boolean;
  clip?: boolean; // clipping mask onto the layer below
  reference?: boolean; // fill tool samples reference layers
  maskEnabled?: boolean;
  parent?: string | null; // group id
  panelClip?: boolean; // clip artwork to comic panels
  adjust?: AdjustParams; // adjustment layers
  collapsed?: boolean; // group UI state
  link?: LayerLink; // Carbon Continuum: rendered from a 3D scene
  panelId?: string; // clip to one specific comic panel (Orbit-to-Comic captures)
}

export type LayerType = 'raster' | 'ink' | 'group' | 'adjust' | 'comic';

export interface Layer extends LayerProps {
  id: string;
  type: LayerType;
  canvas?: HTMLCanvasElement;
  strokes?: InkStroke[];
  mask?: HTMLCanvasElement; // alpha = visibility
  comic?: ComicObject[];
}

export interface Selection {
  pts: number[]; // polygon x,y pairs in document coords
  inverted: boolean;
}

export interface Symmetry {
  mode: 'off' | 'vertical' | 'horizontal' | 'quad' | 'radial';
  count: number;
  cx: number; // 0..1
  cy: number;
}

export type Command =
  | { k: 'stroke'; layerId: string; brush: BrushParams; color: string; eraser: boolean; seed: number; s: number[]; sym: Symmetry; target?: 'mask' }
  | { k: 'gradient'; layerId: string; kind: 'linear' | 'radial'; x0: number; y0: number; x1: number; y1: number; stops: GradStop[] }
  | { k: 'fx'; layerId: string; id: string; params: Record<string, number>; seed: number }
  | { k: 'liquify'; layerId: string; ops: number[] }
  | { k: 'maskAdd'; layerId: string; fromSel: boolean }
  | { k: 'maskDel'; layerId: string; apply: boolean }
  | { k: 'group'; ids: string[]; groupId: string; name: string }
  | { k: 'ungroup'; groupId: string }
  | { k: 'mergeVisible' }
  | { k: 'flattenCopy'; newId: string }
  | { k: 'adjustAdd'; id: string; name: string; index: number; adjust: AdjustParams }
  | { k: 'comicSet'; layerId: string; objects: ComicObject[]; label: string }
  | { k: 'fill'; layerId: string; x: number; y: number; color: string; tol: number; all: boolean; expand: number }
  | { k: 'fillSel'; layerId: string; color: string }
  | { k: 'clearSel'; layerId: string }
  | { k: 'poly'; layerId: string; pts: number[]; color: string; opacity: number }
  | { k: 'text'; layerId: string; x: number; y: number; text: string; font: string; size: number; color: string; bold: boolean; italic: boolean }
  | { k: 'image'; layerId: string; name: string; asset: string; x: number; y: number; w: number; h: number; index: number; props?: Partial<LayerProps> }
  | { k: 'imagePixels'; layerId: string; asset: string; x: number; y: number; w: number; h: number; props?: Partial<LayerProps> }
  | { k: 'inkAdd'; layerId: string; stroke: InkStroke }
  | { k: 'inkSet'; layerId: string; strokes: InkStroke[]; label: string }
  | { k: 'transform'; layerId: string; m: number[]; sel: boolean; ids?: string[] }
  | { k: 'layerAdd'; id: string; name: string; type: 'raster' | 'ink' | 'comic'; index: number }
  | { k: 'layerDel'; layerId: string }
  | { k: 'layerDup'; layerId: string; newId: string }
  | { k: 'layerMove'; layerId: string; index: number }
  | { k: 'layerProp'; layerId: string; props: Partial<LayerProps> }
  | { k: 'mergeDown'; layerId: string }
  | { k: 'rasterize'; layerId: string }
  | { k: 'layerClear'; layerId: string }
  | { k: 'resize'; w: number; h: number; ax: number; ay: number }
  | { k: 'scale'; w: number; h: number }
  | { k: 'flip'; axis: 'h' | 'v' }
  | { k: 'rotate'; dir: 1 | -1 }
  | { k: 'select'; sel: Selection | null }
  | { k: 'bg'; color: string | null }
  | { k: 'filter'; layerId: string; f: 'invert' | 'grayscale' | 'blur' | 'sepia' | 'brightness' | 'contrast'; amount: number };

export interface DocSnap {
  w: number;
  h: number;
  background: string | null;
  layers: Layer[];
  activeLayerId: string;
  selection: Selection | null;
}

export type UndoRec = { label: string; bytes: number; epoch: number } & (
  | { t: 'px'; layerId: string; x: number; y: number; w: number; h: number; before: HTMLCanvasElement; after: HTMLCanvasElement; target?: 'mask' }
  | { t: 'ink'; layerId: string; before: InkStroke[]; after: InkStroke[] }
  | { t: 'doc'; before: DocSnap; after: DocSnap }
  | { t: 'sel'; before: Selection | null; after: Selection | null }
);

export interface RecEvent {
  t: number; // ms on the recording clock
  c?: Command;
  u?: 'undo' | 'redo';
  cp?: DocSnap; // checkpoint (full state, canvases are private clones)
  m?: string; // informational marker (tool / brush / colour change)
}

export type Preview =
  | { kind: 'buffer'; layerId: string; canvas: HTMLCanvasElement; alpha: number; op: GlobalCompositeOperation; target?: 'mask' }
  | { kind: 'replace'; layerId: string; canvas: HTMLCanvasElement }
  | { kind: 'ink'; layerId: string; stroke: InkStroke }
  | { kind: 'transform'; layerId: string; base: HTMLCanvasElement | null; content: HTMLCanvasElement | null; m: number[]; ids?: string[] };

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  rot: number; // degrees
  flip: boolean;
}

export type ToolId =
  | 'brush' | 'eraser' | 'picker' | 'fill' | 'select' | 'transform' | 'move' | 'line' | 'rect'
  | 'ellipse' | 'text' | 'hand' | 'zoom' | 'rotate' | 'symmetry' | 'inkedit' | 'gradient' | 'liquify' | 'comic';

export interface Rect { x: number; y: number; w: number; h: number }
