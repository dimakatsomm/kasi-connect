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

## Cloud deployment stacks

| Cloud | Terraform path | Notes |
| --- | --- | --- |
| Huawei Cloud | `terraform/` | Original stack that targets CCE, GaussDB, DCS, DMS, and OBS. |
| Google Cloud | `terraform-gcp/` | Demo-focused stack that provisions GKE, Cloud SQL, Memorystore, GCS, and expects Kafka via a Helm release. |

> Use the Huawei stack for production once the account is approved. For interim demos, follow [`terraform-gcp/README.md`](terraform-gcp/README.md) to spin everything up on GCP and install a single-node Kafka inside the cluster.

---

## Getting Started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- WhatsApp Business account with Meta Cloud API access (for production)
- Twilio account (for the WhatsApp Sandbox or Twilio-hosted production numbers)

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

If you are using Twilio, point the Sandbox/WhatsApp sender webhook to the same `/webhook` endpoint (Twilio sends `application/x-www-form-urlencoded` payloads which are handled automatically).

---

## WhatsApp Transport Modes

KasiConnect can talk to WhatsApp through **Meta Cloud API** (default) or **Twilio**. Set `WHATSAPP_PROVIDER` in `backend/.env` to switch.

| Provider | When to use | Required env vars | Webhook setup |
|---|---|---|---|
| `meta` (default) | Production deployments on your Meta Business Account | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION` | Meta Developers â†’ Webhooks â†’ Callback URL = `<base>/webhook`, Verify Token = `WHATSAPP_VERIFY_TOKEN` |
| `twilio` | Internal demos + Twilio-hosted production | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | Twilio Console â†’ Messaging â†’ WhatsApp Sandbox (or sender) â†’ "When a message comes in" = `<base>/webhook` |

### Twilio Sandbox flow (zero-cost demo)
1. In Twilio Console, open **Messaging â†’ Try it out â†’ Send a WhatsApp message** and activate the Sandbox.
2. Share the sandbox number and join code with testers (they text `join <code>` once).
3. Configure `backend/.env`:
   ```
   WHATSAPP_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   TWILIO_AUTH_TOKEN=your_twilio_token
   TWILIO_WHATSAPP_FROM=14155238886   # sandbox number
   ```
4. Point the sandbox webhook to `https://<ngrok>.ngrok.app/webhook`.
5. Restart the backend. All outbound messages flow through Twilio; button/list prompts fall back to numbered text instructions so users can still reply with the option they want.

### Twilio production hardening
1. Request a dedicated WhatsApp number inside Twilio (Messaging â†’ WhatsApp â†’ Senders) and complete the WABA verification.
2. Swap `TWILIO_WHATSAPP_FROM` to the new number (E.164, digits only) and remove the sandbox join step from your onboarding docs.
3. Register your frequently-used templates in Twilio so you can message users outside the 24Â h service window when you go live.

### Staying on Meta Cloud API
Leave `WHATSAPP_PROVIDER=meta` (default) and keep the existing Meta webhook handshake. This remains the lowest-cost path once you control hosting and a verified phone number; you can switch between providers just by flipping the env vars and redeploying.

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




