import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { createUser, verifyCredentials, findByEmail, findById, updatePassword } from './service.js'
import { createResetTokenForUser, consumeResetToken } from './passwordReset.js'
import { config } from '../../config/index.js'
import { requireAuth } from '../../middleware/auth.js'

const router = Router()

// Rotate the session ID on privilege elevation (login/register) to defeat
// session fixation: any pre-auth session an attacker may have planted is
// discarded and a fresh authenticated session is issued.
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => (err ? reject(err) : resolve()))
  })
}

// Email is normalized (trimmed + lowercased) before validation so that
// "User@X.com" and "user@x.com" map to the same account — the email column
// is case-sensitive UNIQUE, so without this the duplicate check is bypassable
// and login/forgot fail for a differently-cased address than was registered.
const emailField = z.string().trim().toLowerCase().pipe(z.string().email().max(254))

const registerSchema = z.object({
  email: emailField,
  password: z.string()
    .min(8, 'password must be at least 8 characters')
    .max(128)
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'password must contain a letter and a digit'),
})

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(128),
})

// Sprint 1, US1.3 — same password rules as register so a successful reset
// always yields a password that meets the login policy.
const forgotSchema = z.object({
  email: emailField,
})

const resetSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  password: z.string()
    .min(8, 'password must be at least 8 characters')
    .max(128)
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'password must contain a letter and a digit'),
})

// ─── T-SEC-04: Rate-limit auth endpoints by client IP ────────────────
// Per-IP limits prevent credential stuffing, registration spam, and
// account-enumeration probes against forgot-password. Bypassed in tests
// to avoid cross-test contamination (the in-process memory store is shared).
const authLimiter = (max) => rateLimit({
  windowMs: 15 * 60_000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', retry_after_seconds: 15 * 60 },
  skip: () => process.env.NODE_ENV === 'test',
})

const loginLimit  = authLimiter(20)   // 20 attempts / 15 min / IP
const registerLimit = authLimiter(10) // 10 sign-ups / 15 min / IP
const forgotLimit = authLimiter(5)    // 5 reset requests / 15 min / IP — tightest, enumeration target

router.post('/register', registerLimit, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_input',
        issues: parsed.error.issues.map(i => ({ path: i.path, message: i.message })),
      })
    }
    const { email, password } = parsed.data

    if (findByEmail(email)) {
      return res.status(409).json({ error: 'email_taken' })
    }

    const user = await createUser({ email, password })
    await regenerateSession(req)
    req.session.userId = user.id
    res.status(201).json(user)
  } catch (err) { next(err) }
})

router.post('/login', loginLimit, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input' })
    }
    const user = await verifyCredentials(parsed.data.email, parsed.data.password)
    if (!user) return res.status(401).json({ error: 'invalid_credentials' })

    await regenerateSession(req)
    req.session.userId = user.id
    res.json(user)
  } catch (err) { next(err) }
})

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.status(204).end()
  })
})

// Sprint 1, US1.3 Forget Password.
// Always returns 200 OK regardless of whether the email exists, to prevent
// account enumeration via this endpoint (matches the anti-enumeration story
// in login). If the email maps to a real user, a one-time reset link is
// logged to the server console (MVP — swap for real email send before prod).
router.post('/forgot-password', forgotLimit, (req, res, next) => {
  try {
    const parsed = forgotSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input' })
    }
    const { email } = parsed.data
    const user = findByEmail(email)
    if (user && user.is_active) {
      const token = createResetTokenForUser(user.id)
      const link = `${config.frontendOrigin}/?reset=${token}`
      console.log('\n═══ PASSWORD RESET LINK ═══')
      console.log(`To:      ${email}`)
      console.log(`Link:    ${link}`)
      console.log(`Token:   ${token}`)
      console.log(`Expires: in 1 hour`)
      console.log('═══════════════════════════\n')
    }
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Sprint 1, US1.3 — consume a one-time token, set new password.
// Generic 'invalid_token' on any failure so an attacker cannot distinguish
// "no such token" / "expired" / "already used".
router.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = resetSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_input',
        issues: parsed.error.issues.map(i => ({ path: i.path, message: i.message })),
      })
    }
    const userId = consumeResetToken(parsed.data.token)
    if (!userId) {
      return res.status(400).json({ error: 'invalid_token' })
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, config.bcryptCost)
    updatePassword(userId, passwordHash)
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.get('/me', requireAuth, (req, res) => {
  const user = findById(req.userId)
  if (!user || !user.is_active) {
    return req.session.destroy(() => res.status(401).json({ error: 'unauthenticated' }))
  }
  res.json(user)
})

export default router
