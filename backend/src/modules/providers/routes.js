// OAuth flow routes for Shopee + Lazada — mock implementation that mimics
// the real provider redirect flow so the frontend can be wired against it.
//
// Real flow:
//   1. Frontend → GET /oauth/shopee/start → response has authorize_url
//   2. Browser redirects to provider's authorize_url
//   3. User approves → provider redirects to /oauth/shopee/callback?code=XYZ
//   4. Callback exchanges code → tokens → encrypts → stores linked account
//   5. Optionally triggers initial order import
//
// Mock flow: identical structure, but step 2/3 are simulated — the
// authorize_url returns a frontend page that POSTs a fake code, OR the
// frontend just hits the callback directly with a known mock code (sh-*
// or lz-*) for testing.

import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../../middleware/auth.js'
import { getAdapter } from './adapter.js'
import { linkAccount } from '../linked/service.js'
import { importOrdersFromLinkedAccount } from './service.js'

const router = Router()

// GET /oauth/:provider/start — frontend calls to begin OAuth flow.
// Returns the URL the browser should redirect to.
router.get('/:provider/start', requireAuth, (req, res) => {
  const { provider } = req.params
  if (!['shopee', 'lazada'].includes(provider)) {
    return res.status(400).json({ error: 'unknown_provider' })
  }
  // In production: build provider's real OAuth authorize URL with client_id,
  // redirect_uri, scope, state. Here we point at a frontend mock page.
  const authorizeUrl = `${process.env.FRONTEND_ORIGIN || 'http://localhost:5173'}` +
    `/mock-oauth?provider=${provider}&redirect=${encodeURIComponent('/oauth/callback')}`
  res.json({
    authorize_url: authorizeUrl,
    provider,
    state: `state_${provider}_${Date.now()}`,
  })
})

// POST /oauth/:provider/callback — exchanges code for tokens, links account,
// optionally imports orders. Called by the frontend after mock OAuth page
// "approves" and returns a code.
const callbackSchema = z.object({
  code: z.string().min(3).max(200),
  import_orders: z.boolean().optional(),  // default true
}).strict()

router.post('/:provider/callback', requireAuth, (req, res, next) => {
  try {
    const { provider } = req.params
    if (!['shopee', 'lazada'].includes(provider)) {
      return res.status(400).json({ error: 'unknown_provider' })
    }
    const parsed = callbackSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    // Step 1: exchange code for tokens via adapter
    const adapter = getAdapter(provider)
    let tokens
    try {
      tokens = adapter.exchangeCodeForTokens(parsed.data.code)
    } catch (err) {
      return res.status(err.status || 400).json({
        error: 'token_exchange_failed',
        message: err.message,
      })
    }

    // Step 2: link account (encrypts tokens at rest with AES-256-GCM)
    const linkedAccount = linkAccount({
      userId: req.userId,
      provider,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
    })

    // Step 3: optionally import orders right away (default yes)
    const shouldImport = parsed.data.import_orders !== false
    let importResult = null
    if (shouldImport) {
      importResult = importOrdersFromLinkedAccount({
        userId: req.userId,
        linkedAccountId: linkedAccount.id,
        provider,
      })
    }

    res.status(201).json({
      linked_account: linkedAccount,
      import: importResult,
    })
  } catch (err) { next(err) }
})

// POST /oauth/:provider/import — re-import orders from already-linked account.
// Useful for refreshing the parcel list manually.
const importSchema = z.object({
  linked_account_id: z.number().int().positive(),
  since_days: z.number().int().min(1).max(365).optional(),
}).strict()

router.post('/:provider/import', requireAuth, (req, res, next) => {
  try {
    const { provider } = req.params
    if (!['shopee', 'lazada'].includes(provider)) {
      return res.status(400).json({ error: 'unknown_provider' })
    }
    const parsed = importSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const result = importOrdersFromLinkedAccount({
      userId: req.userId,
      linkedAccountId: parsed.data.linked_account_id,
      provider,
      sinceDays: parsed.data.since_days,
    })
    if (result.error === 'linked_account_not_found_or_inactive') {
      return res.status(404).json({ error: result.error })
    }
    if (result.error) return res.status(502).json(result)
    res.json(result)
  } catch (err) { next(err) }
})

export default router
