/**
 * Runs in the page before the app, with just enough Electron to hand over `window.scribble`.
 * The page itself never touches Node or Electron directly.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type DesktopBridge, type GoogleToken } from '../src/platform/bridge'

// Electron wraps errors from the main process as "Error invoking remote method '…': Error: …".
// Unwrap them so the app can show the real message.
async function call<T>(channel: string): Promise<T> {
  try {
    return await ipcRenderer.invoke(channel)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  }
}

const bridge: DesktopBridge = {
  platform: 'desktop',
  os: process.platform,
  google: {
    signIn: () => call<GoogleToken>(IPC.googleSignIn),
    refresh: () => call<GoogleToken | null>(IPC.googleRefresh),
    signOut: () => call<void>(IPC.googleSignOut),
  },
}

contextBridge.exposeInMainWorld('scribble', bridge)
