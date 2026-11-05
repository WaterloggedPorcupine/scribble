import { Menu, PenLine } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { setActiveBranch, useStoredBranchId, type Placed } from '../lib/branches'
import { useBinder, useBranches, useProject, useWhatIfChanges } from '../lib/hooks'
import { proseBlocks } from '../lib/prose'
import { go, href } from '../lib/router'
import { useRememberedScroll } from '../lib/scroll'
import { fmt } from '../lib/words'
import { useDrawer } from './ui'

const WORDS_PER_MINUTE = 250

function readingTime(words: number) {
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE))
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/**
 * The story the way a reader meets it: no binder, no notes, just chapters in order. Pick any
 * version to read; scenes that differ from the Book are marked in the margin.
 */
export function ReadView({ projectId, version }: { projectId: string; version?: string }) {
  const stored = useStoredBranchId(projectId)
  const branches = useBranches(projectId)
  const project = useProject(projectId)
  const changes = useWhatIfChanges(projectId)
  const drawer = useDrawer()

  // No version in the address means whichever you're writing in.
  const branchId = version === 'book' ? null : (version ?? stored)
  const branch = branches?.find((b) => b.id === branchId) ?? null
  const binder = useBinder(projectId, branch?.id ?? null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Each version keeps its own place, like a bookmark in each copy.
  useRememberedScroll(scrollRef, `read:${projectId}:${branch?.id ?? 'book'}`, !!binder && !!branches && !!project)

  if (!binder || !branches || project === undefined) return null
  if (!project) return <p className="empty">This story isn’t here anymore.</p>

  const scenes = binder.flatMap((c) => c.scenes)
  const words = scenes.reduce((s, n) => s + n.wordCount, 0)
  const cuts = branch ? (changes?.get(branch.id) ?? []).filter((c) => c.kind === 'cut').length : 0
  const differs = scenes.filter((s) => s.change).length

  const edit = (scene: Placed) => {
    setActiveBranch(projectId, branch?.id ?? null)
    go(href.scene(projectId, scene.key))
  }

  return (
    <>
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={() => drawer.setOpen(true)} aria-label="Open binder">
          <Menu size={18} />
        </button>
        <div className="grow topbar-title">Read</div>
        <select
          className="select"
          style={{ width: 'auto', maxWidth: 'calc(55vw / var(--zoom, 1))' }}
          value={branch?.id ?? 'book'}
          onChange={(e) => go(href.read(projectId, e.target.value))}
          aria-label="Version to read"
        >
          <option value="book">The Book</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              What if: {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="scroll paper" ref={scrollRef}>
        <article className="page read-page">
          <header className="read-title">
            <h1>{project.title}</h1>
            {branch && <div className="read-version">What if: {branch.name}</div>}
            <div className="read-meta">
              {fmt(words)} words · about {readingTime(words)} to read
              {branch && (differs || cuts) ? ` · ${differs} ${differs === 1 ? 'scene differs' : 'scenes differ'} from the Book${cuts ? `, ${cuts} cut` : ''}` : ''}
            </div>
          </header>

          {binder.length === 0 && <p className="empty">Nothing written yet.</p>}
          {binder.map(({ chapter, scenes }) => (
            <section key={chapter.key} className="read-chapter">
              <h2 className={chapter.change ? `read-${chapter.change}` : undefined}>{chapter.title}</h2>
              {scenes.map((scene, i) => (
                <ReadScene key={scene.key} scene={scene} first={i === 0} onEdit={() => edit(scene)} />
              ))}
            </section>
          ))}
          <div className="page-end" />
        </article>
      </div>
    </>
  )
}

function ReadScene({ scene, first, onEdit }: { scene: Placed; first: boolean; onEdit: () => void }) {
  const blocks = useMemo(() => proseBlocks(scene.content), [scene.content])
  return (
    <>
      {!first && <div className="read-break" aria-hidden="true">* * *</div>}
      <div className={`read-scene ${scene.change ? `read-${scene.change}` : ''}`}>
        {scene.change && <span className="read-mark">{scene.change === 'new' ? 'New in this what-if' : 'Changed in this what-if'}</span>}
        <button className="icon-btn read-edit" onClick={onEdit} aria-label={`Edit ${scene.title}`} title={`Edit “${scene.title}”`}>
          <PenLine size={14} />
        </button>
        <div className="read-prose">
          {blocks.length === 0 && <p className="hint">{scene.synopsis || `${scene.title} isn’t written yet.`}</p>}
          {blocks.map((b, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
          ))}
        </div>
      </div>
    </>
  )
}
