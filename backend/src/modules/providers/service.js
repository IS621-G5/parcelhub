// Order import service — pulls a user's orders from a linked e-commerce
// account and creates parcels in ParcelHub. Idempotent: re-running import
// for the same provider does not duplicate parcels (uses tracking_number
// uniqueness).

import { getDb } from '../../db/index.js'
import { getAdapter } from './adapter.js'
import { getDecryptedAccessToken } from '../linked/service.js'

// Import recent orders from a linked account.
// Returns { imported: number, skipped: number, parcels: [...] }
export function importOrdersFromLinkedAccount({ userId, linkedAccountId, provider, sinceDays = 30 }) {
  // Get decrypted access token (server-side only — never leaves backend)
  const accessToken = getDecryptedAccessToken(linkedAccountId, userId)
  if (!accessToken) {
    return { error: 'linked_account_not_found_or_inactive' }
  }

  const adapter = getAdapter(provider)
  let orders
  try {
    orders = adapter.fetchRecentOrders(accessToken, sinceDays)
  } catch (err) {
    // Live API or mock failure — return structured error, do not throw
    return { error: 'provider_api_failed', details: err.message }
  }

  const db = getDb()
  const importedParcels = []
  let skippedNoTracking = 0
  let skippedDuplicate = 0

  for (const order of orders) {
    if (!order.tracking_number) {
      // Order placed but not shipped yet — no tracking number to follow.
      // Will be imported automatically once it ships and gets one.
      skippedNoTracking++
      continue
    }

    // Idempotency: skip if user already has this tracking number
    const existing = getDb().prepare(`
      SELECT id FROM parcels WHERE user_id = ? AND tracking_number = ?
    `).get(userId, order.tracking_number)
    if (existing) {
      skippedDuplicate++
      continue
    }

    const result = getDb().prepare(`
      INSERT INTO parcels (user_id, tracking_number, provider, label, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      userId,
      order.tracking_number,
      provider,
      order.label || null,
      order.status || 'in_transit',
    )
    importedParcels.push({
      id: result.lastInsertRowid,
      tracking_number: order.tracking_number,
      provider,
      label: order.label || null,
      status: order.status || 'in_transit',
    })
  }

  return {
    imported: importedParcels.length,
    skipped: skippedNoTracking + skippedDuplicate,   // keep total for backward-compat
    skipped_no_tracking: skippedNoTracking,
    skipped_duplicate: skippedDuplicate,
    parcels: importedParcels,
  }
}