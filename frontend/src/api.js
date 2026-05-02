// Wrapper around fetch() so every request automatically sends cookies
// (so the session cookie travels) and parses JSON.

const API_URL = 'http://localhost:3000'

async function request(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',          // send and receive cookies cross-origin
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

  // Some responses have no body (e.g. 204 logout)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const err = new Error(data?.error || `request_failed_${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}

export const api = {
  register: (email, password) => request('POST', '/auth/register', { email, password }),
  login:    (email, password) => request('POST', '/auth/login',    { email, password }),
  logout:   ()                => request('POST', '/auth/logout'),
  me:       ()                => request('GET',  '/auth/me'),
}
