import { X } from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'

/**
 * A text field that keeps its own state while you type and saves shortly after you pause,
 * so live database updates never fight your cursor.
 */
export function TextField({
  value,
  onSave,
  multiline,
  className,
  delay = 400,
  ...rest
}: {
  value: string
  onSave: (v: string) => void
  multiline?: boolean
  className?: string
  delay?: number
} & Omit<InputHTMLAttributes<HTMLInputElement & HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<string | null>(null)
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (pending.current !== null) saveRef.current(pending.current)
    },
    [],
  )

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [draft, multiline])

  const change = (v: string) => {
    setDraft(v)
    pending.current = v
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      pending.current = null
      saveRef.current(v)
    }, delay)
  }
  const blur = () => {
    focused.current = false
    window.clearTimeout(timer.current)
    if (pending.current !== null) {
      saveRef.current(pending.current)
      pending.current = null
    }
  }

  if (multiline) {
    return (
      <textarea
        ref={areaRef}
        rows={2}
        className={className ?? 'textarea'}
        value={draft}
        onChange={(e) => change(e.target.value)}
        onFocus={() => (focused.current = true)}
        onBlur={blur}
        {...rest}
      />
    )
  }
  return (
    <input
      className={className ?? 'input'}
      value={draft}
      onChange={(e) => change(e.target.value)}
      onFocus={() => (focused.current = true)}
      onBlur={blur}
      {...rest}
    />
  )
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

// ── Toasts ──────────────────────────────────────────────────────────────

let toastMessage: string | null = null
let toastTimer: number | undefined
const toastListeners = new Set<() => void>()

export function toast(message: string) {
  toastMessage = message
  toastListeners.forEach((l) => l())
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastMessage = null
    toastListeners.forEach((l) => l())
  }, 3200)
}

export function ToastHost() {
  const message = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb)
      return () => toastListeners.delete(cb)
    },
    () => toastMessage,
  )
  return message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null
}

// ── Mobile drawer ───────────────────────────────────────────────────────

export const DrawerContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} })

export function useDrawer() {
  return useContext(DrawerContext)
}

const narrowQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)') : null

export function useIsNarrow() {
  return useSyncExternalStore(
    (cb) => {
      narrowQuery?.addEventListener('change', cb)
      return () => narrowQuery?.removeEventListener('change', cb)
    },
    () => narrowQuery?.matches ?? false,
  )
}
