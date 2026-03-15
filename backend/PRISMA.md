# Prisma ORM Integration

This document describes the Prisma ORM implementation in the KasiConnect backend.

## Overview

Prisma has been integrated as the primary ORM for database operations, replacing the previous raw SQL queries using the `pg` library. The implementation maintains backward compatibility with existing types while providing type-safe database access.

## Setup

### Installation

Prisma dependencies are already included in `package.json`:
```json
{
  "dependencies": {
    "@prisma/client": "^7.5.0"
  },
  "devDependencies": {
    "prisma": "^7.5.0"
  }
}
```

### Configuration

Prisma configuration is managed in two files:

1. **`prisma.config.ts`** - Prisma 7+ configuration file:
```typescript
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

2. **`prisma/schema.prisma`** - Database schema definition:
   - Defines all models (Vendor, Customer, Product, Order, etc.)
   - Includes enums (VendorType, OrderStatus, FulfilmentType)
   - Maps to existing PostgreSQL database schema
   - Uses `@map` for field name conversions (camelCase → snake_case)

### Environment Variables

Add `DATABASE_URL` to your `.env` file:
```env
DATABASE_URL=postgresql://kasiconnect:your_password@localhost:5432/kasiconnect
```

The existing DB_* environment variables are still used by legacy code and for constructing the DATABASE_URL.

## Database Models

All Prisma models are defined in `prisma/schema.prisma`:

- **Vendor** - Spaza shops and kasi eateries
- **Customer** - Order customers
- **Product** - Menu items and products
- **Order** - Customer orders
- **OrderItem** - Line items within orders
- **DailySpecial** - Daily promotions
- **VendorUser** - Dashboard user accounts

### Field Mapping

Prisma uses camelCase naming while the database uses snake_case. The `@map` directive handles this:

```prisma
model Vendor {
  id             String   @id @default(dbgenerated("uuid_generate_v4()"))
  deliveryFee    Decimal  @map("delivery_fee")  // Maps to delivery_fee column
  isActive       Boolean  @map("is_active")      // Maps to is_active column
  ...
}
```

## Usage

### Prisma Client

The Prisma client is exported from `src/db/index.ts`:

```typescript
import { prisma } from '../db';

// Query examples
const vendors = await prisma.vendor.findMany({
  where: { isActive: true }
});

const customer = await prisma.customer.upsert({
  where: { phone },
  update: { name },
  create: { phone, name },
});
```

### Transactions

Prisma provides automatic transaction support:

```typescript
const order = await prisma.$transaction(async (tx) => {
  const newOrder = await tx.order.create({ data: {...} });
  await tx.orderItem.create({ data: {...} });
  await tx.product.update({ where: { id }, data: {...} });
  return newOrder;
});
```

### Type Conversions

Services convert between Prisma models and existing `Row` types for backward compatibility:

```typescript
// Prisma → Row type conversion
return {
  id: customer.id,
  phone: customer.phone,
  name: customer.name,
  last_order_id: customer.lastOrderId,  // camelCase → snake_case
  created_at: customer.createdAt.toISOString(),  // Date → ISO string
  updated_at: customer.updatedAt.toISOString(),
};
```

## Commands

### Generate Prisma Client

After schema changes, regenerate the client:
```bash
npx prisma generate
```

### Create Migration

To create a new migration:
```bash
npx prisma migrate dev --name migration_name
```

### Apply Migrations

Apply pending migrations:
```bash
npx prisma migrate deploy
```

### Prisma Studio

Launch the visual database browser:
```bash
npx prisma studio
```

## Testing

Tests mock the Prisma client instead of the old `db.query`:

```typescript
jest.mock('../src/db', () => ({
  prisma: {
    customer: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    order: {
      count: jest.fn(),
    },
  },
}));

import { prisma } from '../src/db';

// Mock implementation
(prisma.customer.findUnique as jest.Mock).mockResolvedValueOnce({
  id: 'c1',
  phone: '+27821234567',
  name: null,
  lastOrderId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

## Migration from Raw SQL

The following files have been migrated to use Prisma:

- ✅ `src/services/orderService.ts`
- ✅ `src/services/productService.ts`
- ✅ `src/services/messageHandler.ts`
- ✅ `src/routes/vendors.ts`
- ✅ `src/routes/products.ts`
- ✅ `src/routes/orders.ts`
- ✅ `src/kafka/consumer.ts`

The legacy `db.query()` and `db.getClient()` functions remain in `src/db/index.ts` but are no longer used by the application code.

## Best Practices

1. **Always use Prisma for new database code** - Don't write raw SQL queries
2. **Use transactions for multi-step operations** - Ensures data consistency
3. **Leverage relations** - Use Prisma's `include` and `select` for efficient queries
4. **Type safety** - Take advantage of Prisma's generated types
5. **Error handling** - Catch Prisma-specific errors (e.g., `P2002` for unique constraint violations)

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Client API](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
