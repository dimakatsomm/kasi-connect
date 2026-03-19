import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import logger from '../config/logger';
import type { VendorType } from '../types';

const router = Router();

/**
 * GET /api/vendors
 * List all active vendors.
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const vendors = await prisma.vendor.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        type: true,
        phone: true,
        address: true,
        whatsapp_number: true,
        delivery_fee: true,
        is_active: true,
        created_at: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json({ vendors });
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
      res.json({ vendor });
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

    const {
      name,
      type,
      phone,
      address,
      whatsappNumber,
      deliveryFee = 0,
    } = req.body as {
      name: string;
      type: VendorType;
      phone: string;
      address?: string;
      whatsappNumber?: string;
      deliveryFee?: number;
    };

    try {
      const vendor = await prisma.vendor.create({
        data: {
          name,
          type,
          phone,
          address,
          whatsapp_number: whatsappNumber,
          delivery_fee: deliveryFee ?? 0,
        },
      });
      res.status(201).json({ vendor });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        res.status(409).json({ error: 'Phone number already registered' });
        return;
      }
      logger.error('Failed to create vendor', {
        error: err instanceof Error ? err.message : String(err),
      });
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

    const bodyData = req.body as Record<string, unknown>;
    const toCamel = (value: string): string =>
      value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const readField = (field: string): unknown =>
      bodyData[toCamel(field)] ?? bodyData[field];

    const data: Prisma.VendorUpdateInput = {};

    const nameValue = readField('name');
    if (typeof nameValue === 'string') {
      data.name = nameValue;
    }

    const addressValue = readField('address');
    if (typeof addressValue === 'string' || addressValue === null) {
      data.address = addressValue;
    }

    const whatsappValue = readField('whatsapp_number');
    if (typeof whatsappValue === 'string' || whatsappValue === null) {
      data.whatsapp_number = whatsappValue;
    }

    const deliveryFeeValue = readField('delivery_fee');
    if (deliveryFeeValue !== undefined) {
      const parsed =
        typeof deliveryFeeValue === 'number'
          ? deliveryFeeValue
          : typeof deliveryFeeValue === 'string'
            ? parseFloat(deliveryFeeValue)
            : NaN;
      if (!Number.isFinite(parsed) || parsed < 0) {
        res.status(400).json({ error: 'Delivery fee must be a valid number greater than or equal to 0 (e.g. 25 or 9.99)' });
        return;
      }
      data.delivery_fee = parsed;
    }

    const isActiveValue = readField('is_active');
    if (typeof isActiveValue === 'boolean') {
      data.is_active = isActiveValue;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    try {
      const vendor = await prisma.vendor.update({
        where: { id: req.params.id },
        data,
      });
      res.json({ vendor });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        res.status(404).json({ error: 'Vendor not found' });
        return;
      }
      logger.error('Failed to update vendor', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
