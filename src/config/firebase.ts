import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { env } from './env.js';

function getServiceAccount(): admin.ServiceAccount {
  if (env.firebase.serviceAccountJson) {
    const parsed = JSON.parse(env.firebase.serviceAccountJson);
    return {
      projectId: parsed.project_id,
      privateKey: parsed.private_key,
      clientEmail: parsed.client_email,
    };
  }

  return {
    projectId: env.firebase.projectId,
    privateKey: env.firebase.privateKey,
    clientEmail: env.firebase.clientEmail,
  };
}

function initFirebase(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const serviceAccount = getServiceAccount();

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });

  return app;
}

const app = initFirebase();
const dbId = env.firebase.databaseId;
export const db = dbId === '(default)' ? admin.firestore(app) : getFirestore(app, dbId);
export const auth = admin.auth(app);
export const storage = admin.storage(app);
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;

export default admin;
