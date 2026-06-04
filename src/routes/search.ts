import { Router, Request, Response } from 'express';
import { db } from '../config/firebase.js';
import { Product, Category } from '../types/index.js';
import { authenticate } from '../middleware/auth.js';

const PRODUCTS_COLLECTION = 'products';
const CATEGORIES_COLLECTION = 'categories';

const router = Router();

router.get('/products', authenticate, async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').toLowerCase();
    const categoryId = req.query.category as string;

    let productsQuery = db.collection(PRODUCTS_COLLECTION)
      .where('isActive', '==', true) as FirebaseFirestore.Query;

    if (categoryId) {
      productsQuery = productsQuery.where('categoryId', '==', categoryId);
    }

    const snapshot = await productsQuery.get();
    let products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

    if (q) {
      products = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: products });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/categories', authenticate, async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.collection(CATEGORIES_COLLECTION)
      .where('isActive', '==', true)
      .orderBy('name', 'asc')
      .get();
    const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
    res.json({ success: true, data: categories });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
