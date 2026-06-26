import { auth, db, Timestamp } from '../config/firebase.js';
import bcryptjs from 'bcryptjs';

const DEFAULT_PASSWORD = 'Rad5Super@Admin2026'; // Or use an environment variable

async function addSuperAdmin(email: string, name: string) {
  console.log(`\nProcessing admin: ${name} (${email})`);
  const passwordHash = bcryptjs.hashSync(DEFAULT_PASSWORD, 12);

  let firebaseUser;
  try {
    firebaseUser = await auth.getUserByEmail(email);
    console.log(`  Found existing Firebase Auth account for ${email} with UID: ${firebaseUser.uid}`);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.log(`  Creating Firebase Auth account for ${email}...`);
      firebaseUser = await auth.createUser({
        email,
        password: DEFAULT_PASSWORD,
        displayName: name,
      });
      console.log(`  Successfully created Firebase Auth account. UID: ${firebaseUser.uid}`);
    } else {
      console.error(`  Error checking Firebase Auth for ${email}:`, error.message);
      return;
    }
  }

  const uid = firebaseUser.uid;
  const walletId = `WLT-${email.split('@')[0]!.toUpperCase()}`;

  // 1. Create/Update Firestore User document
  const userRef = db.collection('users').doc(uid);
  const userDoc = await userRef.get();

  const userData = {
    uid,
    firebaseUid: uid,
    fullName: name,
    phoneNumber: '+2348000000000', // You can modify this to accept phone as an argument
    email,
    role: 'admin' as const,
    walletId,
    pinSetup: false,
    expoPushToken: null,
    isActive: true,
    passwordHash,
    updatedAt: Timestamp.now(),
  };

  if (!userDoc.exists) {
    console.log(`  Creating Firestore user document for ${email}...`);
    await userRef.set({
      ...userData,
      pin: null,
      createdAt: Timestamp.now(),
    });
    console.log(`  Firestore user document created.`);
  } else {
    console.log(`  Updating existing Firestore user document to 'admin' for ${email}...`);
    await userRef.update(userData);
    console.log(`  Firestore user document updated.`);
  }

  // 2. Set Custom User Claims
  console.log(`  Setting custom claims { isAdmin: true } for UID: ${uid}...`);
  await auth.setCustomUserClaims(uid, { isAdmin: true });
  console.log(`  Custom claims set.`);

  // 3. Create Wallet if needed
  const walletSnapshot = await db.collection('wallets')
    .where('userId', '==', uid)
    .limit(1)
    .get();

  if (walletSnapshot.empty) {
    console.log(`  Creating default wallet ${walletId} for admin...`);
    await db.collection('wallets').add({
      walletId,
      userId: uid,
      balance: 0,
      totalFunded: 0,
      totalSpent: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log(`  Admin wallet created.`);
  } else {
    console.log(`  Admin wallet already exists.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: bun run src/scripts/add-superadmin.ts <email> <full_name>');
    process.exit(1);
  }

  const email = args[0]!;
  const name = args.slice(1).join(' '); // Allow multi-word names

  console.log('--- STARTING SUPERADMIN SEEDING ---');
  await addSuperAdmin(email, name);
  console.log('\n--- SEEDING COMPLETED SUCCESSFULLY ---');
  console.log(`Temporary Default Password: ${DEFAULT_PASSWORD}`);
}

main().catch((err) => {
  console.error('Fatal error in seeding script:', err);
  process.exit(1);
});
