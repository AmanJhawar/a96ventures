import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto'

export interface EncryptedPanPayload {
  ciphertext: string // Base64
  iv: string // Base64 (12 bytes)
  authTag: string // Base64 (16 bytes)
  keyVersion: number
}

/**
 * Normalises a PAN string by stripping all whitespace and converting to uppercase.
 */
export function normalisePan(pan: string): string {
  if (!pan || typeof pan !== 'string') return ''
  return pan.replace(/\s+/g, '').toUpperCase()
}

/**
 * Validates whether a PAN conforms to the statutory Indian Income Tax format:
 * 5 uppercase letters, 4 digits, 1 uppercase letter (e.g. ABCDE1234F).
 */
export function isValidPan(pan: string): boolean {
  const normalised = normalisePan(pan)
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalised)
}

/**
 * Extracts the 4th character of a valid PAN representing the holder status:
 * P = Individual, C = Company, H = Hindu Undivided Family, F = Firm, A = Association,
 * T = Trust, B = Body of Individuals, L = Local Authority, J = Artificial Juridical Person, G = Government.
 */
export function panHolderType(pan: string): string {
  const normalised = normalisePan(pan)
  if (!isValidPan(normalised)) {
    throw new Error('Invalid PAN: cannot extract holder type')
  }
  return normalised[3]
}

/**
 * Returns a display-masked PAN (e.g. "•••••1234F").
 * The full PAN is never exposed on ordinary displays.
 */
export function maskPan(pan: string): string {
  const normalised = normalisePan(pan)
  if (!isValidPan(normalised)) {
    throw new Error('Invalid PAN: cannot mask invalid format')
  }
  return `•••••${normalised.slice(5)}`
}

function getEncryptionKey(overrideKey?: Buffer): Buffer {
  if (overrideKey) return overrideKey
  const keyB64 = process.env.PAN_ENCRYPTION_KEY
  if (!keyB64) {
    throw new Error('Customer data encryption key is not configured (PAN_ENCRYPTION_KEY missing)')
  }
  const buf = Buffer.from(keyB64, 'base64')
  if (buf.length !== 32) {
    throw new Error('Invalid PAN_ENCRYPTION_KEY: must be exactly 32 bytes (256-bit base64)')
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

  const key = getEncryptionKey(options?.key)
  const iv = randomBytes(12)
  const keyVersion = options?.keyVersion ?? Number(process.env.PAN_KEY_VERSION || 1)

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

  const key = getEncryptionKey(options?.key)
  const ivBuffer = Buffer.from(payload.iv, 'base64')
  const authTagBuffer = Buffer.from(payload.authTag, 'base64')
  const ciphertextBuffer = Buffer.from(payload.ciphertext, 'base64')

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, ivBuffer)
    decipher.setAuthTag(authTagBuffer)
    const decryptedBuffer = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()])
    return decryptedBuffer.toString('utf8')
  } catch (err: unknown) {
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
