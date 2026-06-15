import { useEffect, useState } from 'react'
import { api } from './api.js'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import MockOAuthAuthorize from './pages/MockOAuthAuthorize.jsx'

// ─── URL-param routing for one-off entry points ────────────────────
// Three special URLs land you somewhere other than the normal app:
//   ?reset=<64-hex>                                     → ResetPassword
//   ?oauth_authorize=shopee&state=…&redirect_uri=…      → MockOAuthAuthorize
//   ?oauth_code=…&provider=…&state=…                    → OAuth callback path
// Everything else is the normal authed/unauthed flow.

function readParams() {
  const p = new URLSearchParams(window.location.search)
  return {
    resetToken:    p.get('reset'),
    oauthAuthorize: p.get('oauth_authorize'),
    oauthState:    p.get('state'),
    oauthRedirect: p.get('redirect_uri'),
    oauthCode:     p.get('oauth_code'),
    oauthProvider: p.get('provider'),
    oauthError:    p.get('oauth_error'),
  }
}

function clearQuery() {
  window.history.replaceState({}, '', window.location.pathname)
}

const OAUTH_STATE_KEY = 'parcelhub.oauth.state'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('login')   // 'login' | 'signup' | 'forgot' | 'reset' | 'dashboard' | 'mock-oauth'
  const [resetToken, setResetToken] = useState(null)
  const [mockOAuth, setMockOAuth] = useState(null)   // { provider, state, redirect_uri }
  const [oauthFeedback, setOauthFeedback] = useState(null)  // surfaces back to Dashboard

  useEffect(() => {
    // Show any OAuth success message stashed before a post-import reload
    const flash = sessionStorage.getItem('oauth_flash')
    if (flash) {
      sessionStorage.removeItem('oauth_flash')
      setOauthFeedback({ type: 'success', message: flash })
    }

    const params = readParams() 

    // ── 1. Forgot-password reset link
    if (params.resetToken && /^[0-9a-f]{64}$/.test(params.resetToken)) {
      setResetToken(params.resetToken)
      setPage('reset')
      setLoading(false)
      return
    }

    // ── 2. Mock OAuth authorize page (when redirected from "Connect")
    if (params.oauthAuthorize) {
      setMockOAuth({
        provider: params.oauthAuthorize,
        state: params.oauthState,
        redirectUri: params.oauthRedirect || window.location.origin,
      })
      setPage('mock-oauth')
      setLoading(false)
      return
    }

    // ── 3. OAuth callback (returning from authorize page)
    if (params.oauthCode || params.oauthError) {
      handleOAuthCallback(params).finally(() => clearQuery())
      // fall through to load user normally — handleOAuthCallback fires reload
    }

    // ── Default: try to load the session
    api.me()
      .then(u => { setUser(u); setPage('dashboard') })
      .catch(() => { /* not logged in */ })
      .finally(() => setLoading(false))
  }, [])

  async function handleOAuthCallback({ oauthCode, oauthProvider, oauthState, oauthError }) {
    if (oauthError) {
      setOauthFeedback({ type: 'error', message: oauthError === 'user_cancelled'
        ? 'Authorization cancelled.'
        : `OAuth error: ${oauthError}` })
      return
    }
    // CSRF check: the state we sent before redirecting must match what came back
    const stored = sessionStorage.getItem(OAUTH_STATE_KEY)
    sessionStorage.removeItem(OAUTH_STATE_KEY)
    if (!stored || stored !== oauthState) {
      setOauthFeedback({ type: 'error', message: 'OAuth state mismatch — possible CSRF. Try again.' })
      return
    }
    try {
      const result = await api.oauth.callback(oauthProvider, oauthCode)
      if (result.error) {
        setOauthFeedback({
          type: 'error',
          message: `Connection failed: ${result.error}`,
        })
        return
      }
      const imp = result.import || {}
      const imported = imp.imported ?? 0
      const noTrack = imp.skipped_no_tracking ?? 0
      const dup = imp.skipped_duplicate ?? (imp.skipped ?? 0)  // fallback if backend not updated
      const provName = `${oauthProvider[0].toUpperCase()}${oauthProvider.slice(1)}`

      const parts = [`${imported} parcel${imported === 1 ? '' : 's'} imported`]
      if (noTrack) parts.push(`${noTrack} not shipped yet`)
      if (dup) parts.push(`${dup} already in your list`)

        const successMsg = `${provName} connected — ${parts.join(' · ')}.`
        if (imported > 0) {
          // Stash the message so it survives the reload that refreshes the list
          window.history.replaceState({}, '', window.location.pathname)
          window.location.reload()
        } else {
          setOauthFeedback({ type: 'success', message: successMsg })
        }
    } catch (err) {
      setOauthFeedback({
        type: 'error',
        message: err.data?.error
          ? `Connection failed: ${err.data.error}`
          : 'Connection failed. Please try again.',
      })
    }
  }

  function onAuth(u) {
    setUser(u)
    setPage('dashboard')
  }

  async function onLogout() {
    try { await api.logout() } catch {}
    setUser(null)
    setPage('login')
  }

  function goToLogin() {
    clearQuery()
    setResetToken(null)
    setPage('login')
  }

  if (loading) {
    return <div className="loading">Loading…</div>
  }

  return (
    <div className="app">
      {page === 'login'      && <Login          onAuth={onAuth} switchToSignup={() => setPage('signup')} switchToForgot={() => setPage('forgot')} />}
      {page === 'signup'     && <Signup         onAuth={onAuth} switchToLogin={() => setPage('login')} />}
      {page === 'forgot'     && <ForgotPassword switchToLogin={() => setPage('login')} />}
      {page === 'reset'      && <ResetPassword  token={resetToken} switchToLogin={goToLogin} />}
      {page === 'mock-oauth' && <MockOAuthAuthorize
                                  provider={mockOAuth?.provider}
                                  state={mockOAuth?.state}
                                  redirectUri={mockOAuth?.redirectUri} />}
      {page === 'dashboard'  && <Dashboard
                                  user={user}
                                  onLogout={onLogout}
                                  oauthFeedback={oauthFeedback}
                                  onClearOAuthFeedback={() => setOauthFeedback(null)} />}
    </div>
  )
}
