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

// Test helpers
async function register(agent, email, password = 'ValidPass1') {
  return agent.post('/auth/register').send({ email, password })
}

async function makeUserWithParcel(agent, email = 'alice@test.com', tn = 'DHL00001') {
  await register(agent, email)
  const res = await agent.post('/parcels').send({
    tracking_number: tn, provider: 'DHL', label: 'My parcel',
  })
  return res.body
}

describe('US2.8 — mock-deliver creates a notification', () => {
  test('owner can mark own parcel delivered, status flips, notification fires', async () => {
    const agent = request.agent(app)
    const parcel = await makeUserWithParcel(agent)

    const deliver = await agent.post(`/parcels/${parcel.id}/mock-deliver`)
    expect(deliver.status).toBe(200)
    expect(deliver.body.status).toBe('delivered')

    const notifs = await agent.get('/notifications')
    expect(notifs.status).toBe(200)
    expect(notifs.body).toHaveLength(1)
    expect(notifs.body[0].type).toBe('delivery_confirmation')
    expect(notifs.body[0].parcel_id).toBe(parcel.id)
    expect(notifs.body[0].read_at).toBeNull()
  })

  test('unread-count reflects pending delivery notifications', async () => {
    const agent = request.agent(app)
    const parcel = await makeUserWithParcel(agent)
    await agent.post(`/parcels/${parcel.id}/mock-deliver`)

    const count = await agent.get('/notifications/unread-count')
    expect(count.status).toBe(200)
    expect(count.body.count).toBe(1)
  })

  test('idempotent: marking delivered twice does not duplicate the notification', async () => {
    const agent = request.agent(app)
    const parcel = await makeUserWithParcel(agent)

    await agent.post(`/parcels/${parcel.id}/mock-deliver`)
    await agent.post(`/parcels/${parcel.id}/mock-deliver`)

    const notifs = await agent.get('/notifications')
    expect(notifs.body).toHaveLength(1)
  })

  test('IDOR: user B cannot mark user As parcel delivered', async () => {
    const aliceAgent = request.agent(app)
    const alice = await makeUserWithParcel(aliceAgent, 'alice@test.com', 'AAAA0001')

    const bobAgent = request.agent(app)
    await register(bobAgent, 'bob@test.com')

    const attack = await bobAgent.post(`/parcels/${alice.id}/mock-deliver`)
    expect(attack.status).toBe(404)

    // Alice's parcel must still be in_transit, no notification on B's side
    const aliceParcel = await aliceAgent.get(`/parcels/${alice.id}`)
    expect(aliceParcel.body.status).not.toBe('delivered')
    const bobNotifs = await bobAgent.get('/notifications')
    expect(bobNotifs.body).toHaveLength(0)
  })
})

describe('US2.8 — confirm + rate flow', () => {
  test('PUT rating on delivered parcel succeeds and marks notification read', async () => {
    const agent = request.agent(app)
    const parcel = await makeUserWithParcel(agent)
    await agent.post(`/parcels/${parcel.id}/mock-deliver`)

    const rate = await agent.put(`/parcels/${parcel.id}/rating`)
      .send({ stars: 5, comment: 'Fast and clean' })
    expect(rate.status).toBe(200)
    expect(rate.body.stars).toBe(5)
    expect(rate.body.comment).toBe('Fast and clean')

    // Notification should now be read — unread count back to 0
    const count = await agent.get('/notifications/unread-count')
    expect(count.body.count).toBe(0)
  })

  test('PUT rating on a non-delivered parcel returns 400 not_delivered', async () => {
    const agent = request.agent(app)
    const parcel = await makeUserWithParcel(agent)

    const res = await agent.put(`/parcels/${parcel.id}/rating`)
      .send({ stars: 5 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('not_delivered')
  })

  test('PUT rating rejects invalid star counts (0, 6, fractional)', async () => {
    const agent = request.agent(app)
    const parcel = await makeUserWithParcel(agent)
    await agent.post(`/parcels/${parcel.id}/mock-deliver`)

    for (const bad of [0, 6, 3.5, -1]) {
      const res = await agent.put(`/parcels/${parcel.id}/rating`).send({ stars: bad })
      expect(res.status).toBe(400)
    }
  })

  test('PUT rating twice updates the existing rating, does not duplicate', async () => {
    const agent = request.agent(app)
    const parcel = await makeUserWithParcel(agent)
    await agent.post(`/parcels/${parcel.id}/mock-deliver`)

    await agent.put(`/parcels/${parcel.id}/rating`).send({ stars: 3, comment: 'okay' })
    const second = await agent.put(`/parcels/${parcel.id}/rating`).send({ stars: 5, comment: 'changed mind' })
    expect(second.body.stars).toBe(5)
    expect(second.body.comment).toBe('changed mind')

    // Re-read via GET — only one rating exists
    const get = await agent.get(`/parcels/${parcel.id}/rating`)
    expect(get.body.stars).toBe(5)
  })

  test('IDOR: user B cannot rate user As parcel', async () => {
    const aliceAgent = request.agent(app)
    const alice = await makeUserWithParcel(aliceAgent)
    await aliceAgent.post(`/parcels/${alice.id}/mock-deliver`)

    const bobAgent = request.agent(app)
    await register(bobAgent, 'bob@test.com')

    const attack = await bobAgent.put(`/parcels/${alice.id}/rating`).send({ stars: 1 })
    expect(attack.status).toBe(404)
  })
})

describe('Notifications — list + mark read', () => {
  test('POST /:id/read marks a single notification read', async () => {
    const agent = request.agent(app)
    const parcel = await makeUserWithParcel(agent)
    await agent.post(`/parcels/${parcel.id}/mock-deliver`)

    const notifs = await agent.get('/notifications')
    const id = notifs.body[0].id
    const mark = await agent.post(`/notifications/${id}/read`)
    expect(mark.status).toBe(204)

    const count = await agent.get('/notifications/unread-count')
    expect(count.body.count).toBe(0)
  })

  test('IDOR: user B cannot mark user As notification read', async () => {
    const aliceAgent = request.agent(app)
    const alice = await makeUserWithParcel(aliceAgent)
    await aliceAgent.post(`/parcels/${alice.id}/mock-deliver`)
    const notifs = await aliceAgent.get('/notifications')
    const aliceNotifId = notifs.body[0].id

    const bobAgent = request.agent(app)
    await register(bobAgent, 'bob@test.com')

    const attack = await bobAgent.post(`/notifications/${aliceNotifId}/read`)
    expect(attack.status).toBe(404)

    // Alice's notification must still be unread
    const reCheck = await aliceAgent.get('/notifications/unread-count')
    expect(reCheck.body.count).toBe(1)
  })
})
