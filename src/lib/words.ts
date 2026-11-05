/** Inline notes-to-self like [TK: name the county]. They don't count toward word totals. */
export const TK_RE = /\[\s*TK\b[:\s]*([^\]]*)\]/gi

export function countWords(text: string): number {
  const clean = text.replace(TK_RE, ' ')
  const matches = clean.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)
  return matches ? matches.length : 0
}

export function extractTks(text: string): string[] {
  return [...text.matchAll(TK_RE)].map((m) => m[1].trim() || 'TK')
}

export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<\/(p|h[1-6]|li|blockquote|div)>|<br\s*\/?>/gi, '$&\n')
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
  return doc.body.textContent ?? ''
}

export function today(): string {
  return dateKey(new Date())
}

export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fmt(n: number): string {
  return n.toLocaleString()
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

/** Standard manuscript pages hold about 250 words; page numbers are counted that way. */
export const WORDS_PER_PAGE = 250
