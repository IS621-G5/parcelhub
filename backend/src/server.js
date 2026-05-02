// Express server entry point.
// Run with:  npm run dev
// Listens on http://localhost:3000

import express from 'express'
import cors from 'cors'
import session from 'express-session'
import authRoutes from './auth.js'

const app = express()

// CORS: allow the frontend (running on :5173) to send cookies cross-origin
app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
)

app.use(express.json({ limit: '50kb' }))

// Session middleware — uses default in-memory store.
// In production: swap to Redis or a DB-backed store.
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,                                    // JS cannot read cookie
      secure: process.env.NODE_ENV === 'production',     // HTTPS only in prod
      sameSite: 'lax',                                   // CSRF protection
      maxAge: 24 * 60 * 60 * 1000,                       // 1 day
    },
  })
)

// Healthcheck — useful when checking the server is up
app.get('/health', (req, res) => res.json({ ok: true }))

// All auth endpoints under /auth
app.use('/auth', authRoutes)

// Catch-all 404
app.use((req, res) => res.status(404).json({ error: 'not_found' }))

// Error handler — never leak stack traces to clients
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`ParcelHub backend running on http://localhost:${PORT}`)
})
