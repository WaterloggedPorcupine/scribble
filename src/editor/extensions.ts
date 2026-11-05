import { Extension } from '@tiptap/core'
import Typography from '@tiptap/extension-typography'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { AFTER_ENTER, recognise, SCRIPT_BLOCK_IDS, TAB_ORDER, type ScriptBlock } from '../lib/script'
import { TK_RE } from '../lib/words'

export interface CharacterMark {
  id: string
  names: string[]
  color: string
}

export const characterKey = new PluginKey<DecorationSet>('characterHighlight')

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildCharacterDecorations(doc: PMNode, characters: CharacterMark[], enabled: boolean) {
  if (!enabled) return DecorationSet.empty
  const lookup = new Map<string, CharacterMark>()
  for (const c of characters) {
    for (const n of c.names) {
      const name = n.trim()
      if (name.length >= 2) lookup.set(name, c)
    }
  }
  if (!lookup.size) return DecorationSet.empty
  const alternatives = [...lookup.keys()].sort((a, b) => b.length - a.length).map(escapeRe)
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'gu')
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const m of node.text.matchAll(re)) {
      const c = lookup.get(m[1])
      if (!c || m.index === undefined) continue
      const from = pos + m.index
      decorations.push(
        Decoration.inline(from, from + m[1].length, {
          class: 'char-name',
          style: `--char: var(--${c.color})`,
          'data-character': c.id,
        }),
      )
    }
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * Colours each character's name (and aliases) in the manuscript, like syntax highlighting.
 * Update by mutating editor.storage.characterHighlight and dispatching a transaction
 * with meta `characterKey` set.
 */
export const CharacterHighlight = Extension.create<object, { characters: CharacterMark[]; enabled: boolean }>({
  name: 'characterHighlight',
  addStorage() {
    return { characters: [], enabled: true }
  },
  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin<DecorationSet>({
        key: characterKey,
        state: {
          init: (_, state) => buildCharacterDecorations(state.doc, storage.characters, storage.enabled),
          apply: (tr, old) =>
            tr.docChanged || tr.getMeta(characterKey)
              ? buildCharacterDecorations(tr.doc, storage.characters, storage.enabled)
              : old,
        },
        props: {
          decorations(state) {
            return characterKey.getState(state)
          },
        },
      }),
    ]
  },
})

const tkKey = new PluginKey<DecorationSet>('tkMarker')

function buildTkDecorations(doc: PMNode) {
  const decorations: Decoration[] = []
  const re = new RegExp(TK_RE.source, 'gi')
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    for (const m of node.text.matchAll(re)) {
      if (m.index === undefined) continue
      decorations.push(Decoration.inline(pos + m.index, pos + m.index + m[0].length, { class: 'tk-mark' }))
    }
  })
  return DecorationSet.create(doc, decorations)
}

/** Highlights [TK: …] notes-to-self. They're collected into the to-do list on save. */
export const TkMarker = Extension.create({
  name: 'tkMarker',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: tkKey,
        state: {
          init: (_, state) => buildTkDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? buildTkDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return tkKey.getState(state)
          },
        },
      }),
    ]
  },
})

/** Marks the paragraph holding the cursor, so focus mode can fade the rest. */
export const CurrentBlock = Extension.create({
  name: 'currentBlock',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { $head } = state.selection
            if ($head.depth < 1) return null
            return DecorationSet.create(state.doc, [Decoration.node($head.before(1), $head.after(1), { class: 'is-current' })])
          },
        },
      }),
    ]
  },
})

export const revisionKey = new PluginKey<DecorationSet>('revisionMarks')

const normText = (s: string) => s.replace(/\s+/g, ' ').trim()

function buildRevisionDecorations(doc: PMNode, book: Set<string> | null) {
  if (!book) return DecorationSet.empty
  const decorations: Decoration[] = []
  doc.forEach((node, pos) => {
    const text = normText(node.textContent)
    if (text && !book.has(text)) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'revised-line' }))
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * Stars the paragraphs a what-if changed, in the right margin, the way revised script pages mark
 * changed lines. `storage.book` holds the Book's paragraphs (whitespace-normalised); null shows
 * nothing. Update it and dispatch a transaction with meta `revisionKey`.
 */
export const RevisionMarks = Extension.create<object, { book: Set<string> | null }>({
  name: 'revisionMarks',
  addStorage() {
    return { book: null }
  },
  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin<DecorationSet>({
        key: revisionKey,
        state: {
          init: (_, state) => buildRevisionDecorations(state.doc, storage.book),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(revisionKey) ? buildRevisionDecorations(tr.doc, storage.book) : old),
        },
        props: {
          decorations(state) {
            return revisionKey.getState(state)
          },
        },
      }),
    ]
  },
})

/** Curly quotes and apostrophes, -- as an em dash, ... as an ellipsis. Nothing else gets rewritten. */
export const SmartPunctuation = Typography.configure({
  leftArrow: false,
  rightArrow: false,
  copyright: false,
  trademark: false,
  servicemark: false,
  registeredTrademark: false,
  oneHalf: false,
  plusMinus: false,
  notEqual: false,
  laquo: false,
  raquo: false,
  multiplication: false,
  superscriptTwo: false,
  superscriptThree: false,
  oneQuarter: false,
  threeQuarters: false,
})

/**
 * Script lines: every paragraph can carry the kind of script line it is (data-sp), so the marking
 * survives whatever kind of story you're in. With `keys` on (screenplays and plays), Tab and
 * Shift-Tab change the line's kind and Enter moves on to the line that usually comes next.
 */
export const ScriptBlocks = Extension.create<{ keys: boolean }>({
  name: 'scriptBlocks',
  addOptions() {
    return { keys: false }
  },
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          sp: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => {
              const v = el.getAttribute('data-sp')
              return v && SCRIPT_BLOCK_IDS.has(v) ? v : null
            },
            renderHTML: (attrs) => (attrs.sp ? { 'data-sp': attrs.sp } : {}),
          },
        },
      },
    ]
  },
  addKeyboardShortcuts(): Record<string, () => boolean> {
    if (!this.options.keys) return {}
    const current = (): ScriptBlock | null => {
      const node = this.editor.state.selection.$from.parent
      return node.type.name === 'paragraph' ? ((node.attrs.sp as ScriptBlock | null) ?? 'action') : null
    }
    const cycle = (by: number) => {
      const cur = current()
      if (!cur) return false
      const next = TAB_ORDER[(TAB_ORDER.indexOf(cur) + by + TAB_ORDER.length) % TAB_ORDER.length]
      return this.editor.commands.updateAttributes('paragraph', { sp: next })
    }
    return {
      Tab: () => cycle(1),
      'Shift-Tab': () => cycle(-1),
      Enter: () => {
        const cur = current()
        if (!cur) return false
        const text = this.editor.state.selection.$from.parent.textContent
        // Enter on an empty line that isn't action turns it into action, rather than piling up blanks.
        if (!text.trim() && cur !== 'action') return this.editor.commands.updateAttributes('paragraph', { sp: 'action' })
        const kind = recognise(text, cur)
        return this.editor.chain().updateAttributes('paragraph', { sp: kind }).splitBlock().updateAttributes('paragraph', { sp: AFTER_ENTER[kind] }).run()
      },
    }
  },
})
