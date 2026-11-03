import { marked } from 'marked'
import { htmlToText, countWords } from '../words'

export interface ImportedDoc {
  key: string
  title: string
  html: string
  source: 'paste' | 'file' | 'google-drive' | 'clipboard'
  words: number
}

let seq = 0
export function makeDoc(title: string, html: string, source: ImportedDoc['source']): ImportedDoc {
  const clean = cleanHtml(html)
  return { key: `doc${++seq}`, title: title.trim() || 'Untitled', html: clean, source, words: countWords(htmlToText(clean)) }
}

const BREAK_LINE = /^\s*((\*\s*){3,}|#|(~\s*){3,}|(-\s*){3,}|(•\s*){3,}|⁂)\s*$/

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Plain text (Apple Notes, .txt): every non-empty line is a paragraph; "***" lines are scene breaks. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (BREAK_LINE.test(line) ? '<hr>' : `<p>${escapeHtml(line)}</p>`))
    .join('')
}

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false, gfm: true, breaks: false }) as string
}

export async function docxToHtml(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"] },
  )
  return result.value
}

/** Strip anything that isn't prose: scripts, styles, images, inline handlers. */
export function cleanHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,iframe,object,embed,img,svg,video,audio,form,input,button,meta,link').forEach((el) => el.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on') || attr.name === 'src' || attr.name === 'srcset') el.removeAttribute(attr.name)
      if (attr.name === 'href' && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
    }
  })
  // Wrap stray top-level text so it becomes a paragraph rather than vanishing.
  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      const p = doc.createElement('p')
      p.textContent = node.textContent.trim()
      node.replaceWith(p)
    }
  }
  // Scene-break paragraphs ("* * *") become real breaks.
  doc.querySelectorAll('p').forEach((p) => {
    if (BREAK_LINE.test(p.textContent ?? '')) p.replaceWith(doc.createElement('hr'))
  })
  return doc.body.innerHTML
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export async function fileToDoc(file: File): Promise<ImportedDoc> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'docx') return makeDoc(baseName(file.name), await docxToHtml(await file.arrayBuffer()), 'file')
  const text = await file.text()
  if (ext === 'md' || ext === 'markdown') return makeDoc(baseName(file.name), markdownToHtml(text), 'file')
  if (ext === 'html' || ext === 'htm') return makeDoc(baseName(file.name), text, 'file')
  return makeDoc(baseName(file.name), textToHtml(text), 'file')
}

/**
 * Several notes pasted at once can be separated with lines like "=== Title ===".
 * (The Apple Notes shortcut in the setup guide produces exactly this.)
 */
export function splitNotes(html: string, fallbackTitle: string, source: ImportedDoc['source']): ImportedDoc[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const marker = /^\s*===\s*(.*?)\s*===\s*$/
  const groups: { title: string; parts: string[] }[] = []
  let current: { title: string; parts: string[] } | null = null
  for (const el of Array.from(doc.body.children)) {
    const m = (el.textContent ?? '').match(marker)
    if (m) {
      current = { title: m[1], parts: [] }
      groups.push(current)
      continue
    }
    if (!current) {
      current = { title: '', parts: [] }
      groups.push(current)
    }
    current.parts.push(el.outerHTML)
  }
  return groups
    .filter((g) => g.parts.length)
    .map((g) => {
      const html = g.parts.join('')
      const title = g.title || firstLine(html) || fallbackTitle
      return makeDoc(title, html, source)
    })
}

export function firstLine(html: string): string {
  const text = htmlToText(html).trim().split('\n')[0] ?? ''
  return text.length > 60 ? text.slice(0, 57).trimEnd() + '…' : text
}
