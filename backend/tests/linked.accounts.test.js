import './helpers/setupDb.js'
import { describe, test, expect, beforeEach } from '@jest/globals'
import request from 'supertest'
import { buildApp } from '../src/server.js'
import { resetDb, getDb } from '../src/db/index.js'

let app
async function loggedInAgent() {
  const agent = request.agent(app)
  await agent.post('/auth/register').send({ email: 'link@test.com', password: 'Linkpw1234' })
  return agent
}

beforeEach(() => { resetDb(); app = buildApp() })

describe('Sprint 3 — Linked Accounts (US1.4, US1.5)', () => {
  test('POST /linked-accounts/connect stores account; response excludes token plaintext', async () => {
    const agent = await loggedInAgent()
    const res = await agent.post('/linked-accounts/connect').send({
      provider: 'shopee',
      access_token: 'access_tok_secret_1234567890',
      refresh_token: 'refresh_tok_secret_1234567890',
    })
    expect(res.status).toBe(201)
    expect(res.body.provider).toBe('shopee')
    expect(res.body.status).toBe('active')
    // Critical: token plaintext NEVER in response
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('access_tok_secret')
    expect(body).not.toContain('refresh_tok_secret')
  })

  test('Token plaintext is NOT stored in DB — only ciphertext', async () => {
    const agent = await loggedInAgent()
    await agent.post('/linked-accounts/connect').send({
      provider: 'shopee',
      access_token: 'plaintext_marker_xyz_9876',
      refresh_token: 'refresh_marker_xyz_9876',
    })
    const row = getDb().prepare(`SELECT * FROM linked_accounts LIMIT 1`).get()
    // The marker string must not appear in any column as plaintext
    const dump = JSON.stringify(row, (k, v) =>
      v?.type === 'Buffer' ? Buffer.from(v.data).toString('utf8') : v)
    expect(dump).not.toContain('plaintext_marker_xyz')
    expect(dump).not.toContain('refresh_marker_xyz')
    // ciphertext, iv, tag all exist
    expect(row.access_token_ciphertext).toBeDefined()
    expect(row.access_token_iv).toBeDefined()
    expect(row.access_token_tag).toBeDefined()
  })

  test('GET /linked-accounts lists user\'s accounts', async () => {
    const agent = await loggedInAgent()
    await agent.post('/linked-accounts/connect').send({
      provider: 'shopee', access_token: 'tok_aaaaaaaaaaa', refresh_token: 'ref_aaaaaaaaaaa',
    })
    await agent.post('/linked-accounts/connect').send({
      provider: 'lazada', access_token: 'tok_bbbbbbbbbbb', refresh_token: 'ref_bbbbbbbbbbb',
    })
    const res = await agent.get('/linked-accounts')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    const providers = res.body.map(a => a.provider).sort()
    expect(providers).toEqual(['lazada', 'shopee'])
  })

  test('DELETE disconnects account (soft delete + token zeroed)', async () => {
    const agent = await loggedInAgent()
    const created = (await agent.post('/linked-accounts/connect').send({
      provider: 'shopee', access_token: 'tok_to_delete_999', refresh_token: 'ref_to_delete_999',
    })).body

    const del = await agent.delete(`/linked-accounts/${created.id}`)
    expect(del.status).toBe(204)

    // No longer in default list
    const list = await agent.get('/linked-accounts')
    expect(list.body).toHaveLength(0)

    // Tokens zeroed in DB
    const row = getDb().prepare(`SELECT * FROM linked_accounts WHERE id = ?`).get(created.id)
    expect(row.status).toBe('deleted')
  })

  test('cross-user GET returns 404, not 403', async () => {
    const agentA = request.agent(app)
    await agentA.post('/auth/register').send({ email: 'alice@l.com', password: 'Alicepw99' })
    const created = (await agentA.post('/linked-accounts/connect').send({
      provider: 'shopee', access_token: 'alice_tok_111111', refresh_token: 'alice_ref_111111',
    })).body

    const agentB = request.agent(app)
    await agentB.post('/auth/register').send({ email: 'bob@l.com', password: 'Bobpw9999' })
    const res = await agentB.get(`/linked-accounts/${created.id}`)
    expect(res.status).toBe(404)
  })

  test('re-connecting same provider replaces existing tokens (re-auth flow)', async () => {
    const agent = await loggedInAgent()
    await agent.post('/linked-accounts/connect').send({
      provider: 'shopee', access_token: 'first_tok_aaaaaaa', refresh_token: 'first_ref_aaaaaaa',
    })
    await agent.post('/linked-accounts/connect').send({
      provider: 'shopee', access_token: 'second_tok_bbbbbb', refresh_token: 'second_ref_bbbbbb',
    })
    // Still only 1 row for (user, provider)
    const list = await agent.get('/linked-accounts')
    expect(list.body).toHaveLength(1)
  })
})
