#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run-vps-monitor.sh must run as root" >&2
  exit 1
fi

production_env="${SARBATO_PRODUCTION_ENV:-/etc/sarbato-production.env}"
verified_root="${SARBATO_BACKUP_VERIFIED_ROOT:-/var/backups/sarbato/verified}"
failures=()

set -a
# shellcheck disable=SC1090
source "${production_env}"
set +a

ready="$(curl --connect-timeout 2 --max-time 5 -fsS http://127.0.0.1:43222/ready 2>/dev/null || true)"
printf '%s' "${ready}" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ready"' || failures+=("internal API readiness is not ready")

status="$(curl --connect-timeout 3 --max-time 8 -fsS https://sarbato.space/api/v1/status 2>/dev/null || true)"
printf '%s' "${status}" | grep -q '"status":"OPERATIONAL"' || failures+=("public status is not OPERATIONAL")

disk_used="$(df --output=pcent / | tail -n 1 | tr -cd '0-9')"
if [[ -z "${disk_used}" ]] || (( disk_used >= ${SARBATO_DISK_ALERT_PERCENT:-90} )); then
  failures+=("root disk usage is ${disk_used:-unknown}%")
fi

latest_verified="$(find "${verified_root}" -mindepth 2 -maxdepth 2 -name .verified -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2-)"
if [[ -z "${latest_verified}" ]]; then
  failures+=("no verified backup exists")
elif (( $(date +%s) - $(stat -c %Y "${latest_verified}") > ${BACKUP_STALE_AFTER_HOURS:-30} * 3600 )); then
  failures+=("latest verified backup is stale")
fi

for service in api worker web postgres redis storage; do
  state="$(docker inspect -f '{{.State.Status}}' "sarbato-production-${service}-1" 2>/dev/null || true)"
  [[ "${state}" = "running" ]] || failures+=("container ${service} is ${state:-missing}")
done

if [[ "${BACKUP_REQUIRE_OFFHOST:-false}" = "true" ]] &&
   [[ -n "${latest_verified}" ]] &&
   [[ ! -f "$(dirname "${latest_verified}")/.offhost-verified" ]]; then
  failures+=("latest verified backup has no off-host proof")
fi

if [[ "${SARBATO_MONITOR_FORCE_FAILURE:-false}" = "true" ]]; then
  failures+=("forced monitor delivery test")
fi

if (( ${#failures[@]} == 0 )); then
  printf 'monitor=ok disk_used=%s latest_backup=%s\n' \
    "${disk_used}" "$(basename "$(dirname "${latest_verified}")")"
  exit 0
fi

message="$(mktemp)"
trap 'shred -u "${message}" 2>/dev/null || rm -f "${message}"' EXIT
{
  printf 'From: Sarbato Monitor <no-reply@sarbato.space>\r\n'
  printf 'To: %s\r\n' "${FORWARD_TO_EMAIL}"
  printf 'Subject: [Sarbato] Production monitor alert\r\n'
  printf 'Date: %s\r\n' "$(date -R)"
  printf '\r\nSarbato production monitor detected:\r\n'
  for failure in "${failures[@]}"; do printf -- '- %s\r\n' "${failure}"; done
} > "${message}"

curl --silent --show-error --fail \
  --url "smtp://${SMTP_HOST:-smtp.resend.com}:${SMTP_PORT:-587}" \
  --ssl-reqd \
  --user "${SMTP_USER:-resend}:${RESEND_SMTP_PASSWORD}" \
  --mail-from "no-reply@sarbato.space" \
  --mail-rcpt "${FORWARD_TO_EMAIL}" \
  --upload-file "${message}"
printf 'monitor=alert_sent failures=%s\n' "${#failures[@]}"
exit 1
