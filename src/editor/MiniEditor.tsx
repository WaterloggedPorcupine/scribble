import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { TkMarker } from './extensions'

/** A lighter editor for note bodies. Saves shortly after you pause. */
export function MiniEditor({
  value,
  onSave,
  placeholder = 'Write anything…',
  className = 'note-body',
}: {
  value: string
  onSave: (html: string) => void
  placeholder?: string
  className?: string
}) {
  const lastSaved = useRef(value)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  const editor = useEditor({
    extensions: [StarterKit.configure({ code: false, codeBlock: false }), Placeholder.configure({ placeholder }), TkMarker],
    content: value || '',
    editorProps: { attributes: { class: `manuscript ${className}` } },
    onUpdate: ({ editor }) => {
      dirty.current = true
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        dirty.current = false
        lastSaved.current = editor.getHTML()
        saveRef.current(lastSaved.current)
      }, 500)
    },
  })

  useEffect(() => {
    if (!editor || dirty.current || value === lastSaved.current) return
    lastSaved.current = value
    editor.commands.setContent(value || '', false)
  }, [editor, value])

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (dirty.current && editor) saveRef.current(editor.getHTML())
    },
    [editor],
  )

  return <EditorContent editor={editor} />
}
