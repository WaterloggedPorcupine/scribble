import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { beginSignIn } from '../lib/google/auth'
import { syncNow, useSyncStatus } from '../lib/sync'
import { timeAgo } from '../lib/words'

export function SyncPill() {
  const s = useSyncStatus()
  if (s.state === 'off') return null
  if (s.state === 'needs-auth')
    return (
      <button className="pill warn" onClick={() => beginSignIn()} title="Your Google session expired. Your writing is safe on this device.">
        <CloudOff size={13} /> Reconnect
      </button>
    )
  if (s.state === 'offline')
    return (
      <span className="pill" title="Saved on this device. Syncs when you’re back online.">
        <CloudOff size={13} /> Offline
      </span>
    )
  if (s.state === 'syncing')
    return (
      <span className="pill">
        <RefreshCw size={13} /> Syncing
      </span>
    )
  if (s.state === 'error')
    return (
      <button className="pill warn" onClick={() => void syncNow()} title={s.message}>
        <CloudOff size={13} /> Sync failed · retry
      </button>
    )
  return (
    <button className="pill" onClick={() => void syncNow()} title="Sync now">
      <Cloud size={13} /> {s.lastSyncedAt ? `Synced ${timeAgo(s.lastSyncedAt)}` : 'Synced'}
    </button>
  )
}
