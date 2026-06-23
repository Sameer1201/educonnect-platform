#!/usr/bin/env bash
set -euo pipefail

PNPM_VERSION="${PNPM_VERSION:-10.33.0}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}/EdTech-Portal"

need_install_or_build="false"

if [[ ! -f artifacts/api-server/dist/index.mjs ]]; then
  need_install_or_build="true"
fi

if [[ ! -f artifacts/edtech/dist/public/index.html ]]; then
  need_install_or_build="true"
fi

if [[ "${need_install_or_build}" == "true" ]]; then
  npx --yes "pnpm@${PNPM_VERSION}" install --frozen-lockfile --prod=false

  npx --yes "pnpm@${PNPM_VERSION}" --filter @workspace/edtech run build
  npx --yes "pnpm@${PNPM_VERSION}" --filter @workspace/api-server run build
fi

export NODE_ENV=production
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
