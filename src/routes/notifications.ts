import { Router, Request, Response } from 'express';
import { notificationService } from '../services/notifications.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();

function str(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function num(val: unknown, defaultVal: number = 1): number {
  const n = parseInt(str(val), 10);
  return isNaN(n) ? defaultVal : n;
}

router.get('/alerts', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const acknowledged = str(req.query.acknowledged) === 'true';
    const alerts = await notificationService.getAlerts(acknowledged);
    res.json({ success: true, data: alerts });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/alerts/check', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const alerts = await notificationService.checkInventoryAlerts();
    res.json({ success: true, data: alerts, message: `${alerts.length} alert(s) generated` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/alerts/:id/acknowledge', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    await notificationService.acknowledgeAlert(req.params.id as string);
    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/audit-logs', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 50);
    const result = await notificationService.getAuditLogs(page, limit);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/user', authenticate, async (req: Request, res: Response) => {
  try {
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 20);
    const result = await notificationService.getUserNotifications(req.user!.userId, page, limit);
    
    const formatted = result.notifications.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data || {},
      isRead: n.isRead,
      createdAt: n.createdAt
        ? (typeof (n.createdAt as any).toDate === 'function'
          ? (n.createdAt as any).toDate().toISOString()
          : new Date(n.createdAt as any).toISOString())
        : new Date().toISOString(),
    }));

    res.json({
      success: true,
      total: result.total,
      page,
      limit,
      notifications: formatted,
      data: formatted,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/user/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    await notificationService.markNotificationRead(req.params.id as string, req.user!.userId);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
