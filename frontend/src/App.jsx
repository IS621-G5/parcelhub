import { useEffect, useState } from 'react'
import { api } from './api.js'

// Three views the app can be in
const VIEW = {
  LOGIN: 'login',
  REGISTER: 'register',
  HOME: 'home',
}

export default function App() {
  const [view, setView] = useState(VIEW.LOGIN)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)  // initial "am I logged in?" check

  // On mount, check if there's an active session
  useEffect(() => {
    api.me()
      .then((u) => {
        setUser(u)
        setView(VIEW.HOME)
      })
      .catch(() => {
        // Not logged in — stay on login view
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="center">Loading…</div>
  }

  // Logged in → home view
  if (view === VIEW.HOME && user) {
    return (
      <Home
        user={user}
        onLogout={async () => {
          await api.logout()
          setUser(null)
          setView(VIEW.LOGIN)
        }}
      />
    )
  }

  // Not logged in → register or login form
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span className="brand-name">ParcelHub</span>
        </div>
        <div className="aside-pitch">
          <h1>See the parcels that <em>actually need</em> you.</h1>
          <p>One inbox for every courier. We highlight delays and exceptions first.</p>
        </div>
      </aside>

      <main className="auth-form-wrap">
        {view === VIEW.LOGIN ? (
          <LoginForm
            onSuccess={(u) => { setUser(u); setView(VIEW.HOME) }}
            switchToRegister={() => setView(VIEW.REGISTER)}
          />
        ) : (
          <RegisterForm
            onSuccess={(u) => { setUser(u); setView(VIEW.HOME) }}
            switchToLogin={() => setView(VIEW.LOGIN)}
          />
        )}
      </main>
    </div>
  )
}

// ─── Login form ───────────────────────────────────────────────────────────
function LoginForm({ onSuccess, switchToRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const user = await api.login(email, password)
      onSuccess(user)
    } catch (err) {
      // Map server error codes to friendly messages
      if (err.status === 401) {
        setError('Incorrect email or password.')
      } else if (err.status === 400) {
        setError('Please check your email and password format.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>Welcome back</h2>
      <p className="subtitle">Sign in to your ParcelHub account.</p>

      <label>Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />

      <label>Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />

      {error && <div className="error">{error}</div>}

      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="below">
        New to ParcelHub?{' '}
        <button type="button" className="link" onClick={switchToRegister}>
          Create an account
        </button>
      </p>
    </form>
  )
}

// ─── Register form ────────────────────────────────────────────────────────
function RegisterForm({ onSuccess, switchToLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const user = await api.register(email, password)
      onSuccess(user)
    } catch (err) {
      if (err.status === 409) {
        setError('That email is already registered. Try signing in instead.')
      } else if (err.status === 400) {
        // zod validation issues come back in err.data.issues
        const firstIssue = err.data?.issues?.[0]
        setError(firstIssue?.message || 'Please check your input.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>Create your account</h2>
      <p className="subtitle">It only takes a few seconds.</p>

      <label>Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />

      <label>Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
        minLength={8}
      />
      <p className="hint">8+ characters with at least one letter and one digit.</p>

      {error && <div className="error">{error}</div>}

      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? 'Creating account…' : 'Create account'}
      </button>

      <p className="below">
        Already have an account?{' '}
        <button type="button" className="link" onClick={switchToLogin}>
          Sign in
        </button>
      </p>
    </form>
  )
}

// ─── Home (post-login placeholder) ───────────────────────────────────────
// Replace this with the dashboard from the earlier mockup once auth is wired up.
function Home({ user, onLogout }) {
  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span className="brand-name">ParcelHub</span>
        </div>
        <div className="home-user">
          <span>{user.email}</span>
          <button onClick={onLogout} className="link">Sign out</button>
        </div>
      </header>

      <main className="home-main">
        <h1>You're signed in.</h1>
        <p className="subtitle">User ID #{user.id}</p>
        <p>This is where the dashboard goes. Connect your tracking numbers to see anomalies first.</p>
      </main>
    </div>
  )
}
