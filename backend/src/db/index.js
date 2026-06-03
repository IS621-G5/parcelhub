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

-- Sprint 1, US1.3 Forget Password — only SHA-256 hash stored, never raw token.
-- 1-hour expiry, single-use (used_at). New requests invalidate older tokens.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);

CREATE TABLE IF NOT EXISTS parcels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tracking_number TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  archived INTEGER NOT NULL DEFAULT 0,
  courier_picked_up_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_parcels_user_id ON parcels(user_id);
CREATE INDEX IF NOT EXISTS idx_parcels_user_archived ON parcels(user_id, archived);
CREATE INDEX IF NOT EXISTS idx_parcels_user_status ON parcels(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_parcels_user_tracking
  ON parcels(user_id, tracking_number);

CREATE TABLE IF NOT EXISTS send_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  recipient_name TEXT,
  recipient_phone TEXT,
  recipient_address TEXT,
  parcel_size TEXT,
  weight_kg REAL,
  pickup_mode TEXT,
  selected_courier TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  confirm_token TEXT,
  created_parcel_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_send_drafts_user_id ON send_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_send_drafts_confirm_token ON send_drafts(confirm_token);

-- Sprint 3 — Returns (US2.7, US2.8)
CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  parcel_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  return_method TEXT NOT NULL,
  return_tracking_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'initiated',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parcel_id) REFERENCES parcels(id)
);

CREATE INDEX IF NOT EXISTS idx_returns_user_id ON returns(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_parcel_id ON returns(parcel_id);

-- Sprint 3 — Linked Accounts (US1.4, US1.5)
-- access_token and refresh_token are stored ENCRYPTED (AES-256-GCM)
CREATE TABLE IF NOT EXISTS linked_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  access_token_ciphertext BLOB NOT NULL,
  access_token_iv BLOB NOT NULL,
  access_token_tag BLOB NOT NULL,
  refresh_token_ciphertext BLOB NOT NULL,
  refresh_token_iv BLOB NOT NULL,
  refresh_token_tag BLOB NOT NULL,
  expires_at TEXT,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_refreshed_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_linked_accounts_user_id ON linked_accounts(user_id);

-- Sprint 3 — Notification preferences (US4.1)
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id INTEGER PRIMARY KEY,
  email_on_exception INTEGER NOT NULL DEFAULT 1,
  email_on_delivered INTEGER NOT NULL DEFAULT 0,
  email_on_returned INTEGER NOT NULL DEFAULT 1,
  inapp_on_exception INTEGER NOT NULL DEFAULT 1,
  inapp_on_delivered INTEGER NOT NULL DEFAULT 1,
  inapp_on_returned INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Sprint 3 — Audit log for sensitive operations
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Sprint 2 — US2.8 Delivery Confirmation + US4.2 Rate Delivery.
-- One rating per parcel. Stars 1-5 enforced by CHECK constraint.
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  parcel_id INTEGER NOT NULL UNIQUE,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parcel_id) REFERENCES parcels(id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);

-- Sprint 2 — In-app notification events (distinct from notification_prefs).
-- Generated when a parcel transitions to delivered etc. Read state per row.
CREATE TABLE IF NOT EXISTS notification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  parcel_id INTEGER,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parcel_id) REFERENCES parcels(id)
);

CREATE INDEX IF NOT EXISTS idx_notif_events_user_unread ON notification_events(user_id, read_at);
-- Dedupe: at most one delivery notification per parcel per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_events_dedupe
  ON notification_events(user_id, parcel_id, type);
`
