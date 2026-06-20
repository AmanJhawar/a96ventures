import { app } from '@/lib/firebase/config';
import { getFirestore, collection, getDocs } from 'firebase/firestore/lite';
import { Brand } from '@/lib/types';
import { withTimeout } from './utils';

const db = getFirestore(app);

export async function getBrands(): Promise<Brand[]> {
  const querySnapshot = await withTimeout(getDocs(collection(db, 'brands')));
  const items: Brand[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ ...docSnap.data(), id: docSnap.id } as Brand);
  });
  return items;
}
