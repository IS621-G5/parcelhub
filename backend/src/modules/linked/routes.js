import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import {
  linkAccount, listLinkedAccounts, getLinkedAccount, disconnectAccount,
} from './service.js'

const router = Router()

// Mock OAuth callback. In production: server receives `code` from provider,
// exchanges for access + refresh tokens via provider's token endpoint, then
// calls linkAccount(). For Sprint 3 mock: the test/demo bypasses the
// browser-redirect step and POSTs the tokens it would have received.
const linkSchema = z.object({
  provider: z.enum(['shopee', 'lazada']),
  // In production these come from the provider, not the user. In dev/test
  // they're provided directly to exercise the encryption path.
  access_token: z.string().min(10).max(500),
  refresh_token: z.string().min(10).max(500),
  expires_at: z.string().optional(),
}).strict()

// POST /linked-accounts/connect — mock OAuth callback handler.
// In production this is GET /oauth/<provider>/callback after redirect.
router.post('/connect', requireAuth, (req, res, next) => {
  try {
    const parsed = linkSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const account = linkAccount({
      userId: req.userId,
      provider: parsed.data.provider,
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      expiresAt: parsed.data.expires_at,
    })
    // Note: response does NOT include token plaintext or ciphertext.
    res.status(201).json(account)
  } catch (err) { next(err) }
})

// GET /linked-accounts — list user's connected accounts
router.get('/', requireAuth, (req, res) => {
  res.json(listLinkedAccounts(req.userId))
})

// GET /linked-accounts/:id — IDOR-safe
router.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const account = getLinkedAccount(id, req.userId)
  if (!account) return res.status(404).json({ error: 'not_found' })
  res.json(account)
})

// DELETE /linked-accounts/:id — disconnect (soft delete + revoke upstream)
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const ok = disconnectAccount({ id, userId: req.userId })
    if (!ok) return res.status(404).json({ error: 'not_found' })
    res.status(204).end()
  } catch (err) { next(err) }
})

export default router
