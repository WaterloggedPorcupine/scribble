import { AuthError, clearToken, ensureToken } from './auth'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export const MIME = {
  gdoc: 'application/vnd.google-apps.document',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await ensureToken()
  if (!token) throw new AuthError()
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  if (res.status === 401) {
    clearToken()
    throw new AuthError()
  }
  if (!res.ok) throw new Error(`Google Drive said ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res
}

export async function getDriveUser(): Promise<{ displayName: string; emailAddress: string }> {
  const res = await call(`${API}/about?fields=user(displayName,emailAddress)`)
  return (await res.json()).user
}

// ── Import ──────────────────────────────────────────────────────────────────

/** Google Docs are exported as .docx so headings, bold and italics survive the trip. */
export async function fetchDocxFromGoogleDoc(fileId: string): Promise<ArrayBuffer> {
  const res = await call(`${API}/files/${fileId}/export?mimeType=${encodeURIComponent(MIME.docx)}`)
  return res.arrayBuffer()
}

export async function fetchFileBytes(fileId: string): Promise<ArrayBuffer> {
  const res = await call(`${API}/files/${fileId}?alt=media`)
  return res.arrayBuffer()
}

export async function fetchFileText(fileId: string): Promise<string> {
  const res = await call(`${API}/files/${fileId}?alt=media`)
  return res.text()
}

// ── Sync file in the hidden appDataFolder ───────────────────────────────────

export interface DriveFileMeta {
  id: string
  modifiedTime: string
}

export async function findAppFile(name: string): Promise<DriveFileMeta | null> {
  const q = encodeURIComponent(`name = '${name}' and trashed = false`)
  const res = await call(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`)
  const files = (await res.json()).files as DriveFileMeta[]
  return files[0] ?? null
}

export async function readAppFile<T>(id: string): Promise<T> {
  const res = await call(`${API}/files/${id}?alt=media`)
  return res.json()
}

export async function createAppFile(name: string, data: unknown): Promise<DriveFileMeta> {
  const boundary = 'quire' + Math.random().toString(36).slice(2)
  const metadata = { name, parents: ['appDataFolder'], mimeType: 'application/json' }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`
  const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return res.json()
}

export async function updateAppFile(id: string, data: unknown): Promise<DriveFileMeta> {
  const res = await call(`${UPLOAD}/files/${id}?uploadType=media&fields=id,modifiedTime`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}
