import { apiClient, getAuthHeaders, ApiError } from '@/lib/api-client'
import { db } from '@/lib/firebase/config'
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore/lite'
import {
  Location,
  Product,
  Transaction,
  TransactionType,
  ProductCategory,
  MetalType,
  TransactionStats
} from '@/lib/types'

export { getAuthHeaders }

function shouldFallback(err: unknown): boolean {
  if (err instanceof Error && err.message === 'Authentication required') {
    return false
  }
  if (err instanceof ApiError) {
    return err.status >= 500 || err.status === 0
  }
  return true
}

// ==========================================
// LOCATIONS
// ==========================================

export async function getLocations(): Promise<Location[]> {
  try {
    const data = await apiClient.get<{ success: boolean; locations: Location[] }>('/api/admin/locations', undefined, {
      actionName: 'fetch locations'
    })
    if (data && Array.isArray(data.locations)) return data.locations
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Locations API failed, falling back to direct Firestore:', err)
  }

  // Client Firestore fallback
  const snap = await getDocs(collection(db, 'locations'))
  const items: Location[] = []
  snap.forEach((d) => {
    const data = d.data()
    items.push({
      id: d.id,
      name: data.name || '',
      description: data.description || '',
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    } as Location)
  })
  return items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
}

export async function addLocation(data: { name: string; description?: string }): Promise<string> {
  try {
    const resData = await apiClient.post<{ success: boolean; id: string }>('/api/admin/locations', data, {
      actionName: 'add location'
    })
    return resData.id
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Add location API failed, falling back to direct Firestore:', err)
  }

  const now = new Date().toISOString()
  const docRef = await addDoc(collection(db, 'locations'), {
    name: data.name.trim(),
    description: data.description?.trim() || '',
    createdAt: now,
    updatedAt: now
  })
  return docRef.id
}

export async function updateLocation(id: string, data: { name: string; description?: string }): Promise<void> {
  try {
    await apiClient.put('/api/admin/locations', { id, ...data }, { actionName: 'update location' })
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Update location API failed, falling back to direct Firestore:', err)
    await updateDoc(doc(db, 'locations', id), {
      name: data.name.trim(),
      description: data.description?.trim() || '',
      updatedAt: new Date().toISOString()
    })
  }
}

export async function deleteLocation(id: string): Promise<void> {
  try {
    await apiClient.delete('/api/admin/locations', { id }, { actionName: 'delete location' })
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Delete location API failed, falling back to direct Firestore:', err)
    await deleteDoc(doc(db, 'locations', id))
  }
}

// ==========================================
// PRODUCTS
// ==========================================

export async function getProducts(): Promise<Product[]> {
  try {
    const data = await apiClient.get<{ success: boolean; products: Product[] }>('/api/admin/products', undefined, {
      actionName: 'fetch products'
    })
    if (data && Array.isArray(data.products)) return data.products
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Products API failed, falling back to direct Firestore:', err)
  }

  // Client Firestore fallback
  const prodsSnap = await getDocs(collection(db, 'products'))
  const items: Product[] = []
  prodsSnap.forEach((docSnap) => {
    const data = docSnap.data()
    let normalizedCategory: ProductCategory = 'Bullions'
    let brand = data.brand ? String(data.brand).trim() : ''

    if (data.category === 'MMTC PAMP') {
      normalizedCategory = 'Bullions'
      if (!brand) brand = 'MMTC PAMP'
    } else if (data.category === 'Silver Idols' || data.category === 'Idols') {
      normalizedCategory = 'Idols'
      if (!brand) brand = 'Local'
    } else if (data.category === 'Bullions') {
      normalizedCategory = 'Bullions'
      if (!brand) brand = 'Local'
    }

    const wMg = data.weightMg !== undefined ? Number(data.weightMg) : Math.round(Number(data.weight || 0) * 1000)
    const pieceWs = Array.isArray(data.pieceWeightsMg)
      ? data.pieceWeightsMg.map((mg: number) => mg / 1000)
      : Array.isArray(data.pieceWeights)
        ? data.pieceWeights.map((w: number) => Math.round(Number(w) * 1000) / 1000)
        : undefined

    items.push({
      id: docSnap.id,
      name: data.name || '',
      category: normalizedCategory,
      brand,
      metal: (data.metal || (normalizedCategory === 'Idols' ? 'Silver' : 'Gold')) as MetalType,
      sku: data.sku || '',
      weight: wMg / 1000,
      weightMg: wMg,
      purity: data.purity || '999',
      stock: Number(data.stock || 0),
      stockByLocation: (data.stockByLocation || {}) as Record<string, number>,
      pieceWeights: pieceWs,
      pieceWeightsMg: Array.isArray(data.pieceWeightsMg) ? data.pieceWeightsMg : undefined,
      isArchived: Boolean(data.isArchived),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    } as Product)
  })

  return items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
}

