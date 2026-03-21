import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import prisma from '../db';
import config from '../config';
import logger from '../config/logger';
import { requireAuth, AuthPayload } from '../middleware/auth';

const signOptions: SignOptions = { expiresIn: '7d' };

const router = Router();

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, phone, password, name, vendorId } = req.body;

    if ((!email && !phone) || !password || !vendorId) {
      res.status(400).json({ error: 'email or phone, password, and vendorId are required' });
      return;
    }

    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Verify vendor exists
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }

    // Check for existing user with same email or phone
    if (email) {
      const existingEmail = await prisma.vendorUser.findUnique({ where: { email } });
      if (existingEmail) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }
    }
    if (phone) {
      const existingPhone = await prisma.vendorUser.findUnique({ where: { phone } });
      if (existingPhone) {
        res.status(409).json({ error: 'Phone number already registered' });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.vendorUser.create({
      data: {
        email: email || null,
        phone: phone || null,
        password_hash: passwordHash,
        name: name || null,
        vendor_id: vendorId,
      },
      include: { vendor: true },
    });

    const payload: AuthPayload = {
      userId: user.id,
      vendorId: user.vendor_id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    const token = jwt.sign(payload, config.jwt.secret, signOptions);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        vendorId: user.vendor_id,
        vendorName: user.vendor.name,
      },
    });
  } catch (err) {
    logger.error('Registration failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, phone, password } = req.body;

    if ((!email && !phone) || !password) {
      res.status(400).json({ error: 'Email or phone, and password are required' });
      return;
    }

    const user = email
      ? await prisma.vendorUser.findUnique({ where: { email }, include: { vendor: true } })
      : await prisma.vendorUser.findUnique({ where: { phone }, include: { vendor: true } });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const payload: AuthPayload = {
      userId: user.id,
      vendorId: user.vendor_id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    const token = jwt.sign(payload, config.jwt.secret, signOptions);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        vendorId: user.vendor_id,
        vendorName: user.vendor.name,
      },
    });
  } catch (err) {
    logger.error('Login failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.vendorUser.findUnique({
      where: { id: req.user!.userId },
      include: { vendor: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        vendorId: user.vendor_id,
        vendorName: user.vendor.name,
      },
    });
  } catch (err) {
    logger.error('Failed to fetch user', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
