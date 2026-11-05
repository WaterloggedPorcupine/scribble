import { useSyncExternalStore } from 'react'

/** Per-device preferences (your phone can be dark while your laptop is light). Not synced. */
export interface Prefs {
  theme: 'paper-white' | 'solarized-light' | 'solarized-dark' | 'parchment' | 'typewriter'
  font: 'literata' | 'crimson' | 'garamond' | 'courier'
  fontSize: number // px
  measure: number // characters per line
  leading: number
  paragraphs: 'spaced' | 'indented'
  grain: boolean
  focusMode: boolean
  typewriter: boolean
  highlightCharacters: boolean
  spellcheck: boolean
  rightPanel: boolean
  autoReconnect: boolean
  zoom: number // 1 = 100%, the whole app
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'paper-white',
  font: 'literata',
  fontSize: 19,
  measure: 66,
  leading: 1.75,
  paragraphs: 'spaced',
  grain: true,
  focusMode: false,
  typewriter: false,
  highlightCharacters: true,
  spellcheck: false,
  rightPanel: true,
  autoReconnect: true,
  zoom: 1,
}

const KEY = 'quire.prefs'
const listeners = new Set<() => void>()

function read(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT_PREFS
  }
}

let current = read()

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // storage blocked: keep prefs for this session only
  }
  listeners.forEach((l) => l())
}

export function getPrefs() {
  return current
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}

export const THEMES: { id: Prefs['theme']; label: string; paper: string; ink: string; accent: string }[] = [
  { id: 'paper-white', label: 'Paper white', paper: '#ffffff', ink: '#222220', accent: '#2f6db3' },
  { id: 'solarized-light', label: 'Solarized light', paper: '#fdf6e3', ink: '#586e75', accent: '#268bd2' },
  { id: 'parchment', label: 'Parchment', paper: '#f5ecd9', ink: '#4a3f35', accent: '#a0522d' },
  { id: 'typewriter', label: 'Typewriter', paper: '#fbfbf7', ink: '#2b2b2b', accent: '#b03a2e' },
  { id: 'solarized-dark', label: 'Solarized dark', paper: '#002b36', ink: '#93a1a1', accent: '#268bd2' },
]

export const FONTS: { id: Prefs['font']; label: string; family: string }[] = [
  { id: 'literata', label: 'Literata', family: "'Literata', Georgia, serif" },
  { id: 'crimson', label: 'Crimson Pro', family: "'Crimson Pro', Georgia, serif" },
  { id: 'garamond', label: 'EB Garamond', family: "'EB Garamond', Georgia, serif" },
  { id: 'courier', label: 'Courier Prime', family: "'Courier Prime', 'Courier New', monospace" },
]

/** Zoom steps for the magnifying glass. */
export const ZOOMS = [0.75, 0.85, 1, 1.1, 1.25, 1.4, 1.6]
