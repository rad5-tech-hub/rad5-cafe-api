import { db } from '../config/firebase.js';
import { env } from '../config/env.js';

const COUNTERS_COLLECTION = 'counters';

export async function getNextId(prefix: string = 'RAD5'): Promise<string> {
  const counterRef = db.collection(COUNTERS_COLLECTION).doc(prefix);
  const result = await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(counterRef);
    let nextSeq = 1;
    if (doc.exists) {
      nextSeq = (doc.data()?.sequence || 0) + 1;
    }
    transaction.set(counterRef, { sequence: nextSeq }, { merge: true });
    return nextSeq;
  });
  return `${prefix}${String(result).padStart(6, '0')}`;
}

export async function generateReceiptNumber(): Promise<string> {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seq = await getNextId('RCT');
  return `RCT-${datePart}-${seq.slice(-6)}`;
}
