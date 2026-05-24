import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'

// Status → visual config
const STATUS_CONFIG = {
  exception:   { pill: 'danger',  pillLabel: 'Exception',    rowMod: 'danger',  group: 'attention' },
  stuck:       { pill: 'warn',    pillLabel: 'Stuck',        rowMod: 'warn',    group: 'attention' },
  out_for_delivery: { pill: 'info', pillLabel: 'Out for delivery', rowMod: '', group: 'in_transit' },
  in_transit:  { pill: 'info',    pillLabel: 'In transit',   rowMod: '',        group: 'in_transit' },
  pending:     { pill: 'neutral', pillLabel: 'Pending',      rowMod: '',        group: 'in_transit' },
  delivered:   { pill: 'success', pillLabel: 'Delivered',    rowMod: 'delivered', group: 'delivered' },
}
function configFor(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.pending
}

const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'attention',  label: 'Needs attention' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered',  label: 'Delivered' },
]

export default function Dashboard({ user, onLogout }) {
  const [parcels, setParcels] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const list = await api.parcels.list()
      setParcels(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const counts = useMemo(() => {
    const c = { exception: 0, stuck: 0, in_transit: 0, delivered: 0, total: parcels.length }
    for (const p of parcels) {
      if (p.status === 'exception') c.exception++
      else if (p.status === 'stuck') c.stuck++
      else if (p.status === 'delivered') c.delivered++
      else c.in_transit++
    }
    return c
  }, [parcels])

  const attentionCount = counts.exception + counts.stuck

  const filtered = useMemo(() => {
    if (filter === 'all') return parcels
    return parcels.filter(p => configFor(p.status).group === filter)
  }, [parcels, filter])

  // Group by attention → in_transit → delivered, anomaly-first
  const groups = useMemo(() => {
    const buckets = { attention: [], in_transit: [], delivered: [] }
    for (const p of filtered) {
      buckets[configFor(p.status).group].push(p)
    }
    return [
      { key: 'attention',  label: 'Needs attention', list: buckets.attention },
      { key: 'in_transit', label: 'In transit',      list: buckets.in_transit },
      { key: 'delivered',  label: 'Delivered',       list: buckets.delivered },
    ].filter(g => g.list.length > 0)
  }, [filtered])

  return (
    <div className="dash">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">P</div>
          ParcelHub
        </div>
        <div className="topbar-right">
          <span className="user-email">{user.email}</span>
          <div className="divider" />
          <button className="btn-ghost" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="dash-main">
        {/* Quick action cards */}
        <div className="quick-cards">
          <div className="quick-card dark" onClick={() => setShowAdd(true)}>
            <div className="qc-icon">📦</div>
            <div className="qc-title">Add a parcel</div>
            <div className="qc-sub">Track a new shipment by tracking number</div>
            <div className="qc-cta">+ Add now</div>
          </div>
          <div className="quick-card light" style={{ cursor: 'default' }}>
            <div className="qc-icon">🔗</div>
            <div className="qc-title">Linked accounts</div>
            <div className="qc-sub">
              <strong>0 of 2</strong> connected · Shopee & Lazada auto-import
            </div>
            <div className="qc-sub" style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
              Coming in Sprint 3+
            </div>
          </div>
        </div>

        {/* Page head */}
        <div className="page-head">
          <div>
            <h1>My parcels</h1>
            <p className="muted">
              {attentionCount > 0
                ? <><strong>{attentionCount}</strong> need attention · {counts.total} total</>
                : <>{counts.total} total</>}
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="stat-row">
          <button className={'stat-card' + (counts.exception > 0 ? ' danger' : '')}
                  onClick={() => setFilter('attention')}>
            <div className="stat-label">Exception</div>
            <div className="stat-value">{counts.exception}</div>
          </button>
          <button className={'stat-card' + (counts.stuck > 0 ? ' warn' : '')}
                  onClick={() => setFilter('attention')}>
            <div className="stat-label">Stuck</div>
            <div className="stat-value">{counts.stuck}</div>
          </button>
          <button className="stat-card info"
                  onClick={() => setFilter('in_transit')}>
            <div className="stat-label">In transit</div>
            <div className="stat-value">{counts.in_transit}</div>
          </button>
          <button className="stat-card success"
                  onClick={() => setFilter('delivered')}>
            <div className="stat-label">Delivered</div>
            <div className="stat-value">{counts.delivered}</div>
          </button>
        </div>

        {/* Filter chips */}
        <div className="chips">
          {FILTERS.map(f => {
            const n =
              f.key === 'all'        ? counts.total :
              f.key === 'attention'  ? attentionCount :
              f.key === 'in_transit' ? counts.in_transit :
                                       counts.delivered
            return (
              <button key={f.key}
                      className={'chip' + (filter === f.key ? ' active' : '')}
                      onClick={() => setFilter(f.key)}>
                {f.label}<span className="count">({n})</span>
              </button>
            )
          })}
        </div>

        {/* Parcel list */}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <p>No parcels here yet.</p>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              Add your first parcel
            </button>
          </div>
        ) : (
          <div>
            {groups.map(g => (
              <div key={g.key}>
                <div className="section-head">{g.label}</div>
                <div className="parcel-list">
                  {g.list.map(p => <ParcelRow key={p.id} p={p} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showAdd && (
        <AddParcelModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); reload() }}
        />
      )}
    </div>
  )
}

function ParcelRow({ p }) {
  const cfg = configFor(p.status)
  const when = relativeTime(p.created_at)
  return (
    <div className={'parcel ' + cfg.rowMod}>
      <div className="parcel-main">
        <div className="parcel-row1">
          <span className="parcel-label">{p.label || p.tracking_number}</span>
          <span className={'pill ' + cfg.pill}>{cfg.pillLabel}</span>
        </div>
        <div className="parcel-meta">
          {p.provider} · {p.tracking_number}
        </div>
      </div>
      <div className="parcel-time">{when}</div>
    </div>
  )
}

function relativeTime(isoUtc) {
  const t = new Date(isoUtc + 'Z').getTime()
  if (!t) return ''
  const diff = Date.now() - t
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(t).toLocaleDateString()
}

function AddParcelModal({ onClose, onCreated }) {
  const [tracking, setTracking] = useState('')
  const [provider, setProvider] = useState('DHL')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.parcels.create(tracking, provider, label)
      onCreated()
    } catch (err) {
      if (err.status === 400)      setError('Invalid input. Tracking number must be 6–30 characters.')
      else if (err.status === 409) setError('You already have a parcel with that tracking number.')
      else                         setError('Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2>Add a parcel</h2>
        <p className="subtitle">Track a new shipment by tracking number.</p>

        <div className="field">
          <label htmlFor="tracking">Tracking number</label>
          <input
            id="tracking"
            value={tracking}
            onChange={e => setTracking(e.target.value)}
            required
            minLength={6}
            maxLength={30}
            placeholder="e.g. DHL123456"
          />
        </div>

        <div className="field">
          <label htmlFor="provider">Provider</label>
          <select id="provider" value={provider} onChange={e => setProvider(e.target.value)}>
            <option>DHL</option>
            <option>Ninja Van</option>
            <option>SingPost</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="label">Label (optional)</label>
          <input
            id="label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Birthday gift for Mum"
          />
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add parcel'}
          </button>
        </div>
      </form>
    </div>
  )
}
