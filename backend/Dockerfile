FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/

# Compile TypeScript → dist/
RUN npm run build

# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Only install production deps in the final image
COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S kasiapp -u 1001
USER kasiapp

EXPOSE 3000

CMD ["node", "dist/server.js"]
