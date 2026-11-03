import { ArrowRight, FileDown, Menu, Plus, Shuffle, Trash2 } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import type { ProjectKind } from '../lib/db'
import { exportHtml, exportMarkdown } from '../lib/export'
import { useBinder, useDailyWords, useNotes, useProject } from '../lib/hooks'
import { addChapter, addScene, deleteProject, updateNode, updateProject } from '../lib/repo'
import { go, href } from '../lib/router'
import { dateKey, fmt, htmlToText, today } from '../lib/words'
import { SyncPill } from './SyncPill'
import { TextField, useDrawer } from './ui'
import { WhatIfBanner, WhatIfCard } from './WhatIfView'

const DAY = 86_400_000

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
  const drawer = useDrawer()
  const [seed, setSeed] = useState(() => Math.random())
  const [editGoal, setEditGoal] = useState(false)

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

  return (
    <>
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={() => drawer.setOpen(true)} aria-label="Open binder">
          <Menu size={18} />
        </button>
        <div className="grow topbar-title">Desk</div>
        <SyncPill />
      </div>
      <div className="scroll paper">
        <div className="content">
          <WhatIfBanner projectId={projectId} />
          <TextField className="ghost-input page-heading" value={project.title} onSave={(title) => updateProject(project.id, { title: title || 'Untitled story' })} aria-label="Story title" />
          <div className="row page-sub">
            <select
              className="select"
              style={{ width: 'auto', padding: '4px 8px' }}
              value={project.kind}
              onChange={(e) => updateProject(project.id, { kind: e.target.value as ProjectKind })}
              aria-label="Kind of story"
            >
              <option value="novel">Novel</option>
              <option value="short-story">Short story</option>
              <option value="play">Play (formatting coming later)</option>
            </select>
            <span>
              {binder.length} {binder.length === 1 ? 'chapter' : 'chapters'} · {scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'}
            </span>
          </div>

          <div className="card">
            <div className="card-title">Why this story</div>
            <TextField
              multiline
              className="ghost-input why-input"
              value={project.premise}
              onSave={(premise) => updateProject(project.id, { premise })}
              placeholder="In a sentence or two: what is this story, and why do you want to tell it?"
            />
            {spark && (
              <div style={{ marginTop: 16 }}>
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
              </div>
            )}
          </div>

          {(assignments.length > 0 || lastTouched) && (
            <div className="card">
              <div className="card-title">Next up</div>
              {lastTouched && (
                <a className="assignment" href={href.scene(projectId, lastTouched.key)}>
                  <div className="what">
                    <b>Pick up where you left off</b>
                    <i>{lastTouched.title}</i>
                  </div>
                  <ArrowRight size={16} />
                </a>
              )}
              {assignments.map((s) => (
                <a key={s.key} className="assignment" href={href.scene(projectId, s.key)}>
                  <div className="what">
                    <b>Write: {s.title}</b>
                    <i>{s.synopsis}</i>
                  </div>
                  <ArrowRight size={16} />
                </a>
              ))}
            </div>
          )}

          <div className="card">
            <div className="card-title">
              Progress <span className="spacer" />
              <button className="btn btn-quiet" style={{ height: 26, fontSize: 12 }} onClick={() => setEditGoal((v) => !v)}>
                {editGoal ? 'Done' : 'Edit goal'}
              </button>
            </div>
            <div className="stats">
              <div className="stat">
                <div className="num">{fmt(wordsToday)}</div>
                <div className="lbl">words today</div>
              </div>
              <div className="stat">
                <div className="num">{fmt(total)}</div>
                <div className="lbl">{goal ? `of ${fmt(goal)}` : 'words so far'}</div>
              </div>
            </div>
            {goal > 0 && (
              <div className="progress" aria-hidden="true">
                <div style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className="hint">{pace}</div>
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
          </div>

          <div className="card">
            <div className="card-title">
              Outline <span className="spacer" />
              <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>a line per scene turns ideas into assignments</span>
            </div>
            {binder.map(({ chapter, scenes }) => (
              <div key={chapter.key} className="outline-chapter">
                <h3>
                  <TextField className="ghost-input" value={chapter.title} onSave={(title) => updateNode(chapter.id, { title })} aria-label="Chapter title" />
                </h3>
                {scenes.map((s) => (
                  <div key={s.key} className="outline-scene">
                    <span className={`status-dot ${s.wordCount > 0 ? 'drafted' : ''}`} />
                    <a className="scene-name" href={href.scene(projectId, s.key)}>
                      {s.title}
                    </a>
                    <TextField className="ghost-input" value={s.synopsis} onSave={(synopsis) => updateNode(s.id, { synopsis })} placeholder="What happens here?" aria-label={`What happens in ${s.title}`} />
                    <span className="words-small">{s.wordCount ? fmt(s.wordCount) : ''}</span>
                  </div>
                ))}
                <button className="btn btn-quiet" style={{ height: 28, marginTop: 4 }} onClick={() => newScene(chapter.key)}>
                  <Plus size={14} /> Scene
                </button>
              </div>
            ))}
            <button className="btn" onClick={newChapter}>
              <Plus size={15} /> Chapter
            </button>
          </div>

          <WhatIfCard projectId={projectId} />

          <div className="row mt">
            <button className="btn" onClick={() => exportMarkdown(projectId)}>
              <FileDown size={15} /> Export Markdown
            </button>
            <button className="btn" onClick={() => exportHtml(projectId)} title="Opens in Word, Pages or Google Docs">
              <FileDown size={15} /> Export for Word
            </button>
            <span style={{ flex: 1 }} />
            <button
              className="btn btn-quiet btn-danger"
              onClick={async () => {
                if (confirm(`Delete “${project.title}”? It has ${fmt(total)} words. (A backup from Settings keeps a copy.)`)) {
                  await deleteProject(project.id)
                  go(href.shelf())
                }
              }}
            >
              <Trash2 size={15} /> Delete story
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
