import { EDITION } from '../platform/edition';
import type { ThemeTokens } from './themes';

const tokenCache = new Map<string, string>();
if (EDITION.windows && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('carbon-theme-change', () => tokenCache.clear());
}

/** Read a cached UI token for canvas-rendered chrome; Android keeps the historical color path. */
export function readThemeToken(key: keyof ThemeTokens, fallback: string): string {
  if (!EDITION.windows || typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const root = document.documentElement;
  const cssKey = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
  const cacheKey = `${root.dataset.carbonTheme || ''}:${cssKey}`;
  const cached = tokenCache.get(cacheKey);
  if (cached) return cached;
  const value = getComputedStyle(root).getPropertyValue(`--carbon-ui-${cssKey}`).trim();
  if (value) tokenCache.set(cacheKey, value);
  return value || fallback;
}

/** Subscribe to a Windows-only UI theme change without adding inert event listeners to Android. */
export function onThemeChange(listener: () => void): () => void {
  if (!EDITION.windows || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  const handler = () => listener();
  window.addEventListener('carbon-theme-change', handler);
  return () => window.removeEventListener('carbon-theme-change', handler);
}
