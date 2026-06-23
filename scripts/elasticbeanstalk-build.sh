#!/usr/bin/env bash
set -euo pipefail

PNPM_VERSION="${PNPM_VERSION:-10.33.0}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}/EdTech-Portal"

npx --yes "pnpm@${PNPM_VERSION}" install --frozen-lockfile --prod=false

if [[ "${RUN_DB_PUSH:-false}" == "true" ]]; then
  npx --yes "pnpm@${PNPM_VERSION}" --filter @workspace/db run push-force
fi

npx --yes "pnpm@${PNPM_VERSION}" --filter @workspace/edtech run build
npx --yes "pnpm@${PNPM_VERSION}" --filter @workspace/api-server run build
