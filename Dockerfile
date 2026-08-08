FROM node:22.22.0-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json next.config.ts postcss.config.mjs .npmrc ./
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY src src
COPY public public
COPY packages/contracts packages/contracts
ARG WEDDINGOS_BUILD_ID=unversioned
RUN printf '%s\n' "${WEDDINGOS_BUILD_ID}" > /app/.weddingos-build-id
RUN pnpm --filter @weddingos/contracts build && pnpm build:web --webpack
FROM node:22.22.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0"]
