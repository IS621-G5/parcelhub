import './helpers/setupDb.js'
import { describe, test, expect, beforeEach } from '@jest/globals'
import request from 'supertest'
import { buildApp } from '../src/server.js'
import { resetDb } from '../src/db/index.js'

let app

async function loggedInAgent() {
  const agent = request.agent(app)
  await agent.post('/auth/register').send({ email: 'sender@test.com', password: 'Sendpw1234' })
  return agent
}

const validDraftPayload = {
  recipient_name: 'Recipient One',
  recipient_phone: '+6591234567',
  recipient_address: '1 Marina Bay Sands Drive, Singapore 018972',
  parcel_size: 'medium',
  weight_kg: 2.5,
  pickup_mode: 'pickup',
}

beforeEach(() => {
  resetDb()
  app = buildApp()
})

describe('Sprint 2 — Send Parcel (US3.1, US3.2, US3.3)', () => {
  test('POST /send/drafts creates a draft with status=draft', async () => {
    const agent = await loggedInAgent()
    const res = await agent.post('/send/drafts').send(validDraftPayload)
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('draft')
    expect(res.body.recipient_name).toBe('Recipient One')
  })

  test('POST /send/drafts rejects unknown fields (strict mode)', async () => {
    const agent = await loggedInAgent()
    const res = await agent
      .post('/send/drafts')
      .send({ ...validDraftPayload, admin: true })
    expect(res.status).toBe(400)
  })

  test('GET /send/drafts/:id/quotes returns 3 courier quotes', async () => {
    const agent = await loggedInAgent()
    const draft = (await agent.post('/send/drafts').send(validDraftPayload)).body

    const res = await agent.get(`/send/drafts/${draft.id}/quotes`)
    expect(res.status).toBe(200)
    expect(res.body.quotes).toHaveLength(3)
    const couriers = res.body.quotes.map(q => q.courier).sort()
    expect(couriers).toEqual(['DHL', 'Ninja Van', 'SingPost'])
    // Address is NEVER in the quotes response — server-side only
    expect(JSON.stringify(res.body)).not.toContain('Marina Bay')
  })

  test('PUT /send/drafts/:id/courier sets selected courier', async () => {
    const agent = await loggedInAgent()
    const draft = (await agent.post('/send/drafts').send(validDraftPayload)).body

    const res = await agent
      .put(`/send/drafts/${draft.id}/courier`)
      .send({ courier: 'Ninja Van' })

    expect(res.status).toBe(200)
    expect(res.body.selected_courier).toBe('Ninja Van')
  })

  test('PUT /send/drafts/:id/courier rejects unknown courier', async () => {
    const agent = await loggedInAgent()
    const draft = (await agent.post('/send/drafts').send(validDraftPayload)).body

    const res = await agent
      .put(`/send/drafts/${draft.id}/courier`)
      .send({ courier: 'FakeCourier' })

    expect(res.status).toBe(400)
  })

  test('POST /confirm without courier selection returns 409', async () => {
    const agent = await loggedInAgent()
    const draft = (await agent.post('/send/drafts').send(validDraftPayload)).body

    const res = await agent
      .post(`/send/drafts/${draft.id}/confirm`)
      .send({ idempotency_token: 'tok-abc-12345' })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('no_courier_selected')
  })

  test('POST /confirm with valid courier creates a parcel with tracking number', async () => {
    const agent = await loggedInAgent()
    const draft = (await agent.post('/send/drafts').send(validDraftPayload)).body
    await agent.put(`/send/drafts/${draft.id}/courier`).send({ courier: 'DHL' })

    const res = await agent
      .post(`/send/drafts/${draft.id}/confirm`)
      .send({ idempotency_token: 'tok-confirm-12345' })

    expect(res.status).toBe(201)
    expect(res.body.parcel.tracking_number).toMatch(/^DHL\d+/)
    expect(res.body.parcel.status).toBe('in_transit')
    expect(res.body.idempotent).toBe(false)
  })

  test('POST /confirm is idempotent — same token returns same parcel', async () => {
    const agent = await loggedInAgent()
    const draft = (await agent.post('/send/drafts').send(validDraftPayload)).body
    await agent.put(`/send/drafts/${draft.id}/courier`).send({ courier: 'DHL' })

    const first = await agent
      .post(`/send/drafts/${draft.id}/confirm`)
      .send({ idempotency_token: 'same-token-9999' })

    const second = await agent
      .post(`/send/drafts/${draft.id}/confirm`)
      .send({ idempotency_token: 'same-token-9999' })

    expect(first.body.parcel.id).toBe(second.body.parcel.id)
    expect(first.body.parcel.tracking_number).toBe(second.body.parcel.tracking_number)
    expect(second.body.idempotent).toBe(true)

    // Only one parcel created total
    const list = await agent.get('/parcels')
    expect(list.body).toHaveLength(1)
  })
})
