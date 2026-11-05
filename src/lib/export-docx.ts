import type { IParagraphOptions, Paragraph as DocxParagraph, TextRun as DocxTextRun } from 'docx'
import { download, manuscript, safeName } from './export'
import { isScript, type ScriptBlock } from './script'
import { isPlaceholderChapterTitle, numberWord } from './words'

/**
 * The story as a Word file in standard manuscript format, the way agents and editors expect it:
 * a title page with your name and a rounded word count, then 12 pt Times, double-spaced, 1-inch
 * margins, indented paragraphs, "Surname / TITLE / page" at the top of each page, chapters on new
 * pages a third of the way down, and # for scene breaks.
 *
 * Screenplays and plays export in script format instead (see exportScriptDocx).
 *
 * The docx library is loaded only when you export, so it never slows down writing.
 */

const INCH = 1440 // twentieths of a point
const PAGE_TEXT_WIDTH = 6.5 * INCH

type Docx = typeof import('docx')
interface Marks {
  allCaps?: boolean
  italics?: boolean
  bold?: boolean
  underline?: boolean
  strike?: boolean
}

/** Rounded the way manuscripts state length: to the thousand for a novel, the hundred otherwise. */
function roundedCount(words: number, novel: boolean) {
  const step = novel ? 1000 : 100
  // A draft shorter than one step gets its exact count rather than a rounded-up promise.
  return (words < step ? words : Math.round(words / step) * step).toLocaleString()
}

function runs(d: Docx, node: Node, marks: Marks, out: DocxTextRun[]) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (text) out.push(new d.TextRun({ text, allCaps: marks.allCaps, italics: marks.italics, bold: marks.bold, strike: marks.strike, underline: marks.underline ? {} : undefined }))
    } else if (child instanceof Element) {
      const tag = child.tagName
      if (tag === 'BR') {
        out.push(new d.TextRun({ text: '', break: 1 }))
        continue
      }
      runs(
        d,
        child,
        {
          allCaps: marks.allCaps,
          italics: marks.italics || tag === 'EM' || tag === 'I',
          bold: marks.bold || tag === 'STRONG' || tag === 'B',
          underline: marks.underline || tag === 'U',
          strike: marks.strike || tag === 'S' || tag === 'DEL',
        },
        out,
      )
    }
  }
  return out
}

const centered = (d: Docx, text: string, extra: Omit<IParagraphOptions, 'children' | 'alignment'> = {}) =>
  new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun(text)], ...extra })

/** One scene's HTML as manuscript paragraphs. */
function sceneParagraphs(d: Docx, html: string): DocxParagraph[] {
  const body = new DOMParser().parseFromString(html || '', 'text/html').body
  const out: DocxParagraph[] = []
  const prose = (el: Node, indent: { firstLine?: number; left?: number; right?: number }) => {
    const children = runs(d, el, {}, [])
    if ((el.textContent ?? '').trim()) out.push(new d.Paragraph({ children, indent }))
  }
  for (const el of Array.from(body.childNodes)) {
    if (!(el instanceof Element)) {
      if ((el.textContent ?? '').trim()) out.push(new d.Paragraph({ children: [new d.TextRun(el.textContent ?? '')], indent: { firstLine: INCH / 2 } }))
      continue
    }
    switch (el.tagName) {
      case 'HR':
        out.push(centered(d, '#'))
        break
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4':
        out.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: runs(d, el, {}, []) }))
        break
      case 'BLOCKQUOTE':
        for (const p of Array.from(el.children.length ? el.children : [el])) prose(p, { left: INCH / 2, right: INCH / 2 })
        break
      case 'UL':
      case 'OL':
        Array.from(el.children).forEach((li, i) => {
          const children = [new d.TextRun(el.tagName === 'OL' ? `${i + 1}. ` : '• '), ...runs(d, li, {}, [])]
          out.push(new d.Paragraph({ children, indent: { left: INCH / 2, hanging: INCH / 4 } }))
        })
        break
      default:
        prose(el, { firstLine: INCH / 2 })
    }
  }
  return out
}

export async function exportManuscriptDocx(projectId: string) {
  const d = await import('docx')
  const ms = await manuscript(projectId)
  if (isScript(ms.kind)) return exportScriptDocx(d, ms)
  const novel = ms.kind === 'novel'
  const words = ms.chapters.reduce((s, c) => s + c.scenes.reduce((t, n) => t + n.wordCount, 0), 0)
  const author = ms.author.trim()
  const surname = author.split(/\s+/).pop() ?? ''
  const single = { line: 240 }

  const titlePage = [
    new d.Paragraph({
      spacing: single,
      tabStops: [{ type: d.TabStopType.RIGHT, position: PAGE_TEXT_WIDTH }],
      children: [new d.TextRun(author || 'Your name'), new d.TextRun({ children: [new d.Tab(), `about ${roundedCount(words, novel)} words`] })],
    }),
    centered(d, ms.title, { spacing: { ...single, before: 4 * INCH } }),
    centered(d, author ? `by ${author}` : '', { spacing: { ...single, before: 240 } }),
  ]

  const body: DocxParagraph[] = []
  ms.chapters.forEach((chapter, ci) => {
    const real = !isPlaceholderChapterTitle(chapter.title)
    if (novel) {
      body.push(centered(d, `Chapter ${numberWord(ci + 1)}`, { pageBreakBefore: ci > 0, spacing: { before: 2.5 * INCH } }))
      if (real) body.push(centered(d, chapter.title))
      body.push(new d.Paragraph({ children: [] }))
    } else if (real) {
      body.push(centered(d, chapter.title, { spacing: { before: ci > 0 ? 480 : 0 } }))
    }
    chapter.scenes.forEach((scene, si) => {
      if (si > 0) body.push(centered(d, '#'))
      body.push(...sceneParagraphs(d, scene.content))
    })
  })
  body.push(centered(d, 'END', { spacing: { before: 480 } }))

  // US Letter, the size manuscripts are expected in.
  const page = { size: { width: 8.5 * INCH, height: 11 * INCH }, margin: { top: INCH, right: INCH, bottom: INCH, left: INCH } }
  const header = new d.Header({
    children: [
      new d.Paragraph({
        alignment: d.AlignmentType.RIGHT,
        spacing: single,
        children: [new d.TextRun([surname, ms.storyTitle.toUpperCase()].filter(Boolean).join(' / ') + ' / '), new d.TextRun({ children: [d.PageNumber.CURRENT] })],
      }),
    ],
  })

  const doc = new d.Document({
    creator: author || undefined,
    title: ms.title,
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 24 },
          paragraph: { spacing: { line: 480 } },
        },
      },
    },
    sections: [
      { properties: { page }, children: titlePage },
      { properties: { page: { ...page, pageNumbers: { start: 1 } } }, headers: { default: header }, children: body },
    ],
  })

  download(`${safeName(ms.title)} - manuscript.docx`, await d.Packer.toBlob(doc), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}

