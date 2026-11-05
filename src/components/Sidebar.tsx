import { ArrowDown, ArrowUp, BookOpen, BookOpenText, ChevronDown, ChevronRight, Download, Library, Minus, Plus, Search, Settings, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Placed } from '../lib/branches'
import { useActiveBranch, useBinder, useNoteCounts, useProject, useProjects } from '../lib/hooks'
import { addChapter, addScene, deleteNode, moveNode, updateNode } from '../lib/repo'
import { go, href, type Route } from '../lib/router'
import { setPrefs, usePrefs, ZOOMS } from '../lib/prefs'
import { fmt } from '../lib/words'
import { openImport } from './ImportDialog'
import { KIND_META, SIDEBAR_KINDS } from './kinds'
import { SyncPill } from './SyncPill'
import { TextField } from './ui'
import { VersionSwitcher } from './WhatIfView'

export function Sidebar({ route }: { route: Route }) {
  const projectId = 'projectId' in route ? route.projectId : null
  return projectId ? <ProjectSidebar projectId={projectId} route={route} /> : <LibrarySidebar route={route} />
}

function ProjectSidebar({ projectId, route }: { projectId: string; route: Route }) {
  const project = useProject(projectId)
  const binder = useBinder(projectId) ?? []
  const counts = useNoteCounts(projectId) ?? {}
  const whatIf = useActiveBranch(projectId)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const activeScene = route.view === 'scene' ? route.sceneId : null

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const newScene = async (chapterId: string) => {
    const scene = await addScene(projectId, chapterId)
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.delete(chapterId)
      return next
    })
    go(href.scene(projectId, scene.id))
  }

  const remove = async (node: Placed, what: string, words: number) => {
    const extra = words ? ` It has ${fmt(words)} words.` : ''
    // In a what-if, a Book chapter or scene is only cut from that version.
    const ask = whatIf && node.change !== 'new' ? `Cut ${what} from “${whatIf.name}”? The Book keeps it.` : `Delete ${what}?${extra}`
    if (confirm(ask)) await deleteNode(node.id)
  }

  return (
    <>
      <div className="sidebar-head">
        <a className="icon-btn" href={href.shelf()} aria-label="All stories" title="All stories">
          <Library size={17} />
        </a>
        <a className="sidebar-title" href={href.desk(projectId)} title={project?.title}>
          {project?.title ?? ''}
        </a>
      </div>

      <VersionSwitcher projectId={projectId} />

      <a className={`nav-item ${route.view === 'desk' ? 'active' : ''}`} href={href.desk(projectId)}>
        <BookOpen size={16} /> Desk
      </a>
      <a className={`nav-item ${route.view === 'read' ? 'active' : ''}`} href={href.read(projectId)}>
        <BookOpenText size={16} /> Read
      </a>

      <div className="section-label">
        Manuscript
        <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => addChapter(projectId)} aria-label="Add chapter" title="Add chapter">
          <Plus size={15} />
        </button>
      </div>

      {binder.map(({ chapter, scenes }) => {
        const isCollapsed = collapsed.has(chapter.key)
        const words = scenes.reduce((s, n) => s + n.wordCount, 0)
        return (
          <div key={chapter.key}>
            <div className="binder-row">
              <div className="nav-item" onDoubleClick={() => setRenaming(chapter.key)}>
                <button className="icon-btn chapter-toggle" onClick={() => toggle(chapter.key)} aria-label={isCollapsed ? 'Expand chapter' : 'Collapse chapter'}>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                {renaming === chapter.key ? (
                  <TextField
                    className="ghost-input"
                    value={chapter.title}
                    autoFocus
                    onSave={(title) => updateNode(chapter.id, { title })}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setRenaming(null)}
                    onBlurCapture={() => setRenaming(null)}
                  />
                ) : (
                  <span className="title" style={{ fontWeight: 600 }}>
                    {chapter.title}
                  </span>
                )}
                <ChangeMark node={chapter} />
                <span className="words-small">{words ? fmt(words) : ''}</span>
              </div>
              <div className="row-actions">
                <button className="icon-btn" onClick={() => newScene(chapter.key)} aria-label="Add scene" title="Add scene">
                  <Plus size={14} />
                </button>
                <button className="icon-btn" onClick={() => moveNode(chapter.id, -1)} aria-label="Move up" title="Move up">
                  <ArrowUp size={14} />
                </button>
                <button className="icon-btn" onClick={() => moveNode(chapter.id, 1)} aria-label="Move down" title="Move down">
                  <ArrowDown size={14} />
                </button>
                <button className="icon-btn" onClick={() => remove(chapter, `“${chapter.title}” and its scenes`, words)} aria-label="Delete chapter" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {!isCollapsed &&
              scenes.map((scene) => (
                <div key={scene.key} className="binder-row scene-row">
                  <a className={`nav-item ${activeScene === scene.key ? 'active' : ''}`} href={href.scene(projectId, scene.key)} title={scene.synopsis || scene.title}>
                    <span className={`status-dot ${scene.wordCount > 0 ? 'drafted' : ''}`} />
                    <span className="title">{scene.title}</span>
                    <ChangeMark node={scene} />
                    <span className="words-small">{scene.wordCount ? fmt(scene.wordCount) : ''}</span>
                  </a>
                  <div className="row-actions">
                    <button className="icon-btn" onClick={() => moveNode(scene.id, -1)} aria-label="Move up" title="Move up">
                      <ArrowUp size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => moveNode(scene.id, 1)} aria-label="Move down" title="Move down">
                      <ArrowDown size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => remove(scene, `“${scene.title}”`, scene.wordCount)} aria-label="Delete scene" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            {!isCollapsed && scenes.length === 0 && (
              <button className="nav-item ghost-input" style={{ paddingLeft: 30, color: 'var(--ink-soft)' }} onClick={() => newScene(chapter.key)}>
                <Plus size={14} /> Add a scene
              </button>
            )}
          </div>
        )
      })}

      <div className="section-label">Notebook</div>
      {SIDEBAR_KINDS.map((kind) => {
        const meta = KIND_META[kind]
        const Icon = meta.icon
        const active = route.view === 'notes' && route.kind === kind
        const n = counts[kind] ?? 0
        return (
          <a key={kind} className={`nav-item ${active ? 'active' : ''}`} href={href.notes(projectId, kind)}>
            <Icon size={16} /> {meta.plural}
            {n > 0 && <span className={`count ${kind === 'inbox' ? 'warm' : ''}`}>{n}</span>}
          </a>
        )
      })}

      <SidebarFoot projectId={projectId} />
    </>
  )
}

