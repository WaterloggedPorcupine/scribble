import { activeBranchId, assemble, editedFields, liveBranchId, rebase, setActiveBranch, tracked, whatIfChanges, type Placed } from './branches'
import { ACCENTS, db, type BinderNode, type Branch, type Note, type NoteKind, type Project, type ProjectKind, type Snapshot } from './db'
import { isScript } from './script'
import { countWords, dateKey, extractTks, htmlToText, today } from './words'

/** Works on plain-http dev servers too, where crypto.randomUUID is missing. */
export function uid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20)
}

export function deviceId(): string {
  let id = localStorage.getItem('quire.deviceId')
  if (!id) {
    id = uid()
    localStorage.setItem('quire.deviceId', id)
  }
  return id
}

const SNAPSHOT_EVERY_MS = 10 * 60 * 1000
const SNAPSHOTS_KEPT = 40

// ── Projects ────────────────────────────────────────────────────────────────

export async function createProject(input: { title: string; kind: ProjectKind; premise?: string; withStarter?: boolean }) {
  const now = Date.now()
  const project: Project = {
    id: uid(),
    title: input.title.trim() || 'Untitled story',
    kind: input.kind,
    premise: input.premise?.trim() ?? '',
    wordGoal: { novel: 50000, 'short-story': 7500, screenplay: 20000, play: 15000 }[input.kind],
    ...novemberGoal(),
    createdAt: now,
    updatedAt: now,
  }
  await db.projects.add(project)
  let firstScene: BinderNode | undefined
  if (input.withStarter !== false) {
    // Scripts are divided into acts; prose into chapters.
    const chapter = await addChapter(project.id, isScript(input.kind) ? 'Act 1' : 'Chapter 1')
    firstScene = await addScene(project.id, chapter.id, 'Scene 1')
  }
  return { project, firstScene }
}

/** In October or November the goal window is November; otherwise the next 30 days. */
function novemberGoal() {
  const now = new Date()
  if (now.getMonth() === 9 || now.getMonth() === 10) {
    const year = now.getFullYear()
    return { goalStart: `${year}-11-01`, goalEnd: `${year}-11-30` }
  }
  const end = new Date(now)
  end.setDate(end.getDate() + 29)
  return { goalStart: dateKey(now), goalEnd: dateKey(end) }
}

