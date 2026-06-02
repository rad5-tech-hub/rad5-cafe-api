import { db, Timestamp, FieldValue } from '../config/firebase';
import { env } from '../config/env';
import { Wallet, Transaction } from '../types';
import { generateReference } from '../utils/helpers';

const WALLETS_COLLECTION = 'wallets';
const TRANSACTIONS_COLLECTION = 'transactions';

export class WalletService {
  async getWallet(userId: string): Promise<Wallet> {
    const snapshot = await db.collection(WALLETS_COLLECTION).where('userId', '==', userId).limit(1).get();
    if (snapshot.empty) {
      throw new Error('Wallet not found');
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Wallet;
  }

  async getWalletByWalletId(walletId: string): Promise<Wallet & { userId: string }> {
    const snapshot = await db.collection(WALLETS_COLLECTION).where('walletId', '==', walletId).limit(1).get();
    if (snapshot.empty) {
      throw new Error('Wallet not found');
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Wallet & { userId: string };
  }

  async fundWallet(userId: string, amount: number, paymentMethod: 'paystack' | 'flutterwave', reference?: string): Promise<Transaction> {
    const wallet = await this.getWallet(userId);
    const txnRef = reference || generateReference('FND');

    const txnData = {
      walletId: wallet.walletId,
      userId,
      type: 'funding' as const,
      amount,
      fee: 0,
      reference: txnRef,
      description: `Wallet funding via ${paymentMethod}`,
      status: 'completed' as const,
      paymentMethod,
      metadata: { paymentReference: txnRef },
      createdAt: Timestamp.now(),
    };

    const txnRef_doc = db.collection(TRANSACTIONS_COLLECTION).doc();
    const walletRef = db.collection(WALLETS_COLLECTION).doc(wallet.id);

    await db.runTransaction(async (transaction) => {
      transaction.set(txnRef_doc, txnData);
      transaction.update(walletRef, {
        balance: FieldValue.increment(amount),
        totalFunded: FieldValue.increment(amount),
        updatedAt: Timestamp.now(),
      });
    });

    return { id: txnRef_doc.id, ...txnData } as Transaction;
  }

  async createPaymentIntent(userId: string, amount: number, provider: 'paystack' | 'flutterwave'): Promise<{ authorizationUrl: string; reference: string }> {
    const reference = generateReference('PAY');
    const wallet = await this.getWallet(userId);

    await db.collection(TRANSACTIONS_COLLECTION).add({
      walletId: wallet.walletId,
      userId,
      type: 'funding',
      amount,
      fee: 0,
      reference,
      description: `Pending wallet funding via ${provider}`,
      status: 'pending',
      paymentMethod: provider,
      metadata: { provider, authorizationUrl: '' },
      createdAt: Timestamp.now(),
    } as unknown as Partial<Transaction>);

    if (provider === 'paystack') {
      const url = `https://api.paystack.co/transaction/initialize`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.paystack.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: '',
          amount: amount * 100,
          reference,
          callback_url: `${env.app.corsOrigin}/wallet/funding/callback`,
        }),
      });
      const result = await response.json() as { data?: { authorization_url: string }; status: boolean; message: string };
      if (!result.status) throw new Error(result.message || 'Paystack initialization failed');

      await db.collection(TRANSACTIONS_COLLECTION).doc(reference).update({
        'metadata.authorizationUrl': result.data?.authorization_url,
      });

      return { authorizationUrl: result.data?.authorization_url || '', reference };
    }

    if (provider === 'flutterwave') {
      const url = `https://api.flutterwave.com/v3/payments`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.flutterwave.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tx_ref: reference,
          amount,
          currency: 'NGN',
          redirect_url: `${env.app.corsOrigin}/wallet/funding/callback`,
          customer: { email: '' },
          customizations: { title: env.app.name, description: 'Wallet Funding' },
        }),
      });
      const result = await response.json() as { data?: { link: string }; status: string; message: string };
      if (result.status !== 'success') throw new Error(result.message || 'Flutterwave initialization failed');

      await db.collection(TRANSACTIONS_COLLECTION).doc(reference).update({
        'metadata.authorizationUrl': result.data?.link,
      });

      return { authorizationUrl: result.data?.link || '', reference };
    }

    throw new Error('Invalid payment provider');
  }

  async verifyPayment(reference: string, provider: 'paystack' | 'flutterwave'): Promise<Transaction> {
    const txnSnapshot = await db.collection(TRANSACTIONS_COLLECTION).where('reference', '==', reference).limit(1).get();
    if (txnSnapshot.empty) throw new Error('Transaction not found');

    const txnDoc = txnSnapshot.docs[0];
    const txn = { id: txnDoc.id, ...txnDoc.data() } as Transaction;

    if (txn.status === 'completed') return txn;

    let verified = false;

    if (provider === 'paystack') {
      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
      });
      const result = await response.json() as { status: boolean; data?: { status: string } };
      verified = result.status && result.data?.status === 'success';
    } else if (provider === 'flutterwave') {
      const response = await fetch(`https://api.flutterwave.com/v3/transactions/${reference}/verify`, {
        headers: { Authorization: `Bearer ${env.flutterwave.secretKey}` },
      });
      const result = await response.json() as { status: string; data?: { status: string } };
      verified = result.status === 'success' && result.data?.status === 'successful';
    }

    if (!verified) throw new Error('Payment verification failed');

    await txnDoc.ref.update({ status: 'completed', 'metadata.verifiedAt': Timestamp.now() });

    const wallet = await this.getWalletByWalletId(txn.walletId);
    const walletRef = db.collection(WALLETS_COLLECTION).doc(wallet.id);
    await walletRef.update({
      balance: FieldValue.increment(txn.amount),
      totalFunded: FieldValue.increment(txn.amount),
      updatedAt: Timestamp.now(),
    });

    return { ...txn, status: 'completed' };
  }

  async getTransactions(userId: string, type?: string, page: number = 1, limit: number = 20): Promise<{ transactions: Transaction[]; total: number }> {
    const wallet = await this.getWallet(userId);
    let query = db.collection(TRANSACTIONS_COLLECTION)
      .where('walletId', '==', wallet.walletId)
      .orderBy('createdAt', 'desc') as FirebaseFirestore.Query;

    if (type && type !== 'all') {
      query = query.where('type', '==', type);
    }

    const totalSnapshot = await query.count().get();
    const total = totalSnapshot.data().count;

    const snapshot = await query
      .offset((page - 1) * limit)
      .limit(limit)
      .get();

    const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
    return { transactions, total };
  }
}

export const walletService = new WalletService();
