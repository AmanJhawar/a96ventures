import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { normaliseMobile } from '@/lib/utils/phone'
import { rupeesToPaise, paiseToRupees, formatINR, sumPaise } from '@/lib/utils/money'
import {
  normalisePan,
  isValidPan,
  panHolderType,
  maskPan,
  encryptPan,
  decryptPan,
  hashPan
} from '@/lib/server/pan'
import { buildSearchTerms, queryToken } from '@/lib/utils/customer-search'
import { randomBytes } from 'node:crypto'

describe('CRM Utilities', () => {
  describe('Mobile Normalisation (phone.ts)', () => {
    it('normalises standard 10-digit Indian mobile number', () => {
      const res = normaliseMobile('+91', '9876543210')
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.countryCode).toBe('+91')
        expect(res.data.number).toBe('9876543210')
        expect(res.data.e164).toBe('+919876543210')
      }
    })

    it('defaults country code to +91 if omitted', () => {
      const res = normaliseMobile(undefined, '9876543210')
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.e164).toBe('+919876543210')
      }
    })

    it('strips spaces, dashes, dots, and parentheses', () => {
      const res = normaliseMobile('+91', ' +91 (98765) 432-10. ')
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.number).toBe('9876543210')
        expect(res.data.e164).toBe('+919876543210')
      }
    })

    it('strips a leading 0 prefix from Indian mobile numbers', () => {
      const res = normaliseMobile('+91', '09876543210')
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.number).toBe('9876543210')
        expect(res.data.e164).toBe('+919876543210')
      }
    })

    it('strips duplicate 91 or +91 prefixes when provided in input', () => {
      const res1 = normaliseMobile('+91', '919876543210')
      expect(res1.success).toBe(true)
      if (res1.success) {
        expect(res1.data.number).toBe('9876543210')
        expect(res1.data.e164).toBe('+919876543210')
      }

      const res2 = normaliseMobile('+91', '+919876543210')
      expect(res2.success).toBe(true)
      if (res2.success) {
        expect(res2.data.number).toBe('9876543210')
        expect(res2.data.e164).toBe('+919876543210')
      }
    })

    it('accepts numbers starting with 6, 7, 8, or 9', () => {
      expect(normaliseMobile('+91', '6123456789').success).toBe(true)
      expect(normaliseMobile('+91', '7123456789').success).toBe(true)
      expect(normaliseMobile('+91', '8123456789').success).toBe(true)
      expect(normaliseMobile('+91', '9123456789').success).toBe(true)
    })

    it('rejects Indian numbers starting with 1 to 5', () => {
      const res = normaliseMobile('+91', '5123456789')
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error).toContain('start with 6, 7, 8, or 9')
      }
    })

    it('rejects numbers with invalid lengths for India', () => {
      expect(normaliseMobile('+91', '987654321').success).toBe(false) // 9 digits
      expect(normaliseMobile('+91', '98765432101').success).toBe(false) // 11 digits
    })

    it('supports valid international numbers for non-+91 codes', () => {
      const res = normaliseMobile('+1', '4155552671')
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data.countryCode).toBe('+1')
        expect(res.data.number).toBe('4155552671')
        expect(res.data.e164).toBe('+14155552671')
      }
    })

    it('rejects empty or whitespace-only inputs', () => {
      expect(normaliseMobile('+91', '').success).toBe(false)
      expect(normaliseMobile('+91', '   ').success).toBe(false)
      expect(normaliseMobile('+91', null).success).toBe(false)
    })
  })

  describe('Money & Paise Conversions (money.ts)', () => {
    it('converts valid string amounts to integer paise', () => {
      expect(rupeesToPaise('1999.99')).toBe(199999)
      expect(rupeesToPaise('100')).toBe(10000)
      expect(rupeesToPaise('100.5')).toBe(10050)
      expect(rupeesToPaise('0.05')).toBe(5)
      expect(rupeesToPaise('0')).toBe(0)
    })

    it('converts valid numeric amounts to integer paise', () => {
      expect(rupeesToPaise(1999.99)).toBe(199999)
      expect(rupeesToPaise(100)).toBe(10000)
      expect(rupeesToPaise(0)).toBe(0)
    })

    it('handles floating point precision edge cases like 0.1 + 0.2', () => {
      const floatSum = 0.1 + 0.2 // evaluates to 0.30000000000000004 in IEEE-754
      expect(rupeesToPaise(floatSum)).toBe(30)
    })

    it('rejects string amounts with more than 2 decimal places', () => {
      expect(() => rupeesToPaise('1999.999')).toThrow(/more than 2 decimal places/)
      expect(() => rupeesToPaise('0.001')).toThrow(/more than 2 decimal places/)
    })

    it('rejects numeric amounts with more than 2 decimal places', () => {
      expect(() => rupeesToPaise(1999.999)).toThrow(/more than 2 decimal places/)
    })

    it('converts paise back to rupees', () => {
      expect(paiseToRupees(199999)).toBe(1999.99)
      expect(paiseToRupees(30)).toBe(0.3)
      expect(paiseToRupees(10000)).toBe(100)
      expect(paiseToRupees(0)).toBe(0)
      expect(() => paiseToRupees(10.5)).toThrow(/integer/)
    })

    it('formats paise as localized INR currency string', () => {
      const formattedWithPaise = formatINR(199999)
      expect(formattedWithPaise).toContain('1,999.99')

      const formattedWhole = formatINR(10000)
      expect(formattedWhole).toContain('100')
      expect(formattedWhole).not.toContain('.00')
    })

    it('sums an array of paise amounts safely', () => {
      expect(sumPaise([10000, 2550, 450])).toBe(13000)
      expect(sumPaise([])).toBe(0)
      expect(() => sumPaise([100, 10.5])).toThrow(/integer/)
    })
  })

  describe('PAN Cryptography & Blind Indexing (pan.ts)', () => {
    const testEncryptionKey = randomBytes(32)
    const testHmacKey = randomBytes(32)

    beforeAll(() => {
      process.env.PAN_ENCRYPTION_KEY = testEncryptionKey.toString('base64')
      process.env.PAN_HMAC_KEY = testHmacKey.toString('base64')
      process.env.PAN_KEY_VERSION = '1'
    })

    it('normalises PAN by uppercasing and stripping whitespace', () => {
      expect(normalisePan(' abcde 1234 f ')).toBe('ABCDE1234F')
    })

    it('validates PAN format correctly', () => {
      expect(isValidPan('ABCDE1234F')).toBe(true)
      expect(isValidPan('ZZZZZ9999Z')).toBe(true)
      expect(isValidPan('AAAPA1111A')).toBe(true)

      // Invalid samples
      expect(isValidPan('ABCD1234F')).toBe(false) // 4 letters
      expect(isValidPan('ABCDE12345')).toBe(false) // last char digit
      expect(isValidPan('ABCDE1234FF')).toBe(false) // 11 chars
      expect(isValidPan('12345ABCDE')).toBe(false)
      expect(isValidPan('')).toBe(false)
    })

    it('extracts correct holder type from 4th character', () => {
      expect(panHolderType('AAAPA1111A')).toBe('P') // Individual
      expect(panHolderType('AAACA1111A')).toBe('C') // Company
      expect(panHolderType('AAAFA1111A')).toBe('F') // Firm
      expect(panHolderType('AAAHA1111A')).toBe('H') // HUF
    })

    it('masks PAN preserving only last 4 characters and 5th letter', () => {
      expect(maskPan('ABCDE1234F')).toBe('•••••1234F')
      expect(maskPan('AAAPA9999Z')).toBe('•••••9999Z')
    })

    it('encrypts and decrypts round-trip with AES-256-GCM', () => {
      const original = 'ABCDE1234F'
      const encrypted = encryptPan(original)

      expect(encrypted.ciphertext).toBeDefined()
      expect(encrypted.iv).toBeDefined()
      expect(encrypted.authTag).toBeDefined()
      expect(encrypted.keyVersion).toBe(1)

      const decrypted = decryptPan(encrypted)
      expect(decrypted).toBe(original)
    })

    it('fails to decrypt if ciphertext is tampered', () => {
      const encrypted = encryptPan('ABCDE1234F')
      const tampered = {
        ...encrypted,
        ciphertext: Buffer.from('tampered_data').toString('base64')
      }
      expect(() => decryptPan(tampered)).toThrow(/Failed to decrypt PAN/)
    })

    it('fails to decrypt if authTag is tampered', () => {
      const encrypted = encryptPan('ABCDE1234F')
      const tampered = {
        ...encrypted,
        authTag: Buffer.from(randomBytes(16)).toString('base64')
      }
      expect(() => decryptPan(tampered)).toThrow(/Failed to decrypt PAN/)
    })

    it('computes identical blind HMAC-SHA256 hash for identical normalised PANs', () => {
      const hash1 = hashPan('ABCDE1234F')
      const hash2 = hashPan('  abcde 1234 f  ')
      expect(hash1).toBe(hash2)

      const hash3 = hashPan('AAAPA1111A')
      expect(hash1).not.toBe(hash3)
    })

    it('decrypts across different key versions using explicit key override', () => {
      const oldKey = randomBytes(32)
      const encryptedV2 = encryptPan('ABCDE1234F', { key: oldKey, keyVersion: 2 })
      expect(encryptedV2.keyVersion).toBe(2)

      const decrypted = decryptPan(encryptedV2, { key: oldKey })
      expect(decrypted).toBe('ABCDE1234F')
    })

    it('picks correct encryption key by keyVersion from environment variables (PAN_ENCRYPTION_KEY_V1, _V2)', () => {
      const originalKeyV1 = process.env.PAN_ENCRYPTION_KEY_V1
      const originalKeyV2 = process.env.PAN_ENCRYPTION_KEY_V2
      const originalKeyVer = process.env.PAN_KEY_VERSION

      try {
        const v1Key = randomBytes(32).toString('base64')
        const v2Key = randomBytes(32).toString('base64')

        process.env.PAN_ENCRYPTION_KEY_V1 = v1Key
        process.env.PAN_ENCRYPTION_KEY_V2 = v2Key

        // Encrypt with V1
        process.env.PAN_KEY_VERSION = '1'
        const encV1 = encryptPan('ABCDE1234F')
        expect(encV1.keyVersion).toBe(1)

        // Encrypt with V2
        process.env.PAN_KEY_VERSION = '2'
        const encV2 = encryptPan('XYZPK9876G')
        expect(encV2.keyVersion).toBe(2)

        // Decrypt automatically picking keys by version
        expect(decryptPan(encV1)).toBe('ABCDE1234F')
        expect(decryptPan(encV2)).toBe('XYZPK9876G')
      } finally {
        process.env.PAN_ENCRYPTION_KEY_V1 = originalKeyV1
        process.env.PAN_ENCRYPTION_KEY_V2 = originalKeyV2
        process.env.PAN_KEY_VERSION = originalKeyVer
      }
    })

    it('never leaks the PAN plaintext in thrown error messages', () => {
      const badPan = 'ABCDE12345'
      try {
        encryptPan(badPan)
      } catch (err: unknown) {
        expect((err as Error).message).not.toContain(badPan)
      }
    })
  })

  describe('Customer Search Tokenizer (customer-search.ts)', () => {
    it('generates prefix tokens for names and mobile digits per ADR 0001', () => {
      const terms = buildSearchTerms({
        firstName: 'Aman',
        lastName: 'Jhawar',
        mobile: {
          number: '9876543210',
          e164: '+919876543210'
        }
      })

      // Name prefixes
      expect(terms).toContain('am')
      expect(terms).toContain('ama')
      expect(terms).toContain('aman')
      expect(terms).toContain('jh')
      expect(terms).toContain('jha')
      expect(terms).toContain('jhawar')

      // Full name progression
      expect(terms).toContain('aman jh')
      expect(terms).toContain('aman jhawar')

      // Mobile prefixes and last 4
      expect(terms).toContain('98')
      expect(terms).toContain('987')
      expect(terms).toContain('9876543210')
      expect(terms).toContain('3210') // last 4 digits
    })

    it('normalises client search tokens for array-contains queries', () => {
      expect(queryToken('  Aman ')).toBe('aman')
      expect(queryToken('98765')).toBe('98765')
      expect(queryToken('')).toBe('')
      expect(queryToken(null)).toBe('')
    })

    it('strips spaces, dashes, and leading +91 or 0 from numeric queries', () => {
      expect(queryToken('98765 43210')).toBe('9876543210')
      expect(queryToken('+91 9876543210')).toBe('9876543210')
      expect(queryToken('+91 98765 43210')).toBe('9876543210')
      expect(queryToken('+91 98765')).toBe('98765')
      expect(queryToken('09876543210')).toBe('9876543210')
      expect(queryToken('098765 43210')).toBe('9876543210')
      expect(queryToken('98765-43210')).toBe('9876543210')
      expect(queryToken('+91-98765-43210')).toBe('9876543210')
    })
  })
})
