# ADR 0001: Backend architecture and repository layout

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 0 and Slice 1

## Context

WeddingOS is currently a single Next.js 16 application in the repository root. It has 50 rendered routes, an established visual system, six demo-data files, five mock service implementations, and no API, database, or automated backend test suite. Moving the web application now would touch every existing tool and deployment assumption without adding product value to Slice 0 or Slice 1.

## Decision

Use a TypeScript pnpm workspace and a modular monolith:

```text
.
├── src/                         # existing Next.js web application, unchanged location
├── apps/
│   └── api/                    # NestJS REST API
├── packages/
│   ├── contracts/              # shared Zod schemas, DTOs, enums, capabilities
│   ├── database/               # Prisma schema, migrations and client
│   └── config/                 # shared strict environment parsing
├── tests/
│   └── e2e/                    # cross-application journeys
├── docker-compose.yml
└── pnpm-workspace.yaml
```

The existing web application remains the root package for this slice. A later move to `apps/web` is possible once the backend contract is stable; workspace package names and root scripts are chosen so that move does not change consumers.

The API is a NestJS modular monolith with domain modules for authentication, users, workspaces, authorization, team invitations, audit, email, health, and shared HTTP concerns. It exposes REST under `/api/v1`; `/health`, `/ready`, and OpenAPI are infrastructure endpoints. There are no generic `/save` or `/action` endpoints.

PostgreSQL is the source of truth and Prisma is the application ORM. Mailpit is the local SMTP sink. Redis is not included because Slice 0/1 does not use it. Rate limits use the Nest throttling abstraction with an in-process store for local/single-instance execution; a distributed store is a deployment requirement before horizontal scaling.

Vitest is used for unit and integration tests, Supertest for API integration tests, and Playwright for browser E2E. Prettier performs the format check. GitHub Actions runs the same root verification commands as local development.

## API conventions

- Resource responses use `{ data, meta: { requestId, version?, nextCursor? } }`.
- Failures use RFC 9457-compatible problem details with stable WeddingOS codes.
- Requests carry or receive `X-Request-Id`; `X-Correlation-Id` is propagated separately.
- OpenAPI is generated from the live Nest application at `/docs` and `/docs-json`.
- Dates are ISO 8601 in UTC. Local defaults are `ro-RO`, `Europe/Bucharest`, and `RON`.
- Money contracts use integer minor units plus ISO currency; floating-point money is forbidden.

## Consequences

- The UI direction and its routing stay intact.
- Root configuration changes are unavoidable, but source movement is not.
- Shared contracts become the boundary between frontend and backend.
- Future demo-only modules may continue using static data, but Slice 0/1 surfaces cannot present simulated success.
- Production operation must replace the single-process throttle store before multiple API replicas are introduced.

## Rejected alternatives

- A separate repository for the API: rejected because it would duplicate contracts and CI before domain boundaries are stable.
- A rewrite or immediate move to `apps/web`: rejected due to migration risk and no Slice 1 benefit.
- Microservices: rejected because auth, tenancy, membership, and audit require strong transactional boundaries and the current team/product stage does not justify distributed operations.
