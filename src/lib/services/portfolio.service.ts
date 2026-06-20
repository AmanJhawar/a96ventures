import { app } from '@/lib/firebase/config';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore/lite';
import { PortfolioCompany } from '@/lib/types';
import { withTimeout } from './utils';

const db = getFirestore(app);

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
