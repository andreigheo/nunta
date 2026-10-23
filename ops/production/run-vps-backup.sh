#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run-vps-backup.sh must run as root" >&2
  exit 1
fi

release_root="${SARBATO_RELEASE_ROOT:-/opt/sarbato/current}"
production_env="${SARBATO_PRODUCTION_ENV:-/etc/sarbato-production.env}"
backup_env="${SARBATO_BACKUP_ENV:-/etc/sarbato-backup.env}"
backup_root="${SARBATO_BACKUP_ROOT:-/var/backups/sarbato/source}"
verified_root="${SARBATO_BACKUP_VERIFIED_ROOT:-/var/backups/sarbato/verified}"

if [[ ! -f "${backup_env}" ]]; then
  umask 077
  printf 'BACKUP_ENCRYPTION_PASSPHRASE=%s\nBACKUP_ENCRYPTION_KEY_ID=production-local-v1\n' \
    "$(openssl rand -hex 48)" > "${backup_env}"
fi
chmod 600 "${backup_env}"

set -a
# shellcheck disable=SC1090
source "${production_env}"
# shellcheck disable=SC1090
source "${backup_env}"
set +a

# Resolve the active storage mount; never back up the retired rollback volume.
storage_container="$(docker ps --filter label=com.docker.compose.project=sarbato-production --filter label=com.docker.compose.service=storage --format '{{.ID}}')"
if [[ -z "${storage_container}" || "${storage_container}" = *$'\n'* ]]; then
  echo "Expected exactly one running production storage container" >&2
  exit 1
fi
object_root="${SARBATO_OBJECT_ROOT:-$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "${storage_container}")}"
if [[ -z "${object_root}" || ! -d "${object_root}" ]]; then
  echo "Active production storage mount is missing" >&2
  exit 1
fi

cd "${release_root}"
mkdir -p "${backup_root}" "${verified_root}"

export DATABASE_OWNER_URL="docker://sarbato-production_postgres_1/weddingos"
export POSTGRES_CONTAINER="sarbato-production_postgres_1"
export POSTGRES_USER="sarbato_admin"
export POSTGRES_PASSWORD="${POSTGRES_ADMIN_PASSWORD}"
export POSTGRES_DATABASE="weddingos"
export BACKUP_ROOT="${backup_root}"
export BACKUP_DESTINATION_DIRECTORY="${verified_root}"
export OBJECT_SOURCE_DIRECTORY="${object_root}"

run_root="$(ops/backup/run-local-backup.sh)"
ops/backup/verify-local-backup.sh "${run_root}"

destination_run="${verified_root}/$(basename "${run_root}")"
cp "${run_root}/.verified" "${destination_run}/.verified"

if [[ -n "${BACKUP_OFFHOST_REMOTE:-}" ]]; then
  ops/backup/upload-offhost-rclone.sh "${destination_run}"
elif [[ "${BACKUP_REQUIRE_OFFHOST:-false}" = "true" ]]; then
  echo "BACKUP_REQUIRE_OFFHOST=true but BACKUP_OFFHOST_REMOTE is not configured" >&2
  exit 1
fi

printf 'backup_run=%s\n' "$(basename "${run_root}")"
du -sh "${run_root}" "${destination_run}"
grep -E '"(status|provider|offHost)"' "${run_root}/manifest.json"
