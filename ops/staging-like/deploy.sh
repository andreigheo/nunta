#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f docker-compose.staging-like.yml)
evidence_root="ops/release-evidence/current"
lock_file="${XDG_RUNTIME_DIR:-/tmp}/weddingos-staging-like-deploy.lock"
exec 9>"${lock_file}"
flock -n 9 || { echo "A staging-like deployment is already running" >&2; exit 75; }

release_id="${WEDDINGOS_RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
export WEDDINGOS_RELEASE_ID="${release_id}"
mkdir -p "${evidence_root}"
"${compose[@]}" config --quiet
node scripts/create-release-evidence.mjs

had_api=false
if "${compose[@]}" ps --status running --services | grep -qx api; then
  had_api=true
  : "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
  : "${BACKUP_ENCRYPTION_KEY_ID:?BACKUP_ENCRYPTION_KEY_ID is required}"
  predeploy_backup="$(DATABASE_OWNER_URL="${DATABASE_OWNER_URL:-postgresql://weddingos:staging-only-database-secret@127.0.0.1:55439/weddingos_staging?schema=public}" \
    POSTGRES_CONTAINER="weddingos-staging-like-postgres-1" \
    POSTGRES_USER="weddingos" \
    POSTGRES_PASSWORD="staging-only-database-secret" \
    POSTGRES_DATABASE="weddingos_staging" \
    BACKUP_DESTINATION_DIRECTORY="${BACKUP_DESTINATION_DIRECTORY:-/home/andrei/weddingos-staging-backups}" \
    ops/backup/run-local-backup.sh)"
  ops/backup/verify-local-backup.sh "${predeploy_backup}"
fi

"${compose[@]}" up -d --build postgres redis storage storage-init backup-destination backup-init restore-destination restore-init mail clamav jaeger otel-collector alert-receiver alertmanager
for image_service in api worker web; do
  if [[ -n "${WEDDINGOS_REUSE_IMAGE_FROM:-}" ]]; then
    docker image inspect "weddingos-${image_service}:${WEDDINGOS_REUSE_IMAGE_FROM}" >/dev/null
    docker tag "weddingos-${image_service}:${WEDDINGOS_REUSE_IMAGE_FROM}" "weddingos-${image_service}:${release_id}"
  elif ! docker image inspect "weddingos-${image_service}:${release_id}" >/dev/null 2>&1; then
    COMPOSE_BAKE=false "${compose[@]}" build --provenance=false "${image_service}"
  fi
done
"${compose[@]}" run --rm --no-deps \
  -e DATABASE_URL='postgresql://weddingos:staging-only-database-secret@postgres:5432/weddingos_staging?schema=public' \
  -e DATABASE_OWNER_URL='postgresql://weddingos:staging-only-database-secret@postgres:5432/weddingos_staging?schema=public' \
  api packages/database/node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma
"${compose[@]}" run --rm --no-deps \
  -e DATABASE_URL='postgresql://weddingos:staging-only-database-secret@postgres:5432/weddingos_staging?schema=public' \
  -e DATABASE_OWNER_URL='postgresql://weddingos:staging-only-database-secret@postgres:5432/weddingos_staging?schema=public' \
  api packages/database/node_modules/.bin/tsx packages/database/src/seed.ts
"${compose[@]}" up -d api worker web proxy prometheus grafana

certificate="$(mktemp)"
trap 'rm -f "${certificate}"' EXIT
for _attempt in $(seq 1 90); do
  if "${compose[@]}" cp proxy:/data/caddy/pki/authorities/local/root.crt "${certificate}" >/dev/null 2>&1 &&
     curl --connect-timeout 2 --max-time 5 --silent --show-error --fail --cacert "${certificate}" https://weddingos.localhost:58443/ready >/dev/null; then
    break
  fi
  sleep 2
done

redirect_status="$(curl --connect-timeout 2 --max-time 5 --silent --output /dev/null --write-out '%{http_code}' http://weddingos.localhost:58080/sign-in)"
case "${redirect_status}" in
  301|308) ;;
  *) echo "Expected a permanent HTTPS redirect, received ${redirect_status}" >&2; exit 1 ;;
esac
curl --connect-timeout 2 --max-time 5 --silent --show-error --fail --cacert "${certificate}" https://weddingos.localhost:58443/sign-in >/dev/null
curl --connect-timeout 2 --max-time 5 --silent --show-error --fail --cacert "${certificate}" https://weddingos.localhost:58443/docs-json > "${evidence_root}/openapi.json"
curl --connect-timeout 2 --max-time 5 --silent --show-error --fail http://127.0.0.1:58686/ >/dev/null
curl --connect-timeout 2 --max-time 5 --silent --show-error --fail http://127.0.0.1:59094/-/ready >/dev/null
curl --connect-timeout 2 --max-time 5 --silent --show-error --fail http://127.0.0.1:59095/-/ready >/dev/null
curl --connect-timeout 2 --max-time 5 --silent --show-error --fail http://127.0.0.1:53000/api/health >/dev/null
for _attempt in $(seq 1 30); do
  if curl --connect-timeout 2 --max-time 5 --silent --show-error --fail 'http://127.0.0.1:53000/api/search?query=WeddingOS' | node -e 'let b="";process.stdin.on("data",c=>b+=c).on("end",()=>process.exit(JSON.parse(b).some((item)=>item.uid==="weddingos-controlled-beta") ? 0 : 1))'; then
    break
  fi
  sleep 1
