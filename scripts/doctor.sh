#!/usr/bin/env bash
# Verify that git hooks are installed correctly
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_HOOKS_PATH=".githooks"

CURRENT_HOOKS_PATH=$(git -C "$REPO_ROOT" config core.hooksPath || echo "")

if [[ "$CURRENT_HOOKS_PATH" == "$EXPECTED_HOOKS_PATH" ]]; then
  echo "✅ [vizij-web doctor] Git hooks are installed correctly (core.hooksPath=$CURRENT_HOOKS_PATH)."
  exit 0
else
  echo "❌ [vizij-web doctor] Git hooks are NOT installed."
  echo "   Expected core.hooksPath to be '$EXPECTED_HOOKS_PATH', but got '$CURRENT_HOOKS_PATH'."
  echo "   Run './scripts/install-git-hooks.sh' to fix this."
  exit 1
fi
