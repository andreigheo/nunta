# Conturi locale de test WeddingOS

Aceste conturi există numai în baza locală de dezvoltare. Toate folosesc parola:

`WeddingOS2026!`

## Wedding workspace

| Rol                 | Email                     |
| ------------------- | ------------------------- |
| Couple Owner        | `owner@weddingos.local`   |
| Couple Partner      | `partner@weddingos.local` |
| Wedding Planner     | `planner@weddingos.local` |
| Family Collaborator | `family@weddingos.local`  |
| Viewer              | `viewer@weddingos.local`  |

Toate sunt membre în workspace-ul `WeddingOS — Test roluri`.

## Vendor OS

| Rol               | Email                               |
| ----------------- | ----------------------------------- |
| Vendor Owner      | `vendor-owner@weddingos.local`      |
| Vendor Manager    | `vendor-manager@weddingos.local`    |
| Vendor Sales      | `vendor-sales@weddingos.local`      |
| Vendor Operations | `vendor-operations@weddingos.local` |
| Vendor Viewer     | `vendor-viewer@weddingos.local`     |

Toate sunt membre în organizația `Atelier WeddingOS Test`.

## Platform Admin

| Rol                  | Email                   |
| -------------------- | ----------------------- |
| Platform Super Admin | `admin@weddingos.local` |

Grantul este limitat la mediul `development`, este creat numai de seed-ul local explicit și nu acordă membership într-un workspace sau Vendor Organization.

## Regenerare

Seed-ul este idempotent, refuză baze non-loopback și necesită confirmarea explicită:

```bash
WEDDINGOS_ALLOW_LOCAL_TEST_ACCOUNTS=true \
DATABASE_OWNER_URL='postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos?schema=public' \
node scripts/seed-local-test-accounts.mjs
```

Conturile nu trebuie create într-o bază de producție.
