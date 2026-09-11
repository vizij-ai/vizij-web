# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage package versions and changelogs.

## Workflow

1. In the PR that makes the change, run `pnpm changeset` and follow the prompts to select the affected packages and describe the change.
2. Commit the generated markdown file under `.changeset/`. That is the whole author-side job — do not run `changeset version` yourself.
3. Once it merges to `main`, [`.github/workflows/release.yml`](../.github/workflows/release.yml) opens or updates a **Version Packages** PR applying every pending changeset. Merging that PR bumps the versions and writes the changelogs, and `publish-npm.yml` publishes the packages whose new versions aren't on npm.

A changeset may name a private app (`vizij-authoring`, `vizij-standalone`) alongside published packages — those get versions and changelogs but are never published. An app with no `version` field in its `package.json` cannot appear in a changeset at all; changesets treats it as ignored and refuses the entire run.

See [Publishing & Versioning](../README.md#publishing--versioning) in the root README for the publish half.
