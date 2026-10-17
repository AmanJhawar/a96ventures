import { app } from '@/lib/firebase/config';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore/lite';
import { Location, Product, Transaction, TransactionType, ProductCategory } from '@/lib/types';
import { withTimeout } from './utils';

const db = getFirestore(app);

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
    items.push({
      id: docSnap.id,
      name: data.name || '',
      category: data.category as ProductCategory,
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

export async function addProduct(data: {
  name: string;
  category: ProductCategory;
  sku: string;
  weight: number;
  purity: string;
  initialStock?: number;
  initialLocationId?: string;
  initialLocationName?: string;
}): Promise<string> {
  const stockByLocation: Record<string, number> = {};
  let totalStock = 0;

  const initQty = Number(data.initialStock) || 0;
  if (initQty > 0 && data.initialLocationId) {
    stockByLocation[data.initialLocationId] = initQty;
    totalStock = initQty;
  }

  const docRef = await addDoc(collection(db, 'products'), {
    name: data.name.trim(),
    category: data.category,
    sku: data.sku.trim().toUpperCase(),
    stock: totalStock,
    stockByLocation,
    weight: Number(data.weight) || 0,
    purity: data.purity.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // If initial stock was given, record an initial purchase / opening stock transaction
  if (initQty > 0 && data.initialLocationId && data.initialLocationName) {
    await addDoc(collection(db, 'transactions'), {
      type: 'purchase',
      productId: docRef.id,
      productName: data.name.trim(),
      category: data.category,
      quantity: initQty,
      price: 0,
      locationId: data.initialLocationId,
      locationName: data.initialLocationName,
      date: new Date().toISOString().split('T')[0],
      notes: 'Initial opening stock',
      createdAt: serverTimestamp(),
    });
  }

  return docRef.id;
}

export async function updateProduct(id: string, data: {
  name: string;
  category: ProductCategory;
  sku: string;
  weight: number;
  purity: string;
}): Promise<void> {
  await setDoc(doc(db, 'products', id), {
    name: data.name.trim(),
    category: data.category,
    sku: data.sku.trim().toUpperCase(),
    weight: Number(data.weight) || 0,
    purity: data.purity.trim(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function deleteProduct(id: string): Promise<void> {
  await deleteDoc(doc(db, 'products', id));
}

// ==========================================
// TRANSACTIONS & STOCK LOGIC
// ==========================================

export async function getTransactions(): Promise<Transaction[]> {
  const querySnapshot = await withTimeout(getDocs(collection(db, 'transactions')));
  const items: Transaction[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ ...docSnap.data(), id: docSnap.id } as Transaction);
  });
  // Sort by date descending, then createdAt descending
  return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export interface RecordTransactionParams {
  type: TransactionType;
  productId: string;
  productName: string;
  category: ProductCategory;
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

export async function recordTransaction(params: RecordTransactionParams): Promise<string> {
  const productRef = doc(db, 'products', params.productId);
  const productSnap = await getDoc(productRef);
  if (!productSnap.exists()) {
    throw new Error('Product not found');
  }

  const productData = productSnap.data() as Product;
  const currentTotal = Number(productData.stock || 0);
  const currentLocMap: Record<string, number> = { ...(productData.stockByLocation || {}) };
  const sourceLocStock = Number(currentLocMap[params.locationId] || 0);
  const qty = Number(params.quantity || 0);

  let newTotal = currentTotal;

  switch (params.type) {
    case 'purchase': {
      if (qty <= 0) throw new Error('Quantity must be greater than 0');
      currentLocMap[params.locationId] = sourceLocStock + qty;
      newTotal = currentTotal + qty;
      break;
    }

    case 'sale': {
      if (qty <= 0) throw new Error('Quantity must be greater than 0');
      if (sourceLocStock < qty) {
        throw new Error(`Insufficient stock at ${params.locationName}. Available: ${sourceLocStock}, requested: ${qty}`);
      }
      currentLocMap[params.locationId] = sourceLocStock - qty;
      newTotal = currentTotal - qty;
      break;
    }

    case 'return': {
      if (qty <= 0) throw new Error('Quantity must be greater than 0');
      currentLocMap[params.locationId] = sourceLocStock + qty;
      newTotal = currentTotal + qty;
      break;
    }

    case 'transfer': {
      if (qty <= 0) throw new Error('Quantity must be greater than 0');
      if (!params.toLocationId || params.toLocationId === params.locationId) {
        throw new Error('Please select a distinct destination location');
      }
      if (sourceLocStock < qty) {
        throw new Error(`Insufficient stock at source (${params.locationName}). Available: ${sourceLocStock}, requested: ${qty}`);
      }
      const destLocStock = Number(currentLocMap[params.toLocationId] || 0);
      currentLocMap[params.locationId] = sourceLocStock - qty;
      currentLocMap[params.toLocationId] = destLocStock + qty;
      // Total stock unchanged
      break;
    }

    case 'adjustment': {
      if (qty === 0) throw new Error('Quantity adjustment cannot be 0');
      if (sourceLocStock + qty < 0) {
        throw new Error(`Stock at ${params.locationName} cannot be less than 0. Available: ${sourceLocStock}, adjustment: ${qty}`);
      }
      currentLocMap[params.locationId] = sourceLocStock + qty;
      newTotal = currentTotal + qty;
      break;
    }

    case 'melt': {
      if (qty <= 0) throw new Error('Quantity must be greater than 0');
      if (sourceLocStock < qty) {
        throw new Error(`Insufficient stock at ${params.locationName}. Available: ${sourceLocStock}, requested: ${qty}`);
      }
      currentLocMap[params.locationId] = sourceLocStock - qty;
      newTotal = currentTotal - qty;
      break;
    }

    case 'repair': {
      // Modifies the weight of the product (mainly for idols)
      if (params.newWeight === undefined || params.newWeight === null || isNaN(params.newWeight) || params.newWeight <= 0) {
        throw new Error('Please enter a valid new weight for the repaired item');
      }
      // Weight is updated on the product; stock quantity remains unaffected
      break;
    }

    default:
      throw new Error(`Unknown transaction type: ${params.type}`);
  }

  // 1. Write transaction document
  const transactionPayload: Record<string, unknown> = {
    type: params.type,
    productId: params.productId,
    productName: params.productName,
    category: params.category,
    quantity: qty,
    locationId: params.locationId,
    locationName: params.locationName,
    date: params.date,
    notes: params.notes?.trim() || '',
    createdAt: serverTimestamp(),
  };

  if (params.price !== undefined && !isNaN(params.price)) {
    transactionPayload.price = Number(params.price);
  }
  if (params.toLocationId) {
    transactionPayload.toLocationId = params.toLocationId;
    transactionPayload.toLocationName = params.toLocationName || '';
  }
  if (params.customerName) {
    transactionPayload.customerName = params.customerName.trim();
  }
  if (params.type === 'repair') {
    const oldW = Number(params.previousWeight !== undefined ? params.previousWeight : productData.weight || 0);
    const newW = Number(params.newWeight);
    transactionPayload.previousWeight = oldW;
    transactionPayload.newWeight = newW;
    transactionPayload.weightChange = Number((newW - oldW).toFixed(2));
  }
  if (params.type === 'melt' && params.recoveredWeight !== undefined) {
    transactionPayload.recoveredWeight = Number(params.recoveredWeight);
  }

  const txRef = await addDoc(collection(db, 'transactions'), transactionPayload);

  // 2. Update product document
  const productUpdatePayload: Record<string, unknown> = {
    stock: newTotal,
    stockByLocation: currentLocMap,
    updatedAt: serverTimestamp(),
  };

  if (params.type === 'repair' && params.newWeight) {
    productUpdatePayload.weight = Number(params.newWeight);
  }

  await setDoc(productRef, productUpdatePayload, { merge: true });

  return txRef.id;
}

export async function deleteTransaction(tx: Transaction): Promise<void> {
  const productRef = doc(db, 'products', tx.productId);
  const productSnap = await getDoc(productRef);

  if (productSnap.exists()) {
    const productData = productSnap.data() as Product;
    const currentTotal = Number(productData.stock || 0);
    const currentLocMap: Record<string, number> = { ...(productData.stockByLocation || {}) };
    const qty = Number(tx.quantity || 0);

    let newTotal = currentTotal;

    // Reverse the transaction's effect
    switch (tx.type) {
      case 'purchase': {
        const locStock = Number(currentLocMap[tx.locationId] || 0);
        currentLocMap[tx.locationId] = Math.max(0, locStock - qty);
        newTotal = Math.max(0, currentTotal - qty);
        break;
      }

      case 'sale': {
        const locStock = Number(currentLocMap[tx.locationId] || 0);
        currentLocMap[tx.locationId] = locStock + qty;
        newTotal = currentTotal + qty;
        break;
      }

      case 'return': {
        const locStock = Number(currentLocMap[tx.locationId] || 0);
        currentLocMap[tx.locationId] = Math.max(0, locStock - qty);
        newTotal = Math.max(0, currentTotal - qty);
        break;
      }

      case 'transfer': {
        if (tx.toLocationId) {
          const fromStock = Number(currentLocMap[tx.locationId] || 0);
          const toStock = Number(currentLocMap[tx.toLocationId] || 0);
          currentLocMap[tx.locationId] = fromStock + qty;
          currentLocMap[tx.toLocationId] = Math.max(0, toStock - qty);
        }
        break;
      }

      case 'adjustment': {
        const locStock = Number(currentLocMap[tx.locationId] || 0);
        currentLocMap[tx.locationId] = Math.max(0, locStock - qty);
        newTotal = Math.max(0, currentTotal - qty);
        break;
      }

      case 'melt': {
        const locStock = Number(currentLocMap[tx.locationId] || 0);
        currentLocMap[tx.locationId] = locStock + qty;
        newTotal = currentTotal + qty;
        break;
      }

      case 'repair': {
        if (tx.previousWeight !== undefined) {
          await setDoc(productRef, {
            weight: tx.previousWeight,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
        break;
      }
    }

    if (tx.type !== 'repair') {
      await setDoc(productRef, {
        stock: newTotal,
        stockByLocation: currentLocMap,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  }

  // Delete the transaction doc
  await deleteDoc(doc(db, 'transactions', tx.id));
}
