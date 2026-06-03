# ParcelHub — Final Reference Implementation

An **anomaly-first** unified parcel tracking aggregator. Built for IS621
(Agile + DevSecOps) by Team G5.

> **Pitch:** Track Shopee, Lazada, DHL, Ninja Van, and SingPost shipments in
> one inbox — with stuck / delayed / exception parcels surfaced at the top
> so nothing slips through.

---

## 1. Quick start

Two options. Pick whichever your graders find easier.

### Option A — Docker (one command, no Node install needed)

```bash
docker compose up --build
```

Then open **http://localhost:8080**. The API is on `http://localhost:3001`.
SQLite data persists in a named Docker volume.

### Option B — Local (Node 22+ required, for built-in `node:sqlite`)

```bash
# Backend
cd backend
npm install
cp .env.example .env
# (Optional) generate a fresh AES key for OAuth token encryption:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# — paste it into .env as TOKEN_ENCRYPTION_KEY

npm run dev               # http://localhost:3001

# Frontend (new terminal)
cd ../frontend
npm install
npm run dev               # http://localhost:5173

# Tests (new terminal)
cd backend && npm test    # 65 tests across 9 suites
```

---

## 2. What's in the box

| Area | Story | Status |
|---|---|---|
| Auth | US1.1 Sign up | ✅ |
| Auth | US1.2 Log in / log out | ✅ |
| Auth | **US1.3 Forget password** (Sprint 1 carry-over) | ✅ |
| Auth | US1.4 / US1.5 Linked accounts (OAuth, encrypted at rest) | ✅ |
| Parcels | US2.1 Dashboard with anomaly-first ordering | ✅ |
| Parcels | US2.2 Add parcel | ✅ |
| Parcels | US2.3 Tracker summary | ✅ |
| Parcels | US2.4 View parcel details | ✅ |
| Parcels | US2.7 / US2.8 Returns flow | ✅ |
| Parcels | **US2.8 Delivery confirmation (notification → confirm + rate)** | ✅ |
| Parcels | **US2.9.1 Link Shopee — UI for OAuth flow** | ✅ |
| Parcels | **US2.9.2 Link Lazada — UI for OAuth flow** | ✅ |
| Send | US3.x Compose, rate quote, confirm send | ✅ |
| UX | US4.1 Notification preferences | ✅ |
| UX | **US4.2 Rate delivery experience (from row + detail)** | ✅ |
| Provider mocks | Shopee + Lazada OAuth + order import | ✅ |
| Security | bcryptjs, IDOR middleware, AES-256-GCM token storage, anti-enumeration | ✅ |
| Security | Single-use SHA-256-hashed password reset tokens, 1h expiry | ✅ |
| DevSecOps | **T-SEC-01** Secrets baseline (gitleaks + `.env` gitignored) | ✅ |
| DevSecOps | **T-SEC-02** Semgrep SAST in CI (p/ci + p/javascript + p/react + p/owasp-top-ten) | ✅ |
| DevSecOps | **T-SEC-03** Trivy CVE scans (fs + Docker image) + Dependabot weekly | ✅ |
| DevSecOps | **T-SEC-04** Runtime hardening (helmet, auth rate-limit, CORS allowlist) | ✅ |
| DevSecOps | **T-SEC-09** Security testing report mapping CWE / OWASP Top 10 → `docs/SECURITY.md` | ✅ |
| Tests | **86 passing across 11 Jest suites** | ✅ |

See **[docs/DEMO.md](docs/DEMO.md)** for the 5-minute walkthrough graders should follow.

---

## 3. Architecture

