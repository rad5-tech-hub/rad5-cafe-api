import { db, Timestamp } from '../config/firebase';
import { User } from '../types';
import { hashPin } from '../utils/pin-hash';
import { sanitizeUserData } from '../utils/helpers';

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
    const { verifyPin } = await import('../utils/pin-hash');
    const isValid = await verifyPin(oldPin, user.pin || '');
    if (!isValid) throw new Error('Current PIN is incorrect');

    const hashedPin = await hashPin(newPin);
    await userRef.update({ pin: hashedPin, updatedAt: Timestamp.now() });
  }

  async getProfile(userId: string): Promise<Partial<User>> {
    const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) throw new Error('User not found');
    return sanitizeUserData({ id: userDoc.id, ...userDoc.data() }) as Partial<User>;
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
}

export const authService = new AuthService();
