# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage package versions and changelogs.

## Workflow

1. After merging feature work, run `pnpm changeset` and follow the prompts to select the affected packages and describe the change.
2. Commit the generated markdown file under `.changeset/`.
3. When you're ready to publish, run:
   ```bash
   pnpm version:packages
   pnpm run build:packages
   pnpm release
   ```
   The `release` script runs `changeset publish` to push the packages to npm.

See the root README for the tag-driven CI publish flow; Changesets keeps version numbers and changelogs in sync with those tags.
