import { useState } from 'react'
import { api } from '../api.js'

export default function ForgotPassword({ switchToLogin }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.forgotPassword(email)
      // Anti-enumeration: we always show the same success message regardless
      // of whether the email exists.
      setSent(true)
    } catch (err) {
      if (err.status === 400) setError('Please enter a valid email address.')
      else                    setError('Something went wrong. Please try again.')
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
        <div className="aside-hero">
          <h1>Forgot your password?</h1>
          <p>
            No problem — we'll send you a reset link. Check your inbox (and
            in dev mode, your backend server console) for a one-time link.
          </p>
        </div>
        <div className="aside-foot">© 2026 ParcelHub · Team G5</div>
      </aside>

      <div className="auth-form-wrap">
        {sent ? (
          <div className="auth-form">
            <h2>Check your email</h2>
            <p className="subtitle">
              If an account exists for <strong>{email}</strong>, a reset link has been sent.
              The link expires in 1 hour.
            </p>
            <p className="subtitle" style={{ marginTop: 12 }}>
              <em>Dev mode: open your backend terminal to see the reset link printed there.</em>
            </p>
            <div className="auth-actions">
              <button className="btn-primary" onClick={switchToLogin}>Back to log in</button>
            </div>
          </div>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <h2>Reset your password</h2>
            <p className="subtitle">Enter the email you signed up with.</p>

            <div className="field">
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={busy}
              />
            </div>

            {error && <div className="error">{error}</div>}

            <div className="auth-actions">
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
              <div className="alt-line">
                Remembered it?{' '}
                <span className="link-btn" onClick={switchToLogin}>Back to log in</span>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
