FROM node:22.22.0-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json next.config.ts postcss.config.mjs .npmrc ./
COPY patches patches
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY src src
COPY public public
COPY packages/contracts packages/contracts
ARG WEDDINGOS_BUILD_ID=unversioned
ARG API_INTERNAL_URL=http://127.0.0.1:4000
ARG NEXT_PUBLIC_DEMO_MODE_ENABLED=false
ARG NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID=
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_PUBLIC_DEMO_MODE_ENABLED=$NEXT_PUBLIC_DEMO_MODE_ENABLED
ENV NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID=$NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID
RUN printf '%s\n' "${WEDDINGOS_BUILD_ID}" > /app/.weddingos-build-id
RUN pnpm --filter @weddingos/contracts build && pnpm build:web --webpack
FROM node:22.22.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/package.json ./package.json
COPY --chown=node:node --from=build /app/next.config.ts ./next.config.ts
USER node
CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0"]
