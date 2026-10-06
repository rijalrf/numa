# Build stage untuk Numa API (Express + Prisma + Better Auth)
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/cli/package.json ./packages/cli/

RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci

COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Kompilasi TypeScript ke JavaScript supaya runtime tidak memakai tsx (start lebih cepat, memori lebih kecil).
FROM deps AS build
COPY tsconfig.base.json /app/tsconfig.base.json
COPY apps/api/tsconfig.json apps/api/package.json ./apps/api/
COPY apps/api/src ./apps/api/src
RUN npx tsc -p apps/api

FROM node:22-slim AS runner
WORKDIR /app/apps/api
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=6655

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/api/node_modules ./node_modules
COPY --from=deps /app/apps/api/prisma ./prisma
COPY tsconfig.base.json /app/tsconfig.base.json
COPY apps/api/package.json ./package.json
COPY apps/api/tsconfig.json ./tsconfig.json
COPY --from=build /app/apps/api/dist ./dist

# Jalankan sebagai user non-root bawaan image (uid 1000). Semua berkas hanya dibaca saat runtime.
USER node

EXPOSE 6655

CMD ["node", "dist/index.js"]
