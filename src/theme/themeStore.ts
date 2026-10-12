import { useLayoutEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { EDITION } from '../platform/edition';
import {
  BUILT_IN_THEMES, DEFAULT_THEME_ID, MAX_CUSTOM_THEMES, findTheme, sanitizeThemePreferences,
  validateCustomTheme, type ThemeDefinition,
} from './themes';

const inertStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function themeStorage(): StateStorage {
  if (!EDITION.windows) return inertStorage;
  try { return window.localStorage; } catch { return inertStorage; }
}

interface ThemeStudioState {
  activeThemeId: string;
  customThemes: ThemeDefinition[];
  setActiveTheme: (id: string) => void;
  addCustomTheme: (theme: ThemeDefinition) => boolean;
  addImportedThemes: (themes: ThemeDefinition[]) => boolean;
  deleteCustomTheme: (id: string) => void;
}

export const useThemeStudio = create<ThemeStudioState>()(
  persist(
    (set, get) => ({
      activeThemeId: DEFAULT_THEME_ID,
      customThemes: [],
      setActiveTheme: (id) => {
        const state = get();
        if (BUILT_IN_THEMES.some((theme) => theme.id === id) || state.customThemes.some((theme) => theme.id === id)) {
          set({ activeThemeId: id });
        }
      },
      addCustomTheme: (candidate) => {
        const checked = validateCustomTheme(candidate);
        if (!checked.ok) return false;
        const state = get();
        const exists = state.customThemes.some((theme) => theme.id === checked.value.id);
        if (!exists && state.customThemes.length >= MAX_CUSTOM_THEMES) return false;
        const customThemes = exists
          ? state.customThemes.map((theme) => theme.id === checked.value.id ? checked.value : theme)
          : [...state.customThemes, checked.value];
        set({ customThemes, activeThemeId: checked.value.id });
        return true;
      },
      addImportedThemes: (themes) => {
        const state = get();
        if (state.customThemes.length + themes.length > MAX_CUSTOM_THEMES) return false;
        const existing = new Set([...BUILT_IN_THEMES.map((theme) => theme.id), ...state.customThemes.map((theme) => theme.id)]);
        const clean: ThemeDefinition[] = [];
        for (const candidate of themes) {
          const checked = validateCustomTheme(candidate);
          if (!checked.ok || existing.has(checked.value.id)) return false;
          existing.add(checked.value.id);
          clean.push(checked.value);
        }
        if (clean.length === 0) return false;
        set({ customThemes: [...state.customThemes, ...clean], activeThemeId: clean[0].id });
        return true;
      },
      deleteCustomTheme: (id) => {
        const state = get();
        const customThemes = state.customThemes.filter((theme) => theme.id !== id);
        if (customThemes.length === state.customThemes.length) return;
        set({ customThemes, activeThemeId: state.activeThemeId === id ? DEFAULT_THEME_ID : state.activeThemeId });
      },
    }),
    {
      // Keep the v1 storage key so previously saved custom themes survive the token-schema migration.
      name: 'carbon-theme-studio-v1',
      version: 2,
      storage: createJSONStorage(themeStorage),
      partialize: (state) => ({ activeThemeId: state.activeThemeId, customThemes: state.customThemes }),
      migrate: (persisted) => sanitizeThemePreferences(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizeThemePreferences(persisted) }),
    },
  ),
);

export function applyThemeTokens(theme: ThemeDefinition) {
  if (!EDITION.windows || typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.carbonTheme = theme.id;
  root.dataset.carbonMode = theme.mode;
  root.style.colorScheme = theme.mode;
  root.style.setProperty('--carbon-ui-mode', theme.mode);
  for (const [key, value] of Object.entries(theme.tokens)) {
    const cssKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
    root.style.setProperty(`--carbon-ui-${cssKey}`, value);
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('carbon-theme-change'));
}

/** Applies the Windows-only local theme before the browser paints a new selection. */
export function ThemeSync() {
  const activeThemeId = useThemeStudio((state) => state.activeThemeId);
  const customThemes = useThemeStudio((state) => state.customThemes);
  const activeTheme = findTheme(activeThemeId, customThemes);
  // React's layout effect keeps selection changes immediate rather than waiting for a later frame.
  useLayoutEffect(() => { applyThemeTokens(activeTheme); }, [activeTheme]);
  return null;
}
