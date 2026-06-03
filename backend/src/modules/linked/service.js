import { getDb } from '../../db/index.js'
import { encryptToken, decryptToken } from '../security/tokenCrypto.js'

const SAFE_COLS = `id, user_id, provider, expires_at, connected_at, last_refreshed_at, status`

// US1.4 / US1.5 — Link a Shopee or Lazada account.
// Stores access and refresh tokens encrypted at rest.
// Mock OAuth: in production, accessToken/refreshToken come from the real
// provider's token endpoint after the user completes their OAuth flow.
export function linkAccount({ userId, provider, accessToken, refreshToken, expiresAt }) {
  const accessEnc = encryptToken(accessToken)
  const refreshEnc = encryptToken(refreshToken)
  const db = getDb()

  // Replace any existing link for (user, provider) — re-auth replaces tokens
  const existing = db.prepare(`
    SELECT id FROM linked_accounts WHERE user_id = ? AND provider = ?
  `).get(userId, provider)

  if (existing) {
    db.prepare(`
      UPDATE linked_accounts SET
        access_token_ciphertext = ?, access_token_iv = ?, access_token_tag = ?,
        refresh_token_ciphertext = ?, refresh_token_iv = ?, refresh_token_tag = ?,
        expires_at = ?, last_refreshed_at = datetime('now'), status = 'active'
      WHERE id = ?
    `).run(
      accessEnc.ciphertext, accessEnc.iv, accessEnc.tag,
      refreshEnc.ciphertext, refreshEnc.iv, refreshEnc.tag,
      expiresAt || null,
      existing.id,
    )
    return getLinkedAccount(existing.id, userId)
  }

  const result = db.prepare(`
    INSERT INTO linked_accounts
      (user_id, provider,
       access_token_ciphertext, access_token_iv, access_token_tag,
       refresh_token_ciphertext, refresh_token_iv, refresh_token_tag,
       expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, provider,
    accessEnc.ciphertext, accessEnc.iv, accessEnc.tag,
    refreshEnc.ciphertext, refreshEnc.iv, refreshEnc.tag,
    expiresAt || null,
  )
  return getLinkedAccount(result.lastInsertRowid, userId)
}

// List linked accounts (without tokens — tokens never returned to frontend)
export function listLinkedAccounts(userId) {
  return getDb().prepare(`
    SELECT ${SAFE_COLS} FROM linked_accounts WHERE user_id = ? AND status != 'deleted'
    ORDER BY connected_at DESC
  `).all(userId)
}

// IDOR-safe lookup. Returns SAFE fields only.
export function getLinkedAccount(id, userId) {
  return getDb().prepare(`
    SELECT ${SAFE_COLS} FROM linked_accounts WHERE id = ? AND user_id = ?
  `).get(id, userId)
}

// Internal — return decrypted access token. Only callable from server-side
// adapter code; NEVER exposed via any HTTP endpoint.
export function getDecryptedAccessToken(id, userId) {
  const row = getDb().prepare(`
    SELECT access_token_ciphertext, access_token_iv, access_token_tag
    FROM linked_accounts WHERE id = ? AND user_id = ? AND status = 'active'
  `).get(id, userId)
  if (!row) return null
  return decryptToken({
    ciphertext: row.access_token_ciphertext,
    iv: row.access_token_iv,
    tag: row.access_token_tag,
  })
}

// Disconnect — soft delete + revoke upstream (in real impl).
// IDOR-safe via WHERE user_id.
export function disconnectAccount({ id, userId }) {
  // In production: also call provider's revocation endpoint (Shopee/Lazada).
  // The local soft-delete + token zeroing here is the local guarantee.
  const result = getDb().prepare(`
    UPDATE linked_accounts SET
      status = 'deleted',
      access_token_ciphertext = X'00',
      access_token_iv = X'00',
      access_token_tag = X'00',
      refresh_token_ciphertext = X'00',
      refresh_token_iv = X'00',
      refresh_token_tag = X'00'
    WHERE id = ? AND user_id = ? AND status = 'active'
  `).run(id, userId)
  return result.changes > 0
}
