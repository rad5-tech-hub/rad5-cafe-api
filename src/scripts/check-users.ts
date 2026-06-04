import { db } from '../config/firebase.js';

async function main() {
  console.log("Fetching users from Firestore...");
  const snapshot = await db.collection('users').get();
  console.log(`Total users found: ${snapshot.size}`);
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}, Email: ${data.email}, Role: ${data.role}, Name: ${data.fullName}, IsActive: ${data.isActive}`);
  });
}

main().catch(console.error);
