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

async function registerUser(app, email = 'alice@test.com', password = 'ValidPass1') {
  return request(app).post('/auth/register').send({ email, password })
}

describe('POST /auth/login — negative paths', () => {
  test('wrong password returns 401', async () => {
    await registerUser(app)
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'alice@test.com', password: 'WrongPass1' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid_credentials')
  })

  test('non-existent user returns 401 (constant-time, no enumeration)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'ghost@test.com', password: 'AnyPass1' })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid_credentials')
  })

  test('malformed body returns 400', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'not-an-email' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_input')
  })

  test('session ends after logout — /auth/me returns 401', async () => {
    const agent = request.agent(app)   // persists cookies across requests
    await agent.post('/auth/register').send({ email: 'session@test.com', password: 'ValidPass1' })

    // Logged in
    const me1 = await agent.get('/auth/me')
    expect(me1.status).toBe(200)
    expect(me1.body.email).toBe('session@test.com')

    // Logout
    const logout = await agent.post('/auth/logout')
    expect(logout.status).toBe(204)

    // After logout, /auth/me must return 401
    const me2 = await agent.get('/auth/me')
    expect(me2.status).toBe(401)
  })
})
