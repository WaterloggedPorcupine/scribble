import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  ChevronLeft,
  ChevronRight,
  Flag,
  Focus,
  Italic,
  Menu,
  MoveVertical,
  Palette,
  PanelRight,
  Scissors,
  SeparatorHorizontal,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ScenePanel } from '../components/ScenePanel'
import { TextField, toast, useDrawer, useIsNarrow } from '../components/ui'
import type { Placed } from '../lib/branches'
import type { BinderNode, Branch, Note, Project } from '../lib/db'
import { textToHtml } from '../lib/import/convert'
import { setPrefs, usePrefs } from '../lib/prefs'
import { createNote, saveSceneContent, updateNode } from '../lib/repo'
import { href } from '../lib/router'
import { countWords, fmt } from '../lib/words'
import { CharacterHighlight, CurrentBlock, TkMarker, characterKey } from './extensions'

const SAVE_DELAY = 700

export function SceneEditor({
  scene,
  whatIf,
  chapter,
  project,
  characters,
  totalWords,
  wordsToday,
  prev,
  next,
}: {
  scene: Placed
  /** The what-if this editor writes into, fixed for its lifetime; null for the Book. */
  whatIf: Branch | null
  chapter?: BinderNode
  project: Project
  characters: Note[]
  totalWords: number
  wordsToday: number
  prev?: Placed
  next?: Placed
}) {
  const version = whatIf?.id ?? null
  const prefs = usePrefs()
  const narrow = useIsNarrow()
  const drawer = useDrawer()
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastSaved = useRef(scene.content)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const [liveWords, setLiveWords] = useState(scene.wordCount)
  const [sheetOpen, setSheetOpen] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, code: false, codeBlock: false }),
      Placeholder.configure({ placeholder: 'Begin anywhere.' }),
      CharacterHighlight,
      TkMarker,
      CurrentBlock,
    ],
    content: scene.content || '',
    autofocus: window.matchMedia('(pointer: fine)').matches ? 'end' : false,
    editorProps: { attributes: { class: 'manuscript', 'aria-label': 'Manuscript' } },
    onUpdate: ({ editor }) => {
      dirty.current = true
      setLiveWords(countWords(editor.getText()))
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => flushRef.current(), SAVE_DELAY)
    },
  })

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    if (!editor || !dirty.current) return
    const html = editor.getHTML()
    const text = editor.getText()
    dirty.current = false
    lastSaved.current = html
    void saveSceneContent(scene.id, html, text, version)
  }, [editor, scene.id, version])
  const flushRef = useRef(flush)
  flushRef.current = flush

  // Save when leaving the scene, hiding the app, or closing the tab.
  useEffect(() => {
    const onHide = () => flushRef.current()
    const onVisibility = () => document.visibilityState === 'hidden' && onHide()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
      onHide()
    }
  }, [])

  // Take in changes made elsewhere (sync from another device, restoring a version).
  useEffect(() => {
    if (!editor || dirty.current || scene.content === lastSaved.current) return
    lastSaved.current = scene.content
    editor.commands.setContent(scene.content || '', false)
    setLiveWords(countWords(editor.getText()))
  }, [editor, scene.content])

  // Feed character names and colours to the highlighter.
  const characterMarks = useMemo(
    () =>
      characters.map((c) => ({
        id: c.id,
        color: c.color ?? 'blue',
        names: [c.title, ...(c.aliases ?? [])].filter(Boolean),
      })),
    [characters],
  )
  useEffect(() => {
    if (!editor) return
    const storage = editor.storage.characterHighlight as { characters: unknown; enabled: boolean }
    storage.characters = characterMarks
    storage.enabled = prefs.highlightCharacters
    editor.view.dispatch(editor.state.tr.setMeta(characterKey, true))
  }, [editor, characterMarks, prefs.highlightCharacters])

  // Typewriter scrolling: keep the line you're writing near the middle of the screen.
  useEffect(() => {
    if (!editor || !prefs.typewriter) return
    const center = () => {
      const box = scrollRef.current
      if (!box || !editor.isFocused) return
      const caret = editor.view.coordsAtPos(editor.state.selection.head)
      const rect = box.getBoundingClientRect()
      const visible = Math.min(rect.bottom, window.visualViewport?.height ?? window.innerHeight) - rect.top
      box.scrollBy({ top: caret.top - (rect.top + visible * 0.42) })
    }
    editor.on('selectionUpdate', center)
    editor.on('focus', center)
    return () => {
      editor.off('selectionUpdate', center)
      editor.off('focus', center)
    }
  }, [editor, prefs.typewriter])

  const insertTk = () => {
    if (!editor) return
    editor.chain().focus().insertContent('[TK: ]').run()
    editor.commands.setTextSelection(editor.state.selection.from - 1)
  }

  const cutToFloor = async () => {
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    if (empty) {
      toast('Select some text first, then cut it to the floor.')
      return
    }
    const text = editor.state.doc.textBetween(from, to, '\n')
    editor.chain().focus().deleteSelection().run()
    const title = text.trim().split(/\s+/).slice(0, 8).join(' ')
    await createNote('cutting', scene.projectId, { title, body: textToHtml(text), sceneId: scene.key, source: scene.title })
    toast('Moved to the cutting room floor.')
  }

  const togglePanel = () => (narrow ? setSheetOpen((v) => !v) : setPrefs({ rightPanel: !prefs.rightPanel }))
  const panelVisible = narrow ? sheetOpen : prefs.rightPanel
  const goalPct = project.wordGoal ? Math.min(100, Math.round((totalWords / project.wordGoal) * 100)) : 0

  return (
    <div className="scene-layout">
      <div className="scene-main">
        <div className="topbar">
          <button className="icon-btn menu-btn" onClick={() => drawer.setOpen(true)} aria-label="Open binder">
            <Menu size={18} />
          </button>
          <div className="grow">
            <div className="crumb">
              <a href={href.desk(project.id)}>{project.title}</a>
              {chapter ? ` · ${chapter.title}` : ''}
              {whatIf && (
                <a className="whatif-tag" href={href.whatif(project.id, whatIf.id)} title="You’re writing in a what-if. The Book doesn’t change.">
                  what if: {whatIf.name}
                </a>
              )}
            </div>
            <TextField
              className="ghost-input scene-title-input"
              value={scene.title}
              onSave={(title) => updateNode(scene.id, { title }, version)}
              aria-label="Scene title"
            />
          </div>
          <Toolbar editor={editor} onTk={insertTk} onCut={cutToFloor} onTogglePanel={togglePanel} panelOpen={panelVisible} />
        </div>

        <div
          ref={scrollRef}
          className="scroll paper"
          spellCheck={prefs.spellcheck}
          onClick={(e) => {
            if (e.target === e.currentTarget) editor?.commands.focus('end')
          }}
        >
          <div className="page">
            <EditorContent editor={editor} />
            <div className="page-end" onClick={() => editor?.commands.focus('end')} />
          </div>
        </div>

        <div className="statusbar">
          <a className="icon-btn" href={prev ? href.scene(project.id, prev.key) : undefined} aria-label="Previous scene" aria-disabled={!prev} style={{ opacity: prev ? 1 : 0.3 }}>
            <ChevronLeft size={16} />
          </a>
          <span className="why-line" title={project.premise}>
            {project.premise || scene.synopsis || ' '}
          </span>
          <span className="counts" title={`${goalPct}% of ${fmt(project.wordGoal)}`}>
            {fmt(liveWords)} here · {fmt(wordsToday)} today · {fmt(totalWords)} total
          </span>
          <a className="icon-btn" href={next ? href.scene(project.id, next.key) : undefined} aria-label="Next scene" aria-disabled={!next} style={{ opacity: next ? 1 : 0.3 }}>
            <ChevronRight size={16} />
          </a>
        </div>
      </div>

      {panelVisible && (
        <>
          {narrow && <div className="sheet-scrim" onClick={() => setSheetOpen(false)} />}
          <ScenePanel scene={scene} version={version} characters={characters} editor={editor} onBeforeRestore={flush} />
        </>
      )}
    </div>
  )
}

