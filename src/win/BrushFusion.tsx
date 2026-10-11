// Brush Fusion (Windows edition): combine aspects of existing brushes into a new preset.
// The result is an ordinary BrushParams (plus an optional layer2 overlay pass) consumed by the stroke engine,
// so the preview, the canvas and Drawing Replay all render it identically.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Plus, Save, Trash2 } from 'lucide-react';
import type { BrushParams, FusionAspect, FusionRecipe } from '../engine/types';
import { renderStroke, sampleCurve } from '../engine/strokeRenderer';
import { ensureStamp } from '../engine/tips';
import { clamp, uid } from '../engine/util';
import { allBrushes, brushById, currentBrush, getApp, selectBrush, setApp, toast, useApp } from '../state/store';
import { Btn, Modal, Select, Slider } from '../components/ui';

export const ASPECTS: { id: FusionAspect; label: string; desc: string }[] = [
  { id: 'tip', label: 'Tip shape', desc: 'Tip, hardness, roundness, angle, direction' },
  { id: 'texture', label: 'Paper texture / grain', desc: 'Grain strength, type, scale' },
  { id: 'dynamics', label: 'Pressure & taper dynamics', desc: 'Pressure size/opacity, min size, speed, taper, tilt' },
  { id: 'scatter', label: 'Scatter & jitter', desc: 'Scatter, count, size/angle/opacity jitter' },
  { id: 'color', label: 'Color dynamics', desc: 'Hue / saturation / value jitter' },
  { id: 'wet', label: 'Wet media', desc: 'Engine (wash/mix/smudge), wet edges, granulation, bloom, wetness, pickup' },
  { id: 'overlay', label: 'Overlay stamps', desc: "Adds the component's tip as a secondary scattered stamp (speckles, leaves…)" },
];

const L = (a: number, b: number, t: number) => a + (b - a) * t;
type Comp = { brush: string; aspect: FusionAspect; strength: number };

