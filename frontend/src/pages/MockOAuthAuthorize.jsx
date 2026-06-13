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
    accentDeep: '#B5341A',
    tagline: "Asia's leading online shopping destination",
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
    accentDark: '#0A0E52',
    accentDeep: '#2937A6',
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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // trigger entrance animations
    const t = setTimeout(() => setMounted(true), 30)
    return () => clearTimeout(t)
  }, [])

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
    setTimeout(() => { window.location.replace(url.toString()) }, 700)
  }

  function cancel() {
    const url = new URL(redirectUri || '/', window.location.origin)
    url.searchParams.set('oauth_error', 'user_cancelled')
    if (state) url.searchParams.set('state', state)
    window.location.replace(url.toString())
  }

  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
      background: `radial-gradient(1200px 600px at 50% -10%, ${cfg.accentDeep}33 0%, transparent 60%),
                   radial-gradient(900px 500px at 90% 100%, ${cfg.accent}1a 0%, transparent 55%),
                   linear-gradient(180deg, #FAFBFF 0%, #F1F3FB 100%)`,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Keyframes */}
      <style>{`
        @keyframes oauthCardIn {
          0%   { opacity: 0; transform: translateY(16px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes oauthBarIn {
          0%   { opacity: 0; transform: translateY(-100%); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes bubbleFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-5px); }
        }
        @keyframes dotFlow {
          0%, 100% { opacity: 0.25; transform: scale(0.8); }
          50%      { opacity: 1;    transform: scale(1.15); }
        }
        @keyframes scopeIn {
          0%   { opacity: 0; transform: translateX(-8px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes sheen {
          0%   { transform: translateX(-120%); }
          60%, 100% { transform: translateX(220%); }
        }
        .oauth-authorize-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.06);
        }
        .oauth-authorize-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .oauth-cancel-btn:hover:not(:disabled) {
          background: #F1F5F9;
          border-color: #94A3B8;
        }
      `}</style>

      {/* Provider brand bar — gradient + entrance */}
      <header style={{
        padding: '16px 36px',
        background: `linear-gradient(100deg, ${cfg.accentDark} 0%, ${cfg.accent} 45%, ${cfg.accentDeep} 100%)`,
        color: 'white',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: `0 4px 24px ${cfg.accent}55`,
        animation: 'oauthBarIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{
          width: 32, height: 32,
          background: 'rgba(255,255,255,0.95)', color: cfg.accent,
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 18,
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}>{cfg.logo}</div>
        <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>
          {cfg.name}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, opacity: 0.9, fontWeight: 500 }}>
          {cfg.tagline}
        </div>
      </header>

      {/* Consent card */}
      <main style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{
          width: '100%',
          maxWidth: 480,
          background: 'white',
          borderRadius: 18,
          boxShadow: `0 32px 80px ${cfg.accent}22, 0 8px 24px rgba(15, 23, 42, 0.08)`,
          border: '1px solid rgba(255,255,255,0.8)',
          overflow: 'hidden',
          opacity: mounted ? 1 : 0,
          animation: mounted ? 'oauthCardIn 0.55s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}>
          {/* top highlight strip */}
          <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${cfg.accent}, ${cfg.accentDeep}, transparent)` }} />

          {/* Header strip */}
          <div style={{
            padding: '30px 34px 24px',
            borderBottom: '1px solid #EEF1F6',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 11.5, color: '#94A3B8', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
              Authorize application
            </div>
            <h1 style={{
              fontSize: 23,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              margin: '10px 0 0',
              color: '#0F172A',
              lineHeight: 1.35,
            }}>
              ParcelHub wants to access your <span style={{ color: cfg.accent }}>{cfg.name}</span> account
            </h1>
          </div>

          {/* Two app logos with flowing connector */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '30px 34px 14px', gap: 20,
          }}>
            <AppBubble label="P" bg="#0F172A" color="white" name="ParcelHub" float={mounted} delay="0s" />
            <FlowConnector />
            <AppBubble label={cfg.logo} grad={`linear-gradient(135deg, ${cfg.accent}, ${cfg.accentDeep})`} color="white" name={cfg.name} float={mounted} delay="0.3s" />
          </div>

          {/* Logged-in user line */}
          <div style={{
            margin: '0 34px 18px',
            padding: '12px 16px',
            background: '#F8FAFC',
            border: '1px solid #E8EDF4',
            borderRadius: 10,
            fontSize: 13,
            color: '#475569',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{
              width: 30, height: 30, borderRadius: 999,
              background: `linear-gradient(135deg, ${cfg.accent}, ${cfg.accentDeep})`, color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13,
              boxShadow: `0 2px 8px ${cfg.accent}44`,
            }}>
              {cfg.fakeUser.name[0].toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#0F172A' }}>Signed in as {cfg.fakeUser.name}</div>
              <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{cfg.fakeUser.email}</div>
            </div>
          </div>

          {/* Scopes */}
          <div style={{ padding: '0 34px 8px' }}>
            <div style={{
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: '#64748B',
              marginBottom: 12,
            }}>
              This will allow ParcelHub to:
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {cfg.scopes.map((s, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 11,
                  fontSize: 14.5,
                  color: '#1E293B',
                  padding: '7px 0',
                  opacity: mounted ? 1 : 0,
                  animation: mounted ? `scopeIn 0.45s ease ${0.25 + i * 0.1}s both` : 'none',
                }}>
                  <span style={{
                    width: 21, height: 21, flexShrink: 0,
                    borderRadius: 999,
                    background: '#ECFDF5', color: '#059669',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, marginTop: 1, fontWeight: 700,
                  }}>✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* Fine print */}
          <div style={{
            margin: '18px 34px 0',
            padding: '13px 15px',
            background: '#FEF9EC',
            border: '1px solid #FBE8B8',
            borderRadius: 10,
            fontSize: 12,
            color: '#92651E',
            lineHeight: 1.55,
          }}>
            <strong>Demo notice:</strong> this is a mock authorization page for IS621 ParcelHub.
            Real {cfg.name} OAuth requires a registered Open Platform partner account,
            an HTTPS callback URL, and a seller (not consumer) integration scope. The
            OAuth 2.0 redirect + code-exchange flow you see here is authentic.
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex', gap: 12,
            padding: '22px 34px 30px',
          }}>
            <button
              className="oauth-cancel-btn"
              onClick={cancel}
              disabled={busy}
              style={{
                flex: 1, height: 46,
                border: '1px solid #CBD5E1',
                background: 'white',
                color: '#475569',
                borderRadius: 11,
                fontWeight: 600,
                fontSize: 14.5,
                cursor: busy ? 'not-allowed' : 'pointer',
                transition: 'all 0.18s ease',
              }}>
              Cancel
            </button>
            <button
              className="oauth-authorize-btn"
              onClick={authorize}
              disabled={busy}
              style={{
                flex: 2, height: 46,
                position: 'relative',
                overflow: 'hidden',
                background: `linear-gradient(100deg, ${cfg.accentDark}, ${cfg.accent} 60%, ${cfg.accentDeep})`,
                color: 'white',
                border: 'none',
                borderRadius: 11,
                fontWeight: 700,
                fontSize: 14.5,
                cursor: busy ? 'wait' : 'pointer',
                boxShadow: `0 6px 20px ${cfg.accent}55`,
                transition: 'transform 0.18s ease, filter 0.18s ease',
              }}>
              {/* sheen sweep */}
              {!busy && (
                <span style={{
                  position: 'absolute', top: 0, left: 0, width: '40%', height: '100%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                  animation: 'sheen 2.8s ease-in-out infinite',
                  pointerEvents: 'none',
                }} />
              )}
              <span style={{ position: 'relative', zIndex: 1 }}>
                {busy ? 'Authorizing…' : 'Authorize ParcelHub'}
              </span>
            </button>
          </div>
        </div>
      </main>

      <footer style={{
        textAlign: 'center',
        padding: 18,
        fontSize: 11.5,
        color: '#94A3B8',
        position: 'relative',
        zIndex: 1,
      }}>
        Powered by {cfg.name} Open Platform · OAuth 2.0
      </footer>
    </div>
  )
}

function AppBubble({ label, bg, grad, color, name, float, delay }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 64, height: 64,
        background: grad || bg, color: color,
        borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 26,
        boxShadow: '0 8px 22px rgba(15,23,42,0.18)',
        margin: '0 auto',
        animation: float ? `bubbleFloat 3.2s ease-in-out ${delay} infinite` : 'none',
      }}>{label}</div>
      <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 8, fontWeight: 600 }}>{name}</div>
    </div>
  )
}

function FlowConnector() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: 999,
          background: '#CBD5E1',
          animation: `dotFlow 1.4s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </div>
  )
}