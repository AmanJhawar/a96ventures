import { Product, TransactionType } from '@/lib/types'
import { gramsToMg, mgToGrams } from '@/lib/utils/weight'

export interface NormalizedProductLedgerState {
  isIdol: boolean
  currentTotalStock: number
  stockByLocation: Record<string, number>
  piecesMg: number[]
  piecesByLocMg: Record<string, number[]>
  currentWeightMg: number
}

/**
 * Normalizes product stock and piece weights from Firestore data (supporting both grams and mg).
 */
export function normalizeProductLedgerState(productData: Partial<Product> | Record<string, unknown>): NormalizedProductLedgerState {
  const isIdol = productData.category === 'Idols'
  const currentTotalStock = Number(productData.stock || 0)
  
  const stockByLocation: Record<string, number> = {}
  if (productData.stockByLocation && typeof productData.stockByLocation === 'object') {
    Object.entries(productData.stockByLocation as Record<string, unknown>).forEach(([loc, qty]) => {
      stockByLocation[loc] = Number(qty || 0)
    })
  }

  let piecesMg: number[] = []
  if (Array.isArray(productData.pieceWeightsMg)) {
    piecesMg = [...productData.pieceWeightsMg].map(Number)
  } else if (Array.isArray(productData.pieceWeights)) {
    piecesMg = productData.pieceWeights.map((w) => gramsToMg(Number(w)))
  }

  const piecesByLocMg: Record<string, number[]> = {}
  if (productData.pieceWeightsByLocationMg && typeof productData.pieceWeightsByLocationMg === 'object') {
    Object.entries(productData.pieceWeightsByLocationMg as Record<string, unknown>).forEach(([loc, list]) => {
      if (Array.isArray(list)) piecesByLocMg[loc] = list.map(Number)
    })
  } else if (productData.pieceWeightsByLocation && typeof productData.pieceWeightsByLocation === 'object') {
    Object.entries(productData.pieceWeightsByLocation as Record<string, unknown>).forEach(([loc, list]) => {
      if (Array.isArray(list)) piecesByLocMg[loc] = list.map((w) => gramsToMg(Number(w)))
    })
  }

  const currentWeightMg = productData.weightMg !== undefined
    ? Number(productData.weightMg)
    : gramsToMg(Number(productData.weight || 0))

  return {
    isIdol,
    currentTotalStock,
    stockByLocation,
    piecesMg,
    piecesByLocMg,
    currentWeightMg
  }
}

/**
 * Builds the Firestore updates object for a product given new stock and pieces state.
 */
export function buildProductUpdates(
  ledgerState: NormalizedProductLedgerState,
  newTotalStock: number,
  newStockByLocation: Record<string, number>,
  updatedPiecesMg: number[],
  updatedPiecesByLocMg: Record<string, number[]>,
  newWeightMg?: number
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    stock: newTotalStock,
    stockByLocation: newStockByLocation
  }

  if (newWeightMg !== undefined) {
    updates.weight = mgToGrams(newWeightMg)
    updates.weightMg = newWeightMg
  } else if (ledgerState.isIdol) {
    const updatedPiecesGrams = updatedPiecesMg.map(mgToGrams)
    const updatedPiecesByLocGrams: Record<string, number[]> = {}
    Object.entries(updatedPiecesByLocMg).forEach(([lId, list]) => {
      updatedPiecesByLocGrams[lId] = list.map(mgToGrams)
    })

    updates.pieceWeights = updatedPiecesGrams
    updates.pieceWeightsMg = updatedPiecesMg
    updates.pieceWeightsByLocation = updatedPiecesByLocGrams
    updates.pieceWeightsByLocationMg = updatedPiecesByLocMg

    if (updatedPiecesMg.length > 0) {
      const avgMg = Math.round(updatedPiecesMg.reduce((a, b) => a + b, 0) / updatedPiecesMg.length)
      updates.weight = mgToGrams(avgMg)
      updates.weightMg = avgMg
    } else {
      updates.weight = 0
      updates.weightMg = 0
    }
  }

  return updates
}

