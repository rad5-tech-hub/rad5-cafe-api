import { db, Timestamp } from '../config/firebase.js';
import { User, Product, Order, Wallet } from '../types/index.js';

const USERS_COLLECTION = 'users';
const PRODUCTS_COLLECTION = 'products';
const ORDERS_COLLECTION = 'orders';
const TRANSACTIONS_COLLECTION = 'transactions';
const WALLETS_COLLECTION = 'wallets';

export class AnalyticsService {
  async getDashboardStats(): Promise<{
    today: { revenue: number; profit: number; salesCount: number };
    inventory: { totalProducts: number; lowStock: number; outOfStock: number };
    customers: { total: number; active: number };
    wallet: { totalValue: number; totalTransactions: number };
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    const todayOrdersSnapshot = await db.collection(ORDERS_COLLECTION)
      .where('createdAt', '>=', todayTimestamp)
      .get();
    const todayOrders = todayOrdersSnapshot.docs.map(d => d.data() as Order);
    const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const todayProfit = todayOrders.reduce((sum, o) => {
      const profit = o.items.reduce((p, i) => p + (i.unitPrice - i.costPrice) * i.quantity, 0);
      return sum + profit;
    }, 0);
    const salesCount = todayOrders.length;

    const allProducts = await db.collection(PRODUCTS_COLLECTION)
      .where('isActive', '==', true).get();
    const products = allProducts.docs.map(d => d.data() as Product);
    const totalProducts = products.length;
    const lowStock = products.filter(p => p.quantity > 0 && p.quantity <= (p.lowStockThreshold || 10)).length;
    const outOfStock = products.filter(p => p.quantity <= 0).length;

    const allUsers = await db.collection(USERS_COLLECTION).get();
    const users = allUsers.docs.map(d => d.data() as User);
    const total = users.length;
    const active = users.filter(u => u.isActive).length;

    const allWallets = await db.collection(WALLETS_COLLECTION).get();
    const wallets = allWallets.docs.map(d => d.data() as Wallet);
    const totalValue = wallets.reduce((sum, w) => sum + w.balance, 0);

    const allTxns = await db.collection(TRANSACTIONS_COLLECTION).count().get();
    const totalTransactions = allTxns.data().count;

    return {
      today: { revenue: todayRevenue, profit: todayProfit, salesCount },
      inventory: { totalProducts, lowStock, outOfStock },
      customers: { total, active },
      wallet: { totalValue, totalTransactions },
    };
  }

  async getRevenueAnalytics(period: 'daily' | 'weekly' | 'monthly', limit: number = 30) {
    const now = new Date();
    let startDate: Date;
    const intervals: Date[] = [];

    if (period === 'daily') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - limit);
      for (let i = 0; i < limit; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        intervals.push(d);
      }
    } else if (period === 'weekly') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - limit * 7);
      for (let i = 0; i < limit; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i * 7);
        intervals.push(d);
      }
    } else {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - limit);
      for (let i = 0; i < limit; i++) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + i);
        intervals.push(d);
      }
    }

    const snapshot = await db.collection(ORDERS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .get();

    const orders = snapshot.docs.map(d => d.data() as Order)
      .filter(o => {
        const orderDate = o.createdAt.toDate();
        return orderDate >= startDate;
      });

    const dataPoints = intervals.map((intervalDate) => {
      let end: Date;
      if (period === 'daily') {
        end = new Date(intervalDate);
        end.setDate(end.getDate() + 1);
      } else if (period === 'weekly') {
        end = new Date(intervalDate);
        end.setDate(end.getDate() + 7);
      } else {
        end = new Date(intervalDate);
        end.setMonth(end.getMonth() + 1);
      }

      const periodOrders = orders.filter(o => {
        const orderDate = o.createdAt.toDate();
        return orderDate >= intervalDate && orderDate < end;
      });

      const revenue = periodOrders.reduce((sum, o) => sum + o.total, 0);
      const profit = periodOrders.reduce((sum, o) => {
        return sum + o.items.reduce((p, i) => p + (i.unitPrice - i.costPrice) * i.quantity, 0);
      }, 0);

      return {
        period: intervalDate.toISOString().split('T')[0],
        revenue,
        profit,
        salesCount: periodOrders.length,
      };
    });

    return dataPoints;
  }

  async getTopProducts(limit: number = 10): Promise<{ bestSelling: Product[]; highestProfit: Product[] }> {
    const snapshot = await db.collection(PRODUCTS_COLLECTION)
      .where('isActive', '==', true)
      .orderBy('totalSold', 'desc')
      .limit(limit)
      .get();
    const bestSelling = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));

    const profitSnapshot = await db.collection(PRODUCTS_COLLECTION)
      .where('isActive', '==', true)
      .orderBy('profitPerUnit', 'desc')
      .limit(limit)
      .get();
    const highestProfit = profitSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));

    return { bestSelling, highestProfit };
  }

  async getCustomerInsights(limit: number = 10) {
    const allOrdersSnapshot = await db.collection(ORDERS_COLLECTION).get();
    const allOrders = allOrdersSnapshot.docs.map(d => d.data() as Order);

    const userMap = new Map<string, { orderCount: number; totalSpent: number }>();
    for (const order of allOrders) {
      const current = userMap.get(order.userId) || { orderCount: 0, totalSpent: 0 };
      current.orderCount++;
      current.totalSpent += order.total;
      userMap.set(order.userId, current);
    }

    const userEntries = Array.from(userMap.entries())
      .map(([userId, stats]) => ({ userId, ...stats }));

    const mostActive = userEntries
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, limit);

    const highestSpending = userEntries
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit);

    // Fetch user names
    for (const entry of mostActive) {
      const userDoc = await db.collection(USERS_COLLECTION).doc(entry.userId).get();
      if (userDoc.exists) {
        (entry as any).fullName = (userDoc.data() as User).fullName;
      } else {
        (entry as any).fullName = 'Unknown';
      }
    }
    for (const entry of highestSpending) {
      const userDoc = await db.collection(USERS_COLLECTION).doc(entry.userId).get();
      if (userDoc.exists) {
        (entry as any).fullName = (userDoc.data() as User).fullName;
      } else {
        (entry as any).fullName = 'Unknown';
      }
    }

    return { mostActive, highestSpending };
  }

  async getProfitAnalytics() {
    const allOrdersSnapshot = await db.collection(ORDERS_COLLECTION).get();
    const allOrders = allOrdersSnapshot.docs.map(d => d.data() as Order);

    const productProfits = new Map<string, { productName: string; totalProfit: number; totalRevenue: number }>();
    let lifetimeProfit = 0;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let dailyProfit = 0;
    let monthlyProfit = 0;

    for (const order of allOrders) {
      const orderDate = order.createdAt.toDate();
      for (const item of order.items) {
        const profit = (item.unitPrice - item.costPrice) * item.quantity;
        lifetimeProfit += profit;

        if (orderDate >= todayStart) dailyProfit += profit;
        if (orderDate >= monthStart) monthlyProfit += profit;

        const existing = productProfits.get(item.productId) || { productName: item.productName, totalProfit: 0, totalRevenue: 0 };
        existing.totalProfit += profit;
        existing.totalRevenue += item.totalPrice;
        productProfits.set(item.productId, existing);
      }
    }

    const productProfit = Array.from(productProfits.entries())
      .map(([productId, data]) => ({ productId, ...data }))
      .sort((a, b) => b.totalProfit - a.totalProfit);

    return { productProfit, dailyProfit, monthlyProfit, lifetimeProfit };
  }
}

export const analyticsService = new AnalyticsService();
