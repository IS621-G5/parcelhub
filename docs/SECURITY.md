# ParcelHub — Security Testing Report

A consolidated view of every security control and security test in this
codebase, mapped to the CWE and OWASP Top 10 (2021) entries they address.
Built as evidence for the DevSecOps half of IS621.

> All claims below are backed by code in `backend/src` and runnable tests
> in `backend/tests`. Run `npm test` to confirm — currently **86/86 pass**
> across **11 Jest suites**.

---

## 1. DevSecOps tooling (T-SEC-01 through T-SEC-04)

| ID | Control | Runs in | Evidence |
|---|---|---|---|
| **T-SEC-01** | Secrets baseline: `.env` gitignored, `.env.example` shipped, gitleaks pre-commit scan | local + CI | `.gitignore`, `.env.example` |
| **T-SEC-02** | Semgrep SAST on every PR + push (p/ci, p/javascript, p/react, p/owasp-top-ten) | GitHub Actions | `.github/workflows/semgrep.yml` |
| **T-SEC-03a** | Trivy filesystem CVE scan (backend + frontend npm deps), fails on HIGH+ | GitHub Actions | `.github/workflows/trivy.yml` |
| **T-SEC-03b** | Trivy Docker image scan after `docker build`, fails on CRITICAL | GitHub Actions | `.github/workflows/trivy.yml` |
| **T-SEC-03c** | Dependabot weekly updates (npm + github-actions ecosystems) | GitHub | `.github/dependabot.yml` |
| **T-SEC-04** | Runtime hardening: helmet headers, CORS allowlist, auth rate-limit, password reset token security | Backend | `src/server.js`, `src/modules/users/routes.js`, `src/modules/users/passwordReset.js` |

---

## 2. Application-level security controls and tests

### 2.1 — Broken Access Control (OWASP A01:2021 / CWE-639 IDOR)

Every owner-scoped read and write goes through ownership-checked queries.
Cross-user access returns `404` (not 403) with no data leaked, so an
attacker cannot probe for existence.

| Endpoint | IDOR test | Test file |
|---|---|---|
| `GET /parcels/:id` | User B reading As parcel → 404 | `parcels.crud.test.js` |
| `PATCH /parcels/:id/archive` | Cross-user archive → 404 | `parcels.crud.test.js` |
| `POST /parcels/:id/mock-deliver` | Cross-user mark delivered → 404 | `delivery.rating.test.js` |
| `PUT /parcels/:id/rating` | Cross-user rate → 404 | `delivery.rating.test.js` |
| `POST /notifications/:id/read` | Cross-user mark notification read → 404 | `delivery.rating.test.js` |
| `POST /returns` | Return for unowned parcel → 404 | `returns.test.js` |
| `POST /send` | Send from unowned linked account → 404 | `send.parcel.test.js` |
| `POST /oauth/:provider/callback` | Callback can only create accounts for the active session user | `providers.oauth.test.js` |
| `DELETE /linked-accounts/:id` | Cross-user disconnect → 404 | `linked.accounts.test.js` |

### 2.2 — Identification & Auth Failures (OWASP A07:2021)

| Control | CWE | Implementation | Test |
|---|---|---|---|
| Password hashing with bcryptjs (cost 10 prod, 4 test) | CWE-916 | `users/service.js` createUser | `auth.register.test.js` |
| Anti-enumeration on login (same response + constant-time bcrypt against dummy hash) | CWE-204 | `users/service.js` verifyCredentials | `auth.login.test.js` |
| Anti-enumeration on forgot-password (same 200 OK regardless of email existence) | CWE-204 | `users/routes.js` /forgot-password | `auth.password_reset.test.js` |
| Generic "invalid_token" on reset failures (no distinction between expired / used / not-found) | CWE-204 | `users/routes.js` /reset-password | `auth.password_reset.test.js` |
| Session cookies: httpOnly + sameSite=lax + secure-in-prod | CWE-1004, CWE-1275 | `server.js` session config | (manual via curl) |
| No JWT in localStorage; session cookie only | CWE-1275 | `server.js` | (architectural) |

### 2.3 — Cryptographic Failures (OWASP A02:2021)

| Control | CWE | Implementation | Test |
|---|---|---|---|
| OAuth tokens encrypted with AES-256-GCM, per-record IV | CWE-311, CWE-327 | `security/tokenCrypto.js` | `security.token.test.js` |
| Encryption key required from env, validated at startup | CWE-321 | `config/index.js` | (startup check) |
| Tampered ciphertext rejected (GCM tag) | CWE-353 | `security/tokenCrypto.js` | `security.token.test.js` |
| Password reset tokens: only SHA-256 hash stored, raw never persisted | CWE-256, CWE-547 | `users/passwordReset.js` | `auth.password_reset.test.js` |
| Reset tokens: 1-hour expiry, single-use, new request invalidates old | CWE-613, CWE-294 | `users/passwordReset.js` | `auth.password_reset.test.js` |

### 2.4 — Injection / Input Validation (OWASP A03:2021)

