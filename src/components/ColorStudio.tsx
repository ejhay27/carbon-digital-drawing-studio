import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Download, Plus, Trash2, Upload } from 'lucide-react';
import { download, hexToHsv, hexToRgb, hsvToHex, isHex, normHex, rgbToHex, uid } from '../engine/util';
import { getApp, setApp, setColor, toast, useApp } from '../state/store';
import { pickFile } from '../state/actions';
import { Btn, SectionTitle, Select, Slider } from './ui';

export function ColorWheel({ hex, onChange, size = 200 }: { hex: string; onChange: (hex: string, commit: boolean) => void; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hsv, setHsv] = useState(() => hexToHsv(hex));
  const drag = useRef<'ring' | 'sv' | null>(null);
  const last = useRef(hex);
  useEffect(() => {
    if (hex !== last.current) {
      const n = hexToHsv(hex);
      setHsv((o) => [n[1] < 0.01 || n[2] < 0.01 ? o[0] : n[0], n[1], n[2]]);
      last.current = hex;
    }
  }, [hex]);
  const R = size / 2, ring = Math.max(14, size * 0.1), sq = (R - ring - 6) * Math.SQRT2;
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr; c.height = size * dpr;
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, size, size);
    for (let a = 0; a < 360; a += 1) {
      x.beginPath();
      x.strokeStyle = `hsl(${a},100%,50%)`;
      x.lineWidth = ring;
      x.arc(R, R, R - ring / 2, ((a - 91) * Math.PI) / 180, ((a - 89) * Math.PI) / 180);
      x.stroke();
    }
    const s0 = R - sq / 2;
    const g1 = x.createLinearGradient(s0, 0, s0 + sq, 0);
    g1.addColorStop(0, '#fff');
    g1.addColorStop(1, hsvToHex(hsv[0], 1, 1));
    x.fillStyle = g1;
    x.fillRect(s0, s0, sq, sq);
    const g2 = x.createLinearGradient(0, s0, 0, s0 + sq);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, '#000');
    x.fillStyle = g2;
    x.fillRect(s0, s0, sq, sq);
    const ha = ((hsv[0] - 90) * Math.PI) / 180;
    x.lineWidth = 2;
    x.strokeStyle = '#fff';
    x.beginPath(); x.arc(R + Math.cos(ha) * (R - ring / 2), R + Math.sin(ha) * (R - ring / 2), ring / 2 - 1, 0, Math.PI * 2); x.stroke();
    const px = s0 + hsv[1] * sq, py = s0 + (1 - hsv[2]) * sq;
    x.strokeStyle = hsv[2] > 0.5 ? '#000' : '#fff';
    x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.stroke();
  }, [hsv, size, R, ring, sq]);
  const handle = (e: React.PointerEvent, commit: boolean) => {
    const r = ref.current!.getBoundingClientRect();
    const x = e.clientX - r.left - R, y = e.clientY - r.top - R;
    const s0 = -sq / 2;
    let n = hsv;
    if (drag.current === 'ring') {
      const h = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
      n = [h, hsv[1], hsv[2]];
    } else if (drag.current === 'sv') {
      n = [hsv[0], Math.max(0, Math.min(1, (x - s0) / sq)), Math.max(0, Math.min(1, 1 - (y - s0) / sq))];
    }
    setHsv(n);
    const h = hsvToHex(n[0], n[1], n[2]);
    last.current = h;
    onChange(h, commit);
  };
  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size }}
      className="touch-none"
      onPointerDown={(e) => {
        const r = ref.current!.getBoundingClientRect();
        const x = e.clientX - r.left - R, y = e.clientY - r.top - R;
        const d = Math.hypot(x, y);
        drag.current = d > R - ring - 2 && d <= R ? 'ring' : Math.abs(x) <= sq / 2 && Math.abs(y) <= sq / 2 ? 'sv' : null;
        if (drag.current) { (e.target as HTMLElement).setPointerCapture(e.pointerId); handle(e, false); }
      }}
      onPointerMove={(e) => drag.current && handle(e, false)}
      onPointerUp={(e) => { if (drag.current) handle(e, true); drag.current = null; }}
    />
  );
}

function harmony(hex: string) {
  const [h, s, v] = hexToHsv(hex);
  const f = (d: number) => hsvToHex(h + d, s, v);
  return {
    Complementary: [hex, f(180)],
    Analogous: [f(-30), hex, f(30)],
    Triadic: [hex, f(120), f(240)],
    'Split comp.': [hex, f(150), f(210)],
    Tetradic: [hex, f(90), f(180), f(270)],
    Shades: [hsvToHex(h, s, v * 0.4), hsvToHex(h, s, v * 0.7), hex, hsvToHex(h, s * 0.6, Math.min(1, v * 1.15)), hsvToHex(h, s * 0.3, 1)],
  } as Record<string, string[]>;
}

