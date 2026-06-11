import { db, Timestamp, FieldValue } from '../config/firebase.js';
import { Product, StockHistory, Order } from '../types/index.js';
import { calculateProfit } from '../utils/helpers.js';

const PRODUCTS_COLLECTION = 'products';
const STOCK_HISTORY_COLLECTION = 'stock_history';

export class ProductService {
  async create(data: {
    name: string;
    categoryId: string;
    description: string;
    imageUrl: string;
    costPrice: number;
    sellingPrice: number;
    quantity: number;
    lowStockThreshold?: number;
  }): Promise<Product> {
    const profitPerUnit = calculateProfit(data.costPrice, data.sellingPrice);

    const ref = db.collection(PRODUCTS_COLLECTION).doc();
    const productData = {
      name: data.name,
      categoryId: data.categoryId,
      description: data.description,
      imageUrl: data.imageUrl,
      costPrice: data.costPrice,
      sellingPrice: data.sellingPrice,
      profitPerUnit,
      quantity: data.quantity,
      totalAdded: data.quantity,
      totalSold: 0,
      lowStockThreshold: data.lowStockThreshold || 10,
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await ref.set(productData);
    return { id: ref.id, ...productData } as unknown as Product;
  }

  async getAll(categoryId?: string, search?: string, page: number = 1, limit: number = 50, includeInactive: boolean = false): Promise<{ products: Product[]; total: number }> {
    let query = db.collection(PRODUCTS_COLLECTION) as FirebaseFirestore.Query;

    if (!includeInactive) {
      query = query.where('isActive', '==', true);
    }

    if (categoryId) {
      query = query.where('categoryId', '==', categoryId);
    }

    query = query.orderBy('name', 'asc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset((page - 1) * limit).limit(limit).get();
    let products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

    if (search) {
      const searchLower = search.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower)
      );
    }

    return { products, total };
  }

  async getById(id: string): Promise<Product> {
    const doc = await db.collection(PRODUCTS_COLLECTION).doc(id).get();
    if (!doc.exists) throw new Error('Product not found');
    return { id: doc.id, ...doc.data() } as Product;
  }

