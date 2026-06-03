import { getDb } from '../../db/index.js'
import { randomBytes } from 'node:crypto'

const DRAFT_COLS = `id, recipient_name, recipient_phone, recipient_address,
  parcel_size, weight_kg, pickup_mode, selected_courier, status,
  confirm_token, created_parcel_id, created_at, updated_at`

// US3.1 — Create or update a Send Parcel draft.
export function createDraft({ userId, data }) {
  const result = getDb().prepare(`
    INSERT INTO send_drafts
      (user_id, recipient_name, recipient_phone, recipient_address,
       parcel_size, weight_kg, pickup_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    data.recipient_name || null,
    data.recipient_phone || null,
    data.recipient_address || null,
    data.parcel_size || null,
    data.weight_kg ?? null,
    data.pickup_mode || null,
  )
  return getDb().prepare(`
    SELECT ${DRAFT_COLS} FROM send_drafts WHERE id = ?
  `).get(result.lastInsertRowid)
}

// IDOR-safe.
export function findDraftForUser(draftId, userId) {
  return getDb().prepare(`
    SELECT ${DRAFT_COLS} FROM send_drafts WHERE id = ? AND user_id = ?
  `).get(draftId, userId)
}

// US3.2 — Update draft with selected courier after comparison step.
export function selectCourier({ draftId, userId, courier }) {
  const result = getDb().prepare(`
    UPDATE send_drafts SET selected_courier = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ? AND status = 'draft'
  `).run(courier, draftId, userId)
  if (result.changes === 0) return null
  return findDraftForUser(draftId, userId)
}

// US3.3 — Idempotent confirm.
// Uses confirm_token to detect double-submission. First confirm creates the
// parcel + sets status=confirmed; subsequent confirms with same token return
// the same parcel rather than creating duplicates.
export function confirmDraft({ draftId, userId, idempotencyToken }) {
  const db = getDb()
  const draft = findDraftForUser(draftId, userId)
  if (!draft) return { error: 'not_found' }
  if (!draft.selected_courier) return { error: 'no_courier_selected' }

  // Idempotency: if already confirmed with same token, return existing parcel
  if (draft.status === 'confirmed') {
    if (draft.confirm_token === idempotencyToken) {
      const parcel = db.prepare(`
        SELECT id, tracking_number, provider, label, status, archived, created_at
        FROM parcels WHERE id = ?
      `).get(draft.created_parcel_id)
      return { parcel, idempotent: true }
    }
    // Different token but already confirmed = client confusion, return existing
    // anyway with idempotent: false to flag the situation.
    const parcel = db.prepare(`
      SELECT id, tracking_number, provider, label, status, archived, created_at
      FROM parcels WHERE id = ?
    `).get(draft.created_parcel_id)
    return { parcel, idempotent: false, already_confirmed: true }
  }

  // First-time confirm: generate mock tracking number, create parcel,
  // link draft → parcel.
  const trackingNumber = `${prefixFor(draft.selected_courier)}${randomDigits(8)}`
  const parcelResult = db.prepare(`
    INSERT INTO parcels (user_id, tracking_number, provider, label, status, notes)
    VALUES (?, ?, ?, ?, 'in_transit', ?)
  `).run(
    userId,
    trackingNumber,
    draft.selected_courier,
    `Outgoing — ${draft.recipient_name || 'unnamed recipient'}`,
    `Auto-created from Send draft #${draftId}`,
  )

  db.prepare(`
    UPDATE send_drafts
    SET status = 'confirmed', confirm_token = ?, created_parcel_id = ?,
        updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(idempotencyToken, parcelResult.lastInsertRowid, draftId, userId)

  const parcel = db.prepare(`
    SELECT id, tracking_number, provider, label, status, archived, created_at
    FROM parcels WHERE id = ?
  `).get(parcelResult.lastInsertRowid)

  return { parcel, idempotent: false }
}

function prefixFor(courier) {
  if (courier === 'DHL') return 'DHL'
  if (courier === 'Ninja Van') return 'NV'
  if (courier === 'SingPost') return 'SP'
  return 'XX'
}

function randomDigits(n) {
  let s = ''
  while (s.length < n) s += randomBytes(8).readUInt32BE().toString()
  return s.slice(0, n)
}

// US3.2 — Get mock courier quotes. Server-side only; recipient address
// is NEVER returned to frontend in this response.
export function getCourierQuotes({ draftId, userId }) {
  const draft = findDraftForUser(draftId, userId)
  if (!draft) return null
  if (!draft.parcel_size || !draft.weight_kg) return null
  // Mocked prices — based on weight & size. Each adapter could throw
  // independently in real implementation; here all three succeed.
  const couriers = ['DHL', 'Ninja Van', 'SingPost']
  return couriers.map(name => mockQuote(name, draft.parcel_size, draft.weight_kg))
}

function mockQuote(name, size, weight) {
  // Trivial mock pricing — varies by courier so the UI has something to compare.
  const sizeFactor = { small: 1, medium: 1.5, large: 2.2 }[size] ?? 1
  const baseRate = { DHL: 4.8, 'Ninja Van': 3.6, SingPost: 3.2 }[name] ?? 4
  const price = +(baseRate * sizeFactor + 0.6 * weight).toFixed(2)
  const eta = { DHL: '1-2 days', 'Ninja Van': '2-3 days', SingPost: '2-4 days' }[name]
  return { courier: name, price_sgd: price, eta_estimate: eta }
}
