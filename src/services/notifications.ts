import { db, Timestamp } from '../config/firebase.js';
import { InventoryAlert, Product, AuditLog, UserNotification } from '../types/index.js';

const PRODUCTS_COLLECTION = 'products';
const INVENTORY_ALERTS_COLLECTION = 'inventory_alerts';
const AUDIT_LOGS_COLLECTION = 'audit_logs';
const USER_NOTIFICATIONS_COLLECTION = 'user_notifications';

export class NotificationService {
  async checkInventoryAlerts(): Promise<InventoryAlert[]> {
    const alerts: InventoryAlert[] = [];
    const snapshot = await db.collection(PRODUCTS_COLLECTION)
      .where('isActive', '==', true)
      .get();

    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

    for (const product of products) {
      if (product.quantity <= 0) {
        const alert = await this.createAlert(product, 'out_of_stock');
        alerts.push(alert);
      } else if (product.quantity <= (product.lowStockThreshold || 10)) {
        const alert = await this.createAlert(product, 'low_stock');
        alerts.push(alert);
      }
    }

    return alerts;
  }

  private async createAlert(product: Product, type: 'low_stock' | 'out_of_stock'): Promise<InventoryAlert> {
    const existingSnapshot = await db.collection(INVENTORY_ALERTS_COLLECTION)
      .where('productId', '==', product.id)
      .where('type', '==', type)
      .where('acknowledged', '==', false)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      const docRef = existingSnapshot.docs[0].ref;
      const updatedData = {
        currentStock: product.quantity,
        threshold: product.lowStockThreshold || 10,
      };
      await docRef.update(updatedData);
      return { id: existingSnapshot.docs[0].id, ...existingSnapshot.docs[0].data(), ...updatedData } as InventoryAlert;
    }

    const ref = db.collection(INVENTORY_ALERTS_COLLECTION).doc();
    const alertData: Partial<InventoryAlert> = {
      productId: product.id,
      productName: product.name,
      type,
      currentStock: product.quantity,
      threshold: product.lowStockThreshold || 10,
      acknowledged: false,
      createdAt: Timestamp.now(),
    };

    await ref.set(alertData);
    return { id: ref.id, ...alertData } as unknown as InventoryAlert;
  }

  async getAlerts(acknowledged: boolean = false): Promise<InventoryAlert[]> {
    const snapshot = await db.collection(INVENTORY_ALERTS_COLLECTION)
      .where('acknowledged', '==', acknowledged)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryAlert));
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    await db.collection(INVENTORY_ALERTS_COLLECTION).doc(alertId).update({
      acknowledged: true,
    });
  }

  async logAudit(data: {
    userId: string;
    action: string;
    resource: string;
    resourceId: string;
    details: Record<string, unknown>;
    ip?: string;
  }): Promise<void> {
    await db.collection(AUDIT_LOGS_COLLECTION).add({
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      details: data.details,
      ip: data.ip || '',
      createdAt: Timestamp.now(),
    } as unknown as Partial<AuditLog>);
  }

  async getAuditLogs(page: number = 1, limit: number = 50): Promise<{ logs: AuditLog[]; total: number }> {
    const query = db.collection(AUDIT_LOGS_COLLECTION)
      .orderBy('createdAt', 'desc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog));

    return { logs, total };
  }

  async getUserAuditLogs(userId: string, action?: string, page: number = 1, limit: number = 50): Promise<{ logs: AuditLog[]; total: number }> {
    let query: FirebaseFirestore.Query = db.collection(AUDIT_LOGS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc');

    if (action) {
      query = query.where('action', '==', action);
    }

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog));

    return { logs, total };
  }

  async createUserNotification(data: {
    userId: string;
    type: UserNotification['type'];
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<UserNotification> {
    const ref = db.collection(USER_NOTIFICATIONS_COLLECTION).doc();
    const notification: Omit<UserNotification, 'id'> = {
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.data ?? {},
      isRead: false,
      createdAt: Timestamp.now(),
    };
    await ref.set(notification);
    return { id: ref.id, ...notification };
  }

  async getUserNotifications(userId: string, page: number = 1, limit: number = 20): Promise<{ notifications: UserNotification[]; total: number }> {
    const query = db.collection(USER_NOTIFICATIONS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserNotification));

    return { notifications, total };
  }

  async markNotificationRead(notificationId: string, userId: string): Promise<void> {
    const ref = db.collection(USER_NOTIFICATIONS_COLLECTION).doc(notificationId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Notification not found');
    if (doc.data()?.userId !== userId) throw new Error('Unauthorized');
    await ref.update({ isRead: true });
  }
}

export const notificationService = new NotificationService();
