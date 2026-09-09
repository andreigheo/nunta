#!/usr/bin/env bash
set -euo pipefail

helper="${1:?signed-url helper is required}"
api_container="${SARBATO_API_CONTAINER:-sarbato-production-api-1}"
container_helper=/tmp/storage-signed-url-probe.cjs
container_node_path=/app/apps/api/node_modules:/app/node_modules
key="operations/probes/live-signed-path-$(date -u +%Y%m%dT%H%M%SZ).txt"
endpoint="https://sarbato.space"

docker exec -i "${api_container}" sh -c \
  'tee /tmp/storage-signed-url-probe.cjs >/dev/null' < "${helper}"

cleanup() {
  docker exec -e NODE_PATH="${container_node_path}" "${api_container}" node \
    "${container_helper}" \
    delete http://storage:9000 "${key}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

put_url="$(
  docker exec -e NODE_PATH="${container_node_path}" "${api_container}" node \
    "${container_helper}" put "${endpoint}" "${key}"
)"
curl --resolve sarbato.space:443:127.0.0.1 -fsS \
  -X PUT -H "Content-Type: text/plain" \
  --data-binary "sarbato-live-storage-probe" "${put_url}"

get_url="$(
  docker exec -e NODE_PATH="${container_node_path}" "${api_container}" node \
    "${container_helper}" get "${endpoint}" "${key}"
)"
test "$(
  curl --resolve sarbato.space:443:127.0.0.1 -fsS "${get_url}"
)" = "sarbato-live-storage-probe"

cleanup
trap - EXIT
printf 'live signed storage PUT/GET/DELETE verified\n'