function Toolbar({
  editor,
  onTk,
  onCut,
  onTogglePanel,
  panelOpen,
}: {
  editor: Editor | null
  onTk: () => void
  onCut: () => void
  onTogglePanel: () => void
  panelOpen: boolean
}) {
  const prefs = usePrefs()
  const [, force] = useState(0)
  useEffect(() => {
    if (!editor) return
    const rerender = () => force((n) => n + 1)
    editor.on('selectionUpdate', rerender)
    editor.on('transaction', rerender)
    return () => {
      editor.off('selectionUpdate', rerender)
      editor.off('transaction', rerender)
    }
  }, [editor])

  const btn = (label: string, icon: ReactNode, onClick: () => void, on = false, className = '') => (
    <button
      className={`icon-btn ${on ? 'on' : ''} ${className}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
    >
      {icon}
    </button>
  )

  return (
    <div className="toolbar" role="toolbar" aria-label="Writing tools">
      {btn('Bold', <Bold size={17} />, () => editor?.chain().focus().toggleBold().run(), editor?.isActive('bold'), 'hide-narrow')}
      {btn('Italic', <Italic size={17} />, () => editor?.chain().focus().toggleItalic().run(), editor?.isActive('italic'))}
      {btn('Scene break', <SeparatorHorizontal size={17} />, () => editor?.chain().focus().setHorizontalRule().run(), false, 'hide-narrow')}
      {btn('Note to self [TK]', <Flag size={17} />, onTk)}
      {btn('Cut to the floor', <Scissors size={17} />, onCut)}
      <span className="sep hide-narrow" />
      {btn('Focus mode', <Focus size={17} />, () => setPrefs({ focusMode: !prefs.focusMode }), prefs.focusMode)}
      {btn('Typewriter scrolling', <MoveVertical size={17} />, () => setPrefs({ typewriter: !prefs.typewriter }), prefs.typewriter, 'hide-narrow')}
      {btn('Colour character names', <Palette size={17} />, () => setPrefs({ highlightCharacters: !prefs.highlightCharacters }), prefs.highlightCharacters)}
      {btn('Notes panel', <PanelRight size={17} />, onTogglePanel, panelOpen)}
    </div>
  )
}
