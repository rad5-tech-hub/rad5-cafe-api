import { db, Timestamp } from '../config/firebase.js';
import crypto from 'crypto';
import { User, PinChangeRequest } from '../types/index.js';
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
    
    // Remove token from other users
    const existingSnapshot = await db.collection(USERS_COLLECTION).where('expoPushToken', '==', token).get();
    const batch = db.batch();
    
    existingSnapshot.docs.forEach(doc => {
      if (doc.id !== userId) {
        batch.update(doc.ref, { expoPushToken: null, updatedAt: Timestamp.now() });
      }
    });

    batch.update(db.collection(USERS_COLLECTION).doc(userId), {
      expoPushToken: token,
      updatedAt: Timestamp.now(),
    });
    
    await batch.commit();
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

  async requestPinChange(userId: string, newPin: string): Promise<void> {
    if (!/^\d{4}$/.test(newPin)) throw new Error('PIN must be exactly 4 digits');

    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error('User not found');
    const user = userDoc.data() as User;

    // Check if there is an existing PENDING request
    const pendingSnapshot = await db.collection('pin_change_requests')
      .where('userId', '==', userId)
      .where('status', '==', 'PENDING')
      .limit(1)
      .get();

    const hashedPin = await hashPin(newPin);

    if (!pendingSnapshot.empty) {
      const reqRef = pendingSnapshot.docs[0].ref;
      await reqRef.update({
        preferredPin: hashedPin,
        requestedAt: Timestamp.now(),
      });
    } else {
      const reqRef = db.collection('pin_change_requests').doc();
      await reqRef.set({
        userId,
        uid: user.uid,
        email: user.email,
        fullName: user.fullName || '',
        preferredPin: hashedPin,
        status: 'PENDING',
        requestedAt: Timestamp.now(),
      });
    }
  }

  async getLatestPinChangeRequest(userId: string): Promise<Partial<PinChangeRequest> | null> {
    const snapshot = await db.collection('pin_change_requests')
      .where('userId', '==', userId)
      .orderBy('requestedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    const data = doc.data() as PinChangeRequest;
    const { preferredPin, id, ...safeData } = data;
    return { id: doc.id, ...safeData };
  }

  async getPinChangeRequests(status?: string, page: number = 1, limit: number = 20): Promise<{ requests: Partial<PinChangeRequest>[]; total: number }> {
    let query: FirebaseFirestore.Query = db.collection('pin_change_requests');
    if (status) {
      query = query.where('status', '==', status);
    }
    query = query.orderBy('requestedAt', 'desc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    const requests = snapshot.docs.map(doc => {
      const data = doc.data() as PinChangeRequest;
      const { preferredPin, id, ...safeData } = data;
      return { id: doc.id, ...safeData };
    });

    return { requests, total };
  }

  async approvePinChangeRequest(requestId: string, adminUserId: string, pinConfirm: string): Promise<{ userId: string }> {
    const reqRef = db.collection('pin_change_requests').doc(requestId);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists) throw new Error('PIN change request not found');

    const request = reqDoc.data() as PinChangeRequest;
    if (request.status !== 'PENDING') {
      throw new Error(`Request is already ${request.status.toLowerCase()}`);
    }

    const { verifyPin } = await import('../utils/pin-hash.js');
    const isMatch = await verifyPin(pinConfirm, request.preferredPin);
    if (!isMatch) {
      throw new Error("The entered PIN does not match the user's preferred PIN");
    }

    const userRef = db.collection(USERS_COLLECTION).doc(request.userId);

    await db.runTransaction(async (transaction) => {
      transaction.update(userRef, {
        pin: request.preferredPin,
        pinSetup: true,
        updatedAt: Timestamp.now(),
      });
      transaction.update(reqRef, {
        status: 'APPROVED',
        approvedBy: adminUserId,
        approvedAt: Timestamp.now(),
      });
    });

    try {
      const { expoPushService } = await import('./expo-push.js');
      const { notificationService } = await import('./notifications.js');

      void expoPushService.sendToUser(
        request.userId,
        'PIN Changed Successfully',
        'Your request for PIN change has been approved and updated.',
        { type: 'pin_changed' }
      );

      void notificationService.createUserNotification({
        userId: request.userId,
        type: 'info',
        title: 'PIN Changed Successfully',
        body: 'Your request for PIN change has been approved and updated.',
      });
    } catch (err) {
      console.warn('Failed to send pin change notification:', err);
    }

    return { userId: request.userId };
  }

  async rejectPinChangeRequest(requestId: string, adminUserId: string, reason?: string): Promise<{ userId: string }> {
    const reqRef = db.collection('pin_change_requests').doc(requestId);
    const reqDoc = await reqRef.get();
    if (!reqDoc.exists) throw new Error('PIN change request not found');

    const request = reqDoc.data() as PinChangeRequest;
    if (request.status !== 'PENDING') {
      throw new Error(`Request is already ${request.status.toLowerCase()}`);
    }

    await reqRef.update({
      status: 'REJECTED',
      rejectedBy: adminUserId,
      rejectedAt: Timestamp.now(),
      rejectReason: reason || '',
    });

    try {
      const { expoPushService } = await import('./expo-push.js');
      const { notificationService } = await import('./notifications.js');

      const bodyText = reason 
        ? `Your request for PIN change was rejected by admin. Reason: ${reason}`
        : 'Your request for PIN change was rejected by admin.';

      void expoPushService.sendToUser(
        request.userId,
        'PIN Change Request Rejected',
        bodyText,
        { type: 'pin_change_rejected' }
      );

      void notificationService.createUserNotification({
        userId: request.userId,
        type: 'info',
        title: 'PIN Change Request Rejected',
        body: bodyText,
      });
    } catch (err) {
      console.warn('Failed to send pin change rejection notification:', err);
    }

    return { userId: request.userId };
  }
}

export const authService = new AuthService();
