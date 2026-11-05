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

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** 7 → "Seven", 42 → "Forty-Two", the way chapter numbers are printed. Past 99, plain digits. */
export function numberWord(n: number): string {
  const word = n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '') : String(n)
  return word.replace(/(^|-)([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
}

/** "Chapter 3" and "Chapter Three" are placeholders, not titles worth printing under the number. */
export function isPlaceholderChapterTitle(title: string) {
  return /^\s*(chapter|act)\s+([0-9]+|[a-z-]+)\s*$/i.test(title) || !title.trim()
}

/** The header on every manuscript page: Surname / TITLE / 12. */
export function runningHead(author: string | undefined, title: string, page: number) {
  const surname = author?.trim().split(/\s+/).pop()
  return [surname, title.toUpperCase(), String(page)].filter(Boolean).join(' / ')
}