  async update(id: string, data: Partial<{
    name: string;
    categoryId: string;
    description: string;
    imageUrl: string;
    costPrice: number;
    sellingPrice: number;
    lowStockThreshold: number;
    isActive: boolean;
  }>): Promise<void> {
    const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Product not found');

    const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) updateData[key] = value;
    }

    if (data.costPrice !== undefined || data.sellingPrice !== undefined) {
      const current = doc.data() as Product;
      const costPrice = data.costPrice ?? current.costPrice;
      const sellingPrice = data.sellingPrice ?? current.sellingPrice;
      updateData.profitPerUnit = calculateProfit(costPrice, sellingPrice);
    }

    await ref.update(updateData);
  }

  async restock(id: string, quantity: number, newCostPrice?: number): Promise<Product> {
    if (quantity <= 0) throw new Error('Quantity must be positive');

    const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Product not found');

    const product = doc.data() as Product;
    const oldStock = product.quantity;

    const updateData: Record<string, unknown> = {
      quantity: FieldValue.increment(quantity),
      totalAdded: FieldValue.increment(quantity),
      updatedAt: Timestamp.now(),
    };

    if (newCostPrice && newCostPrice > 0) {
      updateData.costPrice = newCostPrice;
      updateData.profitPerUnit = calculateProfit(newCostPrice, product.sellingPrice);
    }

    await ref.update(updateData);

    const historyEntry: Record<string, unknown> = {
      productId: id,
      type: 'added',
      quantity,
      previousStock: oldStock,
      newStock: oldStock + quantity,
      reference: `RESTOCK-${Date.now()}`,
      createdAt: Timestamp.now(),
    };
    if (newCostPrice !== undefined) {
      historyEntry.costPrice = newCostPrice;
    }
    await db.collection(STOCK_HISTORY_COLLECTION).add(historyEntry as unknown as Partial<StockHistory>);

    return this.getById(id);
  }

  async reduceStock(id: string, quantity: number): Promise<void> {
    if (quantity <= 0) throw new Error('Quantity must be positive');

    const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Product not found');

    const product = doc.data() as Product;
    if (product.quantity < quantity) {
      throw new Error(`Insufficient stock for ${product.name}. Available: ${product.quantity}, requested: ${quantity}`);
    }

    await ref.update({
      quantity: FieldValue.increment(-quantity),
      totalSold: FieldValue.increment(quantity),
      updatedAt: Timestamp.now(),
    });
  }

  async getLowStockProducts(): Promise<Product[]> {
    const snapshot = await db.collection(PRODUCTS_COLLECTION)
      .where('isActive', '==', true)
      .get();
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
    return products
      .filter(p => p.quantity > 0 && p.quantity <= (p.lowStockThreshold || 10))
      .sort((a, b) => a.quantity - b.quantity);
  }

  async getStockHistory(productId: string): Promise<StockHistory[]> {
    const snapshot = await db.collection(STOCK_HISTORY_COLLECTION)
      .where('productId', '==', productId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockHistory));
  }

  async getHistory(productId: string, period?: 'day' | 'month' | 'year', startDate?: string, endDate?: string): Promise<{
    product: { id: string; name: string; currentStock: number; costPrice: number; sellingPrice: number; profitPerUnit: number };
    salesByPeriod: { period: string; totalQuantity: number; totalRevenue: number; totalProfit: number; orderCount: number }[];
    stockHistory: StockHistory[];
    summary: { totalSold: number; totalRevenue: number; totalProfit: number; averageSellingPrice: number };
  }> {
    const product = await this.getById(productId);

    let from: FirebaseFirestore.Timestamp | null = null;
    let to: FirebaseFirestore.Timestamp | null = null;

    if (startDate) from = Timestamp.fromDate(new Date(startDate));
    if (endDate) to = Timestamp.fromDate(new Date(endDate));

    if (!startDate && !endDate) {
      const now = new Date();
      if (period === 'day') {
        from = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
      } else if (period === 'month') {
        from = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), 1));
      } else if (period === 'year') {
        from = Timestamp.fromDate(new Date(now.getFullYear(), 0, 1));
      }
    }

    let ordersQuery: FirebaseFirestore.Query = db.collection('orders')
      .where('status', '==', 'completed')
      .orderBy('createdAt', 'desc');

    if (from) ordersQuery = ordersQuery.where('createdAt', '>=', from);
    if (to) ordersQuery = ordersQuery.where('createdAt', '<=', to);

    const ordersSnapshot = await ordersQuery.get();

    const sales: { period: string; quantity: number; revenue: number; profit: number; date: Date }[] = [];

    for (const doc of ordersSnapshot.docs) {
      const order = doc.data() as Order;
      const createdAt = (order.createdAt as FirebaseFirestore.Timestamp).toDate();
      for (const item of order.items) {
        if (item.productId === productId) {
          const profit = (item.unitPrice - item.costPrice) * item.quantity;

          let key: string;
          if (period === 'month') {
            key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
          } else if (period === 'year') {
            key = `${createdAt.getFullYear()}`;
          } else {
            key = createdAt.toISOString().slice(0, 10);
          }

          sales.push({ period: key, quantity: item.quantity, revenue: item.totalPrice, profit, date: createdAt });
        }
      }
    }

    const periodMap: Record<string, { totalQuantity: number; totalRevenue: number; totalProfit: number; orderCount: number }> = {};
    for (const s of sales) {
      if (!periodMap[s.period]) {
        periodMap[s.period] = { totalQuantity: 0, totalRevenue: 0, totalProfit: 0, orderCount: 0 };
      }
      periodMap[s.period].totalQuantity += s.quantity;
      periodMap[s.period].totalRevenue += s.revenue;
      periodMap[s.period].totalProfit += s.profit;
      periodMap[s.period].orderCount += 1;
    }

    const salesByPeriod = Object.entries(periodMap)
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => b.period.localeCompare(a.period));

    const totalSold = sales.reduce((sum, s) => sum + s.quantity, 0);
    const totalRevenue = sales.reduce((sum, s) => sum + s.revenue, 0);
    const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);

    const stockHistory = await this.getStockHistory(productId);

    return {
      product: {
        id: product.id,
        name: product.name,
        currentStock: product.quantity,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        profitPerUnit: product.profitPerUnit,
      },
      salesByPeriod,
      stockHistory,
      summary: {
        totalSold,
        totalRevenue,
        totalProfit,
        averageSellingPrice: totalSold > 0 ? Math.round(totalRevenue / totalSold) : 0,
      },
    };
  }

  async checkStock(productIds: string[]): Promise<{ productId: string; name: string; inStock: boolean; quantity: number; lowStockThreshold: number }[]> {
    if (!productIds.length) return [];

    const snapshot = await db.collection(PRODUCTS_COLLECTION)
      .where('isActive', '==', true)
      .where('__name__', 'in', productIds)
      .get();

    const found = snapshot.docs.map(doc => {
      const product = { id: doc.id, ...doc.data() } as Product;
      return {
        productId: doc.id,
        name: product.name,
        inStock: product.quantity > 0,
        quantity: product.quantity,
        lowStockThreshold: product.lowStockThreshold || 10,
      };
    });

    return found;
  }
}

export const productService = new ProductService();
