import { Download, Plus } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type ProjectKind } from '../lib/db'
import { useProjects } from '../lib/hooks'
import { createProject } from '../lib/repo'
import { go, href } from '../lib/router'
import { fmt } from '../lib/words'
import { openImport } from './ImportDialog'
import { Topbar } from './Topbar'
import { Modal } from './ui'

const KIND_LABEL: Record<ProjectKind, string> = { novel: 'Novel', 'short-story': 'Short story', screenplay: 'Screenplay', play: 'Play' }

export function Shelf() {
  const projects = useProjects()
  const [creating, setCreating] = useState(false)
  const totals = useLiveQuery(async () => {
    const map = new Map<string, number>()
    for (const n of await db.nodes.toArray()) {
      if (n.deletedAt || n.branchId || n.kind !== 'scene') continue
      map.set(n.projectId, (map.get(n.projectId) ?? 0) + n.wordCount)
    }
    return map
  })

  return (
    <>
      <Topbar crumbs={[{ label: 'Scribble' }]} />
      <div className="scroll paper">
        <div className="content">
          <div className="row between" style={{ marginBottom: 20 }}>
            <div>
              <h1 className="page-heading">Scribble</h1>
              <div className="hint" style={{ fontSize: 14 }}>
                A desk for your stories, and the notes that keep them alive.
              </div>
            </div>
            <div className="row">
              <button className="btn" onClick={() => openImport({ projectId: null })}>
                <Download size={15} /> Import
              </button>
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus size={15} /> New story
              </button>
            </div>
          </div>

          {projects && projects.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '36px 24px' }}>
              <p className="why" style={{ fontStyle: 'italic', marginTop: 0 }}>
                Every finished story started as one sentence.
              </p>
              <p className="hint" style={{ fontSize: 14 }}>
                Start a new story, or bring in drafts from Google Drive, Word files, or Apple Notes.
              </p>
              <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  <Plus size={15} /> New story
                </button>
                <button className="btn" onClick={() => openImport({ projectId: null })}>
                  <Download size={15} /> Import
                </button>
              </div>
            </div>
          )}

          <div className="project-grid">
            {projects?.map((p) => {
              const words = totals?.get(p.id) ?? 0
              return (
                <a key={p.id} className="project-card paper" href={href.desk(p.id)}>
                  <span className="kind-tag">{KIND_LABEL[p.kind]}</span>
                  <h3>{p.title}</h3>
                  <div className="premise">{p.premise}</div>
                  <div className="meta">
                    {fmt(words)} {p.wordGoal ? `of ${fmt(p.wordGoal)} ` : ''}words
                  </div>
                  {p.wordGoal > 0 && (
                    <div className="progress" style={{ margin: 0 }} aria-hidden="true">
                      <div style={{ width: `${Math.min(100, (words / p.wordGoal) * 100)}%` }} />
                    </div>
                  )}
                </a>
              )
            })}
          </div>
        </div>
      </div>
      {creating && <NewStoryDialog onClose={() => setCreating(false)} />}
    </>
  )
}

function NewStoryDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<ProjectKind>('novel')
  const [premise, setPremise] = useState('')

  const create = async () => {
    const { project, firstScene } = await createProject({ title, kind, premise })
    onClose()
    go(firstScene ? href.scene(project.id, firstScene.id) : href.desk(project.id))
  }

  return (
    <Modal
      title="New story"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={create}>
            Start writing
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <label className="field">
          <span className="label">Working title</span>
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The salt year" />
        </label>
        <div className="field">
          <span className="label">What kind?</span>
          <div className="tabs" style={{ marginBottom: 0 }}>
            {(['novel', 'short-story', 'screenplay', 'play'] as ProjectKind[]).map((k) => (
              <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="label">Why this story?</span>
          <textarea
            className="textarea why-input"
            style={{ fontSize: 17, minHeight: 80 }}
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            placeholder="Two sisters who can’t forgive the same storm."
          />
          <span className="hint">Scribble shows you this line while you write, as a reminder of why you started.</span>
        </label>
      </form>
    </Modal>
  )
}