function Swatch({ c, onClick, title, onContext }: { c: string; onClick: () => void; title?: string; onContext?: () => void }) {
  return (
    <button
      title={title || c}
      onClick={onClick}
      onContextMenu={(e) => { if (onContext) { e.preventDefault(); onContext(); } }}
      className="h-5 w-5 rounded-sm border border-black/40 ring-white/40 hover:ring-2"
      style={{ background: c }}
    />
  );
}

export function HexField({ hex, onChange }: { hex: string; onChange: (h: string) => void }) {
  const [v, setV] = useState(hex);
  useEffect(() => setV(hex), [hex]);
  return (
    <input
      value={v}
      onChange={(e) => { setV(e.target.value); if (isHex(e.target.value) && e.target.value.replace('#', '').length === 6) onChange(normHex(e.target.value)); }}
      onBlur={() => (isHex(v) ? onChange(normHex(v)) : setV(hex))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="w-20 rounded border border-white/10 bg-neutral-900 px-2 py-1 font-mono text-[11px] uppercase text-neutral-100 outline-none focus:border-[#E8913A]/60"
      aria-label="Hex color"
    />
  );
}

/** Compact contextual color control (used by the floating palette popover). */
export function CompactColor() {
  const fg = useApp((s) => s.fg);
  const recent = useApp((s) => s.recentColors);
  const palettes = useApp((s) => s.palettes);
  const active = useApp((s) => s.activePalette);
  const pal = palettes.find((p) => p.id === active) || palettes[0];
  return (
    <div className="w-[212px] space-y-2">
      <ColorWheel hex={fg} onChange={setColor} size={196} />
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded border border-white/20" style={{ background: fg }} />
        <HexField hex={fg} onChange={(h) => setColor(h)} />
      </div>
      {!!recent.length && <div className="flex flex-wrap gap-1">{recent.slice(0, 16).map((c) => <Swatch key={c} c={c} onClick={() => setColor(c)} />)}</div>}
      {pal && <div className="flex flex-wrap gap-1 border-t border-white/5 pt-2">{pal.colors.map((c, i) => <Swatch key={c + i} c={c} onClick={() => setColor(c)} />)}</div>}
    </div>
  );
}

export default function ColorStudio() {
  const fg = useApp((s) => s.fg);
  const bg = useApp((s) => s.bg);
  const recent = useApp((s) => s.recentColors);
  const palettes = useApp((s) => s.palettes);
  const activePal = useApp((s) => s.activePalette);
  const [mode, setMode] = useState<'hsv' | 'rgb'>('hsv');
  const [harm, setHarm] = useState('Complementary');
  const [h, s, v] = hexToHsv(fg);
  const [r, g, b] = hexToRgb(fg);
  const pal = palettes.find((p) => p.id === activePal) || palettes[0];

  // swatch names (shown by the Windows Color Dock) stay index-aligned with colors
  const updPal = (colors: string[], names?: string[]) => setApp({ palettes: palettes.map((p) => (p.id === pal.id ? { ...p, colors, ...(names ? { names } : {}) } : p)) });

  const importPal = async () => {
    const f = await pickFile('.json,.gpl,.txt');
    if (!f) return;
    try {
      const text = await f.text();
      let name = f.name.replace(/\.[^.]+$/, '');
      let colors: string[] = [];
      if (/^GIMP Palette/.test(text)) {
        for (const line of text.split('\n')) {
          const nm = line.match(/^Name:\s*(.+)/);
          if (nm) name = nm[1].trim();
          const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)/);
          if (m) colors.push(rgbToHex(+m[1], +m[2], +m[3]));
        }
      } else {
        const j = JSON.parse(text);
        colors = (Array.isArray(j) ? j : j.colors || []).filter((c: unknown) => typeof c === 'string' && isHex(c)).map(normHex);
        if (j.name) name = String(j.name);
      }
      if (!colors.length) throw new Error('no colors found');
      const id = uid('pal-');
      setApp({ palettes: [...palettes, { id, name, colors: colors.slice(0, 256) }], activePalette: id });
      toast(`Imported palette “${name}” (${colors.length} colors)`, 'success');
    } catch (e) {
      toast('Palette import failed: ' + (e instanceof Error ? e.message : e), 'error');
    }
  };
  const exportPal = (fmt: 'json' | 'gpl') => {
    if (fmt === 'json') download(new Blob([JSON.stringify({ name: pal.name, colors: pal.colors }, null, 1)], { type: 'application/json' }), pal.name + '.json');
    else {
      const lines = ['GIMP Palette', 'Name: ' + pal.name, '#', ...pal.colors.map((c) => { const [a, b2, d] = hexToRgb(c); return `${a} ${b2} ${d}\t${c}`; })];
      download(new Blob([lines.join('\n')], { type: 'text/plain' }), pal.name + '.gpl');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-center"><ColorWheel hex={fg} onChange={setColor} size={208} /></div>
      <div className="flex items-center gap-2">
        <div className="relative h-10 w-12 shrink-0">
          <button title="Background color (click to swap)" onClick={() => setApp({ fg: bg, bg: fg })} className="absolute bottom-0 right-0 h-7 w-7 rounded border border-white/30" style={{ background: bg }} />
          <div title="Foreground color" className="absolute left-0 top-0 h-7 w-7 rounded border border-white/40 shadow" style={{ background: fg }} />
        </div>
        <button title="Swap colors (S)" onClick={() => setApp({ fg: bg, bg: fg })} className="text-neutral-400 hover:text-white"><ArrowLeftRight size={14} /></button>
        <HexField hex={fg} onChange={(x) => setColor(x)} />
        <div className="ml-auto flex gap-1">
          <Btn active={mode === 'hsv'} onClick={() => setMode('hsv')}>HSV</Btn>
          <Btn active={mode === 'rgb'} onClick={() => setMode('rgb')}>RGB</Btn>
        </div>
      </div>
      {mode === 'hsv' ? (
        <div>
          <Slider label="Hue" value={h} min={0} max={359} step={1} fmt={(x) => Math.round(x) + '°'} onChange={(x) => setColor(hsvToHex(x, s, v), false)} onCommit={(x) => setColor(hsvToHex(x, s, v))} />
          <Slider label="Saturation" value={s} min={0} max={1} onChange={(x) => setColor(hsvToHex(h, x, v), false)} onCommit={(x) => setColor(hsvToHex(h, x, v))} />
          <Slider label="Value" value={v} min={0} max={1} onChange={(x) => setColor(hsvToHex(h, s, x), false)} onCommit={(x) => setColor(hsvToHex(h, s, x))} />
        </div>
      ) : (
        <div>
          {(['Red', 'Green', 'Blue'] as const).map((n, i) => (
            <Slider key={n} label={n} value={[r, g, b][i]} min={0} max={255} step={1} fmt={(x) => String(Math.round(x))}
              onChange={(x) => { const c = [r, g, b]; c[i] = x; setColor(rgbToHex(c[0], c[1], c[2]), false); }}
              onCommit={(x) => { const c = [r, g, b]; c[i] = x; setColor(rgbToHex(c[0], c[1], c[2])); }} />
          ))}
        </div>
      )}
      <SectionTitle>Harmony</SectionTitle>
      <div className="flex items-center gap-2">
        <Select value={harm} onChange={setHarm} options={Object.keys(harmony(fg)).map((k) => ({ value: k, label: k }))} />
        <div className="flex gap-1">{harmony(fg)[harm].map((c, i) => <Swatch key={i} c={c} onClick={() => setColor(c)} />)}</div>
      </div>
      {!!recent.length && (
        <>
          <SectionTitle>Recent</SectionTitle>
          <div className="flex flex-wrap gap-1">{recent.map((c) => <Swatch key={c} c={c} onClick={() => setColor(c)} />)}</div>
        </>
      )}
      <SectionTitle>Palettes</SectionTitle>
      <div className="flex items-center gap-1">
        <Select value={pal?.id || ''} onChange={(id) => setApp({ activePalette: id })} options={palettes.map((p) => ({ value: p.id, label: p.name }))} />
        <Btn title="New palette" onClick={() => { const id = uid('pal-'); setApp({ palettes: [...palettes, { id, name: 'Palette ' + (palettes.length + 1), colors: [fg] }], activePalette: id }); }}><Plus size={12} /></Btn>
        <Btn title="Delete palette" disabled={palettes.length <= 1} onClick={() => { const rest = palettes.filter((p) => p.id !== pal.id); setApp({ palettes: rest, activePalette: rest[0].id }); }}><Trash2 size={12} /></Btn>
      </div>
      {pal && (
        <>
          <input
            value={pal.name}
            onChange={(e) => setApp({ palettes: palettes.map((p) => (p.id === pal.id ? { ...p, name: e.target.value } : p)) })}
            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-neutral-300 outline-none hover:border-white/10 focus:border-white/20"
            aria-label="Palette name"
          />
          <div className="flex flex-wrap gap-1">
            {pal.colors.map((c, i) => <Swatch key={c + i} c={c} title={`${c} — right-click to remove`} onClick={() => setColor(c)} onContext={() => updPal(pal.colors.filter((_, j) => j !== i), pal.names ? pal.names.filter((_, j) => j !== i) : undefined)} />)}
            <button title="Add current color" onClick={() => !pal.colors.includes(fg) && updPal([...pal.colors, fg])} className="flex h-5 w-5 items-center justify-center rounded-sm border border-dashed border-white/30 text-neutral-400 hover:text-white"><Plus size={10} /></button>
          </div>
          <div className="flex gap-1 pt-1">
            <Btn onClick={importPal}><Upload size={11} /> Import</Btn>
            <Btn onClick={() => exportPal('json')}><Download size={11} /> JSON</Btn>
            <Btn onClick={() => exportPal('gpl')}><Download size={11} /> GPL</Btn>
          </div>
        </>
      )}
      <p className="text-[10px] leading-snug text-neutral-500">Colors are stored as exact sRGB values and are never altered on save, reopen or export.</p>
      {EDITION.windows && <WinColorExtras />}
    </div>
  );
}

export { getApp };
import { EDITION } from '../platform/edition';
import { WinColorExtras } from '../win/WinPanels';
