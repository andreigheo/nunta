#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "cutover-vps.sh must run as root" >&2
  exit 1
fi

release_id="${1:?release id is required}"
release_root="/opt/sarbato/releases/${release_id}"
active_config="/etc/nginx/sites-enabled/sarbato.space.conf"
backup_config="/etc/nginx/sarbato.space.conf.pre-app-${release_id}"

cp "${active_config}" "${backup_config}"
install -o root -g root -m 0644 \
  "${release_root}/ops/production/sarbato.space.nginx.conf" \
  "${active_config}"

if ! nginx -t; then
  cp "${backup_config}" "${active_config}"
  nginx -t
  exit 1
fi
systemctl reload nginx

rollback() {
  cp "${backup_config}" "${active_config}"
  nginx -t
  systemctl reload nginx
}
trap rollback ERR

wait_for_status() {
  local url="$1"
  local output="$2"
  local expected="$3"
  local code=""
  for _attempt in {1..15}; do
    code="$(
      curl --resolve sarbato.space:443:127.0.0.1 -sS \
        -o "${output}" -w "%{http_code}" "${url}" || true
    )"
    [[ "${code}" = "${expected}" ]] && return 0
    sleep 1
  done
  echo "Expected ${expected} from ${url}, got ${code}" >&2
  return 1
}

wait_for_status \
  https://sarbato.space/ /tmp/sarbato-public-root.html 200
grep -q "Sarbato" /tmp/sarbato-public-root.html

wait_for_status \
  https://sarbato.space/api/v1/status \
  /tmp/sarbato-public-status.json 200
grep -q "OPERATIONAL" /tmp/sarbato-public-status.json

wait_for_status https://sarbato.space/beta /dev/null 404

wait_for_status \
  https://sarbato.space/health /tmp/sarbato-relay-health.json 200

ln -sfn "${release_root}" /opt/sarbato/current
install -o root -g root -m 0644 \
  /opt/sarbato/current/ops/production/sarbato-backup.service \
  /etc/systemd/system/sarbato-backup.service
install -o root -g root -m 0644 \
  /opt/sarbato/current/ops/production/sarbato-backup.timer \
  /etc/systemd/system/sarbato-backup.timer
systemctl daemon-reload
systemctl enable --now sarbato-backup.timer

trap - ERR
printf 'cutover=ok\n'
cat /tmp/sarbato-public-status.json
printf '\n'
systemctl list-timers sarbato-backup.timer --no-pager
