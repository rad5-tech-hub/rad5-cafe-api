import { Router, Request, Response } from 'express';
import { productService } from '../services/products.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { orderService } from '../services/orders.js';

const router = Router();

function str(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function num(val: unknown, defaultVal: number = 1): number {
  const n = parseInt(str(val), 10);
  return isNaN(n) ? defaultVal : n;
}

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const categoryId = str(req.query.category) || undefined;
    const search = str(req.query.search) || undefined;
    const page = num(req.query.page, 1);
    const limit = num(req.query.limit, 50);
    const isAdmin = req.user?.role === 'admin';
    const includeInactive = isAdmin && req.query.includeInactive === 'true';
    
    let frequencies: Record<string, number> | undefined;
    if (req.user && !isAdmin) {
      frequencies = await orderService.getUserProductFrequencies(req.user.userId);
    } else if (req.user && isAdmin) {
      // Admins might prefer default alphabetical sorting unless specified otherwise
      // But if we want it for admins too, we can just omit the !isAdmin check.
      // Let's do it for all authenticated users to be safe and fulfill the prompt.
      frequencies = await orderService.getUserProductFrequencies(req.user.userId);
    }
    
    const result = await productService.getAll(categoryId, search, page, limit, includeInactive, frequencies);
    res.json({ success: true, products: result.products, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/most-bought', authenticate, async (req: Request, res: Response) => {
  try {
    const product = await orderService.getMostBoughtProduct(req.user!.userId);
    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const product = await productService.getById(req.params.id as string);
    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
});

router.post('/', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, categoryId, description, imageUrl, costPrice, sellingPrice, quantity } = req.body;
    if (!name || !categoryId || costPrice === undefined || sellingPrice === undefined || quantity === undefined) {
      res.status(400).json({ success: false, message: 'Missing required fields' });
      return;
    }
    const product = await productService.create({
      name, categoryId, description, imageUrl, costPrice, sellingPrice, quantity,
    });
    res.status(201).json({ success: true, message: 'Product created', data: product });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/check-stock', authenticate, async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, message: 'Please provide a non-empty array of product IDs' });
      return;
    }
    const stockInfo = await productService.checkStock(ids as string[]);
    res.json({ success: true, data: stockInfo });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, categoryId, description, imageUrl, costPrice, sellingPrice, lowStockThreshold, isActive } = req.body;
    
    // Handle common Postman testing mistake where ':id' is passed literally
    let productId = req.params.id as string;
    if (productId === ':id') {
      productId = req.body.id || req.body.productId;
      if (!productId) {
        res.status(400).json({ success: false, message: 'Invalid product id. Please replace :id in the URL with the actual product ID, or provide it in the body.' });
        return;
      }
    }
    
    await productService.update(productId.trim(), {
      name, categoryId, description, imageUrl, costPrice, sellingPrice, lowStockThreshold, isActive,
    });
    res.json({ success: true, message: 'Product updated' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/restock', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { quantity, newCostPrice } = req.body;
    if (!quantity || quantity <= 0) {
      res.status(400).json({ success: false, message: 'Valid quantity required' });
      return;
    }
    const product = await productService.restock(req.params.id as string, quantity, newCostPrice);
    res.json({ success: true, message: 'Stock updated', data: product });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/remove-stock', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { quantity, reason } = req.body;
    if (!quantity || quantity <= 0) {
      res.status(400).json({ success: false, message: 'Valid quantity required' });
      return;
    }
    const product = await productService.removeStock(req.params.id as string, quantity, reason);
    res.json({ success: true, message: 'Stock removed successfully', data: product });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:id/stock-history', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const history = await productService.getStockHistory(req.params.id as string);
    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:id/history', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as 'day' | 'month' | 'year') || undefined;
    const startDate = str(req.query.startDate) || undefined;
    const endDate = str(req.query.endDate) || undefined;
    const result = await productService.getHistory(req.params.id as string, period, startDate, endDate);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/alerts/low-stock', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const products = await productService.getLowStockProducts();
    res.json({ success: true, data: products });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
