# KasiConnect 🛍️

**KasiConnect** is a WhatsApp-based ordering platform for township spaza shops and kasi eateries in South Africa. Customers order in any South African language — no app download required. Shop owners manage orders from a lightweight PWA dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Customer (WhatsApp)                                            │
│    · Text or 🎤 voice note in English/Zulu/Sepedi/Setswana       │
└───────────────────────┬─────────────────────────────────────────┘
                        │  Meta Cloud API (webhook)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend  (Node.js / Express)                                   │
│                                                                 │
│  ┌────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  WhatsApp      │  │  Session State  │  │  NLP Parser     │  │
│  │  Webhook       │→ │  Machine        │→ │  (multi-lang)   │  │
│  │  /webhook      │  │  (Redis-backed) │  │                 │  │
│  └────────────────┘  └─────────────────┘  └───────┬─────────┘  │
│                                                    │            │
│  ┌─────────────────────────────────────────────────▼─────────┐  │
│  │  Product Matching (Fuse.js fuzzy search)                  │  │
│  └───────────────────────────────┬───────────────────────────┘  │
│                                  │                              │
│  ┌───────────────────────────────▼───────────────────────────┐  │
│  │  Order Service  ←→  PostgreSQL  ←→  Kafka Events          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                        │  Kafka events (order.ready)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Kafka Consumer  →  WhatsApp notification to customer           │
└─────────────────────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────────────────┐
│  Frontend  (Next.js PWA)                                        │
│  Kanban board · Product management · Daily specials broadcast   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### WhatsApp Bot
| Feature | Description |
|---|---|
| Multi-language NLP | Parses orders in English, isiZulu, Sepedi, Setswana |
| Voice note support | Transcribes voice notes via speech-to-text |
| Fuzzy product matching | Matches "coke", "cola", "Coca-Cola" to the same product |
| Ambiguity resolution | Asks clarifying questions when multiple products match |
| Returning customer shortcut | One-tap repeat of last order |
| Order confirmation | Itemised bill with totals — customer confirms with YES |
| Delivery fork (eateries) | Collect or deliver? Delivery fee appended |
| Queue position | Food vendors: queue number + estimated ready time |
| Ready notification | Customer gets WhatsApp ping when order is ready |
| Daily specials | Broadcast to all customers who ordered in last 30 days |

### Vendor Dashboard (PWA)
| Feature | Description |
|---|---|
| Kanban board | New / Preparing / Ready columns |
| One-click status update | Move orders through the pipeline |
| Product management | Add / edit products, set stock levels |
| Low-stock alerts | Visual warning when stock ≤ threshold |
| Image upload | Product photos (stored in Huawei OBS) |
| Daily specials broadcast | Publish a special → WhatsApp blast |

---

## Session State Machine

```
AWAITING_VENDOR_TYPE
       │
       ▼
AWAITING_ITEMS ──────────────────────────────────┐
       │                                         │
       │ ambiguous product                       │
       ▼                                         │
AWAITING_CLARIFICATION ──────────────────────────┤
       │                                         │
       │ all resolved                            │
       ▼                                         │
AWAITING_CONFIRMATION ◄──────────────────────────┘
       │
       │ food vendor                 retail vendor
       ▼                                  │
AWAITING_FULFILMENT_TYPE                  │
       │                                  │
       └──────────────────────────────────┘
                        │
                        ▼
                  ORDER_PLACED
```

Sessions expire after **30 minutes** of inactivity (Redis TTL).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express 4 |
| Session store | Redis (ioredis) |
| Database | PostgreSQL 15 (Huawei GaussDB compatible) |
| Message queue | Kafka (KafkaJS) |
| NLP | Custom SA-language parser + Fuse.js fuzzy matching |
| Voice-to-text | Huawei ModelArts STT |
| Object storage | Huawei OBS |
| Frontend | Next.js 16 (App Router), Tailwind CSS, TanStack Query |
| Containers | Docker / Docker Compose |
| Deployment | Huawei CCE (Kubernetes) |

