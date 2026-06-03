import { db, Timestamp, FieldValue } from '../config/firebase';
import { Order, OrderItem, Receipt, Transaction, Product } from '../types';
import { generateReceiptNumber, getNextId } from '../utils/id-generator';
import { productService } from './products';
import { walletService } from './wallet';
import { verifyPin } from '../utils/pin-hash';
import { expoPushService } from './expo-push';

const WALLETS_COLLECTION = 'wallets';
const USERS_COLLECTION = 'users';
const ORDERS_COLLECTION = 'orders';
const RECEIPTS_COLLECTION = 'receipts';
const TRANSACTIONS_COLLECTION = 'transactions';
const PRODUCTS_COLLECTION = 'products';
const STOCK_HISTORY_COLLECTION = 'stock_history';

export class OrderService {
  async createOrder(
    userId: string,
    items: { productId: string; quantity: number }[],
    pin: string
  ): Promise<{ order: Order; receipt: Receipt; balance: number }> {
    if (!items || items.length === 0) {
      throw new Error('Cart is empty');
    }

    const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) throw new Error('User not found');
    const user = userDoc.data() as { fullName: string; walletId: string; pin: string };

    const pinValid = await verifyPin(pin, user.pin);
    if (!pinValid) throw new Error('Invalid PIN');

    const walletSnapshot = await db.collection(WALLETS_COLLECTION)
      .where('walletId', '==', user.walletId).limit(1).get();
    if (walletSnapshot.empty) throw new Error('Wallet not found');
    const walletDoc = walletSnapshot.docs[0];

    const orderItems: OrderItem[] = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await productService.getById(item.productId);
      if (!product.isActive) throw new Error(`${product.name} is no longer available`);
      if (product.quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}. Available: ${product.quantity}`);
      }

      const orderItem: OrderItem = {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.sellingPrice,
        costPrice: product.costPrice,
        totalPrice: product.sellingPrice * item.quantity,
      };

      orderItems.push(orderItem);
      subtotal += orderItem.totalPrice;
    }

    if (walletDoc.data()?.balance < subtotal) {
      throw new Error('Insufficient wallet balance');
    }

    const receiptNumber = await generateReceiptNumber();
    const orderRef = db.collection(ORDERS_COLLECTION).doc();
    const receiptRef = db.collection(RECEIPTS_COLLECTION).doc();
    const txnRef = db.collection(TRANSACTIONS_COLLECTION).doc();

    // Reduce stock for each product
    const stockUpdateOps = orderItems.map(item => {
      const productRef = db.collection(PRODUCTS_COLLECTION).doc(item.productId);
      const stockHistRef = db.collection(STOCK_HISTORY_COLLECTION).doc();
      return { productRef, stockHistRef, item };
    });

    await db.runTransaction(async (transaction) => {
      for (const op of stockUpdateOps) {
        const productDoc = await transaction.get(op.productRef);
        const product = productDoc.data() as Product;
        if (product.quantity < op.item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }
        transaction.update(op.productRef, {
          quantity: FieldValue.increment(-op.item.quantity),
          totalSold: FieldValue.increment(op.item.quantity),
          updatedAt: Timestamp.now(),
        });
        transaction.set(op.stockHistRef, {
          productId: op.item.productId,
          type: 'sold',
          quantity: op.item.quantity,
          previousStock: product.quantity,
          newStock: product.quantity - op.item.quantity,
          reference: receiptNumber,
          createdAt: Timestamp.now(),
        });
      }

      transaction.set(orderRef, {
        receiptNumber,
        userId,
        walletId: user.walletId,
        items: orderItems,
        subtotal,
        total: subtotal,
        status: 'completed',
        createdAt: Timestamp.now(),
      } as unknown as Partial<Order>);

      transaction.set(receiptRef, {
        receiptNumber,
        orderId: orderRef.id,
        userId,
        userName: user.fullName,
        walletId: user.walletId,
        items: orderItems,
        subtotal,
        total: subtotal,
        createdAt: Timestamp.now(),
      } as unknown as Partial<Receipt>);

      transaction.set(txnRef, {
        walletId: user.walletId,
        userId,
        type: 'purchase',
        amount: -subtotal,
        fee: 0,
        reference: `PUR-${receiptNumber}`,
        description: `Café purchase - ${receiptNumber}`,
        status: 'completed',
        paymentMethod: 'wallet',
        metadata: { receiptNumber, orderId: orderRef.id, items: orderItems },
        createdAt: Timestamp.now(),
      } as unknown as Partial<Transaction>);

      transaction.update(walletDoc.ref, {
        balance: FieldValue.increment(-subtotal),
        totalSpent: FieldValue.increment(subtotal),
        updatedAt: Timestamp.now(),
      });
    });

    void expoPushService.sendToUser(
      userId,
      'Purchase Completed',
      `Your order ${receiptNumber} for ₦${subtotal.toLocaleString()} has been completed`,
      { type: 'purchase_completed', receiptNumber, amount: subtotal, orderId: orderRef.id },
    );

    const order = {
      id: orderRef.id,
      receiptNumber,
      userId,
      walletId: user.walletId,
      items: orderItems,
      subtotal,
      total: subtotal,
      status: 'completed' as const,
      createdAt: Timestamp.now(),
    } as unknown as Order;

    const receipt = {
      id: receiptRef.id,
      receiptNumber,
      orderId: orderRef.id,
      userId,
      userName: user.fullName,
      walletId: user.walletId,
      items: orderItems,
      subtotal,
      total: subtotal,
      createdAt: Timestamp.now(),
    } as unknown as Receipt;

    return { order, receipt, balance: walletDoc.data()?.balance - subtotal };
  }

  async getOrders(userId: string, page: number = 1, limit: number = 20): Promise<{ orders: Order[]; total: number }> {
    const query = db.collection(ORDERS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    return { orders, total };
  }

  async getReceipt(orderId: string): Promise<Receipt | null> {
    const snapshot = await db.collection(RECEIPTS_COLLECTION)
      .where('orderId', '==', orderId).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Receipt;
  }

  async getReceiptByNumber(receiptNumber: string): Promise<Receipt | null> {
    const snapshot = await db.collection(RECEIPTS_COLLECTION)
      .where('receiptNumber', '==', receiptNumber).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Receipt;
  }

  async getAllOrders(page: number = 1, limit: number = 20): Promise<{ orders: Order[]; total: number }> {
    const query = db.collection(ORDERS_COLLECTION)
      .orderBy('createdAt', 'desc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    return { orders, total };
  }
}

export const orderService = new OrderService();
