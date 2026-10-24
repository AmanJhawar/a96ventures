import { Product, TransactionType, Transaction } from '@/lib/types'
import { gramsToMg, mgToGrams } from '@/lib/utils/weight'
import { ValidationError } from '@/lib/errors'

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
      throw new ValidationError(`Insufficient stock at ${locationName}. Available: ${available}, Requested: ${quantity}`)
    }
    currentLocMap[locationId] = available - quantity
    newTotal -= quantity
  } else if (type === 'transfer') {
    if (!toLocationId) {
      throw new ValidationError('Destination location is required for transfer')
    }
    if (locationId === toLocationId) {
      throw new ValidationError('Source and destination locations cannot be identical')
    }
    const available = currentLocMap[locationId] || 0
    if (available < quantity) {
      throw new ValidationError(`Insufficient stock at ${locationName}. Available: ${available}, Requested: ${quantity}`)
    }
    currentLocMap[locationId] = available - quantity
    currentLocMap[toLocationId] = (currentLocMap[toLocationId] || 0) + quantity
  } else if (type === 'return') {
    currentLocMap[locationId] = (currentLocMap[locationId] || 0) + quantity
    newTotal += quantity
  } else if (type === 'melt') {
    const available = currentLocMap[locationId] || 0
    if (available < quantity) {
      throw new ValidationError(`Insufficient stock at ${locationName}. Available: ${available}, Requested: ${quantity}`)
    }
    currentLocMap[locationId] = available - quantity
    newTotal -= quantity
  } else if (type === 'adjustment') {
    if (quantity < 0) {
      const available = currentLocMap[locationId] || 0
      if (available < Math.abs(quantity)) {
        throw new ValidationError(`Cannot reduce stock below zero. Current stock at ${locationName}: ${available}, Deficit adjustment: ${quantity}`)
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
          throw new ValidationError(`The specific piece (${selW}g) is not available at ${locationName} to sell.`)
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
          throw new ValidationError(`The specific piece (${selW}g) is not available at ${locationName} to transfer.`)
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
          throw new ValidationError(`The specific piece (${selW}g) is not available at ${locationName} to melt.`)
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
  originalTx: Partial<Transaction> | Record<string, unknown>
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
      throw new ValidationError(`Cannot reverse this transaction: stock at ${locName} would fall below zero (${stock}). Please reverse the later sale or transfer first.`)
    }
  }
  if (newTotal < 0) {
    throw new ValidationError(`Cannot reverse this transaction: total product stock would fall below zero (${newTotal}). Please reverse the later sale or transfer first.`)
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
          throw new ValidationError(`Cannot reverse this transfer: the specific piece (${pWMg / 1000}g) is no longer at ${toLocationName}. Please reverse the later sale or transfer first.`)
        }
        destPiecesMg.splice(idx, 1)
        updatedPiecesByLocMg[toLocationId] = destPiecesMg
        updatedPiecesByLocMg[locationId] = [...txLocPiecesMg, pWMg]
      } else if (txType === 'return' || (txType === 'adjustment' && txQty > 0)) {
        // Reversing return or positive adjustment removes piece weight back from location and product
        const idx = txLocPiecesMg.indexOf(pWMg)
        if (idx === -1) {
          throw new ValidationError(`Cannot reverse this ${txType}: the specific piece (${pWMg / 1000}g) is no longer at ${locationName}. Please reverse the later sale or transfer first.`)
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

export interface TransactionEffectInput {
  productId?: string
  locationId?: string
  toLocationId?: string
  quantity?: number
  type?: string
  isReversed?: boolean
  isReversal?: boolean
  reversalOf?: string
}

/**
 * Calculates the net quantity effect of a single transaction on each location.
 * Positive value means stock increased at that location; negative means stock decreased.
 */
export function getTransactionLocationEffect(tx: TransactionEffectInput): Record<string, number> {
  // If transaction is reversed, or is a reversal entry, it does not represent an active stock mutation
  if (tx.isReversed || tx.isReversal || Boolean(tx.reversalOf) || tx.type === 'reversal') {
    return {}
  }

  const qty = Number(tx.quantity || 0)
  const locId = String(tx.locationId || '')
  const toLocId = tx.toLocationId ? String(tx.toLocationId) : undefined
  const effects: Record<string, number> = {}

  switch (tx.type) {
    case 'purchase':
    case 'return':
    case 'opening':
      if (locId) effects[locId] = (effects[locId] || 0) + qty
      break
    case 'sale':
    case 'melt':
      if (locId) effects[locId] = (effects[locId] || 0) - qty
      break
    case 'adjustment':
      // Adjustment quantity can be positive (surplus) or negative (deficit)
      if (locId) effects[locId] = (effects[locId] || 0) + qty
      break
    case 'transfer':
      if (locId) effects[locId] = (effects[locId] || 0) - qty
      if (toLocId) effects[toLocId] = (effects[toLocId] || 0) + qty
      break
    case 'repair':
      // Repair only adjusts item weight, not piece quantity
      break
    default:
      break
  }

  return effects
}

/**
 * Aggregates net effects across an array of transactions, grouped by productId and locationId.
 * returns Record<productId, Record<locationId, netQuantityDelta>>
 */
export function calculateNetTransactionsEffect(
  transactions: TransactionEffectInput[]
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {}

  for (const tx of transactions) {
    const pId = String(tx.productId || '')
    if (!pId) continue

    const locEffects = getTransactionLocationEffect(tx)
    if (Object.keys(locEffects).length === 0) continue

    if (!result[pId]) {
      result[pId] = {}
    }

    for (const [locId, delta] of Object.entries(locEffects)) {
      result[pId][locId] = (result[pId][locId] || 0) + delta
    }
  }

  return result
}

export interface OpeningBalanceResult {
  productId: string
  productName: string
  category: string
  metal: string
  locationId: string
  quantity: number
  weight?: number // total weight in grams
  weightMg?: number // total weight in milligrams
  pieceWeight?: number // per-piece weight in grams
  pieceWeightMg?: number // per-piece weight in milligrams
  pieceWeights?: number[] // For Idols: individual piece weights in grams
  pieceWeightsMg?: number[] // For Idols: individual piece weights in mg
}

/**
 * Computes opening balances per location for products following a fiscal cutoff:
 * Opening = today's stock minus the net effect of entries dated after the cutoff, per location.
 * Emits real weights for Bullions and complete individual piece weights for Idols.
 * Only positive opening balances (> 0) are emitted.
 */
export function calculateOpeningBalances(
  products: Array<{
    id: string
    name?: string
    category?: string
    metal?: string
    stock?: number
    weight?: number
    weightMg?: number
    pieceWeights?: number[]
    pieceWeightsMg?: number[]
    pieceWeightsByLocation?: Record<string, number[]>
    pieceWeightsByLocationMg?: Record<string, number[]>
    stockByLocation?: Record<string, number>
  }>,
  netEffectsByProduct: Record<string, Record<string, number>>
): OpeningBalanceResult[] {
  const results: OpeningBalanceResult[] = []

  for (const product of products) {
    const pId = product.id
    const pLocMap = product.stockByLocation || {}
    const pNetEffects = netEffectsByProduct[pId] || {}
    const isIdol = product.category === 'Idols'

    // Find all unique locations: both present in current stock and affected by post-cutoff transactions
    const allLocations = new Set<string>([
      ...Object.keys(pLocMap),
      ...Object.keys(pNetEffects)
    ])

    for (const locId of allLocations) {
      if (!locId) continue
      const todayStock = Number(pLocMap[locId] || 0)
      const netEffect = Number(pNetEffects[locId] || 0)
      const openingStock = todayStock - netEffect

      if (openingStock > 0) {
        if (isIdol) {
          // Idols: assign individual piece weights
          let locPiecesMg: number[] = []
          if (product.pieceWeightsByLocationMg && Array.isArray(product.pieceWeightsByLocationMg[locId])) {
            locPiecesMg = [...product.pieceWeightsByLocationMg[locId]]
          } else if (product.pieceWeightsByLocation && Array.isArray(product.pieceWeightsByLocation[locId])) {
            locPiecesMg = product.pieceWeightsByLocation[locId].map((w) => gramsToMg(Number(w)))
          } else if (Array.isArray(product.pieceWeightsMg) && product.pieceWeightsMg.length > 0) {
            locPiecesMg = [...product.pieceWeightsMg]
          } else if (Array.isArray(product.pieceWeights) && product.pieceWeights.length > 0) {
            locPiecesMg = product.pieceWeights.map((w) => gramsToMg(Number(w)))
          }

          let selectedPiecesMg: number[] = []
          if (locPiecesMg.length >= openingStock) {
            selectedPiecesMg = locPiecesMg.slice(0, openingStock)
          } else {
            const unitMg = product.weightMg !== undefined
              ? Number(product.weightMg)
              : gramsToMg(Number(product.weight || 0))
            const avgMg = locPiecesMg.length > 0
              ? Math.round(locPiecesMg.reduce((a, b) => a + b, 0) / locPiecesMg.length)
              : unitMg
            selectedPiecesMg = [...locPiecesMg]
            while (selectedPiecesMg.length < openingStock) {
              selectedPiecesMg.push(avgMg > 0 ? avgMg : 0)
            }
          }

          const hasWeight = product.weightMg !== undefined || product.weight !== undefined || selectedPiecesMg.length > 0
          const totalWeightMg = selectedPiecesMg.reduce((a, b) => a + b, 0)
          const selectedPiecesGrams = selectedPiecesMg.map(mgToGrams)

          results.push({
            productId: pId,
            productName: product.name || 'Unnamed Product',
            category: product.category || 'Idols',
            metal: product.metal || 'Gold',
            locationId: locId,
            quantity: openingStock,
            ...(hasWeight && totalWeightMg > 0
              ? {
                  weight: mgToGrams(totalWeightMg),
                  weightMg: totalWeightMg,
                  pieceWeight: selectedPiecesGrams.length === 1 ? selectedPiecesGrams[0] : undefined,
                  pieceWeightMg: selectedPiecesMg.length === 1 ? selectedPiecesMg[0] : undefined,
                  pieceWeights: selectedPiecesGrams,
                  pieceWeightsMg: selectedPiecesMg
                }
              : {})
          })
        } else {
          // Bullions / standard products: assign unit and total weight
          const hasWeight = product.weightMg !== undefined || product.weight !== undefined
          const unitMg = product.weightMg !== undefined
            ? Number(product.weightMg)
            : gramsToMg(Number(product.weight || 0))
          const totalWeightMg = unitMg * openingStock

          results.push({
            productId: pId,
            productName: product.name || 'Unnamed Product',
            category: product.category || 'Bullions',
            metal: product.metal || 'Gold',
            locationId: locId,
            quantity: openingStock,
            ...(hasWeight && totalWeightMg > 0
              ? {
                  weight: mgToGrams(totalWeightMg),
                  weightMg: totalWeightMg,
                  pieceWeight: mgToGrams(unitMg),
                  pieceWeightMg: unitMg
                }
              : {})
          })
        }
      }
    }
  }

  return results
}

export interface OrderLineStockInput {
  productId: string
  qty: number
  pieceWeightMg?: number
  unitPricePaise: number
}

export interface ExecuteOrderLinesStockParams {
  lines: OrderLineStockInput[]
  productsMap: Map<string, Product>
  locationId: string
  locationName: string
  type: 'sale' | 'return'
}

export interface ExecutedOrderLineStockResult {
  productId: string
  productName: string
  category: string
  metal: 'Gold' | 'Silver'
  qty: number
  pieceWeightMg?: number
  unitPricePaise: number
  lineTotalPaise: number
  weightMg: number
  txPiecePayload: RecordLedgerResult['txPiecePayload']
}

export interface ExecuteOrderLinesStockResult {
  lineResults: ExecutedOrderLineStockResult[]
  productUpdates: Map<string, Record<string, unknown>>
  totals: {
    amountPaise: number
    units: number
    weightMg: {
      Gold: number
      Silver: number
    }
  }
}

/**
 * Validates and stages inventory stock updates for an entire order of multiple lines.
 * Applies changes sequentially to a working product snapshot so repeated products in the
 * same order validate accurately against diminishing stock.
 * Throws immediately if any line fails stock or piece validation.
 */
export function executeOrderLinesStockUpdate(params: ExecuteOrderLinesStockParams): ExecuteOrderLinesStockResult {
  const { lines, productsMap, locationId, locationName, type } = params

  if (!lines || lines.length === 0) {
    throw new ValidationError('Order must contain at least one line item')
  }

  // Working copy of product states
  const workingProducts = new Map<string, Product>()
  for (const [id, prod] of productsMap.entries()) {
    workingProducts.set(id, JSON.parse(JSON.stringify(prod)) as Product)
  }

  const lineResults: ExecutedOrderLineStockResult[] = []
  const productFinalUpdates = new Map<string, Record<string, unknown>>()
  const totals = {
    amountPaise: 0,
    units: 0,
    weightMg: {
      Gold: 0,
      Silver: 0
    }
  }

  for (const line of lines) {
    const workingProd = workingProducts.get(line.productId)
    if (!workingProd) {
      throw new ValidationError(`Product not found in database: "${line.productId}"`)
    }

    if (!line.qty || line.qty <= 0 || !Number.isInteger(line.qty)) {
      throw new ValidationError(`Invalid quantity (${line.qty}) for product "${workingProd.name}". Quantity must be a positive integer.`)
    }

    if (line.unitPricePaise === undefined || line.unitPricePaise < 0 || !Number.isInteger(line.unitPricePaise)) {
      throw new ValidationError(`Invalid unit price (${line.unitPricePaise}) for product "${workingProd.name}". Price must be non-negative integer paise.`)
    }

    const lineTotalPaise = line.qty * line.unitPricePaise

    // Apply ledger transaction to the evolving working product state
    const ledgerRes = applyRecordTransaction({
      productData: workingProd,
      type,
      quantity: line.qty,
      locationId,
      locationName,
      pieceWeight: line.pieceWeightMg ? mgToGrams(line.pieceWeightMg) : undefined
    })

    // Update working product with the resulting updates
    Object.assign(workingProd, ledgerRes.productUpdates)
    productFinalUpdates.set(line.productId, ledgerRes.productUpdates)

    // Calculate line weight in milligrams
    let lineUnitWeightMg = 0
    if (line.pieceWeightMg !== undefined) {
      lineUnitWeightMg = line.pieceWeightMg
    } else if (workingProd.weightMg !== undefined) {
      lineUnitWeightMg = Number(workingProd.weightMg)
    } else if (workingProd.weight !== undefined) {
      lineUnitWeightMg = gramsToMg(Number(workingProd.weight))
    }
    const totalLineWeightMg = lineUnitWeightMg * line.qty

    const metal = (workingProd.metal === 'Silver' ? 'Silver' : 'Gold') as 'Gold' | 'Silver'

    totals.amountPaise += lineTotalPaise
    totals.units += line.qty
    totals.weightMg[metal] += totalLineWeightMg

    lineResults.push({
      productId: line.productId,
      productName: workingProd.name,
      category: workingProd.category,
      metal,
      qty: line.qty,
      pieceWeightMg: line.pieceWeightMg,
      unitPricePaise: line.unitPricePaise,
      lineTotalPaise,
      weightMg: totalLineWeightMg,
      txPiecePayload: ledgerRes.txPiecePayload
    })
  }

  return {
    lineResults,
    productUpdates: productFinalUpdates,
    totals
  }
}

