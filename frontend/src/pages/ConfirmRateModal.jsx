import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useModalA11y } from '../useModalA11y.js'

// Reusable modal: collects 1-5 star rating + optional comment, submits via
// PUT /parcels/:id/rating. Same endpoint serves both US2.8 (from bell) and
// US4.2 (from parcel detail). If the parcel already has a rating, we
// pre-fill it (US4.2 edit flow).
export default function ConfirmRateModal({ parcelId, parcel, onClose, onSubmitted }) {
  const [stars, setStars] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const modalRef = useRef(null)
  useModalA11y(modalRef, onClose)

  // Pre-fill existing rating if any (edit flow). Silent if none.
  useEffect(() => {
    let cancelled = false
    api.parcels.getRating(parcelId)
      .then(r => {
        if (cancelled) return
        setStars(r.stars)
        setComment(r.comment || '')
      })
      .catch(() => { /* not rated yet — that's fine */ })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [parcelId])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (stars < 1) { setError('Please choose 1–5 stars.'); return }
    setBusy(true)
    try {
      await api.parcels.rate(parcelId, stars, comment || undefined)
      onSubmitted()
    } catch (err) {
      if (err.data?.error === 'not_delivered') setError('Only delivered parcels can be rated.')
      else if (err.status === 400)              setError('Invalid input.')
      else                                       setError('Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const display = hovered || stars

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Confirm delivery and rate"
            onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2>Confirm delivery &amp; rate</h2>
        <p className="subtitle">
          {parcel?.label || parcel?.tracking_number || 'Your parcel'} — how was the experience?
        </p>

        <div className="field">
          <label>Your rating</label>
          <div className="stars" onMouseLeave={() => setHovered(0)}>
            {[1,2,3,4,5].map(n => (
              <span
                key={n}
                className={'star ' + (n <= display ? 'on' : 'off')}
                onMouseEnter={() => setHovered(n)}
                onClick={() => setStars(n)}
                role="button"
                aria-label={`${n} stars`}
              >★</span>
            ))}
            <span className="stars-help">{display ? `${display}/5` : 'Tap to rate'}</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="rate-comment">Comment (optional)</label>
          <textarea
            id="rate-comment"
            rows={3}
            maxLength={500}
            placeholder="Anything to flag about the courier or condition?"
            value={comment}
            onChange={e => setComment(e.target.value)}
            disabled={busy}
          />
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !loaded}>
            {busy ? 'Saving…' : 'Confirm & submit'}
          </button>
        </div>
      </form>
    </div>
  )
}
