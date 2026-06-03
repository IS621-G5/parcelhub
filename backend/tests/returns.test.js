import './helpers/setupDb.js'
import { describe, test, expect, beforeEach } from '@jest/globals'
import request from 'supertest'
import { buildApp } from '../src/server.js'
import { resetDb, getDb } from '../src/db/index.js'

let app
async function loggedInAgent(email = 'ret@test.com', pw = 'Retpw12345') {
  const agent = request.agent(app)
  await agent.post('/auth/register').send({ email, password: pw })
  return agent
}

// Helper: create a parcel and mark it delivered (returns require delivered status)
async function makeDeliveredParcel(agent, tracking = 'DEL12345678') {
  const created = (await agent.post('/parcels').send({
    tracking_number: tracking, provider: 'DHL', label: 'For return',
  })).body
  // Mark delivered directly in DB (in production this comes from courier adapter)
  getDb().prepare(`UPDATE parcels SET status = 'delivered' WHERE id = ?`).run(created.id)
  return created
}

beforeEach(() => { resetDb(); app = buildApp() })

describe('Sprint 3 — Returns (US2.7, US2.8)', () => {
  test('POST /returns initiates a return for a delivered parcel', async () => {
    const agent = await loggedInAgent()
    const parcel = await makeDeliveredParcel(agent)

    const res = await agent.post('/returns').send({
      parcel_id: parcel.id,
      reason: 'Item arrived damaged',
      return_method: 'pickup',
    })
    expect(res.status).toBe(201)
    expect(res.body.parcel_id).toBe(parcel.id)
    expect(res.body.return_tracking_number).toMatch(/^RET[0-9A-F]+$/)
    expect(res.body.status).toBe('initiated')
  })

  test('POST /returns rejects non-delivered parcel with 409', async () => {
    const agent = await loggedInAgent()
    const created = (await agent.post('/parcels').send({
      tracking_number: 'PENDING1234', provider: 'DHL', label: 'Not delivered yet',
    })).body
    // parcel.status defaults to 'pending'

    const res = await agent.post('/returns').send({
      parcel_id: created.id,
      reason: 'Changed mind',
      return_method: 'dropoff',
    })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('not_delivered')
  })

  test('POST /returns rejects duplicate return for same parcel', async () => {
    const agent = await loggedInAgent()
    const parcel = await makeDeliveredParcel(agent)

    await agent.post('/returns').send({
      parcel_id: parcel.id, reason: 'first', return_method: 'pickup',
    })
    const res = await agent.post('/returns').send({
      parcel_id: parcel.id, reason: 'second', return_method: 'pickup',
    })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('return_already_initiated')
  })

  test('POST /returns on another user\'s parcel returns 404', async () => {
    const agentA = await loggedInAgent('alice@r.com', 'Alicepw99')
    const parcel = await makeDeliveredParcel(agentA, 'ALICE9999')

    const agentB = await loggedInAgent('bob@r.com', 'Bobpw9999')
    const res = await agentB.post('/returns').send({
      parcel_id: parcel.id, reason: 'stealing', return_method: 'pickup',
    })
    expect(res.status).toBe(404)
  })

  test('GET /returns lists user\'s returns only', async () => {
    const agent = await loggedInAgent()
    const parcel = await makeDeliveredParcel(agent)
    await agent.post('/returns').send({
      parcel_id: parcel.id, reason: 'damaged', return_method: 'pickup',
    })

    const res = await agent.get('/returns')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].parcel_id).toBe(parcel.id)
  })
})

describe('Sprint 3 — Notification Preferences (US4.1)', () => {
  test('GET /notifications/preferences returns sane defaults on first access', async () => {
    const agent = await loggedInAgent()
    const res = await agent.get('/notifications/preferences')
    expect(res.status).toBe(200)
    expect(res.body.email_on_exception).toBe(1)
    expect(res.body.inapp_on_exception).toBe(1)
    expect(res.body.email_on_delivered).toBe(0) // not by default — too noisy
  })

  test('PUT /notifications/preferences updates and persists', async () => {
    const agent = await loggedInAgent()
    const put = await agent.put('/notifications/preferences').send({
      email_on_delivered: true,
      inapp_on_exception: false,
    })
    expect(put.status).toBe(200)
    expect(put.body.email_on_delivered).toBe(1)
    expect(put.body.inapp_on_exception).toBe(0)
    // Re-read
    const get = await agent.get('/notifications/preferences')
    expect(get.body.email_on_delivered).toBe(1)
    expect(get.body.inapp_on_exception).toBe(0)
  })

  test('PUT rejects unknown fields (strict mode)', async () => {
    const agent = await loggedInAgent()
    const res = await agent.put('/notifications/preferences').send({
      admin_mode: true,
    })
    expect(res.status).toBe(400)
  })
})
