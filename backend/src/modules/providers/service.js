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
  let skipped = 0

  for (const order of orders) {
    if (!order.tracking_number) {
      // Order placed but no tracking yet — skip for now, will appear on next import
      skipped++
      continue
    }

    // Idempotency: skip if user already has this tracking number
    const existing = db.prepare(`
      SELECT id FROM parcels WHERE user_id = ? AND tracking_number = ?
    `).get(userId, order.tracking_number)
    if (existing) {
      skipped++
      continue
    }

    const result = db.prepare(`
      INSERT INTO parcels (user_id, tracking_number, provider, label, status)
      VALUES (?, ?, ?, ?, 'in_transit')
    `).run(
      userId,
      order.tracking_number,
      order.provider_courier,
      order.item_summary,
    )
    importedParcels.push({
      id: result.lastInsertRowid,
      tracking_number: order.tracking_number,
      provider: order.provider_courier,
      label: order.item_summary,
    })
  }

  return { imported: importedParcels.length, skipped, parcels: importedParcels }
}
