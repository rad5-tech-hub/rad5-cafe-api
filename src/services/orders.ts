import { db, Timestamp, FieldValue } from '../config/firebase.js';
import { Order, OrderItem, Receipt, Transaction, Product, User } from '../types/index.js';
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
    customerName?: string,
    source: 'web' | 'mobile' = 'web'
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
    let totalProfit = 0;

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
      totalProfit += (product.sellingPrice - product.costPrice) * item.quantity;
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

    // Pre-fetch referrer data if needed to avoid queries inside the transaction
    let referrerDocRef: FirebaseFirestore.DocumentReference | null = null;
    let referrerWalletRef: FirebaseFirestore.DocumentReference | null = null;
    let txUserObj = user as User;
    if (!txUserObj.hasMadeFirstPurchase && txUserObj.referredBy) {
      const refUserSnap = await db.collection(USERS_COLLECTION).where('referralCode', '==', txUserObj.referredBy).limit(1).get();
      if (!refUserSnap.empty) {
        referrerDocRef = refUserSnap.docs[0].ref;
        const refWalletSnap = await db.collection(WALLETS_COLLECTION).where('userId', '==', refUserSnap.docs[0].id).limit(1).get();
        if (!refWalletSnap.empty) {
          referrerWalletRef = refWalletSnap.docs[0].ref;
        }
      }
    }

    const rewardNotifications: { userId: string, title: string, body: string, data: any }[] = [];

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

      const txUserDoc = await transaction.get(db.collection(USERS_COLLECTION).doc(userId));
      const txUser = txUserDoc.data() as User;
      const isFirstPurchase = !txUser.hasMadeFirstPurchase;
      
      let txReferrerUser = null;
      if (isFirstPurchase && txUser.referredBy && referrerDocRef && referrerWalletRef) {
         const refUserDoc = await transaction.get(referrerDocRef);
         txReferrerUser = refUserDoc.data() as User;
      }

      if (isFirstPurchase) {
        transaction.update(txUserDoc.ref, { hasMadeFirstPurchase: true, updatedAt: Timestamp.now() });
      }

      let buyerReward = 0;
      let referrerReward = 0;
      
      if (isFirstPurchase && txUser.referredBy && txReferrerUser && referrerWalletRef) {
        if (txUser.referralMethod === 'manual') {
          referrerReward = totalProfit * 0.025;
          buyerReward = totalProfit * 0.025;
        } else {
          referrerReward = totalProfit * 0.05;
        }
        
        if (referrerReward > 0) {
          transaction.update(referrerWalletRef, {
            balance: FieldValue.increment(referrerReward),
            updatedAt: Timestamp.now()
          });
          const refTxnRef = db.collection(TRANSACTIONS_COLLECTION).doc();
          transaction.set(refTxnRef, {
            walletId: txReferrerUser.walletId,
            userId: referrerDocRef!.id,
            type: 'reward',
            amount: referrerReward,
            fee: 0,
            reference: `REF-${receiptNumber}`,
            description: `Referral bonus from ${txUser.fullName || 'User'}`,
            status: 'completed',
            createdAt: Timestamp.now(),
          } as unknown as Partial<Transaction>);
          
          rewardNotifications.push({
            userId: referrerDocRef!.id,
            title: 'Referral Bonus',
            body: `You received ₦${referrerReward.toLocaleString()} from your referral's first purchase!`,
            data: { type: 'reward', amount: referrerReward }
          });
        }
      } else if (!isFirstPurchase || !txUser.referredBy) {
        buyerReward = source === 'mobile' ? totalProfit * 0.05 : totalProfit * 0.03;
      }
      
      let walletUpdate: any = {};
      if (paymentMethod === 'wallet') {
        walletUpdate.balance = FieldValue.increment(-subtotal);
        walletUpdate.totalSpent = FieldValue.increment(subtotal);
        walletUpdate.updatedAt = Timestamp.now();
      }
      if (buyerReward > 0) {
        walletUpdate.balance = walletUpdate.balance ? FieldValue.increment(-subtotal + buyerReward) : FieldValue.increment(buyerReward);
        walletUpdate.updatedAt = Timestamp.now();
      }
      if (Object.keys(walletUpdate).length > 0) {
        transaction.update(walletDoc.ref, walletUpdate);
      }

      if (buyerReward > 0) {
        const buyerTxnRef = db.collection(TRANSACTIONS_COLLECTION).doc();
        transaction.set(buyerTxnRef, {
          walletId: user.walletId,
          userId,
          type: 'reward',
          amount: buyerReward,
          fee: 0,
          reference: `CB-${receiptNumber}`,
          description: `Platform usage cashback`,
          status: 'completed',
          createdAt: Timestamp.now(),
        } as unknown as Partial<Transaction>);

        rewardNotifications.push({
          userId: userId,
          title: 'Cashback Earned',
          body: `You earned ₦${buyerReward.toLocaleString()} cashback on your purchase!`,
          data: { type: 'reward', amount: buyerReward }
        });
      }

      transaction.set(orderRef, {
        receiptNumber,
        userId,
        userName: user.fullName,
        walletId: user.walletId,
        customerName: customerName || null,
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
      }
    });

    for (const notif of rewardNotifications) {
      void expoPushService.sendToUser(notif.userId, notif.title, notif.body, notif.data);
      void notificationService.createUserNotification({
        userId: notif.userId,
        type: 'info',
        title: notif.title,
        body: notif.body,
        data: notif.data,
      });
    }

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

    db.collection(USERS_COLLECTION).where('role', '==', 'admin').get().then(adminSnapshot => {
      const itemsStr = orderItems.map(i => `${i.quantity}x ${i.productName}`).join(', ');
      const adminBody = `New order from ${user.fullName || 'Customer'}: ${itemsStr} (₦${subtotal.toLocaleString()})`;
      adminSnapshot.forEach(adminDoc => {
        void expoPushService.sendToUser(
          adminDoc.id,
          'New Order Placed',
          adminBody,
          { type: 'new_order', receiptNumber, amount: subtotal, orderId: orderRef.id },
        );
      });
    }).catch(console.error);

    const order = {
      id: orderRef.id,
      receiptNumber,
      userId,
      userName: user.fullName,
      walletId: user.walletId,
      customerName: customerName || null,
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

    void expoPushService.sendToUser(
      order.userId,
      'Order Issued',
      `Your order ${order.receiptNumber} has been issued and is ready!`,
      { type: 'order_issued', orderId }
    );

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

    const userIds = new Set<string>();
    orders.forEach(order => {
      if (!order.userName && order.userId) userIds.add(order.userId);
    });

    const userMap: Record<string, { email: string }> = {};
    if (userIds.size > 0) {
      const userRefs = Array.from(userIds).map(id => db.collection(USERS_COLLECTION).doc(id));
      const userDocs = await db.getAll(...userRefs);
      userDocs.forEach(doc => {
        if (doc.exists) {
          const data = doc.data() as { email: string };
          userMap[doc.id] = { email: data.email };
        }
      });
    }

    const enhancedOrders = orders.map(order => ({
      ...order,
      userName: order.userName || (order.userId && userMap[order.userId] ? userMap[order.userId].email : undefined),
    }));

    return { orders: enhancedOrders, total };
  }

  async getReconciledOrders(page: number = 1, limit: number = 20): Promise<{ orders: any[]; total: number }> {
    const query = db.collection(ORDERS_COLLECTION)
      .where('reconciliationStatus', '==', 'reconciled')
      .orderBy('createdAt', 'desc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    // Fetch user details for admin and customer
    const userIds = new Set<string>();
    orders.forEach(order => {
      if (order.userId) userIds.add(order.userId);
      if (order.reconciledBy) userIds.add(order.reconciledBy);
    });

    const userMap: Record<string, { fullName: string; email: string }> = {};
    if (userIds.size > 0) {
      const userRefs = Array.from(userIds).map(id => db.collection(USERS_COLLECTION).doc(id));
      const userDocs = await db.getAll(...userRefs);
      userDocs.forEach(doc => {
        if (doc.exists) {
          const data = doc.data() as { fullName: string; email: string };
          userMap[doc.id] = { fullName: data.fullName, email: data.email };
        }
      });
    }

    const enhancedOrders = orders.map(order => ({
      ...order,
      reconciledByName: order.reconciledBy && userMap[order.reconciledBy] ? userMap[order.reconciledBy].fullName : 'Unknown Admin',
      customerAccountName: order.userId && userMap[order.userId] ? userMap[order.userId].fullName : 'Unknown Customer',
    }));

    return { orders: enhancedOrders, total };
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

      // 1. ALL READS FIRST
      const receiptQuery = db.collection(RECEIPTS_COLLECTION).where('orderId', '==', order.id).limit(1);
      const receiptSnapshot = await transaction.get(receiptQuery);
      
      const walletTxnDoc = await transaction.get(walletDoc.ref);
      if (!walletTxnDoc.exists) throw new Error('Customer wallet not found during transaction');
      const currentBalance = (walletTxnDoc.data()?.balance || 0) as number;

      const subtotal = order.subtotal;

      if (currentBalance >= 0 && currentBalance < subtotal) {
        throw new Error(`Insufficient wallet balance. Customer balance: ₦${currentBalance.toLocaleString()}, required: ₦${subtotal.toLocaleString()}`);
      }

      // 2. ALL WRITES AFTER
      const receiptNumber = order.receiptNumber;

      const txnRef = db.collection(TRANSACTIONS_COLLECTION).doc();

      transaction.set(txnRef, {
        walletId: user.walletId,
        userId: customerUserId,
        type: 'purchase',
        amount: -subtotal,
        fee: 0,
        reference: `PUR-${receiptNumber}`,
        description: `Café purchase (reconciled from limbo) - ${receiptNumber}`,
        status: 'completed',
        paymentMethod: 'wallet',
        metadata: { receiptNumber, orderId: order.id, items: order.items },
        createdAt: Timestamp.now(),
      } as unknown as Partial<Transaction>);

      transaction.update(walletDoc.ref, {
        balance: FieldValue.increment(-subtotal),
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

      if (!receiptSnapshot.empty) {
        transaction.update(receiptSnapshot.docs[0].ref, {
          userId: customerUserId,
          userName: user.fullName,
          walletId: user.walletId,
        });
      }

      return { ...order, reconciliationStatus: 'reconciled', userId: customerUserId, walletId: user.walletId };
    });
    
    // Notifications for reconciliation
    void expoPushService.sendToUser(customerUserId, 'Order Reconciled', `Your cash order (${orderRef.id}) has been successfully reconciled.`);
    void expoPushService.sendToRole('admin', 'Cash Order Reconciled', `A cash order for ${user.fullName} has been reconciled.`);
  }

  async deleteLimboOrder(orderId: string, adminUserId: string, reason: string): Promise<Order> {
    return await db.runTransaction(async (transaction) => {
      const orderRef = db.collection(ORDERS_COLLECTION).doc(orderId);
      const orderDoc = await transaction.get(orderRef);

      if (!orderDoc.exists) {
        throw new Error('Order not found');
      }

      const order = { id: orderDoc.id, ...orderDoc.data() } as Order;

      if (order.reconciliationStatus !== 'limbo') {
        throw new Error('Only limbo orders can be deleted');
      }

      const adminUserRef = db.collection(USERS_COLLECTION).doc(adminUserId);
      const adminUserDoc = await transaction.get(adminUserRef);
      const adminName = adminUserDoc.exists ? (adminUserDoc.data()?.fullName || 'Unknown Admin') : 'Unknown Admin';

      // Restore inventory since the order is cancelled
      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          if (item.productId && item.quantity > 0) {
            const productRef = db.collection(PRODUCTS_COLLECTION).doc(item.productId);
            transaction.update(productRef, {
              quantity: FieldValue.increment(item.quantity),
              totalSold: FieldValue.increment(-item.quantity),
              updatedAt: Timestamp.now(),
            });
            const stockHistRef = db.collection(STOCK_HISTORY_COLLECTION).doc();
            transaction.set(stockHistRef, {
              productId: item.productId,
              type: 'added',
              userId: adminUserId,
              quantity: item.quantity,
              reference: `CANCEL-${order.receiptNumber}`,
              createdAt: Timestamp.now(),
            });
          }
        }
      }

      transaction.update(orderRef, {
        status: 'cancelled',
        cancelledBy: adminName,
        cancelledAt: Timestamp.now(),
        cancelReason: reason,
      });

      return { ...order, status: 'cancelled', cancelledBy: adminName, cancelReason: reason };
    });
  }

  async getUserProductFrequencies(userId: string): Promise<Record<string, number>> {
    const snapshot = await db.collection(ORDERS_COLLECTION)
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .get();

    const productCounts: Record<string, number> = {};

    if (snapshot.empty) return productCounts;

    snapshot.docs.forEach(doc => {
      const order = doc.data() as Order;
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          if (item.productId) {
            productCounts[item.productId] = (productCounts[item.productId] || 0) + item.quantity;
          }
        });
      }
    });

    return productCounts;
  }

  async getMostBoughtProduct(userId: string): Promise<Product | null> {
    const snapshot = await db.collection(ORDERS_COLLECTION)
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .get();

    if (snapshot.empty) return null;

    const productCounts: Record<string, number> = {};

    snapshot.docs.forEach(doc => {
      const order = doc.data() as Order;
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          if (item.productId) {
            productCounts[item.productId] = (productCounts[item.productId] || 0) + item.quantity;
          }
        });
      }
    });

    let maxProductId: string | null = null;
    let maxQuantity = 0;

    for (const [productId, quantity] of Object.entries(productCounts)) {
      if (quantity > maxQuantity) {
        maxQuantity = quantity;
        maxProductId = productId;
      }
    }

    if (!maxProductId) return null;

    try {
      return await productService.getById(maxProductId);
    } catch {
      return null;
    }
  }
}

export const orderService = new OrderService();
