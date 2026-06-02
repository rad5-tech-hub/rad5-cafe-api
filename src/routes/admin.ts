import { Router, Request, Response } from 'express';
import { reportService } from '../services/reports';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { db } from '../config/firebase';
import { Transaction, User } from '../types';

const USERS_COLLECTION = 'users';

const router = Router();

function str(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function num(val: unknown, defaultVal: number = 1): number {
  const n = parseInt(str(val), 10);
  return isNaN(n) ? defaultVal : n;
}

router.get('/sales', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const startDate = req.query.start ? new Date(str(req.query.start)) : undefined;
    const endDate = req.query.end ? new Date(str(req.query.end)) : undefined;
    const buffer = await reportService.generateSalesReport(startDate, endDate);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/inventory', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const buffer = await reportService.generateInventoryReport();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=inventory-report-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/profit', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const startDate = req.query.start ? new Date(str(req.query.start)) : undefined;
    const endDate = req.query.end ? new Date(str(req.query.end)) : undefined;
    const buffer = await reportService.generateProfitReport(startDate, endDate);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=profit-report-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/transactions', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = str(req.query.userId) || undefined;
    const buffer = await reportService.generateCustomerTransactionsReport(userId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=transactions-report-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/users', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 20);
    const snapshot = await db.collection(USERS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)
      .get();
    const users = snapshot.docs.map(doc => {
      const data = doc.data() as Record<string, unknown>;
      const { password, pin, id: _id, ...safe } = data;
      return { id: doc.id, ...safe };
    });
    const totalSnapshot = await db.collection(USERS_COLLECTION).count().get();
    const total = totalSnapshot.data().count;
    res.json({ success: true, data: users, total, page, limit });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/users/:id/toggle-status', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userRef = db.collection(USERS_COLLECTION).doc(req.params.id as string);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    const user = userDoc.data() as User;
    await userRef.update({ isActive: !user.isActive });
    res.json({ success: true, message: `User ${user.isActive ? 'deactivated' : 'activated'}` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
