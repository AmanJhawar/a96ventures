import { app } from '@/lib/firebase/config';
import { auth } from '@/lib/firebase/auth';
import {
  getFirestore,
  collection,
  getDocs
} from 'firebase/firestore/lite';
import { Location, Product, Transaction, TransactionType, ProductCategory, MetalType, TransactionStats } from '@/lib/types';

const db = getFirestore(app);

// Helper to get authenticated bearer token
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Authentication required');
  }
  const token = await currentUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

// Helper to parse detailed error from API responses
async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
      if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim();
    } catch {
      if (text && text.length < 200 && !text.includes('<!DOCTYPE')) {
        return text.trim();
      }
    }
  } catch {
    // ignore
  }
  return `${fallback} (${res.status})`;
}

// ==========================================
// LOCATIONS
// ==========================================

export async function getLocations(): Promise<Location[]> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/locations', { method: 'GET', headers });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to fetch locations'));
  }
  const data = await res.json();
  if (Array.isArray(data.locations)) return data.locations;
  return [];
}

export async function addLocation(data: { name: string; description?: string }): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/locations', {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to add location'));
  }

  const resData = await res.json();
  return resData.id;
}

export async function updateLocation(id: string, data: { name: string; description?: string }): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/locations', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ id, ...data })
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to update location'));
  }
}

export async function deleteLocation(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/locations?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to delete location'));
  }
}

// ==========================================
// PRODUCTS
// ==========================================

function getTimestampMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'object' && ts !== null) {
    if ('toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
      return (ts as { toMillis: () => number }).toMillis();
    }
    if ('seconds' in ts && typeof (ts as { seconds: number }).seconds === 'number') {
      return (ts as { seconds: number }).seconds * 1000;
    }
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts).getTime();
    return isNaN(d) ? 0 : d;
  }
  return 0;
}

export async function getProducts(): Promise<Product[]> {
  const prodsSnap = await getDocs(collection(db, 'products'));

  const items: Product[] = [];
  prodsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    let normalizedCategory: ProductCategory = 'Bullions';
    let brand = data.brand ? String(data.brand).trim() : '';

    if (data.category === 'MMTC PAMP') {
      normalizedCategory = 'Bullions';
      if (!brand) brand = 'MMTC PAMP';
    } else if (data.category === 'Silver Idols' || data.category === 'Idols') {
      normalizedCategory = 'Idols';
      if (!brand) brand = 'Local';
    } else if (data.category === 'Bullions') {
      normalizedCategory = 'Bullions';
      if (!brand) brand = 'Local';
    }

    const finalStock = Number(data.stock || 0);
    const finalStockByLoc = (data.stockByLocation || {}) as Record<string, number>;

      const wMg = data.weightMg !== undefined ? Number(data.weightMg) : Math.round(Number(data.weight || 0) * 1000);
      const pieceWs = Array.isArray(data.pieceWeightsMg)
        ? data.pieceWeightsMg.map((mg: number) => mg / 1000)
        : Array.isArray(data.pieceWeights)
          ? data.pieceWeights.map((w: number) => Math.round(Number(w) * 1000) / 1000)
          : undefined;
      const pieceWsMg = Array.isArray(data.pieceWeightsMg)
        ? data.pieceWeightsMg
        : Array.isArray(data.pieceWeights)
          ? data.pieceWeights.map((w: number) => Math.round(Number(w) * 1000))
          : undefined;

      items.push({
        id: docSnap.id,
        name: data.name || '',
        category: normalizedCategory,
        brand,
        metal: (data.metal || (normalizedCategory === 'Idols' ? 'Silver' : 'Gold')) as MetalType,
        sku: data.sku || '',
        stock: finalStock,
        stockByLocation: finalStockByLoc,
        weight: wMg / 1000,
        weightMg: wMg,
        pieceWeights: pieceWs,
        pieceWeightsMg: pieceWsMg,
        pieceWeightsByLocation: data.pieceWeightsByLocation || undefined,
        pieceWeightsByLocationMg: data.pieceWeightsByLocationMg || undefined,
        purity: data.purity || '',
        isArchived: Boolean(data.isArchived),
        archivedAt: data.archivedAt,
        archivedBy: data.archivedBy,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
  });
  // Default sort: last added / modified first
  return items.sort((a, b) => {
    const timeA = getTimestampMs(a.updatedAt || a.createdAt);
    const timeB = getTimestampMs(b.updatedAt || b.createdAt);
    if (timeB !== timeA) return timeB - timeA;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Add a new product via server API (enforces permissions and prevents direct stock spoofing).
 */
export async function addProduct(data: {
  name: string;
  category: ProductCategory;
  brand?: string;
  metal: MetalType;
  sku: string;
  weight: number;
  purity: string;
  initialStock?: number;
  initialLocationId?: string;
  initialLocationName?: string;
  pieceWeights?: number[];
}): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/products', {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to add product'));
  }

  const resData = await res.json();
  return resData.id;
}