```
┌───────────────────────┐        ┌───────────────────────────┐
│  React + Vite SPA     │  HTTPS │  Express API (Node 22)    │
│  (nginx in Docker)    │ ─────▶ │  Modular monolith         │
│  :8080 (docker)       │ session│   ├─ users (auth)         │
│  :5173 (vite dev)     │ cookie │   ├─ parcels              │
└───────────────────────┘        │   ├─ send                 │
                                 │   ├─ returns              │
                                 │   ├─ linked-accounts      │
                                 │   ├─ providers (mock)     │
                                 │   ├─ notifications        │
                                 │   └─ security/tokenCrypto │
                                 └────────┬──────────────────┘
                                          │
                                  ┌───────▼───────┐
                                  │ SQLite        │
                                  │ (node:sqlite) │
                                  │ /data/*.db    │
                                  └───────────────┘
```

**Why a modular monolith:** keeps DevSecOps tooling (Trivy, Semgrep,
Dependabot, gitleaks) meaningful while staying small enough to demo. Each
module has its own routes + service split and its own test file.

---

## 4. Security choices worth pointing out

- **Password storage:** bcryptjs, cost 10 in prod, 4 in tests.
- **Session cookies:** `httpOnly`, `sameSite=lax`, `secure` in production. No JWT in cookies, no localStorage.
- **OAuth tokens:** AES-256-GCM with per-record IV; only decrypted server-side.
- **IDOR:** every owner-scoped read/write goes through middleware that 404s on cross-user access. Test files include explicit two-user IDOR tests.
- **Anti-enumeration:** `/auth/login` and `/auth/forgot-password` return identical responses whether the email exists or not. `verifyCredentials` runs bcrypt against a dummy hash on unknown emails for constant-time compare.
- **Password reset tokens:** only the SHA-256 hash is stored; 1-hour expiry; single-use; new reset request invalidates outstanding tokens (kills phished old links).
- **Secrets:** `.env` gitignored, `.env.example` shipped, `gitleaks` clean.

---

## 5. Project layout

```
parcelhub_final/
├── README.md                  ← you are here
├── docker-compose.yml         ← `docker compose up --build` runs everything
├── docs/
│   └── DEMO.md                ← 5-min walkthrough for graders
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── server.js          ← buildApp() + mount routes
│   │   ├── config/, db/, middleware/
│   │   └── modules/
│   │       ├── users/         ← auth incl. forget password
│   │       ├── parcels/, send/, returns/
│   │       ├── linked/, providers/
│   │       ├── notifications/
│   │       └── security/      ← tokenCrypto (AES-256-GCM)
│   └── tests/                 ← 9 Jest suites, 65 tests
└── frontend/
    ├── Dockerfile             ← multi-stage: build → nginx
    ├── nginx.conf             ← SPA fallback so /?reset=<token> works
    ├── package.json
    ├── index.html
    └── src/
        ├── App.jsx, api.js, styles.css
        └── pages/             ← Login, Signup, ForgotPassword, ResetPassword, Dashboard
```

---

## 6. Test results

```
$ cd backend && npm test
PASS tests/auth.password_reset.test.js
PASS tests/auth.register.test.js
PASS tests/auth.login.test.js
PASS tests/parcels.crud.test.js
PASS tests/send.parcel.test.js
PASS tests/returns.test.js
PASS tests/linked.accounts.test.js
PASS tests/providers.oauth.test.js
PASS tests/security.token.test.js
PASS tests/delivery.rating.test.js
PASS tests/security.hardening.test.js

Test Suites: 11 passed, 11 total
Tests:       86 passed, 86 total
```

See **[docs/SECURITY.md](docs/SECURITY.md)** for the full security testing report mapping every control to CWE / OWASP Top 10.

---

## 7. Team

| Role | Member |
|---|---|
| Product Owner | Shujin (Song Shujin) |
| Scrum Master (rotating) | Rachel (Rachel Cathleen Thangadurai) |
| Frontend / UI Lead | Arushi (Arushi Saxen) |
| Backend / API Lead | Burr (Jan Michael Malit Herber) |
| DevSecOps Lead | Curtis (Chen Hongyu) |
| DevSecOps Shadow | Hanwei (Zhou Hanwei) |
| QA / Testing Lead | Dongwei (Chen Dongwei) |

