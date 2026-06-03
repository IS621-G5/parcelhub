import { getDb } from '../../db/index.js'
import { randomBytes } from 'node:crypto'
import { findParcelForUser } from '../parcels/service.js'

const RETURN_COLS = `id, parcel_id, reason, return_method, return_tracking_number,
  status, created_at, updated_at`

// US2.7 — Initiate Return. Only allowed for parcels owned by user and in 'delivered' status.
export function initiateReturn({ userId, parcelId, reason, returnMethod }) {
  const parcel = findParcelForUser(parcelId, userId)
  if (!parcel) return { error: 'parcel_not_found' }
  if (parcel.status !== 'delivered') return { error: 'not_delivered' }

  // One active return per parcel
  const existing = getDb().prepare(`
    SELECT id FROM returns WHERE parcel_id = ? AND status NOT IN ('cancelled')
  `).get(parcelId)
  if (existing) return { error: 'return_already_initiated' }

  const trackingNumber = `RET${randomBytes(6).toString('hex').toUpperCase()}`
  const result = getDb().prepare(`
    INSERT INTO returns (user_id, parcel_id, reason, return_method, return_tracking_number)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, parcelId, reason, returnMethod, trackingNumber)

  return { ret: getDb().prepare(`
    SELECT ${RETURN_COLS} FROM returns WHERE id = ?
  `).get(result.lastInsertRowid) }
}

// US2.8 — List user's returns
export function listReturnsForUser(userId) {
  return getDb().prepare(`
    SELECT ${RETURN_COLS} FROM returns WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId)
}

// IDOR-safe
export function findReturnForUser(returnId, userId) {
  return getDb().prepare(`
    SELECT ${RETURN_COLS} FROM returns WHERE id = ? AND user_id = ?
  `).get(returnId, userId)
}

// Server-side only — used by mock courier polling to update return status.
// Not exposed via any user-facing endpoint.
export function updateReturnStatus({ returnId, status }) {
  const result = getDb().prepare(`
    UPDATE returns SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, returnId)
  return result.changes > 0
}
