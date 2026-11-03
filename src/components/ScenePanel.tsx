import type { Editor } from '@tiptap/react'
import { History, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import type { Placed } from '../lib/branches'
import type { Note } from '../lib/db'
import { useNotes, useSnapshots } from '../lib/hooks'
import { createNote, deleteNote, restoreSnapshot, updateNode, updateNote } from '../lib/repo'
import { href } from '../lib/router'
import { fmt, htmlToText, timeAgo } from '../lib/words'
import { TextField, toast } from './ui'

/** The notes that sit beside the page: who's speaking, what this scene is for, what's left to fix. */
export function ScenePanel({
  scene,
  version,
  characters,
  editor,
  onBeforeRestore,
}: {
  scene: Placed
  version: string | null
  characters: Note[]
  editor: Editor | null
  onBeforeRestore: () => void
}) {
  const sceneText = useMemo(() => htmlToText(scene.content), [scene.content])
  const [showAll, setShowAll] = useState(false)

  const { present, absent } = useMemo(() => {
    const present: Note[] = []
    const absent: Note[] = []
    for (const c of characters) {
      const names = [c.title, ...(c.aliases ?? [])].filter((n) => n.trim().length >= 2)
      ;(names.some((n) => sceneText.includes(n)) ? present : absent).push(c)
    }
    return { present, absent }
  }, [characters, sceneText])

  const todos = useNotes(scene.projectId, 'todo')?.filter((t) => t.sceneId === scene.key) ?? []
  const snapshots = useSnapshots(scene.id) ?? []
  const [newTodo, setNewTodo] = useState('')

  const jumpToTk = (tk: string) => {
    if (!editor) return
    const needle = tk === 'TK' ? '[TK' : tk
    const hits: { from: number; to: number }[] = []
    editor.state.doc.descendants((node, pos) => {
      if (hits.length || !node.isText || !node.text) return
      const i = node.text.indexOf(needle)
      if (i >= 0) hits.push({ from: pos + i, to: pos + i + needle.length })
    })
    if (hits[0]) editor.chain().focus().setTextSelection(hits[0]).scrollIntoView().run()
  }

  const addTodo = async () => {
    const title = newTodo.trim()
    if (!title) return
    await createNote('todo', scene.projectId, { title, sceneId: scene.key, done: false })
    setNewTodo('')
  }

  const restore = async (id: string, when: number) => {
    if (!confirm(`Restore the version from ${timeAgo(when)}? Your current text will be kept in this list too.`)) return
    onBeforeRestore()
    await restoreSnapshot(id, version)
    toast('Version restored.')
  }

  return (
    <aside className="scene-panel" aria-label="Scene notes">
      <section className="panel-section">
        <div className="panel-label">
          Voice
          <span className="spacer" />
          <a className="icon-btn" href={href.notes(scene.projectId, 'character')} aria-label="All characters" title="All characters">
            <Plus size={15} />
          </a>
        </div>
        {characters.length === 0 && (
          <p className="hint">
            Add characters and their voices show up here while you write. <a href={href.notes(scene.projectId, 'character')} style={{ color: 'var(--accent)' }}>Add one</a>
          </p>
        )}
        {present.map((c) => (
          <VoiceCard key={c.id} c={c} />
        ))}
        {absent.length > 0 && present.length > 0 && !showAll && (
          <button className="btn btn-quiet" onClick={() => setShowAll(true)}>
            {absent.length} more not in this scene
          </button>
        )}
        {(showAll || present.length === 0) && absent.map((c) => <VoiceCard key={c.id} c={c} dim={present.length > 0} />)}
      </section>

      <section className="panel-section">
        <div className="panel-label">What happens here</div>
        <TextField
          multiline
          className="textarea"
          value={scene.synopsis}
          onSave={(synopsis) => updateNode(scene.id, { synopsis }, version)}
          placeholder="One line: what this scene needs to do."
        />
      </section>

      <section className="panel-section">
        <div className="panel-label">Left to fix</div>
        <div className="mini-list">
          {scene.tks.map((tk, i) => (
            <button key={i} className="mini-item tk ghost-input" style={{ textAlign: 'left' }} onClick={() => jumpToTk(tk)}>
              [TK] {tk}
            </button>
          ))}
          {todos.map((t) => (
            <label key={t.id} className="mini-item">
              <input type="checkbox" checked={!!t.done} onChange={(e) => updateNote(t.id, { done: e.target.checked })} />
              <span style={{ textDecoration: t.done ? 'line-through' : undefined, flex: 1 }}>{t.title}</span>
              <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => deleteNote(t.id)} aria-label="Delete to-do">
                <Trash2 size={13} />
              </button>
            </label>
          ))}
          <form
            className="row"
            style={{ marginTop: 4 }}
            onSubmit={(e) => {
              e.preventDefault()
              void addTodo()
            }}
          >
            <input className="input" value={newTodo} onChange={(e) => setNewTodo(e.target.value)} placeholder="Add a to-do for this scene" />
          </form>
          {scene.tks.length === 0 && todos.length === 0 && <p className="hint">Type [TK: anything] in the text to leave yourself a note and keep going.</p>}
        </div>
      </section>

      <section className="panel-section">
        <div className="panel-label">
          <History size={13} /> Earlier versions
        </div>
        {snapshots.length === 0 && <p className="hint">Scribble keeps a copy every 10 minutes while you write.</p>}
        <div className="mini-list">
          {snapshots.slice(0, 12).map((s) => (
            <div key={s.id} className="mini-item">
              <span>
                {timeAgo(s.createdAt)}
                {s.reason === 'conflict' && <span style={{ color: 'var(--orange)' }}> · from a sync conflict</span>}
                {s.reason === 'restore' && <span> · before a restore</span>}
                {s.reason === 'bring-in' && <span> · before a what-if came in</span>}
              </span>
              <span className="meta">{fmt(s.wordCount)} words</span>
              <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => restore(s.id, s.createdAt)} aria-label="Restore this version" title="Restore">
                <RotateCcw size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}

function VoiceCard({ c, dim }: { c: Note; dim?: boolean }) {
  return (
    <a
      className={`voice-card ${dim ? 'dim' : ''}`}
      href={href.notes(c.projectId, 'character', c.id)}
      style={{ '--char': `var(--${c.color ?? 'blue'})` } as CSSProperties}
    >
      <div className="name">{c.title || 'Unnamed'}</div>
      {c.voice && <div className="voice">{c.voice}</div>}
      {c.sampleLines && <div className="lines">{c.sampleLines}</div>}
      {!c.voice && !c.sampleLines && <div className="hint">How do they sound? Tap to add their voice.</div>}
    </a>
  )
}
