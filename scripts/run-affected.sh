#!/usr/bin/env bash
# Run a pnpm script against workspaces affected since a given base ref.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "[vizij-web run-affected] Usage: $0 <script>" >&2
  exit 1
fi

SCRIPT_NAME="$1"
shift || true

# Allow callers to override comparison base; default to the branch upstream.
DEFAULT_BASE="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [[ -z "${DEFAULT_BASE}" ]]; then
  DEFAULT_BASE="origin/main"
fi
BASE_REF="${PNPM_BASE_REF:-$DEFAULT_BASE}"

# Fallback logic if the chosen base ref is not available locally.
if ! git rev-parse --verify --quiet "$BASE_REF" > /dev/null; then
  if git rev-parse --verify --quiet "$DEFAULT_BASE" > /dev/null; then
    BASE_REF="$DEFAULT_BASE"
  elif git rev-parse --verify --quiet "main" > /dev/null; then
    BASE_REF="main"
  else
    BASE_REF="$(git merge-base HEAD HEAD)"
  fi
fi

FILTER="...[$BASE_REF]..."

echo "[vizij-web run-affected] pnpm --filter \"$FILTER\" run --if-present \"$SCRIPT_NAME\""
pnpm --filter "$FILTER" run --if-present "$SCRIPT_NAME"
