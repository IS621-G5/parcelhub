import { getDb } from '../../db/index.js'

const PARCEL_COLS = 'id, tracking_number, provider, label, notes, status, archived, created_at, updated_at'

// List parcels for a user. By default excludes archived; pass {includeArchived:true} to include.
// Pass {onlyArchived:true} to list only archived (for the Archived filter view).
// LEFT JOINs ratings so the dashboard can display stars inline without a per-row fetch.
export function listParcelsForUser(userId, { includeArchived = false, onlyArchived = false } = {}) {
  let sql = `
    SELECT p.id, p.tracking_number, p.provider, p.label, p.notes, p.status,
           p.archived, p.created_at, p.updated_at,
           r.stars AS rating_stars,
           r.comment AS rating_comment,
           r.created_at AS rated_at
    FROM parcels p
    LEFT JOIN ratings r ON r.parcel_id = p.id AND r.user_id = p.user_id
    WHERE p.user_id = ?`
  if (onlyArchived) sql += ' AND p.archived = 1'
  else if (!includeArchived) sql += ' AND p.archived = 0'
  sql += ' ORDER BY p.created_at DESC'
  return getDb().prepare(sql).all(userId)
}

export function createParcel({ userId, tracking_number, provider, label, notes }) {
  const result = getDb().prepare(`
    INSERT INTO parcels (user_id, tracking_number, provider, label, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, tracking_number, provider, label || null, notes || null)
  return getDb().prepare(`SELECT ${PARCEL_COLS} FROM parcels WHERE id = ?`).get(result.lastInsertRowid)
}

// IDOR-safe lookup: returns the parcel only if it belongs to the given user.
export function findParcelForUser(parcelId, userId) {
  return getDb().prepare(`
    SELECT ${PARCEL_COLS} FROM parcels WHERE id = ? AND user_id = ?
  `).get(parcelId, userId)
}

export function existsForUser(userId, tracking_number) {
  const row = getDb().prepare(`
    SELECT 1 FROM parcels WHERE user_id = ? AND tracking_number = ?
  `).get(userId, tracking_number)
  return !!row
}

// Sprint 2: Update label and/or notes. Caller already verified ownership via findParcelForUser.
// Schema rejects unknown fields (.strict() in route layer), so this only writes safe columns.
export function updateParcel({ parcelId, userId, label, notes }) {
  // Build SET clause dynamically — only update fields that are provided
  const updates = []
  const values = []
  if (label !== undefined) { updates.push('label = ?'); values.push(label || null) }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes || null) }
  if (updates.length === 0) {
    // Nothing to update; return the existing row
    return findParcelForUser(parcelId, userId)
  }
  updates.push('updated_at = datetime(\'now\')')
  values.push(parcelId, userId)
  // WHERE user_id = ? is the IDOR guard — only owner can update.
  const result = getDb().prepare(`
    UPDATE parcels SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
  `).run(...values)
  if (result.changes === 0) return null  // not found or not owned
  return findParcelForUser(parcelId, userId)
}

// Sprint 2: Soft delete — sets archived = 1, never DELETE FROM.
export function archiveParcel({ parcelId, userId }) {
  const result = getDb().prepare(`
    UPDATE parcels SET archived = 1, updated_at = datetime('now')
    WHERE id = ? AND user_id = ? AND archived = 0
  `).run(parcelId, userId)
  return result.changes > 0
}

export function restoreParcel({ parcelId, userId }) {
  const result = getDb().prepare(`
    UPDATE parcels SET archived = 0, updated_at = datetime('now')
    WHERE id = ? AND user_id = ? AND archived = 1
  `).run(parcelId, userId)
  return result.changes > 0
}

// ──────────────────────────────────────────────────────────────────────
// Sprint 2 — US2.8 Delivery Confirmation + US4.2 Rate Delivery
// ──────────────────────────────────────────────────────────────────────

// Demo helper: simulate a courier-side delivery webhook. Sets status=delivered
// for an owned parcel. The route layer also fires a delivery notification on
// top of this. Idempotent: marking an already-delivered parcel as delivered
// is a no-op and returns the current row.
export function markParcelDelivered({ parcelId, userId }) {
  const db = getDb()
  const result = db.prepare(`
    UPDATE parcels
    SET status = 'delivered', updated_at = datetime('now')
    WHERE id = ? AND user_id = ? AND status != 'delivered'
  `).run(parcelId, userId)
  // changes=0 means either (a) parcel not found / not owned, or (b) already delivered.
  // Distinguish by checking ownership.
  if (result.changes === 0) {
    const existing = findParcelForUser(parcelId, userId)
    if (!existing) return { ok: false, reason: 'not_found' }
    return { ok: true, parcel: existing, alreadyDelivered: true }
  }
  return { ok: true, parcel: findParcelForUser(parcelId, userId), alreadyDelivered: false }
}

// Upsert a rating. Caller must verify the parcel is owned + delivered.
// SQLite UPSERT keyed on parcel_id's UNIQUE constraint.
export function upsertRating({ userId, parcelId, stars, comment }) {
  getDb().prepare(`
    INSERT INTO ratings (user_id, parcel_id, stars, comment)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(parcel_id) DO UPDATE SET
      stars = excluded.stars,
      comment = excluded.comment,
      updated_at = datetime('now')
  `).run(userId, parcelId, stars, comment || null)
  return getRatingForParcel(parcelId, userId)
}

export function getRatingForParcel(parcelId, userId) {
  return getDb().prepare(`
    SELECT id, parcel_id, stars, comment, created_at, updated_at
    FROM ratings
    WHERE parcel_id = ? AND user_id = ?
  `).get(parcelId, userId)
}
