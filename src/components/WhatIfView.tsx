import { AlertTriangle, ArrowRight, BookOpen, Copy, GitBranch, Trash2, Undo2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { setActiveBranch, useStoredBranchId, type Change } from '../lib/branches'
import type { Branch } from '../lib/db'
import { useActiveBranch, useBranch, useBranches, useProject, useWhatIfChanges } from '../lib/hooks'
import { compareBlocks, proseBlocks } from '../lib/prose'
import { bringAllIntoBook, bringIntoBook, createBranch, deleteBranch, discardChange, updateBranch, whatIfToStory } from '../lib/repo'
import { go, href } from '../lib/router'
import { fmt } from '../lib/words'
import { Topbar } from './Topbar'
import { Modal, TextField, toast } from './ui'

// ── Starting one ────────────────────────────────────────────────────────────

export function NewWhatIf({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [name, setName] = useState('')
  const [premise, setPremise] = useState('')
  const start = async () => {
    const branch = await createBranch(projectId, name, premise)
    setActiveBranch(projectId, branch.id)
    toast(`You’re writing in “${branch.name}”. The Book won’t change until you bring scenes in.`)
    onClose()
  }
  return (
    <Modal
      title="New what-if"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={start}>
            Start writing it
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        Try another version of the story without touching the Book. Change any chapter or scene; everything you don’t change reads exactly as
        the Book does. Later, bring the parts that work into the Book.
      </p>
      <label className="field">
        <span className="label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mara stays" autoFocus />
      </label>
      <label className="field">
        <span className="label">What if…</span>
        <textarea className="textarea" rows={2} value={premise} onChange={(e) => setPremise(e.target.value)} placeholder="…Mara never leaves the city, and Jonah has to come to her?" />
      </label>
    </Modal>
  )
}

// ── Knowing which version you're in ─────────────────────────────────────────

/** Sits under the story title in the binder: which version you're writing in, and a way to switch. */
export function VersionSwitcher({ projectId }: { projectId: string }) {
  const branches = useBranches(projectId) ?? []
  const active = useActiveBranch(projectId)
  const [creating, setCreating] = useState(false)
  return (
    <div className={`version-switch ${active ? 'in-whatif' : ''}`}>
      <GitBranch size={15} aria-hidden="true" />
      <select
        className="select"
        value={active?.id ?? ''}
        aria-label="Version you're writing in"
        onChange={(e) => {
          if (e.target.value === '+') return setCreating(true)
          setActiveBranch(projectId, e.target.value || null)
        }}
      >
        <option value="">The Book</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            What if: {b.name}
          </option>
        ))}
        <option value="+">New what-if…</option>
      </select>
      {active && (
        <a className="icon-btn" href={href.whatif(projectId, active.id)} aria-label="Review this what-if" title="Review this what-if">
          <ArrowRight size={15} />
        </a>
      )}
      {creating && <NewWhatIf projectId={projectId} onClose={() => setCreating(false)} />}
    </div>
  )
}

export function WhatIfBanner({ projectId }: { projectId: string }) {
  const branch = useActiveBranch(projectId)
  if (!branch) return null
  return (
    <div className="whatif-banner">
      <GitBranch size={18} aria-hidden="true" />
      <div className="what">
        <b>You’re writing in a what-if: {branch.name}</b>
        <span>{branch.premise || 'Changes here stay out of the Book until you bring them in.'}</span>
      </div>
      <div className="row">
        <a className="btn" href={href.whatif(projectId, branch.id)}>
          Review changes
        </a>
        <button className="btn btn-quiet" onClick={() => setActiveBranch(projectId, null)}>
          Back to the Book
        </button>
      </div>
    </div>
  )
}

// ── Reviewing one ───────────────────────────────────────────────────────────

