import { useState } from 'react'
import { api } from '../api.js'

export default function ResetPassword({ token, switchToLogin }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await api.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      if (err.status === 400) {
        if (err.data?.error === 'invalid_token') {
          setError('This reset link is invalid, expired, or already used. Please request a new one.')
        } else {
          const issue = err.data?.issues?.[0]?.message
          setError(issue
            ? `Invalid input — ${issue}.`
            : 'Please enter a stronger password (at least 8 chars, with a letter and a digit).')
        }
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
        <div className="aside-hero"><div className="eyebrow">Almost done</div>
          <h1>Set a new password.</h1>
          <p>
            Choose something you can remember but no one else can guess.
            At least 8 characters, with one letter and one digit.
          </p>
        </div>
        <div className="aside-foot">© 2026 ParcelHub · Team G5</div>
      </aside>

      <div className="auth-form-wrap">
        {done ? (
          <div className="auth-form">
            <h2>Password updated</h2>
            <p className="subtitle">You can now log in with your new password.</p>
            <div className="auth-actions">
              <button className="btn-primary" onClick={switchToLogin}>Log in</button>
            </div>
          </div>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <h2>Choose a new password</h2>
            <p className="subtitle">Your reset link is valid for 1 hour.</p>

            <div className="field">
              <label htmlFor="reset-password">New password</label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={busy}
              />
              <span className="hint">At least 8 characters, with one letter and one digit.</span>
            </div>

            <div className="field">
              <label htmlFor="reset-confirm">Confirm new password</label>
              <input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                disabled={busy}
              />
            </div>

            {error && <div className="error">{error}</div>}

            <div className="auth-actions">
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Updating…' : 'Update password'}
              </button>
              <div className="alt-line">
                <span className="link-btn" onClick={switchToLogin}>Back to log in</span>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
