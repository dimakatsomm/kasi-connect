FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
COPY prisma/ ./prisma/

# Generate Prisma client and compile TypeScript → dist/
RUN npx prisma generate && npm run build

# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Only install production deps in the final image
COPY package*.json ./
# Copy schema so @prisma/client postinstall can locate it if needed
COPY --from=builder /app/prisma ./prisma
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# Copy Prisma CLI from builder so we can run migrations without it being a prod dep
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
# Copy generated Prisma client artifacts required by @prisma/client at runtime
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Copy @prisma/engines so `prisma migrate deploy` can locate its query/migration engine binaries
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S kasiapp -u 1001
USER kasiapp

EXPOSE 3000

# Run database migrations then start the application;
# exit with a clear error message if migrations fail so the container
# restart policy surfaces the problem in logs.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy || { echo 'ERROR: prisma migrate deploy failed'; exit 1; } && node dist/server.js"]
