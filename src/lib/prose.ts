/**
 * Scene HTML made safe to show outside the editor. Imported files can carry anything, so only
 * plain prose tags survive, rebuilt from scratch with no attributes.
 */

const KEEP = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'HR', 'BR', 'EM', 'I', 'STRONG', 'B', 'U', 'S', 'SUB', 'SUP'])
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH'])
const BLOCK = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'HR'])

function rebuild(from: Node, into: Node, doc: Document) {
  for (const child of Array.from(from.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      into.appendChild(doc.createTextNode(child.textContent ?? ''))
    } else if (child instanceof Element) {
      if (DROP.has(child.tagName)) continue
      if (KEEP.has(child.tagName)) {
        const el = doc.createElement(child.tagName.toLowerCase())
        rebuild(child, el, doc)
        into.appendChild(el)
      } else {
        rebuild(child, into, doc)
      }
    }
  }
}

export interface Block {
  html: string
  /** Whitespace-normalised text, for comparing versions. */
  text: string
}

/** The scene as a list of safe paragraphs (and headings, rules, quotes). */
export function proseBlocks(html: string): Block[] {
  const source = new DOMParser().parseFromString(html || '', 'text/html')
  const doc = document.implementation.createHTMLDocument('')
  const clean = doc.createElement('div')
  rebuild(source.body, clean, doc)

  const blocks: Block[] = []
  let loose: HTMLElement | null = null
  for (const node of Array.from(clean.childNodes)) {
    if (node instanceof Element && BLOCK.has(node.tagName)) {
      loose = null
      blocks.push({ html: node.outerHTML, text: norm(node.textContent) })
    } else {
      // Stray text and inline tags at the top level get gathered into a paragraph.
      if (!loose) {
        loose = doc.createElement('p')
        blocks.push({ html: '', text: '' })
      }
      loose.appendChild(node)
      blocks[blocks.length - 1] = { html: loose.outerHTML, text: norm(loose.textContent) }
    }
  }
  return blocks.filter((b) => b.text || b.html === '<hr>')
}

function norm(s: string | null) {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

/** Which paragraphs on each side don't appear on the other. Good enough to see what a rewrite touched. */
export function compareBlocks(book: Block[], whatIf: Block[]) {
  const inBook = new Set(book.map((b) => b.text))
  const inWhatIf = new Set(whatIf.map((b) => b.text))
  return {
    book: book.map((b) => ({ ...b, differs: !inWhatIf.has(b.text) })),
    whatIf: whatIf.map((b) => ({ ...b, differs: !inBook.has(b.text) })),
  }
}