export function fuseBrush(base: BrushParams, comps: { brush: BrushParams; aspect: FusionAspect; strength: number }[]): { brush: BrushParams; warnings: string[] } {
  const r: BrushParams = { ...base, layer2: base.layer2 ? { ...base.layer2 } : undefined };
  const w: string[] = [];
  for (const { brush: c, aspect, strength } of comps) {
    const s = clamp(strength, 0, 1), cat = s >= 0.5;
    if (c.id === base.id) w.push(`“${c.name}” is the base brush. Fusing it with itself changes nothing.`);
    switch (aspect) {
      case 'tip':
        if (cat) { r.tip = c.tip; r.stamp = c.stamp; r.followDirection = c.followDirection; }
        r.hardness = L(r.hardness, c.hardness, s); r.roundness = L(r.roundness, c.roundness, s); r.angle = L(r.angle, c.angle, s);
        if (!cat) w.push(`Tip from “${c.name}” at ${Math.round(s * 100)}%: the tip shape switches at 50% and above. Below that, only hardness, roundness and angle are blended.`);
        break;
      case 'texture':
        r.grain = L(r.grain, c.grain, s); r.grainScale = L(r.grainScale, c.grainScale, s); if (cat) r.grainType = c.grainType;
        if (c.grain === 0) w.push(`“${c.name}” has no paper grain, so the texture aspect lowers the grain.`);
        break;
      case 'dynamics':
        r.pressureSize = L(r.pressureSize, c.pressureSize, s); r.pressureOpacity = L(r.pressureOpacity, c.pressureOpacity, s); r.minSize = L(r.minSize, c.minSize, s);
        r.speedSize = L(r.speedSize, c.speedSize, s); r.taperStart = L(r.taperStart, c.taperStart, s); r.tiltSize = L(r.tiltSize, c.tiltSize, s);
        if (cat) r.tiltAngle = c.tiltAngle;
        break;
      case 'scatter':
        r.scatter = L(r.scatter, c.scatter, s); r.count = Math.max(1, Math.round(L(r.count, c.count, s)));
        r.sizeJitter = L(r.sizeJitter, c.sizeJitter, s); r.angleJitter = L(r.angleJitter, c.angleJitter, s); r.opacityJitter = L(r.opacityJitter, c.opacityJitter, s);
        break;
      case 'color':
        r.hueJitter = L(r.hueJitter, c.hueJitter, s); r.satJitter = L(r.satJitter, c.satJitter, s); r.valJitter = L(r.valJitter, c.valJitter, s);
        break;
      case 'wet':
        if (cat && c.mode !== 'normal' && c.mode !== 'crisp') r.mode = c.mode;
        if (c.mode === 'normal' || c.mode === 'crisp') w.push(`“${c.name}” is not a wet-media brush, so only its wet sliders are blended and the engine is unchanged.`);
        r.wetEdges = L(r.wetEdges, c.wetEdges, s); r.granulation = L(r.granulation, c.granulation, s); r.bloom = L(r.bloom, c.bloom, s);
        r.wetness = L(r.wetness, c.wetness, s); r.pickup = L(r.pickup, c.pickup, s);
        break;
      case 'overlay':
        r.layer2 = {
          tip: c.tip === 'stamp' ? 'grain' : c.tip, sizeK: clamp((c.size / Math.max(1, base.size)) * 0.5, 0.06, 1), scatter: Math.max(0.3, c.scatter + 0.6),
          count: clamp(Math.round(1 + c.count * 3 * s), 1, 8), flow: clamp(c.flow * s, 0.02, 1), angleJitter: Math.max(0.5, c.angleJitter),
        };
        if (c.tip === 'stamp') w.push('Image-stamp tips are used as grain in overlay stamps.');
        break;
    }
  }
  if (r.mode === 'crisp') w.push('Crisp Ink is a vector engine. Texture, scatter, color jitter, wet media and overlay stamps are ignored when drawing editable paths.');
  if ((r.mode === 'mix' || r.mode === 'smudge') && r.layer2) w.push('Overlay stamps are not drawn by the paint-mixing and smudge engines.');
  if (r.mode === 'smudge' && (r.hueJitter || r.satJitter || r.valJitter)) w.push('Smudge brushes move existing paint, so color dynamics have no effect.');
  if (r.tip === 'stamp' && !r.stamp) w.push('The image-stamp tip has no image, so it falls back to a round tip.');
  return { brush: r, warnings: Array.from(new Set(w)) };
}

function Preview({ b }: { b: BrushParams }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      const c = ref.current;
      if (!c) return;
      if (b.stamp) await ensureStamp(b.stamp);
      const W = 520, H = 120;
      c.width = W; c.height = H;
      const x = c.getContext('2d')!;
      x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, W, H);
      const pb = { ...b, size: Math.min(b.size, b.scatter > 1 ? 14 : 60), smoothing: 0, mode: b.mode === 'crisp' ? ('normal' as const) : b.mode };
      let layer: HTMLCanvasElement | undefined;
      if (pb.mode === 'mix' || pb.mode === 'smudge') {
        layer = document.createElement('canvas'); layer.width = W; layer.height = H;
        const l = layer.getContext('2d')!, g = l.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, '#b45309'); g.addColorStop(0.5, '#1d4ed8'); g.addColorStop(1, '#047857');
        l.fillStyle = g; l.fillRect(0, H * 0.3, W, H * 0.4);
      }
      const r = renderStroke({ brush: pb, color: getApp().fg, eraser: false, seed: 11, sym: { mode: 'off', count: 2, cx: 0.5, cy: 0.5 }, w: W, h: H, layer }, sampleCurve(W, H, 90));
      if (r.direct) x.drawImage(r.out, 0, 0);
      else { if (layer) x.drawImage(layer, 0, 0); x.globalAlpha = pb.opacity; x.globalCompositeOperation = pb.composite; x.drawImage(r.out, 0, 0); }
    }, 80);
    return () => clearTimeout(t);
  }, [b]);
  return <canvas ref={ref} className="h-[120px] w-full rounded-md border border-white/10" aria-label="Fusion preview (rendered by the stroke engine)" />;
}

