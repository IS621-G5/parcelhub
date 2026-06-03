import express from 'express'
import session from 'express-session'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config/index.js'
import { getDb } from './db/index.js'
import userRoutes from './modules/users/routes.js'
import parcelRoutes from './modules/parcels/routes.js'
import sendRoutes from './modules/send/routes.js'
import linkedRoutes from './modules/linked/routes.js'
import returnsRoutes from './modules/returns/routes.js'
import notificationRoutes from './modules/notifications/routes.js'
import providersRoutes from './modules/providers/routes.js'

export function buildApp() {
  const app = express()

  // ─── T-SEC-04: Runtime hardening ─────────────────────────────────────
  // Helmet ships sensible defaults:
  //   X-Content-Type-Options: nosniff   (no MIME-sniffing)
  //   X-Frame-Options: SAMEORIGIN       (clickjacking defense)
  //   X-DNS-Prefetch-Control: off
  //   Strict-Transport-Security         (when over HTTPS)
  //   Referrer-Policy: no-referrer
  // CSP is disabled because we're a JSON API, not an HTML server, and an
  // unintended CSP could break the cross-origin SPA fetch.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }))

  // ─── CORS — allowlist mode, not wildcard ─────────────────────────────
  // Only requests with Origin == config.frontendOrigin succeed. Requests
  // with no Origin (e.g. curl, same-origin SSR) are also allowed because
  // the browser only enforces CORS for cross-origin requests.
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (origin === config.frontendOrigin) return cb(null, true)
      // Clean rejection — no CORS headers sent, browser blocks the response.
      // We don't throw because we don't want a 500 here.
      cb(null, false)
    },
    credentials: true,
  }))
  app.use(express.json({ limit: '100kb' }))

  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }))

  app.get('/health', (req, res) => res.json({ ok: true }))

  app.use('/auth', userRoutes)
  app.use('/parcels', parcelRoutes)
  app.use('/send', sendRoutes)
  app.use('/linked-accounts', linkedRoutes)
  app.use('/returns', returnsRoutes)
  app.use('/notifications', notificationRoutes)
  app.use('/oauth', providersRoutes)

  // Central error handler — never expose stack traces in JSON
  app.use((err, req, res, next) => {
    console.error('[error]', err)
    res.status(500).json({ error: 'internal_error' })
  })

  return app
}

// Only start the HTTP listener when this file is run directly, not when
// imported by the test suite.
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  // Initialize DB up front so the first request isn't slowed
  getDb()
  const app = buildApp()
  app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`)
    console.log(`[server] frontend allowed: ${config.frontendOrigin}`)
  })
}
