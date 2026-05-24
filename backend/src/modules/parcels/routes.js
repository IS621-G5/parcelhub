import { Router } from 'express'
import { z } from 'zod'
import { listParcelsForUser, createParcel, findParcelForUser, existsForUser } from './service.js'
import { requireAuth } from '../../middleware/auth.js'

const router = Router()

const createSchema = z.object({
  tracking_number: z.string().min(6).max(30),
  provider: z.enum(['DHL', 'Ninja Van', 'SingPost']),
  label: z.string().max(120).optional(),
})

router.get('/', requireAuth, (req, res) => {
  res.json(listParcelsForUser(req.userId))
})

router.post('/', requireAuth, (req, res, next) => {
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
router.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const parcel = findParcelForUser(id, req.userId)
  if (!parcel) return res.status(404).json({ error: 'not_found' })
  res.json(parcel)
})

export default router
