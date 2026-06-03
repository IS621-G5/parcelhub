import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { createUser, verifyCredentials, findByEmail, findById, updatePassword } from './service.js'
import { createResetTokenForUser, consumeResetToken } from './passwordReset.js'
import { config } from '../../config/index.js'
import { requireAuth } from '../../middleware/auth.js'

const router = Router()

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string()
    .min(8, 'password must be at least 8 characters')
    .max(128)
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'password must contain a letter and a digit'),
})

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
})

// Sprint 1, US1.3 — same password rules as register so a successful reset
// always yields a password that meets the login policy.
const forgotSchema = z.object({
  email: z.string().email().max(254),
})

const resetSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  password: z.string()
    .min(8, 'password must be at least 8 characters')
    .max(128)
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'password must contain a letter and a digit'),
})

router.post('/register', async (req, res, next) => {
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
    req.session.userId = user.id
    res.status(201).json(user)
  } catch (err) { next(err) }
})

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input' })
    }
    const user = await verifyCredentials(parsed.data.email, parsed.data.password)
    if (!user) return res.status(401).json({ error: 'invalid_credentials' })

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

router.get('/me', requireAuth, (req, res) => {
  const user = findById(req.userId)
  if (!user || !user.is_active) {
    return req.session.destroy(() => res.status(401).json({ error: 'unauthenticated' }))
  }
  res.json(user)
})

// Sprint 1 US1.3 — Forget Password.
// Anti-enumeration: always 200 regardless of whether email exists, so an
// attacker can't probe to learn which emails are registered.
router.post('/forgot-password', (req, res, next) => {
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
      // MVP: no email service yet — print the link to the server console.
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

// Sprint 1 US1.3 — Reset Password.
// Returns a generic 'invalid_token' for all failure modes (not found / used /
// expired) so an attacker can't distinguish them.
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

export default router