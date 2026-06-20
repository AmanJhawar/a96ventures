import { app } from '@/lib/firebase/config';
import { getFirestore, collection, getDocs } from 'firebase/firestore/lite';
import { TeamMember } from '@/lib/types';
import { withTimeout } from './utils';

const db = getFirestore(app);

export async function getTeamMembers(): Promise<(TeamMember & { id: string })[]> {
  const querySnapshot = await withTimeout(getDocs(collection(db, 'team')));
  const items: (TeamMember & { id: string })[] = [];
  querySnapshot.forEach((docSnap) => {
    items.push({ ...docSnap.data(), id: docSnap.id } as (TeamMember & { id: string }));
  });
  return items;
}
