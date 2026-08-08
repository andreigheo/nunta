#!/usr/bin/env bash
set -euo pipefail

: "${CREDENTIALS_DIRECTORY:?systemd credentials directory is required}"

exec /home/andrei/.nvm/versions/node/v22.22.3/bin/node apps/api/dist/main.js
