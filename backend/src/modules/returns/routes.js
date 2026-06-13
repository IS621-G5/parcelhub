import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { initiateReturn, listReturnsForUser, findReturnForUser } from './service.js'

const router = Router()

const initiateSchema = z.object({
  parcel_id: z.number().int().positive(),
  reason: z.string().min(3).max(500),
  return_method: z.enum(['pickup', 'dropoff']),
}).strict()

// US2.7 — POST /returns — Initiate
router.post('/', requireAuth, (req, res, next) => {
  try {
    const parsed = initiateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const result = initiateReturn({
      userId: req.userId,
      parcelId: parsed.data.parcel_id,
      reason: parsed.data.reason,
      returnMethod: parsed.data.return_method,
    })
    if (result.error === 'parcel_not_found') return res.status(404).json({ error: 'parcel_not_found' })
    if (result.error === 'not_delivered') return res.status(409).json({ error: 'not_delivered', message: 'Returns are only available for delivered parcels' })
    if (result.error === 'return_already_initiated') return res.status(409).json({ error: 'return_already_initiated' })
    res.status(201).json(result.ret)
  } catch (err) { next(err) }
})

// US2.8 — GET /returns
router.get('/', requireAuth, (req, res) => {
  res.json(listReturnsForUser(req.userId))
})

router.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
  const ret = findReturnForUser(id, req.userId)
  if (!ret) return res.status(404).json({ error: 'not_found' })
  res.json(ret)
})

export default router
