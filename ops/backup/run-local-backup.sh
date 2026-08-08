#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_OWNER_URL:?DATABASE_OWNER_URL is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
: "${BACKUP_ENCRYPTION_KEY_ID:?BACKUP_ENCRYPTION_KEY_ID is required}"

backup_root="${BACKUP_ROOT:-/home/andrei/weddingos-backups}"
run_id="$(date -u +%Y%m%dT%H%M%SZ)"
run_root="${backup_root}/${run_id}"
work_root="$(mktemp -d)"
trap 'find "${work_root}" -type f -exec shred -u {} + 2>/dev/null || true; rmdir "${work_root}" 2>/dev/null || true' EXIT
mkdir -p "${run_root}"

object_status="NOT_CONFIGURED"
object_checksum=""
object_inventory_checksum=""
object_size=0
destination_provider="local-encrypted"
destination_identity="${run_root}"
if [[ -n "${BACKUP_DESTINATION_DIRECTORY:-}" ]]; then
  destination_provider="separate-filesystem"
  destination_identity="${BACKUP_DESTINATION_DIRECTORY}"
fi

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --dbname="${DATABASE_OWNER_URL}" --format=custom --compress=9 --no-owner --no-privileges --file="${work_root}/database.dump"
  postgres_version="$(pg_dump --version | sed 's/"/\\"/g')"
else
  postgres_container="${POSTGRES_CONTAINER:-weddingos-postgres-1}"
  postgres_user="${POSTGRES_USER:-weddingos}"
  postgres_database="${POSTGRES_DATABASE:-weddingos}"
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-weddingos}" "${postgres_container}" pg_dump -U "${postgres_user}" -d "${postgres_database}" --format=custom --compress=9 --no-owner --no-privileges > "${work_root}/database.dump"
  postgres_version="$(docker exec "${postgres_container}" pg_dump --version | sed 's/"/\\"/g')"
fi
cp packages/database/prisma/migrations/migration_lock.toml "${work_root}/migration_lock.toml"
find packages/database/prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort > "${work_root}/migrations.txt"

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 \
  -in "${work_root}/database.dump" \
  -out "${run_root}/database.dump.enc" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE

database_checksum="$(sha256sum "${run_root}/database.dump.enc" | cut -d' ' -f1)"
migration_checksum="$(sha256sum "${work_root}/migrations.txt" | cut -d' ' -f1)"
database_size="$(stat -c '%s' "${run_root}/database.dump.enc")"
latest_migration="$(tail -n 1 "${work_root}/migrations.txt")"

if [[ -n "${OBJECT_SOURCE_DIRECTORY:-}" ]]; then
  test -d "${OBJECT_SOURCE_DIRECTORY}"
  find "${OBJECT_SOURCE_DIRECTORY}" -type f -printf '%P\t%s\n' | sort > "${work_root}/objects.inventory"
  tar -C "${OBJECT_SOURCE_DIRECTORY}" -cf "${work_root}/objects.tar" .
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 \
    -in "${work_root}/objects.tar" -out "${run_root}/objects.tar.enc" \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE
  object_status="INCLUDED"
  object_checksum="$(sha256sum "${run_root}/objects.tar.enc" | cut -d' ' -f1)"
  object_inventory_checksum="$(sha256sum "${work_root}/objects.inventory" | cut -d' ' -f1)"
  object_size="$(stat -c '%s' "${run_root}/objects.tar.enc")"
fi

sed \
  -e "s|__RUN_ID__|${run_id}|g" \
  -e "s|__CREATED_AT__|$(date -u +%Y-%m-%dT%H:%M:%SZ)|g" \
  -e "s|__DATABASE_CHECKSUM__|${database_checksum}|g" \
  -e "s|__DATABASE_SIZE__|${database_size}|g" \
  -e "s|__KEY_ID__|${BACKUP_ENCRYPTION_KEY_ID}|g" \
  -e "s|__POSTGRES_VERSION__|${postgres_version}|g" \
  -e "s|__LATEST_MIGRATION__|${latest_migration}|g" \
  -e "s|__MIGRATION_CHECKSUM__|${migration_checksum}|g" \
  -e "s|__OBJECT_STATUS__|${object_status}|g" \
  -e "s|__OBJECT_CHECKSUM__|${object_checksum}|g" \
  -e "s|__OBJECT_INVENTORY_CHECKSUM__|${object_inventory_checksum}|g" \
  -e "s|__OBJECT_SIZE__|${object_size}|g" \
  -e "s|__DESTINATION_PROVIDER__|${destination_provider}|g" \
  -e "s|__DESTINATION_IDENTITY__|${destination_identity}|g" \
  ops/backup/manifest.template.json > "${run_root}/manifest.json"

sha256sum "${run_root}/manifest.json" > "${run_root}/manifest.sha256"

if [[ -n "${BACKUP_DESTINATION_DIRECTORY:-}" ]]; then
  mkdir -p "${BACKUP_DESTINATION_DIRECTORY}/${run_id}"
  cp "${run_root}/"* "${BACKUP_DESTINATION_DIRECTORY}/${run_id}/"
fi
printf '%s\n' "${run_root}"
