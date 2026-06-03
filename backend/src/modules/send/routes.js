import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { createDraft, findDraftForUser, selectCourier, getCourierQuotes, confirmDraft } from './service.js'

const router = Router()

// US3.1 — Start form schema. Strict so unknown fields are rejected.
const startSchema = z.object({
  recipient_name: z.string().min(1).max(120),
  recipient_phone: z.string().min(6).max(30),
  recipient_address: z.string().min(5).max(500),
  parcel_size: z.enum(['small', 'medium', 'large']),
  weight_kg: z.number().min(0.1).max(50),
  pickup_mode: z.enum(['pickup', 'dropoff']),
}).strict()

// US3.2 — Courier selection schema.
const courierSchema = z.object({
  courier: z.enum(['DHL', 'Ninja Van', 'SingPost']),
}).strict()

// US3.3 — Confirm endpoint. Requires an idempotency token from the client
// so retries / double-submits do not create duplicate parcels.
const confirmSchema = z.object({
  idempotency_token: z.string().min(8).max(120),
}).strict()

// POST /send/drafts — create a new Send draft (US3.1)
router.post('/drafts', requireAuth, (req, res, next) => {
  try {
    const parsed = startSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', issues: parsed.error.issues })
    }
    const draft = createDraft({ userId: req.userId, data: parsed.data })
    res.status(201).json(draft)
  } catch (err) { next(err) }
})

// GET /send/drafts/:id — IDOR-safe
router.get('/drafts/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const draft = findDraftForUser(id, req.userId)
  if (!draft) return res.status(404).json({ error: 'not_found' })
  res.json(draft)
})

// GET /send/drafts/:id/quotes — fetch mock courier quotes (US3.2)
router.get('/drafts/:id/quotes', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const quotes = getCourierQuotes({ draftId: id, userId: req.userId })
  if (!quotes) return res.status(404).json({ error: 'not_found_or_incomplete' })
  res.json({ quotes })
})

// PUT /send/drafts/:id/courier — select a courier (US3.2)
router.put('/drafts/:id/courier', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const parsed = courierSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const draft = selectCourier({ draftId: id, userId: req.userId, courier: parsed.data.courier })
    if (!draft) return res.status(404).json({ error: 'not_found_or_already_confirmed' })
    res.json(draft)
  } catch (err) { next(err) }
})

// POST /send/drafts/:id/confirm — idempotent confirm (US3.3)
router.post('/drafts/:id/confirm', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const parsed = confirmSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const result = confirmDraft({
      draftId: id,
      userId: req.userId,
      idempotencyToken: parsed.data.idempotency_token,
    })
    if (result.error === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (result.error === 'no_courier_selected') {
      return res.status(409).json({ error: 'no_courier_selected', message: 'Select a courier first' })
    }
    res.status(result.idempotent ? 200 : 201).json(result)
  } catch (err) { next(err) }
})

export default router
