import { ArrowLeft, Copy, FilePlus2, Menu, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { ACCENTS, type Note, type NoteKind } from '../lib/db'
import { MiniEditor } from '../editor/MiniEditor'
import { useBinder, useNotes, useProjects } from '../lib/hooks'
import { addScene, createNote, deleteNote, nextCharacterColor, updateNote } from '../lib/repo'
import { go, href } from '../lib/router'
import { htmlToText } from '../lib/words'
import { KIND_META } from './kinds'
import { SyncPill } from './SyncPill'
import { TextField, toast, useDrawer } from './ui'

export function NotesView({ projectId, kind, noteId }: { projectId: string | null; kind: NoteKind; noteId?: string }) {
  const drawer = useDrawer()
  const meta = KIND_META[kind]
  const title = projectId ? meta.plural : meta.libraryPlural

  const topbar = (canAdd: boolean, onAdd?: () => void) => (
    <div className="topbar">
      {noteId ? (
        <a className="icon-btn only-narrow" href={href.notes(projectId, kind)} aria-label="Back to list">
          <ArrowLeft size={18} />
        </a>
      ) : null}
      <button className={`icon-btn menu-btn ${noteId ? 'hide-narrow' : ''}`} onClick={() => drawer.setOpen(true)} aria-label="Open menu">
        <Menu size={18} />
      </button>
      <div className="grow topbar-title">{title}</div>
      {canAdd && onAdd && (
        <button className="btn" onClick={onAdd}>
          <Plus size={15} /> New
        </button>
      )}
      <SyncPill />
    </div>
  )

  if (kind === 'todo')
    return (
      <>
        {topbar(false)}
        <div className="scroll paper">
          <TodosView projectId={projectId} />
        </div>
      </>
    )

  return <NotesList projectId={projectId} kind={kind} noteId={noteId} topbar={topbar} />
}

function NotesList({
  projectId,
  kind,
  noteId,
  topbar,
}: {
  projectId: string | null
  kind: NoteKind
  noteId?: string
  topbar: (canAdd: boolean, onAdd?: () => void) => ReactNode
}) {
  const notes = useNotes(projectId, kind)
  const meta = KIND_META[kind]
  const selected = noteId ? notes?.find((n) => n.id === noteId) : undefined

  const subtitles = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of notes ?? []) {
      const s = kind === 'character' ? n.role || n.voice || '' : htmlToText(n.body).trim().split('\n')[0] ?? ''
      map.set(n.id, s)
    }
    return map
  }, [notes, kind])

  const add = async () => {
    const n = await createNote(kind, projectId)
    go(href.notes(projectId, kind, n.id))
  }

  return (
    <>
      {topbar(kind !== 'cutting', add)}
      <div className={`notes-layout paper ${noteId ? 'has-detail' : ''}`}>
        <div className="notes-list">
          {notes && notes.length === 0 && <p className="empty">{meta.empty}</p>}
          {notes?.map((n) => (
            <a key={n.id} className={`note-item ${n.id === noteId ? 'active' : ''}`} href={href.notes(projectId, kind, n.id)}>
              <div className="t">
                {kind === 'character' && <span className="dot" style={{ background: `var(--${n.color ?? 'blue'})` }} />}
                {n.title || <span style={{ color: 'var(--muted)' }}>Untitled</span>}
              </div>
              {subtitles.get(n.id) && <div className="s">{subtitles.get(n.id)}</div>}
            </a>
          ))}
        </div>
        <div className="note-detail">
          {selected ? (
            <NoteDetail key={selected.id} note={selected} />
          ) : (
            notes && notes.length > 0 && <p className="empty">{noteId ? 'That note isn’t here anymore.' : 'Pick a note, or start a new one.'}</p>
          )}
        </div>
      </div>
    </>
  )
}

