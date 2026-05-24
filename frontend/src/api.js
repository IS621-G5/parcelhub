const BASE = 'http://localhost:3001'

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : null
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
  parcels: {
    list:   ()                          => request('GET',  '/parcels'),
    create: (tracking_number, provider, label) =>
              request('POST', '/parcels', { tracking_number, provider, label }),
  },
}
