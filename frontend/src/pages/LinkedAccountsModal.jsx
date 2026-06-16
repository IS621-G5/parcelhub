import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useModalA11y } from '../useModalA11y.js'

// US2.9.1 / US2.9.2 — Connect Shopee + Lazada via real OAuth 2.0 redirect.
//
// Flow:
//   1. Generate a CSRF state token, stash in sessionStorage
//   2. window.location → /?oauth_authorize=<provider>&state=&redirect_uri=
//   3. User lands on the mock authorize page (MockOAuthAuthorize.jsx)
//   4. They click "Authorize" → redirect back with ?oauth_code=&state=
//   5. App.jsx detects the callback params and calls the backend
//
// Only manage existing connections in this modal — connecting *leaves* the
// modal (real OAuth always navigates away from your app).

const PROVIDERS = [
  { key: 'shopee', label: 'Shopee', accent: '#EE4D2D', logoLetter: 'S' },
  { key: 'lazada', label: 'Lazada', accent: '#0F146D', logoLetter: 'L' },
]

const OAUTH_STATE_KEY = 'parcelhub.oauth.state'

export default function LinkedAccountsModal({ onClose, onChanged }) {
  const [linked, setLinked] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const modalRef = useRef(null)
  useModalA11y(modalRef, onClose)

  async function reload() {
    try {
      const list = await api.linked.list()
      setLinked(list || [])
    } catch {}
  }
  useEffect(() => { reload() }, [])

  function connectedRow(providerKey) {
    return linked.find(a => a.provider === providerKey && a.status !== 'deleted')
  }

  async function startOAuth(provider) {
    // Real OAuth pattern: the backend /start issues a state token bound to our
    // server-side session, we stash it for the client-side check, then NAVIGATE
    // to the provider's authorize URL. The callback validates the state both
    // client-side (App.jsx) and server-side (CSRF defense).
    setError('')
    setBusy(true)
    try {
      const { state } = await api.oauth.start(provider.key)
      sessionStorage.setItem(OAUTH_STATE_KEY, state)
      const redirectUri = window.location.origin + window.location.pathname
      const authorizeUrl = `${window.location.origin}/?oauth_authorize=${provider.key}` +
        `&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`
      window.location.assign(authorizeUrl)
    } catch {
      setBusy(false)
      setError('Could not start the connection. Please try again.')
    }
  }

  async function disconnect(account, providerLabel) {
    if (!window.confirm(`Disconnect ${providerLabel}? Stored tokens will be revoked.`)) return
    setError(''); setInfo('')
    setBusy(true)
    try {
      await api.linked.disconnect(account.id)
      setInfo(`${providerLabel} disconnected.`)
      await reload()
      onChanged?.()
    } catch {
      setError('Disconnect failed.')
    } finally {
      setBusy(false)
    }
  }

  async function resync(provider, account) {
    setError(''); setInfo('')
    setBusy(true)
    try {
      const result = await api.oauth.sync(provider.key, account.id)
      const imported = result.imported ?? 0
      setInfo(`${provider.label}: ${imported} new parcel${imported === 1 ? '' : 's'} imported.`)
      onChanged?.()
    } catch {
      setError('Re-sync failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Linked accounts"
           onClick={e => e.stopPropagation()}>
        <h2>Linked accounts</h2>
        <p className="subtitle">Connect your e-commerce accounts to auto-import parcels.</p>

        <div className="linked-list">
          {PROVIDERS.map(p => {
            const conn = connectedRow(p.key)
            return (
              <div key={p.key} className="linked-row">
                <div className="linked-info">
                  <div className={`linked-logo ${p.key}`}>{p.logoLetter}</div>
                  <div className="linked-text">
                    <div className="linked-name">{p.label}</div>
                    {conn ? (
                      <div className="linked-meta">
                        Connected {relativeTime(conn.connected_at)}
                        {conn.last_refreshed_at && <> · last sync {relativeTime(conn.last_refreshed_at)}</>}
                      </div>
                    ) : (
                      <div className="linked-meta">Not connected</div>
                    )}
                  </div>
                </div>
                <div className="linked-actions">
                  {conn ? (
                    <>
                      <button className="btn-ghost" onClick={() => resync(p, conn)} disabled={busy}>
                        Re-sync
                      </button>
                      <button className="btn-ghost danger" onClick={() => disconnect(conn, p.label)} disabled={busy}>
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button className="btn-primary" onClick={() => startOAuth(p)} disabled={busy}>
                      Connect {p.label}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 14 }}>
          Clicking <strong>Connect</strong> opens the provider's authorization page in this window.
          You'll be redirected back automatically.
        </p>

        {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
        {info && <div className="info" style={{ marginTop: 12 }}>{info}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function relativeTime(iso) {
  if (!iso) return ''
  const t = new Date(iso + (iso.includes('Z') ? '' : 'Z')).getTime()
  const diff = Date.now() - t
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
