import { DatabaseSync } from 'node:sqlite'
import { config } from '../config/index.js'

let _db = null

export function getDb() {
  if (_db) return _db
  _db = new DatabaseSync(config.dbPath)
  _db.exec(SCHEMA)
  return _db
}

// For tests: reset to a fresh in-memory DB
export function resetDb(path = ':memory:') {
  if (_db) {
    try { _db.close() } catch {}
  }
  _db = new DatabaseSync(path)
  _db.exec(SCHEMA)
  return _db
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS parcels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tracking_number TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_parcels_user_id ON parcels(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_parcels_user_tracking
  ON parcels(user_id, tracking_number);

-- Sprint 1 US1.3: password reset tokens
-- Store SHA-256 hash only so a DB leak doesn't yield usable tokens.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens(user_id);
`