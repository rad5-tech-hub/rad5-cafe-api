import { Router, Request, Response } from 'express';
import { categoryService } from '../services/categories';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';

const router = Router();

router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const categories = await categoryService.getAll();
    res.json({ success: true, data: categories });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const category = await categoryService.getById(req.params.id as string);
    res.json({ success: true, data: category });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
});

router.post('/', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }
    const category = await categoryService.create(name, description);
    res.status(201).json({ success: true, message: 'Category created', data: category });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, description, isActive } = req.body;
    await categoryService.update(req.params.id as string, { name, description, isActive });
    res.json({ success: true, message: 'Category updated' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    await categoryService.delete(req.params.id as string);
    res.json({ success: true, message: 'Category deleted' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
