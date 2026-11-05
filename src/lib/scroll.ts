import { useEffect, type RefObject } from 'react'

/**
 * Where you left off in each scene and in the Read view, per device, so going back and forth
 * puts you back on the same line.
 */
export interface Spot {
  top: number
  /** Cursor position in a scene, so the editor can pick up where you were typing. */
  caret?: number
}

const KEY = 'quire.spots'
const LIMIT = 300

function load(): Map<string, Spot> {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Spot>))
  } catch {
    return new Map()
  }
}

const spots = load()

export function getSpot(key: string): Spot | undefined {
  return spots.get(key)
}

export function rememberSpot(key: string, spot: Spot) {
  // Re-inserting keeps the most recent places at the end, so the oldest are dropped first.
  spots.delete(key)
  spots.set(key, spot)
  while (spots.size > LIMIT) spots.delete(spots.keys().next().value!)
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(spots)))
  } catch {
    // storage blocked: remember for this session only
  }
}

/**
 * Restores the scroll position saved under `key` once `ready`, and keeps it up to date as you
 * scroll. `caret` adds the cursor position to what's saved.
 */
export function useRememberedScroll(ref: RefObject<HTMLElement | null>, key: string, ready: boolean, caret?: () => number | undefined) {
  useEffect(() => {
    const el = ref.current
    if (!el || !ready) return
    const saved = getSpot(key)
    const target = saved?.top ?? 0
    let last = el.scrollTop
    let raf = 0
    let timer: number | undefined
    let frames = 0
    let userMoved = false

    // Content can still be filling in on the first frames, so keep trying until it's tall enough.
    const restore = () => {
      if (userMoved) return
      el.scrollTop = target
      last = el.scrollTop
      if (Math.abs(el.scrollTop - target) > 2 && frames++ < 60) raf = requestAnimationFrame(restore)
    }
    // Somewhere new starts wherever the view puts it (the editor jumps to the end of the scene).
    if (saved) restore()

    const save = () => rememberSpot(key, { top: last, caret: caret?.() })
    const onScroll = () => {
      last = el.scrollTop
      window.clearTimeout(timer)
      timer = window.setTimeout(save, 200)
    }
    const stop = () => {
      userMoved = true
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', stop, { passive: true })
    el.addEventListener('touchstart', stop, { passive: true })
    el.addEventListener('keydown', stop)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      save()
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', stop)
      el.removeEventListener('touchstart', stop)
      el.removeEventListener('keydown', stop)
    }
    // `caret` is read at save time; a new function each render shouldn't restart this.
  }, [ref, key, ready])
}
