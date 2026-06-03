# ParcelHub — 5-minute demo walkthrough

The flow graders should follow. Now fully UI-driven — `curl` is only used as
a fallback if a feature has no UI yet.

> Bring up: `docker compose up --build` (or run backend + frontend locally,
> see root README). Then open **http://localhost:8080**.

Clean-state demo: `docker compose down -v && docker compose up --build`.

---

## Step 1 — Sign up (UI, 30s)

1. http://localhost:8080
2. **Create an account** → `demo@parcelhub.test` / `DemoPass1`
3. You land on the Dashboard.

> Demonstrates: US1.1 sign up, session cookie, dashboard scaffolding.

---

## Step 2 — Link Shopee + Lazada via real OAuth 2.0 redirect (UI, 60s) — **US2.9.1 / 2.9.2**

This is the **OAuth 2.0 authorization-code flow**, end to end. No prompts — a real redirect-and-callback dance, the same shape as Google/GitHub/Stripe OAuth.

1. Click the **Linked accounts** card on the dashboard.
2. Modal opens — both providers shown as "Not connected" with their real brand colors (Shopee orange #EE4D2D, Lazada navy #0F146D).
3. Click **Connect Shopee**:
   - The app generates a CSRF `state` token, stores it in sessionStorage, and **redirects** the browser to a Shopee-branded authorize page (`/?oauth_authorize=shopee&state=…&redirect_uri=…`).
   - The mock authorize page mimics Shopee's real OAuth consent screen: brand bar, app-to-app logo bubbles, "Signed in as demo.shopee", scope list (View order history, View shipment tracking numbers, View delivery status), amber demo-notice banner, big orange **Authorize ParcelHub** button.
4. Click **Authorize ParcelHub**. After a 500ms "Authorizing…" pause (real OAuth feel), the page redirects back to `/?oauth_code=sh-…&state=…`.
5. App.jsx detects the callback, **validates the state token matches** (CSRF defense), then calls the backend's `/oauth/shopee/callback`. Backend exchanges the code → AES-256-GCM encrypts the tokens at rest → imports mock orders.
6. Green toast banner at the top of the dashboard: **"Shopee connected — 3 parcels imported."**
7. Repeat for Lazada (navy-blue page this time).

> Demonstrates: US2.9.1, US2.9.2, **authentic OAuth 2.0 redirect + code-exchange + state CSRF**, AES-256-GCM token storage at rest. Real Shopee/Lazada Open Platform OAuth requires a registered partner account and HTTPS callback URL — the *flow* you see is identical; only the consent page is mock.

---

## Step 3 — Add a parcel manually (UI, 20s)

1. Click **Add a parcel** card.
2. Tracking: `MANUAL12345`, Provider: DHL, Label: "Newegg order".
3. Save → row appears.

> Demonstrates: US2.2 add parcel, US2.3 tracker summary, US2.4 view details.

---

## Step 4 — Delivery Confirmation: notification → confirm + rate (UI, 60s) — **US2.8**

This is the headline flow.

1. Pick any non-delivered parcel row. Click **Mark delivered**.
   *(This is the demo equivalent of a courier delivery webhook firing.)*
2. **The bell in the top-right gets a red badge.**
3. Click the bell — dropdown shows the new notification:
   *"Newegg order has been delivered — confirm receipt and rate the experience."*
4. Click the notification → **Confirm & rate modal** opens.
5. Tap 5 stars, type a comment (optional), click **Confirm & submit**.
6. Modal closes. Bell badge clears (notification was atomically marked read).
7. The parcel row's button changes from "Mark delivered" to **★ Rate**.

> Demonstrates: US2.8 (notification → confirm + rate in one step), atomic
> transaction (rating + notification mark-read together), idempotent
> notification creation, anti-enumeration on cross-user notifications.

---

## Step 5 — Rate any delivered parcel from row (UI, 20s) — **US4.2**

1. On a delivered parcel that already has a rating, click **★ Rate**.
2. Modal opens — pre-filled with the existing rating + comment.
3. Change to 3 stars, save → upsert path tested.

> Demonstrates: US4.2 (rate any delivered parcel), upsert behavior (no duplicate rows).

---

## Step 6 — Forget password (UI, 60s) — **US1.3 Sprint 1 carry-over**

1. Sign out.
2. Click **Forgot password?** on the login page.
3. Enter `demo@parcelhub.test`, click **Send reset link**.
4. Success message — same for existing vs non-existing emails (anti-enumeration).
5. Find the reset link in the **backend terminal** (MVP — production would email):
   ```
   ═══ PASSWORD RESET LINK ═══
   To:      demo@parcelhub.test
   Link:    http://localhost:8080/?reset=<64-hex>
   ═══════════════════════════
   ```
6. Paste the link into the browser → app jumps to the **Reset Password** page.
7. Enter `NewDemoPass2` twice → **Update password**.
8. Log in with the new password → works. Old password → 401.

> Demonstrates: US1.3 end-to-end, SHA-256-hashed token storage, single-use,
> 1-hour expiry, anti-enumeration both endpoints.

---

## Step 7 — Show the tests (terminal, 30s)

```bash
cd backend && npm test
```

```
Test Suites: 10 passed, 10 total
Tests:       76 passed, 76 total
```

Open `tests/delivery.rating.test.js` and `tests/auth.password_reset.test.js`
to show:
- Cross-user IDOR explicitly tested (both for mock-deliver, rating, and
  notification read)
- Idempotency tested (mock-deliver twice, rate twice)
- Anti-enumeration on forgot-password (both branches)
- Token single-use, expiry, superseding

> Demonstrates: the security claims are runnable, not just README text.

---

## Step 8 — Deployment (terminal, 30s)

```bash
docker compose ps
```

Two containers: `parcelhub_backend` (Node 22 alpine) + `parcelhub_frontend`
(nginx alpine). SQLite data in named volume.

```bash
docker compose restart backend
# Browser refresh: parcels are still there.
```

> Demonstrates: the deployment portion of the grading rubric.

---

## Total: ~4–5 min

| Step | Stories | Time |
|---|---|---|
| 1 | US1.1 sign up | 30s |
| 2 | **US2.9.1 + US2.9.2 Link Shopee + Lazada** | 60s |
| 3 | US2.2 / US2.3 / US2.4 parcel CRUD | 20s |
| 4 | **US2.8 Delivery Confirmation (the headline)** | 60s |
| 5 | **US4.2 Rate Delivery Experience** | 20s |
| 6 | **US1.3 Forget Password (Sprint 1 carry-over)** | 60s |
| 7 | Tests (76/76) | 30s |
| 8 | Docker deploy | 30s |

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| Bell doesn't show a badge after Mark delivered | Bell polls every 15s; refresh page or click bell to force-fetch. |
| OAuth code rejected | Code must start with `sh-` for Shopee or `lz-` for Lazada. The prompt pre-fills correctly. |
| Reset link 404s | Link format is `?reset=<token>` on the SPA root, not `/reset-password`. App.jsx reads the query param. |
| `EADDRINUSE :::3001` | Another backend running. `pkill -f 'node src/server.js'` then retry. |
| `npm test` MODULE_NOT_FOUND | `cd backend && npm install` first. |
