import { Router, Request, Response } from 'express';
import { walletService } from '../services/wallet';
import { authenticate } from '../middleware/auth';

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
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/transactions/all', authenticate, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await walletService.getTransactions(req.user!.userId, undefined, page, limit);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
