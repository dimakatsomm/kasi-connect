import express, {
  Application,
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import logger from './config/logger';
import webhookRouter from './routes/webhook';
import ordersRouter from './routes/orders';
import productsRouter from './routes/products';
import vendorsRouter from './routes/vendors';
import categoriesRouter from './routes/categories';
import authRouter from './routes/auth';

const app: Application = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());

// ── Request logging ───────────────────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: { write: (msg: string) => logger.info(msg.trim()) },
  })
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files (uploaded product images) ────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response): void => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/webhook', webhookRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/products', productsRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/auth', authRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

export default app;
