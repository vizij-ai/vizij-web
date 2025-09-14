#!/usr/bin/env bash
# Install repository-local Git hooks for vizij-web and make them executable
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[vizij-web install-git-hooks] Setting git core.hooksPath to .githooks"
git -C "$REPO_ROOT" config core.hooksPath .githooks

echo "[vizij-web install-git-hooks] Making hooks executable"
chmod +x "$REPO_ROOT/.githooks/pre-commit" "$REPO_ROOT/.githooks/pre-push" || true

echo "[vizij-web install-git-hooks] Done. Hooks will now run on commit/push."
