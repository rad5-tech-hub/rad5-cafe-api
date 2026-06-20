import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { db, Timestamp, FieldValue } from '../config/firebase.js';
import { env } from '../config/env.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';
import { productService } from '../services/products.js';
import { categoryService } from '../services/categories.js';
import { orderService } from '../services/orders.js';
import { analyticsService } from '../services/analytics.js';
import { notificationService } from '../services/notifications.js';
import { adminReportsService } from '../services/adminReports.js';
import { hashPin, verifyPin } from '../utils/pin-hash.js';
import { Product, Order, User, Category } from '../types/index.js';

const router = Router();

// Helper functions
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

async function logAudit(userId: string, action: string, resource: string, resourceId: string, details: Record<string, unknown>, req: Request): Promise<void> {
  await notificationService.logAudit({
    userId,
    action,
    resource,
    resourceId,
    details,
    ip: req.ip || '',
  });
}

function str(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function num(val: unknown, defaultVal: number = 1): number {
  const n = parseInt(str(val), 10);
  return isNaN(n) ? defaultVal : n;
}

// ─── AUTHENTICATION (SUPERADMIN ONLY) ──────────────────────────

/**
 * Superadmin Login
 */
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    // Find admin user in Firestore
    const snapshot = await db.collection('users')
      .where('email', '==', email)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    if (snapshot.empty) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const userDoc = snapshot.docs[0]!;
    const user = userDoc.data() as User;

    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'Account is deactivated' });
      return;
    }

    let isMatch = false;

    // Check if passwordHash is set on Firestore user document
    const data = user as any;
    if (data.passwordHash) {
      isMatch = await bcryptjs.compare(password, data.passwordHash);
    } else {
      // Fallback: check against environmental admin credentials if password is not in database
      if (email === env.admin.email && password === env.admin.password) {
        // Hash it on-the-fly and save for next logins
        const hashed = await bcryptjs.hash(password, 12);
        await userDoc.ref.update({ passwordHash: hashed, updatedAt: Timestamp.now() });
        isMatch = true;
      }
    }

    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: userDoc.id, email: user.email, role: user.role, walletId: user.walletId },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn as any }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: userDoc.id,
        uid: user.uid,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        walletId: user.walletId,
        pinSetup: user.pinSetup,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Setup Admin Transaction PIN
 */