export interface RecordLedgerParams {
  productData: Partial<Product> | Record<string, unknown>
  type: TransactionType
  quantity: number
  locationId: string
  locationName: string
  toLocationId?: string
  toLocationName?: string
  pieceWeight?: number
  pieceWeights?: number[]
  newWeight?: number
}

export interface RecordLedgerResult {
  newTotalStock: number
  newStockByLocation: Record<string, number>
  txPiecePayload: {
    pieceWeight?: number
    pieceWeightMg?: number
    pieceWeights?: number[]
    pieceWeightsMg?: number[]
  }
  productUpdates: Record<string, unknown>
}

/**
 * Applies ledger business rules for recording a new transaction.
 * Validates stock availability, updates location stock, and adjusts Idol piece registries.
 */
export function applyRecordTransaction(params: RecordLedgerParams): RecordLedgerResult {
  const {
    productData,
    type,
    quantity,
    locationId,
    locationName,
    toLocationId,
    pieceWeight,
    pieceWeights,
    newWeight
  } = params

  const state = normalizeProductLedgerState(productData)
  const currentLocMap = { ...state.stockByLocation }
  let newTotal = state.currentTotalStock

  // Stock quantity logic
  if (type === 'purchase') {
    currentLocMap[locationId] = (currentLocMap[locationId] || 0) + quantity
    newTotal += quantity
  } else if (type === 'sale') {
    const available = currentLocMap[locationId] || 0
    if (available < quantity) {
      throw new Error(`Insufficient stock at ${locationName}. Available: ${available}, Requested: ${quantity}`)
    }
    currentLocMap[locationId] = available - quantity
    newTotal -= quantity
  } else if (type === 'transfer') {
    if (!toLocationId) {
      throw new Error('Destination location is required for transfer')
    }
    if (locationId === toLocationId) {
      throw new Error('Source and destination locations cannot be identical')
    }
    const available = currentLocMap[locationId] || 0
    if (available < quantity) {
      throw new Error(`Insufficient stock at ${locationName}. Available: ${available}, Requested: ${quantity}`)
    }
    currentLocMap[locationId] = available - quantity
    currentLocMap[toLocationId] = (currentLocMap[toLocationId] || 0) + quantity
  } else if (type === 'return') {
    currentLocMap[locationId] = (currentLocMap[locationId] || 0) + quantity
    newTotal += quantity
  } else if (type === 'melt') {
    const available = currentLocMap[locationId] || 0
    if (available < quantity) {
      throw new Error(`Insufficient stock at ${locationName}. Available: ${available}, Requested: ${quantity}`)
    }
    currentLocMap[locationId] = available - quantity
    newTotal -= quantity
  } else if (type === 'adjustment') {
    if (quantity < 0) {
      const available = currentLocMap[locationId] || 0
      if (available < Math.abs(quantity)) {
        throw new Error(`Cannot reduce stock below zero. Current stock at ${locationName}: ${available}, Deficit adjustment: ${quantity}`)
      }
      currentLocMap[locationId] = available + quantity
      newTotal += quantity
    } else if (quantity > 0) {
      currentLocMap[locationId] = (currentLocMap[locationId] || 0) + quantity
      newTotal += quantity
    }
  } else if (type === 'repair') {
    // Repair does not change stock quantity
  }

  // Idol Piece Logic
  let updatedPiecesMg = [...state.piecesMg]
  const updatedPiecesByLocMg: Record<string, number[]> = {}
  Object.entries(state.piecesByLocMg).forEach(([loc, list]) => {
    updatedPiecesByLocMg[loc] = [...list]
  })
  const sourceLocPiecesMg = updatedPiecesByLocMg[locationId] ? [...updatedPiecesByLocMg[locationId]] : []

  const txPiecePayload: RecordLedgerResult['txPiecePayload'] = {}

  if (state.isIdol) {
    if (type === 'purchase') {
      const rawPieces: unknown[] = Array.isArray(pieceWeights) ? pieceWeights : []
      const validPiecesMg: number[] = rawPieces.map(Number).filter((w) => !isNaN(w) && w > 0).map(gramsToMg)
      if (validPiecesMg.length > 0) {
        updatedPiecesByLocMg[locationId] = [...sourceLocPiecesMg, ...validPiecesMg]
        updatedPiecesMg = [...updatedPiecesMg, ...validPiecesMg]
        txPiecePayload.pieceWeights = validPiecesMg.map(mgToGrams)
        txPiecePayload.pieceWeightsMg = validPiecesMg
      }
    } else if (type === 'sale') {
      const selW = pieceWeight !== undefined && !isNaN(Number(pieceWeight)) ? Number(pieceWeight) : undefined
      if (selW !== undefined) {
        const selWMg = gramsToMg(selW)
        txPiecePayload.pieceWeight = mgToGrams(selWMg)
        txPiecePayload.pieceWeightMg = selWMg
        const idx = sourceLocPiecesMg.indexOf(selWMg)
        if (idx !== -1) {
          sourceLocPiecesMg.splice(idx, 1)
          updatedPiecesByLocMg[locationId] = sourceLocPiecesMg
        } else {
          throw new Error(`The specific piece (${selW}g) is not available at ${locationName} to sell.`)
        }
        const allIdx = updatedPiecesMg.indexOf(selWMg)
        if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
      }
    } else if (type === 'transfer' && toLocationId) {
      const destLocPiecesMg = updatedPiecesByLocMg[toLocationId] ? [...updatedPiecesByLocMg[toLocationId]] : []
      const selW = pieceWeight !== undefined && !isNaN(Number(pieceWeight)) ? Number(pieceWeight) : undefined
      if (selW !== undefined) {
        const selWMg = gramsToMg(selW)
        txPiecePayload.pieceWeight = mgToGrams(selWMg)
        txPiecePayload.pieceWeightMg = selWMg
        const idx = sourceLocPiecesMg.indexOf(selWMg)
        if (idx !== -1) {
          sourceLocPiecesMg.splice(idx, 1)
          updatedPiecesByLocMg[locationId] = sourceLocPiecesMg
          updatedPiecesByLocMg[toLocationId] = [...destLocPiecesMg, selWMg]
        } else {
          throw new Error(`The specific piece (${selW}g) is not available at ${locationName} to transfer.`)
        }
      }
    } else if (type === 'melt') {
      const selW = pieceWeight !== undefined && !isNaN(Number(pieceWeight)) ? Number(pieceWeight) : undefined
      if (selW !== undefined) {
        const selWMg = gramsToMg(selW)
        txPiecePayload.pieceWeight = mgToGrams(selWMg)
        txPiecePayload.pieceWeightMg = selWMg
        const idx = sourceLocPiecesMg.indexOf(selWMg)
        if (idx !== -1) {
          sourceLocPiecesMg.splice(idx, 1)
          updatedPiecesByLocMg[locationId] = sourceLocPiecesMg
        } else {
          throw new Error(`The specific piece (${selW}g) is not available at ${locationName} to melt.`)
        }
        const allIdx = updatedPiecesMg.indexOf(selWMg)
        if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
      }
    } else if (type === 'return') {
      const selW = pieceWeight !== undefined && !isNaN(Number(pieceWeight)) ? Number(pieceWeight) : undefined
      if (selW !== undefined) {
        const selWMg = gramsToMg(selW)
        txPiecePayload.pieceWeight = mgToGrams(selWMg)
        txPiecePayload.pieceWeightMg = selWMg
        updatedPiecesByLocMg[locationId] = [...sourceLocPiecesMg, selWMg]
        updatedPiecesMg = [...updatedPiecesMg, selWMg]
      }
    } else if (type === 'adjustment') {
      if (quantity > 0) {
        const rawPieces: unknown[] = Array.isArray(pieceWeights)
          ? pieceWeights
          : pieceWeight !== undefined
            ? [pieceWeight]
            : []
        const validPiecesMg: number[] = rawPieces.map(Number).filter((w) => !isNaN(w) && w > 0).map(gramsToMg)
        if (validPiecesMg.length > 0) {
          updatedPiecesByLocMg[locationId] = [...sourceLocPiecesMg, ...validPiecesMg]
          updatedPiecesMg = [...updatedPiecesMg, ...validPiecesMg]
          txPiecePayload.pieceWeights = validPiecesMg.map(mgToGrams)
          txPiecePayload.pieceWeightsMg = validPiecesMg
        }
      } else if (quantity < 0) {
        const selW = pieceWeight !== undefined && !isNaN(Number(pieceWeight)) ? Number(pieceWeight) : undefined
        if (selW !== undefined) {
          const selWMg = gramsToMg(selW)
          txPiecePayload.pieceWeight = mgToGrams(selWMg)
          txPiecePayload.pieceWeightMg = selWMg
          const idx = sourceLocPiecesMg.indexOf(selWMg)
          if (idx !== -1) {
            sourceLocPiecesMg.splice(idx, 1)
            updatedPiecesByLocMg[locationId] = sourceLocPiecesMg
          } else {
            throw new Error(`The piece (${selW}g) is not available at ${locationName} to adjust.`)
          }
          const allIdx = updatedPiecesMg.indexOf(selWMg)
          if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
        }
      }
    }
  }

  const newWeightMg = type === 'repair' && newWeight !== undefined ? gramsToMg(newWeight) : undefined

  const productUpdates = buildProductUpdates(
    state,
    newTotal,
    currentLocMap,
    updatedPiecesMg,
    updatedPiecesByLocMg,
    newWeightMg
  )

  return {
    newTotalStock: newTotal,
    newStockByLocation: currentLocMap,
    txPiecePayload,
    productUpdates
  }
}

