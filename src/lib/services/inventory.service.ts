import { app } from '@/lib/firebase/config';
import { auth } from '@/lib/firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc
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
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/locations', { method: 'GET', headers });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.locations)) return data.locations;
    }
  } catch (apiErr) {
    console.warn('Locations API fetch failed, falling back to direct Firestore:', apiErr);
  }

  // Client Firestore fallback
  const snap = await getDocs(collection(db, 'locations'));
  const locs: Location[] = [];
  snap.forEach((d) => {
    const data = d.data();
    locs.push({
      id: d.id,
      name: data.name || '',
      description: data.description || '',
      createdAt: toIsoString(data.createdAt) || ''
    });
  });
  return locs.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function addLocation(data: { name: string; description?: string }): Promise<string> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/locations', {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });

    if (res.ok) {
      const resData = await res.json();
      return resData.id;
    }

    if (res.status === 400) {
      throw new Error(await getErrorMessage(res, 'Failed to add location'));
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('(500)') && !apiErr.message.includes('(502)') && !apiErr.message.includes('fetch')) {
      throw apiErr;
    }
    console.warn('Add location API failed, falling back to direct Firestore:', apiErr);
  }

  // Client Firestore fallback
  const now = new Date().toISOString();
  const docRef = await addDoc(collection(db, 'locations'), {
    name: data.name.trim(),
    description: data.description?.trim() || '',
    createdAt: now,
    updatedAt: now
  });
  return docRef.id;
}

export async function updateLocation(id: string, data: { name: string; description?: string }): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/locations', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ id, ...data })
    });

    if (res.ok) return;

    if (res.status === 400) {
      throw new Error(await getErrorMessage(res, 'Failed to update location'));
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('(500)') && !apiErr.message.includes('(502)') && !apiErr.message.includes('fetch')) {
      throw apiErr;
    }
    console.warn('Update location API failed, falling back to direct Firestore:', apiErr);
  }

  // Client Firestore fallback
  await updateDoc(doc(db, 'locations', id), {
    name: data.name.trim(),
    ...(data.description !== undefined ? { description: data.description.trim() } : {}),
    updatedAt: new Date().toISOString()
  });
}

export async function deleteLocation(id: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/locations?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers
    });

    if (res.ok) return;

    if (res.status === 400) {
      throw new Error(await getErrorMessage(res, 'Failed to delete location'));
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('(500)') && !apiErr.message.includes('(502)') && !apiErr.message.includes('fetch')) {
      throw apiErr;
    }
    console.warn('Delete location API failed, falling back to direct Firestore:', apiErr);
  }

  // Client Firestore fallback
  await deleteDoc(doc(db, 'locations', id));
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

function toIsoString(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? '' : val.toISOString();
  }
  if (typeof val === 'object' && val !== null) {
    if ('toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
      try {
        const d = (val as { toDate: () => Date }).toDate();
        return isNaN(d.getTime()) ? '' : d.toISOString();
      } catch {
        // ignore
      }
    }
    if ('toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
      try {
        const d = new Date((val as { toMillis: () => number }).toMillis());
        return isNaN(d.getTime()) ? '' : d.toISOString();
      } catch {
        // ignore
      }
    }
    if ('seconds' in val && typeof (val as { seconds: number }).seconds === 'number') {
      const d = new Date((val as { seconds: number }).seconds * 1000);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }
    if ('_seconds' in val && typeof (val as { _seconds: number })._seconds === 'number') {
      const d = new Date((val as { _seconds: number })._seconds * 1000);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }
  }
  return String(val || '');
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
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

/**
 * Add a new product via server API with client Firestore fallback.
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
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });

    if (res.ok) {
      const resData = await res.json();
      return resData.id;
    }

    if (res.status === 400) {
      throw new Error(await getErrorMessage(res, 'Failed to add product'));
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('(500)') && !apiErr.message.includes('(502)') && !apiErr.message.includes('fetch')) {
      throw apiErr;
    }
    console.warn('Add product API failed, falling back to direct Firestore:', apiErr);
  }

  // Client Firestore fallback
  const now = new Date().toISOString();
  const weightMg = Math.round(Number(data.weight || 0) * 1000);
  const stock = Number(data.initialStock || 0);
  const stockByLocation: Record<string, number> = {};
  if (data.initialLocationId && stock > 0) {
    stockByLocation[data.initialLocationId] = stock;
  }
  const docRef = await addDoc(collection(db, 'products'), {
    name: data.name.trim(),
    category: data.category,
    brand: data.brand?.trim() || '',
    metal: data.metal,
    sku: data.sku.trim(),
    weight: weightMg / 1000,
    weightMg,
    purity: data.purity.trim(),
    stock,
    stockByLocation,
    createdAt: now,
    updatedAt: now
  });
  return docRef.id;
}

/**
 * Update an existing product via server API with client Firestore fallback.
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
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/products', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ id, ...data })
    });

    if (res.ok) return;

    if (res.status === 400) {
      throw new Error(await getErrorMessage(res, 'Failed to update product'));
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('(500)') && !apiErr.message.includes('(502)') && !apiErr.message.includes('fetch')) {
      throw apiErr;
    }
    console.warn('Update product API failed, falling back to direct Firestore:', apiErr);
  }

  // Client Firestore fallback
  const weightMg = Math.round(Number(data.weight || 0) * 1000);
  await updateDoc(doc(db, 'products', id), {
    name: data.name.trim(),
    category: data.category,
    brand: data.brand?.trim() || '',
    metal: data.metal,
    sku: data.sku.trim(),
    weight: weightMg / 1000,
    weightMg,
    purity: data.purity.trim(),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete a product via server API with client Firestore fallback.
 */
