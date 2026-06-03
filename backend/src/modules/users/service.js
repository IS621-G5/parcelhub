import bcrypt from 'bcryptjs'
import { getDb } from '../../db/index.js'
import { config } from '../../config/index.js'

// Pre-computed dummy hash used for constant-time compare when the user does
// not exist. Defeats timing-based user enumeration.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8b8VfYR6SXLshq9o5T9o6Kf1qWxsK6'

export async function createUser({ email, password }) {
  const passwordHash = await bcrypt.hash(password, config.bcryptCost)
  const result = getDb().prepare(`
    INSERT INTO users (email, password_hash) VALUES (?, ?)
  `).run(email, passwordHash)
  return findById(result.lastInsertRowid)
}

export function findById(id) {
  return getDb().prepare(`
    SELECT id, email, is_active, created_at FROM users WHERE id = ?
  `).get(id)
}

export function findByEmail(email) {
  return getDb().prepare(`
    SELECT id, email, password_hash, is_active FROM users WHERE email = ?
  `).get(email)
}

export async function verifyCredentials(email, password) {
  const user = findByEmail(email)
  if (!user || !user.is_active) {
    // Constant-time path: compare against dummy hash even if user not found
    await bcrypt.compare(password, DUMMY_HASH)
    return null
  }
  const ok = await bcrypt.compare(password, user.password_hash)
  return ok ? { id: user.id, email: user.email } : null
}

// Sprint 1 US1.3 — used by /auth/reset-password after consumeResetToken
// has validated the reset token.
export function updatePassword(userId, passwordHash) {
  getDb().prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
    .run(passwordHash, userId)
}