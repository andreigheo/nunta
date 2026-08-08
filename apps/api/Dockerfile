FROM node:22.22.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/jobs/package.json packages/jobs/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages packages
ARG WEDDINGOS_BUILD_ID=unversioned
RUN printf '%s\n' "${WEDDINGOS_BUILD_ID}" > /app/.weddingos-build-id
RUN pnpm --filter @weddingos/contracts build \
  && pnpm --filter @weddingos/config build \
  && pnpm --filter @weddingos/jobs build \
  && pnpm --filter @weddingos/database generate \
  && pnpm --filter @weddingos/database build \
  && pnpm --filter @weddingos/api build

FROM node:22.22.0-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages ./packages
CMD ["node", "apps/api/dist/main.js"]
