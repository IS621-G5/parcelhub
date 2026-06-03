import express from 'express'
import session from 'express-session'
import cors from 'cors'
import { config } from './config/index.js'
import { getDb } from './db/index.js'
import userRoutes from './modules/users/routes.js'
import parcelRoutes from './modules/parcels/routes.js'
import notificationRoutes from './modules/notifications/routes.js'

export function buildApp() {
  const app = express()

  app.use(cors({
    origin: config.frontendOrigin,
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
  app.use('/notifications', notificationRoutes)

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
