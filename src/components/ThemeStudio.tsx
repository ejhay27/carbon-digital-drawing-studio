import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, Copy, Download, Palette, RotateCcw, Search, Trash2, Upload } from 'lucide-react';
import { Btn, SectionTitle } from './ui';
import { confirmDialog } from '../state/store';
import { useThemeStudio } from '../theme/themeStore';
import {
  BUILT_IN_THEMES, DEFAULT_THEME_ID, MAX_CUSTOM_THEMES, MAX_THEME_BUNDLE_BYTES, MAX_THEME_NAME_LENGTH,
  THEME_CATEGORIES, THEME_TOKEN_KEYS, THEME_TOKEN_LABELS,
  createCustomTheme, exportThemeBundle, findTheme, parseThemeBundleText, validateThemeSpec,
  type ThemeCategory, type ThemeDefinition, type ThemeMode, type ThemeTokens,
} from '../theme/themes';

function saveJson(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFilename(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'custom-theme';
}

export default function ThemeStudio() {
  const activeThemeId = useThemeStudio((state) => state.activeThemeId);
  const customThemes = useThemeStudio((state) => state.customThemes);
  const setActiveTheme = useThemeStudio((state) => state.setActiveTheme);
  const addCustomTheme = useThemeStudio((state) => state.addCustomTheme);
  const addImportedThemes = useThemeStudio((state) => state.addImportedThemes);
  const deleteCustomTheme = useThemeStudio((state) => state.deleteCustomTheme);
  const activeTheme = findTheme(activeThemeId, customThemes);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'All' | ThemeCategory>('All');
  const [draftName, setDraftName] = useState(activeTheme.name);
  const [draftDescription, setDraftDescription] = useState(activeTheme.description);
  const [draftMode, setDraftMode] = useState<ThemeMode>(activeTheme.mode);
  const [draftTokens, setDraftTokens] = useState<ThemeTokens>({ ...activeTheme.tokens });
  const [editingThemeId, setEditingThemeId] = useState<string | null>(activeTheme.category === 'Custom' ? activeTheme.id : null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftName(activeTheme.name);
    setDraftDescription(activeTheme.description);
    setDraftMode(activeTheme.mode);
    setDraftTokens({ ...activeTheme.tokens });
    setEditingThemeId(activeTheme.category === 'Custom' ? activeTheme.id : null);
    setMessage(null);
  }, [activeTheme.id, activeTheme.name, activeTheme.description, activeTheme.mode, activeTheme.tokens, activeTheme.category]);

  const themes = useMemo(() => [...BUILT_IN_THEMES, ...customThemes], [customThemes]);
  const filteredThemes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return themes.filter((theme) => {
      const categoryMatch = category === 'All' || theme.category === category;
      const searchMatch = !needle || `${theme.name} ${theme.description} ${theme.category}`.toLocaleLowerCase().includes(needle);
      return categoryMatch && searchMatch;
    });
  }, [themes, query, category]);
  const draftValidation = validateThemeSpec({ name: draftName, description: draftDescription, mode: draftMode, tokens: draftTokens });
  const editingTheme = editingThemeId ? customThemes.find((theme) => theme.id === editingThemeId) : null;

  const beginImport = () => importInput.current?.click();
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > MAX_THEME_BUNDLE_BYTES) {
      setMessage({ text: `Choose a JSON file smaller than ${MAX_THEME_BUNDLE_BYTES / 1024} KB.`, error: true });
      return;
    }
    try {
      const parsed = parseThemeBundleText(await file.text());
      if (!parsed.ok) { setMessage({ text: parsed.error, error: true }); return; }
      if (customThemes.length + parsed.value.length > MAX_CUSTOM_THEMES) {
        setMessage({ text: `You can keep up to ${MAX_CUSTOM_THEMES} custom themes on this device.`, error: true });
        return;
      }
      const usedIds = new Set([...BUILT_IN_THEMES.map((theme) => theme.id), ...customThemes.map((theme) => theme.id)]);
      const imported = parsed.value.map((spec) => {
        const theme = createCustomTheme(spec, usedIds);
        usedIds.add(theme.id);
        return theme;
      });
      if (!addImportedThemes(imported)) {
        setMessage({ text: 'Those themes could not be added. Review the local theme limit and try again.', error: true });
        return;
      }
      setMessage({ text: `Imported ${imported.length} validated theme${imported.length === 1 ? '' : 's'} and applied the first one.`, error: false });
    } catch (error) {
      setMessage({ text: `Could not read that theme file: ${error instanceof Error ? error.message : 'unknown error'}.`, error: true });
    }
  };

  const exportSelected = () => {
    saveJson(`carbon-theme-${safeFilename(activeTheme.name)}.json`, exportThemeBundle([activeTheme]));
    setMessage({ text: `Exported “${activeTheme.name}” as validated JSON.`, error: false });
  };

  const exportCustomThemes = () => {
    if (customThemes.length === 0) return;
    saveJson('carbon-custom-themes.json', exportThemeBundle(customThemes));
    setMessage({ text: `Exported all ${customThemes.length} custom theme${customThemes.length === 1 ? '' : 's'} as validated JSON.`, error: false });
  };

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftValidation.ok) return;
    const ids = [...BUILT_IN_THEMES, ...customThemes].map((theme) => theme.id);
    const saved: ThemeDefinition = editingTheme
      ? { ...editingTheme, ...draftValidation.value, category: 'Custom', tokens: { ...draftValidation.value.tokens } }
      : createCustomTheme(draftValidation.value, ids);
    if (!addCustomTheme(saved)) {
      setMessage({ text: `Could not save. A maximum of ${MAX_CUSTOM_THEMES} custom themes is allowed.`, error: true });
      return;
    }
    setEditingThemeId(saved.id);
    setMessage({ text: editingTheme ? 'Custom theme updated and applied.' : 'Custom theme saved and applied.', error: false });
  };

  const removeActiveCustom = async () => {
    if (activeTheme.category !== 'Custom') return;
    const choice = await confirmDialog(
      'Delete custom theme?',
      `“${activeTheme.name}” will be removed from this device. This will not change artwork, document colors or saved projects.`,
      [{ label: 'Cancel', value: 'cancel' }, { label: 'Delete theme', value: 'delete', variant: 'danger' }],
    );
    if (choice !== 'delete') return;
    deleteCustomTheme(activeTheme.id);
    setMessage({ text: 'Custom theme deleted. Carbon Prime is active if that theme was selected.', error: false });
  };

  const resetTheme = () => {
    setActiveTheme(DEFAULT_THEME_ID);
    setMessage({ text: 'Carbon Prime is active. Your saved custom themes were kept.', error: false });
  };

  const duplicateActiveTheme = () => {
    if (customThemes.length >= MAX_CUSTOM_THEMES) {
      setMessage({ text: `You can keep up to ${MAX_CUSTOM_THEMES} custom themes on this device.`, error: true });
      return;
    }
    const copySuffix = ' Copy';
    const spec = {
      ...activeTheme,
      name: `${activeTheme.name.slice(0, MAX_THEME_NAME_LENGTH - copySuffix.length)}${copySuffix}`,
    };
    const copy = createCustomTheme({ name: spec.name, description: spec.description, mode: spec.mode, tokens: { ...spec.tokens } }, themes.map((theme) => theme.id));
    if (!addCustomTheme(copy)) {
      setMessage({ text: 'Could not duplicate this theme. Try again after reviewing the local theme limit.', error: true });
      return;
    }
    setMessage({ text: `Created and applied “${copy.name}” as a separate custom theme.`, error: false });
  };

  const resetDraft = () => {
    setDraftName(activeTheme.name);
    setDraftDescription(activeTheme.description);
    setDraftMode(activeTheme.mode);
    setDraftTokens({ ...activeTheme.tokens });
    setEditingThemeId(activeTheme.category === 'Custom' ? activeTheme.id : null);
    setMessage({ text: 'Unsaved editor changes were discarded; the selected theme is unchanged.', error: false });
  };

  const updateDraftToken = (key: keyof ThemeTokens, value: string) => setDraftTokens((tokens) => ({ ...tokens, [key]: value }));

  return (
    <div className="space-y-3" aria-label="Theme Studio">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <SectionTitle>Studio appearance</SectionTitle>
          <p className="max-w-xl text-[11px] leading-relaxed text-neutral-400">
            Themes change Carbon’s interface only. Canvas pixels, document backgrounds, layer colors, palettes and saved projects stay untouched. Theme settings are stored locally on this device.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Btn onClick={resetTheme} title="Apply the default Carbon Prime theme"><RotateCcw size={13} />Reset default</Btn>
          <Btn onClick={duplicateActiveTheme} disabled={customThemes.length >= MAX_CUSTOM_THEMES} title="Make an independent editable copy of the selected theme"><Copy size={13} />Duplicate</Btn>
          <Btn onClick={beginImport} title="Import a validated Carbon Theme Studio JSON file"><Upload size={13} />Import JSON</Btn>
          <Btn onClick={exportSelected} title="Export the selected theme as a JSON file"><Download size={13} />Export selected</Btn>
          <Btn onClick={exportCustomThemes} disabled={customThemes.length === 0} title="Export every saved custom theme as a JSON file"><Download size={13} />Export custom</Btn>
          <input ref={importInput} type="file" accept="application/json,.json" className="hidden" aria-label="Choose a Carbon theme JSON file" onChange={(event) => void importFile(event)} />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-w-[170px] flex-1 items-center gap-2 rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-neutral-400 focus-within:border-[#E8913A]">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">Search themes</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-neutral-100 outline-none placeholder:text-neutral-500" placeholder="Search themes…" type="search" />
          </label>
          <span className="text-[10px] text-neutral-500" aria-live="polite">{filteredThemes.length} of {themes.length} themes</span>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter themes by category">
          {THEME_CATEGORIES.map((filter) => (
            <button key={filter} type="button" aria-pressed={category === filter} onClick={() => setCategory(filter)} className={`rounded-full border px-2.5 py-1 text-[10px] transition ${category === filter ? 'border-[#E8913A]/70 bg-[#E8913A]/15 text-neutral-100' : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:bg-white/10 hover:text-white'}`}>
              {filter}
            </button>
          ))}
        </div>
        {filteredThemes.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Available themes">
            {filteredThemes.map((theme) => {
              const selected = activeThemeId === theme.id;
              return (
                <button key={theme.id} type="button" aria-pressed={selected} onClick={() => setActiveTheme(theme.id)} className={`rounded-lg border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 ${selected ? 'border-[#E8913A] bg-[#E8913A]/10' : 'border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.05]'}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-100">
                        <Palette size={13} className="shrink-0 text-[#E8913A]" aria-hidden="true" />
                        <span className="truncate">{theme.name}</span>
                      </span>
                      <span className="mt-1 block text-[10px] leading-relaxed text-neutral-400">{theme.description}</span>
                    </span>
                    {selected && <Check size={15} className="shrink-0 text-[#E8913A]" aria-label="Currently active" />}
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-2">
                    <span className="flex gap-1" aria-label="Theme color preview">
                      {(['background', 'surface', 'text', 'accent', 'focus'] as const).map((key) => <span key={key} className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: theme.tokens[key] }} />)}
                    </span>
                    <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-neutral-500">{theme.category}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : <p className="rounded-md border border-dashed border-white/20 p-4 text-center text-xs text-neutral-500">No themes match this search. Try another name or category.</p>}
      </div>

      <section className="rounded-lg border border-white/10 bg-white/[0.02] p-3" aria-labelledby="theme-editor-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <SectionTitle>Custom theme editor</SectionTitle>
            <h3 id="theme-editor-heading" className="text-xs font-semibold text-neutral-100">{editingTheme ? `Edit ${editingTheme.name}` : `Create from ${activeTheme.name}`}</h3>
          </div>
          {activeTheme.category === 'Custom' && <Btn variant="danger" onClick={() => void removeActiveCustom()} title="Delete the selected custom theme"><Trash2 size={13} />Delete custom</Btn>}
        </div>
        <form onSubmit={saveDraft} className="mt-2 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
            <label className="text-[10px] text-neutral-400">Theme name
              <input value={draftName} maxLength={40} onChange={(event) => setDraftName(event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-[#E8913A]" aria-invalid={!draftName.trim()} />
            </label>
            <label className="text-[10px] text-neutral-400">Interface mode
              <select value={draftMode} onChange={(event) => setDraftMode(event.target.value as ThemeMode)} className="mt-1 w-full rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-[#E8913A]">
                <option value="dark">Dark</option><option value="light">Light</option>
              </select>
            </label>
          </div>
          <label className="block text-[10px] text-neutral-400">Description
            <input value={draftDescription} maxLength={120} onChange={(event) => setDraftDescription(event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-[#E8913A]" />
          </label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {THEME_TOKEN_KEYS.map((key) => (
              <label key={key} className="flex min-w-0 items-center gap-1.5 rounded border border-white/10 bg-white/[0.02] px-1.5 py-1 text-[9px] text-neutral-400">
                <input type="color" value={draftTokens[key]} onChange={(event) => updateDraftToken(key, event.target.value)} aria-label={THEME_TOKEN_LABELS[key]} className="h-6 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
                <span className="min-w-0 truncate">{THEME_TOKEN_LABELS[key]}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-7 items-center gap-1 rounded border px-2 text-[10px]" style={{ backgroundColor: draftTokens.surface, color: draftTokens.text, borderColor: draftTokens.border }}>
                Carbon <span className="rounded px-1.5 py-0.5 font-semibold" style={{ backgroundColor: draftTokens.accent, color: draftTokens.onAccent }}>Accent</span>
                <span style={{ color: draftTokens.muted }}>Secondary</span>
              </div>
              {draftValidation.ok ? <span className="text-[10px] text-emerald-300">Contrast checks passed</span> : <span className="max-w-[280px] text-[10px] text-red-300" role="alert">{draftValidation.error}</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Btn onClick={resetDraft} title="Discard unsaved editor changes and reload the selected theme"><RotateCcw size={12} />Reset editor</Btn>
              <button type="submit" disabled={!draftValidation.ok} className="inline-flex items-center justify-center gap-1 rounded-md bg-[#E8913A] px-3 py-1.5 text-[11px] font-medium text-neutral-950 transition-colors hover:bg-[#f0a457] disabled:cursor-not-allowed disabled:opacity-40">{editingTheme ? 'Save changes' : 'Create custom theme'}</button>
            </div>
          </div>
        </form>
      </section>

      {message && <p className={`rounded-md border px-3 py-2 text-[11px] ${message.error ? 'border-red-500/30 bg-red-500/5 text-red-300' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      <p className="text-[10px] leading-relaxed text-neutral-500">Theme imports accept only versioned Carbon Theme Studio JSON with plain-text names and validated HEX tokens. Scripts, CSS, URLs and unknown fields are rejected; imports are stored locally and work offline.</p>
    </div>
  );
}
