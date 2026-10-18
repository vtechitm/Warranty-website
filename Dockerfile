# syntax=docker/dockerfile:1.7
# Production image: Next.js standalone server + Prisma migrations.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── Dependencies ──
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ── Build ──
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ── Prisma CLI (isolated, with all its dependencies) for `migrate deploy` ──
FROM base AS prisma-cli
WORKDIR /opt/prisma
RUN npm init -y >/dev/null && npm install --no-audit --no-fund prisma@6.19.3

# ── Runtime ──
FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/assets ./assets
COPY --from=build --chown=app:app /app/prisma ./prisma
# Prisma client + query engine (also traced by Next, copied explicitly for scripts/)
COPY --from=build --chown=app:app /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-cli /opt/prisma/node_modules /opt/prisma/node_modules
COPY --chown=app:app scripts/create-admin.mjs ./scripts/create-admin.mjs
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p ./storage/uploads && chown -R app:app ./storage

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./entrypoint.sh"]