export function WhatIfView({ projectId, branchId }: { projectId: string; branchId: string }) {
  const branch = useBranch(branchId)
  const project = useProject(projectId)
  const all = useWhatIfChanges(projectId)
  const stored = useStoredBranchId(projectId)

  if (branch === undefined || project === undefined || all === undefined) return null
  if (!branch || branch.deletedAt || !project)
    return (
      <div className="content">
        <p className="empty">This what-if isn’t here anymore.</p>
        <p style={{ textAlign: 'center' }}>
          <a className="btn" href={href.desk(projectId)}>
            Back to the desk
          </a>
        </p>
      </div>
    )

  const changes = all.get(branch.id) ?? []
  const writingHere = stored === branch.id

  const bringAll = async () => {
    if (!confirm(`Bring all ${changes.length} changes from “${branch.name}” into the Book? Whatever the Book has now is kept in each scene’s earlier versions.`)) return
    await bringAllIntoBook(branch.id)
    toast('All of it is in the Book now.')
  }
  const ownStory = async () => {
    if (!confirm(`Make “${branch.name}” a story of its own? It gets a copy of this version and of your notebook. The Book and this what-if stay as they are.`)) return
    const story = await whatIfToStory(branch.id)
    if (story) {
      toast('Copied into its own story.')
      go(href.desk(story.id))
    }
  }
  const remove = async () => {
    if (!confirm(`Delete “${branch.name}”? Anything you haven’t brought into the Book is lost. The Book stays as it is.`)) return
    await deleteBranch(branch.id)
    go(href.desk(projectId))
  }

  return (
    <>
      <Topbar crumbs={[{ label: 'Scribble', href: href.shelf() }, { label: project.title, href: href.desk(projectId) }, { label: `What if: ${branch.name}` }]} />
      <div className="scroll paper">
        <div className="content">
          <TextField
            className="ghost-input page-heading"
            value={branch.name}
            onSave={(name) => updateBranch(branch.id, { name: name || 'Untitled what-if' })}
            aria-label="What-if name"
          />
          <TextField
            multiline
            className="ghost-input why-input"
            value={branch.premise}
            onSave={(premise) => updateBranch(branch.id, { premise })}
            placeholder="What if…?"
            aria-label="What if"
          />

          <div className="row mt">
            {writingHere ? (
              <button className="btn" onClick={() => setActiveBranch(projectId, null)}>
                <BookOpen size={15} /> Back to the Book
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => (setActiveBranch(projectId, branch.id), toast(`You’re writing in “${branch.name}”.`))}>
                <GitBranch size={15} /> Write in this what-if
              </button>
            )}
            <a className="btn" href={href.read(projectId, branch.id)}>
              <BookOpen size={15} /> Read it
            </a>
          </div>

          <div className="card mt">
            <div className="card-title">
              Different from the Book <span className="spacer" />
              {changes.length > 1 && (
                <button className="btn" style={{ height: 28 }} onClick={bringAll}>
                  <Upload size={14} /> Bring everything in
                </button>
              )}
            </div>
            {changes.length === 0 && (
              <p className="hint" style={{ marginTop: 0 }}>
                Nothing yet. {writingHere ? 'Edit, add, move or cut any scene' : 'Switch to this what-if, then edit, add, move or cut any scene'}; the Book stays as it is
                until you bring a change in here.
              </p>
            )}
            {changes.map((c) => (
              <ChangeRow key={c.row.id} change={c} branch={branch} />
            ))}
          </div>

          <div className="row mt">
            <button className="btn" onClick={ownStory} title="Copy this version into a separate story">
              <Copy size={15} /> Make it its own story
            </button>
            <span style={{ flex: 1 }} />
            <button className="btn btn-quiet btn-danger" onClick={remove}>
              <Trash2 size={15} /> Delete what-if
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const LABEL: Record<Change['kind'], string> = { changed: 'Changed', new: 'New', cut: 'Cut' }

function describe({ kind, row, book, fields }: Change) {
  const words = (n: number) => `${fmt(n)} ${n === 1 ? 'word' : 'words'}`
  if (kind === 'new') return row.kind === 'chapter' ? 'A new chapter' : words(row.wordCount)
  if (kind === 'cut') return row.kind === 'chapter' ? 'The whole chapter, with its scenes' : `${words(book?.wordCount ?? 0)} cut`
  if (!book) return ''
  const parts: string[] = []
  if (fields.includes('content')) {
    const delta = row.wordCount - book.wordCount
    parts.push(delta === 0 ? 'Rewritten' : `Rewritten, ${delta > 0 ? '+' : '−'}${words(Math.abs(delta))}`)
  }
  if (fields.includes('title')) parts.push(`renamed from “${book.title}”`)
  if (fields.includes('parentId') || fields.includes('order')) parts.push('moved')
  if (fields.includes('synopsis')) parts.push('new outline line')
  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function ChangeRow({ change, branch }: { change: Change; branch: Branch }) {
  const { kind, row, book, chapterTitle, fields, bothChanged } = change
  const [comparing, setComparing] = useState(false)
  const title = kind === 'cut' ? (book?.title ?? row.title) : row.title
  const canCompare = row.kind === 'scene' && (kind === 'new' || fields.includes('content'))

  const bringIn = async () => {
    await bringIntoBook(row.id)
    toast(`“${title}” is in the Book now.`)
  }
  const discard = async () => {
    const what = kind === 'cut' ? 'Put it back in this what-if' : kind === 'new' ? 'Delete it from this what-if' : 'Go back to the Book’s version in this what-if'
    if (confirm(`${what}? “${title}”`)) await discardChange(row.id)
  }

  return (
    <div className={`change change-${kind}`}>
      <div className="change-head">
        <span className="change-kind">{LABEL[kind]}</span>
        <div className="what">
          <b>
            {row.kind === 'chapter' ? 'Chapter: ' : ''}
            {kind === 'cut' || row.kind === 'chapter' ? (
              title
            ) : (
              <a href={href.scene(row.projectId, row.baseId ?? row.id)} onClick={() => setActiveBranch(row.projectId, branch.id)}>
                {title}
              </a>
            )}
          </b>
          <i>
            {chapterTitle ? `${chapterTitle} · ` : ''}
            {describe(change)}
          </i>
        </div>
      </div>
      {bothChanged.length > 0 && (
        <div className="notice" style={{ margin: '8px 0 0' }}>
          <AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> The Book changed this {bothChanged.includes('content') ? 'text' : 'too'} since the what-if
          copied it. Bringing this in replaces the Book’s edit{bothChanged.includes('content') ? '; it’s kept in the scene’s earlier versions' : ''}.
        </div>
      )}
      <div className="row change-actions">
        {canCompare && (
          <button className="btn btn-quiet" onClick={() => setComparing((v) => !v)}>
            {comparing ? 'Hide' : kind === 'new' ? 'Read' : 'Compare'}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn-quiet" onClick={discard} title="Undo this change in the what-if">
          <Undo2 size={14} /> Discard
        </button>
        <button className="btn" onClick={bringIn}>
          <Upload size={14} /> Bring into the Book
        </button>
      </div>
      {comparing && <Compare bookHtml={kind === 'new' ? null : (book?.content ?? '')} whatIfHtml={row.content} whatIfName={branch.name} />}
    </div>
  )
}

/** The Book's scene and the what-if's side by side, with the paragraphs that differ marked. */
function Compare({ bookHtml, whatIfHtml, whatIfName }: { bookHtml: string | null; whatIfHtml: string; whatIfName: string }) {
  const sides = useMemo(() => compareBlocks(bookHtml === null ? [] : proseBlocks(bookHtml), proseBlocks(whatIfHtml)), [bookHtml, whatIfHtml])
  const column = (label: string, blocks: typeof sides.book, kind: 'book' | 'whatif') => (
    <div className={`compare-col ${kind}`}>
      <div className="compare-label">{label}</div>
      <div className="read-prose">
        {blocks.length === 0 && <p className="hint">{kind === 'book' ? 'Not in the Book.' : 'Empty.'}</p>}
        {blocks.map((b, i) => (
          <div key={i} className={b.differs ? 'differs' : undefined} dangerouslySetInnerHTML={{ __html: b.html }} />
        ))}
      </div>
    </div>
  )
  if (bookHtml === null)
    return <div className="compare single">{column(`What if: ${whatIfName}`, sides.whatIf.map((b) => ({ ...b, differs: false })), 'whatif')}</div>
  return (
    <div className="compare">
      {column('The Book', sides.book, 'book')}
      {column(`What if: ${whatIfName}`, sides.whatIf, 'whatif')}
    </div>
  )
}
