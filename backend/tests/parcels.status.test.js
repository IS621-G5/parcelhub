import './helpers/setupDb.js'
import { describe, test, expect, beforeEach } from '@jest/globals'
import request from 'supertest'
import { buildApp } from '../src/server.js'
import { resetDb } from '../src/db/index.js'

let app
beforeEach(() => { resetDb(); app = buildApp() })

async function userWithParcel(agent, email = 'anom@test.com', tn = 'DHL90001') {
  await agent.post('/auth/register').send({ email, password: 'ValidPass1' })
  const res = await agent.post('/parcels').send({ tracking_number: tn, provider: 'DHL', label: 'Box' })
  return res.body
}

// Demo status simulation — makes the "anomaly-first" states reachable in the MVP.
describe('POST /parcels/:id/mock-status', () => {
  test('owner sets status to stuck → status flips + unread exception alert fires', async () => {
    const agent = request.agent(app)
    const parcel = await userWithParcel(agent)

    const res = await agent.post(`/parcels/${parcel.id}/mock-status`).send({ status: 'stuck' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('stuck')

    const notifs = await agent.get('/notifications')
    const alert = notifs.body.find(n => n.type === 'exception_alert' && n.parcel_id === parcel.id)
    expect(alert).toBeTruthy()
    expect(alert.read_at).toBeNull()
    expect((await agent.get('/notifications/unread-count')).body.count).toBe(1)
  })

  test('owner sets status to exception', async () => {
    const agent = request.agent(app)
    const parcel = await userWithParcel(agent)
    const res = await agent.post(`/parcels/${parcel.id}/mock-status`).send({ status: 'exception' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('exception')
  })

  test('resolving (in_transit) clears the exception alert', async () => {
    const agent = request.agent(app)
    const parcel = await userWithParcel(agent)
    await agent.post(`/parcels/${parcel.id}/mock-status`).send({ status: 'stuck' })
    expect((await agent.get('/notifications/unread-count')).body.count).toBe(1)

    const res = await agent.post(`/parcels/${parcel.id}/mock-status`).send({ status: 'in_transit' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('in_transit')
    expect((await agent.get('/notifications/unread-count')).body.count).toBe(0)
  })

  test('rejects a status outside the allowlist', async () => {
    const agent = request.agent(app)
    const parcel = await userWithParcel(agent)
    const delivered = await agent.post(`/parcels/${parcel.id}/mock-status`).send({ status: 'delivered' })
    expect(delivered.status).toBe(400)
    const garbage = await agent.post(`/parcels/${parcel.id}/mock-status`).send({ status: 'whatever' })
    expect(garbage.status).toBe(400)
  })

  test('IDOR: another user cannot change my parcel status', async () => {
    const aliceAgent = request.agent(app)
    const alice = await userWithParcel(aliceAgent, 'alice@an.com', 'DHL90002')

    const bobAgent = request.agent(app)
    await bobAgent.post('/auth/register').send({ email: 'bob@an.com', password: 'ValidPass1' })
    const attack = await bobAgent.post(`/parcels/${alice.id}/mock-status`).send({ status: 'stuck' })
    expect(attack.status).toBe(404)

    const list = await aliceAgent.get('/parcels')
    expect(list.body[0].status).not.toBe('stuck')
  })

  test('re-entering a problem state re-opens the single alert (dedup)', async () => {
    const agent = request.agent(app)
    const parcel = await userWithParcel(agent)
    await agent.post(`/parcels/${parcel.id}/mock-status`).send({ status: 'stuck' })       // alert (unread)
    await agent.post(`/parcels/${parcel.id}/mock-status`).send({ status: 'in_transit' })  // resolve → read
    await agent.post(`/parcels/${parcel.id}/mock-status`).send({ status: 'exception' })   // re-alert

    const notifs = await agent.get('/notifications')
    const alerts = notifs.body.filter(n => n.type === 'exception_alert' && n.parcel_id === parcel.id)
    expect(alerts).toHaveLength(1)         // dedup: still one row
    expect(alerts[0].read_at).toBeNull()   // re-opened
    expect((await agent.get('/notifications/unread-count')).body.count).toBe(1)
  })
})
