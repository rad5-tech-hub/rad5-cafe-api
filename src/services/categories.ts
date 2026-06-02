import { db, Timestamp } from '../config/firebase';
import { Category } from '../types';

const CATEGORIES_COLLECTION = 'categories';

export class CategoryService {
  async create(name: string, description?: string): Promise<Category> {
    const existing = await db.collection(CATEGORIES_COLLECTION)
      .where('name', '==', name).limit(1).get();
    if (!existing.empty) throw new Error('Category already exists');

    const ref = db.collection(CATEGORIES_COLLECTION).doc();
    const data = {
      name,
      description,
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await ref.set(data);
    return { id: ref.id, ...data } as unknown as Category;
  }

  async getAll(): Promise<Category[]> {
    const snapshot = await db.collection(CATEGORIES_COLLECTION)
      .where('isActive', '==', true)
      .orderBy('name', 'asc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
  }

  async getById(id: string): Promise<Category> {
    const doc = await db.collection(CATEGORIES_COLLECTION).doc(id).get();
    if (!doc.exists) throw new Error('Category not found');
    return { id: doc.id, ...doc.data() } as Category;
  }

  async update(id: string, data: Partial<{ name: string; description: string; isActive: boolean }>): Promise<void> {
    const ref = db.collection(CATEGORIES_COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Category not found');

    const updateData: Record<string, unknown> = { ...data, updatedAt: Timestamp.now() };
    await ref.update(updateData);
  }

  async delete(id: string): Promise<void> {
    const ref = db.collection(CATEGORIES_COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) throw new Error('Category not found');

    const productsWithCategory = await db.collection('products')
      .where('categoryId', '==', id).limit(1).get();
    if (!productsWithCategory.empty) {
      throw new Error('Cannot delete category with associated products');
    }

    await ref.delete();
  }
}

export const categoryService = new CategoryService();