| Control | CWE | Implementation | Test |
|---|---|---|---|
| All POST/PUT bodies validated with zod schemas | CWE-20 | every routes.js | (covered in CRUD tests) |
| Parameterized SQL queries everywhere (node:sqlite prepared statements) | CWE-89 | every service.js | (no string concat anywhere) |
| Path params coerced to Number + isFinite check | CWE-20 | parcels/routes.js, notifications/routes.js | `parcels.crud.test.js` |
| `json` body size capped at 100kb | CWE-770 | `server.js` | (configured) |
| OAuth state token (16-byte random) validated on callback to prevent CSRF | CWE-352 | `frontend/App.jsx` + `LinkedAccountsModal.jsx` | (frontend integration) |

### 2.5 — Security Misconfiguration (OWASP A05:2021)

| Control | CWE | Implementation | Test |
|---|---|---|---|
| Helmet security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy) | CWE-693 | `server.js` | `security.hardening.test.js` |
| X-Powered-By removed (no Express fingerprint) | CWE-200 | helmet default | `security.hardening.test.js` |
| CORS allowlist mode (only configured frontend origin gets credentials allowed) | CWE-942 | `server.js` cors config | `security.hardening.test.js` (2 tests) |

### 2.6 — Brute-Force / Resource Exhaustion (OWASP A04:2021)

| Control | CWE | Implementation | Test |
|---|---|---|---|
| Rate-limit on /auth/login (20 / 15min / IP) | CWE-307 | `users/routes.js` loginLimit | `security.hardening.test.js` (wiring), manual smoke |
| Rate-limit on /auth/register (10 / 15min / IP) | CWE-799 | `users/routes.js` registerLimit | `security.hardening.test.js` |
| Rate-limit on /auth/forgot-password (5 / 15min / IP — tightest, enumeration target) | CWE-307, CWE-204 | `users/routes.js` forgotLimit | `security.hardening.test.js` |
| Rate-limit on POST /parcels (10 / min / user) | CWE-799 | `parcels/routes.js` createParcelLimit | (manual) |
| Rate-limit on parcel detail (30 / min / user — anti-enumeration) | CWE-799 | `parcels/routes.js` detailLimit | (manual) |

### 2.7 — Software & Data Integrity (OWASP A08:2021)

| Control | CWE | Implementation | Test |
|---|---|---|---|
| Lockfiles committed (`package-lock.json`) | CWE-1357 | repo state | (review) |
| CI uses `npm ci` not `npm install` (reproducible) | CWE-1357 | `.github/workflows/ci.yml` | (CI run) |
| Dependabot updates monitored | CWE-1104 | `.github/dependabot.yml` | (weekly PRs) |
| Trivy scans pin to specific CVE thresholds | CWE-1104 | `.github/workflows/trivy.yml` | (CI run) |

### 2.8 — Logging & Monitoring (OWASP A09:2021)

| Control | CWE | Implementation |
|---|---|---|
| `audit_log` table records security-relevant events | CWE-778 | `db/index.js` schema |
| Central error handler — never exposes stack traces in JSON | CWE-209 | `server.js` |

---

## 3. Manual rate-limit demonstration

The Jest suite bypasses rate-limiters via `NODE_ENV=test` so cross-test
contamination doesn't break unrelated tests. To prove the rate-limit
actually fires in production mode, run this curl in a fresh shell while
the backend is up:

```bash
# /auth/forgot-password is the strictest (5 / 15 min / IP)
for i in {1..6}; do
  echo -n "request $i → "
  curl -s -o /dev/null -w "HTTP %{http_code}\n" \
    -X POST http://localhost:3001/auth/forgot-password \
    -H "Content-Type: application/json" \
    -d '{"email":"probe@test.com"}'
done

# Expected output:
#   request 1 → HTTP 200
#   request 2 → HTTP 200
#   request 3 → HTTP 200
#   request 4 → HTTP 200
#   request 5 → HTTP 200
#   request 6 → HTTP 429       ← rate-limit kicks in
```

The `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers
are also emitted on every response — visible with `curl -i`.

---

## 4. Tests summary

```
$ cd backend && npm test
Test Suites: 11 passed, 11 total
Tests:       86 passed, 86 total
```

Of the 86 tests, approximately **30 are security-focused** (IDOR / anti-enumeration / crypto / token lifecycle / headers / CORS / rate-limit wiring). The rest are functional / integration tests that incidentally exercise security paths through their happy paths.

---

## 5. Known gaps & next sprint

Honest list, not pretending we did everything:

- No DAST. T-SEC-08 (OWASP ZAP baseline) was on the backlog, not picked up. Worth adding in a later sprint.
- No SBOM generation yet. cyclonedx-node-npm is a one-line add — Sprint 3+.
- No session invalidation on password reset. Existing sessions remain valid after a reset. Sprint 3 candidate.
- Mock OAuth is not real OAuth. The redirect + state-validation + code-exchange flow you see is authentic OAuth 2.0, but the consent page is hosted by us, not by Shopee/Lazada. Real integration requires Open Platform partner accounts (seller-side) and HTTPS callback URLs.
- Audit log writes are not yet enforced on all security-relevant events (e.g. failed login). Wiring exists in `db/index.js`, callers are partial.
