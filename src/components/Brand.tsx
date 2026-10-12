import type { ToolId } from '../engine/types';
import {
  Brush, Circle, Eraser, FlipHorizontal2, Hand, Move, PaintBucket, PenTool, Pipette, RotateCw, Scaling, Slash, Square,
  SquareDashed, Type, ZoomIn, Blend, Waves, MessageSquare, type LucideIcon,
} from 'lucide-react';

export const EMBER = '#E8913A';

/**
 * CARBON mark: an open carbon ring (hexagon) whose missing edge is completed by a
 * tapered graphite stroke — the first mark that starts every drawing.
 */
export function CarbonMark({ size = 32, mono = false, className = '' }: { size?: number; mono?: boolean; className?: string }) {
  const ring = mono ? 'currentColor' : '#E9E6DF';
  const stroke = mono ? 'currentColor' : EMBER;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-label="CARBON logo" role="img">
      <path d="M54.5 28 V45 L32 58 L9.5 45 V19 L32 6 L43 12.4" fill="none" stroke={ring} strokeWidth="5.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M20.6 43.6 L48.2 16.2 Q51.6 13.4 50.6 17.6 L23.6 45.8 Q21 47.4 20.6 43.6 Z" fill={stroke} />
      <circle cx="21.4" cy="45" r="3.1" fill={stroke} />
    </svg>
  );
}

export function CarbonLockup({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <div className="flex items-center gap-4">
      <CarbonMark size={lg ? 64 : 28} />
      <div>
        <div className={`${lg ? 'text-4xl' : 'text-base'} font-semibold tracking-[0.32em] text-[#E9E6DF]`}>CARBON</div>
        <div className={`${lg ? 'mt-1 text-sm' : 'text-[10px]'} tracking-wide text-neutral-400`}>Where all starts begin.</div>
      </div>
    </div>
  );
}

/** Carbon: Prime lockup — product name + PRIME edition badge + release identity. */
export function PrimeLockup({ version, size = 'lg', light = false }: { version?: string; size?: 'sm' | 'lg'; light?: boolean }) {
  const lg = size === 'lg';
  return (
    <div className="flex items-center gap-4">
      <CarbonMark size={lg ? 72 : 36} />
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`${lg ? 'text-4xl' : 'text-lg'} font-semibold tracking-[0.30em] ${light ? 'text-white' : 'text-[#E9E6DF]'}`} style={lg ? { textShadow: '0 2px 18px rgba(0,0,0,0.45)' } : undefined}>CARBON</span>
          <span className={`${lg ? 'text-sm' : 'text-[9px]'} carbon-brand-accent font-semibold uppercase tracking-[0.42em] text-[#E8913A]`}>Prime</span>
        </div>
        <div className={`${lg ? 'mt-1.5 flex items-center gap-2.5' : 'text-[10px]'} tracking-wide ${light ? 'text-white/80' : 'text-neutral-400'}`}>
          <span className={lg ? 'text-sm' : ''} style={lg ? { textShadow: '0 1px 10px rgba(0,0,0,0.5)' } : undefined}>Where all starts begin.</span>
          {version && lg && <span className="rounded-full border border-white/25 bg-black/25 px-2.5 py-0.5 font-mono text-[11px] text-white/85 backdrop-blur-sm">{version}</span>}
        </div>
      </div>
    </div>
  );
}

/** Application icon (rounded tile) — used for favicon / install surfaces. */
export function CarbonAppIcon({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-label="CARBON app icon">
      <rect width="96" height="96" rx="22" fill="#1A1A1D" />
      <g transform="translate(16 16)">
        <path d="M54.5 28 V45 L32 58 L9.5 45 V19 L32 6 L43 12.4" fill="none" stroke="#E9E6DF" strokeWidth="5.2" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M20.6 43.6 L48.2 16.2 Q51.6 13.4 50.6 17.6 L23.6 45.8 Q21 47.4 20.6 43.6 Z" fill={EMBER} />
        <circle cx="21.4" cy="45" r="3.1" fill={EMBER} />
      </g>
    </svg>
  );
}

export const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  brush: Brush, eraser: Eraser, picker: Pipette, fill: PaintBucket, select: SquareDashed, transform: Scaling, move: Move,
  line: Slash, rect: Square, ellipse: Circle, text: Type, hand: Hand, zoom: ZoomIn, rotate: RotateCw, symmetry: FlipHorizontal2,
  inkedit: PenTool, gradient: Blend, liquify: Waves, comic: MessageSquare,
};
