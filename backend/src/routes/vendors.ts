import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '../db';
import logger from '../config/logger';
import type { VendorRow } from '../types';
import { Prisma } from '../generated/prisma';

const router = Router();

/**
 * GET /api/vendors
 * List all active vendors.
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const vendors = await prisma.vendor.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        phone: true,
        address: true,
        whatsappNumber: true,
        deliveryFee: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    // Convert to snake_case format for backward compatibility
    const vendorsResponse = vendors.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      phone: v.phone,
      address: v.address,
      whatsapp_number: v.whatsappNumber,
      delivery_fee: v.deliveryFee.toNumber(),
      is_active: v.isActive,
      created_at: v.createdAt.toISOString(),
      updated_at: v.updatedAt.toISOString(),
    }));

    res.json({ vendors: vendorsResponse });
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
      const vendor = await prisma.vendor.findUnique({
        where: { id: req.params.id },
      });

      if (!vendor) {
        res.status(404).json({ error: 'Vendor not found' });
        return;
      }

      // Convert to snake_case format for backward compatibility
      const vendorResponse: VendorRow = {
        id: vendor.id,
        name: vendor.name,
        type: vendor.type,
        phone: vendor.phone,
        address: vendor.address,
        whatsapp_number: vendor.whatsappNumber,
        delivery_fee: vendor.deliveryFee.toNumber(),
        is_active: vendor.isActive,
        created_at: vendor.createdAt.toISOString(),
        updated_at: vendor.updatedAt.toISOString(),
      };

      res.json({ vendor: vendorResponse });
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
      const vendor = await prisma.vendor.create({
        data: {
          name,
          type: type as 'retail' | 'food',
          phone,
          address,
          whatsappNumber,
          deliveryFee,
        },
      });

      const vendorResponse: VendorRow = {
        id: vendor.id,
        name: vendor.name,
        type: vendor.type,
        phone: vendor.phone,
        address: vendor.address,
        whatsapp_number: vendor.whatsappNumber,
        delivery_fee: vendor.deliveryFee.toNumber(),
        is_active: vendor.isActive,
        created_at: vendor.createdAt.toISOString(),
        updated_at: vendor.updatedAt.toISOString(),
      };

      res.status(201).json({ vendor: vendorResponse });
    } catch (err) {
      const pgErr = err as { code?: string; message: string };
      if (pgErr.code === 'P2002') {
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
      'whatsappNumber',
      'deliveryFee',
      'isActive',
    ];
    const updates: Prisma.VendorUpdateInput = {};
    const bodyData = req.body as Record<string, unknown>;

    for (const field of allowed) {
      const snakeKey = field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      if (bodyData[field] !== undefined || bodyData[snakeKey] !== undefined) {
        updates[field as keyof Prisma.VendorUpdateInput] = (bodyData[field] ?? bodyData[snakeKey]) as any;
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    try {
      const vendor = await prisma.vendor.update({
        where: { id: req.params.id },
        data: updates,
      });

      const vendorResponse: VendorRow = {
        id: vendor.id,
        name: vendor.name,
        type: vendor.type,
        phone: vendor.phone,
        address: vendor.address,
        whatsapp_number: vendor.whatsappNumber,
        delivery_fee: vendor.deliveryFee.toNumber(),
        is_active: vendor.isActive,
        created_at: vendor.createdAt.toISOString(),
        updated_at: vendor.updatedAt.toISOString(),
      };

      res.json({ vendor: vendorResponse });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        res.status(404).json({ error: 'Vendor not found' });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Failed to update vendor', { error: message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
