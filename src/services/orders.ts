import { db, Timestamp, FieldValue } from '../config/firebase.js';
import { Order, OrderItem, Receipt, Transaction, Product } from '../types/index.js';
import { generateReceiptNumber, getNextId } from '../utils/id-generator.js';
import { productService } from './products.js';
import { walletService } from './wallet.js';
import { verifyPin } from '../utils/pin-hash.js';
import { expoPushService } from './expo-push.js';
import { notificationService } from './notifications.js';

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
    pin: string,
    paymentMethod: 'wallet' | 'cash' = 'wallet',
    customerName?: string
  ): Promise<{ order: Order; receipt: Receipt; balance: number }> {
    if (!items || items.length === 0) {
      throw new Error('Cart is empty');
    }

    const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) throw new Error('User not found');
    const user = userDoc.data() as { fullName: string; walletId: string; pin: string };

    if (paymentMethod === 'wallet') {
      const pinValid = await verifyPin(pin, user.pin);
      if (!pinValid) throw new Error('Invalid PIN');
    }

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

    if (paymentMethod === 'wallet' && walletDoc.data()?.balance < subtotal) {
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
      const productDocs: { op: typeof stockUpdateOps[0]; product: Product }[] = [];
      for (const op of stockUpdateOps) {
        const productDoc = await transaction.get(op.productRef);
        const product = productDoc.data() as Product;
        if (product.quantity < op.item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }
        productDocs.push({ op, product });
      }

      for (const { op, product } of productDocs) {
        transaction.update(op.productRef, {
          quantity: FieldValue.increment(-op.item.quantity),
          totalSold: FieldValue.increment(op.item.quantity),
          updatedAt: Timestamp.now(),
        });
        transaction.set(op.stockHistRef, {
          productId: op.item.productId,
          type: 'sold',
          userId,
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
        customerName: customerName || undefined,
        items: orderItems,
        subtotal,
        total: subtotal,
        status: 'completed',
        paymentMethod,
        reconciliationStatus: paymentMethod === 'cash' ? 'limbo' : 'none',
        issued: false,
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

      if (paymentMethod === 'wallet') {
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
      }
    });

    void expoPushService.sendToUser(
      userId,
      'Purchase Completed',
      `Your order ${receiptNumber} for ₦${subtotal.toLocaleString()} has been completed`,
      { type: 'purchase_completed', receiptNumber, amount: subtotal, orderId: orderRef.id },
    );

    void notificationService.createUserNotification({
      userId,
      type: 'purchase_completed',
      title: 'Purchase Completed',
      body: `Your order ${receiptNumber} for ₦${subtotal.toLocaleString()} has been completed`,
      data: { type: 'purchase_completed', receiptNumber, amount: subtotal, orderId: orderRef.id },
    });

    const order = {
      id: orderRef.id,
      receiptNumber,
      userId,
      walletId: user.walletId,
      customerName: customerName || undefined,
      items: orderItems,
      subtotal,
      total: subtotal,
      status: 'completed' as const,
      paymentMethod,
      reconciliationStatus: paymentMethod === 'cash' ? 'limbo' : 'none',
      issued: false,
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

  async getUnissuedOrders(page: number = 1, limit: number = 20): Promise<{ orders: Order[]; total: number }> {
    const query = db.collection(ORDERS_COLLECTION)
      .where('issued', '==', false)
      .where('status', '==', 'completed')
      .orderBy('createdAt', 'asc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    return { orders, total };
  }

  async issueOrder(orderId: string, adminUserId: string): Promise<Order> {
    const orderRef = db.collection(ORDERS_COLLECTION).doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) throw new Error('Order not found');

    const order = { id: orderDoc.id, ...orderDoc.data() } as Order;

    if (order.issued) throw new Error('Order already issued');
    if (order.status !== 'completed') throw new Error('Only completed orders can be issued');

    await orderRef.update({
      issued: true,
      issuedAt: Timestamp.now(),
      issuedBy: adminUserId,
    });

    return { ...order, issued: true, issuedAt: Timestamp.now(), issuedBy: adminUserId };
  }
  async getLimboOrders(page: number = 1, limit: number = 20): Promise<{ orders: Order[]; total: number }> {
    const query = db.collection(ORDERS_COLLECTION)
      .where('reconciliationStatus', '==', 'limbo')
      .orderBy('createdAt', 'desc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    return { orders, total };
  }

  async reconcileLimboOrder(orderId: string, adminUserId: string, customerUserId: string): Promise<Order> {
    const orderRef = db.collection(ORDERS_COLLECTION).doc(orderId);
    
    const userDoc = await db.collection(USERS_COLLECTION).doc(customerUserId).get();
    if (!userDoc.exists) throw new Error('Customer user not found');
    const user = userDoc.data() as { fullName: string; walletId: string };

    const walletSnapshot = await db.collection(WALLETS_COLLECTION)
      .where('walletId', '==', user.walletId).limit(1).get();
    if (walletSnapshot.empty) throw new Error('Customer wallet not found');
    const walletDoc = walletSnapshot.docs[0];

    return await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) throw new Error('Order not found');
      const order = { id: orderDoc.id, ...orderDoc.data() } as Order;
      
      if (order.reconciliationStatus !== 'limbo') {
        throw new Error('Order is not in limbo state');
      }

      const receiptNumber = order.receiptNumber;
      const subtotal = order.subtotal;

      const txnRef1 = db.collection(TRANSACTIONS_COLLECTION).doc();
      const txnRef2 = db.collection(TRANSACTIONS_COLLECTION).doc();

      transaction.set(txnRef1, {
        walletId: user.walletId,
        userId: customerUserId,
        type: 'funding',
        amount: subtotal,
        fee: 0,
        reference: `CASH-FUND-${receiptNumber}`,
        description: `Manual cash reconciliation by admin`,
        status: 'completed',
        paymentMethod: 'cash',
        createdAt: Timestamp.now(),
      } as unknown as Partial<Transaction>);

      transaction.set(txnRef2, {
        walletId: user.walletId,
        userId: customerUserId,
        type: 'purchase',
        amount: -subtotal,
        fee: 0,
        reference: `PUR-${receiptNumber}`,
        description: `Café purchase (cash reconciled) - ${receiptNumber}`,
        status: 'completed',
        paymentMethod: 'wallet',
        metadata: { receiptNumber, orderId: order.id, items: order.items },
        createdAt: Timestamp.now(),
      } as unknown as Partial<Transaction>);

      transaction.update(walletDoc.ref, {
        totalFunded: FieldValue.increment(subtotal),
        totalSpent: FieldValue.increment(subtotal),
        updatedAt: Timestamp.now(),
      });

      transaction.update(orderRef, {
        reconciliationStatus: 'reconciled',
        reconciledBy: adminUserId,
        reconciledAt: Timestamp.now(),
        userId: customerUserId,
        walletId: user.walletId,
      });

      const receiptQuery = db.collection(RECEIPTS_COLLECTION).where('orderId', '==', order.id).limit(1);
      const receiptSnapshot = await transaction.get(receiptQuery);
      if (!receiptSnapshot.empty) {
        transaction.update(receiptSnapshot.docs[0].ref, {
          userId: customerUserId,
          userName: user.fullName,
          walletId: user.walletId,
        });
      }

      return { ...order, reconciliationStatus: 'reconciled', userId: customerUserId, walletId: user.walletId };
    });
  }
}

export const orderService = new OrderService();