type Manuscript = Awaited<ReturnType<typeof manuscript>>

/** Where each kind of script line sits, and how it looks, measured from the 1.5-inch left margin. */
function scriptLine(kind: 'screenplay' | 'play', sp: ScriptBlock): { indent?: { left?: number; right?: number }; marks: Marks; center?: boolean; right?: boolean; gap: boolean } {
  if (kind === 'screenplay')
    switch (sp) {
      case 'scene':
        return { marks: { allCaps: true, bold: true }, gap: true }
      case 'character':
        return { indent: { left: 2.2 * INCH }, marks: { allCaps: true }, gap: true }
      case 'parenthetical':
        return { indent: { left: 1.6 * INCH, right: 2 * INCH }, marks: {}, gap: false }
      case 'dialogue':
        return { indent: { left: 1 * INCH, right: 1.5 * INCH }, marks: {}, gap: false }
      case 'transition':
        return { marks: { allCaps: true }, right: true, gap: true }
      default:
        return { marks: {}, gap: true }
    }
  switch (sp) {
    case 'scene':
      return { marks: { allCaps: true }, center: true, gap: true }
    case 'character':
      return { marks: { allCaps: true }, center: true, gap: true }
    case 'parenthetical':
      return { indent: { left: 1.4 * INCH }, marks: { italics: true }, gap: false }
    case 'dialogue':
      return { marks: {}, gap: false }
    case 'transition':
      return { marks: { allCaps: true }, right: true, gap: true }
    default:
      return { indent: { left: 2 * INCH }, marks: { italics: true }, gap: true }
  }
}

/** Screenplays and plays: Courier 12, single-spaced, each line in its standard place, page numbers top right. */
async function exportScriptDocx(d: Docx, ms: Manuscript) {
  const kind = ms.kind === 'play' ? 'play' : 'screenplay'
  const author = ms.author.trim()
  const lines: DocxParagraph[] = []

  ms.chapters.forEach((chapter, ci) => {
    if (kind === 'play' && !isPlaceholderChapterTitle(chapter.title))
      lines.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, pageBreakBefore: ci > 0, children: [new d.TextRun({ text: chapter.title, allCaps: true })] }))
    for (const scene of chapter.scenes) {
      const body = new DOMParser().parseFromString(scene.content || '', 'text/html').body
      for (const el of Array.from(body.children)) {
        if (!(el.textContent ?? '').trim()) continue
        const sp = (el.tagName === 'P' ? (el.getAttribute('data-sp') as ScriptBlock | null) : null) ?? 'action'
        const line = scriptLine(kind, sp)
        lines.push(
          new d.Paragraph({
            children: runs(d, el, line.marks, []),
            indent: line.indent,
            alignment: line.center ? d.AlignmentType.CENTER : line.right ? d.AlignmentType.RIGHT : undefined,
            spacing: { before: line.gap ? 240 : 0 },
          }),
        )
      }
    }
  })
  lines.push(centered(d, kind === 'play' ? 'END OF PLAY' : 'THE END', { spacing: { before: 480 } }))

  const page = { size: { width: 8.5 * INCH, height: 11 * INCH }, margin: { top: INCH, right: INCH, bottom: INCH, left: 1.5 * INCH } }
  const doc = new d.Document({
    creator: author || undefined,
    title: ms.title,
    styles: { default: { document: { run: { font: 'Courier New', size: 24 }, paragraph: { spacing: { line: 240 } } } } },
    sections: [
      {
        properties: { page },
        children: [
          new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { before: 3.5 * INCH }, children: [new d.TextRun({ text: ms.title, allCaps: true })] }),
          centered(d, 'Written by', { spacing: { before: 480 } }),
          centered(d, author, { spacing: { before: 240 } }),
        ],
      },
      {
        properties: { page: { ...page, pageNumbers: { start: 1 } } },
        headers: {
          default: new d.Header({ children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ children: [d.PageNumber.CURRENT, '.'] })] })] }),
        },
        children: lines,
      },
    ],
  })

  download(`${safeName(ms.title)} - ${kind}.docx`, await d.Packer.toBlob(doc), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}
