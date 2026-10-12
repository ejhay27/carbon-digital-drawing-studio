import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Command, CornerDownLeft, Search, X } from 'lucide-react';
import { ALL_TOOLS, setApp, setTool, toast, useApp } from '../state/store';
import { isNative, listProjects, readProject } from '../platform/native';
import { EDITION } from '../platform/edition';
import { listRecent, navigateHomeSafely, openBytes, openFileDialog, openRecent, saveActiveDocument } from '../state/actions';
import { fitView, prettyCombo, runAction } from '../state/commands';
import { nextPaletteSelection, firstPaletteSelection, searchPaletteItems, type PaletteSearchItem } from '../state/commandPalette';
import { switchWorkspace } from '../win/WinPanels';
import { updateSettings } from '../state/store';
import { fmtBytes } from '../engine/util';

type PaletteCommand = PaletteSearchItem & { description: string; shortcut?: string; action: () => void };
type RecentFile = { key: string; name: string };
type NativeFile = { path: string; name: string; size: number };

const workspaceItems = [
  { id: 'draw', title: 'Draw workspace', keywords: 'painting canvas 2d', description: 'Open an existing Draw document' },
  { id: 'infinite', title: 'Infinite Painter workspace', keywords: 'painting canvas painter', description: 'Open an Infinite Painter document' },
  { id: 'projects', title: 'Project Library', keywords: 'saved projects documents local storage', description: 'Browse saved editable projects' },
  { id: 'effects', title: 'Effects workspace', keywords: 'liquify filters', description: 'Open the local effects workspace' },
  { id: 'board', title: 'Orbit Board', keywords: 'references notes links', description: 'Open the local reference board' },
  { id: 'library', title: 'Brush Library', keywords: 'local brushes presets packs', description: 'Browse the bundled and installed brush library' },
] as const;

