import { Shuffle } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useStoredBranchId } from '../lib/branches'
import type { ProjectKind } from '../lib/db'
import { exportHtml, exportMarkdown } from '../lib/export'
import { exportManuscriptDocx } from '../lib/export-docx'
import { useActiveBranch, useBinder, useBranches, useDailyWords, useNotes, useProject, useWhatIfChanges } from '../lib/hooks'
import { addChapter, addScene, deleteProject, updateNode, updateProject } from '../lib/repo'
import { revisionOf } from '../lib/revisions'
import { isScript } from '../lib/script'
import { go, href } from '../lib/router'
import { dateKey, fmt, htmlToText, today } from '../lib/words'
import { Topbar } from './Topbar'
import { TextField } from './ui'
import { NewWhatIf, WhatIfBanner } from './WhatIfView'

const DAY = 86_400_000
/** How far each what-if sheet peeks out from behind the one in front of it. */
const STACK_STEP = 22

function parseDay(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function niceDate(s: string) {
  return parseDay(s).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

export function Desk({ projectId }: { projectId: string }) {
  const project = useProject(projectId)
  const binder = useBinder(projectId) ?? []
  const days = useDailyWords(projectId) ?? new Map<string, number>()
  const ideas = useNotes(projectId, 'idea') ?? []
  const characters = useNotes(projectId, 'character') ?? []
  const [seed, setSeed] = useState(() => Math.random())
  const [editGoal, setEditGoal] = useState(false)
  const [creatingWhatIf, setCreatingWhatIf] = useState(false)
  const branches = useBranches(projectId) ?? []
  const changes = useWhatIfChanges(projectId)
  const whatIf = useActiveBranch(projectId)
  const stored = useStoredBranchId(projectId)

  const scenes = binder.flatMap((c) => c.scenes)
  const total = scenes.reduce((s, n) => s + n.wordCount, 0)
  const wordsToday = Math.max(0, days.get(today()) ?? 0)

  // A spark from your own notes, to remind you why this story is worth finishing.
  const sparks = useMemo(() => {
    const pool: { who: string; text: string; color?: string }[] = []
    for (const c of characters) {
      if (c.sampleLines?.trim()) pool.push({ who: c.title, text: c.sampleLines.trim().split('\n')[0], color: c.color })
      else if (c.voice?.trim()) pool.push({ who: c.title, text: c.voice.trim(), color: c.color })
    }
    for (const i of ideas) {
      const body = htmlToText(i.body).trim()
      if (i.title || body) pool.push({ who: i.title || 'An idea', text: body ? body.slice(0, 240) : i.title })
    }
    return pool
  }, [characters, ideas])
  const spark = sparks.length ? sparks[Math.floor(seed * sparks.length) % sparks.length] : null

  if (project === undefined) return null
  if (!project || project.deletedAt)
    return (
      <div className="content">
        <p className="empty">This story isn’t here anymore.</p>
        <p style={{ textAlign: 'center' }}>
          <a className="btn" href={href.shelf()}>
            Back to your stories
          </a>
        </p>
      </div>
    )

  // Pace, phrased gently: what a day looks like from here, never what you "missed".
  const goal = project.wordGoal || 0
  const remaining = Math.max(0, goal - total)
  const todayDate = parseDay(today())
  const start = project.goalStart ? parseDay(project.goalStart) : null
  const end = project.goalEnd ? parseDay(project.goalEnd) : null
  let pace = ''
  if (goal && total >= goal) pace = `You reached ${fmt(goal)} words. That’s a whole draft.`
  else if (start && end && start > todayDate) {
    const span = Math.round((end.getTime() - start.getTime()) / DAY) + 1
    pace = `Starts ${niceDate(project.goalStart!)}. About ${fmt(Math.ceil(goal / span))} words a day gets you there.`
  } else if (end && end >= todayDate) {
    const left = Math.round((end.getTime() - todayDate.getTime()) / DAY) + 1
    pace = `About ${fmt(Math.ceil(remaining / left))} words a day from here gets you to ${fmt(goal)} by ${niceDate(project.goalEnd!)}.`
  } else if (goal) pace = `${fmt(remaining)} words to go. No rush.`
  const pct = goal ? Math.min(100, (total / goal) * 100) : 0

  // The last 30 days of writing, as quiet bars.
  const bars = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(todayDate.getTime() - (29 - i) * DAY)
    const key = dateKey(d)
    return { key, words: Math.max(0, days.get(key) ?? 0) }
  })
  const maxBar = Math.max(500, ...bars.map((b) => b.words))

  // Assignments: scenes you've outlined but not written yet.
  const assignments = scenes.filter((s) => s.synopsis.trim() && s.wordCount < 50).slice(0, 3)
  const lastTouched = [...scenes].filter((s) => s.wordCount > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0]

  const newChapter = async () => {
    await addChapter(projectId)
  }
  const newScene = async (chapterId: string) => {
    await addScene(projectId, chapterId)
  }

  // Your what-ifs lie behind the title sheet, oldest at the back, each in its revision colour.
  const stack = branches.slice(-3)
  const version = whatIf ? `What if: ${whatIf.name}` : 'The Book'

  return (
    <>
      <Topbar crumbs={[{ label: 'Scribble', href: href.shelf() }, { label: project.title }]} />
      <div className="scroll desk-surface">
        <div className="sheet-stack" style={{ paddingTop: stack.length * STACK_STEP, paddingRight: stack.length * STACK_STEP }}>
          {stack.map((b, i) => {
            const d = (stack.length - i) * STACK_STEP
            const rev = revisionOf(b.id, branches)
            return (
              <a
                key={b.id}
                className="stack-sheet"
                href={href.whatif(projectId, b.id)}
                style={{ top: stack.length * STACK_STEP - d, right: stack.length * STACK_STEP - d, bottom: d, left: d, '--rev': rev?.ink } as CSSProperties}
              >
                <span>What if: {b.name}</span>
              </a>
            )
          })}

          <article className="title-sheet">
            <WhatIfBanner projectId={projectId} />

            <header className="title-block">
              <TextField className="ghost-input page-heading" value={project.title} onSave={(title) => updateProject(project.id, { title: title || 'Untitled story' })} aria-label="Story title" />
              <div className="title-sub">
                <select className="ghost-select" value={project.kind} onChange={(e) => updateProject(project.id, { kind: e.target.value as ProjectKind })} aria-label="Kind of story">
                  <option value="novel">A novel</option>
                  <option value="short-story">A short story</option>
                  <option value="screenplay">A screenplay</option>
                  <option value="play">A play</option>
                </select>
                <span>by</span>
                <TextField
                  className="ghost-input author-input"
                  value={project.author ?? ''}
                  onSave={(author) => updateProject(project.id, { author: author.trim() })}
                  placeholder="your name"
                  aria-label="Author"
                />
                <span>
                  · {binder.length} {binder.length === 1 ? 'chapter' : 'chapters'} · {scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'} · {fmt(total)} words
                </span>
              </div>
              <TextField
                multiline
                className="ghost-input premise-input"
                value={project.premise}
                onSave={(premise) => updateProject(project.id, { premise })}
                placeholder="In a sentence or two: what is this story, and why do you want to tell it?"
                aria-label="Why this story"
              />
            </header>

            <div className="sheet-grid">
              <section className="card">
                <div className="card-title">
                  Progress <span className="spacer" />
                  <button className="link-btn" onClick={() => setEditGoal((v) => !v)}>
                    {editGoal ? 'Done' : 'Edit goal'}
                  </button>
                </div>
                <div className="ledger-line">
                  <span className="k">Words</span>
                  <span>{goal ? `${fmt(total)} of ${fmt(goal)}` : fmt(total)}</span>
                </div>
                <div className="ledger-line">
                  <span className="k">Today</span>
                  <span>{fmt(wordsToday)}</span>
                </div>
                {pace && (
                  <div className="ledger-line">
                    <span className="k">Pace</span>
                    <span>{pace}</span>
                  </div>
                )}
                {goal > 0 && (
                  <div className="progress" aria-hidden="true">
                    <div style={{ width: `${pct}%` }} />
                  </div>
                )}
                <div className="bars" aria-label="Words written over the last 30 days">
                  {bars.map((b) => (
                    <div
                      key={b.key}
                      className={b.key === today() ? 'today' : b.words ? '' : 'zero'}
                      style={{ height: `${Math.max(4, (b.words / maxBar) * 100)}%` }}
                      title={`${niceDate(b.key)}: ${fmt(b.words)} words`}
                    />
                  ))}
                </div>
                {editGoal && (
                  <div className="row mt" style={{ alignItems: 'flex-end' }}>
                    <label className="field" style={{ marginBottom: 0 }}>
                      <span className="label">Word goal</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step={500}
                        value={project.wordGoal}
                        onChange={(e) => updateProject(project.id, { wordGoal: Math.max(0, Number(e.target.value) || 0) })}
                        style={{ width: 120 }}
                      />
                    </label>
                    <label className="field" style={{ marginBottom: 0 }}>
                      <span className="label">From</span>
                      <input className="input" type="date" value={project.goalStart ?? ''} onChange={(e) => updateProject(project.id, { goalStart: e.target.value })} />
                    </label>
                    <label className="field" style={{ marginBottom: 0 }}>
                      <span className="label">To</span>
                      <input className="input" type="date" value={project.goalEnd ?? ''} onChange={(e) => updateProject(project.id, { goalEnd: e.target.value })} />
                    </label>
                  </div>
                )}
              </section>

              <section className="card">
                <div className="card-title">What-ifs</div>
                {branches.map((b) => {
                  const n = changes?.get(b.id)?.length ?? 0
                  const rev = revisionOf(b.id, branches)
                  return (
                    <a key={b.id} className="ledger-line" href={href.whatif(projectId, b.id)} style={{ '--rev': rev?.ink } as CSSProperties}>
                      <span>
                        {b.name}
                        {stored === b.id && <span className="whatif-tag">writing here</span>}
                      </span>
                      <span className="k">
                        <span className="rev-chip" aria-hidden="true" />
                        {rev?.name} pages · {n ? `${n} ${n === 1 ? 'change' : 'changes'}` : 'no changes yet'}
                      </span>
                    </a>
                  )
                })}
                {branches.length === 0 && <p className="hint">Wondering whether the story works another way? Try it as a what-if. The Book stays as it is.</p>}
                <button className="link-btn ledger-add-line" onClick={() => setCreatingWhatIf(true)}>
                  + New what-if
                </button>
              </section>
            </div>

            {(assignments.length > 0 || lastTouched) && (
              <section className="card">
                <div className="card-title">Next up</div>
                {lastTouched && (
                  <a className="ledger-line" href={href.scene(projectId, lastTouched.key)}>
                    <span>Pick up where you left off</span>
                    <span className="k">{lastTouched.title} →</span>
                  </a>
                )}
                {assignments.map((s) => (
                  <a key={s.key} className="ledger-line" href={href.scene(projectId, s.key)}>
                    <span>Write: {s.title}</span>
                    <span className="k clip">{s.synopsis}</span>
                  </a>
                ))}
              </section>
            )}

            <section className="card">
              <div className="card-title">
                Outline <span className="spacer" />
                <span className="aside">A line per scene turns ideas into assignments</span>
              </div>
              {binder.map(({ chapter, scenes }) => (
                <div key={chapter.key} className="outline-chapter">
                  <h3>
                    <TextField className="ghost-input" value={chapter.title} onSave={(title) => updateNode(chapter.id, { title })} aria-label="Chapter title" />
                  </h3>
                  {scenes.map((s) => (
                    <div key={s.key} className="outline-scene">
                      <a className="scene-name" href={href.scene(projectId, s.key)}>
                        {s.title}
                      </a>
                      <TextField className="ghost-input" value={s.synopsis} onSave={(synopsis) => updateNode(s.id, { synopsis })} placeholder="What happens here?" aria-label={`What happens in ${s.title}`} />
                      <span className="words-small">{s.wordCount ? fmt(s.wordCount) : ''}</span>
                    </div>
                  ))}
                  <button className="link-btn ledger-add-line" onClick={() => newScene(chapter.key)}>
                    + Scene
                  </button>
                </div>
              ))}
              <button className="link-btn ledger-add-line" onClick={newChapter}>
                + Chapter
              </button>
            </section>

            {spark && (
              <section className="card">
                <div className="card-title">
                  From your notes <span className="spacer" />
                  {sparks.length > 1 && (
                    <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setSeed(Math.random())} aria-label="Show another" title="Show another">
                      <Shuffle size={14} />
                    </button>
                  )}
                </div>
                <div className="spark" style={spark.color ? ({ '--spark': `var(--${spark.color})` } as CSSProperties) : undefined}>
                  <span className="who">{spark.who}</span>
                  {spark.text}
                </div>
              </section>
            )}

            <div className="sheet-actions">
              <button className="link-btn" onClick={() => void exportManuscriptDocx(projectId)} title="Standard format, ready to send to an agent, editor or producer">
                {isScript(project.kind) ? 'Export script (.docx)' : 'Export manuscript (.docx)'}
              </button>
              <button className="link-btn" onClick={() => exportMarkdown(projectId)}>
                Export Markdown
              </button>
              <button className="link-btn" onClick={() => exportHtml(projectId)} title="Opens in Word, Pages or Google Docs">
                Export for Word
              </button>
              <span style={{ flex: 1 }} />
              <button
                className="link-btn danger"
                onClick={async () => {
                  if (confirm(`Delete “${project.title}”? It has ${fmt(total)} words. (A backup from Settings keeps a copy.)`)) {
                    await deleteProject(project.id)
                    go(href.shelf())
                  }
                }}
              >
                Delete story
              </button>
            </div>

            <footer className="title-corners">
              <span>Draft · {version}</span>
              <span>{new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </footer>
          </article>
        </div>
        <DeskLine wordsToday={wordsToday} />
      </div>
      {creatingWhatIf && <NewWhatIf projectId={projectId} onClose={() => setCreatingWhatIf(false)} />}
    </>
  )
}

/** A small human line under the sheet: the time, and what you've done today. */
function DeskLine({ wordsToday }: { wordsToday: number }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return (
    <p className="desk-line">
      It’s {time}. {wordsToday > 0 ? `You’ve written ${fmt(wordsToday)} ${wordsToday === 1 ? 'word' : 'words'} today.` : 'A good time for a sentence or two.'}
    </p>
  )
}
