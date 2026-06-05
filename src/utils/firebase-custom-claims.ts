import { auth, db, Timestamp } from '../config/firebase.js';

export async function setAdminClaim(uid: string): Promise<void> {
  await db.collection('users').doc(uid).update({
    role: 'admin',
    updatedAt: Timestamp.now(),
  });
  try {
    await auth.setCustomUserClaims(uid, { isAdmin: true });
  } catch {
    console.warn(`Failed to set custom claims for ${uid} — Firestore role updated anyway`);
  }
}

export async function removeAdminClaim(uid: string): Promise<void> {
  await db.collection('users').doc(uid).update({
    role: 'customer',
    updatedAt: Timestamp.now(),
  });
  try {
    await auth.setCustomUserClaims(uid, null);
  } catch {
    console.warn(`Failed to remove custom claims for ${uid} — Firestore role updated anyway`);
  }
}

export async function promoteToAdmin(uid: string): Promise<void> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new Error('User not found in Firestore');
  }
  await setAdminClaim(uid);
}

export async function demoteFromAdmin(uid: string): Promise<void> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new Error('User not found in Firestore');
  }
  await removeAdminClaim(uid);
}
