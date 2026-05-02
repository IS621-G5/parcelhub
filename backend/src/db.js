// Database setup using Node 22 built-in SQLite — no native build required.
// File `data.db` is created automatically on first run.

import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('./data.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

export default db