export async function addProduct(data: {
  name: string
  category: ProductCategory
  brand?: string
  metal: MetalType
  sku: string
  weight: number
  purity: string
  initialStock?: number
  initialLocationId?: string
  initialLocationName?: string
  pieceWeights?: number[]
}): Promise<string> {
  try {
    const resData = await apiClient.post<{ success: boolean; id: string }>('/api/admin/products', data, {
      actionName: 'add product'
    })
    return resData.id
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Add product API failed, falling back to direct Firestore:', err)
  }

  const stockByLoc: Record<string, number> = {}
  const initQty = Number(data.initialStock || 0)
  if (data.initialLocationId && initQty > 0) {
    stockByLoc[data.initialLocationId] = initQty
  }

  const weightMg = Math.round(Number(data.weight || 0) * 1000)
  const pieceWeightsMg = Array.isArray(data.pieceWeights)
    ? data.pieceWeights.map((w) => Math.round(Number(w) * 1000))
    : undefined

  const now = new Date().toISOString()
  const docRef = await addDoc(collection(db, 'products'), {
    name: data.name.trim(),
    category: data.category,
    brand: data.brand?.trim() || '',
    metal: data.metal,
    sku: data.sku.trim(),
    weight: data.weight,
    weightMg,
    purity: data.purity,
    stock: initQty,
    stockByLocation: stockByLoc,
    pieceWeights: data.pieceWeights,
    pieceWeightsMg,
    isArchived: false,
    createdAt: now,
    updatedAt: now
  })
  return docRef.id
}

export async function updateProduct(
  id: string,
  data: {
    name?: string
    category?: ProductCategory
    brand?: string
    metal?: MetalType
    sku?: string
    weight?: number
    purity?: string
    stockByLocation?: Record<string, number>
    pieceWeights?: number[]
    isArchived?: boolean
  }
): Promise<void> {
  try {
    await apiClient.put('/api/admin/products', { id, ...data }, { actionName: 'update product' })
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Update product API failed, falling back to direct Firestore:', err)
    const updates: Record<string, unknown> = {
      ...data,
      updatedAt: new Date().toISOString()
    }
    if (data.weight !== undefined) {
      updates.weightMg = Math.round(Number(data.weight) * 1000)
    }
    if (Array.isArray(data.pieceWeights)) {
      updates.pieceWeightsMg = data.pieceWeights.map((w) => Math.round(Number(w) * 1000))
    }
    await updateDoc(doc(db, 'products', id), updates)
  }
}

export async function deleteProduct(id: string): Promise<void> {
  try {
    await apiClient.delete('/api/admin/products', { id }, { actionName: 'delete product' })
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Delete product API failed, falling back to direct Firestore:', err)
    await deleteDoc(doc(db, 'products', id))
  }
}

// ==========================================
// TRANSACTIONS
// ==========================================

export interface TransactionFilterOptions {
  startDate?: string
  endDate?: string
  type?: TransactionType | 'all'
  productId?: string
  locationId?: string
  limitCount?: number
  cursorDocId?: string | null
  cursor?: string | null
  excludeReversed?: boolean
}

export interface PaginatedTransactions {
  transactions: Transaction[]
  nextCursor: string | null
  hasMore: boolean
}

