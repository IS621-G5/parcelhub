import { useEffect, useState } from 'react'

// MockOAuthAuthorize.jsx
//
// Mimics a real OAuth 2.0 provider consent screen for demo purposes.
// Genuinely follows the authorization-code grant pattern:
//   1. App redirects user here with ?provider=&state=&redirect_uri=
//   2. User sees a branded "Authorize ParcelHub to access your X account" screen
//   3. On Authorize, we generate a mock code and redirect back with
//      ?oauth_code=&provider=&state=  — caller validates state for CSRF.
//
// In a real integration this page would be hosted by Shopee/Lazada and we
// wouldn't render it. For the course it gives us a clean OAuth flow that
// LOOKS like the real one without requiring partner accounts.

const PROVIDERS = {
  shopee: {
    name: 'Shopee',
    accent: '#EE4D2D',
    accentDark: '#D8431F',
    tagline: 'Asia\'s leading online shopping destination',
    logo: 'S',
    fakeUser: { name: 'demo.shopee', email: 'demo.user@shopee.sg' },
    scopes: [
      'View your order history',
      'View shipment tracking numbers',
      'View delivery status updates',
    ],
    codePrefix: 'sh-',
  },
  lazada: {
    name: 'Lazada',
    accent: '#0F146D',
    accentDark: '#001A99',
    tagline: 'Effortless shopping. Effortless tracking.',
    logo: 'L',
    fakeUser: { name: 'demo.lazada', email: 'demo.user@lazada.sg' },
    scopes: [
      'View your order history',
      'View shipment tracking numbers',
      'View delivery status updates',
    ],
    codePrefix: 'lz-',
  },
}

