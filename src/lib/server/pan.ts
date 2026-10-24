import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto'

export interface EncryptedPanPayload {
  ciphertext: string // Base64
  iv: string // Base64 (12 bytes)
  authTag: string // Base64 (16 bytes)
  keyVersion: number
}

import { normalisePan, isValidPan, panHolderType, maskPan } from '@/lib/utils/pan'
export { normalisePan, isValidPan, panHolderType, maskPan }

function getEncryptionKey(overrideKey?: Buffer, version?: number): Buffer {
  if (overrideKey) return overrideKey

  const v = version ?? (process.env.PAN_KEY_VERSION ? Number(process.env.PAN_KEY_VERSION) : 1)
  const envVarName = `PAN_ENCRYPTION_KEY_V${v}`
  let keyB64 = process.env[envVarName]

  // Backwards compatibility fallback for version 1 if PAN_ENCRYPTION_KEY_V1 is not set
  if (!keyB64 && v === 1) {
    keyB64 = process.env.PAN_ENCRYPTION_KEY
  }

  if (!keyB64) {
    throw new Error(`Customer data encryption key is not configured (${envVarName} missing)`)
  }
  const buf = Buffer.from(keyB64, 'base64')
  if (buf.length !== 32) {
    throw new Error(`Invalid ${envVarName}: must be exactly 32 bytes (256-bit base64)`)
  }
  return buf
}

function getHmacKey(overrideKey?: Buffer): Buffer {
  if (overrideKey) return overrideKey
  const keyB64 = process.env.PAN_HMAC_KEY
  if (!keyB64) {
    throw new Error('Customer data indexing key is not configured (PAN_HMAC_KEY missing)')
  }
  const buf = Buffer.from(keyB64, 'base64')
  if (buf.length !== 32) {
    throw new Error('Invalid PAN_HMAC_KEY: must be exactly 32 bytes (256-bit base64)')
  }
  return buf
}

/**
 * Encrypts a valid PAN using AES-256-GCM with a fresh random 12-byte IV.
 * Throws if the PAN is invalid or cryptographic keys are missing.
 * The PAN itself is never included in any thrown error message.
 */
export function encryptPan(
  pan: string,
  options?: { key?: Buffer; keyVersion?: number }
): EncryptedPanPayload {
  const normalised = normalisePan(pan)
  if (!isValidPan(normalised)) {
    throw new Error('Encryption rejected: invalid PAN format')
  }

  const keyVersion = options?.keyVersion ?? Number(process.env.PAN_KEY_VERSION || 1)
  const key = getEncryptionKey(options?.key, keyVersion)
  const iv = randomBytes(12)

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertextBuffer = Buffer.concat([cipher.update(normalised, 'utf8'), cipher.final()])
  const authTagBuffer = cipher.getAuthTag()

  return {
    ciphertext: ciphertextBuffer.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTagBuffer.toString('base64'),
    keyVersion
  }
}

/**
 * Decrypts and authenticates an encrypted PAN payload using AES-256-GCM.
 * Validates GCM authentication tag before returning the decrypted plaintext.
 */
export function decryptPan(
  payload: { ciphertext: string; iv: string; authTag: string; keyVersion?: number },
  options?: { key?: Buffer }
): string {
  if (!payload || !payload.ciphertext || !payload.iv || !payload.authTag) {
    throw new Error('Decryption failed: malformed encrypted PAN payload')
  }

  const key = getEncryptionKey(options?.key, payload.keyVersion)
  const ivBuffer = Buffer.from(payload.iv, 'base64')
  const authTagBuffer = Buffer.from(payload.authTag, 'base64')
  const ciphertextBuffer = Buffer.from(payload.ciphertext, 'base64')

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, ivBuffer)
    decipher.setAuthTag(authTagBuffer)
    const decryptedBuffer = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()])
    return decryptedBuffer.toString('utf8')
  } catch {
    throw new Error('Failed to decrypt PAN: invalid ciphertext or authentication tag mismatch')
  }
}

/**
 * Computes a deterministic HMAC-SHA256 blind index hex hash for the normalised PAN.
 * Used exclusively for enforcing uniqueness across customer documents without storing plaintext.
 */
export function hashPan(pan: string, options?: { hmacKey?: Buffer }): string {
  const normalised = normalisePan(pan)
  if (!isValidPan(normalised)) {
    throw new Error('Indexing rejected: invalid PAN format')
  }

  const hmacKey = getHmacKey(options?.hmacKey)
  return createHmac('sha256', hmacKey).update(normalised, 'utf8').digest('hex')
}
