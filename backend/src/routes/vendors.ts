import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import * as db from '../db';
import logger from '../config/logger';
import type { VendorRow } from '../types';

const router = Router();

/**
 * GET /api/vendors
 * List all active vendors.
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.query<VendorRow>(
      `SELECT id, name, type, phone, address, whatsapp_number, delivery_fee, is_active, created_at
       FROM vendors WHERE is_active = TRUE ORDER BY name`
    );
    res.json({ vendors: result.rows });
  } catch (err) {
    logger.error('Failed to list vendors', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/vendors/:id
 */
router.get(
  '/:id',
  param('id').isUUID(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const result = await db.query<VendorRow>(
        'SELECT * FROM vendors WHERE id = $1',
        [req.params.id]
      );
      if (!result.rows[0]) {
        res.status(404).json({ error: 'Vendor not found' });
        return;
      }
      res.json({ vendor: result.rows[0] });
    } catch (err) {
      logger.error('Failed to get vendor', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/vendors
 * Create a new vendor.
 */
router.post(
  '/',
  [
    body('name').notEmpty().trim(),
    body('type').isIn(['retail', 'food']),
    body('phone').notEmpty().trim(),
    body('address').optional().trim(),
    body('deliveryFee').optional().isFloat({ min: 0 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name, type, phone, address, whatsappNumber, deliveryFee = 0 } =
      req.body as {
        name: string;
        type: string;
        phone: string;
        address?: string;
        whatsappNumber?: string;
        deliveryFee?: number;
      };

    try {
      const result = await db.query<VendorRow>(
        `INSERT INTO vendors (name, type, phone, address, whatsapp_number, delivery_fee)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [name, type, phone, address, whatsappNumber, deliveryFee]
      );
      res.status(201).json({ vendor: result.rows[0] });
    } catch (err) {
      const pgErr = err as { code?: string; message: string };
      if (pgErr.code === '23505') {
        res.status(409).json({ error: 'Phone number already registered' });
        return;
      }
      logger.error('Failed to create vendor', { error: pgErr.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /api/vendors/:id
 */
router.patch(
  '/:id',
  param('id').isUUID(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const allowed = [
      'name',
      'address',
      'whatsapp_number',
      'delivery_fee',
      'is_active',
    ];
    const updates: string[] = [];
    const values: unknown[] = [req.params.id];
    const bodyData = req.body as Record<string, unknown>;

    for (const field of allowed) {
      const camelKey = field.replace(/_([a-z])/g, (_, c: string) =>
        c.toUpperCase()
      );
      if (bodyData[camelKey] !== undefined || bodyData[field] !== undefined) {
        values.push(bodyData[camelKey] ?? bodyData[field]);
        updates.push(`${field} = $${values.length}`);
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    try {
      const result = await db.query<VendorRow>(
        `UPDATE vendors SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        values
      );
      if (!result.rows[0]) {
        res.status(404).json({ error: 'Vendor not found' });
        return;
      }
      res.json({ vendor: result.rows[0] });
    } catch (err) {
      logger.error('Failed to update vendor', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
