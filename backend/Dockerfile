FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY package*.json ./

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S kasiapp -u 1001
USER kasiapp

EXPOSE 3000

CMD ["node", "src/server.js"]
