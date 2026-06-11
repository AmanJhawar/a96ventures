import { db } from './config';
import { collection, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { CatalogItem } from '@/data/catalog';
import { TeamMember } from '@/data/team';
import { Brand } from '@/data/brands';
import { PortfolioCompany } from '@/data/portfolio';
import { Insight } from '@/data/insights';

// Fetch all catalog items
export async function getCatalogItems(): Promise<CatalogItem[]> {
  const querySnapshot = await getDocs(collection(db, 'catalog'));
  const items: CatalogItem[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ id: docSnap.id, ...docSnap.data() } as CatalogItem);
  });
  return items;
}

// Fetch store categories
export async function getStoreCategories(): Promise<string[]> {
  const docRef = doc(db, 'settings', 'categories');
  const docSnap = await getDoc(docRef);
  if (docSnap.exists() && docSnap.data().list) {
    return docSnap.data().list;
  }
  return ['Silver Idols', 'Silver Animals', 'Marble Photoframes', 'MMTC Bullions'];
}

// Fetch a single catalog item by ID
export async function getCatalogItemById(id: string): Promise<CatalogItem | null> {
  const docRef = doc(db, 'catalog', id);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as CatalogItem;
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
  return await addDoc(collection(db, 'inquiries'), {
    ...data,
    createdAt: serverTimestamp()
  });
}

// Fetch team members
export async function getTeamMembers(): Promise<(TeamMember & { id: string })[]> {
  const querySnapshot = await getDocs(collection(db, 'team'));
  const items: (TeamMember & { id: string })[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ id: docSnap.id, ...docSnap.data() } as (TeamMember & { id: string }));
  });
  return items;
}

// Fetch brands
export async function getBrands(): Promise<Brand[]> {
  const querySnapshot = await getDocs(collection(db, 'brands'));
  const items: Brand[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ id: docSnap.id, ...docSnap.data() } as Brand);
  });
  return items;
}

// Fetch portfolio companies
export async function getPortfolioCompanies(): Promise<(PortfolioCompany & { id: string })[]> {
  const querySnapshot = await getDocs(collection(db, 'portfolio'));
  const items: (PortfolioCompany & { id: string })[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ id: docSnap.id, ...docSnap.data() } as (PortfolioCompany & { id: string }));
  });
  return items;
}

export async function getPortfolioCompanyBySlug(slug: string): Promise<(PortfolioCompany & { id: string }) | null> {
  const docRef = doc(db, 'portfolio', slug);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as (PortfolioCompany & { id: string });
  }
  return null;
}

// Fetch insights
export async function getInsights(): Promise<(Insight & { id: string })[]> {
  const querySnapshot = await getDocs(collection(db, 'insights'));
  const items: (Insight & { id: string })[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ id: docSnap.id, ...docSnap.data() } as (Insight & { id: string }));
  });
  return items;
}

export async function getInsightById(id: string): Promise<(Insight & { id: string }) | null> {
  const docRef = doc(db, 'insights', id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as (Insight & { id: string });
  }
  return null;
}
