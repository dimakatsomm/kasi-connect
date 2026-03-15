# KasiConnect · Codex Brief

## Mission Snapshot
- WhatsApp-first ordering for township spaza shops and eateries; no consumer app install required.
- Customers place multilingual text or voice orders; vendors fulfill via a lightweight PWA dashboard.
- Core loop: WhatsApp → Meta Cloud webhook → Node/Express backend → Redis sessions + Postgres orders + Kafka notifications → WhatsApp + Next.js dashboard.

## Repository Layout
- `backend/` — Node.js 20 service with Express routes, Redis session machine, PostgreSQL access, and Kafka producers/consumers.
- `frontend/` — Next.js 16 App Router PWA with Kanban orders, product management, and vendor utilities.
- `docker-compose.yml` — Brings up Postgres 15, Redis, Kafka, plus app containers for local dev.
- `.github/workflows/ci.yml` — Shared lint/test/build pipeline for both apps.

## Backend Architecture
- Entry: `src/app.ts` wires Express middlewares, health checks, and resource routers; `src/server.ts` boots HTTP (and Kafka) services.
- Config: `src/config/index.ts` centralizes env parsing (database, Redis, Meta Cloud, Huawei services) and exports typed settings; `src/config/logger.ts` provides a Winston logger shared across modules.
- Routes (`src/routes/*.ts`):
  - `webhook.ts` receives Meta Cloud callbacks, validates signatures, and pushes payloads into the `messageHandler`.
  - `orders.ts`, `products.ts`, `vendors.ts` offer REST endpoints consumed by the dashboard.
- Services (`src/services/`):
  - `messageHandler.ts` orchestrates NLP parsing, session transitions, and dispatches side-effects (order CRUD, WhatsApp replies, Kafka events).
  - `nlpService.ts` combines intent parsing with Fuse.js fuzzy search for multilingual product matching; falls back to clarification prompts defined in `sessionStates.ts`.
  - `orderService.ts`, `productService.ts`, `sessionService.ts`, `whatsappService.ts`, `voiceService.ts` isolate vertical concerns (database writes, Redis TTL, Meta API calls, Huawei STT).
- Data layer:
  - `src/db/index.ts` hosts the PostgreSQL connection pool and query helpers; migrations reside under `src/db/migrations`.
  - Kafka integration via `src/kafka/producer.ts` (publishes `order.ready`) and `src/kafka/consumer.ts` (notifies customers on readiness).
- Types: `src/types/index.ts` holds shared enums/interfaces (session states, WhatsApp payloads, order DTOs) to keep service contracts consistent.
- Tests: `backend/tests/*.test.ts` cover NLP parsing, order/product flows, session handling, and webhook validation with Jest setup from `tests/setup.ts`.

## Frontend Architecture
- Framework: Next.js 16 App Router with React Server Components plus TanStack Query on the client side.
- App shell (`src/app/`):
  - `layout.tsx` defines fonts/theme; `providers.tsx` configures QueryClient; `dashboard/page.tsx` renders the vendor workspace.
- Components:
  - Orders (`src/components/orders/KanbanBoard.tsx`) renders New/Preparing/Ready swimlanes with drag-and-drop status updates via REST hooks.
  - Products (`src/components/products/*.tsx`) handles CRUD forms, stock indicators, and broadcast toggles.
- Hooks & API:
  - `src/hooks/useApi.ts` wraps TanStack Query for consistent loading/error states.
  - `src/lib/api.ts` centralizes fetch helpers pointed at `NEXT_PUBLIC_API_URL`.
- Types: `src/types/index.ts` mirrors backend DTOs to ensure compile-time alignment.
- Assets: icons/manifest in `public/`; Tailwind config through `globals.css` + PostCSS/TSC configs in the project root.

## Data & Control Flow
1. Customer message (text/voice) hits Meta Cloud → forwarded to `/webhook`.
2. `messageHandler` loads/creates Redis session state, runs NLP to extract vendor type and order lines.
3. Products resolved via Fuse.js fuzzy matching; ambiguous matches trigger clarification states.
4. Confirmed orders persist to Postgres; order-ready events emit to Kafka.
5. Kafka consumer notifies customers via WhatsApp when status hits READY.
6. Vendors manage queues/products through the Next.js PWA which calls REST routes for orders/products/vendors.

## Local Development Cheatsheet
1. Copy envs: `cp backend/.env.example backend/.env`, configure Meta/Redis/Postgres/Huawei creds; set `frontend/.env.local` with API URL.
2. Start dependencies: `docker-compose up postgres redis kafka -d`.
3. Run migration: `psql -f backend/src/db/migrations/001_initial_schema.sql`.
4. Start backend: `cd backend && npm install && npm run dev`.
5. Start frontend: `cd frontend && npm install && npm run dev` (served on `http://localhost:3000`).
6. Expose webhook externally (e.g., `ngrok http 3000`) and register with Meta Cloud.

## Testing
- Backend: `cd backend && npm test` or `npm run test:coverage` to verify NLP/session/order logic.
- Frontend: leverage `npm run lint`/`npm run test` once component tests are added (CI placeholder exists in `.github/workflows/ci.yml`).

## Deployment Notes
- Container images built from `backend/Dockerfile` and `frontend/Dockerfile`; orchestrated via Huawei CCE (Kubernetes).
- Redis and Postgres can point to Huawei-managed services; Kafka topics assumed to exist before deployment.

This Codex brief distills the repo’s moving parts so future contributors can ramp quickly without re-deriving the architecture from scratch.
