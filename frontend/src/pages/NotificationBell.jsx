import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

// Top-bar bell with unread badge + dropdown of recent notifications.
// Clicking a delivery_confirmation notification asks the parent to open the
// confirm-rate modal via onOpenRate({parcelId, notificationId}).
export default function NotificationBell({ onOpenRate, refreshKey }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const dropdownRef = useRef(null)

  async function refresh() {
    try {
      const [list, count] = await Promise.all([
        api.notifications.list(),
        api.notifications.unreadCount(),
      ])
      setItems(list)
      setUnread(count.count)
    } catch { /* user may not be authed yet */ }
  }

  // Refresh on mount and whenever parent bumps refreshKey (after rate / deliver)
  useEffect(() => { refresh() }, [refreshKey])
  // Poll every 15s in case courier webhooks fire while page is open
  useEffect(() => {
    const t = setInterval(refresh, 15_000)
    return () => clearInterval(t)
  }, [])

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function onItemClick(n) {
    if (n.type === 'delivery_confirmation' && n.parcel_id) {
      setOpen(false)
      onOpenRate({ parcelId: n.parcel_id, notificationId: n.id, parcel: {
        label: n.label, tracking_number: n.tracking_number, provider: n.provider,
      }})
    } else if (!n.read_at) {
      try { await api.notifications.markRead(n.id) } catch {}
      refresh()
    }
  }

  return (
    <div className="bell-wrap" ref={dropdownRef}>
      <button
        className="btn-ghost bell-btn"
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        title={unread > 0 ? `${unread} unread` : 'No new notifications'}
      >
        🔔
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-header">Notifications</div>
          {items.length === 0 ? (
            <div className="bell-empty">You're all caught up.</div>
          ) : (
            <ul className="bell-list">
              {items.map(n => (
                <li
                  key={n.id}
                  className={'bell-item' + (n.read_at ? ' read' : '')}
                  onClick={() => onItemClick(n)}
                >
                  <div className="bell-item-icon">📦</div>
                  <div className="bell-item-body">
                    <div className="bell-item-msg">{n.message}</div>
                    <div className="bell-item-meta">
                      {n.tracking_number ? `${n.provider} · ${n.tracking_number}` : ''}
                    </div>
                  </div>
                  {!n.read_at && <span className="bell-item-dot" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
