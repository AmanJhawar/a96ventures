import { describe, it, expect } from 'vitest'
import {
  normalizeProductLedgerState,
  applyRecordTransaction,
  applyReverseTransaction
} from '@/lib/server/ledger'
import { Product } from '@/lib/types'

describe('Shared Ledger Rules', () => {
  describe('normalizeProductLedgerState', () => {
    it('normalizes Bullion product with stock by location', () => {
      const product: Partial<Product> = {
        name: '10g Gold Coin',
        category: 'Bullions',
        stock: 5,
        stockByLocation: {
          loc1: 3,
          loc2: 2
        },
        weight: 10,
        weightMg: 10000
      }

      const state = normalizeProductLedgerState(product)
      expect(state.isIdol).toBe(false)
      expect(state.currentTotalStock).toBe(5)
      expect(state.stockByLocation).toEqual({ loc1: 3, loc2: 2 })
      expect(state.currentWeightMg).toBe(10000)
    })

    it('normalizes Idol product with pieceWeights in grams to milligrams', () => {
      const product: Partial<Product> = {
        name: 'Ganesh Idol',
        category: 'Idols',
        stock: 2,
        stockByLocation: { loc1: 2 },
        pieceWeights: [25.5, 30.2],
        pieceWeightsByLocation: {
          loc1: [25.5, 30.2]
        }
      }

      const state = normalizeProductLedgerState(product)
      expect(state.isIdol).toBe(true)
      expect(state.piecesMg).toEqual([25500, 30200])
      expect(state.piecesByLocMg).toEqual({
        loc1: [25500, 30200]
      })
    })
  })

  describe('applyRecordTransaction', () => {
    it('records a purchase for an Idol product and updates pieces and average weight', () => {
      const product: Partial<Product> = {
        name: 'Lakshmi Idol',
        category: 'Idols',
        stock: 1,
        stockByLocation: { loc1: 1 },
        pieceWeightsMg: [50000],
        pieceWeightsByLocationMg: { loc1: [50000] }
      }

      const result = applyRecordTransaction({
        productData: product,
        type: 'purchase',
        quantity: 2,
        locationId: 'loc1',
        locationName: 'Main Store',
        pieceWeights: [60, 70]
      })

      expect(result.newTotalStock).toBe(3)
      expect(result.newStockByLocation.loc1).toBe(3)
      expect(result.txPiecePayload.pieceWeights).toEqual([60, 70])
      expect(result.txPiecePayload.pieceWeightsMg).toEqual([60000, 70000])
      expect(result.productUpdates.pieceWeightsMg).toEqual([50000, 60000, 70000])
      expect(result.productUpdates.stock).toBe(3)
      // Average of 50000, 60000, 70000 is 60000mg = 60g
      expect(result.productUpdates.weightMg).toBe(60000)
      expect(result.productUpdates.weight).toBe(60)
    })

    it('records a sale and removes the specific piece from the location and catalog', () => {
      const product: Partial<Product> = {
        name: 'Lakshmi Idol',
        category: 'Idols',
        stock: 2,
        stockByLocation: { loc1: 2 },
        pieceWeightsMg: [50000, 60000],
        pieceWeightsByLocationMg: { loc1: [50000, 60000] }
      }

      const result = applyRecordTransaction({
        productData: product,
        type: 'sale',
        quantity: 1,
        locationId: 'loc1',
        locationName: 'Main Store',
        pieceWeight: 50
      })

      expect(result.newTotalStock).toBe(1)
      expect(result.newStockByLocation.loc1).toBe(1)
      expect(result.txPiecePayload.pieceWeight).toBe(50)
      expect(result.txPiecePayload.pieceWeightMg).toBe(50000)
      expect(result.productUpdates.pieceWeightsMg).toEqual([60000])
      expect(result.productUpdates.weight).toBe(60)
    })

    it('rejects sale if the specific piece is not available at the store', () => {
      const product: Partial<Product> = {
        name: 'Lakshmi Idol',
        category: 'Idols',
        stock: 1,
        stockByLocation: { loc1: 1 },
        pieceWeightsMg: [50000],
        pieceWeightsByLocationMg: { loc1: [50000] }
      }

      expect(() => {
        applyRecordTransaction({
          productData: product,
          type: 'sale',
          quantity: 1,
          locationId: 'loc1',
          locationName: 'Main Store',
          pieceWeight: 99.9 // Not present
        })
      }).toThrow(/not available at Main Store to sell/)
    })

    it('rejects sale if location has insufficient quantity', () => {
      const product: Partial<Product> = {
        name: 'Gold Bar',
        category: 'Bullions',
        stock: 2,
        stockByLocation: { loc1: 1, loc2: 1 }
      }

      expect(() => {
        applyRecordTransaction({
          productData: product,
          type: 'sale',
          quantity: 2,
          locationId: 'loc1',
          locationName: 'Branch 1'
        })
      }).toThrow(/Insufficient stock at Branch 1/)
    })

    it('handles stock transfer between locations correctly', () => {
      const product: Partial<Product> = {
        name: 'Ganesh Idol',
        category: 'Idols',
        stock: 2,
        stockByLocation: { loc1: 2, loc2: 0 },
        pieceWeightsMg: [20000, 30000],
        pieceWeightsByLocationMg: { loc1: [20000, 30000], loc2: [] }
      }

      const result = applyRecordTransaction({
        productData: product,
        type: 'transfer',
        quantity: 1,
        locationId: 'loc1',
        locationName: 'Source',
        toLocationId: 'loc2',
        toLocationName: 'Destination',
        pieceWeight: 20
      })

      expect(result.newTotalStock).toBe(2) // Total remains constant
      expect(result.newStockByLocation).toEqual({ loc1: 1, loc2: 1 })
      expect(result.productUpdates.pieceWeightsByLocationMg).toEqual({
        loc1: [30000],
        loc2: [20000]
      })
    })
  })

  describe('applyReverseTransaction', () => {
    it('reverses a sale by restoring the piece and stock back to the store', () => {
      const product: Partial<Product> = {
        name: 'Lakshmi Idol',
        category: 'Idols',
        stock: 0,
        stockByLocation: { loc1: 0 },
        pieceWeightsMg: [],
        pieceWeightsByLocationMg: { loc1: [] }
      }

      const originalTx = {
        id: 'tx_123',
        type: 'sale',
        quantity: 1,
        locationId: 'loc1',
        locationName: 'Main Store',
        pieceWeightMg: 50000,
        pieceWeight: 50
      }

      const result = applyReverseTransaction({
        productData: product,
        originalTx
      })

      expect(result.newTotalStock).toBe(1)
      expect(result.newStockByLocation.loc1).toBe(1)
      expect(result.reversalTxData.type).toBe('reversal')
      expect(result.reversalTxData.quantity).toBe(1)
      expect(result.productUpdates.pieceWeightsMg).toEqual([50000])
      expect(result.productUpdates.weight).toBe(50)
    })

    it('prevents reversing a purchase if subsequent sale would cause negative stock', () => {
      const product: Partial<Product> = {
        name: 'Gold Coin',
        category: 'Bullions',
        stock: 0, // After selling the purchased item, stock is now 0
        stockByLocation: { loc1: 0 }
      }

      const originalPurchaseTx = {
        id: 'tx_pur_1',
        type: 'purchase',
        quantity: 1,
        locationId: 'loc1',
        locationName: 'Main Store'
      }

      expect(() => {
        applyReverseTransaction({
          productData: product,
          originalTx: originalPurchaseTx
        })
      }).toThrow(/stock at Main Store would fall below zero \(-1\)/)
    })

    it('prevents reversing a transfer if destination location has 0 stock', () => {
      const product: Partial<Product> = {
        name: 'Ganesh Idol',
        category: 'Idols',
        stock: 1,
        stockByLocation: { loc1: 1, loc2: 0 },
        pieceWeightsMg: [30000],
        pieceWeightsByLocationMg: { loc1: [30000], loc2: [] }
      }

      const originalTransferTx = {
        id: 'tx_trf_1',
        type: 'transfer',
        quantity: 1,
        locationId: 'loc1',
        locationName: 'Source Store',
        toLocationId: 'loc2',
        toLocationName: 'Branch Store',
        pieceWeight: 25,
        pieceWeightMg: 25000
      }

      expect(() => {
        applyReverseTransaction({
          productData: product,
          originalTx: originalTransferTx
        })
      }).toThrow(/stock at Branch Store would fall below zero \(-1\)/)
    })

    it('prevents reversing a transfer if destination location has stock but specific piece is missing', () => {
      const product: Partial<Product> = {
        name: 'Ganesh Idol',
        category: 'Idols',
        stock: 2,
        stockByLocation: { loc1: 1, loc2: 1 },
        pieceWeightsMg: [30000, 35000],
        pieceWeightsByLocationMg: { loc1: [30000], loc2: [35000] } // has a 35g piece, but not 25g
      }

      const originalTransferTx = {
        id: 'tx_trf_2',
        type: 'transfer',
        quantity: 1,
        locationId: 'loc1',
        locationName: 'Source Store',
        toLocationId: 'loc2',
        toLocationName: 'Branch Store',
        pieceWeight: 25,
        pieceWeightMg: 25000
      }

      expect(() => {
        applyReverseTransaction({
          productData: product,
          originalTx: originalTransferTx
        })
      }).toThrow(/the specific piece \(25g\) is no longer at Branch Store/)
    })
  })
})
