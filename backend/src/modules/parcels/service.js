import { getDb } from '../../db/index.js'

export function listParcelsForUser(userId) {
  return getDb().prepare(`
    SELECT id, tracking_number, provider, label, status, created_at
    FROM parcels WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId)
}

export function createParcel({ userId, tracking_number, provider, label }) {
  const result = getDb().prepare(`
    INSERT INTO parcels (user_id, tracking_number, provider, label)
    VALUES (?, ?, ?, ?)
  `).run(userId, tracking_number, provider, label || null)
  return getDb().prepare(`
    SELECT id, tracking_number, provider, label, status, created_at
    FROM parcels WHERE id = ?
  `).get(result.lastInsertRowid)
}

// IDOR-safe lookup: returns the parcel only if it belongs to the given user.
export function findParcelForUser(parcelId, userId) {
  return getDb().prepare(`
    SELECT id, tracking_number, provider, label, status, created_at
    FROM parcels WHERE id = ? AND user_id = ?
  `).get(parcelId, userId)
}

export function existsForUser(userId, tracking_number) {
  const row = getDb().prepare(`
    SELECT 1 FROM parcels WHERE user_id = ? AND tracking_number = ?
  `).get(userId, tracking_number)
  return !!row
}
