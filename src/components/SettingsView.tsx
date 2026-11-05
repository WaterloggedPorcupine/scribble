import { Download, HardDrive, Menu, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { exportBackup, restoreBackup } from '../lib/export'
import { beginSignIn, disconnect, googleConfigured, wasConnected } from '../lib/google/auth'
import { getDriveUser } from '../lib/google/drive'
import { FONTS, THEMES, setPrefs, usePrefs, type Prefs } from '../lib/prefs'
import { syncNow, useSyncStatus } from '../lib/sync'
import { timeAgo } from '../lib/words'
import { toast, useDrawer } from './ui'

export function SettingsView() {
  const prefs = usePrefs()
  const drawer = useDrawer()

  const toggle = (key: keyof Prefs, title: string, sub: string) => (
    <label className="toggle">
      <span>
        {title}
        <span className="hint" style={{ display: 'block' }}>
          {sub}
        </span>
      </span>
      <input type="checkbox" checked={Boolean(prefs[key])} onChange={(e) => setPrefs({ [key]: e.target.checked })} />
    </label>
  )

  return (
    <>
      <div className="topbar">
        <button className="icon-btn menu-btn" onClick={() => drawer.setOpen(true)} aria-label="Open menu">
          <Menu size={18} />
        </button>
        <div className="grow topbar-title">Settings</div>
      </div>
      <div className="scroll paper">
        <div className="content" style={{ maxWidth: 720 }}>
          <div className="card">
            <div className="card-title">Paper</div>
            <div className="theme-grid">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`theme-card ${prefs.theme === t.id ? 'on' : ''}`}
                  style={{ background: t.paper, color: t.ink }}
                  onClick={() => setPrefs({ theme: t.id })}
                  aria-pressed={prefs.theme === t.id}
                >
                  <div className="sample">
                    “You told me it was <span style={{ color: t.accent }}>condemned</span>.”
                  </div>
                  <div className="name">{t.label}</div>
                </button>
              ))}
            </div>

            <div className="field mt">
              <span className="label">Typeface</span>
              <div className="tabs" style={{ marginBottom: 0, flexWrap: 'wrap' }}>
                {FONTS.map((f) => (
                  <button key={f.id} className={prefs.font === f.id ? 'on' : ''} style={{ fontFamily: f.family, fontSize: 15 }} onClick={() => setPrefs({ font: f.id })}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="field">
              <span className="label">Text size</span>
              <span className="range-row">
                <input type="range" min={14} max={26} step={1} value={prefs.fontSize} onChange={(e) => setPrefs({ fontSize: Number(e.target.value) })} />
                <output>{prefs.fontSize}px</output>
              </span>
            </label>
            <label className="field">
              <span className="label">Line length</span>
              <span className="range-row">
                <input type="range" min={45} max={90} step={1} value={prefs.measure} onChange={(e) => setPrefs({ measure: Number(e.target.value) })} />
                <output>{prefs.measure} ch</output>
              </span>
            </label>
            <label className="field">
              <span className="label">Line spacing</span>
              <span className="range-row">
                <input type="range" min={1.3} max={2.2} step={0.05} value={prefs.leading} onChange={(e) => setPrefs({ leading: Number(e.target.value) })} />
                <output>{prefs.leading.toFixed(2)}</output>
              </span>
            </label>
            <div className="field">
              <span className="label">Paragraphs</span>
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button className={prefs.paragraphs === 'spaced' ? 'on' : ''} onClick={() => setPrefs({ paragraphs: 'spaced' })}>
                  Space between
                </button>
                <button className={prefs.paragraphs === 'indented' ? 'on' : ''} onClick={() => setPrefs({ paragraphs: 'indented' })}>
                  Indented, like a book
                </button>
              </div>
            </div>
            {toggle('grain', 'Paper grain', 'A faint texture on the page.')}
          </div>

          <div className="card">
            <div className="card-title">While you write</div>
            {toggle('focusMode', 'Focus mode', 'Fade everything except the paragraph you’re in.')}
            {toggle('typewriter', 'Typewriter scrolling', 'Keep the line you’re writing near the middle of the screen.')}
            {toggle('highlightCharacters', 'Colour character names', 'Each character’s name shows in their colour, like code highlighting.')}
            {toggle('spellcheck', 'Spellcheck', 'Off by default while drafting, so red squiggles don’t pull you out.')}
          </div>

          <GoogleCard />

          <div className="card">
            <div className="card-title">Backup</div>
            <p className="hint" style={{ fontSize: 13.5, marginTop: 0 }}>
              Everything lives on this device first. A backup file is a full copy of every story and note that you can keep anywhere.
            </p>
            <div className="row">
              <button className="btn" onClick={() => exportBackup()}>
                <Download size={15} /> Download backup
              </button>
              <label className="btn">
                <Upload size={15} /> Restore from backup
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
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function GoogleCard() {
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

  return (
    <div className="card">
      <div className="card-title">Google Drive</div>
      {!googleConfigured ? (
        <p className="hint" style={{ fontSize: 13.5, margin: 0 }}>
          Not set up yet. Follow <b>Connect Google Drive</b> in the README to import from Drive and sync between your phone and laptop.
        </p>
      ) : !connected ? (
        <>
          <p className="hint" style={{ fontSize: 13.5, marginTop: 0 }}>
            Connect to import stories from Drive and keep your phone and laptop in sync. Scribble only sees files you pick, plus its own private sync file.
          </p>
          <button className="btn btn-primary" onClick={() => beginSignIn()}>
            <HardDrive size={15} /> Connect Google Drive
          </button>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            Connected{user ? ` as ${user}` : ''}.{' '}
            <span className="hint">
              {status.state === 'syncing'
                ? 'Syncing now…'
                : 'lastSyncedAt' in status && status.lastSyncedAt
                  ? `Last synced ${timeAgo(status.lastSyncedAt)}.`
                  : ''}
              {status.state === 'error' ? ` Last attempt failed: ${status.message}` : ''}
              {status.state === 'needs-auth' ? ' Your Google session expired; reconnect to keep syncing.' : ''}
            </span>
          </p>
          <div className="row">
            {status.state === 'needs-auth' ? (
              <button className="btn btn-primary" onClick={() => beginSignIn()}>
                Reconnect
              </button>
            ) : (
              <button className="btn" onClick={() => void syncNow()}>
                <RefreshCw size={15} /> Sync now
              </button>
            )}
            <button
              className="btn btn-quiet"
              onClick={async () => {
                if (!confirm('Disconnect Google Drive? Your writing stays on this device and in your Drive.')) return
                await disconnect()
                await syncNow()
                toast('Disconnected.')
              }}
            >
              Disconnect
            </button>
          </div>
          <label className="toggle" style={{ borderBottom: 0, marginTop: 8 }}>
            <span>
              Reconnect automatically
              <span className="hint" style={{ display: 'block' }}>
                Google sign-ins last an hour. When you open Scribble after that, it quickly bounces through Google to keep syncing.
              </span>
            </span>
            <input type="checkbox" checked={prefs.autoReconnect} onChange={(e) => setPrefs({ autoReconnect: e.target.checked })} />
          </label>
        </>
      )}
    </div>
  )
}
