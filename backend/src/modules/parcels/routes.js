import { Router } from 'express'
import { z } from 'zod'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import {
  listParcelsForUser, createParcel, findParcelForUser, existsForUser,
  updateParcel, archiveParcel, restoreParcel,
  markParcelDelivered, upsertRating, getRatingForParcel,
} from './service.js'
import { createDeliveryNotification, markDeliveryNotificationRead } from '../notifications/service.js'
import { requireAuth } from '../../middleware/auth.js'

const router = Router()

const createSchema = z.object({
  tracking_number: z.string().min(6).max(30),
  provider: z.enum(['DHL', 'Ninja Van', 'SingPost']),
  label: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
})

// Sprint 2: strict() — rejects unknown fields rather than silently dropping.
// Specifically prevents user from trying to PUT tracking_number / provider / status,
// which are immutable after create.
const updateSchema = z.object({
  label: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
}).strict()

// Sprint 2: rate-limit parcel creation to 10/min/user. Prevents abuse / spam.
const createParcelLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => `parcels-create-${req.userId || ipKeyGenerator(req)}`,
  message: { error: 'rate_limited', retry_after_seconds: 60 },
  skip: () => process.env.NODE_ENV === 'test',  // bypass in tests
})

// Sprint 2: rate-limit detail endpoints to 30/min/user. Defeats enumeration scripts.
const detailLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => `parcels-detail-${req.userId || ipKeyGenerator(req)}`,
  message: { error: 'rate_limited', retry_after_seconds: 60 },
  skip: () => process.env.NODE_ENV === 'test',  // bypass in tests
})

router.get('/', requireAuth, (req, res) => {
  // Sprint 2: optional ?filter=archived shows only archived; default excludes them.
  const filter = req.query.filter
  if (filter === 'archived') {
    return res.json(listParcelsForUser(req.userId, { onlyArchived: true }))
  }
  res.json(listParcelsForUser(req.userId))
})

router.post('/', requireAuth, createParcelLimit, (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    if (existsForUser(req.userId, parsed.data.tracking_number)) {
      return res.status(409).json({ error: 'duplicate_tracking_number' })
    }

    const parcel = createParcel({ userId: req.userId, ...parsed.data })
    res.status(201).json(parcel)
  } catch (err) { next(err) }
})

// IDOR-safe: returns 404 (not 403) if parcel exists but belongs to a
// different user — avoids confirming existence.
router.get('/:id', requireAuth, detailLimit, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const parcel = findParcelForUser(id, req.userId)
  if (!parcel) return res.status(404).json({ error: 'not_found' })
  res.json(parcel)
})

// Sprint 2 — US2.5 Edit Parcel.
// PUT rejects unknown fields via zod .strict() (prevents trying to change
// tracking_number / provider / status). Cross-user PUT returns 404 (IDOR-safe).
router.put('/:id', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      // Strict mode rejection — usually means caller tried to send immutable field
      return res.status(400).json({
        error: 'invalid_input',
        message: 'tracking_number, provider, and status are not editable',
        issues: parsed.error.issues,
      })
    }

    const parcel = updateParcel({ parcelId: id, userId: req.userId, ...parsed.data })
    if (!parcel) return res.status(404).json({ error: 'not_found' })
    res.json(parcel)
  } catch (err) { next(err) }
})

// Sprint 2 — US2.6 Delete Parcel (soft).
// Sets archived = 1; does NOT hard-delete. Cross-user DELETE returns 404.
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const ok = archiveParcel({ parcelId: id, userId: req.userId })
    if (!ok) return res.status(404).json({ error: 'not_found' })
    res.status(204).end()
  } catch (err) { next(err) }
})

// Sprint 2 — Restore an archived parcel.
router.post('/:id/restore', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const ok = restoreParcel({ parcelId: id, userId: req.userId })
    if (!ok) return res.status(404).json({ error: 'not_found' })
    const parcel = findParcelForUser(id, req.userId)
    res.json(parcel)
  } catch (err) { next(err) }
})

// ──────────────────────────────────────────────────────────────────────
// Sprint 2 — US2.8 Delivery Confirmation + US4.2 Rate Delivery
// ──────────────────────────────────────────────────────────────────────

// Demo helper: simulate a courier delivery webhook. In production this would
// be replaced by an actual webhook handler verifying provider signatures.
// Owner-only — non-owners get 404.
router.post('/:id/mock-deliver', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const result = markParcelDelivered({ parcelId: id, userId: req.userId })
    if (!result.ok) return res.status(404).json({ error: 'not_found' })
    // Fire a delivery notification (idempotent — won't dupe if one exists)
    createDeliveryNotification({
      userId: req.userId,
      parcelId: id,
      parcelLabel: result.parcel.label,
      provider: result.parcel.provider,
    })
    res.json(result.parcel)
  } catch (err) { next(err) }
})

const ratingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
}).strict()

// Create or update a rating for a parcel. The parcel must be owned and
// status=delivered. Same endpoint serves both flows:
//   - US2.8: triggered from the delivery confirmation modal
//   - US4.2: triggered from the parcel detail view
// On success, any unread delivery notification for this parcel is also marked
// read so the badge clears in one transaction.
router.put('/:id/rating', requireAuth, (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const parsed = ratingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    // IDOR-safe ownership + status check via findParcelForUser
    const parcel = findParcelForUser(id, req.userId)
    if (!parcel) return res.status(404).json({ error: 'not_found' })
    if (parcel.status !== 'delivered') {
      return res.status(400).json({ error: 'not_delivered' })
    }

    const rating = upsertRating({
      userId: req.userId, parcelId: id,
      stars: parsed.data.stars, comment: parsed.data.comment,
    })
    markDeliveryNotificationRead({ userId: req.userId, parcelId: id })
    res.json(rating)
  } catch (err) { next(err) }
})

router.get('/:id/rating', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  // Ownership check first — non-owner of parcel gets 404 with no rating data leaked
  const parcel = findParcelForUser(id, req.userId)
  if (!parcel) return res.status(404).json({ error: 'not_found' })
  const rating = getRatingForParcel(id, req.userId)
  if (!rating) return res.status(404).json({ error: 'not_rated' })
  res.json(rating)
})

export default router
