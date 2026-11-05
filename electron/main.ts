/**
 * Scribble's desktop shell. The app itself is the same web app that runs in a browser; this
 * process only opens its window, serves its files, and does the few things a web page can't
 * (see src/platform/bridge.ts for the full list).
 */
import { app, BrowserWindow, ipcMain, net, protocol, session, type IpcMainInvokeEvent } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC } from '../src/platform/bridge'
import * as google from './google'
import { buildMenu } from './menu'
import { createWindow } from './window'

const APP_ID = 'com.waterloggedporcupine.scribble'

// The app is served from app://scribble rather than file://, so it gets a proper, stable origin:
// its stored writing (IndexedDB) lives under that origin and survives updates.
const SCHEME = 'app'
const HOST = 'scribble'
const DEV_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIR = join(__dirname, '../dist-desktop')

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

// While developing, keep the desktop app's writing apart from the installed app's.
if (!app.isPackaged) app.setPath('userData', `${app.getPath('userData')} (dev)`)

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

function isAppUrl(url: string) {
  try {
    const u = new URL(url)
    if (DEV_URL) return u.origin === new URL(DEV_URL).origin
    return u.protocol === `${SCHEME}:` && u.host === HOST
  } catch {
    return false
  }
}

function serveApp() {
  protocol.handle(SCHEME, async (request) => {
    const { host, pathname } = new URL(request.url)
    // Routes live after the # so every page is index.html; anything else is a built file.
    const file = normalize(join(RENDERER_DIR, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)))
    if (host !== HOST || !file.startsWith(RENDERER_DIR + sep)) return new Response('Not found', { status: 404 })
    try {
      const res = await net.fetch(pathToFileURL(file).toString())
      if (!file.endsWith('.html')) return res
      const headers = new Headers(res.headers)
      headers.set('Content-Security-Policy', CSP)
      return new Response(res.body, { status: res.status, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

/** Only Scribble's own page may call into the shell. */
function fromApp(event: IpcMainInvokeEvent) {
  if (!event.senderFrame || !isAppUrl(event.senderFrame.url)) throw new Error('Not allowed.')
}

function registerIpc() {
  ipcMain.handle(IPC.googleSignIn, async (event) => {
    fromApp(event)
    const token = await google.signIn()
    // You approved in the browser; bring Scribble back to the front.
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    return token
  })
  ipcMain.handle(IPC.googleRefresh, (event) => {
    fromApp(event)
    return google.refresh()
  })
  ipcMain.handle(IPC.googleSignOut, (event) => {
    fromApp(event)
    return google.signOut()
  })
}

// The clipboard is used for importing pasted text; nothing else (camera, location…) is ever granted.
const ALLOWED_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write'])

function lockPermissions() {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission))
}

let mainWindow: BrowserWindow | null = null

function openMainWindow() {
  mainWindow = createWindow({
    url: DEV_URL ?? `${SCHEME}://${HOST}/`,
    preload: join(__dirname, 'preload.cjs'),
    isAppUrl,
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// One Scribble at a time: opening it again brings the existing window forward, so two windows
// never write over each other.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (e) => e.preventDefault())
  })

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID)
    serveApp()
    lockPermissions()
    registerIpc()
    buildMenu()
    openMainWindow()
    app.on('activate', () => {
      if (!mainWindow) openMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
