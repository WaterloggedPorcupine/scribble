import { useSyncExternalStore } from 'react'
import { db, TRACKED, type BinderNode, type Tracked } from './db'

/**
 * What-ifs are layers over the Book. A what-if row either stands in for a Book row (baseId),
 * cuts one (cut), or is new. Putting a version together means taking the Book and laying
 * the what-if's rows over it.
 */

/** A chapter or scene as it reads in one version. */
export interface Placed extends BinderNode {
  /** The same in every version: the Book row's id, even when a what-if has its own copy. Routes use this. */
  key: string
  /** How this version differs from the Book here, if it does. */
  change?: 'changed' | 'new'
}

export interface ChapterWithScenes {
  chapter: Placed
  scenes: Placed[]
}

const byOrder = (a: BinderNode, b: BinderNode) => a.order - b.order || a.createdAt - b.createdAt

export type Field = (typeof TRACKED)[number]

export function tracked(n: BinderNode): Tracked {
  return { title: n.title, synopsis: n.synopsis, content: n.content, parentId: n.parentId, order: n.order }
}

/** Fields the what-if changed since copying the Book row. */
export function editedFields(row: BinderNode): Field[] {
  return TRACKED.filter((f) => !row.base || row[f] !== row.base[f])
}

/** Of those, the ones that still read differently from the Book. */
export function ownChanges(row: BinderNode, book: BinderNode): Field[] {
  return editedFields(row).filter((f) => row[f] !== book[f])
}

/** The Book row with only the what-if's own edits laid over it, so untouched fields keep following the Book. */
function overlay(book: BinderNode, row: BinderNode): BinderNode {
  const out: BinderNode = { ...row }
  for (const f of TRACKED) if (row.base && row[f] === row.base[f]) (out as Record<Field, unknown>)[f] = book[f]
  if (row.base && row.content === row.base.content) {
    out.wordCount = book.wordCount
    out.tks = book.tks
  }
  return out
}

/**
 * Catch a what-if row up with the Book before it's written to: fields the what-if never changed
 * take the Book's current value. Returns the patch, or null if nothing moved.
 */
export function rebase(row: BinderNode, book: BinderNode): Partial<BinderNode> | null {
  if (!row.base) return null
  const patch: Partial<BinderNode> = {}
  const base: Tracked = { ...row.base }
  let moved = false
  for (const f of TRACKED) {
    if (book[f] === base[f]) continue
    if (row[f] === base[f]) (patch as Record<Field, unknown>)[f] = book[f]
    if (row[f] === base[f] || row[f] === book[f]) {
      ;(base as Record<Field, unknown>)[f] = book[f]
      moved = true
    }
  }
  if (!moved) return null
  if ('content' in patch) {
    patch.wordCount = book.wordCount
    patch.tks = book.tks
  }
  return { ...patch, base }
}

/** The story in reading order, as it reads in a what-if (or the Book, when branchId is null). */
export function assemble(nodes: BinderNode[], branchId: string | null): ChapterWithScenes[] {
  const live = nodes.filter((n) => !n.deletedAt)
  const mine = branchId ? live.filter((n) => n.branchId === branchId) : []
  const overrides = new Map(mine.filter((n) => n.baseId).map((n) => [n.baseId!, n]))
  const placed: Placed[] = []
  for (const book of live) {
    if (book.branchId) continue
    const row = overrides.get(book.id)
    if (!row) placed.push({ ...book, key: book.id })
    else if (!row.cut) placed.push({ ...overlay(book, row), key: book.id, change: ownChanges(row, book).length ? 'changed' : undefined })
  }
  for (const row of mine) if (!row.baseId && !row.cut) placed.push({ ...row, key: row.id, change: 'new' })
  return placed
    .filter((n) => n.kind === 'chapter')
    .sort(byOrder)
    .map((chapter) => ({
      chapter,
      scenes: placed.filter((n) => n.kind === 'scene' && n.parentId === chapter.key).sort(byOrder),
    }))
}

export interface Change {
  kind: 'changed' | 'new' | 'cut'
  /** The what-if's row, as it reads (fields it didn't change follow the Book). */
  row: BinderNode
  /** The Book row it stands in for or cuts. */
  book?: BinderNode
  /** The chapter it sits in, in this version (or in the Book, for cuts). */
  chapterTitle?: string
  /** What the what-if changed, for changed rows. */
  fields: Field[]
  /** Things the Book also edited since the what-if copied it, differently: bringing this in overwrites the Book's edit. */
  bothChanged: Field[]
}

/** Everything a what-if does differently from the Book, in reading order, with cuts last. */
export function whatIfChanges(nodes: BinderNode[], branchId: string): Change[] {
  const version = assemble(nodes, branchId)
  const book = assemble(nodes, null)
  const bookRows = new Map(nodes.filter((n) => !n.branchId && !n.deletedAt).map((n) => [n.id, n]))
  const changes: Change[] = []

  for (const { chapter, scenes } of version) {
    for (const p of [chapter, ...scenes]) {
      if (!p.change) continue
      const own = nodes.find((n) => n.id === p.id)!
      const book = own.baseId ? bookRows.get(own.baseId) : undefined
      const fields = book ? ownChanges(own, book) : []
      changes.push({
        kind: p.change,
        row: p,
        book,
        chapterTitle: p.kind === 'scene' ? chapter.title : undefined,
        fields,
        bothChanged: book && own.base ? fields.filter((f) => book[f] !== own.base![f]) : [],
      })
    }
  }

  const cuts = new Map(nodes.filter((n) => n.branchId === branchId && n.cut && !n.deletedAt && n.baseId).map((n) => [n.baseId!, n]))
  for (const { chapter, scenes } of book) {
    const chapterCut = cuts.get(chapter.id)
    if (chapterCut) {
      changes.push({ kind: 'cut', row: chapterCut, book: chapter, fields: [], bothChanged: [] })
      continue
    }
    for (const s of scenes) {
      const row = cuts.get(s.id)
      if (row) changes.push({ kind: 'cut', row, book: s, chapterTitle: chapter.title, fields: [], bothChanged: [] })
    }
  }
  return changes
}

// ── Which version you're writing in ─────────────────────────────────────────
// Per device, like a checked-out branch: your phone can be in the Book while your laptop is in a what-if.

const listeners = new Set<() => void>()
const storageKey = (projectId: string) => `quire.whatif.${projectId}`

export function storedBranchId(projectId: string): string | null {
  try {
    return localStorage.getItem(storageKey(projectId))
  } catch {
    return null
  }
}

export function setActiveBranch(projectId: string, branchId: string | null) {
  try {
    if (branchId) localStorage.setItem(storageKey(projectId), branchId)
    else localStorage.removeItem(storageKey(projectId))
  } catch {
    // Private windows can refuse storage; you simply stay in the Book.
  }
  listeners.forEach((l) => l())
}

export function useStoredBranchId(projectId: string | undefined | null) {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => (projectId ? storedBranchId(projectId) : null),
  )
}

/** The what-if you're writing in, or null for the Book. Falls back to the Book if the what-if was deleted. */
export async function activeBranchId(projectId: string): Promise<string | null> {
  return liveBranchId(storedBranchId(projectId))
}

export async function liveBranchId(branchId: string | null | undefined): Promise<string | null> {
  if (!branchId) return null
  const branch = await db.branches.get(branchId)
  return branch && !branch.deletedAt ? branch.id : null
}
