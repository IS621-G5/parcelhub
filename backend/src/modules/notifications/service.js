import { getDb } from '../../db/index.js'

const DEFAULTS = {
  email_on_exception: 1, email_on_delivered: 0, email_on_returned: 1,
  inapp_on_exception: 1, inapp_on_delivered: 1, inapp_on_returned: 1,
}

export function getPrefs(userId) {
  const row = getDb().prepare(`
    SELECT * FROM notification_prefs WHERE user_id = ?
  `).get(userId)
  if (row) return row
  // First access — initialise with defaults
  getDb().prepare(`
    INSERT INTO notification_prefs (user_id) VALUES (?)
  `).run(userId)
  return { user_id: userId, ...DEFAULTS, updated_at: new Date().toISOString() }
}

export function updatePrefs(userId, updates) {
  // Ensure row exists
  getPrefs(userId)

  const allowed = Object.keys(DEFAULTS)
  const setParts = []
  const values = []
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      setParts.push(`${key} = ?`)
      values.push(updates[key] ? 1 : 0)
    }
  }
  if (setParts.length === 0) return getPrefs(userId)
  setParts.push("updated_at = datetime('now')")
  values.push(userId)

  getDb().prepare(`
    UPDATE notification_prefs SET ${setParts.join(', ')} WHERE user_id = ?
  `).run(...values)
  return getPrefs(userId)
}

// ──────────────────────────────────────────────────────────────────────
// Sprint 2 — In-app notification events.
// Separate from notification_prefs (which is just toggles).
// ──────────────────────────────────────────────────────────────────────

// Idempotent — the unique index on (user_id, parcel_id, type) prevents dupes,
// so re-running this for the same delivery returns the existing event silently.
export function createDeliveryNotification({ userId, parcelId, parcelLabel, provider }) {
  const labelText = parcelLabel || provider || 'Your parcel'
  const message = `${labelText} has been delivered — confirm receipt and rate the experience.`
  try {
    const result = getDb().prepare(`
      INSERT INTO notification_events (user_id, parcel_id, type, message)
      VALUES (?, ?, 'delivery_confirmation', ?)
    `).run(userId, parcelId, message)
    return { id: result.lastInsertRowid, created: true }
  } catch (err) {
    // UNIQUE violation — notification already exists for this parcel
    if (String(err.message).includes('UNIQUE')) return { created: false }
    throw err
  }
}

export function listEventsForUser(userId, { limit = 20 } = {}) {
  return getDb().prepare(`
    SELECT n.id, n.parcel_id, n.type, n.message, n.read_at, n.created_at,
           p.tracking_number, p.provider, p.status, p.label
    FROM notification_events n
    LEFT JOIN parcels p ON p.id = n.parcel_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT ?
  `).all(userId, limit)
}

export function countUnread(userId) {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS n FROM notification_events
    WHERE user_id = ? AND read_at IS NULL
  `).get(userId)
  return row.n
}

// Mark a notification read. Idempotent: marking an already-read notification
// is a success (returns true), not a 404. Returns false only when the row does
// not exist or is not owned by the user (IDOR-safe via the user_id predicate),
// which the route maps to 404.
export function markRead(notificationId, userId) {
  const db = getDb()
  const row = db.prepare(`
    SELECT read_at FROM notification_events WHERE id = ? AND user_id = ?
  `).get(notificationId, userId)
  if (!row) return false            // not found / not owned → 404
  if (row.read_at) return true      // already read → idempotent success
  db.prepare(`
    UPDATE notification_events
    SET read_at = datetime('now')
    WHERE id = ? AND user_id = ? AND read_at IS NULL
  `).run(notificationId, userId)
  return true
}

// Used by the rating flow to auto-mark the matching delivery notification read
// when the user submits their rating from the modal.
export function markDeliveryNotificationRead({ userId, parcelId }) {
  getDb().prepare(`
    UPDATE notification_events
    SET read_at = datetime('now')
    WHERE user_id = ? AND parcel_id = ? AND type = 'delivery_confirmation' AND read_at IS NULL
  `).run(userId, parcelId)
}

// Fire an in-app alert when a parcel enters a problem state (stuck/exception) —
// this is what makes the "anomaly-first" story show up in the bell + badge.
// One alert per parcel (dedup index); re-entering a problem state refreshes the
// message and re-opens it so the bell re-surfaces the latest issue.
export function createExceptionNotification({ userId, parcelId, status, parcelLabel, provider }) {
  const labelText = parcelLabel || provider || 'Your parcel'
  const message = status === 'stuck'
    ? `${labelText} looks stuck — no tracking movement for a while. Tap to review.`
    : `${labelText} hit a delivery exception — it needs your attention.`
  try {
    const result = getDb().prepare(`
      INSERT INTO notification_events (user_id, parcel_id, type, message)
      VALUES (?, ?, 'exception_alert', ?)
    `).run(userId, parcelId, message)
    return { id: result.lastInsertRowid, created: true }
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      getDb().prepare(`
        UPDATE notification_events
        SET message = ?, read_at = NULL, created_at = datetime('now')
        WHERE user_id = ? AND parcel_id = ? AND type = 'exception_alert'
      `).run(message, userId, parcelId)
      return { created: false, updated: true }
    }
    throw err
  }
}

// Resolve: when a parcel leaves the problem state, mark its exception alert read
// so the unread badge clears.
export function clearExceptionNotification({ userId, parcelId }) {
  getDb().prepare(`
    UPDATE notification_events
    SET read_at = datetime('now')
    WHERE user_id = ? AND parcel_id = ? AND type = 'exception_alert' AND read_at IS NULL
  `).run(userId, parcelId)
}
