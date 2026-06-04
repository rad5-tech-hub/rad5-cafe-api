import { db, Timestamp } from '../config/firebase';
import { env } from '../config/env';

async function main() {
  const adminEmail = env.admin.email || 'admin@rad5cafe.com';
  console.log(`Checking if admin user exists for email: ${adminEmail}`);

  const snapshot = await db.collection('users')
    .where('email', '==', adminEmail)
    .where('role', '==', 'admin')
    .limit(1)
    .get();

  if (!snapshot.empty) {
    console.log("Admin user already exists in Firestore.");
    const doc = snapshot.docs[0];
    console.log(`ID: ${doc.id}, Data:`, doc.data());
    return;
  }

  console.log("Admin user not found. Seeding admin user...");
  const adminDocRef = db.collection('users').doc('admin-super');
  const adminData = {
    uid: 'RAD5-ADMIN',
    firebaseUid: 'admin-super',
    fullName: 'Super Admin',
    phoneNumber: '+2348000000000',
    email: adminEmail,
    role: 'admin',
    walletId: 'RAD5-ADMIN',
    pin: null,
    pinSetup: false,
    expoPushToken: null,
    isActive: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await adminDocRef.set(adminData);
  console.log("Admin user successfully seeded to Firestore!");

  // Also create a wallet for the admin if needed
  const walletSnapshot = await db.collection('wallets')
    .where('userId', '==', 'admin-super')
    .limit(1)
    .get();

  if (walletSnapshot.empty) {
    console.log("Creating wallet for admin user...");
    await db.collection('wallets').add({
      walletId: 'RAD5-ADMIN',
      userId: 'admin-super',
      balance: 0,
      totalFunded: 0,
      totalSpent: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log("Admin wallet successfully created!");
  }
}

main().catch(console.error);
