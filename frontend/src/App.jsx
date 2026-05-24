import { useEffect, useState } from 'react'
import { api } from './api.js'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('login')   // 'login' | 'signup' | 'dashboard'

  // Restore session on first load
  useEffect(() => {
    api.me()
      .then(u => { setUser(u); setPage('dashboard') })
      .catch(() => { /* not logged in, stay on login */ })
      .finally(() => setLoading(false))
  }, [])

  function onAuth(u) {
    setUser(u)
    setPage('dashboard')
  }

  async function onLogout() {
    try { await api.logout() } catch {}
    setUser(null)
    setPage('login')
  }

  if (loading) {
    return <div className="loading">Loading…</div>
  }

  return (
    <div className="app">
      {page === 'login'    && <Login    onAuth={onAuth} switchToSignup={() => setPage('signup')} />}
      {page === 'signup'   && <Signup   onAuth={onAuth} switchToLogin={() => setPage('login')} />}
      {page === 'dashboard'&& <Dashboard user={user} onLogout={onLogout} />}
    </div>
  )
}
