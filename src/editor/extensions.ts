import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
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
