import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { getPrefs, updatePrefs, listEventsForUser, countUnread, markRead } from './service.js'

const router = Router()

// US4.1 — Notification preferences
const prefsSchema = z.object({
  email_on_exception: z.boolean().optional(),
  email_on_delivered: z.boolean().optional(),
  email_on_returned: z.boolean().optional(),
  inapp_on_exception: z.boolean().optional(),
  inapp_on_delivered: z.boolean().optional(),
  inapp_on_returned: z.boolean().optional(),
}).strict()

router.get('/preferences', requireAuth, (req, res) => {
  res.json(getPrefs(req.userId))
})

router.put('/preferences', requireAuth, (req, res, next) => {
  try {
    const parsed = prefsSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
    res.json(updatePrefs(req.userId, parsed.data))
  } catch (err) { next(err) }
})

// ──────────────────────────────────────────────────────────────────────
// Sprint 2 — In-app notification events (US2.8 Delivery Confirmation)
// ──────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
  res.json(listEventsForUser(req.userId))
})

router.get('/unread-count', requireAuth, (req, res) => {
  res.json({ count: countUnread(req.userId) })
})

router.post('/:id/read', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const ok = markRead(id, req.userId)
  // IDOR-safe: if the notification doesn't exist OR belongs to another user
  // OR is already read, we return 404. No info leak about which case.
  if (!ok) return res.status(404).json({ error: 'not_found' })
  res.status(204).end()
})

export default router