---

## Getting Started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- WhatsApp Business account with Meta Cloud API access

### 1. Clone and configure

```bash
git clone https://github.com/dimakatsomm/kasi-connect.git
cd kasi-connect

# Backend config
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials

# Frontend config (optional)
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > frontend/.env.local
```

### 2. Start infrastructure

```bash
docker-compose up postgres redis kafka -d
```

### 3. Run database migrations

```bash
# After postgres is healthy:
(cd backend && npm install && npm run prisma:migrate:deploy)
```

### 4. Start the backend

```bash
cd backend
npm install
npm run dev
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Opens on http://localhost:3000 (Next.js dev server)
```

### 6. Connect WhatsApp webhook

Expose your local server with ngrok:
```bash
ngrok http 3000
# Then configure the ngrok URL + /webhook in Meta Cloud API console
```

---

## Running Tests

```bash
cd backend
npm test              # Run all tests
npm run test:coverage # With coverage report
```

---

## Project Structure

```
kasi-connect/
├── backend/
│   ├── src/
│   │   ├── app.js                    # Express app
│   │   ├── server.js                 # Entry point
│   │   ├── config/
│   │   │   ├── index.js              # All config from env
│   │   │   └── logger.js             # Winston logger
│   │   ├── routes/
│   │   │   ├── webhook.js            # WhatsApp webhook endpoint
│   │   │   ├── orders.js             # Order CRUD
│   │   │   ├── products.js           # Product / menu management
│   │   │   └── vendors.js            # Vendor management
│   │   ├── services/
│   │   │   ├── sessionStates.js      # State definitions & transitions
│   │   │   ├── sessionService.js     # Redis-backed session state machine
│   │   │   ├── nlpService.js         # Multi-language order parser
│   │   │   ├── productService.js     # Fuzzy product matching
│   │   │   ├── orderService.js       # Order lifecycle management
│   │   │   ├── whatsappService.js    # Meta Cloud API messaging
│   │   │   ├── voiceService.js       # Speech-to-text integration
│   │   │   └── messageHandler.js     # Core bot conversation logic
│   │   ├── db/
│   │   │   ├── index.js              # pg Pool
│   │   │   └── migrations/
│   │   │       └── 001_initial_schema.sql
│   │   └── kafka/
│   │       ├── producer.js           # Publish events
│   │       └── consumer.js           # Handle order.ready & specials broadcast
│   ├── tests/
│   │   ├── setup.js                  # Jest env setup
│   │   ├── nlpService.test.js
│   │   ├── sessionService.test.js
│   │   ├── productService.test.js
│   │   ├── orderService.test.js
│   │   └── webhook.test.js
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout (PWA metadata)
│   │   │   ├── page.tsx              # Redirects to /dashboard
│   │   │   ├── providers.tsx         # React Query provider
│   │   │   └── dashboard/
│   │   │       └── page.tsx          # Main dashboard page
│   │   ├── components/
│   │   │   ├── orders/
│   │   │   │   └── KanbanBoard.tsx   # Order kanban board
│   │   │   └── products/
│   │   │       ├── ProductManagement.tsx
│   │   │       └── AddProductForm.tsx
│   │   ├── hooks/
│   │   │   └── useApi.ts             # React Query hooks
│   │   ├── lib/
│   │   │   └── api.ts                # API client (axios)
│   │   └── types/
│   │       └── index.ts              # Shared TypeScript types
│   ├── public/
│   │   └── manifest.json             # PWA manifest
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for the full list of required variables.

Key variables:
| Variable | Description |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook verification token |
| `WHATSAPP_ACCESS_TOKEN` | Meta Cloud API bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp business phone number ID |
| `REDIS_HOST` / `REDIS_PORT` | Redis connection |
| `DB_HOST` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | PostgreSQL |
| `DATABASE_URL` | Prisma/PostgreSQL connection string (postgresql://...) |
| `KAFKA_BROKERS` | Comma-separated broker list |

---

## License

MIT
