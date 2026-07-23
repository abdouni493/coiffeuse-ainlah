import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'salon.theme';
/** Black + gold is the salon's identity, so dark is the default. */
const DEFAULT_THEME: Theme = 'dark';

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* private mode / disabled storage */ }
  return DEFAULT_THEME;
}

/** Every colour token is keyed off `data-theme` on <html>. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
}

/**
 * Reads the current theme and lets any component flip it. All subscribers stay
 * in sync through a `themechange` event, so several toggles can coexist (navbar
 * + login screen) without a provider.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() =>
    (document.documentElement.getAttribute('data-theme') as Theme) || getStoredTheme()
  );

  useEffect(() => {
    const onChange = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail);
    window.addEventListener('themechange', onChange);
    return () => window.removeEventListener('themechange', onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    window.dispatchEvent(new CustomEvent<Theme>('themechange', { detail: t }));
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme =
      (document.documentElement.getAttribute('data-theme') as Theme) === 'light' ? 'dark' : 'light';
    setTheme(next);
  }, [setTheme]);

  return { theme, toggleTheme, setTheme };
}
