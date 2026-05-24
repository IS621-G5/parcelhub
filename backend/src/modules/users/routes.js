import { Router } from 'express'
import { z } from 'zod'
import { createUser, verifyCredentials, findByEmail, findById } from './service.js'
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

export default router
