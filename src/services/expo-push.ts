import Expo, {
  ExpoPushMessage,
  ExpoPushTicket,
  ExpoPushReceipt,
} from 'expo-server-sdk';
import { db } from '../config/firebase.js';
import { env } from '../config/env.js';
import { fcmWebPushService } from './fcm-web-push.js';

const USERS_COLLECTION = 'users';

/**
 * Extra delivery hints layered onto a push message so it behaves like a
 * native, high-urgency alert instead of a default best-effort notification:
 * a dedicated Android channel (importance/bypass-DND/sound configured
 * client-side), high OS priority, an iOS interruption level that breaks
 * through Focus modes, and an optional category id to attach action buttons
 * registered on the client (e.g. "View order").
 */
export type PushDeliveryOptions = {
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  categoryId?: string;
  interruptionLevel?: 'active' | 'critical' | 'passive' | 'time-sensitive';
  sound?: string | null;
};

/** Delivery profile for time-critical admin alerts (new order placed) — see NotificationContext/notifications.ts on the mobile client for the matching channel + category registration. */
export const ADMIN_CRITICAL_PUSH: PushDeliveryOptions = {
  channelId: 'admin-critical',
  priority: 'high',
  categoryId: 'admin_new_order',
  interruptionLevel: 'time-sensitive',
  sound: 'default',
};

class ExpoPushService {
  private expo: Expo;

  constructor() {
    this.expo = new Expo({
      accessToken: env.expo.accessToken || undefined,
    });
  }

  async getUserPushToken(userId: string): Promise<string | null> {
    try {
      const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
      if (!userDoc.exists) return null;
      const data = userDoc.data();
      return data?.expoPushToken || null;
    } catch {
      return null;
    }
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    options?: PushDeliveryOptions,
  ): Promise<void> {
    // Expo push (mobile)
    const token = await this.getUserPushToken(userId);
    if (token && Expo.isExpoPushToken(token)) {
      await this.sendToToken(token, title, body, data, options);
    }

    // FCM web push (browser)
    void fcmWebPushService.sendToUser(userId, title, body, data);
  }

  async sendToRole(
    role: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    excludeUserId?: string,
    options?: PushDeliveryOptions,
  ): Promise<void> {
    try {
      const snapshot = await db.collection(USERS_COLLECTION)
        .where('role', '==', role)
        .get();

      const messages: ExpoPushMessage[] = [];
      snapshot.forEach(doc => {
        if (excludeUserId && doc.id === excludeUserId) return;
        const userData = doc.data();
        if (userData.expoPushToken && Expo.isExpoPushToken(userData.expoPushToken)) {
          messages.push({
            to: userData.expoPushToken,
            sound: options?.sound ?? 'default',
            title,
            body,
            data: data ?? {},
            ...(options?.channelId ? { channelId: options.channelId } : {}),
            ...(options?.priority ? { priority: options.priority } : {}),
            ...(options?.categoryId ? { categoryId: options.categoryId } : {}),
            ...(options?.interruptionLevel ? { interruptionLevel: options.interruptionLevel } : {}),
          });
        }
      });

      if (messages.length > 0) {
        this.sendBatchAndForget(messages);
      }
    } catch {
      // ignore
    }

    // FCM web push (browser)
    void fcmWebPushService.sendToRole(role, title, body, data, excludeUserId);
  }

  async sendToToken(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    options?: PushDeliveryOptions,
  ): Promise<void> {
    if (!Expo.isExpoPushToken(pushToken)) return;

    const message: ExpoPushMessage = {
      to: pushToken,
      sound: options?.sound ?? 'default',
      title,
      body,
      data: data ?? {},
      ...(options?.channelId ? { channelId: options.channelId } : {}),
      ...(options?.priority ? { priority: options.priority } : {}),
      ...(options?.categoryId ? { categoryId: options.categoryId } : {}),
      ...(options?.interruptionLevel ? { interruptionLevel: options.interruptionLevel } : {}),
    };

    this.sendBatchAndForget([message], pushToken);
  }

  private async sendBatchAndForget(
    messages: ExpoPushMessage[],
    tokenToCleanup?: string,
  ): Promise<void> {
    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch {
        // silently ignore send failures — don't block the main flow
      }
    }

    const receiptIds = tickets
      .filter((t): t is { status: 'ok'; id: string } => t.status === 'ok')
      .map((t) => t.id);

    if (receiptIds.length === 0) return;

    const receiptIdChunks = this.expo.chunkPushNotificationReceiptIds(receiptIds);

    for (const chunk of receiptIdChunks) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
        void this.handleReceipts(receipts, tokenToCleanup);
      } catch {
        // silently ignore receipt fetch failures
      }
    }
  }

  private async handleReceipts(
    receipts: { [id: string]: ExpoPushReceipt },
    tokenToCleanup?: string,
  ): Promise<void> {
    for (const [_receiptId, receipt] of Object.entries(receipts)) {
      if (receipt.status !== 'error') continue;

      if (receipt.details?.error === 'DeviceNotRegistered') {
        const invalidToken = receipt.details?.expoPushToken || tokenToCleanup;
        if (invalidToken) {
          await this.removeInvalidToken(invalidToken);
        }
      }
    }
  }

  private async removeInvalidToken(token: string): Promise<void> {
    try {
      const snapshot = await db.collection(USERS_COLLECTION)
        .where('expoPushToken', '==', token)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        await snapshot.docs[0].ref.update({
          expoPushToken: null,
          updatedAt: new Date(),
        });
      }
    } catch {
      // silently ignore cleanup failures
    }
  }
}

export const expoPushService = new ExpoPushService();
