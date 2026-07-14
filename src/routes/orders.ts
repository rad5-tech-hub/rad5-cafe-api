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
    const { items, pin, paymentMethod, customerName, source } = req.body;
    const method = paymentMethod === 'cash' ? 'cash' : 'wallet';
    const reqSource = source || req.headers['x-source'] || 'web';

    if (!items || (method === 'wallet' && !pin)) {
      res.status(400).json({ success: false, message: 'Items and PIN are required for wallet payments' });
      return;
    }
    if (method === 'cash' && !customerName) {
      res.status(400).json({ success: false, message: 'Customer name is required for cash payments' });
      return;
    }
    const result = await orderService.createOrder(req.user!.userId, items, pin || '', method, customerName, reqSource as 'web' | 'mobile');
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
    res.json({ success: true, orders: result.orders, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
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

router.post('/batch', authenticate, async (req: Request, res: Response) => {
  try {
    const { orders } = req.body;
    if (!orders || !Array.isArray(orders)) {
      res.status(400).json({ success: false, message: 'Orders array is required' });
      return;
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < orders.length; i++) {
      const { items, pin, paymentMethod, customerName, source } = orders[i];
      const method = paymentMethod === 'cash' ? 'cash' : 'wallet';
      const reqSource = source || req.headers['x-source'] || 'web';

      if (!items || (method === 'wallet' && !pin)) {
        errors.push({ index: i, message: 'Items and PIN are required for wallet payments' });
        continue;
      }
      if (method === 'cash' && !customerName) {
        errors.push({ index: i, message: 'Customer name is required for cash payments' });
        continue;
      }

      try {
        const result = await orderService.createOrder(req.user!.userId, items, pin || '', method, customerName, reqSource as 'web' | 'mobile');
        results.push(result);
      } catch (err: any) {
        errors.push({ index: i, message: err.message });
      }
    }

    res.status(201).json({ success: true, message: 'Batch processing completed', data: { results, errors } });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
