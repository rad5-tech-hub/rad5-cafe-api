import admin from 'firebase-admin';
import { db, FieldValue, Timestamp } from '../config/firebase.js';

const USERS_COLLECTION = 'users';

class FcmWebPushService {
  /**
   * Save an FCM web push token for a user.
   * Tokens are stored as an array to support multiple browser sessions.
   */
  async saveToken(userId: string, token: string): Promise<void> {
    if (!token || typeof token !== 'string' || token.length < 20) {
      throw new Error('Invalid FCM web push token');
    }

    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error('User not found');

    const data = userDoc.data();
    const existing: string[] = data?.fcmWebTokens ?? [];

    // Don't add duplicates
    if (existing.includes(token)) return;

    await userRef.update({
      fcmWebTokens: FieldValue.arrayUnion(token),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Remove an FCM web push token (e.g. on logout or invalid token).
   */
  async removeToken(userId: string, token: string): Promise<void> {
    await db.collection(USERS_COLLECTION).doc(userId).update({
      fcmWebTokens: FieldValue.arrayRemove(token),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Send a push notification to a user's web browsers via FCM.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
      if (!userDoc.exists) return;

      const tokens: string[] = userDoc.data()?.fcmWebTokens ?? [];
      if (tokens.length === 0) return;

      await this.sendToTokens(tokens, title, body, data, userId);
    } catch (error) {
      console.error('[FCM Web Push] sendToUser failed:', error);
    }
  }

  /**
   * Send a push notification to all users with a given role via FCM.
   */
  async sendToRole(
    role: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const snapshot = await db.collection(USERS_COLLECTION)
        .where('role', '==', role)
        .get();

      const allTokens: { token: string; userId: string }[] = [];
      snapshot.forEach(doc => {
        const userData = doc.data();
        const tokens: string[] = userData?.fcmWebTokens ?? [];
        tokens.forEach(t => allTokens.push({ token: t, userId: doc.id }));
      });

      if (allTokens.length === 0) return;

      await this.sendToTokens(
        allTokens.map(t => t.token),
        title,
        body,
        data,
      );
    } catch (error) {
      console.error('[FCM Web Push] sendToRole failed:', error);
    }
  }

  /**
   * Send FCM messages to a batch of tokens.
   */
  private async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
    userId?: string,
  ): Promise<void> {
    // Convert all data values to strings (FCM requirement)
    const stringData: Record<string, string> = {};
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        stringData[key] = String(value);
      }
    }

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      data: stringData,
      webpush: {
        notification: {
          title,
          body,
          icon: '/RAD5 Cafe.svg',
          badge: '/RAD5 Cafe.svg',
        },
        fcmOptions: {
          link: 'https://rad5cafe.vercel.app/notifications',
        },
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);

      // Clean up invalid tokens
      if (response.failureCount > 0 && userId) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const code = resp.error?.code;
            if (
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(tokens[idx]);
            }
          }
        });

        // Remove invalid tokens from the user's record
        for (const token of invalidTokens) {
          await this.removeInvalidToken(token);
        }
      }
    } catch (error) {
      console.error('[FCM Web Push] Multicast send failed:', error);
    }
  }

  /**
   * Remove an invalid token from whichever user has it.
   */
  private async removeInvalidToken(token: string): Promise<void> {
    try {
      const snapshot = await db.collection(USERS_COLLECTION)
        .where('fcmWebTokens', 'array-contains', token)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        await snapshot.docs[0].ref.update({
          fcmWebTokens: FieldValue.arrayRemove(token),
          updatedAt: Timestamp.now(),
        });
      }
    } catch {
      // silently ignore cleanup failures
    }
  }
}

export const fcmWebPushService = new FcmWebPushService();
