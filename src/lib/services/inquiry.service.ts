import { app } from '@/lib/firebase/config'
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, limit, startAfter, addDoc, serverTimestamp } from 'firebase/firestore/lite'
import { Inquiry } from '@/lib/types'
import { withTimeout } from './utils'
import { recordAuditLog } from './audit.service'

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

export async function deleteInquiry(
  id: string,
  actor?: { id: string; email: string },
  inquiryContact?: string
): Promise<void> {
  await deleteDoc(doc(db, INQUIRIES_COLLECTION, id));
  await recordAuditLog({
    userId: actor?.id,
    userEmail: actor?.email,
    action: 'delete',
    entityType: 'inquiry',
    entityId: id,
    entityName: inquiryContact || id,
    description: `Deleted customer inquiry from "${inquiryContact || id}"`
  });
}

export async function updateInquiryStatus(
  id: string,
  status: 'unread' | 'read' | 'handled',
  actor?: { id: string; email: string },
  inquiryContact?: string
): Promise<void> {
  await setDoc(doc(db, INQUIRIES_COLLECTION, id), { status }, { merge: true });
  await recordAuditLog({
    userId: actor?.id,
    userEmail: actor?.email,
    action: 'status_change',
    entityType: 'inquiry',
    entityId: id,
    entityName: inquiryContact || id,
    description: `Updated status to "${status}" for inquiry from "${inquiryContact || id}"`
  });
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
  const allowedFields = {
    firstName: data.firstName,
    middleName: data.middleName,
    lastName: data.lastName,
    countryCode: data.countryCode,
    mobile: data.mobile,
    email: data.email,
    company: data.company,
    gstinPan: data.gstinPan,
    message: data.message,
    inquiryType: data.inquiryType,
    status: 'unread' as const,
    createdAt: serverTimestamp()
  };

  const payload = Object.fromEntries(
    Object.entries(allowedFields).filter(([, v]) => v !== undefined && v !== '')
  );

  return await withTimeout(addDoc(collection(db, INQUIRIES_COLLECTION), payload));
}
