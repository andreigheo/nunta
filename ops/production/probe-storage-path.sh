#!/usr/bin/env bash
set -euo pipefail

config="${1:?nginx probe config is required}"
helper="${2:?signed-url helper is required}"
api_container="${SARBATO_API_CONTAINER:-sarbato-production-api-1}"
key="operations/probes/signed-path-$(date -u +%Y%m%dT%H%M%SZ).txt"
probe_endpoint="http://sarbato.space:43225"

nginx -c "${config}"
trap 'nginx -s stop -c "${config}" >/dev/null 2>&1 || true' EXIT

docker cp "${helper}" "${api_container}:/app/apps/api/storage-signed-url-probe.cjs"

put_url="$(
  docker exec "${api_container}" node /app/apps/api/storage-signed-url-probe.cjs \
    put "${probe_endpoint}" "${key}"
)"
curl --resolve sarbato.space:43225:127.0.0.1 -fsS \
  -X PUT -H "Content-Type: text/plain" \
  --data-binary "sarbato-storage-probe" "${put_url}"

get_url="$(
  docker exec "${api_container}" node /app/apps/api/storage-signed-url-probe.cjs \
    get "${probe_endpoint}" "${key}"
)"
test "$(
  curl --resolve sarbato.space:43225:127.0.0.1 -fsS "${get_url}"
)" = "sarbato-storage-probe"

docker exec "${api_container}" node /app/apps/api/storage-signed-url-probe.cjs \
  delete http://storage:9000 "${key}" >/dev/null

printf 'signed storage path verified through the private bucket route\n'