export default function CommandPalette() {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [nativeFiles, setNativeFiles] = useState<NativeFile[]>([]);
  const docs = useApp((s) => s.docs);
  const activeId = useApp((s) => s.activeId);
  const tick = useApp((s) => s.tick);
  const shortcuts = useApp((s) => s.settings.shortcuts);
  const settings = useApp((s) => s.settings);
  const doc = docs.find((d) => d.id === activeId) || null;
  const isNativePlatform = isNative();

  useEffect(() => {
    let live = true;
    listRecent().then((rows) => { if (live) setRecent(rows.map((x) => ({ key: x.key, name: x.value.name }))); });
    if (isNativePlatform) listProjects().then((rows) => { if (live) setNativeFiles(rows.map(({ path, name, size }) => ({ path, name, size }))); }).catch(() => {});
    input.current?.focus();
    return () => { live = false; };
  }, [isNativePlatform]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const cmd = (id: string, title: string, category: string, description: string, action: () => void, extra: { keywords?: string; disabled?: boolean; shortcut?: string } = {}): PaletteCommand => ({ id, title, category, description, action, ...extra });
    const sc = (id: string) => shortcuts[id] ? prettyCombo(shortcuts[id]) : undefined;
    const files: PaletteCommand[] = [
      cmd('app.home', 'Return Home safely', 'Actions', 'Save unsaved work first; cancel or failure keeps the editor open', () => void navigateHomeSafely(), { keywords: 'home save start screen', disabled: !doc }),
      cmd('file.new', EDITION.windows ? 'Create a workspace…' : 'New canvas', 'Actions', EDITION.windows ? 'Choose Draw, Comic Studio, 3D Studio or another supported workspace' : 'Create a new drawing document', () => runAction('file.new'), { keywords: 'document drawing comic 3d blank create studio', shortcut: sc('file.new') }),
      cmd('file.open', 'Open project or image', 'Actions', 'Choose a local .carbon project or image', () => void openFileDialog(), { keywords: 'browse import local', shortcut: sc('file.open') }),
      cmd('file.save', 'Save current project', 'Actions', 'Save the active Draw, Comic or 3D project to its correct local file', () => doc && void saveActiveDocument('save'), { keywords: 'write .carbon .carboncomic project', disabled: !doc, shortcut: sc('file.save') }),
      cmd('file.saveAs', 'Save project as…', 'Actions', 'Choose a path and name for the active project', () => doc && void saveActiveDocument('saveAs'), { keywords: 'write copy .carbon .carboncomic', disabled: !doc, shortcut: sc('file.saveAs') }),
      cmd('file.export', 'Export image', 'Actions', 'Open the local PNG, JPEG or WebP export options', () => runAction('file.export'), { keywords: 'png jpg jpeg webp', disabled: !doc, shortcut: sc('file.export') }),
      cmd('edit.undo', 'Undo', 'Actions', 'Undo the last document edit', () => runAction('edit.undo'), { keywords: 'history back', disabled: !doc?.undoStack.length, shortcut: sc('edit.undo') }),
      cmd('edit.redo', 'Redo', 'Actions', 'Redo the last undone document edit', () => runAction('edit.redo'), { keywords: 'history forward', disabled: !doc?.redoStack.length, shortcut: sc('edit.redo') }),
      cmd('layer.new', 'Add raster layer', 'Actions', 'Create an editable paint layer', () => runAction('layer.new'), { keywords: 'layers paint', disabled: !doc, shortcut: sc('layer.new') }),
      cmd('layer.newInk', 'Add Crisp Ink layer', 'Actions', 'Create an editable vector-like line-art layer', () => runAction('layer.newInk'), { keywords: 'layers line art vector', disabled: !doc, shortcut: sc('layer.newInk') }),
      cmd('view.fit', 'Fit canvas to screen', 'Actions', 'Center and fit the active 2D document', () => doc && fitView(doc, 'fit'), { keywords: 'zoom view', disabled: !doc, shortcut: sc('view.fit') }),
    ];
    const tools: PaletteCommand[] = ALL_TOOLS.map((tool) => cmd(
      `tool.${tool.id}`, `${tool.label} tool`, 'Tools', `Switch to ${tool.label.toLocaleLowerCase()}`,
      () => setTool(tool.id), { keywords: `${tool.id} ${tool.key} drawing`, disabled: !doc, shortcut: sc(`tool.${tool.id}`) },
    ));
    const workspaces: PaletteCommand[] = EDITION.windows ? workspaceItems.map((ws) => cmd(
      `workspace.${ws.id}`, ws.title, 'Workspaces', ws.description,
      () => switchWorkspace(ws.id), { keywords: `${ws.keywords} workspace`, disabled: ws.id !== 'draw' && ws.id !== 'infinite' && ws.id !== 'projects' && ws.id !== 'library' && !doc },
    )) : [];
    const prefs: PaletteCommand[] = [
      cmd('settings.open', 'Preferences', 'Settings', 'Open Carbon preferences', () => setApp({ dialog: 'settings' }), { keywords: 'options configuration' }),
      cmd('settings.shortcuts', 'Keyboard shortcuts', 'Settings', 'Review or customize shortcuts', () => setApp({ dialog: 'shortcuts' }), { keywords: 'keys customize hotkeys' }),
      cmd('settings.homeScene', 'Home scene preferences', 'Settings', 'Change the bundled Home scene and motion preferences', () => setApp({ dialog: 'settingsHome' }), { keywords: 'ocean coast background animation reduced motion', disabled: !EDITION.windows }),
      cmd('settings.reduceMotion', 'Toggle Home scene motion', 'Settings', 'Respect your choice to animate or freeze the Home scene', () => updateSettings({ homeSceneMotion: !settings.homeSceneMotion }), { keywords: 'ocean animation freeze motion', disabled: !EDITION.windows }),
      cmd('help.quickStart', 'Offline Quick Start guide', 'Settings', 'Open the dismissible local guide and editable sample', () => setApp({ dialog: 'quickStart' }), { keywords: 'tutorial onboarding sample project' }),
      cmd('help.about', 'About Carbon', 'Settings', 'Open version and project information', () => setApp({ dialog: 'about' }), { keywords: 'version creator project information' }),
    ];
    const localRecent = recent.map((file) => cmd(
      `recent.${file.key}`, file.name, 'Browser-local recent files', 'Open a locally stored recent project',
      () => void openRecent(file.key), { keywords: `project .carbon recent ${file.key}` },
    ));
    const deviceRecent = nativeFiles.map((file) => cmd(
      `device.${file.path}`, file.name.replace(/\.carbon$/i, ''), 'Android device files', `Open ${fmtBytes(file.size)} project from the Android CARBON folder`,
      () => { void (async () => { try { await openBytes(await readProject(file.path), file.name, { native: true, name: file.name }); } catch (e) { toast('Could not read file: ' + (e instanceof Error ? e.message : e), 'error'); } })(); },
      { keywords: `device android .carbon ${file.path}` },
    ));
    return [...files, ...tools, ...workspaces, ...prefs, ...localRecent, ...deviceRecent];
  }, [doc, tick, shortcuts, settings.homeSceneMotion, recent, nativeFiles]);

  const filtered = useMemo(() => searchPaletteItems(commands, query), [commands, query]);
  useEffect(() => { setSelected(firstPaletteSelection(filtered)); }, [filtered]);

  const close = () => setApp({ dialog: null });
  const execute = (item: PaletteCommand | undefined) => {
    if (!item || item.disabled) return;
    close();
    item.action();
  };
  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((current) => nextPaletteSelection(filtered, current, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Home') {
      e.preventDefault(); setSelected(firstPaletteSelection(filtered));
    } else if (e.key === 'End') {
      e.preventDefault(); setSelected(nextPaletteSelection(filtered, 0, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault(); execute(filtered[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); close();
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-black/65 px-4 pt-[min(16vh,120px)] backdrop-blur-sm" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="command-palette-title" className="w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1f] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Command size={18} className="shrink-0 text-[#E8913A]" />
          <label htmlFor="carbon-command-search" id="command-palette-title" className="sr-only">Search Carbon commands</label>
          <Search size={15} className="shrink-0 text-neutral-500" />
          <input
            ref={input} id="carbon-command-search" role="combobox" aria-expanded="true" aria-controls="carbon-command-results"
            aria-activedescendant={filtered[selected] ? `command-${selected}` : undefined}
            autoComplete="off" spellCheck={false} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={keyDown}
            placeholder="Search actions, tools, workspaces, settings, and recent files…"
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-600"
          />
          <button onClick={close} aria-label="Close command palette" title="Close (Esc)" className="rounded p-1.5 text-neutral-500 hover:bg-white/10 hover:text-white"><X size={16} /></button>
        </div>
        <div id="carbon-command-results" role="listbox" aria-label="Commands" className="max-h-[min(62vh,560px)] overflow-y-auto p-2">
          {filtered.length ? filtered.map((item, index) => (
            <button
              key={item.id} id={`command-${index}`} role="option" aria-selected={selected === index} disabled={item.disabled}
              onMouseEnter={() => setSelected(index)} onClick={() => execute(item)}
              className={'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ' + (selected === index ? 'bg-[#E8913A]/15 text-white' : 'text-neutral-300 hover:bg-white/5') + (item.disabled ? ' cursor-not-allowed opacity-35' : '')}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium">{item.title}</span>
                  <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-neutral-500">{item.category}</span>
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-neutral-500">{item.description}</span>
              </span>
              {item.shortcut && <kbd className="shrink-0 rounded border border-white/10 bg-black/20 px-1.5 py-1 font-mono text-[10px] text-neutral-500">{item.shortcut}</kbd>}
            </button>
          )) : <p className="px-4 py-10 text-center text-xs text-neutral-500">No commands match “{query}”. Try a tool, action, setting or project name.</p>}
        </div>
        <footer className="flex flex-wrap items-center gap-3 border-t border-white/5 px-4 py-2 text-[10px] text-neutral-600">
          <span className="inline-flex items-center gap-1"><ArrowUp size={12} /><ArrowDown size={12} /> Navigate</span>
          <span className="inline-flex items-center gap-1"><CornerDownLeft size={12} /> Run</span>
          <span className="ml-auto">Esc to close · Ctrl+K to open</span>
        </footer>
      </div>
    </div>
  );
}
