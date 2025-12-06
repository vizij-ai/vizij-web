#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

shopt -s nullglob
changesets=(.changeset/*.md)
shopt -u nullglob

changeset_count=0
for file in "${changesets[@]}"; do
  [[ "$(basename "$file")" != "README.md" ]] && ((++changeset_count))
done

if [[ "$changeset_count" -eq 0 ]]; then
  echo "❌ No pending changesets. Run 'pnpm changeset' before releasing." >&2
  exit 1
fi

echo "📦 Applying version bumps..."
pnpm install --frozen-lockfile
pnpm run version:packages
pnpm install --frozen-lockfile

git add -A .changeset
git add pnpm-lock.yaml || true
git add packages

if git diff --cached --quiet; then
  echo "ℹ️ Nothing to commit after versioning. Aborting."
  exit 0
fi

git commit -m "chore: release"

TAG="release-$(date -u '+%Y%m%d-%H%M%S')"
git push origin HEAD
git tag -a "$TAG" -m "Trigger package publish ($TAG)"
git push origin "$TAG"

echo "✅ Release tag pushed: $TAG. CI will publish the bumped packages."
