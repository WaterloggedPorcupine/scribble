import TurndownService from 'turndown'
import { activeBranchId, assemble } from './branches'
import { db } from './db'
import { collectLocal, mergePayload, type Payload } from './sync'
import { today } from './words'

export function download(filename: string, content: string | Blob, type: string) {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '').trim() || 'story'
}

/** The version you're writing in: the Book, or a what-if (named in the title so the files don't get mixed up). */
export async function manuscript(projectId: string) {
  const project = await db.projects.get(projectId)
  const branchId = await activeBranchId(projectId)
  const branch = branchId ? await db.branches.get(branchId) : undefined
  const binder = assemble(await db.nodes.where('projectId').equals(projectId).toArray(), branchId)
  const title = project?.title ?? 'Untitled'
  return {
    title: branch ? `${title} (what if: ${branch.name})` : title,
    storyTitle: title,
    author: project?.author ?? '',
    kind: project?.kind ?? 'novel',
    chapters: binder.map(({ chapter, scenes }) => ({ title: chapter.title, scenes })),
  }
}

/** The whole story as Markdown: chapters as headings, scenes separated by * * *. */
export async function exportMarkdown(projectId: string) {
  const ms = await manuscript(projectId)
  const td = new TurndownService({ headingStyle: 'atx', emDelimiter: '*', hr: '* * *' })
  const out = [`# ${ms.title}`]
  for (const ch of ms.chapters) {
    out.push(`## ${ch.title}`)
    out.push(ch.scenes.map((s) => td.turndown(s.content || '')).filter(Boolean).join('\n\n* * *\n\n'))
  }
  download(`${safeName(ms.title)}.md`, out.join('\n\n') + '\n', 'text/markdown')
}

/** A simple HTML manuscript that Word, Pages and Google Docs all open with formatting intact. */
export async function exportHtml(projectId: string) {
  const ms = await manuscript(projectId)
  const body = ms.chapters
    .map((ch) => `<h2>${escape(ch.title)}</h2>\n` + ch.scenes.map((s) => s.content).join('\n<p style="text-align:center">* * *</p>\n'))
    .join('\n')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(ms.title)}</title>
<style>body{font-family:Georgia,serif;font-size:12pt;line-height:2;max-width:40em;margin:2em auto}h1,h2{text-align:center;font-weight:normal}</style>
</head><body><h1>${escape(ms.title)}</h1>\n${body}</body></html>`
  download(`${safeName(ms.title)}.html`, html, 'text/html')
}

function escape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function exportBackup() {
  const payload = await collectLocal()
  download(`scribble-backup-${today()}.json`, JSON.stringify(payload), 'application/json')
}

export async function restoreBackup(file: File) {
  const payload = JSON.parse(await file.text()) as Payload
  if (payload.app !== 'quire') throw new Error('That file isn’t a Scribble backup.')
  // Newer copies win; any scene the backup overwrites is kept in that scene's history first.
  await mergePayload(payload, 0)
}
