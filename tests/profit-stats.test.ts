import { describe, it, expect } from 'vitest'
import { Transaction } from '@/lib/types'

/**
 * Pure calculation logic mirroring stats calculation:
 * Computes product unit purchase cost, sales revenue, returns amount, net revenue, COGS, and profit.
 */
function calculateProfitStats(transactions: Transaction[]) {
  const activeTxs = transactions.filter(
    (tx) => !tx.isReversed && !tx.isReversal && !tx.reversalOf
  )

  // 1. Calculate weighted average unit cost per product from purchases / opening
  const productCostMap = new Map<string, { totalCost: number; totalQty: number; lastUnitPrice: number }>()

  activeTxs.forEach((tx) => {
    if (tx.type === 'purchase' || tx.type === 'opening') {
      const pId = tx.productId
      if (!pId) return

      const qty = Number(tx.quantity || 0)
      const price = typeof tx.price === 'number' ? tx.price : 0
      const amt = typeof tx.totalAmount === 'number' ? tx.totalAmount : price * (qty > 0 ? qty : 1)

      if (!productCostMap.has(pId)) {
        productCostMap.set(pId, { totalCost: 0, totalQty: 0, lastUnitPrice: 0 })
      }
      const entry = productCostMap.get(pId)!
      if (price > 0 || amt > 0) {
        entry.totalCost += amt
        entry.totalQty += (qty > 0 ? qty : 1)
        entry.lastUnitPrice = price > 0 ? price : amt / (qty > 0 ? qty : 1)
      }
    }
  })

  const getProductUnitCost = (pId: string): number => {
    const entry = productCostMap.get(pId)
    if (entry && entry.totalQty > 0 && entry.totalCost > 0) {
      return entry.totalCost / entry.totalQty
    }
    if (entry && entry.lastUnitPrice > 0) {
      return entry.lastUnitPrice
    }
    return 0
  }

  let salesRevenue = 0
  let salesUnits = 0
  let salesCount = 0
  let salesCost = 0

  let returnsAmount = 0
  let returnsUnits = 0
  let returnsCount = 0
  let returnsCost = 0

  activeTxs.forEach((tx) => {
    const qty = Number(tx.quantity || 0)
    const price = typeof tx.price === 'number' ? tx.price : 0
    const amt = typeof tx.totalAmount === 'number' ? tx.totalAmount : price * (qty > 0 ? qty : 1)
    const unitCost = getProductUnitCost(tx.productId)

    if (tx.type === 'sale') {
      salesCount++
      salesUnits += qty
      salesRevenue += amt
      salesCost += unitCost * qty
    } else if (tx.type === 'return') {
      returnsCount++
      returnsUnits += qty
      returnsAmount += amt
      returnsCost += unitCost * qty
    }
  })

  const netRevenue = salesRevenue - returnsAmount
  const costOfGoodsSold = Math.max(0, salesCost - returnsCost)
  const profit = netRevenue - costOfGoodsSold

  return {
    salesCount,
    salesUnits,
    salesRevenue,
    returnsCount,
    returnsUnits,
    returnsAmount,
    netRevenue,
    costOfGoodsSold,
    profit,
    getProductUnitCost
  }
}

