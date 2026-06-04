import { Router, Request, Response } from 'express';
import { orderService } from '../services/orders.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

function str(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function num(val: unknown, defaultVal: number = 1): number {
  const n = parseInt(str(val), 10);
  return isNaN(n) ? defaultVal : n;
}

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { items, pin } = req.body;
    if (!items || !pin) {
      res.status(400).json({ success: false, message: 'Items and PIN are required' });
      return;
    }
    const result = await orderService.createOrder(req.user!.userId, items, pin);
    res.status(201).json({ success: true, message: 'Purchase successful', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 20);
    const result = await orderService.getOrders(req.user!.userId, page, limit);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/receipt/:orderId', authenticate, async (req: Request, res: Response) => {
  try {
    const receipt = await orderService.getReceipt(req.params.orderId as string);
    if (!receipt) {
      res.status(404).json({ success: false, message: 'Receipt not found' });
      return;
    }
    res.json({ success: true, data: receipt });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/receipt-by-number/:receiptNumber', authenticate, async (req: Request, res: Response) => {
  try {
    const receipt = await orderService.getReceiptByNumber(req.params.receiptNumber as string);
    if (!receipt) {
      res.status(404).json({ success: false, message: 'Receipt not found' });
      return;
    }
    res.json({ success: true, data: receipt });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
