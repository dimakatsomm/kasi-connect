FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client and compile TypeScript → dist/
RUN npx prisma generate && npm run build

# Compile seed script separately (rootDir differs from src/)
RUN npx tsc prisma/seed.ts --outDir dist/seed --esModuleInterop --resolveJsonModule --skipLibCheck --module commonjs --target ES2020

# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Only install production deps in the final image
COPY package*.json ./
# Copy schema so @prisma/client postinstall can locate it if needed
COPY --from=builder /app/prisma ./prisma
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# Compiled seed script for deploy-time seeding
COPY --from=builder /app/dist/seed ./dist/seed
# Copy Prisma CLI from builder so we can run migrations without it being a prod dep
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
# Copy generated Prisma client artifacts required by @prisma/client at runtime
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Copy @prisma/engines so `prisma migrate deploy` can locate its query/migration engine binaries
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create uploads directory before switching to non-root user
RUN mkdir -p /app/uploads

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S kasiapp -u 1001
RUN chown kasiapp:nodejs /app/uploads
USER kasiapp

# SEED_MODE controls deploy-time seeding:
#   app  — official reference data only (categories, sub-categories)
#   demo — demo vendor, products & login user
#   all  — both app + demo (default when SEED_MODE is unset)
#   none — skip seeding entirely
ENV SEED_MODE=all

EXPOSE 3000

# Run database migrations, seed, then start the application.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy || { echo 'ERROR: prisma migrate deploy failed'; exit 1; } && node dist/seed/seed.js && node dist/server.js"]
