import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
/** What the user picked. `system` follows the operating system and tracks it live. */
export type ThemePreference = Theme | 'system';

const STORAGE_KEY = 'postrail.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

export function resolveTheme(preference: ThemePreference, systemIsDark: boolean): Theme {
  if (preference === 'system') return systemIsDark ? 'dark' : 'light';
  return preference;
}

// One preference for the whole page, so every component that reads the theme (the account
// menu, the template editor) changes together. index.html applies it before first paint.
let preference = readPreference();
const listeners = new Set<() => void>();

function apply(): void {
  const theme = resolveTheme(preference, matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage unavailable */
  }
  apply();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // The system can flip while the page is open (sunset schedules); follow it.
  const media = matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    apply();
    listener();
  };
  media.addEventListener('change', onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystemChange);
  };
}

/** The preference, the theme it resolves to right now, and the setter. */
export function useTheme(): {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
} {
  const current = useSyncExternalStore(subscribe, () => preference);
  const systemIsDark = useSyncExternalStore(subscribe, () => matchMedia(DARK_QUERY).matches);
  return {
    theme: resolveTheme(current, systemIsDark),
    preference: current,
    setPreference: setThemePreference,
  };
}
