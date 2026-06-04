import { Router, Request, Response } from 'express';
import { analyticsService } from '../services/analytics.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();

router.get('/dashboard', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await analyticsService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/revenue', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as 'daily' | 'weekly' | 'monthly') || 'daily';
    const limit = parseInt(req.query.limit as string) || 30;
    const data = await analyticsService.getRevenueAnalytics(period, limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/top-products', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await analyticsService.getTopProducts(limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/customers', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await analyticsService.getCustomerInsights(limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/profit', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const data = await analyticsService.getProfitAnalytics();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
