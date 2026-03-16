# Copilot Instructions for KasiConnect

## Project Overview

KasiConnect is a WhatsApp-first ordering platform for township spaza shops and kasi eateries in South Africa. Customers place orders in any South African language (English, isiZulu, Sepedi, Setswana) via WhatsApp — no app download needed. Vendors manage fulfilment through a lightweight PWA dashboard.

Core flow: **WhatsApp → Meta Cloud webhook → Node/Express backend → Redis sessions + PostgreSQL orders + Kafka notifications → WhatsApp reply + Next.js dashboard**.

---

## Repository Layout

```
kasi-connect/
├── backend/          # Node.js 20 / Express / TypeScript service
├── frontend/         # Next.js 16 App Router PWA (TypeScript)
├── terraform/        # Huawei Cloud IaC (CCE, GaussDB, OBS, etc.)
├── docker-compose.yml
├── CODEX.md          # Architecture quick-reference
└── .github/
    └── workflows/
        ├── ci.yml        # Lint / build / test for both apps
        └── terraform.yml # Terraform fmt / init / validate / plan
```

---

## Backend

### Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Language | TypeScript 5 (strict mode, `commonjs`, ES2020 target) |
| ORM | Prisma 5 (`@prisma/client`) |
| Database | PostgreSQL 15 (Huawei GaussDB-compatible) |
| Session store | Redis (ioredis) |
| Message queue | Kafka (KafkaJS) |
| NLP | Custom SA-language parser + Fuse.js fuzzy matching |
| Voice-to-text | Huawei ModelArts STT |
| Object storage | Huawei OBS |
| Logging | Winston |

### Key Source Paths

- `src/app.ts` — Express app wiring (middlewares, routers, health check)
- `src/server.ts` — HTTP server bootstrap + Kafka consumer startup
- `src/config/index.ts` — Centralised env config (typed, validated)
- `src/config/logger.ts` — Shared Winston logger
- `src/routes/` — `webhook.ts`, `orders.ts`, `products.ts`, `vendors.ts`
- `src/services/` — `messageHandler.ts`, `nlpService.ts`, `orderService.ts`, `productService.ts`, `sessionService.ts`, `whatsappService.ts`, `voiceService.ts`
- `src/db/index.ts` — PrismaClient singleton (default export) + legacy pg helpers
- `src/kafka/producer.ts` — Publishes `order.ready` events (errors are caught/logged internally, never re-thrown)
- `src/kafka/consumer.ts` — Handles `order.ready` and specials broadcast
- `src/types/index.ts` — Shared enums/interfaces (session states, WhatsApp payloads, order DTOs)
- `backend/prisma/schema.prisma` — Prisma schema; Prisma models use **camelCase** fields (e.g. `vendorId`) mapped via `@map` to snake_case DB columns (e.g. `vendor_id`)

### Conventions

- **Database access**: Always import PrismaClient as the default export from `../db` (or `../../db`). Do **not** write raw SQL outside of migration files.
- **Prisma field naming**: Model fields are camelCase (`vendorId`, `deliveryFee`, `isActive`); DB columns are snake_case (`vendor_id`, `delivery_fee`, `is_active`) via `@map`.
- **Row types**: `ProductRow`, `VendorRow`, etc. in `src/types/index.ts` use snake_case to match Postgres column names.
- **Error handling in Kafka**: `publishEvent()` catches and logs all errors internally; callers must never rely on it throwing.
- **Image URLs**: `Product.image_url` is stored and returned as a relative path (`/uploads/<filename>`), not an absolute URL.
- **Frontend API URL**: Derived from `process.env.NEXT_PUBLIC_API_URL` (default `http://localhost:3000`); must be set at Next.js build time for client bundles.

### Commands

```bash
# Install
cd backend && npm ci

# Lint (ESLint with @typescript-eslint)
npm run lint

# Build (outputs to dist/)
npm run build

# Dev (tsx watch, hot-reload)
npm run dev

# Tests (Jest + ts-jest, runs in-band)
npm test
npm run test:coverage

# Prisma
npm run prisma:generate       # Regenerate client after schema changes
npm run prisma:migrate:dev    # Create + apply a new migration (dev only)
npm run prisma:migrate:deploy # Apply pending migrations (production/CI)
```

### Testing

- Framework: **Jest** with `ts-jest`; config lives in `backend/package.json` under `"jest"`
- Setup file: `tests/setup.ts` — sets required env vars before module loading
- Test files match: `**/tests/**/*.test.ts`
- Mocking pattern for Prisma: mock the module at `../src/db`, not individual query methods:
  ```ts
  jest.mock('../src/db', () => ({
    __esModule: true,
    default: { product: { findMany: jest.fn() } },
  }));
  ```
- Run a single test file: `npx jest tests/orderService.test.ts --runInBand`

---

## Frontend

### Stack

| Concern | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 (strict mode) |
| UI | React 19, Tailwind CSS 4 |
| Data fetching | TanStack Query (React Query) v5 |
| HTTP client | axios |
| Real-time | socket.io-client |

### Key Source Paths

- `src/app/layout.tsx` — Root layout (PWA metadata, fonts, theme)
- `src/app/providers.tsx` — QueryClient provider
- `src/app/dashboard/page.tsx` — Main vendor workspace
- `src/components/orders/KanbanBoard.tsx` — New / Preparing / Ready Kanban with drag-and-drop
- `src/components/products/` — `ProductManagement.tsx`, `AddProductForm.tsx`
- `src/hooks/useApi.ts` — TanStack Query hooks wrapping API calls
- `src/lib/api.ts` — Centralised axios/fetch helpers (reads `NEXT_PUBLIC_API_URL`)
- `src/types/index.ts` — TypeScript types mirroring backend DTOs

### Commands

```bash
# Install
cd frontend && npm ci

# Lint (ESLint with eslint-config-next)
npm run lint

# Build
npm run build

# Dev server (http://localhost:3000)
npm run dev
```

---

## Infrastructure (Terraform)

Located in `terraform/`. CI runs `fmt`, `init`, `validate`, and `plan` on every PR via `.github/workflows/terraform.yml`. Never apply infrastructure changes without a reviewed Terraform plan.

---

## Local Development

1. **Copy env files**: `cp backend/.env.example backend/.env` and edit with real credentials; create `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:3000`.
2. **Start dependencies**: `docker-compose up postgres redis kafka -d`
3. **Run migrations**: `cd backend && npm run prisma:migrate:deploy`
4. **Start backend**: `cd backend && npm run dev`
5. **Start frontend**: `cd frontend && npm run dev`
6. **Expose webhook**: `ngrok http 3000`, then register the URL in the Meta Cloud API console.

---

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`/`develop`:

1. **Backend job**: `npm ci` → `npm run lint` → `npm run build` → `npm test`
2. **Frontend job**: `npm ci` → `npm run lint` → `npm run build`

All CI checks must pass before merging to `main`.

---

## Style & Contribution Guidelines

- **TypeScript**: Use strict mode; prefer explicit types over `any`; place shared domain types in the relevant `src/types/index.ts`.
- **Imports**: Use relative imports within each app; no cross-app imports.
- **Logging**: Use the shared Winston logger (`src/config/logger.ts`) in the backend; never use `console.log` in production code.
- **Environment variables**: All env vars must be documented in `backend/.env.example`. Never commit secrets.
- **Tests**: Every new service method or route handler should have a corresponding test in `backend/tests/`.
- **Migrations**: Prisma migrations live in `backend/prisma/migrations/`; never modify an already-applied migration file.
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
