import { auth, db } from '../config/firebase.js';
import { User } from '../types/index.js';

async function main() {
  console.log('Fetching admin users from Firestore...');

  const snapshot = await db.collection('users')
    .where('role', '==', 'admin')
    .get();

  if (snapshot.empty) {
    console.log('No admin users found in Firestore.');
    return;
  }

  console.log(`Found ${snapshot.size} admin user(s).`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const doc of snapshot.docs) {
    const user = doc.data() as User;
    const firebaseUid = user.firebaseUid || doc.id;

    if (firebaseUid === 'admin-super') {
      console.log(`  SKIP ${doc.id}: Superadmin (synthetic UID, no Firebase Auth account)`);
      skipCount++;
      continue;
    }

    try {
      await auth.setCustomUserClaims(firebaseUid, { isAdmin: true });
      console.log(`  OK   ${doc.id} (${user.email}): Custom claims set.`);
      successCount++;
    } catch (error: any) {
      console.error(`  FAIL ${doc.id} (${user.email}): ${error.message}`);
      failCount++;
    }
  }

  console.log(`\nDone. Success: ${successCount}, Skipped: ${skipCount}, Failed: ${failCount}`);
}

main().catch(console.error);
