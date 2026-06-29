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
    wallet: { totalValue: number; totalTransactions: number; unreconciledLimboTotal: number; unreconciledLimboCount: number };
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    const [
      todayOrdersSnapshot,
      productsSnapshot,
      usersCountSnapshot,
      activeUsersCountSnapshot,
      walletsSnapshot,
      txnsCountSnapshot,
      expensesSnapshot,
      limboOrdersSnapshot,
    ] = await Promise.all([
      db.collection(ORDERS_COLLECTION)
        .where('createdAt', '>=', todayTimestamp)
        .get(),
      db.collection(PRODUCTS_COLLECTION)
        .where('isActive', '==', true)
        .get(),
      db.collection(USERS_COLLECTION).count().get(),
      db.collection(USERS_COLLECTION)
        .where('isActive', '==', true)
        .count()
        .get(),
      db.collection(WALLETS_COLLECTION).get(),
      db.collection(TRANSACTIONS_COLLECTION).count().get(),
      db.collection('expenses')
        .where('date', '>=', todayTimestamp)
        .get(),
      db.collection(ORDERS_COLLECTION)
        .where('reconciliationStatus', '==', 'limbo')
        .get(),
    ]);

    const todayOrders = todayOrdersSnapshot.docs.map(d => d.data() as Order & { items?: Array<{ unitPrice: number; costPrice: number; quantity: number }> });
    let todayRevenue = 0;
    let todayProfit = 0;
    let salesCount = 0;
    for (const o of todayOrders) {
      if (o.reconciliationStatus === 'limbo') continue;
      salesCount++;
      todayRevenue += o.total || 0;
      if (o.items) {
        for (const item of o.items) {
          todayProfit += (item.unitPrice - item.costPrice) * item.quantity;
        }
      }
    }

    let todayExpenses = 0;
    for (const doc of expensesSnapshot.docs) {
      const exp = doc.data();
      todayExpenses += exp.amount || 0;
    }
    todayRevenue -= todayExpenses;
    todayProfit -= todayExpenses;

    const products = productsSnapshot.docs.map(d => d.data() as Product);
    const totalProducts = products.length;
    let lowStock = 0;
    let outOfStock = 0;
    for (const p of products) {
      if (p.quantity <= 0) outOfStock++;
      else if (p.quantity <= (p.lowStockThreshold || 10)) lowStock++;
    }

    const totalUsers = usersCountSnapshot.data().count;
    const activeUsers = activeUsersCountSnapshot.data().count;

    const wallets = walletsSnapshot.docs.map(d => d.data() as Wallet);
    let totalValue = 0;
    for (const w of wallets) {
      totalValue += w.balance || 0;
    }

    const totalTransactions = txnsCountSnapshot.data().count;

    const limboOrders = limboOrdersSnapshot.docs.map(d => d.data() as Order);
    let unreconciledLimboTotal = 0;
    for (const o of limboOrders) {
      unreconciledLimboTotal += o.total || 0;
    }
    const unreconciledLimboCount = limboOrders.length;

    return {
      today: { revenue: todayRevenue, profit: todayProfit, salesCount },
      inventory: { totalProducts, lowStock, outOfStock },
      customers: { total: totalUsers, active: activeUsers },
      wallet: { totalValue, totalTransactions, unreconciledLimboTotal, unreconciledLimboCount },
    };
  }

  async getRevenueAnalytics(period: 'daily' | 'weekly' | 'monthly', limit: number = 30) {
    const now = new Date();
    let startDate: Date;

    if (period === 'daily') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - limit + 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'weekly') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - limit * 7);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - limit);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    }

    const snapshot = await db.collection(ORDERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .orderBy('createdAt', 'desc')
      .get();

    const orders = snapshot.docs.map(d => d.data() as Order & { items?: Array<{ unitPrice: number; costPrice: number; quantity: number }> });

    const bucketMap = new Map<string, { revenue: number; profit: number; salesCount: number }>();

    for (const order of orders) {
      if (order.reconciliationStatus === 'limbo') continue;
      const orderDate = order.createdAt.toDate();
      let key: string;
      if (period === 'daily') {
        key = orderDate.toISOString().split('T')[0];
      } else if (period === 'weekly') {
        const weekStart = new Date(orderDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}-01`;
      }

      const entry = bucketMap.get(key) || { revenue: 0, profit: 0, salesCount: 0 };
      entry.revenue += order.total || 0;
      entry.salesCount++;

      if (order.items) {
        for (const item of order.items) {
          entry.profit += (item.unitPrice - item.costPrice) * item.quantity;
        }
      }
      bucketMap.set(key, entry);
    }

    const intervals: Date[] = [];
    if (period === 'daily') {
      for (let i = 0; i < limit; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        intervals.push(d);
      }
    } else if (period === 'weekly') {
      for (let i = 0; i < limit; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i * 7);
        intervals.push(d);
      }
    } else {
      for (let i = 0; i < limit; i++) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + i);
        intervals.push(d);
      }
    }

    const dataPoints = intervals.map((intervalDate) => {
      let key: string;
      if (period === 'daily') {
        key = intervalDate.toISOString().split('T')[0];
      } else if (period === 'weekly') {
        key = intervalDate.toISOString().split('T')[0];
      } else {
        key = `${intervalDate.getFullYear()}-${String(intervalDate.getMonth() + 1).padStart(2, '0')}-01`;
      }

      const entry = bucketMap.get(key);
      return {
        period: key,
        revenue: entry?.revenue || 0,
        profit: entry?.profit || 0,
        salesCount: entry?.salesCount || 0,
      };
    });

    return dataPoints;
  }

  async getTopProducts(limit: number = 10): Promise<{ bestSelling: Product[]; highestProfit: Product[] }> {
    const [snapshot, profitSnapshot] = await Promise.all([
      db.collection(PRODUCTS_COLLECTION)
        .where('isActive', '==', true)
        .orderBy('totalSold', 'desc')
        .limit(limit)
        .get(),
      db.collection(PRODUCTS_COLLECTION)
        .where('isActive', '==', true)
        .orderBy('profitPerUnit', 'desc')
        .limit(limit)
        .get(),
    ]);

    const bestSelling = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
    const highestProfit = profitSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));

    return { bestSelling, highestProfit };
  }

  async getCustomerInsights(limit: number = 10) {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const allOrdersSnapshot = await db.collection(ORDERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(threeMonthsAgo))
      .get();
    const allOrders = allOrdersSnapshot.docs.map(d => d.data() as Order);

    const userMap = new Map<string, { orderCount: number; totalSpent: number }>();
    for (const order of allOrders) {
      if (order.reconciliationStatus === 'limbo') continue;
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

    const uniqueUserIds = [...new Set([...mostActive, ...highestSpending].map(e => e.userId))];
    const userDocs = uniqueUserIds.length > 0
      ? await db.getAll(...uniqueUserIds.map(id => db.collection(USERS_COLLECTION).doc(id)))
      : [];

    const userNameMap = new Map<string, string>();
    for (const doc of userDocs) {
      if (doc.exists) {
        const user = doc.data() as User;
        userNameMap.set(doc.id, user.fullName || 'Unknown');
      }
    }

    for (const entry of mostActive) {
      (entry as any).fullName = userNameMap.get(entry.userId) || 'Unknown';
    }
    for (const entry of highestSpending) {
      (entry as any).fullName = userNameMap.get(entry.userId) || 'Unknown';
    }

    return { mostActive, highestSpending };
  }

  async getProfitAnalytics() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const allOrdersSnapshot = await db.collection(ORDERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(monthStart))
      .get();
    const allOrders = allOrdersSnapshot.docs.map(d => d.data() as Order & { items?: Array<{ productId: string; productName: string; unitPrice: number; costPrice: number; quantity: number; totalPrice: number }> });

    const productProfits = new Map<string, { productName: string; totalProfit: number; totalRevenue: number }>();
    let dailyProfit = 0;
    let monthlyProfit = 0;

    for (const order of allOrders) {
      if (order.reconciliationStatus === 'limbo') continue;
      const orderDate = order.createdAt.toDate();
      for (const item of order.items || []) {
        const profit = (item.unitPrice - item.costPrice) * item.quantity;
        monthlyProfit += profit;

        if (orderDate >= todayStart) dailyProfit += profit;

        const existing = productProfits.get(item.productId) || { productName: item.productName, totalProfit: 0, totalRevenue: 0 };
        existing.totalProfit += profit;
        existing.totalRevenue += item.totalPrice;
        productProfits.set(item.productId, existing);
      }
    }

    const productProfit = Array.from(productProfits.entries())
      .map(([productId, data]) => ({ productId, ...data }))
      .sort((a, b) => b.totalProfit - a.totalProfit);

    const lifetimeSnapshot = await db.collection(ORDERS_COLLECTION).count().get();
    const totalOrderCount = lifetimeSnapshot.data().count;

    return { productProfit, dailyProfit, monthlyProfit, lifetimeProfit: monthlyProfit, totalOrders: totalOrderCount };
  }

  async getDailyAnalytics(limit: number = 5) {
    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const snapshot = await db.collection(ORDERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .get();
    
    const orders = snapshot.docs.map(d => d.data() as Order);

    let totalRevenue = 0;
    let totalProfit = 0;
    let salesCount = 0;

    const hourBuckets = new Map<string, { revenue: number; profit: number; salesCount: number }>();
    const productSales = new Map<string, { name: string; quantitySold: number; revenue: number; profit: number; marginPercent: number }>();

    for (let i = 0; i < 24; i++) {
      const hourStr = `${i.toString().padStart(2, '0')}:00`;
      hourBuckets.set(hourStr, { revenue: 0, profit: 0, salesCount: 0 });
    }

    for (const order of orders) {
      if (order.reconciliationStatus === 'limbo') continue;
      salesCount++;
      const orderDate = order.createdAt.toDate();
      const hourStr = `${orderDate.getHours().toString().padStart(2, '0')}:00`;
      const bucket = hourBuckets.get(hourStr) || { revenue: 0, profit: 0, salesCount: 0 };
      
      bucket.revenue += order.total || 0;
      bucket.salesCount++;
      totalRevenue += order.total || 0;

      for (const item of order.items || []) {
        const itemProfit = (item.unitPrice - item.costPrice) * item.quantity;
        bucket.profit += itemProfit;
        totalProfit += itemProfit;

        const pData = productSales.get(item.productId) || { name: item.productName, quantitySold: 0, revenue: 0, profit: 0, marginPercent: 0 };
        pData.quantitySold += item.quantity;
        pData.revenue += item.totalPrice;
        pData.profit += itemProfit;
        pData.marginPercent = pData.revenue > 0 ? (pData.profit / pData.revenue) * 100 : 0;
        productSales.set(item.productId, pData);
      }
      hourBuckets.set(hourStr, bucket);
    }

    const newUsersSnapshot = await db.collection(USERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .count()
      .get();

    const topProducts = Array.from(productSales.values())
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, limit);
      
    const highestMarginProduct = Array.from(productSales.values())
      .sort((a, b) => b.marginPercent - a.marginPercent)[0] || null;

    let busiestHour = '';
    let maxHourSales = -1;
    const revenueByHour = [];
    for (const [hour, data] of hourBuckets.entries()) {
      if (data.salesCount > maxHourSales) {
        maxHourSales = data.salesCount;
        busiestHour = hour;
      }
      revenueByHour.push({ hour, ...data });
    }

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      summary: { totalRevenue, totalProfit, totalSalesCount: salesCount, newCustomers: newUsersSnapshot.data().count },
      trend: { busiestHour, revenueByHour },
      highlights: { topSellingProduct: topProducts[0] || null, highestMarginProduct, topProducts }
    };
  }

  async getWeeklyAnalytics(limit: number = 5) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    start.setHours(0, 0, 0, 0);

    const snapshot = await db.collection(ORDERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .get();
    
    const orders = snapshot.docs.map(d => d.data() as Order);

    let totalRevenue = 0;
    let totalProfit = 0;
    let salesCount = 0;

    const dayBuckets = new Map<string, { revenue: number; profit: number; salesCount: number }>();
    const productSales = new Map<string, { name: string; quantitySold: number; revenue: number; profit: number; marginPercent: number }>();

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dayBuckets.set(d.toISOString().split('T')[0], { revenue: 0, profit: 0, salesCount: 0 });
    }

    for (const order of orders) {
      if (order.reconciliationStatus === 'limbo') continue;
      salesCount++;
      const dateKey = order.createdAt.toDate().toISOString().split('T')[0];
      const bucket = dayBuckets.get(dateKey) || { revenue: 0, profit: 0, salesCount: 0 };
      
      bucket.revenue += order.total || 0;
      bucket.salesCount++;
      totalRevenue += order.total || 0;

      for (const item of order.items || []) {
        const itemProfit = (item.unitPrice - item.costPrice) * item.quantity;
        bucket.profit += itemProfit;
        totalProfit += itemProfit;

        const pData = productSales.get(item.productId) || { name: item.productName, quantitySold: 0, revenue: 0, profit: 0, marginPercent: 0 };
        pData.quantitySold += item.quantity;
        pData.revenue += item.totalPrice;
        pData.profit += itemProfit;
        pData.marginPercent = pData.revenue > 0 ? (pData.profit / pData.revenue) * 100 : 0;
        productSales.set(item.productId, pData);
      }
      dayBuckets.set(dateKey, bucket);
    }

    const newUsersSnapshot = await db.collection(USERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .count()
      .get();

    const topProducts = Array.from(productSales.values())
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, limit);
      
    const highestMarginProduct = Array.from(productSales.values())
      .sort((a, b) => b.marginPercent - a.marginPercent)[0] || null;

    let busiestDay = '';
    let maxDaySales = -1;
    const revenueByDay = [];
    for (const [date, data] of dayBuckets.entries()) {
      if (data.salesCount > maxDaySales) {
        maxDaySales = data.salesCount;
        const d = new Date(date);
        busiestDay = d.toLocaleDateString('en-US', { weekday: 'long' });
      }
      revenueByDay.push({ date, ...data });
    }

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      summary: { totalRevenue, totalProfit, totalSalesCount: salesCount, newCustomers: newUsersSnapshot.data().count },
      trend: { busiestDay, revenueByDay },
      highlights: { topSellingProduct: topProducts[0] || null, highestMarginProduct, topProducts }
    };
  }

  async getMonthlyAnalytics(limit: number = 5) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    start.setHours(0, 0, 0, 0);

    const snapshot = await db.collection(ORDERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .get();
    
    const orders = snapshot.docs.map(d => d.data() as Order);

    let totalRevenue = 0;
    let totalProfit = 0;
    let salesCount = 0;

    const weekBuckets = new Map<string, { revenue: number; profit: number; salesCount: number }>();
    for (let i = 1; i <= 5; i++) weekBuckets.set(`Week ${i}`, { revenue: 0, profit: 0, salesCount: 0 });

    const userSpends = new Map<string, { userId: string; orderCount: number; totalSpent: number }>();

    for (const order of orders) {
      if (order.reconciliationStatus === 'limbo') continue;
      salesCount++;
      totalRevenue += order.total || 0;
      const orderDate = order.createdAt.toDate();
      const diffTime = Math.abs(orderDate.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const weekNum = Math.min(5, Math.ceil(diffDays / 7) || 1);
      
      const wBucket = weekBuckets.get(`Week ${weekNum}`)!;
      wBucket.revenue += order.total || 0;
      wBucket.salesCount++;

      for (const item of order.items || []) {
        const itemProfit = (item.unitPrice - item.costPrice) * item.quantity;
        totalProfit += itemProfit;
        wBucket.profit += itemProfit;
      }
      weekBuckets.set(`Week ${weekNum}`, wBucket);

      const uSpend = userSpends.get(order.userId) || { userId: order.userId, orderCount: 0, totalSpent: 0 };
      uSpend.orderCount++;
      uSpend.totalSpent += order.total || 0;
      userSpends.set(order.userId, uSpend);
    }

    const newUsersSnapshot = await db.collection(USERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .count()
      .get();

    const topSpenderObj = Array.from(userSpends.values()).sort((a, b) => b.totalSpent - a.totalSpent)[0];
    let topSpender = null;
    if (topSpenderObj) {
      const userDoc = await db.collection(USERS_COLLECTION).doc(topSpenderObj.userId).get();
      topSpender = { fullName: userDoc.exists ? (userDoc.data() as any).fullName : 'Unknown', totalSpent: topSpenderObj.totalSpent, orderCount: topSpenderObj.orderCount };
    }

    const productsSnapshot = await db.collection(PRODUCTS_COLLECTION).get();
    const productToCat = new Map<string, string>();
    productsSnapshot.docs.forEach(d => {
      productToCat.set(d.id, (d.data() as any).categoryId);
    });
    const catSnapshot = await db.collection('categories').get();
    const catNames = new Map<string, string>();
    catSnapshot.docs.forEach(d => catNames.set(d.id, (d.data() as any).name));

    const catSales = new Map<string, { categoryName: string; revenue: number }>();
    for (const order of orders) {
      for (const item of order.items || []) {
        const catId = productToCat.get(item.productId);
        const catName = catId ? catNames.get(catId) || 'Unknown' : 'Unknown';
        const cData = catSales.get(catId || 'unknown') || { categoryName: catName, revenue: 0 };
        cData.revenue += item.totalPrice;
        catSales.set(catId || 'unknown', cData);
      }
    }

    const topCategories = Array.from(catSales.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit)
      .map(c => ({ ...c, percentageOfTotal: totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0 }));

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      summary: { totalRevenue, totalProfit, totalSalesCount: salesCount, newCustomers: newUsersSnapshot.data().count },
      trend: { revenueByWeek: Array.from(weekBuckets.entries()).map(([week, data]) => ({ week, ...data })) },
      highlights: { topCategories, topSpender }
    };
  }

  async getDeepCustomAnalytics(startDate: Date, endDate: Date) {
    const ordersSnapshot = await db.collection(ORDERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('createdAt', '<=', Timestamp.fromDate(endDate))
      .get();
    
    const orders = ordersSnapshot.docs.map(d => d.data() as Order);

    let totalRevenue = 0;
    let totalCostOfGoods = 0;
    let walletPayments = 0;

    const hourCounts = new Map<string, number>();
    const dayCounts = new Map<string, number>();
    const dayRevenues = new Map<string, number>();
    const userSpends = new Map<string, { userId: string; orderCount: number; totalSpent: number }>();
    const pairCounts = new Map<string, { pair: string[], count: number, revenue: number }>();
    const productStats = new Map<string, { name: string; sold: number; revenue: number; profit: number }>();

    let validSalesCount = 0;
    for (const order of orders) {
      if (order.reconciliationStatus === 'limbo') continue;
      validSalesCount++;
      totalRevenue += order.total || 0;
      
      const orderDate = order.createdAt.toDate();
      const hour = orderDate.getHours().toString().padStart(2, '0') + ':00';
      const day = orderDate.toLocaleDateString('en-US', { weekday: 'long' });

      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
      dayRevenues.set(day, (dayRevenues.get(day) || 0) + (order.total || 0));

      walletPayments += order.total || 0; 

      const uSpend = userSpends.get(order.userId) || { userId: order.userId, orderCount: 0, totalSpent: 0 };
      uSpend.orderCount++;
      uSpend.totalSpent += order.total || 0;
      userSpends.set(order.userId, uSpend);

      const itemIds = order.items.map(i => i.productId).sort();
      for (const item of order.items) {
        totalCostOfGoods += (item.costPrice * item.quantity);
        const pStat = productStats.get(item.productId) || { name: item.productName, sold: 0, revenue: 0, profit: 0 };
        pStat.sold += item.quantity;
        pStat.revenue += item.totalPrice;
        pStat.profit += (item.unitPrice - item.costPrice) * item.quantity;
        productStats.set(item.productId, pStat);
      }

      for (let i = 0; i < itemIds.length; i++) {
        for (let j = i + 1; j < itemIds.length; j++) {
          const id1 = itemIds[i];
          const id2 = itemIds[j];
          if (id1 !== id2) {
            const key = `${id1}_${id2}`;
            const existing = pairCounts.get(key) || { 
              pair: [order.items.find(x => x.productId === id1)?.productName || id1, order.items.find(x => x.productId === id2)?.productName || id2],
              count: 0,
              revenue: 0
            };
            existing.count++;
            existing.revenue += order.total || 0;
            pairCounts.set(key, existing);
          }
        }
      }
    }

    const grossProfit = totalRevenue - totalCostOfGoods;
    const profitMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const averageOrderValue = validSalesCount > 0 ? totalRevenue / validSalesCount : 0;

    const walletsSnapshot = await db.collection(WALLETS_COLLECTION).get();
    const totalOutstandingLiability = walletsSnapshot.docs.reduce((sum, doc) => sum + ((doc.data().balance as number) || 0), 0);

    const busiestHours = Array.from(hourCounts.entries())
      .map(([hour, orderCount]) => ({ hour, orderCount }))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 5);

    const busiestDays = Array.from(dayRevenues.entries())
      .map(([day, revenue]) => ({ day, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const highestMarginProducts = Array.from(productStats.values())
      .map(p => ({ name: p.name, quantitySold: p.sold, marginPercent: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0 }))
      .sort((a, b) => b.marginPercent - a.marginPercent)
      .slice(0, 5);

    const frequentlyBoughtTogether = Array.from(pairCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(p => ({ pair: p.pair, timesBoughtTogether: p.count, pairRevenue: p.revenue }));

    const productsSnapshot = await db.collection(PRODUCTS_COLLECTION).where('isActive', '==', true).get();
    const activeProducts = productsSnapshot.docs.map(d => ({ id: d.id, name: (d.data() as any).name, quantity: (d.data() as any).quantity, updatedAt: (d.data() as any).updatedAt }));
    const deadStock = activeProducts
      .filter(p => !productStats.has(p.id))
      .map(p => {
        let days = 0;
        if (p.updatedAt) {
          const diff = new Date().getTime() - p.updatedAt.toDate().getTime();
          days = Math.floor(diff / (1000 * 3600 * 24));
        }
        return { name: p.name, daysSinceLastSale: days, currentStock: p.quantity };
      })
      .sort((a, b) => b.currentStock - a.currentStock)
      .slice(0, 5);

    const topSpendersArr = Array.from(userSpends.values()).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5);
    const topSpenderUids = topSpendersArr.map(s => s.userId);
    let userMap = new Map<string, string>();
    if (topSpenderUids.length > 0) {
      const uDocs = await db.getAll(...topSpenderUids.map(id => db.collection(USERS_COLLECTION).doc(id)));
      uDocs.forEach(d => {
        if (d.exists) userMap.set(d.id, (d.data() as any).fullName || 'Unknown');
      });
    }

    const topSpenders = topSpendersArr.map(s => ({
      userId: s.userId,
      fullName: userMap.get(s.userId) || 'Unknown',
      orderCount: s.orderCount,
      totalSpent: s.totalSpent
    }));

    const customersSnapshot = await db.collection(USERS_COLLECTION).count().get();
    const totalActive = customersSnapshot.data().count;

    const newCustomersSnapshot = await db.collection(USERS_COLLECTION)
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('createdAt', '<=', Timestamp.fromDate(endDate))
      .count()
      .get();
    const newCustomers = newCustomersSnapshot.data().count;

    return {
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
      financials: {
        totalRevenue,
        totalCostOfGoods,
        grossProfit,
        profitMarginPercent,
        averageOrderValue,
        paymentsByMethod: { wallet: walletPayments },
        walletHealth: { totalOutstandingLiability }
      },
      operations: { busiestHours, busiestDays },
      products: { highestMarginProducts, deadStock, frequentlyBoughtTogether },
      customers: {
        totalActive,
        newVsReturning: { newCustomers, returningCustomers: userSpends.size - newCustomers },
        retentionMetrics: {
          averageVisitsPerCustomer: userSpends.size > 0 ? validSalesCount / userSpends.size : 0,
          customerLifetimeValueAvg: userSpends.size > 0 ? totalRevenue / userSpends.size : 0
        },
        topSpenders
      }
    };
  }
}

export const analyticsService = new AnalyticsService();
