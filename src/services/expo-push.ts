import Expo, {
  ExpoPushMessage,
  ExpoPushTicket,
  ExpoPushReceipt,
} from 'expo-server-sdk';
import { db } from '../config/firebase';
import { env } from '../config/env';

const USERS_COLLECTION = 'users';

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
  ): Promise<void> {
    const token = await this.getUserPushToken(userId);
    if (!token || !Expo.isExpoPushToken(token)) return;

    await this.sendToToken(token, title, body, data);
  }

  async sendToToken(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (!Expo.isExpoPushToken(pushToken)) return;

    const message: ExpoPushMessage = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: data ?? {},
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
