import { db, Timestamp } from '../config/firebase.js';
import crypto from 'crypto';
import { User } from '../types/index.js';
import { hashPin } from '../utils/pin-hash.js';
import { sanitizeUserData } from '../utils/helpers.js';

const USERS_COLLECTION = 'users';

export class AuthService {
  async setupPin(userId: string, pin: string): Promise<void> {
    if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits');

    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error('User not found');

    const user = userDoc.data() as User;
    if (user.pinSetup) throw new Error('PIN already set up');

    const hashedPin = await hashPin(pin);
    await userRef.update({ pin: hashedPin, pinSetup: true, updatedAt: Timestamp.now() });
  }

  async changePin(userId: string, oldPin: string, newPin: string): Promise<void> {
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error('User not found');

    const user = userDoc.data() as User;
    const { verifyPin } = await import('../utils/pin-hash.js');
    const isValid = await verifyPin(oldPin, user.pin || '');
    if (!isValid) throw new Error('Current PIN is incorrect');

    const hashedPin = await hashPin(newPin);
    await userRef.update({ pin: hashedPin, updatedAt: Timestamp.now() });
  }

  async getProfile(userId: string): Promise<Partial<User>> {
    const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) throw new Error('User not found');
    let data = userDoc.data() as User;
    if (!data.referralCode) {
      const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      await db.collection(USERS_COLLECTION).doc(userId).update({ referralCode, updatedAt: Timestamp.now() });
      data = { ...data, referralCode };
    }
    return sanitizeUserData(data as any) as Partial<User>;
  }

  async updateProfile(userId: string, data: Partial<{ fullName: string; phoneNumber: string }>): Promise<void> {
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error('User not found');

    const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (data.fullName) updateData.fullName = data.fullName;
    if (data.phoneNumber) {
      const existing = await db.collection(USERS_COLLECTION).where('phoneNumber', '==', data.phoneNumber).limit(1).get();
      if (!existing.empty && existing.docs[0].id !== userId) {
        throw new Error('Phone number already in use');
      }
      updateData.phoneNumber = data.phoneNumber;
    }

    await userRef.update(updateData);
  }

  async saveExpoPushToken(userId: string, token: string): Promise<void> {
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      throw new Error('Invalid Expo push token format');
    }
    await db.collection(USERS_COLLECTION).doc(userId).update({
      expoPushToken: token,
      updatedAt: Timestamp.now(),
    });
  }

  async setReferral(userId: string, referralCode: string, method: 'auto' | 'manual'): Promise<void> {
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error('User not found');

    const user = userDoc.data() as User;
    if (user.referredBy) {
      throw new Error('Referral code already set');
    }
    if (user.referralCode === referralCode) {
      throw new Error('Cannot use your own referral code');
    }

    const referrerSnapshot = await db.collection(USERS_COLLECTION).where('referralCode', '==', referralCode).limit(1).get();
    if (referrerSnapshot.empty) {
      throw new Error('Invalid referral code');
    }

    await userRef.update({
      referredBy: referralCode,
      referralMethod: method,
      updatedAt: Timestamp.now(),
    });
  }
}

export const authService = new AuthService();
