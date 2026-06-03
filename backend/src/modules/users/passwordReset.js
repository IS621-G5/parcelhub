// Sprint 1, US1.3 Forget Password — token lifecycle.
//
// - Raw token: 64 hex chars (32 random bytes from node:crypto)
// - Stored: SHA-256 hash only; DB leak does not yield usable tokens
// - 1 hour expiry, single-use (used_at marker)
// - Issuing a new token invalidates outstanding ones for the same user

import { randomBytes, createHash } from 'node:crypto'
import { getDb } from '../../db/index.js'

const TOKEN_BYTES = 32
const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

export function hashToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function createResetTokenForUser(userId) {
  const rawToken = randomBytes(TOKEN_BYTES).toString('hex')
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

  const db = getDb()
  // Supersede any outstanding tokens — a fresh request invalidates old ones,
  // so a phished old link cannot still be used after the user requests a new one.
  db.prepare(`
    UPDATE password_reset_tokens
    SET used_at = datetime('now')
    WHERE user_id = ? AND used_at IS NULL
  `).run(userId)

  db.prepare(`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, tokenHash, expiresAt)

  return rawToken
}

// Returns the user_id on success, or null on any failure
// (no such token / expired / already used). On success the token is marked used.
export function consumeResetToken(rawToken) {
  const tokenHash = hashToken(rawToken)
  const db = getDb()
  const row = db.prepare(`
    SELECT id, user_id, expires_at, used_at
    FROM password_reset_tokens
    WHERE token_hash = ?
  `).get(tokenHash)

  if (!row) return null
  if (row.used_at) return null
  if (new Date(row.expires_at) <= new Date()) return null

  db.prepare(`
    UPDATE password_reset_tokens
    SET used_at = datetime('now')
    WHERE id = ?
  `).run(row.id)

  return row.user_id
}
