import { Router, Request, Response } from 'express';
import { reportService } from '../services/reports.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { requirePermission, requireFullAccessAdmin, hasFullAccess } from '../middleware/permissions.js';
import { ADMIN_PERMISSIONS, sanitizePermissions } from '../config/permissions.js';
import { db, auth, Timestamp } from '../config/firebase.js';
import { Transaction, User } from '../types/index.js';
import { promoteToAdmin, demoteFromAdmin } from '../utils/firebase-custom-claims.js';
import { notificationService } from '../services/notifications.js';
import { orderService } from '../services/orders.js';
import { verifyPin } from '../utils/pin-hash.js';
import { authService } from '../services/auth.js';

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
    actorName: req.user?.fullName || req.user?.email || '',
    actorRole: req.user?.role,
    action,
    resource,
    resourceId,
    details,
    ip: req.ip || '',
    userAgent: String(req.headers['user-agent'] || ''),
  });
}

async function verifyAdminPin(userId: string, pin: string): Promise<void> {
  if (!pin) throw new Error('Transaction PIN is required');
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) throw new Error('Admin not found');
  const user = userDoc.data() as User;
  if (!user.pinSetup || !user.pin) {
    throw new Error('Transaction PIN is not set up. Please set up your PIN first.');
  }
  const isMatch = await verifyPin(pin, user.pin);
  if (!isMatch) throw new Error('Invalid transaction PIN');
}

