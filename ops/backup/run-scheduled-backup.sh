#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_DESTINATION_DIRECTORY:?BACKUP_DESTINATION_DIRECTORY is required and must be separate}"
: "${BACKUP_SCHEDULE_KEY:?BACKUP_SCHEDULE_KEY is required}"
backup_root="${BACKUP_ROOT:-/home/andrei/weddingos-backups}"
destination="$(realpath -m "${BACKUP_DESTINATION_DIRECTORY}")"
source_root="$(realpath -m "${backup_root}")"
test "${destination}" != "${source_root}" || { echo "Backup destination must be separate" >&2; exit 2; }

state_root="${BACKUP_SCHEDULER_STATE_ROOT:-/home/andrei/.local/state/weddingos-backup}"
mkdir -p "${state_root}" "${destination}"
exec 9>"${state_root}/${BACKUP_SCHEDULE_KEY}.lock"
flock -n 9 || { echo "backup overlap prevented for ${BACKUP_SCHEDULE_KEY}"; exit 0; }

case "${BACKUP_SCHEDULE_KEY}" in
  daily-database|daily-objects) dedupe_period="$(date -u +%Y-%m-%d)" ;;
  weekly-full|weekly-restore-verification) dedupe_period="$(date -u +%G-W%V)" ;;
  *) echo "Unknown backup schedule key" >&2; exit 2 ;;
esac
dedupe_key="${BACKUP_SCHEDULE_KEY}:${dedupe_period}"
last_success_file="${state_root}/${BACKUP_SCHEDULE_KEY}.success"
if [[ -f "${last_success_file}" ]] && grep -qxF "${dedupe_key}" "${last_success_file}"; then
  printf 'already completed %s\n' "${dedupe_key}"
  exit 0
fi

history="${state_root}/run-history.jsonl"
if [[ "${BACKUP_SCHEDULE_KEY}" = "weekly-restore-verification" ]]; then
  : "${RESTORE_TARGET_DATABASE:?RESTORE_TARGET_DATABASE is required for restore verification}"
  latest_verified="$(find "${destination}" -mindepth 2 -maxdepth 2 -name .verified -printf '%T@ %h\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
  test -n "${latest_verified}" || { echo "No verified backup is available for restore rehearsal" >&2; exit 1; }
  if (( $(date +%s) - $(stat -c %Y "${latest_verified}/.verified") > ${RESTORE_SOURCE_MAX_AGE_HOURS:-168} * 3600 )); then
    echo '{"event":"restore.source.stale","severity":"high"}' >&2
    exit 1
  fi
  started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  /bin/bash ops/backup/restore-disposable.sh "${latest_verified}" "${RESTORE_TARGET_DATABASE}"
  printf '%s\n' "${dedupe_key}" > "${last_success_file}"
  RUN_STATUS=VERIFIED RUN_ID="$(basename "${latest_verified}")" STARTED_AT="${started_at}" DEDUPE_KEY="${dedupe_key}" \
    node -e 'const e={schedule:process.env.BACKUP_SCHEDULE_KEY,dedupeKey:process.env.DEDUPE_KEY,runId:process.env.RUN_ID,status:process.env.RUN_STATUS,attempt:1,startedAt:process.env.STARTED_AT,completedAt:new Date().toISOString(),targetDatabase:process.env.RESTORE_TARGET_DATABASE}; process.stdout.write(JSON.stringify(e)+"\n")' >> "${history}"
  exit 0
fi

attempt=0
while (( attempt < 3 )); do
  attempt=$((attempt + 1))
  started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if run_root="$(BACKUP_ROOT="${backup_root}" ops/backup/run-local-backup.sh)" &&
     ops/backup/verify-local-backup.sh "${run_root}"; then
    destination_run="${destination}/$(basename "${run_root}")"
    test -f "${destination_run}/manifest.json"
    test -f "${destination_run}/.verified" || cp "${run_root}/.verified" "${destination_run}/.verified"
    printf '%s\n' "${dedupe_key}" > "${last_success_file}"
    RUN_STATUS=VERIFIED RUN_ID="$(basename "${run_root}")" STARTED_AT="${started_at}" ATTEMPT="${attempt}" DEDUPE_KEY="${dedupe_key}" \
      node -e 'const e={schedule:process.env.BACKUP_SCHEDULE_KEY,dedupeKey:process.env.DEDUPE_KEY,runId:process.env.RUN_ID,status:process.env.RUN_STATUS,attempt:Number(process.env.ATTEMPT),startedAt:process.env.STARTED_AT,completedAt:new Date().toISOString(),destination:"SEPARATE_LOCAL_DESTINATION"}; process.stdout.write(JSON.stringify(e)+"\n")' >> "${history}"
    break
  fi
  sleep $((attempt * 5))
done
if (( attempt == 3 )) && [[ ! -f "${last_success_file}" || "$(cat "${last_success_file}")" != "${dedupe_key}" ]]; then
  RUN_STATUS=FAILED STARTED_AT="${started_at}" ATTEMPT="${attempt}" DEDUPE_KEY="${dedupe_key}" \
    node -e 'const e={schedule:process.env.BACKUP_SCHEDULE_KEY,dedupeKey:process.env.DEDUPE_KEY,status:process.env.RUN_STATUS,attempt:Number(process.env.ATTEMPT),startedAt:process.env.STARTED_AT,completedAt:new Date().toISOString()}; process.stdout.write(JSON.stringify(e)+"\n")' >> "${history}"
  exit 1
fi

minimum_retained="${BACKUP_MINIMUM_VERIFIED_COPIES:-2}"
retention_days="${BACKUP_RETENTION_DAYS:-35}"
mapfile -t verified < <(find "${destination}" -mindepth 2 -maxdepth 2 -name .verified -printf '%h\n' | sort)
if (( ${#verified[@]} > minimum_retained )); then
  removable_count=$((${#verified[@]} - minimum_retained))
  removed=0
  for candidate in "${verified[@]}"; do
    (( removed >= removable_count )) && break
    [[ -f "${candidate}/.legal-hold" ]] && continue
    if find "${candidate}" -maxdepth 0 -mtime "+${retention_days}" -print -quit | grep -q .; then
      rm -rf -- "${candidate}"
      test ! -e "${candidate}"
      removed=$((removed + 1))
    fi
  done
fi

last_success_epoch="$(stat -c %Y "${last_success_file}")"
maximum_age_seconds=$((${BACKUP_STALE_AFTER_HOURS:-30} * 3600))
if (( $(date +%s) - last_success_epoch > maximum_age_seconds )); then
  echo '{"event":"backup.stale","severity":"high"}' >&2
  exit 1
fi
