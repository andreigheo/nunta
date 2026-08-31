#!/usr/bin/env bash
set -euo pipefail

: "${1:?Usage: upload-offhost-rclone.sh BACKUP_RUN_ROOT}"
: "${BACKUP_OFFHOST_REMOTE:?BACKUP_OFFHOST_REMOTE is required (for example remote:bucket/prefix)}"

run_root="$(realpath "$1")"
run_id="$(basename "${run_root}")"
test -f "${run_root}/.verified"
test -f "${run_root}/manifest.json"
command -v rclone >/dev/null 2>&1 || {
  echo "rclone is required for off-host backup upload" >&2
  exit 1
}

remote="${BACKUP_OFFHOST_REMOTE%/}/${run_id}"
marker="${run_root}/.offhost-verified"
umask 077
printf '{"runId":"%s","remote":"%s","uploadedAt":"%s"}\n' \
  "${run_id}" "${remote}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${marker}"

rclone copy "${run_root}" "${remote}" \
  --checksum --immutable --transfers 2 --checkers 4
rclone check "${run_root}" "${remote}" --checksum --one-way
printf 'offhost_backup=%s\n' "${remote}"