export function BrushFusionDialog() {
  const s = useApp();
  const all = allBrushes(s);
  const cur = currentBrush(false, s);
  const editing = !cur.builtin && cur.recipe ? cur : null;
  const [base, setBase] = useState<string>(editing?.recipe?.base || cur.id);
  const [comps, setComps] = useState<Comp[]>(editing?.recipe?.comps || [{ brush: 'tex-paper', aspect: 'texture', strength: 0.8 }]);
  const [ov, setOv] = useState<Partial<BrushParams>>(editing ? { size: editing.size, opacity: editing.opacity, flow: editing.flow, spacing: editing.spacing, angle: editing.angle, composite: editing.composite } : {});
  const [name, setName] = useState(editing?.name || '');
  const [category, setCategory] = useState(editing?.category || 'Fusion');
  const close = () => setApp({ dialog: null });
  const baseB = brushById(base) || cur;
  const fused = useMemo(() => {
    const parts = comps.map((c) => ({ ...c, brush: brushById(c.brush) })).filter((c): c is { brush: BrushParams; aspect: FusionAspect; strength: number } => !!c.brush);
    const missing = comps.length - parts.length;
    const r = fuseBrush(baseB, parts);
    const b = { ...r.brush, ...ov } as BrushParams;
    if (missing) r.warnings.push(`${missing} component brush${missing > 1 ? 'es are' : ' is'} no longer installed and ${missing > 1 ? 'were' : 'was'} skipped.`);
    return { brush: b, warnings: r.warnings };
  }, [baseB, comps, ov]);
  const b = fused.brush;
  const options = useMemo(() => all.map((x) => ({ value: x.id, label: `${x.category} · ${x.name}` })).sort((p, q) => p.label.localeCompare(q.label)), [all]);
  const recipe: FusionRecipe = { base, comps };
  const save = (asNew: boolean) => {
    const n = name.trim() || `${baseB.name} fusion`;
    const desc = `Fusion of ${baseB.name} with ${comps.map((c) => `${brushById(c.brush)?.name || c.brush} (${ASPECTS.find((a) => a.id === c.aspect)?.label.toLowerCase()} ${Math.round(c.strength * 100)}%)`).join(', ')}.`;
    const nb: BrushParams = { ...b, id: asNew || !editing ? uid('cb-') : editing.id, name: n, category: category.trim() || 'Fusion', tags: ['fusion', ...comps.map((c) => c.aspect)], description: desc, builtin: false, recipe };
    const st = getApp();
    setApp({ customBrushes: asNew || !editing ? [...st.customBrushes, nb] : st.customBrushes.map((x) => (x.id === nb.id ? nb : x)) });
    selectBrush(nb.id);
    toast(`${asNew || !editing ? 'Saved' : 'Updated'} “${n}”. The source brushes are unchanged.`, 'success');
    close();
  };
  const ovSlider = (label: string, key: keyof BrushParams, min: number, max: number, step: number, fmt?: (v: number) => string) => (
    <Slider label={label} value={Number(b[key])} min={min} max={max} step={step} fmt={fmt} onChange={(v) => setOv({ ...ov, [key]: v })} />
  );
  return (
    <Modal title={editing ? `Brush Fusion: editing “${editing.name}”` : 'Brush Fusion'} onClose={close} width={760}
      footer={<><Btn onClick={close}>Cancel</Btn>{editing && <Btn onClick={() => save(true)}>Save as new</Btn>}<Btn variant="primary" onClick={() => save(false)}><Save size={11} /> {editing ? 'Save changes' : 'Save brush'}</Btn></>}>
      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="space-y-2 text-[11px]">
          <Preview b={b} />
          <Select label="Base brush" value={base} onChange={setBase} options={options} />
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Components</div>
          {comps.map((c, i) => (
            <div key={i} className="space-y-1 rounded border border-white/5 p-2">
              <div className="flex gap-1">
                <div className="min-w-0 flex-1"><Select value={c.brush} onChange={(v) => setComps(comps.map((x, j) => (j === i ? { ...x, brush: v } : x)))} options={options} /></div>
                <button title="Remove component" onClick={() => setComps(comps.filter((_, j) => j !== i))} className="px-1 text-neutral-500 hover:text-red-400"><Trash2 size={12} /></button>
              </div>
              <Select label="Aspect" value={c.aspect} onChange={(v) => setComps(comps.map((x, j) => (j === i ? { ...x, aspect: v } : x)))} options={ASPECTS.map((a) => ({ value: a.id, label: a.label }))} />
              <Slider label="Contribution" value={c.strength} min={0} max={1} onChange={(v) => setComps(comps.map((x, j) => (j === i ? { ...x, strength: v } : x)))} />
              <div className="text-[10px] text-neutral-500">{ASPECTS.find((a) => a.id === c.aspect)?.desc}</div>
            </div>
          ))}
          <Btn disabled={comps.length >= 6} onClick={() => setComps([...comps, { brush: 'tex-splatter', aspect: 'overlay', strength: 0.5 }])}><Plus size={11} /> Add component</Btn>
          {fused.warnings.length > 0 && (
            <div className="space-y-1 rounded border border-amber-500/30 bg-amber-500/5 p-2">
              {fused.warnings.map((w, i) => <div key={i} className="flex gap-1 text-[11px] text-amber-200"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{w}</div>)}
            </div>
          )}
        </div>
        <div className="space-y-1 text-[11px]">
          <label className="block text-neutral-400">Name<input value={name} placeholder={`${baseB.name} fusion`} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="mt-0.5 w-full rounded bg-neutral-900 px-2 py-1 text-neutral-100 outline-none ring-1 ring-white/10" /></label>
          <label className="block text-neutral-400">Category<input value={category} onChange={(e) => setCategory(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="mt-0.5 w-full rounded bg-neutral-900 px-2 py-1 text-neutral-100 outline-none ring-1 ring-white/10" /></label>
          <div className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Result</div>
          {ovSlider('Size', 'size', 0.5, Math.max(b.maxSize, 20), 0.5, (v) => v.toFixed(1) + 'px')}
          {ovSlider('Opacity', 'opacity', 0.02, 1, 0.01)}
          {ovSlider('Flow', 'flow', 0.02, 1, 0.01)}
          {ovSlider('Spacing', 'spacing', 0.01, 2, 0.01)}
          {ovSlider('Rotation', 'angle', -180, 180, 1, (v) => Math.round(v) + '°')}
          {ovSlider('Angle jitter', 'angleJitter', 0, 1, 0.01)}
          {ovSlider('Scatter', 'scatter', 0, 8, 0.05, (v) => v.toFixed(2))}
          {ovSlider('Grain', 'grain', 0, 1, 0.01)}
          <Select label="Blending" value={b.composite} onChange={(v) => setOv({ ...ov, composite: v })} options={[{ value: 'source-over', label: 'Normal' }, { value: 'multiply', label: 'Multiply' }, { value: 'screen', label: 'Screen' }, { value: 'lighter', label: 'Add (glow)' }, { value: 'darken', label: 'Darken' }]} />
          {b.layer2 && <div className="rounded bg-white/5 p-1.5 text-[10px] text-neutral-400">Overlay: {b.layer2.tip} tip × {b.layer2.count}, flow {Math.round(b.layer2.flow * 100)}%</div>}
          <div className="text-[10px] text-neutral-500">Engine: {b.mode}{b.mode === 'wash' ? ' (watercolor)' : b.mode === 'mix' ? ' (paint mixing)' : ''}. The preview is drawn by the real stroke engine, so the canvas will match it.</div>
          {Object.keys(ov).length > 0 && <Btn onClick={() => setOv({})}>Reset result sliders</Btn>}
        </div>
      </div>
    </Modal>
  );
}
