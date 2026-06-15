// Order import service — pulls a user's orders from a linked e-commerce
// account and creates parcels in ParcelHub. Idempotent: re-running import
// for the same provider does not duplicate parcels (uses tracking_number
// uniqueness).

import { getDb } from '../../db/index.js'
import { getAdapter } from './adapter.js'
import { getDecryptedAccessToken, getLinkedAccount } from '../linked/service.js'

// Import recent orders from a linked account.
// Returns { imported: number, skipped: number, parcels: [...] }
// The provider is derived from the linked-account record (IDOR/owner-scoped),
// never trusted from the caller — so a Shopee account id can't be imported
// through a /lazada route and end up tagged or routed to the wrong adapter.
export function importOrdersFromLinkedAccount({ userId, linkedAccountId, sinceDays = 30 }) {
  const account = getLinkedAccount(linkedAccountId, userId)
  if (!account || account.status !== 'active') {
    return { error: 'linked_account_not_found_or_inactive' }
  }
  const provider = account.provider

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

    // Label: prefer the provider-supplied item summary (adapter Order contract
    // exposes `item_summary`, e.g. "Shopee — Wireless earphones"); fall back to
    // a generic label only when the provider gives us nothing meaningful.
    const label = order.item_summary
      || `${provider.charAt(0).toUpperCase()}${provider.slice(1)} order ${order.tracking_number}`
    const result = getDb().prepare(`
      INSERT INTO parcels (user_id, tracking_number, provider, label, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      userId,
      order.tracking_number,
      provider,
      label,
      'in_transit',
    )
    importedParcels.push({
      id: result.lastInsertRowid,
      tracking_number: order.tracking_number,
      provider,
      label,
      status: 'in_transit',
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