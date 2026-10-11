import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

export function Slider({
  label, value, min, max, step = 0.01, onChange, onCommit, fmt, title,
}: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; onCommit?: (v: number) => void; fmt?: (v: number) => string; title?: string;
}) {
  return (
    <label className="grid grid-cols-[88px_1fr_44px] items-center gap-2 py-0.5 text-[11px] text-neutral-400" title={title}>
      <span className="truncate">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        className="carbon-range w-full"
      />
      <span className="text-right font-mono text-[10px] text-neutral-300">{fmt ? fmt(value) : Math.round(value * 100) + '%'}</span>
    </label>
  );
}

export function Btn({ children, onClick, active, title, className, disabled, variant }: { children: ReactNode; onClick?: () => void; active?: boolean; title?: string; className?: string; disabled?: boolean; variant?: 'primary' | 'danger' | 'ghost' }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' ? 'bg-[#E8913A] font-medium text-neutral-950 hover:bg-[#f0a457]' :
        variant === 'danger' ? 'bg-red-600/80 text-white hover:bg-red-500' :
        active ? 'bg-white/15 text-white' : 'bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 py-1 text-[11px] text-neutral-300" title={title}>
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-4 w-7 rounded-full transition-colors', checked ? 'bg-[#E8913A]' : 'bg-white/15')}
      >
        <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', checked ? 'left-3.5' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-[11px] text-neutral-400">
      {label && <span>{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="min-w-0 flex-1 rounded border border-white/10 bg-neutral-900 px-1.5 py-1 text-[11px] text-neutral-200 outline-none focus:border-[#E8913A]/60">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 first:mt-0">{children}</div>;
}

export function Modal({ title, children, onClose, width = 480, footer }: { title: string; children: ReactNode; onClose: () => void; width?: number; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1f] shadow-2xl" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
          <button onClick={onClose} className="rounded px-2 text-lg leading-none text-neutral-500 hover:text-white" aria-label="Close">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-neutral-300">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-white/5 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function NumInput({ value, onChange, min, max, className, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; className?: string; step?: number }) {
  return (
    <input
      type="number" value={value} min={min} max={max} step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('w-full rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-[#E8913A]/60', className)}
    />
  );
}
