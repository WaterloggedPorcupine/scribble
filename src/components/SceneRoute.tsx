import { SceneEditor } from '../editor/SceneEditor'
import { useActiveBranch, useBinder, useNotes, useProject, useWordsToday } from '../lib/hooks'
import { href } from '../lib/router'
import { usePrefs } from '../lib/prefs'
import { wordsPerPage } from '../lib/script'
import { isPlaceholderChapterTitle, numberWord } from '../lib/words'

/** sceneId is the scene's key, so the same address opens it in the Book or in any what-if. */
export function SceneRoute({ projectId, sceneId }: { projectId: string; sceneId: string }) {
  const project = useProject(projectId)
  const whatIf = useActiveBranch(projectId)
  const binder = useBinder(projectId)
  const characters = useNotes(projectId, 'character')
  const wordsToday = useWordsToday(projectId)
  const { smartPunctuation } = usePrefs()

  if (project === undefined || whatIf === undefined || binder === undefined || characters === undefined) return null
  const scene = binder.flatMap((c) => c.scenes).find((s) => s.key === sceneId)
  if (!scene || !project)
    return (
      <div className="content">
        <p className="empty">{whatIf ? `This scene isn’t in “${whatIf.name}”.` : 'This scene isn’t here anymore.'}</p>
        <p style={{ textAlign: 'center' }}>
          <a className="btn" href={href.desk(projectId)}>
            Back to the desk
          </a>
        </p>
      </div>
    )

  const ordered = binder.flatMap((c) => c.scenes)
  const i = ordered.findIndex((s) => s.key === scene.key)
  const totalWords = ordered.reduce((s, n) => s + n.wordCount, 0)
  const wordsBefore = ordered.slice(0, Math.max(0, i)).reduce((s, n) => s + n.wordCount, 0)
  const chapterIndex = binder.findIndex((c) => c.chapter.key === scene.parentId)
  const chapter = binder[chapterIndex]?.chapter
  // A novel's chapter opens lower on the page under its number; a short story opens with its title.
  const firstInChapter = binder[chapterIndex]?.scenes[0]?.key === scene.key
  const opening =
    project.kind === 'novel' && chapter && firstInChapter
      ? { label: `Chapter ${numberWord(chapterIndex + 1)}`, title: isPlaceholderChapterTitle(chapter.title) ? '' : chapter.title }
      : project.kind === 'short-story' && i === 0
        ? { label: '', title: project.title }
        : null

  return (
    <SceneEditor
      // A fresh editor per version, so switching never carries unsaved text across.
      key={`${whatIf?.id ?? 'book'}:${scene.key}:${smartPunctuation ? 'smart' : 'plain'}:${project.kind}`}
      scene={scene}
      whatIf={whatIf}
      chapter={chapter}
      opening={opening}
      project={project}
      characters={characters}
      totalWords={totalWords}
      pageStart={Math.floor(wordsBefore / wordsPerPage(project.kind)) + 1}
      wordsToday={wordsToday}
      prev={i > 0 ? ordered[i - 1] : undefined}
      next={i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : undefined}
    />
  )
}
