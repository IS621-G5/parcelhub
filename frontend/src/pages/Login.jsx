import { useState } from 'react'
import { api } from '../api.js'

export default function Login({ onAuth, switchToSignup, switchToForgot, notice, initialEmail }) {
  const [email, setEmail] = useState(initialEmail || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = await api.login(email, password)
      onAuth(user)
    } catch (err) {
      if (err.status === 400)      setError('Please enter a valid email and password.')
      else if (err.status === 401) setError('Invalid email or password.')
      else                         setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="aside-brand">
          <div className="brand-mark">P</div>
          ParcelHub
        </div>
        <div className="aside-hero"><div className="eyebrow">Anomaly-first parcel tracking</div>
          <h1>One inbox for every parcel.</h1>
          <p>
            Track Shopee, Lazada, DHL, Ninja Van, and SingPost shipments in one place —
            with anomalies surfaced first so nothing slips through.
          </p>
        </div>
        <div className="aside-foot">© 2026 ParcelHub · Team G5</div>
      </aside>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={onSubmit}>
          <h2>Welcome back</h2>
          <p className="subtitle">Sign in to view your parcels.</p>

          {notice && <div className="info">{notice}</div>}

          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={busy}
            />
            <div style={{ marginTop: 6, textAlign: 'right' }}>
              <span className="link-btn" onClick={switchToForgot}>Forgot password?</span>
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          <div className="auth-actions">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Log in'}
            </button>
            <div className="alt-line">
              New to ParcelHub?{' '}
              <span className="link-btn" onClick={switchToSignup}>Create an account</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
