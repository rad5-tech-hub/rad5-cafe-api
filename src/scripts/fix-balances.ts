import { db, Timestamp } from '../config/firebase.js';

async function main() {
  console.log("Fetching all wallets from Firestore...");
  const snapshot = await db.collection('wallets').get();
  console.log(`Found ${snapshot.size} wallets.`);

  let updatedCount = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const rawBalance = data.balance;
    if (typeof rawBalance === 'number') {
      const roundedBalance = Math.round((rawBalance + Number.EPSILON) * 100) / 100;
      if (roundedBalance !== rawBalance) {
        console.log(`Wallet ID: ${data.walletId} (user: ${data.userId}): ${rawBalance} -> ${roundedBalance}`);
        await doc.ref.update({
          balance: roundedBalance,
          updatedAt: Timestamp.now()
        });
        updatedCount++;
      }
    }
  }
  console.log(`Completed. Updated ${updatedCount} wallets.`);
}

main().catch(console.error);
