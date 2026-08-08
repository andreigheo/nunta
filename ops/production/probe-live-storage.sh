#!/usr/bin/env bash
set -euo pipefail

helper="${1:?signed-url helper is required}"
api_container="${SARBATO_API_CONTAINER:-sarbato-production-api-1}"
key="operations/probes/live-signed-path-$(date -u +%Y%m%dT%H%M%SZ).txt"
endpoint="https://sarbato.space"

docker cp "${helper}" "${api_container}:/app/apps/api/storage-signed-url-probe.cjs"

cleanup() {
  docker exec "${api_container}" node \
    /app/apps/api/storage-signed-url-probe.cjs \
    delete http://storage:9000 "${key}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

put_url="$(
  docker exec "${api_container}" node \
    /app/apps/api/storage-signed-url-probe.cjs put "${endpoint}" "${key}"
)"
curl --resolve sarbato.space:443:127.0.0.1 -fsS \
  -X PUT -H "Content-Type: text/plain" \
  --data-binary "sarbato-live-storage-probe" "${put_url}"

get_url="$(
  docker exec "${api_container}" node \
    /app/apps/api/storage-signed-url-probe.cjs get "${endpoint}" "${key}"
)"
test "$(
  curl --resolve sarbato.space:443:127.0.0.1 -fsS "${get_url}"
)" = "sarbato-live-storage-probe"

cleanup
trap - EXIT
printf 'live signed storage PUT/GET/DELETE verified\n'
