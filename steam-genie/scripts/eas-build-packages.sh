#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pnpm --filter @steam-genie/shared-constants build
pnpm --filter @steam-genie/shared-types build
pnpm --filter @steam-genie/shared-validators build

echo "Shared packages built for EAS."
