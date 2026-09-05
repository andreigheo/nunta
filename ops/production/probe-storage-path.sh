#!/usr/bin/env bash
set -euo pipefail

config="${1:?nginx probe config is required}"
helper="${2:?signed-url helper is required}"
api_container="${SARBATO_API_CONTAINER:-sarbato-production-api-1}"
container_helper=/tmp/storage-signed-url-probe.cjs
container_node_path=/app/apps/api/node_modules:/app/node_modules
key="operations/probes/signed-path-$(date -u +%Y%m%dT%H%M%SZ).txt"
probe_endpoint="http://sarbato.space:43225"

nginx -c "${config}"
trap 'nginx -s stop -c "${config}" >/dev/null 2>&1 || true' EXIT

docker exec -i "${api_container}" sh -c \
  'tee /tmp/storage-signed-url-probe.cjs >/dev/null' < "${helper}"

put_url="$(
  docker exec -e NODE_PATH="${container_node_path}" "${api_container}" node \
    "${container_helper}" \
    put "${probe_endpoint}" "${key}"
)"
curl --resolve sarbato.space:43225:127.0.0.1 -fsS \
  -X PUT -H "Content-Type: text/plain" \
  --data-binary "sarbato-storage-probe" "${put_url}"

get_url="$(
  docker exec -e NODE_PATH="${container_node_path}" "${api_container}" node \
    "${container_helper}" \
    get "${probe_endpoint}" "${key}"
)"
test "$(
  curl --resolve sarbato.space:43225:127.0.0.1 -fsS "${get_url}"
)" = "sarbato-storage-probe"

docker exec -e NODE_PATH="${container_node_path}" "${api_container}" node \
  "${container_helper}" \
  delete http://storage:9000 "${key}" >/dev/null

printf 'signed storage path verified through the private bucket route\n'
