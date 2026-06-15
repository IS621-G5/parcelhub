import { useState } from 'react'
import { api } from '../api.js'

// US2.4 — View parcel details + simulated shipment tracking events.
// US2.6 — Soft-delete a parcel from the detail view.
//
// NOTE: tracking events below are SIMULATED demo data derived
// deterministically from the parcel's status + id. ParcelHub's MVP does
// not integrate a live courier tracking API (that requires per-courier
// partner credentials). The event stream mirrors the shape of a real
// DHL / Ninja Van tracking page so the UX is representative.

const SG_LOCATIONS = [
  'Changi Airfreight Centre, Singapore',
  'Jurong Distribution Hub, Singapore',
  'Tampines Sorting Facility, Singapore',
  'Woodlands Regional Hub, Singapore',
  'Singapore Distribution Center',
]

// How many lifecycle stages a status implies (drives how many events show).
function stageForStatus(status) {
  switch (status) {
    case 'pending':          return 1
    case 'in_transit':       return 2
    case 'stuck':            return 2
    case 'exception':        return 2
    case 'out_for_delivery': return 3
    case 'delivered':        return 4
    default:                 return 1
  }
}

// Deterministic pseudo-random from an integer seed (so events are stable
// for a given parcel and don't reshuffle on every render).
function seeded(seed) {
  let x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function pickLocation(seed, offset) {
  const idx = Math.floor(seeded(seed + offset) * SG_LOCATIONS.length)
  return SG_LOCATIONS[idx]
}

// Build the event stream (newest first) for a parcel.
function buildEvents(parcel) {
  const stage = stageForStatus(parcel.status)
  const isProblem = parcel.status === 'exception' || parcel.status === 'stuck'
  const base = parcel.created_at
    ? new Date(parcel.created_at + (parcel.created_at.includes('Z') ? '' : 'Z')).getTime()
    : Date.now() - 1000 * 60 * 60 * 72
  const seed = (parcel.id || 1) * 7

  // hours after `base` for each lifecycle step
  const steps = [
    { key: 'received',   hrs: 0,  title: 'Tracking started',          loc: 'ParcelHub',                     done: true },
    { key: 'transit',    hrs: 8,  title: 'In transit',                loc: pickLocation(seed, 1),           done: stage >= 2 },
    { key: 'out',        hrs: 30, title: 'Out for delivery',          loc: pickLocation(seed, 2),           done: stage >= 3 },
    { key: 'delivered',  hrs: 36, title: 'Delivered',                 loc: pickLocation(seed, 3),           done: stage >= 4 },
  ]

  let events = steps
    .filter(s => s.done)
    .map(s => ({
      title: s.title,
      location: s.loc,
      at: new Date(base + s.hrs * 3600 * 1000),
    }))

  // If the parcel is in a problem state, inject an alert as the latest event.
  if (isProblem) {
    events.push({
      title: parcel.status === 'stuck' ? 'Shipment delayed' : 'Delivery exception',
      location: pickLocation(seed, 4),
      at: new Date(base + 20 * 3600 * 1000),
      problem: true,
    })
  }

  // newest first
  return events.sort((a, b) => b.at - a.at)
}

function fmtEventTime(d) {
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  const isYest = d.toDateString() === yest.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Today ${time}`
  if (isYest)  return `Yesterday ${time}`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + (iso.includes('Z') ? '' : 'Z'))
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ParcelDetailModal({ parcel, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!parcel) return null

  const events = buildEvents(parcel)

  async function handleDelete() {
    setError('')
    setBusy(true)
    try {
      await api.parcels.remove(parcel.id)
      onDeleted?.(parcel.id)
      onClose?.()
    } catch (err) {
      setError('Could not delete this parcel. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div>
          <h2 style={{ margin: 0 }}>{parcel.label || parcel.tracking_number}</h2>
          <div style={{ fontSize: 13, color: 'var(--ink-3, #94A3B8)', marginTop: 2 }}>
            {parcel.provider} · {parcel.tracking_number}
          </div>
        </div>

        {/* Shipment activity */}
        <div style={{ margin: '22px 0 8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <span style={{
              fontSize: 11.5, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: 'var(--ink-3, #64748B)',
            }}>
              Shipment activity
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em',
              textTransform: 'uppercase', color: '#92651E',
              background: '#FEF9EC', border: '1px solid #FBE8B8',
              borderRadius: 999, padding: '2px 9px',
            }}>
              Demo data
            </span>
          </div>

          <div style={{ position: 'relative', paddingLeft: 4 }}>
            {events.map((ev, i) => {
              const isLatest = i === 0
              const isLast = i === events.length - 1
              const dotColor = ev.problem ? '#D97706' : isLatest ? '#4F46E5' : '#059669'
              return (
                <div key={i} style={{ position: 'relative', display: 'flex', gap: 14, paddingBottom: isLast ? 0 : 20 }}>
                  {!isLast && (
                    <span style={{
                      position: 'absolute', left: 7, top: 18, bottom: 0, width: 2,
                      background: '#E2E8F0',
                    }} />
                  )}
                  <span style={{
                    width: 16, height: 16, borderRadius: 999, flexShrink: 0, marginTop: 2,
                    background: dotColor,
                    boxShadow: isLatest ? `0 0 0 4px ${ev.problem ? '#FEF3C7' : '#E0E7FF'}` : 'none',
                    zIndex: 1,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline',
                    }}>
                      <span style={{
                        fontWeight: isLatest ? 700 : 600,
                        fontSize: 14.5,
                        color: ev.problem ? '#B45309' : '#0F172A',
                      }}>
                        {ev.problem && '⚠ '}{ev.title}
                      </span>
                      <span style={{ fontSize: 12, color: '#94A3B8', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {fmtEventTime(ev.at)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 2 }}>
                      {ev.location}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail fields */}
        <div style={{
          marginTop: 16, padding: '14px 16px',
          background: '#F8FAFC', border: '1px solid #E8EDF4', borderRadius: 10,
          fontSize: 13.5,
        }}>
          <DetailRow label="Tracking number" value={parcel.tracking_number} />
          <DetailRow label="Courier / provider" value={parcel.provider} />
          {parcel.notes && <DetailRow label="Notes" value={parcel.notes} />}
          {parcel.rating_stars && (
            <DetailRow label="Your rating" value={`${'★'.repeat(parcel.rating_stars)}${'☆'.repeat(5 - parcel.rating_stars)} (${parcel.rating_stars}/5)`} />
          )}
          <DetailRow label="Added" value={fmtDate(parcel.created_at)} last />
        </div>

        <div style={{ fontSize: 11, color: '#B0B8C4', marginTop: 10, lineHeight: 1.5 }}>
          Tracking events are simulated for the IS621 demo. ParcelHub's MVP
          does not integrate a live courier tracking API — that requires
          per-courier partner credentials and is noted in the project backlog.
        </div>

        {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

        {/* Actions */}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          {!confirmDelete ? (
            <>
              <button type="button" className="btn-ghost danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                Delete parcel
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 13.5, color: '#92400E', alignSelf: 'center' }}>
                Delete this parcel? This archives it.
              </span>
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn-primary" style={{ background: '#DC2626' }} onClick={handleDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Yes, delete'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 16,
      padding: '7px 0',
      borderBottom: last ? 'none' : '1px solid #EEF1F6',
    }}>
      <span style={{ color: '#64748B', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#0F172A', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}