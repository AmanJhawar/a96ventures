import { db } from './config';
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp, query, limit } from 'firebase/firestore/lite';
import { CatalogItem, TeamMember, Brand, PortfolioCompany, DEFAULT_CATEGORIES } from '@/lib/types';

// Helper to wrap a promise with a timeout (default 8 seconds) to prevent hanging builds
function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Database request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Fetch all catalog items
export async function getCatalogItems(): Promise<CatalogItem[]> {
  const querySnapshot = await withTimeout(getDocs(collection(db, 'catalog')));
  const items: CatalogItem[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ ...docSnap.data(), id: docSnap.id } as CatalogItem);
  });
  return items;
}

// Fetch a limited number of catalog items (useful for "More products" sections without fetching the whole db)
export async function getMoreCatalogItems(excludeId: string, maxItems: number = 4): Promise<CatalogItem[]> {
  // Fetch maxItems + 1 so we can safely filter out the excludeId and still have maxItems
  const q = query(collection(db, 'catalog'), limit(maxItems + 1));
  const querySnapshot = await withTimeout(getDocs(q));
  const items: CatalogItem[] = [];
  querySnapshot.forEach((docSnap) => {
    if (docSnap.id !== excludeId && items.length < maxItems) {
      items.push({ ...docSnap.data(), id: docSnap.id } as CatalogItem);
    }
  });
  return items;
}

// Fetch store categories
export async function getStoreCategories(): Promise<string[]> {
  const docRef = doc(db, 'settings', 'categories');
  const docSnap = await withTimeout(getDoc(docRef));
  if (docSnap.exists() && docSnap.data().list) {
    return docSnap.data().list;
  }
  return DEFAULT_CATEGORIES;
}

// Fetch a single catalog item by ID
export async function getCatalogItemById(id: string): Promise<CatalogItem | null> {
  const docRef = doc(db, 'catalog', id);
  const docSnap = await withTimeout(getDoc(docRef));
  
  if (docSnap.exists()) {
    return { ...docSnap.data(), id: docSnap.id } as CatalogItem;
  }
  return null;
}

// Submit a new inquiry
export async function submitInquiry(data: {
  name: string;
  email: string;
  company: string;
  message: string;
  inquiryType: string;
}) {
  return await withTimeout(addDoc(collection(db, 'inquiries'), {
    ...data,
    status: 'unread',
    createdAt: serverTimestamp()
  }));
}

// Fetch team members
export async function getTeamMembers(): Promise<(TeamMember & { id: string })[]> {
  const querySnapshot = await withTimeout(getDocs(collection(db, 'team')));
  const items: (TeamMember & { id: string })[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ ...docSnap.data(), id: docSnap.id } as (TeamMember & { id: string }));
  });
  return items;
}

// Fetch brands
export async function getBrands(): Promise<Brand[]> {
  const querySnapshot = await withTimeout(getDocs(collection(db, 'brands')));
  const items: Brand[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ ...docSnap.data(), id: docSnap.id } as Brand);
  });
  return items;
}

// Fetch portfolio companies
export async function getPortfolioCompanies(): Promise<(PortfolioCompany & { id: string })[]> {
  const querySnapshot = await withTimeout(getDocs(collection(db, 'portfolio')));
  const items: (PortfolioCompany & { id: string })[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ ...docSnap.data(), id: docSnap.id } as (PortfolioCompany & { id: string }));
  });
  return items;
}

export async function getPortfolioCompanyById(id: string): Promise<(PortfolioCompany & { id: string }) | null> {
  const docRef = doc(db, 'portfolio', id);
  const docSnap = await withTimeout(getDoc(docRef));
  if (docSnap.exists()) {
    return { ...docSnap.data(), id: docSnap.id } as (PortfolioCompany & { id: string });
  }
  return null;
}