export async function deleteProduct(id: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers
    });

    if (res.ok) return;

    if (res.status === 400) {
      throw new Error(await getErrorMessage(res, 'Failed to delete product'));
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('(500)') && !apiErr.message.includes('(502)') && !apiErr.message.includes('fetch')) {
      throw apiErr;
    }
    console.warn('Delete product API failed, falling back to direct Firestore:', apiErr);
  }

  // Client Firestore fallback
  await deleteDoc(doc(db, 'products', id));
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
  try {
    const params = new URLSearchParams();
    if (options?.startDate) params.set('startDate', options.startDate);
    if (options?.endDate) params.set('endDate', options.endDate);
    if (options?.locationId) params.set('locationId', options.locationId);

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/transactions/stats?${params.toString()}`, {
      method: 'GET',
      headers
    });

    if (res.ok) {
      const resData = await res.json();
      return resData.stats as TransactionStats;
    }
  } catch (apiErr) {
    console.warn('Stats API failed, computing stats from Firestore directly:', apiErr);
  }

  // Client fallback: calculate stats directly from transactions collection
  const snap = await getDocs(collection(db, 'transactions'));
  const stats: TransactionStats = {
    salesCount: 0,
    salesUnits: 0,
    salesRevenue: 0,
    returnsCount: 0,
    returnsUnits: 0,
    returnsAmount: 0,
    netRevenue: 0,
    productSalesStats: {}
  };

  snap.forEach((d) => {
    const tx = d.data();
    if (tx.isReversed || tx.reversed) return;
    if (options?.startDate && tx.date < options.startDate) return;
    if (options?.endDate && tx.date > options.endDate) return;
    if (options?.locationId && tx.locationId !== options.locationId && tx.toLocationId !== options.locationId) return;

    const qty = Number(tx.quantity || 0);
    const price = Number(tx.price || 0);
    const amount = Number(tx.totalAmount ?? (price * qty));

    if (tx.type === 'sale') {
      stats.salesCount += 1;
      stats.salesUnits += qty;
      stats.salesRevenue += amount;
      if (tx.productId) {
        if (!stats.productSalesStats![tx.productId]) {
          stats.productSalesStats![tx.productId] = { unitsSold: 0, totalRevenue: 0, salesCount: 0 };
        }
        stats.productSalesStats![tx.productId].unitsSold += qty;
        stats.productSalesStats![tx.productId].totalRevenue += amount;
        stats.productSalesStats![tx.productId].salesCount += 1;
      }
    } else if (tx.type === 'return') {
      stats.returnsCount += 1;
      stats.returnsUnits += qty;
      stats.returnsAmount += amount;
    }
  });

  stats.netRevenue = stats.salesRevenue - stats.returnsAmount;
  return stats;
}

export async function getTransactionsPage(options: TransactionFilterOptions = {}): Promise<PaginatedTransactions> {
  try {
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

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.transactions)) {
        return {
          transactions: data.transactions as Transaction[],
          nextCursor: data.nextCursor || null,
          hasMore: Boolean(data.hasMore)
        };
      }
    }
  } catch (apiErr) {
    console.warn('Transactions API failed, falling back to direct Firestore:', apiErr);
  }

  // Client fallback
  const snap = await getDocs(collection(db, 'transactions'));
  const allTx: Transaction[] = [];
  snap.forEach((d) => {
    const data = d.data();
    if (options.excludeReversed && (data.isReversed || data.reversed)) return;
    if (options.type && options.type !== 'All' && data.type !== options.type) return;
    if (options.productId && data.productId !== options.productId) return;
    if (options.startDate && data.date < options.startDate) return;
    if (options.endDate && data.date > options.endDate) return;

    allTx.push({
      id: d.id,
      type: data.type,
      productId: data.productId,
      productName: data.productName || '',
      category: data.category,
      brand: data.brand,
      metal: data.metal,
      quantity: Number(data.quantity || 1),
      price: data.price,
      totalAmount: data.totalAmount,
      locationId: data.locationId,
      locationName: data.locationName,
      toLocationId: data.toLocationId,
      toLocationName: data.toLocationName,
      customerName: data.customerName,
      notes: data.notes,
      previousWeight: data.previousWeight,
      newWeight: data.newWeight,
      recoveredWeight: data.recoveredWeight,
      pieceWeights: data.pieceWeights,
      pieceWeight: data.pieceWeight,
      date: toIsoString(data.date) || String(data.date || ''),
      isReversed: Boolean(data.isReversed || data.reversed),
      reversedAt: data.reversedAt ? toIsoString(data.reversedAt) : undefined,
      createdAt: toIsoString(data.createdAt) || String(data.createdAt || '')
    });
  });

  allTx.sort((a, b) => {
    const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });

  const limitCount = options.limitCount || 50;
  const sliced = allTx.slice(0, limitCount);

  return {
    transactions: sliced,
    nextCursor: allTx.length > limitCount ? sliced[sliced.length - 1].id : null,
    hasMore: allTx.length > limitCount
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
 * via server API with client Firestore fallback.
 */
export async function recordTransaction(params: RecordTransactionParams): Promise<{ id: string; transaction: Transaction }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/transactions', {
      method: 'POST',
      headers,
      body: JSON.stringify(params)
    });

    if (res.ok) {
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

    if (res.status === 400) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to record transaction (${res.status})`);
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('(500)') && !apiErr.message.includes('(502)') && !apiErr.message.includes('fetch')) {
      throw apiErr;
    }
    console.warn('Record transaction API failed, falling back to direct Firestore:', apiErr);
  }

  // Client Firestore fallback:
  const now = new Date().toISOString();
  const txData = {
    ...params,
    createdAt: now,
    updatedAt: now
  };
  const docRef = await addDoc(collection(db, 'transactions'), txData);

  // Update stock on client if product exists
  if (params.productId) {
    try {
      const prodRef = doc(db, 'products', params.productId);
      const prodSnap = await getDoc(prodRef);
      if (prodSnap.exists()) {
        const pData = prodSnap.data();
        let currentStock = Number(pData.stock || 0);
        const stockByLoc = { ...((pData.stockByLocation as Record<string, number>) || {}) };
        const qty = Number(params.quantity || 1);

        if (params.type === 'sale') {
          currentStock = Math.max(0, currentStock - qty);
          if (params.locationId) {
            stockByLoc[params.locationId] = Math.max(0, Number(stockByLoc[params.locationId] || 0) - qty);
          }
        } else if (params.type === 'purchase') {
          currentStock = currentStock + qty;
          if (params.locationId) {
            stockByLoc[params.locationId] = Number(stockByLoc[params.locationId] || 0) + qty;
          }
        } else if (params.type === 'transfer' && params.toLocationId) {
          if (params.locationId) {
            stockByLoc[params.locationId] = Math.max(0, Number(stockByLoc[params.locationId] || 0) - qty);
          }
          stockByLoc[params.toLocationId] = Number(stockByLoc[params.toLocationId] || 0) + qty;
        }

        await updateDoc(prodRef, {
          stock: currentStock,
          stockByLocation: stockByLoc,
          updatedAt: now
        });
      }
    } catch (stockErr) {
      console.warn('Could not update product stock on client fallback:', stockErr);
    }
  }

  const createdTx: Transaction = {
    id: docRef.id,
    ...params,
    quantity: Number(params.quantity || 1),
    createdAt: now
  };
  return { id: docRef.id, transaction: createdTx };
}

/**
 * Reverse a transaction via server API by posting a linked reversing entry (never deletes).
 */
export async function reverseTransaction(tx: Transaction): Promise<{ reversingTransactionId: string; reversingEntry?: Transaction }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/transactions?id=${encodeURIComponent(tx.id)}`, {
      method: 'DELETE',
      headers
    });

    if (res.ok) {
      const resData = await res.json();
      return {
        reversingTransactionId: resData.reversingTransactionId,
        reversingEntry: resData.reversingEntry
      };
    }

    if (res.status === 400) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to reverse transaction (${res.status})`);
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes('(500)') && !apiErr.message.includes('(502)') && !apiErr.message.includes('fetch')) {
      throw apiErr;
    }
    console.warn('Reverse transaction API failed, falling back to direct Firestore:', apiErr);
  }

  // Client Firestore fallback:
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'transactions', tx.id), {
    isReversed: true,
    reversed: true,
    reversedAt: now,
    updatedAt: now
  });

  return {
    reversingTransactionId: tx.id
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
