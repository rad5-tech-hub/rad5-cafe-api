import { Router, Request, Response } from 'express';
import { reportService } from '../services/reports.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { db } from '../config/firebase.js';
import { Transaction, User } from '../types/index.js';
import { promoteToAdmin, demoteFromAdmin } from '../utils/firebase-custom-claims.js';
import { notificationService } from '../services/notifications.js';
import { orderService } from '../services/orders.js';

const USERS_COLLECTION = 'users';

const router = Router();

function str(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function num(val: unknown, defaultVal: number = 1): number {
  const n = parseInt(str(val), 10);
  return isNaN(n) ? defaultVal : n;
}

function logAudit(userId: string, action: string, resource: string, resourceId: string, details: Record<string, unknown>, req: Request): void {
  void notificationService.logAudit({
    userId,
    action,
    resource,
    resourceId,
    details,
    ip: req.ip || '',
  });
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
      const { password, pin, id: _id, fullName, email, ...safe } = data;
      const displayName = (fullName as string)?.trim() || (email as string)?.split('@')[0] || 'Unknown User';
      return { id: doc.id, fullName: displayName, email, ...safe };
    });
    const totalSnapshot = await db.collection(USERS_COLLECTION).count().get();
    const total = totalSnapshot.data().count;
    res.json({ success: true, data: users, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/users/:id/payment-logs', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id as string;
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 50);
    const result = await notificationService.getUserAuditLogs(userId, 'payment_finalized', page, limit);
    res.json({ success: true, logs: result.logs, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
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
    
    logAudit(req.user!.userId, 'toggle_user_status', 'users', req.params.id as string, { isActive: !user.isActive }, req);

    res.json({ success: true, message: `User ${user.isActive ? 'deactivated' : 'activated'}` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/users/:id/role', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!role || !['admin', 'customer'].includes(role)) {
      res.status(400).json({ success: false, message: 'Valid role is required (admin or customer)' });
      return;
    }

    const userRef = db.collection(USERS_COLLECTION).doc(req.params.id as string);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const user = userDoc.data() as User;

    if (user.role === role) {
      res.status(400).json({ success: false, message: `User already has role: ${role}` });
      return;
    }

    const firebaseUid = user.firebaseUid || userDoc.id;
    if (firebaseUid === 'admin-super') {
      res.status(400).json({ success: false, message: 'Superadmin role cannot be changed via this endpoint' });
      return;
    }

    if (role === 'admin') {
      await promoteToAdmin(firebaseUid);
    } else {
      await demoteFromAdmin(firebaseUid);
    }

    logAudit(req.user!.userId, 'change_user_role', 'users', req.params.id as string, { newRole: role }, req);

    res.json({ success: true, message: `User role updated to ${role}` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/orders/limbo', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 20);
    const result = await orderService.getLimboOrders(page, limit);
    res.json({ success: true, orders: result.orders, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/orders/:orderId/reconcile', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { customerUserId } = req.body;
    if (!customerUserId) {
      res.status(400).json({ success: false, message: 'customerUserId is required' });
      return;
    }
    const result = await orderService.reconcileLimboOrder(req.params.orderId as string, req.user!.userId, customerUserId);

    logAudit(req.user!.userId, 'reconcile_cash_order', 'orders', req.params.orderId as string, { customerUserId, receiptNumber: result.receiptNumber }, req);

    res.json({ success: true, message: 'Order reconciled', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