/**
 * Update an existing product via server API.
 */
export async function updateProduct(id: string, data: {
  name: string;
  category: ProductCategory;
  brand?: string;
  metal: MetalType;
  sku: string;
  weight: number;
  purity: string;
  pieceWeights?: number[];
}): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/products', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ id, ...data })
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to update product'));
  }
}

/**
 * Delete a product via server API.
 */
export async function deleteProduct(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers
  });

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to delete product'));
  }
}

// ==========================================
// TRANSACTIONS & STOCK LOGIC (SERVER-PROCESSED)
// ==========================================

export interface TransactionFilterOptions {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  type?: TransactionType | 'All';
  productId?: string;
  limitCount?: number;
  cursorDocId?: string | null;
  cursor?: string | null;
  excludeReversed?: boolean;
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function getTransactionStats(options?: {
  startDate?: string;
  endDate?: string;
  locationId?: string;
}): Promise<TransactionStats> {
  const params = new URLSearchParams();
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  if (options?.locationId) params.set('locationId', options.locationId);

  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/transactions/stats?${params.toString()}`, {
    method: 'GET',
    headers
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch transaction stats (${res.status})`);
  }

  const resData = await res.json();
  return resData.stats as TransactionStats;
}

export async function getTransactionsPage(options: TransactionFilterOptions = {}): Promise<PaginatedTransactions> {
  const effectiveCursor = options.cursorDocId || options.cursor;
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (options.startDate) params.set('startDate', options.startDate);
  if (options.endDate) params.set('endDate', options.endDate);
  if (options.type && options.type !== 'All') params.set('type', options.type);
  if (options.productId) params.set('productId', options.productId);
  if (options.limitCount) params.set('limit', String(options.limitCount));
  if (effectiveCursor) params.set('cursor', effectiveCursor);
  if (options.excludeReversed) params.set('excludeReversed', 'true');

  const res = await fetch(`/api/admin/transactions?${params.toString()}`, {
    method: 'GET',
    headers
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch transactions (${res.status})`);
  }

  const data = await res.json();
  if (!Array.isArray(data.transactions)) {
    throw new Error('Invalid transactions response format');
  }

  return {
    transactions: data.transactions as Transaction[],
    nextCursor: data.nextCursor || null,
    hasMore: Boolean(data.hasMore)
  };
}

export async function getTransactions(options?: TransactionFilterOptions): Promise<Transaction[]> {
  const res = await getTransactionsPage({ limitCount: options?.limitCount || 50, ...options });
  return res.transactions;
}

export interface RecordTransactionParams {
  type: TransactionType;
  productId: string;
  productName: string;
  category: ProductCategory;
  brand?: string;
  metal?: MetalType;
  quantity?: number;
  price?: number;
  locationId: string;
  locationName: string;
  toLocationId?: string;
  toLocationName?: string;
  customerName?: string;
  notes?: string;
  previousWeight?: number;
  newWeight?: number;
  recoveredWeight?: number;
  pieceWeights?: number[];
  pieceWeight?: number;
  date: string; // YYYY-MM-DD
}

/**
 * Record a transaction (purchase, sale, return, transfer, adjustment, repair, melt)
 * via server API with ACID atomic stock validation and verification.
 */
export async function recordTransaction(params: RecordTransactionParams): Promise<{ id: string; transaction: Transaction }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/transactions', {
    method: 'POST',
    headers,
    body: JSON.stringify(params)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to record transaction (${res.status})`);
  }

  const resData = await res.json();
  const createdTx: Transaction = resData.transaction || {
    id: resData.id,
    type: params.type,
    productId: params.productId,
    productName: params.productName,
    category: params.category,
    brand: params.brand,
    metal: params.metal,
    quantity: params.quantity,
    price: params.price,
    locationId: params.locationId,
    locationName: params.locationName,
    toLocationId: params.toLocationId,
    toLocationName: params.toLocationName,
    customerName: params.customerName,
    notes: params.notes,
    previousWeight: params.previousWeight,
    newWeight: params.newWeight,
    recoveredWeight: params.recoveredWeight,
    pieceWeights: params.pieceWeights,
    pieceWeight: params.pieceWeight,
    date: params.date,
    createdAt: new Date().toISOString()
  };
  return { id: resData.id, transaction: createdTx };
}

