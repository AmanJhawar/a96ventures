import { describe, it, expect } from 'vitest'
import {
  isValidDateStringIST,
  validateFiscalCutoffDate,
  getTodayIST
} from '@/lib/utils/date'
import {
  getTransactionLocationEffect,
  calculateNetTransactionsEffect,
  calculateOpeningBalances
} from '@/lib/server/ledger'
import { assertNotZeroBalanceLocked, SystemLockedError } from '@/lib/server/system-lock'
import {
  computeArchiveChecksum,
  canonicalJsonStringify,
  verifyArchiveIntegrity
} from '@/lib/utils/archive-checksum'
import { signArchiveChecksum, verifyArchiveSignature } from '@/lib/server/archive'

describe('Fiscal Closing & Opening Balances', () => {
  describe('Fiscal Cutoff Date Validation', () => {
    const today = getTodayIST()

    it('accepts a valid YYYY-MM-DD date on or before today and later than last close', () => {
      const res = validateFiscalCutoffDate('2026-03-31', '2025-03-31')
      expect(res.isValid).toBe(true)
      expect(res.cutoffDate).toBe('2026-03-31')
      expect(res.error).toBeUndefined()
    })

    it('accepts a valid cutoff date when no previous close exists', () => {
      const res = validateFiscalCutoffDate('2026-03-31', null)
      expect(res.isValid).toBe(true)
      expect(res.cutoffDate).toBe('2026-03-31')
    })

    it('rejects empty or missing cutoff dates', () => {
      expect(validateFiscalCutoffDate(undefined, null).isValid).toBe(false)
      expect(validateFiscalCutoffDate('', null).isValid).toBe(false)
      expect(validateFiscalCutoffDate('   ', null).isValid).toBe(false)
      expect(validateFiscalCutoffDate(null, null).isValid).toBe(false)
    })

    it('rejects badly formatted dates that would cause text comparison bugs', () => {
      // e.g. 31/03/2026 or 2026/03/31 or 2026-3-31
      expect(validateFiscalCutoffDate('31/03/2026', null).isValid).toBe(false)
      expect(validateFiscalCutoffDate('2026/03/31', null).isValid).toBe(false)
      expect(validateFiscalCutoffDate('2026-3-31', null).isValid).toBe(false)
      expect(validateFiscalCutoffDate('2026-03-1', null).isValid).toBe(false)
      expect(validateFiscalCutoffDate('March 31, 2026', null).isValid).toBe(false)
      expect(validateFiscalCutoffDate('invalid-date', null).isValid).toBe(false)
    })

    it('rejects invalid calendar dates like 30 February or 31 April', () => {
      expect(validateFiscalCutoffDate('2026-02-29', null).isValid).toBe(false) // 2026 is not a leap year
      expect(validateFiscalCutoffDate('2026-04-31', null).isValid).toBe(false) // April has 30 days
      expect(validateFiscalCutoffDate('2026-13-01', null).isValid).toBe(false) // Invalid month
    })

    it('rejects future cutoff dates that would freeze upcoming operational entries', () => {
      const futureDate = '2099-12-31'
      const res = validateFiscalCutoffDate(futureDate, '2026-03-31')
      expect(res.isValid).toBe(false)
      expect(res.error).toMatch(/cannot be in the future/i)
    })

    it('refuses a second run for a period already closed', () => {
      const lastClosed = '2026-03-31'
      const res = validateFiscalCutoffDate('2026-03-31', lastClosed)
      expect(res.isValid).toBe(false)
      expect(res.error).toMatch(/must be strictly later than the last closed cutoff/i)
    })

    it('refuses an earlier cutoff date that would reopen a closed fiscal year', () => {
      const lastClosed = '2026-03-31'
      const res = validateFiscalCutoffDate('2025-03-31', lastClosed)
      expect(res.isValid).toBe(false)
      expect(res.error).toMatch(/must be strictly later than the last closed cutoff/i)
    })
  })

  describe('Post-Cutoff Transaction Net Effect per Location', () => {
    it('computes positive effect for purchases and returns', () => {
      const purchaseEffect = getTransactionLocationEffect({
        productId: 'prod_1',
        locationId: 'loc_main',
        quantity: 5,
        type: 'purchase'
      })
      expect(purchaseEffect).toEqual({ loc_main: 5 })

      const returnEffect = getTransactionLocationEffect({
        productId: 'prod_1',
        locationId: 'loc_main',
        quantity: 2,
        type: 'return'
      })
      expect(returnEffect).toEqual({ loc_main: 2 })
    })

    it('computes negative effect for sales and melts', () => {
      const saleEffect = getTransactionLocationEffect({
        productId: 'prod_1',
        locationId: 'loc_main',
        quantity: 3,
        type: 'sale'
      })
      expect(saleEffect).toEqual({ loc_main: -3 })

      const meltEffect = getTransactionLocationEffect({
        productId: 'prod_1',
        locationId: 'loc_main',
        quantity: 1,
        type: 'melt'
      })
      expect(meltEffect).toEqual({ loc_main: -1 })
    })

    it('computes transfer effect: decreases source, increases destination', () => {
      const transferEffect = getTransactionLocationEffect({
        productId: 'prod_1',
        locationId: 'loc_store1',
        toLocationId: 'loc_store2',
        quantity: 4,
        type: 'transfer'
      })
      expect(transferEffect).toEqual({
        loc_store1: -4,
        loc_store2: 4
      })
    })

    it('computes adjustment effect for positive and negative count adjustments', () => {
      const posAdj = getTransactionLocationEffect({
        productId: 'prod_1',
        locationId: 'loc_main',
        quantity: 2,
        type: 'adjustment'
      })
      expect(posAdj).toEqual({ loc_main: 2 })

      const negAdj = getTransactionLocationEffect({
        productId: 'prod_1',
        locationId: 'loc_main',
        quantity: -3,
        type: 'adjustment'
      })
      expect(negAdj).toEqual({ loc_main: -3 })
    })

    it('ignores reversed transactions and reversal entries so they do not distort net effect', () => {
      const reversedTx = getTransactionLocationEffect({
        productId: 'prod_1',
        locationId: 'loc_main',
        quantity: 5,
        type: 'sale',
        isReversed: true
      })
      expect(reversedTx).toEqual({})

      const reversalEntry = getTransactionLocationEffect({
        productId: 'prod_1',
        locationId: 'loc_main',
        quantity: 5,
        type: 'reversal',
        isReversal: true,
        reversalOf: 'tx_old'
      })
      expect(reversalEntry).toEqual({})
    })

    it('aggregates multiple post-cutoff transactions across products and locations', () => {
      const postCutoffTransactions = [
        { productId: 'p1', locationId: 'locA', quantity: 10, type: 'purchase' },
        { productId: 'p1', locationId: 'locA', quantity: 3, type: 'sale' },
        { productId: 'p1', locationId: 'locA', toLocationId: 'locB', quantity: 2, type: 'transfer' },
        { productId: 'p2', locationId: 'locB', quantity: 5, type: 'purchase' }
      ]

      const netEffects = calculateNetTransactionsEffect(postCutoffTransactions)
      // p1 locA: +10 - 3 - 2 = +5
      // p1 locB: +2
      // p2 locB: +5
      expect(netEffects).toEqual({
        p1: {
          locA: 5,
          locB: 2
        },
        p2: {
          locB: 5
        }
      })
    })
  })

  describe('Opening Balances Calculation (Eliminating Double Counting)', () => {
    it('Opening = today’s stock minus net effect of entries dated after cutoff, per location', () => {
      // Scenario:
      // Product 1:
      // At cutoff (31 March): Store 1 had 10 units.
      // After cutoff (15 April): Sold 3 units (-3) and transferred 2 units to Store 2 (-2 at Store 1, +2 at Store 2).
      // Today stock: Store 1 has 5 units, Store 2 has 2 units. Total = 7 units.
      // Net effect after cutoff: Store 1 = -5, Store 2 = +2.
      // Opening balance at Store 1 should be: 5 - (-5) = 10 units!
      // Opening balance at Store 2 should be: 2 - (+2) = 0 units (omitted)!
      // Ledger verify: Store 1 opening (10) + post-cutoff (-5) = 5 (today's stock). No double count!
      const products = [
        {
          id: 'p1',
          name: '100g Gold Bar',
          category: 'Bullions',
          metal: 'Gold',
          stockByLocation: {
            loc_store1: 5,
            loc_store2: 2
          }
        }
      ]

      const postCutoffTransactions = [
        { productId: 'p1', locationId: 'loc_store1', quantity: 3, type: 'sale' },
        { productId: 'p1', locationId: 'loc_store1', toLocationId: 'loc_store2', quantity: 2, type: 'transfer' }
      ]

      const netEffects = calculateNetTransactionsEffect(postCutoffTransactions)
      const openings = calculateOpeningBalances(products, netEffects)

      expect(openings).toHaveLength(1)
      expect(openings[0]).toEqual({
        productId: 'p1',
        productName: '100g Gold Bar',
        category: 'Bullions',
        metal: 'Gold',
        locationId: 'loc_store1',
        quantity: 10
      })
    })

    it('properly restores opening balance for location where all stock was moved out post-cutoff', () => {
      // Scenario:
      // Store 1 had 4 units at cutoff.
      // On 10 April: all 4 units were transferred to Store 2.
      // Today: Store 1 has 0 units (or absent from stockByLocation), Store 2 has 4 units.
      // Opening balance should establish Store 1 = 4, Store 2 = 0!
      const products = [
        {
          id: 'p1',
          name: 'Diamond Necklace',
          category: 'Jewelry',
          metal: 'Gold',
          stockByLocation: {
            loc_store2: 4
          }
        }
      ]

      const postCutoffTransactions = [
        { productId: 'p1', locationId: 'loc_store1', toLocationId: 'loc_store2', quantity: 4, type: 'transfer' }
      ]

      const netEffects = calculateNetTransactionsEffect(postCutoffTransactions)
      const openings = calculateOpeningBalances(products, netEffects)

      expect(openings).toHaveLength(1)
      expect(openings[0].locationId).toBe('loc_store1')
      expect(openings[0].quantity).toBe(4)
    })

    it('does not post an opening balance for products created or first purchased after cutoff', () => {
      // Scenario:
      // Product was first purchased in June (post cutoff). Today stock = 15.
      // Net effect after cutoff = +15.
      // Opening = 15 - 15 = 0. No opening balance posted!
      const products = [
        {
          id: 'p_new',
          name: 'New Arrival Bracelet',
          stockByLocation: {
            loc_store1: 15
          }
        }
      ]

      const postCutoffTransactions = [
        { productId: 'p_new', locationId: 'loc_store1', quantity: 15, type: 'purchase' }
      ]

      const netEffects = calculateNetTransactionsEffect(postCutoffTransactions)
      const openings = calculateOpeningBalances(products, netEffects)

      expect(openings).toHaveLength(0)
    })

    it('handles scenario when no transactions occurred post-cutoff (opening = today stock)', () => {
      const products = [
        {
          id: 'p1',
          name: 'Silver Coin',
          stockByLocation: {
            loc_store1: 8,
            loc_store2: 12
          }
        }
      ]

      const openings = calculateOpeningBalances(products, {})
      expect(openings).toHaveLength(2)
      expect(openings).toEqual([
        {
          productId: 'p1',
          productName: 'Silver Coin',
          category: 'Bullions',
          metal: 'Gold',
          locationId: 'loc_store1',
          quantity: 8
        },
        {
          productId: 'p1',
          productName: 'Silver Coin',
          category: 'Bullions',
          metal: 'Gold',
          locationId: 'loc_store2',
          quantity: 12
        }
      ])
    })
  })

  describe('In-Transaction Zero-Balance Run Lock Check', () => {
    it('allows write transaction when lock document does not exist', () => {
      const snap = {
        exists: false,
        data: () => undefined
      } as unknown as FirebaseFirestore.DocumentSnapshot

      expect(() => assertNotZeroBalanceLocked(snap)).not.toThrow()
    })

    it('allows write transaction when lock document exists but isLocked is false', () => {
      const snap = {
        exists: true,
        data: () => ({ isLocked: false })
      } as unknown as FirebaseFirestore.DocumentSnapshot

      expect(() => assertNotZeroBalanceLocked(snap)).not.toThrow()
    })

    it('throws SystemLockedError with code 423 when lock is actively held', () => {
      const snap = {
        exists: true,
        data: () => ({
          isLocked: true,
          lockedByName: 'Alice Admin',
          expiresAt: Date.now() + 60000
        })
      } as unknown as FirebaseFirestore.DocumentSnapshot

      let caughtErr: unknown = null
      try {
        assertNotZeroBalanceLocked(snap)
      } catch (err) {
        caughtErr = err
      }

      expect(caughtErr).toBeInstanceOf(SystemLockedError)
      expect((caughtErr as SystemLockedError).statusCode).toBe(423)
      expect((caughtErr as SystemLockedError).message).toMatch(/Alice Admin/i)
    })

    it('allows write transaction if the lock lease has expired', () => {
      const snap = {
        exists: true,
        data: () => ({
          isLocked: true,
          lockedByName: 'Alice Admin',
          expiresAt: Date.now() - 1000 // expired 1s ago
        })
      } as unknown as FirebaseFirestore.DocumentSnapshot

      expect(() => assertNotZeroBalanceLocked(snap)).not.toThrow()
    })
  })

  describe('Archive Checksum & Cryptographic Signature', () => {
    it('produces identical deterministic canonical JSON regardless of key insertion order', () => {
      const obj1 = { b: 2, a: 1, c: { y: 20, x: 10 } }
      const obj2 = { c: { x: 10, y: 20 }, a: 1, b: 2 }

      expect(canonicalJsonStringify(obj1)).toBe(canonicalJsonStringify(obj2))
    })

    it('computes consistent deterministic SHA-256 for archive content', async () => {
      const sample = {
        cutoffDate: '2026-03-31',
        openingDate: '2026-04-01',
        totalTransactions: 1,
        totalAuditLogs: 1,
        transactions: [{ id: 'tx_1', type: 'sale', quantity: 2 }],
        auditLogs: [{ id: 'audit_1', action: 'create' }],
        productsSnapshot: [{ id: 'prod_1', stock: 10 }]
      }

      const hash1 = await computeArchiveChecksum(sample)
      const hash2 = await computeArchiveChecksum(sample)
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // 64 hex characters (256-bit SHA-256)
    })

    it('verifies valid archives and detects tampered content', async () => {
      const payload: Record<string, unknown> = {
        cutoffDate: '2026-03-31',
        openingDate: '2026-04-01',
        totalTransactions: 1,
        totalAuditLogs: 0,
        transactions: [{ id: 'tx_1', type: 'sale', quantity: 5 }],
        auditLogs: [],
        productsSnapshot: []
      }

      const checksum = await computeArchiveChecksum({
        cutoffDate: '2026-03-31',
        openingDate: '2026-04-01',
        totalTransactions: 1,
        totalAuditLogs: 0,
        transactions: payload.transactions as unknown[],
        auditLogs: [],
        productsSnapshot: []
      })

      // 1. Valid
      payload.checksum = checksum
      const resultValid = await verifyArchiveIntegrity(payload)
      expect(resultValid.status).toBe('verified')

      // 2. Tampered content (changed quantity)
      const tamperedPayload = {
        ...payload,
        transactions: [{ id: 'tx_1', type: 'sale', quantity: 999 }]
      }
      const resultTampered = await verifyArchiveIntegrity(tamperedPayload)
      expect(resultTampered.status).toBe('tampered')

      // 3. Unverified (no checksum)
      const { checksum: _removed, ...noChecksumPayload } = payload
      const resultUnverified = await verifyArchiveIntegrity(noChecksumPayload)
      expect(resultUnverified.status).toBe('unverified')
    })

    it('generates and validates server HMAC-SHA256 signatures', () => {
      const sampleChecksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      const signature = signArchiveChecksum(sampleChecksum)

      expect(signature).toHaveLength(64)
      expect(verifyArchiveSignature(sampleChecksum, signature)).toBe(true)

      // Altered checksum with original signature must fail
      const forgedChecksum = 'a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      expect(verifyArchiveSignature(forgedChecksum, signature)).toBe(false)

      // Invalid signature
      expect(verifyArchiveSignature(sampleChecksum, 'invalid_sig')).toBe(false)
    })
  })

  describe('Opening Balances with Real Weights & Idol Piece Lists', () => {
    it('calculates bullion opening balance with real total weight and piece weight', () => {
      const products = [
        {
          id: 'p_gold_bar',
          name: '10g Gold Bar',
          category: 'Bullions',
          metal: 'Gold',
          weight: 10,
          weightMg: 10000,
          stockByLocation: {
            loc_vault: 5
          }
        }
      ]

      const openings = calculateOpeningBalances(products, {})
      expect(openings).toHaveLength(1)
      expect(openings[0]).toEqual({
        productId: 'p_gold_bar',
        productName: '10g Gold Bar',
        category: 'Bullions',
        metal: 'Gold',
        locationId: 'loc_vault',
        quantity: 5,
        weight: 50,
        weightMg: 50000,
        pieceWeight: 10,
        pieceWeightMg: 10000
      })
    })

    it('calculates idol opening balance with individual piece weights and total weight', () => {
      const products = [
        {
          id: 'p_ganesha',
          name: 'Silver Ganesha Idol',
          category: 'Idols',
          metal: 'Silver',
          pieceWeightsByLocation: {
            loc_showroom: [15.2, 22.5, 30.0]
          },
          stockByLocation: {
            loc_showroom: 3
          }
        }
      ]

      const openings = calculateOpeningBalances(products, {})
      expect(openings).toHaveLength(1)
      expect(openings[0].productId).toBe('p_ganesha')
      expect(openings[0].category).toBe('Idols')
      expect(openings[0].quantity).toBe(3)
      expect(openings[0].pieceWeights).toEqual([15.2, 22.5, 30.0])
      expect(openings[0].pieceWeightsMg).toEqual([15200, 22500, 30000])
      expect(openings[0].weight).toBe(67.7)
      expect(openings[0].weightMg).toBe(67700)
    })
  })
})


