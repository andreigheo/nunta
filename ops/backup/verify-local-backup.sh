#!/usr/bin/env bash
set -euo pipefail

: "${1:?Usage: verify-local-backup.sh BACKUP_RUN_ROOT}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
run_root="$1"
work_root="$(mktemp -d)"
trap 'find "${work_root}" -type f -exec shred -u {} + 2>/dev/null || true; rmdir "${work_root}" 2>/dev/null || true' EXIT
test -f "${run_root}/manifest.json"
test -f "${run_root}/manifest.sha256"
test -f "${run_root}/database.dump.enc"
sha256sum --check "${run_root}/manifest.sha256"
expected="$(sed -n '/"database"/,/"schema"/s/.*"checksumSha256": "\([a-f0-9]*\)".*/\1/p' "${run_root}/manifest.json")"
actual="$(sha256sum "${run_root}/database.dump.enc" | cut -d' ' -f1)"
test "${expected}" = "${actual}"
if grep -q '"status": "INCLUDED"' "${run_root}/manifest.json"; then
  test -f "${run_root}/objects.tar.enc"
  expected_objects="$(sed -n '/"objectStorage"/,/},/s/.*"checksumSha256": "\([a-f0-9]*\)".*/\1/p' "${run_root}/manifest.json")"
  actual_objects="$(sha256sum "${run_root}/objects.tar.enc" | cut -d' ' -f1)"
  test "${expected_objects}" = "${actual_objects}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 -in "${run_root}/objects.tar.enc" -out "${work_root}/objects.tar" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
  tar -tf "${work_root}/objects.tar" >/dev/null
fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 -in "${run_root}/database.dump.enc" -out "${work_root}/database.dump" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "${work_root}/database.dump" >/dev/null
else
  docker exec -i "${POSTGRES_CONTAINER:-weddingos-postgres-1}" pg_restore --list < "${work_root}/database.dump" >/dev/null
fi
touch "${run_root}/.verified"
printf 'verified %s\n' "${run_root}"
