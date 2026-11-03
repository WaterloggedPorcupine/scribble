/**
 * Google sign-in using the redirect-based OAuth flow for browser apps.
 * Redirects (not popups) so it also works when Scribble runs as a home-screen app on iPhone.
 * Tokens last about an hour; after that we bounce through Google again, which is
 * instant when you're already signed in.
 */

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || ''
export const GOOGLE_API_KEY = (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined) || ''
export const GOOGLE_APP_ID = (import.meta.env.VITE_GOOGLE_APP_ID as string | undefined) || ''

export const googleConfigured = Boolean(GOOGLE_CLIENT_ID)
export const pickerConfigured = googleConfigured && Boolean(GOOGLE_API_KEY && GOOGLE_APP_ID)

/** drive.file: only files you pick or Scribble creates. drive.appdata: Scribble's hidden sync folder. */
const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata']

const TOKEN_KEY = 'quire.google.token'
const STATE_KEY = 'quire.google.state'
const RETURN_KEY = 'quire.google.return'
const CONNECTED_KEY = 'quire.google.connected'
const SILENT_TRIED_KEY = 'quire.google.silentTried'

interface StoredToken {
  token: string
  expiresAt: number
}

export class AuthError extends Error {
  constructor() {
    super('Google sign-in needed')
  }
}

function redirectUri() {
  return window.location.origin + '/'
}

export function beginSignIn(opts: { silent?: boolean; returnTo?: string } = {}) {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  localStorage.setItem(STATE_KEY, state)
  localStorage.setItem(RETURN_KEY, opts.returnTo ?? (location.hash || '#/'))
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
  })
  if (opts.silent) params.set('prompt', 'none')
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

/** Call once at startup, before the router reads the hash. */
export function consumeRedirect(): { ok: boolean; error?: string } | null {
  const hash = location.hash
  if (!/[#&](access_token|error)=/.test(hash)) return null
  const params = new URLSearchParams(hash.slice(1))
  const expected = localStorage.getItem(STATE_KEY)
  const returnTo = localStorage.getItem(RETURN_KEY) || '#/'
  localStorage.removeItem(STATE_KEY)
  localStorage.removeItem(RETURN_KEY)
  history.replaceState(null, '', location.pathname + location.search + returnTo)

  if (!expected || params.get('state') !== expected) return { ok: false, error: 'The sign-in response did not match. Try again.' }
  const error = params.get('error')
  if (error) return { ok: false, error }
  const token = params.get('access_token')
  if (!token) return { ok: false, error: 'No token returned.' }
  const expiresIn = Number(params.get('expires_in') || '3600')
  const stored: StoredToken = { token, expiresAt: Date.now() + (expiresIn - 60) * 1000 }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(stored))
  localStorage.setItem(CONNECTED_KEY, '1')
  sessionStorage.removeItem(SILENT_TRIED_KEY)
  return { ok: true }
}

export function getToken(): string | null {
  try {
    const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as StoredToken | null
    if (stored && stored.expiresAt > Date.now()) return stored.token
  } catch {
    // fall through
  }
  return null
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function wasConnected() {
  return localStorage.getItem(CONNECTED_KEY) === '1'
}

/**
 * If you've connected before and the token has expired, quietly renew it once per app launch.
 * Skipped when offline so a home-screen app never redirects into an error page.
 */
export function maybeSilentRenew(enabled: boolean): boolean {
  if (!enabled || !googleConfigured || !wasConnected() || getToken() || !navigator.onLine) return false
  if (sessionStorage.getItem(SILENT_TRIED_KEY)) return false
  sessionStorage.setItem(SILENT_TRIED_KEY, '1')
  beginSignIn({ silent: true })
  return true
}

export async function disconnect() {
  const token = getToken()
  clearToken()
  localStorage.removeItem(CONNECTED_KEY)
  if (token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => undefined)
  }
}
