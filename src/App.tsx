import { useEffect, useState } from 'react'
import { Desk } from './components/Desk'
import { ImportHost, openImport, reopenImportAfterSignIn } from './components/ImportDialog'
import { NotesView } from './components/NotesView'
import { ReadView } from './components/ReadView'
import { SceneRoute } from './components/SceneRoute'
import { SettingsView } from './components/SettingsView'
import { Shelf } from './components/Shelf'
import { Sidebar } from './components/Sidebar'
import { DrawerContext, ToastHost, toast } from './components/ui'
import { WhatIfView } from './components/WhatIfView'
import { AUTH_ERROR_EVENT } from './lib/google/auth'
import { usePrefs } from './lib/prefs'
import { useRoute } from './lib/router'
import { startAutoSync } from './lib/sync'

/** Screens that lie straight on the desk as sheets of their own, rather than inside one big sheet. */
const ON_DESK = new Set(['desk', 'settings', 'scene', 'read'])

const SILENT_AUTH_ERRORS = ['interaction_required', 'login_required', 'consent_required']

export function App({ authError }: { authError?: string }) {
  const route = useRoute()
  const prefs = usePrefs()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Paper, type and writing modes live as attributes on <html> so CSS can do the rest.
  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = prefs.theme
    el.dataset.font = prefs.font
    el.dataset.grain = prefs.grain ? 'on' : 'off'
    el.dataset.focus = prefs.focusMode ? 'on' : 'off'
    el.dataset.typewriter = prefs.typewriter ? 'on' : 'off'
    el.dataset.paragraphs = prefs.paragraphs
    el.style.setProperty('--prose-size', `${prefs.fontSize}px`)
    el.style.setProperty('--measure', String(prefs.measure))
    el.style.setProperty('--prose-leading', String(prefs.leading))
    // Viewport sizes in the CSS divide by --zoom so the zoomed app still fits the window.
    el.style.setProperty('--zoom', String(prefs.zoom))
    el.style.zoom = String(prefs.zoom)
    // The window's edge matches the desk around the sheets.
    const desk = getComputedStyle(el).getPropertyValue('--desk').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', desk)
  }, [prefs])

  useEffect(() => startAutoSync(), [])

  useEffect(() => {
    const onError = (e: Event) => toast((e as CustomEvent<string>).detail)
    window.addEventListener(AUTH_ERROR_EVENT, onError)
    return () => window.removeEventListener(AUTH_ERROR_EVENT, onError)
  }, [])

  useEffect(() => {
    if (authError && !SILENT_AUTH_ERRORS.includes(authError)) {
      toast(authError === 'access_denied' ? 'Google access wasn’t granted.' : `Google sign-in didn’t finish: ${authError}`)
    }
    reopenImportAfterSignIn()
    // The Apple Notes shortcut opens Scribble with ?import=clipboard.
    const params = new URLSearchParams(location.search)
    if (params.get('import') === 'clipboard') {
      history.replaceState(null, '', location.pathname + location.hash)
      openImport({ projectId: null, tab: 'paste', fromClipboard: true })
    }
  }, [authError])

  // Close the phone drawer whenever you go somewhere.
  useEffect(() => setDrawerOpen(false), [route])

  let main
  switch (route.view) {
    case 'shelf':
      main = <Shelf />
      break
    case 'settings':
      main = <SettingsView />
      break
    case 'desk':
      main = <Desk projectId={route.projectId} />
      break
    case 'scene':
      main = <SceneRoute projectId={route.projectId} sceneId={route.sceneId} />
      break
    case 'read':
      main = <ReadView projectId={route.projectId} version={route.version} />
      break
    case 'whatif':
      main = <WhatIfView projectId={route.projectId} branchId={route.branchId} />
      break
    case 'notes':
      main = <NotesView key={`${route.projectId}:${route.kind}`} projectId={route.projectId} kind={route.kind} noteId={route.noteId} />
      break
  }

  return (
    <DrawerContext.Provider value={{ open: drawerOpen, setOpen: setDrawerOpen }}>
      <div className={`frame ${drawerOpen ? 'drawer-open' : ''}`}>
        <aside className="sidebar" aria-label="Navigation">
          <Sidebar route={route} />
        </aside>
        <div className="scrim" onClick={() => setDrawerOpen(false)} />
        <main className={`main ${ON_DESK.has(route.view) ? 'on-desk' : ''}`}>{main}</main>
      </div>
      <ImportHost />
      <ToastHost />
    </DrawerContext.Provider>
  )
}
