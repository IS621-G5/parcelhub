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

export const config = {
  port: Number(process.env.PORT) || 3001,
  sessionSecret: process.env.SESSION_SECRET || 'dev_secret_change_in_production',
  bcryptCost: Number(process.env.BCRYPT_COST) || 10,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  dbPath: process.env.DB_PATH || './parcelhub.db',
  isProduction: process.env.NODE_ENV === 'production',
  // Sprint 3: 32-byte hex string for AES-256-GCM token encryption.
  // Run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  // to generate, store in .env (never commit), rotate annually.
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY,
}

if (!process.env.SESSION_SECRET && config.isProduction) {
  throw new Error('SESSION_SECRET is required in production')
}

if (!process.env.TOKEN_ENCRYPTION_KEY && config.isProduction) {
  throw new Error('TOKEN_ENCRYPTION_KEY is required in production')
}