export interface ReverseLedgerParams {
  productData: Partial<Product> | Record<string, unknown>
  originalTx: Record<string, unknown>
}

export interface ReverseLedgerResult {
  newTotalStock: number
  newStockByLocation: Record<string, number>
  reversalTxData: {
    type: TransactionType
    quantity: number
    previousWeight?: number
    previousWeightMg?: number
    newWeight?: number
    newWeightMg?: number
    weightChange?: number
    weightChangeMg?: number
    notes: string
  }
  productUpdates: Record<string, unknown>
}

/**
 * Applies ledger business rules for reversing an existing transaction.
 * Reverts stock, checks non-negative balance across all locations, and reverses Idol piece registries.
 */
export function applyReverseTransaction(params: ReverseLedgerParams): ReverseLedgerResult {
  const { productData, originalTx: tx } = params
  const state = normalizeProductLedgerState(productData)
  const currentLocMap = { ...state.stockByLocation }
  let newTotal = state.currentTotalStock

  const txType = tx.type as TransactionType
  const txQty = Number(tx.quantity || 0)
  const locationId = String(tx.locationId || '')
  const locationName = String(tx.locationName || 'this location')
  const toLocationId = tx.toLocationId ? String(tx.toLocationId) : undefined
  const toLocationName = tx.toLocationName ? String(tx.toLocationName) : 'destination location'

  let reversalTxData: ReverseLedgerResult['reversalTxData']

  switch (txType) {
    case 'purchase': {
      currentLocMap[locationId] = (currentLocMap[locationId] || 0) - txQty
      newTotal -= txQty
      reversalTxData = {
        type: 'reversal',
        quantity: -txQty,
        notes: `Reversal of purchase #${tx.id || ''}${tx.notes ? `: ${tx.notes}` : ''}`
      }
      break
    }
    case 'sale': {
      currentLocMap[locationId] = (currentLocMap[locationId] || 0) + txQty
      newTotal += txQty
      reversalTxData = {
        type: 'reversal',
        quantity: txQty,
        notes: `Reversal of sale #${tx.id || ''}${tx.customerName ? ` (${tx.customerName})` : ''}`
      }
      break
    }
    case 'transfer': {
      if (!toLocationId) {
        throw new Error('Transfer transaction is missing destination location ID.')
      }
      currentLocMap[locationId] = (currentLocMap[locationId] || 0) + txQty
      currentLocMap[toLocationId] = (currentLocMap[toLocationId] || 0) - txQty
      reversalTxData = {
        type: 'reversal',
        quantity: txQty,
        notes: `Reversal of transfer #${tx.id || ''}${tx.notes ? `: ${tx.notes}` : ''}`
      }
      break
    }
    case 'return': {
      currentLocMap[locationId] = (currentLocMap[locationId] || 0) - txQty
      newTotal -= txQty
      reversalTxData = {
        type: 'reversal',
        quantity: -txQty,
        notes: `Reversal of return #${tx.id || ''}${tx.notes ? `: ${tx.notes}` : ''}`
      }
      break
    }
    case 'melt': {
      currentLocMap[locationId] = (currentLocMap[locationId] || 0) + txQty
      newTotal += txQty
      reversalTxData = {
        type: 'reversal',
        quantity: txQty,
        notes: `Reversal of melt #${tx.id || ''}${tx.notes ? `: ${tx.notes}` : ''}`
      }
      break
    }
    case 'adjustment': {
      if (txQty > 0) {
        currentLocMap[locationId] = (currentLocMap[locationId] || 0) - txQty
        newTotal -= txQty
        reversalTxData = {
          type: 'reversal',
          quantity: -txQty,
          notes: `Reversal of positive adjustment #${tx.id || ''}${tx.notes ? `: ${tx.notes}` : ''}`
        }
      } else if (txQty < 0) {
        const absQty = Math.abs(txQty)
        currentLocMap[locationId] = (currentLocMap[locationId] || 0) + absQty
        newTotal += absQty
        reversalTxData = {
          type: 'reversal',
          quantity: absQty,
          notes: `Reversal of negative adjustment #${tx.id || ''}${tx.notes ? `: ${tx.notes}` : ''}`
        }
      } else {
        reversalTxData = {
          type: 'reversal',
          quantity: 0,
          notes: `Reversal of zero adjustment #${tx.id || ''}`
        }
      }
      break
    }
    case 'repair': {
      const prevWeightMg = tx.previousWeightMg !== undefined
        ? Number(tx.previousWeightMg)
        : tx.previousWeight !== undefined
          ? gramsToMg(Number(tx.previousWeight))
          : undefined
      const newWeightMg = tx.newWeightMg !== undefined
        ? Number(tx.newWeightMg)
        : tx.newWeight !== undefined
          ? gramsToMg(Number(tx.newWeight))
          : undefined
      const weightDeltaMg = prevWeightMg !== undefined && newWeightMg !== undefined
        ? newWeightMg - prevWeightMg
        : 0

      reversalTxData = {
        type: 'repair',
        quantity: 0,
        previousWeight: newWeightMg !== undefined ? mgToGrams(newWeightMg) : undefined,
        previousWeightMg: newWeightMg,
        newWeight: prevWeightMg !== undefined ? mgToGrams(prevWeightMg) : undefined,
        newWeightMg: prevWeightMg,
        weightChange: mgToGrams(-weightDeltaMg),
        weightChangeMg: -weightDeltaMg,
        notes: `Reversal of repair #${tx.id || ''}${tx.notes ? `: ${tx.notes}` : ''}`
      }
      break
    }
    default:
      throw new Error(`Unsupported transaction type: ${txType}`)
  }

  // Strict safety check: No location can fall below zero!
  for (const [locId, stock] of Object.entries(currentLocMap)) {
    if (stock < 0) {
      const locName = (locId === locationId ? locationName : locId === toLocationId ? toLocationName : undefined) || 'this location'
      throw new Error(`Cannot reverse this transaction: stock at ${locName} would fall below zero (${stock}). Please reverse the later sale or transfer first.`)
    }
  }
  if (newTotal < 0) {
    throw new Error(`Cannot reverse this transaction: total product stock would fall below zero (${newTotal}). Please reverse the later sale or transfer first.`)
  }

  // Idol piece reversal logic
  let updatedPiecesMg = [...state.piecesMg]
  const updatedPiecesByLocMg: Record<string, number[]> = {}
  Object.entries(state.piecesByLocMg).forEach(([loc, list]) => {
    updatedPiecesByLocMg[loc] = [...list]
  })
  const txLocPiecesMg = updatedPiecesByLocMg[locationId] ? [...updatedPiecesByLocMg[locationId]] : []

  if (state.isIdol) {
    if (tx.pieceWeightMg !== undefined || tx.pieceWeight !== undefined) {
      const pWMg = tx.pieceWeightMg !== undefined ? Number(tx.pieceWeightMg) : gramsToMg(Number(tx.pieceWeight))
      if (txType === 'sale' || txType === 'melt' || (txType === 'adjustment' && txQty < 0)) {
        // Reversing sale, melt, or negative adjustment restores piece weight back to source location
        updatedPiecesByLocMg[locationId] = [...txLocPiecesMg, pWMg]
        updatedPiecesMg = [...updatedPiecesMg, pWMg]
      } else if (txType === 'transfer' && toLocationId) {
        // Reversing transfer moves piece weight from destination back to source
        const destPiecesMg = updatedPiecesByLocMg[toLocationId] || []
        const idx = destPiecesMg.indexOf(pWMg)
        if (idx === -1) {
          throw new Error(`Cannot reverse this transfer: the specific piece (${pWMg / 1000}g) is no longer at ${toLocationName}. Please reverse the later sale or transfer first.`)
        }
        destPiecesMg.splice(idx, 1)
        updatedPiecesByLocMg[toLocationId] = destPiecesMg
        updatedPiecesByLocMg[locationId] = [...txLocPiecesMg, pWMg]
      } else if (txType === 'return' || (txType === 'adjustment' && txQty > 0)) {
        // Reversing return or positive adjustment removes piece weight back from location and product
        const idx = txLocPiecesMg.indexOf(pWMg)
        if (idx === -1) {
          throw new Error(`Cannot reverse this ${txType}: the specific piece (${pWMg / 1000}g) is no longer at ${locationName}. Please reverse the later sale or transfer first.`)
        }
        txLocPiecesMg.splice(idx, 1)
        updatedPiecesByLocMg[locationId] = txLocPiecesMg
        const allIdx = updatedPiecesMg.indexOf(pWMg)
        if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
      }
    } else if ((tx.pieceWeightsMg && Array.isArray(tx.pieceWeightsMg)) || (tx.pieceWeights && Array.isArray(tx.pieceWeights))) {
      const piecesToReverseMg = Array.isArray(tx.pieceWeightsMg)
        ? tx.pieceWeightsMg.map(Number)
        : (tx.pieceWeights as (number | string)[]).map((w) => gramsToMg(Number(w)))
      if (txType === 'purchase' || (txType === 'adjustment' && txQty > 0)) {
        // Reversing purchase or positive batch adjustment removes those piece weights
        for (const numWMg of piecesToReverseMg) {
          const idx = txLocPiecesMg.indexOf(numWMg)
          if (idx === -1) {
            throw new Error(`Cannot reverse this ${txType}: the specific piece (${numWMg / 1000}g) is no longer at ${locationName}. Please reverse the later sale or transfer first.`)
          }
          txLocPiecesMg.splice(idx, 1)
          const allIdx = updatedPiecesMg.indexOf(numWMg)
          if (allIdx !== -1) updatedPiecesMg.splice(allIdx, 1)
        }
        updatedPiecesByLocMg[locationId] = txLocPiecesMg
      }
    }
  }

  const revertedWeightMg = txType === 'repair' && tx.previousWeightMg !== undefined
    ? Number(tx.previousWeightMg)
    : txType === 'repair' && tx.previousWeight !== undefined
      ? gramsToMg(Number(tx.previousWeight))
      : undefined

  const productUpdates = buildProductUpdates(
    state,
    newTotal,
    currentLocMap,
    updatedPiecesMg,
    updatedPiecesByLocMg,
    revertedWeightMg
  )

  return {
    newTotalStock: newTotal,
    newStockByLocation: currentLocMap,
    reversalTxData,
    productUpdates
  }
}
