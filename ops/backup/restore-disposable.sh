#!/usr/bin/env bash
set -euo pipefail

: "${1:?Usage: restore-disposable.sh BACKUP_RUN_ROOT TARGET_DATABASE}"
: "${2:?TARGET_DATABASE is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
run_root="$1"
target_database="$2"
if [[ ! "${target_database}" =~ ^weddingos_restore_[a-zA-Z0-9_]+$ ]]; then
  echo "Target must be an explicit weddingos_restore_* database name" >&2
  exit 2
fi
ops/backup/verify-local-backup.sh "${run_root}"
work_root="$(mktemp -d)"
trap 'find "${work_root}" -type f -exec shred -u {} + 2>/dev/null || true; rmdir "${work_root}" 2>/dev/null || true' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 -in "${run_root}/database.dump.enc" -out "${work_root}/database.dump" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
if command -v pg_restore >/dev/null 2>&1; then
  : "${POSTGRES_ADMIN_URL:?POSTGRES_ADMIN_URL is required when local PostgreSQL tools are used}"
  if psql "${POSTGRES_ADMIN_URL}" -Atc "SELECT 1 FROM pg_database WHERE datname='${target_database}'" | grep -qx 1; then
    existing_purpose="$(psql "${POSTGRES_ADMIN_URL%/*}/${target_database}" -Atc "SELECT database_purpose FROM database_identities WHERE id='singleton'" 2>/dev/null || true)"
    test "${existing_purpose}" = "restore-target" || { echo "Refusing to replace a database that is not identified as restore-target" >&2; exit 3; }
  fi
  dropdb --if-exists --force --maintenance-db="${POSTGRES_ADMIN_URL}" "${target_database}"
  createdb --maintenance-db="${POSTGRES_ADMIN_URL}" "${target_database}"
  target_url="${POSTGRES_ADMIN_URL%/*}/${target_database}"
  pg_restore --dbname="${target_url}" --no-owner --no-privileges "${work_root}/database.dump"
  psql_command=(psql "${target_url}" -v ON_ERROR_STOP=1 -At)
else
  postgres_container="${POSTGRES_CONTAINER:-weddingos-postgres-1}"
  postgres_user="${POSTGRES_USER:-weddingos}"
  postgres_password="${POSTGRES_PASSWORD:-weddingos}"
  if docker exec -e PGPASSWORD="${postgres_password}" "${postgres_container}" psql -U "${postgres_user}" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='${target_database}'" | grep -qx 1; then
    existing_purpose="$(docker exec -e PGPASSWORD="${postgres_password}" "${postgres_container}" psql -U "${postgres_user}" -d "${target_database}" -Atc "SELECT database_purpose FROM database_identities WHERE id='singleton'" 2>/dev/null || true)"
    test "${existing_purpose}" = "restore-target" || { echo "Refusing to replace a database that is not identified as restore-target" >&2; exit 3; }
  fi
  docker exec -e PGPASSWORD="${postgres_password}" "${postgres_container}" dropdb -U "${postgres_user}" --if-exists --force "${target_database}"
  docker exec -e PGPASSWORD="${postgres_password}" "${postgres_container}" createdb -U "${postgres_user}" "${target_database}"
  docker exec -i -e PGPASSWORD="${postgres_password}" "${postgres_container}" pg_restore -U "${postgres_user}" -d "${target_database}" --no-owner --no-privileges < "${work_root}/database.dump"
  psql_command=(docker exec -e PGPASSWORD="${postgres_password}" "${postgres_container}" psql -U "${postgres_user}" -d "${target_database}" -v ON_ERROR_STOP=1 -At)
fi
"${psql_command[@]}" -c "UPDATE database_identities SET environment='test', database_purpose='restore-target', database_instance_id=gen_random_uuid(), updated_at=now() WHERE id='singleton';"
test "$("${psql_command[@]}" -c "SELECT database_purpose FROM database_identities WHERE id='singleton';")" = "restore-target"
"${psql_command[@]}" -c "SELECT count(*) > 0 FROM _prisma_migrations WHERE finished_at IS NOT NULL;"
"${psql_command[@]}" -c "SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE relname IN ('workspaces','planning_tasks','guest_profiles','vendor_organizations','platform_admin_actions');"
"${psql_command[@]}" -c "SELECT count(*) FROM users; SELECT count(*) FROM workspaces; SELECT count(*) FROM outbox_messages;"
if [[ -f "${run_root}/objects.tar.enc" ]]; then
  : "${RESTORE_OBJECT_DIRECTORY:?RESTORE_OBJECT_DIRECTORY is required when backup contains objects}"
  test -d "${RESTORE_OBJECT_DIRECTORY}"
  test -z "$(find "${RESTORE_OBJECT_DIRECTORY}" -mindepth 1 -print -quit)"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 -in "${run_root}/objects.tar.enc" -out "${work_root}/objects.tar" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
  tar -C "${RESTORE_OBJECT_DIRECTORY}" -xf "${work_root}/objects.tar"
fi
printf 'restored and validated %s without touching the source database\n' "${target_database}"
