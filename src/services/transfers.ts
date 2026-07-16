import { db, Timestamp, FieldValue } from '../config/firebase.js';
import { User, Wallet } from '../types/index.js';
import { generateReference } from '../utils/helpers.js';
import { expoPushService } from './expo-push.js';
import { notificationService } from './notifications.js';

const TRANSFERS_COLLECTION = 'transfers';
const TRANSACTIONS_COLLECTION = 'transactions';
const WALLETS_COLLECTION = 'wallets';
const USERS_COLLECTION = 'users';

export class TransferService {
  async transfer(
    senderUserId: string,
    senderWalletId: string,
    recipientWalletId: string,
    amount: number,
    description: string = ''
  ): Promise<{ transferId: string; senderBalance: number }> {
    if (senderWalletId === recipientWalletId) {
      throw new Error('Cannot transfer to yourself');
    }

    if (amount <= 0) {
      throw new Error('Invalid transfer amount');
    }

    const senderWalletSnapshot = await db.collection(WALLETS_COLLECTION)
      .where('walletId', '==', senderWalletId).limit(1).get();
    if (senderWalletSnapshot.empty) throw new Error('Sender wallet not found');
    const senderWalletDoc = senderWalletSnapshot.docs[0];
    const senderWallet = { id: senderWalletDoc.id, ...senderWalletDoc.data() } as Wallet & { userId: string };

    const recipientWalletSnapshot = await db.collection(WALLETS_COLLECTION)
      .where('walletId', '==', recipientWalletId).limit(1).get();
    if (recipientWalletSnapshot.empty) throw new Error('Recipient wallet not found');
    const recipientWalletDoc = recipientWalletSnapshot.docs[0];
    const recipientWallet = { id: recipientWalletDoc.id, ...recipientWalletDoc.data() } as Wallet & { userId: string };

    if (senderWallet.balance < amount) {
      throw new Error('Insufficient balance');
    }

    const fee = 0;
    const netAmount = amount - fee;
    const reference = generateReference('TRF');

    const transferRef = db.collection(TRANSFERS_COLLECTION).doc();
    const senderTxnRef = db.collection(TRANSACTIONS_COLLECTION).doc();
    const recipientTxnRef = db.collection(TRANSACTIONS_COLLECTION).doc();

    await db.runTransaction(async (transaction) => {
      const senderDoc = await transaction.get(senderWalletDoc.ref);
      const currentSenderBalance = (senderDoc.data()?.balance || 0) as number;
      const currentSenderTotalSpent = (senderDoc.data()?.totalSpent || 0) as number;
      if (currentSenderBalance < amount) {
        throw new Error('Insufficient balance');
      }

      const recipientDoc = await transaction.get(recipientWalletDoc.ref);
      if (!recipientDoc.exists) throw new Error('Recipient wallet not found');
      const currentRecipientBalance = (recipientDoc.data()?.balance || 0) as number;

      transaction.set(transferRef, {
        senderWalletId,
        senderUserId,
        recipientWalletId,
        recipientUserId: recipientWallet.userId,
        amount,
        fee,
        description: description || `Transfer to ${recipientWalletId}`,
        status: 'completed',
        reference,
        createdAt: Timestamp.now(),
      });

      transaction.set(senderTxnRef, {
        walletId: senderWalletId,
        userId: senderUserId,
        type: 'transfer_sent',
        amount: -amount,
        fee,
        reference: `${reference}-S`,
        description: description || `Transfer to ${recipientWalletId}`,
        status: 'completed',
        paymentMethod: 'wallet',
        metadata: { recipientWalletId, transferId: transferRef.id },
        createdAt: Timestamp.now(),
      });

      transaction.set(recipientTxnRef, {
        walletId: recipientWalletId,
        userId: recipientWallet.userId,
        type: 'transfer_received',
        amount: netAmount,
        fee: 0,
        reference: `${reference}-R`,
        description: `Transfer from ${senderWalletId}`,
        status: 'completed',
        paymentMethod: 'wallet',
        metadata: { senderWalletId, transferId: transferRef.id },
        createdAt: Timestamp.now(),
      });

      const newSenderBalance = Math.round((currentSenderBalance - amount + Number.EPSILON) * 100) / 100;
      const newSenderTotalSpent = Math.round((currentSenderTotalSpent + amount + Number.EPSILON) * 100) / 100;

      const newRecipientBalance = Math.round((currentRecipientBalance + netAmount + Number.EPSILON) * 100) / 100;

      transaction.update(senderWalletDoc.ref, {
        balance: newSenderBalance,
        totalSpent: newSenderTotalSpent,
        updatedAt: Timestamp.now(),
      });

      transaction.update(recipientWalletDoc.ref, {
        balance: newRecipientBalance,
        updatedAt: Timestamp.now(),
      });
    });

    void expoPushService.sendToUser(
      senderUserId,
      'Transfer Sent',
      `You sent ₦${amount.toLocaleString()} to ${recipientWalletId}`,
      { type: 'transfer_sent', amount, recipientWalletId },
    );

    void expoPushService.sendToUser(
      recipientWallet.userId,
      'Transfer Received',
      `You received ₦${amount.toLocaleString()} from ${senderWalletId}`,
      { type: 'transfer_received', amount, senderWalletId },
    );

    void notificationService.createUserNotification({
      userId: senderUserId,
      type: 'transfer_sent',
      title: 'Transfer Sent',
      body: `You sent ₦${amount.toLocaleString()} to ${recipientWalletId}`,
      data: { type: 'transfer_sent', amount, recipientWalletId },
    });

    void notificationService.createUserNotification({
      userId: recipientWallet.userId,
      type: 'transfer_received',
      title: 'Transfer Received',
      body: `You received ₦${amount.toLocaleString()} from ${senderWalletId}`,
      data: { type: 'transfer_received', amount, senderWalletId },
    });

    return { transferId: transferRef.id, senderBalance: senderWallet.balance - amount };
  }

  async validateRecipient(walletId: string): Promise<{ valid: boolean; name?: string }> {
    const snapshot = await db.collection(WALLETS_COLLECTION)
      .where('walletId', '==', walletId).limit(1).get();
    if (snapshot.empty) return { valid: false };

    const wallet = snapshot.docs[0].data() as Wallet;
    const userDoc = await db.collection(USERS_COLLECTION).doc(wallet.userId).get();
    if (!userDoc.exists) return { valid: false };

    const user = userDoc.data() as User;
    return { valid: true, name: user.fullName };
  }

  async getTransferHistory(userId: string, page: number = 1, limit: number = 20) {
    const walletSnapshot = await db.collection(WALLETS_COLLECTION)
      .where('userId', '==', userId).limit(1).get();
    if (walletSnapshot.empty) return { transfers: [], total: 0 };
    const wallet = walletSnapshot.docs[0].data() as Wallet;

    const query = db.collection(TRANSFERS_COLLECTION)
      .where('senderWalletId', '==', wallet.walletId)
      .orderBy('createdAt', 'desc');

    const totalSnapshot = await query.count().get();
    const total = totalSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    const transfers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return { transfers, total };
  }
}

export const transferService = new TransferService();