function NoteDetail({ note }: { note: Note }) {
  const meta = KIND_META[note.kind]
  const isCharacter = note.kind === 'character'

  const remove = async () => {
    if (!confirm(`Delete “${note.title || 'this note'}”?`)) return
    await deleteNote(note.id)
    go(href.notes(note.projectId, note.kind))
  }

  return (
    <div className="content">
      <TextField
        className="ghost-input note-title"
        value={note.title}
        onSave={(title) => updateNote(note.id, { title })}
        placeholder={isCharacter ? 'Name' : 'Title'}
        autoFocus={!note.title && !note.body}
      />

      {note.kind === 'inbox' && <InboxActions note={note} />}
      {note.kind === 'cutting' && (
        <div className="notice">
          Cut from <b>{note.source || 'a scene'}</b>.{' '}
          <button
            className="btn btn-quiet"
            style={{ height: 26 }}
            onClick={async () => {
              await navigator.clipboard.writeText(htmlToText(note.body).trim())
              toast('Copied. Paste it back wherever it belongs.')
            }}
          >
            <Copy size={14} /> Copy text
          </button>
        </div>
      )}

      {isCharacter && <CharacterFields note={note} />}

      {isCharacter && <div className="label" style={{ marginBottom: 6 }}>Notes</div>}
      <MiniEditor value={note.body} onSave={(body) => updateNote(note.id, { body })} placeholder={meta.placeholder || 'Write anything…'} />

      <div className="row mt" style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
        <MoveTo note={note} />
        <span style={{ flex: 1 }} />
        <button className="btn btn-quiet btn-danger" onClick={remove}>
          <Trash2 size={15} /> Delete
        </button>
      </div>
    </div>
  )
}