router.post('/auth/setup-pin', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ success: false, message: 'PIN must be exactly 4 digits' });
      return;
    }

    const userId = req.user!.userId;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, message: 'Admin user not found' });
      return;
    }

    const user = userDoc.data() as User;
    if (user.pinSetup) {
      res.status(400).json({ success: false, message: 'PIN already set up' });
      return;
    }

    const hashedPin = await hashPin(pin);
    await userRef.update({ pin: hashedPin, pinSetup: true, updatedAt: Timestamp.now() });

    res.json({ success: true, message: 'Transaction PIN set up successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Change Admin Transaction PIN
 */
router.post('/auth/change-pin', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { oldPin, newPin } = req.body;
    if (!oldPin || !newPin || !/^\d{4}$/.test(newPin)) {
      res.status(400).json({ success: false, message: 'Old PIN and valid 4-digit new PIN are required' });
      return;
    }

    const userId = req.user!.userId;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      res.status(404).json({ success: false, message: 'Admin user not found' });
      return;
    }

    const user = userDoc.data() as User;
    const isMatch = await verifyPin(oldPin, user.pin || '');
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Current PIN is incorrect' });
      return;
    }

    const hashedPin = await hashPin(newPin);
    await userRef.update({ pin: hashedPin, updatedAt: Timestamp.now() });

    res.json({ success: true, message: 'Transaction PIN changed successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── DASHBOARD OVERVIEW ────────────────────────────────────────

/**
 * Dashboard Stats Overview
 */
router.get('/overview', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await analyticsService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── INVENTORY MANAGEMENT ──────────────────────────────────────

/**
 * Add Product
 */
router.post('/products', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { name, categoryId, description, imageUrl, costPrice, sellingPrice, quantity, lowStockThreshold, pin } = req.body;
    
    if (!name || !categoryId || costPrice === undefined || sellingPrice === undefined || quantity === undefined) {
      res.status(400).json({ success: false, message: 'Product Name, Category, Cost Price, Selling Price, and Initial Quantity are required' });
      return;
    }

    // Verify Admin PIN
    await verifyAdminPin(req.user!.userId, pin);

    // Call service to create
    const product = await productService.create({
      name,
      categoryId,
      description: description || '',
      imageUrl: imageUrl || '',
      costPrice: Number(costPrice),
      sellingPrice: Number(sellingPrice),
      quantity: Number(quantity),
      lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : 10,
    });

    // Log Audit Trail
    await logAudit(req.user!.userId, 'add_product', 'products', product.id, { product }, req);

    res.status(201).json({ success: true, message: 'Product added successfully', data: product });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Restock Inventory
 */
router.post('/products/:id/restock', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { quantity, newCostPrice, pin } = req.body;
    const productId = req.params.id as string;

    if (quantity === undefined || Number(quantity) <= 0) {
      res.status(400).json({ success: false, message: 'Valid Quantity Added is required' });
      return;
    }

    // Verify PIN
    await verifyAdminPin(req.user!.userId, pin);

    // Call service to restock
    const product = await productService.restock(productId, Number(quantity), newCostPrice ? Number(newCostPrice) : undefined);

    // Log Audit Trail
    const auditDetails: Record<string, unknown> = { quantity };
    if (newCostPrice !== undefined) {
      auditDetails.newCostPrice = Number(newCostPrice);
    }
    await logAudit(req.user!.userId, 'restock_product', 'products', productId, auditDetails, req);

    res.json({ success: true, message: 'Product restocked successfully', data: product });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Remove Stock (Misentry Correction)
 */
router.post('/products/:id/remove-stock', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { quantity, reason, pin } = req.body;
    const productId = req.params.id as string;

    if (quantity === undefined || Number(quantity) <= 0) {
      res.status(400).json({ success: false, message: 'Valid quantity is required' });
      return;
    }

    await verifyAdminPin(req.user!.userId, pin);

    const product = await productService.removeStock(productId, Number(quantity), reason);

    await logAudit(req.user!.userId, 'remove_stock', 'products', productId, { quantity: Number(quantity), reason }, req);

    res.json({ success: true, message: 'Stock removed successfully', data: product });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Inventory Tracking List
 */
router.get('/inventory-tracking', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 50);

    const snapshot = await db.collection('products')
      .orderBy('name', 'asc')
      .offset((page - 1) * limit)
      .limit(limit)
      .get();

    const products = snapshot.docs.map(doc => {
      const data = doc.data() as Product;
      return {
        id: doc.id,
        name: data.name,
        categoryId: data.categoryId,
        imageUrl: data.imageUrl,
        costPrice: data.costPrice,
        sellingPrice: data.sellingPrice,
        totalAdded: data.totalAdded || data.quantity,
        totalSold: data.totalSold || 0,
        currentStock: data.quantity,
        remainingValue: data.quantity * data.costPrice,
        isActive: data.isActive,
      };
    });

    const countSnapshot = await db.collection('products').count().get();
    const total = countSnapshot.data().count;

    res.json({
      success: true,
      data: products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Product Analytics (sales, revenue, profit for a single product)
 */
router.get('/products/:id/analytics', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const productId = req.params.id as string;
    const rawPeriod = (req.query.period as string) || 'this_month';

    let period: 'day' | 'month' | 'year' | undefined;
    if (rawPeriod === 'today' || rawPeriod === 'this_day') {
      period = 'day';
    } else if (rawPeriod === 'this_month') {
      period = 'month';
    } else if (rawPeriod === 'this_year') {
      period = 'year';
    } else {
      period = rawPeriod as 'day' | 'month' | 'year';
    }

    const startDate = str(req.query.startDate) || undefined;
    const endDate = str(req.query.endDate) || undefined;

    const result = await productService.getHistory(productId, period, startDate, endDate);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── PRODUCT CATEGORIES ────────────────────────────────────────

/**
 * Create Category
 */
router.post('/categories', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }
    const category = await categoryService.create(name, description);
    await logAudit(req.user!.userId, 'create_category', 'categories', category.id, { name, description }, req);
    res.status(201).json({ success: true, message: 'Category created successfully', data: category });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Edit Category
 */
router.put('/categories/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, isActive } = req.body;
    const categoryId = req.params.id as string;

    await categoryService.update(categoryId, { name, description, isActive });
    await logAudit(req.user!.userId, 'edit_category', 'categories', categoryId, { name, description, isActive }, req);
    res.json({ success: true, message: 'Category updated successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Delete Category
 */
router.delete('/categories/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const categoryId = req.params.id as string;
    await categoryService.delete(categoryId);
    await logAudit(req.user!.userId, 'delete_category', 'categories', categoryId, {}, req);
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── SALES MANAGEMENT ──────────────────────────────────────────

/**
 * Get All Sales (with Revenue, Profit, Customer Name, and Filters)
 */
router.get('/sales', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const filter = (req.query.filter as string || 'all').toLowerCase();
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 20);

    const now = new Date();

    const buildQuery = (): FirebaseFirestore.Query => {
      let q = db.collection('orders') as FirebaseFirestore.Query;
      q = q.orderBy('createdAt', 'desc');

      if (filter === 'daily') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        q = q.where('createdAt', '>=', Timestamp.fromDate(today));
      } else if (filter === 'weekly') {
        const weekly = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        q = q.where('createdAt', '>=', Timestamp.fromDate(weekly));
      } else if (filter === 'monthly') {
        const monthly = new Date(now.getFullYear(), now.getMonth(), 1);
        q = q.where('createdAt', '>=', Timestamp.fromDate(monthly));
      } else if (filter === 'custom') {
        const start = req.query.startDate ? new Date(str(req.query.startDate)) : undefined;
        const end = req.query.endDate ? new Date(str(req.query.endDate)) : undefined;
        if (start) q = q.where('createdAt', '>=', Timestamp.fromDate(start));
        if (end) q = q.where('createdAt', '<=', Timestamp.fromDate(end));
      }
      return q;
    };

    const aggregateQuery = buildQuery().select('total', 'items');
    const pageQuery = buildQuery().offset((page - 1) * limit).limit(limit);

    const [aggregateSnapshot, countSnapshot, pageSnapshot] = await Promise.all([
      aggregateQuery.get(),
      buildQuery().count().get(),
      pageQuery.get(),
    ]);

    const totalOrders = countSnapshot.data().count;

    let totalRevenue = 0;
    let totalProfit = 0;
    for (const doc of aggregateSnapshot.docs) {
      const d = doc.data();
      totalRevenue += d.total || 0;
      totalProfit += (d.items || []).reduce((sum: number, item: any) =>
        sum + (item.unitPrice - item.costPrice) * item.quantity, 0);
    }

    const orders = pageSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    const uniqueUserIds = [...new Set(orders.map(o => o.userId))];
    const userDocs = uniqueUserIds.length > 0
      ? await db.getAll(...uniqueUserIds.map(id => db.collection('users').doc(id)))
      : [];

    const userNameMap = new Map<string, string>();
    for (const doc of userDocs) {
      if (doc.exists) {
        const userData = doc.data() as User;
        userNameMap.set(doc.id, userData.fullName?.trim() || userData.email?.split('@')[0] || 'Unnamed Customer');
      }
    }

    const salesList = [];
    for (const order of orders) {
      const customerName = userNameMap.get(order.userId) || 'Unknown';

      const profit = order.items.reduce((sum, item) => 
        sum + (item.unitPrice - item.costPrice) * item.quantity, 0
      );

      salesList.push({
        id: order.id,
        receiptNumber: order.receiptNumber,
        customerName,
        items: order.items,
        revenue: order.total,
        profit,
        status: order.status,
        issued: order.issued ?? false,
        issuedBy: order.issuedBy || null,
        issuedAt: order.issuedAt?.toDate?.()?.toISOString() || null,
        date: order.createdAt.toDate().toISOString(),
      });
    }

    res.json({
      success: true,
      data: salesList,
      totalRevenue,
      totalProfit,
      totalOrders,
      total: totalOrders,
      page,
      limit,
      totalPages: Math.ceil(totalOrders / limit),
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Adjust Sale Status (Cancel and Refund Wallet / Revert Stock)
 */
router.put('/sales/:id/adjust', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id as string;
    const { status, pin } = req.body;

    if (!status || !['pending', 'completed', 'cancelled'].includes(status)) {
      res.status(400).json({ success: false, message: 'Valid status is required' });
      return;
    }

    // Verify PIN
    await verifyAdminPin(req.user!.userId, pin);

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }

    const order = orderDoc.data() as Order;
    const oldStatus = order.status;

    if (oldStatus === status) {
      res.status(400).json({ success: false, message: `Order status is already ${status}` });
      return;
    }

    // Perform refund and revert stock if cancelled
    if (status === 'cancelled') {
      const userRef = db.collection('users').doc(order.userId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) throw new Error('Customer user not found');
      
      const user = userDoc.data() as User;
      const walletSnapshot = await db.collection('wallets').where('walletId', '==', user.walletId).limit(1).get();
      if (walletSnapshot.empty) throw new Error('Customer wallet not found');
      const walletDoc = walletSnapshot.docs[0]!;

      await db.runTransaction(async (transaction) => {
        // 1. Revert product stocks
        for (const item of order.items) {
          const productRef = db.collection('products').doc(item.productId);
          transaction.update(productRef, {
            quantity: FieldValue.increment(item.quantity),
            totalSold: FieldValue.increment(-item.quantity),
            updatedAt: Timestamp.now(),
          });
          transaction.set(db.collection('stock_history').doc(), {
            productId: item.productId,
            type: 'adjusted',
            quantity: item.quantity,
            reference: `REFUND-${order.receiptNumber}`,
            createdAt: Timestamp.now(),
          });
        }

        // 2. Refund wallet balance
        transaction.update(walletDoc.ref, {
          balance: FieldValue.increment(order.total),
          totalSpent: FieldValue.increment(-order.total),
          updatedAt: Timestamp.now(),
        });

        // 3. Create wallet refund transaction log
        transaction.set(db.collection('transactions').doc(), {
          walletId: user.walletId,
          userId: order.userId,
          type: 'funding',
          amount: order.total,
          fee: 0,
          reference: `REF-${order.receiptNumber}`,
          description: `Refund for cancelled order ${order.receiptNumber}`,
          status: 'completed',
          paymentMethod: 'wallet',
          createdAt: Timestamp.now(),
        });

        // 4. Update order status
        transaction.update(orderRef, {
          status: 'cancelled',
          updatedAt: Timestamp.now(),
        });
      });
    } else {
      await orderRef.update({ status, updatedAt: Timestamp.now() });
    }

    // Log Audit Trail
    await logAudit(req.user!.userId, 'adjust_sale', 'orders', orderId, { oldStatus, newStatus: status }, req);

    res.json({ success: true, message: `Order status adjusted to ${status} successfully` });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Get Unissued Orders (paid but not yet processed/issued by admin)
 */
router.get('/sales/unissued', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 20);
    const result = await orderService.getUnissuedOrders(page, limit);
    res.json({ success: true, orders: result.orders, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Issue an Order (mark as processed by admin)
 */
router.put('/sales/:id/issue', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id as string;
    const order = await orderService.issueOrder(orderId, req.user!.userId);

    await logAudit(req.user!.userId, 'issue_order', 'orders', orderId, {
      receiptNumber: order.receiptNumber,
      total: order.total,
    }, req);

    res.json({ success: true, message: 'Order issued successfully', data: order });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── REVENUE & PROFIT ANALYTICS ────────────────────────────────

/**
 * Daily Analytics
 */
router.get('/analytics/daily', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const data = await analyticsService.getDailyAnalytics(limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Weekly Analytics
 */
router.get('/analytics/weekly', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const data = await analyticsService.getWeeklyAnalytics(limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Monthly Analytics
 */
router.get('/analytics/monthly', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const data = await analyticsService.getMonthlyAnalytics(limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Deep Custom Analytics
 */
router.get('/analytics/custom', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    if (!req.query.startDate || !req.query.endDate) {
      res.status(400).json({ success: false, message: 'startDate and endDate are required' });
      return;
    }
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);
    endDate.setHours(23, 59, 59, 999);
    
    const data = await analyticsService.getDeepCustomAnalytics(startDate, endDate);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Revenue Analytics Charts Data
 */
router.get('/analytics/revenue', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as 'daily' | 'weekly' | 'monthly') || 'daily';
    const limit = parseInt(req.query.limit as string) || 30;
    const data = await analyticsService.getRevenueAnalytics(period, limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Top Performing Products
 */
router.get('/analytics/top-products', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await analyticsService.getTopProducts(limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Customer Insights
 */
router.get('/analytics/customers', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const data = await analyticsService.getCustomerInsights(limit);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Profit Analytics Margins
 */
router.get('/analytics/profit', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const data = await analyticsService.getProfitAnalytics();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── INVENTORY ALERTS ──────────────────────────────────────────

/**
 * Get All Unacknowledged Stock Alerts
 */
router.get('/alerts', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    // Regenerate alerts in case stock updated
    await notificationService.checkInventoryAlerts();
    const alerts = await notificationService.getAlerts(false);
    res.json({ success: true, data: alerts });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * Acknowledge Inventory Alert
 */
router.put('/alerts/:id/acknowledge', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const alertId = req.params.id as string;
    await notificationService.acknowledgeAlert(alertId);
    res.json({ success: true, message: 'Alert acknowledged successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── MANUAL WALLET OPERATIONS ──────────────────────────────────

/**
 * Adjust Customer Wallet Balance (Fund / Debit)
 */
router.post('/wallet/adjust', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, amount, description, pin } = req.body;

    if (!userId || amount === undefined || Number(amount) === 0) {
      res.status(400).json({ success: false, message: 'Customer ID and non-zero amount are required' });
      return;
    }

    // Verify Admin PIN
    await verifyAdminPin(req.user!.userId, pin);

    // Get wallet
    const walletSnapshot = await db.collection('wallets').where('userId', '==', userId).limit(1).get();
    if (walletSnapshot.empty) {
      res.status(404).json({ success: false, message: 'Customer wallet not found' });
      return;
    }
    const walletDoc = walletSnapshot.docs[0]!;
    const wallet = walletDoc.data();

    const amt = Number(amount);
    if (amt < 0 && wallet.balance < Math.abs(amt)) {
      res.status(400).json({ success: false, message: `Insufficient wallet balance. Available: ₦${wallet.balance}` });
      return;
    }

    const txnRef = db.collection('transactions').doc();

    await db.runTransaction(async (transaction) => {
      // 1. Update wallet balance
      transaction.update(walletDoc.ref, {
        balance: FieldValue.increment(amt),
        ...(amt > 0 
          ? { totalFunded: FieldValue.increment(amt) } 
          : { totalSpent: FieldValue.increment(Math.abs(amt)) }
        ),
        updatedAt: Timestamp.now(),
      });

      // 2. Log transaction
      transaction.set(txnRef, {
        walletId: wallet.walletId,
        userId,
        type: amt > 0 ? 'funding' : 'withdrawal',
        amount: amt,
        fee: 0,
        reference: `ADJ-${Date.now()}`,
        description: description || 'Admin manual balance adjustment',
        status: 'completed',
        paymentMethod: 'wallet',
        createdAt: Timestamp.now(),
      });
    });

    // Log Audit Trail
    await logAudit(req.user!.userId, 'wallet_transaction', 'wallets', walletDoc.id, { userId, amount: amt, description }, req);

    res.json({ success: true, message: 'Wallet balance adjusted successfully', data: { balance: wallet.balance + amt } });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── REPORTS EXPORT ────────────────────────────────────────────

/**
 * Export Reports (PDF, Excel, CSV)
 */
router.get('/reports/export', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const type = str(req.query.type).toLowerCase(); // sales, inventory, profit, transactions
    const format = str(req.query.format).toLowerCase(); // pdf, excel, csv
    const startDate = req.query.startDate ? new Date(str(req.query.startDate)) : undefined;
    const endDate = req.query.endDate ? new Date(str(req.query.endDate)) : undefined;
    const userId = str(req.query.userId) || undefined;

    if (!type || !['sales', 'inventory', 'profit', 'transactions'].includes(type)) {
      res.status(400).json({ success: false, message: 'Valid report type is required (sales, inventory, profit, transactions)' });
      return;
    }

    if (!format || !['pdf', 'excel', 'csv'].includes(format)) {
      res.status(400).json({ success: false, message: 'Valid format is required (pdf, excel, csv)' });
      return;
    }

    const filename = `${type}_report_${Date.now()}`;
    const downloadsDir = path.join(process.cwd(), 'public', 'downloads');
    let fileExt = format;
    if (format === 'excel') fileExt = 'xlsx';

    const fullFileName = `${filename}.${fileExt}`;
    const filePath = path.join(downloadsDir, fullFileName);
    const downloadUrl = `/downloads/${fullFileName}`;

    if (format === 'excel') {
      const buffer = await adminReportsService.generateExcel(type, startDate, endDate, userId);
      fs.writeFileSync(filePath, buffer as any);
      res.json({ success: true, downloadUrl });
      return;
    }

    if (format === 'csv') {
      const csvString = await adminReportsService.generateCsv(type, startDate, endDate, userId);
      fs.writeFileSync(filePath, csvString);
      res.json({ success: true, downloadUrl });
      return;
    }

    if (format === 'pdf') {
      const buffer = await adminReportsService.generatePdf(type, startDate, endDate, userId);
      fs.writeFileSync(filePath, buffer);
      res.json({ success: true, downloadUrl });
      return;
    }
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
