// Diagnoses the classic "granted admin but API says access denied" case:
// the Admin SDK grants the role to whichever Firebase Auth UID
// `auth.getUserByEmail()` returns, but if the project allows multiple
// accounts per email address, the person may actually be signing in with
// a *different* UID (e.g. Google vs email/password), which has no admin
// role at all — so requireAdmin correctly (from its point of view) denies.
//
// Usage: bun run src/scripts/check-duplicate-account.ts someone@example.com
import { auth, db } from '../config/firebase.js';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: bun run src/scripts/check-duplicate-account.ts <email>');
    process.exit(1);
  }
  const cleanEmail = email.trim().toLowerCase();

  console.log(`\n--- Firebase Auth accounts for ${cleanEmail} ---`);
  const authUids: string[] = [];
  // listUsers doesn't filter server-side by email, so page through and match.
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (u.email?.toLowerCase() === cleanEmail) {
        authUids.push(u.uid);
        console.log(
          `UID: ${u.uid} | providers: ${u.providerData.map((p) => p.providerId).join(', ')} | customClaims: ${JSON.stringify(u.customClaims ?? {})} | created: ${u.metadata.creationTime}`
        );
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  if (authUids.length === 0) {
    console.log('No Firebase Auth accounts found for that email.');
  } else if (authUids.length > 1) {
    console.log(`\n⚠️  ${authUids.length} SEPARATE Firebase Auth accounts share this email — this is the bug.`);
    console.log('One provider (e.g. Google) mints a different UID than the other (e.g. email/password),');
    console.log('so admin claims/role granted on one UID are invisible when the person signs in with the other.');
  }

  console.log(`\n--- Firestore 'users' docs for ${cleanEmail} ---`);
  const snap = await db.collection('users').where('email', '==', cleanEmail).get();
  if (snap.empty) {
    console.log('No Firestore user docs found for that email.');
  }
  snap.docs.forEach((doc) => {
    const d = doc.data();
    console.log(
      `doc id: ${doc.id} | firebaseUid field: ${d.firebaseUid ?? '(none)'} | role: ${d.role} | permissions: ${JSON.stringify(d.permissions ?? null)} | isActive: ${d.isActive}`
    );
  });

  console.log('\n--- Verdict ---');
  const docIds = snap.docs.map((d) => d.id);
  const mismatched = authUids.filter((uid) => !docIds.includes(uid));
  if (authUids.length > 1) {
    console.log('Fix: decide which UID the person actually signs in with day-to-day, then re-run the');
    console.log('admin grant (or promoteToAdmin) targeting THAT uid specifically, and consider disabling');
    console.log('"multiple accounts per email" in Firebase Console > Authentication > Settings so this');
    console.log('cannot happen again for other admins.');
  } else if (mismatched.length > 0) {
    console.log(`Auth UID(s) with no matching Firestore doc at the same id: ${mismatched.join(', ')}`);
  } else {
    console.log('No split-identity issue detected for this email — role/permissions are consistent.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