export async function getTransactionStats(options?: {
  startDate?: string
  endDate?: string
  locationId?: string
}): Promise<TransactionStats> {
  try {
    const resData = await apiClient.get<{ success: boolean; stats: TransactionStats }>(
      '/api/admin/transactions/stats',
      options,
      { actionName: 'fetch transaction stats' }
    )
    if (resData?.stats) return resData.stats
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Transaction stats API failed, computing directly from Firestore:', err)
  }

  // Client Firestore fallback: compute stats directly from transactions collection
  const snap = await getDocs(collection(db, 'transactions'))
  const stats: TransactionStats = {
    salesCount: 0,
    salesUnits: 0,
    salesRevenue: 0,
    returnsCount: 0,
    returnsUnits: 0,
    returnsAmount: 0,
    netRevenue: 0,
    profit: 0
  }

  snap.forEach((d) => {
    const tx = d.data()
    if (tx.isReversed || tx.reversed || tx.isReversal || tx.reversalOf) return
    if (options?.locationId && tx.locationId !== options.locationId && tx.toLocationId !== options.locationId) return
    if (options?.startDate && tx.date < options.startDate) return
    if (options?.endDate && tx.date > options.endDate) return

    const qty = Number(tx.quantity || 0)
    const price = Number(tx.price || 0)
    const total = Number(tx.totalAmount ?? price * (qty > 0 ? qty : 1))

    if (tx.type === 'sale') {
      stats.salesCount += 1
      stats.salesUnits += qty
      stats.salesRevenue += total
    } else if (tx.type === 'return') {
      stats.returnsCount += 1
      stats.returnsUnits += qty
      stats.returnsAmount += total
    }
  })

  stats.netRevenue = stats.salesRevenue - stats.returnsAmount
  return stats
}

export async function getTransactionsPage(options: TransactionFilterOptions = {}): Promise<PaginatedTransactions> {
  const params: Record<string, string | number | boolean | undefined> = {
    startDate: options.startDate || undefined,
    endDate: options.endDate || undefined,
    type: options.type && options.type !== 'all' ? options.type : undefined,
    productId: options.productId || undefined,
    locationId: options.locationId || undefined,
    limit: options.limitCount ? Number(options.limitCount) : 50,
    cursor: options.cursorDocId || options.cursor || undefined,
    excludeReversed: options.excludeReversed ? true : undefined
  }

  try {
    const res = await apiClient.get<PaginatedTransactions>('/api/admin/transactions', params, {
      actionName: 'fetch transactions page'
    })
    if (res && Array.isArray(res.transactions)) return res
  } catch (err) {
    if (!shouldFallback(err)) throw err
    console.warn('Transactions API failed, falling back to direct Firestore:', err)
  }

  // Client Firestore fallback
  const snap = await getDocs(collection(db, 'transactions'))
  const allTx: Transaction[] = []
  snap.forEach((d) => {
    const data = d.data()
    if (options.excludeReversed && (data.isReversed || data.reversed)) return
    if (options.type && options.type !== 'all' && data.type !== options.type) return
    if (options.productId && data.productId !== options.productId) return
    if (options.locationId && data.locationId !== options.locationId && data.toLocationId !== options.locationId) return
    if (options.startDate && data.date < options.startDate) return
    if (options.endDate && data.date > options.endDate) return

    allTx.push({
      id: d.id,
      ...data
    } as Transaction)
  })

  allTx.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  const limit = options.limitCount ? Number(options.limitCount) : 50
  const pageItems = allTx.slice(0, limit)
  return {
    transactions: pageItems,
    nextCursor: allTx.length > limit ? pageItems[pageItems.length - 1].id : null,
    hasMore: allTx.length > limit
  }
}

export async function getTransactions(options?: TransactionFilterOptions): Promise<Transaction[]> {
  const res = await getTransactionsPage({ limitCount: options?.limitCount || 50, ...options })
  return res.transactions
}

export interface RecordTransactionParams {
  type: TransactionType
  productId: string
  productName: string
  category: ProductCategory
  brand?: string
  metal?: MetalType
  quantity?: number
  price?: number
  locationId: string
  locationName: string
  toLocationId?: string
  toLocationName?: string
  customerName?: string
  notes?: string
  previousWeight?: number
  newWeight?: number
  recoveredWeight?: number
  pieceWeights?: number[]
  pieceWeight?: number
  date: string // YYYY-MM-DD
}

