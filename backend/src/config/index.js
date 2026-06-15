import { readFileSync } from 'node:fs'
import path from 'node:path'

function loadDotEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env')
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env not present — rely on process.env
  }
}

loadDotEnv()

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

export const config = {
  port: Number(process.env.PORT) || 3001,
  sessionSecret: process.env.SESSION_SECRET || 'dev_secret_change_in_production',
  bcryptCost: Number(process.env.BCRYPT_COST) || 10,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  dbPath: process.env.DB_PATH || './parcelhub.db',
  isProduction,
  // Trust the reverse proxy (Render/Fly/nginx) so req.ip and Secure-cookie
  // detection work. Driven by an explicit env var rather than NODE_ENV alone,
  // so a deployment that forgets NODE_ENV=production still keys rate limits on
  // the real client IP instead of the proxy's. Defaults on in production.
  trustProxy: process.env.TRUST_PROXY
    ? process.env.TRUST_PROXY !== '0' && process.env.TRUST_PROXY !== 'false'
    : isProduction,
}

// A hardcoded session secret is only acceptable for local dev and tests.
// Any deployment-like environment (production, staging, …) must supply its own,
// otherwise session cookies could be forged with a publicly-known key. We allow
// the fallback only when NODE_ENV is unset, 'development', or 'test'.
const LOCAL_ENVS = new Set([undefined, 'development', 'test'])
if (!process.env.SESSION_SECRET && !LOCAL_ENVS.has(process.env.NODE_ENV)) {
  throw new Error('SESSION_SECRET is required outside local development')
}
