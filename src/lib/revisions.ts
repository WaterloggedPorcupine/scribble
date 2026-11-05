import { useEffect } from 'react'
import type { Branch } from './db'

/**
 * Revision colours, borrowed from how scripts are printed: each round of changes goes out on a
 * new colour of paper, always in the same order. Here each what-if gets the next colour, in the
 * order you started them, so "the blue pages" always means your first what-if.
 */
export const REVISIONS = [
  { name: 'Blue', ink: '#3b6fb6' },
  { name: 'Pink', ink: '#b04a6a' },
  { name: 'Yellow', ink: '#957200' },
  { name: 'Green', ink: '#4f7a2e' },
  { name: 'Goldenrod', ink: '#a1610b' },
  { name: 'Salmon', ink: '#b0533a' },
  { name: 'Cherry', ink: '#a32638' },
  { name: 'Tan', ink: '#7c6447' },
] as const

export type Revision = (typeof REVISIONS)[number]

/** `branches` in the order useBranches gives them (oldest first). */
export function revisionOf(branchId: string | null | undefined, branches: Branch[]): Revision | null {
  if (!branchId) return null
  const i = branches.findIndex((b) => b.id === branchId)
  return i < 0 ? null : REVISIONS[i % REVISIONS.length]
}

/** Paints marks, tags and banners in the colour of the what-if you're writing in. */
export function useRevisionInk(revision: Revision | null) {
  useEffect(() => {
    const root = document.documentElement
    if (!revision) return
    root.style.setProperty('--rev-ink', revision.ink)
    return () => {
      root.style.removeProperty('--rev-ink')
    }
  }, [revision])
}
