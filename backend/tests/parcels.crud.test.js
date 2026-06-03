import './helpers/setupDb.js'
import { describe, test, expect, beforeEach } from '@jest/globals'
import request from 'supertest'
import { buildApp } from '../src/server.js'
import { resetDb } from '../src/db/index.js'

let app

// Helper: register a user and return an agent with active session cookie
async function loggedInAgent(email = 'a@test.com', password = 'ValidPass1') {
  const agent = request.agent(app)
  await agent.post('/auth/register').send({ email, password })
  return agent
}

async function createParcelFor(agent, tracking = 'TEST123456') {
  const res = await agent
    .post('/parcels')
    .send({ tracking_number: tracking, provider: 'DHL', label: 'Test parcel' })
  return res.body
}

beforeEach(() => {
  resetDb()
  app = buildApp()
})

describe('Sprint 2 — Edit Parcel (US2.5)', () => {
  test('PUT updates label and notes', async () => {
    const agent = await loggedInAgent()
    const created = await createParcelFor(agent)

    const res = await agent
      .put(`/parcels/${created.id}`)
      .send({ label: 'New label', notes: 'Some notes' })

    expect(res.status).toBe(200)
    expect(res.body.label).toBe('New label')
    expect(res.body.notes).toBe('Some notes')
    expect(res.body.tracking_number).toBe('TEST123456')  // unchanged
  })

  test('PUT with tracking_number in body returns 400 (strict mode)', async () => {
    const agent = await loggedInAgent()
    const created = await createParcelFor(agent)

    const res = await agent
      .put(`/parcels/${created.id}`)
      .send({ label: 'X', tracking_number: 'HACKED999' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_input')
    expect(res.body.message).toMatch(/not editable/i)
  })

  test('PUT with status in body returns 400 (strict mode)', async () => {
    const agent = await loggedInAgent()
    const created = await createParcelFor(agent)

    const res = await agent
      .put(`/parcels/${created.id}`)
      .send({ status: 'delivered' })

    expect(res.status).toBe(400)
  })

  test('cross-user PUT returns 404, not 403', async () => {
    const agentA = await loggedInAgent('alice@test.com', 'Alicepw99')
    const created = await createParcelFor(agentA, 'ALICE123456')

    const agentB = await loggedInAgent('bob@test.com', 'Bobpw9999')
    const res = await agentB
      .put(`/parcels/${created.id}`)
      .send({ label: 'Bob owns this now' })

    expect(res.status).toBe(404)
    expect(res.body).not.toHaveProperty('label')
  })
})

describe('Sprint 2 — Soft Delete (US2.6)', () => {
  test('DELETE archives the parcel; default list excludes it', async () => {
    const agent = await loggedInAgent()
    const created = await createParcelFor(agent)

    const del = await agent.delete(`/parcels/${created.id}`)
    expect(del.status).toBe(204)

    const list = await agent.get('/parcels')
    expect(list.body).toHaveLength(0)
  })

  test('archived parcels appear under ?filter=archived', async () => {
    const agent = await loggedInAgent()
    const created = await createParcelFor(agent)
    await agent.delete(`/parcels/${created.id}`)

    const list = await agent.get('/parcels?filter=archived')
    expect(list.body).toHaveLength(1)
    expect(list.body[0].archived).toBe(1)
  })

  test('restore brings an archived parcel back to active', async () => {
    const agent = await loggedInAgent()
    const created = await createParcelFor(agent)
    await agent.delete(`/parcels/${created.id}`)

    const res = await agent.post(`/parcels/${created.id}/restore`)
    expect(res.status).toBe(200)
    expect(res.body.archived).toBe(0)

    const list = await agent.get('/parcels')
    expect(list.body).toHaveLength(1)
  })

  test('cross-user DELETE returns 404, not 403', async () => {
    const agentA = await loggedInAgent('alice@test.com', 'Alicepw99')
    const created = await createParcelFor(agentA, 'ALICE111111')

    const agentB = await loggedInAgent('bob@test.com', 'Bobpw9999')
    const res = await agentB.delete(`/parcels/${created.id}`)
    expect(res.status).toBe(404)
  })
})
