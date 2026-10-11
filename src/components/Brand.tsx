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
