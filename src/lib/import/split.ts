export interface SplitScene {
  title: string
  html: string
}

export interface SplitChapter {
  title: string
  scenes: SplitScene[]
}

const CHAPTER_LINE = /^(chapter|ch\.|part|book|prologue|epilogue|interlude)\b/i

/**
 * Turn one imported document into chapters and scenes:
 * - Heading 1/2, or a short line like "Chapter 3" / "Prologue", starts a chapter
 * - Heading 3/4 starts a titled scene
 * - A scene break (* * *) starts a new scene
 */
export function splitStory(html: string, docTitle: string, splitIntoParts: boolean): SplitChapter[] {
  if (!splitIntoParts) return [{ title: docTitle, scenes: [{ title: docTitle, html }] }]

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const chapters: SplitChapter[] = []
  let chapter: SplitChapter | null = null
  let parts: string[] = []
  let sceneTitle = ''

  const ensureChapter = () => {
    if (!chapter) {
      chapter = { title: docTitle, scenes: [] }
      chapters.push(chapter)
    }
    return chapter
  }
  const flush = () => {
    const sceneHtml = parts.join('')
    const hasText = parts.some((p) => p.replace(/<[^>]+>/g, '').trim())
    if (hasText) {
      const ch = ensureChapter()
      ch.scenes.push({ title: sceneTitle || `Scene ${ch.scenes.length + 1}`, html: sceneHtml })
    }
    parts = []
    sceneTitle = ''
  }

  for (const el of Array.from(doc.body.children)) {
    const tag = el.tagName.toLowerCase()
    const text = (el.textContent ?? '').trim()
    const isChapter = tag === 'h1' || tag === 'h2' || (tag === 'p' && text.length > 0 && text.length < 60 && CHAPTER_LINE.test(text))
    if (isChapter) {
      flush()
      chapter = { title: text || `Chapter ${chapters.length + 1}`, scenes: [] }
      chapters.push(chapter)
    } else if (tag === 'h3' || tag === 'h4') {
      flush()
      sceneTitle = text
    } else if (tag === 'hr') {
      flush()
    } else {
      parts.push(el.outerHTML)
    }
  }
  flush()

  const nonEmpty = chapters.filter((c) => c.scenes.length)
  return nonEmpty.length ? nonEmpty : [{ title: docTitle, scenes: [{ title: 'Scene 1', html: '' }] }]
}
