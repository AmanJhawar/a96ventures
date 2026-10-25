import { apiClient, getAuthHeaders } from '@/lib/api-client'
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

// ==========================================
// LOCATIONS
// ==========================================

export async function getLocations(): Promise<Location[]> {
  const data = await apiClient.get<{ success: boolean; locations: Location[] }>('/api/admin/locations', undefined, {
    actionName: 'fetch locations'
  })
  return data.locations || []
}

export async function addLocation(data: { name: string; description?: string }): Promise<string> {
  const resData = await apiClient.post<{ success: boolean; id: string }>('/api/admin/locations', data, {
    actionName: 'add location'
  })
  return resData.id
}

export async function updateLocation(id: string, data: { name: string; description?: string }): Promise<void> {
  await apiClient.put('/api/admin/locations', { id, ...data }, { actionName: 'update location' })
}

export async function deleteLocation(id: string): Promise<void> {
  await apiClient.delete('/api/admin/locations', { id }, { actionName: 'delete location' })
}

// ==========================================
// PRODUCTS
// ==========================================

export async function getProducts(): Promise<Product[]> {
  const data = await apiClient.get<{ success: boolean; products: Product[] }>('/api/admin/products', undefined, {
    actionName: 'fetch products'
  })
  return data.products || []
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
  const resData = await apiClient.post<{ success: boolean; id: string }>('/api/admin/products', data, {
    actionName: 'add product'
  })
  return resData.id
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
  await apiClient.put('/api/admin/products', { id, ...data }, { actionName: 'update product' })
}

export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete('/api/admin/products', { id }, { actionName: 'delete product' })
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
  const resData = await apiClient.get<{ success: boolean; stats: TransactionStats }>(
    '/api/admin/transactions/stats',
    options,
    { actionName: 'fetch transaction stats' }
  )
  return resData.stats
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

  return apiClient.get<PaginatedTransactions>('/api/admin/transactions', params, {
    actionName: 'fetch transactions page'
  })
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