done
curl --connect-timeout 2 --max-time 5 --silent --show-error --fail 'http://127.0.0.1:53000/api/search?query=WeddingOS' | node -e 'let b="";process.stdin.on("data",c=>b+=c).on("end",()=>process.exit(JSON.parse(b).some((item)=>item.uid==="weddingos-controlled-beta") ? 0 : 1))'

for _attempt in $(seq 1 30); do
  prometheus_result="$(curl --connect-timeout 2 --max-time 5 --silent --show-error --fail 'http://127.0.0.1:59094/api/v1/query?query=up%7Bjob%3D%22weddingos-api%22%7D')"
  if PROMETHEUS_RESULT="${prometheus_result}" node -e 'const r=JSON.parse(process.env.PROMETHEUS_RESULT); process.exit(r.data?.result?.some((item)=>item.value?.[1]==="1") ? 0 : 1)'; then
    break
  fi
  sleep 1
done
PROMETHEUS_RESULT="${prometheus_result}" node -e 'const r=JSON.parse(process.env.PROMETHEUS_RESULT); process.exit(r.data?.result?.some((item)=>item.value?.[1]==="1") ? 0 : 1)'

alert_name="WeddingOSStagingRouteSmoke${release_id}"
curl --connect-timeout 2 --max-time 5 --silent --show-error --fail -H 'Content-Type: application/json' \
  --data "[{\"labels\":{\"alertname\":\"${alert_name}\",\"severity\":\"warning\",\"environment\":\"staging-like\"},\"annotations\":{\"summary\":\"Slice 10C alert routing smoke\"}}]" \
  http://127.0.0.1:59095/api/v2/alerts >/dev/null
for _attempt in $(seq 1 30); do
  docker logs weddingos-staging-like-alert-receiver-1 2>&1 | grep -F "${alert_name}" >/dev/null && break
  sleep 1
done
docker logs weddingos-staging-like-alert-receiver-1 2>&1 | grep -F "${alert_name}" >/dev/null

for _attempt in $(seq 1 30); do
  if curl --connect-timeout 2 --max-time 5 --silent --show-error --fail 'http://127.0.0.1:58686/api/traces?service=weddingos-api-staging-like&limit=1' | node -e 'let b="";process.stdin.on("data",c=>b+=c).on("end",()=>process.exit((JSON.parse(b).data??[]).length ? 0 : 1))'; then
    break
  fi
  curl --connect-timeout 2 --max-time 5 --silent --show-error --fail --cacert "${certificate}" https://weddingos.localhost:58443/ready >/dev/null
  sleep 1
done
curl --connect-timeout 2 --max-time 5 --silent --show-error --fail 'http://127.0.0.1:58686/api/traces?service=weddingos-api-staging-like&limit=1' | node -e 'let b="";process.stdin.on("data",c=>b+=c).on("end",()=>process.exit((JSON.parse(b).data??[]).length ? 0 : 1))'

if [[ "${had_api}" = false ]]; then
  : "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
  : "${BACKUP_ENCRYPTION_KEY_ID:?BACKUP_ENCRYPTION_KEY_ID is required}"
  first_backup="$(DATABASE_OWNER_URL="postgresql://weddingos:staging-only-database-secret@127.0.0.1:55439/weddingos_staging?schema=public" \
    POSTGRES_CONTAINER="weddingos-staging-like-postgres-1" POSTGRES_USER="weddingos" \
    POSTGRES_PASSWORD="staging-only-database-secret" POSTGRES_DATABASE="weddingos_staging" \
    BACKUP_DESTINATION_DIRECTORY="${BACKUP_DESTINATION_DIRECTORY:-/home/andrei/weddingos-staging-backups}" \
    ops/backup/run-local-backup.sh)"
  ops/backup/verify-local-backup.sh "${first_backup}"
fi

WEDDINGOS_STAGING_CHECKS="https,httpRedirect,migrations,referenceData,readiness,routeSmoke,traces,metrics,dashboards,alertRoute,backupStatus,csrf,secureCookies,csp,hsts,sameOriginApi" \
  node scripts/write-staging-evidence.mjs deploy "${release_id}"
printf 'staging-like deployment healthy: %s\n' "${release_id}"
