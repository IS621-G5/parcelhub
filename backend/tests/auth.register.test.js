import './helpers/setupDb.js'
import { jest, describe, test, expect, beforeEach } from '@jest/globals'
import request from 'supertest'
import { buildApp } from '../src/server.js'
import { resetDb } from '../src/db/index.js'

let app
beforeEach(() => {
  resetDb()           // fresh :memory: DB per test
  app = buildApp()    // fresh app per test (new session store)
})

describe('POST /auth/register — negative paths', () => {
  test('invalid email returns 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'ValidPass1' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_input')
  })

  test('weak password (too short) returns 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@test.com', password: 'abc' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_input')
  })

  test('weak password (no digit) returns 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'bob@test.com', password: 'OnlyLetters' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_input')
  })

  test('duplicate email returns 409', async () => {
    // First registration succeeds
    const first = await request(app)
      .post('/auth/register')
      .send({ email: 'dup@test.com', password: 'ValidPass1' })
    expect(first.status).toBe(201)

    // Second with same email fails with 409
    const second = await request(app)
      .post('/auth/register')
      .send({ email: 'dup@test.com', password: 'ValidPass1' })
    expect(second.status).toBe(409)
    expect(second.body.error).toBe('email_taken')
  })

  test('missing fields return 400', async () => {
    const res = await request(app).post('/auth/register').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_input')
  })

  test('successful registration returns 201 with user object (no password hash)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'success@test.com', password: 'ValidPass1' })
    expect(res.status).toBe(201)
    expect(res.body.email).toBe('success@test.com')
    expect(res.body.password_hash).toBeUndefined()
    expect(res.body.id).toBeGreaterThan(0)
  })
})
