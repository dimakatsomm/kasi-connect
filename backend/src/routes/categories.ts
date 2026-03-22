import { Router, Request, Response } from 'express';
import prisma from '../db';
import logger from '../config/logger';

const router = Router();

/**
 * GET /api/categories
 * List all categories with their sub-categories.
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        sub_categories: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (err) {
    logger.error('Failed to list categories', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
