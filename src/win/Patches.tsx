import { useEffect, useState } from 'react';
import { AlertTriangle, Bug, ChevronDown, ChevronRight, History, Info, Sparkles, WifiOff, Wrench } from 'lucide-react';
import { RELEASES, type Release, type ReleaseCategory } from '../release/releases';
import { APP_VERSION } from '../version';
import { setApp } from '../state/store';
import { Btn, Modal } from '../components/ui';
import { cn } from '../utils/cn';

export const CAT: Record<ReleaseCategory, { label: string; chip: string; dot: string; desc: string }> = {
  major: { label: 'Major release', chip: 'border-[#E8913A]/50 bg-[#E8913A]/15 text-[#f3b06b]', dot: 'bg-[#E8913A]', desc: 'New major version (MAJOR)' },
  feature: { label: 'Feature release', chip: 'border-sky-400/40 bg-sky-400/10 text-sky-300', dot: 'bg-sky-400', desc: 'Compatible new features (MINOR)' },
  patch: { label: 'Maintenance patch', chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', dot: 'bg-emerald-400', desc: 'Fixes and small improvements (PATCH)' },
};

export function fmtDate(d: string | null) {
  if (!d) return 'Release date not recorded';
  const t = new Date(d + 'T00:00:00');
  return isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

// tracks navigator.onLine (release notes are bundled, so this is informational only)
function useOnline() {
  const [on, set] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const a = () => set(true), b = () => set(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

function Section({ icon: I, title, items, tone }: { icon: typeof Sparkles; title: string; items?: string[]; tone: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className={cn('mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider', tone)}><I size={11} /> {title}</div>
      <ul className="space-y-1 pl-4 text-[12px] leading-snug text-neutral-300">
        {items.map((x, i) => <li key={i} className="list-disc marker:text-neutral-600">{x}</li>)}
      </ul>
    </div>
  );
}

export function ReleaseDetails({ r }: { r: Release }) {
  return (
    <div className="space-y-3">
      <Section icon={Sparkles} title="New features" items={r.features} tone="text-[#f3b06b]" />
      <Section icon={Wrench} title="Improvements" items={r.improvements} tone="text-sky-300" />
      <Section icon={Bug} title="Bug fixes" items={r.fixes} tone="text-emerald-300" />
      <Section icon={Info} title="Compatibility notes" items={r.compatibility} tone="text-neutral-400" />
      <Section icon={AlertTriangle} title="Known issues" items={r.knownIssues} tone="text-amber-300" />
    </div>
  );
}

function Header({ r, current }: { r: Release; current: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm font-semibold text-neutral-100">v{r.version}{r.suffix || ''}</span>
      <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', CAT[r.category].chip)}>{CAT[r.category].label}</span>
      {current && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-200">{r.status === 'candidate' ? 'Current candidate' : 'Current build'}</span>}
      {r.status === 'candidate'
        ? <span className="text-[11px] text-amber-300">Unpublished source candidate</span>
        : <span className="text-[11px] text-neutral-500">{fmtDate(r.date)}</span>}
    </div>
  );
}

/** Home screen: concise preview of the latest release. */
export function LatestPatches() {
  const [open, setOpen] = useState(false);
  const online = useOnline();
  const r = RELEASES[0];
  return (
    <section aria-labelledby="latest-patches" className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <h3 id="latest-patches" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400"><History size={12} /> Latest Patches</h3>
        <span className="text-[10px] text-neutral-600">Build identity: CARBON PRIME {APP_VERSION} (Windows)</span>
        <div className="flex-1" />
        {!online && <span className="flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-400" title="You're offline. Release notes are bundled with the app, so they still work."><WifiOff size={10} /> Offline: notes bundled with this build</span>}
        <Btn onClick={() => setApp({ dialog: 'patches' })} disabled={!RELEASES.length}>View all updates</Btn>
      </div>
      {!r ? (
        <p className="px-4 py-4 text-xs text-neutral-500">No release notes are bundled with this build.</p>
      ) : (
        <div className="space-y-2 px-4 py-3">
          <Header r={r} current={r.version + (r.suffix || '') === APP_VERSION} />
          <div className="text-sm font-medium text-neutral-100">{r.title}</div>
          <p className="text-[12px] leading-relaxed text-neutral-400">{r.summary}</p>
          <div className="flex flex-wrap gap-3 text-[11px] text-neutral-500">
            <span>{r.features.length} new features</span><span>{r.improvements.length} improvements</span><span>{r.fixes.length} fixes</span>
          </div>
          <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1 text-[11px] text-[#E8913A] hover:underline">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {open ? 'Hide details' : 'Show details'}
          </button>
          {open && <div className="pt-1"><ReleaseDetails r={r} /></div>}
        </div>
      )}
    </section>
  );
}

/** View All Updates: chronological shipped releases and explicitly marked local source candidates. */
export function PatchesDialog() {
  const [filter, setFilter] = useState<'all' | ReleaseCategory>('all');
  const [open, setOpen] = useState<string | null>(RELEASES[0]?.version || null);
  const online = useOnline();
  const list = RELEASES.filter((r) => filter === 'all' || r.category === filter);
  return (
    <Modal title="All updates & source candidates: CARBON for Windows" onClose={() => setApp({ dialog: null })} width={720}>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <Btn active={filter === 'all'} onClick={() => setFilter('all')}>All ({RELEASES.length})</Btn>
        {(Object.keys(CAT) as ReleaseCategory[]).map((c) => (
          <Btn key={c} active={filter === c} onClick={() => setFilter(c)} title={CAT[c].desc}>
            <span className={cn('h-2 w-2 rounded-full', CAT[c].dot)} /> {CAT[c].label} ({RELEASES.filter((r) => r.category === c).length})
          </Btn>
        ))}
      </div>
      <p className="mb-4 text-[11px] text-neutral-500">
        Build identity: <b className="text-neutral-300">{APP_VERSION}</b>. Notes are bundled with this app and work offline{!online && ' (you are offline right now)'}. Entries labeled “Unpublished source candidate” are not published releases. CARBON doesn't download or install updates automatically.
      </p>
      {!list.length ? (
        <p className="py-8 text-center text-xs text-neutral-500">{RELEASES.length ? 'No releases in this category yet.' : 'No release notes are bundled with this build.'}</p>
      ) : (
        <ol className="relative space-y-3 border-l border-white/10 pl-5">
          {list.map((r) => {
            const isOpen = open === r.version;
            return (
              <li key={r.version} className="relative">
                <span className={cn('absolute -left-[26px] top-1.5 h-3 w-3 rounded-full ring-4 ring-[#1c1c1f]', CAT[r.category].dot)} />
                <button onClick={() => setOpen(isOpen ? null : r.version)} aria-expanded={isOpen} className="w-full rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-left hover:border-white/15">
                  <Header r={r} current={r.version + (r.suffix || '') === APP_VERSION} />
                  <div className="mt-1 flex items-center gap-1 text-[13px] font-medium text-neutral-100">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {r.title}</div>
                  <p className="mt-0.5 text-[11px] text-neutral-400">{r.summary}</p>
                </button>
                {isOpen && <div className="mt-2 rounded-lg border border-white/5 bg-black/20 p-3"><ReleaseDetails r={r} /></div>}
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
