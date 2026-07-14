import { Router, Request, Response } from 'express';
import { walletService } from '../services/wallet.js';
import { transferService } from '../services/transfers.js';
import { authenticate } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { User } from '../types/index.js';
import { verifyPin } from '../utils/pin-hash.js';

const USERS_COLLECTION = 'users';

const router = Router();

router.get('/balance', authenticate, async (req: Request, res: Response) => {
  try {
    const wallet = await walletService.getWallet(req.user!.userId);
    res.json({ success: true, data: { balance: wallet.balance, walletId: wallet.walletId } });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/info', authenticate, async (req: Request, res: Response) => {
  try {
    const wallet = await walletService.getWallet(req.user!.userId);
    res.json({ success: true, data: wallet });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/rewards/total', authenticate, async (req: Request, res: Response) => {
  try {
    const total = await walletService.getTotalRewards(req.user!.userId);
    res.json({ success: true, data: { total } });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/rewards/history', authenticate, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await walletService.getRewardHistory(req.user!.userId, page, limit);
    res.json({ success: true, rewards: result.rewards, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/fund/initialize', authenticate, async (req: Request, res: Response) => {
  try {
    const { amount, provider } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, message: 'Invalid amount' });
      return;
    }
    if (!['paystack', 'flutterwave'].includes(provider)) {
      res.status(400).json({ success: false, message: 'Invalid payment provider' });
      return;
    }
    const result = await walletService.createPaymentIntent(req.user!.userId, amount, provider);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/fund/verify', authenticate, async (req: Request, res: Response) => {
  try {
    const { reference, provider } = req.body;
    if (!reference || !provider) {
      res.status(400).json({ success: false, message: 'Reference and provider required' });
      return;
    }
    const txn = await walletService.verifyPayment(reference, provider);
    res.json({ success: true, message: 'Payment verified', data: txn });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/transactions', authenticate, async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await walletService.getTransactions(req.user!.userId, type, page, limit);
    res.json({ success: true, transactions: result.transactions, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/transactions/all', authenticate, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await walletService.getTransactions(req.user!.userId, undefined, page, limit);
    res.json({ success: true, transactions: result.transactions, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/transfer', authenticate, async (req: Request, res: Response) => {
  try {
    const { recipientWalletId, amount, description, pin } = req.body;
    if (!recipientWalletId || !amount || !pin) {
      res.status(400).json({ success: false, message: 'Recipient wallet, amount and transaction PIN are required' });
      return;
    }

    const userDoc = await db.collection(USERS_COLLECTION).doc(req.user!.userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    const user = userDoc.data() as User;

    if (!user.pinSetup || !user.pin) {
      res.status(400).json({ success: false, message: 'Transaction PIN is not set up. Please set up your PIN first.' });
      return;
    }

    const pinValid = await verifyPin(pin, user.pin);
    if (!pinValid) {
      res.status(400).json({ success: false, message: 'Invalid transaction PIN' });
      return;
    }

    const result = await transferService.transfer(
      req.user!.userId,
      user.walletId,
      recipientWalletId,
      Number(amount),
      description
    );

    res.json({ success: true, message: 'Transfer successful', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
