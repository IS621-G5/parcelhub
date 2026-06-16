import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { useModalA11y } from '../useModalA11y.js'
import NotificationBell from './NotificationBell.jsx'
import ConfirmRateModal from './ConfirmRateModal.jsx'
import LinkedAccountsModal from './LinkedAccountsModal.jsx'
import ParcelDetailModal from './ParcelDetailModal.jsx'

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

// Make a non-button element behave like a button for keyboard users.
function clickable(handler) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: handler,
    onKeyDown: e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler() }
    },
  }
}

const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'attention',  label: 'Needs attention' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered',  label: 'Delivered' },
]

export default function Dashboard({ user, onLogout, oauthFeedback, onClearOAuthFeedback }) {
  const [parcels, setParcels] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  // Sprint 2 — US2.8 / US4.2 / US2.9.x
  const [rateModal, setRateModal] = useState(null)   // { parcelId, notificationId?, parcel }
  const [showLinked, setShowLinked] = useState(false)
  const [linkedCount, setLinkedCount] = useState(0)
  const [linkedProviders, setLinkedProviders] = useState([])
  const [bellKey, setBellKey] = useState(0)          // bumps to force NotificationBell refresh
  const [detailParcel, setDetailParcel] = useState(null)   // US2.4 detail view

  async function reload() {
    setLoading(true)
    try {
      const [list, linked] = await Promise.all([
        api.parcels.list(),
        api.linked.list().catch(() => []),
      ])
      setParcels(list)
      const active = (linked || []).filter(a => a.status !== 'deleted')
      setLinkedCount(active.length)
      setLinkedProviders(active.map(a => a.provider))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  // After a successful OAuth connect, refresh parcels so the new imports show up
  useEffect(() => {
    if (oauthFeedback?.type === 'success') reload()
  }, [oauthFeedback])

  async function onMockDeliver(parcelId) {
    try {
      await api.parcels.mockDeliver(parcelId)
      await reload()
      setBellKey(k => k + 1)
    } catch (err) {
      alert('Mock deliver failed: ' + (err.data?.error || err.message))
    }
  }

  function onRateRequested(p) {
    setRateModal({ parcelId: p.id, parcel: p })
  }

  function onRateSubmitted() {
    setRateModal(null)
    reload()
    setBellKey(k => k + 1)
  }

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
          <NotificationBell
            refreshKey={bellKey}
            onOpenRate={({ parcelId, parcel }) => setRateModal({ parcelId, parcel })}
          />
          <div className="divider" />
          <button className="btn-ghost" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="dash-main">
        {oauthFeedback && (
          <div className={`oauth-toast ${oauthFeedback.type}`}>
            <span className="toast-icon">{oauthFeedback.type === 'success' ? '✓' : '⚠️'}</span>
            <span>{oauthFeedback.message}</span>
            <button className="toast-close" onClick={onClearOAuthFeedback} aria-label="Dismiss">✕</button>
          </div>
        )}

        {/* Anomaly hero — anomaly-first vision rendered as a top-of-page alert.
            Only renders when there are parcels that need attention; otherwise
            the dashboard stays clean. */}
        {!loading && attentionCount > 0 && filter !== 'attention' && (
          <div className="anomaly-banner">
            <div className="anomaly-icon">!</div>
            <div className="anomaly-body">
              <div className="anomaly-title">
                {attentionCount} parcel{attentionCount === 1 ? '' : 's'} need{attentionCount === 1 ? 's' : ''} your attention
              </div>
              <div className="anomaly-sub">
                {counts.exception > 0 && <>{counts.exception} exception · </>}
                {counts.stuck > 0 && <>{counts.stuck} stuck </>}
                — surfaced first so you can act on what's actually slipping.
              </div>
            </div>
            <button className="anomaly-cta" onClick={() => setFilter('attention')}>
              View →
            </button>
          </div>
        )}

        {/* Quick action cards */}
        <div className="quick-cards">
          <div className="quick-card dark" aria-label="Add a parcel" {...clickable(() => setShowAdd(true))}>
            <div className="qc-icon">📦</div>
            <div className="qc-title">Add a parcel</div>
            <div className="qc-sub">Track a new shipment by tracking number</div>
            <div className="qc-cta">+ Add now</div>
          </div>
          <div className="quick-card light" aria-label="Linked accounts" {...clickable(() => setShowLinked(true))}>
            <div className="qc-icon">🔗</div>
            <div className="qc-title">Linked accounts</div>
            <div className="qc-sub">
              {linkedCount === 0
                ? <><strong>0 of 2</strong> connected · connect Shopee or Lazada to import orders</>
                : <><strong>{linkedCount} of 2</strong> connected · Shopee &amp; Lazada auto-import</>}
            </div>
            <div className="linked-card-logos">
              <div className={'mini ' + (linkedProviders.includes('shopee') ? 'shopee' : 'placeholder')}>
                {linkedProviders.includes('shopee') ? 'S' : ''}
              </div>
              <div className={'mini ' + (linkedProviders.includes('lazada') ? 'lazada' : 'placeholder')}>
                {linkedProviders.includes('lazada') ? 'L' : ''}
              </div>
            </div>
            <div className="qc-cta">{linkedCount === 0 ? '+ Connect' : 'Manage'}</div>
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
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <EmptyState filter={filter} onAdd={() => setShowAdd(true)} onConnect={() => setShowLinked(true)} />
        ) : (
          <div>
            {groups.map(g => (
              <div key={g.key}>
                <div className="section-head">{g.label}</div>
                <div className="parcel-list">
                  {g.list.map(p => (
                    <ParcelRow
                      key={p.id}
                      p={p}
                      onMockDeliver={() => onMockDeliver(p.id)}
                      onRate={() => onRateRequested(p)}
                      onOpen={() => setDetailParcel(p)}
                    />
                  ))}
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

      {rateModal && (
        <ConfirmRateModal
          parcelId={rateModal.parcelId}
          parcel={rateModal.parcel}
          onClose={() => setRateModal(null)}
          onSubmitted={onRateSubmitted}
        />
      )}

      {detailParcel && (
        <ParcelDetailModal
          parcel={detailParcel}
          onClose={() => setDetailParcel(null)}
          onChanged={(updated) => {
            setDetailParcel(updated)
            reload()
            setBellKey(k => k + 1)
          }}
          onDeleted={(id) => {
            setParcels(prev => prev.filter(x => x.id !== id))
            setDetailParcel(null)
          }}
        />
      )}

      {showLinked && (
        <LinkedAccountsModal
          onClose={() => setShowLinked(false)}
          onChanged={reload}
        />
      )}
    </div>
  )
}

function ParcelRow({ p, onMockDeliver, onRate, onOpen }) {
  const cfg = configFor(p.status)
  const when = relativeTime(p.created_at)
  const isDelivered = p.status === 'delivered'
  return (
    <div className={'parcel ' + cfg.rowMod} style={{ cursor: 'pointer' }}
         aria-label={`Open ${p.label || p.tracking_number}`} {...clickable(onOpen)}>
      <div className={'parcel-avatar ' + providerKey(p.provider)} title={p.provider}>
        {providerInitial(p.provider)}
      </div>
      <div className="parcel-main">
        <div className="parcel-row1">
          <span className="parcel-label">{p.label || p.tracking_number}</span>
          <span className={'pill ' + cfg.pill}>{cfg.pillLabel}</span>
          {p.rating_stars && (
            <span className="parcel-rating-display" title={`Rated ${p.rating_stars}/5`}>
              {[1,2,3,4,5].map(n => (
                <span key={n} className={'star-mini ' + (n <= p.rating_stars ? '' : 'off')}>★</span>
              ))}
            </span>
          )}
        </div>
        <div className="parcel-meta">
          {p.provider} · {p.tracking_number}
        </div>
      </div>
      <div className="parcel-actions" onClick={e => e.stopPropagation()}>
        {isDelivered ? (
          <button className="row-btn row-btn-primary" onClick={onRate} title="Rate this delivery">
            ★ {p.rating_stars ? 'Edit rating' : 'Rate'}
          </button>
        ) : (
          <button className="row-btn" onClick={onMockDeliver} title="Demo helper — simulates a courier delivery webhook (normally fired by the provider)">
            Simulate delivery
          </button>
        )}
        <span className="parcel-time">{when}</span>
      </div>
    </div>
  )
}

function providerKey(provider) {
  if (!provider) return 'default'
  return provider.toLowerCase().replace(/\s+/g, '-')
}
function providerInitial(provider) {
  if (!provider) return '?'
  // "DHL" → DHL, "Ninja Van" → NV, "Shopee" → S, "Lazada" → L, "SingPost" → SP
  const compact = provider.replace(/[a-z]/g, '').replace(/[^A-Z]/g, '')
  if (compact.length >= 2) return compact.slice(0, 2)
  return provider[0].toUpperCase()
}

// Loading skeleton — 4 shimmer rows matching real parcel-row layout.
function SkeletonList() {
  return (
    <>
      <div className="section-head" style={{ visibility: 'hidden' }}>Loading</div>
      <div className="skeleton-list">
        {[1,2,3,4].map(i => (
          <div className="skeleton-row" key={i}>
            <div className="skeleton-block avatar" />
            <div className="skeleton-stack">
              <div className="skeleton-block line w70" />
              <div className="skeleton-block line w40" />
            </div>
            <div className="skeleton-block pill" />
          </div>
        ))}
      </div>
    </>
  )
}

// Empty state — different messaging per filter, with a subtle SVG illustration.
function EmptyState({ filter, onAdd, onConnect }) {
  const copy = filter === 'attention'
    ? { title: 'Nothing needs attention', body: 'All your parcels are either in transit or delivered. Nice.', cta: null }
    : filter === 'delivered'
    ? { title: 'No deliveries yet', body: 'Once parcels are delivered they\'ll show up here.', cta: null }
    : filter === 'in_transit'
    ? { title: 'No parcels in transit', body: 'Add a tracking number or connect a Shopee / Lazada account to start.', cta: 'Add a parcel', connect: true }
    : { title: 'No parcels yet', body: 'Track a parcel manually, or connect a shop to auto-import your orders.', cta: 'Add your first parcel', connect: true }

  return (
    <div className="empty">
      <div className="empty-illustration">
        <svg viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Soft background blob */}
          <circle cx="44" cy="44" r="40" fill="url(#blob-grad)" opacity="0.5" />
          <defs>
            <linearGradient id="blob-grad" x1="0" y1="0" x2="88" y2="88">
              <stop offset="0%"   stopColor="#E0E7FF" />
              <stop offset="100%" stopColor="#F1F5F9" />
            </linearGradient>
          </defs>
          {/* Parcel box */}
          <g transform="translate(20 24)">
            <path d="M0 14 L24 0 L48 14 L48 38 L24 52 L0 38 Z" fill="white" stroke="#CBD5E1" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M0 14 L24 28 L48 14" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M24 28 L24 52" stroke="#CBD5E1" strokeWidth="1.5" />
            {/* Label */}
            <rect x="10" y="32" width="14" height="4" rx="1" fill="#6366F1" opacity="0.4" />
            <rect x="10" y="38" width="10" height="3" rx="1" fill="#6366F1" opacity="0.25" />
          </g>
        </svg>
      </div>
      <h3>{copy.title}</h3>
      <p>{copy.body}</p>
      {(copy.cta || copy.connect) && (
        <div className="empty-actions">
          {copy.cta && <button className="btn-primary" onClick={onAdd}>{copy.cta}</button>}
          {copy.connect && <button className="btn-secondary" onClick={onConnect}>Connect account</button>}
        </div>
      )}
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
  const modalRef = useRef(null)
  useModalA11y(modalRef, onClose)

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
      <form className="modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Add a parcel"
            onClick={e => e.stopPropagation()} onSubmit={submit}>
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
