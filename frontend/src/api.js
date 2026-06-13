// API base — set VITE_API_BASE at build time to point at your deployed backend
// (e.g. VITE_API_BASE=https://parcelhub-api.onrender.com). Defaults to local dev.
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

async function request(method, path, body) {
  console.log(`[api] ${method} ${path}`, body ? `body=${JSON.stringify(body)}` : '')
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : null
  console.log(`[api] ${method} ${path} → ${res.status}`, data)
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const api = {
  me:     ()              => request('GET',  '/auth/me'),
  signup: (email, pwd)    => request('POST', '/auth/register', { email, password: pwd }),
  login:  (email, pwd)    => request('POST', '/auth/login',    { email, password: pwd }),
  logout: ()              => request('POST', '/auth/logout'),
  forgotPassword: (email)         => request('POST', '/auth/forgot-password', { email }),
  resetPassword:  (token, pwd)    => request('POST', '/auth/reset-password',  { token, password: pwd }),

  parcels: {
    list:   ()                          => request('GET',  '/parcels'),
    create: (tracking_number, provider, label) =>
              request('POST', '/parcels', { tracking_number, provider, label }),
    // Sprint 2 — US2.8: simulate courier delivery webhook for demo
    mockDeliver: (id)                   => request('POST', `/parcels/${id}/mock-deliver`),
    // Sprint 2 — US2.8 + US4.2: one endpoint, two flows
    rate:        (id, stars, comment)   => request('PUT',  `/parcels/${id}/rating`, { stars, comment }),
    getRating:   (id)                   => request('GET',  `/parcels/${id}/rating`),
    get:         (id)                   => request('GET',  `/parcels/${id}`),
    remove:      (id)                   => request('DELETE', `/parcels/${id}`),
  },

  // Sprint 2 — US2.8: in-app notification events
  notifications: {
    list:        ()        => request('GET',  '/notifications'),
    unreadCount: ()        => request('GET',  '/notifications/unread-count'),
    markRead:    (id)      => request('POST', `/notifications/${id}/read`),
  },

  // Sprint 2 — US2.9.1 / US2.9.2: linked accounts via mock OAuth
  linked: {
    list:        ()                    => request('GET',  '/linked-accounts'),
    disconnect:  (id)                  => request('DELETE', `/linked-accounts/${id}`),
  },
  oauth: {
    start:       (provider)                       => request('GET',  `/oauth/${provider}/start`),
    callback:    (provider, code)                 => request('POST', `/oauth/${provider}/callback`, { code }),
    sync:        (provider, linkedAccountId)      => request('POST', `/oauth/${provider}/import`, { linked_account_id: linkedAccountId }),
  },
}
