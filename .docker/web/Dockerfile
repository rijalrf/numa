# Base dependencies untuk monorepo pakeai
FROM node:22-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/cli/package.json ./packages/cli/

RUN npm ci

COPY tsconfig.base.json ./

# Development stage (Vite HMR dev server)
FROM deps AS dev
WORKDIR /app/apps/web
COPY apps/web ./
EXPOSE 3455
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3455"]

# Build stage untuk pakeai Web (Vite + React + Tailwind)
FROM deps AS builder
WORKDIR /app
COPY apps/web ./apps/web

ARG VITE_API_URL=http://localhost:6655
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace=@pakeai/web

# Production stage menggunakan Nginx Alpine
FROM nginx:alpine AS runner

COPY .docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 3455

CMD ["nginx", "-g", "daemon off;"]
