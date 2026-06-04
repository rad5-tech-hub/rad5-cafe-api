import { Timestamp } from '../config/firebase.js';

export function now(): FirebaseFirestore.Timestamp {
  return Timestamp.now();
}

export function toDate(timestamp: FirebaseFirestore.Timestamp | null | undefined): Date | null {
  if (!timestamp) return null;
  return timestamp.toDate();
}
