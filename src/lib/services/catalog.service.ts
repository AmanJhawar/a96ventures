import { app } from '@/lib/firebase/config'
import { getFirestore, collection, doc, getDoc, getDocs, query, orderBy, limit, startAfter, where, QueryConstraint, setDoc, deleteDoc } from 'firebase/firestore/lite'
import { CatalogItem, DEFAULT_CATEGORIES } from '@/lib/types'
import { withTimeout } from './utils'

const db = getFirestore(app)
const CATALOG_COLLECTION = 'catalog'

export interface CatalogFilters {
  category: string; // 'All' or specific category
  sortBy: string; // 'default' (orderIndex), 'name-asc', 'name-desc'
  searchQuery?: string; // Search string
}

export async function getCatalogPage(
  pageSize: number, 
  filters: CatalogFilters, 
  cursorId?: string | null
): Promise<{ items: CatalogItem[], hasNext: boolean, lastCursor: string | null }> {
  const constraints: QueryConstraint[] = [];

  if (filters.category !== 'All') {
    constraints.push(where('category', '==', filters.category));
  }

  if (filters.searchQuery) {
    constraints.push(where('searchTerms', 'array-contains', filters.searchQuery.toLowerCase().trim()));
  }

  // Sort logic
  if (filters.sortBy === 'name-asc') {
    constraints.push(orderBy('name', 'asc'));
  } else if (filters.sortBy === 'name-desc') {
    constraints.push(orderBy('name', 'desc'));
  } else {
    // default
    constraints.push(orderBy('orderIndex', 'asc'));
  }

  // If a cursor is provided, we need to fetch the document to use as snapshot for startAfter
  if (cursorId) {
    const cursorDoc = await getDoc(doc(db, CATALOG_COLLECTION, cursorId));
    if (cursorDoc.exists()) {
      constraints.push(startAfter(cursorDoc));
    }
  }

  // Fetch pageSize + 1 to know if there's a next page
  constraints.push(limit(pageSize + 1));

  const q = query(collection(db, CATALOG_COLLECTION), ...constraints);
  const snapshot = await getDocs(q);

  const items: CatalogItem[] = [];
  snapshot.forEach(d => {
    items.push({ id: d.id, ...d.data() } as CatalogItem);
  });

  const hasNext = items.length > pageSize;
  const returnedItems = hasNext ? items.slice(0, pageSize) : items;
  const lastCursor = returnedItems.length > 0 ? returnedItems[returnedItems.length - 1].id : null;

  return { items: returnedItems, hasNext, lastCursor };
}

export async function getCatalogItems(): Promise<CatalogItem[]> {
  const querySnapshot = await withTimeout(getDocs(collection(db, CATALOG_COLLECTION)));
  const items: CatalogItem[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ ...docSnap.data(), id: docSnap.id } as CatalogItem);
  });
  return items;
}

export async function getMoreCatalogItems(excludeId: string, maxItems: number = 4): Promise<CatalogItem[]> {
  const q = query(collection(db, CATALOG_COLLECTION), limit(maxItems + 1));
  const querySnapshot = await withTimeout(getDocs(q));
  const items: CatalogItem[] = [];
  querySnapshot.forEach((docSnap) => {
    if (docSnap.id !== excludeId && items.length < maxItems) {
      items.push({ ...docSnap.data(), id: docSnap.id } as CatalogItem);
    }
  });
  return items;
}

export async function getStoreCategories(): Promise<string[]> {
  const docRef = doc(db, 'settings', 'categories');
  const docSnap = await withTimeout(getDoc(docRef));
  if (docSnap.exists() && docSnap.data().list) {
    return docSnap.data().list;
  }
  return DEFAULT_CATEGORIES;
}

export async function getCatalogItemById(id: string): Promise<CatalogItem | null> {
  const docRef = doc(db, CATALOG_COLLECTION, id);
  const docSnap = await withTimeout(getDoc(docRef));
  if (docSnap.exists()) {
    return { ...docSnap.data(), id: docSnap.id } as CatalogItem;
  }
  return null;
}

export async function setStoreCategories(categories: string[]): Promise<void> {
  await setDoc(doc(db, 'settings', 'categories'), { list: categories });
}

export async function saveInventoryItem(id: string, payload: Partial<CatalogItem>): Promise<void> {
  await setDoc(doc(db, CATALOG_COLLECTION, id), payload);
  // Trigger dynamic path revalidation in background
  fetch(`/api/revalidate?path=${encodeURIComponent('/catalog')}`).catch(err => console.error(err));
  fetch(`/api/revalidate?path=${encodeURIComponent(`/catalog/${id}`)}`).catch(err => console.error(err));
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await deleteDoc(doc(db, CATALOG_COLLECTION, id));
  // Trigger dynamic path revalidation in background
  fetch(`/api/revalidate?path=${encodeURIComponent('/catalog')}`).catch(err => console.error(err));
  fetch(`/api/revalidate?path=${encodeURIComponent(`/catalog/${id}`)}`).catch(err => console.error(err));
}