/** A small mark on chapters and scenes this what-if changes or adds. */
function ChangeMark({ node }: { node: Placed }) {
  if (!node.change) return null
  return (
    <span className={`change-mark ${node.change}`} title={node.change === 'new' ? 'New in this what-if' : 'Changed in this what-if'}>
      {node.change === 'new' ? '+' : '•'}
    </span>
  )
}

function LibrarySidebar({ route }: { route: Route }) {
  const projects = useProjects() ?? []
  const counts = useNoteCounts(null) ?? {}
  return (
    <>
      <div className="sidebar-head">
        <a className="sidebar-title" href={href.shelf()} style={{ fontSize: 20 }}>
          Scribble
        </a>
      </div>
      <a className={`nav-item ${route.view === 'shelf' ? 'active' : ''}`} href={href.shelf()}>
        <Library size={16} /> All stories
      </a>
      {projects.length > 0 && <div className="section-label">Stories</div>}
      {projects.map((p) => (
        <a key={p.id} className="nav-item" href={href.desk(p.id)}>
          <BookOpen size={16} /> <span className="title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
        </a>
      ))}
      <div className="section-label">Library</div>
      {SIDEBAR_KINDS.map((kind) => {
        const meta = KIND_META[kind]
        const Icon = meta.icon
        const active = route.view === 'notes' && route.kind === kind
        const n = counts[kind] ?? 0
        return (
          <a key={kind} className={`nav-item ${active ? 'active' : ''}`} href={href.notes(null, kind)}>
            <Icon size={16} /> {meta.libraryPlural}
            {n > 0 && <span className={`count ${kind === 'inbox' ? 'warm' : ''}`}>{n}</span>}
          </a>
        )
      })}
      <SidebarFoot projectId={null} />
    </>
  )
}

function SidebarFoot({ projectId }: { projectId: string | null }) {
  return (
    <div className="sidebar-foot">
      <button className="icon-btn" onClick={() => openImport({ projectId })} aria-label="Import" title="Import">
        <Download size={17} />
      </button>
      <a className="icon-btn" href={href.settings()} aria-label="Settings" title="Settings">
        <Settings size={17} />
      </a>
      <ZoomControl />
      <span style={{ flex: 1 }} />
      <SyncPill />
    </div>
  )
}

/** The magnifying glass: makes the whole app bigger or smaller on this device. */
function ZoomControl() {
  const { zoom } = usePrefs()
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

  const i = ZOOMS.indexOf(zoom)
  const step = (by: number) => {
    // A zoom saved before the steps changed snaps to the nearest one.
    const at = i >= 0 ? i : ZOOMS.findIndex((z) => z >= zoom)
    const next = Math.min(ZOOMS.length - 1, Math.max(0, (at < 0 ? ZOOMS.length - 1 : at) + by))
    setPrefs({ zoom: ZOOMS[next] })
  }
  const pct = `${Math.round(zoom * 100)}%`

  return (
    <div className="zoom" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label={`Zoom (${pct})`} aria-expanded={open} title={`Zoom: ${pct}`}>
        <Search size={17} />
      </button>
      {open && (
        <div className="zoom-pop" role="group" aria-label="Zoom">
          <button className="icon-btn" onClick={() => step(-1)} disabled={zoom <= ZOOMS[0]} aria-label="Zoom out" title="Smaller">
            <Minus size={16} />
          </button>
          <button className="zoom-level" onClick={() => setPrefs({ zoom: 1 })} title="Back to 100%">
            {pct}
          </button>
          <button className="icon-btn" onClick={() => step(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in" title="Bigger">
            <Plus size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
