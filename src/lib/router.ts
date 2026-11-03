import { useSyncExternalStore } from 'react'
import type { NoteKind } from './db'

export type Route =
  | { view: 'shelf' }
  | { view: 'settings' }
  | { view: 'desk'; projectId: string }
  | { view: 'scene'; projectId: string; sceneId: string }
  | { view: 'read'; projectId: string; version?: string }
  | { view: 'whatif'; projectId: string; branchId: string }
  | { view: 'notes'; projectId: string | null; kind: NoteKind; noteId?: string }

const NOTE_KINDS: NoteKind[] = ['character', 'idea', 'world', 'todo', 'inbox', 'cutting']

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const [a, b, c, d, e] = parts
  if (a === 'settings') return { view: 'settings' }
  if (a === 'library' && NOTE_KINDS.includes(b as NoteKind)) return { view: 'notes', projectId: null, kind: b as NoteKind, noteId: c }
  if (a === 'p' && b) {
    if (c === 's' && d) return { view: 'scene', projectId: b, sceneId: d }
    if (c === 'read') return { view: 'read', projectId: b, version: d }
    if (c === 'w' && d) return { view: 'whatif', projectId: b, branchId: d }
    if (c === 'n' && NOTE_KINDS.includes(d as NoteKind)) return { view: 'notes', projectId: b, kind: d as NoteKind, noteId: e }
    return { view: 'desk', projectId: b }
  }
  return { view: 'shelf' }
}

export const href = {
  shelf: () => '#/',
  settings: () => '#/settings',
  desk: (projectId: string) => `#/p/${projectId}`,
  scene: (projectId: string, sceneId: string) => `#/p/${projectId}/s/${sceneId}`,
  /** version: a what-if id, 'book', or nothing for whichever you're writing in. */
  read: (projectId: string, version?: string) => `#/p/${projectId}/read` + (version ? `/${version}` : ''),
  whatif: (projectId: string, branchId: string) => `#/p/${projectId}/w/${branchId}`,
  notes: (projectId: string | null, kind: NoteKind, noteId?: string) =>
    (projectId ? `#/p/${projectId}/n/${kind}` : `#/library/${kind}`) + (noteId ? `/${noteId}` : ''),
}

export function go(to: string) {
  if (location.hash !== to) location.hash = to
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

let cachedHash = ''
let cachedRoute: Route = { view: 'shelf' }

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => {
    if (location.hash !== cachedHash) {
      cachedHash = location.hash
      cachedRoute = parseHash(cachedHash)
    }
    return cachedRoute
  })
}
