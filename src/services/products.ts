import { db, Timestamp, FieldValue } from '../config/firebase.js';
import { Product, StockHistory } from '../types/index.js';
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

  async getAll(categoryId?: string, search?: string, page: number = 1, limit: number = 50): Promise<{ products: Product[]; total: number }> {
    let query = db.collection(PRODUCTS_COLLECTION)
      .where('isActive', '==', true) as FirebaseFirestore.Query;

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
    isActive: boolean;
  }>): Promise<void> {
    const ref = db.collection(PRODUCTS_COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Product not found');

    const updateData: Record<string, unknown> = { ...data, updatedAt: Timestamp.now() };

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
      .where('quantity', '<=', 10)
      .orderBy('quantity', 'asc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
  }

  async getStockHistory(productId: string): Promise<StockHistory[]> {
    const snapshot = await db.collection(STOCK_HISTORY_COLLECTION)
      .where('productId', '==', productId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockHistory));
  }
}

export const productService = new ProductService();