export default function MockOAuthAuthorize({ provider, state, redirectUri }) {
  const cfg = PROVIDERS[provider]
  const [busy, setBusy] = useState(false)

  // If unknown provider, bounce back with an error.
  useEffect(() => {
    if (!cfg && redirectUri) {
      const url = new URL(redirectUri, window.location.origin)
      url.searchParams.set('oauth_error', 'unknown_provider')
      if (state) url.searchParams.set('state', state)
      window.location.replace(url.toString())
    }
  }, [cfg, redirectUri, state])

  if (!cfg) {
    return <div style={{ padding: 40 }}>Unknown provider.</div>
  }

  function authorize() {
    setBusy(true)
    const code = `${cfg.codePrefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
    const url = new URL(redirectUri || '/', window.location.origin)
    url.searchParams.set('oauth_code', code)
    url.searchParams.set('provider', provider)
    if (state) url.searchParams.set('state', state)
    // Small UX delay so users see the "Authorizing…" feedback like real OAuth
    setTimeout(() => { window.location.replace(url.toString()) }, 500)
  }

  function cancel() {
    const url = new URL(redirectUri || '/', window.location.origin)
    url.searchParams.set('oauth_error', 'user_cancelled')
    if (state) url.searchParams.set('state', state)
    window.location.replace(url.toString())
  }

  return (
    <div className="oauth-page" style={{
      minHeight: '100vh',
      background: `linear-gradient(180deg, ${cfg.accent}15 0%, #FAFAFA 60%)`,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Provider top bar */}
      <header style={{
        padding: '14px 32px',
        background: cfg.accent,
        color: 'white',
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
      }}>
        <div style={{
          width: 28, height: 28,
          background: 'white', color: cfg.accent,
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 16,
        }}>{cfg.logo}</div>
        <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}>
          {cfg.name}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>
          {cfg.tagline}
        </div>
      </header>

      {/* Consent card */}
      <main style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          width: '100%',
          maxWidth: 480,
          background: 'white',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.15), 0 4px 12px rgba(15, 23, 42, 0.05)',
          overflow: 'hidden',
        }}>
          {/* Header strip */}
          <div style={{
            padding: '28px 32px 24px',
            borderBottom: '1px solid #E2E8F0',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
              Authorize application
            </div>
            <h1 style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '8px 0 0',
              color: '#0F172A',
            }}>
              ParcelHub wants to access your <span style={{ color: cfg.accent }}>{cfg.name}</span> account
            </h1>
          </div>

          {/* Two app logos */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '28px 32px 12px', gap: 18,
          }}>
            <AppBubble label="P" bg="#0F172A" color="white" name="ParcelHub" />
            <ConnectArrow />
            <AppBubble label={cfg.logo} bg={cfg.accent} color="white" name={cfg.name} />
          </div>

          {/* Logged-in user line */}
          <div style={{
            margin: '0 32px 16px',
            padding: '10px 14px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            fontSize: 13,
            color: '#475569',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 999,
              background: cfg.accent, color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: 13,
            }}>
              {cfg.fakeUser.name[0].toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#0F172A' }}>Signed in as {cfg.fakeUser.name}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{cfg.fakeUser.email}</div>
            </div>
          </div>

          {/* Scopes */}
          <div style={{ padding: '0 32px 8px' }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#64748B',
              marginBottom: 10,
            }}>
              This will allow ParcelHub to:
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {cfg.scopes.map((s, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  fontSize: 14,
                  color: '#1E293B',
                  padding: '6px 0',
                }}>
                  <span style={{
                    width: 20, height: 20, flexShrink: 0,
                    borderRadius: 999,
                    background: '#ECFDF5', color: '#047857',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, marginTop: 1,
                  }}>✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* Fine print */}
          <div style={{
            margin: '16px 32px 0',
            padding: '12px 14px',
            background: '#FEF3C7',
            border: '1px solid #FDE68A',
            borderRadius: 8,
            fontSize: 12,
            color: '#92400E',
            lineHeight: 1.5,
          }}>
            <strong>Demo notice:</strong> this is a mock authorization page for IS621 ParcelHub.
            Real {cfg.name} OAuth requires a registered Open Platform partner account,
            an HTTPS callback URL, and a seller (not consumer) integration scope. The
            OAuth 2.0 redirect + code-exchange flow you see here is authentic.
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex', gap: 10,
            padding: '20px 32px 28px',
          }}>
            <button
              onClick={cancel}
              disabled={busy}
              style={{
                flex: 1, height: 44,
                border: '1px solid #CBD5E1',
                background: 'white',
                color: '#475569',
                borderRadius: 10,
                fontWeight: 500,
                fontSize: 14,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}>
              Cancel
            </button>
            <button
              onClick={authorize}
              disabled={busy}
              style={{
                flex: 2, height: 44,
                background: busy ? cfg.accentDark : cfg.accent,
                color: 'white',
                border: 'none',
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 14,
                cursor: busy ? 'wait' : 'pointer',
                boxShadow: `0 4px 12px ${cfg.accent}40`,
                transition: 'all 0.15s',
              }}>
              {busy ? 'Authorizing…' : `Authorize ParcelHub`}
            </button>
          </div>
        </div>
      </main>

      <footer style={{
        textAlign: 'center',
        padding: 16,
        fontSize: 11,
        color: '#94A3B8',
      }}>
        Powered by {cfg.name} Open Platform · OAuth 2.0
      </footer>
    </div>
  )
}

function AppBubble({ label, bg, color, name }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 60, height: 60,
        background: bg, color: color,
        borderRadius: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 24,
        boxShadow: '0 4px 12px rgba(15,23,42,0.10)',
        margin: '0 auto',
      }}>{label}</div>
      <div style={{ fontSize: 12, color: '#64748B', marginTop: 6, fontWeight: 500 }}>{name}</div>
    </div>
  )
}

function ConnectArrow() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#CBD5E1' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        <span style={{ width: 6, height: 6, background: '#CBD5E1', borderRadius: 999, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <span style={{ width: 6, height: 6, background: '#CBD5E1', borderRadius: 999, animation: 'pulse 1.5s ease-in-out infinite 0.2s' }} />
        <span style={{ width: 6, height: 6, background: '#CBD5E1', borderRadius: 999, animation: 'pulse 1.5s ease-in-out infinite 0.4s' }} />
      </div>
    </div>
  )
}
