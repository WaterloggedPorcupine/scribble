/**
 * The Scribble window: remembers its size and place, keeps the page locked to Scribble itself,
 * and gives the writing area a right-click menu with spelling suggestions.
 */
import { app, BrowserWindow, Menu, screen, shell, type MenuItemConstructorOptions, type Rectangle, type WebContents } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface WindowState {
  bounds: Partial<Rectangle>
  maximized: boolean
}

const DEFAULT_STATE: WindowState = { bounds: { width: 1280, height: 860 }, maximized: false }
const stateFile = () => join(app.getPath('userData'), 'window-state.json')

function loadState(): WindowState {
  try {
    const state = JSON.parse(readFileSync(stateFile(), 'utf8')) as WindowState
    // A monitor that's since been unplugged would leave the window off-screen; start fresh then.
    const { x, y, width, height } = state.bounds
    if (x !== undefined && y !== undefined && width && height) {
      const area = screen.getDisplayMatching({ x, y, width, height }).workArea
      const visible = x < area.x + area.width - 80 && x + width > area.x + 80 && y >= area.y - 20 && y < area.y + area.height - 80
      if (!visible) return { ...state, bounds: { width, height } }
    }
    return state
  } catch {
    return DEFAULT_STATE
  }
}

function trackState(win: BrowserWindow) {
  let timer: NodeJS.Timeout | undefined
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (win.isDestroyed()) return
      const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() }
      try {
        writeFileSync(stateFile(), JSON.stringify(state))
      } catch {
        // not worth bothering you about
      }
    }, 400)
  }
  for (const event of ['resize', 'move', 'maximize', 'unmaximize'] as const) win.on(event as 'resize', save)
}

/** Only web links leave the app, and they open in your browser. */
export function openOutside(url: string) {
  if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
}

function lockDown(contents: WebContents, isAppUrl: (url: string) => boolean) {
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openOutside(url)
  })
}

function attachContextMenu(win: BrowserWindow) {
  const contents = win.webContents
  contents.on('context-menu', (_event, params) => {
    const items: MenuItemConstructorOptions[] = []
    if (params.misspelledWord) {
      for (const word of params.dictionarySuggestions.slice(0, 6)) {
        items.push({ label: word, click: () => contents.replaceMisspelling(word) })
      }
      if (params.dictionarySuggestions.length === 0) items.push({ label: 'No suggestions', enabled: false })
      items.push({ type: 'separator' }, { label: 'Add to dictionary', click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }, { type: 'separator' })
    }
    if (params.isEditable) {
      items.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' },
      )
    } else if (params.selectionText.trim()) {
      items.push({ role: 'copy' })
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
  })
}

export function createWindow(opts: { url: string; preload: string; isAppUrl: (url: string) => boolean }) {
  const state = loadState()
  const win = new BrowserWindow({
    ...state.bounds,
    minWidth: 380,
    minHeight: 480,
    show: false,
    title: 'Scribble',
    backgroundColor: '#e6e6e3',
    // The menu stays one Alt press away on Windows and Linux; writing gets the space.
    autoHideMenuBar: true,
    webPreferences: {
      preload: opts.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  })
  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())
  trackState(win)
  lockDown(win.webContents, opts.isAppUrl)
  attachContextMenu(win)
  void win.loadURL(opts.url)
  return win
}
