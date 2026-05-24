# ParcelHub — Sprint 1

Anomaly-first unified parcel tracking aggregator.
Sprint 1 scope: authentication (sign up + log in + log out) and dashboard.

## Stack

- **Backend**: Node.js 22 + Express + SQLite (via `node:sqlite`) + bcryptjs + zod + express-session
- **Frontend**: React + Vite + plain CSS
- **Tests**: Jest + Supertest (in-memory SQLite)

## Quick Start

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Backend runs on `http://localhost:3001`.

### 2. Frontend (in a new terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

### 3. Run tests (in a new terminal)

```bash
cd backend
npm test
```

Expected output:

```
PASS  tests/auth.register.test.js
PASS  tests/auth.login.test.js

Tests:       8 passed, 8 total
```

## Sprint 1 Negative-Path Test Coverage

### Sign Up — `POST /auth/register`

| Case               | Expected status |
| ------------------ | --------------- |
| Invalid email      | 400             |
| Weak password      | 400             |
| Duplicate email    | 409             |
| Missing fields     | 400             |

### Log In — `POST /auth/login`

| Case               | Expected status |
| ------------------ | --------------- |
| Wrong password     | 401             |
| Non-existent user  | 401             |
| Malformed body     | 400             |
| Session after logout cleared | 401  |

## Manual curl verification

```bash
# Invalid email
curl -i -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"ValidPass1"}'

# Weak password
curl -i -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"abc"}'

# Duplicate (after first succeeds)
curl -i -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"ValidPass1"}'
```

## Repository structure

```
backend/
  src/
    server.js              entry point
    config/index.js        reads .env
    db/index.js            SQLite lazy singleton + schema
    middleware/auth.js     requireAuth
    modules/users/         routes + service (signup, login, logout, /me)
    modules/parcels/       routes + service (CRUD, IDOR-safe)
  tests/
    helpers/setupDb.js     :memory: SQLite for tests
    auth.register.test.js
    auth.login.test.js
frontend/
  src/
    App.jsx                routing + auth state
    pages/Login.jsx
    pages/Signup.jsx
    pages/Dashboard.jsx
    styles.css
```

## Security baseline (T-SEC-01)

- bcrypt cost 10 for password hashing
- Constant-time compare on login (even when user not found)
- HttpOnly + SameSite=Lax session cookies
- zod input validation at every endpoint
- IDOR mitigation: cross-user parcel access returns 404, not 403
- `.env` gitignored; `.env.example` committed
