# --- STAGE 1: Build & Compile ---
FROM node:24-slim AS builder
WORKDIR /app

# Install standard native compilation build dependencies for ONNX
RUN apt-get update && apt-get install -y openssl python3 build-essential && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
COPY tsconfig.json ./
COPY src ./src/

RUN npx prisma generate

# --- STAGE 2: Production Runtime Perimeter ---
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install openssl runtime mapping requirements for Prisma engine inside Debian slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src

RUN npx prisma generate

EXPOSE 3000
ENV PORT=3000

# Start the unified microservice engine
CMD ["npx", "tsx", "src/server.ts"]