/**
 * Reverse a transaction via server API by posting a linked reversing entry (never deletes).
 */
export async function reverseTransaction(tx: Transaction): Promise<{ reversingTransactionId: string; reversingEntry?: Transaction }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/transactions?id=${encodeURIComponent(tx.id)}`, {
    method: 'DELETE',
    headers
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to reverse transaction (${res.status})`);
  }

  const resData = await res.json();
  return {
    reversingTransactionId: resData.reversingTransactionId,
    reversingEntry: resData.reversingEntry
  };
}

export const deleteTransaction = reverseTransaction;

/**
 * Builds the complete master archive on the server from every record up to cutoffDate.
 */
export async function fetchMasterArchive(options?: { cutoffDate?: string }): Promise<{
  archive: Record<string, unknown>;
  count: number;
  auditCount: number;
  cutoffDate?: string;
  openingDate?: string;
  lastClosedCutoff?: string | null;
}> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (options?.cutoffDate) params.set('cutoffDate', options.cutoffDate);

  const res = await fetch(`/api/admin/transactions/archive?${params.toString()}`, {
    method: 'GET',
    headers
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to generate master archive (${res.status})`);
  }

  const resData = await res.json();
  return {
    archive: resData.archive,
    count: Number(resData.count || 0),
    auditCount: Number(resData.auditCount || 0),
    cutoffDate: resData.cutoffDate,
    openingDate: resData.openingDate,
    lastClosedCutoff: resData.lastClosedCutoff ?? null
  };
}

/**
 * Erases historical transaction records up to cutoffDate and scrubs the audit trail (Master Zero-Balance).
 * Verifies that the expected transaction and audit counts match the database before deleting.
 */
export async function clearTransactionHistory(params?: {
  expectedTransactionCount?: number;
  expectedAuditCount?: number;
  cutoffDate?: string;
  confirmationPhrase?: string;
}): Promise<{
  count: number;
  auditCount: number;
  cutoffDate?: string;
  openingDate?: string;
  archiveId?: string;
  checksum?: string;
  archive?: unknown;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/transactions', {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...params,
      confirmationPhrase: params?.confirmationPhrase || 'CONFIRM ZERO BALANCE'
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to clear transactions (${res.status})`);
  }

  const resData = await res.json();
  return {
    count: resData.count || 0,
    auditCount: resData.auditCount || 0,
    cutoffDate: resData.cutoffDate,
    openingDate: resData.openingDate,
    archiveId: resData.archiveId,
    checksum: resData.checksum,
    archive: resData.archive
  };
}

/**
 * Downloads a saved master archive by archiveId from the server.
 */
export async function downloadArchiveById(archiveId: string, filename?: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/transactions/archive?archiveId=${encodeURIComponent(archiveId)}&download=true`, {
    method: 'GET',
    headers
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to download archive (${res.status})`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${archiveId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
