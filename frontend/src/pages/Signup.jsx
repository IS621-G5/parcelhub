import { useState } from 'react'
import { api } from '../api.js'

export default function Signup({ onRegistered, switchToLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.signup(email, password)
      // Registration should not drop the user straight into the app — clear the
      // session the backend established and send them to the login page to sign
      // in explicitly.
      await api.logout().catch(() => {})
      onRegistered(email)
    } catch (err) {
      if (err.status === 400) {
        const issue = err.data?.issues?.[0]?.message
        setError(issue ? `Invalid input — ${issue}.` : 'Please check your email and password.')
      } else if (err.status === 409) {
        setError('That email is already registered. Try logging in instead.')
      } else {
        setError('Something went wrong. Please try again.')
      }
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
        <div className="aside-hero"><div className="eyebrow">Get started</div>
          <h1>Stop chasing tracking numbers.</h1>
          <p>
            Sign up to bring every parcel into one anomaly-first inbox —
            so stuck shipments stop catching you by surprise.
          </p>
        </div>
        <div className="aside-foot">© 2026 ParcelHub · Team G5</div>
      </aside>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={onSubmit}>
          <h2>Create your account</h2>
          <p className="subtitle">Free, no credit card needed.</p>

          <div className="field">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </div>

          <div className="field">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={busy}
            />
            <span className="hint">At least 8 characters, with one letter and one digit.</span>
          </div>

          {error && <div className="error">{error}</div>}

          <div className="auth-actions">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
            <div className="alt-line">
              Already have an account?{' '}
              <span className="link-btn" onClick={switchToLogin}>Log in</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
