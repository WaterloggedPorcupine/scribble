/**
 * The contract between the app and the desktop shell (Electron). The web app runs unchanged in
 * a browser; on desktop the shell adds `window.scribble` with these few abilities and nothing
 * else. Everything new the desktop app can do goes through here, so this file is the whole list.
 */

export const IPC = {
  googleSignIn: 'google:sign-in',
  googleRefresh: 'google:refresh',
  googleSignOut: 'google:sign-out',
} as const

/** drive.file: only files you pick or Scribble creates. drive.appdata: Scribble's hidden sync folder. */
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata']

export interface GoogleToken {
  accessToken: string
  /** Seconds until the access token expires. */
  expiresIn: number
}

export interface DesktopBridge {
  platform: 'desktop'
  /** The operating system: 'win32', 'darwin' or 'linux'. */
  os: string
  google: {
    /** Opens Google in your browser and waits for you to approve. Throws with a readable message if you don't. */
    signIn(): Promise<GoogleToken>
    /** A fresh access token from the saved sign-in, or null if there isn't one (or Google revoked it). */
    refresh(): Promise<GoogleToken | null>
    /** Revokes and forgets the saved sign-in. */
    signOut(): Promise<void>
  }
}