export async function recordTransaction(
  params: RecordTransactionParams
): Promise<{ id: string; transaction: Transaction }> {
  return apiClient.post<{ id: string; transaction: Transaction }>('/api/admin/transactions', params, {
    actionName: 'record transaction'
  })
}

export async function reverseTransaction(
  tx: Transaction
): Promise<{ reversingTransactionId: string; reversingEntry?: Transaction }> {
  return apiClient.delete<{ reversingTransactionId: string; reversingEntry?: Transaction }>(
    '/api/admin/transactions',
    { id: tx.id },
    { actionName: 'reverse transaction' }
  )
}

export const deleteTransaction = reverseTransaction

export async function updateTransaction(
  id: string,
  data: {
    quantity?: number
    price?: number
    locationId?: string
    locationName?: string
    date?: string
    customerName?: string
    vendorName?: string
    notes?: string
  }
): Promise<{ success: boolean; transaction: Transaction }> {
  return apiClient.patch<{ success: boolean; transaction: Transaction }>(
    '/api/admin/transactions',
    { id, ...data },
    { actionName: 'update transaction' }
  )
}

// ==========================================
// ARCHIVE & ZERO-BALANCE
// ==========================================

export async function fetchMasterArchive(options?: { cutoffDate?: string }): Promise<{
  archive: Record<string, unknown>
  count: number
  auditCount: number
  cutoffDate?: string
  openingDate?: string
  lastClosedCutoff?: string | null
}> {
  const resData = await apiClient.get<{
    success: boolean
    archive: Record<string, unknown>
    count: number
    auditCount: number
    cutoffDate?: string
    openingDate?: string
    lastClosedCutoff?: string | null
  }>('/api/admin/transactions/archive', options, { actionName: 'generate master archive' })

  return {
    archive: resData.archive,
    count: Number(resData.count || 0),
    auditCount: Number(resData.auditCount || 0),
    cutoffDate: resData.cutoffDate,
    openingDate: resData.openingDate,
    lastClosedCutoff: resData.lastClosedCutoff ?? null
  }
}

export async function clearTransactionHistory(params?: {
  expectedTransactionCount?: number
  expectedAuditCount?: number
  cutoffDate?: string
  confirmationPhrase?: string
}): Promise<{
  count: number
  auditCount: number
  cutoffDate?: string
  openingDate?: string
  archiveId?: string
  checksum?: string
  archive?: unknown
}> {
  const payload = {
    ...params,
    confirmationPhrase: params?.confirmationPhrase || 'CONFIRM ZERO BALANCE'
  }
  const resData = await apiClient.post<{
    success: boolean
    count: number
    auditCount: number
    cutoffDate?: string
    openingDate?: string
    archiveId?: string
    checksum?: string
    archive?: unknown
  }>('/api/admin/transactions/archive/zero-balance', payload, { actionName: 'clear transactions' })

  return {
    count: resData.count || 0,
    auditCount: resData.auditCount || 0,
    cutoffDate: resData.cutoffDate,
    openingDate: resData.openingDate,
    archiveId: resData.archiveId,
    checksum: resData.checksum,
    archive: resData.archive
  }
}

export async function downloadArchiveById(archiveId: string, filename?: string): Promise<void> {
  const headers = await getAuthHeaders().catch(() => ({} as Record<string, string>))
  const res = await fetch(`/api/admin/transactions/archive?archiveId=${encodeURIComponent(archiveId)}&download=true`, {
    method: 'GET',
    headers
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to download archive (${res.status})`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `${archiveId}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function verifyArchiveWithServer(payload: {
  checksum: string
  signature?: string
  archiveId?: string
}): Promise<{ status: 'verified' | 'tampered' | 'unverified'; message?: string }> {
  return apiClient.post<{ status: 'verified' | 'tampered' | 'unverified'; message?: string }>(
    '/api/admin/transactions/archive/verify',
    payload,
    { actionName: 'verify archive' }
  )
}
