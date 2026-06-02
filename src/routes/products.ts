import { Router, Request, Response } from 'express';
import { productService } from '../services/products';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';

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
    const result = await productService.getAll(categoryId, search, page, limit);
    res.json({ success: true, ...result });
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

router.put('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, categoryId, description, imageUrl, costPrice, sellingPrice, isActive } = req.body;
    await productService.update(req.params.id as string, {
      name, categoryId, description, imageUrl, costPrice, sellingPrice, isActive,
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

router.get('/:id/stock-history', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const history = await productService.getStockHistory(req.params.id as string);
    res.json({ success: true, data: history });
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
