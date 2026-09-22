FROM node:24 AS builder
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1
# the build evaluates the auth config; the real secret comes from compose at runtime
ENV BETTER_AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --frozen-lockfile --store-dir /pnpm-store

ENV NODE_ENV=production
RUN cd apps/web && pnpm run build
ENV SKIP_ENV_VALIDATION=
ENV BETTER_AUTH_SECRET=

FROM builder AS migrator
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@OpenFarm/db", "db:migrate:deploy"]

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/apps/web/.output/ /app/

ENV HOST=0.0.0.0
ENV PORT=3001
EXPOSE 3001

USER node
CMD ["node", "server/index.mjs"]
