import { useState } from 'react'
import { api } from '../api.js'

// US2.4 — View parcel details + shipment status timeline.
// US2.6 — Soft-delete a parcel from the detail view.

// Ordered shipment lifecycle for the timeline. "Exception"/"stuck" are
// rendered as a problem state on top of the in-transit step.
const TIMELINE = [
  { key: 'pending',    label: 'Order received',  desc: 'Parcel registered in ParcelHub' },
  { key: 'in_transit', label: 'In transit',      desc: 'On its way through the courier network' },
  { key: 'out_for_delivery', label: 'Out for delivery', desc: 'With the courier for final delivery' },
  { key: 'delivered',  label: 'Delivered',       desc: 'Arrived at destination' },
]

// Map a parcel status to how far along the timeline it is (index reached).
function reachedIndex(status) {
  switch (status) {
    case 'pending':          return 0
    case 'in_transit':       return 1
    case 'stuck':            return 1   // stuck mid-transit
    case 'exception':        return 1   // problem mid-transit
    case 'out_for_delivery': return 2
    case 'delivered':        return 3
    default:                 return 0
  }
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

  const isProblem = parcel.status === 'exception' || parcel.status === 'stuck'
  const reached = reachedIndex(parcel.status)

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div>
            <h2 style={{ margin: 0 }}>{parcel.label || parcel.tracking_number}</h2>
            <div style={{ fontSize: 13, color: 'var(--ink-3, #94A3B8)', marginTop: 2 }}>
              {parcel.provider} · {parcel.tracking_number}
            </div>
          </div>
        </div>

        {/* Shipment timeline */}
        <div style={{ margin: '22px 0 8px' }}>
          <div style={{
            fontSize: 11.5, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: 'var(--ink-3, #64748B)', marginBottom: 16,
          }}>
            Shipment status
          </div>

          <div style={{ position: 'relative', paddingLeft: 8 }}>
            {TIMELINE.map((step, i) => {
              const done = i < reached
              const current = i === reached
              const isLast = i === TIMELINE.length - 1
              // colour: completed = green, current = brand (or amber if problem), future = grey
              const dotColor = done ? '#059669'
                : current ? (isProblem ? '#D97706' : '#4F46E5')
                : '#CBD5E1'
              const lineColor = i < reached ? '#059669' : '#E2E8F0'
              return (
                <div key={step.key} style={{ position: 'relative', display: 'flex', gap: 14, paddingBottom: isLast ? 0 : 22 }}>
                  {/* connector line */}
                  {!isLast && (
                    <span style={{
                      position: 'absolute', left: 9, top: 20, bottom: 0, width: 2,
                      background: lineColor,
                    }} />
                  )}
                  {/* dot */}
                  <span style={{
                    width: 20, height: 20, borderRadius: 999, flexShrink: 0,
                    background: dotColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 11, fontWeight: 700,
                    boxShadow: current ? `0 0 0 4px ${isProblem ? '#FEF3C7' : '#E0E7FF'}` : 'none',
                    zIndex: 1,
                  }}>
                    {done ? '✓' : current ? '●' : ''}
                  </span>
                  {/* text */}
                  <div style={{ paddingTop: 0 }}>
                    <div style={{
                      fontWeight: current ? 700 : 600,
                      fontSize: 14.5,
                      color: done || current ? '#0F172A' : '#94A3B8',
                    }}>
                      {step.label}
                      {current && isProblem && (
                        <span style={{ color: '#D97706', marginLeft: 8, fontSize: 13 }}>
                          ⚠ {parcel.status === 'stuck' ? 'Stuck' : 'Exception'}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 1 }}>
                      {current && isProblem
                        ? 'This shipment needs attention — contact the courier.'
                        : step.desc}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail fields */}
        <div style={{
          marginTop: 18, padding: '14px 16px',
          background: '#F8FAFC', border: '1px solid #E8EDF4', borderRadius: 10,
          fontSize: 13.5,
        }}>
          <DetailRow label="Tracking number" value={parcel.tracking_number} />
          <DetailRow label="Courier / provider" value={parcel.provider} />
          {parcel.notes && <DetailRow label="Notes" value={parcel.notes} />}
          {parcel.rating_stars && (
            <DetailRow label="Your rating" value={`${'★'.repeat(parcel.rating_stars)}${'☆'.repeat(5 - parcel.rating_stars)} (${parcel.rating_stars}/5)`} />
          )}
          <DetailRow label="Added" value={fmtDate(parcel.created_at)} />
          {parcel.updated_at && parcel.updated_at !== parcel.created_at && (
            <DetailRow label="Last updated" value={fmtDate(parcel.updated_at)} last />
          )}
        </div>

        {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

        {/* Actions */}
        <div className="modal-actions" style={{ marginTop: 18 }}>
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