describe('Profit & Net Sales Recalculation Rules', () => {
  it('calculates profit as Net Revenue minus COGS for standard sale', () => {
    const txs: Transaction[] = [
      {
        id: 'purch_1',
        type: 'purchase',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 10,
        price: 5000,
        totalAmount: 50000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-10'
      },
      {
        id: 'sale_1',
        type: 'sale',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 2,
        price: 6000,
        totalAmount: 12000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-15'
      }
    ]

    const stats = calculateProfitStats(txs)
    expect(stats.salesRevenue).toBe(12000)
    expect(stats.netRevenue).toBe(12000)
    expect(stats.costOfGoodsSold).toBe(10000) // 2 units @ 5000 cost
    expect(stats.profit).toBe(2000) // 12000 - 10000
  })

  it('updates profit when purchase cost is modified after purchase and sale are done', () => {
    // Initial state: Purchase at 5000, Sale at 6000
    const txs: Transaction[] = [
      {
        id: 'purch_1',
        type: 'purchase',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 10,
        price: 5000,
        totalAmount: 50000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-10'
      },
      {
        id: 'sale_1',
        type: 'sale',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 2,
        price: 6000,
        totalAmount: 12000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-15'
      }
    ]

    expect(calculateProfitStats(txs).profit).toBe(2000)

    // User edits purchase cost from 5000 to 5500 per unit (invoice adjustment)
    txs[0].price = 5500
    txs[0].totalAmount = 55000

    const updatedStats = calculateProfitStats(txs)
    expect(updatedStats.getProductUnitCost('prod_coin')).toBe(5500)
    expect(updatedStats.costOfGoodsSold).toBe(11000) // 2 units @ 5500
    expect(updatedStats.salesRevenue).toBe(12000)
    expect(updatedStats.profit).toBe(1000) // 12000 - 11000
  })

  it('updates profit when sale value is modified', () => {
    const txs: Transaction[] = [
      {
        id: 'purch_1',
        type: 'purchase',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 10,
        price: 5000,
        totalAmount: 50000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-10'
      },
      {
        id: 'sale_1',
        type: 'sale',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 2,
        price: 6000,
        totalAmount: 12000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-15'
      }
    ]

    // User edits sale price from 6000 to 6500 per unit
    txs[1].price = 6500
    txs[1].totalAmount = 13000

    const stats = calculateProfitStats(txs)
    expect(stats.salesRevenue).toBe(13000)
    expect(stats.costOfGoodsSold).toBe(10000)
    expect(stats.profit).toBe(3000) // 13000 - 10000
  })

  it('handles weighted average costs across multiple purchases', () => {
    const txs: Transaction[] = [
      {
        id: 'purch_1',
        type: 'purchase',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 10,
        price: 5000,
        totalAmount: 50000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-01'
      },
      {
        id: 'purch_2',
        type: 'purchase',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 10,
        price: 7000,
        totalAmount: 70000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-10'
      },
      {
        id: 'sale_1',
        type: 'sale',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 5,
        price: 8000,
        totalAmount: 40000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-15'
      }
    ]

    // Average cost = (50000 + 70000) / (10 + 10) = 120000 / 20 = 6000
    const stats = calculateProfitStats(txs)
    expect(stats.getProductUnitCost('prod_coin')).toBe(6000)
    expect(stats.costOfGoodsSold).toBe(30000) // 5 units @ 6000
    expect(stats.profit).toBe(10000) // 40000 - 30000
  })

  it('adjusts COGS and Profit when items are returned', () => {
    const txs: Transaction[] = [
      {
        id: 'purch_1',
        type: 'purchase',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 10,
        price: 5000,
        totalAmount: 50000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-01'
      },
      {
        id: 'sale_1',
        type: 'sale',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 3,
        price: 7000,
        totalAmount: 21000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-05'
      },
      {
        id: 'return_1',
        type: 'return',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 1,
        price: 7000,
        totalAmount: 7000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-06'
      }
    ]

    const stats = calculateProfitStats(txs)
    expect(stats.salesRevenue).toBe(21000)
    expect(stats.returnsAmount).toBe(7000)
    expect(stats.netRevenue).toBe(14000)
    // 3 sold @ 5000 = 15000 cost; 1 returned @ 5000 = 5000 cost refunded; net COGS = 10000
    expect(stats.costOfGoodsSold).toBe(10000)
    expect(stats.profit).toBe(4000) // Net 2 items sold @ 7000 with 5000 cost = 4000 profit
  })

  it('handles negative profit if item is sold below purchase cost', () => {
    const txs: Transaction[] = [
      {
        id: 'purch_1',
        type: 'purchase',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 5,
        price: 6000,
        totalAmount: 30000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-01'
      },
      {
        id: 'sale_1',
        type: 'sale',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 2,
        price: 5500,
        totalAmount: 11000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-05'
      }
    ]

    const stats = calculateProfitStats(txs)
    expect(stats.salesRevenue).toBe(11000)
    expect(stats.costOfGoodsSold).toBe(12000) // 2 @ 6000
    expect(stats.profit).toBe(-1000) // Loss of 1000
  })

  it('excludes reversed purchase, sale, and return transactions', () => {
    const txs: Transaction[] = [
      {
        id: 'purch_1',
        type: 'purchase',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 10,
        price: 5000,
        totalAmount: 50000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-01'
      },
      {
        id: 'purch_old_rev',
        type: 'purchase',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 10,
        price: 9000, // Should be ignored because isReversed: true
        totalAmount: 90000,
        isReversed: true,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-01'
      },
      {
        id: 'sale_1',
        type: 'sale',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 2,
        price: 6000,
        totalAmount: 12000,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-05'
      },
      {
        id: 'sale_rev',
        type: 'sale',
        productId: 'prod_coin',
        productName: '10g Gold Coin',
        category: 'Bullions',
        quantity: 1,
        price: 6000,
        totalAmount: 6000,
        isReversed: true,
        locationId: 'loc_main',
        locationName: 'Main Store',
        date: '2026-01-05'
      }
    ]

    const stats = calculateProfitStats(txs)
    expect(stats.getProductUnitCost('prod_coin')).toBe(5000) // 9000 purchase ignored
    expect(stats.salesUnits).toBe(2) // reversed sale ignored
    expect(stats.salesRevenue).toBe(12000)
    expect(stats.costOfGoodsSold).toBe(10000)
    expect(stats.profit).toBe(2000)
  })
})
