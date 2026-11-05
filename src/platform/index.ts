import type { DesktopBridge } from './bridge'

declare global {
  interface Window {
    /** Present only inside the desktop app. */
    scribble?: DesktopBridge
  }
}

/** The desktop shell's abilities, or null in a browser or on a phone. */
export const desktop: DesktopBridge | null = window.scribble ?? null

export const isDesktop = desktop !== null
