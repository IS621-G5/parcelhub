import './helpers/setupDb.js'
import { describe, test, expect, beforeEach } from '@jest/globals'
import request from 'supertest'
import { buildApp } from '../src/server.js'
import { resetDb } from '../src/db/index.js'

let app
beforeEach(() => {
  resetDb()
  app = buildApp()
})

// ──────────────────────────────────────────────────────────────────────
// Regression tests for the bug-review fixes (2026-06-15)
// ──────────────────────────────────────────────────────────────────────

describe('Email normalization (case-insensitive accounts)', () => {
  test('register stores email lowercased', async () => {
    const res = await request(app).post('/auth/register')
      .send({ email: 'Mixed@Case.COM', password: 'ValidPass1' })
    expect(res.status).toBe(201)
    expect(res.body.email).toBe('mixed@case.com')
  })

  test('login works regardless of the casing used at registration', async () => {
    await request(app).post('/auth/register')
      .send({ email: 'Casey@Example.com', password: 'ValidPass1' })
    const res = await request(app).post('/auth/login')
      .send({ email: 'casey@example.COM', password: 'ValidPass1' })
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('casey@example.com')
  })

  test('duplicate registration with different casing is rejected', async () => {
    const a = await request(app).post('/auth/register')
      .send({ email: 'dupe@x.com', password: 'ValidPass1' })
    expect(a.status).toBe(201)
    const b = await request(app).post('/auth/register')
      .send({ email: 'DUPE@X.com', password: 'ValidPass1' })
    expect(b.status).toBe(409)
  })
})

describe('markRead is idempotent', () => {
  async function deliveredNotification(agent) {
    await agent.post('/auth/register').send({ email: 'mark@x.com', password: 'ValidPass1' })
    const parcel = (await agent.post('/parcels')
      .send({ tracking_number: 'DHL55555', provider: 'DHL', label: 'p' })).body
    await agent.post(`/parcels/${parcel.id}/mock-deliver`)
    const notifs = await agent.get('/notifications')
    return notifs.body[0].id
  }

  test('marking the same notification read twice both return 204', async () => {
    const agent = request.agent(app)
    const id = await deliveredNotification(agent)
    const first = await agent.post(`/notifications/${id}/read`)
    expect(first.status).toBe(204)
    const second = await agent.post(`/notifications/${id}/read`)
    expect(second.status).toBe(204)   // idempotent, not 404
    expect((await agent.get('/notifications/unread-count')).body.count).toBe(0)
  })
})

describe('Order import uses the provider item summary as the label', () => {
  test('imported Shopee parcel label is the item summary, not a generic fallback', async () => {
    const agent = request.agent(app)
    await agent.post('/auth/register').send({ email: 'imp@x.com', password: 'ValidPass1' })
    await agent.post('/oauth/shopee/callback').send({ code: 'sh-mock-code' })
    const parcels = (await agent.get('/parcels')).body
    const labels = parcels.map(p => p.label)
    // Mock Shopee adapter emits item_summary like "Shopee — Wireless earphones"
    expect(labels).toContain('Shopee — Wireless earphones')
    // And NOT the generic "Shopee order <tracking>" fallback
    expect(labels.every(l => !/^Shopee order /.test(l))).toBe(true)
  })
})

describe('OAuth import derives provider from the linked account, not the URL', () => {
  test('importing a Shopee account via the /lazada/import route tags parcels as shopee', async () => {
    const agent = request.agent(app)
    await agent.post('/auth/register').send({ email: 'der@x.com', password: 'ValidPass1' })
    const connect = await agent.post('/oauth/shopee/callback')
      .send({ code: 'sh-mock-code', import_orders: false })
    const accountId = connect.body.linked_account.id

    // Mismatched URL provider must not control the adapter/tagging.
    const res = await agent.post('/oauth/lazada/import').send({ linked_account_id: accountId })
    expect(res.status).toBe(200)
    expect(res.body.imported).toBeGreaterThan(0)
    const parcels = (await agent.get('/parcels')).body
    expect(parcels.length).toBeGreaterThan(0)
    expect(parcels.every(p => p.provider === 'shopee')).toBe(true)
  })
})

describe('OAuth callback validates session-bound state (CSRF)', () => {
  test('callback with the state issued by /start succeeds', async () => {
    const agent = request.agent(app)
    await agent.post('/auth/register').send({ email: 'st@x.com', password: 'ValidPass1' })
    const start = await agent.get('/oauth/shopee/start')
    const res = await agent.post('/oauth/shopee/callback')
      .send({ code: 'sh-mock-code', state: start.body.state })
    expect(res.status).toBe(201)
  })

  test('callback with a wrong state after /start is rejected', async () => {
    const agent = request.agent(app)
    await agent.post('/auth/register').send({ email: 'st2@x.com', password: 'ValidPass1' })
    await agent.get('/oauth/shopee/start')
    const res = await agent.post('/oauth/shopee/callback')
      .send({ code: 'sh-mock-code', state: 'forged-state' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('state_mismatch')
  })

  test('callback without a prior /start still works (mock convenience path)', async () => {
    const agent = request.agent(app)
    await agent.post('/auth/register').send({ email: 'st3@x.com', password: 'ValidPass1' })
    const res = await agent.post('/oauth/shopee/callback').send({ code: 'sh-mock-code' })
    expect(res.status).toBe(201)
  })
})
