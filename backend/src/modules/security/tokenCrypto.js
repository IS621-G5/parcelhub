// AES-256-GCM token encryption for OAuth secrets at rest.
// Key: 32-byte hex string from env TOKEN_ENCRYPTION_KEY.
// IV (nonce): 12 bytes random per encryption.
// Auth tag: 16 bytes — GCM-provided integrity check; tampering detected on decrypt.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { config } from '../../config/index.js'

const ALGO = 'aes-256-gcm'
const KEY_BYTES = 32  // 256 bits
const IV_BYTES = 12   // GCM-recommended nonce size

function getKey() {
  const hex = config.tokenEncryptionKey
  if (!hex) throw new Error('TOKEN_ENCRYPTION_KEY not configured')
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== KEY_BYTES) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars), got ${buf.length} bytes`)
  }
  return buf
}

// Encrypt a plaintext string. Returns { ciphertext, iv, tag } all as Buffers.
export function encryptToken(plaintext) {
  if (typeof plaintext !== 'string') throw new Error('plaintext must be string')
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ciphertext, iv, tag }
}

// Decrypt. Throws if the ciphertext or tag has been tampered with.
// Accepts Buffers (from encryptToken) OR Uint8Arrays (from SQLite BLOB columns).
export function decryptToken({ ciphertext, iv, tag }) {
  const ct = toBuffer(ciphertext, 'ciphertext')
  const ivBuf = toBuffer(iv, 'iv')
  const tagBuf = toBuffer(tag, 'tag')
  const key = getKey()
  const decipher = createDecipheriv(ALGO, key, ivBuf)
  decipher.setAuthTag(tagBuf)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

function toBuffer(value, fieldName) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  throw new Error(`${fieldName} must be a Buffer or Uint8Array, got ${typeof value}`)
}

// Generate a fresh random encryption key (hex). Use this once to seed
// TOKEN_ENCRYPTION_KEY in the environment; rotate annually.
export function generateKey() {
  return randomBytes(KEY_BYTES).toString('hex')
}
