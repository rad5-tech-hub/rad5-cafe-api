import { db, Timestamp } from '../config/firebase';
import { InventoryAlert, Product, AuditLog } from '../types';

const PRODUCTS_COLLECTION = 'products';
const INVENTORY_ALERTS_COLLECTION = 'inventory_alerts';
const AUDIT_LOGS_COLLECTION = 'audit_logs';

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
      return { id: existingSnapshot.docs[0].id, ...existingSnapshot.docs[0].data() } as InventoryAlert;
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
}

export const notificationService = new NotificationService();
