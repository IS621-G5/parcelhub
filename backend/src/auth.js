// All authentication endpoints in one file.
// Endpoints:
//   POST /auth/register  — create account
//   POST /auth/login     — sign in, set session cookie
//   POST /auth/logout    — sign out, clear session
//   GET  /auth/me        — return current user (404 if not signed in)

import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import db from './db.js'

const router = Router()

// Input validation schema. zod gives clear error messages automatically.
// Password rule: 8+ chars, must contain at least one letter and one digit.
const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8, 'password must be at least 8 characters')
    .max(128)
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'password must contain a letter and a digit'),
})

// Dummy hash for constant-time login response. Even if the email doesn't exist,
// we still run a bcrypt compare against this so the response time is the same.
// This prevents user enumeration via timing attacks.
const DUMMY_HASH = '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi'

// --- POST /auth/register ----------------------------------------------------
router.post('/register', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', issues: parsed.error.issues })
  }
  const { email, password } = parsed.data

  // Reject duplicate email
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    return res.status(409).json({ error: 'email_taken' })
  }

  // Hash password with bcrypt cost 10 (OWASP minimum for 2024)
  const passwordHash = await bcrypt.hash(password, 10)

  const result = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, passwordHash)

  // Auto-login after register: store user id in session
  req.session.userId = result.lastInsertRowid

  return res.status(201).json({ id: result.lastInsertRowid, email })
})

// --- POST /auth/login -------------------------------------------------------
router.post('/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input' })
  }
  const { email, password } = parsed.data

  const user = db
    .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
    .get(email)

  // Constant-time path: still run bcrypt even if user doesn't exist
  const hashToCompare = user ? user.password_hash : DUMMY_HASH
  const ok = await bcrypt.compare(password, hashToCompare)

  if (!user || !ok) {
    return res.status(401).json({ error: 'invalid_credentials' })
  }

  req.session.userId = user.id
  return res.json({ id: user.id, email: user.email })
})

// --- POST /auth/logout ------------------------------------------------------
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.status(204).end()
  })
})

// --- GET /auth/me -----------------------------------------------------------
router.get('/me', (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'unauthenticated' })
  }
  const user = db
    .prepare('SELECT id, email FROM users WHERE id = ?')
    .get(req.session.userId)

  if (!user) {
    // Session points to a deleted user — clear the session
    req.session.destroy(() => res.status(401).json({ error: 'unauthenticated' }))
    return
  }

  return res.json(user)
})

export default router
