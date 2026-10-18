import { app } from '@/lib/firebase/config';
import { auth } from '@/lib/firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  QueryConstraint
} from 'firebase/firestore/lite';
import { Location, Product, Transaction, TransactionType, ProductCategory, MetalType } from '@/lib/types';

const db = getFirestore(app);

// Helper to get authenticated bearer token
async function getAuthHeaders(): Promise<Record<string, string>> {
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

// ==========================================
// LOCATIONS
// ==========================================

export async function getLocations(): Promise<Location[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/locations', { method: 'GET', headers });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.locations)) return data.locations;
    }
  } catch {
    // Fall back to client query if offline or pre-auth
  }

  const querySnapshot = await getDocs(collection(db, 'locations'));
  const items: Location[] = [];
  querySnapshot.forEach((docSnap: { data: () => Record<string, unknown>; id: string }) => {
    items.push({ ...docSnap.data(), id: docSnap.id } as Location);
  });
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addLocation(data: { name: string; description?: string }): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/locations', {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to add location (${res.status})`);
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update location (${res.status})`);
  }
}

export async function deleteLocation(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/locations?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to delete location (${res.status})`);
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to add product (${res.status})`);
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update product (${res.status})`);
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to delete product (${res.status})`);
  }
}

// ==========================================
// TRANSACTIONS & STOCK LOGIC (SERVER-PROCESSED)
// ==========================================

export interface TransactionFilterOptions {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  type?: TransactionType | 'All';
  limitCount?: number;
  cursorDocId?: string | null;
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function getTransactionsPage(options: TransactionFilterOptions = {}): Promise<PaginatedTransactions> {
  const constraints: QueryConstraint[] = [];

  if (options.startDate && options.endDate) {
    constraints.push(where('date', '>=', options.startDate));
    constraints.push(where('date', '<=', options.endDate));
    constraints.push(orderBy('date', 'desc'));
  } else if (options.startDate) {
    constraints.push(where('date', '>=', options.startDate));
    constraints.push(orderBy('date', 'desc'));
  } else if (options.endDate) {
    constraints.push(where('date', '<=', options.endDate));
    constraints.push(orderBy('date', 'desc'));
  } else {
    constraints.push(orderBy('date', 'desc'));
  }

  if (options.cursorDocId) {
    const cursorDoc = await getDoc(doc(db, 'transactions', options.cursorDocId));
    if (cursorDoc.exists()) {
      constraints.push(startAfter(cursorDoc));
    }
  }

  const pageSize = options.limitCount || 30;
  constraints.push(limit(pageSize));

  const q = query(collection(db, 'transactions'), ...constraints);
  const querySnapshot = await getDocs(q);

  let items: Transaction[] = [];
  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    items.push({
      ...data,
      id: docSnap.id,
      category: (data.category === 'Silver Idols' ? 'Idols' : data.category) as ProductCategory,
      previousWeight: data.previousWeightMg !== undefined ? Number(data.previousWeightMg) / 1000 : (data.previousWeight !== undefined ? Number(data.previousWeight) : undefined),
      newWeight: data.newWeightMg !== undefined ? Number(data.newWeightMg) / 1000 : (data.newWeight !== undefined ? Number(data.newWeight) : undefined),
      weightChange: data.weightChangeMg !== undefined ? Number(data.weightChangeMg) / 1000 : (data.weightChange !== undefined ? Number(data.weightChange) : undefined),
      recoveredWeight: data.recoveredWeightMg !== undefined ? Number(data.recoveredWeightMg) / 1000 : (data.recoveredWeight !== undefined ? Number(data.recoveredWeight) : undefined),
      pieceWeight: data.pieceWeightMg !== undefined ? Number(data.pieceWeightMg) / 1000 : (data.pieceWeight !== undefined ? Number(data.pieceWeight) : undefined),
      pieceWeights: Array.isArray(data.pieceWeightsMg)
        ? data.pieceWeightsMg.map((mg: number) => Number(mg) / 1000)
        : Array.isArray(data.pieceWeights)
          ? data.pieceWeights.map((w: number) => Number(w))
          : undefined,
    } as Transaction);
  });

  if (options.type && options.type !== 'All') {
    items = items.filter((t) => t.type === options.type);
  }

  const nextCursor = querySnapshot.docs.length === pageSize ? querySnapshot.docs[querySnapshot.docs.length - 1].id : null;
  const hasMore = querySnapshot.docs.length === pageSize;

  return { transactions: items, nextCursor, hasMore };
}

export async function getTransactions(options?: TransactionFilterOptions): Promise<Transaction[]> {
  const res = await getTransactionsPage({ limitCount: options?.limitCount || 100, ...options });
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
 * Erases all transaction history and scrubs the audit trail (Master Zero-Balance) via server API.
 */
export async function clearTransactionHistory(): Promise<{ count: number; auditCount: number }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/transactions', {
    method: 'PUT',
    headers
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to clear transactions (${res.status})`);
  }

  const resData = await res.json();
  return {
    count: resData.count || 0,
    auditCount: resData.auditCount || 0
  };
}
