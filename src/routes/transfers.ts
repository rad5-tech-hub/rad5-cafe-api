import { Router, Request, Response } from 'express';
import { transferService } from '../services/transfers.js';
import { authenticate } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { User } from '../types/index.js';
import { verifyPin } from '../utils/pin-hash.js';

const USERS_COLLECTION = 'users';

const router = Router();

router.post('/send', authenticate, async (req: Request, res: Response) => {
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
      amount,
      description
    );

    res.json({ success: true, message: 'Transfer successful', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/validate', authenticate, async (req: Request, res: Response) => {
  try {
    const { walletId } = req.body;
    if (!walletId) {
      res.status(400).json({ success: false, message: 'Wallet ID required' });
      return;
    }
    const result = await transferService.validateRecipient(walletId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/history', authenticate, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await transferService.getTransferHistory(req.user!.userId, page, limit);
    res.json({ success: true, transfers: result.transfers, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
