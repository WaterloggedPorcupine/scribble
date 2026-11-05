import { useLiveQuery } from 'dexie-react-hooks'
import { assemble, liveBranchId, useStoredBranchId, whatIfChanges, type Change } from './branches'
import { db, type NoteKind } from './db'
import { today } from './words'

export function useProjects() {
  return useLiveQuery(async () => {
    const all = await db.projects.toArray()
    return all.filter((p) => !p.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt)
  })
}

export function useProject(id: string | undefined) {
  return useLiveQuery(async () => (id ? db.projects.get(id) : undefined), [id])
}

export type { ChapterWithScenes } from './branches'

/** The binder as it reads in a version: the active one by default, or a what-if id, or null for the Book. */
export function useBinder(projectId: string | undefined, version?: string | null) {
  const stored = useStoredBranchId(projectId)
  const wanted = version === undefined ? stored : version
  return useLiveQuery(async () => {
    if (!projectId) return []
    const nodes = await db.nodes.where('projectId').equals(projectId).toArray()
    return assemble(nodes, await liveBranchId(wanted))
  }, [projectId, wanted])
}

/** The what-if you're writing in, or null for the Book (undefined while loading). */
export function useActiveBranch(projectId: string | undefined) {
  const stored = useStoredBranchId(projectId)
  return useLiveQuery(async () => {
    if (!stored) return null
    const branch = await db.branches.get(stored)
    return branch && !branch.deletedAt ? branch : null
  }, [stored])
}

export function useBranches(projectId: string | undefined) {
  return useLiveQuery(async () => {
    if (!projectId) return []
    const all = await db.branches.where('projectId').equals(projectId).toArray()
    return all.filter((b) => !b.deletedAt).sort((a, b) => a.createdAt - b.createdAt)
  }, [projectId])
}

/** The Book's text of a scene this what-if changed, to star what differs. Null when there's nothing to compare. */
export function useBookContent(sceneKey: string, inWhatIf: boolean, changed: boolean) {
  return useLiveQuery(async () => (inWhatIf && changed ? ((await db.nodes.get(sceneKey))?.content ?? null) : null), [sceneKey, inWhatIf, changed])
}

export function useBranch(id: string | undefined) {
  return useLiveQuery(async () => (id ? db.branches.get(id) : undefined), [id])
}

/** What each what-if does differently from the Book, keyed by what-if id. */
export function useWhatIfChanges(projectId: string | undefined) {
  return useLiveQuery(async () => {
    const map = new Map<string, Change[]>()
    if (!projectId) return map
    const [nodes, branches] = await Promise.all([
      db.nodes.where('projectId').equals(projectId).toArray(),
      db.branches.where('projectId').equals(projectId).toArray(),
    ])
    for (const b of branches) if (!b.deletedAt) map.set(b.id, whatIfChanges(nodes, b.id))
    return map
  }, [projectId])
}

export function useNode(id: string | undefined) {
  return useLiveQuery(async () => (id ? db.nodes.get(id) : undefined), [id])
}

export function useNotes(projectId: string | null | undefined, kind?: NoteKind) {
  return useLiveQuery(async () => {
    if (projectId === undefined) return []
    const all = kind ? await db.notes.where('kind').equals(kind).toArray() : await db.notes.toArray()
    return all
      .filter((n) => !n.deletedAt && n.projectId === projectId)
      .sort((a, b) => (kind === 'character' ? a.createdAt - b.createdAt : b.updatedAt - a.updatedAt))
  }, [projectId, kind])
}

export function useNote(id: string | undefined) {
  return useLiveQuery(async () => (id ? db.notes.get(id) : undefined), [id])
}

export function useNoteCounts(projectId: string | null) {
  return useLiveQuery(async () => {
    const all = await db.notes.toArray()
    const counts: Partial<Record<NoteKind, number>> = {}
    for (const n of all) {
      if (n.deletedAt || n.projectId !== projectId) continue
      if (n.kind === 'todo' && n.done) continue
      counts[n.kind] = (counts[n.kind] ?? 0) + 1
    }
    return counts
  }, [projectId])
}

/** Words per day for a story, summed across devices. Negative days (heavy editing) show as zero. */
export function useDailyWords(projectId: string | undefined) {
  return useLiveQuery(async () => {
    if (!projectId) return new Map<string, number>()
    const rows = await db.days.where('projectId').equals(projectId).toArray()
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.date, (map.get(r.date) ?? 0) + r.words)
    return map
  }, [projectId])
}

export function useWordsToday(projectId: string | undefined) {
  const days = useDailyWords(projectId)
  return Math.max(0, days?.get(today()) ?? 0)
}

export function useSnapshots(nodeId: string | undefined) {
  return useLiveQuery(async () => {
    if (!nodeId) return []
    const rows = await db.snapshots.where('nodeId').equals(nodeId).toArray()
    return rows.sort((a, b) => b.createdAt - a.createdAt)
  }, [nodeId])
}
