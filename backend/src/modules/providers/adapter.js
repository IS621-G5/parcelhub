// Provider adapter interface — common shape that all e-commerce providers
// (Shopee, Lazada, ...) and all environments (mock, live) implement.
//
// Contract:
//   adapter.exchangeCodeForTokens(code)  →  { access_token, refresh_token, expires_at, account_handle }
//   adapter.fetchRecentOrders(accessToken, sinceDays)  →  Order[]
//
// Order = {
//   provider_order_id: string,
//   tracking_number: string | null,
//   provider_courier: string,        // courier name as reported by provider
//   item_summary: string,            // short label for the user
//   ordered_at: string,              // ISO timestamp
// }
//
// Sprint 3 ships mock adapters. The same interface is used in production
// against the real Shopee Open Platform / Lazada Open Platform APIs.

// ─── Mock Shopee adapter ────────────────────────────────────────────────
export const shopeeMock = {
  name: 'shopee',

  // Mock OAuth: any code starting with 'sh-' is "valid"
  exchangeCodeForTokens(code) {
    if (!code || !code.startsWith('sh-')) {
      const err = new Error('invalid_code')
      err.status = 400
      throw err
    }
    return {
      access_token: `shopee_access_${randomString(24)}`,
      refresh_token: `shopee_refresh_${randomString(32)}`,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      account_handle: `shopee_user_${randomString(6)}`,
    }
  },

  // Mock order list — deterministic-ish so tests can assert
  fetchRecentOrders(_accessToken, sinceDays = 30) {
    if (!_accessToken || !_accessToken.startsWith('shopee_access_')) {
      const err = new Error('invalid_token')
      err.status = 401
      throw err
    }
    return [
      {
        provider_order_id: `SP-ORD-${randomString(8)}`,
        tracking_number: `SP${randomDigits(10)}`,
        provider_courier: 'SingPost',
        item_summary: 'Shopee — Wireless earphones',
        ordered_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      },
      {
        provider_order_id: `SP-ORD-${randomString(8)}`,
        tracking_number: `NV${randomDigits(10)}`,
        provider_courier: 'Ninja Van',
        item_summary: 'Shopee — Cotton t-shirt',
        ordered_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      },
      {
        provider_order_id: `SP-ORD-${randomString(8)}`,
        tracking_number: null,  // ordered but not shipped yet
        provider_courier: 'SingPost',
        item_summary: 'Shopee — Phone case',
        ordered_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      },
    ]
  },
}

// ─── Mock Lazada adapter ────────────────────────────────────────────────
export const lazadaMock = {
  name: 'lazada',

  exchangeCodeForTokens(code) {
    if (!code || !code.startsWith('lz-')) {
      const err = new Error('invalid_code')
      err.status = 400
      throw err
    }
    return {
      access_token: `lazada_access_${randomString(24)}`,
      refresh_token: `lazada_refresh_${randomString(32)}`,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      account_handle: `lazada_user_${randomString(6)}`,
    }
  },

  fetchRecentOrders(_accessToken, sinceDays = 30) {
    if (!_accessToken || !_accessToken.startsWith('lazada_access_')) {
      const err = new Error('invalid_token')
      err.status = 401
      throw err
    }
    return [
      {
        provider_order_id: `LZ-ORD-${randomString(8)}`,
        tracking_number: `DHL${randomDigits(10)}`,
        provider_courier: 'DHL',
        item_summary: 'Lazada — Kitchen knife set',
        ordered_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      },
      {
        provider_order_id: `LZ-ORD-${randomString(8)}`,
        tracking_number: `NV${randomDigits(10)}`,
        provider_courier: 'Ninja Van',
        item_summary: 'Lazada — Bluetooth speaker',
        ordered_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      },
    ]
  },
}

// Resolve adapter by provider name. In production this could swap mock for
// live based on env (e.g. PROVIDER_MODE=live → real Shopee SDK).
const ADAPTERS = { shopee: shopeeMock, lazada: lazadaMock }
export function getAdapter(provider) {
  const a = ADAPTERS[provider]
  if (!a) throw new Error(`unknown_provider: ${provider}`)
  return a
}

// ─── Helpers ────────────────────────────────────────────────────────────
function randomString(n) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}
function randomDigits(n) {
  let s = ''
  while (s.length < n) s += Math.floor(Math.random() * 1e9).toString()
  return s.slice(0, n)
}
