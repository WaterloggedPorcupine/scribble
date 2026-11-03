import { db } from '../db'
import { addChapter, addScene, createNote, createProject } from '../repo'
import type { ImportedDoc } from './convert'
import { splitStory } from './split'

export type Destination =
  | { kind: 'inbox'; projectId: string | null }
  | { kind: 'new-story' }
  | { kind: 'into-story'; projectId: string }

/** Returns where to navigate afterwards (project id), if anywhere. */
export async function applyImport(docs: ImportedDoc[], dest: Destination, splitIntoParts: boolean): Promise<string | null> {
  if (dest.kind === 'inbox') {
    for (const d of docs) await createNote('inbox', dest.projectId, { title: d.title, body: d.html, source: d.source })
    return dest.projectId
  }

  let projectId: string
  if (dest.kind === 'new-story') {
    const words = docs.reduce((sum, d) => sum + d.words, 0)
    const { project } = await createProject({
      title: docs.length === 1 ? docs[0].title : 'Imported stories',
      kind: words > 20000 ? 'novel' : 'short-story',
      withStarter: false,
    })
    projectId = project.id
  } else {
    projectId = dest.projectId
  }

  for (const d of docs) {
    for (const ch of splitStory(d.html, d.title, splitIntoParts)) {
      const chapter = await addChapter(projectId, ch.title)
      for (const sc of ch.scenes) await addScene(projectId, chapter.id, sc.title, sc.html)
    }
  }
  await db.projects.update(projectId, { updatedAt: Date.now() })
  return projectId
}
