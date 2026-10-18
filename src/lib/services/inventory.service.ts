import { app } from '@/lib/firebase/config';
import { auth } from '@/lib/firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore/lite';
import { Location, Product, Transaction, TransactionType, ProductCategory, MetalType } from '@/lib/types';
import { withTimeout } from './utils';

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
  const querySnapshot = await withTimeout(getDocs(collection(db, 'locations')));
  const items: Location[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ ...docSnap.data(), id: docSnap.id } as Location);
  });
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addLocation(data: { name: string; description?: string }): Promise<string> {
  const docRef = await addDoc(collection(db, 'locations'), {
    name: data.name.trim(),
    description: data.description?.trim() || '',
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateLocation(id: string, data: { name: string; description?: string }): Promise<void> {
  await setDoc(doc(db, 'locations', id), {
    name: data.name.trim(),
    description: data.description?.trim() || '',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function deleteLocation(id: string): Promise<void> {
  // Check if any product has stock in this location
  const products = await getProducts();
  const hasStock = products.some((p) => (p.stockByLocation?.[id] || 0) > 0);
  if (hasStock) {
    throw new Error('Cannot delete this location because products currently hold stock here. Transfer or adjust stock first.');
  }
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

export async function getProducts(): Promise<Product[]> {
  const querySnapshot = await withTimeout(getDocs(collection(db, 'products')));
  const items: Product[] = [];
  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const normalizedCategory = (data.category === 'Silver Idols' ? 'Idols' : data.category) as ProductCategory;
    items.push({
      id: docSnap.id,
      name: data.name || '',
      category: normalizedCategory,
      metal: (data.metal || (normalizedCategory === 'Idols' ? 'Silver' : 'Gold')) as MetalType,
      sku: data.sku || '',
      stock: Number(data.stock || 0),
      stockByLocation: data.stockByLocation || {},
      weight: Number(data.weight || 0),
      purity: data.purity || '',
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
  metal: MetalType;
  sku: string;
  weight: number;
  purity: string;
  initialStock?: number;
  initialLocationId?: string;
  initialLocationName?: string;
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
  metal: MetalType;
  sku: string;
  weight: number;
  purity: string;
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

export async function getTransactions(): Promise<Transaction[]> {
  const querySnapshot = await withTimeout(getDocs(collection(db, 'transactions')));
  const items: Transaction[] = [];
  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    items.push({
      ...data,
      id: docSnap.id,
      category: (data.category === 'Silver Idols' ? 'Idols' : data.category) as ProductCategory,
    } as Transaction);
  });
  // Sort by date descending, then createdAt descending
  return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export interface RecordTransactionParams {
  type: TransactionType;
  productId: string;
  productName: string;
  category: ProductCategory;
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
  date: string; // YYYY-MM-DD
}

/**
 * Record a transaction (purchase, sale, return, transfer, adjustment, repair, melt)
 * via server API with ACID atomic stock validation and verification.
 */
export async function recordTransaction(params: RecordTransactionParams): Promise<string> {
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
  return resData.id;
}

/**
 * Reverse and delete a transaction via server API with atomic stock reversal.
 */
export async function deleteTransaction(tx: Transaction): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/transactions?id=${encodeURIComponent(tx.id)}`, {
    method: 'DELETE',
    headers
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to reverse transaction (${res.status})`);
  }
}

/**
 * Erases all transaction history (Master Zero-Balance) via server API.
 */
export async function clearTransactionHistory(): Promise<number> {
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
  return resData.count || 0;
}