router.get('/sales', authenticate, requireAdmin, requirePermission('reports'), async (req: Request, res: Response) => {
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

router.get('/inventory', authenticate, requireAdmin, requirePermission('reports'), async (_req: Request, res: Response) => {
  try {
    const buffer = await reportService.generateInventoryReport();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=inventory-report-${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/profit', authenticate, requireAdmin, requirePermission('reports'), async (req: Request, res: Response) => {
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

router.get('/transactions', authenticate, requireAdmin, requirePermission('reports'), async (req: Request, res: Response) => {
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

router.get('/users', authenticate, requireAdmin, requirePermission('users'), async (req: Request, res: Response) => {
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

router.get('/users/:id/payment-logs', authenticate, requireAdmin, requirePermission('users'), async (req: Request, res: Response) => {
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

router.put('/users/:id/toggle-status', authenticate, requireAdmin, requirePermission('users'), async (req: Request, res: Response) => {
  try {
    const userRef = db.collection(USERS_COLLECTION).doc(req.params.id as string);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    const user = userDoc.data() as User;
    if (user.role === 'admin' && !hasFullAccess(req.user)) {
      res.status(403).json({ success: false, message: 'Only full-access admins can activate/deactivate other admins.' });
      return;
    }
    await userRef.update({ isActive: !user.isActive });
    
    logAudit(req.user!.userId, 'toggle_user_status', 'users', req.params.id as string, { isActive: !user.isActive }, req);

    res.json({ success: true, message: `User ${user.isActive ? 'deactivated' : 'activated'}` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/users/:id/role', authenticate, requireAdmin, requireFullAccessAdmin, async (req: Request, res: Response) => {
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

router.post('/users/add-admin', authenticate, requireAdmin, requireFullAccessAdmin, async (req: Request, res: Response) => {
  try {
    const { email, fullName, password, permissions } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ success: false, message: 'A valid email address is required.' });
      return;
    }

    // A sub-admin created here always gets an explicit permissions array
    // (possibly empty) — only the pre-existing/grandfathered admins have
    // no `permissions` field and therefore full access.
    const cleanPermissions = sanitizePermissions(permissions);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : cleanEmail.split('@')[0];

    // Check if user already exists in Firebase Auth
    let existingAuthUser = null;
    try {
      existingAuthUser = await auth.getUserByEmail(cleanEmail);
    } catch {
      existingAuthUser = null;
    }

    if (existingAuthUser) {
      const uid = existingAuthUser.uid;
      const userRef = db.collection(USERS_COLLECTION).doc(uid);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const userData = userDoc.data() as User;
        if (userData.role === 'admin') {
          res.status(400).json({ success: false, message: `User ${cleanEmail} is already an admin.` });
          return;
        }
        await userRef.update({
          role: 'admin',
          permissions: cleanPermissions,
          fullName: cleanName || userData.fullName || cleanEmail.split('@')[0],
          updatedAt: Timestamp.now(),
        });
      } else {
        await userRef.set({
          uid,
          firebaseUid: uid,
          email: cleanEmail,
          fullName: cleanName,
          role: 'admin',
          permissions: cleanPermissions,
          isActive: true,
          pinSetup: false,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }

      await promoteToAdmin(uid);
      logAudit(req.user!.userId, 'add_admin_existing', 'users', uid, { email: cleanEmail, role: 'admin', permissions: cleanPermissions }, req);

      res.json({
        success: true,
        message: `Existing user ${cleanEmail} promoted to Admin successfully.`,
        isExisting: true,
        data: { uid, email: cleanEmail, fullName: cleanName, role: 'admin', permissions: cleanPermissions },
      });
      return;
    }

    // User does NOT exist in Firebase Auth -> Create new admin user
    const tempPassword = typeof password === 'string' && password.trim().length >= 6
      ? password.trim()
      : `Admin@${Math.floor(100000 + Math.random() * 900000)}`;

    const newAuthUser = await auth.createUser({
      email: cleanEmail,
      password: tempPassword,
      displayName: cleanName,
      emailVerified: true,
    });

    const newUid = newAuthUser.uid;

    await db.collection(USERS_COLLECTION).doc(newUid).set({
      uid: newUid,
      firebaseUid: newUid,
      email: cleanEmail,
      fullName: cleanName,
      role: 'admin',
      permissions: cleanPermissions,
      isActive: true,
      pinSetup: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Create default wallet
    const walletId = `W-${Date.now().toString(36).toUpperCase()}`;
    await db.collection('wallets').doc(newUid).set({
      userId: newUid,
      walletId,
      balance: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await promoteToAdmin(newUid);
    logAudit(req.user!.userId, 'create_new_admin', 'users', newUid, { email: cleanEmail, role: 'admin', permissions: cleanPermissions }, req);

    res.json({
      success: true,
      message: `New admin account created successfully for ${cleanEmail}.`,
      isExisting: false,
      temporaryPassword: tempPassword,
      data: { uid: newUid, email: cleanEmail, fullName: cleanName, role: 'admin', permissions: cleanPermissions, temporaryPassword: tempPassword },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || 'Failed to create admin account.' });
  }
});

// ─── Sub-admin & permission management (full-access admins only) ──────────

router.get('/permissions', authenticate, requireAdmin, requireFullAccessAdmin, async (_req: Request, res: Response) => {
  res.json({ success: true, data: ADMIN_PERMISSIONS });
});

router.get('/users/admins', authenticate, requireAdmin, requireFullAccessAdmin, async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.collection(USERS_COLLECTION).where('role', '==', 'admin').get();
    const admins = snapshot.docs.map((doc) => {
      const data = doc.data() as User;
      return {
        id: doc.id,
        uid: data.uid,
        email: data.email,
        fullName: data.fullName,
        isActive: data.isActive,
        fullAccess: data.permissions === undefined || data.permissions === null,
        permissions: data.permissions ?? [],
        createdAt: data.createdAt,
      };
    });
    res.json({ success: true, data: admins });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/users/:id/permissions', authenticate, requireAdmin, requireFullAccessAdmin, async (req: Request, res: Response) => {
  try {
    const userRef = db.collection(USERS_COLLECTION).doc(req.params.id as string);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    const user = userDoc.data() as User;
    if (user.role !== 'admin') {
      res.status(400).json({ success: false, message: 'User is not an admin' });
      return;
    }

    const firebaseUid = user.firebaseUid || userDoc.id;
    if (firebaseUid === 'admin-super') {
      res.status(400).json({ success: false, message: 'The superadmin account always has full access.' });
      return;
    }

    // `fullAccess: true` clears the permissions field entirely, granting
    // this admin the same unrestricted access as the grandfathered admins.
    const grantFullAccess = req.body.fullAccess === true;
    const cleanPermissions = grantFullAccess ? null : sanitizePermissions(req.body.permissions);

    await userRef.update({
      permissions: cleanPermissions,
      updatedAt: Timestamp.now(),
    });

    logAudit(req.user!.userId, 'update_admin_permissions', 'users', req.params.id as string, { fullAccess: grantFullAccess, permissions: cleanPermissions }, req);

    res.json({ success: true, message: 'Admin permissions updated', data: { fullAccess: grantFullAccess, permissions: cleanPermissions ?? [] } });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/orders/limbo', authenticate, requireAdmin, requirePermission('cash_orders'), async (req: Request, res: Response) => {
  try {
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 20);
    const enteredBy = str(req.query.enteredBy).trim() || undefined;
    const result = await orderService.getLimboOrders(page, limit, enteredBy);
    res.json({ success: true, orders: result.orders, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/orders/limbo/admins', authenticate, requireAdmin, requirePermission('cash_orders'), async (_req: Request, res: Response) => {
  try {
    const admins = await orderService.getLimboEnteredByAdmins();
    res.json({ success: true, admins });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/orders/reconciled', authenticate, requireAdmin, requirePermission('cash_orders'), async (req: Request, res: Response) => {
  try {
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 20);
    const result = await orderService.getReconciledOrders(page, limit);
    res.json({ success: true, orders: result.orders, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/orders/:orderId/reconcile', authenticate, requireAdmin, requirePermission('cash_orders'), async (req: Request, res: Response) => {
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

router.delete('/orders/:orderId', authenticate, requireAdmin, requirePermission('cash_orders'), async (req: Request, res: Response) => {
  try {
    const { reason, pin } = req.body;
    if (!reason) {
      res.status(400).json({ success: false, message: 'Reason is required' });
      return;
    }
    if (!pin) {
      res.status(400).json({ success: false, message: 'Admin PIN is required' });
      return;
    }

    await verifyAdminPin(req.user!.userId, pin);

    const result = await orderService.deleteLimboOrder(req.params.orderId as string, req.user!.userId, reason);

    logAudit(req.user!.userId, 'delete_cash_order', 'orders', req.params.orderId as string, { reason, receiptNumber: result.receiptNumber }, req);

    if (result.userId) {
      try {
        const { expoPushService } = await import('../services/expo-push.js');
        const { notificationService } = await import('../services/notifications.js');

        void expoPushService.sendToUser(
          result.userId,
          'Cash Order Cancelled',
          `Your cash order ${result.receiptNumber} was cancelled by admin. Reason: ${reason}`,
          { type: 'order_cancelled', orderId: result.id }
        );

        void notificationService.createUserNotification({
          userId: result.userId,
          type: 'info',
          title: 'Cash Order Cancelled',
          body: `Your cash order ${result.receiptNumber} was cancelled by admin. Reason: ${reason}`,
        });
      } catch (notifErr) {
        console.warn('Failed to send cancellation notifications:', notifErr);
      }
    }

    res.json({ success: true, message: 'Order deleted successfully', data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/pin-change-requests', authenticate, requireAdmin, requirePermission('pin_changes'), async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 20);

    const result = await authService.getPinChangeRequests(status, page, limit);
    res.json({
      success: true,
      data: result.requests,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit)
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/pin-change-requests/:id/approve', authenticate, requireAdmin, requirePermission('pin_changes'), async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      res.status(400).json({ success: false, message: 'Confirming PIN is required' });
      return;
    }

    const result = await authService.approvePinChangeRequest(req.params.id as string, req.user!.userId, pin);
    
    logAudit(req.user!.userId, 'approve_pin_change', 'pin_change_requests', req.params.id as string, { customerUserId: result.userId }, req);

    res.json({ success: true, message: 'PIN change request approved and PIN updated' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/pin-change-requests/:id/reject', authenticate, requireAdmin, requirePermission('pin_changes'), async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const result = await authService.rejectPinChangeRequest(req.params.id as string, req.user!.userId, reason);

    logAudit(req.user!.userId, 'reject_pin_change', 'pin_change_requests', req.params.id as string, { customerUserId: result.userId, reason: reason || '' }, req);

    res.json({ success: true, message: 'PIN change request rejected' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
