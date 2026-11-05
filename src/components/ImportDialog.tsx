import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { ClipboardPaste, FileUp, HardDrive, X } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { AuthError, beginSignIn, getToken, googleConfigured, pickerConfigured } from '../lib/google/auth'
import { isDesktop } from '../platform'
import { useProject } from '../lib/hooks'
import { applyImport, type Destination } from '../lib/import/apply'
import { fileToDoc, splitNotes, textToHtml, type ImportedDoc } from '../lib/import/convert'
import { importFromDrive } from '../lib/import/fromDrive'
import { go, href } from '../lib/router'
import { fmt } from '../lib/words'
import { Modal, toast } from './ui'

type Tab = 'paste' | 'file' | 'drive'

interface ImportRequest {
  projectId: string | null
  tab?: Tab
  fromClipboard?: boolean
}

let request: ImportRequest | null = null
const listeners = new Set<() => void>()

export function openImport(req: ImportRequest) {
  request = req
  listeners.forEach((l) => l())
}

function closeImport() {
  request = null
  listeners.forEach((l) => l())
}

/** Survives the round trip to Google's sign-in page, so the dialog reopens where you left it. */
const REOPEN_KEY = 'quire.reopenImport'

export function reopenImportAfterSignIn() {
  const saved = localStorage.getItem(REOPEN_KEY)
  if (!saved) return
  localStorage.removeItem(REOPEN_KEY)
  try {
    openImport(JSON.parse(saved))
  } catch {
    // ignore a malformed flag
  }
}

export function ImportHost() {
  const req = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => request,
  )
  return req ? <ImportDialog key={JSON.stringify(req)} req={req} /> : null
}

function ImportDialog({ req }: { req: ImportRequest }) {
  const [tab, setTab] = useState<Tab>(req.tab ?? 'paste')
  const [docs, setDocs] = useState<ImportedDoc[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const receive = (incoming: ImportedDoc[]) => {
    setError('')
    if (!incoming.length) return setError('Nothing to import there yet.')
    setDocs(incoming)
  }

  const fail = (err: unknown) => {
    setBusy('')
    if (err instanceof AuthError) return setError('Your Google session expired. Connect again to continue.')
    setError(err instanceof Error ? err.message : String(err))
  }

  if (docs) return <ReviewStep req={req} docs={docs} setDocs={setDocs} onBack={() => setDocs(null)} />

  return (
    <Modal title="Bring in your writing" onClose={closeImport}>
      <div className="tabs" role="tablist">
        <button className={tab === 'paste' ? 'on' : ''} onClick={() => setTab('paste')} role="tab" aria-selected={tab === 'paste'}>
          <ClipboardPaste size={15} /> Paste
        </button>
        <button className={tab === 'file' ? 'on' : ''} onClick={() => setTab('file')} role="tab" aria-selected={tab === 'file'}>
          <FileUp size={15} /> Files
        </button>
        <button className={tab === 'drive' ? 'on' : ''} onClick={() => setTab('drive')} role="tab" aria-selected={tab === 'drive'}>
          <HardDrive size={15} /> Google Drive
        </button>
      </div>

      {tab === 'paste' && <PasteTab fromClipboard={req.fromClipboard} onDone={receive} onError={fail} />}
      {tab === 'file' && <FileTab onDone={receive} onError={fail} setBusy={setBusy} />}
      {tab === 'drive' && <DriveTab req={req} onDone={receive} onError={fail} setBusy={setBusy} />}

      {busy && <p className="hint">{busy}</p>}
      {error && <p className="error-text">{error}</p>}
    </Modal>
  )
}

function PasteTab({ fromClipboard, onDone, onError }: { fromClipboard?: boolean; onDone: (d: ImportedDoc[]) => void; onError: (e: unknown) => void }) {
  const [html, setHtml] = useState('')
  const editor = useEditor({
    extensions: [StarterKit.configure({ code: false, codeBlock: false }), Placeholder.configure({ placeholder: 'Paste here (formatting is kept)…' })],
    editorProps: { attributes: { class: 'manuscript', 'aria-label': 'Paste area' } },
    onUpdate: ({ editor }) => setHtml(editor.isEmpty ? '' : editor.getHTML()),
  })

  const readClipboard = async () => {
    try {
      let pasted = ''
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          if (item.types.includes('text/html')) pasted = await (await item.getType('text/html')).text()
          else if (!pasted && item.types.includes('text/plain')) pasted = textToHtml(await (await item.getType('text/plain')).text())
        }
      } else {
        pasted = textToHtml(await navigator.clipboard.readText())
      }
      if (!pasted) return onError(new Error('Your clipboard is empty.'))
      onDone(splitNotes(pasted, 'Pasted note', 'clipboard'))
    } catch {
      onError(new Error('Couldn’t read the clipboard here. Paste into the box below instead.'))
    }
  }

  return (
    <div>
      {fromClipboard && <div className="notice">Your note is on the clipboard. Tap below to bring it in.</div>}
      <button className={`btn ${fromClipboard ? 'btn-primary' : ''}`} onClick={readClipboard} style={{ marginBottom: 12 }}>
        <ClipboardPaste size={15} /> Paste from clipboard
      </button>
      <div className="paste-box paper">
        <EditorContent editor={editor} />
      </div>
      <p className="hint">
        Bringing several notes at once? Put a line like <code>=== Title ===</code> before each one and they’ll arrive as separate notes. The Apple Notes shortcut in the setup guide does this for you.
      </p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" disabled={!html} onClick={() => onDone(splitNotes(html, 'Pasted note', 'paste'))}>
          Continue
        </button>
      </div>
    </div>
  )
}

