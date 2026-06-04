import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { env } from '../config/env.js';

interface SeedUser {
  uid: string;
  email: string;
  displayName?: string;
  phoneNumber?: string;
  password?: string;
  customClaims?: Record<string, string>;
}

export async function importUsers(users: admin.auth.UserImportRecord[]) {
  const result = await admin.auth().importUsers(users);
  console.log(`Successfully imported ${result.successCount} users.`);
  console.log(`Failed to import ${result.failureCount} users.`);

  if (result.failureCount > 0) {
    result.errors.forEach((err) => {
      console.error('Error on user index', err.index, ':', err.error.message);
    });
  }

  return result;
}

export function loadUsersFromJson(path: string): admin.auth.UserImportRecord[] {
  const raw = readFileSync(resolve(path), 'utf-8');
  const seedUsers: SeedUser[] = JSON.parse(raw);

  return seedUsers.map((u) => ({
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    phoneNumber: u.phoneNumber,
    passwordHash: u.password ? Buffer.from(u.password) : undefined,
    customClaims: u.customClaims,
  }));
}

if (require.main === module) {
  if (!admin.apps.length) {
    if (env.firebase.serviceAccountJson) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(env.firebase.serviceAccountJson)),
      });
    } else {
      const firebaseConfig = JSON.parse(
        readFileSync(resolve('firebase-service-account.json'), 'utf-8')
      );
      admin.initializeApp({ credential: admin.credential.cert(firebaseConfig) });
    }
  }

  const usersPath = process.argv[2] || 'seed-users.json';
  const users = loadUsersFromJson(usersPath);

  importUsers(users)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
