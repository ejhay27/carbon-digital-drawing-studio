import { useState } from 'react';
import { BookOpen, FilePlus2, FolderOpen, Layers3, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import { newDocument } from '../state/actions';
import { openQuickStartSample } from '../state/quickStartSample';
import { setApp, updateSettings } from '../state/store';
import { EDITION } from '../platform/edition';
import { Btn, Modal } from './ui';

const finish = () => { updateSettings({ quickStartSeen: true }); setApp({ dialog: null }); };

export default function QuickStartDialog() {
  const [step, setStep] = useState(0);
  const cards = [
    {
      title: 'Welcome to Carbon: Prime', icon: BookOpen,
      body: 'Carbon is a local-first drawing studio. Your projects and preferences stay in this app or on your device; the guide, artwork sample and core tools work offline.',
      tip: 'This short tour is optional. Close it any time, and reopen it from Home or Help → Quick Start.',
    },
    {
      title: 'Start drawing', icon: FilePlus2,
      body: 'Create a canvas or open a .carbon project or image. Pick a brush, choose a color, and draw on the active layer. The brush, eraser, picker, fill and selection tools are available from the tool rail.',
      tip: 'Use Ctrl+K to search for actions and tools. Ctrl+Z undoes an edit; Ctrl+S opens the local save flow.',
    },
    {
      title: 'Keep work yours', icon: Layers3,
      body: 'Layers keep paint and crisp line art independently editable. Browser-local recents are separate from Android files in the CARBON device folder. Autosave is for recovery; use Save or Save As to choose a project file.',
      tip: 'The sample opens as a separate document with its own paint and ink layers. It never replaces an open document or an existing file.',
    },
    ...(EDITION.windows ? [{
      title: 'Explore more spaces', icon: WandSparkles,
      body: '3D Studio has a real white ground and perspective grid, a dedicated camera-navigation tool, and strokes that can attach to object surfaces. Comic Studio and other workspaces are also available from the workspace bar.',
      tip: 'Surface symmetry projects each mirrored or repeated copy onto available mesh surfaces; copies without a matching surface are skipped. Each created stroke remains an editable scene object.',
    }] : []),
    {
      title: 'A safe place to practice', icon: ShieldCheck,
      body: 'Try the included offline sample or start with a blank practice canvas. Both are added as new documents; they do not write to disk or change other tabs until you choose to save.',
      tip: 'You can reopen this guide from Home or the Help menu after dismissing the first-run reminder.',
    },
  ];
  const current = cards[Math.min(step, cards.length - 1)];
  const Icon = current.icon;
  const openSample = () => { finish(); void openQuickStartSample(); };
  const createPractice = () => { finish(); newDocument(1600, 1200, 'Quick Start Practice'); };

  return (
    <Modal
      title="Offline Quick Start"
      onClose={finish}
      width={560}
      footer={(
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="mr-auto text-[10px] text-neutral-600">Step {step + 1} of {cards.length}</span>
          <Btn onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Btn>
          {step < cards.length - 1
            ? <Btn variant="primary" onClick={() => setStep((s) => Math.min(cards.length - 1, s + 1))}>Next</Btn>
            : <Btn variant="primary" onClick={finish}>Done</Btn>}
        </div>
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[#E8913A]/10 p-2.5 text-[#E8913A]"><Icon size={20} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white">{current.title}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-300">{current.body}</p>
          <p className="mt-3 rounded-lg border border-white/5 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-neutral-500">{current.tip}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
        <Btn variant="primary" onClick={openSample}><Sparkles size={13} /> Open editable sample project</Btn>
        <Btn onClick={createPractice}><FilePlus2 size={13} /> New blank practice canvas</Btn>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-neutral-600"><FolderOpen size={12} /> Local and offline</span>
      </div>
    </Modal>
  );
}
