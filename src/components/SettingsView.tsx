import { Minus, Plus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { exportBackup, restoreBackup } from '../lib/export'
import { beginSignIn, disconnect, googleConfigured, wasConnected } from '../lib/google/auth'
import { getDriveUser } from '../lib/google/drive'
import { FONTS, THEMES, setPrefs, stepZoom, usePrefs, ZOOMS, type Prefs } from '../lib/prefs'
import { href } from '../lib/router'
import { syncNow, useSyncStatus } from '../lib/sync'
import { timeAgo } from '../lib/words'
import { isDesktop } from '../platform'
import { Topbar } from './Topbar'
import { toast } from './ui'

declare const __APP_VERSION__: string

/** The next item in a list, wrapping round: clicking a value walks through its choices. */
function after<T>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length]
}

const PARAGRAPHS: { id: Prefs['paragraphs']; label: string }[] = [
  { id: 'spaced', label: 'Space between' },
  { id: 'indented', label: 'Indented, like a book' },
]

/**
 * Settings as two sheets of paper: on the left, a title page with a sample of your paper that
 * changes as you do; on the right, a form. Click a value to change it.
 */
export function SettingsView() {
  const prefs = usePrefs()
  const theme = THEMES.find((t) => t.id === prefs.theme) ?? THEMES[0]
  const font = FONTS.find((f) => f.id === prefs.font) ?? FONTS[0]
  const paragraphs = PARAGRAPHS.find((p) => p.id === prefs.paragraphs) ?? PARAGRAPHS[0]

  const onOff = (key: keyof Prefs, label: string, hint: string) => (
    <Row label={label} hint={hint}>
      <button className="val" onClick={() => setPrefs({ [key]: !prefs[key] })} aria-pressed={Boolean(prefs[key])} aria-label={`${label}: ${prefs[key] ? 'on' : 'off'}`}>
        {prefs[key] ? 'On' : 'Off'}
      </button>
    </Row>
  )

  return (
    <>
      <Topbar crumbs={[{ label: 'Scribble', href: href.shelf() }, { label: 'Settings' }]} />
      <div className="scroll desk-surface">
        <div className="form-desk">
          <section className="form-sheet intro-sheet">
            <header className="title-block">
              <h1 className="page-heading">Settings</h1>
              <p className="title-sub">
                Scribble {__APP_VERSION__} · {isDesktop ? 'desktop app' : 'on the web'}
              </p>
            </header>

            <div className="paper-sample writing" aria-label="A sample of your paper">
              <div className="sample-prose">
                <p>“You told me it was condemned.”</p>
                <p>She set the jar of buttons on the sill, where the light could find it, and waited for him to say something true.</p>
              </div>
            </div>

            <section className="card">
              <div className="card-title">On this device</div>
              <p className="hint">Settings stay on the device you set them on, so your phone can be dark while your laptop is light. Your stories sync; your settings don’t.</p>
              <p className="hint">Click any value on the right to change it.</p>
            </section>
          </section>

          <section className="form-sheet" aria-label="Settings">
            <section className="card">
              <div className="card-title">Paper</div>
              <Row label="Theme" hint="The paper you write on. Everything around it stays plain.">
                <button className="val" onClick={() => setPrefs({ theme: after(THEMES, theme).id })} aria-label={`Theme: ${theme.label}. Change`}>
                  <span className="paper-chip" style={{ background: theme.paper }} aria-hidden="true" />
                  {theme.label}
                </button>
              </Row>
              <Row label="Typeface">
                <button className="val" style={{ fontFamily: font.family, fontSize: 15 }} onClick={() => setPrefs({ font: after(FONTS, font).id })} aria-label={`Typeface: ${font.label}. Change`}>
                  {font.label}
                </button>
              </Row>
              <Row label="Text size">
                <Stepper label="Text size" value={`${prefs.fontSize} px`} onStep={(by) => setPrefs({ fontSize: clamp(prefs.fontSize + by, 14, 26) })} atMin={prefs.fontSize <= 14} atMax={prefs.fontSize >= 26} />
              </Row>
              <Row label="Line length" hint="How many characters fit on a line.">
                <Stepper label="Line length" value={`${prefs.measure} ch`} onStep={(by) => setPrefs({ measure: clamp(prefs.measure + by * 3, 45, 90) })} atMin={prefs.measure <= 45} atMax={prefs.measure >= 90} />
              </Row>
              <Row label="Line spacing">
                <Stepper
                  label="Line spacing"
                  value={prefs.leading.toFixed(2)}
                  onStep={(by) => setPrefs({ leading: Math.round(clamp(prefs.leading + by * 0.05, 1.3, 2.2) * 100) / 100 })}
                  atMin={prefs.leading <= 1.3}
                  atMax={prefs.leading >= 2.2}
                />
              </Row>
              <Row label="Paragraphs">
                <button className="val" onClick={() => setPrefs({ paragraphs: after(PARAGRAPHS, paragraphs).id })} aria-label={`Paragraphs: ${paragraphs.label}. Change`}>
                  {paragraphs.label}
                </button>
              </Row>
              {onOff('grain', 'Paper grain', 'A faint texture on the page.')}
              <Row label="Zoom" hint="Makes everything bigger or smaller, not just your writing.">
                <Stepper
                  label="Zoom"
                  value={`${Math.round(prefs.zoom * 100)}%`}
                  onStep={(by) => setPrefs({ zoom: stepZoom(prefs.zoom, by) })}
                  atMin={prefs.zoom <= ZOOMS[0]}
                  atMax={prefs.zoom >= ZOOMS[ZOOMS.length - 1]}
                />
              </Row>
            </section>

            <section className="card">
              <div className="card-title">While you write</div>
              {onOff('focusMode', 'Focus mode', 'Fade everything except the paragraph you’re in.')}
              {onOff('typewriter', 'Typewriter scrolling', 'Keep the line you’re writing near the middle of the screen.')}
              {onOff('highlightCharacters', 'Colour character names', 'Each character’s name shows in their colour, like code highlighting.')}
              {onOff('spellcheck', 'Spellcheck', 'Off by default while drafting, so red squiggles don’t pull you out.')}
            </section>

            <GoogleSection />

            <section className="card">
              <div className="card-title">Backup</div>
              <Row label="Download a backup">
                <button className="val" onClick={() => exportBackup()}>
                  Download ↓
                </button>
              </Row>
              <Row label="Restore from a backup">
                <label className="val">
                  Choose a file…
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      try {
                        await restoreBackup(file)
                        toast('Backup restored. Newer versions were kept.')
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'That backup couldn’t be read.')
                      }
                      e.target.value = ''
                    }}
                  />
                </label>
              </Row>
              <p className="hint footnote">* Everything lives on this device first. A backup is one file with every story and note, to keep anywhere.</p>
            </section>
          </section>
        </div>
      </div>
    </>
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/** One line of the form: what it is on the left, its value on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="form-row">
      <span className="form-label" title={hint}>
        {label}
      </span>
      <span className="form-value">{children}</span>
    </div>
  )
}

function Stepper({ label, value, onStep, atMin, atMax }: { label: string; value: string; onStep: (by: number) => void; atMin: boolean; atMax: boolean }) {
  return (
    <span className="stepper">
      <button className="icon-btn" onClick={() => onStep(-1)} disabled={atMin} aria-label={`${label}: smaller`}>
        <Minus size={14} />
      </button>
      <output aria-live="polite">{value}</output>
      <button className="icon-btn" onClick={() => onStep(1)} disabled={atMax} aria-label={`${label}: bigger`}>
        <Plus size={14} />
      </button>
    </span>
  )
}

function GoogleSection() {
  const prefs = usePrefs()
  const status = useSyncStatus()
  const [user, setUser] = useState<string | null>(null)
  const connected = wasConnected()

  useEffect(() => {
    if (connected)
      getDriveUser()
        .then((u) => setUser(u.emailAddress || u.displayName))
        .catch(() => setUser(null))
  }, [connected])

  const synced = status.state === 'syncing' ? 'Syncing now…' : 'lastSyncedAt' in status && status.lastSyncedAt ? `Synced ${timeAgo(status.lastSyncedAt)}` : 'Not synced yet'

  return (
    <section className="card">
      <div className="card-title">Google Drive</div>
      {!googleConfigured ? (
        <>
          <Row label="Google Drive">
            <span className="form-muted">Not set up</span>
          </Row>
          <p className="hint footnote">* Follow “Connect Google Drive” in the README to import from Drive and sync between your phone and laptop.</p>
        </>
      ) : !connected ? (
        <>
          <Row label="Google Drive">
            <button className="val" onClick={() => beginSignIn()}>
              Connect ↗
            </button>
          </Row>
          <p className="hint footnote">* Scribble only sees files you pick, plus its own private sync file.</p>
        </>
      ) : (
        <>
          <Row label="Account">
            <span>{user ?? 'Connected'}</span>
          </Row>
          <Row label="Sync" hint={status.state === 'error' ? `Last attempt failed: ${status.message}` : undefined}>
            {status.state === 'needs-auth' ? (
              <button className="val" onClick={() => beginSignIn()}>
                Session expired · Reconnect
              </button>
            ) : (
              <button className="val" onClick={() => void syncNow()}>
                {status.state === 'error' ? 'Failed · Try again' : `${synced} · Sync now`}
              </button>
            )}
          </Row>
          {!isDesktop && (
            <Row label="Reconnect automatically" hint="Google sign-ins last an hour. After that, Scribble quickly bounces through Google to keep syncing.">
              <button className="val" onClick={() => setPrefs({ autoReconnect: !prefs.autoReconnect })} aria-pressed={prefs.autoReconnect}>
                {prefs.autoReconnect ? 'On' : 'Off'}
              </button>
            </Row>
          )}
          <Row label="Disconnect">
            <button
              className="val"
              onClick={async () => {
                if (!confirm('Disconnect Google Drive? Your writing stays on this device and in your Drive.')) return
                await disconnect()
                await syncNow()
                toast('Disconnected.')
              }}
            >
              Disconnect
            </button>
          </Row>
        </>
      )}
    </section>
  )
}