export async function updateProject(id: string, patch: Partial<Project>) {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteProject(id: string) {
  await db.projects.update(id, { deletedAt: Date.now(), updatedAt: Date.now() })
}

// ── Binder ──────────────────────────────────────────────────────────────────
// Everything here works on the version you're writing in. In a what-if, the first change to a
// Book chapter or scene quietly copies it into the what-if; the Book itself never changes.

/** undefined means "whichever version is active for this story". */
type Version = string | null | undefined

async function versionFor(projectId: string, version: Version) {
  return version === undefined ? activeBranchId(projectId) : liveBranchId(version)
}

async function binderFor(projectId: string, branchId: string | null) {
  return assemble(await db.nodes.where('projectId').equals(projectId).toArray(), branchId)
}

/** The row a change should go to: in a what-if, a Book row is copied the first time it changes. */
async function writable(id: string, version?: Version): Promise<BinderNode | undefined> {
  return db.transaction('rw', db.nodes, db.branches, async () => {
    const node = await db.nodes.get(id)
    if (!node || node.branchId) return node
    const branchId = await versionFor(node.projectId, version)
    if (!branchId) return node
    const existing = (await db.nodes.where('projectId').equals(node.projectId).toArray()).find(
      (n) => n.branchId === branchId && n.baseId === node.id && !n.deletedAt,
    )
    if (existing) {
      const patch = rebase(existing, node)
      if (!patch) return existing
      await db.nodes.update(existing.id, patch)
      return { ...existing, ...patch }
    }
    const now = Date.now()
    const copy: BinderNode = { ...node, id: uid(), branchId, baseId: node.id, base: tracked(node), createdAt: now, updatedAt: now }
    await db.nodes.add(copy)
    return copy
  })
}

async function nextOrder(projectId: string, parentKey: string | null, branchId: string | null) {
  const binder = await binderFor(projectId, branchId)
  const siblings = parentKey === null ? binder.map((c) => c.chapter) : (binder.find((c) => c.chapter.key === parentKey)?.scenes ?? [])
  return siblings.reduce((max, n) => Math.max(max, n.order), 0) + 1
}

function blankNode(projectId: string, parentId: string | null, kind: BinderNode['kind'], title: string, branchId: string | null): BinderNode {
  const now = Date.now()
  return {
    id: uid(),
    projectId,
    parentId,
    kind,
    title,
    order: 0,
    synopsis: '',
    content: '',
    wordCount: 0,
    tks: [],
    ...(branchId ? { branchId } : {}),
    createdAt: now,
    updatedAt: now,
  }
}

export async function addChapter(projectId: string, title?: string) {
  const branchId = await activeBranchId(projectId)
  const order = await nextOrder(projectId, null, branchId)
  const node = { ...blankNode(projectId, null, 'chapter', title ?? `Chapter ${order}`, branchId), order }
  await db.nodes.add(node)
  return node
}

/** chapterId is the chapter's key (its Book id, or its own id if it's new in a what-if). */
export async function addScene(projectId: string, chapterId: string, title?: string, content = '', synopsis = '') {
  const branchId = await activeBranchId(projectId)
  const order = await nextOrder(projectId, chapterId, branchId)
  const text = content ? htmlToText(content) : ''
  const node: BinderNode = {
    ...blankNode(projectId, chapterId, 'scene', title ?? `Scene ${order}`, branchId),
    order,
    content,
    synopsis,
    wordCount: countWords(text),
    tks: extractTks(text),
  }
  await db.nodes.add(node)
  return node
}

export async function updateNode(id: string, patch: Partial<BinderNode>, version?: Version) {
  const row = await writable(id, version)
  if (row) await db.nodes.update(row.id, { ...patch, updatedAt: Date.now() })
}

/** In the Book this deletes; in a what-if it cuts the Book's chapter or scene from that version only. */
export async function deleteNode(id: string) {
  const now = Date.now()
  const node = await db.nodes.get(id)
  if (!node) return
  const branchId = node.branchId ?? (await activeBranchId(node.projectId))
  if (branchId && !node.baseId && !node.branchId) {
    const row = await writable(id, branchId)
    if (row) await db.nodes.update(row.id, { cut: true, updatedAt: now })
    return
  }
  if (node.baseId) {
    await db.nodes.update(id, { cut: true, updatedAt: now })
    return
  }
  // Deleting from the Book, or something that only exists in this what-if.
  await db.transaction('rw', db.nodes, async () => {
    await db.nodes.update(id, { deletedAt: now, updatedAt: now })
    if (node.kind === 'chapter') {
      const children = await db.nodes.where('parentId').equals(id).toArray()
      for (const c of children) if (c.branchId === node.branchId) await db.nodes.update(c.id, { deletedAt: now, updatedAt: now })
    }
  })
}

/** Move a chapter or scene up/down among its siblings. Scenes hop into the neighbouring chapter at the edges. */
export async function moveNode(id: string, dir: -1 | 1) {
  const node = await db.nodes.get(id)
  if (!node) return
  const branchId = node.branchId ?? (await activeBranchId(node.projectId))
  const binder = await binderFor(node.projectId, branchId)
  const key = node.baseId ?? node.id
  const chapters = binder.map((c) => c.chapter)
  const siblings = node.kind === 'chapter' ? chapters : (binder.find((c) => c.chapter.key === node.parentId)?.scenes ?? [])
  const i = siblings.findIndex((n) => n.key === key)
  if (i < 0) return
  const me = siblings[i]
  const other = siblings[i + dir]
  if (other) {
    // Equal orders can't be swapped, so step past the neighbour instead.
    const mine = other.order === me.order ? other.order + dir * 0.5 : other.order
    await updateNode(me.id, { order: mine }, branchId)
    if (other.order !== me.order) await updateNode(other.id, { order: me.order }, branchId)
    return
  }
  if (node.kind !== 'scene' || !node.parentId) return
  const ci = chapters.findIndex((c) => c.key === node.parentId)
  const target = chapters[ci + dir]
  if (!target) return
  const targetScenes = binder.find((c) => c.chapter.key === target.key)?.scenes ?? []
  const order =
    dir === 1
      ? Math.min(0, ...targetScenes.map((s) => s.order)) - 1
      : Math.max(0, ...targetScenes.map((s) => s.order)) + 1
  await updateNode(me.id, { parentId: target.key, order }, branchId)
}

/** Save editor output, log the day's words, and take a periodic snapshot. */
export async function saveSceneContent(id: string, html: string, text: string, version?: Version) {
  const node = await writable(id, version)
  if (!node || node.content === html) return
  const wordCount = countWords(text)
  const delta = wordCount - node.wordCount
  const now = Date.now()
  await db.nodes.update(node.id, { content: html, wordCount, tks: extractTks(text), updatedAt: now })
  if (delta !== 0) await logWords(node.projectId, delta)
  await maybeSnapshot({ ...node, content: html, wordCount })
}

async function maybeSnapshot(node: BinderNode) {
  const latest = await db.snapshots.where('nodeId').equals(node.id).reverse().sortBy('createdAt')
  const last = latest[0]
  if (last && Date.now() - last.createdAt < SNAPSHOT_EVERY_MS) return
  if (last && last.content === node.content) return
  await addSnapshot(node, 'auto')
  const stale = latest.slice(SNAPSHOTS_KEPT - 1).map((s) => s.id)
  if (stale.length) await db.snapshots.bulkDelete(stale)
}

export async function addSnapshot(node: BinderNode, reason: Snapshot['reason']) {
  if (!node.content) return
  await db.snapshots.add({
    id: uid(),
    nodeId: node.id,
    projectId: node.projectId,
    content: node.content,
    wordCount: node.wordCount,
    createdAt: Date.now(),
    reason,
  })
}

/** In a what-if, restoring one of the Book's versions restores it into the what-if only. */
export async function restoreSnapshot(snapshotId: string, version?: Version) {
  const snap = await db.snapshots.get(snapshotId)
  if (!snap) return
  const node = await writable(snap.nodeId, version)
  if (!node) return
  await addSnapshot(node, 'restore')
  await db.nodes.update(node.id, {
    content: snap.content,
    wordCount: snap.wordCount,
    tks: extractTks(htmlToText(snap.content)),
    updatedAt: Date.now(),
  })
}

export async function logWords(projectId: string, delta: number) {
  const date = today()
  const device = deviceId()
  const id = `${projectId}:${date}:${device}`
  const existing = await db.days.get(id)
  await db.days.put({
    id,
    projectId,
    date,
    deviceId: device,
    words: (existing?.words ?? 0) + delta,
    updatedAt: Date.now(),
  })
}

// ── Notes ───────────────────────────────────────────────────────────────────

export async function createNote(kind: NoteKind, projectId: string | null, fields: Partial<Note> = {}) {
  const now = Date.now()
  const note: Note = {
    id: uid(),
    projectId,
    kind,
    title: '',
    body: '',
    createdAt: now,
    updatedAt: now,
    ...fields,
  }
  if (kind === 'character' && !note.color) note.color = await nextCharacterColor(projectId)
  await db.notes.add(note)
  return note
}

export async function nextCharacterColor(projectId: string | null) {
  const used = (await db.notes.where('kind').equals('character').toArray())
    .filter((n) => n.projectId === projectId && !n.deletedAt)
    .map((n) => n.color)
  return ACCENTS.find((c) => !used.includes(c)) ?? ACCENTS[used.length % ACCENTS.length]
}

export async function updateNote(id: string, patch: Partial<Note>) {
  await db.notes.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteNote(id: string) {
  await db.notes.update(id, { deletedAt: Date.now(), updatedAt: Date.now() })
}

// ── What-ifs ────────────────────────────────────────────────────────────────

export async function createBranch(projectId: string, name: string, premise = '') {
  const now = Date.now()
  const branch: Branch = { id: uid(), projectId, name: name.trim() || 'Untitled what-if', premise: premise.trim(), createdAt: now, updatedAt: now }
  await db.branches.add(branch)
  return branch
}

export async function updateBranch(id: string, patch: Partial<Branch>) {
  await db.branches.update(id, { ...patch, updatedAt: Date.now() })
}

/** Deletes the what-if and everything written only in it. The Book is untouched. */
export async function deleteBranch(id: string) {
  const branch = await db.branches.get(id)
  if (!branch) return
  const now = Date.now()
  await db.transaction('rw', db.branches, db.nodes, async () => {
    await db.branches.update(id, { deletedAt: now, updatedAt: now })
    const rows = (await db.nodes.where('projectId').equals(branch.projectId).toArray()).filter((n) => n.branchId === id && !n.deletedAt)
    for (const r of rows) await db.nodes.update(r.id, { deletedAt: now, updatedAt: now })
  })
  setActiveBranch(branch.projectId, null)
}

/** A row exactly as it would be in the Book, without its what-if bookkeeping. */
function asBookRow(n: BinderNode | Placed): BinderNode {
  const { branchId: _b, baseId: _i, base: _base, cut: _c, key: _k, change: _ch, ...rest } = n as Placed
  return rest
}

/**
 * Bring one what-if change into the Book. A scene brings its new chapter along if it needs one;
 * a chapter brings everything the what-if did inside it. Whatever the Book had is kept in that
 * scene's earlier versions first.
 */
export async function bringIntoBook(rowId: string) {
  const row = await db.nodes.get(rowId)
  if (!row?.branchId || row.deletedAt) return
  const now = Date.now()
  const live = (await db.nodes.where('projectId').equals(row.projectId).toArray()).filter((n) => !n.deletedAt)
  const inBook = (id?: string | null) => live.find((n) => n.id === id && !n.branchId)
  const inWhatIf = live.filter((n) => n.branchId === row.branchId)
  const retire = (n: BinderNode) => db.nodes.update(n.id, { deletedAt: now, updatedAt: now })

  const settle = async (n: BinderNode) => {
    const base = inBook(n.baseId)
    if (n.cut) {
      if (base) {
        await addSnapshot(base, 'bring-in')
        await retire(base)
        if (base.kind === 'chapter') {
          for (const scene of live.filter((c) => c.parentId === base.id && !c.branchId)) {
            await addSnapshot(scene, 'bring-in')
            await retire(scene)
          }
        }
      }
      await retire(n)
    } else if (n.baseId) {
      if (base) {
        // Only what the what-if changed; anything it left alone keeps the Book's latest.
        const patch: Partial<BinderNode> = { updatedAt: now }
        for (const f of editedFields(n)) (patch as Record<string, unknown>)[f] = n[f]
        if ('content' in patch) {
          patch.wordCount = n.wordCount
          patch.tks = n.tks
          if (base.content !== n.content) await addSnapshot(base, 'bring-in')
        }
        await db.nodes.update(base.id, patch)
      }
      await retire(n)
    } else {
      await db.nodes.put({ ...asBookRow(n), updatedAt: now })
    }
  }

  if (row.kind === 'scene' && row.parentId && !inBook(row.parentId)) {
    const newChapter = inWhatIf.find((n) => n.id === row.parentId)
    if (newChapter) await settle(newChapter)
  }
  await settle(row)
  if (row.kind === 'chapter') {
    const key = row.baseId ?? row.id
    for (const child of inWhatIf.filter((n) => n.kind === 'scene' && n.parentId === key)) {
      if (row.cut) await retire(child)
      else await settle(child)
    }
  }
}

export async function bringAllIntoBook(branchId: string) {
  const branch = await db.branches.get(branchId)
  if (!branch) return
  const changes = whatIfChanges(await db.nodes.where('projectId').equals(branch.projectId).toArray(), branchId)
  for (const c of changes) {
    const row = await db.nodes.get(c.row.id)
    if (row && !row.deletedAt) await bringIntoBook(row.id)
  }
}

/** Throw away one change: the what-if shows the Book's version here again. */
export async function discardChange(rowId: string) {
  const row = await db.nodes.get(rowId)
  if (!row?.branchId) return
  const now = Date.now()
  await db.transaction('rw', db.nodes, async () => {
    await db.nodes.update(row.id, { deletedAt: now, updatedAt: now })
    if (row.kind === 'chapter' && !row.baseId) {
      const children = await db.nodes.where('parentId').equals(row.id).toArray()
      for (const c of children) if (c.branchId === row.branchId) await db.nodes.update(c.id, { deletedAt: now, updatedAt: now })
    }
  })
}

/** Copy a what-if, as it reads, into a story of its own, with this story's notebook. */
export async function whatIfToStory(branchId: string) {
  const branch = await db.branches.get(branchId)
  const project = branch && (await db.projects.get(branch.projectId))
  if (!branch || !project) return
  const now = Date.now()
  const story: Project = { ...project, id: uid(), title: `${project.title}: ${branch.name}`, premise: branch.premise || project.premise, createdAt: now, updatedAt: now }
  const binder = assemble(await db.nodes.where('projectId').equals(project.id).toArray(), branchId)
  const ids = new Map<string, string>()
  const rows: BinderNode[] = []
  for (const { chapter, scenes } of binder) {
    const chapterId = uid()
    ids.set(chapter.key, chapterId)
    rows.push({ ...asBookRow(chapter), id: chapterId, projectId: story.id, createdAt: now, updatedAt: now })
    for (const s of scenes) {
      const sceneId = uid()
      ids.set(s.key, sceneId)
      rows.push({ ...asBookRow(s), id: sceneId, projectId: story.id, parentId: chapterId, createdAt: now, updatedAt: now })
    }
  }
  const notes = (await db.notes.where('projectId').equals(project.id).toArray()).filter((n) => !n.deletedAt)
  await db.transaction('rw', db.projects, db.nodes, db.notes, async () => {
    await db.projects.add(story)
    await db.nodes.bulkAdd(rows)
    await db.notes.bulkAdd(
      notes.map((n) => ({ ...n, id: uid(), projectId: story.id, sceneId: n.sceneId ? ids.get(n.sceneId) : undefined, createdAt: now, updatedAt: now })),
    )
  })
  return story
}
