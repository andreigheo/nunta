# WeddingOS

WeddingOS este un workspace pnpm cu frontend Next.js, backend NestJS modular și worker BullMQ persistent. Slice 0/1 acoperă autentificarea, sesiunile, workspaces, memberships, roluri/capabilities, echipa, preferințele și auditul. Slice 2A adaugă transactional outbox, joburi durabile, livrare email asincronă, notificări, activity projections și onboarding persistent. Modulele de planning, guests, vendors, finance, contracts, billing și AI rămân planificate.

## Cerințe locale

- Node.js 22.13 sau mai nou (validat cu 22.22.3)
- pnpm 9.15.9
- Docker cu Docker Compose

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

Înlocuiește `SESSION_SECRET` din `.env` cu o valoare locală aleatorie de minimum 32 de caractere. Fișierul `.env` este ignorat de Git.

## PostgreSQL, Redis, Mailpit și migrații

```bash
docker compose up -d postgres redis mailpit
DATABASE_URL='postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos?schema=public' \
DATABASE_OWNER_URL='postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos?schema=public' \
pnpm db:migrate
DATABASE_OWNER_URL='postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos?schema=public' \
pnpm db:seed
```

Servicii locale:

- PostgreSQL: `127.0.0.1:54339`
- Redis: `127.0.0.1:56379` (loopback-only în development)
- Mailpit SMTP: `127.0.0.1:1025`
- Mailpit UI: [http://127.0.0.1:8025](http://127.0.0.1:8025)

Rolul API runtime este `weddingos_app`, iar workerul folosește rolul separat `weddingos_worker`; ambele sunt fără `BYPASSRLS`. URL-ul owner este folosit numai pentru migrații, seed și test cleanup controlat.

## Pornire development

```bash
pnpm dev
```

Sau separat:

```bash
pnpm dev:api
pnpm dev:web
pnpm dev:worker
```

- Web: [http://127.0.0.1:3000/sign-in](http://127.0.0.1:3000/sign-in)
- API: [http://127.0.0.1:4000/health](http://127.0.0.1:4000/health)
- Readiness: [http://127.0.0.1:4000/ready](http://127.0.0.1:4000/ready)
- OpenAPI: [http://127.0.0.1:4000/docs](http://127.0.0.1:4000/docs)

API-ul rulează la `/api/v1`. Cookie-ul de sesiune este `HttpOnly`, `SameSite=Lax` și `Secure` în production.

## Servicii locale permanente

Unitățile din `ops/` rulează loopback-only, sunt activate în user systemd și folosesc `Restart=always`:

```bash
docker compose up -d postgres redis mailpit
pnpm build
systemctl --user start weddingos-api.service
systemctl --user start weddingos-worker.service
systemctl --user start weddingos-web.service
```

- Web permanent: [http://127.0.0.1:43191/sign-in](http://127.0.0.1:43191/sign-in)
- API permanent: [http://127.0.0.1:4000/ready](http://127.0.0.1:4000/ready)

```bash
systemctl --user status weddingos-api.service weddingos-worker.service weddingos-web.service
journalctl --user -u weddingos-worker.service
journalctl --user -u weddingos-api.service
```

Readiness-ul API raportează separat PostgreSQL, Redis, heartbeat-ul workerului și starea outbox. Un SMTP outage nu face API-ul indisponibil: tranzacțiile sunt păstrate, iar joburile intră în retry/dead-letter.

## Docker API opțional

După aplicarea migrațiilor, API-ul poate fi pornit și în container:

```bash
docker compose --profile full up -d --build
```

Frontend-ul rămâne pornit din pnpm în această etapă pentru a evita o mutare riscantă din root; decizia este documentată în `docs/adr/0001-backend-architecture.md`.

## Verificări

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm verify
```

`pnpm verify` execută, în ordine: format check, lint, typecheck, unit, integrare și production build. E2E rulează separat pe porturile izolate `3117` (web) și `4117` (API), pornește împreună API-ul și workerul și folosește Chromium, PostgreSQL, Redis și mesajele reale din Mailpit.

## Mod demo

Modul demo este controlat de `NEXT_PUBLIC_DEMO_MODE_ENABLED`. El folosește date locale izolate, afișează permanent badge-ul `Demo local`, nu trimite emailuri, nu salvează pe server și poate fi resetat prin banner. Nu reprezintă autentificare și nu acordă acces API.

## Documentație

- `docs/SLICE_0_1_IMPLEMENTATION_PLAN.md`
- `docs/SLICE_2A_IMPLEMENTATION_PLAN.md`
- `docs/SLICE_2A_HANDOFF.md`
- `docs/adr/0001-backend-architecture.md`
- `docs/adr/0002-auth-session-model.md`
- `docs/adr/0003-workspace-tenancy.md`
- `docs/adr/0004-authorization-capabilities.md`
- `docs/adr/0005-transactional-outbox.md`
- `docs/adr/0006-background-jobs-and-worker.md`
- `docs/adr/0007-notification-and-activity-projections.md`
- `docs/adr/0008-demo-api-isolation.md`
- `docs/API_OPERATION_REGISTRY.json`

`pnpm-lock.yaml` este lockfile-ul canonic al monorepo-ului. Singurul lockfile npm păstrat aparține relay-ului izolat din `ops/resend-relay`, care rulează explicit `npm ci`.
