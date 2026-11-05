/**
 * Google sign-in for the desktop app. Google doesn't allow its sign-in page inside an app
 * window, so this opens it in your normal browser and listens on a one-time local address for
 * the answer (the "loopback" flow, with PKCE). The long-lived refresh token is encrypted with
 * the operating system's keychain and never reaches the page; the page only gets short-lived
 * access tokens.
 */
import { app, safeStorage, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { GOOGLE_SCOPES, type GoogleToken } from '../src/platform/bridge'

// Filled in at build time from .env.local (see scripts/build-electron.mjs). Google treats a
// desktop app's client secret as public, so shipping it inside the app is expected.
declare const __GOOGLE_DESKTOP_CLIENT_ID__: string
declare const __GOOGLE_DESKTOP_CLIENT_SECRET__: string
const CLIENT_ID = __GOOGLE_DESKTOP_CLIENT_ID__
const CLIENT_SECRET = __GOOGLE_DESKTOP_CLIENT_SECRET__

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const SIGN_IN_TIMEOUT = 5 * 60_000

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
}

class GoogleError extends Error {
  constructor(readonly code: string) {
    super(`Google said: ${code}`)
  }
}

const tokenFile = () => join(app.getPath('userData'), 'google-signin.bin')

async function saveRefreshToken(token: string) {
  // Without a keychain we don't write it down at all; you'd just sign in again next launch.
  if (!safeStorage.isEncryptionAvailable()) return
  await writeFile(tokenFile(), safeStorage.encryptString(token))
}

async function loadRefreshToken(): Promise<string | null> {
  try {
    return safeStorage.decryptString(await readFile(tokenFile()))
  } catch {
    return null
  }
}

async function forget() {
  await rm(tokenFile(), { force: true })
}

async function post(url: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string }
  if (!res.ok) throw new GoogleError(json.error ?? String(res.status))
  return json as TokenResponse
}

const toToken = (t: TokenResponse): GoogleToken => ({ accessToken: t.access_token, expiresIn: t.expires_in })

const base64url = (b: Buffer) => b.toString('base64url')

let pending: Promise<GoogleToken> | null = null

/** One sign-in at a time; clicking Connect twice joins the one already waiting. */
export function signIn(): Promise<GoogleToken> {
  pending ??= runSignIn().finally(() => {
    pending = null
  })
  return pending
}

async function runSignIn(): Promise<GoogleToken> {
  if (!CLIENT_ID) throw new Error('Google isn’t set up for the desktop app yet.')
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    let redirectUri = ''
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', redirectUri)
      if (url.pathname !== '/') {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const ok = !error && code && url.searchParams.get('state') === state
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(page(ok ? 'You’re connected. You can close this tab and go back to Scribble.' : 'Sign-in didn’t finish. You can close this tab and try again in Scribble.'), () =>
        ok ? finish(null, code) : finish(new Error(error === 'access_denied' ? 'Google access wasn’t granted.' : `Google sign-in didn’t finish${error ? `: ${error}` : '.'}`)),
      )
    })
    const timer = setTimeout(() => finish(new Error('Google sign-in timed out. Try again.')), SIGN_IN_TIMEOUT)
    function finish(err: Error | null, code?: string) {
      clearTimeout(timer)
      server.close()
      server.closeAllConnections()
      if (err) reject(err)
      else resolve({ code: code!, redirectUri })
    }
    server.on('error', (err) => finish(err))
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GOOGLE_SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        // Ask for a refresh token so you stay connected between launches.
        access_type: 'offline',
        prompt: 'consent',
      })
      void shell.openExternal(`${AUTH_URL}?${params}`)
    })
  })

  const tokens = await post(TOKEN_URL, {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })
  if (tokens.refresh_token) await saveRefreshToken(tokens.refresh_token)
  return toToken(tokens)
}

export async function refresh(): Promise<GoogleToken | null> {
  const refreshToken = await loadRefreshToken()
  if (!refreshToken || !CLIENT_ID) return null
  try {
    return toToken(await post(TOKEN_URL, { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }))
  } catch (err) {
    // Revoked or expired for good: forget it so the app asks you to reconnect. Anything else
    // (offline, Google hiccup) keeps it for next time.
    if (err instanceof GoogleError && err.code === 'invalid_grant') await forget()
    return null
  }
}

export async function signOut() {
  const refreshToken = await loadRefreshToken()
  await forget()
  if (refreshToken) await post(REVOKE_URL, { token: refreshToken }).catch(() => undefined)
}

function page(message: string) {
  return `<!doctype html><meta charset="utf-8"><title>Scribble</title>
<body style="font:15px system-ui,sans-serif;background:#e6e6e3;color:#111;display:grid;place-items:center;height:100vh;margin:0">
<p>${message}</p></body>`
}
