import { db, FieldValue, Timestamp } from '../config/firebase.js';
import { Order, Product, StockBalanceOut } from '../types/index.js';

const PRODUCTS_COLLECTION = 'products';
const ORDERS_COLLECTION = 'orders';
const STOCK_HISTORY_COLLECTION = 'stock_history';
const STOCK_BALANCE_COLLECTION = 'stock_balance_outs';

export interface StockLedgerRow {
  id: string;
  name: string;
  quantity: number;
  costPrice: number;
  remainingValue: number;
}

export class StockBalanceService {
  private async computeStockBreakdown(): Promise<{ products: StockLedgerRow[]; totalQuantity: number; totalValue: number }> {
    const snapshot = await db.collection(PRODUCTS_COLLECTION)
      .where('isActive', '==', true)
      .orderBy('name', 'asc')
      .get();

    const products: StockLedgerRow[] = [];
    let totalQuantity = 0;
    let totalValue = 0;

    snapshot.docs.forEach(doc => {
      const product = doc.data() as Product;
      const quantity = product.quantity || 0;
      const costPrice = product.costPrice || 0;
      const remainingValue = quantity * costPrice;

      totalQuantity += quantity;
      totalValue += remainingValue;

      products.push({ id: doc.id, name: product.name, quantity, costPrice, remainingValue });
    });

    return { products, totalQuantity, totalValue };
  }

  private async computeLifetimeProfit(): Promise<number> {
    const ordersSnapshot = await db.collection(ORDERS_COLLECTION).get();

    let totalProfit = 0;
    ordersSnapshot.docs.forEach(doc => {
      const order = doc.data() as Order;
      if (order.status === 'cancelled') return;
      if (order.reconciliationStatus === 'limbo') return;
      for (const item of order.items || []) {
        totalProfit += (item.unitPrice - item.costPrice) * item.quantity;
      }
    });

    return totalProfit;
  }

  private async getTotalBalancedOut(): Promise<number> {
    const snapshot = await db.collection(STOCK_BALANCE_COLLECTION).get();
    let totalBalancedOut = 0;
    snapshot.forEach(doc => {
      totalBalancedOut += (doc.data().amount as number) || 0;
    });
    return totalBalancedOut;
  }

  async getSummary(): Promise<{
    products: StockLedgerRow[];
    totalQuantity: number;
    totalValue: number;
    totalBalancedOut: number;
    netStockValue: number;
    totalProfit: number;
    netProfit: number;
  }> {
    const [{ products, totalQuantity, totalValue }, totalBalancedOut, totalProfit] = await Promise.all([
      this.computeStockBreakdown(),
      this.getTotalBalancedOut(),
      this.computeLifetimeProfit(),
    ]);

    return {
      products,
      totalQuantity,
      totalValue,
      totalBalancedOut,
      netStockValue: totalValue - totalBalancedOut,
      totalProfit,
      netProfit: totalProfit - totalBalancedOut,
    };
  }

  async createBalanceOut(productId: string, quantity: number, note: string, adminId: string): Promise<StockBalanceOut> {
    if (quantity <= 0) throw new Error('Quantity must be positive');

    const productRef = db.collection(PRODUCTS_COLLECTION).doc(productId);
    const balanceRef = db.collection(STOCK_BALANCE_COLLECTION).doc();
    const historyRef = db.collection(STOCK_HISTORY_COLLECTION).doc();

    return db.runTransaction(async (transaction) => {
      const productDoc = await transaction.get(productRef);
      if (!productDoc.exists) throw new Error('Product not found');

      const product = productDoc.data() as Product;
      if (product.quantity < quantity) {
        throw new Error(`Cannot balance out more than available stock. Available: ${product.quantity}, requested: ${quantity}`);
      }

      const costPrice = product.costPrice || 0;
      const amount = costPrice * quantity;
      const remainingQuantity = product.quantity - quantity;

      transaction.update(productRef, {
        quantity: FieldValue.increment(-quantity),
        totalAdded: FieldValue.increment(-quantity),
        updatedAt: Timestamp.now(),
      });

      transaction.set(historyRef, {
        productId,
        type: 'balanced_out',
        quantity,
        costPrice,
        previousStock: product.quantity,
        newStock: remainingQuantity,
        reference: `BALANCE-${Date.now()}`,
        reason: note || '',
        createdAt: Timestamp.now(),
      });

      const record = {
        productId,
        productName: product.name,
        quantity,
        costPrice,
        amount,
        note: note || '',
        remainingQuantity,
        createdBy: adminId,
        createdAt: Timestamp.now(),
      };
      transaction.set(balanceRef, record);

      return { id: balanceRef.id, ...record } as StockBalanceOut;
    });
  }

  async list(page: number, limit: number): Promise<{ data: unknown[]; total: number; page: number; limit: number; totalPages: number }> {
    const query = db.collection(STOCK_BALANCE_COLLECTION).orderBy('createdAt', 'desc');

    const [countSnapshot, pageSnapshot] = await Promise.all([
      query.count().get(),
      query.offset((page - 1) * limit).limit(limit).get(),
    ]);

    const total = countSnapshot.data().count;
    const data = pageSnapshot.docs.map(doc => {
      const docData = doc.data();
      return {
        id: doc.id,
        ...docData,
        createdAt: docData.createdAt.toDate().toISOString(),
      };
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

export const stockBalanceService = new StockBalanceService();
