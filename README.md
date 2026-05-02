# ParcelHub — Sprint 1 Auth

Sign up + sign in for ParcelHub. Backend is Node + Express + SQLite. Frontend is React + Vite. They talk via HTTP + cookies.

## Requirements

- **Node.js v22 or later** (the backend uses `node:sqlite` which is built into Node 22)
  - Check: `node -v`
  - Install: https://nodejs.org/ (download the LTS version)

## Project layout

```
parcelhub/
├── backend/          ← Node + Express server
│   ├── src/
│   │   ├── server.js     ← Express app entry
│   │   ├── auth.js       ← /auth endpoints
│   │   └── db.js         ← SQLite setup
│   └── package.json
└── frontend/         ← React + Vite app
    ├── src/
    │   ├── main.jsx      ← entry
    │   ├── App.jsx       ← all UI in one file
    │   ├── api.js        ← fetch wrapper
    │   └── styles.css
    └── package.json
```

## Running it

You need **two terminal windows** open at the same time.

### Terminal 1 — backend

```bash
cd backend
npm install        # first time only
npm run dev
```

You should see:
```
ParcelHub backend running on http://localhost:3000
```

### Terminal 2 — frontend

```bash
cd frontend
npm install        # first time only
npm run dev
```

You should see:
```
  VITE v5.4.21  ready in 572 ms
  ➜  Local:   http://localhost:5173/
```

### Open the app

Open your browser at **http://localhost:5173**.

You'll see the sign-in screen. Click "Create an account" and register with any email + a password (8+ chars, with at least one letter and one digit). You'll land on the post-login screen.

The user is saved in a SQLite file at `backend/data.db`. To start over, stop the backend, delete that file, restart.

## What works

- ✅ Register a new account (`POST /auth/register`)
- ✅ Sign in with email + password (`POST /auth/login`)
- ✅ Stay signed in across page refresh (session cookie)
- ✅ Sign out (`POST /auth/logout`)
- ✅ "Who am I" check (`GET /auth/me`)
- ✅ Friendly error messages for: wrong password, duplicate email, weak password, bad email format

## Security choices

| Choice | Why |
|---|---|
| **bcryptjs cost 10** | OWASP minimum for 2024 — passwords are slow to brute-force |
| **HttpOnly cookie** | JavaScript on the page cannot read the session cookie (XSS protection) |
| **SameSite=Lax cookie** | The cookie isn't sent on cross-site POSTs (CSRF protection) |
| **Constant-time login** | Login response time is the same whether the email exists or not — prevents user enumeration via timing |
| **zod input validation** | Inputs are validated at the boundary; invalid input is rejected before touching the DB |
| **Parameterised SQL** | We use `?` placeholders, never string interpolation. SQL injection is structurally impossible. |
| **No plain-text passwords anywhere** | Cleartext is never stored, never logged, never returned in responses |

## What's NOT here yet (Sprint 1+ work)

- Add / list / delete parcels (next stories: US02, US03, US11)
- Tracking timeline (Sprint 2)
- IDOR test for parcels (US06 — Sprint 1)
- Mock provider APIs (Sprint 2)
- Anomaly detection (Sprint 3)
- DevSecOps pipeline integration (Sprint 4)

## Common errors & fixes

**"Module not found: node:sqlite"**
You're on Node < 22. Run `node -v` to check. Upgrade Node.

**Frontend says "Failed to fetch"**
Backend isn't running, or it's running on a different port. Check Terminal 1.

**"CORS error" in browser console**
The backend already allows `http://localhost:5173`. If you changed the frontend port in `vite.config.js`, also update `origin` in `backend/src/server.js`.

**Session not persisting after refresh**
The browser is blocking third-party cookies. Make sure both servers are on `localhost` (not `127.0.0.1` for one and `localhost` for the other — those count as different origins).


This is a Sprint 1 starting point — refactor or rewrite as needed. Suggestions:
- Move to TypeScript for compile-time error catching
- Add a proper error middleware that logs to a file in production
- Switch the in-memory session store to Redis or a DB-backed store before Sprint 4 demo
- Add `tests/` directory with Jest — the structure is here, just no tests yet for this stripped version
