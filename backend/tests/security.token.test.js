import './helpers/setupDb.js'
import { describe, test, expect } from '@jest/globals'
import { encryptToken, decryptToken, generateKey } from '../src/modules/security/tokenCrypto.js'

describe('Sprint 3 — AES-256-GCM token crypto', () => {
  test('round-trip: encrypt then decrypt returns original plaintext', () => {
    const plaintext = 'oauth_access_token_abc123xyz789'
    const enc = encryptToken(plaintext)
    const dec = decryptToken(enc)
    expect(dec).toBe(plaintext)
  })

  test('round-trip handles long tokens (refresh-style)', () => {
    const plaintext = 'x'.repeat(400)
    const enc = encryptToken(plaintext)
    expect(decryptToken(enc)).toBe(plaintext)
  })

  test('each encrypt call uses a fresh IV — same plaintext yields different ciphertext', () => {
    const plaintext = 'same-token-value'
    const a = encryptToken(plaintext)
    const b = encryptToken(plaintext)
    // ciphertexts differ because IV differs
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false)
    expect(a.iv.equals(b.iv)).toBe(false)
    // But both decrypt back to the same plaintext
    expect(decryptToken(a)).toBe(plaintext)
    expect(decryptToken(b)).toBe(plaintext)
  })

  test('tampered ciphertext is rejected by GCM auth tag', () => {
    const enc = encryptToken('sensitive_token_value')
    // Flip a byte in the ciphertext
    const tampered = Buffer.from(enc.ciphertext)
    tampered[0] = tampered[0] ^ 0xff
    expect(() => decryptToken({ ...enc, ciphertext: tampered }))
      .toThrow()
  })

  test('tampered auth tag is rejected', () => {
    const enc = encryptToken('sensitive_token_value')
    const tampered = Buffer.from(enc.tag)
    tampered[0] = tampered[0] ^ 0xff
    expect(() => decryptToken({ ...enc, tag: tampered }))
      .toThrow()
  })

  test('generateKey produces 32-byte (64 hex char) keys', () => {
    const k = generateKey()
    expect(k).toMatch(/^[0-9a-f]{64}$/)
  })
})