function CharacterFields({ note }: { note: Note }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="field">
        <span className="label">Colour in the manuscript</span>
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button
              key={c}
              className={`swatch ${note.color === c ? 'on' : ''}`}
              style={{ background: `var(--${c})` }}
              onClick={() => updateNote(note.id, { color: c })}
              aria-label={c}
              aria-pressed={note.color === c}
            />
          ))}
        </div>
      </div>
      <label className="field">
        <span className="label">Also called</span>
        <TextField
          value={(note.aliases ?? []).join(', ')}
          onSave={(v) =>
            updateNote(note.id, {
              aliases: v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="Nicknames, surnames, titles: Mar, Captain Hale"
        />
        <span className="hint">These get coloured too.</span>
      </label>
      <label className="field">
        <span className="label">Role</span>
        <TextField value={note.role ?? ''} onSave={(role) => updateNote(note.id, { role })} placeholder="The older sister. Keeper of the lamp." />
      </label>
      <label className="field">
        <span className="label">How they sound</span>
        <TextField
          multiline
          className="textarea voice-field"
          value={note.voice ?? ''}
          onSave={(voice) => updateNote(note.id, { voice })}
          placeholder="Short sentences. Dry. Never says sorry, says “noted.”"
        />
      </label>
      <label className="field">
        <span className="label">Lines only they would say</span>
        <TextField
          multiline
          className="textarea voice-field"
          style={{ fontStyle: 'italic' }}
          value={note.sampleLines ?? ''}
          onSave={(sampleLines) => updateNote(note.id, { sampleLines })}
          placeholder="“You told me it was condemned.”"
        />
      </label>
    </div>
  )
}

function MoveTo({ note }: { note: Note }) {
  const projects = useProjects() ?? []
  if (note.kind === 'cutting') return null
  return (
    <label className="row hint">
      Belongs to
      <select
        className="select"
        style={{ width: 'auto', padding: '4px 8px' }}
        value={note.projectId ?? ''}
        onChange={async (e) => {
          const projectId = e.target.value || null
          await updateNote(note.id, { projectId })
          toast(projectId ? 'Moved into the story.' : 'Moved to your library.')
          go(href.notes(projectId, note.kind, note.id))
        }}
      >
        <option value="">Library (any story)</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </label>
  )
}

const SORT_TARGETS: NoteKind[] = ['character', 'idea', 'world', 'todo']

function InboxActions({ note }: { note: Note }) {
  const [sending, setSending] = useState(false)
  const makeInto = async (kind: NoteKind) => {
    const patch: Partial<Note> = { kind }
    if (kind === 'character') patch.color = await nextCharacterColor(note.projectId)
    if (kind === 'todo') patch.done = false
    await updateNote(note.id, patch)
    toast(`Filed under ${note.projectId ? KIND_META[kind].plural : KIND_META[kind].libraryPlural}.`)
    go(href.notes(note.projectId, kind, note.id))
  }
  return (
    <div className="notice" style={{ background: 'color-mix(in srgb, var(--blue) 8%, transparent)' }}>
      <div style={{ marginBottom: 8 }}>
        {note.source ? `Imported from ${sourceLabel(note.source)}. ` : ''}What is it?
      </div>
      <div className="row">
        {SORT_TARGETS.map((k) => {
          const Icon = KIND_META[k].icon
          return (
            <button key={k} className="btn" style={{ height: 30 }} onClick={() => makeInto(k)}>
              <Icon size={14} /> {KIND_META[k].label}
            </button>
          )
        })}
        <button className="btn" style={{ height: 30 }} onClick={() => setSending((v) => !v)}>
          <FilePlus2 size={14} /> A scene
        </button>
      </div>
      {sending && <SendToScene note={note} />}
    </div>
  )
}

function sourceLabel(source: string) {
  return { 'google-drive': 'Google Drive', clipboard: 'your clipboard', paste: 'a paste', file: 'a file' }[source] ?? source
}

function SendToScene({ note }: { note: Note }) {
  const projects = useProjects() ?? []
  const [projectId, setProjectId] = useState(note.projectId ?? projects[0]?.id ?? '')
  const binder = useBinder(projectId || undefined) ?? []
  const [chapterId, setChapterId] = useState('')
  const chosenChapter = chapterId || binder[binder.length - 1]?.chapter.key || ''

  if (!projects.length) return <p className="hint" style={{ marginTop: 10 }}>Start a story first, then you can turn this into a scene.</p>

  const send = async () => {
    if (!projectId || !chosenChapter) return
    const scene = await addScene(projectId, chosenChapter, note.title || 'Imported scene', note.body)
    await deleteNote(note.id)
    toast('Added as a scene.')
    go(href.scene(projectId, scene.id))
  }

  return (
    <div className="row" style={{ marginTop: 10 }}>
      <select className="select" style={{ width: 'auto' }} value={projectId} onChange={(e) => (setProjectId(e.target.value), setChapterId(''))}>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <select className="select" style={{ width: 'auto' }} value={chosenChapter} onChange={(e) => setChapterId(e.target.value)}>
        {binder.map(({ chapter }) => (
          <option key={chapter.key} value={chapter.key}>
            {chapter.title}
          </option>
        ))}
      </select>
      <button className="btn btn-primary" onClick={send} disabled={!chosenChapter}>
        Add scene
      </button>
    </div>
  )
}

function TodosView({ projectId }: { projectId: string | null }) {
  const todos = useNotes(projectId, 'todo') ?? []
  const binder = useBinder(projectId ?? undefined) ?? []
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(false)
  const open = todos.filter((t) => !t.done)
  const done = todos.filter((t) => t.done)
  const tkScenes = binder.flatMap((c) => c.scenes).filter((s) => s.tks.length)
  const sceneTitle = (id?: string) => binder.flatMap((c) => c.scenes).find((s) => s.key === id)?.title

  const add = async () => {
    if (!draft.trim()) return
    await createNote('todo', projectId, { title: draft.trim(), done: false })
    setDraft('')
  }

  const row = (t: Note) => (
    <div key={t.id} className={`todo ${t.done ? 'done' : ''}`}>
      <input type="checkbox" checked={!!t.done} onChange={(e) => updateNote(t.id, { done: e.target.checked })} aria-label="Done" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <TextField className="ghost-input" value={t.title} onSave={(title) => updateNote(t.id, { title })} />
        {t.sceneId && projectId && (
          <a className="hint" href={href.scene(projectId, t.sceneId)}>
            {sceneTitle(t.sceneId) ?? 'scene'}
          </a>
        )}
      </div>
      <button className="icon-btn" onClick={() => deleteNote(t.id)} aria-label="Delete to-do">
        <Trash2 size={14} />
      </button>
    </div>
  )

  return (
    <div className="content" style={{ maxWidth: 720 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
        className="row"
        style={{ marginBottom: 12 }}
      >
        <input className="input" style={{ flex: 1 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a to-do and press Enter" />
      </form>
      {open.map(row)}
      {open.length === 0 && tkScenes.length === 0 && <p className="empty">{KIND_META.todo.empty}</p>}

      {tkScenes.length > 0 && (
        <>
          <div className="section-label" style={{ paddingLeft: 4 }}>
            In the manuscript
          </div>
          {tkScenes.flatMap((s) =>
            s.tks.map((tk, i) => (
              <a key={`${s.key}-${i}`} className="tk-item" href={href.scene(s.projectId, s.key)}>
                <span className="tk-text">[TK] {tk}</span>
                <span className="where">{s.title}</span>
              </a>
            )),
          )}
        </>
      )}

      {done.length > 0 && (
        <>
          <button className="btn btn-quiet mt" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && done.map(row)}
        </>
      )}
    </div>
  )
}
