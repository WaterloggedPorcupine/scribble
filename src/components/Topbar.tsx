import { Menu, Minus, Plus } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { setPrefs, usePrefs, ZOOMS } from '../lib/prefs'
import { href, useRoute } from '../lib/router'
import { openImport } from './ImportDialog'
import { SyncPill } from './SyncPill'
import { useDrawer } from './ui'

export interface Crumb {
  label: string
  href?: string
}

/** Where you are, as a trail: Scribble / The Long Field / Arrivals. */
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Where you are">
      {items.map((c, i) => {
        const last = i === items.length - 1
        return (
          <Fragment key={i}>
            {i > 0 && (
              <span className="crumb-sep" aria-hidden="true">
                /
              </span>
            )}
            {c.href && !last ? (
              <a href={c.href}>{c.label}</a>
            ) : (
              <span className="crumb-here" aria-current={last ? 'page' : undefined}>
                {c.label}
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

/**
 * The strip along the top of every screen: the binder button on phones, the trail, whatever the
 * screen adds, sync status, and the Menu.
 */
export function Topbar({ crumbs, children, lead, drawerHiddenNarrow }: { crumbs: Crumb[]; children?: ReactNode; lead?: ReactNode; drawerHiddenNarrow?: boolean }) {
  const drawer = useDrawer()
  return (
    <div className="topbar">
      {lead}
      <button className={`icon-btn menu-btn ${drawerHiddenNarrow ? 'hide-narrow' : ''}`} onClick={() => drawer.setOpen(true)} aria-label="Open binder">
        <Menu size={18} />
      </button>
      <div className="grow">
        <Crumbs items={crumbs} />
      </div>
      {children}
      <SyncPill />
      <AppMenu />
    </div>
  )
}

/** The one menu: getting around, bringing things in, settings, and how big everything is. */
export function AppMenu() {
  const route = useRoute()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  // Going somewhere closes it.
  useEffect(() => setOpen(false), [route])

  const projectId = 'projectId' in route ? route.projectId : null

  return (
    <div className="app-menu" ref={ref}>
      <button className="menu-pill" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true">
        Menu
      </button>
      {open && (
        <div className="app-menu-sheet">
          <a className="app-menu-item" href={href.shelf()}>
            All stories
          </a>
          <button
            className="app-menu-item"
            onClick={() => {
              setOpen(false)
              openImport({ projectId })
            }}
          >
            Import
          </button>
          <a className="app-menu-item" href={href.settings()}>
            Settings
          </a>
          <ZoomRow />
        </div>
      )}
    </div>
  )
}

/** Makes the whole app bigger or smaller on this device. */
function ZoomRow() {
  const { zoom } = usePrefs()
  const i = ZOOMS.indexOf(zoom)
  const step = (by: number) => {
    // A zoom saved before the steps changed snaps to the nearest one.
    const at = i >= 0 ? i : ZOOMS.findIndex((z) => z >= zoom)
    const next = Math.min(ZOOMS.length - 1, Math.max(0, (at < 0 ? ZOOMS.length - 1 : at) + by))
    setPrefs({ zoom: ZOOMS[next] })
  }
  const pct = `${Math.round(zoom * 100)}%`

  return (
    <div className="app-menu-zoom" role="group" aria-label="Zoom">
      <span className="app-menu-label">Zoom</span>
      <button className="icon-btn" onClick={() => step(-1)} disabled={zoom <= ZOOMS[0]} aria-label="Zoom out" title="Smaller">
        <Minus size={15} />
      </button>
      <button className="zoom-level" onClick={() => setPrefs({ zoom: 1 })} title="Back to 100%">
        {pct}
      </button>
      <button className="icon-btn" onClick={() => step(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in" title="Bigger">
        <Plus size={15} />
      </button>
    </div>
  )
}
