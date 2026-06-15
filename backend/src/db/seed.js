// Dev/demo seeding — guarantees a fixed login always exists so you don't have
// to re-register after every DB reset (the SQLite file is wiped on redeploy /
// ephemeral hosting, and tests use an in-memory DB).
//
// Credentials default to demo@parcelhub.com / Demo1234 and can be overridden
// with DEMO_EMAIL / DEMO_PASSWORD. The password meets the normal register
// policy (>=8 chars, a letter + a digit) so the account behaves like any other.
//
// Seeding runs automatically outside production. In production it only runs when
// SEED_DEMO is explicitly enabled, since a publicly-known credential on a live
// deployment is a security risk.

import bcrypt from 'bcryptjs'
import { getDb } from './index.js'
import { config } from '../config/index.js'

const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'demo@parcelhub.com').trim().toLowerCase()
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo1234'

function seedEnabled() {
  const flag = process.env.SEED_DEMO
  if (flag !== undefined) {
    return flag !== '0' && flag !== 'false'
  }
  return !config.isProduction
}

export function seedDemoUser() {
  if (!seedEnabled()) return

  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_EMAIL)
  if (existing) {
    console.log(`[seed] demo account present → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
    return
  }

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, config.bcryptCost)
  db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(DEMO_EMAIL, passwordHash)
  console.log(`[seed] demo account created → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
}
