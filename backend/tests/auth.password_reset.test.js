import './helpers/setupDb.js'
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import request from 'supertest'
import { buildApp } from '../src/server.js'
import { resetDb, getDb } from '../src/db/index.js'

let app
let logSpy
let lastToken

function captureTokenLine(line) {
  const m = line.match(/Token:\s+([0-9a-f]{64})/)
  if (m) lastToken = m[1]
}

beforeEach(() => {
  resetDb()
  app = buildApp()
  lastToken = null
  // Spy on console.log to grab the token the forgot-password route prints,
  // since the MVP doesn't actually send email.
  logSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
    captureTokenLine(args.join(' '))
  })
})

afterEach(() => {
  logSpy.mockRestore()
})

async function register(email = 'alice@test.com', password = 'ValidPass1') {
  return request(app).post('/auth/register').send({ email, password })
}

async function forgot(email) {
  return request(app).post('/auth/forgot-password').send({ email })
}

describe('POST /auth/forgot-password — anti-enumeration', () => {
  test('returns 200 and logs token when email exists', async () => {
    await register('alice@test.com')
    const res = await forgot('alice@test.com')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(lastToken).toMatch(/^[0-9a-f]{64}$/)
  })

  test('returns 200 with the SAME shape when email does not exist', async () => {
    const res = await forgot('nobody@test.com')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(lastToken).toBeNull()
  })

  test('rejects malformed email with 400', async () => {
    const res = await forgot('not-an-email')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_input')
  })
})

describe('POST /auth/reset-password — happy path', () => {
  test('resets password — new works, old does not', async () => {
    await register('alice@test.com', 'OldValid1')
    await forgot('alice@test.com')
    const token = lastToken

    const reset = await request(app).post('/auth/reset-password')
      .send({ token, password: 'NewValid2' })
    expect(reset.status).toBe(200)
    expect(reset.body.ok).toBe(true)

    const oldLogin = await request(app).post('/auth/login')
      .send({ email: 'alice@test.com', password: 'OldValid1' })
    expect(oldLogin.status).toBe(401)

    const newLogin = await request(app).post('/auth/login')
      .send({ email: 'alice@test.com', password: 'NewValid2' })
    expect(newLogin.status).toBe(200)
  })
})

describe('POST /auth/reset-password — negative paths', () => {
  test('single-use: rejects a token that was already used', async () => {
    await register()
    await forgot('alice@test.com')
    const token = lastToken

    await request(app).post('/auth/reset-password')
      .send({ token, password: 'NewValid2' })
    const second = await request(app).post('/auth/reset-password')
      .send({ token, password: 'OtherValid3' })
    expect(second.status).toBe(400)
    expect(second.body.error).toBe('invalid_token')
  })

  test('rejects an expired token', async () => {
    await register()
    await forgot('alice@test.com')
    const token = lastToken

    // Manually expire it (test only)
    getDb().prepare(`UPDATE password_reset_tokens
                     SET expires_at = datetime('now', '-1 hour')`).run()

    const res = await request(app).post('/auth/reset-password')
      .send({ token, password: 'NewValid2' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_token')
  })

  test('rejects a token that does not exist in DB', async () => {
    const res = await request(app).post('/auth/reset-password')
      .send({ token: 'a'.repeat(64), password: 'NewValid2' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_token')
  })

  test('rejects malformed token (wrong length / non-hex)', async () => {
    const res = await request(app).post('/auth/reset-password')
      .send({ token: 'too-short', password: 'NewValid2' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_input')
  })

  test('rejects a weak new password even with a valid token', async () => {
    await register()
    await forgot('alice@test.com')
    const token = lastToken

    const res = await request(app).post('/auth/reset-password')
      .send({ token, password: 'weak' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_input')
  })
})

describe('POST /auth/reset-password — security: superseding', () => {
  test('a new reset request invalidates the previous outstanding token', async () => {
    await register()
    await forgot('alice@test.com')
    const firstToken = lastToken

    lastToken = null
    await forgot('alice@test.com')
    const secondToken = lastToken

    expect(secondToken).not.toBe(firstToken)

    // Phishing scenario: old token must not work once a new one is issued
    const oldRes = await request(app).post('/auth/reset-password')
      .send({ token: firstToken, password: 'NewValid2' })
    expect(oldRes.status).toBe(400)
    expect(oldRes.body.error).toBe('invalid_token')

    const newRes = await request(app).post('/auth/reset-password')
      .send({ token: secondToken, password: 'NewValid2' })
    expect(newRes.status).toBe(200)
  })
})
