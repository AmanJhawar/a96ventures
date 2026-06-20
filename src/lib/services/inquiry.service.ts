import { app } from '@/lib/firebase/config'
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, query, orderBy, limit, startAfter, addDoc, serverTimestamp } from 'firebase/firestore/lite'
import { Inquiry } from '@/lib/types'
import { withTimeout } from './utils'

const db = getFirestore(app)
const INQUIRIES_COLLECTION = 'inquiries'

export async function getInquiriesPage(pageSize: number, cursorId?: string | null): Promise<{ items: Inquiry[], nextCursor: string | null }> {
  let q = query(collection(db, INQUIRIES_COLLECTION), orderBy('createdAt', 'desc'), limit(pageSize));
  
  if (cursorId) {
    const cursorDoc = await getDoc(doc(db, INQUIRIES_COLLECTION, cursorId));
    if (cursorDoc.exists()) {
      q = query(collection(db, INQUIRIES_COLLECTION), orderBy('createdAt', 'desc'), startAfter(cursorDoc), limit(pageSize));
    }
  }

  const snapshot = await getDocs(q);
  const items: Inquiry[] = [];
  snapshot.forEach(d => {
    items.push({ id: d.id, ...d.data() } as Inquiry);
  });

  const nextCursor = snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1].id : null;

  return { items, nextCursor };
}

export async function deleteInquiry(id: string): Promise<void> {
  await deleteDoc(doc(db, INQUIRIES_COLLECTION, id));
}

export async function updateInquiryStatus(id: string, status: 'unread' | 'read' | 'handled'): Promise<void> {
  await setDoc(doc(db, INQUIRIES_COLLECTION, id), { status }, { merge: true });
}

export async function submitInquiry(data: {
  firstName: string;
  middleName?: string;
  lastName: string;
  countryCode: string;
  mobile: string;
  email?: string;
  company?: string;
  gstinPan?: string;
  message: string;
  inquiryType: string;
}) {
  const payload = Object.fromEntries(
    Object.entries({ ...data, status: 'unread', createdAt: serverTimestamp() })
      .filter(([, v]) => v !== undefined && v !== '')
  );
  return await withTimeout(addDoc(collection(db, INQUIRIES_COLLECTION), payload));
}