function FileTab({ onDone, onError, setBusy }: { onDone: (d: ImportedDoc[]) => void; onError: (e: unknown) => void; setBusy: (s: string) => void }) {
  const [over, setOver] = useState(false)
  const handle = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      setBusy(`Reading ${files.length} ${files.length === 1 ? 'file' : 'files'}…`)
      const docs = await Promise.all(Array.from(files).map(fileToDoc))
      setBusy('')
      onDone(docs)
    } catch (err) {
      onError(err)
    }
  }
  return (
    <label
      className={`dropzone ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void handle(e.dataTransfer.files)
      }}
    >
      <FileUp size={26} />
      <div>
        <b>Choose files</b> or drop them here
        <div className="hint">Word (.docx), text (.txt), Markdown (.md) or web pages (.html)</div>
      </div>
      <input type="file" multiple accept=".docx,.txt,.md,.markdown,.html,.htm,text/plain" className="sr-only" onChange={(e) => handle(e.target.files)} />
    </label>
  )
}

function DriveTab({
  req,
  onDone,
  onError,
  setBusy,
}: {
  req: ImportRequest
  onDone: (d: ImportedDoc[]) => void
  onError: (e: unknown) => void
  setBusy: (s: string) => void
}) {
  if (isDesktop)
    return (
      <div className="notice">
        Picking from Google Drive isn’t available in the desktop app yet. Download the Google Doc as <i>.docx</i> and use the Files tab.
      </div>
    )

  if (!googleConfigured || !pickerConfigured)
    return (
      <div className="notice">
        Google Drive isn’t connected to this copy of Scribble yet. It takes about ten minutes, once: follow <b>Connect Google Drive</b> in the README. Until then, you can download a Google Doc as <i>.docx</i> and use the Files tab.
      </div>
    )

  if (!getToken())
    return (
      <div>
        <p className="hint" style={{ fontSize: 14 }}>
          Scribble asks Google for access only to the files you pick, plus a private folder for syncing. It can’t see anything else in your Drive.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => {
            localStorage.setItem(REOPEN_KEY, JSON.stringify({ projectId: req.projectId, tab: 'drive' }))
            beginSignIn()
          }}
        >
          <HardDrive size={15} /> Connect Google Drive
        </button>
      </div>
    )

  const pick = async () => {
    try {
      setBusy('Opening Google Drive…')
      const docs = await importFromDrive((done, total) => setBusy(`Bringing in ${done + 1} of ${total}…`))
      setBusy('')
      if (docs.length) onDone(docs)
    } catch (err) {
      onError(err)
    }
  }

  return (
    <div>
      <p className="hint" style={{ fontSize: 14 }}>
        Pick Google Docs, Word files, or text files. Headings become chapters and <code>* * *</code> breaks become scenes; you’ll get to review everything before it lands.
      </p>
      <button className="btn btn-primary" onClick={pick}>
        <HardDrive size={15} /> Choose from Google Drive
      </button>
    </div>
  )
}

function ReviewStep({
  req,
  docs,
  setDocs,
  onBack,
}: {
  req: ImportRequest
  docs: ImportedDoc[]
  setDocs: (d: ImportedDoc[]) => void
  onBack: () => void
}) {
  const project = useProject(req.projectId ?? undefined)
  const fromPaste = docs.every((d) => d.source === 'paste' || d.source === 'clipboard')
  const [dest, setDest] = useState<'inbox' | 'new-story' | 'into-story'>(fromPaste ? 'inbox' : 'new-story')
  const [split, setSplit] = useState(true)
  const [busy, setBusy] = useState(false)
  const total = docs.reduce((s, d) => s + d.words, 0)

  const run = async () => {
    setBusy(true)
    const destination: Destination =
      dest === 'inbox' ? { kind: 'inbox', projectId: req.projectId } : dest === 'into-story' && req.projectId ? { kind: 'into-story', projectId: req.projectId } : { kind: 'new-story' }
    const projectId = await applyImport(docs, destination, split)
    closeImport()
    toast(`Imported ${docs.length} ${docs.length === 1 ? 'piece' : 'pieces'} (${fmt(total)} words).`)
    if (dest === 'inbox') go(href.notes(req.projectId, 'inbox'))
    else if (projectId) go(href.desk(projectId))
  }

  const choice = (value: typeof dest, title: string, sub: string) => (
    <label className={`choice ${dest === value ? 'on' : ''}`}>
      <input type="radio" name="dest" checked={dest === value} onChange={() => setDest(value)} />
      <div>
        <b>{title}</b>
        <span>{sub}</span>
      </div>
    </label>
  )

  return (
    <Modal
      title="Where should it go?"
      onClose={closeImport}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onBack}>
            Back
          </button>
          <button className="btn btn-primary" onClick={run} disabled={busy || !docs.length}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 16 }}>
        {docs.map((d) => (
          <div key={d.key} className="doc-row">
            <input
              className="ghost-input"
              value={d.title}
              onChange={(e) => setDocs(docs.map((x) => (x.key === d.key ? { ...x, title: e.target.value } : x)))}
              aria-label="Title"
            />
            <span className="words-small">{fmt(d.words)} words</span>
            <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setDocs(docs.filter((x) => x.key !== d.key))} aria-label="Leave this one out">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {choice('inbox', 'Inbox', 'Notes to sort later into characters, ideas, world notes, or scenes.')}
      {choice('new-story', 'A new story', docs.length > 1 ? 'All of these, in order, as one story.' : 'Its own story on your shelf.')}
      {req.projectId && project && choice('into-story', `Add to “${project.title}”`, 'As new chapters at the end.')}

      {dest !== 'inbox' && (
        <label className="toggle" style={{ borderBottom: 0 }}>
          <span>
            Split into chapters and scenes
            <span className="hint" style={{ display: 'block' }}>
              Headings and lines like “Chapter 3” start chapters; * * * starts a new scene.
            </span>
          </span>
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
        </label>
      )}
    </Modal>
  )
}
