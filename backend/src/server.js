import express from 'express'
import session from 'express-session'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config/index.js'
import { getDb } from './db/index.js'
import userRoutes from './modules/users/routes.js'
import parcelRoutes from './modules/parcels/routes.js'
import notificationRoutes from './modules/notifications/routes.js'

export function buildApp() {
  const app = express()

  // ─── T-SEC-04: Runtime hardening ─────────────────────────────────────
  // Helmet ships sensible defaults:
  //   X-Content-Type-Options: nosniff   (no MIME-sniffing)
  //   X-Frame-Options: SAMEORIGIN       (clickjacking defense)
  //   X-DNS-Prefetch-Control: off
  //   Strict-Transport-Security         (when over HTTPS)
  //   Referrer-Policy: no-referrer
  // CSP is disabled because we're a JSON API, not an HTML server.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }))

  // ─── CORS allowlist mode (not wildcard) ─────────────────────────────
  // Only requests with Origin == config.frontendOrigin succeed. Requests
  // with no Origin (curl, same-origin SSR) also allowed because the
  // browser only enforces CORS for cross-origin requests.
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (origin === config.frontendOrigin) return cb(null, true)
      cb(null, false)
    },
    credentials: true,
  }))
  app.use(express.json({ limit: '100kb' }))

  // Behind a reverse proxy (Render, Fly, Railway, nginx) we need to trust
  // X-Forwarded-Proto so express-session knows the request is over HTTPS
  // and is willing to set Secure cookies.
  if (config.isProduction) {
    app.set('trust proxy', 1)
  }

  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Cross-site cookies (frontend.onrender.com → backend.onrender.com)
      // need SameSite=None + Secure. Local dev uses Lax over HTTP.
      sameSite: config.isProduction ? 'none' : 'lax',
      secure: config.isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }))

  app.get('/health', (req, res) => res.json({ ok: true }))

  app.use('/auth', userRoutes)
  app.use('/parcels', parcelRoutes)
  app.use('/notifications', notificationRoutes)

  // Central error handler — never expose stack traces in JSON
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err)
    res.status(500).json({ error: 'internal_server_error' })
  })

  return app
}

// ──── Start the HTTP listener ───────────────────────────────────────
// Skipped in tests — Supertest mounts buildApp() directly and we mustn't
// hold open a real port. NODE_ENV=test is set by the test runner.
if (process.env.NODE_ENV !== 'test') {
  getDb()
  const app = buildApp()
  app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`)
    console.log(`[server] frontend allowed: ${config.frontendOrigin}`)
  })
}