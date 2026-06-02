import { Router, Request, Response } from 'express';
import { imageService } from '../services/images';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';

const router = Router();

router.get('/search', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const count = parseInt(req.query.count as string) || 10;
    if (!query) {
      res.status(400).json({ success: false, message: 'Search query is required' });
      return;
    }
    const images = await imageService.searchImages(query, count);
    res.json({ success: true, data: images });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
