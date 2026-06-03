// Force in-memory DB BEFORE any module imports the real one.
// Each test file resets the DB to a clean state via resetDb().
process.env.NODE_ENV = 'test'
process.env.DB_PATH = ':memory:'
process.env.SESSION_SECRET = 'test_session_secret_long_enough_for_tests_only'
process.env.BCRYPT_COST = '4'   // faster bcrypt for tests
process.env.FRONTEND_ORIGIN = 'http://localhost:5173'
// Sprint 3 — deterministic encryption key for tests
process.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
