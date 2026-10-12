import { BookOpen, X } from 'lucide-react';
import { setApp, updateSettings, useApp } from '../state/store';

export default function QuickStartNudge() {
  const seen = useApp((s) => s.settings.quickStartSeen);
  if (seen) return null;
  const dismiss = () => updateSettings({ quickStartSeen: true });
  return (
    <aside className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E8913A]/25 bg-[#E8913A]/[0.07] p-4" aria-label="First-run quick start guide">
      <BookOpen size={18} className="shrink-0 text-[#E8913A]" />
      <div className="min-w-[180px] flex-1">
        <div className="text-sm font-medium text-neutral-100">New to Carbon? Take the offline quick-start tour.</div>
        <p className="mt-0.5 text-[11px] text-neutral-500">A short guide and editable sample project are built in. Nothing is downloaded or substituted for your work.</p>
      </div>
      <button onClick={() => { dismiss(); setApp({ dialog: 'quickStart' }); }} className="rounded-md bg-[#E8913A] px-3 py-2 text-xs font-semibold text-neutral-950 hover:bg-[#f0a457]">Start guide</button>
      <button onClick={dismiss} aria-label="Dismiss quick-start reminder" title="Dismiss" className="rounded p-1.5 text-neutral-500 hover:bg-white/10 hover:text-white"><X size={15} /></button>
    </aside>
  );
}
