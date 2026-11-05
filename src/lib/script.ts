import type { ProjectKind } from './db'

/**
 * Screenplays and plays. A script is ordinary paragraphs, each marked with the kind of line it is
 * (stored as data-sp on the <p>), so it reads, syncs, compares and exports like any other scene.
 * Novels and short stories never set it.
 */

export type ScriptBlock = 'scene' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition'

export const SCRIPT_BLOCKS: { id: ScriptBlock; label: string }[] = [
  { id: 'scene', label: 'Scene heading' },
  { id: 'action', label: 'Action' },
  { id: 'character', label: 'Character' },
  { id: 'parenthetical', label: 'Parenthetical' },
  { id: 'dialogue', label: 'Dialogue' },
  { id: 'transition', label: 'Transition' },
]

export const SCRIPT_BLOCK_IDS = new Set<string>(SCRIPT_BLOCKS.map((b) => b.id))

export function isScript(kind: ProjectKind | undefined) {
  return kind === 'screenplay' || kind === 'play'
}

/** Tab walks a line through the kinds in this order; Shift-Tab goes back. */
export const TAB_ORDER: ScriptBlock[] = ['action', 'character', 'parenthetical', 'dialogue', 'transition', 'scene']

/** What the next line usually is, so Enter lands on it. */
export const AFTER_ENTER: Record<ScriptBlock, ScriptBlock> = {
  scene: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'action',
  transition: 'scene',
}

/** A line typed as INT. or EXT. is a scene heading; an all-caps line ending in TO: is a transition. */
export function recognise(text: string, current: ScriptBlock): ScriptBlock {
  const t = text.trim()
  if (/^(INT|EXT|EST|INT\.?\s*\/\s*EXT|I\/E)[.\s]/i.test(t)) return 'scene'
  if (current === 'action' && /^[A-Z][A-Z .'-]*TO:$/.test(t)) return 'transition'
  return current
}

/** Rough words per manuscript page, for page numbers: a script page holds fewer words than prose. */
export function wordsPerPage(kind: ProjectKind) {
  return isScript(kind) ? 170 : 250
}
