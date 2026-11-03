import { useSyncExternalStore } from 'react'
import type { Table } from 'dexie'
import { db, getMeta, setMeta, type BinderNode, type Branch, type DayLog, type Note, type Project } from './db'
import { AuthError, googleConfigured, getToken, wasConnected } from './google/auth'
import { createAppFile, findAppFile, readAppFile, updateAppFile } from './google/drive'
import { addSnapshot } from './repo'

/**
 * Sync keeps one JSON file in your Google Drive's hidden app folder.
 * Every record carries updatedAt; the newer copy wins. If a scene was changed on
 * both devices since the last sync, the losing version is kept in that scene's
 * history (marked "from a sync conflict"), so words are never silently lost.
 */

const FILE_NAME = 'quire-sync.json'

export interface Payload {
  app: 'quire'
  version: 1
  exportedAt: number
  projects: Project[]
  nodes: BinderNode[]
  /** Missing from backups made before what-ifs existed. */
  branches?: Branch[]
  notes: Note[]
  days: DayLog[]
}

export type SyncStatus =
  | { state: 'off' }
  | { state: 'idle'; lastSyncedAt?: number }
  | { state: 'syncing'; lastSyncedAt?: number }
  | { state: 'needs-auth'; lastSyncedAt?: number }
  | { state: 'offline'; lastSyncedAt?: number }
  | { state: 'error'; message: string; lastSyncedAt?: number }

let status: SyncStatus = { state: 'off' }
const listeners = new Set<() => void>()

function setStatus(next: SyncStatus) {
  status = next
  listeners.forEach((l) => l())
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => status,
  )
}

export async function collectLocal(): Promise<Payload> {
  const [projects, nodes, branches, notes, days] = await Promise.all([
    db.projects.toArray(),
    db.nodes.toArray(),
    db.branches.toArray(),
    db.notes.toArray(),
    db.days.toArray(),
  ])
  return { app: 'quire', version: 1, exportedAt: Date.now(), projects, nodes, branches, notes, days }
}

/** Merge incoming records into the local database. Returns true if local has anything newer. */
export async function mergePayload(incoming: Payload, lastSyncAt: number): Promise<boolean> {
  let localIsNewer = false
  await db.transaction('rw', [db.projects, db.nodes, db.branches, db.notes, db.days, db.snapshots], async () => {
    const merge = async <T extends { id: string; updatedAt: number }>(
      table: Table<T, string>,
      rows: T[],
      onOverwrite?: (local: T, remote: T) => Promise<void>,
    ) => {
      const local = new Map((await table.toArray()).map((r) => [r.id, r]))
      const incomingIds = new Set<string>()
      const toPut: T[] = []
      for (const remote of rows ?? []) {
        incomingIds.add(remote.id)
        const mine = local.get(remote.id)
        if (!mine || remote.updatedAt > mine.updatedAt) {
          if (mine && onOverwrite) await onOverwrite(mine, remote)
          toPut.push(remote)
        } else if (mine.updatedAt > remote.updatedAt) {
          localIsNewer = true
        }
      }
      for (const id of local.keys()) if (!incomingIds.has(id)) localIsNewer = true
      if (toPut.length) await table.bulkPut(toPut)
    }

    await merge<Project>(db.projects, incoming.projects)
    await merge<BinderNode>(db.nodes, incoming.nodes, async (mine, remote) => {
      const editedHereSinceSync = mine.updatedAt > lastSyncAt
      if (mine.kind === 'scene' && editedHereSinceSync && mine.content && mine.content !== remote.content) {
        await addSnapshot(mine, 'conflict')
      }
    })
    await merge<Branch>(db.branches, incoming.branches ?? [])
    await merge<Note>(db.notes, incoming.notes)
    await merge<DayLog>(db.days, incoming.days)
  })
  return localIsNewer
}

async function hasLocalChangesSince(ts: number) {
  const counts = await Promise.all([
    db.projects.where('updatedAt').above(ts).count(),
    db.nodes.where('updatedAt').above(ts).count(),
    db.branches.where('updatedAt').above(ts).count(),
    db.notes.where('updatedAt').above(ts).count(),
    db.days.where('updatedAt').above(ts).count(),
  ])
  return counts.some((c) => c > 0)
}

let running: Promise<void> | null = null

export function syncNow(): Promise<void> {
  running ??= runSync().finally(() => {
    running = null
  })
  return running
}

async function runSync() {
  const lastSyncedAt = await getMeta<number>('lastSyncAt')
  if (!googleConfigured || !wasConnected()) return setStatus({ state: 'off' })
  if (!navigator.onLine) return setStatus({ state: 'offline', lastSyncedAt })
  if (!getToken()) return setStatus({ state: 'needs-auth', lastSyncedAt })

  setStatus({ state: 'syncing', lastSyncedAt })
  const startedAt = Date.now()
  try {
    const since = lastSyncedAt ?? 0
    const knownRemote = await getMeta<string>('remoteModifiedTime')
    const remoteFile = await findAppFile(FILE_NAME)
    let mustUpload = !remoteFile || (await hasLocalChangesSince(since))

    if (remoteFile && remoteFile.modifiedTime !== knownRemote) {
      const remote = await readAppFile<Payload>(remoteFile.id)
      if (await mergePayload(remote, since)) mustUpload = true
    }

    let modifiedTime = remoteFile?.modifiedTime
    if (mustUpload) {
      const payload = await collectLocal()
      const saved = remoteFile ? await updateAppFile(remoteFile.id, payload) : await createAppFile(FILE_NAME, payload)
      modifiedTime = saved.modifiedTime
    }
    await setMeta('remoteModifiedTime', modifiedTime)
    await setMeta('lastSyncAt', startedAt)
    setStatus({ state: 'idle', lastSyncedAt: startedAt })
  } catch (err) {
    if (err instanceof AuthError) setStatus({ state: 'needs-auth', lastSyncedAt })
    else if (!navigator.onLine) setStatus({ state: 'offline', lastSyncedAt })
    else setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err), lastSyncedAt })
  }
}

/** Sync on launch, every 90 seconds while open, when you come back to the app, and when you leave it. */
export function startAutoSync() {
  void syncNow()
  const tick = () => {
    if (document.visibilityState === 'visible') void syncNow()
  }
  const interval = window.setInterval(tick, 90_000)
  const onVisibility = () => void syncNow()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onVisibility)
  return () => {
    window.clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onVisibility)
  }
}
