#!/usr/bin/env bash
set -euo pipefail

evidence_root="ops/release-evidence/current"
current_manifest="${evidence_root}/staging-like-deployment.json"
previous_manifest="${evidence_root}/staging-like-previous-deployment.json"
test -f "${current_manifest}"
test -f "${previous_manifest}"
current_release="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).releaseId)' "${current_manifest}")"
previous_release="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).releaseId)' "${previous_manifest}")"

for image in api worker web; do
  docker image inspect "weddingos-${image}:${previous_release}" >/dev/null
done

export WEDDINGOS_RELEASE_ID="${previous_release}"
compose=(docker compose -f docker-compose.staging-like.yml)
"${compose[@]}" up -d --no-build api worker web proxy
certificate="$(mktemp)"
trap 'rm -f "${certificate}"' EXIT
"${compose[@]}" cp proxy:/data/caddy/pki/authorities/local/root.crt "${certificate}" >/dev/null
for _attempt in $(seq 1 90); do
  if curl --connect-timeout 2 --max-time 5 --silent --show-error --fail --cacert "${certificate}" https://weddingos.localhost:58443/ready >/dev/null; then
    break
  fi
  sleep 2
done
curl --connect-timeout 2 --max-time 5 --silent --show-error --fail --cacert "${certificate}" https://weddingos.localhost:58443/ready >/dev/null
node scripts/write-staging-evidence.mjs rollback "${current_release}"
printf 'staging-like rollback healthy: %s -> %s\n' "${current_release}" "${previous_release}"
