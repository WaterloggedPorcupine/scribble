import Dexie, { type Table } from 'dexie'

export type ProjectKind = 'novel' | 'short-story' | 'screenplay' | 'play'

export interface Project {
  id: string
  title: string
  kind: ProjectKind
  /** "Why this story" — resurfaced on the desk as a gentle reminder. */
  premise: string
  /** Whose name goes on the title page and the running header. */
  author?: string
  wordGoal: number
  goalStart?: string // YYYY-MM-DD
  goalEnd?: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export type NodeKind = 'chapter' | 'scene'

/** An item in the binder. Chapters group scenes; only scenes hold text. */
export interface BinderNode {
  id: string
  projectId: string
  parentId: string | null
  kind: NodeKind
  title: string
  order: number
  /** One line: what happens here. Unwritten scenes with a synopsis become "assignments". */
  synopsis: string
  content: string // HTML
  wordCount: number
  tks: string[]
  /** Set when this row belongs to a what-if instead of the Book. */
  branchId?: string
  /** In a what-if: the Book chapter or scene this row stands in for. Unset for things new in the what-if. */
  baseId?: string
  /**
   * In a what-if: the Book row's title, outline line, text and place when the what-if copied it.
   * Only fields that differ from this count as the what-if's own changes; the rest keep following the Book.
   */
  base?: Tracked
  /** In a what-if: the Book's chapter or scene is cut from this version. */
  cut?: boolean
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

/** The parts of a chapter or scene a what-if can change. */
export const TRACKED = ['title', 'synopsis', 'content', 'parentId', 'order'] as const
export type Tracked = Pick<BinderNode, (typeof TRACKED)[number]>

/**
 * A what-if: another version of the story. It only keeps the chapters and scenes you change;
 * everything else shows through from the Book, so fixes to the Book reach every what-if.
 */
export interface Branch {
  id: string
  projectId: string
  name: string
  /** "What if…": the question this version is asking. */
  premise: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export type NoteKind = 'character' | 'idea' | 'world' | 'todo' | 'inbox' | 'cutting'

export const ACCENTS = ['blue', 'magenta', 'green', 'orange', 'violet', 'cyan', 'yellow', 'red'] as const
export type Accent = (typeof ACCENTS)[number]

export interface Note {
  id: string
  /** null = the general library, not tied to one story */
  projectId: string | null
  kind: NoteKind
  title: string
  body: string // HTML
  // characters
  color?: Accent
  aliases?: string[]
  role?: string
  voice?: string
  sampleLines?: string
  // to-dos
  done?: boolean
  sceneId?: string
  // imports and cuttings
  source?: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

/** Words written per story, per day, per device (summed across devices for display). */
export interface DayLog {
  id: string // `${projectId}:${date}:${deviceId}`
  projectId: string
  date: string
  deviceId: string
  words: number
  updatedAt: number
}

/** Local-only version history for scenes. */
export interface Snapshot {
  id: string
  nodeId: string
  projectId: string
  content: string
  wordCount: number
  createdAt: number
  reason: 'auto' | 'conflict' | 'restore' | 'bring-in'
}

export interface Meta {
  key: string
  value: unknown
}

class ScribbleDB extends Dexie {
  projects!: Table<Project, string>
  nodes!: Table<BinderNode, string>
  branches!: Table<Branch, string>
  notes!: Table<Note, string>
  days!: Table<DayLog, string>
  snapshots!: Table<Snapshot, string>
  meta!: Table<Meta, string>

  constructor() {
    // Scribble was called Quire; storage keeps the old names so existing writing is still found.
    super('quire')
    this.version(1).stores({
      projects: 'id, updatedAt',
      nodes: 'id, projectId, parentId, updatedAt',
      notes: 'id, projectId, kind, updatedAt',
      days: 'id, projectId, date, updatedAt',
      snapshots: 'id, nodeId, createdAt',
      meta: 'key',
    })
    this.version(2).stores({
      branches: 'id, projectId, updatedAt',
    })
  }
}

export const db = new ScribbleDB()

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}
