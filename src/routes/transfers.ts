import { Router, Request, Response } from 'express';
import { transferService } from '../services/transfers.js';
import { authenticate } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { User } from '../types/index.js';

const USERS_COLLECTION = 'users';

const router = Router();

router.post('/send', authenticate, async (req: Request, res: Response) => {
  try {
    const { recipientWalletId, amount, description } = req.body;
    if (!recipientWalletId || !amount) {
      res.status(400).json({ success: false, message: 'Recipient wallet and amount are required' });
      return;
    }

    const userDoc = await db.collection(USERS_COLLECTION).doc(req.user!.userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    const user = userDoc.data() as User;

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
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
