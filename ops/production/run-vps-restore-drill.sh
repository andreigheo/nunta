#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run-vps-restore-drill.sh must run as root" >&2
  exit 1
fi

release_root="${SARBATO_RELEASE_ROOT:-/opt/sarbato/current}"
production_env="${SARBATO_PRODUCTION_ENV:-/etc/sarbato-production.env}"
backup_env="${SARBATO_BACKUP_ENV:-/etc/sarbato-backup.env}"
verified_root="${SARBATO_BACKUP_VERIFIED_ROOT:-/var/backups/sarbato/verified}"
evidence_root="${SARBATO_RESTORE_EVIDENCE_ROOT:-/var/backups/sarbato/restore-evidence}"
target_database="${SARBATO_RESTORE_TARGET_DATABASE:-weddingos_restore_production_drill}"
object_restore="$(mktemp -d /var/backups/sarbato/restore-objects.XXXXXX)"

cleanup() {
  find "${object_restore}" -mindepth 1 -delete 2>/dev/null || true
  rmdir "${object_restore}" 2>/dev/null || true
}
trap cleanup EXIT

set -a
# shellcheck disable=SC1090
source "${production_env}"
# shellcheck disable=SC1090
source "${backup_env}"
set +a

latest_verified="$(find "${verified_root}" -mindepth 2 -maxdepth 2 -name .verified -printf '%T@ %h\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
test -n "${latest_verified}" || {
  echo "No verified production backup is available" >&2
  exit 1
}
maximum_age_seconds=$((${RESTORE_SOURCE_MAX_AGE_HOURS:-30} * 3600))
if (( $(date +%s) - $(stat -c %Y "${latest_verified}/.verified") > maximum_age_seconds )); then
  echo "Latest verified backup is stale" >&2
  exit 1
fi

cd "${release_root}"
export POSTGRES_CONTAINER="sarbato-production-postgres-1"
export POSTGRES_USER="sarbato_admin"
export POSTGRES_PASSWORD="${POSTGRES_ADMIN_PASSWORD}"
export RESTORE_OBJECT_DIRECTORY="${object_restore}"
ops/backup/restore-disposable.sh "${latest_verified}" "${target_database}"

mkdir -p "${evidence_root}"
evidence="${evidence_root}/$(date -u +%Y%m%dT%H%M%SZ).json"
umask 077
printf '{"status":"VERIFIED","verifiedAt":"%s","sourceRun":"%s","targetDatabase":"%s","sourceDatabaseUntouched":true,"objectsVerified":true}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$(basename "${latest_verified}")" \
  "${target_database}" > "${evidence}"
printf 'restore_evidence=%s\n' "${evidence}"
