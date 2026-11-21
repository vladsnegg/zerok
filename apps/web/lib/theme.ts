/**
 * Account themes.
 *
 * The chosen theme is a local preference for now: `theme-init.js` applies it
 * before first paint from localStorage (and `?theme=` for previews), and the
 * appearance settings write it back. The <html> attribute is never part of
 * React's tree, so applying it outside React cannot cause hydration errors.
 */

export type ThemeId = 'snow' | 'paper' | 'mist' | 'sage' | 'rose' | 'graphite' | 'night'

export interface ThemeOption {
  id: ThemeId
  labelKey: string
  /** Swatch preview: page background, card surface, accent. */
  preview: { bg: string; surface: string; accent: string; ink: string }
}

export const THEMES: ThemeOption[] = [
  {
    id: 'snow',
    labelKey: 'theme.snow',
    preview: { bg: '#ffffff', surface: '#ffffff', accent: '#c6ff4a', ink: '#0a0a0a' },
  },
  {
    id: 'paper',
    labelKey: 'theme.paper',
    preview: { bg: '#faf6ee', surface: '#fffdf8', accent: '#f59e0b', ink: '#1c1202' },
  },
  {
    id: 'mist',
    labelKey: 'theme.mist',
    preview: { bg: '#f3f6fb', surface: '#ffffff', accent: '#6366f1', ink: '#ffffff' },
  },
  {
    id: 'sage',
    labelKey: 'theme.sage',
    preview: { bg: '#f2f7f1', surface: '#ffffff', accent: '#10b981', ink: '#04231a' },
  },
  {
    id: 'rose',
    labelKey: 'theme.rose',
    preview: { bg: '#fdf4f6', surface: '#ffffff', accent: '#f43f5e', ink: '#ffffff' },
  },
  {
    id: 'graphite',
    labelKey: 'theme.graphite',
    preview: { bg: '#f0f1f3', surface: '#ffffff', accent: '#0d9488', ink: '#ffffff' },
  },
  {
    id: 'night',
    labelKey: 'theme.night',
    preview: { bg: '#0b0c0d', surface: '#151617', accent: '#c6ff4a', ink: '#0a0a0a' },
  },
]

export const THEME_STORAGE_KEY = 'lh_theme'

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && THEMES.some((theme) => theme.id === value)
}

export function getStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return 'snow'
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeId(stored) ? stored : 'snow'
  } catch {
    return 'snow'
  }
}

export function applyTheme(id: ThemeId) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', id)
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id)
  } catch {
    /* storage blocked: the theme still applies for this session */
  }
}
